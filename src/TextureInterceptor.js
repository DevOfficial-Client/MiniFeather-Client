(function () {
    'use strict';

    if (window.__MF_TEXTURE_INTERCEPTOR__) return;
    window.__MF_TEXTURE_INTERCEPTOR__ = true;

    var KEY = 'mf_custom_textures';
    var ACTIVE_KEY = 'mf_custom_textures_active';
    var RES_KEY = 'mf_custom_textures_resolution';

    function getDataUrl() {
        if (localStorage.getItem(ACTIVE_KEY) !== 'true') return null;
        return localStorage.getItem(KEY);
    }

    function getPatterns() {
        var res = parseInt(localStorage.getItem(RES_KEY)) || 16;
        var patterns = ['miniblox.io/textures/spritesheet'];
        if (res > 16) { patterns.push('miniblox.io/auth-api/texturepacks/default/highres.png'); }
        else { patterns.push('miniblox.io/auth-api/texturepacks/default/lowres.png'); }
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

    console.log('[MiniFeather TexturePack] Early MAIN world interceptor ready');
})();
