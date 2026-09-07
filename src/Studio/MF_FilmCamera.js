// MF_FilmCamera — clips de cámara cinematográfica estilo BBS (Fase 2)
// ============================================================
// Reimplementa el modelo de clips de cámara del mod BBS sobre el pipeline
// de miniblox. NO se porta código Java: son conceptos reimplementados.
//
// Modelo (como BBS):
//   - Cada clip: { id, type, title, start (tick), duration (ticks),
//     enabled, layer, env:{fi,fo}, props }
//   - layer 0 = clips que PISAN la posición (idle/keyframe/path/dolly/orbit)
//   - layers > 0 = MODIFICADORES apilados (look/shake/translate)
//   - subtitle/audio no mueven cámara (capas altas)
//   - Todo en ticks de 20Hz (como el resto del studio)
//
// Tipos (subconjunto de BBS con paridad funcional):
//   idle      → cámara fija (una pose)
//   keyframe  → keyframes {t, x,y,z,yaw,pitch,roll,fov}
//   path      → waypoints interpolados (hermite/linear/step)
//   dolly     → desplazamiento en la dirección de mirada
//   orbit     → órbita alrededor de un punto
//   look      → apunta hacia un punto (modificador)
//   shake     → sacudida sin/cos con máscara (modificador)
//   translate → offset fijo (modificador)
//   subtitle  → texto en pantalla con fade por envelope
//   audio     → reproduce audio (dataURL/url) con offset
//
// Evaluación: evalLayered(tick) → pose {x,y,z,yaw,pitch,roll,fov}
//   aplicada por el Studio sobre su cámara durante el playback.
// (IIFE con guard, patrón del resto del cliente)

