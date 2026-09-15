(() => {
  'use strict';

  const profiles = Object.freeze({
    low: Object.freeze({
      shadow: Object.freeze({ mapSize: 2048, radius: 3.0, bias: -0.00045, normalBias: 0.055, intensity: 0.68 }),
      water: Object.freeze({ alpha: 0.66, waveScale: 0.75, microNormal: 0.08, tint: [0.20, 0.50, 0.66], tintStrength: 0.10 }),
      lava: Object.freeze({ alpha: 0.96, waveScale: 0.85, bubbles: 0.08, emission: 0.05 }),
      clouds: Object.freeze({ marchSteps: 16, shadowSteps: 2, silver: 0.05, coverageOffset: 0.00, thicknessMul: 0.95, opacityMul: 0.98, windMul: 0.95 }),
      leafWind: 0.060,
      starScale: 1.04
    }),
    medium: Object.freeze({
      shadow: Object.freeze({ mapSize: 2048, radius: 5.0, bias: -0.00040, normalBias: 0.045, intensity: 0.72 }),
      water: Object.freeze({ alpha: 0.69, waveScale: 1.00, microNormal: 0.14, tint: [0.18, 0.49, 0.66], tintStrength: 0.14 }),
      lava: Object.freeze({ alpha: 0.97, waveScale: 1.00, bubbles: 0.14, emission: 0.08 }),
      clouds: Object.freeze({ marchSteps: 22, shadowSteps: 3, silver: 0.08, coverageOffset: 0.00, thicknessMul: 1.00, opacityMul: 1.00, windMul: 1.00 }),
      leafWind: 0.090,
      starScale: 1.08
    }),
    high: Object.freeze({
      shadow: Object.freeze({ mapSize: 4096, radius: 8.0, bias: -0.00032, normalBias: 0.036, intensity: 0.76 }),
      water: Object.freeze({ alpha: 0.72, waveScale: 1.18, microNormal: 0.20, tint: [0.16, 0.47, 0.65], tintStrength: 0.18 }),
      lava: Object.freeze({ alpha: 0.985, waveScale: 1.15, bubbles: 0.22, emission: 0.12 }),
      clouds: Object.freeze({ marchSteps: 30, shadowSteps: 4, silver: 0.12, coverageOffset: 0.015, thicknessMul: 1.08, opacityMul: 1.03, windMul: 1.03 }),
      leafWind: 0.120,
      starScale: 1.12
    }),
    ultra: Object.freeze({
      shadow: Object.freeze({ mapSize: 8192, radius: 16.0, bias: -0.00025, normalBias: 0.028, intensity: 0.80 }),
      water: Object.freeze({ alpha: 0.74, waveScale: 1.35, microNormal: 0.26, tint: [0.14, 0.45, 0.64], tintStrength: 0.22 }),
      lava: Object.freeze({ alpha: 0.99, waveScale: 1.30, bubbles: 0.30, emission: 0.16 }),
      clouds: Object.freeze({ marchSteps: 36, shadowSteps: 5, silver: 0.16, coverageOffset: 0.025, thicknessMul: 1.15, opacityMul: 1.05, windMul: 1.05 }),
      leafWind: 0.150,
      starScale: 1.16
    })
  });

  function normalizeLevel(level) {
    const value = String(level || 'medium').toLowerCase();
    if (value === 'extreme') return 'ultra'; // migration from MiniFeather <= 4.14.6
    return profiles[value] ? value : 'medium';
  }

  globalThis.MF_RealisticProfiles = Object.freeze({
    get(level) { return profiles[normalizeLevel(level)]; },
    normalizeLevel,
    all: profiles
  });
})();
