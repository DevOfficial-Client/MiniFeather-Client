(function () {
    'use strict';

    if (window.__MF_TEXTURE_INTERCEPTOR__) return;
    window.__MF_TEXTURE_INTERCEPTOR__ = true;

    // ─── Registro temprano de canvases WebGL ─────────────────────────
    // El PostFX necesita el canvas GL principal del juego, pero llamar
    // getContext('webgl') sobre un canvas 2D devuelve null y elegir por
    // tamaño falla. Registramos TODO canvas al que el juego pida un
    // contexto webgl/webgl2, en orden de creación, con su tamaño.
    window.__MF_GL_CANVASES__ = [];
    try {
        var origGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type) {
            var ctx = origGetContext.apply(this, arguments);
            if ((type === 'webgl' || type === 'webgl2') && ctx) {
                try {
                    if (this.__mfIsGL !== true) {
                        this.__mfIsGL = true;
                        window.__MF_GL_CANVASES__.push(this);
                        // Podría crecer sin límite: mantener solo 16 recientes
                        if (window.__MF_GL_CANVASES__.length > 16) {
                            window.__MF_GL_CANVASES__.shift();
                        }
                    }
                } catch (_) {}
            }
            return ctx;
        };
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

    var origFetch = window.fetch;
    window.fetch = function (input, init) {
        var dataUrl = getDataUrl();
        if (dataUrl) {
            var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
            if (url && matches(url)) {
                return Promise.resolve(new Response(dataUrlToBlob(dataUrl), {
                    headers: { 'Content-Type': 'image/png' }
                }));
            }
        }
        return origFetch.apply(this, arguments);
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

    // ─── GitHub raw → espejo local (assets/mfpack) ────────────────────
    // Intercepta URLs de raw.githubusercontent.com (skins del accounts.json,
    // entidades del userscript) y las sirve desde el espejo empaquetado.
    // Si el archivo no existe localmente, pasa la petición sin tocar.
    // NOTA: MAIN world no tiene chrome.runtime. La base del espejo la
    // inyecta el content script ISOLATED vía meta[name=mf-mirror-base].
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

    // raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/<path>
    // raw.githubusercontent.com/<owner>/<repo>/main/<path>
    function mfPackLocalUrlFor(githubUrl) {
        if (!MFPACK_MANIFESTS) return null;
        var base = mfPackBaseUrl();
        if (!base) return null;
        var m = githubUrl.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/(?:refs\/heads\/)?(?:main|master)\/(.+)$/);
        if (!m) return null;
        // quitar cache-busters (?v=123) y fragments antes del lookup
        var path = m[1].replace(/[?#].*$/, '').replace(/^\/+/, '');
        if (!MFPACK_MANIFESTS[path]) return null;
        return base + path;
    }

    function patchGithubRaw() {
        // fetch: devolver Response desde el espejo local
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

        // XHR: reescribir la URL antes de open
        var origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            if (typeof url === 'string' && url.indexOf('raw.githubusercontent.com') !== -1) {
                var local = mfPackLocalUrlFor(url);
                if (local) arguments[1] = local;
            }
            return origOpen.apply(this, arguments);
        };

        // <img src>: reescribir al asignar
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
            console.log('[MiniFeather mfpack] GitHub raw → espejo local activo (' +
                Object.keys(map).length + ' archivos)');
        });
    }

    // SplashScreen (ISOLATED, document_start) inyecta el meta ANTES que este
    // script ejecute en la mayoría de casos. Si no (orden de mundos invertido),
    // reintentar brevemente antes de rendirse.
    if (mfPackBaseUrl()) {
        mfPackBoot();
    } else {
        var tries = 0;
        var waitMeta = setInterval(function () {
            tries++;
            if (mfPackBaseUrl()) {
                clearInterval(waitMeta);
                MFPACK_READY = null; // resetear intento fallido previo
                mfPackBoot();
            } else if (tries >= 20) { // ~2s máximo
                clearInterval(waitMeta);
                console.warn('[MiniFeather mfpack] meta mf-mirror-base no apareció; espejo desactivado');
            }
        }, 100);
    }

    console.log('[MiniFeather TexturePack] Early MAIN world interceptor ready');
})();
