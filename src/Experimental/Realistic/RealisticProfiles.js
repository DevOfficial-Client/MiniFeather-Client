(() => {
  'use strict';

  const clamp = (v, a, b, f = a) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : f;
  };
  const bool = (v, f = false) => v == null ? f : !!v;
  const pow2 = value => {
    const allowed = [512, 1024, 2048, 4096, 8192];
    const n = clamp(value, 512, 8192, 4096);
    return allowed.reduce((best, x) => Math.abs(x - n) < Math.abs(best - n) ? x : best, 4096);
  };

  const base = {
    low: {
      shadow: { mapSize: 2048, samples: 16, noonRadius: 2.25, horizonRadius: 4.25, bias: -0.00042, normalBias: 0.050, horizonNormalBias: 0.072, intensity: 0.67, moon: false, moonMapSize: 1024, moonRadius: 4.0, moonIntensity: 0.16 },
      water: { alpha: 0.60, waveScale: 0.78, waveSpeed: 1.0, microNormal: 0.08, reflection: 1.0, refraction: 1.0, ssrSteps: 20, tint: [0.20, 0.50, 0.66], tintStrength: 0.11 },
      lava: { alpha: 0.96, waveScale: 0.85, waveSpeed: 1.0, bubbles: 0.08, emission: 0.05 },
      wetness: { maxCells: 8, radius: 4, verticalRadius: 3, columnsPerScan: 6, scanInterval: 900, drySeconds: 120, darken: 0.10, saturation: 0.04, sheen: 0.08, gloss: 0.30, detail: 0.15, rainSide: 0.10, puddles: true, maxPuddles: 4, puddleRadius: 4, puddleColumnsPerScan: 2, puddleScanInterval: 1200, puddleBuildInterval: 500, puddleSkyProbe: 4, puddleDensity: 0.06, puddleRainThreshold: 0.24, puddleFillRate: 0.030, puddleVisibleThreshold: 0.52, puddleMinSize: 0.42, puddleMaxSize: 0.68, puddleOpacity: 0.18, puddleReflection: 0.12, puddleRipple: 0.10, puddleDetail: 0.15 },
      clouds: { marchSteps: 16, shadowSteps: 2, silver: 0.05, coverageOffset: 0.00, thicknessMul: 0.95, opacityMul: 0.98, windMul: 0.95 },
      world: { renderBlocks: null }, leafWind: 0.060, starScale: 1.04
    },
    medium: {
      shadow: { mapSize: 4096, samples: 16, noonRadius: 2.40, horizonRadius: 5.50, bias: -0.00036, normalBias: 0.043, horizonNormalBias: 0.064, intensity: 0.72, moon: false, moonMapSize: 2048, moonRadius: 4.5, moonIntensity: 0.18 },
      water: { alpha: 0.56, waveScale: 1.00, waveSpeed: 1.0, microNormal: 0.14, reflection: 1.0, refraction: 1.0, ssrSteps: 20, tint: [0.18, 0.49, 0.66], tintStrength: 0.14 },
      lava: { alpha: 0.97, waveScale: 1.00, waveSpeed: 1.0, bubbles: 0.14, emission: 0.08 },
      wetness: { maxCells: 16, radius: 6, verticalRadius: 4, columnsPerScan: 10, scanInterval: 650, drySeconds: 180, darken: 0.14, saturation: 0.07, sheen: 0.15, gloss: 0.45, detail: 0.35, rainSide: 0.14, puddles: true, maxPuddles: 10, puddleRadius: 6, puddleColumnsPerScan: 4, puddleScanInterval: 900, puddleBuildInterval: 360, puddleSkyProbe: 6, puddleDensity: 0.11, puddleRainThreshold: 0.18, puddleFillRate: 0.045, puddleVisibleThreshold: 0.42, puddleMinSize: 0.46, puddleMaxSize: 0.78, puddleOpacity: 0.22, puddleReflection: 0.20, puddleRipple: 0.18, puddleDetail: 0.35 },
      clouds: { marchSteps: 22, shadowSteps: 3, silver: 0.08, coverageOffset: 0.00, thicknessMul: 1.00, opacityMul: 1.00, windMul: 1.00 },
      world: { renderBlocks: null }, leafWind: 0.090, starScale: 1.08
    },
    high: {
      shadow: { mapSize: 4096, samples: 16, noonRadius: 2.20, horizonRadius: 7.00, bias: -0.00030, normalBias: 0.036, horizonNormalBias: 0.057, intensity: 0.77, moon: true, moonMapSize: 2048, moonRadius: 5.5, moonIntensity: 0.24 },
      water: { alpha: 0.53, waveScale: 1.18, waveSpeed: 1.0, microNormal: 0.20, reflection: 1.0, refraction: 1.0, ssrSteps: 20, tint: [0.16, 0.47, 0.65], tintStrength: 0.18 },
      lava: { alpha: 0.985, waveScale: 1.15, waveSpeed: 1.0, bubbles: 0.22, emission: 0.12 },
      wetness: { maxCells: 32, radius: 8, verticalRadius: 5, columnsPerScan: 16, scanInterval: 450, drySeconds: 240, darken: 0.18, saturation: 0.10, sheen: 0.24, gloss: 0.62, detail: 0.68, rainSide: 0.18, puddles: true, maxPuddles: 18, puddleRadius: 8, puddleColumnsPerScan: 7, puddleScanInterval: 650, puddleBuildInterval: 260, puddleSkyProbe: 8, puddleDensity: 0.18, puddleRainThreshold: 0.13, puddleFillRate: 0.065, puddleVisibleThreshold: 0.32, puddleMinSize: 0.50, puddleMaxSize: 0.88, puddleOpacity: 0.27, puddleReflection: 0.30, puddleRipple: 0.30, puddleDetail: 0.68 },
      clouds: { marchSteps: 30, shadowSteps: 4, silver: 0.12, coverageOffset: 0.015, thicknessMul: 1.08, opacityMul: 1.03, windMul: 1.03 },
      world: { renderBlocks: null }, leafWind: 0.120, starScale: 1.12
    },
    ultra: {
      // Ultra keeps the premium look but avoids pathological GPU costs. 4096² + 16-tap
      // Vogel filtering is visually close to 8192² in motion while using 75% less shadow-map memory.
      shadow: { mapSize: 4096, samples: 16, noonRadius: 1.90, horizonRadius: 8.00, bias: -0.00024, normalBias: 0.030, horizonNormalBias: 0.050, intensity: 0.82, moon: true, moonMapSize: 2048, moonRadius: 6.2, moonIntensity: 0.30 },
      water: { alpha: 0.50, waveScale: 1.35, waveSpeed: 1.0, microNormal: 0.27, reflection: 1.0, refraction: 1.0, ssrSteps: 20, tint: [0.14, 0.45, 0.64], tintStrength: 0.22 },
      lava: { alpha: 0.99, waveScale: 1.30, waveSpeed: 1.0, bubbles: 0.30, emission: 0.16 },
      wetness: { maxCells: 36, radius: 9, verticalRadius: 5, columnsPerScan: 14, scanInterval: 520, drySeconds: 300, darken: 0.22, saturation: 0.14, sheen: 0.34, gloss: 0.78, detail: 1.00, rainSide: 0.22, puddles: true, maxPuddles: 20, puddleRadius: 9, puddleColumnsPerScan: 6, puddleScanInterval: 740, puddleBuildInterval: 300, puddleSkyProbe: 9, puddleDensity: 0.23, puddleRainThreshold: 0.08, puddleFillRate: 0.085, puddleVisibleThreshold: 0.24, puddleMinSize: 0.54, puddleMaxSize: 0.94, puddleOpacity: 0.31, puddleReflection: 0.40, puddleRipple: 0.42, puddleDetail: 1.00 },
      clouds: { marchSteps: 30, shadowSteps: 4, silver: 0.16, coverageOffset: 0.025, thicknessMul: 1.15, opacityMul: 1.05, windMul: 1.05 },
      world: { renderBlocks: null }, leafWind: 0.150, starScale: 1.16
    }
  };

  const CUSTOM_DEFAULTS = Object.freeze({
    renderBlocks: 96,
    optimizeFps: true,
    targetFps: 60,
    shadowResolution: 4096,
    shadowSamples: 24,
    shadowSharpness: 75,
    shadowSoftness: 28,
    shadowDistanceSoftening: 85,
    shadowSunAngleSoftening: 100,
    shadowDarkness: 82,
    shadowArtifactFix: 55,
    moonShadows: true,
    waterTransparency: 60,
    waterWaveStrength: 135,
    waterWaveSpeed: 100,
    waterMicroDetail: 135,
    waterReflection: 110,
    waterRefraction: 100,
    waterSsrSteps: 32,
    lavaOpacity: 99,
    lavaWaveStrength: 130,
    lavaWaveSpeed: 100,
    lavaBubbles: 100,
    lavaEmission: 100,
    cloudSteps: 40,
    cloudShadowSteps: 5,
    cloudDensity: 110,
    cloudThickness: 115,
    cloudOpacity: 105,
    cloudSpeed: 100,
    cloudSilverLining: 100,
    wetCells: 48,
    wetRadius: 10,
    wetDarken: 22,
    wetSaturation: 14,
    wetSheen: 34,
    wetGloss: 78,
    wetDetail: 100,
    puddles: true,
    maxPuddles: 28,
    puddleReflection: 40,
    puddleRipple: 42,
    puddleDetail: 100,
    drySeconds: 180
  });

  function clampCustom(source = {}) {
    const raw = source && typeof source === 'object' ? source : {};
    const s = { ...CUSTOM_DEFAULTS, ...raw };
    const optimizeFps = Object.prototype.hasOwnProperty.call(raw, 'optimizeFps') ? bool(raw.optimizeFps, true) : (Object.prototype.hasOwnProperty.call(raw, 'adaptive') ? bool(raw.adaptive, true) : true);
    return {
      renderBlocks: Math.round(clamp(s.renderBlocks, 10, 200, CUSTOM_DEFAULTS.renderBlocks)),
      optimizeFps, targetFps: Math.round(clamp(s.targetFps, 30, 144, 60)),
      shadowResolution: pow2(s.shadowResolution), shadowSamples: Math.round(clamp(s.shadowSamples, 1, 64, 24)),
      shadowSharpness: clamp(s.shadowSharpness, 0, 100, 75), shadowSoftness: clamp(s.shadowSoftness, 0, 100, 28),
      shadowDistanceSoftening: clamp(s.shadowDistanceSoftening, 0, 200, 85), shadowSunAngleSoftening: clamp(s.shadowSunAngleSoftening, 0, 200, 100),
      shadowDarkness: clamp(s.shadowDarkness, 0, 100, 82), shadowArtifactFix: clamp(s.shadowArtifactFix, 0, 100, 55), moonShadows: bool(s.moonShadows, true),
      waterTransparency: clamp(s.waterTransparency, 0, 90, 60), waterWaveStrength: clamp(s.waterWaveStrength, 0, 250, 135), waterWaveSpeed: clamp(s.waterWaveSpeed, 25, 300, 100),
      waterMicroDetail: clamp(s.waterMicroDetail, 0, 250, 135), waterReflection: clamp(s.waterReflection, 0, 150, 110), waterRefraction: clamp(s.waterRefraction, 0, 150, 100), waterSsrSteps: Math.round(clamp(s.waterSsrSteps, 4, 64, 32)),
      lavaOpacity: clamp(s.lavaOpacity, 50, 100, 99), lavaWaveStrength: clamp(s.lavaWaveStrength, 0, 250, 130), lavaWaveSpeed: clamp(s.lavaWaveSpeed, 25, 300, 100), lavaBubbles: clamp(s.lavaBubbles, 0, 200, 100), lavaEmission: clamp(s.lavaEmission, 0, 200, 100),
      cloudSteps: Math.round(clamp(s.cloudSteps, 8, 64, 40)), cloudShadowSteps: Math.round(clamp(s.cloudShadowSteps, 0, 8, 5)), cloudDensity: clamp(s.cloudDensity, 0, 200, 110), cloudThickness: clamp(s.cloudThickness, 25, 250, 115), cloudOpacity: clamp(s.cloudOpacity, 0, 150, 105), cloudSpeed: clamp(s.cloudSpeed, 0, 300, 100), cloudSilverLining: clamp(s.cloudSilverLining, 0, 200, 100),
      wetCells: Math.round(clamp(s.wetCells, 4, 64, 48)), wetRadius: Math.round(clamp(s.wetRadius, 2, 16, 10)), wetDarken: clamp(s.wetDarken, 0, 50, 22), wetSaturation: clamp(s.wetSaturation, 0, 40, 14), wetSheen: clamp(s.wetSheen, 0, 100, 34), wetGloss: clamp(s.wetGloss, 0, 100, 78), wetDetail: clamp(s.wetDetail, 0, 200, 100), puddles: bool(s.puddles, true), maxPuddles: Math.round(clamp(s.maxPuddles, 0, 64, 28)), puddleReflection: clamp(s.puddleReflection, 0, 100, 40), puddleRipple: clamp(s.puddleRipple, 0, 100, 42), puddleDetail: clamp(s.puddleDetail, 0, 200, 100), drySeconds: Math.round(clamp(s.drySeconds, 10, 900, 180))
    };
  }

  function buildCustom(source, qualityScale = 1) {
    const c = clampCustom(source);
    const q = clamp(qualityScale, 0.35, 1, 1);
    const soft = c.shadowSoftness / 100;
    const sharp = c.shadowSharpness / 100;
    const baseRadius = Math.max(0.08, (0.15 + soft * 7.5) * (1.12 - sharp * 0.82));
    const horizonExtra = (c.shadowSunAngleSoftening / 100) * 8.5 + (c.shadowDistanceSoftening / 100) * 3.5;
    const artifact = c.shadowArtifactFix / 100;
    const resOptions = [512, 1024, 2048, 4096, 8192];
    const wantedIndex = Math.max(0, resOptions.indexOf(c.shadowResolution));
    // Avoid resolution cliffs: a tiny FPS adjustment must not instantly halve a shadow map.
    const resolutionDrop = q >= 0.78 ? 0 : q >= 0.55 ? 1 : 2;
    const scaledRes = resOptions[Math.max(0, wantedIndex - resolutionDrop)];

    const wetRadius = Math.max(2, Math.round(c.wetRadius * Math.max(0.65, q)));
    const maxPuddles = Math.round(c.maxPuddles * Math.max(0.35, q));
    const maxCells = Math.max(4, Math.round(c.wetCells * Math.max(0.45, q)));
    const cloudSteps = Math.max(8, Math.round(c.cloudSteps * Math.max(0.45, q)));
    const ssrSteps = Math.max(4, Math.round(c.waterSsrSteps * Math.max(0.45, q)));
    const shadowSamples = Math.max(1, Math.round(c.shadowSamples * Math.max(0.35, q)));
    const renderBlocks = Math.max(10, Math.round(c.renderBlocks * Math.max(0.50, q)));

    return {
      shadow: {
        mapSize: scaledRes, samples: shadowSamples, noonRadius: baseRadius, horizonRadius: baseRadius + horizonExtra,
        bias: -(0.00012 + artifact * 0.00036), normalBias: 0.018 + artifact * 0.050, horizonNormalBias: 0.028 + artifact * 0.068,
        intensity: c.shadowDarkness / 100, moon: c.moonShadows, moonMapSize: Math.min(scaledRes, 4096), moonRadius: baseRadius + horizonExtra * 0.75, moonIntensity: Math.min(0.42, c.shadowDarkness / 260)
      },
      water: {
        alpha: Math.max(0.30, 1 - c.waterTransparency * 0.0075), waveScale: c.waterWaveStrength / 100, waveSpeed: c.waterWaveSpeed / 100,
        microNormal: Math.min(0.65, 0.20 * c.waterMicroDetail / 100), reflection: c.waterReflection / 100, refraction: c.waterRefraction / 100, ssrSteps,
        tint: [0.14, 0.45, 0.64], tintStrength: Math.min(0.34, 0.10 + c.waterMicroDetail / 1000)
      },
      lava: { alpha: c.lavaOpacity / 100, waveScale: c.lavaWaveStrength / 100, waveSpeed: c.lavaWaveSpeed / 100, bubbles: 0.30 * c.lavaBubbles / 100, emission: 0.16 * c.lavaEmission / 100 },
      clouds: { marchSteps: cloudSteps, shadowSteps: Math.min(8, Math.round(c.cloudShadowSteps * Math.max(0.5, q))), silver: 0.16 * c.cloudSilverLining / 100, coverageOffset: (c.cloudDensity - 100) / 100 * 0.18, thicknessMul: c.cloudThickness / 100, opacityMul: c.cloudOpacity / 100, windMul: c.cloudSpeed / 100 },
      wetness: {
        maxCells, radius: wetRadius, verticalRadius: Math.max(3, Math.round(wetRadius * 0.6)), columnsPerScan: Math.max(5, Math.round(18 * q)), scanInterval: Math.round(440 / Math.max(0.55, q)), drySeconds: c.drySeconds,
        darken: c.wetDarken / 100, saturation: c.wetSaturation / 100, sheen: c.wetSheen / 100, gloss: c.wetGloss / 100, detail: c.wetDetail / 100, rainSide: Math.min(0.35, c.wetSheen / 300),
        puddles: c.puddles && maxPuddles > 0, maxPuddles, puddleRadius: wetRadius, puddleColumnsPerScan: Math.max(2, Math.round(7 * q)), puddleScanInterval: Math.round(620 / Math.max(0.55, q)), puddleBuildInterval: Math.round(260 / Math.max(0.60, q)), puddleSkyProbe: wetRadius,
        puddleDensity: Math.min(0.45, 0.15 + maxPuddles / 220), puddleRainThreshold: 0.08, puddleFillRate: 0.085, puddleVisibleThreshold: 0.24, puddleMinSize: 0.54, puddleMaxSize: 0.94,
        puddleOpacity: Math.min(0.48, 0.18 + c.puddleReflection / 300), puddleReflection: c.puddleReflection / 100, puddleRipple: c.puddleRipple / 100, puddleDetail: c.puddleDetail / 100
      },
      world: { renderBlocks }, leafWind: 0.15, starScale: 1.16,
      custom: c, qualityScale: q
    };
  }

  function normalizeLevel(level) {
    const value = String(level || 'medium').toLowerCase();
    if (value === 'extreme') return 'ultra';
    return value === 'custom' || base[value] ? value : 'medium';
  }

  const frozen = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Object.freeze(v)]));
  globalThis.MF_RealisticProfiles = Object.freeze({
    get(level, custom, qualityScale = 1) {
      const normalized = normalizeLevel(level);
      return normalized === 'custom' ? buildCustom(custom, qualityScale) : frozen[normalized];
    },
    normalizeLevel, all: Object.freeze(frozen), customDefaults: CUSTOM_DEFAULTS, clampCustom, buildCustom
  });
})();
