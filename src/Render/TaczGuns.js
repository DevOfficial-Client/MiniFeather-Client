(function () {
  'use strict';

  const GLOBAL_KEY = '__MINIFEATHER_TACZ_GUNS__';
  const CONFIG_EVENT = 'minifeather:taczguns-config';
  const TAG = '[minifeather tacz]';
  const S = 1 / 16;

  const GUN_MAP = {
    'guns:ak47': 'ak47',
    'guns:m4': 'm4',
    'guns:awp': 'awp',
    'guns:desert_eagle': 'desert_eagle',
    'guns:xm1014': 'xm1014',
    'guns:sawedoff': 'sawedoff',
    'guns:famas': 'famas'
  };

  try { globalThis[GLOBAL_KEY]?.destroy?.(); } catch (_) {}

  const state = {
    enabled: false,
    destroyed: false,
    packs: new Map(),
    ctors: null,
    scanTimer: 0,
    raf: 0,
    lastT: 0,
    local: null,
    remotes: new Map(),
    lastLocalGun: null,
    gameCache: { game: null, at: 0 }
  };

  function getGame() {
    if (globalThis.miniblox?.player) return globalThis.miniblox;
    const now = performance.now();
    if (state.gameCache.game?.player && now - state.gameCache.at < 1000) return state.gameCache.game;
    try {
      const react = document.querySelector('#react');
      if (!react) return null;
      for (const root of Object.values(react)) {
        const game = root?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player) { state.gameCache = { game, at: now }; return game; }
      }
    } catch (_) {}
    return null;
  }

  const POSE_LI = [1.357, -0.958, -1.642];
  const POSE_RI = [-0.463, -1.565, 0];
  const VM_SCALE = 0.42;
  const VM_POS = [0.32, -0.35, -0.45];
  const VM_EULER = [-0.03, -0.06, 0.03];

  function findHandRenderer(game) {
    try {
      const cam = game?.gameScene?.axesHelper?.parent;
      for (const child of cam?.children ?? []) {
        if (typeof child?.updateArmAnimation === 'function' && child.item && child.rightArm) return child;
      }
    } catch (_) {}
    return null;
  }

  function findItemGroup(game) {
    try {
      const cam = game?.gameScene?.axesHelper?.parent;
      for (const child of cam?.children ?? []) {
        if (typeof child?.updateArmAnimation === 'function' && child.item) return child;
      }
    } catch (_) {}
    return null;
  }

  function log(msg, data) {
    if (data !== undefined) console.log(TAG, msg, data);
    else console.log(TAG, msg);
  }

  function holderNamePath(o) {
    const parts = [];
    let cur = o;
    for (let i = 0; i < 8 && cur; i++) {
      parts.push(cur.name || cur.constructor?.name || '?');
      cur = cur.parent;
    }
    return parts.join(' > ');
  }

  function countMeshes(o) {
    let n = 0;
    o.traverse(c => { if (c.geometry) n++; });
    return n;
  }

  function grabCtors() {
    if (state.ctors) return state.ctors;
    const game = getGame();
    const lf = findHandRenderer(game);
    const arm = lf?.rightArm;
    if (!arm?.geometry?.attributes?.position) return null;
    state.ctors = {
      Mesh: arm.constructor,
      Group: lf.item?.constructor || Object.getPrototypeOf(lf.constructor),
      BufferGeometry: arm.geometry.constructor,
      BufferAttribute: arm.geometry.attributes.position.constructor,
      Material: arm.material.constructor,
      Texture: arm.material.map?.constructor || null
    };
    return state.ctors;
  }

  function modelUrl(file) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        return chrome.runtime.getURL('models/tacz/models/' + file);
      }
    } catch (_) {}
    const meta = document.querySelector('meta[name="mf-skins-base"]');
    const base = meta?.content?.replace(/skins\/?$/i, '') || '';
    return base ? base + 'models/tacz/models/' + file : '';
  }

  function loadPack(gun) {
    if (state.packs.has(gun)) return state.packs.get(gun);
    const entry = { gun, status: 'loading', model: null, anims: {}, waiters: [] };
    state.packs.set(gun, entry);
    buildPack(gun, entry);
    return entry;
  }

  async function buildPack(gun, entry) {
    try {
      const [geoRes, animRes] = await Promise.all([
        fetch(modelUrl(gun + '.geo.json'), { cache: 'force-cache' }),
        fetch(modelUrl(gun + '.animation.json'), { cache: 'force-cache' })
      ]);
      if (!geoRes.ok) throw new Error('geo http ' + geoRes.status);
      const geoJson = await geoRes.json();
      let animJson = null;
      if (animRes.ok) {
        try { animJson = await animRes.json(); } catch (_) {}
      }

      let texUri = '';
      const texRes = await fetch(modelUrl(gun + '.png'), { cache: 'force-cache' });
      if (texRes.ok) {
        const buf = new Uint8Array(await texRes.arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        texUri = 'data:image/png;base64,' + btoa(s);
      }

      const ctors = grabCtors();
      if (!ctors) throw new Error('constructores no disponibles');

      const texInfo = await loadTexture(texUri, ctors);
      const built = buildModel(geoJson, texInfo, ctors);
      entry.model = built.root;
      entry.anims = parseAnims(animJson, built.nodeByName);
      entry.nodeByName = built.nodeByName;
      entry.status = 'ready';
      console.log(TAG, gun, 'ready', built.bones, 'bones', built.cubes, 'cubes', Object.keys(entry.anims).length, 'anims');
    } catch (e) {
      entry.status = 'error';
      console.warn(TAG, gun, 'failed:', e?.message || e);
    }
    const w = entry.waiters;
    entry.waiters = [];
    for (const fn of w) { try { fn(); } catch (_) {} }
  }

  function whenReady(entry, fn) {
    if (entry.status === 'ready') { fn(); return; }
    if (entry.status === 'loading') entry.waiters.push(fn);
  }

  function retryPack(gun) {
    const entry = state.packs.get(gun);
    if (entry?.status !== 'error') return;
    state.packs.delete(gun);
  }

  function deg2quat(x, y, z) {
    const d = Math.PI / 180;
    const hx = -x * d / 2, hy = y * d / 2, hz = -z * d / 2;
    const cx = Math.cos(hx), sx = Math.sin(hx);
    const cy = Math.cos(hy), sy = Math.sin(hy);
    const cz = Math.cos(hz), sz = Math.sin(hz);
    return [
      sx * cy * cz - cx * sy * sz,
      cx * sy * cz + sx * cy * sz,
      cx * cy * sz - sx * sy * cz,
      cx * cy * cz + sx * sy * sz
    ];
  }

  function faceQuads(cube) {
    const [ox, oy, oz] = cube.origin;
    const [sx, sy, sz] = cube.size;
    const inf = +cube.inflate || 0;
    const minX = ox - inf, maxX = ox + sx + inf;
    const minY = oy - inf, maxY = oy + sy + inf;
    const minZ = oz - inf, maxZ = oz + sz + inf;
    const u = cube.uv?.[0] || 0, v = cube.uv?.[1] || 0;
    const w = sx, h = sy, d = sz;
    const quads = [];
    const F = (tl, bl, br, tr, reg, n) => quads.push({ tl, bl, br, tr, reg, n });
    const PF = cube.uv && !Array.isArray(cube.uv) ? cube.uv : null;
    const R = (f, fb) => (f ? [f.uv[0], f.uv[1], f.uv_size?.[0] || fb[2], f.uv_size?.[1] || fb[3]] : fb);
    if (PF) {
      if (h === 0) {
        if (PF.up) F([minX, maxY, minZ], [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], R(PF.up, [0, 0, 0, 0]), [0, 1, 0]);
        return quads;
      }
      if (d === 0) {
        if (PF.north) F([maxX, maxY, minZ], [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], R(PF.north, [0, 0, 0, 0]), [0, 0, -1]);
        return quads;
      }
      if (w === 0) {
        if (PF.west) F([minX, maxY, minZ], [minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], R(PF.west, [0, 0, 0, 0]), [-1, 0, 0]);
        return quads;
      }
      if (PF.north) F([maxX, maxY, minZ], [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], R(PF.north, [0, 0, 0, 0]), [0, 0, -1]);
      if (PF.south) F([minX, maxY, maxZ], [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], R(PF.south, [0, 0, 0, 0]), [0, 0, 1]);
      if (PF.east) F([maxX, maxY, maxZ], [maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], R(PF.east, [0, 0, 0, 0]), [1, 0, 0]);
      if (PF.west) F([minX, maxY, minZ], [minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], R(PF.west, [0, 0, 0, 0]), [-1, 0, 0]);
      if (PF.up) F([minX, maxY, minZ], [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], R(PF.up, [0, 0, 0, 0]), [0, 1, 0]);
      if (PF.down) F([minX, minY, minZ], [minX, minY, maxZ], [maxX, minY, maxZ], [minX, minY, minZ], R(PF.down, [0, 0, 0, 0]), [0, -1, 0]);
      return quads;
    }
    if (h === 0) {
      F([minX, maxY, minZ], [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [u + d, v, w, d], [0, 1, 0]);
      return quads;
    }
    if (d === 0) {
      F([maxX, maxY, minZ], [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [u + d, v + d, w, h], [0, 0, -1]);
      return quads;
    }
    if (w === 0) {
      F([minX, maxY, minZ], [minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [u, v + d, d, h], [-1, 0, 0]);
      return quads;
    }
    F([maxX, maxY, minZ], [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [u + d, v + d, w, h], [0, 0, -1]);
    F([minX, maxY, maxZ], [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [u + 2 * d + w, v + d, w, h], [0, 0, 1]);
    F([maxX, maxY, maxZ], [maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [u + d + w, v + d, d, h], [1, 0, 0]);
    F([minX, maxY, minZ], [minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [u, v + d, d, h], [-1, 0, 0]);
    F([minX, maxY, minZ], [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [u + d, v, w, d], [0, 1, 0]);
    F([minX, minY, minZ], [minX, minY, maxZ], [maxX, minY, maxZ], [minX, minY, minZ], [u + d + w, v, w, d], [0, -1, 0]);
    return quads;
  }

  function buildCube(cube, pivot) {
    const pos = [], nor = [], uvs = [], idx = [];
    let vi = 0;
    let rm = null, rp = null;
    if (Array.isArray(cube.rotation) && cube.rotation.some(r => r)) {
      const q = deg2quat(cube.rotation[0], cube.rotation[1], cube.rotation[2]);
      const [qx, qy, qz, qw] = q;
      rm = [
        1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qw * qz), 2 * (qx * qz - qw * qy),
        2 * (qx * qy - qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qw * qx),
        2 * (qx * qz + qw * qy), 2 * (qy * qz - qw * qx), 1 - 2 * (qx * qx + qy * qy)
      ];
      rp = cube.pivot || [0, 0, 0];
    }
    for (const q of faceQuads(cube)) {
      const [ru, rv, rw, rh] = q.reg;
      const corners = [q.tl, q.bl, q.br, q.tr];
      const uvc = [[ru, rv], [ru, rv + rh], [ru + rw, rv + rh], [ru + rw, rv]];
      for (let i = 0; i < 4; i++) {
        let c = corners[i], n = q.n;
        if (rm) {
          const dx = c[0] - rp[0], dy = c[1] - rp[1], dz = c[2] - rp[2];
          c = [rp[0] + rm[0] * dx + rm[1] * dy + rm[2] * dz,
               rp[1] + rm[3] * dx + rm[4] * dy + rm[5] * dz,
               rp[2] + rm[6] * dx + rm[7] * dy + rm[8] * dz];
          n = [rm[0] * n[0] + rm[1] * n[1] + rm[2] * n[2],
               rm[3] * n[0] + rm[4] * n[1] + rm[5] * n[2],
               rm[6] * n[0] + rm[7] * n[1] + rm[8] * n[2]];
        }
        pos.push((c[0] - pivot[0]) * S, (c[1] - pivot[1]) * S, (c[2] - pivot[2]) * S);
        nor.push(n[0], n[1], n[2]);
        uvs.push(uvc[i][0] / TW, uvc[i][1] / TH);
      }
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
    return { pos, nor, uv: uvs, idx };
  }

  let TW = 16, TH = 16;

  const HIDE_BONES = [
    /^muzzle_flash$/i,
    /^shell$/i,
    /^bullet_in_barrel$/i,
    /^bullet$/i,
    /^bullet_in_mag\d*$/i,
    /^bullet_shell$/i,
    /^bullet\d$/i,
    /^bullet_\d$/i,
    /^bullet_and_hand$/i,
    /^mag_extended_\d+$/i,
    /^constraint$/i,
    /^views$/i
  ];

  const VARIANT_KEEP = [
    { keep: /^stock_default$|^stock$/, hide: /^oem_stock_(heavy|light|tactical)$|^attachment_adapter$|^ar_stock_adapter$/ },
    { keep: /^handguard_default$/, hide: /^handguard_tactical$/ },
    { keep: /^sights$|^sight$/, hide: /^sight_folded$/ },
    { keep: /^mag_standard$|^magazine$/, hide: /^additional_magazine$/ }
  ];

  function loadTexture(texUri, ctors) {
    return new Promise(resolve => {
      if (!texUri || !ctors.Texture) { resolve(null); return; }
      const img = new Image();
      img.onload = () => {
        try {
          const tex = new ctors.Texture(img);
          tex.magFilter = 1003;
          tex.minFilter = 1003;
          tex.generateMipmaps = false;
          tex.flipY = false;
          tex.needsUpdate = true;
          resolve({ tex, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
        } catch (_) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = texUri;
    });
  }

  function buildModel(geoJson, texInfo, ctors) {
    const geo = geoJson['minecraft:geometry']?.[0];
    if (!geo?.bones?.length) throw new Error('geo sin bones');
    const desc = geo.description || {};
    TW = desc.texture_width || 16;
    TH = desc.texture_height || 16;

    const boneByName = new Map(geo.bones.map(b => [b.name, b]));
    const isDescendant = (name, ancestor) => {
      let cur = boneByName.get(name);
      while (cur?.parent) {
        if (cur.parent === ancestor) return true;
        cur = boneByName.get(cur.parent);
      }
      return false;
    };
    const boneSet = new Set(geo.bones.map(b => b.name));
    const hidden = new Set();
    for (const re of HIDE_BONES) {
      for (const name of boneSet) if (re.test(name)) hidden.add(name);
    }
    for (const re of VARIANT_KEEP) {
      const keepNames = [...boneSet].filter(name => re.keep.test(name));
      if (!keepNames.length) continue;
      for (const name of boneSet) {
        if (!re.hide.test(name)) continue;
        if (keepNames.some(k => isDescendant(k, name))) continue;
        hidden.add(name);
      }
    }

    const { Mesh, Group, BufferGeometry, BufferAttribute } = ctors;

    let material = null;
    if (texInfo?.tex) {
      try { material = new ctors.Material({ map: texInfo.tex }); } catch (_) {}
    }
    if (!material) material = new ctors.Material({ color: 0x777777 });
    try {
      material.alphaTest = 0.5;
      material.transparent = false;
      material.__mfSkipHook = true;
    } catch (_) {}

    const nodeByName = new Map();
    const root = new Group();
    root.name = 'mftacz';
    root.userData.__mfTacz = true;

    let cubes = 0;
    let rootPivot = [0, 0, 0];
    for (const b of geo.bones) {
      if (!b.parent || !boneByName.has(b.parent)) { rootPivot = b.pivot || [0, 0, 0]; break; }
    }
    root.position.set(-rootPivot[0] * S, -rootPivot[1] * S, -rootPivot[2] * S);
    for (const b of geo.bones) {
      const g = new Group();
      g.name = b.name;
      if (hidden.has(b.name)) { g.visible = false; g.userData.__mfHidden = true; }
      const pivot = b.pivot || [0, 0, 0];
      const pp = b.parent ? (boneByName.get(b.parent)?.pivot || [0, 0, 0]) : [0, 0, 0];
      g.position.set((pivot[0] - pp[0]) * S, (pivot[1] - pp[1]) * S, (pivot[2] - pp[2]) * S);
      if (Array.isArray(b.rotation) && b.rotation.some(r => r)) {
        const q = deg2quat(b.rotation[0], b.rotation[1], b.rotation[2]);
        g.quaternion.set(q[0], q[1], q[2], q[3]);
      }
      nodeByName.set(b.name, g);
      (b.parent && nodeByName.get(b.parent) ? nodeByName.get(b.parent) : root).add(g);

      if (b.cubes?.length) {
        const pos = [], nor = [], uv = [], idx = [];
        let vi = 0;
        for (const cube of b.cubes) {
          if (!cube?.origin || !cube.size) continue;
          const dt = buildCube(cube, pivot);
          for (let i = 0; i < dt.pos.length; i++) pos.push(dt.pos[i]);
          for (let i = 0; i < dt.nor.length; i++) nor.push(dt.nor[i]);
          for (let i = 0; i < dt.uv.length; i++) uv.push(dt.uv[i]);
          const base = vi;
          for (const ix of dt.idx) idx.push(base + ix);
          vi += dt.pos.length / 3;
          cubes++;
        }
        if (vi) {
          const geometry = new BufferGeometry();
          geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
          geometry.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
          geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
          geometry.setIndex(idx);
          const mesh = new Mesh(geometry, material);
          mesh.frustumCulled = false;
          g.add(mesh);
        }
      }
    }

    const anims = {};
    return { root, nodeByName, anims, bones: geo.bones.length, cubes };
  }

  function parseAnims(animJson, nodeByName) {
    const anims = {};
    if (!animJson?.animations) return anims;
    for (const [name, a] of Object.entries(animJson.animations)) {
      const bones = {};
      for (const [bn, bd] of Object.entries(a.bones || {})) {
        const node = nodeByName.get(bn);
        if (!node) continue;
        bones[bn] = {
          rot: bd.rotation || null,
          pos: bd.position || null
        };
      }
      anims[name] = { len: a.animation_length || 0, loop: a.loop === true || a.loop === 'loop', bones };
    }
    return anims;
  }

  class ViewModel {
    constructor(entry, firstPerson) {
      this.entry = entry;
      this.firstPerson = firstPerson;
      this.root = null;
      this.nodes = null;
      this.player = null;
      this.animName = null;
      this.animT = 0;
      this.rest = null;
    }

    attach(player) {
      const game = getGame();
      let holder = null;
      let lf = null;
      if (this.firstPerson) {
        lf = findHandRenderer(game) || findItemGroup(game);
        holder = lf || null;
        log('attach FP', {
          hasGame: !!game,
          hasLf: !!lf,
          lfCls: lf?.constructor?.name || '-',
          hasItem: !!lf?.item,
          spriteVisible: lf?.mesh?.visible
        });
      } else {
        holder = player?.mesh?.rightHand || player?.mesh;
        log('attach TP', {
          holderCls: holder?.constructor?.name || '-',
          holderPath: holderNamePath(holder)
        });
      }
      if (!holder) { log('attach FAILED: no holder'); return false; }
      this.player = player;
      this.root = this.entry.model.clone(true);
      this.root.userData.__mfTaczInst = true;
      this.root.traverse(o => {
        try {
          (o.userData = o.userData || {}).__mfTacz = true;
          if (o.userData.__mfHidden) o.visible = false;
        } catch (_) {}
      });
      this.nodes = new Map();
      this.root.traverse(o => { if (!o.userData.__mfSkipNode && o.name) this.nodes.set(o.name, o); });

      if (this.firstPerson) {
        this.lf = lf;
        this.root.scale.setScalar(VM_SCALE);
        this.root.position.set(
          this.root.position.x * VM_SCALE + VM_POS[0],
          this.root.position.y * VM_SCALE + VM_POS[1],
          this.root.position.z * VM_SCALE + VM_POS[2]
        );
        this.root.rotation.set(VM_EULER[0], VM_EULER[1], VM_EULER[2]);
        // null = aún no hay muestra previa (guarda de primer frame). los objetos
        // reales se crean una vez en update y se reutilizan; aquí solo el hueco.
        this.lastItemPos = null;
        this.lastItemQuat = null;
        this.lastItemQuatInv = null;
        if (lf) {
          this.origUpdate = lf.update;
          const self = this;
          lf.update = function (...args) {
            self.origUpdate?.apply(this, args);
            try {
              if (this.mesh && this.mesh.visible && this.mesh !== self.root) this.mesh.visible = false;
              if (this.item && this.item.visible) this.item.visible = false;
            } catch (_) {}
          };
        }
      } else {
        const hidden = [];
        for (const child of [...holder.children]) {
          if (child.userData?.__mfTacz) continue;
          child.visible = false;
          hidden.push(child);
        }
        this.hiddenChildren = hidden;
        this.root.scale.setScalar(0.75);
        this.root.rotation.set(0, Math.PI / 2, 0);
      }
      holder.add(this.root);
      log('attached', {
        holder: holderNamePath(holder),
        rootChildren: this.root.children.length,
        meshCount: countMeshes(this.root)
      });
      this.captureRest();
      this.play('static_idle');
      return true;
    }

    captureRest() {
      this.rest = new Map();
      for (const [name, node] of this.nodes) {
        this.rest.set(name, { p: node.position.clone(), q: node.quaternion.clone() });
      }
    }

    play(name) {
      if (!this.entry.anims?.[name]) return;
      if (this.animName === name) return;
      this.animName = name;
      this.animT = 0;
    }

    update(dt, moving) {
      if (!this.root) return;
      if (this.firstPerson && this.lf) {
        if (this.lf.mesh && this.lf.mesh !== this.root && this.lf.mesh.visible) this.lf.mesh.visible = false;
        if (this.lf.item && this.lf.item.visible) this.lf.item.visible = false;
        const ip = this.lf.item?.position, iq = this.lf.item?.quaternion;
        if (ip && iq) {
          let dx = 0, dy = 0, dz = 0;
          if (this.lastItemPos) {
            dx = ip.x - this.lastItemPos.x;
            dy = ip.y - this.lastItemPos.y;
            dz = ip.z - this.lastItemPos.z;
            if (this.lastItemQuat) {
              // scratch persistente del propio viewmodel: cero clones por frame
              // (el recolector de basura no cobra por pureza, cobra por volumen)
              if (!this.lastItemQuatInv) this.lastItemQuatInv = this.lastItemQuat.clone();
              this.root.quaternion.copy(iq).multiply(this.lastItemQuatInv.copy(this.lastItemQuat).invert());
              const e = this.root.rotation;
              this.root.rotation.set(e.x + VM_EULER[0], e.y + VM_EULER[1], e.z + VM_EULER[2]);
            }
          }
          this.root.position.set(
            dx + VM_POS[0] + (this.tuneX || 0),
            dy + VM_POS[1] + (this.tuneY || 0),
            dz + VM_POS[2] + (this.tuneZ || 0)
          );
          if (this.lastItemPos) {
            this.lastItemPos.x = ip.x;
            this.lastItemPos.y = ip.y;
            this.lastItemPos.z = ip.z;
          } else {
            this.lastItemPos = { x: ip.x, y: ip.y, z: ip.z };
          }
          if (this.lastItemQuat) this.lastItemQuat.copy(iq);
          else this.lastItemQuat = iq.clone();
        }
      }
      this.logT = (this.logT || 0) + dt;
      if (this.logT > 2) {
        this.logT = 0;
        let wp = null;
        try {
          if (!state.tmpV) state.tmpV = this.root.position.clone();
          wp = this.root.getWorldPosition(state.tmpV).toArray().map(v => +v.toFixed(2));
        } catch (_) {}
        log(this.firstPerson ? 'FP update' : 'TP update', {
          anim: this.animName,
          rootPath: holderNamePath(this.root),
          rootPos: this.root.position.toArray().map(v => +v.toFixed(2)),
          rootWorldPos: wp
        });
      }
      const anims = this.entry.anims || {};
      if (moving && anims.run && this.animName !== 'shoot') this.play('run');
      else if (!moving && this.animName === 'run') this.play('static_idle');

      const anim = anims[this.animName];
      if (!anim) return;
      this.animT += dt;
      const t = anim.loop ? this.animT % (anim.len || 1) : Math.min(this.animT, anim.len || 1);
      applyAnim(this.nodes, this.rest, anim, t);
    }

    destroy() {
      if (this.lf && this.origUpdate && this.lf.update !== this.origUpdate) {
        try { this.lf.update = this.origUpdate; } catch (_) {}
      }
      this.origUpdate = null;
      for (const c of (this.hiddenChildren || [])) { try { c.visible = true; } catch (_) {} }
      this.hiddenChildren = null;
      if (this.lf?.mesh) { try { this.lf.mesh.visible = true; } catch (_) {} }
      if (this.lf?.item) { try { this.lf.item.visible = true; } catch (_) {} }
      this.root?.parent?.remove?.(this.root);
      this.root = null;
    }
  }

  function applyAnim(nodes, rest, anim, t) {
    for (const name in anim.bones) {
      const node = nodes.get(name);
      const r = rest.get(name);
      if (!node || !r) continue;
      const ch = anim.bones[name];
      if (ch.rot) {
        const v = sampleVec(ch.rot, t);
        const q = deg2quat(v[0], v[1], v[2]);
        node.quaternion.copy(r.q).multiply({ x: q[0], y: q[1], z: q[2], w: q[3] });
      }
      if (ch.pos) {
        const v = sampleVec(ch.pos, t);
        node.position.set(
          r.p.x + v[0] * S,
          r.p.y + v[1] * S,
          r.p.z + v[2] * S
        );
      }
    }
  }

  function sampleVec(track, t) {
    if (Array.isArray(track)) return track;
    const keys = Object.keys(track).map(Number).sort((a, b) => a - b);
    if (!keys.length) return [0, 0, 0];
    if (keys.length === 1) return track[keys[0]];
    let i = 1;
    while (i < keys.length && keys[i] < t) i++;
    const t0 = keys[i - 1], t1 = keys[i];
    const a = track[t0], b = track[t1];
    if (!a || !b) return a || [0, 0, 0];
    const f = (t - t0) / (t1 - t0);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  function heldItemName(player) {
    try {
      let stack = typeof player?.getActiveItemStack === 'function' ? player.getActiveItemStack() : null;
      if (!stack && player?.inventory) {
        const idx = player.inventory.currentItem ?? 0;
        stack = player.inventory.main?.[idx] ?? null;
      }
      if (!stack) return null;
      const item = stack.item || stack;
      const raw = typeof item === 'string' ? item : (item?.name ?? item?.idName ?? null);
      return raw ? String(raw) : null;
    } catch (_) { return null; }
  }

  function scan() {
    if (!state.enabled) return;
    const game = getGame();
    if (!game) { log('scan: no game'); return; }

    const heldNow = heldItemName(game.player);
    const localGun = GUN_MAP[heldNow] || null;
    if (heldNow !== state._lastHeldRaw) { state._lastHeldRaw = heldNow; log('held item changed', { raw: heldNow, mapped: localGun }); }
    if (localGun !== state.lastLocalGun) {
      detachLocal();
      state.lastLocalGun = localGun;
      if (localGun) {
        log('local gun equip', localGun);
        retryPack(localGun);
        const entry = loadPack(localGun);
        whenReady(entry, () => attachLocal(entry, game.player));
      }
    }

    const players = game?.world?.players;
    if (players) {
      const seen = new Set();
      const iter = players.values ? players.values() : Object.values(players);
      for (const p of iter) {
        if (!p || p === game.player || !p.mesh) continue;
        const gun = GUN_MAP[heldItemName(p)] || null;
        if (!gun) { dropRemote(p.id); continue; }
        seen.add(p.id);
        const existing = state.remotes.get(p.id);
        if (existing) {
          if (existing.gun !== gun) {
            existing.view?.destroy();
            state.remotes.delete(p.id);
          } else continue;
        }
        const entry = loadPack(gun);
        whenReady(entry, () => {
          if (state.remotes.get(p.id)?.gun !== gun && !state.remotes.has(p.id)) {
            const view = new ViewModel(entry, false);
            if (view.attach(p)) {
              state.remotes.set(p.id, { gun, view, player: p });
            } else view.destroy();
          }
        });
      }
      for (const id of [...state.remotes.keys()]) {
        if (!seen.has(id)) dropRemote(id);
      }
    }
  }

  function attachLocal(entry, player) {
    if (!player || state.local?.entry === entry) return;
    detachLocal();
    const view = new ViewModel(entry, true);
    if (view.attach(player)) { state.local = { entry, view, player }; log('attachLocal OK', { gun: entry.gun }); }
    else { view.destroy(); state.lastLocalGun = null; log('attachLocal FAILED'); }
  }

  function detachLocal() {
    state.local?.view?.destroy();
    state.local = null;
  }

  function dropRemote(id) {
    const e = state.remotes.get(id);
    e?.view?.destroy();
    state.remotes.delete(id);
  }

  function playerMoving(p) {
    try {
      const v = p?.getVelocity?.() || p?.vel || null;
      return !!v && Math.hypot(v.x, v.z) > 0.15;
    } catch (_) { return false; }
  }

  function tick() {
    if (!state.enabled) { state.raf = 0; return; }
    const now = performance.now();
    const dt = Math.min(0.1, (now - state.lastT) / 1000);
    state.lastT = now;
    if (state.local) { try { state.local.view.update(dt, playerMoving(state.local.player)); } catch (err) { console.warn(TAG + ' FP update crashed: ' + (err?.message || err)); detachLocal(); } }
    for (const e of state.remotes.values()) { try { e.view.update(dt, playerMoving(e.player)); } catch (err) { console.warn(TAG + ' TP update crashed: ' + (err?.message || err)); dropRemote(e.player.id); } }
    state.raf = requestAnimationFrame(tick);
  }

  function startAll() {
    if (state.scanTimer) return;
    state.scanTimer = window.setInterval(scan, 400);
    state.lastT = performance.now();
    state.raf = requestAnimationFrame(tick);
    scan();
  }

  function stopAll() {
    if (state.scanTimer) { clearInterval(state.scanTimer); state.scanTimer = 0; }
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
    detachLocal();
    for (const e of state.remotes.values()) e.view?.destroy();
    state.remotes.clear();
    state.lastLocalGun = null;
  }

  function sync() {
    if (state.enabled && !state.destroyed) startAll();
    else stopAll();
  }

  function onConfig(event) {
    let detail = event.detail;
    try { detail = typeof detail === 'string' ? JSON.parse(detail) : detail; } catch (_) { return; }
    if (!detail || typeof detail !== 'object') return;
    if (typeof detail.enabled === 'boolean') state.enabled = detail.enabled;
    sync();
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    state.enabled = false;
    stopAll();
    document.removeEventListener(CONFIG_EVENT, onConfig);
    if (globalThis[GLOBAL_KEY]?.destroy === destroy) delete globalThis[GLOBAL_KEY];
  }

  document.addEventListener(CONFIG_EVENT, onConfig);
  globalThis[GLOBAL_KEY] = {
    destroy,
    tune(fp) {
      const t = state.local?.view;
      if (!t?.root) { console.warn(TAG, 'no local viewmodel'); return; }
      if (fp?.pos) { t.tuneX = fp.pos[0]; t.tuneY = fp.pos[1]; t.tuneZ = fp.pos[2]; }
      if (fp?.rot) { t.tuneRotX = fp.rot[0]; t.tuneRotY = fp.rot[1]; t.tuneRotZ = fp.rot[2]; }
      if (fp?.scale) t.root.scale.setScalar(fp.scale);
      if (t.tuneRotX || t.tuneRotY || t.tuneRotZ) t.root.rotation.set(t.tuneRotX || 0, t.tuneRotY || 0, t.tuneRotZ || 0);
      console.log(TAG, 'tuned', fp);
    },
    diag() {
      const game = getGame();
      const lf = findHandRenderer(game);
      console.log(TAG, {
        enabled: state.enabled,
        game: !!game,
        handRenderer: !!lf,
        heldName: heldItemName(game?.player),
        ctors: !!state.ctors,
        packs: [...state.packs.entries()].map(([k, v]) => [k, v.status]),
        local: !!state.local,
        remotes: state.remotes.size
      });
    }
  };
})();
