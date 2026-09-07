(function () {
'use strict';

const W = globalThis;
const EVENT_CONFIG = 'minifeather:interactive-vegetation-config';
const TAG = '[MiniFeather 3D Grass Physics]';
const VERSION = '3.2.0-extreme';
const TRAIL_COUNT = 4;
const VEGETATION_PASS_THROUGH = new Set([
  'grass', 'fern', 'tall_grass', 'large_fern', 'deadbush',
  'poppy', 'dandelion', 'blue_orchid', 'allium', 'azure_bluet',
  'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy'
]);
const FLOWER_NAMES = new Set([
  'poppy', 'dandelion', 'blue_orchid', 'allium', 'azure_bluet',
  'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy'
]);
const PROFILES = Object.freeze({
  low: Object.freeze({
    radius: 7.5,
    maxBlades: 780,
    segments: 3,
    rebuildDistance: 4.6,
    rebuildInterval: 1750,
    near: 3,
    mid: 2,
    far: 1,
    nearDistance: 3.2,
    midDistance: 5.4,
    quality: 0,
    heightMin: 0.36,
    heightRange: 0.34,
    widthMin: 0.024,
    widthRange: 0.032,
    flowerDensity: 0.55
  }),
  medium: Object.freeze({
    radius: 10.5,
    maxBlades: 1650,
    segments: 4,
    rebuildDistance: 4.0,
    rebuildInterval: 1400,
    near: 6,
    mid: 4,
    far: 2,
    nearDistance: 3.8,
    midDistance: 7.0,
    quality: 1,
    heightMin: 0.38,
    heightRange: 0.46,
    widthMin: 0.024,
    widthRange: 0.040,
    flowerDensity: 0.68
  }),
  high: Object.freeze({
    radius: 13.0,
    maxBlades: 3000,
    segments: 5,
    rebuildDistance: 3.6,
    rebuildInterval: 1200,
    near: 10,
    mid: 7,
    far: 3,
    nearDistance: 4.2,
    midDistance: 8.4,
    quality: 2,
    heightMin: 0.34,
    heightRange: 0.58,
    widthMin: 0.022,
    widthRange: 0.044,
    flowerDensity: 0.78
  }),
  extreme: Object.freeze({
    // Extreme keeps the expensive density close to the player and falls off hard.
    // One regional mesh + GPU deformation is still substantially cheaper than one
    // object/model per blade.
    radius: 14.5,
    maxBlades: 5200,
    segments: 6,
    rebuildDistance: 4.2,
    rebuildInterval: 1650,
    near: 18,
    mid: 11,
    far: 4,
    nearDistance: 5.0,
    midDistance: 9.0,
    quality: 3,
    heightMin: 0.24,
    heightRange: 0.82,
    widthMin: 0.018,
    widthRange: 0.032,
    flowerDensity: 0.84
  })
});

try { W.MF_InteractiveVegetationExperimental?.destroy?.(); } catch (_) {}

const state = {
  enabled: false,
  level: 'medium',
  profile: PROFILES.medium,
  destroyed: false,
  game: null,
  world: null,
  scene: null,
  referenceMesh: null,
  referenceMaterial: null,
  mesh: null,
  geometry: null,
  material: null,
  frame: 0,
  timer: 0,
  buildToken: 0,
  building: false,
  lastBuildX: Number.NaN,
  lastBuildZ: Number.NaN,
  lastBuildAt: 0,
  lastGameScan: 0,
  serverSalt: 0,
  stateNameCache: new Map(),
  lastPlayerX: Number.NaN,
  lastPlayerY: Number.NaN,
  lastPlayerZ: Number.NaN,
  lastPlayerTime: 0,
  velX: 0,
  velZ: 0,
  lastTrailX: Number.NaN,
  lastTrailZ: Number.NaN,
  trailCursor: 0,
  nativeRecords: new Set(),
  nativePatched: new WeakSet(),
  lastNativeScan: 0,
  lastWeatherCheck: 0
};

function v2(x = 0, y = 0) { return { x, y }; }
function v3(x = 0, y = 0, z = 0) { return { x, y, z }; }
function v4(x = 0, y = 0, z = 0, w = -9999) { return { x, y, z, w }; }

const uniforms = {
  time: { value: 0 },
  playerPos: { value: v3(1e6, 1e6, 1e6) },
  playerVelocity: { value: v2() },
  rainStrength: { value: 0 },
  windStrength: { value: 1 },
  quality: { value: 1 },
  replaceNativeGrass: { value: 0 },
  trail0: { value: v4() },
  trail1: { value: v4() },
  trail2: { value: v4() },
  trail3: { value: v4() }
};
const trails = [uniforms.trail0.value, uniforms.trail1.value, uniforms.trail2.value, uniforms.trail3.value];

function getGame(force = false) {
  const now = performance.now();
  if (!force && state.game?.player && state.game?.world && now - state.lastGameScan < 900) return state.game;
  state.lastGameScan = now;

  for (const candidate of [W.miniblox, W.__MINIBLOX_GAME__, state.game]) {
    if (candidate?.player && candidate?.world) {
      state.game = candidate;
      return candidate;
    }
  }

  try {
    const react = document.querySelector('#react');
    if (react) {
      for (const root of Object.values(react)) {
        const game = root?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player && game?.world) {
          W.__MINIBLOX_GAME__ = game;
          state.game = game;
          return game;
        }
      }
    }
  } catch (_) {}
  return null;
}

function getScene(game) {
  return game?.gameScene?.scene || game?.scene?.scene || game?.gameScene || game?.scene || null;
}

function getWorldProto(world) {
  let proto = Object.getPrototypeOf(world);
  for (let i = 0; i < 7 && proto; i++, proto = Object.getPrototypeOf(proto)) {
    if (typeof proto.getChunkByID === 'function') return proto;
  }
  return null;
}

function hashString(text) {
  let h = 2166136261 >>> 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function computeServerSalt(game) {
  let key = '';
  try { key = game?.serverInfo?.serverId || game?.serverInfo?.serverName || game?.serverInfo?.worldType || ''; } catch (_) {}
  try { key += `|${game?.world?.dimensionId ?? 0}`; } catch (_) {}
  return hashString(key || 'miniblox');
}

function hash32(x, z, k = 0) {
  let h = state.serverSalt ^ Math.imul((x | 0) + k * 1013, 0x45d9f3b) ^ Math.imul((z | 0) - k * 9176, 0x119de1f3);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function rand01(x, z, k = 0) { return hash32(x, z, k) / 4294967296; }

function getWaveAttribute(geometry) {
  try { return geometry?.getAttribute?.('wave') || geometry?.attributes?.wave || null; } catch (_) { return null; }
}

function findReferenceMesh(scene) {
  if (state.referenceMesh?.geometry?.attributes?.position && state.referenceMaterial) return state.referenceMesh;
  if (!scene?.traverse) return null;

  let best = null;
  try {
    scene.traverse(obj => {
      if (best || !obj?.isMesh || !obj.geometry?.attributes?.position || !obj.material) return;
      if (!getWaveAttribute(obj.geometry)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const mat = mats.find(m => m && typeof m.clone === 'function') || mats[0];
      if (mat) best = { mesh: obj, material: mat };
    });
  } catch (_) {}

  if (!best) {
    try {
      scene.traverse(obj => {
        if (best || !obj?.isMesh || !obj.geometry?.attributes?.position || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const mat = mats.find(m => m && typeof m.clone === 'function') || mats[0];
        if (mat) best = { mesh: obj, material: mat };
      });
    } catch (_) {}
  }

  state.referenceMesh = best?.mesh || null;
  state.referenceMaterial = best?.material || null;
  return state.referenceMesh;
}

function blockNameAt(chunk, stateId, wx, y, wz) {
  if (state.stateNameCache.has(stateId)) return state.stateNameCache.get(stateId);
  let name = '';
  try {
    const bs = chunk.getBlockState?.({ x: wx, y, z: wz });
    name = String(bs?.getBlock?.()?.name || bs?.block?.name || '').toLowerCase();
  } catch (_) {}
  if (state.stateNameCache.size < 2048) state.stateNameCache.set(stateId, name);
  return name;
}

function topGrassInColumn(chunk, lx, lz, cx, cz) {
  if (!chunk?.cells) return null;
  let cover = '';
  let skippedVegetation = 0;
  for (let ci = chunk.cells.length - 1; ci >= 0; ci--) {
    const cell = chunk.cells[ci];
    if (!cell?.bitArray) continue;
    const yBase = Number(cell.yBase) || 0;
    for (let ly = 15; ly >= 0; ly--) {
      const index = (ly << 8) | (lz << 4) | lx;
      let raw = 0;
      try { raw = cell.bitArray.get(index); } catch (_) { continue; }
      const id = cell.palette?.length ? cell.palette[raw] : raw;
      if (!id) continue;
      const wx = cx * 16 + lx;
      const wz = cz * 16 + lz;
      const y = yBase + ly;
      const name = blockNameAt(chunk, Number(id) || 0, wx, y, wz);

      // MiniBlox's native grass/flowers are real replaceable blocks above grass_block.
      // Skip those visual plants so the procedural replacement can still be generated
      // on the grass block underneath instead of treating the plant itself as terrain.
      if (VEGETATION_PASS_THROUGH.has(name) && skippedVegetation < 3) {
        if (!cover) cover = name;
        skippedVegetation++;
        continue;
      }

      return name === 'grass_block' ? { x: wx, y, z: wz, cover } : null;
    }
  }
  return null;
}

function collectGrassSurfaces(game, centerX, centerZ) {
  const world = game?.world;
  const proto = world && getWorldProto(world);
  if (!world || !proto) return [];

  const radius = state.profile.radius;
  const minX = Math.floor(centerX - radius), maxX = Math.floor(centerX + radius);
  const minZ = Math.floor(centerZ - radius), maxZ = Math.floor(centerZ + radius);
  const minCx = Math.floor(minX / 16), maxCx = Math.floor(maxX / 16);
  const minCz = Math.floor(minZ / 16), maxCz = Math.floor(maxZ / 16);
  const out = [];

  for (let cz = minCz; cz <= maxCz; cz++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      let chunk = null;
      try {
        if (typeof proto.isChunkLoaded === 'function' && !proto.isChunkLoaded.call(world, cx, cz)) continue;
        chunk = proto.getChunkByID.call(world, cx, cz);
      } catch (_) { continue; }
      if (!chunk?.cells) continue;

      const lx0 = Math.max(0, minX - cx * 16), lx1 = Math.min(15, maxX - cx * 16);
      const lz0 = Math.max(0, minZ - cz * 16), lz1 = Math.min(15, maxZ - cz * 16);
      for (let lz = lz0; lz <= lz1; lz++) {
        for (let lx = lx0; lx <= lx1; lx++) {
          const wx = cx * 16 + lx + 0.5;
          const wz = cz * 16 + lz + 0.5;
          if (Math.hypot(wx - centerX, wz - centerZ) > radius + 0.7) continue;
          const top = topGrassInColumn(chunk, lx, lz, cx, cz);
          if (top) out.push(top);
        }
      }
    }
  }
  return out;
}

function bladeCountForDistance(d, surface) {
  const p = state.profile;
  let count = d < p.nearDistance ? p.near : d < p.midDistance ? p.mid : p.far;

  // Extreme deliberately avoids a uniform carpet. Density changes per block while
  // staying high enough near the player to visually cover most of the grass top.
  if (state.level === 'extreme' && surface) {
    const patch = 0.78 + rand01(surface.x, surface.z, 707) * 0.56;
    count = Math.max(2, Math.round(count * patch));
  }

  if (surface?.cover && FLOWER_NAMES.has(surface.cover)) count = Math.max(1, Math.round(count * p.flowerDensity));
  return count;
}

function makeBladeGeometry(referenceGeometry, surfaces, centerX, centerZ) {
  if (!referenceGeometry?.attributes?.position || !surfaces?.length) return null;
  const Geometry = referenceGeometry.constructor;
  const Attr = referenceGeometry.attributes.position.constructor;
  const profile = state.profile;
  const segments = profile.segments;
  const rows = segments + 1;
  const vertsPerBlade = rows * 2;
  const indicesPerBlade = segments * 6;

  let planned = 0;
  for (const s of surfaces) planned += bladeCountForDistance(Math.hypot(s.x + 0.5 - centerX, s.z + 0.5 - centerZ), s);
  const bladeTotal = Math.min(profile.maxBlades, planned);
  if (!bladeTotal) return null;

  const positions = new Float32Array(bladeTotal * vertsPerBlade * 3);
  const normals = new Float32Array(bladeTotal * vertsPerBlade * 3);
  const uvs = new Float32Array(bladeTotal * vertsPerBlade * 2);
  const tips = new Float32Array(bladeTotal * vertsPerBlade);
  const seeds = new Float32Array(bladeTotal * vertsPerBlade);
  const roots = new Float32Array(bladeTotal * vertsPerBlade * 2);
  const baseYs = new Float32Array(bladeTotal * vertsPerBlade);
  const flexes = new Float32Array(bladeTotal * vertsPerBlade);
  const indices = new Uint32Array(bladeTotal * indicesPerBlade);

  let blade = 0;
  outer: for (const surface of surfaces) {
    const dist = Math.hypot(surface.x + 0.5 - centerX, surface.z + 0.5 - centerZ);
    const count = bladeCountForDistance(dist, surface);
    for (let j = 0; j < count; j++) {
      if (blade >= bladeTotal) break outer;
      const r0 = rand01(surface.x, surface.z, j * 11 + 1);
      const r1 = rand01(surface.x, surface.z, j * 11 + 2);
      const r2 = rand01(surface.x, surface.z, j * 11 + 3);
      const r3 = rand01(surface.x, surface.z, j * 11 + 4);
      const r4 = rand01(surface.x, surface.z, j * 11 + 5);
      const r5 = rand01(surface.x, surface.z, j * 11 + 6);
      const r6 = rand01(surface.x, surface.z, j * 11 + 7);
      const r7 = rand01(surface.x, surface.z, j * 11 + 8);
      const r8 = rand01(surface.x, surface.z, j * 11 + 9);

      const extreme = state.level === 'extreme';
      const margin = extreme ? 0.018 : state.level === 'high' ? 0.045 : 0.07;
      let rootX, rootZ;
      if (extreme) {
        // Stratified jitter fills the block without looking like either a grid or a
        // random clump. Every block gets a slightly different local pattern.
        const countGrid = Math.max(2, Math.ceil(Math.sqrt(count)));
        const gx = j % countGrid;
        const gz = Math.floor(j / countGrid) % countGrid;
        const span = 1 - margin * 2;
        rootX = surface.x + margin + ((gx + 0.12 + r0 * 0.76) / countGrid) * span;
        rootZ = surface.z + margin + ((gz + 0.12 + r1 * 0.76) / countGrid) * span;
        // Small domain warp stops neighboring blocks from lining up visually.
        rootX += (r6 - 0.5) * 0.035;
        rootZ += (r5 - 0.5) * 0.035;
      } else {
        rootX = surface.x + margin + r0 * (1 - margin * 2);
        rootZ = surface.z + margin + r1 * (1 - margin * 2);
      }
      const baseY = surface.y + 1.004;
      const angle = r2 * Math.PI * 2;
      const bladeDirX = Math.cos(angle), bladeDirZ = Math.sin(angle);
      const ribbonX = -bladeDirZ, ribbonZ = bladeDirX;

      let height;
      let flex = 1.0;
      if (extreme) {
        // Three overlapping height populations. The per-block patch value nudges the
        // mix so a meadow contains short, medium and tall areas instead of clones.
        const patchBias = rand01(surface.x, surface.z, 991) - 0.5;
        const type = Math.max(0, Math.min(0.999, r7 + patchBias * 0.12));
        if (type < 0.30) {
          height = 0.22 + r3 * 0.22;      // short grass
          flex = 0.72 + r8 * 0.16;
        } else if (type < 0.76) {
          height = 0.43 + r3 * 0.31;      // medium grass
          flex = 0.90 + r8 * 0.20;
        } else {
          height = 0.74 + r3 * 0.34;      // tall grass
          flex = 1.08 + r8 * 0.24;
        }
      } else {
        height = profile.heightMin + r3 * profile.heightRange;
        flex = 0.82 + r8 * 0.24;
      }
      const width = profile.widthMin + r4 * profile.widthRange * (extreme ? (0.78 + r8 * 0.40) : 1.0);
      const lean = (r5 - 0.5) * (extreme ? 0.17 : state.level === 'high' ? 0.13 : state.level === 'medium' ? 0.10 : 0.075);
      const curveSide = (r6 - 0.5) * (extreme ? 0.075 : state.level === 'high' ? 0.055 : 0.035);
      const seed = r2;

      const vb = blade * vertsPerBlade;
      for (let row = 0; row < rows; row++) {
        const t = row / segments;
        const curve = t * t;
        const tipNarrow = 1.0 - t * 0.92;
        const halfW = Math.max(width * 0.045, width * tipNarrow) * 0.5;
        const cx = rootX + bladeDirX * lean * curve + ribbonX * curveSide * curve * (1.0 - t * 0.35);
        const cz = rootZ + bladeDirZ * lean * curve + ribbonZ * curveSide * curve * (1.0 - t * 0.35);
        const y = baseY + height * t;

        for (let side = 0; side < 2; side++) {
          const vi = vb + row * 2 + side;
          const sign = side === 0 ? -1 : 1;
          const p = vi * 3;
          positions[p] = cx + ribbonX * halfW * sign;
          positions[p + 1] = y;
          positions[p + 2] = cz + ribbonZ * halfW * sign;
          // Slight upward component gives the lighting a soft rounded-leaf look
          // without a normal map or extra texture sample.
          normals[p] = ribbonX * sign;
          normals[p + 1] = 0.18 + t * 0.42;
          normals[p + 2] = ribbonZ * sign;
          const u = vi * 2;
          uvs[u] = side;
          uvs[u + 1] = t;
          tips[vi] = t;
          seeds[vi] = seed;
          roots[vi * 2] = rootX;
          roots[vi * 2 + 1] = rootZ;
          baseYs[vi] = baseY;
          flexes[vi] = flex;
        }
      }

      const ib = blade * indicesPerBlade;
      let q = ib;
      for (let seg = 0; seg < segments; seg++) {
        const a = vb + seg * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices[q++] = a; indices[q++] = c; indices[q++] = b;
        indices[q++] = b; indices[q++] = c; indices[q++] = d;
      }
      blade++;
    }
  }

  const usedVerts = blade * vertsPerBlade;
  const usedIndices = blade * indicesPerBlade;
  const geometry = new Geometry();
  geometry.setAttribute('position', new Attr(positions.subarray(0, usedVerts * 3), 3));
  geometry.setAttribute('normal', new Attr(normals.subarray(0, usedVerts * 3), 3));
  geometry.setAttribute('uv', new Attr(uvs.subarray(0, usedVerts * 2), 2));
  geometry.setAttribute('mfBladeTip', new Attr(tips.subarray(0, usedVerts), 1));
  geometry.setAttribute('mfBladeSeed', new Attr(seeds.subarray(0, usedVerts), 1));
  geometry.setAttribute('mfBladeRoot', new Attr(roots.subarray(0, usedVerts * 2), 2));
  geometry.setAttribute('mfBladeBaseY', new Attr(baseYs.subarray(0, usedVerts), 1));
  geometry.setAttribute('mfBladeFlex', new Attr(flexes.subarray(0, usedVerts), 1));
  geometry.setIndex(Array.from(indices.subarray(0, usedIndices)));
  try { geometry.computeBoundingBox?.(); geometry.computeBoundingSphere?.(); } catch (_) {}
  return { geometry, bladeCount: blade, segments };
}

function injectBladeShader(material) {
  const previousCompile = material.onBeforeCompile;
  const previousKey = typeof material.customProgramCacheKey === 'function' ? material.customProgramCacheKey.bind(material) : null;

  material.onBeforeCompile = function (shader, renderer) {
    if (typeof previousCompile === 'function') previousCompile.call(this, shader, renderer);
    shader.uniforms.mfGrassTime = uniforms.time;
    shader.uniforms.mfGrassPlayerPos = uniforms.playerPos;
    shader.uniforms.mfGrassPlayerVelocity = uniforms.playerVelocity;
    shader.uniforms.mfGrassRain = uniforms.rainStrength;
    shader.uniforms.mfGrassWind = uniforms.windStrength;
    shader.uniforms.mfGrassQuality = uniforms.quality;
    shader.uniforms.mfGrassTrail0 = uniforms.trail0;
    shader.uniforms.mfGrassTrail1 = uniforms.trail1;
    shader.uniforms.mfGrassTrail2 = uniforms.trail2;
    shader.uniforms.mfGrassTrail3 = uniforms.trail3;

    let vertex = shader.vertexShader;
    const declarations = `
attribute float mfBladeTip;
attribute float mfBladeSeed;
attribute vec2 mfBladeRoot;
attribute float mfBladeBaseY;
attribute float mfBladeFlex;
uniform float mfGrassTime;
uniform vec3 mfGrassPlayerPos;
uniform vec2 mfGrassPlayerVelocity;
uniform float mfGrassRain;
uniform float mfGrassWind;
uniform float mfGrassQuality;
uniform vec4 mfGrassTrail0;
uniform vec4 mfGrassTrail1;
uniform vec4 mfGrassTrail2;
uniform vec4 mfGrassTrail3;
varying float mfGrassTip;
varying float mfGrassSeed;
varying float mfGrassContact;
varying float mfGrassFlex;
`;
    if (!vertex.includes('attribute float mfBladeTip;')) vertex = vertex.replace('#include <common>', '#include <common>\n' + declarations);

    const bend = `
      mfGrassTip = mfBladeTip;
      mfGrassSeed = mfBladeSeed;
      mfGrassContact = 0.0;
      mfGrassFlex = mfBladeFlex;

      float mfQ = clamp(mfGrassQuality, 0.0, 3.0);
      float mfTip2 = mfBladeTip * mfBladeTip;
      float mfTip3 = mfTip2 * mfBladeTip;
      float mfPhase = mfBladeRoot.x * 0.31 + mfBladeRoot.y * 0.43 + mfBladeSeed * 6.2831853;
      float mfGust = 0.74 + 0.26 * sin(mfGrassTime * 0.23 + mfBladeRoot.x * 0.028 - mfBladeRoot.y * 0.021);
      float mfWindA = sin(mfPhase + mfGrassTime * 0.88);
      float mfWindB = sin(mfBladeRoot.x * 0.71 - mfBladeRoot.y * 0.53 + mfGrassTime * 1.31 + mfBladeSeed * 2.7);
      vec2 mfWindDir = normalize(vec2(0.78 + sin(mfGrassTime * 0.041) * 0.14, 0.56 + cos(mfGrassTime * 0.033) * 0.12));
      vec2 mfCrossDir = vec2(-mfWindDir.y, mfWindDir.x);
      float mfWindAmp = mfQ < 0.5 ? 0.040 : (mfQ < 1.5 ? 0.050 : (mfQ < 2.5 ? 0.058 : 0.064));
      vec2 mfWind = mfWindDir * mfWindA * mfWindAmp;
      if (mfQ > 0.5) mfWind += mfWindDir * mfWindB * 0.018 + mfCrossDir * mfWindB * 0.009;
      if (mfQ > 1.5) {
        float mfFine = sin(mfGrassTime * 2.05 + mfBladeRoot.x * 1.17 + mfBladeRoot.y * 0.91 + mfBladeSeed * 5.0);
        mfWind += mfCrossDir * mfFine * 0.006;
      }
      transformed.xz += mfWind * mfTip2 * mfGust * mfGrassWind * mfBladeFlex * (1.0 + mfGrassRain * 0.24);

      vec2 mfDelta = mfBladeRoot - mfGrassPlayerPos.xz;
      float mfDist = length(mfDelta);
      float mfVertical = 1.0 - smoothstep(0.62, 1.52, abs(mfBladeBaseY - mfGrassPlayerPos.y));
      float mfRadius = mfQ < 0.5 ? 0.66 : (mfQ < 1.5 ? 0.80 : (mfQ < 2.5 ? 0.92 : 1.04));
      float mfBody = (1.0 - smoothstep(0.08, mfRadius, mfDist)) * mfVertical;
      float mfSpeed = length(mfGrassPlayerVelocity);
      vec2 mfTravel = mfSpeed > 0.025 ? normalize(mfGrassPlayerVelocity) : vec2(0.0, 1.0);
      vec2 mfAway = mfDist > 0.035 ? mfDelta / mfDist : mfTravel;
      vec2 mfPush = normalize(mix(mfAway, mfTravel, clamp(0.38 + mfSpeed * 0.050, 0.38, 0.84)) + vec2(0.0001));

      // High adds two cheap moving foot contacts. They are procedural and do not
      // require CPU raycasts, so dense grass can still react without a per-blade JS loop.
      if (mfQ > 1.5 && mfSpeed > 0.08) {
        vec2 mfSide = vec2(-mfTravel.y, mfTravel.x);
        float mfStep = sin(mfGrassTime * min(9.0, 4.2 + mfSpeed * 0.55));
        vec2 mfFootA = mfGrassPlayerPos.xz + mfTravel * 0.10 + mfSide * (0.13 + 0.05 * mfStep);
        vec2 mfFootB = mfGrassPlayerPos.xz - mfTravel * 0.06 - mfSide * (0.13 + 0.05 * mfStep);
        float mfFA = 1.0 - smoothstep(0.04, 0.34, length(mfBladeRoot - mfFootA));
        float mfFB = 1.0 - smoothstep(0.04, 0.34, length(mfBladeRoot - mfFootB));
        mfBody = max(mfBody, max(mfFA, mfFB) * mfVertical);
      }

      // Extreme adds an oriented contact capsule around the moving lower body. It
      // catches blades between the two feet instead of only sampling circles, which
      // makes dense grass react continuously when the player cuts through it.
      if (mfQ > 2.5) {
        vec2 mfSideE = vec2(-mfTravel.y, mfTravel.x);
        vec2 mfLocal = mfBladeRoot - mfGrassPlayerPos.xz;
        float mfForward = dot(mfLocal, mfTravel);
        float mfLateral = dot(mfLocal, mfSideE);
        float mfEllipse = sqrt((mfForward * mfForward) / (0.66 * 0.66) + (mfLateral * mfLateral) / (0.42 * 0.42));
        float mfCapsule = 1.0 - smoothstep(0.54, 1.04, mfEllipse);
        float mfFront = 1.0 - smoothstep(0.04, 0.46, length(mfBladeRoot - (mfGrassPlayerPos.xz + mfTravel * 0.34)));
        mfBody = max(mfBody, max(mfCapsule, mfFront * 0.78) * mfVertical);
      }

      float mfContact = mfBody * mfTip2;
      float mfPushStrength = mfQ < 0.5 ? 0.34 : (mfQ < 1.5 ? 0.44 : (mfQ < 2.5 ? 0.52 : 0.60));
      float mfFlatten = mfQ < 0.5 ? 0.27 : (mfQ < 1.5 ? 0.34 : (mfQ < 2.5 ? 0.43 : 0.50));
      transformed.xz += mfPush * mfContact * (mfPushStrength + min(mfSpeed * 0.022, 0.18)) * mfBladeFlex;
      transformed.y -= mfContact * (mfFlatten + min(mfSpeed * 0.018, 0.15));
      // A small bend around the lower-mid segment keeps the base planted while the
      // upper blade rolls away instead of translating like a rigid billboard.
      transformed.xz += mfPush * mfBody * mfBladeTip * (1.0 - mfBladeTip) * (0.05 + mfQ * 0.018);
      mfGrassContact = max(mfGrassContact, mfBody);

      vec2 mfD0 = mfBladeRoot - mfGrassTrail0.xy;
      vec2 mfD1 = mfBladeRoot - mfGrassTrail1.xy;
      vec2 mfD2 = mfBladeRoot - mfGrassTrail2.xy;
      vec2 mfD3 = mfBladeRoot - mfGrassTrail3.xy;
      float mfTrailLife = mfQ < 0.5 ? 1.05 : (mfQ < 1.5 ? 1.50 : (mfQ < 2.5 ? 1.95 : 2.35));
      float mfTrailRadius = mfQ < 0.5 ? 0.48 : (mfQ < 1.5 ? 0.62 : (mfQ < 2.5 ? 0.74 : 0.84));
      float mfL0 = 1.0 - smoothstep(0.10, mfTrailLife, max(0.0, mfGrassTime - mfGrassTrail0.w));
      float mfL1 = 1.0 - smoothstep(0.10, mfTrailLife, max(0.0, mfGrassTime - mfGrassTrail1.w));
      float mfL2 = 1.0 - smoothstep(0.10, mfTrailLife, max(0.0, mfGrassTime - mfGrassTrail2.w));
      float mfL3 = 1.0 - smoothstep(0.10, mfTrailLife, max(0.0, mfGrassTime - mfGrassTrail3.w));
      float mfP0 = (1.0 - smoothstep(0.05, mfTrailRadius, length(mfD0))) * mfL0 * mfGrassTrail0.z;
      float mfP1 = (1.0 - smoothstep(0.05, mfTrailRadius, length(mfD1))) * mfL1 * mfGrassTrail1.z;
      float mfP2 = (1.0 - smoothstep(0.05, mfTrailRadius, length(mfD2))) * mfL2 * mfGrassTrail2.z;
      float mfP3 = (1.0 - smoothstep(0.05, mfTrailRadius, length(mfD3))) * mfL3 * mfGrassTrail3.z;
      float mfPress = max(max(mfP0, mfP1), max(mfP2, mfP3)) * mfTip3 * mfVertical;
      transformed.y -= mfPress * (0.22 + mfQ * 0.055);
      transformed.xz += mfTravel * mfPress * (0.07 + mfQ * 0.025);
      mfGrassContact = max(mfGrassContact, mfPress);
    `;
    if (vertex.includes('#include <project_vertex>')) vertex = vertex.replace('#include <project_vertex>', bend + '\n#include <project_vertex>');
    shader.vertexShader = vertex;

    let fragment = shader.fragmentShader;
    const fdecl = `
varying float mfGrassTip;
varying float mfGrassSeed;
varying float mfGrassContact;
varying float mfGrassFlex;
`;
    if (!fragment.includes('varying float mfGrassTip;')) fragment = fragment.replace('#include <common>', '#include <common>\n' + fdecl);
    const colorCode = `
      vec3 mfBase = vec3(0.060, 0.190, 0.040);
      vec3 mfMid = vec3(0.125, 0.340, 0.070);
      vec3 mfTipColor = vec3(0.285, 0.575, 0.150);
      float mfT = smoothstep(0.0, 1.0, mfGrassTip);
      vec3 mfGrassColor = mix(mfBase, mfMid, smoothstep(0.0, 0.58, mfT));
      mfGrassColor = mix(mfGrassColor, mfTipColor, smoothstep(0.52, 1.0, mfT));
      float mfVar = (mfGrassSeed - 0.5) * 0.12;
      mfGrassColor += vec3(mfVar * 0.28, mfVar, mfVar * 0.14);
      float mfFlexTone = clamp((mfGrassFlex - 0.70) * 0.62, 0.0, 0.34);
      mfGrassColor = mix(mfGrassColor, vec3(0.105, 0.300, 0.055), mfFlexTone);
      mfGrassColor *= 1.0 - mfGrassContact * 0.075;
      diffuseColor.rgb = mfGrassColor;
      diffuseColor.a = 1.0;
    `;
    if (fragment.includes('#include <map_fragment>')) fragment = fragment.replace('#include <map_fragment>', '#include <map_fragment>\n' + colorCode);
    shader.fragmentShader = fragment;
  };

  material.customProgramCacheKey = function () {
    return `${previousKey ? previousKey() : ''}|minifeather-3d-grass-v5`;
  };
}

function makeBladeMaterial() {
  const ref = state.referenceMaterial;
  if (!ref) return null;
  let mat = null;
  try { mat = ref.clone?.(); } catch (_) {}
  if (!mat) return null;

  try { mat.map = null; } catch (_) {}
  try { mat.alphaMap = null; } catch (_) {}
  try { mat.transparent = false; mat.opacity = 1; mat.alphaTest = 0; } catch (_) {}
  try { mat.side = 2; } catch (_) {}
  try { mat.depthWrite = true; mat.depthTest = true; } catch (_) {}
  try { if ('roughness' in mat) mat.roughness = 0.82; } catch (_) {}
  try { if ('metalness' in mat) mat.metalness = 0.0; } catch (_) {}
  try { if (mat.color?.setRGB) mat.color.setRGB(1, 1, 1); } catch (_) {}
  try { mat.dithering = true; } catch (_) {}
  injectBladeShader(mat);
  try { mat.needsUpdate = true; } catch (_) {}
  return mat;
}

function clear3DGrass() {
  uniforms.replaceNativeGrass.value = 0;
  try { state.mesh?.removeFromParent?.(); } catch (_) {}
  try { state.geometry?.dispose?.(); } catch (_) {}
  try { state.material?.dispose?.(); } catch (_) {}
  state.mesh = state.geometry = state.material = null;
}

function makeGrassMesh(geometry) {
  const ref = state.referenceMesh;
  if (!ref?.constructor || !geometry) return null;
  const material = makeBladeMaterial();
  if (!material) return null;
  try {
    const mesh = new ref.constructor(geometry, material);
    mesh.name = 'MiniFeather:3DGrassPhysics';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.renderOrder = 2;
    return mesh;
  } catch (_) {
    try { material.dispose?.(); } catch (_) {}
    return null;
  }
}

function idle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 80 });
  else setTimeout(() => fn({ timeRemaining: () => 4 }), 0);
}

function rebuild3DGrass(force = false) {
  if (!state.enabled || state.destroyed || state.building) return;
  const game = getGame(force);
  const scene = getScene(game);
  const pos = game?.player?.pos;
  const px = Number(pos?.x), pz = Number(pos?.z);
  if (!game?.world || !scene?.add || !Number.isFinite(px) || !Number.isFinite(pz)) return;
  if (!findReferenceMesh(scene)) return;

  if (state.world !== game.world || state.scene !== scene) {
    state.world = game.world;
    state.scene = scene;
    state.stateNameCache.clear();
    state.serverSalt = computeServerSalt(game);
    clear3DGrass();
    state.lastBuildX = state.lastBuildZ = Number.NaN;
  }

  const now = performance.now();
  const moved = Number.isFinite(state.lastBuildX) ? Math.hypot(px - state.lastBuildX, pz - state.lastBuildZ) : 999;
  const profile = state.profile;
  if (!force && moved < profile.rebuildDistance && now - state.lastBuildAt < profile.rebuildInterval * 2.25) return;

  const token = ++state.buildToken;
  state.building = true;
  idle(() => {
    if (!state.enabled || token !== state.buildToken) { state.building = false; return; }
    let surfaces = [];
    try { surfaces = collectGrassSurfaces(game, px, pz); } catch (err) { console.warn(TAG, 'surface scan failed', err); }
    if (!state.enabled || token !== state.buildToken) { state.building = false; return; }

    const built = makeBladeGeometry(state.referenceMesh.geometry, surfaces, px, pz);
    if (!built?.geometry) { state.building = false; return; }
    const oldMesh = state.mesh, oldGeometry = state.geometry, oldMaterial = state.material;
    const mesh = makeGrassMesh(built.geometry);
    if (!mesh) { try { built.geometry.dispose?.(); } catch (_) {}; state.building = false; return; }

    try { scene.add(mesh); } catch (_) {
      try { built.geometry.dispose?.(); state.material?.dispose?.(); } catch (_) {}
      state.material = null;
      state.building = false;
      return;
    }

    state.mesh = mesh;
    state.geometry = built.geometry;
    state.material = mesh.material;
    uniforms.replaceNativeGrass.value = 1;
    state.lastBuildX = px;
    state.lastBuildZ = pz;
    state.lastBuildAt = performance.now();
    state.building = false;

    if (oldMesh && oldMesh !== mesh) {
      try { oldMesh.removeFromParent?.(); } catch (_) {}
      try { oldGeometry?.dispose?.(); } catch (_) {}
      try { oldMaterial?.dispose?.(); } catch (_) {}
    }
  });
}

// Native flowers/ferns remain interactive. This patch is intentionally much
// lighter than the procedural grass shader and only adds player bending.
function patchNativeMaterial(material) {
  if (!material || state.nativePatched.has(material)) return;
  const previousCompile = material.onBeforeCompile;
  const previousKey = typeof material.customProgramCacheKey === 'function' ? material.customProgramCacheKey.bind(material) : null;
  const record = { material, previousCompile, previousKey };

  material.onBeforeCompile = function (shader, renderer) {
    if (typeof previousCompile === 'function') previousCompile.call(this, shader, renderer);
    shader.uniforms.mfVegPlayerPos = uniforms.playerPos;
    shader.uniforms.mfVegPlayerVelocity = uniforms.playerVelocity;
    shader.uniforms.mfVegReplaceNativeGrass = uniforms.replaceNativeGrass;
    shader.uniforms.mfVegQuality = uniforms.quality;

    let v = shader.vertexShader;
    if (!/attribute\s+float\s+wave\s*;/.test(v)) v = v.replace('#include <common>', '#include <common>\nattribute float wave;');
    if (!v.includes('uniform vec3 mfVegPlayerPos;')) {
      v = v.replace('#include <common>', '#include <common>\nuniform vec3 mfVegPlayerPos;\nuniform vec2 mfVegPlayerVelocity;\nuniform float mfVegQuality;\nvarying float mfVegWave;');
    }
    const code = `
      mfVegWave = wave;
      if (wave > 0.001) {
        float mfTip = smoothstep(0.01, 0.92, clamp(wave, 0.0, 1.0));
        vec3 mfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec2 mfD = mfWorld.xz - mfVegPlayerPos.xz;
        float mfDist = length(mfD);
        float mfRadius = mfVegQuality < 0.5 ? 0.68 : (mfVegQuality < 1.5 ? 0.82 : (mfVegQuality < 2.5 ? 0.92 : 1.02));
        float mfBody = 1.0 - smoothstep(0.08, mfRadius, mfDist);
        float mfSpeed = length(mfVegPlayerVelocity);
        vec2 mfTravel = mfSpeed > 0.025 ? normalize(mfVegPlayerVelocity) : vec2(0.0, 1.0);
        vec2 mfAway = mfDist > 0.035 ? mfD / mfDist : mfTravel;
        vec2 mfDir = normalize(mix(mfAway, mfTravel, mfVegQuality > 2.5 ? 0.72 : (mfVegQuality > 1.5 ? 0.66 : 0.56)) + vec2(0.0001));
        transformed.xz += mfDir * mfBody * mfTip * (mfVegQuality < 0.5 ? 0.26 : (mfVegQuality < 1.5 ? 0.32 : (mfVegQuality < 2.5 ? 0.38 : 0.44)));
        transformed.y -= mfBody * mfTip * (mfVegQuality < 0.5 ? 0.17 : (mfVegQuality < 1.5 ? 0.22 : (mfVegQuality < 2.5 ? 0.28 : 0.32)));
      }
    `;
    if (v.includes('#include <project_vertex>')) v = v.replace('#include <project_vertex>', code + '\n#include <project_vertex>');
    shader.vertexShader = v;

    let f = shader.fragmentShader;
    if (!f.includes('uniform float mfVegReplaceNativeGrass;')) {
      f = f.replace('#include <common>', '#include <common>\nuniform float mfVegReplaceNativeGrass;\nvarying float mfVegWave;');
    }
    const suppress = `
      // Replace the flat green grass/fern pixels with procedural blades once the
      // 3D replacement mesh is ready. Colored flower petals remain visible.
      if (mfVegReplaceNativeGrass > 0.5 && mfVegWave > 0.001) {
        float mfGreenDominance = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);
        float mfGrassPixel = smoothstep(0.025, 0.115, mfGreenDominance) * smoothstep(0.06, 0.28, diffuseColor.g);
        if (mfGrassPixel > 0.52) discard;
      }
    `;
    if (f.includes('#include <color_fragment>')) f = f.replace('#include <color_fragment>', '#include <color_fragment>\n' + suppress);
    else if (f.includes('#include <map_fragment>')) f = f.replace('#include <map_fragment>', '#include <map_fragment>\n' + suppress);
    shader.fragmentShader = f;
  };
  material.customProgramCacheKey = function () { return `${previousKey ? previousKey() : ''}|mf-native-veg-contact-v5`; };
  try { material.needsUpdate = true; } catch (_) {}
  state.nativeRecords.add(record);
  state.nativePatched.add(material);
}

function scanNativeVegetation(force = false) {
  const now = performance.now();
  if (!force && now - state.lastNativeScan < 3500) return;
  state.lastNativeScan = now;
  const root = getGame(false)?.gameScene?.chunkMeshes;
  if (!root?.traverse) return;
  const seen = new Set();
  try {
    root.traverse(mesh => {
      if (!mesh?.isMesh || !getWaveAttribute(mesh.geometry)) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat || seen.has(mat)) continue;
        seen.add(mat);
        patchNativeMaterial(mat);
      }
    });
  } catch (_) {}
}

