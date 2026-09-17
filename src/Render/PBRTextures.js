
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
        texFlipY: null,      
        builtFlipY: null,    
        texSettings: null,   
        atlasRetryDone: false,
        reinstallCount: 0,   
        diagLogged: false,
        lastFrag: null,      
        lastVert: null,      
        lastGameUv: null     
    };

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
            
            const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : null);
            if (mats && mats.some(m => m && m.map)) out.push(obj);
            if (Array.isArray(obj.children)) {
                for (const k of obj.children) queue.push(k);
            }
        }
        return out;
    }

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
        void 0;
        if (lights.directional === 0) {
            console.warn(TAG, 'CERO luces direccionales de three.js — el juego',
                'ilumina con luz custom (ambient/AO). El relight fallback con',
                'sol estimado se activará vía #if NUM_DIR_LIGHTS == 0.');
        }
    }

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
            
            if (!(window.__MF_GL_CANVASES__ || []).length) state.webgl2 = true;
        } catch (_) {
            state.webgl2 = true;
        }
        return state.webgl2;
    }

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

    function atlasLooksEmpty(dataUrl, kind) {
        return loadImage(dataUrl).then((img) => {
            if (!img || !img.width) return true;
            const w = img.width, h = img.height;
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);  
            let data;
            try { data = ctx.getImageData(0, 0, w, h).data; }
            catch (_) { return false; }  
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
            
            return total > 0 && (other / total) < 0.0005;
        });
    }

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
            
            const ts = state.texSettings;
            if (ts) {
                if (ts.magFilter !== null && ts.magFilter !== undefined) tex.magFilter = ts.magFilter;
                if (ts.minFilter !== null && ts.minFilter !== undefined) tex.minFilter = ts.minFilter;
                if (ts.wrapS !== null && ts.wrapS !== undefined) tex.wrapS = ts.wrapS;
                if (ts.wrapT !== null && ts.wrapT !== undefined) tex.wrapT = ts.wrapT;
                tex.generateMipmaps = !!ts.generateMipmaps;
                if (ts.anisotropy) tex.anisotropy = ts.anisotropy;
            }
            if (srgb) tex.colorSpace = 'srgb';  
            
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
        
        ctx.fillStyle = kind === 'n' ? 'rgb(128,128,255)' : '#000000';
        ctx.fillRect(0, 0, 1, 1);
        return makeTexture(c, false);
    }

    async function loadAtlases() {
        if (state.loading) return state.loading;
        
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
                void 0;
                if (state.uniforms) refreshUniformValues();
                if (state.enabled) scan();
            }
            return { ...state.kinds };
        })();
        const p = state.loading;
        p.finally(() => { state.loading = null; });
        return p;
    }

    function num(key, def) {
        const v = parseFloat(localStorage.getItem(key));
        return isNaN(v) ? def : v;
    }

    function ensureUniforms() {
        if (state.uniforms) return state.uniforms;
        const dN = makeDummy('n');
        if (!dN) return null;  
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

    function rebuildTextures() {
        loadAtlases().then(() => {
            refreshUniformValues();
            if (state.enabled) scan();
        });
    }

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

    const VERT_MAIN = `
        vMfPbrUv = uv;
        vMfPbrViewPos = (modelViewMatrix * vec4(transformed, 1.0)).xyz;
    `;

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

    const FRAG_EMISSIVE = `
        totalEmissiveRadiance += texture2D(uMfPbrE, MF_PBR_UV).rgb * uMfPbrEmiStr;
    `;

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
        float mfDiffG = max(dot(mfNg, mfSun), 0.0) + 0.22;
        float mfDiffN = max(dot(mfN, mfSun), 0.0) + 0.22;
        gl_FragColor.rgb *= clamp(mfDiffN / max(mfDiffG, 0.05), 0.5, 1.8);
        // Rim suave para que el relieve se lea en bordes
        vec3 mfV = normalize(-vMfPbrViewPos);
        float mfRim = pow(1.0 - max(dot(mfN, mfV), 0.0), 3.0);
        gl_FragColor.rgb += gl_FragColor.rgb * mfRim * 0.30 * uMfPbrNormalStr;
    `;

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

    const FRAG_FALLBACK_EMISSIVE = `
        gl_FragColor.rgb += texture2D(uMfPbrE, MF_PBR_UV).rgb * uMfPbrEmiStr;
    `;

    function anchorFrag(frag, includeName, code) {
        const anchor = '#include <' + includeName + '>';
        if (!frag.includes(anchor)) return frag;
        return frag.replace(anchor, anchor + '\n' + code);
    }

    function hookMaterial(material) {
        if (state.hooked.has(material)) {
            
            let chainHasPbr = false;
            try {
                chainHasPbr = String(material.onBeforeCompile).includes('uMfPbrN');
            } catch (_) { chainHasPbr = false; }
            if (chainHasPbr) return false;
            state.hooked.delete(material);  
            
            delete material.__mfPbrHooked;
            delete material.__mfPbrOriginalOnBeforeCompile;
            delete material.__mfPbrOriginalCacheKey;
        }
        const matType = material.type || material.constructor?.name || '';
        if (!LIGHT_MATERIALS.includes(matType)) return false;
        if (typeof material.onBeforeCompile !== 'function') return false;
        if (!material.map || !material.map.isTexture) return false;

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
                
                if (hadTextures && state.builtFlipY !== fy) rebuildTextures();
            }
            const tsChanged = JSON.stringify(ts) !== JSON.stringify(state.texSettings);
            if (tsChanged) {
                const hadTextures = state.builtFlipY !== null;
                state.texSettings = ts;
                
                if (hadTextures) rebuildTextures();
            }
        } catch (_) {}

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

        let pbrAlive = true;

        const wrapper = function (shader) {
            originalOnBeforeCompile(shader);
            if (!pbrAlive) return; 
            if (shader.fragmentShader.includes('uMfPbrN')) return; 

            const u = ensureUniforms();
            if (!u) return;
            for (const key in u) shader.uniforms[key] = u[key];

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
                void 0;
                state.lastGameUv = gameUvExpr;
            }
            
            const decl = FRAG_UNIFORMS_DECL + VERT_DECL
                + (gameUvExpr ? '#define MF_PBR_UV ' + gameUvExpr + '\n'
                              : '#define MF_PBR_UV vMfPbrUv\n')
                + '\n';
            let frag = decl + shader.fragmentShader;

            const litPerFragment = frag.includes('#include <lights_fragment_begin>');

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

            const okE = frag.includes('uMfPbrE, MF_PBR_UV');
            
            const hasHeldLights = /varying\s+(centroid\s+)?vec3\s+vWorldPos\s*;/.test(frag)
                && frag.includes('uHeldLightPos')
                && frag.includes('uHeldLightLevel')
                && frag.includes('uHeldLightCount');
            let fb = '';
            if (useNormal) {
                fb += FRAG_FALLBACK_NORMAL + FRAG_FALLBACK_SPEC_MFN;
            } else {
                
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
            
            fb += 'gl_FragColor.rgb += vec3(uMfPbrTint, 0.0, 0.0);\n';
            
            fb += 'if (uMfPbrDebug > 0.5) { gl_FragColor.rgb = texture2D(uMfPbrN, MF_PBR_UV).rgb; }\n';
            
            fb += 'if (uMfPbrDebug > 1.5) {\n';
            fb += '  vec3 mfDbgN = texture2D(uMfPbrN, MF_PBR_UV).rgb;\n';
            fb += '  vec2 mfDbgXY = mfDbgN.xy * 2.0 - 1.0;\n';
            fb += '  float mfDbgMag = clamp(length(mfDbgXY) * 1.4, 0.0, 1.0);\n';
            fb += '  gl_FragColor.rgb = vec3(mfDbgMag);\n';
            fb += '  vec2 mfDbgGrid = abs(fract(MF_PBR_UV * 64.0) - 0.5);\n';
            fb += '  float mfDbgLine = (mfDbgGrid.x < 0.03 || mfDbgGrid.y < 0.03) ? 1.0 : 0.0;\n';
            fb += '  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.0, 1.0), mfDbgLine * 0.35);\n';
            fb += '}\n';
            
            fb += 'if (uMfPbrDebug > 2.5) {\n';
            fb += '  float mfDbgRatio = clamp(mfDiffN / max(mfDiffG, 0.05), 0.5, 1.8);\n';
            fb += '  gl_FragColor.rgb = vec3((mfDbgRatio - 0.5) / 1.3);\n';
            fb += '}\n';
            
            fb += 'if (uMfPbrDebug > 3.5) {\n';
            fb += '  vec3 mfDbgN4 = texture2D(uMfPbrN, MF_PBR_UV).rgb;\n';
            fb += '  float mfIsNeutral = (abs(mfDbgN4.x - 0.5) < 0.02 && abs(mfDbgN4.y - 0.5) < 0.02) ? 1.0 : 0.0;\n';
            fb += '  float mfDiff4 = dot(texture2D(map, MF_PBR_UV).rgb, vec3(0.333));\n';
            fb += '  gl_FragColor.rgb = vec3(1.0 - mfIsNeutral, mfDiff4, floor(MF_PBR_UV.y * 64.0) / 64.0);\n';
            fb += '}\n';
            if (fb) {
                
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

            if (!shader.vertexShader.includes('vMfPbrUv')) {
                shader.vertexShader = VERT_DECL + '\n' + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    '#include <begin_vertex>\n' + VERT_MAIN
                );
            }
            state.lastVert = shader.vertexShader;
        };

        wrapper.__mfPbrKill = function () { pbrAlive = false; };
        material.onBeforeCompile = wrapper;

        material.customProgramCacheKey = function () {
            const base = originalCacheKey ? originalCacheKey.call(material) : '';
            
            return 'mfpbr_v18_' + (useNormal ? 'n' : '-') + base;
        };

        material.needsUpdate = true;
        
        material.__mfPbrHooked = true;
        material.__mfPbrOriginalOnBeforeCompile = originalOnBeforeCompile;
        material.__mfPbrOriginalCacheKey = originalCacheKey;
        state.hooked.set(material, { originalOnBeforeCompile, originalCacheKey, wrapper });
        return true;
    }

    function unhookAll() {
        for (const [material, entry] of state.hooked) {
            
            if (entry.wrapper?.__mfPbrKill) entry.wrapper.__mfPbrKill();
            material.customProgramCacheKey = entry.originalCacheKey;
            material.needsUpdate = true;
            delete material.__mfPbrHooked;
        }
        state.hooked.clear();
    }

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
        
        if (added > 0) {
            void 0;
        }
        return added;
    }

    function startScanLoop() {
        if (state.scanTimer) return;
        state.scanTimer = setInterval(() => {
            if (state.enabled) {
                scan();
                diagScene();  
            }
        }, 4000);
    }

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
                void 0;
                
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
        void 0;
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

    function texFor(kind) {
        return state.textures[kind] || null;
    }

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

    document.addEventListener(EVT_UPDATE, () => {
        loadAtlases().then(() => {
            if (state.enabled) {
                refreshUniformValues();
                scan();
            }
        });
    });

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
        
        if (state.lastFrag) {
            out.lastFragHas = {
                decl: state.lastFrag.includes('uMfPbrN'),
                normalAnchor: state.lastFrag.includes('mfMapN') && state.lastFrag.includes('vViewPosition.xyz'),
                specAnchor: state.lastFrag.includes('directionalLights[l].direction'),
                fallback: state.lastFrag.includes('mfDiffN'),
                emissive: state.lastFrag.includes('uMfPbrE, MF_PBR_UV'),
                vertVarying: (state.lastVert || '').includes('vMfPbrUv = uv'),
                
                gameUv: (state.lastFrag.match(/#define MF_PBR_UV (\w+)/) || [])[1] || null
            };
        } else {
            out.lastFrag = '¡NUNCA se compiló ningún material hookeado — el hook NO corre!';
        }
        
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
        void 0;
        
        const lf = out.lastFragHas;
        void 0;
        return out;
    }

    function blast() {
        const u = ensureUniforms();
        if (!u) { console.warn(TAG, 'BLAST: sin uniforms'); return; }
        const prev = {
            n: u.uMfPbrNormalStr.value, s: u.uMfPbrSpecStr.value,
            sh: u.uMfPbrShiny.value, e: u.uMfPbrEmiStr.value,
            t: u.uMfPbrTint.value
        };
        void 0;
        u.uMfPbrTint.value = 1.0;  
        u.uMfPbrEmiStr.value = 2.0;
        u.uMfPbrSpecStr.value = 3.0;
        u.uMfPbrNormalStr.value = 3.0;
        u.uMfPbrShiny.value = 4.0;
        
        setTimeout(() => {
            u.uMfPbrTint.value = prev.t;
            u.uMfPbrNormalStr.value = prev.n;
            u.uMfPbrSpecStr.value = prev.s;
            u.uMfPbrShiny.value = prev.sh;
            u.uMfPbrEmiStr.value = prev.e;
            void 0;
        }, 10000);
    }

    async function atlasStats() {
        
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
            void 0;
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
            const step = Math.max(1, Math.floor(w * h / 20000));  
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
                
                estTiles: Math.round(colorful / 256),
                neutralPct: Math.round(neutral / total * 100),
                colorfulPct: Math.round(colorful / total * 100),
                blackPct: Math.round(black / total * 100),
                verdict: colorful < 64
                    ? 'ATLAS VACÍO (0 tiles) — generador falló o pack no matcheó'
                    : 'atlas con relieve real ✓ (' + Math.round(colorful / 256) + ' tiles aprox)'
            };
            void 0;
            return result;
        } catch (e) {
            const r = { ...out, error: String(e.message) };
            void 0;
            return r;
        }
    }
    
    function showAtlas() {
        const u = ensureUniforms();
        if (!u) return false;
        
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
        void 0;
        return next;
    }

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
            return sum / (size * size);  
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
            void 0;
            return result;
        } catch (e) {
            console.warn(TAG, 'ATLAS DIFF error:', e.message);
            return { error: e.message };
        }
    }

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
                    void 0;
                    return { ...res, gpuProg: true, defines, samplers };
                }
                return { ...res, gpuProg: false, pbrProgs, note: 'ningún programa GPU combina vCentroidMapUv + PBR' };
            }
        } catch (e) {
            res.gpuErr = String(e.message);
        }
        
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
                
                const allMapSamplers = [...fs.matchAll(/texture2D\s*\(\s*map\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1]);
                void 0;
                
                const shFull = window.__mfTerrainShaderFull;
                if (shFull) {
                    window.__mfTerrainVert = shFull.vertexShader;
                    
                    const lines = shFull.vertexShader.split('\n')
                        .filter(l => /vMapUv|vOverlayUV|vCentroidMapUv|atlasUv|tileUv|uvTransform/.test(l))
                        .map(l => l.trim()).slice(0, 20);
                    void 0;
                }
            } else {
                console.warn(TAG, 'TERRENO ▸ no recompiló en 3s — render pausado');
            }
            
            const fsDump = window.__mfTerrainFrag || window.__mfTerrainShader;
            if (fsDump) {
                const lightUniforms = [...new Set([...fsDump.matchAll(/uniform\s+(int|float|vec[234]|vec[234]\[\w+\]|mat[34])\s+(\w*[Ll]ight\w*|\w*[Tt]orch\w*|\w*[Gg]low\w*|\w*[Pp]oint\w*)\s*(\[[^\]]*\])?\s*;/g)].map(m => m[0]))];
                const lightLoops = fsDump.split('\n').filter(l => /light|Light|torch|Torch|glow|Glow|lumen|Lumen/i.test(l) && !/^\s*\/\//.test(l)).map(l => l.trim()).slice(0, 24);
                void 0;
                void 0;
            }
            mat.onBeforeCompile = origOBC;
            mat.customProgramCacheKey = origKey;
            mat.needsUpdate = true;
            window.__mfTerrainShader = undefined;
        }, 3000);
        return { ...res, probe: 'espera 3s — mira la línea TERRENO ▸' };
    }

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
                if (detail?.presetId !== id) return;  
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