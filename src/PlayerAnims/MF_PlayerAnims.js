// MF_PlayerAnims.js - Orquestador de animaciones de jugador estilo Fresh Animations (EMF).
// v1.1: pack embebido (sin fetch/puente) + aplicación vía wrap de updateMatrixWorld
// (patrón VanillaAnimations.js): el wrap corre DURANTE el dibujado del juego, siempre
// después de que render() del juego setee la pose vanilla → nuestras rotaciones
// ganan sin importar el orden de RAFs. El jugador local (1ª persona no pasa por
// render()) también queda cubierto.

(function () {
    'use strict';

    const TAG = '[MF_PlayerAnims]';

    const state = {
        enabled: false,
        pack: null,          // { lines: [...] } del pack FA+
        packError: null,
        contexts: new Map(), // entityId → FrameContext
        game: null,
        lastGameScan: 0,
        wrapped: new Set(),  // Object3D con wrap instalado
        rafId: null,
        debug: false,
        tickStats: { ticks: 0, local: 0, remote: 0, errors: 0 },
        lastDebugDump: 0
    };

    const RT = () => globalThis.MF_EMFRuntime;
    const lerpN = (a, b, t) => a + (b - a) * t;

    // Nodos del rig que el pack anima (los 4 joints van aparte, congelados)
    const POSE_NODES = ['skeleton', 'body', 'headPivot', 'rightShoulder', 'leftShoulder', 'rightHip', 'leftHip'];
    // Joints congelados a 0 (requisito: como VanillaAnimations.js)
    const JOINT_NAMES = ['leftElbowJoint', 'rightElbowJoint', 'leftKneeJoint', 'rightKneeJoint'];

    function loadPack() {
        const Parser = globalThis.MF_EMFParser;
        const files = globalThis.MF_EMF_PACK_FILES;
        if (!Parser || !files) throw new Error('EMFPack/EMFParser no cargados');
        // Pack DAR v1.15: un solo player.jem con TODAS las animaciones inline
        // (walk/sprint/sneak/jump/fall/hoprun/swim/glide/levitate/climb/
        //  flaming/boiling/sneaky-dance + capas cloak/ear). Sin .jpm externos.
        state.pack = Parser.loadPack(files['player.jem'], files);
        if (!state.pack?.lines?.length) throw new Error('pack sin líneas');
    }

    // ---------- Game finder ----------
    function getGame(force = false) {
        const now = performance.now();
        if (!force && state.game?.player && now - state.lastGameScan < 1000) return state.game;
        state.lastGameScan = now;
        try {
            const react = document.querySelector('#react');
            if (react) {
                for (const root of Object.values(react)) {
                    const game = root?.updateQueue?.baseState?.element?.props?.game;
                    if (game?.player) return (state.game = game);
                }
            }
        } catch {}
        return state.game?.player ? state.game : null;
    }

    // ---------- Wraps de updateMatrixWorld ----------
    // Evaluación DENTRO del pipeline de render del juego (equivalente al
    // MixinLivingEntityRenderer de EMF Java, que corre tras setupAnim vanilla):
    // el wrap del SKELETON evalúa la pose con el estado exacto que el juego va
    // a dibujar (pose vanilla recién seteada por render(), partial correcto)
    // y la aplica ANTES de que las matrices se propaguen a los hijos.
    // Esto elimina el desfase de medio frame del RAF paralelo — causa del
    // temblor "autocorrector" (pose leída de un frame, aplicada al siguiente).
    function makeSkeletonHook(mesh, game) {
        if (mesh.skeleton._mfPASkelHook) return;
        mesh.skeleton._mfPASkelHook = true;
        mesh.skeleton._mfPASkelOrig = mesh.skeleton.updateMatrixWorld.bind(mesh.skeleton);
        mesh._mfPASkelGame = game;
        mesh.skeleton.updateMatrixWorld = function () {
            try {
                // Evaluar UNA vez por frame: el juego puede llamar
                // updateMatrixWorld varias veces por render (sombras, nametags,
                // raycasts) — cada evaluación avanzaría los drags/frame_counter
                // del pack → animación N× más rápida.
                if (state.enabled) {
                    const now = performance.now();
                    if (now !== mesh._mfPALastEval) {
                        mesh._mfPALastEval = now;
                        evalAndPublish(mesh, mesh._mfPASkelGame);
                    }
                }
            } catch (e) {
                state.tickStats.errors++;
            }
            // Pose root (skeleton): el pack escribe root.rx/rz — aplicarla aquí
            // mismo (save→apply→orig→restore), NO con wrapNode (pisaría este hook).
            const rootPose = mesh.skeleton.__mfPARootPose;
            if (rootPose) {
                const r = this.rotation, pos = this.position, sc = this.scale;
                const px = r.x, py = r.y, pz = r.z;
                const ox = pos.x, oy = pos.y, oz = pos.z;
                const osx = sc.x, osy = sc.y, osz = sc.z;
                if (rootPose.rx !== undefined) r.x = rootPose.rx;
                if (rootPose.ry !== undefined) r.y = rootPose.ry;
                if (rootPose.rz !== undefined) r.z = rootPose.rz;
                if (rootPose.sx !== undefined) sc.x = Math.max(0.01, rootPose.sx);
                if (rootPose.sy !== undefined) sc.y = Math.max(0.01, rootPose.sy);
                if (rootPose.sz !== undefined) sc.z = Math.max(0.01, rootPose.sz);
                if (rootPose.pdx !== undefined) pos.x = ox + rootPose.pdx;
                if (rootPose.pdy !== undefined) pos.y = oy + rootPose.pdy;
                if (rootPose.pdz !== undefined) pos.z = oz + rootPose.pdz;
                try { return mesh.skeleton._mfPASkelOrig.apply(this, arguments); }
                finally {
                    r.x = px; r.y = py; r.z = pz;
                    pos.x = ox; pos.y = oy; pos.z = oz;
                    sc.x = osx; sc.y = osy; sc.z = osz;
                }
            }
            return mesh.skeleton._mfPASkelOrig.apply(this, arguments);
        };
        state.wrapped.add(mesh.skeleton);
    }

    function removeSkeletonHook(mesh) {
        const sk = mesh.skeleton;
        if (!sk?._mfPASkelHook) return;
        sk.updateMatrixWorld = sk._mfPASkelOrig;
        sk._mfPASkelHook = false;
        sk._mfPASkelOrig = undefined;
        mesh._mfPASkelGame = undefined;
        state.wrapped.delete(sk);
    }

    function wrapNode(node) {
        if (node._mfPAWrapped) return;
        node._mfPAWrapped = true;
        node._mfPAOrigUMW = node.updateMatrixWorld.bind(node);
        node.updateMatrixWorld = function () {
            const pose = this.__mfPAPose;
            if (pose) {
                // Guardar estado vanilla → aplicar pose → computar matriz → restaurar.
                // Así no contaminamos node.rotation/position y el juego siempre ve
                // valores limpios (las lecturas del pack ven la pose vanilla, como EMF).
                const r = this.rotation;
                const px = r.x, py = r.y, pz = r.z;
                const pos = this.position;
                const ox = pos.x, oy = pos.y, oz = pos.z;
                const sc = this.scale;
                const osx = sc.x, osy = sc.y, osz = sc.z;
                let oq = null;
                if (pose.quatTwist) {
                    // body: en Miniblox el yaw del cuerpo vive en el QUATERNION
                    // (slerp del juego), no en rotation.y. Escribir euler absoluto
                    // dispara el onChange del euler → REESCRIBE el quaternion →
                    // destruye el yaw → cuerpo girado ~70° ("correr al lado
                    // contrario"). El pack espera semántica MC: body.ry es un
                    // twist RELATIVO al yaw del root → aplicar como rotación
                    // local ENCIMA del quaternion vanilla (YXZ: yaw·pitch·roll).
                    oq = this.quaternion.clone();
                    const QC = this.quaternion.constructor;
                    const hz = (v) => v / 2;
                    const qy = new QC(0, Math.sin(hz(pose.ry ?? 0)), 0, Math.cos(hz(pose.ry ?? 0)));
                    const qx = new QC(Math.sin(hz(pose.rx ?? 0)), 0, 0, Math.cos(hz(pose.rx ?? 0)));
                    const qz = new QC(0, 0, Math.sin(hz(pose.rz ?? 0)), Math.cos(hz(pose.rz ?? 0)));
                    this.quaternion.multiply(qy).multiply(qx).multiply(qz);
                } else {
                    if (pose.rx !== undefined) r.x = pose.rx;
                    if (pose.ry !== undefined) r.y = pose.ry;
                    if (pose.rz !== undefined) r.z = pose.rz;
                }
                // Escala EMF absoluta (1 = normal; FA+ la usa en legs para saltos)
                if (pose.sx !== undefined) sc.x = Math.max(0.01, pose.sx);
                if (pose.sy !== undefined) sc.y = Math.max(0.01, pose.sy);
                if (pose.sz !== undefined) sc.z = Math.max(0.01, pose.sz);
                // Traducciones EMF = ABSOLUTAS en unidades MC (1/16) → delta three
                if (pose.pdx !== undefined) pos.x = ox + pose.pdx;
                if (pose.pdy !== undefined) pos.y = oy + pose.pdy;
                if (pose.pdz !== undefined) pos.z = oz + pose.pdz;
                try {
                    return this._mfPAOrigUMW.apply(this, arguments);
                } finally {
                    r.x = px; r.y = py; r.z = pz;
                    if (oq) this.quaternion.copy(oq);
                    pos.x = ox; pos.y = oy; pos.z = oz;
                    sc.x = osx; sc.y = osy; sc.z = osz;
                }
            }
            return this._mfPAOrigUMW.apply(this, arguments);
        };
        state.wrapped.add(node);
    }

    function freezeJoint(joint) {
        if (joint._mfPAFrozen) return;
        joint._mfPAFrozen = true;
        joint._mfPAOrigUMW = joint.updateMatrixWorld.bind(joint);
        joint.updateMatrixWorld = function () {
            this.rotation.x = 0; this.rotation.y = 0; this.rotation.z = 0;
            return this._mfPAOrigUMW.apply(this, arguments);
        };
        state.wrapped.add(joint);
    }

    function unwrapNode(node) {
        if (node._mfPAWrapped) {
            node.updateMatrixWorld = node._mfPAOrigUMW;
            node._mfPAWrapped = false;
            node.__mfPAPose = undefined;
            node._mfPAOrigUMW = undefined;
        } else if (node._mfPAFrozen) {
            node.updateMatrixWorld = node._mfPAOrigUMW;
            node._mfPAFrozen = false;
            node._mfPAOrigUMW = undefined;
            node.rotation.x = 0; node.rotation.y = 0; node.rotation.z = 0;
        }
        state.wrapped.delete(node);
    }

    function unwrapAll() {
        for (const node of [...state.wrapped]) unwrapNode(node);
    }

    // ---------- Evaluación dentro del render (llamado por el skeleton hook) ----------
    function evalAndPublish(mesh, game) {
        const RT = globalThis.MF_EMFRuntime;
        if (!RT || !state.pack) return;

        const ent = mesh.entity;
        if (!ent) return;

        const entId = ent.id ?? (mesh.uuid ?? (mesh.uuid = Symbol()));
        let ctx = state.contexts.get(entId);
        if (!ctx) {
            ctx = new RT.FrameContext(entId);
            state.contexts.set(entId, ctx);
        }

        const s2 = RT.buildFrameState(mesh, game, game?.player);
        if (!s2) return;

        const writes = [];
        RT.evaluate(state.pack.lines, ctx, s2, writes);

        // PORT FIEL (EMF Java): el pack SIEMPRE se aplica a brazos y piernas —
        // sus fórmulas ya manejan swing_progress, is_using_item e is_blocking
        // internamente (poses de ataque/uso/blocking del pack). La exclusión
        // previa (skipArms) dejaba brazos vanilla cuando hay arma/uso — una
        // desviación del original que hacía ver el resultado "buggeado".
        // Única excepción conservada: emote del cliente en curso (el emote
        // manda; EMF también lo hace vía EMFAnimationApi hooks).
        const skipArms = (mesh.emoteAmount ?? 0) > 0.01;

        // Pose adaptada (flip de ejes + contra-rotación + head delta) — misma
        // lógica que el playground: EMFRuntime.buildPose
        const poses = RT.buildPose(writes, { skipArms });

        // Poses de NADO, ELYTRA y VUELO CREATIVO (MF_FlySwim — port del
        // vanilla MC para nado/elytra y de las fórmulas DAR v1.15 para
        // levitate): el pack solo atenúa al nadar/volar; esta pose mezcla
        // por canal con suavizado exponencial → transiciones muy fluidas.
        const FS = globalThis.MF_FlySwim;
        if (FS && !skipArms) {
            const elytra = s2.gliding;
            const swimming = s2.swimming;
            const levitating = s2.flying; // vuelo creativo (abilities.flying)
            if (elytra || swimming || levitating || mesh.__mfFlySwimActive) {
                const dt = Math.max(0.001, Math.min(0.1, s2.frameTime || 0.05));
                FS.setFrameState(s2);
                const fs = FS.animate(mesh, dt, swimming ? 1 : 0, elytra ? 1 : 0, levitating ? 1 : 0);
                mesh.__mfFlySwimActive = (fs.swim > 0.005 || fs.fly > 0.005 || fs.lev > 0.005);
                const res = FS.buildPose(fs, s2);
                if (res) {
                    const w = Math.max(res.weight.swim, res.weight.fly, res.weight.lev);
                    for (const part in res.poses) {
                        const fp = res.poses[part];
                        const pp = poses[part];
                        const out = pp ? pp : (poses[part] = {});
                        for (const ch of ['rx', 'ry', 'rz']) {
                            if (fp[ch] !== undefined) out[ch] = lerpN(out[ch] ?? 0, fp[ch], w);
                        }
                        // Traducciones DAR (unidades MC 1/16): el runtime las
                        // computa como pdx/pdy/pdz (delta three con flip de
                        // ejes x/y). ty crece hacia ABAJO en MC → pdy = -ty/16.
                        if (fp.ty !== undefined) out.pdy = (out.pdy ?? 0) + (-fp.ty / 16) * w;
                        if (fp.tz !== undefined) out.pdz = (out.pdz ?? 0) + (fp.tz / 16) * w;
                    }
                }
            }
        }

        // Publicar pose en los nodos + instalar wraps.
        // poses está indexado por parte EMF → traducir a nombre de nodo del mesh.
        const NODE_BY_PART = {
            root: 'skeleton', body: 'body', head: 'headPivot',
            right_arm: 'rightShoulder', left_arm: 'leftShoulder',
            right_leg: 'rightHip', left_leg: 'leftHip'
        };
        const NODE_BY_PART_INV = {};
        for (const p in NODE_BY_PART) NODE_BY_PART_INV[NODE_BY_PART[p]] = p;
        for (const part in poses) {
            if (part === 'root') {
                // root = skeleton: la aplica el skeleton hook (ya instalado)
                mesh.skeleton.__mfPARootPose = poses[part];
                continue;
            }
            const nodeName = NODE_BY_PART[part];
            const node = nodeName && mesh[nodeName];
            if (!node) continue;
            // body → twist quaternion (preserva el yaw vanilla del juego)
            if (part === 'body' && (poses[part].rx !== undefined ||
                poses[part].ry !== undefined || poses[part].rz !== undefined)) {
                poses[part].quatTwist = true;
            }
            node.__mfPAPose = poses[part];
            wrapNode(node);
        }
        // Nodos sin pose este frame → limpiar pose vieja para no congelarlos
        for (const name of POSE_NODES) {
            const node = mesh[name];
            if (node && node.__mfPAPose && !poses[NODE_BY_PART_INV[name]]) node.__mfPAPose = undefined;
        }
        if (!poses.root) mesh.skeleton.__mfPARootPose = undefined;
        for (const name of JOINT_NAMES) {
            const j = mesh[name];
            if (j) { j.rotation.x = 0; j.rotation.y = 0; j.rotation.z = 0; freezeJoint(j); }
        }
    }

    // ---------- Registro de meshes (instala hooks; ya no evalúa en RAF) ----------
    function registerMesh(mesh, game) {
        if (!mesh?.skeleton || !mesh.entity) return;
        makeSkeletonHook(mesh, game);
        for (const name of JOINT_NAMES) {
            const j = mesh[name];
            if (j) { j.rotation.x = 0; j.rotation.y = 0; j.rotation.z = 0; freezeJoint(j); }
        }
    }

    // ---------- Loop principal ----------
    function tick() {
        if (!state.enabled) return;
        const game = getGame();
        if (game) {
            try {
                if (game.player?.mesh?.entity) {
                    registerMesh(game.player.mesh, game);
                    state.tickStats.local++;
                }
                const ents = game.world?.entities;
                if (ents && typeof ents.values === 'function') {
                    for (const ent of ents.values()) {
                        if (!ent?.mesh || ent.mesh === game.player?.mesh) continue;
                        // Solo players (clase LF — el rig con skeleton/shoulders)
                        if (!ent.mesh.skeleton || !ent.mesh.leftShoulder) continue;
                        registerMesh(ent.mesh, game);
                        state.tickStats.remote++;
                    }
                }
            } catch (e) {
                state.tickStats.errors++;
                RT().pushLog?.({ t: 'tick_error', err: String(e?.message || e).slice(0, 100) });
                if (state.debug) console.warn(TAG, 'tick error:', e);
            }
        }
        // Resumen periódico en consola (cada 5s) si debug está activo
        if (state.debug) {
            state.tickStats.ticks++;
            const now = performance.now();
            if (now - state.lastDebugDump > 5000) {
                state.lastDebugDump = now;
                const fps = (state.tickStats.ticks / 5).toFixed(0);
                console.log(TAG, `ticks=${state.tickStats.ticks} (~${fps}fps) local=${state.tickStats.local} remotos=${state.tickStats.remote} errores=${state.tickStats.errors} ctx=${state.contexts.size} nodos=${state.wrapped.size}`);
                Object.assign(state.tickStats, { local: 0, remote: 0, errors: 0 });
            }
        }
        state.rafId = requestAnimationFrame(tick);
    }

    // ---------- API pública ----------
    function setEnabled(enabled) {
        enabled = enabled === true || enabled === 'true';
        if (enabled === state.enabled) return;
        state.enabled = enabled;
        if (enabled) {
            state.packError = null;
            try {
                const t0 = performance.now();
                loadPack();
                state.rafId = requestAnimationFrame(tick);
                console.log(TAG, 'activado —', state.pack.lines.length, 'líneas, pack en', (performance.now() - t0).toFixed(1), 'ms');
                RT().pushLog?.({ t: 'enabled', lines: state.pack.lines.length });
                // Tras 2 ticks, loguear la pose calculada del local como verificación
                setTimeout(() => {
                    try {
                        const game = getGame();
                        const m = game?.player?.mesh;
                        if (!m?.body) return;
                        const pose = (name) => {
                            const p = m[name]?.__mfPAPose;
                            return p ? { rx: p.rx?.toFixed(3), ry: p.ry?.toFixed(3), rz: p.rz?.toFixed(3) } : null;
                        };
                        console.log(TAG, 'pose local tras 2s —', JSON.stringify({
                            body: pose('body'), right_arm: pose('rightShoulder'),
                            left_arm: pose('leftShoulder'), right_leg: pose('rightHip'),
                            left_leg: pose('leftHip'),
                            kneeFrozen: !!m.leftKneeJoint?._mfPAFrozen,
                            contexts: state.contexts.size, wrapped: state.wrapped.size
                        }));
                    } catch (e) {
                        console.warn(TAG, 'no se pudo loguear pose:', e?.message);
                    }
                }, 2000);
            } catch (e) {
                state.packError = String(e?.message || e);
                console.warn(TAG, 'error cargando pack:', e?.message || e);
                state.enabled = false;
            }
        } else {
            if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
            // Remover hooks de skeleton + poses + joints congelados
            for (const node of [...state.wrapped]) {
                if (node._mfPASkelHook) {
                    const sk = node;
                    sk.updateMatrixWorld = sk._mfPASkelOrig;
                    sk._mfPASkelHook = false;
                    sk._mfPASkelOrig = undefined;
                    sk.__mfPARootPose = undefined;
                } else if (node._mfPAWrapped) {
                    node.updateMatrixWorld = node._mfPAOrigUMW;
                    node._mfPAWrapped = false;
                    node.__mfPAPose = undefined;
                    node.__mfPARootPose = undefined;
                    node._mfPAOrigUMW = undefined;
                } else if (node._mfPAFrozen) {
                    node.updateMatrixWorld = node._mfPAOrigUMW;
                    node._mfPAFrozen = false;
                    node._mfPAOrigUMW = undefined;
                    node.rotation.x = 0; node.rotation.y = 0; node.rotation.z = 0;
                }
            }
            state.wrapped.clear();
            state.contexts.clear();
            state.pack = null;
            console.log(TAG, 'desactivado —', 'wraps restaurados');
            RT().pushLog?.({ t: 'disabled' });
        }
    }

    function setDebug(v) {
        state.debug = v === true;
        console.log(TAG, 'debug ' + (state.debug ? 'ON (resumen cada 5s)' : 'OFF'));
        return state.debug;
    }

    document.addEventListener('minifeather:playeranims-config', (e) => {
        try {
            const cfg = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
            if (cfg.enabled !== undefined) setEnabled(cfg.enabled);
        } catch {}
    });

    globalThis.MF_PlayerAnims = {
        setEnabled,
        setDebug,
        get enabled() { return state.enabled; },
        get debug() { return state.debug; },
        get stats() {
            return {
                enabled: state.enabled,
                debug: state.debug,
                lines: state.pack?.lines?.length || 0,
                contexts: state.contexts.size,
                wrappedNodes: state.wrapped.size,
                packError: state.packError,
                tickStats: { ...state.tickStats }
            };
        }
    };

    // Boot log: confirma carga + dependencias (si falta algo, se ve aquí)
    const deps = {
        expr: !!globalThis.MF_EMFExpr,
        parser: !!globalThis.MF_EMFParser,
        runtime: !!globalThis.MF_EMFRuntime,
        pack: !!globalThis.MF_EMF_PACK_FILES
    };
    const missing = Object.entries(deps).filter(([, ok]) => !ok).map(([k]) => k);
    console.log(TAG, 'script cargado —', missing.length
        ? 'FALTAN dependencias: ' + missing.join(', ') + ' (revisa orden en manifest)'
        : 'dependencias OK (' + Object.keys(deps).join(', ') + ')');
})();
