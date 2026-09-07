// FeatherLite — bootstrap MAIN world
// escucha los llamados del panel (ISOLATED → CustomEvent cruza worlds) y
// ejecuta las acciones contra las APIs MAIN de los módulos copiados.
(function () {
    'use strict';
    if (globalThis.__FEATHER_LITE_BOOT__) return;
    globalThis.__FEATHER_LITE_BOOT__ = true;

    function reply(obj) {
        try { document.dispatchEvent(new CustomEvent('featherlite:p2p-status', { detail: JSON.stringify(obj) })); } catch {}
    }

    // ── skins custom: pedir lista de packs / aplicar pack ──
    document.addEventListener('featherlite:skins-list', () => {
        try {
            const packs = (globalThis.MF_Facial?.packs || [])
                .filter(p => p.skin) // solo packs con skin PNG aplicable
                .map(p => ({ id: p.id, name: p.name, server: !!p.server }));
            document.dispatchEvent(new CustomEvent('featherlite:skins-data', {
                detail: JSON.stringify(packs)
            }));
        } catch {}
    });
    document.addEventListener('featherlite:skin-apply', e => {
        const id = String(e.detail || '');
        (async () => {
            try {
                const F = globalThis.MF_Facial;
                if (!id) await F?.releasePack?.();
                // clase nativa custom: del juego (nueva) con fallback al
                // conducto legacy mfpack: si la copia de MF_Facial es vieja
                else if (typeof F?.applyCustomSkin === 'function') await F.applyCustomSkin(id);
                else await F?.applyPack?.(id);
            } catch {}
        })();
    });

    document.addEventListener('featherlite:call', e => {
        const js = e.detail;
        if (typeof js !== 'string' || !js) return;
        // solo frases permitidas del panel — whitelist por prefijo
        const ok = /^(try\{)?(if\(true\)|if\(false\)|MF_Peer|MF_Facial)/.test(js.trim())
            || /^try\{if\((true|false)\)MF_Facial/.test(js.trim())
            || /^try\{MF_Peer\.(host|join)\('/.test(js.trim());
        if (!ok) return;
        try { (0, eval)(js); } catch {}
    });

    // reanudar facial auto al cargar si estaba ON
    let tries = 0;
    const t = setInterval(() => {
        tries++;
        const F = globalThis.MF_Facial;
        if (F) {
            clearInterval(t);
            try {
                const others = JSON.parse(localStorage.getItem('minifeather_facials_v1_others') || '{}');
                const last = localStorage.getItem('minifeather_facials_v1_last');
                if (others.on || last === 'auto') F.autoStart?.();
            } catch {}
            // re-aplicar la skin custom persistida (una sola vez por carga).
            // SOLO si el usuario no eligió ya una skin del server en esa
            // sesión (marca en sessionStorage): su elección gana siempre.
            const skin = localStorage.getItem('featherlite.skin.v1');
            const released = sessionStorage.getItem('featherlite.skin.released');
            if (skin && released !== skin && released !== '') {
                let applied = false;
                const t2 = setInterval(() => {
                    if (applied) { clearInterval(t2); return; }
                    const me = globalThis.miniblox?.player || globalThis.MF_Facial?.player;
                    const cur = me?.profile?.cosmetics?.skin;
                    // aceptar el id nuevo (custom:mf_<id>) y el legacy (mfpack:<id>)
                    if (cur === 'custom:mf_' + skin || cur === 'mfpack:' + skin) { applied = true; return; }
                    if (me?.mesh || cur) {
                        applied = true;
                        if (cur !== 'custom:mf_' + skin && cur !== 'mfpack:' + skin) {
                            const F2 = globalThis.MF_Facial;
                            if (typeof F2?.applyCustomSkin === 'function') F2.applyCustomSkin(skin).catch?.(() => {});
                            else F2?.applyPack?.(skin).catch?.(() => {});
                        }
                    }
                }, 1500);
                setTimeout(() => clearInterval(t2), 45000);
            }
        } else if (tries > 120) clearInterval(t);
    }, 500);

    console.log('[FeatherLite] boot MAIN listo');
})();
