(function () {
    'use strict';

    const TAG = '[MiniFeather CustomModels]';
    const state = {
        enabled: true,
        mappings: {},
        ctors: null,
        textureCache: new Map(),
        applied: new WeakMap(),
        loading: new Set(),
        customs: new Map(),
        customSeq: 0
    };

    try {
        state.enabled = localStorage.getItem('miniblox_custommodels') !== 'false';
        state.mappings = JSON.parse(localStorage.getItem('miniblox_custommodels_map') || '{}');
        state.entityAnims = JSON.parse(localStorage.getItem('miniblox_custommodels_anims') || '{}');
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
        setEntityAnim(entityName, animName, speed) {
            state.entityAnims = state.entityAnims || {};
            if (animName == null) delete state.entityAnims[entityName];
            else state.entityAnims[entityName] = animName;
            if (speed != null) state.animSpeed = +speed;
            try { localStorage.setItem('miniblox_custommodels_anims', JSON.stringify(state.entityAnims)); } catch {}
            rescan();
            console.log(TAG + ' anim de "' + entityName + '": ' + (animName || '(ninguna)'));
        },
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
        spawn(modelFile, x, y, z, opts = {}) {
            const id = opts.id || ('custom' + (++state.customSeq));
            if (state.customs.has(id)) {
                try { state.customs.get(id).root?.parent?.remove(state.customs.get(id).root); } catch {}
                state.customs.delete(id);
            }
            const rec = {
                id, file: modelFile,
                pos: { x: +x || 0, y: +y || 0, z: +z || 0 },
                yaw: +(opts.yaw || 0),
                scale: +(opts.scale || 1),
                height: +(opts.height || 0),
                bob: !!opts.bob,
                followPlayer: !!opts.followPlayer,
                followOffset: opts.followOffset ? { ...opts.followOffset } : null,
                stopDistance: +(opts.stopDistance || 0),
                bodyHalf: +(opts.bodyHalf || 0.21),
                autoAnim: !!opts.autoAnim,
                yawOffset: +(opts.yawOffset || 0),
                smooth: opts.smooth !== false,
                maxSpeed: +(opts.maxSpeed || 0),
                loseDistance: opts.loseDistance != null ? +opts.loseDistance : 12,
                lostTimeMs: +(opts.lostTimeMs || 5000),
                lost: false,
                lostSince: 0,
                anim: opts.anim || null,
                animSpeed: +(opts.animSpeed || 1),
                root: null, inst: null, animStart: 0
            };
            state.customs.set(id, rec);
            loadModel(modelFile).then((built) => {
                const game = getGame();
                const scene = game?.gameScene?.scene;
                if (!scene) { console.warn(TAG + ' no hay escena para ' + id); return; }
                if (!state.customs.has(id)) return;
                const inst = cloneInstance(built);
                rec.inst = inst;
                rec.root = inst.root;
                if (rec.height > 0 && built.height > 0) {
                    inst.root.scale.multiplyScalar(rec.height / built.height);
                } else if (rec.scale !== 1) {
                    inst.root.scale.multiplyScalar(rec.scale);
                }
                if (rec.anim && !inst.anims.some((a) => a.name === rec.anim)) {
                    console.warn(TAG + ' anim "' + rec.anim + '" no existe en ' + modelFile + '. Disponibles: ' + inst.anims.map((a) => a.name).join(', '));
                    rec.anim = null;
                }
                rec.animStart = performance.now();
                inst.root.position.set(rec.pos.x, rec.pos.y, rec.pos.z);
                disableCullingDeep(inst.root);
                inst.root.matrixAutoUpdate = true;
                scene.add(inst.root);
                const animInfo = inst.anims.length ? ' anims: ' + inst.anims.map((a) => a.name).join(', ') : '';
                console.log(TAG + ' entidad client-side "' + id + '" spawneada' + (rec.anim ? ' animando "' + rec.anim + '"' : '') + animInfo);
            }).catch((e) => {
                console.warn(TAG + ' fallo spawn "' + id + '": ' + (e?.message || e));
                state.customs.delete(id);
            });
            return id;
        },
        setAnim(id, animName, speed) {
            const rec = state.customs.get(id);
            if (!rec) return false;
            if (!rec.inst) { rec.anim = animName; return true; }
            if (animName && !rec.inst.anims.some((a) => a.name === animName)) {
                console.warn(TAG + ' anim "' + animName + '" no existe. Disponibles: ' + rec.inst.anims.map((a) => a.name).join(', '));
                return false;
            }
            if (!animName) { restoreRest(rec.inst); }
            rec.anim = animName || null;
            rec.animStart = performance.now();
            if (speed != null) rec.animSpeed = +speed;
            return true;
        },
        anims(id) {
            const rec = state.customs.get(id) || [...state.customs.values()].find((r) => r.inst);
            if (!rec?.inst) return [];
            const names = rec.inst.anims.map((a) => a.name);
            console.log(TAG + ' anims (' + rec.file + '): ' + names.join(', '));
            return names;
        },
        playAnim(id, animName, ms) {
            const rec = state.customs.get(id);
            if (!rec?.inst) return false;
            if (!rec.inst.anims.some((a) => a.name === animName)) return false;
            const now = performance.now();
            rec.animOverride = { name: animName, start: now, until: now + (+ms || 1500) };
            return true;
        },
        despawn(id) {
            const rec = state.customs.get(id);
            if (!rec) return false;
            rec.dead = true;
            try { rec.root?.parent?.remove(rec.root); } catch {}
            state.customs.delete(id);
            return true;
        },
        move(id, x, y, z, yaw) {
            const rec = state.customs.get(id);
            if (!rec) return false;
            rec.pos.x = +x || 0; rec.pos.y = +y || 0; rec.pos.z = +z || 0;
            if (yaw != null) rec.yaw = +yaw;
            if (rec.root) rec.root.position.set(rec.pos.x, rec.pos.y, rec.pos.z);
            return true;
        },
        listCustoms() {
            const out = {};
            for (const [id, r] of state.customs) out[id] = { file: r.file, pos: { ...r.pos }, yaw: r.yaw, scale: r.scale };
            console.log(TAG + ' entidades client-side: ' + JSON.stringify(out));
            return out;
        },
        followVerity(offset = 1.8, opts = {}) {
            const p = getGame()?.player?.pos;
            if (!p) { console.warn(TAG + ' no hay player aun'); return null; }
            if (state.customs.has('verity')) MF_CustomModels.despawn('verity');
            return MF_CustomModels.spawn('verity_full_model.glb', p.x + offset, p.y, p.z, {
                id: 'verity',
                height: opts.height || 0.85,
                followPlayer: true,
                stopDistance: opts.stopDistance || offset,
                autoAnim: true,
                maxSpeed: opts.maxSpeed || 4.3,
                loseDistance: opts.loseDistance != null ? opts.loseDistance : 12,
                lostTimeMs: opts.lostTimeMs != null ? opts.lostTimeMs : 5000,
                ...opts
            });
        },
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

    function quatFromMat4(m, out) {
        const m00 = m[0], m01 = m[4], m02 = m[8];
        const m10 = m[1], m11 = m[5], m12 = m[9];
        const m20 = m[2], m21 = m[6], m22 = m[10];
        const tr = m00 + m11 + m22;
        let x, y, z, w;
        if (tr > 0) {
            const s = Math.sqrt(tr + 1) * 2;
            w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
        } else if (m00 > m11 && m00 > m22) {
            const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
            w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
        } else if (m11 > m22) {
            const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
            w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
        } else {
            const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
            w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
        }
        out.set(x, y, z, w);
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
        const groups = new Map();
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        async function addNode(idx, parentGroup, parentMat) {
            const node = gltf.nodes?.[idx];
            if (!node) return;
            const worldMat = mat4Mul(parentMat, nodeMatrix(node));
            const g = new ctors.Group();
            groups.set(idx, g);
            if (node.matrix) {
                const m = node.matrix;
                g.position.set(m[12], m[13], m[14]);
                try { quatFromMat4(m, g.quaternion); } catch {}
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
        const anims = buildAnimTracks(parsed);
        return { root, height, minY: min[1], groups, anims };
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

    function composeTRS(p, q, s) {
        const x = q.x, y = q.y, z = q.z, w = q.w;
        const x2 = x + x, y2 = y + y, z2 = z + z;
        const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
        return [
            (1 - (yy + zz)) * s.x, (xy + wz) * s.x, (xz - wy) * s.x, 0,
            (xy - wz) * s.y, (1 - (xx + zz)) * s.y, (yz + wx) * s.y, 0,
            (xz + wy) * s.z, (yz - wx) * s.z, (1 - (xx + yy)) * s.z, 0,
            p.x, p.y, p.z, 1
        ];
    }

    function nodeLocalMatrix(n) {
        try {
            if (n.matrixAutoUpdate === false && n.matrix?.elements) return Array.from(n.matrix.elements);
        } catch {}
        try {
            return composeTRS(n.position || { x: 0, y: 0, z: 0 }, n.quaternion || { x: 0, y: 0, z: 0, w: 1 }, n.scale || { x: 1, y: 1, z: 1 });
        } catch {
            return mat4Identity();
        }
    }

    function measureLocalHeight(obj) {
        let min = Infinity, max = -Infinity;
        (function walk(node, m) {
            const geo = node.geometry;
            const pos = geo?.attributes?.position;
            if (pos?.array) {
                const a = pos.array;
                for (let i = 1; i < a.length; i += 3) {
                    const py = m[1] * a[i - 1] + m[5] * a[i] + m[9] * a[i + 1] + m[13];
                    if (py < min) min = py;
                    if (py > max) max = py;
                }
            }
            const lm = mat4Mul(m, nodeLocalMatrix(node));
            for (const c of node.children || []) walk(c, lm);
        })(obj, mat4Identity());
        return max > min ? max - min : 0;
    }

    function buildAnimTracks(parsed) {
        const { json: gltf } = parsed;
        const anims = [];
        for (const a of gltf.animations || []) {
            const tracks = [];
            let duration = 0;
            for (const ch of a.channels || []) {
                const nodeIdx = ch.target?.node;
                const path = ch.target?.path;
                if (nodeIdx == null || !['translation', 'rotation', 'scale'].includes(path)) continue;
                const smp = a.samplers?.[ch.sampler];
                if (!smp) continue;
                const tAcc = gltf.accessors[smp.input];
                const times = readAccessor(parsed, tAcc);
                const values = readAccessor(parsed, gltf.accessors[smp.output]);
                let bad = 0;
                let lastFinite = null;
                for (let k = 0; k < values.length; k++) {
                    if (Number.isFinite(values[k])) lastFinite = values[k];
                    else { values[k] = lastFinite; bad++; }
                }
                let nextFinite = null;
                for (let k = values.length - 1; k >= 0; k--) {
                    if (Number.isFinite(values[k])) nextFinite = values[k];
                    else if (!Number.isFinite(values[k]) && nextFinite != null) values[k] = nextFinite;
                }
                for (let k = 0; k < times.length; k++) {
                    if (!Number.isFinite(times[k])) { times[k] = 0; bad++; }
                }
                if (bad) console.warn(TAG + ' anim "' + (a.name || '?') + '" track nodo ' + nodeIdx + ': ' + bad + ' keyframes corruptos reparados');
                const maxT = tAcc.max ? tAcc.max[0] : (times.length ? times[times.length - 1] : 0);
                if (maxT > duration) duration = maxT;
                tracks.push({ nodeIdx, path, times, values, interp: smp.interpolation || 'LINEAR', comps: path === 'rotation' ? 4 : 3 });
            }
            if (tracks.length) anims.push({ name: a.name || ('anim' + anims.length), duration, tracks });
        }
        return anims;
    }

    function cloneInstance(built) {
        const map = new Map();
        const root2 = (function cp(orig) {
            const c = orig.clone(false);
            map.set(orig, c);
            for (const k of orig.children) c.add(cp(k));
            return c;
        })(built.root);
        const groups = new Map();
        for (const [idx, g] of built.groups) {
            const n = map.get(g);
            if (n) groups.set(idx, n);
        }
        const rest = [];
        const restScale = new Map();
        for (const g of groups.values()) {
            rest.push({ g, p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.clone() });
            restScale.set(g, g.scale.clone());
        }
        return { root: root2, height: built.height, minY: built.minY, groups, anims: built.anims, rest, restScale, dbg: new Set() };
    }

    function restoreRest(inst) {
        for (const r of inst.rest) {
            r.g.position.copy(r.p);
            r.g.quaternion.copy(r.q);
            r.g.scale.copy(r.s);
        }
    }

    function sampleAnim(inst, animName, t) {
        const anim = inst.anims.find((a) => a.name === animName);
        if (!anim) return false;
        if (anim.duration > 0) t = t % anim.duration;
        else t = 0;
        for (const tr of anim.tracks) {
            const g = inst.groups.get(tr.nodeIdx);
            if (!g) continue;
            const { times, values, comps } = tr;
            let i = 0;
            while (i < times.length - 1 && times[i + 1] <= t) i++;
            const t0 = times[i], t1 = i + 1 < times.length ? times[i + 1] : t0 + 1;
            const last = i + 1 >= times.length;
            const a0 = i * comps, a1 = last ? a0 : (i + 1) * comps;
            let u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
            if (u < 0) u = 0; if (u > 1) u = 1;
            if (tr.interp === 'STEP') u = 0;
            if (tr.path === 'rotation') {
                const x0 = values[a0], y0 = values[a0 + 1], z0 = values[a0 + 2], w0 = values[a0 + 3];
                let x1 = values[a1], y1 = values[a1 + 1], z1 = values[a1 + 2], w1 = values[a1 + 3];
                let d = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1;
                if (d < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; d = -d; }
                if (d > 0.9995) {
                    g.quaternion.set(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u, w0 + (w1 - w0) * u);
                } else {
                    const th = Math.acos(Math.min(1, d)), s = Math.sin(th);
                    const wA = Math.sin((1 - u) * th) / s, wB = Math.sin(u * th) / s;
                    g.quaternion.set(x0 * wA + x1 * wB, y0 * wA + y1 * wB, z0 * wA + z1 * wB, w0 * wA + w1 * wB);
                }
            } else {
                for (let c = 0; c < 3; c++) {
                    let v = values[a0 + c] + (values[a1 + c] - values[a0 + c]) * u;
                    if (tr.path === 'translation') {
                        if (c === 0) g.position.x = v; else if (c === 1) g.position.y = v; else g.position.z = v;
                    } else {
                        if (!isFinite(v) || v > 100 || v < 0) {
                            if (!inst.dbg.has('scale' + tr.nodeIdx)) {
                                inst.dbg.add('scale' + tr.nodeIdx);
                                console.warn(TAG + ' anim "' + animName + '" escala fuera de rango en nodo ' + tr.nodeIdx + ' (' + v.toFixed(2) + '), usando rest');
                            }
                            const rs = inst.restScale.get(g);
                            if (rs) v = c === 0 ? rs.x : c === 1 ? rs.y : rs.z;
                        }
                        if (c === 0) g.scale.x = v; else if (c === 1) g.scale.y = v; else g.scale.z = v;
                    }
                }
            }
        }
        return true;
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
            const desiredAnim = state.entityAnims?.[name] || null;
            const curAnim = rec.animState?.name || null;
            if (rec.root.parent === mesh && curAnim === desiredAnim) return;
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
            const origHeight = measureLocalHeight(mesh) || (entity.height || 1.8) / 16;
            const hidden = [];
            for (const child of [...mesh.children]) {
                child.visible = false;
                hidden.push(child);
            }
            const inst = cloneInstance(built);
            const root = inst.root;
            let s = 1;
            if (built.height > 0) {
                s = origHeight / built.height;
                if (s > 1.25) s = 1.25;
                if (s < 0.05) s = 0.05;
            }
            root.scale.multiplyScalar(s);
            root.position.y = -built.minY * root.scale.y;
            mesh.add(root);

            const anim = state.entityAnims?.[name];
            const startT = performance.now();
            const animState = anim && inst.anims.some((a) => a.name === anim) ? { name: anim, start: startT, speed: state.animSpeed ?? 1 } : null;

            const origRender = mesh.render;
            const yawSign = state.yawSign ?? 1;
            const wrapper = function (...args) {
                origRender?.apply(this, args);
                try {
                    root.rotation.y = yawSign * -(this.entity?.renderYawOffset ?? this.entity?.yaw ?? 0);
                    if (animState) {
                        restoreRest(inst);
                        sampleAnim(inst, animState.name, (performance.now() - animState.start) / 1000 * animState.speed);
                    }
                } catch {}
            };
            mesh.render = wrapper;

            state.applied.set(mesh, { file, root, hidden, origRender, wrapper, inst, animState });
            const animInfo = animState ? ' anim="' + animState.name + '"' : (inst.anims.length ? ' (' + inst.anims.length + ' anims: ' + inst.anims.map((a) => a.name).join(', ') + ')' : '');
            console.log(TAG + ' ' + name + ' -> ' + file + ' (escala=' + s.toFixed(3) + ')' + animInfo);
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

    function disableCullingDeep(root) {
        (function walk(n) {
            n.frustumCulled = false;
            n.matrixAutoUpdate = true;
            for (const c of n.children || []) walk(c);
        })(root);
    }

    function forceVisibleDeep(root) {
        if (root.visible !== true) root.visible = true;
        for (const c of root.children || []) {
            if (c.visible !== true) c.visible = true;
            if (c.children) forceVisibleDeep(c);
        }
    }

    function blockSolidAt(x, y, z) {
        const world = getGame()?.world;
        if (!world) return null;
        const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
        if (fy < 0 || fy > 255) return false;
        try {
            const proto = Object.getPrototypeOf(world);
            if (typeof proto.getChunk !== 'function') return null;
            const chunk = proto.getChunk.call(world, { x: fx, y: fy, z: fz });
            if (chunk == null || chunk.isDummyChunk) return null;
            if (typeof chunk.getBlockState !== 'function') return null;
            const bs = chunk.getBlockState({ x: fx, y: fy, z: fz });
            if (!bs) return false;
            return bs.id !== 0;
        } catch { return null; }
    }

    function boxCollides(x, y, z, half, height) {
        const x0 = Math.floor(x - half), x1 = Math.floor(x + half);
        const z0 = Math.floor(z - half), z1 = Math.floor(z + half);
        const y0 = Math.floor(y + 0.001), y1 = Math.floor(y + height - 0.001);
        for (let bx = x0; bx <= x1; bx++)
            for (let bz = z0; bz <= z1; bz++)
                for (let by = y0; by <= y1; by++) {
                    const s = blockSolidAt(bx + 0.5, by + 0.5, bz + 0.5);
                    if (s === null) return null;
                    if (s) return true;
                }
        return false;
    }

    function physicsStep(rec, dt, wantX, wantZ) {
        const root = rec.root;
        const half = rec.bodyHalf || 0.21;
        const height = rec.height || 0.85;
        let moved = false;
        let nx = root.position.x + wantX;
        if (Math.abs(wantX) > 1e-9) {
            const c = boxCollides(nx, root.position.y, root.position.z, half, height);
            if (c === false) { root.position.x = nx; moved = true; }
            else if (c === true && rec.onGround &&
                boxCollides(nx, root.position.y + 1.001, root.position.z, half, height) === false) {
                root.position.y += 1.001; root.position.x = nx; moved = true;
            }
        }
        let nz = root.position.z + wantZ;
        if (Math.abs(wantZ) > 1e-9) {
            const c = boxCollides(root.position.x, root.position.y, nz, half, height);
            if (c === false) { root.position.z = nz; moved = true; }
            else if (c === true && rec.onGround &&
                boxCollides(root.position.x, root.position.y + 1.001, nz, half, height) === false) {
                root.position.y += 1.001; root.position.z = nz; moved = true;
            }
        }
        rec.vy = (rec.vy || 0) - 26 * dt;
        if (rec.vy < -50) rec.vy = -50;
        const ny = root.position.y + rec.vy * dt;
        const cv = boxCollides(root.position.x, ny, root.position.z, half, height);
        if (cv === false) {
            root.position.y = ny;
            rec.onGround = false;
        } else if (cv === true) {
            if (rec.vy < 0) {
                const oldY = root.position.y;
                if (ny < oldY) {
                    let landY = Math.floor(ny + 0.001);
                    while (landY < oldY && boxCollides(root.position.x, landY, root.position.z, half, height)) landY++;
                    root.position.y = landY;
                }
                rec.onGround = true;
            }
            rec.vy = 0;
        } else {
            rec.onGround = false;
        }
        return moved;
    }

    function followTick(rec, dt, t) {
        const root = rec.root;
        if (!rec.followPlayer) return;
        const p = getGame()?.player?.pos;
        if (!p) return;
        const distToPlayer = Math.hypot(p.x - root.position.x, p.y - root.position.y, p.z - root.position.z);
        if (rec.loseDistance > 0 && distToPlayer > rec.loseDistance * 4) {
            root.position.set(p.x, p.y, p.z);
            rec.vy = 0;
            console.log(TAG + ' "' + rec.id + '" teleportada a tu lado (cambio de mundo?)');
            return;
        }
        if (rec.loseDistance > 0 && distToPlayer > rec.loseDistance) {
            if (!rec.lost) {
                rec.lost = true;
                rec.lostSince = t;
                console.log(TAG + ' "' + rec.id + '" te perdio (dist=' + distToPlayer.toFixed(1) + ')');
            }
            if (t - rec.lostSince > rec.lostTimeMs) {
                MF_CustomModels.despawn(rec.id);
                console.log(TAG + ' "' + rec.id + '" desaparecio tras perderte.');
                return false;
            }
        } else if (rec.lost) {
            rec.lost = false;
            rec.lostSince = 0;
        }
        const stopDist = rec.stopDistance || 1.8;
        let movingThisTick = false;
        if (rec.smooth === false) {
            root.position.set(p.x, p.y, p.z);
            movingThisTick = true;
        } else if (distToPlayer > stopDist) {
            const speed = rec.maxSpeed > 0 ? rec.maxSpeed : 4.3;
            const dx = p.x - root.position.x;
            const dz = p.z - root.position.z;
            const dy = p.y - root.position.y;
            const distH = Math.hypot(dx, dz);
            let wantX = 0, wantZ = 0;
            if (distH > 1e-4) {
                let step = speed * dt;
                if (distH <= step) step = distH;
                wantX = dx / distH * step;
                wantZ = dz / distH * step;
            }
            const movedNow = physicsStep(rec, dt, wantX, wantZ);
            movingThisTick = movedNow;
            if (dy > 1.2 && rec.onGround && distH < 2.5) rec.vy = 8.2;
        } else {
            physicsStep(rec, dt, 0, 0);
        }
        rec.actuallyMoving = movingThisTick;
    }

    (function tickCustoms() {
        const t = performance.now();
        let dt = Math.min(0.1, (t - (state.lastTickT || t)) / 1000);
        state.lastTickT = t;
        for (const rec of state.customs.values()) {
            const root = rec.root;
            if (!root || rec.dead) continue;
            try {
                while (dt > 1/30) {
                    const slice = 1/60;
                    if (followTick(rec, slice, t) === false || rec.dead) break;
                    dt -= slice;
                }
                if (!rec.dead) followTick(rec, dt, t);
                if (rec.dead) continue;
                const scene = getGame()?.gameScene?.scene;
                if (scene && root.parent !== scene) {
                    scene.add(root);
                    disableCullingDeep(root);
                    if (!rec.reattachWarned) {
                        rec.reattachWarned = true;
                        console.warn(TAG + ' "' + rec.id + '" desmontada de la escena; re-adjuntada.');
                    }
                }
                forceVisibleDeep(root);
                if (rec.followPlayer) {
                    if (rec.autoAnim && rec.inst) {
                        if (!rec.lastPos) rec.lastPos = root.position.clone();
                        rec.lastPos.copy(root.position);
                        const airborne = rec.onGround === false;
                        const moving = rec.actuallyMoving === true;
                        if (moving !== !!rec.wasMoving) {
                            rec.moveChangeAt = t;
                            rec.wasMoving = moving;
                        }
                        const stable = t - (rec.moveChangeAt || 0) > 250;
                        let want;
                        if (airborne) {
                            const vy = rec.vy || 0;
                            const jumpName = vy > 1 ? 'jumpup' : (vy < -1 ? 'jumpdown' : null);
                            want = (jumpName && rec.inst.anims.some((a) => a.name === jumpName)) ? jumpName : 'jump';
                        } else if (moving && stable) {
                            want = 'walk';
                        } else if (!moving && stable) {
                            want = rec.anim || 'idle';
                        } else {
                            want = rec.curAnim || 'idle';
                        }
                        const has = rec.inst.anims.some((a) => a.name === want);
                        if (has && rec.curAnim !== want) {
                            rec.curAnim = want;
                            rec.animStart = t;
                        }
                        const dx = root.position.x - (rec.prevX ?? root.position.x);
                        const dz = root.position.z - (rec.prevZ ?? root.position.z);
                        rec.prevX = root.position.x; rec.prevZ = root.position.z;
                        const moved2 = dx * dx + dz * dz;
                        if (moved2 > 2.5e-5) {
                            const targetYaw = Math.atan2(-dx, -dz) + (rec.yawOffset || 0);
                            let delta = targetYaw - root.rotation.y;
                            while (delta > Math.PI) delta -= 2 * Math.PI;
                            while (delta < -Math.PI) delta += 2 * Math.PI;
                            root.rotation.y += delta * Math.min(1, dt * 8);
                        }
                        const now = t;
                        const ov = rec.animOverride;
                        if (ov && now >= ov.until) { rec.animOverride = null; }
                        const animToPlay = (ov && now < ov.until) ? ov.name : rec.curAnim;
                        if (animToPlay) {
                            restoreRest(rec.inst);
                            const animT0 = (ov && now < ov.until) ? ov.start : rec.animStart;
                            sampleAnim(rec.inst, animToPlay, (now - animT0) / 1000 * rec.animSpeed);
                        }
                        continue;
                    }
                }
                root.rotation.y = rec.yaw;
                if (rec.bob) {
                    root.position.y = rec.pos.y + Math.sin(t / 700) * 0.05;
                }
                if (rec.anim && rec.inst) {
                    restoreRest(rec.inst);
                    sampleAnim(rec.inst, rec.anim, (t - rec.animStart) / 1000 * rec.animSpeed);
                }
            } catch {}
        }
        requestAnimationFrame(tickCustoms);
    })();

    console.log(TAG + ' cargado. Ejemplos:');
    console.log(TAG + "  MF_CustomModels.set('pig', 'mipuerco.glb')");
    console.log(TAG + "  MF_CustomModels.remove('pig')");
    console.log(TAG + '  MF_CustomModels.list()');
    console.log(TAG + ' Carpeta: models/entities/ del client (recarga la extension al agregar archivos)');
})();
