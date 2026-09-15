
(function () {
    'use strict';

    if (window.__MF_FaceSwap) return;
    const TAG = '[MF FaceSwap]';

    const FACE = { x: 8, y: 8, w: 8, h: 8 };
    const FACE_OVERLAY = { x: 40, y: 8, w: 8, h: 8 };
    const TPS = 20; 

    const FACES_DIR = 'assets/content/minifeather-pack/entity/';

    const state = {
        enabled: true,
        
        faceCache: new Map(),
        
        originals: new Map(),
        
        tickTriggers: [],
        
        previewTimer: null
    };

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

    function assetUrl(relPath) {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
            return chrome.runtime.getURL(relPath);
        }
        
        const meta = document.querySelector('meta[name="mf-asset-base"]');
        const base = meta?.content;
        if (base) return base.replace(/\/$/, '') + '/' + relPath;
        return null;
    }

    function loadFaceImage(name) {
        if (state.faceCache.has(name)) return state.faceCache.get(name).promise;
        const url = assetUrl(FACES_DIR + name + '.png');
        const promise = url
            ? new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    
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

    function skinCanvasFromTexture(tex) {
        if (!tex) return null;
        const img = tex.image;
        if (!img) return null;
        
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

    function findSkinMaterial(mesh) {
        if (!mesh) return null;
        const cands = [];
        if (Array.isArray(mesh.material)) cands.push(...mesh.material);
        else if (mesh.material) cands.push(mesh.material);
        
        for (const c of (mesh.children || [])) {
            if (Array.isArray(c.material)) cands.push(...c.material);
            else if (c.material) cands.push(c.material);
        }
        
        for (const m of cands) {
            const w = m?.map?.image?.width, h = m?.map?.image?.height;
            if (w === 64 && (h === 64 || h === 32)) return m;
        }
        return cands[0] || null;
    }

    function composeSkin(baseCanvas, faceCanvas, opts) {
        const out = document.createElement('canvas');
        out.width = baseCanvas.width; out.height = baseCanvas.height;
        const ctx = out.getContext('2d');
        ctx.drawImage(baseCanvas, 0, 0);
        ctx.imageSmoothingEnabled = false;
        
        ctx.drawImage(faceCanvas, FACE.x, FACE.y, FACE.w, FACE.h);
        
        if (opts?.overlay !== false) {
            ctx.drawImage(faceCanvas, FACE_OVERLAY.x, FACE_OVERLAY.y, FACE_OVERLAY.w, FACE_OVERLAY.h);
        }
        return out;
    }

    async function applyFace(faceName, opts = {}) {
        if (!state.enabled) throw new Error('FaceSwap deshabilitado');
        const game = getGame();
        if (!game?.player?.mesh) throw new Error('jugador/mesh no disponible todavía');
        const mesh = opts.mesh || game.player.mesh;

        const faceCanvas = await (loadExternalFace(faceName) || loadFaceImage(faceName));
        const mat = findSkinMaterial(mesh);
        if (!mat?.map) throw new Error('no se encontró material de skin en el mesh');

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
            emitLookFace(faceName); 
            return { ok: true, face: faceName, mode: 'direct' };
        }

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
        emitLookFace(faceName); 
        return { ok: true, face: faceName, mode: 'newtex' };
    }

    function emitLookFace(faceName) {
        try {
            
            Promise.resolve(loadExternalFace(faceName) || loadFaceImage(faceName)).then(c => {
                if (!c) return;
                window.MF_Peer?.sendLook?.({ a: 'face', name: faceName, dataURL: c.toDataURL() });
            }).catch(() => {});
        } catch {}
    }

    function revertFace(opts = {}) {
        const game = getGame();
        const mesh = opts.mesh || game?.player?.mesh;
        if (!mesh) return { ok: false, error: 'sin mesh' };
        const saved = state.originals.get(mesh);
        if (!saved) return { ok: false, error: 'no había cambio pendiente' };
        const mat = findSkinMaterial(mesh);
        if (mat) {
            if (saved.canvas && mat.map?.image instanceof HTMLCanvasElement) {
                
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
        
        try { window.MF_Peer?.sendLook?.({ a: 'revert', what: 'face' }); } catch {}
        return { ok: true };
    }

    function previewFace(faceName, ms = 3000) {
        if (state.previewTimer) { clearTimeout(state.previewTimer); state.previewTimer = null; }
        return applyFace(faceName).then(() => {
            state.previewTimer = setTimeout(() => { revertFace(); state.previewTimer = null; }, ms);
            return { ok: true, face: faceName, revertInMs: ms };
        });
    }

    function applyAtTick(tick, name, type, durationTicks) {
        const dur = Math.max(1, Math.round(durationTicks || TPS)); 
        state.tickTriggers.push({
            tick: Math.max(0, Math.round(tick)),
            face: name,
            type: type === 'head' ? 'head' : type === 'skin' ? 'skin' : type === 'morph' ? 'morph' : 'face',
            durationTicks: dur,
            done: false,
            expired: false
        });
        state.tickTriggers.sort((a, b) => a.tick - b.tick);
        
        resolveOverlaps();
        return { ok: true, total: state.tickTriggers.length };
    }

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
            
            if (!t.done && tick >= t.tick) {
                t.done = true;
                if (t.type === 'head') {
                    window.MF_SkinEditor?.applyPreset?.(t.face);
                } else if (t.type === 'skin') {
                    
                    window.MF_SkinChanger?.apply?.(t.face.replace(/^skin_/, ''))
                        .catch(e => console.warn(TAG + ' trigger skin tick ' + t.tick + ' fallo: ' + e.message));
                } else if (t.type === 'morph') {
                    
                    try {
                        window.MF_Morph?.apply?.(t.face.replace(/^morph_/, ''));
                    } catch (e) {
                        console.warn(TAG + ' trigger morph tick ' + t.tick + ' fallo: ' + (e?.message || e));
                    }
                } else {
                    applyFace(t.face).catch(e => console.warn(TAG + ' trigger tick ' + t.tick + ' fallo: ' + e.message));
                }
            }
            
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

    function skipBefore(tick) {
        let n = 0;
        for (const t of state.tickTriggers) {
            if (!t.done && t.tick < tick) { t.done = true; n++; }
        }
        return n;
    }

    function resetForPlayback() {
        for (const t of state.tickTriggers) { t.done = false; t.expired = false; }
    }

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

    const KNOWN_FACES = [
        'happy', 'happy_sleep', 'happy_talking', 'neutral', 'neutral_talking',
        'evil', 'evil_talking', 'smiling_evil', 'hurt', 'serious_1',
        'serious_2', 'serious_3', 'serious_talking', 'noface', 'crazy',
        'crazy_talking', 'flashlight'
    ];

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

    function loadExternalFace(name) {
        for (const id in SOURCES_DIR) {
            for (const f of SOURCES_DIR[id]) {
                if (f.name === name) {
                    
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
        
        loadFaceCanvas(name) { return loadExternalFace(name) || loadFaceImage(name); },
        get triggers() { return state.tickTriggers; },
        
        FACE_REGION: FACE,
        FACE_OVERLAY_REGION: FACE_OVERLAY,
        FACES_DIR
    };
    window.__MF_FaceSwap = true;

    document.addEventListener('minifeather:faceswap-config', (e) => {
        try {
            const cfg = JSON.parse(e.detail);
            if (typeof cfg.enabled === 'boolean') window.MF_FaceSwap.enabled = cfg.enabled;
        } catch {}
    }, true);

    console.log(TAG + ' listo. MF_FaceSwap.set("happy") para probar. Caras: ' + KNOWN_FACES.length);
})();
