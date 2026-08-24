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
    // avisar si quedan reemplazos de mobs guardados (faciles de olvidar)
    if (Object.keys(state.mappings).length) {
        console.log(TAG + ' mapeos activos guardados: ' + JSON.stringify(state.mappings) + ' — usa MF_CustomModels.clear() para restaurar');
    }

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
        diag() {
            const game = getGame();
            const cam = game?.gameScene?.axesHelper?.parent;
            const rows = [];
            const wp = (o) => { const e = o?.matrixWorld?.elements; return e ? [e[12], e[13], e[14]] : null; };
            const scanTree = (root, donde) => {
                const p0 = wp(root) || [0, 0, 0];
                const walk = (o, depth, path) => {
                    if (!o || depth > 40) return;
                    const p = wp(o) || p0;
                    rows.push({
                        donde, tipo: o.geometry ? 'Mesh' : (o.isGroup || o.children ? 'Group' : '?'),
                        nombre: o.name || (o.constructor && o.constructor.name) || '?',
                        pos: p.map((v) => +v.toFixed(1)).join(','),
                        distCam: cam ? +Math.hypot(p[0] - cp[0], p[1] - cp[1], p[2] - cp[2]).toFixed(2) : '-',
                        vis: o.visible, hijos: (o.children || []).length,
                        path: path.slice(0, 60)
                    });
                    for (const c of (o.children || [])) walk(c, depth + 1, path + '/' + (c.name || c.constructor?.name || '?'));
                };
                walk(root, 0, (root.name || root.constructor?.name || '?'));
            };
            const cp = wp(cam) || [0, 0, 0];
            console.log(TAG + ' === DIAG ===');
            console.log(TAG + ' game: ' + (game ? 'ok' : 'NO') + ' | cam: ' + (cam ? (cam.constructor?.name || '?') : 'NO') + ' @ ' + cp.map((v) => +v.toFixed(1)).join(','));
            // 1) reemplazos a mobs: a que mesh esta pegado cada root y quien es su parent
            // state.applied es WeakMap (no iterable): escanear entidades del mundo y ver si tienen rec
            let appliedCount = 0;
            try {
                const check = (e) => {
                    const mesh = e?.mesh;
                    if (!mesh) return;
                    const rec = state.applied.get(mesh);
                    if (!rec) return;
                    appliedCount++;
                    const parent = mesh?.parent;
                    rows.push({
                        donde: 'APPLIED->' + rec.file.slice(0, 24), tipo: 'root',
                        nombre: (parent ? (parent.name || parent.constructor?.name) : 'SIN PARENT') + (parent === cam ? ' <<< ES LA CAMARA!' : ''),
                        pos: '-', distCam: '-', vis: mesh.visible, hijos: (mesh.children || []).length,
                        path: 'meshType=' + (mesh.constructor?.name || '?')
                    });
                };
                try { game?.world?.entities?.forEach?.(check); } catch {}
                try { for (const p of game?.world?.playersIterator?.() ?? []) check(p); } catch {}
                if (!appliedCount) console.log(TAG + ' applied: 0 (sin reemplazos activos)');
            } catch (e) { console.warn(TAG + ' applied scan fallo: ' + e); }
            // 2) customs: donde esta cada root
            for (const rec of state.customs.values()) {
                rows.push({
                    donde: 'CUSTOM ' + rec.id, tipo: 'root', nombre: rec.file.slice(0, 40),
                    pos: rec.root ? [rec.root.position.x, rec.root.position.y, rec.root.position.z].map((v) => +v.toFixed(1)).join(',') : 'sin-root',
                    distCam: '-', vis: !rec.dead, hijos: rec.root ? rec.root.children.length : 0,
                    path: 'parent=' + (rec.root?.parent ? (rec.root.parent.name || rec.root.parent.constructor?.name) : 'NINGUNO')
                });
            }
            // 3) arbol de la camara y de la escena
            if (cam) scanTree(cam, '>>> CAMARA');
            if (game?.gameScene?.scene) scanTree(game.gameScene.scene, 'escena');
            // 3) caza por huella: cualquier mesh creado por CustomModels (userData.__mfCM)
            //    o con textura de la extension, colgado en CUALQUIER arbol de la pagina
            const extOrigin = 'chrome-extension://';
            const chain = (o) => {
                const parts = [];
                let n = o;
                while (n && parts.length < 12) {
                    parts.unshift(n.name || n.constructor?.name || '?');
                    n = n.parent;
                }
                return parts.join(' <- ');
            };
            const texInfo = (m) => {
                try {
                    const mats = Array.isArray(m.material) ? m.material : [m.material];
                    for (const mat of mats) {
                        const src = mat?.map?.image?.src || mat?.map?.source?.data?.src;
                        if (typeof src === 'string' && src.includes(extOrigin)) return 'EXT:' + src.split('/').pop();
                    }
                } catch {}
                return null;
            };
            const hunted = [];
            const seen = new Set();
            const hunt = (o, donde) => {
                if (!o || seen.has(o) || hunted.length > 200) return;
                seen.add(o);
                if (o.userData?.__mfCM) {
                    hunted.push({ donde, tipo: o.geometry ? 'Mesh' : 'Group', nombre: o.name || '?', mf: 'SI (userData)', tex: texInfo(o) || '-', cadena: chain(o) });
                } else if (o.geometry) {
                    const t = texInfo(o);
                    if (t) hunted.push({ donde, tipo: 'Mesh', nombre: o.name || '?', mf: 'textura-extension', tex: t, cadena: chain(o) });
                }
                for (const c of (o.children || [])) hunt(c, donde);
            };
            if (cam) hunt(cam, 'CAMARA');
            if (game?.gameScene?.scene) hunt(game.gameScene.scene, 'escena');
            if (hunted.length) {
                console.log('%c[MF] ENCONTRADOS ' + hunted.length + ' objetos de CustomModels:', 'color:red;font-weight:bold');
                console.table(hunted);
            } else {
                console.log(TAG + ' huella CustomModels: NINGUNA (ni bajo camara ni en escena)');
            }
            rows.sort((a, b) => {
                const na = a.donde.startsWith('>>>') ? 0 : 1, nb = b.donde.startsWith('>>>') ? 0 : 1;
                return na - nb;
            });
            console.table(rows);
            console.log(TAG + ' overlays DOM: ' + document.querySelectorAll('canvas, iframe, video').length + ' elementos');
            return rows.length;
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
                hover: !!opts.hover,          // flota: sin gravedad ni colision
                weeping: !!opts.weeping,      // se congela si el player lo mira
                lookAtPlayer: opts.lookAtPlayer !== false,
                stay: !!opts.stay,
                puppet: !!opts.puppet,        // marioneta P2P: la mueve la red, no la IA
                spawnAnim: opts.spawnAnim || null,   // anim de aparicion (una vez)
                catchAnim: opts.catchAnim || null,   // anim al acercarse al player
                despawnAnim: opts.despawnAnim || null, // anim de despedida
                caught: false,
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
                // anim de aparicion (terror): reproducir una vez como override
                if (rec.spawnAnim) {
                    const an = findAnim(inst, rec.spawnAnim);
                    if (an) {
                        const anim = inst.anims.find((a) => a.name === an);
                        const ms = Math.max(1200, (anim?.duration || 1.2) * 1000);
                        rec.animOverride = { name: an, start: performance.now(), until: performance.now() + ms };
                        rec.spawnAnim = null;
                        console.log(TAG + ' "' + id + '" aparece con "' + an + '"');
                    }
                }
                inst.root.position.set(rec.pos.x, rec.pos.y, rec.pos.z);
                disableCullingDeep(inst.root);
                inst.root.matrixAutoUpdate = true;
                scene.add(inst.root);
                // las clases del juego auto-registran instancias en el rig de camara;
                // purgar inmediatamente para que el "fantasma" ni asome
                setTimeout(() => { try { purgeUnderCam(); } catch {} }, 0);
                setTimeout(() => { try { purgeUnderCam(); } catch {} }, 500);
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
            const resolved = animName ? (findAnim(rec.inst, animName) || animName) : null;
            if (animName && resolved !== animName && !rec.inst.anims.some((a) => a.name === resolved)) {
                console.warn(TAG + ' anim "' + animName + '" no existe. Disponibles: ' + rec.inst.anims.map((a) => a.name).join(', '));
                return false;
            }
            if (!resolved) { restoreRest(rec.inst); }
            rec.anim = resolved;
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
        despawnAll() {
            const ids = [...state.customs.keys()];
            for (const id of ids) MF_CustomModels.despawn(id);
            return ids;
        },
        playAnim(id, animName, ms) {
            const rec = state.customs.get(id);
            if (!rec?.inst) return false;
            if (!rec.inst.anims.some((a) => a.name === animName)) return false;
            const now = performance.now();
            const prev = rec.animOverride;
            // si ya suena la misma anim y sigue vigente, extender sin reiniciar (loop suave)
            if (prev && prev.name === animName && now < prev.until) {
                prev.until = Math.max(prev.until, now + (+ms || 1500));
                return true;
            }
            rec.animOverride = { name: animName, start: now, until: now + (+ms || 1500) };
            return true;
        },
        despawn(id, force) {
            const rec = state.customs.get(id);
            if (!rec) return false;
            // anim de despedida (terror): desvanecerse antes de desaparecer
            // (force=true la mata al instante, para respawn sin overlap)
            if (!force && rec.despawnAnim && rec.inst && !rec.dying && !rec.dead) {
                const an = findAnim(rec.inst, rec.despawnAnim);
                if (an) {
                    const anim = rec.inst.anims.find((a) => a.name === an);
                    const ms = Math.max(900, (anim?.duration || 1) * 1000);
                    rec.dying = true;
                    rec.stay = true; // quieto mientras se despide
                    rec.animOverride = { name: an, start: performance.now(), until: performance.now() + ms };
                    console.log(TAG + ' "' + id + '" se despide con "' + an + '"');
                    setTimeout(() => { if (state.customs.get(id) === rec) MF_CustomModels.despawn(id); }, ms);
                    return true;
                }
            }
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
        // congelar en el sitio / reanudar persecucion
        stay(id, on = true) {
            const rec = state.customs.get(id);
            if (!rec) return false;
            rec.stay = !!on;
            if (rec.stay) {
                rec.actuallyMoving = false;
                console.log(TAG + ' "' + rec.id + '" se queda quieta en (' + (rec.root?.position.x ?? 0).toFixed(1) + ', ' + (rec.root?.position.y ?? 0).toFixed(1) + ', ' + (rec.root?.position.z ?? 0).toFixed(1) + ')');
            } else {
                console.log(TAG + ' "' + rec.id + '" reanuda la persecucion');
            }
            return true;
        },
        listCustoms() {
            const out = {};
            for (const [id, r] of state.customs) out[id] = { file: r.file, pos: { ...r.pos }, yaw: r.yaw, scale: r.scale };
            console.log(TAG + ' entidades client-side: ' + JSON.stringify(out));
            return out;
        },
        // record interno (para MF_Peer: leer transform de verity sin exponer todo)
        getRecord(id) {
            const rec = state.customs.get(id);
            if (!rec || rec.dead) return null;
            return {
                get root() { return rec.root; },
                get yaw() { return rec.yaw; },
                get curAnim() { return rec.curAnim; },
                get anim() { return rec.anim; },
                get puppet() { return rec.puppet === true; },
                id: rec.id
            };
        },
        followVerity(offset = 1.8, opts = {}) {
            const p = getGame()?.player?.pos;
            if (!p) { console.warn(TAG + ' no hay player aun'); return null; }
            if (state.customs.has('verity')) MF_CustomModels.despawn('verity');
            const res = MF_CustomModels.spawn('verity_full_model.glb', p.x + offset, p.y, p.z, {
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
            if (res) playIntro('verity', res);
            return res;
        },
        // Caja de invocacion: spawnea en el suelo; click derecho encima la abre
        // (sube/abre/encoge) y de ahi cae Verity del cielo.
        // Guard: solo un listener y solo mientras exista la caja.
        spawnIaBox(offset = 2, opts = {}) {
            const p = getGame()?.player?.pos;
            if (!p) { console.warn(TAG + ' no hay player aun'); return null; }
            if (state.customs.has('verity')) MF_CustomModels.despawn('verity');
            if (state.customs.has('caja_intro')) MF_CustomModels.despawn('caja_intro');
            // quitar listener previo si quedo vivo
            if (state.iaBoxListener) {
                document.removeEventListener('mousedown', state.iaBoxListener, true);
                state.iaBoxListener = null;
            }
            const bx = p.x + offset, bz = p.z;
            const boxId = 'caja_intro';
            MF_CustomModels.spawn('box.geo.json', bx, p.y, bz, {
                id: boxId,
                height: opts.boxHeight || 1.0,
                bodyHalf: 0.56
                // sin anim: quieta en el suelo, esperando el click
            });
            let opened = false;
            const listener = (ev) => {
                if (ev.button !== 2 || opened) return;
                const rec = state.customs.get(boxId);
                if (!rec || !rec.root) { cleanup(); return; }
                // direccion de mirada: preferir la CAMARA (columna -Z de matrixWorld),
                // fallback lookDirection / yaw+pitch
                const game = getGame();
                const player = game?.player;
                const origin = player?.pos;
                if (!origin) return;
                let dx = 0, dy = 0, dz = -1;
                let src = 'camera';
                try {
                    const cam = game?.gameScene?.camera;
                    const e = cam?.matrixWorld?.elements;
                    if (e && e.length >= 16) {
                        // en three.js la camara mira hacia -Z local; en world es -colZ
                        dx = -e[8]; dy = -e[9]; dz = -e[10];
                    } else throw 0;
                } catch {
                    const look = player?.lookDirection || player?.look || player?.direction;
                    if (look && Number.isFinite(look.x)) {
                        src = 'lookDirection';
                        const l = Math.hypot(look.x, look.y, look.z) || 1;
                        dx = look.x / l; dy = look.y / l; dz = look.z / l;
                    } else {
                        src = 'yaw+pitch';
                        const yaw = Number(player?.yaw) || 0, pitch = Number(player?.pitch) || 0;
                        const cp = Math.cos(pitch);
                        dx = -Math.sin(yaw) * cp; dy = -Math.sin(pitch); dz = Math.cos(yaw) * cp;
                    }
                }
                const l2 = Math.hypot(dx, dy, dz) || 1;
                dx /= l2; dy /= l2; dz /= l2;
                const cx = rec.root.position.x, cy = rec.root.position.y + (rec.height || 1) / 2, cz = rec.root.position.z;
                const ex = origin.x, ey = origin.y + 1.58, ez = origin.z;
                const ox = cx - ex, oy = cy - ey, oz = cz - ez;
                const along = ox * dx + oy * dy + oz * dz;
                const dist = Math.hypot(ox, oy, oz);
                const perpSq = Math.max(0, dist * dist - along * along);
                const r = Math.max(0.9, (rec.height || 1) * 0.8);
                console.log(TAG + ' click: src=' + src + ' dist=' + dist.toFixed(2) + ' along=' + along.toFixed(2) + ' perp=' + Math.sqrt(perpSq).toFixed(2) + ' (r=' + r.toFixed(2) + ')');
                if (along <= 0 || along > 5.5 || perpSq > r * r) return; // no apunta a la caja
                // ¡click valido!
                opened = true;
                ev.preventDefault?.();
                cleanup();
                MF_CustomModels.setAnim(boxId, 'open');
                console.log(TAG + ' caja: abriendo (click derecho)...');
                const OPEN_MS = 2600;
                setTimeout(() => {
                    if (!state.customs.has(boxId)) return;
                    MF_CustomModels.despawn(boxId);
                    console.log(TAG + ' caja: desaparecio, soltando a Verity');
                    const res = MF_CustomModels.spawn('verity_full_model.glb', cx, cy + (opts.fallHeight || 14), cz, {
                        id: 'verity',
                        height: opts.height || 0.85,
                        followPlayer: true,
                        fallingSpawn: true, // caer recto sobre la caja, sin perseguir
                        stopDistance: opts.stopDistance || offset,
                        autoAnim: true,
                        maxSpeed: opts.maxSpeed || 4.3,
                        loseDistance: opts.loseDistance != null ? opts.loseDistance : 12,
                        lostTimeMs: opts.lostTimeMs != null ? opts.lostTimeMs : 5000
                    });
                    if (res) playIntro('verity', res);
                }, OPEN_MS);
            };
            const cleanup = () => {
                document.removeEventListener('mousedown', listener, true);
                if (state.iaBoxListener === listener) state.iaBoxListener = null;
            };
            state.iaBoxListener = listener;
            document.addEventListener('mousedown', listener, true);
            console.log(TAG + ' caja de invocacion lista — click derecho sobre ella para abrir');
            return boxId;
        },
        spawnBox(offset = 2, opts = {}) {
            const p = getGame()?.player?.pos;
            if (!p) { console.warn(TAG + ' no hay player aun'); return null; }
            if (state.customs.has('caja')) MF_CustomModels.despawn('caja');
            const res = MF_CustomModels.spawn('box.geo.json', p.x + offset, p.y, p.z, {
                id: 'caja',
                height: opts.height || 1.0,
                bodyHalf: opts.bodyHalf || 0.56,
                followPlayer: !!opts.followPlayer,
                anim: opts.anim || 'hover',
                ...opts
            });
            return res;
        },
        // Caballo de Minecraft (minecraft_-_horse.glb): spawnea en el suelo
        // y persigue al jugador como Verity. Sin anims (el GLB no trae).
        spawnHorse(offset = 2, opts = {}) {
            const p = getGame()?.player?.pos;
            if (!p) { console.warn(TAG + ' no hay player aun'); return null; }
            if (state.customs.has('caballo')) MF_CustomModels.despawn('caballo');
            return MF_CustomModels.spawn('minecraft_-_horse.glb', p.x + offset, p.y, p.z, {
                id: 'caballo',
                height: opts.height || 1.6,      // un caballo mide ~1.6 bloques
                bodyHalf: opts.bodyHalf || 0.7,
                followPlayer: opts.followPlayer !== false,
                stopDistance: opts.stopDistance != null ? opts.stopDistance : Math.max(1.5, offset),
                maxSpeed: opts.maxSpeed || 5.6,  // los caballos corren mas que el jugador
                loseDistance: opts.loseDistance != null ? opts.loseDistance : 12,
                lostTimeMs: opts.lostTimeMs != null ? opts.lostTimeMs : 5000,
                lookAtPlayer: true,
                ...opts
            });
        },
        // Maternal Wraith (oldest_maternal_wraith.glb): fantasma de terror.
        // Flota (sin gravedad), te acecha despacio y SIEMPRE te mira.
        spawnMaternal(offset = 4, opts = {}) {
            const p = getGame()?.player?.pos;
            if (!p) { console.warn(TAG + ' no hay player aun'); return null; }
            if (state.customs.has('maternal')) MF_CustomModels.despawn('maternal', true);
            return MF_CustomModels.spawn('oldest_maternal_wraith.glb', p.x + offset, p.y + 2, p.z, {
                id: 'maternal',
                height: opts.height || 2.6,
                bodyHalf: opts.bodyHalf || 0.6,
                followPlayer: opts.followPlayer !== false,
                stopDistance: opts.stopDistance != null ? opts.stopDistance : 2.5,
                maxSpeed: opts.maxSpeed || 2.2,   // lenta... pero constante
                loseDistance: opts.loseDistance != null ? opts.loseDistance : 30,
                lostTimeMs: opts.lostTimeMs != null ? opts.lostTimeMs : 8000,
                lookAtPlayer: true,
                autoAnim: true,
                hover: true,                      // flota: sin gravedad
                spawnAnim: 'up',                  // emerge al aparecer
                catchAnim: 'spotted',             // te vio... de cerca
                despawnAnim: 'despawn',           // se desvanece
                ...opts
            });
        },
        // Stalker (stalker_3d_angry.glb): Weeping Angel. Corre hacia ti,
        // pero se CONGELA cuando lo miras. Parpadea y ya esta mas cerca.
        spawnStalker(offset = 12, opts = {}) {
            const p = getGame()?.player?.pos;
            if (!p) { console.warn(TAG + ' no hay player aun'); return null; }
            if (state.customs.has('stalker')) MF_CustomModels.despawn('stalker');
            const rec = MF_CustomModels.spawn('stalker_3d_angry.glb', p.x + offset, p.y + 1, p.z, {
                id: 'stalker',
                height: opts.height || 1.9,
                bodyHalf: opts.bodyHalf || 0.5,
                followPlayer: true,
                stopDistance: opts.stopDistance != null ? opts.stopDistance : 1.2,
                maxSpeed: opts.maxSpeed || 3.4,
                loseDistance: opts.loseDistance != null ? opts.loseDistance : 40,
                lostTimeMs: opts.lostTimeMs != null ? opts.lostTimeMs : 10000,
                lookAtPlayer: true,
                autoAnim: true,
                weeping: true,   // se congela si lo miras
                ...opts
            });
            return rec;
        },
        rescan
    };
    // reproducir un sonido de assets/sounds/ (para comandos)
    window.MF_CustomModels.playSound = (file, vol = 0.8) => playSoundUrl(file, vol);
    state.yawSign = 1;

    // Reproduce el intro.ogg cuando aparece Verity, con la anim "talk"
    // viva durante TODO el audio (keep-alive, igual que el TTS de VerityAI).
    async function playIntro(id, recId) {
        try {
            const url = await bridgeFetchUrl('intro.ogg', 'assets');
            const audio = new Audio(url);
            audio.volume = 0.9;
            // anim talk extendida mientras suene el intro
            MF_CustomModels.playAnim(recId, 'talk', 10000);
            const keeper = setInterval(() => {
                const rec = state.customs.get(recId);
                if (!rec || rec.dead || audio.ended || audio.paused) {
                    clearInterval(keeper);
                    return;
                }
                MF_CustomModels.playAnim(recId, 'talk', 700);
            }, 500);
            audio.addEventListener('ended', () => clearInterval(keeper), { once: true });
            audio.addEventListener('pause', () => clearInterval(keeper), { once: true });
            await audio.play();
            console.log(TAG + ' intro.ogg reproduciendose');
        } catch (err) {
            console.warn(TAG + ' intro falló: ' + (err?.message || err));
        }
    }

    // Reproduce un .ogg de assets/sounds/ (silencioso si no existe)
    async function playSoundUrl(file, volume = 0.8) {
        try {
            const url = await bridgeFetchUrl(file, 'assets/sounds');
            const audio = new Audio(url);
            audio.volume = volume;
            await audio.play();
            return audio;
        } catch {
            return null; // sonido opcional: no existe → silencio
        }
    }

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

    // red de seguridad: si algun objeto de CustomModels quedo colgado del rig de
    // la camara (clase del juego con side-effects), lo remueve y avisa.
    // Traverse profundo: el eco puede estar a varios niveles bajo la camara.
    function purgeUnderCam() {
        const cam = getGame()?.gameScene?.axesHelper?.parent;
        if (!cam) return;
        let purged = 0;
        const walk = (o) => {
            for (const c of [...(o.children || [])]) {
                if (c?.userData?.__mfCM) {
                    try { o.remove(c); purged++; } catch {}
                    continue; // sus hijos marcados ya no cuelgan de la camara
                }
                walk(c);
            }
        };
        walk(cam);
        if (purged) console.warn(TAG + ' purgados ' + purged + ' objetos pegados a la camara');
    }

    function grabCtors() {
        if (state.ctors) return state.ctors;
        try {
            const lf = findHandRenderer(getGame());
            const arm = lf?.rightArm;
            if (!arm?.geometry?.attributes?.position) return null;
            const armMat = arm.material;
            // OJO: el renderer del juego SOLO dibuja sus propias clases (traversal
            // custom) — con clases vanilla de three.js el modelo queda INVISIBLE.
            // Usamos las clases exactas del juego; el side-effect de auto-registro
            // en el rig de la camara lo neutraliza purgeUnderCam().
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
                // CRITICO: el material del brazo 1a persona usa depthTest=false
                // (para no ser cortado por el mundo). Sin forzar esto, TODOS los
                // modelos custom se dibujan encima de todo = "pegados a la camara"
                if ('depthTest' in mat) mat.depthTest = true;
                if ('depthWrite' in mat) mat.depthWrite = true;
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
        const mesh = new ctors.Mesh(geo, mat);
        try { (mesh.userData = mesh.userData || {}).__mfCM = true; } catch {}
        return mesh;
    }

    async function buildScene(parsed, ctors, fallbackMat) {
        const { json: gltf } = parsed;
        const root = new ctors.Group();
        // marca de agua tambien en los originales (el cache los conserva vivos)
        try { (root.userData = root.userData || {}).__mfCM = true; } catch {}
        const groups = new Map();
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        async function addNode(idx, parentGroup, parentMat) {
            const node = gltf.nodes?.[idx];
            if (!node) return;
            const worldMat = mat4Mul(parentMat, nodeMatrix(node));
            const g = new ctors.Group();
            try { (g.userData = g.userData || {}).__mfCM = true; } catch {}
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

    function bridgeFetchUrl(file, dir) {
        return new Promise((resolve, reject) => {
            const nonce = 'mf' + (++reqSeq) + '_' + Date.now();
            pendingFetches.set(nonce, { resolve, reject });
            document.dispatchEvent(new CustomEvent('minifeather:model-fetch-request', { detail: JSON.stringify({ nonce, file, dir }) }));
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

    // ─── Bedrock .geo.json → pseudo-GLTF (cajas/entidades estilo MCPE) ──
    // Convierte bones/cubes con UV de caja Bedrock a la misma forma que
    // produce parseGLB, para que buildScene/cloneInstance funcionen igual.
    // 1 unidad Bedrock = 1 pixel = 1/16 bloque.
    let geoImageSeq = 1000;

    function parseBedrockGeo(json, texUri) {
        const geo = json['minecraft:geometry']?.[0];
        if (!geo?.bones?.length) throw new Error('geo.json sin bones');
        const desc = geo.description || {};
        const TW = desc.texture_width || 16;
        const TH = desc.texture_height || 16;
        const S = 1 / 16;

        const bufferViews = [];
        const accessors = [];
        const chunks = [];
        let offset = 0;

        function pushView(typedArr) {
            const pad = (4 - (offset % 4)) % 4;
            if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
            const bytes = new Uint8Array(typedArr.buffer, typedArr.byteOffset, typedArr.byteLength);
            bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
            chunks.push(bytes);
            offset += bytes.byteLength;
            return bufferViews.length - 1;
        }

        function addAccessor(typedArr, type, componentType) {
            const count = typedArr.length / { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
            accessors.push({ bufferView: pushView(typedArr), componentType, count, type });
            return accessors.length - 1;
        }

        // UV de caja Bedrock: norte (u+d,v+d,w,h), sur (u+2d+w,...), este,
        // oeste, up, down. Cubos con una dimension 0 = plano (una sola cara).
        function faceQuads(cube) {
            const [ox, oy, oz] = cube.origin;
            const [sx, sy, sz] = cube.size;
            const minX = ox, maxX = ox + sx, minY = oy, maxY = oy + sy, minZ = oz, maxZ = oz + sz;
            const u = cube.uv?.[0] || 0, v = cube.uv?.[1] || 0;
            const w = sx, h = sy, d = sz;
            const quads = [];
            const F = (tl, bl, br, tr, reg, n) => quads.push({ tl, bl, br, tr, reg, n });
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
            F([maxX, maxY, minZ], [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [u + d, v + d, w, h], [0, 0, -1]); // norte
            F([minX, maxY, maxZ], [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [u + 2 * d + w, v + d, w, h], [0, 0, 1]); // sur
            F([maxX, maxY, maxZ], [maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [u + d + w, v + d, d, h], [1, 0, 0]); // este
            F([minX, maxY, minZ], [minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [u, v + d, d, h], [-1, 0, 0]); // oeste
            F([minX, maxY, minZ], [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [u + d, v, w, d], [0, 1, 0]); // arriba
            F([maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ], [minX, minY, minZ], [u + d + w, v, w, d], [0, -1, 0]); // abajo
            return quads;
        }

        function buildCube(cube, pivot) {
            const pos = [], nor = [], uvs = [], idx = [];
            let vi = 0;
            for (const q of faceQuads(cube)) {
                const [ru, rv, rw, rh] = q.reg;
                const corners = [q.tl, q.bl, q.br, q.tr];
                const uvc = [[ru, rv], [ru, rv + rh], [ru + rw, rv + rh], [ru + rw, rv]];
                for (let i = 0; i < 4; i++) {
                    const c = corners[i];
                    pos.push((c[0] - pivot[0]) * S, (c[1] - pivot[1]) * S, (c[2] - pivot[2]) * S);
                    nor.push(q.n[0], q.n[1], q.n[2]);
                    uvs.push(uvc[i][0] / TW, uvc[i][1] / TH);
                }
                idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
                vi += 4;
            }
            return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uvs), idx: new Uint32Array(idx) };
        }

        const bones = geo.bones;
        const boneByName = new Map(bones.map((b) => [b.name, b]));
        const nodes = [];
        const nodeOf = new Map();
        for (const b of bones) { const n = { name: b.name }; nodeOf.set(b.name, n); nodes.push(n); }

        const meshes = [];
        for (const b of bones) {
            const node = nodeOf.get(b.name);
            const pivot = b.pivot || [0, 0, 0];
            const pp = b.parent ? (boneByName.get(b.parent)?.pivot || [0, 0, 0]) : [0, 0, 0];
            node.translation = [(pivot[0] - pp[0]) * S, (pivot[1] - pp[1]) * S, (pivot[2] - pp[2]) * S];
            if (b.cubes?.length) {
                const prims = [];
                for (const cube of b.cubes) {
                    const dt = buildCube(cube, pivot);
                    prims.push({
                        attributes: {
                            POSITION: addAccessor(dt.pos, 'VEC3', 5126),
                            NORMAL: addAccessor(dt.nor, 'VEC3', 5126),
                            TEXCOORD_0: addAccessor(dt.uv, 'VEC2', 5126)
                        },
                        indices: addAccessor(dt.idx, 'SCALAR', 5125),
                        material: 0
                    });
                }
                node.mesh = meshes.length;
                meshes.push({ primitives: prims });
            }
        }

        const roots = [];
        for (const b of bones) {
            const i = nodes.indexOf(nodeOf.get(b.name));
            if (b.parent && nodeOf.has(b.parent)) {
                const p = nodeOf.get(b.parent);
                p.children = [...(p.children || []), i];
            } else roots.push(i);
        }

        // indice de imagen unico (evita colisionar el cache de texturas con GLBs)
        const imgIdx = geoImageSeq++;
        const images = [];
        images[imgIdx] = { uri: texUri, mimeType: 'image/png' };

        const bin = new ArrayBuffer(offset);
        const binU8 = new Uint8Array(bin);
        let at = 0;
        for (const c of chunks) { binU8.set(c, at); at += c.byteLength; }

        const nodeIdxOf = new Map();
        for (let i = 0; i < nodes.length; i++) if (nodes[i]?.name) nodeIdxOf.set(nodes[i].name, i);

        return {
            bin,
            json: {
                asset: { version: '2.0' },
                scene: 0,
                scenes: [{ nodes: roots }],
                nodes,
                meshes,
                materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, alphaMode: 'BLEND', doubleSided: true }],
                textures: [{ source: imgIdx }],
                images,
                accessors,
                bufferViews,
                buffers: [{ byteLength: offset }]
            },
            nodeIdxOf,
            nodes
        };
    }

    async function parseGeoModel(file) {
        const json = JSON.parse(new TextDecoder().decode(await fetchModelArrayBuffer(file)));
        const texBytes = new Uint8Array(await fetchModelArrayBuffer(file.replace(/\.geo\.json$/i, '') + '.png'));
        let s = '';
        for (let i = 0; i < texBytes.length; i += 0x8000) s += String.fromCharCode.apply(null, texBytes.subarray(i, i + 0x8000));
        const parsed = parseBedrockGeo(json, 'data:image/png;base64,' + btoa(s));
        // Animaciones Bedrock: mismo nombre base + .animation.json (opcional)
        const animFile = file.replace(/\.geo\.json$/i, '') + '.animation.json';
        try {
            const animJson = JSON.parse(new TextDecoder().decode(await fetchModelArrayBuffer(animFile)));
            parsed.json.animations = bedrockAnimToTracks(animJson, parsed.nodeIdxOf, parsed.nodes);
            console.log(TAG + ' bedrock anims: ' + parsed.json.animations.map((a) => a.name).join(', '));
        } catch {
            console.log(TAG + ' sin animaciones bedrock para ' + file);
        }
        return parsed;
    }

    // ─── Animaciones Bedrock (.animation.json) → tracks glTF ───
    // Bedrock rota en GRADOS con pitch/roll de signo invertido a three.js
    // (yaw igual; verificado con las tapas de la caja: sin invertir Z se
    // clavan a traves de la caja en "open"). Positions en px → ×1/16.
    function deg2quat(x, y, z) {
        const d = Math.PI / 180;
        const hx = -x * d / 2, hy = y * d / 2, hz = -z * d / 2;
        const cx = Math.cos(hx), sx = Math.sin(hx);
        const cy = Math.cos(hy), sy = Math.sin(hy);
        const cz = Math.cos(hz), sz = Math.sin(hz);
        // Euler XYZ → quaternion
        const w = cx * cy * cz + sx * sy * sz;
        const qx = sx * cy * cz - cx * sy * sz;
        const qy = cx * sy * cz + sx * cy * sz;
        const qz = cx * cy * sz - sx * sy * cz;
        return [qx, qy, qz, w];
    }

    const EASINGS = {
        linear: (u) => u,
        easeOutCirc: (u) => 1 - Math.sqrt(1 - u * u),
        easeInExpo: (u) => (u === 0 ? 0 : Math.pow(2, 10 * (u - 1))),
        easeInOutSine: (u) => -(Math.cos(Math.PI * u) - 1) / 2
    };

    // nodeIdxOf: Map boneName → indice de nodo; nodes: array glTF (rest pose)
    function bedrockAnimToTracks(animJson, nodeIdxOf, nodes) {
        const anims = [];
        const S = 1 / 16;
        for (const [name, a] of Object.entries(animJson.animations || {})) {
            const tracks = [];
            let duration = a.animation_length || 0;
            for (const [boneName, channels] of Object.entries(a.bones || {})) {
                const nodeIdx = nodeIdxOf.get(boneName);
                if (nodeIdx == null) continue;
                const rest = nodes[nodeIdx]?.translation || [0, 0, 0];
                for (const path of ['position', 'rotation', 'scale']) {
                    const chan = channels[path];
                    if (!chan) continue;
                    // iterar con la clave ORIGINAL: Number→String rompe "1.0"→"1"
                    const entries = Object.entries(chan)
                        .map(([k, kf]) => ({ ts: +k, kf }))
                        .filter((e) => Number.isFinite(e.ts))
                        .sort((a, b) => a.ts - b.ts);
                    const times = [], values = [], eases = ['linear'];
                    for (const { ts, kf } of entries) {
                        const vec = kf?.post?.vector ?? kf?.vector ?? [0, 0, 0];
                        times.push(ts);
                        eases.push(kf?.easing || 'linear');
                        if (path === 'rotation') values.push(...deg2quat(vec[0], vec[1], vec[2]));
                        else if (path === 'scale') values.push(vec[0], vec[1], vec[2]);
                        // Bedrock ANADE a la pose rest; glTF la reemplaza → sumar rest
                        else values.push(rest[0] + vec[0] * S, rest[1] + vec[1] * S, rest[2] + vec[2] * S);
                    }
                    if (times.length > 1) {
                        // path glTF: 'position' bedrock == 'translation' en el sampler
                        tracks.push({ nodeIdx, path: path === 'position' ? 'translation' : path, times, values, eases, interp: 'LINEAR', comps: path === 'rotation' ? 4 : 3 });
                        if (times[times.length - 1] > duration) duration = times[times.length - 1];
                    }
                }
            }
            if (tracks.length) anims.push({ name, duration, tracks, holdOnLast: a.loop === 'hold_on_last_frame' });
        }
        return anims;
    }

    async function loadModel(file) {
        if (modelCache.has(file)) return modelCache.get(file);
        const p = (async () => {
            let parsed;
            if (/\.geo\.json$/i.test(file)) parsed = await parseGeoModel(file);
            else parsed = parseGLB(await fetchModelArrayBuffer(file));
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
            // ya convertidas (bedrockAnimToTracks) → passthrough directo
            if (Array.isArray(a.tracks)) { anims.push(a); continue; }
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
        // marca de agua: identificar todo lo creado por CustomModels
        try {
            root2.userData = root2.userData || {};
            root2.userData.__mfCM = true;
            root2.traverse((o) => { try { (o.userData = o.userData || {}).__mfCM = true; } catch {} });
        } catch {}
        const groups = new Map();
        for (const [idx, g] of built.groups) {
            const n = map.get(g);
            if (n) groups.set(idx, n);
        }
        // buscar el grupo de la cabeza por nombre (head/cabeza/face) para el pitch
        let headNode = null;
        try {
            root2.traverse((o) => {
                if (headNode || !o.name) return;
                if (/^(head|cabeza|face|cara)$/i.test(o.name) || /head|cabeza/i.test(o.name)) headNode = o;
            });
            if (headNode) headNode.userData.__mfHeadRestQ = headNode.quaternion.clone();
        } catch {}
        const rest = [];
        const restScale = new Map();
        for (const g of groups.values()) {
            rest.push({ g, p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.clone() });
            restScale.set(g, g.scale.clone());
        }
        return { root: root2, height: built.height, minY: built.minY, groups, anims: built.anims, rest, restScale, headNode, dbg: new Set() };
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
        if (anim.duration > 0) {
            // hold_on_last_frame: congela al final en vez de loopear
            if (anim.holdOnLast && t > anim.duration) t = anim.duration - 0.0001;
            else t = t % anim.duration;
        } else t = 0;
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
            // easing del keyframe DESTINO (eases[i+2]; eases[0] es padding)
            if (tr.eases && !last) {
                const fn = EASINGS[tr.eases[i + 2]] || EASINGS.linear;
                u = fn(u);
            }
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
            // purgar el eco en el rig de camara inmediatamente
            setTimeout(() => { try { purgeUnderCam(); } catch {} }, 0);
            setTimeout(() => { try { purgeUnderCam(); } catch {} }, 500);

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
        if (!myStamp.alive) return;
        if (!state.enabled && Object.keys(state.mappings).length === 0) return;
        try { rescan(); } catch {}
        // red de seguridad: nada creado por CustomModels debe vivir bajo la camara
        try { purgeUnderCam(); } catch {}
    }, 2000);

    // ── Anti-instancia-zombi ──
    // Recargar la extension sin F5 deja el script MAIN viejo corriendo:
    // materiales depthTest=false, mapeos en memoria, tick duplicado.
    // Solo una instancia puede ser la activa; las viejas se apagan solas.
    const myStamp = { alive: true };
    try {
        const prev = window.__MF_CustomModels_Active;
        if (prev && prev !== myStamp && typeof prev.shutdown === 'function') {
            prev.alive = false;
            prev.shutdown();
        } else if (prev) {
            prev.alive = false;
        }
    } catch {}
    window.__MF_CustomModels_Active = myStamp;

    function shutdown() {
        try {
            for (const mesh of [...state.applied.keys()]) {
                const rec = state.applied.get(mesh);
                try { rec.root?.parent?.remove(rec.root); } catch {}
                for (const c of rec.hidden || []) c.visible = true;
                if (rec.origRender && mesh.render === rec.wrapper) mesh.render = rec.origRender;
            }
            state.applied = new WeakMap();
            for (const rec of [...state.customs.values()]) {
                rec.dead = true;
                try { rec.root?.parent?.remove(rec.root); } catch {}
            }
            state.customs.clear();
        } catch {}
        console.log(TAG + ' instancia anterior apagada (reload)');
    }
    myStamp.shutdown = shutdown;

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

    // ¿el jugador esta mirando a la entidad? (dot de mirada de camara vs dir a la entidad)
    // busca una anim por nombre exacto o sufijo ("run" → "animation.stalker.run")
    function findAnim(inst, wanted) {
        if (!inst?.anims?.length || !wanted) return null;
        for (const a of inst.anims) if (a.name === wanted) return a.name;
        const lower = String(wanted).toLowerCase();
        for (const a of inst.anims) {
            const n = a.name.toLowerCase();
            if (n.endsWith('.' + lower) || n.endsWith('/' + lower) || n.endsWith('_' + lower)) return a.name;
        }
        for (const a of inst.anims) if (a.name.toLowerCase().includes(lower)) return a.name;
        return null;
    }

    function isPlayerLookingAt(rec, threshold = 0.86) {
        try {
            const cam = getGame()?.gameScene?.camera;
            if (!cam?.matrixWorld) return false;
            const e = cam.matrixWorld.elements;
            // -Z de la camara = hacia donde miras
            const fx = -e[8], fy = -e[9], fz = -e[10];
            const root = rec.root;
            const cx = root.position.x, cy = root.position.y + (rec.height || 1) * 0.6, cz = root.position.z;
            const p = getGame()?.player?.pos;
            const ox = p.x, oy = p.y + 1.6, oz = p.z; // ojos del player
            let dx = cx - ox, dy = cy - oy, dz = cz - oz;
            const d = Math.hypot(dx, dy, dz);
            if (d < 1e-4) return true;
            dx /= d; dy /= d; dz /= d;
            return (fx * dx + fy * dy + fz * dz) >= threshold;
        } catch {
            return false;
        }
    }

    function physicsStep(rec, dt, wantX, wantZ) {        const root = rec.root;
        // hover: flota — sin gravedad ni colision, movimiento directo
        if (rec.hover) {
            let moved = false;
            if (Math.abs(wantX) > 1e-9) { root.position.x += wantX; moved = true; }
            if (Math.abs(wantZ) > 1e-9) { root.position.z += wantZ; moved = true; }
            // mantener la altura objetivo (flota ~1 bloque sobre el suelo, si hay)
            const half = rec.bodyHalf || 0.21;
            const targetY = rec.hoverY != null ? rec.hoverY : root.position.y;
            const c = boxCollides(root.position.x, targetY - 0.5, root.position.z, half, 0.5);
            if (c === true) {
                // sube suave hasta salir del suelo
                root.position.y += 2 * dt;
            } else {
                root.position.y += (targetY - root.position.y) * Math.min(1, dt * 2);
            }
            rec.onGround = false;
            rec.vy = 0;
            return moved;
        }
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
        if (rec.puppet) return; // marioneta P2P: la mueve la red (MF_Peer), no la IA local
        if (!rec.followPlayer || rec.stay) {
            // entidad estatica (o en modo "stay"): solo gravedad, para asentarse
            // en el suelo. "stay" congela la persecucion pero NO despawnea.
            physicsStep(rec, dt, 0, 0);
            rec.actuallyMoving = false;
            return;
        }
        const p = getGame()?.player?.pos;
        if (!p) return;
        const distToPlayer = Math.hypot(p.x - root.position.x, p.y - root.position.y, p.z - root.position.z);
        // modo persistente: si te alejas demasiado NO desaparece; se queda
        // esperando en su pos actual (los chunks descargados congelan la fisica
        // solos via boxCollides→null) y reaparece al volver / recargar chunks
        if (rec.persist !== false && rec.loseDistance > 0 && distToPlayer > rec.loseDistance * 4) {
            if (rec.smooth === false) {
                // solo el modo teleport directo se recupera asi (cambio de mundo)
                root.position.set(p.x, p.y, p.z);
                rec.vy = 0;
                console.log(TAG + ' "' + rec.id + '" teleportada a tu lado (cambio de mundo?)');
            } else {
                if (!rec.waitingFar) {
                    rec.waitingFar = true;
                    console.log(TAG + ' "' + rec.id + '" esperando en (' + root.position.x.toFixed(1) + ', ' + root.position.y.toFixed(1) + ', ' + root.position.z.toFixed(1) + ') hasta que vuelvas');
                }
                physicsStep(rec, dt, 0, 0); // gravedad si el terreno lo permite
                rec.actuallyMoving = false;
                return;
            }
            return;
        }
        if (rec.waitingFar) rec.waitingFar = false;
        if (rec.loseDistance > 0 && distToPlayer > rec.loseDistance) {
            if (!rec.lost) {
                rec.lost = true;
                rec.lostSince = t;
                console.log(TAG + ' "' + rec.id + '" te perdio (dist=' + distToPlayer.toFixed(1) + ')');
            }
            if (t - rec.lostSince > rec.lostTimeMs) {
                if (rec.persist === false) {
                    MF_CustomModels.despawn(rec.id);
                    console.log(TAG + ' "' + rec.id + '" desaparecio tras perderte.');
                    return false;
                }
                // persistente: se queda esperando, no despawnea
                return;
            }
        } else if (rec.lost) {
            rec.lost = false;
            rec.lostSince = 0;
        }
        const stopDist = rec.stopDistance || 1.8;
        let movingThisTick = false;
        // weeping (Weeping Angel): si lo estas mirando, se congela
        if (rec.weeping && isPlayerLookingAt(rec, 0.86)) {
            rec.frozen = true;
            rec.actuallyMoving = false;
            return; // ni fisica: estatua total
        }
        if (rec.frozen) {
            rec.frozen = false;
            console.log(TAG + ' "' + rec.id + '" se mueve otra vez...');
        }
        if (rec.smooth === false) {
            root.position.set(p.x, p.y, p.z);
            movingThisTick = true;
        } else if (rec.fallingSpawn && rec.onGround === false) {
            // spawn aereo: caer RECTO (solo gravedad) hasta aterrizar; sin esto
            // la persecucion horizontal la arrastra hasta el player mientras cae
            physicsStep(rec, dt, 0, 0);
            movingThisTick = false;
        } else if (rec.fallingSpawn && rec.onGround !== false) {
            rec.fallingSpawn = false; // aterrizo: comportamiento normal desde ya
            physicsStep(rec, dt, 0, 0);
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
                        const airborne = rec.onGround === false && !rec.hover;
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
                            want = (jumpName && findAnim(rec.inst, jumpName)) || findAnim(rec.inst, 'jump') || findAnim(rec.inst, 'idle');
                        } else if (moving && stable) {
                            want = findAnim(rec.inst, 'walk') || findAnim(rec.inst, 'run') || rec.anim || findAnim(rec.inst, 'idle');
                        } else if (moving && !stable) {
                            // transicion: mantener la anim actual si ya corre
                            want = (rec.curAnim && findAnim(rec.inst, rec.curAnim) ? rec.curAnim : (findAnim(rec.inst, 'run') || findAnim(rec.inst, 'walk')));
                        } else {
                            want = rec.anim || findAnim(rec.inst, 'idle') || findAnim(rec.inst, 'calm');
                        }
                        // catchAnim (terror): al llegar por primera vez a distancia
                        // de contacto, reproducir la anim de "te atrape" una vez
                        if (rec.catchAnim && !rec.caught && !(rec.animOverride && t < rec.animOverride.until)) {
                            const pp2 = getGame()?.player?.pos;
                            const distNow = pp2 ? Math.hypot(pp2.x - root.position.x, pp2.z - root.position.z) : Infinity;
                            if (distNow <= (rec.stopDistance || 1.8) + 0.4) {
                                rec.caught = true;
                                const cn = findAnim(rec.inst, rec.catchAnim);
                                if (cn) {
                                    const anim = rec.inst.anims.find((a) => a.name === cn);
                                    const ms = Math.max(1500, (anim?.duration || 1.5) * 1000);
                                    rec.animOverride = { name: cn, start: t, until: t + ms };
                                    rec.curAnim = cn;
                                    rec.animStart = t;
                                    console.log(TAG + ' "' + rec.id + '" te tiene. "' + cn + '"');
                                }
                            }
                        }
                        const resolved = want ? findAnim(rec.inst, want) : null;
                        if (resolved && rec.curAnim !== resolved) {
                            if (!rec.curAnim) console.log(TAG + ' "' + rec.id + '" anim: ' + resolved);
                            rec.curAnim = resolved;
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
                            // al caminar la cara vuelve a nivel (pitch 0)
                            rec.headPitch = (rec.headPitch || 0) * (1 - Math.min(1, dt * 6));
                        } else if (rec.lookAtPlayer !== false && !rec.frozen) {
                            // quieta: mirar al jugador (a la camara)
                            const pp = getGame()?.player?.pos;
                            if (pp) {
                                const pdx = pp.x - root.position.x, pdz = pp.z - root.position.z;
                                const dHoriz2 = pdx * pdx + pdz * pdz;
                                if (dHoriz2 > 0.04) {
                                    const targetYaw = Math.atan2(-pdx, -pdz) + (rec.yawOffset || 0);
                                    let delta = targetYaw - root.rotation.y;
                                    while (delta > Math.PI) delta -= 2 * Math.PI;
                                    while (delta < -Math.PI) delta += 2 * Math.PI;
                                    root.rotation.y += delta * Math.min(1, dt * 4); // giro lento y suave
                                }
                                // pitch: inclinar la cara hacia arriba/abajo segun tu altura
                                // (se aplica despues de sampleAnim para que la anim no lo pise)
                                if (rec.lookUp !== false) {
                                    const headY = root.position.y + (rec.headHeight ?? 1.3);
                                    const dy = pp.y - headY;
                                    const dHoriz = Math.sqrt(Math.max(dHoriz2, 0.04));
                                    let pitch = Math.atan2(dy, dHoriz);
                                    if (pitch > 0.75) pitch = 0.75;   // ~43 grados arriba
                                    if (pitch < -0.75) pitch = -0.75; // ~43 grados abajo
                                    rec.headPitch = (rec.headPitch || 0) + (pitch - (rec.headPitch || 0)) * Math.min(1, dt * 4);
                                }
                            }
                        }
                        const now = t;
                        const ov = rec.animOverride;
                        if (ov && now >= ov.until) { rec.animOverride = null; }
                        const animToPlay = (ov && now < ov.until) ? ov.name : rec.curAnim;
                        if (animToPlay) {
                            restoreRest(rec.inst);
                            const animT0 = (ov && now < ov.until) ? ov.start : rec.animStart;
                            // estatua (weeping angel congelado): el tiempo de anim
                            // tambien se congela — queda en un pose fija
                            if (rec.frozen) {
                                if (rec.frozenAnimT == null) rec.frozenAnimT = (now - animT0) / 1000 * rec.animSpeed;
                            } else {
                                rec.frozenAnimT = null;
                            }
                            const at = rec.frozen ? rec.frozenAnimT : (now - animT0) / 1000 * rec.animSpeed;
                            sampleAnim(rec.inst, animToPlay, at);
                        }
                        // pitch de mirada (aplicado DESPUES de sampleAnim para que la
                        // animacion no lo pise): inclinar la cabeza hacia el jugador
                        // (excepto congelado: una estatua no gira la cabeza)
                        if (rec.headPitch && !rec.frozen) {
                            try {
                                const hn = rec.inst.headNode;
                                if (hn) {
                                    // restaurar pose de reposo y aplicar UNA sola rotacion
                                    // (rotateX acumula; sin reset gira sin parar)
                                    const restQ = hn.userData.__mfHeadRestQ;
                                    if (restQ) hn.quaternion.copy(restQ);
                                    hn.rotateX(rec.headPitch);
                                } else {
                                    // sin bone cabeza: inclinar el cuerpo (asignacion directa,
                                    // sin acumular). Base = rotation.x del root al primer uso.
                                    if (typeof rec.rootPitchBase !== 'number') rec.rootPitchBase = root.rotation.x;
                                    root.rotation.x = rec.rootPitchBase + rec.headPitch;
                                }
                            } catch {}
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
        requestAnimationFrame(() => { if (myStamp.alive) tickCustoms(); });
    })();

    console.log(TAG + ' cargado. Ejemplos:');
    console.log(TAG + "  MF_CustomModels.set('pig', 'mipuerco.glb')");
    console.log(TAG + "  MF_CustomModels.remove('pig')");
    console.log(TAG + '  MF_CustomModels.list()');
    console.log(TAG + ' Carpeta: models/entities/ del client (recarga la extension al agregar archivos)');
})();
