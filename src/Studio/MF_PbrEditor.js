
(function () {
    'use strict';
    if (window.__MF_PbrEditor) return;
    const TAG = '[MF PbrEditor]';
    const ID = 'mf-pbreditor';
    const LS_MANUAL = 'mf_pbr_manual';

    const TILE = 16;   
    const ZOOM = 14;   

    const KINDS = [
        { id: 'n', label: '⛰ Relieve', hint: 'blanco = alto' },
        { id: 's', label: '✨ Brillo', hint: 'blanco = refleja' },
        { id: 'e', label: '🔥 Emisivo', hint: 'blanco = emite luz' }
    ];

    const state = {
        open: false,
        grid: true,
        frames: null,          
        tiles: [],             
        filtered: [],
        sel: null,             
        kind: 'n',
        work: null,            
        stampN: new Map(),     
        stampS: new Map(),     
        stampE: new Map(),
        tool: 'height',        
        strength: 1.0,         
        brush: 2,              
        painting: false, lastCell: null,
        undo: [], redo: []
    };

    function el(id) { return document.getElementById(id); }

    function err(input) {
        const e = el(ID + '-err');
        if (!input) {
            state.errKey = null; state.errVars = null;
            if (e) { e.textContent = ''; e.style.display = 'none'; }
            return;
        }
        if (typeof input === 'string') {
            state.errKey = null; state.errVars = null;
            if (e) { e.textContent = input; e.style.display = 'block'; }
            return;
        }
        state.errKey = input.key; state.errVars = input.vars || {};
        if (e) { e.textContent = t(input.key, input.vars || {}); e.style.display = 'block'; }
    }

    function stampsOf(kind) {
        return kind === 'n' ? state.stampN : (kind === 's' ? state.stampS : state.stampE);
    }

    function texOf(kind) { return window.MF_PBR?.__tex?.(kind) || null; }

    let atlasCv = { n: null, s: null, e: null };
    function atlasCanvas(kind) {
        if (atlasCv[kind]) return atlasCv[kind];
        const tex = texOf(kind);
        const img = tex?.image;
        if (!img) return null;
        const c = document.createElement('canvas');
        c.width = img.width || 1024;
        c.height = img.height || 1024;
        c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
        tex.image = c;
        tex.needsUpdate = true;
        atlasCv[kind] = c;
        return c;
    }

    function needsUpdate(kind) {
        const tex = texOf(kind);
        if (tex) tex.needsUpdate = true;
    }

    async function loadFrames() {
        if (state.frames) return state.frames;
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
                const res = await fetch(chrome.runtime.getURL('assets/frames.json'));
                state.frames = await res.json();
            }
        } catch (e) {
            console.warn(TAG, 'fetch directo de frames.json falló (esperando al panel):', e);
        }
        return state.frames;
    }

    document.addEventListener('minifeather:pbr-editor-frames', (ev) => {
        try {
            const frames = JSON.parse(ev.detail);
            if (!frames || typeof frames !== 'object') return;
            if (state.frames) return;  
            state.frames = frames;
            buildTiles();
            const q = el(ID + '-search')?.value || '';
            filterTiles(q);
            err('');
        } catch (e) {
            console.warn(TAG, 'frames del panel ilegibles:', e);
        }
    });

    document.addEventListener('minifeather:pbr-editor-open', (ev) => {
        try {
            const d = JSON.parse(ev.detail);
            if (d.strings && typeof d.strings === 'object') {
                
                const i18n = globalThis.MiniFeatherI18n;
                if (i18n) {
                    i18n.register(d.strings);
                    if (d.language) i18n.setLanguage(d.language);
                } else {
                    
                    state.i18n = state.i18n || { lang: d.language || 'en', strings: {} };
                    Object.assign(state.i18n.strings, d.strings);
                    if (d.language) state.i18n.lang = d.language;
                }
            }
            if (d.language && globalThis.MiniFeatherI18n) {
                globalThis.MiniFeatherI18n.setLanguage(d.language);
            }
            
            if (state.open) {
                refreshTexts();
            }
        } catch (e) {
            console.warn(TAG, 'i18n del panel ilegible:', e);
        }
    });

    function t(key, vars) {
        const i18n = globalThis.MiniFeatherI18n;
        if (i18n?.t) {
            try { return i18n.t(key, vars); } catch (_) {}
        }
        if (state.i18n?.strings?.[key]) {
            const v = state.i18n.strings[key][state.i18n.lang] || state.i18n.strings[key].en || key;
            return String(v).replace(/\{(\w+)\}/g, (_, k) => (vars && k in vars) ? vars[k] : '');
        }
        return key;
    }

    function buildTiles() {
        state.tiles = [];
        if (!state.frames) return;
        for (const [fileName, data] of Object.entries(state.frames)) {
            const f = data.frame || {};
            const w = f.w || 16, h = f.h || 16;
            if (w !== 16 || h !== 16) continue;   
            state.tiles.push({
                name: fileName.replace(/\.png$/, ''),
                x: f.x || 0, y: f.y || 0, w, h
            });
        }
        state.tiles.sort((a, b) => a.name.localeCompare(b.name));
    }

    function filterTiles(q) {
        const needle = String(q || '').toLowerCase().trim();
        state.filtered = !needle
            ? state.tiles.slice()
            : state.tiles.filter(t => t.name.includes(needle));
        renderTileList();
    }

    function heightToNormal(srcData, strength) {
        const w = srcData.width, h = srcData.height;
        const src = srcData.data;
        const out = new ImageData(w, h);
        const at = (x, y) => {
            const xx = ((x % w) + w) % w, yy = ((y % h) + h) % h;
            return src[(yy * w + xx) * 4];
        };
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
                    - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
                const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
                    - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
                const nx = -gx * strength / 255;
                const ny = -gy * strength / 255;
                const len = Math.sqrt(nx * nx + ny * ny + 1);
                const p = (y * w + x) * 4;
                out.data[p] = Math.round((nx / len * 0.5 + 0.5) * 255);
                out.data[p + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
                out.data[p + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
                out.data[p + 3] = 255;
            }
        }
        return out;
    }

    function tileHeightFromAtlas(tile) {
        const c = document.createElement('canvas');
        c.width = tile.w; c.height = tile.h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const cv = atlasCanvas('n');
        if (cv) ctx.drawImage(cv, tile.x, tile.y, tile.w, tile.h, 0, 0, tile.w, tile.h);
        else { ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, tile.w, tile.h); }
        const d = ctx.getImageData(0, 0, tile.w, tile.h);
        const w = tile.w, h = tile.h;
        const nx = new Float32Array(w * h), ny = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) {
            nx[i] = (d.data[i * 4] / 255) * 2 - 1;
            ny[i] = (d.data[i * 4 + 1] / 255) * 2 - 1;
        }
        const height = new Float32Array(w * h);
        for (let y = 0; y < h; y++) {
            let acc = 0;
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (x > 0) acc += -nx[i] * 3;   
                height[i] = acc;
            }
        }
        let mn = Infinity, mx = -Infinity;
        for (const v of height) { if (v < mn) mn = v; if (v > mx) mx = v; }
        const rng = (mx - mn) || 1;
        const out = ctx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
            const g = Math.round((height[i] - mn) / rng * 255);
            out.data[i * 4] = g; out.data[i * 4 + 1] = g; out.data[i * 4 + 2] = g;
            out.data[i * 4 + 3] = 255;
        }
        return out;
    }

    function snapshot() {
        if (!state.work) return;
        const ctx = state.work.getContext('2d', { willReadFrequently: true });
        state.undo.push(ctx.getImageData(0, 0, state.work.width, state.work.height));
        if (state.undo.length > 40) state.undo.shift();
        state.redo.length = 0;
    }

    function restoreFrom(a, b) {
        if (!state.work || !a.length) return;
        const ctx = state.work.getContext('2d', { willReadFrequently: true });
        b.push(ctx.getImageData(0, 0, state.work.width, state.work.height));
        ctx.putImageData(a.pop(), 0, 0);
        commitTile();
        renderCanvas();
    }

    function paintCell(x, y, dig) {
        if (!state.work) return;
        const ctx = state.work.getContext('2d', { willReadFrequently: true });
        const r = state.brush;
        if (state.tool === 'smooth') { smoothAt(ctx, x, y, r); return; }

        if (state.tool === 'flat') {
            ctx.fillStyle = state.kind === 'n' ? 'rgb(128,128,128)' : 'rgb(0,0,0)';
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy > r * r) continue;
                    ctx.fillRect(x + dx, y + dy, 1, 1);
                }
            }
            return;
        }

        const W = state.work.width, H = state.work.height;
        const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r);
        const x1 = Math.min(W - 1, x + r), y1 = Math.min(H - 1, y + r);
        if (x1 < x0 || y1 < y0) return;
        const img = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
        const d = img.data;
        const amount = Math.round(70 * state.strength);
        for (let yy = y0; yy <= y1; yy++) {
            for (let xx = x0; xx <= x1; xx++) {
                const dx = xx - x, dy = yy - y;
                if (dx * dx + dy * dy > r * r) continue;
                const p = ((yy - y0) * (x1 - x0 + 1) + (xx - x0)) * 4;
                const v = d[p];
                const nv = dig ? Math.max(0, v - amount) : Math.min(255, v + amount);
                d[p] = d[p + 1] = d[p + 2] = nv; d[p + 3] = 255;
            }
        }
        ctx.putImageData(img, x0, y0);
    }

    function smoothAt(ctx, x, y, r) {
        
        if (r === 0) return;
        const W = state.work.width, H = state.work.height;
        const src = ctx.getImageData(0, 0, W, H);
        const dst = ctx.createImageData(W, H);
        dst.data.set(src.data);
        const at = (xx, yy) => {
            const xi = Math.max(0, Math.min(W - 1, xx));
            const yi = Math.max(0, Math.min(H - 1, yy));
            return src.data[(yi * W + xi) * 4];
        };
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                const v = Math.round(
                    (at(xx - 1, yy) + at(xx + 1, yy) + at(xx, yy - 1) + at(xx, yy + 1) + 2 * at(xx, yy)) / 6);
                const p = (yy * W + xx) * 4;
                dst.data[p] = v; dst.data[p + 1] = v; dst.data[p + 2] = v; dst.data[p + 3] = 255;
            }
        }
        ctx.putImageData(dst, 0, 0);
    }

    function lineCells(x0, y0, x1, y1, cb) {
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let e = dx - dy;
        for (;;) {
            cb(x0, y0);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * e;
            if (e2 > -dy) { e -= dy; x0 += sx; }
            if (e2 < dx) { e += dx; y0 += sy; }
        }
    }

    function commitTile() {
        const t = state.sel;
        if (!t || !state.work) return;
        const ctx = state.work.getContext('2d', { willReadFrequently: true });
        const data = ctx.getImageData(0, 0, t.w, t.h);
        if (state.kind === 'n') {
            state.stampN.set(t.name, data);
            const cv = atlasCanvas('n');
            if (!cv) return;
            cv.getContext('2d', { willReadFrequently: true })
                .putImageData(heightToNormal(data, state.strength), t.x, t.y);
            needsUpdate('n');
        } else {
            stampsOf(state.kind).set(t.name, data);
            const cv = atlasCanvas(state.kind);
            if (!cv) return;
            cv.getContext('2d', { willReadFrequently: true }).putImageData(data, t.x, t.y);
            needsUpdate(state.kind);
        }
    }

    function selectTile(name) {
        const t = state.tiles.find(x => x.name === name);
        if (!t) return;
        state.sel = t;
        state.undo = []; state.redo = [];
        state.work = document.createElement('canvas');
        state.work.width = t.w; state.work.height = t.h;
        const ctx = state.work.getContext('2d', { willReadFrequently: true });
        if (state.kind === 'n') {
            const cached = state.stampN.get(name);
            if (cached) ctx.putImageData(cached, 0, 0);
            else ctx.putImageData(tileHeightFromAtlas(t), 0, 0);
        } else {
            const cached = stampsOf(state.kind).get(name);
            if (cached) ctx.putImageData(cached, 0, 0);
            else {
                const cv = atlasCanvas(state.kind);
                if (cv) ctx.drawImage(cv, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
                else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, t.w, t.h); }
            }
        }
        renderTileList();
        renderCanvas();
        renderRef();
    }

    function setKind(k) {
        state.kind = k;
        document.querySelectorAll('#' + ID + ' [data-kind]').forEach(b =>
            b.classList.toggle('on', b.dataset.kind === k));
        const hint = document.querySelector('#' + ID + ' [data-kind-hint]');
        if (hint) hint.textContent = KINDS.find(x => x.id === k)?.hint || '';
        if (state.sel) selectTile(state.sel.name);
        else renderTileList();
    }

    function renderCanvas() {
        const cv = el(ID + '-cv');
        if (!cv) return;
        const ctx = cv.getContext('2d');
        const t = state.sel;
        const w = t ? t.w * ZOOM : TILE * ZOOM;
        const h = t ? t.h * ZOOM : TILE * ZOOM;
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#0c0c10';
        ctx.fillRect(0, 0, w, h);
        if (!t || !state.work) {
            ctx.fillStyle = '#4a4a55';
            ctx.font = '11px system-ui';
            ctx.fillText('← elige una textura de la lista', 14, h / 2);
            return;
        }
        
        ctx.drawImage(state.work, 0, 0, w, h);
        if (state.grid) {
            ctx.strokeStyle = 'rgba(255,255,255,.07)';
            ctx.beginPath();
            for (let x = 0; x <= t.w; x++) { ctx.moveTo(x * ZOOM + .5, 0); ctx.lineTo(x * ZOOM + .5, h); }
            for (let y = 0; y <= t.h; y++) { ctx.moveTo(0, y * ZOOM + .5); ctx.lineTo(w, y * ZOOM + .5); }
            ctx.stroke();
        }
        
        ctx.font = '9px system-ui';
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(2, 2, t.name.length * 5.5 + 4, 11);
        ctx.fillStyle = '#c8c8d2';
        ctx.fillText(t.name, 4, 11);
    }

    function renderTileList() {
        const list = el(ID + '-list');
        if (!list) return;
        const max = 80;
        const items = state.filtered.slice(0, max);
        list.innerHTML = items.map(t => `
            <div class="mfpe-item ${state.sel?.name === t.name ? 'sel' : ''}" data-tile="${t.name}" title="${t.name}">
                <canvas width="16" height="16" data-thumb="${t.name}"></canvas>
                <span>${t.name}</span>
            </div>`).join('') +
            (state.filtered.length > max
                ? `<div class="mfpe-more">+${state.filtered.length - max} más — afina la búsqueda</div>`
                : '');
        const cv = atlasCanvas(state.kind);
        for (const item of list.querySelectorAll('[data-thumb]')) {
            const t = state.tiles.find(x => x.name === item.dataset.thumb);
            const ictx = item.getContext('2d');
            ictx.imageSmoothingEnabled = false;
            if (t && cv) ictx.drawImage(cv, t.x, t.y, t.w, t.h, 0, 0, 16, 16);
            else {
                ictx.fillStyle = state.kind === 'n' ? '#8080ff' : '#000';
                ictx.fillRect(0, 0, 16, 16);
            }
        }
        list.querySelectorAll('[data-tile]').forEach(d => {
            d.onclick = () => selectTile(d.dataset.tile);
        });
    }

    function renderRef() {
        const ref = el(ID + '-ref');
        if (!ref) return;
        const t = state.sel;
        const ictx = ref.getContext('2d');
        ictx.imageSmoothingEnabled = false;
        ictx.fillStyle = '#111';
        ictx.fillRect(0, 0, ref.width, ref.height);
        if (!t) return;
        const diff = window.MF_PBR?.__diffuse?.();
        if (diff) ictx.drawImage(diff, t.x, t.y, t.w, t.h, 0, 0, ref.width, ref.height);
    }

    function idbPut(key, value) {
        return new Promise((resolve) => {
            const req = indexedDB.open('mf_pbr_store', 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains('atlases')) {
                    req.result.createObjectStore('atlases');
                }
            };
            req.onsuccess = () => {
                const db = req.result;
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

    async function applyPack() {
        let saved = 0;
        for (const kind of ['n', 's', 'e']) {
            const cv = atlasCanvas(kind);
            if (!cv) continue;
            const placed = Math.max(stampsOf(kind).size, 1);
            const ok = await idbPut('atlas_' + kind, { dataUrl: cv.toDataURL('image/png'), placed });
            if (ok) saved++;
        }
        if (saved) {
            try { localStorage.setItem(LS_MANUAL, '1'); } catch (_) {}
            err({ key: 'pbrEditorSavedOk', vars: { n: saved } });
        } else {
            err({ key: 'pbrEditorSaveEmpty' });
        }
    }

    function crc32(buf) {
        let table = crc32.table;
        if (!table) {
            table = crc32.table = new Int32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                table[n] = c;
            }
        }
        let crc = -1;
        for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
        return (crc ^ -1) >>> 0;
    }

    function dataUrlToBytes(dataUrl) {
        const b64 = dataUrl.split(',')[1];
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function makeZip(files) {
        
        const enc = new TextEncoder();
        const parts = [];
        const central = [];
        let offset = 0;
        const date = ((2024 - 1980) << 9) | (1 << 5) | 1;
        const time = 0;
        for (const f of files) {
            const nameB = enc.encode(f.name);
            const crc = crc32(f.bytes);
            const lh = new DataView(new ArrayBuffer(30));
            lh.setUint32(0, 0x04034b50, true);
            lh.setUint16(4, 20, true);
            lh.setUint16(8, 0, true);
            lh.setUint16(10, time, true);
            lh.setUint16(12, date, true);
            lh.setUint32(14, crc, true);
            lh.setUint32(18, f.bytes.length, true);
            lh.setUint32(22, f.bytes.length, true);
            lh.setUint16(26, nameB.length, true);
            parts.push(new Uint8Array(lh.buffer), nameB, f.bytes);
            const ch = new DataView(new ArrayBuffer(46));
            ch.setUint32(0, 0x02014b50, true);
            ch.setUint16(4, 20, true);
            ch.setUint16(6, 20, true);
            ch.setUint16(12, time, true);
            ch.setUint16(14, date, true);
            ch.setUint32(16, crc, true);
            ch.setUint32(20, f.bytes.length, true);
            ch.setUint32(24, f.bytes.length, true);
            ch.setUint16(28, nameB.length, true);
            ch.setUint32(42, offset, true);
            central.push(new Uint8Array(ch.buffer), nameB);
            offset += 30 + nameB.length + f.bytes.length;
        }
        let cdSize = 0;
        for (const c of central) cdSize += c.length;
        const eocd = new DataView(new ArrayBuffer(22));
        eocd.setUint32(0, 0x06054b50, true);
        eocd.setUint16(8, files.length, true);
        eocd.setUint16(10, files.length, true);
        eocd.setUint32(12, cdSize, true);
        eocd.setUint32(16, offset, true);
        const all = [...parts, ...central, new Uint8Array(eocd.buffer)];
        let total = 0;
        for (const a of all) total += a.length;
        const out = new Uint8Array(total);
        let pos = 0;
        for (const a of all) { out.set(a, pos); pos += a.length; }
        return out;
    }

    async function exportPack() {
        const files = [];
        for (const kind of ['n', 's', 'e']) {
            const stamps = stampsOf(kind);
            if (!stamps.size) continue;
            for (const [name, data] of stamps) {
                const t = state.tiles.find(x => x.name === name);
                if (!t) continue;
                const c = document.createElement('canvas');
                c.width = t.w; c.height = t.h;
                const cx = c.getContext('2d');
                if (kind === 'n') {
                    cx.putImageData(heightToNormal(data, state.strength), 0, 0);
                } else {
                    cx.putImageData(data, 0, 0);
                }
                files.push({ name: name + '_' + kind + '.png', bytes: dataUrlToBytes(c.toDataURL('image/png')) });
            }
        }
        if (!files.length) { err('nada que exportar — pinta algo primero'); return; }
        const blob = new Blob([makeZip(files)], { type: 'application/zip' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'mf-pbr-pack.zip';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        err('');
    }

    function resetTile() {
        const t = state.sel;
        if (!t) return;
        state.stampN.delete(t.name);
        state.stampS.delete(t.name);
        state.stampE.delete(t.name);
        for (const kind of ['n', 's', 'e']) {
            const cv = atlasCanvas(kind);
            if (!cv) continue;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.fillStyle = kind === 'n' ? '#8080ff' : '#000';
            ctx.fillRect(t.x, t.y, t.w, t.h);
            needsUpdate(kind);
        }
        selectTile(t.name);
    }

    function buildUI() {
        if (el(ID)) return;
        const style = document.createElement('style');
        style.id = ID + '-style';
        style.textContent = `
#${ID} { position:fixed; top:70px; right:16px; z-index:2147483000;
  background:#14141a; border:1px solid #32323a; border-radius:8px;
  box-shadow:0 8px 32px rgba(0,0,0,.6); color:#e8e8ee;
  font:12px/1.4 system-ui,sans-serif; user-select:none;
  width:660px; max-width:calc(100vw - 32px); max-height:calc(100vh - 100px);
  display:flex; flex-direction:column; }
#${ID} .mfpe-head { display:flex; align-items:center; gap:8px; padding:8px 10px;
  border-bottom:1px solid #26262e; font-weight:700; letter-spacing:.5px; }
#${ID} .mfpe-head .dot { width:8px; height:8px; border-radius:50%;
  background:#4dff88; animation:mfpe-pulse 1.5s infinite; }
@keyframes mfpe-pulse { 50% { opacity:.35; } }
#${ID} .mfpe-head button { margin-left:auto; }
#${ID} .mfpe-body { display:flex; flex:1; min-height:0; }
#${ID} .mfpe-side { width:225px; border-right:1px solid #202028; display:flex;
  flex-direction:column; min-height:0; }
#${ID} .mfpe-side input { margin:8px; padding:4px 8px; background:#1c1c24;
  color:#e8e8ee; border:1px solid #3a3a44; border-radius:4px; font:inherit; }
#${ID} .mfpe-list { flex:1; overflow-y:auto; padding:0 8px 8px; }
#${ID} .mfpe-item { display:flex; align-items:center; gap:6px; padding:3px 4px;
  border-radius:4px; cursor:pointer; }
#${ID} .mfpe-item:hover { background:#1e1e26; }
#${ID} .mfpe-item.sel { background:#2a2a34; outline:1px solid #ff6b2b; }
#${ID} .mfpe-item canvas { width:20px; height:20px; flex:none;
  image-rendering:pixelated; border:1px solid #2a2a32; border-radius:2px; }
#${ID} .mfpe-item span { font-size:11px; overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap; }
#${ID} .mfpe-more { padding:6px; color:#6a6a76; font-size:10px; }
#${ID} .mfpe-main { flex:1; padding:8px 10px; display:flex; flex-direction:column;
  min-height:0; overflow-y:auto; }
#${ID} canvas.mfpe-cv { display:block; border:1px solid #32323a;
  image-rendering:pixelated; cursor:crosshair; background:#0c0c10; }
#${ID} .mfpe-row { display:flex; align-items:center; gap:6px; padding:6px 0;
  flex-wrap:wrap; }
#${ID} .mfpe-row + .mfpe-row { border-top:1px solid #202028; }
#${ID} button { background:#23232c; color:#e8e8ee; border:1px solid #3a3a44;
  border-radius:4px; padding:3px 8px; cursor:pointer; font:inherit; }
#${ID} button:hover { background:#2e2e3a; }
#${ID} button.on { background:#ff6b2b; color:#14141a; border-color:#ff6b2b;
  font-weight:700; }
#${ID} button.warn { background:#5a2020; color:#ff8080; border-color:#804040; }
#${ID} input[type=range] { accent-color:#ff6b2b; width:100px; }
#${ID} label { color:#9a9aa6; }
#${ID} .mfpe-err { color:#8adf8a; padding:4px 10px; display:none;
  border-top:1px solid #202028; }
        `;
        const root = document.createElement('div');
        root.id = ID;
        root.innerHTML = `
<div class="mfpe-head"><span class="dot"></span><span data-i18n="pbrEditorTitle">⛰ EDITOR PBR — relieve en vivo</span>
    <button data-act="close" data-i18n-title="pbrEditorClose" title="Cerrar">✕</button></div>
<div class="mfpe-body">
    <div class="mfpe-side">
        <input type="text" id="${ID}-search" data-i18n-placeholder="pbrEditorSearch" placeholder="buscar (stone, dirt…)" autocomplete="off">
        <div class="mfpe-list" id="${ID}-list"></div>
    </div>
    <div class="mfpe-main">
        <div class="mfpe-row">
            <label data-i18n="pbrEditorChannel">Canal:</label>
            ${KINDS.map(k => `<button data-kind="${k.id}" class="${k.id === 'n' ? 'on' : ''}" data-i18n-title="pbrEditorKind_${k.id}" title="${k.hint}">${k.label}</button>`).join('')}
            <span data-kind-hint style="color:#6a6a76;font-size:10px;">${t('pbrEditorHintN')}</span>
        </div>
        <div class="mfpe-row">
            <button data-tool="height" class="on" data-i18n-title="pbrEditorReliefUp" title="Elevar (clic derecho o Alt = hundir)">⛰</button>
            <button data-tool="smooth" data-i18n-title="pbrEditorReliefSmooth" title="Suavizar relieve">🌊</button>
            <button data-tool="flat" data-i18n-title="pbrEditorReliefFlat" title="Aplanar (neutral)">▭</button>
            <button data-tool="picker" data-i18n-title="pbrEditorReliefPicker" title="Cuentagotas">💧</button>
            <span style="color:#9a9aa6;" data-i18n="pbrEditorBrush">Pincel</span>
            <button data-brush="0" data-i18n-title="pbrEditorBrush1" title="1 px (preciso)">1px</button>
            <button data-brush="1" data-i18n-title="pbrEditorBrush3" title="3×3 (3 px)">3</button>
            <button data-brush="2" class="on" data-i18n-title="pbrEditorBrush5" title="5×5 (5 px)">5</button>
            <button data-brush="3" data-i18n-title="pbrEditorBrush7" title="7×7 (7 px)">7</button>
            <label data-i18n="pbrEditorStrength">Intensidad <input type="range" min="0.3" max="3" step="0.1" value="1" data-str></label>
            <button data-act="undo" data-i18n-title="pbrEditorUndo" title="Deshacer">↩</button>
            <button data-act="redo" data-i18n-title="pbrEditorRedo" title="Rehacer">↪</button>
            <button data-act="grid" class="on" data-i18n-title="pbrEditorGrid" title="Rejilla">▦</button>
        </div>
        <div class="mfpe-row" style="justify-content:center; gap:14px;">
            <canvas class="mfpe-cv" id="${ID}-cv" width="${TILE * ZOOM}" height="${TILE * ZOOM}"></canvas>
            <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                <canvas id="${ID}-ref" width="16" height="16" style="width:112px;height:112px;
                    image-rendering:pixelated; border:1px solid #32323a; border-radius:4px; background:#0c0c10;"></canvas>
                <span style="font-size:9px;color:#6a6a76;" data-i18n="pbrEditorDiffuse">textura del juego</span>
            </div>
        </div>
        <div class="mfpe-row">
            <button data-act="apply" data-i18n-title="pbrEditorApply" title="Guardar el pack editado (persiste tras F5)">💾 <span data-i18n="pbrEditorApplyLabel">Aplicar</span></button>
            <button data-act="export" data-i18n-title="pbrEditorExport" title="Descargar ZIP con PNGs _n/_s/_e (re-importable)">⬇ ZIP</button>
            <button data-act="reset-tile" class="warn" data-i18n-title="pbrEditorResetTile" title="Restaurar este tile a neutro">↺ <span data-i18n="pbrEditorResetTileLabel">tile</span></button>
        </div>
    </div>
</div>
<div class="mfpe-err" id="${ID}-err"></div>
        `;
        document.body.appendChild(style);
        document.body.appendChild(root);
        bindUI(root);
        refreshTexts();
    }

    function refreshTexts() {
        const root = el(ID);
        if (!root) return;
        
        root.querySelectorAll('[data-i18n]').forEach(node => {
            const k = node.getAttribute('data-i18n');
            if (!k) return;
            
            const childEls = [...node.childNodes].filter(n => n.nodeType === 1);
            if (childEls.length === 0) {
                node.textContent = t(k);
            } else {
                
                const txt = t(k);
                let placed = false;
                childEls.forEach((c, i) => {
                    if (c.tagName === 'INPUT' || c.tagName === 'CANVAS') {
                        if (!placed && i > 0) {
                            c.textContent = txt;
                            placed = true;
                        }
                    } else if (c.hasAttribute && c.hasAttribute('data-i18n')) {
                        
                    } else {
                        c.textContent = '';
                    }
                });
                if (!placed) {
                    
                    node.insertBefore(document.createTextNode(txt), node.firstChild);
                }
            }
        });
        
        root.querySelectorAll('[data-i18n-title]').forEach(node => {
            const k = node.getAttribute('data-i18n-title');
            if (k) node.setAttribute('title', t(k));
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
            const k = node.getAttribute('data-i18n-placeholder');
            if (k) node.setAttribute('placeholder', t(k));
        });
        
        const hint = root.querySelector('[data-kind-hint]');
        if (hint) hint.textContent = t('pbrEditorKind_' + state.kind) || hint.textContent;
        
        const e = el(ID + '-err');
        if (e && e.textContent && state.errKey) e.textContent = t(state.errKey, state.errVars);
    }

    function bindUI(root) {
        const setActive = (sel, btn) => {
            root.querySelectorAll(sel).forEach(b => b.classList.toggle('on', b === btn));
        };
        root.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => setKind(b.dataset.kind));
        root.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => {
            state.tool = b.dataset.tool;
            setActive('[data-tool]', b);
        });
        root.querySelectorAll('[data-brush]').forEach(b => b.onclick = () => {
            state.brush = +b.dataset.brush;
            setActive('[data-brush]', b);
        });
        root.querySelector('[data-str]').oninput = (e) => {
            state.strength = +e.target.value;
            if (state.sel && state.stampN.has(state.sel.name)) {
                
                const t = state.sel;
                const cv = atlasCanvas('n');
                if (cv) {
                    cv.getContext('2d', { willReadFrequently: true })
                        .putImageData(heightToNormal(state.stampN.get(t.name), state.strength), t.x, t.y);
                    needsUpdate('n');
                }
            }
        };
        root.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
            switch (b.dataset.act) {
                case 'close': close(); break;
                case 'undo': restoreFrom(state.undo, state.redo); break;
                case 'redo': restoreFrom(state.redo, state.undo); break;
                case 'grid': state.grid = !state.grid; b.classList.toggle('on', state.grid); renderCanvas(); break;
                case 'apply': applyPack(); break;
                case 'reset-tile': resetTile(); break;
                case 'export': exportPack(); break;
            }
        });
        const search = root.querySelector('#' + ID + '-search');
        search.oninput = () => filterTiles(search.value);

        const cv = root.querySelector('canvas.mfpe-cv');
        const cellOf = (e) => {
            const t = state.sel;
            const r = cv.getBoundingClientRect();
            const x = Math.floor((e.clientX - r.left) / (r.width / t.w));
            const y = Math.floor((e.clientY - r.top) / (r.height / t.h));
            return { x, y };
        };
        cv.addEventListener('contextmenu', (e) => e.preventDefault());
        cv.addEventListener('pointerdown', (e) => {
            if (!state.sel || !state.work) return;
            e.preventDefault();
            const { x, y } = cellOf(e);
            if (state.tool === 'picker') {
                const d = state.work.getContext('2d').getImageData(x, y, 1, 1).data;
                err({ key: 'pbrEditorPickerInfo', vars: { v: d[0], p: Math.round(d[0] / 2.55) } });
                return;
            }
            snapshot();
            state.painting = true;
            state.lastCell = { x, y };
            try { cv.setPointerCapture(e.pointerId); } catch (_) {}
            const dig = e.button === 2 || e.altKey;
            paintCell(x, y, dig);
            commitTile();
            renderCanvas();
        });
        cv.addEventListener('pointermove', (e) => {
            if (!state.painting || !state.sel) return;
            const { x, y } = cellOf(e);
            const l = state.lastCell;
            if (l && (l.x !== x || l.y !== y)) {
                const dig = e.buttons === 2 || e.altKey;
                lineCells(l.x, l.y, x, y, (cx, cy) => paintCell(cx, cy, dig));
                state.lastCell = { x, y };
                commitTile();
                renderCanvas();
            }
        });
        const stop = () => { state.painting = false; state.lastCell = null; };
        cv.addEventListener('pointerup', stop);
        cv.addEventListener('pointercancel', stop);
    }

    function pbrReady() {
        try {
            const st = window.MF_PBR?.status?.();
            return !!(st && (st.kinds?.n || st.kinds?.s || st.kinds?.e));
        } catch (_) { return false; }
    }

    async function open() {
        if (state.open) return;
        if (!pbrReady()) {
            console.warn(TAG, 'PBR no listo — activa PBR Textures e instala un pack primero');
        }
        state.open = true;
        buildUI();
        await loadFrames();
        buildTiles();
        filterTiles('');
        renderCanvas();
        if (!state.tiles.length) {
            err('sin lista de texturas — cierra/abre de nuevo desde el botón de la GUI');
        }
        void 0;
    }

    function close() {
        el(ID)?.remove();
        el(ID + '-style')?.remove();
        state.open = false;
        state.painting = false;
    }

    document.addEventListener('minifeather:pbr-editor-open', () => open());

    window.MF_PbrEditor = { open, close, get isOpen() { return state.open; } };
    window.__MF_PbrEditor = true;
    void 0;
})();
