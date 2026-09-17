
(function () {
    'use strict';
    if (window.__MF_SkinChanger) return;
    const TAG = '[MF SkinChanger]';

    const ID = 'mf-skinchanger';
    const DB_NAME = 'minifeather_skins';
    const STORE = 'skins';
    const SKIN_FACE = { x: 8, y: 8, w: 8, h: 8 }; 

    const state = {
        open: false,
        items: [],            
        current: null,        
        origCanvas: null,     
        origMats: [],         
        watchdog: null
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
        try { const e = g.world?.entities?.get?.(me.id); if (e?.mesh) return e.mesh; } catch {}
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
            
            const k64 = w / 64;
            return Number.isInteger(k64) && (h === w || h === w / 2);
        });
        return skins.length ? skins : out;
    }

    function dbOpen() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'name' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('indexedDB error'));
        });
    }

    async function dbAll() {
        const db = await dbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbPut(item) {
        const db = await dbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(item);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }

    async function dbDelete(name) {
        const db = await dbOpen();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(name);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('could not load the image'));
            img.src = src;
        });
    }

    function faceThumb(img) {
        const k = Math.max(1, Math.round(img.width / 64));
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, SKIN_FACE.x * k, SKIN_FACE.y * k, SKIN_FACE.w * k, SKIN_FACE.h * k, 0, 0, 32, 32);
        return c.toDataURL();
    }

    function bodyThumb(img) {
        const k = Math.max(1, Math.round(img.width / 64));
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        ctx.drawImage(img, 16 * k, 16 * k, 24 * k, 16 * k, 4, 8, 24, 16);
        ctx.drawImage(img, 40 * k, 0, 24 * k, 16 * k, 4, -8, 24, 16); 
        return c.toDataURL();
    }

    function ensureTextureSession() {
        const mesh = getMesh();
        if (!mesh) throw new Error('jugador no disponible (entra al mundo primero)');
        const mats = findSkinMaterials(mesh);
        if (!mats.length) throw new Error('no se encontró material de skin');

        const seTex = window.MF_SkinEditor?.__tex?.();
        if (seTex && mats.some(m => m.map === seTex) && seTex.image instanceof HTMLCanvasElement) {
            return { canvas: seTex.image, tex: seTex, mats, shared: true };
        }

        const src = mats[0].map;
        const base = src?.image;
        if (!base) throw new Error('textura de skin no legible');
        const c = document.createElement('canvas');
        c.width = base.width; c.height = base.height;
        c.getContext('2d').drawImage(base, 0, 0);

        let tex = null;
        try { tex = new src.constructor(c); } catch {}
        if (!tex) {
            try { tex = new src.constructor(); tex.image = c; } catch {
                throw new Error('no se pudo crear textura editable');
            }
        }
        try {
            tex.magFilter = src.magFilter;
            tex.minFilter = src.minFilter;
            if (src.colorSpace !== undefined && 'colorSpace' in tex) tex.colorSpace = src.colorSpace;
            tex.flipY = src.flipY;
            tex.wrapS = src.wrapS; tex.wrapT = src.wrapT;
            tex.repeat?.copy?.(src.repeat);
            tex.offset?.copy?.(src.offset);
        } catch {}

        if (!state.origCanvas) {
            try {
                const oc = document.createElement('canvas');
                oc.width = base.width; oc.height = base.height;
                oc.getContext('2d').drawImage(base, 0, 0);
                state.origCanvas = oc;
            } catch {}
        }
        for (const m of mats) { m.map = tex; m.needsUpdate = true; }
        tex.__mfLocalCanvas = true; 
        state.origMats = mats;
        state.ownTex = tex; 
        return { canvas: c, tex, mats, shared: false };
    }

    async function apply(name, opts) {
        const item = state.items.find(i => i.name === name);
        if (!item && !opts?.dataURL) throw new Error('skin "' + name + '" no está en la biblioteca');
        const dataURL = opts?.dataURL || item.dataURL;
        const img = await loadImage(dataURL);

        const canvas = normalizeSkinCanvas(img);
        if (!canvas) {
            throw new Error('PNG inválido (' + img.width + 'x' + img.height + ') — debe ser 64x64/64x32 o múltiplo');
        }

        const session = ensureTextureSession();
        const ctx = session.canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, session.canvas.width, session.canvas.height);
        
        const tw = session.canvas.width, th = session.canvas.height;
        const cs = canvas.width / 64; 
        if (tw === th * 2) {
            ctx.drawImage(canvas, 0, 0, 64 * cs, 32 * cs, 0, 0, tw, th);
        } else {
            ctx.drawImage(canvas, 0, 0, 64 * cs, 64 * cs, 0, 0, tw, th);
        }
        session.tex.needsUpdate = true;
        state.current = name;
        startWatchdog();
        
        try {
            window.MF_Peer?.sendLook?.({
                a: 'skin', name,
                dataURL: opts?.dataURL || item?.dataURL || null
            });
        } catch {}
        return { ok: true, skin: name, mode: session.shared ? 'shared' : 'own' };
    }

    function normalizeSkinCanvas(img) {
        const w = img.width, h = img.height;
        const isModern = w === h;             
        const isLegacy = w === h * 2;         
        if (!isModern && !isLegacy) return null;
        const scale = w / 64;
        if (!Number.isInteger(scale)) return null;

        if (isModern) return img; 

        const out = document.createElement('canvas');
        out.width = w; out.height = w; 
        const cx = out.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(img, 0, 0, w, h, 0, 0, w, h); 
        const mirror = (sx, dx) => {
            cx.save();
            cx.translate((dx + 16) * scale, 48 * scale);
            cx.scale(-1, 1);
            cx.drawImage(img, sx * scale, h / 2, 16 * scale, h / 2, 0, 0, 16 * scale, 16 * scale);
            cx.restore();
        };
        mirror(0, 16);  
        mirror(40, 32); 
        return out;
    }

    function revert() {
        if (!state.origCanvas) {
            const session = tryCurrentCanvas();
            if (session) {
                
                return { ok: false, error: 'no hay original guardado (¿skin ya restaurada?)' };
            }
            return { ok: false, error: 'no hay original guardado' };
        }
        const session = tryCurrentCanvas();
        if (!session) return { ok: false, error: 'sin textura activa' };
        const ctx = session.canvas.getContext('2d');
        ctx.clearRect(0, 0, session.canvas.width, session.canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(state.origCanvas, 0, 0);
        session.tex.needsUpdate = true;
        state.current = null;
        stopWatchdog();
        
        try { window.MF_Peer?.sendLook?.({ a: 'revert', what: 'skin' }); } catch {}
        return { ok: true };
    }

    function tryCurrentCanvas() {
        const mesh = getMesh();
        const mats = findSkinMaterials(mesh);
        if (!mats.length) return null;
        
        for (const m of mats) {
            if (state.ownTex && m.map === state.ownTex) {
                return { canvas: state.ownTex.image, tex: state.ownTex };
            }
        }
        const seTex = window.MF_SkinEditor?.__tex?.();
        if (seTex && mats.some(m => m.map === seTex) && seTex.image instanceof HTMLCanvasElement) {
            return { canvas: seTex.image, tex: seTex };
        }
        
        const t = mats[0].map;
        if (t?.image instanceof HTMLCanvasElement) return { canvas: t.image, tex: t };
        return null;
    }

    function startWatchdog() {
        stopWatchdog();
        state.watchdog = setInterval(() => {
            if (!state.current) return;
            const mesh = getMesh();
            if (!mesh) return;
            const mats = findSkinMaterials(mesh);
            const item = state.items.find(i => i.name === state.current);
            if (!item) return;
            const mounted = mats.some(m => m.map === state.ownTex) ||
                mats.some(m => m.map === window.MF_SkinEditor?.__tex?.());
            if (!mounted) {
                
                state.origCanvas = null; 
                apply(state.current).catch(() => {});
            }
        }, 500);
    }

    function stopWatchdog() {
        if (state.watchdog) { clearInterval(state.watchdog); state.watchdog = null; }
    }

    async function importFiles(files) {
        const out = [];
        for (const file of files) {
            if (!/\.png$/i.test(file.name)) continue;
            const dataURL = await new Promise((resolve) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.onerror = () => resolve(null);
                r.readAsDataURL(file);
            });
            if (!dataURL) continue;
            try {
                const img = await loadImage(dataURL);
                
                if (!normalizeSkinCanvas(img)) {
                    console.warn(TAG + ' "' + file.name + '" proporciones no válidas (' + img.width + 'x' + img.height + ')');
                    continue;
                }
                const name = file.name.replace(/\.png$/i, '');
                const item = { name, dataURL, thumb: faceThumb(img), w: img.width, h: img.height };
                await dbPut(item);
                state.items = state.items.filter(i => i.name !== name);
                state.items.push(item);
                out.push(item);
            } catch (e) {
                console.warn(TAG + ' import ' + file.name + ': ' + e.message);
            }
        }
        if (out.length) {
            registerFaces();
            renderUI();
            document.dispatchEvent(new CustomEvent('mf:skinchanger-items'));
        }
        return out;
    }

    async function removeItem(name) {
        await dbDelete(name);
        state.items = state.items.filter(i => i.name !== name);
        if (state.current === name) state.current = null;
        registerFaces();
        renderUI();
        document.dispatchEvent(new CustomEvent('mf:skinchanger-items'));
    }

    async function registerFaces() {
        const FS = window.MF_FaceSwap;
        if (!FS?.registerSource) return;
        const faces = [];
        for (const item of state.items) {
            faces.push({
                name: 'skin_' + item.name,
                thumb: item.thumb,
                dataURL: item.dataURL,
                region: SKIN_FACE
            });
        }
        try { await FS.registerSource('skinchanger', faces); } catch (e) {
            console.warn(TAG + ' registerFaces: ' + e.message);
        }
    }

    function applyAtTick(tick, name, durationTicks) {
        const FS = window.MF_FaceSwap;
        const TPS = 20;
        const dur = Math.max(1, Math.round(durationTicks || TPS));
        if (FS?.applyAtTick) {
            FS.applyAtTick(tick, 'skin_' + name, 'skin', dur);
            return { ok: true };
        }
        return { ok: false, error: 'FaceSwap no disponible' };
    }

    function buildUI() {
        if (document.getElementById(ID)) { renderUI(); return; }
        const style = document.createElement('style');
        style.id = ID + '-style';
        style.textContent = `
#${ID} { position:fixed; top:70px; right:16px; z-index:2147483000;
  background:#14141a; border:1px solid #32323a; border-radius:8px;
  box-shadow:0 8px 32px rgba(0,0,0,.6); color:#e8e8ee;
  font:12px/1.4 system-ui,sans-serif; user-select:none; width:280px; }
#${ID} .mfsch-head { display:flex; align-items:center; gap:8px; padding:8px 10px;
  border-bottom:1px solid #26262e; font-weight:700; letter-spacing:.5px; }
#${ID} .mfsch-head .dot { width:8px; height:8px; border-radius:50%;
  background:#4dff88; animation:mfsch-pulse 1.5s infinite; }
@keyframes mfsch-pulse { 50% { opacity:.35; } }
#${ID} .mfsch-drop { margin:8px 10px; padding:12px 8px; text-align:center;
  border:1px dashed #3a3a44; border-radius:6px; color:#9a9aa6; cursor:pointer; font-size:11px; }
#${ID} .mfsch-drop:hover, #${ID} .mfsch-drop.over { border-color:#4dff88; color:#4dff88; }
#${ID} .mfsch-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px;
  padding:4px 10px 8px; max-height:260px; overflow-y:auto; }
#${ID} .mfsch-item { position:relative; border:1px solid #32323a; border-radius:6px;
  padding:4px 2px 2px; cursor:pointer; text-align:center; background:#191921; }
#${ID} .mfsch-item:hover { border-color:#4dff88; }
#${ID} .mfsch-item.on { border-color:#ff6b2b; background:#241d16; }
#${ID} .mfsch-item img { width:40px; height:40px; image-rendering:pixelated; border-radius:4px; }
#${ID} .mfsch-item .nm { display:block; font-size:9px; color:#9a9aa6;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#${ID} .mfsch-item .del { position:absolute; top:2px; right:2px; display:none;
  background:#3a1c1c; color:#ff7d7d; border:none; border-radius:3px;
  font-size:9px; padding:1px 4px; cursor:pointer; }
#${ID} .mfsch-item:hover .del { display:block; }
#${ID} button { background:#23232c; color:#e8e8ee; border:1px solid #3a3a44;
  border-radius:4px; padding:3px 8px; cursor:pointer; font:inherit; }
#${ID} button:hover { background:#2e2e3a; }
#${ID} .mfsch-foot { display:flex; gap:6px; padding:6px 10px 10px; }
        `;
        document.body.appendChild(style);
        const root = document.createElement('div');
        root.id = ID;
        root.innerHTML = `
<div class="mfsch-head"><span class="dot"></span>👕 SKINS — en vivo
    <button data-act="close" style="margin-left:auto" title="Cerrar">✕</button></div>
<div class="mfsch-drop" title="Importar PNGs de skin (64x64 o 64x32)">📂 Suelta skins .png aquí<br>o haz click para elegir</div>
<div class="mfsch-grid" id="mfsch-grid"></div>
<div class="mfsch-foot">
    <button data-act="revert" title="Volver a la skin original del juego">↺ Original</button>
    <button data-act="help" title="Cómo usar">?</button>
</div>
        `;
        document.body.appendChild(root);
        bindUI(root);
    }

    function renderUI() {
        const root = document.getElementById(ID);
        if (!root) return;
        const grid = root.querySelector('#mfsch-grid');
        if (!grid) return;
        grid.innerHTML = '';
        if (!state.items.length) {
            grid.innerHTML = '<div style="grid-column:1/-1;color:#8a8a96;font-size:11px;text-align:center;padding:8px;">No imported skins yet</div>';
            return;
        }
        for (const item of state.items) {
            const d = document.createElement('div');
            d.className = 'mfsch-item' + (state.current === item.name ? ' on' : '');
            d.title = item.name + ' (' + item.w + 'x' + item.h + ') — click = apply · drag to V2 timeline';
            d.draggable = true;
            d.innerHTML = `<img src="${item.thumb}" alt=""><span class="nm">${item.name}</span><button class="del" title="Remove from library">✕</button>`;
            d.ondragstart = (ev) => {
                ev.dataTransfer.setData('text/mf-skin', item.name);
                ev.dataTransfer.setData('text/plain', item.name);
                ev.dataTransfer.effectAllowed = 'copy';
            };
            d.onclick = () => {
                apply(item.name).then(() => {
                    renderUI();
                    console.log(TAG + ' skin aplicada: ' + item.name);
                }).catch(e => console.warn(TAG + ' ' + e.message));
            };
            d.querySelector('.del').onclick = (ev) => {
                ev.stopPropagation();
                removeItem(item.name);
            };
            grid.appendChild(d);
        }
    }

    function bindUI(root) {
        const drop = root.querySelector('.mfsch-drop');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,.png';
        input.multiple = true;
        input.style.display = 'none';
        root.appendChild(input);
        drop.onclick = () => input.click();
        input.onchange = () => {
            importFiles(input.files).then(items => {
                if (items.length) console.log(TAG + ' importadas ' + items.length + ' skin(s)');
            });
            input.value = '';
        };
        drop.ondragover = (ev) => { ev.preventDefault(); drop.classList.add('over'); };
        drop.ondragleave = () => drop.classList.remove('over');
        drop.ondrop = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            drop.classList.remove('over');
            importFiles(ev.dataTransfer.files);
        };
        root.querySelector('[data-act="close"]').onclick = () => close();
        root.querySelector('[data-act="revert"]').onclick = () => {
            const r = revert();
            renderUI();
            console.log(TAG + ' revert: ' + JSON.stringify(r));
        };
        root.querySelector('[data-act="help"]').onclick = () => {
            console.log(TAG + ' Importa PNGs de skin (64x64/64x32). Click en una = aplicar en vivo. Arrastra al timeline V2 = clip de skin. Las caras aparecen en el panel Caras como skin_<nombre>.');
        };
    }

    function open() {
        if (state.open) { renderUI(); return; }
        state.open = true;
        load().then(() => { buildUI(); renderUI(); });
    }

    function close() {
        document.getElementById(ID)?.remove();
        document.getElementById(ID + '-style')?.remove();
        state.open = false;
    }

    async function load() {
        try {
            state.items = await dbAll();
            state.items.sort((a, b) => a.name.localeCompare(b.name));
            registerFaces();
        } catch (e) {
            console.warn(TAG + ' load: ' + e.message);
            state.items = [];
        }
    }

    window.MF_SkinChanger = {
        open, close,
        apply, revert,
        importFiles,
        applyAtTick,
        get items() { return state.items; },
        get current() { return state.current; },
        faces() {
            return state.items.map(i => ({ name: 'skin_' + i.name, thumb: i.thumb }));
        }
    };
    window.__MF_SkinChanger = true;

    load().catch(() => {});

    console.log(TAG + ' listo. MF_SkinChanger.open() — skins PNG en vivo.');
})();
