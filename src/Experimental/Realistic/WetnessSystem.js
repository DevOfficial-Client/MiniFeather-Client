(() => {
  'use strict';

  const W = globalThis;
  const MARKER = 'MF_REALISTIC_WETNESS_V2';
  const PUDDLE_MARKER = 'MF_REALISTIC_PUDDLES_V1';
  const MAX_GPU_CELLS = 64;
  const PUDDLE_EPSILON = 0.006;

  try { W.MF_RealisticWetness?.destroy?.(); } catch (_) {}

  const entries = new Map();
  const wetBlocks = new Map();
  const puddles = new Map();
  const knownWaterIds = new Set();
  const blockNameCache = new Map();

  let profile = W.MF_RealisticProfiles?.get?.('medium');
  let drySecondsOverride = 180;
  let scanQueue = [];
  let scanCursor = 0;
  let puddleScanCursor = 0;
  let scanAnchor = '';
  let lastScan = 0;
  let lastPuddleScan = 0;
  let lastPack = 0;
  let lastPuddleBuild = 0;
  let lastUpdate = performance.now();
  let lastRainWet = performance.now();
  let rainPeak = 0;
  let rainBase = 0;
  let rainNow = 0;
  let enabled = true;

  const puddleVisual = {
    scene: null,
    referenceMesh: null,
    sourceMaterial: null,
    material: null,
    mesh: null,
    geometry: null,
    visible: [],
    standing: false,
    standingKey: '',
    lastStepAt: 0,
    lastPlayerPos: null,
    impactPos: { x: 0, y: -9999, z: 0 },
    impactTime: -9999
  };

  const shared = {
    uMFWetCells: { value: new Float32Array(MAX_GPU_CELLS * 4) },
    uMFWetCellCount: { value: 0 },
    uMFWetRain: { value: 0 },
    uMFWetDarken: { value: 0.14 },
    uMFWetSaturation: { value: 0.07 },
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

  const puddleUniforms = {
    uMFPuddleTime: { value: 0 },
    uMFPuddleCameraPos: { value: { x: 0, y: 0, z: 0 } },
    uMFPuddleLightDir: { value: { x: 0.3, y: 0.8, z: 0.2 } },
    uMFPuddleLightColor: { value: { x: 1.0, y: 0.97, z: 0.90 } },
    uMFPuddleLightStrength: { value: 1.0 },
    uMFPuddleOpacity: { value: 0.24 },
    uMFPuddleReflection: { value: 0.24 },
    uMFPuddleRipple: { value: 0.25 },
    uMFPuddleDetail: { value: 0.35 },
    uMFPuddleTint: { value: { x: 0.26, y: 0.47, z: 0.56 } },
    uMFPuddleImpactPos: { value: puddleVisual.impactPos },
    uMFPuddleImpactTime: { value: -9999 }
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
    let head = 0;
    while (head < queue.length && out.length < limit) {
      const o = queue[head++]; // shift() era O(n) por nodo → spikes
      if (!o || typeof o !== 'object' || seen.has(o)) continue;
      seen.add(o);
      out.push(o);
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
uniform float uMFWetSaturation;
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

    float mfLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor.rgb = mix(vec3(mfLuma), gl_FragColor.rgb, 1.0 + uMFWetSaturation * mfWetValue);
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
      return `mf_realistic_wetness_v2_${base}`;
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
      if (!puddleVisual.referenceMesh && o?.isMesh && o.geometry?.attributes?.position && list.some(isTerrainMaterial)) {
        puddleVisual.referenceMesh = o;
        puddleVisual.sourceMaterial = list.find(isTerrainMaterial) || null;
      }
    }
    let count = 0;
    for (const m of materials) if (patch(m)) count++;
    return count;
  }

  // Memoizado: sin esto se caminaban hasta 7 prototipos por CADA lectura
  // de bloque (cientos por scan de lluvia).
  const worldProtoCache = new WeakMap();
  function worldProto(world) {
    if (!world) return null;
    if (worldProtoCache.has(world)) return worldProtoCache.get(world);
    let found = null;
    try {
      let proto = Object.getPrototypeOf(world);
      for (let i = 0; i < 7 && proto; i++, proto = Object.getPrototypeOf(proto)) {
        if (typeof proto.getChunk === 'function' || typeof proto.getBlockState === 'function') { found = proto; break; }
      }
    } catch (_) {}
    try { worldProtoCache.set(world, found); } catch (_) {}
    return found;
  }

  // Objeto scratch reutilizado (antes: un literal {x,y,z} por lectura)
  const scratchPos = { x: 0, y: 0, z: 0 };

  function getState(world, x, y, z) {
    if (!world || y < 0 || y > 255) return null;
    const proto = worldProto(world);
    if (!proto) return null;
    try {
      const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
      scratchPos.x = bx; scratchPos.y = by; scratchPos.z = bz;
      if (typeof proto.getChunk === 'function') {
        const chunk = proto.getChunk.call(world, scratchPos);
        if (!chunk || chunk.isDummyChunk || typeof chunk.getBlockState !== 'function') return null;
        return chunk.getBlockState(scratchPos);
      }
      return proto.getBlockState.call(world, scratchPos);
    } catch (_) { return null; }
  }

  function blockName(bs) {
    if (!bs) return '';
    const id = Number(bs.id);
    if (Number.isFinite(id) && blockNameCache.has(id)) return blockNameCache.get(id);
    let name = '';
    try {
      const block = bs.getBlock?.() || bs.block || bs._block || null;
      name = String(block?.name || block?.id || bs.name || '').toLowerCase();
    } catch (_) {}
    if (Number.isFinite(id) && name) blockNameCache.set(id, name);
    return name;
  }

  function isWater(game, bs) {
    if (!bs || !bs.id) return false;
    if (knownWaterIds.has(bs.id)) return true;
    const name = blockName(bs);
    if (name === 'water' || name === 'flowing_water' || name === 'water_cauldron' || /(^|_)water($|_)/.test(name)) {
      knownWaterIds.add(bs.id);
      return true;
    }
    return false;
  }

  function isAirLike(bs) {
    if (!bs || !bs.id) return true;
    const n = blockName(bs);
    return !n || /(^|_)(air|cave_air|void_air)$/.test(n);
  }

  function isLava(bs) {
    const n = blockName(bs);
    return n === 'lava' || n === 'flowing_lava' || /(^|_)lava($|_)/.test(n);
  }

  function isSurfaceSolid(game, bs) {
    if (!bs || !bs.id || isWater(game, bs) || isLava(bs)) return false;
    const n = blockName(bs);
    if (!n) return true;
    if (/air|flower|fern|vine|torch|sapling|leaves|grass(?!_block)|mushroom|rail|carpet|button|pressure_plate|sign|banner|candle|crop|wheat|sugar_cane|bamboo|snow_layer|web|fire/.test(n)) return false;
    return true;
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
    const radius = Math.max(cfg.radius, cfg.puddleRadius || cfg.radius);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        scanQueue.push({ x: bx + dx, z: bz + dz, d: dx * dx + dz * dz });
      }
    }
    scanQueue.sort((a, b) => a.d - b.d);
    scanCursor = 0;
    puddleScanCursor = 0;
  }

  const neighbors = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const cardinal = [[1,0],[-1,0],[0,1],[0,-1]];

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
      if (col.d > cfg.radius * cfg.radius) continue;
      for (let y = minY; y <= maxY; y++) {
        const bs = getState(world, col.x, y, col.z);
        if (!isWater(game, bs)) continue;
        for (const [dx, dy, dz] of neighbors) {
          const nx = col.x + dx, ny = y + dy, nz = col.z + dz;
          const nb = getState(world, nx, ny, nz);
          if (isSurfaceSolid(game, nb)) markWet(nx, ny, nz, now, 1);
        }
      }
    }
  }

  function findSurface(game, world, x, z, centerY, range) {
    const top = Math.min(254, Math.floor(centerY) + range);
    const bottom = Math.max(0, Math.floor(centerY) - range);
    for (let y = top; y >= bottom; y--) {
      const base = getState(world, x, y, z);
      if (!isSurfaceSolid(game, base)) continue;
      const above = getState(world, x, y + 1, z);
      if (isAirLike(above)) return { y, base };
    }
    return null;
  }

  function openToRain(world, x, y, z, probe) {
    for (let i = 1; i <= probe; i++) {
      const bs = getState(world, x, y + i, z);
      if (!isAirLike(bs)) return false;
    }
    return true;
  }

  function hash2(x, z) {
    let h = Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(z | 0, 0x119de1f3) ^ 0x6d2b79f5;
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function puddleCandidate(game, world, x, z, p, cfg) {
    const surface = findSurface(game, world, x, z, p.y, cfg.verticalRadius + 2);
    if (!surface) return null;
    const y = surface.y;
    if (!openToRain(world, x, y + 1, z, cfg.puddleSkyProbe)) return null;

    let lower = 0, same = 0, higher = 0;
    for (const [dx, dz] of cardinal) {
      const n = findSurface(game, world, x + dx, z + dz, y, 2);
      if (!n) { lower++; continue; }
      if (n.y < y) lower++;
      else if (n.y === y) same++;
      else higher++;
    }
    if (lower > 0) return null;
    if (same + higher < 3) return null;

    const basinBoost = 1 + higher * 0.35;
    const chance = Math.min(0.92, cfg.puddleDensity * basinBoost);
    if (hash2(x, z) > chance) return null;

    return { x, y, z, same, higher };
  }

  function scanRainPuddles(game, now) {
    if (!enabled) return;
    const cfg = currentWetProfile(), p = playerPos(game), world = game?.world;
    if (!cfg || !p || !world || !cfg.puddles) return;
    if (rainNow < cfg.puddleRainThreshold) return;
    if (now - lastPuddleScan < cfg.puddleScanInterval) return;

    const elapsed = lastPuddleScan ? Math.min(2.5, (now - lastPuddleScan) / 1000) : cfg.puddleScanInterval / 1000;
    lastPuddleScan = now;
    rebuildQueue(p, cfg);
    if (!scanQueue.length) return;

    const columns = Math.min(cfg.puddleColumnsPerScan, scanQueue.length);
    for (let c = 0; c < columns; c++) {
      const col = scanQueue[puddleScanCursor++ % scanQueue.length];
      if (col.d > cfg.puddleRadius * cfg.puddleRadius) continue;
      const candidate = puddleCandidate(game, world, col.x, col.z, p, cfg);
      if (!candidate) continue;

      const key = `${candidate.x}|${candidate.y}|${candidate.z}`;
      let cell = puddles.get(key);
      if (!cell) {
        cell = {
          ...candidate,
          key,
          amount: 0,
          lastWet: now,
          lastSeen: now,
          seed: hash2(candidate.x + 7919, candidate.z - 3571)
        };
        puddles.set(key, cell);
      }

      const basinFactor = Math.min(1.35, 0.88 + candidate.higher * 0.12);
      cell.amount = Math.min(1, cell.amount + rainNow * cfg.puddleFillRate * elapsed * basinFactor);
      cell.lastWet = now;
      cell.lastSeen = now;
      markWet(candidate.x, candidate.y, candidate.z, now, Math.min(1, 0.55 + cell.amount * 0.45));
    }
  }

  function prune(now) {
    const ttl = dryMs();
    for (const [key, cell] of wetBlocks) if (now - cell.lastWet > ttl) wetBlocks.delete(key);
    for (const [key, cell] of puddles) {
      if (now - cell.lastWet > ttl || cell.amount <= 0.001) puddles.delete(key);
    }
    // El sort de desborde solo cuando de verdad se desborda (antes: cada
    // 120ms se evaluaban spreads de 2048+ entradas aunque hiciera falta)
    if (wetBlocks.size > 2048) {
      const sorted = [...wetBlocks.entries()].sort((a, b) => a[1].lastWet - b[1].lastWet);
      for (let i = 0; i < sorted.length - 2048; i++) wetBlocks.delete(sorted[i][0]);
    }
    if (puddles.size > 256) {
      const sorted = [...puddles.entries()].sort((a, b) => a[1].lastWet - b[1].lastWet);
      for (let i = 0; i < sorted.length - 256; i++) puddles.delete(sorted[i][0]);
    }
  }

  // Buffer reutilizado: antes se alocaba un objeto spread por celda viva
  // (~2048) + sort completo cada 120ms → presión de GC constante.
  const packScratch = [];

  function packCells(game, now) {
    const cfg = currentWetProfile(), p = playerPos(game);
    if (!cfg || !p || now - lastPack < 250) return;
    lastPack = now;
    prune(now);
    const ttl = dryMs();
    let liveCount = 0;
    for (const cell of wetBlocks.values()) {
      const age = now - cell.lastWet;
      const moisture = Math.max(0, 1 - age / ttl) * cell.strength;
      if (moisture <= 0.001) continue;
      const dx = cell.x + 0.5 - p.x, dy = cell.y + 0.5 - p.y, dz = cell.z + 0.5 - p.z;
      const entry = packScratch[liveCount] || (packScratch[liveCount] = {});
      entry.x = cell.x; entry.y = cell.y; entry.z = cell.z;
      entry.strength = cell.strength; entry.moisture = moisture;
      entry.dist2 = dx * dx + dy * dy + dz * dz;
      liveCount++;
    }
    // Selección top-K por umbral + selección lineal del mínimo (evita el
    // sort O(n log n) de ~2048 items para K=48)
    const maxK = Math.min(cfg.maxCells, MAX_GPU_CELLS);
    const count = Math.min(maxK, liveCount);
    const arr = shared.uMFWetCells.value;
    arr.fill(0);
    const used = usedIdxScratch;
    used.fill(false);
    for (let k = 0; k < count; k++) {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < liveCount; i++) {
        if (used[i]) continue;
        const d = packScratch[i].dist2;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) break;
      used[best] = true;
      const cell = packScratch[best], o = k * 4;
      arr[o] = cell.x;
      arr[o + 1] = cell.y;
      arr[o + 2] = cell.z;
      arr[o + 3] = cell.moisture;
    }
    shared.uMFWetCellCount.value = count;
  }
  const usedIdxScratch = new Array(2048);

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
      if (fade <= 0.001) {
        rainPeak = 0;
        rainBase = 0;
      }
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
      col.x = 1.0;
      col.y = 0.98 - warm * 0.16;
      col.z = 0.92 - warm * 0.28;
      shared.uMFWetLightStrength.value = Math.max(0.18, Number(sun?.sunIntensity?.value) || 0.75);
    } else {
      col.x = 0.38;
      col.y = 0.47;
      col.z = 0.66;
      shared.uMFWetLightStrength.value = Math.max(0.08, (Number(sun?.moonIntensity?.value) || 0.35) * 0.65);
    }

    const cp = game?.gameScene?.camera?.position || game?.player?.pos || game?.player?.position;
    if (cp) Object.assign(shared.uMFWetCameraPos.value, { x: Number(cp.x) || 0, y: Number(cp.y) || 0, z: Number(cp.z) || 0 });

    Object.assign(puddleUniforms.uMFPuddleLightDir.value, dir);
    Object.assign(puddleUniforms.uMFPuddleLightColor.value, col);
    puddleUniforms.uMFPuddleLightStrength.value = shared.uMFWetLightStrength.value;
    Object.assign(puddleUniforms.uMFPuddleCameraPos.value, shared.uMFWetCameraPos.value);
  }

  function findReferenceMesh(game) {
    if (puddleVisual.referenceMesh?.geometry?.attributes?.position && puddleVisual.sourceMaterial) return puddleVisual.referenceMesh;
    const root = game?.gameScene?.chunkMeshes;
    if (!root) return null;
    for (const o of collect(root)) {
      if (!o?.isMesh || !o.geometry?.attributes?.position) continue;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const material = mats.find(isTerrainMaterial);
      if (!material) continue;
      puddleVisual.referenceMesh = o;
      puddleVisual.sourceMaterial = material;
      return o;
    }
    return null;
  }

  function puddleShaderDecl() {
    return `
// ${PUDDLE_MARKER}
uniform float uMFPuddleTime;
uniform vec3 uMFPuddleCameraPos;
uniform vec3 uMFPuddleLightDir;
uniform vec3 uMFPuddleLightColor;
uniform float uMFPuddleLightStrength;
uniform float uMFPuddleOpacity;
uniform float uMFPuddleReflection;
uniform float uMFPuddleRipple;
uniform float uMFPuddleDetail;
uniform vec3 uMFPuddleTint;
uniform vec3 uMFPuddleImpactPos;
uniform float uMFPuddleImpactTime;
varying vec3 vMFPuddleWorldPos;
varying vec2 vMFPuddleUv;
varying float vMFPuddleWet;
varying float vMFPuddleSeed;
`;
  }

  function puddleShadeCode() {
    return `
  {
    vec2 mfUv = vMFPuddleUv * 2.0 - 1.0;
    float mfRadial = length(mfUv * vec2(1.0, 0.94));
    float mfIrregular = 0.055 * sin((mfUv.x + vMFPuddleSeed * 4.1) * 7.0) + 0.045 * sin((mfUv.y - vMFPuddleSeed * 3.7) * 9.0);
    float mfMask = 1.0 - smoothstep(0.72 + mfIrregular, 1.02 + mfIrregular, mfRadial);
    mfMask *= smoothstep(0.10, 0.28, vMFPuddleWet);
    if (mfMask <= 0.004) discard;

    vec3 mfV = normalize(uMFPuddleCameraPos - vMFPuddleWorldPos);
    vec3 mfL = normalize(uMFPuddleLightDir);
    float mfWaveX = sin(vMFPuddleWorldPos.x * 6.5 + uMFPuddleTime * 1.3 + vMFPuddleSeed * 11.0);
    float mfWaveZ = cos(vMFPuddleWorldPos.z * 7.3 - uMFPuddleTime * 1.1 + vMFPuddleSeed * 8.0);
    vec3 mfN = normalize(vec3(-mfWaveX * 0.035 * uMFPuddleDetail, 1.0, -mfWaveZ * 0.035 * uMFPuddleDetail));
    vec3 mfH = normalize(mfV + mfL);
    float mfSpec = pow(max(dot(mfN, mfH), 0.0), mix(34.0, 118.0, uMFPuddleDetail));
    float mfFresnel = pow(1.0 - max(dot(mfN, mfV), 0.0), 4.0);

    float mfImpactAge = uMFPuddleTime - uMFPuddleImpactTime;
    float mfImpactDist = distance(vMFPuddleWorldPos.xz, uMFPuddleImpactPos.xz);
    float mfRingRadius = mfImpactAge * 2.2;
    float mfRing = exp(-pow((mfImpactDist - mfRingRadius) * 9.0, 2.0)) * step(0.0, mfImpactAge) * step(mfImpactAge, 1.15);
    float mfRainRipple = (0.5 + 0.5 * sin(vMFPuddleWorldPos.x * 17.0 + vMFPuddleWorldPos.z * 13.0 + uMFPuddleTime * 4.4 + vMFPuddleSeed * 19.0)) * uMFPuddleRipple * 0.12;

    vec3 mfBase = mix(uMFPuddleTint * 0.72, uMFPuddleTint, 0.42 + 0.58 * vMFPuddleWet);
    vec3 mfReflect = uMFPuddleLightColor * (mfSpec * 0.82 + mfFresnel * 0.34 + mfRing * 0.58 + mfRainRipple);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, mfBase, 0.58);
    gl_FragColor.rgb += mfReflect * uMFPuddleReflection * uMFPuddleLightStrength;
    gl_FragColor.a *= mfMask * uMFPuddleOpacity * mix(0.58, 1.0, vMFPuddleWet);
  }
`;
  }

  function createPuddleMaterial(game) {
    if (puddleVisual.material) return puddleVisual.material;
    const ref = findReferenceMesh(game);
    const source = puddleVisual.sourceMaterial || (Array.isArray(ref?.material) ? ref.material[0] : ref?.material);
    if (!ref || !source) return null;

    let material = null;
    try { material = new source.constructor(); } catch (_) {
      try { material = source.clone(); } catch (_) {}
    }
    if (!material) return null;

    try {
      material.map = null;
      material.alphaMap = null;
      material.lightMap = null;
      material.aoMap = null;
      material.normalMap = null;
      material.bumpMap = null;
      material.displacementMap = null;
      material.emissiveMap = null;
      material.roughnessMap = null;
      material.metalnessMap = null;
      material.vertexColors = false;
      material.transparent = true;
      material.opacity = 1;
      material.alphaTest = 0;
      material.depthTest = true;
      material.depthWrite = false;
      material.side = 2;
      material.fog = true;
      material.toneMapped = source.toneMapped !== false;
      material.polygonOffset = true;
      material.polygonOffsetFactor = -2;
      material.polygonOffsetUnits = -2;
      if ('roughness' in material) material.roughness = 0.14;
      if ('metalness' in material) material.metalness = 0;
      material.color?.set?.(0x5f8fa0);
      material.emissive?.set?.(0x000000);

      const baseHook = material.onBeforeCompile || function() {};
      material.onBeforeCompile = function(shader, renderer) {
        baseHook.call(this, shader, renderer);
        if (shader.fragmentShader.includes(PUDDLE_MARKER)) return;
        for (const [name, refUniform] of Object.entries(puddleUniforms)) shader.uniforms[name] = refUniform;

        const vDecl = `\nattribute vec2 mfPuddleUv;\nattribute float mfPuddleWet;\nattribute float mfPuddleSeed;\nvarying vec3 vMFPuddleWorldPos;\nvarying vec2 vMFPuddleUv;\nvarying float vMFPuddleWet;\nvarying float vMFPuddleSeed;\n`;
        if (shader.vertexShader.includes('#include <common>')) shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>' + vDecl);
        else shader.vertexShader = vDecl + shader.vertexShader;
        if (shader.vertexShader.includes('#include <begin_vertex>')) {
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n  vMFPuddleWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vMFPuddleUv = mfPuddleUv;\n  vMFPuddleWet = mfPuddleWet;\n  vMFPuddleSeed = mfPuddleSeed;'
          );
        }

        if (shader.fragmentShader.includes('#include <common>')) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + puddleShaderDecl());
        else shader.fragmentShader = puddleShaderDecl() + shader.fragmentShader;

        const code = puddleShadeCode();
        if (shader.fragmentShader.includes('#include <opaque_fragment>')) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + code);
        else if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>', code + '\n#include <tonemapping_fragment>');
      };
      material.customProgramCacheKey = () => 'mf_realistic_puddles_v1';
      material.needsUpdate = true;
    } catch (_) {}

    puddleVisual.material = material;
    return material;
  }

  function disposePuddleGeometry() {
    try { puddleVisual.geometry?.dispose?.(); } catch (_) {}
    puddleVisual.geometry = null;
  }

  function buildPuddleGeometry(game, list) {
    const ref = findReferenceMesh(game);
    const refGeo = ref?.geometry;
    if (!refGeo?.attributes?.position?.constructor || !list.length) return null;

    try {
      const Geometry = refGeo.constructor;
      const Attr = refGeo.attributes.position.constructor;
      const geometry = new Geometry();
      const n = list.length;
      const positions = new Float32Array(n * 12);
      const normals = new Float32Array(n * 12);
      const uvs = new Float32Array(n * 8);
      const wet = new Float32Array(n * 4);
      const seeds = new Float32Array(n * 4);
      const indices = new Uint32Array(n * 6);

      for (let i = 0; i < n; i++) {
        const d = list[i];
        const size = d.size;
        const half = size * 0.5;
        const asymX = (d.seed - 0.5) * 0.08;
        const asymZ = (((d.seed * 17.13) % 1) - 0.5) * 0.08;
        const cx = d.x + 0.5 + asymX;
        const cz = d.z + 0.5 + asymZ;
        const y = d.y + 1 + PUDDLE_EPSILON;
        const x0 = cx - half, x1 = cx + half;
        const z0 = cz - half * 0.94, z1 = cz + half * 0.94;
        const p = i * 12, u = i * 8, q = i * 6, b = i * 4;
        positions.set([x0,y,z0, x1,y,z0, x0,y,z1, x1,y,z1], p);
        normals.set([0,1,0, 0,1,0, 0,1,0, 0,1,0], p);
        uvs.set([0,0, 1,0, 0,1, 1,1], u);
        wet.fill(d.moisture, b, b + 4);
        seeds.fill(d.seed, b, b + 4);
        indices.set([b, b + 2, b + 1, b + 2, b + 3, b + 1], q);
      }

      geometry.setAttribute('position', new Attr(positions, 3));
      geometry.setAttribute('normal', new Attr(normals, 3));
      geometry.setAttribute('uv', new Attr(uvs, 2));
      geometry.setAttribute('mfPuddleUv', new Attr(uvs.slice(), 2));
      geometry.setAttribute('mfPuddleWet', new Attr(wet, 1));
      geometry.setAttribute('mfPuddleSeed', new Attr(seeds, 1));
      geometry.setIndex(Array.from(indices));
      geometry.computeBoundingBox?.();
      geometry.computeBoundingSphere?.();
      return geometry;
    } catch (_) { return null; }
  }

  function ensurePuddleMesh(game, list) {
    const scene = game?.gameScene?.scene || game?.scene?.scene || game?.scene;
    const ref = findReferenceMesh(game);
    const material = createPuddleMaterial(game);
    if (!scene?.add || !ref?.constructor || !material) return false;
    puddleVisual.scene = scene;

    const geometry = buildPuddleGeometry(game, list);
    if (!geometry) {
      if (puddleVisual.mesh) puddleVisual.mesh.visible = false;
      puddleVisual.visible = [];
      return false;
    }

    if (!puddleVisual.mesh) {
      try {
        const mesh = new ref.constructor(geometry, material);
        mesh.name = 'MiniFeatherRealisticPuddles';
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;
        mesh.renderOrder = 5;
        mesh.matrixAutoUpdate = true;
        mesh.updateMatrix?.();
        mesh.updateMatrixWorld?.(true);
        puddleVisual.mesh = mesh;
        puddleVisual.geometry = geometry;
        scene.add(mesh);
      } catch (_) {
        try { geometry.dispose?.(); } catch (_) {}
        return false;
      }
    } else {
      const old = puddleVisual.geometry;
      puddleVisual.geometry = geometry;
      puddleVisual.mesh.geometry = geometry;
      puddleVisual.mesh.visible = true;
      try { old?.dispose?.(); } catch (_) {}
    }
    puddleVisual.visible = list;
    return true;
  }

  function rebuildPuddleVisuals(game, now) {
    const cfg = currentWetProfile(), p = playerPos(game);
    if (!cfg || !cfg.puddles || !p || now - lastPuddleBuild < cfg.puddleBuildInterval) return;
    lastPuddleBuild = now;
    prune(now);

    const ttl = dryMs();
    const list = [];
    for (const cell of puddles.values()) {
      const fade = Math.max(0, 1 - (now - cell.lastWet) / ttl);
      const moisture = cell.amount * fade;
      if (moisture < cfg.puddleVisibleThreshold) continue;
      const dx = cell.x + 0.5 - p.x, dz = cell.z + 0.5 - p.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > cfg.puddleRadius * cfg.puddleRadius) continue;
      const t = Math.max(0, Math.min(1, (moisture - cfg.puddleVisibleThreshold) / Math.max(0.001, 1 - cfg.puddleVisibleThreshold)));
      const size = cfg.puddleMinSize + (cfg.puddleMaxSize - cfg.puddleMinSize) * Math.sqrt(t);
      list.push({ ...cell, moisture, dist2, size });
    }
    list.sort((a, b) => a.dist2 - b.dist2 || b.moisture - a.moisture);
    list.length = Math.min(cfg.maxPuddles, list.length);

    if (list.length) ensurePuddleMesh(game, list);
    else {
      puddleVisual.visible = [];
      if (puddleVisual.mesh) puddleVisual.mesh.visible = false;
    }
  }

  function dispatchPuddleContact(cell, moving, entered) {
    const detail = {
      active: true,
      key: cell.key,
      x: cell.x,
      y: cell.y + 1,
      z: cell.z,
      moisture: cell.moisture,
      moving: !!moving,
      entered: !!entered
    };
    try { document.dispatchEvent(new CustomEvent('minifeather:puddle-contact', { detail })); } catch (_) {}
  }

  function dispatchPuddleLeave() {
    try { document.dispatchEvent(new CustomEvent('minifeather:puddle-contact', { detail: { active: false } })); } catch (_) {}
  }

  function updatePuddleCollision(game, now) {
    const p = playerPos(game);
    if (!p) return;
    const prev = puddleVisual.lastPlayerPos;
    const speed = prev ? Math.hypot(p.x - prev.x, p.z - prev.z) : 0;
    puddleVisual.lastPlayerPos = p;

    let hit = null;
    for (const cell of puddleVisual.visible) {
      const half = cell.size * 0.52;
      const cx = cell.x + 0.5, cz = cell.z + 0.5, surfaceY = cell.y + 1;
      if (Math.abs(p.x - cx) <= half && Math.abs(p.z - cz) <= half && p.y >= surfaceY - 0.65 && p.y <= surfaceY + 2.1) {
        hit = cell;
        break;
      }
    }

    const previousKey = puddleVisual.standingKey;
    if (!hit) {
      if (puddleVisual.standing) dispatchPuddleLeave();
      puddleVisual.standing = false;
      puddleVisual.standingKey = '';
      return;
    }

    const entered = hit.key !== previousKey;
    const moving = speed > 0.015;
    puddleVisual.standing = true;
    puddleVisual.standingKey = hit.key;

    if (entered || (moving && now - puddleVisual.lastStepAt > 260)) {
      puddleVisual.lastStepAt = now;
      puddleVisual.impactPos.x = p.x;
      puddleVisual.impactPos.y = hit.y + 1;
      puddleVisual.impactPos.z = p.z;
      puddleVisual.impactTime = now / 1000;
      puddleUniforms.uMFPuddleImpactTime.value = puddleVisual.impactTime;
      dispatchPuddleContact(hit, moving, entered);
    }
  }

  function setProfile(next, drySeconds) {
    profile = next || profile;
    if (Number.isFinite(Number(drySeconds))) drySecondsOverride = Math.max(15, Math.min(900, Number(drySeconds)));
    const cfg = currentWetProfile();
    if (!cfg) return;
    shared.uMFWetDarken.value = cfg.darken;
    shared.uMFWetSaturation.value = cfg.saturation;
    shared.uMFWetSheen.value = cfg.sheen;
    shared.uMFWetGloss.value = cfg.gloss;
    shared.uMFWetDetail.value = cfg.detail;
    shared.uMFWetRainSide.value = cfg.rainSide;
    puddleUniforms.uMFPuddleOpacity.value = cfg.puddleOpacity;
    puddleUniforms.uMFPuddleReflection.value = cfg.puddleReflection;
    puddleUniforms.uMFPuddleRipple.value = cfg.puddleRipple;
    puddleUniforms.uMFPuddleDetail.value = cfg.puddleDetail;
    scanAnchor = '';
  }

  function update(game, now = performance.now()) {
    if (!enabled || !game) return;
    const dt = Math.max(0, Math.min(0.1, (now - lastUpdate) / 1000));
    lastUpdate = now;
    shared.uMFWetTime.value = now / 1000;
    puddleUniforms.uMFPuddleTime.value = now / 1000;
    // Gate de actividad: sin humedad, sin charcos y sin lluvia no hay
    // nada que hacer cada frame (antes: scans + lighting siempre).
    const active = wetBlocks.size > 0 || puddles.size > 0 || rainPeak > 0.001;
    if (!active) {
      // Aún así arrastrar la lluvia por si empieza a llover
      updateRain(game, now, dt);
      if (rainPeak <= 0.001 && shared.uMFWetCellCount.value !== 0) {
        shared.uMFWetCellCount.value = 0;
      }
      return;
    }
    updateRain(game, now, dt);
    updateLighting(game);
    scanWater(game, now);
    scanRainPuddles(game, now);
    packCells(game, now);
    rebuildPuddleVisuals(game, now);
    updatePuddleCollision(game, now);
  }

  function scan(game) {
    if (!enabled || !game) return 0;
    patchTerrain(game);
    scanWater(game, performance.now());
    return entries.size;
  }

  function removePuddleVisuals() {
    try { puddleVisual.scene?.remove?.(puddleVisual.mesh); } catch (_) {}
    try { puddleVisual.geometry?.dispose?.(); } catch (_) {}
    try { puddleVisual.material?.dispose?.(); } catch (_) {}
    puddleVisual.scene = null;
    puddleVisual.referenceMesh = null;
    puddleVisual.sourceMaterial = null;
    puddleVisual.material = null;
    puddleVisual.mesh = null;
    puddleVisual.geometry = null;
    puddleVisual.visible = [];
    puddleVisual.standing = false;
    puddleVisual.standingKey = '';
    puddleVisual.lastPlayerPos = null;
    puddleVisual.impactPos.x = 0;
    puddleVisual.impactPos.y = -9999;
    puddleVisual.impactPos.z = 0;
    puddleVisual.impactTime = -9999;
    puddleUniforms.uMFPuddleImpactTime.value = -9999;
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
    puddles.clear();
    shared.uMFWetCellCount.value = 0;
    shared.uMFWetRain.value = 0;
    rainPeak = 0;
    rainBase = 0;
    rainNow = 0;
    scanQueue = [];
    scanAnchor = '';
    removePuddleVisuals();
  }

  function enable() {
    enabled = true;
    lastUpdate = performance.now();
  }

  W.MF_RealisticWetness = Object.freeze({
    scan,
    update,
    setProfile,
    enable,
    restore,
    destroy: restore,
    isPlayerOnPuddle: () => puddleVisual.standing,
    getPuddleContact: () => puddleVisual.standing ? puddleVisual.standingKey : null,
    getState: () => ({
      patchedMaterials: entries.size,
      cachedWetBlocks: wetBlocks.size,
      gpuWetBlocks: shared.uMFWetCellCount.value,
      rainWetness: shared.uMFWetRain.value,
      rainStrength: rainNow,
      drySeconds: drySecondsOverride,
      puddlesCached: puddles.size,
      puddlesVisible: puddleVisual.visible.length,
      standingOnPuddle: puddleVisual.standing,
      puddleKey: puddleVisual.standingKey || null
    })
  });
})();
