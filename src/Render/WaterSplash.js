(function () {
  'use strict';

  // Splash cinematográfico al caer al agua (portado del mod "Shine").
  // Detecta la transición aire→agua de cualquier entidad (jugador local,
  // remotos y mobs) con velocidad de caída, y renderiza las 4 capas del
  // "trailer splash" como DECALS HORIZONTALES a ras del agua (patrón
  // GrassFlowers: quad plano con normal +Y, constructores robados de meshes
  // vivos + material con depthTest). Es como un bloque decorativo que
  // aparece en la superficie: sin colisión, no gira con la cámara.

  const EVENT_CONFIG = 'minifeather:water-splash-config';
  const GLOBAL_KEY = '__MINIFEATHER_WATER_SPLASH__';
  const TAG = '[MiniFeather WaterSplash]';

  const SPLASH_LIFE_MS = 700;
  const SCAN_MS = 60;
  const MIN_FALL_SPEED = 0.08;
  const HOOK_MS = 900;

  // Capas: [carpeta, frames, retraso (ms), altura de origen (bloques), escala base]
  const LAYERS = [
    { dir: 'band',   frames: 10, delay: 0,   yOffset: 0.10, scale: 1.30 },
    { dir: 'low',    frames: 8,  delay: 40,  yOffset: 0.15, scale: 1.05 },
    { dir: 'middle', frames: 13, delay: 90,  yOffset: 0.45, scale: 0.90 },
    { dir: 'outer',  frames: 13, delay: 160, yOffset: 0.90, scale: 0.75 }
  ];

  const DROPLET_COUNT = 14;
  const DROPLET_LIFE_MS = 620;

  // Lluvia: mini-splashes (ondas) sobre la superficie del agua.
  // Usa el pack Particular: water_ripple_1..7 (7 frames animados reales)
  const RAIN_MS = 130;
  const RAIN_RADIUS = 22;      // zona de ondas: radio 22 bloques alrededor
  const RAIN_MAX_MESHES = 140;
  const RAIN_LIFE_MS = 480;
  const RAIN_FRAMES = 7;

  function rainFrameUrl(index) {
    const base = resolveAssetsBase();
    if (!base) return '';
    return `${base}particular/water_ripple_${index + 1}.png`;
  }

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  console.log(TAG, 'script cargado, esperando config del panel...');

  const state = {
    enabled: false,
    destroyed: false,
    game: null,
    entityMap: null,
    lastGameScan: 0,
    wasInWater: new Map(), // entityKey -> { inWater, seenAt }
    splashes: [],          // { mesh, mat, start, layer, power, x,y,z }
    droplets: [],          // { mesh, mat, start, x,y,z, vx,vy,vz, seed }
    // recursos compartidos (robados del juego, patrón GrassFlowers)
    referenceMesh: null,
    textures: new Map(),   // url -> texture
    materials: new Map(),  // url -> material (uno por frame para swap barato)
    quadGeometry: null,
    dropletGeometry: null,
    assetsBase: '',
    resourcesReady: false,
    resourcesPromise: null,
    scanTimer: 0,
    raf: 0
  };

  // ── juego / escena / entidades ───────────────────────────────────

  function findGame(force = false) {
    const now = performance.now();
    if (!force && state.game?.player && state.game?.world && now - state.lastGameScan < 1200) return state.game;
    state.lastGameScan = now;

    for (const candidate of [globalThis.miniblox, globalThis.__MINIBLOX_GAME__, state.game]) {
      if (candidate?.player && candidate?.world) {
        state.game = candidate;
        return candidate;
      }
    }

    try {
      const react = document.querySelector('#react');
      if (react) {
        for (const value of Object.values(react)) {
          const game = value?.updateQueue?.baseState?.element?.props?.game;
          if (game?.player && game?.world) {
            globalThis.__MINIBLOX_GAME__ = game;
            state.game = game;
            return game;
          }
        }
      }
    } catch (_) {}

    return null;
  }

  function getScene(game) {
    const gs = game?.gameScene;
    if (gs?.scene?.isObject3D) return gs.scene;
    if (gs?.isObject3D) return gs;
    // la raíz puede llamarse distinto según versión: buscar el primer
    // Object3D (con add/traverse) dentro de gameScene
    try {
      for (const key of Object.keys(gs || {})) {
        const value = gs[key];
        if (value?.isObject3D && typeof value.traverse === 'function' && typeof value.add === 'function') {
          return value;
        }
      }
    } catch (_) {}
    return game?.scene?.scene || gs || game?.scene || null;
  }

  // Inspección de escena para diagnóstico: qué hay y con qué materiales
  function inspectScene() {
    const game = findGame(true);
    const scene = getScene(game);
    const report = {
      hasGame: !!game,
      hasGameScene: !!game?.gameScene,
      sceneType: scene?.constructor?.name || typeof scene,
      sceneIsObject3D: !!scene?.isObject3D,
      children: scene?.children?.length ?? null,
      meshes: 0,
      materialsWithMap: 0,
      materialTypes: {}
    };
    try {
      scene?.traverse?.(obj => {
        if (!obj?.isMesh) return;
        report.meshes++;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          const type = mat?.type || mat?.constructor?.name || 'unknown';
          report.materialTypes[type] = (report.materialTypes[type] || 0) + 1;
          if (mat?.map) report.materialsWithMap++;
        }
      });
    } catch (err) {
      report.traverseError = String(err?.message || err);
    }
    return report;
  }

  function getCamera(game) {
    return game?.gameScene?.camera || game?.camera || null;
  }

  // Busca la Y de la SUPERFICIE del agua escaneando bloques hacia arriba
  // desde los pies de la entidad: al detectarse la entrada al agua los
  // pies ya están bajo la superficie, y un decal sumergido no se ve.
  // Usa el id del bloque donde están los pies como referencia de "agua".
  // registro de bloques del juego (patrón WorldMap.js): permite resolver
  // el NOMBRE del bloque ('water') en vez de depender de ids numéricos
  let _blockRegistry = null;

  // recorre la cadena de prototipos buscando los métodos de mundo (el
  // juego puede tenerlos a más de un nivel — patrón getWorldProto2)
  function getWorldProtoDeep(world) {
    try {
      let proto = world && Object.getPrototypeOf(world);
      for (let i = 0; i < 6 && proto; i++, proto = Object.getPrototypeOf(proto)) {
        if (typeof proto.getChunk === 'function' || typeof proto.getChunkByID === 'function' || typeof proto.getBlockState === 'function') {
          return proto;
        }
      }
    } catch (_) {}
    return null;
  }

  function getBlockRegistry(world) {
    if (_blockRegistry) return _blockRegistry;
    try {
      const proto = getWorldProtoDeep(world);
      if (!proto?.getChunkByID) return null;
      // chunk (0,0) suele estar DESCARGADO lejos del spawn (WorldMap
      // escanea chunks cerca del jugador): probar el chunk del jugador y
      // vecinos hasta dar con uno cargado
      const candidates = [];
      const p = state.game?.player?.pos || findGame()?.player?.pos;
      if (p) {
        const pcx = Math.floor(Number(p.x)) >> 4;
        const pcz = Math.floor(Number(p.z)) >> 4;
        candidates.push([pcx, pcz], [pcx + 1, pcz], [pcx - 1, pcz], [pcx, pcz + 1], [pcx, pcz - 1]);
      }
      candidates.push([0, 0]);
      for (const [cx, cz] of candidates) {
        let chunk = null;
        try { chunk = proto.getChunkByID.call(world, cx, cz); } catch (_) { continue; }
        if (!chunk || chunk.isDummyChunk || !chunk.cells?.length) continue;
        const cellProto = Object.getPrototypeOf(chunk.cells[0]);
        const m = cellProto.get.toString().match(/(\w+)\.fromBlockStateId/);
        if (m) {
          _blockRegistry = eval(m[1]);
          return _blockRegistry;
        }
      }
    } catch (_) {}
    return null;
  }

  function blockNameOf(world, blockState) {
    if (!blockState || blockState.id === 0) return null;
    try {
      const reg = getBlockRegistry(world);
      return reg?.fromBlockStateId?.(blockState.id)?.getBlock?.()?.name || null;
    } catch (_) {
      return null;
    }
  }

  // ids de agua APRENDIDOS: cuando una entidad entra al agua, el bloque en
  // sus pies ES agua por definición — lo capturamos como fallback para
  // cuando el registro de bloques no está disponible
  const knownWaterIds = new Set();

  function isWaterBlock(world, blockState) {
    if (!blockState) return false;
    // fallback rápido: id ya aprendido del juego real
    if (knownWaterIds.size && knownWaterIds.has(blockState.id)) return true;
    const name = blockNameOf(world, blockState);
    if (name === 'water' || name === 'water_cauldron' || name === 'flowing_water') {
      knownWaterIds.add(blockState.id); // aprender para próximos chequeos
      return true;
    }
    return false;
  }

  // captura el id del bloque en los pies de una entidad que está en agua
  function learnWaterIdFromEntity(game, entity) {
    try {
      if (!entity?.inWater || !entity?.pos) return;
      const world = game?.world;
      const proto = getWorldProtoDeep(world);
      if (!proto?.getChunk) return;
      const bx = Math.floor(Number(entity.pos.x));
      const by = Math.floor(Number(entity.pos.y));
      const bz = Math.floor(Number(entity.pos.z));
      const chunk = proto.getChunk.call(world, { x: bx, y: by, z: bz });
      if (!chunk || chunk.isDummyChunk) return;
      const bs = chunk.getBlockState?.({ x: bx, y: by, z: bz });
      if (bs?.id) knownWaterIds.add(bs.id);
    } catch (_) {}
  }

  function findWaterSurfaceY(game, x, y, z) {
    try {
      const world = game?.world;
      const proto = getWorldProtoDeep(world);
      if (!proto || (typeof proto.getBlockState !== 'function' && typeof proto.getChunk !== 'function')) return null;

      const bx = Math.floor(x);
      const bz = Math.floor(z);
      const by = Math.floor(y);

      const at = (yy) => {
        try {
          // world.getBlockState exige instanceof Vec3i y loguea "Invalid
          // position" con objetos planos; la ruta chunk no valida (patrón
          // documentado en Baritone.js:533)
          if (typeof proto.getChunk === 'function') {
            const chunk = proto.getChunk.call(world, { x: bx, y: yy, z: bz });
            if (chunk != null && !chunk.isDummyChunk && typeof chunk.getBlockState === 'function') {
              return chunk.getBlockState({ x: bx, y: yy, z: bz });
            }
            return null;
          }
          return proto.getBlockState.call(world, { x: bx, y: yy, z: bz });
        } catch (_) {
          return null;
        }
      };

      // sondeo tipo heightmap: desde 24 bloques arriba del jugador hacia
      // abajo hasta dar con el primer bloque no-aire de la columna. Si
      // ese bloque es agua → esa es la superficie (robusto contra orillas,
      // colinas y cualquier diferencia de altura con el jugador)
      for (let d = 24; d >= -4; d--) {
        const s = at(by + d);
        if (!s || s.id === 0) continue; // aire (o sin datos): seguir bajando
        if (isWaterBlock(world, s)) {
          // superficie: último bloque de agua contiguo hacia arriba
          let top = by + d;
          for (let i = 1; i <= 6; i++) {
            const up = at(by + d + i);
            if (up && isWaterBlock(world, up)) top = by + d + i;
            else break;
          }
          // superficie visual del agua (el bloque no se llena del todo)
          return top + 0.9;
        }
        // sólido: en esta columna no hay agua a la vista
        return null;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function isMapLike(value) {
    return !!value && (
      (typeof Map === 'function' && value instanceof Map) ||
      (typeof value.get === 'function' && typeof value.values === 'function')
    );
  }

  function looksLikeEntityMap(candidate) {
    if (!isMapLike(candidate) || candidate.size === 0) return false;
    for (const entity of candidate.values()) {
      if (entity && (entity.pos || entity.motion || entity.inWater !== undefined)) return true;
    }
    return false;
  }

  function resolveEntityMap(game) {
    if (state.entityMap && isMapLike(state.entityMap)) return state.entityMap;
    for (const candidate of [
      game?.world?.entitiesDump,
      game?.world?.entities,
      game?.world?.entityMap,
      game?.entityManager?.entities
    ]) {
      if (looksLikeEntityMap(candidate)) {
        state.entityMap = candidate;
        return candidate;
      }
    }
    return null;
  }

  function entityKey(entity) {
    if (entity?.id !== undefined) return `id:${entity.id}`;
    if (entity?.entityId !== undefined) return `eid:${entity.entityId}`;
    if (entity?.uuid) return `uuid:${entity.uuid}`;
    return null;
  }

  // ── recursos 3D (patrón GrassFlowers) ────────────────────────────

  // runtime invalidado (extensión recargada sin F5): getURL devuelve
  // chrome-extension://invalid/ y el meta/config del frame quedan viejos.
  // Validar antes de aceptar y NUNCA cachear una URL envenenada
  function isValidAssetsUrl(url) {
    return typeof url === 'string' && url.startsWith('chrome-extension://') && !url.startsWith('chrome-extension://invalid/');
  }

  function resolveAssetsBase() {
    if (isValidAssetsUrl(state.assetsBase)) return state.assetsBase;
    state.assetsBase = '';
    try {
      // 1) meta propio (lo inyecta SplashScreen al recargar la extensión)
      const meta = document.querySelector('meta[name="mf-particles-base"]');
      if (isValidAssetsUrl(meta?.content)) {
        state.assetsBase = meta.content;
        return state.assetsBase;
      }
      // 2) fallback: derivar de un meta existente cambiando el sufijo
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

  function layerFrameUrl(dir, index) {
    const base = resolveAssetsBase();
    if (!base) return '';
    const frame = String(index + 1).padStart(2, '0');
    return `${base}water_splash/${dir}/${dir === 'band' ? 'splash_band' : dir}_${frame}.png`;
  }

  // Busca un material con textura en las raíces nativas de render del juego
  // (chunkMeshes/entityMeshes/...) — en miniblox los chunks NO cuelgan de la
  // escena raíz, el renderer las recorre por su cuenta (LocalGames tiene que
  // forzar scene.add para sus mundos).
  function findReferenceInRoots(game) {
    const gs = game?.gameScene;
    if (!gs) return null;
    const rank = { MeshLambertMaterial: 0, MeshBasicMaterial: 1, MeshStandardMaterial: 2, MeshPhongMaterial: 3 };
    let best = null;
    let bestRank = 99;

    const consider = (obj) => {
      if (!obj?.isMesh || !obj.geometry?.attributes?.position || !obj.geometry?.attributes?.uv) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        const type = mat?.type || mat?.constructor?.name || '';
        const r = rank[type];
        if (r === undefined || r >= bestRank || !mat?.map) continue;
        best = { mesh: obj, material: mat };
        bestRank = r;
      }
    };

    try {
      for (const rootKey of ['chunkMeshes', 'entityMeshes', 'ambientMeshes', 'leaderboardMeshes']) {
        const root = gs[rootKey];
        if (!root?.children) continue;
        for (const child of root.children) {
          consider(child);
          for (const grandchild of child?.children ?? []) consider(grandchild);
          if (bestRank === 0) break;
        }
        if (best) return best;
      }
    } catch (_) {}

    return best;
  }

  function findReferenceMesh(scene) {
    if (state.referenceMesh?.geometry?.attributes?.position && state.referenceMesh?.material) return state.referenceMesh;
    if (!scene?.traverse) return null;

    const rank = { MeshLambertMaterial: 0, MeshBasicMaterial: 1, MeshStandardMaterial: 2, MeshPhongMaterial: 3 };
    let best = null;
    let bestRank = 99;

    try {
      scene.traverse(obj => {
        // skinned (skins de jugadores): su material lleva skinning y colapsa
        // un quad estático a un punto — solo meshes normales
        if (!obj?.isMesh || obj.isSkinnedMesh || obj.geometry?.attributes?.skinIndex) return;
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

  // Carga vía <img> (no fetch): la CSP de la página puede bloquear
  // connect-src a chrome-extension://, pero img-src sí permite los
  // web_accessible_resources (mismo camino que usa CustomSkins).
  async function loadImageUrl(url) {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('IMG_LOAD'));
      img.src = url;
    });

    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(image, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
      } catch (_) {}
    }
    return image;
  }

  function copyTextureSettings(source, texture) {
    if (!source || !texture) return;
    for (const key of ['wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'colorSpace', 'encoding', 'premultiplyAlpha', 'unpackAlignment']) {
      try { if (source[key] !== undefined) texture[key] = source[key]; } catch (_) {}
    }
    try { texture.generateMipmaps = source.generateMipmaps; } catch (_) {}
  }

  function createMaterialFrom(source, texture) {
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
      material.alphaTest = 0.05;
      material.depthTest = true;   // oclusión real contra el terreno
      material.depthWrite = false;
      material.side = 2;
      material.fog = true;
      material.toneMapped = source.toneMapped !== false;
      if ('roughness' in material) material.roughness = 1;
      if ('metalness' in material) material.metalness = 0;
      material.color?.set?.(0xffffff);
      material.emissive?.set?.(0x000000);
      // despega el decal de la superficie del agua (z-fighting): sin esto
      // el quad pierde el depth-test contra la cara superior del agua
      material.polygonOffset = true;
      material.polygonOffsetFactor = -2;
      material.polygonOffsetUnits = -2;
      material.onBeforeCompile = function () {};
      material.customProgramCacheKey = () => 'mf-water-splash-v1';
      material.needsUpdate = true;
    } catch (_) {}

    return material;
  }

  // Quad horizontal tipo decal (plano XZ, normal +Y), como las flores de
  // piso: pivote en una esquina para escalar desde ahí, sin billboard.
  function buildQuadGeometry(referenceMesh) {
    if (state.quadGeometry) return state.quadGeometry;
    const geo = buildQuad(referenceMesh, false);
    state.quadGeometry = geo;
    // quad vertical separado para las gotitas (billboards)
    state.dropletGeometry = buildQuad(referenceMesh, true);
    return geo;
  }

  function buildQuad(referenceMesh, vertical) {
    const refGeo = referenceMesh?.geometry;
    if (!refGeo?.attributes?.position?.constructor) return null;

    try {
      const Geometry = refGeo.constructor;
      const Attr = refGeo.attributes.position.constructor;

      const geometry = new Geometry();
      if (vertical) {
        // billboard vertical (plano XY, pivote abajo-centro) para gotitas
        geometry.setAttribute('position', new Attr(new Float32Array([
          -0.5, 0.0, 0,   0.5, 0.0, 0,   -0.5, 1.0, 0,   0.5, 1.0, 0
        ]), 3));
        geometry.setAttribute('normal', new Attr(new Float32Array([
          0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1
        ]), 3));
        geometry.setAttribute('uv', new Attr(new Float32Array([
          0, 0,  1, 0,  0, 1,  1, 1
        ]), 2));
        geometry.setIndex([0, 1, 2, 2, 1, 3]);
      } else {
        // decal horizontal en XZ a y=0, quad unitario 1x1 centrado
        geometry.setAttribute('position', new Attr(new Float32Array([
          -0.5, 0, -0.5,   0.5, 0, -0.5,   -0.5, 0, 0.5,   0.5, 0, 0.5
        ]), 3));
        geometry.setAttribute('normal', new Attr(new Float32Array([
          0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0
        ]), 3));
        geometry.setAttribute('uv', new Attr(new Float32Array([
          0, 1,  1, 1,  0, 0,  1, 0
        ]), 2));
        geometry.setIndex([0, 2, 1, 2, 3, 1]);
      }
      geometry.computeBoundingBox?.();
      geometry.computeBoundingSphere?.();
      return geometry;
    } catch (_) {
      return null;
    }
  }

  // log de diagnóstico con throttle: los fallos reintentan cada 900ms y no
  // hay que llenar la consola (antes fallaban en silencio absoluto)
  let _lastFailLog = 0;
  function logResourceFail(code, detail) {
    const now = performance.now();
    if (now - _lastFailLog < 5000) return;
    _lastFailLog = now;
    console.warn(TAG, 'recursos no listos:', code, detail ?? '');
  }

  async function ensureResources() {
    if (state.resourcesReady) return true;
    if (state.resourcesPromise) return state.resourcesPromise;

    const attempt = (async () => {
      const game = findGame(true);
      const scene = getScene(game);
      let ref = scene && findReferenceMesh(scene);
      let source = Array.isArray(ref?.material) ? ref.material[0] : ref?.material;
      let sourceMap = source?.map;

      // Plan B: raíces nativas del renderer (chunkMeshes/entityMeshes/...)
      if (!ref || !sourceMap) {
        const fromRoots = findReferenceInRoots(game);
        if (fromRoots) {
          ref = fromRoots.mesh;
          source = fromRoots.material;
          sourceMap = source?.map;
          state.referenceMesh = fromRoots.mesh;
        }
      }

      // Plan C (patrón CustomModels): rig del brazo del jugador
      let meshCtor = ref?.constructor;
      if (!ref || !sourceMap) {
        try {
          const cam = game?.gameScene?.axesHelper?.parent;
          for (const child of cam?.children ?? []) {
            if (typeof child?.updateArmAnimation === 'function' && child.item && child.rightArm) {
              const arm = child.rightArm;
              if (arm?.geometry?.attributes?.position && arm.material) {
                meshCtor = arm.constructor;
                if (!source) source = Array.isArray(arm.material) ? arm.material[0] : arm.material;
                if (!sourceMap) sourceMap = source?.map;
                state.referenceMesh = state.referenceMesh || arm;
                break;
              }
            }
          }
        } catch (_) {}
      }

      if (!meshCtor || !sourceMap) {
        state.lastError = 'SIN_CTORS';
        state.lastErrorDetail = {
          refEscena: !!ref,
          meshCtor: meshCtor?.name || typeof meshCtor,
          sourceMap: !!sourceMap,
          rootsKeys: (() => { const gs = game?.gameScene; return gs ? ['chunkMeshes','entityMeshes','ambientMeshes','leaderboardMeshes'].filter(k => gs[k]).join(',') : 'NO_GS'; })(),
          rootChildren: (() => { const gs = game?.gameScene; const out = {}; for (const k of ['chunkMeshes','entityMeshes']) { out[k] = gs?.[k]?.children?.length ?? null; } return out; })()
        };
        state.resourcesPromise = null;
        logResourceFail('SIN_CTORS', state.lastErrorDetail);
        return false;
      }

      const base = resolveAssetsBase();
      if (!base) {
        state.lastError = 'SIN_BASE';
        state.resourcesPromise = null;
        logResourceFail('SIN_BASE', { meta: document.querySelector('meta[name="mf-particles-base"]')?.content || null, runtime: typeof chrome?.runtime?.getURL === 'function' ? 'presente' : 'ausente' });
        return false;
      }

      try {
        // núcleo obligatorio: gotita + 4 capas del splash de entidad. Si
        // una de estas falla, no hay nada que mostrar
        const coreUrls = new Set([`${base}water_splash/water_particle_splash.png`]);
        for (const spec of LAYERS) {
          for (let i = 0; i < spec.frames; i++) coreUrls.add(layerFrameUrl(spec.dir, i));
        }

        let loaded = 0;
        await Promise.all([...coreUrls].map(async url => {
          const image = await loadImageUrl(url);
          loaded++;
          const texture = new sourceMap.constructor(image);
          copyTextureSettings(sourceMap, texture);
          try {
            if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) texture.flipY = false;
          } catch (_) {}
          texture.needsUpdate = true;
          state.textures.set(url, texture);

          const material = createMaterialFrom(source, texture);
          if (material) state.materials.set(url, material);
        }));
        state.lastErrorDetail = { loaded };

        // ondas de lluvia del pack Particular (7 frames): opcionales —
        // si no existen todavía, la lluvia no dibuja pero el splash de
        // entidad sí (antes un ripple faltante mataba TODO por Promise.all)
        const rainFailures = [];
        await Promise.all(Array.from({ length: RAIN_FRAMES }, async (_, i) => {
          const url = rainFrameUrl(i);
          try {
            const image = await loadImageUrl(url);
            const texture = new sourceMap.constructor(image);
            copyTextureSettings(sourceMap, texture);
            try {
              if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) texture.flipY = false;
            } catch (_) {}
            texture.needsUpdate = true;
            state.textures.set(url, texture);
            const material = createMaterialFrom(source, texture);
            if (material) state.materials.set(url, material);
          } catch (_) {
            rainFailures.push(url);
          }
        }));
        state.rainFramesReady = rainFailures.length === 0;
        if (rainFailures.length) {
          console.warn(TAG, `frames de lluvia faltantes (${rainFailures.length}/${RAIN_FRAMES}): sin ondas de lluvia hasta recargar`);
        }

        if (!state.quadGeometry || !state.dropletGeometry) {
          // buildQuadGeometry crea y guarda AMBOS quads (horizontal decal +
          // vertical gotitas) en state
          if (!buildQuadGeometry(state.referenceMesh)) {
            state.lastError = 'NO_QUAD';
            state.resourcesPromise = null;
            logResourceFail('NO_QUAD');
            return false;
          }
        }

        state.lastError = null;
        state.resourcesReady = true;
        console.log(TAG, `recursos listos: ${state.materials.size} materiales, base=${base}`);
        return true;
      } catch (err) {
        state.lastError = 'LOAD_FAIL';
        state.lastErrorDetail = String(err?.message || err);
        console.log(TAG, 'recursos no listos:', state.lastErrorDetail);
        return false;
      }
    })();

    // cachear la promesa FUERA del IIFE: los return false internos ya no
    // pisan el cache con null (eso congelaba el intento fallido para
    // siempre y nunca reintentaba)
    state.resourcesPromise = attempt.finally(() => {
      if (!state.resourcesReady) state.resourcesPromise = null;
    });

    return state.resourcesPromise;
  }

  // ── spawn de splashes ────────────────────────────────────────────

  function spawnSplash(x, y, z, fallSpeed, width, options = {}) {
    if (!state.enabled || !state.resourcesReady) return;

    const game = findGame();
    const scene = getScene(game);
    if (!scene?.add) return;

    // colocar el decal SOBRE la superficie real del agua
    const surfaceY = findWaterSurfaceY(game, x, y, z);
    const splashY = surfaceY != null ? surfaceY + 0.02 : y + 0.1;

    const power = Math.min(1, Math.max(0.25, (Math.abs(fallSpeed) - MIN_FALL_SPEED) / 0.6));
    const baseWidth = Math.max(0.9, Math.min(2.2, (Number(width) || 0.6) * 1.6));
    const base = resolveAssetsBase();
    const now = performance.now();
    const life = options.forever ? Infinity : SPLASH_LIFE_MS;

    if (options.debugInfo) {
      options.debugInfo.surfaceY = surfaceY;
      options.debugInfo.splashY = splashY;
    }

    for (const spec of LAYERS) {
      const url = layerFrameUrl(spec.dir, options.forever ? 0 : 0);
      const material = state.materials.get(url);
      const geometry = state.quadGeometry;
      if (!material || !geometry) continue;

      try {
        const MeshCtor = state.referenceMesh.constructor;
        const mesh = new MeshCtor(geometry, material);
        mesh.name = 'MiniFeatherWaterSplash';
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 4;
        // decal horizontal a ras del agua; yOffset mínimo: la capa sube un
        // poco con el power (el chorro central se ve más alto)
        mesh.position.set(x, splashY + spec.yOffset * 0.15 * baseWidth, z);
        // escala en XZ (tamaño del anillo); la altura del "chorro" se
        // simula creciendo el decal a medida que avanza el frame
        mesh.rotation.y = Math.random() * Math.PI * 2;
        mesh.scale.set(1, 1, 1);
        // el juego congela matrices en objetos estáticos (chunks): sin esto
        // el quad queda dibujado en el origen del mundo (patrón MF_Film)
        mesh.matrixAutoUpdate = true;
        mesh.updateMatrix();
        mesh.updateMatrixWorld(true);
        scene.add(mesh);

        state.splashes.push({
          mesh,
          spec,
          start: now + spec.delay,
          life,
          baseWidth,
          targetScale: baseWidth * spec.scale
        });
      } catch (_) {}
    }

    // gotitas
    const dropletUrl = `${base}water_splash/water_particle_splash.png`;
    const dropletMat = state.materials.get(dropletUrl);
    const geometry = state.dropletGeometry || state.quadGeometry;
    if (dropletMat && geometry) {
      const count = Math.round(DROPLET_COUNT * power);
      for (let i = 0; i < count; i++) {
        try {
          const MeshCtor = state.referenceMesh.constructor;
          const mesh = new MeshCtor(geometry, dropletMat);
          mesh.name = 'MiniFeatherWaterDroplet';
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.frustumCulled = false;
          mesh.renderOrder = 4;
          const angle = (i / DROPLET_COUNT) * Math.PI * 2 + Math.random() * 0.6;
          const speed = (0.9 + Math.random() * 1.4) * (0.5 + power * 0.8);
          mesh.position.set(x + Math.cos(angle) * 0.22, splashY + 0.05, z + Math.sin(angle) * 0.22);
          const size = 0.10 + Math.random() * 0.08;
          mesh.scale.set(size, size, 1);
          mesh.matrixAutoUpdate = true;
          mesh.updateMatrix();
          scene.add(mesh);

          state.droplets.push({
            mesh,
            start: now,
            life: DROPLET_LIFE_MS,
            vx: Math.cos(angle) * speed * 0.35,
            vy: 0.65 + Math.random() * 0.85 * (0.5 + power * 0.9),
            vz: Math.sin(angle) * speed * 0.35,
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z
          });
        } catch (_) {}
      }
    }
  }

  // ── lluvia: ondas de gota sobre el agua ──────────────────────────

  function isRainingNow(game) {
    try {
      const world = game?.world;
      if (world) {
        // API del juego (ver NoWeather.js): world.isRaining() /
        // world.getRainStrength()
        if (typeof world.isRaining === 'function' && world.isRaining()) return true;
        if (typeof world.getRainStrength === 'function' && Number(world.getRainStrength()) > 0.15) return true;
        if (world.isRaining === true) return true;

        // BYPASS de NoWeather: lo parchea como propiedad propia de la
        // instancia, pero el prototipo conserva el original — llamarlo
        // directo lee el clima REAL (así las ondas salen aunque la lluvia
        // esté oculta visualmente)
        const proto = Object.getPrototypeOf(world);
        if (proto) {
          if (typeof proto.isRaining === 'function' && proto.isRaining !== world.isRaining) {
            try { if (proto.isRaining.call(world)) return true; } catch (_) {}
          }
          if (typeof proto.getRainStrength === 'function' && proto.getRainStrength !== world.getRainStrength) {
            try { if (Number(proto.getRainStrength.call(world)) > 0.15) return true; } catch (_) {}
          }
        }

        // dato crudo del mundo (NoWeather solo parchea métodos, no campos)
        if (Number(world.rainStrength) > 0.15) return true;
      }

      // el visual no miente: si el mesh de lluvia está visible, llueve
      const weather = game?.gameScene?.weather;
      if (weather?.rain?.mesh?.visible === true) return true;

      return false;
    } catch (_) {
      return false;
    }
  }

  // Spawnea mini-splashes en puntos aleatorios alrededor del jugador,
  // SOLO donde hay superficie de agua (findWaterSurfaceY valida el bloque)
  function tickRain() {
    if (!state.enabled || state.destroyed || !state.resourcesReady) { state.rainBlocked = 'disabled/recursos'; return; }
    if (!state.rainFramesReady) { state.rainBlocked = 'sin-frames-ripple'; return; } // sin frames cargados no hay lluvia

    const game = findGame();
    if (!game) { state.rainBlocked = 'sin-game'; return; }

    // lluvia real O forzada para diagnóstico (10s)
    const forced = state.forceRain && performance.now() < state.forceRain;
    if (state.forceRain && !forced) state.forceRain = 0;
    if (!forced && !isRainingNow(game)) { state.rainBlocked = 'no-llueve'; return; }
    state.rainBlocked = null;

    const p = game.player?.pos;
    if (!p) { state.rainBlocked = 'sin-jugador'; return; }

    const scene = getScene(game);
    if (!scene?.add) { state.rainBlocked = 'sin-escena'; return; }

    // presupuesto de meshes activos: la lluvia no debe saturar
    if (state.splashes.length + state.droplets.length > RAIN_MAX_MESHES) return;

    const now = performance.now();
    state.rainTicks = (state.rainTicks || 0) + 1;

    // 4 intentos por tick: descarta posiciones sin agua. SIN break: cada
    // intento con agua spawnea su onda (1 cada 60ms era demasiado escaso)
    for (let attempt = 0; attempt < 4; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 1.5 + Math.random() * (RAIN_RADIUS - 1.5);
      const x = Number(p.x) + Math.cos(angle) * dist;
      const z = Number(p.z) + Math.sin(angle) * dist;

      state.rainAttempts = (state.rainAttempts || 0) + 1;
      const surfaceY = findWaterSurfaceY(game, x, Number(p.y), z);
      if (surfaceY == null) continue;
      state.rainHits = (state.rainHits || 0) + 1;

      const url = rainFrameUrl(0);
      const material = state.materials.get(url);
      const geometry = state.quadGeometry;
      if (!material || !geometry) continue;

      try {
        const MeshCtor = state.referenceMesh.constructor;
        const mesh = new MeshCtor(geometry, material);
        mesh.name = 'MiniFeatherWaterRainRipple';
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 4;
        mesh.position.set(x, surfaceY + 0.03, z);
        const size = 0.45 + Math.random() * 0.3;
        mesh.scale.set(size, 1, size);
        mesh.rotation.y = Math.random() * Math.PI * 2;
        mesh.matrixAutoUpdate = true;
        mesh.updateMatrix();
        mesh.updateMatrixWorld(true);
        scene.add(mesh);

        state.splashes.push({
          mesh,
          spec: null,
          start: now,
          life: RAIN_LIFE_MS,
          baseWidth: 1,
          targetScale: size,
          rain: true
        });
      } catch (_) {}
    }
  }

  // ── animación 3D ─────────────────────────────────────────────────

  function tick(now) {
    if (state.destroyed || !state.enabled) {
      state.raf = 0;
      return;
    }

    const game = findGame();
    const camera = getCamera(game);

    // decal horizontal: sin billboard — no gira con la cámara, pero sí
    // miramos desde arriba para no dibujarlo si la cámara está bajo el agua
    if (camera?.position) {
      const camY = Number(camera.position.y) || 0;
      for (const splash of state.splashes) {
        try { splash.mesh.visible = camY > splash.mesh.position.y - 0.5; } catch (_) {}
      }
    }

    // gotitas: billboard vertical
    if (camera) {
      for (const droplet of state.droplets) {
        try { droplet.mesh.quaternion.copy(camera.quaternion); } catch (_) {}
      }
    }

    // capas del splash: frame según progreso
    for (let i = state.splashes.length - 1; i >= 0; i--) {
      const splash = state.splashes[i];
      const age = now - splash.start;

      if (age < 0) {
        splash.mesh.visible = false;
        continue;
      }

      const progress = age / splash.life;
      if (progress >= 1) {
        try { splash.mesh.removeFromParent?.(); } catch (_) {}
        state.splashes.splice(i, 1);
        continue;
      }

      // lluvia: ciclo de los 7 frames del water_ripple (pack Particular)
      let material;
      if (splash.rain) {
        // frameLoop (debug): los 7 frames en loop de ~480ms por ciclo
        const frameIndex = splash.frameLoop
          ? Math.floor((age % RAIN_LIFE_MS) / RAIN_LIFE_MS * RAIN_FRAMES)
          : Math.min(RAIN_FRAMES - 1, Math.floor(progress * RAIN_FRAMES));
        material = state.materials.get(rainFrameUrl(frameIndex));
      } else {
        const { spec } = splash;
        // forever: frame 2 fijo (visible de inmediato), sin animación
        const frameIndex = splash.life === Infinity
          ? 1
          : Math.min(spec.frames - 1, Math.floor(progress * spec.frames));
        material = state.materials.get(layerFrameUrl(spec.dir, frameIndex));
      }

      if (material && splash.mesh.material !== material) {
        splash.mesh.material = material;
      }

      // el decal crece desde el punto de impacto (expandiendo el anillo);
      // en modo forever queda a tamaño final. En lluvia NO crece: los 7
      // frames del water_ripple ya expanden la onda por sí mismos
      const grow = (splash.life === Infinity || splash.rain) ? 1 : 0.45 + progress * 0.55;
      const scale = splash.targetScale * grow;
      try { splash.mesh.scale.set(scale, 1, scale); } catch (_) {}

      // fade (nada en modo forever)
      let opacity = 1;
      if (splash.life !== Infinity) {
        if (progress < 0.06) opacity = progress / 0.06;
        if (progress > 0.70) opacity = 1 - (progress - 0.70) / 0.30;
      }
      try { splash.mesh.material.opacity = Math.max(0, Math.min(1, opacity)); } catch (_) {}

      splash.mesh.visible = true;
    }

    // gotitas: balística con gravedad
    const gravity = 13.5;
    for (let i = state.droplets.length - 1; i >= 0; i--) {
      const droplet = state.droplets[i];
      const progress = (now - droplet.start) / droplet.life;

      if (progress >= 1) {
        try { droplet.mesh.removeFromParent?.(); } catch (_) {}
        state.droplets.splice(i, 1);
        continue;
      }

      const t = (now - droplet.start) / 1000;
      droplet.mesh.position.set(
        droplet.x + droplet.vx * t,
        droplet.y + droplet.vy * t - 0.5 * gravity * t * t,
        droplet.z + droplet.vz * t
      );

      let opacity = 1;
      if (progress < 0.08) opacity = progress / 0.08;
      if (progress > 0.62) opacity = 1 - (progress - 0.62) / 0.38;
      try { droplet.mesh.material.opacity = Math.max(0, Math.min(1, opacity)); } catch (_) {}

      droplet.mesh.visible = true;
    }

    state.raf = requestAnimationFrame(tick);
  }

  // ── detección de entrada al agua ─────────────────────────────────

  function scanEntities() {
    if (!state.enabled || state.destroyed) return;

    const game = findGame();
    if (!game) return;

    // lluvia: ondas en el agua mientras llovía (mismo intervalo del scan)
    tickRain();

    const now = performance.now();
    const seen = new Set();

    const checkEntity = (entity) => {
      if (!entity) return;
      const key = entityKey(entity);
      if (!key) return;
      seen.add(key);

      const inWater = entity.inWater === true;
      const prev = state.wasInWater.get(key);

      // aprender el id del agua del propio juego (fallback anti-registro)
      if (inWater) learnWaterIdFromEntity(game, entity);

      if (prev && !prev.inWater && inWater) {
        const fallSpeed = Number(entity.motion?.y ?? entity.velocity?.y ?? 0);
        if (fallSpeed <= -MIN_FALL_SPEED && entity.pos) {
          spawnSplash(
            Number(entity.pos.x) || 0,
            Number(entity.pos.y) || 0,
            Number(entity.pos.z) || 0,
            fallSpeed,
            Number(entity.width) || 0.6
          );
        }
      }

      state.wasInWater.set(key, { inWater, seenAt: now });
    };

    try { checkEntity(game.player); } catch (_) {}

    const entities = resolveEntityMap(game);
    if (entities) {
      try {
        for (const entity of entities.values()) checkEntity(entity);
      } catch (_) {}
    }

    if (state.wasInWater.size > 256) {
      for (const [key, entry] of state.wasInWater.entries()) {
        if (now - entry.seenAt > 10000 || (!seen.has(key) && now - entry.seenAt > 3000)) {
          state.wasInWater.delete(key);
        }
      }
    }
  }

  // ── ciclo de vida ────────────────────────────────────────────────

  function clearVisuals() {
    for (const splash of state.splashes) {
      try { splash.mesh.removeFromParent?.(); } catch (_) {}
    }
    for (const droplet of state.droplets) {
      try { droplet.mesh.removeFromParent?.(); } catch (_) {}
    }
    state.splashes.length = 0;
    state.droplets.length = 0;
    state.wasInWater.clear();
  }

  function disposeResources() {
    clearVisuals();
    for (const material of state.materials.values()) {
      try { material?.dispose?.(); } catch (_) {}
    }
    for (const texture of state.textures.values()) {
      try { texture?.dispose?.(); } catch (_) {}
    }
    state.materials.clear();
    state.textures.clear();
    try { state.quadGeometry?.dispose?.(); } catch (_) {}
    try { state.dropletGeometry?.dispose?.(); } catch (_) {}
    state.quadGeometry = null;
    state.dropletGeometry = null;
    state.resourcesReady = false;
    state.resourcesPromise = null;
    state.referenceMesh = null;
  }

  function start() {
    if (state.enabled || state.destroyed) return;
    state.enabled = true;

    state.entityMap = null;
    void ensureResources();
    state.scanTimer = window.setInterval(scanEntities, SCAN_MS);
    state.raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (!state.enabled) return;
    state.enabled = false;

    clearInterval(state.scanTimer);
    state.scanTimer = 0;
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    }

    clearVisuals();
  }

  function applyConfig(detail) {
    let config = detail;
    if (typeof detail === 'string') {
      try { config = JSON.parse(detail); } catch (_) { config = null; }
    }
    if (!config || typeof config !== 'object') return;
    // el panel (ISOLATED) nos pasa la URL de los assets: el MAIN world no
    // tiene chrome.runtime y el meta de SplashScreen puede no existir aquí.
    // Si llega una URL válida y distinta (runtime recargado), reemplazar la
    // vieja y descargar los recursos ya cargados con la base anterior
    if (isValidAssetsUrl(config.assetsBase)) {
      if (state.assetsBase && state.assetsBase !== config.assetsBase && state.resourcesReady) {
        disposeResources();
      }
      state.assetsBase = config.assetsBase;
    }
    console.log(TAG, `config: enabled=${!!config.enabled} assetsBase=${state.assetsBase ? 'sí' : 'no'} (antes enabled=${state.enabled})`);
    if (config.enabled) start();
    else stop();
  }

  function onConfig(event) {
    applyConfig(event?.detail);
  }

  document.addEventListener(EVENT_CONFIG, onConfig);

  // re-scan lento: mundos nuevos / cámara tras F5
  const hookTimer = window.setInterval(() => {
    if (state.enabled && !state.resourcesReady) void ensureResources();
    if (state.enabled) state.entityMap = null; // re-resolver mapa de entidades
  }, HOOK_MS);

  function destroy() {
    if (state.destroyed) return;
    stop();
    state.destroyed = true;
    clearInterval(hookTimer);
    document.removeEventListener(EVENT_CONFIG, onConfig);

    if (globalThis[GLOBAL_KEY]?.destroy === destroy) {
      delete globalThis[GLOBAL_KEY];
    }
  }

  globalThis[GLOBAL_KEY] = {
    destroy,
    // diagnóstico
    debug: {
      get state() { return { enabled: state.enabled, resourcesReady: state.resourcesReady, rainFramesReady: state.rainFramesReady === true, error: state.lastError, errorDetail: state.lastErrorDetail, splashes: state.splashes.length, droplets: state.droplets.length, entities: state.wasInWater.size, materials: state.materials.size, assetsBase: state.assetsBase, scene: inspectScene(), rainBlocked: state.rainBlocked || null, rainTicks: state.rainTicks || 0, rainAttempts: state.rainAttempts || 0, rainHits: state.rainHits || 0, waterIdsAprendidos: [...knownWaterIds], blockRegistry: !!getBlockRegistry(findGame()?.world), llueve: (() => { try { return isRainingNow(findGame()); } catch (_) { return null; } })() }; },
      splash() {
        // dispara un splash ETERNO en frente del jugador para diagnóstico:
        // queda visible estático hasta clear() — sirve para ver si el mesh
        // se dibuja y dónde quedó posicionado
        const game = findGame(true);
        const p = game?.player?.pos;
        if (!p) { console.warn(TAG, 'no hay jugador'); return; }
        const info = {};
        const fire = () => {
          spawnSplash(Number(p.x), Number(p.y), Number(p.z) + 2, -0.8, 0.6, { forever: true, debugInfo: info });
          const s = state.splashes[state.splashes.length - 1];
          console.log(TAG, 'splash eterno creado:', {
            superficieAgua: info.surfaceY,
            yDelDecal: s?.mesh?.position?.y,
            escala: s?.mesh?.scale,
            enEscena: !!s?.mesh?.parent,
            visible: s?.mesh?.visible,
            material: s?.mesh?.material?.type,
            mapaCargado: !!s?.mesh?.material?.map?.image
          });
        };
        if (state.resourcesReady) fire();
        else void ensureResources().then(ok => { if (ok) fire(); });
      },
      clear() { clearVisuals(); },
      ripple() {
        // onda de lluvia ETERNA en frente del jugador para diagnóstico:
        // cicla los 7 frames en loop hasta clear() — prueba la cadena
        // completa de la lluvia sin necesitar clima
        const game = findGame(true);
        const p = game?.player?.pos;
        if (!p) { console.warn(TAG, 'no hay jugador'); return; }
        const fire = () => {
          const x = Number(p.x), z = Number(p.z) + 2;
          const surfaceY = findWaterSurfaceY(game, x, Number(p.y), z);
          if (surfaceY == null) { console.warn(TAG, 'ripple: no hay agua delante (superficie=' + surfaceY + ')'); return; }
          const material = state.materials.get(rainFrameUrl(0));
          if (!material || !state.quadGeometry) { console.warn(TAG, 'ripple: faltan recursos', { rainFramesReady: state.rainFramesReady, mats: state.materials.size }); return; }
          try {
            const MeshCtor = state.referenceMesh.constructor;
            const mesh = new MeshCtor(state.quadGeometry, material);
            mesh.name = 'MiniFeatherWaterRainRipple-debug';
            mesh.frustumCulled = false;
            mesh.renderOrder = 4;
            mesh.position.set(x, surfaceY + 0.03, z);
            mesh.scale.set(0.6, 1, 0.6);
            mesh.matrixAutoUpdate = true;
            mesh.updateMatrix();
            mesh.updateMatrixWorld(true);
            getScene(game)?.add(mesh);
            const now = performance.now();
            state.splashes.push({ mesh, spec: null, start: now, life: Infinity, baseWidth: 1, targetScale: 0.6, rain: true, frameLoop: true });
            console.log(TAG, 'ripple eterno creado en', { x, y: surfaceY + 0.03, z }, '— usa clear() para borrarlo');
          } catch (err) {
            console.warn(TAG, 'ripple: fallo al crear mesh:', String(err?.message || err));
          }
        };
        if (state.resourcesReady) fire();
        else void ensureResources().then(ok => { if (ok) fire(); });
      },
      rain(force = true) {
        // fuerza la lluvia de ondas ON/OFF para prueba (independiente del
        // clima real); sin args la activa 10s
        state.forceRain = force === true ? performance.now() + 10000 : 0;
        console.log(TAG, 'lluvia forzada:', !!state.forceRain, '→ detectada real:', isRainingNow(findGame()));
      },
      resources() { return ensureResources().then(ok => { console.log(TAG, 'recursos listos:', ok, 'materiales:', state.materials.size); return ok; }); }
    },
    triggerSplash(x, y, z, fallSpeed = -0.6) {
      if (state.resourcesReady) {
        spawnSplash(Number(x) || 0, Number(y) || 0, Number(z) || 0, Number(fallSpeed), 0.6);
      }
    }
  };
})();
