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
            return w === 64 && (h === 64 || h === 32);
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
                    const c = document.createElement('canvas');
                    c.width = 8; c.height = 8;
                    const ctx = c.getContext('2d');
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);
                    return { canvas: c, kind: 'face' };
                }
                return null;
            }
            if (/^fs:/.test(name)) {
                // cara de un PACK facial (skins/facialskins/<id>/<file>.png).
                // El PNG es la franja de cabeza 32x16 (2:1, cualquier escala)
                // → se pinta como cuadrante base sobre la cabeza 64x16
                // (mantiene la capa overlay derecha) y la cara cae en (8,8).
                const slash = name.indexOf('/');
                if (slash < 0) return null;
                const id = name.slice(3, slash), file = name.slice(slash + 1);
                const url = extAssetUrl(PACKS_DIR + id + '/' + file + '.png');
                if (!url) return null; // sin base de assets todavía
                const img = await loadImg(url).catch(() => null);
                if (!img) return null;
                const c = document.createElement('canvas');
                c.width = 64; c.height = 16;
                const ctx = c.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                if (state.baseHead) ctx.drawImage(state.baseHead, 0, 0);
                ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 32, 16);
                return { canvas: c, kind: 'head' };
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

    function loadPackImg(id, file) {
        const key = id + '/' + file;
        if (packImgCache.has(key)) return packImgCache.get(key);
        const url = extAssetUrl(PACKS_DIR + id + '/' + file + '.png');
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
        try {
            const sc = window.MF_SkinChanger?.current;
            if (typeof sc === 'string' && sc) {
                return sc.split('/').pop().replace(/\.png$/i, '').toLowerCase();
            }
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
                const id = c.split('/').pop().replace(/\.png$/i, '').toLowerCase();
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

    // índice de packs disponibles: [{id, front, blink, left, right}]
    const packIndex = [];
    function buildPackIndex() {
        packIndex.length = 0;
        const dirs = [
            'adele', 'adventure', 'aether', 'alice', 'apex', 'ariel', 'aurora',
            'banana', 'bob', 'cat', 'celeste', 'ethan'
        ];
        for (const id of dirs) packIndex.push({ id, blink: 'blink', left: 'izquierda', right: 'derecha' });
        return packIndex;
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
        // skin: la base anterior ya no corresponde a la actual)
        const skinIdNow = currentSkinId();
        if (!state.baseHead || state.baseHeadSkin !== skinIdNow) {
            try {
                const c = document.createElement('canvas');
                c.width = 64; c.height = 16;
                c.getContext('2d').drawImage(src.image, 0, 0, 64, 16, 0, 0, 64, 16);
                state.baseHead = c;
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
    // kind 'head' → cabeza completa 64x16 (preset dibujado)
    // kind 'face' → solo la región de cara 8x8.
    //   IMPORTANTE: la capa overlay (hat, x=40) se renderiza ENCIMA de la
    //   base → siempre se limpia la región de cara del overlay para que no
    //   tape la cara animada. (Pintarla ahí produce un flash de "expansión"
    //   por el inflate del hat layer, así que solo se vacía.)
    function paintFace(frame) {
        const canvas = ensureSession();
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        if (frame.kind === 'head') {
            ctx.clearRect(0, 0, 64, 16);
            ctx.drawImage(frame.canvas, 0, 0, 64, 16, 0, 0, 64, 16);
        } else {
            ctx.clearRect(FACE.x, FACE.y, FACE.w, FACE.h);
            ctx.drawImage(frame.canvas, 0, 0, 8, 8, FACE.x, FACE.y, FACE.w, FACE.h);
        }
        // vaciar SOLO la cara del overlay (8x8 en 40,8). El hat layer se
        // renderiza ENCIMA de la base con inflate → si la skin tiene
        // píxeles opacos ahí (cara pintada en el hat), tapan la cara
        // animada (base) por completo. El resto del hat (pelo de arriba,
        // lados, atrás) NO se toca, y stop() restaura la cabeza entera.
        ctx.clearRect(FACE_OV.x, FACE_OV.y, FACE_OV.w, FACE_OV.h);
        state.tex.needsUpdate = true;
    }

    // mezcla dos frames por alpha (blend suave entre keyframes)
    function blendFrames(a, b, t) {
        const c = document.createElement('canvas');
        c.width = a.canvas.width; c.height = a.canvas.height;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(a.canvas, 0, 0);
        ctx.globalAlpha = t;
        ctx.drawImage(b.canvas, 0, 0, a.canvas.width, a.canvas.height);
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
        auto._refYaw = null; auto._refPitch = null; auto._lastT = 0;
    }
    function saveAuto() {
        try {
            localStorage.setItem(LS_AUTO, JSON.stringify({
                on: auto.on, yawThreshold: auto.yawThreshold, pitchThreshold: auto.pitchThreshold,
                front: auto.front, left: auto.left, right: auto.right, up: auto.up, down: auto.down,
                blink: auto.blink, blinkClosed: auto.blinkClosed,
                blinkMinMs: auto.blinkMinMs, blinkMaxMs: auto.blinkMaxMs
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
    //   1. preset asignado (blinkClosed) → su cara 8x8 (si el preset es de
    //      cabeza 64x16 se recorta la región de cara)
    //   2. sintetizado: copia la cara de la ZONA ACTUAL y tapa los ojos con
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
                const c = document.createElement('canvas');
                c.width = 8; c.height = 8;
                const cx = c.getContext('2d');
                cx.imageSmoothingEnabled = false;
                if (fr.kind === 'head') cx.drawImage(fr.canvas, FACE.x, FACE.y, FACE.w, FACE.h, 0, 0, 8, 8);
                else cx.drawImage(fr.canvas, 0, 0, 8, 8, 0, 0, 8, 8);
                return c;
            }
            if (state.baseHead) {
                const c = document.createElement('canvas');
                c.width = 8; c.height = 8;
                const cx = c.getContext('2d');
                cx.imageSmoothingEnabled = false;
                cx.drawImage(state.baseHead, FACE.x, FACE.y, FACE.w, FACE.h, 0, 0, 8, 8);
                return c;
            }
            return null;
        };

        try {
            // 1) preset de ojos cerrados elegido por el usuario
            if (auto.blinkClosed) {
                const fr = await resolveFace(resolveAutoName(auto.blinkClosed)).catch(() => null);
                if (fr) {
                    const c = document.createElement('canvas');
                    c.width = 8; c.height = 8;
                    const cx = c.getContext('2d');
                    cx.imageSmoothingEnabled = false;
                    if (fr.kind === 'head') cx.drawImage(fr.canvas, FACE.x, FACE.y, FACE.w, FACE.h, 0, 0, 8, 8);
                    else cx.drawImage(fr.canvas, 0, 0, 8, 8, 0, 0, 8, 8);
                    auto._blinkCache = c; auto._blinkCacheZone = zone;
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
                return face;
            }
        } catch {}
        return null;
    }

    function scheduleBlink(now) {
        auto._nextBlink = now + auto.blinkMinMs + Math.random() * Math.max(0, auto.blinkMaxMs - auto.blinkMinMs);
    }

    function autoTick() {
        if (!auto.on) { auto._raf = null; return; }
        const now = performance.now();

        // parpadeo: ventana corta de ojos cerrados; al terminar SIEMPRE se
        // repinta la cara de la zona actual (aunque el yaw no haya cambiado)
        if (auto.blink) {
            if (auto._blinkUntil && now >= auto._blinkUntil) {
                auto._blinkUntil = 0;
                scheduleBlink(now);
                paintZone(auto._zone || 'front', true); // restaurar ya
            } else if (!auto._blinkUntil && now >= auto._nextBlink) {
                auto._blinkUntil = now + 45 + Math.random() * 45; // 45-90 ms
                getBlinkCanvas().then(cv => {
                    // pintar SOLO si el canvas ya está listo y la ventana sigue abierta
                    if (cv && auto.on && auto._blinkUntil && performance.now() < auto._blinkUntil) {
                        paintFace({ canvas: cv, kind: 'face' });
                    }
                });
            }
        }

        // reacción al giro de cabeza: evaluar zona CADA tick (barato) y solo
        // repintar cuando la zona cambia (con histéresis evita el jitter)
        const angles = lookAngles();
        if (angles) {
            const z = zoneOf(angles);
            if (z !== auto._zone && !auto._blinkUntil) paintZone(z);
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
        if (restore && state.baseHead && state.tex) {
            try { paintFace({ canvas: state.baseHead, kind: 'head' }); } catch {}
        }
        renderUI();
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
                // recorte de la CARA (8x8) de cualquier kind para el thumb
                const c = document.createElement('canvas');
                c.width = 8; c.height = 8;
                const cx = c.getContext('2d');
                cx.imageSmoothingEnabled = false;
                if (fr.kind === 'head') cx.drawImage(fr.canvas, 8, 8, 8, 8, 0, 0, 8, 8);
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
            html += '<optgroup label="Packs (skins/facialskins)">';
            for (const p of packIndex) {
                const front = p.front || 'alfrente';
                const opts = kind === 'blink'
                    ? [`fs:${p.id}/${p.blink}`]
                    : [`fs:${p.id}/${front}`, `fs:${p.id}/${p.left}`, `fs:${p.id}/${p.right}`];
                for (const v of opts) {
                    const label = v.split('/').pop();
                    html += `<option value="${v}" ${v === sel ? 'selected' : ''}>📦 ${p.id}/${label}</option>`;
                }
            }
            html += '</optgroup>';
        }
        return html;
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
<input type="number" min="1" max="60" step="0.5" value="${(auto.blinkMaxMs / 1000).toFixed(1)}" data-blink="max"></div>`;
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
            if (!force && skinWatch.lastApplied === skinId) return null;
            const pack = packIndex.find(p => p.id === skinId);
            if (!pack) { skinWatch.lastApplied = null; return null; }

            // resolver el archivo de "frente" (varía por pack)
            let frontFile = pack.front || null;
            if (!frontFile) {
                const hit = await loadPackFront(skinId);
                if (!hit) return null;
                frontFile = hit.usedName;
                pack.front = frontFile; // cache para la próxima
            }

            // esperar a que exista el mesh del player para poder pintar
            let tries = 0;
            while (tries++ < 20 && !getMesh()) await new Promise(r => setTimeout(r, 250));
            if (!getMesh()) return null;

            // aplicar los presets del pack al modo auto y encenderlo
            auto.front = 'fs:' + skinId + '/' + frontFile;
            auto.left = 'fs:' + skinId + '/' + pack.left;
            auto.right = 'fs:' + skinId + '/' + pack.right;
            auto.blinkClosed = 'fs:' + skinId + '/' + pack.blink;
            auto.blink = true;
            saveAuto();
            skinWatch.lastApplied = skinId;
            skinWatch.userOff = false; // skin nueva → reactivar aunque lo apagaran
            const r = await autoStart();
            if (r.ok) console.log(TAG + ' pack "' + skinId + '" detectado → auto facial (' + frontFile + '/izquierda/derecha/blink)');
            return r;
        } finally { skinWatch.busy = false; }
    }

    skinWatch.timer = setInterval(() => {
        if (skinWatch.busy) return;
        fetchApiSkin().then(() => { // refrescar la skin de la cuenta primero
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
    buildPackIndex();

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
