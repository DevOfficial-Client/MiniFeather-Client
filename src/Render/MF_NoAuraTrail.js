(function () {
    'use strict';

    // re-ejecución (hot-reload): despedir el scope anterior antes de nada
    try { window.__MF_NOAURATRAIL_SCOPE__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather no-auras-trails';

    // ─────────────────────────────────────────────────────────────────────
    // BLOQUEADOR DE AURAS Y TRAILS — el juego guarda los cosméticos de cada
    // jugador en profile.effects.{aura,trail} (llegan con el paquete del
    // perfil) y su loop de render hace, por jugador:
    //   Dj[profile.effects.aura]?.effect?.update(world, player)
    //   Oj[profile.effects.trail]?.effect?.update(world, player)
    // con guard NATIVO: campo vacío → el juego solo no dibuja nada. Así que
    // el bloqueo más limpio que existe es de datos: vaciar esos campos en
    // los perfiles (menos el propio, si se quiere) y devolver los originales
    // al apagar. Cero contacto con registros/spawners del juego, cero riesgo
    // de romper otras partículas (daño, críticos, clima, las nuestras).
    // ─────────────────────────────────────────────────────────────────────

    const state = {
        enabled: localStorage.getItem('mf_noauratrail') === 'true',
        auras: localStorage.getItem('mf_noauratrail_auras') !== 'false',
        trails: localStorage.getItem('mf_noauratrail_trails') !== 'false',
        keepOwn: localStorage.getItem('mf_noauratrail_keepown') !== 'false',
        game: null,
        entityMap: null,
        sweepTimer: 0,
        lastStats: { players: 0, auras: 0, trails: 0, restored: 0 },
        destroyed: false
    };

    // originales por objeto effects: el servidor manda los valores al
    // entrar al mundo, los guardamos la primera vez que los vemos para
    // poder devolverlos intactos al apagar
    const originals = new WeakMap();

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

    function isMapLike(value) {
        return !!(value && typeof value.get === 'function' && typeof value.values === 'function');
    }

    function looksLikeEntityMap(value) {
        if (!isMapLike(value)) return false;
        let checked = 0, found = 0;
        try {
            for (const ent of value.values()) {
                checked++;
                if (ent && ent.pos) found++;
                if (checked >= 12) break;
            }
        } catch { return false; }
        return checked > 0 && found > 0;
    }

    // entityMap: rutas conocidas primero, BFS corto después (mismo
    // heurístico que HealthNameTags — si aquel ve entidades, este también)
    function resolveEntityMap(game) {
        if (isMapLike(state.entityMap)) return state.entityMap;
        for (const candidate of [
            game?.world?.entitiesDump,
            game?.world?.entities,
            game?.world?.entityMap,
            game?.entityManager?.entities
        ]) {
            if (looksLikeEntityMap(candidate)) { state.entityMap = candidate; return candidate; }
        }
        const world = game?.world;
        if (!world) return null;
        const queue = [{ value: world, depth: 0 }];
        const seen = new WeakSet();
        let visited = 0;
        while (queue.length && visited < 240) {
            const { value, depth } = queue.shift();
            visited++;
            if (!value || typeof value !== 'object' || seen.has(value)) continue;
            seen.add(value);
            if (looksLikeEntityMap(value)) { state.entityMap = value; return value; }
            if (depth >= 3) continue;
            for (const k in value) {
                try {
                    const v = value[k];
                    if (v && typeof v === 'object') queue.push({ value: v, depth: depth + 1 });
                } catch (_) {}
            }
        }
        return null;
    }

    function isOwnPlayer(ent, game) {
        if (!game?.player) return false;
        if (ent === game.player) return true;
        const a = ent?.id, b = game.player.id;
        return a !== undefined && a !== null && String(a) === String(b);
    }

    function restoreEffects(effects) {
        const orig = originals.get(effects);
        if (!orig) return false;
        try {
            if ('aura' in orig) effects.aura = orig.aura;
            if ('trail' in orig) effects.trail = orig.trail;
        } catch (_) {}
        originals.delete(effects);
        return true;
    }

    function restoreAll() {
        if (!isMapLike(state.entityMap)) return 0;
        let restored = 0;
        try {
            for (const ent of state.entityMap.values()) {
                const effects = ent?.profile?.effects;
                if (effects && restoreEffects(effects)) restored++;
            }
        } catch (_) {}
        return restored;
    }

    // un pase por todas las entidades: vacía lo que toca, devuelve lo que
    // ya no bloquea (por si giraste una opción con el módulo vivo)
    function sweepNow() {
        const game = state.game?.player ? state.game : (state.game = findGame());
        if (!game) return state.lastStats;
        if (game !== state.game) state.game = game;
        const map = resolveEntityMap(game);
        if (!map) return state.lastStats;
        let players = 0, auras = 0, trails = 0;
        try {
            for (const ent of map.values()) {
                const effects = ent?.profile?.effects;
                if (!effects || typeof effects !== 'object') continue;
                players++;

                if (isOwnPlayer(ent, game) && state.keepOwn) {
                    restoreEffects(effects);
                    continue;
                }

                if (!originals.has(effects) && (effects.aura != null || effects.trail != null)) {
                    originals.set(effects, { aura: effects.aura, trail: effects.trail });
                }
                const orig = originals.get(effects);
                if (!orig) continue;

                const wantAura = state.auras ? null : orig.aura;
                const wantTrail = state.trails ? null : orig.trail;
                if (effects.aura !== wantAura) effects.aura = wantAura;
                if (effects.trail !== wantTrail) effects.trail = wantTrail;
                // cuenta solo cosméticos que EXISTÍAN (un campo que ya venía
                // vacío no es un aura bloqueada, es un jugador sin gusto XD)
                if (wantAura === null && orig.aura != null) auras++;
                if (wantTrail === null && orig.trail != null) trails++;
            }
        } catch (_) {}
        state.lastStats = { players, auras, trails, restored: state.lastStats.restored };
        return state.lastStats;
    }

    function enable() {
        state.enabled = true;
        localStorage.setItem('mf_noauratrail', 'true');
        if (!state.sweepTimer) state.sweepTimer = setInterval(sweepNow, 1500);
        sweepNow();
    }

    function disable() {
        state.enabled = false;
        localStorage.setItem('mf_noauratrail', 'false');
        if (state.sweepTimer) { clearInterval(state.sweepTimer); state.sweepTimer = 0; }
        state.lastStats.restored = restoreAll();
    }

    function setConfig(cfg) {
        if (!cfg) return;
        if (cfg.auras !== undefined) {
            state.auras = cfg.auras !== false;
            localStorage.setItem('mf_noauratrail_auras', String(state.auras));
        }
        if (cfg.trails !== undefined) {
            state.trails = cfg.trails !== false;
            localStorage.setItem('mf_noauratrail_trails', String(state.trails));
        }
        if (cfg.keepOwn !== undefined) {
            state.keepOwn = cfg.keepOwn !== false;
            localStorage.setItem('mf_noauratrail_keepown', String(state.keepOwn));
        }
        if (state.enabled) sweepNow();
    }

    function status() {
        return {
            enabled: state.enabled,
            auras: state.auras,
            trails: state.trails,
            keepOwn: state.keepOwn,
            game: !!state.game?.player,
            entityMap: isMapLike(state.entityMap),
            ...state.lastStats
        };
    }

    function destroy() {
        state.destroyed = true;
        if (state.sweepTimer) { clearInterval(state.sweepTimer); state.sweepTimer = 0; }
        try { restoreAll(); } catch (_) {}
        try { delete window.MF_NoAuraTrail; } catch (_) {}
        try { delete window.__MF_NOAURATRAIL_SCOPE__; } catch (_) {}
    }

    document.addEventListener('minifeather:no-auratrail-config', (ev) => {
        try {
            const cfg = JSON.parse(ev.detail || '{}');
            if (cfg.enabled === true) enable();
            else if (cfg.enabled === false) disable();
            setConfig(cfg);
        } catch (_) {}
    });

    window.MF_NoAuraTrail = { enable, disable, setConfig, sweepNow, status, destroy };
    window.__MF_NOAURATRAIL_SCOPE__ = { destroy };

    // si quedó encendido de la sesión anterior (userscript/APK, donde el
    // panel no siempre abre primero), arrancar solo — es data limpia
    if (state.enabled) enable();

    console.info(TAG, 'módulo cargado (inactivo hasta minifeather:no-auratrail-config {enabled:true})');
})();
