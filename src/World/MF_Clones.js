(function () {
    'use strict';

    if (window.__MF_CLONES__) return;

    const TAG = 'minifeather clones';
    const PREF_KEY = 'minifeather.clones.count';
    const MAX_CLONES = 3;
    const CLONE_IDS = [-2147483639, -2147483638, -2147483637];
    const RING_RADIUS = 3.5;
    const REPOSITION_DISTANCE = 20;
    const SYNC_INTERVAL_MS = 1500;

    const state = {
        count: loadPreference(),
        game: null,
        manager: null,
        world: null,
        clones: new Map(),
        lastCenter: null
    };

    function loadPreference() {
        try {
            const raw = Number(localStorage.getItem(PREF_KEY));
            return Number.isFinite(raw) ? Math.max(0, Math.min(MAX_CLONES, Math.floor(raw))) : 0;
        } catch (_) {
            return 0;
        }
    }

    function savePreference() {
        try {
            localStorage.setItem(PREF_KEY, String(state.count));
        } catch (_) {}
    }

    function looksLikeEntityManager(value) {
        return !!(value && typeof value === 'object' &&
            typeof value.addEntity === 'function' &&
            typeof value.spawnPlayer === 'function' &&
            typeof value.addLocalEntity === 'function');
    }

    function resolveManager() {
        if (looksLikeEntityManager(state.manager)) return state.manager;
        const namespace = globalThis.__MINIFEATHER_LOCAL_GAMES__?.state?.moduleNamespace;
        if (!namespace || typeof namespace !== 'object') return null;
        try {
            for (const value of Object.values(namespace)) {
                if (looksLikeEntityManager(value)) {
                    state.manager = value;
                    return value;
                }
            }
        } catch (_) {}
        return null;
    }

    function isLiveGame(game) {
        return !!(game?.player?.pos && game?.world?.entities);
    }

    function findGame() {
        if (isLiveGame(state.game)) return state.game;
        state.game = globalThis.miniblox || null;
        return isLiveGame(state.game) ? state.game : null;
    }

    function playerProfile(game) {
        const profile = game?.player?.profile || {};
        return {
            name: String(profile.username || profile.name || 'Player'),
            uuid: String(profile.uuid || ''),
            skin: profile.skin || 'bob',
            cape: profile.cape || 'none',
            hat: profile.hat || 'none',
            trail: profile.trail || 'none',
            aura: profile.aura || 'none',
            rank: profile.rank || '',
            mode: String(profile.mode || 'survival'),
            discordBoosting: profile.discordBoosting === true
        };
    }

    // Reparto uniforme en anillo alrededor del jugador, cada clon mirandole.
    function cloneSlot(index, count, origin) {
        const total = Math.max(1, Math.min(MAX_CLONES, Number(count) || 1));
        const angle = (index / total) * Math.PI * 2 + Math.PI / 4;
        const x = origin.x + Math.cos(angle) * RING_RADIUS;
        const z = origin.z + Math.sin(angle) * RING_RADIUS;
        const dx = origin.x - x;
        const dz = origin.z - z;
        return { x, y: origin.y, z, yaw: Math.atan2(-dx, dz) };
    }

    function despawnClone(id) {
        const world = state.world;
        state.clones.delete(id);
        try { world?.removeEntityFromWorld?.(id); } catch (_) {}
        try {
            if (world?.entities?.get?.(id)) world.removeEntity?.(world.entities.get(id));
        } catch (_) {}
    }

    function spawnClone(index, count, game) {
        const world = game.world;
        const id = CLONE_IDS[index];

        try {
            const existing = world.getEntityIncludingQueued?.(id) || world.entities?.get?.(id);
            if (existing) {
                state.clones.set(id, existing);
                return existing;
            }
        } catch (_) {}

        const manager = resolveManager();
        if (!manager) return null;

        const profile = playerProfile(game);
        const slot = cloneSlot(index, count, game.player.pos);

        try {
            manager.spawnPlayer({
                socketId: (profile.uuid || 'minifeather-clone') + '-clone-' + index,
                id,
                name: profile.name,
                pos: { x: slot.x, y: slot.y, z: slot.z },
                yaw: slot.yaw,
                pitch: 0,
                gamemode: profile.mode,
                cosmetics: {
                    skin: profile.skin,
                    cape: profile.cape,
                    hat: profile.hat,
                    trail: profile.trail,
                    aura: profile.aura
                },
                rank: profile.rank,
                discordBoosting: profile.discordBoosting
            });
        } catch (error) {
            console.warn(TAG, 'clone spawn failed:', error?.message || error);
            return null;
        }

        const entity = world.getEntityIncludingQueued?.(id) || world.entities?.get?.(id) || null;
        if (entity) state.clones.set(id, entity);
        return entity;
    }

    function removeAll() {
        for (const id of Array.from(state.clones.keys())) despawnClone(id);
        state.clones.clear();
    }

    function dispatchChanged() {
        document.dispatchEvent(new CustomEvent('mf:clones-changed', {
            detail: { count: state.count }
        }));
    }

    function sync() {
        if (state.count <= 0) {
            if (state.clones.size) removeAll();
            state.lastCenter = null;
            return;
        }

        const game = findGame();
        if (!isLiveGame(game)) return;
        state.game = game;

        if (state.world && state.world !== game.world) {
            state.clones.clear();
            state.lastCenter = null;
        }
        state.world = game.world;

        if (!resolveManager()) return;

        const player = game.player;
        const origin = {
            x: Number(player.pos.x),
            y: Number(player.pos.y),
            z: Number(player.pos.z)
        };

        let changed = false;

        // retirar los que sobran al bajar el conteo
        for (const id of Array.from(state.clones.keys())) {
            if (!CLONE_IDS.slice(0, state.count).includes(id)) {
                despawnClone(id);
                changed = true;
            }
        }

        // spawn de los que faltan
        for (let i = 0; i < state.count; i++) {
            if (!state.clones.has(CLONE_IDS[i])) {
                if (spawnClone(i, state.count, game)) changed = true;
            }
        }

        // reposicionar cuando el jugador se aleja del anillo
        const movedFar = !state.lastCenter ||
            Math.hypot(origin.x - state.lastCenter.x, origin.z - state.lastCenter.z) > REPOSITION_DISTANCE;
        if (movedFar) {
            for (let i = 0; i < state.count; i++) {
                const entity = state.clones.get(CLONE_IDS[i]);
                if (!entity) continue;
                const slot = cloneSlot(i, state.count, origin);
                try {
                    entity.serverPos?.set?.(slot.x * 32, slot.y * 32, slot.z * 32);
                    entity.setPositionAndRotation2?.(slot.x, slot.y, slot.z, slot.yaw, 0, 2);
                } catch (_) {}
            }
        }
        state.lastCenter = origin;

        if (changed) dispatchChanged();
    }

    function setCount(value) {
        const next = Math.max(0, Math.min(MAX_CLONES, Math.floor(Number(value) || 0)));
        state.count = next;
        savePreference();
        sync();
        dispatchChanged();
        return next;
    }

    // Posiciones en MUNDO para el P2P de LocalGames (origen se resta alla).
    function list() {
        const out = [];
        for (let i = 0; i < state.count; i++) {
            const entity = state.clones.get(CLONE_IDS[i]);
            if (!entity?.pos) continue;
            out.push({
                index: i,
                id: CLONE_IDS[i],
                x: Number(entity.pos.x) || 0,
                y: Number(entity.pos.y) || 0,
                z: Number(entity.pos.z) || 0,
                yaw: Number(entity.yaw) || 0
            });
        }
        return out;
    }

    setInterval(sync, SYNC_INTERVAL_MS);

    window.MF_Clones = {
        MAX: MAX_CLONES,
        setCount,
        get count() {
            return state.count;
        },
        list() {
            return list();
        }
    };

    window.__MF_CLONES__ = true;
})();
