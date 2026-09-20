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
      cap: 60, density: 0.9, spawnRate: 5, spawnRange: 32, minDist: 5,
      height: 2.2, speed: 1.1, wander: 0.85, lifetime: 4, size: 0.32,
      squishAmp: 0.18, squishFreq: 2.4,
      group: { min: 4, max: 9, spread: 2.5, sameColor: false }
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
      cap: 8, density: 1, spawnRate: 0.8, spawnRange: 80, minDist: 30,
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
      cap: 160, density: 0.95, spawnRate: 14, spawnRange: 26, minDist: 3,
      size: 0.5, alpha: 1, lifetime: 26,
      group: { min: 2, max: 6, spread: 1.2, sameColor: true }
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
    },
    boatWake: {
      // estela de bote: espuma en V detrás del casco (boat_trail_foam) +
      // salpicaduras laterales que se alejan (boat_trail_wake).
      // Parámetros de defaults/experimental.json (boatTrailSplash*).
      texs: () => {
        const out = [];
        for (let i = 1; i <= 24; i++) out.push(`boat_trail_splash/splash_${String(i).padStart(2, '0')}.png`);
        return out;
      },
      cap: 220, size: 0.48, alpha: 1, animSpeed: 1,
      speedThreshold: 0.06, spawnRate: 20,
      foamDensity: 11.25, outwardDensity: 1.1, hullSpread: 1,
      followStrength: 0.78, outwardSpeed: 1, lift: 1, gravity: 1, drag: 1
    },
    shootingStar: {
      // Estrellas fugaces nocturnas. En el pack Shine es un efecto de shader
      // (sin texturas), así que los sprites son procedurales; los parámetros
      // vienen de defaults/experimental.json (shootingStar*): intervalo
      // 25-90s, velocidad 1.28, ángulo fijo 34°±8°, tamaño 2.5, hues
      // 150/210/285, saturación 0.416, colorPunch 2.1.
      texs: () => [],
      minSeconds: 25, maxSeconds: 90, firstSeconds: [6, 20],
      travelSpeed: 1.28, curve: 1, size: 2.5,
      hues: [150, 210, 285], saturation: 0.4157, colorPunch: 2.1,
      cap: 2, trailLife: 0.55, trailCap: 260
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
  const MAX_EMITTERS = 420;

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
    particles: { butterfly: [], bird: [], pollen: [], waterPollen: [], firefly: [], lilyPad: [], jellyfish: [], boatWake: [], shootingStar: [] },
    boats: new Map(),
    density: 1,
    starSpriteTex: null,
    nextStarAt: 0,
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
            if (GRASS_BLOCKS.has(name) && r < 0.30) {
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

  // ── Estrellas fugaces (shader del pack → sprites procedurales) ────────
  function starHueToRgb(hue) {
    // HSL→RGB rápido (l calculado por quien llama)
    const s = SPECIES.shootingStar.saturation;
    const l = 0.75;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = (((hue % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = l - c / 2;
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function buildStarSpriteTexture(source, sourceMap) {
    if (state.starSpriteTex) return state.starSpriteTex;
    try {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      // glow radial blanco-cálido: núcleo sólido + halo con colorPunch
      const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.18, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.42, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      const TextureCtor = sourceMap.constructor;
      const texture = new TextureCtor(canvas);
      copyTextureSettings(sourceMap, texture);
      texture.needsUpdate = true;
      state.starSpriteTex = texture;
    } catch (_) {
      state.starSpriteTex = null;
    }
    return state.starSpriteTex;
  }

  function spawnShootingStar(game, pp, now) {
    const def = SPECIES.shootingStar;
    const scene = getScene(game);
    if (!scene?.add || !state.referenceMesh) return;

    // sprite de la cabeza
    const tex = buildStarSpriteTexture(null, state.materials.firefly?.[0]?.map);
    if (!tex) return;
    const baseMat = state.materials.firefly?.[0];
    if (!baseMat) return;
    try {
      const material = baseMat.clone();
      material.map = tex;
      material.emissive?.set?.(0xffffff);
      if ('emissiveIntensity' in material) material.emissiveIntensity = 1.2;
      material.opacity = 1;
      material.transparent = true;
      material.depthWrite = false;
      material.needsUpdate = true;
      material.__mfStarColor = null; // se pinta abajo vía color

      const MeshCtor = state.referenceMesh.constructor;
      const head = new MeshCtor(state.verticalGeometry, material);
      head.name = 'MiniFeatherShineStar';
      head.castShadow = false; head.receiveShadow = false;
      head.frustumCulled = false;
      head.renderOrder = 4;

      // dirección: ángulo fijo 34° ± 8° del pack, azimut aleatorio
      const angleDeg = 34 + (Math.random() * 2 - 1) * 8;
      const angleRad = angleDeg * Math.PI / 180;
      const azim = Math.random() * Math.PI * 2;
      // cae hacia abajo: x/z horizontal, y descendente según pendiente
      const horiz = Math.cos(angleRad);
      const speed = def.travelSpeed * 26;
      const vx = Math.cos(azim) * horiz * speed;
      const vz = Math.sin(azim) * horiz * speed;
      const vy = -Math.sin(angleRad) * speed;

      // spawn sobre el jugador, a la vista: 60-100 bloques de altura
      const y = pp.y + 60 + Math.random() * 40;
      const dist = 40 + Math.random() * 60;
      const sx = pp.x + Math.cos(azim) * dist;
      const sz = pp.z + Math.sin(azim) * dist;

      const hue = def.hues[(Math.random() * def.hues.length) | 0];
      // tinte del pack: mezcla blanca + hue (teal/azul/morado), colorPunch
      // aplicado como saturación extra del tinte
      const [r, g, b] = starHueToRgb(hue);
      const tint = ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
      try {
        // color base más claro (mezcla 50/50 con blanco) para el "punch"
        const cr = Math.min(255, Math.round((r + 255) / 2 * Math.min(1, 0.6 + 0.2 * (def.colorPunch - 1))));
        const cg = Math.min(255, Math.round((g + 255) / 2 * Math.min(1, 0.6 + 0.2 * (def.colorPunch - 1))));
        const cb = Math.min(255, Math.round((b + 255) / 2 * Math.min(1, 0.6 + 0.2 * (def.colorPunch - 1))));
        material.color?.set?.((cr << 16) | (cg << 8) | cb);
      } catch (_) {}
      void tint;

      const star = {
        kind: 'shootingStar', mesh: head, material, x: sx, y, z: sz,
        vx, vy, vz, born: now, size: def.size,
        hue, tintColor: material.color?.getHex?.() ?? 0xffffff,
        phase: Math.random() * Math.PI * 2,
        life: 2.2 + Math.random() * 1.3,
        trail: [], trailAcc: 0,
        trailTex: tex
      };
      head.position.set(sx, y, sz);
      head.scale.set(def.size, def.size, 1);
      scene.add(head);
      state.particles.shootingStar.push(star);
    } catch (_) {}
  }

  function updateShootingStars(dt, now, camera) {
    const def = SPECIES.shootingStar;
    const arr = state.particles.shootingStar;
    const game = state.game;
    const pp = game?.player?.pos;

    // spawn programado (solo de noche, igual que el shader del pack)
    if (pp && isNight(game) && arr.length < Math.ceil(def.cap * state.density)) {
      if (!state.nextStarAt) {
        state.nextStarAt = now + 1000 * (def.firstSeconds[0] +
          Math.random() * (def.firstSeconds[1] - def.firstSeconds[0]));
      } else if (now >= state.nextStarAt) {
        spawnShootingStar(game, pp, now);
        state.nextStarAt = now + 1000 * (def.minSeconds +
          Math.random() * (def.maxSeconds - def.minSeconds));
      }
    }
    if (!isNight(game)) state.nextStarAt = 0;

    for (let s = arr.length - 1; s >= 0; s--) {
      const star = arr[s];
      const t = (now - star.born) / 1000;
      if (t > star.life) {
        try { star.mesh.removeFromParent?.(); } catch (_) {}
        try { star.material.dispose?.(); } catch (_) {}
        for (const d of star.trail) {
          try { d.mesh.removeFromParent?.(); } catch (_) {}
          try { d.material.dispose?.(); } catch (_) {}
        }
        star.trail.length = 0;
        arr.splice(s, 1);
        continue;
      }
      // curva: el pack usa curve 1 → ligera caída adicional
      const curveF = 1 + t * 0.35 * def.curve;
      const nx = star.x + star.vx * dt * curveF;
      const ny = star.y + star.vy * dt * curveF;
      const nz = star.z + star.vz * dt * curveF;
      star.x = nx; star.y = ny; star.z = nz;

      // estela: spawn de puntos por distancia recorrida
      const seg = Math.hypot(nx - (star.lx ?? nx), ny - (star.ly ?? ny), nz - (star.lz ?? nz));
      star.lx = nx; star.ly = ny; star.lz = nz;
      star.trailAcc += seg;
      const step = 1.2;
      while (star.trailAcc > step && star.trail.length < def.trailCap) {
        star.trailAcc -= step;
        spawnTrailDot(star, now);
      }
      updateTrailDots(star, now, camera);

      // billboard + fade final
      try {
        const el = camera?.matrixWorld?.elements;
        if (el && el.length >= 16 && state.scratchVec3) {
          state.scratchVec3.set(el[12], el[13], el[14]);
          star.mesh.lookAt(state.scratchVec3);
        }
      } catch (_) {}
      const fadeT = t / star.life;
      const opacity = fadeT > 0.75 ? 1 - (fadeT - 0.75) / 0.25 : 1;
      try { star.material.opacity = opacity; } catch (_) {}
      try {
        star.mesh.position.set(star.x, star.y, star.z);
        star.mesh.updateMatrix();
        star.mesh.updateMatrixWorld(true);
      } catch (_) {}
    }
  }

  function spawnTrailDot(star, now) {
    const scene = getScene(state.game);
    if (!scene?.add) return;
    const baseMat = state.materials.firefly?.[0];
    if (!baseMat || !star.trailTex) return;
    try {
      const material = baseMat.clone();
      material.map = star.trailTex;
      material.opacity = 0.55;
      material.transparent = true;
      material.depthWrite = false;
      material.needsUpdate = true;
      material.color?.set?.(star.tintColor);
      const MeshCtor = state.referenceMesh.constructor;
      const dot = new MeshCtor(state.verticalGeometry, material);
      dot.name = 'MiniFeatherShineStarTrail';
      dot.castShadow = false; dot.receiveShadow = false;
      dot.frustumCulled = false;
      dot.renderOrder = 3;
      dot.position.set(star.x, star.y, star.z);
      const sz = 0.35 + Math.random() * 0.25;
      dot.scale.set(sz, sz, 1);
      dot.updateMatrix();
      dot.updateMatrixWorld(true);
      scene.add(dot);
      star.trail.push({ mesh: dot, material, born: now, size: sz });
    } catch (_) {}
  }

  function updateTrailDots(star, now, camera) {
    const def = SPECIES.shootingStar;
    for (let i = star.trail.length - 1; i >= 0; i--) {
      const d = star.trail[i];
      const age = (now - d.born) / 1000;
      if (age > def.trailLife) {
        try { d.mesh.removeFromParent?.(); } catch (_) {}
        try { d.material.dispose?.(); } catch (_) {}
        star.trail.splice(i, 1);
        continue;
      }
      const k = 1 - age / def.trailLife;
      try {
        d.material.opacity = 0.55 * k;
        const s = d.size * (0.3 + 0.7 * k);
        d.mesh.scale.set(s, s, 1);
        const el = camera?.matrixWorld?.elements;
        if (el && el.length >= 16 && state.scratchVec3) {
          state.scratchVec3.set(el[12], el[13], el[14]);
          d.mesh.lookAt(state.scratchVec3);
        }
        d.mesh.updateMatrix();
        d.mesh.updateMatrixWorld(true);
      } catch (_) {}
    }
  }

  // ── Spawn ──────────────────────────────────────────────────────────────
  // anchor: si viene, la partícula nace junto al líder de su grupo (misma
  // posición aproximada y, en fireflies, el mismo emitter de pasto).
  function spawnParticle(kind, def, now, anchor) {
    const mats = state.materials[kind];
    if (!mats?.length) return null;
    const game = state.game;
    const pp = game?.player?.pos;
    if (!pp) return null;
    const scene = getScene(game);
    if (!scene?.add) return null;

    let x, y, z;
    let emitterRef = null;
    if (anchor) {
      const g = def.group;
      x = anchor.x + (Math.random() - 0.5) * g.spread * 2;
      z = anchor.z + (Math.random() - 0.5) * g.spread * 2;
      y = anchor.y + (Math.random() - 0.5) * g.spread;
      emitterRef = anchor.emitterRef || null;
    } else if (kind === 'lilyPad' || kind === 'waterPollen' || kind === 'jellyfish') {
      const em = randomEmitter('water');
      if (!em) return null;
      x = em.x + (kind === 'lilyPad' ? 0 : (Math.random() - 0.5) * 5);
      z = em.z + (kind === 'lilyPad' ? 0 : (Math.random() - 0.5) * 5);
      y = kind === 'jellyfish' ? em.y - 1 - Math.random() * 4 : em.y;
    } else {
      const ang = Math.random() * Math.PI * 2;
      const dist = def.minDist + Math.random() * (def.spawnRange - def.minDist);
      x = pp.x + Math.cos(ang) * dist;
      z = pp.z + Math.sin(ang) * dist;
      y = pp.y + (Math.random() - 0.5) * (def.heightSpread ?? 3);
      if (kind === 'bird') y = pp.y + def.height * (0.6 + Math.random() * 0.4);
      if (kind === 'butterfly') y = groundHeightAt(x, z, pp.y) + def.height * (0.5 + Math.random() * 0.6);
      if (kind === 'firefly') {
        emitterRef = randomEmitter('any');
        if (emitterRef) { x = emitterRef.x; z = emitterRef.z; y = emitterRef.y + 0.3 + Math.random() * 1.2; }
        else y = groundHeightAt(x, z, pp.y) + 0.3 + Math.random() * 1.2;
      }
    }

    let matIdx = (Math.random() * mats.length) | 0;
    // grupo monocolor: hereda la textura del líder
    if (anchor && def.group?.sameColor && typeof anchor.matIdx === 'number') matIdx = anchor.matIdx;
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
        jellyBase, birdVariant, matIdx, emitterRef,
        leaderRef: anchor || null,
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
        // seguidor de grupo: deriva hacia su líder para mantener la bandada
        if (p.leaderRef) {
          const L = p.leaderRef;
          const dx = L.x - p.x, dz = L.z - p.z, dy = L.y - p.y;
          const d2 = dx * dx + dz * dz;
          if (d2 > 1.2) {
            const d = Math.sqrt(d2);
            const pull = Math.min(1, (d - 1) * 0.6) * 1.6 * dt;
            p.x += (dx / d) * pull;
            p.z += (dz / d) * pull;
            p.dir = Math.atan2(dz, dx);
          }
          p.y += dy * Math.min(1, dt * 0.8);
        }
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

  // ── Estela de botes (boat_trail_foam + boat_trail_wake) ───────────────
  function boatTypeKey(entity) {
    const t = entity?.type;
    if (typeof t === 'string' && t) return t.toLowerCase();
    return String(entity?.constructor?.name || '').replace(/^Entity/, '').toLowerCase();
  }

  function isBoatEntity(entity) {
    const key = boatTypeKey(entity);
    if (!key) return false;
    return key === 'boat' || key.endsWith('_boat') || key.includes('boat');
  }

  function resolveEntityMap() {
    const world = state.game?.world;
    for (const candidate of [world?.entities, world?.entityMap, world?.entitiesDump]) {
      if (candidate && typeof candidate.values === 'function') {
        return candidate;
      }
    }
    return null;
  }

  function spawnWakeParticle(kind, x, y, z, vx, vy, vz, size) {
    const mats = state.materials.boatWake;
    if (!mats?.length) return null;
    const scene = getScene(state.game);
    if (!scene?.add) return null;
    try {
      const matIdx = (Math.random() * mats.length) | 0;
      const material = mats[matIdx].clone();
      const MeshCtor = state.referenceMesh.constructor;
      const mesh = new MeshCtor(state.horizontalGeometry, material);
      mesh.name = 'MiniFeatherShine' + kind;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      mesh.scale.set(size, 1, size);
      mesh.position.set(x, y, z);
      mesh.matrixAutoUpdate = true;
      mesh.updateMatrix();
      mesh.updateMatrixWorld(true);
      scene.add(mesh);
      return {
        kind: 'boatWake', mesh, material, x, y, z, vx, vy, vz,
        born: performance.now(), size,
        life: 550 + Math.random() * 400,
        animStart: matIdx,
        curMap: material.map
      };
    } catch (_) {
      return null;
    }
  }

  function updateBoatWakes(dt) {
    const def = SPECIES.boatWake;
    const game = state.game;
    if (!game?.world) return;
    const pp = game?.player?.pos;
    if (!pp) return;
    const now = performance.now();

    const entities = resolveEntityMap();
    if (!entities) return;

    // limpiar botes que ya no existen
    const seen = new Set();
    try {
      for (const entity of entities.values()) {
        if (!isBoatEntity(entity)) continue;
        const key = entity?.id !== undefined ? `id:${entity.id}`
          : entity?.uuid ? `uuid:${entity.uuid}` : null;
        if (!key || !entity?.pos) continue;
        seen.add(key);

        const speed = Math.hypot(
          Number(entity.motion?.x ?? 0), Number(entity.motion?.z ?? 0)
        );
        const inWater = entity.inWater === true;

        let boat = state.boats.get(key);
        if (!boat) {
          boat = { x: 0, y: 0, z: 0, lastSpawn: 0, lostAt: 0 };
          state.boats.set(key, boat);
        }
        boat.pos = entity.pos;
        boat.lostAt = now;

        if (!inWater || speed < def.speedThreshold) continue;
        if (now - boat.lastSpawn < 1000 / (def.spawnRate * state.density)) continue;
        boat.lastSpawn = now;

        const dirX = Number(entity.motion.x) / (speed || 1);
        const dirZ = Number(entity.motion.z) / (speed || 1);
        const yaw = Number(entity.yaw ?? entity.rotation?.y ?? 0);
        void yaw;
        const sternX = Number(entity.pos.x) - dirX * 0.9;
        const sternZ = Number(entity.pos.z) - dirZ * 0.9;
        const waterY = Number(entity.pos.y) + 0.1;

        // espuma en V: partículas que siguen la dirección del bote (foam)
        const foamCount = Math.max(1, Math.round(def.foamDensity * 0.35));
        const foamCap = Math.ceil(def.cap * state.density);
        for (let i = 0; i < foamCount && state.particles.boatWake.length < foamCap; i++) {
          const side = Math.random() < 0.5 ? -1 : 1;
          const latX = -dirZ * side, latZ = dirX * side;
          const back = 0.3 + Math.random() * 1.4;
          const out = (Math.random() * 0.25) * def.outwardSpeed;
          const p = spawnWakeParticle(
            'Foam',
            sternX - dirX * back + latX * (0.3 + Math.random() * 0.3),
            waterY,
            sternZ - dirZ * back + latZ * (0.3 + Math.random() * 0.3),
            -dirX * 0.12 * def.followStrength + latX * out,
            def.lift * (0.5 + Math.random() * 0.5) * 0.15,
            -dirZ * 0.12 * def.followStrength + latZ * out,
            def.size * (0.8 + Math.random() * 0.5)
          );
          if (p) state.particles.boatWake.push(p);
        }

        // wake: salpicaduras laterales más rápidas que se alejan del casco
        const wakeCount = Math.max(1, Math.round(def.outwardDensity * 0.4));
        for (let i = 0; i < wakeCount && state.particles.boatWake.length < foamCap; i++) {
          const side = Math.random() < 0.5 ? -1 : 1;
          const latX = -dirZ * side, latZ = dirX * side;
          const p = spawnWakeParticle(
            'Wake',
            sternX + latX * 0.4,
            waterY,
            sternZ + latZ * 0.4,
            latX * (0.5 + Math.random() * 0.4) * def.outwardSpeed,
            def.lift * (0.8 + Math.random() * 0.6) * 0.3,
            latZ * (0.5 + Math.random() * 0.4) * def.outwardSpeed,
            def.size * (0.6 + Math.random() * 0.4)
          );
          if (p) state.particles.boatWake.push(p);
        }
      }
    } catch (_) {}

    for (const [key, boat] of state.boats) {
      if (!seen.has(key) || now - boat.lostAt > 3000) state.boats.delete(key);
    }

    // update + muerte de partículas de estela
    const arr = state.particles.boatWake;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      const progress = (now - p.born) / p.life;
      if (progress >= 1) {
        try { p.mesh.removeFromParent?.(); } catch (_) {}
        try { p.material.dispose?.(); } catch (_) {}
        arr.splice(i, 1);
        continue;
      }
      const t = (now - p.born) / 1000;
      const dragF = Math.max(0, 1 - def.drag * t);
      p.mesh.position.set(
        p.x + p.vx * t * dragF,
        p.y + p.vy * t - 0.5 * def.gravity * t * t * 0.2,
        p.z + p.vz * t * dragF
      );
      let opacity = 1;
      if (progress < 0.08) opacity = progress / 0.08;
      if (progress > 0.6) opacity = 1 - (progress - 0.6) / 0.4;
      try { p.material.opacity = Math.max(0, Math.min(1, opacity)) * def.alpha; } catch (_) {}
      // animación de frames 24 (secuencia splash)
      const frame = Math.floor((now - p.born) / 1000 * 24 * def.animSpeed * 0.5) % 24;
      setParticleFrame(p, state.materials.boatWake, frame);
      p.mesh.visible = true;
    }
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

    updateBoatWakes(dt);
    updateShootingStars(dt, now, camera);

    // spawn escalonado hasta el target por especie (en grupos cuando aplica)
    // density: multiplicador del slider de Settings (afecta a TODO el pack,
    // incluidas las estelas de botes; el splash de WaterSplash es aparte)
    for (const kind of Object.keys(SPECIES)) {
      if (kind === 'boatWake' || kind === 'shootingStar') continue; // sistemas propios
      const def = SPECIES[kind];
      if (kind === 'firefly' && !night) continue;
      const arr = state.particles[kind];
      const target = Math.ceil(def.cap * def.density * state.density);
      if (arr.length < target && Math.random() < def.spawnRate * state.density * dt * 2) {
        const leader = spawnParticle(kind, def, now);
        if (leader) {
          arr.push(leader);
          if (def.group) {
            const n = def.group.min + Math.floor(Math.random() * (def.group.max - def.group.min + 1));
            for (let i = 1; i < n && arr.length < target; i++) {
              const p = spawnParticle(kind, def, now, leader);
              if (p) arr.push(p);
            }
          }
        }
      }
    }

    // update + muerte
    for (const kind of Object.keys(SPECIES)) {
      if (kind === 'boatWake' || kind === 'shootingStar') continue; // sistemas propios
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
        if (Array.isArray(p.trail)) {
          for (const d of p.trail) {
            try { d.mesh.removeFromParent?.(); } catch (_) {}
            try { d.material.dispose?.(); } catch (_) {}
          }
          p.trail.length = 0;
        }
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
    const newDensity = Math.max(0.1, Math.min(3, Number(detail?.density) || 1));
    const densityChanged = newDensity !== state.density;
    state.density = newDensity;
    if (densityChanged) clearParticles(); // repuebla con los nuevos targets
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
