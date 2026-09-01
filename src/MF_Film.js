// MF_Film.js — Film mode estilo BBS (Fase 1 del plan): recorder de acciones
// del jugador a 20Hz + playback mediante actores puppet visuales.
//
// Conceptos (reimplementados, no portados de BBS):
// - TICKS de 20Hz fijos (50ms) como unidad de tiempo → determinismo entre
//   sesiones/FPS. Nunca se graba por frame.
// - Delta encoding: solo se guarda un keyframe si algo cambió respecto al
//   anterior; el playback interpola (lerp para pos, slerp-ish para yaw).
// - Actor puppet: entidad client-side (patrón MF_Peer/Verity) que en cada
//   tick se mueve a la posición grabada y reproduce las rotaciones de joints
//   (verificado por Emotes.js: el juego NO resetea joints).
//
// Formato .mffilm.json:
// {
//   "version": 1, "name": "...", "fps": 20, "durationTicks": N,
//   "recordedAt": 12345, "server": "survival",
//   "actors": [{
//     "id": "actor-1", "skin": "EstebanGrp_",
//     "frames": [ { "t":0, "p":[x,y,z], "yaw":0, "pitch":0,
//                    "sneak":false, "sprint":false, "swing":0,
//                    "j": { "headPivot":[rx,ry,rz], ... } } ]
//   }]
// }
//
// Uso:
//   /film record            → empieza a grabar (tiempo real, 20Hz)
//   /film stop              → detiene y guarda en memoria (última toma)
//   /film save <nombre>     → persiste en localStorage
//   /film list              → tomas guardadas
//   /film play [nombre]     → reproduce con actor puppet
//   /film pause | stop      → control de playback
//   /film despawn           → quita los actores
//   /film export [nombre]   → descarga .mffilm.json
//   /film delete <nombre>   → borra una toma
//
// Integración futura (Fase 3): MF_FaceSwap.onTick(t) se llama cada tick de
// playback para que los triggers de cara se disparen en su punto del video.

