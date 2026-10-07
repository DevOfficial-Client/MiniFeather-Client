(function () {
    'use strict';

    // re-ejecución (hot-reload)
    try { window.__MF_TEMERGE_SCOPE__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather temerge';

    // ─────────────────────────────────────────────────────────────────────
    // El chunk-mesher del juego fusiona [geometría opaca, ...muebles] con
    // mergeGeometries(), que exige sets de atributos IDÉNTICOS. El juego
    // backfillea solo light/wave/emissive; si un mueble llega sin
    // color/overlayUV/animation (o con un atributo extra), el merge revienta
    // → camas/cofres invisibles ("mergeGeometries failed, index 1").
    // Este módulo alinea TODA geometría de tile entity al set de 9 usando
    // las mismas recetas del setGeometry del propio juego. No necesita saber
    // quién los deja cojos: el log dice qué faltaba (y así cazamos al culp).
    // ─────────────────────────────────────────────────────────────────────

    const state = {
        game: null,
        timer: 0,
        patched: null,
        watched: null,
        logged: new Set(),
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
        console.info(TAG, `${kind}: ${what} — rellenado para el merge`);
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
    }

    function align(model) {
        const geo = model?.root?.geometry || model?.geometry;
        if (!geo?.attributes?.position) return;
        const kind = model.name || (typeof model.getName === 'function' && model.getName()) ||
            model.constructor?.name || '?';
        backfill(geo, kind);
        // los extras también revientan el merge, pero quitarlos puede romper
        // el shader de modelos scene-only: SOLO se reportan por ahora
        const base = ['position', 'color', 'normal', 'uv', 'overlayUV', 'animation', 'light', 'wave', 'emissive'];
        for (const name of Object.keys(geo.attributes)) {
            if (!base.includes(name)) logOnce(kind, 'EXTRA ' + name + ' (sin quitar, reporta esto)');
        }
    }

    function sweep(ter, cm) {
        try {
            // modelos ya vivos (creados antes de este módulo)
            for (const model of (ter?.tileEntityModels?.values?.() || [])) align(model);
            // ya insertados en chunks y aún en cola de chunks sin malla
            for (const rec of (cm?.meshes?.values?.() || [])) {
                for (const model of (rec?.tileEntities?.values?.() || [])) align(model);
            }
            for (const arr of (cm?.tileEntityQueue?.values?.() || [])) {
                for (const model of (arr || [])) align(model);
            }
        } catch (_) {}
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

    // ── v2: watcher del updateChunkMesh ──────────────────────────────────
    // el merge siguió fallando con muebles alineados → diffea EN CALIENTE
    // los sets del opaco vs cada mueble del chunk justo después del intento:
    // si vuelve a fallar, la consola dice el par y los atributos exactos
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
            try { keys = Object.keys(o).slice(0, 60); } catch (_) { continue; }
            for (const k of keys) {
                let v; try { v = o[k]; } catch (_) { continue; }
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

    function diffChunk(cm, meshResult) {
        if (!meshResult || meshResult.chunkX === undefined ||
            !(cm?.meshes && typeof cm.meshes.values === 'function')) return;
        let rec = null;
        for (const r of cm.meshes.values()) {
            if (r?.pos && r.pos.x === meshResult.chunkX && r.pos.z === meshResult.chunkZ) { rec = r; break; }
        }
        if (!rec?.tileEntities?.size) return;
        const op = attrNames(rec.opaque?.geometry);
        if (!op) return;
        for (const te of rec.tileEntities.values()) {
            const ta = attrNames(te.root?.geometry || te.geometry);
            if (!ta) continue;
            const falta = op.filter(a => !ta.includes(a));
            const sobra = ta.filter(a => !op.includes(a));
            if (falta.length || sobra.length) {
                const kind = kindOf(te);
                logOnce(kind + '|diff', `${kind}: MISMATCH REAL — opaco=[${op.join(',')}] ` +
                    `mueble=[${ta.join(',')}] falta=[${falta.join(',')}] sobra=[${sobra.join(',')}]`);
            }
        }
    }

    function watchMerge(cm) {
        if (state.watched || typeof cm?.updateChunkMesh !== 'function') return;
        const orig = cm.updateChunkMesh;
        const wrapped = function (meshResult) {
            const r = orig.apply(this, arguments);
            try { diffChunk(this, meshResult); } catch (_) {}
            return r;
        };
        cm.updateChunkMesh = wrapped;
        state.watched = { cm, orig, wrapped };
        console.info(TAG, '✔ watcher del updateChunkMesh: si el merge vuelve a fallar, la consola dice el par exacto');
    }

    function tick() {
        if (state.destroyed) return;
        // listo cuando el guardián está puesto y el watcher armado (o el
        // chunk manager no apareció tras 10 intentos: bfs con tope)
        if (state.patched && (state.watched || (state.cmTries || 0) >= 10)) {
            if (state.timer) { clearInterval(state.timer); state.timer = 0; }
            return;
        }
        const game = state.game || findGame();
        if (!game) return;
        state.game = game;
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

    function enable() {
        if (state.timer) return;
        tick();
        state.timer = setInterval(tick, 2000);
    }

    function disable() {
        if (state.timer) { clearInterval(state.timer); state.timer = 0; }
        if (state.patched) {
            try { state.patched.ter.rebuildTileEntity = state.patched.orig; } catch (_) {}
            state.patched = null;
        }
        if (state.watched) {
            try { state.watched.cm.updateChunkMesh = state.watched.orig; } catch (_) {}
            state.watched = null;
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
    // vea sets desalineados, no es un feature opcional
    enable();
    window.MF_TileEntityMerge = {
        enable, disable,
        get aligned() { return !!state.patched; },
        get watching() { return !!state.watched; }
    };
    window.__MF_TEMERGE_SCOPE__ = { destroy() { state.destroyed = true; disable(); } };
    console.info(TAG, 'módulo cargado (siempre encendido: guarda del mergeGeometries)');
})();
