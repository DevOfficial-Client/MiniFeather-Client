(() => {
  'use strict';

  const W = globalThis;
  const EVENT_NAME = 'minifeather:realistic-config';
  const MARKER = 'MF_REALISTIC_MODE_V1';
  const SAFE_TYPES = new Set([
    'MeshLambertMaterial',
    'MeshStandardMaterial',
    'MeshBasicMaterial',
    'MeshPhongMaterial',
    'MeshToonMaterial'
  ]);
  const PROFILES = {
    low: { strength: 0.46, detail: 0.2, water: 0.48, wind: 0.06, shadowSize: 2048, shadowRadius: 3, shadowDistance: 48, waterAlpha: 0.14, wave: 0.035, cloudCoverage: 0.46, cloudScale: 0.012, cloudWind: 0.018, cloudThickness: 34, cloudHeight: 132, cloudOpacity: 0.78 },
    medium: { strength: 0.68, detail: 0.36, water: 0.72, wind: 0.09, shadowSize: 3072, shadowRadius: 4, shadowDistance: 62, waterAlpha: 0.11, wave: 0.065, cloudCoverage: 0.52, cloudScale: 0.0095, cloudWind: 0.026, cloudThickness: 48, cloudHeight: 138, cloudOpacity: 0.84 },
    high: { strength: 0.84, detail: 0.52, water: 0.9, wind: 0.12, shadowSize: 4096, shadowRadius: 5, shadowDistance: 76, waterAlpha: 0.08, wave: 0.105, cloudCoverage: 0.58, cloudScale: 0.0075, cloudWind: 0.034, cloudThickness: 64, cloudHeight: 144, cloudOpacity: 0.89 },
    extreme: { strength: 0.94, detail: 0.68, water: 1, wind: 0.15, shadowSize: 8192, shadowRadius: 6, shadowDistance: 92, waterAlpha: 0.06, wave: 0.16, cloudCoverage: 0.62, cloudScale: 0.006, cloudWind: 0.042, cloudThickness: 82, cloudHeight: 152, cloudOpacity: 0.93 }
  };

  try { W.MF_RealisticMode?.destroy?.(); } catch (_) {}

  const state = {
    enabled: false,
    level: 'medium',
    game: null,
    hooked: new Map(),
    stars: new Map(),
    waterMaterials: new Map(),
    clouds: new Map(),
    shadowObjects: new Map(),
    renderer: null,
    rendererShadow: null,
    sunlight: null,
    sunlightShadow: null,
    raf: 0,
    timer: 0,
    lastScan: 0,
    lastBiomeScan: 0,
    snowy: true,
    auroraApplied: null,
    baseLeafEnabled: false,
    baseLeafStrength: 0.085,
    baseAuroraEnabled: false,
    baseAuroraLevel: 'medium',
    destroyed: false
  };

  function findGame() {
    if (state.game?.player && state.game?.world) return state.game;
    for (const candidate of [W.__MINIBLOX_GAME__, W.miniblox, W.__MB?.game, W.game]) {
      if (candidate?.player && candidate?.world) {
        state.game = candidate;
        return candidate;
      }
    }
    for (const root of [document.querySelector('#react'), document.querySelector('#root')]) {
      if (!root) continue;
      let keys = [];
      try { keys = Object.keys(root); } catch (_) {}
      for (const key of keys) {
        if (!key.startsWith('__react')) continue;
        const queue = [root[key]];
        const seen = new Set();
        let visited = 0;
        while (queue.length && visited++ < 1400) {
          const fiber = queue.shift();
          if (!fiber || seen.has(fiber)) continue;
          seen.add(fiber);
          const candidates = [
            fiber.stateNode,
            fiber.stateNode?.game,
            fiber.memoizedProps?.game,
            fiber.pendingProps?.game,
            fiber.memoizedState?.game
          ];
          for (const candidate of candidates) {
            const game = candidate?.player && candidate?.world ? candidate : candidate?.game;
            if (game?.player && game?.world) {
              W.__MINIBLOX_GAME__ = game;
              state.game = game;
              return game;
            }
          }
          if (fiber.child) queue.push(fiber.child);
          if (fiber.sibling) queue.push(fiber.sibling);
        }
      }
    }
    return null;
  }

  function collect(root, limit = 5000) {
    const result = [];
    const queue = root ? [root] : [];
    const seen = new WeakSet();
    while (queue.length && result.length < limit) {
      const object = queue.shift();
      if (!object || typeof object !== 'object' || seen.has(object)) continue;
      seen.add(object);
      result.push(object);
      if (Array.isArray(object.children)) {
        for (const child of object.children) queue.push(child);
      }
    }
    return result;
  }

  function materialName(material, object) {
    return `${material?.name || ''} ${object?.name || ''}`.toLowerCase();
  }

  function isWater(material, object) {
    const name = materialName(material, object);
    const uniforms = material?.userData;
    return /water|fluid|ocean|river/.test(name) || Boolean(
      uniforms?.waterShadersEnabled &&
      uniforms?.waterTileOrigin &&
      uniforms?.time
    );
  }

  function beforeMainEnd(source, code) {
    const index = source.lastIndexOf('}');
    return index < 0 ? source : `${source.slice(0, index)}\n${code}\n${source.slice(index)}`;
  }

  function hookMaterial(material, object) {
    if (!material || state.hooked.has(material)) return;
    const type = material.type || material.constructor?.name || '';
    if (!SAFE_TYPES.has(type) || typeof material.onBeforeCompile !== 'function') return;

    const originalHook = material.onBeforeCompile;
    const originalKey = material.customProgramCacheKey;
    const water = isWater(material, object);
    const uniforms = {
      uMFRealTime: { value: performance.now() * 0.001 },
      uMFRealStrength: { value: PROFILES[state.level].strength },
      uMFRealDetail: { value: PROFILES[state.level].detail },
      uMFRealWater: { value: water ? PROFILES[state.level].water : 0 },
      uMFRealWave: { value: water ? PROFILES[state.level].wave : 0 },
      uMFRealWaterAlpha: { value: water ? PROFILES[state.level].waterAlpha : 1 }
    };

    material.onBeforeCompile = function (shader, renderer) {
      originalHook.call(this, shader, renderer);
      if (shader.vertexShader.includes(MARKER) || shader.fragmentShader.includes(MARKER)) return;
      if (!shader.vertexShader.includes('#include <begin_vertex>')) return;
      shader.uniforms.uMFRealTime = uniforms.uMFRealTime;
      shader.uniforms.uMFRealStrength = uniforms.uMFRealStrength;
      shader.uniforms.uMFRealDetail = uniforms.uMFRealDetail;
      shader.uniforms.uMFRealWater = uniforms.uMFRealWater;
      shader.uniforms.uMFRealWave = uniforms.uMFRealWave;
      shader.uniforms.uMFRealWaterAlpha = uniforms.uMFRealWaterAlpha;
      const vertexEffect = water
        ? `if (abs(fluidKind - 1.0) < 0.1 && uMFRealWater > 0.001) {\n  vec2 mfRealWaterXZ = vMFRealWorld.xz;\n  float mfRealSwell = sin(dot(mfRealWaterXZ, vec2(0.62, 0.34)) + uMFRealTime * 1.18);\n  float mfRealCross = sin(dot(mfRealWaterXZ, vec2(-0.38, 0.91)) - uMFRealTime * 1.46);\n  float mfRealRipple = sin(dot(mfRealWaterXZ, vec2(1.42, 1.17)) + uMFRealTime * 2.34);\n  float mfRealChop = sign(mfRealSwell) * pow(abs(mfRealSwell), 1.65);\n  float mfRealSurface = mfRealChop * 0.48 + mfRealCross * 0.3 + mfRealRipple * 0.22;\n  transformed.y += mfRealSurface * uMFRealWave * abs(objectNormal.y);\n}`
        : '';
      shader.vertexShader = `varying vec3 vMFRealWorld;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n vMFRealWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n${vertexEffect}`
      );
      shader.fragmentShader = `
uniform float uMFRealTime;
uniform float uMFRealStrength;
uniform float uMFRealDetail;
uniform float uMFRealWater;
uniform float uMFRealWave;
uniform float uMFRealWaterAlpha;
varying vec3 vMFRealWorld;
float mfRealHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
${shader.fragmentShader}`;
      shader.fragmentShader = beforeMainEnd(shader.fragmentShader, `
float ${MARKER} = 1.0;
vec3 mfRealBase = gl_FragColor.rgb;
vec3 mfRealDx = dFdx(vMFRealWorld);
vec3 mfRealDy = dFdy(vMFRealWorld);
vec3 mfRealNormal = normalize(cross(mfRealDx, mfRealDy));
if (!gl_FrontFacing) mfRealNormal = -mfRealNormal;
vec3 mfRealSun = normalize(vec3(0.42, 0.82, 0.38));
float mfRealDirect = max(dot(mfRealNormal, mfRealSun), 0.0);
float mfRealSky = clamp(mfRealNormal.y * 0.5 + 0.5, 0.0, 1.0);
float mfRealLight = 0.88 + mfRealDirect * 0.2 + mfRealSky * 0.08;
float mfRealLum = dot(mfRealBase, vec3(0.2126, 0.7152, 0.0722));
float mfRealEdge = clamp(length(vec2(dFdx(mfRealLum), dFdy(mfRealLum))) * 2.8, 0.0, 1.0);
float mfRealGrain = mfRealHash(floor(vMFRealWorld * 3.0));
vec3 mfRealColor = mfRealBase * mfRealLight;
mfRealColor *= 1.0 + (mfRealGrain - 0.5) * uMFRealDetail * 0.075;
mfRealColor *= 1.0 - mfRealEdge * uMFRealDetail * 0.08;
mfRealColor = max(mfRealColor, vec3(0.0));
mfRealColor = clamp((mfRealColor * (2.51 * mfRealColor + 0.03)) / (mfRealColor * (2.43 * mfRealColor + 0.59) + 0.14), 0.0, 1.0);
mfRealColor = pow(mfRealColor, vec3(0.96));
if (${water ? 'uMFRealWater > 0.001 && abs(vFluidKind - 1.0) < 0.1' : 'false'}) {
  float mfRealWaveA = sin(dot(vMFRealWorld.xz, vec2(0.66, 0.31)) + uMFRealTime * 1.42);
  float mfRealWaveB = sin(dot(vMFRealWorld.xz, vec2(-0.43, 0.88)) - uMFRealTime * 1.76);
  float mfRealWaveC = sin(dot(vMFRealWorld.xz, vec2(1.54, 1.21)) + uMFRealTime * 2.68);
  float mfRealWave = clamp(0.5 + mfRealWaveA * 0.24 + mfRealWaveB * 0.17 + mfRealWaveC * 0.09, 0.0, 1.0);
  float mfRealFresnel = pow(1.0 - abs(mfRealNormal.y), 2.0);
  float mfRealCrest = smoothstep(0.7, 0.98, mfRealWave);
  float mfRealSparkle = pow(max(mfRealWave * 0.9 + mfRealFresnel * 0.32, 0.0), 10.0);
  vec3 mfRealWaterColor = mix(vec3(0.008, 0.105, 0.17), vec3(0.16, 0.56, 0.72), mfRealWave);
  vec3 mfRealSkyReflection = mix(vec3(0.12, 0.34, 0.56), vec3(0.58, 0.82, 0.96), mfRealWave);
  mfRealColor = mix(mfRealColor, mfRealWaterColor, uMFRealWater * (0.055 + mfRealFresnel * 0.14));
  mfRealColor = mix(mfRealColor, mfRealSkyReflection, mfRealFresnel * uMFRealWater * 0.34);
  mfRealColor += vec3(0.8, 0.92, 1.0) * (mfRealSparkle * 0.2 + mfRealCrest * 0.045) * uMFRealWater;
  float mfRealSurfaceAlpha = uMFRealWaterAlpha + mfRealFresnel * 0.2 + mfRealCrest * 0.035;
  gl_FragColor.a = max(gl_FragColor.a * 0.72, mfRealSurfaceAlpha);
}
gl_FragColor.rgb = mix(mfRealBase, mfRealColor, uMFRealStrength);
`);
    };

    material.customProgramCacheKey = function () {
      const base = typeof originalKey === 'function' ? originalKey.call(material) : '';
      return `mf_realistic_v1_${base}`;
    };
    material.needsUpdate = true;
    state.hooked.set(material, { originalHook, originalKey, uniforms });
    if (water) {
      state.waterMaterials.set(material, {
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite
      });
      material.transparent = true;
      material.depthWrite = false;
    }
  }

  function restoreMaterials() {
    for (const [material, entry] of state.hooked) {
      try {
        material.onBeforeCompile = entry.originalHook;
        material.customProgramCacheKey = entry.originalKey;
        material.needsUpdate = true;
      } catch (_) {}
    }
    state.hooked.clear();
    for (const [material, snapshot] of state.waterMaterials) {
      try {
        material.opacity = snapshot.opacity;
        material.transparent = snapshot.transparent;
        material.depthWrite = snapshot.depthWrite;
        material.needsUpdate = true;
      } catch (_) {}
    }
    state.waterMaterials.clear();
  }

  function snapshotStars(game) {
    const roots = [game?.gameScene?.stars, game?.gameScene?.sky?.stars].filter(Boolean);
    for (const root of roots) {
      for (const object of collect(root, 500)) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material || state.stars.has(material)) continue;
          const snapshot = {
            opacity: material.opacity,
            size: material.size,
            toneMapped: material.toneMapped,
            color: material.color?.clone?.() || null
          };
          state.stars.set(material, snapshot);
          if (Number.isFinite(material.opacity)) material.opacity = Math.min(1, material.opacity * 1.2 + 0.08);
          if (Number.isFinite(material.size)) material.size *= state.level === 'low' ? 1.04 : 1.12;
          if ('toneMapped' in material) material.toneMapped = false;
          if (material.color?.multiplyScalar) material.color.multiplyScalar(1.12);
          material.needsUpdate = true;
        }
      }
    }
  }

  function restoreStars() {
    for (const [material, snapshot] of state.stars) {
      try {
        if (snapshot.opacity !== undefined) material.opacity = snapshot.opacity;
        if (snapshot.size !== undefined) material.size = snapshot.size;
        if (snapshot.toneMapped !== undefined) material.toneMapped = snapshot.toneMapped;
        if (snapshot.color && material.color?.copy) material.color.copy(snapshot.color);
        material.needsUpdate = true;
      } catch (_) {}
    }
    state.stars.clear();
  }

  function tuneClouds(game) {
    const profile = PROFILES[state.level];
    let rain = 0;
    let thunder = 0;
    try { rain = Math.max(0, Math.min(1, Number(game?.world?.getRainStrength?.(1)) || 0)); } catch (_) {}
    try { thunder = Math.max(0, Math.min(1, Number(game?.world?.getThunderStrength?.(1)) || 0)); } catch (_) {}
    const roots = [game?.gameScene?.clouds, game?.gameScene?.scene, game?.gameScene?.ambientMeshes].filter(Boolean);
    const materials = new Set();
    for (const root of roots) {
      for (const object of collect(root, 3000)) {
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
          const uniforms = material?.uniforms;
          if (uniforms?.uCoverage && uniforms?.uNoiseScale && uniforms?.uWind && uniforms?.uThickness && uniforms?.uCloudY && uniforms?.uOpacity) {
            materials.add(material);
          }
        }
      }
    }
    for (const material of materials) {
      const uniforms = material.uniforms;
      if (!state.clouds.has(material)) {
        state.clouds.set(material, {
          coverage: uniforms.uCoverage.value,
          scale: uniforms.uNoiseScale.value,
          wind: uniforms.uWind.value,
          thickness: uniforms.uThickness.value,
          height: uniforms.uCloudY.value,
          opacity: uniforms.uOpacity.value,
          volumetric: uniforms.uVolumetric?.value
        });
      }
      const storm = Math.max(rain, thunder * 0.9);
      const anchor = state.clouds.get(material);
      uniforms.uCoverage.value = anchor.coverage;
      uniforms.uNoiseScale.value = anchor.scale;
      uniforms.uWind.value = anchor.wind;
      uniforms.uThickness.value = Math.min(150, Math.max(anchor.thickness, profile.cloudThickness) + storm * 32);
      uniforms.uCloudY.value = anchor.height;
      uniforms.uOpacity.value = Math.min(1, Math.max(anchor.opacity, profile.cloudOpacity) + storm * 0.05);
      if (uniforms.uVolumetric) uniforms.uVolumetric.value = 1;
    }
  }

  function restoreClouds() {
    for (const [material, snapshot] of state.clouds) {
      const uniforms = material?.uniforms;
      if (!uniforms) continue;
      try {
        if (uniforms.uCoverage) uniforms.uCoverage.value = snapshot.coverage;
        if (uniforms.uNoiseScale) uniforms.uNoiseScale.value = snapshot.scale;
        if (uniforms.uWind) uniforms.uWind.value = snapshot.wind;
        if (uniforms.uThickness) uniforms.uThickness.value = snapshot.thickness;
        if (uniforms.uCloudY) uniforms.uCloudY.value = snapshot.height;
        if (uniforms.uOpacity) uniforms.uOpacity.value = snapshot.opacity;
        if (uniforms.uVolumetric && snapshot.volumetric !== undefined) uniforms.uVolumetric.value = snapshot.volumetric;
      } catch (_) {}
    }
    state.clouds.clear();
  }

  function resolveRenderer(game) {
    const candidates = [
      game?.renderer,
      game?.gameScene?.renderer,
      game?.engine?.renderer,
      game?.graphics?.renderer
    ];
    return candidates.find(renderer => renderer?.isWebGLRenderer || (renderer?.domElement && renderer?.render)) || null;
  }

  function tuneShadows(game) {
    const renderer = resolveRenderer(game);
    const sunlight = game?.gameScene?.sun?.sunlight;
    if (!renderer?.shadowMap || !sunlight?.shadow) return;
    if ((state.renderer && state.renderer !== renderer) || (state.sunlight && state.sunlight !== sunlight)) {
      restoreShadows();
    }
    const profile = PROFILES[state.level];
    if (state.renderer !== renderer) {
      state.renderer = renderer;
      state.rendererShadow = {
        enabled: renderer.shadowMap.enabled,
        type: renderer.shadowMap.type,
        autoUpdate: renderer.shadowMap.autoUpdate
      };
    }
    if (state.sunlight !== sunlight) {
      state.sunlight = sunlight;
      state.sunlightShadow = {
        castShadow: sunlight.castShadow,
        bias: sunlight.shadow.bias,
        normalBias: sunlight.shadow.normalBias,
        radius: sunlight.shadow.radius,
        mapWidth: sunlight.shadow.mapSize?.width,
        mapHeight: sunlight.shadow.mapSize?.height,
        left: sunlight.shadow.camera?.left,
        right: sunlight.shadow.camera?.right,
        top: sunlight.shadow.camera?.top,
        bottom: sunlight.shadow.camera?.bottom,
        near: sunlight.shadow.camera?.near,
        far: sunlight.shadow.camera?.far
      };
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = 2;
    renderer.shadowMap.autoUpdate = true;
    sunlight.castShadow = true;
    sunlight.shadow.bias = -0.00032;
    sunlight.shadow.normalBias = 0.032;
    sunlight.shadow.radius = profile.shadowRadius;
    const maxSize = Math.max(1024, Number(renderer.capabilities?.maxTextureSize) || 4096);
    const size = Math.min(profile.shadowSize, maxSize);
    if (sunlight.shadow.mapSize?.width !== size || sunlight.shadow.mapSize?.height !== size) {
      sunlight.shadow.mapSize?.set?.(size, size);
      sunlight.shadow.map?.dispose?.();
      sunlight.shadow.map = null;
    }
    const camera = sunlight.shadow.camera;
    if (camera) {
      camera.left = -profile.shadowDistance;
      camera.right = profile.shadowDistance;
      camera.top = profile.shadowDistance;
      camera.bottom = -profile.shadowDistance;
      camera.near = 1;
      camera.far = profile.shadowDistance * 3.2;
      camera.updateProjectionMatrix?.();
    }
    const roots = [
      { root: game?.gameScene?.chunkMeshes, cast: state.level !== 'low' },
      { root: game?.gameScene?.entityMeshes, cast: true }
    ];
    for (const entry of roots) {
      for (const object of collect(entry.root, 3500)) {
        if (!object?.material) continue;
        if (!state.shadowObjects.has(object)) {
          state.shadowObjects.set(object, {
            castShadow: object.castShadow,
            receiveShadow: object.receiveShadow
          });
        }
        object.castShadow = entry.cast;
        object.receiveShadow = true;
      }
    }
  }

  function restoreShadows() {
    if (state.renderer?.shadowMap && state.rendererShadow) {
      state.renderer.shadowMap.enabled = state.rendererShadow.enabled;
      state.renderer.shadowMap.type = state.rendererShadow.type;
      state.renderer.shadowMap.autoUpdate = state.rendererShadow.autoUpdate;
    }
    if (state.sunlight?.shadow && state.sunlightShadow) {
      const light = state.sunlight;
      const snapshot = state.sunlightShadow;
      light.castShadow = snapshot.castShadow;
      light.shadow.bias = snapshot.bias;
      light.shadow.normalBias = snapshot.normalBias;
      light.shadow.radius = snapshot.radius;
      if (Number.isFinite(snapshot.mapWidth) && Number.isFinite(snapshot.mapHeight) &&
          (light.shadow.mapSize?.width !== snapshot.mapWidth || light.shadow.mapSize?.height !== snapshot.mapHeight)) {
        light.shadow.mapSize?.set?.(snapshot.mapWidth, snapshot.mapHeight);
        light.shadow.map?.dispose?.();
        light.shadow.map = null;
      }
      const camera = light.shadow.camera;
      if (camera) {
        camera.left = snapshot.left;
        camera.right = snapshot.right;
        camera.top = snapshot.top;
        camera.bottom = snapshot.bottom;
        camera.near = snapshot.near;
        camera.far = snapshot.far;
        camera.updateProjectionMatrix?.();
      }
    }
    for (const [object, snapshot] of state.shadowObjects) {
      try {
        object.castShadow = snapshot.castShadow;
        object.receiveShadow = snapshot.receiveShadow;
      } catch (_) {}
    }
    state.shadowObjects.clear();
    state.renderer = null;
    state.rendererShadow = null;
    state.sunlight = null;
    state.sunlightShadow = null;
  }

  function playerPosition(game) {
    const source = game?.player?.position || game?.player?.getPosition?.() || game?.player?.mesh?.position;
    if (!source) return null;
    const x = Number(source.x);
    const y = Number(source.y);
    const z = Number(source.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
  }

  function biomeValue(game, position) {
    const world = game?.world;
    const calls = [
      () => world?.getBiomeAt?.(position.x, position.y, position.z),
      () => world?.getBiome?.(position.x, position.y, position.z),
      () => world?.getChunk?.(position)?.getBiomeAt?.(position.x, position.y, position.z),
      () => world?.getChunkAt?.(position.x, position.z)?.getBiomeAt?.(position.x, position.y, position.z)
    ];
    for (const call of calls) {
      try {
        const value = call();
        if (value !== undefined && value !== null) return value;
      } catch (_) {}
    }
    return null;
  }

  function isSnowBiome(value) {
    if (value == null) return null;
    let text = '';
    if (typeof value === 'string' || typeof value === 'number') text = String(value);
    else {
      try { text = `${value.name || ''} ${value.id || ''} ${value.key || ''} ${JSON.stringify(value)}`; } catch (_) {}
    }
    if (!text.trim()) return null;
    return /snow|ice|frozen|tundra|taiga|glacier|polar|alpine|frigid/i.test(text);
  }

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(detail) }));
  }

  function applyCompanions(force = false) {
    const profile = PROFILES[state.level];
    emit('minifeather:leaf-wind-config', {
      enabled: state.enabled || state.baseLeafEnabled,
      strength: state.enabled ? profile.wind : state.baseLeafStrength
    });
    const auroraEnabled = state.baseAuroraEnabled || (state.enabled && state.snowy);
    const signature = `${auroraEnabled}:${state.enabled ? state.level : state.baseAuroraLevel}`;
    if (force || signature !== state.auroraApplied) {
      state.auroraApplied = signature;
      emit('minifeather:aurora-config', {
        enabled: auroraEnabled,
        level: state.enabled ? (state.level === 'extreme' ? 'high' : state.level) : state.baseAuroraLevel
      });
    }
  }

  function scan(force = false) {
    if (!state.enabled) return;
    const now = performance.now();
    if (!force && now - state.lastScan < 1800) return;
    state.lastScan = now;
    const game = findGame();
    if (!game) return;
    const roots = [game?.gameScene?.scene, game?.gameScene?.camera, game?.camera].filter(Boolean);
    for (const root of roots) {
      for (const object of collect(root)) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) hookMaterial(material, object);
      }
    }
    snapshotStars(game);
    tuneClouds(game);
    tuneShadows(game);
  }

  function tick(now) {
    if (!state.enabled || state.destroyed) {
      state.raf = 0;
      return;
    }
    scan();
    const profile = PROFILES[state.level];
    for (const entry of state.hooked.values()) {
      entry.uniforms.uMFRealTime.value = now * 0.001;
      entry.uniforms.uMFRealStrength.value = profile.strength;
      entry.uniforms.uMFRealDetail.value = profile.detail;
      if (entry.uniforms.uMFRealWater.value > 0) {
        entry.uniforms.uMFRealWater.value = profile.water;
        entry.uniforms.uMFRealWave.value = profile.wave;
        entry.uniforms.uMFRealWaterAlpha.value = profile.waterAlpha;
      }
    }
    for (const material of state.clouds.keys()) {
      if (material?.uniforms?.uVolumetric) material.uniforms.uVolumetric.value = 1;
    }
    if (now - state.lastBiomeScan > 2500) {
      state.lastBiomeScan = now;
      const game = findGame();
      const position = playerPosition(game);
      if (game && position) {
        const snowy = isSnowBiome(biomeValue(game, position));
        if (snowy !== null && snowy !== state.snowy) {
          state.snowy = snowy;
          applyCompanions();
        }
      }
    }
    state.raf = requestAnimationFrame(tick);
  }

  function setEnabled(value) {
    const next = !!value;
    if (state.enabled === next) {
      if (next) scan(true);
      applyCompanions(true);
      return;
    }
    state.enabled = next;
    if (next) {
      scan(true);
      applyCompanions(true);
      if (!state.raf) state.raf = requestAnimationFrame(tick);
    } else {
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0;
      restoreMaterials();
      restoreStars();
      restoreClouds();
      restoreShadows();
      applyCompanions(true);
    }
  }

  function configure(detail) {
    let config = detail;
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch (_) { return; }
    }
    if (!config || typeof config !== 'object') return;
    const level = String(config.level || '').toLowerCase();
    if (PROFILES[level]) state.level = level;
    state.baseLeafEnabled = !!config.leafEnabled;
    state.baseLeafStrength = Math.max(0, Math.min(1, Number(config.leafStrength) || 0.085));
    state.baseAuroraEnabled = !!config.auroraEnabled;
    state.baseAuroraLevel = ['low', 'medium', 'high'].includes(String(config.auroraLevel))
      ? String(config.auroraLevel)
      : 'medium';
    setEnabled(!!config.enabled);
  }

  function destroy() {
    if (state.destroyed) return;
    setEnabled(false);
    state.destroyed = true;
    document.removeEventListener(EVENT_NAME, onConfig, true);
    if (state.timer) clearInterval(state.timer);
    try { delete W.MF_RealisticMode; } catch (_) {}
  }

  function onConfig(event) {
    configure(event.detail);
  }

  document.addEventListener(EVENT_NAME, onConfig, true);
  state.timer = setInterval(() => scan(), 2200);
  W.MF_RealisticMode = Object.freeze({
    configure,
    setEnabled,
    destroy,
    getState: () => ({
      enabled: state.enabled,
      level: state.level,
      materials: state.hooked.size,
      stars: state.stars.size,
      clouds: state.clouds.size,
      snowy: state.snowy
    })
  });
})();
