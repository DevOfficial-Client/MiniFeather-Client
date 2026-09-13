(() => {
  'use strict';
  const TAG = '[MiniFeather TinyTakeover]';
  const GLOBAL_KEY = '__MINIFEATHER_TINY_TAKEOVER__';
  const EVENT_NAME = 'minifeather:tiny-takeover-config';
  const SCAN_MS = 300;

  try { globalThis[GLOBAL_KEY]?.destroy?.(); } catch (_) {}

  const state = {
    enabled: false,
    destroyed: false,
    game: null,
    lastGameScan: 0,
    entityMap: null,
    ctors: null,
    textures: new Map(),
    rigs: new Map(),
    limbAccum: new Map(),
    scanTimer: 0,
    raf: 0,
    assetsBase: ''
  };

  const MODELS = globalThis.MF_TINY_MODELS;

  // ─── Game/escena/entidades (patrones WaterSplash/TitanTiny) ───
  function findGame(force = false) {
    const now = performance.now();
    if (!force && state.game?.player && state.game?.world && now - state.lastGameScan < 1200) return state.game;
    state.lastGameScan = now;
    for (const candidate of [globalThis.miniblox, globalThis.__MINIBLOX_GAME__, state.game]) {
      if (candidate?.player && candidate?.world) { state.game = candidate; return candidate; }
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
    try {
      for (const key of Object.keys(gs || {})) {
        const value = gs[key];
        if (value?.isObject3D && typeof value.traverse === 'function' && typeof value.add === 'function') return value;
      }
    } catch (_) {}
    return game?.scene?.scene || gs || null;
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
      if (entity && (entity.pos || entity.mesh || entity.id !== undefined)) return true;
    }
    return false;
  }

  function resolveEntityMap(game) {
    if (state.entityMap && isMapLike(state.entityMap)) return state.entityMap;
    for (const candidate of [
      game?.world?.entitiesDump, game?.world?.entities, game?.world?.entityMap, game?.entityManager?.entities
    ]) {
      if (looksLikeEntityMap(candidate)) { state.entityMap = candidate; return candidate; }
    }
    return null;
  }

  function entityKey(entity) {
    if (entity?.id !== undefined) return `id:${entity.id}`;
    if (entity?.entityId !== undefined) return `eid:${entity.entityId}`;
    if (entity?.uuid) return `uuid:${entity.uuid}`;
    return null;
  }

  function entityType(entity) {
    if (typeof entity?.type === 'string' && entity.type) return entity.type.toLowerCase();
    if (typeof entity?.entityType === 'string' && entity.entityType) return entity.entityType.toLowerCase();
    try {
      const name = entity?.constructor?.name || '';
      const stripped = name.replace(/^Entity/, '').toLowerCase();
      if (stripped && stripped !== 'entity') return stripped;
    } catch (_) {}
    return null;
  }

  function isPlayer(entity) {
    if (entity?.profile?.username !== undefined) return true;
    if (entity?.username !== undefined) return true;
    return false;
  }

  // baby: childAge/age < 0, o hitbox pequeña (umbral por especie)
  function isBabyEntity(entity, type) {
    try {
      if (typeof entity.childAge === 'number' && entity.childAge < 0) return true;
      if (typeof entity.age === 'number' && entity.age < 0) return true;
      const w = Number(entity.width);
      if (Number.isFinite(w) && w > 0) {
        const babyWidths = { wolf: 0.45, cow: 0.45, pig: 0.45, sheep: 0.4, chicken: 0.35, cat: 0.3, fox: 0.35 };
        const threshold = babyWidths[type] || 0.45;
        if (w <= threshold + 0.02) return true;
      }
    } catch (_) {}
    return false;
  }

  // ─── Constructores three.js robados ───
  function findReferenceMesh(game) {
    // Plan A: traverse de la escena raíz
    const scene = getScene(game);
    let best = null;
    let bestRank = 99;
    const rank = { MeshLambertMaterial: 0, MeshBasicMaterial: 1, MeshStandardMaterial: 2, MeshPhongMaterial: 3 };
    const consider = (obj) => {
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
    };
    try {
      if (scene?.traverse) scene.traverse(consider);
    } catch (_) {}

    // Plan B: raíces nativas del renderer del juego
    if (!best) {
      const gs = game?.gameScene;
      try {
        for (const rootKey of ['chunkMeshes', 'entityMeshes', 'ambientMeshes', 'leaderboardMeshes']) {
          const root = gs?.[rootKey];
          if (!root?.children) continue;
          for (const child of root.children) {
            consider(child);
            for (const grandchild of child?.children ?? []) consider(grandchild);
          }
          if (best) break;
        }
      } catch (_) {}
    }

    // Plan C (patrón CustomModels): rig del brazo del jugador
    if (!best) {
      try {
        const cam = game?.gameScene?.axesHelper?.parent;
        for (const child of cam?.children ?? []) {
          if (typeof child?.updateArmAnimation === 'function' && child.item && child.rightArm) {
            const arm = child.rightArm;
            if (arm?.geometry?.attributes?.position && arm.material) {
              best = { mesh: arm, material: Array.isArray(arm.material) ? arm.material[0] : arm.material };
              break;
            }
          }
        }
      } catch (_) {}
    }
    return best;
  }

  function ensureCtors() {
    if (state.ctors) return true;
    const game = findGame(true);
    const ref = findReferenceMesh(game);
    if (!ref) return false;
    const material = Array.isArray(ref.material) ? ref.material[0] : ref.material;
    const Geometry = ref.mesh.geometry.constructor;
    const Attr = ref.mesh.geometry.attributes.position.constructor;
    const TextureCtor = material.map.constructor;
    const MeshCtor = ref.mesh.constructor;

    // Object3D/Group: el renderer del juego SOLO dibuja sus propias clases
    // (patrón CustomModels): el rig del brazo del jugador es el Group real.
    // Buscamos primero por findHandRenderer; el fallback sube la cadena de
    // prototipos hasta el nodo cuyo padre es Object.prototype (= Object3D).
    let GroupCtor = null;
    try {
      const cam = game?.gameScene?.axesHelper?.parent;
      for (const child of cam?.children ?? []) {
        if (typeof child?.updateArmAnimation === 'function' && child.item && child.rightArm) {
          GroupCtor = child.constructor;
          break;
        }
      }
    } catch (_) {}
    if (!GroupCtor) {
      try {
        let p = Object.getPrototypeOf(ref.mesh);
        for (let i = 0; i < 12 && p; i++) {
          const parent = Object.getPrototypeOf(p);
          if (!parent || parent === Object.prototype) {
            if (p.constructor && typeof p.add === 'function') GroupCtor = p.constructor;
            break;
          }
          p = parent;
        }
      } catch (_) {}
    }
    if (!GroupCtor) return false;
    state.ctors = { Geometry, Attr, TextureCtor, MeshCtor, Object3DCtor: GroupCtor };
    console.log(TAG, 'constructores robados', Geometry?.name, MeshCtor?.name, GroupCtor?.name);
    return true;
  }

  // ─── Assets ───
  function isValidAssetsUrl(url) {
    return typeof url === 'string' && url.startsWith('chrome-extension://') && !url.startsWith('chrome-extension://invalid/');
  }

  function resolveAssetsBase() {
    if (isValidAssetsUrl(state.assetsBase)) return state.assetsBase;
    try {
      const meta = document.querySelector('meta[name="mf-particles-base"]');
      if (isValidAssetsUrl(meta?.content)) {
        return meta.content.replace(/assets\/particles\/$/, 'assets/tiny/');
      }
      const other = document.querySelector('meta[name="mf-mirror-base"]');
      const content = other?.content;
      if (typeof content === 'string' && content.endsWith('assets/mfpack/') && isValidAssetsUrl(content)) {
        return content.slice(0, -'assets/mfpack/'.length) + 'assets/tiny/';
      }
    } catch (_) {}
    return '';
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('IMG_LOAD ' + url));
      img.src = url;
    });
  }

  function loadTexture(name, dir) {
    const key = (dir ? dir + '/' : '') + name;
    if (state.textures.has(key)) return Promise.resolve(state.textures.get(key));
    const base = resolveAssetsBase();
    if (!base || !state.ctors) return Promise.reject(new Error('SIN_BASE_O_CTORS'));
    const url = base + key + '.png';
    return loadImage(url).then(image => {
      const texture = new state.ctors.TextureCtor(image);
      applyPixelTextureSettings(texture);
      state.textures.set(key, texture);
      return texture;
    });
  }

  // NearestFilter en mag/min + ClampToEdge: pixel art nítido estilo MC.
  // El constructor del juego puede pisar los filtros al decodificar el
  // bitmap async: re-aplicar en diferido (rAF + timeout) para que gane.
  function applyPixelTextureSettings(texture) {
    const apply = () => {
      try {
        texture.magFilter = 9728;   // NearestFilter
        texture.minFilter = 9728;   // NearestFilter (sin mipmaps)
        texture.generateMipmaps = false;
        texture.wrapS = 33071;      // ClampToEdgeWrapping
        texture.wrapT = 33071;
        texture.anisotropy = 1;
        // flipY=true: las UVs ya convierten v MC (abajo) a GL (arriba) con
        // 1 - v_px/texH; con false la textura queda invertida.
        texture.flipY = true;
        texture.needsUpdate = true;
      } catch (_) {}
    };
    apply();
    requestAnimationFrame(apply);
    setTimeout(apply, 250);
    setTimeout(apply, 1200);
  }

  // ─── Mini-runtime de modelos MC → three.js ───
  // MC: 1px = 1/16 bloque; modelo cuelga de y=24px; y MC hacia abajo
  // → three.js y = (24 - y_px)/16
  function mcY(yPx) { return (24 - yPx) / 16; }

  function buildBoxGeometry(box, texW, texH) {
    const { Geometry, Attr } = state.ctors;
    const [x, y, z, w, h, d] = box.coords;
    const grow = box.grow || 0;

    const x0 = (x - grow) / 16, x1 = (x + w + grow) / 16;
    const yTop = (24 - y + grow) / 16;
    const yBot = (24 - y - h - grow) / 16;
    const z0 = (z - grow) / 16, z1 = (z + d + grow) / 16;

    // UV box-format estándar MC
    const u = box.u, v = box.v;
    const uvS = [u + d + w, v + d, u + d + w + w, v + d + h];          // south
    const uvN = [u + d, v + d, u + d + w, v + d + h];                  // north
    const uvE = [u + d + w, v + d, u + d + w + d, v + d + h];          // east
    const uvW = [u, v + d, u + d, v + d + h];                          // west
    const uvU = [u + d, v, u + d + w, v + d];                          // up
    const uvD = [u + d + w, v, u + d + w + w, v + d];                  // down
    const uvs2 = box.mirror ? { s: uvS, n: uvN, e: uvW, w: uvE, u: uvU, d: uvD } : { s: uvS, n: uvN, e: uvE, w: uvW, u: uvU, d: uvD };

    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    const pushQuad = (vs, fuv, nx, ny, nz) => {
      const base = positions.length / 3;
      for (const v of vs) { positions.push(v[0], v[1], v[2]); normals.push(nx, ny, nz); }
      const [u1, v1, u2, v2] = fuv;
      uvs.push(u1 / texW, 1 - v1 / texH, u2 / texW, 1 - v1 / texH, u2 / texW, 1 - v2 / texH, u1 / texW, 1 - v2 / texH);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    pushQuad([[x0, yTop, z1], [x1, yTop, z1], [x1, yBot, z1], [x0, yBot, z1]], uvs2.s, 0, 0, 1);
    pushQuad([[x1, yTop, z0], [x0, yTop, z0], [x0, yBot, z0], [x1, yBot, z0]], uvs2.n, 0, 0, -1);
    pushQuad([[x0, yTop, z0], [x0, yTop, z1], [x0, yBot, z1], [x0, yBot, z0]], uvs2.w, -1, 0, 0);
    pushQuad([[x1, yTop, z1], [x1, yTop,  z0], [x1, yBot, z0], [x1, yBot, z1]], uvs2.e, 1, 0, 0);
    pushQuad([[x0, yTop, z0], [x1, yTop, z0], [x1, yTop, z1], [x0, yTop, z1]], uvs2.u, 0, 1, 0);
    pushQuad([[x0, yBot, z1], [x1, yBot, z1], [x1, yBot, z0], [x0, yBot, z0]], uvs2.d, 0, -1, 0);

    const geo = new Geometry();
    geo.setAttribute('position', new Attr(new Float32Array(positions), 3));
    geo.setAttribute('normal', new Attr(new Float32Array(normals), 3));
    geo.setAttribute('uv', new Attr(new Float32Array(uvs), 2));
    geo.setIndex(indices);
    geo.computeBoundingBox?.();
    geo.computeBoundingSphere?.();
    return geo;
  }

  function makeMaterial(source, texture) {
    let material = null;
    try { material = new source.constructor(); } catch (_) {
      try { material = source.clone(); } catch (_) {}
    }
    if (!material) return null;
    try {
      material.map = texture;
      material.alphaMap = null; material.aoMap = null; material.lightMap = null;
      material.normalMap = null; material.bumpMap = null; material.displacementMap = null;
      material.emissiveMap = null; material.metalnessMap = null; material.roughnessMap = null;
      material.vertexColors = false;
      material.transparent = false;
      material.alphaTest = 0.5;
      material.side = 2;
      material.fog = true;
      material.toneMapped = source.toneMapped !== false;
      if ('roughness' in material) material.roughness = 1;
      if ('metalness' in material) material.metalness = 0;
      material.color?.set?.(0xffffff);
      material.emissive?.set?.(0x000000);
      material.onBeforeCompile = function () {};
      material.customProgramCacheKey = () => 'mf-tiny-takeover-v1';
      material.needsUpdate = true;
    } catch (_) {}
    return material;
  }

  function buildRig(def, texture, materialSource) {
    const { Object3DCtor, MeshCtor } = state.ctors;
    const root = new Object3DCtor();
    // marcar el rig: si cuelga de la cámara por accidente (side-effect del
    // constructor del juego), purgeUnderCam puede identificarlo y quitarlo
    try { root.userData = root.userData || {}; root.userData.__mfTiny = true; } catch (_) {}
    const parts = {};

    const buildPart = (partDef, parentNode) => {
      const node = new Object3DCtor();
      try { node.userData = node.userData || {}; node.userData.__mfTiny = true; } catch (_) {}
      if (partDef.pivot) {
        node.position.set(partDef.pivot[0] / 16, mcY(partDef.pivot[1]), partDef.pivot[2] / 16);
      }
      if (partDef.rot) {
        node.rotation.set(partDef.rot[0] || 0, partDef.rot[1] || 0, partDef.rot[2] || 0);
      }
      for (const box of partDef.boxes || []) {
        const geo = buildBoxGeometry(box, def.texW, def.texH);
        const mat = makeMaterial(materialSource, texture);
        if (!mat) continue;
        const mesh = new MeshCtor(geo, mat);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = true;
        try { mesh.userData = mesh.userData || {}; mesh.userData.__mfTiny = true; } catch (_) {}
        node.add(mesh);
      }
      parentNode.add(node);
      parts[partDef.name] = node;
      for (const sub of partDef.children || []) buildPart(sub, node);
    };

    buildPart(def.root, root);
    return { root, parts };
  }

  // ─── Animaciones (de prepareMobModel de cada Baby*Model) ───
  function animateWolf(rig, ctx) {
    const p = rig.parts;
    const limb = ctx.limbSwing;
    const speed = ctx.limbSpeed;
    const swing = Math.cos(limb * 0.6662) * 1.4 * speed;

    p.tail.rotation.y = ctx.angry ? 0 : swing;

    if (ctx.sitting) {
      p.body.position.set(0, mcY(21), -1 / 16);
      p.body.rotation.x = Math.PI / 4 - 1.0;
      p.tail.position.set(0, mcY(23.5), 2 / 16);
      p.right_hind_leg.position.set(-1.5 / 16, mcY(24.35), 0.5 / 16);
      p.right_hind_leg.rotation.x = Math.PI * 1.5;
      p.left_hind_leg.position.set(1.5 / 16, mcY(24.35), 0.5 / 16);
      p.left_hind_leg.rotation.x = Math.PI * 1.5;
      p.right_front_leg.position.set(-1.495 / 16, mcY(21.5), -3 / 16);
      p.right_front_leg.rotation.x = 5.811947;
      p.left_front_leg.position.set(1.495 / 16, mcY(21.5), -3 / 16);
      p.left_front_leg.rotation.x = 5.811947;
    } else {
      p.body.position.set(0, mcY(19), 0);
      p.body.rotation.x = 0;
      p.tail.position.set(0, mcY(19), 3 / 16);
      p.right_hind_leg.position.set(-1.5 / 16, mcY(21), 3 / 16);
      p.left_hind_leg.position.set(1.5 / 16, mcY(21), 3 / 16);
      p.right_front_leg.position.set(-1.5 / 16, mcY(21), -3 / 16);
      p.left_front_leg.position.set(1.5 / 16, mcY(21), -3 / 16);
      p.right_hind_leg.rotation.x = swing;
      p.left_hind_leg.rotation.x = Math.cos(limb * 0.6662 + Math.PI) * 1.4 * speed;
      p.right_front_leg.rotation.x = Math.cos(limb * 0.6662 + Math.PI) * 1.4 * speed;
      p.left_front_leg.rotation.x = swing;
    }

    // cabeza sigue la mirada
    p.head.rotation.y = ctx.headYaw;
    p.head.rotation.x = ctx.pitch;
  }

  function animateQuadruped(rig, ctx) {
    const p = rig.parts;
    const limb = ctx.limbSwing;
    const speed = ctx.limbSpeed;
    const swing = Math.cos(limb * 0.6662) * 1.4 * speed;
    if (p.right_front_leg) p.right_front_leg.rotation.x = Math.cos(limb * 0.6662 + Math.PI) * 1.4 * speed;
    if (p.left_front_leg) p.left_front_leg.rotation.x = swing;
    if (p.right_hind_leg) p.right_hind_leg.rotation.x = swing;
    if (p.left_hind_leg) p.left_hind_leg.rotation.x = Math.cos(limb * 0.6662 + Math.PI) * 1.4 * speed;
    if (p.head) {
      p.head.rotation.y = ctx.headYaw;
      p.head.rotation.x = ctx.pitch;
    }
    // alas del pollo
    if (p.left_wing && p.right_wing) {
      const flap = Math.sin(limb * 0.3 + performance.now() * 0.001) * 0.1;
      p.left_wing.rotation.z = flap;
      p.right_wing.rotation.z = -flap;
    }
  }

  // ─── Bindings juego → contexto de animación ───
  function buildContext(entity, key) {
    let limbSwing = 0, limbSpeed = 0;
    try {
      const m = entity.motion || entity.velocity;
      if (m) {
        const horizontal = Math.hypot(Number(m.x) || 0, Number(m.z) || 0);
        limbSpeed = Math.min(1, horizontal * 4);
        const prev = state.limbAccum.get(key) || 0;
        limbSwing = prev + horizontal * 4;
        state.limbAccum.set(key, limbSwing);
      }
    } catch (_) {}
    let headYaw = 0;
    try {
      const yaw = Number(entity.yaw) || 0;
      const bodyYaw = Number(entity.bodyYaw);
      headYaw = Number.isFinite(bodyYaw) ? yaw - bodyYaw : 0;
      if (headYaw > Math.PI) headYaw -= Math.PI * 2;
      if (headYaw < -Math.PI) headYaw += Math.PI * 2;
    } catch (_) {}
    return {
      limbSwing,
      limbSpeed,
      headYaw,
      pitch: Number(entity.pitch) || 0,
      sitting: !!(entity.isSitting || entity.sitting),
      angry: !!(entity.angry || entity.isAngry),
      tamed: !!(entity.isTamed || entity.tamed),
      inWater: entity.inWater === true
    };
  }

  // ─── Instanciación por entidad ───
  function spawnRig(entity, key, type) {
    const def = MODELS[type];
    if (!def || !state.ctors) return;
    const scene = state.game?.gameScene?.scene || getScene(state.game);
    if (!scene) return;
    if (state.rigs.has(key)) return;

    const ref = findReferenceMesh(state.game);
    const materialSource = ref ? (Array.isArray(ref.material) ? ref.material[0] : ref.material) : null;
    if (!materialSource) return;

    loadTexture(def.texName, def.texDir).then(texture => {
      const rig = buildRig(def, texture, materialSource);
      rig.root.name = 'MiniFeatherTinyTakeover_' + type;
      rig.type = type;
      rig.entity = null;
      disableCullingDeep(rig.root);
      scene.add(rig.root);
      // las clases del juego auto-registran en el rig de cámara: purgar
      setTimeout(() => { try { purgeUnderCam(); } catch (_) {} }, 0);
      setTimeout(() => { try { purgeUnderCam(); } catch (_) {} }, 500);
      state.rigs.set(key, rig);
    }).catch(err => console.warn(TAG, 'textura fallida', def.texName, err.message));
  }

  // ─── Scan + tick ───
  function scanEntities() {
    if (!state.enabled || state.destroyed) return;
    const game = findGame();
    if (!game) return;

    if (!state.ctors) ensureCtors();

    const entities = resolveEntityMap(game);
    const seen = new Set();

    const check = (entity) => {
      if (!entity || isPlayer(entity)) return;
      const type = entityType(entity);
      if (!type || !MODELS[type]) return;
      if (!isBabyEntity(entity, type)) return;
      const key = entityKey(entity);
      if (!key) return;
      seen.add(key);
      spawnRig(entity, key, type);
    };

    if (entities) {
      try { for (const entity of entities.values()) check(entity); } catch (_) {}
    }

    for (const [key, rig] of state.rigs) {
      if (key.startsWith('local:')) continue; // spawns del /baby: viven aparte
      if (!seen.has(key)) {
        restoreVanillaMesh(rig);
        try { rig?.root?.removeFromParent?.(); } catch (_) {}
        state.rigs.delete(key);
        state.limbAccum.delete(key);
      }
    }
  }

  function restoreVanillaMesh(rig) {
    try {
      const mesh = rig?.entity?.mesh;
      if (mesh && rig._hidVanilla) mesh.visible = true;
      if (rig) rig._hidVanilla = false;
    } catch (_) {}
  }

  function tick() {
    if (state.destroyed || !state.enabled) { state.raf = 0; return; }
    const now = performance.now();
    const dt = Math.min(0.1, (now - (state.lastTime || now)) / 1000);
    state.lastTime = now;

    const game = findGame();
    const entities = resolveEntityMap(game);

    // babies locales del /baby spawn
    tickLocalSpawns(dt);

    for (const [key, rig] of state.rigs) {
      // rigs locales: usar su estado propio
      if (rig.local) {
        const e = rig.local;
        try {
          rig.root.position.set(e.pos.x, e.pos.y, e.pos.z);
          rig.root.rotation.y = e.yaw;
        } catch (_) {}
        try {
          const ctx = {
            limbSwing: e.limbSwing,
            limbSpeed: e.limbSpeed,
            headYaw: 0,
            pitch: e.pitch || 0,
            sitting: !!e.sitting,
            angry: !!e.angry,
            tamed: true,
            inWater: false
          };
          if (rig.type === 'wolf') animateWolf(rig, ctx);
          else animateQuadruped(rig, ctx);
        } catch (_) {}
        try {
          rig.root.updateMatrix();
          rig.root.updateMatrixWorld(true);
        } catch (_) {}
        continue;
      }

      const entity = findEntityByKey(entities, key);
      if (!entity) continue;

      // ocultar mesh vanilla del baby mientras el rig esté activo
      if (entity.mesh && entity.mesh.visible !== false) {
        try { entity.mesh.visible = false; rig._hidVanilla = true; } catch (_) {}
      }
      rig.entity = entity;

      try {
        const p = entity.pos;
        // pos.y es el CENTRO de la hitbox en miniblox: bajar height/2 para
        // apoyar el modelo (que cuelga de y=24px = pies en el origen) en el suelo
        const half = Number(entity.height) || 0;
        rig.root.position.set(Number(p.x) || 0, (Number(p.y) || 0) - half / 2, Number(p.z) || 0);
        rig.root.rotation.y = Number(entity.yaw) || 0;
      } catch (_) {}

      try {
        const ctx = buildContext(entity, key);
        if (rig.type === 'wolf') animateWolf(rig, ctx);
        else animateQuadruped(rig, ctx);
      } catch (_) {}

      try {
        rig.root.updateMatrix();
        rig.root.updateMatrixWorld(true);
      } catch (_) {}
    }

    state.raf = requestAnimationFrame(tick);
  }

  function findEntityByKey(entities, key) {
    if (!entities) return null;
    const id = key.startsWith('id:') ? key.slice(3) : null;
    try {
      for (const entity of entities.values()) {
        if (id !== null && String(entity.id) === id) return entity;
        if (entityKey(entity) === key) return entity;
      }
    } catch (_) {}
    return null;
  }

  // ─── Enable/disable ───
  function start() {
    if (state.enabled || state.destroyed) return;
    state.enabled = true;
    ensureCtors();
    state.scanTimer = window.setInterval(scanEntities, SCAN_MS);
    state.raf = requestAnimationFrame(tick);
    console.log(TAG, 'activado');
  }

  // ─── Spawn client-side (comando /baby) ───
  // entidades locales simuladas: no existen en el servidor; el tick las
  // anima igual que a las reales (walk cycle, cola, cabeza)
  const localSpawns = new Map(); // name -> { type, pos, yaw, motion, ctx }

  function spawnLocal(name, type, x, y, z) {
    if (!MODELS[type]) return false;
    if (localSpawns.has(name)) return false;
    localSpawns.set(name, {
      type,
      pos: { x, y, z },
      yaw: 0,
      pitch: 0,
      motion: { x: 0, y: 0, z: 0 },
      limbSwing: 0,
      limbSpeed: 0,
      sitting: false,
      angry: false,
      tamed: true,
      follow: null
    });
    start(); // arranca el módulo si no estaba activo
    return true;
  }

  function despawnLocal(name) {
    const entry = localSpawns.get(name);
    if (!entry) return false;
    const rigKey = 'local:' + name;
    const rig = state.rigs.get(rigKey);
    if (rig) {
      try { rig.root.removeFromParent?.(); } catch (_) {}
      state.rigs.delete(rigKey);
      state.limbAccum.delete(rigKey);
    }
    localSpawns.delete(name);
    return true;
  }

  function clearLocalSpawns() {
    for (const name of [...localSpawns.keys()]) despawnLocal(name);
  }

  // IA local simple: caminar hacia el jugador si está lejos
  function tickLocalSpawns(dt) {
    const game = findGame();
    const player = game?.player;
    for (const [name, entry] of localSpawns) {
      const rigKey = 'local:' + name;
      // spawn rig si aún no existe (throttle de reintento si falla)
      if (!state.rigs.has(rigKey)) {
        const now2 = performance.now();
        if (!entry._lastTry || now2 - entry._lastTry > 2000) {
          entry._lastTry = now2;
          try { spawnRigForLocal(name, entry, rigKey); } catch (_) {}
        }
        continue;
      }
      // seguir al jugador si está a más de 2.5 bloques
      if (player?.pos) {
        const px = Number(player.pos.x) || 0;
        const py = Number(player.pos.y) || 0;
        const pz = Number(player.pos.z) || 0;
        // el jugador también tiene pos.y al centro: apuntar a sus pies
        const feetY = py - (Number(player.height) || 1.8) / 2;
        const dx = px - entry.pos.x;
        const dy = feetY - entry.pos.y;
        const dz = pz - entry.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 2.5 && !entry.sitting) {
          const speed = 2.6; // bloques/seg
          const step = Math.min(dist, speed * dt);
          entry.pos.x += (dx / dist) * step;
          entry.pos.z += (dz / dist) * step;
          // gravedad simple: caer hasta quedar a ras de los pies del jugador
          entry.pos.y += Math.max(-3 * dt, Math.min(3 * dt, (feetY - 0.1 - entry.pos.y) * 4 * dt));
          entry.yaw = Math.atan2(dx, dz);
          entry.limbSpeed = Math.min(1, 0.65);
          entry.limbSwing += step * 4;
        } else {
          entry.limbSpeed *= 0.6;
        }
      }
    }
  }

  function spawnRigForLocal(name, entry, rigKey) {
    const def = MODELS[entry.type];
    if (!def || !state.ctors) return;
    const scene = state.game?.gameScene?.scene || getScene(state.game);
    if (!scene) return;
    const ref = findReferenceMesh(state.game);
    const materialSource = ref ? (Array.isArray(ref.material) ? ref.material[0] : ref.material) : null;
    if (!materialSource) return;
    loadTexture(def.texName, def.texDir).then(texture => {
      const rig = buildRig(def, texture, materialSource);
      rig.root.name = 'MiniFeatherTinyTakeover_local_' + name;
      rig.type = entry.type;
      rig.entity = null;
      rig.local = entry;
      disableCullingDeep(rig.root);
      scene.add(rig.root);
      // las clases del juego auto-registran en el rig de cámara: purgar
      setTimeout(() => { try { purgeUnderCam(); } catch (_) {} }, 0);
      setTimeout(() => { try { purgeUnderCam(); } catch (_) {} }, 500);
      state.rigs.set(rigKey, rig);
    }).catch(err => console.warn(TAG, 'textura fallida (local)', def.texName, err.message));
  }

  function disableCullingDeep(root) {
    const walk = (n) => {
      n.frustumCulled = false;
      n.matrixAutoUpdate = true;
      for (const c of n.children || []) walk(c);
    };
    try { walk(root); } catch (_) {}
  }

  // red de seguridad: quitar objetos MF colgados del rig de la cámara
  function purgeUnderCam() {
    const cam = findGame()?.gameScene?.axesHelper?.parent;
    if (!cam) return;
    let purged = 0;
    const walk = (o) => {
      for (const c of [...(o.children || [])]) {
        if (c?.userData?.__mfTiny) {
          try { o.remove(c); purged++; } catch (_) {}
          continue;
        }
        walk(c);
      }
    };
    try { walk(cam); } catch (_) {}
    if (purged) console.warn(TAG, 'purgados', purged, 'objetos pegados a la cámara');
  }

  // limpia los rigs locales (al desactivar o destruir el módulo)
  function clearVisuals() {
    for (const [, rig] of state.rigs) {
      restoreVanillaMesh(rig);
      try { rig?.root?.removeFromParent?.(); } catch (_) {}
    }
    state.rigs.clear();
    state.limbAccum.clear();
    state.entityMap = null;
  }

  function stop() {
    if (!state.enabled) return;
    state.enabled = false;
    clearInterval(state.scanTimer);
    state.scanTimer = 0;
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
    clearVisuals();
    clearLocalSpawns();
    console.log(TAG, 'desactivado');
  }

  function applyConfig(detail) {
    let cfg = detail;
    if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch (_) { return; } }
    if (!cfg || typeof cfg !== 'object') return;
    if (isValidAssetsUrl(cfg.assetsBase)) state.assetsBase = cfg.assetsBase;
    if (cfg.enabled) start(); else stop();
  }

  const configHandler = event => applyConfig(event.detail);
  document.addEventListener(EVENT_NAME, configHandler);

  globalThis[GLOBAL_KEY] = {
    setEnabled(v) { v ? start() : stop(); },
    get enabled() { return state.enabled; },
    get rigCount() { return state.rigs.size; },
    get textureCount() { return state.textures.size; },
    get types() { return Object.keys(MODELS || {}); },
    // spawn client-side: aparece al lado del jugador
    spawn(name, type, x, y, z) {
      if (x === undefined) {
        const game = findGame();
        const p = game?.player?.pos;
        if (p) {
          const yaw = Number(game.player.yaw) || 0;
          // pos.y del jugador es el centro de su hitbox: usar los pies
          const feetY = (Number(p.y) || 0) - (Number(game.player.height) || 1.8) / 2;
          return spawnLocal(name, type, (Number(p.x) || 0) + Math.sin(yaw) * 2, feetY, (Number(p.z) || 0) + Math.cos(yaw) * 2);
        }
        return false;
      }
      return spawnLocal(name, type, Number(x), Number(y), Number(z));
    },
    despawn(name) { return despawnLocal(name); },
    despawnAll() { clearLocalSpawns(); return true; },
    sit(name, v) {
      const e = localSpawns.get(name);
      if (!e) return false;
      e.sitting = v === undefined ? !e.sitting : !!v;
      return true;
    },
    list() {
      return [...localSpawns.entries()].map(([name, e]) => ({ name, type: e.type, sitting: e.sitting, pos: { ...e.pos } }));
    },
    // re-aplicar NearestFilter a todas las texturas (debug en vivo)
    repixel() {
      let n = 0;
      for (const [, tex] of state.textures) { applyPixelTextureSettings(tex); n++; }
      return n;
    },
    debug() {
      return {
        enabled: state.enabled,
        rigs: state.rigs.size,
        textures: [...state.textures.keys()],
        ctors: state.ctors ? 'ok' : 'pendiente',
        assetsBase: resolveAssetsBase(),
        locals: [...localSpawns.keys()]
      };
    },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      stop();
      document.removeEventListener(EVENT_NAME, configHandler);
      try { delete globalThis[GLOBAL_KEY]; } catch (_) {}
    }
  };

  console.log(TAG, 'Tiny Takeover listo (baby wolf incluido)');
})();
