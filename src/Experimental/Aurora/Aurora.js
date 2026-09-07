(() => {
  'use strict';

  const W = globalThis;
  const EVENT_NAME = 'minifeather:aurora-config';
  const MARKER = 'MF_AURORA_BOREALIS_V2';

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
  // MiniFeather Experimental: lightweight layered aurora curtains.
  // uMFAuroraQuality: 0 = Low, 1 = Medium, 2 = High.
  float mfAuroraRibbon(float az, float h, float t, float phase, float density, float lift) {
    float slowWarp = sin(az * 2.15 + t * 0.095 + phase) * 0.19;
    slowWarp += sin(az * 5.20 - t * 0.061 + phase * 1.7) * 0.075;

    float base = 0.165 + lift;
    base += sin(az * 1.65 + t * 0.038 + phase) * 0.020;
    base += sin(az * 4.10 - t * 0.026 + phase * 0.7) * 0.010;

    float top = base + 0.40 + 0.025 * sin(az * 1.25 - t * 0.031 + phase);
    float vertical = smoothstep(base - 0.035, base + 0.028, h);
    vertical *= 1.0 - smoothstep(top - 0.095, top + 0.055, h);

    // Bend the folds slightly as they rise so they read as curtains instead of blocks.
    float bentAz = az + (h - base) * (0.26 * sin(az * 1.9 + t * 0.052 + phase));
    float stripeA = 0.5 + 0.5 * sin(bentAz * density + slowWarp * 3.1 + t * 0.115 + phase);
    float stripeB = 0.5 + 0.5 * sin(bentAz * (density * 1.73) - slowWarp * 2.2 - t * 0.072 + phase * 2.3);
    float folds = smoothstep(0.30, 0.86, stripeA);
    folds *= 0.68 + 0.32 * smoothstep(0.18, 0.82, stripeB);

    float verticalTexture = 0.88 + 0.12 * sin(h * 24.0 + bentAz * 4.0 - t * 0.08 + phase);
    return vertical * folds * verticalTexture;
  }

  vec3 mfAuroraColor(vec3 dir) {
    float night = (1.0 - smoothstep(0.10, 0.58, dayFactor)) * uMFAuroraStrength;
    if (night <= 0.001 || dir.y <= 0.025) return vec3(0.0);

    float t = uMFAuroraTime;
    float az = atan(dir.x, dir.z);
    float h = dir.y;

    // Keep the display in a broad northern arc, fading naturally at its edges.
    float northArc = 1.0 - smoothstep(1.05, 2.28, abs(az));
    float horizonGate = smoothstep(0.035, 0.12, h) * (1.0 - smoothstep(0.73, 0.94, h));

    float quality = clamp(uMFAuroraQuality, 0.0, 2.0);
    float curtain = mfAuroraRibbon(az, h, t, 0.25, 11.0, 0.000);

    if (quality > 0.5) {
      curtain += mfAuroraRibbon(az + 0.28, h, t * 0.92, 1.75, 16.0, 0.035) * 0.52;
    }
    if (quality > 1.5) {
      curtain += mfAuroraRibbon(az - 0.18, h, t * 1.06, 3.55, 21.0, 0.075) * 0.30;
    }

    // Green near the lower curtain, cyan in the middle, a restrained violet cap on High.
    vec3 green = vec3(0.08, 0.90, 0.43);
    vec3 cyan = vec3(0.08, 0.58, 0.88);
    vec3 violet = vec3(0.44, 0.20, 0.74);
    float upperMix = smoothstep(0.24, 0.59, h);
    vec3 auroraColor = mix(green, cyan, upperMix);
    if (quality > 1.5) {
      auroraColor = mix(auroraColor, violet, smoothstep(0.49, 0.72, h) * 0.42);
    }

    float intensity = quality < 0.5 ? 0.115 : (quality < 1.5 ? 0.145 : 0.175);
    float shimmer = 0.94 + 0.06 * sin(t * 0.43 + az * 2.4);
    float softCap = 1.0 - smoothstep(1.10, 1.62, curtain);
    float light = curtain * (0.82 + 0.18 * softCap);
    return auroraColor * light * northArc * horizonGate * night * shimmer * intensity;
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
      return `${base}|mf-aurora-v2`;
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
