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
        acrylic: readNum('mf_waterstyle_acrylic', 0.55),
        waveScale: readNum('mf_waterstyle_wavescale', 2.0),
        game: null,
        scanTimer: 0,
        tickTimer: 0,
        lastScan: 0,
        hooked: new Map(),      // material → { orig, origKey, liveUniforms, origGeo, cloneGeo, curtain }
        subdiv: localStorage.getItem('mf_waterstyle_subdiv') !== 'false',
        subBudget: 0,
        subLogged: false,
        caustics: readNum('mf_waterstyle_caustics', 0.8),
        cauBudget: 0,
        cauLogged: false,
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
        attribute float mfSub;
        uniform float uMfWaveScale;
        uniform vec3 uMfPlayerPos;
        uniform float uMfPlayerRipple;
        // hash/ruido value sin senos (determinista en coords de mundo grandes,
        // C1 por el smoothstep → normales por diferencia finita limpias)
        float mfHash(vec2 p) {
            p = 50.0 * fract(p * 0.3183099 + vec2(0.71, 0.113));
            return -1.0 + 2.0 * fract(p.x * p.y * (p.x + p.y));
        }
        float mfNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(mfHash(i), mfHash(i + vec2(1.0, 0.0)), u.x),
                       mix(mfHash(i + vec2(0.0, 1.0)), mfHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        // MAR POR VIENTO (v7): ruido FBM advectado + warp del dominio + rachas.
        // Cero trenes, cero periodicidad — el warp hace que nunca se repita ni
        // se reconozca una célula. Las octavas finas (mfSub) solo se abren
        // donde la malla subdividida las puede representar (lección v4/v5);
        // en vértices por bloque solo corre la base (λ~4.4 bloques)
        float mfWindWaves(vec2 p, float t) {
            vec2 wind = vec2(0.8, 0.6);
            // warp EVOLUCIONA rápido: el campo no solo se traslada, se
            // REMODELA — sin esto la superficie parece congelada aunque el
            // patrón derive (lección v8: advección sola = "1009 por hora" XD)
            vec2 warp = vec2(
                mfNoise(p * 0.35 + vec2( t * 0.28, -t * 0.24)),
                mfNoise(p * 0.35 + vec2(-t * 0.26,  t * 0.30))
            ) * 0.9;
            vec2 q = (p + warp) * 0.45;
            float h = mfNoise(q - wind * t * 0.75) * 0.72;
            h += mfNoise(q * 2.1 - wind * t * 1.05 + 7.3) * (0.30 * mfSub);
            h += mfNoise(q * 4.4 - wind * t * 1.40 + 3.1) * (0.22 * mfSub);
            // rachas presentes sin dejar el mar en calma muerta
            h *= 1.0 + mfNoise(p * 0.16 + wind * t * 0.10) * 0.45;
            return h;
        }
        // amplitud 0.10: waveBlend ancla las orillas, así que el interior puede
        // ondear ±3px sin abrir huecos contra el terreno (a 2x; a 4x = tormenta)
        float mfTurbulence(vec2 p, float t) {
            return mfWindWaves(p, t) * 0.10;
        }
        // anillo radial que nace del jugador; kind>=0.5 = agua (la lava pide
        // kind 0.0 y sale por el if de una)
        float mfPlayerRipple(vec2 p, float t, float kind) {
            if (kind < 0.5) return 0.0;
            float mfD = length(p - uMfPlayerPos.xz);
            float mfRing = sin(mfD * 1.2 - t * 6.0);
            return mfRing * exp(-mfD * 0.5) * uMfPlayerRipple * 0.06 * uMfWaveScale;
        }
    `;

    // chop por-píxel: reemplaza el normal liso de renderWaterColor por ruido
    // advectado (per-píxel = resolución total, cero aliasing de malla, cero
    // trenes reconocibles). Al estar ANTES de NdotV/fresnel/refracción/SSR,
    // titilan el brillo del sol, la transparencia y los reflejos
    const FRAG_CHOP = `// mf chop: turbulencia fina por-pixel (ruido advectado)
        vec2 mfCq = vWorldPosition.xz * 1.9;
        mfCq += vec2(mfFNoise(mfCq * 0.29 + time * 0.03)) * 0.8;
        float mfC = mfFNoise(mfCq - vec2(0.9, 0.6) * time * 0.55) * 0.7
                  + mfFNoise(mfCq * 2.3 - vec2(0.9, 0.6) * time * 0.80 + 4.7) * 0.3;
        vec3 normal = normalize(vWorldNormal + vec3(mfC, 0.0, mfC * 0.8) * uMfChop);`;

    // ruido para el fragment (copia propia: el fragment no ve funciones del vertex)
    const FRAG_NOISE = `
        float mfFHash(vec2 p) {
            p = 50.0 * fract(p * 0.3183099 + vec2(0.71, 0.113));
            return -1.0 + 2.0 * fract(p.x * p.y * (p.x + p.y));
        }
        float mfFNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(mfFHash(i), mfFHash(i + vec2(1.0, 0.0)), u.x),
                       mix(mfFHash(i + vec2(0.0, 1.0)), mfFHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
    `;

    const FRAG_TAIL = `
        // mf water style: tinte verde por luminancia + acabado ACRÍLICO + alfa.
        // vColor.r < 0.49 es el gate agua/lava del propio shader del juego;
        // lava pasa de largo.
        #ifdef USE_COLOR
        if (vColor.r < 0.49) {
            float mfWsLum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, mfWsLum * uMfWaterTint, uMfWaterTintMix);
            // acrílico: placa lechosa (blanco verdoso) que se acentúa a ángulos
            // rasantes — mirar de cerca = cristal, mirar de lado = placa
            float mfAv = clamp(dot(normalize(vWorldNormal),
                normalize(cameraPosition - vWorldPosition + vec3(0.0001))), 0.0, 1.0);
            float mfMilky = uMfAcrylic * (0.16 + 0.62 * pow(1.0 - mfAv, 2.0));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.86, 0.94, 0.90), mfMilky);
            // brillo plástico: micro-boost solo en luces
            gl_FragColor.rgb += uMfAcrylic *
                pow(max(gl_FragColor.rgb - 0.35, vec3(0.0)), vec3(3.0)) * 0.8;
            // la lechosidad difunde: sube el alfa (más placa = menos transparencia)
            gl_FragColor.a = mix(uMfWaterAlpha, 0.92, mfMilky);
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
            uMfAcrylic: { value: state.acrylic },
            uMfWaveScale: { value: state.waveScale },
            uMfChop: { value: 0.35 * state.waveScale },
            uMfPlayerPos: { value: [0, 0, 0] },
            uMfPlayerRipple: { value: 0 }
        };

        const wrapper = function (shader) {
            orig(shader);
            shader.uniforms.uMfWaterAlpha = liveUniforms.uMfWaterAlpha;
            shader.uniforms.uMfWaterTintMix = liveUniforms.uMfWaterTintMix;
            shader.uniforms.uMfWaterTint = liveUniforms.uMfWaterTint;
            shader.uniforms.uMfAcrylic = liveUniforms.uMfAcrylic;
            shader.uniforms.uMfWaveScale = liveUniforms.uMfWaveScale;
            shader.uniforms.uMfChop = liveUniforms.uMfChop;
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
                    'uniform float uMfAcrylic;\n' +
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
                    // frecuencia adaptativa: p se escala ×2.2 SOLO en geometría
                    // subdividida (mfSub=1) — la que no lo está mantiene sus
                    // frecuencias seguras para vértices por bloque. La lava
                    // (kind 0) nunca escala: churn vanilla
                    vs = vs.replace(ampOrig,
                        'p *= 1.0 + (kind < 0.5 ? 0.0 : mfSub) * 1.2;\n          ' +
                        'float amp = kind < 0.5 ? 0.01 : (kind < 1.5 ? 0.045 * uMfWaveScale : 0.03 * uMfWaveScale);');
                }
                // los senos 2 y 3 del juego van a 2.8 y 2.15 rad/bloque: al
                // amplificar el amp se volvían sierra por-vértice (paneles).
                // sus coeficientes se doman — la textura media la repone
                // mfTurbulence a frecuencias representables
                const s2Orig = 'sin(p.x * 2.3 - p.y * 1.6 + t * 1.15) * 0.5;';
                if (vs.includes(s2Orig)) {
                    vs = vs.replace(s2Orig, 'sin(p.x * 2.3 - p.y * 1.6 + t * 1.15) * 0.16;');
                }
                const s3Orig = 'cos(p.x * 0.8 + p.y * 2.0 + t * 0.9) * 0.35;';
                if (vs.includes(s3Orig)) {
                    vs = vs.replace(s3Orig, 'cos(p.x * 0.8 + p.y * 2.0 + t * 0.9) * 0.20;');
                }
                if (vs.includes('return w * amp;')) {
                    // los 3 senos del juego son swell regular (patrón): queda
                    // al 25% como piso de mar de fondo; el viento es el ruido
                    vs = vs.replace('return w * amp;',
                        'return w * amp * 0.25 + mfTurbulence(p, t) * uMfWaveScale + mfPlayerRipple(p, t, kind);');
                }
                shader.vertexShader = vs;
            }

            // chop por-pixel (turbulencia fina, sin aliasing de malla)
            if (!shader.fragmentShader.includes('uMfChop')) {
                shader.fragmentShader = FRAG_NOISE + 'uniform float uMfChop;\n' + shader.fragmentShader;
            }
            if (!shader.fragmentShader.includes('mf chop') &&
                shader.fragmentShader.includes('vec3 normal = normalize(vWorldNormal);')) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    'vec3 normal = normalize(vWorldNormal);',
                    FRAG_CHOP
                );
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
            return base + '_mfws_v9';
        };
        m.__mfWaterStyleHooked = true;
        m.needsUpdate = true;

        state.hooked.set(m, { orig, origKey, liveUniforms, mat: m });
        return true;
    }

    function unhookMaterial(m) {
        const entry = state.hooked.get(m);
        if (!entry) return;
        try { m.onBeforeCompile = entry.orig; } catch (_) {}
        try { m.customProgramCacheKey = entry.origKey; } catch (_) {}
        // devolver la geometría original y liberar la subdividida
        if (entry.cloneGeo) {
            try { if (m.geometry === entry.cloneGeo) m.geometry = entry.origGeo; } catch (_) {}
            try { entry.cloneGeo.dispose(); } catch (_) {}
        }
        disposeCurtain(entry);
        m.__mfWaterStyleHooked = false;
        m.needsUpdate = true;
        state.hooked.delete(m);
    }

    // ── subdivisión de la geometría del fluido (v6) ───────────────────────
    // la malla del juego viene con vértices por bloque (mesher WASM); el techo
    // de Nyquist de esa rejilla amarra la frecuencia de olas representable.
    // Subdividir cada triángulo en n×n con atributos interpolados
    // bariacéntricamente da spacing 1/n de bloque y el shader (mfSub) sube
    // frecuencias solo ahí. El desplazamiento depende SOLO de la posición de
    // mundo → duplicar vértices en bordes de triángulo no genera grietas.
    function subdivideGeometry(orig) {
        try {
            const pos = orig.attributes.position;
            if (!pos) return null;
            const index = orig.index;
            const triCount = Math.floor((index ? index.count : pos.count) / 3);
            if (!triCount || triCount > 60000) return null;   // malla monstruo: mejor no
            const n = triCount > 20000 ? 2 : 3;               // océanos: 2×, lo demás: 3×
            const vertsPerTri = (n + 1) * (n + 2) / 2;
            const outCount = triCount * vertsPerTri;

            // lattice bariacéntrico (i,j,k) con i+j+k=n, indexado por filas:
            // la fila i tiene (n-i+1) puntos, start(i) = i*(n+1) - i*(i-1)/2.
            // (con i*n - i*(i-1)/2 las filas se solapaban y collisonaban
            // índices → triángulos degenerados/invertidos, bug del test)
            const latIdx = (i, j) => i * (n + 1) - (i * (i - 1)) / 2 + j;

            const geo = new orig.constructor();
            // clase PLANA de position para todos los atributos nuevos: si
            // algún atributo de origen viniera interleavado, a.constructor
            // esperaría un InterleavedBuffer y reventaría
            const PA = orig.attributes.position.constructor;
            for (const name in orig.attributes) {
                const a = orig.attributes[name];
                if (!a || typeof a.getX !== 'function') return null;
                const out = new Float32Array(outCount * a.itemSize);
                geo.setAttribute(name, new PA(out, a.itemSize, a.normalized));
            }
            // marca de subdivisión: el shader la lee para escalar frecuencias
            // (los vértices SIN este atributo leen 0.0 por spec de WebGL)
            geo.setAttribute('mfSub', new PA(new Float32Array(outCount).fill(1), 1));

            const idxOut = new Uint32Array(triCount * n * n * 3);
            const read = (attr, vi, comp) =>
                comp === 0 ? attr.getX(vi) : comp === 1 ? attr.getY(vi)
                : comp === 2 ? attr.getZ(vi) : attr.getW(vi);

            let ii = 0;
            for (let tri = 0; tri < triCount; tri++) {
                const ia = index ? index.getX(tri * 3) : tri * 3;
                const ib = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
                const ic = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
                const base = tri * vertsPerTri;
                for (const name in orig.attributes) {
                    const a = orig.attributes[name];
                    const out = geo.attributes[name].array;
                    const sz = a.itemSize;
                    for (let i = 0; i <= n; i++) {
                        for (let j = 0; i + j <= n; j++) {
                            const k = n - i - j;
                            const vi = base + latIdx(i, j);
                            for (let c = 0; c < sz; c++) {
                                out[vi * sz + c] = (read(a, ia, c) * i +
                                    read(a, ib, c) * j + read(a, ic, c) * k) / n;
                            }
                        }
                    }
                }
                for (let i = 0; i < n; i++) {
                    for (let j = 0; i + j < n; j++) {
                        // winding del padre preservado: (i,j)→(i+1,j)→(i,j+1)
                        // recorre el lattice en la MISMA orientación que A→B→C
                        // (invertirlo = triángulos inside-out con FrontSide,
                        // agua invisible — bug agarrado por el test del stub)
                        idxOut[ii++] = base + latIdx(i, j);
                        idxOut[ii++] = base + latIdx(i + 1, j);
                        idxOut[ii++] = base + latIdx(i, j + 1);
                        if (i + j < n - 1) {
                            idxOut[ii++] = base + latIdx(i, j + 1);
                            idxOut[ii++] = base + latIdx(i + 1, j);
                            idxOut[ii++] = base + latIdx(i + 1, j + 1);
                        }
                    }
                }
            }
            if (ii !== idxOut.length) return null;
            geo.setIndex(new (orig.attributes.position.constructor)(
                idxOut, 1));
            geo.computeBoundingSphere();
            geo.computeBoundingBox();
            return geo;
        } catch (_) {
            return null;
        }
    }

    function maybeSubdivide(m, entry) {
        const g = m.geometry;
        if (!g || g === entry.cloneGeo) return;
        if (g.__mfSubFailed) return;
        if (state.subBudget <= 0) return;
        const clone = subdivideGeometry(g);
        state.subBudget--;
        if (clone) {
            entry.origGeo = g;
            entry.cloneGeo = clone;
            m.geometry = clone;
            if (!state.subLogged) {
                state.subLogged = true;
                console.info(TAG, '✔ geometría del fluido subdividida (' +
                    g.attributes.position.count + ' → ' + clone.attributes.position.count + ' vértices) — olas de alta frecuencia activas');
            }
        } else {
            g.__mfSubFailed = true;
        }
    }

    // ── cortina de cáusticas (v10) ─────────────────────────────────────────
    // la sombra/luz del agua sobre el fondo: paredes verticales que cuelgan
    // de cada triángulo SUPERIOR del agua hacia abajo, dibujadas aditivas con
    // depth test contra el terreno → el patrón aterriza en el fondo y en
    // paredes sumergidas sin necesitar el depth texture del juego (clase
    // estática, inalcanzable — lección IterationT). El patrón es la MISMA
    // fiebre de viento de la superficie (parámetros idénticos) → las líneas
    // de luz viajan coherentes con las olas de arriba; ridge−base = luz y
    // sombra alternadas.
    const CURTAIN_DEPTH = 16;

    function buildCurtainGeometry(srcGeo) {
        try {
            const pos = srcGeo.attributes.position, nor = srcGeo.attributes.normal;
            if (!pos || !nor || typeof pos.getX !== 'function') return null;
            const light = srcGeo.attributes.light || null;
            const index = srcGeo.index;
            const triCount = Math.floor((index ? index.count : pos.count) / 3);
            if (!triCount || triCount > 40000) return null;

            const maxVerts = triCount * 18;   // 3 paredes × 6 vértices por tri
            const P = new Float32Array(maxVerts * 3);
            const L = new Float32Array(maxVerts * 3);
            const F = new Float32Array(maxVerts);
            let vi = 0;
            const V = (attr, t, i) => {
                const k = index ? index.getX(t * 3 + i) : t * 3 + i;
                return [attr.getX(k), attr.getY(k), attr.getZ(k)];
            };
            for (let t = 0; t < triCount; t++) {
                const a = V(pos, t, 0), b = V(pos, t, 1), c = V(pos, t, 2);
                const n = V(nor, t, 0);
                if (n[1] < 0.5) continue;      // solo caras superiores del agua
                const l0 = light ? V(light, t, 0) : [1, 0, 1];
                const l1 = light ? V(light, t, 1) : l0;
                const l2 = light ? V(light, t, 2) : l0;
                const al = [(l0[0] + l1[0] + l2[0]) / 3, (l0[1] + l1[1] + l2[1]) / 3, (l0[2] + l1[2] + l2[2]) / 3];
                for (const [p, q] of [[a, b], [b, c], [c, a]]) {
                    if (vi + 6 > maxVerts) break;
                    const pd = [p[0], p[1] - CURTAIN_DEPTH, p[2]];
                    const qd = [q[0], q[1] - CURTAIN_DEPTH, q[2]];
                    for (const [v, f] of [[p, 0], [q, 0], [qd, 1], [p, 0], [qd, 1], [pd, 1]]) {
                        P[vi * 3] = v[0]; P[vi * 3 + 1] = v[1]; P[vi * 3 + 2] = v[2];
                        L[vi * 3] = al[0]; L[vi * 3 + 1] = al[1]; L[vi * 3 + 2] = al[2];
                        F[vi] = f;
                        vi++;
                    }
                }
            }
            if (vi < 6) return null;
            const PA = pos.constructor;
            const geo = new srcGeo.constructor();
            geo.setAttribute('position', new PA(P.subarray(0, vi * 3), 3));
            geo.setAttribute('alight', new PA(L.subarray(0, vi * 3), 3));
            geo.setAttribute('afade', new PA(F.subarray(0, vi), 1));
            geo.computeBoundingSphere();
            return geo;
        } catch (_) {
            return null;
        }
    }

    const CURTAIN_NOISE = `
        uniform float uMfCauTime;
        uniform float uMfSun;
        uniform float uMfCaustics;
        varying vec3 vMfLight;
        varying float vMfFade;
        varying vec3 vMfWPos;
        float mfCHash(vec2 p) {
            p = 50.0 * fract(p * 0.3183099 + vec2(0.71, 0.113));
            return -1.0 + 2.0 * fract(p.x * p.y * (p.x + p.y));
        }
        float mfCNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(mfCHash(i), mfCHash(i + vec2(1.0, 0.0)), u.x),
                       mix(mfCHash(i + vec2(0.0, 1.0)), mfCHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
    `;

    const CURTAIN_EMISSIVE = `
        // la misma fiebre de viento que la superficie (parámetros idénticos a
        // mfWindWaves, uMfCauTime = time*0.12 como waveT) — ridges donde h
        // cruza cero; (ridge - base) da luz Y sombra con un solo pase aditivo
        vec2 mfcWind = vec2(0.8, 0.6);
        vec2 mfcWarp = vec2(
            mfCNoise(vMfWPos.xz * 0.35 + vec2( uMfCauTime * 0.28, -uMfCauTime * 0.24)),
            mfCNoise(vMfWPos.xz * 0.35 + vec2(-uMfCauTime * 0.26,  uMfCauTime * 0.30))
        ) * 0.9;
        vec2 mfcQ = (vMfWPos.xz + mfcWarp) * 0.45;
        float mfcH = mfCNoise(mfcQ - mfcWind * uMfCauTime * 0.75) * 0.72
                   + mfCNoise(mfcQ * 2.1 - mfcWind * uMfCauTime * 1.05 + 7.3) * 0.30;
        float mfcRidge = pow(max(1.0 - abs(mfcH * 1.35), 0.0), 3.0);
        float mfcFade = exp(-vMfFade * 2.6);
        float mfcSky = smoothstep(0.55, 0.9, vMfLight.x / 15.0);
        float mfcAmt = (mfcRidge - 0.22) * mfcFade * mfcSky * uMfSun * uMfCaustics;
        totalEmissiveRadiance = vec3(0.62, 0.95, 0.86) * mfcAmt;
    `;

    function buildCurtainMaterial(fluidMat) {
        const m = fluidMat.clone();
        // SIN marcador de fluido: el clon copia userData y el scan se
        // engancharía a sí mismo en bucle
        m.userData = {};
        try { m.color?.setRGB?.(0, 0, 0); } catch (_) {}
        try { m.emissive?.setRGB?.(0, 0, 0); } catch (_) {}
        try { m.map = null; } catch (_) {}
        m.vertexColors = false;
        m.transparent = true;
        m.blending = 2;          // AdditiveBlending (constante numérica, sin THREE)
        m.depthWrite = false;
        m.depthTest = true;      // el depth del terreno decide dónde aterriza
        m.side = 2;              // DoubleSide
        m.fog = false;           // fog aditivo = bruma gris sumada, no gracias
        const U = {
            uMfCauTime: { value: 0 },
            uMfSun: { value: 1 },
            uMfCaustics: { value: state.caustics }
        };
        m.onBeforeCompile = (shader) => {
            shader.uniforms.uMfCauTime = U.uMfCauTime;
            shader.uniforms.uMfSun = U.uMfSun;
            shader.uniforms.uMfCaustics = U.uMfCaustics;
            shader.vertexShader = 'attribute vec3 alight;\nattribute float afade;\nvarying vec3 vMfLight;\nvarying float vMfFade;\nvarying vec3 vMfWPos;\n' + shader.vertexShader;
            if (shader.vertexShader.includes('#include <begin_vertex>')) {
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
                    '#include <begin_vertex>\n        vMfLight = alight;\n        vMfFade = afade;\n        vMfWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
            }
            shader.fragmentShader = CURTAIN_NOISE + shader.fragmentShader;
            if (shader.fragmentShader.includes('vec3 totalEmissiveRadiance = emissive;')) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    'vec3 totalEmissiveRadiance = emissive;',
                    'vec3 totalEmissiveRadiance = vec3(0.0);\n    ' + CURTAIN_EMISSIVE);
            }
        };
        m.customProgramCacheKey = () => 'mf_curtain_v1';
        return { mat: m, U };
    }

    function disposeCurtain(entry) {
        if (!entry.curtain) return;
        try { entry.curtain.parent?.remove(entry.curtain); } catch (_) {}
        try { entry.curtain.geometry.dispose(); } catch (_) {}
        try { entry.curtain.material.dispose(); } catch (_) {}
        entry.curtain = null;
        entry.curtainU = null;
        entry.curtainSrc = null;
    }

    function maybeBuildCurtain(scene, m, entry) {
        const src = entry.origGeo || m.geometry;
        if (!src) return;
        if (entry.curtain && entry.curtainSrc === src) return;   // al día
        disposeCurtain(entry);
        const geo = buildCurtainGeometry(src);
        entry.curtainSrc = src;
        if (!geo) return;
        const { mat, U } = buildCurtainMaterial(m);
        let curtain = null;
        try { curtain = new m.constructor(geo, mat); } catch (_) {
            try { geo.dispose(); } catch (_) {}
            try { mat.dispose(); } catch (_) {}
            return;
        }
        curtain.renderOrder = -1;    // antes del agua: la superficie mezcla ENCIMA
        try {
            m.updateMatrixWorld?.(true);
            curtain.matrixAutoUpdate = false;
            curtain.matrix.copy(m.matrixWorld);
        } catch (_) {}
        scene.add(curtain);
        entry.curtain = curtain;
        entry.curtainU = U;
        if (!state.cauLogged) {
            state.cauLogged = true;
            console.info(TAG, '✔ cortina de cáusticas (' + geo.attributes.position.count + ' vértices) — luz y sombra de las olas en el fondo');
        }
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
        state.subBudget = 3;   // presupuesto por pasada: sin hitches al cargar océanos
        state.cauBudget = 2;
        try {
            scene.traverse((o) => {
                const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
                for (const m of mats) {
                    if (m?.userData && m.userData.waterShadersEnabled !== undefined) {
                        if (hookMaterial(m)) added++;
                        const entry = state.hooked.get(m);
                        if (entry) {
                            // el onChange del juego pone esto en 0 si su setting está
                            // apagado; la superficie viva es parte de nuestro look
                            m.userData.waterShadersEnabled.value = 1;
                            if (state.subdiv) maybeSubdivide(m, entry);
                            if (state.caustics > 0.001 && state.cauBudget > 0) {
                                state.cauBudget--;
                                maybeBuildCurtain(scene, m, entry);
                            }
                        }
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
            entry.liveUniforms.uMfAcrylic.value = state.acrylic;
            entry.liveUniforms.uMfWaveScale.value = state.waveScale;
            entry.liveUniforms.uMfChop.value = 0.35 * state.waveScale;
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
            // la cortina sigue el reloj y el sol del material del fluido
            if (entry.curtainU) {
                const ud = entry.mat?.userData;
                if (ud?.time) entry.curtainU.uMfCauTime.value = ud.time.value * 0.12;
                if (ud?.uSunLight) entry.curtainU.uMfSun.value = ud.uSunLight.value;
                entry.curtainU.uMfCaustics.value = state.caustics;
            }
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
        if (cfg && cfg.acrylic !== undefined) {
            const ac = parseFloat(cfg.acrylic);
            if (Number.isFinite(ac)) {
                state.acrylic = Math.max(0, Math.min(1, ac));
                localStorage.setItem('mf_waterstyle_acrylic', String(state.acrylic));
            }
        }
        if (cfg && cfg.caustics !== undefined) {
            const c = parseFloat(cfg.caustics);
            if (Number.isFinite(c)) {
                state.caustics = Math.max(0, Math.min(1, c));
                localStorage.setItem('mf_waterstyle_caustics', String(state.caustics));
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
            acrylic: state.acrylic,
            caustics: state.caustics,
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
