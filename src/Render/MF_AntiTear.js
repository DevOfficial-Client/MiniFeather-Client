(function () {
    'use strict';

    // re-ejecución (hot-reload): desenganchar los clamps antes de nada
    try { window.__MF_ANTI_TEAR__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather antitear';

    // el juego acumula el frame anterior para motion blur / god rays high sin
    // chequear si el píxel del historial todavía representa lo mismo
    // (disocclusion), y encima le mete jitter por píxel (IGN) esperando que un
    // denoiser temporal que NO existe lo limpie. resultado: bandas diagonales
    // translúcidas + estática punteada que la ia de turno se tragó en vanilla
    // con la misma gpu del usuario. esto no toca settings ni la nube de la
    // cuenta: clava los passes en runtime y listo.
    const MEDIUM_GOD_RAY_TIER = { steps: 12, occlusionSteps: 4, resolutionScale: 0.5, temporal: false, maxDistance: 200 };

    const state = {
        enabled: false,
        game: null,
        keeperTimer: 0,
        warnAt: 0,
        restore: [],
        motionBlurPass: null,
        fogPass: null
    };

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

    // los passes viven en el manager de post del juego (recreado por mundo).
    // bfs acotado desde el game object: los shaders no están colgando de la
    // escena three, así que corto las ramas gordas y pongo techo de nodos.
    const SKIP_KEYS = new Set(['parent', 'children', 'world', 'scene', 'player', 'players', 'entities', 'domElement', 'chat']);
    const MAX_NODES = 8000;
    const MAX_DEPTH = 5;

    function isMotionBlurPass(o) {
        return Object.prototype.hasOwnProperty.call(o, '_prevViewProj') &&
            Object.prototype.hasOwnProperty.call(o, '_blur') &&
            Object.prototype.hasOwnProperty.call(o, '_target');
    }

    function isFogPass(o) {
        return Object.prototype.hasOwnProperty.call(o, '_godRayTier') &&
            Object.prototype.hasOwnProperty.call(o, '_raymarch');
    }

    function findPasses(game) {
        const out = {};
        if (!game) return out;
        const seen = new Set();
        let budget = MAX_NODES;
        const queue = [[game, 0]];
        seen.add(game);
        while (queue.length && budget > 0 && !(out.motionBlur && out.fog)) {
            const [node, depth] = queue.shift();
            budget--;
            let props;
            try { props = Object.getOwnPropertyNames(node); } catch (_) { continue; }
            for (const k of props) {
                if (SKIP_KEYS.has(k) || k.startsWith('__react') || k.startsWith('__MF')) continue;
                let v;
                try { v = node[k]; } catch (_) { continue; }
                if (!v || typeof v !== 'object') continue;
                if (seen.has(v)) continue;
                seen.add(v);
                if (!out.motionBlur && isMotionBlurPass(v)) out.motionBlur = v;
                if (!out.fog && isFogPass(v)) out.fog = v;
                if (out.motionBlur && out.fog) return out;
                if (depth < MAX_DEPTH && budget > 0) queue.push([v, depth + 1]);
            }
        }
        return out;
    }

    function clampMotionBlur(pass) {
        const hadOwn = Object.prototype.hasOwnProperty.call(pass, 'enabled');
        const prev = hadOwn ? pass.enabled : undefined;
        const restore = () => {
            try { delete pass.enabled; } catch (_) {}
            if (hadOwn) { try { pass.enabled = prev; } catch (_) {} }
        };
        try {
            Object.defineProperty(pass, 'enabled', {
                configurable: true,
                enumerable: true,
                get() { return false; },
                set() {} // el frame escribe enabled cada frame y el composer lo pregunta; ambos pierden
            });
            state.restore.push(restore);
            state.motionBlurPass = pass;
            return true;
        } catch (_) { return false; }
    }

    function clampGodRays(pass) {
        let current = null;
        try { current = pass._godRayTier; } catch (_) {}
        const restore = () => {
            try { delete pass._godRayTier; } catch (_) {}
            try { pass._godRayTier = current; } catch (_) {}
        };
        try {
            Object.defineProperty(pass, '_godRayTier', {
                configurable: true,
                enumerable: true,
                get() { return current; },
                set(v) {
                    // high es el tier temporal a media resolución; medium hace lo
                    // mismo sin historial. off/null pasa de largo.
                    current = (v && v.temporal === true) ? MEDIUM_GOD_RAY_TIER : v;
                }
            });
            state.restore.push(restore);
            state.fogPass = pass;
            return true;
        } catch (_) { return false; }
    }

    function unhookAll() {
        for (const fn of state.restore) { try { fn(); } catch (_) {} }
        state.restore = [];
        state.motionBlurPass = null;
        state.fogPass = null;
    }

    function hookPasses() {
        // sin throttle: el interval de 3s ya es el límite de abuso
        state.game = findGame() || state.game;
        if (!state.game) return status();
        const passes = findPasses(state.game);
        if (!passes.motionBlur && !passes.fog) {
            const t = performance.now();
            if (t - state.warnAt > 30000) {
                state.warnAt = t;
                console.info(TAG, 'manager de post no encontrado todavía (offscreen rendering? otro mundo?) — reintento');
            }
            return status();
        }
        if (passes.motionBlur && passes.motionBlur !== state.motionBlurPass) clampMotionBlur(passes.motionBlur);
        if (passes.fog && passes.fog !== state.fogPass) clampGodRays(passes.fog);
        return status();
    }

    function loadPrefs() {
        // sin prefs: el default del cliente es ON y el panel manda el evento
    }

    function enable() {
        state.enabled = true;
        loadPrefs();
        hookPasses();
        if (!state.keeperTimer) {
            state.keeperTimer = setInterval(() => {
                if (!state.enabled) return;
                // re-escaneo siempre: el juego recrea el manager por cambio de
                // mundo y los passes viejos quedan clampeados pero huérfanos
                hookPasses();
            }, 3000);
        }
        console.info(TAG, 'activo — caza de passes en curso (motion blur + god rays temporal)');
        return true;
    }

    function disable() {
        state.enabled = false;
        if (state.keeperTimer) { clearInterval(state.keeperTimer); state.keeperTimer = 0; }
        unhookAll();
        // reset completo: el game object de un mundo viejo no sirve para el próximo
        state.game = null;
        return true;
    }

    function status() {
        return {
            enabled: state.enabled,
            motionBlur: !!state.motionBlurPass,
            godRays: !!state.fogPass,
            game: !!state.game
        };
    }

    function destroy() {
        disable();
        try { delete window.MF_AntiTear; } catch (_) {}
        try { delete window.__MF_ANTI_TEAR__; } catch (_) {}
    }

    document.addEventListener('minifeather:antitear-config', (ev) => {
        try {
            const cfg = JSON.parse(ev.detail || '{}');
            if (cfg.enabled === true) enable();
            else if (cfg.enabled === false) disable();
        } catch (_) {}
    });

    window.MF_AntiTear = { enable, disable, status, destroy };
    window.__MF_ANTI_TEAR__ = { destroy };
    console.info(TAG, 'módulo cargado (inactivo hasta minifeather:antitear-config {enabled:true})');
})();
