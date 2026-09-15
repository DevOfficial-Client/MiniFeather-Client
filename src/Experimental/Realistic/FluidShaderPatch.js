(() => {
  'use strict';

  const W = globalThis;
  const MARKER = 'MF_REALISTIC_FLUID_V2';
  try { W.MF_RealisticFluid?.destroy?.(); } catch (_) {}

  const entries = new Map();
  let profile = W.MF_RealisticProfiles?.get?.('medium');

  function isFluidMaterial(material) {
    const u = material?.userData;
    return !!(material && u?.waterShadersEnabled && u?.waterTileOrigin && u?.time);
  }

  function beforeMainEnd(source, code) {
    const i = source.lastIndexOf('}');
    return i < 0 ? source : `${source.slice(0, i)}\n${code}\n${source.slice(i)}`;
  }

  function uniformSet() {
    const w = profile.water, l = profile.lava;
    return {
      uMFWaterAlpha: { value: w.alpha },
      uMFWaterWaveScale: { value: w.waveScale },
      uMFWaterMicroNormal: { value: w.microNormal },
      uMFWaterTint: { value: { x: w.tint[0], y: w.tint[1], z: w.tint[2] } },
      uMFWaterTintStrength: { value: w.tintStrength },
      uMFLavaAlpha: { value: l.alpha },
      uMFLavaWaveScale: { value: l.waveScale },
      uMFLavaBubbles: { value: l.bubbles },
      uMFLavaEmission: { value: l.emission }
    };
  }

  function updateUniforms(u) {
    const w = profile.water, l = profile.lava;
    u.uMFWaterAlpha.value = w.alpha;
    u.uMFWaterWaveScale.value = w.waveScale;
    u.uMFWaterMicroNormal.value = w.microNormal;
    Object.assign(u.uMFWaterTint.value, { x: w.tint[0], y: w.tint[1], z: w.tint[2] });
    u.uMFWaterTintStrength.value = w.tintStrength;
    u.uMFLavaAlpha.value = l.alpha;
    u.uMFLavaWaveScale.value = l.waveScale;
    u.uMFLavaBubbles.value = l.bubbles;
    u.uMFLavaEmission.value = l.emission;
  }

  function patch(material) {
    if (!isFluidMaterial(material) || typeof material.onBeforeCompile !== 'function') return false;

    const previous = entries.get(material);
    if (previous?.active && material.onBeforeCompile === previous.wrapper) {
      updateUniforms(previous.uniforms);
      return true;
    }
    if (previous) previous.active = false;

    const baseHook = material.onBeforeCompile;
    const baseKey = material.customProgramCacheKey;
    const uniforms = uniformSet();
    const entry = { baseHook, baseKey, uniforms, active: true, wrapper: null };

    const wrapper = function (shader, renderer) {
      baseHook.call(this, shader, renderer);
      if (!entry.active || shader.fragmentShader.includes(MARKER)) return;

      for (const [name, ref] of Object.entries(uniforms)) shader.uniforms[name] = ref;

      const waveDecl = `\nuniform float uMFWaterWaveScale;\nuniform float uMFLavaWaveScale;\n`;
      if (shader.vertexShader.includes('#ifdef USE_WATER_SHADERS')) {
        shader.vertexShader = shader.vertexShader.replace('#ifdef USE_WATER_SHADERS', `${waveDecl}\n#ifdef USE_WATER_SHADERS`);
      }
      shader.vertexShader = shader.vertexShader.replace(
        /float amp\s*=\s*kind\s*<\s*0\.5\s*\?\s*0\.01\s*:\s*\(kind\s*<\s*1\.5\s*\?\s*0\.045\s*:\s*0\.03\)\s*;/,
        'float amp = kind < 0.5 ? (0.01 * uMFLavaWaveScale) : (kind < 1.5 ? (0.045 * uMFWaterWaveScale) : (0.03 * uMFWaterWaveScale));'
      );

      const fragDecl = `
// ${MARKER}
uniform float uMFWaterAlpha;
uniform float uMFWaterMicroNormal;
uniform vec3 uMFWaterTint;
uniform float uMFWaterTintStrength;
uniform float uMFLavaAlpha;
uniform float uMFLavaBubbles;
uniform float uMFLavaEmission;
`;
      if (shader.fragmentShader.includes('uniform float uAmbientLight;')) {
        shader.fragmentShader = shader.fragmentShader.replace('uniform float uAmbientLight;', `uniform float uAmbientLight;${fragDecl}`);
      } else {
        shader.fragmentShader = fragDecl + shader.fragmentShader;
      }

      // Preserve MiniBlox SSR/refraction/Fresnel. Only make the surface readable and tunable.
      shader.fragmentShader = shader.fragmentShader.replace(
        /vec3 waterTint\s*=\s*vec3\(0\.30,\s*0\.52,\s*0\.64\)\s*;/,
        'vec3 waterTint = mix(vec3(0.30, 0.52, 0.64), uMFWaterTint, uMFWaterTintStrength);'
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        /float surfaceAlpha\s*=\s*0\.68\s*;/,
        'float surfaceAlpha = uMFWaterAlpha;'
      );

      // Fine normal detail: leaves the native geometry wave intact and only enriches highlights/reflections.
      const normalAnchor = 'vec3 normal = normalize(vWorldNormal);';
      if (shader.fragmentShader.includes(normalAnchor)) {
        shader.fragmentShader = shader.fragmentShader.replace(normalAnchor, `${normalAnchor}
          vec2 mfWp = vWorldPosition.xz;
          float mfT = time * 0.12;
          vec2 mfGrad = vec2(
            cos(mfWp.x * 3.1 + mfWp.y * 1.7 + mfT * 1.8) * 0.55 + cos(mfWp.x * 5.3 - mfWp.y * 2.4 - mfT * 1.3) * 0.30,
            cos(mfWp.y * 3.4 - mfWp.x * 1.5 - mfT * 1.6) * 0.55 + cos(mfWp.y * 5.8 + mfWp.x * 2.0 + mfT * 1.1) * 0.30
          );
          vec3 mfMicroN = normalize(vec3(-mfGrad.x, 2.8, -mfGrad.y));
          normal = normalize(mix(normal, mfMicroN, uMFWaterMicroNormal * smoothstep(0.35, 0.95, abs(normal.y))));`);
      }

      // Lava remains on the same native fluid material; branch by vColor so water is unaffected.
      const lavaAnchor = 'if (vColor.r >= 0.5 && waterShadersEnabled > 0.5) {';
      if (shader.fragmentShader.includes(lavaAnchor)) {
        shader.fragmentShader = shader.fragmentShader.replace(lavaAnchor, `${lavaAnchor}
          vec2 mfLp = vWorldPosition.xz;
          float mfBubbleField = sin(mfLp.x * 2.15 + time * 0.11) * sin(mfLp.y * 2.65 - time * 0.085);
          mfBubbleField += 0.45 * sin((mfLp.x + mfLp.y) * 4.2 + time * 0.17);
          float mfBubble = smoothstep(0.58, 0.96, mfBubbleField * 0.5 + 0.5) * smoothstep(0.40, 0.95, abs(vWorldNormal.y));
          float mfPulse = 0.5 + 0.5 * sin(time * 0.075 + mfLp.x * 0.24 + mfLp.y * 0.19);
          gl_FragColor.rgb += vec3(1.00, 0.24, 0.025) * mfBubble * uMFLavaBubbles;
          gl_FragColor.rgb *= 1.0 + mfPulse * uMFLavaEmission;`);
      }

      // Critical fix: water and lava share one transparent material. Never change material.opacity or
      // depthWrite globally; enforce per-fluid alpha here instead.
      shader.fragmentShader = beforeMainEnd(shader.fragmentShader, `
#ifdef USE_COLOR
if (vColor.r < 0.49) gl_FragColor.a = max(gl_FragColor.a, uMFWaterAlpha);
else gl_FragColor.a = max(gl_FragColor.a, uMFLavaAlpha);
#endif
`);
    };

    entry.wrapper = wrapper;
    material.onBeforeCompile = wrapper;
    material.customProgramCacheKey = function () {
      const base = typeof baseKey === 'function' ? baseKey.call(material) : '';
      return `mf_realistic_fluid_v2_${base}`;
    };
    material.needsUpdate = true;
    entries.set(material, entry);
    return true;
  }

  function setProfile(next) {
    profile = next || profile;
    for (const entry of entries.values()) updateUniforms(entry.uniforms);
  }

  function restore() {
    for (const [material, entry] of entries) {
      entry.active = false;
      try {
        if (material.onBeforeCompile === entry.wrapper) material.onBeforeCompile = entry.baseHook;
        if (material.customProgramCacheKey && material.onBeforeCompile === entry.baseHook) material.customProgramCacheKey = entry.baseKey;
        material.needsUpdate = true;
      } catch (_) {}
    }
    entries.clear();
  }

  W.MF_RealisticFluid = Object.freeze({ isFluidMaterial, patch, setProfile, restore, destroy: restore });
})();