function restoreNativeMaterials() {
  for (const r of state.nativeRecords) {
    try { r.material.onBeforeCompile = r.previousCompile; } catch (_) {}
    try {
      if (r.previousKey) r.material.customProgramCacheKey = r.previousKey;
      else delete r.material.customProgramCacheKey;
    } catch (_) {}
    try { r.material.needsUpdate = true; } catch (_) {}
  }
  state.nativeRecords.clear();
  state.nativePatched = new WeakSet();
}

function addTrail(x, z, speed, nowSec) {
  const t = trails[state.trailCursor % TRAIL_COUNT];
  state.trailCursor = (state.trailCursor + 1) % TRAIL_COUNT;
  t.x = x; t.y = z; t.z = Math.max(0.62, Math.min(1.0, 0.68 + speed * 0.055)); t.w = nowSec;
}

function updateWeather(now) {
  if (now - state.lastWeatherCheck < 500) return;
  state.lastWeatherCheck = now;
  let rain = 0;
  try { rain = Number(state.game?.world?.getRainStrength?.(1) || 0); } catch (_) {}
  if (!Number.isFinite(rain)) rain = 0;
  uniforms.rainStrength.value = Math.max(0, Math.min(1, rain));
  uniforms.windStrength.value = 1.0 + uniforms.rainStrength.value * 0.22;
}

