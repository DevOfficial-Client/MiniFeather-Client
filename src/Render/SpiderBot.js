// MiniFeather — SpiderBot: arañas-robot procedurales client-side
// Porte del mod TheCymaera/minecraft-spider (Heledron):
//   - torso: presets block_display (flat/boxy/stealth) → cajas three.js
//   - patas: IK analítico 2-huesos + gait procedural (walk en diagonales)
//   - variantes: angel (halo + alas + 8 patas), escala configurable
// Los bloques MC se pintan con colores planos por material.

(() => {
  'use strict';
  const TAG = '[MiniFeather SpiderBot]';

  // paleta de materiales MC aproximada (hex)
  const MAT_COLORS = {
    netherite_block: 0x443a3b, polished_deepslate_slab: 0x333333,
    anvil: 0x484243, smooth_quartz: 0xe8e3dc, gray_concrete: 0x383a3d,
    black_shulker_box: 0x141519, gray_shulker_box: 0x383a3d,
    cyan_shulker_box: 0x157788, black_concrete: 0x080a0f,
    white_concrete: 0xd0d3d6, gold_block: 0xf8d33e,
  };

  // pares de patas: [rootX, rootY, rootZ, restX, restZ, segLen]
  // (del hexapod() del mod; angel/octopod usa 4 pares)
  const LEG_PAIRS_6 = [
    [0, 0, 0.1, 1.0, 1.1, 1.1],
    [0, 0, 0.0, 1.3, -0.3, 1.1],
    [0, 0, -0.1, 1.2, -2.0, 1.6],
  ];
  const LEG_PAIRS_8 = [
    [0, 0, 0.1, 1.0, 1.6, 1.1],
    [0, 0, 0.0, 1.3, 0.4, 1.0],
    [0, 0, -0.1, 1.3, -0.9, 1.1],
    [0, 0, -0.2, 1.1, -2.5, 1.6],
  ];

  const state = {
    enabled: false, ctors: null, game: null,
    spiders: new Map(),
    lastTick: 0, raf: 0, lastGameScan: 0,
  };

  // ─── infra (patrones TinyTakeover/WaterSplash) ───
  function findGame(force = false) {
    const now = performance.now();
    if (!force && state.game?.player && state.game?.world && now - state.lastGameScan < 1200) return state.game;
    state.lastGameScan = now;
    for (const candidate of [globalThis.miniblox, globalThis.__MINIBLOX_GAME__, state.game]) {
      if (candidate?.player && candidate?.world) { state.game = candidate; return candidate; }
    }
    // React fiber: #react → updateQueue.baseState.element.props.game
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

  function getWorldProtoDeep(world) {
    let proto = world && Object.getPrototypeOf(world);
    for (let i = 0; i < 6 && proto; i++) {
      if (typeof proto.getChunk === 'function' || typeof proto.getBlockState === 'function') return proto;
      proto = Object.getPrototypeOf(proto);
    }
    return null;
  }

  // altura del suelo en la columna (x,z) cerca de y
  function groundHeightAt(game, x, y, z) {
    try {
      const world = game?.world;
      const proto = getWorldProtoDeep(world);
      if (!proto?.getChunk) return null;
      const bx = Math.floor(x), bz = Math.floor(z), by = Math.floor(y);
      const at = (yy) => {
        try {
          const chunk = proto.getChunk.call(world, { x: bx, y: yy, z: bz });
          if (chunk != null && !chunk.isDummyChunk && typeof chunk.getBlockState === 'function') {
            return chunk.getBlockState({ x: bx, y: yy, z: bz });
          }
          return null;
        } catch (_) { return null; }
      };
      for (let d = 6; d >= -6; d--) {
        const s = at(by + d);
        if (!s || s.id === 0) continue;
        return by + d + 1; // cara superior del bloque
      }
      return null;
    } catch (_) { return null; }
  }

  function findReferenceMesh(game) {
    const scene = getScene(game);
    let best = null, bestRank = 99;
    const rank = { MeshLambertMaterial: 0, MeshBasicMaterial: 1, MeshStandardMaterial: 2, MeshPhongMaterial: 3 };
    const consider = (obj) => {
      if (!obj?.isMesh || obj.isSkinnedMesh || obj.geometry?.attributes?.skinIndex) return;
      if (!obj.geometry?.attributes?.position) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        const type = mat?.type || mat?.constructor?.name || '';
        const r = rank[type];
        if (r === undefined || r >= bestRank) continue;
        best = { mesh: obj, material: mat };
        bestRank = r;
      }
    };
    try { if (scene?.traverse) scene.traverse(consider); } catch (_) {}
    if (!best) {
      try {
        for (const rootKey of ['chunkMeshes', 'entityMeshes', 'ambientMeshes']) {
          const root = game?.gameScene?.[rootKey];
          if (!root?.children) continue;
          for (const c of root.children) { consider(c); for (const g of c?.children ?? []) consider(g); }
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
    const game = state.game || findGame();
    if (!game) return false;
    state.game = game;
    const ref = findReferenceMesh(game);
    if (!ref) return false;
    const material = Array.isArray(ref.material) ? ref.material[0] : ref.material;
    const Geometry = ref.mesh.geometry.constructor;
    const Attr = ref.mesh.geometry.attributes.position.constructor;
    const MeshCtor = ref.mesh.constructor;
    const MaterialCtor = material.constructor;
    let GroupCtor = null, Vector3Ctor = null;
    // Plan principal (patrón CustomModels): el rig del brazo del jugador ES
    // el Group real del juego — el renderer solo dibuja sus propias clases
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
    // material de referencia para clonar (más robusto que new Material(params))
    state.refMaterial = material;
    // Vector3 real del juego: rotateOnAxis/lookAt exigen instancia nativa
    try {
      const scratch = new GroupCtor();
      if (scratch.position?.constructor) Vector3Ctor = scratch.position.constructor;
      scratch.clear?.();
    } catch (_) {}
    state.ctors = { Geometry, Attr, Mesh: MeshCtor, Material: MaterialCtor, Group: GroupCtor, Vector3: Vector3Ctor };
    console.log(TAG, 'constructores', Geometry?.name, MeshCtor?.name, GroupCtor?.name);
    return true;
  }

  // ─── utilidades de geometría ───
  function cubeGeometry(ctors) {
    const quads = [
      [[0,0,0],[1,0,0],[1,0,1],[0,0,1],[0,1,0],[1,1,0],[1,1,1],[0,1,1]], // índices de esquinas
    ];
    void quads;
    // cubo unitario [0,1]^3 — 6 caras × 2 triángulos
    const P = [
      0,0,1, 1,0,1, 1,1,1,  0,0,1, 1,1,1, 0,1,1,   // +z
      1,0,0, 0,0,0, 0,1,0,  1,0,0, 0,1,0, 1,1,0,   // -z
      1,0,1, 1,0,0, 1,1,0,  1,0,1, 1,1,0, 1,1,1,   // +x
      0,0,0, 0,0,1, 0,1,1,  0,0,0, 0,1,1, 0,1,0,   // -x
      0,1,1, 1,1,1, 1,1,0,  0,1,1, 1,1,0, 0,1,0,   // +y
      0,0,0, 1,0,0, 1,0,1,  0,0,0, 1,0,1, 0,0,1,   // -y
    ];
    const geo = new ctors.Geometry();
    geo.setAttribute('position', new ctors.Attr(new Float32Array(P), 3));
    const N = new Float32Array(P.length);
    recomputeFlatNormals(N, P);
    geo.setAttribute('normal', new ctors.Attr(N, 3));
    return geo;
  }

  function recomputeFlatNormals(target, positions) {
    const pa = positions;
    for (let i = 0; i < pa.length; i += 9) {
      const ax = pa[i+3]-pa[i], ay = pa[i+4]-pa[i+1], az = pa[i+5]-pa[i+2];
      const bx = pa[i+6]-pa[i], by = pa[i+7]-pa[i+1], bz = pa[i+8]-pa[i+2];
      let nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx;
      const L = Math.hypot(nx, ny, nz) || 1;
      nx /= L; ny /= L; nz /= L;
      for (let k = 0; k < 6; k++) {
        target[i+k*3] = nx; target[i+k*3+1] = ny; target[i+k*3+2] = nz;
      }
    }
  }

  // transforma vértices por matriz 4x4 column-major estilo MC transformation
  // MC: transformation:[m00,m10,m20,m30, m01,m11,...] en realidad es
  // row-major [xxx?] — el NBT usa 16 floats en orden columna: probamos
  // estándar MC display (translation en índices 3,7,11)
  function transformPositions(positions, mx) {
    const pa = positions;
    for (let i = 0; i < pa.length; i += 3) {
      const x = pa[i], y = pa[i+1], z = pa[i+2];
      pa[i]   = mx[0]*x + mx[1]*y + mx[2]*z + mx[3];
      pa[i+1] = mx[4]*x + mx[5]*y + mx[6]*z + mx[7];
      pa[i+2] = mx[8]*x + mx[9]*y + mx[10]*z + mx[11];
    }
  }

  function scalePositions(positions, sx, sy, sz, offX, offY, offZ) {
    const pa = positions;
    for (let i = 0; i < pa.length; i += 3) {
      pa[i]   = pa[i]   * sx + offX;
      pa[i+1] = pa[i+1] * sy + offY;
      pa[i+2] = pa[i+2] * sz + offZ;
    }
  }

  function makeMesh(geo, color, ctors) {
    let mat;
    try {
      // clonar el material de referencia del juego y pintarlo
      mat = state.refMaterial.clone();
      mat.color.setHex(color);
      if ('map' in mat) { mat.map = null; mat.needsUpdate = true; }
    } catch (_) {
      try { mat = new ctors.Material({ color }); } catch (_2) { mat = new ctors.Material(); }
    }
    let mesh;
    try { mesh = new ctors.Mesh(geo, mat); }
    catch (_) { mesh = new ctors.Mesh(geo, new ctors.Material()); }
    try { mesh.material.color.setHex(color); } catch (_) {}
    mesh.userData = mesh.userData || {};
    mesh.userData.__mfSpider = true;
    return mesh;
  }

  // ─── parser del modelo /summon → piezas ───
  function parseSummonModel(command, scale) {
    if (!command) return [];
    const pieces = [];
    const re = /\{id:"minecraft:block_display",block_state:\{Name:"minecraft:([a-z_]+)"(?:,Properties:(\{[^}]*\}))?\},transformation:\[([^\]]+)\]/g;
    let m;
    while ((m = re.exec(command))) {
      const material = m[1];
      // los floats Kotlin traen sufijo "f" (0f, 0.75f): quitarlo antes de Number
      const nums = m[3].split(',').map(s => Number(s.replace(/f/g, '').trim()));
      if (nums.length < 16 || nums.some(isNaN)) continue;
      if (scale !== 1) for (let i = 0; i < 12; i++) nums[i] *= scale;
      pieces.push({ material, props: m[2] || '', matrix: nums });
    }
    return pieces;
  }

  // ─── construir spider ───
  function createSpider(name, preset, variant, scaleArg) {
    if (!ensureCtors()) return null;
    const ctors = state.ctors;
    const game = state.game;
    if (!game) { console.warn(TAG, 'sin game (React fiber no encontrado)'); return null; }
    const scene = game?.gameScene?.scene?.isObject3D ? game.gameScene.scene : getScene(game);
    if (!scene) { console.warn(TAG, 'sin escena'); return null; }
    const torsoData = window.MF_SPIDER_TORSO?.[preset];
    if (!torsoData) { console.warn(TAG, 'sin preset', preset); return null; }
    const torso = parseSummonModel(torsoData.command, torsoData.scale);
    if (!torso.length) { console.warn(TAG, 'preset sin piezas parseables', preset); return null; }

    const isAngel = variant === 'angel';
    const scale = scaleArg || (isAngel ? 2.2 : 1.6);
    const use8 = isAngel;
    const pairs = use8 ? LEG_PAIRS_8 : LEG_PAIRS_6;

    const root = new ctors.Group();
    root.userData.__mfSpider = true;
    root.name = 'MiniFeatherSpider_' + name;
    const bodyGroup = new ctors.Group();
    bodyGroup.userData.__mfSpider = true;
    root.add(bodyGroup);

    // torso
    for (const piece of torso) {
      let color = MAT_COLORS[piece.material] ?? 0x777777;
      if (isAngel) {
        if (piece.material === 'cyan_shulker_box') color = 0x66fcff;
        else if (piece.material === 'netherite_block' || piece.material === 'anvil') color = MAT_COLORS.gold_block;
        else color = MAT_COLORS.white_concrete;
      }
      const geo = cubeGeometry(ctors);
      transformPositions(geo.attributes.position.array, piece.matrix);
      recomputeFlatNormals(geo.attributes.normal.array, geo.attributes.position.array);
      const mesh = makeMesh(geo, color, ctors);
      bodyGroup.add(mesh);
    }

    // patas
    const legs = [];
    for (let pi = 0; pi < pairs.length; pi++) {
      const p = pairs[pi];
      for (const side of [-1, 1]) {
        const leg = buildLeg(p, side, scale, isAngel, ctors);
        legs.push(leg);
        root.add(leg.pivot);
      }
    }

    // angel: halo + alas
    let halo = null;
    const wings = [];
    if (isAngel) {
      halo = buildHalo(ctors);
      root.add(halo);
      wings.push(buildWing(ctors, 1), buildWing(ctors, -1));
      for (const w of wings) root.add(w.root);
    }

    disableCullingDeep(root);
    scene.add(root);
    purgeUnderCam();

    const player = state.game?.player;
    const pp = player?.pos;
    const feetY = pp ? (Number(pp.y) || 0) - (Number(player.height) || 1.8) / 2 : 64;
    const yaw = Number(state.game?.player?.yaw) || 0;

    const spider = {
      key: name, preset, variant: variant || 'normal', scale,
      root, bodyGroup, legs, halo, wings,
      pos: {
        x: pp ? (Number(pp.x) || 0) + Math.sin(yaw) * 4 : 0,
        y: feetY + 1.1 * scale,
        z: pp ? (Number(pp.z) || 0) + Math.cos(yaw) * 4 : 0,
      },
      yaw, vel: { x: 0, y: 0, z: 0 },
      hovering: isAngel,
      bobSeed: Math.random() * 10,
    };
    state.spiders.set(name, spider);
    return spider;
  }

  function buildLeg(p, side, scale, white, ctors) {
    const [rx, , rz, restx, restz, segLen] = p;
    const pivot = new ctors.Group();
    pivot.userData.__mfSpider = true;
    pivot.position.set(rx * scale * side, 0, rz * scale);

    const color = white ? MAT_COLORS.white_concrete : MAT_COLORS.netherite_block;
    const L1 = segLen * scale * 0.55, L2 = segLen * scale * 0.55;
    const th1 = 0.18 * scale, th2 = 0.13 * scale;

    // femur: caja a lo largo de +X (largo L1)
    const gFemur = cubeGeometry(ctors);
    scalePositions(gFemur.attributes.position.array, L1, th1, th1, 0, -th1 / 2, -th1 / 2);
    recomputeFlatNormals(gFemur.attributes.normal.array, gFemur.attributes.position.array);
    const femur = makeMesh(gFemur, color, ctors);
    const femurPivot = new ctors.Group();
    femurPivot.userData.__mfSpider = true;
    femurPivot.add(femur);

    // tibia: igual que el femur pero naciendo en la rodilla (x=L1)
    // — apunta +X para que el ángulo de rodilla sea relativo al femur
    const gTibia = cubeGeometry(ctors);
    scalePositions(gTibia.attributes.position.array, L2, th2, th2, 0, -th2 / 2, -th2 / 2);
    recomputeFlatNormals(gTibia.attributes.normal.array, gTibia.attributes.position.array);
    const tibia = makeMesh(gTibia, color, ctors);
    const tibiaPivot = new ctors.Group();
    tibiaPivot.userData.__mfSpider = true;
    tibiaPivot.position.x = L1;
    tibiaPivot.add(tibia);

    femurPivot.add(tibiaPivot);
    pivot.add(femurPivot);

    if (side === -1) pivot.rotation.y = Math.PI;

    return {
      pivot, femurPivot, tibiaPivot, side,
      L1, L2,
      // el mod espeja SOLO x para el lado izquierdo (addLegPair)
      rest: { x: restx * side, z: restz },
      cur: { x: restx * side, y: 0, z: restz },
      stepStart: { x: restx * side, y: 0, z: restz },
      stepProgress: 1, isMoving: false,
      timeSinceStop: 99, timeSinceBegin: 99,
    };
  }

  function buildHalo(ctors) {
    const segs = 24, R = 0.5, r = 0.06;
    const posArr = [];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const x00 = Math.cos(a0) * R, z00 = Math.sin(a0) * R;
      const x01 = Math.cos(a1) * R, z01 = Math.sin(a1) * R;
      posArr.push(
        x00, r, z00,  x01, r, z01,  x01, -r, z01,
        x00, r, z00,  x01, -r, z01, x00, -r, z00
      );
    }
    const normArr = new Float32Array(posArr.length);
    recomputeFlatNormals(normArr, posArr);
    const geo = new ctors.Geometry();
    geo.setAttribute('position', new ctors.Attr(new Float32Array(posArr), 3));
    geo.setAttribute('normal', new ctors.Attr(normArr, 3));
    const mesh = makeMesh(geo, 0xffd94a, ctors);
    mesh.position.y = 1.05;
    return mesh;
  }

  function buildWing(ctors, sgn) {
    const root = new ctors.Group();
    root.userData.__mfSpider = true;
    root.rotation.z = sgn * 0.3;
    const feathers = [];
    const specs = [[0.9, 0], [0.7, -0.35], [0.5, -0.62]];
    for (const [len, drop] of specs) {
      const geo = cubeGeometry(ctors);
      const th = 0.06, span = 0.34;
      scalePositions(geo.attributes.position.array, len, th, span, 0, 0, -span / 2);
      recomputeFlatNormals(geo.attributes.normal.array, geo.attributes.position.array);
      const m = makeMesh(geo, 0xf5f5f0, ctors);
      m.position.set(0, 0.35 + drop, sgn * 0.25);
      m.rotation.y = sgn * -0.5;
      root.add(m);
      feathers.push(m);
    }
    return { root, feathers };
  }

  // ─── tick ───
  function tick() {
    if (!state.enabled) { state.raf = requestAnimationFrame(tick); return; }
    try { tickBody(); } catch (e) { console.warn(TAG, 'tick error (recuperado)', e); }
    state.raf = requestAnimationFrame(tick); // SIEMPRE re-agendar
  }

  function tickBody() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - state.lastTick) / 1000) || 0.016;
    state.lastTick = now;
    const game = state.game || findGame();
    if (game) state.game = game;

    for (const sp of state.spiders.values()) {
      const player = game?.player;
      if (player?.pos) {
        const px = Number(player.pos.x) || 0;
        const pz = Number(player.pos.z) || 0;
        const dx = px - sp.pos.x, dz = pz - sp.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 3.5) {
          const spd = dist > 7 ? 3.4 : 2.2;
          sp.vel.x = (dx / dist) * spd;
          sp.vel.z = (dz / dist) * spd;
        } else {
          sp.vel.x *= 0.82; sp.vel.z *= 0.82;
        }
        const speed = Math.hypot(sp.vel.x, sp.vel.z);
        if (speed > 0.2) {
          sp.yaw = angleLerp(sp.yaw, Math.atan2(sp.vel.x, sp.vel.z), 1 - Math.pow(0.0001, dt));
        }
        // altura del cuerpo
        const g = groundHeightAt(game, sp.pos.x, sp.pos.y, sp.pos.z);
        if (sp.hovering) {
          const targetY = (g ?? sp.pos.y - 1) + 1.1 * sp.scale + 0.5 + Math.sin(now / 650 + sp.bobSeed) * 0.12;
          sp.pos.y += (targetY - sp.pos.y) * Math.min(1, 3 * dt);
        } else {
          const targetY = (g ?? sp.pos.y) + 1.1 * sp.scale;
          sp.pos.y += (targetY - sp.pos.y) * Math.min(1, 6 * dt);
        }
      }
      sp.pos.x += sp.vel.x * dt;
      sp.pos.z += sp.vel.z * dt;
      sp.root.position.set(sp.pos.x, sp.pos.y, sp.pos.z);
      sp.root.rotation.y = sp.yaw;

      try { updateLegs(sp, game, dt); } catch (e) { /* pata rota no mata el cuerpo */ }
      if (sp.wings?.length) {
        const flap = Math.sin(now / 120 + sp.bobSeed);
        sp.wings[0].root.rotation.x = -0.3 + flap * 0.75;
        sp.wings[1].root.rotation.x = 0.3 - flap * 0.75;
      }
      if (sp.halo) {
        sp.halo.rotation.y += dt * 1.2;
        sp.halo.position.y = 1.05 + (sp.hovering ? Math.sin(now / 650 + sp.bobSeed) * 0.05 : 0);
      }

      // CRÍTICO (lección FallenLeaves): el juego congela el matrixWorld de
      // la escena — sin updateMatrixWorld manual las animaciones nunca
      // llegan a la GPU y todo queda congelado en la pose del spawn
      try { sp.root.updateMatrix(); sp.root.updateMatrixWorld(true); } catch (_) {}
    }
  }

  function angleLerp(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
  }

  function updateLegs(sp, game, dt) {
    const bodyHeight = 1.1 * sp.scale;
    const cos = Math.cos(sp.yaw), sin = Math.sin(sp.yaw);
    const speed = Math.hypot(sp.vel.x, sp.vel.z);
    const n = sp.legs.length;

    for (let li = 0; li < n; li++) {
      const leg = sp.legs[li];
      // rest en mundo
      const rw = {
        x: sp.pos.x + leg.rest.x * sp.scale * cos - leg.rest.z * sp.scale * sin,
        z: sp.pos.z + leg.rest.x * sp.scale * sin + leg.rest.z * sp.scale * cos,
      };
      // look-ahead en la dirección de la velocidad
      let tx = rw.x, tz = rw.z;
      if (speed > 0.4) {
        const look = 0.55 * Math.min(1.4, speed / 2.2) * sp.scale;
        tx += (sp.vel.x / speed) * look;
        tz += (sp.vel.z / speed) * look;
      }
      const restY = sp.pos.y;
      const groundY = groundHeightAt(game, tx, restY, tz);
      const ty = groundY !== null ? groundY : restY - bodyHeight;

      if (!leg.isMoving) {
        const d2 = (leg.cur.x - tx) ** 2 + (leg.cur.z - tz) ** 2;
        const trigger = (0.3 + Math.min(0.55, speed * 0.3)) * sp.scale;
        if (d2 > trigger * trigger && canLegMove(sp, li)) {
          leg.isMoving = true;
          leg.stepStart = { x: leg.cur.x, y: leg.cur.y, z: leg.cur.z };
          leg.stepProgress = 0;
          leg.timeSinceBegin = 0;
        }
      } else {
        const stepSpeed = 2.8 * sp.scale;
        const dist = Math.hypot(tx - leg.stepStart.x, tz - leg.stepStart.z) || 0.05;
        leg.stepProgress = Math.min(1, leg.stepProgress + (stepSpeed * dt) / dist);
        const t = leg.stepProgress;
        leg.cur.x = leg.stepStart.x + (tx - leg.stepStart.x) * t;
        leg.cur.z = leg.stepStart.z + (tz - leg.stepStart.z) * t;
        leg.cur.y = ty + (0.4 * sp.scale) * 4 * t * (1 - t); // envolvente parabólica
        if (t >= 1) {
          leg.isMoving = false;
          leg.cur.y = ty;
          leg.timeSinceStop = 0;
        }
      }
      leg.timeSinceStop += dt;
      leg.timeSinceBegin += dt;

      // ─── IK 2-huesos analítico ───
      // pie en espacio local del cuerpo (sin yaw)
      const lx = (leg.cur.x - sp.pos.x) * cos + (leg.cur.z - sp.pos.z) * sin;
      const lz = -(leg.cur.x - sp.pos.x) * sin + (leg.cur.z - sp.pos.z) * cos;
      const footY = leg.cur.y - sp.pos.y; // negativo = bajo el cuerpo

      const L1 = leg.L1, L2 = leg.L2;
      // vector horizontal pivote→pie en root-space
      const vx = lx - leg.pivot.position.x, vz = lz - leg.pivot.position.z;
      const hd = Math.hypot(vx, vz) || 1e-4;
      const D = Math.min(Math.hypot(hd, footY), (L1 + L2) * 0.999);
      // ley de cosenos: ángulo interior en el pivote
      const cosA = Math.max(-1, Math.min(1, (L1*L1 + D*D - L2*L2) / (2 * L1 * D)));
      const A = Math.acos(cosA);
      // ángulo de la línea pivote→pie respecto a la horizontal
      const planar = Math.atan2(-footY, hd); // positivo = pie por debajo
      // femur: apunta ARRIBA del vector pivote→pie por A (rodilla arriba)
      const femurAngle = planar - A;
      // tibia: ángulo interior en la rodilla (relativo a la dirección del femur)
      const cosB = Math.max(-1, Math.min(1, (L1*L1 + L2*L2 - D*D) / (2 * L1 * L2)));
      const kneeBend = Math.PI - Math.acos(cosB);
      // eje de rotación: perpendicular al plano pivote→pie, horizontal
      // (para side=-1 el pivot ya tiene rotation.y=π y el eje se refleja solo)
      const ax = vz / hd, az = -vx / hd;
      // quaternion de rotación alrededor de (ax, 0, az) por ángulo θ:
      // q = [sin(θ/2)*ax, sin(θ/2)*0, sin(θ/2)*az, cos(θ/2)]
      setAxisAngle(leg.femurPivot, ax, az, femurAngle);
      setAxisAngle(leg.tibiaPivot, ax, az, -kneeBend);
    }
  }

  // setea .quaternion directo: axis-angle horizontal (x,z) — sin Vector3 nativo
  function setAxisAngle(node, ax, az, angle) {
    const h = Math.sin(angle / 2);
    const q = node.quaternion;
    if (!q || typeof q.set !== 'function') return;
    q.set(h * ax, 0, h * az, Math.cos(angle / 2));
    if (node.rotation && typeof node.rotation.set === 'function') {
      // sincronizar rotation (por si el juego la usa para render)
      try { node.rotation.setFromQuaternion(q); } catch (_) {}
    }
  }

  // gait walk: una pata se mueve si su diagonal opuesta está apoyada
  function canLegMove(sp, li) {
    const n = sp.legs.length;
    const diag = (li + Math.floor(n / 2)) % n;
    const other = sp.legs[diag];
    if (other.isMoving) return false;
    if (other.timeSinceStop < 0.1) return false;
    return true;
  }

  // ─── limpieza ───
  function disableCullingDeep(root) {
    const walk = (n) => {
      n.frustumCulled = false;
      n.matrixAutoUpdate = true;
      for (const c of n.children || []) walk(c);
    };
    try { walk(root); } catch (_) {}
  }

  function purgeUnderCam() {
    const cam = state.game?.gameScene?.axesHelper?.parent;
    if (!cam) return;
    const walk = (o) => {
      for (const c of [...(o.children || [])]) {
        if (c?.userData?.__mfSpider) { try { o.remove(c); } catch (_) {} continue; }
        walk(c);
      }
    };
    try { walk(cam); } catch (_) {}
  }

  function removeSpider(name) {
    const sp = state.spiders.get(name);
    if (!sp) return false;
    try { sp.root.parent?.remove(sp.root); } catch (_) {}
    state.spiders.delete(name);
    return true;
  }

  function clearAll() {
    for (const name of [...state.spiders.keys()]) removeSpider(name);
  }

  function enable(on) {
    state.enabled = on;
    if (on && !state.raf) { state.lastTick = performance.now(); state.raf = requestAnimationFrame(tick); }
    if (!on) clearAll();
  }

  // ─── API pública ───
  window.MF_SPIDER_BOT = {
    spawn(name, preset, variant, scale) {
      if (!preset) preset = 'boxy';
      if (!name) name = preset + '_' + Math.floor(Math.random() * 1000);
      if (state.spiders.has(name)) return { ok: false, error: 'name in use' };
      if (!window.MF_SPIDER_TORSO?.[preset]) return { ok: false, error: 'unknown preset: ' + preset + ' (flat|boxy|stealth)' };
      const sp = createSpider(name, preset, variant, scale);
      return sp ? { ok: true, name } : { ok: false, error: 'no se pudo construir (¿escena no lista?)' };
    },
    despawn(name) { return removeSpider(name); },
    list() { return [...state.spiders.values()].map(s => ({ name: s.key, preset: s.preset, variant: s.variant })); },
    presets() { return Object.keys(window.MF_SPIDER_TORSO || {}); },
    clear() { clearAll(); },
    enable,
    debug() {
      return {
        enabled: state.enabled,
        ctors: state.ctors ? 'ok' : 'pendiente',
        spiders: state.spiders.size,
      };
    },
  };

  console.log(TAG, ' cargado. Usa window.MF_SPIDER_BOT o /spider');
})();
