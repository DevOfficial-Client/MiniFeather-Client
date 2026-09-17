
(function () {
    'use strict';

    if (window.__MF_Pose) return;
    const TAG = '[MF Pose]';
    const LS_KEY = 'minifeather_poses_v1';

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
        
        rest: null,
        poses: null
    };

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

    function captureRest() {
        const mesh = getMesh();
        if (!mesh) return null;
        const rest = {};
        for (const name of ALL_JOINTS) {
            const j = findJoint(mesh, name);
            if (j) rest[name] = {
                x: j.rotation.x, y: j.rotation.y, z: j.rotation.z,
                sx: j.scale.x, sy: j.scale.y, sz: j.scale.z, 
                px: j.position.x, py: j.position.y, pz: j.position.z 
            };
        }
        state.rest = rest;
        return rest;
    }

    function ensureRest() {
        if (!state.rest) captureRest();
        return state.rest;
    }

    function deg2rad(d) { return (Array.isArray(d) ? d : [d]).map(v => v * Math.PI / 180); }

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
        
        joints[0].rotation.set(rad.x, rad.y, rad.z);
        
        if (joints[1] && angles.bend != null) {
            joints[1].rotation.set((angles.bend || 0) * Math.PI / 180, 0, 0);
        }
        return { ok: true, part, applied: angles };
    }

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

    function loadPoses() {
        if (state.poses) return state.poses;
        try { state.poses = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { state.poses = {}; }
        return state.poses;
    }

    function save(name) {
        const pose = getPose();
        if (!pose) return { ok: false, error: 'player/mesh not available' };
        const poses = loadPoses();
        poses[name] = pose;
        state.poses = poses;
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(poses));
            return { ok: true, name };
        } catch (e) {
            return { ok: false, error: 'could not save: ' + (e?.message || e) };
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
        if (!p) return { ok: false, error: 'preset "' + name + '" does not exist: ' + Object.keys(PRESETS).join(', ') };
        reset();
        for (const part in p) setPart(part, p[part]);
        return { ok: true, preset: name };
    }

    function getV3(camera) {
        try { return camera?.position?.constructor || null; } catch { return null; }
    }

    function getCamera() {
        const g = getGame();
        return g?.gameScene?.camera || g?.camera || window.MF_FREECAM?.camera || null;
    }

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

    const PART_RADIUS = {
        head: 0.32, torso: 0.38,
        leftArm: 0.42, rightArm: 0.42,
        leftLeg: 0.42, rightLeg: 0.42
    };

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

    function pickPart(clientX, clientY) {
        const ent = getLocalPlayerEntity(getGame());
        const mesh = ent?.mesh;
        const camera = getCamera();
        const V3 = getV3(camera);
        if (!mesh || !camera || !V3) return null;

        const rect = (getGameCanvas() || document.body).getBoundingClientRect();
        const ndcX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        const ndcY = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;

        let origin, dir;
        try {
            camera.updateMatrixWorld?.();
            origin = new V3().setFromMatrixPosition(camera.matrixWorld);
            dir = new V3(ndcX, ndcY, 0.5).unproject(camera).sub(origin).normalize();
            if (!Number.isFinite(dir.x) || dir.lengthSq() === 0) return null;
        } catch { return null; }

        try { mesh.updateMatrixWorld(true); } catch {}

        const jointToPart = {};
        for (const part in PARTS) for (const j of PARTS[part].joints) jointToPart[j] = part;

        const meshes = [];
        mesh.traverse(o => { if (o?.isMesh && o.geometry) meshes.push(o); });
        if (!meshes.length) return null;

        let best = null; 
        const vA = new V3(), vB = new V3(), vC = new V3();
        for (const m of meshes) {
            const geo = m.geometry;
            const posAttr = geo?.attributes?.position;
            if (!posAttr) continue;
            let index = geo.index?.array || null;
            const count = posAttr.count;

            let ownerPart = null, ownerJoint = null;
            let node = m;
            while (node && node !== mesh.parent) {
                if (node.name && jointToPart[node.name]) { ownerPart = jointToPart[node.name]; ownerJoint = node.name; break; }
                node = node.parent;
            }

            let mw = null;
            try { m.updateMatrixWorld?.(true); mw = m.matrixWorld; } catch {}
            if (!mw) continue;
            const e = mw.elements;

            const worldOf = (i, out) => {
                const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
                
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
            
            return pickByProximity(mesh, origin, dir, V3);
        }
        const point = new V3().copy(dir).multiplyScalar(best.t).add(origin);
        return { part: best.part, jointName: best.jointName, object: best.obj, hit: { point } };
    }

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

    const rotDrags = new Map();
    let rotDragSeq = 0;

    function qInv(q) {
        try { return q.invert(); } catch { return q.conjugate(); }
    }

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

            try {
                mesh.updateMatrixWorld?.(true);
                const V3 = camera?.position?.constructor || j.position.constructor;
                const e = mesh.matrixWorld.elements;
                st.mirrorN = new V3(e[0], e[1], e[2]).normalize();
            } catch {}

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
            const right = new V3(e[0], e[1], e[2]).normalize(); 
            const back = new V3(e[8], e[9], e[10]).normalize(); 

            const k = 0.5 * Math.PI / 180;
            let aR = dyTotal * k;
            let aB = dxTotal * k;
            if (snap15) {
                const s = 15 * Math.PI / 180;
                aR = Math.round(aR / s) * s;
                aB = Math.round(aB / s) * s;
            }

            const qDelta = new st.Q().setFromAxisAngle(back, aB).multiply(new st.Q().setFromAxisAngle(right, aR));

            const qNew = qDelta.clone().multiply(st.qStartWorld);
            const qLocal = st.qParentWorldInv.clone().multiply(qNew);
            
            st.joint.quaternion.copy(qLocal);

            const deg = (r) => r * 180 / Math.PI;
            const out = { deg: [deg(st.joint.rotation.x), deg(st.joint.rotation.y), deg(st.joint.rotation.z)] };

            if (mirror && st.mirrorJoint) {
                const mR = reflectAxis(right, st.mirrorN);
                const mB = reflectAxis(back, st.mirrorN);
                const qDeltaM = new st.Q().setFromAxisAngle(mB, -aB).multiply(new st.Q().setFromAxisAngle(mR, -aR));
                const qNewM = qDeltaM.clone().multiply(st.qMirrorStart);
                const qLocalM = st.qMirrorParentInv.clone().multiply(qNewM);
                st.mirrorJoint.quaternion.copy(qLocalM);
                out.mirrorDeg = [deg(st.mirrorJoint.rotation.x), deg(st.mirrorJoint.rotation.y), deg(st.mirrorJoint.rotation.z)];
            }
            return out;
        } catch { return null; }
    }

    function endRotateWorld(handle) { rotDrags.delete(handle); }

    function applyAxisRotateWorld(handle, axis, angle, snap15, mirror) {
        const st = rotDrags.get(handle);
        if (!st) return null;
        const dirMap = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
        const d = dirMap[axis];
        if (!d) return null;
        try {
            const V3 = st.joint.position.constructor;
            let a = angle;
            if (snap15) {
                const s = 15 * Math.PI / 180;
                a = Math.round(a / s) * s;
            }
            const axisV = new V3(d[0], d[1], d[2]);
            const qDelta = new st.Q().setFromAxisAngle(axisV, a);

            const qNew = qDelta.clone().multiply(st.qStartWorld);
            const qLocal = st.qParentWorldInv.clone().multiply(qNew);
            st.joint.quaternion.copy(qLocal);

            const deg = (r) => r * 180 / Math.PI;
            const out = { deg: [deg(st.joint.rotation.x), deg(st.joint.rotation.y), deg(st.joint.rotation.z)], angle: a };

            if (mirror && st.mirrorJoint) {
                const mAxis = reflectAxis(axisV, st.mirrorN);
                const qDeltaM = new st.Q().setFromAxisAngle(mAxis, -a);
                const qNewM = qDeltaM.clone().multiply(st.qMirrorStart);
                const qLocalM = st.qMirrorParentInv.clone().multiply(qNewM);
                st.mirrorJoint.quaternion.copy(qLocalM);
                out.mirrorDeg = [deg(st.mirrorJoint.rotation.x), deg(st.mirrorJoint.rotation.y), deg(st.mirrorJoint.rotation.z)];
            }
            return out;
        } catch { return null; }
    }

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

    function addWorldOffset(part, axisName, amount) {
        const def = PARTS[part];
        if (!def) throw new Error('unknown part: ' + part);
        const mesh = getMesh();
        if (!mesh) throw new Error('player/mesh not available');
        const j = findJoint(mesh, def.joints[0]);
        if (!j) throw new Error('joint "' + def.joints[0] + '" not found');
        const axes = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
        if (!axes[axisName]) throw new Error('unknown axis: ' + axisName);
        const v = worldAxisToLocal(j, axes[axisName][0], axes[axisName][1], axes[axisName][2]);
        if (!v) throw new Error('no world→local conversion');
        j.position.x += v.x * amount;
        j.position.y += v.y * amount;
        j.position.z += v.z * amount;
        clampOffsetToRest(j, def.joints[0]);
        return getOffset(part);
    }

    function addScreenOffset(part, camRight, camUp, dxWorld, dyWorld) {
        const def = PARTS[part];
        if (!def) throw new Error('unknown part: ' + part);
        const mesh = getMesh();
        if (!mesh) throw new Error('player/mesh not available');
        const j = findJoint(mesh, def.joints[0]);
        if (!j) throw new Error('joint "' + def.joints[0] + '" not found');
        const rx = worldAxisToLocal(j, camRight.x, camRight.y, camRight.z);
        const uy = worldAxisToLocal(j, camUp.x, camUp.y, camUp.z);
        if (!rx || !uy) throw new Error('no world→local conversion');
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
        beginRotateWorld, applyRotateWorld, applyAxisRotateWorld, endRotateWorld, addWorldOffset, addScreenOffset,
        save, apply, remove, applyPreset,
        pickPart,
        list() { return Object.keys(loadPoses()); },
        get presets() { return Object.keys(PRESETS); },
        captureRest,
        PARTS
    };
    window.__MF_Pose = true;

    void 0;
})();
