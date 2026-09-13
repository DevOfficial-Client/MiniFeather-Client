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
    const EVT_REINSTALL = 'minifeather:pbr-reinstall';

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
        texSettings: null,   // filtros del atlas del juego — copiados al hookear
        atlasRetryDone: false,
        reinstallCount: 0,   // anti-loop: reinstalaciones auto-disparadas en esta página
        diagLogged: false,
        lastFrag: null,      // último fragment shader generado (debug)
        lastVert: null,      // último vertex shader generado (debug)
        lastGameUv: null     // varying con la que el juego samplea su diffuse
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

    // Log de diagnóstico (una sola vez) — materiales y LUCES de la escena.
    // Clave para depurar "PBR no hace nada": si directional=0, el juego usa
    // iluminación custom y los anchors estándar no producen efecto.
    function diagScene() {
        if (state.diagLogged) return;
        const scene = getScene(findGame());
        if (!scene) return;
        const lights = countLights() || { directional: 0, ambient: 0, hemisphere: 0, point: 0, spot: 0, otro: 0 };
        const counts = {};
        let withMap = 0;
        const queue = [scene];
        const seen = new Set();
        let visited = 0;
        while (queue.length && visited < 3000) {
            const obj = queue.shift();
            visited++;
            if (!obj || seen.has(obj)) continue;
            seen.add(obj);
            if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (const m of mats) {
                    if (!m) continue;
                    const t = m.type || m.constructor?.name || '?';
                    counts[t] = (counts[t] || 0) + 1;
                    if (m.map) withMap++;
                }
            }
            if (Array.isArray(obj.children)) {
                for (const k of obj.children) queue.push(k);
            }
        }
        state.diagLogged = true;
        console.log(TAG, 'Escena — materiales:', counts, '| luces:', lights,
            '| con .map:', withMap, '| flipY capturado:', state.texFlipY);
        if (lights.directional === 0) {
            console.warn(TAG, 'CERO luces direccionales de three.js — el juego',
                'ilumina con luz custom (ambient/AO). El relight fallback con',
                'sol estimado se activará vía #if NUM_DIR_LIGHTS == 0.');
        }
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

    function idbDelete(key) {
        return idbOpen().then((db) => new Promise((resolve) => {
            if (!db) return resolve(false);
            try {
                const tx = db.transaction('atlases', 'readwrite');
                tx.objectStore('atlases').delete(key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (_) { resolve(false); }
        }));
    }

    // ¿El dataUrl del atlas es TODO neutro? Fallback para registros viejos
    // SIN el campo `placed`. Muestreo a RESOLUCIÓN COMPLETA (reducir el
    // canvas diluye tiles de 16px y da falsos "vacío") con stride.
    function atlasLooksEmpty(dataUrl, kind) {
        return loadImage(dataUrl).then((img) => {
            if (!img || !img.width) return true;
            const w = img.width, h = img.height;
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);  // mismo tamaño → sin pérdida
            let data;
            try { data = ctx.getImageData(0, 0, w, h).data; }
            catch (_) { return false; }  // sin datos → no concluir
            let other = 0, total = 0;
            const stride = Math.max(1, Math.floor((w * h) / 50000));
            for (let p = 0; p < data.length; p += 4 * stride) {
                total++;
                const r = data[p], g = data[p + 1], b = data[p + 2];
                if (kind === 'n') {
                    if (!(Math.abs(r - 128) <= 8 && Math.abs(g - 128) <= 8 && Math.abs(b - 255) <= 8)) other++;
                } else {
                    if (r > 10 || g > 10 || b > 10) other++;
                }
            }
            // Umbral 0.05%: un atlas válido con solo 8 tiles 16x16 da ~0.2%;
            // un relicto que pintó 0 tiles da exactamente 0%.
            return total > 0 && (other / total) < 0.0005;
        });
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
            // Filtros: copiar del atlas diffuse del juego para que el PBR
            // se filtre igual que la textura visible (coherencia de píxel).
            const ts = state.texSettings;
            if (ts) {
                if (ts.magFilter !== null && ts.magFilter !== undefined) tex.magFilter = ts.magFilter;
                if (ts.minFilter !== null && ts.minFilter !== undefined) tex.minFilter = ts.minFilter;
                if (ts.wrapS !== null && ts.wrapS !== undefined) tex.wrapS = ts.wrapS;
                if (ts.wrapT !== null && ts.wrapT !== undefined) tex.wrapT = ts.wrapT;
                tex.generateMipmaps = !!ts.generateMipmaps;
                if (ts.anisotropy) tex.anisotropy = ts.anisotropy;
            }
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
            let emptiedKinds = [];
            for (const kind of ['n', 's', 'e']) {
                state.textures[kind] = null;
                state.kinds[kind] = false;
                const rec = await idbGet('atlas_' + kind);
                if (rec && rec.dataUrl) {
                    // Auto-curación: analizar los PÍXELES REALES del atlas
                    // cargado (no confiar en `placed` — un bug del generador
                    // puede contar tiles que no quedaron pintados, ej:
                    // PNGs 128px dibujados con globalCompositeOperation raro
                    // o tinte transparente → canvas vacío con placed=35).
                    // `placed` queda solo como señal secundaria.
                    let empty;
                    if (typeof rec.placed === 'number' && rec.placed <= 0) {
                        empty = true;
                    } else {
                        empty = await atlasLooksEmpty(rec.dataUrl, kind);
                    }
                    if (empty) {
                        console.warn(TAG, `Atlas '${kind}' VACÍO (todo neutro) —`,
                            'borrando relicto y pidiendo regeneración',
                            '(placed decía:', rec.placed, ')');
                        await idbDelete('atlas_' + kind);
                        emptiedKinds.push(kind);
                        continue;
                    }
                    const img = await loadImage(rec.dataUrl);
                    const tex = img ? makeTexture(img, kind === 'e') : null;
                    if (tex) {
                        state.textures[kind] = tex;
                        state.kinds[kind] = true;
                        any = true;
                    }
                }
            }
            // Un solo kind borrado ya dispara la reinstalación completa (el
            // generador regenera los tres juntos). También si FALTA alguno.
            // ANTI-LOOP: máximo 3 reintentos por sesión de página — sin esto,
            // un falso positivo del check vacío dispara generate→update→
            // delete→generate... infinito (y con dispatch doble, exponencial).
            // EXCEPCIÓN: mf_pbr_manual=1 (MF_PbrEditor guardó un pack a
            // mano) — la reinstalación lo PISARÍA. Se limpia al instalar
            // un preset o al borrar los maps.
            const missing = ['n', 's', 'e'].filter(k => !state.kinds[k]);
            const reinstallKinds = [...new Set([...emptiedKinds, ...missing])];
            let manual = false;
            try { manual = localStorage.getItem('mf_pbr_manual') === '1'; } catch (_) {}
            if (reinstallKinds.length && state.reinstallCount < 3 && !manual) {
                state.reinstallCount++;
                try { localStorage.setItem(LS.available, 'false'); } catch (_) {}
                try {
                    document.dispatchEvent(new CustomEvent(EVT_REINSTALL, {
                        detail: JSON.stringify({ kinds: reinstallKinds })
                    }));
                } catch (_) {}
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
            uMfPbrNormalStr: { value: num(LS.normal, 1.5) },
            uMfPbrSpecStr: { value: num(LS.spec, 0.7) },
            uMfPbrShiny: { value: num(LS.shiny, 24.0) },
            uMfPbrEmiStr: { value: num(LS.emissive, 1.0) },
            uMfPbrTint: { value: 0.0 },
            uMfPbrDebug: { value: 0 }
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

    // NOTA UVs: el terreno del juego NO muestrea el atlas con `uv` crudo —
    // su fragment declara `centroid varying vec2 vCentroidMapUv` (UV con
    // transformación por cara + animación de frames) y samplea
    // `texture2D(map, vCentroidMapUv + offset)`. Muestrear PBR con `uv`
    // crudo cae en tiles EQUIVOCADOS → casi siempre neutro → sin relieve.
    // Solución: macro MF_PBR_UV — se define como vCentroidMapUv cuando el
    // shader del juego la declara (detectado por shader en runtime), y como
    // nuestro varying vMfPbrUv (=uv) en el resto de materiales.
    // FRAG_DECL se construye dinámicamente en hookMaterial.
    const FRAG_UNIFORMS_DECL = `
        uniform sampler2D uMfPbrN;
        uniform sampler2D uMfPbrS;
        uniform sampler2D uMfPbrE;
        uniform float uMfPbrNormalStr;
        uniform float uMfPbrSpecStr;
        uniform float uMfPbrShiny;
        uniform float uMfPbrEmiStr;
        uniform float uMfPbrTint;
        uniform float uMfPbrDebug;
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

    // TBN por derivadas de pantalla — fórmula de getTangentFrame de
    // three.js (normal_fragment_maps). VERIFICADO EN VIVO: el Lambert del
    // juego NO declara vViewPosition en el fragment (error GLSL → shader
    // entero muerto) → usar nuestro propio varying vMfPbrViewPos.
    // Inyectado tras normal_fragment_begin (donde `normal` ya está declarada).
    const FRAG_NORMAL = `
        {
            vec3 mfMapN = texture2D(uMfPbrN, MF_PBR_UV).xyz * 2.0 - 1.0;
            mfMapN.xy *= uMfPbrNormalStr;
            mfMapN = normalize(mfMapN);
            vec3 mfN = normalize(normal);
            vec3 mfQ0 = dFdx(vMfPbrViewPos);
            vec3 mfQ1 = dFdy(vMfPbrViewPos);
            vec2 mfSt0 = dFdx(MF_PBR_UV);
            vec2 mfSt1 = dFdy(MF_PBR_UV);
            vec3 mfT = normalize(mfQ0 * mfSt1.t - mfQ1 * mfSt0.t);
            vec3 mfB = normalize(cross(mfN, mfT));
            normal = normalize(mat3(mfT, mfB, mfN) * mfMapN);
        }
    `;

    // Specular: Blinn-Phong con las luces direccionales del juego, sumado a
    // totalEmissiveRadiance (presente en Lambert/Standard/Phong/Toon —
    // Lambert no vuelca directSpecular en outgoingLight pero sí emissive).
    // vMfPbrViewPos en vez de vViewPosition (verificado: no existe aquí).
    const FRAG_SPEC = `
        #if NUM_DIR_LIGHTS > 0
        {
            float mfS = texture2D(uMfPbrS, MF_PBR_UV).r * uMfPbrSpecStr;
            if (mfS > 0.002) {
                vec3 mfV = normalize(vMfPbrViewPos);
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
        totalEmissiveRadiance += texture2D(uMfPbrE, MF_PBR_UV).rgb * uMfPbrEmiStr;
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
        vec3 mfMapN = texture2D(uMfPbrN, MF_PBR_UV).xyz * 2.0 - 1.0;
        mfMapN.xy *= uMfPbrNormalStr;
        mfMapN = normalize(mfMapN);
        // Normal geométrica y TBN por derivadas de pantalla (view space)
        vec3 mfQ0 = dFdx(vMfPbrViewPos);
        vec3 mfQ1 = dFdy(vMfPbrViewPos);
        vec2 mfSt0 = dFdx(MF_PBR_UV);
        vec2 mfSt1 = dFdy(MF_PBR_UV);
        vec3 mfNg = normalize(cross(mfQ0, mfQ1));
        if (!gl_FrontFacing) mfNg = -mfNg;
        vec3 mfT = normalize(mfQ0 * mfSt1.t - mfQ1 * mfSt0.t);
        vec3 mfB = normalize(cross(mfNg, mfT));
        vec3 mfN = normalize(mat3(mfT, mfB, mfNg) * mfMapN);
        // Sol estimado (view space) — arriba, ligeramente hacia el viewer
        vec3 mfSun = normalize(vec3(0.35, 0.9, 0.25));
        // Relight relativo: cara plana → 1.0. El relieve del normal map
        // crea el contraste; clamp suave para no romper colores del juego.
        // (mfDiffG/mfDiffN siguen declaradas: el modo debug 3 las reporta)
        float mfDiffG = max(dot(mfNg, mfSun), 0.0) + 0.22;
        float mfDiffN = max(dot(mfN, mfSun), 0.0) + 0.22;
        gl_FragColor.rgb *= clamp(mfDiffN / max(mfDiffG, 0.05), 0.5, 1.8);
        // Rim suave para que el relieve se lea en bordes
        vec3 mfV = normalize(-vMfPbrViewPos);
        float mfRim = pow(1.0 - max(dot(mfN, mfV), 0.0), 3.0);
        gl_FragColor.rgb += gl_FragColor.rgb * mfRim * 0.30 * uMfPbrNormalStr;
    `;

    // Specular fallback — variante con la mfN del bloque normal (misma
    // rama del #if, declarada justo antes).
    const FRAG_FALLBACK_SPEC_MFN = `
        {
            vec3 mfSun2 = normalize(vec3(0.35, 0.9, 0.25));
            vec3 mfV2 = normalize(-vMfPbrViewPos);
            float mfS = texture2D(uMfPbrS, MF_PBR_UV).r * uMfPbrSpecStr;
            if (mfS > 0.002) {
                vec3 mfHalf2 = normalize(mfSun2 + mfV2);
                float mfNdH2 = max(dot(mfN, mfHalf2), 0.0);
                gl_FragColor.rgb += vec3(pow(mfNdH2, uMfPbrShiny)) * mfS;
            }
        }
    `;

    // Specular fallback plano (WebGL1, sin dFdx): media normal al viewer.
    const FRAG_FALLBACK_SPEC_FLAT = `
        {
            vec3 mfSun3 = normalize(vec3(0.35, 0.9, 0.25));
            vec3 mfV3 = normalize(-vMfPbrViewPos);
            float mfS3 = texture2D(uMfPbrS, MF_PBR_UV).r * uMfPbrSpecStr;
            if (mfS3 > 0.002) {
                vec3 mfHalf3 = normalize(mfSun3 + mfV3);
                float mfNdH3 = max(dot(normalize(mfV3), mfHalf3), 0.0);
                gl_FragColor.rgb += vec3(pow(mfNdH3, uMfPbrShiny)) * mfS3;
            }
        }
    `;

    // Fallback emissive (solo si el anchor estándar no aterrizó).
    const FRAG_FALLBACK_EMISSIVE = `
        gl_FragColor.rgb += texture2D(uMfPbrE, MF_PBR_UV).rgb * uMfPbrEmiStr;
    `;

    // ───────────────────── hook de material ─────────────────────

    function anchorFrag(frag, includeName, code) {
        const anchor = '#include <' + includeName + '>';
        if (!frag.includes(anchor)) return frag;
        return frag.replace(anchor, anchor + '\n' + code);
    }

    function hookMaterial(material) {
        if (state.hooked.has(material)) {
            // ── AUTO-CURACIÓN de cadena rota por CustomShader ──
            // Cuando CustomShader cambia de preset hace unhookAll() y
            // restaura SU "original" guardado — que puede ser el juego
            // puro (si CS hookeó antes que nosotros en algún momento).
            // Eso destruye nuestro wrapper, pero nuestra marca y el
            // registro siguen mintiendo "estoy hookeado" → nunca nos
            // re-armaríamos. VERIFICACIÓN REAL: nuestro wrapper contiene
            // el literal 'uMfPbrN' (guard de doble inyección) en su
            // propio código fuente. Si la cadena viva no lo tiene,
            // estamos fuera → re-hookear de cero sobre la cadena actual.
            let chainHasPbr = false;
            try {
                chainHasPbr = String(material.onBeforeCompile).includes('uMfPbrN');
            } catch (_) { chainHasPbr = false; }
            if (chainHasPbr) return false;
            state.hooked.delete(material);  // cadena rota → re-armar
            // La marca y su original guardado son de la cadena MUERTA:
            // restaurarlos destruiría el wrapper nuevo de CustomShader.
            // La cadena actual (CS nuevo o juego) es la base correcta.
            delete material.__mfPbrHooked;
            delete material.__mfPbrOriginalOnBeforeCompile;
            delete material.__mfPbrOriginalCacheKey;
        }
        const matType = material.type || material.constructor?.name || '';
        if (!LIGHT_MATERIALS.includes(matType)) return false;
        if (typeof material.onBeforeCompile !== 'function') return false;
        if (!material.map || !material.map.isTexture) return false;

        // Capturar flipY y filtros reales del atlas del juego (convención de
        // carga que usa el motor). Si difieren, las UVs PBR caen en tiles
        // equivocados y los filtros rompen el sampling (textura negra).
        try {
            const fy = material.map.flipY;
            const map = material.map;
            const ts = {
                magFilter: map.magFilter,
                minFilter: map.minFilter,
                wrapS: map.wrapS,
                wrapT: map.wrapT,
                generateMipmaps: map.generateMipmaps,
                anisotropy: map.anisotropy
            };
            if (fy !== state.texFlipY) {
                const hadTextures = state.builtFlipY !== null;
                state.texFlipY = fy;
                // Primera captura con texturas ya construidas con otra
                // convención, o cambio posterior → regenerar.
                if (hadTextures && state.builtFlipY !== fy) rebuildTextures();
            }
            const tsChanged = JSON.stringify(ts) !== JSON.stringify(state.texSettings);
            if (tsChanged) {
                const hadTextures = state.builtFlipY !== null;
                state.texSettings = ts;
                // Primera captura con texturas ya construidas con otros
                // filtros, o cambio posterior → regenerar.
                if (hadTextures) rebuildTextures();
            }
        } catch (_) {}

        // Desenredar sesión previa (recarga de extensión sin F5).
        // El wrapper viejo tiene __mfPbrKill: apagarlo (neutralización)
        // en vez de restaurar su original — el onBeforeCompile ACTUAL
        // puede contener el wrapper de CustomShader de otra sesión viva.
        if (material.__mfPbrHooked) {
            if (typeof material.onBeforeCompile?.__mfPbrKill === 'function') {
                material.onBeforeCompile.__mfPbrKill();
            } else {
                material.onBeforeCompile = material.__mfPbrOriginalOnBeforeCompile || material.onBeforeCompile;
            }
            if (material.__mfPbrOriginalCacheKey !== undefined) {
                material.customProgramCacheKey = material.__mfPbrOriginalCacheKey;
            }
            delete material.__mfPbrHooked;
        }

        const originalOnBeforeCompile = material.onBeforeCompile.bind(material);
        const originalCacheKey = material.customProgramCacheKey;
        const useNormal = isWebGL2();

        // Neutralización: este flag vive en el closure del wrapper. Al
        // deshookear NO restauramos onBeforeCompile (destruiría wrappers
        // de otros módulos que nos envuelven, ej: CustomShader) — el
        // wrapper queda en la cadena pero pasa por el original sin
        // inyectar nada.
        let pbrAlive = true;

        const wrapper = function (shader) {
            originalOnBeforeCompile(shader);
            if (!pbrAlive) return; // desmontado: passthrough limpio
            if (shader.fragmentShader.includes('uMfPbrN')) return; // ya inyectado

            const u = ensureUniforms();
            if (!u) return;
            for (const key in u) shader.uniforms[key] = u[key];

            // DECL dinámico: detectar la varying con la que el JUEGO
            // samplea su DIFFUSE y usar ESA para PBR. El shader del
            // terreno tiene VARIOS samplers de `map` (overlay primero);
            // el primero puede ser el layer overlay (transparente → negro
            // en debug), no el diffuse. Jerarquía:
            //   1) vCentroidMapUv si aparece entre los samplers (la UV
            //      real del diffuse del terreno, con transform por cara)
            //   2) primer sampler que NO sea un nombre de overlay
            //   3) primer sampler
            // GUARD: solo varyings GLOBALES (`varying vec2 X;` o
            // `varying centroid vec2 X;`). Variables locales (ej: waveUv
            // del agua, declarada dentro de main) no pueden usarse en
            // nuestros anchors (van arriba de main) → no compila.
            let gameUvExpr = '';
            const candidates = [...shader.fragmentShader.matchAll(
                /texture2D\s*\(\s*map\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1]);
            const isGlobalVarying = (name) => new RegExp(
                'varying(?:\\s+centroid)?\\s+vec2\\s+' + name + '\\s*;').test(shader.fragmentShader);
            const pick = candidates.find(v => v === 'vCentroidMapUv')
                || candidates.find(v => v !== 'uv' && !/overlay/i.test(v) && isGlobalVarying(v))
                || candidates.find(v => v !== 'uv' && isGlobalVarying(v));
            gameUvExpr = pick || '';
            if (gameUvExpr && gameUvExpr !== state.lastGameUv) {
                console.log(TAG, 'PBR UV alineada a', gameUvExpr,
                    '(samplers candidatos:', candidates.join(',') || 'ninguno', ')');
                state.lastGameUv = gameUvExpr;
            }
            // VERT_DECL (varyings) va SIEMPRE en el fragment: vMfPbrViewPos
            // lo usan el TBN y el specular; vMfPbrUv queda sin usar con la
            // UV del juego, pero debe existir en ambos stages para el linker.
            const decl = FRAG_UNIFORMS_DECL + VERT_DECL
                + (gameUvExpr ? '#define MF_PBR_UV ' + gameUvExpr + '\n'
                              : '#define MF_PBR_UV vMfPbrUv\n')
                + '\n';
            let frag = decl + shader.fragmentShader;

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

            // 3) Relight relativo INCONDICIONAL sobre gl_FragColor.
            //
            // VERIFICADO EN VIVO (Puppeteer + shader del terreno real): el
            // juego ilumina el terreno con luz voxel por vértice (vLight)
            // multiplicada sobre gl_FragColor DESPUÉS del tonemapping:
            //   brightness = (uAmbient + (1-uAmbient)*max(vLight.x*uSunLight,
            //                  vLight.y)) * vLight.z;
            //   gl_FragColor.rgb *= brightness;
            // Las luces de three.js son débiles (ambient 1.67, dirs ~0.33):
            // perturbar `normal` en el pipeline estándar es casi invisible.
            // → El relieve PBR debe multiplicarse sobre gl_FragColor en el
            //   MISMO punto (justo antes de fog_fragment), integrándose con
            //   la luz voxel como si fuera parte del juego.
            const okE = frag.includes('uMfPbrE, MF_PBR_UV');
            // Held lights: el terreno del juego declara uHeldLightPos[8]/
            // Level/Count (antorcha en mano, glowstone cercano) + vWorldPos.
            // Si están, el relieve PBR reacciona: spec por luz + realce de
            // la normal map orientada hacia cada luz (el brillo "viaja" al
            // pasar la antorcha frente a un bloque, igual que el diffuse).
            // OJO: el check de vWorldPos exige la DECLARACIÓN del varying
            // (regex) — por string suelto matchea el agua, que menciona el
            // nombre en un comentario pero NO lo declara → error de compile.
            const hasHeldLights = /varying\s+(centroid\s+)?vec3\s+vWorldPos\s*;/.test(frag)
                && frag.includes('uHeldLightPos')
                && frag.includes('uHeldLightLevel')
                && frag.includes('uHeldLightCount');
            let fb = '';
            if (useNormal) {
                fb += FRAG_FALLBACK_NORMAL + FRAG_FALLBACK_SPEC_MFN;
            } else {
                // WebGL1 sin derivadas: specular plano contra el sol estimado.
                fb += FRAG_FALLBACK_SPEC_FLAT;
            }
            if (!okE) fb += FRAG_FALLBACK_EMISSIVE;
            if (hasHeldLights && useNormal) {
                fb += `
    {
        // Relieve reactivo a held lights (antorchas/glowstone):
        // 1) SPECULAR por luz — Blinn-Phong con atenuación por distancia
        //    (celda 1 bloque = lvl/(1+d*d*k)), cálido como el fuego.
        // 2) RELIGHT direccional — la normal map inclina la cara hacia la
        //    luz: los bultos del lado de la antorcha se iluminan antes.
        float mfS_HL = texture2D(uMfPbrS, MF_PBR_UV).r * uMfPbrSpecStr;
        vec3 mfN_HL = normalize(mfN);
        for (int i = 0; i < 8; i++) {
            if (i >= uHeldLightCount) break;
            float lvl = uHeldLightLevel[i];
            vec3 toL = uHeldLightPos[i] - vWorldPos;
            float d = length(toL);
            float att = lvl / (1.0 + d * d * 0.35);
            if (att < 0.004) continue;
            vec3 L = toL / max(d, 1e-4);
            // Relight: cara plana ≈ factor 1 (color del juego intacto);
            // el relieve crea el contraste (mismo tratamiento que el
            // relight solar).
            float mfHLg = max(dot(mfNg, L), 0.0) + 0.22;
            float mfHLn = max(dot(mfN_HL, L), 0.0) + 0.22;
            float mfHLratio = clamp(mfHLn / max(mfHLg, 0.05), 0.5, 1.8);
            gl_FragColor.rgb *= mix(1.0, mfHLratio, min(att * 2.0, 1.0));
            // Specular cálido (fuego ≈ 1.0, 0.78, 0.52)
            if (mfS_HL > 0.002) {
                vec3 V2 = normalize(-vMfPbrViewPos);
                vec3 H2 = normalize(L + V2);
                float ndH2 = max(dot(mfN_HL, H2), 0.0);
                vec3 warm = vec3(1.0, 0.78, 0.52);
                gl_FragColor.rgb += warm * pow(ndH2, uMfPbrShiny) * mfS_HL * att;
            }
        }
    }
`;
            }
            // Tint de diagnóstico — se inyecta SIEMPRE (incondicional):
            // con uMfPbrTint > 0 toda la geometría hookeada se ve roja.
            // Si no se ve roja con blast() → la inyección NO corre.
            fb += 'gl_FragColor.rgb += vec3(uMfPbrTint, 0.0, 0.0);\n';
            // Modo debug de UVs: pinta el terreno con el contenido REAL del
            // atlas normal tal como lo muestrean las UVs del terreno. Si las
            // UVs caen en tiles neutros (azul #8080ff liso) o fuera del
            // atlas, se ve azul plano o negro — data bug, no shader bug.
            fb += 'if (uMfPbrDebug > 0.5) { gl_FragColor.rgb = texture2D(uMfPbrN, MF_PBR_UV).rgb; }\n';
            // Modo debug 2 — DESVIACIÓN XY del nmap: negro = neutro (0,0,1),
            // blanco = relieve presente. OJO: la magnitud 3D NO sirve — los
            // normales son unitarios y siempre dan ~1.0. Es la desviación XY
            // la que distingue neutral de bumpy. Retícula magenta = tiles.
            fb += 'if (uMfPbrDebug > 1.5) {\n';
            fb += '  vec3 mfDbgN = texture2D(uMfPbrN, MF_PBR_UV).rgb;\n';
            fb += '  vec2 mfDbgXY = mfDbgN.xy * 2.0 - 1.0;\n';
            fb += '  float mfDbgMag = clamp(length(mfDbgXY) * 1.4, 0.0, 1.0);\n';
            fb += '  gl_FragColor.rgb = vec3(mfDbgMag);\n';
            fb += '  vec2 mfDbgGrid = abs(fract(MF_PBR_UV * 64.0) - 0.5);\n';
            fb += '  float mfDbgLine = (mfDbgGrid.x < 0.03 || mfDbgGrid.y < 0.03) ? 1.0 : 0.0;\n';
            fb += '  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.0, 1.0), mfDbgLine * 0.35);\n';
            fb += '}\n';
            // Modo debug 3 — RATIO REAL del relight (el multiplicador que
            // va a gl_FragColor). mfDiffN/mfDiffG quedan en scope de main
            // porque FRAG_FALLBACK_NORMAL no usa llaves. Gris plano 0.5 =
            // ratio 1.0 (neutro) → el shading NO produce variación → ahí
            // está el bug. Gris con grano/textura = el relieve existe en
            // la matemática y el problema es posterior (post-proceso).
            fb += 'if (uMfPbrDebug > 2.5) {\n';
            fb += '  float mfDbgRatio = clamp(mfDiffN / max(mfDiffG, 0.05), 0.5, 1.8);\n';
            fb += '  gl_FragColor.rgb = vec3((mfDbgRatio - 0.5) / 1.3);\n';
            fb += '}\n';
            // Modo debug 4 — TRÍO DIAGNÓSTICO por píxel:
            //   R = tile PBR neutro (0) vs con datos (1): ¿lee el tile bien?
            //   G = diffuse muestreado por el juego, luminancia: ¿coincide
            //       con la textura visible del bloque?
            //   B = coordenada Y del tile dentro del atlas (fila):
            //       franja por fila → si R=1 solo en filas raras,
            //       desalineación de layout vertical.
            fb += 'if (uMfPbrDebug > 3.5) {\n';
            fb += '  vec3 mfDbgN4 = texture2D(uMfPbrN, MF_PBR_UV).rgb;\n';
            fb += '  float mfIsNeutral = (abs(mfDbgN4.x - 0.5) < 0.02 && abs(mfDbgN4.y - 0.5) < 0.02) ? 1.0 : 0.0;\n';
            fb += '  float mfDiff4 = dot(texture2D(map, MF_PBR_UV).rgb, vec3(0.333));\n';
            fb += '  gl_FragColor.rgb = vec3(1.0 - mfIsNeutral, mfDiff4, floor(MF_PBR_UV.y * 64.0) / 64.0);\n';
            fb += '}\n';
            if (fb) {
                // Punto de anclaje: donde el juego aplica su brightness
                // voxel (antes de fog). Fallback: tonemapping, y si no, el
                // cierre de main() (patrón CustomShader).
                const anchorFog = '#include <fog_fragment>';
                const anchorTm = '#include <tonemapping_fragment>';
                let at = -1;
                if (frag.includes(anchorFog)) {
                    at = frag.indexOf(anchorFog);
                } else if (frag.includes(anchorTm)) {
                    at = frag.indexOf(anchorTm);
                } else {
                    at = frag.lastIndexOf('}');
                }
                if (at > 0) {
                    frag = frag.slice(0, at) + fb + '\n' + frag.slice(at);
                }
            }
            if (!litPerFragment) {
                console.warn(TAG, 'Shader sin pipeline de luces en', matType,
                    '— usando fallback autocontenido');
            }
            shader.fragmentShader = frag;
            state.lastFrag = frag;

            // Vertex: declarar varying y copiar uv
            if (!shader.vertexShader.includes('vMfPbrUv')) {
                shader.vertexShader = VERT_DECL + '\n' + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    '#include <begin_vertex>\n' + VERT_MAIN
                );
            }
            state.lastVert = shader.vertexShader;
        };

        // Colgar el wrapper con las marcas de neutralización para que
        // otros módulos (o futuras sesiones) puedan desmontarlo sin
        // destruir la cadena: material.__mfPbrKill() lo apaga.
        wrapper.__mfPbrKill = function () { pbrAlive = false; };
        material.onBeforeCompile = wrapper;

        material.customProgramCacheKey = function () {
            const base = originalCacheKey ? originalCacheKey.call(material) : '';
            // v18: v10 + held lights simples (antorchas/glowstone).
            return 'mfpbr_v18_' + (useNormal ? 'n' : '-') + base;
        };

        material.needsUpdate = true;
        // Marcas para desenredar sesiones futuras (recarga sin F5)
        material.__mfPbrHooked = true;
        material.__mfPbrOriginalOnBeforeCompile = originalOnBeforeCompile;
        material.__mfPbrOriginalCacheKey = originalCacheKey;
        state.hooked.set(material, { originalOnBeforeCompile, originalCacheKey, wrapper });
        return true;
    }

    function unhookAll() {
        for (const [material, entry] of state.hooked) {
            // Neutralizar en vez de restaurar: la cadena puede tener
            // wrappers de otros módulos (CustomShader) envolviéndonos.
            if (entry.wrapper?.__mfPbrKill) entry.wrapper.__mfPbrKill();
            material.customProgramCacheKey = entry.originalCacheKey;
            material.needsUpdate = true;
            delete material.__mfPbrHooked;
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
        // Telemetría: sin esto, "PBR activo pero 0 hookeados" es invisible.
        if (added > 0) {
            console.log(TAG, 'Hookeados', added, 'materiales nuevos (total:',
                state.hooked.size + ')');
        }
        return added;
    }

    function startScanLoop() {
        if (state.scanTimer) return;
        state.scanTimer = setInterval(() => {
            if (state.enabled) {
                scan();
                diagScene();  // reintenta si la escena no estaba lista en enable()
            }
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
            const anyKind = state.kinds.n || state.kinds.s || state.kinds.e;
            if (anyKind) {
                const u = state.uniforms;
                console.log(TAG, 'PBR activo:', { ...state.kinds },
                    u ? ('| fuerza normal=' + u.uMfPbrNormalStr.value
                        + ' spec=' + u.uMfPbrSpecStr.value) : '');
                // El caso #1 de "no hay relieve" con pipeline sano: fuerzas
                // quedadas en 0 por sesiones de debug viejas.
                if (u && u.uMfPbrNormalStr.value <= 0) {
                    console.warn(TAG, 'Fuerza normal=0 — el relieve está',
                        'APAGADO. Ejecuta MF_PBR.resetStrength() para',
                        'restaurar los defaults.');
                }
            } else {
                console.warn(TAG, 'PBR activo pero SIN atlas en IndexedDB —',
                    'sube el pack en Cosmetics → Texture Pack → Generate',
                    '(zip o PNGs con sufijos _n/_s/_e) y recarga');
            }
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

    // Restaurar fuerzas a defaults — útil cuando un localStorage viejo
    // quedó en 0 (sesiones de debug) y el usuario no sabe por qué no
    // hay relieve. MF_PBR.resetStrength() lo arregla en un comando.
    function resetStrength() {
        try {
            localStorage.removeItem(LS.normal);
            localStorage.removeItem(LS.spec);
            localStorage.removeItem(LS.shiny);
            localStorage.removeItem(LS.emissive);
        } catch (_) {}
        const u = ensureUniforms();
        if (!u) return { error: 'sin uniforms aún (juego sin texturas)' };
        u.uMfPbrNormalStr.value = 1.5;
        u.uMfPbrSpecStr.value = 0.7;
        u.uMfPbrShiny.value = 24.0;
        u.uMfPbrEmiStr.value = 1.0;
        return { normal: 1.5, spec: 0.7, shiny: 24.0, emissive: 1.0 };
    }

    function status() {
        return {
            enabled: state.enabled,
            kinds: { ...state.kinds },
            hooked: state.hooked.size
        };
    }

    // Acceso interno para MF_PbrEditor (MAIN): la textura THREE del atlas
    // por kind — el editor reemplaza .image por un canvas editable y marca
    // needsUpdate para ver el cambio en vivo.
    function texFor(kind) {
        return state.textures[kind] || null;
    }

    // Diffuse del juego (atlas del material ancla, mismo layout frames.json)
    // para la referencia visual del editor.
    let diffuseCv = null;
    function diffuseCanvas() {
        if (diffuseCv) return diffuseCv;
        try {
            for (const mesh of collectMeshes(getScene(findGame()))) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const m of mats) {
                    const img = m?.map?.image;
                    if (!img) continue;
                    const w = img.width || img.naturalWidth;
                    const h = img.height || img.naturalHeight;
                    if (w >= 1024 && h >= 1024) {
                        const c = document.createElement('canvas');
                        c.width = w; c.height = h;
                        c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
                        diffuseCv = c;
                        return diffuseCv;
                    }
                }
            }
        } catch (_) {}
        return null;
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

    // Autopsia runtime: ¿mi GLSL llegó al shader compilado? ¿Cuántas luces
    // define el programa real? Lee renderer.info.programs (GLSL final tras
    // resolver includes y defines) — evidencia directa de la GPU.
    function debug() {
        const out = {
            status: status(),
            uniforms: state.uniforms ? {
                normalStr: state.uniforms.uMfPbrNormalStr.value,
                specStr: state.uniforms.uMfPbrSpecStr.value,
                shiny: state.uniforms.uMfPbrShiny.value,
                emiStr: state.uniforms.uMfPbrEmiStr.value,
                texN: !!state.uniforms.uMfPbrN.value,
                texS: !!state.uniforms.uMfPbrS.value,
                texE: !!state.uniforms.uMfPbrE.value
            } : null,
            textures: { n: !!state.textures.n, s: !!state.textures.s, e: !!state.textures.e },
            flipY: state.texFlipY,
            builtFlipY: state.builtFlipY,
            webgl2: isWebGL2()
        };
        // Último shader generado por nuestro hook
        if (state.lastFrag) {
            out.lastFragHas = {
                decl: state.lastFrag.includes('uMfPbrN'),
                normalAnchor: state.lastFrag.includes('mfMapN') && state.lastFrag.includes('vViewPosition.xyz'),
                specAnchor: state.lastFrag.includes('directionalLights[l].direction'),
                fallback: state.lastFrag.includes('mfDiffN'),
                emissive: state.lastFrag.includes('uMfPbrE, MF_PBR_UV'),
                vertVarying: (state.lastVert || '').includes('vMfPbrUv = uv'),
                // ¿Con qué UV se samplea PBR? Debe ser la MISMA con la que
                // el juego samplea su diffuse (autodetectada del primer
                // texture2D(map, X) del shader, ej: vOverlayUV del terreno).
                gameUv: (state.lastFrag.match(/#define MF_PBR_UV (\w+)/) || [])[1] || null
            };
        } else {
            out.lastFrag = '¡NUNCA se compiló ningún material hookeado — el hook NO corre!';
        }
        // Programas reales del renderer: defines de luces + nuestra marca
        try {
            const game = findGame();
            const scene = getScene(game);
            const renderer = game?.renderer || game?.gameScene?.renderer
                || game?.scene?.renderer || scene?.renderer || null;
            const progs = renderer?.info?.programs;
            if (Array.isArray(progs) && progs.length) {
                let withPbr = 0, dirLightDefs = {};
                for (const p of progs) {
                    const fs = p.fragmentShader || '';
                    if (fs.includes('uMfPbrN')) {
                        withPbr++;
                        const m = fs.match(/#define NUM_DIR_LIGHTS (\d+)/);
                        const d = m ? m[1] : (fs.includes('NUM_DIR_LIGHTS') ? '?' : 'sin-define');
                        dirLightDefs[d] = (dirLightDefs[d] || 0) + 1;
                    }
                }
                out.gpu = { totalPrograms: progs.length, withPbr, dirLightDefs };
            } else {
                out.gpu = 'renderer.info.programs no accesible';
            }
        } catch (e) {
            out.gpu = 'error: ' + e.message;
        }
        console.log(TAG, 'DEBUG', out);
        // Versión PLANA — sobrevive el copy-paste de consola (los objetos
        // anidados salen colapsados {…} y no se pueden leer desde el log).
        const lf = out.lastFragHas;
        console.log(TAG, 'DIAG ▸ enabled=' + out.status.enabled
            + ' hooked=' + out.status.hooked
            + ' kinds=' + JSON.stringify(out.status.kinds)
            + ' | normalStr=' + (out.uniforms ? out.uniforms.normalStr : '?')
            + ' specStr=' + (out.uniforms ? out.uniforms.specStr : '?')
            + ' | gameUv=' + (lf ? lf.gameUv : 'nunca-compiló')
            + ' fallback=' + (lf ? lf.fallback : '?')
            + ' specAnchor=' + (lf ? lf.specAnchor : '?')
            + ' | gpu=' + (typeof out.gpu === 'object'
                ? ('withPbr=' + out.gpu.withPbr + '/' + out.gpu.totalPrograms
                    + ' dirLights=' + JSON.stringify(out.gpu.dirLightDefs))
                : String(out.gpu)));
        return out;
    }

    // Test nuclear: fuerza valores extremos 10 segundos. Si la pantalla NO
    // cambia en absoluto → la inyección no está corriendo en la GPU (hook
    // pisado o material sin recompilar). Si cambia → el pipeline está vivo
    // y el problema es de datos/atlas.
    function blast() {
        const u = ensureUniforms();
        if (!u) { console.warn(TAG, 'BLAST: sin uniforms'); return; }
        const prev = {
            n: u.uMfPbrNormalStr.value, s: u.uMfPbrSpecStr.value,
            sh: u.uMfPbrShiny.value, e: u.uMfPbrEmiStr.value,
            t: u.uMfPbrTint.value
        };
        console.log(TAG, 'BLAST ON — 10s. Si el terreno NO se tiñe rojo,',
            'la inyección no corre en la GPU. Ejecuta MF_PBR.debug().');
        u.uMfPbrTint.value = 1.0;  // tinte rojo universal e incondicional
        u.uMfPbrEmiStr.value = 2.0;
        u.uMfPbrSpecStr.value = 3.0;
        u.uMfPbrNormalStr.value = 3.0;
        u.uMfPbrShiny.value = 4.0;
        // Tint rojo universal vía emissive del atlas E (tiles sin _e son
        // negros) + spec alto: cualquier tile con _s destella.
        setTimeout(() => {
            u.uMfPbrTint.value = prev.t;
            u.uMfPbrNormalStr.value = prev.n;
            u.uMfPbrSpecStr.value = prev.s;
            u.uMfPbrShiny.value = prev.sh;
            u.uMfPbrEmiStr.value = prev.e;
            console.log(TAG, 'BLAST OFF — valores restaurados');
        }, 10000);
    }

    // Analiza los píxeles del atlas _n REALMENTE cargado en el uniform.
    // Si el atlas es todo neutro (#8080ff), el generador falló o el pack
    // no matcheó — morado uniforme en showAtlas() vendría de ahí, no de UVs.
    async function atlasStats() {
        // Forzar carga si aún no hay uniforms (atlasStats antes de enable)
        if (!state.uniforms) {
            await loadAtlases();
            ensureUniforms();
            refreshUniformValues();
        }
        const u = state.uniforms;
        const tex = (state.kinds.n && state.textures.n) || (u && u.uMfPbrN && u.uMfPbrN.value);
        const out = {
            uniformsReady: !!u,
            usingDummy: !(state.kinds.n && state.textures.n)
        };
        if (!tex || !tex.image) {
            out.error = 'sin textura (ni IndexedDB ni dummy)';
            console.log(TAG, 'ATLAS STATS', out);
            return out;
        }
        try {
            const img = tex.image;
            const w = img.width || img.naturalWidth || 0;
            const h = img.height || img.naturalHeight || 0;
            if (!w || !h) return { ...out, error: 'imagen sin dimensiones', image: img.constructor?.name };
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, w, h).data;
            let neutral = 0, colorful = 0, black = 0;
            const step = Math.max(1, Math.floor(w * h / 20000));  // muestrear ~20k px
            let total = 0;
            for (let i = 0; i < data.length; i += 4 * step) {
                const r = data[i], g = data[i + 1], b = data[i + 2];
                total++;
                if (r < 10 && g < 10 && b < 10) black++;
                else if (Math.abs(r - 128) <= 8 && Math.abs(g - 128) <= 8 && Math.abs(b - 255) <= 8) neutral++;
                else colorful++;
            }
            const result = {
                ...out,
                size: w + 'x' + h,
                sampled: total,
                // Tiles 16x16 con contenido ≈ colorful px / 256. Un pack de
                // 29 tiles da ~29; un relicto vacío da 0.
                estTiles: Math.round(colorful / 256),
                neutralPct: Math.round(neutral / total * 100),
                colorfulPct: Math.round(colorful / total * 100),
                blackPct: Math.round(black / total * 100),
                verdict: colorful < 64
                    ? 'ATLAS VACÍO (0 tiles) — generador falló o pack no matcheó'
                    : 'atlas con relieve real ✓ (' + Math.round(colorful / 256) + ' tiles aprox)'
            };
            console.log(TAG, 'ATLAS STATS', result);
            return result;
        } catch (e) {
            const r = { ...out, error: String(e.message) };
            console.log(TAG, 'ATLAS STATS', r);
            return r;
        }
    }
    // Modo debug visual: pinta el terreno con el atlas normal real via las
    // UVs del terreno. Toggle con MF_PBR.showAtlas().
    function showAtlas() {
        const u = ensureUniforms();
        if (!u) return false;
        // Ciclo 4 estados: OFF → atlas crudo (1) → magnitud+grid (2) →
        // ratio relight (3) → trío diagnóstico (4) → OFF
        const cur = u.uMfPbrDebug.value;
        const next = cur <= 0.5 ? 1 : (cur <= 1.5 ? 2 : (cur <= 2.5 ? 3 : (cur <= 3.5 ? 4 : 0)));
        u.uMfPbrDebug.value = next;
        const msg = next === 0 ? 'OFF'
            : next === 1
                ? 'ATLAS CRUDO — celeste plano = tiles neutros/UVs equivocadas'
                : next === 2
                    ? 'MAGNITUD XY — negro=neutro, blanco=relieve. Retícula magenta=tiles 16px'
                    : next === 3
                        ? 'RATIO RELIGHT — gris plano=shading sin efecto, gris con grano=relieve OK'
                        : 'TRÍO: R=tile PBR con datos (negro=neutro) G=luminancia diffuse B=fila del tile';
        console.log(TAG, 'Modo atlas', msg);
        return next;
    }

    // Compara tile-a-tile el atlas DIFFUSE del juego (material del terreno)
    // contra nuestro atlas _n: ¿los tiles PINTADOS coinciden en posición?
    // Si el juego pinta el tile (col,7) y nosotros el (col,3) → offset de
    // layout → el terreno lee neutro aunque el atlas tenga datos.
    // Devuelve: total de tiles del juego con contenido, cuántos de esos
    // tienen también contenido PBR en la MISMA celda, y los primeros
    // desalineados con coordenadas de ambos.
    async function atlasDiff() {
        const game = findGame();
        const gs = game?.gameScene;
        const mat = gs?.chunkMeshes?.children?.[0]?.material;
        const gameMap = mat?.map?.image;
        if (!gameMap || !(gameMap.width > 0)) {
            console.warn(TAG, 'ATLAS DIFF: sin atlas del juego (terreno no presente)');
            return { error: 'sin atlas del juego' };
        }
        const pbrTex = (state.kinds.n && state.textures.n)
            || (state.uniforms && state.uniforms.uMfPbrN && state.uniforms.uMfPbrN.value);
        if (!pbrTex || !pbrTex.image) {
            console.warn(TAG, 'ATLAS DIFF: sin atlas PBR cargado');
            return { error: 'sin atlas PBR' };
        }
        const tile = (img, ctx, col, row, size) => {
            const d = ctx.getImageData(col * size, row * size, size, size).data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) sum += Math.abs(d[i] - 128) + Math.abs(d[i + 1] - 128) + Math.abs(d[i + 2] - 255);
            return sum / (size * size);  // 0 = neutro exacto
        };
        const load = (img) => {
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            return ctx;
        };
        try {
            const size = 16;
            const gCtx = load(gameMap);
            const pCtx = load(pbrTex.image);
            const cols = Math.min(gameMap.width, pbrTex.image.width) / size;
            const rows = Math.min(gameMap.height, pbrTex.image.height) / size;
            // Mapa de tiles con contenido: juego (varianza) y PBR (desv. del
            // neutro). Se usa para probar las 4 orientaciones de una vez.
            const gameHas = [], pbrHas = [];
            let gameTiles = 0, pbrTiles = 0;
            for (let r = 0; r < rows; r++) {
                gameHas[r] = []; pbrHas[r] = [];
                for (let c = 0; c < cols; c++) {
                    const gd = gCtx.getImageData(c * size, r * size, size, size).data;
                    let mean = 0;
                    for (let i = 0; i < gd.length; i += 4) mean += gd[i] + gd[i + 1] + gd[i + 2];
                    mean /= (gd.length / 4) * 3;
                    let vari = 0;
                    for (let i = 0; i < gd.length; i += 4) vari += Math.abs(gd[i] - mean) + Math.abs(gd[i + 1] - mean) + Math.abs(gd[i + 2] - mean);
                    vari /= (gd.length / 4) * 3;
                    gameHas[r][c] = vari >= 12;
                    if (gameHas[r][c]) gameTiles++;
                    pbrHas[r][c] = tile(pbrTex.image, pCtx, c, r, size) > 3;
                    if (pbrHas[r][c]) pbrTiles++;
                }
            }
            // Probar las 4 orientaciones: identidad, flipV (flipY), flipH,
            // rot180 (flipH+flipV). El atlas del juego y el PNG generado por
            // TexturePackManager pueden diferir en la convención vertical.
            const orient = {
                identidad: (c, r) => [c, r],
                flipV: (c, r) => [c, rows - 1 - r],
                flipH: (c, r) => [cols - 1 - c, r],
                rot180: (c, r) => [cols - 1 - c, rows - 1 - r]
            };
            const scores = {};
            let best = { name: null, match: -1 };
            for (const [name, map] of Object.entries(orient)) {
                let m = 0;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (!gameHas[r][c]) continue;
                        const [pc, pr] = map(c, r);
                        if (pbrHas[pr] && pbrHas[pr][pc]) m++;
                    }
                }
                scores[name] = m;
                if (m > best.match) best = { name, match: m };
            }
            const pbrCells = [];
            for (let r = 0; r < rows && pbrCells.length < 10; r++) {
                for (let c = 0; c < cols && pbrCells.length < 10; c++) {
                    if (pbrHas[r][c]) pbrCells.push([c, r]);
                }
            }
            const gameCells = [];
            for (let r = 0; r < rows && gameCells.length < 10; r++) {
                for (let c = 0; c < cols && gameCells.length < 10; c++) {
                    if (gameHas[r][c]) gameCells.push([c, r]);
                }
            }
            const result = {
                gameAtlas: gameMap.width + 'x' + gameMap.height,
                pbrAtlas: pbrTex.image.width + 'x' + pbrTex.image.height,
                gameTilesConContenido: gameTiles,
                pbrTilesConContenido: pbrTiles,
                scoresPorOrientacion: scores,
                mejorOrientacion: best.name + ' (' + best.match + '/' + gameTiles + ')',
                primerasCeldasPBR: pbrCells,
                primerasCeldasJuego: gameCells,
                veredicto: best.match === 0
                    ? 'NINGUNA orientación alinea → layout distinto (frames.json viejo u otro atlas)'
                    : 'alineación ' + best.name + ' con ' + best.match + '/' + gameTiles + ' tiles'
            };
            console.log(TAG, 'ATLAS DIFF', result);
            return result;
        } catch (e) {
            console.warn(TAG, 'ATLAS DIFF error:', e.message);
            return { error: e.message };
        }
    }

    // Autopsia del TERRENO específicamente: captura el shader REAL del
    // material de chunkMeshes (no el lastFrag genérico que puede ser de
    // una entidad). CLAVE: three.js con el MISMO cacheKey reúsa el
    // programa cacheado SIN llamar onBeforeCompile → hay que cambiar la
    // key también, no solo needsUpdate.
    function probeTerrain() {
        const game = findGame();
        const gs = game?.gameScene;
        const chunks = gs?.chunkMeshes;
        const kids = chunks?.children || [];
        if (!kids.length) return { error: 'sin chunks en escena' };
        const mat = kids[0].material;
        const res = {
            chunks: kids.length,
            matType: mat?.type,
            mapSize: mat?.map?.image ? (mat.map.image.width + 'x' + mat.map.image.height) : null,
            pbrHooked: !!mat?.__mfPbrHooked,
            csHooked: !!mat?.__mfHooked
        };
        // RUTA ALTERNATIVA (más fiable): el programa YA compilado del
        // renderer tiene el GLSL final con la macro resuelta. Buscar el
        // programa cuyo fragment declare vCentroidMapUv Y uMfPbrN.
        try {
            const renderer = game?.renderer || gs?.renderer || game?.scene?.renderer;
            const progs = renderer?.info?.programs;
            if (Array.isArray(progs)) {
                let terrainProg = null, pbrProgs = 0;
                for (const p of progs) {
                    const fs = p.fragmentShader || '';
                    if (fs.includes('uMfPbrN')) pbrProgs++;
                    if (fs.includes('vCentroidMapUv') && fs.includes('uMfPbrN')) terrainProg = p;
                }
                if (terrainProg) {
                    const fs = terrainProg.fragmentShader;
                    window.__mfTerrainFrag = fs;
                    const defines = [...fs.matchAll(/#define MF_PBR_UV (\w+)/g)].map(m => m[1]);
                    const samplers = [...fs.matchAll(/texture2D\(\s*map\s*,\s*([^);]+)\)/g)].map(m => m[1].trim());
                    console.log(TAG, 'TERRENO(GPU) ▸ define=' + defines.join('|')
                        + ' | diffuseSamplers=' + samplers.join(' ; ')
                        + ' | pbrProgs=' + pbrProgs);
                    return { ...res, gpuProg: true, defines, samplers };
                }
                return { ...res, gpuProg: false, pbrProgs, note: 'ningún programa GPU combina vCentroidMapUv + PBR' };
            }
        } catch (e) {
            res.gpuErr = String(e.message);
        }
        // Fallback: forzar recompilación (key distinta → onBeforeCompile corre)
        const origOBC = mat.onBeforeCompile;
        const origKey = mat.customProgramCacheKey;
        window.__mfTerrainShader = null;
        mat.onBeforeCompile = function (sh) {
            origOBC.call(this, sh);
            window.__mfTerrainShader = sh.fragmentShader;
            window.__mfTerrainShaderFull = sh;
        };
        mat.customProgramCacheKey = function () {
            return (origKey ? origKey.call(mat) : '') + '_mfpbr_probe';
        };
        mat.needsUpdate = true;
        setTimeout(() => {
            const fs = window.__mfTerrainShader;
            if (fs) {
                window.__mfTerrainFrag = fs;
                const varys = [...fs.matchAll(/varying\s+vec2\s+(\w+)/g)].map(m => m[1]);
                const sampler = ((fs.match(/texture2D\(\s*map\s*,\s*([^)]+)\)/) || [])[1] || '?').trim();
                // TODOS los samplers de `map` (el juego tiene varios: overlay,
                // diffuse con vCentroidMapUv, etc.) — el primero puede ser el
                // del layer overlay (transparente/negro), no el diffuse.
                const allMapSamplers = [...fs.matchAll(/texture2D\s*\(\s*map\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1]);
                console.log(TAG, 'TERRENO ▸ pbrDecl=' + fs.includes('uMfPbrN')
                    + ' pbrUv=' + (((fs.match(/#define MF_PBR_UV (\w+)/) || [])[1]) || 'NINGUNA')
                    + ' declaraCentroid=' + fs.includes('vCentroidMapUv')
                    + ' | varyingsVec2=' + varys.join(',')
                    + ' | TODOS mapSamplers=' + allMapSamplers.join(','));
                // AUTOPSIA UV: cómo se construye vCentroidMapUv en el
                // VERTEX (ahí vive el flip/offset de tile que hay que
                // replicar en el sampling PBR). Dump completo en
                // window.__mfTerrainVert para inspección manual.
                const shFull = window.__mfTerrainShaderFull;
                if (shFull) {
                    window.__mfTerrainVert = shFull.vertexShader;
                    // vCentroidMapUv = vMapUv (probe anterior) — falta ver
                    // cómo se construye vMapUv (tile/offset por cara).
                    const lines = shFull.vertexShader.split('\n')
                        .filter(l => /vMapUv|vOverlayUV|vCentroidMapUv|atlasUv|tileUv|uvTransform/.test(l))
                        .map(l => l.trim()).slice(0, 20);
                    console.log(TAG, 'TERRENO.UV ▸ ' + lines.join(' ⏎ '));
                }
            } else {
                console.warn(TAG, 'TERRENO ▸ no recompiló en 3s — render pausado');
            }
            // AUTOPSIA LUCES: qué uniforms de luz dinámica (antorchas,
            // glowstone) usa el terreno — nombres, tipos y cómo iteran.
            const fsDump = window.__mfTerrainFrag || window.__mfTerrainShader;
            if (fsDump) {
                const lightUniforms = [...new Set([...fsDump.matchAll(/uniform\s+(int|float|vec[234]|vec[234]\[\w+\]|mat[34])\s+(\w*[Ll]ight\w*|\w*[Tt]orch\w*|\w*[Gg]low\w*|\w*[Pp]oint\w*)\s*(\[[^\]]*\])?\s*;/g)].map(m => m[0]))];
                const lightLoops = fsDump.split('\n').filter(l => /light|Light|torch|Torch|glow|Glow|lumen|Lumen/i.test(l) && !/^\s*\/\//.test(l)).map(l => l.trim()).slice(0, 24);
                console.log(TAG, 'TERRENO.LUCES ▸ uniforms: ' + (lightUniforms.join(' | ') || 'NINGUNO'));
                console.log(TAG, 'TERRENO.LUCES ▸ líneas: ' + (lightLoops.join(' ⏎ ') || 'ninguna'));
            }
            mat.onBeforeCompile = origOBC;
            mat.customProgramCacheKey = origKey;
            mat.needsUpdate = true;
            window.__mfTerrainShader = undefined;
        }, 3000);
        return { ...res, probe: 'espera 3s — mira la línea TERRENO ▸' };
    }

    // Censo de luces de la escena — BFS sobre el grafo de escena completo.
    function countLights() {
        const scene = getScene(findGame());
        if (!scene) return null;
        const out = { directional: 0, ambient: 0, hemisphere: 0, point: 0, spot: 0, otro: 0 };
        const queue = [scene];
        const seen = new Set();
        while (queue.length) {
            const obj = queue.shift();
            if (!obj || seen.has(obj)) continue;
            seen.add(obj);
            if (obj.isLight) {
                if (obj.isDirectionalLight) out.directional++;
                else if (obj.isAmbientLight) out.ambient++;
                else if (obj.isHemisphereLight) out.hemisphere++;
                else if (obj.isPointLight) out.point++;
                else if (obj.isSpotLight) out.spot++;
                else out.otro++;
            }
            if (Array.isArray(obj.children)) for (const k of obj.children) queue.push(k);
        }
        return out;
    }

    // ── Presets PBR (puente MAIN → ISOLATED vía CustomEvent) ──
    // MF_TEXTURE_PACK vive en el mundo ISOLATED; este módulo corre en MAIN.
    // CustomEvents cruzan mundos: pedimos la instalación y escuchamos la
    // respuesta asíncrona (la descarga del ZIP puede tardar).
    function pbrPresets() {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve({ error: 'timeout esperando a MF_TEXTURE_PACK' }), 4000);
            const onList = (ev) => {
                let detail = null;
                try { detail = JSON.parse(ev.detail); } catch (_) { detail = ev.detail; }
                clearTimeout(timer);
                document.removeEventListener('minifeather:pbr-presets-result', onList);
                resolve(detail);
            };
            document.addEventListener('minifeather:pbr-presets-result', onList);
            document.dispatchEvent(new CustomEvent('minifeather:pbr-presets-list'));
        });
    }

    function pbrPreset(id) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve({ error: 'timeout (la descarga puede seguir corriendo — mira los logs)' }), 120000);
            const onDone = (ev) => {
                let detail = null;
                try { detail = JSON.parse(ev.detail); } catch (_) { detail = ev.detail; }
                if (detail?.presetId !== id) return;  // respuesta de otro preset
                clearTimeout(timer);
                document.removeEventListener('minifeather:pbr-preset-result', onDone);
                resolve(detail);
            };
            document.addEventListener('minifeather:pbr-preset-result', onDone);
            document.dispatchEvent(new CustomEvent('minifeather:pbr-preset-install', {
                detail: JSON.stringify({ presetId: id })
            }));
        });
    }

    window.MF_PBR = { enable, disable, setStrength, resetStrength, status, refresh: loadAtlases, debug, blast, showAtlas, atlasStats, atlasDiff, probeTerrain, presets: pbrPresets, preset: pbrPreset, __tex: texFor, __diffuse: diffuseCanvas };
})();