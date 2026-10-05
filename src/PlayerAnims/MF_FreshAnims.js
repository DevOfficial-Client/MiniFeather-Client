
(function () {
    'use strict';
    try { window.__MF_FRESH_SCOPE__?.destroy?.(); } catch {}

    const TAG = 'minifeather freshanims';

    // Motor CEM para packs de modelos/animaciones de mobs (Fresh Animations).
    // IMPORTANTE: Fresh Animations es ARR de FreshLX — el client NUNCA bundlea sus
    // assets (términos oficiales: no redistribuir, no compartir modificaciones).
    // Cada usuario importa su zip descargado de Modrinth/CurseForge y viaja solo
    // dentro de su navegador (IndexedDB). Créditos y enlaces oficiales en CREDITS.md.
    //
    // La pose base la da el propio juego: EMFRuntime lee los pivots nativos del mob
    // (leftShoulder/rightShoulder/leftHip/rightHip con la caminata de LP.render), así
    // que las fórmulas de FA que "capturan" right_arm.rx obtienen la pose vanilla real.

    const state = {
        enabled: false,
        pack: null,            // { files: Map<path,Uint8Array>, models: Map<type,entry> }
        packName: '',
        game: null,
        lastGameScan: 0,
        rafId: null,
        applied: new Map(),    // nativeMesh -> rec
        ctxs: new Map(),       // entityId -> FrameContext
        linesCache: new Map(), // type -> lines parseadas
        pending: new Set(),    // meshes en swap asíncrono
        status: 'sin pack',
        tickStats: { frames: 0, mobs: 0, errors: 0 }
    };

    const RT = () => globalThis.MF_EMFRuntime;
    const Parser = () => globalThis.MF_EMFParser;
    const IDB_NAME = 'minifeather-freshanims';
    const NEAREST = 1003; // THREE.NearestFilter, constante estable

    // --- pivots vanilla en unidades MC (jem "translate" = offset desde aquí) ------
    const VANILLA_PIVOTS = {
        head: [0, 24, 0], headwear: [0, 24, 0], body: [0, 24, 0],
        left_arm: [-5, 22, 0], right_arm: [5, 22, 0],
        left_leg: [-1.9, 12, 0], right_leg: [1.9, 12, 0],
        leg0: [-2, 12, -5], leg1: [2, 12, -5], leg2: [-2, 12, 5], leg3: [2, 12, 5]
    };
    function pivotFor(model) {
        const base = VANILLA_PIVOTS[model.part] || [0, 0, 0];
        const tr = Array.isArray(model.translate) ? model.translate : [0, 0, 0];
        return [base[0] + tr[0], base[1] + tr[1], base[2] + tr[2]];
    }

    // --- zip reader mínimo (stored + deflate-raw vía DecompressionStream) ----------
    async function readZip(buffer) {
        const view = new DataView(buffer);
        const files = new Map();
        let eocd = -1;
        for (let i = buffer.byteLength - 22; i >= 0 && i > buffer.byteLength - 65558; i--) {
            if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('zip sin EOCD');
        let count = view.getUint16(eocd + 10, true);
        let ptr = view.getUint32(eocd + 16, true);
        const dec = new TextDecoder();
        while (count-- > 0) {
            if (view.getUint32(ptr, true) !== 0x02014b50) break;
            const method = view.getUint16(ptr + 10, true);
            const csize = view.getUint32(ptr + 20, true);
            const nlen = view.getUint16(ptr + 28, true);
            const elen = view.getUint16(ptr + 30, true);
            const clen = view.getUint16(ptr + 32, true);
            const lho = view.getUint32(ptr + 42, true);
            const name = dec.decode(new Uint8Array(buffer, ptr + 46, nlen));
            ptr += 46 + nlen + elen + clen;
            if (name.endsWith('/')) continue;
            const nlen2 = view.getUint16(lho + 26, true);
            const elen2 = view.getUint16(lho + 28, true);
            const dataStart = lho + 30 + nlen2 + elen2;
            const raw = new Uint8Array(buffer, dataStart, csize);
            if (method === 0) files.set(name, raw.slice());
            else if (method === 8 && typeof DecompressionStream === 'function') {
                const ds = new DecompressionStream('deflate-raw');
                const ab = await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
                files.set(name, new Uint8Array(ab));
            }
        }
        if (!files.size) throw new Error('zip vacío o compresión no soportada');
        return files;
    }

    // --- registro de modelos: cem/<type>.jem + cem/<type>_animations.jpm -----------
    function buildRegistry(files) {
        const models = new Map();
        for (const [path, bytes] of files) {
            const m = path.match(/cem\/([a-z0-9_]+)\.jem$/);
            if (!m) continue;
            const type = m[1];
            // overlays/monturas/variantes: v2 (el mob base manda en v1); head_* son
            // decoraciones de calavera, no tipos de entidad
            if (/^head_/.test(type)) continue;
            if (/(_outer|_saddle|_armor|_decor|_collar|_wool|_charge|_harness|_ropes|_baby|_pattern|_eyes)/.test(type)) continue;
            if (/^(cold|warm)_/.test(type)) continue;
            try {
                const jem = JSON.parse(new TextDecoder().decode(bytes));
                if (!Array.isArray(jem.models)) continue;
                models.set(type, { jem, type, texCandidates: texCandidates(type) });
            } catch {}
        }
        for (const [type, entry] of models) {
            const jpmBytes = files.get(`assets/minecraft/optifine/cem/${type}_animations.jpm`);
            if (jpmBytes) {
                try { entry.jpm = JSON.parse(new TextDecoder().decode(jpmBytes)); } catch {}
            }
        }
        return models;
    }

    const TEX_FAMILY = {
        husk: 'zombie', drowned: 'zombie', bogged: 'skeleton/bogged', stray: 'skeleton/stray',
        parched: 'skeleton/parched', wither_skeleton: 'skeleton/wither_skeleton', skeleton: 'skeleton/skeleton',
        mooshroom: 'cow', cave_spider: 'spider', ocelot: 'cat',
        villager2: 'villager', villager: 'villager',
        vindicator: 'illager/vindicator', evoker: 'illager/evoker', pillager: 'illager/pillager',
        illusioner: 'illager/illusioner', ravager: 'illager/ravager', vex: 'illager/vex',
        piglin_brute: 'piglin/piglin_brute', zombified_piglin: 'piglin/zombified_piglin',
        donkey: 'horse/horse', mule: 'horse/horse', skeleton_horse: 'horse', zombie_horse: 'horse',
        salmon: 'fish', cod: 'fish', magma_cube: 'slime', glow_squid: 'squid',
        elder_guardian: 'guardian', zoglin: 'hoglin', ghast: 'ghast',
        happy_ghast: 'ghast/happy_ghast', trader_llama: 'llama/llama'
    };    function texCandidates(type) {
        const fam = TEX_FAMILY[type] !== undefined ? TEX_FAMILY[type] : type;
        const parts = fam.split('/');
        const dir = `assets/minecraft/textures/entity/${parts[0]}`;
        const last = parts.length > 1 ? parts[1] : type;
        const root = parts[0];
        return [
            `${dir}/${last}.png`,
            `${dir}/${type}.png`,
            `${dir}/${root}.png`,
            `assets/minecraft/textures/entity/${root}/${root}.png`
        ];
    }

    // --- geometría CEM: boxes + UV por cara ----------------------------------------
    function faceRectFromOffset(u, v, w, h, d) {
        return {
            west: [u, v + d, u + d, v + d + h],
            north: [u + d, v + d, u + d + w, v + d + h],
            east: [u + d + w, v + d, u + d + w + d, v + d + h],
            south: [u + d + w + d, v + d, u + d + w + d + w, v + d + h],
            up: [u + d, v, u + d + w, v + d],
            down: [u + d + w, v, u + d + w + w, v + d]
        };
    }
    function boxRects(box) {
        if (Array.isArray(box.uvNorth)) {
            return { north: box.uvNorth, south: box.uvSouth, east: box.uvEast, west: box.uvWest, up: box.uvUp, down: box.uvDown };
        }
        const [x, y, z, w, h, d] = box.coordinates;
        const off = box.textureOffset || [0, 0];
        return faceRectFromOffset(off[0], off[1], Math.abs(w), Math.abs(h), Math.abs(d));
    }

    function buildPartGeometry(boxes, pivot, texW, texH, G) {
        const pos = [], uv = [], idx = [];
        let vi = 0;
        const normals = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] };
        for (const box of boxes) {
            const [x, y, z, w, h, d] = box.coordinates.map(Number);
            const inf = Number(box.sizeAdd || 0);
            const x0 = x - inf, y0 = y - inf, z0 = z - inf;
            const x1 = x + w + inf, y1 = y + h + inf, z1 = z + d + inf;
            const rects = boxRects(box);
            // esquinas en orden (tl, tr, br, bl) visto de frente por cada cara
            const faces = [
                { n: 'north', c: [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]] },
                { n: 'south', c: [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]] },
                { n: 'west', c: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]] },
                { n: 'east', c: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]] },
                { n: 'up', c: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]] },
                { n: 'down', c: [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]] }
            ];
            for (const f of faces) {
                const [u1, v1, u2, v2] = rects[f.n];
                const uvc = [[u1, v1], [u2, v1], [u2, v2], [u1, v2]];
                for (let i = 0; i < 4; i++) {
                    const c = f.c[i];
                    // MC→THREE: x tal cual, y tal cual, z invertido
                    pos.push((c[0] - pivot[0]) / 16, (c[1] - pivot[1]) / 16, -(c[2] - pivot[2]) / 16);
                    uv.push(uvc[i][0] / texW, uvc[i][1] / texH);
                }
                idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
                vi += 4;
            }
        }
        const geo = new G.BufferGeometry();
        geo.setAttribute('position', new G.BufferAttribute(new Float32Array(pos), 3));
        geo.setAttribute('uv', new G.BufferAttribute(new Float32Array(uv), 2));
        geo.setIndex(new G.BufferAttribute(new Uint32Array(idx), 1));
        geo.computeVertexNormals();
        return geo;
    }

    function makeCtors(mesh) {
        const withGeo = mesh.children?.find(c => c.geometry?.attributes?.position);
        const attr = withGeo?.geometry.getAttribute?.('position') || withGeo?.geometry.attributes?.position;
        if (!attr?.constructor) throw new Error('BufferAttribute no alcanzable');
        const MeshCtor = mesh.children?.find(c => c.isMesh || (c.geometry && c.type === 'Mesh'))?.constructor;
        if (!MeshCtor) throw new Error('Mesh ctor no alcanzable');
        return { BufferGeometry: withGeo.geometry.constructor, BufferAttribute: attr.constructor, Mesh: MeshCtor, Group: mesh.constructor };
    }

    function buildModelRig(entry, material, G, MeshCtor, GroupCtor) {
        const texW = entry.jem.textureSize?.[0] || 64;
        const texH = entry.jem.textureSize?.[1] || 64;
        const parts = new Map();
        const root = new GroupCtor();
        const nodesByPath = new Map();

        const ensureNode = (path, model) => {
            let node = nodesByPath.get(path);
            if (node) return node;
            const parentPath = path.slice(0, path.lastIndexOf('/'));
            const parent = parentPath ? ensureNode(parentPath, null) : root;
            node = new GroupCtor();
            // los boxes son espacio absoluto MC: un submodelo anónimo hereda el pivot
            // del padre; una parte nombrada usa vanilla + su translate
            const parentPivot = parentPath ? nodesByPath.get(parentPath).__mfPivot : [0, 0, 0];
            const pivot = model ? pivotFor(model) : parentPivot;
            node.position.set(
                (pivot[0] - parentPivot[0]) / 16,
                (pivot[1] - parentPivot[1]) / 16,
                -(pivot[2] - parentPivot[2]) / 16
            );
            node.__mfPivot = pivot;
            node.__mfBase = { x: node.position.x, y: node.position.y, z: node.position.z };
            parent.add(node);
            nodesByPath.set(path, node);
            return node;
        };

        const walk = (model, path) => {
            if (!model || typeof model !== 'object') return;
            const here = path + '/' + (model.part || model.id || 'm');
            const node = ensureNode(here, model.part ? model : null);
            if (model.part) {
                if (!parts.has(model.part)) parts.set(model.part, node);
                node.__mfPart = model.part;
            }
            const boxes = Array.isArray(model.boxes) ? model.boxes.filter(b => b && Array.isArray(b.coordinates)) : [];
            if (boxes.length) {
                const mesh = new MeshCtor(buildPartGeometry(boxes, node.__mfPivot, texW, texH, G), material);
                mesh.frustumCulled = false;
                node.add(mesh);
            }
            for (const k of ['submodels', 'models']) {
                if (Array.isArray(model[k])) for (const sub of model[k]) walk(sub, here);
            }
        };
        for (const m of entry.jem.models || []) walk(m, '');
        return { root, resolve: name => parts.get(name) || null, parts };
    }

    // resuelve el png del mob: candidatos exactos → variantes del directorio
    // (cow_temperate, axolotl_lucy...) → null (el caller usa la textura nativa)
    function resolveTexturePath(entry) {
        for (const p of entry.texCandidates) {
            if (state.pack?.files.has(p)) return p;
        }
        const dir = entry.texCandidates[0].split('/').slice(0, -1).join('/');
        const files = state.pack?.files;
        if (!files) return null;
        const inDir = [...files.keys()].filter(p => p.startsWith(dir + '/') && p.endsWith('.png'));
        const prefer = /(_temperate|_lucy|_brown|_tabby|_creamy|_red_blue|_chestnut)\.png$/;
        const avoid = /(_angry|_sleep|_eyes|nectar|saddle|armor|_baby|_cold|_warm|_snow|_tame|pattern|_blue|_cyan|_gold|_wild|_black|_white|_yellow|_grey|_gray|_green|_red|_ashen|_spotted|_striped|_rusty|_woods)/;
        return inDir.find(p => prefer.test(p)) || inDir.find(p => !avoid.test(p)) || inDir[0] || null;
    }

    async function loadTextureCanvas(entry) {
        const path = resolveTexturePath(entry);
        if (!path) return null;
        const bytes = state.pack?.files.get(path);
        if (!bytes) return null;
        try {
            const bmp = await createImageBitmap(new Blob([bytes]));
            const canvas = document.createElement('canvas');
            canvas.width = bmp.width; canvas.height = bmp.height;
            const ctx2d = canvas.getContext('2d');
            ctx2d.drawImage(bmp, 0, 0);
            bmp.close?.();
            return canvas;
        } catch {
            return null;
        }
    }

    // --- swap sobre la entidad ------------------------------------------------------
    function findGame(force = false) {
        const now = performance.now();
        if (!force && state.game?.player && now - state.lastGameScan < 1000) return state.game;
        state.lastGameScan = now;
        const local = globalThis.__MINIFEATHER_LOCAL_GAMES__;
        const localGame = local?.active ? local.game : null;
        if (localGame?.player) return (state.game = localGame);
        try {
            const react = document.querySelector('#react');
            if (react) {
                for (const root of Object.values(react)) {
                    const game = root?.updateQueue?.baseState?.element?.props?.game;
                    if (game?.player) return (state.game = game);
                }
            }
        } catch {}
        return state.game?.player ? state.game : null;
    }

    function parseLines(entry) {
        const out = [];
        const P = Parser();
        if (!P) return out;
        try { if (entry.jpm) out.push(...P.parseModel(entry.jpm).lines); } catch {}
        try { out.push(...P.parseModel(entry.jem).lines); } catch {}
        return out;
    }

    function meshHeight(mesh) {
        try {
            const wp = { y: 0 };
            let minY = Infinity, maxY = -Infinity;
            mesh.traverse(c => {
                const pa = c.geometry?.attributes?.position;
                if (!pa) return;
                for (let i = 0; i < pa.count; i++) {
                    const y = pa.getY ? pa.getY(i) : pa.array[i * 3 + 1];
                    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                }
            });
            return maxY > minY ? maxY - minY : null;
        } catch { return null; }
    }

    function applyToEntity(ent, mesh) {
        const type = String(ent.type || '').toLowerCase();
        const entry = state.pack?.models?.get(type);
        if (!entry || state.applied.has(mesh) || state.pending.has(mesh)) return;
        if (mesh.__mfCustomModelApplied) return; // respeto a CustomModels
        state.pending.add(mesh);
        try {
            const G = makeCtors(mesh);
            const matSample = mesh.children?.find(c => c.material)?.material;
            if (!matSample) return;
            const MatCtor = matSample.constructor;
            const material = new MatCtor();
            const canvas = null; // la textura se resuelve async abajo
            loadTextureCanvas(entry).then(canvas => {
                state.pending.delete(mesh);
                if (!state.enabled || !mesh.parent) return;
                const RTc = RT();
                if (!RTc?.FrameContext) return; // sin runtime EMF no hay swap
                try {
                    const texCtor = matSample.map?.constructor;
                    if (canvas && texCtor) {
                        const tex = new texCtor(canvas);
                        tex.flipY = false;
                        tex.magFilter = NEAREST;
                        tex.minFilter = NEAREST;
                        tex.needsUpdate = true;
                        material.map = tex;
                    } else {
                        // sin png del pack (FA reusa la textura vanilla en algunos mobs):
                        // la textura nativa del juego manda
                        material.map = matSample.map;
                    }
                    // las capas (headwear etc.) usan alpha del png base
                    if ('alphaTest' in material) material.alphaTest = 0.1;
                    if ('transparent' in material) material.transparent = false;
                    const rig = buildModelRig(entry, material, G, G.Mesh, G.Group);
                    if (!rig.parts.size) return;
                    // capturar base de posición para writes de translate
                    rig.parts.forEach(node => { node.__mfBase = { x: node.position.x, y: node.position.y, z: node.position.z }; });
                    const native = meshHeight(mesh) || (ent.height || 1.8) / 16;
                    const built = meshHeight(rig.root);
                    if (built > 0) {
                        const s = Math.max(0.05, Math.min(2.5, native / built));
                        rig.root.scale.multiplyScalar(s);
                    }
                    const hidden = [...mesh.children].filter(c => !c.__mfFreshRoot);
                    for (const c of hidden) c.visible = false;
                    rig.root.__mfFreshRoot = true;
                    rig.root.__mfHiddenNative = hidden;
                    mesh.add(rig.root);
                    let lines = state.linesCache.get(type);
                    if (!lines) { lines = parseLines(entry); state.linesCache.set(type, lines); }
                    state.applied.set(mesh, {
                        root: rig.root, resolve: rig.resolve, native: mesh, ent, type, lines,
                        ctx: new RTc.FrameContext(ent.id ?? Math.random())
                    });
                } catch (e) {
                    state.tickStats.errors++;
                    console.warn(TAG, 'swap falló:', type, e?.message);
                }
            }).catch(() => state.pending.delete(mesh));
        } catch (e) {
            state.pending.delete(mesh);
            state.tickStats.errors++;
        }
    }

    function restoreMesh(mesh) {
        const rec = state.applied.get(mesh);
        if (rec) {
            try { rec.root.parent?.remove(rec.root); } catch {}
            state.applied.delete(mesh);
        }
        for (const c of mesh.children || []) {
            if (!c.__mfFreshRoot) c.visible = true;
        }
    }

    // --- loop -----------------------------------------------------------------------
    const writes = [];
    function tick() {
        if (!state.enabled || !state.pack) return;
        const game = findGame();
        if (game) {
            try {
                const ents = game.world?.entities;
                if (ents && typeof ents.values === 'function') {
                    for (const ent of ents.values()) {
                        if (!ent?.mesh || ent.mesh === game.player?.mesh) continue;
                        const dead = ent.deathTime > 0 || (typeof ent.getHealth === 'function' && ent.getHealth() <= 0);
                        if (dead) { restoreMesh(ent.mesh); continue; }
                        animateEntity(ent, ent.mesh, game);
                    }
                }
                for (const mesh of [...state.applied.keys()]) {
                    if (!mesh.parent || !mesh.entity) restoreMesh(mesh);
                }
            } catch {
                state.tickStats.errors++;
            }
        }
        state.rafId = requestAnimationFrame(tick);
    }

    function animateEntity(ent, mesh, game) {
        let rec = state.applied.get(mesh);
        const type = String(ent.type || '').toLowerCase();
        if (rec && (rec.ent !== ent || rec.type !== type)) { restoreMesh(mesh); rec = null; }
        if (!rec) {
            if (state.pack?.models?.has(type)) applyToEntity(ent, mesh);
            return;
        }
        const RTc = RT();
        if (!RTc || !rec.lines.length) return;
        try {
            const st = RTc.buildFrameState(mesh, game, game.player);
            if (!st) return;
            const eid = ent.id ?? rec.type;
            let ctx = state.ctxs.get(eid);
            if (!ctx) { ctx = new RTc.FrameContext(eid); state.ctxs.set(eid, ctx); }
            writes.length = 0;
            RTc.evaluate(rec.lines, ctx, st, writes);
            // mirada: copiar la rotación de cabeza nativa antes de que FA pise si quiere
            const nativeHead = mesh.headPivot;
            const myHead = rec.resolve('head');
            if (nativeHead && myHead) {
                myHead.rotation.x = -nativeHead.rotation.x;
                myHead.rotation.y = nativeHead.rotation.y;
            }
            for (const w of writes) {
                const node = rec.resolve(w.part);
                if (!node) continue;
                const c = w.channel;
                if (c[0] === 'r') {
                    if (w.part === 'head' && c === 'ry') continue; // la mirada la pone el juego
                    node.rotation[c[1]] = w.value;
                } else if (c[0] === 's') {
                    node.scale[c[1]] = Math.max(0.01, w.value);
                } else if (c[0] === 't') {
                    const base = node.__mfBase || node.position;
                    const delta = (w.value - 0) / 16;
                    if (c === 'tx') node.position.x = base.x - delta;
                    else if (c === 'ty') node.position.y = base.y - delta;
                    else if (c === 'tz') node.position.z = base.z + delta;
                }
            }
            state.tickStats.frames++;
            state.tickStats.mobs = state.applied.size;
        } catch (e) {
            state.tickStats.errors++;
            if (state.tickStats.errors <= 3) console.warn(TAG, 'animate error:', e?.message || e);
        }
    }

    // --- import / persistencia --------------------------------------------------------
    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore('packs');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function persistPack(files, name) {
        try {
            const db = await openDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction('packs', 'readwrite');
                tx.objectStore('packs').put({ files: [...files.entries()], name }, 'current');
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
            db.close();
        } catch (e) {
            console.warn(TAG, 'sin persistencia IDB, pack solo en memoria:', e?.message);
        }
    }
    async function hydratePack() {
        try {
            const db = await openDb();
            const rec = await new Promise((resolve, reject) => {
                const tx = db.transaction('packs', 'readonly');
                const rq = tx.objectStore('packs').get('current');
                rq.onsuccess = () => resolve(rq.result);
                rq.onerror = () => reject(rq.error);
            });
            db.close();
            if (rec?.files?.length) loadPackFiles(new Map(rec.files), rec.name, false);
        } catch {}
    }

    async function importPackFile(file) {
        let buffer = await file.arrayBuffer();
        if (ArrayBuffer.isView(buffer)) {
            buffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        }
        const files = await readZip(buffer);
        const models = buildRegistry(files);
        if (!models.size) throw new Error('el zip no trae modelos cem/*.jem de Fresh Animations');
        loadPackFiles(files, file.name || 'pack.zip', true);
        return models.size;
    }

    function loadPackFiles(files, name, save) {
        const models = buildRegistry(files);
        state.pack = { files, models };
        state.packName = name;
        state.linesCache.clear();
        state.ctxs.clear();
        for (const mesh of [...state.applied.keys()]) restoreMesh(mesh);
        state.status = `${models.size} mobs listos (${name})`;
        console.log(TAG, state.status);
        if (save) persistPack(files, name);
        // pack presente = opt-in explícito: encender sin esperar al panel
        setEnabled(true);
    }

    function clearPack() {
        for (const mesh of [...state.applied.keys()]) restoreMesh(mesh);
        state.pack = null;
        state.packName = '';
        state.linesCache.clear();
        state.status = 'sin pack';
        setEnabled(false);
        try { indexedDB.deleteDatabase(IDB_NAME); } catch {}
    }

    function onConfig(e) {
        try {
            const cfg = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
            if (cfg.enabled !== undefined) setEnabled(cfg.enabled);
            if (cfg.command === 'clear') clearPack();
        } catch {}
    }

    function setEnabled(enabled) {
        enabled = enabled === true || enabled === 'true';
        if (enabled === state.enabled) return;
        state.enabled = enabled;
        if (enabled) {
            if (!state.pack) hydratePack();
            if (!state.rafId) state.rafId = requestAnimationFrame(tick);
            console.log(TAG, 'on');
        } else {
            if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
            for (const mesh of [...state.applied.keys()]) restoreMesh(mesh);
            console.log(TAG, 'off');
        }
    }

    document.addEventListener('minifeather:freshanims-config', onConfig);
    window.__MF_FRESH_SCOPE__ = {
        destroy() {
            try { if (state.enabled) setEnabled(false); } catch {}
            document.removeEventListener('minifeather:freshanims-config', onConfig);
        }
    };

    globalThis.MF_FreshAnims = {
        setEnabled,
        importPackFile,
        clearPack,
        getStatus() {
            return {
                enabled: state.enabled, status: state.status, packName: state.packName,
                mobs: state.pack?.models?.size || 0, applied: state.applied.size,
                tickStats: { ...state.tickStats }
            };
        },
        get enabled() { return state.enabled; }
    };
    console.log(TAG, 'script loaded (motor CEM sin assets — el pack lo importa el usuario)');
})();
