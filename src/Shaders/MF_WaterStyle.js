(function () {
    'use strict';

    // re-ejecución (hot-reload): desenganchar todo antes de nada
    try { window.__MF_WATERSTYLE_SCOPE__?.destroy?.(); } catch (_) {}

    const TAG = 'minifeather waterstyle';

    // ─────────────────────────────────────────────────────────────────────
    // Agua 100% transparente con tinte verdoso. El juego renderiza el fluido
    // con UN material compartido (agua + lava) cuyo onBeforeCompile inyecta
    // el shader de olas/refracciones (`water_shader_v53`); se identifica
    // porque es el único con userData.waterShadersEnabled. Envolvemos su
    // onBeforeCompile y añadimos AL FINAL del fragment main un override que
    // re-tinta por luminancia y fija el alfa — gated por vColor.r < 0.49,
    // el mismo discriminador agua/lava que usa el shader del juego, así que
    // la lava queda intacta (sigue full-bright con su sheen).
    // Sin exposición automática de nada: dos sliders (opacidad y fuerza del
    // tinte) mandan, y el color verde es fijo pero editable por config.
    // ─────────────────────────────────────────────────────────────────────

    const TINT = [0.45, 0.95, 0.55];   // verde agua; lum × esto = tono final

    const state = {
        enabled: localStorage.getItem('mf_waterstyle') === 'true',
        alpha: readNum('mf_waterstyle_alpha', 0.12),
        tintMix: readNum('mf_waterstyle_tintmix', 0.85),
        game: null,
        scanTimer: 0,
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
            uMfWaterTint: { value: TINT.slice() }
        };

        const wrapper = function (shader) {
            orig(shader);
            shader.uniforms.uMfWaterAlpha = liveUniforms.uMfWaterAlpha;
            shader.uniforms.uMfWaterTintMix = liveUniforms.uMfWaterTintMix;
            shader.uniforms.uMfWaterTint = liveUniforms.uMfWaterTint;
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
            return base + '_mfws_v1';
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
        }
    }

    function enable() {
        state.enabled = true;
        localStorage.setItem('mf_waterstyle', 'true');
        if (!state.scanTimer) {
            state.scanTimer = setInterval(scan, 2000);
        }
        scan();
    }

    function disable() {
        state.enabled = false;
        localStorage.setItem('mf_waterstyle', 'false');
        if (state.scanTimer) { clearInterval(state.scanTimer); state.scanTimer = 0; }
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
