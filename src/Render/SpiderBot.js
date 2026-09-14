// MiniFeather — SpiderBot: arañas-robot animadas por el simulador EMBEBIDO
// (SpiderSim.js — port 1:1 de TheCymaera/minecraft-spider dentro de la página)
//
// Arquitectura (fusión: ya NO hay proceso Node ni WebSocket):
//   MF_SPIDER_SIM (física real: FABRIK, gallop, normal force sobre los chunks
//   nativos del juego) ──llamada directa──▶ este módulo (solo render)
//
// Modelo simplificado (optimización de lag, solicitado):
//   - SIN torso: solo se renderizan las patas.
//   - Cada pata = 2 cubos alargados (fémur + tibia) reutilizando la MISMA
//     geometry y material para todas las arañas del mundo.
//   - Los cubos se posicionan, orientan y escalan cada frame desde los joints
//     que calcula el simulador (sin allocs por frame).

(() => {
  'use strict';
  const TAG = '[MiniFeather SpiderBot]';

  // ═══ logging de diagnóstico (nivel 0=off 1=básico 2=detalle 3=verboso) ═══
  // Comparte nivel con SpiderSim vía localStorage['mf:spiderlog'].
  const LOG = (() => {
    let level = 0;
    try { level = parseInt(localStorage.getItem('mf:spiderlog') || '0', 10) || 0; } catch (_) {}
    const t0 = performance.now();
    const ring = [];
    const fmt = (v) => {
      if (typeof v === 'number') return Math.round(v * 100) / 100;
      if (Array.isArray(v)) return v.map(fmt).join(',');
      return v;
    };
    const safeJson = (o) => { try { return JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)); } catch { return String(o); } };
    const write = (lvl, tag, args) => {
      const entry = { t: Math.round(performance.now() - t0), lvl, tag, msg: args.map((a) => (typeof a === 'object' ? safeJson(a) : String(a))).join(' ') };
      ring.push(entry);
      if (ring.length > 300) ring.shift();
      if (level >= lvl) console.log(TAG, `[${entry.t}ms]`, tag, ...args.map(fmt));
    };
    return {
      get level() { return level; },
      setLevel(l) {
        level = (l | 0);
        try { localStorage.setItem('mf:spiderlog', String(level)); } catch (_) {}
        console.log(TAG, 'log level →', level);
        // sincronizar con el sim (mismo storage)
        try { globalThis.MF_SPIDER_SIM?.log?.(level); } catch (_) {}
      },
      refresh() { try { level = parseInt(localStorage.getItem('mf:spiderlog') || '0', 10) || 0; } catch (_) {} },
      i: (...a) => write(1, 'info', a),
      d: (...a) => write(2, 'detail', a),
      v: (...a) => write(3, 'verbose', a),
      dump(n = 30) { return ring.slice(-n); },
    };
  })();

  const state = {
    enabled: false, ctors: null, game: null,
    simConnected: false,
    spiders: new Map(), // name → { root, legs[] }
    pendingSpiders: [], // 'add' recibidos antes de haber escena/ctors
    lastGameScan: 0,
    lastTick: 0, raf: 0,
    lastFrame: null,
    lastAppliedFrameT: -1,
  };

  // ═══ conexión con el simulador embebido (llamada directa, sin ws) ═══
  function simAPI() {
    return globalThis.MF_SPIDER_SIM || null;
  }

  function connectSim() {
    const sim = simAPI();
    if (!sim) { LOG.i('connectSim: MF_SPIDER_SIM no existe aún'); return false; }
    // recibir add/remove/frame del sim
    sim.onMessage(handleSimMessage);
    // estado completo por si las arañas ya existían
    sim.send({ type: 'hello' });
    state.simConnected = true;
    LOG.i('connectSim: conectado al sim embebido');
    return true;
  }

  function handleSimMessage(msg) {
    if (msg.type === 'add') {
      LOG.i('← add:', msg.spider?.name, msg.spider?.preset, { legs: msg.spider?.legs?.length });
      if (!addSimSpider(msg.spider)) {
        LOG.d('add en cola (sin ctors/escena):', msg.spider?.name, { pending: state.pendingSpiders.length + 1 });
        state.pendingSpiders.push(msg.spider);
      }
    } else if (msg.type === 'remove') {
      LOG.i('← remove:', msg.name);
      removeSpider(msg.name);
      state.pendingSpiders = state.pendingSpiders.filter((s) => s.name !== msg.name);
    } else if (msg.type === 'frame') {
      state.lastFrame = msg;
      LOG.v('← frame t=' + msg.t, msg.poses?.length + ' poses');
    } else if (msg.type === 'hunt') {
      // mordisco de la IA de caza → mensaje en el chat del juego
      LOG.i('← hunt:', msg.event, msg.name, { bites: msg.bites, at: msg.at });
      if (msg.event === 'bite') {
        try {
          state.game?.chat?.addChat?.({
            text: `\\red\\🕷 ${msg.name} te mordió! (mordida #${msg.bites})`,
          });
        } catch (_) {}
      }
    }
  }

  // ═══ infra (patrones TinyTakeover/WaterSplash) ═══
  // resolución robusta del singleton del juego: la ruta React (#react fiber)
  // solo funciona si el árbol está montado, y globalThis.miniblox solo lo
  // setea LocalGames. En mundos normales (servidores reales) hacemos dynamic
  // import del módulo principal — misma técnica que LocalGames.resolveGameSingleton.
  let moduleGameResolvePromise = null;

  function findGame(force = false) {
    const now = performance.now();
    if (!force && state.game?.player && state.game?.world && now - state.lastGameScan < 1200) return state.game;
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
    // async: resolver vía import del módulo principal (no bloquea el tick)
    resolveGameFromModule();
    return state.game?.player && state.game?.world ? state.game : null;
  }

  function looksLikeGameSingleton(value) {
    return !!(
      value &&
      typeof value === 'object' &&
      typeof value.boot === 'function' &&
      typeof value.queue === 'function' &&
      typeof value.connect === 'function' &&
      typeof value.inGame === 'function' &&
      value.info &&
      value.serverInfo
    );
  }

  async function resolveGameFromModule() {
    if (moduleGameResolvePromise) return moduleGameResolvePromise;
    moduleGameResolvePromise = (async () => {
      const urls = [];
      const add = (url) => {
        if (!url || typeof url !== 'string') return;
        if (!url.includes('/assets/index-') || !url.endsWith('.js')) return;
        if (!urls.includes(url)) urls.push(url);
      };
      try {
        for (const s of document.querySelectorAll('script[type="module"][src]')) add(s.src);
      } catch (_) {}
      try {
        for (const e of performance.getEntriesByType('resource')) add(e?.name);
      } catch (_) {}
      for (const url of urls) {
        try {
          const mod = await import(url);
          if (!mod || typeof mod !== 'object') continue;
          for (const value of Object.values(mod)) {
            if (looksLikeGameSingleton(value) && value.player && value.world) {
              state.game = value;
              globalThis.miniblox = value;
              globalThis.__MINIBLOX_GAME__ = value;
              return value;
            }
          }
        } catch (_) {}
      }
      return null;
    })();
    moduleGameResolvePromise.finally(() => { moduleGameResolvePromise = null; });
    return moduleGameResolvePromise;
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
    state.refMaterial = material;
    state.ctors = { Geometry, Attr, Mesh: MeshCtor, Material: MaterialCtor, Group: GroupCtor };
    if (!state.ctorsLogged) {
      state.ctorsLogged = true;
      console.log(TAG, 'constructores', Geometry?.name, MeshCtor?.name, GroupCtor?.name);
    }
    return true;
  }

  // ═══ geometría ═══
  function cubeGeometry(ctors) {
    // Cubo unitario CENTRADO en (0,0,0) — vértices de -0.5 a +0.5.
    // applyPose coloca el mesh en el punto medio del segmento y escala
    // (grosor, grosor, longitud): si el cubo no está centrado, cada mesh
    // queda desplazado media longitud y las patas se ven con huecos.
    const P = [
      -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,0.5,0.5,  -0.5,-0.5,0.5, 0.5,0.5,0.5, -0.5,0.5,0.5,
      0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5,0.5,-0.5,  0.5,-0.5,-0.5, -0.5,0.5,-0.5, 0.5,0.5,-0.5,
      0.5,-0.5,0.5, 0.5,-0.5,-0.5, 0.5,0.5,-0.5,  0.5,-0.5,0.5, 0.5,0.5,-0.5, 0.5,0.5,0.5,
      -0.5,-0.5,-0.5, -0.5,-0.5,0.5, -0.5,0.5,0.5,  -0.5,-0.5,-0.5, -0.5,0.5,0.5, -0.5,0.5,-0.5,
      -0.5,0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,-0.5,  -0.5,0.5,0.5, 0.5,0.5,-0.5, -0.5,0.5,-0.5,
      -0.5,-0.5,-0.5, 0.5,-0.5,-0.5, 0.5,-0.5,0.5,  -0.5,-0.5,-0.5, 0.5,-0.5,0.5, -0.5,-0.5,0.5,
    ];
    const UV = [];
    for (let f = 0; f < 6; f++) {
      for (let t = 0; t < 2; t++) {
        UV.push(0, 0,  1, 0,  1, 1,  0, 0,  1, 1,  0, 1);
      }
    }
    const geo = new ctors.Geometry();
    geo.setAttribute('position', new ctors.Attr(new Float32Array(P), 3));
    geo.setAttribute('uv', new ctors.Attr(new Float32Array(UV), 2));
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

  // Punta de la pata: pirámide con base cuadrada (z=-0.5, half-extent 0.5)
  // que se afila hasta un vértice en z=+0.5. Se escala igual que el cubo
  // (grosor, grosor, longitud) → el ápice cae exactamente en el end effector
  // (el punto donde la física apoya la pata en el suelo).
  function tipGeometry(ctors) {
    const A = [-0.5,-0.5,-0.5], B = [0.5,-0.5,-0.5], C = [0.5,0.5,-0.5], D = [-0.5,0.5,-0.5];
    const T = [0,0,0.5];
    const P = [].concat(
      A, B, T,   // cara inferior
      D, T, C,   // cara superior
      B, C, T,   // cara +X
      A, T, D,   // cara -X
      A, D, C,   // base (z-) triángulo 1
      A, C, B    // base (z-) triángulo 2
    );
    const UV = [];
    for (let f = 0; f < 6; f++) UV.push(0, 0, 1, 0, 1, 1);
    const geo = new ctors.Geometry();
    geo.setAttribute('position', new ctors.Attr(new Float32Array(P), 3));
    geo.setAttribute('uv', new ctors.Attr(new Float32Array(UV), 2));
    const N = new Float32Array(P.length);
    recomputeFlatNormals(N, P);
    geo.setAttribute('normal', new ctors.Attr(N, 3));
    return geo;
  }

  // ═══ geometría/material compartidos (todos los cubos de patas lo reusan) ═══
  // Esto reduce drásticamente las allocs/estado por araña: 1 geometry + 1 material
  // para todas las patas de todas las arañas. El mesh solo guarda position/quat/scale.
  let _sharedLegGeo = null;
  let _sharedTipGeo = null;
  let _sharedLegMat = null;
  function ensureSharedLegAssets(ctors) {
    if (!_sharedLegGeo) {
      // cubo unitario centrado (1×1×1) — la escala real se aplica con mesh.scale en applyPose
      _sharedLegGeo = cubeGeometry(ctors);
      // punta afilada para el último segmento de cada pata
      _sharedTipGeo = tipGeometry(ctors);
    }
    if (!_sharedLegMat) {
      // Material FRESCO (patrón TinyTakeover.makeMaterial): no clonamos el
      // material de referencia — el clon hereda wrappers de CustomShader
      // (onBeforeCompile/customProgramCacheKey con closures rotas) y el
      // resultado es un shader que no dibuja color: solo bloquea la vista
      // ("sombras sin cuerpo"). new constructor() parte de cero.
      let mat = null;
      try { mat = new state.refMaterial.constructor(); } catch (_) {
        try { mat = state.refMaterial.clone(); } catch (_2) {}
      }
      if (!mat) {
        console.error(TAG, 'FATAL: no se pudo crear material para patas de araña');
        _sharedLegMat = null;
        return { geo: _sharedLegGeo, tipGeo: _sharedTipGeo, mat: null };
      }
      try {
        // sin texturas: solo color plano
        mat.map = null;
        mat.alphaMap = null; mat.aoMap = null; mat.lightMap = null;
        mat.normalMap = null; mat.bumpMap = null; mat.displacementMap = null;
        mat.emissiveMap = null; mat.metalnessMap = null; mat.roughnessMap = null;
        mat.vertexColors = false;
        mat.transparent = false;
        mat.alphaTest = 0;
        mat.side = 2; // DoubleSide
        mat.fog = true;
        mat.toneMapped = state.refMaterial.toneMapped !== false;
        if ('roughness' in mat) mat.roughness = 1;
        if ('metalness' in mat) mat.metalness = 0;
        mat.color?.set?.(0x6b3a14);
        mat.emissive?.set?.(0x000000);
        // neutralizar cualquier hook de shader: shader plano del juego
        mat.onBeforeCompile = function () {};
        mat.customProgramCacheKey = () => 'mf-spider-leg-v2';
        // Marca para que CustomShader no hookee este material compartido
        mat.__mfSkipHook = true;
        mat.needsUpdate = true;
      } catch (_) {}
      _sharedLegMat = mat;
    }
    return { geo: _sharedLegGeo, tipGeo: _sharedTipGeo, mat: _sharedLegMat };
  }

  // grosor por segmento de la pata: LARGAS y DELGADAS en todos los presets.
  // Decrece hacia el extremo (fémur más grueso que la tibia). Los grosores
  // se compensan con la longitud extendida (LEG_STYLE.length=1.6 en el sim)
  // para que sigan visibles a distancia sin parecer troncos.
  function legThickness(si) { return Math.max(0.07, 0.16 - si * 0.045); }

  // ═══ construir spider desde el mensaje 'add' del simulador ═══
  // OPTIMIZACIÓN: solo patas (sin torso). Cada pata = 2 cubos alargados
  // (fémur + tibia) reutilizando la MISMA geometry y material para todas
  // las arañas. Antes: torso ~30 meshes + 4 segmentos × 3-7 meshes/pata =
  // hasta ~80 meshes/araña. Ahora: 2 meshes × N patas = 8-16 meshes/araña.
  function addSimSpider(info) {
    if (state.spiders.has(info.name)) return true; // ya está (evita duplicar)
    if (!ensureCtors()) { LOG.d('addSimSpider: sin ctors →', info.name); return false; }
    const ctors = state.ctors;
    const scene = getScene(state.game);
    if (!scene) { LOG.d('addSimSpider: sin escena 3D →', info.name); return false; }

    const { geo: sharedGeo, tipGeo: sharedTipGeo, mat: sharedMat } = ensureSharedLegAssets(ctors);

    const root = new ctors.Group();
    root.userData.__mfSpider = true;
    root.name = 'MiniFeatherSpider_' + info.name;

    // SIN torso: solo las patas — como arañas reales.
    // patas: 2 cubos alargados por pata (fémur + tibia), posicionados y
    // orientados cada frame en applyPose a partir de los joints del sim.
    const legs = [];
    for (const legInfo of info.legs) {
      const legGroup = new ctors.Group();
      legGroup.userData.__mfSpider = true;
      const segments = [];
      // Se renderizan TODOS los segmentos de la cadena cinemática.
      // Antes solo se dibujaban 2: el sim simulaba 4 y la mitad inferior
      // de cada pata (la que toca el suelo) quedaba invisible → araña mocha.
      const renderCount = legInfo.segments.length;
      for (let si = 0; si < renderCount; si++) {
        // el último segmento usa geometría de punta (pirámide afilada);
        // el resto, cubo centrado
        const isTip = si === renderCount - 1;
        const mesh = new ctors.Mesh(isTip ? sharedTipGeo : sharedGeo, sharedMat);
        mesh.userData.__mfSpider = true;
        mesh.frustumCulled = false; // cubos pequeños: ahorra tests de frustum
        legGroup.add(mesh);
        segments.push({ mesh, thickness: legThickness(si), index: si, isTip });
      }
      legGroup.name = 'leg_' + legs.length;
      root.add(legGroup);
      legs.push({ group: legGroup, segments, attachment: legInfo.attachment, segLengths: legInfo.segments });
    }

    disableCullingDeep(root);
    scene.add(root);
    purgeUnderCam();

    state.spiders.set(info.name, {
      key: info.name, preset: info.preset, gallop: info.gallop,
      root, bodyGroup: null, legs,
      lastPose: null,
    });
    LOG.i('araña construida:', info.name, info.preset, {
      legs: legs.length, segmentsPorPata: legs[0]?.segments.length ?? 0,
      grosor: legs[0]?.segments.map(s => s.thickness) ?? [],
      color: '#' + (_sharedLegMat?.color?.getHexString?.() ?? '?'),
      skipHook: !!_sharedLegMat?.__mfSkipHook,
      enEscena: !!(root.parent),
    });
    return true;
  }

  // ═══ aplicar frame ═══
  // OPTIMIZACIÓN: cada cubo se coloca en el punto medio del segmento,
  // se escala (grosor × grosor × longitud) y se orienta con setQuatLookAtZ
  // (sin allocs por frame). Sin segGroup intermedio, sin rotación acumulada
  // del sim (no la necesitamos: la geometría del cubo es uniforme).
  function setQuatLookAtZ(node, fx, fy, fz) {
    const q = node.quaternion;
    if (!q || typeof q.set !== 'function') return;
    const dot = fz; // (0,0,1)·f
    if (dot > 0.99999) { q.set(0, 0, 0, 1); }
    else if (dot < -0.99999) {
      q.set(1, 0, 0, 0); // 180° sobre X
    } else {
      let ax = -fy, ay = fx;
      const al = Math.hypot(ax, ay) || 1;
      ax /= al; ay /= al;
      const w = Math.sqrt((1 + dot) / 2); // cos(θ/2)
      const s = Math.sqrt(1 - w * w);     // sin(θ/2)
      q.set(ax * s, ay * s, 0, w);
    }
    if (node.rotation && typeof node.rotation.setFromQuaternion === 'function') {
      try { node.rotation.setFromQuaternion(q); } catch (_) {}
    }
  }

  // tracking del último tick aplicado: el sim emite a 20 Hz pero el RAF va
  // a 60 Hz → sin este check reaplicaríamos el mismo frame 3 veces por tick.
  function applyFrame(frame) {
    if (!frame || frame.t === state.lastAppliedFrameT) return; // mismo frame → nada
    state.lastAppliedFrameT = frame.t;
    for (const pose of frame.poses) {
      if (!pose?.n) continue;
      const sp = state.spiders.get(pose.n);
      if (sp) applyPose(sp, pose);
    }
  }

  function applyPose(sp, pose) {
    const lx = pose.p[0], ly = pose.p[1], lz = pose.p[2];

    if (!Number.isFinite(lx) || !Number.isFinite(ly) || !Number.isFinite(lz)) {
      LOG.i('ERROR: pose con NaN →', pose.n, pose.p);
      return;
    }

    sp.root.position.set(lx, ly, lz);

    // SIN torso: no hay bodyGroup que actualizar (se renderiza 0 meshes del cuerpo).
    // Cada pata = 2 cubos. Para cada cubo:
    //   1. posición = punto medio entre 'from' y 'to' (coords locales al root)
    //   2. scale   = (grosor, grosor, longitud del segmento)
    //   3. quat    = rotación que alinea +Z con la dirección del segmento
    // El cubo unitario centrado en (0,0,0) se estira así a lo largo del eje.
    for (let li = 0; li < sp.legs.length; li++) {
      const leg = sp.legs[li];
      const legPose = pose.legs[li];
      if (!legPose) continue;
      const joints = legPose.joints;
      const segments = leg.segments;
      const segCount = segments.length;
      for (let si = 0; si < segCount; si++) {
        const seg = segments[si];
        const from = si === 0 ? legPose.att : joints[si - 1];
        const to = joints[si];
        if (!to) continue;
        const fx = to[0] - from[0], fy = to[1] - from[1], fz = to[2] - from[2];
        const len = Math.hypot(fx, fy, fz);
        const mesh = seg.mesh;
        if (len < 1e-6) {
          // colapsado: esconder el cubo para evitar render artefact
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;
        // punto medio, en coords locales al root
        mesh.position.set(
          (from[0] + to[0]) * 0.5 - lx,
          (from[1] + to[1]) * 0.5 - ly,
          (from[2] + to[2]) * 0.5 - lz
        );
        mesh.scale.set(seg.thickness, seg.thickness, len);
        setQuatLookAtZ(mesh, fx / len, fy / len, fz / len);
      }
    }
  }

  // ═══ limpieza ═══
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

  // ═══ tick ═══
  function tick() {
    if (!state.enabled) { state.raf = requestAnimationFrame(tick); return; }
    try {
      const game = state.game || findGame();
      if (game) state.game = game;
      const sim = simAPI();
      if (sim) {
        // reconectar si el sim apareció tarde (carga de scripts en desorden)
        if (!state.simConnected) connectSim();
        // reportar posición del jugador al sim cada 500ms (spawns + anclaje)
        reportPlayer(game, sim);
        // arañas iniciales del garden: cuando sepamos dónde está el jugador
        sim.refreshGame();
        sim.ensureInitialSpiders();
      }
      // arañas que llegaron antes de haber escena 3D lista
      if (state.pendingSpiders.length) {
        const retry = state.pendingSpiders.splice(0);
        for (const info of retry) if (!addSimSpider(info)) state.pendingSpiders.push(info);
      }
      if (state.lastFrame) applyFrame(state.lastFrame);
      // cambio de mundo: la escena nueva no contiene las raíces → re-agregar
      if (state.spiders.size) {
        const scene = getScene(state.game);
        if (scene) {
          for (const sp of state.spiders.values()) {
            if (sp.root.parent !== scene) {
              try { scene.add(sp.root); LOG.i('re-anclada a la escena nueva:', sp.key); } catch (_) {}
            }
          }
        }
      }
      // CRÍTICO: el juego congela el matrixWorld — sin update manual nada se anima
      for (const sp of state.spiders.values()) {
        try {
          sp.root.updateMatrix();
          sp.root.updateMatrixWorld(true);
        } catch (_) {}
      }

      if (!state.lastDiag || performance.now() - state.lastDiag > 2500) {
        state.lastDiag = performance.now();
        let totSegs = 0, visSegs = 0;
        for (const sp of state.spiders.values()) {
          for (const leg of sp.legs) for (const seg of leg.segments) {
            totSegs++;
            if (seg.mesh.visible) visSegs++;
          }
        }
        if (state.spiders.size && (visSegs === 0 || (LOG.level >= 1 && !state._diagLogged))) {
          state._diagLogged = true;
          console.log(TAG, 'DIAG visibilidad patas:', visSegs + '/' + totSegs,
            'arañas=' + state.spiders.size,
            'ctors=' + (state.ctors ? 'ok' : 'pendiente'),
            'materialColor=' + (state.ctors ? (() => { try { return '#' + (_sharedLegMat?.color?.getHexString?.() ?? '?'); } catch (_) { return '?'; } })() : '?'),
            'sharedGeo=' + (!!_sharedLegGeo),
            'sharedMat=' + (!!_sharedLegMat),
            'skipHook=' + (_sharedLegMat?.__mfSkipHook ? 'sí' : 'no'));
        }
      }

      // foto de render cada 5s (nivel ≥2): pos de mesh, distancia a cámara, on-screen
      // OPTIMIZACIÓN: el bloque completo está envuelto en LOG.level >= 2 para
      // evitar ejecutar cálculos costosos (updateWorldMatrix, project, etc.)
      // cuando el log está apagado (caso normal).
      const now = performance.now();
      if (LOG.level >= 2 && now - (state.lastRenderSnapshot || 0) > 5000 && state.spiders.size) {
        state.lastRenderSnapshot = now;
        const gs = game?.gameScene;
        const cam = gs?.camera;
        for (const sp of state.spiders.values()) {
          const snap = { meshPos: [sp.root.position.x, sp.root.position.y, sp.root.position.z], enEscena: !!sp.root.parent, visible: sp.root.visible };
          try {
            if (cam) {
              sp.root.updateWorldMatrix(true, false);
              const v = sp.root.getWorldPosition(new state.ctors.Group().position.constructor());
              const camWorld = cam.getWorldPosition(v.constructor === Object ? v : v.clone());
              snap.camDist = Math.round(v.distanceTo(camWorld) * 10) / 10;
              const p = v.clone().project(cam);
              snap.onScreen = Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1;
              // DIAG patas: nº segments, worldPos del primer mesh
              if (sp.legs[0]?.segments[0]?.mesh) {
                const leg0 = sp.legs[0].segments[0].mesh;
                leg0.updateWorldMatrix(true, false);
                const w = leg0.getWorldPosition(v.constructor === Object ? v : v.clone());
                snap.leg0MeshPos = [Math.round(w.x*100)/100, Math.round(w.y*100)/100, Math.round(w.z*100)/100];
                snap.leg0Scale = [leg0.scale.x.toFixed(3), leg0.scale.y.toFixed(3), leg0.scale.z.toFixed(3)];
                snap.leg0Visible = leg0.visible;
              }
              snap.materialColor = state.ctors ? (() => { try { return '#' + (_sharedLegMat?.color?.getHexString?.() ?? '?'); } catch (_) { return '?'; } })() : '?';
            }
          } catch (_) {}
          LOG.d('render:', sp.key, snap);
        }
        LOG.d('frame t=' + (state.lastFrame?.t ?? '—'), 'spiders=' + state.spiders.size, 'pending=' + state.pendingSpiders.length, 'fps=' + Math.round(1000 / Math.max(1, now - (state.lastFrameAppliedAt || now - 16))));
      }
      if (state.lastFrame) state.lastFrameAppliedAt = now;
    } catch (e) {
      console.warn(TAG, 'tick error (recuperado)', e);
      LOG.i('ERROR tick:', e?.message || e);
    }
    state.raf = requestAnimationFrame(tick);
  }

  let lastPlayerReportAt = 0;
  function reportPlayer(game, sim) {
    const now = performance.now();
    if (now - lastPlayerReportAt < 500) return;
    const player = game?.player || state.game?.player;
    const pos = player?.pos;
    if (!pos || !Number.isFinite(Number(pos.x))) return;
    lastPlayerReportAt = now;
    sim.reportPlayer(Number(pos.x), Number(pos.y), Number(pos.z), Number(player.yaw) || 0);
  }

  function enable(on) {
    state.enabled = on;
    if (on) {
      if (!state.raf) { state.lastTick = performance.now(); state.raf = requestAnimationFrame(tick); }
      if (!connectSim()) console.warn(TAG, 'MF_SPIDER_SIM no disponible (¿SpiderSim.js cargó?)');
    } else {
      clearAll();
    }
  }

  // ═══ API pública ═══
  window.MF_SPIDER_BOT = {
    connect() {
      enable(true);
      return { ok: true, embedded: !!simAPI() };
    },
    send(obj) {
      const sim = simAPI();
      if (!sim) return { ok: false, error: 'SpiderSim not loaded' };
      return sim.send(obj);
    },
    // láser: mover la araña más cercana al punto mirado
    target(x, y, z) { return this.send({ type: 'target', x, y, z }); },
    staystill() { return this.send({ type: 'staystill' }); },
    list() {
      const sim = simAPI();
      const seen = new Set([...state.spiders.keys(), ...state.pendingSpiders.map((s) => s.name)]);
      return [...seen].map((name) => {
        const s = state.spiders.get(name);
        if (s) return { name: s.key, preset: s.preset, gallop: s.gallop };
        const p = state.pendingSpiders.find((x) => x.name === name);
        return { name, preset: p?.preset, gallop: p?.gallop, pending: true };
      }).map((entry) => {
        // añadir pos vivo del sim
        const live = sim?.list?.().find((l) => l.name === entry.name);
        return live ? { ...entry, pos: live.pos, grounded: live.grounded } : entry;
      });
    },
    clear() {
      clearAll();
      const sim = simAPI();
      sim?.clear?.();
    },
    enable,
    debug() {
      const sim = simAPI();
      const d = sim?.debug?.() || {};
      return {
        enabled: state.enabled,
        sim: d.running ? 'running' : 'stopped',
        tick: d.tick ?? null,
        tickMs: d.tickMs ?? null,
        ctors: state.ctors ? 'ok' : 'pendiente',
        spiders: state.spiders.size,
        pending: state.pendingSpiders.length,
        lastFrameT: state.lastFrame?.t ?? null,
        hasGame: d.hasGame ?? false,
        player: d.player ?? null,
        logLevel: LOG.level,
      };
    },
    // nivel: 0=off 1=info 2=detalle 3=verboso
    log(level) {
      if (level === undefined || level === null) return LOG.level;
      LOG.setLevel(level);
      return LOG.level;
    },
    // volcado de logs (ring buffer) — útil sin abrir la consola
    logs(n = 25) {
      const botLogs = LOG.dump(n);
      const simLogs = simAPI()?.logs?.(n) || [];
      return { bot: botLogs, sim: simLogs };
    },
  };

  console.log(TAG, 'cargado (simulador EMBEBIDO — sin Node/ws). Usa window.MF_SPIDER_BOT o /spider');

  // auto-arranque: renderizar las arañas del simulador sin comandos.
  enable(true);
})();
