// MF_Pose.js — Editor de poses del jugador para el film mode.
//
// Permite modificar la pose (rotaciones de joints) del jugador local en
// vivo y guardar snapshots reutilizables. Basado en el hallazgo verificado
// de Emotes.js: el juego NO resetea las rotaciones de joints, así que
// escribir joint.rotation queda persistente hasta que se restaure.
//
// Partes editables (mismos joints que graba MF_Film):
//   head, body(torso), leftArm, rightArm, leftLeg, rightLeg
//   (brazos y piernas con bend de codo/rodilla)
//
// Uso:
//   MF_Pose.setPart('head', { pitch: 15, yaw: -30, roll: 0 })
//   MF_Pose.save('pose-agachado')      // snapshot de todas las partes
//   MF_Pose.apply('pose-agachado')     // aplicar un snapshot guardado
//   MF_Pose.reset()                    // volver a la pose vanilla
//   MF_Pose.list()                     // poses guardadas
//   MF_Pose.getPose()                  // pose actual como objeto
//   MF_Pose.addFaceTrigger(tick, face) // delega en FaceSwap (comodidad)
//
// Las poses se guardan en localStorage['minifeather_poses_v1'] y son
// compatibles con el formato de joints de MF_Film (radianes directos).

(function () {
    'use strict';

    if (window.__MF_Pose) return;
    const TAG = '[MF Pose]';
    const LS_KEY = 'minifeather_poses_v1';

    // partes → joints del juego (tabla PARTS de Emotes.js, simplificada)
    const PARTS = {
        head:     { joints: ['headPivot'] },
        torso:    { joints: ['body'] },
        leftArm:  { joints: ['leftShoulderJoint', 'leftElbowJoint'] },
        rightArm: { joints: ['rightShoulderJoint', 'rightElbowJoint'] },
        leftLeg:  { joints: ['leftHipJoint', 'leftKneeJoint'] },
        rightLeg: { joints: ['rightHipJoint', 'rightKneeJoint'] }
    };
    const ALL_JOINTS = Object.values(PARTS).flatMap(p => p.joints);

    const state = {
        // joint -> {x,y,z} rotación vanilla capturada al inicializar
        rest: null,
        poses: null
    };

    // ── acceso al juego (patrón común) ──
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

    function getLocalPlayerEntity(game) {
        const me = game?.player;
        if (!me) return null;
        try { const e = game.world?.getPlayerById?.(me.id); if (e?.mesh) return e; } catch {}
        try { const e = game.world?.players?.get?.(me.id); if (e?.mesh) return e; } catch {}
        try { const e = game.world?.entities?.get?.(me.id); if (e?.mesh) return e; } catch {}
        try {
            const ents = game.world?.entities;
            if (ents?.values) for (const e of ents.values()) {
                if (e?.uuid === me.uuid || e?.id === me.id) return e;
            }
        } catch {}
        return me?.mesh ? me : null;
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
            if (Array.isArray(obj.children)) for (const c of obj.children) queue.push(c);
        }
        return null;
    }

    function getMesh() {
        return getLocalPlayerEntity(getGame())?.mesh || null;
    }

    // ── pose vanilla (rest) ──
    function captureRest() {
        const mesh = getMesh();
        if (!mesh) return null;
        const rest = {};
        for (const name of ALL_JOINTS) {
            const j = findJoint(mesh, name);
            if (j) rest[name] = {
                x: j.rotation.x, y: j.rotation.y, z: j.rotation.z,
                sx: j.scale.x, sy: j.scale.y, sz: j.scale.z, // escala vanilla
                px: j.position.x, py: j.position.y, pz: j.position.z // pivot vanilla
            };
        }
        state.rest = rest;
        return rest;
    }

    function ensureRest() {
        if (!state.rest) captureRest();
        return state.rest;
    }

    // ── lectura/escritura de pose ──
    // grados → radianes por eje (interfaz amigable)
    function deg2rad(d) { return (Array.isArray(d) ? d : [d]).map(v => v * Math.PI / 180); }

    // setPart('head', {pitch, yaw, roll}) — grados
    function setPart(part, angles) {
        const def = PARTS[part];
        if (!def) throw new Error('parte desconocida: ' + part + ' (usa: ' + Object.keys(PARTS).join(', ') + ')');
        const mesh = getMesh();
        if (!mesh) throw new Error('jugador/mesh no disponible');
        ensureRest();

        const joints = def.joints.map(n => findJoint(mesh, n));
        if (!joints[0]) throw new Error('joint "' + def.joints[0] + '" no encontrado en el mesh');

        const rad = {
            x: (angles.pitch || 0) * Math.PI / 180,
            y: (angles.yaw || 0) * Math.PI / 180,
            z: (angles.roll || 0) * Math.PI / 180
        };
        // primer joint (hombro/cadera/cabeza/cuerpo) recibe la rotación completa
        joints[0].rotation.set(rad.x, rad.y, rad.z);
        // segundo joint (codo/rodilla) solo bend si se pidió
        if (joints[1] && angles.bend != null) {
            joints[1].rotation.set((angles.bend || 0) * Math.PI / 180, 0, 0);
        }
        return { ok: true, part, applied: angles };
    }

    // getPose() → { head: [rx,ry,rz], ... } en radianes (formato MF_Film)
    function getPose() {
        const mesh = getMesh();
        if (!mesh) return null;
        const pose = {};
        for (const part in PARTS) {
            const j = findJoint(mesh, PARTS[part].joints[0]);
            if (j) pose[part] = [j.rotation.x, j.rotation.y, j.rotation.z];
        }
        return pose;
    }

    // applyPose(pose) — aplica un objeto de radianes por parte
    function applyPoseObj(pose) {
        const mesh = getMesh();
        if (!mesh) throw new Error('jugador/mesh no disponible');
        for (const part in pose) {
            const def = PARTS[part];
            if (!def) continue;
            const j = findJoint(mesh, def.joints[0]);
            if (j) j.rotation.set(pose[part][0], pose[part][1], pose[part][2]);
        }
        return { ok: true };
    }

    // reset() — restaura la pose Y escala vanilla capturada
    function reset() {
        const rest = ensureRest();
        const mesh = getMesh();
        if (!mesh || !rest) return { ok: false, error: 'sin rest capturado' };
        for (const name in rest) {
            const j = findJoint(mesh, name);
            if (!j) continue;
            j.rotation.set(rest[name].x, rest[name].y, rest[name].z);
            if (rest[name].sx != null) j.scale.set(rest[name].sx, rest[name].sy, rest[name].sz);
            if (rest[name].px != null) j.position.set(rest[name].px, rest[name].py, rest[name].pz);
        }
        return { ok: true };
    }

    // ── persistencia de poses ──
    function loadPoses() {
        if (state.poses) return state.poses;
        try { state.poses = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { state.poses = {}; }
        return state.poses;
    }

    function save(name) {
        const pose = getPose();
        if (!pose) return { ok: false, error: 'jugador/mesh no disponible' };
        const poses = loadPoses();
        poses[name] = pose;
        state.poses = poses;
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(poses));
            return { ok: true, name };
        } catch (e) {
            return { ok: false, error: 'no se pudo guardar: ' + (e?.message || e) };
        }
    }

    function apply(name) {
        const poses = loadPoses();
        if (!(name in poses)) return { ok: false, error: 'pose "' + name + '" no existe (ver list())' };
        return applyPoseObj(poses[name]);
    }

    function remove(name) {
        const poses = loadPoses();
        if (!(name in poses)) return { ok: false, error: 'pose "' + name + '" no existe' };
        delete poses[name];
        state.poses = poses;
        try { localStorage.setItem(LS_KEY, JSON.stringify(poses)); } catch {}
        return { ok: true };
    }

    // presets útiles de serie (grados)
    const PRESETS = {
        'tpose': { leftArm: { pitch: 0, roll: 90 }, rightArm: { pitch: 0, roll: -90 } },
        'wave-ready': { rightArm: { pitch: -170, roll: 20, bend: 30 } },
        'point-forward': { rightArm: { pitch: -90 } },
        'salute': { rightArm: { pitch: -150, roll: 25, bend: 100 } },
        'sit': { leftLeg: { pitch: -90, bend: 90 }, rightLeg: { pitch: -90, bend: 90 } },
        'hero': { leftArm: { pitch: -160, roll: 15 }, rightArm: { pitch: -160, roll: -15 }, head: { pitch: 8 } }
    };

    function applyPreset(name) {
        const p = PRESETS[name];
        if (!p) return { ok: false, error: 'preset "' + name + '" no existe: ' + Object.keys(PRESETS).join(', ') };
        reset();
        for (const part in p) setPart(part, p[part]);
        return { ok: true, preset: name };
    }

    // ── picking estilo Blockbench: click en una extremidad del jugador ──
    // OJO: miniblox NO expone globalThis.THREE (bundle webpack). Pero las
    // instancias del juego SÍ son de las clases internas de three.js:
    //   camera.position.constructor === THREE.Vector3
    // Con eso obtenemos Vector3 completo (unproject, getWorldPosition...)
    // sin necesitar el global. El raycast punto-a-arte se hace a mano.
    function getV3(camera) {
        try { return camera?.position?.constructor || null; } catch { return null; }
    }

    function getCamera() {
        const g = getGame();
        return g?.gameScene?.camera || g?.camera || window.MF_FREECAM?.camera || null;
    }

    // canvas del juego (para NDC correcto, no contra la ventana entera)
    function getGameCanvas() {
        const g = getGame();
        const c = g?.gameScene?.renderer?.domElement || g?.renderer?.domElement;
        if (c) return c;
        let best = null;
        try {
            for (const cv of document.querySelectorAll('canvas')) {
                if (!best || cv.width * cv.height > best.width * best.height) best = cv;
            }
        } catch {}
        return best;
    }

    // radios de detección por parte (en bloques, jugador ~1.8 alto)
    const PART_RADIUS = {
        head: 0.32, torso: 0.38,
        leftArm: 0.42, rightArm: 0.42,
        leftLeg: 0.42, rightLeg: 0.42
    };

    // ── intersección rayo-triángulo (Möller–Trumbore) ──
    // devuelve t (distancia a lo largo del rayo) o null
    function rayTri(orig, dir, v0, v1, v2) {
        const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z;
        const e2x = v2.x - v0.x, e2y = v2.y - v0.y, e2z = v2.z - v0.z;
        const px = dir.y * e2z - dir.z * e2y;
        const py = dir.z * e2x - dir.x * e2z;
        const pz = dir.x * e2y - dir.y * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-9 && det < 1e-9) return null;
        const inv = 1 / det;
        const tx = orig.x - v0.x, ty = orig.y - v0.y, tz = orig.z - v0.z;
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < -1e-6 || u > 1 + 1e-6) return null;
        const qx = ty * e1z - tz * e1y;
        const qy = tz * e1x - tx * e1z;
        const qz = tx * e1y - ty * e1x;
        const v = (dir.x * qx + dir.y * qy + dir.z * qz) * inv;
        if (v < -1e-6 || u + v > 1 + 1e-6) return null;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        return t > 1e-6 ? t : null;
    }

    // devuelve { part, jointName, object, hit } o null
    function pickPart(clientX, clientY) {
        const ent = getLocalPlayerEntity(getGame());
        const mesh = ent?.mesh;
        const camera = getCamera();
        const V3 = getV3(camera);
        if (!mesh || !camera || !V3) return null;

        // NDC relativo al rect real del canvas del juego
        const rect = (getGameCanvas() || document.body).getBoundingClientRect();
        const ndcX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        const ndcY = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;

        // rayo: origen = pos mundo de la cámara, dir = unproject del punto
        let origin, dir;
        try {
            camera.updateMatrixWorld?.();
            origin = new V3().setFromMatrixPosition(camera.matrixWorld);
            dir = new V3(ndcX, ndcY, 0.5).unproject(camera).sub(origin).normalize();
            if (!Number.isFinite(dir.x) || dir.lengthSq() === 0) return null;
        } catch { return null; }

        try { mesh.updateMatrixWorld(true); } catch {}

        // recolectar meshes con su parte asociada
        // mapa joint→parte con TODOS los joints (primario + codo/rodilla)
        const jointToPart = {};
        for (const part in PARTS) for (const j of PARTS[part].joints) jointToPart[j] = part;

        const meshes = [];
        mesh.traverse(o => { if (o?.isMesh && o.geometry) meshes.push(o); });
        if (!meshes.length) return null;

        // intersecar rayo contra TODOS los triángulos; el hit MÁS CERCANO a
        // la cámara gana (así la cabeza delante del torso se selecciona bien)
        let best = null; // { t, part, obj, tri }
        const vA = new V3(), vB = new V3(), vC = new V3();
        for (const m of meshes) {
            const geo = m.geometry;
            const posAttr = geo?.attributes?.position;
            if (!posAttr) continue;
            let index = geo.index?.array || null;
            const count = posAttr.count;

            // parte dueña de este mesh: subir la jerarquía buscando un joint
            let ownerPart = null, ownerJoint = null;
            let node = m;
            while (node && node !== mesh.parent) {
                if (node.name && jointToPart[node.name]) { ownerPart = jointToPart[node.name]; ownerJoint = node.name; break; }
                node = node.parent;
            }

            // matriz local→mundo de este mesh
            let mw = null;
            try { m.updateMatrixWorld?.(true); mw = m.matrixWorld; } catch {}
            if (!mw) continue;
            const e = mw.elements;

            const worldOf = (i, out) => {
                const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
                // multiplicar matriz 4x4 (column-major, estilo three.js)
                out.x = e[0] * x + e[4] * y + e[8] * z + e[12];
                out.y = e[1] * x + e[5] * y + e[9] * z + e[13];
                out.z = e[2] * x + e[6] * y + e[10] * z + e[14];
            };

            const triCount = index ? index.length / 3 : count / 3;
            for (let ti = 0; ti < triCount; ti++) {
                let i0, i1, i2;
                if (index) { i0 = index[ti * 3]; i1 = index[ti * 3 + 1]; i2 = index[ti * 3 + 2]; }
                else { i0 = ti * 3; i1 = ti * 3 + 1; i2 = ti * 3 + 2; }
                worldOf(i0, vA); worldOf(i1, vB); worldOf(i2, vC);
                const t = rayTri(origin, dir, vA, vB, vC);
                if (t == null) continue;
                if (!best || t < best.t) best = { t, part: ownerPart, obj: m, jointName: ownerJoint };
            }
        }
        if (!best || !best.part) {
            // sin hit exacto o sin dueño por jerarquía (modelo skinned):
            // fallback al joint más cercano al rayo (radio por parte)
            return pickByProximity(mesh, origin, dir, V3);
        }
        const point = new V3().copy(dir).multiplyScalar(best.t).add(origin);
        return { part: best.part, jointName: best.jointName, object: best.obj, hit: { point } };
    }

    // fallback: joint cuyo pivot esté más cerca del eje del rayo (skinned)
    function pickByProximity(mesh, origin, dir, V3) {
        let best = null;
        const wp = new V3(), tmp = new V3();
        for (const part in PARTS) {
            const j = findJoint(mesh, PARTS[part].joints[0]);
            if (!j) continue;
            try { j.getWorldPosition(wp); } catch { continue; }
            tmp.copy(wp).sub(origin);
            const t = tmp.dot(dir);
            if (t < 0.05) continue;
            const d = tmp.copy(wp).sub(new V3().copy(dir).multiplyScalar(t).add(origin)).length();
            const r = PART_RADIUS[part] || 0.4;
            const score = d - r;
            if (score < 0 && (!best || score < best.score)) {
                best = { score, part, jointName: PARTS[part].joints[0], joint: j, point: wp.clone() };
            }
        }
        if (!best) return null;
        // objeto para resaltar: mesh hijo más cercano al punto
        let obj = null, bestD = Infinity;
        const probe = new V3();
        mesh.traverse(o => {
            if (!o?.isMesh || !o.geometry) return;
            try {
                o.getWorldPosition(probe);
                const dd = probe.distanceTo(best.point);
                if (dd < bestD) { bestD = dd; obj = o; }
            } catch {}
        });
        return { part: best.part, jointName: best.jointName, object: obj || mesh, hit: { point: best.point } };
    }

    // ── escala de partes (resize estilo Blockbench) ──
    // setScale(part, {x, y, z}) con multiplicadores absolutos (1 = vanilla).
    // El rest-pose también captura la escala original para revertirla.
    function getScale(part) {
        const def = PARTS[part];
        if (!def) throw new Error('parte desconocida: ' + part);
        const mesh = getMesh();
        if (!mesh) return null;
        const j = findJoint(mesh, def.joints[0]);
        return j ? { x: j.scale.x, y: j.scale.y, z: j.scale.z } : null;
    }

    function setScale(part, s) {
        const def = PARTS[part];
        if (!def) throw new Error('parte desconocida: ' + part + ' (usa: ' + Object.keys(PARTS).join(', ') + ')');
        const mesh = getMesh();
        if (!mesh) throw new Error('jugador/mesh no disponible');
        const j = findJoint(mesh, def.joints[0]);
        if (!j) throw new Error('joint "' + def.joints[0] + '" no encontrado');
        const clampS = (v) => Math.min(3, Math.max(0.1, v));
        const cur = { x: j.scale.x, y: j.scale.y, z: j.scale.z };
        const nx = s.uniform != null ? clampS(s.uniform) : (s.x != null ? clampS(s.x) : cur.x);
        const ny = s.uniform != null ? clampS(s.uniform) : (s.y != null ? clampS(s.y) : cur.y);
        const nz = s.uniform != null ? clampS(s.uniform) : (s.z != null ? clampS(s.z) : cur.z);
        j.scale.set(nx, ny, nz);
        return { ok: true, part, scale: { x: nx, y: ny, z: nz } };
    }

    // ── translate de partes (offset de posición del joint) ──
    // getOffset(part) → offset en unidades de mundo respecto al pivot vanilla
    // setOffset(part, {x,y,z}) — en bloques (1 = 1 bloque)
    function getOffset(part) {
        const def = PARTS[part];
        if (!def) throw new Error('parte desconocida: ' + part);
        const mesh = getMesh();
        if (!mesh) return null;
        const j = findJoint(mesh, def.joints[0]);
        if (!j) return null;
        const rest = ensureRest();
        const r = rest?.[def.joints[0]];
        if (!r) return { x: 0, y: 0, z: 0 };
        return { x: j.position.x - r.px, y: j.position.y - r.py, z: j.position.z - r.pz };
    }

    function setOffset(part, off) {
        const def = PARTS[part];
        if (!def) throw new Error('parte desconocida: ' + part + ' (usa: ' + Object.keys(PARTS).join(', ') + ')');
        const mesh = getMesh();
        if (!mesh) throw new Error('jugador/mesh no disponible');
        const j = findJoint(mesh, def.joints[0]);
        if (!j) throw new Error('joint "' + def.joints[0] + '" no encontrado');
        const rest = ensureRest();
        const r = rest?.[def.joints[0]] || { px: 0, py: 0, pz: 0 };
        const clampO = (v) => Math.min(2, Math.max(-2, v));
        const nx = r.px + (off.x != null ? clampO(off.x) : j.position.x - r.px);
        const ny = r.py + (off.y != null ? clampO(off.y) : j.position.y - r.py);
        const nz = r.pz + (off.z != null ? clampO(off.z) : j.position.z - r.pz);
        j.position.set(nx, ny, nz);
        return { ok: true, part, offset: { x: nx - r.px, y: ny - r.py, z: nz - r.pz } };
    }

    // ── rotación de partes relativa a la cámara (estilo Blockbench) ──
    // El drag del ratón se convierte en una rotación en ESPACIO MUNDO
    // alrededor de los ejes right/up de la CÁMARA, y luego se convierte
    // al espacio local del joint con cuaterniones. Así "adelante/atrás"
    // funciona sin importar desde dónde mires al personaje:
    //   qDelta  = rot(up, aU) * rot(right, aR)      (en mundo)
    //   qNewWorld = qDelta * qStartWorld            (premultiply en mundo)
    //   qLocal  = qParentWorld⁻¹ * qNewWorld        (a espacio del joint)
    //   euler   = setFromQuaternion(qLocal, order)  (orden del joint)
    //
    // Flujo por drag (los deltas son TOTALES desde el mousedown, para
    // que el snap de 15° y la repetición de eventos sean estables):
    //   const h = MF_Pose.beginRotateWorld('rightArm', camera)
    //   MF_Pose.applyRotateWorld(h, dxTotal, dyTotal, snap15, mirror)
    //   MF_Pose.endRotateWorld(h)
    const rotDrags = new Map();
    let rotDragSeq = 0;

    function qInv(q) {
        try { return q.invert(); } catch { return q.conjugate(); }
    }

    // refleja un eje a través del plano con normal n (espejo sagital)
    function reflectAxis(a, n) {
        if (!n) return a;
        const d = 2 * (a.x * n.x + a.y * n.y + a.z * n.z);
        return a.clone().addScaledVector(n, -d);
    }

    function beginRotateWorld(part, camera) {
        const def = PARTS[part];
        if (!def) return null;
        const mesh = getMesh();
        if (!mesh) return null;
        const j = findJoint(mesh, def.joints[0]);
        if (!j?.quaternion) return null;
        try {
            const Q = j.quaternion.constructor;
            const st = {
                part, joint: j, Q,
                camera: camera || getCamera(),
                qStartWorld: new Q(),
                qParentWorldInv: new Q()
            };
            j.getWorldQuaternion(st.qStartWorld);
            if (j.parent?.quaternion) j.parent.getWorldQuaternion(st.qParentWorldInv);
            qInv(st.qParentWorldInv);

            // normal de espejo = eje X local del personaje en mundo (plano sagital)
            try {
                mesh.updateMatrixWorld?.(true);
                const V3 = camera?.position?.constructor || j.position.constructor;
                const e = mesh.matrixWorld.elements;
                st.mirrorN = new V3(e[0], e[1], e[2]).normalize();
            } catch {}

            // parte espejo capturada al inicio (Shift puede activarse a mitad del drag)
            const mp = ({ leftArm: 'rightArm', rightArm: 'leftArm', leftLeg: 'rightLeg', rightLeg: 'leftLeg' })[part];
            if (mp) {
                const mj = findJoint(mesh, PARTS[mp].joints[0]);
                if (mj?.quaternion) {
                    st.mirrorPart = mp;
                    st.mirrorJoint = mj;
                    st.qMirrorStart = new Q();
                    st.qMirrorParentInv = new Q();
                    mj.getWorldQuaternion(st.qMirrorStart);
                    if (mj.parent?.quaternion) mj.parent.getWorldQuaternion(st.qMirrorParentInv);
                    qInv(st.qMirrorParentInv);
                }
            }
            const id = ++rotDragSeq;
            rotDrags.set(id, st);
            return id;
        } catch { return null; }
    }

    function applyRotateWorld(handle, dxTotal, dyTotal, snap15, mirror) {
        const st = rotDrags.get(handle);
        if (!st) return null;
        const camera = st.camera || getCamera();
        if (!camera?.matrixWorld) return null;
        try {
            camera.updateMatrixWorld?.();
            const V3 = camera.position.constructor;
            const e = camera.matrixWorld.elements;
            const right = new V3(e[0], e[1], e[2]).normalize(); // columna X
            const back = new V3(e[8], e[9], e[10]).normalize(); // columna Z (hacia el espectador)

            // drag vertical → eje horizontal de la cámara (sube/baja, va y
            // viene en profundidad = adelante/atrás). drag horizontal → eje
            // de VISTA (barrido lateral en el plano de la pantalla). Rotar
            // sobre el eje vertical era un twist invisible para un brazo
            // colgando — así ambos drags SIEMPRE mueven la parte.
            const k = 0.5 * Math.PI / 180;
            let aR = dyTotal * k;
            let aB = dxTotal * k;
            if (snap15) {
                const s = 15 * Math.PI / 180;
                aR = Math.round(aR / s) * s;
                aB = Math.round(aB / s) * s;
            }

            const qDelta = new st.Q().setFromAxisAngle(back, aB).multiply(new st.Q().setFromAxisAngle(right, aR));

            // joint seleccionado: delta en mundo → espacio local
            const qNew = qDelta.clone().multiply(st.qStartWorld);
            const qLocal = st.qParentWorldInv.clone().multiply(qNew);
            const ord = st.joint.rotation?.order || 'XYZ';
            const eu = new (st.joint.rotation.constructor)().setFromQuaternion(qLocal, ord);
            st.joint.rotation.set(eu.x, eu.y, eu.z);

            const deg = (r) => r * 180 / Math.PI;
            const out = { deg: [deg(eu.x), deg(eu.y), deg(eu.z)] };

            // espejo: la reflexión invierte el sentido (det=-1):
            // M·rot(a,θ)·M⁻¹ = rot(Ma,−θ) → ambos lados van "adelante" juntos
            if (mirror && st.mirrorJoint) {
                const mR = reflectAxis(right, st.mirrorN);
                const mB = reflectAxis(back, st.mirrorN);
                const qDeltaM = new st.Q().setFromAxisAngle(mB, -aB).multiply(new st.Q().setFromAxisAngle(mR, -aR));
                const qNewM = qDeltaM.clone().multiply(st.qMirrorStart);
                const qLocalM = st.qMirrorParentInv.clone().multiply(qNewM);
                const ordM = st.mirrorJoint.rotation?.order || 'XYZ';
                const euM = new (st.mirrorJoint.rotation.constructor)().setFromQuaternion(qLocalM, ordM);
                st.mirrorJoint.rotation.set(euM.x, euM.y, euM.z);
                out.mirrorDeg = [deg(euM.x), deg(euM.y), deg(euM.z)];
            }
            return out;
        } catch { return null; }
    }

    function endRotateWorld(handle) { rotDrags.delete(handle); }

    // ── mover partes en espacio MUNDO (gizmo y drag con click der.) ──
    // El personaje tiene yaw → local ≠ mundo. Convertimos los ejes mundo
    // al espacio del padre del joint antes de tocar la posición.

    // eje unitario mundo → vector en espacio local del padre del joint
    function worldAxisToLocal(joint, ax, ay, az) {
        try {
            joint.parent?.updateMatrixWorld?.(true);
            const V3 = joint.position.constructor;
            const v = new V3(ax, ay, az);
            if (joint.parent?.quaternion) {
                const pq = new joint.parent.quaternion.constructor();
                joint.parent.getWorldQuaternion(pq);
                qInv(pq);
                v.applyQuaternion(pq);
            }
            return v;
        } catch { return null; }
    }

    function clampOffsetToRest(j, restName) {
        const rest = ensureRest();
        const r = rest?.[restName];
        if (!r) return;
        j.position.x = r.px + Math.min(2, Math.max(-2, j.position.x - r.px));
        j.position.y = r.py + Math.min(2, Math.max(-2, j.position.y - r.py));
        j.position.z = r.pz + Math.min(2, Math.max(-2, j.position.z - r.pz));
    }

    // mover una parte a lo largo de un eje MUNDO (lo que arrastra el gizmo)
    function addWorldOffset(part, axisName, amount) {
        const def = PARTS[part];
        if (!def) throw new Error('parte desconocida: ' + part);
        const mesh = getMesh();
        if (!mesh) throw new Error('jugador/mesh no disponible');
        const j = findJoint(mesh, def.joints[0]);
        if (!j) throw new Error('joint "' + def.joints[0] + '" no encontrado');
        const axes = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
        if (!axes[axisName]) throw new Error('eje desconocido: ' + axisName);
        const v = worldAxisToLocal(j, axes[axisName][0], axes[axisName][1], axes[axisName][2]);
        if (!v) throw new Error('sin conversión mundo→local');
        j.position.x += v.x * amount;
        j.position.y += v.y * amount;
        j.position.z += v.z * amount;
        clampOffsetToRest(j, def.joints[0]);
        return getOffset(part);
    }

    // mover una parte en el PLANO DE PANTALLA de la cámara (drag libre con
    // click derecho): right/up de la cámara → espacio local del joint.
    // dy invertido porque en pantalla Y crece hacia abajo.
    function addScreenOffset(part, camRight, camUp, dxWorld, dyWorld) {
        const def = PARTS[part];
        if (!def) throw new Error('parte desconocida: ' + part);
        const mesh = getMesh();
        if (!mesh) throw new Error('jugador/mesh no disponible');
        const j = findJoint(mesh, def.joints[0]);
        if (!j) throw new Error('joint "' + def.joints[0] + '" no encontrado');
        const rx = worldAxisToLocal(j, camRight.x, camRight.y, camRight.z);
        const uy = worldAxisToLocal(j, camUp.x, camUp.y, camUp.z);
        if (!rx || !uy) throw new Error('sin conversión mundo→local');
        j.position.x += rx.x * dxWorld + uy.x * dyWorld;
        j.position.y += rx.y * dxWorld + uy.y * dyWorld;
        j.position.z += rx.z * dxWorld + uy.z * dyWorld;
        clampOffsetToRest(j, def.joints[0]);
        return getOffset(part);
    }

    window.MF_Pose = {
        setPart, getPose, applyPoseObj, reset,
        getScale, setScale,
        getOffset, setOffset,
        beginRotateWorld, applyRotateWorld, endRotateWorld, addWorldOffset, addScreenOffset,
        save, apply, remove, applyPreset,
        pickPart,
        list() { return Object.keys(loadPoses()); },
        get presets() { return Object.keys(PRESETS); },
        captureRest,
        PARTS
    };
    window.__MF_Pose = true;

    console.log(TAG + ' listo. MF_Pose.setPart("head", {pitch:15}) o presets: ' + Object.keys(PRESETS).join(', '));
})();
