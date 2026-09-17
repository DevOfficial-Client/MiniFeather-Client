
(function () {
    'use strict';

    if (window.__MF_Studio) return;
    const TAG = '[MF Studio]';

    const TPS = 20;
    const ID = 'mf-studio';
    const CSS = `
#mf-studio * { box-sizing: border-box; margin: 0; padding: 0; }
/* ═══ Estilo BBS (replicación visual del mod) ═══
   Paleta: ACTIVE #0088FF · CURSOR #57F52A · fondo panel #001B33
   (primaryColor × 0.2) · CONTROL_BAR #141417 · A50 rgba(0,0,0,.53) ·
   A75 rgba(0,0,0,.73) · TODO cuadrado, texto con sombra 1px estilo MC */
#mf-studio {
    position: fixed; inset: 0; z-index: 2147483000;
    display: flex; flex-direction: column;
    font-family: 'Consolas', 'Courier New', monospace;
    background: transparent; color: #e8e8ec;
    pointer-events: none;
}
#mf-studio * { text-shadow: 1px 1px 0 rgba(0,0,0,.8); }
#mf-studio .panel {
    background: rgba(0,0,0,.73); pointer-events: auto;
}
/* ── editor principal: [main 66% | derecha 34% | iconBar 20px] ──
   Los paneles son OPACOS (como BBS): la escena del juego solo se ve
   a través del hueco del preview (ventana única a la escena) */
#mf-studio-main { flex: 1; display: flex; min-height: 0; position: relative; }
#mf-studio-mainzone {
    flex: 0 0 66%; display: flex; flex-direction: column;
    min-width: 0; position: relative; background: #001B33;
    pointer-events: auto; border-right: 1px solid rgba(255,255,255,.13);
}
#mf-studio-rightzone {
    flex: 1; display: flex; flex-direction: column; min-width: 0;
}
#mf-studio-preview {
    flex: 1; position: relative; min-height: 0;
    background: transparent; /* hueco: ventana al canvas del juego */
    border-bottom: 1px solid rgba(255,255,255,.13);
    pointer-events: auto; /* CRÍTICO: sin esto los clicks atraviesan al
                             canvas del juego y re-atrapan el ratón */
}
/* lienzo de trayectoria de cámara (overlay encima del juego) */
#mf-studio-traj {
    position: absolute; inset: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 5;
}
#mf-studio-traj.hint .traj-hint {
    display: block;
}
#mf-studio-traj .traj-hint {
    display: none;
    position: absolute; left: 8px; bottom: 26px;
    font-size: 11px; line-height: 1.5; color: #9ecbff;
    text-shadow: 1px 1px 0 rgba(0,0,0,.9);
    white-space: pre; pointer-events: none;
}
#mf-studio-right {
    height: 50%; padding: 0; overflow-y: auto;
    background: #001B33; border-top: 1px solid rgba(255,255,255,.13);
    pointer-events: auto;
}
/* ── iconBar lateral derecha (20px, BBS) ── */
#mf-studio-iconbar {
    width: 20px; flex-shrink: 0; display: flex; flex-direction: column;
    background: #001B33; pointer-events: auto;
    box-shadow: -6px 0 6px -6px rgba(0,0,0,.16) inset;
}
#mf-studio-iconbar .ib {
    width: 20px; height: 20px; flex-shrink: 0; border: 0; cursor: pointer;
    background: transparent; color: #ccc; font-size: 10px; line-height: 20px;
    padding: 0; text-align: center; font-family: inherit;
}
#mf-studio-iconbar .ib:hover { color: #fff; background: rgba(255,255,255,.07); }
#mf-studio-iconbar .ib.on {
    color: #fff;
    background: linear-gradient(90deg, rgba(0,136,255,.73), #0088FF);
    box-shadow: inset 2px 0 0 #0088FF;
}
#mf-studio-iconbar .ib-div { height: 1px; margin: 0 3px; background: rgba(255,255,255,.13); }
#mf-studio-iconbar .ib-gap { height: 8px; }
/* ── taskbar inferior (20px, BBS CONTROL_BAR) ── */
#mf-studio-top {
    height: 20px; display: flex; align-items: center; gap: 8px;
    padding: 0 8px; background: #141417;
    border-top: 1px solid rgba(255,255,255,.27); pointer-events: auto;
    font-size: 10px;
}
#mf-studio-top .logo { font-weight: 700; letter-spacing: 1px; color: #0088FF; font-size: 10px; }
#mf-studio-top .project {
    font-size: 10px; color: #ccc; min-width: 100px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40vw;
}
#mf-studio-top .spacer { flex: 1; }
#mf-studio-top .btn-group { display: flex; align-items: center; gap: 2px; }
/* ── botones estilo BBS: cuadrados, 20px, acento #0088FF ── */
.mfs-btn {
    background: transparent; border: 0; color: #ccc;
    height: 20px; padding: 0 6px; font-size: 10px;
    cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
    white-space: nowrap; font-family: inherit; border-radius: 0;
    transition: background .1s, color .1s;
}
.mfs-btn:hover { color: #fff; background: rgba(255,255,255,.07); }
.mfs-btn:disabled { opacity: .35; cursor: default; }
.mfs-btn.icon { padding: 0; width: 20px; justify-content: center; font-size: 11px; }
/* toggle activo: franja inferior 2px + gradiente #0088FF (renderHighlight BBS) */
.mfs-btn.on {
    color: #fff;
    background: linear-gradient(180deg, #0088FF, rgba(0,136,255,.73));
    box-shadow: inset 0 -2px 0 #0088FF;
}
.mfs-btn.primary { background: #0088FF; color: #fff; font-weight: 700; }
.mfs-btn.primary:hover { background: #0077dd; }
.mfs-btn.rec.active, .mfs-btn.rec-on { background: #FF3333; color: #fff; animation: mfs-blink 1s infinite; }
@keyframes mfs-blink { 50% { opacity: .65; } }
@keyframes mfs-fadeout { 0%,70% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }
/* ── fila de botones del preview (centrada abajo, gradiente A50, BBS) ── */
#mfs-previewbar {
    position: absolute; bottom: 0; left: 0; right: 0; height: 20px;
    display: flex; align-items: center; justify-content: center; gap: 2px;
    background: linear-gradient(180deg, transparent, rgba(0,0,0,.53));
    pointer-events: auto;
}
/* scrollbars biseladas estilo BBS (4px, #AAAAAA/#666/#EEE) */
#mf-studio ::-webkit-scrollbar { width: 4px; height: 4px; }
#mf-studio ::-webkit-scrollbar-track { background: transparent; }
#mf-studio ::-webkit-scrollbar-thumb {
    background: #aaaaaa; border: 1px solid #666666; outline: 1px solid #eeeeee;
}
#mf-studio ::-webkit-scrollbar-thumb:hover { background: #ccc; }
/* ── timeline (lo pinta MF_Timeline; alto completo de la mainzone) ── */
#mf-studio-timeline {
    flex: 1; min-height: 0; background: #001B33;
    pointer-events: auto; display: flex; flex-direction: column;
}
/* ── overlay del media pool (dropShadow BBS: halo A25) ── */
#mf-studio-pool {
    position: absolute; top: 0; bottom: 0; left: 0; width: 236px;
    background: #001B33; pointer-events: auto; z-index: 30;
    display: flex; flex-direction: column;
    box-shadow: 4px 0 12px rgba(0,0,0,.5);
}
#mf-studio-pool.hidden { display: none; }
#mfs-pool-bar {
    height: 20px; display: flex; align-items: center; gap: 2px; padding: 0 4px;
    background: #141417; border-bottom: 1px solid rgba(255,255,255,.13);
    flex-shrink: 0;
}
#mfs-pool-bar .title { font-size: 10px; color: #ccc; margin-right: auto; padding-left: 2px; }
#mf-studio-left {
    flex: 1; overflow-y: auto; padding: 8px;
}
/* ── paneles internos ── */
.mfs-section { margin-bottom: 14px; }
.mfs-section h3 {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
    color: #aaa; margin-bottom: 6px; font-weight: 700;
    display: flex; align-items: center; justify-content: space-between;
}
.mfs-section h3 .mini {
    background: #0088FF; border: 0; color: #fff;
    font-size: 10px; padding: 2px 6px; cursor: pointer;
    line-height: 1.3; font-family: inherit; border-radius: 0;
}
.mfs-section h3 .mini:hover { background: #0077dd; }
.mfs-item {
    padding: 3px 6px; font-size: 11px; border-radius: 0;
    cursor: pointer; color: #ccc; display: flex; justify-content: space-between;
    border: 1px solid transparent;
}
.mfs-item:hover { background: rgba(0,136,255,.25); color: #fff; }
.mfs-item.active { background: #0088FF; color: #fff; font-weight: 700; }
.mfs-item .meta { color: #888; font-size: 10px; }
.mfs-item.active .meta { color: rgba(255,255,255,.8); }
/* Media Pool */
.media-item { display: flex; align-items: center; gap: 8px; justify-content: flex-start; }
.media-item .thumb { font-size: 16px; opacity: .9; }
.media-item .mi-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.media-item .mi-name {
    font-size: 11px; color: #e8e8ec; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; max-width: 150px;
}
.media-item .mi-del { opacity: 0; font-size: 11px; cursor: pointer; padding: 2px 4px; }
.media-item:hover .mi-del { opacity: .7; }
.media-item .mi-del:hover { opacity: 1; }
.media-item[draggable] { cursor: grab; }
.media-head {
    height: 34px; border: 1px solid rgba(255,255,255,.27); border-radius: 0; overflow: hidden;
    cursor: grab; background: rgba(0,0,0,.73); display: flex; align-items: center; justify-content: center;
}
.media-head:hover { border-color: #0088FF; }
.media-head img { max-height: 100%; max-width: 100%; image-rendering: pixelated; }
.mfs-prop { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 11px; }
.mfs-prop label { color: #aaa; }
.mfs-prop .val { color: #e8e8ec; font-family: 'Consolas', monospace; font-size: 11px; }
.mfs-status {
    padding: 6px 8px; background: rgba(0,0,0,.73); border-radius: 0;
    font-size: 10px; color: #aaa; line-height: 1.6; margin: 8px 6px;
    font-family: 'Consolas', monospace;
}
/* ── Modelos 3D (cargador) ── */
.model-item {
    display: flex; align-items: center; gap: 6px; padding: 4px 6px;
    border-radius: 0; font-size: 11px; cursor: pointer; color: #ccc;
    border: 1px solid transparent;
}
.model-item:hover { background: rgba(0,136,255,.25); }
.model-item.live { border-color: #33FF3388; background: rgba(51,255,51,.1); }
.model-item .m-icon { font-size: 13px; flex-shrink: 0; }
.model-item .m-name {
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: #e8e8ec;
}
.model-item .m-act {
    font-size: 11px; opacity: 0; padding: 1px 4px; border-radius: 0;
    flex-shrink: 0; color: #aaa;
}
.model-item:hover .m-act { opacity: .85; }
.model-item .m-act:hover { color: #fff; background: rgba(255,255,255,.13); }
.model-item .m-tag { font-size: 9px; color: #33FF33; flex-shrink: 0; }
.model-drop {
    border: 1px dashed rgba(255,255,255,.27); border-radius: 0; padding: 10px 8px;
    text-align: center; font-size: 10.5px; color: #888; cursor: pointer;
    line-height: 1.5; margin-bottom: 6px; transition: border-color .15s, color .15s;
}
.model-drop:hover, .model-drop.over { border-color: #0088FF; color: #0088FF; }
/* modo cine: el HUD del juego se oculta desde JS (applyCinema), no por CSS
   de hermano — el canvas WebGL debe seguir visible bajo el preview */
`;

    const state = {
        open: false,
        cinema: true,          
        films: [],             
        activeFilm: null,      
        activeTake: null,      
        playheadTick: 0,
        raf: null,
        hiddenHudEls: []
    };

    const p2p = {
        share: false,          
        camRemote: null,       
        camLerp: 0.25,         
        camActive: false,      
        followRemoteCamera: false, 
        lastCamOut: 0,         
        lastPoseOut: 0,        
        applying: false        
    };
    function sendStudio(obj) {
        try { return window.MF_Peer?.sendStudio?.(obj) === true; } catch { return false; }
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

    function el(tag, cls, html) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }

    function listFilms() {
        let films = {};
        try { films = JSON.parse(localStorage.getItem('minifeather_films_v1') || '{}'); } catch {}
        return Object.entries(films).map(([name, f]) => ({
            name,
            ticks: f.durationTicks || 0,
            kfs: f.actors?.[0]?.frames?.length || 0
        }));
    }

    function loadFilm(name) {
        try {
            const films = JSON.parse(localStorage.getItem('minifeather_films_v1') || '{}');
            return films[name] || null;
        } catch { return null; }
    }

    const models = {
        loaded: new Map(),       
        picker: null,            
        seq: 0
    };

    function modelPickFiles() {
        if (!models.picker) {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.glb,.gltf,.obj';
            inp.multiple = true;
            inp.style.display = 'none';
            inp.addEventListener('change', () => {
                if (inp.files?.length) modelLoadFiles([...inp.files]);
                inp.value = ''; 
            });
            document.body.appendChild(inp);
            models.picker = inp;
        }
        models.picker.click();
    }

    async function modelLoadFiles(files) {
        const CM = window.MF_CustomModels;
        if (!CM?.registerModelBytes) { updateStatus('⚠ MF_CustomModels no disponible'); return; }
        for (const f of files) {
            if (!/\.(glb|gltf|obj)$/i.test(f.name)) continue;
            const file = 'user_' + f.name;
            try {
                const buf = await f.arrayBuffer();
                await CM.registerModelBytes(file, buf);
                models.loaded.set(file, { name: f.name, size: f.size, at: Date.now(), id: null });
                updateStatus(`📦 "${f.name}" cargado (${(f.size / 1024).toFixed(0)} KB) — click en la lista para spawnear`);
                refreshModels();
                
                modelSpawn(file);
            } catch (e) {
                updateStatus(`⚠ "${f.name}": ${e?.message || e}`);
            }
        }
    }

    function modelSpawn(file) {
        const CM = window.MF_CustomModels;
        const info = models.loaded.get(file);
        if (!CM?.spawn) return;
        const p = getGame()?.player?.pos;
        if (!p) { updateStatus('⚠ sin player para spawnear'); return; }
        
        let dx = 1, dz = 0;
        if (cam.active) { dx = -Math.sin(cam.yaw); dz = -Math.cos(cam.yaw); }
        const x = p.x + dx * 2, z = p.z + dz * 2;
        const id = 'umodel' + (++models.seq);
        try {
            CM.spawn(file, x, p.y, z, { id, height: 0.9, lookAtPlayer: true });
            if (info) { info.id = id; }
            updateStatus(`📦 "${info?.name || file}" spawnneado`);
            refreshModels();
        } catch (e) {
            updateStatus(`⚠ spawn: ${e?.message || e}`);
        }
    }

    function modelDespawn(id) {
        try { window.MF_CustomModels?.despawn?.(id); } catch {}
        for (const [, info] of models.loaded) {
            if (info.id === id) { info.id = null; break; }
        }
        refreshModels();
    }

    function refreshModels() {
        const box = document.getElementById('mfs-models-list');
        if (!box) return;
        box.innerHTML = '';
        if (!models.loaded.size) {
            box.appendChild(el('div', 'mfs-item', '<span style="color:#6e6e7a;font-size:11px">No models loaded</span>'));
            return;
        }
        for (const [file, info] of models.loaded) {
            const row = el('div', 'model-item' + (info.id ? ' live' : ''));
            row.title = file + ' — click: spawn in front of you';
            row.innerHTML = `
                <span class="m-icon">${/\.obj$/i.test(file) ? '🔷' : '📦'}</span>
                <span class="m-name">${info.name}</span>
                ${info.id ? '<span class="m-tag">live</span>' : ''}
                <span class="m-act m-del" title="Remove from world">✕</span>
            `;
            row.addEventListener('click', (ev) => {
                if (ev.target.classList.contains('m-del')) {
                    if (info.id) modelDespawn(info.id);
                    return;
                }
                if (!info.id) modelSpawn(file);
            });
            box.appendChild(row);
        }
    }

    async function skinsImport(files) {
        const SC = window.MF_SkinChanger;
        if (!SC?.importFiles) { updateStatus('⚠ SkinChanger no disponible'); return; }
        const pngs = [...files].filter(f => /\.png$/i.test(f.name));
        if (!pngs.length) { updateStatus('⚠ solo .png'); return; }
        try {
            const items = await SC.importFiles(pngs);
            updateStatus(items.length
                ? `👕 ${items.length} skin(s) importada(s) — click = aplicar · arrastra al timeline V2`
                : '⚠ ningún PNG válido (deben ser 64x64 o 64x32)');
            refreshSkinsList();
            refreshFaces();
        } catch (e) {
            updateStatus('⚠ import skins: ' + (e?.message || e));
        }
    }

    function refreshSkinsList() {
        const box = document.getElementById('mfs-skins-list');
        if (!box) return;
        const SC = window.MF_SkinChanger;
        const items = SC?.items || [];
        box.innerHTML = '';
        if (!items.length) {
            box.appendChild(el('div', 'mfs-item', '<span style="color:#6e6e7a;font-size:11px">Sin skins importadas</span>'));
            return;
        }
        const grid = el('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;';
        for (const it of items) {
            const d = el('div', 'media-head' + (SC.current === it.name ? ' on' : ''));
            d.title = it.name + ' — click = aplicar en vivo · arrastra al timeline V2 como clip de skin';
            d.draggable = true;
            d.innerHTML = `<img src="${it.thumb}" alt="">`;
            d.ondragstart = (ev) => {
                ev.dataTransfer.setData('text/mf-skin', it.name);
                ev.dataTransfer.effectAllowed = 'copy';
            };
            d.onclick = () => {
                SC.apply(it.name).then(() => {
                    updateStatus('👕 Skin applied: ' + it.name);
                    refreshSkinsList();
                }).catch(e => updateStatus('⚠ ' + (e?.message || e)));
            };
            grid.appendChild(d);
        }
        box.appendChild(grid);
    }

    function refreshMorphList() {
        const box = document.getElementById('mfs-morph-list');
        if (!box) return;
        const M = window.MF_Morph;
        const items = M?.catalog || [];
        box.innerHTML = '';
        if (!items.length) {
            box.appendChild(el('div', 'mfs-item', '<span style="color:#6e6e7a;font-size:11px">No mobs nearby — press ⟳ with mobs in view</span>'));
            return;
        }
        const grid = el('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;';
        for (const it of items) {
            const d = el('div', 'media-head' + (M.current === it.type ? ' on' : ''));
            d.title = it.label + ' — click = live morph · drag to V2 timeline as morph clip';
            d.draggable = true;
            d.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:20px;';
            d.textContent = MOJI_OF(it.type);
            d.ondragstart = (ev) => {
                ev.dataTransfer.setData('text/mf-morph', it.type);
                ev.dataTransfer.effectAllowed = 'copy';
            };
            d.onclick = () => {
                try {
                    M.apply(it.type);
                    updateStatus('🧬 Morph: ' + it.label);
                    refreshMorphList();
                } catch (e) {
                    updateStatus('⚠ ' + (e?.message || e));
                }
            };
            grid.appendChild(d);
        }
        const rev = el('div', 'mfs-item', '<span style="font-size:11px">↺ Back to human</span>');
        rev.style.cursor = 'pointer';
        rev.onclick = () => {
            M?.revert?.();
            updateStatus('🧬 Human form restored');
            refreshMorphList();
        };
        box.appendChild(grid);
        box.appendChild(rev);
    }

    function MOJI_OF(key) {
        const MOJI = {
            creeper: '🟩', pig: '🐖', cow: '🐄', chicken: '🐔', sheep: '🐑',
            wolf: '🐺', cat: '🐈', zombie: '🧟', skeleton: '💀', slime: '🟢',
            spider: '🕷️', snowman: '⛄', ghost: '👻', villager: '🧑‍🌾',
            iron_golem: '🗿', armor_stand: '🧍', boat: '🚤', minecart: '🛒',
            zombie_cowman: '🧟‍🐄'
        };
        if (MOJI[key]) return MOJI[key];
        if (/zombie/i.test(key)) return '🧟';
        if (/horse|donkey|mule/i.test(key)) return '🐎';
        return '🧬';
    }

    const afk = {
        on: false,
        timer: null,
        rescanTimer: null,
        player: null,
        applyName: null,
        sendName: null,
        originalApply: null,
        applyHadOwn: false,
        lastBeat: 0
    };

    function afkFindApply(player) {
        const seen = new Set();
        let proto = player, best = null;
        for (let depth = 0; proto && depth < 14; depth++) {
            let names = [];
            try { names = Object.getOwnPropertyNames(proto); } catch { break; }
            for (const name of names) {
                if (name === 'constructor' || seen.has(name)) continue;
                seen.add(name);
                let fn;
                try { fn = player[name]; } catch { continue; }
                if (typeof fn !== 'function') continue;
                let src = '';
                try { src = Function.prototype.toString.call(fn); } catch {}
                let score = 0;
                if (src.includes('jumping')) score += 5;
                if (src.includes('.jump')) score += 4;
                if (src.includes('.left') && src.includes('.right')) score += 4;
                if (src.includes('.up') && src.includes('.down')) score += 4;
                if (src.includes('usingItem')) score += 2;
                if (src.includes('sendPacket') || src.includes('serverMove')) score += 3;
                if (!best || score > best.score) best = { name, fn, score };
            }
            try { proto = Object.getPrototypeOf(proto); } catch { break; }
        }
        return best?.score >= 12 ? best : null;
    }

    function afkFindSend(player) {
        const seen = new Set();
        let proto = player, best = null;
        for (let depth = 0; proto && depth < 14; depth++) {
            let names = [];
            try { names = Object.getOwnPropertyNames(proto); } catch { break; }
            for (const name of names) {
                if (name === 'constructor' || seen.has(name)) continue;
                seen.add(name);
                let fn;
                try { fn = player[name]; } catch { continue; }
                if (typeof fn !== 'function') continue;
                let src = '';
                try { src = Function.prototype.toString.call(fn); } catch {}
                let score = 0;
                if (src.includes('serverMoveForward') || src.includes('serverMoveStrafe')) score += 10;
                if (src.includes('sendPacket')) score += 5;
                if (!best || score > best.score) best = { name, fn, score };
            }
            try { proto = Object.getPrototypeOf(proto); } catch { break; }
        }
        return best?.score >= 10 ? best : null;
    }

    function afkBeatInput(player) {
        const base = player.currentInput || {};
        return {
            ...base,
            up: false, down: false, left: false, right: false,
            jump: false, sneak: false, usingItem: false,
            yaw: (Number(base.yaw ?? player.yaw) || 0) + (Math.random() - 0.5) * 0.006,
            pitch: Number(base.pitch ?? player.pitch) || 0
        };
    }

    function afkBeat() {
        if (!afk.on) return;
        const player = getGame()?.player;
        if (!player) return;
        
        if (afk.player !== player || (afk.applyName && player[afk.applyName] !== undefined && !player[afk.applyName])) {
            afkHookPlayer(player);
        }
        if (!afk.applyName || !afk.originalApply) return;
        try {
            afk.originalApply.call(player, afkBeatInput(player));
            afk.lastBeat = Date.now();
            if (afk.sendName) player[afk.sendName]?.call(player);
        } catch {
            
            afk.applyName = null;
        }
    }

    function afkHookPlayer(player) {
        afkRestoreHook();
        const apply = afkFindApply(player);
        if (!apply) { afk.player = null; return false; }
        const send = afkFindSend(player);
        afk.player = player;
        afk.applyName = apply.name;
        afk.sendName = send?.name || null;
        afk.originalApply = apply.fn;
        afk.applyHadOwn = Object.prototype.hasOwnProperty.call(player, apply.name);
        return true; 
    }

    function afkRestoreHook() {
        
        afk.player = null;
        afk.applyName = null;
        afk.sendName = null;
        afk.originalApply = null;
    }

    function afkToggle(on) {
        if (on === undefined) on = !afk.on;
        afk.on = !!on;
        for (const id of ['mfs-afk', 'mfs-ib-afk']) {
            const btn = document.getElementById(id);
            if (btn) {
                btn.classList.toggle('on', afk.on);
                btn.title = afk.on ? 'Anti-AFK activo: micro-rotaciones nativas cada ~30s' : 'Activar anti-kick mientras el estudio está abierto';
            }
        }
        if (afk.on) {
            afkHookPlayer(getGame()?.player);
            afkBeat();
            afk.timer = setInterval(afkBeat, 30000);       
            afk.rescanTimer = setInterval(() => {          
                if (!afk.on) return;
                const p = getGame()?.player;
                if (p && p !== afk.player) afkHookPlayer(p);
            }, 3000);
            updateStatus('🛡 Anti-AFK activo — micro-rotaciones cada 30s (el actor no se mueve)');
        } else {
            clearInterval(afk.timer); afk.timer = null;
            clearInterval(afk.rescanTimer); afk.rescanTimer = null;
            afkRestoreHook();
        }
    }

    function build() {
        if (document.getElementById(ID)) return;

        const style = el('style');
        style.id = ID + '-style';
        style.textContent = CSS;
        document.head.appendChild(style);

        const root = el('div');
        root.id = ID;
        if (state.cinema) root.classList.add('cinema');

        const main = el('div');
        main.id = 'mf-studio-main';

        const mainzone = el('div');
        mainzone.id = 'mf-studio-mainzone';
        const tl = el('div');
        tl.id = 'mf-studio-timeline';
        mainzone.appendChild(tl);

        const rightzone = el('div');
        rightzone.id = 'mf-studio-rightzone';

        const preview = el('div');
        preview.id = 'mf-studio-preview';
        
        const status = el('div', 'mfs-status');
        status.id = 'mfs-status';
        status.style.cssText = 'position:absolute;top:10px;left:10px;pointer-events:auto;';
        preview.appendChild(status);
        
        const gtoggle = el('button');
        gtoggle.id = 'mfs-gizmo-mode';
        gtoggle.className = 'mfs-btn';
        gtoggle.textContent = '↔ Mover';
        gtoggle.title = 'Alternar gizmo: mover por ejes / rotar por ejes (tecla G)';
        gtoggle.style.cssText = `
            position:absolute;top:10px;right:10px;pointer-events:auto;`;
        preview.appendChild(gtoggle);
        
        const hint = el('div');
        hint.innerHTML = '🖱 Click+drag: rotate camera · WASD/QE: move · Ctrl: fast · 🦴 Posing: right-click a limb';
        hint.style.cssText = `
            position:absolute;bottom:26px;left:50%;transform:translateX(-50%);
            background:rgba(0,0,0,.73);border:1px solid rgba(255,255,255,.13);padding:4px 10px;
            font-size:10px;color:#aaa;pointer-events:none;
            animation:mfs-fadeout 6s forwards;white-space:nowrap;`;
        preview.appendChild(hint);
        
        const pbar = el('div');
        pbar.id = 'mfs-previewbar';
        pbar.innerHTML = `
            <button class="mfs-btn icon" id="mfs-pv-replays"  title="Replays / recorded takes (media pool)">🎞</button>
            <button class="mfs-btn icon" id="mfs-pv-plause"   title="Play/Pause (Space)">▶</button>
            <button class="mfs-btn icon" id="mfs-pv-teleport" title="Teleport to camera">✈</button>
            <button class="mfs-btn icon on" id="mfs-pv-flight" title="Fly mode (free camera)">🛩</button>
            <button class="mfs-btn icon" id="mfs-pv-control"  title="Control actor / pose limbs">🦴</button>
            <button class="mfs-btn icon" id="mfs-pv-player"   title="Control player (H) — WASD moves the player, static camera, mouse locked">🎮</button>
            <button class="mfs-btn icon" id="mfs-pv-record"   title="Record replay (R)">●</button>
            <button class="mfs-btn icon" id="mfs-pv-video"    title="Render to .webm video">⏺</button>
            <button class="mfs-btn icon" id="mfs-pv-traj"     title="Trajectory canvas (T) — draws the camera clips path">🧭</button>`;
        preview.appendChild(pbar);
        
        const trajCv = el('canvas');
        trajCv.id = 'mf-studio-traj';
        preview.appendChild(trajCv);
        const trajHint = el('div');
        trajHint.className = 'traj-hint';
        trajHint.textContent = '🧭 Trajectory: dots = keyframes · line = path · ◀▶ = previous/next clip';
        trajCv.appendChild(trajHint);
        rightzone.appendChild(preview);

        const right = el('div');
        right.id = 'mf-studio-right';
        right.innerHTML = `<div class="mfs-section"><h3>Properties</h3><div id="mfs-props"></div></div>
<div class="mfs-section"><h3>Pose editor</h3><div id="mfs-pose"></div></div>`;
        rightzone.appendChild(right);

        const pool = el('div');
        pool.id = 'mf-studio-pool';
        pool.innerHTML = `
            <div id="mfs-pool-bar">
                <span class="title">MEDIA POOL</span>
                <button class="mfs-btn icon" id="mfs-pool-close" title="Cerrar (P)">✕</button>
            </div>
            <div id="mf-studio-left">
<div class="mfs-section"><h3>Media Pool</h3><div id="mfs-mediapool"></div></div>
<div class="mfs-section"><h3>Modelos 3D <button class="mini" id="mfs-model-add" title="Cargar .glb/.gltf/.obj del disco">+ Cargar</button></h3>
<div class="model-drop" id="mfs-model-drop" title="Clic para elegir archivo">📦 Suelta un modelo aquí<br>.glb · .gltf · .obj</div>
<div id="mfs-models-list"></div></div>
<div class="mfs-section"><h3>Tomas</h3><div id="mfs-takes"></div></div>
<div class="mfs-section"><h3>Skins PNG <button class="mini" id="mfs-skins-add" title="Importar .png de skin (64x64/64x32)">+ Importar</button></h3>
<div class="model-drop" id="mfs-skins-drop" title="Clic para elegir PNGs">👕 Suelta skins .png aquí<br>64x64 · 64x32</div>
<div id="mfs-skins-list"></div></div>
<div class="mfs-section"><h3>Morph (mobs) <button class="mini" id="mfs-morph-rescan" title="Volver a escanear mobs del mundo">⟳</button></h3><div id="mfs-morph-list"></div></div>
<div class="mfs-section"><h3>Cámara (clips BBS) <button class="mini" id="mfs-cam-clear" title="Borrar todos los clips de cámara/subtítulo/audio">🗑</button></h3><div id="mfs-cam-list"></div></div>
<div class="mfs-section"><h3>Caras (face swap)</h3><div id="mfs-faces"></div></div>
            </div>`;
        mainzone.appendChild(pool);

        const iconbar = el('div');
        iconbar.id = 'mf-studio-iconbar';
        iconbar.innerHTML = `
            <button class="ib" id="mfs-ib-pool"   title="Media pool (P)">🗂</button>
            <button class="ib" id="mfs-ib-cam"    title="Camera clips">🎥</button>
            <button class="ib" id="mfs-ib-undo"   title="Undo (Ctrl+Z)">↶</button>
            <button class="ib" id="mfs-ib-redo"   title="Redo (Ctrl+Y)">↷</button>
            <div class="ib-div"></div>
            <button class="ib" id="mfs-ib-skineditor" title="Head editor">🎨</button>
            <button class="ib" id="mfs-ib-skinchanger" title="PNG Skins">👕</button>
            <button class="ib" id="mfs-ib-morph"  title="Morph (mobs)">🧬</button>
            <button class="ib" id="mfs-ib-models" title="3D Models">📦</button>
            <div class="ib-gap"></div>
            <button class="ib" id="mfs-ib-share"  title="Share pose + camera with peer (P2P)">📡</button>
            <button class="ib" id="mfs-ib-cinema" title="Cinema mode (hide HUD)">🎬</button>
            <button class="ib" id="mfs-ib-afk"    title="Anti-AFK">🛡</button>
            <button class="ib" id="mfs-ib-close"  title="Close (F1)">✕</button>`;

        const top = el('div', '', '');
        top.id = 'mf-studio-top';
        top.innerHTML = `
            <span class="logo">MF STUDIO</span>
            <span class="project" id="mfs-project">Project: no active take</span>
            <span class="spacer"></span>
            <span class="btn-group">
                <button class="mfs-btn icon" id="mfs-home" title="Go to start (Home)">⏮</button>
                <button class="mfs-btn primary" id="mfs-play" title="Play/Pause (Space)">▶</button>
                <button class="mfs-btn icon" id="mfs-stop" title="Stop (S)">⏹</button>
                <button class="mfs-btn rec" id="mfs-rec" title="Record (R)">●</button>
            </span>
            <span class="btn-group">
                <button class="mfs-btn" id="mfs-in" title="Mark IN here (I)">{ IN</button>
                <button class="mfs-btn" id="mfs-out" title="Mark OUT here (O)">OUT }</button>
                <button class="mfs-btn icon" id="mfs-range-clear" title="Clear In/Out (play all)" style="display:none">⨯</button>
            </span>`;

        main.appendChild(mainzone);
        main.appendChild(rightzone);
        main.appendChild(iconbar);
        root.appendChild(main);
        root.appendChild(top); 
        document.body.appendChild(root);

        bind();
        window.MF_Timeline?.mount(tl, { onChange: onTimelineChange });
    }

    function bind() {
        const $ = (id) => document.getElementById(id);

        $('mfs-home').onclick = () => { seek(0); };
        $('mfs-in').onclick = markIn;
        $('mfs-out').onclick = markOut;
        $('mfs-range-clear').onclick = clearRange;
        $('mfs-play').onclick = togglePlay;
        $('mfs-stop').onclick = () => {
            const F = window.MF_Film;
            if (F?.status.recording) { F.stopRecording(); refreshTakes(); updateStatus(); }
            else { F?.stopPlayback(); F?.despawnActors(); }
            updateButtons();
        };
        $('mfs-rec').onclick = toggleRec;
        $('mfs-model-add').onclick = modelPickFiles;
        
        const dropZone = $('mfs-model-drop');
        if (dropZone) {
            dropZone.onclick = modelPickFiles;
            dropZone.addEventListener('dragover', (ev) => { ev.preventDefault(); dropZone.classList.add('over'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
            dropZone.addEventListener('drop', (ev) => {
                ev.preventDefault();
                dropZone.classList.remove('over');
                const files = [...(ev.dataTransfer?.files || [])].filter(f => /\.(glb|gltf|obj)$/i.test(f.name));
                if (files.length) modelLoadFiles(files);
            });
        }
        $('mfs-afk')?.addEventListener?.('click', () => afkToggle());
        
        $('mfs-cam-clear').onclick = () => {
            if (!confirm('¿Borrar TODOS los clips de cámara, subtítulos y audio?')) return;
            window.MF_FilmCamera?.clear?.();
            refreshCamList();
            window.MF_Timeline?.render?.();
        };
        refreshCamList();
        
        const skinsInput = el('input');
        skinsInput.type = 'file';
        skinsInput.accept = 'image/png,.png';
        skinsInput.multiple = true;
        skinsInput.style.display = 'none';
        document.getElementById(ID).appendChild(skinsInput);
        const skinsPick = () => skinsInput.click();
        $('mfs-skins-add').onclick = skinsPick;
        const skinsDrop = $('mfs-skins-drop');
        if (skinsDrop) {
            skinsDrop.onclick = skinsPick;
            skinsDrop.addEventListener('dragover', (ev) => { ev.preventDefault(); skinsDrop.classList.add('over'); });
            skinsDrop.addEventListener('dragleave', () => skinsDrop.classList.remove('over'));
            skinsDrop.addEventListener('drop', (ev) => {
                ev.preventDefault();
                skinsDrop.classList.remove('over');
                const files = [...(ev.dataTransfer?.files || [])].filter(f => /\.png$/i.test(f.name));
                if (files.length) skinsImport(files);
            });
        }
        window.addEventListener('mf:skinchanger-items', () => refreshSkinsList(), { once: false });
        refreshSkinsList();
        
        $('mfs-morph-rescan').onclick = () => {
            window.MF_Morph?.scan?.(true);
            refreshMorphList();
        };
        window.addEventListener('mf:morph-catalog', () => refreshMorphList(), { once: false });
        refreshMorphList();
        
        const gm = document.getElementById('mfs-gizmo-mode');
        if (gm) {
            gm.onclick = () => gizmoSetMode(gizmo.mode === 'move' ? 'rotate' : 'move');
            gizmoSetMode(gizmo.mode); 
        }
        
        const ib = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
        
        const p = document.getElementById('mf-studio-pool');
        if (p) {
            if (!poolOpen) p.classList.add('hidden');
            document.getElementById('mfs-ib-pool')?.classList.toggle('on', poolOpen);
        }
        ib('mfs-ib-pool', () => poolToggle(!poolOpen));
        ib('mfs-ib-cam', () => camPanelToggle());
        ib('mfs-ib-undo', () => window.MF_Undo?.undo?.());
        ib('mfs-ib-redo', () => window.MF_Undo?.redo?.());
        ib('mfs-ib-skineditor', () => window.MF_SkinEditor?.open());
        ib('mfs-ib-skinchanger', () => window.MF_SkinChanger?.open());
        ib('mfs-ib-morph', () => window.MF_Morph?.open());
        ib('mfs-ib-models', () => modelPickFiles());
        ib('mfs-ib-share', () => shareToggle());
        ib('mfs-ib-cinema', () => {
            state.cinema = !state.cinema;
            document.getElementById(ID)?.classList.toggle('cinema', state.cinema);
            applyCinema();
            document.getElementById('mfs-ib-cinema')?.classList.toggle('on', state.cinema);
        });
        document.getElementById('mfs-ib-cinema')?.classList.toggle('on', state.cinema);
        ib('mfs-ib-afk', () => afkToggle());
        ib('mfs-ib-close', close);
        
        $('mfs-pv-replays').onclick = () => poolToggle(true);
        $('mfs-pv-plause').onclick = togglePlay;
        $('mfs-pv-teleport').onclick = () => {
            
            const g = getGame();
            const p = g?.player;
            if (p && cam.pos) {
                try { p.position?.set?.(cam.pos.x, cam.pos.y, cam.pos.z); } catch {}
                try { p.rotation?.set?.(cam.pitch, cam.yaw, 0); } catch {}
                updateStatus('✈ jugador llevado a la cámara');
            }
        };
        $('mfs-pv-flight').onclick = () => {
            if (cam.active) cameraDisable();
            else cameraEnable();
            $('mfs-pv-flight')?.classList.toggle('on', cam.active);
        };
        $('mfs-pv-control').onclick = () => posingToggle(!posing.enabled);
        $('mfs-pv-player').onclick = () => playerControlToggle();
        $('mfs-pv-record').onclick = toggleRec;
        $('mfs-pv-traj').onclick = () => trajToggle();
        $('mfs-pv-video').onclick = renderVideo;
        
        ib('mfs-pool-close', () => poolToggle(false));

        if (!state.keysBound) {
            state.keysBound = true;
            window.addEventListener('keydown', (ev) => {
                if (!state.open) return;
                
                if (playerCtrl.active) {
                    if (ev.key === 'F1') { ev.preventDefault(); close(); }
                    return;
                }
                if (ev.key === 'F1') { ev.preventDefault(); close(); }
                else if (ev.code === 'Space' && !isTypingTarget(ev.target)) { ev.preventDefault(); togglePlay(); }
                else if (ev.key === 'Home') { ev.preventDefault(); seek(0); }
                else if ((ev.key === 'i' || ev.key === 'I') && !isTypingTarget(ev.target)) markIn();
                else if ((ev.key === 'o' || ev.key === 'O') && !isTypingTarget(ev.target)) markOut();
                else if ((ev.key === 'p' || ev.key === 'P') && !isTypingTarget(ev.target)) { ev.preventDefault(); poolToggle(!poolOpen); }
                else if ((ev.key === 'r' || ev.key === 'R') && !isTypingTarget(ev.target)) { ev.preventDefault(); toggleRec(); }
                else if ((ev.key === 't' || ev.key === 'T') && !isTypingTarget(ev.target)) { ev.preventDefault(); trajToggle(); }
                else if (ev.code === 'BracketLeft' && !isTypingTarget(ev.target)) trajCycle(-1);
                else if (ev.code === 'BracketRight' && !isTypingTarget(ev.target)) trajCycle(1);
                else if ((ev.key === 'g' || ev.key === 'G') && !isTypingTarget(ev.target)) {
                    ev.preventDefault();
                    gizmoSetMode(gizmo.mode === 'move' ? 'rotate' : 'move');
                }
            });
            
            window.addEventListener('mf:skineditor-presets', () => {
                if (state.open) refreshMediaPool();
            });
        }

        state.raf = requestAnimationFrame(uiLoop);
    }

    function onTimelineChange(kind, payload) {
        switch (kind) {
            case 'scrub':
                
                state.playheadTick = payload;
                seek(payload);
                break;
            case 'clip-open':
                
                if (payload && payload !== state.activeFilm) {
                    state.activeFilm = payload;
                    state.activeTake = loadFilm(payload);
                    document.getElementById('mfs-project').textContent = 'Proyecto: ' + payload;
                    refreshTakes(); updateProps(); updateStatus();
                }
                break;
            case 'clip-moved':
            case 'clips-changed':
                updateStatus(`Secuencia: ${window.MF_Timeline?.clips.length || 0} clips`);
                break;
            case 'drop-rejected':
                updateStatus(`Could not drop "${payload}" (take not found)`);
                break;
        }
    }

    function isTypingTarget(t) {
        return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    }

    function togglePlay() {
        const F = window.MF_Film;
        if (!F) return;
        const s = F.status;
        if (s.recording) return;
        if (!s.playing) {
            
            const TL = window.MF_Timeline;
            const clips = TL?.clips || [];
            if (clips.length) {
                const r = F.playSequence(clips.map(c => ({
                    filmName: c.film.name, start: c.start, duration: c.duration
                })));
                if (!r.ok) { updateStatus('⚠ ' + r.error); return; }
            } else {
                const r = F.playFilm(state.activeFilm || undefined);
                if (!r?.ok) { updateStatus('⚠ ' + (r?.error || 'nothing to play')); return; }
            }
        } else if (s.paused) {
            F.resumePlayback();
        } else {
            F.pausePlayback();
        }
        updateButtons();
    }

    function toggleRec() {
        const F = window.MF_Film;
        if (!F) return;
        const s = F.status;
        if (s.recording) {
            const r = F.stopRecording();
            if (r.ok) {
                
                F.saveFilm('take-' + new Date().toTimeString().slice(0, 8).replace(/:/g, ''));
                refreshTakes(); refreshMediaPool();
            }
        } else {
            F.stopPlayback();
            F.despawnActors();
            F.startRecording();
        }
        updateButtons(); updateStatus();
    }

    function seek(tick) {
        state.playheadTick = Math.max(0, tick);
        
        const F = window.MF_Film;
        const s = F?.status;
        if (s?.playing && !s.paused) { F.stopPlayback(); F.playFilm(state.activeFilm || undefined); }
        updatePlayhead();
    }

    function markIn() {
        const F = window.MF_Film;
        if (!F) return;
        const cur = F.getPlayRange();
        F.setPlayRange(state.playheadTick, cur?.to ?? null);
        updateRangeUI();
        updateStatus(`IN = tick ${state.playheadTick} (${(state.playheadTick / TPS).toFixed(2)}s)`);
    }
    function markOut() {
        const F = window.MF_Film;
        if (!F) return;
        const cur = F.getPlayRange();
        let from = cur?.from ?? 0;
        
        if (state.playheadTick <= from) from = Math.max(0, state.playheadTick - 1);
        F.setPlayRange(from, Math.max(1, state.playheadTick));
        updateRangeUI();
        updateStatus(`OUT = tick ${state.playheadTick} (${(state.playheadTick / TPS).toFixed(2)}s)`);
    }
    function clearRange() {
        const F = window.MF_Film;
        F?.setPlayRange(null, null);
        updateRangeUI();
        updateStatus('In/Out range cleared — plays the whole take');
    }
    function updateRangeUI() {
        const F = window.MF_Film;
        const r = F?.getPlayRange?.();
        const bi = document.getElementById('mfs-in');
        const bo = document.getElementById('mfs-out');
        const bc = document.getElementById('mfs-range-clear');
        if (!bi || !bo || !bc) return;
        if (!r) {
            bi.classList.remove('active');
            bo.classList.remove('active');
            bc.style.display = 'none';
        } else {
            (r.from != null) && bi.classList.add('active');
            (r.to != null) && bo.classList.add('active');
            bc.style.display = '';
        }
        renderTimeline();
    }

    function refreshTakes() {
        const box = document.getElementById('mfs-takes');
        if (!box) return;
        state.films = listFilms();
        box.innerHTML = '';
        if (!state.films.length) {
            box.appendChild(el('div', 'mfs-item', '<span>Sin tomas — pulsa ● REC</span>'));
            return;
        }
        for (const f of state.films) {
            const item = el('div', 'mfs-item' + (f.name === state.activeFilm ? ' active' : ''),
                `<span>${f.name}</span><span class="meta">${(f.ticks / TPS).toFixed(1)}s · ${f.kfs}kf</span>`);
            
            item.onclick = () => {
                const TL = window.MF_Timeline;
                const film = loadFilm(f.name);
                if (!TL || !film) return;
                TL.addClip(film, TL.seqDuration);   
                
                state.activeFilm = f.name;
                state.activeTake = film;
                document.getElementById('mfs-project').textContent = 'Proyecto: ' + f.name;
                refreshTakes(); updateProps(); updateStatus(`Clip añadido: ${f.name}`);
            };
            
            item.ondblclick = (ev) => { ev.stopPropagation(); };
            box.appendChild(item);
        }
    }

    const pool = { bin: [] };

    function refreshMediaPool() {
        const box = document.getElementById('mfs-mediapool');
        if (!box) return;
        box.innerHTML = '';
        const F = window.MF_Film;
        const films = listFilms().filter(f => !pool.bin.includes(f.name));
        
        const bar = el('div');
        bar.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;';
        const impBtn = el('button', 'mfs-btn', '📥 Import');
        impBtn.style.cssText = 'height:22px;font-size:10px;padding:0 8px;';
        impBtn.title = 'Import .mffilm.json files';
        const impInput = el('input');
        impInput.type = 'file';
        impInput.accept = '.json,application/json';
        impInput.multiple = true;
        impInput.style.display = 'none';
        impBtn.onclick = () => impInput.click();
        impInput.onchange = () => { mediaPoolImport(impInput.files); impInput.value = ''; };
        bar.appendChild(impBtn); bar.appendChild(impInput);
        if (pool.bin.length) {
            const binBtn = el('button', 'mfs-btn', `🗑 Bin (${pool.bin.length})`);
            binBtn.style.cssText = 'height:22px;font-size:10px;padding:0 8px;';
            binBtn.title = 'Vaciar el bin (mostrar todo de nuevo)';
            binBtn.onclick = mediaPoolEmptyBin;
            bar.appendChild(binBtn);
        }
        box.appendChild(bar);
        
        const SE = window.MF_SkinEditor;
        const headPresets = SE?.presets?.() || [];
        if (headPresets.length) {
            const heads = el('div');
            heads.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:6px;';
            for (const hp of headPresets) {
                const d = el('div', 'media-head');
                d.title = hp.name + ' — drag to V2 (Faces) or click = apply now';
                d.draggable = true;
                d.innerHTML = `<img src="${hp.thumb}" alt="">`;
                d.ondragstart = (ev) => {
                    ev.dataTransfer.setData('text/mf-head', hp.name);
                    ev.dataTransfer.effectAllowed = 'copy';
                };
                d.onclick = () => { SE.applyPreset(hp.name); updateStatus('Head: ' + hp.name); };
                heads.appendChild(d);
            }
            box.appendChild(heads);
        }
        if (!films.length) {
            box.appendChild(el('div', 'mfs-item', '<span>Sin medios — graba con ● REC o importa .mffilm.json</span>'));
            return;
        }
        for (const f of films) {
            const item = el('div', 'mfs-item media-item',
                `<span class="thumb">🎬</span><div class="mi-body"><span class="mi-name">${f.name}</span>` +
                `<span class="meta">${(f.ticks / TPS).toFixed(1)}s · ${f.kfs}kf</span></div>`);
            item.title = 'Drag to timeline · click = append · 🗑 = to bin';
            
            item.draggable = true;
            item.ondragstart = (ev) => {
                ev.dataTransfer.setData('text/mf-film', f.name);
                ev.dataTransfer.setData('text/plain', f.name);
                ev.dataTransfer.effectAllowed = 'copy';
            };
            item.onclick = () => {
                const TL = window.MF_Timeline;
                const film = loadFilm(f.name);
                if (!TL || !film) return;
                TL.addClip(film, TL.seqDuration);
                state.activeFilm = f.name;
                state.activeTake = film;
                document.getElementById('mfs-project').textContent = 'Project: ' + f.name;
                updateStatus(`Clip added: ${f.name}`);
            };
            const del = el('span', 'mi-del', '🗑');
            del.title = 'Move to bin (doesn\'t delete the file)';
            del.onclick = (ev) => {
                ev.stopPropagation();
                pool.bin.push(f.name);
                refreshMediaPool();
            };
            item.appendChild(del);
            box.appendChild(item);
            if (!F) break; 
        }
    }

    function mediaPoolImport(files) {
        const F = window.MF_Film;
        if (!F?.importFilm) { updateStatus('Importar no disponible'); return; }
        let ok = 0, fail = 0;
        for (const file of files) {
            if (!/\.mffilm\.json$/.test(file.name)) { fail++; continue; }
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    const name = (data.name || file.name.replace(/\.mffilm\.json$/, ''))
                        + '_' + Math.random().toString(36).slice(2, 5);
                    const res = F.importFilm(name, data);
                    if (res?.ok !== false) {
                        ok++;
                        
                        pool.bin = pool.bin.filter(n => n !== name);
                        updateStatus(`Importado: ${name}`);
                    } else fail++;
                } catch { fail++; }
                if (ok + fail === files.length) refreshMediaPool();
            };
            reader.readAsText(file);
        }
    }

    function mediaPoolEmptyBin() {
        pool.bin.length = 0;
        refreshMediaPool();
        updateStatus('Bin vaciado — todos los medios visibles');
    }

    function refreshFaces() {
        const box = document.getElementById('mfs-faces');
        if (!box) return;
        box.innerHTML = '';
        const faces = window.MF_FaceSwap?.list() || [];
        if (!faces.length) { box.appendChild(el('div', 'mfs-item', '<span>FaceSwap not available</span>')); return; }
        
        const grid = el('div');
        grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;';
        for (const name of faces.slice(0, 16)) {
            const b = el('button', 'mfs-btn', name);
            b.style.cssText = 'height:24px;font-size:10px;padding:0 6px;justify-content:center;';
            b.title = 'Click = trigger at playhead · drag to V2 timeline';
            
            b.draggable = true;
            b.ondragstart = (ev) => {
                ev.dataTransfer.setData('text/mf-face', name);
                ev.dataTransfer.effectAllowed = 'copy';
            };
            b.onclick = () => {
                const tick = Math.floor(state.playheadTick);
                window.MF_FaceSwap?.applyAtTick(tick, name);
                renderTimeline();
                updateStatus('Face "' + name + '" at tick ' + tick);
            };
            grid.appendChild(b);
        }
        box.appendChild(grid);
    }

    function renderTimeline() {
        
        window.MF_Timeline?.render();
    }

    function updatePlayhead() {
        
        const TL = window.MF_Timeline;
        const s = window.MF_Film?.status;
        if (TL && s?.playing) TL.playheadTick = s.tick;
    }

    function updateButtons() {
        const s = window.MF_Film?.status;
        const play = document.getElementById('mfs-play');
        const rec = document.getElementById('mfs-rec');
        const pvPlay = document.getElementById('mfs-pv-plause');
        const pvRec = document.getElementById('mfs-pv-record');
        const pvFlight = document.getElementById('mfs-pv-flight');
        const pvCtrl = document.getElementById('mfs-pv-control');
        if (play) {
            if (s?.recording) { play.textContent = '▶'; play.disabled = true; }
            else { play.disabled = false; play.textContent = s?.playing && !s.paused ? '⏸' : '▶'; }
        }
        rec?.classList.toggle('active', !!s?.recording);
        if (pvPlay) pvPlay.textContent = s?.playing && !s.paused ? '⏸' : '▶';
        pvRec?.classList.toggle('active', !!s?.recording);
        pvFlight?.classList.toggle('on', !!cam.active);
        if (pvCtrl) pvCtrl.classList.toggle('on', !!posing.enabled);
        const pvPlayer = document.getElementById('mfs-pv-player');
        if (pvPlayer) pvPlayer.classList.toggle('on', !!playerCtrl.active);
    }

    function updateStatus(extra) {
        state.statusExtra = extra || null; 
        const box = document.getElementById('mfs-status');
        if (!box) return;
        const s = window.MF_Film?.status;
        const fps = 0; 
        box.innerHTML =
            `<span style="color:${s?.recording ? '#e33' : '#9a9aa6'}">● ${s?.recording ? 'REC' : s?.playing ? (s.paused ? 'PAUSA' : 'PLAY') : 'LISTO'}</span><br>` +
            `tick ${s?.playing ? s.tick : Math.floor(state.playheadTick)} / ${state.activeTake?.durationTicks || '—'}<br>` +
            `keyframes en memoria: ${s?.frames || 0}<br>` +
            (extra ? `<span style="color:#4fc3f7">${extra}</span>` : '');
    }

    function refreshPosePanel() {
        const box = document.getElementById('mfs-pose');
        if (!box) return;
        const P = window.MF_Pose;
        if (!P) { box.innerHTML = '<div class="mfs-prop"><label>MF_Pose no disponible</label></div>'; return; }

        box.innerHTML = '';
        const parts = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        const labels = { head: 'Cabeza', torso: 'Torso', leftArm: 'Brazo izq.', rightArm: 'Brazo der.', leftLeg: 'Pierna izq.', rightLeg: 'Pierna der.' };
        const axes = [
            { key: 'pitch', label: 'P' },
            { key: 'yaw', label: 'Y' },
            { key: 'roll', label: 'R' },
            { key: 'bend', label: 'B', onlyLimbs: true }
        ];

        const angleState = {}; 

        for (const part of parts) {
            const isLimb = part.includes('Arm') || part.includes('Leg');
            angleState[part] = { pitch: 0, yaw: 0, roll: 0, bend: 0 };
            const row = el('div', 'mfs-pose-part');
            row.style.cssText = 'margin-bottom:8px;';
            row.innerHTML = `<div style="font-size:11px;color:#c8c8d2;margin-bottom:3px;">${labels[part]}</div>`;

            const sliderRow = el('div');
            sliderRow.style.cssText = 'display:flex;gap:4px;align-items:center;';
            for (const ax of axes) {
                if (ax.onlyLimbs && !isLimb) continue;
                const wrap = el('div');
                wrap.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;';
                const inp = el('input');
                inp.type = 'range';
                inp.min = -180; inp.max = 180; inp.value = 0; inp.step = 1;
                inp.style.cssText = 'width:100%;height:14px;accent-color:#ff6b2b;';
                inp.title = ax.key;
                const num = el('div', '', '0');
                num.style.cssText = 'font-size:9px;color:#6e6e7a;font-family:Consolas,monospace;';
                inp.oninput = () => {
                    angleState[part][ax.key] = +inp.value;
                    num.textContent = inp.value;
                    try { P.setPart(part, angleState[part]); } catch (e) { num.textContent = '×'; }
                };
                
                inp.ondblclick = () => {
                    inp.value = 0; num.textContent = '0';
                    angleState[part][ax.key] = 0;
                    try { P.setPart(part, angleState[part]); } catch {}
                };
                wrap.appendChild(inp); wrap.appendChild(num);
                sliderRow.appendChild(wrap);
            }
            row.appendChild(sliderRow);
            box.appendChild(row);
        }

        const actions = el('div');
        actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;';
        for (const preset of (P.presets || [])) {
            const b = el('button', 'mfs-btn', preset);
            b.style.cssText = 'height:24px;font-size:10px;padding:0 8px;';
            b.onclick = () => { P.applyPreset(preset); updateStatus('Preset: ' + preset); };
            actions.appendChild(b);
        }
        const resetB = el('button', 'mfs-btn', '↺ Reset');
        resetB.style.cssText = 'height:24px;font-size:10px;padding:0 8px;';
        resetB.onclick = () => { P.reset(); updateStatus('Pose vanilla restaurada'); };
        actions.appendChild(resetB);

        const saveB = el('button', 'mfs-btn primary', '💾 Save pose');
        saveB.style.cssText = 'height:24px;font-size:10px;padding:0 8px;width:100%;margin-top:6px;';
        saveB.onclick = () => {
            const name = prompt('Pose name:', 'pose-' + (P.list().length + 1));
            if (!name) return;
            const r = P.save(name);
            updateStatus(r.ok ? 'Pose "' + name + '" saved' : r.error);
        };
        actions.appendChild(saveB);

        const saved = P.list();
        if (saved.length) {
            const loadRow = el('div');
            loadRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;';
            for (const name of saved.slice(0, 8)) {
                const b = el('button', 'mfs-btn', name);
                b.style.cssText = 'height:22px;font-size:9px;padding:0 6px;';
                b.title = 'Aplicar pose guardada';
                b.onclick = () => { P.apply(name); updateStatus('Pose: ' + name); };
                loadRow.appendChild(b);
            }
            actions.appendChild(loadRow);
        }
        box.appendChild(actions);

        const A = window.MF_Animation;
        if (A) {
            const anim = el('div');
            anim.style.cssText = 'margin-top:14px;padding-top:10px;border-top:1px solid #2a2a38;';
            anim.appendChild(Object.assign(el('div'), {
                textContent: '🎞 Animation Mode',
                style: 'cssText'
            }));
            anim.lastChild.style.cssText = 'font-size:11px;font-weight:700;color:#d4a3ff;margin-bottom:6px;';

            const rowA = el('div');
            rowA.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;';
            const newB = el('button', 'mfs-btn', '+ Anim');
            newB.style.cssText = 'height:24px;font-size:10px;padding:0 8px;';
            newB.onclick = () => {
                const name = prompt('Nombre de la animación:', 'anim-' + (A.list().length + 1));
                if (!name) return;
                const len = parseFloat(prompt('Duración (segundos):', '2')) || 2;
                A.create(name, len);
                refreshPosePanel();
                updateStatus('Animación "' + name + '" creada (' + len + 's). Posar escribe keyframes.');
            };
            rowA.appendChild(newB);
            const sel = el('select');
            sel.style.cssText = 'flex:1;height:24px;font-size:10px;background:#1b1b24;color:#e8e8f0;border:1px solid #33334a;border-radius:4px;';
            for (const n of A.list()) {
                const o = document.createElement('option');
                o.value = n; o.textContent = n;
                if (n === A.current) o.selected = true;
                sel.appendChild(o);
            }
            sel.onchange = () => { A.open(sel.value); refreshPosePanel(); };
            rowA.appendChild(sel);
            anim.appendChild(rowA);

            if (A.current) {
                const rowB = el('div');
                rowB.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap;';
                const mkBtn = (txt, fn, title) => {
                    const b = el('button', 'mfs-btn', txt);
                    b.style.cssText = 'height:24px;font-size:10px;padding:0 8px;';
                    b.title = title || '';
                    b.onclick = fn;
                    rowB.appendChild(b);
                    return b;
                };
                mkBtn('▶', () => { A.play(); updateStatus('Anim: play'); }, 'Play');
                mkBtn('⏸', () => { A.pause(); updateStatus('Anim: pause'); }, 'Pause');
                mkBtn('⏹', () => { A.stop(); refreshPosePanel(); updateStatus('Anim: stop'); }, 'Stop and rewind');
                
                const kp = mkBtn('◆+', () => {
                    const part = posing.selPart || null;
                    const r = A.snapKey(part);
                    if (!r.ok) {
                        updateStatus('⚠ ' + (r.error || 'could not record keyframe (pose a part first)'));
                        return;
                    }
                    updateStatus(`Keyframe ${part || 'whole body'} @ ${A.time().toFixed(2)}s (${r.written.length} channels)`);
                    refreshPosePanel();
                }, 'Add keyframe with current pose at playhead\n(no part selected = whole body)');
                kp.style.color = '#7bd88f';
                
                const ak = mkBtn(A.autoKeyEnabled ? '⏺ AutoKey' : '⏹ AutoKey', (e) => {
                    A.setAutoKey(!A.autoKeyEnabled);
                    e.target.textContent = A.autoKeyEnabled ? '⏺ AutoKey' : '⏹ AutoKey';
                    e.target.style.color = A.autoKeyEnabled ? '#ff6b2b' : '';
                }, 'Posar escribe keyframes en el playhead');
                ak.style.color = A.autoKeyEnabled ? '#ff6b2b' : '';
                
                const mb = mkBtn(A.mirrorEnabled ? '🪞 ON' : '🪞 OFF', (e) => {
                    A.setMirror(!A.mirrorEnabled);
                    e.target.textContent = A.mirrorEnabled ? '🪞 ON' : '🪞 OFF';
                    e.target.style.color = A.mirrorEnabled ? '#d4a3ff' : '';
                }, 'Mirror animating: editar un lado refleja al otro');
                mb.style.color = A.mirrorEnabled ? '#d4a3ff' : '';
                
                mkBtn('∿ ' + (curAnimInterp() || 'smooth'), () => {
                    const modes = ['smooth', 'linear', 'step'];
                    const curI = curAnimInterp() || 'smooth';
                    const next = modes[(modes.indexOf(curI) + 1) % modes.length];
                    A.setInterp(next);
                    refreshPosePanel();
                }, 'Interpolation: smooth (Catmull-Rom) / linear / step');
                anim.appendChild(rowB);

                const rowC = el('div');
                rowC.style.cssText = 'display:flex;gap:4px;align-items:center;margin-bottom:4px;';
                rowC.appendChild(Object.assign(el('span'), { textContent: '⏱' }));
                const tIn = el('input');
                tIn.type = 'number'; tIn.min = '0'; tIn.step = '0.05';
                tIn.value = A.time().toFixed(2);
                tIn.style.cssText = 'width:56px;height:22px;font-size:10px;background:#1b1b24;color:#e8e8f0;border:1px solid #33334a;border-radius:4px;';
                tIn.onchange = () => { A.setTime(parseFloat(tIn.value) || 0); };
                rowC.appendChild(tIn);
                rowC.appendChild(Object.assign(el('span'), { textContent: '/ ' + A.length() + 's' }));
                anim.appendChild(rowC);

                const rowF = el('div');
                rowF.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px;';
                rowF.appendChild(Object.assign(el('span'), { textContent: '🎚 FPS', title: 'Máx. de veces por segundo que se aplica la pose durante la reproducción' }));
                const fpsIn = el('input');
                fpsIn.type = 'range'; fpsIn.min = '5'; fpsIn.max = '180'; fpsIn.step = '1';
                fpsIn.value = A.fps;
                fpsIn.style.cssText = 'flex:1;height:4px;accent-color:#ff6b2b;cursor:pointer;';
                fpsIn.title = '5 = estilo stop-motion · 60 = fluido · 180 = cada frame del monitor';
                const fpsVal = el('span');
                fpsVal.textContent = A.fps;
                fpsVal.style.cssText = 'font-family:Consolas,monospace;font-size:10px;color:#e8e8f0;width:28px;text-align:right;';
                fpsIn.oninput = () => { fpsVal.textContent = A.setFps(fpsIn.value); };
                rowF.appendChild(fpsIn);
                rowF.appendChild(fpsVal);
                anim.appendChild(rowF);

                if (posing.selPart) {
                    const chanRow = el('div');
                    chanRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;';
                    chanRow.appendChild(Object.assign(el('span'), { textContent: posing.selPart + ':' }));
                    for (const ch of A.CHANNELS) {
                        const b = el('button', 'mfs-btn', '+ ' + ch);
                        b.style.cssText = 'height:22px;font-size:9px;padding:0 6px;';
                        b.title = 'Keyframe del valor actual en el playhead';
                        b.onclick = () => {
                            const vals = A.readPart(posing.selPart);
                            if (vals?.[ch]) A.setChannel(posing.selPart, ch, A.time(), vals[ch]);
                            updateStatus('Key ' + ch + ' @ ' + A.time().toFixed(2) + 's → ' + posing.selPart);
                        };
                        chanRow.appendChild(b);
                    }
                    anim.appendChild(chanRow);
                }
            }
            box.appendChild(anim);
        }
    }

    function curAnimInterp() {
        return window.MF_Animation?.interp || 'smooth';
    }

    function updateProps() {
        const box = document.getElementById('mfs-props');
        if (!box) return;
        const take = state.activeTake;
        if (!take) { box.innerHTML = '<div class="mfs-prop"><label>No active take</label></div>'; return; }
        const s = getGame()?.player?.pos;
        box.innerHTML = `
            <div class="mfs-prop"><label>Nombre</label><span class="val">${take.name}</span></div>
            <div class="mfs-prop"><label>Duración</label><span class="val">${(take.durationTicks / TPS).toFixed(2)}s (${take.durationTicks}t)</span></div>
            <div class="mfs-prop"><label>Keyframes</label><span class="val">${take.actors?.[0]?.frames?.length || 0}</span></div>
            <div class="mfs-prop"><label>Actores</label><span class="val">${take.actors?.length || 0}</span></div>
            <div class="mfs-prop"><label>Servidor</label><span class="val">${take.server || '—'}</span></div>
            <div class="mfs-prop"><label>Pos. jugador</label><span class="val">${s ? [s.x, s.y, s.z].map(v => Math.floor(v)).join(' ') : '—'}</span></div>
            <button class="mfs-btn" id="mfs-export" style="width:100%;margin-top:8px;">⬇ Exportar .mffilm.json</button>
            <button class="mfs-btn" id="mfs-del" style="width:100%;margin-top:4px;">🗑 Borrar toma</button>`;
        document.getElementById('mfs-export').onclick = () => window.MF_Film?.exportFilm(state.activeFilm);
        document.getElementById('mfs-del').onclick = () => {
            if (state.activeFilm && confirm('Delete take "' + state.activeFilm + '"?')) {
                window.MF_Film?.deleteFilm(state.activeFilm);
                state.activeFilm = null; state.activeTake = null;
                document.getElementById('mfs-project').textContent = 'Project: no active take';
                refreshTakes(); renderTimeline(); updateProps();
            }
        };
    }

    function looksLikeGameCanvas(node) {
        if (!(node instanceof HTMLCanvasElement)) return false;
        const c = document.querySelector('#react canvas, body > canvas, #game canvas');
        return c === node;
    }
    function hasGameCanvasInside(node) {
        if (looksLikeGameCanvas(node)) return true;
        return [...node.querySelectorAll?.('canvas') ?? []].some(c => {
            
            const r = c.getBoundingClientRect();
            return r.width > 500 && r.height > 400;
        });
    }
    function applyCinema() {
        const hud = document.getElementById('canvas-hud');
        if (state.cinema) {
            if (hud && !hud.dataset.mfsPrevDisplay) {
                hud.dataset.mfsPrevDisplay = hud.style.visibility || '';
                hud.style.visibility = 'hidden';
                state.hiddenHudEls.push(hud);
            }
            
            document.querySelectorAll('body > div, body > section').forEach(d => {
                if (d.id === ID || d.id?.startsWith('mf-')) return;
                if (d.id === 'react') return; 
                if (hasGameCanvasInside(d)) return;
                const pos = getComputedStyle(d).position;
                if (pos === 'fixed' || pos === 'absolute') {
                    if (!d.dataset.mfsPrevDisplay) {
                        d.dataset.mfsPrevDisplay = d.style.display || '';
                        d.style.display = 'none';
                        state.hiddenHudEls.push(d);
                    }
                }
            });
        } else {
            for (const d of state.hiddenHudEls) {
                if (d.id === 'canvas-hud') d.style.visibility = d.dataset.mfsPrevDisplay || '';
                else d.style.display = d.dataset.mfsPrevDisplay || '';
                delete d.dataset.mfsPrevDisplay;
            }
            state.hiddenHudEls = [];
        }
    }

    let lastUiUpdate = 0;
    let lastCamFrame = 0;
    const UI_INTERVAL_MS = 200; 

    function uiLoop(now) {
        if (!state.open) return;
        
        clampGameCanvas();
        
        if (document.pointerLockElement && !playerCtrl.active) releasePointerLock();
        
        if (traj.on) trajDraw();
        
        if (lastCamFrame) {
            
            const dt = Math.min(0.05, Math.max(0, (now - lastCamFrame) / 1000));
            applyCameraMovement(dt);
        }
        lastCamFrame = now;
        
        playbackCamTick();
        
        if (p2p.share) emitLocalPose();
        
        updatePlayhead();
        
        if (now - lastUiUpdate >= UI_INTERVAL_MS) {
            lastUiUpdate = now;
            const s = window.MF_Film?.status;
            const sig = `${s?.recording}|${s?.playing}|${s?.paused}|${s?.tick}|${Math.floor(state.playheadTick)}|${s?.frames || 0}`;
            if (sig !== state.lastUiSig) {
                state.lastUiSig = sig;
                updateButtons();
                updateStatus(state.statusExtra);
            }
        }
        state.raf = requestAnimationFrame(uiLoop);
    }

    const cam = {
        active: false, dragging: false, lastX: 0, lastY: 0,
        keys: {}, keysBound: false,
        camera: null, origParent: null, origIndex: -1, scene: null,
        pos: null, yaw: 0, pitch: 0,
        origPos: null, origQuat: null
    };
    
    let camMouseBound = false;

    function getStudioCamPose() {
        if (cam.active && cam.pos) {
            return { x: cam.pos.x, y: cam.pos.y, z: cam.pos.z, yaw: cam.yaw, pitch: cam.pitch,
                     fov: (cam.origFov != null ? cam.origFov : cam.camera?.fov) || 0 };
        }
        return null;
    }
    
    function applyCamFov(fov) {
        if (!cam.camera || !fov) return;
        try {
            if (cam.origFov == null) cam.origFov = cam.camera.fov;
            cam.camera.fov = fov;
            cam.camera.updateProjectionMatrix?.();
        } catch {}
    }

    let poolOpen = true;
    function poolToggle(open) {
        poolOpen = !!open;
        document.getElementById('mf-studio-pool')?.classList.toggle('hidden', !poolOpen);
        document.getElementById('mfs-ib-pool')?.classList.toggle('on', poolOpen);
    }

    let camPanelOpen = false;
    function camPanelToggle() {
        camPanelOpen = !camPanelOpen;
        
        if (camPanelOpen) poolToggle(true);
        const sec = document.getElementById('mfs-cam-list')?.closest('.mfs-section');
        if (sec) sec.style.display = camPanelOpen ? '' : 'none';
        document.getElementById('mfs-ib-cam')?.classList.toggle('on', camPanelOpen);
    }
    function refreshCamList() {
        const box = document.getElementById('mfs-cam-list');
        if (!box) return;
        const FC = window.MF_FilmCamera;
        const clips = FC?.clips || [];
        if (!clips.length) {
            box.innerHTML = '<div class="mfs-empty">No clips.<br>Position the camera and add one:</div>';
        }
        
        const btns = el('div');
        btns.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:6px 0;';
        const types = ['idle', 'keyframe', 'path', 'dolly', 'orbit', 'look', 'shake', 'translate', 'subtitle', 'audio'];
        for (const t of types) {
            const T = FC?.TYPES?.[t];
            if (!T) continue;
            const b = el('button', 'mfs-btn');
            b.textContent = `${T.icon} ${T.label}`;
            b.title = `Añadir clip ${T.label} en el playhead (pose actual de la cámara)`;
            b.style.cssText = 'padding:4px 6px;font-size:11px;text-align:left;';
            b.onclick = () => {
                try {
                    const c = FC.addFromStudio(t, { start: Math.max(0, Math.round(state.playheadTick || 0)) });
                    updateStatus(`🎥 clip ${T.label} añadido en ${(c.start / 20).toFixed(1)}s`);
                    refreshCamList();
                    window.MF_Timeline?.render?.();
                } catch (e) { updateStatus('⚠ ' + (e?.message || e)); }
            };
            btns.appendChild(b);
        }
        box.innerHTML = '';
        box.appendChild(btns);
        if (clips.length) {
            const list = el('div');
            list.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
            for (const c of FC.byLayer()) {
                const T = FC.TYPES[c.type] || {};
                const row = el('div');
                row.style.cssText = `display:flex;align-items:center;gap:4px;padding:3px 5px;border-radius:3px;background:${FC.selectedId === c.id ? '#2a3b5a' : '#1d1d24'};cursor:pointer;`;
                row.innerHTML = `<span>${T.icon || '🎥'}</span>
                    <span style="flex:1;font-size:11px;${c.enabled ? '' : 'opacity:.45;text-decoration:line-through;'}">${c.title}</span>
                    <span style="font-size:10px;color:#8a8a96;">${(c.start / 20).toFixed(1)}s</span>`;
                row.title = `Capa ${c.layer} · ${T.label}\nClick = seleccionar · botones de la derecha para editar`;
                row.onclick = () => { FC.selectedId = c.id; refreshCamList(); window.MF_Timeline?.render?.(); };
                
                const acts = el('span');
                acts.style.cssText = 'display:flex;gap:2px;';
                const mk = (txt, fn, title) => {
                    const a = el('button', 'mfs-btn icon');
                    a.textContent = txt; a.title = title;
                    a.style.cssText = 'padding:1px 5px;font-size:10px;';
                    a.onclick = (ev) => { ev.stopPropagation(); fn(); };
                    return a;
                };
                acts.appendChild(mk(c.enabled ? '⏸' : '▶', () => { FC.update(c.id, { enabled: !c.enabled }); refreshCamList(); window.MF_Timeline?.render?.(); }, c.enabled ? 'Deshabilitar' : 'Habilitar'));
                if (c.type === 'keyframe' || c.type === 'path') {
                    acts.appendChild(mk('＋', () => {
                        FC.addKeyAt(c.id, Math.max(0, Math.round((state.playheadTick || 0) - c.start)));
                        updateStatus('🎥 waypoint added with current pose');
                        refreshCamList();
                    }, 'Add keyframe/waypoint at playhead with current pose'));
                }
                acts.appendChild(mk('🗑', () => { FC.remove(c.id); refreshCamList(); window.MF_Timeline?.render?.(); }, 'Eliminar clip'));
                row.appendChild(acts);
                list.appendChild(row);
            }
            box.appendChild(list);
        }
    }

    let playbackCamActive = false;
    function playbackCamTick() {
        const F = window.MF_Film;
        const FC = window.MF_FilmCamera;
        if (!F || !FC) return;
        const s = F.status;
        if (!s?.playing) {
            if (playbackCamActive) {
                playbackCamActive = false;
                FC.reset();
                
                if (cam.origFov != null && cam.camera) {
                    try { cam.camera.fov = cam.origFov; cam.camera.updateProjectionMatrix?.(); } catch {}
                }
            }
            return;
        }
        if (!FC.clips.length) return;
        const pose = FC.onTick(s.tick ?? 0, !s.paused);
        if (pose?.hasPos) {
            if (!cam.active) try { cameraEnable(); } catch {}
            playbackCamActive = true;
            cam.pos.x = pose.x; cam.pos.y = pose.y; cam.pos.z = pose.z;
            cam.yaw = pose.yaw; cam.pitch = pose.pitch;
            applyCamFov(pose.fov || null);
            
            if (pose.roll && cam.camera?.rotation?.set) {
                try { cam._roll = pose.roll; } catch {}
            }
        }
        renderSubtitle(FC.subtitle);
    }

    let subEl = null;
    function renderSubtitle(sub) {
        if (!sub) { if (subEl) { subEl.remove(); subEl = null; } return; }
        const root = document.getElementById(ID);
        if (!root) return;
        if (!subEl) {
            subEl = el('div');
            subEl.style.cssText = `
                position:absolute;left:0;right:0;pointer-events:none;z-index:50;
                text-align:center;text-shadow:0 2px 6px rgba(0,0,0,.9);
                font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
            root.appendChild(subEl);
        }
        subEl.style.top = (sub.y * 100) + '%';
        subEl.style.left = (sub.x * 100) + '%';
        subEl.style.right = 'auto';
        subEl.style.transform = `translateX(-50%) scale(${sub.size / 20})`;
        subEl.style.color = sub.color || '#fff';
        subEl.style.background = sub.background ? 'rgba(0,0,0,.45)' : 'none';
        subEl.style.padding = sub.background ? '2px 12px' : '0';
        subEl.style.borderRadius = '4px';
        subEl.style.opacity = sub.alpha ?? 1;
        subEl.textContent = sub.text || '';
    }

    const renderer = { rec: null, chunks: [] };
    function renderVideo() {
        if (renderer.rec) { 
            try { renderer.rec.stop(); } catch {}
            return;
        }
        const F = window.MF_Film;
        if (!F) return updateStatus('⚠ MF_Film not available');
        const canvas = document.querySelector('#react canvas') || document.querySelector('canvas');
        if (!canvas) return updateStatus('⚠ no hay canvas del juego');
        const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
            .find(m => MediaRecorder.isTypeSupported?.(m));
        if (!mime) return updateStatus('⚠ este navegador no soporta MediaRecorder webm');
        const stream = canvas.captureStream(60);
        
        renderer.chunks = [];
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
        rec.ondataavailable = (e) => { if (e.data?.size) renderer.chunks.push(e.data); };
        rec.onstop = () => {
            const blob = new Blob(renderer.chunks, { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mf-render-${Date.now()}.webm`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 30_000);
            renderer.rec = null;
            updateStatus('⏺ render guardado');
            document.getElementById('mfs-pv-video')?.classList.remove('rec-on');
        };
        renderer.rec = rec;
        rec.start(250);
        document.getElementById('mfs-pv-video')?.classList.add('rec-on');
        updateStatus('⏺ recording… click ⏺ again to finish and save');
        
        const startPlayback = window.MF_Timeline?.clips?.length
            ? () => F.playSequence(window.MF_Timeline.clips.map(c => ({ filmName: c.film.name, start: c.start, duration: c.duration })))
            : () => F.playFilm(state.activeFilm || undefined);
        startPlayback();
        window.addEventListener('mf:film-ended', () => { try { renderer.rec?.stop(); } catch {} }, { once: true });
    }

    function findSceneOf(node) {
        let n = node;
        while (n) {
            if (n?.isScene) return n;
            n = n.parent;
        }
        return null;
    }

    const viewport = { canvases: [], origAspect: null };
    let clampLogN = 0, clampLogLast = 0;
    function dumpCanvases() {
        const out = [];
        try {
            document.querySelectorAll('canvas').forEach((c, i) => {
                const r = c.getBoundingClientRect();
                out.push(`[${i}] ${c.width}x${c.height}${c.id ? '#' + c.id : ''}` +
                    ` css=${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}` +
                    ` layout=${c.offsetWidth}x${c.offsetHeight}` +
                    (c.isConnected ? '' : ' DETACHED') +
                    ` parent=${c.parentNode?.nodeName}${c.parentNode?.id ? '#' + c.parentNode.id : ''}`);
            });
        } catch {}
        return out.join('  ·  ') || 'NINGUNO';
    }
    
    function collectGameCanvases() {
        const found = [];
        try {
            for (const cv of document.querySelectorAll('canvas')) {
                if (!cv.isConnected) continue;
                if (cv.closest('#mf-studio')) continue; 
                const w = cv.offsetWidth || cv.getBoundingClientRect().width;
                const h = cv.offsetHeight || cv.getBoundingClientRect().height;
                if (w >= window.innerWidth * 0.9 && h >= window.innerHeight * 0.9) found.push(cv);
            }
        } catch {}
        return found;
    }
    
    function fitTransform() {
        const p = document.getElementById('mf-studio-preview');
        if (!p) return null;
        const pr = p.getBoundingClientRect();
        if (pr.width < 2 || pr.height < 2) return null;
        return {
            tx: pr.left, ty: pr.top,
            sx: pr.width / window.innerWidth,
            sy: pr.height / window.innerHeight
        };
    }
    
    function parseTransform(cv) {
        const t = cv.style.transform;
        if (!t || t === 'none') return null;
        const nums = t.match(/-?[\d.]+/g);
        if (!nums || nums.length < 4) return null;
        return { tx: +nums[0], ty: +nums[1], sx: +nums[2], sy: +nums[3] };
    }
    function clampGameCanvas() {
        
        const want = fitTransform();
        if (!want) return;
        if (!viewport.canvases.length) {
            viewport.canvases = collectGameCanvases();
            if (!viewport.canvases.length) return;
            void 0;
        }
        const tr = `translate(${want.tx}px, ${want.ty}px) scale(${want.sx}, ${want.sy})`;
        try {
            for (const cv of viewport.canvases) {
                if (!cv.isConnected) continue;
                const cur = parseTransform(cv);
                const off = !cur
                    || Math.abs(cur.tx - want.tx) > 0.5
                    || Math.abs(cur.ty - want.ty) > 0.5
                    || Math.abs(cur.sx - want.sx) > 0.0005
                    || Math.abs(cur.sy - want.sy) > 0.0005;
                if (off) {
                    cv.style.setProperty('transform-origin', '0 0', 'important');
                    cv.style.setProperty('transform', tr, 'important');
                    const now = performance.now();
                    if (clampLogN < 3 || now - clampLogLast > 5000) {
                        clampLogN++; clampLogLast = now;
                        void 0;
                    }
                }
            }
            
            const p = document.getElementById('mf-studio-preview');
            const pr = p.getBoundingClientRect();
            const c = cam.camera;
            if (c && pr.width > 2 && pr.height > 2) {
                const asp = pr.width / pr.height;
                if (viewport.origAspect == null) viewport.origAspect = c.aspect;
                if (Math.abs(c.aspect - asp) > 0.001) {
                    c.aspect = asp;
                    c.updateProjectionMatrix?.();
                }
            }
        } catch (e) {
            void 0;
        }
    }
    
    function applyViewportRect() { clampGameCanvas(); }
    function viewportEnable() {
        const cvs = collectGameCanvases();
        const p = document.getElementById('mf-studio-preview');
        void 0;
        if (!p || !cvs.length) {
            void 0;
            return false;
        }
        viewport.canvases = cvs;
        clampGameCanvas();
        window.addEventListener('resize', applyViewportRect);
        
        setTimeout(() => {
            if (!viewport.canvases.length) return;
            const pr = (document.getElementById('mf-studio-preview') || {}).getBoundingClientRect?.() || { width: 0, height: 0 };
            const parts = viewport.canvases.map((cv) => {
                const r = cv.getBoundingClientRect();
                return (cv.id || 'canvas') + ' css=' + Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top);
            });
            void 0;
        }, 1000);
        return true;
    }
    function viewportDisable() {
        window.removeEventListener('resize', applyViewportRect);
        for (const cv of viewport.canvases) {
            try {
                cv.style.removeProperty('transform');
                cv.style.removeProperty('transform-origin');
            } catch {}
        }
        if (viewport.canvases.length) void 0;
        
        if (cam.camera && viewport.origAspect != null) {
            try {
                cam.camera.aspect = viewport.origAspect;
                cam.camera.updateProjectionMatrix?.();
            } catch {}
        }
        viewport.canvases = []; viewport.origAspect = null;
    }

    function cameraEnable() {
        if (cam.active) return false;
        const game = getGame();
        const scene = game?.gameScene?.scene;
        let camera = game?.gameScene?.camera || game?.camera || null;
        if (!camera) {
            
            camera = scene?.camera || null;
        }
        if (!camera || !scene) return false;

        cam.camera = camera;
        cam.origParent = camera.parent || null;
        cam.origIndex = Array.isArray(cam.origParent?.children) ? cam.origParent.children.indexOf(camera) : -1;
        cam.scene = scene;
        cam.origPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        try {
            cam.origQuat = { x: camera.quaternion.x, y: camera.quaternion.y, z: camera.quaternion.z, w: camera.quaternion.w };
        } catch { cam.origQuat = null; }

        cam.pos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        
        try {
            camera.updateMatrixWorld?.(true);
            const wp = camera.getWorldPosition?.(new camera.position.constructor());
            if (wp && Number.isFinite(wp.x)) { cam.pos = { x: wp.x, y: wp.y, z: wp.z }; }
        } catch {}
        
        try {
            if (typeof scene.attach === 'function') scene.attach(camera);
            else scene.add(camera);
        } catch {}
        try {
            camera.updateMatrixWorld?.(true);
            cam.pos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
            cam.yaw = Number(camera.rotation?.y) || 0;
            cam.pitch = Number(camera.rotation?.x) || 0;
        } catch {}

        cam.active = true;
        bindCameraKeys();
        installCamHooks(camera);
        applyCamPose();
        
        void 0;
        return true;
    }

    function cameraDisable() {
        if (!cam.active) return;
        
        cam.active = false;
        cam.dragging = false;
        cam.keys = {};
        removeCamHooks();
        const camera = cam.camera;
        if (camera && cam.origParent) {
            try {
                
                if (cam.origPos) camera.position.set(cam.origPos.x, cam.origPos.y, cam.origPos.z);
                if (cam.origQuat) camera.quaternion.set(cam.origQuat.x, cam.origQuat.y, cam.origQuat.z, cam.origQuat.w);
                cam.origParent.add(camera);
                if (cam.origIndex >= 0 && Array.isArray(cam.origParent.children)) {
                    const idx = cam.origParent.children.indexOf(camera);
                    if (idx >= 0 && idx !== cam.origIndex && cam.origIndex < cam.origParent.children.length) {
                        cam.origParent.children.splice(idx, 1);
                        cam.origParent.children.splice(cam.origIndex, 0, camera);
                    }
                }
                camera.updateMatrixWorld?.(true);
            } catch {}
        }
        cam.camera = null; cam.origParent = null; cam.scene = null;
    }

    const camHooks = { umw: null, uwm: null, updating: false };
    function applyCamPose() {
        const c = cam.camera;
        if (!c) return;
        
        if (p2p.applying) return; 
        if (p2p.followRemoteCamera && p2p.camActive && p2p.camRemote) {
            if (cam.dragging || camKeysActive()) {
                p2p.camActive = false;
                p2p.camRemote = null;
                updateStatus('📡 You took control of the local camera');
            } else {
                const L = p2p.camLerp;
                const r = p2p.camRemote;
                cam.pos.x += (r.x - cam.pos.x) * L;
                cam.pos.y += (r.y - cam.pos.y) * L;
                cam.pos.z += (r.z - cam.pos.z) * L;
                let dyaw = r.yaw - cam.yaw;
                while (dyaw > Math.PI) dyaw -= Math.PI * 2;
                while (dyaw < -Math.PI) dyaw += Math.PI * 2;
                cam.yaw += dyaw * L;
                cam.pitch += (r.pitch - cam.pitch) * L;
            }
        }
        c.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
        if (typeof c.rotation?.set === 'function') {
            try { c.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ'); } catch { c.rotation.set(cam.pitch, cam.yaw, 0); }
        }
        
    }
    function installCamHooks(camera) {
        if (!camera) return;
        if (camHooks.umw?.camera !== camera && typeof camera.updateMatrixWorld === 'function') {
            const original = camera.updateMatrixWorld;
            const hook = function (...args) {
                if (camHooks.updating) return original.apply(this, args);
                camHooks.updating = true;
                try {
                    if (cam.active && cam.camera === camera) applyCamPose();
                    return original.apply(this, args);
                } finally {
                    camHooks.updating = false;
                }
            };
            try { camera.updateMatrixWorld = hook; camHooks.umw = { camera, original, hook }; } catch {}
        }
        if (camHooks.uwm?.camera !== camera && typeof camera.updateWorldMatrix === 'function') {
            const original = camera.updateWorldMatrix;
            const hook = function (...args) {
                if (camHooks.updating) return original.apply(this, args);
                camHooks.updating = true;
                try {
                    if (cam.active && cam.camera === camera) applyCamPose();
                    return original.apply(this, args);
                } finally {
                    camHooks.updating = false;
                }
            };
            try { camera.updateWorldMatrix = hook; camHooks.uwm = { camera, original, hook }; } catch {}
        }
    }
    function removeCamHooks() {
        if (camHooks.umw) { try { camHooks.umw.camera.updateMatrixWorld = camHooks.umw.original; } catch {} }
        if (camHooks.uwm) { try { camHooks.uwm.camera.updateWorldMatrix = camHooks.uwm.original; } catch {} }
        camHooks.umw = null; camHooks.uwm = null; camHooks.updating = false;
    }

    function bindCameraKeys() {
        if (cam.keysBound) return;
        cam.keysBound = true;
        window.addEventListener('keydown', (ev) => {
            if (!cam.active || !state.open) return;
            
            if (playerCtrl.active) return;
            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(ev.code)) {
                cam.keys[ev.code] = true;
                ev.preventDefault();
            }
        });
        window.addEventListener('keyup', (ev) => { cam.keys[ev.code] = false; });
    }

    function camKeysActive() {
        return !!(cam.keys.KeyW || cam.keys.KeyA || cam.keys.KeyS ||
            cam.keys.KeyD || cam.keys.KeyQ || cam.keys.KeyE);
    }

    function applyCameraMovement(dt) {
        if (!cam.active) return;
        let f = 0, s = 0, v = 0;
        if (cam.keys.KeyW) f += 1;
        if (cam.keys.KeyS) f -= 1;
        if (cam.keys.KeyD) s += 1;
        if (cam.keys.KeyA) s -= 1;
        if (cam.keys.KeyE) v += 1;
        if (cam.keys.KeyQ) v -= 1;
        if (f || s || v) {
            const dist = 10 * dt * (cam.keys.ControlLeft || cam.keys.ControlRight ? 3 : 1);
            const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
            cam.pos.x += (-sy * f + cy * s) * dist;
            cam.pos.z += (-cy * f - sy * s) * dist;
            cam.pos.y += v * dist;
        }
        applyCamPose(); 
    }

    function applyRemoteCam(p) {
        
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
        p2p.camRemote = { x: p.x, y: p.y, z: p.z, yaw: +p.yaw || 0, pitch: +p.pitch || 0 };
    }

    function remoteCamActive(on) {
        p2p.camActive = !!on;
        if (!on) p2p.camRemote = null;
    }

    function applyRemotePose(pose, reset) {
        if (reset) {
            p2p.applying = true;
            try { window.MF_Pose?.reset?.(); } catch {}
            p2p.applying = false;
            return;
        }
        if (!pose || typeof pose !== 'object') return;
        
        try { p2p._poseKey = JSON.stringify(pose); } catch {}
        p2p._remotePoseAt = performance.now();
        p2p.applying = true;
        try {
            const P = window.MF_Pose;
            if (P?.applyPoseObj) P.applyPoseObj(pose);
        } catch {}
        p2p.applying = false;
    }

    function emitLocalPose(force) {
        if (!p2p.share || p2p.applying) return;
        
        if (p2p._remotePoseAt && performance.now() - p2p._remotePoseAt < 150) return;
        const now = performance.now();
        if (!force && now - p2p.lastPoseOut < 50) return;
        p2p.lastPoseOut = now;
        const pose = window.MF_Pose?.getPose?.();
        if (!pose) return;
        
        const out = {};
        for (const part in pose) {
            out[part] = [+pose[part][0].toFixed(3), +pose[part][1].toFixed(3), +pose[part][2].toFixed(3)];
        }
        const key = JSON.stringify(out);
        if (!force && key === p2p._poseKey) return;
        p2p._poseKey = key;
        sendStudio({ t: 'studio-pose', pose: out });
    }

    function bindPreviewCamera() {
        const preview = document.getElementById('mf-studio-preview');
        if (!preview || preview.dataset.camBound) return;
        preview.dataset.camBound = '1';
        preview.style.cursor = 'grab';

        preview.addEventListener('mousedown', (ev) => {
            if (!cam.active || ev.button !== 0) return;
            
            if (posing.enabled) return;
            cam.dragging = true;
            cam.lastX = ev.clientX; cam.lastY = ev.clientY;
            preview.style.cursor = 'grabbing';
            ev.preventDefault();
        });
        if (!camMouseBound) {
            camMouseBound = true;
            window.addEventListener('mousemove', (ev) => {
                if (!cam.dragging) return;
                const dx = ev.clientX - cam.lastX;
                const dy = ev.clientY - cam.lastY;
                cam.lastX = ev.clientX; cam.lastY = ev.clientY;
                const sens = 0.0035;
                cam.yaw -= dx * sens;
                cam.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, cam.pitch - dy * sens));
            });
            window.addEventListener('mouseup', () => {
                if (!cam.dragging) return;
                cam.dragging = false;
                const p = document.getElementById('mf-studio-preview');
                if (p) p.style.cursor = 'grab';
            });
        }
    }

    const posing = { enabled: false, selected: null, selPart: null, dragging: false, lastX: 0, lastY: 0, startX: 0, startY: 0, rotHandle: null, bound: false, outline: null };
    let posingWinBound = false;

    function posingToggle(on) {
        posing.enabled = !!on;
        if (!on) posingDeselect();
        const btn = document.getElementById('mfs-pv-control');
        if (btn) {
            btn.classList.toggle('on', posing.enabled);
            btn.classList.toggle('warm', posing.enabled);
        }
        const preview = document.getElementById('mf-studio-preview');
        if (preview) preview.style.cursor = posing.enabled ? 'crosshair' : 'grab';
    }

    const traj = { on: false, sel: -1 };
    const TRAJ_COLORS = ['#57F52A', '#0088FF', '#FFA500', '#DE2E9F', '#6820AD', '#D82253'];
    function trajToggle(on) {
        traj.on = on == null ? !traj.on : !!on;
        const cv = document.getElementById('mf-studio-traj');
        if (cv) {
            cv.style.display = traj.on ? 'block' : 'none';
            cv.classList.toggle('hint', traj.on);
        }
        const btn = document.getElementById('mfs-pv-traj');
        if (btn) btn.classList.toggle('on', traj.on);
        if (traj.on) trajDraw();
    }
    
    function matrixVec(m, x, y, z, w) {
        return {
            x: m[0] * x + m[4] * y + m[8] * z + m[12] * w,
            y: m[1] * x + m[5] * y + m[9] * z + m[13] * w,
            z: m[2] * x + m[6] * y + m[10] * z + m[14] * w,
            w: m[3] * x + m[7] * y + m[11] * z + m[15] * w
        };
    }
    function trajProjectHelper(p, camera, w, h) {
        const view = camera?.matrixWorldInverse?.elements;
        const proj = camera?.projectionMatrix?.elements;
        if (!view || !proj) return null;
        const v = matrixVec(view, p.x, p.y, p.z, 1);
        const c = matrixVec(proj, v.x, v.y, v.z, v.w);
        if (!Number.isFinite(c.w) || c.w <= 0.00001) return null; 
        const nx = c.x / c.w, ny = c.y / c.w, nz = c.z / c.w;
        if (![nx, ny, nz].every(Number.isFinite)) return null;
        return { x: (nx * 0.5 + 0.5) * w, y: (-ny * 0.5 + 0.5) * h };
    }
    
    function trajClipPoints(c) {
        const FC = window.MF_FilmCamera;
        if (!FC || !c) return [];
        const pts = [];
        const n = Math.min(120, Math.max(8, c.duration));
        const step = c.duration / n;
        for (let i = 0; i <= n; i++) {
            const t = Math.min(c.duration - 0.01, i * step);
            const pose = FC.evalClipOnly?.(c, t);
            if (pose?.hasPos) pts.push({ x: pose.x, y: pose.y, z: pose.z });
        }
        return pts;
    }
    
    function trajClipKeys(c) {
        const P = c.props || {};
        if (c.type === 'path') return P.points || [];
        if (c.type === 'keyframe') return P.keys || [];
        if (c.type === 'idle' || c.type === 'dolly') return [P.pose || {}].filter(Boolean);
        if (c.type === 'orbit') {
            
            const t = P.target || { x: 0, y: 0, z: 0 }, out = [];
            const d = P.distance || 8, h = P.height || 2;
            for (let i = 0; i < 8; i++) {
                unshiftOrbitPoint(out, t, d, h, (P.from || 0) + (P.to || 360) * i / 8);
            }
            return out;
        }
        return [];
    }
    function unshiftOrbitPoint(out, t, d, h, deg) {
        const a = deg * Math.PI / 180;
        out.push({ x: t.x + Math.cos(a) * d, y: t.y + h, z: t.z + Math.sin(a) * d });
    }
    
    function trajDrawable(c) {
        return !['subtitle', 'audio', 'look', 'shake', 'translate'].includes(c.type);
    }
    function trajDraw() {
        const cv = document.getElementById('mf-studio-traj');
        if (!cv || !traj.on) return;
        const FC = window.MF_FilmCamera;
        const camera = cam.camera;
        if (!FC || !camera) return;
        
        const r = cv.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
            cv.width = Math.round(r.width * dpr);
            cv.height = Math.round(r.height * dpr);
        }
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        const w = r.width, h = r.height;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const clips = (FC.clips || []).filter(trajDrawable);
        if (!clips.length) return;
        
        clips.forEach((c, ci) => {
            const poses = trajClipPoints(c);
            if (poses.length < 2) return;
            const color = TRAJ_COLORS[ci % TRAJ_COLORS.length];
            const sel = traj.sel === ci;
            ctx.strokeStyle = color;
            ctx.globalAlpha = sel ? 1 : 0.55;
            ctx.lineWidth = sel ? 2.5 : 1.5;
            ctx.setLineDash(c.type === 'orbit' ? [6, 4] : []);
            ctx.beginPath();
            let started = false;
            for (const p of poses) {
                const pr = trajProjectHelper(p, camera, w, h);
                if (!pr) { started = false; continue; }
                if (!started) { ctx.moveTo(pr.x, pr.y); started = true; }
                else ctx.lineTo(pr.x, pr.y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            
            const keys = trajClipKeys(c);
            ctx.fillStyle = color;
            ctx.globalAlpha = 1;
            let firstLabel = null;
            for (const k of keys) {
                const pr = trajProjectHelper(k, camera, w, h);
                if (!pr) continue;
                if (!firstLabel) firstLabel = pr;
                ctx.beginPath();
                ctx.arc(pr.x, pr.y, sel ? 4 : 3, 0, Math.PI * 2);
                ctx.fill();
            }
            
            if (firstLabel) {
                ctx.font = '10px Consolas, monospace';
                ctx.fillText(FC.TYPES?.[c.type]?.label || c.type, firstLabel.x + 6, firstLabel.y - 4);
            }
        });
        ctx.globalAlpha = 1;
    }
    
    function trajCycle(dir) {
        const FC = window.MF_FilmCamera;
        const drawable = (FC?.clips || []).filter(trajDrawable);
        if (!drawable.length) return;
        traj.sel = (traj.sel + dir + drawable.length) % drawable.length;
        
        try { FC.select?.(drawable[traj.sel].id); } catch {}
        trajDraw();
    }

    const playerCtrl = { active: false, bound: false, recHeld: false };
    function playerControlToggle() {
        playerCtrl.active = !playerCtrl.active;
        const btn = document.getElementById('mfs-pv-player');
        if (btn) btn.classList.toggle('on', playerCtrl.active);
        if (playerCtrl.active) {
            
            posingToggle(false);
            
            if (!cam.active) try { cameraEnable(); } catch {}
            
            lock.forceNext = true; 
            const cv = viewport.canvases[0];
            try { cv?.requestPointerLock?.(); } catch {}
            updateStatus('🎮 Player control ON — WASD=move · mouse=rotate player · static camera · H/ESC=exit');
            void 0;
        } else {
            if (playerCtrl.recHeld) playerCtrlRecStop(); 
            releasePointerLock();
            updateStatus('🎮 Control del jugador OFF');
            void 0;
        }
    }
    function playerControlBindKeys() {
        if (playerCtrl.bound) return;
        playerCtrl.bound = true;
        window.addEventListener('keydown', (ev) => {
            if (!state.open || !playerCtrl.active) return;
            if (ev.code === 'KeyH' || ev.key === 'Escape') {
                ev.preventDefault();
                playerControlToggle(); 
            }
        }, true);
        
        window.addEventListener('keydown', (ev) => {
            if (!state.open || !playerCtrl.active) return;
            if (ev.code === 'AltLeft' && !playerCtrl.recHeld && !isTypingTarget(ev.target)) {
                ev.preventDefault();
                playerCtrlRecStart();
            }
        }, true);
        window.addEventListener('keyup', (ev) => {
            if (ev.code === 'AltLeft' && playerCtrl.recHeld) playerCtrlRecStop();
        }, true);
        
        window.addEventListener('blur', () => {
            if (playerCtrl.recHeld) playerCtrlRecStop();
        });
        
        document.addEventListener('pointerlockchange', () => {
            if (playerCtrl.active && !document.pointerLockElement) {
                if (playerCtrl.recHeld) playerCtrlRecStop();
                playerCtrl.active = false;
                const btn = document.getElementById('mfs-pv-player');
                if (btn) btn.classList.remove('on');
                updateStatus('🎮 Player control OFF (lock lost)');
            }
        });
    }
    
    function playerCtrlRecStart() {
        const F = window.MF_Film;
        if (!F || F.status?.recording) return;
        F.stopPlayback();
        F.startRecording();
        playerCtrl.recHeld = true;
        updateStatus('⏺ RECORDING movement (release left Alt to cut)');
    }
    
    function playerCtrlRecStop() {
        playerCtrl.recHeld = false;
        const F = window.MF_Film;
        if (!F || !F.status?.recording) return;
        const r = F.stopRecording();
        if (!r.ok) return;
        const name = 'toma-' + new Date().toTimeString().slice(0, 8).replace(/:/g, '');
        const s = F.saveFilm(name);
        if (s.ok) {
            refreshTakes(); refreshMediaPool();
            
            const film = F.getFilm?.(name) || null;
            if (film && window.MF_Timeline) {
                try { window.MF_Timeline.addClip(film, Math.floor(state.playheadTick)); } catch {}
            }
            updateStatus(`⏺ Clip "${name}" grabado (${r.ticks} ticks, ${r.keyframes} keys)`);
            void 0;
        }
    }

    function shareToggle(on) {
        if (on === undefined) on = !p2p.share;
        p2p.share = !!on;
        const btn = document.getElementById('mfs-ib-share');
        if (btn) btn.classList.toggle('on', p2p.share);
        if (!p2p.share) {
            p2p._camKey = null;
            p2p._poseKey = null;
        } else {
            
            emitLocalPose(true);
        }
        const st = window.MF_Peer?.status;
        updateStatus(p2p.share
            ? (st === 'host' || st === 'guest' ? '📡 Compartiendo pose/animación con el peer' : '📡 ON — pero P2P desconectado (usa /p2p host o /p2p join)')
            : '📡 Compartir apagado');
    }

    function posingSelect(pick) {
        posingDeselect();
        if (!pick) return;
        posing.selected = pick.object;
        posing.selPart = pick.part;
        try {
            
            posing.outline = makeEmissiveHighlight(pick.object, 0x552200);
        } catch {}
        updateStatus('Pose: ' + pick.part + ' — 🖱 izq=rotar · anillos XYZ=rotar eje · flechas XYZ=mover · der=mover · rueda=yaw · Alt+rueda=tamaño · Shift=espejo · Esc=salir');
        attachGizmoToPart(pick);
    }

    const gizmo = {
        hoverAxis: null, draggingAxis: null, startOffset: null,
        axisApplied: 0, axisScale: 1,
        hoverRing: null, draggingRing: null,
        ringAccum: 0, ringLastX: 0, ringLastY: 0,
        mode: 'move'
    };

    function gizmoSetMode(mode) {
        gizmo.mode = (mode === 'rotate') ? 'rotate' : 'move';
        window.MF_Gizmo?.setMode?.(gizmo.mode);
        const btn = document.getElementById('mfs-gizmo-mode');
        if (btn) {
            btn.textContent = gizmo.mode === 'rotate' ? '⟳ Rotate' : '↔ Move';
            btn.classList.toggle('warm', gizmo.mode === 'rotate');
            btn.classList.toggle('on', gizmo.mode === 'rotate');
        }
    }

    function attachGizmoToPart(pick) {
        const G = window.MF_Gizmo;
        if (!G) return;
        
        const joint = pick.joint || getJointOfPart(pick.part);
        if (!joint) return;
        G.attach(joint, null);
        G.setMode?.(gizmo.mode); 
    }

    function getJointOfPart(part) {
        
        try {
            const g = getGame();
            const me = g?.player;
            const e = g?.world?.getPlayerById?.(me.id) || g?.world?.players?.get?.(me.id) || me;
            const mesh = e?.mesh;
            if (!mesh) return null;
            const names = {
                head: 'headPivot', torso: 'body',
                leftArm: 'leftShoulderJoint', rightArm: 'rightShoulderJoint',
                leftLeg: 'leftHipJoint', rightLeg: 'rightHipJoint'
            }[part];
            if (!names) return null;
            
            const queue = [mesh];
            const seen = new WeakSet();
            let visited = 0;
            while (queue.length && visited < 500) {
                const obj = queue.shift();
                if (!obj || typeof obj !== 'object' || seen.has(obj)) continue;
                seen.add(obj); visited++;
                if (obj[names] && obj[names].rotation) return obj[names];
                if (Array.isArray(obj.children)) for (const c of obj.children) queue.push(c);
            }
        } catch {}
        return null;
    }

    function detachGizmo() {
        window.MF_Gizmo?.detach?.();
        gizmo.hoverAxis = null;
        gizmo.draggingAxis = null;
        gizmo.axisApplied = 0;
        window.MF_Gizmo?.endDrag?.();
    }

    function applyGizmoDrag(dxTotal, dyTotal) {
        const G = window.MF_Gizmo;
        const part = posing.selPart;
        const P = window.MF_Pose;
        const axis = gizmo.draggingAxis;
        if (!G || !part || !P || !axis) return;
        
        const raw = G.dragDeltaFromStart?.(dxTotal, dyTotal);
        const target = (Number.isFinite(raw) ? raw : 0) * gizmo.axisScale;
        const step = target - gizmo.axisApplied;
        gizmo.axisApplied = target;
        if (!Number.isFinite(step) || Math.abs(step) < 1e-9) return;
        let next = { x: 0, y: 0, z: 0 };
        try { next = P.addWorldOffset(part, axis, step); } catch {}
        autoKeyTransform(part, 'position', [next.x, next.y, next.z], false);
    }

    function applyRingDrag(angleRad, snap15, mirror) {
        const part = posing.selPart;
        const P = window.MF_Pose;
        if (!part || !P) return;
        if (posing.rotHandle != null && P.applyAxisRotateWorld) {
            const out = P.applyAxisRotateWorld(posing.rotHandle, gizmo.draggingRing, angleRad, snap15, mirror);
            if (out) {
                autoKeyTransform(part, 'rotation', out.deg, false);
                if (mirror && out.mirrorDeg) {
                    const mp = mirrorPart(part);
                    if (mp) autoKeyTransform(mp, 'rotation', out.mirrorDeg, false);
                }
            }
        }
    }

    function posingDeselect() {
        if (posing.outline) {
            try { posing.outline.restore?.(); } catch {}
            posing.outline = null;
        }
        detachGizmo();
        if (posing.rotHandle != null) {
            window.MF_Pose?.endRotateWorld?.(posing.rotHandle);
            posing.rotHandle = null;
        }
        posing.selected = null;
        posing.selPart = null;
        posing.dragging = false;
    }

    function mirrorPart(part) {
        return ({ leftArm: 'rightArm', rightArm: 'leftArm', leftLeg: 'rightLeg', rightLeg: 'leftLeg' })[part] || null;
    }

    function autoKeyTransform(part, channel, value, mirror) {
        const A = window.MF_Animation;
        if (!A?.autoKeyEnabled || !A.current) return;
        
        A.autoKey(part, channel, value, !!mirror);
    }

    function applyRotFromDrag(dxTotal, dyTotal, snap15, mirror) {
        const part = posing.selPart;
        const P = window.MF_Pose;
        if (!part || !P) return;
        if (posing.rotHandle != null && P.applyRotateWorld) {
            const out = P.applyRotateWorld(posing.rotHandle, dxTotal, dyTotal, snap15, mirror);
            if (out) {
                autoKeyTransform(part, 'rotation', out.deg, false);
                if (mirror && out.mirrorDeg) {
                    const mp = mirrorPart(part);
                    if (mp) autoKeyTransform(mp, 'rotation', out.mirrorDeg, false);
                }
                return;
            }
        }
        
        const pose = P.getPose();
        const cur = pose?.[part] || [0, 0, 0];
        const deg = (r) => r * 180 / Math.PI;
        let pitch = deg(cur[0]) - dyTotal * 0.5;
        let roll = deg(cur[2]) + dxTotal * 0.5;
        if (snap15) { pitch = Math.round(pitch / 15) * 15; roll = Math.round(roll / 15) * 15; }
        try { P.setPart(part, { pitch, roll }); } catch {}
        autoKeyTransform(part, 'rotation', [pitch, undefined, roll].map((v, i) => v == null ? (cur[i] * 180 / Math.PI) : v), mirror);
        if (mirror) {
            const mp = mirrorPart(part);
            if (mp) try { P.setPart(mp, { pitch, roll: -roll }); } catch {}
        }
    }

    function applyYawFromWheel(deltaY, snap15, mirror) {
        const part = posing.selPart;
        const P = window.MF_Pose;
        if (!part || !P) return;
        const pose = P.getPose();
        const cur = pose?.[part] || [0, 0, 0];
        const deg = (r) => r * 180 / Math.PI;
        let yaw = deg(cur[1]) + (deltaY < 0 ? 5 : -5);
        if (snap15) yaw = Math.round(yaw / 15) * 15;
        try { P.setPart(part, { yaw }); } catch {}
        autoKeyTransform(part, 'rotation', [deg(cur[0]), yaw, deg(cur[2])], mirror);
        if (mirror) {
            const mp = mirrorPart(part);
            if (mp) try { P.setPart(mp, { yaw: -yaw }); } catch {}
        }
    }

    function applyScaleFromWheel(deltaY, mirror) {
        const part = posing.selPart;
        const P = window.MF_Pose;
        if (!part || !P?.setScale) return;
        const cur = P.getScale(part) || { x: 1, y: 1, z: 1 };
        
        let u = cur.x * (deltaY < 0 ? 1.05 : 1 / 1.05);
        try { P.setScale(part, { uniform: u }); } catch {}
        autoKeyTransform(part, 'scale', [u, u, u], mirror);
        if (mirror) {
            const mp = mirrorPart(part);
            if (mp) try { P.setScale(mp, { uniform: u }); } catch {}
        }
    }

    function bindViewportPosing() {
        
        const bindPreview = () => {
            const preview = document.getElementById('mf-studio-preview');
            if (!preview || preview.dataset.posingBound) return;
            preview.dataset.posingBound = '1';

        preview.addEventListener('contextmenu', (ev) => {
            if (!posing.enabled) return;
            ev.preventDefault();
        });

        let hoverThrottle = 0;
        preview.addEventListener('mousemove', (ev) => {
            if (!posing.enabled || posing.dragging) return;
            const now = performance.now();
            if (now - hoverThrottle < 50) return; 
            hoverThrottle = now;
            
            const G = window.MF_Gizmo;
            if (G?.visible() && posing.selPart) {
                const ring = G.pickRing?.(ev.clientX, ev.clientY, cam.camera);
                if (ring) {
                    gizmo.hoverRing = ring;
                    gizmo.hoverAxis = null;
                    clearHoverHighlight();
                    preview.style.cursor = 'grab';
                    return;
                }
                gizmo.hoverRing = null;
                const axis = G.pick(ev.clientX, ev.clientY, cam.camera);
                if (axis) {
                    gizmo.hoverAxis = axis;
                    clearHoverHighlight();
                    preview.style.cursor = 'grab';
                    return;
                }
                gizmo.hoverAxis = null;
            }
            const pick = window.MF_Pose?.pickPart?.(ev.clientX, ev.clientY);
            if (pick) {
                setHoverHighlight(pick.object);
                preview.style.cursor = 'pointer';
            } else {
                clearHoverHighlight();
                preview.style.cursor = 'crosshair';
            }
        });
        preview.addEventListener('mouseleave', clearHoverHighlight);

        preview.addEventListener('mousedown', (ev) => {
            if (!posing.enabled || ev.button !== 0) return;
            
            const G = window.MF_Gizmo;
            if (G?.pickRing && posing.selPart) {
                const ring = G.pickRing(ev.clientX, ev.clientY, cam.camera);
                if (ring) {
                    gizmo.draggingRing = ring;
                    posing.dragging = true;
                    posing.dragMode = 'ring';
                    posing.lastX = ev.clientX; posing.lastY = ev.clientY;
                    posing.startX = ev.clientX; posing.startY = ev.clientY;
                    gizmo.ringAccum = 0;
                    gizmo.ringLastX = ev.clientX; gizmo.ringLastY = ev.clientY;
                    posing.rotHandle = window.MF_Pose?.beginRotateWorld?.(posing.selPart, cam.camera) ?? null;
                    clearHoverHighlight();
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    updateStatus('Rotating ' + ring.toUpperCase() + ' axis of ' + posing.selPart + ' (Ctrl=snap 15°, Shift=mirror)');
                    return;
                }
            }
            
            if (G?.visible() && posing.selPart) {
                const axis = G.pick(ev.clientX, ev.clientY, cam.camera);
                if (axis) {
                    gizmo.draggingAxis = axis;
                    posing.dragging = true;
                    posing.dragMode = 'gizmo';
                    posing.lastX = ev.clientX; posing.lastY = ev.clientY;
                    posing.startX = ev.clientX; posing.startY = ev.clientY;
                    gizmo.axisApplied = 0;
                    gizmo.axisScale = ev.ctrlKey ? 0.25 : 1;
                    G.beginDrag?.(axis, cam.camera);
                    clearHoverHighlight();
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    updateStatus('Moving ' + axis.toUpperCase() + ' axis of ' + posing.selPart + ' (Ctrl=fine)');
                    return;
                }
            }
            
            const pick = window.MF_Pose?.pickPart?.(ev.clientX, ev.clientY);
            if (!pick) return; 
            posingSelect(pick);
            posing.dragging = true;
            posing.dragMode = 'rotate';
            posing.lastX = ev.clientX; posing.lastY = ev.clientY;
            posing.startX = ev.clientX; posing.startY = ev.clientY;
            
            posing.rotHandle = window.MF_Pose?.beginRotateWorld?.(posing.selPart, cam.camera) ?? null;
            clearHoverHighlight();
            ev.preventDefault();
            ev.stopImmediatePropagation(); 
        });

        preview.addEventListener('mousedown', (ev) => {
            if (!posing.enabled || ev.button !== 2) return;
            const pick = window.MF_Pose?.pickPart?.(ev.clientX, ev.clientY);
            if (!pick) { posingDeselect(); updateStatus('Pose: nothing selected'); return; }
            posingSelect(pick);
            posing.dragging = true;
            posing.dragMode = 'move';
            posing.lastX = ev.clientX; posing.lastY = ev.clientY;
            ev.preventDefault();
        });
        
        preview.addEventListener('wheel', (ev) => {
            if (!posing.enabled || !posing.selPart) return;
            ev.preventDefault();
            if (ev.altKey) applyScaleFromWheel(ev.deltaY, ev.shiftKey);
            else applyYawFromWheel(ev.deltaY, ev.ctrlKey, ev.shiftKey);
        }, { passive: false });
        }; 

        if (!posingWinBound) {
            posingWinBound = true;
            window.addEventListener('mousemove', (ev) => {
                if (!posing.dragging) return;
                const dx = ev.clientX - posing.lastX;
                const dy = ev.clientY - posing.lastY;
                posing.lastX = ev.clientX; posing.lastY = ev.clientY;
                if (posing.dragMode === 'gizmo') {
                    applyGizmoDrag(ev.clientX - posing.startX, ev.clientY - posing.startY);
                }
                else if (posing.dragMode === 'ring') {
                    
                    const G = window.MF_Gizmo;
                    const step = G?.ringDragDelta?.(
                        gizmo.draggingRing,
                        { x: gizmo.ringLastX, y: gizmo.ringLastY },
                        { x: ev.clientX, y: ev.clientY },
                        cam.camera
                    ) || 0;
                    if (Number.isFinite(step)) gizmo.ringAccum += step;
                    gizmo.ringLastX = ev.clientX; gizmo.ringLastY = ev.clientY;
                    applyRingDrag(gizmo.ringAccum, ev.ctrlKey, ev.shiftKey);
                }
                else if (posing.dragMode === 'move') applyMoveFromDrag(dx, dy, ev.ctrlKey, ev.shiftKey);
                else {
                    
                    const dxTotal = ev.clientX - posing.startX;
                    const dyTotal = ev.clientY - posing.startY;
                    applyRotFromDrag(dxTotal, dyTotal, ev.ctrlKey, ev.shiftKey);
                }
            });
            window.addEventListener('mouseup', (ev) => {
                if (posing.dragging && (ev.button === 0 || ev.button === 2)) {
                    posing.dragging = false;
                    if (posing.dragMode === 'gizmo') {
                        gizmo.draggingAxis = null;
                        gizmo.axisApplied = 0;
                        window.MF_Gizmo?.endDrag?.();
                    }
                    if (posing.dragMode === 'ring') gizmo.draggingRing = null;
                    if (posing.rotHandle != null) {
                        window.MF_Pose?.endRotateWorld?.(posing.rotHandle);
                        posing.rotHandle = null;
                    }
                }
            });
            
            window.addEventListener('keydown', (ev) => {
                if (!posing.enabled) return;
                if (ev.key === 'Escape') { posingDeselect(); ev.preventDefault(); ev.stopImmediatePropagation(); }
            }, true);
        }
        bindPreview(); 
    }

    function makeEmissiveHighlight(obj, color) {
        if (!obj?.material) return null;
        try {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            const prev = mats.map(m => ({
                m,
                hex: m?.emissive?.getHex?.(),
                intensity: (m && 'emissiveIntensity' in m) ? m.emissiveIntensity : null
            }));
            for (const { m } of prev) {
                if (m?.emissive?.set) m.emissive.set(color);
                if (m && 'emissiveIntensity' in m) m.emissiveIntensity = 1;
            }
            return {
                obj,
                restore() {
                    for (const { m, hex, intensity } of prev) {
                        try {
                            if (m?.emissive && hex != null) m.emissive.setHex(hex);
                            if (m && intensity != null && 'emissiveIntensity' in m) m.emissiveIntensity = intensity;
                        } catch {}
                    }
                }
            };
        } catch { return null; }
    }

    let hoverHl = null;
    function setHoverHighlight(obj) {
        if (hoverHl?.obj === obj) return;
        clearHoverHighlight();
        
        if (posing.outline?.obj === obj) return;
        const hl = makeEmissiveHighlight(obj, 0x113355);
        if (hl) hoverHl = hl;
    }
    function clearHoverHighlight() {
        if (!hoverHl) return;
        try { hoverHl.restore(); } catch {}
        hoverHl = null;
    }

    function applyMoveFromDrag(dx, dy, slow, mirror) {
        const part = posing.selPart;
        const P = window.MF_Pose;
        if (!part || !P?.addScreenOffset) return;
        const camera = cam.camera;
        if (!camera?.matrixWorld) return;
        try { camera.updateMatrixWorld?.(); } catch {}

        const mesh = getPoseMesh();
        let worldPerPx = 0.01;
        try {
            const cp = camera.position;
            const jp = getSelectedJointWorldPos(part) || mesh?.position;
            if (cp && jp) {
                const ddx = cp.x - jp.x, ddy = cp.y - jp.y, ddz = cp.z - jp.z;
                const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
                worldPerPx = (2 * dist * Math.tan(35 * Math.PI / 180)) / Math.max(1, innerHeight);
            }
        } catch {}
        const step = worldPerPx * (slow ? 0.2 : 1);

        const V3 = camera.position.constructor;
        const e = camera.matrixWorld.elements;
        const right = new V3(e[0], e[1], e[2]).normalize();
        const up = new V3(e[4], e[5], e[6]).normalize();

        let next = { x: 0, y: 0, z: 0 };
        try { next = P.addScreenOffset(part, right, up, dx * step, -dy * step); } catch {}
        autoKeyTransform(part, 'position', [next.x, next.y, next.z], mirror);
        if (mirror) {
            const mp = mirrorPart(part);
            if (mp) try { P.addScreenOffset(mp, right, up, -dx * step, -dy * step); } catch {}
        }
    }

    function getSelectedJointWorldPos(part) {
        try {
            const P = window.MF_Pose;
            if (!P) return null;
            
            const g = getGame();
            const me = g?.player;
            const e = g?.world?.getPlayerById?.(me.id) || g?.world?.players?.get?.(me.id) || g?.world?.entities?.get?.(me.id) || me;
            const mesh = e?.mesh;
            if (!mesh) return null;
            const names = {
                head: 'headPivot', torso: 'body',
                leftArm: 'leftShoulderJoint', rightArm: 'rightShoulderJoint',
                leftLeg: 'leftHipJoint', rightLeg: 'rightHipJoint'
            }[part];
            if (!names) return null;
            const queue = [mesh];
            const seen = new WeakSet();
            let visited = 0;
            while (queue.length && visited < 500) {
                const obj = queue.shift();
                if (!obj || typeof obj !== 'object' || seen.has(obj)) continue;
                seen.add(obj); visited++;
                if (obj[names] && obj[names].position) {
                    obj[names].updateMatrixWorld?.(true);
                    const V3 = obj[names].position.constructor;
                    return obj[names].getWorldPosition(new V3());
                }
                if (Array.isArray(obj.children)) for (const c of obj.children) queue.push(c);
            }
        } catch {}
        return null;
    }

    function getPoseMesh() {
        
        try {
            const g = getGame();
            const me = g?.player;
            const e = g?.world?.getPlayerById?.(me.id) || g?.world?.players?.get?.(me.id) || g?.world?.entities?.get?.(me.id);
            return e?.mesh || null;
        } catch { return null; }
    }

    const lock = { patched: false, orig: null, forceNext: false };

    function releasePointerLock() {
        try { document.exitPointerLock?.(); } catch {}
    }

    function patchPointerLock() {
        if (lock.patched) return;
        lock.patched = true;
        lock.orig = Element.prototype.requestPointerLock;
        const orig = lock.orig;
        Element.prototype.requestPointerLock = function (...args) {
            if (state.open) {
                
                if (lock.forceNext) {
                    lock.forceNext = false;
                    return orig.apply(this, args);
                }
                return undefined;
            }
            return orig.apply(this, args);
        };
    }

    function unpatchPointerLock() {
        if (!lock.patched) return;
        try { Element.prototype.requestPointerLock = lock.orig; } catch {}
        lock.patched = false;
    }

    let lockEventsBound = false;
    function swallowLockEvent(ev) {
        if (!state.open) return;
        
        if (playerCtrl.active && ev.type === 'pointerlockchange' && document.pointerLockElement) return;
        ev.stopImmediatePropagation();
    }
    function blockLockEvents() {
        if (lockEventsBound) return;
        lockEventsBound = true;
        window.addEventListener('pointerlockchange', swallowLockEvent, true);
        window.addEventListener('pointerlockerror', swallowLockEvent, true);
    }

    function open() {
        if (state.open) return;
        build();
        state.open = true;
        lastCamFrame = 0;
        
        blockLockEvents();
        releasePointerLock();
        patchPointerLock();
        playerControlBindKeys();
        globalThis.__MF_STUDIO_OPEN__ = true; 
        refreshTakes(); refreshMediaPool(); refreshModels(); refreshFaces(); refreshPosePanel(); renderTimeline(); updateProps(); updateStatus(); updateButtons();
        applyCinema();
        bindPreviewCamera();
        bindViewportPosing();
        cameraEnable();
        
        if (!viewportEnable()) {
            let tries = 0;
            const retry = () => {
                if (state.open && !viewport.canvases.length && ++tries < 120) {
                    if (!viewportEnable()) requestAnimationFrame(retry);
                }
            };
            requestAnimationFrame(retry);
        }
        afkToggle(true); 
        void 0;
    }

    function close() {
        if (!state.open) return;
        state.open = false;
        lastCamFrame = 0;
        cancelAnimationFrame(state.raf);
        if (playerCtrl.active) playerControlToggle(); 
        viewportDisable(); 
        cameraDisable();
        posingToggle(false);
        afkToggle(false);
        unpatchPointerLock(); 
        globalThis.__MF_STUDIO_OPEN__ = false;
        state.cinema = false; applyCinema(); 
        const root = document.getElementById(ID);
        const style = document.getElementById(ID + '-style');
        root?.remove(); style?.remove();
        void 0;
    }

    window.MF_Studio = {
        open, close,
        get isOpen() { return state.open; },
        get cinema() { return state.cinema; },
        set cinema(v) {
            state.cinema = !!v;
            document.getElementById(ID)?.classList.toggle('cinema', state.cinema);
            applyCinema();
        },
        
        get share() { return p2p.share; },
        set share(v) { shareToggle(!!v); },
        applyRemotePose, applyRemoteCam, remoteCamActive,
        
        getStudioCamPose,
        renderVideo
    };
    window.__MF_Studio = true;

    window.addEventListener('keydown', (ev) => {
        if (ev.key === 'F1') { ev.preventDefault(); state.open ? close() : open(); }
    });

    void 0;
})();
