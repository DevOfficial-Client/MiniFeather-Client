// MF_Studio.js — GUI tipo DaVinci Resolve para el film mode de MiniFeather.
//
// Reemplaza la UI del juego (HUD/inventario ocultos) con una interfaz de
// edición de video profesional mientras el estudio está abierto:
//
//   ┌──────────────────────────────────────────────┐
//   │ Barra superior: logo | proyecto | ▶ ⏸ ⏹ REC  │
//   ├──────┬─────────────────────────────┬─────────┤
//   │ Media│                             │ Props  │
//   │ (l.) │     Preview (el juego)      │ (der.) │
//   │      │                             │        │
//   ├──────┴─────────────────────────────┴─────────┤
//   │ Timeline: regla de ticks + pistas            │
//   │ [V1 actors] [V2 faces] [A1 audio]            │
//   └──────────────────────────────────────────────┘
//
// - El juego sigue corriendo DETRÁS (es un overlay semi-transparente en los
//   paneles laterales; la zona preview es un agujero transparente → se ve el
//   mundo). Con "modo cine" el HUD del juego se oculta (adiós inventario).
// - La cabecera reproduce/grav​a vía MF_Film; el timeline dibuja los
//   keyframes de la toma activa y permite scrub con click/drag.
// - Paleta DaVinci: gris muy oscuro #1b1b1f, acento naranja #ff6b2b,
//   texto claro #e8e8ec. Fuente pixel para números (Faithful).
//
// Atajos: F1 abre/cierra · Space play/pause · Home ir a 0 · R grabar
//
// Se activa con el comando /studio (o F1). Todo es client-side.

