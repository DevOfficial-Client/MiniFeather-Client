(function () {
    'use strict';

    // re-ejecución (hot-reload): desenganchar los clamps antes de nada
    try { window.__MF_ANTI_TEAR__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather antitear';

    // los "desgarros" de miniblox: el manager de post vive en el closure del
    // bundle y es inalcanzable desde game (lección de la fase 1 del deferred),
    // así que nada de perseguir objetos: los shaders culpables se apagan a
    // nivel GL capturando las locations por nombre. el propio bundle confiesa
    // las salidas de emergencia: "uVelocityScale ... 0 disables (exact
    // passthrough)" tiene early-out en el shader, el historial del fog/god
    // rays solo se mezcla si uTemporal > 0.5 && uHistoryWeight > 0.001 (el
    // weight baja en cámara rápida pero en cámara lenta igualmente mezcla
    // historial viejo = el ghosting), y el voxel GI se gatea entero con
    // "uGIEnabled // 0 = off (skip all GI work)" — su volumen es una caja
    // cámara-relativa de ~96 bloques cuya grilla de voxeles se ve como puntos
    // alineados al acercarse a los bloques (el reporte del usuario). esto no
    // toca settings ni la nube.
    const CLAMPS = {
        uVelocityScale: 0,   // motion blur → copia exacta del frame
        uHistoryWeight: 0,   // fog/god rays → sin historial, solo frame actual
        uGIEnabled: 0        // voxel GI → el shader saltea todo el trabajo GI
    };

    const state = {
        enabled: false,
        hooked: false,
        keeperTimer: 0,
        warnAt: 0,
        orig: null,
        locNames: new Map(),   // WebGLUniformLocation → nombre clampeable
        hits: {}               // nombre → cuántas escrituras fueron clampeadas
    };

    // ojo: las locations las cachea three al linkear cada programa, así que un
    // hook tardío (mundo ya cargado) no ve las uniforms hasta el próximo relink
    // (cambio de mundo, context loss). en el arranque normal el mirror corre
    // antes del engine y la captura agarrá todo desde el primer "compiling
    // shaders". three además cachea uploads escalares: con clampear el primer
    // upload el 0 se queda pegado en la gpu.

    function hookContextProtos() {
        if (state.hooked) return true;
        const proto = typeof WebGL2RenderingContext !== 'undefined' && WebGL2RenderingContext.prototype;
        if (!proto) return false;
        const origGet = proto.getUniformLocation;
        const origF = proto.uniform1f;
        const origI = proto.uniform1i;
        if (typeof origGet !== 'function' || typeof origF !== 'function') return false;
        try {
            proto.getUniformLocation = function (program, name) {
                const loc = origGet.call(this, program, name);
                if (loc && Object.prototype.hasOwnProperty.call(CLAMPS, name)) {
                    state.locNames.set(loc, name);
                }
                return loc;
            };
            const wrapUpload = (orig) => function (loc, v) {
                const name = state.locNames.get(loc);
                if (name !== undefined) {
                    const clamped = CLAMPS[name];
                    if (v !== clamped) state.hits[name] = (state.hits[name] || 0) + 1;
                    v = clamped;
                }
                return orig.call(this, loc, v);
            };
            proto.uniform1f = wrapUpload(origF);
            proto.uniform1i = wrapUpload(origI);
            state.orig = { getUniformLocation: origGet, uniform1f: origF, uniform1i: origI };
            state.hooked = true;
            return true;
        } catch (_) {
            return false;
        }
    }

    function unhookContextProtos() {
        if (!state.hooked || !state.orig) return;
        const proto = WebGL2RenderingContext.prototype;
        try {
            proto.getUniformLocation = state.orig.getUniformLocation;
            proto.uniform1f = state.orig.uniform1f;
            proto.uniform1i = state.orig.uniform1i;
        } catch (_) {}
        state.orig = null;
        state.hooked = false;
        state.locNames = new Map();
        state.hits = {};
    }

    function enable() {
        state.enabled = true;
        hookContextProtos();
        if (!state.keeperTimer) {
            state.keeperTimer = setInterval(() => {
                if (!state.enabled) return;
                // los prototipos sobreviven a cambios de mundo y contexto, así
                // que el keeper solo reporta: si el juego nunca pide nuestras
                // uniforms algo anda raro (offscreen rendering, bundle nuevo)
                if (state.hooked && !state.hits.uVelocityScale && !state.hits.uHistoryWeight && !state.hits.uGIEnabled) {
                    const t = performance.now();
                    if (t - state.warnAt > 30000) {
                        state.warnAt = t;
                        console.info(TAG, 'aún no veo las uniforms objetivo (¿offscreen rendering? ¿cambió el bundle?) — fail-open, el juego renderiza normal');
                    }
                }
            }, 3000);
        }
        console.info(TAG, 'activo — uVelocityScale→0 (passthrough) + uHistoryWeight→0 (sin historial) + uGIEnabled→0 (sin voxel GI)');
        return true;
    }

    function disable() {
        state.enabled = false;
        if (state.keeperTimer) { clearInterval(state.keeperTimer); state.keeperTimer = 0; }
        unhookContextProtos();
        return true;
    }

    function status() {
        return {
            enabled: state.enabled,
            hooked: state.hooked,
            motionBlur: !!state.hits.uVelocityScale,
            godRays: !!state.hits.uHistoryWeight,
            gi: !!state.hits.uGIEnabled,
            hits: { ...state.hits }
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