function updatePlayer(now) {
  const game = getGame(false);
  const pos = game?.player?.pos;
  const x = Number(pos?.x), y = Number(pos?.y), z = Number(pos?.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    uniforms.playerPos.value.x = uniforms.playerPos.value.y = uniforms.playerPos.value.z = 1e6;
    return;
  }
  uniforms.playerPos.value.x = x;
  uniforms.playerPos.value.y = y;
  uniforms.playerPos.value.z = z;

  let speed = Math.hypot(state.velX, state.velZ);
  if (Number.isFinite(state.lastPlayerX) && state.lastPlayerTime > 0) {
    const dt = Math.max(0.008, Math.min(0.09, (now - state.lastPlayerTime) / 1000));
    const vx = Math.max(-12, Math.min(12, (x - state.lastPlayerX) / dt));
    const vz = Math.max(-12, Math.min(12, (z - state.lastPlayerZ) / dt));
    state.velX += (vx - state.velX) * 0.30;
    state.velZ += (vz - state.velZ) * 0.30;
    speed = Math.hypot(state.velX, state.velZ);
  }
  uniforms.playerVelocity.value.x = state.velX;
  uniforms.playerVelocity.value.y = state.velZ;

  if (speed > 0.16) {
    const d = Number.isFinite(state.lastTrailX) ? Math.hypot(x - state.lastTrailX, z - state.lastTrailZ) : 999;
    if (d >= 0.24) {
      addTrail(x, z, speed, now * 0.001);
      state.lastTrailX = x;
      state.lastTrailZ = z;
    }
  }
  state.lastPlayerX = x; state.lastPlayerY = y; state.lastPlayerZ = z; state.lastPlayerTime = now;
  updateWeather(now);
}

