// Shine-style world ambience para MiniFeather
// Port de las partículas del pack Shine 3.1.1 (Java): mariposas, pájaros,
// polen, polen de agua, luciérnagas, lirios, medusas. Los parámetros
// (densidad, caps, radios, velocidades, frames) provienen de
// shine-3.1.1+26.2/assets/shine/defaults/experimental.json.
//
// Técnica: misma que FallenLeaves — constructores three.js obtenidos por
// reflexión desde un mesh de referencia de la escena del juego, quads con
// lookAt (billboard), escaneo de chunks via palette/bitArray.

(() => {
  'use strict';

  const W = typeof window !== 'undefined' ? window : globalThis;
  const TAG = '[MiniFeather ShineAmbience]';
  const EVENT_CONFIG = 'minifeather:shine-ambience-config';

  // ── Definiciones (de defaults/experimental.json del pack) ─────────────
  const SPECIES = {
    butterfly: {
      texs: () => {
        const out = [];
        for (const c of ['red', 'orange', 'yellow', 'blue', 'violet'])
          for (let i = 1; i <= 3; i++) out.push(`world_ambience/butterfly/butterfly_${c}_0${i}.png`);
        return out;
      },
      cap: 30, density: 0.85, spawnRate: 1.6, spawnRange: 32, minDist: 5,
      height: 2.2, speed: 1.1, wander: 0.85, lifetime: 4, size: 0.32,
      squishAmp: 0.18, squishFreq: 2.4
    },
    bird: {
      // orden FIJO de texturas (debe calzar con los PNG del pack en disco):
      // 0-3   statics: birb1_left, birb1_right, bird2_left, bird2_right
      // 4-7   checking: birb1_checking_L/R, bird2_checking_L/R
      // 8-11  birb2 flying: left_1, left_2, right_1, right_2
      // 12-21 bird2 flying: left_1..5, right_1..5
      texs: () => [
        'world_ambience/birds/birb1_left.png',
        'world_ambience/birds/birb1_right.png',
        'world_ambience/birds/bird2_left.png',
        'world_ambience/birds/bird2_right.png',
        'world_ambience/birds/birb1_checking_left.png',
        'world_ambience/birds/birb1_checking_right.png',
        'world_ambience/birds/bird2_checking_left.png',
        'world_ambience/birds/bird2_checking_right.png',
        'world_ambience/birds/birb2_flying_left_1.png',
        'world_ambience/birds/birb2_flying_left_2.png',
        'world_ambience/birds/birb2_flying_right_1.png',
        'world_ambience/birds/birb2_flying_right_2.png',
        'world_ambience/birds/bird2_flying_left_1.png',
        'world_ambience/birds/bird2_flying_left_2.png',
        'world_ambience/birds/bird2_flying_left_3.png',
        'world_ambience/birds/bird2_flying_left_4.png',
        'world_ambience/birds/bird2_flying_left_5.png',
        'world_ambience/birds/bird2_flying_right_1.png',
        'world_ambience/birds/bird2_flying_right_2.png',
        'world_ambience/birds/bird2_flying_right_3.png',
        'world_ambience/birds/bird2_flying_right_4.png',
        'world_ambience/birds/bird2_flying_right_5.png'
      ],
      cap: 16, density: 1.2, spawnRate: 0.8, spawnRange: 80, minDist: 30,
      height: 18, speed: 0.9, lifetime: 22, size: 0.7,
      glideEvery: 1.25
    },
    pollen: {
      texs: () => ['world_ambience/pollen.png'],
      cap: 120, density: 0.8, spawnRate: 14, spawnRange: 24, minDist: 2,
      speed: 1, gustEvery: 14, gustSpeed: 1.25,
      size: 0.045, alpha: 0.85, lifetime: 12, heightSpread: 3
    },
    waterPollen: {
      texs: () => ['world_ambience/pollen.png'],
      cap: 140, density: 0.45, spawnRate: 10, spawnRange: 20, minDist: 2,
      bob: 0.012, drift: 0.01, floatTime: 16, size: 0.05, alpha: 0.62, lifetime: 16
    },
    firefly: {
      texs: () => ['world_ambience/firefly/firefly_00.png', 'world_ambience/firefly/firefly_01.png'],
      cap: 60, density: 0.75, spawnRate: 3, spawnRange: 26, minDist: 3,
      size: 0.5, alpha: 1, lifetime: 26
    },
    lilyPad: {
      texs: () => ['lily_pad_litter/lily_pad.png'],
      cap: 90, density: 0.75, spawnRate: 2, spawnRange: 32, minDist: 2,
      size: 0.25, lifetime: 90
    },
    jellyfish: {
      texs: () => {
        const out = [];
        for (const c of ['blue', 'orange', 'pink']) for (let i = 1; i <= 9; i++)
          out.push(`jellyfish/${c}/jellyfish_${c}_0${i}.png`);
        return out;
      },
      cap: 24, density: 0.85, spawnRate: 0.5, spawnRange: 42, minDist: 12,
      swim: 0.11, drift: 0.6, lifetime: 28, size: 1.2, alpha: 0.88,
      animSpeed: 0.38
    }
  };
  // jellyfish: base de índice por color (blue 0, orange 9, pink 18)
  const JELLY_BASES = [0, 9, 18];
  // bird: bases de frames de vuelo por dirección según el orden de texs()
  // bird2 (5 frames): left 12-16, right 17-21 | birb2 (2 frames): left 8-9, right 10-11
  const BIRD_FLY = [
    { base: 12, frames: 5 }, // bird2_left
    { base: 17, frames: 5 }, // bird2_right
    { base: 8, frames: 2 },  // birb2_left
    { base: 10, frames: 2 }  // birb2_right
  ];

  const GRASS_BLOCKS = new Set(['grass_block', 'tall_grass', 'short_grass', 'fern', 'moss_block', 'moss_carpet']);
  const WATER_BLOCKS = new Set(['water', 'flowing_water']);
  const NIGHT_START = 13000, NIGHT_END = 23000;
  const MAX_EMITTERS = 160;

  // ── Estado ─────────────────────────────────────────────────────────────
  const state = {
    enabled: false,
    destroyed: false,
    started: false,
    game: null,
    lastGameScan: 0,
    assetsBase: '',
    materials: {},
    referenceMesh: null,
    verticalGeometry: null,
    horizontalGeometry: null,
    scratchVec3: null,
    particles: { butterfly: [], bird: [], pollen: [], waterPollen: [], firefly: [], lilyPad: [], jellyfish: [] },
    emitters: [],
    lastFrame: 0,
    raf: 0,
    scanTimer: 0,
    stateNameCache: new Map(),
    serverSalt: 0,
    loaded: false
  };

  function findGame(force = false) {
    const now = performance.now();
    if (!force && state.game?.player && state.game?.world && now - state.lastGameScan < 1200) return state.game;
    state.lastGameScan = now;
    for (const candidate of [W.miniblox, W.__MINIBLOX_GAME__, state.game]) {
      if (candidate?.player && candidate?.world) { state.game = candidate; return candidate; }
    }
    try {
      const react = document.querySelector('#react');
      if (!react) return null;
      for (const root of Object.values(react)) {
        const game = root?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player && game?.world) { W.__MINIBLOX_GAME__ = game; state.game = game; return game; }
      }
    } catch (_) {}
    return null;
  }

  function getScene(game) {
    return game?.gameScene?.scene || game?.scene?.scene || game?.gameScene || game?.scene || null;
  }

  function getCamera(game) {
    return game?.gameScene?.camera || game?.camera || null;
  }

  function getWorldProto(world) {
    let proto = world && Object.getPrototypeOf(world);
    for (let i = 0; i < 6 && proto; i++, proto = Object.getPrototypeOf(proto)) {
      if (typeof proto.getChunkByID === 'function') return proto;
    }
    return null;
  }

  function hashString(text) {
    let h = 2166136261 >>> 0;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  function computeServerSalt(game) {
    let key = '';
    try { key = game?.serverInfo?.serverId || game?.serverInfo?.serverName || game?.serverInfo?.worldType || ''; } catch (_) {}
    try { key += `|${game?.world?.dimensionId ?? 0}`; } catch (_) {}
    return hashString(key || 'miniblox');
  }

  function hashXZ(x, z) {
    let h = state.serverSalt ^ Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(z | 0, 0x119de1f3);
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
    return h >>> 0;
  }

  function isValidAssetsUrl(url) {
    return typeof url === 'string' && url.startsWith('chrome-extension://') && !url.includes('://invalid/');
  }

  function resolveAssetsBase() {
    if (isValidAssetsUrl(state.assetsBase)) return state.assetsBase;
    state.assetsBase = '';
    try {
      const meta = document.querySelector('meta[name="mf-particles-base"]');
      if (isValidAssetsUrl(meta?.content)) { state.assetsBase = meta.content; return state.assetsBase; }
      for (const [name, suffix] of [['mf-mirror-base', 'assets/mfpack/'], ['mf-skins-base', 'skins/']]) {
        const other = document.querySelector(`meta[name="${name}"]`);
        const content = other?.content;
        if (typeof content === 'string' && content.endsWith(suffix) && isValidAssetsUrl(content)) {
          state.assetsBase = content.slice(0, -suffix.length) + 'assets/particles/';
          return state.assetsBase;
        }
      }
    } catch (_) {}
    return '';
  }

  function loadImageUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('IMG_LOAD ' + url));
      img.src = url;
    });
  }

  function findReferenceMesh(scene) {
    if (state.referenceMesh?.geometry?.attributes?.position && state.referenceMesh?.material) return state.referenceMesh;
    if (!scene?.traverse) return null;
    const rank = { MeshLambertMaterial: 0, MeshBasicMaterial: 1, MeshStandardMaterial: 2, MeshPhongMaterial: 3 };
    let best = null, bestRank = 99;
    try {
      scene.traverse(obj => {
        if (!obj?.isMesh || obj.isSkinnedMesh) return;
        if (!obj.geometry?.attributes?.position || !obj.geometry?.attributes?.uv) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          const type = mat?.type || mat?.constructor?.name || '';
          const r = rank[type];
          if (r === undefined || r >= bestRank || !mat?.map) continue;
          best = { mesh: obj, material: mat };
          bestRank = r;
        }
      });
    } catch (_) {}
    state.referenceMesh = best?.mesh || null;
    return state.referenceMesh;
  }

  function copyTextureSettings(source, texture) {
    if (!source || !texture) return;
    for (const key of ['wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'colorSpace', 'encoding', 'premultiplyAlpha', 'unpackAlignment']) {
      try { if (source[key] !== undefined) texture[key] = source[key]; } catch (_) {}
    }
    try { texture.flipY = source.flipY; } catch (_) {}
    try { texture.generateMipmaps = source.generateMipmaps; } catch (_) {}
  }

  function createMaterial(source, texture, opts = {}) {
    let material = null;
    try { material = new source.constructor(); } catch (_) { try { material = source.clone(); } catch (_) {} }
    if (!material) return null;
    try {
      material.map = texture;
      material.alphaMap = null; material.aoMap = null; material.lightMap = null;
      material.normalMap = null; material.bumpMap = null; material.displacementMap = null;
      material.emissiveMap = null; material.metalnessMap = null; material.roughnessMap = null;
      material.vertexColors = false;
      material.transparent = true;
      material.opacity = opts.alpha ?? 1;
      material.alphaTest = 0.02;
      material.depthTest = true;
      material.depthWrite = false;
      material.side = 2;
      material.fog = true;
      material.toneMapped = source.toneMapped !== false;
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
      if ('roughness' in material) material.roughness = 1;
      if ('metalness' in material) material.metalness = 0;
      material.color?.set?.(0xffffff);
      // emisivo para especies que brillan (firefly, jellyfish)
      if (opts.emissive && material.emissive?.set) {
        material.emissive.set(opts.tint ?? 0xffffff);
        if ('emissiveIntensity' in material) material.emissiveIntensity = 1;
      } else {
        material.emissive?.set?.(0x000000);
      }
      material.onBeforeCompile = function () {};
      material.customProgramCacheKey = () => opts.cacheKey || 'mf-shine-v1';
      material.needsUpdate = true;
    } catch (_) {}
    return material;
  }

  function buildQuadGeometry(referenceMesh, horizontal) {
    const geo = horizontal ? state.horizontalGeometry : state.verticalGeometry;
    if (geo) return geo;
    const refGeo = referenceMesh?.geometry;
    if (!refGeo?.attributes?.position?.constructor) return null;
    try {
      const Geometry = refGeo.constructor;
      const Attr = refGeo.attributes.position.constructor;
      const geometry = new Geometry();
      if (horizontal) {
        geometry.setAttribute('position', new Attr(new Float32Array([
          -0.5, 0, -0.5,  0.5, 0, -0.5,  -0.5, 0, 0.5,  0.5, 0, 0.5
        ]), 3));
        geometry.setAttribute('normal', new Attr(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
      } else {
        geometry.setAttribute('position', new Attr(new Float32Array([
          -0.5, -0.5, 0,  0.5, -0.5, 0,  -0.5, 0.5, 0,  0.5, 0.5, 0
        ]), 3));
        geometry.setAttribute('normal', new Attr(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
      }
      geometry.setAttribute('uv', new Attr(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
      geometry.setIndex([0, 1, 2, 2, 1, 3]);
      geometry.computeBoundingBox?.();
      geometry.computeBoundingSphere?.();
      if (horizontal) state.horizontalGeometry = geometry; else state.verticalGeometry = geometry;
      return geometry;
    } catch (_) {
      return null;
    }
  }

  async function ensureResources(scene) {
    if (state.loaded) return true;
    const base = resolveAssetsBase();
    if (!base) return false;
    const ref = findReferenceMesh(scene);
    const source = Array.isArray(ref?.material) ? ref.material[0] : ref?.material;
    const sourceMap = source?.map;
    if (!ref || !source || !sourceMap || typeof sourceMap.constructor !== 'function') return false;

    const jobs = [];
    for (const [kind, def] of Object.entries(SPECIES)) {
      for (const rel of def.texs()) jobs.push({ kind, url: `${base}shine/${rel}` });
    }

    try {
      const images = await Promise.all(jobs.map(j => loadImageUrl(j.url)));
      for (let i = 0; i < jobs.length; i++) {
        let image = images[i];
        try {
          if (typeof createImageBitmap === 'function') {
            image = await createImageBitmap(image, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
          }
        } catch (_) {}
        const TextureCtor = sourceMap.constructor;
        const texture = new TextureCtor(image);
        copyTextureSettings(sourceMap, texture);
        try {
          if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) texture.flipY = false;
        } catch (_) {}
        texture.needsUpdate = true;

        const kind = jobs[i].kind;
        const mat = createMaterial(source, texture, {
          alpha: SPECIES[kind].alpha ?? 1,
          emissive: kind === 'firefly' || kind === 'jellyfish',
          tint: kind === 'firefly' ? 0xfff1a8 : 0xffffff,
          cacheKey: 'mf-shine-' + kind
        });
        if (!mat) throw new Error('Material incompatible');
        (state.materials[kind] = state.materials[kind] || []).push(mat);
      }
      buildQuadGeometry(ref, false);
      buildQuadGeometry(ref, true);
      try { state.scratchVec3 = ref.position.clone(); } catch (_) {}
      state.loaded = true;
      return true;
    } catch (err) {
      console.warn(TAG, 'texturas no cargadas:', String(err?.message || err));
      return false;
    }
  }

  // ── Acceso a bloques ──────────────────────────────────────────────────
  function blockNameAt(chunk, stateId, wx, y, wz) {
    if (state.stateNameCache.has(stateId)) return state.stateNameCache.get(stateId);
    let name = '';
    try {
      const bs = chunk.getBlockState?.({ x: wx, y, z: wz });
      name = String(bs?.getBlock?.()?.name || bs?.block?.name || '').toLowerCase();
    } catch (_) {}
    if (state.stateNameCache.size < 4096) state.stateNameCache.set(stateId, name);
    return name;
  }

  function isNight(game) {
    try {
      const t = Number(game?.world?.worldTime ?? 0) % 24000;
      return t >= NIGHT_START && t <= NIGHT_END;
    } catch (_) {
      return false;
    }
  }

  // Escanea chunks alrededor del jugador buscando pasto (tall/bajo) y
  // superficies de agua; registra "emitters" de los que viven las partículas.
  function scanChunk(world, proto, cx, cz) {
    let chunk = null;
    try {
      if (typeof proto.isChunkLoaded === 'function' && !proto.isChunkLoaded.call(world, cx, cz)) return;
      chunk = proto.getChunkByID.call(world, cx, cz);
    } catch (_) { return; }
    if (!chunk?.cells) return;

    for (let lx = 0; lx < 16; lx++) {
      for (let lz = 0; lz < 16; lz++) {
        const wx = cx * 16 + lx;
        const wz = cz * 16 + lz;

        for (let ci = chunk.cells.length - 1; ci >= 0; ci--) {
          const cell = chunk.cells[ci];
          if (!cell?.bitArray) continue;
          const yBase = Number(cell.yBase) || 0;
          let done = false;
          for (let ly = 15; ly >= 0 && !done; ly--) {
            const realY = yBase + ly;
            if (realY < 0) break;
            const blockIndex = (ly << 8) | (lz << 4) | lx;
            let raw = 0;
            try { raw = cell.bitArray.get(blockIndex); } catch (_) { continue; }
            const id = cell.palette?.length ? cell.palette[raw] : raw;
            if (id === 0) continue;
            const name = blockNameAt(chunk, id, wx, realY, wz);
            if (!name) break;
            done = true; // solo el bloque superior de la columna
            const h = hashXZ(wx, wz);
            const r = h / 4294967296;
            if (state.emitters.length >= MAX_EMITTERS) return;
            if (GRASS_BLOCKS.has(name) && r < 0.12) {
              state.emitters.push({
                kind: name === 'tall_grass' ? 'tall' : 'low',
                x: wx + 0.5, y: realY + 1, z: wz + 0.5
              });
            } else if (WATER_BLOCKS.has(name) && r < 0.05) {
              state.emitters.push({
                kind: 'water',
                x: wx + 0.5, y: realY + 0.92, z: wz + 0.5
              });
            }
          }
        }
      }
    }
  }

  function randomEmitter(kind) {
    const pool = [];
    for (const e of state.emitters) if (kind === 'any' ? e.kind !== 'water' : e.kind === kind) pool.push(e);
    return pool.length ? pool[(Math.random() * pool.length) | 0] : null;
  }

  function groundHeightAt(x, z, fallback) {
    let best = null, bestD = Infinity;
    for (const e of state.emitters) {
      if (e.kind === 'water') continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bestD) { bestD = d; best = e; }
      if (bestD < 1) break;
    }
    return best ? best.y : (fallback ?? 64);
  }

  // ── Spawn ──────────────────────────────────────────────────────────────
  function spawnParticle(kind, def, now) {
    const mats = state.materials[kind];
    if (!mats?.length) return null;
    const game = state.game;
    const pp = game?.player?.pos;
    if (!pp) return null;
    const scene = getScene(game);
    if (!scene?.add) return null;

    let x, y, z;
    if (kind === 'lilyPad' || kind === 'waterPollen' || kind === 'jellyfish') {
      const em = randomEmitter('water');
      if (!em) return null;
      const off = kind === 'lilyPad' ? 0 : (Math.random() - 0.5) * 6;
      x = em.x + (kind === 'lilyPad' ? 0 : (Math.random() - 0.5) * 5);
      z = em.z + (kind === 'lilyPad' ? 0 : (Math.random() - 0.5) * 5);
      y = kind === 'jellyfish' ? em.y - 1 - Math.random() * 4 : em.y;
      void off;
    } else {
      const ang = Math.random() * Math.PI * 2;
      const dist = def.minDist + Math.random() * (def.spawnRange - def.minDist);
      x = pp.x + Math.cos(ang) * dist;
      z = pp.z + Math.sin(ang) * dist;
      y = pp.y + (Math.random() - 0.5) * (def.heightSpread ?? 3);
      if (kind === 'bird') y = pp.y + def.height * (0.6 + Math.random() * 0.4);
      if (kind === 'butterfly') y = groundHeightAt(x, z, pp.y) + def.height * (0.5 + Math.random() * 0.6);
      if (kind === 'firefly') y = groundHeightAt(x, z, pp.y) + 0.3 + Math.random() * 1.2;
    }

    let matIdx = (Math.random() * mats.length) | 0;
    // jellyfish: color fijo (base por color, frame 0)
    let jellyBase = 0;
    if (kind === 'jellyfish') {
      jellyBase = JELLY_BASES[(Math.random() * JELLY_BASES.length) | 0];
      matIdx = jellyBase;
    }
    // bird: variante fija (bird2/birb2) + dirección inicial
    let birdVariant = 0;
    if (kind === 'bird') {
      birdVariant = (Math.random() < 0.6 ? 0 : 2) + (Math.random() < 0.5 ? 0 : 1);
      matIdx = BIRD_FLY[birdVariant].base;
    }

    try {
      const material = mats[matIdx].clone();
      const geo = kind === 'lilyPad' ? state.horizontalGeometry : state.verticalGeometry;
      const MeshCtor = state.referenceMesh.constructor;
      const mesh = new MeshCtor(geo, material);
      mesh.name = 'MiniFeatherShine' + kind;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      const size = def.size * (0.85 + Math.random() * 0.3);
      if (kind === 'lilyPad') {
        mesh.scale.set(size, 1, size);
        mesh.rotation.y = Math.random() * Math.PI * 2;
      } else {
        mesh.scale.set(size, size, 1);
      }
      mesh.position.set(x, y, z);
      mesh.matrixAutoUpdate = true;
      mesh.updateMatrix();
      mesh.updateMatrixWorld(true);
      scene.add(mesh);
      return {
        kind, mesh, material, x, y, z, born: now, size,
        lifetime: def.lifetime ? def.lifetime * (0.7 + Math.random() * 0.6) : Infinity,
        phase: Math.random() * Math.PI * 2,
        dir: Math.random() * Math.PI * 2,
        jellyBase, birdVariant,
        curMap: material.map
      };
    } catch (_) {
      return null;
    }
  }

  // cambia el map del material de la partícula (sin clonar en cada frame)
  function setParticleFrame(p, mats, idx) {
    const mat = mats[idx];
    if (!mat || p.curMap === mat.map) return;
    p.material.map = mat.map;
    p.material.needsUpdate = true;
    p.curMap = mat.map;
  }

  // ── Update por especie ────────────────────────────────────────────────
  function updateParticle(p, dt, now, camera) {
    const def = SPECIES[p.kind];
    const age = (now - p.born) / 1000;
    if (age > p.lifetime) return false;

    if (p.kind !== 'lilyPad') {
      // billboard hacia la cámara
      try {
        const el = camera?.matrixWorld?.elements;
        if (el && el.length >= 16 && state.scratchVec3) {
          state.scratchVec3.set(el[12], el[13], el[14]);
          p.mesh.lookAt(state.scratchVec3);
        }
      } catch (_) {}
    }

    switch (p.kind) {
      case 'butterfly': {
        p.dir += (Math.random() - 0.5) * 0.8 * def.wander * dt * 60 * 0.05;
        const sp = def.speed * 0.35;
        p.x += Math.cos(p.dir) * sp * dt;
        p.z += Math.sin(p.dir) * sp * 0.7 * dt;
        const ground = groundHeightAt(p.x, p.z, p.y - def.height);
        const targetY = ground + def.height * (0.5 + 0.5 * Math.sin(age * 0.7 + p.phase));
        p.y += (targetY - p.y) * Math.min(1, dt * 1.5);
        const flap = 1 - def.squishAmp * (0.5 + 0.5 * Math.sin(age * def.squishFreq * Math.PI * 2 + p.phase));
        p.mesh.scale.set(p.size * flap, p.size, 1);
        break;
      }
      case 'bird': {
        p.dir += (Math.random() - 0.5) * 0.15 * dt * 8;
        const glide = Math.sin(age / def.glideEvery * Math.PI * 2 + p.phase) > 0.2;
        const sp = def.speed * (glide ? 0.55 : 0.8) * 8;
        p.x += Math.cos(p.dir) * sp * dt;
        p.z += Math.sin(p.dir) * sp * dt;
        p.y += Math.sin(age * 0.4 + p.phase) * 0.35 * dt;
        // frame: variante (0 bird2-left, 1 bird2-right, 2 birb2-left, 3 birb2-right)
        // + aleteo. La dirección visual sigue el movimiento horizontal.
        const goingRight = Math.sin(p.dir) >= 0;
        const v = p.birdVariant || 0;
        const dirIdx = v % 2 === 0 ? (goingRight ? v + 1 : v) : (goingRight ? v : v - 1);
        p.birdVariant = dirIdx;
        const fly = BIRD_FLY[dirIdx];
        const flapF = Math.floor(age * 8) % fly.frames;
        setParticleFrame(p, state.materials.bird, fly.base + flapF);
        break;
      }
      case 'pollen': {
        const gust = Math.sin(age / def.gustEvery * Math.PI * 2 + p.phase) > 0.86;
        const sp = gust ? def.gustSpeed : def.speed * 0.3;
        p.x += sp * dt * 3;
        p.y += Math.sin(age * 1.2 + p.phase) * 0.05 * dt;
        p.z += (Math.random() - 0.5) * 0.45 * dt;
        break;
      }
      case 'waterPollen': {
        p.mesh.position.y = p.y + Math.sin(age * 0.8 + p.phase) * def.bob * 10;
        p.mesh.position.x = p.x + Math.sin(age * 0.2 + p.phase) * def.drift;
        break;
      }
      case 'firefly': {
        // órbita alrededor del pasto (tall: radio/altura mayor, low: pegado)
        const em = p.emitterRef;
        const t = age * 0.9 + p.phase;
        if (em) {
          const r = em.kind === 'tall' ? 1.1 : 0.7;
          const h = em.kind === 'tall' ? 1.4 : 0.55;
          p.x = em.x + Math.cos(t) * r * (0.7 + 0.3 * Math.sin(t * 0.7));
          p.z = em.z + Math.sin(t) * r * (0.7 + 0.3 * Math.cos(t * 0.5));
          p.y = em.y + 0.15 + h * (0.5 + 0.5 * Math.sin(t * 1.7 + p.phase)) + Math.sin(t * 3.1) * 0.08;
        } else {
          p.x += (Math.random() - 0.5) * 0.4 * dt;
          p.z += (Math.random() - 0.5) * 0.4 * dt;
          p.y += Math.sin(age * 2 + p.phase) * 0.1 * dt;
        }
        const idx = Math.floor(age * 1.6 + p.phase) % 2;
        setParticleFrame(p, state.materials.firefly, idx);
        p.material.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(age * 3 + p.phase));
        break;
      }
      case 'lilyPad': {
        break; // estático sobre el agua
      }
      case 'jellyfish': {
        const swim = Math.sin(age * Math.PI * 2 * 0.28 + p.phase);
        p.y += swim * def.swim * 0.35 * dt;
        p.x += Math.sin(age * 0.2 + p.phase) * def.drift * 0.1 * dt;
        p.z += Math.cos(age * 0.15 + p.phase) * def.drift * 0.1 * dt;
        const fi = Math.floor(age * def.animSpeed * 9) % 9;
        setParticleFrame(p, state.materials.jellyfish, p.jellyBase + fi);
        break;
      }
    }

    try {
      if (p.kind !== 'waterPollen' && p.kind !== 'lilyPad') {
        p.mesh.position.set(p.x, p.y, p.z);
      }
      p.mesh.updateMatrix();
      p.mesh.updateMatrixWorld(true);
    } catch (_) {}
    return true;
  }

  // ── Loop principal ────────────────────────────────────────────────────
  function tick(now) {
    if (!state.enabled || state.destroyed) return;
    state.raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - state.lastFrame) / 1000 || 0.016);
    state.lastFrame = now;

    const game = findGame();
    if (!game?.player?.pos) return;
    if (!state.loaded && !ensureResources(getScene(game))) return;
    const camera = getCamera(game);
    const night = isNight(game);

    // spawn escalonado hasta el target por especie
    for (const kind of Object.keys(SPECIES)) {
      const def = SPECIES[kind];
      if (kind === 'firefly' && !night) continue;
      const arr = state.particles[kind];
      const target = Math.min(def.cap, Math.ceil(def.cap * def.density));
      if (arr.length < target && Math.random() < def.spawnRate * dt * 2) {
        const p = spawnParticle(kind, def, now);
        if (p) {
          if (kind === 'firefly') p.emitterRef = randomEmitter('any');
          arr.push(p);
        }
      }
    }

    // update + muerte
    for (const kind of Object.keys(SPECIES)) {
      const arr = state.particles[kind];
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        let alive;
        try { alive = updateParticle(p, dt, now, camera); } catch (_) { alive = false; }
        if (alive && kind === 'firefly' && !night) {
          // de día: fundido de salida
          try {
            p.material.opacity -= dt * 0.8;
            if (p.material.opacity <= 0) alive = false;
          } catch (_) { alive = false; }
        }
        if (!alive) {
          try { p.mesh.removeFromParent?.(); } catch (_) {}
          try { p.material.dispose?.(); } catch (_) {}
          arr.splice(i, 1);
        }
      }
    }
  }

  function clearParticles() {
    for (const kind of Object.keys(state.particles)) {
      const arr = state.particles[kind];
      for (const p of arr) {
        try { p.mesh.removeFromParent?.(); } catch (_) {}
        try { p.material.dispose?.(); } catch (_) {}
      }
      arr.length = 0;
    }
  }

  function scheduleScan() {
    const game = findGame(true);
    if (!game?.world || !state.enabled || state.destroyed) return;
    const world = game.world;
    const proto = getWorldProto(world);
    if (!proto) return;
    const pp = game.player?.pos;
    if (!pp) return;
    state.serverSalt = state.serverSalt || computeServerSalt(game);
    state.stateNameCache.clear();

    state.emitters.length = 0;
    const ccx = Math.floor(pp.x / 16), ccz = Math.floor(pp.z / 16);
    const R = 3;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        scanChunk(world, proto, ccx + dx, ccz + dz);
      }
    }
  }

  function start() {
    if (state.started || state.destroyed) return;
    state.started = true;
    state.lastFrame = performance.now();
    state.raf = requestAnimationFrame(tick);
    state.scanTimer = setInterval(scheduleScan, 1500);
    scheduleScan();
    console.info(TAG, 'activo');
  }

  function stop() {
    if (!state.started) return;
    state.started = false;
    cancelAnimationFrame(state.raf);
    clearInterval(state.scanTimer);
    clearParticles();
    console.info(TAG, 'detenido');
  }

  function applyConfig(detail) {
    state.enabled = !!detail?.enabled;
    if (typeof detail?.assetsBase === 'string' && isValidAssetsUrl(detail.assetsBase)) {
      state.assetsBase = detail.assetsBase;
    }
    if (state.enabled) {
      state.destroyed = false;
      start();
    } else {
      stop();
    }
  }

  document.addEventListener(EVENT_CONFIG, e => {
    try { applyConfig(JSON.parse(e.detail)); } catch (_) {}
  });

  W.MF_ShineAmbience = {
    setEnabled(v) { applyConfig({ enabled: v }); },
    refresh() { state.emitters.length = 0; scheduleScan(); },
    destroy() {
      state.destroyed = true;
      stop();
      state.materials = {};
      state.emitters.length = 0;
    }
  };
})();
