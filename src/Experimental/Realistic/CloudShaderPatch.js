(() => {
  'use strict';

  const W = globalThis;
  const MARKER = 'MF_REALISTIC_CLOUD_V2';
  try { W.MF_RealisticClouds?.destroy?.(); } catch (_) {}

  const entries = new Map();
  let profile = W.MF_RealisticProfiles?.get?.('medium');

  function collect(root, limit = 3500) {
    const out = [], queue = root ? [root] : [], seen = new WeakSet();
    while (queue.length && out.length < limit) {
      const o = queue.shift();
      if (!o || typeof o !== 'object' || seen.has(o)) continue;
      seen.add(o); out.push(o);
      if (Array.isArray(o.children)) for (const c of o.children) queue.push(c);
    }
    return out;
  }

  function isCloudMaterial(m) {
    const u = m?.uniforms;
    return !!(u?.uCoverage && u?.uNoiseScale && u?.uWind && u?.uThickness && u?.uCloudY && u?.uOpacity && u?.uSunDir);
  }

  function patchShader(material) {
    if (!isCloudMaterial(material) || typeof material.fragmentShader !== 'string') return null;
    if (material.fragmentShader.includes(MARKER)) return material;

    const original = material.fragmentShader;
    if (!original.includes('const int STEPS = 26;') || !original.includes('vec3 col = mix(uShadowColor, uCloudColor, sun);')) return null;

    material.uniforms.uMFCloudSteps = material.uniforms.uMFCloudSteps || { value: profile.clouds.marchSteps };
    material.uniforms.uMFCloudShadowSteps = material.uniforms.uMFCloudShadowSteps || { value: profile.clouds.shadowSteps };
    material.uniforms.uMFCloudSilver = material.uniforms.uMFCloudSilver || { value: profile.clouds.silver };

    let frag = original.replace(
      'uniform float uVolumetric;',
      `uniform float uVolumetric;\nuniform int uMFCloudSteps;\nuniform int uMFCloudShadowSteps;\nuniform float uMFCloudSilver;\n// ${MARKER}`
    );
    frag = frag.replace(
      'const int STEPS = 26;\n      float dt = (tf - tn) / float(STEPS);',
      'const int MF_MAX_STEPS = 64;\n      int mfSteps = clamp(uMFCloudSteps, 8, MF_MAX_STEPS);\n      float dt = (tf - tn) / float(mfSteps);'
    );
    frag = frag.replace(
      'for (int i = 0; i < STEPS; i++) {',
      'for (int i = 0; i < MF_MAX_STEPS; i++) {\n        if (i >= mfSteps) break;'
    );
    frag = frag.replace(
      'for (int j = 1; j <= 3; j++) {',
      'for (int j = 1; j <= 8; j++) {\n            if (j > uMFCloudShadowSteps) break;'
    );
    frag = frag.replace(
      'vec3 col = mix(uShadowColor, uCloudColor, sun);',
      `vec3 col = mix(uShadowColor, uCloudColor, sun);
          // Forward scattering / silver lining. Native density + self-shadow remain untouched.
          float mfMu = clamp(dot(normalize(rd), normalize(uSunDir)), -1.0, 1.0);
          const float mfG = 0.58;
          float mfPhase = (1.0 - mfG * mfG) / pow(max(1.0 + mfG * mfG - 2.0 * mfG * mfMu, 0.06), 1.5);
          float mfSilver = smoothstep(0.45, 1.0, sun) * clamp(mfPhase * 0.085, 0.0, 1.0) * uMFCloudSilver;
          col += uCloudColor * mfSilver;`
    );

    material.fragmentShader = frag;
    material.needsUpdate = true;
    return { original, patched: frag };
  }

  function anchor(material) {
    const u = material.uniforms;
    return {
      coverage: u.uCoverage.value,
      scale: u.uNoiseScale.value,
      wind: u.uWind.value,
      thickness: u.uThickness.value,
      height: u.uCloudY.value,
      opacity: u.uOpacity.value,
      volumetric: u.uVolumetric?.value
    };
  }

  function tune(material, storm = 0) {
    const cfg = profile.clouds, u = material.uniforms;
    let e = entries.get(material);
    if (!e || (e.patched && !material.fragmentShader.includes(MARKER))) {
      const shader = patchShader(material);
      e = { anchor: anchor(material), original: shader?.original || null, patched: shader?.patched || null };
      entries.set(material, e);
    }

    const a = e.anchor;
    u.uCoverage.value = Math.max(0.05, Math.min(0.95, a.coverage + cfg.coverageOffset + storm * 0.035));
    u.uNoiseScale.value = a.scale; // Preserve MiniFeather custom cloud shape/noise scale.
    u.uWind.value = a.wind * cfg.windMul;
    u.uThickness.value = Math.max(8, Math.min(150, a.thickness * cfg.thicknessMul + storm * 24));
    u.uCloudY.value = a.height;
    u.uOpacity.value = Math.max(0, Math.min(1, a.opacity * cfg.opacityMul + storm * 0.04));
    if (u.uVolumetric) u.uVolumetric.value = 1;
    if (u.uMFCloudSteps) u.uMFCloudSteps.value = cfg.marchSteps;
    if (u.uMFCloudShadowSteps) u.uMFCloudShadowSteps.value = cfg.shadowSteps;
    if (u.uMFCloudSilver) u.uMFCloudSilver.value = cfg.silver;
  }

  function scan(game) {
    let rain = 0, thunder = 0;
    try { rain = Math.max(0, Math.min(1, Number(game?.world?.getRainStrength?.(1)) || 0)); } catch (_) {}
    try { thunder = Math.max(0, Math.min(1, Number(game?.world?.getThunderStrength?.(1)) || 0)); } catch (_) {}
    const storm = Math.max(rain, thunder * 0.9);
    const materials = new Set();
    for (const root of [game?.gameScene?.clouds, game?.gameScene?.scene, game?.gameScene?.ambientMeshes].filter(Boolean)) {
      for (const o of collect(root)) {
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (isCloudMaterial(m)) materials.add(m);
      }
    }
    for (const m of materials) tune(m, storm);
    return materials.size;
  }

  function setProfile(next) {
    profile = next || profile;
    for (const m of entries.keys()) if (m?.uniforms) tune(m, 0);
  }

  function restore() {
    for (const [m, e] of entries) {
      try {
        const u = m.uniforms, a = e.anchor;
        if (u?.uCoverage) u.uCoverage.value = a.coverage;
        if (u?.uNoiseScale) u.uNoiseScale.value = a.scale;
        if (u?.uWind) u.uWind.value = a.wind;
        if (u?.uThickness) u.uThickness.value = a.thickness;
        if (u?.uCloudY) u.uCloudY.value = a.height;
        if (u?.uOpacity) u.uOpacity.value = a.opacity;
        if (u?.uVolumetric && a.volumetric !== undefined) u.uVolumetric.value = a.volumetric;
        // Don't overwrite a cloud shader another MiniFeather module changed after us.
        if (e.original && e.patched && m.fragmentShader === e.patched) {
          m.fragmentShader = e.original;
          m.needsUpdate = true;
        }
      } catch (_) {}
    }
    entries.clear();
  }

  W.MF_RealisticClouds = Object.freeze({ scan, setProfile, restore, destroy: restore, count: () => entries.size });
})();
