(function () {
    'use strict';

    // re-ejecución (hot-reload): desenganchar todo antes de nada
    try { window.__MF_KOTOSKY_SCOPE__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather kotosky';

    // ─────────────────────────────────────────────────────────────────────
    // Cielo nocturno real: el cubemap "nighttime sky" de koto (skybox vanilla
    // de Bedrock, ruta overworld_cubemap) montado como un domo propio. El
    // juego pinta su noche con un domo de atmósfera (E1e: esfera 5000
    // back-side en ambientMeshes) + 1000 estrellitas de puntos; añadimos OTRO
    // domo con las 6 caras como texturas planas — sin THREE.CubeTexture
    // porque el bundle no expone THREE y no hace falta: el fragment elige
    // cara por eje dominante y muestrea uv manual.
    // Orden de caras = convención Bedrock (0=sur,+Z · 1=este,+X · 2=norte,−Z
    // · 3=oeste,−X · 4=arriba,+Y · 5=abajo,−Y) con las imágenes volteadas en
    // Y (flipud) — verificado empíricamente por continuidad de costuras
    // entre caras (las 4 laterales forman una panorámica continua).
    // El domo se funde con uMix = alpha: el gradiente vanilla queda debajo en
    // el crepúsculo y de día no se toca NADA (mezcla 0 → domo oculto).
    // El factor noche sale de la elevación del sol del juego (sun.offset.y,
    // la misma señal que usan su domo y sus estrellas) y se apaga con lluvia.
    // Crédito: pack por koto ("nighttime sky by koto" 1.0).
    // ─────────────────────────────────────────────────────────────────────

    const FACE_FILES = ['face_0.png', 'face_1.png', 'face_2.png', 'face_3.png', 'face_4.png', 'face_5.png'];
    const LINEAR_FILTER = 1006;   // constante estable del bundle (THREE.LinearFilter)

    const VERT = `
        varying vec3 vMfWorldPos;
        void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vMfWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
        }
    `;

    const FRAG = `
        uniform sampler2D tMfSouth;
        uniform sampler2D tMfEast;
        uniform sampler2D tMfNorth;
        uniform sampler2D tMfWest;
        uniform sampler2D tMfUp;
        uniform sampler2D tMfDown;
        uniform float uMfMix;
        varying vec3 vMfWorldPos;

        void main() {
            vec3 d = normalize(vMfWorldPos - cameraPosition);
            float ax = abs(d.x), ay = abs(d.y), az = abs(d.z);
            vec3 col;
            // uv estándar GL por eje dominante; con flipY=false el renglón 0 de
            // la textura ES el renglón superior de la imagen, así que w = v_gl
            // directo (el flipud del pack ya queda absorbido por esa convención)
            if (ax >= ay && ax >= az) {
                float u = (d.x >= 0.0) ? 0.5 * (1.0 - d.z / ax) : 0.5 * (1.0 + d.z / ax);
                float w = 0.5 * (1.0 - d.y / ax);
                col = (d.x >= 0.0) ? texture2D(tMfEast, vec2(u, w)).rgb
                                   : texture2D(tMfWest, vec2(u, w)).rgb;
            } else if (ay >= az) {
                float u = 0.5 * (1.0 + d.x / ay);
                float w = (d.y >= 0.0) ? 0.5 * (1.0 + d.z / ay) : 0.5 * (1.0 - d.z / ay);
                col = (d.y >= 0.0) ? texture2D(tMfUp, vec2(u, w)).rgb
                                   : texture2D(tMfDown, vec2(u, w)).rgb;
            } else {
                float u = (d.z >= 0.0) ? 0.5 * (1.0 + d.x / az) : 0.5 * (1.0 - d.x / az);
                float w = 0.5 * (1.0 - d.y / az);
                col = (d.z >= 0.0) ? texture2D(tMfSouth, vec2(u, w)).rgb
                                   : texture2D(tMfNorth, vec2(u, w)).rgb;
            }
            gl_FragColor = vec4(col, uMfMix);
        }
    `;

    const state = {
        enabled: localStorage.getItem('mf_kotosky') === 'true',
        strength: readNum('mf_kotosky_strength', 1),
        game: null,
        lastScan: 0,
        timer: 0,
        raf: 0,
        rawImgs: null,          // 6 <img> cargadas, pendientes de materializar
        textures: [],
        loaded: false,
        loadFailed: false,
        mesh: null,
        mat: null,
        geo: null,
        geoShared: false,
        mix: 0,
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

    function gameUsable(g) {
        try {
            return !!(g && g.player && g.gameScene?.ambientMeshes && g.gameScene?.sky?.atmosphere);
        } catch (_) { return false; }
    }

    function daylightSky(g) {
        try {
            const w = g.world;
            if (w && typeof w.hasDaylightSky === 'function') return !!w.hasDaylightSky();
            const dim = w?.dimension ?? g.dimension;
            return dim === undefined ? true : (dim === 0 || dim === 2);
        } catch (_) { return true; }
    }

    function rainStrength(g) {
        try { return Math.max(0, Math.min(1, Number(g.world?.getRainStrength?.(1)) || 0)); }
        catch (_) { return 0; }
    }

    function smoothstep(a, b, x) {
        const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1e-6)));
        return t * t * (3 - 2 * t);
    }

    // ── carga de caras ──────────────────────────────────────────────────
    // La textura THREE se materializa después robando el constructor del
    // primer .map vivo de la escena (el bundle no da THREE; los sprites del
    // sol/luna traen Texture). Por eso la carga va por fases: <img> primero,
    // materialización cuando haya un game al que robarle la clase.

    function loadFaces() {
        if (state.rawImgs || state.loadFailed) return;
        const imgs = FACE_FILES.map(() => null);
        let pending = FACE_FILES.length;
        let done = false;
        FACE_FILES.forEach((file, i) => {
            const img = new Image();
            img.onload = () => {
                imgs[i] = img;
                if (--pending === 0 && !done) { done = true; state.rawImgs = imgs; }
            };
            img.onerror = () => {
                if (done) return;
                done = true;
                state.loadFailed = true;
                console.warn(TAG, 'no se pudo cargar', file, '— módulo inerte (fail-open)');
            };
            try { img.src = chrome.runtime.getURL('assets/koto_sky/' + file); }
            catch (_) { img.src = 'assets/koto_sky/' + file; }
        });
    }

    function stealTextureCtor(g) {
        try {
            const s = g.gameScene?.sun;
            const cand = s?.sun?.material?.map || s?.moon?.material?.map;
            if (cand?.constructor) return cand.constructor;
        } catch (_) {}
        try {
            let found = null;
            g.gameScene?.scene?.traverse?.((o) => {
                if (found) return;
                const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
                for (const m of mats) {
                    if (m?.map?.constructor && m.map.isTexture) { found = m.map.constructor; return; }
                }
            });
            return found;
        } catch (_) { return null; }
    }

    function materializeTextures(g) {
        const TexCtor = stealTextureCtor(g);
        if (!TexCtor) return false;   // aún no hay nada que robar: reintentar
        state.textures = state.rawImgs.map((img) => {
            const t = new TexCtor();
            t.image = img;
            t.flipY = false;          // el uv del shader ya lleva el flip horneado
            t.magFilter = LINEAR_FILTER;
            t.minFilter = LINEAR_FILTER;
            t.generateMipmaps = false;
            t.needsUpdate = true;
            return t;
        });
        state.loaded = true;
        console.info(TAG, '✔ 6 caras cargadas (nighttime sky by koto 1.0)');
        return true;
    }

    // ── montaje del domo ────────────────────────────────────────────────

    function buildDome(g) {
        const atmo = g.gameScene.sky.atmosphere;
        const MatCtor = atmo.material?.constructor;
        if (!MatCtor) {
            state.loadFailed = true;
            console.warn(TAG, 'sin ShaderMaterial robable — módulo inerte');
            return;
        }

        let geo = atmo.geometry;
        let shared = true;
        try {
            const GeoCtor = atmo.geometry.constructor;
            const p = atmo.geometry.parameters || {};
            geo = new GeoCtor(p.radius || 5000, p.widthSegments || 32, p.heightSegments || 16);
            shared = false;
        } catch (_) {}   // compartida: solo lectura, nunca se le hace dispose

        const uniforms = {
            tMfSouth: { value: state.textures[0] || null },
            tMfEast: { value: state.textures[1] || null },
            tMfNorth: { value: state.textures[2] || null },
            tMfWest: { value: state.textures[3] || null },
            tMfUp: { value: state.textures[4] || null },
            tMfDown: { value: state.textures[5] || null },
            uMfMix: { value: 0 }
        };
        const mat = new MatCtor({
            uniforms,
            vertexShader: VERT,
            fragmentShader: FRAG,
            side: atmo.material.side,     // back-side igual que el domo vanilla
            transparent: true,
            depthWrite: false,
            fog: false
        });

        const MeshCtor = atmo.constructor;
        if (typeof MeshCtor !== 'function') {
            try { mat.dispose?.(); } catch (_) {}
            if (!shared) { try { geo.dispose?.(); } catch (_) {} }
            state.loadFailed = true;
            console.warn(TAG, 'sin Mesh robable — módulo inerte');
            return;
        }
        const mesh = new MeshCtor(geo, mat);
        // renderOrder -3: antes que sol/luna (-2) y estrellas (0) para que la
        // luna y los puntos vanilla queden por encima del foto-cielo
        mesh.renderOrder = -3;
        mesh.frustumCulled = false;
        mesh.visible = false;

        state.geo = geo;
        state.geoShared = shared;
        state.mat = mat;
        state.mesh = mesh;
        try { g.gameScene.ambientMeshes.add(mesh); } catch (_) {}
    }

    function teardownDome() {
        try { state.mesh?.parent?.remove(state.mesh); } catch (_) {}
        try { state.mat?.dispose?.(); } catch (_) {}
        if (state.geo && !state.geoShared) { try { state.geo.dispose?.(); } catch (_) {} }
        state.mesh = null;
        state.mat = null;
        state.geo = null;
        state.geoShared = false;
    }

    // ── factor noche ────────────────────────────────────────────────────

    function nightFactor(g) {
        if (!daylightSky(g)) return 0;
        let depth = 0;
        try {
            const sun = g.gameScene.sun;
            const dist = Number(sun?.sunDist) || 5e4;
            depth = -(Number(sun?.offset?.y) || 0) / dist;   // 0 al ponerse, >0 de noche
        } catch (_) { return 0; }
        let f = smoothstep(0, 0.12, depth);
        f *= 1 - 0.9 * rainStrength(g);   // con lluvia la vía láctea no se ve
        return Math.max(0, Math.min(1, f));
    }

    // ── bucle ───────────────────────────────────────────────────────────
    // rAF solo cuando hay domo vivo que mover; esperas (menú, carga de
    // caras) van por setTimeout de 2s como el scan de WaterStyle.

    function frame() {
        state.raf = 0;
        if (!state.enabled || state.destroyed || state.loadFailed) return;

        const g = state.game;
        if (!g || !gameUsable(g)) { idleTick(); return; }

        if (!state.loaded && state.rawImgs) materializeTextures(g);
        if (!state.loaded) { idleTick(); return; }

        // mundo nuevo → domo nuevo (la escena vieja murió con el game anterior)
        if (!state.mesh || state.mesh.parent !== g.gameScene.ambientMeshes) {
            teardownDome();
            buildDome(g);
        }
        if (!state.mesh) { idleTick(); return; }

        const pos = g.player?.pos;
        if (pos) {
            try { state.mesh.position.set(pos.x, pos.y, pos.z); } catch (_) {}
        }

        const target = nightFactor(g) * Math.max(0, Math.min(1, state.strength));
        // relajación suave: lluvia y crepúsculo sin saltos
        state.mix += (target - state.mix) * 0.08;
        if (Math.abs(target - state.mix) < 0.002) state.mix = target;
        state.mat.uniforms.uMfMix.value = state.mix;
        state.mesh.visible = state.mix > 0.004;

        state.raf = requestAnimationFrame(frame);
    }

    function idleTick() {
        if (state.timer || !state.enabled || state.destroyed || state.loadFailed) return;
        state.timer = setTimeout(() => {
            state.timer = 0;
            if (!state.enabled || state.destroyed || state.loadFailed) return;
            const now = performance.now();
            if (now - state.lastScan < 1900) { idleTick(); return; }
            state.lastScan = now;
            state.game = findGame();
            if (gameUsable(state.game)) state.raf = requestAnimationFrame(frame);
            else idleTick();
        }, 2000);
    }

    // ── control ─────────────────────────────────────────────────────────

    function enable() {
        state.enabled = true;
        localStorage.setItem('mf_kotosky', 'true');
        loadFaces();
        if (gameUsable(state.game)) state.raf = requestAnimationFrame(frame);
        else idleTick();
    }

    function disable() {
        state.enabled = false;
        localStorage.setItem('mf_kotosky', 'false');
        if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
        if (state.timer) { clearTimeout(state.timer); state.timer = 0; }
        state.mix = 0;
        teardownDome();
    }

    function setConfig(cfg) {
        if (cfg && cfg.strength !== undefined) {
            const s = parseFloat(cfg.strength);
            if (Number.isFinite(s)) {
                state.strength = Math.max(0, Math.min(1, s));
                localStorage.setItem('mf_kotosky_strength', String(state.strength));
            }
        }
    }

    function status() {
        return {
            enabled: state.enabled,
            loaded: state.loaded,
            failed: state.loadFailed,
            strength: state.strength,
            mix: state.mix,
            mounted: !!state.mesh
        };
    }

    function destroy() {
        state.destroyed = true;
        disable();
        state.textures = [];
        state.rawImgs = null;
        state.loaded = false;
        try { delete window.MF_KotoSky; } catch (_) {}
        try { delete window.__MF_KOTOSKY_SCOPE__; } catch (_) {}
    }

    document.addEventListener('minifeather:kotosky-config', (ev) => {
        try {
            const cfg = JSON.parse(ev.detail || '{}');
            if (cfg.enabled === true) enable();
            else if (cfg.enabled === false) disable();
            setConfig(cfg);
        } catch (_) {}
    });

    window.MF_KotoSky = { enable, disable, setConfig, status, destroy };
    window.__MF_KOTOSKY_SCOPE__ = { destroy };
    console.info(TAG, 'módulo cargado (inactivo hasta minifeather:kotosky-config {enabled:true})');
})();
