(function () {
    'use strict';

    if (window.__MF_TEXTURE_INTERCEPTOR__) return;
    window.__MF_TEXTURE_INTERCEPTOR__ = true;

    window.__MF_GL_CANVASES__ = [];
    // Keep the context returned at creation time. Calling getContext() during
    // cleanup can resurrect or touch a context that is already being retired.
    function reapDetachedGLContexts() {
        var list = window.__MF_GL_CANVASES__;
        if (!list || list.length < 10) return;
        var now = Date.now();
        for (var i = list.length - 1; i >= 0; i--) {
            var cv = list[i];
            if (!cv) { list.splice(i, 1); continue; }
            var gl = cv.__mfTrackedGLContext;
            if (cv.__mfGLLost || (gl && gl.isContextLost && gl.isContextLost())) {
                list.splice(i, 1);
                continue;
            }
            // A newly-created offscreen canvas may still be in use by the game.
            if (cv.isConnected || now - (cv.__mfGLTrackedAt || now) < 20000) continue;
            try {
                var ext = gl && gl.getExtension('WEBGL_lose_context');
                if (!ext) continue;
                ext.loseContext();
                cv.__mfGLLost = true;
                list.splice(i, 1);
            } catch (_) {}
        }
    }
    try {
        var origGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type) {
            if (type === 'webgl' || type === 'webgl2') reapDetachedGLContexts();
            var ctx = origGetContext.apply(this, arguments);
            if ((type === 'webgl' || type === 'webgl2') && ctx) {
                try {
                    this.__mfTrackedGLContext = ctx;
                    if (this.__mfIsGL !== true) {
                        this.__mfIsGL = true;
                        this.__mfGLTrackedAt = Date.now();
                        window.__MF_GL_CANVASES__.push(this);
                    }
                } catch (_) {}
            }
            return ctx;
        };
    } catch (_) {}

    // Reap old detached canvases before the next context is allocated and
    // periodically. Never lose a connected game canvas or a fresh offscreen one.
    try {
        if (!window.__MF_GL_REAPER__) {
            window.__MF_GL_REAPER__ = setInterval(reapDetachedGLContexts, 10000);
        }
    } catch (_) {}

    var KEY = 'mf_custom_textures';
    var ACTIVE_KEY = 'mf_custom_textures_active';
    var RES_KEY = 'mf_custom_textures_resolution';

    function getDataUrl() {
        if (localStorage.getItem(ACTIVE_KEY) !== 'true') return null;
        return localStorage.getItem(KEY);
    }

    function getPatterns() {
        var res = parseInt(localStorage.getItem(RES_KEY)) || 16;
        var patterns = ['/textures/spritesheet', 'miniblox.io/textures/spritesheet'];
        if (res > 16) { patterns.push('/auth-api/texturepacks/default/highres.png'); }
        else { patterns.push('/auth-api/texturepacks/default/lowres.png'); }
        return patterns;
    }

    function matches(url) {
        var patterns = getPatterns();
        for (var i = 0; i < patterns.length; i++) {
            if (url.indexOf(patterns[i]) !== -1) return true;
        }
        return false;
    }

    function dataUrlToBlob(d) {
        var parts = d.split(',');
        var b64 = parts[1];
        var bin = atob(b64);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: 'image/png' });
    }

    // ---- Circuit breaker de red para hosts de assets caídos ----
    // El juego re-fetcha TODOS los sprites dinámicos de un resource pack
    // (CPacketModContent -> refreshDynamicSprites -> eFe -> $Pe) cada vez que
    // el servidor reenvía el paquete. Si el host del pack está caído
    // (ERR_EMPTY_RESPONSE), eso genera cientos de fetches fallidos y su spam
    // de consola. Aquí recordamos URLs/origins que fallaron a nivel de red y
    // cortamos el fetch de inmediato (mismo TypeError que el navegador, pero
    // sin request real) durante un TTL. Solo aplica a URLs de assets
    // (imágenes / packs / textures / skins), nunca a APIs de sesión o login.
    var NET = window.__MF_NET_BREAKER__ || (window.__MF_NET_BREAKER__ = {
        urls: new Map(),      // url -> ts del último fallo de red
        origins: new Map(),   // origin -> { fails, openUntil }
        URL_TTL: 120000,      // 2 min sin reintentar la misma URL fallida
        THRESHOLD: 10,        // fallos de red seguidos que abren el breaker
        OPEN_MS: 60000        // breaker abierto 1 min por origin
    });

    function mfNetTrackableUrl(u) {
        return typeof u === 'string'
            && u.indexOf('http') === 0
            && (/\.(?:png|jpe?g|webp|gif|bmp)(?:\?|#|$)/i.test(u)
                || /\/(?:packs|assets|textures|skins)\//i.test(u));
    }

    // Cache de origins parseados: los fetches de assets comparten host, así
    // evitamos un new URL() (parse + alocación) por cada fetch del juego.
    var originCache = new Map(); // url -> origin|null
    function mfNetOriginOf(u) {
        var o = originCache.get(u);
        if (o !== undefined) return o;
        try { o = new URL(u, location.href).origin; } catch (_) { o = null; }
        if (originCache.size > 600) originCache.clear(); // tope defensivo
        originCache.set(u, o);
        return o;
    }

    function mfNetBlocked(u) {
        if (!mfNetTrackableUrl(u)) return false;
        var now = Date.now();
        var f = NET.urls.get(u);
        if (f && now - f < NET.URL_TTL) return true;
        var o = mfNetOriginOf(u);
        if (!o) return false;
        var st = NET.origins.get(o);
        return !!(st && st.openUntil > now);
    }

    function mfNetRecordFail(u) {
        if (!mfNetTrackableUrl(u)) return;
        var now = Date.now();
        NET.urls.set(u, now);
        var o = mfNetOriginOf(u);
        if (!o) return;
        var st = NET.origins.get(o) || { fails: 0, openUntil: 0 };
        st.fails++;
        if (st.fails >= NET.THRESHOLD) {
            st.openUntil = now + NET.OPEN_MS;
            st.fails = 0;
            console.warn('[MiniFeather] host de assets caído (' + o + '); fetches cortados por ' + (NET.OPEN_MS / 1000) + 's');
        }
        NET.origins.set(o, st);
    }

    function mfNetRecordOk(u) {
        if (!mfNetTrackableUrl(u)) return;
        NET.urls.delete(u);
        var o = mfNetOriginOf(u);
        if (o) NET.origins.delete(o);
    }

    var origFetch = window.fetch;
    window.fetch = function (input, init) {
        var url = '';
        try {
            url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        } catch (_) {}
        // Gate barato: matches() solo puede matchear spritesheet/texturepacks
        // → el resto de fetches salta sin leer localStorage (que materializa
        // el dataURL completo del pack en memoria por lectura).
        var dataUrl = (url.indexOf('spritesheet') !== -1 || url.indexOf('texturepacks/default') !== -1)
            ? getDataUrl() : null;
        if (dataUrl && url && matches(url)) {
            return Promise.resolve(new Response(dataUrlToBlob(dataUrl), {
                headers: { 'Content-Type': 'image/png' }
            }));
        }
        if (url && mfNetBlocked(url)) {
            return Promise.reject(new TypeError('Failed to fetch'));
        }
        var p = origFetch.apply(this, arguments);
        if (url && mfNetTrackableUrl(url)) {
            // Registrar resultado sin alterar la promesa que ve el juego
            // (los handlers devuelven undefined para no crear rejection huérfana)
            p.then(function () { mfNetRecordOk(url); }, function () { mfNetRecordFail(url); });
        }
        return p;
    };

    var desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (desc && desc.configurable) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
            set: function (v) {
                var dataUrl = getDataUrl();
                if (typeof v === 'string' && dataUrl && matches(v)) {
                    desc.set.call(this, dataUrl);
                } else {
                    desc.set.call(this, v);
                }
            },
            get: function () { return desc.get.call(this); },
            configurable: true
        });
    }

    var origXHRopen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        var dataUrl = getDataUrl();
        if (dataUrl && typeof url === 'string' && matches(url)) {
            arguments[1] = dataUrl;
        }
        return origXHRopen.apply(this, arguments);
    };

    function mfPackBaseUrl() {
        if (window.__MFPACK_BASE__) return window.__MFPACK_BASE__;
        var meta = document.querySelector('meta[name="mf-mirror-base"]');
        if (meta && meta.content) {
            window.__MFPACK_BASE__ = meta.content;
            return meta.content;
        }
        return null;
    }

    var MFPACK_MANIFESTS = null;
    var MFPACK_READY = null;

    function mfPackLoadIndex() {
        if (MFPACK_READY) return MFPACK_READY;
        var base = mfPackBaseUrl();
        if (!base) {
            MFPACK_READY = Promise.resolve(null);
            return MFPACK_READY;
        }
        MFPACK_READY = fetch(base + 'index.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data) return null;
                var map = {};
                (data.skins || []).forEach(function (p) { map['skins/' + p] = true; });
                (data.textures || []).forEach(function (p) { map['textures/' + p] = true; });
                MFPACK_MANIFESTS = map;
                return map;
            })
            .catch(function () { return null; });
        return MFPACK_READY;
    }

    function mfPackLocalUrlFor(githubUrl) {
        if (!MFPACK_MANIFESTS) return null;
        var base = mfPackBaseUrl();
        if (!base) return null;
        var m = githubUrl.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/(?:refs\/heads\/)?(?:main|master)\/(.+)$/);
        if (!m) return null;
        
        var path = m[1].replace(/[?#].*$/, '').replace(/^\/+/, '');
        if (!MFPACK_MANIFESTS[path]) return null;
        return base + path;
    }

    function patchGithubRaw() {
        
        var origFetch = window.fetch;
        window.fetch = function (input, init) {
            var url = '';
            try {
                url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
            } catch (e) {}
            if (url.indexOf('raw.githubusercontent.com') !== -1) {
                var local = mfPackLocalUrlFor(url);
                if (local) {
                    return origFetch.call(this, local, init);
                }
            }
            return origFetch.apply(this, arguments);
 };

        var origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            if (typeof url === 'string' && url.indexOf('raw.githubusercontent.com') !== -1) {
                var local = mfPackLocalUrlFor(url);
                if (local) arguments[1] = local;
            }
            return origOpen.apply(this, arguments);
        };

        var descImg = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        if (descImg && descImg.configurable) {
            Object.defineProperty(HTMLImageElement.prototype, 'src', {
                set: function (v) {
                    if (typeof v === 'string' && v.indexOf('raw.githubusercontent.com') !== -1) {
                        var local = mfPackLocalUrlFor(v);
                        if (local) { descImg.set.call(this, local); return; }
                    }
                    descImg.set.call(this, v);
                },
                get: function () { return descImg.get.call(this); },
                configurable: true
            });
        }
    }

    function mfPackBoot() {
        mfPackLoadIndex().then(function (map) {
            if (!map) {
                console.warn('[MiniFeather mfpack] index no disponible, GitHub raw sin espejo');
                return;
            }
            patchGithubRaw();
            void 0;
        });
    }

    if (mfPackBaseUrl()) {
        mfPackBoot();
    } else {
        var tries = 0;
        var waitMeta = setInterval(function () {
            tries++;
            if (mfPackBaseUrl()) {
                clearInterval(waitMeta);
                MFPACK_READY = null; 
                mfPackBoot();
            } else if (tries >= 20) { 
                clearInterval(waitMeta);
                console.warn('[MiniFeather mfpack] meta mf-mirror-base no apareció; espejo desactivado');
            }
        }, 100);
    }

    void 0;
})();
