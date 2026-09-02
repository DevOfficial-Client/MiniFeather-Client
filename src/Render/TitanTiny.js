(function () {
    'use strict';

    const CONFIG = {
        minScale: 0.20,
        maxScale: 5.00,
        defaultScale: 1.00,
        syncLocalHitbox: true,
        syncCameraHeight: true,
        cameraHeightMultiplier: 1.00,
        syncNameTagHeight: true,
        nativeNameTagGap: 0.70
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
        baseScale: null,

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
        lastCameraScan: 0,

        nameTagEnabled: true,
        nameTagObject: null,
        nameTagPath: null,
        nameTagBase: null,
        nameTagPatchedMesh: null,
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

    function getNativeEyeHeight(player) {
        if (!player) {
            return null;
        }

        try {
            if (
                typeof player.getEyePos ===
                    'function' &&
                validPosition(player.pos)
            ) {
                const eye =
                    player.getEyePos();

                if (validPosition(eye)) {
                    const h =
                        Number(eye.y) -
                        Number(player.pos.y);

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

        // Refresh eye height every ~2s in case the game changes it
        // (e.g. player respawns, eats, etc.)
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
            // Let the game update the matrix normally
            const result = original.apply(
                thisArg,
                args
            );

            // Apply Y offset directly to the matrixWorld translation
            // matrixWorld.elements[13] = Y translation component
            // This avoids touching camera.position (which the game's
            // logic reads for raycasting, audio, etc.)
            const mx = camera.matrixWorld;
            if (mx && mx.elements) {
                mx.elements[13] += offset;
            }

            // Also update matrixWorldInverse if it exists (used by projection)
            const mxi = camera.matrixWorldInverse;
            if (mxi && mxi.elements) {
                mxi.elements[13] -= offset;
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

        // Only hook updateMatrixWorld — it's the single entry point
        // for matrix updates. Hooking updateWorldMatrix too caused
        // double-offset application and jitter.
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
        const game =
            getGame();

        if (!game?.player) {
            return;
        }

        const camera =
            resolveCamera(game);

        if (!camera) {
            return;
        }

        if (
            !Number.isFinite(
                state.cameraBaseEyeHeight
            ) ||
            state.cameraBaseEyeHeight <= 0
        ) {
            state.cameraBaseEyeHeight =
                getNativeEyeHeight(
                    game.player
                );
        }

        installCameraHook(camera);
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


    // =========================================================
    // Native NameTag Height Sync
    // =========================================================
    // MiniBlox keeps the floating player label separate from the body mesh.
    // This moves the native label anchor to the visual top of Tiny/Titan while
    // preserving the original text size so name/range/health stay readable.

    const NATIVE_NAMETAG_OFFSET_METHOD =
        'DskCNsFNrprfkz';

    function restoreNativeNameTagHook() {
        const mesh =
            state.nameTagPatchedMesh;

        if (
            mesh &&
            state.nameTagOriginalOffsetFn
        ) {
            try {
                if (state.nameTagHadOwnOffset) {
                    mesh[NATIVE_NAMETAG_OFFSET_METHOD] =
                        state.nameTagOwnOffsetValue;
                } else {
                    delete mesh[
                        NATIVE_NAMETAG_OFFSET_METHOD
                    ];
                }
            } catch {
                try {
                    mesh[NATIVE_NAMETAG_OFFSET_METHOD] =
                        state.nameTagOriginalOffsetFn;
                } catch {}
            }
        }

        state.nameTagPatchedMesh = null;
        state.nameTagOriginalOffsetFn = null;
        state.nameTagHadOwnOffset = false;
        state.nameTagOwnOffsetValue = undefined;
        state.nameTagCurrentOffset = null;
    }

    function installNativeNameTagHook(mesh) {
        if (
            !state.nameTagEnabled ||
            !mesh
        ) {
            return false;
        }

        const method =
            mesh[
                NATIVE_NAMETAG_OFFSET_METHOD
            ];

        if (
            typeof method !==
            'function'
        ) {
            return false;
        }

        if (
            state.nameTagPatchedMesh === mesh &&
            state.nameTagOriginalOffsetFn
        ) {
            return true;
        }

        restoreNativeNameTagHook();

        const hadOwn =
            Object.prototype
                .hasOwnProperty
                .call(
                    mesh,
                    NATIVE_NAMETAG_OFFSET_METHOD
                );

        const ownValue =
            hadOwn
                ? mesh[
                    NATIVE_NAMETAG_OFFSET_METHOD
                ]
                : undefined;

        const original =
            method;

        state.nameTagPatchedMesh =
            mesh;

        state.nameTagOriginalOffsetFn =
            original;

        state.nameTagHadOwnOffset =
            hadOwn;

        state.nameTagOwnOffsetValue =
            ownValue;

        state.nameTagObject =
            mesh.nameTag || mesh;

        state.nameTagPath =
            `renderMesh.${NATIVE_NAMETAG_OFFSET_METHOD}`;

        let vanillaOffset = null;

        try {
            vanillaOffset =
                Number(
                    original.call(mesh)
                );
        } catch {}

        const gap =
            Number(
                CONFIG.nativeNameTagGap
            );

        state.nameTagBase = {
            space: 'native-offset',
            height:
                Number.isFinite(
                    vanillaOffset
                )
                    ? vanillaOffset
                    : null,
            gap:
                Number.isFinite(gap)
                    ? gap
                    : 0.70,
            bodyOffset:
                Number.isFinite(
                    vanillaOffset
                )
                    ? vanillaOffset -
                        (
                            Number.isFinite(gap)
                                ? gap
                                : 0.70
                        )
                    : null
        };

        mesh[
            NATIVE_NAMETAG_OFFSET_METHOD
        ] = function (...args) {
            const vanilla =
                Number(
                    original.apply(
                        this,
                        args
                    )
                );

            if (
                !Number.isFinite(
                    vanilla
                )
            ) {
                return vanilla;
            }

            if (
                !state.nameTagEnabled
            ) {
                return vanilla;
            }

            const factor =
                clamp(
                    Number(getEffectiveScale()) || 1,
                    CONFIG.minScale,
                    CONFIG.maxScale
                );

            const nativeGap =
                Number.isFinite(
                    Number(
                        CONFIG.nativeNameTagGap
                    )
                )
                    ? Number(
                        CONFIG.nativeNameTagGap
                    )
                    : 0.70;

            /*
             * Current MiniBlox build:
             *
             * DskCNsFNrprfkz(){return .7+dt}
             *
             * ABPXLcQiyzFdP() renders the floating label with:
             *
             * y: this.position.y + this.DskCNsFNrprfkz()
             *
             * The visual body is scaled independently, so vanilla keeps
             * returning the normal-height offset. Preserve MiniBlox's
             * 0.70 label gap and scale only the body portion.
             *
             * At scale 1 this is exactly vanilla.
             * Observed vanilla offset: 2.195
             * Body portion: 2.195 - 0.70 = 1.495
             */
            const bodyOffset =
                vanilla -
                nativeGap;

            const result =
                nativeGap +
                bodyOffset *
                factor;

            state.nameTagCurrentOffset =
                result;

            return result;
        };

        try {
            state.nameTagCurrentOffset =
                Number(
                    mesh[
                        NATIVE_NAMETAG_OFFSET_METHOD
                    ]()
                );
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
            typeof mesh[
                NATIVE_NAMETAG_OFFSET_METHOD
            ] !== 'function'
        ) {
            if (
                state.nameTagPatchedMesh ===
                mesh
            ) {
                clearNameTagTarget();
            }

            return null;
        }

        installNativeNameTagHook(
            mesh
        );

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
            const value =
                Number(
                    mesh[
                        NATIVE_NAMETAG_OFFSET_METHOD
                    ]()
                );

            if (
                Number.isFinite(value)
            ) {
                state.nameTagCurrentOffset =
                    value;
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
                        target.base *
                        factor;
                } else if (
                    target.type ===
                    'vector'
                ) {
                    target.object.x =
                        target.base.x *
                        factor;

                    target.object.y =
                        target.base.y *
                        factor;

                    target.object.z =
                        target.base.z *
                        factor;
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
                            factor,
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

        setScaleVector(
            mesh.scale,
            state.baseScale.x * factor,
            state.baseScale.y * factor,
            state.baseScale.z * factor
        );

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

        // These three sync systems are intentionally always on while the
        // Titan & Tiny module is enabled. There are no user-facing toggles.
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
