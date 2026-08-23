(function () {
    'use strict';

    const TAG = '[MiniFeather CustomModels]';
    const state = {
        enabled: true,
        mappings: {},
        ctors: null,
        textureCache: new Map(),
        applied: new WeakMap(),
        loading: new Set()
    };

    try {
        state.enabled = localStorage.getItem('miniblox_custommodels') !== 'false';
        state.mappings = JSON.parse(localStorage.getItem('miniblox_custommodels_map') || '{}');
    } catch {}

    window.MF_CustomModels = {
        get enabled() { return state.enabled; },
        set enabled(v) {
            state.enabled = !!v;
            try { localStorage.setItem('miniblox_custommodels', String(state.enabled)); } catch {}
            rescan();
        },
        get mappings() { return state.mappings; },
        set(entityName, modelFile) {
            if (modelFile == null) delete state.mappings[entityName];
            else state.mappings[entityName] = modelFile;
            try { localStorage.setItem('miniblox_custommodels_map', JSON.stringify(state.mappings)); } catch {}
            rescan();
        },
        remove(entityName) { window.MF_CustomModels.set(entityName, null); },
        clear() {
            state.mappings = {};
            try { localStorage.setItem('miniblox_custommodels_map', '{}'); } catch {}
            rescan();
            console.log(TAG + ' todos los mapeos restaurados.');
        },
        list() {
            console.log(TAG + ' mapeos: ' + JSON.stringify(state.mappings));
            return state.mappings;
        },
        get yawSign() { return state.yawSign; },
        set yawSign(v) { state.yawSign = v < 0 ? -1 : 1; },
        rescan
    };
    state.yawSign = 1;

    function getGame() {
        if (globalThis.miniblox?.player) return globalThis.miniblox;
        try {
            const react = document.querySelector('#react');
            if (!react) return null;
            for (const root of Object.values(react)) {
                const game = root?.updateQueue?.baseState?.element?.props?.game;
                if (game?.player) return game;
            }
        } catch {}
        return null;
    }

    function findHandRenderer(game) {
        try {
            const cam = game?.gameScene?.axesHelper?.parent;
            for (const child of cam?.children ?? []) {
                if (typeof child?.updateArmAnimation === 'function' && child.item && child.rightArm) {
                    return child;
                }
            }
        } catch {}
        return null;
    }

    function grabCtors() {
        if (state.ctors) return state.ctors;
        try {
            const lf = findHandRenderer(getGame());
            const arm = lf?.rightArm;
            if (!arm?.geometry?.attributes?.position) return null;
            const armMat = arm.material;
            state.ctors = {
                Mesh: arm.constructor,
                Group: lf.constructor,
                BufferGeometry: arm.geometry.constructor,
                BufferAttribute: arm.geometry.attributes.position.constructor,
                Material: armMat.constructor,
                Texture: armMat.map?.constructor
            };
            return state.ctors;
        } catch {
            return null;
        }
    }

    function parseGLB(buffer) {
        const dv = new DataView(buffer);
        if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('magic invalido (no es GLB)');
        const total = dv.getUint32(8, true);
        let json = null;
        let bin = null;
        let off = 12;
        while (off < total) {
            const len = dv.getUint32(off, true);
            const type = dv.getUint32(off + 4, true);
            const start = off + 8;
            if (type === 0x4e4f534a) {
                json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
            } else if (type === 0x004e4942) {
                bin = buffer.slice(start, start + len);
            }
            off = start + len;
        }
        if (!json) throw new Error('GLB sin chunk JSON');
        if (!bin) bin = new ArrayBuffer(0);
        return { json, bin };
    }

    function readAccessor(parsed, acc) {
        const { json: gltf, bin } = parsed;
        const dv = new DataView(bin);
        const sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
        const reads = {
            5120: (o) => dv.getInt8(o),
            5121: (o) => dv.getUint8(o),
            5122: (o) => dv.getInt16(o, true),
            5123: (o) => dv.getUint16(o, true),
            5125: (o) => dv.getUint32(o, true),
            5126: (o) => dv.getFloat32(o, true)
        };
        const numC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
        const comp = sizes[acc.componentType];
        const read = reads[acc.componentType];
        const bv = gltf.bufferViews[acc.bufferView || 0];
        const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        const tight = comp * numC;
        const stride = bv.byteStride || tight;
        const isFloatIdx = acc.componentType === 5126;
        const out = isFloatIdx ? new Float32Array(acc.count * numC) : new Uint32Array(acc.count * numC);
        for (let i = 0; i < acc.count; i++) {
            const row = base + i * stride;
            for (let j = 0; j < numC; j++) out[i * numC + j] = read(row + j * comp);
        }
        return out;
    }

    function mat4Identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }

    function mat4Mul(a, b) {
        const o = new Array(16);
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
            }
        }
        return o;
    }

    function nodeMatrix(node) {
        if (node.matrix) return node.matrix.slice();
        const m = mat4Identity();
        if (node.scale) {
            m[0] = node.scale[0]; m[5] = node.scale[1]; m[10] = node.scale[2];
        }
        if (node.rotation) {
            const [x, y, z, w] = node.rotation;
            const x2 = x + x, y2 = y + y, z2 = z + z;
            const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
            const r = [1 - (yy + zz), xy + wz, xz - wy, 0, xy - wz, 1 - (xx + zz), yz + wx, 0, xz + wy, yz - wx, 1 - (xx + yy), 0, 0, 0, 0, 1];
            const s = [m[0], 0, 0, 0, 0, m[5], 0, 0, 0, 0, m[10], 0, 0, 0, 0, 1];
            const rs = mat4Mul(r, s);
            if (node.translation) { rs[12] = node.translation[0]; rs[13] = node.translation[1]; rs[14] = node.translation[2]; }
            return rs;
        }
        if (node.translation) { m[12] = node.translation[0]; m[13] = node.translation[1]; m[14] = node.translation[2]; }
        return m;
    }

    async function getTextureFor(parsed, texIndex, ctors) {
        const { json: gltf, bin } = parsed;
        const texDef = gltf.textures?.[texIndex];
        const imgDef = texDef && gltf.images?.[texDef.source];
        if (!imgDef) return null;
        const key = texDef.source;
        if (state.textureCache.has(key)) return state.textureCache.get(key);

        let bytes = null;
        if (imgDef.bufferView != null) {
            const bv = gltf.bufferViews[imgDef.bufferView];
            bytes = new Uint8Array(bin, bv.byteOffset || 0, bv.byteLength);
        } else if (typeof imgDef.uri === 'string' && imgDef.uri.startsWith('data:')) {
            const b64 = imgDef.uri.slice(imgDef.uri.indexOf(',') + 1);
            const raw = atob(b64);
            bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        }
        if (!bytes || !ctors.Texture) return null;

        const promise = (async () => {
            let bitmap = null;
            try {
                bitmap = await createImageBitmap(new Blob([bytes], { type: imgDef.mimeType || 'image/png' }));
            } catch {
                return null;
            }
            const tex = new ctors.Texture();
            tex.image = bitmap;
            tex.needsUpdate = true;
            if ('flipY' in tex) tex.flipY = false;
            const SRGB = 'srgb';
            try { if ('colorSpace' in tex) tex.colorSpace = SRGB; } catch {}
            state.textureCache.set(key, tex);
            return tex;
        })();
        state.textureCache.set(key, promise);
        return promise;
    }

    async function buildMaterial(parsed, prim, ctors, fallbackMat) {
        const { json: gltf } = parsed;
        const matDef = gltf.materials?.[prim.material] || {};
        let mat = null;
        try {
            mat = fallbackMat.clone();
            if (mat) {
                if ('vertexColors' in mat) mat.vertexColors = false;
                if ('map' in mat) mat.map = null;
                if ('alphaTest' in mat) mat.alphaTest = 0;
                if ('transparent' in mat) mat.transparent = false;
                if ('fog' in mat) mat.fog = false;
                if (mat.color?.set) mat.color.set(0xffffff);
            }
        } catch {
            mat = null;
        }
        if (!mat) {
            try { mat = new ctors.Material(); } catch { return null; }
        }
        try {
            const pbr = matDef.pbrMetallicRoughness || {};
            if (pbr.baseColorTexture != null) {
                const tex = await getTextureFor(parsed, pbr.baseColorTexture.index, ctors);
                if (tex) mat.map = tex;
            }
            if (pbr.baseColorFactor && 'color' in mat && mat.color?.setRGB) {
                const [r, g, b, a] = pbr.baseColorFactor;
                if (!mat.map) mat.color.setRGB(r, g, b);
                if (a < 1 && 'opacity' in mat) { mat.opacity = a; mat.transparent = true; }
            }
            if (matDef.alphaMode === 'BLEND') { mat.transparent = true; }
            if (matDef.alphaMode === 'MASK') { mat.alphaTest = matDef.alphaCutoff ?? 0.5; }
            if (matDef.doubleSided && 'side' in mat) mat.side = 2;
            mat.needsUpdate = true;
        } catch {}
        return mat;
    }

    async function buildPrimitive(parsed, prim, ctors, fallbackMat) {
        const { json: gltf } = parsed;
        const Attr = ctors.BufferAttribute;
        const geo = new ctors.BufferGeometry();
        const pos = readAccessor(parsed, gltf.accessors[prim.attributes.POSITION]);
        geo.setAttribute('position', new Attr(pos, 3));
        if (prim.attributes.NORMAL != null) {
            geo.setAttribute('normal', new Attr(readAccessor(parsed, gltf.accessors[prim.attributes.NORMAL]), 3));
        } else {
            try { geo.computeVertexNormals(); } catch {}
        }
        if (prim.attributes.TEXCOORD_0 != null) {
            geo.setAttribute('uv', new Attr(readAccessor(parsed, gltf.accessors[prim.attributes.TEXCOORD_0]), 2));
        }
        if (prim.attributes.COLOR_0 != null) {
            const nComp = gltf.accessors[prim.attributes.COLOR_0].type === 'VEC4' ? 4 : 3;
            geo.setAttribute('color', new Attr(readAccessor(parsed, gltf.accessors[prim.attributes.COLOR_0]), nComp));
        }
        if (prim.indices != null) {
            const idxAcc = gltf.accessors[prim.indices];
            const idx = readAccessor(parsed, idxAcc);
            const arr = idxAcc.componentType === 5123 ? new Uint16Array(idx) : new Uint32Array(idx);
            geo.setIndex(new Attr(arr, 1));
        }
        const mat = await buildMaterial(parsed, prim, ctors, fallbackMat);
        if (!mat) return null;
        return new ctors.Mesh(geo, mat);
    }

    async function buildScene(parsed, ctors, fallbackMat) {
        const { json: gltf } = parsed;
        const root = new ctors.Group();
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        async function addNode(idx, parentGroup, parentMat) {
            const node = gltf.nodes?.[idx];
            if (!node) return;
            const worldMat = mat4Mul(parentMat, nodeMatrix(node));
            const g = new ctors.Group();
            if (node.matrix) {
                const m = node.matrix;
                g.position.set(m[12], m[13], m[14]);
            } else {
                if (node.translation) g.position.fromArray(node.translation);
                if (node.rotation) g.quaternion.fromArray(node.rotation);
                if (node.scale) g.scale.fromArray(node.scale);
            }
            if (node.mesh != null) {
                const meshDef = gltf.meshes[node.mesh];
                for (const prim of meshDef.primitives || []) {
                    if (prim.mode != null && prim.mode !== 4) continue;
                    const built = await buildPrimitive(parsed, prim, ctors, fallbackMat);
                    if (built) g.add(built);
                    const posAcc = gltf.accessors[prim.attributes.POSITION];
                    if (posAcc) {
                        const pos = readAccessor(parsed, posAcc);
                        for (let i = 0; i < pos.length; i += 3) {
                            const px = worldMat[0] * pos[i] + worldMat[4] * pos[i + 1] + worldMat[8] * pos[i + 2] + worldMat[12];
                            const py = worldMat[1] * pos[i] + worldMat[5] * pos[i + 1] + worldMat[9] * pos[i + 2] + worldMat[13];
                            const pz = worldMat[2] * pos[i] + worldMat[6] * pos[i + 1] + worldMat[10] * pos[i + 2] + worldMat[14];
                            if (px < min[0]) min[0] = px; if (px > max[0]) max[0] = px;
                            if (py < min[1]) min[1] = py; if (py > max[1]) max[1] = py;
                            if (pz < min[2]) min[2] = pz; if (pz > max[2]) max[2] = pz;
                        }
                    }
                }
            }
            parentGroup.add(g);
            for (const c of node.children || []) await addNode(c, g, worldMat);
        }

        const sceneIdx = gltf.scene ?? 0;
        for (const n of gltf.scenes?.[sceneIdx]?.nodes || []) await addNode(n, root, mat4Identity());

        const height = max[1] - min[1];
        return { root, height, minY: min[1] };
    }

    const modelCache = new Map();
    const pendingFetches = new Map();
    let reqSeq = 0;

    document.addEventListener('minifeather:model-fetch-response', (e) => {
        try {
            const { nonce, url, ok, status } = JSON.parse(e.detail);
            const p = pendingFetches.get(nonce);
            if (!p) return;
            pendingFetches.delete(nonce);
            if (ok) p.resolve(url);
            else p.reject(new Error('HTTP ' + status + ' para el modelo (via puente)'));
        } catch {}
    });

    function bridgeFetchUrl(file) {
        return new Promise((resolve, reject) => {
            const nonce = 'mf' + (++reqSeq) + '_' + Date.now();
            pendingFetches.set(nonce, { resolve, reject });
            document.dispatchEvent(new CustomEvent('minifeather:model-fetch-request', { detail: JSON.stringify({ nonce, file }) }));
            setTimeout(() => {
                if (pendingFetches.has(nonce)) {
                    pendingFetches.delete(nonce);
                    reject(new Error('timeout esperando al puente de modelos'));
                }
            }, 8000);
        });
    }

    async function fetchModelArrayBuffer(file) {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
            const resp = await fetch(chrome.runtime.getURL('models/entities/' + file));
            if (!resp.ok) throw new Error('HTTP ' + resp.status + ' para ' + file);
            return resp.arrayBuffer();
        }
        const url = await bridgeFetchUrl(file);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ' para ' + file);
        return resp.arrayBuffer();
    }

    async function loadModel(file) {
        if (modelCache.has(file)) return modelCache.get(file);
        const p = (async () => {
            const buf = await fetchModelArrayBuffer(file);
            const parsed = parseGLB(buf);
            const ctors = grabCtors();
            if (!ctors) throw new Error('constructores Three no disponibles todavia');
            const game = getGame();
            const lf = findHandRenderer(game);
            const built = await buildScene(parsed, ctors, lf?.rightArm?.material);
            if (!built.root.children.length) throw new Error('GLB sin geometria visible');
            return built;
        })();
        modelCache.set(file, p);
        p.catch(() => modelCache.delete(file));
        return p;
    }

    function applyToEntity(entity) {
        const name = entity.type || entity.constructor?.name;
        if (name === 'player' || name === 'Player' || entity.id === getGame()?.player?.id) return;
        const file = state.mappings[name];
        const mesh = entity.mesh;
        if (!mesh) return;
        const rec = state.applied.get(mesh);

        if (!file || !state.enabled) {
            if (rec) {
                try { rec.root.parent?.remove(rec.root); } catch {}
                for (const c of rec.hidden) c.visible = true;
                if (rec.origRender) mesh.render = rec.origRender;
                state.applied.delete(mesh);
                console.log(TAG + ' restaurado: ' + name);
            }
            return;
        }

        if (rec && rec.file === file) {
            if (rec.root.parent === mesh) return;
            try { rec.root.parent?.remove(rec.root); } catch {}
            for (const c of rec.hidden) c.visible = true;
            if (rec.origRender && mesh.render === rec.wrapper) mesh.render = rec.origRender;
            state.applied.delete(mesh);
        } else if (rec) {
            try { rec.root.parent?.remove(rec.root); } catch {}
            for (const c of rec.hidden) c.visible = true;
            if (rec.origRender && mesh.render === rec.wrapper) mesh.render = rec.origRender;
            state.applied.delete(mesh);
        }
        const key = name + '|' + file;
        if (state.loading.has(key)) return;
        state.loading.add(key);

        loadModel(file).then((built) => {
            if (rec) {
                try { rec.root.parent?.remove(rec.root); } catch {}
                for (const c of rec.hidden) c.visible = true;
                if (rec.origRender && mesh.render === rec.wrapper) mesh.render = rec.origRender;
            }
            const hidden = [];
            for (const child of [...mesh.children]) {
                child.visible = false;
                hidden.push(child);
            }
            let root;
            try {
                root = built.root.clone(true);
            } catch {
                root = built.root;
            }
            const entityHeight = entity.height || 1.8;
            if (built.height > 0 && Math.abs(built.height - entityHeight) / entityHeight > 0.25) {
                const s = entityHeight / built.height;
                root.scale.setScalar(s);
            }
            root.position.y = -built.minY * root.scale.y;
            mesh.add(root);

            const origRender = mesh.render;
            const yawSign = state.yawSign ?? 1;
            const wrapper = function (...args) {
                origRender?.apply(this, args);
                try {
                    root.rotation.y = yawSign * -(this.entity?.renderYawOffset ?? this.entity?.yaw ?? 0);
                } catch {}
            };
            mesh.render = wrapper;

            state.applied.set(mesh, { file, root, hidden, origRender, wrapper });
            console.log(TAG + ' ' + name + ' -> ' + file + ' (alto modelo=' + built.height.toFixed(2) + ', entidad=' + entityHeight + ')');
        }).catch((e) => {
            console.warn(TAG + ' fallo ' + name + ' -> ' + file + ': ' + (e?.message || e));
        }).finally(() => state.loading.delete(key));
    }

    function rescan() {
        const game = getGame();
        if (!game?.world) return;
        const seen = new Set();
        try { game.world.entities?.forEach?.((e) => { if (e?.mesh) { seen.add(e.mesh); applyToEntity(e); } }); } catch {}
        try {
            for (const p of game.world.playersIterator?.() ?? []) {
                if (p?.mesh && !seen.has(p.mesh)) applyToEntity(p);
            }
        } catch {}
    }

    setInterval(() => {
        if (!state.enabled && Object.keys(state.mappings).length === 0) return;
        try { rescan(); } catch {}
    }, 2000);

    console.log(TAG + ' cargado. Ejemplos:');
    console.log(TAG + "  MF_CustomModels.set('pig', 'mipuerco.glb')");
    console.log(TAG + "  MF_CustomModels.remove('pig')");
    console.log(TAG + '  MF_CustomModels.list()');
    console.log(TAG + ' Carpeta: models/entities/ del client (recarga la extension al agregar archivos)');
})();
