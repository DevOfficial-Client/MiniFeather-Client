(() => {
    'use strict';

    const W = globalThis;
    const CONFIG = Object.freeze({
        inflate: 0.028,
        scanMs: 250
    });

    const state = {
        enabled: false,
        game: null,
        entity: null,
        root: null,
        armor: new Map()
    };

    const isGame = g => Boolean(g && typeof g === 'object' && g.player && g.world);

    function findGameInReact(element) {
        if (!element) return null;
        let keys = [];
        try { keys = Object.keys(element); } catch { return null; }

        for (const key of keys) {
            if (!key.startsWith('__reactFiber$') &&
                !key.startsWith('__reactContainer$') &&
                !key.startsWith('__reactInternalInstance$')) continue;

            let root;
            try { root = element[key]; } catch { continue; }

            const queue = [root];
            const seen = new Set();
            let count = 0;

            while (queue.length && count++ < 1200) {
                const fiber = queue.shift();
                if (!fiber || seen.has(fiber)) continue;
                seen.add(fiber);

                const candidates = [
                    fiber.stateNode,
                    fiber.stateNode?.game,
                    fiber.memoizedProps,
                    fiber.memoizedProps?.game,
                    fiber.pendingProps,
                    fiber.pendingProps?.game,
                    fiber.memoizedState,
                    fiber.memoizedState?.game
                ];

                for (const candidate of candidates) {
                    if (isGame(candidate)) return candidate;
                    if (isGame(candidate?.game)) return candidate.game;
                }

                if (fiber.child) queue.push(fiber.child);
                if (fiber.sibling) queue.push(fiber.sibling);
            }
        }

        return null;
    }

    function findGame() {
        for (const candidate of [
            W.__MINIBLOX_GAME__,
            W.__MB?.game,
            W.Game,
            W.game,
            state.game
        ]) {
            if (isGame(candidate)) return candidate;
        }

        const game =
            findGameInReact(document.querySelector('#react')) ||
            findGameInReact(document.querySelector('#root'));

        if (game) W.__MINIBLOX_GAME__ = game;
        return game;
    }

    function findLocalEntity(game) {
        const player = game?.player;
        if (!player) return null;

        for (const getter of [
            () => game.world?.getPlayerById?.(player.id),
            () => game.world?.players?.get?.(player.id),
            () => game.world?.entities?.get?.(player.id)
        ]) {
            try {
                const entity = getter();
                if (entity?.mesh) return entity;
            } catch {}
        }

        try {
            for (const entity of game.world?.entities?.values?.() ?? []) {
                if (!entity?.mesh) continue;
                if (String(entity.id) === String(player.id)) return entity;
                if (player.uuid && entity.uuid && String(entity.uuid) === String(player.uuid)) return entity;
                if (player.name && entity.name && String(entity.name) === String(player.name)) return entity;
            }
        } catch {}

        return player?.mesh ? player : null;
    }

    function collectObjects(root) {
        const result = [];
        const queue = [root];
        const seen = new WeakSet();

        while (queue.length) {
            const object = queue.shift();
            if (!object || typeof object !== 'object' || seen.has(object)) continue;
            seen.add(object);
            result.push(object);

            if (Array.isArray(object.children)) {
                for (const child of object.children) queue.push(child);
            }
        }

        return result;
    }

    function knownSkinObjects(mesh) {
        const set = new WeakSet();

        try {
            for (const object of Object.values(mesh?.meshes ?? {})) {
                if (object && typeof object === 'object') set.add(object);
            }
        } catch {}

        for (const candidate of [
            mesh?.skinnedBody,
            mesh?.model,
            mesh?.skeleton,
            mesh?.hatMesh,
            mesh?.capeMesh,
            mesh?.elytraMesh
        ]) {
            if (!candidate || typeof candidate !== 'object') continue;
            try {
                for (const object of collectObjects(candidate)) set.add(object);
            } catch {}
        }

        return set;
    }

    function isArmorMesh(object, root, skinObjects) {
        if (!object?.geometry || object.visible === false) return false;
        if (!(object.isSkinnedMesh === true || object.type === 'SkinnedMesh')) return false;
        if (skinObjects.has(object)) return false;

        const geometry = object.geometry;
        const pos = geometry?.attributes?.position;
        if (!pos || pos.count < 12) return false;

        const name = String(object.name || '').toLowerCase();
        if (/cape|elytra|wing|skin|body/.test(name)) return false;

        if (object === root?.skinnedBody) return false;
        return true;
    }

    function inflateGeometry(original, amount) {
        let geometry;
        try { geometry = original.clone(); } catch { return null; }

        try {
            if (!geometry.attributes?.normal) geometry.computeVertexNormals?.();

            const pos = geometry.attributes?.position;
            const normal = geometry.attributes?.normal;
            if (!pos || !normal || pos.count !== normal.count) {
                geometry.dispose?.();
                return null;
            }

            for (let i = 0; i < pos.count; i++) {
                const nx = normal.getX(i);
                const ny = normal.getY(i);
                const nz = normal.getZ(i);

                if (!Number.isFinite(nx + ny + nz)) continue;

                pos.setXYZ(
                    i,
                    pos.getX(i) + nx * amount,
                    pos.getY(i) + ny * amount,
                    pos.getZ(i) + nz * amount
                );
            }

            pos.needsUpdate = true;
            geometry.computeBoundingBox?.();
            geometry.computeBoundingSphere?.();
            return geometry;
        } catch {
            try { geometry.dispose?.(); } catch {}
            return null;
        }
    }

    function patchArmor(object) {
        if (state.armor.has(object)) return true;

        const original = object.geometry;
        const inflated = inflateGeometry(original, CONFIG.inflate);
        if (!inflated) return false;

        state.armor.set(object, { original, inflated });
        object.geometry = inflated;
        object.frustumCulled = false;

        try {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
                if (material) material.needsUpdate = true;
            }
        } catch {}

        return true;
    }

    function restoreObject(object, entry) {
        try {
            if (object?.geometry === entry.inflated) object.geometry = entry.original;
        } catch {}
        try { entry.inflated?.dispose?.(); } catch {}
    }

    function restoreAll() {
        for (const [object, entry] of state.armor) restoreObject(object, entry);
        state.armor.clear();
        state.entity = null;
        state.root = null;
    }

    function synchronize() {
        if (!state.enabled) return;

        const game = findGame();
        if (!game?.player) {
            restoreAll();
            state.game = null;
            return;
        }

        const entity = findLocalEntity(game);
        const root = entity?.mesh;
        if (!root) return;

        if (root !== state.root) {
            restoreAll();
            state.root = root;
        }

        state.game = game;
        state.entity = entity;

        const skinObjects = knownSkinObjects(root);
        const current = new Set();

        for (const object of collectObjects(root)) {
            if (!isArmorMesh(object, root, skinObjects)) continue;
            current.add(object);
            patchArmor(object);
        }

        for (const [object, entry] of [...state.armor]) {
            if (!current.has(object) || !object.parent) {
                restoreObject(object, entry);
                state.armor.delete(object);
            }
        }
    }

    function setEnabled(value) {
        const next = Boolean(value);
        if (state.enabled === next) {
            if (next) synchronize();
            return;
        }

        state.enabled = next;

        if (next) {
            synchronize();
        } else {
            restoreAll();
            state.game = null;
        }
    }

    document.addEventListener('minifeather:better-player-layers-config', event => {
        let detail = event.detail;
        try {
            if (typeof detail === 'string') detail = JSON.parse(detail);
        } catch {
            detail = null;
        }
        if (typeof detail?.enabled === 'boolean') setEnabled(detail.enabled);
    });

    W.MF_BetterPlayerLayersArmor = {
        enable: () => setEnabled(true),
        disable: () => setEnabled(false),
        getState: () => ({
            enabled: state.enabled,
            armorMeshes: state.armor.size,
            inflate: CONFIG.inflate
        })
    };

    W.setInterval(synchronize, CONFIG.scanMs);
})();
