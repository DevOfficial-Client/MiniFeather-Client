
(function () {
    'use strict';
    try { window.__MF_HEADLAG_SCOPE__?.destroy?.(); } catch {}

    const TAG = 'minifeather headlag';

    // la cabeza llega tarde a donde apunta la cámara: suavizado exponencial sobre
    // headPivot con el patrón de la casa (apply → original → restore, como MF_PlayerAnims).
    // delay fijo duro se ve robótico; exponencial se siente "pesada", que es el chiste.

    const state = {
        enabled: false,
        tau: 0.11,            // constante de tiempo en segundos (0.11 = delay mínimo perceptible)
        game: null,
        lastGameScan: 0,
        wrapped: new Set(),   // headPivots con wrapper vivo
        rafId: null,
        tickStats: { local: 0, errors: 0 }
    };

    function getGame() {
        const now = performance.now();
        if (state.game?.player && now - state.lastGameScan < 1000) return state.game;
        state.lastGameScan = now;
        const local = globalThis.__MINIFEATHER_LOCAL_GAMES__;
        const localGame = local?.active ? local.game : null;
        if (localGame?.player) return (state.game = localGame);
        try {
            const react = document.querySelector('#react');
            if (react) {
                for (const root of Object.values(react)) {
                    const game = root?.updateQueue?.baseState?.element?.props?.game;
                    if (game?.player) return (state.game = game);
                }
            }
        } catch {}
        return state.game?.player ? state.game : null;
    }

    function shortestArc(from, to) {
        let delta = (to - from) % (Math.PI * 2);
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        return delta;
    }

    // solo el jugador local: la cabeza de los demás ya llega tarde vía red (20Hz)
    function isLocalMesh(mesh, game) {
        return !!game?.player && mesh === game.player.mesh;
    }

    function wrapHeadPivot(mesh, game) {
        const head = mesh.headPivot;
        if (!head || head._mfHeadLagHook) return;
        head._mfHeadLagHook = true;
        head._mfHeadLagMesh = mesh;
        const original = head.updateMatrixWorld.bind(head);
        head._mfHeadLagOrig = original;
        const lag = { yaw: null, pitch: null, last: 0 };

        const wrapper = function () {
            if (head.updateMatrixWorld !== wrapper) return original.apply(this, arguments);
            const mesh = head._mfHeadLagMesh;
            const game = state.game;
            // pose cosmética del pack EMF manda: no pelear por el mismo pivote
            if (!state.enabled || head.__mfPAPose || mesh?.__mfPASuppress || !game || !isLocalMesh(mesh, game)) {
                lag.yaw = lag.pitch = null;
                return original.apply(this, arguments);
            }
            try {
                // perspective: 0 = 1ª persona, 2 = 3ª (Emotes ya usa esta convención)
                if (game.player.perspective !== 2) {
                    lag.yaw = lag.pitch = null;
                    return original.apply(this, arguments);
                }
                const targetYaw = this.rotation.y;
                const targetPitch = this.rotation.x;
                const now = performance.now();
                const dt = lag.last ? Math.max(0.001, Math.min(0.1, (now - lag.last) / 1000)) : 0.016;
                lag.last = now;
                if (lag.yaw === null) {
                    lag.yaw = targetYaw;
                    lag.pitch = targetPitch;
                } else {
                    const k = 1 - Math.exp(-dt / state.tau);
                    lag.yaw += shortestArc(lag.yaw, targetYaw) * k;
                    lag.pitch += (targetPitch - lag.pitch) * k;
                    if (Math.abs(shortestArc(lag.yaw, targetYaw)) < 0.0006) lag.yaw = targetYaw;
                    if (Math.abs(targetPitch - lag.pitch) < 0.0006) lag.pitch = targetPitch;
                }
                const r = this.rotation;
                const px = r.x, py = r.y;
                r.x = lag.pitch;
                r.y = lag.yaw;
                try { return original.apply(this, arguments); }
                finally {
                    r.x = px;
                    r.y = py;
                }
            } catch (e) {
                lag.yaw = lag.pitch = null;
                state.tickStats.errors++;
                return original.apply(this, arguments);
            }
        };
        head.updateMatrixWorld = wrapper;
        state.wrapped.add(head);
    }

    function unwrapAll() {
        for (const head of [...state.wrapped]) {
            if (head._mfHeadLagHook) {
                head.updateMatrixWorld = head._mfHeadLagOrig;
                head._mfHeadLagHook = false;
                head._mfHeadLagOrig = undefined;
                head._mfHeadLagMesh = undefined;
            }
        }
        state.wrapped.clear();
    }

    function tick() {
        if (!state.enabled) return;
        const game = getGame();
        if (game) {
            try {
                const mesh = game.player?.mesh;
                if (mesh?.headPivot) {
                    wrapHeadPivot(mesh, game);
                    state.tickStats.local++;
                }
                // mundo/respawn cambiaron de mesh o de headPivot: soltar wrappers huérfanos
                for (const head of [...state.wrapped]) {
                    if (head._mfHeadLagMesh !== mesh || mesh.headPivot !== head) {
                        head.updateMatrixWorld = head._mfHeadLagOrig;
                        head._mfHeadLagHook = false;
                        head._mfHeadLagOrig = undefined;
                        head._mfHeadLagMesh = undefined;
                        state.wrapped.delete(head);
                    }
                }
            } catch {
                state.tickStats.errors++;
            }
        }
        state.rafId = requestAnimationFrame(tick);
    }

    function setEnabled(enabled) {
        enabled = enabled === true || enabled === 'true';
        if (enabled === state.enabled) return;
        state.enabled = enabled;
        if (enabled) {
            state.rafId = requestAnimationFrame(tick);
            console.log(TAG, 'on (tau=' + state.tau + 's)');
        } else {
            if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
            unwrapAll();
            console.log(TAG, 'off');
        }
    }

    function onHeadLagConfig(e) {
        try {
            const cfg = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
            if (cfg.enabled !== undefined) setEnabled(cfg.enabled);
            if (cfg.tau !== undefined) {
                const t = Number(cfg.tau);
                if (Number.isFinite(t) && t >= 0.02 && t <= 0.4) state.tau = t;
            }
        } catch {}
    }
    document.addEventListener('minifeather:headlag-config', onHeadLagConfig);
    window.__MF_HEADLAG_SCOPE__ = {
        destroy() {
            try { if (state.enabled) setEnabled(false); } catch {}
            if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
            document.removeEventListener('minifeather:headlag-config', onHeadLagConfig);
        }
    };
    globalThis.MF_HeadLag = {
        setEnabled,
        get enabled() { return state.enabled; },
        get tau() { return state.tau; },
        get stats() {
            return { enabled: state.enabled, tau: state.tau, wrapped: state.wrapped.size, tickStats: { ...state.tickStats } };
        }
    };
    console.log(TAG, 'script loaded');
})();
