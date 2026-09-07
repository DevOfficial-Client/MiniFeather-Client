// MF PBR Textures — soporte PBR estilo OptiFine (_n normal, _s specular,
// _e emissive) sobre el atlas del terreno de miniblox.
//
// Arquitectura:
//   - TexturePackManager (ISOLATED) detecta los sufijos _n/_s/_e del zip y
//     reconstruye 3 atlases PBR con el MISMO layout de frames.json, los
//     guarda en IndexedDB (mf_pbr_store) y avisa con CustomEvent
//     'minifeather:pbr-update'.
//   - Este módulo (MAIN world) hookea los materiales del atlas de terreno
//     vía onBeforeCompile (patrón CustomShader) e inyecta:
//       * normal mapping con TBN por derivadas de pantalla (los chunks no
//         traen atributo tangent — técnica de normal_fragment_maps)
//       * specular Blinn-Phong contra las luces direccionales del juego,
//         acumulado en totalEmissiveRadiance (Lambert no suma
//         directSpecular en su outgoingLight, pero sí totalEmissiveRadiance)
//       * emissive aditivo sobre totalEmissiveRadiance
//     Se samplea con varying propio vMfPbrUv copiado del atributo uv —
//     inmune al rename vUv→vMapUv de three r151+ y a rotaciones de frames
//     (mismas UVs que el diffuse).
//   - El panel (ISOLATED) controla por CustomEvent 'minifeather:pbr-config'.
(function () {
    'use strict';

    const TAG = '[MiniFeather PBR]';
    const LS = {
        enabled: 'mf_pbr_enabled',
        normal: 'mf_pbr_normal',
        spec: 'mf_pbr_spec',
        shiny: 'mf_pbr_shiny',
        emissive: 'mf_pbr_emissive',
        available: 'mf_pbr_available'
    };
    const EVT_UPDATE = 'minifeather:pbr-update';
    const EVT_CONFIG = 'minifeather:pbr-config';

    // Materiales hookeables. Los sin pipeline de luces (Basic) o Lambert
    // vertex-lit (three < r155) reciben el fallback autocontenido.
    const LIGHT_MATERIALS = [
        'MeshLambertMaterial', 'MeshStandardMaterial',
        'MeshPhongMaterial', 'MeshToonMaterial', 'MeshBasicMaterial'
    ];

    const state = {
        enabled: false,
        kinds: { n: false, s: false, e: false },
        textures: { n: null, s: null, e: null },
        uniforms: null,
        hooked: new Map(),
        TexCtor: null,
        scanTimer: null,
        loading: null,
        webgl2: null,
        texFlipY: null,      // flipY del atlas del juego — convención capturada
        builtFlipY: null,    // flipY con el que se construyeron las texturas actuales
        atlasRetryDone: false,
        diagLogged: false
    };

    // ───────────────────── acceso al juego ─────────────────────

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

    function getScene(game) {
        return game?.gameScene?.scene
            || game?.scene?.scene
            || game?.gameScene
            || game?.scene
            || null;
    }

    function collectMeshes(root) {
        const out = [];
        if (!root) return out;
        const queue = [root];
        const seen = new Set();
        let visited = 0;
        while (queue.length && visited < 2500) {
            const obj = queue.shift();
            visited++;
            if (!obj || seen.has(obj)) continue;
            seen.add(obj);
            // Material único o array — con que UNO tenga .map, el mesh entra.
            const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : null);
            if (mats && mats.some(m => m && m.map)) out.push(obj);
            if (Array.isArray(obj.children)) {
                for (const k of obj.children) queue.push(k);
            }
        }
        return out;
    }

    // Log de diagnóstico (una sola vez) — qué materiales hay en escena con
    // atlas de terreno. Clave para depurar "PBR no hace nada".
    function diagScene() {
        if (state.diagLogged) return;
        const scene = getScene(findGame());
        if (!scene) return;
        const counts = {};
        let withMap = 0;
        for (const mesh of collectMeshes(scene)) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
                if (!m) continue;
                const t = m.type || m.constructor?.name || '?';
                counts[t] = (counts[t] || 0) + 1;
                if (m.map) withMap++;
            }
        }
        state.diagLogged = true;
        console.log(TAG, 'Escena — materiales:', counts, '| con .map:', withMap,
            '| flipY capturado:', state.texFlipY);
    }

    // Derivadas (dFdx/dFdy) son core en WebGL2 pero requieren extensión en
    // WebGL1 — el normal mapping por tangentes de pantalla solo se inyecta
    // si el juego corre WebGL2. El registro __MF_GL_CANVASES__ lo mantiene
    // TextureInterceptor (mismo mundo MAIN).
    function isWebGL2() {
        if (state.webgl2 !== null) return state.webgl2;
        state.webgl2 = false;
        try {
            for (const cv of (window.__MF_GL_CANVASES__ || [])) {
                if (cv && cv.isConnected && cv.getContext('webgl2')) {
                    state.webgl2 = true;
                    break;
                }
            }
            // Sin registro aún (arranque temprano): asumir WebGL2 (moderno)
            if (!(window.__MF_GL_CANVASES__ || []).length) state.webgl2 = true;
        } catch (_) {
            state.webgl2 = true;
        }
        return state.webgl2;
    }

    // ───────────────────── IndexedDB ─────────────────────
    // Mismo store que escribe TexturePackManager (mismo origen).

    function idbOpen() {
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open('mf_pbr_store', 1);
                req.onupgradeneeded = () => {
                    if (!req.result.objectStoreNames.contains('atlases')) {
                        req.result.createObjectStore('atlases');
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            } catch (_) { resolve(null); }
        });
    }

    function idbGet(key) {
        return idbOpen().then((db) => new Promise((resolve) => {
            if (!db) return resolve(null);
            try {
                const tx = db.transaction('atlases', 'readonly');
                const req = tx.objectStore('atlases').get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            } catch (_) { resolve(null); }
        }));
    }

    // ───────────────────── texturas ─────────────────────

    function loadImage(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    function grabTexCtor() {
        if (state.TexCtor) return state.TexCtor;
        // Robar la clase THREE.Texture desde cualquier material del juego
        // (misma técnica que CustomShader usa para Data3DTexture).
        const game = findGame();
        for (const mesh of collectMeshes(getScene(game))) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
                const map = m?.map;
                if (map && map.isTexture && map.constructor) {
                    state.TexCtor = map.constructor;
                    return state.TexCtor;
                }
            }
        }
        return null;
    }

    function makeTexture(img, srgb) {
        const TexCtor = grabTexCtor();
        if (!TexCtor) return null;
        try {
            const tex = new TexCtor(img);
            tex.magFilter = 1;  // NearestFilter — pixel-art
            tex.minFilter = 1;
            tex.generateMipmaps = false;
            if (srgb) tex.colorSpace = 'srgb';  // ignorado en three < r152
            // Mismo flipY que el atlas del terreno del juego: si difiere, las
            // UVs PBR caen en tiles equivocados (todo neutral → sin efecto).
            if (state.texFlipY !== null) tex.flipY = state.texFlipY;
            tex.needsUpdate = true;
            state.builtFlipY = tex.flipY;
            return tex;
        } catch (_) {
            return null;
        }
    }

    function makeDummy(kind) {
        const c = document.createElement('canvas');
        c.width = 1; c.height = 1;
        const ctx = c.getContext('2d');
        // Normal neutral: Z+ hacia el viewer (128,128,255). Resto: negro.
        ctx.fillStyle = kind === 'n' ? 'rgb(128,128,255)' : '#000000';
        ctx.fillRect(0, 0, 1, 1);
        return makeTexture(c, false);
    }

    async function loadAtlases() {
        if (state.loading) return state.loading;
        // Texturas ya construidas con un flipY distinto al capturado del
        // juego → descartarlas: muestrean tiles equivocados.
        const stale = state.builtFlipY !== null
            && state.texFlipY !== null
            && state.builtFlipY !== state.texFlipY;
        if (stale) {
            for (const kind of ['n', 's', 'e']) {
                state.textures[kind] = null;
                state.kinds[kind] = false;
            }
            state.builtFlipY = null;
        }
        state.loading = (async () => {
            let any = false;
            for (const kind of ['n', 's', 'e']) {
                state.textures[kind] = null;
                state.kinds[kind] = false;
                const rec = await idbGet('atlas_' + kind);
                if (rec && rec.dataUrl) {
                    const img = await loadImage(rec.dataUrl);
                    const tex = img ? makeTexture(img, kind === 'e') : null;
                    if (tex) {
                        state.textures[kind] = tex;
                        state.kinds[kind] = true;
                        any = true;
                    }
                }
            }
            try { localStorage.setItem(LS.available, any ? 'true' : 'false'); } catch (_) {}
            if (any) {
                console.log(TAG, 'Atlases PBR:', { ...state.kinds });
                if (state.uniforms) refreshUniformValues();
                if (state.enabled) scan();
            }
            return { ...state.kinds };
        })();
        const p = state.loading;
        p.finally(() => { state.loading = null; });
        return p;
    }

    // ───────────────────── uniforms compartidos ─────────────────────

    function num(key, def) {
        const v = parseFloat(localStorage.getItem(key));
        return isNaN(v) ? def : v;
    }

    function ensureUniforms() {
        if (state.uniforms) return state.uniforms;
        const dN = makeDummy('n');
        if (!dN) return null;  // juego aún sin texturas — reintentar luego
        state.uniforms = {
            uMfPbrN: { value: dN },
            uMfPbrS: { value: makeDummy('s') },
            uMfPbrE: { value: makeDummy('e') },
            uMfPbrNormalStr: { value: num(LS.normal, 1.0) },
            uMfPbrSpecStr: { value: num(LS.spec, 0.7) },
            uMfPbrShiny: { value: num(LS.shiny, 24.0) },
            uMfPbrEmiStr: { value: num(LS.emissive, 1.0) }
        };
        return state.uniforms;
    }

    function refreshUniformValues() {
        const u = state.uniforms;
        if (!u) return;
        if (state.kinds.n && state.textures.n) u.uMfPbrN.value = state.textures.n;
        if (state.kinds.s && state.textures.s) u.uMfPbrS.value = state.textures.s;
        if (state.kinds.e && state.textures.e) u.uMfPbrE.value = state.textures.e;
    }

    // Regenerar las texturas PBR con el flipY correcto recién capturado.
    function rebuildTextures() {
        loadAtlases().then(() => {
            refreshUniformValues();
            if (state.enabled) scan();
        });
    }

    // El juego puede tardar en crear el material del terreno. Mientras no
    // haya flipY capturado, reintentar hasta conseguirlo (máx ~20s).
    function ensureFlipYCaptured() {
        if (state.texFlipY !== null || state.atlasRetryDone) return;
        let tries = 0;
        const timer = setInterval(() => {
            tries++;
            if (state.texFlipY !== null || !state.enabled || tries > 20) {
                clearInterval(timer);
                if (tries > 20) state.atlasRetryDone = true;
                return;
            }
            scan();
        }, 1000);
    }

    // ───────────────────── GLSL ─────────────────────

    const FRAG_DECL = `
        uniform sampler2D uMfPbrN;
        uniform sampler2D uMfPbrS;
        uniform sampler2D uMfPbrE;
        uniform float uMfPbrNormalStr;
        uniform float uMfPbrSpecStr;
        uniform float uMfPbrShiny;
        uniform float uMfPbrEmiStr;
        varying vec2 vMfPbrUv;
        varying vec3 vMfPbrViewPos;
    `;

    const VERT_DECL = `
        varying vec2 vMfPbrUv;
        varying vec3 vMfPbrViewPos;
    `;

    // Copiado del atributo uv (declarado SIEMPRE en el prefix de three).
    // vMfPbrViewPos: posición en view space para el fallback — se calcula
    // manualmente porque begin_vertex aún no tiene mvPosition.
    const VERT_MAIN = `
        vMfPbrUv = uv;
        vMfPbrViewPos = (modelViewMatrix * vec4(transformed, 1.0)).xyz;
    `;

    // Normal: TBN por derivadas de pantalla — fórmula de getTangentFrame de
    // three.js (normal_fragment_maps). Se inyecta tras normal_fragment_begin.
    const FRAG_NORMAL = `
        {
            vec3 mfMapN = texture2D(uMfPbrN, vMfPbrUv).xyz * 2.0 - 1.0;
            mfMapN.xy *= uMfPbrNormalStr;
            mfMapN = normalize(mfMapN);
            vec3 mfN = normalize(normal);
            vec3 mfQ0 = dFdx(vViewPosition.xyz);
            vec3 mfQ1 = dFdy(vViewPosition.xyz);
            vec2 mfSt0 = dFdx(vMfPbrUv);
            vec2 mfSt1 = dFdy(vMfPbrUv);
            vec3 mfT = normalize(mfQ0 * mfSt1.t - mfQ1 * mfSt0.t);
            vec3 mfB = normalize(cross(mfN, mfT));
            normal = normalize(mat3(mfT, mfB, mfN) * mfMapN);
        }
    `;

    // Specular: Blinn-Phong con las luces direccionales del juego, sumado a
    // totalEmissiveRadiance (presente en Lambert/Standard/Phong/Toon —
    // Lambert no vuelca directSpecular en outgoingLight pero sí emissive).
    const FRAG_SPEC = `
        #if NUM_DIR_LIGHTS > 0
        {
            float mfS = texture2D(uMfPbrS, vMfPbrUv).r * uMfPbrSpecStr;
            if (mfS > 0.002) {
                vec3 mfV = normalize(vViewPosition);
                vec3 mfNn = normalize(normal);
                vec3 mfAcc = vec3(0.0);
                for (int l = 0; l < NUM_DIR_LIGHTS; l++) {
                    vec3 mfLD = normalize(directionalLights[l].direction);
                    vec3 mfHalf = normalize(mfLD + mfV);
                    float mfNdH = max(dot(mfNn, mfHalf), 0.0);
                    mfAcc += directionalLights[l].color * pow(mfNdH, uMfPbrShiny) * mfS;
                }
                totalEmissiveRadiance += mfAcc;
            }
        }
        #endif
    `;

    // Emissive: aditivo sobre totalEmissiveRadiance.
    const FRAG_EMISSIVE = `
        totalEmissiveRadiance += texture2D(uMfPbrE, vMfPbrUv).rgb * uMfPbrEmiStr;
    `;

    // Fallback autocontenido — para materiales SIN pipeline de luces por
    // fragmento (MeshBasicMaterial, o Lambert de three < r155 donde la luz
    // viene de vLightFront por vértice y perturbar `normal` no altera nada).
    // Relight relativo: la normal geométrica plana da factor 1.0 (color del
    // juego intacto) y solo el relieve del normal map crea contraste.
    // Se inyecta justo antes del cierre de main() (patrón CustomShader).
    // Piezas separadas: el emissive del anchor estándar podría aterrizar en
    // Lambert viejo — solo inyectar lo que falta.
    const FRAG_FALLBACK_NORMAL = `
        // Sin llaves: mfN queda en scope de main() — el bloque spec fallback
        // lo referencia.
        vec3 mfMapN = texture2D(uMfPbrN, vMfPbrUv).xyz * 2.0 - 1.0;
        mfMapN.xy *= uMfPbrNormalStr;
        mfMapN = normalize(mfMapN);
        // Normal geométrica y TBN por derivadas de pantalla (view space)
        vec3 mfQ0 = dFdx(vMfPbrViewPos);
        vec3 mfQ1 = dFdy(vMfPbrViewPos);
        vec2 mfSt0 = dFdx(vMfPbrUv);
        vec2 mfSt1 = dFdy(vMfPbrUv);
        vec3 mfNg = normalize(cross(mfQ0, mfQ1));
        if (!gl_FrontFacing) mfNg = -mfNg;
        vec3 mfT = normalize(mfQ0 * mfSt1.t - mfQ1 * mfSt0.t);
        vec3 mfB = normalize(cross(mfNg, mfT));
        vec3 mfN = normalize(mat3(mfT, mfB, mfNg) * mfMapN);
        // Sol estimado (view space) — arriba, ligeramente hacia el viewer
        vec3 mfSun = normalize(vec3(0.35, 0.9, 0.25));
        // Relight relativo: cara plana → 1.0, bumps → contraste
        float mfDiffG = max(dot(mfNg, mfSun), 0.0) + 0.22;
        float mfDiffN = max(dot(mfN, mfSun), 0.0) + 0.22;
        gl_FragColor.rgb *= clamp(mfDiffN / max(mfDiffG, 0.05), 0.5, 1.8);
        // Rim suave para que el relieve se lea en bordes
        vec3 mfV = normalize(-vMfPbrViewPos);
        float mfRim = pow(1.0 - max(dot(mfN, mfV), 0.0), 3.0);
        gl_FragColor.rgb += gl_FragColor.rgb * mfRim * 0.30 * uMfPbrNormalStr;
    `;

    const FRAG_FALLBACK_SPEC = `
        {
            // Specular Blinn-Phong contra el sol estimado. MF_FB_N se
            // sustituye por la normal del bloque normal si existe, o una
            // plana mirando al viewer si no (evita dFdx en WebGL1).
            vec3 mfSun2 = normalize(vec3(0.35, 0.9, 0.25));
            vec3 mfV2 = normalize(-vMfPbrViewPos);
            float mfS = texture2D(uMfPbrS, vMfPbrUv).r * uMfPbrSpecStr;
            if (mfS > 0.002) {
                vec3 mfHalf2 = normalize(mfSun2 + mfV2);
                float mfNdH2 = max(dot(MF_FB_N, mfHalf2), 0.0);
                gl_FragColor.rgb += vec3(pow(mfNdH2, uMfPbrShiny)) * mfS;
            }
        }
    `;

    // Fallback emissive (solo si el anchor estándar no aterrizó).
    const FRAG_FALLBACK_EMISSIVE = `
        gl_FragColor.rgb += texture2D(uMfPbrE, vMfPbrUv).rgb * uMfPbrEmiStr;
    `;

    // ───────────────────── hook de material ─────────────────────

    function anchorFrag(frag, includeName, code) {
        const anchor = '#include <' + includeName + '>';
        if (!frag.includes(anchor)) return frag;
        return frag.replace(anchor, anchor + '\n' + code);
    }

    function hookMaterial(material) {
        if (state.hooked.has(material)) return false;
        const matType = material.type || material.constructor?.name || '';
        if (!LIGHT_MATERIALS.includes(matType)) return false;
        if (typeof material.onBeforeCompile !== 'function') return false;
        if (!material.map || !material.map.isTexture) return false;

        // Capturar flipY real del atlas del juego (convención de carga que
        // usa el motor). Si difiere del default true, las UVs de nuestro
        // atlas PBR deben seguir la misma convención.
        try {
            const fy = material.map.flipY;
            if (fy !== state.texFlipY) {
                const hadTextures = state.builtFlipY !== null;
                state.texFlipY = fy;
                // Primera captura con texturas ya construidas con otra
                // convención, o cambio posterior → regenerar.
                if (hadTextures && state.builtFlipY !== fy) rebuildTextures();
            }
        } catch (_) {}

        // Desenredar sesión previa (recarga de extensión sin F5)
        if (material.__mfPbrHooked) {
            material.onBeforeCompile = material.__mfPbrOriginalOnBeforeCompile || material.onBeforeCompile;
            if (material.__mfPbrOriginalCacheKey !== undefined) {
                material.customProgramCacheKey = material.__mfPbrOriginalCacheKey;
            }
            delete material.__mfPbrHooked;
        }

        const originalOnBeforeCompile = material.onBeforeCompile.bind(material);
        const originalCacheKey = material.customProgramCacheKey;
        const useNormal = isWebGL2();

        material.onBeforeCompile = function (shader) {
            originalOnBeforeCompile(shader);

            if (shader.fragmentShader.includes('uMfPbrN')) return; // ya inyectado

            const u = ensureUniforms();
            if (!u) return;
            for (const key in u) shader.uniforms[key] = u[key];

            let frag = FRAG_DECL + '\n' + shader.fragmentShader;

            // 1) ¿El shader tiene pipeline de luces por fragmento? Se decide
            // por el include ANTES de inyectar. Lambert de three < r155 es
            // vertex-lit (vLightFront): no tiene este include y además no
            // declara vViewPosition en el fragment — ahí los anchors
            // estándar compilarían con error o no harían nada.
            const litPerFragment = frag.includes('#include <lights_fragment_begin>');

            // 2) Anchors estándar — SOLO con pipeline de luces por fragmento.
            if (litPerFragment) {
                frag = anchorFrag(frag, 'lights_fragment_begin', FRAG_SPEC);
                if (useNormal) {
                    frag = anchorFrag(frag, 'normal_fragment_begin', FRAG_NORMAL);
                }
            }
            frag = frag.replace(
                'vec3 totalEmissiveRadiance = emissive;',
                'vec3 totalEmissiveRadiance = emissive;\n' + FRAG_EMISSIVE
            );

            // 3) Fallback autocontenido para lo que no aterrizó (Basic,
            // Lambert vertex-lit): relight relativo + rim + spec + emissive
            // sobre gl_FragColor, antes del tone mapping.
            const okN = !useNormal || litPerFragment;
            const okS = litPerFragment;
            const okE = frag.includes('uMfPbrE, vMfPbrUv');
            if (!(okN && okS && okE)) {
                let fb = '';
                if (!okN) fb += FRAG_FALLBACK_NORMAL;
                if (!okS) {
                    // Si hay bloque normal, usar su mfN; si no, normal plana
                    // al viewer (evita dFdx en WebGL1).
                    fb += FRAG_FALLBACK_SPEC.replace(/MF_FB_N/g, !okN ? 'mfN' : 'mfV2');
                }
                if (!okE) fb += FRAG_FALLBACK_EMISSIVE;
                if (fb) {
                    const anchorTm = '#include <tonemapping_fragment>';
                    const at = frag.includes(anchorTm) ? frag.indexOf(anchorTm) : frag.lastIndexOf('}');
                    if (at > 0) {
                        frag = frag.slice(0, at) + fb + '\n' + frag.slice(at);
                    }
                    console.warn(TAG, 'Anchors estándar NO aplicados en', matType,
                        { normal: okN, spec: okS, emissive: okE }, '— usando fallback');
                }
            }
            shader.fragmentShader = frag;

            // Vertex: declarar varying y copiar uv
            if (!shader.vertexShader.includes('vMfPbrUv')) {
                shader.vertexShader = VERT_DECL + '\n' + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    '#include <begin_vertex>\n' + VERT_MAIN
                );
            }
        };

        material.customProgramCacheKey = function () {
            const base = originalCacheKey ? originalCacheKey.call(material) : '';
            return 'mfpbr_v2_' + (useNormal ? 'n' : '-') + base;
        };

        material.needsUpdate = true;
        // Marcas para desenredar sesiones futuras (recarga sin F5)
        material.__mfPbrHooked = true;
        material.__mfPbrOriginalOnBeforeCompile = originalOnBeforeCompile;
        material.__mfPbrOriginalCacheKey = originalCacheKey;
        state.hooked.set(material, { originalOnBeforeCompile, originalCacheKey });
        return true;
    }

    function unhookAll() {
        for (const [material, entry] of state.hooked) {
            material.onBeforeCompile = entry.originalOnBeforeCompile;
            if (entry.originalCacheKey !== undefined) {
                material.customProgramCacheKey = entry.originalCacheKey;
            }
            material.needsUpdate = true;
        }
        state.hooked.clear();
    }

    // ───────────────────── escaneo ─────────────────────

    function scan() {
        const scene = getScene(findGame());
        if (!scene) return 0;
        let added = 0;
        for (const mesh of collectMeshes(scene)) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
                if (m && hookMaterial(m)) added++;
            }
        }
        return added;
    }

    function startScanLoop() {
        if (state.scanTimer) return;
        state.scanTimer = setInterval(() => {
            if (state.enabled) scan();
        }, 4000);
    }

    // ───────────────────── API pública ─────────────────────

    function enable() {
        state.enabled = true;
        try { localStorage.setItem(LS.enabled, 'true'); } catch (_) {}
        loadAtlases().then(() => {
            ensureUniforms();
            refreshUniformValues();
            scan();
            diagScene();
            ensureFlipYCaptured();
            startScanLoop();
            console.log(TAG, 'PBR activo:', { ...state.kinds });
        });
    }

    function disable() {
        state.enabled = false;
        try { localStorage.setItem(LS.enabled, 'false'); } catch (_) {}
        unhookAll();
        if (state.scanTimer) {
            clearInterval(state.scanTimer);
            state.scanTimer = null;
        }
        console.log(TAG, 'PBR desactivado');
    }

    function setStrength(kind, value) {
        const u = ensureUniforms();
        if (!u) return;
        const v = Number(value) || 0;
        if (kind === 'normal') u.uMfPbrNormalStr.value = v;
        else if (kind === 'spec') u.uMfPbrSpecStr.value = v;
        else if (kind === 'shiny') u.uMfPbrShiny.value = v;
        else if (kind === 'emissive') u.uMfPbrEmiStr.value = v;
        try { localStorage.setItem(LS[kind] || kind, String(v)); } catch (_) {}
    }

    function status() {
        return {
            enabled: state.enabled,
            kinds: { ...state.kinds },
            hooked: state.hooked.size
        };
    }

    // CustomEvent desde TexturePackManager (ISOLATED) → recargar atlases.
    // IMPORTANTE: escuchar en `document`, no en `window` — el panel despacha
    // con document.dispatchEvent y CustomEvent sin bubbles (default false)
    // NO propaga a window. El DOM es compartido entre mundos MAIN/ISOLATED,
    // así que document sí recibe el evento desde el panel.
    document.addEventListener(EVT_UPDATE, () => {
        loadAtlases().then(() => {
            if (state.enabled) {
                refreshUniformValues();
                scan();
            }
        });
    });

    // CustomEvent desde el panel (ISOLATED) → enable/disable/strength
    document.addEventListener(EVT_CONFIG, (ev) => {
        try {
            const cfg = JSON.parse(ev.detail || '{}');
            if (cfg.enabled === true) enable();
            else if (cfg.enabled === false) disable();
            if (cfg.normal !== undefined) setStrength('normal', cfg.normal);
            if (cfg.spec !== undefined) setStrength('spec', cfg.spec);
            if (cfg.shiny !== undefined) setStrength('shiny', cfg.shiny);
            if (cfg.emissive !== undefined) setStrength('emissive', cfg.emissive);
        } catch (_) {}
    });

    // Arranque: el panel (ISOLATED) envía 'pbr-config' con el settings
    // persistido (experimentalPbr) en applyGuiSettings() — única fuente de
    // verdad del estado enabled.

    window.MF_PBR = { enable, disable, setStrength, status, refresh: loadAtlases };
})();