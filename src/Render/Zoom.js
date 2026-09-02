(function () {
    'use strict';

    const CONFIG = {
        defaultZoom: 1.00,
        minZoom: 1.00,
        maxZoom: 20.00,
        step: 0.35,
        fineStep: 0.08,
        requirePointerLock: true,
        showIndicator: true,
        indicatorDuration: 650,
        defaultBind: 'KeyZ'
    };

    const EVENT_CONFIG = 'minifeather:zoom-config';
    const EVENT_STATE = 'minifeather:zoom-state';
    const EVENT_BINDING = 'minifeather:zoom-binding';

    const state = {
        game: null,
        camera: null,
        gameScene: null,
        enabled: false,
        bind: CONFIG.defaultBind,
        zoom: CONFIG.defaultZoom,
        hookedScene: null,
        originalUpdateCameraZoom: null,
        hookedUpdateCameraZoom: null,
        indicator: null,
        indicatorTimer: null,
        activationHeld: false,
        bindingCaptureActive: false,
        lastResolve: 0
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function normalizeBind(value) {
        return String(value || '').trim();
    }

    function findGame() {
        const react = document.querySelector('#react');
        if (!react) return null;

        try {
            for (const value of Object.values(react)) {
                const game = value
                    ?.updateQueue
                    ?.baseState
                    ?.element
                    ?.props
                    ?.game;

                if (game?.player && game?.gameScene) {
                    return game;
                }
            }
        } catch (_) {}

        return null;
    }

    function resolveCamera(force = false) {
        if (!state.enabled) return null;

        const now = performance.now();

        if (
            !force &&
            state.camera &&
            state.gameScene?.camera === state.camera &&
            now - state.lastResolve < 1000
        ) {
            return state.camera;
        }

        state.lastResolve = now;

        const game = findGame();
        const gameScene = game?.gameScene;
        const camera = gameScene?.camera;

        if (!camera) return null;

        state.game = game;
        state.gameScene = gameScene;
        state.camera = camera;

        installCameraHook(gameScene);
        return camera;
    }

    function applyZoom() {
        if (!state.enabled) return false;

        const camera = state.camera || resolveCamera();
        if (!camera) return false;

        const zoom = clamp(
            Number(state.zoom) || CONFIG.defaultZoom,
            CONFIG.minZoom,
            CONFIG.maxZoom
        );

        state.zoom = zoom;

        try {
            camera.zoom = zoom;
            camera.updateProjectionMatrix?.();
            return true;
        } catch (_) {
            return false;
        }
    }

    function restoreCameraZoom() {
        const camera = state.camera || state.gameScene?.camera;
        if (!camera) return;

        try {
            camera.zoom = CONFIG.defaultZoom;
            camera.updateProjectionMatrix?.();
        } catch (_) {}
    }

    function uninstallCameraHook() {
        if (state.hookedScene && state.originalUpdateCameraZoom) {
            try {
                if (state.hookedScene.updateCameraZoom === state.hookedUpdateCameraZoom) {
                    state.hookedScene.updateCameraZoom = state.originalUpdateCameraZoom;
                }
            } catch (_) {}
        }

        state.hookedScene = null;
        state.originalUpdateCameraZoom = null;
        state.hookedUpdateCameraZoom = null;
    }

    function installCameraHook(scene) {
        if (!state.enabled || !scene || state.hookedScene === scene) return;

        uninstallCameraHook();

        const original = scene.updateCameraZoom;
        if (typeof original !== 'function') return;

        state.hookedScene = scene;
        state.originalUpdateCameraZoom = original;

        const hooked = function (...args) {
            const result = original.apply(this, args);

            state.camera = this.camera || state.camera;

            if (state.enabled) {
                applyZoom();
            }

            return result;
        };

        state.hookedUpdateCameraZoom = hooked;
        scene.updateCameraZoom = hooked;
    }

    function ensureIndicator() {
        if (!CONFIG.showIndicator) return null;
        if (state.indicator?.isConnected) return state.indicator;

        const element = document.createElement('div');
        element.id = 'mb-mega-zoom-indicator';

        Object.assign(element.style, {
            position: 'fixed',
            left: '50%',
            top: '14%',
            transform: 'translate(-50%, -50%)',
            zIndex: '2147483647',
            padding: '8px 13px',
            borderRadius: '10px',
            background: 'rgba(10, 10, 13, .82)',
            color: '#ffffff',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: '14px',
            fontWeight: '700',
            letterSpacing: '.2px',
            pointerEvents: 'none',
            opacity: '0',
            transition: 'opacity 120ms ease',
            backdropFilter: 'blur(8px)'
        });

        document.documentElement.appendChild(element);
        state.indicator = element;
        return element;
    }

    function hideIndicator() {
        clearTimeout(state.indicatorTimer);
        state.indicatorTimer = null;
        if (state.indicator) state.indicator.style.opacity = '0';
    }

    function showZoomIndicator() {
        if (!state.enabled) return;

        const indicator = ensureIndicator();
        if (!indicator) return;

        indicator.textContent = `Zoom ${state.zoom.toFixed(2)}x`;
        indicator.style.opacity = '1';

        clearTimeout(state.indicatorTimer);
        state.indicatorTimer = setTimeout(() => {
            if (state.indicator) state.indicator.style.opacity = '0';
        }, CONFIG.indicatorDuration);
    }

    function canUseWheelZoom() {
        if (!state.enabled || !state.activationHeld || !state.bind) return false;

        if (CONFIG.requirePointerLock && !document.pointerLockElement) {
            return false;
        }

        const game = state.game || findGame();
        if (!game?.player) return false;

        try {
            const GameClass = game.constructor;

            if (
                typeof GameClass?.isChatting === 'function' &&
                GameClass.isChatting()
            ) {
                return false;
            }

            if (
                typeof GameClass?.hasMenuOpen === 'function' &&
                GameClass.hasMenuOpen()
            ) {
                return false;
            }
        } catch (_) {}

        return true;
    }

    function changeZoom(direction, fine = false) {
        if (!state.enabled) return state.zoom;

        const step = fine ? CONFIG.fineStep : CONFIG.step;

        state.zoom = clamp(
            state.zoom + direction * step,
            CONFIG.minZoom,
            CONFIG.maxZoom
        );

        resolveCamera(true);
        applyZoom();
        showZoomIndicator();
        return state.zoom;
    }

    function resetZoom(show = false) {
        state.zoom = CONFIG.defaultZoom;

        if (state.enabled) {
            resolveCamera(true);
            applyZoom();
            if (show) showZoomIndicator();
        } else {
            restoreCameraZoom();
        }

        return state.zoom;
    }

    function cancelActivation(showReset = false) {
        const wasActive = state.activationHeld || state.zoom !== CONFIG.defaultZoom;
        state.activationHeld = false;

        if (wasActive) {
            resetZoom(showReset && state.enabled);
        }
    }

    function setEnabled(value, notify = false) {
        const next = !!value;
        if (state.enabled === next) {
            if (next) {
                resolveCamera(true);
                applyZoom();
            }
            if (notify) emitState('enabled');
            return;
        }

        if (!next) {
            cancelActivation(false);
            restoreCameraZoom();
            uninstallCameraHook();
            hideIndicator();
        }

        state.enabled = next;

        if (next) {
            state.zoom = CONFIG.defaultZoom;
            resolveCamera(true);
            applyZoom();
        }

        if (notify) emitState('enabled');
    }

    function setBind(value, notify = false) {
        const next = normalizeBind(value);
        if (state.bind === next) {
            if (notify) emitState('bind');
            return;
        }

        cancelActivation(false);
        state.bind = next;
        if (notify) emitState('bind');
    }

    function emitState(reason = 'state') {
        try {
            document.dispatchEvent(new CustomEvent(EVENT_STATE, {
                detail: JSON.stringify({
                    enabled: !!state.enabled,
                    bind: state.bind || '',
                    zoom: Number(state.zoom) || CONFIG.defaultZoom,
                    reason
                })
            }));
        } catch (_) {}
    }

    function applyConfig(detail) {
        let config = detail;

        if (typeof config === 'string') {
            try {
                config = JSON.parse(config);
            } catch (_) {
                return;
            }
        }

        if (!config || typeof config !== 'object') return;

        if ('bind' in config) setBind(config.bind, false);
        if ('enabled' in config) setEnabled(config.enabled, false);
    }

    function onWheel(event) {
        if (!canUseWheelZoom() || event.deltaY === 0) return;

        const direction = event.deltaY < 0 ? 1 : -1;
        changeZoom(direction, event.ctrlKey);

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    document.addEventListener(EVENT_CONFIG, event => {
        applyConfig(event.detail);
    }, true);

    document.addEventListener(EVENT_BINDING, event => {
        let value = event.detail;
        if (typeof value === 'string') {
            try {
                value = JSON.parse(value);
            } catch (_) {}
        }

        state.bindingCaptureActive = value === true || value?.active === true;

        if (state.bindingCaptureActive) {
            cancelActivation(false);
        }
    }, true);

    window.addEventListener('keydown', event => {
        if (
            !state.enabled ||
            state.bindingCaptureActive ||
            !state.bind ||
            event.code !== state.bind ||
            event.repeat
        ) {
            return;
        }

        const target = event.target;
        const tag = String(target?.tagName || '').toLowerCase();
        if (
            tag === 'input' ||
            tag === 'textarea' ||
            tag === 'select' ||
            target?.isContentEditable
        ) {
            return;
        }

        if (CONFIG.requirePointerLock && !document.pointerLockElement) return;

        state.activationHeld = true;
        resolveCamera(true);

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }, true);

    window.addEventListener('keyup', event => {
        if (!state.bind || event.code !== state.bind) return;

        if (state.enabled && !state.bindingCaptureActive) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }

        if (!state.activationHeld) return;

        state.activationHeld = false;
        resetZoom(false);
    }, true);

    window.addEventListener('blur', () => {
        cancelActivation(false);
    });

    document.addEventListener('pointerlockchange', () => {
        if (!document.pointerLockElement) {
            cancelActivation(false);
        }
    }, true);

    window.addEventListener('wheel', onWheel, {
        passive: false,
        capture: true
    });

    function loop() {
        if (state.enabled) {
            resolveCamera();
            applyZoom();
        }

        requestAnimationFrame(loop);
    }

    globalThis.MiniBloxZoom = {
        get enabled() {
            return state.enabled;
        },
        get bind() {
            return state.bind;
        },
        get zoom() {
            return state.zoom;
        },
        get activationHeld() {
            return state.activationHeld;
        },
        setEnabled(value) {
            setEnabled(value, true);
            return state.enabled;
        },
        setBind(value) {
            setBind(value, true);
            return state.bind;
        },
        setZoom(value) {
            if (!state.enabled) return state.zoom;

            state.zoom = clamp(
                Number(value) || CONFIG.defaultZoom,
                CONFIG.minZoom,
                CONFIG.maxZoom
            );

            resolveCamera(true);
            applyZoom();
            showZoomIndicator();
            return state.zoom;
        },
        zoomIn() {
            return changeZoom(1);
        },
        zoomOut() {
            return changeZoom(-1);
        },
        reset() {
            return resetZoom(true);
        },
        get camera() {
            return state.camera;
        }
    };

    requestAnimationFrame(loop);
})();
