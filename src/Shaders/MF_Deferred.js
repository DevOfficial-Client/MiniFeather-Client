(function () {
    'use strict';

    // re-ejecución (hot-reload): parar el loop anterior antes de nada
    try { window.__MF_DEFERRED_SCOPE__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather deferred';

    // ─────────────────────────────────────────────────────────────────────
    // FASE 2 (modo canvas-post) — port de la cadena post de IterationT 3.2.0
    // (Tahnass): composite9-13 (bloom downsample 13-tap + gaussiana axial) →
    // PROGRAM_FINAL_0 (MergeBloom → Vignette → AgX → saturación).
    //
    // POR QUÉ CANVAS-POST Y NO EL HOOK DEL RENDERER: el renderer del juego
    // vive en una clase ESTÁTICA del bundle (colorPass/bloomPass/fogPass/
    // composer como statics) sin referencia global ni desde el objeto game —
    // el hook renderer.render de la fase 1 jamás encontró la instancia y el
    // módulo entero era un passthrough silencioso ("no noto cambio alguno").
    // Encima el juego ya renderiza con SU composer (fogPass raymarched,
    // motion blur, eyeAdaptation, glowOutline), así que interceptar la pasada
    // de escena rompería sus targets de todos modos.
    //
    // El enfoque actual es el mismo que ya usa el postfx del CustomShader:
    // copiar el framebuffer final del juego (copyTexImage2D en el MISMO lote
    // de rAF, el buffer sigue vivo hasta que el browser compone) y dibujar
    // el grade encima, con snapshot/restore del estado GL para no desincronizar
    // las cachés de three. Cuesta algo de HDR (graduamos el LDR ya tonemapeado
    // por el composer del juego), pero funciona con CUALQUIER pipeline del
    // juego y no pelea con nadie.
    //
    // Valores copiados de Lib/Programs/Final.glsl + Bloom.glsl + Settings.glsl
    // (BLOOM_AMOUNT 0.13, pre-scale 2.3, AGX_EV 13, VIGNETTE_FALLOFF 0.4).
    // Desviación documentada: sin exposición automática del pack — su fórmula
    // (8.5·ae^-0.7) espera radiancia lineal HDR y sobre LDR duplica el brillo;
    // en su lugar EV manual (slider, default 0.8 = medios casi neutros medidos
    // con la curva real). Permiso de Tahnass pendiente antes de redistribuir.
    // ─────────────────────────────────────────────────────────────────────

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
    // (13 taps, pesos .125/.5/.25, sum *0.25)
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

    // AxialGaussianBlur de Bloom.glsl (exp2(-i²·alpha·5.77)), paso 2px
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

    // PROGRAM_FINAL_0 de Final.glsl adaptado a entrada LDR: bloom merge +
    // viñeta en display space, luego linearizar → EV → AgX → saturación → sRGB.
    const FINAL_FS = `#version 300 es
        precision highp float;
        uniform sampler2D uScene;   // copia sRGB del canvas del juego
        uniform sampler2D uBloom;
        uniform float uBloomAmount; // BLOOM_AMOUNT 0.13
        uniform float uEvOffset;    // offset manual en stops (log2 del slider)
        uniform float uSaturation;  // SATURATION 1.0
        uniform float uVignette;    // 1 = on (default del pack)
        in vec2 mfUv;
        out vec4 mfOut;

        float Luminance(vec3 c) { return dot(c, vec3(0.2125, 0.7154, 0.0721)); }

        // Final.glsl Vignette() verbatim
        float Vignette(vec2 coord, const float falloff, const float roundness) {
            vec2 aCoord = coord * 2.0 - 1.0;
            aCoord.x *= mix(1.0, 1.7777779, roundness);
            float rf = dot(aCoord, aCoord) * falloff * falloff + 1.0;
            return 1.0 / (rf * rf);
        }

        // MergeBloom() — términos secos (los de lluvia/VOG necesitan datos
        // del juego que no tenemos desde fuera del composer)
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
            color = clamp(log2(max(color, vec3(1e-8)) / middle_grey), -hev, hev);
            color = (color + hev) / 13.0;
            color = AgxDefaultContrastApprox(color);
            color *= mat3(1.19687900512017, -0.0980208811401368, -0.0990297440797205,
                          -0.0528968517574562, 1.15190312990417, -0.0989611768448433,
                          -0.0529716355144438, -0.0980434501171241, 1.15107367264116);
            return color;
        }

        vec3 mfSrgbToLinear(vec3 c) {
            return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
        }
        vec3 mfLinearToSRGB(vec3 c) {
            c = clamp(c, 0.0, 1.0);
            return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0031308)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
        }

        void main() {
            vec3 color = texture(uScene, mfUv).rgb;
            color = MergeBloom(color);
            if (uVignette > 0.5) color *= Vignette(mfUv, 0.4, 0.0);  // FALLOFF/ROUNDNESS default
            vec3 lin = mfSrgbToLinear(clamp(color, vec3(0.0), vec3(1.0)));
            lin *= exp2(uEvOffset);
            lin = AgX(lin);
            // SATURATION del pack (el camino ADVANCED_COLOR va comentado en el pack)
            lin = mix(lin, vec3(Luminance(lin)), vec3(1.0 - uSaturation));
            mfOut = vec4(mfLinearToSRGB(lin), 1.0);
        }
    `;

    const state = {
        enabled: false,
        destroyed: false,
        canvas: null,
        gl: null,
        prog: null,             // { down, blur, final } + uniforms
        vao: null,
        texScene: null, fboScene: null,
        bloomA: null, bloomB: null,   // { tex, fbo, w, h }
        texW: 0, texH: 0,
        rafId: 0,
        keeperTimer: 0,
        lastScanAt: 0,
        lastWarnAt: 0,
        frames: 0,
        firstPassDone: false,
        exposure: 0.8,          // multiplicador EV; 0.8 = medios ~neutros en LDR (medido)
        saturation: 1.0,        // SATURATION del pack
        bloom: 0.13,            // BLOOM_AMOUNT del pack
        badge: null
    };

    // ── canvas/contexto ────────────────────────────────────────────────────
    function findMainGameCanvas() {
        const registry = window.__MF_GL_CANVASES__;
        if (Array.isArray(registry) && registry.length) {
            const live = registry.filter(c =>
                c.isConnected && !c.__mfIsHUD &&
                c.width >= 300 && c.height >= 200);
            live.sort((a, b) => b.width * b.height - a.width * a.height);
            if (live[0]) return live[0];
        }
        const canvases = [...document.querySelectorAll('canvas')];
        return canvases
            .filter(c => c.width >= 300 && c.height >= 200)
            .sort((a, b) => b.width * b.height - a.width * a.height)[0] || null;
    }

    function compile(gl, type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.warn(TAG, 'shader error:', gl.getShaderInfoLog(sh));
            gl.deleteShader(sh);
            return null;
        }
        return sh;
    }

    function makeProgram(gl, fsSrc) {
        const vs = compile(gl, gl.VERTEX_SHADER, VS);
        const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
        if (!vs || !fs) return null;
        const p = gl.createProgram();
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.warn(TAG, 'link error:', gl.getProgramInfoLog(p));
            gl.deleteProgram(p);
            return null;
        }
        return p;
    }

    function makeTarget(gl, w, h) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { tex, fbo, w, h };
    }

    function installGl() {
        const now = performance.now();
        if (now - state.lastScanAt < 1000) return !!state.gl;
        state.lastScanAt = now;

        const canvas = findMainGameCanvas();
        if (!canvas) { setBadge('waiting'); return false; }
        if (state.canvas === canvas && state.gl && !state.gl.isContextLost()) return true;

        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) { setBadge('waiting'); return false; }

        disposeGl();
        const down = makeProgram(gl, BLOOM_DOWN_FS);
        const blur = makeProgram(gl, BLUR_FS);
        const final = makeProgram(gl, FINAL_FS);
        if (!down || !blur || !final) { setBadge('waiting'); return false; }

        const U = (p, n) => gl.getUniformLocation(p, n);
        state.prog = {
            down: { p: down, u: { uTex: U(down, 'uTex'), uTexel: U(down, 'uTexel') } },
            blur: { p: blur, u: { uTex: U(blur, 'uTex'), uAxis: U(blur, 'uAxis'), uTexel: U(blur, 'uTexel'), uSteps: U(blur, 'uSteps'), uAlpha: U(blur, 'uAlpha') } },
            final: { p: final, u: { uScene: U(final, 'uScene'), uBloom: U(final, 'uBloom'), uBloomAmount: U(final, 'uBloomAmount'), uEvOffset: U(final, 'uEvOffset'), uSaturation: U(final, 'uSaturation'), uVignette: U(final, 'uVignette') } }
        };
        // VAO propio vacío: el triángulo por gl_VertexID no necesita atributos
        // y así no heredamos arrays habilitados del VAO que three dejó abierto
        state.vao = typeof gl.createVertexArray === 'function' ? gl.createVertexArray() : null;
        state.canvas = canvas;
        state.gl = gl;
        state.texW = 0; state.texH = 0;
        console.info(TAG, 'canvas del juego agarrado (' + canvas.width + 'x' + canvas.height + ')');
        return true;
    }

    function disposeGl() {
        const gl = state.gl;
        if (gl) {
            for (const t of [state.texScene, state.bloomA?.tex, state.bloomB?.tex]) {
                try { gl.deleteTexture(t); } catch (_) {}
            }
            for (const f of [state.fboScene, state.bloomA?.fbo, state.bloomB?.fbo]) {
                try { gl.deleteFramebuffer(f); } catch (_) {}
            }
            try { if (state.vao) gl.deleteVertexArray(state.vao); } catch (_) {}
            if (state.prog) {
                for (const k of ['down', 'blur', 'final']) {
                    try { gl.deleteProgram(state.prog[k]?.p); } catch (_) {}
                }
            }
        }
        state.prog = null;
        state.vao = null;
        state.texScene = null; state.fboScene = null;
        state.bloomA = null; state.bloomB = null;
        state.texW = 0; state.texH = 0;
        state.canvas = null;
        state.gl = null;
    }

    function ensureTargets(gl, w, h) {
        if (state.texW === w && state.texH === h && state.texScene && state.bloomA) return true;
        const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
        try {
            if (state.texScene) gl.deleteTexture(state.texScene);
            if (state.fboScene) gl.deleteFramebuffer(state.fboScene);
            if (state.bloomA) { gl.deleteTexture(state.bloomA.tex); gl.deleteFramebuffer(state.bloomA.fbo); }
            if (state.bloomB) { gl.deleteTexture(state.bloomB.tex); gl.deleteFramebuffer(state.bloomB.fbo); }

            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

            state.texScene = tex;
            state.fboScene = fbo;
            state.bloomA = makeTarget(gl, bw, bh);
            state.bloomB = makeTarget(gl, bw, bh);
            state.texW = w; state.texH = h;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return !!(state.bloomA && state.bloomB);
        } catch (_) {
            return false;
        }
    }

    // ── badge (prueba visible de que la cadena corre — pedido tras el "no
    // noto cambio alguno" de la fase 1) ─────────────────────────────────────
    function setBadge(mode) {
        if (!state.enabled) { removeBadge(); return; }
        if (!state.badge) {
            state.badge = document.createElement('div');
            state.badge.id = 'mf-deferred-badge';
            state.badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:999990;' +
                'font:10px/1 monospace;letter-spacing:.5px;padding:4px 7px;border-radius:6px;' +
                'pointer-events:none;opacity:.6;background:rgba(0,0,0,.55);color:#9fe8a0;';
            (document.body || document.documentElement).appendChild(state.badge);
        }
        const txt = mode === 'on' ? 'iterationt · on'
            : mode === 'waiting' ? 'iterationt · sin canvas'
            : 'iterationt';
        if (state.badge.textContent !== txt) state.badge.textContent = txt;
        state.badge.style.color = mode === 'on' ? '#9fe8a0' : '#e8c89f';
    }

    function removeBadge() {
        try { state.badge?.remove(); } catch (_) {}
        state.badge = null;
    }

    // ── frame (mismo lote de rAF que el juego: su callback fue registrado
    // antes, así que este corre SIEMPRE después de su render) ───────────────
    function frame() {
        state.rafId = 0;
        if (!state.enabled || state.destroyed) return;

        const gl = state.gl;
        const canvas = state.canvas;
        if (!gl || !canvas || !canvas.isConnected || gl.isContextLost()) {
            setBadge('waiting');
            installGl();
        } else {
            drawComposite();
        }
        if (state.enabled && !state.destroyed) {
            state.rafId = requestAnimationFrame(frame);
        }
    }

    function drawComposite() {
        const gl = state.gl;
        const canvas = state.canvas;
        if (!gl || !state.prog) return;

        const w = canvas.width, h = canvas.height;
        if (!w || !h) return;

        // snapshot del estado que three cachea y podría no re-bindear
        const lastProg = gl.getParameter(gl.CURRENT_PROGRAM);
        const lastActiveTex = gl.getParameter(gl.ACTIVE_TEXTURE);
        const lastFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const lastReadFbo = gl.READ_FRAMEBUFFER_BINDING !== undefined
            ? gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) : null;
        const lastViewport = gl.getParameter(gl.VIEWPORT);
        const lastArrayBuf = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        const lastVao = gl.VERTEX_ARRAY_BINDING !== undefined
            ? gl.getParameter(gl.VERTEX_ARRAY_BINDING) : null;

        gl.activeTexture(gl.TEXTURE0);
        const lastTex0 = gl.getParameter(gl.TEXTURE_BINDING_2D);
        gl.activeTexture(gl.TEXTURE1);
        const lastTex1 = gl.getParameter(gl.TEXTURE_BINDING_2D);

        const lastEnabled = [];
        [gl.BLEND, gl.DEPTH_TEST, gl.CULL_FACE, gl.SCISSOR_TEST].forEach(cap => {
            if (gl.isEnabled(cap)) lastEnabled.push(cap);
        });

        try {
            const P = state.prog;
            // unidad 0 SIEMPRE: crear/targets y pases solo tocan unidades 0/1,
            // que son las que el finally restaura (la activa de three era otra)
            gl.activeTexture(gl.TEXTURE0);
            // DENTRO del snapshot: crear/redimensionar targets toca texturas y
            // framebuffer, y tiene que restaurarse como el resto
            if (!ensureTargets(gl, w, h)) return warnThrottled('sin targets todavía');
            const bw = state.bloomA.w, bh = state.bloomA.h;

            gl.bindVertexArray(state.vao);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, w, h);
            gl.disable(gl.BLEND);
            gl.disable(gl.DEPTH_TEST);
            gl.disable(gl.CULL_FACE);
            gl.disable(gl.SCISSOR_TEST);

            // 0) copia del framebuffer final del juego (mismo lote de rAF,
            //    el drawing buffer sigue vivo hasta que el browser compone)
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, state.texScene);
            if (state.texW !== w || state.texH !== h) {
                gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, w, h, 0);
            } else {
                gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
            }

            // 1) bloom downsample: canvas → half (13 taps del pack)
            gl.bindFramebuffer(gl.FRAMEBUFFER, state.bloomA.fbo);
            gl.viewport(0, 0, bw, bh);
            gl.useProgram(P.down.p);
            gl.uniform1i(P.down.u.uTex, 0);
            gl.uniform2f(P.down.u.uTexel, 1 / w, 1 / h);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // 2) gaussiana axial H+V sobre half-res (ping-pong)
            gl.bindFramebuffer(gl.FRAMEBUFFER, state.bloomB.fbo);
            gl.useProgram(P.blur.p);
            gl.bindTexture(gl.TEXTURE_2D, state.bloomA.tex);
            gl.uniform1i(P.blur.u.uTex, 0);
            gl.uniform2f(P.blur.u.uAxis, 1, 0);
            gl.uniform2f(P.blur.u.uTexel, 1 / bw, 1 / bh);
            gl.uniform1f(P.blur.u.uSteps, 6);
            gl.uniform1f(P.blur.u.uAlpha, 0.1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            gl.bindFramebuffer(gl.FRAMEBUFFER, state.bloomA.fbo);
            gl.bindTexture(gl.TEXTURE_2D, state.bloomB.tex);
            gl.uniform2f(P.blur.u.uAxis, 0, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // 3) FINAL del pack al canvas: bloom merge + viñeta + AgX + sat
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, w, h);
            gl.useProgram(P.final.p);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, state.texScene);
            gl.uniform1i(P.final.u.uScene, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, state.bloomA.tex);
            gl.uniform1i(P.final.u.uBloom, 1);
            gl.uniform1f(P.final.u.uBloomAmount, state.bloom);
            gl.uniform1f(P.final.u.uEvOffset, Math.log2(Math.max(0.05, state.exposure)));
            gl.uniform1f(P.final.u.uSaturation, state.saturation);
            gl.uniform1f(P.final.u.uVignette, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            state.frames++;
            setBadge('on');
            if (!state.firstPassDone) {
                state.firstPassDone = true;
                console.info(TAG, '✔ cadena IterationT activa (canvas-post): bloom 13-tap → gaussiana → AgX(EV 13) → final');
            }
        } catch (err) {
            warnThrottled('composición falló: ' + (err?.message || err));
        } finally {
            gl.bindFramebuffer(gl.FRAMEBUFFER, lastFbo);
            if (lastReadFbo !== null && gl.READ_FRAMEBUFFER_BINDING !== undefined) {
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, lastReadFbo);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, lastArrayBuf);
            if (lastVao !== null && gl.bindVertexArray) gl.bindVertexArray(lastVao);
            else if (gl.bindVertexArray) gl.bindVertexArray(null);
            gl.useProgram(lastProg);
            lastEnabled.forEach(cap => gl.enable(cap));
            [gl.BLEND, gl.DEPTH_TEST, gl.CULL_FACE, gl.SCISSOR_TEST].forEach(cap => {
                if (!lastEnabled.includes(cap)) gl.disable(cap);
            });
            gl.viewport(lastViewport[0], lastViewport[1], lastViewport[2], lastViewport[3]);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, lastTex0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, lastTex1);
            gl.activeTexture(lastActiveTex);
        }
    }

    function warnThrottled(msg) {
        const now = performance.now();
        if (now - state.lastWarnAt < 10000) return;
        state.lastWarnAt = now;
        console.warn(TAG, msg);
    }

    // ── loop del keeper: canvas nuevo/cambio de mundo/contexto perdido ─────
    function keeper() {
        if (!state.enabled || state.destroyed) return;
        if (!state.gl || !state.canvas || !state.canvas.isConnected ||
            state.gl.isContextLost?.()) {
            state.firstPassDone = false;
            installGl();
        }
        if (state.enabled && !state.rafId) {
            state.rafId = requestAnimationFrame(frame);
        }
    }

    // ── prefs + API pública ────────────────────────────────────────────────
    function loadPrefs() {
        try {
            const e = parseFloat(localStorage.getItem('mf_deferred_exposure'));
            const s = parseFloat(localStorage.getItem('mf_deferred_saturation'));
            const b = parseFloat(localStorage.getItem('mf_deferred_bloom'));
            if (Number.isFinite(e)) state.exposure = e;
            if (Number.isFinite(s)) state.saturation = s;
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
        state.destroyed = false;
        loadPrefs();
        if (!installGl()) {
            console.info(TAG, 'esperando al canvas del juego...');
            setBadge('waiting');
        }
        if (!state.keeperTimer) {
            state.keeperTimer = setInterval(keeper, 1500);
        }
        if (!state.rafId) {
            state.rafId = requestAnimationFrame(frame);
        }
        return true;
    }

    function disable() {
        state.enabled = false;
        if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
        if (state.keeperTimer) { clearInterval(state.keeperTimer); state.keeperTimer = 0; }
        removeBadge();
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
            mode: 'canvas-post',
            canvas: !!state.canvas,
            frames: state.frames,
            exposure: state.exposure,
            saturation: state.saturation,
            bloom: state.bloom
        };
    }

    function destroy() {
        state.destroyed = true;
        disable();
        disposeGl();
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
    console.info(TAG, 'módulo cargado (canvas-post; inactivo hasta minifeather:deferred-config {enabled:true})');
})();
