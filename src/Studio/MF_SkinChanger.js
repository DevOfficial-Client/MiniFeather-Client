// MF_SkinChanger.js — Cambio de skin EN VIVO por PNG completo (64x64 o
// 64x32), con biblioteca persistente, drag al timeline como clip V2 y
// caras extraídas de PNGs de skin.
//
// Cómo funciona:
// - El juego tiene un material de skin por parte que comparten UNA textura
//   (patrón MF_SkinEditor). El swap pinta el PNG sobre el canvas de la
//   textura editable YA montada (si el SkinEditor está activo) o crea una
//   nueva sesión propia — en ambos casos los cambios se ven al instante.
// - La biblioteca guarda los PNG como dataURL en IndexedDB (localStorage
//   se queda corto para imágenes): importar una vez, disponible siempre.
// - Las CARAS de cada skin PNG se extraen de la región (8,8)-(16,16) del
//   PNG y se registran en FaceSwap como emociones nuevas → arrastrables
//   al timeline V2 como cualquier emoción.
//
// Uso:
//   MF_SkinChanger.open()            // panel de biblioteca
//   MF_SkinChanger.apply(name)       // aplicar skin PNG en vivo
//   MF_SkinChanger.revert()          // volver a la skin original
//   MF_SkinChanger.faces()           // [{name, thumb}] caras de los PNGs

