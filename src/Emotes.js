// Emotes.js — Traductor de archivos .emotecraft (formato del mod Emotecraft
// de Minecraft) a poses/animaciones del jugador local en miniblox.
//
// Formato .emotecraft (https://kosmx.gitbook.io/emotecraft):
//   {
//     "name": "...", "author": "...", "description": "...",
//     "emote": {
//       "beginTick": 0, "endTick": 60, "stopTick": 66,
//       "isLoop": false, "returnTick": 20, "degrees": true,
//       "moves": [
//         { "tick": 15, "easing": "easeInOutSine", "turn": 0,
//           "head":   { "pitch": 10, "yaw": -20 },
//           "torso":  { "x": 0, "y": -4, "roll": 5 },
//           "rightArm": { "roll": 140, "bend": 30, "axis": 2 } }
//       ]
//     }
//   }
//
// - 20 ticks = 1 segundo. degrees:true → rotaciones en grados.
// - Partes → joints reales del mesh del jugador (verificados en vivo):
//     head    → headPivot
//     torso/body → body (rotación) + skeleton (posición, global)
//     leftArm → leftShoulderJoint   (bend → leftElbowJoint)
//     rightArm→ rightShoulderJoint  (bend → rightElbowJoint)
//     leftLeg → leftHipJoint        (bend → leftKneeJoint)
//     rightLeg→ rightHipJoint       (bend → rightKneeJoint)
// - Posiciones: PlayerAnimator guarda PIVOTS ABSOLUTOS del modelo MC,
//   no offsets → delta = emotePivot - vanillaPivot (ver VANILLA_PIVOT).
//   Escala: se MIDE con la separación de caderas (3.8 px MC) en vez de
//   asumir 1/16. Ejes: X/Y invertidos, Z igual (escala -1,-1,1 de MC).
// - Rotaciones (rad): pitch y yaw INVERTIDOS, roll igual; el torso invierte
//   la convención (pitch/yaw SIN invertir — ver conversor a Blockbench).
//   body.pos → mesh.skeleton (transformación global, patrón Helicopter).
// - Timeline: beginTick..endTick reproduce; con isLoop, al llegar a endTick
//   salta a returnTick y repite para siempre. SIN isLoop, al llegar a endTick
//   la pose se congela (no termina solo): dura hasta /emote stop, que funde
//   suavemente hacia el rest vanilla. "turn" genera un keyframe extra en el
//   mismo tick con rotación += turn*360° (equivale a easing constant).
// - Easings: nombres de easings.net + linear + constant (case-insensitive,
//   con o sin prefijo "ease").
//
// El runtime muestrea cada frame (rAF) y escribe joint.rotation/position.
// Verificado en vivo: el juego NO resetea las rotaciones de joints.
//
// Uso en chat: /emote <nombre> | /emote stop | /emote list | /emote reload
// Un emote = un archivo emotes/<nombre>.emotecraft

