(function () {
    'use strict';

    if (globalThis.__MF_SKIN_GUARD__) return;

    // filtro de contenido para skins/capas subidas por el usuario: la eula §8.2
    // prohíbe el contenido sexual, y hasta hoy el client no miraba ni una textura.
    // esto NO es un moderador humano ni un modelo de IA: es una heurística de
    // regiones del layout de skin de minecraft (pecho+ingle+trasero/piernas
    // dominados por tono de piel = desnudo integral) + blocklist de hashes
    // mantenida por el equipo (assets/skin-blocklist.json). falla en las dos
    // direcciones y lo dice en la eula; el canal de reportes alimenta la
    // blocklist. la vida local es del usuario: import local = confirmación,
    // p2p/remoto = bloqueo duro (nadie consiente contenido que no pidió).

    const TAG = 'minifeather skinguard';
    const warn = (...a) => { try { console.warn('[' + TAG + ']', ...a); } catch (_) {} };

    const BLOCKLIST_URL = 'https://raw.githubusercontent.com/DevOfficial-Client/MiniFeather-Client/main/assets/skin-blocklist.json';
    const BL_CACHE_KEY = 'mf:skinguard:bl:v1';
    const BL_TTL = 6 * 60 * 60 * 1000;

    let blocklist = null;
    let blFetchedAt = 0;
    let blFetching = null;

    // ── heurística pura (exportada para tests: solo rgba, sin DOM) ────────────

    function isSkinTone(r, g, b) {
        // amplio a propósito: cubre pieles claras, morenas y oscuras del pixelart;
        // los falsos positivos de color (naranjas, marrones) los salva el requisito
        // de que TODAS las regiones íntimas sean piel-dominantes a la vez.
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        return r > 60 && g > 35 && b > 18 && r >= g && g > b - 8 && (r - b) > 12 && (mx - mn) > 12;
    }

    // regiones del layout base 64x64 (válidas también en legacy 64x32; en HD se
    // escalan por w/64). ratio = píxeles de piel / píxeles opacos; región vacía
    // (transparente, p.ej. el torso trasero en 64x32) queda excluida con -1.
    const REGIONS = [
        { name: 'chest', x: 20, y: 20, w: 8, h: 8 },
        { name: 'groin', x: 20, y: 28, w: 8, h: 4 },
        { name: 'butt', x: 32, y: 28, w: 8, h: 4 },
        { name: 'legFront', x: 4, y: 20, w: 4, h: 12 }
    ];

    function evaluateSkinPixels(width, height, data) {
        // por debajo del layout base (64 ancho / 32 alto) esto no es una skin:
        // no opinar (cualquier región cabría en cualquier parte y sería todo ruido)
        if (width < 64 || height < 32 || !data) return { flag: false, reason: null, stats: {}, overall: 0 };
        const f = width / 64;
        const opaqueTotal = { count: 0, skin: 0 };
        const stats = {};
        for (const reg of REGIONS) {
            const rx = Math.round(reg.x * f), ry = Math.round(reg.y * f);
            const rw = Math.max(1, Math.round(reg.w * f)), rh = Math.max(1, Math.round(reg.h * f));
            if (rx + rw > width || ry + rh > height) { stats[reg.name] = -1; continue; }
            let opaque = 0, skin = 0;
            for (let py = ry; py < ry + rh; py++) {
                for (let px = rx; px < rx + rw; px++) {
                    const i = (py * width + px) * 4;
                    if (data[i + 3] < 40) continue;
                    opaque++;
                    if (isSkinTone(data[i], data[i + 1], data[i + 2])) skin++;
                }
            }
            opaqueTotal.count += opaque;
            opaqueTotal.skin += skin;
            stats[reg.name] = opaque > 0 ? skin / opaque : -1;
        }
        const overall = opaqueTotal.count > 0 ? opaqueTotal.skin / opaqueTotal.count : 0;
        // desnudo integral: torso superior + ingle con piel, y además trasero o
        // piernas peladas. topless/sin camisa NO se marca (los hay legítimos a
        // montones) y un bañista entra justo por debajo del umbral del pecho.
        const nude = stats.chest >= 0.8 && stats.groin >= 0.8
            && (stats.butt >= 0.8 || stats.legFront >= 0.8) && overall >= 0.3;
        return { flag: nude, reason: nude ? 'nsfw-heuristic' : null, stats, overall };
    }

    // ── decodificación + hash ─────────────────────────────────────────────────

    function loadImage(url) {
        return new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = () => rej(new Error('decode'));
            img.src = url;
        });
    }

    async function sha256Hex(bytes) {
        if (!(globalThis.crypto && globalThis.crypto.subtle)) return null;
        const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
    }

    async function dataUrlBytes(dataUrl) {
        const r = await fetch(dataUrl);
        return new Uint8Array(await r.arrayBuffer());
    }

    // verdicto completo de un dataURL de imagen: blocklist primero (exacto),
    // heurística después (mejor esfuerzo). nunca tira: falla abierto.
    async function checkDataUrl(dataUrl) {
        const out = { flag: false, reason: null, hash: null, stats: null };
        if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image') !== 0) return out;
        try {
            const bytes = await dataUrlBytes(dataUrl);
            out.hash = await sha256Hex(bytes);
            if (out.hash && isBlocklisted(out.hash)) {
                out.flag = true;
                out.reason = 'blocklist';
                return out;
            }
            const img = await loadImage(dataUrl);
            const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
            if (!w || !h || w > 512 || h > 512) return out; // fuera de layout de skin: no opinar
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return out;
            ctx.drawImage(img, 0, 0);
            const px = ctx.getImageData(0, 0, w, h).data;
            const v = evaluateSkinPixels(w, h, px);
            out.stats = v.stats;
            if (v.flag) { out.flag = true; out.reason = v.reason; }
        } catch (e) {
            warn('check falló (falla abierto):', e?.message || e);
        }
        return out;
    }

    // ── blocklist (hashes sha-256 hex) ────────────────────────────────────────

    function isBlocklisted(hash) {
        if (!blocklist || !hash) return false;
        return blocklist.indexOf(String(hash).toLowerCase()) !== -1;
    }

    function setBlocklist(hashes) {
        blocklist = Array.isArray(hashes) ? hashes.map(h => String(h).toLowerCase()) : [];
        blFetchedAt = Date.now();
    }

    function loadBlocklistCache() {
        try {
            const raw = JSON.parse(localStorage.getItem(BL_CACHE_KEY) || 'null');
            if (raw && Array.isArray(raw.hashes) && (Date.now() - (raw.at || 0)) < BL_TTL) {
                setBlocklist(raw.hashes);
                blFetchedAt = raw.at;
                return true;
            }
        } catch (_) {}
        return false;
    }

    function saveBlocklistCache(hashes) {
        try { localStorage.setItem(BL_CACHE_KEY, JSON.stringify({ at: Date.now(), hashes })); } catch (_) {}
    }

    function loadRemoteBlocklist(force) {
        if (!force && (blocklist || blFetching)) return blFetching;
        if (!force && loadBlocklistCache()) return Promise.resolve();
        blFetching = fetch(BLOCKLIST_URL, { cache: 'no-cache' })
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(json => {
                const hashes = Array.isArray(json?.hashes) ? json.hashes : [];
                setBlocklist(hashes);
                saveBlocklistCache(hashes);
            })
            .catch(() => { /* sin lista: solo heurística; silencio, no es deber de nadie */ })
            .then(() => { blFetching = null; });
        return blFetching;
    }

    // ── registro custodiado (__MF_PACK_SKINS__) ───────────────────────────────
    // AQUÍ es donde de verdad se cargan las skins: cosmetics (p2p, api de skins,
    // packs dev, facial) escribe en este registro con `__MF_PACK_SKINS__ ||= {}`
    // y el juego lo lee vía el hook del img.src y el patch de fetch. skinguard
    // carga ANTES que todos en mirror.json, así que instala un Proxy: escrituras
    // data:image se revisan async y las marcadas desaparecen del registro para
    // CUALQUIER lector (get-trap → undefined). los dataURL repetidos (epoch
    // bumps re-escriben todo) se cachean para no re-decodificar. :v
    const blockedIds = new Set();
    const checkedUrls = new Map();
    const CHECKED_CAP = 400;

    function rememberVerdict(dataUrl, flagged, key) {
        if (checkedUrls.size > CHECKED_CAP) checkedUrls.clear();
        checkedUrls.set(dataUrl, flagged);
        if (key) {
            if (flagged) blockedIds.add(key);
            else blockedIds.delete(key);
        }
    }

    function isBlockedId(id) { return typeof id === 'string' && blockedIds.has(id); }
    function markBlockedId(id, blocked) {
        if (typeof id !== 'string') return;
        if (blocked) blockedIds.add(id);
        else blockedIds.delete(id);
    }

    function installRegistry() {
        if (globalThis.__MF_PACK_SKINS__) return; // nunca (orden del mirror), pero por si el orden cambia algún día
        const target = {};
        globalThis.__MF_PACK_SKINS__ = new Proxy(target, {
            set(t, k, v) {
                t[k] = v;
                if (typeof k === 'string' && typeof v === 'string' && v.indexOf('data:image') === 0) {
                    const known = checkedUrls.get(v);
                    if (known === true) blockedIds.add(k);
                    else if (known === undefined) {
                        checkDataUrl(v)
                            .then(verdict => rememberVerdict(v, verdict.flag, k))
                            .catch(() => {});
                    }
                }
                return true;
            },
            get(t, k) {
                if (typeof k === 'string' && blockedIds.has(k)) return undefined;
                return t[k];
            },
            deleteProperty(t, k) {
                if (typeof k === 'string') blockedIds.delete(k);
                delete t[k];
                return true;
            }
        });
    }

    // ── puente hacia el isolated world (panel): evento in → evento out ────────

    function installBridge() {
        if (typeof window === 'undefined' || !window.addEventListener) return;
        window.addEventListener('mf-skinguard-check', ev => {
            const d = ev && ev.detail;
            if (!d || typeof d.token !== 'string') return;
            Promise.resolve()
                .then(() => checkDataUrl(d.dataUrl))
                .then(v => {
                    window.dispatchEvent(new CustomEvent('mf-skinguard-result', {
                        detail: { token: d.token, flag: v.flag, reason: v.reason, hash: v.hash }
                    }));
                })
                .catch(() => {
                    window.dispatchEvent(new CustomEvent('mf-skinguard-result', {
                        detail: { token: d.token, flag: false, reason: 'error' }
                    }));
                });
        }, true);
    }

    installBridge();
    installRegistry();
    loadRemoteBlocklist();

    globalThis.__MF_SKIN_GUARD__ = { evaluateSkinPixels, checkDataUrl, isBlocklisted, setBlocklist, loadRemoteBlocklist, isBlockedId, markBlockedId };
})();
