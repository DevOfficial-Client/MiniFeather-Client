(function () {
    'use strict';

    const CONFIG = {
        minScale: 0.20,
        maxScale: 5.00,
        defaultScale: 1.00,
        minWidth: 0.30,
        maxWidth: 3.00,
        defaultWidth: 1.00,
        minGroundOffset: -1.50,
        maxGroundOffset: 1.50,
        defaultGroundOffset: 0,
        syncLocalHitbox: true,
        syncCameraHeight: true,
        cameraHeightMultiplier: 1.00,
        syncNameTagHeight: true,
        fallbackNameTagGap: 0.40
    };

    const state = {
        game: null,
        player: null,
        renderEntity: null,
        renderMesh: null,
        entityMap: null,

        enabled: false,
        bind: '',
        scale: CONFIG.defaultScale,
        width: CONFIG.defaultWidth,
        groundOffset: CONFIG.defaultGroundOffset,
        baseScale: null,
        basePositionY: null,
        lastAppliedOffset: 0,

        panelOpen: false,
        lastGameScan: 0,
        lastEntityScan: 0,

        renderHooks: [],

        hitboxEnabled: true,
        hitboxTargets: [],
        hitboxSignature: null,

        cameraHeightEnabled: true,
        camera: null,
        cameraPath: null,
        cameraBaseEyeHeight: null,
        cameraHook: null,
        cameraHookDepth: 0,
        eyeHeightHook: null,
        lastCameraScan: 0,

        nameTagEnabled: true,
        nameTagObject: null,
        nameTagPath: null,
        nameTagBase: null,
        nameTagPatchedMesh: null,
        nameTagOffsetMethod: null,
        nameTagRenderMethod: null,
        nameTagOriginalOffsetFn: null,
        nameTagHadOwnOffset: false,
        nameTagOwnOffsetValue: undefined,
        nameTagCurrentOffset: null,
        lastNameTagScan: 0
    };

    const clamp = (value, min, max) =>
        Math.min(max, Math.max(min, value));

    function getEffectiveScale() {
        return state.enabled ? state.scale : 1;
    }

    function getEffectiveWidth() {
        return state.enabled ? state.width : 1;
    }

    function updateUI() {}

    function sameId(a, b) {
        if (
            a === undefined ||
            a === null ||
            b === undefined ||
            b === null
        ) {
            return false;
        }

        return String(a) === String(b);
    }

    function getGame(force = false) {
        const now = performance.now();

        if (
            !force &&
            state.game?.player &&
            now - state.lastGameScan < 1000
        ) {
            return state.game;
        }

        state.lastGameScan = now;

        try {
            const react =
                document.querySelector('#react');

            if (!react) {
                return state.game?.player
                    ? state.game
                    : null;
            }

            for (const root of Object.values(react)) {
                const game =
                    root
                        ?.updateQueue
                        ?.baseState
                        ?.element
                        ?.props
                        ?.game;

                if (game?.player) {
                    if (state.game !== game) {
                        clearRenderTarget();
                        state.game = game;
                    }

                    state.player = game.player;

                    return game;
                }
            }
        } catch {}

        return state.game?.player
            ? state.game
            : null;
    }

    function isMapLike(value) {
        return !!(
            value &&
            typeof value.get === 'function' &&
            typeof value.values === 'function'
        );
    }

    function looksLikeEntityMap(value) {
        if (!isMapLike(value)) {
            return false;
        }

        let checked = 0;
        let entityLike = 0;

        try {
            for (const entity of value.values()) {
                checked++;

                if (
                    entity &&
                    entity.pos &&
                    (
                        entity.mesh ||
                        entity.id !== undefined
                    )
                ) {
                    entityLike++;
                }

                if (checked >= 12) {
                    break;
                }
            }
        } catch {
            return false;
        }

        return checked > 0 && entityLike > 0;
    }

    function resolveEntityMap(game) {
        if (
            state.entityMap &&
            isMapLike(state.entityMap)
        ) {
            return state.entityMap;
        }

        const direct = [
            game?.world?.entitiesDump,
            game?.world?.entities,
            game?.world?.entityMap,
            game?.entityManager?.entities
        ];

        for (const candidate of direct) {
            if (looksLikeEntityMap(candidate)) {
                state.entityMap = candidate;
                return candidate;
            }
        }

        const world = game?.world;

        if (!world) {
            return null;
        }

        const queue = [
            {
                value: world,
                depth: 0
            }
        ];

        const seen = new WeakSet();
        let visited = 0;

        while (
            queue.length &&
            visited < 360
        ) {
            const current = queue.shift();
            const value = current.value;

            if (
                !value ||
                typeof value !== 'object' ||
                seen.has(value)
            ) {
                continue;
            }

            seen.add(value);
            visited++;

            if (looksLikeEntityMap(value)) {
                state.entityMap = value;
                return value;
            }

            if (current.depth >= 2) {
                continue;
            }

            let keys = [];

            try {
                keys = Object.keys(value);
            } catch {
                continue;
            }

            for (const key of keys) {
                let child;

                try {
                    child = value[key];
                } catch {
                    continue;
                }

                if (
                    child &&
                    typeof child === 'object'
                ) {
                    queue.push({
                        value: child,
                        depth: current.depth + 1
                    });
                }
            }
        }

        return null;
    }

    function validScale(scale) {
        return !!(
            scale &&
            Number.isFinite(Number(scale.x)) &&
            Number.isFinite(Number(scale.y)) &&
            Number.isFinite(Number(scale.z))
        );
    }

    function setScaleVector(
        scale,
        x,
        y,
        z
    ) {
        if (!scale) {
            return;
        }

        try {
            if (typeof scale.set === 'function') {
                scale.set(x, y, z);
            } else {
                scale.x = x;
                scale.y = y;
                scale.z = z;
            }
        } catch {}
    }

    function validPosition(value) {
        return !!(
            value &&
            Number.isFinite(Number(value.x)) &&
            Number.isFinite(Number(value.y)) &&
            Number.isFinite(Number(value.z))
        );
    }

    function looksLikeCamera(value) {
        if (
            !value ||
            (
                typeof value !== 'object' &&
                typeof value !== 'function'
            ) ||
            !validPosition(value.position)
        ) {
            return false;
        }

        let score = 0;

        if (value.isCamera === true) {
            score += 100;
        }

        if (Number.isFinite(Number(value.fov))) {
            score += 30;
        }

        if (value.projectionMatrix) {
            score += 30;
        }

        if (value.matrixWorldInverse) {
            score += 25;
        }

        if (value.rotation) {
            score += 20;
        }

        if (value.quaternion) {
            score += 20;
        }

        return score >= 40;
    }

    function cameraScore(value, path) {
        if (!looksLikeCamera(value)) {
            return -Infinity;
        }

        const p =
            String(path || '').toLowerCase();

        let score = 0;

        if (value.isCamera === true) {
            score += 300;
        }

        if (p === 'game.camera') {
            score += 500;
        }

        if (p.endsWith('.camera')) {
            score += 260;
        }

        if (p.includes('gamescene.camera')) {
            score += 350;
        }

        if (p.includes('scene.camera')) {
            score += 300;
        }

        if (p.includes('renderer.camera')) {
            score += 250;
        }

        if (p.includes('controls.camera')) {
            score += 250;
        }

        if (p.includes('controller.camera')) {
            score += 240;
        }

        if (p.includes('maincamera')) {
            score += 280;
        }

        if (
            p.includes('shadow') ||
            p.includes('light') ||
            p.includes('cube') ||
            p.includes('reflection')
        ) {
            score -= 700;
        }

        if (Number.isFinite(Number(value.fov))) {
            score += 60;
        }

        if (value.projectionMatrix) {
            score += 40;
        }

        if (value.matrixWorldInverse) {
            score += 40;
        }

        return score;
    }

    function uninstallEyeHeightHook() {
        const hook = state.eyeHeightHook;

        if (!hook) {
            return;
        }

        const player = hook.player;

        try {
            if (player?.getEyeHeight === hook.wrapper) {
                if (hook.hadOwn) {
                    player.getEyeHeight = hook.ownValue;
                } else {
                    delete player.getEyeHeight;
                }
            }
        } catch {}

        state.eyeHeightHook = null;
    }

    function installEyeHeightHook(player) {
        if (!player || typeof player.getEyeHeight !== 'function') {
            uninstallEyeHeightHook();
            return false;
        }

        if (
            state.eyeHeightHook?.player === player &&
            player.getEyeHeight === state.eyeHeightHook.wrapper
        ) {
            return true;
        }

        uninstallEyeHeightHook();

        const hadOwn = Object.prototype.hasOwnProperty.call(player, 'getEyeHeight');
        const ownValue = hadOwn ? player.getEyeHeight : undefined;
        const original = player.getEyeHeight;

        const wrapper = function (...args) {
            let vanilla;

            try {
                vanilla = Number(original.apply(this, args));
            } catch {
                vanilla = 1.62;
            }

            if (!Number.isFinite(vanilla) || vanilla <= 0) {
                vanilla = 1.62;
            }

            if (!state.enabled || !state.cameraHeightEnabled) {
                return vanilla;
            }

            const factor = clamp(
                Number(getEffectiveScale()) || 1,
                CONFIG.minScale,
                CONFIG.maxScale
            );

            return vanilla * factor * CONFIG.cameraHeightMultiplier;
        };

        try {
            player.getEyeHeight = wrapper;
        } catch {
            return false;
        }

        state.eyeHeightHook = {
            player,
            original,
            wrapper,
            hadOwn,
            ownValue
        };

        state.cameraPath = 'player.getEyeHeight';
        return true;
    }

    function callVanillaEyeHeight(player) {
        if (!player) {
            return null;
        }

        const hook = state.eyeHeightHook;
        const fn = hook?.player === player ? hook.original : player.getEyeHeight;

        if (typeof fn !== 'function') {
            return null;
        }

        try {
            const value = Number(fn.call(player));
            return Number.isFinite(value) && value > 0 ? value : null;
        } catch {
            return null;
        }
    }

    function getNativeEyeHeight(player) {
        if (!player) {
            return null;
        }

        const nativeMethodHeight = callVanillaEyeHeight(player);
        if (
            Number.isFinite(nativeMethodHeight) &&
            nativeMethodHeight > 0.05 &&
            nativeMethodHeight < 10
        ) {
            return nativeMethodHeight;
        }

        try {
            if (
                typeof player.getEyePos ===
                    'function' &&
                validPosition(player.pos)
            ) {
                const eye = player.getEyePos();

                if (validPosition(eye)) {
                    const h = Number(eye.y) - Number(player.pos.y);

                    if (
                        Number.isFinite(h) &&
                        h > 0.05 &&
                        h < 10
                    ) {
                        return h;
                    }
                }
            }
        } catch {}

        const eyeCandidates = [
            player.eyeHeight,
            player.cameraHeight,
            player.viewHeight,
            player.eyeY
        ];

        for (const value of eyeCandidates) {
            const h = Number(value);

            if (
                Number.isFinite(h) &&
                h > 0.05 &&
                h < 10
            ) {
                return h;
            }
        }

        const heightCandidates = [
            player.height,
            player.entityHeight,
            player.collisionHeight,
            player.hitboxHeight
        ];

        for (const value of heightCandidates) {
            const h = Number(value);

            if (
                Number.isFinite(h) &&
                h > 0.2 &&
                h < 10
            ) {
                return h * 0.90;
            }
        }

        return 1.62;
    }

    function getCameraHeightOffset() {
        if (!state.cameraHeightEnabled) {
            return 0;
        }

        const player =
            state.game?.player ||
            state.player;

        if (!player) {
            return 0;
        }

        let eyeHeight =
            state.cameraBaseEyeHeight;

        if (
            !Number.isFinite(eyeHeight) ||
            eyeHeight <= 0 ||
            performance.now() - (state.lastCameraScan || 0) > 2000
        ) {
            eyeHeight =
                getNativeEyeHeight(player);

            if (
                Number.isFinite(eyeHeight) &&
                eyeHeight > 0
            ) {
                state.cameraBaseEyeHeight =
                    eyeHeight;
            }
        }

        if (
            !Number.isFinite(eyeHeight) ||
            eyeHeight <= 0
        ) {
            return 0;
        }

        const factor =
            clamp(
                Number(getEffectiveScale()) || 1,
                CONFIG.minScale,
                CONFIG.maxScale
            );

        const offset =
            eyeHeight *
            (factor - 1) *
            CONFIG.cameraHeightMultiplier;

        return Number.isFinite(offset)
            ? offset
            : 0;
    }

    function uninstallCameraHook() {
        const hook =
            state.cameraHook;

        if (!hook) {
            return;
        }

        const camera =
            hook.camera;

        try {
            if (
                hook.originalUpdateMatrixWorld &&
                camera.updateMatrixWorld ===
                    hook.updateMatrixWorld
            ) {
                camera.updateMatrixWorld =
                    hook.originalUpdateMatrixWorld;
            }
        } catch {}

        state.cameraHook = null;
        state.cameraHookDepth = 0;
    }

    function withCameraHeight(
        camera,
        original,
        thisArg,
        args
    ) {
        if (
            !state.cameraHeightEnabled ||
            !camera
        ) {
            return original.apply(
                thisArg,
                args
            );
        }

        if (
            state.cameraHookDepth > 0
        ) {
            return original.apply(
                thisArg,
                args
            );
        }

        const offset =
            getCameraHeightOffset();

        if (
            !Number.isFinite(offset) ||
            Math.abs(offset) <
                0.000001
        ) {
            return original.apply(
                thisArg,
                args
            );
        }

        state.cameraHookDepth++;

        try {
            
            const result = original.apply(
                thisArg,
                args
            );

            const mx = camera.matrixWorld;
            if (mx && mx.elements) {
                mx.elements[13] += offset;

                const mxi = camera.matrixWorldInverse;
                if (mxi) {
                    try {
                        if (
                            typeof mxi.copy === 'function' &&
                            typeof mxi.invert === 'function'
                        ) {
                            mxi.copy(mx).invert();
                        } else if (mxi.elements) {
                            mxi.elements[13] -= offset;
                        }
                    } catch {}
                }
            }

            return result;
        } finally {
            state.cameraHookDepth--;
        }
    }

    function installCameraHook(camera) {
        if (
            !camera ||
            state.cameraHook?.camera ===
                camera
        ) {
            return;
        }

        uninstallCameraHook();

        const originalUpdateMatrixWorld =
            typeof camera.updateMatrixWorld ===
                'function'
                ? camera.updateMatrixWorld
                : null;

        if (!originalUpdateMatrixWorld) return;

        const hook = {
            camera,
            originalUpdateMatrixWorld,
            updateMatrixWorld: function (...args) {
                return withCameraHeight(
                    camera,
                    originalUpdateMatrixWorld,
                    this,
                    args
                );
            }
        };

        try {
            camera.updateMatrixWorld =
                hook.updateMatrixWorld;
        } catch {}

        state.cameraHook = hook;
    }

    function resetCameraTarget() {
        uninstallCameraHook();
        uninstallEyeHeightHook();

        state.camera = null;
        state.cameraPath = null;
        state.cameraBaseEyeHeight = null;
        state.lastCameraScan = 0;
    }

    function resolveCamera(game, force = false) {
        if (!game) {
            return null;
        }

        const now = performance.now();

        if (
            state.camera &&
            looksLikeCamera(state.camera)
        ) {
            installCameraHook(
                state.camera
            );

            return state.camera;
        }

        if (
            !force &&
            now - state.lastCameraScan < 650
        ) {
            return null;
        }

        state.lastCameraScan = now;

        const direct = [
            ['game.camera', game?.camera],
            ['game.gameScene.camera', game?.gameScene?.camera],
            ['game.scene.camera', game?.scene?.camera],
            ['game.renderer.camera', game?.renderer?.camera],
            ['game.controls.camera', game?.controls?.camera],
            ['game.controller.camera', game?.controller?.camera],
            ['game.client.camera', game?.client?.camera]
        ];

        let best = null;

        for (const [path, candidate] of direct) {
            const score =
                cameraScore(candidate, path);

            if (
                Number.isFinite(score) &&
                (
                    !best ||
                    score > best.score
                )
            ) {
                best = {
                    value: candidate,
                    path,
                    score
                };
            }
        }

        const queue = [
            {
                value: game,
                path: 'game',
                depth: 0
            }
        ];

        const seen = new WeakSet();
        let visited = 0;

        while (
            queue.length &&
            visited < 1500
        ) {
            const current =
                queue.shift();

            const value =
                current.value;

            if (
                !value ||
                (
                    typeof value !== 'object' &&
                    typeof value !== 'function'
                ) ||
                seen.has(value)
            ) {
                continue;
            }

            seen.add(value);
            visited++;

            const score =
                cameraScore(
                    value,
                    current.path
                );

            if (
                Number.isFinite(score) &&
                (
                    !best ||
                    score > best.score
                )
            ) {
                best = {
                    value,
                    path: current.path,
                    score
                };
            }

            if (current.depth >= 4) {
                continue;
            }

            let keys = [];

            try {
                keys = Object.keys(value);
            } catch {
                continue;
            }

            for (const key of keys) {
                if (
                    key === 'parent' ||
                    key === 'world' ||
                    key === 'entities' ||
                    key === 'inventory' ||
                    key === 'material' ||
                    key === 'geometry'
                ) {
                    continue;
                }

                let child;

                try {
                    child = value[key];
                } catch {
                    continue;
                }

                if (
                    !child ||
                    (
                        typeof child !== 'object' &&
                        typeof child !== 'function'
                    ) ||
                    child === window ||
                    child === document ||
                    child instanceof Element
                ) {
                    continue;
                }

                queue.push({
                    value: child,
                    path:
                        `${current.path}.${key}`,
                    depth:
                        current.depth + 1
                });
            }
        }

        if (
            best &&
            best.score > 0
        ) {
            state.camera =
                best.value;

            state.cameraPath =
                best.path;

            state.cameraBaseEyeHeight =
                getNativeEyeHeight(
                    game.player
                );

            installCameraHook(
                best.value
            );

            return best.value;
        }

        return null;
    }

    function applyCameraHeight() {
        const game = getGame();

        if (!game?.player) {
            return;
        }

        uninstallCameraHook();
        installEyeHeightHook(game.player);

        if (
            !Number.isFinite(state.cameraBaseEyeHeight) ||
            state.cameraBaseEyeHeight <= 0
        ) {
            state.cameraBaseEyeHeight = getNativeEyeHeight(game.player);
        }
    }

    function setCameraHeightEnabled(enabled) {
        state.cameraHeightEnabled =
            !!enabled;

        if (
            state.cameraHeightEnabled
        ) {
            state.cameraBaseEyeHeight =
                getNativeEyeHeight(
                    state.game?.player ||
                    state.player
                );

            applyCameraHeight();
        }

        updateUI();
    }

    function getFunctionSource(fn) {
        try {
            return Function.prototype.toString.call(fn);
        } catch {
            return '';
        }
    }

    function getPrototypeMethodNames(object) {
        const names = [];
        const seen = new Set();
        let proto = object;

        for (let depth = 0; proto && depth < 8; depth++) {
            let keys = [];
            try {
                keys = Object.getOwnPropertyNames(proto);
            } catch {
                break;
            }

            for (const key of keys) {
                if (key === 'constructor' || seen.has(key)) continue;
                seen.add(key);
                names.push(key);
            }

            try {
                proto = Object.getPrototypeOf(proto);
            } catch {
                break;
            }
        }

        return names;
    }

    function findNativeNameTagRenderMethod(mesh) {
        if (!mesh) return null;

        let best = null;

        for (const key of getPrototypeMethodNames(mesh)) {
            let fn;
            try {
                fn = mesh[key];
            } catch {
                continue;
            }
            if (typeof fn !== 'function') continue;

            const source = getFunctionSource(fn);
            if (!source || !source.includes('nameTagText')) continue;

            let score = 0;
            if (source.includes('nameTagColor')) score += 20;
            if (source.includes('nameTagOpacity')) score += 20;
            if (source.includes('.submit(')) score += 40;
            if (source.includes('this.position')) score += 15;
            if (/\by\s*:/.test(source) && /\bz\s*:/.test(source)) score += 15;

            if (!best || score > best.score) {
                best = { key, source, score };
            }
        }

        return best?.score >= 40 ? best : null;
    }

    function methodNameFromNameTagRenderer(renderSource, mesh) {
        if (!renderSource || !mesh) return null;

        const patterns = [
            /\by\s*:\s*[^,}]*\+\s*this\.([A-Za-z_$][\w$]*)\s*\(/,
            /\by\s*:\s*this\.position\.y\s*\+\s*this\.([A-Za-z_$][\w$]*)\s*\(/,
            /\.y\s*\+\s*this\.([A-Za-z_$][\w$]*)\s*\(\)/
        ];

        for (const pattern of patterns) {
            const match = renderSource.match(pattern);
            const key = match?.[1];
            if (!key) continue;
            try {
                if (typeof mesh[key] === 'function') return key;
            } catch {}
        }

        return null;
    }

    function findNativeNameTagOffsetMethod(mesh) {
        if (!mesh) return null;

        const renderer = findNativeNameTagRenderMethod(mesh);
        const fromRenderer = methodNameFromNameTagRenderer(renderer?.source, mesh);
        if (fromRenderer) {
            return {
                key: fromRenderer,
                renderKey: renderer?.key || null
            };
        }

        let best = null;

        for (const key of getPrototypeMethodNames(mesh)) {
            let fn;
            try {
                fn = mesh[key];
            } catch {
                continue;
            }
            if (typeof fn !== 'function') continue;

            const source = getFunctionSource(fn);
            if (!source) continue;

            let score = 0;
            if (source.includes('this.entity.height')) score += 100;
            if (source.includes('.entity.height')) score += 40;
            if (source.includes('return')) score += 10;
            if (source.length < 240) score += 20;
            if (source.includes('nameTag')) score += 15;

            if (score < 40) continue;

            let value = null;
            try {
                value = Number(fn.call(mesh));
            } catch {}
            if (Number.isFinite(value) && value > 0.05 && value < 20) score += 20;

            if (!best || score > best.score) {
                best = { key, score };
            }
        }

        return best
            ? { key: best.key, renderKey: renderer?.key || null }
            : null;
    }

    function getNativeNameTagEntityHeight(mesh) {
        const candidates = [
            mesh?.entity?.height,
            state.renderEntity?.height,
            state.player?.height
        ];

        for (const value of candidates) {
            const number = Number(value);
            if (Number.isFinite(number) && number > 0.05 && number < 20) {
                return number;
            }
        }

        return null;
    }

    function inferNativeNameTagGap(mesh, vanillaOffset) {
        const entityHeight = getNativeNameTagEntityHeight(mesh);
        if (Number.isFinite(entityHeight)) {
            const inferred = vanillaOffset - entityHeight;
            if (Number.isFinite(inferred) && inferred >= 0 && inferred <= 2) {
                return inferred;
            }
        }

        return CONFIG.fallbackNameTagGap;
    }

    function restoreNativeNameTagHook() {
        const mesh = state.nameTagPatchedMesh;
        const method = state.nameTagOffsetMethod;

        if (
            mesh &&
            method &&
            state.nameTagOriginalOffsetFn
        ) {
            try {
                if (state.nameTagHadOwnOffset) {
                    mesh[method] = state.nameTagOwnOffsetValue;
                } else {
                    delete mesh[method];
                }
            } catch {
                try {
                    mesh[method] = state.nameTagOriginalOffsetFn;
                } catch {}
            }
        }

        state.nameTagPatchedMesh = null;
        state.nameTagOffsetMethod = null;
        state.nameTagRenderMethod = null;
        state.nameTagOriginalOffsetFn = null;
        state.nameTagHadOwnOffset = false;
        state.nameTagOwnOffsetValue = undefined;
        state.nameTagCurrentOffset = null;
    }

    function installNativeNameTagHook(mesh) {
        if (!state.nameTagEnabled || !mesh) return false;

        if (
            state.nameTagPatchedMesh === mesh &&
            state.nameTagOffsetMethod &&
            state.nameTagOriginalOffsetFn &&
            typeof mesh[state.nameTagOffsetMethod] === 'function'
        ) {
            return true;
        }

        const discovered = findNativeNameTagOffsetMethod(mesh);
        const methodName = discovered?.key;
        if (!methodName) return false;

        let method;
        try {
            method = mesh[methodName];
        } catch {
            return false;
        }
        if (typeof method !== 'function') return false;

        restoreNativeNameTagHook();

        const hadOwn = Object.prototype.hasOwnProperty.call(mesh, methodName);
        const ownValue = hadOwn ? mesh[methodName] : undefined;
        const original = method;

        let vanillaOffset = null;
        try {
            vanillaOffset = Number(original.call(mesh));
        } catch {}
        if (!Number.isFinite(vanillaOffset)) return false;

        const gap = inferNativeNameTagGap(mesh, vanillaOffset);
        const bodyOffset = vanillaOffset - gap;
        if (!Number.isFinite(bodyOffset) || bodyOffset <= 0) return false;

        state.nameTagPatchedMesh = mesh;
        state.nameTagOffsetMethod = methodName;
        state.nameTagRenderMethod = discovered?.renderKey || null;
        state.nameTagOriginalOffsetFn = original;
        state.nameTagHadOwnOffset = hadOwn;
        state.nameTagOwnOffsetValue = ownValue;
        state.nameTagObject = mesh.nameTag || mesh;
        state.nameTagPath = `renderMesh.${methodName}`;
        state.nameTagBase = {
            space: 'native-offset',
            height: vanillaOffset,
            gap,
            bodyOffset,
            method: methodName,
            renderMethod: discovered?.renderKey || null
        };

        const wrapped = function (...args) {
            const vanilla = Number(original.apply(this, args));
            if (!Number.isFinite(vanilla) || !state.nameTagEnabled) {
                return vanilla;
            }

            const factor = clamp(
                Number(getEffectiveScale()) || 1,
                CONFIG.minScale,
                CONFIG.maxScale
            );

            if (Math.abs(factor - 1) < 0.000001) {
                state.nameTagCurrentOffset = vanilla;
                return vanilla;
            }

            const base = state.nameTagBase;
            const nativeGap = Number(base?.gap);
            const nativeBody = Number(base?.bodyOffset);

            if (!Number.isFinite(nativeGap) || !Number.isFinite(nativeBody)) {
                state.nameTagCurrentOffset = vanilla;
                return vanilla;
            }

            const result = nativeGap + nativeBody * factor;
            state.nameTagCurrentOffset = result;
            return result;
        };

        try {
            mesh[methodName] = wrapped;
        } catch {
            restoreNativeNameTagHook();
            return false;
        }

        try {
            state.nameTagCurrentOffset = Number(mesh[methodName]());
        } catch {}

        return true;
    }

    function clearNameTagTarget() {
        restoreNativeNameTagHook();

        state.nameTagObject = null;
        state.nameTagPath = null;
        state.nameTagBase = null;
    }

    function resolveNameTag(force = false) {
        if (!state.nameTagEnabled) {
            return null;
        }

        const now =
            performance.now();

        if (
            !force &&
            state.nameTagPatchedMesh ===
                state.renderMesh &&
            state.nameTagOriginalOffsetFn &&
            now -
                state.lastNameTagScan <
                750
        ) {
            return state.nameTagObject;
        }

        state.lastNameTagScan =
            now;

        const mesh =
            state.renderMesh;

        if (!mesh) {
            return null;
        }

        if (
            state.nameTagPatchedMesh === mesh &&
            (
                !state.nameTagOffsetMethod ||
                typeof mesh[state.nameTagOffsetMethod] !== 'function'
            )
        ) {
            clearNameTagTarget();
        }

        installNativeNameTagHook(mesh);

        return state.nameTagObject;
    }

    function applyNameTagHeight() {
        if (
            !state.nameTagEnabled
        ) {
            return false;
        }

        const mesh =
            state.renderMesh;

        if (!mesh) {
            return false;
        }

        if (
            state.nameTagPatchedMesh !==
                mesh ||
            !state.nameTagOriginalOffsetFn
        ) {
            if (
                !installNativeNameTagHook(
                    mesh
                )
            ) {
                return false;
            }
        }

        try {
            const method = state.nameTagOffsetMethod;
            const value = method && typeof mesh[method] === 'function'
                ? Number(mesh[method]())
                : NaN;

            if (Number.isFinite(value)) {
                state.nameTagCurrentOffset = value;
            }
        } catch {}

        return true;
    }

    function setNameTagEnabled(enabled) {
        state.nameTagEnabled =
            !!enabled;

        if (
            !state.nameTagEnabled
        ) {
            clearNameTagTarget();
        } else {
            resolveNameTag(true);
            applyNameTagHeight();
        }

        updateUI();
    }

    const HITBOX_SCALAR_KEYS = [
        'width',
        'height',
        'depth',
        'radius',
        'eyeHeight',
        'collisionWidth',
        'collisionHeight',
        'collisionDepth',
        'hitboxWidth',
        'hitboxHeight',
        'hitboxDepth',
        'entityWidth',
        'entityHeight'
    ];

    // claves cuyo factor es solo la escala vertical (altura/ojo)
    const HITBOX_HEIGHT_KEYS = new Set([
        'height',
        'eyeHeight',
        'collisionHeight',
        'hitboxHeight',
        'entityHeight'
    ]);

    const HITBOX_NESTED_KEYS = [
        'hitbox',
        'collisionBox',
        'collider',
        'collision',
        'dimensions',
        'size'
    ];

    function finiteReasonableNumber(value) {
        const n = Number(value);

        return (
            Number.isFinite(n) &&
            Math.abs(n) > 0.000001 &&
            Math.abs(n) < 100
        );
    }

    function addHitboxScalarTarget(
        targets,
        seen,
        object,
        key,
        label
    ) {
        if (
            !object ||
            !finiteReasonableNumber(object[key])
        ) {
            return;
        }

        let objectSet =
            seen.get(object);

        if (!objectSet) {
            objectSet =
                new Set();

            seen.set(
                object,
                objectSet
            );
        }

        if (
            objectSet.has(key)
        ) {
            return;
        }

        objectSet.add(key);

        targets.push({
            type: 'scalar',
            object,
            key,
            base:
                Number(object[key]),
            label
        });
    }

    function addHitboxVectorTarget(
        targets,
        seen,
        object,
        label
    ) {
        if (
            !object ||
            !finiteReasonableNumber(object.x) ||
            !finiteReasonableNumber(object.y) ||
            !finiteReasonableNumber(object.z)
        ) {
            return;
        }

        let objectSet =
            seen.get(object);

        if (!objectSet) {
            objectSet =
                new Set();

            seen.set(
                object,
                objectSet
            );
        }

        const key =
            '__xyz__';

        if (
            objectSet.has(key)
        ) {
            return;
        }

        objectSet.add(key);

        targets.push({
            type: 'vector',
            object,
            base: {
                x:
                    Number(object.x),
                y:
                    Number(object.y),
                z:
                    Number(object.z)
            },
            label
        });
    }

    function scanHitboxObject(
        root,
        rootLabel,
        targets,
        seen
    ) {
        if (
            !root ||
            (
                typeof root !== 'object' &&
                typeof root !== 'function'
            )
        ) {
            return;
        }

        for (
            const key
            of HITBOX_SCALAR_KEYS
        ) {
            try {
                addHitboxScalarTarget(
                    targets,
                    seen,
                    root,
                    key,
                    `${rootLabel}.${key}`
                );
            } catch {}
        }

        for (
            const nestedKey
            of HITBOX_NESTED_KEYS
        ) {
            let nested;

            try {
                nested =
                    root[nestedKey];
            } catch {
                continue;
            }

            if (
                !nested ||
                typeof nested !== 'object'
            ) {
                continue;
            }

            for (
                const key
                of HITBOX_SCALAR_KEYS
            ) {
                try {
                    addHitboxScalarTarget(
                        targets,
                        seen,
                        nested,
                        key,
                        `${rootLabel}.${nestedKey}.${key}`
                    );
                } catch {}
            }

            if (
                nestedKey === 'size' ||
                nestedKey === 'dimensions'
            ) {
                try {
                    addHitboxVectorTarget(
                        targets,
                        seen,
                        nested,
                        `${rootLabel}.${nestedKey}`
                    );
                } catch {}
            }
        }
    }

    function restoreHitbox() {
        for (
            const target
            of state.hitboxTargets
        ) {
            try {
                if (
                    target.type ===
                    'scalar'
                ) {
                    target.object[
                        target.key
                    ] =
                        target.base;
                } else if (
                    target.type ===
                    'vector'
                ) {
                    target.object.x =
                        target.base.x;

                    target.object.y =
                        target.base.y;

                    target.object.z =
                        target.base.z;
                }
            } catch {}
        }
    }

    function clearHitboxTargets() {
        restoreHitbox();

        state.hitboxTargets =
            [];

        state.hitboxSignature =
            null;
    }

    function discoverHitboxTargets() {
        const player =
            state.player;

        const renderEntity =
            state.renderEntity;

        const signature =
            `${player ? 'p' : '-'}:${renderEntity ? 'e' : '-'}:${player === renderEntity ? 'same' : 'diff'}`;

        if (
            state.hitboxTargets.length &&
            state.hitboxSignature ===
                signature
        ) {
            return;
        }

        clearHitboxTargets();

        const targets = [];
        const seen =
            new WeakMap();

        scanHitboxObject(
            player,
            'player',
            targets,
            seen
        );

        if (
            renderEntity &&
            renderEntity !== player
        ) {
            scanHitboxObject(
                renderEntity,
                'renderEntity',
                targets,
                seen
            );
        }

        state.hitboxTargets =
            targets;

        state.hitboxSignature =
            signature;
    }

    function applyLocalHitboxScale() {
        if (
            !state.hitboxEnabled
        ) {
            restoreHitbox();
            return;
        }

        discoverHitboxTargets();

        const factor =
            clamp(
                Number(getEffectiveScale()) || 1,
                CONFIG.minScale,
                CONFIG.maxScale
            );

        const widthFactor =
            clamp(
                Number(getEffectiveWidth()) || 1,
                CONFIG.minWidth,
                CONFIG.maxWidth
            );

        for (
            const target
            of state.hitboxTargets
        ) {
            try {
                if (
                    target.type ===
                    'scalar'
                ) {
                    const mult =
                        HITBOX_HEIGHT_KEYS.has(target.key)
                            ? factor
                            : factor * widthFactor;

                    target.object[
                        target.key
                    ] =
                        target.base *
                        mult;
                } else if (
                    target.type ===
                    'vector'
                ) {
                    target.object.x =
                        target.base.x *
                        factor *
                        widthFactor;

                    target.object.y =
                        target.base.y *
                        factor;

                    target.object.z =
                        target.base.z *
                        factor *
                        widthFactor;
                }
            } catch {}
        }

        const candidates = [
            state.player,
            state.renderEntity
        ];

        for (
            const object
            of candidates
        ) {
            if (
                !object ||
                typeof object.setSize !==
                    'function'
            ) {
                continue;
            }

            const width =
                state.hitboxTargets.find(
                    target =>
                        target.object === object &&
                        target.key === 'width'
                );

            const height =
                state.hitboxTargets.find(
                    target =>
                        target.object === object &&
                        target.key === 'height'
                );

            if (
                width &&
                height
            ) {
                try {
                    object.setSize(
                        width.base *
                            factor *
                            widthFactor,
                        height.base *
                            factor
                    );
                } catch {}
            }
        }
    }

    function setHitboxEnabled(
        enabled
    ) {
        state.hitboxEnabled =
            !!enabled;

        if (
            !state.hitboxEnabled
        ) {
            restoreHitbox();
        } else {
            discoverHitboxTargets();
            applyLocalHitboxScale();
        }

        updateUI();
    }

    function findLocalRenderEntity(game) {
        const player = game?.player;

        if (!player) {
            return null;
        }

        const entities =
            resolveEntityMap(game);

        if (entities) {
            try {
                if (player.id !== undefined) {
                    const exact =
                        entities.get(player.id);

                    if (
                        exact &&
                        exact.mesh
                    ) {
                        return exact;
                    }

                    const stringExact =
                        entities.get(
                            String(player.id)
                        );

                    if (
                        stringExact &&
                        stringExact.mesh
                    ) {
                        return stringExact;
                    }
                }
            } catch {}

            try {
                for (const entity of entities.values()) {
                    if (!entity?.mesh) {
                        continue;
                    }

                    if (
                        sameId(
                            entity.id,
                            player.id
                        )
                    ) {
                        return entity;
                    }

                    if (
                        player.uuid &&
                        entity.uuid &&
                        String(entity.uuid) ===
                            String(player.uuid)
                    ) {
                        return entity;
                    }

                    if (
                        player.name &&
                        entity.name &&
                        String(entity.name) ===
                            String(player.name)
                    ) {
                        return entity;
                    }
                }
            } catch {}
        }

        if (
            player.mesh
        ) {
            return player;
        }

        return null;
    }

    function collectRenderables(root) {
        const result = [];
        const seen = new WeakSet();
        const queue = [root];

        while (queue.length) {
            const object = queue.shift();

            if (
                !object ||
                typeof object !== 'object' ||
                seen.has(object)
            ) {
                continue;
            }

            seen.add(object);

            if (
                object.isMesh === true ||
                object.isLine === true ||
                object.isPoints === true ||
                object.geometry
            ) {
                result.push(object);
            }

            if (Array.isArray(object.children)) {
                for (const child of object.children) {
                    queue.push(child);
                }
            }
        }

        return result;
    }

    function uninstallHooks() {
        for (const entry of state.renderHooks) {
            try {
                if (
                    entry.object.onBeforeRender ===
                    entry.hook
                ) {
                    entry.object.onBeforeRender =
                        entry.previous;
                }
            } catch {}
        }

        state.renderHooks = [];
    }

    function restoreBaseScale() {
        if (
            state.renderMesh &&
            state.baseScale &&
            validScale(
                state.renderMesh.scale
            )
        ) {
            setScaleVector(
                state.renderMesh.scale,
                state.baseScale.x,
                state.baseScale.y,
                state.baseScale.z
            );
        }

        // revertir el offset de anclaje aplicado
        const prev = Number(state.lastAppliedOffset) || 0;
        if (prev && state.renderMesh?.position) {
            try {
                state.renderMesh.position.y -= prev;
            } catch {}
        }
        state.lastAppliedOffset = 0;
    }

    function clearRenderTarget() {
        restoreBaseScale();
        clearHitboxTargets();
        resetCameraTarget();
        clearNameTagTarget();
        uninstallHooks();

        state.renderEntity = null;
        state.renderMesh = null;
        state.baseScale = null;
        state.entityMap = null;
    }

    function applyCurrentScale() {
        const mesh = state.renderMesh;

        if (
            !mesh ||
            !state.baseScale ||
            !validScale(mesh.scale)
        ) {
            return false;
        }

        const factor =
            clamp(
                Number(getEffectiveScale()) || 1,
                CONFIG.minScale,
                CONFIG.maxScale
            );

        const widthFactor =
            clamp(
                Number(getEffectiveWidth()) || 1,
                CONFIG.minWidth,
                CONFIG.maxWidth
            );

        setScaleVector(
            mesh.scale,
            state.baseScale.x * factor * widthFactor,
            state.baseScale.y * factor,
            state.baseScale.z * factor * widthFactor
        );

        // offset vertical (anclaje al suelo): suma un corrimiento al Y actual.
        // El juego reposiciona el mesh cada frame; para no acumular, se resta
        // el offset anterior aplicado y se suma el nuevo.
        const offset =
            state.enabled
                ? clamp(
                    Number(getEffectiveGroundOffset?.()) || 0,
                    CONFIG.minGroundOffset,
                    CONFIG.maxGroundOffset
                ) * factor
                : 0;

        if (Number.isFinite(offset) && mesh.position) {
            const prev = Number(state.lastAppliedOffset) || 0;
            const nextY = Number(mesh.position.y) - prev + offset;
            if (Number.isFinite(nextY)) {
                try {
                    mesh.position.y = nextY;
                    state.lastAppliedOffset = offset;
                } catch {}
            }
        } else {
            state.lastAppliedOffset = 0;
        }

        try {
            if (
                mesh.matrixAutoUpdate === false &&
                typeof mesh.updateMatrix ===
                    'function'
            ) {
                mesh.updateMatrix();
            }
        } catch {}

        return true;
    }

    function installHooks(mesh) {
        uninstallHooks();

        const renderables =
            collectRenderables(mesh);

        for (const object of renderables) {
            const previous =
                object.onBeforeRender;

            const hook =
                function (...args) {
                    if (
                        typeof previous ===
                        'function'
                    ) {
                        try {
                            previous.apply(
                                this,
                                args
                            );
                        } catch {}
                    }

                    applyCurrentScale();
                };

            try {
                object.onBeforeRender =
                    hook;

                state.renderHooks.push({
                    object,
                    previous,
                    hook
                });
            } catch {}
        }
    }

    function resolveRenderTarget(force = false) {
        const now = performance.now();

        if (
            !force &&
            state.renderMesh &&
            validScale(
                state.renderMesh.scale
            ) &&
            now -
                state.lastEntityScan <
                700
        ) {
            return state.renderMesh;
        }

        state.lastEntityScan = now;

        const game =
            getGame(force);

        if (!game?.player) {
            return null;
        }

        const entity =
            findLocalRenderEntity(game);

        const mesh =
            entity?.mesh;

        if (
            !mesh ||
            !validScale(mesh.scale)
        ) {
            return null;
        }

        if (
            state.renderMesh !== mesh
        ) {
            clearRenderTarget();

            state.renderEntity =
                entity;

            state.renderMesh =
                mesh;

            state.baseScale = {
                x:
                    Number(mesh.scale.x),
                y:
                    Number(mesh.scale.y),
                z:
                    Number(mesh.scale.z)
            };

            state.basePositionY =
                Number(mesh.position?.y);

            installHooks(mesh);
            discoverHitboxTargets();
            resolveNameTag(true);
        }

        return mesh;
    }

    function setScale(value) {
        state.scale =
            clamp(
                Number(value) || 1,
                CONFIG.minScale,
                CONFIG.maxScale
            );

        resolveRenderTarget(true);
        applyCurrentScale();
        applyLocalHitboxScale();
        applyCameraHeight();
        resolveNameTag(true);
        applyNameTagHeight();
        updateUI();
    }

    function setWidth(value) {
        state.width =
            clamp(
                Number(value) || 1,
                CONFIG.minWidth,
                CONFIG.maxWidth
            );

        resolveRenderTarget(true);
        applyCurrentScale();
        applyLocalHitboxScale();
        updateUI();
    }

    function resetScale() {
        setScale(1);
    }
    const EVENT_CONFIG = 'minifeather:titantiny-config';
    const EVENT_STATE = 'minifeather:titantiny-state';
    const EVENT_BINDING = 'minifeather:titantiny-binding';

    let bindingCaptureActive = false;

    function normalizeBind(value) {
        const bind = String(value || '').trim();
        return bind === 'None' ? '' : bind;
    }

    function emitState(reason = 'state') {
        try {
            document.dispatchEvent(new CustomEvent(EVENT_STATE, {
                detail: JSON.stringify({
                    enabled: !!state.enabled,
                    scale: Number(state.scale) || 1,
                    width: Number(state.width) || 1,
                    groundOffset: Number(state.groundOffset) || 0,
                    bind: state.bind || '',
                    reason
                })
            }));
        } catch (_) {}
    }

    function applyEnabledState(force = false) {
        if (!state.enabled) {
            clearRenderTarget();
            return;
        }

        const mesh = resolveRenderTarget(force);
        if (!mesh) return;

        state.hitboxEnabled = true;
        state.cameraHeightEnabled = true;
        state.nameTagEnabled = true;

        applyCurrentScale();
        applyLocalHitboxScale();
        applyCameraHeight();
        resolveNameTag(force);
        applyNameTagHeight();
    }

    function setEnabled(enabled, notify = false) {
        const next = !!enabled;
        if (state.enabled === next) {
            if (next) applyEnabledState(true);
            if (notify) emitState('enabled');
            return;
        }

        state.enabled = next;
        applyEnabledState(true);
        if (notify) emitState('enabled');
    }

    function setBind(value, notify = false) {
        state.bind = normalizeBind(value);
        if (notify) emitState('bind');
    }

    function applyConfig(detail) {
        let config = detail;
        if (typeof config === 'string') {
            try { config = JSON.parse(config); } catch (_) { return; }
        }
        if (!config || typeof config !== 'object') return;

        if ('scale' in config) {
            state.scale = clamp(
                Number(config.scale) || CONFIG.defaultScale,
                CONFIG.minScale,
                CONFIG.maxScale
            );
        }
        if ('width' in config) {
            state.width = clamp(
                Number(config.width) || CONFIG.defaultWidth,
                CONFIG.minWidth,
                CONFIG.maxWidth
            );
        }
        if ('groundOffset' in config) {
            state.groundOffset = clamp(
                Number(config.groundOffset) || 0,
                CONFIG.minGroundOffset,
                CONFIG.maxGroundOffset
            );
        }
        if ('bind' in config) setBind(config.bind, false);
        if ('enabled' in config) state.enabled = !!config.enabled;

        applyEnabledState(true);
    }

    document.addEventListener(EVENT_CONFIG, event => {
        applyConfig(event.detail);
    }, true);

    document.addEventListener(EVENT_BINDING, event => {
        let value = event.detail;
        if (typeof value === 'string') {
            try { value = JSON.parse(value); } catch (_) {}
        }
        bindingCaptureActive = value === true || value?.active === true;
    }, true);

    document.addEventListener('keydown', event => {
        if (bindingCaptureActive || event.repeat || !state.bind) return;
        if (event.code !== state.bind) return;

        const target = event.target;
        const tag = String(target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        setEnabled(!state.enabled, true);
    }, true);

    function loop() {
        if (state.enabled) {
            applyEnabledState(false);
        }
        requestAnimationFrame(loop);
    }

    window.TitanTiny = {
        setScale(value) {
            state.scale = clamp(
                Number(value) || CONFIG.defaultScale,
                CONFIG.minScale,
                CONFIG.maxScale
            );
            applyEnabledState(true);
            emitState('scale');
        },
        setWidth(value) {
            state.width = clamp(
                Number(value) || CONFIG.defaultWidth,
                CONFIG.minWidth,
                CONFIG.maxWidth
            );
            applyEnabledState(true);
            emitState('width');
        },
        setGroundOffset(value) {
            state.groundOffset = clamp(
                Number(value) || 0,
                CONFIG.minGroundOffset,
                CONFIG.maxGroundOffset
            );
            applyEnabledState(true);
            emitState('groundOffset');
        },
        setEnabled(value) {
            setEnabled(value, true);
        },
        setBind(value) {
            setBind(value, true);
        },
        tiny() {
            this.setScale(0.35);
        },
        normal() {
            this.setScale(1);
        },
        titan() {
            this.setScale(3);
        },
        reset() {
            this.setScale(1);
            this.setWidth(1);
            this.setGroundOffset(0);
        },
        refresh() {
            clearRenderTarget();
            applyEnabledState(true);
            emitState('refresh');
        },
        get enabled() {
            return state.enabled;
        },
        get scale() {
            return state.scale;
        },
        get width() {
            return state.width;
        },
        get bind() {
            return state.bind;
        },
        get modelFound() {
            return !!state.renderMesh;
        },
        get playerId() {
            return state.renderEntity?.id ?? state.player?.id ?? null;
        },
        get hitboxFields() {
            return state.hitboxTargets.map(target => target.label);
        },
        get cameraPath() {
            return state.cameraPath;
        },
        get nameTagPath() {
            return state.nameTagPath;
        }
    };

    requestAnimationFrame(loop);
})();