(function () {
    'use strict';

    if (window.__MF_Studio) return;
    const TAG = '[MF Studio]';

    const TPS = 20;
    const ID = 'mf-studio';
    const CSS = `
#mf-studio * { box-sizing: border-box; margin: 0; padding: 0; }
#mf-studio {
    position: fixed; inset: 0; z-index: 2147483000;
    display: flex; flex-direction: column;
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: transparent; color: #e8e8ec;
    pointer-events: none;
}
#mf-studio .panel {
    background: rgba(27, 27, 31, 0.92);
    border: 1px solid #32323a; pointer-events: auto;
    backdrop-filter: blur(6px);
}
/* ── top bar ── */
#mf-studio-top {
    height: 42px; display: flex; align-items: center; gap: 10px;
    padding: 0 12px; background: rgba(20, 20, 24, 0.95);
    border-bottom: 1px solid #32323a; pointer-events: auto;
}
#mf-studio-top .logo { font-weight: 700; letter-spacing: 2px; color: #ff6b2b; font-size: 12px; }
#mf-studio-top .project {
    font-size: 11px; color: #9a9aa6; border: 1px solid #3a3a44;
    padding: 3px 9px; border-radius: 3px; min-width: 140px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px;
}
#mf-studio-top .spacer { flex: 1; }
/* grupos de botones separados por línea vertical (estilo Resolve) */
#mf-studio-top .btn-group {
    display: flex; align-items: center; gap: 4px; padding: 0 4px;
    border-left: 1px solid #2a2a32;
}
#mf-studio-top .btn-group:first-of-type { border-left: none; }
.mfs-btn {
    background: transparent; border: 1px solid transparent; color: #c8c8d2;
    height: 28px; padding: 0 9px; border-radius: 4px; font-size: 12px;
    cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
    white-space: nowrap; transition: background .12s, color .12s, border-color .12s;
}
.mfs-btn:hover { background: #2e2e38; color: #fff; }
.mfs-btn:disabled { opacity: .35; cursor: default; }
/* variante solo-icono (compacta) */
.mfs-btn.icon { padding: 0; width: 30px; justify-content: center; font-size: 13px; }
/* toggle activo (Posing/Compartir/cine) */
.mfs-btn.on { background: #3ecf8e; color: #0b2e20; font-weight: 700; }
.mfs-btn.on:hover { background: #55d9a0; color: #0b2e20; }
.mfs-btn.on.warm { background: #ff6b2b; color: #14141a; }
.mfs-btn.on.warm:hover { background: #ff7f47; }
.mfs-btn.primary { background: #ff6b2b; border-color: #ff6b2b; color: #14141a; font-weight: 700; }
.mfs-btn.primary:hover { background: #ff7f47; }
.mfs-btn.rec.active { background: #e33; border-color: #e33; color: #fff; animation: mfs-blink 1s infinite; }
@keyframes mfs-blink { 50% { opacity: .65; } }
@keyframes mfs-fadeout { 0%,70% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }
/* ── cuerpo ── */
#mf-studio-body { flex: 1; display: flex; min-height: 0; position: relative; }
#mf-studio-left {
    width: 208px; overflow-y: auto; padding: 10px;
    background: rgba(27, 27, 31, 0.92); border-right: 1px solid #32323a;
    pointer-events: auto;
}
#mf-studio-preview {
    flex: 1; position: relative;
    pointer-events: auto; /* CRÍTICO: sin esto los clicks atraviesan al
                             canvas del juego y re-atrapan el ratón */
}
#mf-studio-right {
    width: 240px; padding: 10px; overflow-y: auto;
    background: rgba(27, 27, 31, 0.92); border-left: 1px solid #32323a;
    pointer-events: auto;
}
/* scrollbars finos y oscuros */
#mf-studio ::-webkit-scrollbar { width: 8px; height: 8px; }
#mf-studio ::-webkit-scrollbar-track { background: transparent; }
#mf-studio ::-webkit-scrollbar-thumb { background: #33333e; border-radius: 4px; }
#mf-studio ::-webkit-scrollbar-thumb:hover { background: #44444f; }
/* ── timeline ── */
#mf-studio-timeline {
    height: 190px; background: rgba(20, 20, 24, 0.95);
    border-top: 1px solid #32323a; pointer-events: auto;
    display: flex; flex-direction: column;
}
#mf-studio-ruler {
    height: 26px; position: relative; cursor: pointer;
    border-bottom: 1px solid #2a2a32; background: #16161a;
}
#mf-studio-ruler canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#mf-studio-tracks { flex: 1; overflow-y: auto; padding: 6px 8px; }
.mfs-track {
    height: 34px; display: flex; align-items: center; gap: 8px;
    border-bottom: 1px solid #232329; position: relative;
}
.mfs-track .label {
    width: 90px; font-size: 11px; color: #9a9aa6; flex-shrink: 0;
    text-transform: uppercase; letter-spacing: 1px;
}
.mfs-track .lane { flex: 1; height: 22px; background: #141419; border-radius: 2px; position: relative; overflow: hidden; }
.mfs-kf {
    position: absolute; top: 2px; width: 3px; height: 18px;
    background: #ff6b2b; border-radius: 1px;
}
.mfs-kf.face { background: #4fc3f7; }
.mfs-kf.audio { background: #81c784; }
/* cabezal de reproducción */
#mf-studio-playhead {
    position: absolute; top: 0; bottom: 0; width: 1px;
    background: #fff; pointer-events: none; z-index: 5;
}
#mf-studio-playhead::before {
    content: ''; position: absolute; top: 0; left: -5px;
    border: 5px solid transparent; border-top-color: #ff6b2b;
}
/* ── panels internos ── */
.mfs-section { margin-bottom: 16px; }
.mfs-section h3 {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px;
    color: #6e6e7a; margin-bottom: 8px; font-weight: 600;
    display: flex; align-items: center; justify-content: space-between;
}
/* botón pequeño al lado del título de sección */
.mfs-section h3 .mini {
    background: transparent; border: 1px solid #3a3a44; color: #9a9aa6;
    font-size: 10px; border-radius: 3px; padding: 2px 7px; cursor: pointer;
    line-height: 1.3;
}
.mfs-section h3 .mini:hover { background: #2e2e38; color: #fff; }
.mfs-item {
    padding: 6px 9px; border-radius: 4px; font-size: 12px;
    cursor: pointer; color: #c8c8d2; display: flex; justify-content: space-between;
    border: 1px solid transparent;
}
.mfs-item:hover { background: #26262e; }
.mfs-item.active { background: #ff6b2b; color: #14141a; font-weight: 600; }
.mfs-item .meta { color: #6e6e7a; font-size: 10px; }
.mfs-item.active .meta { color: #3a2010; }
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
/* miniaturas de presets de cabeza en el pool */
.media-head {
    height: 34px; border: 1px solid #32323a; border-radius: 3px; overflow: hidden;
    cursor: grab; background: #0c0c10; display: flex; align-items: center; justify-content: center;
}
.media-head:hover { border-color: #ff6b2b; }
.media-head img { max-height: 100%; max-width: 100%; image-rendering: pixelated; }
.mfs-prop { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 12px; }
.mfs-prop label { color: #9a9aa6; }
.mfs-prop .val { color: #e8e8ec; font-family: 'Consolas', monospace; font-size: 11px; }
.mfs-status {
    padding: 8px 10px; background: #141419; border-radius: 3px;
    font-size: 11px; color: #9a9aa6; line-height: 1.6; margin-top: 10px;
    font-family: 'Consolas', monospace;
}
/* ── Modelos 3D (cargador) ── */
.model-item {
    display: flex; align-items: center; gap: 6px; padding: 5px 7px;
    border-radius: 4px; font-size: 11px; cursor: pointer; color: #c8c8d2;
    border: 1px solid transparent;
}
.model-item:hover { background: #26262e; }
.model-item.live { border-color: #3ecf8e55; background: #1d2b24; }
.model-item .m-icon { font-size: 13px; flex-shrink: 0; }
.model-item .m-name {
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: #e8e8ec;
}
.model-item .m-act {
    font-size: 11px; opacity: 0; padding: 1px 4px; border-radius: 3px;
    flex-shrink: 0; color: #9a9aa6;
}
.model-item:hover .m-act { opacity: .85; }
.model-item .m-act:hover { color: #fff; background: #3a3a44; }
.model-item .m-tag { font-size: 9px; color: #3ecf8e; flex-shrink: 0; }
.model-drop {
    border: 1px dashed #3a3a44; border-radius: 4px; padding: 10px 8px;
    text-align: center; font-size: 10.5px; color: #6e6e7a; cursor: pointer;
    line-height: 1.5; margin-bottom: 6px; transition: border-color .15s, color .15s;
}
.model-drop:hover, .model-drop.over { border-color: #ff6b2b; color: #ff6b2b; }
/* modo cine: el HUD del juego se oculta desde JS (applyCinema), no por CSS
   de hermano — el canvas WebGL debe seguir visible bajo el preview */
`;

    const state = {
        open: false,
        cinema: true,          // ocultar HUD del juego
        films: [],             // lista de tomas [{name, ticks, kfs}]
        activeFilm: null,      // nombre
        activeTake: null,      // objeto film activo (memoria o storage)
        playheadTick: 0,
        raf: null,
        hiddenHudEls: []
    };

    // ── Studio Sync P2P: compartir pose/animación con el peer (cámara local) ──
    const p2p = {
        share: false,          // toggle del usuario (emite mis cambios)
        camRemote: null,       // { x,y,z, yaw, pitch } target remoto
        camLerp: 0.25,         // suavizado
        camActive: false,      // compatibilidad con peers antiguos
        followRemoteCamera: false, // compartir animación nunca secuestra la cámara
        lastCamOut: 0,         // reservado para compatibilidad
        lastPoseOut: 0,        // throttle emisión pose (20 Hz)
        applying: false        // guard anti-eco: aplicando datos remotos
    };
    function sendStudio(obj) {
        try { return window.MF_Peer?.sendStudio?.(obj) === true; } catch { return false; }
    }

    // ── helpers ──
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

    // ── datos ──
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

    // ── cargador de modelos 3D (.glb/.gltf/.obj) ──
    // Los bytes del archivo se registran en el cache de CustomModels
    // (registerModelBytes) y de ahí se spawnean como entidad client-side
    // delante del jugador. Los nombres se prefijan "user_" para no chocar
    // con los modelos del paquete (models/entities/).
    const models = {
        loaded: new Map(),       // file -> { name, size, at, id }
        picker: null,            // <input type=file> reutilizable
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
                inp.value = ''; // permitir recargar el mismo archivo
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
                // spawn inmediato frente al jugador
                modelSpawn(file);
            } catch (e) {
                updateStatus(`⚠ "${f.name}": ${e?.message || e}`);
            }
        }
    }

    // spawn delante del jugador (2 bloques, dirección de la cámara del estudio)
    function modelSpawn(file) {
        const CM = window.MF_CustomModels;
        const info = models.loaded.get(file);
        if (!CM?.spawn) return;
        const p = getGame()?.player?.pos;
        if (!p) { updateStatus('⚠ sin player para spawnear'); return; }
        // dirección: yaw de la cámara del estudio si está activa
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
            box.appendChild(el('div', 'mfs-item', '<span style="color:#6e6e7a;font-size:11px">Sin modelos cargados</span>'));
            return;
        }
        for (const [file, info] of models.loaded) {
            const row = el('div', 'model-item' + (info.id ? ' live' : ''));
            row.title = file + ' — click: spawn frente a ti';
            row.innerHTML = `
                <span class="m-icon">${/\.obj$/i.test(file) ? '🔷' : '📦'}</span>
                <span class="m-name">${info.name}</span>
                ${info.id ? '<span class="m-tag">live</span>' : ''}
                <span class="m-act m-del" title="Quitar del mundo">✕</span>
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

    // ── Skins PNG (SkinChanger) ──
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
                    updateStatus('👕 Skin aplicada: ' + it.name);
                    refreshSkinsList();
                }).catch(e => updateStatus('⚠ ' + (e?.message || e)));
            };
            grid.appendChild(d);
        }
        box.appendChild(grid);
    }

    // ── Morph (mobs del mundo → transformarse) ──
    function refreshMorphList() {
        const box = document.getElementById('mfs-morph-list');
        if (!box) return;
        const M = window.MF_Morph;
        const items = M?.catalog || [];
        box.innerHTML = '';
        if (!items.length) {
            box.appendChild(el('div', 'mfs-item', '<span style="color:#6e6e7a;font-size:11px">Sin mobs cerca — pulsa ⟳ con mobs a la vista</span>'));
            return;
        }
        const grid = el('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;';
        for (const it of items) {
            const d = el('div', 'media-head' + (M.current === it.type ? ' on' : ''));
            d.title = it.label + ' — click = morph en vivo · arrastra al timeline V2 como clip de morph';
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
        const rev = el('div', 'mfs-item', '<span style="font-size:11px">↺ Volver a humano</span>');
        rev.style.cursor = 'pointer';
        rev.onclick = () => {
            M?.revert?.();
            updateStatus('🧬 Forma humana restaurada');
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

    // ── anti-AFK del estudio ──
    // Grabar/posar/editar puede dejar al jugador quieto mucho tiempo y el
    // servidor lo kickea. Este guardián hace micro-movimientos NATIVOS
    // (jitter de yaw ±0.3°, sin desplazamiento) por el mismo camino que el
    // input real (apply/send del player, patrón AntiAFK), SOLO mientras el
    // estudio esté abierto. La cámara del estudio es aparte: el actor no se
    // mueve ni gira en pantalla — solo se reporta rotación al servidor.
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

    // busca el método apply(input) del player por firma en el código fuente
    // (nombres ofuscados: se identifican por contenido, igual que AntiAFK)
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

    // construye el input del beat: todo neutral + jitter de yaw mínimo
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

    // un "beat": aplica input neutral+jitter y lo envía al servidor
    function afkBeat() {
        if (!afk.on) return;
        const player = getGame()?.player;
        if (!player) return;
        // hook perdido (respawn/cambio de mundo) → re-scan
        if (afk.player !== player || (afk.applyName && player[afk.applyName] !== undefined && !player[afk.applyName])) {
            afkHookPlayer(player);
        }
        if (!afk.applyName || !afk.originalApply) return;
        try {
            afk.originalApply.call(player, afkBeatInput(player));
            afk.lastBeat = Date.now();
            if (afk.sendName) player[afk.sendName]?.call(player);
        } catch {
            // algo cambió: re-scan en el próximo beat
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
        return true; // no hookeamos: llamamos apply directamente en cada beat
    }

    function afkRestoreHook() {
        // no hay hook que restaurar (usamos llamadas directas), solo limpiar
        afk.player = null;
        afk.applyName = null;
        afk.sendName = null;
        afk.originalApply = null;
    }

    function afkToggle(on) {
        if (on === undefined) on = !afk.on;
        afk.on = !!on;
        const btn = document.getElementById('mfs-afk');
        if (btn) {
            btn.classList.toggle('on', afk.on);
            btn.title = afk.on ? 'Anti-AFK activo: micro-rotaciones nativas cada ~30s' : 'Activar anti-kick mientras el estudio está abierto';
        }
        if (afk.on) {
            afkHookPlayer(getGame()?.player);
            afkBeat();
            afk.timer = setInterval(afkBeat, 30000);       // beat cada 30s
            afk.rescanTimer = setInterval(() => {          // re-hook si cambió el player
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

    // ── DOM ──
    function build() {
        if (document.getElementById(ID)) return;

        const style = el('style');
        style.id = ID + '-style';
        style.textContent = CSS;
        document.head.appendChild(style);

        const root = el('div');
        root.id = ID;
        if (state.cinema) root.classList.add('cinema');

        // top bar — grupos: transporte | rango | herramientas | salir
        const top = el('div', '', '');
        top.id = 'mf-studio-top';
        top.innerHTML = `
            <span class="logo">MF STUDIO</span>
            <span class="project" id="mfs-project">Proyecto: sin toma activa</span>
            <span class="spacer"></span>
            <span class="btn-group">
                <button class="mfs-btn icon" id="mfs-home" title="Ir al inicio (Home)">⏮</button>
                <button class="mfs-btn primary" id="mfs-play" title="Reproducir/Pausa (Space)">▶</button>
                <button class="mfs-btn icon" id="mfs-stop" title="Detener (S)">⏹</button>
                <button class="mfs-btn rec" id="mfs-rec" title="Grabar (R)">●</button>
            </span>
            <span class="btn-group">
                <button class="mfs-btn" id="mfs-in" title="Marcar IN aquí (I)">{ IN</button>
                <button class="mfs-btn" id="mfs-out" title="Marcar OUT aquí (O)">OUT }</button>
                <button class="mfs-btn icon" id="mfs-range-clear" title="Quitar In/Out (reproduce todo)" style="display:none">⨯</button>
            </span>
            <span class="btn-group">
                <button class="mfs-btn" id="mfs-pose-vp" title="Posar extremidades: click der. en el cuerpo + arrastrar (rueda=yaw, Alt+rueda=tamaño)">🦴 Posing</button>
                <button class="mfs-btn" id="mfs-share" title="Compartir pose/animación por P2P sin controlar la cámara del otro jugador">📡</button>
                <button class="mfs-btn icon" id="mfs-skineditor" title="Editor de cabeza en vivo (dibujar base + overlay)">🎨</button>
                <button class="mfs-btn icon" id="mfs-skinchanger" title="Skins PNG en vivo (biblioteca + drag al timeline)">👕</button>
                <button class="mfs-btn icon" id="mfs-morph" title="Morph: transformarse en mobs del mundo (client-side)">🧬</button>
                <button class="mfs-btn icon" id="mfs-models" title="Cargar modelo 3D (.glb/.gltf/.obj)">📦</button>
            </span>
            <span class="btn-group">
                <button class="mfs-btn icon" id="mfs-cinema" title="Ocultar/mostrar HUD del juego">🎬</button>
                <button class="mfs-btn icon" id="mfs-afk" title="Anti-AFK: evita el kick por inactividad mientras editas (micro-rotaciones invisibles)">🛡</button>
                <button class="mfs-btn icon" id="mfs-close" title="Cerrar (F1)">✕</button>
            </span>
        `;

        // cuerpo
        const body = el('div');
        body.id = 'mf-studio-body';

        const left = el('div');
        left.id = 'mf-studio-left';
        left.innerHTML = `<div class="mfs-section"><h3>Media Pool</h3><div id="mfs-mediapool"></div></div>
<div class="mfs-section"><h3>Modelos 3D <button class="mini" id="mfs-model-add" title="Cargar .glb/.gltf/.obj del disco">+ Cargar</button></h3>
<div class="model-drop" id="mfs-model-drop" title="Clic para elegir archivo">📦 Suelta un modelo aquí<br>.glb · .gltf · .obj</div>
<div id="mfs-models-list"></div></div>
<div class="mfs-section"><h3>Tomas</h3><div id="mfs-takes"></div></div>
<div class="mfs-section"><h3>Skins PNG <button class="mini" id="mfs-skins-add" title="Importar .png de skin (64x64/64x32)">+ Importar</button></h3>
<div class="model-drop" id="mfs-skins-drop" title="Clic para elegir PNGs">👕 Suelta skins .png aquí<br>64x64 · 64x32</div>
<div id="mfs-skins-list"></div></div>
<div class="mfs-section"><h3>Morph (mobs) <button class="mini" id="mfs-morph-rescan" title="Volver a escanear mobs del mundo">⟳</button></h3><div id="mfs-morph-list"></div></div>
<div class="mfs-section"><h3>Caras (face swap)</h3><div id="mfs-faces"></div></div>`;

        const preview = el('div');
        preview.id = 'mf-studio-preview';
        // indicador sobre el preview
        const status = el('div', 'mfs-status');
        status.id = 'mfs-status';
        status.style.cssText = 'position:absolute;top:10px;left:10px;pointer-events:auto;';
        preview.appendChild(status);
        // toggle gizmo: botón único que alterna mover ⇄ rotar
        const gtoggle = el('button');
        gtoggle.id = 'mfs-gizmo-mode';
        gtoggle.className = 'mfs-btn';
        gtoggle.textContent = '↔ Mover';
        gtoggle.title = 'Alternar gizmo: mover por ejes / rotar por ejes (tecla G)';
        gtoggle.style.cssText = `
            position:absolute;top:10px;right:10px;pointer-events:auto;`;
        preview.appendChild(gtoggle);
        // hint de controles de cámara (abajo centro, se desvanece)
        const hint = el('div');
        hint.innerHTML = '🖱 Click+arrastrar: rotar cámara · WASD/QE: mover · Ctrl: rápido · 🦴 Posing: click der. en extremidad (rueda=yaw, Alt+rueda=tamaño)';
        hint.style.cssText = `
            position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
            background:rgba(20,20,24,.85);border:1px solid #32323a;border-radius:4px;
            padding:6px 14px;font-size:11px;color:#9a9aa6;pointer-events:none;
            animation:mfs-fadeout 6s forwards;white-space:nowrap;`;
        preview.appendChild(hint);

        const right = el('div');
        right.id = 'mf-studio-right';
        right.innerHTML = `<div class="mfs-section"><h3>Propiedades</h3><div id="mfs-props"></div></div>
<div class="mfs-section"><h3>Editor de pose</h3><div id="mfs-pose"></div></div>`;

        body.appendChild(left); body.appendChild(preview); body.appendChild(right);

        // timeline (montado por MF_Timeline dentro de este contenedor)
        const tl = el('div');
        tl.id = 'mf-studio-timeline';

        root.appendChild(top); root.appendChild(body); root.appendChild(tl);
        document.body.appendChild(root);

        bind();
        window.MF_Timeline?.mount(tl, { onChange: onTimelineChange });
    }

    // ── eventos ──
    function bind() {
        const $ = (id) => document.getElementById(id);

        $('mfs-close').onclick = close;
        $('mfs-skineditor').onclick = () => { window.MF_SkinEditor?.open(); };
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
        $('mfs-pose-vp').onclick = () => posingToggle(!posing.enabled);
        $('mfs-share').onclick = shareToggle;
        $('mfs-models').onclick = modelPickFiles;
        $('mfs-model-add').onclick = modelPickFiles;
        // zona drop de modelos + drag&drop de archivos
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
        $('mfs-afk').onclick = () => afkToggle();
        // ── skins PNG (SkinChanger): botón topbar + sección izquierda ──
        $('mfs-skinchanger').onclick = () => window.MF_SkinChanger?.open();
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
        // ── morph (MF_Morph): botón topbar + sección izquierda ──
        $('mfs-morph').onclick = () => window.MF_Morph?.open();
        $('mfs-morph-rescan').onclick = () => {
            window.MF_Morph?.scan?.(true);
            refreshMorphList();
        };
        window.addEventListener('mf:morph-catalog', () => refreshMorphList(), { once: false });
        refreshMorphList();
        // toggle gizmo mover/rotar (botón único)
        const gm = document.getElementById('mfs-gizmo-mode');
        if (gm) {
            gm.onclick = () => gizmoSetMode(gizmo.mode === 'move' ? 'rotate' : 'move');
            gizmoSetMode(gizmo.mode); // estado inicial
        }
        $('mfs-cinema').onclick = () => {
            state.cinema = !state.cinema;
            document.getElementById(ID)?.classList.toggle('cinema', state.cinema);
            applyCinema();
            $('mfs-cinema').classList.toggle('on', state.cinema);
        };

        // atajos de teclado (registrados UNA sola vez: guard contra acumulación
        // de listeners en reaperturas del estudio, que congelaba la página)
        if (!state.keysBound) {
            state.keysBound = true;
            window.addEventListener('keydown', (ev) => {
                if (!state.open) return;
                if (ev.key === 'F1') { ev.preventDefault(); close(); }
                else if (ev.code === 'Space' && !isTypingTarget(ev.target)) { ev.preventDefault(); togglePlay(); }
                else if (ev.key === 'Home') { ev.preventDefault(); seek(0); }
                else if ((ev.key === 'i' || ev.key === 'I') && !isTypingTarget(ev.target)) markIn();
                else if ((ev.key === 'o' || ev.key === 'O') && !isTypingTarget(ev.target)) markOut();
                else if ((ev.key === 'r' || ev.key === 'R') && !isTypingTarget(ev.target)) { ev.preventDefault(); toggleRec(); }
                else if ((ev.key === 'g' || ev.key === 'G') && !isTypingTarget(ev.target)) {
                    ev.preventDefault();
                    gizmoSetMode(gizmo.mode === 'move' ? 'rotate' : 'move');
                }
            });
            // presets de cabeza creados/borrados en el SkinEditor → pool
            window.addEventListener('mf:skineditor-presets', () => {
                if (state.open) refreshMediaPool();
            });
        }

        // bucle de UI (incluye watchdog del pointer lock: si el juego
        // re-atrapa el ratón por otra vía, se libera de inmediato)
        state.raf = requestAnimationFrame(uiLoop);
    }

    // Callback de eventos del timeline NLE
    function onTimelineChange(kind, payload) {
        switch (kind) {
            case 'scrub':
                // sincronizar el playhead viejo del estudio con el nuevo
                state.playheadTick = payload;
                seek(payload);
                break;
            case 'clip-open':
                // doble click en un clip: cargar esa toma como activa
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
                updateStatus(`No se pudo soltar "${payload}" (toma no encontrada)`);
                break;
        }
    }

    function isTypingTarget(t) {
        return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    }

    // ── acciones ──
    function togglePlay() {
        const F = window.MF_Film;
        if (!F) return;
        const s = F.status;
        if (s.recording) return;
        if (!s.playing) {
            // ¿hay secuencia en el timeline? → reproducir la SECUENCIA
            const TL = window.MF_Timeline;
            const clips = TL?.clips || [];
            if (clips.length) {
                const r = F.playSequence(clips.map(c => ({
                    filmName: c.film.name, start: c.start, duration: c.duration
                })));
                if (!r.ok) { updateStatus('⚠ ' + r.error); return; }
            } else {
                const r = F.playFilm(state.activeFilm || undefined);
                if (!r?.ok) { updateStatus('⚠ ' + (r?.error || 'nada que reproducir')); return; }
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
                // auto-guardar con nombre corto para que aparezca en Media
                F.saveFilm('toma-' + new Date().toTimeString().slice(0, 8).replace(/:/g, ''));
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
        // Si está reproduciendo, reiniciar desde ese punto (F2 traerá seek real)
        const F = window.MF_Film;
        const s = F?.status;
        if (s?.playing && !s.paused) { F.stopPlayback(); F.playFilm(state.activeFilm || undefined); }
        updatePlayhead();
    }

    // ── Rango de reproducción In/Out (estilo DaVinci Resolve) ──
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
        // el OUT nunca puede quedar antes del IN
        if (state.playheadTick <= from) from = Math.max(0, state.playheadTick - 1);
        F.setPlayRange(from, Math.max(1, state.playheadTick));
        updateRangeUI();
        updateStatus(`OUT = tick ${state.playheadTick} (${(state.playheadTick / TPS).toFixed(2)}s)`);
    }
    function clearRange() {
        const F = window.MF_Film;
        F?.setPlayRange(null, null);
        updateRangeUI();
        updateStatus('Rango In/Out quitado — reproduce toda la toma');
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

    // ── render de paneles ──
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
            // click: añadir como clip al final de la secuencia (como "Media Pool" de Resolve)
            item.onclick = () => {
                const TL = window.MF_Timeline;
                const film = loadFilm(f.name);
                if (!TL || !film) return;
                TL.addClip(film, TL.seqDuration);   // append al final
                // y también dejarla como toma activa para el inspector
                state.activeFilm = f.name;
                state.activeTake = film;
                document.getElementById('mfs-project').textContent = 'Proyecto: ' + f.name;
                refreshTakes(); updateProps(); updateStatus(`Clip añadido: ${f.name}`);
            };
            // doble click: solo cargar como toma activa (sin añadir clip)
            item.ondblclick = (ev) => { ev.stopPropagation(); };
            box.appendChild(item);
        }
    }

    // ── Media Pool: biblioteca de tomas con drag→timeline, importar, bin ──
    // Estado persistente: lista de nombres de tomas en el pool + papelera
    // (nombres en el bin no se muestran, pero siguen en localStorage).
    const pool = { bin: [] };

    function refreshMediaPool() {
        const box = document.getElementById('mfs-mediapool');
        if (!box) return;
        box.innerHTML = '';
        const F = window.MF_Film;
        const films = listFilms().filter(f => !pool.bin.includes(f.name));
        // barra de acciones: importar + bin
        const bar = el('div');
        bar.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;';
        const impBtn = el('button', 'mfs-btn', '📥 Importar');
        impBtn.style.cssText = 'height:22px;font-size:10px;padding:0 8px;';
        impBtn.title = 'Importar archivos .mffilm.json';
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
        // ── sección presets de cabeza (SkinEditor) ──
        const SE = window.MF_SkinEditor;
        const headPresets = SE?.presets?.() || [];
        if (headPresets.length) {
            const heads = el('div');
            heads.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:6px;';
            for (const hp of headPresets) {
                const d = el('div', 'media-head');
                d.title = hp.name + ' — arrastra a V2 (Caras) o click = aplicar ya';
                d.draggable = true;
                d.innerHTML = `<img src="${hp.thumb}" alt="">`;
                d.ondragstart = (ev) => {
                    ev.dataTransfer.setData('text/mf-head', hp.name);
                    ev.dataTransfer.effectAllowed = 'copy';
                };
                d.onclick = () => { SE.applyPreset(hp.name); updateStatus('Cabeza: ' + hp.name); };
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
            item.title = 'Arrastra al timeline · click = añadir al final · 🗑 = al bin';
            // drag al timeline (el timeline acepta drops en su contenedor)
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
                document.getElementById('mfs-project').textContent = 'Proyecto: ' + f.name;
                updateStatus(`Clip añadido: ${f.name}`);
            };
            const del = el('span', 'mi-del', '🗑');
            del.title = 'Mover al bin (no borra el archivo)';
            del.onclick = (ev) => {
                ev.stopPropagation();
                pool.bin.push(f.name);
                refreshMediaPool();
            };
            item.appendChild(del);
            box.appendChild(item);
            if (!F) break; // solo mostrar el aviso si no hay Film
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
                        // sacarlo del bin si estaba
                        pool.bin = pool.bin.filter(n => n !== name);
                        updateStatus(`Importado: ${name}`);
                    } else fail++;
                } catch { fail++; }
                if (ok + fail === files.length) refreshMediaPool();
            };
            reader.readAsText(file);
        }
    }

    // restaurar del bin todo lo que exista (botón vaciar bin)
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
        if (!faces.length) { box.appendChild(el('div', 'mfs-item', '<span>FaceSwap no disponible</span>')); return; }
        // botones compactos en grid
        const grid = el('div');
        grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;';
        for (const name of faces.slice(0, 16)) {
            const b = el('button', 'mfs-btn', name);
            b.style.cssText = 'height:24px;font-size:10px;padding:0 6px;justify-content:center;';
            b.title = 'Click = trigger en el playhead · arrastra al timeline V2';
            // arrastrar al timeline (clip de V2)
            b.draggable = true;
            b.ondragstart = (ev) => {
                ev.dataTransfer.setData('text/mf-face', name);
                ev.dataTransfer.effectAllowed = 'copy';
            };
            b.onclick = () => {
                const tick = Math.floor(state.playheadTick);
                window.MF_FaceSwap?.applyAtTick(tick, name);
                renderTimeline();
                updateStatus('Cara "' + name + '" en tick ' + tick);
            };
            grid.appendChild(b);
        }
        box.appendChild(grid);
    }

    function renderTimeline() {
        // delegado al timeline NLE (MF_Timeline)
        window.MF_Timeline?.render();
    }

    function updatePlayhead() {
        // delegado: el playhead vive ahora en MF_Timeline
        const TL = window.MF_Timeline;
        const s = window.MF_Film?.status;
        if (TL && s?.playing) TL.playheadTick = s.tick;
    }

    function updateButtons() {
        const s = window.MF_Film?.status;
        const play = document.getElementById('mfs-play');
        const rec = document.getElementById('mfs-rec');
        if (!play || !rec) return;
        if (s?.recording) {
            play.textContent = '▶'; play.disabled = true;
            rec.classList.add('active');
        } else {
            play.disabled = false;
            rec.classList.remove('active');
            play.textContent = s?.playing && !s.paused ? '⏸' : '▶';
        }
    }

    function updateStatus(extra) {
        state.statusExtra = extra || null; // recordado para el loop throttled
        const box = document.getElementById('mfs-status');
        if (!box) return;
        const s = window.MF_Film?.status;
        const fps = 0; // TODO F2: medidor real de FPS
        box.innerHTML =
            `<span style="color:${s?.recording ? '#e33' : '#9a9aa6'}">● ${s?.recording ? 'REC' : s?.playing ? (s.paused ? 'PAUSA' : 'PLAY') : 'LISTO'}</span><br>` +
            `tick ${s?.playing ? s.tick : Math.floor(state.playheadTick)} / ${state.activeTake?.durationTicks || '—'}<br>` +
            `keyframes en memoria: ${s?.frames || 0}<br>` +
            (extra ? `<span style="color:#4fc3f7">${extra}</span>` : '');
    }

    // ── editor de pose (panel derecho) ──
    // sliders por parte (pitch/yaw/roll/bend) que escriben los joints del
    // jugador en vivo vía MF_Pose; botones de presets y guardar/cargar
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

        const angleState = {}; // part -> {pitch, yaw, roll, bend}

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
                // doble click = 0
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

        // presets + acciones
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

        const saveB = el('button', 'mfs-btn primary', '💾 Guardar pose');
        saveB.style.cssText = 'height:24px;font-size:10px;padding:0 8px;width:100%;margin-top:6px;';
        saveB.onclick = () => {
            const name = prompt('Nombre de la pose:', 'pose-' + (P.list().length + 1));
            if (!name) return;
            const r = P.save(name);
            updateStatus(r.ok ? 'Pose "' + name + '" guardada' : r.error);
        };
        actions.appendChild(saveB);

        // poses guardadas
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

        // ── ANIMATION MODE (estilo Blockbench) ──
        const A = window.MF_Animation;
        if (A) {
            const anim = el('div');
            anim.style.cssText = 'margin-top:14px;padding-top:10px;border-top:1px solid #2a2a38;';
            anim.appendChild(Object.assign(el('div'), {
                textContent: '🎞 Animation Mode',
                style: 'cssText'
            }));
            anim.lastChild.style.cssText = 'font-size:11px;font-weight:700;color:#d4a3ff;margin-bottom:6px;';

            // fila: crear + selector + duración
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

            // controles de animación (solo si hay una abierta)
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
                mkBtn('▶', () => { A.play(); updateStatus('Anim: play'); }, 'Reproducir');
                mkBtn('⏸', () => { A.pause(); updateStatus('Anim: pausa'); }, 'Pausar');
                mkBtn('⏹', () => { A.stop(); refreshPosePanel(); updateStatus('Anim: stop'); }, 'Parar y rebobinar');
                // ── botón +: añadir keyframe de la pose ACTUAL ──
                const kp = mkBtn('◆+', () => {
                    const part = posing.selPart || null;
                    const r = A.snapKey(part);
                    if (!r.ok) {
                        updateStatus('⚠ ' + (r.error || 'no se pudo grabar el keyframe (posea una parte primero)'));
                        return;
                    }
                    updateStatus(`Keyframe ${part || 'todo el cuerpo'} @ ${A.time().toFixed(2)}s (${r.written.length} canales)`);
                    refreshPosePanel();
                }, 'Añadir keyframe con la pose actual en el playhead\n(sin parte seleccionada = todo el cuerpo)');
                kp.style.color = '#7bd88f';
                // auto-key toggle
                const ak = mkBtn(A.autoKeyEnabled ? '⏺ AutoKey' : '⏹ AutoKey', (e) => {
                    A.setAutoKey(!A.autoKeyEnabled);
                    e.target.textContent = A.autoKeyEnabled ? '⏺ AutoKey' : '⏹ AutoKey';
                    e.target.style.color = A.autoKeyEnabled ? '#ff6b2b' : '';
                }, 'Posar escribe keyframes en el playhead');
                ak.style.color = A.autoKeyEnabled ? '#ff6b2b' : '';
                // mirror toggle
                const mb = mkBtn(A.mirrorEnabled ? '🪞 ON' : '🪞 OFF', (e) => {
                    A.setMirror(!A.mirrorEnabled);
                    e.target.textContent = A.mirrorEnabled ? '🪞 ON' : '🪞 OFF';
                    e.target.style.color = A.mirrorEnabled ? '#d4a3ff' : '';
                }, 'Mirror animating: editar un lado refleja al otro');
                mb.style.color = A.mirrorEnabled ? '#d4a3ff' : '';
                // interpolación
                mkBtn('∿ ' + (curAnimInterp() || 'smooth'), () => {
                    const modes = ['smooth', 'linear', 'step'];
                    const curI = curAnimInterp() || 'smooth';
                    const next = modes[(modes.indexOf(curI) + 1) % modes.length];
                    A.setInterp(next);
                    refreshPosePanel();
                }, 'Interpolación: smooth (Catmull-Rom) / linear / step');
                anim.appendChild(rowB);

                // playhead numérico + canal de la parte seleccionada
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

                // ── slider de FPS máximo de aplicación (5-180) ──
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

                // canales de la parte seleccionada con botón + (como BB)
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

    // interp de la animación actual (helper para el botón del panel)
    function curAnimInterp() {
        return window.MF_Animation?.interp || 'smooth';
    }

    function updateProps() {
        const box = document.getElementById('mfs-props');
        if (!box) return;
        const take = state.activeTake;
        if (!take) { box.innerHTML = '<div class="mfs-prop"><label>Sin toma activa</label></div>'; return; }
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
            if (state.activeFilm && confirm('¿Borrar la toma "' + state.activeFilm + '"?')) {
                window.MF_Film?.deleteFilm(state.activeFilm);
                state.activeFilm = null; state.activeTake = null;
                document.getElementById('mfs-project').textContent = 'Proyecto: sin toma activa';
                refreshTakes(); renderTimeline(); updateProps();
            }
        };
    }

    // ── modo cine (ocultar SOLO la UI del juego, nunca el canvas) ──
    // PROBLEMA ANTERIOR: se ocultaban divs fixed/absolute que contenían el
    // canvas WebGL del juego → se veía el fondo de pantalla. Ahora:
    // 1) Se oculta #canvas-hud (el HUD 2D: hotbar/inventario/crosshair).
    // 2) Se ocultan overlays de texto/UI del juego que NO contengan canvas
    //    del juego ni video (filtros por contenido).
    // 3) El canvas WebGL principal queda siempre visible bajo el preview.
    function looksLikeGameCanvas(node) {
        if (!(node instanceof HTMLCanvasElement)) return false;
        const c = document.querySelector('#react canvas, body > canvas, #game canvas');
        return c === node;
    }
    function hasGameCanvasInside(node) {
        if (looksLikeGameCanvas(node)) return true;
        return [...node.querySelectorAll?.('canvas') ?? []].some(c => {
            // el canvas del juego es el grande, a pantalla completa
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
            // ocultar solo overlays de UI pura (sin canvas grande dentro)
            document.querySelectorAll('body > div, body > section').forEach(d => {
                if (d.id === ID || d.id?.startsWith('mf-')) return;
                if (d.id === 'react') return; // app React: contiene el juego
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

    // ── loop de UI (throttled: el juego ya satura el hilo con WebGL;
    //    escribir DOM 60 veces/s congelaba la página) ──
    let lastUiUpdate = 0;
    let lastCamFrame = 0;
    const UI_INTERVAL_MS = 200; // 5Hz: suficiente para status/playhead

    function uiLoop(now) {
        if (!state.open) return;
        // watchdog del pointer lock: el estudio abierto nunca debe tener
        // el ratón atrapado (lo pide el juego vía eventos que no controlamos)
        if (document.pointerLockElement) releasePointerLock();
        // cámara WASD: 60fps con delta time real
        if (lastCamFrame) {
            // Un lag spike o volver de otra pestaña no debe convertirse en un
            // salto enorme de cámara en un único frame.
            const dt = Math.min(0.05, Math.max(0, (now - lastCamFrame) / 1000));
            applyCameraMovement(dt);
        }
        lastCamFrame = now;
        // Studio Sync: emitir pose local (20 Hz interno, solo si cambió)
        if (p2p.share) emitLocalPose();
        // playhead siempre fluido (solo 1 style write, barato)
        updatePlayhead();
        // status/botones solo cada 200ms y solo si cambió el estado
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

    // ── cámara del estudio: AUTOCONTENIDA (no usa FreeCam) ──
    // FreeCam requiere permiso de admin del servidor, así que el estudio
    // maneja la cámara del juego directamente:
    //   1) detach: la cámara pasa de estar colgada del jugador a la escena
    //   2) click+drag en preview = yaw/pitch (sin pointer lock)
    //   3) WASD/QE = mover con delta time
    //   4) al cerrar: re-attach al padre original y restaurar transform
    const cam = {
        active: false, dragging: false, lastX: 0, lastY: 0,
        keys: {}, keysBound: false,
        camera: null, origParent: null, origIndex: -1, scene: null,
        pos: null, yaw: 0, pitch: 0,
        origPos: null, origQuat: null
    };
    // El preview se recrea en cada open(), pero estos listeners viven en window.
    // Sin este guard se acumulaban y multiplicaban la sensibilidad al reabrir.
    let camMouseBound = false;

    function findSceneOf(node) {
        let n = node;
        while (n) {
            if (n?.isScene) return n;
            n = n.parent;
        }
        return null;
    }

    function cameraEnable() {
        if (cam.active) return false;
        const game = getGame();
        const scene = game?.gameScene?.scene;
        let camera = game?.gameScene?.camera || game?.camera || null;
        if (!camera) {
            // buscar por la escena
            camera = scene?.camera || null;
        }
        if (!camera || !scene) return false;

        // guardar estado original
        cam.camera = camera;
        cam.origParent = camera.parent || null;
        cam.origIndex = Array.isArray(cam.origParent?.children) ? cam.origParent.children.indexOf(camera) : -1;
        cam.scene = scene;
        cam.origPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        try {
            cam.origQuat = { x: camera.quaternion.x, y: camera.quaternion.y, z: camera.quaternion.z, w: camera.quaternion.w };
        } catch { cam.origQuat = null; }

        // partir de la vista actual
        cam.pos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        // world position si está colgada del jugador (Vector3 interno del juego)
        try {
            camera.updateMatrixWorld?.(true);
            const wp = camera.getWorldPosition?.(new camera.position.constructor());
            if (wp && Number.isFinite(wp.x)) { cam.pos = { x: wp.x, y: wp.y, z: wp.z }; }
        } catch {}
        // detach a la escena (mantiene transform mundial). La orientación
        // se captura DESPUÉS del attach; antes era local al padre del jugador
        // y podía producir un salto/desgarro al primer frame.
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
        // La cámara del Studio es local; compartir animación no la publica.
        console.log(TAG + ' cámara de studio activa (click+drag=rotar · WASD/QE=mover · Ctrl=rápido)');
        return true;
    }

    function cameraDisable() {
        if (!cam.active) return;
        // La cámara del Studio es local; no hay estado remoto que apagar.
        cam.active = false;
        cam.dragging = false;
        cam.keys = {};
        removeCamHooks();
        const camera = cam.camera;
        if (camera && cam.origParent) {
            try {
                // restaurar transform original
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

    // reaplicar pose de cámara cada frame (el juego puede pisarla).
    // Mismo mecanismo que FreeCam: hookear updateMatrixWorld/updateWorldMatrix
    // para que la pose del estudio se aplique ANTES de que el juego calcule
    // sus matrices (el juego reescribe la cámara en su propio loop).
    const camHooks = { umw: null, uwm: null, updating: false };
    function applyCamPose() {
        const c = cam.camera;
        if (!c) return;
        // cámara remota compartida: interpolar hacia el target del peer en
        // lugar de usar mi pose local. Si arrastro o uso WASD, TOMO el
        // control (dejo de seguir y mi cámara pasa a compartirse).
        if (p2p.applying) return; // ya viene de datos remotos
        if (p2p.followRemoteCamera && p2p.camActive && p2p.camRemote) {
            if (cam.dragging || camKeysActive()) {
                p2p.camActive = false;
                p2p.camRemote = null;
                updateStatus('📡 Tomaste el control de la cámara local');
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
        // P2P del Studio comparte pose/animación, no la cámara. Esto evita
        // bloquear o secuestrar la vista del jugador conectado.
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
            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(ev.code)) {
                cam.keys[ev.code] = true;
                ev.preventDefault();
            }
        });
        window.addEventListener('keyup', (ev) => { cam.keys[ev.code] = false; });
    }

    // ¿hay teclas de movimiento de cámara presionadas? (para ceder el
    // control a la cámara remota compartida)
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
        applyCamPose(); // siempre: el juego puede pisar la cámara
    }

    // ── Studio Sync: recepción de datos remotos ──
    // el peer movió su cámara: guardar target (applyCamPose interpola)
    function applyRemoteCam(p) {
        // Compatibilidad con clientes viejos que aún mandan studio-cam.
        // Se acepta el paquete, pero NUNCA se activa/mueve la cámara local.
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
        p2p.camRemote = { x: p.x, y: p.y, z: p.z, yaw: +p.yaw || 0, pitch: +p.pitch || 0 };
    }

    // Compatibilidad con peers antiguos. Compartir animación no implica seguir
    // su cámara: el receptor conserva control total de su vista.
    function remoteCamActive(on) {
        p2p.camActive = !!on;
        if (!on) p2p.camRemote = null;
    }

    // el peer posó su actor: aplicar localmente (radianes, formato MF_Film)
    function applyRemotePose(pose, reset) {
        if (reset) {
            p2p.applying = true;
            try { window.MF_Pose?.reset?.(); } catch {}
            p2p.applying = false;
            return;
        }
        if (!pose || typeof pose !== 'object') return;
        // suprimir eco: si mi emisión lee esta misma pose, no re-enviarla
        try { p2p._poseKey = JSON.stringify(pose); } catch {}
        p2p._remotePoseAt = performance.now();
        p2p.applying = true;
        try {
            const P = window.MF_Pose;
            if (P?.applyPoseObj) P.applyPoseObj(pose);
        } catch {}
        p2p.applying = false;
    }

    // ── Studio Sync: emisión de pose local (throttle 20 Hz) ──
    function emitLocalPose(force) {
        if (!p2p.share || p2p.applying) return;
        // anti-eco: si acabo de aplicar pose remota, esperar 150ms antes
        // de volver a emitir (mi propio bucle podría leer la pose del peer)
        if (p2p._remotePoseAt && performance.now() - p2p._remotePoseAt < 150) return;
        const now = performance.now();
        if (!force && now - p2p.lastPoseOut < 50) return;
        p2p.lastPoseOut = now;
        const pose = window.MF_Pose?.getPose?.();
        if (!pose) return;
        // compactar a 3 decimales y comparar con lo último enviado
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
            // posing activo: el gesto es para posar, no para la cámara.
            // (El listener de posing se registra DESPUÉS que este, así que
            // no puede cortarnos; decidimos nosotros ceder el gesto.)
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

    // ── posing directo en viewport, estilo Blockbench ──
    // Click derecho sobre una extremidad del jugador = seleccionarla
    // (resaltada). Arrastrar con derecho = rotar (X ratón→pitch, Y→roll).
    // Rueda durante selección = yaw. Shift = espejo en la parte opuesta.
    // Ctrl = snap a 15°. Esc o click al vacío = deseleccionar.
    // (Botón derecho para no pelear con el click-izq de la cámara.)
    const posing = { enabled: false, selected: null, selPart: null, dragging: false, lastX: 0, lastY: 0, startX: 0, startY: 0, rotHandle: null, bound: false, outline: null };
    let posingWinBound = false;

    function posingToggle(on) {
        posing.enabled = !!on;
        if (!on) posingDeselect();
        const btn = document.getElementById('mfs-pose-vp');
        if (btn) {
            btn.classList.toggle('on', posing.enabled);
            btn.classList.toggle('warm', posing.enabled);
            btn.textContent = posing.enabled ? '🦴 Posing ●' : '🦴 Posing';
        }
        const preview = document.getElementById('mf-studio-preview');
        if (preview) preview.style.cursor = posing.enabled ? 'crosshair' : 'grab';
    }

    // ── Studio Sync P2P: activar/desactivar compartir mis cambios ──
    function shareToggle(on) {
        if (on === undefined) on = !p2p.share;
        p2p.share = !!on;
        const btn = document.getElementById('mfs-share');
        if (btn) {
            btn.classList.toggle('on', p2p.share);
            btn.textContent = p2p.share ? '📡 ●' : '📡';
        }
        if (!p2p.share) {
            p2p._camKey = null;
            p2p._poseKey = null;
        } else {
            // al activar: mandar snapshot inmediato de pose/animación.
            // La cámara permanece siempre local para cada jugador.
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
            // resaltar: emissive naranja IN-PLACE (sin clonar — el clone
            // pierde la textura de la skin y se veía azul/oscura)
            posing.outline = makeEmissiveHighlight(pick.object, 0x552200);
        } catch {}
        updateStatus('Pose: ' + pick.part + ' — 🖱 izq=rotar · anillos XYZ=rotar eje · flechas XYZ=mover · der=mover · rueda=yaw · Alt+rueda=tamaño · Shift=espejo · Esc=salir');
        attachGizmoToPart(pick);
    }

    // ── gizmo de flechas XYZ (estilo Blockbench move tool) ──
    const gizmo = {
        hoverAxis: null, draggingAxis: null, startOffset: null,
        axisApplied: 0, axisScale: 1,
        hoverRing: null, draggingRing: null,
        ringAccum: 0, ringLastX: 0, ringLastY: 0,
        mode: 'move'
    };

    // aplicar/validar el modo del gizmo (move | rotate)
    function gizmoSetMode(mode) {
        gizmo.mode = (mode === 'rotate') ? 'rotate' : 'move';
        window.MF_Gizmo?.setMode?.(gizmo.mode);
        const btn = document.getElementById('mfs-gizmo-mode');
        if (btn) {
            btn.textContent = gizmo.mode === 'rotate' ? '⟳ Rotar' : '↔ Mover';
            btn.classList.toggle('warm', gizmo.mode === 'rotate');
            btn.classList.toggle('on', gizmo.mode === 'rotate');
        }
    }

    function attachGizmoToPart(pick) {
        const G = window.MF_Gizmo;
        if (!G) return;
        // el gizmo se ancla al joint de la parte (pick.joint si el picking lo dio)
        const joint = pick.joint || getJointOfPart(pick.part);
        if (!joint) return;
        G.attach(joint, null);
        G.setMode?.(gizmo.mode); // restaurar modo mover/rotar tras re-attach
    }

    function getJointOfPart(part) {
        // reutilizar el resolvedor de MF_Pose: findJoint interno no está
        // expuesto, pero pickPart devuelve el joint; como fallback,
        // buscamos por nombre en el mesh del jugador
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
            // BFS
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

    // aplicar translate solo en el eje arrastrado (eje MUNDO del gizmo,
    // convertido a local por MF_Pose — el personaje tiene yaw)
    function applyGizmoDrag(dxTotal, dyTotal) {
        const G = window.MF_Gizmo;
        const part = posing.selPart;
        const P = window.MF_Pose;
        const axis = gizmo.draggingAxis;
        if (!G || !part || !P || !axis) return;
        // Proyección congelada + delta total = movimiento X/Y/Z lineal. Aplicar
        // solo la diferencia contra el frame anterior lo vuelve independiente
        // de FPS y de cuántos mousemove entregue el navegador.
        const raw = G.dragDeltaFromStart?.(dxTotal, dyTotal);
        const target = (Number.isFinite(raw) ? raw : 0) * gizmo.axisScale;
        const step = target - gizmo.axisApplied;
        gizmo.axisApplied = target;
        if (!Number.isFinite(step) || Math.abs(step) < 1e-9) return;
        let next = { x: 0, y: 0, z: 0 };
        try { next = P.addWorldOffset(part, axis, step); } catch {}
        autoKeyTransform(part, 'position', [next.x, next.y, next.z], false);
    }

    // rotación por anillo: eje MUNDO fijo (x/y/z), ángulo medido en el
    // plano del anillo — reutiliza el handle de beginRotateWorld
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

    // espejo left↔right para Shift
    function mirrorPart(part) {
        return ({ leftArm: 'rightArm', rightArm: 'leftArm', leftLeg: 'rightLeg', rightLeg: 'leftLeg' })[part] || null;
    }

    // auto-key: si hay animación abierta, cada transform escribe keyframe
    // en el playhead (igual que el Animation Mode de Blockbench)
    function autoKeyTransform(part, channel, value, mirror) {
        const A = window.MF_Animation;
        if (!A?.autoKeyEnabled || !A.current) return;
        // autoKey del módulo ya refleja al lado opuesto; pasamos forceMirror
        // explícito para no duplicar (nuestro Shift ya lo decide el usuario)
        A.autoKey(part, channel, value, !!mirror);
    }

    // rotación estilo Blockbench: el drag se aplica en espacio MUNDO
    // alrededor de los ejes right/up de la cámara → el brazo sigue al
    // ratón hacia adelante/atrás sin importar el ángulo de la cámara.
    // Los deltas son TOTALES desde el mousedown (rotHandle captura la
    // pose inicial), así el snap y los eventos repetidos no acumulan error.
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
        // fallback: pitch/roll locales (sin cuaterniones disponibles)
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

    // Alt+rueda sobre parte seleccionada = escala uniforme (resize BB)
    function applyScaleFromWheel(deltaY, mirror) {
        const part = posing.selPart;
        const P = window.MF_Pose;
        if (!part || !P?.setScale) return;
        const cur = P.getScale(part) || { x: 1, y: 1, z: 1 };
        // rueda arriba crece, abajo decrece; step 5%
        let u = cur.x * (deltaY < 0 ? 1.05 : 1 / 1.05);
        try { P.setScale(part, { uniform: u }); } catch {}
        autoKeyTransform(part, 'scale', [u, u, u], mirror);
        if (mirror) {
            const mp = mirrorPart(part);
            if (mp) try { P.setScale(mp, { uniform: u }); } catch {}
        }
    }

    function bindViewportPosing() {
        // El preview se RECREA en cada open() (close() remueve el DOM), así
        // que el guard debe ser por-elemento: si el closure marcara bound=true
        // para siempre, la 2ª apertura quedaría sin listeners (sin hover,
        // sin selección). Los de window() solo se registran una vez.
        const bindPreview = () => {
            const preview = document.getElementById('mf-studio-preview');
            if (!preview || preview.dataset.posingBound) return;
            preview.dataset.posingBound = '1';

        preview.addEventListener('contextmenu', (ev) => {
            if (!posing.enabled) return;
            ev.preventDefault();
        });

        // ── hover: resaltar parte (azul) y detectar eje del gizmo ──
        let hoverThrottle = 0;
        preview.addEventListener('mousemove', (ev) => {
            if (!posing.enabled || posing.dragging) return;
            const now = performance.now();
            if (now - hoverThrottle < 50) return; // 20Hz max
            hoverThrottle = now;
            // prioridad: anillo de rotación > flecha del gizmo > parte
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

        // ── click izquierdo: flecha del gizmo = mover por eje; si no, seleccionar ──
        preview.addEventListener('mousedown', (ev) => {
            if (!posing.enabled || ev.button !== 0) return;
            // 1) ¿anillo de rotación bajo el cursor? → rotar por eje mundo
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
                    updateStatus('Rotando eje ' + ring.toUpperCase() + ' de ' + posing.selPart + ' (Ctrl=snap 15°, Shift=espejo)');
                    return;
                }
            }
            // 2) ¿flecha del gizmo bajo el cursor? → drag por eje
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
                    updateStatus('Moviendo eje ' + axis.toUpperCase() + ' de ' + posing.selPart + ' (Ctrl=fino)');
                    return;
                }
            }
            // 2) si no: seleccionar parte (y rotar con el drag)
            const pick = window.MF_Pose?.pickPart?.(ev.clientX, ev.clientY);
            if (!pick) return; // no golpea nada: la cámara rota normal
            posingSelect(pick);
            posing.dragging = true;
            posing.dragMode = 'rotate';
            posing.lastX = ev.clientX; posing.lastY = ev.clientY;
            posing.startX = ev.clientX; posing.startY = ev.clientY;
            // handle de rotación mundo-relativa: congela pose inicial del joint
            posing.rotHandle = window.MF_Pose?.beginRotateWorld?.(posing.selPart, cam.camera) ?? null;
            clearHoverHighlight();
            ev.preventDefault();
            ev.stopImmediatePropagation(); // que la cámara no rote también
        });

        // ── click derecho: seleccionar + modo "move" (translate) ──
        preview.addEventListener('mousedown', (ev) => {
            if (!posing.enabled || ev.button !== 2) return;
            const pick = window.MF_Pose?.pickPart?.(ev.clientX, ev.clientY);
            if (!pick) { posingDeselect(); updateStatus('Pose: nada seleccionado'); return; }
            posingSelect(pick);
            posing.dragging = true;
            posing.dragMode = 'move';
            posing.lastX = ev.clientX; posing.lastY = ev.clientY;
            ev.preventDefault();
        });
        // rueda durante selección: yaw · Alt+rueda: escala (resize)
        preview.addEventListener('wheel', (ev) => {
            if (!posing.enabled || !posing.selPart) return;
            ev.preventDefault();
            if (ev.altKey) applyScaleFromWheel(ev.deltaY, ev.shiftKey);
            else applyYawFromWheel(ev.deltaY, ev.ctrlKey, ev.shiftKey);
        }, { passive: false });
        }; // fin bindPreview

        // listeners de window: solo una vez (sobreviven a close/open)
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
                    // Acumular deltas cortos evita el salto ±π de medir siempre
                    // desde el mousedown después de cruzar media vuelta.
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
                    // deltas TOTALES desde el mousedown (la pose inicial ya está
                    // congelada en el handle → sin error acumulado)
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
            // Esc deselecciona Y se traga (si llega al juego, abre su menú)
            window.addEventListener('keydown', (ev) => {
                if (!posing.enabled) return;
                if (ev.key === 'Escape') { posingDeselect(); ev.preventDefault(); ev.stopImmediatePropagation(); }
            }, true);
        }
        bindPreview(); // (re)bindear al preview actual (nuevo en cada open)
    }

    // resaltados ──
    // seleccionado: naranja emissive · hover: azul tenue emissive.
    // IN-PLACE: guardar emissive/emissiveIntensity y restaurarlos. NO se
    // clona el material — el clone() del juego pierde la textura map y la
    // parte se veía azul/oscura (color plano + emissive).
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
        // no pisar el resaltado de selección
        if (posing.outline?.obj === obj) return;
        const hl = makeEmissiveHighlight(obj, 0x113355);
        if (hl) hoverHl = hl;
    }
    function clearHoverHighlight() {
        if (!hoverHl) return;
        try { hoverHl.restore(); } catch {}
        hoverHl = null;
    }

    // ── translate con drag (modo move, botón derecho) ──
    // dx/dy de ratón → offset del joint en el plano de cámara (screen-space)
    // mover en el plano de pantalla: right/up de la CÁMARA → mundo → local.
    // Así el torso (y cualquier parte) sigue al cursor libremente sin
    // importar el yaw del personaje ni el ángulo de la cámara.
    function applyMoveFromDrag(dx, dy, slow, mirror) {
        const part = posing.selPart;
        const P = window.MF_Pose;
        if (!part || !P?.addScreenOffset) return;
        const camera = cam.camera;
        if (!camera?.matrixWorld) return;
        try { camera.updateMatrixWorld?.(); } catch {}

        // escala px→mundo según distancia cámara→parte seleccionada
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

        // ejes right/up de la cámara en mundo
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

    // posición mundo del joint seleccionado (para escalar el drag por distancia)
    function getSelectedJointWorldPos(part) {
        try {
            const P = window.MF_Pose;
            if (!P) return null;
            // reutilizar el picking: no hay API directa; usar el joint vía BFS
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
        // mesh del jugador local para medir distancia cámara→parte
        try {
            const g = getGame();
            const me = g?.player;
            const e = g?.world?.getPlayerById?.(me.id) || g?.world?.players?.get?.(me.id) || g?.world?.entities?.get?.(me.id);
            return e?.mesh || null;
        } catch { return null; }
    }

    // ── pointer lock: liberar al abrir, bloquear recaptura del juego ──
    // El juego pide pointer-lock en cada click sobre su canvas. Mientras el
    // estudio está abierto, salimos del lock y neutralizamos requests
    // nuevos (patch a requestPointerLock durante la sesión de estudio).
    const lock = { patched: false, orig: null };

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
                // estudio abierto: el juego no puede atrapar el ratón
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

    // ── tragarse pointerlockchange/error mientras el estudio está abierto ──
    // El juego abre su MENÚ DE PAUSA cuando pierde el pointer lock (mismo
    // camino que pulsar Esc). Como el estudio libera el lock al abrir, ese
    // evento llegaría al juego y pausaría. Este listener va en window con
    // capture: dispara ANTES que cualquier listener del juego (en document)
    // y con stopImmediatePropagation el juego nunca se entera.
    let lockEventsBound = false;
    function swallowLockEvent(ev) {
        if (!state.open) return;
        ev.stopImmediatePropagation();
    }
    function blockLockEvents() {
        if (lockEventsBound) return;
        lockEventsBound = true;
        window.addEventListener('pointerlockchange', swallowLockEvent, true);
        window.addEventListener('pointerlockerror', swallowLockEvent, true);
    }

    // ── abrir/cerrar ──
    function open() {
        if (state.open) return;
        build();
        state.open = true;
        lastCamFrame = 0;
        // ORDEN CRÍTICO: primero bloquear pointerlockchange (si no, el juego
        // ve la pérdida del lock como "Esc" y abre su menú de pausa),
        // después liberar el lock, después parchear requestPointerLock.
        blockLockEvents();
        releasePointerLock();
        patchPointerLock();
        globalThis.__MF_STUDIO_OPEN__ = true; // FreeCam deja de interceptar input
        refreshTakes(); refreshMediaPool(); refreshModels(); refreshFaces(); refreshPosePanel(); renderTimeline(); updateProps(); updateStatus(); updateButtons();
        applyCinema();
        bindPreviewCamera();
        bindViewportPosing();
        cameraEnable();
        afkToggle(true); // anti-kick: editar puede dejar al player quieto mucho rato
        console.log(TAG + ' abierto. Click+drag en preview=rotar cámara · WASD=mover · Space=play · R=rec · F1=cerrar');
    }

    function close() {
        if (!state.open) return;
        state.open = false;
        lastCamFrame = 0;
        cancelAnimationFrame(state.raf);
        cameraDisable();
        posingToggle(false);
        afkToggle(false);
        unpatchPointerLock(); // devolver el lock al juego
        globalThis.__MF_STUDIO_OPEN__ = false;
        state.cinema = false; applyCinema(); // restaurar HUD del juego
        const root = document.getElementById(ID);
        const style = document.getElementById(ID + '-style');
        root?.remove(); style?.remove();
        console.log(TAG + ' cerrado');
    }

    // ── API + registro ──
    window.MF_Studio = {
        open, close,
        get isOpen() { return state.open; },
        get cinema() { return state.cinema; },
        set cinema(v) {
            state.cinema = !!v;
            document.getElementById(ID)?.classList.toggle('cinema', state.cinema);
            applyCinema();
        },
        // Studio Sync P2P
        get share() { return p2p.share; },
        set share(v) { shareToggle(!!v); },
        applyRemotePose, applyRemoteCam, remoteCamActive
    };
    window.__MF_Studio = true;

    // F1 abre/cierra (aunque el estudio esté cerrado, el listener global vive aquí)
    window.addEventListener('keydown', (ev) => {
        if (ev.key === 'F1') { ev.preventDefault(); state.open ? close() : open(); }
    });

    console.log(TAG + ' listo. F1 o /studio para abrir el estudio.');
})();
