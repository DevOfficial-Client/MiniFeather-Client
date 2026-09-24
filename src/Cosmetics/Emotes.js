
(function () {
    'use strict';

    const TAG = '[MF Emotes]';
    const DIR = 'emotes/';

    const state = {
        loaded: new Map(),      
        current: null,          
        fadeTarget: 0,          
        cameraChanged: false,   
        defaults: new Map()     
    };

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

    const VANILLA_PIVOT = {
        head:     { x: 0,    y: 0,  z: 0 },
        body:     { x: 0,    y: 0,  z: 0 },
        torso:    { x: 0,    y: 0,  z: 0 },
        leftArm:  { x: 5,    y: 2,  z: 0 },
        rightArm: { x: -5,   y: 2,  z: 0 },
        leftLeg:  { x: 1.9,  y: 12, z: 0.1 },
        rightLeg: { x: -1.9, y: 12, z: 0.1 }
    };

    const PARTS = {
        head:    { joint: 'headPivot',          bend: null },
        torso:   { joint: 'body',              bend: null, root: 'skeleton', noRotInvert: true },
        body:    { joint: 'body',              bend: null, root: 'skeleton', isRoot: true, noRotInvert: true },
        leftArm: { joint: 'leftShoulderJoint',  bend: 'leftElbowJoint' },
        rightArm:{ joint: 'rightShoulderJoint', bend: 'rightElbowJoint' },
        leftLeg: { joint: 'leftHipJoint',       bend: 'leftKneeJoint' },
        rightLeg:{ joint: 'rightHipJoint',      bend: 'rightKneeJoint' }
    };

    const PART_FLAGS = {
        head:     { bendable: false, scalable: true },
        body:     { bendable: true,  scalable: true },
        torso:    { bendable: true,  scalable: true },
        rightArm: { bendable: true,  scalable: true },
        leftArm:  { bendable: true,  scalable: true },
        rightLeg: { bendable: true,  scalable: true },
        leftLeg:  { bendable: true,  scalable: true },
        leftItem: { bendable: false, scalable: true },
        rightItem:{ bendable: false, scalable: true }
    };

    const c1 = 1.70158, c2 = c1 * 1.525, c3 = c1 + 1;
    const n1 = 7.5625, d1 = 2.75;
    const EASE_FN = {
        sine: {
            in: u => 1 - Math.cos(u * Math.PI / 2),
            out: u => Math.sin(u * Math.PI / 2),
            inout: u => -(Math.cos(Math.PI * u) - 1) / 2
        },
        quad: {
            in: u => u * u,
            out: u => 1 - (1 - u) * (1 - u),
            inout: u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
        },
        cubic: {
            in: u => u * u * u,
            out: u => 1 - Math.pow(1 - u, 3),
            inout: u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
        },
        quart: {
            in: u => u * u * u * u,
            out: u => 1 - Math.pow(1 - u, 4),
            inout: u => u < 0.5 ? 8 * u * u * u * u : 1 - Math.pow(-2 * u + 2, 4) / 2
        },
        quint: {
            in: u => u * u * u * u * u,
            out: u => 1 - Math.pow(1 - u, 5),
            inout: u => u < 0.5 ? 16 * u * u * u * u * u : 1 - Math.pow(-2 * u + 2, 5) / 2
        },
        expo: {
            in: u => u === 0 ? 0 : Math.pow(2, 10 * u - 10),
            out: u => u === 1 ? 1 : 1 - Math.pow(2, -10 * u),
            inout: u => u === 0 ? 0 : u === 1 ? 1 : u < 0.5
                ? Math.pow(2, 20 * u - 10) / 2
                : (2 - Math.pow(2, -20 * u + 10)) / 2
        },
        circ: {
            in: u => 1 - Math.sqrt(1 - Math.pow(u, 2)),
            out: u => Math.sqrt(1 - Math.pow(u - 1, 2)),
            inout: u => u < 0.5
                ? (1 - Math.sqrt(1 - Math.pow(2 * u, 2))) / 2
                : (Math.sqrt(1 - Math.pow(-2 * u + 2, 2)) + 1) / 2
        },
        back: {
            in: u => c3 * u * u * u - c1 * u * u,
            out: u => 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2),
            inout: u => u < 0.5
                ? (Math.pow(2 * u, 2) * ((c2 + 1) * 2 * u - c2)) / 2
                : (Math.pow(2 * u - 2, 2) * ((c2 + 1) * (u * 2 - 2) + c2) + 2) / 2
        },
        elastic: {
            in: u => u === 0 ? 0 : u === 1 ? 1
                : -Math.pow(2, 10 * u - 10) * Math.sin((u * 10 - 10.75) * c4),
            out: u => u === 0 ? 0 : u === 1 ? 1
                : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * c4) + 1,
            inout: u => u === 0 ? 0 : u === 1 ? 1 : u < 0.5
                ? -(Math.pow(2, 20 * u - 10) * Math.sin((20 * u - 11.125) * c5)) / 2
                : (Math.pow(2, -20 * u + 10) * Math.sin((20 * u - 11.125) * c5)) / 2 + 1
        },
        bounce: {
            in: u => 1 - EASE_FN.bounce.out(1 - u),
            out: u => {
                if (u < 1 / d1) return n1 * u * u;
                else if (u < 2 / d1) return n1 * (u -= 1.5 / d1) * u + 0.75;
                else if (u < 2.5 / d1) return n1 * (u -= 2.25 / d1) * u + 0.9375;
                else return n1 * (u -= 2.625 / d1) * u + 0.984375;
            },
            inout: u => u < 0.5
                ? (1 - EASE_FN.bounce.out(1 - 2 * u)) / 2
                : (1 + EASE_FN.bounce.out(2 * u - 1)) / 2
        }
    };
    const c4 = 2 * Math.PI / 3, c5 = 2 * Math.PI / 4.5;
    const LINEAR = u => u;
    const CONSTANT = u => (u < 1 ? 0 : 1);

    function getEasing(name) {
        let s = String(name || 'linear').toLowerCase().replace(/[\s_-]/g, '');
        if (s.startsWith('ease')) s = s.slice(4);
        if (s === 'linear') return LINEAR;
        if (s === 'constant' || s === 'step') return CONSTANT;
        let mode = 'in';
        if (s.startsWith('inout')) { mode = 'inout'; s = s.slice(5); }
        else if (s.startsWith('in')) { mode = 'in'; s = s.slice(2); }
        else if (s.startsWith('out')) { mode = 'out'; s = s.slice(3); }
        return EASE_FN[s]?.[mode] || LINEAR;
    }

    function unwrapHeaderString(s) {
        if (typeof s !== 'string' || !s) return s;
        const t = s.trim();
        if (t.startsWith('{')) {
            try {
                const o = JSON.parse(t);
                return o.fallback || o.translate || s;
            } catch { return s; }
        }
        if (t.startsWith('"') && t.endsWith('"')) {
            try { return JSON.parse(t); } catch { return s; }
        }
        return s;
    }

    const EASE_BY_ID = [null, null, null, null, null, null,
        'insine', 'outsine', 'inoutsine',                                
        'incubic', 'outcubic', 'inoutcubic',                            
        'inquad', 'outquad', 'inoutquad',                               
        'inquart', 'outquart', 'inoutquart',                            
        'inquint', 'outquint', 'inoutquint',                            
        'inexpo', 'outexpo', 'inoutexpo',                               
        'incirc', 'outcirc', 'inoutcirc',                               
        'inback', 'outback', 'inoutback',                               
        'inelastic', 'outelastic', 'inoutelastic',                      
        'inbounce', 'outbounce', 'inoutbounce',                         
        'catmullrom', 'step'                                            
    ];

    function BinReader(buf) {
        const dv = new DataView(buf);
        let pos = 0;
        return {
            get ok() { return pos <= buf.byteLength; },
            get remaining() { return buf.byteLength - pos; },
            seek(p) { pos = p; },
            get pos() { return pos; },
            i8() { return dv.getInt8(pos++); },
            u8() { return dv.getUint8(pos++); },
            boolean() { return dv.getUint8(pos++) !== 0; },
            i32() { const v = dv.getInt32(pos); pos += 4; return v; },
            f32() { const v = dv.getFloat32(pos); pos += 4; return v; },
            i64() { const v = [dv.getInt32(pos), dv.getInt32(pos + 4)]; pos += 8; return v; },
            str() {
                const len = this.i32();
                const bytes = new Uint8Array(buf, pos, len);
                pos += len;
                return new TextDecoder().decode(bytes);
            }
        };
    }

    function readKeyframesBin(r, kfs, version, keyframeSize) {
        let enabled;
        if (version >= 2) {
            enabled = r.boolean();
            const n = r.i32();
            if (enabled) for (let i = 0; i < n; i++) {
                const start = r.pos;
                const tick = r.i32(), value = r.f32();
                const easeId = r.u8();
                if (version >= 4) r.f32(); 
                kfs.push({ tick, v: value, ease: getEasing(EASE_BY_ID[easeId] || 'linear') });
                r.seek(start + keyframeSize);
            }
        } else {
            const n = r.i32();
            enabled = n >= 0;
            for (let i = 0; i < n; i++) {
                const start = r.pos;
                const tick = r.i32(), value = r.f32();
                const easeId = r.u8();
                kfs.push({ tick, v: value, ease: getEasing(EASE_BY_ID[easeId] || 'linear') });
                r.seek(start + keyframeSize);
            }
        }
        return enabled;
    }

    function readPartBin(r, slotData, version, keyframeSize) {
        
        const rot = { x: [], y: [], z: [] }, pos = { x: [], y: [], z: [] };
        const bend = { kfs: [], axis: [] };
        readKeyframesBin(r, pos.x, version, keyframeSize);
        readKeyframesBin(r, pos.y, version, keyframeSize);
        readKeyframesBin(r, pos.z, version, keyframeSize);
        readKeyframesBin(r, rot.x, version, keyframeSize); 
        readKeyframesBin(r, rot.y, version, keyframeSize); 
        readKeyframesBin(r, rot.z, version, keyframeSize); 
        if (slotData.bendable) {
            readKeyframesBin(r, bend.axis, version, keyframeSize);  
            readKeyframesBin(r, bend.kfs, version, keyframeSize);   
        }
        if (slotData.scalable && version >= 3) {
            
            for (let i = 0; i < 3; i++) readKeyframesBin(r, [], version, keyframeSize);
        }
        return { rot, pos, bend };
    }

    function parseBinaryEmotecraft(buffer) {
        const r = BinReader(buffer);
        if (r.remaining < 6) return null;
        const netVersion = r.i32();
        if (netVersion < 0 || netVersion > 100) return null;
        const purpose = r.u8();
        if (purpose !== 0x10) return null; 
        const nSub = r.u8();

        let emote = null, header = { name: null, author: null, description: null };

        for (let s = 0; s < nSub; s++) {
            const subId = r.u8();
            const subVer = r.u8();
            const size = r.i32();
            const start = r.pos;

            if (subId === 0 && !emote) {
                
                r.i32(); 
                const beginTick = r.i32();
                const endTick = r.i32();
                const stopTick = r.i32();
                const isLoop = r.boolean();
                const returnTick = r.i32();
                const easingBefore = r.boolean(); 
                r.boolean(); 
                const keyframeSize = r.i8();
                if (!(keyframeSize > 0)) return null;

                const parts = {};
                const mkSlot = (bendable, scalable) => ({ rot: { x: [], y: [], z: [] }, pos: { x: [], y: [], z: [] }, bend: { kfs: [], axis: 'x' }, bendable, scalable });
                if (subVer >= 2) {
                    const count = r.i32();
                    for (let i = 0; i < count; i++) {
                        const name = r.str();
                        const flags = PART_FLAGS[name] || { bendable: true, scalable: true };
                        const s2 = mkSlot(flags.bendable, flags.scalable);
                        const parsed = readPartBin(r, s2, subVer, keyframeSize);
                        s2.rot = parsed.rot; s2.pos = parsed.pos;
                        s2.bend.kfs = parsed.bend.kfs;
                        s2.bend.axisKfs = parsed.bend.axis;
                        parts[name] = s2;
                    }
                } else {
                    
                    for (const name of ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']) {
                        const flags = PART_FLAGS[name];
                        const s2 = mkSlot(flags.bendable, flags.scalable);
                        const parsed = readPartBin(r, s2, subVer, keyframeSize);
                        s2.rot = parsed.rot; s2.pos = parsed.pos;
                        s2.bend.kfs = parsed.bend.kfs;
                        s2.bend.axisKfs = parsed.bend.axis;
                        parts[name] = s2;
                    }
                }
                r.i64(); 

                emote = {
                    beginTick, endTick, stopTick, returnTick, isLoop, easingBefore,
                    parts,
                    
                    degrees: false
                };
            } else if (subId === 0x11) {
                header.name = r.str();
                header.description = r.str();
                header.author = r.str();
                if (subVer >= 2) {
                    r.str(); 
                    const nBages = r.i32();
                    for (let i = 0; i < nBages; i++) r.str();
                }
            }
            r.seek(start + size); 
        }

        if (!emote) return null;
        emote.name = unwrapHeaderString(header.name);
        emote.author = unwrapHeaderString(header.author);
        emote.description = unwrapHeaderString(header.description);
        return emote;
    }

    function normalizeEmote(emote) {
        const DEG = Math.PI / 180;
        const rotScale = emote.degrees === false ? 1 : DEG; 
        for (const [name, s] of Object.entries(emote.parts)) {
            for (const ch of ['x', 'y', 'z']) {
                for (const kf of s.rot[ch]) kf.v *= rotScale;
            }
            if (s.bend) {
                for (const kf of s.bend.kfs) kf.v *= rotScale; 
            }
            
            const vp = VANILLA_PIVOT[name] || { x: 0, y: 0, z: 0 };
            for (const ch of ['x', 'y', 'z']) {
                for (const kf of s.pos[ch]) kf.v -= vp[ch];
            }
            
            for (const ch of ['x', 'y', 'z']) {
                s.rot[ch].sort((a, b) => a.tick - b.tick);
                s.pos[ch].sort((a, b) => a.tick - b.tick);
            }
            if (s.bend) s.bend.kfs.sort((a, b) => a.tick - b.tick);
            
            const chans = [s.rot.x, s.rot.y, s.rot.z, s.pos.x, s.pos.y, s.pos.z];
            if (s.bend) chans.push(s.bend.kfs);
            for (const kfs of chans) {
                if (kfs.length && kfs[0].tick > emote.beginTick) {
                    kfs.unshift({ tick: emote.beginTick, v: 0, ease: LINEAR });
                }
            }
        }
        
        let maxTick = emote.beginTick;
        for (const s of Object.values(emote.parts)) {
            for (const ch of ['x', 'y', 'z']) {
                if (s.rot[ch].length) maxTick = Math.max(maxTick, s.rot[ch][s.rot[ch].length - 1].tick);
                if (s.pos[ch].length) maxTick = Math.max(maxTick, s.pos[ch][s.pos[ch].length - 1].tick);
            }
            if (s.bend?.kfs.length) maxTick = Math.max(maxTick, s.bend.kfs[s.bend.kfs.length - 1].tick);
        }
        if (!emote.endTick) emote.endTick = maxTick;
        if (!emote.stopTick || emote.stopTick < emote.endTick) emote.stopTick = emote.endTick + 6;
        return emote;
    }

    function parseEmotecraft(json) {
        const emote = json?.emote;
        if (!emote || typeof emote !== 'object' || !Array.isArray(emote.moves)) return null;

        const isLoop = emote.isLoop === true || String(emote.isLoop) === 'true';

        const beginTick = Number.isFinite(+emote.beginTick) ? +emote.beginTick : 0;
        const endTick = Number.isFinite(+emote.endTick) ? +emote.endTick : 0;
        const stopTick = Number.isFinite(+emote.stopTick) ? +emote.stopTick : 0;
        const returnTick = Number.isFinite(+emote.returnTick) ? +emote.returnTick : beginTick;

        const parts = {};
        function slot(part) {
            if (!parts[part]) {
                parts[part] = {
                    rot: { x: [], y: [], z: [] },
                    pos: { x: [], y: [], z: [] },
                    bend: { kfs: [], axis: 'x' }
                };
            }
            return parts[part];
        }
        
        const ROT_CH = { pitch: 'x', yaw: 'y', roll: 'z' };

        for (const move of emote.moves) {
            if (!move || typeof move !== 'object') continue;
            const tick = Number(move.tick);
            if (!Number.isFinite(tick)) continue;
            const ease = getEasing(move.easing);
            const turn = Number(move.turn || 0);
            const turnDeg = Number.isFinite(turn) ? turn * 360 : 0;

            for (const [part] of Object.entries(PARTS)) {
                const p = move[part];
                if (!p || typeof p !== 'object') continue;
                const s = slot(part);
                
                for (const [key, ch] of Object.entries(ROT_CH)) {
                    const v = Number(p[key]);
                    if (Number.isFinite(v)) s.rot[ch].push({ tick, v, ease });
                }
                for (const ch of ['x', 'y', 'z']) {
                    const v = Number(p[ch]);
                    if (Number.isFinite(v)) s.pos[ch].push({ tick, v, ease });
                }
                if (p.bend !== undefined) {
                    const v = Number(p.bend);
                    if (Number.isFinite(v)) s.bend.kfs.push({ tick, v, ease });
                }
                
                if (p.axis !== undefined) {
                    const v = Number(p.axis);
                    if (Number.isFinite(v)) {
                        if (s.bend.axisKfs && s.bend.axisKfs.length) {
                            s.bend.axisKfs.push({ tick, v, ease });
                        } else {
                            s.bend.axisKfs = [{ tick, v, ease }];
                        }
                    }
                }
            }

            if (turnDeg !== 0) {
                for (const [part] of Object.entries(PARTS)) {
                    const p = move[part];
                    if (!p || typeof p !== 'object') continue;
                    const s = slot(part);
                    for (const [, ch] of Object.entries(ROT_CH)) {
                        const v = Number(p[ch]);
                        if (Number.isFinite(v)) {
                            s.rot[ch].push({ tick, v: v + turnDeg, ease: CONSTANT });
                        }
                    }
                }
            }
        }

        return {
            name: json.name || null,
            author: json.author || null,
            description: json.description || null,
            beginTick, endTick, stopTick, returnTick, isLoop,
            easingBefore: emote.easingBefore === true,
            degrees: emote.degrees !== false, 
            parts
        };
    }

    function sample(kfs, t, easingBefore) {
        const n = kfs.length;
        if (n === 0) return 0;
        if (n === 1 || t <= kfs[0].tick) return kfs[0].v;
        if (t >= kfs[n - 1].tick) return kfs[n - 1].v;
        let i = 0;
        while (i < n - 1 && kfs[i + 1].tick <= t) i++;
        const a = kfs[i], b = kfs[i + 1];
        if (b.tick <= a.tick) return b.v; 
        let u = (t - a.tick) / (b.tick - a.tick);
        u = Math.min(1, Math.max(0, u));
        const e = (easingBefore ? a : b).ease(u);
        return a.v + (b.v - a.v) * e;
    }

    function sampleLoop(kfs, t, emote) {
        if (!emote.isLoop || t <= emote.endTick) return sample(kfs, t, emote.easingBefore);
        const span = emote.endTick - emote.returnTick + 1;
        if (span <= 1) return sample(kfs, t, emote.easingBefore);
        return sample(kfs, emote.returnTick + ((t - emote.returnTick) % span), emote.easingBefore);
    }

    const posScaleCache = new WeakMap();

    function measurePosScale(mesh) {
        if (posScaleCache.has(mesh)) return posScaleCache.get(mesh);
        let scale = 1 / 16, hipDist = null;
        try {
            const lj = findJoint(mesh, 'leftHipJoint');
            const rj = findJoint(mesh, 'rightHipJoint');
            if (lj && rj) {
                
                const V3 = lj.position.constructor;
                const a = new V3(), b = new V3();
                lj.getWorldPosition(a);
                rj.getWorldPosition(b);
                const dx = Math.abs(a.x - b.x);
                const dy = Math.abs(a.y - b.y), dz = Math.abs(a.z - b.z);
                hipDist = dx > 1e-6 && dy < dx * 0.25 && dz < dx * 0.25
                    ? dx
                    : Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
                if (Number.isFinite(hipDist) && hipDist > 1e-6) scale = hipDist / 3.8;
            }
        } catch {}
        posScaleCache.set(mesh, scale);
        log('escala posiciones:', scale.toFixed(5),
            'u/pxMC (caderas:', hipDist === null ? '?' : hipDist.toFixed(5),
            '| 1/16 =', (1 / 16).toFixed(5), ')');
        return scale;
    }

    const lastWritten = new WeakMap(); 

    function captureDefaults(joint) {
        if (!state.defaults.has(joint)) {
            const w = lastWritten.get(joint);
            state.defaults.set(joint, {
                rx: joint.rotation.x, ry: joint.rotation.y, rz: joint.rotation.z,
                px: joint.position.x - (w ? w.px : 0),
                py: joint.position.y - (w ? w.py : 0),
                pz: joint.position.z - (w ? w.pz : 0)
            });
        }
    }

    function vanillaOf(joint, freshRoot) {
        const w = lastWritten.get(joint);
        // freshRoot=true → la posición ACTUAL ya es vanilla limpia: el juego
        // RESETEA skeleton.position en cada render (prueba en el bundle: el
        // emote nativo DANCE hace `skeleton.position.y -= ...` sin restaurar,
        // que solo funciona con reset por-frame). En ese caso NO hay que
        // restar el offset del frame anterior. Para el resto de joints
        // (posiciones persistentes del rig) sí se resta lo que escribimos.
        const s = freshRoot ? 0 : 1;
        return {
            rx: joint.rotation.x, ry: joint.rotation.y, rz: joint.rotation.z,
            px: joint.position.x - (s && w ? w.px : 0),
            py: joint.position.y - (s && w ? w.py : 0),
            pz: joint.position.z - (s && w ? w.pz : 0)
        };
    }

    function restoreJoint(joint) {
        const d = state.defaults.get(joint);
        const w = lastWritten.get(joint);
        if (w) {
            // El root (skeleton): el juego lo resetea en el próximo render —
            // restar aquí movería al jugador un frame de más. El resto
            // (posiciones persistentes del rig) sí se restauran restando.
            const isRoot = state.current?.rootJoint === joint;
            if (!isRoot) {
                joint.position.set(
                    joint.position.x - w.px, joint.position.y - w.py, joint.position.z - w.pz
                );
            }
            lastWritten.delete(joint);
        }
        if (d) {
            joint.rotation.set(d.rx, d.ry, d.rz);
        }
        state.defaults.delete(joint);
    }

    function restoreAll() {
        for (const joint of [...state.defaults.keys()]) restoreJoint(joint);
    }

    function stop() {
        if (state.current) state.fadeTarget = 0; 
    }

    function finishStop() {
        const cur = state.current;
        // Restaurar ANTES de nullear current: restoreJoint consulta
        // current.rootJoint para no mover la raíz (el juego la resetea solo).
        if (state.defaults.size) restoreAll();
        state.current = null;
        if (cur) {
            // Devolver el control a MF_PlayerAnims (poses del pack de nuevo).
            if (hookState.mesh) hookState.mesh.__mfPASuppress = false;
            for (const joint of cur.jointList) joint.__mfPASuppress = false;
        }
        leaveCamera(state.player);
        log('emote terminado');
    }

    function applyPose(mesh, fromRenderHook) {
        const cur = state.current;
        if (!cur || !mesh) return;
        cur.framesSeen = (cur.framesSeen || 0) + 1;
        // fromRenderHook: el render del juego acaba de RESETEAR skeleton.position
        // (y de reescribir la pose vanilla) → la raíz se lee como vanilla limpio.
        // Cada invocación de original.render() re-resetea (varios render() por
        // frame p.ej. sombras), así que TODO llamado del hook es "fresh".
        // El fallback de rAF (fuera del render) ve NUESTRO write previo → resta.
        const freshRoot = fromRenderHook === true;

        const now = performance.now();
        
        const dt = Math.min(0.1, (now - cur.lastFrame) / 1000);
        cur.lastFrame = now;

        const speed = state.fadeTarget > 0 ? 15 : 20;
        const smoothing = 1 - Math.exp(-speed * dt);
        cur.blend += (state.fadeTarget - cur.blend) * smoothing;
        if (state.fadeTarget === 0 && cur.blend < 0.01) { finishStop(); return; }

        const t = ((now - cur.startTime) / 1000) * 20; 
        const emote = cur.emote;
        let blend = cur.blend, tt;

        if (!emote.isLoop && t > emote.endTick) {
            tt = emote.endTick; 
        } else {
            tt = t;              
        }

        for (const joint of cur.jointList) {
            const isRoot = joint === cur.rootJoint;
            const v = vanillaOf(joint, freshRoot && isRoot);
            const d = state.defaults.get(joint);
            const w = lastWritten.get(joint);
            if (d && w) {
                const untouched = (raw, written) => Math.abs(raw - written) < 1e-6;
                state.defaults.set(joint, {
                    rx: untouched(joint.rotation.x, d.rx + w.rx) ? d.rx : v.rx,
                    ry: untouched(joint.rotation.y, d.ry + w.ry) ? d.ry : v.ry,
                    rz: untouched(joint.rotation.z, d.rz + w.rz) ? d.rz : v.rz,
                    px: v.px, py: v.py, pz: v.pz
                });
            } else {
                state.defaults.set(joint, v);
            }
        }

        function qMul(a, b) { 
            return {
                x: a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
                y: a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
                z: a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
                w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
            };
        }
        function qAxis(axis, ang) {
            const h = ang / 2, s = Math.sin(h);
            return { x: axis[0] * s, y: axis[1] * s, z: axis[2] * s, w: Math.cos(h) };
        }
        function qSlerp(a, b, u) {
            let d = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
            let bx = b.x, by = b.y, bz = b.z, bw = b.w;
            if (d < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d; }
            if (d > 0.9995) { 
                const o = {
                    x: a.x + (bx - a.x) * u, y: a.y + (by - a.y) * u,
                    z: a.z + (bz - a.z) * u, w: a.w + (bw - a.w) * u
                };
                const n = Math.hypot(o.x, o.y, o.z, o.w) || 1;
                o.x /= n; o.y /= n; o.z /= n; o.w /= n;
                return o;
            }
            const th = Math.acos(Math.min(1, d)), s = Math.sin(th);
            const wa = Math.sin((1 - u) * th) / s, wb = Math.sin(u * th) / s;
            return {
                x: a.x * wa + bx * wb, y: a.y * wa + by * wb,
                z: a.z * wa + bz * wb, w: a.w * wa + bw * wb
            };
        }
        function qToEulerXYZ(qq) {
            
            const n = Math.hypot(qq.x, qq.y, qq.z, qq.w) || 1;
            const x = qq.x / n, y = qq.y / n, z = qq.z / n, w = qq.w / n;
            const sy = 2 * (w * y + z * x);
            if (Math.abs(sy) >= 1) {
                
                return { x: 2 * Math.atan2(x, w), y: Math.sign(sy) * Math.PI / 2, z: 0 };
            }
            return {
                x: Math.atan2(2 * (w * x - y * z), 1 - 2 * (x * x + y * y)),
                y: Math.asin(sy),
                z: Math.atan2(2 * (w * z - x * y), 1 - 2 * (y * y + z * z))
            };
        }

        for (const part of cur.parts) {
            const j = part.joint;
            if (!j && !part.rootJoint) continue;
            const d = j ? state.defaults.get(j) : null;

            const inv = part.noRotInvert ? 1 : -1;
            if (part.hasRot && d) {
                const p = inv * sampleLoop(part.rot.x, tt, emote), y = inv * sampleLoop(part.rot.y, tt, emote), r = sampleLoop(part.rot.z, tt, emote);
                
                let qe = qMul(qMul(qAxis([0, 0, 1], r), qAxis([0, 1, 0], y)), qAxis([1, 0, 0], p));
                const qv2 = qMul(qMul(qAxis([0, 0, 1], d.rz), qAxis([0, 1, 0], d.ry)), qAxis([1, 0, 0], d.rx));
                qe = qSlerp(qv2, qe, blend);
                const e = qToEulerXYZ(qe);
                j.rotation.set(e.x, e.y, e.z);
                lastWritten.set(j, { rx: e.x - d.rx, ry: e.y - d.ry, rz: e.z - d.rz, px: 0, py: 0, pz: 0 });
            }
            
            if (part.hasPos) {
                const pj = part.rootJoint || j;
                const isRootWrite = part.rootJoint && pj === part.rootJoint;
                // Base del root: con fresh (post-render) la posición actual YA
                // es vanilla limpia → usarla directo; si no, restar nuestro
                // write previo (el default cacheado ya lo hizo en el loop).
                const pd = isRootWrite && freshRoot
                    ? { px: pj.position.x, py: pj.position.y, pz: pj.position.z }
                    : (state.defaults.get(pj) || { px: pj.position.x, py: pj.position.y, pz: pj.position.z });
                const k = cur.posScale * blend;
                let ox = k * sampleLoop(part.pos.x, tt, emote),
                    oy = k * sampleLoop(part.pos.y, tt, emote),
                    oz = k * sampleLoop(part.pos.z, tt, emote);
                // La raíz (skeleton) vive en espacio MUNDO: el yaw del jugador
                // está en el quaternion del body y la raíz NO rota → un offset
                // directo apunta según el mundo, no según el cuerpo (mismo bug
                // que el desface del sneak del pack). Rotarlo por el yaw
                // vanilla lo hace relativo al jugador a cualquier rotación.
                if (part.rootJoint && pj === part.rootJoint && cur.bodyQ) {
                    try {
                        const VC = pj.position.constructor;
                        const rv = new VC(ox, oy, oz).applyQuaternion(cur.bodyQ);
                        ox = rv.x; oy = rv.y; oz = rv.z;
                    } catch {}
                }
                pj.position.set(pd.px + ox, pd.py + oy, pd.pz + oz);
                const w = lastWritten.get(pj) || { rx: 0, ry: 0, rz: 0 };
                lastWritten.set(pj, { ...w, px: ox, py: oy, pz: oz });
            }
            
            const bj = part.bendJoint;
            if (bj && part.bend.kfs.length) {
                const b = sampleLoop(part.bend.kfs, tt, emote);
                let axisRad = 0;
                if (part.bend.axisKfs && part.bend.axisKfs.length) {
                    axisRad = sampleLoop(part.bend.axisKfs, tt, emote);
                } else if (typeof part.bend.axis === 'number') {
                    axisRad = part.bend.axis;
                }
                const db = state.defaults.get(bj) || { rx: 0, ry: 0, rz: 0 };
                const tgtX = -b * Math.cos(axisRad), tgtZ = -b * Math.sin(axisRad);
                const ox = tgtX * blend, oz = tgtZ * blend;
                bj.rotation.set(db.rx + ox, db.ry, db.rz + oz);
                lastWritten.set(bj, { rx: ox, ry: 0, rz: oz, px: 0, py: 0, pz: 0 });
            }
        }
    }

    const hookState = { mesh: null, wrapper: null };

    function hookMeshRender(mesh) {
        if (!mesh || typeof mesh.render !== 'function') return false;
        if (hookState.mesh === mesh && mesh.render === hookState.wrapper) return true;

        const target = mesh;
        const original = mesh.render;
        const wrapper = function (...args) {
            const result = original.apply(this, args);
            if (state.current) {
                try {
                    // El render del juego acaba de escribir el yaw vanilla en
                    // body.quaternion — capturarlo ANTES de que applyPose lo
                    // pise con la pose del emote (lo usa para rotar los
                    // offsets del root, espacio modelo → mundo).
                    const bq = target.body?.quaternion;
                    if (bq) state.current.bodyQ = bq.clone();
                    applyPose(target, true);
                }
                catch (e) { console.error(TAG, 'pose error:', e); finishStop(); }
            }
            return result;
        };
        try {
            mesh.render = wrapper;
            hookState.mesh = mesh;
            hookState.wrapper = wrapper;
            return true;
        } catch (e) {
            log('render hook falló:', e);
            return false;
        }
    }

    let rafActive = false;
    function rafTick() {
        if (!state.current) { rafActive = false; return; }
        try { applyPose(hookState.mesh); }
        catch (e) { console.error(TAG, 'pose error (rAF):', e); finishStop(); }
        requestAnimationFrame(rafTick);
    }
    function ensureRafLoop() {
        if (rafActive) return;
        rafActive = true;
        requestAnimationFrame(rafTick);
    }

    function enterCamera(player) {
        try {
            if (
                player &&
                player.perspective === 0 &&
                !player.sleeping &&
                !player.isSpectatingOtherPlayer?.() &&
                (typeof player.getHealth !== 'function' || player.getHealth() > 0)
            ) {
                state.cameraChanged = true;
                player.perspective = 2;
                player.toggleCameraPerspective?.();
            }
        } catch {}
    }

    function leaveCamera(player) {
        try {
            if (player && state.cameraChanged && player.perspective === 2) {
                player.perspective = 0;
                player.toggleCameraPerspective?.();
            }
        } catch {}
        state.cameraChanged = false;
    }

    function play(name) {
        const emote = state.loaded.get(name);
        if (!emote) return { ok: false, error: 'unknown' };

        const game = getGame();
        const ent = getLocalPlayerEntity(game);
        if (!ent?.mesh) return { ok: false, error: 'no-mesh' };
        if (!hookMeshRender(ent.mesh)) return { ok: false, error: 'no-hook' };

        try { game.player.endEmoteLocally?.(false); } catch {}

        if (state.current) finishStop();

        const parts = [];
        const jointList = new Set();
        for (const [partName, s] of Object.entries(emote.parts)) {
            const def = PARTS[partName];
            if (!def) continue;
            const joint = findJoint(ent.mesh, def.joint);
            const bendJoint = def.bend ? findJoint(ent.mesh, def.bend) : null;
            
            const rootJoint = def.root ? findJoint(ent.mesh, def.root) : null;
            if (joint || rootJoint) {
                if (rootJoint) jointList.add(rootJoint);
                if (joint) jointList.add(joint);
                if (bendJoint) jointList.add(bendJoint);
                parts.push({
                    partName,
                    joint,
                    rootJoint,
                    bendJoint,
                    noRotInvert: !!def.noRotInvert,
                    rot: s.rot, hasRot: !!joint && ['x', 'y', 'z'].some(ch => s.rot[ch].length),
                    pos: s.pos, hasPos: ['x', 'y', 'z'].some(ch => s.pos[ch].length),
                    bend: s.bend
                });
            }
        }
        if (!parts.length) return { ok: false, error: 'no-joints' };

        // Sistema de animaciones (MF_PlayerAnims): aplica sus poses DENTRO de
        // updateMatrixWorld y congela codos/rodillas — pisaría las rotaciones
        // del emote. Pedirle que se aparte mientras dura el emote.
        ent.mesh.__mfPASuppress = true;
        for (const joint of jointList) joint.__mfPASuppress = true;

        const posScale = measurePosScale(ent.mesh);
        for (const joint of jointList) captureDefaults(joint);
        state.player = game.player;
        state.current = {
            name, emote, parts, jointList: [...jointList],
            rootJoint: parts.find(p => p.rootJoint)?.rootJoint || null,
            startTime: performance.now(), lastFrame: performance.now(),
            posScale, blend: 0, framesSeen: 0,
            // Yaw vanilla del body (lo refresca el render-hook cada frame):
            // rota los offsets del root de espacio modelo a mundo.
            bodyQ: ent.mesh.body?.quaternion?.clone?.() || null
        };
        state.fadeTarget = 1;
        enterCamera(game.player);
        ensureRafLoop();

        setTimeout(() => {
            if (state.current && state.current.framesSeen === 0) {
                console.warn(TAG, 'render-hook sin frames en 500ms (rAF sigue activo)');
            }
        }, 500);

        return { ok: true, parts: parts.map(p => p.partName), loop: emote.isLoop, endTick: emote.endTick };
    }

    const pendingEmoteFetches = new Map();
    let emoteReqSeq = 0;

    document.addEventListener('minifeather:emote-fetch-response', (e) => {
        try {
            const { nonce, url, ok, status } = JSON.parse(e.detail);
            const p = pendingEmoteFetches.get(nonce);
            if (!p) return;
            pendingEmoteFetches.delete(nonce);
            if (ok) p.resolve(url);
            else p.reject(new Error('HTTP ' + status));
        } catch {}
    });

    function bridgeFetchUrl(file) {
        return new Promise((resolve, reject) => {
            const nonce = 'mfe' + (++emoteReqSeq) + '_' + Date.now();
            pendingEmoteFetches.set(nonce, { resolve, reject });
            document.dispatchEvent(new CustomEvent('minifeather:emote-fetch-request', {
                detail: JSON.stringify({ nonce, file, dir: DIR })
            }));
            setTimeout(() => {
                if (pendingEmoteFetches.has(nonce)) {
                    pendingEmoteFetches.delete(nonce);
                    reject(new Error('timeout'));
                }
            }, 8000);
        });
    }

    async function fetchEmoteBuffer(file) {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
            const resp = await fetch(chrome.runtime.getURL(DIR + file), { cache: 'reload' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return await resp.arrayBuffer();
        }
        const url = await bridgeFetchUrl(file);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return await resp.arrayBuffer();
    }

    function nameVariants(name) {
        const raw = name.trim();
        if (!raw) return [];
        const title = raw.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
        return [...new Set([raw, title])];
    }

    function registerEmoteBytes(buffer) {
        const bytes = new Uint8Array(buffer);
        
        let emote = null;
        if (bytes.length > 6 && bytes[0] === 0x7B ) {
            emote = parseEmotecraft(JSON.parse(new TextDecoder().decode(bytes)));
        } else {
            emote = parseBinaryEmotecraft(buffer);
            if (!emote) return { ok: false, error: 'binary-parse' };
        }
        if (!emote) return { ok: false, error: 'parse' };
        if (!Object.keys(emote.parts).length) return { ok: false, error: 'sin-partes' };
        normalizeEmote(emote);
        return { ok: true, emote };
    }

    function loadFromBuffer(name, buffer) {
        const r = registerEmoteBytes(buffer);
        if (!r.ok) return r;
        state.loaded.set(name, r.emote);
        return {
            ok: true, emote: r.emote,
            name: r.emote.name, author: r.emote.author,
            duration: r.emote.isLoop ? Infinity : r.emote.endTick / 20, loop: r.emote.isLoop
        };
    }

    async function load(name) {
        if (state.loaded.has(name)) return { ok: true, cached: true };
        try {
            let buffer = null, lastErr = null;
            for (const v of nameVariants(name)) {
                try {
                    buffer = await fetchEmoteBuffer(v + '.emotecraft');
                    break;
                } catch (e) { lastErr = e; }
            }
            if (!buffer) throw lastErr || new Error('no file');
            const r = registerEmoteBytes(buffer);
            if (!r.ok) return r;
            state.loaded.set(name, r.emote);
            return {
                ok: true,
                name: r.emote.name, author: r.emote.author,
                duration: r.emote.isLoop ? Infinity : r.emote.endTick / 20, loop: r.emote.isLoop
            };
        } catch (e) {
            return { ok: false, error: String(e?.message || e) };
        }
    }

    function list() {
        return [...state.loaded.keys()];
    }

    setInterval(() => {
        if (!state.current) return;
        const game = getGame();
        const ent = getLocalPlayerEntity(game);
        if (!ent?.mesh) return;
        if (ent.mesh !== hookState.mesh) hookMeshRender(ent.mesh);
    }, 2000);

    function log(...args) { try { void 0; } catch {} }

    function dumpSkeleton() {
        const game = getGame();
        const ent = getLocalPlayerEntity(game);
        const mesh = ent?.mesh;
        if (!mesh) return { ok: false, error: 'no-mesh' };

        const rows = [];
        const seen = new WeakSet();
        const walk = (obj, depth, path) => {
            if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
            seen.add(obj);
            const p = obj.position, r = obj.rotation;
            const hasTransform = p && Number.isFinite(p.x) && r && Number.isFinite(r.x);
            if (hasTransform) {
                rows.push({
                    depth, name: obj.name || '(anon)',
                    path: path.join('/'),
                    pos: [+p.x.toFixed(5), +p.y.toFixed(5), +p.z.toFixed(5)],
                    rot: [+r.x.toFixed(4), +r.y.toFixed(4), +r.z.toFixed(4)]
                });
            }
            let i = 0;
            for (const child of (obj.children || [])) {
                if (++i > 64) break;
                walk(child, depth + 1, [...path, (child.name || `#${i - 1}`)]);
            }
        };
        walk(mesh, 0, ['mesh']);
        if (rows.length > 200) rows.length = 200;

        const keyJoints = {};
        for (const jn of ['headPivot', 'body', 'torso', 'leftShoulderJoint', 'rightShoulderJoint',
                          'leftElbowJoint', 'rightElbowJoint', 'leftHipJoint', 'rightHipJoint',
                          'leftKneeJoint', 'rightKneeJoint']) {
            const j = findJoint(mesh, jn);
            keyJoints[jn] = j ? {
                found: true,
                pos: [+j.position.x.toFixed(5), +j.position.y.toFixed(5), +j.position.z.toFixed(5)],
                rot: [+j.rotation.x.toFixed(4), +j.rotation.y.toFixed(4), +j.rotation.z.toFixed(4)]
            } : { found: false };
        }

        return {
            ok: true,
            meshClass: mesh.constructor?.name || mesh.type || '?',
            hasSkeleton: !!mesh.skeleton,
            skeletonPos: mesh.skeleton ? [+mesh.skeleton.position.x.toFixed(5),
                                          +mesh.skeleton.position.y.toFixed(5),
                                          +mesh.skeleton.position.z.toFixed(5)] : null,
            posScale: +measurePosScale(mesh).toFixed(6),
            assumedScale116: +(1 / 16).toFixed(6),
            keyJoints,
            tree: rows
        };
    }

    globalThis.MF_Emotes = {
        play,
        stop,
        list,
        load,
        loadFromBuffer, 
        dumpSkeleton,
        get playing() { return state.current?.name || null; },
        
        PARTS
    };

    log('cargado. /emote <nombre> | /emote stop | /emote list | /emote reload');
})();