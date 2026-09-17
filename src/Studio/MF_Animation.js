
(function () {
    'use strict';

    if (window.__MF_Animation) return;
    const TAG = '[MF Anim]';
    const LS_KEY = 'minifeather_anims_v1';
    const CHANNELS = ['rotation', 'position', 'scale'];
    const MIRROR_PART = { leftArm: 'rightArm', rightArm: 'leftArm', leftLeg: 'rightLeg', rightLeg: 'leftLeg' };

    const MIRROR_SIGN = {
        rotation: [1, -1, -1], 
        position: [-1, 1, 1],
        scale: [1, 1, 1]
    };

    const state = {
        anims: null,          
        cur: null,            
        playing: false,
        t: 0,                 
        raf: 0,
        lastFrame: 0,
        fps: 60,              
        fpsClock: 0,          
        autoKey: true,
        mirror: true
    };

    function load() {
        if (state.anims) return state.anims;
        try { state.anims = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
        catch { state.anims = {}; }
        return state.anims;
    }

    function persist() {
        try { localStorage.setItem(LS_KEY, JSON.stringify(state.anims)); } catch {}
    }

    function cur() {
        const a = load();
        return state.cur ? a[state.cur] || null : null;
    }

    function create(name, len) {
        const a = load();
        a[name] = { length: len || 2, loop: true, interp: 'smooth', keys: {} };
        state.cur = name;
        persist();
        return { ok: true, name };
    }

    function open(name) {
        const a = load();
        if (!(name in a)) return { ok: false, error: 'anim "' + name + '" no existe' };
        stop();
        state.cur = name;
        state.t = 0;
        return { ok: true, name };
    }

    function del(name) {
        const a = load();
        if (!(name in a)) return { ok: false, error: 'no existe' };
        if (state.cur === name) { state.cur = null; state.playing = false; }
        delete a[name];
        persist();
        return { ok: true };
    }

    function list() { return Object.keys(load()); }

    function keysOf(part, channel, createIfMissing) {
        const a = cur();
        if (!a) return null;
        if (!a.keys[part]) {
            if (!createIfMissing) return null;
            a.keys[part] = {};
        }
        if (!a.keys[part][channel]) {
            if (!createIfMissing) return null;
            a.keys[part][channel] = [];
        }
        return a.keys[part][channel];
    }

    function setChannel(part, channel, t, value) {
        if (!CHANNELS.includes(channel)) throw new Error('canal: ' + channel + ' (usa ' + CHANNELS.join(', ') + ')');
        const arr = keysOf(part, channel, true);
        const v = [value[0] || 0, value[1] || 0, value[2] || 0];
        
        const existing = arr.find(k => Math.abs(k.t - t) < 0.001);
        if (existing) existing.v = v;
        else {
            arr.push({ t, v });
            arr.sort((x, y) => x.t - y.t);
        }
        persist();
        return { ok: true, part, channel, t };
    }

    function getKey(part, channel, t) {
        const arr = keysOf(part, channel);
        if (!arr) return null;
        return arr.find(k => Math.abs(k.t - t) < 0.001) || null;
    }

    function delKey(part, channel, t) {
        const arr = keysOf(part, channel);
        if (!arr) return { ok: false, error: 'no keyframes' };
        const i = arr.findIndex(k => Math.abs(k.t - t) < 0.001);
        if (i < 0) return { ok: false, error: 'no keyframe at ' + t + 's' };
        arr.splice(i, 1);
        persist();
        return { ok: true };
    }

    function interp3(a, b, c, d, u, mode) {
        
        const out = [0, 0, 0];
        for (let i = 0; i < 3; i++) {
            if (mode === 'step') out[i] = b[i];
            else if (mode === 'linear') out[i] = b[i] + (c[i] - b[i]) * u;
            else {
                
                const p0 = a ? a[i] : b[i] * 2 - c[i];
                const p3 = d ? d[i] : c[i] * 2 - b[i];
                const u2 = u * u, u3 = u2 * u;
                out[i] = 0.5 * ((2 * b[i]) +
                    (-p0 + c[i]) * u +
                    (2 * p0 - 5 * b[i] + 4 * c[i] - p3) * u2 +
                    (-p0 + 3 * b[i] - 3 * c[i] + p3) * u3);
            }
        }
        return out;
    }

    function sampleChannel(arr, t, mode) {
        if (!arr || !arr.length) return null;
        if (t <= arr[0].t) return arr[0].v;
        if (t >= arr[arr.length - 1].t) return arr[arr.length - 1].v;
        for (let i = 0; i < arr.length - 1; i++) {
            if (t >= arr[i].t && t <= arr[i + 1].t) {
                const span = arr[i + 1].t - arr[i].t || 1e-6;
                const u = (t - arr[i].t) / span;
                return interp3(arr[i - 1]?.v, arr[i].v, arr[i + 1].v, arr[i + 2]?.v, u, mode);
            }
        }
        return arr[arr.length - 1].v;
    }

    function applyAtTime(t) {
        const a = cur();
        const P = window.MF_Pose;
        if (!a || !P) return { ok: false };
        const base = P.getPose() || {};
        for (const part in a.keys) {
            const chans = a.keys[part];
            
            const rot = sampleChannel(chans.rotation, t, a.interp);
            if (rot) {
                try { P.setPart(part, { pitch: rot[0], yaw: rot[1], roll: rot[2] }); } catch {}
            }
            
            const pos = sampleChannel(chans.position, t, a.interp);
            if (pos && P.setOffset) {
                try { P.setOffset(part, { x: pos[0], y: pos[1], z: pos[2] }); } catch {}
            }
            
            const sc = sampleChannel(chans.scale, t, a.interp);
            if (sc && P.setScale) {
                try { P.setScale(part, { x: sc[0], y: sc[1], z: sc[2] }); } catch {}
            }
        }
        return { ok: true };
    }

    function loop(now) {
        if (!state.playing) return;
        const a = cur();
        if (!a) { state.playing = false; return; }
        const dt = state.lastFrame ? (now - state.lastFrame) / 1000 : 0;
        state.lastFrame = now;
        state.t += dt;

        const minStep = 1 / state.fps;
        state.fpsClock += dt;
        if (state.fpsClock < minStep) {
            state.raf = requestAnimationFrame(loop);
            return; 
        }
        state.fpsClock = 0; 

        if (state.t > a.length) {
            if (a.loop) state.t = state.t % a.length;
            else { state.t = a.length; applyAtTime(state.t); stop(); return; }
        }
        applyAtTime(state.t);
        state.raf = requestAnimationFrame(loop);
    }

    function play() {
        const a = cur();
        if (!a) return { ok: false, error: 'sin animación abierta' };
        state.playing = true;
        state.lastFrame = 0;
        state.fpsClock = 0;
        state.raf = requestAnimationFrame(loop);
        return { ok: true };
    }

    function pause() {
        state.playing = false;
        cancelAnimationFrame(state.raf);
        return { ok: true };
    }

    function stop() {
        state.playing = false;
        cancelAnimationFrame(state.raf);
        state.t = 0;
        return { ok: true };
    }

    function setTime(t) {
        state.t = Math.max(0, t);
        if (!state.playing) applyAtTime(state.t);
        return { ok: true, t: state.t };
    }

    function time() { return state.t; }
    function length() { const a = cur(); return a ? a.length : 0; }
    function setLoop(v) { const a = cur(); if (a) { a.loop = !!v; persist(); } return { ok: !!a }; }
    function setInterp(mode) {
        if (!['smooth', 'linear', 'step'].includes(mode)) throw new Error('interp: smooth|linear|step');
        const a = cur(); if (a) { a.interp = mode; persist(); }
        return { ok: !!a };
    }

    function autoKey(part, channel, value, forceMirror) {
        if (!state.autoKey || !state.cur) return { ok: false, skipped: true };
        try { setChannel(part, channel, state.t, value); } catch { return { ok: false }; }
        const doMirror = forceMirror != null ? forceMirror : state.mirror;
        if (doMirror) {
            const mp = MIRROR_PART[part];
            if (mp) {
                const s = MIRROR_SIGN[channel];
                try { setChannel(mp, channel, state.t, [value[0] * s[0], value[1] * s[1], value[2] * s[2]]); } catch {}
            }
        }
        return { ok: true };
    }

    function readPart(part) {
        const P = window.MF_Pose;
        if (!P) return null;
        const out = { rotation: null, position: null, scale: null };
        try {
            const pose = P.getPose();
            const r = pose?.[part];
            if (r) out.rotation = [r[0] * 180 / Math.PI, r[1] * 180 / Math.PI, r[2] * 180 / Math.PI];
        } catch {}
        try {
            if (P.getOffset) {
                const o = P.getOffset(part);
                if (o) out.position = [o.x, o.y, o.z];
            }
        } catch {}
        try {
            if (P.getScale) {
                const s = P.getScale(part);
                if (s) out.scale = [s.x, s.y, s.z];
            }
        } catch {}
        return out;
    }

    function snapKey(part, opts) {
        if (!state.cur) return { ok: false, error: 'open or create an animation first' };
        const written = [];
        const mirror = opts?.mirror ?? state.mirror;
        for (const p of (part ? [part] : ALL_PARTS())) {
            const vals = readPart(p);
            if (!vals) continue;
            for (const ch of CHANNELS) {
                const v = vals[ch];
                if (!v) continue;
                setChannel(p, ch, state.t, v);
                written.push(p + '.' + ch);
                if (mirror && ch !== 'position') {
                    const mp = MIRROR_PART[p];
                    if (mp) {
                        const s = MIRROR_SIGN[ch];
                        setChannel(mp, ch, state.t, [v[0] * s[0], v[1] * s[1], v[2] * s[2]]);
                        written.push(mp + '.' + ch);
                    }
                }
            }
        }
        return { ok: written.length > 0, written, t: state.t };
    }

    function ALL_PARTS() {
        const P = window.MF_Pose;
        if (P?.PARTS) return P.PARTS;
        return Object.keys(MIRROR_PART); 
    }

    window.MF_Animation = {
        create, open, del, list,
        setChannel, getKey, delKey,
        play, pause, stop, setTime, time, length,
        setLoop, setInterp,
        autoKey, readPart, snapKey, applyAtTime,
        get current() { return state.cur; },
        get playing() { return state.playing; },
        get interp() { return cur()?.interp || 'smooth'; },
        get autoKeyEnabled() { return state.autoKey; },
        setAutoKey(v) { state.autoKey = !!v; },
        get mirrorEnabled() { return state.mirror; },
        setMirror(v) { state.mirror = !!v; },
        get fps() { return state.fps; },
        setFps(v) { state.fps = Math.max(5, Math.min(180, Math.round(+v || 60))); return state.fps; },
        keysOf,
        CHANNELS
    };
    window.__MF_Animation = true;

    console.log(TAG + ' listo. MF_Animation.create("walk", 2) → autoKey desde el Studio al posar.');
})();
