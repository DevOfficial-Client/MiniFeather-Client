(() => {
    'use strict';

    const W = globalThis;
    const TAG = '[MiniFeather Shader Safety]';

    const state = {
        game: null,
        cloudBaseline: null,
        api: null,
        originalDisable: null,
        disableEvent: false,
        wrapped: false
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
        state.game = game || state.game;
        return game;
    }

    function roots() {
        const game = findGame();
        return [
            game?.gameScene?.scene,
            game?.gameScene?.camera,
            game?.camera
        ].filter(Boolean);
    }

    function collect(root) {
        const out = [];
        const queue = [root];
        const seen = new WeakSet();

        while (queue.length && out.length < 5000) {
            const object = queue.shift();
            if (!object || typeof object !== 'object' || seen.has(object)) continue;
            seen.add(object);
            out.push(object);
            if (Array.isArray(object.children)) {
                for (const child of object.children) queue.push(child);
            }
        }

        return out;
    }

    function materials() {
        const set = new Set();

        for (const root of roots()) {
            for (const object of collect(root)) {
                const material = object?.material;
                if (!material) continue;

                if (Array.isArray(material)) {
                    for (const entry of material) if (entry) set.add(entry);
                } else {
                    set.add(material);
                }
            }
        }

        return set;
    }

    function findCloudMaterial() {
        for (const material of materials()) {
            const u = material?.uniforms;
            if (
                u?.uCoverage &&
                u?.uNoiseScale &&
                u?.uWind &&
                u?.uThickness &&
                u?.uCloudY &&
                u?.uOpacity
            ) {
                return material;
            }
        }
        return null;
    }

    function cloneUniformValue(value) {
        if (value == null || typeof value !== 'object') return value;
        if (typeof value.clone === 'function') {
            try { return value.clone(); } catch {}
        }
        if (Array.isArray(value)) return value.slice();
        return value;
    }

    function snapshotClouds() {
        if (state.cloudBaseline) return;

        const material = findCloudMaterial();
        if (!material) return;

        const names = [
            'uCoverage',
            'uNoiseScale',
            'uWind',
            'uThickness',
            'uCloudY',
            'uOpacity',
            'uNoiseTex'
        ];

        const uniforms = {};

        for (const name of names) {
            if (material.uniforms?.[name]) {
                uniforms[name] = cloneUniformValue(material.uniforms[name].value);
            }
        }

        state.cloudBaseline = {
            material,
            uniforms,
            vertexShader: material.vertexShader,
            fragmentShader: material.fragmentShader,
            onBeforeCompile: material.onBeforeCompile,
            customProgramCacheKey: material.customProgramCacheKey
        };
    }

    function restoreClouds() {
        const base = state.cloudBaseline;
        if (!base) return;

        const material =
            base.material?.uniforms
                ? base.material
                : findCloudMaterial();

        if (!material) return;

        try {
            for (const [name, value] of Object.entries(base.uniforms)) {
                if (material.uniforms?.[name]) material.uniforms[name].value = value;
            }

            if (base.vertexShader !== undefined) material.vertexShader = base.vertexShader;
            if (base.fragmentShader !== undefined) material.fragmentShader = base.fragmentShader;
            if (base.onBeforeCompile) material.onBeforeCompile = base.onBeforeCompile;

            if (base.customProgramCacheKey !== undefined) {
                material.customProgramCacheKey = base.customProgramCacheKey;
            }

            material.needsUpdate = true;
        } catch {}
    }

    function restoreMaterial(material) {
        if (!material) return false;

        let touched = false;

        try {
            if (material.__mfOriginalOnBeforeCompile) {
                material.onBeforeCompile = material.__mfOriginalOnBeforeCompile;
                touched = true;
            }

            if (Object.prototype.hasOwnProperty.call(material, '__mfOriginalCacheKey')) {
                material.customProgramCacheKey = material.__mfOriginalCacheKey;
                touched = true;
            }

            if (material.__mfHooked) {
                delete material.__mfHooked;
                touched = true;
            }

            if (Object.prototype.hasOwnProperty.call(material, '__mfOriginalOnBeforeCompile')) {
                delete material.__mfOriginalOnBeforeCompile;
            }

            if (Object.prototype.hasOwnProperty.call(material, '__mfOriginalCacheKey')) {
                delete material.__mfOriginalCacheKey;
            }

            if (touched) material.needsUpdate = true;
        } catch {}

        return touched;
    }

    function restoreAllMaterials() {
        let restored = 0;
        for (const material of materials()) {
            if (restoreMaterial(material)) restored++;
        }
        return restored;
    }

    function restoreCanvas() {
        for (const canvas of document.querySelectorAll('canvas')) {
            try {
                canvas.style.filter = '';
                canvas.style.mixBlendMode = '';
                canvas.style.opacity = '';
            } catch {}
        }
    }

    function hardRestore() {
        restoreAllMaterials();
        restoreClouds();
        restoreCanvas();

        try {
            localStorage.setItem('miniblox_customshader', 'false');
        } catch {}

        try {
            W.dispatchEvent(new CustomEvent('MINIBLOX_REFRESH_CUSTOM_SHADER'));
        } catch {}

        requestAnimationFrame(() => {
            restoreAllMaterials();
            restoreClouds();
        });

        setTimeout(() => {
            restoreAllMaterials();
            restoreClouds();
        }, 100);
    }

    function wrapApi() {
        const api = W.MF_CustomShader;
        if (!api || typeof api.disable !== 'function') return false;

        if (state.wrapped && state.api === api) return true;

        state.api = api;
        state.originalDisable = api.disable.bind(api);

        api.disable = function () {
            if (state.disableEvent) {
                const result = state.originalDisable();
                hardRestore();
                return result;
            }

            state.disableEvent = true;
            try {
                document.dispatchEvent(new CustomEvent(
                    'minifeather:custom-shader-config',
                    { detail: { enabled: false, __mfSafety: true } }
                ));
            } finally {
                state.disableEvent = false;
            }

            hardRestore();
        };

        const originalEnable =
            typeof api.enable === 'function'
                ? api.enable.bind(api)
                : null;

        if (originalEnable) {
            api.enable = function () {
                snapshotClouds();
                return originalEnable();
            };
        }

        state.wrapped = true;
        return true;
    }

    document.addEventListener(
        'minifeather:custom-shader-config',
        event => {
            let cfg = event.detail;
            try {
                if (typeof cfg === 'string') cfg = JSON.parse(cfg);
            } catch {
                cfg = null;
            }

            if (!cfg || typeof cfg !== 'object') return;

            if (cfg.enabled === true || cfg.clouds || cfg.cloudsShape || cfg.cloudsPackNoise) {
                snapshotClouds();
            }

            if (cfg.enabled === false) {
                state.disableEvent = true;
                queueMicrotask(() => {
                    state.disableEvent = false;
                    hardRestore();
                });
            }
        },
        true
    );

    const timer = setInterval(() => {
        wrapApi();
        if (!state.cloudBaseline) snapshotClouds();
    }, 250);

    W.MF_CustomShaderSafety = {
        restore: hardRestore,
        getState: () => ({
            wrapped: state.wrapped,
            cloudBaseline: Boolean(state.cloudBaseline)
        }),
        destroy: () => {
            clearInterval(timer);
            hardRestore();
        }
    };
})();
