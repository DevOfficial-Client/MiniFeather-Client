(() => {
  'use strict';

  const W = globalThis;
  const MARKER = 'MF_REALISTIC_SHADOW_FILTER_V4';
  try { W.MF_RealisticShadowFilter?.destroy?.(); } catch (_) {}

  const entries = new Map();
  let samples = 16;

  function vogel(count = 64) {
    const out = [];
    const golden = 2.399963229728653;
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt((i + 0.5) / count);
      const a = i * golden;
      out.push(`vec2(${(Math.cos(a) * r).toFixed(7)}, ${(Math.sin(a) * r).toFixed(7)})`);
    }
    return out.join(',\n          ');
  }

  const VOGEL64 = vogel(64);
  const SHADOW_RE = /float getShadow\(\s*sampler2DShadow[\s\S]*?return mix\(\s*1\.0\s*,\s*shadow\s*,\s*shadowIntensity\s*\)\s*;\s*\}/;

  function replacement() {
    return `// ${MARKER}\nuniform int uMFShadowSamples;\nfloat getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
      float shadow = 1.0;
      shadowCoord.xyz /= shadowCoord.w;
      shadowCoord.z += shadowBias;
      bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
      bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
      if (frustumTest) {
        vec2 texelSize = vec2(1.0) / shadowMapSize;
        float radius = max(0.0, shadowRadius) * texelSize.x;
        float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        float rotAngle = noise * 6.2831853;
        float cosR = cos(rotAngle), sinR = sin(rotAngle);
        mat2 rotation = mat2(cosR, sinR, -sinR, cosR);
        const vec2 MF_VOGEL_DISK[64] = vec2[](
          ${VOGEL64}
        );
        int mfSamples = clamp(uMFShadowSamples, 1, 64);
        float sum = 0.0;
        for (int i = 0; i < 64; i++) {
          if (i >= mfSamples) break;
          vec2 disk = rotation * MF_VOGEL_DISK[i];
          sum += texture(shadowMap, vec3(shadowCoord.xy + disk * radius, shadowCoord.z));
        }
        shadow = sum / float(mfSamples);
      }
      return mix(1.0, shadow, shadowIntensity);
    }`;
  }

  function isPatchable(m) {
    if (!m || typeof m.onBeforeCompile !== 'function') return false;
    if (m.userData?.waterShadersEnabled) return false;
    const type = String(m.type || m.constructor?.name || '');
    return /Material/.test(type) && !/ShaderMaterial|RawShaderMaterial/.test(type);
  }

  function patch(material) {
    if (!isPatchable(material)) return false;
    const old = entries.get(material);
    if (old?.active && material.onBeforeCompile === old.wrapper) {
      old.uniform.value = samples;
      return true;
    }
    if (old) old.active = false;

    const baseHook = material.onBeforeCompile;
    const baseKey = material.customProgramCacheKey;
    const uniform = { value: samples };
    const entry = { baseHook, baseKey, uniform, active: true, wrapper: null };
    const wrapper = function(shader, renderer) {
      baseHook.call(this, shader, renderer);
      if (!entry.active || shader.fragmentShader.includes(MARKER)) return;
      if (!SHADOW_RE.test(shader.fragmentShader)) return;
      shader.uniforms.uMFShadowSamples = uniform;
      shader.fragmentShader = shader.fragmentShader.replace(SHADOW_RE, replacement());
    };
    entry.wrapper = wrapper;
    material.onBeforeCompile = wrapper;
    material.customProgramCacheKey = function() {
      const base = typeof baseKey === 'function' ? baseKey.call(material) : '';
      return `mf_realistic_shadow_filter_v4_${base}`;
    };
    material.needsUpdate = true;
    entries.set(material, entry);
    return true;
  }

  function collect(root, limit = 7000) {
    const out = [], q = root ? [root] : [], seen = new WeakSet();
    while (q.length && out.length < limit) {
      const o = q.shift();
      if (!o || typeof o !== 'object' || seen.has(o)) continue;
      seen.add(o); out.push(o);
      if (Array.isArray(o.children)) for (const c of o.children) q.push(c);
    }
    return out;
  }

  function scan(game) {
    let count = 0;
    for (const root of [game?.gameScene?.scene, game?.gameScene?.chunkMeshes, game?.gameScene?.entityMeshes, game?.gameScene?.ambientMeshes].filter(Boolean)) {
      for (const o of collect(root)) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) if (patch(m)) count++;
      }
    }
    return count;
  }

  function setProfile(profile) {
    samples = Math.max(1, Math.min(64, Math.round(Number(profile?.shadow?.samples) || 16)));
    for (const e of entries.values()) e.uniform.value = samples;
  }

  function restore() {
    for (const [m, e] of entries) {
      e.active = false;
      try {
        if (m.onBeforeCompile === e.wrapper) m.onBeforeCompile = e.baseHook;
        if (m.onBeforeCompile === e.baseHook) m.customProgramCacheKey = e.baseKey;
        m.needsUpdate = true;
      } catch (_) {}
    }
    entries.clear();
  }

  W.MF_RealisticShadowFilter = Object.freeze({ patch, scan, setProfile, restore, destroy: restore, count: () => entries.size });
})();
