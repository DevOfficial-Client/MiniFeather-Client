(() => {
  'use strict';

  const W = globalThis;
  const MARKER = 'MF_REALISTIC_WETNESS_V1';
  const MAX_GPU_CELLS = 48;
  try { W.MF_RealisticWetness?.destroy?.(); } catch (_) {}

  const entries = new Map();
  const wetBlocks = new Map();
  const knownWaterIds = new Set();
  let profile = W.MF_RealisticProfiles?.get?.('medium');
  let drySecondsOverride = 180;
  let scanQueue = [];
  let scanCursor = 0;
  let scanAnchor = '';
  let lastScan = 0;
  let lastPack = 0;
  let lastUpdate = performance.now();
  let lastRainWet = performance.now();
  let rainPeak = 0;
  let rainBase = 0;
  let rainNow = 0;
  let enabled = true;

  const shared = {
    uMFWetCells: { value: new Float32Array(MAX_GPU_CELLS * 4) },
    uMFWetCellCount: { value: 0 },
    uMFWetRain: { value: 0 },
    uMFWetDarken: { value: 0.14 },
    uMFWetSheen: { value: 0.15 },
    uMFWetGloss: { value: 0.45 },
    uMFWetDetail: { value: 0.35 },
    uMFWetRainSide: { value: 0.14 },
    uMFWetTime: { value: 0 },
    uMFWetCameraPos: { value: { x: 0, y: 0, z: 0 } },
    uMFWetLightDir: { value: { x: 0.3, y: 0.8, z: 0.2 } },
    uMFWetLightColor: { value: { x: 1.0, y: 0.96, z: 0.88 } },
    uMFWetLightStrength: { value: 1.0 }
  };

  function currentWetProfile() {
    return profile?.wetness || W.MF_RealisticProfiles?.get?.('medium')?.wetness;
  }

  function dryMs() {
    const p = currentWetProfile();
    const sec = Number.isFinite(drySecondsOverride) ? drySecondsOverride : Number(p?.drySeconds || 180);
    return Math.max(15, Math.min(900, sec)) * 1000;
  }

  function collect(root, limit = 6000) {
    const out = [], queue = root ? [root] : [], seen = new WeakSet();
    while (queue.length && out.length < limit) {
      const o = queue.shift();
      if (!o || typeof o !== 'object' || seen.has(o)) continue;
      seen.add(o); out.push(o);
      if (Array.isArray(o.children)) for (const c of o.children) queue.push(c);
    }
    return out;
  }

  function isTerrainMaterial(material) {
    if (!material || typeof material.onBeforeCompile !== 'function') return false;
    if (material.userData?.waterShadersEnabled) return false;
    const type = material.type || material.constructor?.name || '';
    return ['MeshLambertMaterial', 'MeshStandardMaterial', 'MeshPhongMaterial'].includes(type) && !!material.map;
  }

  function fragmentDecl() {
    return `
// ${MARKER}
#define MF_WET_MAX_CELLS ${MAX_GPU_CELLS}
uniform vec4 uMFWetCells[MF_WET_MAX_CELLS];
uniform int uMFWetCellCount;
uniform float uMFWetRain;
uniform float uMFWetDarken;
uniform float uMFWetSheen;
uniform float uMFWetGloss;
uniform float uMFWetDetail;
uniform float uMFWetRainSide;
uniform float uMFWetTime;
uniform vec3 uMFWetCameraPos;
uniform vec3 uMFWetLightDir;
uniform vec3 uMFWetLightColor;
uniform float uMFWetLightStrength;
varying vec3 vMFWetWorldPos;
varying vec3 vMFWetWorldNormal;

float mfWetnessAtFragment() {
  vec3 n = normalize(vMFWetWorldNormal);
  vec3 blockPos = floor(vMFWetWorldPos - n * 0.025);
  float localWet = 0.0;
  for (int i = 0; i < MF_WET_MAX_CELLS; i++) {
    if (i >= uMFWetCellCount) break;
    vec4 cell = uMFWetCells[i];
    vec3 d = abs(blockPos - cell.xyz);
    float sameBlock = 1.0 - step(0.25, max(d.x, max(d.y, d.z)));
    localWet = max(localWet, cell.w * sameBlock);
  }
  float rainFacing = mix(uMFWetRainSide, 1.0, smoothstep(0.12, 0.82, n.y));
  return clamp(max(localWet, uMFWetRain * rainFacing), 0.0, 1.0);
}
`;
  }

  function wetColorCode() {
    return `
  if (mfWetValue > 0.001) {
    vec3 mfWetN = normalize(vMFWetWorldNormal);
    vec3 mfWetV = normalize(uMFWetCameraPos - vMFWetWorldPos);
    vec3 mfWetL = normalize(uMFWetLightDir);
    vec3 mfWetH = normalize(mfWetV + mfWetL);
    float mfNdH = max(dot(mfWetN, mfWetH), 0.0);
    float mfNdV = max(dot(mfWetN, mfWetV), 0.0);
    float mfSpecPower = mix(22.0, 92.0, uMFWetDetail);
    float mfSpec = pow(mfNdH, mfSpecPower);
    float mfFresnel = pow(1.0 - mfNdV, 3.0);
    float mfMicro = 0.5 + 0.5 * sin(vMFWetWorldPos.x * 14.0 + vMFWetWorldPos.z * 11.0 + uMFWetTime * 1.7);
    float mfRainSpark = mix(1.0, 0.82 + mfMicro * 0.30, uMFWetDetail * uMFWetRain);
    float mfSheen = (mfSpec * 0.86 + mfFresnel * 0.14) * mfRainSpark;
    gl_FragColor.rgb *= 1.0 - uMFWetDarken * mfWetValue;
    gl_FragColor.rgb += uMFWetLightColor * mfSheen * uMFWetSheen * mfWetValue * uMFWetLightStrength;
  }
`;
  }

  function patch(material) {
    if (!isTerrainMaterial(material)) return false;
    const previous = entries.get(material);
    if (previous?.active && material.onBeforeCompile === previous.wrapper) return true;
    if (previous) previous.active = false;

    const baseHook = material.onBeforeCompile;
    const baseKey = material.customProgramCacheKey;
    const entry = { baseHook, baseKey, active: true, wrapper: null };

    const wrapper = function(shader, renderer) {
      baseHook.call(this, shader, renderer);
      if (!entry.active || shader.fragmentShader.includes(MARKER)) return;

      for (const [name, ref] of Object.entries(shared)) shader.uniforms[name] = ref;

      if (shader.vertexShader.includes('#include <common>')) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vMFWetWorldPos;\nvarying vec3 vMFWetWorldNormal;'
        );
      } else {
        shader.vertexShader = 'varying vec3 vMFWetWorldPos;\nvarying vec3 vMFWetWorldNormal;\n' + shader.vertexShader;
      }
      if (shader.vertexShader.includes('#include <begin_vertex>')) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  vMFWetWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vMFWetWorldNormal = normalize(mat3(modelMatrix) * normal);'
        );
      }

      if (shader.fragmentShader.includes('#include <common>')) {
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + fragmentDecl());
      } else {
        shader.fragmentShader = fragmentDecl() + shader.fragmentShader;
      }

      shader.fragmentShader = shader.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, match => `${match}\n  float mfWetValue = mfWetnessAtFragment();`);

      if (shader.fragmentShader.includes('#include <roughnessmap_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, max(0.055, roughnessFactor * (1.0 - 0.78 * uMFWetGloss)), mfWetValue);'
        );
      }

      if (shader.fragmentShader.includes('#include <opaque_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + wetColorCode());
      } else {
        const anchor = shader.fragmentShader.includes('#include <tonemapping_fragment>')
          ? '#include <tonemapping_fragment>'
          : '#include <fog_fragment>';
        if (shader.fragmentShader.includes(anchor)) shader.fragmentShader = shader.fragmentShader.replace(anchor, wetColorCode() + '\n' + anchor);
      }
    };

    entry.wrapper = wrapper;
    material.onBeforeCompile = wrapper;
    material.customProgramCacheKey = function() {
      const base = typeof baseKey === 'function' ? baseKey.call(material) : '';
      return `mf_realistic_wetness_v1_${base}`;
    };
    material.needsUpdate = true;
    entries.set(material, entry);
    return true;
  }

  function patchTerrain(game) {
    const root = game?.gameScene?.chunkMeshes;
    if (!root) return 0;
    const materials = new Set();
    for (const o of collect(root)) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) if (isTerrainMaterial(m)) materials.add(m);
    }
    let count = 0;
    for (const m of materials) if (patch(m)) count++;
    return count;
  }

  function worldProto(world) {
    try {
      let proto = world && Object.getPrototypeOf(world);
      for (let i = 0; i < 7 && proto; i++, proto = Object.getPrototypeOf(proto)) {
        if (typeof proto.getChunk === 'function' || typeof proto.getBlockState === 'function') return proto;
      }
    } catch (_) {}
    return null;
  }

  function getState(world, x, y, z) {
    if (!world || y < 0 || y > 255) return null;
    const proto = worldProto(world);
    if (!proto) return null;
    try {
      const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
      if (typeof proto.getChunk === 'function') {
        const chunk = proto.getChunk.call(world, { x: bx, y: by, z: bz });
        if (!chunk || chunk.isDummyChunk || typeof chunk.getBlockState !== 'function') return null;
        return chunk.getBlockState({ x: bx, y: by, z: bz });
      }
      return proto.getBlockState.call(world, { x: bx, y: by, z: bz });
    } catch (_) { return null; }
  }

  function isWater(game, bs) {
    if (!bs || !bs.id) return false;
    if (knownWaterIds.has(bs.id)) return true;
    try {
      const block = bs.getBlock?.() || bs.block || bs._block || null;
      const name = String(block?.name || block?.id || bs.name || '').toLowerCase();
      if (name === 'water' || name === 'flowing_water' || name === 'water_cauldron' || /(^|_)water($|_)/.test(name)) {
        knownWaterIds.add(bs.id);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function markWet(x, y, z, now, strength = 1) {
    const key = `${x}|${y}|${z}`;
    const old = wetBlocks.get(key);
    if (old) {
      old.lastWet = now;
      old.strength = Math.max(old.strength, strength);
    } else {
      wetBlocks.set(key, { x, y, z, lastWet: now, strength });
    }
  }

  function playerPos(game) {
    const p = game?.player?.pos || game?.player?.position || game?.player?.mesh?.position;
    if (!p) return null;
    const x = Number(p.x), y = Number(p.y), z = Number(p.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
  }

  function rebuildQueue(p, cfg) {
    const bx = Math.floor(p.x), bz = Math.floor(p.z);
    const key = `${bx >> 1}|${bz >> 1}|${cfg.radius}`;
    if (key === scanAnchor && scanQueue.length) return;
    scanAnchor = key;
    scanQueue = [];
    for (let dz = -cfg.radius; dz <= cfg.radius; dz++) {
      for (let dx = -cfg.radius; dx <= cfg.radius; dx++) {
        if (dx * dx + dz * dz > cfg.radius * cfg.radius) continue;
        scanQueue.push({ x: bx + dx, z: bz + dz, d: dx * dx + dz * dz });
      }
    }
    scanQueue.sort((a, b) => a.d - b.d);
    scanCursor = 0;
  }

  const neighbors = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

  function scanWater(game, now) {
    if (!enabled) return;
    const cfg = currentWetProfile(), p = playerPos(game), world = game?.world;
    if (!cfg || !p || !world) return;
    if (now - lastScan < cfg.scanInterval) return;
    lastScan = now;
    rebuildQueue(p, cfg);
    if (!scanQueue.length) return;

    const minY = Math.max(0, Math.floor(p.y) - cfg.verticalRadius);
    const maxY = Math.min(255, Math.floor(p.y) + cfg.verticalRadius);
    const columns = Math.min(cfg.columnsPerScan, scanQueue.length);

    for (let c = 0; c < columns; c++) {
      const col = scanQueue[scanCursor++ % scanQueue.length];
      for (let y = minY; y <= maxY; y++) {
        const bs = getState(world, col.x, y, col.z);
        if (!isWater(game, bs)) continue;
        for (const [dx, dy, dz] of neighbors) {
          const nx = col.x + dx, ny = y + dy, nz = col.z + dz;
          const nb = getState(world, nx, ny, nz);
          if (nb?.id && !isWater(game, nb)) markWet(nx, ny, nz, now, 1);
        }
      }
    }
  }

  function prune(now) {
    const ttl = dryMs();
    for (const [key, cell] of wetBlocks) if (now - cell.lastWet > ttl) wetBlocks.delete(key);
    if (wetBlocks.size <= 2048) return;
    const sorted = [...wetBlocks.entries()].sort((a, b) => a[1].lastWet - b[1].lastWet);
    for (let i = 0; i < sorted.length - 2048; i++) wetBlocks.delete(sorted[i][0]);
  }

  function packCells(game, now) {
    const cfg = currentWetProfile(), p = playerPos(game);
    if (!cfg || !p || now - lastPack < 120) return;
    lastPack = now;
    prune(now);
    const ttl = dryMs();
    const live = [];
    for (const cell of wetBlocks.values()) {
      const age = now - cell.lastWet;
      const moisture = Math.max(0, 1 - age / ttl) * cell.strength;
      if (moisture <= 0.001) continue;
      const dx = cell.x + 0.5 - p.x, dy = cell.y + 0.5 - p.y, dz = cell.z + 0.5 - p.z;
      live.push({ ...cell, moisture, dist2: dx * dx + dy * dy + dz * dz });
    }
    live.sort((a, b) => a.dist2 - b.dist2);
    const count = Math.min(cfg.maxCells, MAX_GPU_CELLS, live.length);
    const arr = shared.uMFWetCells.value;
    arr.fill(0);
    for (let i = 0; i < count; i++) {
      const cell = live[i], o = i * 4;
      arr[o] = cell.x; arr[o + 1] = cell.y; arr[o + 2] = cell.z; arr[o + 3] = cell.moisture;
    }
    shared.uMFWetCellCount.value = count;
  }

  function updateRain(game, now, dt) {
    let rain = 0;
    try { rain = Math.max(0, Math.min(1, Number(game?.world?.getRainStrength?.(1)) || 0)); } catch (_) {}
    rainNow = rain;
    if (rain > 0.015) {
      const response = 1 - Math.exp(-dt * 1.8);
      rainPeak += (rain - rainPeak) * response;
      rainPeak = Math.max(rainPeak, rain * 0.72);
      rainBase = rainPeak;
      lastRainWet = now;
    } else {
      const fade = Math.max(0, 1 - (now - lastRainWet) / dryMs());
      rainPeak = rainBase * fade;
      if (fade <= 0.001) { rainPeak = 0; rainBase = 0; }
    }
    shared.uMFWetRain.value = Math.max(0, Math.min(1, rainPeak));
  }

  function updateLighting(game) {
    const sun = game?.gameScene?.sun;
    const off = sun?.offset;
    const sy = Number(off?.y) || 0;
    const len = Math.hypot(Number(off?.x) || 0, sy, Number(off?.z) || 0) || 1;
    const day = sy >= 0;
    const dir = shared.uMFWetLightDir.value;
    dir.x = (Number(off?.x) || 0) / len * (day ? 1 : -1);
    dir.y = sy / len * (day ? 1 : -1);
    dir.z = (Number(off?.z) || 0) / len * (day ? 1 : -1);
    const elev = Math.max(0, Math.min(1, Math.abs(sy) / len));
    const col = shared.uMFWetLightColor.value;
    if (day) {
      const warm = 1 - Math.min(1, elev * 2.2);
      col.x = 1.0; col.y = 0.98 - warm * 0.16; col.z = 0.92 - warm * 0.28;
      shared.uMFWetLightStrength.value = Math.max(0.18, Number(sun?.sunIntensity?.value) || 0.75);
    } else {
      col.x = 0.38; col.y = 0.47; col.z = 0.66;
      shared.uMFWetLightStrength.value = Math.max(0.08, (Number(sun?.moonIntensity?.value) || 0.35) * 0.65);
    }
    const cp = game?.gameScene?.camera?.position || game?.player?.pos || game?.player?.position;
    if (cp) Object.assign(shared.uMFWetCameraPos.value, { x: Number(cp.x) || 0, y: Number(cp.y) || 0, z: Number(cp.z) || 0 });
  }

  function setProfile(next, drySeconds) {
    profile = next || profile;
    if (Number.isFinite(Number(drySeconds))) drySecondsOverride = Math.max(15, Math.min(900, Number(drySeconds)));
    const cfg = currentWetProfile();
    if (!cfg) return;
    shared.uMFWetDarken.value = cfg.darken;
    shared.uMFWetSheen.value = cfg.sheen;
    shared.uMFWetGloss.value = cfg.gloss;
    shared.uMFWetDetail.value = cfg.detail;
    shared.uMFWetRainSide.value = cfg.rainSide;
    scanAnchor = '';
  }

  function update(game, now = performance.now()) {
    if (!enabled || !game) return;
    const dt = Math.max(0, Math.min(0.1, (now - lastUpdate) / 1000));
    lastUpdate = now;
    shared.uMFWetTime.value = now / 1000;
    updateRain(game, now, dt);
    updateLighting(game);
    scanWater(game, now);
    packCells(game, now);
  }

  function scan(game) {
    if (!enabled || !game) return 0;
    patchTerrain(game);
    scanWater(game, performance.now());
    return entries.size;
  }

  function restore() {
    enabled = false;
    for (const [material, entry] of entries) {
      entry.active = false;
      try {
        if (material.onBeforeCompile === entry.wrapper) material.onBeforeCompile = entry.baseHook;
        if (material.onBeforeCompile === entry.baseHook) material.customProgramCacheKey = entry.baseKey;
        material.needsUpdate = true;
      } catch (_) {}
    }
    entries.clear();
    wetBlocks.clear();
    shared.uMFWetCellCount.value = 0;
    shared.uMFWetRain.value = 0;
    rainPeak = 0;
    rainBase = 0;
    rainNow = 0;
    scanQueue = [];
    scanAnchor = '';
  }

  function enable() { enabled = true; lastUpdate = performance.now(); }

  W.MF_RealisticWetness = Object.freeze({
    scan, update, setProfile, enable, restore, destroy: restore,
    getState: () => ({
      patchedMaterials: entries.size,
      cachedWetBlocks: wetBlocks.size,
      gpuWetBlocks: shared.uMFWetCellCount.value,
      rainWetness: shared.uMFWetRain.value,
      rainStrength: rainNow,
      drySeconds: drySecondsOverride
    })
  });
})();