function animate(now) {
  if (!state.enabled || state.destroyed) { state.frame = 0; return; }
  uniforms.time.value = now * 0.001;
  updatePlayer(now);
  rebuild3DGrass(false);
  scanNativeVegetation(false);
  state.frame = requestAnimationFrame(animate);
}

function resetMotion() {
  state.lastPlayerX = state.lastPlayerY = state.lastPlayerZ = Number.NaN;
  state.lastPlayerTime = 0;
  state.velX = state.velZ = 0;
  state.lastTrailX = state.lastTrailZ = Number.NaN;
  state.trailCursor = 0;
  for (const t of trails) { t.x = 0; t.y = 0; t.z = 0; t.w = -9999; }
}

function start() {
  if (state.destroyed) return;
  uniforms.quality.value = state.profile.quality;
  resetMotion();
  state.serverSalt = computeServerSalt(getGame(true));
  scanNativeVegetation(true);
  rebuild3DGrass(true);
  if (!state.timer) state.timer = setInterval(() => rebuild3DGrass(false), state.profile.rebuildInterval);
  if (!state.frame) state.frame = requestAnimationFrame(animate);
}

function stop() {
  if (state.timer) clearInterval(state.timer);
  state.timer = 0;
  if (state.frame) cancelAnimationFrame(state.frame);
  state.frame = 0;
  state.buildToken++;
  state.building = false;
  clear3DGrass();
  restoreNativeMaterials();
  state.game = state.world = state.scene = null;
  state.referenceMesh = state.referenceMaterial = null;
  state.stateNameCache.clear();
  state.lastBuildX = state.lastBuildZ = Number.NaN;
  resetMotion();
}


