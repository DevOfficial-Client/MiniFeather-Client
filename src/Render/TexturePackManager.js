(function () {
    'use strict';

    if (window.__MF_TEXTURE_PACK__) return;
    window.__MF_TEXTURE_PACK__ = true;

    const TAG = 'minifeather texturepack';
    const ATLAS_SIZE = 1024;
    // 4096 es el techo seguro: GPUs de laptop iGPU y móviles suelen cortar ahí.
    // un atlas 8192+ se crea bien en canvas y reventar arrive en la subida GL.
    const MAX_ATLAS_SIZE = 4096;
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

    function detectResolution(customFiles, frames) {
        // solo cuentan sprites que de verdad van al atlas: el pack.png (icono
        // 128/256) o cualquier png suelto del zip no define la resolución del
        // pack. antes el primer png del zip decidía el scale y un icono grande
        // pintaba un atlas gigante que reventaba en GPUs viejas.
        for (const [name, img] of customFiles) {
            if (frames && !frames[name + '.png']) continue;
            const w = img.naturalWidth;
            if (w > 0 && w % TILE_SIZE === 0) return w;
        }
        return TILE_SIZE;
    }

    // miniblox renombró media vanilla: el nether es "hell", su netherite es
    // "infernium", los items llevaban _item y los bloques conservan nombres
    // pre-1.13. al juego todo esto le da igual (solo ve la spritesheet final),
    // así que el convertidor traduce frame→nombre moderno del pack y cualquier
    // resource pack de MC real viste también el nether/netherite de miniblox.
    const FRAME_ALIASES = {
        // nether de miniblox → nether real
        hellstone: 'netherrack',
        hell_brick: 'nether_brick',
        hell_bricks: 'nether_bricks',
        cracked_hell_bricks: 'cracked_nether_bricks',
        chiseled_hell_bricks: 'chiseled_nether_bricks',
        red_hell_bricks: 'red_nether_bricks',
        hell_fungus: 'crimson_fungus',
        hell_fungus_block: 'nether_wart_block',
        hell_fungus_stage0: 'nether_wart_stage0',
        hell_fungus_stage1: 'nether_wart_stage1',
        hell_fungus_stage2: 'nether_wart_stage2',
        hell_gold_ore: 'nether_gold_ore',
        hell_marble_ore: 'nether_quartz_ore',
        hell_portal: 'nether_portal',
        hell_sprouts: 'nether_sprouts',
        hell_star: 'nether_star',
        // infernium (el tier del nether de miniblox) → netherite
        infernium_ingot: 'netherite_ingot',
        infernium_block: 'netherite_block',
        infernium_ore: 'ancient_debris_side',
        infernium_axe: 'netherite_axe',
        infernium_pickaxe: 'netherite_pickaxe',
        infernium_shovel: 'netherite_shovel',
        infernium_sword: 'netherite_sword',
        infernium_hoe: 'netherite_hoe',
        infernium_helmet: 'netherite_helmet',
        infernium_chestplate: 'netherite_chestplate',
        infernium_leggings: 'netherite_leggings',
        infernium_boots: 'netherite_boots',
        // items que miniblox llama X_item o con nombre viejo
        ghost_tear: 'ghast_tear',
        chain_item: 'chain',
        flower_pot_item: 'flower_pot',
        comparator_item: 'comparator',
        repeater_item: 'repeater',
        lantern_item: 'lantern',
        soul_lantern_item: 'soul_lantern',
        kelp_item: 'kelp',
        seagrass_item: 'seagrass',
        sea_pickle_item: 'sea_pickle',
        sugar_cane_item: 'sugar_cane',
        turtle_egg_item: 'turtle_egg',
        item_frame_item: 'item_frame',
        lever_item: 'lever',
        brewing_stand_item: 'brewing_stand',
        potion_bottle_drinkable: 'potion',
        potion_bottle_splash: 'splash_potion',
        potion_bottle_lingering: 'lingering_potion',
        seeds_wheat: 'wheat_seeds',
        sign: 'oak_sign',
        // bloques con nombre pre-1.13
        workbench_front: 'crafting_table_front',
        workbench_side: 'crafting_table_side',
        workbench_top: 'crafting_table_top',
        stone_slab_side: 'smooth_stone',
        stone_slab_top: 'smooth_stone',
        dispenser_front_horizontal: 'dispenser_front',
        dropper_front_horizontal: 'dropper_front',
        pumpkin_stem_disconnected: 'pumpkin_stem',
        melon_stem_disconnected: 'melon_stem',
        piston_top_normal: 'piston_top',
        silver_shulker_box: 'light_gray_shulker_box',
        book_normal: 'book',
        book_writable: 'writable_book',
        book_written: 'written_book',
        book_enchanted: 'enchanted_book',
        grass_path_side: 'dirt_path_side',
        grass_path_top: 'dirt_path_top',
        grass: 'short_grass'
    };

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

    function spriteForFrame(fileName, search, dirMap) {
        const baseName = fileName.replace(/\.png$/, '');
        const direct = findSprite(baseName, search);
        if (direct) return direct;
        if (!dirMap) return null;
        // frames.json lleva rutas propias (bed/black.png, chest/normal.png,
        // signs/oak.png): el zip las guarda en entity/<dir>/<nombre>.png.
        // matchear por basename pelado era pintar la cama con el overlay de
        // lámparas CTM o la manta de una llama (hubo de todo XD) — el empareje
        // es por los DOS últimos segmentos de la ruta del zip.
        const hit = dirMap.get(baseName.toLowerCase());
        if (hit) return hit;
        // el tile flat del bloque de cama (red_bed.png) es la misma arte que
        // entity/bed/red.png: alias semántico.
        const bedSlash = baseName.toLowerCase().lastIndexOf('_bed');
        if (bedSlash !== -1 && bedSlash + 4 === baseName.length) {
            const viaBed = dirMap.get('bed/' + baseName.slice(0, bedSlash).toLowerCase());
            if (viaBed) return viaBed;
        }
        // nombre viejo/renombrado → nombre moderno que trae el pack
        const aliased = FRAME_ALIASES[baseName.toLowerCase()];
        if (aliased) return findSprite(aliased, search);
        return null;
    }

    // frames individuales de animación vieja (clock_00.png, compass_17.png,
    // bow_pulling_2.png): los packs modernos los traen como UNA tira vertical
    // (clock.png de N cuadros + .png.mcmeta). aquí se rebana: stem_N → fila N
    // de la tira. si el mcmeta reordena (animation.frames) se respeta; si el
    // índice se sale de la tira, no hay match (queda vanilla, jamás inventado).
    const STRIP_ROW_OFFSETS = {
        bow_pulling: 1,        // fila 0 de bow.png = standby (bow pelado)
        crossbow_pulling: 1,
        crossbow_arrow: 4
    };

    function animMatch(fileName, search, dirMap, animMeta) {
        if (!animMeta || !animMeta.size) return null;
        const baseName = fileName.replace(/\.png$/, '');
        const m = /^(.+?)_(\d+)$/.exec(baseName);
        if (!m) return null;
        const stemLc = m[1].toLowerCase();
        const idx = parseInt(m[2], 10);
        const meta = animMeta.get(stemLc);
        if (meta) {
            const strip = findSprite(m[1], search) || (dirMap && dirMap.get(stemLc));
            if (strip) {
                const frameW = strip.naturalWidth;
                if (frameW && strip.naturalHeight > frameW) {
                    const count = Math.floor(strip.naturalHeight / frameW);
                    let row = idx;
                    const frames = meta.animation && meta.animation.frames;
                    if (Array.isArray(frames)) {
                        const f = frames[idx];
                        if (typeof f === 'number') row = f;
                        else if (f && typeof f.index === 'number') row = f.index;
                        else return null;
                    }
                    row += STRIP_ROW_OFFSETS[stemLc] || 0;
                    if (row >= 0 && row < count) {
                        return { img: strip, row, fw: frameW, fh: frameW };
                    }
                }
            }
        }
        // formato optifine/cit: item/clock/0.png — el cuadro N es un archivo
        // numerado dentro de la carpeta stem. el dirMap ya trae 'stem/N'.
        if (dirMap) {
            const pad = idx < 10 ? '0' + idx : String(idx);
            const viaDir = dirMap.get(stemLc + '/' + idx) || dirMap.get(stemLc + '/' + pad);
            if (viaDir) return { img: viaDir };
        }
        return null;
    }

    // MC no tiene equipo de esmeralda: el tier esmeralda de miniblox se viste
    // con el DIAMOND del pack recoloreado a esmeralda, píxel a píxel (rampa
    // sombra→luz según la luminancia del original, no un velo encima). caché
    // por textura fuente: 10 items comparten la misma conversión.
    const EMERALD_PIECES = new Set([
        'axe', 'pickaxe', 'shovel', 'sword', 'hoe',
        'helmet', 'chestplate', 'leggings', 'boots'
    ]);
    const EMERALD_DARK = [16, 82, 48];
    const EMERALD_BRIGHT = [70, 232, 138];

    function tintedSpriteForFrame(fileName, search, tintCache) {
        const baseName = fileName.replace(/\.png$/, '');
        const m = /^emerald_(.+)$/.exec(baseName);
        if (!m || !EMERALD_PIECES.has(m[1])) return null;
        const srcName = 'diamond_' + m[1];
        if (tintCache.has(srcName)) return tintCache.get(srcName);
        let out = null;
        const src = findSprite(srcName, search);
        const iw = src?.naturalWidth, ih = src?.naturalHeight;
        if (src && iw && ih) {
            const cv = document.createElement('canvas');
            cv.width = iw; cv.height = ih;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(src, 0, 0);
            let data;
            try { data = ctx.getImageData(0, 0, iw, ih); } catch (_) { data = null; }
            if (data) {
                const px = data.data;
                for (let i = 0; i < px.length; i += 4) {
                    if (!px[i + 3]) continue;
                    // luminancia perceptual (no max): separa highlight blanco /
                    // cuerpo cyan / sombra azul del diamante en TRES zonas de la
                    // rampa esmeralda. con max() cuerpo y highlight colapsaban.
                    const lum = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255;
                    px[i] = EMERALD_DARK[0] + (EMERALD_BRIGHT[0] - EMERALD_DARK[0]) * lum;
                    px[i + 1] = EMERALD_DARK[1] + (EMERALD_BRIGHT[1] - EMERALD_DARK[1]) * lum;
                    px[i + 2] = EMERALD_DARK[2] + (EMERALD_BRIGHT[2] - EMERALD_DARK[2]) * lum;
                }
                ctx.putImageData(data, 0, 0);
                out = cv;
            }
        }
        tintCache.set(srcName, out);
        return out;
    }

    function fetchImage(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    let vanillaAtlasCache = null;
    async function loadVanillaAtlas() {
        if (vanillaAtlasCache !== null) return vanillaAtlasCache;
        const img = await fetchImage(chrome.runtime.getURL('classic/textures/spritesheet.png'));
        vanillaAtlasCache = img;
        if (!img) console.warn(`${TAG} failed to load vanilla atlas as base`);
        return vanillaAtlasCache;
    }

    async function generateSpritesheet(customFiles, dirLeaves, animMeta) {
        const frames = await loadFramesData();
        if (!frames) {
            console.error(`${TAG} No frames data available`);
            return null;
        }

        const resolution = detectResolution(customFiles, frames);
        // si el atlas capado se queda corto para la resolución pedida, el
        // effective scale manda: los sprites se reescalan al slot (downscale
        // automático) y nadie revienta por un atlas de 16k.
        const scale = Math.min(resolution / TILE_SIZE, MAX_ATLAS_SIZE / ATLAS_SIZE);
        const atlasSize = ATLAS_SIZE * scale;

        void 0;

        const entries = Object.entries(frames);
        const search = buildLookup(customFiles);
        // mapa dir/nombre → sprite para las llaves de frames con ruta
        const dirMap = new Map();
        if (dirLeaves) {
            for (const [k, v] of dirLeaves) dirMap.set(k.toLowerCase(), v);
        }
        const canvas = document.createElement('canvas');
        canvas.width = atlasSize;
        canvas.height = atlasSize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, atlasSize, atlasSize);
        const vanilla = await loadVanillaAtlas();
        if (vanilla) {
            ctx.drawImage(vanilla, 0, 0, vanilla.width, vanilla.height, 0, 0, atlasSize, atlasSize);
        }

        const stats = { total: entries.length, placed: 0, custom: 0, original: vanilla ? entries.length : 0, placeholder: vanilla ? 0 : 0, resolution };

        const textureNames = [];
        const tintCache = new Map();

        for (const [fileName, data] of entries) {
            const frame = data.frame || {};
            const fx = (frame.x || 0) * scale;
            const fy = (frame.y || 0) * scale;
            const fw = (frame.w || TILE_SIZE) * scale;
            const fh = (frame.h || TILE_SIZE) * scale;
            const rotated = data.rotated || false;

            const baseName = fileName.replace(/\.png$/, '');
            const customImg = spriteForFrame(fileName, search, dirMap);
            const anim = customImg ? null : animMatch(fileName, search, dirMap, animMeta);
            const tinted = (customImg || anim) ? null : tintedSpriteForFrame(fileName, search, tintCache);

            if (customImg || anim || tinted) {
                if (anim && anim.fw) {
                    // tira vertical: una fila del strip del pack al slot del frame
                    ctx.drawImage(anim.img, 0, anim.row * anim.fh, anim.fw, anim.fh, fx, fy, fw, fh);
                } else if (anim) {
                    // cuadro numerado (item/clock/0.png): imagen entera al slot
                    ctx.drawImage(anim.img, fx, fy, fw, fh);
                } else if (tinted) {
                    // esmeralda = diamante recoloreado, ya en canvas propio
                    ctx.drawImage(tinted, fx, fy, fw, fh);
                } else if (rotated) {
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

        // sin vanilla de base Y sin matches el canvas queda transparente:
        // aplicarlo es regalar un mundo invisible sobre fondo blanco.
        if (!vanilla && stats.custom === 0) {
            console.error(`${TAG} atlas vacío (sin base vanilla y sin matches) — no aplico nada`);
            return null;
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
            var ACTIVE_KEY = ${JSON.stringify(ACTIVE_KEY)};
            var RES_KEY = ${JSON.stringify(RES_KEY)};
            var dataUrl = localStorage.getItem(KEY);
            if (!dataUrl) { console.warn('minifeather texturepack No dataUrl in localStorage'); return; }
            var PREFIX = 'data:image/png;base64,';
            if (dataUrl.slice(0, PREFIX.length) !== PREFIX) { console.warn('minifeather texturepack dataUrl raro, no intercepto'); return; }

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
                    try {
                        return Promise.resolve(new Response(dataUrlToBlob(dataUrl),{headers:{'Content-Type':'image/png'}}));
                    } catch (e) {
                        // atlas roto en vivo: soltar el flag y dejar pasar la
                        // red real, como dios manda.
                        console.warn('minifeather texturepack atlas roto en fetch (' + e + ') — red real');
                        try { localStorage.removeItem(ACTIVE_KEY); } catch (_) {}
                    }
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

        })();`;

        const script = document.createElement('script');
        script.textContent = code;
        (document.head || document.documentElement).appendChild(script);
        script.remove();

        void 0;
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
        // los strips de animación viajan con un .png.mcmeta hermano que puede
        // reordenar cuadros; se parsea para que animMatch respete el orden.
        const metaEntries = Object.values(zip.files).filter(
            f => !f.dir && f.name.toLowerCase().endsWith('.png.mcmeta')
        );
        const metas = new Map();
        await Promise.all(metaEntries.map(async (entry) => {
            try {
                const parsed = JSON.parse(await entry.async('text'));
                if (parsed && parsed.animation) {
                    const stem = entry.name.replace(/\\/g, '/').split('/').pop()
                        .replace(/\.png\.mcmeta$/i, '');
                    metas.set(stem.toLowerCase(), parsed);
                }
            } catch (_) {}
        }));

        void 0;

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
                // zips hechos por herramientas de Windows traen rutas con
                // backslash: sin normalizar, el basename sale con toda la ruta
                // adentro y el matching da CERO bloques.
                const normalized = entry.name.replace(/\\/g, '/');
                const segments = normalized.split('/');
                const baseName = segments.pop().replace(/\.png$/i, '');
                // ruta relativa de dos segmentos (entity/bed/black → bed/black):
                // es el tier con el que frames.json nombra camas, cofres y carteles.
                const dirLeaf = segments.length >= 1
                    ? segments[segments.length - 1] + '/' + baseName
                    : baseName;
                // ruta relativa después de /textures/ (entity/bed/black.png,
                // models/armor/diamond_layer_1.png): es la llave EXACTA con la
                // que el juego pide entidades individuales — no van en el atlas.
                const lowerAll = normalized.toLowerCase();
                const tIdx = lowerAll.lastIndexOf('/textures/');
                const relPath = tIdx !== -1 ? normalized.slice(tIdx + '/textures/'.length) : null;
                return { name: baseName, img, dirLeaf, meta: metas.get(baseName.toLowerCase()), relPath };
            } catch (_) {
                return null;
            }
        }));

        return images.filter(Boolean);
    }

    async function processUploadedFiles(fileList) {
        const customSprites = new Map();
        const dirLeaves = new Map();
        const animMeta = new Map();
        let entityFiles = {};
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
            void 0;
            const extracted = await extractZip(zipFile);
            for (const { name, img, dirLeaf, meta } of extracted) {
                if (!registerPbr(name, img)) customSprites.set(name, img);
                if (dirLeaf && !dirLeaves.has(dirLeaf.toLowerCase())) {
                    dirLeaves.set(dirLeaf.toLowerCase(), img);
                }
                if (meta && !animMeta.has(name.toLowerCase())) {
                    animMeta.set(name.toLowerCase(), meta);
                }
                loaded++;
            }
            void 0;
            // entidades: el juego las pide como archivos individuales
            // (/textures/entity/...), fuera del atlas — se empaquetan aparte.
            entityFiles = { ...entityFiles, ...buildEntityFiles(extracted) };
        }

        return { customSprites, dirLeaves, animMeta, pbrMaps, entityFiles, loaded };
    }

    // entidades y capas de armor del pack, indexadas por la ruta EXACTA con la
    // que el juego las pide (entity/bed/black.png, models/armor/iron_layer_1.png).
    // las miniblox-only (skeleton/sans) no existen en packs de MC → siguen locales.
    const ENTITY_LIMIT_FILES = 400;
    const ENTITY_LIMIT_BYTES = 8 * 1024 * 1024;

    function buildEntityFiles(extracted) {
        const out = {};
        let encoded = 0, count = 0;
        for (const { img, relPath } of extracted) {
            if (!relPath || count >= ENTITY_LIMIT_FILES || encoded >= ENTITY_LIMIT_BYTES) break;
            if (!(relPath.startsWith('entity/') || relPath.startsWith('models/armor/'))) continue;
            const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
            if (!w || !h) continue;
            try {
                const cv = document.createElement('canvas');
                cv.width = w; cv.height = h;
                cv.getContext('2d').drawImage(img, 0, 0);
                const d = cv.toDataURL('image/png');
                out[relPath] = d;
                count++;
                encoded += d.length;
            } catch (_) {}
        }
        // packs 1.21+ movieron el armor a entity/equipment/: el juego pide el
        // layout viejo models/armor/<mat>_layer_N.png — se aliasa al vuelo
        // (humanoid/<mat>.png → layer_1, humanoid_leggings/<mat>.png → layer_2)
        // para que el interceptor siga siendo tonto y por suffix-match.
        const alias = {};
        // lanzas y mazo: vanilla desde MC 26.x (miniblox las tomó de ahí) —
        // item/<mat>_spear[_in_hand].png → spear/<mat>_spear[_in_hand].png, y
        // la lanza netherite del pack es la infernium del juego.
        for (const p of Object.keys(out)) {
            let m = /^item\/([a-z]+)_spear(_in_hand)?\.png$/.exec(p);
            if (m) {
                const mat = m[1] === 'netherite' ? 'infernium' : m[1];
                alias['spear/' + mat + '_spear' + (m[2] || '') + '.png'] = out[p];
                continue;
            }
            if (p === 'item/mace.png') { alias['mace.png'] = out[p]; continue; }
            // renombres de layout MC → paths que pide miniblox
            if (p === 'entity/projectiles/arrow.png') { alias['entity/arrow.png'] = out[p]; continue; }
            if (p === 'entity/snow_golem.png' || p === 'entity/snow_golem/snow_golem.png') { alias['entity/snowman/snowman.png'] = out[p]; continue; }
            if (p === 'entity/chicken.png' || p === 'entity/chicken/chicken_temperate.png') { alias['entity/chicken/chicken.png'] = out[p]; continue; }
            if (p === 'entity/experience/experience_orb.png') { alias['entity/experience_orb.png'] = out[p]; continue; }
            // mobs con variantes de clima (1.21+): la temperate es la default
            m = /^entity\/([a-z]+)\/\1_temperate\.png$/.exec(p);
            if (m) { alias['entity/' + m[1] + '/' + m[1] + '.png'] = out[p]; continue; }
            // gatos con prefijo (cat_black.png → black.png), sin babies
            m = /^entity\/cat\/cat_([a-z_]+)\.png$/.exec(p);
            if (m && !/_baby$/.test(m[1])) alias['entity/cat/' + m[1] + '.png'] = out[p];
        }
        for (const p of Object.keys(out)) {
            let m = /^entity\/equipment\/humanoid\/(.+)\.png$/.exec(p);
            if (m) {
                alias['models/armor/' + m[1] + '_layer_1.png'] = out[p];
                if (m[1] === 'netherite') alias['models/armor/infernium_layer_1.png'] = out[p];
                continue;
            }
            m = /^entity\/equipment\/humanoid_leggings\/(.+)\.png$/.exec(p);
            if (m) {
                alias['models/armor/' + m[1] + '_layer_2.png'] = out[p];
                if (m[1] === 'netherite') alias['models/armor/infernium_layer_2.png'] = out[p];
                continue;
            }
            // armor en layout viejo pero ya con netherite: el infernium del juego
            m = /^models\/armor\/netherite_layer_([12])\.png$/.exec(p);
            if (m) { alias['models/armor/infernium_layer_' + m[1] + '.png'] = out[p]; continue; }
            // aldeas: el juego usa entity/villager/<prof>.png pelado; los packs
            // modernos van por profession/ y renombraron priest→cleric y
            // smith→toolsmith (el 'smith' de miniblox era el de herramientas).
            m = /^entity\/villager\/profession\/(.+)\.png$/.exec(p);
            if (m) {
                alias['entity/villager/' + m[1] + '.png'] = out[p];
                if (m[1] === 'cleric') alias['entity/villager/priest.png'] = out[p];
                if (m[1] === 'toolsmith') alias['entity/villager/smith.png'] = out[p];
            }
        }
        // el path real del pack siempre gana sobre un alias que caiga igual
        for (const k of Object.keys(alias)) {
            if (!out[k]) out[k] = alias[k];
        }
        return out;
    }

    function idbEntityPut(files) {
        return new Promise((resolve) => {
            let db = null;
            const req = indexedDB.open('mf_entity_store', 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains('packs')) {
                    req.result.createObjectStore('packs');
                }
            };
            req.onsuccess = () => {
                db = req.result;
                try {
                    const tx = db.transaction('packs', 'readwrite');
                    tx.objectStore('packs').put({ v: 1, files }, 'current');
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                } catch (_) { resolve(false); }
            };
            req.onerror = () => resolve(false);
        });
    }

    function idbEntityClear() {
        return new Promise((resolve) => {
            const req = indexedDB.open('mf_entity_store', 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains('packs')) {
                    req.result.createObjectStore('packs');
                }
            };
            req.onsuccess = () => {
                try {
                    const tx = req.result.transaction('packs', 'readwrite');
                    tx.objectStore('packs').delete('current');
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                } catch (_) { resolve(false); }
            };
            req.onerror = () => resolve(false);
        });
    }

    function setEntityActive(on) {
        try { localStorage.setItem('mf_entity_pack_active', on ? '1' : '0'); } catch (_) {}
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

        void 0;
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

    const PBR_ATLAS_GEN = 2;

    function pbrAtlasStale(rec) {
        return !rec || typeof rec !== 'object' || rec.v !== PBR_ATLAS_GEN;
    }

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
                const ok = await idbPut('atlas_' + kind, { ...atlas, v: PBR_ATLAS_GEN });
                if (ok) {
                    results[kind] = atlas.placed;
                } else {
                    console.error(`${TAG} PBR atlas '${kind}' generated but IndexedDB save failed`);
                    results[kind] = -1;
                }
            }
        }
        const anyOk = Object.values(results).some(v => v > 0);
        void 0;

        try {
            document.dispatchEvent(new CustomEvent('minifeather:pbr-update'));
        } catch (_) {}
        return results;
    }

    async function generateAndApply(files) {
        void 0;
        const { customSprites, dirLeaves, animMeta, entityFiles, pbrMaps, loaded } = await processUploadedFiles(files);

        if (loaded === 0) {
            console.warn(`${TAG} No valid PNG files found`);
            return { success: false, error: 'No valid PNG files' };
        }

        // entidades del pack: reemplazan SIEMPRE lo anterior (un pack sin
        // entity/ desactiva el servicio en vez de dejar mezcla vieja).
        const entityCount = entityFiles ? Object.keys(entityFiles).length : 0;
        if (entityCount > 0) {
            const ok = await idbEntityPut(entityFiles);
            setEntityActive(ok);
            if (!ok) console.warn(`${TAG} entity pack generated but IndexedDB save failed`);
        } else {
            await idbEntityClear();
            setEntityActive(false);
        }

        const hasPbr = pbrMaps.n.size || pbrMaps.s.size || pbrMaps.e.size;
        if (hasPbr) {
            const pbrStats = await generateAndStorePbr(pbrMaps);
            if (customSprites.size === 0) {
                return { success: true, stats: { custom: 0, placeholder: 0, pbr: pbrStats }, textureNames: [] };
            }
        }

        void 0;
        const result = await generateSpritesheet(customSprites, dirLeaves, animMeta);

        if (!result) {
            return { success: false, error: 'Generation failed' };
        }

        // probar que el atlas de verdad decodifica ANTES de activarlo: un
        // dataUrl muerto en localStorage es un interceptor roto que sobrevive
        // a todos los reloads del mundo.
        const sanity = await fetchImage(result.dataUrl);
        if (!sanity) {
            return { success: false, error: 'Generated atlas failed to decode' };
        }

        const saved = saveToStorage(result.dataUrl);
        if (!saved) {
            return { success: false, error: 'Storage quota exceeded. Try fewer textures.' };
        }

        localStorage.setItem(RES_KEY, String(result.stats.resolution));
        setActive(true);
        interceptSpritesheet(result.dataUrl);

        void 0;
        return { success: true, stats: { ...result.stats, entity: entityCount }, textureNames: result.textureNames };
    }

    function disable() {
        setActive(false);
        setEntityActive(false);
        void 0;
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
            void 0;
        });
    }

    function clearAll() {
        clearStorage();
        clearPbr();
        idbEntityClear();
        setEntityActive(false);
        void 0;
    }

    function init() {
        if (isActive()) {
            const dataUrl = loadFromStorage();
            if (dataUrl) {
                interceptSpritesheet(dataUrl);
                void 0;
            }
        }
    }

    // el preset 'bundled' fue retirado: los mapas procedían de un pack con
    // licencia all-rights-reserved (rre36 vía mlgimposter). lo que no se puede
    // redistribuir no se redistribuye, ni de madrugada ni de día. el pbr vive
    // ahora en modrinth y lo instala el usuario.
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
        try { return localStorage.getItem('mf_pbr_preset') || 'none'; }
        catch (_) { return 'none'; }
    }

    async function doInstallPreset(presetId) {
        const preset = PBR_PRESETS.find(p => p.id === presetId);
        if (!preset) return { success: false, error: `preset desconocido: ${presetId}` };

        void 0;
        const res = await fetch(preset.url);
        if (!res.ok) {
            return { success: false, error: `descarga falló (HTTP ${res.status})` };
        }
        const blob = await res.blob();
        void 0;

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
        void 0;

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
            void 0;
        }
        return { success: anyOk, results, maps: { n: pbrMaps.n.size, s: pbrMaps.s.size, e: pbrMaps.e.size } };
    }

    function installPreset(presetId) {
        if (presetInFlight) return presetInFlight;
        presetInFlight = doInstallPreset(presetId).finally(() => { presetInFlight = null; });
        return presetInFlight;
    }

    window.MF_TEXTURE_PACK = {
        generateAndApply,
        disable,
        clearAll,
        clearPbr,
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

    void 0;
    init();
})();
