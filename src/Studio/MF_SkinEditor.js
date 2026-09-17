
(function () {
    'use strict';
    if (window.__MF_SkinEditor) return;
    const TAG = '[MF SkinEditor]';

    const HEAD = { x: 0, y: 0, w: 64, h: 16 }; 
    const OVERLAY_X = 32;                      
    
    const BODY_PARTS = [
        { n: 'cabeza', base: { x: 0, y: 0, w: 32, h: 16 } },
        { n: 'cuerpo', base: { x: 16, y: 16, w: 24, h: 16 } },
        { n: 'brazo D', base: { x: 40, y: 16, w: 16, h: 16 } },
        { n: 'brazo I', base: { x: 32, y: 48, w: 16, h: 16 } },
        { n: 'pierna D', base: { x: 0, y: 16, w: 16, h: 16 } },
        { n: 'pierna I', base: { x: 16, y: 48, w: 16, h: 16 } }
    ];
    const LS_KEY = 'minifeather_headskins_v1';
    const ID = 'mf-skineditor';

    const REGIONS = [
        { n: 'arriba', x: 8, y: 0, ov: 40 }, { n: 'abajo', x: 16, y: 0, ov: 48 },
        { n: 'der', x: 0, y: 8, ov: 32 }, { n: 'CARA', x: 8, y: 8, ov: 40 },
        { n: 'izq', x: 16, y: 8, ov: 48 }, { n: 'atrás', x: 24, y: 8, ov: 56 }
    ];

    const state = {
        open: false,
        mode: 'head',        
        zoom: 10,            
        tool: 'pencil',      
        color: '#1a1a1a',
        brush: 1,
        grid: true,
        layer: 'both',       
        mats: [],            
        orig: new Map(),     
        tex: null, texCanvas: null,
        watchdog: null,
        undo: [], redo: [],
        painting: false, lastCell: null,
        p2pCells: []            
    };

    function zone() {
        if (state.mode === 'full') {
            const c = state.texCanvas;
            const w = c ? c.width : 64, h = c ? c.height : 64;
            return { x: 0, y: 0, w, h };
        }
        return HEAD;
    }

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

    function skinCanvasFromTexture(tex) {
        const img = tex?.image;
        if (!img) return null;
        if (img instanceof HTMLCanvasElement) return img;
        try {
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
        } catch {}
        return null;
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

    function ensureWorkCanvas() {
        const mesh = getMesh();
        if (!mesh) throw new Error('jugador no disponible (entra al mundo primero)');

        if (state.tex?.userData?.__mfSkinEditor && state.texCanvas) {
            const mats = findSkinMaterials(mesh);
            const alive = mats.some(m => m.map === state.tex);
            if (alive) { state.mats = mats; return true; }
            
            for (const m of mats) { state.orig.set(m, m.map); m.map = state.tex; m.needsUpdate = true; }
            state.mats = mats;
            startWatchdog();
            return true;
        }

        const mats = findSkinMaterials(mesh);
        if (!mats.length) throw new Error('no se encontró material de skin');
        const src = mats[0].map;
        const base = skinCanvasFromTexture(src);
        if (!base) throw new Error('no se pudo leer la skin actual');

        const c = document.createElement('canvas');
        c.width = base.width; c.height = base.height;
        c.getContext('2d', { willReadFrequently: true }).drawImage(base, 0, 0);

        let tex = null;
        try { tex = new src.constructor(c); } catch {}
        if (!tex) {
            try {
                tex = new src.constructor();
                tex.image = c;
            } catch { throw new Error('no se pudo crear textura editable'); }
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
        tex.userData = { __mfSkinEditor: true };
        tex.__mfLocalCanvas = true; 
        tex.needsUpdate = true;

        state.orig.clear();
        for (const m of mats) { state.orig.set(m, m.map); m.map = tex; m.needsUpdate = true; }
        state.mats = mats; state.tex = tex; state.texCanvas = c;
        startWatchdog();
        return true;
    }

    function startWatchdog() {
        stopWatchdog();
        state.watchdog = setInterval(() => {
            if (!state.tex) return;
            const mesh = getMesh();
            if (!mesh) return;
            const mats = findSkinMaterials(mesh);
            let rebind = 0;
            for (const m of mats) {
                if (m.map !== state.tex) {
                    if (!state.orig.has(m)) state.orig.set(m, m.map);
                    m.map = state.tex;
                    m.needsUpdate = true;
                    rebind++;
                }
            }
            state.mats = mats;
            if (rebind) renderUI(); 
        }, 250);
    }

    function stopWatchdog() {
        if (state.watchdog) { clearInterval(state.watchdog); state.watchdog = null; }
    }

    function layerAllows(sx) {
        if (state.mode === 'full') return true; 
        if (state.layer === 'both') return true;
        return state.layer === 'base' ? sx < OVERLAY_X : sx >= OVERLAY_X;
    }

    function inZone(x, y) {
        const z = zone();
        return x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h;
    }

    function paintCell(sx, sy, erase) {
        if (!state.texCanvas || !state.tex) return;
        const ctx = state.texCanvas.getContext('2d');
        const b = state.brush;
        for (let i = 0; i < b; i++) {
            for (let j = 0; j < b; j++) {
                const x = sx + i, y = sy + j;
                if (!inZone(x, y) || !layerAllows(x)) continue;
                if (erase) ctx.clearRect(x, y, 1, 1);
                else { ctx.fillStyle = state.color; ctx.fillRect(x, y, 1, 1); }
                
                state.p2pCells.push([x, y, erase ? null : state.color]);
            }
        }
        state.tex.needsUpdate = true; 
    }

    function floodFill(sx, sy) {
        if (!state.texCanvas || !state.tex || !inZone(sx, sy) || !layerAllows(sx)) return;
        const Z = zone();
        const ctx = state.texCanvas.getContext('2d');
        const img = ctx.getImageData(Z.x, Z.y, Z.w, Z.h);
        const d = img.data;
        const W = Z.w, H = Z.h;
        const idx = (x, y) => (y * W + x) * 4;
        const lx = sx - Z.x, ly = sy - Z.y;
        const t = idx(lx, ly);
        const tr = d[t], tg = d[t + 1], tb = d[t + 2], ta = d[t + 3];
        
        const hex = state.color.replace('#', '');
        const fr = parseInt(hex.substr(0, 2), 16), fg = parseInt(hex.substr(2, 2), 16), fb = parseInt(hex.substr(4, 2), 16);
        if (tr === fr && tg === fg && tb === fb && ta === 255) return; 
        const stack = [[lx, ly]];
        while (stack.length) {
            const [x, y] = stack.pop();
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const sxTex = x + Z.x;
            if (!layerAllows(sxTex)) continue;
            const i = idx(x, y);
            if (d[i] !== tr || d[i + 1] !== tg || d[i + 2] !== tb || d[i + 3] !== ta) continue;
            d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        ctx.putImageData(img, Z.x, Z.y);
        state.tex.needsUpdate = true;
        
        emitZoneRect();
    }

    function pickColorAt(sx, sy) {
        if (!state.texCanvas || !inZone(sx, sy)) return null;
        const d = state.texCanvas.getContext('2d').getImageData(sx, sy, 1, 1).data;
        if (d[3] === 0) return null;
        const h = (v) => v.toString(16).padStart(2, '0');
        return '#' + h(d[0]) + h(d[1]) + h(d[2]);
    }

    function snapshot() {
        if (!state.texCanvas) return;
        const Z = zone();
        const ctx = state.texCanvas.getContext('2d');
        state.undo.push(ctx.getImageData(Z.x, Z.y, Z.w, Z.h));
        if (state.undo.length > 40) state.undo.shift();
        state.redo.length = 0;
    }
    function restoreFrom(stackA, stackB) {
        if (!state.texCanvas || !stackA.length) return;
        const Z = zone();
        const ctx = state.texCanvas.getContext('2d');
        stackB.push(ctx.getImageData(Z.x, Z.y, Z.w, Z.h));
        ctx.putImageData(stackA.pop(), Z.x, Z.y);
        state.tex.needsUpdate = true;
        
        emitZoneRect();
    }

    function emitZoneRect() {
        try {
            if (!state.texCanvas) return;
            if (state.mode === 'full') {
                window.MF_Peer?.sendLook?.({ a: 'skin', name: 'edit', dataURL: state.texCanvas.toDataURL('image/png') });
            } else {
                const c = document.createElement('canvas');
                c.width = HEAD.w; c.height = HEAD.h;
                c.getContext('2d').drawImage(state.texCanvas, HEAD.x, HEAD.y, HEAD.w, HEAD.h, 0, 0, HEAD.w, HEAD.h);
                window.MF_Peer?.sendLook?.({ a: 'head-rect', png: c.toDataURL() });
            }
        } catch {}
    }

    function lineCells(x0, y0, x1, y1, cb) {
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        for (;;) {
            cb(x0, y0);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    const W = () => zone().w * state.zoom;
    const H = () => zone().h * state.zoom;

    function resizeCanvasUI() {
        const cv = document.querySelector('#' + ID + ' canvas.mfse-cv');
        if (!cv) return;
        cv.width = W(); cv.height = H();
        
        cv.style.maxHeight = '60vh';
        cv.style.width = 'auto';
        renderUI();
    }

    function setMode(m) {
        if (state.mode === m) return;
        state.mode = m;
        state.undo.length = 0; state.redo.length = 0; 
        document.querySelectorAll('#' + ID + ' [data-mode]').forEach(b =>
            b.classList.toggle('on', b.dataset.mode === m));
        const lay = document.querySelector('#' + ID + ' [data-row="layers"]');
        if (lay) lay.style.display = (m === 'full') ? 'none' : 'flex';
        resizeCanvasUI();
    }

    function buildUI() {
        if (document.getElementById(ID)) return;
        const style = document.createElement('style');
        style.id = ID + '-style';
        style.textContent = `
#${ID} { position:fixed; top:70px; right:16px; z-index:2147483000;
  background:#14141a; border:1px solid #32323a; border-radius:8px;
  box-shadow:0 8px 32px rgba(0,0,0,.6); color:#e8e8ee;
  font:12px/1.4 system-ui,sans-serif; user-select:none; }
#${ID} .mfse-head { display:flex; align-items:center; gap:8px; padding:8px 10px;
  border-bottom:1px solid #26262e; font-weight:700; letter-spacing:.5px; }
#${ID} .mfse-head .dot { width:8px; height:8px; border-radius:50%;
  background:#4dff88; animation:mfse-pulse 1.5s infinite; }
@keyframes mfse-pulse { 50% { opacity:.35; } }
#${ID} .mfse-head button { margin-left:auto; }
#${ID} .mfse-row { display:flex; align-items:center; gap:6px; padding:6px 10px; flex-wrap:wrap; }
#${ID} .mfse-row + .mfse-row { border-top:1px solid #202028; }
#${ID} canvas.mfse-cv { display:block; margin:6px 10px; border:1px solid #32323a;
  image-rendering:pixelated; cursor:crosshair; background:#0c0c10; }
#${ID} button { background:#23232c; color:#e8e8ee; border:1px solid #3a3a44;
  border-radius:4px; padding:3px 8px; cursor:pointer; font:inherit; }
#${ID} button:hover { background:#2e2e3a; }
#${ID} button.on { background:#ff6b2b; color:#14141a; border-color:#ff6b2b; font-weight:700; }
#${ID} input[type=color] { width:34px; height:24px; padding:0; border:1px solid #3a3a44;
  border-radius:4px; background:none; cursor:pointer; }
#${ID} select { background:#23232c; color:#e8e8ee; border:1px solid #3a3a44;
  border-radius:4px; padding:3px; font:inherit; max-width:130px; }
#${ID} label { color:#9a9aa6; }
#${ID} .mfse-err { color:#ff7d7d; padding:4px 10px; display:none; }
        `;
        const root = document.createElement('div');
        root.id = ID;
        root.innerHTML = `
<div class="mfse-head"><span class="dot"></span>🎨 EDITOR DE SKIN — en vivo
    <button data-act="close" title="Cerrar (el dibujo se mantiene)">✕</button></div>
<canvas class="mfse-cv" width="${W()}" height="${H()}" style="max-height:60vh;width:auto;"></canvas>
<div class="mfse-row" data-row="mode">
    <label>Modo:</label>
    <button data-mode="head" class="on" title="Editar solo la cabeza (64x16), con filtro de capa">Cabeza</button>
    <button data-mode="full" title="Editar la skin completa: cuerpo, brazos, piernas">Skin completa</button>
</div>
<div class="mfse-row" data-row="tools">
    <button data-tool="pencil" class="on" title="Lápiz">✏️</button>
    <button data-tool="eraser" title="Borrador (transparente)">🧽</button>
    <button data-tool="picker" title="Cuentagotas">💧</button>
    <button data-tool="fill" title="Relleno">🪣</button>
    <input type="color" value="${state.color}" title="Color">
    <span title="Tamaño de pincel">Pincel
        <button data-brush="1" class="on">1</button>
        <button data-brush="2">2</button>
        <button data-brush="3">3</button>
    </span>
    <button data-act="undo" title="Deshacer">↩</button>
    <button data-act="redo" title="Rehacer">↪</button>
</div>
<div class="mfse-row" data-row="layers">
    <label>Capa:</label>
    <button data-layer="both" class="on">Ambas</button>
    <button data-layer="base" title="La de abajo del overlay">Base</button>
    <button data-layer="overlay" title="Hat layer">Overlay</button>
    <button data-act="grid" class="on" title="Rejilla">▦</button>
</div>
<div class="mfse-row" data-row="files">
    <button data-act="revert" title="Volver a la skin original (sin ediciones)">↺ Skin original</button>
    <button data-act="save" title="Guardar el dibujo de cabeza como preset">💾 Guardar</button>
    <select id="mfse-preset"><option value="">— presets —</option></select>
    <button data-act="apply" title="Aplicar preset">Aplicar</button>
    <button data-act="delete" title="Borrar preset">🗑</button>
    <button data-act="export" title="Descargar PNG de la cabeza">⬇ PNG</button>
</div>
<div class="mfse-row" data-row="live">
    <span style="font-size:10px;color:#8a8a96;">Arrastra al timeline (V2):</span>
    <img id="mfse-live-thumb" draggable="true" title="Cabeza ACTUAL (con tus ediciones) — arrástrala al timeline como clip"
         style="height:26px;image-rendering:pixelated;cursor:grab;border:1px solid #32323a;border-radius:3px;background:#0c0c10;">
</div>
<div class="mfse-err" id="mfse-err"></div>
        `;
        document.body.appendChild(style);
        document.body.appendChild(root);
        bindUI(root);
    }

    function err(msg) {
        const e = document.getElementById('mfse-err');
        if (!e) return;
        e.textContent = msg;
        e.style.display = msg ? 'block' : 'none';
    }

    function bindUI(root) {
        
        const setActive = (sel, btn) => {
            root.querySelectorAll(sel).forEach(b => b.classList.toggle('on', b === btn));
        };
        root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
        root.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => {
            state.tool = b.dataset.tool;
            setActive('[data-tool]', b);
        });
        root.querySelectorAll('[data-brush]').forEach(b => b.onclick = () => {
            state.brush = +b.dataset.brush;
            setActive('[data-brush]', b);
        });
        root.querySelectorAll('[data-layer]').forEach(b => b.onclick = () => {
            state.layer = b.dataset.layer;
            setActive('[data-layer]', b);
        });
        const colorInput = root.querySelector('input[type=color]');
        colorInput.oninput = () => { state.color = colorInput.value; };

        root.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
            switch (b.dataset.act) {
                case 'close': close(); break;
                case 'undo': restoreFrom(state.undo, state.redo); renderUI(); break;
                case 'redo': restoreFrom(state.redo, state.undo); renderUI(); break;
                case 'grid': state.grid = !state.grid; b.classList.toggle('on', state.grid); renderUI(); break;
                case 'revert': revert(); renderUI(); break;
                case 'save': savePreset(); break;
                case 'apply': applyPresetSel(); break;
                case 'delete': deletePresetSel(); break;
                case 'export': exportPNG(); break;
            }
        });

        const thumb = root.querySelector('#mfse-live-thumb');
        if (thumb) {
            thumb.addEventListener('dragstart', (ev) => {
                if (!state.texCanvas) return;
                thumb.dataset.dragging = '1';
                
                const c = document.createElement('canvas');
                c.width = HEAD.w; c.height = HEAD.h;
                const cx = c.getContext('2d');
                cx.imageSmoothingEnabled = false;
                cx.drawImage(state.texCanvas, HEAD.x, HEAD.y, HEAD.w, HEAD.h, 0, 0, HEAD.w, HEAD.h);
                const name = 'live-' + Date.now().toString(36);
                try {
                    const p = loadPresets();
                    p[name] = c.toDataURL('image/png');
                    storePresets(p);
                } catch { ev.preventDefault(); return; }
                ev.dataTransfer.setData('text/mf-head', name);
                ev.dataTransfer.setData('text/plain', name);
                ev.dataTransfer.effectAllowed = 'copy';
                
                try { ev.dataTransfer.setDragImage(thumb, 13, 13); } catch {}
            });
            thumb.addEventListener('dragend', () => { delete thumb.dataset.dragging; });
        }

        const cv = root.querySelector('canvas.mfse-cv');
        const cellOf = (e) => {
            const Z = zone();
            const r = cv.getBoundingClientRect();
            const x = Math.floor((e.clientX - r.left) / (r.width / Z.w));
            const y = Math.floor((e.clientY - r.top) / (r.height / Z.h));
            return { x: x + Z.x, y: y + Z.y };
        };
        cv.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const { x, y } = cellOf(e);
            if (!inZone(x, y)) return;
            if (state.tool === 'picker') {
                const c = pickColorAt(x, y);
                if (c) { state.color = c; colorInput.value = c; err(''); }
                else err('píxel transparente');
                return;
            }
            snapshot();
            if (state.tool === 'fill') { floodFill(x, y); renderUI(); return; }
            state.painting = true;
            state.lastCell = { x, y };
            cv.setPointerCapture(e.pointerId);
            paintCell(x, y, state.tool === 'eraser');
            renderUI();
        });
        cv.addEventListener('pointermove', (e) => {
            if (!state.painting) return;
            const { x, y } = cellOf(e);
            const l = state.lastCell;
            if (l && (l.x !== x || l.y !== y)) {
                lineCells(l.x, l.y, x, y, (cx, cy) => paintCell(cx, cy, state.tool === 'eraser'));
                state.lastCell = { x, y };
                renderUI();
            }
        });
        const stop = () => {
            state.painting = false;
            state.lastCell = null;
            
            if (state.p2pCells.length) {
                try {
                    window.MF_Peer?.sendLook?.({
                        a: 'stroke',
                        cells: state.p2pCells.length > 400 ? state.p2pCells.slice(-400) : state.p2pCells
                    });
                } catch {}
                state.p2pCells = [];
            }
        };
        cv.addEventListener('pointerup', stop);
        cv.addEventListener('pointercancel', stop);
    }

    function renderUI() {
        const cv = document.querySelector('#' + ID + ' canvas.mfse-cv');
        if (!cv || !state.texCanvas) return;
        const ctx = cv.getContext('2d');
        const Z = zone();
        const z = state.zoom, w = W(), h = H();
        ctx.imageSmoothingEnabled = false;

        for (let y = 0; y < h; y += 8) {
            for (let x = 0; x < w; x += 8) {
                ctx.fillStyle = ((x / 8 + y / 8) % 2) ? '#1b1b22' : '#22222b';
                ctx.fillRect(x, y, 8, 8);
            }
        }
        
        ctx.drawImage(state.texCanvas, Z.x, Z.y, Z.w, Z.h, 0, 0, w, h);

        if (state.grid) {
            ctx.strokeStyle = 'rgba(255,255,255,.06)';
            ctx.beginPath();
            for (let x = 0; x <= w; x += z) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); }
            for (let y = 0; y <= h; y += z) { ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); }
            ctx.stroke();
        }

        if (state.mode === 'full') {
            
            ctx.font = '9px system-ui';
            for (const p of BODY_PARTS) {
                for (const ox of [0, 32]) {
                    const r = p.base;
                    if (r.x + ox + r.w > Z.w) continue; 
                    ctx.strokeStyle = 'rgba(255,255,255,.28)';
                    ctx.strokeRect(r.x * z + .5, r.y * z + .5, r.w * z - 1, r.h * z - 1);
                    ctx.fillStyle = 'rgba(0,0,0,.55)';
                    ctx.fillRect(r.x * z + 1, r.y * z + 1, p.n.length * 5.5 + 4, 11);
                    ctx.fillStyle = '#c8c8d2';
                    ctx.fillText(p.n, r.x * z + 3, r.y * z + 10);
                }
            }
        } else {
            
            ctx.strokeStyle = 'rgba(255,255,255,.28)';
            ctx.beginPath();
            for (const gx of [0, 8, 16, 24, 40, 48, 56, 64]) { ctx.moveTo(gx * z + .5, 0); ctx.lineTo(gx * z + .5, h); }
            for (const gy of [0, 8, 16]) { ctx.moveTo(0, gy * z + .5); ctx.lineTo(w, gy * z + .5); }
            ctx.stroke();
            
            ctx.strokeStyle = '#ff6b2b';
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(OVERLAY_X * z + .5, 0); ctx.lineTo(OVERLAY_X * z + .5, h);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.font = '9px system-ui';
            for (const r of REGIONS) {
                for (const rx of [r.x, r.ov]) {
                    const isCara = r.n === 'CARA';
                    ctx.fillStyle = isCara ? 'rgba(255,107,43,.9)' : 'rgba(0,0,0,.55)';
                    ctx.fillRect(rx * z + 1, (r.y === 0 ? 0 : 8 * z) + 1, r.n.length * 5.5 + 4, 11);
                    ctx.fillStyle = isCara ? '#14141a' : '#c8c8d2';
                    ctx.fillText(r.n, rx * z + 3, (r.y === 0 ? 0 : 8 * z) + 10);
                }
            }
        }

        updateLiveThumb();
    }

    function updateLiveThumb() {
        const thumb = document.getElementById('mfse-live-thumb');
        if (!thumb || !state.texCanvas) return;
        
        if (thumb.dataset.dragging === '1') return;
        const c = document.createElement('canvas');
        c.width = HEAD.w; c.height = HEAD.h;
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(state.texCanvas, HEAD.x, HEAD.y, HEAD.w, HEAD.h, 0, 0, HEAD.w, HEAD.h);
        thumb.src = c.toDataURL('image/png');
    }

    function loadPresets() {
        try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
    }
    function storePresets(p) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) { err('no se pudo guardar: ' + e.message); }
    }
    function refreshPresetList() {
        const sel = document.getElementById('mfse-preset');
        if (!sel) return;
        const names = Object.keys(loadPresets());
        sel.innerHTML = '<option value="">— presets —</option>' +
            names.map(n => `<option value="${n}">${n}</option>`).join('');
    }
    function savePreset() {
        if (!state.texCanvas) return;
        const name = prompt('Nombre del preset de cabeza:', 'cabeza-' + (Object.keys(loadPresets()).length + 1));
        if (!name) return;
        
        const c = document.createElement('canvas');
        c.width = HEAD.w; c.height = HEAD.h;
        c.getContext('2d').drawImage(state.texCanvas, HEAD.x, HEAD.y, HEAD.w, HEAD.h, 0, 0, HEAD.w, HEAD.h);
        const p = loadPresets();
        p[name] = c.toDataURL('image/png');
        storePresets(p);
        refreshPresetList();
        
        window.dispatchEvent(new CustomEvent('mf:skineditor-presets'));
        err('');
    }
    function applyPresetSel() {
        const sel = document.getElementById('mfse-preset');
        const name = sel?.value;
        if (!name) { err('elige un preset primero'); return; }
        const data = loadPresets()[name];
        if (!data) return;
        const img = new Image();
        img.onload = () => {
            if (!state.texCanvas) return;
            snapshot();
            const ctx = state.texCanvas.getContext('2d');
            ctx.clearRect(HEAD.x, HEAD.y, HEAD.w, HEAD.h);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, img.width, img.height, HEAD.x, HEAD.y, HEAD.w, HEAD.h);
            state.tex.needsUpdate = true;
            emitZoneRect(); 
            renderUI();
        };
        img.src = data;
    }
    function deletePresetSel() {
        const sel = document.getElementById('mfse-preset');
        const name = sel?.value;
        if (!name) return;
        const p = loadPresets();
        delete p[name];
        storePresets(p);
        refreshPresetList();
        window.dispatchEvent(new CustomEvent('mf:skineditor-presets'));
    }
    function exportPNG() {
        if (!state.texCanvas) return;
        const a = document.createElement('a');
        const c = document.createElement('canvas');
        c.width = HEAD.w; c.height = HEAD.h;
        c.getContext('2d').drawImage(state.texCanvas, HEAD.x, HEAD.y, HEAD.w, HEAD.h, 0, 0, HEAD.w, HEAD.h);
        a.href = c.toDataURL('image/png');
        a.download = 'mf-cabeza-' + Date.now() + '.png';
        a.click();
    }

    function listPresets() {
        const p = loadPresets();
        return Object.entries(p).map(([name, dataURL]) => ({ name, thumb: dataURL }));
    }

    function applyPresetByName(name) {
        const data = loadPresets()[name];
        if (!data) return { ok: false, error: 'preset "' + name + '" no existe' };
        try { ensureWorkCanvas(); } catch (e) { return { ok: false, error: e.message }; }
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const ctx = state.texCanvas.getContext('2d');
                    snapshot();
                    ctx.clearRect(HEAD.x, HEAD.y, HEAD.w, HEAD.h);
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, 0, 0, img.width, img.height, HEAD.x, HEAD.y, HEAD.w, HEAD.h);
                    state.tex.needsUpdate = true;
                    emitZoneRect(); 
                    resolve({ ok: true, name });
                } catch (e) { resolve({ ok: false, error: e.message }); }
            };
            img.onerror = () => resolve({ ok: false, error: 'no se pudo cargar el preset' });
            img.src = data;
        });
    }

    function open() {
        if (state.open) { renderUI(); return; }
        try {
            ensureWorkCanvas();
        } catch (e) {
            console.warn(TAG, e.message);
            
            state.open = true;
            buildUI();
            err(e.message);
            return;
        }
        state.open = true;
        state.undo.length = 0; state.redo.length = 0;
        buildUI();
        refreshPresetList();
        renderUI();
        void 0;
    }

    function close() {
        
        document.getElementById(ID)?.remove();
        document.getElementById(ID + '-style')?.remove();
        state.open = false;
        state.painting = false;
    }

    function revert() {
        if (!state.mats.length) { err('no hay original guardado'); return; }
        try {
            for (const m of state.mats) {
                const o = state.orig.get(m);
                if (o) { m.map = o; m.needsUpdate = true; }
            }
        } catch {}
        state.tex = null; state.texCanvas = null;
        state.orig.clear(); state.mats = [];
        stopWatchdog();
        try { ensureWorkCanvas(); } catch (e) { err(e.message); return; }
        state.undo.length = 0; state.redo.length = 0;
        renderUI();
        err('');
        
        try { window.MF_Peer?.sendLook?.({ a: 'revert', what: 'head' }); } catch {}
    }

    window.MF_SkinEditor = {
        open, close, revert,
        presets: listPresets,          
        applyPreset: applyPresetByName,
        __tex: () => state.tex,        
        get isOpen() { return state.open; }
    };
    window.__MF_SkinEditor = true;

    void 0;
})();