(function () {
    'use strict';
    if (window.__MF_FILMCAMERA__) return;
    window.__MF_FILMCAMERA__ = true;

    const TAG = '[MF_FilmCamera]';
    const TPS = 20;
    const LS_KEY = 'minifeather_filmcamera_v1';

    // ── Estado ────────────────────────────────────────────────
    const state = {
        clips: [],
        selectedId: null,
        // runtime audio
        audioEls: new Map(),   // clipId -> HTMLAudioElement
        // runtime subtítulo (el studio lo pinta)
        subtitle: null,        // { text, size, x, y, color, background, alpha }
    };

    // ── Utilidades ────────────────────────────────────────────
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function hermite(t) { return t * t * (3 - 2 * t); }
    function shortestAngle(a, b) {
        let d = (b - a) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        return d;
    }
    function ease(kind, t) {
        t = clamp(t, 0, 1);
        switch (kind) {
            case 'linear': return t;
            case 'step': return t < 1 ? 0 : 1;
            case 'easeIn': return t * t;
            case 'easeOut': return 1 - (1 - t) * (1 - t);
            default: return hermite(t); // 'ease'
        }
    }
    // envolvente de fade del clip (0..1) — como el envelope de BBS
    function envelope(c, local) {
        const fi = Number(c.env?.fi) || 0, fo = Number(c.env?.fo) || 0;
        if (fi > 0 && local < fi) return clamp(local / fi, 0, 1);
        if (fo > 0 && local > c.duration - fo) return clamp((c.duration - local) / fo, 0, 1);
        return 1;
    }
    const uid = () => 'cam-' + Math.random().toString(36).slice(2, 8);
    function clone(o) { return JSON.parse(JSON.stringify(o ?? {})); }

    // ── Definición de tipos (paridad con BBS) ──────────────────
    const TYPES = {
        idle: {
            label: 'Fijo', icon: '🎥', overwrite: true, layer: 0,
            defaults: { pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 0 } },
        },
        keyframe: {
            label: 'Keyframes', icon: '🔡', overwrite: true, layer: 1,
            defaults: { keys: [{ t: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 0 },
                              { t: 20, x: 0, y: 0, z: 2, yaw: 0.5, pitch: 0, roll: 0, fov: 0 }], interp: 'ease' },
        },
        path: {
            label: 'Ruta', icon: '🛣️', overwrite: true, layer: 1,
            defaults: { points: [{ t: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 0 },
                                 { t: 40, x: 4, y: 0, z: 0, yaw: 1.2, pitch: 0, fov: 0 }], interp: 'hermite' },
        },
        dolly: {
            label: 'Dolly', icon: '🎯', overwrite: true, layer: 0,
            defaults: { pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 0 }, distance: 6, ease: 'ease' },
        },
        orbit: {
            label: 'Órbita', icon: '🪐', overwrite: true, layer: 1,
            defaults: { target: { x: 0, y: 0, z: 0 }, distance: 8, from: 0, to: 360, height: 2, pitch: 0.3, fov: 0, ease: 'ease' },
        },
        look: {
            label: 'Mirar a', icon: '👁️', overwrite: false, layer: 3,
            defaults: { target: { x: 0, y: 0, z: 0 }, keepPos: true },
        },
        shake: {
            label: 'Sacudida', icon: '🌀', overwrite: false, layer: 4,
            defaults: { freq: 2, amount: 0.4, mask: { x: false, y: false, z: false, yaw: true, pitch: true, roll: false, fov: false } },
        },
        translate: {
            label: 'Offset', icon: '↔️', overwrite: false, layer: 5,
            defaults: { offset: { x: 0, y: 0, z: 0 }, addYaw: 0, addPitch: 0 },
        },
        subtitle: {
            label: 'Subtítulo', icon: '💬', overwrite: false, layer: 9,
            defaults: { text: 'Texto…', size: 20, x: 0.5, y: 0.85, color: '#ffffff', background: true },
        },
        audio: {
            label: 'Audio', icon: '🔊', overwrite: false, layer: 10,
            defaults: { src: '', volume: 1, offset: 0 },
        },
    };

    // ── Persistencia ───────────────────────────────────────────
    function loadClips() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return [];
            const data = JSON.parse(raw);
            return Array.isArray(data?.clips) ? data.clips.filter(c => TYPES[c?.type]) : [];
        } catch (e) { console.warn(TAG, 'loadClips:', e?.message || e); return []; }
    }
    function saveClips() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({ version: 1, clips: state.clips }));
        } catch (e) { console.warn(TAG, 'saveClips (¿lleno?):', e?.message || e); }
    }
    state.clips = loadClips();

    // ── CRUD ───────────────────────────────────────────────────
    function addClip(spec) {
        const type = String(spec?.type || 'idle');
        const T = TYPES[type];
        if (!T) throw new Error('tipo de clip desconocido: ' + type);
        const c = {
            id: uid(),
            type,
            title: spec.title || T.label,
            start: Math.max(0, Math.round(Number(spec.start) || 0)),
            duration: Math.max(1, Math.round(Number(spec.duration) || TPS)),
            enabled: spec.enabled !== false,
            layer: spec.layer != null ? Number(spec.layer) : T.layer,
            env: { fi: Math.max(0, Math.round(Number(spec.fadeIn) || 0)),
                   fo: Math.max(0, Math.round(Number(spec.fadeOut) || 0)) },
            props: clone(T.defaults),
        };
        if (spec.props) c.props = { ...c.props, ...clone(spec.props) };
        state.clips.push(c);
        saveClips();
        return c;
    }
    function removeClip(id) {
        const i = state.clips.findIndex(c => c.id === id);
        if (i === -1) return false;
        stopAudioFor(state.clips[i]);
        state.clips.splice(i, 1);
        if (state.selectedId === id) state.selectedId = null;
        saveClips();
        return true;
    }
    function updateClip(id, patch) {
        const c = state.clips.find(x => x.id === id);
        if (!c) return null;
        if (patch.start != null) c.start = Math.max(0, Math.round(patch.start));
        if (patch.duration != null) c.duration = Math.max(1, Math.round(patch.duration));
        if (patch.enabled != null) c.enabled = !!patch.enabled;
        if (patch.title != null) c.title = String(patch.title);
        if (patch.layer != null) c.layer = Math.max(0, Math.round(patch.layer));
        if (patch.fadeIn != null) c.env.fi = Math.max(0, Math.round(patch.fadeIn));
        if (patch.fadeOut != null) c.env.fo = Math.max(0, Math.round(patch.fadeOut));
        if (patch.props) c.props = { ...c.props, ...clone(patch.props) };
        saveClips();
        return c;
    }
    function getClip(id) { return state.clips.find(c => c.id === id) || null; }
    function clearAll() {
        for (const c of [...state.clips]) stopAudioFor(c);
        state.clips = [];
        state.selectedId = null;
        saveClips();
    }
    const byLayer = () => [...state.clips].sort((a, b) => (a.layer - b.layer) || (a.start - b.start));

    // ── Captura de la cámara del studio (para crear clips) ─────
    function studioPose() {
        // lee la pose actual de la cámara del studio si está activa;
        // si no, la del juego
        const S = window.MF_Studio;
        const pose = S?.getStudioCamPose?.();
        if (pose) return pose;
        try {
            const g = window.__MINIBLOX_GAME__ || window.miniblox;
            const cam = g?.gameScene?.camera || g?.camera;
            if (cam) {
                const p = cam.position;
                return { x: p.x, y: p.y, z: p.z, yaw: cam.rotation?.y || 0, pitch: cam.rotation?.x || 0, fov: cam.fov || 0 };
            }
        } catch {}
        return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 0 };
    }

    // crea un clip con la pose actual de la cámara del studio
    function addFromStudio(type, opts = {}) {
        const pose = studioPose();
        const c = addClip({ type, start: opts.start ?? 0, duration: opts.duration ?? TPS, title: opts.title });
        if (type === 'idle' || type === 'dolly') {
            c.props.pose = { ...pose };
        } else if (type === 'keyframe') {
            c.props.keys = [{ t: 0, ...pose, roll: 0 },
                            { t: c.duration, x: pose.x, y: pose.y, z: pose.z + 2, yaw: pose.yaw, pitch: pose.pitch, roll: 0, fov: pose.fov }];
        } else if (type === 'path') {
            c.props.points = [{ t: 0, ...pose },
                              { t: c.duration, x: pose.x + 4, y: pose.y, z: pose.z, yaw: pose.yaw, pitch: pose.pitch, fov: pose.fov }];
        } else if (type === 'orbit' || type === 'look') {
            // target: 4 bloques delante de la cámara
            const fx = pose.x - Math.sin(pose.yaw) * 4, fz = pose.z - Math.cos(pose.yaw) * 4;
            if (type === 'orbit') c.props.target = { x: fx, y: pose.y - 1, z: fz };
            else c.props.target = { x: fx, y: pose.y, z: fz };
        }
        saveClips();
        return c;
    }

    // añade un keyframe/waypoint en el tick local con la pose actual
    function addKeyAt(clipId, localTick) {
        const c = getClip(clipId);
        if (!c) return null;
        const pose = studioPose();
        if (c.type === 'keyframe') {
            c.props.keys.push({ t: Math.max(0, Math.round(localTick)), x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, pitch: pose.pitch, roll: 0, fov: pose.fov });
            c.props.keys.sort((a, b) => a.t - b.t);
        } else if (c.type === 'path') {
            c.props.points.push({ t: Math.max(0, Math.round(localTick)), x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, pitch: pose.pitch, fov: pose.fov });
            c.props.points.sort((a, b) => a.t - b.t);
        } else return null;
        saveClips();
        return c;
    }

    // ── Evaluación de cada tipo ────────────────────────────────
    // devuelve {x,y,z,yaw,pitch,roll,fov} parcial según tipo
    function evalClip(c, local, out) {
        const p = c.props;
        switch (c.type) {
            case 'idle': {
                out.x = p.pose.x; out.y = p.pose.y; out.z = p.pose.z;
                out.yaw = p.pose.yaw; out.pitch = p.pose.pitch;
                if (p.pose.fov) out.fov = p.pose.fov;
                break;
            }
            case 'dolly': {
                const t = ease(p.ease, clamp(local / Math.max(1, c.duration), 0, 1));
                const d = Number(p.distance) || 0;
                out.x = p.pose.x - Math.sin(p.pose.yaw) * d * t;
                out.y = p.pose.y - Math.tan(p.pose.pitch || 0) * d * t * 0 + p.pose.y * 0; // y fija (pitch no desplaza, solo ángulo)
                out.z = p.pose.z - Math.cos(p.pose.yaw) * d * t;
                out.yaw = p.pose.yaw; out.pitch = p.pose.pitch;
                if (p.pose.fov) out.fov = p.pose.fov;
                break;
            }
            case 'keyframe': {
                const r = sampleKeys(p.keys, local, p.interp);
                Object.assign(out, r);
                break;
            }
            case 'path': {
                const r = samplePoints(p.points, local, p.interp);
                Object.assign(out, r);
                break;
            }
            case 'orbit': {
                const t = ease(p.ease, clamp(local / Math.max(1, c.duration), 0, 1));
                const a0 = deg(p.from), a1 = deg(p.to);
                const ang = a0 + (a1 - a0) * t;
                const d = Number(p.distance) || 8, h = Number(p.height) || 0;
                out.x = p.target.x + Math.sin(ang) * d;
                out.z = p.target.z + Math.cos(ang) * d;
                out.y = p.target.y + h;
                // mirar al target
                const dx = p.target.x - out.x, dz = p.target.z - out.z, dy = p.target.y - out.y;
                out.yaw = Math.atan2(-dx, -dz);
                out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
                if (p.fov) out.fov = p.fov;
                break;
            }
            case 'look': {
                if (!out.hasPos) break; // necesita una pose base
                const dx = p.target.x - out.x, dy = p.target.y - out.y, dz = p.target.z - out.z;
                out.yaw = Math.atan2(-dx, -dz);
                out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
                break;
            }
            case 'shake': {
                const m = p.mask || {};
                const f = Number(p.freq) || 2, a = Number(p.amount) || 0.3;
                const s = Math.sin, cs = Math.cos, tt = local / TPS;
                if (m.x) out.x += s(tt * f * Math.PI * 2) * a;
                if (m.y) out.y += cs(tt * f * Math.PI * 2) * a;
                if (m.z) out.z += s(tt * f * Math.PI * 2 + 2.1) * a;
                if (m.yaw) out.yaw += s(tt * f * Math.PI * 2) * a * 0.5;
                if (m.pitch) out.pitch += cs(tt * f * Math.PI * 2) * a * 0.5;
                if (m.roll) out.roll += s(tt * f * Math.PI * 2 + 1.3) * a * 0.5;
                if (m.fov) out.fov = (out.fov || 0) + s(tt * f * Math.PI * 2) * a;
                break;
            }
            case 'translate': {
                out.x += Number(p.offset?.x) || 0;
                out.y += Number(p.offset?.y) || 0;
                out.z += Number(p.offset?.z) || 0;
                out.yaw += Number(p.addYaw) || 0;
                out.pitch += Number(p.addPitch) || 0;
                break;
            }
        }
    }
    const deg = d => (Number(d) || 0) * Math.PI / 180;

    function sampleKeys(keys, local, interp) {
        const out = {};
        if (!keys?.length) return out;
        const ks = keys; // ya vienen ordenados
        if (local <= ks[0].t) return { ...ks[0] };
        const last = ks[ks.length - 1];
        if (local >= last.t) {
            const { t, ...v } = last; return v;
        }
        let i = 0;
        while (i < ks.length - 1 && ks[i + 1].t <= local) i++;
        const a = ks[i], b = ks[i + 1];
        const raw = (local - a.t) / Math.max(1, b.t - a.t);
        const t = interp === 'linear' ? raw : ease(interp, raw);
        for (const ch of ['x', 'y', 'z', 'roll', 'fov']) out[ch] = lerp(a[ch] || 0, b[ch] || 0, t);
        out.yaw = a.yaw + shortestAngle(a.yaw || 0, b.yaw || 0) * t;
        out.pitch = lerp(a.pitch || 0, b.pitch || 0, t);
        return out;
    }
    function samplePoints(pts, local, interp) {
        const out = {};
        if (!pts?.length) return out;
        if (local <= pts[0].t) { const { t, ...v } = pts[0]; return v; }
        const last = pts[pts.length - 1];
        if (local >= last.t) { const { t, ...v } = last; return v; }
        let i = 0;
        while (i < pts.length - 1 && pts[i + 1].t <= local) i++;
        const a = pts[i], b = pts[i + 1];
        const raw = (local - a.t) / Math.max(1, b.t - a.t);
        const t = interp === 'linear' ? raw : ease(interp, raw);
        for (const ch of ['x', 'y', 'z', 'fov']) out[ch] = lerp(a[ch] || 0, b[ch] || 0, t);
        out.yaw = a.yaw + shortestAngle(a.yaw || 0, b.yaw || 0) * t;
        out.pitch = lerp(a.pitch || 0, b.pitch || 0, t);
        return out;
    }

    // ── Evaluación por capas (el corazón, como BBS) ────────────
    // devuelve pose {x,y,z,yaw,pitch,roll,fov,hasPos} o null si ningún
    // clip base está activo en ese tick
    function evalLayered(tick) {
        let out = null;
        for (const c of byLayer()) {
            if (!c.enabled) continue;
            const local = tick - c.start;
            if (local < 0 || local >= c.duration) continue;
            if (c.type === 'subtitle' || c.type === 'audio') continue; // aparte
            if (TYPES[c.type]?.overwrite) {
                // primer clip overwrite (capa más baja) activo = pose base
                if (!out) out = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 0, hasPos: true };
                const cur = { ...out };
                evalClip(c, local, cur);
                // el overwrite reemplaza lo que escribió
                const e = envelope(c, local);
                if (e >= 1) Object.assign(out, cur);
                else {
                    // durante el fade-in/out mezcla con la pose anterior
                    for (const k of ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'fov']) {
                        out[k] = lerp(out[k] || 0, cur[k] || 0, e);
                    }
                }
            } else if (out) {
                const cur = { ...out };
                evalClip(c, local, cur);
                Object.assign(out, cur);
            }
        }
        return out;
    }

    // ── Subtítulos y audio (evaluados aparte, por tick) ────────
    function evalSubtitles(tick) {
        let best = null;
        for (const c of state.clips) {
            if (c.type !== 'subtitle' || !c.enabled) continue;
            const local = tick - c.start;
            if (local < 0 || local >= c.duration) continue;
            const alpha = envelope(c, local);
            if (!best || alpha > best.alpha) best = { ...c.props, alpha, title: c.title, id: c.id };
        }
        state.subtitle = best;
        return best;
    }

    function stopAudioFor(c) {
        const el = state.audioEls.get(c?.id);
        if (el) { try { el.pause(); el.currentTime = 0; } catch {} state.audioEls.delete(c.id); }
    }
    function evalAudio(tick, playing) {
        for (const c of state.clips) {
            if (c.type !== 'audio' || !c.enabled) continue;
            const local = tick - c.start;
            const inWindow = local >= 0 && local < c.duration;
            let el = state.audioEls.get(c.id);
            if (inWindow && playing) {
                if (!el && c.props.src) {
                    el = new Audio(c.props.src);
                    el.volume = clamp(Number(c.props.volume) || 1, 0, 1);
                    el.loop = c.duration / TPS > (el.duration || 1e9);
                    state.audioEls.set(c.id, el);
                    const off = Number(c.props.offset) || 0;
                    try { if (off > 0) el.currentTime = off; } catch {}
                    el.play().catch(() => { state.audioEls.delete(c.id); });
                } else if (el && el.paused) el.play().catch(() => {});
            } else if (el && (!inWindow || !playing)) {
                if (!inWindow) stopAudioFor(c);
                else try { el.pause(); } catch {}
            }
        }
    }
    function stopAudio() { for (const c of [...state.clips]) stopAudioFor(c); }

    // tick maestro: lo llama el Studio/MF_Film durante playback
    function onTick(tick, playing = true) {
        const pose = evalLayered(tick);
        evalSubtitles(tick);
        evalAudio(tick, playing);
        return pose;
    }
    // evalúa UN clip aislado en su tiempo local (para el lienzo de
    // trayectoria del Studio: dibuja el recorrido de cada clip por separado)
    function evalClipOnly(c, local) {
        if (!c || !TYPES[c.type]) return null;
        const cur = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 0, hasPos: false };
        try { evalClip(c, Math.max(0, Math.min(c.duration, local)), cur); } catch {}
        return cur;
    }
    function reset() {
        stopAudio();
        state.subtitle = null;
    }

    // ── API pública ────────────────────────────────────────────
    window.MF_FilmCamera = {
        TPS,
        TYPES,          // {type: {label, icon, overwrite, layer, defaults}}
        add: addClip,
        addFromStudio,  // (type, {start,duration,title}) con pose actual
        addKeyAt,       // (clipId, localTick) añade waypoint con pose actual
        remove: removeClip,
        update: updateClip,
        get: getClip,
        clear: clearAll,
        byLayer,
        studioPose,     // pose actual (studio o juego)
        evalLayered,    // (tick) → {x,y,z,yaw,pitch,roll,fov,hasPos}|null
        evalClipOnly,   // (clip, localTick) → pose aislada de UN clip (lienzo)
        evalSubtitles,
        onTick,         // (tick, playing) → pose (audio+subs incluidos)
        reset,          // parar audio y limpiar runtime
        save: saveClips,
        select(id) { state.selectedId = id || null; },
        get clips() { return state.clips; },
        get selectedId() { return state.selectedId; },
        set selectedId(v) { state.selectedId = v; },
        get subtitle() { return state.subtitle; },
    };

    console.log(TAG + ' listo — clips de cámara estilo BBS (' + state.clips.length + ' clips)');
})();
