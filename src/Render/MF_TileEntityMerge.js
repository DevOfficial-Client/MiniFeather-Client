(function () {
    'use strict';

    // re-ejecución (hot-reload)
    try { window.__MF_TEMERGE_SCOPE__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather temerge';

    // ─────────────────────────────────────────────────────────────────────
    // El chunk-mesher del juego fusiona [geometría opaca, ...muebles] con
    // mergeGeometries(), que exige sets de atributos IDÉNTICOS (los nombres
    // salen del PRIMERO y cada geometría debe tener exactamente esos). El
    // juego backfillea solo light/wave/emissive; este guardián:
    //
    // v1 — alinea TODA geometría de tile entity al set de 9 base con las
    //      recetas del propio setGeometry del juego.
    // v2 — watcher del updateChunkMesh: diffea en caliente opaco vs muebles
    //      cuando el merge falla (el log dice el par y los atributos).
    // v3 — dos guardianes nuevos, salidos de un log real (2026-10-08):
    //      a) LeafWind añade `mfLeaf` al OPACO → el mueble queda corto
    //         (falta=[mfLeaf]) y el merge falla para siempre. Ahora los
    //         extras del opaco SE APRENDEN y se rellenan en los muebles
    //         (ceros = sin viento, correcto) + re-intento inmediato del
    //         merge, sin esperar al próximo remesh.
    //      b) crash "applyBoneTransform → undefined.getX": el builder de
    //         rigs del juego (skinnedRig) crea SkinnedMesh cuyas geometrías
    //         a veces llegan sin skinIndex/skinWeight → cada frame muere en
    //         computeBoundingSphere y el render se congela. Guard por
    //         prototype: si falta el atributo se rellena (hueso 0, peso 1 —
    //         la misma receta del builder) y el frame sigue su camino.
    // ─────────────────────────────────────────────────────────────────────

    const BASE = ['position', 'color', 'normal', 'uv', 'overlayUV', 'animation', 'light', 'wave', 'emissive'];

    const state = {
        game: null,
        timer: 0,
        heartbeat: 0,
        patched: null,
        watched: null,
        logged: new Set(),
        extras: new Map(),       // nombre → {arrayCtor, itemSize, normalized}
        skinPatched: [],         // [{proto, orig}]
        rigRepairs: 0,
        mergeRetries: 0,
        destroyed: false
    };

    function findGame() {
        try {
            if (window.__MINIBLOX_GAME__?.player && window.__MINIBLOX_GAME__?.world) {
                return window.__MINIBLOX_GAME__;
            }
            const root = document.getElementById('react');
            if (!root) return null;
            for (const key in root) {
                const game = root[key]?.updateQueue?.baseState?.element?.props?.game;
                if (game?.player && game?.world) return game;
            }
        } catch (_) {}
        return null;
    }

    function logOnce(kind, what) {
        const key = kind + '|' + what;
        if (state.logged.has(key)) return;
        state.logged.add(key);
        console.info(TAG, `${kind}: ${what}`);
    }

    // recetas calcadas del setGeometry/ensure* del juego (mismo formato y
    // normalización; un atributo distinto en tipo rompe el shader, no el merge)
    function backfill(geo, kind) {
        const pos = geo.attributes.position;
        if (!pos) return;
        const C = pos.constructor;   // clase PLANA de atributo (lección WaterStyle)
        const add = (name, make) => {
            if (geo.attributes[name]) return;
            try { geo.setAttribute(name, make(C, pos.count)); logOnce(kind, 'sin ' + name); } catch (_) {}
        };
        add('color', (c, n) => new c(new Uint8Array(n * 4).fill(255), 4, true));
        add('overlayUV', (c, n) => new c(new Float32Array(n * 2), 2));
        add('animation', (c, n) => new c(new Uint8Array(n * 2), 2));
        add('light', (c, n) => new c(new Uint8Array(n * 3).fill(255), 3, true));
        add('wave', (c, n) => new c(new Float32Array(n), 1));
        add('emissive', (c, n) => new c(new Uint8Array(n), 1, true));
        // extras aprendidos del opaco (mfLeaf y lo que venga): ceros con la
        // receta EXACTA del original (ctor del array + itemSize) o el merge
        // se queja de tipos
        for (const [name, rec] of state.extras) {
            if (geo.attributes[name]) continue;
            try {
                const arr = new rec.arrayCtor(pos.count * rec.itemSize);
                geo.setAttribute(name, new C(arr, rec.itemSize, rec.normalized));
                logOnce(kind, 'sin ' + name + ' (extra aprendido)');
            } catch (_) {}
        }
    }

    function align(model) {
        const geo = model?.root?.geometry || model?.geometry;
        if (!geo?.attributes?.position) return;
        const kind = model.name || (typeof model.getName === 'function' && model.getName()) ||
            model.constructor?.name || '?';
        backfill(geo, kind);
        // extras que nadie conoce (ni base ni aprendidos) también revientan
        // el merge, pero quitarlos puede romper shaders scene-only: reportados
        const known = new Set([...BASE, ...state.extras.keys()]);
        for (const name of Object.keys(geo.attributes)) {
            if (!known.has(name)) logOnce(kind, 'EXTRA ' + name + ' (sin quitar, reporta esto)');
        }
    }

    function sweep(ter, cm) {
        try {
            // modelos ya vivos (creados antes de este módulo)
            for (const model of (ter?.tileEntityModels?.values?.() || [])) align(model);
            // ya insertados en chunks y aún en cola de chunks sin malla
            for (const rec of (cm?.meshes?.values?.() || [])) {
                learnExtras(rec?.opaque?.geometry);
                for (const model of (rec?.tileEntities?.values?.() || [])) align(model);
            }
            for (const arr of (cm?.tileEntityQueue?.values?.() || [])) {
                for (const model of (arr || [])) align(model);
            }
        } catch (_) {}
    }

    // ── extras del opaco: la receta que el merge exige ────────────────────
    function learnExtras(geo) {
        if (!geo?.attributes) return;
        for (const [name, attr] of Object.entries(geo.attributes)) {
            if (BASE.includes(name) || state.extras.has(name)) continue;
            const arrCtor = attr?.array?.constructor;
            if (!arrCtor || !(attr.itemSize > 0)) continue;
            state.extras.set(name, { arrayCtor: arrCtor, itemSize: attr.itemSize, normalized: !!attr.normalized });
            logOnce('extras', 'aprendido del opaco: ' + name + ' (itemSize ' + attr.itemSize + ')');
        }
    }

    function patch(ter) {
        if (state.patched || typeof ter?.rebuildTileEntity !== 'function') return;
        const orig = ter.rebuildTileEntity;
        const wrapped = function (te) {
            const r = orig.apply(this, arguments);
            try {
                // el modelo queda en tileEntityModels en TODOS los caminos
                align(this.tileEntityModels?.get(te?.pos));
            } catch (_) {}
            return r;
        };
        ter.rebuildTileEntity = wrapped;
        state.patched = { ter, orig, wrapped };
    }

    // ── v2/v3: watcher del updateChunkMesh — diff, repair y re-merge ─────
    // duck-typing de Map (el juego usa una SUBCLASE de Map para meshes, y
    // instanceof cruza reinos mal en los tests)
    function looksLikeManager(o) {
        return !!(o && o.meshes && typeof o.meshes.values === 'function' &&
            typeof o.updateChunkMesh === 'function');
    }

    function findChunkManager(game) {
        let cm = game.chunkRenderManager || game.chunkManager;
        if (looksLikeManager(cm)) return cm;
        const q = [[game, 0]];
        const seen = new WeakSet();
        let visited = 0;
        while (q.length && visited < 4000) {
            const [o, d] = q.shift();
            if (!o || (typeof o !== 'object' && typeof o !== 'function') || d > 4 || seen.has(o)) continue;
            seen.add(o); visited++;
            if (looksLikeManager(o)) return o;
            let keys = [];
            try { keys = Object.keys(o).slice(0, 60); } catch { continue; }
            for (const k of keys) {
                let v; try { v = o[k]; } catch { continue; }
                if (v && (typeof v === 'object' || typeof v === 'function') && !v.isMesh) q.push([v, d + 1]);
            }
        }
        return null;
    }

    function attrNames(geo) {
        return geo?.attributes ? Object.keys(geo.attributes).sort() : null;
    }

    function kindOf(te) {
        return te?.name || (typeof te?.getName === 'function' && te.getName()) || te?.constructor?.name || '?';
    }

    // diff + repair del chunk que acaba de subir: devuelve true si reparó algo
    function repairChunk(cm, meshResult) {
        if (!meshResult || meshResult.chunkX === undefined ||
            !(cm?.meshes && typeof cm.meshes.values === 'function')) return false;
        let rec = null;
        for (const r of cm.meshes.values()) {
            if (r?.pos && r.pos.x === meshResult.chunkX && r.pos.z === meshResult.chunkZ) { rec = r; break; }
        }
        if (!rec?.tileEntities?.size) return false;
        const opGeo = rec.opaque?.geometry;
        if (!opGeo?.attributes) return false;
        learnExtras(opGeo);
        const op = Object.keys(opGeo.attributes);
        let repaired = false;
        for (const te of rec.tileEntities.values()) {
            const geo = te.root?.geometry || te.geometry;
            if (!geo?.attributes?.position) continue;
            const ta = Object.keys(geo.attributes);
            const falta = op.filter(a => !ta.includes(a));
            const sobra = ta.filter(a => !op.includes(a));
            if (!falta.length && !sobra.length) continue;
            const kind = kindOf(te);
            if (falta.length) {
                // re-alineación con los extras ya aprendidos: el backfill
                // rellena TODO lo que falte (base + extras)
                backfill(geo, kind + '|repair');
                const ta2 = Object.keys(geo.attributes);
                const falta2 = op.filter(a => !ta2.includes(a));
                const ok = falta2.length === 0 && sobra.length === 0;
                logOnce(kind + '|diff', `${kind}: MISMATCH REAL — opaco=[${op.sort().join(',')}] ` +
                    `mueble=[${ta.sort().join(',')}] falta=[${falta.join(',')}] sobra=[${sobra.join(',')}]` +
                    (ok ? ' — rellenado, re-merge agendado' : ' — NO cubierto por el relleno, reporta esto'));
                if (ok) repaired = true;
            } else {
                logOnce(kind + '|diff', `${kind}: MISMATCH REAL — opaco=[${op.sort().join(',')}] ` +
                    `mueble=[${ta.sort().join(',')}] falta=[] sobra=[${sobra.join(',')}] — extra no removible, reporta esto`);
            }
        }
        return repaired;
    }

    function watchMerge(cm) {
        if (state.watched || typeof cm?.updateChunkMesh !== 'function') return;
        const orig = cm.updateChunkMesh;
        const wrapped = function (meshResult) {
            const r = orig.apply(this, arguments);
            try {
                // repair devuelve true si rellenó atributos que faltaban: el
                // merge de ESTE frame ya reventó, así que re-intentamos una
                // sola vez con los sets ya alineados (sin re-entrar al wrap)
                if (repairChunk(this, meshResult)) {
                    state.mergeRetries++;
                    orig.apply(this, [meshResult]);
                }
            } catch (_) {}
            return r;
        };
        cm.updateChunkMesh = wrapped;
        state.watched = { cm, orig, wrapped };
        console.info(TAG, '✔ watcher v3 del updateChunkMesh: diff + relleno de extras + re-merge del chunk');
    }

    // ── guardián del rig skinned (crash applyBoneTransform) ───────────────
    // la receta del propio builder del juego: hueso 0, peso 1 — pose
    // estática pero viva, y el render no muere en cada frame
    function repairSkinAttrs(sm) {
        try {
            const geo = sm.geometry;
            const count = geo?.attributes?.position?.count;
            if (!count || !sm.skeleton?.bones?.length) return false;
            const C = geo.attributes.position.constructor;
            const si = new Uint16Array(count * 4);               // hueso 0
            const sw = new Float32Array(count * 4);
            for (let i = 0; i < count; i++) sw[i * 4] = 1;       // peso 1
            geo.setAttribute('skinIndex', new C(si, 4));
            geo.setAttribute('skinWeight', new C(sw, 4));
            return true;
        } catch (_) { return false; }
    }

    function patchSkinProto(proto) {
        if (!proto || typeof proto.applyBoneTransform !== 'function' || proto.__mfRigGuard) return false;
        const orig = proto.applyBoneTransform;
        proto.applyBoneTransform = function (index, vector) {
            const attrs = this.geometry?.attributes;
            if (!attrs?.skinIndex || !attrs?.skinWeight) {
                if (repairSkinAttrs(this)) {
                    state.rigRepairs++;
                    logOnce('rig', 'SkinnedMesh sin skinIndex/skinWeight — hueso 0 rellenado (render salvado)');
                }
            }
            return orig.apply(this, arguments);
        };
        proto.__mfRigGuard = true;
        state.skinPatched.push({ proto, orig });
        return true;
    }

    function scanSkinProtos(game) {
        let scene = null;
        try { scene = game?.gameScene?.scene; } catch (_) {}
        if (!scene || typeof scene.traverse !== 'function') return;
        try {
            scene.traverse((o) => {
                if (o?.isSkinnedMesh) patchSkinProto(Object.getPrototypeOf(o));
            });
        } catch (_) {}
    }

    function tick() {
        if (state.destroyed) return;
        // fase 1: armar guardián + watcher (como siempre)
        if (state.patched && (state.watched || (state.cmTries || 0) >= 10)) {
            if (state.timer) { clearInterval(state.timer); state.timer = 0; }
            return;
        }
        const game = state.game || findGame();
        if (!game) return;
        state.game = game;
        scanSkinProtos(game);   // fase 1 también: rigs presentes al entrar al mundo
        const ter = game.gameScene?.tileEntityRenderer;
        if (!ter) return;
        patch(ter);
        if ((state.cmTries || 0) < 10) {
            const cm = findChunkManager(game);
            if (cm) watchMerge(cm);
            else state.cmTries = (state.cmTries || 0) + 1;
        }
        // cm es opcional (solo alimenta el sweep): si el juego lo renombra,
        // el fix sigue vivo porque tileEntityModels es el mapa autoritativo
        sweep(ter, game.chunkRenderManager || game.chunkManager);
        if (state.patched && !state.armedLogged) {
            state.armedLogged = true;
            console.info(TAG, '✔ geometrías de tile entities alineadas al set de 9 antes del merge');
        }
    }

    // fase 2 (heartbeat): rigs skinned aparecen cuando entra gente — el
    // prototype se parchea UNA vez y cubre a toda su clase para siempre
    function heartbeat() {
        if (state.destroyed) return;
        const game = state.game?.player ? state.game : (state.game = findGame());
        if (!game) return;
        scanSkinProtos(game);
        // presupuesto acotado: si el manager se renombró, el BFS no corre
        // para siempre (mismo tope de intentos que la fase 1)
        if (!state.watched && (state.cmTries || 0) < 10) {
            const cm = findChunkManager(game);
            if (cm) watchMerge(cm);
            else state.cmTries = (state.cmTries || 0) + 1;
        }
    }

    function enable() {
        if (state.timer) return;
        tick();
        state.timer = setInterval(tick, 2000);
        if (!state.heartbeat) state.heartbeat = setInterval(heartbeat, 4000);
    }

    function disable() {
        if (state.timer) { clearInterval(state.timer); state.timer = 0; }
        if (state.heartbeat) { clearInterval(state.heartbeat); state.heartbeat = 0; }
        if (state.patched) {
            try { state.patched.ter.rebuildTileEntity = state.patched.orig; } catch (_) {}
            state.patched = null;
        }
        if (state.watched) {
            try { state.watched.cm.updateChunkMesh = state.watched.orig; } catch (_) {}
            state.watched = null;
        }
        for (const { proto, orig } of state.skinPatched.splice(0)) {
            try { proto.applyBoneTransform = orig; delete proto.__mfRigGuard; } catch (_) {}
        }
    }

    document.addEventListener('minifeather:temerge-config', (ev) => {
        try {
            const cfg = JSON.parse(ev.detail || '{}');
            if (cfg.enabled === true) enable();
            else if (cfg.enabled === false) disable();
        } catch (_) {}
    });

    // red de seguridad: nace ENCENDIDO — su trabajo es que el merge jamás
    // vea sets desalineados y que un rig cojo no congele el render
    enable();
    window.MF_TileEntityMerge = {
        enable, disable,
        get aligned() { return !!state.patched; },
        get watching() { return !!state.watched; },
        get extras() { return [...state.extras.keys()]; },
        get rigGuard() { return state.skinPatched.length; },
        status() {
            return {
                aligned: !!state.patched,
                watching: !!state.watched,
                extras: [...state.extras.keys()],
                rigProtos: state.skinPatched.length,
                rigRepairs: state.rigRepairs,
                mergeRetries: state.mergeRetries
            };
        }
    };
    window.__MF_TEMERGE_SCOPE__ = { destroy() { state.destroyed = true; disable(); } };
    console.info(TAG, 'módulo cargado (siempre encendido: guarda del mergeGeometries + rig skinned)');
})();
