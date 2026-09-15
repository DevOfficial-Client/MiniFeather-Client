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

    function pbrNeutral(kind) {
        return kind === 'n' ? '#8080ff' : '#000000';
    }

    function drawTileDownscaled(ctx, img, fx, fy, fw, fh) {
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (iw === fw && ih === fh) {
            ctx.drawImage(img, fx, fy, fw, fh);  
            return;
        }
        
        const tmp = document.createElement('canvas');
        tmp.width = iw; tmp.height = ih;
        const tctx = tmp.getContext('2d', { willReadFrequently: true });
        tctx.drawImage(img, 0, 0);
        let src;
        try { src = tctx.getImageData(0, 0, iw, ih); }
        catch (_) { ctx.drawImage(img, fx, fy, fw, fh); return; }  
        const dst = ctx.createImageData(fw, fh);
        for (let y = 0; y < fh; y++) {
            const y0 = Math.floor((y * ih) / fh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * ih) / fh));
            for (let x = 0; x < fw; x++) {
                const x0 = Math.floor((x * iw) / fw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * iw) / fw));
                let r = 0, g = 0, b = 0, a = 0, n = 0;
                for (let sy = y0; sy < y1; sy++) {
                    let sp = (sy * iw + x0) * 4;
                    for (let sx = x0; sx < x1; sx++, sp += 4) {
                        const al = src.data[sp + 3];
                        
                        r += src.data[sp] * al; g += src.data[sp + 1] * al;
                        b += src.data[sp + 2] * al; a += al; n++;
                    }
                }
                const dp = (y * fw + x) * 4;
                if (a > 0) {
                    dst.data[dp] = Math.round(r / a); dst.data[dp + 1] = Math.round(g / a);
                    dst.data[dp + 2] = Math.round(b / a);
                    dst.data[dp + 3] = Math.min(255, Math.round(a / n));
                }
            }
        }
        ctx.putImageData(dst, fx, fy);
    }

    async function generatePbrAtlas(kind, maps) {
        const frames = await loadFramesData();
        if (!frames) return null;
        if (!maps || maps.size === 0) return null;

        const scale = 1;  
        const atlasSize = ATLAS_SIZE * scale;
        const canvas = document.createElement('canvas');
        canvas.width = atlasSize;
        canvas.height = atlasSize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

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
            if (!img) continue;  
            if (data.rotated) {
                ctx.save();
                ctx.translate(fx, fy);
                ctx.rotate(Math.PI / 2);
                drawTileDownscaled(ctx, img, 0, 0, fw, fh);
                ctx.restore();
            } else {
                drawTileDownscaled(ctx, img, fx, fy, fw, fh);
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

    let pbrGenChain = Promise.resolve();

    function generateAndStorePbr(pbrMaps) {
        const run = pbrGenChain.then(() => doGenerateAndStorePbr(pbrMaps));
        pbrGenChain = run.catch(() => {});
        return run;
    }

    async function doGenerateAndStorePbr(pbrMaps) {
        const results = {};
        for (const kind of ['n', 's', 'e']) {
            const maps = pbrMaps[kind];
            if (!maps || maps.size === 0) continue;
            const atlas = await generatePbrAtlas(kind, maps);
            if (atlas) {
                const ok = await idbPut('atlas_' + kind, atlas);
                if (ok) {
                    results[kind] = atlas.placed;
                } else {
                    console.error(`${TAG} PBR atlas '${kind}' GENERADO pero IndexedDB falló al guardar`);
                    results[kind] = -1;
                }
            }
        }
        const anyOk = Object.values(results).some(v => v > 0);
        console.log(`${TAG} ✓ PBR maps:`, results,
            anyOk ? '(guardados en IndexedDB)' : '(NINGUNO guardado — revisa arriba)');
        
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

        const hasPbr = pbrMaps.n.size || pbrMaps.s.size || pbrMaps.e.size;
        if (hasPbr) {
            const pbrStats = await generateAndStorePbr(pbrMaps);
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
                
                localStorage.removeItem('mf_pbr_manual');
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

    function bundledManifestUrl() {
        return chrome.runtime.getURL('assets/pbr/manifest.json');
    }

    const PBR_PRESETS = [
        {
            id: 'ultimacraft',
            name: 'UltimaCraft PBR v1.9',
            author: 'UltimaCraft (Modrinth)',
            license: 'CC-BY-NC-4.0',
            credit: 'https://modrinth.com/resourcepack/ultimacraft-pbr',
            url: 'https://cdn.modrinth.com/data/71ctNY6u/versions/lXPZqupu/ultimacraft-pbr-v-1-9.zip',
            size: '~12 MB',
            note: 'LabPBR 16x, cobertura casi total de bloques vanilla. El más completo.'
        },
        {
            id: 'spbr',
            name: 'SPBR 16.2',
            author: 'NyaShulker (Modrinth)',
            license: 'GPL-3.0',
            credit: 'https://modrinth.com/resourcepack/spbr',
            url: 'https://cdn.modrinth.com/data/aNcOVoD7/versions/jtNbhldU/SPBR-16_2.zip',
            size: '~15 MB',
            note: 'LabPBR 16x basado en VNR, relieve profundo + parallax data.'
        },
        {
            id: 'vnr',
            name: 'Vanilla Normals Renewed 1.20',
            author: 'Poudingue (GitHub)',
            license: 'Custom (uso libre, no vender, dar crédito)',
            credit: 'https://github.com/Poudingue/Vanilla-Normals-Renewed',
            url: 'https://github.com/Poudingue/Vanilla-Normals-Renewed/releases/download/1.20/VNR-1.20.0.zip',
            size: '~4 MB',
            note: 'Normal+specular estilo vanilla puro, el clásico.'
        },
        {
            id: 'bundled',
            name: 'MiniFeather (integrado)',
            author: 'MLGImposter RT V1.1',
            license: 'bundled',
            credit: '',
            url: '',
            size: 'local',
            note: 'Pack incluido en la extensión (35 bloques).'
        }
    ];

    let presetInFlight = null;

    function listPresets() {
        return PBR_PRESETS.map(p => ({
            id: p.id, name: p.name, author: p.author,
            license: p.license, size: p.size, note: p.note
        }));
    }

    function currentPreset() {
        try { return localStorage.getItem('mf_pbr_preset') || 'bundled'; }
        catch (_) { return 'bundled'; }
    }

    async function doInstallPreset(presetId) {
        const preset = PBR_PRESETS.find(p => p.id === presetId);
        if (!preset) return { success: false, error: `preset desconocido: ${presetId}` };
        if (preset.id === 'bundled') {
            const r = await installBundledPbr();
            if (r.success) {
                try { localStorage.setItem('mf_pbr_preset', 'bundled'); } catch (_) {}
            }
            return r;
        }

        console.log(`${TAG} Descargando preset PBR "${preset.name}" de ${preset.url} ...`);
        const res = await fetch(preset.url);
        if (!res.ok) {
            return { success: false, error: `descarga falló (HTTP ${res.status})` };
        }
        const blob = await res.blob();
        console.log(`${TAG} ZIP listo (${(blob.size / 1048576).toFixed(1)} MB), extrayendo PNGs...`);

        const extracted = await extractZip(blob);
        if (!extracted || extracted.length === 0) {
            return { success: false, error: 'el ZIP no contenía PNGs' };
        }

        const pbrMaps = { n: new Map(), s: new Map(), e: new Map() };
        let pbrCount = 0;
        for (const { name, img } of extracted) {
            const info = pbrKind(name);
            if (!info) continue;
            
            const prev = pbrMaps[info.kind].get(info.base);
            if (!prev) {
                img.nameLen = name.length;
                pbrMaps[info.kind].set(info.base, img);
            } else if (name.length < prev.nameLen) {
                img.nameLen = name.length;
                pbrMaps[info.kind].set(info.base, img);
            }
            pbrCount++;
        }
        console.log(`${TAG} Preset "${preset.name}": ${pbrCount} maps PBR (${pbrMaps.n.size}n ${pbrMaps.s.size}s ${pbrMaps.e.size}e)`);

        if (pbrMaps.n.size === 0 && pbrMaps.s.size === 0 && pbrMaps.e.size === 0) {
            return { success: false, error: 'sin maps _n/_s/_e — estructura del pack inesperada' };
        }

        const results = await generateAndStorePbr(pbrMaps);
        const anyOk = Object.values(results).some(v => v > 0);
        if (anyOk) {
            try {
                localStorage.setItem('mf_pbr_preset', preset.id);
                localStorage.removeItem('mf_pbr_manual');  
            } catch (_) {}
            console.log(`${TAG} ✓ Preset PBR "${preset.name}" instalado:`, results, `— crédito: ${preset.credit}`);
        }
        return { success: anyOk, results, maps: { n: pbrMaps.n.size, s: pbrMaps.s.size, e: pbrMaps.e.size } };
    }

    function installPreset(presetId) {
        if (presetInFlight) return presetInFlight;
        presetInFlight = doInstallPreset(presetId).finally(() => { presetInFlight = null; });
        return presetInFlight;
    }

    async function fetchImage(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    let bundledPbrInFlight = null;

    function installBundledPbr() {
        
        if (bundledPbrInFlight) return bundledPbrInFlight;
        bundledPbrInFlight = doInstallBundledPbr().finally(() => {
            bundledPbrInFlight = null;
        });
        return bundledPbrInFlight;
    }

    async function doInstallBundledPbr() {
        try {
            const res = await fetch(bundledManifestUrl());
            if (!res.ok) return { success: false, error: 'manifest no disponible' };
            const names = await res.json();
            if (!Array.isArray(names) || names.length === 0) {
                return { success: false, error: 'manifest vacío' };
            }
            const pbrMaps = { n: new Map(), s: new Map(), e: new Map() };
            let loadedCount = 0;
            for (const name of names) {
                const base = String(name).replace(/\.png$/i, '');
                let kind = null;
                if (/_n$/.test(base)) kind = 'n';
                else if (/_s$/.test(base)) kind = 's';
                else if (/_e$/.test(base)) kind = 'e';
                if (!kind) continue;
                const img = await fetchImage(chrome.runtime.getURL('assets/pbr/' + name));
                if (img) {
                    pbrMaps[kind].set(base.slice(0, -2), img);
                    loadedCount++;
                }
            }
            if (loadedCount === 0) return { success: false, error: 'ningún PNG cargado' };
            const results = await generateAndStorePbr(pbrMaps);
            console.log(`${TAG} ✓ PBR integrado instalado (${loadedCount} maps):`, results);
            return { success: true, results, loadedCount };
        } catch (err) {
            console.warn(`${TAG} PBR integrado no disponible:`, err);
            return { success: false, error: String(err && err.message || err) };
        }
    }

    window.MF_TEXTURE_PACK = {
        generateAndApply,
        disable,
        clearAll,
        clearPbr,
        installBundledPbr,
        installPreset,
        listPresets,
        currentPreset,
        isActive,
        getCustomSpritesheetUrl,
        processUploadedFiles,
        get stats() {
            return state;
        }
    };

    document.addEventListener('minifeather:pbr-presets-list', () => {
        document.dispatchEvent(new CustomEvent('minifeather:pbr-presets-result', {
            detail: JSON.stringify({ presets: listPresets(), current: currentPreset() })
        }));
    });
    document.addEventListener('minifeather:pbr-preset-install', (ev) => {
        let presetId = null;
        try { presetId = JSON.parse(ev.detail).presetId; } catch (_) { presetId = ev.detail; }
        installPreset(presetId)
            .then(result => document.dispatchEvent(new CustomEvent('minifeather:pbr-preset-result', {
                detail: JSON.stringify({ presetId, ...result })
            })))
            .catch(err => document.dispatchEvent(new CustomEvent('minifeather:pbr-preset-result', {
                detail: JSON.stringify({ presetId, success: false, error: String(err && err.message || err) })
            })));
    });

    console.log(`${TAG} Loaded.`);
    init();
})();