(function () {
    'use strict';

    if (window.__MF_Film) return;
    const TAG = '[MF Film]';

    const TPS = 20;               // ticks por segundo (convención MC/BBS)
    const TICK_MS = 1000 / TPS;
    const JOINT_NAMES = [         // joints del modelo del jugador (Emotes.js)
        'headPivot', 'body', 'skeleton',
        'leftShoulderJoint', 'leftElbowJoint',
        'rightShoulderJoint', 'rightElbowJoint',
        'leftHipJoint', 'leftKneeJoint',
        'rightHipJoint', 'rightKneeJoint'
    ];
    // skeleton solo posición (es la raíz global), nunca rotación (Emotes.js)
    const POS_ONLY_JOINTS = new Set(['skeleton']);
    const EPS = 1e-4;             // umbral de cambio para delta encoding
    const LS_KEY = 'minifeather_films_v1';
    const LS_LIMIT = 45 * 1024 * 1024; // ~45MB de tomas

    const state = {
        // recorder
        recording: false,
        recStart: 0,              // performance.now() del tick 0
        recTick: 0,
        recTimer: null,
        frames: [],
        lastFrame: null,
        droppedTicks: 0,
        // playback
        playing: false,
        paused: false,
        playStart: 0,             // performance.now() al reanudar
        playTickBase: 0,          // tick acumulado al pausar
        playRange: null,          // {from,to} en ticks — rango In/Out (null = toda la toma)
        playRaf: null,
        playFilm: null,
        playMode: 'film',         // 'film' (una toma) | 'sequence' (clips del timeline)
        playSeq: null,            // items de la secuencia en reproducción
        // actores spawneados
        actors: new Map(),        // actorId -> { recId, entry, lastTick }
        // tomas guardadas (localStorage)
        films: null
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

    // Entidad del jugador local con mesh visible (patrón Emotes.js)
    function getLocalPlayerEntity(game) {
        const me = game?.player;
        if (!me) return null;
        try { const e = game.world?.getPlayerById?.(me.id); if (e?.mesh) return e; } catch {}
        try { const e = game.world?.players?.get?.(me.id); if (e?.mesh) return e; } catch {}
        try { const e = game.world?.entities?.get?.(me.id); if (e?.mesh) return e; } catch {}
        try {
            const ents = game.world?.entities;
            if (ents?.values) {
                for (const e of ents.values()) {
                    if (e?.uuid === me.uuid || e?.id === me.id) return e;
                }
            }
        } catch {}
        return me?.mesh ? me : null;
    }

    // BFS de joints sobre el mesh (patrón VanillaAnimations/Emotes)
    function findJoint(mesh, name) {
        if (!mesh) return null;
        if (mesh[name] && mesh[name].rotation) return mesh[name];
        const queue = [mesh];
        const seen = new WeakSet();
        let visited = 0;
        while (queue.length && visited < 500) {
            const obj = queue.shift();
            if (!obj || typeof obj !== 'object' || seen.has(obj)) continue;
            seen.add(obj);
            visited++;
            if (obj[name] && obj[name].rotation) return obj[name];
            if (Array.isArray(obj.children)) {
                for (const child of obj.children) queue.push(child);
            }
        }
        return null;
    }

    // ── RECORDER ──

    function captureFrame(ent, tick) {
        const mesh = ent?.mesh;
        const pos = ent?.pos || mesh?.position;
        if (!pos) return null;

        const frame = {
            t: tick,
            p: [+pos.x || 0, +pos.y || 0, +pos.z || 0],
            yaw: +ent?.yaw || 0,
            pitch: +ent?.pitch || 0,
            sneak: !!ent?.sneaking,
            sprint: !!ent?.sprinting
        };

        // joints: solo los que existen en este mesh
        if (mesh) {
            const j = {};
            for (const name of JOINT_NAMES) {
                const joint = findJoint(mesh, name);
                if (!joint) continue;
                if (POS_ONLY_JOINTS.has(name)) {
                    j[name] = [joint.position.x, joint.position.y, joint.position.z];
                } else {
                    const r = joint.rotation;
                    j[name] = [r.x, r.y, r.z];
                }
            }
            frame.j = j;
        }
        return frame;
    }

    // delta encoding: true si el frame aporta información nueva
    function frameDiffers(a, b) {
        if (!a) return true;
        if (Math.abs(a.yaw - b.yaw) > EPS || Math.abs(a.pitch - b.pitch) > EPS) return true;
        if (a.sneak !== b.sneak || a.sprint !== b.sprint) return true;
        for (let i = 0; i < 3; i++) if (Math.abs(a.p[i] - b.p[i]) > EPS) return true;
        const ja = a.j || {}, jb = b.j || {};
        for (const k in jb) {
            const va = ja[k];
            if (!va) return true;
            for (let i = 0; i < 3; i++) if (Math.abs(va[i] - jb[k][i]) > EPS) return true;
        }
        return false;
    }

    function recorderTick() {
        const game = getGame();
        const ent = getLocalPlayerEntity(game);
        if (!ent) return; // sin entidad un instante → no abortar la toma

        const now = performance.now();
        // ticks esperados vs reales: si el timer se retrasó (pestaña en
        // background, GC), contar el hueco para diagnóstico
        const expected = Math.floor((now - state.recStart) / TICK_MS);
        if (expected > state.recTick + 1) {
            state.droppedTicks += expected - state.recTick - 1;
        }
        state.recTick = expected;

        const frame = captureFrame(ent, state.recTick);
        if (frame && frameDiffers(state.lastFrame, frame)) {
            state.frames.push(frame);
            state.lastFrame = frame;
        }
    }

    function startRecording() {
        if (state.recording) return { ok: false, error: 'ya está grabando' };
        const game = getGame();
        const ent = getLocalPlayerEntity(game);
        if (!ent) return { ok: false, error: 'jugador/mesh no disponible (¿estás en partida?)' };
        state.recording = true;
        state.recStart = performance.now();
        state.recTick = 0;
        state.frames = [];
        state.lastFrame = null;
        state.droppedTicks = 0;
        state.recTimer = setInterval(recorderTick, TICK_MS);
        return { ok: true, fromTick: 0 };
    }

    function stopRecording() {
        if (!state.recording) return { ok: false, error: 'no está grabando' };
        clearInterval(state.recTimer);
        state.recTimer = null;
        state.recording = false;
        // asegurar el frame final aunque no cambie (cierre limpio)
        state.frames.push({ ...(state.lastFrame || { t: state.recTick, p: [0, 0, 0] }), t: state.recTick });
        return {
            ok: true,
            keyframes: state.frames.length,
            ticks: state.recTick,
            droppedTicks: state.droppedTicks
        };
    }

    // ── PERSISTENCIA (localStorage) ──

    function loadFilms() {
        if (state.films) return state.films;
        try { state.films = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { state.films = {}; }
        return state.films;
    }

    function persistFilms() {
        try {
            const json = JSON.stringify(state.films);
            if (json.length > LS_LIMIT) return { ok: false, error: 'límite de almacenamiento (' + (LS_LIMIT / 1048576).toFixed(0) + 'MB) alcanzado: exporta y borra tomas viejas' };
            localStorage.setItem(LS_KEY, json);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: 'no se pudo guardar (¿quota?): ' + (e?.message || e) };
        }
    }

    function currentTakeAsFilm(name) {
        const game = getGame();
        return {
            version: 1,
            name: name || ('toma-' + new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')),
            fps: TPS,
            durationTicks: state.recTick,
            recordedAt: Date.now(),
            server: (game?.server || '').toString().slice(0, 64) || null,
            actors: [{
                id: 'actor-1',
                // skin por defecto: la del jugador local si es accesible, si no null
                skin: game?.player?.profile?.username || null,
                frames: state.frames
            }]
        };
    }

    function saveFilm(name) {
        if (!state.frames.length) return { ok: false, error: 'no hay toma en memoria (graba primero)' };
        const films = loadFilms();
        const film = currentTakeAsFilm(name);
        films[film.name] = film;
        state.films = films;
        const r = persistFilms();
        return r.ok ? { ok: true, name: film.name, keyframes: film.actors[0].frames.length, ticks: film.durationTicks } : r;
    }

    function deleteFilm(name) {
        const films = loadFilms();
        if (!(name in films)) return { ok: false, error: 'no existe "' + name + '"' };
        delete films[name];
        state.films = films;
        const r = persistFilms();
        return r.ok ? { ok: true } : r;
    }

    function exportFilm(name) {
        const films = loadFilms();
        const film = name ? films[name] : (state.frames.length ? currentTakeAsFilm(name) : null);
        if (!film) return { ok: false, error: 'toma no encontrada (ni en memoria ni guardada)' };
        const blob = new Blob([JSON.stringify(film)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (film.name || 'film') + '.mffilm.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        return { ok: true, name: film.name };
    }

    // importar un .mffilm.json exportado (para el Media Pool del Studio)
    function importFilm(name, data) {
        if (!data || typeof data !== 'object') return { ok: false, error: 'datos inválidos' };
        if (!Array.isArray(data.actors) || !data.actors.length) {
            return { ok: false, error: 'formato .mffilm.json no reconocido (sin actors)' };
        }
        const films = loadFilms();
        const finalName = name || data.name || ('importado-' + Date.now());
        const film = {
            ...data,
            name: finalName,
            version: data.version || 1,
            durationTicks: data.durationTicks || data.actors[0]?.frames?.length || 0
        };
        films[finalName] = film;
        state.films = films;
        const r = persistFilms();
        return r.ok ? { ok: true, name: finalName, ticks: film.durationTicks } : r;
    }

    // ── ACTOR: clon del mesh 3D del jugador (skin y joints reales) ──

    // Clona el mesh del jugador local. mesh.clone(true) es profundo y
    // COMPARTE geometría/materiales/texturas → el clon conserva la skin
    // exacta sin duplicar memoria de GPU. Los joints (headPivot, hombros…)
    // quedan replicados con los mismos nombres → lo grabado aplica directo.
    function clonePlayerMesh() {
        const ent = getLocalPlayerEntity(getGame());
        const mesh = ent?.mesh;
        if (!mesh || typeof mesh.clone !== 'function') return null;
        try {
            const clone = mesh.clone(true);
            clone.traverse(o => {
                o.matrixAutoUpdate = true;
                o.frustumCulled = false; // siempre visible: es un actor de escena
            });
            return clone;
        } catch (e) {
            console.warn(TAG + ' clone del player fallo: ' + (e?.message || e));
            return null;
        }
    }

    function despawnOne(actorId) {
        const rec = state.actors.get(actorId);
        if (!rec) return;
        if (rec.isClone) {
            try { rec.root?.parent?.remove(rec.root); } catch {}
        } else {
            try { window.MF_CustomModels?.despawn?.(rec.cmId, true); } catch {}
        }
        state.actors.delete(actorId);
    }

    function spawnActor(actor) {
        const id = 'film_' + actor.id;
        const game = getGame();
        const scene = game?.gameScene?.scene;
        if (!scene) return null;
        const first = actor.frames[0];
        despawnOne(actor.id);

        // 1) preferido: clon del jugador real (misma skin + joints que lo grabado)
        const clone = clonePlayerMesh();
        if (clone) {
            clone.position.set(first.p[0], first.p[1], first.p[2]);
            clone.rotation.set(0, first.yaw || 0, 0);
            scene.add(clone);
            const rec = { root: clone, yaw: first.yaw || 0, isClone: true, cmId: id };
            state.actors.set(actor.id, rec);
            console.log(TAG + ' actor "' + id + '" = clon del jugador (skin real)');
            return rec;
        }

        // 2) fallback: CustomModels con modelo base (sin skin)
        const CM = window.MF_CustomModels;
        if (!CM?.spawn) return null;
        CM.spawn('verity_full_model.glb', first.p[0], first.p[1], first.p[2], {
            id,
            height: 1.8,
            followPlayer: false,
            puppet: true,
            lookAtPlayer: false
        });
        const rec = { root: null, yaw: first.yaw || 0, isClone: false, cmId: id };
        state.actors.set(actor.id, rec);
        return rec;
    }

    function ensureActor(film, actor) {
        let rec = state.actors.get(actor.id);
        if (!rec) rec = spawnActor(actor);
        if (!rec) return null;
        if (!rec.isClone) {
            // el root del custom llega async (carga del GLB): refrescar
            rec.root = window.MF_CustomModels?.getRecord?.(rec.cmId)?.root || rec.root || null;
        }
        return rec;
    }

    // Interpolación entre dos keyframes para el tick fraccional f (0..1)
    function sampleFrame(frames, tick) {
        // búsqueda binaria del keyframe <= tick
        let lo = 0, hi = frames.length - 1;
        if (tick <= frames[0].t) return { frame: frames[0], prev: frames[0], f: 0 };
        if (tick >= frames[hi].t) return { frame: frames[hi], prev: frames[hi], f: 0 };
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (frames[mid].t <= tick) lo = mid; else hi = mid;
        }
        const prev = frames[lo], next = frames[lo + 1];
        const span = next.t - prev.t || 1;
        return { frame: next, prev, f: Math.min(1, Math.max(0, (tick - prev.t) / span)) };
    }

    function lerp(a, b, f) { return a + (b - a) * f; }

    function shortestAngle(a, b) {
        let d = b - a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    function applyActorFrame(rec, actor, tick) {
        const root = rec.root;
        if (!root) return;
        const { prev, frame, f } = sampleFrame(actor.frames, tick);

        // posición interpolada
        root.position.set(lerp(prev.p[0], frame.p[0], f), lerp(prev.p[1], frame.p[1], f), lerp(prev.p[2], frame.p[2], f));
        // yaw por camino corto
        const yaw = prev.yaw + shortestAngle(prev.yaw, frame.yaw) * f;
        rec.yaw = yaw;
        root.rotation.y = yaw;

        // joints: en el clon comparten nombres con el original, aplica directo
        const ja = prev.j || {}, jb = frame.j || {};
        for (const name in jb) {
            const joint = findJoint(root, name);
            if (!joint) continue;
            const va = ja[name] || jb[name];
            if (POS_ONLY_JOINTS.has(name)) {
                joint.position.set(lerp(va[0], jb[name][0], f), lerp(va[1], jb[name][1], f), lerp(va[2], jb[name][2], f));
            } else {
                const pitch = lerp(va[0], jb[name][0], f);
                const jyaw = va[1] + shortestAngle(va[1], jb[name][1]) * f;
                const roll = lerp(va[2], jb[name][2], f);
                joint.rotation.set(pitch, jyaw, roll);
            }
        }
    }

    function playbackLoop() {
        if (!state.playing || state.paused) return;
        const film = state.playFilm;
        if (!film) { stopPlayback(); return; }

        const tick = state.playTickBase + (performance.now() - state.playStart) / TICK_MS;
        // rango de reproducción (In/Out): si hay out-point, parar ahí
        const endTick = state.playRange.to ?? film.durationTicks;
        const startTick = state.playRange.from ?? 0;

        if (tick >= endTick) {
            // fin: congelar en el out-point y parar
            for (const actor of film.actors) {
                const rec = ensureActor(film, actor);
                if (rec) applyActorFrame(rec, actor, endTick);
            }
            stopPlayback();
            window.dispatchEvent(new CustomEvent('mf:film-ended', { detail: { atTick: Math.floor(endTick) } }));
            return;
        }

        for (const actor of film.actors) {
            const rec = ensureActor(film, actor);
            if (rec) applyActorFrame(rec, actor, tick);
        }

        // triggers de face-swap y futuros eventos del timeline (Fase 3)
        const intTick = Math.floor(tick);
        if (window.MF_FaceSwap && intTick !== state.lastFaceTick) {
            state.lastFaceTick = intTick;
            try { window.MF_FaceSwap.onTick(intTick); } catch {}
        }

        state.playRaf = requestAnimationFrame(playbackLoop);
    }

    // definir/consultar el rango In/Out para la próxima reproducción
    function setPlayRange(from, to) {
        if (from == null && to == null) { state.playRange = null; return { ok: true, range: null }; }
        state.playRange = {
            from: from != null ? Math.max(0, from) : 0,
            to: to != null ? Math.max(1, to) : null
        };
        return { ok: true, range: { ...state.playRange } };
    }
    function getPlayRange() { return state.playRange ? { ...state.playRange } : null; }

    function playFilm(name, range) {
        if (state.playing) stopPlayback();
        const films = loadFilms();
        const film = name
            ? films[name] || null
            : (state.frames.length ? currentTakeAsFilm(null) : null);
        if (!film) return { ok: false, error: 'toma no encontrada (graba o indica nombre de /film list)' };

        // rango In/Out: clamped a la duración de la toma, from < to
        let r = range || state.playRange;
        if (r && typeof r === 'object') {
            const from = Math.max(0, Math.min(r.from ?? 0, film.durationTicks - 1));
            const to = Math.max(from + 1, Math.min(r.to ?? film.durationTicks, film.durationTicks));
            r = { from, to };
        } else r = null;
        state.playRange = r;

        state.playing = true;
        state.paused = false;
        state.playFilm = film;
        state.playTickBase = r ? r.from : 0;
        state.playStart = performance.now();
        state.lastFaceTick = -1;

        // triggers listos para una nueva reproducción
        try { window.MF_FaceSwap?.resetForPlayback?.(); } catch {}

        // triggers de cara/cabeza antes del In-point: marcarlos como ya
        // consumidos para que no se disparen todos de golpe al arrancar
        if (r && window.MF_FaceSwap?.skipBefore) {
            try { window.MF_FaceSwap.skipBefore(r.from); } catch {}
        }

        // Desactivar emotes activos para que no peleen por los joints del
        // jugador local (los actores usan sus propios meshes, pero el emote
        // del player podría confundirse visualmente en escena)
        try { window.MF_Emotes?.stop?.(); } catch {}

        state.playRaf = requestAnimationFrame(playbackLoop);
        return { ok: true, name: film.name, ticks: film.durationTicks, actors: film.actors.length };
    }

    // ── Reproducción de SECUENCIA (los clips del timeline) ──
    // Un "clip" = { filmName, start (tick global), duration }.
    // Reproduce los clips en orden usando el tick global como reloj.
    function playSequence(clips) {
        if (state.playing) stopPlayback();
        if (!Array.isArray(clips) || !clips.length) {
            return { ok: false, error: 'la secuencia está vacía — arrastra tomas al timeline' };
        }
        const films = loadFilms();
        // resolver films y resolver solapamientos en una misma "pista virtual"
        const items = [];
        for (const c of clips) {
            const film = films[c.filmName];
            if (!film) continue;
            items.push({
                film,
                start: Math.max(0, c.start),
                duration: Math.max(1, Math.min(c.duration, film.durationTicks))
            });
        }
        if (!items.length) return { ok: false, error: 'ningún clip del timeline existe en la biblioteca' };
        items.sort((a, b) => a.start - b.start);

        state.playing = true;
        state.paused = false;
        state.playMode = 'sequence';
        state.playSeq = items;
        state.playFilm = null; // modo secuencia no usa playFilm directo
        state.playTickBase = 0;
        state.playStart = performance.now();
        state.lastFaceTick = -1;

        // triggers listos para una nueva reproducción
        try { window.MF_FaceSwap?.resetForPlayback?.(); } catch {}

        // respetar el In/Out del estudio si está definido (y saltar triggers previos)
        if (state.playRange?.from) {
            state.playTickBase = Math.min(state.playRange.from, seqTotalTicks(items) - 1);
            try { window.MF_FaceSwap?.skipBefore?.(state.playTickBase); } catch {}
        }

        try { window.MF_Emotes?.stop?.(); } catch {}
        state.playRaf = requestAnimationFrame(sequenceLoop);
        return { ok: true, clips: items.length, ticks: seqTotalTicks(items) };
    }

    function seqTotalTicks(items) {
        return items.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    }

    function sequenceLoop() {
        if (!state.playing || state.paused || state.playMode !== 'sequence') return;
        const items = state.playSeq;
        if (!items?.length) { stopPlayback(); return; }

        let tick = state.playTickBase + (performance.now() - state.playStart) / TICK_MS;
        const total = seqTotalTicks(items);
        const endTick = state.playRange?.to ?? total;

        if (tick >= endTick) {
            // fin: congelar en el out/fin y parar
            applySeqFrame(items, endTick);
            stopPlayback();
            window.dispatchEvent(new CustomEvent('mf:film-ended', { detail: { atTick: Math.floor(endTick) } }));
            return;
        }

        applySeqFrame(items, tick);

        // triggers de V2 con el tick global de la secuencia
        const intTick = Math.floor(tick);
        if (window.MF_FaceSwap && intTick !== state.lastFaceTick) {
            state.lastFaceTick = intTick;
            try { window.MF_FaceSwap.onTick(intTick); } catch {}
        }

        state.playRaf = requestAnimationFrame(sequenceLoop);
    }

    // aplica a cada actor todos los clips activos en el tick global dado
    function applySeqFrame(items, tick) {
        for (const it of items) {
            const localTick = tick - it.start;
            const active = localTick >= 0 && localTick < it.duration;
            if (!active) continue;
            for (const actor of it.film.actors) {
                const rec = ensureActor(it.film, actor);
                if (rec) applyActorFrame(rec, actor, localTick);
            }
        }
    }

    function pausePlayback() {
        if (!state.playing || state.paused) return { ok: false, error: 'no está reproduciendo' };
        state.paused = true;
        state.playTickBase += (performance.now() - state.playStart) / TICK_MS;
        cancelAnimationFrame(state.playRaf);
        return { ok: true, atTick: Math.floor(state.playTickBase) };
    }

    function resumePlayback() {
        if (!state.playing || !state.paused) return { ok: false, error: 'no está pausado' };
        state.paused = false;
        state.playStart = performance.now();
        // reanudar el loop del modo activo (film o secuencia)
        state.playRaf = requestAnimationFrame(state.playMode === 'sequence' ? sequenceLoop : playbackLoop);
        return { ok: true };
    }

    function stopPlayback() {
        if (state.playRaf) cancelAnimationFrame(state.playRaf);
        state.playRaf = null;
        state.playing = false;
        state.paused = false;
        state.playMode = 'film';
        state.playFilm = null;
        state.playSeq = null;
        return { ok: true };
    }

    function despawnActors() {
        for (const actorId of [...state.actors.keys()]) despawnOne(actorId);
        state.actors.clear();
        return { ok: true };
    }

    // ── DIAGNÓSTICO ──
    function diag() {
        const game = getGame();
        const ent = getLocalPlayerEntity(game);
        const mesh = ent?.mesh;
        const joints = {};
        if (mesh) for (const n of JOINT_NAMES) joints[n] = !!findJoint(mesh, n);
        return {
            game: !!game, playerEntity: !!ent, mesh: !!mesh,
            joints,
            recording: state.recording,
            framesInMemory: state.frames.length,
            playing: state.playing, paused: state.paused,
            actorsSpawned: state.actors.size,
            savedFilms: Object.keys(loadFilms()).length
        };
    }

    // ── API pública ──
    window.MF_Film = {
        startRecording, stopRecording,
        saveFilm, deleteFilm, exportFilm, importFilm,
        playFilm, playSequence, pausePlayback, resumePlayback, stopPlayback,
        setPlayRange, getPlayRange, despawnActors,
        diag,
        listFilms() { return Object.keys(loadFilms()); },
        get status() {
            return {
                recording: state.recording,
                playing: state.playing,
                paused: state.paused,
                tick: state.playing ? Math.floor(state.playTickBase + (performance.now() - state.playStart) / TICK_MS) : null,
                frames: state.frames.length,
                actors: state.actors.size
            };
        }
    };
    window.__MF_Film = true;

    // Bridge de config desde content.js (mundo ISOLATED)
    document.addEventListener('minifeather:film-config', (e) => {
        try {
            const cfg = JSON.parse(e.detail);
            if (cfg.action === 'stopPlayback') stopPlayback();
            if (cfg.action === 'despawnActors') despawnActors();
        } catch {}
    }, true);

    // Reporte de estado para el GUI (dashboard de film)
    document.addEventListener('minifeather:film-state-request', () => {
        try {
            document.dispatchEvent(new CustomEvent('minifeather:film-state', {
                detail: JSON.stringify(window.MF_Film.status)
            }));
        } catch {}
    }, true);

    console.log(TAG + ' listo (Fase 1: recorder + actor puppet). /film record para empezar.');
})();
