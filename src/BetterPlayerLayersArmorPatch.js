(() => {
    'use strict';

    const W = globalThis;
    const CONFIG = Object.freeze({
        scale: 1.035,
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
            if (
                !key.startsWith('__reactFiber$') &&
                !key.startsWith('__reactContainer$') &&
                !key.startsWith('__reactInternalInstance$')
            ) continue;

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
        if (!object.parent) return false;
        if (skinObjects.has(object)) return false;
        if (object.__mfArmorShell === true) return false;

        const pos = object.geometry?.attributes?.position;
        if (!pos || pos.count < 12) return false;

        const name = String(object.name || '').toLowerCase();
        if (/cape|elytra|wing|skin|body|shell/.test(name)) return false;
        if (object === root?.skinnedBody) return false;

        return true;
    }

    function cloneMaterial(material) {
        let copy;
        try { copy = material?.clone?.(); } catch { copy = null; }
        if (!copy) return null;

        copy.side = 2;
        copy.transparent = material.transparent;
        copy.opacity = material.opacity;
        copy.alphaTest = material.alphaTest;
        copy.depthWrite = material.depthWrite;
        copy.depthTest = material.depthTest;
        copy.polygonOffset = true;
        copy.polygonOffsetFactor = 1;
        copy.polygonOffsetUnits = 1;
        copy.needsUpdate = true;

        return copy;
    }

    function createShellMaterials(material) {
        if (Array.isArray(material)) {
            return material.map(cloneMaterial).filter(Boolean);
        }

        return cloneMaterial(material);
    }

    function createShell(object) {
        const material = createShellMaterials(object.material);
        if (!material) return null;

        let shell;
        try {
            shell = new object.constructor(object.geometry, material);
        } catch {
            return null;
        }

        shell.__mfArmorShell = true;
        shell.name = `${object.name || 'armor'}__mf_shell`;
        shell.frustumCulled = false;
        shell.castShadow = object.castShadow;
        shell.receiveShadow = object.receiveShadow;
        shell.renderOrder = (object.renderOrder || 0) + 0.01;
        shell.visible = object.visible;
        shell.matrixAutoUpdate = object.matrixAutoUpdate;

        try { shell.position.copy(object.position); } catch {}
        try { shell.quaternion.copy(object.quaternion); } catch {}
        try { shell.scale.copy(object.scale).multiplyScalar(CONFIG.scale); } catch {}
        try { shell.rotation.copy(object.rotation); } catch {}

        try {
            if (object.isSkinnedMesh && object.skeleton) {
                shell.bindMode = object.bindMode;
                shell.bindMatrix.copy(object.bindMatrix);
                shell.bindMatrixInverse.copy(object.bindMatrixInverse);
                shell.bind(object.skeleton, object.bindMatrix);
            }
        } catch {}

        try {
            if (object.parent) object.parent.add(shell);
        } catch {
            try {
                if (Array.isArray(material)) material.forEach(m => m?.dispose?.());
                else material?.dispose?.();
            } catch {}
            return null;
        }

        return shell;
    }

    function syncShell(entry) {
        const object = entry.object;
        const shell = entry.shell;

        if (!object || !shell) return;

        try { shell.visible = object.visible; } catch {}
        try { shell.position.copy(object.position); } catch {}
        try { shell.quaternion.copy(object.quaternion); } catch {}
        try { shell.scale.copy(object.scale).multiplyScalar(CONFIG.scale); } catch {}
        try { shell.rotation.copy(object.rotation); } catch {}
        try { shell.matrixWorldNeedsUpdate = true; } catch {}

        try {
            if (object.isSkinnedMesh && object.skeleton && shell.skeleton !== object.skeleton) {
                shell.bindMode = object.bindMode;
                shell.bind(object.skeleton, object.bindMatrix);
            }
        } catch {}
    }

    function patchArmor(object) {
        const existing = state.armor.get(object);
        if (existing) {
            syncShell(existing);
            return true;
        }

        const shell = createShell(object);
        if (!shell) return false;

        state.armor.set(object, { object, shell });
        syncShell({ object, shell });
        return true;
    }

    function disposeMaterial(material) {
        try {
            if (Array.isArray(material)) {
                for (const entry of material) entry?.dispose?.();
            } else {
                material?.dispose?.();
            }
        } catch {}
    }

    function restoreObject(object, entry) {
        try {
            if (entry.shell?.parent) entry.shell.parent.remove(entry.shell);
        } catch {}

        disposeMaterial(entry.shell?.material);
    }

    function restoreAll() {
        for (const [object, entry] of state.armor) restoreObject(object, entry);
        state.armor.clear();
        state.entity = null;
        state.root = null;
    }

    function isLayerEnabled() {
        try {
            const mod = W.MF_BetterPlayerLayers;
            if (mod && typeof mod.getState === 'function') {
                const info = mod.getState();
                if (typeof info?.enabled === 'boolean') return info.enabled;
            }
        } catch {}
        return state.enabled;
    }

    function synchronize() {
        if (!state.enabled && !isLayerEnabled()) return;

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
            } else {
                syncShell(entry);
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
            enabled: state.enabled || isLayerEnabled(),
            armorMeshes: state.armor.size,
            scale: CONFIG.scale
        })
    };

    W.setInterval(synchronize, CONFIG.scanMs);
})();
