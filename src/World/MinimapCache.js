
(function () {
    'use strict';

    const TAG = '[MiniFeather Minimap Cache]';

    if (window.__MF_MINIMAP_CACHE__) return;
    window.__MF_MINIMAP_CACHE__ = true;

    const CONFIG = {
        
        minimapSize: 160,
        minimapMarginRight: 12,
        minimapMarginTop: 12,
        
        moveThreshold: 0.1,
        
        yawThreshold: 0.01,
        
        maxCacheFrames: 60,
        
        requireInGame: true
    };

    const state = {
        enabled: false,
        canvasHud: null,
        ctx: null,
        
        cacheCanvas: null,
        cacheCtx: null,
        
        lastPlayerX: null,
        lastPlayerY: null,
        lastPlayerZ: null,
        lastPlayerYaw: null,
        lastDimension: null,
        cacheFrameCount: 0,
        cacheValid: false,
        
        minimapX: 0,
        minimapY: 0,
        minimapW: 0,
        minimapH: 0,
        
        originalFillRect: null,
        originalClearRect: null,
        
        hooked: false,
        suppressingMinimap: false,
        
        cacheHits: 0,
        cacheMisses: 0,
        
        game: null,
        lastGameScan: 0
    };

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function getGame(force = false) {
        const now = performance.now();

        if (!force && state.game?.player && now - state.lastGameScan < 500) {
            return state.game;
        }

        state.lastGameScan = now;

        try {
            const react = document.querySelector('#react');
            if (!react) return state.game?.player ? state.game : null;

            for (const root of Object.values(react)) {
                const game = root?.updateQueue?.baseState?.element?.props?.game;
                if (game?.player) {
                    state.game = game;
                    return game;
                }
            }
        } catch (_) {}

        return state.game?.player ? state.game : null;
    }

    function getSettings() {
        try {
            const obj = window.miniblox || state.game;
            
            if (obj) {
                let target = obj;
                for (let i = 0; i < 5; i++) {
                    if (target?.minimapZoom !== undefined) {
                        return target;
                    }
                    target = Object.getPrototypeOf(target);
                }
            }
        } catch (_) {}
        return null;
    }

    function isInGame() {
        const game = getGame();
        if (!game) return false;
        try {
            if (typeof game.inGame === 'function') return game.inGame();
            return !!game.player?.inventory;
        } catch (_) {
            return false;
        }
    }

    function recalcRegion() {
        if (!state.canvasHud) return;

        const w = state.canvasHud.width;
        const h = state.canvasHud.height;
        const guiScale = typeof TH === 'function' ? TH() : 1;

        const size = CONFIG.minimapSize * (guiScale || 1);

        state.minimapW = size;
        state.minimapH = size;
        state.minimapX = w - size - CONFIG.minimapMarginRight * (guiScale || 1);
        state.minimapY = CONFIG.minimapMarginTop * (guiScale || 1);
    }

    function ensureCacheCanvas() {
        if (state.cacheCanvas) return;

        state.cacheCanvas = document.createElement('canvas');
        state.cacheCanvas.width = state.minimapW || CONFIG.minimapSize;
        state.cacheCanvas.height = state.minimapH || CONFIG.minimapSize;
        state.cacheCtx = state.cacheCanvas.getContext('2d');
    }

    function invalidateCache(reason) {
        state.cacheValid = false;
        state.cacheFrameCount = 0;
        state.lastPlayerX = null;
        state.lastPlayerY = null;
        state.lastPlayerZ = null;
        state.lastPlayerYaw = null;
    }

    function isCacheValid(game) {
        const player = game?.player;
        if (!player?.pos) return false;

        const px = Number(player.pos.x) || 0;
        const py = Number(player.pos.y) || 0;
        const pz = Number(player.pos.z) || 0;
        const pyaw = Number(player.yaw) || 0;

        if (state.lastPlayerX === null) {
            state.lastPlayerX = px;
            state.lastPlayerY = py;
            state.lastPlayerZ = pz;
            state.lastPlayerYaw = pyaw;
            return false;
        }

        const dx = Math.abs(px - state.lastPlayerX);
        const dy = Math.abs(py - state.lastPlayerY);
        const dz = Math.abs(pz - state.lastPlayerZ);
        const dyaw = Math.abs(pyaw - state.lastPlayerYaw);

        if (dx > CONFIG.moveThreshold ||
            dy > CONFIG.moveThreshold ||
            dz > CONFIG.moveThreshold ||
            dyaw > CONFIG.yawThreshold) {
            state.lastPlayerX = px;
            state.lastPlayerY = py;
            state.lastPlayerZ = pz;
            state.lastPlayerYaw = pyaw;
            return false;
        }

        if (state.cacheFrameCount >= CONFIG.maxCacheFrames) {
            state.cacheFrameCount = 0;
            return false;
        }

        return true;
    }

    function captureMinimap() {
        if (!state.ctx || !state.cacheCtx) return;

        try {
            state.cacheCtx.clearRect(0, 0, state.cacheCanvas.width, state.cacheCanvas.height);
            state.cacheCtx.drawImage(
                state.canvasHud,
                state.minimapX, state.minimapY,
                state.minimapW, state.minimapH,
                0, 0,
                state.cacheCanvas.width, state.cacheCanvas.height
            );
            state.cacheValid = true;
            state.cacheFrameCount = 0;
        } catch (_) {}
    }

    function restoreMinimap() {
        if (!state.ctx || !state.cacheCanvas) return;

        try {
            state.ctx.drawImage(
                state.cacheCanvas,
                0, 0,
                state.cacheCanvas.width, state.cacheCanvas.height,
                state.minimapX, state.minimapY,
                state.minimapW, state.minimapH
            );
        } catch (_) {}
    }

    function installHook() {
        if (state.hooked || !state.ctx) return;

        state.originalFillRect = state.ctx.fillRect;
        state.originalClearRect = state.ctx.clearRect;

        const ctx = state.ctx;

        ctx.fillRect = function (x, y, w, h) {
            if (state.enabled && state.cacheValid && state.suppressingMinimap) {
                
                if (
                    x >= state.minimapX - 2 &&
                    y >= state.minimapY - 2 &&
                    x + w <= state.minimapX + state.minimapW + 2 &&
                    y + h <= state.minimapY + state.minimapH + 2
                ) {
                    
                    return;
                }
            }
            return state.originalFillRect.apply(this, arguments);
        };

        ctx.clearRect = function (x, y, w, h) {
            const result = state.originalClearRect.apply(this, arguments);

            if (state.enabled && state.cacheValid &&
                w >= state.canvasHud.width * 0.9 &&
                h >= state.canvasHud.height * 0.9) {
                restoreMinimap();
            }

            return result;
        };

        state.hooked = true;
        console.log(`${TAG} ✓ Canvas hooks installed.`);
    }

    function uninstallHook() {
        if (!state.hooked || !state.ctx) return;

        try {
            if (state.originalFillRect) {
                state.ctx.fillRect = state.originalFillRect;
            }
            if (state.originalClearRect) {
                state.ctx.clearRect = state.originalClearRect;
            }
        } catch (_) {}

        state.hooked = false;
        state.originalFillRect = null;
        state.originalClearRect = null;
    }

    function loop() {
        if (!state.enabled) {
            requestAnimationFrame(loop);
            return;
        }

        const game = getGame();

        if (!isInGame()) {
            state.suppressingMinimap = false;
            requestAnimationFrame(loop);
            return;
        }

        const valid = isCacheValid(game);

        if (valid) {
            
            state.suppressingMinimap = true;
            state.cacheFrameCount++;
            state.cacheHits++;
        } else {
            
            state.suppressingMinimap = false;

            requestAnimationFrame(() => {
                captureMinimap();
            });
            state.cacheMisses++;
        }

        requestAnimationFrame(loop);
    }

    function setEnabled(enabled) {
        const next = !!enabled;
        if (state.enabled === next) return;

        state.enabled = next;

        if (next) {
            
            state.canvasHud = document.getElementById('canvas-hud');
            if (!state.canvasHud) {
                console.warn(`${TAG} canvas-hud not found.`);
                state.enabled = false;
                return;
            }

            state.ctx = state.canvasHud.getContext('2d');
            if (!state.ctx) {
                console.warn(`${TAG} Could not get 2D context.`);
                state.enabled = false;
                return;
            }

            recalcRegion();
            ensureCacheCanvas();
            installHook();
            invalidateCache('enable');

            console.log(`${TAG} ✓ Enabled. Region: ${Math.round(state.minimapX)},${Math.round(state.minimapY)} ${state.minimapW}x${state.minimapH}`);
        } else {
            state.suppressingMinimap = false;
            uninstallHook();
            invalidateCache('disable');
            console.log(`${TAG} Disabled.`);
        }
    }

    function init() {
        
        const stored = localStorage.getItem('miniblox_minimap_cache');
        const shouldEnable = stored !== 'false';

        if (shouldEnable) {
            
            const checkInterval = setInterval(() => {
                const canvas = document.getElementById('canvas-hud');
                if (canvas) {
                    clearInterval(checkInterval);
                    setEnabled(true);
                }
            }, 500);

            setTimeout(() => clearInterval(checkInterval), 30000);
        }
    }

    window.addEventListener('message', event => {
        if (event.data?.type === 'MINIBLOX_REFRESH_MINIMAP_CACHE') {
            invalidateCache('refresh_message');
        }
    });

    document.addEventListener('minifeather:minimap-cache-config', event => {
        let config;
        try {
            config = typeof event.detail === 'string'
                ? JSON.parse(event.detail)
                : event.detail;
        } catch (_) {
            return;
        }

        if (!config || typeof config !== 'object') return;

        if (typeof config.enabled === 'boolean') {
            localStorage.setItem('miniblox_minimap_cache', config.enabled ? 'true' : 'false');
            setEnabled(config.enabled);
        }
    });

    window.addEventListener('resize', () => {
        if (state.enabled) {
            recalcRegion();

            if (state.cacheCanvas) {
                state.cacheCanvas.width = state.minimapW;
                state.cacheCanvas.height = state.minimapH;
            }

            invalidateCache('resize');
        }
    });

    window.MF_MINIMAP_CACHE = {
        enable() {
            setEnabled(true);
            return state.enabled;
        },
        disable() {
            setEnabled(false);
            return state.enabled;
        },
        toggle() {
            setEnabled(!state.enabled);
            return state.enabled;
        },
        invalidate() {
            invalidateCache('manual');
        },
        get enabled() {
            return state.enabled;
        },
        get stats() {
            return {
                cacheHits: state.cacheHits,
                cacheMisses: state.cacheMisses,
                hitRate: state.cacheHits + state.cacheMisses > 0
                    ? (state.cacheHits / (state.cacheHits + state.cacheMisses) * 100).toFixed(1) + '%'
                    : 'N/A',
                currentFrames: state.cacheFrameCount
            };
        },
        get region() {
            return {
                x: state.minimapX,
                y: state.minimapY,
                width: state.minimapW,
                height: state.minimapH
            };
        }
    };

    console.log(`${TAG} Loaded.`);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    requestAnimationFrame(loop);
})();
