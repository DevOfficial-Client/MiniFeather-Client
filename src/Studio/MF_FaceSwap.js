// MF_FaceSwap.js — Cambio de textura de la cara del jugador/actores en un
// punto determinado (por trigger manual o por tick de una escena film).
//
// Cómo funciona:
// - Las skins de MC/miniblox son una textura única (64x64 o 64x32) donde la
//   cara es una región fija: head frontal = (8,8)-(16,16) y su capa overlay
//   = (40,8)-(48,16).
// - Se compone una NUEVA textura en un <canvas>: skin base + región de cara
//   de la textura de emoción (o un PNG 8x8+ de la carpeta de assets).
// - Hot-swap: mesh.material.map = nuevaTextura (THREE.CanvasTexture) +
//   material.needsUpdate. Instantáneo, reversible, sin tocar estado del juego.
// - El estado original se guarda para poder restaurar (revert).
// - Precarga: las texturas se cargan al primer uso y se cachean (Map) para
//   que el swap en el frame del cambio no tenga hitch visual.
//
// Uso (consola o chat una vez registrados los comandos):
//   MF_FaceSwap.set('happy')            // cambia TU cara (jugador local)
//   MF_FaceSwap.revert()                // restaura tu cara original
//   MF_FaceSwap.list()                  // emociones disponibles
//   MF_FaceSwap.preview('happy')        // 3s y revierte solo (prueba rápida)
//   MF_FaceSwap.applyAtTick(240, 'happy')  // trigger para film mode (Fase 3+)
//   MF_FaceSwap.clearTickTriggers()
//
// Caras incluidas: reutiliza las de Verity en client-side mod/entity/
// (happy.png, evil.png, neutral.png, hurt.png, smiling_evil.png, ...).
// Son 8x8 px → se escalan al pintar la región de cara.

