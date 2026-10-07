(function () {
    'use strict';

    // re-ejecución (hot-reload): limpiar el arco anterior antes de nada
    try { window.__MF_RAINBOW_SCOPE__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather rainbow';

    // ─────────────────────────────────────────────────────────────────────
    // ARCOIRIS PROCEDURAL — anillo ancho anclado al punto ANTI-SOLAR (como
    // el arcoíris real: círculo de 42° alrededor de la dirección opuesta al
    // sol). El mesh se reposiciona cada frame en cámara + anti-sol × 500
    // (falso infinito) con base ortonormal que mantiene el arco "arriba".
    // Gradiente espectral por-píxel vía coordenada radial (vR): primario
    // 40.8-42.6° (violeta adentro → rojo afuera), banda oscura de Alexander,
    // secundario 50.4-52.8° con espectro INVERTIDO al 32% (la física real).
    // Depth test contra el terreno: las colinas lo ocultan naturalmente.
    // Sol/día-noche: lee sunDirection y uSunLight del material del fluido
    // (objetos vivos que el juego ya actualiza) → sin arcoíris de noche ni
    // con el sol bajo el horizonte.
    // ─────────────────────────────────────────────────────────────────────

    const RB_DIST = 500;
    const RB_DEG_IN = 39.5;     // borde interno del anillo (dentro del primario)
    const RB_DEG_OUT = 53.5;    // borde externo (fuera del secundario)

    const state = {
        enabled: localStorage.getItem('mf_rainbow') === 'true',
        intensity: readNum('mf_rainbow_intensity', 0.7),
        mode: localStorage.getItem('mf_rainbow_mode') || 'rain',   // 'rain' | 'always'
        game: null,
        fluidMat: null,
        scanTimer: 0,
        raf: 0,
        lastFrameAt: 0,
        mesh: null,
        U: null,
        sunLight: 1,
        // ciclo post-lluvia: mientras llueve el arco se esconde; al PARAR
        // arranca una ventana de ~2.5 min con fade suave y se va
        rainActive: false,
        afterRainUntil: 0,
        showFactor: 0,
        rainReadFailLogged: false,
        logged: false,
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

    const RING_FS = `
        uniform float uMfRbI;
        varying float vR;
        // espectro violeta→rojo sin magenta sucio en medio
        vec3 mfRbPal(float x) {
            vec3 c = mix(vec3(0.45, 0.10, 0.90), vec3(0.10, 0.30, 1.00), smoothstep(0.00, 0.18, x));
            c = mix(c, vec3(0.05, 0.80, 0.45), smoothstep(0.18, 0.38, x));
            c = mix(c, vec3(0.95, 0.90, 0.15), smoothstep(0.38, 0.58, x));
            c = mix(c, vec3(1.00, 0.55, 0.05), smoothstep(0.58, 0.78, x));
            c = mix(c, vec3(1.00, 0.12, 0.08), smoothstep(0.78, 1.00, x));
            return c;
        }
    `;

    const RING_EMISSIVE = `
        float mfAng = mix(${RB_DEG_IN.toFixed(1)}, ${RB_DEG_OUT.toFixed(1)}, vR);
        // primario: violeta adentro (41.0) → rojo afuera (42.6), bordes suaves
        float mfP = smoothstep(40.6, 41.2, mfAng) * (1.0 - smoothstep(42.4, 43.4, mfAng));
        // secundario: espectro INVERTIDO (rojo adentro), 32% de intensidad
        float mfS = smoothstep(50.0, 50.8, mfAng) * (1.0 - smoothstep(52.0, 53.2, mfAng)) * 0.32;
        float mfX1 = clamp((mfAng - 41.0) / 1.6, 0.0, 1.0);
        float mfX2 = clamp((52.0 - mfAng) / 1.2, 0.0, 1.0);
        vec3 mfc = mfRbPal(mfX1) * mfP + mfRbPal(mfX2) * mfS;
        // banda oscura de Alexander implícita: entre 43 y 50 no hay ventana
        totalEmissiveRadiance = mfc * uMfRbI;
    `;

    function buildRingGeometry(GeomCtor, AttrCtor) {
        const N = 160;
        const rIn = RB_DIST * Math.tan(RB_DEG_IN * Math.PI / 180);
        const rOut = RB_DIST * Math.tan(RB_DEG_OUT * Math.PI / 180);
        const P = new Float32Array((N + 1) * 2 * 3);
        const R = new Float32Array((N + 1) * 2);
        const I = new Uint32Array(N * 6);
        for (let i = 0; i <= N; i++) {
            const th = i / N * Math.PI * 2;
            const cx = Math.cos(th), cy = Math.sin(th);
            P[i * 6] = cx * rIn;  P[i * 6 + 1] = cy * rIn;  P[i * 6 + 2] = 0;
            P[i * 6 + 3] = cx * rOut; P[i * 6 + 4] = cy * rOut; P[i * 6 + 5] = 0;
            R[i * 2] = 0; R[i * 2 + 1] = 1;
        }
        for (let i = 0; i < N; i++) {
            const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
            I[i * 6] = a; I[i * 6 + 1] = b; I[i * 6 + 2] = c;
            I[i * 6 + 3] = b; I[i * 6 + 4] = d; I[i * 6 + 5] = c;
        }
        const geo = new GeomCtor();
        geo.setAttribute('position', new AttrCtor(P, 3));
        geo.setAttribute('arad', new AttrCtor(R, 1));
        geo.setIndex(new AttrCtor(I, 1));
        geo.computeBoundingSphere();
        return geo;
    }

    function buildMaterial(fluidMat) {
        const m = fluidMat.clone();
        m.userData = {};            // sin marcador de fluido — higiene del scan ajeno
        try { m.color?.setRGB?.(0, 0, 0); } catch (_) {}
        try { m.emissive?.setRGB?.(0, 0, 0); } catch (_) {}
        try { m.map = null; } catch (_) {}
        m.vertexColors = false;
        m.transparent = true;
        m.blending = 2;             // AdditiveBlending
        m.depthWrite = false;
        m.depthTest = true;         // el terreno oculta el arco
        m.side = 2;                 // DoubleSide
        m.fog = false;              // el arcoíris no se niebla (está "en el cielo")
        const U = { uMfRbI: { value: 0 } };
        m.onBeforeCompile = (shader) => {
            shader.uniforms.uMfRbI = U.uMfRbI;
            shader.vertexShader = 'attribute float arad;\nvarying float vR;\n' + shader.vertexShader;
            if (shader.vertexShader.includes('#include <begin_vertex>')) {
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
                    '#include <begin_vertex>\n        vR = arad;');
            }
            shader.fragmentShader = RING_FS + shader.fragmentShader;
            if (shader.fragmentShader.includes('vec3 totalEmissiveRadiance = emissive;')) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    'vec3 totalEmissiveRadiance = emissive;',
                    'vec3 totalEmissiveRadiance = vec3(0.0);\n    ' + RING_EMISSIVE);
            }
        };
        m.customProgramCacheKey = () => 'mf_rainbow_v1';
        return { mat: m, U };
    }

    function scan() {
        if (!state.enabled || state.destroyed || state.mesh) return;
        if (!state.game) {
            state.game = findGame();
            if (!state.game) return;
        }
        const scene = state.game?.gameScene?.scene || state.game?.scene?.scene ||
            state.game?.gameScene || state.game?.scene || null;
        if (!scene?.traverse) return;

        // material del fluido: clon base + datos del sol vivos (lo actualiza el juego)
        let fluidMat = null, meshCtor = null, geoCtor = null, attrCtor = null;
        try {
            scene.traverse((o) => {
                if (fluidMat) return;
                const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
                for (const m of mats) {
                    if (m?.userData && m.userData.waterShadersEnabled !== undefined &&
                        m.userData.sunDirection && o.geometry) {
                        fluidMat = m;
                        meshCtor = o.constructor;
                        geoCtor = o.geometry.constructor;
                        attrCtor = o.geometry.attributes.position.constructor;
                        return;
                    }
                }
            });
        } catch (_) {}
        if (!fluidMat) return;

        try {
            const geo = buildRingGeometry(geoCtor, attrCtor);
            const { mat, U } = buildMaterial(fluidMat);
            const mesh = new meshCtor(geo, mat);
            mesh.frustumCulled = false;   // anillo gigante que sigue a la cámara
            mesh.matrixAutoUpdate = false;
            scene.add(mesh);
            state.mesh = mesh;
            state.U = U;
            state.fluidMat = fluidMat;
            if (!state.logged) {
                state.logged = true;
                console.info(TAG, '✔ arco anclado al anti-sol (42°, con secundario y banda de Alexander)');
            }
        } catch (err) {
            console.warn(TAG, 'no se pudo construir el arco:', err?.message || err);
        }
    }

    // ── reposición por frame: falso infinito + base ortonormal ─────────────
    function frame() {
        state.raf = 0;
        if (!state.enabled || state.destroyed) return;
        const nowMs = performance.now();
        const dt = Math.min(0.5, Math.max(0.001, (nowMs - (state.lastFrameAt || nowMs)) / 1000));
        state.lastFrameAt = nowMs;

        // ciclo de lluvia: getRainStrength del world (el mismo método que
        // parchea NoWeather — señal 0..1). sin señal → fail-open a "siempre"
        // (silent-failure de IterationT: mejor arco de más que nunca)
        let factorTarget = 1;
        const world = state.game?.world;
        if (state.mode === 'rain') {
            if (typeof world?.getRainStrength === 'function') {
                let strength = 0;
                try { strength = world.getRainStrength() || 0; } catch (_) {}
                const raining = strength > 0.15;
                if (raining) {
                    state.rainActive = true;
                    state.afterRainUntil = 0;
                    factorTarget = 0;
                } else if (state.rainActive) {
                    // acaba de parar: ventana de arcoíris post-lluvia
                    state.rainActive = false;
                    state.afterRainUntil = nowMs + 150000;
                }
                factorTarget = (state.afterRainUntil > nowMs) ? 1 : 0;
            } else {
                if (!state.rainReadFailLogged) {
                    state.rainReadFailLogged = true;
                    console.warn(TAG, 'sin world.getRainStrength — modo post-lluvia degrada a "siempre"');
                }
            }
        }
        // fades suaves: entra ~6s, sale ~12s
        const tau = factorTarget > state.showFactor ? 6 : 12;
        state.showFactor += (factorTarget - state.showFactor) * (1 - Math.exp(-dt / tau));

        const cam = state.game?.gameScene?.camera;
        if (cam && state.mesh && state.fluidMat) {
            const sd = state.fluidMat.userData.sunDirection;
            if (sd && Number.isFinite(sd.x)) {
                const mag = Math.hypot(sd.x, sd.y, sd.z) || 1;
                const sx = sd.x / mag, sy = sd.y / mag, sz = sd.z / mag;
                // física: sin sol sobre el horizonte no hay arcoíris
                const lift = Math.max(0, Math.min(1, (sy - 0.02) / 0.18));
                const sl = state.fluidMat.userData.uSunLight;
                state.sunLight = sl ? sl.value : 1;
                state.U.uMfRbI.value = state.intensity * lift * state.sunLight * state.showFactor;
                // anti-sol y base: z=anti-sol, y≈arriba proyectado, x=y×z
                const ax = -sx, ay = -sy, az = -sz;
                const d = ay;                      // up·anti con up=(0,1,0)
                let yx = -ax * d, yy = 1 - ay * d, yz = -az * d;
                const yl = Math.hypot(yx, yy, yz) || 1;
                yx /= yl; yy /= yl; yz /= yl;
                const xx = yy * az - yz * ay, xy = yz * ax - yx * az, xz = yx * ay - yy * ax;
                state.mesh.matrix.set(
                    xx, yx, ax, cam.x + ax * RB_DIST,
                    xy, yy, ay, cam.y + ay * RB_DIST,
                    xz, yz, az, cam.z + az * RB_DIST,
                    0, 0, 0, 1
                );
                state.mesh.matrixWorldNeedsUpdate = true;
            }
        }
        state.raf = requestAnimationFrame(frame);
    }

    function enable() {
        state.enabled = true;
        localStorage.setItem('mf_rainbow', 'true');
        if (!state.scanTimer) state.scanTimer = setInterval(scan, 2000);
        if (!state.raf) state.raf = requestAnimationFrame(frame);
        scan();
    }

    function disable() {
        state.enabled = false;
        localStorage.setItem('mf_rainbow', 'false');
        if (state.scanTimer) { clearInterval(state.scanTimer); state.scanTimer = 0; }
        if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
        if (state.mesh) {
            try { state.mesh.parent?.remove(state.mesh); } catch (_) {}
            try { state.mesh.geometry.dispose(); } catch (_) {}
            try { state.mesh.material.dispose(); } catch (_) {}
            state.mesh = null;
        }
    }

    function setConfig(cfg) {
        if (cfg && cfg.intensity !== undefined) {
            const i = parseFloat(cfg.intensity);
            if (Number.isFinite(i)) {
                state.intensity = Math.max(0, Math.min(1, i));
                localStorage.setItem('mf_rainbow_intensity', String(state.intensity));
            }
        }
        if (cfg && cfg.mode !== undefined) {
            state.mode = cfg.mode === 'always' ? 'always' : 'rain';
            localStorage.setItem('mf_rainbow_mode', state.mode);
            if (state.mode === 'always') state.showFactor = 1;
        }
    }

    function status() {
        return {
            enabled: state.enabled,
            mesh: !!state.mesh,
            intensity: state.intensity,
            mode: state.mode,
            raining: state.rainActive,
            showFactor: Math.round(state.showFactor * 100) / 100
        };
    }

    function destroy() {
        state.destroyed = true;
        disable();
        try { delete window.MF_Rainbow; } catch (_) {}
        try { delete window.__MF_RAINBOW_SCOPE__; } catch (_) {}
    }

    document.addEventListener('minifeather:rainbow-config', (ev) => {
        try {
            const cfg = JSON.parse(ev.detail || '{}');
            if (cfg.enabled === true) enable();
            else if (cfg.enabled === false) disable();
            setConfig(cfg);
        } catch (_) {}
    });

    window.MF_Rainbow = { enable, disable, setConfig, status, destroy };
    window.__MF_RAINBOW_SCOPE__ = { destroy };
    console.info(TAG, 'módulo cargado (inactivo hasta minifeather:rainbow-config {enabled:true})');
})();
