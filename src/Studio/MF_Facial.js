
(function () {
    'use strict';
    if (window.__MF_Facial) return;
    const TAG = '[MF Facial]';

    const ID = 'mf-facial';
    const LS_KEY = 'minifeather_facials_v1';
    const FACE = { x: 8, y: 8, w: 8, h: 8 };
    const FACE_OV = { x: 40, y: 8, w: 8, h: 8 };

    const state = {
        open: false,
        library: {},          
        playing: null,        
        playTimer: null,      
        baseHead: null,       
        tex: null,            
        frameCache: new Map(), 
        dirty: true           
    };

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

    function getMesh() {
        const g = getGame();
        const me = g?.player;
        if (!me) return null;
        try { const e = g.world?.getPlayerById?.(me.id); if (e?.mesh) return e.mesh; } catch {}
        try { const e = g.world?.players?.get?.(me.id); if (e?.mesh) return e.mesh; } catch {}
        return me?.mesh || null;
    }

    // La capa vive en mesh.capeMesh (rama separada del body). El filtro 64xN
    // de abajo también matchea la textura de la capa (64x32) y el pintado
    // facial le inyectaba una textura 8x8 → WebGL INVALID_ENUM. Excluirla.
    function capeMeshesOf(mesh) {
        const out = [];
        try {
            if (mesh?.capeMesh) out.push(mesh.capeMesh);
            mesh?.traverse?.(o => {
                if (o && o !== mesh && o.capeMesh && !out.includes(o.capeMesh)) out.push(o.capeMesh);
            });
        } catch {}
        return out;
    }

    // Armadura del rig (bundle BfBcwb2y, setArmorSkinned): vive en los
    // registros mesh.skinnedArmor / mesh.armorMesh ({helmet, chestplate,
    // leggings, boots}) con texturas 64x32 propias — misma proporción que
    // una skin → sin excluirla, el filtro de abajo la matchea como skin.
    function armorMeshesOf(mesh) {
        const out = [];
        try {
            const regs = [mesh?.skinnedArmor, mesh?.armorMesh, mesh?.lodArmor];
            for (const reg of regs) {
                if (reg && typeof reg === 'object') {
                    for (const k in reg) if (reg[k]) out.push(reg[k]);
                }
            }
            // ruta vieja (no-skinned): claves de armadura dentro de mesh.meshes
            const mreg = mesh && mesh.meshes;
            if (mreg && typeof mreg === 'object') {
                for (const k in mreg) {
                    if (/helmet|chestplate|leggings|boots|armor/i.test(k) && mreg[k]) out.push(mreg[k]);
                }
            }
            mesh?.traverse?.(o => {
                if (o && o !== mesh && o.name && /helmet|chestplate|leggings|boots|armor/i.test(o.name) && !out.includes(o)) out.push(o);
            });
        } catch {}
        return out;
    }

    function findSkinMaterials(mesh) {
        const out = [];
        if (!mesh) return out;
        const seen = new Set();
        mesh.traverse(o => {
            if (!o?.material) return;
            const list = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of list) {
                if (m?.map && !seen.has(m)) { seen.add(m); out.push(m); }
            }
        });
        const capeMats = new Set();
        capeMeshesOf(mesh).forEach(cm => cm.traverse(o => {
            if (!o?.material) return;
            const list = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of list) if (m?.map) capeMats.add(m);
        }));
        armorMeshesOf(mesh).forEach(am => am.traverse(o => {
            if (!o?.material) return;
            const list = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of list) if (m?.map) capeMats.add(m); // mismo set de exclusión
        }));
        const body = out.filter(m => !capeMats.has(m));
        const skins = body.filter(m => {
            const w = m.map?.image?.width, h = m.map?.image?.height;
            if (!w || !h) return false;
            // solo proporciones de skin reales: 64x32/64x64/128x64/128x128
            const k64 = w / 64;
            return Number.isInteger(k64) && (h === w || h === w / 2) && k64 <= 4;
        });
        return skins.length ? skins : (body.length ? body : out);
    }

    function resolveFace(name) {
        if (state.frameCache.has(name)) return state.frameCache.get(name);
        const p = (async () => {
            if (name === 'base') {
                return state.baseHead
                    ? { canvas: cloneCanvas(state.baseHead), kind: 'head' }
                    : { canvas: blankFace(), kind: 'face' };
            }
            if (/^p:/.test(name)) {
                
                const nm = name.replace(/^p:/, '');
                const hit = (window.MF_SkinEditor?.presets?.() || []).find(pr => pr.name === nm);
                if (hit?.thumb) {
                    const img = await loadImg(hit.thumb);
                    const c = document.createElement('canvas');
                    c.width = 64; c.height = 16;
                    const ctx = c.getContext('2d');
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, 0, 0);
                    return { canvas: c, kind: 'head' };
                }
                return null; 
            }
            if (/^skin_/.test(name)) {
                
                const nm = name.replace(/^skin_/, '');
                const it = (window.MF_SkinChanger?.items || []).find(i => i.name === nm);
                if (it?.dataURL) {
                    const img = await loadImg(it.dataURL);
                    
                    const k = Math.max(1, Math.round(img.width / 64));
                    const c = document.createElement('canvas');
                    c.width = 8; c.height = 8;
                    const ctx = c.getContext('2d');
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, 8 * k, 8 * k, 8 * k, 8 * k, 0, 0, 8, 8);
                    return { canvas: c, kind: 'face' };
                }
                return null;
            }
            if (/^fs:/.test(name)) {
                
                const slash = name.indexOf('/');
                if (slash < 0) return null;
                const id = name.slice(3, slash), file = name.slice(slash + 1);
                const img = await packImg(id, file).catch(() => null);
                if (!img) return null;
                
                const sk = Math.max(1, Math.round(img.width / 32));
                const c = document.createElement('canvas');
                c.width = 64 * sk; c.height = 16 * sk;
                const ctx = c.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                
                if (state.baseHead) ctx.drawImage(state.baseHead, 0, 0, 64 * sk, 16 * sk);
                ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 32 * sk, 16 * sk);
                return { canvas: c, kind: 'head', k: sk };
            }
            
            const cv = await window.MF_FaceSwap?.loadFaceCanvas?.(name);
            if (cv) return { canvas: cv, kind: 'face' };
            return null; 
        })();
        state.frameCache.set(name, p);
        
        p.then(v => { if (v === null && /^fs:/.test(name)) state.frameCache.delete(name); }).catch(() => {});
        return p;
    }

    function blankFace() {
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        return c;
    }

    function cloneCanvas(src, w, h) {
        const c = document.createElement('canvas');
        c.width = w || src.width; c.height = h || src.height;
        c.getContext('2d').drawImage(src, 0, 0);
        return c;
    }

    function loadImg(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('could not load the image'));
            img.src = url;
        });
    }

    const PACKS_DIR = 'skins/facialskins/';
    const packImgCache = new Map(); 

    function extAssetUrl(rel) {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
            return chrome.runtime.getURL(rel);
        }
        
        const meta = document.querySelector('meta[name="mf-skins-base"]');
        const base = meta?.content;
        if (base) {
            const b = base.replace(/\/$/, '') + '/';
            
            const noPrefix = rel.replace(/^skins\//, '');
            return b + noPrefix;
        }
        return null;
    }

    function packBaseUrl(packId) {
        const serverKnown = [
            'adele', 'adventure', 'aether', 'alice', 'apex', 'ariel', 'aurora',
            'banana', 'bob', 'cat', 'celeste', 'ethan'
        ];
        return serverKnown.includes(packId) ? PACKS_DIR : MY_PACKS_DIR;
    }

    function loadPackImg(id, file) {
        const key = id + '/' + file;
        if (packImgCache.has(key)) return packImgCache.get(key);
        const url = extAssetUrl(packBaseUrl(id) + id + '/' + file + '.png');
        const p = url
            ? loadImg(url).catch(() => null)
            : Promise.resolve(null);
        packImgCache.set(key, p);
        return p;
    }

    const FRONT_NAMES = ['alfrente', 'al frente', 'afrente', 'al frente1', 'frente'];
    async function loadPackFront(id) {
        for (const n of FRONT_NAMES) {
            const img = await loadPackImg(id, n);
            if (img) return { img, usedName: n };
        }
        return null;
    }

    function normSkinId(v) {
        if (typeof v !== 'string' || !v) return '';
        let s = v.split('/').pop().replace(/\.png$/i, '');
        const cl = CUSTOM_PREFIX + MF_NAME_PREFIX;   
        if (s.toLowerCase().startsWith(cl)) s = s.slice(cl.length);
        else if (s.toLowerCase().startsWith(MFPACK_PREFIX)) s = s.slice(MFPACK_PREFIX.length);
        return s.toLowerCase();
    }

    function currentSkinId() {
        
        const norm = normSkinId;
        try {
            const sc = window.MF_SkinChanger?.current;
            if (typeof sc === 'string' && sc) return norm(sc);
        } catch {}
        const g = getGame();
        const me = g?.player;
        const cand = [
            me?.profile?.cosmetics?.skin,
            me?.profile?.skin,
            me?.mesh?.model?.skin,
            me?.mesh?.entity?.profile?.cosmetics?.skin,
            g?.world?.getPlayerById?.(me?.id)?.profile?.cosmetics?.skin
        ];
        for (const c of cand) {
            if (typeof c === 'string' && c) {
                const id = norm(c);
                if (id) return id;
            }
        }
        return apiSkin.value;
    }

    const apiSkin = { value: null, lastPatch: null };
    function noteApiSkin(id) {
        if (typeof id !== 'string' || !id) return;
        const clean = id.split('/').pop().replace(/\.png$/i, '').toLowerCase();
        if (clean && clean !== apiSkin.value) {
            void 0;
            apiSkin.value = clean;
        }
    }
    function extractSkinFromBody(text) {
        try {
            const j = JSON.parse(text);
            if (typeof j?.skin === 'string') return j.skin;
        } catch {}
        return null;
    }

    try {
        const origFetch = window.fetch;
        window.fetch = function (input, init) {
            let url = '';
            try {
                url = typeof input === 'string' ? input : (input?.url || '');
            } catch {}
            const p = origFetch.apply(this, arguments);
            if (url.includes('/auth-api/accounts/me')) {
                try {
                    
                    const method = (init?.method || (input?.method) || 'GET').toUpperCase();
                    const body = init?.body || input && typeof input !== 'string' ? (input?.body ?? init?.body) : init?.body;
                    if (method !== 'GET' && method !== 'HEAD' && body) {
                        try { noteApiSkin(extractSkinFromBody(String(body))); } catch {}
                    }
                    p.then(r => {
                        try {
                            if (r.ok) r.clone().text().then(t => noteApiSkin(extractSkinFromBody(t))).catch(() => {});
                        } catch {}
                        return r;
                    }).catch(() => {});
                } catch {}
            }
            return p;
        };
    } catch {}

    try {
        const origJson = Response.prototype.json;
        if (!origJson.__mfFacialSkin) {
            const wrapped = async function (...args) {
                const j = await origJson.apply(this, args);
                try {
                    if (typeof this?.url === 'string' && this.url.includes('/auth-api/accounts/me') &&
                        typeof j?.skin === 'string') {
                        noteApiSkin(j.skin);
                    }
                } catch {}
                return j;
            };
            Object.defineProperty(wrapped, '__mfFacialSkin', { value: true });
            Response.prototype.json = wrapped;
        }
    } catch {}

    const apiFetchFail = { at: -1e9 };
    function fetchApiSkin(maxAgeMs = 8000) {
        
        if (apiSkin.value) return Promise.resolve(apiSkin.value);
        if (performance.now() - apiFetchFail.at < 60000) return Promise.resolve(null);
        return fetch(location.origin + '/auth-api/accounts/me', {
            method: 'POST',
            credentials: 'include', cache: 'no-store',
            headers: { 'content-type': 'application/json' },
            body: '{}'
        })
            .then(r => {
                if (!r.ok) { apiFetchFail.at = performance.now(); return null; }
                return r.json();
            })
            .then(j => { noteApiSkin(j?.skin); return apiSkin.value; })
            .catch(() => { apiFetchFail.at = performance.now(); return apiSkin.value; });
    }

    function currentPlayerUuid() {
        const g = getGame() || globalThis.__MINIBLOX_GAME__ || null;
        const me = g?.player;
        if (!me) return null;
        const isUuid = (v) => typeof v === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
        if (isUuid(me.uuid)) return me.uuid.toLowerCase();
        if (isUuid(me.profile?.uuid)) return me.profile.uuid.toLowerCase();
        if (isUuid(me.id)) return me.id.toLowerCase();
        
        try {
            const pl = g?.playerList;
            const entries = pl?.values ? [...pl.values()] : (pl ? Object.values(pl) : []);
            for (const e of entries) {
                if ((isUuid(e?.uuid) && (e.uuid === me.uuid || e.id === me.id)) ||
                    (e?.username === me.username && isUuid(e?.uuid))) {
                    return e.uuid.toLowerCase();
                }
            }
        } catch {}
        return null;
    }

    const packIndex = [];

    const PACKS_DB = 'minifeather_facialpacks';
    let packsDb = null;
    function packsDbOpen() {
        if (packsDb) return Promise.resolve(packsDb);
        return new Promise((res, rej) => {
            const rq = indexedDB.open(PACKS_DB, 1);
            rq.onupgradeneeded = () => rq.result.createObjectStore('packs', { keyPath: 'id' });
            rq.onsuccess = () => { packsDb = rq.result; res(packsDb); };
            rq.onerror = () => rej(rq.error);
        });
    }
    function packsDbAll() {
        return packsDbOpen().then(db => new Promise((res, rej) => {
            const rq = db.transaction('packs', 'readonly').objectStore('packs').getAll();
            rq.onsuccess = () => res(rq.result || []);
            rq.onerror = () => rej(rq.error);
        }));
    }
    function packsDbPut(item) {
        return packsDbOpen().then(db => new Promise((res, rej) => {
            const rq = db.transaction('packs', 'readwrite').objectStore('packs').put(item);
            rq.onsuccess = () => res(true);
            rq.onerror = () => rej(rq.error);
        }));
    }
    function packsDbDel(id) {
        return packsDbOpen().then(db => new Promise((res, rej) => {
            const rq = db.transaction('packs', 'readwrite').objectStore('packs').delete(id);
            rq.onsuccess = () => res(true);
            rq.onerror = () => rej(rq.error);
        }));
    }

    async function packImg(id, file) {
        const custom = customPacks.get(id);
        if (custom) {
            const key = id + '/' + file;
            if (packImgCache.has(key)) return packImgCache.get(key);
            const du = custom.sprites[file] || null;
            const p = du ? loadImg(du).catch(() => null) : Promise.resolve(null);
            packImgCache.set(key, p);
            return p;
        }
        
        return loadPackImg(id, file.replace(/\.png$/i, ''));
    }

    async function zipRead(buf) {
        const dv = new DataView(buf);
        const files = new Map(); 
        
        let eocd = -1;
        for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
            if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('invalid ZIP (no EOCD)');
        const count = dv.getUint16(eocd + 10, true);
        let off = dv.getUint32(eocd + 16, true); 
        const entries = [];
        for (let i = 0; i < count; i++) {
            if (dv.getUint32(off, true) !== 0x02014b50) break;
            const method = dv.getUint16(off + 10, true);
            const csize = dv.getUint32(off + 20, true);
            const nlen = dv.getUint16(off + 28, true);
            const elen = dv.getUint16(off + 30, true);
            const clen = dv.getUint16(off + 32, true);
            const lho = dv.getUint32(off + 42, true);
            const name = new TextDecoder().decode(new Uint8Array(buf, off + 46, nlen));
            entries.push({ name, method, csize, lho });
            off += 46 + nlen + elen + clen;
        }
        
        for (const e of entries) {
            if (e.name.endsWith('/')) { files.set(e.name, null); continue; }
            if (dv.getUint32(e.lho, true) !== 0x04034b50) continue;
            const nlen = dv.getUint16(e.lho + 26, true);
            const elen = dv.getUint16(e.lho + 28, true);
            const start = e.lho + 30 + nlen + elen;
            const raw = new Uint8Array(buf, start, e.csize);
            let data = raw;
            if (e.method === 8) { 
                const ds = new DecompressionStream('deflate-raw');
                const stream = new Blob([raw]).stream().pipeThrough(ds);
                data = new Uint8Array(await new Response(stream).arrayBuffer());
            } else if (e.method !== 0) continue;
            files.set(e.name, data);
        }
        return files;
    }

    function zipWrite(files) { 
        const enc = new TextEncoder();
        const chunks = [];
        const central = [];
        let offset = 0;
        const crcTable = (() => {
            const t = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                t[n] = c >>> 0;
            }
            return t;
        })();
        const crc32 = (d) => {
            let c = 0xFFFFFFFF;
            for (let i = 0; i < d.length; i++) c = crcTable[(c ^ d[i]) & 0xFF] ^ (c >>> 8);
            return (c ^ 0xFFFFFFFF) >>> 0;
        };
        for (const [name, data] of files) {
            const nb = enc.encode(name);
            const crc = crc32(data);
            const lh = new Uint8Array(30 + nb.length);
            const lv = new DataView(lh.buffer);
            lv.setUint32(0, 0x04034b50, true);
            lv.setUint16(4, 20, true);      
            lv.setUint16(6, 0, true);       
            lv.setUint16(8, 0, true);       
            lv.setUint16(10, 0, true);      
            lv.setUint16(12, 0, true);      
            lv.setUint32(14, crc, true);
            lv.setUint32(18, data.length, true);
            lv.setUint32(22, data.length, true);
            lv.setUint16(26, nb.length, true);
            lv.setUint16(28, 0, true);
            lh.set(nb, 30);
            chunks.push(lh, data);
            central.push({ nb, crc, size: data.length, offset });
            offset += lh.length + data.length;
        }
        const cdStart = offset;
        for (const c of central) {
            const ch = new Uint8Array(46 + c.nb.length);
            const cv = new DataView(ch.buffer);
            cv.setUint32(0, 0x02014b50, true);
            cv.setUint16(4, 20, true);
            cv.setUint16(6, 20, true);
            cv.setUint32(16, c.crc, true);
            cv.setUint32(20, c.size, true);
            cv.setUint32(24, c.size, true);
            cv.setUint16(28, c.nb.length, true);
            cv.setUint32(42, c.offset, true);
            ch.set(c.nb, 46);
            chunks.push(ch);
            offset += ch.length;
        }
        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(8, central.length, true);
        ev.setUint16(10, central.length, true);
        ev.setUint32(12, offset - cdStart, true);
        ev.setUint32(16, cdStart, true);
        chunks.push(eocd);
        return new Blob(chunks, { type: 'application/zip' });
    }

    async function importPackZip(file) {
        const buf = await file.arrayBuffer();
        const files = await zipRead(buf);
        
        const names = [...files.keys()];
        const pjName = names.find(n => /(^|\/)pack\.json$/i.test(n));
        if (!pjName) throw new Error('the ZIP has no pack.json');
        const dir = pjName.includes('/') ? pjName.slice(0, pjName.lastIndexOf('/') + 1) : '';
        const j = JSON.parse(new TextDecoder().decode(files.get(pjName)));
        const id = String(j.id || file.name.replace(/\.zip$/i, '')).toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (!id) throw new Error('pack.json without "id"');

        const pick = (v, fallback) => {
            const n = typeof v === 'string' ? v : (v && v.file);
            return n ? dir + n : fallback;
        };
        const pack = {
            id,
            name: String(j.name || id),
            author: String(j.author || ''),
            version: +j.version || 1,
            uuid: typeof j.uuid === 'string' ? j.uuid.toLowerCase() : null,
            skin: null,
            sprites: { front: null, left: null, right: null, up: null, down: null, blink: null }
        };
        const want = new Set();
        const sp = j.sprites || {};
        const spriteFiles = {
            front: pick(sp.front, dir + 'alfrente.png'),
            left: pick(sp.left, dir + 'izquierda.png'),
            right: pick(sp.right, dir + 'derecha.png'),
            up: pick(sp.up, null),     
            down: pick(sp.down, null),
            brow: pick(sp.brow, null),
            blink: pick(sp.blink, dir + 'blink.png')
        };
        for (const k in spriteFiles) if (spriteFiles[k]) want.add(spriteFiles[k]);
        const skinFile = j.skin ? dir + j.skin : null;
        if (skinFile) want.add(skinFile);
        
        const lower = new Map([...files.keys()].map(n => [n.toLowerCase(), n]));
        const resolve = (wantName) => {
            if (files.has(wantName)) return wantName;
            return lower.get(wantName.toLowerCase()) || null;
        };
        const blobOf = async (name) => {
            if (!name) return null;
            const rn = resolve(name);
            const d = rn ? files.get(rn) : null;
            if (!d) return null;
            return await new Promise(res => {
                const fr = new FileReader();
                fr.onload = () => res(fr.result);
                fr.onerror = () => res(null);
                fr.readAsDataURL(new Blob([d], { type: 'image/png' }));
            });
        };
        const OPTIONAL = new Set(['up', 'down', 'brow']); 
        for (const key in spriteFiles) {
            const du = await blobOf(spriteFiles[key]);
            if (!du) {
                if (OPTIONAL.has(key)) continue; 
                throw new Error('missing sprite "' + key + '" (' + spriteFiles[key] + ')');
            }
            pack.sprites[key] = du;
        }
        pack.skin = await blobOf(skinFile);
        
        for (const key of [...packImgCache.keys()]) {
            if (key.startsWith(id + '/')) packImgCache.delete(key);
        }
        for (const key of [...state.frameCache.keys()]) {
            if (key.startsWith('fs:' + id + '/')) state.frameCache.delete(key);
        }
        auto._blinkCache = null; auto._blinkCacheZone = null; auto._blinkCacheKind = null;
        
        await packsDbPut(pack);
        await loadCustomPacks();
        
        try {
            const saved = JSON.parse(localStorage.getItem('mff:mypacks') || '[]');
            if (!saved.includes(id)) {
                saved.push(id);
                localStorage.setItem('mff:mypacks', JSON.stringify(saved));
            }
        } catch {}
        
        try { await applyPackSkinToGame(id); } catch {}
        return pack;
    }

    async function exportPackZip(id) {
        const p = packIndex.find(x => x.id === id);
        if (!p) throw new Error('pack "' + id + '" not found');
        const files = [];
        const j = { id: p.id, name: p.name || p.id, author: p.author || '', version: p.version || 1 };
        const sprites = {};
        const map = { front: p.front, left: p.left, right: p.right, blink: p.blink };
        const custom = customPacks.get(id);
        let bytes = async (file) => null;
        if (custom) {
            bytes = async (key) => {
                const du = custom.sprites[key];
                if (!du) return null;
                const b = await (await fetch(du)).blob();
                return new Uint8Array(await b.arrayBuffer());
            };
        } else {
            bytes = async (file) => {
                const img = await loadPackImg(id, file.replace(/\.png$/i, ''));
                if (!img) return null;
                
                const b = await (await fetch(img.src)).blob();
                return new Uint8Array(await b.arrayBuffer());
            };
        }
        for (const k in map) {
            if (!map[k]) continue;
            const base = custom ? k : map[k].replace(/\.png$/i, '');
            const d = await bytes(custom ? k : map[k]);
            if (d) {
                files.push([base + '.png', d]);
                sprites[k] = base + '.png';
            }
        }
        if (custom && custom.skin) {
            const b = await (await fetch(custom.skin)).blob();
            const d = new Uint8Array(await b.arrayBuffer());
            files.push([id + '.png', d]);
            j.skin = id + '.png';
        } else if (p.skinFile) {
            const base = p.skinFile.replace(/\.png$/i, '');
            const d = await bytes(p.skinFile);
            if (d) { files.push([base + '.png', d]); j.skin = base + '.png'; }
        }
        j.sprites = sprites;
        files.push(['pack.json', new TextEncoder().encode(JSON.stringify(j, null, 2))]);
        const blob = zipWrite(files);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = p.id + '-pack.zip';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        return { ok: true, files: files.length };
    }

    const customPacks = new Map();
    async function loadCustomPacks() {
        try {
            const all = await packsDbAll();
            customPacks.clear();
            for (const p of all) customPacks.set(p.id, p);
        } catch {}
        rebuildPackIndex();
    }

    const MFPACK_PREFIX = 'mfpack:';   
    const CUSTOM_PREFIX = 'custom:';   
    const MF_NAME_PREFIX = 'mf_';      
    const CUSTOM_SKIN_URL = '/auth-api/skins/custom/'; 
    function packSkinUrl(packId) {
        
        const custom = customPacks.get(packId);
        if (custom?.skin) return custom.skin;
        
        const p = builtinPacks.find(x => x.id === packId && !x.server);
        if (p) {
            const base = p.skinFile ? MY_PACKS_DIR + packId + '/' + p.skinFile
                                    : MY_PACKS_DIR + packId + '/' + packId + '.png';
            return extAssetUrl(base);
        }
        
        return null;
    }
    
    const packSkinReg = (globalThis.__MF_PACK_SKINS__ ||= {});
    const CUSTOM_URL_RE = /(?:^|\/)auth-api\/skins\/custom\/([^\/?#]+)\.png(?:[?#]|$)/;
    function registerPackSkin(packId) {
        const url = packSkinUrl(packId);
        if (!url) return false;
        packSkinReg[MF_NAME_PREFIX + packId] = url;
        return true;
    }
    
    function installPackImgHook() {
        if (globalThis.__MF_PACK_IMG_HOOK__) return;
        const proto = HTMLImageElement.prototype;
        const d = Object.getOwnPropertyDescriptor(proto, 'src');
        if (!d?.set || !d?.get) return;
        const origSet = d.set;
        Object.defineProperty(proto, 'src', {
            configurable: true,
            enumerable: d.enumerable,
            get() { return d.get.call(this); },
            set(v) {
                if (typeof v === 'string') {
                    const reg = globalThis.__MF_PACK_SKINS__;
                    if (reg) {
                        
                        const m = v.match(CUSTOM_URL_RE);
                        if (m && reg[m[1]]) {
                            origSet.call(this, reg[m[1]]);
                            return;
                        }
                        
                        const m2 = v.match(/^textures\/entity\/skins\/([^/?#]+)\.png/);
                        if (m2 && reg[m2[1]]) {
                            origSet.call(this, reg[m2[1]]);
                            return;
                        }
                    }
                }
                origSet.call(this, v);
            }
        });
        globalThis.__MF_PACK_IMG_HOOK__ = true;
    }
    
    const PACK_LAST_KEY = 'mff:pack-last-server-skin';
    function rememberServerSkin(id) {
        packLastServerSkin = id;
        try { sessionStorage.setItem(PACK_LAST_KEY, id); } catch {}
    }
    function savedServerSkin() {
        if (packLastServerSkin) return packLastServerSkin;
        try {
            const v = sessionStorage.getItem(PACK_LAST_KEY);
            if (v && !String(v).startsWith(MFPACK_PREFIX) && !String(v).startsWith(CUSTOM_PREFIX)) {
                return v;
            }
        } catch {}
        return null;
    }
    
    let packLastServerSkin = null;
    async function applyPackSkinToGame(packId) {
        const g = getGame();
        const me = g?.player;
        if (!g || !me) throw new Error('no game loaded (enter a world first)');
        if (!registerPackSkin(packId)) throw new Error('the pack has no PNG skin');
        
        const cur = me.profile?.cosmetics?.skin;
        if (cur && !String(cur).startsWith(MFPACK_PREFIX) && !String(cur).startsWith(CUSTOM_PREFIX)) {
            rememberServerSkin(cur);
        }
        
        try { window.MF_SkinChanger?.release?.(); } catch {}
        me.profile.cosmetics.skin = CUSTOM_PREFIX + MF_NAME_PREFIX + packId;
        
        let mesh = null;
        try { mesh = g.world?.getPlayerById?.(me.id)?.mesh || me.mesh; } catch {}
        try {
            if (mesh?.recreate) await mesh.recreate();
            else if (typeof mesh?.init === 'function') await mesh.init();
        } catch {}
        return true;
    }

    async function releasePackSkin() {
        const g = getGame();
        const me = g?.player;
        if (!g || !me) throw new Error('no game loaded');
        const cur = me.profile?.cosmetics?.skin;
        if (!String(cur || '').startsWith(MFPACK_PREFIX) &&
            !String(cur || '').startsWith(CUSTOM_PREFIX)) return false; 
        
        const backup = savedServerSkin();
        me.profile.cosmetics.skin = backup || '';
        let mesh = null;
        try { mesh = g.world?.getPlayerById?.(me.id)?.mesh || me.mesh; } catch {}
        try {
            if (mesh?.recreate) await mesh.recreate();
            else if (typeof mesh?.init === 'function') await mesh.init();
        } catch {}
        packLastServerSkin = null;
        try { sessionStorage.removeItem(PACK_LAST_KEY); } catch {}
        return true;
    }

    function rebuildPackIndex() {
        packIndex.length = 0;
        for (const p of builtinPacks) packIndex.push(p);
        for (const p of customPacks.values()) {
            packIndex.push({
                id: p.id, name: p.name, author: p.author, version: p.version,
                uuid: p.uuid || null,
                
                front: 'front', left: 'left',
                right: 'right', blink: 'blink',
                up: p.sprites.up ? 'up' : null,       
                down: p.sprites.down ? 'down' : null,
                brow: p.sprites.brow ? 'brow' : null,
                skinFile: null, custom: true, server: false
            });
        }
        
        installPackImgHook();
        for (const p of packIndex) { try { registerPackSkin(p.id); } catch {} }
        renderPacksTab();
    }

    const builtinPacks = [];
    const SERVER_SKINS = new Set([
        'bob', 'alice', 'techno', 'ganyu', 'klee', 'hutao', 'kyoko',
        'georgenotfound', 'thebiggelo', 'jake', 'diana', 'holly',
        'endoskeleton', 'strange', 'corrupted', 'james', 'levi', 'deadpool',
        'vindicate', 'galactus', 'suit', 'remus', 'ironman', 'transformer',
        'adele', 'natalie', 'heather', 'lexi', 'sara', 'chris', 'aurora',
        'zane', 'hunter', 'seraphina', 'celeste', 'ember', 'finn',
        'adventure', 'raven', 'nova', 'panda', 'glory', 'cody', 'aether',
        'apex', 'katie', 'vain', 'ariel', 'duck', 'ethan', 'cat', 'tester',
        'remlin', 'sushi', 'qhyun', 'banana'
    ]);
    function isServerSkin(id) { return SERVER_SKINS.has(String(id).toLowerCase()); }
    async function loadBuiltinPacks() {
        builtinPacks.length = 0;
        const dirs = await builtinDirs();
        const results = await Promise.all(dirs.map(async (id) => {
            try {
                const url = extAssetUrl(packBaseUrl(id) + id + '/pack.json');
                if (!url) return null;
                const r = await fetch(url, { cache: 'no-store' });
                if (!r.ok) return null;
                const j = await r.json();
                const sp = j.sprites || {};
                return {
                    id: (j.id || id).toLowerCase(),
                    name: j.name || id,
                    author: j.author || '',
                    version: +j.version || 1,
                    uuid: typeof j.uuid === 'string' ? j.uuid.toLowerCase() : null, 
                    front: sp.front || null,
                    left: sp.left || 'izquierda.png',
                    right: sp.right || 'derecha.png',
                    up: sp.up || null,      
                    down: sp.down || null,  
                    brow: sp.brow || null,  
                    blink: sp.blink || 'blink.png',
                    skinFile: j.skin || null,
                    
                    server: isServerSkin(j.id || id)
                };
            } catch { return null; }
        }));
        for (const p of results) if (p) builtinPacks.push(p);
        rebuildPackIndex();
    }

    const MY_PACKS_DIR = 'skins/mypacks/';
    
    const MY_PACKS_IDS = ['shusukegxe', 'angrywolfx', 'eve'];
    async function builtinDirs() {
        const known = [
            'adele', 'adventure', 'aether', 'alice', 'apex', 'ariel', 'aurora',
            'banana', 'bob', 'cat', 'celeste', 'ethan'
        ];
        const mine = [...MY_PACKS_IDS];
        try {
            const saved = JSON.parse(localStorage.getItem('mff:mypacks') || '[]');
            for (const id of saved) if (!known.includes(id) && !mine.includes(id)) mine.push(id);
        } catch {}
        return [...known, ...mine];
    }

    function packFileUrl(id, file) {
        const custom = customPacks.get(id);
        if (custom) return custom.sprites[file] || null; 
        return extAssetUrl(packBaseUrl(id) + id + '/' + file);
    }

    function ensureSession() {
        const mesh = getMesh();
        if (!mesh) throw new Error('player not available (enter a world first)');
        const mats = findSkinMaterials(mesh);
        if (!mats.length) throw new Error('no skin material found');
        const src = mats[0].map;
        if (!src?.image) throw new Error('skin texture not readable');

        const skinIdNow = currentSkinId();

        // Textura AUTÉNTICA (no facial): de ella salen baseHead y el espejo
        // periódico del watchdog. Si src es nuestro propio canvas facial NO es
        // fuente válida (su contenido queda stale tras re-montajes del engine
        // o eventos skin-repainted perdidos) → preferir la última authTex.
        const srcIsOurs = !!(src.__mfLocalCanvas || src.__mfOtherKey || src.__mfPeerCanvas);
        if (!srcIsOurs) state.authTex = src;

        if ((!state.baseHead || state.baseHeadSkin !== skinIdNow) && !auto._blinkUntil) {
            // Nunca capturar la base desde nuestro propio canvas facial:
            // congelaría la cara animada como "base" y perpetuaría basura.
            const baseSrc = (srcIsOurs && state.authTex?.image) ? state.authTex : src;
            try {
                const k = Math.max(1, Math.round(baseSrc.image.width / 64));
                const c = document.createElement('canvas');
                c.width = 64 * k; c.height = 16 * k;
                c.getContext('2d').drawImage(baseSrc.image, 0, 0, 64 * k, 16 * k, 0, 0, 64 * k, 16 * k);
                state.baseHead = c; state.baseHeadK = k;
                state.baseHeadSkin = skinIdNow;
                // Referencia para el seguro anti-carrera: qué textura de
                // CustomSkins (__mfPainted) estaba montada al capturar esta base.
                state.baseSkinPainted = baseSrc.__mfPainted || null;

                state.frameCache.clear();
                auto._blinkCache = null;
                auto._blinkCacheZone = null;
            } catch {}
        }

        // Solo adoptar un canvas YA existente si es NUESTRO (sesión facial
        // previa). Antes adoptaba cualquier canvas — p.ej. el de CustomSkins
        // (__mfPainted) — y ambos sistemas pintaban sobre la misma textura.
        if (src.image instanceof HTMLCanvasElement && (src.__mfLocalCanvas || src.__mfOtherKey || src.__mfPeerCanvas)) {
            state.tex = src;
            return src.image;
        }
        
        const c = document.createElement('canvas');
        c.width = src.image.width; c.height = src.image.height;
        c.getContext('2d').drawImage(src.image, 0, 0);
        let nt = null;
        try { nt = new src.constructor(c); } catch {}
        if (!nt) throw new Error('could not create an editable texture');
        
        nt.__mfLocalCanvas = true;
        try {
            nt.magFilter = src.magFilter; nt.minFilter = src.minFilter;
            if (src.colorSpace !== undefined && 'colorSpace' in nt) nt.colorSpace = src.colorSpace;
            nt.flipY = src.flipY; nt.wrapS = src.wrapS; nt.wrapT = src.wrapT;
        } catch {}
        for (const m of mats) { m.map = nt; m.needsUpdate = true; }
        state.tex = nt;
        return c;
    }

    function paintFace(frame) {
        const canvas = ensureSession();
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        const k = Math.max(1, Math.round(canvas.width / 64));
        if (frame.kind === 'head') {
            // El hat/overlay del jugador (región u 32..56, geometría inflada
            // +0.4px del mismo mesh) es INTOCABLE para los frames: pintarlo
            // con píxeles de cara lo vuelve sólido y parece "casco con la
            // textura de la skin". Estrategia:
            //  1) Restaurar SIEMPRE la franja completa desde baseHead (usa
            //     sus propias dimensiones → seguro ante k distinto). Esto
            //     además auto-limpia basura dejada en sesiones anteriores.
            //  2) Componer el frame SOLO en la región de caras base
            //     (u 0..32): mitad izquierda del frame, escalada. NUNCA a
            //     ancho completo.
            if (state.baseHead) {
                ctx.drawImage(state.baseHead, 0, 0, state.baseHead.width, state.baseHead.height, 0, 0, 64 * k, 16 * k);
            } else {
                ctx.clearRect(0, 0, 32 * k, 16 * k);
            }
            ctx.drawImage(frame.canvas, 0, 0, frame.canvas.width / 2, frame.canvas.height, 0, 0, 32 * k, 16 * k);
        } else {
            ctx.clearRect(FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k);
            ctx.drawImage(frame.canvas, 0, 0, 8,  8, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k);
            // NO borrar FACE_OV: el overlay de la cara (flequillo/gorra de la
            // skin) debe seguir visible encima de la cara animada.
        }
        state.tex.needsUpdate = true;
    }

    function blendFrames(a, b, t) {
        const w = Math.max(a.canvas.width, b.canvas.width);
        const h = Math.max(a.canvas.height, b.canvas.height);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(a.canvas, 0, 0, w, h);
        ctx.globalAlpha = t;
        ctx.drawImage(b.canvas, 0, 0, w, h);
        ctx.globalAlpha = 1;
        return { canvas: c, kind: a.kind };
    }

    async function play(name) {
        const anim = state.library[name];
        if (!anim?.frames?.length) return { ok: false, error: 'facial "' + name + '" does not exist or has no frames' };
        stop(false);
        if (auto.on) autoStop(false); 
        try { ensureSession(); } catch (e) { return { ok: false, error: e.message }; }
        state.playing = name;

        const frames = [];
        for (const f of anim.frames) {
            let fr = null;
            try { fr = await resolveFace(f.face); } catch {}
            if (!fr) fr = state.baseHead
                ? { canvas: cloneCanvas(state.baseHead), kind: 'head' }
                : { canvas: blankFace(), kind: 'face' };
            frames.push({ canvas: fr.canvas, kind: fr.kind, holdMs: +f.holdMs || 400, blendMs: Math.max(0, +f.blendMs || 0) });
        }

        const t0 = performance.now();
        const tick = () => {
            if (!state.playing) return;
            const anim = state.library[state.playing];
            if (!anim) return stop(true);
            const dur = frames.reduce((s, f) => s + f.holdMs + f.blendMs, 0) || 1;
            let t = (performance.now() - t0) % dur;
            let i = 0;
            while (t > frames[i].holdMs + frames[i].blendMs) {
                t -= frames[i].holdMs + frames[i].blendMs;
                i = (i + 1) % frames.length;
            }
            const cur = frames[i];
            const nxt = frames[(i + 1) % frames.length];
            try {
                if (t > cur.holdMs && cur.blendMs > 0 && cur.kind === nxt.kind) {
                    
                    const k = (t - cur.holdMs) / cur.blendMs;
                    paintFace(blendFrames(cur, nxt, k));
                } else {
                    paintFace(cur);
                }
            } catch (e) {
                
                state.playing = null;
                if (state.playTimer) { cancelAnimationFrame(state.playTimer); state.playTimer = null; }
                console.warn(TAG + ' loop detenido: ' + e.message);
                return;
            }
            state.playTimer = requestAnimationFrame(tick);
        };
        tick();
        void 0;
        return { ok: true, name };
    }

    function stop(restore = true) {
        if (state.playTimer) { cancelAnimationFrame(state.playTimer); state.playTimer = null; }
        state.playing = null;
        if (restore && state.baseHead && state.tex) {
            try { paintFace({ canvas: state.baseHead, kind: 'head' }); } catch {}
        }
        renderUI();
        return { ok: true };
    }

    const LS_AUTO = LS_KEY + '_auto';
    const auto = {
        on: false,
        yawThreshold: 10,        
        pitchThreshold: 10,
        front: '',               
        left: '',                
        right: '',               
        up: '',
        down: '',
        blink: true,             
        blinkClosed: '',         
        blinkMinMs: 2000, blinkMaxMs: 7000,
        brow: false,             
        browFace: '',            
        browMs: 1400,            
        _browUntil: 0,           
        _raf: null,              
        _nextBlink: 0,           
        _blinkUntil: 0,          
        _blinkCache: null,       
        _blinkCacheZone: null,   
        _zone: 'front',          
        _refYaw: null, _refPitch: null, _lastT: 0 
    };

    function loadAuto() {
        try { Object.assign(auto, JSON.parse(localStorage.getItem(LS_AUTO) || '{}')); }
        catch {}
        
        if (auto.yawThreshold === 35) auto.yawThreshold = 10;
        if (auto.pitchThreshold === 30) auto.pitchThreshold = 10;
        
        auto._raf = null; auto._nextBlink = 0; auto._blinkUntil = 0;
        auto._blinkCache = null; auto._blinkCacheZone = null; auto._zone = 'front';
        auto._browUntil = 0; auto._browPainted = false;
        auto._refYaw = null; auto._refPitch = null; auto._lastT = 0;
    }
    function saveAuto() {
        try {
            localStorage.setItem(LS_AUTO, JSON.stringify({
                on: auto.on, yawThreshold: auto.yawThreshold, pitchThreshold: auto.pitchThreshold,
                front: auto.front, left: auto.left, right: auto.right, up: auto.up, down: auto.down,
                blink: auto.blink, blinkClosed: auto.blinkClosed,
                blinkMinMs: auto.blinkMinMs, blinkMaxMs: auto.blinkMaxMs,
                brow: auto.brow, browFace: auto.browFace, browMs: auto.browMs
            }));
        } catch {}
    }

    function cameraRig() {
        const g = getGame();
        const me = g?.player;
        try {
            const camera = me?.game?.gameScene?.camera || g?.gameScene?.camera;
            const pitchObj = camera?.parent, yawObj = camera?.parent?.parent;
            if (yawObj && typeof yawObj.rotation?.y === 'number' && typeof pitchObj?.rotation?.x === 'number') {
                return { yaw: yawObj.rotation.y, pitch: pitchObj.rotation.x };
            }
        } catch {}
        return null;
    }

    const wrapPi = (r) => { r = (r + Math.PI) % (Math.PI * 2); if (r < 0) r += Math.PI * 2; return r - Math.PI; };
    const D = 180 / Math.PI;

    function lookAngles() {
        const rig = cameraRig();
        if (!rig) return null;
        const now = performance.now();
        const dt = Math.min(0.1, (now - (auto._lastT || now)) / 1000);
        auto._lastT = now;
        if (auto._refYaw == null) { auto._refYaw = rig.yaw; auto._refPitch = rig.pitch; }
        const follow = Math.PI * dt;            
        auto._refYaw += Math.max(-follow, Math.min(follow, wrapPi(rig.yaw - auto._refYaw)));
        const fP = follow * 0.7;
        auto._refPitch += Math.max(-fP, Math.min(fP, Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rig.pitch - auto._refPitch))));
        return {
            yaw: wrapPi(rig.yaw - auto._refYaw) * D,     
            pitch: wrapPi(rig.pitch - auto._refPitch) * D,
            absYaw: wrapPi(rig.yaw) * D,                 
            absPitch: rig.pitch * D
        };
    }

    const HYST = () => Math.min(8, Math.max(2, Math.floor(Math.min(auto.yawThreshold, auto.pitchThreshold) / 2)));
    function zoneOf(a) {
        const z = auto._zone || 'front';
        const thr = auto.yawThreshold, pthr = auto.pitchThreshold;
        const hY = Math.min(HYST(), thr / 2), hP = Math.min(HYST(), pthr / 2);
        
        const inUp = auto.up && a.pitch > pthr, outUp = a.pitch > pthr - hP;
        const inDown = auto.down && a.pitch < -pthr, outDown = a.pitch < -(pthr - hP);
        const inR = auto.right && a.yaw > thr, outR = a.yaw > thr - hY;
        const inL = auto.left && a.yaw < -thr, outL = a.yaw < -(thr - hY);
        
        switch (z) {
            case 'up': if (auto.up && outUp) return 'up'; break;
            case 'down': if (auto.down && outDown) return 'down'; break;
            case 'left': if (auto.left && outL) return 'left'; break;
            case 'right': if (auto.right && outR) return 'right'; break;
        }
        if (inUp) return 'up';
        if (inDown) return 'down';
        if (inR) return 'right';
        if (inL) return 'left';
        return 'front';
    }

    const resolveAutoName = (n) => (typeof n === 'string' && n.startsWith('fs:')) ? n : 'p:' + n;

    async function paintZone(zone, force = false) {
        if (!force && auto._zone === zone) return;
        auto._zone = zone;
        const name = zone === 'front' ? (auto.front || null) : auto[zone] || null;
        try {
            let fr = null;
            if (name) fr = await resolveFace(resolveAutoName(name)).catch(() => null);
            if (!fr) fr = state.baseHead ? { canvas: state.baseHead, kind: 'head' } : { canvas: blankFace(), kind: 'face' };
            paintFace({ canvas: fr.canvas, kind: fr.kind });
        } catch {}
    }

    async function getBlinkCanvas() {
        const zone = auto._zone || 'front';
        if (auto._blinkCache && auto._blinkCacheZone === zone) return auto._blinkCache;

        const zoneFace = async () => {
            const name = zone === 'front' ? (auto.front || null) : auto[zone] || null;
            let fr = null;
            if (name) fr = await resolveFace(resolveAutoName(name)).catch(() => null);
            if (fr) {
                const k = fr.kind === 'head' ? Math.max(1, Math.round(fr.canvas.width / 64)) : 1;
                const c = document.createElement('canvas');
                c.width = 8; c.height = 8;
                const cx = c.getContext('2d', { willReadFrequently: true });
                cx.imageSmoothingEnabled = false;
                if (fr.kind === 'head') cx.drawImage(fr.canvas, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k, 0, 0, 8, 8);
                else cx.drawImage(fr.canvas, 0, 0, 8, 8, 0, 0, 8, 8);
                return c;
            }
            if (state.baseHead) {
                const bk = state.baseHeadK || 1;
                const c = document.createElement('canvas');
                c.width = 8; c.height = 8;
                const cx = c.getContext('2d', { willReadFrequently: true });
                cx.imageSmoothingEnabled = false;
                cx.drawImage(state.baseHead, FACE.x * bk, FACE.y * bk, FACE.w * bk, FACE.h * bk, 0, 0, 8, 8);
                return c;
            }
            return null;
        };

        try {
            
            if (auto.blinkClosed) {
                const fr = await resolveFace(resolveAutoName(auto.blinkClosed)).catch(() => null);
                if (fr) {
                    
                    if (fr.kind === 'head') {
                        auto._blinkCache = fr.canvas; auto._blinkCacheZone = zone;
                        auto._blinkCacheKind = 'head';
                        return fr.canvas;
                    }
                    const c = document.createElement('canvas');
                    c.width = 8; c.height = 8;
                    const cx = c.getContext('2d');
                    cx.imageSmoothingEnabled = false;
                    cx.drawImage(fr.canvas, 0, 0, 8, 8, 0, 0, 8, 8);
                    auto._blinkCache = c; auto._blinkCacheZone = zone;
                    auto._blinkCacheKind = 'face';
                    return c;
                }
            }
            
            const face = await zoneFace();
            if (face) {
                const cx = face.getContext('2d', { willReadFrequently: true });
                
                const cheek = cx.getImageData(1, 6, 1, 1).data;
                cx.fillStyle = `rgb(${cheek[0]},${cheek[1]},${cheek[2]})`;
                cx.fillRect(1, 4, 2, 2); 
                cx.fillRect(5, 4, 2, 2); 
                auto._blinkCache = face; auto._blinkCacheZone = zone;
                auto._blinkCacheKind = 'face';
                return face;
            }
        } catch {}
        return null;
    }

    function scheduleBlink(now) {
        auto._nextBlink = now + auto.blinkMinMs + Math.random() * Math.max(0, auto.blinkMaxMs - auto.blinkMinMs);
    }

    function broadcastFacial(a) {
        try { window.MF_Peer?.sendStudio?.({ t: 'facial', a }); } catch {}
    }

    const chatSeen = new WeakSet();
    const DEBUG_BROW = localStorage.getItem('mff:debug-brow') === '1';
    function debugBrow(...a) { if (DEBUG_BROW) void 0; }
    function chatQuestionWatch() {
        if (!auto.brow || !auto.on) { debugBrow('watch off (brow=' + auto.brow + ' on=' + auto.on + ')'); return; }
        const g = getGame() || globalThis.__MINIBLOX_GAME__ || null;
        const log = g?.chat?.log;
        if (!Array.isArray(log)) { debugBrow('sin chat: game=' + !!g + ' log=' + (log === undefined ? 'undefined' : typeof log)); return; }
        
        for (let i = Math.max(0, log.length - 12); i < log.length; i++) {
            const entry = log[i];
            if (!entry || typeof entry !== 'object' || chatSeen.has(entry)) continue;
            chatSeen.add(entry);
            const text = String(entry.text ?? entry.message ?? entry.content ?? '');
            const hasQ = text.includes('?');
            debugBrow('chat[' + i + ']' + (hasQ ? ' [?]' : '') + ': ' + JSON.stringify(text.slice(0, 60)));
            
            if (hasQ) {
                auto._browUntil = performance.now() + (auto.browMs || 1400);
                debugBrow('→ ceja hasta +' + (auto.browMs || 1400) + 'ms');
                return; 
            }
        }
    }

    async function getBrowCanvas() {
        
        if (auto.browFace) {
            const fr = await resolveFace(resolveAutoName(auto.browFace)).catch(e => { debugBrow('preset browFace falló:', e?.message || e); return null; });
            if (fr) {
                debugBrow('brow por preset: ' + auto.browFace + ' (kind=' + fr.kind + ')');
                if (fr.kind === 'head') return { canvas: fr.canvas, kind: 'head' };
                const c = document.createElement('canvas');
                c.width = 8; c.height = 8;
                const cx = c.getContext('2d');
                cx.imageSmoothingEnabled = false;
                cx.drawImage(fr.canvas, 0, 0, 8, 8, 0, 0, 8, 8);
                return { canvas: c, kind: 'face' };
            }
            debugBrow('preset browFace "' + auto.browFace + '" NO resolvió → siguiente fuente');
        }
        
        const zone = auto._zone || 'front';
        const name = zone === 'front' ? (auto.front || null) : auto[zone] || null;
        if (typeof name === 'string' && name.startsWith('fs:')) {
            const m = name.match(/^fs:([^/]+)\/(.+)$/);
            const pack = m ? packIndex.find(p => p.id === m[1]) : null;
            if (pack?.brow) {
                const fr = await resolveFace('fs:' + pack.id + '/' + pack.brow).catch(() => null);
                if (fr) { debugBrow('brow por pack: ' + pack.id + '/' + pack.brow + ' (kind=' + fr.kind + ')'); return { canvas: fr.canvas, kind: fr.kind }; }
                debugBrow('pack brow "' + pack.brow + '" NO cargó');
            } else {
                debugBrow('pack ' + (pack ? pack.id : m?.[1]) + ' sin sprite brow');
            }
        }
        
        debugBrow('brow SINTETIZADA sobre zona "' + zone + '"');
        const face = await zoneFace();
        if (!face) return null;
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.imageSmoothingEnabled = false;
        cx.drawImage(face, 0, 0);
        try {
            const hair = cx.getImageData(4, 0, 1, 1).data; 
            const row3 = cx.getImageData(0, 3, 8, 1);
            cx.putImageData(row3, 0, 2); 
            
            const cheek = cx.getImageData(1, 6, 1, 1).data;
            cx.fillStyle = `rgb(${Math.round((cheek[0] + hair[0]) / 2)},${Math.round((cheek[1] + hair[1]) / 2)},${Math.round((cheek[2] + hair[2]) / 2)})`;
            cx.fillRect(0, 3, 8, 1);
        } catch {}
        return { canvas: c, kind: 'face' };
    }

    function autoTick() {
        if (!auto.on) { auto._raf = null; return; }
        const now = performance.now();

        chatQuestionWatch();
        if (auto._browUntil) {
            if (now >= auto._browUntil) {
                debugBrow('fin de la ceja → restaurar zona "' + (auto._zone || 'front') + '"');
                auto._browUntil = 0;
                broadcastFacial('open'); 
                paintZone(auto._zone || 'front', true); 
            } else {
                
                if (!auto._browPainted) {
                    auto._browPainted = true;
                    broadcastFacial('brow'); 
                    debugBrow('pintando ceja (quedan ' + Math.round(auto._browUntil - now) + 'ms)');
                    getBrowCanvas().then(fr => {
                        if (fr && auto.on && auto._browUntil) {
                            try { paintFace({ canvas: fr.canvas, kind: fr.kind }); }
                            catch (e) {
                                
                                state.tex = null; state.baseHead = null;
                                debugBrow('brow: sesión inválida (' + e.message + ') → recapturar');
                            }
                        } else if (fr) {
                            debugBrow('canvas listo pero ventana cerrada (on=' + auto.on + ') — no se pinta');
                        }
                    });
                }
            }
        } else if (auto._browPainted) {
            auto._browPainted = false;
        }

        if (auto.blink && !auto._browUntil) {
            if (auto._blinkUntil && now >= auto._blinkUntil) {
                auto._blinkUntil = 0;
                scheduleBlink(now);
                broadcastFacial('open'); 
                paintZone(auto._zone || 'front', true); 
            } else if (!auto._blinkUntil && now >= auto._nextBlink) {
                auto._blinkUntil = now + 45 + Math.random() * 45; 
                broadcastFacial('blink'); 
                getBlinkCanvas().then(cv => {
                    
                    if (cv && auto.on && auto._blinkUntil && performance.now() < auto._blinkUntil) {
                        
                        try { paintFace({ canvas: cv, kind: auto._blinkCacheKind || 'face' }); }
                        catch (e) {
                            
                            auto._blinkUntil = 0; scheduleBlink(performance.now());
                            state.tex = null; state.baseHead = null;
                            debugBrow('blink: sesión inválida (' + e.message + ') → recapturar');
                        }
                    }
                }).catch(e => {
                    auto._blinkUntil = 0; scheduleBlink(performance.now());
                    debugBrow('blink falló: ' + (e?.message || e));
                });
            }
        }

        if (!auto._browUntil) {
            const angles = lookAngles();
            if (angles) {
                const z = zoneOf(angles);
                if (z !== auto._zone && !auto._blinkUntil) {
                    broadcastFacial(z); 
                    paintZone(z);
                }
            }
        }
        auto._raf = requestAnimationFrame(autoTick);
    }

    async function autoStart() {
        try { ensureSession(); } catch (e) { return { ok: false, error: e.message }; }
        stop(false);
        auto.on = true;
        // Encendido explícito: limpiar preferencia de OFF del usuario
        try { localStorage.removeItem(LS_KEY + '_autoUserOff'); } catch {}
        skinWatch.userOff = false;
        auto._zone = null; 
        auto._refYaw = null; auto._refPitch = null; auto._lastT = 0; 
        scheduleBlink(performance.now());
        if (!auto._raf) auto._raf = requestAnimationFrame(autoTick);
        renderUI();
        void 0;
        return { ok: true };
    }

    function autoStop(restore = true) {
        auto.on = false;
        if (auto._raf) { cancelAnimationFrame(auto._raf); auto._raf = null; }
        broadcastFacial('off'); 
        if (restore && state.baseHead && state.tex) {
            try { paintFace({ canvas: state.baseHead, kind: 'head' }); } catch {}
        }
        renderUI();
        return { ok: true };
    }

    const LS_OTHERS = LS_KEY + '_others';
    const others = {
        on: false,
        intervalMinMs: 2500,  
        intervalMaxMs: 6500,
        _raf: null,           
        _sessions: new Map()  
    };
    function loadOthers() {
        try { Object.assign(others, JSON.parse(localStorage.getItem(LS_OTHERS) || '{}')); } catch {}
        others._raf = null; others._sessions = new Map();
    }
    function saveOthers() {
        try {
            localStorage.setItem(LS_OTHERS, JSON.stringify({
                on: others.on, intervalMinMs: others.intervalMinMs, intervalMaxMs: others.intervalMaxMs
            }));
        } catch {}
    }
    loadOthers();

    function otherPlayers() {
        const g = getGame() || globalThis.__MINIBLOX_GAME__ || null;
        const me = g?.player;
        if (!g || !me) return [];
        const out = [];
        const seen = new Set();
        const meId = String(me.id ?? '');
        const meUuid = me.uuid != null ? String(me.uuid) : null;
        const isMe = (key, uuid) =>
            (meId && String(key) === meId) || (meUuid != null && uuid != null && String(uuid) === meUuid);
        const add = (key, e, name) => {
            if (!key || seen.has(key) || isMe(key, null)) return;
            const mesh = e?.mesh;
            if (!mesh) return;
            
            const uuid = typeof e?.uuid === 'string' ? e.uuid.toLowerCase() : null;
            const uname = String(e?.username || e?.profile?.username || name || '').toLowerCase() || null;
            let skin = '';
            const sc = e?.profile?.cosmetics?.skin || e?.profile?.skin || e?.mesh?.model?.skin;
            if (typeof sc === 'string' && sc) skin = normSkinId(sc);
            if (!skin) skin = skinForIdentity(uuid, uname);
            seen.add(key); out.push({ key: String(key), mesh, name: String(name || key).slice(0, 16), skin });
        };
        try {
            if (g.world?.players instanceof Map) {
                for (const [id, e] of g.world.players) {
                    if (isMe(id, e?.uuid)) continue;
                    add(e?.uuid || id, e, e?.username || e?.profile?.username || e?.name);
                }
            }
        } catch {}
        try {
            const pl = g.playerList;
            const entries = pl?.entries ? [...pl.entries()] : Object.entries(pl || {});
            for (const [k, v] of entries) {
                if (!v || typeof v !== 'object') continue;
                if (isMe(k, v.uuid)) continue;
                try { const e = g.world?.getPlayerById?.(k) || g.world?.players?.get?.(k); if (e) add(v.uuid || k, e, v.username || v.name); } catch {}
            }
        } catch {}
        return out;
    }

    function packForOther(skinId) {
        if (!skinId) return null;
        for (const p of packIndex) if (p.id === skinId) return p;
        return null;
    }
    
    function skinForIdentity(uuid, username) {
        const db = window.__MF_CustomSkins_DB__ || null;
        let v = '';
        if (db) {
            if (uuid && db.byUuid && db.byUuid[uuid]) v = db.byUuid[uuid];
            if (!v && username && db.byName) {
                const u = String(username);
                if (db.byName[u]) v = db.byName[u];
                else {
                    
                    const k = u.toLowerCase().replace(/[\s_-]+/g, '');
                    for (const n in db.byName) {
                        if (String(n).toLowerCase().replace(/[\s_-]+/g, '') === k) { v = db.byName[n]; break; }
                    }
                }
            }
        }
        return v ? normSkinId(v) : '';
    }
    
    function preloadOtherPack(s, pack) {
        if (!s || !pack || s.pack?._id === pack.id) return;
        const entry = { _id: pack.id, img: { front: null, left: null, right: null, up: null, down: null, blink: null } };
        s.pack = entry;
        for (const which of ['front', 'left', 'right', 'up', 'down', 'blink']) {
            const file = pack[which];
            if (!file) continue;
            packImg(pack.id, file)
                .then(img => { if (img && s.pack === entry) { entry.img[which] = img; s.zoneDirty = true; } })
                .catch(() => {});
        }
    }
    
    function paintOtherStrip(s, img) {
        try {
            const k = s.k || 1, cx = s.canvas.getContext('2d');
            cx.imageSmoothingEnabled = false;
            // Igual que paintFace local: restaurar la franja de la skin (con
            // su hat, región INTOCABLE — pintarla con cara la vuelve un
            // "casco" sólido con textura de skin) y componer el sprite
            // (half-strip, base 32x16) SOLO en la región de caras base.
            if (s.baseHead) {
                cx.drawImage(s.baseHead, 0, 0, s.baseHead.width, s.baseHead.height, 0, 0, 64 * k, 16 * k);
            } else {
                cx.clearRect(0, 0, 32 * k, 16 * k);
            }
            cx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 32 * k, 16 * k);
            s.tex.needsUpdate = true;
        } catch {}
    }

    function otherSession(p) {
        let s = others._sessions.get(p.key);
        const mats = findSkinMaterials(p.mesh);
        if (!mats.length) return null;

        let src = null;
        const srcMats = [];
        for (const m of mats) {
            const t = m.map;
            if (!t?.image) continue;
            if (t.image instanceof HTMLCanvasElement) {
                if (t.__mfLocalCanvas || t.__mfPeerCanvas) continue;
                if (t.__mfOtherKey && t.__mfOtherKey !== p.key) continue;
            }
            srcMats.push(m);
            if (!src) src = t;
        }
        const srcIsOurs = !!(src && src.image instanceof HTMLCanvasElement && src.__mfOtherKey === p.key);
        const now = performance.now();
        
        if (srcIsOurs && s?.tex) {
            const auth = s.authTex;
            if (auth?.image instanceof HTMLCanvasElement && now - (s.lastMirror || 0) > 400) {
                s.lastMirror = now;
                try {
                    const cx = s.canvas.getContext('2d');
                    cx.imageSmoothingEnabled = false;
                    cx.drawImage(auth.image, 0, 0);
                    if (!s.blinkUntil) s.zoneDirty = true; 
                } catch {}
            }
            return s;
        }
        if (!src) return null; 
        if (!s) {
            s = { tex: null, canvas: null, baseHead: null, k: 1, nextBlink: 0, blinkUntil: 0, name: p.name, srcId: null, lastMirror: 0, authTex: null };
            others._sessions.set(p.key, s);
        }

        const srcId = String(src.uuid ?? '') + ':' + src.image.width + 'x' + src.image.height;
        const changed = s.srcId !== srcId;
        
        const needsMount = srcMats.some(m => m.map !== s.tex);
        if (changed || !s.tex || needsMount) {
            s.lastMirror = now;
            s.authTex = srcIsOurs ? null : src; 
            
            if (changed || !s.baseHead) {
                try {
                    const k = Math.max(1, Math.round(src.image.width / 64));
                    const c = document.createElement('canvas');
                    c.width = 64 * k; c.height = 16 * k;
                    c.getContext('2d').drawImage(src.image, 0, 0, 64 * k, 16 * k, 0, 0, 64 * k, 16 * k);
                    s.baseHead = c; s.k = k;
                } catch { return null; }
            }
            
            if (!s.tex || s.canvas.width !== src.image.width || s.canvas.height !== src.image.height) {
                const c = document.createElement('canvas');
                c.width = src.image.width; c.height = src.image.height;
                let nt = null;
                try { nt = new src.constructor(c); } catch {}
                if (!nt) { others._sessions.delete(p.key); return null; }
                nt.__mfOtherKey = p.key; 
                try {
                    nt.magFilter = src.magFilter; nt.minFilter = src.minFilter;
                    if (src.colorSpace !== undefined && 'colorSpace' in nt) nt.colorSpace = src.colorSpace;
                    nt.flipY = src.flipY; nt.wrapS = src.wrapS; nt.wrapT = src.wrapT;
                } catch {}
                s.tex = nt; s.canvas = c;
            }
            
            try {
                const cx = s.canvas.getContext('2d');
                cx.imageSmoothingEnabled = false;
                cx.clearRect(0, 0, s.canvas.width, s.canvas.height);
                cx.drawImage(src.image, 0, 0);
            } catch {}
            
            for (const m of srcMats) {
                if (m.map === s.tex) continue;
                m.map = s.tex; m.needsUpdate = true;
            }
            if (!s.blinkUntil) s.zoneDirty = true; 
        }
        s.srcId = srcId;
        return s;
    }

    function otherBlinkCanvas(s) {
        if (!s?.baseHead) return null;
        const k = s.k || 1;
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.imageSmoothingEnabled = false;
        cx.drawImage(s.baseHead, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k, 0, 0, 8, 8);
        try {
            const cheek = cx.getImageData(1, 6, 1, 1).data;
            cx.fillStyle = `rgb(${cheek[0]},${cheek[1]},${cheek[2]})`;
            cx.fillRect(1, 4, 2, 2);
            cx.fillRect(5, 4, 2, 2);
        } catch {}
        return c;
    }

    function otherZoneCanvas(s, zone) {
        if (!s?.baseHead) return null;
        if (!/^(left|right|up|down)$/.test(zone)) return null;
        const k = s.k || 1;
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.imageSmoothingEnabled = false;
        cx.drawImage(s.baseHead, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k, 0, 0, 8, 8);
        try {
            const cheek = cx.getImageData(1, 6, 1, 1).data;
            const skin = [cheek[0], cheek[1], cheek[2]];
            const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
            
            let iris = null, white = [219, 219, 219];
            const px = (x, y) => cx.getImageData(x, y, 1, 1).data;
            for (let x = 1; x <= 6; x++) {
                for (let y = 4; y <= 5; y++) {
                    const d = px(x, y);
                    if (!d || d[3] === 0) continue;
                    const sum = d[0] + d[1] + d[2];
                    if (!iris || sum < iris[0] + iris[1] + iris[2]) { if (sum < skin[0] + skin[1] + skin[2] - 90) iris = [d[0], d[1], d[2]]; }
                    if (sum > white[0] + white[1] + white[2]) white = [d[0], d[1], d[2]];
                }
            }
            if (!iris) return c; 
            if (zone === 'left' || zone === 'right') {
                const dir = zone === 'left' ? -1 : 1;
                const y = 4;
                const pair = (ex, dx) => {
                    cx.fillStyle = rgb(skin); cx.fillRect(ex, y, 2, 2);
                    cx.fillStyle = rgb(white); cx.fillRect(ex + (dx < 0 ? 0 : 1), y, 1, 2);
                    cx.fillStyle = rgb(iris); cx.fillRect(ex + (dx < 0 ? 1 : 0), y, 1, 2);
                };
                pair(1, dir); pair(5, dir);
            } else {
                const dy = zone === 'up' ? -1 : 1;
                const row = cx.getImageData(0, 4, 8, 2); 
                cx.fillStyle = rgb(skin);
                cx.fillRect(1, 4, 2, 2); cx.fillRect(5, 4, 2, 2);
                cx.putImageData(row, 0, 4 + dy);
            }
        } catch {}
        return c;
    }

    function otherZone(p, s) {
        try {
            const m = p.mesh;
            if (!m) return null;

            // Referencias head/body cacheadas en la sesión: evita un BFS
            // completo del mesh por jugador en cada tick. Se invalidan si el
            // nodo se descolgó del root (respawn / cambio de skin).
            let head = s?._head || null, body = s?._body || null;
            const attached = ref => { for (let o = ref; o; o = o.parent) if (o === m) return true; return false; };
            if (head && !attached(head)) { head = null; if (s) s._head = null; }
            if (body && !attached(body)) { body = null; if (s) s._body = null; }

            if (!head || !body) {
                const queue = [m];
                const seen = new WeakSet();
                let visited = 0;
                while (queue.length && visited < 500 && !(head && body)) {
                    const obj = queue.shift();
                    if (!obj || typeof obj !== 'object' || seen.has(obj)) continue;
                    seen.add(obj); visited++;
                    if (!head && obj.headPivot?.rotation) head = obj.headPivot;
                    if (!body && obj.body?.rotation) body = obj.body;
                    if (Array.isArray(obj.children)) for (const c of obj.children) queue.push(c);
                }
                if (s) { s._head = head || null; s._body = body || null; }
            }
            if (!head) return null;
            const yaw = wrapPi((Number(head.rotation.y) || 0) - (Number(body?.rotation.y) || 0));
            const pitch = Number(head.rotation.x) || 0;
            const thr = 22; 
            if (pitch > thr * Math.PI / 180) return 'up';
            if (pitch < -thr * Math.PI / 180) return 'down';
            if (yaw > thr * Math.PI / 180) return 'right';
            if (yaw < -thr * Math.PI / 180) return 'left';
            return 'front';
        } catch { return null; }
    }

    let _lastOtherTick = 0;
    function otherTick() {
        if (!others.on) { others._raf = null; return; }
        const now = performance.now();
        // Throttle a ~20 Hz: blinks (45-90ms) y zonas de mirada no necesitan 60fps
        if (now - _lastOtherTick < 48) { others._raf = requestAnimationFrame(otherTick); return; }
        _lastOtherTick = now;
        const live = new Set();
        for (const p of otherPlayers()) {
            live.add(p.key);
            
            const pack = packForOther(p.skin);
            if (!pack) {
                
                const s = others._sessions.get(p.key);
                if (s) restoreOther(p.key);
                continue;
            }
            const s = otherSession(p);
            if (!s) continue;
            
            preloadOtherPack(s, pack);
            
            const z = otherZone(p, s) || 'front';
            if (s.zone !== z) { s.zone = z; s.zoneDirty = true; }
            if (!s.nextBlink) s.nextBlink = now + 800 + Math.random() * others.intervalMinMs; 
            if (s.blinkUntil && now >= s.blinkUntil) {
                s.blinkUntil = 0;
                s.nextBlink = now + others.intervalMinMs + Math.random() * Math.max(0, others.intervalMaxMs - others.intervalMinMs);
                s.zoneDirty = true; 
            } else if (!s.blinkUntil && now >= s.nextBlink && s.zone === 'front') {
                s.blinkUntil = now + 45 + Math.random() * 45;
                if (s.pack?.img?.blink) {
                    
                    paintOtherStrip(s, s.pack.img.blink);
                } else {
                    const cv = otherBlinkCanvas(s);
                    if (cv) {
                        try {
                            const k = s.k || 1, cx = s.canvas.getContext('2d');
                            cx.imageSmoothingEnabled = false;
                            cx.drawImage(cv, 0, 0, 8, 8, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k);
                            s.tex.needsUpdate = true;
                        } catch {}
                    }
                }
            } else if (s.zoneDirty && !s.blinkUntil) {
                
                s.zoneDirty = false;
                const strip = s.pack?.img ? (s.zone === 'front' ? s.pack.img.front : s.pack.img[s.zone]) : null;
                if (strip) {
                    paintOtherStrip(s, strip);
                } else {
                    const cv = s.zone === 'front' ? null : otherZoneCanvas(s, s.zone);
                    try {
                        const k = s.k || 1, cx = s.canvas.getContext('2d');
                        cx.imageSmoothingEnabled = false;
                        if (cv) {
                            cx.drawImage(cv, 0, 0, 8, 8, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k);
                        } else {
                            cx.drawImage(s.baseHead, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k);
                            cx.drawImage(s.baseHead, FACE_OV.x * k, FACE_OV.y * k, FACE_OV.w * k, FACE_OV.h * k, FACE_OV.x * k, FACE_OV.y * k, FACE_OV.w * k, FACE_OV.h * k);
                        }
                        s.tex.needsUpdate = true;
                    } catch {}
                }
            }
        }
        
        for (const key of others._sessions.keys()) if (!live.has(key)) others._sessions.delete(key);
        others._raf = requestAnimationFrame(otherTick);
    }

    function restoreOther(key) {
        const s = others._sessions.get(key);
        if (!s) return;
        try {
            const k = s.k || 1, cx = s.canvas.getContext('2d');
            cx.imageSmoothingEnabled = false;
            cx.clearRect(0, 0, 64 * k, 16 * k);
            cx.drawImage(s.baseHead, 0, 0, 64 * k, 16 * k, 0, 0, 64 * k, 16 * k);
            s.tex.needsUpdate = true;
        } catch {}
        others._sessions.delete(key);
    }

    function othersStart() {
        others.on = true;
        saveOthers();
        if (!others._raf) others._raf = requestAnimationFrame(otherTick);
        renderUI();
        const n = otherPlayers().length;
        void 0;
        return { ok: true, count: n };
    }
    function othersStop() {
        others.on = false;
        if (others._raf) { cancelAnimationFrame(others._raf); others._raf = null; }
        
        for (const key of [...others._sessions.keys()]) restoreOther(key);
        others._sessions.clear();
        saveOthers();
        renderUI();
        void 0;
        return { ok: true };
    }

    function loadLibrary() {
        let lib = {};
        try { lib = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch {}
        const out = {};
        for (const [k, v] of Object.entries(lib)) {
            if (Array.isArray(v)) out[k] = { frames: v };        
            else if (v && Array.isArray(v.frames)) out[k] = v;   
        }
        state.library = out;
    }
    function saveLibrary() {
        try { localStorage.setItem(LS_KEY, JSON.stringify(state.library)); } catch {}
    }

    function buildTemplates() {
        const presets = (window.MF_SkinEditor?.presets?.() || []).map(p => 'p:' + p.name);
        const T = {};
        if (presets.length >= 2) {
            T['alternate presets'] = { frames: [
                { face: presets[0], holdMs: 1200, blendMs: 250 },
                { face: presets[1], holdMs: 1200, blendMs: 250 }
            ] };
            T['preset cycle'] = { frames: presets.slice(0, 4).map(p => ({ face: p, holdMs: 900, blendMs: 150 })) };
        }
        T['blink'] = { frames: [
            { face: 'base', holdMs: 2600, blendMs: 80 },
            { face: 'noface', holdMs: 90, blendMs: 80 },
            { face: 'base', holdMs: 60, blendMs: 80 },
            { face: 'noface', holdMs: 90, blendMs: 80 }
        ] };
        T['serious ↔ serious_1'] = { frames: [
            { face: 'base', holdMs: 1400, blendMs: 300 },
            { face: 'serious_1', holdMs: 1400, blendMs: 300 }
        ] };
        return T;
    }

    function buildUI() {
        if (document.getElementById(ID)) { renderUI(); return; }
        const style = document.createElement('style');
        style.id = ID + '-style';
        style.textContent = `
#${ID} * { box-sizing:border-box; margin:0; padding:0; }
#${ID} { position:fixed; top:60px; left:50%; transform:translateX(-50%);
  z-index:2147483000; width:720px; max-width:95vw; max-height:88vh;
  display:flex; flex-direction:column;
  background:rgba(27,27,31,.95); border:1px solid #32323a; border-radius:8px;
  backdrop-filter:blur(6px); box-shadow:0 12px 48px rgba(0,0,0,.65);
  color:#e8e8ee; font:12px/1.4 'Segoe UI',system-ui,sans-serif; user-select:none; }
#${ID} .mff-head { display:flex; align-items:center; gap:8px; padding:9px 12px;
  border-bottom:1px solid #32323a; font-weight:700; letter-spacing:.5px;
  cursor:move; background:rgba(20,20,24,.95); border-radius:8px 8px 0 0; }
#${ID} .mff-head .dot { width:8px; height:8px; border-radius:50%;
  background:#ffb84d; animation:mff-pulse 1.5s infinite; flex-shrink:0; }
@keyframes mff-pulse { 50% { opacity:.35; } }
#${ID} .mff-body { display:flex; min-height:0; flex:1; }
#${ID} .mff-left { width:230px; flex-shrink:0; display:flex; flex-direction:column;
  border-right:1px solid #26262e; min-height:0; }
#${ID} .mff-right { flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; }
#${ID} .mff-sec { font-size:10px; text-transform:uppercase; letter-spacing:1.5px;
  color:#6e6e7a; padding:8px 12px 4px; font-weight:600; }
#${ID} .mff-list { flex:1; overflow-y:auto; padding:4px 8px; min-height:120px; max-height:46vh; }
#${ID} .mff-item { display:flex; align-items:center; gap:6px; padding:6px 8px;
  border-radius:4px; cursor:pointer; border:1px solid transparent; }
#${ID} .mff-item:hover { background:#26262e; }
#${ID} .mff-item.on { background:#241d16; outline:1px solid #ff6b2b; }
#${ID} .mff-item.editing { border-color:#4fc3f7; }
#${ID} .mff-item .nm { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#${ID} .mff-item .meta { font-size:10px; color:#8a8a96; }
#${ID} .mff-item button { background:none; border:none; cursor:pointer; font-size:11px; padding:1px 3px; color:#c8c8d2; }
#${ID} .mff-item button:hover { color:#fff; }
#${ID} .mff-pad { padding:8px 12px; }
#${ID} select, #${ID} input { background:#191921; color:#e8e8ee;
  border:1px solid #32323a; border-radius:4px; padding:4px 6px; font:inherit; width:100%; }
#${ID} .mff-frames { flex:1; overflow-y:auto; padding:6px 12px; min-height:100px; }
#${ID} .mff-frame { display:grid; grid-template-columns:1fr 70px 70px 22px 24px; gap:4px;
  align-items:center; padding:4px 0; border-bottom:1px dashed #26262e; }
#${ID} .mff-frame input { padding:3px 4px; font-size:11px; }
#${ID} .mff-frame .thumb { width:22px; height:22px; image-rendering:pixelated;
  background:#0c0c10; border:1px solid #32323a; border-radius:3px;
  object-fit:contain; object-position:left; }
#${ID} button { background:#23232c; color:#e8e8ee; border:1px solid #3a3a44;
  border-radius:4px; padding:4px 8px; cursor:pointer; font:inherit; }
#${ID} button:hover { background:#2e2e3a; }
#${ID} button.on { background:#ff6b2b; color:#14141a; border-color:#ff6b2b; font-weight:700; }
#${ID} .mff-row { display:flex; gap:6px; align-items:center; }
#${ID} .mff-hint { padding:0 12px 6px; font-size:10px; color:#8a8a96; }
#${ID} .mff-foot { display:flex; gap:6px; padding:8px 12px;
  border-top:1px solid #26262e; background:rgba(20,20,24,.6); border-radius:0 0 8px 8px; }
#${ID} .mff-tabs { display:flex; gap:2px; padding:6px 12px 0; }
#${ID} .mff-tabs button { background:transparent; border:none; border-bottom:2px solid transparent;
  color:#9a9aa6; border-radius:4px 4px 0 0; padding:5px 14px; font-weight:600; }
#${ID} .mff-tabs button:hover { color:#fff; background:transparent; }
#${ID} .mff-tabs button.on { color:#ff6b2b; border-bottom-color:#ff6b2b; }
#${ID} .mff-autoform { padding:6px 12px; }
#${ID} .mff-field { display:grid; grid-template-columns:86px 1fr; gap:6px;
  align-items:center; padding:4px 0; }
#${ID} .mff-field label { color:#9a9aa6; font-size:11px; }
#${ID} .mff-check { display:flex; align-items:center; gap:8px; padding:5px 0; color:#c8c8d2; }
#${ID} .mff-check input[type=checkbox] { width:auto; accent-color:#ff6b2b; }
#${ID} ::-webkit-scrollbar { width:8px; height:8px; }
#${ID} ::-webkit-scrollbar-thumb { background:#33333e; border-radius:4px; }
#${ID} ::-webkit-scrollbar-track { background:transparent; }
        `;
        document.body.appendChild(style);
        const root = document.createElement('div');
        root.id = ID;
        root.innerHTML = `
<div class="mff-head"><span class="dot"></span>👀 FACIALS — looping face animations
    <button data-act="close" style="margin-left:auto">✕</button></div>
<div class="mff-tabs">
    <button data-tab="loop" class="on">Loops</button>
    <button data-tab="auto" title="The face reacts to where you look + random blinking">Auto</button>
    <button data-tab="packs" title="Skin packs with animated faces (builtin + ZIP)">Packs</button>
</div>
<div class="mff-body" data-page="loop">
  <div class="mff-left">
    <div class="mff-sec">Library</div>
    <div class="mff-list" id="mff-list"></div>
    <div class="mff-pad mff-row">
      <button id="mff-new" title="Create a new empty facial" style="flex:1">+ New</button>
      <button id="mff-seed" title="Regenerate templates with your current drawn presets">✨</button>
    </div>
  </div>
  <div class="mff-right">
    <div class="mff-sec">Keyframe editor</div>
    <div class="mff-hint">Each frame = a face + how long it holds + transition. Loops until you stop.</div>
    <div class="mff-pad mff-row" style="margin-bottom:4px">
      <select id="mff-face" title="Keyframe face"></select>
      <button id="mff-add" title="Add keyframe" style="white-space:nowrap">+ Frame</button>
    </div>
    <div class="mff-frames" id="mff-frames"></div>
  </div>
</div>
<div class="mff-body" data-page="auto" style="display:none">
  <div class="mff-left">
    <div class="mff-sec">Per-direction presets</div>
    <div class="mff-hint">Draw sprites in the skin editor, save them as presets and assign them here. Turn your head and the face changes on its own.</div>
    <div class="mff-autoform" id="mff-autoform"></div>
  </div>
  <div class="mff-right">
    <div class="mff-sec">Auto blinking</div>
    <div class="mff-autoform" id="mff-blinkform" style="padding:0 12px"></div>
    <div class="mff-sec">Live</div>
    <div class="mff-pad" id="mff-autolive" style="font:11px 'Consolas',monospace;color:#9a9aa6;line-height:1.8"></div>
  </div>
</div>
<div class="mff-body" data-page="packs" style="display:none">
  <div class="mff-left">
    <div class="mff-sec">Facial packs</div>
    <div class="mff-hint">Each pack = skin + sprites (front / left / right / blink). If you wear its skin, the face animates on its own.</div>
    <div class="mff-list" id="mff-packs"></div>
    <div class="mff-pad mff-row">
      <button id="mff-packimport" title="Import pack from a ZIP (pack.json + PNGs)" style="flex:1">📥 Import ZIP</button>
      <input type="file" id="mff-packfile" accept=".zip" style="display:none">
    </div>
  </div>
  <div class="mff-right">
    <div class="mff-sec">Selected pack</div>
    <div class="mff-pad" id="mff-packdetail" style="font-size:11px;color:#c8c8d2"></div>
  </div>
</div>
<div class="mff-foot">
  <button id="mff-autotoggle" title="Auto: the face reacts to head rotation and blinks on its own">⚡ Auto</button>
  <button id="mff-save" title="Save to library">💾 Save</button>
  <button id="mff-play" title="Play on loop">▶ Loop</button>
  <button id="mff-stop" title="Stop and restore">⏹ Stop</button>
  <span id="mff-status" style="font-size:10px;color:#8a8a96;margin-left:auto;align-self:center"></span>
  <button id="mff-del" title="Delete the facial being edited">🗑</button>
</div>
        `;
        document.body.appendChild(root);
        bindUI(root);
        makeDraggable(root);
    }

    function makeDraggable(root) {
        const head = root.querySelector('.mff-head');
        let sx = 0, sy = 0, ox = 0, oy = 0, drag = false;
        head.addEventListener('pointerdown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            drag = true;
            const r = root.getBoundingClientRect();
            root.style.left = r.left + 'px'; root.style.top = r.top + 'px';
            root.style.right = 'auto'; root.style.transform = 'none';
            sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
            head.setPointerCapture(e.pointerId);
        });
        head.addEventListener('pointermove', (e) => {
            if (!drag) return;
            root.style.left = Math.max(0, ox + e.clientX - sx) + 'px';
            root.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
        });
        const up = () => { drag = false; };
        head.addEventListener('pointerup', up);
        head.addEventListener('pointercancel', up);
    }

    function faceOptions() {
        const opts = [{ v: 'base', t: 'base (your current head)' }];
        
        for (const pr of (window.MF_SkinEditor?.presets?.() || [])) {
            opts.push({ v: 'p:' + pr.name, t: '✏️ ' + pr.name });
        }
        
        for (const it of (window.MF_SkinChanger?.items || [])) {
            opts.push({ v: 'skin_' + it.name, t: '👕 ' + it.name });
        }
        
        for (const p of packIndex) {
            const nm = (p.name || p.id) + (p.custom ? ' (zip)' : '');
            opts.push({ v: 'fs:' + p.id + '/' + p.front, t: '📦 ' + nm + ' front' });
            opts.push({ v: 'fs:' + p.id + '/' + p.left, t: '📦 ' + nm + ' left' });
            opts.push({ v: 'fs:' + p.id + '/' + p.right, t: '📦 ' + nm + ' right' });
            opts.push({ v: 'fs:' + p.id + '/' + p.blink, t: '📦 ' + nm + ' blink' });
        }
        
        for (const n of (window.MF_FaceSwap?.list?.() || [])) {
            opts.push({ v: n, t: n });
        }
        return opts;
    }

    let editing = null; 

    function renderUI() {
        const root = document.getElementById(ID);
        if (!root) return;
        
        const list = root.querySelector('#mff-list');
        list.innerHTML = '';
        const names = Object.keys(state.library);
        if (!names.length) {
            list.innerHTML = '<div style="color:#8a8a96;font-size:11px;padding:4px 2px">No saved facials — use a template or create one</div>';
        }
        for (const n of names) {
            const nf = state.library[n]?.frames?.length ?? 0;
            const it = el('div', 'mff-item' + (state.playing === n ? ' on' : '') + (editing === n ? ' editing' : ''));
            it.innerHTML = `<span class="nm">${n}</span><span class="meta">${nf}f</span>
                <button data-x="edit" title="Edit">✎</button>
                <button data-x="play" title="Play on loop">▶</button>
                <button data-x="del" title="Delete">✕</button>`;
            it.querySelector('[data-x="edit"]').onclick = (e) => { e.stopPropagation(); loadEditor(n); };
            it.querySelector('[data-x="play"]').onclick = (e) => { e.stopPropagation(); play(n); renderUI(); };
            it.querySelector('[data-x="del"]').onclick = (e) => {
                e.stopPropagation();
                if (state.playing === n) stop();
                delete state.library[n];
                saveLibrary();
                if (editing === n) editing = null;
                renderUI();
            };
            it.onclick = () => loadEditor(n);
            list.appendChild(it);
        }
        
        const fsel = root.querySelector('#mff-face');
        if (fsel) {
            const cur = fsel.value;
            fsel.innerHTML = faceOptions().map(o => `<option value="${o.v}">${o.t}</option>`).join('');
            if (cur) fsel.value = cur;
        }
        
        const st = root.querySelector('#mff-status');
        if (st) st.textContent = auto.on
            ? '⚡ auto ' + (state.playing ? '(loop paused)' : '')
            : (state.playing ? '▶ ' + state.playing : (editing ? 'editing: ' + editing : 'nothing playing'));
        updateAutoToggle();
        
        if (root.querySelector('[data-page="auto"]')?.style.display !== 'none') renderAutoForm();
        
        renderFrames();
    }

    function renderFrames() {
        const root = document.getElementById(ID);
        if (!root) return;
        const box = root.querySelector('#mff-frames');
        if (!editing || !state.library[editing]) {
            box.innerHTML = '<div style="color:#8a8a96;font-size:11px;padding:4px 0">Create a facial (+ New) or select one from the library to edit its frames</div>';
            return;
        }
        box.innerHTML = '';
        const frames = state.library[editing].frames;
        if (!frames.length) {
            box.innerHTML = '<div style="color:#8a8a96;font-size:11px;padding:4px 0">No frames — pick a face and press "+ Frame"</div>';
            return;
        }
        frames.forEach((f, i) => {
            const row = el('div', 'mff-frame');
            row.innerHTML = `
<select data-k="face">${faceOptions().map(o => `<option value="${o.v}" ${o.v === f.face ? 'selected' : ''}>${o.t}</option>`).join('')}</select>
<input data-k="holdMs" type="number" min="20" step="20" value="${f.holdMs ?? 400}" title="Hold (ms)">
<input data-k="blendMs" type="number" min="0" step="20" value="${f.blendMs ?? 0}" title="Transition (ms)">
<img class="thumb" data-thumb="${f.face}" title="Face preview" alt="">
<button data-x="rm" title="Remove frame">✕</button>`;
            row.querySelector('[data-k="face"]').onchange = (e) => { f.face = e.target.value; renderFrames(); };
            row.querySelector('[data-k="holdMs"]').onchange = (e) => { f.holdMs = +e.target.value || 400; };
            row.querySelector('[data-k="blendMs"]').onchange = (e) => { f.blendMs = +e.target.value || 0; };
            row.querySelector('[data-x="rm"]').onclick = () => { frames.splice(i, 1); renderFrames(); };
            box.appendChild(row);
        });
        const total = frames.reduce((s, f) => s + (+f.holdMs || 400) + (+f.blendMs || 0), 0);
        const tot = el('div', '', `<span style="color:#8a8a96;font-size:10px">cycle: ${total} ms · ${(1000 / Math.max(1, total)).toFixed(2)} loops/s</span>`);
        box.appendChild(tot);
        
        fillThumbs(box);
    }

    function fillThumbs(box) {
        box.querySelectorAll('img[data-thumb]').forEach(img => {
            const name = img.dataset.thumb;
            resolveFace(name).then(fr => {
                if (!fr || !img.isConnected) return;
                
                const k = fr.kind === 'head' ? Math.max(1, Math.round(fr.canvas.width / 64)) : 1;
                const c = document.createElement('canvas');
                c.width = 8; c.height = 8;
                const cx = c.getContext('2d');
                cx.imageSmoothingEnabled = false;
                if (fr.kind === 'head') cx.drawImage(fr.canvas, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k, 0, 0, 8, 8);
                else cx.drawImage(fr.canvas, 0, 0, 8, 8, 0, 0, 8, 8);
                img.src = c.toDataURL();
            }).catch(() => {});
        });
    }

    function presetOptions(sel, kind = 'dir') {
        const names = (window.MF_SkinEditor?.presets?.() || []).map(p => p.name);
        let html = '<option value="" ' + (sel ? '' : 'selected') + '>— (no change)</option>' +
            names.map(n => `<option value="${n}" ${n === sel ? 'selected' : ''}>✏️ ${n}</option>`).join('');
        if (packIndex.length) {
            html += '<optgroup label="Facial packs">';
            for (const p of packIndex) {
                const front = p.front || 'alfrente';
                const opts = kind === 'blink'
                    ? [`fs:${p.id}/${p.blink}`]
                    : [`fs:${p.id}/${front}`, `fs:${p.id}/${p.left}`, `fs:${p.id}/${p.right}`];
                for (const v of opts) {
                    const label = v.split('/').pop().replace(/\.png$/i, '');
                    const nm = (p.name || p.id) + (p.custom ? ' (zip)' : '');
                    html += `<option value="${v}" ${v === sel ? 'selected' : ''}>📦 ${nm}/${label}</option>`;
                }
            }
            html += '</optgroup>';
        }
        return html;
    }

    let packSel = null; 
    function renderPacksTab() {
        const root = document.getElementById(ID);
        if (!root) return;
        const list = root.querySelector('#mff-packs');
        if (!list) return;
        if (packSel && !packIndex.some(p => p.id === packSel)) packSel = null;
        list.innerHTML = '';
        if (!packIndex.length) {
            list.innerHTML = '<div style="color:#8a8a96;font-size:11px;padding:4px 2px">No packs — import a ZIP</div>';
        }
        for (const p of packIndex) {
            const it = el('div', 'mff-item' + (packSel === p.id ? ' editing' : ''));
            const tag = p.server ? 'server' : (p.custom ? 'zip' : 'custom');
            it.innerHTML = `<span class="nm">${p.name || p.id}${p.custom ? ' <span class="meta">(zip)</span>' : ''}</span>
                <span class="meta">${tag}</span>`;
            it.onclick = () => { packSel = p.id; renderPacksTab(); };
            list.appendChild(it);
        }
        
        const det = root.querySelector('#mff-packdetail');
        if (det) {
            const p = packIndex.find(x => x.id === packSel);
            if (!p) {
                det.innerHTML = '<span style="color:#8a8a96">Select a pack from the list</span>';
            } else {
                const cur = currentSkinId();
                det.innerHTML = `
<div style="font-weight:700;font-size:13px;margin-bottom:2px">${p.name || p.id}</div>
<div style="color:#8a8a96;margin-bottom:8px">id: ${p.id}${p.author ? ' · by ' + p.author : ''} · v${p.version || 1} · ${p.server ? 'server skin (activates when you wear it in the wardrobe)' : p.custom ? 'ZIP imported' : 'custom (mypacks)'}</div>
<div class="mff-row" style="flex-wrap:wrap">
  <button data-pk="apply" title="Wear the pack's skin (builtin only)">👕 Use skin</button>
  <button data-pk="release" title="Remove the custom skin and go back to the server one">↩ Remove skin</button>
  <button data-pk="auto" title="Enable auto mode with this pack's sprites">⚡ Activate</button>
  <button data-pk="export" title="Download the pack as a ZIP (pack.json + PNGs)">📤 Export ZIP</button>
  ${p.custom ? '<button data-pk="del" title="Delete the imported pack">🗑</button>' : ''}
</div>
<div style="color:#8a8a96;margin-top:8px;font-size:10px">${cur === p.id ? '✓ this skin is worn — the face animates on its own' : 'the face animates when skin ' + p.id + ' is in use'}</div>`;
                det.querySelector('[data-pk="release"]').onclick = async () => {
                    try {
                        const ok = await releasePackSkin();
                        if (!ok) alert('no custom skin worn (you\'re already on the server one)');
                        renderPacksTab();
                    } catch (e) { alert('could not remove: ' + e.message); }
                };
                det.querySelector('[data-pk="apply"]').onclick = async () => {
                    if (p.server) {
                        
                        alert('"' + (p.name || p.id) + '" is a server skin:\nput it on from the game\'s wardrobe (dressing room).\nThe animated face activates on its own when the skin is detected.');
                        return;
                    }
                    try {
                        
                        await applyPackSkinToGame(p.id);
                        renderPacksTab();
                    } catch (e) { alert('could not apply: ' + e.message); }
                };
                det.querySelector('[data-pk="auto"]').onclick = async () => {
                    
                    auto.front = 'fs:' + p.id + '/' + p.front;
                    auto.left = 'fs:' + p.id + '/' + p.left;
                    auto.right = 'fs:' + p.id + '/' + p.right;
                    auto.up = p.up ? 'fs:' + p.id + '/' + p.up : '';
                    auto.down = p.down ? 'fs:' + p.id + '/' + p.down : '';
                    auto.browFace = p.brow ? 'fs:' + p.id + '/' + p.brow : '';
                    auto.blinkClosed = 'fs:' + p.id + '/' + p.blink;
                    auto.blink = true;
                    skinWatch.userOff = false;
                    skinWatch.lastApplied = p.id;
                    saveAuto();
                    const r = await autoStart();
                    if (!r.ok) alert(r.error);
                    renderPacksTab();
                };
                det.querySelector('[data-pk="export"]').onclick = async () => {
                    try { await exportPackZip(p.id); }
                    catch (e) { alert('export: ' + e.message); }
                };
                const del = det.querySelector('[data-pk="del"]');
                if (del) del.onclick = async () => {
                    if (!confirm('Delete pack "' + (p.name || p.id) + '"?')) return;
                    await packsDbDel(p.id);
                    customPacks.delete(p.id);
                    if (skinWatch.lastApplied === p.id) skinWatch.lastApplied = null;
                    rebuildPackIndex();
                };
            }
        }
    }

    function renderAutoForm() {
        const root = document.getElementById(ID);
        if (!root) return;
        const form = root.querySelector('#mff-autoform');
        if (form) {
            const field = (key, label) => `
<div class="mff-field"><label>${label}</label>
<select data-auto="${key}">${presetOptions(auto[key])}</select></div>`;
            form.innerHTML =
                field('front', '⬆ front') +
                field('left', '⬅ look left') +
                field('right', '➡ look right') +
                field('up', '⬆ look up') +
                field('down', '⬇ look down') +
                `<div class="mff-field"><label>turn threshold</label>
<input type="number" min="5" max="120" step="5" value="${auto.yawThreshold}" data-auton="yawThreshold" title="Yaw degrees to activate (default 10)"></div>` +
                `<div class="mff-field"><label>vert threshold</label>
<input type="number" min="5" max="80" step="5" value="${auto.pitchThreshold}" data-auton="pitchThreshold" title="Pitch degrees to activate (default 10)"></div>`;
            form.querySelectorAll('[data-auto]').forEach(s => s.onchange = () => {
                auto[s.dataset.auto] = s.value; saveAuto();
                auto._zone = null; 
            });
            form.querySelectorAll('[data-auton]').forEach(i => i.onchange = () => {
                auto[i.dataset.auton] = Math.max(5, +i.value || 10); saveAuto();
            });
        }
        const bf = root.querySelector('#mff-blinkform');
        if (bf) {
            bf.innerHTML = `
<div class="mff-check"><input type="checkbox" id="mff-blinkon" ${auto.blink ? 'checked' : ''}>
  <label for="mff-blinkon">Blink only at random intervals</label></div>
<div class="mff-field"><label>closed eyes</label>
<select data-auto="blinkClosed">${presetOptions(auto.blinkClosed, 'blink')}</select></div>
<div class="mff-field"><label>every min (s)</label>
<input type="number" min="0.5" max="30" step="0.5" value="${(auto.blinkMinMs / 1000).toFixed(1)}" data-blink="min"></div>
<div class="mff-field"><label>every max (s)</label>
<input type="number" min="1" max="60" step="0.5" value="${(auto.blinkMaxMs / 1000).toFixed(1)}" data-blink="max"></div>
<div class="mff-check"><input type="checkbox" id="mff-browon" ${auto.brow ? 'checked' : ''}>
  <label for="mff-browon">🤨 raise the brow when a "?" appears in chat</label></div>
<div class="mff-field"><label>brow (optional)</label>
<select data-auto="browFace">${presetOptions(auto.browFace, 'brow')}</select></div>
<div class="mff-field"><label>duration (s)</label>
<input type="number" min="0.3" max="5" step="0.1" value="${(auto.browMs / 1000).toFixed(1)}" data-brow="ms"></div>
<div class="mff-check"><input type="checkbox" id="mff-otherson" ${others.on ? 'checked' : ''}>
  <label for="mff-otherson">👥 animate others (local blink, machinima)</label></div>
<div class="mff-field"><label>others min (s)</label>
<input type="number" min="0.5" max="30" step="0.5" value="${(others.intervalMinMs / 1000).toFixed(1)}" data-others="min"></div>
<div class="mff-field"><label>others max (s)</label>
<input type="number" min="1" max="60" step="0.5" value="${(others.intervalMaxMs / 1000).toFixed(1)}" data-others="max"></div>`;
            const chk = bf.querySelector('#mff-blinkon');
            if (chk) chk.onchange = () => { auto.blink = chk.checked; saveAuto(); };
            const sel = bf.querySelector('[data-auto="blinkClosed"]');
            if (sel) sel.onchange = () => {
                auto.blinkClosed = sel.value; saveAuto();
                state.frameCache.delete('p:' + sel.value);
                auto._blinkCache = null; 
            };
            bf.querySelectorAll('[data-blink]').forEach(i => i.onchange = () => {
                const v = Math.max(0.3, +i.value || 2) * 1000;
                if (i.dataset.blink === 'min') auto.blinkMinMs = v;
                else auto.blinkMaxMs = Math.max(v, auto.blinkMinMs);
                saveAuto();
            });
            const browChk = bf.querySelector('#mff-browon');
            if (browChk) browChk.onchange = () => { auto.brow = browChk.checked; saveAuto(); };
            const browSel = bf.querySelector('[data-auto="browFace"]');
            if (browSel) browSel.onchange = () => { auto.browFace = browSel.value; saveAuto(); };
            const browMs = bf.querySelector('[data-brow="ms"]');
            if (browMs) browMs.onchange = () => {
                auto.browMs = Math.max(0.3, +browMs.value || 1.4) * 1000;
                saveAuto();
            };
            const othersChk = bf.querySelector('#mff-otherson');
            if (othersChk) othersChk.onchange = () => {
                if (othersChk.checked) othersStart();
                else othersStop();
            };
            bf.querySelectorAll('[data-others]').forEach(i => i.onchange = () => {
                const v = Math.max(0.3, +i.value || 2.5) * 1000;
                if (i.dataset.others === 'min') others.intervalMinMs = v;
                else others.intervalMaxMs = Math.max(v, others.intervalMinMs);
                saveOthers();
            });
        }
        updateAutoLive();
    }

    function updateAutoLive() {
        const root = document.getElementById(ID);
        const live = root?.querySelector('#mff-autolive');
        if (!live) return;
        const a = lookAngles();
        const rows = [];
        rows.push('auto: ' + (auto.on ? '<b style="color:#3ecf8e">ON</b>' : 'off'));
        if (a) {
            rows.push('rel: ' + a.yaw.toFixed(0) + '° / ' + a.pitch.toFixed(0) + '° · abs: ' + a.absYaw.toFixed(0) + '° / ' + a.absPitch.toFixed(0) + '°');
            const z = zoneOf(a);
            const preset = z === 'front' ? (auto.front || '(current front)') : (auto[z] || '(no preset)');
            rows.push('zone: ' + z + ' → ' + preset);
        } else {
            rows.push('(enter a world to see angles)');
        }
        if (auto.blink) {
            const next = Math.max(0, (auto._nextBlink - performance.now()) / 1000).toFixed(1);
            rows.push('next blink: ' + (auto.on ? next + ' s' : '—'));
        }
        live.innerHTML = rows.join('<br>');
        if (auto.on && root && !root.dataset.autoLiveRaf) {
            root.dataset.autoLiveRaf = '1';
            const loop = () => {
                const r = document.getElementById(ID);
                if (!r) { delete (r || {}).dataset; return; }
                const l = r.querySelector('#mff-autolive');
                if (!l) { delete r.dataset.autoLiveRaf; return; }
                updateAutoLiveInner(l);
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        }
    }
    function updateAutoLiveInner(live) {
        const a = lookAngles();
        const rows = [];
        rows.push('auto: ' + (auto.on ? '<b style="color:#3ecf8e">ON</b>' : 'off'));
        if (a) {
            rows.push('rel: ' + a.yaw.toFixed(0) + '° / ' + a.pitch.toFixed(0) + '° · abs: ' + a.absYaw.toFixed(0) + '° / ' + a.absPitch.toFixed(0) + '°');
            const z = zoneOf(a);
            const preset = z === 'front' ? (auto.front || '(current front)') : (auto[z] || '(no preset)');
            rows.push('zone: ' + z + ' → ' + preset);
        }
        if (auto.blink && auto.on) {
            const next = Math.max(0, (auto._nextBlink - performance.now()) / 1000).toFixed(1);
            rows.push('next blink: ' + next + ' s');
        }
        live.innerHTML = rows.join('<br>');
    }

    function loadEditor(name) {
        editing = name;
        renderUI();
    }

    function ensureEditing() {
        if (editing && state.library[editing]) return editing;
        const names = Object.keys(state.library);
        editing = state.playing || names[0] || null;
        if (editing) renderUI();
        return editing;
    }

    function el(cls, html) {
        const d = document.createElement('div');
        if (cls) d.className = cls;
        if (html != null) d.innerHTML = html;
        return d;
    }

    function bindUI(root) {
        root.querySelector('[data-act="close"]').onclick = () => close();
        
        root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
            root.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
            root.querySelectorAll('.mff-body').forEach(pg =>
                pg.style.display = (pg.dataset.page === b.dataset.tab) ? 'flex' : 'none');
            if (b.dataset.tab === 'auto') renderAutoForm();
        });
        
        const at = root.querySelector('#mff-autotoggle');
        if (at) at.onclick = async () => {
            if (auto.on) {
                autoStop(); skinWatch.userOff = true;
                // El usuario lo apagó a mano: el autoBoot no debe re-encenderlo
                try { localStorage.setItem(LS_KEY + '_autoUserOff', '1'); } catch {}
            }
            else { const r = await autoStart(); if (!r.ok) alert(r.error); }
            saveAuto();
            updateAutoToggle();
        };
        root.querySelector('#mff-new').onclick = () => {
            const n = prompt('New facial name:', 'my facial');
            if (!n) return;
            if (state.library[n]) { alert('already exists'); return; }
            state.library[n] = { frames: [] };
            saveLibrary();
            editing = n;
            renderUI();
        };
        root.querySelector('#mff-add').onclick = () => {
            if (!ensureEditing()) { alert('create a facial first with "+ New"'); return; }
            const face = root.querySelector('#mff-face').value || 'base';
            state.library[editing].frames.push({ face, holdMs: 400, blendMs: 0 });
            saveLibrary();
            renderUI();
        };
        root.querySelector('#mff-save').onclick = () => {
            if (!ensureEditing()) { alert('create a facial first'); return; }
            saveLibrary();
            renderUI();
        };
        root.querySelector('#mff-play').onclick = async () => {
            if (!ensureEditing()) { alert('create a facial first'); return; }
            const r = await play(editing);
            if (!r.ok) alert(r.error);
            renderUI();
        };
        root.querySelector('#mff-stop').onclick = () => { stop(); };
        root.querySelector('#mff-del').onclick = () => {
            if (!editing) return;
            if (state.playing === editing) stop();
            delete state.library[editing];
            editing = null;
            saveLibrary();
            renderUI();
        };
        root.querySelector('#mff-seed').onclick = () => {
            window.MF_Facial.seedTemplates();
        };
        
        const pfile = root.querySelector('#mff-packfile');
        const pbtn = root.querySelector('#mff-packimport');
        if (pbtn) {
            pbtn.onclick = () => pfile?.click();
            if (pfile) pfile.onchange = async () => {
                const f = pfile.files?.[0];
                pfile.value = '';
                if (!f) return;
                pbtn.textContent = '⏳ importing…';
                pbtn.disabled = true;
                try {
                    const p = await importPackZip(f);
                    packSel = p.id;
                    renderPacksTab();
                    alert('pack "' + (p.name || p.id) + '" imported ✓\n(skin applied and animated face active)');
                } catch (e) {
                    alert('import ZIP: ' + e.message);
                } finally {
                    pbtn.textContent = '📥 Import ZIP';
                    pbtn.disabled = false;
                }
            };
        }
        
        const ptab = root.querySelector('[data-tab="packs"]');
        if (ptab) ptab.addEventListener('click', renderPacksTab);
        updateAutoToggle();
    }

    function updateAutoToggle() {
        const at = document.querySelector('#' + ID + ' #mff-autotoggle');
        if (at) at.classList.toggle('on', auto.on);
    }

    function open() {
        if (state.open) { renderUI(); return; }
        state.open = true;
        loadLibrary(); state.dirty = false;
        loadAuto();
        
        if (!Object.keys(state.library).length) {
            state.library = { ...buildTemplates() };
            saveLibrary();
        }
        buildUI();
        ensureEditing(); 
    }

    function close() {
        document.getElementById(ID)?.remove();
        document.getElementById(ID + '-style')?.remove();
        state.open = false;
    }

    window.MF_Facial = {
        open, close,
        play, stop,
        loadLibrary, saveLibrary,
        get library() { return state.library; },
        get playing() { return state.playing; },
        
        get autoOn() { return auto.on; },
        autoStart, autoStop,
        get autoConfig() { return auto; },
        setAutoConfig(patch) {
            Object.assign(auto, patch);
            saveAuto();
            auto._zone = null;      
            auto._blinkCache = null; 
            renderAutoForm();
            return { ok: true };
        },
        
        seedTemplates() {
            state.library = { ...state.library, ...buildTemplates() };
            saveLibrary();
            renderUI();
            return { ok: true };
        },
        
        get packs() { return packIndex.map(p => ({ ...p })); },
        importPackZip, exportPackZip,
        applyPack: applyPackSkinToGame, 
        releasePack: releasePackSkin,   
        deletePack: async function (id) {
            await packsDbDel(id);
            customPacks.delete(id);
            if (skinWatch.lastApplied === id) skinWatch.lastApplied = null;
            rebuildPackIndex();
            return { ok: true };
        },
        
        applyCustomSkin: async function (name, pngUrl) {
            if (pngUrl) {
                packSkinReg[MF_NAME_PREFIX + name] = pngUrl;
            } else if (!registerPackSkin(name)) {
                throw new Error('the pack "' + name + '" has no PNG skin');
            }
            installPackImgHook();
            return applyPackSkinToGame(name);
        },
        
        registerCustomSkin: function (name, pngUrl) {
            if (typeof name !== 'string' || typeof pngUrl !== 'string') return false;
            installPackImgHook();
            packSkinReg[MF_NAME_PREFIX + name] = pngUrl;
            return true;
        },

        // Diagnóstico en vivo: ¿encuentra el mesh, la skin material correcta
        // (sin armadura/capa) y está la textura montada? Imprime un resumen.
        diag(deep = false) {
            const mesh = getMesh();
            const rows = ['mesh: ' + (mesh ? mesh.constructor?.name || 'ok' : 'NO (¿dentro de un mundo?)')];
            if (mesh) {
                if (deep) {
                    // TODOS los materiales del mesh: dimensiones + ruta de nodos
                    const seen = new Set();
                    mesh.traverse(o => {
                        if (!o?.material) return;
                        const list = Array.isArray(o.material) ? o.material : [o.material];
                        list.forEach((m, i) => {
                            if (!m?.map || seen.has(m)) return;
                            seen.add(m);
                            const im = m.map.image;
                            rows.push('  mat<' + seen.size + '> ' + (im ? im.width + 'x' + im.height : 'sin imagen') +
                                ' @ ' + (o.name || o.type || '?') +
                                (o.parent ? ' ← ' + (o.parent.name || o.parent.type || '?') : '') +
                                ' src=' + String(m.map.source?.data?.src || m.map.userData?.src || '').slice(0, 60));
                        });
                    });
                    rows.push('--- fin materiales (' + seen.size + ') ---');
                    const reg = mesh.meshes;
                    if (reg && typeof reg === 'object') rows.push('mesh.meshes keys: ' + Object.keys(reg).join(', '));
                }
                const mats = findSkinMaterials(mesh);
                rows.push('skinMaterials: ' + mats.length);
                mats.forEach((m, i) => {
                    const im = m.map?.image;
                    rows.push('  [' + i + '] ' + (im ? im.width + 'x' + im.height : 'sin imagen') +
                        (m.map && (m.map.__mfLocalCanvas || m.map.__mfOtherKey || m.map.__mfPeerCanvas) ? ' (facial ✓ montada)' : '') +
                        (m.map === state.tex ? ' (activa)' : ''));
                });
            }
            rows.push('state.tex: ' + (state.tex ? 'viva' : 'null') +
                ' · baseHead: ' + (state.baseHead ? 'sí' : 'no') +
                ' · auto: ' + (auto.on ? 'ON (zona ' + (auto._zone || '?') + ')' : 'off') +
                ' · playing: ' + (state.playing || 'nada'));
            const txt = rows.join('\n');
            console.log(TAG + '\n' + txt);
            return txt;
        }
    };
    window.__MF_Facial = true;

    // Apertura desde el panel del client (ISOLATED): el keybind Shift+F fue
    // retirado — el botón de la página Custom despacha este evento.
    document.addEventListener('minifeather:facial-open', () => {
        state.open ? close() : open();
    });

    const LS_LAST = LS_KEY + '_last';
    try {
        loadAuto();
        const last = localStorage.getItem(LS_LAST);
        const wantAuto = auto.on; 
        if (last || wantAuto) loadLibrary();
        if (wantAuto || (last && state.library[last])) {
            
            const boot = setInterval(() => {
                if (state.playing || auto._raf) { clearInterval(boot); return; }
                try {
                    const g = getGame();
                    if (g?.player?.mesh) {
                        clearInterval(boot);
                        if (wantAuto) { auto.on = false; autoStart().then(r => { if (r.ok) void 0; }); }
                        else if (last && state.library[last]) {
                            play(last).then(r => {
                                if (r.ok) void 0;
                            });
                        }
                    }
                } catch {}
            }, 1500);
            setTimeout(() => clearInterval(boot), 60000);
        }
    } catch {}

    if (others.on) {
        const boot2 = setInterval(() => {
            if (others._raf) { clearInterval(boot2); return; }
            try {
                const g = getGame();
                if (g?.player?.mesh) {
                    clearInterval(boot2);
                    others.on = false;
                    othersStart();
                }
            } catch {}
        }, 1500);
        setTimeout(() => clearInterval(boot2), 60000);
    }

    const skinWatch = { timer: null, lastApplied: null, userOff: false, busy: false, uuidDone: false };
    async function applyPackForSkin(force = false) {
        if (skinWatch.busy) return null;
        skinWatch.busy = true;
        try {
            const skinId = currentSkinId();
            if (!skinId) return null;
            
            const uid = currentPlayerUuid();
            let pack = uid ? packIndex.find(p => p.uuid === uid) : null;
            if (pack && pack.id !== skinId) {
                if (skinWatch.uuidDone) return null; 
                skinWatch.uuidDone = true;
                if (!force && skinWatch.lastApplied === pack.id) return null;
                
                debugBrow('uuid skin: facial-only (skin intacta: ' + skinId + ')');
            } else {
                pack = packIndex.find(p => p.id === skinId);
            }
            if (!pack) { skinWatch.lastApplied = null; return null; }
            const pid = pack.id;
            if (!force && skinWatch.lastApplied === pid) return null;

            let frontFile = pack.front || null;
            if (!frontFile) {
                const hit = await loadPackFront(pid);
                if (!hit) return null;
                frontFile = hit.usedName;
                pack.front = frontFile; 
            }

            let tries = 0;
            while (tries++ < 20 && !getMesh()) await new Promise(r => setTimeout(r, 250));
            if (!getMesh()) return null;

            auto.front = 'fs:' + pid + '/' + frontFile;
            auto.left = 'fs:' + pid + '/' + pack.left;
            auto.right = 'fs:' + pid + '/' + pack.right;
            auto.up = pack.up ? 'fs:' + pid + '/' + pack.up : '';
            auto.down = pack.down ? 'fs:' + pid + '/' + pack.down : '';
            auto.browFace = pack.brow ? 'fs:' + pid + '/' + pack.brow : '';
            auto.brow = !!pack.brow; 
            auto.blinkClosed = 'fs:' + pid + '/' + pack.blink;
            auto.blink = true;
            saveAuto();
            skinWatch.lastApplied = pid;
            skinWatch.userOff = false; 
            const r = await autoStart();
            if (r.ok) void 0;
            return r;
        } finally { skinWatch.busy = false; }
    }

    skinWatch.timer = setInterval(() => {
        if (skinWatch.busy) return;
        fetchApiSkin().then(() => { 
            
            if (!auto.on && !skinWatch.userOff && !skinWatch.uuidDone) {
                const uid = currentPlayerUuid();
                const byUuid = uid ? packIndex.find(p => p.uuid === uid) : null;
                if (byUuid && skinWatch.lastApplied !== byUuid.id) {
                    void 0;
                    applyPackForSkin(true).catch(() => {});
                    return;
                }
            }
            const sid = currentSkinId();
            if (!sid) return;
            
            if (auto.on && skinWatch.lastApplied && skinWatch.lastApplied !== sid &&
                !packIndex.some(p => p.id === sid)) {
                skinWatch.lastApplied = null;
                autoStop(true); 
                return;
            }
            if (!auto.on) {
                
                if (!skinWatch.userOff && skinWatch.lastApplied !== sid) applyPackForSkin().catch(() => {});
            } else if (sid !== skinWatch.lastApplied) {
                applyPackForSkin(true).catch(() => {});
            }
        });
    }, 4000);
    
    const packBoot = setInterval(() => {
        if (getMesh() && currentSkinId()) {
            clearInterval(packBoot);
            fetchApiSkin(0).finally(() => applyPackForSkin().catch(() => {}));
        }
    }, 1000);
    setTimeout(() => clearInterval(packBoot), 120000);

    // Siempre activo: con solo que exista config guardada (auto.front), arrancar
    // el modo auto al mesh disponible — salvo que el usuario lo haya apagado
    // manualmente (preferencia persistida).
    const autoBoot = setInterval(() => {
        if (!getMesh()) return;
        clearInterval(autoBoot);
        let userOff = false;
        try { userOff = localStorage.getItem(LS_KEY + '_autoUserOff') === '1'; } catch {}
        if (auto.front && !userOff) autoStart();
    }, 1000);
    setTimeout(() => clearInterval(autoBoot), 120000);

    // Cooperación con CustomSkins: cuando repinta la skin (accounts.json),
    // monta SU textura nueva de bajo de nuestra sesión. Re-capturar la base
    // (la franja de cabeza ahora tiene la custom skin) y re-montar la
    // textura facial encima — conservando la cara animada Y la custom skin.
    window.addEventListener('minifeather:skin-repainted', (e) => {
        try {
            if (!auto.on && !state.playing) return;
            const paintedMesh = e.detail?.mesh;
            const mesh = getMesh();
            if (!mesh) return;
            // Comparar por ENTITY ID, no por identidad de objeto: el facial y
            // CustomSkins pueden resolver meshes distintos del mismo jugador
            // (world.players vs player.mesh) según el timing de arranque — la
            // comparación estricta hacía return silencioso y la textura facial
            // vieja (skin del server) quedaba tapando la custom skin.
            const pid = paintedMesh?.entity?.id ?? paintedMesh?.entity?.entityId;
            const mid = mesh.entity?.id ?? mesh.entity?.entityId;
            if (paintedMesh !== mesh && !(pid != null && pid === mid)) return;
            // Guardar la textura auténtica nueva ANTES de invalidar: el mesh
            // del evento ya la tiene montada; si getMesh() resuelve otro mesh
            // del mismo jugador que aún no, ensureSession no la vería y el
            // espejo del watchdog seguiría copiando la vieja.
            try {
                const newAuth = [];
                paintedMesh.traverse(o => {
                    const list = o?.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
                    for (const m of list) if (m?.map?.__mfPainted) newAuth.push(m.map);
                });
                if (newAuth[0]) {
                    state.authTex = newAuth[0];
                    state.lastMirror = 0;
                }
            } catch {}
            // Re-capturar: invalidar sesión/base y reconstruir desde la
            // textura nueva (custom skin) en el próximo ensureSession.
            state.tex = null;
            state.baseHead = null;
            state.frameCache.clear();
            auto._blinkCache = null; auto._blinkCacheZone = null;
            ensureSession();
            paintZone(auto._zone || 'front', true);
        } catch {}
    });

    // Re-montaje automatico: el engine regenera materiales al cambiar de mundo,
    // reaparecer, equipar armadura o recrear el mesh; la textura facial queda
    // desmontada de ALGUNOS materiales (p.ej. solo la cabeza) mientras otros
    // la conservan. Con .some() el check pasaba aunque el material de la
    // CABEZA ya no la tuviera → la cara dejaba de animarse. Vigilar por
    // material: re-montar en los que falten; recapturar sesión solo si
    // NINGUNO la conserva (textura muerta/baseHead obsoleta).
    // SEGURO ANTI-CARRERA: si algún material del cuerpo muestra una textura
    // de CustomSkins DISTINTA de la que capturamos como base (__mfPainted
    // difiere de state.baseSkinPainted), la custom skin cambió por debajo →
    // recapturar aunque la facial siga montada (cubre eventos perdidos).
    setInterval(() => {
        if (!auto.on || !auto.front) return;
        const mesh = getMesh();
        if (!mesh) return;
        try {
            const mats = findSkinMaterials(mesh);
            if (!mats.length) return;
            // ¿CustomSkins pintó algo nuevo por debajo? (material con __mfPainted)
            const paintedUnder = mats
                .map(m => m.map?.__mfPainted)
                .find(u => typeof u === 'string');
            if (paintedUnder && paintedUnder !== state.baseSkinPainted) {
                state.baseSkinPainted = paintedUnder;
                state.tex = null;
                state.baseHead = null;
                state.frameCache.clear();
                auto._blinkCache = null; auto._blinkCacheZone = null;
                ensureSession();
                paintZone(auto._zone || 'front', true);
                return;
            }
            const anyMounted = mats.some(m => m.map === state.tex);
            if (!anyMounted) {
                state.tex = null;
                state.baseHead = null;
                ensureSession();
                paintZone(auto._zone || 'front', true);
            } else {
                for (const m of mats) {
                    if (m.map !== state.tex) { m.map = state.tex; m.needsUpdate = true; }
                }
                // ESPEJO LOCAL (mismo mecanismo que otherSession): re-copiar
                // la textura auténtica al canvas facial cada 400ms y re-pintar
                // la cara encima. Sin esto, un re-montaje de materiales del
                // engine con el evento skin-repainted perdido dejaba el canvas
                // facial con la skin VIEJA (stale) tapando la custom skin
                // nueva — y como la facial seguía "montada", el watchdog no
                // recapturaba: solo un F5 lo arreglaba.
                const nowMs = performance.now();
                if (state.authTex?.image && state.tex?.image instanceof HTMLCanvasElement
                    && nowMs - (state.lastMirror || 0) > 400) {
                    state.lastMirror = nowMs;
                    try {
                        const cx = state.tex.image.getContext('2d');
                        cx.imageSmoothingEnabled = false;
                        const ai = state.authTex.image, ti = state.tex.image;
                        cx.drawImage(ai, 0, 0, ai.width, ai.height, 0, 0, ti.width, ti.height);
                        state.tex.needsUpdate = true;
                        // Re-aplicar la cara animada sobre el espejo fresco
                        // (drawImage pisó la franja de la cabeza completa).
                        paintZone(auto._zone || 'front', true);
                    } catch {}
                }
            }
        } catch {}
    }, 500);
    
    const packsReady = Promise.all([
        loadBuiltinPacks().catch(() => {}),
        loadCustomPacks().catch(() => {})
    ]);
    packsReady.then(() => applyPackForSkin().catch(() => {}));

    {
        const origPlay = window.MF_Facial.play;
        window.MF_Facial.play = async function (name) {
            try { localStorage.setItem(LS_LAST, name); } catch {}
            return origPlay(name);
        };
    }

    void 0;
})();
