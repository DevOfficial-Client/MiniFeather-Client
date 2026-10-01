(function () {
    'use strict';

    // re-ejecución (hot-reload)
    try { window.__MF_CRITTER_SCOPE__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather critterskins';

    // inventario de variantes generado del disco (critter-bundle.json):
    // wolf: combos {breed, n, files:{normal|angry|tame}}; cat: variantes del
    // juego (nombre de la textura vanilla que pide el juego) -> archivos del pack.
    const INVENTORY = {"wolf":[{"breed":"","n":2,"files":{"normal":"wolf2.png","angry":"wolf_angry2.png","tame":"wolf_tame2.png"}},{"breed":"ashen","n":2,"files":{"normal":"wolf_ashen2.png","angry":"wolf_ashen_angry2.png","tame":"wolf_ashen_tame2.png"}},{"breed":"ashen","n":3,"files":{"normal":"wolf_ashen3.png","angry":"wolf_ashen_angry3.png","tame":"wolf_ashen_tame3.png"}},{"breed":"black","n":2,"files":{"normal":"wolf_black2.png","angry":"wolf_black_angry2.png","tame":"wolf_black_tame2.png"}},{"breed":"black","n":3,"files":{"normal":"wolf_black3.png","angry":"wolf_black_angry3.png","tame":"wolf_black_tame3.png"}},{"breed":"chestnut","n":2,"files":{"normal":"wolf_chestnut2.png","angry":"wolf_chestnut_angry2.png","tame":"wolf_chestnut_tame2.png"}},{"breed":"chestnut","n":3,"files":{"normal":"wolf_chestnut3.png","angry":"wolf_chestnut_angry3.png","tame":"wolf_chestnut_tame3.png"}},{"breed":"rusty","n":2,"files":{"normal":"wolf_rusty2.png","angry":"wolf_rusty_angry2.png","tame":"wolf_rusty_tame2.png"}},{"breed":"rusty","n":3,"files":{"normal":"wolf_rusty3.png","angry":"wolf_rusty_angry3.png","tame":"wolf_rusty_tame3.png"}},{"breed":"snowy","n":2,"files":{"normal":"wolf_snowy2.png","angry":"wolf_snowy_angry2.png","tame":"wolf_snowy_tame2.png"}},{"breed":"spotted","n":2,"files":{"normal":"wolf_spotted2.png","angry":"wolf_spotted_angry2.png","tame":"wolf_spotted_tame2.png"}},{"breed":"spotted","n":3,"files":{"normal":"wolf_spotted3.png","angry":"wolf_spotted_angry3.png","tame":"wolf_spotted_tame3.png"}},{"breed":"striped","n":2,"files":{"normal":"wolf_striped2.png","angry":"wolf_striped_angry2.png","tame":"wolf_striped_tame2.png"}},{"breed":"striped","n":3,"files":{"normal":"wolf_striped3.png","angry":"wolf_striped_angry3.png","tame":"wolf_striped_tame3.png"}},{"breed":"woods","n":2,"files":{"normal":"wolf_woods2.png","angry":"wolf_woods_angry2.png","tame":"wolf_woods_tame2.png"}},{"breed":"woods","n":3,"files":{"normal":"wolf_woods3.png","angry":"wolf_woods_angry3.png","tame":"wolf_woods_tame3.png"}}],"cat":{"all_black":["all_black2.png","all_black3.png","all_black4.png","all_black5.png","all_black6.png","all_black7.png","all_black8.png","all_black9.png","all_black10.png","all_black11.png","all_black12.png","all_black13.png","all_black14.png","all_black15.png","all_black16.png","all_black17.png","all_black18.png","all_black19.png","all_black20.png","all_black21.png","all_black22.png","all_black23.png","all_black24.png","all_black25.png"],"black":["black2.png","black3.png","black4.png","black5.png","black6.png","black7.png","black8.png","black9.png","black10.png","black11.png","black12.png","black13.png","black14.png","black15.png","black16.png","black17.png","black18.png","black19.png","black20.png","black21.png","black22.png","black23.png","black24.png","black25.png"],"british_shorthair":["british_shorthair2.png","british_shorthair3.png","british_shorthair4.png","british_shorthair5.png","british_shorthair6.png","british_shorthair7.png","british_shorthair8.png","british_shorthair9.png","british_shorthair10.png","british_shorthair11.png","british_shorthair12.png","british_shorthair13.png","british_shorthair14.png","british_shorthair15.png","british_shorthair16.png","british_shorthair17.png","british_shorthair18.png","british_shorthair19.png","british_shorthair20.png","british_shorthair21.png","british_shorthair22.png","british_shorthair23.png","british_shorthair24.png","british_shorthair25.png"],"calico":["calico2.png","calico3.png","calico4.png","calico5.png","calico6.png","calico7.png","calico8.png","calico9.png","calico10.png","calico11.png","calico12.png","calico13.png","calico14.png","calico15.png","calico16.png","calico17.png","calico18.png","calico19.png","calico20.png","calico21.png","calico22.png","calico23.png","calico24.png","calico25.png"],"jellie":["jellie2.png","jellie3.png","jellie4.png","jellie5.png","jellie6.png","jellie7.png","jellie8.png","jellie9.png","jellie10.png","jellie11.png","jellie12.png","jellie13.png","jellie14.png","jellie15.png","jellie16.png","jellie17.png","jellie18.png","jellie19.png","jellie20.png","jellie21.png","jellie22.png","jellie23.png","jellie24.png","jellie25.png"],"persian":["persian2.png","persian3.png","persian4.png","persian5.png","persian6.png","persian7.png","persian8.png","persian9.png","persian10.png","persian11.png","persian12.png","persian13.png","persian14.png","persian15.png","persian16.png","persian17.png","persian18.png","persian19.png","persian20.png","persian21.png","persian22.png","persian23.png","persian24.png","persian25.png"],"ragdoll":["ragdoll2.png","ragdoll3.png","ragdoll4.png","ragdoll5.png","ragdoll6.png","ragdoll7.png","ragdoll8.png","ragdoll9.png","ragdoll10.png","ragdoll11.png","ragdoll12.png","ragdoll13.png","ragdoll14.png","ragdoll15.png","ragdoll16.png","ragdoll17.png","ragdoll18.png","ragdoll19.png","ragdoll20.png","ragdoll21.png","ragdoll22.png","ragdoll23.png","ragdoll24.png","ragdoll25.png"],"red":["red2.png","red3.png","red4.png","red5.png","red6.png","red7.png","red8.png","red9.png","red10.png","red11.png","red12.png","red13.png","red14.png","red15.png","red16.png","red17.png","red18.png","red19.png","red20.png","red21.png","red22.png","red23.png","red24.png","red25.png"],"siamese":["siamese2.png","siamese3.png","siamese4.png","siamese5.png","siamese6.png","siamese7.png","siamese8.png","siamese9.png","siamese10.png","siamese11.png","siamese12.png","siamese13.png","siamese14.png","siamese15.png","siamese16.png","siamese17.png","siamese18.png","siamese19.png","siamese20.png","siamese21.png","siamese22.png","siamese23.png","siamese24.png","siamese25.png"],"tabby":["tabby2.png","tabby3.png","tabby4.png","tabby5.png","tabby6.png","tabby7.png","tabby8.png","tabby9.png","tabby10.png","tabby11.png","tabby12.png","tabby13.png","tabby14.png","tabby15.png","tabby16.png","tabby17.png","tabby18.png","tabby19.png","tabby20.png","tabby21.png","tabby22.png","tabby23.png","tabby24.png","tabby25.png"],"white":["white2.png","white3.png","white4.png","white5.png","white6.png","white7.png","white8.png","white9.png","white10.png","white11.png","white12.png","white13.png","white14.png","white15.png","white16.png","white17.png","white18.png","white19.png","white20.png","white21.png","white22.png","white23.png","white24.png","white25.png"]}};

    const CAT_TEX_DIR = 'textures/entity/cat/assets/minecraft/mcpatcher/mob/cat/';
    const WOLF_TEX_DIR = 'textures/entity/wolf/';
    const JEM_PATH = 'textures/entity/cat/assets/minecraft/mcpatcher/cem/cat.jem';
    const STORAGE_KEY = 'mf:critter:v1';
    const CAT_MESHES = ['head', 'nose', 'earL', 'earR', 'torso', 'tail1', 'tail2', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
    const VANILLA_WOLF_MAPS = new Set(['wolf.png', 'wolf_tame.png', 'wolf_angry.png']);

    const state = {
        enabled: false,
        game: null,
        scanTimer: 0,
        rafId: 0,
        destroyFlag: false,
        recs: new WeakMap(),
        live: new Set(),
        texCache: new Map(),      // url -> Promise<Texture>
        geomCache: new Map(),     // boxKey -> BufferGeometry
        jemPromise: null,         // árbol de partes parseado
        ctors: null,
        catMaterial: null,        // material compartido de la variante activa
        filterRef: null,          // filtros de la textura vanilla (nearest)
        warnThrottle: 0,
        firstHit: false
    };

    // ── game/renderer resolution (mismo patrón que MF_Deferred) ────────────
    function findGame() {
        try {
            const root = document.getElementById('react');
            if (!root) return null;
            for (const key in root) {
                if (!key.startsWith('__reactContainer') && !key.startsWith('__reactFiber')) continue;
                const fiber = root[key];
                const cand = fiber?.updateQueue?.baseState?.element?.props?.game;
                if (cand && cand.player) return cand;
            }
        } catch (_) {}
        return null;
    }

    function refreshGame() {
        const g = findGame();
        if (g) state.game = g;
        return state.game;
    }

    // constructores three robados de la propia entidad (THREE no está en window)
    function grabCtors(ent) {
        if (state.ctors) return state.ctors;
        try {
            const mesh = ent.meshes?.head || ent.meshes?.snout;
            if (!mesh?.geometry?.attributes?.position || !mesh.material) return null;
            state.ctors = {
                Object3D: (mesh.parent || ent.mesh).constructor,
                BufferGeometry: mesh.geometry.constructor,
                BufferAttribute: mesh.geometry.attributes.position.constructor,
                Material: mesh.material.constructor,
                Texture: mesh.material.map?.constructor || null,
                Quaternion: ent.mesh.quaternion.constructor
            };
            return state.ctors;
        } catch (_) { return null; }
    }

    function getURL(path) {
        try {
            if (window.__MF_SHIM__) return window.__MF_SHIM__.assetBase() + path;
        } catch (_) {}
        try { return chrome.runtime?.getURL ? chrome.runtime.getURL(path) : path; } catch (_) { return path; }
    }

    // ── persistencia por servidor + entidad ────────────────────────────────
    function serverKey() {
        let host = location.hostname || 'local';
        try {
            const g = state.game;
            host += '|' + String(g?.server?.address || g?.server?.host || g?.connection?.host || g?.socket?.url || '').slice(0, 64);
        } catch (_) {}
        return host;
    }

    function loadStore() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { return {}; }
    }

    function saveStore(store) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (_) {}
    }

    function recallAssignment(entKey) {
        const store = loadStore();
        return store[serverKey()]?.[entKey] || null;
    }

    function rememberAssignment(entKey, data) {
        const store = loadStore();
        const sk = serverKey();
        store[sk] = store[sk] || {};
        store[sk][entKey] = data;
        // poda: máximo 400 entidades por servidor
        const keys = Object.keys(store[sk]);
        if (keys.length > 400) {
            for (const k of keys.slice(0, keys.length - 400)) delete store[sk][k];
        }
        saveStore(store);
    }

    // ── texturas (cache global por URL) ────────────────────────────────────
    function loadTexture(url) {
        if (state.texCache.has(url)) return state.texCache.get(url);
        const p = new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const C = state.ctors?.Texture;
                    if (!C) { reject(new Error('sin ctor Texture')); return; }
                    const tex = new C(img);
                    try {
                        const ref = state.filterRef;
                        if (ref) {
                            tex.magFilter = ref.magFilter;
                            tex.minFilter = ref.minFilter;
                            tex.generateMipmaps = ref.generateMipmaps;
                        }
                    } catch (_) {}
                    tex.needsUpdate = true;
                    resolve(tex);
                } catch (e) { reject(e); }
            };
            img.onerror = () => reject(new Error('img fail ' + url));
            img.src = url;
        });
        state.texCache.set(url, p);
        p.catch(() => state.texCache.delete(url));
        return p;
    }

    // basename de la URL de una textura del juego (mfapp/extension/cdn)
    function mapBasename(map) {
        try {
            const src = map?.image?.src || '';
            const m = /([^/]+\.png)$/.exec(src);
            return m ? m[1] : null;
        } catch (_) { return null; }
    }

    // ── geometría de cubo con UVs de box-unwrap MC ─────────────────────────
    // boxes CEM: coordinates [x,y,z,w,h,d] (y hacia abajo), textureOffset [u,v],
    // sizeAdd infla, mirrorTexture "u" espeja el eje horizontal de la textura.
    function faceRects(u, v, w, h, d) {
        return [
            [u + d + w, v + d, d, h],   // px
            [u, v + d, d, h],           // nx
            [u + d, v, w, d],           // py (top)
            [u + d + w, v, w, d],       // ny (bottom)
            [u + d + w + d, v + d, w, h], // pz
            [u + d, v + d, w, h]        // nz (front)
        ];
    }

    function buildCubeGeometry(ctors, box, texW, texH, invert) {
        const [x, y, z, w0, h0, d0] = box.coordinates;
        const w = w0 + 2 * (box.sizeAdd || 0), h = h0 + 2 * (box.sizeAdd || 0), d = d0 + 2 * (box.sizeAdd || 0);
        const key = JSON.stringify([box.coordinates, box.textureOffset, box.sizeAdd || 0, box.mirrorTexture || '', invert, texW, texH]);
        if (state.geomCache.has(key)) return state.geomCache.get(key);

        // centro del cubo en unidades de modelo convertido a mundo (y-up, fwd -z)
        let cx = (x + w0 / 2) / 16, cy = -(y + h0 / 2) / 16, cz = -(z + d0 / 2) / 16;
        if (invert.includes('x')) cx = -cx;
        if (invert.includes('y')) cy = -cy;

        const rects = faceRects(box.textureOffset[0], box.textureOffset[1], w0, h0, d0);
        const mirrorU = String(box.mirrorTexture || '').includes('u');

        const hx = w / 32, hy = h / 32, hz = d / 32;
        const faceDefs = [
            { n: [1, 0, 0], c: [cx + hx, cy, cz], u: [0, 0, -hz], v: [0, -hy, 0] },
            { n: [-1, 0, 0], c: [cx - hx, cy, cz], u: [0, 0, hz], v: [0, -hy, 0] },
            { n: [0, 1, 0], c: [cx, cy + hy, cz], u: [hx, 0, 0], v: [0, 0, hz] },
            { n: [0, -1, 0], c: [cx, cy - hy, cz], u: [hx, 0, 0], v: [0, 0, -hz] },
            { n: [0, 0, 1], c: [cx, cy, cz + hz], u: [-hx, 0, 0], v: [0, -hy, 0] },
            { n: [0, 0, -1], c: [cx, cy, cz - hz], u: [hx, 0, 0], v: [0, -hy, 0] }
        ];
        const pos = new Float32Array(24 * 3);
        const nor = new Float32Array(24 * 3);
        const uvs = new Float32Array(24 * 2);
        const idx = new Uint16Array(36);
        faceDefs.forEach((fd, f) => {
            const [ru, rv, rw, rh] = rects[f];
            const u0 = ru / texW, u1 = (ru + rw) / texW;
            const v1 = 1 - rv / texH, v0 = 1 - (rv + rh) / texH;
            const uCorner = [[u0, v1], [u1, v1], [u0, v0], [u1, v0]];
            if (mirrorU) for (const c of uCorner) c[0] = u0 + u1 - c[0];
            for (let vi = 0; vi < 4; vi++) {
                const o = f * 4 + vi;
                const sx = (vi & 1) ? 1 : -1, sy = (vi >> 1) ? 1 : -1;
                pos[o * 3] = fd.c[0] + fd.u[0] * sx + fd.v[0] * sy;
                pos[o * 3 + 1] = fd.c[1] + fd.u[1] * sx + fd.v[1] * sy;
                pos[o * 3 + 2] = fd.c[2] + fd.u[2] * sx + fd.v[2] * sy;
                nor[o * 3] = fd.n[0]; nor[o * 3 + 1] = fd.n[1]; nor[o * 3 + 2] = fd.n[2];
                uvs[o * 2] = uCorner[vi][0]; uvs[o * 2 + 1] = uCorner[vi][1];
            }
            const b = f * 4, q = f * 6;
            idx[q] = b; idx[q + 1] = b + 1; idx[q + 2] = b + 2;
            idx[q + 3] = b + 1; idx[q + 4] = b + 3; idx[q + 5] = b + 2;
        });
        const geo = new ctors.BufferGeometry();
        geo.setAttribute('position', new ctors.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new ctors.BufferAttribute(nor, 3));
        geo.setAttribute('uv', new ctors.BufferAttribute(uvs, 2));
        geo.setIndex(new ctors.BufferAttribute(idx, 1));
        state.geomCache.set(key, geo);
        return geo;
    }

    // ── parseo del cat.jem ─────────────────────────────────────────────────
    function loadJem() {
        if (state.jemPromise) return state.jemPromise;
        state.jemPromise = fetch(getURL(JEM_PATH), { cache: 'force-cache' })
            .then(r => { if (!r.ok) throw new Error('jem ' + r.status); return r.text(); })
            .then(text => {
                // el jem trae caracteres de control crudos dentro de strings: sanear
                const clean = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ');
                return JSON.parse(clean);
            });
        state.jemPromise.catch(() => { state.jemPromise = null; });
        return state.jemPromise;
    }

    // translate CEM -> unidades de mundo (y-up, fwd -z), con invertAxis del pack
    function convTranslate(t, invert) {
        let [x, y, z] = t;
        if (invert.includes('x')) x = -x;
        if (invert.includes('y')) y = -y;
        return [x / 16, -y / 16, -z / 16];
    }

    // construye el árbol del jem: devuelve { root, bones }
    function buildCatTree(ctors, jem, texW, texH) {
        const root = new ctors.Object3D();
        root.name = 'mf-critter-root';
        const bones = {};
        const buildPart = (part, parent) => {
            const invert = String(part.invertAxis || '');
            const t = convTranslate(part.translate || [0, 0, 0], invert);

            const outer = new ctors.Object3D();
            outer.name = part.id || part.part || 'part';
            outer.position.set(t[0], t[1], t[2]);
            parent.add(outer);

            // rotación base del pack (grados) en grupo interno: el sync de pivots
            // escribe en `outer`, así la pose base del pack no se pisa
            let geoParent = outer;
            if (part.rotate) {
                const inner = new ctors.Object3D();
                const [rx, ry, rz] = part.rotate;
                inner.rotation.set(-rx * Math.PI / 180, ry * Math.PI / 180, -rz * Math.PI / 180);
                outer.add(inner);
                geoParent = inner;
            }

            for (const box of (part.boxes || [])) {
                const geo = buildCubeGeometry(ctors, box, texW, texH, invert);
                const mesh = new ctors.Mesh(geo, state.catMaterial);
                geoParent.add(mesh);
            }
            if (bones[part.id]) bones[part.id + '_2'] = outer; else bones[part.id] = outer;

            for (const sub of (part.submodels || [])) buildPart(sub, outer);
        };
        for (const part of jem.models) buildPart(part, root);
        return { root, bones };
    }

    // huesos del pack -> pivots del juego (misma rotación mundial por frame)
    const BONE_PIVOT_MAP = [
        ['head', 'headPivot'],
        ['body', 'bodyTilt'],
        ['tail', 'tailJoint'],
        ['tail2', 'tailJoint'],
        ['front_left_leg', 'leftShoulder'],
        ['front_right_leg', 'rightShoulder'],
        ['back_left_leg', 'leftHip'],
        ['back_right_leg', 'rightHip']
    ];

    // ── procesado por entidad ──────────────────────────────────────────────
    function entKeyOf(ent) {
        try { return String(ent.uuid || ent.id || ''); } catch (_) { return ''; }
    }

    function basenameOfUrl(url) {
        const m = /([^/]+\.png)$/.exec(String(url || ''));
        return m ? m[1] : null;
    }

    function findCatVariant(ent) {
        let found = null;
        try {
            ent.mesh?.traverse?.(o => {
                if (found) return;
                const src = o.material?.map?.image?.src || '';
                const m = /entity\/cat\/([a-z_]+)\.png/.exec(src);
                if (m) found = m[1];
            });
        } catch (_) {}
        return found;
    }

    function processCat(ent) {
        const variant = findCatVariant(ent);
        if (!variant) return false;
        const pool = INVENTORY.cat[variant];
        if (!pool || !pool.length) return false;

        const entKey = entKeyOf(ent);
        let assign = entKey ? recallAssignment(entKey) : null;
        if (!assign || assign.kind !== 'cat' || assign.variant !== variant || !pool.includes(assign.file)) {
            assign = { kind: 'cat', variant, file: pool[(Math.random() * pool.length) | 0] };
            if (entKey) rememberAssignment(entKey, assign);
        }

        const ctors = grabCtors(ent);
        if (!ctors) return false;

        const url = getURL(CAT_TEX_DIR + assign.file);
        Promise.all([loadTexture(url), loadJem()]).then(([tex, jem]) => {
            if (state.destroyFlag || !ent.mesh || state.recs.has(ent)) return;
            if (!state.filterRef && ent.meshes?.head?.material?.map) {
                const ref = ent.meshes.head.material.map;
                state.filterRef = { magFilter: ref.magFilter, minFilter: ref.minFilter, generateMipmaps: ref.generateMipmaps };
            }
            // material compartido por variante (todas las partes usan el mismo)
            if (!state.catMaterial || state.catMaterial.__mfVariant !== url) {
                state.catMaterial = new ctors.Material({ map: tex });
                state.catMaterial.__mfVariant = url;
                state.geomCache.clear();
            }
            const texW = jem.textureSize?.[0] || 2000, texH = jem.textureSize?.[1] || 32;
            const tree = buildCatTree(ctors, jem, texW, texH);
            // ocultar los meshes vanilla del gato (el collar aparte se queda; el no tuvo la culpa)
            for (const name of CAT_MESHES) {
                const m = ent.meshes?.[name];
                if (m) m.visible = false;
            }
            tree.root.name = 'mf-critter-model';
            ent.mesh.add(tree.root);
            const rec = {
                kind: 'cat', ent, variant, file: assign.file,
                root: tree.root, bones: tree.bones,
                pivots: {
                    headPivot: ent.headPivot, bodyTilt: ent.bodyTilt, tailJoint: ent.tailJoint,
                    leftShoulder: ent.leftShoulder, rightShoulder: ent.rightShoulder,
                    leftHip: ent.leftHip, rightHip: ent.rightHip
                }
            };
            state.recs.set(ent, rec);
            state.live.add(rec);
            if (!state.firstHit) { state.firstHit = true; console.info(TAG, 'primer gato reemplazado:', variant, assign.file); }
        }).catch(err => console.warn(TAG, 'cat fail:', err?.message || err));
        return true;
    }

    function applyWolfState(rec, force) {
        // el juego cambia el map al domar/enojar: si ya no es el nuestro,
        // releer el estado y servir la variante correspondiente
        const current = rec.mats[0]?.map;
        if (!current) return;
        if (!force && current === rec.ourMap) return;
        const vanilla = mapBasename(current);
        const st = vanilla === 'wolf_tame.png' ? 'tame' : vanilla === 'wolf_angry.png' ? 'angry' : 'normal';
        if (!force && st === rec.lastState && current === rec.ourMap) return;
        rec.lastState = st;
        const file = rec.combo.files[st] || rec.combo.files.normal;
        loadTexture(getURL(WOLF_TEX_DIR + file)).then(tex => {
            if (state.destroyFlag) return;
            if (!state.filterRef && rec.mats[0]?.map) {
                const ref = rec.mats[0].map;
                state.filterRef = { magFilter: ref.magFilter, minFilter: ref.minFilter, generateMipmaps: ref.generateMipmaps };
            }
            for (const mat of rec.mats) { mat.map = tex; mat.needsUpdate = true; }
            rec.ourMap = tex;
            if (!state.firstHit) { state.firstHit = true; console.info(TAG, 'primer lobo re-texturizado:', rec.combo.breed || 'wolf', rec.combo.n, st); }
        }).catch(() => {});
    }

    function processWolf(ent) {
        const mats = [];
        try {
            ent.mesh?.traverse?.(o => {
                const mat = o.material;
                if (!mat?.map) return;
                if (mats.includes(mat)) return;
                if (VANILLA_WOLF_MAPS.has(mapBasename(mat.map))) mats.push(mat);
            });
        } catch (_) {}
        if (!mats.length) return false;

        const entKey = entKeyOf(ent);
        let assign = entKey ? recallAssignment(entKey) : null;
        if (!assign || assign.kind !== 'wolf' || !INVENTORY.wolf.some(c => c.breed === assign.breed && c.n === assign.n)) {
            const combo = INVENTORY.wolf[(Math.random() * INVENTORY.wolf.length) | 0];
            assign = { kind: 'wolf', breed: combo.breed, n: combo.n };
            if (entKey) rememberAssignment(entKey, assign);
        }
        const combo = INVENTORY.wolf.find(c => c.breed === assign.breed && c.n === assign.n);
        if (!combo) return false;

        const ctors = grabCtors(ent);
        if (!ctors) return false;

        const rec = state.recs.get(ent) || { kind: 'wolf', ent, mats: [], ourMap: null, lastState: null };
        rec.mats = mats;
        rec.combo = combo;
        applyWolfState(rec, true);
        state.recs.set(ent, rec);
        state.live.add(rec);
        return true;
    }

    function processEntity(ent) {
        if (!ent || ent.type === 'player' || !ent.mesh || state.recs.has(ent)) return;
        try {
            if (ent.meshes?.snout) { processWolf(ent); return; }
            if (ent.meshes?.torso && ent.meshes?.tail1) { processCat(ent); return; }
        } catch (err) {
            const now = performance.now();
            if (now - state.warnThrottle > 10000) {
                state.warnThrottle = now;
                console.warn(TAG, 'process fail:', err?.message || err);
            }
        }
    }

    function scan() {
        if (state.destroyFlag || !state.enabled) return;
        refreshGame();
        const ents = state.game?.world?.entities;
        if (!ents) return;
        const seen = new Set();
        try {
            if (typeof ents.forEach === 'function') {
                ents.forEach(ent => {
                    if (!ent || !ent.mesh) return;
                    seen.add(ent);
                    processEntity(ent);
                });
            } else if (typeof ents[Symbol.iterator] === 'function') {
                for (const ent of ents) {
                    if (!ent || !ent.mesh) continue;
                    seen.add(ent);
                    processEntity(ent);
                }
            }
        } catch (_) {}
        // limpiar recs de entidades que ya no están + wolf state re-check
        for (const rec of [...state.live]) {
            if (!seen.has(rec.ent) || !rec.ent.mesh) {
                try { if (rec.root) rec.root.parent?.remove(rec.root); } catch (_) {}
                try { if (rec.kind === 'cat' && rec.ent.meshes) for (const name of CAT_MESHES) { const m = rec.ent.meshes[name]; if (m) m.visible = true; } } catch (_) {}
                state.recs.delete(rec.ent);
                state.live.delete(rec);
            } else if (rec.kind === 'wolf') {
                applyWolfState(rec, false);
            }
        }
    }

    // ── sync de animación (rotación mundial de pivots -> huesos del pack) ──
    const _q = { root: null, tmp: null };
    function syncCats() {
        for (const rec of state.live) {
            if (rec.kind !== 'cat') continue;
            try {
                const ent = rec.ent;
                if (!ent.mesh || !rec.root.parent) continue;
                if (!_q.root) {
                    _q.root = new ent.mesh.quaternion.constructor();
                    _q.tmp = new ent.mesh.quaternion.constructor();
                }
                ent.mesh.getWorldQuaternion(_q.root).invert();
                for (const [boneName, pivotName] of BONE_PIVOT_MAP) {
                    const bone = rec.bones[boneName];
                    const pivot = rec.pivots[pivotName];
                    if (!bone || !pivot) continue;
                    pivot.getWorldQuaternion(_q.tmp);
                    bone.quaternion.copy(_q.tmp.premultiply(_q.root));
                }
            } catch (_) {}
        }
    }

    function rafLoop() {
        if (state.destroyFlag || !state.enabled) return;
        syncCats();
        state.rafId = requestAnimationFrame(rafLoop);
    }

    // ── control ────────────────────────────────────────────────────────────
    function start() {
        if (state.destroyFlag) return;
        state.enabled = true;
        refreshGame();
        if (!state.scanTimer) state.scanTimer = setInterval(scan, 500);
        if (!state.rafId) state.rafId = requestAnimationFrame(rafLoop);
        scan();
        console.info(TAG, 'activo — lobos con variante random persistente + gatos con modelo del pack');
    }

    function stop() {
        state.enabled = false;
        if (state.scanTimer) { clearInterval(state.scanTimer); state.scanTimer = 0; }
        if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
        for (const rec of [...state.live]) {
            try { if (rec.root) rec.root.parent?.remove(rec.root); } catch (_) {}
            try { if (rec.kind === 'cat' && rec.ent.meshes) for (const name of CAT_MESHES) { const m = rec.ent.meshes[name]; if (m) m.visible = true; } } catch (_) {}
            state.recs.delete(rec.ent);
        }
        state.live.clear();
    }

    function resetMemory(serverPrefix) {
        try {
            if (!serverPrefix) { localStorage.removeItem(STORAGE_KEY); return true; }
            const store = loadStore();
            for (const sk of Object.keys(store)) {
                if (sk.startsWith(serverPrefix)) delete store[sk];
            }
            saveStore(store);
            return true;
        } catch (_) { return false; }
    }

    function status() {
        let cats = 0, wolves = 0;
        for (const rec of state.live) { if (rec.kind === 'cat') cats++; else wolves++; }
        return { enabled: state.enabled, cats, wolves, cachedTex: state.texCache.size, game: !!state.game };
    }

    function destroy() {
        state.destroyFlag = true;
        stop();
        state.texCache.clear();
        state.geomCache.clear();
        try { delete window.MF_CritterSkins; } catch (_) {}
        try { delete window.__MF_CRITTER_SCOPE__; } catch (_) {}
    }

    document.addEventListener('minifeather:critterskins-config', (ev) => {
        try {
            const cfg = JSON.parse(ev.detail || '{}');
            if (cfg.enabled === true) start();
            else if (cfg.enabled === false) stop();
        } catch (_) {}
    });

    window.MF_CritterSkins = { start, stop, status, resetMemory };
    window.__MF_CRITTER_SCOPE__ = { destroy };
    console.info(TAG, 'módulo cargado (inactivo hasta minifeather:critterskins-config {enabled:true})');
})();
