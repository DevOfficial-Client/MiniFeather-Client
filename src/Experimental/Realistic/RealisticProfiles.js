(() => {
  'use strict';

  const profiles = Object.freeze({
    low: Object.freeze({
      shadow: Object.freeze({
        mapSize: 2048,
        noonRadius: 2.25,
        horizonRadius: 4.25,
        bias: -0.00042,
        normalBias: 0.050,
        horizonNormalBias: 0.072,
        intensity: 0.67,
        moon: false,
        moonMapSize: 1024,
        moonRadius: 4.0,
        moonIntensity: 0.16
      }),
      water: Object.freeze({ alpha: 0.60, waveScale: 0.78, microNormal: 0.08, tint: [0.20, 0.50, 0.66], tintStrength: 0.11 }),
      lava: Object.freeze({ alpha: 0.96, waveScale: 0.85, bubbles: 0.08, emission: 0.05 }),
      wetness: Object.freeze({
        maxCells: 8,
        radius: 4,
        verticalRadius: 3,
        columnsPerScan: 6,
        scanInterval: 900,
        drySeconds: 120,
        darken: 0.10,
        sheen: 0.08,
        gloss: 0.30,
        detail: 0.15,
        rainSide: 0.10
      }),
      clouds: Object.freeze({ marchSteps: 16, shadowSteps: 2, silver: 0.05, coverageOffset: 0.00, thicknessMul: 0.95, opacityMul: 0.98, windMul: 0.95 }),
      leafWind: 0.060,
      starScale: 1.04
    }),
    medium: Object.freeze({
      shadow: Object.freeze({
        mapSize: 4096,
        noonRadius: 2.40,
        horizonRadius: 5.50,
        bias: -0.00036,
        normalBias: 0.043,
        horizonNormalBias: 0.064,
        intensity: 0.72,
        moon: false,
        moonMapSize: 2048,
        moonRadius: 4.5,
        moonIntensity: 0.18
      }),
      water: Object.freeze({ alpha: 0.56, waveScale: 1.00, microNormal: 0.14, tint: [0.18, 0.49, 0.66], tintStrength: 0.14 }),
      lava: Object.freeze({ alpha: 0.97, waveScale: 1.00, bubbles: 0.14, emission: 0.08 }),
      wetness: Object.freeze({
        maxCells: 16,
        radius: 6,
        verticalRadius: 4,
        columnsPerScan: 10,
        scanInterval: 650,
        drySeconds: 180,
        darken: 0.14,
        sheen: 0.15,
        gloss: 0.45,
        detail: 0.35,
        rainSide: 0.14
      }),
      clouds: Object.freeze({ marchSteps: 22, shadowSteps: 3, silver: 0.08, coverageOffset: 0.00, thicknessMul: 1.00, opacityMul: 1.00, windMul: 1.00 }),
      leafWind: 0.090,
      starScale: 1.08
    }),
    high: Object.freeze({
      shadow: Object.freeze({
        mapSize: 4096,
        noonRadius: 2.20,
        horizonRadius: 7.00,
        bias: -0.00030,
        normalBias: 0.036,
        horizonNormalBias: 0.057,
        intensity: 0.77,
        moon: true,
        moonMapSize: 2048,
        moonRadius: 5.5,
        moonIntensity: 0.24
      }),
      water: Object.freeze({ alpha: 0.53, waveScale: 1.18, microNormal: 0.20, tint: [0.16, 0.47, 0.65], tintStrength: 0.18 }),
      lava: Object.freeze({ alpha: 0.985, waveScale: 1.15, bubbles: 0.22, emission: 0.12 }),
      wetness: Object.freeze({
        maxCells: 32,
        radius: 8,
        verticalRadius: 5,
        columnsPerScan: 16,
        scanInterval: 450,
        drySeconds: 240,
        darken: 0.18,
        sheen: 0.24,
        gloss: 0.62,
        detail: 0.68,
        rainSide: 0.18
      }),
      clouds: Object.freeze({ marchSteps: 30, shadowSteps: 4, silver: 0.12, coverageOffset: 0.015, thicknessMul: 1.08, opacityMul: 1.03, windMul: 1.03 }),
      leafWind: 0.120,
      starScale: 1.12
    }),
    ultra: Object.freeze({
      shadow: Object.freeze({
        mapSize: 8192,
        noonRadius: 2.00,
        horizonRadius: 8.50,
        bias: -0.00024,
        normalBias: 0.030,
        horizonNormalBias: 0.050,
        intensity: 0.82,
        moon: true,
        moonMapSize: 4096,
        moonRadius: 6.5,
        moonIntensity: 0.30
      }),
      water: Object.freeze({ alpha: 0.50, waveScale: 1.35, microNormal: 0.27, tint: [0.14, 0.45, 0.64], tintStrength: 0.22 }),
      lava: Object.freeze({ alpha: 0.99, waveScale: 1.30, bubbles: 0.30, emission: 0.16 }),
      wetness: Object.freeze({
        maxCells: 48,
        radius: 10,
        verticalRadius: 6,
        columnsPerScan: 24,
        scanInterval: 320,
        drySeconds: 300,
        darken: 0.22,
        sheen: 0.34,
        gloss: 0.78,
        detail: 1.00,
        rainSide: 0.22
      }),
      clouds: Object.freeze({ marchSteps: 36, shadowSteps: 5, silver: 0.16, coverageOffset: 0.025, thicknessMul: 1.15, opacityMul: 1.05, windMul: 1.05 }),
      leafWind: 0.150,
      starScale: 1.16
    })
  });

  function normalizeLevel(level) {
    const value = String(level || 'medium').toLowerCase();
    if (value === 'extreme') return 'ultra';
    return profiles[value] ? value : 'medium';
  }

  globalThis.MF_RealisticProfiles = Object.freeze({
    get(level) { return profiles[normalizeLevel(level)]; },
    normalizeLevel,
    all: profiles
  });
})();
