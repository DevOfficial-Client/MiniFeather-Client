// MF_Timeline.js — Timeline NLE (non-linear editor) para MF Studio.
//
// Línea de tiempo real estilo DaVinci Resolve/Premiere sobre el film mode:
//   - Clips arrastrables: cada toma es un bloque en V1. Drag mueve,
//     bordes (grips) hacen trim.
//   - Zoom con rueda sobre la regla (centrado en cursor) o botones +/−/fit.
//   - Snapping a 0, playhead y bordes de otros clips (6px). Alt lo desactiva
//     durante el drag (se comprueba en tiempo real).
//   - Multi-selección (Shift+click) y Supr para borrar clips.
//   - Pistas: V1 tomas (clips), V2 caras (triggers de FaceSwap), A1 audio (F2).
//   - La duración de la secuencia = fin del último clip.
//
// Este módulo solo DOM + estado, no toca el juego. `window.MF_Timeline`
// y MF_Studio lo monta en su panel inferior pasándole un callback onChange.

(function () {
    'use strict';

    if (window.__MF_Timeline) return;
    const TAG = '[MF Timeline]';
    const TPS = 20;

    const CSS = `
#mf-timeline { display: flex; flex-direction: column; height: 100%; }
#mft-ruler {
    height: 28px; position: relative; cursor: ew-resize; flex-shrink: 0;
    border-bottom: 1px solid #2a2a32; background: #16161a; overflow: hidden;
}
#mft-ruler canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: inherit; }
#mft-tracks { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 4px 0 8px 0; }
.mft-track { display: flex; align-items: center; height: 40px; padding: 0 10px; position: relative; }
.mft-track + .mft-track { border-top: 1px solid #1e1e24; }
.mft-track .label {
    width: 86px; flex-shrink: 0; font-size: 10px; letter-spacing: 1px;
    color: #6e6e7a; text-transform: uppercase; user-select: none;
}
.mft-lane { flex: 1; height: 30px; background: #141419; border-radius: 3px; position: relative; }
.mft-clip {
    position: absolute; top: 1px; height: 28px; border-radius: 3px;
    background: linear-gradient(180deg, #2d3542 0%, #232936 100%);
    border: 1px solid #3a4456; cursor: grab; user-select: none;
    display: flex; align-items: center; padding: 0 8px; gap: 4px;
    box-sizing: border-box; overflow: hidden; white-space: nowrap;
}
.mft-clip:hover { border-color: #5a6a8a; }
.mft-clip.dragging { cursor: grabbing; opacity: .9; }
.mft-clip.selected { border-color: #ff6b2b; box-shadow: 0 0 0 1px #ff6b2b inset; }
.mft-clip .grip { position: absolute; top: 0; width: 6px; height: 100%; cursor: ew-resize; }
.mft-clip .grip.l { left: 0; } .mft-clip .grip.r { right: 0; }
.mft-clip .grip.l:hover, .mft-clip .grip.r:hover { background: rgba(255,107,43,.4); }
.mft-clip .name { font-size: 10px; color: #c8c8d2; pointer-events: none; }
.mft-clip .len { font-size: 9px; color: #6e6e7a; font-family: Consolas, monospace; pointer-events: none; margin-left: auto; }
.mft-kf {
    position: absolute; top: 50%; transform: translateY(-50%);
    width: 4px; height: 16px; background: #4fc3f7; border-radius: 1px;
    cursor: pointer; z-index: 3;
}
.mft-kf:hover { background: #fff; }
/* preset de cabeza (skin dibujada) — naranja, más ancho */
.mft-kf.head { background: #ff6b2b; width: 6px; }
.mft-kf.head:hover { background: #ffa76b; }
/* clips de V2 (caras/cabeza): emociones azul, cabeza naranja */
.face-clip { border-radius: 4px; }
.face-clip .name { color: #d8ecff; }
.face-clip { background: linear-gradient(180deg, #1d3a52, #16303f); border-color: #2f6a94; }
.face-clip:hover { border-color: #4fc3f7; }
.face-clip.head { background: linear-gradient(180deg, #4a2410, #3a1c0c); border-color: #a04a1c; }
.face-clip.head:hover { border-color: #ff6b2b; }
.face-clip.head .name { color: #ffe0c8; }
#mft-toolbar {
    height: 30px; display: flex; align-items: center; gap: 8px;
    padding: 0 10px; border-bottom: 1px solid #2a2a32; background: #1a1a1f;
    font-size: 11px; color: #9a9aa6; flex-shrink: 0; user-select: none;
}
#mft-toolbar .zoom-ind { font-family: Consolas, monospace; color: #6e6e7a; margin-left: auto; }
#mft-toolbar button {
    background: #26262e; border: 1px solid #3a3a44; color: #c8c8d2;
    height: 20px; padding: 0 8px; border-radius: 2px; cursor: pointer; font-size: 10px;
}
#mft-toolbar button:hover { background: #30303a; }
#mft-playhead {
    position: absolute; top: 0; bottom: 0; width: 1px; background: #fff;
    pointer-events: none; z-index: 5;
}
#mft-playhead::before {
    content: ''; position: absolute; top: 0; left: -5px;
    border: 5px solid transparent; border-top-color: #ff6b2b;
}
`;

    const state = {
        clips: [],                        // [{id, film, start, duration, selected}]
        view: { pxPerSec: 60, scrollSec: 0 },
        playheadTick: 0,
        selection: new Set(),
        snapEnabled: true,
        seqDuration: 0,
        onChange: null,
        els: {}
    };

    function el(tag, cls, html) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }

    // coordenadas mundo/pantalla
    function secToX(sec) { return sec * state.view.pxPerSec - state.view.scrollSec * state.view.pxPerSec; }
    function xToSec(x) { return (x + state.view.scrollSec * state.view.pxPerSec) / state.view.pxPerSec; }
    function tickToX(t) { return secToX(t / TPS); }
    function xToTick(x) { return Math.max(0, Math.round(xToSec(x) * TPS)); }

    function recomputeSeqDuration() {
        state.seqDuration = state.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    }

    // ── montaje ──
    function mount(container, opts) {
        if (opts?.onChange) state.onChange = opts.onChange;
        build(container);
        console.log(TAG + ' listo. Rueda=zoom · drag=move · grips=trim · Alt=sin snap · Supr=borrar');
    }

    function build(container) {
        let style = document.getElementById('mf-timeline-style');
        if (!style) {
            style = el('style');
            style.id = 'mf-timeline-style';
            document.head.appendChild(style);
        }
        style.textContent = CSS;

        container.innerHTML = '';
        const root = el('div');
        root.id = 'mf-timeline';

        const tb = el('div');
        tb.id = 'mft-toolbar';
        tb.innerHTML = `
            <button id="mft-zoom-out" title="Alejar">−</button>
            <button id="mft-zoom-in" title="Acercar">+</button>
            <button id="mft-zoom-fit" title="Ajustar a la secuencia">Ajustar</button>
            <span style="opacity:.35">|</span>
            <label style="cursor:pointer"><input type="checkbox" id="mft-snap" checked> Snap</label>
            <span id="mft-info" style="color:#6e6e7a"></span>
            <span class="zoom-ind" id="mft-zoom-ind"></span>
        `;

        const ruler = el('div');
        ruler.id = 'mft-ruler';
        const rulerCanvas = el('canvas');
        ruler.appendChild(rulerCanvas);

        const tracks = el('div');
        tracks.id = 'mft-tracks';

        const playhead = el('div');
        playhead.id = 'mft-playhead';

        root.appendChild(tb); root.appendChild(ruler); root.appendChild(tracks); root.appendChild(playhead);
        container.appendChild(root);

        state.els = { root, ruler, rulerCanvas, tracks, playhead, tb };
        bindEvents();
        render();
    }

    function bindEvents() {
        const { tb, ruler, tracks, root } = state.els;

        tb.querySelector('#mft-zoom-in').onclick = () => zoom(1.3, null);
        tb.querySelector('#mft-zoom-out').onclick = () => zoom(1 / 1.3, null);
        tb.querySelector('#mft-zoom-fit').onclick = fit;
        tb.querySelector('#mft-snap').onchange = (e) => { state.snapEnabled = e.target.checked; };

        // ── drop desde el Media Pool del Studio ──
        // Los ítems del pool arrastran text/mf-film = nombre de la toma.
        // El drop inserta el clip en la posición X del cursor (con snap).
        // text/mf-head = preset de cabeza · text/mf-face = emoción → clip V2.
        root.addEventListener('dragover', (ev) => {
            const types = ev.dataTransfer.types;
            if (!types.includes('text/mf-film') && !types.includes('text/mf-head') && !types.includes('text/mf-face')) return;
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'copy';
        });
        root.addEventListener('drop', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const r = tracks.getBoundingClientRect();
            const tick = Math.max(0, Math.round(xToTick(ev.clientX - r.left)));

            // emoción o preset de cabeza → clip en V2
            const headName = ev.dataTransfer.getData('text/mf-head');
            const faceName = ev.dataTransfer.getData('text/mf-face');
            if (headName || faceName) {
                if (headName) window.MF_FaceSwap?.applyAtTick(tick, headName, 'head');
                else window.MF_FaceSwap?.applyAtTick(tick, faceName, 'face');
                render();
                state.onChange?.('clips-changed', state.clips.length);
                return;
            }

            // toma → clip en V1
            const name = ev.dataTransfer.getData('text/mf-film');
            if (!name) return;
            // resolver la toma: pide al Studio cargarla (no acoplarse a su
            // localStorage directamente)
            let film = null;
            try {
                const films = JSON.parse(localStorage.getItem('minifeather_films_v1') || '{}');
                film = films[name];
            } catch {}
            if (!film) {
                state.onChange?.('drop-rejected', name);
                return;
            }
            const tickSnap = snapCandidate(tick, null, ev.altKey);
            const clip = addClip(film, tickSnap);
            clip.selected = true;
        });

        // zoom con rueda sobre cualquier zona del timeline
        root.addEventListener('wheel', (ev) => {
            if (!ev.altKey) return;               // Alt+rueda = zoom (como los NLE)
            ev.preventDefault();
            const r = ruler.getBoundingClientRect();
            zoom(ev.deltaY < 0 ? 1.25 : 1 / 1.25, ev.clientX - r.left);
        }, { passive: false });
        // rueda simple sobre la regla también hace zoom (accesible)
        ruler.addEventListener('wheel', (ev) => {
            if (ev.altKey) return;
            ev.preventDefault();
            zoom(ev.deltaY < 0 ? 1.2 : 1 / 1.2, ev.offsetX);
        }, { passive: false });

        // scrub en la regla (barato: solo mueve el playhead, sin re-render)
        const scrub = (ev) => {
            const r = ruler.getBoundingClientRect();
            state.playheadTick = xToTick(ev.clientX - r.left);
            updatePlayhead();
            state.onChange?.('scrub', state.playheadTick);
        };
        ruler.addEventListener('mousedown', (ev) => {
            scrub(ev);
            const mv = (e) => scrub(e);
            const up = () => {
                window.removeEventListener('mousemove', mv);
                window.removeEventListener('mouseup', up);
            };
            window.addEventListener('mousemove', mv);
            window.addEventListener('mouseup', up);
        });

        // pan con botón central o Shift+drag en el fondo
        tracks.addEventListener('mousedown', (ev) => {
            if (ev.target !== tracks && !ev.target.classList?.contains('mft-lane')) return;
            if (ev.shiftKey || ev.button === 1) {
                ev.preventDefault();
                const startX = ev.clientX, startScroll = state.view.scrollSec;
                const mv = (e) => {
                    state.view.scrollSec = Math.max(0, startScroll - (e.clientX - startX) / state.view.pxPerSec);
                    render();
                };
                const up = () => {
                    window.removeEventListener('mousemove', mv);
                    window.removeEventListener('mouseup', up);
                };
                window.addEventListener('mousemove', mv);
                window.addEventListener('mouseup', up);
            } else {
                clearSelection(); render();
            }
        });

        // Supr borra clips seleccionados
        window.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
            if (!state.selection.size) return;
            const t = ev.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            deleteSelected();
            ev.preventDefault();
        });
    }

    function zoom(factor, pivotX) {
        const before = pivotX != null ? xToSec(pivotX) : null;
        state.view.pxPerSec = Math.min(600, Math.max(8, state.view.pxPerSec * factor));
        if (before != null) {
            state.view.scrollSec += xToSec(pivotX) - before;
        }
        state.view.scrollSec = Math.max(0, state.view.scrollSec);
        render();
    }

    function fit() {
        const w = state.els.tracks?.clientWidth || 700;
        const secs = Math.max(1, state.seqDuration / TPS);
        state.view.pxPerSec = Math.min(600, Math.max(8, (w - 130) / secs));
        state.view.scrollSec = 0;
        render();
    }

    // ── API de clips ──
    function addClip(film, startTick) {
        const clip = {
            id: 'clip-' + Math.random().toString(36).slice(2, 8),
            film,
            start: Math.max(0, Math.round(startTick || 0)),
            duration: film.durationTicks || TPS,
            selected: false
        };
        state.clips.push(clip);
        recomputeSeqDuration();
        render();
        state.onChange?.('clips-changed', state.clips.length);
        return clip;
    }

    function removeClip(id) {
        state.clips = state.clips.filter(c => c.id !== id);
        state.selection.delete(id);
        recomputeSeqDuration();
        render();
        state.onChange?.('clips-changed', state.clips.length);
    }

    function clearSelection() {
        state.selection.clear();
        for (const c of state.clips) c.selected = false;
    }

    function deleteSelected() {
        for (const id of [...state.selection]) removeClip(id);
    }

    // ── snapping ──
    function snapCandidate(tick, ignoreId, snapOff) {
        if (!state.snapEnabled || snapOff) return Math.max(0, Math.round(tick));
        const tol = (6 / state.view.pxPerSec) * TPS; // 6px
        let best = tick, bestD = tol;
        const consider = (v) => { const d = Math.abs(tick - v); if (d < bestD) { best = v; bestD = d; } };
        consider(0);
        consider(state.playheadTick);
        for (const c of state.clips) {
            if (c.id === ignoreId) continue;
            consider(c.start);
            consider(c.start + c.duration);
        }
        return Math.max(0, Math.round(best));
    }

    // ── render ──
    function render() {
        const { tracks } = state.els;
        if (!tracks) return;
        recomputeSeqDuration();
        tracks.innerHTML = '';
        drawRuler(); // incluye la banda In/Out si hay rango activo

        // V1 — clips de tomas
        const v1 = el('div', 'mft-track');
        v1.innerHTML = '<span class="label">V1 · Tomas</span>';
        const lane1 = el('div', 'mft-lane');
        for (const clip of state.clips) lane1.appendChild(renderClip(clip));
        v1.appendChild(lane1);

        // V2 — triggers de cara / cabeza (clips con duración, como V1)
        const v2 = el('div', 'mft-track');
        v2.innerHTML = '<span class="label">V2 · Caras</span>';
        const lane2 = el('div', 'mft-lane');
        (window.MF_FaceSwap?.triggers || []).forEach((t, i) => {
            lane2.appendChild(renderTriggerClip(t, i));
        });
        v2.appendChild(lane2);

        // A1 — audio (F2)
        const a1 = el('div', 'mft-track');
        a1.innerHTML = '<span class="label">A1 · Audio</span><div class="mft-lane"></div>';

        tracks.appendChild(v1); tracks.appendChild(v2); tracks.appendChild(a1);

        drawRuler();
        updatePlayhead();
        updateInfo();
    }

    // render barato durante drag: solo actualizar posiciones/tamaños de los
    // clips existentes en vez de reconstruir todo el DOM por mousemove
    // (reconstruir a la frecuencia del ratón congelaba la página)
    function updateClipStyles() {
        const lanes = state.els.tracks?.querySelectorAll('.mft-lane');
        if (!lanes) return;
        for (const lane of lanes) {
            for (const div of lane.children) {
                if (div.dataset.tri != null) {
                    // V2: trigger de cara/cabeza
                    const i = +div.dataset.tri;
                    const t = window.MF_FaceSwap?.triggers?.[i];
                    if (!t) continue;
                    div.style.left = tickToX(t.tick) + 'px';
                    div.style.width = Math.max(8, ((t.durationTicks || TPS) / TPS) * state.view.pxPerSec) + 'px';
                    const len = div.querySelector('.len');
                    if (len) len.textContent = ((t.durationTicks || TPS) / TPS).toFixed(1) + 's';
                    continue;
                }
                // V1: clip de toma
                const clip = state.clips.find(c => c.id === div.dataset.id);
                if (!clip) continue;
                div.style.left = tickToX(clip.start) + 'px';
                div.style.width = Math.max(10, (clip.duration / TPS) * state.view.pxPerSec) + 'px';
                const len = div.querySelector('.len');
                if (len) len.textContent = (clip.duration / TPS).toFixed(1) + 's';
            }
        }
    }

    // clip de V2: trigger de cara/cabeza con duración editable (como un clip
    // de V1: arrastrable, grips para trim, click derecho borra)
    function renderTriggerClip(t, i) {
        const isHead = t.type === 'head';
        const div = el('div', 'mft-clip face-clip' + (isHead ? ' head' : ''));
        div.dataset.tri = i;
        div.style.left = tickToX(t.tick) + 'px';
        div.style.width = Math.max(8, ((t.durationTicks || TPS) / TPS) * state.view.pxPerSec) + 'px';
        div.innerHTML = `
            <div class="grip l" data-edge="l"></div>
            <span class="name">${isHead ? '🎨' : '😄'} ${t.face}</span>
            <span class="len">${((t.durationTicks || TPS) / TPS).toFixed(1)}s</span>
            <div class="grip r" data-edge="r"></div>
        `;
        div.title = `${isHead ? 'Preset de cabeza' : 'Cara: ' + t.face}\n` +
            `Inicio: ${(t.tick / TPS).toFixed(2)}s · Duración: ${((t.durationTicks || TPS) / TPS).toFixed(2)}s\n` +
            `Arrastra para mover · grips para duración · click derecho = borrar`;

        div.addEventListener('mousedown', (ev) => {
            if (ev.button !== 0) return;
            ev.stopPropagation();
            const FS = window.MF_FaceSwap;
            if (!FS) return;
            const edge = ev.target.dataset?.edge || null;
            const startX = ev.clientX;
            const orig = { tick: t.tick, duration: t.durationTicks || TPS };
            // durante el drag referenciamos el trigger por OBJETO, no índice:
            // updateTrigger hace sort y el índice podría cambiar de dueño
            const patch = (p) => {
                const idx = FS.triggers.indexOf(t);
                if (idx >= 0) FS.updateTrigger(idx, p);
            };

            const mv = (e) => {
                const dxTick = (e.clientX - startX) / state.view.pxPerSec * TPS;
                if (!edge) {
                    patch({ tick: Math.max(0, orig.tick + dxTick) });
                } else if (edge === 'l') {
                    const ns = Math.max(0, Math.min(orig.tick + dxTick, orig.tick + orig.duration - TPS / 2));
                    const nd = Math.max(TPS / 2, orig.tick + orig.duration - ns);
                    patch({ tick: ns, durationTicks: nd });
                } else {
                    patch({ durationTicks: Math.max(TPS / 2, orig.duration + dxTick) });
                }
                updateClipStyles();
            };
            const up = () => {
                window.removeEventListener('mousemove', mv);
                window.removeEventListener('mouseup', up);
                // resolver solapamientos SOLO al soltar (no durante el drag)
                try { FS.resolveOverlaps?.(); } catch {}
                render(); // re-render al soltar (reordena índices tras el sort)
                state.onChange?.('clips-changed', null);
            };
            window.addEventListener('mousemove', mv);
            window.addEventListener('mouseup', up);
        });

        // click derecho: borrar el trigger
        div.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            window.MF_FaceSwap?.removeTrigger(i);
            render();
            state.onChange?.('clips-changed', null);
        });

        // doble click: aplicar ya (preview inmediato)
        div.addEventListener('dblclick', (ev) => {
            ev.stopPropagation();
            if (t.type === 'head') window.MF_SkinEditor?.applyPreset?.(t.face);
            else { try { window.MF_FaceSwap?.preview?.(t.face); } catch {} }
        });
        return div;
    }

    function renderClip(clip) {
        const div = el('div', 'mft-clip' + (clip.selected ? ' selected' : ''));
        div.dataset.id = clip.id;
        const x = tickToX(clip.start);
        const w = (clip.duration / TPS) * state.view.pxPerSec;
        div.style.left = x + 'px';
        div.style.width = Math.max(10, w) + 'px';
        div.innerHTML = `
            <div class="grip l" data-edge="l"></div>
            <span class="name">${clip.film.name}</span>
            <span class="len">${(clip.duration / TPS).toFixed(1)}s</span>
            <div class="grip r" data-edge="r"></div>
        `;

        div.addEventListener('mousedown', (ev) => {
            if (ev.button !== 0) return;
            ev.stopPropagation();
            if (!ev.shiftKey && !clip.selected) clearSelection();
            clip.selected = true;
            state.selection.add(clip.id);
            render();

            const edge = ev.target.dataset?.edge || null;
            const startX = ev.clientX;
            const orig = { start: clip.start, duration: clip.duration };
            let moved = false;

            const mv = (e) => {
                const snapOff = e.altKey; // Alt durante el drag = sin snap
                const dxTick = (e.clientX - startX) / state.view.pxPerSec * TPS;
                if (Math.abs(e.clientX - startX) > 2) moved = true;
                if (!edge) {
                    clip.start = snapCandidate(orig.start + dxTick, clip.id, snapOff);
                } else if (edge === 'l') {
                    const ns = Math.min(snapCandidate(orig.start + dxTick, clip.id, snapOff), orig.start + orig.duration - TPS / 2);
                    clip.start = Math.max(0, ns);
                    clip.duration = Math.max(TPS / 2, Math.round(orig.start + orig.duration - clip.start));
                } else {
                    const ne = snapCandidate(orig.start + orig.duration + dxTick, clip.id, snapOff);
                    clip.duration = Math.max(TPS / 2, Math.round(ne - clip.start));
                }
                updateClipStyles(); // render barato: no reconstruir DOM
            };
            const up = () => {
                window.removeEventListener('mousemove', mv);
                window.removeEventListener('mouseup', up);
                if (moved) state.onChange?.('clip-moved', clip.id);
                recomputeSeqDuration();
                render(); // re-render completo solo al soltar
            };
            window.addEventListener('mousemove', mv);
            window.addEventListener('mouseup', up);
        });

        // doble click: abrir la toma en el Studio
        div.addEventListener('dblclick', () => state.onChange?.('clip-open', clip.film.name));

        return div;
    }

    function drawRuler() {
        const { ruler, rulerCanvas } = state.els;
        if (!ruler || !rulerCanvas) return;
        const w = ruler.clientWidth || 800, h = ruler.clientHeight || 28;
        rulerCanvas.width = w * devicePixelRatio;
        rulerCanvas.height = h * devicePixelRatio;
        const ctx = rulerCanvas.getContext('2d');
        ctx.scale(devicePixelRatio, devicePixelRatio);
        ctx.clearRect(0, 0, w, h);

        // paso de marcas adaptativo al zoom (1s dibuja ~50px)
        const pxPerSec = state.view.pxPerSec;
        let stepSec = 1;
        while (stepSec * pxPerSec < 45) stepSec *= 2;
        while (stepSec * pxPerSec > 180) stepSec /= 2;

        const firstSec = Math.floor(state.view.scrollSec / stepSec) * stepSec;
        const lastSec = state.view.scrollSec + w / pxPerSec;

        ctx.font = '9px Consolas, monospace';
        for (let s = Math.max(0, firstSec); s <= lastSec; s += stepSec) {
            const x = secToX(s);
            if (x < -20 || x > w + 20) continue;
            ctx.strokeStyle = '#3a3a44';
            ctx.beginPath(); ctx.moveTo(x + .5, h - 10); ctx.lineTo(x + .5, h); ctx.stroke();
            ctx.fillStyle = '#8a8a96';
            const label = stepSec >= 1 ? (s % 1 === 0 ? s + 's' : s.toFixed(1) + 's') : s.toFixed(2) + 's';
            ctx.fillText(label, x + 3, 11);
            // sub-marcas (5 por paso)
            if (stepSec * pxPerSec > 90) {
                ctx.strokeStyle = '#26262e';
                for (let i = 1; i < 5; i++) {
                    const sx = secToX(s + stepSec * i / 5);
                    ctx.beginPath(); ctx.moveTo(sx + .5, h - 5); ctx.lineTo(sx + .5, h); ctx.stroke();
                }
            }
        }

        // banda del rango In/Out (estilo Resolve): franja + llaves en la regla
        const r = window.MF_Film?.getPlayRange?.();
        if (r && (r.from != null || r.to != null)) {
            const TPS = 20;
            const fromX = r.from != null ? secToX(r.from / TPS) : 0;
            const toX = r.to != null ? secToX(r.to / TPS) : w;
            // franja entre In y Out
            ctx.fillStyle = 'rgba(60, 170, 90, .18)';
            ctx.fillRect(fromX, 0, Math.max(0, toX - fromX), h);
            // llaves
            ctx.fillStyle = '#3caa5a';
            ctx.fillRect(fromX - 1, 0, 2, h);
            ctx.fillRect(toX - 1, 0, 2, h);
            // trazos en forma de llave { }
            ctx.strokeStyle = '#3caa5a';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(fromX - 4, h - 8); ctx.lineTo(fromX, h - 4); ctx.lineTo(fromX + 4, h - 8); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(toX - 4, h - 8); ctx.lineTo(toX, h - 4); ctx.lineTo(toX + 4, h - 8); ctx.stroke();
            ctx.lineWidth = 1;
        }
    }

    function updatePlayhead() {
        const { playhead, root } = state.els;
        if (!playhead || !root) return;
        playhead.style.left = tickToX(state.playheadTick) + 'px';
    }

    function updateInfo() {
        const info = state.els.tb?.querySelector('#mft-info');
        const zoomInd = state.els.tb?.querySelector('#mft-zoom-ind');
        if (info) info.textContent = `${state.clips.length} clips · ${(state.seqDuration / TPS).toFixed(1)}s`;
        if (zoomInd) zoomInd.textContent = Math.round(state.view.pxPerSec) + ' px/s';
    }

    // ── API pública ──
    window.MF_Timeline = {
        mount, render, fit,
        addClip, removeClip,
        clearSelection, deleteSelected,
        get clips() { return state.clips; },
        get playheadTick() { return state.playheadTick; },
        set playheadTick(t) { state.playheadTick = Math.max(0, t); updatePlayhead(); },
        get seqDuration() { recomputeSeqDuration(); return state.seqDuration; },
        get view() { return state.view; }
    };
    window.__MF_Timeline = true;

    console.log(TAG + ' cargado');
})();
