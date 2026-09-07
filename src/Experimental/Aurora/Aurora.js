(() => {
  'use strict';

  const W = globalThis;
  const EVENT_NAME = 'minifeather:aurora-config';
  const MARKER = 'MF_AURORA_BOREALIS_V4_WORLD_ANCHORED';

  try { W.MF_AuroraExperimental?.destroy?.(); } catch (_) {}

  const state = {
    enabled: false,
    game: null,
    material: null,
    originalFragmentShader: '',
    originalCacheKey: undefined,
    patchApplied: false,
    raf: 0,
    scanTimer: 0,
    lastGameScan: 0,
    lastWeatherScan: 0,
    rainFactor: 0,
    level: 'medium',
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
      if (!react) return state.game?.player && state.game?.world ? state.game : null;
      for (const value of Object.values(react)) {
        const game = value?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player && game?.world) {
          W.__MINIBLOX_GAME__ = game;
          state.game = game;
          return game;
        }
      }
    } catch (_) {}

    return state.game?.player && state.game?.world ? state.game : null;
  }

  function resolveAtmosphereMaterial(game) {
    const material =
      game?.gameScene?.sky?.atmosphere?.material ||
      game?.player?.game?.gameScene?.sky?.atmosphere?.material ||
      null;

    if (!material || typeof material.fragmentShader !== 'string' || !material.uniforms) return null;
    return material;
  }

  function injectAurora(fragmentShader) {
    if (!fragmentShader || fragmentShader.includes(MARKER)) return fragmentShader;
    if (!fragmentShader.includes('uniform float dayFactor;')) return null;
    if (!fragmentShader.includes('void main()')) return null;
    if (!fragmentShader.includes('gl_FragColor = vec4(color, 1.0);')) return null;

    let shader = fragmentShader.replace(
      'uniform float dayFactor;',
      `uniform float dayFactor;\n  uniform float uMFAuroraTime;\n  uniform float uMFAuroraStrength;\n  uniform float uMFAuroraQuality; // ${MARKER}`
    );

    const helpers = `
  // MiniFeather Experimental: world-anchored procedural aurora.
  // The auroral oval stays fixed in world space. Time only animates the folds,
  // shimmer and plasma flow inside the curtains, never their global position.
  // uMFAuroraQuality: 0 = Low, 1 = Medium, 2 = High.
  float mfAuroraHash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float mfAuroraNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = mfAuroraHash21(i);
    float b = mfAuroraHash21(i + vec2(1.0, 0.0));
    float c = mfAuroraHash21(i + vec2(0.0, 1.0));
    float d = mfAuroraHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float mfAuroraFbm(vec2 p, float quality) {
    float value = 0.52 * mfAuroraNoise(p);
    value += 0.27 * mfAuroraNoise(p * 2.03 + 11.7);
    if (quality > 0.5) value += 0.14 * mfAuroraNoise(p * 4.07 + 31.3);
    if (quality > 1.5) value += 0.07 * mfAuroraNoise(p * 8.11 + 67.9);
    return value;
  }

  float mfAuroraCurtain(
    float az,
    float elevation,
    float t,
    float quality,
    float seed,
    float heightOffset,
    float widthScale
  ) {
    // The silhouette is static: these terms never use time. This is what anchors
    // the curtain to a fixed location in the world instead of following the camera.
    float staticShape = mfAuroraFbm(vec2(az * 0.43 + seed, seed * 0.37), quality);
    float staticFine = mfAuroraNoise(vec2(az * 1.19 + seed * 2.7, seed + 8.3));
    float lower = 0.105 + heightOffset + (staticShape - 0.48) * 0.145;
    lower += (staticFine - 0.5) * 0.045;
    float thickness = 0.52 + 0.10 * mfAuroraNoise(vec2(az * 0.62 - seed, seed * 1.9));
    float upper = lower + thickness;

    float vertical = smoothstep(lower - 0.045, lower + 0.035, elevation);
    vertical *= 1.0 - smoothstep(upper - 0.16, upper + 0.035, elevation);
    if (vertical <= 0.001) return 0.0;

    float relY = clamp((elevation - lower) / max(0.12, thickness), 0.0, 1.0);

    // Time deforms only the plasma inside the fixed silhouette. Two slow flow fields
    // create folds that breathe and bend without translating the entire aurora.
    float flowA = mfAuroraNoise(vec2(az * 1.72 + seed, t * 0.025 + seed * 3.1));
    float flowB = mfAuroraNoise(vec2(az * 3.35 - seed, t * 0.018 + 19.0 + seed));
    float warp = (flowA - 0.5) * 0.22 + (flowB - 0.5) * 0.095;
    warp *= 0.35 + 0.95 * relY;

    // Vertical rays are noise ridges rather than repeated sine columns. This makes
    // the curtain less illustrated and gives every part a different width/spacing.
    float rayCoord = az * widthScale + warp;
    float rayNoise = mfAuroraNoise(vec2(rayCoord, seed * 7.3 + t * 0.010));
    float rayFine = mfAuroraNoise(vec2(rayCoord * 1.91 + 13.4, seed * 4.1 - t * 0.008));
    float ridge = 1.0 - abs(rayNoise * 2.0 - 1.0);
    ridge = smoothstep(0.30, 0.88, ridge);
    ridge *= 0.62 + 0.38 * smoothstep(0.20, 0.86, rayFine);

    // Large gaps are static in world-space, so the same broad auroral structures
    // remain above the same horizon while their internal rays continue to move.
    float cluster = mfAuroraFbm(vec2(az * 0.31 + seed * 5.4, seed * 0.83), quality);
    cluster = smoothstep(0.27, 0.68, cluster);

    // A faint translucent body prevents the effect from looking like isolated neon bars.
    float body = 0.20 + 0.34 * mfAuroraNoise(vec2(az * 0.68 + seed, elevation * 2.2 + seed));
    float rays = mix(body, 1.0, ridge);

    // Natural brightness tends to gather toward the lower green edge, with softer
    // rays climbing upward into the cyan/violet part of the curtain.
    float lowerEdge = 0.62 + 0.38 * (1.0 - smoothstep(0.05, 0.82, relY));
    return vertical * cluster * rays * lowerEdge;
  }

  vec3 mfAuroraColor(vec3 dir) {
    float night = (1.0 - smoothstep(0.10, 0.58, dayFactor)) * uMFAuroraStrength;
    if (night <= 0.001 || dir.y <= 0.012) return vec3(0.0);

    float quality = clamp(uMFAuroraQuality, 0.0, 2.0);
    float t = uMFAuroraTime;

    // Fixed world-space auroral sector. There is intentionally NO time component
    // in this basis. Walking or turning the camera cannot move the aurora itself.
    vec3 north = normalize(vec3(-0.24, 0.0, 0.971));
    vec3 east = normalize(vec3(north.z, 0.0, -north.x));

    float az = atan(dot(dir, east), dot(dir, north));
    float elevation = asin(clamp(dir.y, -1.0, 1.0));

    // A broad northern oval spans most of the visible sky, but leaves a real gap
    // behind the player instead of closing into a 360-degree ring.
    float sideGate = 1.0 - smoothstep(1.82, 2.32, abs(az));
    float horizonGate = smoothstep(0.025, 0.115, elevation);
    float zenithGate = 1.0 - smoothstep(1.23, 1.49, elevation);
    float region = sideGate * horizonGate * zenithGate;
    if (region <= 0.001) return vec3(0.0);

    float light = mfAuroraCurtain(az, elevation, t, quality, 1.7, 0.000, 7.5);

    if (quality > 0.5) {
      light += mfAuroraCurtain(az + 0.10, elevation, t * 0.94, quality, 6.1, 0.075, 10.5) * 0.52;
    }
    if (quality > 1.5) {
      light += mfAuroraCurtain(az - 0.075, elevation, t * 1.04, quality, 10.9, 0.155, 14.5) * 0.30;
    }

    // Very faint broad glow around the curtains. It remains fixed spatially while
    // its brightness breathes, which reads as atmospheric light rather than a PNG.
    float veilShape = mfAuroraFbm(vec2(az * 0.54 + 4.2, elevation * 1.72 + 12.8), quality);
    float veilBand = smoothstep(0.15, 0.32, elevation) * (1.0 - smoothstep(0.82, 1.20, elevation));
    float veil = smoothstep(0.40, 0.76, veilShape) * veilBand;
    veil *= quality < 0.5 ? 0.055 : (quality < 1.5 ? 0.085 : 0.105);

    float h = smoothstep(0.14, 0.92, elevation);
    vec3 green = vec3(0.035, 0.76, 0.29);
    vec3 cyan = vec3(0.045, 0.43, 0.70);
    vec3 violet = vec3(0.30, 0.095, 0.52);
    vec3 colorA = mix(green, cyan, h);
    if (quality > 1.5) {
      colorA = mix(colorA, violet, smoothstep(0.72, 1.12, elevation) * 0.40);
    }

    // Shimmer is local intensity modulation only. No azimuth/position drift.
    float shimmerNoise = mfAuroraNoise(vec2(az * 2.15 + 21.0, t * 0.055 + elevation * 2.8));
    float shimmer = 0.91 + 0.09 * shimmerNoise;

    float intensity = quality < 0.5 ? 0.105 : (quality < 1.5 ? 0.125 : 0.140);
    float total = min(light, 1.20) * intensity + veil;
    return colorA * total * region * night * shimmer;
  }

`;

    shader = shader.replace('  void main() {', `${helpers}\n  void main() {`);

    shader = shader.replace(
      '    // triangular-PDF dither (~1 LSB) to break up 8-bit gradient banding',
      `    // ${MARKER}: additive aurora light, naturally hidden during daytime.\n    color += mfAuroraColor(dir);\n\n    // triangular-PDF dither (~1 LSB) to break up 8-bit gradient banding`
    );

    return shader;
  }

  function restoreMaterial() {
    const material = state.material;
    if (!material || !state.patchApplied) return;
    try {
      if (state.originalFragmentShader) material.fragmentShader = state.originalFragmentShader;
      material.customProgramCacheKey = state.originalCacheKey;
      if (material.uniforms?.uMFAuroraStrength) material.uniforms.uMFAuroraStrength.value = 0;
      material.needsUpdate = true;
    } catch (_) {}
    state.material = null;
    state.originalFragmentShader = '';
    state.originalCacheKey = undefined;
    state.patchApplied = false;
  }

  function patchMaterial(material) {
    if (!material) return false;
    if (state.material === material && state.patchApplied) return true;

    if (state.material && state.material !== material) restoreMaterial();

    if (material.fragmentShader.includes(MARKER)) {
      state.material = material;
      state.patchApplied = true;
      material.uniforms.uMFAuroraTime ||= { value: 0 };
      material.uniforms.uMFAuroraStrength ||= { value: 0 };
      material.uniforms.uMFAuroraQuality ||= { value: 1 };
      return true;
    }

    const patched = injectAurora(material.fragmentShader);
    if (!patched) return false;

    state.material = material;
    state.originalFragmentShader = material.fragmentShader;
    state.originalCacheKey = material.customProgramCacheKey;

    material.uniforms.uMFAuroraTime = { value: performance.now() * 0.001 };
    material.uniforms.uMFAuroraStrength = { value: 0 };
    material.uniforms.uMFAuroraQuality = { value: 1 };
    material.fragmentShader = patched;

    const previousCacheKey = state.originalCacheKey;
    material.customProgramCacheKey = function() {
      let base = '';
      try { base = previousCacheKey ? String(previousCacheKey.call(this)) : ''; } catch (_) {}
      return `${base}|mf-aurora-v4-world-anchored`;
    };

    material.needsUpdate = true; // one compile only; toggling is uniform-only afterwards.
    state.patchApplied = true;
    return true;
  }

  function updateWeather(game, now) {
    if (now - state.lastWeatherScan < 350) return;
    state.lastWeatherScan = now;
    let rain = 0;
    let thunder = 0;
    try { rain = Number(game?.world?.getRainStrength?.(1)) || 0; } catch (_) {}
    try { thunder = Number(game?.world?.getThunderStrength?.(1)) || 0; } catch (_) {}
    state.rainFactor = Math.max(0, Math.min(1, 1 - rain * 0.78 - thunder * 0.18));
  }

  function tick(now) {
    if (state.destroyed) return;

    if (!state.enabled) {
      state.raf = 0;
      return;
    }

    const game = findGame();
    const material = resolveAtmosphereMaterial(game);
    if (material) patchMaterial(material);

    if (state.material?.uniforms) {
      updateWeather(game, now);
      const uniforms = state.material.uniforms;
      if (uniforms.uMFAuroraTime) uniforms.uMFAuroraTime.value = now * 0.001;
      if (uniforms.uMFAuroraStrength) uniforms.uMFAuroraStrength.value = state.rainFactor;
      if (uniforms.uMFAuroraQuality) uniforms.uMFAuroraQuality.value = state.level === 'low' ? 0 : (state.level === 'high' ? 2 : 1);
    }

    state.raf = requestAnimationFrame(tick);
  }

  function setEnabled(value) {
    const next = !!value;
    if (state.enabled === next) return;
    state.enabled = next;

    if (!next) {
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0;
      if (state.material?.uniforms?.uMFAuroraStrength) {
        state.material.uniforms.uMFAuroraStrength.value = 0;
      }
      return;
    }

    state.rainFactor = 1;
    if (!state.raf) state.raf = requestAnimationFrame(tick);
  }

  function setLevel(value) {
    const level = String(value || '').toLowerCase();
    state.level = level === 'low' || level === 'high' ? level : 'medium';
    if (state.material?.uniforms?.uMFAuroraQuality) {
      state.material.uniforms.uMFAuroraQuality.value = state.level === 'low' ? 0 : (state.level === 'high' ? 2 : 1);
    }
  }

  function onConfig(event) {
    let detail = event?.detail;
    if (typeof detail === 'string') {
      try { detail = JSON.parse(detail); } catch (_) { detail = {}; }
    }
    setLevel(detail?.level);
    setEnabled(!!detail?.enabled);
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    document.removeEventListener(EVENT_NAME, onConfig);
    if (state.raf) cancelAnimationFrame(state.raf);
    if (state.scanTimer) clearInterval(state.scanTimer);
    restoreMaterial();
    try { delete W.MF_AuroraExperimental; } catch (_) {}
  }

  document.addEventListener(EVENT_NAME, onConfig);

  // Slow fallback scan so worlds created after page load are picked up even before a frame loop starts.
  state.scanTimer = window.setInterval(() => {
    if (!state.enabled || state.destroyed) return;
    const game = findGame(true);
    const material = resolveAtmosphereMaterial(game);
    if (material) patchMaterial(material);
  }, 1600);

  W.MF_AuroraExperimental = Object.freeze({
    setEnabled,
    setLevel,
    destroy,
    get enabled() { return state.enabled; },
    get level() { return state.level; },
    get patched() { return state.patchApplied; }
  });
})();