(function () {
    'use strict';

    const TAG = '[MF Emotes]';
    const DIR = 'emotes/';

    const state = {
        loaded: new Map(),      // name -> emote
        current: null,          // { name, emote, startTime, lastFrame, blend, jointList, parts }
        fadeTarget: 0,          // 1 reproduciendo, 0 fundiendo hacia el rest
        cameraChanged: false,   // se pasó a 3ª persona al reproducir
        defaults: new Map()     // joint -> {rx,ry,rz, px,py,pz} rest pose del frame actual
    };

    // ── Acceso al juego (patron comun del cliente) ──
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

    // ── Busqueda de joints por BFS sobre el mesh (patron VanillaAnimations) ──
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

    // El jugador local vive en world.entities con el mismo uuid/id que game.player
    function getLocalPlayerEntity(game) {
        const me = game?.player;
        if (!me) return null;

        // resolucion del mesh VISIBLE (patron CustomEmotesLab): por id
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

    // ── Pivots vanilla del modelo de Minecraft (px MC, PlayerAnimator) ──
    // PlayerAnimator guarda posiciones como PIVOTS ABSOLUTOS del modelo,
    // no offsets → delta = emotePivot - vanillaPivot.
    const VANILLA_PIVOT = {
        head:     { x: 0,    y: 0,  z: 0 },
        body:     { x: 0,    y: 0,  z: 0 },
        torso:    { x: 0,    y: 0,  z: 0 },
        leftArm:  { x: 5,    y: 2,  z: 0 },
        rightArm: { x: -5,   y: 2,  z: 0 },
        leftLeg:  { x: 1.9,  y: 12, z: 0.1 },
        rightLeg: { x: -1.9, y: 12, z: 0.1 }
    };

    // ── Partes Emotecraft → joints del juego ──
    // "torso" es el nombre del formato JSON; "body" el del binario.
    // Ambos se mapean al mismo joint "body" de Miniblox (hijo de skeleton).
    // Separación de posición/rotación:
    //   - *.pos  → mesh.skeleton (mueve TODO el modelo: hundirse, saltar…)
    //   - *.rot  → joint "body" (inclinar el pecho sin girar la entidad)
    // La raíz "skeleton" NUNCA se rota (giraría al jugador entero en el mundo).
    const PARTS = {
        head:    { joint: 'headPivot',          bend: null },
        torso:   { joint: 'body',              bend: null, root: 'skeleton', noRotInvert: true },
        body:    { joint: 'body',              bend: null, root: 'skeleton', isRoot: true, noRotInvert: true },
        leftArm: { joint: 'leftShoulderJoint',  bend: 'leftElbowJoint' },
        rightArm:{ joint: 'rightShoulderJoint', bend: 'rightElbowJoint' },
        leftLeg: { joint: 'leftHipJoint',       bend: 'leftKneeJoint' },
        rightLeg:{ joint: 'rightHipJoint',      bend: 'rightKneeJoint' }
    };



    // Flags de las partes estándar según KeyframeAnimation.AnimationBuilder
    // (partes desconocidas: bendable=true, scalable=true)
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

    // ── Easings (https://easings.net + linear + constant) ──
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

    // Acepta "InOutSine", "easeInQuad", "EASEOUTCUBIC", "linear", "constant"...
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

    // Los strings del header binario pueden venir como JSON string
    // ("cool sit" con comillas, o un componente {translate,fallback} de MC).
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

    // ── Parser binario .emotecraft (EmotePacket + AnimationBinary) ──
    // Estructura (little-endian NO: Java usa big-endian):
    //   int32 netVersion | byte purpose | byte nSub
    //   nSub × { byte subId | byte subVer | int32 size | contenido }
    // Sub 0 (animación): int32 tick + AnimationBinary.
    // Sub 0x11 (header): strings name, description, author [, folderpath, bages]
    const EASE_BY_ID = [null, null, null, null, null, null,
        'insine', 'outsine', 'inoutsine',                                // 6-8
        'incubic', 'outcubic', 'inoutcubic',                            // 9-11
        'inquad', 'outquad', 'inoutquad',                               // 12-14
        'inquart', 'outquart', 'inoutquart',                            // 15-17
        'inquint', 'outquint', 'inoutquint',                            // 18-20
        'inexpo', 'outexpo', 'inoutexpo',                               // 21-23
        'incirc', 'outcirc', 'inoutcirc',                               // 24-26
        'inback', 'outback', 'inoutback',                               // 27-29
        'inelastic', 'outelastic', 'inoutelastic',                      // 30-32
        'inbounce', 'outbounce', 'inoutbounce',                         // 33-35
        'catmullrom', 'step'                                            // 36-37
    ];

    // Lector big-endian sobre ArrayBuffer
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
                if (version >= 4) r.f32(); // easingArg (NaN → null)
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
        // orden OFICIAL (AnimationBinary.writePart): x, y, z, pitch, yaw,
        // roll [, bendDirection, bend] [, scaleX/Y/Z si scalable && v>=3]
        const rot = { x: [], y: [], z: [] }, pos = { x: [], y: [], z: [] };
        const bend = { kfs: [], axis: [] };
        readKeyframesBin(r, pos.x, version, keyframeSize);
        readKeyframesBin(r, pos.y, version, keyframeSize);
        readKeyframesBin(r, pos.z, version, keyframeSize);
        readKeyframesBin(r, rot.x, version, keyframeSize); // pitch
        readKeyframesBin(r, rot.y, version, keyframeSize); // yaw
        readKeyframesBin(r, rot.z, version, keyframeSize); // roll
        if (slotData.bendable) {
            readKeyframesBin(r, bend.axis, version, keyframeSize);  // bendDirection
            readKeyframesBin(r, bend.kfs, version, keyframeSize);   // bend
        }
        if (slotData.scalable && version >= 3) {
            // scaleX/Y/Z: ignorar (el juego no soporta escala de joints)
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
        if (purpose !== 0x10) return null; // FILE
        const nSub = r.u8();

        let emote = null, header = { name: null, author: null, description: null };

        for (let s = 0; s < nSub; s++) {
            const subId = r.u8();
            const subVer = r.u8();
            const size = r.i32();
            const start = r.pos;

            if (subId === 0 && !emote) {
                // EmoteDataPacket: int32 tick + AnimationBinary
                r.i32(); // tick inicial
                const beginTick = r.i32();
                const endTick = r.i32();
                const stopTick = r.i32();
                const isLoop = r.boolean();
                const returnTick = r.i32();
                const easingBefore = r.boolean(); // el ease viene del kf ANTERIOR
                r.boolean(); // nsfw
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
                    // v1: 6 partes fijas en orden
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
                r.i64(); // uuid (ignorar)

                emote = {
                    beginTick, endTick, stopTick, returnTick, isLoop, easingBefore,
                    parts,
                    // OJO: el binario guarda RADIANES (addKeyFrame sin
                    // degrees=true); solo el JSON usa "degrees"
                    degrees: false
                };
            } else if (subId === 0x11) {
                header.name = r.str();
                header.description = r.str();
                header.author = r.str();
                if (subVer >= 2) {
                    r.str(); // folderpath
                    const nBages = r.i32();
                    for (let i = 0; i < nBages; i++) r.str();
                }
            }
            r.seek(start + size); // saltar al siguiente sub-packet
        }

        if (!emote) return null;
        emote.name = unwrapHeaderString(header.name);
        emote.author = unwrapHeaderString(header.author);
        emote.description = unwrapHeaderString(header.description);
        return emote;
    }

    // Normaliza un emote (binario o JSON) a la estructura interna común:
    // grados→radianes para rotaciones/bend; posiciones: pivot absoluto MC →
    // delta contra el vanilla (el runtime aplica la escala medida del
    // esqueleto real, no un factor fijo).
    function normalizeEmote(emote) {
        const DEG = Math.PI / 180;
        const rotScale = emote.degrees === false ? 1 : DEG; // JSON puede venir en rad
        for (const [name, s] of Object.entries(emote.parts)) {
            for (const ch of ['x', 'y', 'z']) {
                for (const kf of s.rot[ch]) kf.v *= rotScale;
            }
            if (s.bend) {
                for (const kf of s.bend.kfs) kf.v *= rotScale; // Mismo unit que rot
            }
            // posiciones: pivot absoluto → delta vs vanilla del modelo MC
            const vp = VANILLA_PIVOT[name] || { x: 0, y: 0, z: 0 };
            for (const ch of ['x', 'y', 'z']) {
                for (const kf of s.pos[ch]) kf.v -= vp[ch];
            }
            // ordenar por tick
            for (const ch of ['x', 'y', 'z']) {
                s.rot[ch].sort((a, b) => a.tick - b.tick);
                s.pos[ch].sort((a, b) => a.tick - b.tick);
            }
            if (s.bend) s.bend.kfs.sort((a, b) => a.tick - b.tick);
            // kf implícito en rest (0) al inicio de cada canal si falta
            const chans = [s.rot.x, s.rot.y, s.rot.z, s.pos.x, s.pos.y, s.pos.z];
            if (s.bend) chans.push(s.bend.kfs);
            for (const kfs of chans) {
                if (kfs.length && kfs[0].tick > emote.beginTick) {
                    kfs.unshift({ tick: emote.beginTick, v: 0, ease: LINEAR });
                }
            }
        }
        // rellenar defaults de timeline si faltan
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

    // ── Parser .emotecraft JSON → estructura interna (en grados/px;
    // normalizeEmote hace la conversión final) ──
    function parseEmotecraft(json) {
        const emote = json?.emote;
        if (!emote || typeof emote !== 'object' || !Array.isArray(emote.moves)) return null;

        const isLoop = emote.isLoop === true || String(emote.isLoop) === 'true';

        const beginTick = Number.isFinite(+emote.beginTick) ? +emote.beginTick : 0;
        const endTick = Number.isFinite(+emote.endTick) ? +emote.endTick : 0;
        const stopTick = Number.isFinite(+emote.stopTick) ? +emote.stopTick : 0;
        const returnTick = Number.isFinite(+emote.returnTick) ? +emote.returnTick : beginTick;

        // parts[parte] = { rot: {x:[],y:[],z:[]}, pos: {x:[],y:[],z:[]}, bend: {kfs:[], axis:'x'} }
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
        // [canalRot] → índice en rot
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
                // rotaciones y posición del keyframe
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
                // "axis" (= bendDirection) es un ANGULO en rad (isAngle=true):
                // eje = (cos a, 0, sin a). Se guarda como kfs si cambia o fijo.
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

            // "turn": keyframe extra en el mismo tick con rot += turn vueltas
            // completas (los canales de posición/bend no se ven afectados).
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
            degrees: emote.degrees !== false, // kazotsky_kick.json usa radianes
            parts
        };
    }

    // ── Muestreo de un canal (clamped en los extremos) ──
    // easingBefore=true → el ease viene del keyframe ANTERIOR (como MC),
    // si no del siguiente. Es lo que hace getValueFromKeyframes.
    function sample(kfs, t, easingBefore) {
        const n = kfs.length;
        if (n === 0) return 0;
        if (n === 1 || t <= kfs[0].tick) return kfs[0].v;
        if (t >= kfs[n - 1].tick) return kfs[n - 1].v;
        let i = 0;
        while (i < n - 1 && kfs[i + 1].tick <= t) i++;
        const a = kfs[i], b = kfs[i + 1];
        if (b.tick <= a.tick) return b.v; // keyframes en el mismo tick ("turn")
        let u = (t - a.tick) / (b.tick - a.tick);
        u = Math.min(1, Math.max(0, u));
        const e = (easingBefore ? a : b).ease(u);
        return a.v + (b.v - a.v) * e;
    }

    // ── Muestreo con wrap de loop (playerAnimator: el tiempo de muestreo se
    // pliega al rango [returnTick, endTick] cuando ya empezo el loop). ──
    function sampleLoop(kfs, t, emote) {
        if (!emote.isLoop || t <= emote.endTick) return sample(kfs, t, emote.easingBefore);
        const span = emote.endTick - emote.returnTick + 1;
        if (span <= 1) return sample(kfs, t, emote.easingBefore);
        return sample(kfs, emote.returnTick + ((t - emote.returnTick) % span), emote.easingBefore);
    }

    // ── Escala real del esqueleto (medida, no asumida) ──
    // Las caderas de MC están a 3.8 px de distancia (±1.9). Midiendo la
    // separación real en el mesh obtenemos unidades-miniblox por px MC.
    // Los hip joints comparten posición LOCAL (hijos de padres distintos),
    // así que se mide en espacio MUNDO con getWorldPosition. Cache por mesh.
    const posScaleCache = new WeakMap();

    function measurePosScale(mesh) {
        if (posScaleCache.has(mesh)) return posScaleCache.get(mesh);
        let scale = 1 / 16, hipDist = null;
        try {
            const lj = findJoint(mesh, 'leftHipJoint');
            const rj = findJoint(mesh, 'rightHipJoint');
            if (lj && rj) {
                // Usar posiciones MUNDIALES: los hip joints tienen la misma
                // posición local (hijos de padres distintos), solo difieren
                // en espacio mundo.
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

    // ── Rest pose y desfase por frame ──
    // Verificado en vivo contra el juego real:
    // - ROTACIONES: el render vanilla las resetea cada frame → tras el
    //   render, el valor crudo YA es el vanilla de ese frame.
    // - POSICIONES: el render vanilla NO las resetea → el valor crudo es
    //   vanilla + lo que escribimos en el frame anterior; se resta para
    //   recuperar el vanilla (si no, el offset se acumula y el cuerpo vuela).
    // El rest de POSICION se captura UNA SOLA VEZ al empezar el emote (es
    // fijo del modelo); re-derivarlo cada frame de un valor contaminable
    // era la causa del drift ("las pos no se resetean").
    const lastWritten = new WeakMap(); // joint -> {rx,ry,rz, px,py,pz}

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

    function vanillaOf(joint) {
        const d = state.defaults.get(joint);
        const w = lastWritten.get(joint);
        return {
            rx: joint.rotation.x, ry: joint.rotation.y, rz: joint.rotation.z,
            px: d ? d.px : joint.position.x - (w ? w.px : 0),
            py: d ? d.py : joint.position.y - (w ? w.py : 0),
            pz: d ? d.pz : joint.position.z - (w ? w.pz : 0)
        };
    }

    // volver al vanilla y olvidar el desfase (para restaurar al terminar)
    // Las ROTACIONES tambien se restauran explicitamente: codos/rodillas no
    // son re-poseados por el vanilla en idle, asi que quedarian congelados
    // en la pose del emote si solo esperaramos al reset del render.
    function restoreJoint(joint) {
        const d = state.defaults.get(joint);
        const w = lastWritten.get(joint);
        if (w) {
            joint.position.set(
                joint.position.x - w.px, joint.position.y - w.py, joint.position.z - w.pz
            );
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

    // ── Runtime ──
    // IMPORTANTE: el juego resetea las rotaciones de los joints en cada
    // render vanilla. Escribir la pose desde un rAF no sirve: el render la
    // pisa antes de dibujar. Solución (mismo patrón que CustomEmotesLab):
    // hookear mesh.render y aplicar la pose DESPUÉS del render vanilla,
    // dentro del mismo frame.
    function stop() {
        if (state.current) state.fadeTarget = 0; // fundir y luego restaurar
    }

    function finishStop() {
        state.current = null;
        if (state.defaults.size) restoreAll();
        leaveCamera(state.player);
        log('emote terminado');
    }

    // aplica la pose del emote sobre el rest del frame actual.
    // se llama DESPUÉS del render vanilla del mesh (hook de mesh.render o rAF).
    function applyPose(mesh) {
        const cur = state.current;
        if (!cur || !mesh) return;
        cur.framesSeen = (cur.framesSeen || 0) + 1; // el hook esta disparando

        const now = performance.now();
        // dt para el lerp del blend
        const dt = Math.min(0.1, (now - cur.lastFrame) / 1000);
        cur.lastFrame = now;

        // blend suave hacia el objetivo (1 al reproducir, 0 al parar)
        const speed = state.fadeTarget > 0 ? 15 : 20;
        const smoothing = 1 - Math.exp(-speed * dt);
        cur.blend += (state.fadeTarget - cur.blend) * smoothing;
        if (state.fadeTarget === 0 && cur.blend < 0.01) { finishStop(); return; }

        const t = ((now - cur.startTime) / 1000) * 20; // ticks MC
        const emote = cur.emote;
        let blend = cur.blend, tt;

        // Semantica playerAnimator (KeyframeAnimationPlayer):
        // - intro: [beginTick, returnTick) una sola vez
        // - loop:  [returnTick, endTick]  (solo si isLoop)
        // - fin:   NUNCA termina solo: sin isLoop la pose se congela en
        //   endTick (los keyframes extrapolan con easing constant) hasta que
        //   el usuario pone /emote stop (que funde hacia el rest vanilla).
        if (!emote.isLoop && t > emote.endTick) {
            tt = emote.endTick; // mantener la pose final
        } else {
            tt = t;              // intro + loop (sampleTick pliega al rango)
        }

        // Recuperar el vanilla de ESTE frame:
        // - posiciones: restar lo escrito el frame anterior (no se resetean).
        // - rotaciones: el render vanilla re-posea la mayoria de joints cada
        //   frame, pero NO todos (codos/rodillas en idle; ademas el hook de
        //   render y el rAF pueden disparar applyPose dos veces por frame).
        //   Si el valor crudo de un canal es EXACTAMENTE lo que escribimos
        //   (default + desfase), el vanilla no lo toco: conservar el default
        //   anterior de ESE canal en vez de adoptarlo. Si no, el default se
        //   contamina con la pose del emote, el fade-out no vuelve al rest y
        //   al terminar el joint queda congelado en la pose final (la
        //   "postura rara" al acabar el emote).
        for (const joint of cur.jointList) {
            const v = vanillaOf(joint);
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

        // Composicion de rotaciones EXACTA de MC: R = Rz(roll)·Ry(yaw)·Rx(pitch)
        // (three.js con Euler 'XYZ' compone al reves; para emotes con yaw+roll
        // combinados la pose saldria completamente distinta). Se construye el
        // quaternion MC, se slerpea con el vanilla y se convierte a Euler XYZ.
        function qMul(a, b) { // devuelve a * b en un objeto NUEVO
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
            if (d > 0.9995) { // casi paralelos → nlerp
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
            // Extraccion Euler 'XYZ' de three.js (Euler.setFromRotationMatrix):
            //   y = asin(2(wy + xz))  con clamp
            //   x = atan2(2(wx - yz), 1 - 2(x²+y²))
            //   z = atan2(2(wz - xy), 1 - 2(y²+z²))
            const n = Math.hypot(qq.x, qq.y, qq.z, qq.w) || 1;
            const x = qq.x / n, y = qq.y / n, z = qq.z / n, w = qq.w / n;
            const sy = 2 * (w * y + z * x);
            if (Math.abs(sy) >= 1) {
                // gimbal lock: three.js fija z=0 y reparte en x
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

            // La rotacion del emote REEMPLAZA la vanilla (AnimationApplier
            // hace setRotation con el valor muestreado, no lo suma).
            // blend hace slerp(vanilla → emote), como AbstractFadeModifier.
            // Convencion MC→miniblox (MC renderiza modelos con escala
            // (-1,-1,1) → conjugacion de rotaciones): pitch y yaw se
            // INVIERTEN, roll se CONSERVA. El TORSO invierte esa
            // convencion (pitch/yaw sin negar — mismo criterio que el
            // conversor oficial a Blockbench).
            const inv = part.noRotInvert ? 1 : -1;
            if (part.hasRot && d) {
                const p = inv * sampleLoop(part.rot.x, tt, emote), y = inv * sampleLoop(part.rot.y, tt, emote), r = sampleLoop(part.rot.z, tt, emote);
                // R = Rz(r)·Ry(y)·Rx(p) (orden MC), slerp con el vanilla
                let qe = qMul(qMul(qAxis([0, 0, 1], r), qAxis([0, 1, 0], y)), qAxis([1, 0, 0], p));
                const qv2 = qMul(qMul(qAxis([0, 0, 1], d.rz), qAxis([0, 1, 0], d.ry)), qAxis([1, 0, 0], d.rx));
                qe = qSlerp(qv2, qe, blend);
                const e = qToEulerXYZ(qe);
                j.rotation.set(e.x, e.y, e.z);
                lastWritten.set(j, { rx: e.x - d.rx, ry: e.y - d.ry, rz: e.z - d.rz, px: 0, py: 0, pz: 0 });
            }
            // posición: delta PA → espacio render DIRECTO, sin negar ejes.
            // Emotecraft aplica la pos al modelo como (-x,-y,z)/16 (espacio
            // MC: Y-abajo, X espejado); el render del modelo invierte X e Y
            // otra vez (scale -1,-1,1) → el delta final en espacio three.js
            // (Y-arriba) es (x,y,z)*escala tal cual: levitación +y SUBE
            // (+4.87px), sentarse -y BAJA (cool sit -0.668px, sit -4px).
            // ESCALA MEDIDA del esqueleto (u-miniblox/px-MC, measurePosScale).
            // La parte "body" va a mesh.skeleton (global: mueve TODO el
            // modelo libremente en Y/Z, patrón Helicopter).
            if (part.hasPos) {
                const pj = part.rootJoint || j;
                const pd = state.defaults.get(pj) || { px: pj.position.x, py: pj.position.y, pz: pj.position.z };
                const k = cur.posScale * blend;
                const ox = k * sampleLoop(part.pos.x, tt, emote),
                      oy = k * sampleLoop(part.pos.y, tt, emote),
                      oz = k * sampleLoop(part.pos.z, tt, emote);
                pj.position.set(pd.px + ox, pd.py + oy, pd.pz + oz);
                const w = lastWritten.get(pj) || { rx: 0, ry: 0, rz: 0 };
                lastWritten.set(pj, { ...w, px: ox, py: oy, pz: oz });
            }
            // bend: en MC deforma el cubo (bendylib); aqui se aplica como
            // rotacion del joint hijo (codo/rodilla). bendDirection es un
            // ANGULO continuo (rad): eje = (cos a, 0, sin a). Proyectando
            // sobre los canales Euler del codo: rx += b*cos(a), rz += b*sin(a)
            // (convencion MC→three: pitch y roll negados).
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

    // ── Hook del render del mesh del jugador local ──
    // Guardamos el mesh en el closure: el juego puede llamar render() con
    // `this` desacoplado (const r = mesh.render; r()), lo que romperia un
    // check de `this === hookState.mesh`.
    // NOTA: el juego REEMPLAZA mesh.render periodicamente (LOD/refresh),
    // invalidando el wrapper; el loop rAF (ensureRafLoop) actua como
    // heartbeat que reaplica la pose aunque el hook se pierda.
    const hookState = { mesh: null, wrapper: null };

    function hookMeshRender(mesh) {
        if (!mesh || typeof mesh.render !== 'function') return false;
        if (hookState.mesh === mesh && mesh.render === hookState.wrapper) return true;

        const target = mesh;
        const original = mesh.render;
        const wrapper = function (...args) {
            const result = original.apply(this, args);
            if (state.current) {
                try { applyPose(target); }
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

    // ── Heartbeat rAF ──
    // applyPose desde requestAnimationFrame: inmune al reemplazo de
    // mesh.render por el juego. Se detiene solo cuando no hay emote activo.
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

    // ── Cámara: en primera persona el juego no renderiza el mesh local,
    // así que el hook de render nunca dispararía. Cambiamos a tercera
    // persona al reproducir y volvemos al terminar (patron CustomEmotesLab).
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

        // cortar cualquier emote vanilla local para que no compita con la pose
        try { game.player.endEmoteLocally?.(false); } catch {}

        // si ya habia un emote, restaurar antes de empezar el nuevo
        if (state.current) finishStop();

        const parts = [];
        const jointList = new Set();
        for (const [partName, s] of Object.entries(emote.parts)) {
            const def = PARTS[partName];
            if (!def) continue;
            const joint = findJoint(ent.mesh, def.joint);
            const bendJoint = def.bend ? findJoint(ent.mesh, def.bend) : null;
            // body/torso: posición va a mesh.skeleton (global, patrón
            // Helicopter p.s.position), rotación al joint visual.
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

        const posScale = measurePosScale(ent.mesh);
        for (const joint of jointList) captureDefaults(joint);
        state.player = game.player;
        state.current = {
            name, emote, parts, jointList: [...jointList],
            startTime: performance.now(), lastFrame: performance.now(),
            posScale, blend: 0, framesSeen: 0
        };
        state.fadeTarget = 1;
        enterCamera(game.player);
        ensureRafLoop();

        // watchdog informativo: el render-hook puede perderse si el juego
        // reemplaza mesh.render; el loop rAF lo mantiene vivo igualmente.
        setTimeout(() => {
            if (state.current && state.current.framesSeen === 0) {
                console.warn(TAG, 'render-hook sin frames en 500ms (rAF sigue activo)');
            }
        }, 500);

        return { ok: true, parts: parts.map(p => p.partName), loop: emote.isLoop, endTick: emote.endTick };
    }

    // ── Carga de archivos emotes/ ──
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

    // Variantes de capitalizacion para el archivo (el fetch de la extension
    // es case-sensitive; probamos tal cual, luego Title Case).
    function nameVariants(name) {
        const raw = name.trim();
        if (!raw) return [];
        const title = raw.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
        return [...new Set([raw, title])];
    }

    // registra y normaliza un emote desde bytes ya leidos (binario o JSON).
    // load() usa fetchEmoteBuffer para obtener el buffer; loadFromBuffer es
    // el mismo pipeline sin I/O (debug / futura importacion de archivos).
    function registerEmoteBytes(buffer) {
        const bytes = new Uint8Array(buffer);
        // binario: empieza con int32 versión + 0x10 (FILE). JSON: '{'
        let emote = null;
        if (bytes.length > 6 && bytes[0] === 0x7B /* '{' */) {
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

    // rescan cada 2s por si el jugador respawnea con otro mesh: re-hookear
    setInterval(() => {
        if (!state.current) return;
        const game = getGame();
        const ent = getLocalPlayerEntity(game);
        if (!ent?.mesh) return;
        if (ent.mesh !== hookState.mesh) hookMeshRender(ent.mesh);
    }, 2000);

    function log(...args) { try { console.log(TAG, ...args); } catch {} }

    // ── Diagnostico: volcado del esqueleto real del jugador local ──
    // /emote debug → joints, pivots locales, escala medida y jerarquia.
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

        // joints clave según los nombres usados por el conversor
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

    // ── API publica ──
    globalThis.MF_Emotes = {
        play,
        stop,
        list,
        load,
        loadFromBuffer, // debug: registra un emote desde ArrayBuffer/bytes ya leidos
        dumpSkeleton,
        get playing() { return state.current?.name || null; },
        // partes Emotecraft → joints del juego (documentacion)
        PARTS
    };

    log('cargado. /emote <nombre> | /emote stop | /emote list | /emote reload');
})();