function normalizeLevel(value) {
  const level = String(value || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(PROFILES, level) ? level : 'medium';
}

function setLevel(value) {
  const level = normalizeLevel(value);
  if (state.level === level) return;
  state.level = level;
  state.profile = PROFILES[level];
  uniforms.quality.value = state.profile.quality;
  if (!state.enabled) return;

  // Quality changes only rebuild the lightweight procedural grass mesh. The
  // MiniBlox world/chunks are never regenerated or mutated.
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => rebuild3DGrass(false), state.profile.rebuildInterval);
  state.buildToken++;
  state.building = false;
  state.lastBuildX = state.lastBuildZ = Number.NaN;
  rebuild3DGrass(true);
}

function setEnabled(value) {
  const enabled = !!value;
  if (state.enabled === enabled) {
    if (enabled) rebuild3DGrass(true);
    return;
  }
  state.enabled = enabled;
  if (enabled) start(); else stop();
}

function applyConfig(detail) {
  let cfg = detail;
  if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch (_) { return; } }
  if (!cfg || typeof cfg !== 'object') return;
  if ('level' in cfg) setLevel(cfg.level);
  if ('enabled' in cfg) setEnabled(cfg.enabled);
}

const configHandler = event => applyConfig(event.detail);
document.addEventListener(EVENT_CONFIG, configHandler, true);
window.addEventListener('beforeunload', () => stop(), { once: true });

W.MF_InteractiveVegetationExperimental = {
  version: VERSION,
  setEnabled,
  setLevel,
  refresh() { rebuild3DGrass(true); scanNativeVegetation(true); },
  get enabled() { return state.enabled; },
  get level() { return state.level; },
  get bladeCount() {
    try { return Math.floor((state.geometry?.attributes?.mfBladeTip?.count || 0) / ((state.profile.segments + 1) * 2)); } catch (_) { return 0; }
  },
  destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    stop();
    document.removeEventListener(EVENT_CONFIG, configHandler, true);
    try { delete W.MF_InteractiveVegetationExperimental; } catch (_) {}
  }
};

})();
