(function () {
    'use strict';

    // re-ejecución (hot-reload): desenganchar los clamps antes de nada
    try { window.__MF_ANTI_TEAR__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather antitear';

    // los "desgarros" de miniblox: el manager de post vive en el closure del
    // bundle y es inalcanzable desde game (lección de la fase 1 del deferred),
    // así que nada de perseguir objetos: los shaders culpables se apagan a
    // nivel GL capturando las locations por nombre.
    //
    // hallazgos en vivo (log de getUniformLocation durante un re-join real):
    // - el juego JAMÁS pide "uGIEnabled" (el compilador lo elimina de los
    //   programas: el GI va horneado por variante), así que ese clamp era
    //   fantasma. lo que SÍ pide: uGITex, uGIOrigin, uGIInvExtent y
    //   uFogGIEnabled. el propio bundle confiesa el cull: el volumen GI es una
    //   caja cámara-relativa de ~96 bloques y "every fragment beyond it has all
    //   its cone samples fall outside and return vec4(0.0)" — mandar uGIOrigin
    //   al infinito apaga el GI con el cull de bordes del propio shader (los
    //   puntos en grilla al acercarse a los bloques son la grilla de voxeles
    //   magnificada, con la radiancia solar inyectada como tinte amarillo).
    // - "uVelocityScale ... 0 disables (exact passthrough)" tiene early-out
    //   literal en el shader del motion blur.
    // - uHistoryWeight NO se toca: ese historial es lo que suaviza el dither
    //   del raymarch y los god rays van intactos (pedido del usuario).
    const CLAMP_1F = {
        uVelocityScale: 0,   // motion blur → copia exacta del frame
        uFogGIEnabled: 0     // término GI del fog pass → 0
    };
    const GI_OFF_ORIGIN = [1e9, 1e9, 1e9]; // uGIOrigin → todo fragmento fuera del volumen

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
    // antes del engine y la captura agarra todo desde el primer "compiling
    // shaders". three además cachea uploads escalares: con clampear el primer
    // upload el valor queda pegado en la gpu hasta que el juego cambie el
    // valor (y ahí el clamp vuelve a aplicarse).

    function hookContextProtos() {
        if (state.hooked) return true;
        const proto = typeof WebGL2RenderingContext !== 'undefined' && WebGL2RenderingContext.prototype;
        if (!proto) return false;
        const origGet = proto.getUniformLocation;
        const orig1f = proto.uniform1f;
        const orig1i = proto.uniform1i;
        const orig3f = proto.uniform3f;
        const orig3fv = proto.uniform3fv;
        if (typeof origGet !== 'function' || typeof orig1f !== 'function') return false;
        try {
            proto.getUniformLocation = function (program, name) {
                const loc = origGet.call(this, program, name);
                if (loc && (Object.prototype.hasOwnProperty.call(CLAMP_1F, name) || name === 'uGIOrigin')) {
                    state.locNames.set(loc, name);
                }
                return loc;
            };
            const wrapScalar = (orig) => function (loc, v) {
                const name = state.locNames.get(loc);
                if (name !== undefined) {
                    const clamped = CLAMP_1F[name];
                    if (v !== clamped) state.hits[name] = (state.hits[name] || 0) + 1;
                    v = clamped;
                }
                return orig.call(this, loc, v);
            };
            proto.uniform1f = wrapScalar(orig1f);
            proto.uniform1i = wrapScalar(orig1i);
            const wrapVec3 = (orig) => function (loc, x, y, z) {
                const name = state.locNames.get(loc);
                if (name === 'uGIOrigin') {
                    // el volumen completo al infinito: el cull del shader hace el resto
                    state.hits[name] = (state.hits[name] || 0) + 1;
                    if (arguments.length > 2) return orig.call(this, loc, GI_OFF_ORIGIN[0], GI_OFF_ORIGIN[1], GI_OFF_ORIGIN[2]);
                    return orig.call(this, loc, GI_OFF_ORIGIN);
                }
                return orig.apply(this, arguments);
            };
            if (typeof orig3f === 'function') proto.uniform3f = wrapVec3(orig3f);
            if (typeof orig3fv === 'function') proto.uniform3fv = wrapVec3(orig3fv);
            state.orig = { getUniformLocation: origGet, uniform1f: orig1f, uniform1i: orig1i, uniform3f: orig3f, uniform3fv: orig3fv };
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
            if (state.orig.uniform3f) proto.uniform3f = state.orig.uniform3f;
            if (state.orig.uniform3fv) proto.uniform3fv = state.orig.uniform3fv;
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
                if (state.hooked && !state.hits.uVelocityScale && !state.hits.uGIOrigin && !state.hits.uFogGIEnabled) {
                    const t = performance.now();
                    if (t - state.warnAt > 30000) {
                        state.warnAt = t;
                        console.info(TAG, 'aún no veo las uniforms objetivo (¿offscreen rendering? ¿cambió el bundle?) — fail-open, el juego renderiza normal');
                    }
                }
            }, 3000);
        }
        console.info(TAG, 'activo — uVelocityScale→0 (passthrough) + uGIOrigin→infinito (GI apagado por cull) + uFogGIEnabled→0; fog y god rays intactos');
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
            gi: !!state.hits.uGIOrigin,
            fogGi: !!state.hits.uFogGIEnabled,
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
