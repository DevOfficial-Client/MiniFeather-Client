// MiniFeather — CustomSkinAPI: emulador local de la custom skin API del server
//
// El juego tiene un flujo NATIVO de skins custom (descubierto en el bundle
// Account-*.js con Puppeteer):
//   1. Armario → botón "Upload Custom Skin" → POST /auth-api/accounts/custom_skin/upload
//      con {image: <base64 PNG>} → responde {skinId: "custom:<uuid>:<v>"}
//   2. El armario muestra "Custom Skin" (owned, id "skin.custom") en el
//      inventario, y POST /accounts/set_cosmetic {type:'skin', id:'skin.custom'}
//      la selecciona.
//   3. El juego descarga el PNG de /auth-api/skins/custom/<uuid>.png
//      (interceptor de <img src> de MF_Facial/CustomSkins ya lo sirve local).
//   Requisito del server: rango Eternus. El id solo existe PARA TI (una custom
//   skin por cuenta).
//
// ESTE MÓDULO emula esa API en local:
//   - intercepta POST custom_skin/upload → guarda el PNG en IndexedDB y
//     responde {skinId: "custom:mfup_<id>"} SIN tocar el server
//   - intercepta POST set_cosmetic (type skin + id skin.custom) → aplica la
//     última skin subida (local, no server-side)
//   - parchea /accounts/me y el profile del juego para que el armario muestre
//     "Custom Skin" como owned (inventario incluye 'skin.custom') y la skin
//     activa sea la nuestra
//   - registra el PNG subido en __MF_PACK_SKINS__ para que el hook de <img>
//     lo sirva cuando el juego pida /auth-api/skins/custom/mfup_<id>.png
//   - persiste en localStorage (dataURL, tamaño razonable) para sobrevivir reloads
//
// Resultado: TODO el flujo del armario nativo del juego funciona — upload,
// preview, selección, persistencia — sin rango Eternus y sin server.
// Solo tú la ves (client-side); para que otros la vean usan el override de
// CustomSkins.js o Look Sync P2P.
(() => {
    'use strict';
    if (window.__MF_CustomSkinAPI) return;
    window.__MF_CustomSkinAPI = true;

    const TAG = '[MiniFeather CustomSkinAPI]';
    const VERBOSE = localStorage.getItem('mf:csa:verbose') === '1';
    const log = (...a) => { if (VERBOSE) console.log(TAG, ...a); };
    const warn = (...a) => console.warn(TAG, ...a);

    // ── estado persistente ──
    // localStorage: skin subida como dataURL + su id. Claves:
    //   mf:csa:skin     → dataURL del PNG (máx ~4MB tras base64)
    //   mf:csa:id       → "mfup_<n>" (contador en mf:csa:seq)
    const KEY_SKIN = 'mf:csa:skin';
    const KEY_ID = 'mf:csa:id';
    const KEY_ACTIVE = 'mf:csa:active';   // '1' si skin.custom está seleccionada
    const KEY_SEQ = 'mf:csa:seq';

    const packSkinReg = (globalThis.__MF_PACK_SKINS__ ||= {});

    function getStoredSkin() {
        try {
            const url = localStorage.getItem(KEY_SKIN);
            if (!url || !url.startsWith('data:image/png;base64,')) return null;
            return { url, id: localStorage.getItem(KEY_ID) || null };
        } catch { return null; }
    }

    function nextUploadId() {
        let n = parseInt(localStorage.getItem(KEY_SEQ) || '0', 10) || 0;
        n += 1;
        try { localStorage.setItem(KEY_SEQ, String(n)); } catch {}
        return 'mfup_' + Date.now().toString(36) + '_' + n;
    }

    // ¿es PNG válido por dimensiones? (mismo criterio del juego: potencia de 2
    // 64..2048, cuadrado o 2:1 legacy) — el juego igual lo valida al cargar
    async function validatePng(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const ok = (() => {
                    const sizes = [];
                    for (let s = 64; s <= 2048; s *= 2) sizes.push(s);
                    const w = img.naturalWidth, h = img.naturalHeight;
                    return sizes.includes(w) && (h === w || h === w / 2);
                })();
                resolve(ok ? { w: img.naturalWidth, h: img.naturalHeight } : null);
            };
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    // ── aplicar la skin al profile del juego (local) ──
    // Mismo mecanismo que MF_Facial.applyPackSkinToGame: setear el id en
    // profile.cosmetics.skin y recrear el mesh.
    function getGame() {
        if (globalThis.miniblox?.player) return globalThis.miniblox;
        try {
            const react = document.querySelector('#react');
            if (react) for (const root of Object.values(react)) {
                const g = root?.updateQueue?.baseState?.element?.props?.game;
                if (g?.player) return g;
            }
        } catch {}
        return null;
    }

    function applySkinLocal(skinId) {
        const g = getGame();
        const me = g?.player;
        if (!g || !me) return false;
        try {
            me.profile.cosmetics.skin = skinId;
            let mesh = null;
            try { mesh = g.world?.getPlayerById?.(me.id)?.mesh || me.mesh; } catch {}
            if (mesh?.recreate) mesh.recreate();
            else if (typeof mesh?.init === 'function') mesh.init();
            log('skin aplicada al profile local:', skinId);
            return true;
        } catch (e) { warn('applySkinLocal falló:', e?.message || e); return false; }
    }

    // ── emulación del upload ──
    // Guarda el PNG y responde {skinId} — el juego cree que el server la guardó.
    async function emulateUpload(body) {
        const b64 = typeof body?.image === 'string' ? body.image : null;
        if (!b64) throw Object.assign(new Error('Skin must be a PNG image'), { status: 400 });
        const dataUrl = 'data:image/png;base64,' + b64;
        const dims = await validatePng(dataUrl);
        if (!dims) throw Object.assign(
            new Error(`Skin must be 64x64 up to 2048x2048 (square, or 2:1 legacy)`), { status: 400 });
        if (dataUrl.length > 4 * 1024 * 1024) {
            warn('PNG muy grande para localStorage, solo en memoria esta sesión');
        }
        const id = nextUploadId();
        try {
            localStorage.setItem(KEY_SKIN, dataUrl);
            localStorage.setItem(KEY_ID, id);
        } catch (e) {
            warn('no se pudo persistir la skin (quota):', e?.message || e);
        }
        // registrar para el interceptor de <img src>: cuando el juego pida
        // /auth-api/skins/custom/mfup_xxx.png le servimos nuestro PNG
        packSkinReg[id] = dataUrl;
        // propagar al mesh P2P: los otros nodos la registran y lo aplican
        // a MI entidad en sus vistas (todos con las mismas facultades)
        try {
            globalThis.MF_Mesh?.shareSkinUp?.(id, dataUrl);
        } catch {}
        log('upload emulado:', id, dims);
        return { skinId: 'custom:' + id };
    }

    // ── emulación de set_cosmetic ──
    async function emulateSetCosmetic(body) {
        if (body?.type === 'skin' && (body?.id === 'skin.custom' || body?.id?.startsWith?.('custom:'))) {
            const stored = getStoredSkin();
            if (stored?.id) {
                try { localStorage.setItem(KEY_ACTIVE, '1'); } catch {}
                applySkinLocal('custom:' + stored.id);
            }
            return { ok: true };
        }
        // cualquier otro cosmético: dejar pasar al server real
        return null;
    }

    // ── inventario: marcar "skin.custom" como owned ──
    function patchInventory(data) {
        if (!data || typeof data !== 'object') return false;
        // /accounts/me trae el inventario como array de strings (según el
        // bundle: inventory.includes('skin.custom') habilita el botón Upload)
        if (Array.isArray(data.inventory) && !data.inventory.includes('skin.custom')) {
            data.inventory.push('skin.custom');
            return true;
        }
        return false;
    }

    // ── parche del profile activo (respuesta de /accounts/me) ──
    // El armario habilita el botón "Upload Custom Skin" solo si el
    // inventario incluye 'skin.custom'. Lo añadimos a la respuesta para
    // que el juego crea que la cuenta tiene el privilegio.
    function patchProfile(data) {
        if (!data || typeof data !== 'object') return false;
        let changed = false;
        // 1) inventario owned
        if (Array.isArray(data.inventory) && !data.inventory.includes('skin.custom')) {
            data.inventory.push('skin.custom');
            changed = true;
        }
        // 2) skin activa: si tenemos una custom subida y seleccionada, y el
        // server no manda una skin custom real, mostrar la nuestra
        const active = localStorage.getItem(KEY_ACTIVE) === '1';
        const stored = getStoredSkin();
        if (active && stored?.id && typeof data.cosmetics === 'object' && data.cosmetics !== null) {
            const cur = data.cosmetics.skin;
            const isOurs = typeof cur === 'string' && cur.startsWith('custom:mfup_');
            if (!cur || isOurs) {
                data.cosmetics.skin = 'custom:' + stored.id;
                changed = true;
            }
        }
        return changed;
    }

    // ── respuesta /accounts/me: reconstruir con el parche ──
    function patchAccountsMe() {
        if (window.__mfCsaMePatched) return;
        if (typeof window.fetch !== 'function') return;
        const orig = window.fetch;
        window.fetch = function (input, init) {
            const url = typeof input === 'string' ? input
                : (input && input.url) ? input.url : '';
            // el juego pide /accounts/me con POST y body {} (userRequest)
            if (!/\/accounts\/me(\?|$)/.test(url)) {
                return orig.apply(this, arguments);
            }
            return orig.apply(this, arguments).then((response) => {
                try {
                    const ct = response.headers?.get?.('content-type') || '';
                    if (!ct.includes('json')) return response;
                    return response.clone().text().then((text) => {
                        let data;
                        try { data = JSON.parse(text); } catch { return response; }
                        if (!patchProfile(data)) return response;
                        const headers = new Headers(response.headers);
                        headers.set('content-type', 'application/json');
                        return new Response(JSON.stringify(data), {
                            status: response.status,
                            statusText: response.statusText,
                            headers
                        });
                    }).catch(() => response);
                } catch { return response; }
            });
        };
        window.__mfCsaMePatched = true;
        log('/accounts/me parcheado');
    }

    // ── interceptor de fetch ──
    function patchFetch() {
        if (window.__mfCsaFetchPatched) return;
        if (typeof window.fetch !== 'function') return;
        const orig = window.fetch;
        window.fetch = function (input, init) {
            const url = typeof input === 'string' ? input
                : (input && input.url) ? input.url : '';
            const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
            const isUpload = method === 'POST' && /\/accounts\/custom_skin\/upload(\?|$)/.test(url);
            const isSetCos = method === 'POST' && /\/accounts\/set_cosmetic(\?|$)/.test(url);
            if (!isUpload && !isSetCos) return orig.apply(this, arguments);

            // leer el body (fetch recibe string JSON normalmente)
            let bodyText = null;
            try {
                if (typeof init?.body === 'string') bodyText = init.body;
                else if (input instanceof Request) {
                    // Request: clonar y leer async — devolvemos promesa
                    return input.clone().text().then((txt) => {
                        let body = null;
                        try { body = JSON.parse(txt); } catch {}
                        return handleEmulated(input.url, body, method)
                            .then((resp) => resp || orig.apply(this, arguments));
                    }).catch(() => orig.apply(this, arguments));
                }
            } catch {}
            let body = null;
            try { body = bodyText ? JSON.parse(bodyText) : null; } catch {}
            return handleEmulated(url, body, method)
                .then((resp) => resp || orig.apply(this, arguments));
        };
        window.__mfCsaFetchPatched = true;
        log('fetch parcheado');
    }

    // ── respuesta emulada: simular la Response del server ──
    function jsonResponse(obj, status = 200) {
        return new Response(JSON.stringify(obj), {
            status,
            headers: { 'content-type': 'application/json' }
        });
    }

    function errorResponse(msg, status = 400) {
        return jsonResponse(msg, status);  // el server devuelve el mensaje como texto plano
    }

    // despachar una petición emulada. Devuelve Response | null (null = dejar pasar)
    async function handleEmulated(url, body, method) {
        try {
            if (/\/accounts\/custom_skin\/upload(\?|$)/.test(url) && method === 'POST') {
                try {
                    const out = await emulateUpload(body);
                    return jsonResponse(out);
                } catch (e) {
                    return errorResponse(e?.message || 'Upload failed', e?.status || 400);
                }
            }
            if (/\/accounts\/set_cosmetic(\?|$)/.test(url) && method === 'POST') {
                const out = await emulateSetCosmetic(body);
                if (out) return jsonResponse(out);
                return null;  // no es skin custom → server real
            }
        } catch (e) {
            warn('handleEmulated error:', e?.message || e);
        }
        return null;
    }

    // ── interceptor de XHR (el juego usa axios → XHR en browser) ──
    // Intercepta POST custom_skin/upload y set_cosmetic entregando una
    // respuesta emulada sin que la petición llegue al server.
    function patchXHR() {
        try {
            const XHR = window.XMLHttpRequest;
            if (!XHR || !XHR.prototype) return;
            const proto = XHR.prototype;
            if (proto.__mfCsaWrapped) return;

            const nativeOpen = proto.open;
            const nativeSend = proto.send;
            if (typeof nativeOpen !== 'function' || typeof nativeSend !== 'function') return;

            const wrappedOpen = function (method, url, ...rest) {
                this.__mfCsaUrl = String(url || '');
                this.__mfCsaMethod = String(method || 'GET').toUpperCase();
                return nativeOpen.apply(this, [method, url, ...rest]);
            };
            const wrappedSend = function (body) {
                const xhr = this;
                if (/\/accounts\/(custom_skin\/upload|set_cosmetic)(\?|$)/.test(xhr.__mfCsaUrl || '') &&
                    xhr.__mfCsaMethod === 'POST') {
                    let parsed = null;
                    try { parsed = typeof body === 'string' ? JSON.parse(body) : body; } catch {}
                    handleEmulated(xhr.__mfCsaUrl, parsed, 'POST').then(async (resp) => {
                        if (!resp) {
                            // no manejado → enviar la petición real al server
                            nativeSend.apply(xhr, [body]);
                            return;
                        }
                        const text = await resp.text();
                        deliverEmulated(xhr, resp.status, text);
                    }).catch(() => nativeSend.apply(xhr, [body]));
                    return;
                }
                return nativeSend.apply(this, [body]);
            };
            proto.open = wrappedOpen;
            proto.send = wrappedSend;
            proto.__mfCsaWrapped = true;
            log('XHR parcheado (axios)');
        } catch (e) {
            warn('patchXHR falló:', e?.message || e);
        }
    }

    // entregar la respuesta emulada al XHR (axios la lee por responseText)
    function deliverEmulated(xhr, status, text) {
        try {
            Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
            Object.defineProperty(xhr, 'status', { value: status, configurable: true });
            Object.defineProperty(xhr, 'statusText', { value: status === 200 ? 'OK' : 'Error', configurable: true });
            Object.defineProperty(xhr, 'responseText', { value: text, configurable: true });
            Object.defineProperty(xhr, 'response', { value: text, configurable: true });
            Object.defineProperty(xhr, 'responseURL', { value: xhr.__mfCsaUrl, configurable: true });
            // axios lee getResponseHeader('content-type') para parsear JSON
            const native = XMLHttpRequest.prototype.getResponseHeader;
            xhr.getResponseHeader = function (name) {
                if (String(name || '').toLowerCase() === 'content-type') return 'application/json';
                try { return native.call(this, name); } catch { return null; }
            };
            xhr.dispatchEvent(new Event('readystatechange'));
            xhr.dispatchEvent(new ProgressEvent('load'));
            xhr.dispatchEvent(new ProgressEvent('loadend'));
        } catch (e) {
            warn('deliverEmulated fallo:', e?.message || e);
        }
    }

    // ── arranque ──
    function boot() {
        patchFetch();
        patchXHR();
        patchAccountsMe();
        // re-registrar la skin persistida al recargar
        const stored = getStoredSkin();
        if (stored?.url && stored?.id) {
            packSkinReg[stored.id] = stored.url;
            log('skin persistida re-registrada:', stored.id);
        }
    }
    boot();
})();
