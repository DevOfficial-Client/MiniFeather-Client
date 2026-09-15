(() => {
  'use strict';

  const W = globalThis;
  try { W.MF_RealisticShadows?.destroy?.(); } catch (_) {}

  const state = { renderer: null, light: null, snapshot: null };

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

  function snapshot(renderer, light) {
    const s = light.shadow;
    return {
      rendererEnabled: renderer.shadowMap.enabled,
      rendererType: renderer.shadowMap.type,
      rendererAutoUpdate: renderer.shadowMap.autoUpdate,
      castShadow: light.castShadow,
      bias: s.bias,
      normalBias: s.normalBias,
      radius: s.radius,
      intensity: s.intensity,
      mapWidth: s.mapSize?.width,
      mapHeight: s.mapSize?.height
    };
  }

  function disposeShadowMap(shadow) {
    try { shadow.map?.dispose?.(); } catch (_) {}
    shadow.map = null;
    shadow.needsUpdate = true;
  }

  function apply(game, profile) {
    const renderer = rendererOf(game);
    const light = game?.gameScene?.sun?.sunlight;
    if (!renderer?.shadowMap || !light?.shadow || !profile?.shadow) return false;

    if (state.renderer !== renderer || state.light !== light) {
      restore();
      state.renderer = renderer;
      state.light = light;
      state.snapshot = snapshot(renderer, light);
    }

    const cfg = profile.shadow;
    const shadow = light.shadow;

    // MiniBlox installs its own 16-tap Vogel-disk PCF getShadow() and uses type=1.
    // Keep that native filter. PCFSoft (2) would bypass the radius control used by that setup.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = 1; // THREE.PCFShadowMap
    renderer.shadowMap.autoUpdate = true;
    light.castShadow = true;

    shadow.bias = cfg.bias;
    shadow.normalBias = cfg.normalBias;
    shadow.radius = cfg.radius;
    if ('intensity' in shadow) shadow.intensity = cfg.intensity;

    const gpuMax = floorPow2(renderer.capabilities?.maxTextureSize || 4096);
    const wanted = Math.min(cfg.mapSize, gpuMax);
    if (shadow.mapSize && (shadow.mapSize.width !== wanted || shadow.mapSize.height !== wanted)) {
      shadow.mapSize.set(wanted, wanted);
      disposeShadowMap(shadow);
    }

    // Deliberately DO NOT touch shadow.camera left/right/top/bottom/near/far.
    // MiniBlox tracks/snap-stabilizes this camera around the player; changing the frustum here
    // is what made the old Realistic mode fight the native anti-shimmer system.
    return true;
  }

  function restore() {
    const { renderer, light, snapshot: s } = state;
    if (renderer?.shadowMap && s) {
      renderer.shadowMap.enabled = s.rendererEnabled;
      renderer.shadowMap.type = s.rendererType;
      renderer.shadowMap.autoUpdate = s.rendererAutoUpdate;
    }
    if (light?.shadow && s) {
      light.castShadow = s.castShadow;
      light.shadow.bias = s.bias;
      light.shadow.normalBias = s.normalBias;
      light.shadow.radius = s.radius;
      if ('intensity' in light.shadow && s.intensity !== undefined) light.shadow.intensity = s.intensity;
      if (Number.isFinite(s.mapWidth) && Number.isFinite(s.mapHeight) &&
          (light.shadow.mapSize?.width !== s.mapWidth || light.shadow.mapSize?.height !== s.mapHeight)) {
        light.shadow.mapSize?.set?.(s.mapWidth, s.mapHeight);
        disposeShadowMap(light.shadow);
      }
    }
    state.renderer = null;
    state.light = null;
    state.snapshot = null;
  }

  W.MF_RealisticShadows = Object.freeze({ apply, restore, destroy: restore });
})();
