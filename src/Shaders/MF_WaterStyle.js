(function () {
    'use strict';

    // re-ejecución (hot-reload): desenganchar todo antes de nada
    try { window.__MF_WATERSTYLE_SCOPE__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather waterstyle';

    // ─────────────────────────────────────────────────────────────────────
    // Agua TRANSPARENTE Y CRISTALINA pero con MUCHA TURBULENCIA (v4). El
    // juego renderiza el fluido con UN material compartido (agua + lava) cuyo
    // onBeforeCompile inyecta el shader de olas/refracciones
    // (`water_shader_v53`); se identifica porque es el único con
    // userData.waterShadersEnabled. Envolvemos su onBeforeCompile y:
    //   1. fuerza la rama fancy (USE_WATER_SHADERS) aunque el setting del
    //      juego esté apagado — seguro: los raymarch de texturas están gated
    //      por reflectionEnabled>0.5 y corren fallbacks analíticos;
    //   2. amplifica la amplitud de las olas del juego (kinds 1 y 2; lava
    //      pide kind 0 y no se toca) × uMfWaveScale;
    //   3. SUMA mfTurbulence: chop de alta frecuencia cruzado con crestas
    //      picudas (los senos del juego solos son swell liso; escalados siguen
    //      siendo liso). Dentro de waterWaveHeight → la normal que ilumina la
    //      superficie también hierve y el destello del sol danza;
    //   4. anillo radial centrado en el jugador (uMfPlayerRipple suavizado a
    //      1 en agua / 0.15 en tierra, tick 10Hz);
    //   5. al final del fragment: re-tinte por luminancia + alfa fijo,
    //      ANTES del fog del template.
    // El juego hace tick de userData.time en fixedUpdate sin importar su
    // setting, así que la animación corre siempre.
    // ─────────────────────────────────────────────────────────────────────

    const TINT = [0.45, 0.95, 0.55];   // verde agua; lum × esto = tono final

    const state = {
        enabled: localStorage.getItem('mf_waterstyle') === 'true',
        alpha: readNum('mf_waterstyle_alpha', 0.12),
        tintMix: readNum('mf_waterstyle_tintmix', 0.85),
        waveScale: readNum('mf_waterstyle_wavescale', 2.0),
        game: null,
        scanTimer: 0,
        tickTimer: 0,
        lastScan: 0,
        hooked: new Map(),      // material → { orig, origKey, liveUniforms }
        destroyed: false
    };

    function readNum(key, fallback) {
        const v = parseFloat(localStorage.getItem(key));
        return Number.isFinite(v) ? v : fallback;
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

    function getScene(g) {
        return g?.gameScene?.scene || g?.scene?.scene || g?.gameScene || g?.scene || null;
    }

    function injectBeforeMainEnd(src, code) {
        const lastBrace = src.lastIndexOf('}');
        if (lastBrace < 0) return src;
        return src.slice(0, lastBrace) + '\n' + code + '\n' + src.slice(lastBrace);
    }

    const WAVE_GLSL = `
        uniform float uMfWaveScale;
        uniform vec3 uMfPlayerPos;
        uniform float uMfPlayerRipple;
        // TURBULENCIA: los 3 senos del juego son swell lento y liso; esto es
        // chop — tres trenes cruzados de alta frecuencia (λ≈2-3 bloques, el
        // techo antes de que la malla por-bloque aliasee) con fase que deambula
        // (seno dentro del seno) para que no se vea de tapicería, y skew
        // cuadrático que empina las crestas y aplasta los valles: agua que
        // SE APILA, no que se hunde
        float mfTurbulence(vec2 p, float t) {
            float tt = t * 11.0;
            float h = sin(dot(p, vec2( 2.2,  1.5)) + tt) * 0.50;
            h += sin(dot(p, vec2(-1.9,  2.6)) + tt * 1.37 + sin(dot(p, vec2( 2.2,  1.5)) * 0.7 - tt * 0.61) * 1.2) * 0.35;
            h += sin(dot(p, vec2( 2.9, -1.2)) - tt * 1.71 + sin(dot(p, vec2(-1.9,  2.6)) * 0.5 + tt * 0.43) * 0.9) * 0.30;
            h += h * 0.35 * h;
            return h * 0.028;
        }
        // anillo radial que nace del jugador; kind>=0.5 = agua (la lava pide
        // kind 0.0 y sale por el if de una). El módulo suaviza
        // uMfPlayerRipple hacia 1 en agua / 0.15 en tierra
        float mfPlayerRipple(vec2 p, float t, float kind) {
            if (kind < 0.5) return 0.0;
            float mfD = length(p - uMfPlayerPos.xz);
            float mfRing = sin(mfD * 2.0 - t * 6.0);
            return mfRing * exp(-mfD * 0.5) * uMfPlayerRipple * 0.05 * uMfWaveScale;
        }
    `;

    const FRAG_TAIL = `
        // mf water style: tinte verde por luminancia + alfa fijo. vColor.r < 0.49
        // es el gate agua/lava del propio shader del juego; lava pasa de largo.
        #ifdef USE_COLOR
        if (vColor.r < 0.49) {
            float mfWsLum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, mfWsLum * uMfWaterTint, uMfWaterTintMix);
            gl_FragColor.a = uMfWaterAlpha;
        }
        #endif
    `;

    function hookMaterial(m) {
        if (m.__mfWaterStyleHooked) return false;
        if (typeof m.onBeforeCompile !== 'function') return false;

        const orig = m.onBeforeCompile.bind(m);
        const origKey = m.customProgramCacheKey;

        const liveUniforms = {
            uMfWaterAlpha: { value: state.alpha },
            uMfWaterTintMix: { value: state.tintMix },
            uMfWaterTint: { value: TINT.slice() },
            uMfWaveScale: { value: state.waveScale },
            uMfPlayerPos: { value: [0, 0, 0] },
            uMfPlayerRipple: { value: 0 }
        };

        const wrapper = function (shader) {
            orig(shader);
            shader.uniforms.uMfWaterAlpha = liveUniforms.uMfWaterAlpha;
            shader.uniforms.uMfWaterTintMix = liveUniforms.uMfWaterTintMix;
            shader.uniforms.uMfWaterTint = liveUniforms.uMfWaterTint;
            shader.uniforms.uMfWaveScale = liveUniforms.uMfWaveScale;
            shader.uniforms.uMfPlayerPos = liveUniforms.uMfPlayerPos;
            shader.uniforms.uMfPlayerRipple = liveUniforms.uMfPlayerRipple;

            // superficie VIVA aunque el juego tenga "water shaders" apagado: el
            // setting gatea el define en compilación y el uniform en runtime.
            // Forzar ambos es seguro porque TODOS los raymarch que muestrean
            // texturas (SSR/refracción/sun trace) están gated además por
            // reflectionEnabled>0.5, que sigue en 0 si el motor no captura —
            // corren los fallbacks analíticos (olas, cielo, destello del sol).
            // Si el usuario enciende el setting del juego, los reflejos SSR
            // reales aparecen solos (nuestro tint los preserva vía el mix).
            // Los uniforms nuestros van en el header (alcance global; el tail
            // antes del fog es statement-only dentro de main).
            if (!shader.vertexShader.includes('USE_WATER_SHADERS')) {
                shader.vertexShader = '#define USE_WATER_SHADERS\n' + shader.vertexShader;
            }
            if (!shader.vertexShader.includes('uMfWaveScale')) {
                shader.vertexShader = WAVE_GLSL + shader.vertexShader;
            }
            if (!shader.fragmentShader.includes('uMfWaterAlpha')) {
                shader.fragmentShader =
                    '#define USE_WATER_SHADERS\n' +
                    'uniform float uMfWaterAlpha;\n' +
                    'uniform float uMfWaterTintMix;\n' +
                    'uniform vec3 uMfWaterTint;\n' +
                    shader.fragmentShader;
            }
            if (shader.uniforms.waterShadersEnabled) {
                shader.uniforms.waterShadersEnabled.value = 1;
            }

            // olas notorias + turbulencia + reacción al jugador: parcheo
            // waterWaveHeight del propio juego — la normal que ilumina la
            // superficie sale de la MISMA función (waterWaveNormal la llama),
            // así que el brillo del sol titila con el chop y el anillo. Si el
            // bundle cambia y los marcadores ya no están, el agua queda
            // vanilla en vez de no compilar (fail-open, la lección del
            // CustomShader)
            if (!shader.vertexShader.includes('mfPlayerRipple(p, t, kind)')) {
                let vs = shader.vertexShader;
                const ampOrig = 'float amp = kind < 0.5 ? 0.01 : (kind < 1.5 ? 0.045 : 0.03);';
                if (vs.includes(ampOrig)) {
                    vs = vs.replace(ampOrig,
                        'float amp = kind < 0.5 ? 0.01 : (kind < 1.5 ? 0.045 * uMfWaveScale : 0.03 * uMfWaveScale);');
                }
                if (vs.includes('return w * amp;')) {
                    vs = vs.replace('return w * amp;',
                        'return w * amp + mfTurbulence(p, t) * uMfWaveScale + mfPlayerRipple(p, t, kind);');
                }
                shader.vertexShader = vs;
            }

            const stamp = 'float mfWaterStyle = 1.0;\n' + FRAG_TAIL;
            if (!shader.fragmentShader.includes('mfWaterStyle')) {
                // ANTES del fog: así la niebla del juego mezcla el agua tintada
                // igual que al terreno y el agua no "flota" sin fog a distancia
                if (shader.fragmentShader.includes('#include <fog_fragment>')) {
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <fog_fragment>',
                        stamp + '\n#include <fog_fragment>'
                    );
                } else {
                    shader.fragmentShader = injectBeforeMainEnd(shader.fragmentShader, stamp);
                }
            }
        };

        m.onBeforeCompile = wrapper;
        m.customProgramCacheKey = function () {
            let base = '';
            try { base = origKey ? String(origKey.call(m)) : ''; } catch (_) {}
            return base + '_mfws_v3';
        };
        m.__mfWaterStyleHooked = true;
        m.needsUpdate = true;

        state.hooked.set(m, { orig, origKey, liveUniforms });
        return true;
    }

    function unhookMaterial(m) {
        const entry = state.hooked.get(m);
        if (!entry) return;
        try { m.onBeforeCompile = entry.orig; } catch (_) {}
        try { m.customProgramCacheKey = entry.origKey; } catch (_) {}
        m.__mfWaterStyleHooked = false;
        m.needsUpdate = true;
        state.hooked.delete(m);
    }

    function scan() {
        if (!state.enabled || state.destroyed) return;
        const now = performance.now();
        if (now - state.lastScan < 2000) return;
        state.lastScan = now;

        if (!state.game) {
            state.game = findGame();
            if (!state.game) return;
        }
        const scene = getScene(state.game);
        if (!scene?.traverse) return;

        let added = 0;
        try {
            scene.traverse((o) => {
                const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
                for (const m of mats) {
                    if (m?.userData && m.userData.waterShadersEnabled !== undefined) {
                        if (hookMaterial(m)) added++;
                        // el onChange del juego pone esto en 0 si su setting está
                        // apagado; la superficie viva es parte de nuestro look
                        if (state.hooked.has(m)) m.userData.waterShadersEnabled.value = 1;
                    }
                }
            });
        } catch (_) {}

        if (added > 0) {
            console.info(TAG, '✔ enganchado al material del fluido (' + added + ' nuevo/s, ' + state.hooked.size + ' total)');
        }
    }

    function applyLive() {
        for (const [, entry] of state.hooked) {
            entry.liveUniforms.uMfWaterAlpha.value = state.alpha;
            entry.liveUniforms.uMfWaterTintMix.value = state.tintMix;
            entry.liveUniforms.uMfWaveScale.value = state.waveScale;
        }
    }

    // 10 Hz basta: el anillo se anima con el time del juego (60fps en shader),
    // aquí solo actualizamos el CENTRO (pos del jugador) y la intensidad
    function tickPlayer() {
        if (!state.enabled || state.destroyed) return;
        if (!state.game?.player) {
            state.game = findGame() || state.game;
        }
        const p = state.game?.player;
        const pos = p?.pos;
        for (const [, entry] of state.hooked) {
            const u = entry.liveUniforms;
            if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
                u.uMfPlayerPos.value[0] = pos.x;
                u.uMfPlayerPos.value[1] = pos.y || 0;
                u.uMfPlayerPos.value[2] = pos.z;
            }
            // en agua = 1, en tierra = 0.15 (la caída exponencial del anillo
            // deja el efecto local de todos modos — "el agua te nota")
            const target = p?.inWater ? 1 : 0.15;
            u.uMfPlayerRipple.value += (target - u.uMfPlayerRipple.value) * 0.18;
        }
    }

    function enable() {
        state.enabled = true;
        localStorage.setItem('mf_waterstyle', 'true');
        if (!state.scanTimer) {
            state.scanTimer = setInterval(scan, 2000);
        }
        if (!state.tickTimer) {
            state.tickTimer = setInterval(tickPlayer, 100);
        }
        scan();
    }

    function disable() {
        state.enabled = false;
        localStorage.setItem('mf_waterstyle', 'false');
        if (state.scanTimer) { clearInterval(state.scanTimer); state.scanTimer = 0; }
        if (state.tickTimer) { clearInterval(state.tickTimer); state.tickTimer = 0; }
        for (const m of [...state.hooked.keys()]) unhookMaterial(m);
    }

    function setConfig(cfg) {
        if (cfg && cfg.alpha !== undefined) {
            const a = parseFloat(cfg.alpha);
            if (Number.isFinite(a)) {
                state.alpha = Math.max(0, Math.min(0.9, a));
                localStorage.setItem('mf_waterstyle_alpha', String(state.alpha));
            }
        }
        if (cfg && cfg.tintMix !== undefined) {
            const t = parseFloat(cfg.tintMix);
            if (Number.isFinite(t)) {
                state.tintMix = Math.max(0, Math.min(1, t));
                localStorage.setItem('mf_waterstyle_tintmix', String(state.tintMix));
            }
        }
        if (cfg && cfg.waveScale !== undefined) {
            const w = parseFloat(cfg.waveScale);
            if (Number.isFinite(w)) {
                state.waveScale = Math.max(1, Math.min(4, w));
                localStorage.setItem('mf_waterstyle_wavescale', String(state.waveScale));
            }
        }
        if (cfg && cfg.tint && Array.isArray(cfg.tint) && cfg.tint.length === 3) {
            const t = cfg.tint.map(Number);
            if (t.every(Number.isFinite)) {
                for (let i = 0; i < 3; i++) TINT[i] = t[i];
                for (const [, entry] of state.hooked) entry.liveUniforms.uMfWaterTint.value = TINT.slice();
            }
        }
        applyLive();
    }

    function status() {
        return {
            enabled: state.enabled,
            hooked: state.hooked.size,
            alpha: state.alpha,
            tintMix: state.tintMix,
            waveScale: state.waveScale,
            tint: TINT.slice()
        };
    }

    function destroy() {
        state.destroyed = true;
        disable();
        try { delete window.MF_WaterStyle; } catch (_) {}
        try { delete window.__MF_WATERSTYLE_SCOPE__; } catch (_) {}
    }

    document.addEventListener('minifeather:waterstyle-config', (ev) => {
        try {
            const cfg = JSON.parse(ev.detail || '{}');
            if (cfg.enabled === true) enable();
            else if (cfg.enabled === false) disable();
            setConfig(cfg);
        } catch (_) {}
    });

    window.MF_WaterStyle = { enable, disable, setConfig, status, destroy };
    window.__MF_WATERSTYLE_SCOPE__ = { destroy };
    console.info(TAG, 'módulo cargado (inactivo hasta minifeather:waterstyle-config {enabled:true})');
})();
