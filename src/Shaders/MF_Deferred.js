(function () {
    'use strict';

    // re-ejecución (hot-reload): desenganchar el render del juego antes de nada
    try { window.__MF_DEFERRED_SCOPE__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather deferred';
    const GL_HALF_FLOAT = 5131;   // GL_HALF_FLOAT (WebGL2)

    // ─────────────────────────────────────────────────────────────────────
    // FASE 2 — port fiel de la cadena post de IterationT 3.2.0 (Tahnass):
    //   composite9-13 (bloom: downsample 13-tap + gaussiana axial) →
    //   PROGRAM_FINAL_0 (MergeBloom → Vignette → exposición auto → AgX →
    //   saturación). Los valores y matrices están copiados 1:1 de
    //   Lib/Programs/Final.glsl, Lib/IndividualFounctions/Bloom.glsl y
    //   Lib/Settings.glsl (BLOOM_AMOUNT 0.13, AGX_EV 13.0, pre-scale 2.3,
    //   AE_CURVE 0.7, AE_OFFSET 0, VIGNETTE_FALLOFF 0.4, ROUNDNESS 0.0).
    // Desviaciones documentadas (todo lo demás es verbatim):
    //   * Sin CurveToLinear (c⁴): el pack guarda el HDR con curva c^0.25;
    //     nuestro RT ya es lineal HalfFloat, así que la curva es identidad
    //     y las conversiones se omiten (misma matemática, menos ops).
    //   * El AgX del pack no trae encode de display (su ACES sí hace
    //     LinearToGamma dentro del operador); cerramos con sRGB para el
    //     canvas, igual que el camino ACES del pack.
    //   * MergeBloom: los términos de lluvia/VOG/underwater necesitan
    //     datos del juego que no tenemos; bloomAmount = BLOOM_AMOUNT seco.
    //   * La exposición auto usa SU fórmula (8.5·ae^-0.7 con ae = media·40)
    //     sobre nuestra escala de escena, con clamp de seguridad.
    // Permiso de Tahnass pendiente antes de redistribuir el GLSL portado.
    // ─────────────────────────────────────────────────────────────────────

    const state = {
        enabled: false,
        renderer: null,
        game: null,
        gameScene: null,
        originalRender: null,
        rt: null,               // escena full-res (HalfFloat + depth)
        rtBloomA: null, rtBloomB: null,   // half-res ping-pong
        rtAeA: null, rtAeB: null,         // 1x1 exposición temporal
        aeFlip: false,
        gl: null,
        prog: null,             // { down, blur, ae, final } + uniforms
        compositing: false,
        destroyed: false,
        hooked: false,
        keeperTimer: 0,
        rtCtor: null,
        rtCtorAt: 0,
        lastGameAt: 0,
        firstPassDone: false,
        exposure: 1.0,          // offset EV en stops (1.0 = neutro)
        saturation: 1.0,        // SATURATION del pack
        bloom: 0.13,            // BLOOM_AMOUNT del pack
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

    // ── infra GL cruda (triángulo fullscreen por gl_VertexID, sin buffers) ─
    const VS = `#version 300 es
        out vec2 mfUv;
        void main() {
            vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
            mfUv = p;
            gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
        }
    `;

    // BloomDownSample de Lib/IndividualFounctions/Bloom.glsl verbatim
    // (13 taps, pesos .125/.5/.25, sum *0.25) — sin conversiones de curva.
    const BLOOM_DOWN_FS = `#version 300 es
        precision highp float;
        uniform sampler2D uTex;
        uniform vec2 uTexel;      // 1/resolución de la fuente (full res)
        in vec2 mfUv;
        out vec4 mfOut;
        void main() {
            vec2 c = mfUv;
            vec3 blur = texture(uTex, c).rgb * 0.125;
            blur += texture(uTex, c + vec2( uTexel.x,  uTexel.y)).rgb * 0.5;
            blur += texture(uTex, c + vec2( uTexel.x, -uTexel.y)).rgb * 0.5;
            blur += texture(uTex, c + vec2(-uTexel.x,  uTexel.y)).rgb * 0.5;
            blur += texture(uTex, c + vec2(-uTexel.x, -uTexel.y)).rgb * 0.5;
            blur += texture(uTex, c + 2.0 * vec2( uTexel.x, 0.0)).rgb * 0.25;
            blur += texture(uTex, c + 2.0 * vec2( 0.0,  uTexel.y)).rgb * 0.25;
            blur += texture(uTex, c + 2.0 * vec2(-uTexel.x, 0.0)).rgb * 0.25;
            blur += texture(uTex, c + 2.0 * vec2( 0.0, -uTexel.y)).rgb * 0.25;
            blur += texture(uTex, c + 2.0 * vec2( uTexel.x,  uTexel.y)).rgb * 0.125;
            blur += texture(uTex, c + 2.0 * vec2( uTexel.x, -uTexel.y)).rgb * 0.125;
            blur += texture(uTex, c + 2.0 * vec2(-uTexel.x,  uTexel.y)).rgb * 0.125;
            blur += texture(uTex, c + 2.0 * vec2(-uTexel.x, -uTexel.y)).rgb * 0.125;
            mfOut = vec4(blur * 0.25, 1.0);
        }
    `;

    // AxialGaussianBlur de Bloom.glsl verbatim (exp2(-i²·alpha·5.77)),
    // steps/alpha/eje como uniforms; clamp de borde incluido. El step del
    // pack es 2px (axis / coordScale * pixelSize * i * 2).
    const BLUR_FS = `#version 300 es
        precision highp float;
        uniform sampler2D uTex;
        uniform vec2 uAxis;
        uniform vec2 uTexel;      // 1/resolución del buffer de bloom (half)
        uniform float uSteps;
        uniform float uAlpha;
        in vec2 mfUv;
        out vec4 mfOut;
        void main() {
            vec3 blur = vec3(0.0);
            float weights = 0.0;
            for (float i = -uSteps; i <= uSteps; i++) {
                float w = exp2(-i * i * uAlpha * 5.77);
                vec2 sc = clamp(mfUv + uAxis * uTexel * i * 2.0, vec2(0.0), vec2(1.0));
                blur += texture(uTex, sc).rgb * w;
                weights += w;
            }
            mfOut = vec4(blur / weights, 1.0);
        }
    `;

    // Exposición auto: media de luminancia lineal (grid 16x16) mezclada
    // temporalmente con el frame anterior (SMOOTH_EXPOSURE, EXPOSURE_TIME 1s).
    const AE_FS = `#version 300 es
        precision highp float;
        uniform sampler2D uTex;
        uniform sampler2D uPrev;
        uniform float uMix;       // 1 - exp(-dt / 1.0)
        in vec2 mfUv;
        out vec4 mfOut;
        float lum(vec3 c) { return dot(c, vec3(0.2125, 0.7154, 0.0721)); }
        void main() {
            float sum = 0.0;
            for (int y = 0; y < 16; y++) {
                for (int x = 0; x < 16; x++) {
                    vec2 uv = (vec2(float(x), float(y)) + 0.5) / 16.0;
                    sum += lum(texture(uTex, uv).rgb);
                }
            }
            float avg = sum / 256.0;
            float prev = texture(uPrev, vec2(0.5)).a;
            mfOut = vec4(0.0, 0.0, 0.0, mix(prev, avg, uMix));
        }
    `;

    // PROGRAM_FINAL_0 de Lib/Programs/Final.glsl verbatim:
    // MergeBloom → Vignette → exposición → AgX → SATURATION → encode sRGB.
    const FINAL_FS = `#version 300 es
        precision highp float;
        uniform sampler2D uScene;   // colortex1 (HDR lineal)
        uniform sampler2D uBloom;   // colortex5
        uniform sampler2D uAe;      // colortex2 (media en .a)
        uniform float uBloomAmount; // BLOOM_AMOUNT 0.13
        uniform float uEvOffset;    // offset manual en stops
        uniform float uSaturation;  // SATURATION 1.0
        uniform float uVignette;    // 1 = on (default del pack)
        in vec2 mfUv;
        out vec4 mfOut;

        // Lib/Utilities.glsl
        float Luminance(vec3 c) { return dot(c, vec3(0.2125, 0.7154, 0.0721)); }

        // Final.glsl Vignette() verbatim
        float Vignette(vec2 coord, const float falloff, const float roundness) {
            vec2 aCoord = coord * 2.0 - 1.0;
            aCoord.x *= mix(1.0, 1.7777779, roundness);
            float rf = dot(aCoord, aCoord) * falloff * falloff + 1.0;
            return 1.0 / (rf * rf);
        }

        // GetExposureValue() — rama SMOOTH_EXPOSURE con nuestra escala:
        // ae = media * (5120/128); ae = pow(ae, -AE_CURVE); exp = 8.5 * ae
        float GetExposureValue() {
            float ae = texture(uAe, vec2(0.5)).a * 40.0;
            ae = pow(max(ae, 1e-6), -0.7);
            ae *= exp2(uEvOffset);
            return clamp(8.5 * ae, 0.02, 60.0);
        }

        // MergeBloom() — términos secos: bloomAmount = BLOOM_AMOUNT
        vec3 MergeBloom(vec3 color) {
            vec3 bloom = texture(uBloom, mfUv).rgb;
            return mix(color, bloom, clamp(uBloomAmount, 0.0, 1.0));
        }

        // RRTAndODTFit/AgxDefaultContrastApprox/AgX verbatim (Final.glsl)
        vec3 AgxDefaultContrastApprox(vec3 x) {
            return (((((15.5 * x - 40.14) * x + 31.96) * x - 6.868) * x + 0.4298) * x + 0.1191) * x - 0.00232;
        }
        vec3 AgX(vec3 color) {
            color *= 2.3;
            color *= mat3(0.842479062253094, 0.0784335999999992, 0.0792237451477643,
                          0.0423282422610123, 0.878468636469772, 0.0791661274605434,
                          0.0423756549057051, 0.0784336, 0.879142973793104);
            const float hev = 13.0 * 0.5;   // AGX_EV 13.0
            const float middle_grey = 0.18;
            color = clamp(log2(color / middle_grey), -hev, hev);
            color = (color + hev) / 13.0;
            color = AgxDefaultContrastApprox(color);
            color *= mat3(1.19687900512017, -0.0980208811401368, -0.0990297440797205,
                          -0.0528968517574562, 1.15190312990417, -0.0989611768448433,
                          -0.0529716355144438, -0.0980434501171241, 1.15107367264116);
            return color;
        }

        vec3 mfLinearToSRGB(vec3 c) {
            c = clamp(c, 0.0, 1.0);
            return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0031308)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        }

        void main() {
            vec3 color = texture(uScene, mfUv).rgb;
            color = MergeBloom(color);
            if (uVignette > 0.5) color *= Vignette(mfUv, 0.4, 0.0);  // FALLOFF/ROUNDNESS default
            color *= GetExposureValue();
            color = AgX(color);
            // SATURATION del pack (el camino ADVANCED_COLOR va comentado en el pack)
            color = mix(color, vec3(Luminance(color)), vec3(1.0 - uSaturation));
            // encode de display (ver nota de cabecera)
            mfOut = vec4(mfLinearToSRGB(clamp(color, 0.0, 1.0)), 1.0);
        }
    `;

    function compile(gl, type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            const err = new Error(gl.getShaderInfoLog(sh) || 'compile error');
            try { gl.deleteShader(sh); } catch (_) {}
            throw err;
        }
        return sh;
    }

    function makeProgram(gl, fsSrc) {
        const program = gl.createProgram();
        const vs = compile(gl, gl.VERTEX_SHADER, VS);
        const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        try { gl.detachShader(program, vs); gl.deleteShader(vs); } catch (_) {}
        try { gl.detachShader(program, fs); gl.deleteShader(fs); } catch (_) {}
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const err = new Error(gl.getProgramInfoLog(program) || 'link error');
            try { gl.deleteProgram(program); } catch (_) {}
            throw err;
        }
        return program;
    }

    function uniforms(gl, program, names) {
        const out = {};
        for (const n of names) out[n] = gl.getUniformLocation(program, n);
        return out;
    }

    function ensurePasses() {
        if (state.prog) return true;
        const gl = state.gl || (state.gl = state.renderer?.getContext?.());
        if (!gl) return false;
        try {
            const down = makeProgram(gl, BLOOM_DOWN_FS);
            const blur = makeProgram(gl, BLUR_FS);
            const ae = makeProgram(gl, AE_FS);
            const final = makeProgram(gl, FINAL_FS);
            state.prog = {
                down: { p: down, u: uniforms(gl, down, ['uTex', 'uTexel']) },
                blur: { p: blur, u: uniforms(gl, blur, ['uTex', 'uAxis', 'uTexel', 'uSteps', 'uAlpha']) },
                ae: { p: ae, u: uniforms(gl, ae, ['uTex', 'uPrev', 'uMix']) },
                final: { p: final, u: uniforms(gl, final, ['uScene', 'uBloom', 'uAe', 'uBloomAmount', 'uEvOffset', 'uSaturation', 'uVignette']) }
            };
            return true;
        } catch (err) {
            console.warn(TAG, 'passes no disponibles:', err?.message || err);
            disposePasses();
            return false;
        }
    }

    function disposePasses() {
        const gl = state.gl;
        if (!gl || !state.prog) { state.prog = null; return; }
        try { for (const k of Object.keys(state.prog)) gl.deleteProgram(state.prog[k].p); } catch (_) {}
        state.prog = null;
    }

    // Handle GL interno de una Texture de three (r158: properties.get(t).__webglTexture)
    function glTextureOf(renderer, texture) {
        try {
            const props = renderer.properties?.get?.(texture);
            return props?.__webglTexture || props?.texture || null;
        } catch (_) { return null; }
    }

    // ── render targets ─────────────────────────────────────────────────────
    function ensureRt(w, h) {
        const RtCtor = resolveRtCtor();
        if (!RtCtor) return false;
        const need = (rt, tw, th, depth) => !rt || rt.width !== tw || rt.height !== th;
        const make = (tw, th, depth) => {
            try {
                return new RtCtor(tw, th, { depthBuffer: depth, type: GL_HALF_FLOAT });
            } catch (_) {
                try { return new RtCtor(tw, th, { depthBuffer: depth }); } catch (_) { return null; }
            }
        };
        if (need(state.rt, w, h, true)) {
            try { state.rt?.dispose?.(); } catch (_) {}
            state.rt = make(w, h, true);
            if (!state.rt) return false;
        }
        const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
        if (need(state.rtBloomA, bw, bh, false)) {
            try { state.rtBloomA?.dispose?.(); state.rtBloomB?.dispose?.(); } catch (_) {}
            state.rtBloomA = make(bw, bh, false);
            state.rtBloomB = make(bw, bh, false);
        }
        if (!state.rtAeA) {
            state.rtAeA = make(1, 1, false);
            state.rtAeB = make(1, 1, false);
        }
        return !!(state.rt && state.rtBloomA && state.rtBloomB && state.rtAeA && state.rtAeB);
    }

    function disposeRts() {
        for (const key of ['rt', 'rtBloomA', 'rtBloomB', 'rtAeA', 'rtAeB']) {
            try { state[key]?.dispose?.(); } catch (_) {}
            state[key] = null;
        }
    }

    // ── hook del render ────────────────────────────────────────────────────
    function isGameScene(scene) {
        // re-resolver SIEMPRE: los cambios de mundo reemplazan gameScene.scene.
        // gameScene puede SER la escena directamente (sin .scene).
        const g = state.game;
        const gs = g?.gameScene?.scene || g?.scene?.scene || g?.gameScene || g?.scene || state.gameScene;
        return !!scene && !!gs && scene === gs;
    }

    function bindTex(gl, unit, tex, loc) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(loc, unit);
    }

    function wrappedRender(scene, camera) {
        if (state.compositing || !state.enabled || state.destroyed) {
            return state.originalRender.call(this, scene, camera);
        }
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
        if (!ensureRt(w, h) || !ensurePasses() || !state.rt) {
            const now = performance.now();
            if (now - state.warnThrottle > 10000) {
                state.warnThrottle = now;
                console.warn(TAG, 'sin RT/passes todavía — passthrough directo');
            }
            return state.originalRender.call(this, scene, camera);
        }

        this.setRenderTarget(state.rt);
        state.originalRender.call(this, scene, camera);

        state.compositing = true;
        try {
            const gl = state.gl || (state.gl = this.getContext());
            const P = state.prog;
            const texScene = glTextureOf(this, state.rt.texture);
            if (!gl || !P || !texScene) throw new Error('gl/texture no listos');

            const bw = state.rtBloomA.width, bh = state.rtBloomA.height;
            const texBloomA = glTextureOf(this, state.rtBloomA.texture);
            const texBloomB = glTextureOf(this, state.rtBloomB.texture);
            const texAeA = glTextureOf(this, state.rtAeA.texture);
            const texAeB = glTextureOf(this, state.rtAeB.texture);

            gl.disable(gl.DEPTH_TEST);
            gl.disable(gl.BLEND);

            // 1) bloom downsample: escena full-res → half (13 taps del pack)
            this.setRenderTarget(state.rtBloomA);
            gl.viewport(0, 0, bw, bh);
            gl.useProgram(P.down.p);
            bindTex(gl, 0, texScene, P.down.u.uTex);
            gl.uniform2f(P.down.u.uTexel, 1 / w, 1 / h);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // 2) gaussiana axial H+V sobre half-res (ping-pong)
            this.setRenderTarget(state.rtBloomB);
            gl.viewport(0, 0, bw, bh);
            gl.useProgram(P.blur.p);
            bindTex(gl, 0, texBloomA, P.blur.u.uTex);
            gl.uniform2f(P.blur.u.uAxis, 1, 0);
            gl.uniform2f(P.blur.u.uTexel, 1 / bw, 1 / bh);
            gl.uniform1f(P.blur.u.uSteps, 6);
            gl.uniform1f(P.blur.u.uAlpha, 0.1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            this.setRenderTarget(state.rtBloomA);
            gl.viewport(0, 0, bw, bh);
            gl.useProgram(P.blur.p);
            bindTex(gl, 0, texBloomB, P.blur.u.uTex);
            gl.uniform2f(P.blur.u.uAxis, 0, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // 3) exposición auto: media temporal 1x1 (ping-pong, dt real)
            const last = state.lastAeAt || nowMs;
            const dt = Math.min(0.2, Math.max(0.001, (nowMs - last) / 1000));
            state.lastAeAt = nowMs;
            const mixNow = 1 - Math.exp(-dt / 1.0);   // EXPOSURE_TIME 1.0
            const dst = state.aeFlip ? state.rtAeA : state.rtAeB;
            const src = state.aeFlip ? state.rtAeB : state.rtAeA;
            state.aeFlip = !state.aeFlip;
            const texSrc = glTextureOf(this, src.texture);
            this.setRenderTarget(dst);
            gl.viewport(0, 0, 1, 1);
            gl.useProgram(P.ae.p);
            bindTex(gl, 0, texScene, P.ae.u.uTex);
            bindTex(gl, 1, texSrc, P.ae.u.uPrev);
            gl.uniform1f(P.ae.u.uMix, mixNow);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // 4) FINAL del pack al canvas: bloom merge + vignette + AE + AgX + sat
            this.setRenderTarget(null);
            gl.viewport(0, 0, w, h);
            gl.useProgram(P.final.p);
            bindTex(gl, 0, texScene, P.final.u.uScene);
            bindTex(gl, 1, texBloomA, P.final.u.uBloom);
            bindTex(gl, 2, glTextureOf(this, dst.texture), P.final.u.uAe);
            gl.uniform1f(P.final.u.uBloomAmount, state.bloom);
            gl.uniform1f(P.final.u.uEvOffset, Math.log2(Math.max(0.05, state.exposure)));
            gl.uniform1f(P.final.u.uSaturation, state.saturation);
            gl.uniform1f(P.final.u.uVignette, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            this.state?.reset?.();
            if (!state.firstPassDone) {
                state.firstPassDone = true;
                console.info(TAG, '✔ cadena IterationT activa: bloom 13-tap → gaussiana → AE → AgX(EV 13) → final');
            }
        } catch (err) {
            const now = performance.now();
            if (now - state.warnThrottle > 10000) {
                state.warnThrottle = now;
                console.warn(TAG, 'composición falló:', err?.message || err);
            }
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
            const e = parseFloat(localStorage.getItem('mf_deferred_exposure'));
            if (Number.isFinite(e)) state.exposure = e;
            const s = parseFloat(localStorage.getItem('mf_deferred_saturation'));
            if (Number.isFinite(s)) state.saturation = s;
            const b = parseFloat(localStorage.getItem('mf_deferred_bloom'));
            if (Number.isFinite(b)) state.bloom = b;
        } catch (_) {}
    }

    function savePrefs() {
        try {
            localStorage.setItem('mf_deferred_exposure', String(state.exposure));
            localStorage.setItem('mf_deferred_saturation', String(state.saturation));
            localStorage.setItem('mf_deferred_bloom', String(state.bloom));
        } catch (_) {}
    }

    function enable() {
        state.enabled = true;
        loadPrefs();
        if (!hook()) {
            console.info(TAG, 'esperando al renderer del juego...');
        }
        if (!state.keeperTimer) {
            state.keeperTimer = setInterval(() => {
                if (state.destroyed || !state.enabled) return;
                const r = state.renderer;
                if (!r || !looksLikeRenderer(r) || r.render?.__mfDeferredOwner !== 'mf-deferred') {
                    state.renderer = null;
                    state.hooked = false;
                    disposePasses();
                    disposeRts();
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

    function setGrade(exposure, saturation, bloom) {
        if (Number.isFinite(Number(exposure))) state.exposure = Number(exposure);
        if (Number.isFinite(Number(saturation))) state.saturation = Number(saturation);
        if (Number.isFinite(Number(bloom))) state.bloom = Number(bloom);
        savePrefs();
    }

    function status() {
        return {
            enabled: state.enabled,
            hooked: state.hooked,
            hasRt: !!state.rt,
            rtCtor: !!state.rtCtor,
            passes: !!state.prog,
            renderer: !!state.renderer,
            exposure: state.exposure,
            saturation: state.saturation,
            bloom: state.bloom
        };
    }

    function destroy() {
        state.destroyed = true;
        disable();
        disposePasses();
        disposeRts();
        try { delete window.MF_Deferred; } catch (_) {}
        try { delete window.__MF_DEFERRED_SCOPE__; } catch (_) {}
    }

    document.addEventListener('minifeather:deferred-config', (ev) => {
        try {
            const cfg = JSON.parse(ev.detail || '{}');
            if (cfg.enabled === true) enable();
            else if (cfg.enabled === false) disable();
            setGrade(cfg.exposure, cfg.saturation, cfg.bloom);
        } catch (_) {}
    });

    window.MF_Deferred = { enable, disable, setGrade, status, destroy };
    window.__MF_DEFERRED_SCOPE__ = { destroy };
    console.info(TAG, 'módulo cargado (inactivo hasta minifeather:deferred-config {enabled:true})');
})();
