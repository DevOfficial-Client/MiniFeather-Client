(function () {
    'use strict';

    if (window.__MF_TEXTURE_PACK__) return;
    window.__MF_TEXTURE_PACK__ = true;

    const TAG = '[MiniFeather TexturePack]';
    const ATLAS_SIZE = 1024;
    const TILE_SIZE = 16;
    const STORAGE_KEY = 'mf_custom_textures';
    const ACTIVE_KEY = 'mf_custom_textures_active';
    const RES_KEY = 'mf_custom_textures_resolution';

    const state = {
        frames: null,
        customSprites: new Map(),
        enabled: false
    };

    async function loadFramesData() {
        if (state.frames) return state.frames;
        try {
            const res = await fetch(chrome.runtime.getURL('assets/frames.json'));
            state.frames = await res.json();
            return state.frames;
        } catch (e) {
            console.error(`${TAG} Could not load frames data:`, e);
        }
        return null;
    }

    function detectResolution(customFiles) {
        for (const img of customFiles.values()) {
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                return img.naturalWidth;
            }
        }
        return TILE_SIZE;
    }

    function buildLookup(customFiles) {
        const lookup = new Map();
        const lower = new Map();
        for (const [name, img] of customFiles) {
            lookup.set(name, img);
            const lc = name.toLowerCase();
            if (!lower.has(lc)) lower.set(lc, img);
        }
        return { lookup, lower };
    }

    function findSprite(baseName, { lookup, lower }) {
        return lookup.get(baseName)
            || lower.get(baseName.toLowerCase())
            || null;
    }

    async function generateSpritesheet(customFiles) {
        const frames = await loadFramesData();
        if (!frames) {
            console.error(`${TAG} No frames data available`);
            return null;
        }

        const resolution = detectResolution(customFiles);
        const scale = resolution / TILE_SIZE;
        const atlasSize = ATLAS_SIZE * scale;

        console.log(`${TAG} Detected ${resolution}x${resolution} texture pack (scale: ${scale}x, atlas: ${atlasSize}x${atlasSize})`);

        const entries = Object.entries(frames);
        const search = buildLookup(customFiles);
        const canvas = document.createElement('canvas');
        canvas.width = atlasSize;
        canvas.height = atlasSize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, atlasSize, atlasSize);

        const stats = { total: entries.length, placed: 0, custom: 0, original: 0, placeholder: 0, resolution };
        const textureNames = [];

        for (const [fileName, data] of entries) {
            const frame = data.frame || {};
            const fx = (frame.x || 0) * scale;
            const fy = (frame.y || 0) * scale;
            const fw = (frame.w || TILE_SIZE) * scale;
            const fh = (frame.h || TILE_SIZE) * scale;
            const rotated = data.rotated || false;

            const baseName = fileName.replace(/\.png$/, '');
            const customImg = findSprite(baseName, search);

            if (customImg) {
                if (rotated) {
                    ctx.save();
                    ctx.translate(fx, fy);
                    ctx.rotate(Math.PI / 2);
                    ctx.drawImage(customImg, 0, 0, fw, fh);
                    ctx.restore();
                } else {
                    ctx.drawImage(customImg, fx, fy, fw, fh);
                }
                stats.placed++;
                stats.custom++;
                textureNames.push(baseName);
            } else {
                stats.placeholder++;
            }
        }

        const dataUrl = canvas.toDataURL('image/png');
        return { dataUrl, stats, textureNames };
    }

    function saveToStorage(dataUrl) {
        try {
            localStorage.setItem(STORAGE_KEY, dataUrl);
            return true;
        } catch (e) {
            console.error(`${TAG} Error saving (quota?):`, e);
            return false;
        }
    }

    function loadFromStorage() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (_) {
            return null;
        }
    }

    function clearStorage() {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ACTIVE_KEY);
        localStorage.removeItem(RES_KEY);
    }

    function isActive() {
        return localStorage.getItem(ACTIVE_KEY) === 'true';
    }

    function setActive(active) {
        localStorage.setItem(ACTIVE_KEY, active ? 'true' : 'false');
    }

    function getCustomSpritesheetUrl() {
        return loadFromStorage();
    }

    async function applyCustomSpritesheet() {
        if (!isActive()) return false;
        const dataUrl = loadFromStorage();
        if (!dataUrl) return false;

        const frames = await loadFramesData();
        if (!frames) return false;

        try {
            const spritesheetEl = document.querySelector('img[src*="spritesheet"], canvas');
            const allImgs = document.querySelectorAll('img[src*="spritesheet"]');
            return dataUrl;
        } catch (e) {
            console.error(`${TAG} Apply error:`, e);
            return false;
        }
    }

    function getSpritesheetPatterns() {
        const resolution = parseInt(localStorage.getItem(RES_KEY)) || TILE_SIZE;
        const patterns = ['/textures/spritesheet'];
        if (resolution > TILE_SIZE) {
            patterns.push('/auth-api/texturepacks/default/highres.png');
        } else {
            patterns.push('/auth-api/texturepacks/default/lowres.png');
        }
        return patterns;
    }

    function interceptSpritesheet(dataUrl) {
        if (!dataUrl) return;

        localStorage.setItem(STORAGE_KEY, dataUrl);

        const code = `(function(){
            var KEY = ${JSON.stringify(STORAGE_KEY)};
            var RES_KEY = ${JSON.stringify(RES_KEY)};
            var dataUrl = localStorage.getItem(KEY);
            if (!dataUrl) { console.warn('[MiniFeather TexturePack] No dataUrl in localStorage'); return; }

            var res = parseInt(localStorage.getItem(RES_KEY)) || 16;
            var patterns = ['/textures/spritesheet'];
            if (res > 16) { patterns.push('/auth-api/texturepacks/default/highres.png'); }
            else { patterns.push('/auth-api/texturepacks/default/lowres.png'); }

            function matches(url){
                for(var i=0;i<patterns.length;i++){ if(url.indexOf(patterns[i])!==-1) return true; }
                return false;
            }
            function dataUrlToBlob(d){
                var parts = d.split(',');
                var b64 = parts[1];
                var bin = atob(b64);
                var arr = new Uint8Array(bin.length);
                for(var i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
                return new Blob([arr],{type:'image/png'});
            }

            var origFetch = window.fetch;
            window.fetch = function(input, init){
                var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
                if(matches(url)){
                    return Promise.resolve(new Response(dataUrlToBlob(dataUrl),{headers:{'Content-Type':'image/png'}}));
                }
                return origFetch.apply(this, arguments);
            };

            var desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
            if (desc && desc.configurable) {
                Object.defineProperty(HTMLImageElement.prototype, 'src', {
                    set: function(v){
                        if(typeof v==='string' && matches(v)){ desc.set.call(this, dataUrl); }
                        else { desc.set.call(this, v); }
                    },
                    get: function(){ return desc.get.call(this); },
                    configurable: true
                });
            }

            var origXHRopen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url){
                if(typeof url==='string' && matches(url)){
                    arguments[1] = dataUrl;
                }
                return origXHRopen.apply(this, arguments);
            };

            console.log('[MiniFeather TexturePack] MAIN world interception active (res:'+res+'x, patterns:'+patterns.length+')');
        })();`;

        const script = document.createElement('script');
        script.textContent = code;
        (document.head || document.documentElement).appendChild(script);
        script.remove();

        console.log(`${TAG} Spritesheet injection done`);
    }

    function dataUrlToBlob(dataUrl) {
        const [header, base64] = dataUrl.split(',');
        const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }

    let _jszip = null;

    function loadJSZip() {
        if (_jszip) return _jszip;
        if (typeof JSZip !== 'undefined') {
            _jszip = JSZip;
        } else if (typeof window !== 'undefined' && typeof window.JSZip !== 'undefined') {
            _jszip = window.JSZip;
        }
        if (!_jszip) {
            console.error(`${TAG} JSZip not loaded`);
        }
        return _jszip;
    }

    async function extractZip(file) {
        const JSZip = await loadJSZip();
        if (!JSZip) {
            console.error(`${TAG} JSZip not available`);
            return [];
        }

        const zip = await JSZip.loadAsync(file);
        const pngEntries = Object.values(zip.files).filter(
            f => !f.dir && f.name.toLowerCase().endsWith('.png')
        );

        console.log(`${TAG} Found ${pngEntries.length} PNGs in all folders`);

        const images = await Promise.all(pngEntries.map(async (entry) => {
            try {
                const blob = await entry.async('blob');
                const blobUrl = URL.createObjectURL(blob);
                const img = await new Promise((res, rej) => {
                    const i = new Image();
                    i.onload = () => res(i);
                    i.onerror = rej;
                    i.src = blobUrl;
                });
                const baseName = entry.name.split('/').pop().replace(/\.png$/i, '');
                return { name: baseName, img };
            } catch (_) {
                return null;
            }
        }));

        return images.filter(Boolean);
    }

    async function processUploadedFiles(fileList) {
        const customSprites = new Map();
        const pbrMaps = { n: new Map(), s: new Map(), e: new Map() };
        const files = Array.from(fileList);
        let loaded = 0;

        const zipFiles = files.filter(f =>
            f.type === 'application/zip' ||
            f.type === 'application/x-zip-compressed' ||
            f.name.toLowerCase().endsWith('.zip')
        );
        const pngFiles = files.filter(f =>
            f.type === 'image/png' || f.name.toLowerCase().endsWith('.png')
        );

        // Sufijos PBR estilo OptiFine: base_n = normal, base_s = specular,
        // base_e = emissive. Devuelve null si NO es un mapa PBR.
        function pbrKind(name) {
            const base = name.replace(/\.png$/i, '');
            if (/_n$/.test(base)) return { kind: 'n', base: base.slice(0, -2) };
            if (/_s$/.test(base)) return { kind: 's', base: base.slice(0, -2) };
            if (/_e$/.test(base)) return { kind: 'e', base: base.slice(0, -2) };
            return null;
        }

        function registerPbr(name, img) {
            const info = pbrKind(name);
            if (!info) return false;
            pbrMaps[info.kind].set(info.base, img);
            return true;
        }

        for (const file of pngFiles) {
            try {
                const url = URL.createObjectURL(file);
                const img = await new Promise((res, rej) => {
                    const i = new Image();
                    i.onload = () => res(i);
                    i.onerror = rej;
                    i.src = url;
                });
                const name = file.name.replace(/\.png$/i, '');
                if (!registerPbr(name, img)) customSprites.set(name, img);
                loaded++;
            } catch (_) {}
        }

        for (const zipFile of zipFiles) {
            console.log(`${TAG} Extracting ${zipFile.name}...`);
            const extracted = await extractZip(zipFile);
            for (const { name, img } of extracted) {
                if (!registerPbr(name, img)) customSprites.set(name, img);
                loaded++;
            }
            console.log(`${TAG} Extracted ${extracted.length} PNGs from ${zipFile.name}`);
        }

        return { customSprites, pbrMaps, loaded };
    }

    // ── Atlases PBR (_n / _s / _e) ──
    // Mismo layout de frames.json que el atlas diffuse, tiles faltantes con
    // valor neutro (azul para normal, negro para spec/emissive), guardados en
    // IndexedDB porque 3 atlas PNG no caben en la cuota de localStorage.

    function pbrNeutral(kind) {
        return kind === 'n' ? '#8080ff' : '#000000';
    }

    async function generatePbrAtlas(kind, maps) {
        const frames = await loadFramesData();
        if (!frames) return null;
        if (!maps || maps.size === 0) return null;

        const scale = 1;  // los maps PBR de estos packs son 16x
        const atlasSize = ATLAS_SIZE * scale;
        const canvas = document.createElement('canvas');
        canvas.width = atlasSize;
        canvas.height = atlasSize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        // Rellenar TODO el atlas con el valor neutro del kind
        ctx.fillStyle = pbrNeutral(kind);
        ctx.fillRect(0, 0, atlasSize, atlasSize);

        let placed = 0;
        const lower = new Map();
        for (const [name, img] of maps) {
            if (!lower.has(name.toLowerCase())) lower.set(name.toLowerCase(), img);
        }

        for (const [fileName, data] of Object.entries(frames)) {
            const frame = data.frame || {};
            const fx = (frame.x || 0) * scale;
            const fy = (frame.y || 0) * scale;
            const fw = (frame.w || TILE_SIZE) * scale;
            const fh = (frame.h || TILE_SIZE) * scale;
            const baseName = fileName.replace(/\.png$/, '');
            const img = maps.get(baseName) || lower.get(baseName.toLowerCase());
            if (!img) continue;  // tile neutro
            if (data.rotated) {
                ctx.save();
                ctx.translate(fx, fy);
                ctx.rotate(Math.PI / 2);
                ctx.drawImage(img, 0, 0, fw, fh);
                ctx.restore();
            } else {
                ctx.drawImage(img, fx, fy, fw, fh);
            }
            placed++;
        }

        console.log(`${TAG} PBR atlas '${kind}': ${placed} tiles de ${Object.keys(frames).length}`);
        return { dataUrl: canvas.toDataURL('image/png'), placed };
    }

    function idbPut(key, value) {
        return new Promise((resolve) => {
            let db = null;
            const req = indexedDB.open('mf_pbr_store', 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains('atlases')) {
                    req.result.createObjectStore('atlases');
                }
            };
            req.onsuccess = () => {
                db = req.result;
                try {
                    const tx = db.transaction('atlases', 'readwrite');
                    tx.objectStore('atlases').put(value, key);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                } catch (_) { resolve(false); }
            };
            req.onerror = () => resolve(false);
        });
    }

    async function generateAndStorePbr(pbrMaps) {
        const results = {};
        for (const kind of ['n', 's', 'e']) {
            const maps = pbrMaps[kind];
            if (!maps || maps.size === 0) continue;
            const atlas = await generatePbrAtlas(kind, maps);
            if (atlas) {
                await idbPut('atlas_' + kind, atlas);
                results[kind] = atlas.placed;
            }
        }
        // Avisar al módulo MAIN para que recargue los atlases ya
        try {
            document.dispatchEvent(new CustomEvent('minifeather:pbr-update'));
        } catch (_) {}
        return results;
    }

    async function generateAndApply(files) {
        console.log(`${TAG} Processing ${files.length} files...`);
        const { customSprites, pbrMaps, loaded } = await processUploadedFiles(files);

        if (loaded === 0) {
            console.warn(`${TAG} No valid PNG files found`);
            return { success: false, error: 'No valid PNG files' };
        }

        // Si el pack SOLO trae maps PBR (_n/_s/_e), no tocar el atlas diffuse
        // — el vanilla sigue visible y solo se aplican normal/specular/emissive.
        const hasPbr = pbrMaps.n.size || pbrMaps.s.size || pbrMaps.e.size;
        if (hasPbr) {
            const pbrStats = await generateAndStorePbr(pbrMaps);
            console.log(`${TAG} ✓ PBR maps:`, pbrStats);
            if (customSprites.size === 0) {
                return { success: true, stats: { custom: 0, placeholder: 0, pbr: pbrStats }, textureNames: [] };
            }
        }

        console.log(`${TAG} Loaded ${loaded} sprites. Generating atlas...`);
        const result = await generateSpritesheet(customSprites);

        if (!result) {
            return { success: false, error: 'Generation failed' };
        }

        const saved = saveToStorage(result.dataUrl);
        if (!saved) {
            return { success: false, error: 'Storage quota exceeded. Try fewer textures.' };
        }

        localStorage.setItem(RES_KEY, String(result.stats.resolution));
        setActive(true);
        interceptSpritesheet(result.dataUrl);

        console.log(`${TAG} ✓ Custom texture pack active! Stats:`, result.stats);
        return { success: true, stats: result.stats, textureNames: result.textureNames };
    }

    function disable() {
        setActive(false);
        console.log(`${TAG} Custom texture pack disabled. Reload page to restore original.`);
    }

    function idbDeleteAll() {
        return new Promise((resolve) => {
            const req = indexedDB.open('mf_pbr_store', 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains('atlases')) {
                    req.result.createObjectStore('atlases');
                }
            };
            req.onsuccess = () => {
                try {
                    const tx = req.result.transaction('atlases', 'readwrite');
                    const store = tx.objectStore('atlases');
                    store.delete('atlas_n');
                    store.delete('atlas_s');
                    store.delete('atlas_e');
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                } catch (_) { resolve(false); }
            };
            req.onerror = () => resolve(false);
        });
    }

    function clearPbr() {
        idbDeleteAll().then((ok) => {
            try {
                localStorage.setItem('mf_pbr_available', 'false');
                document.dispatchEvent(new CustomEvent('minifeather:pbr-update'));
            } catch (_) {}
            console.log(`${TAG} PBR atlases cleared (${ok}).`);
        });
    }

    function clearAll() {
        clearStorage();
        clearPbr();
        console.log(`${TAG} Cleared all custom textures. Reload page.`);
    }

    function init() {
        if (isActive()) {
            const dataUrl = loadFromStorage();
            if (dataUrl) {
                interceptSpritesheet(dataUrl);
                console.log(`${TAG} Restored custom texture pack from storage`);
            }
        }
    }

    window.MF_TEXTURE_PACK = {
        generateAndApply,
        disable,
        clearAll,
        clearPbr,
        isActive,
        getCustomSpritesheetUrl,
        processUploadedFiles,
        get stats() {
            return state;
        }
    };

    console.log(`${TAG} Loaded.`);
    init();
})();
