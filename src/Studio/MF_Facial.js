// MF_Facial.js — Animaciones faciales EN LOOP hechas por el usuario.
// "Mirar a un lado, al otro, parpadear, cejas..." → keyframes de la cara
// (región 8x8 frontal de la skin) que se reproducen TODO el tiempo hasta
// que se detengan. Completamente client-side, ideal para machinimas.
//
// Cómo funciona:
// - Una "facial" = lista de keyframes [{ face, holdMs, blendMs }]:
//     · face: nombre de emoción (happy, neutral, evil…) o 'base' (cara
//       actual sin emoción) o un canvas/cara de SkinChanger ('skin_x')
//     · holdMs: cuánto se MANTIENE ese frame (ms)
//     · blendMs: transición suave (cross-fade por alpha) al siguiente
// - El loop de reproducción (rAF) calcula el frame actual interpolando
//   entre el keyframe saliente y el entrante, y lo pinta SOBRE la
//   textura de la cara del jugador (misma región que FaceSwap).
// - La textura original se guarda antes de empezar → stop() la restaura.
// - Persistencia: biblioteca en localStorage (los keyframes referencian
//   emociones por nombre; las caras de SkinChanger se resuelven al vuelo).
//
// Uso:
//   MF_Facial.open()                    // panel editor
//   MF_Facial.play('blink')             // reproducir en loop
//   MF_Facial.stop()                    // parar y restaurar
//   MF_Facial.new / save / delete       // gestión de biblioteca

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
        library: {},          // name -> { frames: [{face, holdMs, blendMs}] }
        playing: null,        // nombre en reproducción
        playTimer: null,      // rAF id
        baseHead: null,       // cabeza original 64x16 (para restaurar)
        tex: null,            // textura del juego que tocamos
        frameCache: new Map(), // faceName -> Promise<{canvas, kind}>
        dirty: true           // recargar biblioteca del storage
    };

    // ── acceso al juego (patrón del cliente) ──
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
        const skins = out.filter(m => {
            const w = m.map?.image?.width, h = m.map?.image?.height;
            if (!w || !h) return false;
            // 64x64/64x32 o múltiplo HD (128x128, 1024x512…) — ratio 1:1 o 2:1
            const k64 = w / 64;
            return Number.isInteger(k64) && (h === w || h === w / 2);
        });
        return skins.length ? skins : out;
    }

    // ── resolver un "face" a { canvas, kind } ──
    // face = 'base' | 'p:<preset dibujado>' | 'skin_<nombre>' | emoción
    // kind: 'head' → canvas 64x16 (preset dibujado, se pinta la cabeza
    //       completa), 'face' → canvas 8x8 (solo la región de cara)
    function resolveFace(name) {
        if (state.frameCache.has(name)) return state.frameCache.get(name);
        const p = (async () => {
            if (name === 'base') {
                return state.baseHead
                    ? { canvas: cloneCanvas(state.baseHead), kind: 'head' }
                    : { canvas: blankFace(), kind: 'face' };
            }
            if (/^p:/.test(name)) {
                // preset DIBUJADO por el usuario en el SkinEditor (64x16)
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
                return null; // preset borrado
            }
            if (/^skin_/.test(name)) {
                // cara de una skin PNG de la biblioteca SkinChanger
                const nm = name.replace(/^skin_/, '');
                const it = (window.MF_SkinChanger?.items || []).find(i => i.name === nm);
                if (it?.dataURL) {
                    const img = await loadImg(it.dataURL);
                    // la skin puede ser HD: leer la cara a SU escala
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
                // cara de un PACK facial (builtin skins/facialskins/<id>/
                // <file>.png o custom importado por ZIP).
                // El PNG es la franja BASE de cabeza, ratio 2:1 (32x16
                // lógico a cualquier escala: alice 64x32 = k2, apex…).
                // El frame vive a RESOLUCIÓN NATIVA del pack (k propio) y
                // paintFace lo escala al k de la textura del juego al
                // pintar → sin pérdida por reescalado intermedio.
                const slash = name.indexOf('/');
                if (slash < 0) return null;
                const id = name.slice(3, slash), file = name.slice(slash + 1);
                const img = await packImg(id, file).catch(() => null);
                if (!img) return null;
                // k del sprite: la franja base es 32x16 lógico (cat 32x16
                // = k1, alice 64x32 = k2, apex 512x256 = k16…)
                const sk = Math.max(1, Math.round(img.width / 32));
                const c = document.createElement('canvas');
                c.width = 64 * sk; c.height = 16 * sk;
                const ctx = c.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                // base completa debajo (con su hat, en la resolución que
                // tenga) y el sprite del pack encima
                if (state.baseHead) ctx.drawImage(state.baseHead, 0, 0, 64 * sk, 16 * sk);
                ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 32 * sk, 16 * sk);
                return { canvas: c, kind: 'head', k: sk };
            }
            // emoción de FaceSwap (assets de Verity o fuentes externas)
            const cv = await window.MF_FaceSwap?.loadFaceCanvas?.(name);
            if (cv) return { canvas: cv, kind: 'face' };
            return null; // emoción desconocida
        })();
        state.frameCache.set(name, p);
        // los fs: que fallan (meta aún no plantado / imagen sin cargar) no
        // se cachean → el próximo resolveFace reintenta
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
            img.onerror = () => reject(new Error('no se pudo cargar la imagen'));
            img.src = url;
        });
    }

    // ── PACKS faciales (skins/facialskins/<id>/) ──
    // Cada carpeta: <id>.png (skin completa 64x64) + sprites de cabeza
    // (alfrente/al frente/afrente/al frente1 = frente, blink, izquierda,
    // derecha) en formato franja 2:1 (32x16 escalado). El monitor detecta
    // cuándo el juego usa la skin <id> y activa el modo auto con estos
    // sprites como presets.
    const PACKS_DIR = 'skins/facialskins/';
    const packImgCache = new Map(); // "id/file" -> Promise<HTMLImageElement|null>

    function extAssetUrl(rel) {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
            return chrome.runtime.getURL(rel);
        }
        // MAIN world: el SplashScreen (ISOLATED) planta meta[mf-skins-base]
        // con la URL de /skins/ de la extensión
        const meta = document.querySelector('meta[name="mf-skins-base"]');
        const base = meta?.content;
        if (base) {
            const b = base.replace(/\/$/, '') + '/';
            // rel empieza con "skins/" → quitar el prefijo (la base ya lo tiene)
            const noPrefix = rel.replace(/^skins\//, '');
            return b + noPrefix;
        }
        return null;
    }

    // URL base de un pack builtin según su carpeta: facialskins/ (server)
    // o mypacks/ (custom). Los ids conocidos del server van en facialskins.
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

    // variantes de nombre de archivo de frente por pack (cada autor nombra
    // distinto): la primera que cargue gana
    const FRONT_NAMES = ['alfrente', 'al frente', 'afrente', 'al frente1', 'frente'];
    async function loadPackFront(id) {
        for (const n of FRONT_NAMES) {
            const img = await loadPackImg(id, n);
            if (img) return { img, usedName: n };
        }
        return null;
    }

    // ¿qué skin se está usando ahora?
    // Prioridad:
    //   1. MF_SkinChanger.current — skin aplicada EN VIVO localmente
    //   2. internals del juego (profile.cosmetics.skin / model.skin) — se
    //      actualizan al instante al cambiar de skin en el armario
    //   3. cache de la API (accounts/me) — SOLO respaldo: puede quedar
    //      desactualizada si el armario usa XHR (no capturable)
    function currentSkinId() {
        // normalizar: quitar rutas/extensiones y el prefijo mfpack: (skin
        // de pack aplicada por el conducto nativo del juego)
        const norm = (v) => {
            let s = String(v).split('/').pop().replace(/\.png$/i, '');
            if (s.toLowerCase().startsWith(MFPACK_PREFIX)) s = s.slice(MFPACK_PREFIX.length);
            return s.toLowerCase();
        };
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

    // cache del campo "skin" de la cuenta. Mismo origen (miniblox.io).
    // ESTRATEGIA: captura PASIVA del tráfico del juego — el propio juego
    // pide /auth-api/accounts/me al loguear y al abrir el armario, y hace
    // PATCH al cambiar de skin. Así nunca dependemos de que nuestro fetch
    // propio pase (el directo 404 sin la sesión interna del cliente).
    //   GET  /auth-api/accounts/me      → j.skin
    //   PATCH /auth-api/accounts/me     → req.skin (respuesta del cambio)
    const apiSkin = { value: null, lastPatch: null };
    function noteApiSkin(id) {
        if (typeof id !== 'string' || !id) return;
        const clean = id.split('/').pop().replace(/\.png$/i, '').toLowerCase();
        if (clean && clean !== apiSkin.value) {
            console.log(TAG + ' skin (API): ' + clean);
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

    // 1) hook de window.fetch: ver respuestas GET y cuerpos de PATCH
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
                    // cambio de skin (armario): el body de la petición lleva
                    // la nueva — vale cualquier método con body
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

    // 2) hook de Response.json: cuando el juego hace r.json() sobre
    //    accounts/me, ya tiene el objeto — lo leemos sin tocar el stream
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

    // 3) fetch activo como último recurso. El endpoint es POST con body {}
    //    (así lo llama el juego; GET → 404). Backoff 60 s tras fallo.
    const apiFetchFail = { at: -1e9 };
    function fetchApiSkin(maxAgeMs = 8000) {
        // la captura pasiva ya nos dio el valor → nada que hacer
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

    // uuid del player LOCAL: player.uuid / profile.uuid / player.id (si
    // tiene forma de uuid) / entrada en playerList. Para el auto-activado
    // de packs con "uuid" en pack.json.
    function currentPlayerUuid() {
        const g = getGame() || globalThis.__MINIBLOX_GAME__ || null;
        const me = g?.player;
        if (!me) return null;
        const isUuid = (v) => typeof v === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
        if (isUuid(me.uuid)) return me.uuid.toLowerCase();
        if (isUuid(me.profile?.uuid)) return me.profile.uuid.toLowerCase();
        if (isUuid(me.id)) return me.id.toLowerCase();
        // playerList: buscar la entrada del player local
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

    // ── índice de packs ──
    // [{id, name, front, blink, left, right, skin?, custom?}]
    //  · builtin: vienen de skins/facialskins/<id>/pack.json (fetch)
    //  · custom:  ZIPs importados por el usuario, guardados en IndexedDB
    //             con sus PNGs como dataURL (accesibles desde MAIN world)
    const packIndex = [];

    // packs importados: IndexedDB "packs" → [{id, name, author, version,
    // skin(dataURL), sprites:{front,left,right,blink}(dataURL)}]
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

    // resolver la imagen de un pack builtin (meta mf-skins-base) o custom
    // (dataURL de IndexedDB) → Promise<HTMLImageElement>
    // file: para builtin = nombre SIN extensión; para custom = clave del
    // sprite ('front'|'left'|'right'|'blink')
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
        // builtin: loadPackImg añade ".png" él mismo → quitar la extensión
        // si viene (pack.json la trae: "alfrente.png")
        return loadPackImg(id, file.replace(/\.png$/i, ''));
    }

    // ── lectura/escritura ZIP (STORE, sin compresión) en MAIN world ──
    // JSZip vive en ISOLATED → aquí un lector minimalista: localiza los
    // [File Header] de entradas STORED, y para DEFLATE usa
    // DecompressionStream (todos los Chrome modernos lo tienen).
    async function zipRead(buf) {
        const dv = new DataView(buf);
        const files = new Map(); // name -> Uint8Array | null (directorio)
        // EOCD al final
        let eocd = -1;
        for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
            if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('ZIP inválido (sin EOCD)');
        const count = dv.getUint16(eocd + 10, true);
        let off = dv.getUint32(eocd + 16, true); // offset del CD
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
        // local headers → data
        for (const e of entries) {
            if (e.name.endsWith('/')) { files.set(e.name, null); continue; }
            if (dv.getUint32(e.lho, true) !== 0x04034b50) continue;
            const nlen = dv.getUint16(e.lho + 26, true);
            const elen = dv.getUint16(e.lho + 28, true);
            const start = e.lho + 30 + nlen + elen;
            const raw = new Uint8Array(buf, start, e.csize);
            let data = raw;
            if (e.method === 8) { // DEFLATE
                const ds = new DecompressionStream('deflate-raw');
                const stream = new Blob([raw]).stream().pipeThrough(ds);
                data = new Uint8Array(await new Response(stream).arrayBuffer());
            } else if (e.method !== 0) continue;
            files.set(e.name, data);
        }
        return files;
    }

    // construir un ZIP STORE mínimo (varios PNGs + pack.json)
    function zipWrite(files) { // [[name, Uint8Array]]
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
            lv.setUint16(4, 20, true);      // version
            lv.setUint16(6, 0, true);       // flags
            lv.setUint16(8, 0, true);       // STORE
            lv.setUint16(10, 0, true);      // time
            lv.setUint16(12, 0, true);      // date
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

    // importar un ZIP de pack: pack.json + PNGs en la raíz o en una subcarpeta
    async function importPackZip(file) {
        const buf = await file.arrayBuffer();
        const files = await zipRead(buf);
        // localizar pack.json (raíz o primera subcarpeta)
        const names = [...files.keys()];
        const pjName = names.find(n => /(^|\/)pack\.json$/i.test(n));
        if (!pjName) throw new Error('el ZIP no tiene pack.json');
        const dir = pjName.includes('/') ? pjName.slice(0, pjName.lastIndexOf('/') + 1) : '';
        const j = JSON.parse(new TextDecoder().decode(files.get(pjName)));
        const id = String(j.id || file.name.replace(/\.zip$/i, '')).toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (!id) throw new Error('pack.json sin "id"');

        // leer sprites: nombres desde el json, o sprites explícitos dataURL
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
            up: pick(sp.up, null),     // opcionales (null si no vienen)
            down: pick(sp.down, null),
            brow: pick(sp.brow, null),
            blink: pick(sp.blink, dir + 'blink.png')
        };
        for (const k in spriteFiles) if (spriteFiles[k]) want.add(spriteFiles[k]);
        const skinFile = j.skin ? dir + j.skin : null;
        if (skinFile) want.add(skinFile);
        // normalizar nombres de archivos del ZIP (mayúsculas/espacios) con
        // tolerancia: buscar por lowercase sin espacios
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
        const OPTIONAL = new Set(['up', 'down', 'brow']); // sprites opcionales
        for (const key in spriteFiles) {
            const du = await blobOf(spriteFiles[key]);
            if (!du) {
                if (OPTIONAL.has(key)) continue; // sin sprite → zona desactivada
                throw new Error('falta sprite "' + key + '" (' + spriteFiles[key] + ')');
            }
            pack.sprites[key] = du;
        }
        pack.skin = await blobOf(skinFile);
        // invalidar caches del id (re-import con imágenes nuevas)
        for (const key of [...packImgCache.keys()]) {
            if (key.startsWith(id + '/')) packImgCache.delete(key);
        }
        for (const key of [...state.frameCache.keys()]) {
            if (key.startsWith('fs:' + id + '/')) state.frameCache.delete(key);
        }
        auto._blinkCache = null; auto._blinkCacheZone = null; auto._blinkCacheKind = null;
        // guardar en IndexedDB + refrescar índices
        await packsDbPut(pack);
        await loadCustomPacks();
        // registrar el id en mypacks (para el boot y futuras sesiones)
        try {
            const saved = JSON.parse(localStorage.getItem('mff:mypacks') || '[]');
            if (!saved.includes(id)) {
                saved.push(id);
                localStorage.setItem('mff:mypacks', JSON.stringify(saved));
            }
        } catch {}
        // aplicar la skin del pack por el conducto NATIVO del juego (id
        // mfpack:<id> + interceptor <img>) → el monitor detecta el id y
        // enciende la cara animada. Si no hay juego cargado queda listo
        // para cuando entre a un mundo.
        try { await applyPackSkinToGame(id); } catch {}
        return pack;
    }

    // exportar un pack como ZIP descargable (builtin via fetch, custom
    // desde sus dataURLs de IndexedDB)
    async function exportPackZip(id) {
        const p = packIndex.find(x => x.id === id);
        if (!p) throw new Error('pack "' + id + '" no encontrado');
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
                // el src de la imagen ya es la URL del PNG (chrome-ext://…)
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

    // packs custom (IndexedDB) en memoria: id → pack (con dataURLs)
    const customPacks = new Map();
    async function loadCustomPacks() {
        try {
            const all = await packsDbAll();
            customPacks.clear();
            for (const p of all) customPacks.set(p.id, p);
        } catch {}
        rebuildPackIndex();
    }

    // ── Registro de skins de pack DENTRO del bundle del juego ──
    // El skinManager del juego (clase AF, module-scope) carga cada skin
    // como <img src="textures/entity/skins/<id>.png"> (vía THREE.Texture
    // Loader). Interceptor de CustomSkins.js ya probó este conducto.
    // Aquí registramos la skin de cada pack con id "mfpack:<id>":
    //   1. exponemos la URL real del PNG (extensión o dataURL) en
    //      window.__MF_PACK_SKINS__ para el interceptor de <img src>
    //   2. player.profile.cosmetics.skin = "mfpack:<id>" + mesh.recreate()
    //      → el juego la carga/registra como nativa (ratio + materiales
    //      correctos, avatares de UI incluidos) y el servidor NUNCA la ve
    //      (local only: el id no se envía hasta que exista de verdad)
    const MFPACK_PREFIX = 'mfpack:';
    function packSkinUrl(packId) {
        // ZIP importado (IndexedDB): dataURL directo
        const custom = customPacks.get(packId);
        if (custom?.skin) return custom.skin;
        // builtin de mypacks/ (custom, no server): URL de la extensión
        const p = builtinPacks.find(x => x.id === packId && !x.server);
        if (p) {
            const base = p.skinFile ? MY_PACKS_DIR + packId + '/' + p.skinFile
                                    : MY_PACKS_DIR + packId + '/' + packId + '.png';
            return extAssetUrl(base);
        }
        // builtin de facialskins/ (skin DEL SERVER): el juego ya la tiene,
        // no necesita registro — solo se aplica por el armario del juego
        return null;
    }
    // registro vivo para el interceptor de <img src> (mismo conducto que
    // CustomSkins.js): skinId "mfpack:cat" → URL del PNG
    const packSkinReg = (globalThis.__MF_PACK_SKINS__ ||= {});
    function registerPackSkin(packId) {
        const url = packSkinUrl(packId);
        if (!url) return false;
        packSkinReg[MFPACK_PREFIX + packId] = url;
        return true;
    }
    // instalar el interceptor una sola vez (document_start, MAIN world)
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
                    const m = v.match(/^textures\/entity\/skins\/([^/?#]+)\.png/);
                    if (m && globalThis.__MF_PACK_SKINS__?.[m[1]]) {
                        origSet.call(this, globalThis.__MF_PACK_SKINS__[m[1]]);
                        return;
                    }
                }
                origSet.call(this, v);
            }
        });
        globalThis.__MF_PACK_IMG_HOOK__ = true;
    }
    // aplicar la skin del pack al player LOCAL (no server-side):
    // registra el id, carga la textura en el skinManager del juego y
    // recrea el mesh con el pipeline nativo
    async function applyPackSkinToGame(packId) {
        const g = getGame();
        const me = g?.player;
        if (!g || !me) throw new Error('no hay juego cargado (entra a un mundo primero)');
        if (!registerPackSkin(packId)) throw new Error('el pack no tiene skin PNG');
        // soltar cualquier skin del SkinChanger: su watchdog re-pintaría
        // su textura encima del mesh que el juego acaba de recrear
        try { window.MF_SkinChanger?.release?.(); } catch {}
        me.profile.cosmetics.skin = MFPACK_PREFIX + packId;
        // recrear el mesh del player como hace el juego al cambiar skin
        let mesh = null;
        try { mesh = g.world?.getPlayerById?.(me.id)?.mesh || me.mesh; } catch {}
        try {
            if (mesh?.recreate) await mesh.recreate();
            else if (typeof mesh?.init === 'function') await mesh.init();
        } catch {}
        return true;
    }

    // índice unificado builtin + custom
    function rebuildPackIndex() {
        packIndex.length = 0;
        for (const p of builtinPacks) packIndex.push(p);
        for (const p of customPacks.values()) {
            packIndex.push({
                id: p.id, name: p.name, author: p.author, version: p.version,
                uuid: p.uuid || null,
                // custom: los "file" de fs: son CLAVES de sprites (no
                // filenames) → packImg(id, 'front') resuelve el dataURL
                front: 'front', left: 'left',
                right: 'right', blink: 'blink',
                up: p.sprites.up ? 'up' : null,       // opcionales
                down: p.sprites.down ? 'down' : null,
                brow: p.sprites.brow ? 'brow' : null,
                skinFile: null, custom: true, server: false
            });
        }
        // registrar TODAS las skins de pack en el conducto nativo del
        // juego (interceptor <img>) para que estén disponibles al vuelo
        installPackImgHook();
        for (const p of packIndex) { try { registerPackSkin(p.id); } catch {} }
        renderPacksTab();
    }

    // builtin: leer pack.json de cada directorio conocido vía fetch.
    // skins/facialskins/ = SOLO skins NATIVAS del server (catálogo del
    // juego: cat, alice, bob…): el juego ya sabe cargarlas → sus packs NO
    // necesitan inyección, solo activan el modo auto.
    // skins/mypacks/ = packs CUSTOM (skins propias que NO están en el
    // server): esos sí se registran en el bundle (id mfpack:<id>) para
    // que el juego las trate como nativas.
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
                    uuid: typeof j.uuid === 'string' ? j.uuid.toLowerCase() : null, // auto-activar si el player local tiene este uuid
                    front: sp.front || null,
                    left: sp.left || 'izquierda.png',
                    right: sp.right || 'derecha.png',
                    up: sp.up || null,      // opcional: mirar arriba
                    down: sp.down || null,  // opcional: mirar abajo
                    brow: sp.brow || null,  // opcional: ceja levantada ("?" chat)
                    blink: sp.blink || 'blink.png',
                    skinFile: j.skin || null,
                    // server: el juego ya tiene esta skin (solo auto-mode).
                    // custom: skin propia no-server → registro mfpack:
                    server: isServerSkin(j.id || id)
                };
            } catch { return null; }
        }));
        for (const p of results) if (p) builtinPacks.push(p);
        rebuildPackIndex();
    }

    // lista de directorios con pack.json: facialskins/ (server) +
    // mypacks/ (custom). mypacks no existe en versiones viejas → fetch
    // 404 da lista vacía, no error.
    const MY_PACKS_DIR = 'skins/mypacks/';
    // ids de packs custom builtin (carpeta skins/mypacks/ de la extensión)
    const MY_PACKS_IDS = ['estebangxe', 'angrywolfx'];
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

    // URL de un archivo de pack builtin (con extensión tal cual)
    function packFileUrl(id, file) {
        const custom = customPacks.get(id);
        if (custom) return custom.sprites[file] || null; // sprites custom son dataURL
        return extAssetUrl(packBaseUrl(id) + id + '/' + file);
    }

    // ── sesión de textura (patrón SkinChanger) ──
    function ensureSession() {
        const mesh = getMesh();
        if (!mesh) throw new Error('jugador no disponible (entra al mundo primero)');
        const mats = findSkinMaterials(mesh);
        if (!mats.length) throw new Error('no se encontró material de skin');
        const src = mats[0].map;
        if (!src?.image) throw new Error('textura de skin no legible');

        // guardar cabeza original SOLO la primera vez (o cuando cambia la
        // skin: la base anterior ya no corresponde a la actual).
        // La textura puede ser HD (128x128, 512x512…) → el cuadrante de
        // cabeza ocupa 64x16*k → se captura A RESOLUCIÓN NATIVA (64k x 16k)
        // para no perder detalle al restaurar/pintar en texturas HD.
        const skinIdNow = currentSkinId();
        // NUNCA capturar a mitad de un parpadeo: los frames 'face' vacían
        // el cuadrado frontal del hat y ese agujero quedaría grabado en la
        // base para siempre (hat invisible). Se captura en el próximo
        // paintFace que no esté dentro de la ventana de blink.
        if ((!state.baseHead || state.baseHeadSkin !== skinIdNow) && !auto._blinkUntil) {
            try {
                const k = Math.max(1, Math.round(src.image.width / 64));
                const c = document.createElement('canvas');
                c.width = 64 * k; c.height = 16 * k;
                c.getContext('2d').drawImage(src.image, 0, 0, 64 * k, 16 * k, 0, 0, 64 * k, 16 * k);
                state.baseHead = c; state.baseHeadK = k;
                state.baseHeadSkin = skinIdNow;
                // la base cambió → invalidar todo lo cacheado contra ella
                state.frameCache.clear();
                auto._blinkCache = null;
                auto._blinkCacheZone = null;
            } catch {}
        }

        if (src.image instanceof HTMLCanvasElement) {
            state.tex = src;
            return src.image;
        }
        // montar canvas editable propio
        const c = document.createElement('canvas');
        c.width = src.image.width; c.height = src.image.height;
        c.getContext('2d').drawImage(src.image, 0, 0);
        let nt = null;
        try { nt = new src.constructor(c); } catch {}
        if (!nt) throw new Error('no se pudo crear textura editable');
        try {
            nt.magFilter = src.magFilter; nt.minFilter = src.minFilter;
            if (src.colorSpace !== undefined && 'colorSpace' in nt) nt.colorSpace = src.colorSpace;
            nt.flipY = src.flipY; nt.wrapS = src.wrapS; nt.wrapT = src.wrapT;
        } catch {}
        for (const m of mats) { m.map = nt; m.needsUpdate = true; }
        state.tex = nt;
        return c;
    }

    // pinta un frame sobre la textura del juego.
    // kind 'head' → cabeza completa 64x16 (presets dibujados y sprites de
    //   pack: traen la franja completa, hat incluido, en 32..64)
    // kind 'face' → solo la región de cara 8x8 (emociones de FaceSwap)
    function paintFace(frame) {
        const canvas = ensureSession();
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        // la textura puede ser HD (k = múltiplo de 64): todas las
        // coordenadas están en unidades lógicas 64x64 → escalar por k
        const k = Math.max(1, Math.round(canvas.width / 64));
        if (frame.kind === 'head') {
            ctx.clearRect(0, 0, 64 * k, 16 * k);
            // el frame puede tener k propio (sprite de pack HD): se pinta
            // completo a la resolución de la textura, 1:1 si k coincide
            ctx.drawImage(frame.canvas, 0, 0, frame.canvas.width, frame.canvas.height, 0, 0, 64 * k, 16 * k);
        } else {
            ctx.clearRect(FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k);
            ctx.drawImage(frame.canvas, 0, 0, 8,  8, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k);
        }
        // El hat layer (overlay, x=40) se renderiza ENCIMA de la base con
        // inflate. Los frames 'head' ya pintan su propio hat (vienen de la
        // franja completa del pack/baseHead). Los frames 'face' no traen
        // hat → se vacía SOLO el cuadrado de cara del overlay para que el
        // hat opaco de la skin no tape la emoción; el resto del hat (pelo
        // de arriba, lados, atrás) NO se toca, y stop() restaura todo.
        if (frame.kind !== 'head') {
            ctx.clearRect(FACE_OV.x * k, FACE_OV.y * k, FACE_OV.w * k, FACE_OV.h * k);
        }
        state.tex.needsUpdate = true;
    }

    // mezcla dos frames por alpha (blend suave entre keyframes).
    // Los frames pueden tener k distintos (preset 64x16 vs pack HD) →
    // se mezclan a la resolución MAYOR para no perder detalle.
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

    // ── reproducción en loop ──
    // El "reloj" avanza con rAF; en cada iteración se calcula el keyframe
    // activo (por holdMs/blendMs) y se pinta la cara correspondiente. El
    // loop NUNCA termina solo → stop() restaura la cara original.
    async function play(name) {
        const anim = state.library[name];
        if (!anim?.frames?.length) return { ok: false, error: 'facial "' + name + '" no existe o sin frames' };
        stop(false);
        if (auto.on) autoStop(false); // el loop manda sobre auto
        try { ensureSession(); } catch (e) { return { ok: false, error: e.message }; }
        state.playing = name;

        // precalcular frames ({canvas, kind} por keyframe)
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
            if (t > cur.holdMs && cur.blendMs > 0 && cur.kind === nxt.kind) {
                // fase de transición: mezclar cur → nxt (mismo kind)
                const k = (t - cur.holdMs) / cur.blendMs;
                paintFace(blendFrames(cur, nxt, k));
            } else {
                paintFace(cur);
            }
            state.playTimer = requestAnimationFrame(tick);
        };
        tick();
        console.log(TAG + ' reproduciendo en loop: ' + name);
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

    // ── AUTO-PRESETS REACTIVOS ──
    // La cara reacciona a dónde miras: yaw de cámara (izquierda/derecha)
    // y pitch (arriba/abajo) → sprite que el usuario dibjó en SkinEditor.
    // Además parpadeo automático con intervalo random (2-7 s).
    const LS_AUTO = LS_KEY + '_auto';
    const auto = {
        on: false,
        yawThreshold: 10,        // grados de giro para activar
        pitchThreshold: 10,
        front: '',               // preset cara al frente ('' = actual)
        left: '',                // preset al mirar a la izquierda
        right: '',               // preset al mirar a la derecha
        up: '',
        down: '',
        blink: true,             // parpadeo automático
        blinkClosed: '',         // preset de ojos cerrados ('' = noface)
        blinkMinMs: 2000, blinkMaxMs: 7000,
        brow: false,             // ceja levantada al ver un "?" en el chat
        browFace: '',            // preset de ceja ('' = sintetizar sobre la zona)
        browMs: 1400,            // duración de la ceja levantada
        _browUntil: 0,           // timestamp de fin de la ceja actual
        _raf: null,              // loop rAF
        _nextBlink: 0,           // timestamp del próximo parpadeo
        _blinkUntil: 0,          // timestamp de fin del parpadeo actual
        _blinkCache: null,       // canvas de ojos cerrados (cache)
        _blinkCacheZone: null,   // zona para la que se cacheó
        _zone: 'front',          // zona actual (front/left/right/up/down)
        _refYaw: null, _refPitch: null, _lastT: 0 // referencia del "cuerpo"
    };

    function loadAuto() {
        try { Object.assign(auto, JSON.parse(localStorage.getItem(LS_AUTO) || '{}')); }
        catch {}
        // migración: los defaults viejos (35/30) pasan al umbral nuevo (10)
        if (auto.yawThreshold === 35) auto.yawThreshold = 10;
        if (auto.pitchThreshold === 30) auto.pitchThreshold = 10;
        // campos de runtime no persisten
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

    // ── lectura de cámara ──
    // Rig FPS del juego (mismo que usa Baritone.turnCamera):
    //   yawObject > pitchObject > camera, rotaciones en RADIANES.
    //   yaw  = camera.parent.parent.rotation.y
    //   pitch = camera.parent.rotation.x   (positivo = mirar arriba)
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

    // yaw/pitch RELATIVOS al cuerpo (referencia que sigue lento a la cámara):
    // mirar al frente → 0°. Girar la cabeza/cámara a un lado → ángulo relativo.
    // El "cuerpo" alcanza a la cámara a ~180°/s → si mantienes el giro se
    // normaliza (dejas de tener la cabeza girada), como en el juego real.
    // IMPORTANTE: yaw positivo = girar a la DERECHA (convención del rig).
    function lookAngles() {
        const rig = cameraRig();
        if (!rig) return null;
        const now = performance.now();
        const dt = Math.min(0.1, (now - (auto._lastT || now)) / 1000);
        auto._lastT = now;
        if (auto._refYaw == null) { auto._refYaw = rig.yaw; auto._refPitch = rig.pitch; }
        const follow = Math.PI * dt;            // ~180°/s
        auto._refYaw += Math.max(-follow, Math.min(follow, wrapPi(rig.yaw - auto._refYaw)));
        const fP = follow * 0.7;
        auto._refPitch += Math.max(-fP, Math.min(fP, Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rig.pitch - auto._refPitch))));
        return {
            yaw: wrapPi(rig.yaw - auto._refYaw) * D,     // relativo (−180..180)
            pitch: wrapPi(rig.pitch - auto._refPitch) * D,
            absYaw: wrapPi(rig.yaw) * D,                 // absoluto (debug)
            absPitch: rig.pitch * D
        };
    }

    // zona actual con HISTÉRESIS: entra al umbral, sale con margen extra
    // (evita oscilar en el borde y cambiar la cara estando quieto).
    // El margen nunca supera la mitad del umbral (para no anularlo).
    const HYST = () => Math.min(8, Math.max(2, Math.floor(Math.min(auto.yawThreshold, auto.pitchThreshold) / 2)));
    function zoneOf(a) {
        const z = auto._zone || 'front';
        const thr = auto.yawThreshold, pthr = auto.pitchThreshold;
        const hY = Math.min(HYST(), thr / 2), hP = Math.min(HYST(), pthr / 2);
        // yaw+ = derecha, yaw− = izquierda · pitch+ = arriba, pitch− = abajo
        const inUp = auto.up && a.pitch > pthr, outUp = a.pitch > pthr - hP;
        const inDown = auto.down && a.pitch < -pthr, outDown = a.pitch < -(pthr - hP);
        const inR = auto.right && a.yaw > thr, outR = a.yaw > thr - hY;
        const inL = auto.left && a.yaw < -thr, outL = a.yaw < -(thr - hY);
        // mantener la zona actual mientras siga dentro del margen de salida
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

    // resuelve el nombre de un preset para resolveFace(): los packs
    // ('fs:id/file') van tal cual, los presets dibujados con prefijo 'p:'
    const resolveAutoName = (n) => (typeof n === 'string' && n.startsWith('fs:')) ? n : 'p:' + n;

    // pinta el preset de la zona dada ('' = frente/base)
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

    // canvas de ojos cerrados (cacheado por zona):
    //   1. preset asignado (blinkClosed) de tipo 'head' (packs) → se pinta
    //      tal cual: su franja 64x16 ya trae el hat → el pelo/sombrero NO
    //      desaparece durante el parpadeo
    //   2. preset 'face' (8x8) → igual que antes
    //   3. sintetizado: copia la cara de la ZONA ACTUAL y tapa los ojos con
    //      el tono de piel de la propia cara (nunca deja la cara vacía)
    async function getBlinkCanvas() {
        const zone = auto._zone || 'front';
        if (auto._blinkCache && auto._blinkCacheZone === zone) return auto._blinkCache;

        // helper: cara 8x8 de la zona actual (preset o base)
        const zoneFace = async () => {
            const name = zone === 'front' ? (auto.front || null) : auto[zone] || null;
            let fr = null;
            if (name) fr = await resolveFace(resolveAutoName(name)).catch(() => null);
            if (fr) {
                const k = fr.kind === 'head' ? Math.max(1, Math.round(fr.canvas.width / 64)) : 1;
                const c = document.createElement('canvas');
                c.width = 8; c.height = 8;
                const cx = c.getContext('2d');
                cx.imageSmoothingEnabled = false;
                if (fr.kind === 'head') cx.drawImage(fr.canvas, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k, 0, 0, 8, 8);
                else cx.drawImage(fr.canvas, 0, 0, 8, 8, 0, 0, 8, 8);
                return c;
            }
            if (state.baseHead) {
                const bk = state.baseHeadK || 1;
                const c = document.createElement('canvas');
                c.width = 8; c.height = 8;
                const cx = c.getContext('2d');
                cx.imageSmoothingEnabled = false;
                cx.drawImage(state.baseHead, FACE.x * bk, FACE.y * bk, FACE.w * bk, FACE.h * bk, 0, 0, 8, 8);
                return c;
            }
            return null;
        };

        try {
            // 1) preset de ojos cerrados elegido por el usuario
            if (auto.blinkClosed) {
                const fr = await resolveFace(resolveAutoName(auto.blinkClosed)).catch(() => null);
                if (fr) {
                    // frame 'head' (sprite de pack): SU franja ya trae el
                    // hat → devolverlo tal cual para pintarlo completo y no
                    // perder el pelo/sombrero durante el parpadeo
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
            // 2) sintetizar sobre la cara de la zona actual
            const face = await zoneFace();
            if (face) {
                const cx = face.getContext('2d');
                // tono de piel: pixel de mejilla izquierda (1,6)
                const cheek = cx.getImageData(1, 6, 1, 1).data;
                cx.fillStyle = `rgb(${cheek[0]},${cheek[1]},${cheek[2]})`;
                cx.fillRect(1, 4, 2, 2); // ojo izquierdo
                cx.fillRect(5, 4, 2, 2); // ojo derecho
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

    // Facial Sync: emitir mi estado de cara por P2P (MF_Peer). El receptor
    // lo replica sobre MI entidad en su vista. Solo animaciones temporales
    // (blink/ceja) — las zonas de giro ya se ven con la cabeza rotando.
    function broadcastFacial(a) {
        try { window.MF_Peer?.sendStudio?.({ t: 'facial', a }); } catch {}
    }

    // ── ceja levantada al ver un "?" en el chat ──
    // Vigila game.chat.log (array de entradas): cuando aparece un mensaje
    // NUEVO con "?", levanta la ceja por browMs. Si hay preset/sprite de
    // ceja se usa; si no, se sintetiza sobre la cara de la zona actual.
    const chatSeen = new WeakSet();
    const DEBUG_BROW = localStorage.getItem('mff:debug-brow') === '1';
    function debugBrow(...a) { if (DEBUG_BROW) console.log('[MF Facial 🤨]', ...a); }
    function chatQuestionWatch() {
        if (!auto.brow || !auto.on) { debugBrow('watch off (brow=' + auto.brow + ' on=' + auto.on + ')'); return; }
        const g = getGame() || globalThis.__MINIBLOX_GAME__ || null;
        const log = g?.chat?.log;
        if (!Array.isArray(log)) { debugBrow('sin chat: game=' + !!g + ' log=' + (log === undefined ? 'undefined' : typeof log)); return; }
        // solo mirar las últimas entradas (el chat es append-only)
        for (let i = Math.max(0, log.length - 12); i < log.length; i++) {
            const entry = log[i];
            if (!entry || typeof entry !== 'object' || chatSeen.has(entry)) continue;
            chatSeen.add(entry);
            const text = String(entry.text ?? entry.message ?? entry.content ?? '');
            const hasQ = text.includes('?');
            debugBrow('chat[' + i + ']' + (hasQ ? ' [?]' : '') + ': ' + JSON.stringify(text.slice(0, 60)));
            // "?" en el mensaje (¿…? también cuenta por el cierre)
            if (hasQ) {
                auto._browUntil = performance.now() + (auto.browMs || 1400);
                debugBrow('→ ceja hasta +' + (auto.browMs || 1400) + 'ms');
                return; // una sola reacción por tanda
            }
        }
    }

    // canvas de ceja levantada: preset asignado o sintetizada sobre la
    // cara de la zona actual (sube la fila de cejas 1px)
    async function getBrowCanvas() {
        // 1) preset asignado explícitamente
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
        // 2) sprite "brow" del pack activo (por filename real del pack)
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
        // 3) sintetizar: copia la cara de la zona y sube la ceja 1px
        //    (y=3 → y=2, rellenando con tono del pelo para no duplicar)
        debugBrow('brow SINTETIZADA sobre zona "' + zone + '"');
        const face = await zoneFace();
        if (!face) return null;
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(face, 0, 0);
        try {
            const hair = cx.getImageData(4, 0, 1, 1).data; // tono del pelo (arriba)
            const row3 = cx.getImageData(0, 3, 8, 1);
            cx.putImageData(row3, 0, 2); // subir la ceja 1px
            // rellenar donde estaba con tono piel/pelo aclarado
            const cheek = cx.getImageData(1, 6, 1, 1).data;
            cx.fillStyle = `rgb(${Math.round((cheek[0] + hair[0]) / 2)},${Math.round((cheek[1] + hair[1]) / 2)},${Math.round((cheek[2] + hair[2]) / 2)})`;
            cx.fillRect(0, 3, 8, 1);
        } catch {}
        return { canvas: c, kind: 'face' };
    }

    function autoTick() {
        if (!auto.on) { auto._raf = null; return; }
        const now = performance.now();

        // chat "?" → ceja levantada (ventana browMs). Mientras dura la
        // ceja no se evalúan zonas ni blink (evita que se pisen)
        chatQuestionWatch();
        if (auto._browUntil) {
            if (now >= auto._browUntil) {
                debugBrow('fin de la ceja → restaurar zona "' + (auto._zone || 'front') + '"');
                auto._browUntil = 0;
                broadcastFacial('open'); // P2P: ceja abajo
                paintZone(auto._zone || 'front', true); // restaurar la zona
            } else {
                // pintar la ceja una vez al entrar en la ventana
                if (!auto._browPainted) {
                    auto._browPainted = true;
                    broadcastFacial('brow'); // P2P: ceja arriba
                    debugBrow('pintando ceja (quedan ' + Math.round(auto._browUntil - now) + 'ms)');
                    getBrowCanvas().then(fr => {
                        if (fr && auto.on && auto._browUntil) {
                            paintFace({ canvas: fr.canvas, kind: fr.kind });
                        } else if (fr) {
                            debugBrow('canvas listo pero ventana cerrada (on=' + auto.on + ') — no se pinta');
                        }
                    });
                }
            }
        } else if (auto._browPainted) {
            auto._browPainted = false;
        }

        // parpadeo: ventana corta de ojos cerrados; al terminar SIEMPRE se
        // repinta la cara de la zona actual (aunque el yaw no haya cambiado)
        if (auto.blink && !auto._browUntil) {
            if (auto._blinkUntil && now >= auto._blinkUntil) {
                auto._blinkUntil = 0;
                scheduleBlink(now);
                broadcastFacial('open'); // P2P: ojos abiertos
                paintZone(auto._zone || 'front', true); // restaurar ya
            } else if (!auto._blinkUntil && now >= auto._nextBlink) {
                auto._blinkUntil = now + 45 + Math.random() * 45; // 45-90 ms
                broadcastFacial('blink'); // P2P: ojos cerrados
                getBlinkCanvas().then(cv => {
                    // pintar SOLO si el canvas ya está listo y la ventana sigue abierta
                    if (cv && auto.on && auto._blinkUntil && performance.now() < auto._blinkUntil) {
                        // kind 'head' → el sprite del pack trae hat incluido;
                        // 'face' → solo la cara 8x8 (vacía el hat frontal)
                        try { paintFace({ canvas: cv, kind: auto._blinkCacheKind || 'face' }); }
                        catch (e) {
                            // el mesh se recreó (cambio de mundo/shader): la
                            // sesión de textura quedó vieja → invalidar y
                            // reintentar en el próximo blink
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

        // reacción al giro de cabeza: evaluar zona CADA tick (barato) y solo
        // repintar cuando la zona cambia (con histéresis evita el jitter)
        if (!auto._browUntil) {
            const angles = lookAngles();
            if (angles) {
                const z = zoneOf(angles);
                if (z !== auto._zone && !auto._blinkUntil) {
                    broadcastFacial(z); // P2P: giré la cabeza a la zona z
                    paintZone(z);
                }
            }
        }
        auto._raf = requestAnimationFrame(autoTick);
    }

    async function autoStart() {
        try { ensureSession(); } catch (e) { return { ok: false, error: e.message }; }
        stop(false); // parar una facial en loop si sonaba
        auto.on = true;
        auto._zone = null; // forzar repintar la zona actual
        auto._refYaw = null; auto._refPitch = null; auto._lastT = 0; // re-sincronizar cuerpo
        scheduleBlink(performance.now());
        if (!auto._raf) auto._raf = requestAnimationFrame(autoTick);
        renderUI();
        console.log(TAG + ' auto-presets ON (reacciona al giro de cabeza + parpadeo random)');
        return { ok: true };
    }

    function autoStop(restore = true) {
        auto.on = false;
        if (auto._raf) { cancelAnimationFrame(auto._raf); auto._raf = null; }
        broadcastFacial('off'); // P2P: el peer restaura mi cara
        if (restore && state.baseHead && state.tex) {
            try { paintFace({ canvas: state.baseHead, kind: 'head' }); } catch {}
        }
        renderUI();
        return { ok: true };
    }

    // ── ANIMAR A OTROS (modo machinima) ──
    // Parpadeo local sobre los meshes de OTROS jugadores: nadie más lo
    // ve, pero el recording sí. Cada player tiene su propia "sesión" de
    // textura (canvas editable + baseHead 64x16 capturada UNA vez), con
    // blink desincronizado (fase random por player) para que no parpadeen
    // todos a la vez. 'me' nunca se toca acá (eso ya lo hace el modo auto).
    const LS_OTHERS = LS_KEY + '_others';
    const others = {
        on: false,
        intervalMinMs: 2500,  // parpadeo de cada player: random entre min y max
        intervalMaxMs: 6500,
        _raf: null,           // loop rAF compartido
        _sessions: new Map()  // playerKey -> {tex, canvas, baseHead, k, nextBlink, blinkUntil, name}
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

    // iterar entidades de otros players (todo lo que world tiene con mesh,
    // menos el local). La clave ES el uuid/id del player — así la sesión
    // sobrevive aunque el objeto entidad se recree.
    function otherPlayers() {
        const g = getGame() || globalThis.__MINIBLOX_GAME__ || null;
        const me = g?.player;
        if (!g || !me) return [];
        const out = [];
        const seen = new Set();
        const add = (key, e, name) => {
            if (!key || seen.has(key) || key === me.id) return;
            const mesh = e?.mesh;
            if (!mesh) return;
            seen.add(key); out.push({ key: String(key), mesh, name: String(name || key).slice(0, 16) });
        };
        try {
            if (g.world?.players instanceof Map) {
                for (const [id, e] of g.world.players) {
                    if (id === me.id) continue;
                    add(e?.uuid || id, e, e?.username || e?.profile?.username || e?.name);
                }
            }
        } catch {}
        try {
            const pl = g.playerList;
            const entries = pl?.entries ? [...pl.entries()] : Object.entries(pl || {});
            for (const [k, v] of entries) {
                if (!v || typeof v !== 'object') continue;
                if (v.uuid === me.uuid || k === me.id) continue;
                try { const e = g.world?.getPlayerById?.(k) || g.world?.players?.get?.(k); if (e) add(v.uuid || k, e, v.username || v.name); } catch {}
            }
        } catch {}
        return out;
    }

    // sesión de textura de otro player (patrón ensureSession pero por key)
    function otherSession(p) {
        let s = others._sessions.get(p.key);
        const mats = findSkinMaterials(p.mesh);
        if (!mats.length) return null;
        const src = mats[0].map;
        if (!src?.image) return null;

        if (!s) {
            s = { tex: null, canvas: null, baseHead: null, k: 1, nextBlink: 0, blinkUntil: 0, name: p.name };
            others._sessions.set(p.key, s);
        }
        // la base se captura UNA vez por player (si el server recrea el mesh
        // con otra skin, la sesión vieja se resetea al detectar otra textura)
        if (!s.baseHead) {
            try {
                const k = Math.max(1, Math.round(src.image.width / 64));
                const c = document.createElement('canvas');
                c.width = 64 * k; c.height = 16 * k;
                c.getContext('2d').drawImage(src.image, 0, 0, 64 * k, 16 * k, 0, 0, 64 * k, 16 * k);
                s.baseHead = c; s.k = k;
            } catch { return null; }
        }
        if (src.image instanceof HTMLCanvasElement) { s.tex = src; s.canvas = src.image; return s; }
        // montar canvas editable propio (solo la primera vez; después el
        // material ya apunta a nuestro canvas)
        if (!s.canvas) {
            const c = document.createElement('canvas');
            c.width = src.image.width; c.height = src.image.height;
            c.getContext('2d').drawImage(src.image, 0, 0);
            let nt = null;
            try { nt = new src.constructor(c); } catch {}
            if (!nt) { others._sessions.delete(p.key); return null; }
            try {
                nt.magFilter = src.magFilter; nt.minFilter = src.minFilter;
                if (src.colorSpace !== undefined && 'colorSpace' in nt) nt.colorSpace = src.colorSpace;
                nt.flipY = src.flipY; nt.wrapS = src.wrapS; nt.wrapT = src.wrapT;
            } catch {}
            for (const m of mats) { m.map = nt; m.needsUpdate = true; }
            s.tex = nt; s.canvas = c;
        }
        return s;
    }

    // blink sintetizado de un otro: copia la cara 8x8 de su baseHead y
    // tapa los ojos con el tono de piel de su propia cara
    function otherBlinkCanvas(s) {
        if (!s?.baseHead) return null;
        const k = s.k || 1;
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        const cx = c.getContext('2d');
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

    // cara 8x8 de un otro mirando a 'zone' ('left'|'right'|'up'|'down'),
    // sintetizada desde SU cara original: mueve pupilas según la dirección
    // (no necesita sprites del pack — funciona con cualquier skin)
    function otherZoneCanvas(s, zone) {
        if (!s?.baseHead) return null;
        if (!/^(left|right|up|down)$/.test(zone)) return null;
        const k = s.k || 1;
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(s.baseHead, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k, 0, 0, 8, 8);
        try {
            const cheek = cx.getImageData(1, 6, 1, 1).data;
            const skin = [cheek[0], cheek[1], cheek[2]];
            const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
            // leer los ojos originales (y4..5, x1..2 y x5..6) y sus tonos
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
            if (!iris) return c; // ojos no detectados: cara original
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
                const row = cx.getImageData(0, 4, 8, 2); // ojos originales y4..5
                cx.fillStyle = rgb(skin);
                cx.fillRect(1, 4, 2, 2); cx.fillRect(5, 4, 2, 2);
                cx.putImageData(row, 0, 4 + dy);
            }
        } catch {}
        return c;
    }

    // zona de un player según la rotación REAL de su cabeza (headPivot
    // relativo al body — mismos nombres de joint que usa MF_Pose/MF_Studio)
    function otherZone(p) {
        try {
            const m = p.mesh;
            if (!m) return null;
            // BFS corto por el rig: headPivot y body viven anidados en el mesh
            const queue = [m];
            const seen = new WeakSet();
            let head = null, body = null, visited = 0;
            while (queue.length && visited < 500 && !(head && body)) {
                const obj = queue.shift();
                if (!obj || typeof obj !== 'object' || seen.has(obj)) continue;
                seen.add(obj); visited++;
                if (!head && obj.headPivot?.rotation) head = obj.headPivot;
                if (!body && obj.body?.rotation) body = obj.body;
                if (Array.isArray(obj.children)) for (const c of obj.children) queue.push(c);
            }
            if (!head) return null;
            const yaw = wrapPi((Number(head.rotation.y) || 0) - (Number(body?.rotation.y) || 0));
            const pitch = Number(head.rotation.x) || 0;
            const thr = 22; // grados, umbral conservative para zonas
            if (pitch > thr * Math.PI / 180) return 'up';
            if (pitch < -thr * Math.PI / 180) return 'down';
            if (yaw > thr * Math.PI / 180) return 'right';
            if (yaw < -thr * Math.PI / 180) return 'left';
            return 'front';
        } catch { return null; }
    }

    function otherTick() {
        if (!others.on) { others._raf = null; return; }
        const now = performance.now();
        const live = new Set();
        for (const p of otherPlayers()) {
            live.add(p.key);
            const s = otherSession(p);
            if (!s) continue;
            // zona según la rotación real de su cabeza (left/right/up/down)
            const z = otherZone(p) || 'front';
            if (s.zone !== z) { s.zone = z; s.zoneDirty = true; }
            if (!s.nextBlink) s.nextBlink = now + 800 + Math.random() * others.intervalMinMs; // fase random
            if (s.blinkUntil && now >= s.blinkUntil) {
                s.blinkUntil = 0;
                s.nextBlink = now + others.intervalMinMs + Math.random() * Math.max(0, others.intervalMaxMs - others.intervalMinMs);
                s.zoneDirty = true; // al abrir ojos, repintar la zona actual
            } else if (!s.blinkUntil && now >= s.nextBlink && s.zone === 'front') {
                s.blinkUntil = now + 45 + Math.random() * 45;
                const cv = otherBlinkCanvas(s);
                if (cv) {
                    try {
                        const k = s.k || 1, cx = s.canvas.getContext('2d');
                        cx.imageSmoothingEnabled = false;
                        cx.drawImage(cv, 0, 0, 8, 8, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k);
                        cx.clearRect(FACE_OV.x * k, FACE_OV.y * k, FACE_OV.w * k, FACE_OV.h * k); // el hat no tape los ojos
                        s.tex.needsUpdate = true;
                    } catch {}
                }
            } else if (s.zoneDirty && !s.blinkUntil) {
                // pintar la zona a la que mira (o restaurar el frente)
                s.zoneDirty = false;
                const cv = s.zone === 'front' ? null : otherZoneCanvas(s, s.zone);
                try {
                    const k = s.k || 1, cx = s.canvas.getContext('2d');
                    cx.imageSmoothingEnabled = false;
                    if (cv) {
                        cx.drawImage(cv, 0, 0, 8, 8, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k);
                        cx.clearRect(FACE_OV.x * k, FACE_OV.y * k, FACE_OV.w * k, FACE_OV.h * k);
                    } else {
                        cx.drawImage(s.baseHead, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k);
                        cx.drawImage(s.baseHead, FACE_OV.x * k, FACE_OV.y * k, FACE_OV.w * k, FACE_OV.h * k, FACE_OV.x * k, FACE_OV.y * k, FACE_OV.w * k, FACE_OV.h * k);
                    }
                    s.tex.needsUpdate = true;
                } catch {}
            }
        }
        // limpiar sesiones de players que se fueron del mundo
        for (const key of others._sessions.keys()) if (!live.has(key)) others._sessions.delete(key);
        others._raf = requestAnimationFrame(otherTick);
    }

    function othersStart() {
        others.on = true;
        saveOthers();
        if (!others._raf) others._raf = requestAnimationFrame(otherTick);
        renderUI();
        const n = otherPlayers().length;
        console.log(TAG + ' animar a otros ON (' + n + ' player(s) visibles, solo local)');
        return { ok: true, count: n };
    }
    function othersStop() {
        others.on = false;
        if (others._raf) { cancelAnimationFrame(others._raf); others._raf = null; }
        // restaurar TODAS las caras tocadas
        for (const [key, s] of others._sessions) {
            try {
                const k = s.k || 1, cx = s.canvas.getContext('2d');
                cx.imageSmoothingEnabled = false;
                cx.drawImage(s.baseHead, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k, FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k);
                cx.drawImage(s.baseHead, FACE_OV.x * k, FACE_OV.y * k, FACE_OV.w * k, FACE_OV.h * k, FACE_OV.x * k, FACE_OV.y * k, FACE_OV.w * k, FACE_OV.h * k);
                s.tex.needsUpdate = true;
            } catch {}
        }
        others._sessions.clear();
        saveOthers();
        renderUI();
        console.log(TAG + ' animar a otros OFF');
        return { ok: true };
    }

    // ── biblioteca (localStorage) ──
    function loadLibrary() {
        let lib = {};
        try { lib = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch {}
        const out = {};
        for (const [k, v] of Object.entries(lib)) {
            if (Array.isArray(v)) out[k] = { frames: v };        // formato viejo roto
            else if (v && Array.isArray(v.frames)) out[k] = v;   // formato correcto
        }
        state.library = out;
    }
    function saveLibrary() {
        try { localStorage.setItem(LS_KEY, JSON.stringify(state.library)); } catch {}
    }

    // plantillas rápidas para empezar — se adaptan a lo que tengas:
    // si tienes presets dibujados los usan; si no, emociones de Verity
    function buildTemplates() {
        const presets = (window.MF_SkinEditor?.presets?.() || []).map(p => 'p:' + p.name);
        const T = {};
        if (presets.length >= 2) {
            T['alternar presets'] = { frames: [
                { face: presets[0], holdMs: 1200, blendMs: 250 },
                { face: presets[1], holdMs: 1200, blendMs: 250 }
            ] };
            T['ciclo presets'] = { frames: presets.slice(0, 4).map(p => ({ face: p, holdMs: 900, blendMs: 150 })) };
        }
        T['parpadear'] = { frames: [
            { face: 'base', holdMs: 2600, blendMs: 80 },
            { face: 'noface', holdMs: 90, blendMs: 80 },
            { face: 'base', holdMs: 60, blendMs: 80 },
            { face: 'noface', holdMs: 90, blendMs: 80 }
        ] };
        T['serio ↔ serio_1'] = { frames: [
            { face: 'base', holdMs: 1400, blendMs: 300 },
            { face: 'serious_1', holdMs: 1400, blendMs: 300 }
        ] };
        return T;
    }

    // ── UI ──
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
<div class="mff-head"><span class="dot"></span>👀 FACIALES — animaciones de cara en loop
    <span style="font-size:10px;color:#8a8a96;font-weight:400">Shift+F</span>
    <button data-act="close" style="margin-left:auto">✕</button></div>
<div class="mff-tabs">
    <button data-tab="loop" class="on">Loops</button>
    <button data-tab="auto" title="La cara reacciona a dónde miras + parpadeo random">Auto</button>
    <button data-tab="packs" title="Packs de skins con caras animadas (builtin + ZIP)">Packs</button>
</div>
<div class="mff-body" data-page="loop">
  <div class="mff-left">
    <div class="mff-sec">Biblioteca</div>
    <div class="mff-list" id="mff-list"></div>
    <div class="mff-pad mff-row">
      <button id="mff-new" title="Crear nueva facial vacía" style="flex:1">+ Nueva</button>
      <button id="mff-seed" title="Regenerar plantillas con tus presets dibujados actuales">✨</button>
    </div>
  </div>
  <div class="mff-right">
    <div class="mff-sec">Editor de keyframes</div>
    <div class="mff-hint">Cada frame = una cara + cuánto se mantiene + transición. Se repite en loop hasta que pares.</div>
    <div class="mff-pad mff-row" style="margin-bottom:4px">
      <select id="mff-face" title="Cara del keyframe"></select>
      <button id="mff-add" title="Añadir keyframe" style="white-space:nowrap">+ Frame</button>
    </div>
    <div class="mff-frames" id="mff-frames"></div>
  </div>
</div>
<div class="mff-body" data-page="auto" style="display:none">
  <div class="mff-left">
    <div class="mff-sec">Presets por dirección</div>
    <div class="mff-hint">Dibuja los sprites en el editor de skin, guárdalos como presets y asígnalos aquí. Gira la cabeza y la cara cambia sola.</div>
    <div class="mff-autoform" id="mff-autoform"></div>
  </div>
  <div class="mff-right">
    <div class="mff-sec">Parpadeo automático</div>
    <div class="mff-autoform" id="mff-blinkform" style="padding:0 12px"></div>
    <div class="mff-sec">Live</div>
    <div class="mff-pad" id="mff-autolive" style="font:11px 'Consolas',monospace;color:#9a9aa6;line-height:1.8"></div>
  </div>
</div>
<div class="mff-body" data-page="packs" style="display:none">
  <div class="mff-left">
    <div class="mff-sec">Packs faciales</div>
    <div class="mff-hint">Cada pack = skin + sprites (frente / izq / der / blink). Si usas su skin, la cara anima sola.</div>
    <div class="mff-list" id="mff-packs"></div>
    <div class="mff-pad mff-row">
      <button id="mff-packimport" title="Importar pack desde un ZIP (pack.json + PNGs)" style="flex:1">📥 Importar ZIP</button>
      <input type="file" id="mff-packfile" accept=".zip" style="display:none">
    </div>
  </div>
  <div class="mff-right">
    <div class="mff-sec">Pack seleccionado</div>
    <div class="mff-pad" id="mff-packdetail" style="font-size:11px;color:#c8c8d2"></div>
  </div>
</div>
<div class="mff-foot">
  <button id="mff-autotoggle" title="Auto: la cara reacciona al giro de cabeza y parpadea sola">⚡ Auto</button>
  <button id="mff-save" title="Guardar en la biblioteca">💾 Guardar</button>
  <button id="mff-play" title="Reproducir en loop">▶ Loop</button>
  <button id="mff-stop" title="Detener y restaurar">⏹ Stop</button>
  <span id="mff-status" style="font-size:10px;color:#8a8a96;margin-left:auto;align-self:center"></span>
  <button id="mff-del" title="Eliminar facial en edición">🗑</button>
</div>
        `;
        document.body.appendChild(root);
        bindUI(root);
        makeDraggable(root);
    }

    // arrastrar la ventana por la barra de título
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

    // biblioteca de caras disponibles para los keyframes
    function faceOptions() {
        const opts = [{ v: 'base', t: 'base (tu cabeza actual)' }];
        // presets DIBUJADOS por el usuario en el SkinEditor (64x16)
        for (const pr of (window.MF_SkinEditor?.presets?.() || [])) {
            opts.push({ v: 'p:' + pr.name, t: '✏️ ' + pr.name });
        }
        // caras de skins PNG del SkinChanger
        for (const it of (window.MF_SkinChanger?.items || [])) {
            opts.push({ v: 'skin_' + it.name, t: '👕 ' + it.name });
        }
        // sprites de packs (builtin + zip importados)
        for (const p of packIndex) {
            const nm = (p.name || p.id) + (p.custom ? ' (zip)' : '');
            opts.push({ v: 'fs:' + p.id + '/' + p.front, t: '📦 ' + nm + ' frente' });
            opts.push({ v: 'fs:' + p.id + '/' + p.left, t: '📦 ' + nm + ' izquierda' });
            opts.push({ v: 'fs:' + p.id + '/' + p.right, t: '📦 ' + nm + ' derecha' });
            opts.push({ v: 'fs:' + p.id + '/' + p.blink, t: '📦 ' + nm + ' blink' });
        }
        // emociones de FaceSwap (assets de Verity)
        for (const n of (window.MF_FaceSwap?.list?.() || [])) {
            opts.push({ v: n, t: n });
        }
        return opts;
    }

    let editing = null; // name de la facial en edición

    function renderUI() {
        const root = document.getElementById(ID);
        if (!root) return;
        // lista de facials
        const list = root.querySelector('#mff-list');
        list.innerHTML = '';
        const names = Object.keys(state.library);
        if (!names.length) {
            list.innerHTML = '<div style="color:#8a8a96;font-size:11px;padding:4px 2px">Sin facials guardadas — usa una plantilla o crea una</div>';
        }
        for (const n of names) {
            const nf = state.library[n]?.frames?.length ?? 0;
            const it = el('div', 'mff-item' + (state.playing === n ? ' on' : '') + (editing === n ? ' editing' : ''));
            it.innerHTML = `<span class="nm">${n}</span><span class="meta">${nf}f</span>
                <button data-x="edit" title="Editar">✎</button>
                <button data-x="play" title="Reproducir en loop">▶</button>
                <button data-x="del" title="Eliminar">✕</button>`;
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
        // selector de caras
        const fsel = root.querySelector('#mff-face');
        if (fsel) {
            const cur = fsel.value;
            fsel.innerHTML = faceOptions().map(o => `<option value="${o.v}">${o.t}</option>`).join('');
            if (cur) fsel.value = cur;
        }
        // estado en el pie
        const st = root.querySelector('#mff-status');
        if (st) st.textContent = auto.on
            ? '⚡ auto ' + (state.playing ? '(loop pausado)' : '')
            : (state.playing ? '▶ ' + state.playing : (editing ? 'editando: ' + editing : 'nada en reproducción'));
        updateAutoToggle();
        // pestaña auto abierta → refrescar su form
        if (root.querySelector('[data-page="auto"]')?.style.display !== 'none') renderAutoForm();
        // frames en edición
        renderFrames();
    }

    function renderFrames() {
        const root = document.getElementById(ID);
        if (!root) return;
        const box = root.querySelector('#mff-frames');
        if (!editing || !state.library[editing]) {
            box.innerHTML = '<div style="color:#8a8a96;font-size:11px;padding:4px 0">Crea una facial (+ Nueva) o selecciona una de la biblioteca para editar sus frames</div>';
            return;
        }
        box.innerHTML = '';
        const frames = state.library[editing].frames;
        if (!frames.length) {
            box.innerHTML = '<div style="color:#8a8a96;font-size:11px;padding:4px 0">Sin frames — elige una cara y pulsa "+ Frame"</div>';
            return;
        }
        frames.forEach((f, i) => {
            const row = el('div', 'mff-frame');
            row.innerHTML = `
<select data-k="face">${faceOptions().map(o => `<option value="${o.v}" ${o.v === f.face ? 'selected' : ''}>${o.t}</option>`).join('')}</select>
<input data-k="holdMs" type="number" min="20" step="20" value="${f.holdMs ?? 400}" title="Mantener (ms)">
<input data-k="blendMs" type="number" min="0" step="20" value="${f.blendMs ?? 0}" title="Transición (ms)">
<img class="thumb" data-thumb="${f.face}" title="Vista previa de la cara" alt="">
<button data-x="rm" title="Quitar frame">✕</button>`;
            row.querySelector('[data-k="face"]').onchange = (e) => { f.face = e.target.value; renderFrames(); };
            row.querySelector('[data-k="holdMs"]').onchange = (e) => { f.holdMs = +e.target.value || 400; };
            row.querySelector('[data-k="blendMs"]').onchange = (e) => { f.blendMs = +e.target.value || 0; };
            row.querySelector('[data-x="rm"]').onclick = () => { frames.splice(i, 1); renderFrames(); };
            box.appendChild(row);
        });
        const total = frames.reduce((s, f) => s + (+f.holdMs || 400) + (+f.blendMs || 0), 0);
        const tot = el('div', '', `<span style="color:#8a8a96;font-size:10px">ciclo: ${total} ms · ${(1000 / Math.max(1, total)).toFixed(2)} loops/s</span>`);
        box.appendChild(tot);
        // miniaturas de las caras (async, no bloquea)
        fillThumbs(box);
    }

    // llena los <img data-thumb> con la cara resuelta
    function fillThumbs(box) {
        box.querySelectorAll('img[data-thumb]').forEach(img => {
            const name = img.dataset.thumb;
            resolveFace(name).then(fr => {
                if (!fr || !img.isConnected) return;
                // recorte de la CARA (8x8 lógico) de cualquier kind, a la
                // resolución del propio frame ('head' HD → k = width/64)
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

    // ── pestaña AUTO: formularios ──
    // opciones de presets: los dibujados (p:) + sprites de packs (fs:)
    // kind: 'dir' → izquierda/derecha/frente · 'blink' → blink
    function presetOptions(sel, kind = 'dir') {
        const names = (window.MF_SkinEditor?.presets?.() || []).map(p => p.name);
        let html = '<option value="" ' + (sel ? '' : 'selected') + '>— (sin cambio)</option>' +
            names.map(n => `<option value="${n}" ${n === sel ? 'selected' : ''}>✏️ ${n}</option>`).join('');
        if (packIndex.length) {
            html += '<optgroup label="Packs faciales">';
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

    // ── pestaña PACKS: lista + detalle ──
    let packSel = null; // id del pack mostrado en el detalle
    function renderPacksTab() {
        const root = document.getElementById(ID);
        if (!root) return;
        const list = root.querySelector('#mff-packs');
        if (!list) return;
        if (packSel && !packIndex.some(p => p.id === packSel)) packSel = null;
        list.innerHTML = '';
        if (!packIndex.length) {
            list.innerHTML = '<div style="color:#8a8a96;font-size:11px;padding:4px 2px">Sin packs — importa un ZIP</div>';
        }
        for (const p of packIndex) {
            const it = el('div', 'mff-item' + (packSel === p.id ? ' editing' : ''));
            const tag = p.server ? 'server' : (p.custom ? 'zip' : 'custom');
            it.innerHTML = `<span class="nm">${p.name || p.id}${p.custom ? ' <span class="meta">(zip)</span>' : ''}</span>
                <span class="meta">${tag}</span>`;
            it.onclick = () => { packSel = p.id; renderPacksTab(); };
            list.appendChild(it);
        }
        // detalle
        const det = root.querySelector('#mff-packdetail');
        if (det) {
            const p = packIndex.find(x => x.id === packSel);
            if (!p) {
                det.innerHTML = '<span style="color:#8a8a96">Selecciona un pack de la lista</span>';
            } else {
                const cur = currentSkinId();
                det.innerHTML = `
<div style="font-weight:700;font-size:13px;margin-bottom:2px">${p.name || p.id}</div>
<div style="color:#8a8a96;margin-bottom:8px">id: ${p.id}${p.author ? ' · por ' + p.author : ''} · v${p.version || 1} · ${p.server ? 'skin del server (activa al ponértela en el armario)' : p.custom ? 'ZIP importado' : 'custom (mypacks)'}</div>
<div class="mff-row" style="flex-wrap:wrap">
  <button data-pk="apply" title="Poner la skin del pack (solo builtin)">👕 Usar skin</button>
  <button data-pk="auto" title="Activar el modo auto con los sprites de este pack">⚡ Activar</button>
  <button data-pk="export" title="Descargar el pack como ZIP (pack.json + PNGs)">📤 Exportar ZIP</button>
  ${p.custom ? '<button data-pk="del" title="Eliminar el pack importado">🗑</button>' : ''}
</div>
<div style="color:#8a8a96;margin-top:8px;font-size:10px">${cur === p.id ? '✓ esta skin está puesta — la cara anima sola' : 'la cara anima cuando la skin ' + p.id + ' esté en uso'}</div>`;
                det.querySelector('[data-pk="apply"]').onclick = async () => {
                    if (p.server) {
                        // skin DEL SERVER: el juego ya la conoce — aplicar por
                        // su propio conducto (armario) para que también quede
                        // en la cuenta. El modo auto arranca al detectar el id.
                        alert('"' + (p.name || p.id) + '" es una skin del server:\nponla desde el armario del juego (dressing room).\nLa cara animada se activa sola al detectar la skin.');
                        return;
                    }
                    try {
                        // conducto NATIVO del juego: id mfpack:<id> → el
                        // skinManager lo registra con ratio/materiales
                        // correctos; el servidor no ve el id
                        await applyPackSkinToGame(p.id);
                        renderPacksTab();
                    } catch (e) { alert('no se pudo aplicar: ' + e.message); }
                };
                det.querySelector('[data-pk="auto"]').onclick = async () => {
                    // forzar el pack elegido aunque la skin no coincida
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
                    if (!confirm('¿Eliminar el pack "' + (p.name || p.id) + '"?')) return;
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
                field('front', '⬆ frente') +
                field('left', '⬅ mirar izq') +
                field('right', '➡ mirar der') +
                field('up', '⬆ mirar arriba') +
                field('down', '⬇ mirar abajo') +
                `<div class="mff-field"><label>umbral giro</label>
<input type="number" min="5" max="120" step="5" value="${auto.yawThreshold}" data-auton="yawThreshold" title="Grados de yaw para activar (default 10)"></div>` +
                `<div class="mff-field"><label>umbral vert</label>
<input type="number" min="5" max="80" step="5" value="${auto.pitchThreshold}" data-auton="pitchThreshold" title="Grados de pitch para activar (default 10)"></div>`;
            form.querySelectorAll('[data-auto]').forEach(s => s.onchange = () => {
                auto[s.dataset.auto] = s.value; saveAuto();
                auto._zone = null; // forzar repintar con el nuevo preset
            });
            form.querySelectorAll('[data-auton]').forEach(i => i.onchange = () => {
                auto[i.dataset.auton] = Math.max(5, +i.value || 10); saveAuto();
            });
        }
        const bf = root.querySelector('#mff-blinkform');
        if (bf) {
            bf.innerHTML = `
<div class="mff-check"><input type="checkbox" id="mff-blinkon" ${auto.blink ? 'checked' : ''}>
  <label for="mff-blinkon">Parpadear solo con intervalo random</label></div>
<div class="mff-field"><label>ojos cerrados</label>
<select data-auto="blinkClosed">${presetOptions(auto.blinkClosed, 'blink')}</select></div>
<div class="mff-field"><label>cada mín (s)</label>
<input type="number" min="0.5" max="30" step="0.5" value="${(auto.blinkMinMs / 1000).toFixed(1)}" data-blink="min"></div>
<div class="mff-field"><label>cada máx (s)</label>
<input type="number" min="1" max="60" step="0.5" value="${(auto.blinkMaxMs / 1000).toFixed(1)}" data-blink="max"></div>
<div class="mff-check"><input type="checkbox" id="mff-browon" ${auto.brow ? 'checked' : ''}>
  <label for="mff-browon">🤨 levantar la ceja al ver un "?" en el chat</label></div>
<div class="mff-field"><label>ceja (opcional)</label>
<select data-auto="browFace">${presetOptions(auto.browFace, 'ceja')}</select></div>
<div class="mff-field"><label>duración (s)</label>
<input type="number" min="0.3" max="5" step="0.1" value="${(auto.browMs / 1000).toFixed(1)}" data-brow="ms"></div>
<div class="mff-check"><input type="checkbox" id="mff-otherson" ${others.on ? 'checked' : ''}>
  <label for="mff-otherson">👥 animar a otros (blink local, machinima)</label></div>
<div class="mff-field"><label>otros mín (s)</label>
<input type="number" min="0.5" max="30" step="0.5" value="${(others.intervalMinMs / 1000).toFixed(1)}" data-others="min"></div>
<div class="mff-field"><label>otros máx (s)</label>
<input type="number" min="1" max="60" step="0.5" value="${(others.intervalMaxMs / 1000).toFixed(1)}" data-others="max"></div>`;
            const chk = bf.querySelector('#mff-blinkon');
            if (chk) chk.onchange = () => { auto.blink = chk.checked; saveAuto(); };
            const sel = bf.querySelector('[data-auto="blinkClosed"]');
            if (sel) sel.onchange = () => {
                auto.blinkClosed = sel.value; saveAuto();
                state.frameCache.delete('p:' + sel.value);
                auto._blinkCache = null; // recargar el canvas de ojos cerrados
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

    // panel "Live" de la pestaña auto: ángulos y preset activo en vivo
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
            const preset = z === 'front' ? (auto.front || '(frente actual)') : (auto[z] || '(sin preset)');
            rows.push('zona: ' + z + ' → ' + preset);
        } else {
            rows.push('(entra al mundo para ver ángulos)');
        }
        if (auto.blink) {
            const next = Math.max(0, (auto._nextBlink - performance.now()) / 1000).toFixed(1);
            rows.push('próx parpadeo: ' + (auto.on ? next + ' s' : '—'));
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
            const preset = z === 'front' ? (auto.front || '(frente actual)') : (auto[z] || '(sin preset)');
            rows.push('zona: ' + z + ' → ' + preset);
        }
        if (auto.blink && auto.on) {
            const next = Math.max(0, (auto._nextBlink - performance.now()) / 1000).toFixed(1);
            rows.push('próx parpadeo: ' + next + ' s');
        }
        live.innerHTML = rows.join('<br>');
    }

    function loadEditor(name) {
        editing = name;
        renderUI();
    }

    // si no hay facial seleccionada, coge la primera (o la que esté sonando)
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
        // pestañas
        root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
            root.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
            root.querySelectorAll('.mff-body').forEach(pg =>
                pg.style.display = (pg.dataset.page === b.dataset.tab) ? 'flex' : 'none');
            if (b.dataset.tab === 'auto') renderAutoForm();
        });
        // toggle auto
        const at = root.querySelector('#mff-autotoggle');
        if (at) at.onclick = async () => {
            if (auto.on) { autoStop(); skinWatch.userOff = true; }
            else { const r = await autoStart(); if (!r.ok) alert(r.error); }
            saveAuto(); // persistir la intención del usuario
            updateAutoToggle();
        };
        root.querySelector('#mff-new').onclick = () => {
            const n = prompt('Nombre de la nueva facial:', 'mi facial');
            if (!n) return;
            if (state.library[n]) { alert('ya existe'); return; }
            state.library[n] = { frames: [] };
            saveLibrary();
            editing = n;
            renderUI();
        };
        root.querySelector('#mff-add').onclick = () => {
            if (!ensureEditing()) { alert('crea una facial primero con "+ Nueva"'); return; }
            const face = root.querySelector('#mff-face').value || 'base';
            state.library[editing].frames.push({ face, holdMs: 400, blendMs: 0 });
            saveLibrary();
            renderUI();
        };
        root.querySelector('#mff-save').onclick = () => {
            if (!ensureEditing()) { alert('crea una facial primero'); return; }
            saveLibrary();
            renderUI();
        };
        root.querySelector('#mff-play').onclick = async () => {
            if (!ensureEditing()) { alert('crea una facial primero'); return; }
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
        // packs: import ZIP
        const pfile = root.querySelector('#mff-packfile');
        const pbtn = root.querySelector('#mff-packimport');
        if (pbtn) {
            pbtn.onclick = () => pfile?.click();
            if (pfile) pfile.onchange = async () => {
                const f = pfile.files?.[0];
                pfile.value = '';
                if (!f) return;
                pbtn.textContent = '⏳ importando…';
                pbtn.disabled = true;
                try {
                    const p = await importPackZip(f);
                    packSel = p.id;
                    renderPacksTab();
                    alert('pack "' + (p.name || p.id) + '" importado ✓\n(skin aplicada y cara animada activa)');
                } catch (e) {
                    alert('import ZIP: ' + e.message);
                } finally {
                    pbtn.textContent = '📥 Importar ZIP';
                    pbtn.disabled = false;
                }
            };
        }
        // tab packs → refrescar lista al abrirla
        const ptab = root.querySelector('[data-tab="packs"]');
        if (ptab) ptab.addEventListener('click', renderPacksTab);
        updateAutoToggle();
    }

    // marca el botón ⚡ Auto según el estado
    function updateAutoToggle() {
        const at = document.querySelector('#' + ID + ' #mff-autotoggle');
        if (at) at.classList.toggle('on', auto.on);
    }

    function open() {
        if (state.open) { renderUI(); return; }
        state.open = true;
        loadLibrary(); state.dirty = false;
        loadAuto();
        // sembrar plantillas la primera vez (o si no hay nada válido)
        if (!Object.keys(state.library).length) {
            state.library = { ...buildTemplates() };
            saveLibrary();
        }
        buildUI();
        ensureEditing(); // dejar la primera facial ya seleccionada
    }

    function close() {
        document.getElementById(ID)?.remove();
        document.getElementById(ID + '-style')?.remove();
        state.open = false;
    }

    // ── API ──
    window.MF_Facial = {
        open, close,
        play, stop,
        loadLibrary, saveLibrary,
        get library() { return state.library; },
        get playing() { return state.playing; },
        // auto-presets reactivos (giro de cabeza + parpadeo random)
        get autoOn() { return auto.on; },
        autoStart, autoStop,
        get autoConfig() { return auto; },
        setAutoConfig(patch) {
            Object.assign(auto, patch);
            saveAuto();
            auto._zone = null;      // forzar repintar la zona
            auto._blinkCache = null; // recargar blink si cambió
            renderAutoForm();
            return { ok: true };
        },
        // plantillas adaptadas a los presets dibujados actuales
        seedTemplates() {
            state.library = { ...state.library, ...buildTemplates() };
            saveLibrary();
            renderUI();
            return { ok: true };
        },
        // packs faciales (builtin + ZIP importados)
        get packs() { return packIndex.map(p => ({ ...p })); },
        importPackZip, exportPackZip,
        deletePack: async function (id) {
            await packsDbDel(id);
            customPacks.delete(id);
            if (skinWatch.lastApplied === id) skinWatch.lastApplied = null;
            rebuildPackIndex();
            return { ok: true };
        }
    };
    window.__MF_Facial = true;

    // ── independencia del Studio ──
    // 1) Hotkey global: Shift+F abre/cierra el panel (no requiere Studio)
    window.addEventListener('keydown', (ev) => {
        if (ev.shiftKey && (ev.key === 'F' || ev.key === 'f')) {
            const t = ev.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            ev.preventDefault();
            state.open ? close() : open();
        }
    });

    // 2) Autostart: reanudar la última facial que sonaba (persistido)
    const LS_LAST = LS_KEY + '_last';
    try {
        loadAuto();
        const last = localStorage.getItem(LS_LAST);
        const wantAuto = auto.on; // el modo auto también se reanuda
        if (last || wantAuto) loadLibrary();
        if (wantAuto || (last && state.library[last])) {
            // esperar a que el jugador esté en el mundo
            const boot = setInterval(() => {
                if (state.playing || auto._raf) { clearInterval(boot); return; }
                try {
                    const g = getGame();
                    if (g?.player?.mesh) {
                        clearInterval(boot);
                        if (wantAuto) { auto.on = false; autoStart().then(r => { if (r.ok) console.log(TAG + ' autostart: auto-presets'); }); }
                        else if (last && state.library[last]) {
                            play(last).then(r => {
                                if (r.ok) console.log(TAG + ' autostart: ' + last);
                            });
                        }
                    }
                } catch {}
            }, 1500);
            setTimeout(() => clearInterval(boot), 60000);
        }
    } catch {}

    // autostart de "animar a otros" (persistido como auto)
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

    // 3) Monitor de PACKS faciales: si el juego está usando una skin con
    //    pack en skins/facialskins/, activa el modo auto con sus sprites.
    //    Detecta el id de la skin actual (profile.cosmetics.skin o
    //    model.skin) y mapea a los PNG del pack.
    const skinWatch = { timer: null, lastApplied: null, userOff: false, busy: false };
    async function applyPackForSkin(force = false) {
        if (skinWatch.busy) return null;
        skinWatch.busy = true;
        try {
            const skinId = currentSkinId();
            if (!skinId) return null;
            // match por uuid (pack.json "uuid") primero: el pack se aplica
            // aunque la skin del server sea otra. Los packs custom además
            // registran su skin (mfpack:) para el conducto nativo.
            const uid = currentPlayerUuid();
            let pack = uid ? packIndex.find(p => p.uuid === uid) : null;
            if (pack && pack.id !== skinId) {
                if (!force && skinWatch.lastApplied === pack.id) return null;
                try { await applyPackSkinToGame(pack.id); } catch (e) { debugBrow('uuid skin: ' + (e?.message || e)); }
            } else {
                pack = packIndex.find(p => p.id === skinId);
            }
            if (!pack) { skinWatch.lastApplied = null; return null; }
            const pid = pack.id;
            if (!force && skinWatch.lastApplied === pid) return null;

            // resolver el archivo de "frente" (varía por pack)
            let frontFile = pack.front || null;
            if (!frontFile) {
                const hit = await loadPackFront(pid);
                if (!hit) return null;
                frontFile = hit.usedName;
                pack.front = frontFile; // cache para la próxima
            }

            // esperar a que exista el mesh del player para poder pintar
            let tries = 0;
            while (tries++ < 20 && !getMesh()) await new Promise(r => setTimeout(r, 250));
            if (!getMesh()) return null;

            // aplicar los presets del pack al modo auto y encenderlo
            auto.front = 'fs:' + pid + '/' + frontFile;
            auto.left = 'fs:' + pid + '/' + pack.left;
            auto.right = 'fs:' + pid + '/' + pack.right;
            auto.up = pack.up ? 'fs:' + pid + '/' + pack.up : '';
            auto.down = pack.down ? 'fs:' + pid + '/' + pack.down : '';
            auto.browFace = pack.brow ? 'fs:' + pid + '/' + pack.brow : '';
            auto.brow = !!pack.brow; // el pack trae ceja → modo 🤨 ON
            auto.blinkClosed = 'fs:' + pid + '/' + pack.blink;
            auto.blink = true;
            saveAuto();
            skinWatch.lastApplied = pid;
            skinWatch.userOff = false; // skin nueva → reactivar aunque lo apagaran
            const r = await autoStart();
            if (r.ok) console.log(TAG + ' pack "' + pid + '"' + (pid !== skinId ? ' (uuid ' + uid + ')' : '') + ' → auto facial (' + frontFile + '/izquierda/derecha/' + (pack.up ? 'arriba/' : '') + (pack.down ? 'abajo/' : '') + 'blink' + (pack.brow ? '/ceja🤨' : '') + ') · brow=' + auto.brow + ' browFace=' + (auto.browFace || '(sintetizada)') + ' browMs=' + auto.browMs);
            return r;
        } finally { skinWatch.busy = false; }
    }

    skinWatch.timer = setInterval(() => {
        if (skinWatch.busy) return;
        fetchApiSkin().then(() => { // refrescar la skin de la cuenta primero
            // auto-activado por uuid: pack.json con "uuid" que coincida con
            // el player local → aplicar ESE pack (gana al match por skin-id)
            if (!auto.on && !skinWatch.userOff) {
                const uid = currentPlayerUuid();
                const byUuid = uid ? packIndex.find(p => p.uuid === uid) : null;
                if (byUuid && skinWatch.lastApplied !== byUuid.id) {
                    console.log(TAG + ' uuid ' + uid + ' → pack "' + byUuid.id + '"');
                    applyPackForSkin(true).catch(() => {});
                    return;
                }
            }
            const sid = currentSkinId();
            if (!sid) return;
            // cambiar de skin con pack → skin SIN pack: apagar y restaurar
            if (auto.on && skinWatch.lastApplied && skinWatch.lastApplied !== sid &&
                !packIndex.some(p => p.id === sid)) {
                skinWatch.lastApplied = null;
                autoStop(true); // restaura la textura
                return;
            }
            if (!auto.on) {
                // respetar un apagado manual mientras la skin no cambie
                if (!skinWatch.userOff && skinWatch.lastApplied !== sid) applyPackForSkin().catch(() => {});
            } else if (sid !== skinWatch.lastApplied) {
                applyPackForSkin(true).catch(() => {});
            }
        });
    }, 4000);
    // primer chequeo al entrar al mundo (precarga la skin de la API)
    const packBoot = setInterval(() => {
        if (getMesh() && currentSkinId()) {
            clearInterval(packBoot);
            fetchApiSkin(0).finally(() => applyPackForSkin().catch(() => {}));
        }
    }, 1000);
    setTimeout(() => clearInterval(packBoot), 120000);
    // índice de packs: builtin (pack.json fetch) + custom (IndexedDB).
    // El primer chequeo del monitor espera a que el índice esté listo.
    const packsReady = Promise.all([
        loadBuiltinPacks().catch(() => {}),
        loadCustomPacks().catch(() => {})
    ]);
    packsReady.then(() => applyPackForSkin().catch(() => {}));

    // registrar la última reproducida
    {
        const origPlay = window.MF_Facial.play;
        window.MF_Facial.play = async function (name) {
            try { localStorage.setItem(LS_LAST, name); } catch {}
            return origPlay(name);
        };
    }

    console.log(TAG + ' listo (independiente). Shift+F o MF_Facial.open() — animaciones de cara en loop.');
})();