(function () {
    'use strict';
    if (window.__MF_SkinChanger) return;
    const TAG = '[MF SkinChanger]';

    const ID = 'mf-skinchanger';
    const DB_NAME = 'minifeather_skins';
    const STORE = 'skins';
    const SKIN_FACE = { x: 8, y: 8, w: 8, h: 8 }; // región de cara en una skin

    const state = {
        open: false,
        items: [],            // [{name, dataURL, thumb, w, h}]
        current: null,        // nombre aplicado
        origCanvas: null,     // copia de la skin original (para revert)
        origMats: [],         // materiales con la textura tocada
        watchdog: null
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
        try { const e = g.world?.entities?.get?.(me.id); if (e?.mesh) return e.mesh; } catch {}
        return me?.mesh || null;
    }

    // TODOS los materiales de skin del mesh (uno por parte, misma textura)
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
            // 64x64/64x32 o múltiplo HD (128x128, 512x256…) — y ratio 1:1 o 2:1
            const k64 = w / 64;
            return Number.isInteger(k64) && (h === w || h === w / 2);
        });
        return skins.length ? skins : out;
    }

    // ── IndexedDB: biblioteca persistente de skins PNG ──
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

    // ── imágenes ──
    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('no se pudo cargar la imagen'));
            img.src = src;
        });
    }

    // miniatura de una skin: la cara ampliada (lo distintivo).
    // Escala: HD (k>1) → leer la cara a k para no quedarse con 1/4 de píxel
    function faceThumb(img) {
        const k = Math.max(1, Math.round(img.width / 64));
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, SKIN_FACE.x * k, SKIN_FACE.y * k, SKIN_FACE.w * k, SKIN_FACE.h * k, 0, 0, 32, 32);
        return c.toDataURL();
    }

    // miniatura del cuerpo completo (64x32 de alto, escalado)
    function bodyThumb(img) {
        const k = Math.max(1, Math.round(img.width / 64));
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        // cuerpo: usar mitad derecha del PNG (frente del personaje)
        // layout MC: la skin completa 64x64 → cuerpo en (16,16)-(40,32)
        ctx.drawImage(img, 16 * k, 16 * k, 24 * k, 16 * k, 4, 8, 24, 16);
        ctx.drawImage(img, 40 * k, 0, 24 * k, 16 * k, 4, -8, 24, 16); // cabeza arriba
        return c.toDataURL();
    }

    // ── sesión de swap en vivo ──
    // Si el SkinEditor tiene una textura editable montada, pintar AHÍ (se
    // mantiene el trabajo en curso). Si no, montar una propia (y guardar
    // el original para revert).
    function ensureTextureSession() {
        const mesh = getMesh();
        if (!mesh) throw new Error('jugador no disponible (entra al mundo primero)');
        const mats = findSkinMaterials(mesh);
        if (!mats.length) throw new Error('no se encontró material de skin');

        // ¿el SkinEditor ya montó su canvas editable en todos?
        const seTex = window.MF_SkinEditor?.__tex?.();
        if (seTex && mats.some(m => m.map === seTex) && seTex.image instanceof HTMLCanvasElement) {
            return { canvas: seTex.image, tex: seTex, mats, shared: true };
        }

        // sesión propia: copiar la skin actual a un canvas editable y
        // montarla en TODOS los materiales
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

        // guardar el original (solo la primera vez)
        if (!state.origCanvas) {
            try {
                const oc = document.createElement('canvas');
                oc.width = base.width; oc.height = base.height;
                oc.getContext('2d').drawImage(base, 0, 0);
                state.origCanvas = oc;
            } catch {}
        }
        for (const m of mats) { m.map = tex; m.needsUpdate = true; }
        state.origMats = mats;
        state.ownTex = tex; // la textura de ESTA sesión (para revert/watchdog)
        return { canvas: c, tex, mats, shared: false };
    }

    // pintar un PNG de skin sobre la textura del juego
    async function apply(name, opts) {
        const item = state.items.find(i => i.name === name);
        if (!item && !opts?.dataURL) throw new Error('skin "' + name + '" no está en la biblioteca');
        const dataURL = opts?.dataURL || item.dataURL;
        const img = await loadImage(dataURL);

        // la textura del juego puede ser SD (64x64/64x32) o HD (128x128,
        // 1024x512…). Aceptamos cualquier múltiplo entero; el canvas ya
        // viene a SU resolución nativa (modern cuadrado) y aquí solo se
        // escala al tamaño de la textura destino — si la textura es HD y
        // el PNG también, el pintado es 1:1 sin pérdida.
        const canvas = normalizeSkinCanvas(img);
        if (!canvas) {
            throw new Error('PNG inválido (' + img.width + 'x' + img.height + ') — debe ser 64x64/64x32 o múltiplo');
        }

        const session = ensureTextureSession();
        const ctx = session.canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, session.canvas.width, session.canvas.height);
        // pintar en el MISMO layout que la textura del juego:
        //   modern (tw == th)    → canvas completo escalado
        //   legacy  (tw == th*2) → SOLO la mitad superior del canvas
        //                          modern; los miembros izquierdos los
        //                          espeja el propio juego (no existen en legacy)
        const tw = session.canvas.width, th = session.canvas.height;
        const cs = canvas.width / 64; // escala del canvas modern
        if (tw === th * 2) {
            ctx.drawImage(canvas, 0, 0, 64 * cs, 32 * cs, 0, 0, tw, th);
        } else {
            ctx.drawImage(canvas, 0, 0, 64 * cs, 64 * cs, 0, 0, tw, th);
        }
        session.tex.needsUpdate = true;
        state.current = name;
        startWatchdog();
        // Look Sync P2P: compartir la skin aplicada en tiempo real
        try {
            window.MF_Peer?.sendLook?.({
                a: 'skin', name,
                dataURL: opts?.dataURL || item?.dataURL || null
            });
        } catch {}
        return { ok: true, skin: name, mode: session.shared ? 'shared' : 'own' };
    }

    // normaliza cualquier PNG de skin (reescala nada): modern pasa tal
    // cual (a SU resolución nativa) y legacy se convierte a modern a la
    // MISMA escala. null si las proporciones no son de skin.
    // El canvas/img resultante es w == h (modern): aplicar lo escala al
    // tamaño de la textura destino SIN colapso intermedio a 64x64 (eso
    // mataba la resolución HD: alice 128 → 64 → estirada a x16).
    function normalizeSkinCanvas(img) {
        const w = img.width, h = img.height;
        const isModern = w === h;             // 64x64, 128x128, 1024x1024…
        const isLegacy = w === h * 2;         // 64x32, 128x64, 1024x512…
        if (!isModern && !isLegacy) return null;
        const scale = w / 64;
        if (!Number.isInteger(scale)) return null;

        if (isModern) return img; // tal cual, resolución nativa intacta

        // legacy (64x32 lógico a escala `scale`) → modern a la MISMA escala.
        // Legacy: y0..h/2 = cabeza(0..32)+hat(32..64) + piernaD/cuerpo/brazoD
        // Modern: añade y48..64 = piernaI(16..32) brazoI(32..48) espejados
        const out = document.createElement('canvas');
        out.width = w; out.height = w; // modern = cuadrado (64x32 → 64x64)
        const cx = out.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(img, 0, 0, w, h, 0, 0, w, h); // todo el legacy 1:1 arriba
        const mirror = (sx, dx) => {
            cx.save();
            cx.translate((dx + 16) * scale, 48 * scale);
            cx.scale(-1, 1);
            cx.drawImage(img, sx * scale, h / 2, 16 * scale, h / 2, 0, 0, 16 * scale, 16 * scale);
            cx.restore();
        };
        mirror(0, 16);  // pierna I ← espejo pierna D
        mirror(40, 32); // brazo I ← espejo brazo D
        return out;
    }

    function revert() {
        if (!state.origCanvas) {
            const session = tryCurrentCanvas();
            if (session) {
                // sin original guardado: nada que restaurar
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
        // Look Sync P2P: avisar del revert al peer
        try { window.MF_Peer?.sendLook?.({ a: 'revert', what: 'skin' }); } catch {}
        return { ok: true };
    }

    // canvas/tex activos ahora mismo (propio o del SkinEditor)
    function tryCurrentCanvas() {
        const mesh = getMesh();
        const mats = findSkinMaterials(mesh);
        if (!mats.length) return null;
        // preferir la textura propia si sigue montada
        for (const m of mats) {
            if (state.ownTex && m.map === state.ownTex) {
                return { canvas: state.ownTex.image, tex: state.ownTex };
            }
        }
        const seTex = window.MF_SkinEditor?.__tex?.();
        if (seTex && mats.some(m => m.map === seTex) && seTex.image instanceof HTMLCanvasElement) {
            return { canvas: seTex.image, tex: seTex };
        }
        // textura del juego
        const t = mats[0].map;
        if (t?.image instanceof HTMLCanvasElement) return { canvas: t.image, tex: t };
        return null;
    }

    // el juego puede re-montar su textura (cambio de mundo/skin del
    // servidor): re-aplicar la skin actual si eso pasa
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
                // el juego re-asignó: re-aplicar en caliente
                state.origCanvas = null; // el original ya no es válido
                apply(state.current).catch(() => {});
            }
        }, 500);
    }

    function stopWatchdog() {
        if (state.watchdog) { clearInterval(state.watchdog); state.watchdog = null; }
    }

    // ── importar PNGs ──
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
                // aceptar 64x64/64x32 y CUALQUIER múltiplo HD (128x128,
                // 512x256, 1024x512…). normalizeSkinCanvas devuelve null si
                // las proporciones no son de skin.
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

    // ── caras de los PNGs → registrar en FaceSwap como emociones ──
    // Cada skin PNG aporta su cara (región 8,8..16,16) como una "emoción"
    // nueva llamada skin_<nombre> → aparece en el panel Caras del Studio y
    // es arrastrable al timeline V2 como cualquier cara.
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

    // trigger desde el timeline: aplicar/revertir en un tick
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

    // ── UI ──
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
            grid.innerHTML = '<div style="grid-column:1/-1;color:#8a8a96;font-size:11px;text-align:center;padding:8px;">Sin skins importadas aún</div>';
            return;
        }
        for (const item of state.items) {
            const d = document.createElement('div');
            d.className = 'mfsch-item' + (state.current === item.name ? ' on' : '');
            d.title = item.name + ' (' + item.w + 'x' + item.h + ') — click = aplicar · arrastra al timeline V2';
            d.draggable = true;
            d.innerHTML = `<img src="${item.thumb}" alt=""><span class="nm">${item.name}</span><button class="del" title="Quitar de la biblioteca">✕</button>`;
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

    // ── API ──
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

    // cargar la biblioteca al arrancar (para que las caras estén en FaceSwap
    // aunque el panel no esté abierto)
    load().catch(() => {});

    console.log(TAG + ' listo. MF_SkinChanger.open() — skins PNG en vivo.');
})();