(function () {
    'use strict';

    if (window.__MF_FaceSwap) return;
    const TAG = '[MF FaceSwap]';

    // Región de la cara en una skin 64x64 (igual en 64x32: el head no cambia).
    // Head frontal: x 8..16, y 8..16. Overlay (hat): x 40..48, y 8..16.
    const FACE = { x: 8, y: 8, w: 8, h: 8 };
    const FACE_OVERLAY = { x: 40, y: 8, w: 8, h: 8 };
    const TPS = 20; // ticks por segundo (duración default de un trigger = 1s)

    // Archivos de emoción disponibles en la extension (dir de Verity).
    const FACES_DIR = 'client-side mod/entity/';

    const state = {
        enabled: true,
        // nombre -> { img: HTMLImageElement, canvas: HTMLCanvasElement }
        faceCache: new Map(),
        // target -> textura original guardada para revert
        originals: new Map(),
        // triggers de film: [{ tick, face, done }]
        tickTriggers: [],
        // id de rAF si hay preview activo
        previewTimer: null
    };

    // ── Acceso al juego (patrón común del cliente) ──
    function getGame() {
        if (globalThis.miniblox?.player) return globalThis.miniblox;
        try {
            const react = document.querySelector('#react');
            if (react) {
                for (const root of Object.values(react)) {
                    const game = root?.updateQueue?.baseState?.element?.props?.game;
                    if (game?.player) return game;
                }
            }
        } catch {}
        return null;
    }

    // Resuelve la URL de un asset de la extensión. En MAIN world funciona si
    // el recurso está en web_accessible_resources (patrón SplashScreen/meta).
    function assetUrl(relPath) {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
            return chrome.runtime.getURL(relPath);
        }
        // fallback: meta MF-Asset-Base plantado por SplashScreen.js
        const meta = document.querySelector('meta[name="mf-asset-base"]');
        const base = meta?.content;
        if (base) return base.replace(/\/$/, '') + '/' + relPath;
        return null;
    }

    // Carga (y cachea) una imagen de emoción desde los assets.
    function loadFaceImage(name) {
        if (state.faceCache.has(name)) return state.faceCache.get(name).promise;
        const url = assetUrl(FACES_DIR + name + '.png');
        const promise = url
            ? new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    // Normalizar siempre a un canvas 8x8 para pintar directo.
                    const c = document.createElement('canvas');
                    c.width = FACE.w; c.height = FACE.h;
                    const ctx = c.getContext('2d');
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, 0, 0, FACE.w, FACE.h);
                    state.faceCache.set(name, { img, canvas: c });
                    resolve(c);
                };
                img.onerror = () => reject(new Error('no se pudo cargar "' + name + '.png" (' + url + ')'));
                img.src = url;
            })
            : Promise.reject(new Error('sin base de assets de la extensión (¿estás en la página del juego?)'));
        if (!state.faceCache.has(name)) state.faceCache.set(name, { promise });
        return promise;
    }

    // Obtiene el canvas de la skin ACTUAL del mesh (lo que el juego ya cargó).
    function skinCanvasFromTexture(tex) {
        if (!tex) return null;
        const img = tex.image;
        if (!img) return null;
        // Ya es canvas / ImageBitmap / HTMLImageElement cargada
        if (img instanceof HTMLCanvasElement) return img;
        if ((img instanceof HTMLImageElement) && img.complete && img.naturalWidth) {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            c.getContext('2d').drawImage(img, 0, 0);
            return c;
        }
        if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            return c;
        }
        return null;
    }

    // Busca el material de piel del mesh del jugador (el que pinta la skin).
    function findSkinMaterial(mesh) {
        if (!mesh) return null;
        const cands = [];
        if (Array.isArray(mesh.material)) cands.push(...mesh.material);
        else if (mesh.material) cands.push(mesh.material);
        // también hijos (algunos modelos separan cuerpo/capa por mesh)
        for (const c of (mesh.children || [])) {
            if (Array.isArray(c.material)) cands.push(...c.material);
            else if (c.material) cands.push(c.material);
        }
        // preferir el que tenga mapa con proporción de skin (64x64 / 64x32)
        for (const m of cands) {
            const w = m?.map?.image?.width, h = m?.map?.image?.height;
            if (w === 64 && (h === 64 || h === 32)) return m;
        }
        return cands[0] || null;
    }

    // Compone la textura nueva: skin base + cara de la emoción.
    function composeSkin(baseCanvas, faceCanvas, opts) {
        const out = document.createElement('canvas');
        out.width = baseCanvas.width; out.height = baseCanvas.height;
        const ctx = out.getContext('2d');
        ctx.drawImage(baseCanvas, 0, 0);
        ctx.imageSmoothingEnabled = false;
        // Cara principal (head frontal)
        ctx.drawImage(faceCanvas, FACE.x, FACE.y, FACE.w, FACE.h);
        // También el overlay (hat layer) si pide override completo, para que
        // no se vea la cara original asomando por encima.
        if (opts?.overlay !== false) {
            ctx.drawImage(faceCanvas, FACE_OVERLAY.x, FACE_OVERLAY.y, FACE_OVERLAY.w, FACE_OVERLAY.h);
        }
        return out;
    }

    // Punto de entrada: cambia la cara de un target (jugador local por defecto).
    async function applyFace(faceName, opts = {}) {
        if (!state.enabled) throw new Error('FaceSwap deshabilitado');
        const game = getGame();
        if (!game?.player?.mesh) throw new Error('jugador/mesh no disponible todavía');
        const mesh = opts.mesh || game.player.mesh;

        const faceCanvas = await (loadExternalFace(faceName) || loadFaceImage(faceName));
        const mat = findSkinMaterial(mesh);
        if (!mat?.map) throw new Error('no se encontró material de skin en el mesh');

        // Guardar original para revert (una vez por material): copia del
        // canvas (modo directo) + referencia a la textura (modo newtex)
        if (!state.originals.has(mesh)) {
            const origCanvas = mat.map.image instanceof HTMLCanvasElement
                ? (() => {
                    const c = document.createElement('canvas');
                    c.width = mat.map.image.width; c.height = mat.map.image.height;
                    const cx = c.getContext('2d');
                    cx.imageSmoothingEnabled = false;
                    cx.drawImage(mat.map.image, 0, 0);
                    return c;
                })()
                : null;
            state.originals.set(mesh, { map: mat.map, canvas: origCanvas, needsUpdate: true });
        }

        const base = skinCanvasFromTexture(mat.map);
        if (!base) throw new Error('no se pudo leer la skin actual (formato de textura no soportado)');

        // Estrategia sin THREE global: pintar DIRECTO en el canvas de la
        // textura actual del juego (mismo enfoque que MF_SkinEditor) y
        // marcar needsUpdate. miniblox es un bundle sin window.THREE.
        const tex = mat.map;
        const tcanvas = tex.image instanceof HTMLCanvasElement ? tex.image : null;
        if (tcanvas) {
            const ctx = tcanvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(faceCanvas, FACE.x, FACE.y, FACE.w, FACE.h);
            if (opts?.overlay !== false) {
                ctx.drawImage(faceCanvas, FACE_OVERLAY.x, FACE_OVERLAY.y, FACE_OVERLAY.w, FACE_OVERLAY.h);
            }
            tex.needsUpdate = true;
            return { ok: true, face: faceName, mode: 'direct' };
        }

        // Fallback: componer aparte y crear textura nueva con el CONSTRUCTOR
        // de la instancia (patrón del cliente; THREE global no existe aquí)
        const composed = composeSkin(base, faceCanvas, opts);
        const newTex = new tex.constructor(composed);
        newTex.magFilter = tex.magFilter;
        newTex.minFilter = tex.minFilter;
        if (newTex.colorSpace !== undefined && tex.colorSpace !== undefined) newTex.colorSpace = tex.colorSpace;
        newTex.flipY = tex.flipY;
        newTex.wrapS = tex.wrapS; newTex.wrapT = tex.wrapT;
        newTex.repeat.copy(tex.repeat);
        newTex.offset.copy(tex.offset);

        mat.map = newTex;
        mat.needsUpdate = true;
        return { ok: true, face: faceName, mode: 'newtex' };
    }

    // Restaura la textura original del target.
    function revertFace(opts = {}) {
        const game = getGame();
        const mesh = opts.mesh || game?.player?.mesh;
        if (!mesh) return { ok: false, error: 'sin mesh' };
        const saved = state.originals.get(mesh);
        if (!saved) return { ok: false, error: 'no había cambio pendiente' };
        const mat = findSkinMaterial(mesh);
        if (mat) {
            if (saved.canvas && mat.map?.image instanceof HTMLCanvasElement) {
                // modo directo: repintar el canvas guardado sobre el actual
                const ctx = mat.map.image.getContext('2d');
                ctx.clearRect(0, 0, mat.map.image.width, mat.map.image.height);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(saved.canvas, 0, 0);
                mat.map.needsUpdate = true;
            } else if (saved.map) {
                mat.map = saved.map;
                mat.needsUpdate = true;
            }
        }
        state.originals.delete(mesh);
        return { ok: true };
    }

    // Preview temporal: aplica y revierte tras ms (default 3000).
    function previewFace(faceName, ms = 3000) {
        if (state.previewTimer) { clearTimeout(state.previewTimer); state.previewTimer = null; }
        return applyFace(faceName).then(() => {
            state.previewTimer = setTimeout(() => { revertFace(); state.previewTimer = null; }, ms);
            return { ok: true, face: faceName, revertInMs: ms };
        });
    }

    // ── Triggers por tick (para integración con film mode / timeline) ──
    // El reproductor de escenas llamará a onTick(t) en cada tick reproducido.
    // Un trigger puede ser de tipo 'face' (emoción de Verity) o 'head'
    // (preset de cabeza dibujado en el SkinEditor).
    // durationTicks = cuánto dura (para clips editables en el timeline);
    // si otro trigger empieza dentro de esa ventana, lo reemplaza.
    function applyAtTick(tick, name, type, durationTicks) {
        const dur = Math.max(1, Math.round(durationTicks || TPS)); // default 1s
        state.tickTriggers.push({
            tick: Math.max(0, Math.round(tick)),
            face: name,
            type: type === 'head' ? 'head' : type === 'skin' ? 'skin' : type === 'morph' ? 'morph' : 'face',
            durationTicks: dur,
            done: false,
            expired: false
        });
        state.tickTriggers.sort((a, b) => a.tick - b.tick);
        // solapamiento: al crear, un clip que empieza dentro de otro lo corta
        resolveOverlaps();
        return { ok: true, total: state.tickTriggers.length };
    }

    // recorta los triggers para que no se solapen (un clip que EMPIEZA dentro
    // de otro corta al anterior). Se llama al crear o al SOLTAR un drag, no
    // durante el drag (dañaría clips cruzados temporalmente).
    function resolveOverlaps() {
        state.tickTriggers.sort((a, b) => a.tick - b.tick);
        for (let i = 0; i < state.tickTriggers.length - 1; i++) {
            const t = state.tickTriggers[i];
            const next = state.tickTriggers[i + 1];
            if (t.durationTicks == null) continue;
            const end = t.tick + t.durationTicks;
            if (next.tick < end) t.durationTicks = Math.max(1, next.tick - t.tick);
        }
    }
    function onTick(tick) {
        for (const t of state.tickTriggers) {
            // disparo al entrar en la ventana del clip
            if (!t.done && tick >= t.tick) {
                t.done = true;
                if (t.type === 'head') {
                    window.MF_SkinEditor?.applyPreset?.(t.face);
                } else if (t.type === 'skin') {
                    // skin PNG completa (SkinChanger): t.face = 'skin_<name>'
                    window.MF_SkinChanger?.apply?.(t.face.replace(/^skin_/, ''))
                        .catch(e => console.warn(TAG + ' trigger skin tick ' + t.tick + ' fallo: ' + e.message));
                } else if (t.type === 'morph') {
                    // morph a mob (MF_Morph): t.face = 'morph_<type>'
                    try {
                        window.MF_Morph?.apply?.(t.face.replace(/^morph_/, ''));
                    } catch (e) {
                        console.warn(TAG + ' trigger morph tick ' + t.tick + ' fallo: ' + (e?.message || e));
                    }
                } else {
                    applyFace(t.face).catch(e => console.warn(TAG + ' trigger tick ' + t.tick + ' fallo: ' + e.message));
                }
            }
            // expiración: al salir de la ventana, revertir (el clip "termina")
            if (t.done && t.expired == null && t.durationTicks != null && tick > t.tick + t.durationTicks) {
                t.expired = true;
                if (t.type === 'head') {
                    window.MF_SkinEditor?.revert?.();
                } else if (t.type === 'skin') {
                    window.MF_SkinChanger?.revert?.();
                } else if (t.type === 'morph') {
                    window.MF_Morph?.revert?.();
                } else {
                    revertFace();
                }
            }
        }
    }

    // marcar triggers anteriores a un tick como consumidos (reproducción
    // con In-point: no disparar de golpe todo lo que quedó atrás)
    function skipBefore(tick) {
        let n = 0;
        for (const t of state.tickTriggers) {
            if (!t.done && t.tick < tick) { t.done = true; n++; }
        }
        return n;
    }

    // reset para una NUEVA reproducción: los triggers vuelven a estar listos
    // para disparar (hecho antes de cada play del estudio)
    function resetForPlayback() {
        for (const t of state.tickTriggers) { t.done = false; t.expired = false; }
    }

    // ── edición de triggers desde el timeline (clips de V2) ──
    function updateTrigger(i, patch) {
        const t = state.tickTriggers[i];
        if (!t) return { ok: false, error: 'trigger ' + i + ' no existe' };
        if (patch.tick != null) t.tick = Math.max(0, Math.round(patch.tick));
        if (patch.durationTicks != null) t.durationTicks = Math.max(1, Math.round(patch.durationTicks));
        if (patch.face != null) t.face = patch.face;
        state.tickTriggers.sort((a, b) => a.tick - b.tick);
        return { ok: true, trigger: t };
    }

    function removeTrigger(i) {
        if (i < 0 || i >= state.tickTriggers.length) return { ok: false };
        state.tickTriggers.splice(i, 1);
        return { ok: true };
    }

    function clearTickTriggers() {
        state.tickTriggers = [];
        return { ok: true };
    }

    // Lista de caras disponibles en los assets (nombres conocidos de Verity).
    const KNOWN_FACES = [
        'happy', 'happy_sleep', 'happy_talking', 'neutral', 'neutral_talking',
        'evil', 'evil_talking', 'smiling_evil', 'hurt', 'serious_1',
        'serious_2', 'serious_3', 'serious_talking', 'noface', 'crazy',
        'crazy_talking', 'flashlight'
    ];

    // ── fuentes externas de caras (p.ej. skins PNG del SkinChanger) ──
    // Una "fuente" aporta caras con imagen propia (dataURL). Se registran
    // con un id de fuente; list() las incluye y applyAtTick las dispara
    // como cualquier emoción (tipo 'skin' aplica la skin PNG completa).
    const SOURCES_DIR = { __proto__: null };

    function registerSource(sourceId, faces) {
        if (!sourceId || !Array.isArray(faces)) return { ok: false };
        SOURCES_DIR[sourceId] = faces.slice();
        return { ok: true, total: faces.length };
    }

    function listSources() {
        const out = [];
        for (const id in SOURCES_DIR) {
            for (const f of SOURCES_DIR[id]) out.push({ source: id, ...f });
        }
        return out;
    }

    // resuelve una cara por nombre buscando primero en fuentes externas
    function loadExternalFace(name) {
        for (const id in SOURCES_DIR) {
            for (const f of SOURCES_DIR[id]) {
                if (f.name === name) {
                    // devuelve un canvas 8x8 recortado de la región de cara
                    return loadImageFromURL(f.dataURL).then(img => {
                        const r = f.region || FACE;
                        const c = document.createElement('canvas');
                        c.width = FACE.w; c.height = FACE.h;
                        const ctx = c.getContext('2d');
                        ctx.imageSmoothingEnabled = false;
                        ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, FACE.w, FACE.h);
                        return c;
                    });
                }
            }
        }
        return null;
    }

    function loadImageFromURL(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('no se pudo cargar imagen'));
            img.src = url;
        });
    }

    window.MF_FaceSwap = {
        get enabled() { return state.enabled; },
        set enabled(v) { state.enabled = !!v; if (!v) revertFace(); },
        set: applyFace,
        revert: revertFace,
        preview: previewFace,
        list() {
            const ext = listSources().map(f => f.name);
            return [...KNOWN_FACES, ...ext];
        },
        applyAtTick,
        onTick,
        skipBefore,
        resetForPlayback,
        updateTrigger,
        removeTrigger,
        resolveOverlaps,
        clearTickTriggers,
        registerSource,
        listSources,
        get triggers() { return state.tickTriggers; },
        // Constantes útiles para el timeline UI
        FACE_REGION: FACE,
        FACE_OVERLAY_REGION: FACE_OVERLAY,
        FACES_DIR
    };
    window.__MF_FaceSwap = true;

    // Escuchar config desde content.js (mundo ISOLATED) — mismo patrón que el
    // resto de features. Solo expone enable/disable por ahora; el GUI de film
    // usará applyAtTick vía CustomEvent cuando exista.
    document.addEventListener('minifeather:faceswap-config', (e) => {
        try {
            const cfg = JSON.parse(e.detail);
            if (typeof cfg.enabled === 'boolean') window.MF_FaceSwap.enabled = cfg.enabled;
        } catch {}
    }, true);

    console.log(TAG + ' listo. MF_FaceSwap.set("happy") para probar. Caras: ' + KNOWN_FACES.length);
})();
