
(() => {
  'use strict';
  const TAG = '[MiniFeather SpiderBot]';

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
    spiders: new Map(), 
    pendingSpiders: [], 
    lastGameScan: 0,
    lastTick: 0, raf: 0,
    lastFrame: null,
    lastAppliedFrameT: -1,
    
    remoteFrame: null, 
    lastAppliedRemoteT: -1,
    remoteNames: new Set(), 
    frameSendCount: 0, 
  };

  function simAPI() {
    return globalThis.MF_SPIDER_SIM || null;
  }

  function connectSim() {
    const sim = simAPI();
    if (!sim) { LOG.i('connectSim: MF_SPIDER_SIM no existe aún'); return false; }
    
    sim.onMessage(handleSimMessage);
    
    sim.send({ type: 'hello' });
    state.simConnected = true;
    LOG.i('connectSim: conectado al sim embebido');
    return true;
  }

  function handleSimMessage(msg) {
    forwardToPeer(msg);
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
      
      LOG.i('← hunt:', msg.event, msg.name, { bites: msg.bites, at: msg.at });
      if (msg.event === 'bite') {
        try {
          state.game?.chat?.addChat?.({
            text: `\\red\\🕷 ${msg.name} te mordió! (mordida #${msg.bites})`,
          });
        } catch (_) {}
      }
    } else if (msg.type === 'evo') {
      
      LOG.i('← evo:', msg.event, msg.name ?? '');
      try {
        if (msg.event === 'bite') {
          state.game?.chat?.addChat?.({
            text: `\\red\\🕷 ${msg.name} te mordió! (E=${msg.energy})`,
          });
        } else if (msg.event === 'death') {
          state.game?.chat?.addChat?.({
            text: `\\gray\\💀 ${msg.name} murió de hambre (gen ${msg.gen}, fitness ${msg.fitness})`,
          });
        } else if (msg.event === 'birth') {
          state.game?.chat?.addChat?.({
            text: `\\green\\🐣 nació ${msg.name} (gen ${msg.gen}, hijo de ${msg.parent})`,
          });
        }
        
      } catch (_) {}
    }
  }

  function forwardToPeer(msg) {
    const peer = globalThis.MF_Peer;
    if (!peer || typeof peer.sendStudio !== 'function') return;
    if (msg.type === 'frame') {
      if ((state.frameSendCount++ & 1) !== 0) return; 
      peer.sendStudio({ t: 'spider', m: { type: 'frame', t: msg.t, poses: compressPoses(msg.poses) } });
    } else if (msg.type === 'add' || msg.type === 'remove') {
      peer.sendStudio({ t: 'spider', m: msg });
    }
  }

  function compressPoses(poses) {
    if (!Array.isArray(poses)) return poses;
    const r2 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : v);
    return poses.map((p) => ({
      n: p.n,
      p: p.p?.map(r2),
      legs: p.legs?.map((l) => ({
        att: l.att?.map(r2),
        joints: l.joints?.map((j) => j?.map(r2)),
      })),
    }));
  }

  function remoteApply(m) {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'add') {
      if (!m.spider?.name) return;
      state.remoteNames.add(m.spider.name);
      if (!addSimSpider(m.spider)) state.pendingSpiders.push(m.spider);
      LOG.i('p2p ← add:', m.spider.name, m.spider.preset);
    } else if (m.type === 'remove') {
      state.remoteNames.delete(m.name);
      removeSpider(m.name);
      state.pendingSpiders = state.pendingSpiders.filter((s) => s.name !== m.name);
    } else if (m.type === 'frame') {
      state.remoteFrame = m;
    } else if (m.type === 'clear') {
      for (const name of [...state.remoteNames]) removeSpider(name);
      state.remoteNames.clear();
      state.remoteFrame = null;
      state.lastAppliedRemoteT = -1;
      LOG.i('p2p ← clear (arañas del peer fuera)');
    }
  }

  function onPeerConnected() {
    try { simAPI()?.send?.({ type: 'hello' }); } catch (_) {}
  }

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

  function cubeGeometry(ctors) {
    
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

  function tipGeometry(ctors) {
    const A = [-0.5,-0.5,-0.5], B = [0.5,-0.5,-0.5], C = [0.5,0.5,-0.5], D = [-0.5,0.5,-0.5];
    const T = [0,0,0.5];
    const P = [].concat(
      A, B, T,   
      D, T, C,   
      B, C, T,   
      A, T, D,   
      A, D, C,   
      A, C, B    
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

  let _sharedLegGeo = null;
  let _sharedTipGeo = null;
  let _sharedLegMat = null;
  let _sharedTorsoGeo = null;

  function torsoGeometry(ctors) {
    const cubo = (cx, cy, cz, sx, sy, sz, out) => {
      const hx = sx / 2, hy = sy / 2, hz = sz / 2;
      
      const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
      out.push(
        x0,y0,z1, x1,y0,z1, x1,y1,z1,  x0,y0,z1, x1,y1,z1, x0,y1,z1,   
        x1,y0,z0, x0,y0,z0, x0,y1,z0,  x1,y0,z0, x0,y1,z0, x1,y1,z0,   
        x1,y0,z1, x1,y0,z0, x1,y1,z0,  x1,y0,z1, x1,y1,z0, x1,y1,z1,   
        x0,y0,z0, x0,y0,z1, x0,y1,z1,  x0,y0,z0, x0,y1,z1, x0,y1,z0,   
        x0,y1,z1, x1,y1,z1, x1,y1,z0,  x0,y1,z1, x1,y1,z0, x0,y1,z0,   
        x0,y0,z0, x1,y0,z0, x1,y0,z1,  x0,y0,z0, x1,y0,z1, x0,y0,z1    
      );
    };
    const P = [];
    cubo(0, 0.02, 0.1, 1.0, 0.55, 0.9, P);    
    cubo(0, 0.05, -0.55, 0.8, 0.5, 0.75, P);  
    const UV = [];
    for (let f = 0; f < 12; f++) UV.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    const geo = new ctors.Geometry();
    geo.setAttribute('position', new ctors.Attr(new Float32Array(P), 3));
    geo.setAttribute('uv', new ctors.Attr(new Float32Array(UV), 2));
    const N = new Float32Array(P.length);
    recomputeFlatNormals(N, P);
    geo.setAttribute('normal', new ctors.Attr(N, 3));
    return geo;
  }

  function ensureSharedLegAssets(ctors) {
    if (!_sharedLegGeo) {
      
      _sharedLegGeo = cubeGeometry(ctors);
      
      _sharedTipGeo = tipGeometry(ctors);
    }
    if (!_sharedLegMat) {
      
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
        
        mat.map = null;
        mat.alphaMap = null; mat.aoMap = null; mat.lightMap = null;
        mat.normalMap = null; mat.bumpMap = null; mat.displacementMap = null;
        mat.emissiveMap = null; mat.metalnessMap = null; mat.roughnessMap = null;
        mat.vertexColors = false;
        mat.transparent = false;
        mat.alphaTest = 0;
        mat.side = 2; 
        mat.fog = true;
        mat.toneMapped = state.refMaterial.toneMapped !== false;
        if ('roughness' in mat) mat.roughness = 1;
        if ('metalness' in mat) mat.metalness = 0;
        mat.color?.set?.(0x6b3a14);
        mat.emissive?.set?.(0x000000);
        
        mat.onBeforeCompile = function () {};
        mat.customProgramCacheKey = () => 'mf-spider-leg-v2';
        
        mat.__mfSkipHook = true;
        mat.needsUpdate = true;
      } catch (_) {}
      _sharedLegMat = mat;
    }
    return { geo: _sharedLegGeo, tipGeo: _sharedTipGeo, mat: _sharedLegMat };
  }

  function legThickness(si) { return Math.max(0.07, 0.16 - si * 0.045); }

  function estimateTorsoScale(legs) {
    const segs = legs?.[0]?.segments;
    if (!Array.isArray(segs) || !segs.length) return 1;
    const total = segs.reduce((a, s) => a + (Number.isFinite(s) ? s : 0), 0);
    if (!Number.isFinite(total) || total <= 0) return 1;
    return Math.min(80, Math.max(0.4, total / 2.2));
  }

  function addSimSpider(info) {
    if (state.spiders.has(info.name)) return true; 
    if (!ensureCtors()) { LOG.d('addSimSpider: sin ctors →', info.name); return false; }
    const ctors = state.ctors;
    const scene = getScene(state.game);
    if (!scene) { LOG.d('addSimSpider: sin escena 3D →', info.name); return false; }

    const { geo: sharedGeo, tipGeo: sharedTipGeo, mat: sharedMat } = ensureSharedLegAssets(ctors);
    if (!_sharedTorsoGeo) _sharedTorsoGeo = torsoGeometry(ctors);

    const root = new ctors.Group();
    root.userData.__mfSpider = true;
    root.name = 'MiniFeatherSpider_' + info.name;

    const torsoScale = estimateTorsoScale(info.legs);
    const torsoMesh = new ctors.Mesh(_sharedTorsoGeo, sharedMat);
    torsoMesh.userData.__mfSpider = true;
    torsoMesh.frustumCulled = false;
    root.add(torsoMesh);

    const legs = [];
    for (const legInfo of info.legs) {
      const legGroup = new ctors.Group();
      legGroup.userData.__mfSpider = true;
      const segments = [];
      
      const renderCount = legInfo.segments.length;
      for (let si = 0; si < renderCount; si++) {
        
        const isTip = si === renderCount - 1;
        const mesh = new ctors.Mesh(isTip ? sharedTipGeo : sharedGeo, sharedMat);
        mesh.userData.__mfSpider = true;
        mesh.frustumCulled = false; 
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
      root, torsoMesh, torsoScale, legs,
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

  function setQuatLookAtZ(node, fx, fy, fz) {
    const q = node.quaternion;
    if (!q || typeof q.set !== 'function') return;
    const dot = fz; 
    if (dot > 0.99999) { q.set(0, 0, 0, 1); }
    else if (dot < -0.99999) {
      q.set(1, 0, 0, 0); 
    } else {
      let ax = -fy, ay = fx;
      const al = Math.hypot(ax, ay) || 1;
      ax /= al; ay /= al;
      const w = Math.sqrt((1 + dot) / 2); 
      const s = Math.sqrt(1 - w * w);     
      q.set(ax * s, ay * s, 0, w);
    }
    if (node.rotation && typeof node.rotation.setFromQuaternion === 'function') {
      try { node.rotation.setFromQuaternion(q); } catch (_) {}
    }
  }

  function applyFrame(frame, dedupKey = 'lastAppliedFrameT') {
    if (!frame || frame.t === state[dedupKey]) return; 
    state[dedupKey] = frame.t;
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

    if (sp.torsoMesh && pose.torso?.m) {
      sp.torsoMesh.matrix.fromArray(pose.torso.m);
      sp.torsoMesh.matrix.decompose(
        sp.torsoMesh.position, sp.torsoMesh.quaternion, sp.torsoMesh.scale
      );
      sp.torsoMesh.scale.multiplyScalar(sp.torsoScale || 1);
      sp.torsoMesh.visible = true;
    } else if (sp.torsoMesh) {
      sp.torsoMesh.visible = false;
    }

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
          
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;
        
        mesh.position.set(
          (from[0] + to[0]) * 0.5 - lx,
          (from[1] + to[1]) * 0.5 - ly,
          (from[2] + to[2]) * 0.5 - lz
        );
        
        const restLen = leg.segLengths?.[si] || len;
        const sizeF = Math.min(80, Math.max(1, restLen / 1.8));
        const th = seg.thickness * sizeF;
        mesh.scale.set(th, th, len);
        setQuatLookAtZ(mesh, fx / len, fy / len, fz / len);
      }
    }
  }

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

  function tick() {
    if (!state.enabled) { state.raf = requestAnimationFrame(tick); return; }
    try {
      const game = state.game || findGame();
      if (game) state.game = game;
      const sim = simAPI();
      if (sim) {
        
        if (!state.simConnected) connectSim();
        
        reportPlayer(game, sim);
        
        sim.refreshGame();
        sim.ensureInitialSpiders();
      }
      
      if (state.pendingSpiders.length) {
        const retry = state.pendingSpiders.splice(0);
        for (const info of retry) if (!addSimSpider(info)) state.pendingSpiders.push(info);
      }
      if (state.lastFrame) applyFrame(state.lastFrame);
      if (state.remoteFrame) applyFrame(state.remoteFrame, 'lastAppliedRemoteT');
      
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

  window.MF_SPIDER_BOT = {
    
    dispose() {
      state.enabled = false;
      try { clearAll(); } catch (_) {}
      try { cancelAnimationFrame(state.raf); } catch (_) {}
      state.raf = 0;
    },
    connect() {
      enable(true);
      return { ok: true, embedded: !!simAPI() };
    },
    send(obj) {
      const sim = simAPI();
      if (!sim) return { ok: false, error: 'SpiderSim not loaded' };
      return sim.send(obj);
    },
    
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
        
        const live = sim?.list?.().find((l) => l.name === entry.name);
        return live ? { ...entry, pos: live.pos, grounded: live.grounded } : entry;
      });
    },
    clear() {
      clearAll();
      const sim = simAPI();
      sim?.clear?.();
    },
    
    remoteApply,
    onPeerConnected,
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
    
    log(level) {
      if (level === undefined || level === null) return LOG.level;
      LOG.setLevel(level);
      return LOG.level;
    },
    
    logs(n = 25) {
      const botLogs = LOG.dump(n);
      const simLogs = simAPI()?.logs?.(n) || [];
      return { bot: botLogs, sim: simLogs };
    },
  };

  console.log(TAG, 'cargado (simulador EMBEBIDO — sin Node/ws). Usa window.MF_SPIDER_BOT o /spider');

  enable(true);
})();
