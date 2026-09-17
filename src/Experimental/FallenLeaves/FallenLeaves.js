(() => {
  'use strict';

  const W = globalThis;
  const EVENT_NAME = 'minifeather:fell-leaves-config';
  const TAG = '[MiniFeather Fallen Leaves]';
  const REGION_RADIUS = 2; 
  const REFRESH_MS = 9000;
  const SURFACE_EPSILON = 0.0047; 
  const DENSITY = 0.35;           
  const MIN_SIZE = 0.42;
  const MAX_SIZE = 0.78;

  const FALLING_MAX = 110;
  const FALL_SPAWN_MS = 90;
  const FALL_SPEED = 0.22;        

  const SPECIES = [
    { id: 'oak',      tex: 'oak',    color: 0xB4E861, match: ['oak_leaves'],              frames: 6 },
    { id: 'dark_oak', tex: 'oak',    color: 0x86C94F, match: ['dark_oak_leaves'],         frames: 6 },
    { id: 'birch',    tex: 'birch',  color: 0xCDEB82, match: ['birch_leaves'],            frames: 6 },
    { id: 'spruce',   tex: 'spruce', color: 0x96D6A6, match: ['spruce_leaves'],           frames: 2 },
    { id: 'acacia',   tex: 'acacia', color: 0xB0CF66, match: ['acacia_leaves'],           frames: 2 },
    { id: 'jungle',   tex: 'jungle', color: 0xA9F072, match: ['jungle_leaves'],           frames: 3 }
  ];

  const GROUND = new Set([
    'grass_block', 'dirt', 'podzol', 'coarse_dirt', 'muck',
    'snow', 'snow_block', 'mossy_cobblestone', 'mycelium',
    'sand', 'red_sand', 'gravel', 'stone', 'andesite', 'diorite', 'granite'
  ]);

  try { W.MF_FallenLeavesExperimental?.destroy?.(); } catch (_) {}

  const state = {
    enabled: false,
    destroyed: false,
    game: null,
    world: null,
    scene: null,
    referenceMesh: null,
    materials: [],      
    textures: [],
    buckets: [],        
    speciesIndex: new Map(), 
    speciesFrames: new Map(), 
    bundle: [],         
    verticalGeometry: null, 
    falling: [],        
    canopySpots: [],    
    stateNameCache: new Map(),
    centerCx: Number.NaN,
    centerCz: Number.NaN,
    buildToken: 0,
    building: false,
    scanTimer: 0,
    raf: 0,
    lastSpawn: 0,
    lastFrame: 0,
    lastRefresh: 0,
    lastGameScan: 0,
    serverSalt: 0,
    assetsBase: '',
    leavesPlaced: 0
  };

  function findGame(force = false) {
    const now = performance.now();
    if (!force && state.game?.player && state.game?.world && now - state.lastGameScan < 1200) return state.game;
    state.lastGameScan = now;

    for (const candidate of [W.miniblox, W.__MINIBLOX_GAME__, state.game]) {
      if (candidate?.player && candidate?.world) {
        state.game = candidate;
        return candidate;
      }
    }

    try {
      const react = document.querySelector('#react');
      if (!react) return null;
      for (const root of Object.values(react)) {
        const game = root?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player && game?.world) {
          W.__MINIBLOX_GAME__ = game;
          state.game = game;
          return game;
        }
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
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function computeServerSalt(game) {
    let key = '';
    try {
      key = game?.serverInfo?.serverId || game?.serverInfo?.serverName || game?.serverInfo?.worldType || '';
    } catch (_) {}
    try { key += `|${game?.world?.dimensionId ?? 0}`; } catch (_) {}
    return hashString(key || 'miniblox');
  }

  function hashXZ(x, z) {
    let h = state.serverSalt ^ Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(z | 0, 0x119de1f3);
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
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
      if (isValidAssetsUrl(meta?.content)) {
        state.assetsBase = meta.content;
        return state.assetsBase;
      }
      for (const [name, suffix] of [
        ['mf-mirror-base', 'assets/mfpack/'],
        ['mf-skins-base', 'skins/']
      ]) {
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
      img.onerror = () => reject(new Error('IMG_LOAD'));
      img.src = url;
    });
  }

  function binarizeAlpha(image) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.width || image.naturalWidth;
      canvas.height = image.height || image.naturalHeight;
      if (!canvas.width || !canvas.height) return image;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = data.data;
      for (let i = 3; i < px.length; i += 4) {
        px[i] = px[i] > 110 ? 255 : 0;
      }
      ctx.putImageData(data, 0, 0);
      return canvas;
    } catch (_) {
      return image;
    }
  }

  function findReferenceMesh(scene) {
    if (state.referenceMesh?.geometry?.attributes?.position && state.referenceMesh?.material) return state.referenceMesh;
    if (!scene?.traverse) return null;

    const rank = { MeshLambertMaterial: 0, MeshBasicMaterial: 1, MeshStandardMaterial: 2, MeshPhongMaterial: 3 };
    let best = null;
    let bestRank = 99;

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

  function createMaterial(source, texture, tintColor) {
    let material = null;
    try { material = new source.constructor(); } catch (_) {
      try { material = source.clone(); } catch (_) {}
    }
    if (!material) return null;

    try {
      material.map = texture;
      material.alphaMap = null;
      material.aoMap = null;
      material.lightMap = null;
      material.normalMap = null;
      material.bumpMap = null;
      material.displacementMap = null;
      material.emissiveMap = null;
      material.metalnessMap = null;
      material.roughnessMap = null;
      material.vertexColors = false;
      material.transparent = true;
      material.opacity = 1;
      material.alphaTest = 0.5;
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
      
      material.color?.set?.(tintColor ?? 0xffffff);
      material.emissive?.set?.(0x000000);
      material.onBeforeCompile = function () {};
      material.customProgramCacheKey = () => 'mf-fallen-leaves-v1';
      material.needsUpdate = true;
    } catch (_) {}
    return material;
  }

  function buildVerticalGeometry(referenceMesh) {
    if (state.verticalGeometry) return state.verticalGeometry;
    const refGeo = referenceMesh?.geometry;
    if (!refGeo?.attributes?.position?.constructor) return null;
    try {
      const Geometry = refGeo.constructor;
      const Attr = refGeo.attributes.position.constructor;
      const geometry = new Geometry();
      geometry.setAttribute('position', new Attr(new Float32Array([
        -0.5, 0.0, 0,  0.5, 0.0, 0,  -0.5, 1.0, 0,  0.5, 1.0, 0
      ]), 3));
      geometry.setAttribute('normal', new Attr(new Float32Array([
        0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1
      ]), 3));
      geometry.setAttribute('uv', new Attr(new Float32Array([
        0, 0,  1, 0,  0, 1,  1, 1
      ]), 2));
      geometry.setIndex([0, 1, 2, 2, 1, 3]);
      geometry.computeBoundingBox?.();
      geometry.computeBoundingSphere?.();
      state.verticalGeometry = geometry;
      return geometry;
    } catch (_) {
      return null;
    }
  }

  async function ensureResources(scene) {
    const base = resolveAssetsBase();
    if (!base) return false;
    if (state.materials.length && state.textures.length && state.referenceMesh) return true;

    const ref = findReferenceMesh(scene);
    const source = Array.isArray(ref?.material) ? ref.material[0] : ref?.material;
    const sourceMap = source?.map;
    if (!ref || !source || !sourceMap || typeof sourceMap.constructor !== 'function') return false;

    const entries = [];
    for (const species of SPECIES) {
      for (let i = 0; i < species.frames; i++) {
        entries.push({ url: `${base}particular/${species.tex}_leaf_${i + 1}.png`, species: species.id, frame: i, color: species.color });
      }
    }

    try {
      const textures = [];
      const materials = [];
      const buckets = [];
      const images = await Promise.all(entries.map(e => loadImageUrl(e.url)));
      for (let i = 0; i < entries.length; i++) {
        let image = binarizeAlpha(images[i]);
        try {
          if (typeof createImageBitmap === 'function') {
            image = await createImageBitmap(image, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
          }
        } catch (_) {}
        const texture = new sourceMap.constructor(image);
        copyTextureSettings(sourceMap, texture);
        try {
          if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) texture.flipY = false;
        } catch (_) {}
        texture.needsUpdate = true;
        const material = createMaterial(source, texture, entries[i].color);
        if (!material) throw new Error('No compatible Three.js material');
        textures.push(texture);
        materials.push({ url: entries[i].url, species: entries[i].species, frame: entries[i].frame, material });
        buckets.push([]);
      }
      state.textures = textures;
      state.materials = materials;
      state.buckets = buckets;
      if (!buildVerticalGeometry(ref)) {
        console.warn(TAG, 'sin quad vertical: las hojas no caerán (solo decals)');
      }
      
      try { state.scratchVec3 = ref.position.clone(); } catch (_) {}
      
      for (const species of SPECIES) {
        const frames = materials.filter(m => m.species === species.id);
        state.speciesFrames.set(species.id, frames);
        for (const name of species.match) {
          state.speciesIndex.set(name, frames[0]);
        }
      }
      void 0;
      return true;
    } catch (err) {
      console.warn(TAG, 'No se pudieron cargar las hojas:', String(err?.message || err));
      return false;
    }
  }

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

  function scanChunk(world, proto, cx, cz) {
    let chunk = null;
    try {
      if (typeof proto.isChunkLoaded === 'function' && !proto.isChunkLoaded.call(world, cx, cz)) return;
      chunk = proto.getChunkByID.call(world, cx, cz);
    } catch (_) { return; }
    if (!chunk?.cells) return;

    const mats = state.materials;

    for (let lx = 0; lx < 16; lx++) {
      for (let lz = 0; lz < 16; lz++) {
        const wx = cx * 16 + lx;
        const wz = cz * 16 + lz;

        let species = null;    
        let lastLeafY = -1;    
        let stop = false;

        for (let ci = chunk.cells.length - 1; ci >= 0 && !stop; ci--) {
          const cell = chunk.cells[ci];
          if (!cell?.bitArray) continue;
          const yBase = Number(cell.yBase) || 0;

          for (let ly = 15; ly >= 0 && !stop; ly--) {
            const realY = yBase + ly;
            if (realY < 0) break;
            const blockIndex = (ly << 8) | (lz << 4) | lx;
            let raw = 0;
            try { raw = cell.bitArray.get(blockIndex); } catch (_) { continue; }
            const id = cell.palette?.length ? cell.palette[raw] : raw;
            if (id === 0) continue; 

            const name = blockNameAt(chunk, id, wx, realY, wz);
            if (!name) { stop = true; break; }

            if (state.speciesIndex.has(name)) {
              lastLeafY = realY; 
              species = state.speciesIndex.get(name); 
              continue;
            }
            
            if (name.endsWith('_log') || name.endsWith('_wood')) continue;
            if (name === 'vine' || name === 'cobweb') continue;

            if (species && GROUND.has(name)) {
              const h = hashXZ(wx, wz);
              if (h / 4294967296 < DENSITY) {
                const frames = mats.filter(m => m.species === species.species);
                if (frames.length) {
                  const mat = frames[(h >>> 12) % frames.length];
                  const bi = mats.indexOf(mat);
                  if (bi >= 0) {
                    const size = MIN_SIZE + ((h >>> 20) & 255) / 255 * (MAX_SIZE - MIN_SIZE);
                    const ox = 0.2 + ((h >>> 4) & 63) / 63 * 0.6;
                    const oz = 0.2 + ((h >>> 10) & 63) / 63 * 0.6;
                    state.buckets[bi].push({ x: wx + ox, y: realY + 1 + SURFACE_EPSILON, z: wz + oz, size, rot: (h >>> 8) & 3 });
                    state.leavesPlaced++;
                  }
                }
              }
              
              if (lastLeafY >= 0 && state.canopySpots.length < 800 && (h & 7) === 0) {
                state.canopySpots.push({
                  x: wx + 0.5,
                  y: lastLeafY + 0.25,
                  z: wz + 0.5,
                  targetY: realY + 1 + SURFACE_EPSILON,
                  species: species.species
                });
              }
            }
            stop = true; 
          }
        }
      }
    }
  }

  function uvForRotation(rot) {
    const base = [[0, 1], [1, 1], [0, 0], [1, 0]];
    if ((rot & 3) === 0) return base;
    if ((rot & 3) === 1) return [[0, 0], [0, 1], [1, 0], [1, 1]];
    if ((rot & 3) === 2) return [[1, 0], [0, 0], [1, 1], [0, 1]];
    return [[1, 1], [1, 0], [0, 1], [0, 0]];
  }

  function buildGeometry(referenceGeometry, decals) {
    if (!referenceGeometry?.attributes?.position || !decals.length) return null;
    try {
      const Geometry = referenceGeometry.constructor;
      const Attr = referenceGeometry.attributes.position.constructor;
      const geometry = new Geometry();
      const n = decals.length;
      const positions = new Float32Array(n * 12);
      const normals = new Float32Array(n * 12);
      const uvs = new Float32Array(n * 8);
      const indices = new Uint32Array(n * 6);

      for (let i = 0; i < n; i++) {
        const d = decals[i];
        const half = d.size / 2;
        const x0 = d.x - half, x1 = d.x + half;
        const z0 = d.z - half, z1 = d.z + half;
        const p = i * 12;
        const u = i * 8;
        const q = i * 6;
        positions.set([x0, d.y, z0, x1, d.y, z0, x0, d.y, z1, x1, d.y, z1], p);
        normals.set([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], p);
        const uv = uvForRotation(d.rot);
        uvs.set([uv[0][0], uv[0][1], uv[1][0], uv[1][1], uv[2][0], uv[2][1], uv[3][0], uv[3][1]], u);
        const b = i * 4;
        indices.set([b, b + 2, b + 1, b + 2, b + 3, b + 1], q);
      }

      geometry.setAttribute('position', new Attr(positions, 3));
      geometry.setAttribute('normal', new Attr(normals, 3));
      geometry.setAttribute('uv', new Attr(uvs, 2));
      geometry.setIndex(Array.from(indices));
      geometry.computeBoundingBox?.();
      geometry.computeBoundingSphere?.();
      return geometry;
    } catch (err) {
      console.warn(TAG, 'No se pudo construir la geometría de hojas:', err);
      return null;
    }
  }

  function makeMesh(geometry, material) {
    const ref = state.referenceMesh;
    if (!ref?.constructor || !geometry || !material) return null;
    try {
      const mesh = new ref.constructor(geometry, material);
      mesh.name = 'MiniFeatherFallenLeaves';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.renderOrder = 3;
      
      mesh.matrixAutoUpdate = true;
      mesh.updateMatrix();
      mesh.updateMatrixWorld(true);
      return mesh;
    } catch (_) { return null; }
  }

  function idle(fn) {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 120 });
    else setTimeout(() => fn({ timeRemaining: () => 4 }), 0);
  }

  function spawnFallingLeaf(now) {
    if (!state.canopySpots.length || state.falling.length >= FALLING_MAX) return;
    const scene = state.scene;
    if (!scene?.add || !state.verticalGeometry) return;

    const p = state.game?.player?.pos;
    let spot = null;
    if (p) {
      let total = 0;
      const weights = state.canopySpots.map(s => {
        const d = Math.hypot(s.x - Number(p.x), s.z - Number(p.z));
        const w = d > 40 ? 0 : 1 / (1 + d);
        total += w;
        return w;
      });
      if (total <= 0) return;
      let r = Math.random() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) { spot = state.canopySpots[i]; break; }
      }
    }
    if (!spot) spot = state.canopySpots[(Math.random() * state.canopySpots.length) | 0];

    const frames = state.speciesFrames.get(spot.species);
    if (!frames?.length) return;
    const entry = frames[(Math.random() * frames.length) | 0];

    try {
      
      const material = entry.material.clone();
      const MeshCtor = state.referenceMesh.constructor;
      const mesh = new MeshCtor(state.verticalGeometry, material);
      mesh.name = 'MiniFeatherFallingLeaf';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      const size = 0.26 + Math.random() * 0.16;
      mesh.scale.set(size, size, 1);
      mesh.position.set(spot.x, spot.y, spot.z);
      mesh.matrixAutoUpdate = true;
      mesh.updateMatrix();
      mesh.updateMatrixWorld(true);
      scene.add(mesh);

      state.falling.push({
        mesh,
        material,
        x: spot.x,
        y: spot.y,
        z: spot.z,
        targetY: spot.targetY,
        start: now,
        phase: Math.random() * Math.PI * 2,
        swayFreq: 0.15 + Math.random() * 0.10,  
        swayAmp: 0.9 + Math.random() * 0.8,     
        spinFreq: 0.25 + Math.random() * 0.2,   
        fallJitter: 0.8 + Math.random() * 0.4
      });
    } catch (_) {}
  }

  function tickFalling(now) {
    const dt = Math.min(0.05, (now - state.lastFrame) / 1000 || 0.016);
    state.lastFrame = now;
    const camera = getCamera(state.game || findGame());

    let lookX = NaN, lookY = NaN, lookZ = NaN;
    try {
      const el = camera?.matrixWorld?.elements;
      if (el && el.length >= 16) { lookX = el[12]; lookY = el[13]; lookZ = el[14]; }
    } catch (_) {}
    if (Number.isNaN(lookX)) {
      const pp = state.game?.player?.pos;
      if (pp) { lookX = Number(pp.x); lookY = Number(pp.y) + 1.6; lookZ = Number(pp.z); }
    }
    const v3 = state.scratchVec3;
    const canLook = !!v3 && !Number.isNaN(lookX);

    if (now - state.lastSpawn > FALL_SPAWN_MS && state.falling.length < FALLING_MAX) {
      state.lastSpawn = now;
      spawnFallingLeaf(now);
    }

    for (let i = state.falling.length - 1; i >= 0; i--) {
      const leaf = state.falling[i];
      const age = (now - leaf.start) / 1000;
      const remaining = leaf.y - leaf.targetY;

      if (remaining <= 0.02) {
        try { leaf.mesh.removeFromParent?.(); } catch (_) {}
        try { leaf.material.dispose?.(); } catch (_) {}
        state.falling.splice(i, 1);
        continue;
      }

      leaf.y -= FALL_SPEED * leaf.fallJitter * dt;
      const sway = Math.sin(age * leaf.swayFreq * Math.PI * 2 + leaf.phase) * leaf.swayAmp;
      leaf.mesh.position.set(leaf.x + sway, leaf.y, leaf.z + sway * 0.35);

      try {
        if (canLook) {
          v3.set(lookX, lookY, lookZ);
          leaf.mesh.lookAt(v3);
          leaf.mesh.rotateZ(age * leaf.spinFreq * Math.PI * 2 + leaf.phase);
        }
      } catch (_) {}

      try {
        leaf.mesh.updateMatrix();
        leaf.mesh.updateMatrixWorld(true);
      } catch (_) {}

      leaf.mesh.visible = true;
    }
  }

  async function rebuildRegion(game, centerCx, centerCz, token) {
    const world = game?.world;
    const scene = getScene(game);
    const proto = world && getWorldProto(world);
    if (!world || !scene?.add || !proto) return;
    if (!(await ensureResources(scene)) || token !== state.buildToken || !state.enabled) return;

    const chunks = [];
    for (let dz = -REGION_RADIUS; dz <= REGION_RADIUS; dz++) {
      for (let dx = -REGION_RADIUS; dx <= REGION_RADIUS; dx++) chunks.push([centerCx + dx, centerCz + dz]);
    }
    chunks.sort((a, b) => ((a[0] - centerCx) ** 2 + (a[1] - centerCz) ** 2) - ((b[0] - centerCx) ** 2 + (b[1] - centerCz) ** 2));

    for (const bucket of state.buckets) bucket.length = 0;
    state.canopySpots.length = 0;
    let index = 0;
    state.building = true;

    const step = () => {
      if (token !== state.buildToken || !state.enabled || state.destroyed) { state.building = false; return; }
      idle(() => {
        if (token !== state.buildToken || !state.enabled || state.destroyed) { state.building = false; return; }
        if (index < chunks.length) {
          const [cx, cz] = chunks[index++];
          scanChunk(world, proto, cx, cz);
          step();
          return;
        }

        const next = [];
        for (let i = 0; i < state.buckets.length; i++) {
          const decals = state.buckets[i];
          if (!decals.length) continue;
          const geometry = buildGeometry(state.referenceMesh.geometry, decals);
          const mesh = makeMesh(geometry, state.materials[i].material);
          if (!geometry || !mesh) { try { geometry?.dispose?.(); } catch (_) {} continue; }
          try { scene.add(mesh); next.push({ mesh, geometry }); } catch (_) { try { geometry.dispose?.(); } catch (_) {} }
        }

        if (token !== state.buildToken || !state.enabled) {
          for (const r of next) { try { r.mesh?.removeFromParent?.(); r.geometry?.dispose?.(); } catch (_) {} }
          state.building = false;
          return;
        }

        clearBundle();
        state.bundle = next;
        state.building = false;
      });
    };

    step();
  }

  function clearBundle() {
    for (const record of state.bundle) {
      try { record.mesh?.removeFromParent?.(); } catch (_) {}
      try { record.geometry?.dispose?.(); } catch (_) {}
    }
    state.bundle = [];
  }

  function clearFalling() {
    for (const leaf of state.falling) {
      try { leaf.mesh?.removeFromParent?.(); } catch (_) {}
      try { leaf.material?.dispose?.(); } catch (_) {}
    }
    state.falling = [];
  }

  function disposeResources() {
    clearBundle();
    clearFalling();
    for (const entry of state.materials) { try { entry.material?.dispose?.(); } catch (_) {} }
    for (const texture of state.textures) { try { texture?.dispose?.(); } catch (_) {} }
    state.materials = [];
    state.textures = [];
    state.buckets = [];
    state.canopySpots.length = 0;
    state.referenceMesh = null;
    try { state.verticalGeometry?.dispose?.(); } catch (_) {}
    state.verticalGeometry = null;
  }

  function schedule(force = false) {
    if (!state.enabled || state.destroyed) return;

    const game = findGame(force);
    const world = game?.world;
    const scene = getScene(game);
    if (!game || !world || !scene) return;

    const p = game.player?.pos;
    if (!p) return;

    if (state.world !== world || state.scene !== scene) {
      clearBundle();
      state.stateNameCache.clear();
      state.world = world;
      state.scene = scene;
      state.centerCx = Number.NaN;
      state.centerCz = Number.NaN;
      state.serverSalt = computeServerSalt(game);
    }

    const cx = Math.floor(Number(p.x) / 16);
    const cz = Math.floor(Number(p.z) / 16);
    const now = performance.now();
    if (!force && cx === state.centerCx && cz === state.centerCz && now - state.lastRefresh < REFRESH_MS) return;

    state.centerCx = cx;
    state.centerCz = cz;
    state.lastRefresh = now;

    const token = ++state.buildToken;
    state.leavesPlaced = 0;
    rebuildRegion(game, cx, cz, token).catch(err => {
      if (token === state.buildToken) state.building = false;
      console.warn(TAG, 'Rebuild falló:', err);
    });
  }

  function tick(now) {
    if (state.destroyed || !state.enabled) {
      state.raf = 0;
      return;
    }
    tickFalling(now);
    state.raf = requestAnimationFrame(tick);
  }

  function start() {
    if (state.scanTimer) return;
    state.serverSalt = computeServerSalt(findGame(true));
    schedule(true);
    state.scanTimer = setInterval(() => schedule(false), 900);
    if (!state.raf) {
      state.lastFrame = performance.now();
      state.raf = requestAnimationFrame(tick);
    }
  }

  function stop() {
    if (state.scanTimer) clearInterval(state.scanTimer);
    state.scanTimer = 0;
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    }
    state.buildToken++;
    state.building = false;
    clearFalling();
    disposeResources();
    state.stateNameCache.clear();
    state.world = null;
    state.scene = null;
    state.centerCx = Number.NaN;
    state.centerCz = Number.NaN;
  }

  function setEnabled(value) {
    const enabled = !!value;
    if (state.enabled === enabled) return;
    state.enabled = enabled;
    if (enabled) start(); else stop();
  }

  function applyConfig(detail) {
    let cfg = detail;
    if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch (_) { return; } }
    if (!cfg || typeof cfg !== 'object') return;
    if (isValidAssetsUrl(cfg.assetsBase) && state.assetsBase !== cfg.assetsBase) {
      state.assetsBase = cfg.assetsBase;
      disposeResources(); 
    }
    setEnabled(cfg.enabled);
  }

  const configHandler = event => applyConfig(event.detail);
  document.addEventListener(EVENT_NAME, configHandler);

  W.MF_FallenLeavesExperimental = {
    setEnabled,
    refresh() { schedule(true); },
    get enabled() { return state.enabled; },
    get decorativeMeshes() { return state.bundle.length; },
    get fallingLeaves() { return state.falling.length; },
    get canopySpots() { return state.canopySpots.length; },
    get leavesPlaced() { return state.leavesPlaced; },
    get materialCount() { return state.materials.length; },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      stop();
      document.removeEventListener(EVENT_NAME, configHandler);
      try { delete W.MF_FallenLeavesExperimental; } catch (_) {}
    }
  };
})();
