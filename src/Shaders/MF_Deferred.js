(function () {
    'use strict';

    // re-ejecución (hot-reload): desenganchar el render del juego antes de nada
    try { window.__MF_DEFERRED_SCOPE__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather deferred';
    const GL_HALF_FLOAT = 5131;   // GL_HALF_FLOAT (WebGL2)
    const THREE_ACES_FILMIC = 4;  // THREE.ACESFilmicToneMapping en r158

    const state = {
        enabled: false,
        renderer: null,
        game: null,
        gameScene: null,
        originalRender: null,
        rt: null,
        rtCtor: null,
        gl: null,
        blit: null,          // { program, uniformScene, uniformTone, uniformExp, uniformSat }
        compositing: false,
        destroyed: false,
        hooked: false,
        keeperTimer: 0,
        rtCtorAt: 0,
        lastGameAt: 0,
        firstBlitDone: false,
        exposure: 1.0,
        saturation: 1.0,
        warnThrottle: 0
    };

    // ── detección ──────────────────────────────────────────────────────────
    function looksLikeRenderer(value) {
        if (!value || typeof value !== 'object') return false;
        if (value.isWebGLRenderer === true) return true;
        return typeof value.setRenderTarget === 'function' &&
            typeof value.setSize === 'function' &&
            value.domElement instanceof HTMLCanvasElement;
    }

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

    function resolveRenderer(game) {
        if (looksLikeRenderer(state.renderer)) return state.renderer;
        const direct = [
            game?.renderer, game?.gameScene?.renderer, game?.scene?.renderer,
            game?.engine?.renderer, game?.graphics?.renderer
        ];
        for (const cand of direct) {
            if (looksLikeRenderer(cand)) { state.renderer = cand; return cand; }
        }
        return null;
    }

    // El constructor WebGLRenderTarget se roba de una instancia existente del
    // juego (el shadow map del sol existe tras el primer render con sombras)
    function resolveRtCtor() {
        if (state.rtCtor) return state.rtCtor;
        // el traverse es caro: reintento con cooldown de 2 s hasta encontrar el shadow map
        const now = performance.now();
        if (now - (state.rtCtorAt || 0) < 2000) return null;
        state.rtCtorAt = now;
        let found = null;
        try {
            const scene = state.game?.gameScene?.scene || state.game?.scene?.scene;
            if (scene?.traverse) {
                scene.traverse((o) => {
                    if (found) return;
                    const map = o?.shadow?.map;
                    if (map && map.isRenderTarget === true) found = map;
                });
            }
        } catch (_) {}
        if (found && found.constructor) {
            state.rtCtor = found.constructor;
            console.info(TAG, 'WebGLRenderTarget adquirido del shadow map del juego');
            return state.rtCtor;
        }
        return null;
    }

    // ── blit GL crudo (triángulo fullscreen sin buffers, vía gl_VertexID) ──
    const BLIT_VS = `#version 300 es
        out vec2 mfUv;
        void main() {
            vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
            mfUv = p;
            gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
        }
    `;

    // ShaderMaterial SIN tonemapping/colorspace de three: este fragment emite el
    // valor final sRGB ya convertido (compensa lo que three r152+ no aplica al
    // renderizar a un render target — tonemap/colorspace solo ocurre al canvas).
    const BLIT_FS = `#version 300 es
        precision highp float;
        uniform sampler2D uScene;
        uniform float uToneMapping;   // 0 = none, 1 = ACESFilmic (estado del renderer)
        uniform float uExposure;      // 1.0 = identidad
        uniform float uSaturation;    // 1.0 = identidad
        in vec2 mfUv;
        out vec4 mfOut;

        vec3 mfACESFilmic(vec3 color) {
            const mat3 ACESInputMat = mat3(
                vec3(0.59719, 0.07600, 0.02840),
                vec3(0.35458, 0.90834, 0.13383),
                vec3(0.04823, 0.01566, 0.83777));
            const mat3 ACESOutputMat = mat3(
                vec3( 1.60475, -0.10208, -0.00327),
                vec3(-0.53108,  1.10813, -0.07276),
                vec3(-0.07367, -0.00605,  1.07602));
            color = ACESInputMat * color;
            vec3 a = color * (color + 0.0245786) - 0.000090537;
            vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
            color = a / b;
            color = ACESOutputMat * color;
            return clamp(color, 0.0, 1.0);
        }

        vec3 mfLinearToSRGB(vec3 c) {
            c = clamp(c, 0.0, 1.0);
            return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0031308)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        }

        void main() {
            vec3 col = texture(uScene, mfUv).rgb;
            col *= uExposure;
            if (uToneMapping > 0.5) col = mfACESFilmic(col);
            float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
            col = mix(vec3(lum), col, uSaturation);
            mfOut = vec4(mfLinearToSRGB(col), 1.0);
        }
    `;

    function ensureBlit() {
        if (state.blit) return true;
        const gl = state.gl || (state.gl = state.renderer?.getContext?.());
        if (!gl) return false;
        try {
            const compile = (type, src) => {
                const sh = gl.createShader(type);
                gl.shaderSource(sh, src);
                gl.compileShader(sh);
                if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                    throw new Error('blit shader: ' + gl.getShaderInfoLog(sh));
                }
                return sh;
            };
            const program = gl.createProgram();
            gl.attachShader(program, compile(gl.VERTEX_SHADER, BLIT_VS));
            gl.attachShader(program, compile(gl.FRAGMENT_SHADER, BLIT_FS));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error('blit link: ' + gl.getProgramInfoLog(program));
            }
            state.blit = {
                program,
                uniformScene: gl.getUniformLocation(program, 'uScene'),
                uniformTone: gl.getUniformLocation(program, 'uToneMapping'),
                uniformExp: gl.getUniformLocation(program, 'uExposure'),
                uniformSat: gl.getUniformLocation(program, 'uSaturation')
            };
            return true;
        } catch (err) {
            console.warn(TAG, 'blit no disponible:', err?.message || err);
            return false;
        }
    }

    function disposeBlit() {
        if (!state.blit || !state.gl) return;
        try { state.gl.deleteProgram(state.blit.program); } catch (_) {}
        state.blit = null;
    }

    // ── render target ──────────────────────────────────────────────────────
    function ensureRt(w, h) {
        const RtCtor = resolveRtCtor();
        if (!RtCtor) return false;
        if (state.rt && state.rt.width === w && state.rt.height === h) return true;
        if (state.rt) { try { state.rt.dispose(); } catch (_) {} state.rt = null; }
        try {
            state.rt = new RtCtor(w, h, { depthBuffer: true, type: GL_HALF_FLOAT });
        } catch (_) {
            try { state.rt = new RtCtor(w, h, { depthBuffer: true }); } catch (_) { return false; }
        }
        return true;
    }

    // Handle GL interno de una Texture de three (r158: properties.get(t).__webglTexture)
    function glTextureOf(renderer, texture) {
        try {
            const props = renderer.properties?.get?.(texture);
            return props?.__webglTexture || props?.texture || null;
        } catch (_) { return null; }
    }

    // ── hook del render ────────────────────────────────────────────────────
    function isGameScene(scene) {
        // re-resolver SIEMPRE: los cambios de mundo reemplazan gameScene.scene.
        // Misma cadena robusta que CustomShader: gameScene puede SER la escena
        // directamente (sin .scene) — si solo miráramos .scene, el pipeline se
        // quedaba en passthrough para siempre.
        const g = state.game;
        const gs = g?.gameScene?.scene || g?.scene?.scene || g?.gameScene || g?.scene || state.gameScene;
        return !!scene && !!gs && scene === gs;
    }

    function wrappedRender(scene, camera) {
        if (state.compositing || !state.enabled || state.destroyed) {
            return state.originalRender.call(this, scene, camera);
        }
        // refrescar el game object como mucho cada 1 s (los cambios de mundo lo reemplazan)
        const nowMs = performance.now();
        if (nowMs - (state.lastGameAt || 0) > 1000) {
            state.lastGameAt = nowMs;
            state.game = findGame() || state.game;
        }
        if (!isGameScene(scene)) {
            return state.originalRender.call(this, scene, camera);
        }
        const dom = this.domElement;
        const w = dom.width, h = dom.height;
        if (!w || !h) return state.originalRender.call(this, scene, camera);
        if (!ensureRt(w, h) || !state.rt) {
            const now = performance.now();
            if (now - state.warnThrottle > 10000) {
                state.warnThrottle = now;
                console.warn(TAG, 'sin render target disponible todavía — passthrough directo');
            }
            return state.originalRender.call(this, scene, camera);
        }

        // 1) escena del juego → RT (linear, sin tonemap: r152+ solo los aplica al canvas)
        this.setRenderTarget(state.rt);
        state.originalRender.call(this, scene, camera);

        // 2) blit fullscreen: RT → canvas (compensa tonemap/colorspace)
        state.compositing = true;
        try {
            const gl = state.gl || (state.gl = this.getContext());
            if (gl && ensureBlit()) {
                const tex = glTextureOf(this, state.rt.texture);
                if (tex) {
                    this.setRenderTarget(null);   // viewport + FB del canvas vía three
                    gl.useProgram(state.blit.program);
                    // el depth/blend del canvas está sucio del frame anterior del juego
                    gl.disable(gl.DEPTH_TEST);
                    gl.disable(gl.BLEND);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, tex);
                    gl.uniform1i(state.blit.uniformScene, 0);
                    gl.uniform1f(state.blit.uniformTone, this.toneMapping === THREE_ACES_FILMIC ? 1 : 0);
                    gl.uniform1f(state.blit.uniformExp, state.exposure);
                    gl.uniform1f(state.blit.uniformSat, state.saturation);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                    // tres cachea estado GL propio: invalidarlo tras tocar GL a mano
                    this.state?.reset?.();
                    if (!state.firstBlitDone) {
                        state.firstBlitDone = true;
                        console.info(TAG, '✔ blit activo — el pipeline deferred está en marcha ' +
                            '(con exposición/saturación 1.0 la imagen es idéntica por diseño; usa los sliders)');
                    }
                } else {
                    this.setRenderTarget(null);
                    state.originalRender.call(this, scene, camera);
                }
            } else {
                this.setRenderTarget(null);
                state.originalRender.call(this, scene, camera);
            }
        } catch (_) {
            try { this.setRenderTarget(null); state.originalRender.call(this, scene, camera); } catch (_) {}
        } finally {
            state.compositing = false;
        }
    }

    function hook() {
        if (state.hooked) return true;
        const game = findGame();
        if (!game) return false;
        const renderer = resolveRenderer(game);
        if (!renderer) return false;
        if (renderer.render?.__mfDeferredOwner) { state.hooked = true; return true; }
        state.game = game;
        state.gameScene = game.gameScene?.scene || game.scene?.scene || null;
        state.originalRender = renderer.render;
        const wrapped = function (scene, camera) { return wrappedRender.call(this, scene, camera); };
        wrapped.__mfDeferredOwner = 'mf-deferred';
        try {
            renderer.render = wrapped;
            state.hooked = true;
            console.info(TAG, 'renderer.render enganchado');
            return true;
        } catch (_) { return false; }
    }

    function unhook() {
        if (!state.hooked || !state.renderer) return;
        try {
            if (state.renderer.render?.__mfDeferredOwner === 'mf-deferred') {
                state.renderer.render = state.originalRender;
            }
        } catch (_) {}
        state.hooked = false;
    }

    // ── API pública ────────────────────────────────────────────────────────
    function loadPrefs() {
        try {
            state.exposure = parseFloat(localStorage.getItem('mf_deferred_exposure'));
            if (!Number.isFinite(state.exposure)) state.exposure = 1.0;
            state.saturation = parseFloat(localStorage.getItem('mf_deferred_saturation'));
            if (!Number.isFinite(state.saturation)) state.saturation = 1.0;
        } catch (_) {
            state.exposure = 1.0; state.saturation = 1.0;
        }
    }

    function enable() {
        state.enabled = true;
        loadPrefs();
        if (!hook()) {
            console.info(TAG, 'esperando al renderer del juego...');
        }
        // keeper: si el juego recrea el renderer (o el hook se pierde), re-engancha
        if (!state.keeperTimer) {
            state.keeperTimer = setInterval(() => {
                if (state.destroyed || !state.enabled) return;
                const r = state.renderer;
                if (!r || !looksLikeRenderer(r) || r.render?.__mfDeferredOwner !== 'mf-deferred') {
                    state.renderer = null;
                    state.hooked = false;
                    hook();
                }
            }, 3000);
        }
        return true;
    }

    function disable() {
        state.enabled = false;
        unhook();
        if (state.keeperTimer) { clearInterval(state.keeperTimer); state.keeperTimer = 0; }
    }

    function setGrade(exposure, saturation) {
        if (Number.isFinite(Number(exposure))) state.exposure = Number(exposure);
        if (Number.isFinite(Number(saturation))) state.saturation = Number(saturation);
        try {
            localStorage.setItem('mf_deferred_exposure', String(state.exposure));
            localStorage.setItem('mf_deferred_saturation', String(state.saturation));
        } catch (_) {}
    }

    function status() {
        return {
            enabled: state.enabled,
            hooked: state.hooked,
            hasRt: !!state.rt,
            rtCtor: !!state.rtCtor,
            blit: !!state.blit,
            renderer: !!state.renderer,
            exposure: state.exposure,
            saturation: state.saturation
        };
    }

    function destroy() {
        state.destroyed = true;
        disable();
        disposeBlit();
        if (state.rt) { try { state.rt.dispose(); } catch (_) {} state.rt = null; }
        try { delete window.MF_Deferred; } catch (_) {}
        try { delete window.__MF_DEFERRED_SCOPE__; } catch (_) {}
    }

    document.addEventListener('minifeather:deferred-config', (ev) => {
        try {
            const cfg = JSON.parse(ev.detail || '{}');
            if (cfg.enabled === true) enable();
            else if (cfg.enabled === false) disable();
            if (cfg.exposure !== undefined || cfg.saturation !== undefined) {
                setGrade(cfg.exposure, cfg.saturation);
            }
        } catch (_) {}
    });

    // re-ejecución: destroy() borra los globals; para el guard de cabecera exponerlos de nuevo
    window.MF_Deferred = { enable, disable, setGrade, status, destroy };
    window.__MF_DEFERRED_SCOPE__ = { destroy };
    console.info(TAG, 'módulo cargado (inactivo hasta minifeather:deferred-config {enabled:true})');
})();
