// MF_Gizmo.js — Gizmos de traslación 3D con flechas por eje (X/Y/Z)
// para el posing del Studio, estilo Blockbench/Blender.
//
// - Tres flechas (rojo=X, verde=Y, azul=Z) ancladas al joint seleccionado.
// - Arrastrar una flecha mueve la parte SOLO en ese eje.
// - Cilindro delgado + cono de punta: geometría fabricada a mano con los
//   constructores del propio juego (el renderer solo dibuja sus clases).
// - Sin dependencia de globalThis.THREE (no existe en miniblox).
//
// API (window.MF_Gizmo):
//   attach(joint, onDelta(axis, worldDelta))  // mostrar en un joint
//   detach()                                  // ocultar
//   pick(clientX, clientY) -> 'x'|'y'|'z'|null // eje bajo el cursor
//   visible() / setScale(s)

(function () {
    'use strict';
    if (window.__MF_Gizmo) return;
    const TAG = '[MF Gizmo]';

    const AXIS_COLORS = { x: 0xff4d4d, y: 0x4dff88, z: 0x4d9fff };
    const SHAFT_LEN = 0.6;   // largo del cuerpo de la flecha (bloques)
    const SHAFT_R = 0.022;   // radio del cuerpo
    const HEAD_LEN = 0.16;   // largo de la punta
    const HEAD_R = 0.06;     // radio de la punta
    const RING_R = 0.42;     // radio de los anillos de rotación
    const RING_TUBE = 0.028; // grosor del tubo del anillo

    const state = {
        root: null,          // Group anclado al joint
        arrows: null,        // { x: {mesh, dir}, y: ..., z: ... }
        rings: null,         // { x: {mesh, mat, dir}, ... } rotación
        joint: null,
        onDelta: null,
        dragging: null,      // eje durante el drag
        dragCtx: null,       // proyección congelada durante drag lineal
        ctors: null,
        size: 1
    };

    // ── constructores del juego (patrón CustomModels) ──
    function grabCtors() {
        if (state.ctors) return state.ctors;
        try {
            // el brazo del jugador: Mesh + BufferGeometry + Material del juego
            const probe = window.MF_Pose?.getPose?.();
            const ent = (function () {
                const g = globalThis.miniblox?.player ? globalThis.miniblox : null;
                return g;
            })();
            // vía mesh del jugador (MF_Pose interno usa el mismo acceso)
            const mesh = findPlayerMesh();
            if (!mesh) return null;
            let arm = null;
            mesh.traverse(o => { if (!arm && o?.isMesh && o.geometry) arm = o; });
            if (!arm) return null;
            // material: puede ser array (multi-material) → tomar el primero
            const srcMat = Array.isArray(arm.material) ? arm.material[0] : arm.material;
            if (!srcMat?.constructor) return null;
            state.ctors = {
                Mesh: arm.constructor,
                Group: mesh.constructor?.name === 'Group' ? mesh.constructor : arm.parent?.constructor,
                BufferGeometry: arm.geometry.constructor,
                BufferAttribute: arm.geometry.attributes.position.constructor,
                Material: srcMat.constructor
            };
            // Group real: subir hasta un nodo con children y sin geometry
            let g = arm;
            while (g && !(g.children && !g.geometry && g.isObject3D !== false)) g = g.parent;
            if (g) state.ctors.Group = g.constructor;
            return state.ctors;
        } catch { return null; }
    }

    function findPlayerMesh() {
        try {
            const P = window.MF_Pose;
            // reutilizar el acceso interno de MF_Pose vía getPose (fuerza mesh)
            const game = globalThis.miniblox?.player ? globalThis.miniblox : reactGame();
            const me = game?.player;
            if (!me) return null;
            const e = game?.world?.getPlayerById?.(me.id) || game?.world?.players?.get?.(me.id) || game?.world?.entities?.get?.(me.id) || me;
            return e?.mesh || null;
        } catch { return null; }
    }

    function reactGame() {
        try {
            const react = document.querySelector('#react');
            if (react) for (const root of Object.values(react)) {
                const g = root?.updateQueue?.baseState?.element?.props?.game;
                if (g?.player) return g;
            }
        } catch {}
        return null;
    }

    // ── geometría: cilindro alineado a +Y con origen en la base ──
    function makeCylinder(ctors, radius, height, radialSegs) {
        const geo = new ctors.BufferGeometry();
        const pos = [];
        const idx = [];
        const half = 0; // origen en la base (y de 0 a height)
        // vértices del anillo inferior y superior
        for (let i = 0; i <= radialSegs; i++) {
            const a = (i / radialSegs) * Math.PI * 2;
            const c = Math.cos(a), s = Math.sin(a);
            pos.push(c * radius, half, s * radius);           // inferior
            pos.push(c * radius, half + height, s * radius);  // superior
        }
        for (let i = 0; i < radialSegs; i++) {
            const b = i * 2;
            idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
        geo.setAttribute('position', new ctors.BufferAttribute(new Float32Array(pos), 3));
        geo.setIndex(new ctors.BufferAttribute(new Uint16Array(idx), 1));
        try { geo.computeVertexNormals(); } catch {}
        return geo;
    }

    // ── geometría: cono apuntando a +Y con origen en la base ──
    function makeCone(ctors, radius, height, segs) {
        const geo = new ctors.BufferGeometry();
        const pos = [0, height, 0]; // ápice
        const idx = [];
        for (let i = 0; i < segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            pos.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        }
        for (let i = 0; i < segs; i++) {
            const a0 = 1 + i, a1 = 1 + ((i + 1) % segs);
            idx.push(0, a1, a0);
        }
        // base (tapa)
        const center = pos.length / 3;
        pos.push(0, 0, 0);
        for (let i = 0; i < segs; i++) {
            const a0 = 1 + i, a1 = 1 + ((i + 1) % segs);
            idx.push(center, a0, a1);
        }
        geo.setAttribute('position', new ctors.BufferAttribute(new Float32Array(pos), 3));
        geo.setIndex(new ctors.BufferAttribute(new Uint16Array(idx), 1));
        try { geo.computeVertexNormals(); } catch {}
        return geo;
    }

    // ── geometría: toro (anillo) en el plano XZ, centro en el origen ──
    function makeTorus(ctors, radius, tubeR, tubularSegs, radialSegs) {
        const geo = new ctors.BufferGeometry();
        const pos = [];
        const idx = [];
        for (let i = 0; i <= tubularSegs; i++) {
            const u = (i / tubularSegs) * Math.PI * 2; // ángulo alrededor del eje
            const cu = Math.cos(u), su = Math.sin(u);
            for (let j = 0; j <= radialSegs; j++) {
                const v = (j / radialSegs) * Math.PI * 2; // alrededor del tubo
                const cv = Math.cos(v), sv = Math.sin(v);
                pos.push(
                    (radius + tubeR * cv) * cu,
                    tubeR * sv,
                    (radius + tubeR * cv) * su
                );
            }
        }
        for (let i = 0; i < tubularSegs; i++) {
            for (let j = 0; j < radialSegs; j++) {
                const a = i * (radialSegs + 1) + j;
                const b = a + radialSegs + 1;
                idx.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
        geo.setAttribute('position', new ctors.BufferAttribute(new Float32Array(pos), 3));
        geo.setIndex(new ctors.BufferAttribute(new Uint16Array(idx), 1));
        try { geo.computeVertexNormals(); } catch {}
        return geo;
    }

    function makeArrowMesh(ctors, color) {
        const shaft = makeCylinder(ctors, SHAFT_R, SHAFT_LEN, 8);
        const head = makeCone(ctors, HEAD_R, HEAD_LEN, 10);
        // material del juego con color plano
        const mat = new ctors.Material();
        // alinear punta al final del cuerpo
        const matOpts = { transparent: false };
        let m1, m2;
        try {
            m1 = new ctors.Mesh(shaft, mat);
            m2 = new ctors.Mesh(head, mat);
        } catch { return null; }
        m2.position.y = SHAFT_LEN;
        const g = new ctors.Group();
        g.add(m1);
        g.add(m2);
        // color del material compartido
        try { if (mat.color?.set) mat.color.set(color); } catch {}
        try {
            // desactivar iluminación si el material lo permite (color plano)
            if ('emissive' in mat && mat.emissive?.set) mat.emissive.set(color);
            if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0.9;
            if ('fog' in mat) mat.fog = false;
            mat.needsUpdate = true;
        } catch {}
        return { group: g, mat };
    }

    // ── API ──
    // attach(joint): las flechas viven en la ESCENA RAÍZ, alineadas a los
    // ejes MUNDO del joint (no como hijas del joint: heredarían su rotación
    // y el picking no coincidiría con lo que se ve). El root se mueve al
    // joint cada frame desde update().
    function attach(joint, onDelta) {
        const ctors = grabCtors();
        if (!ctors || !joint) return false;
        detach();
        try {
            // escena raíz del juego: ancestro común más alto del joint
            const scene = findScene(joint) || findPlayerMesh()?.parent;
            if (!scene || !scene.add) return false;
            state.joint = joint;
            state.onDelta = onDelta;
            state.root = new ctors.Group();
            state.arrows = {};
            const dirs = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
            for (const axis of ['x', 'y', 'z']) {
                const arrow = makeArrowMesh(ctors, AXIS_COLORS[axis]);
                if (!arrow) continue;
                // rotar la flecha (construida en +Y) hacia su eje
                const [dx, dy, dz] = dirs[axis];
                // +Y → eje destino: rotación por eje perpendicular
                if (axis === 'x') arrow.group.rotation.z = -Math.PI / 2;
                else if (axis === 'z') arrow.group.rotation.x = Math.PI / 2;
                // y: ya apunta a +Y
                arrow.group.userData = arrow.group.userData || {};
                arrow.group.userData.__mfAxis = axis;
                state.root.add(arrow.group);
                state.arrows[axis] = { group: arrow.group, mat: arrow.mat, dir: dirs[axis] };
            }
            state.root.userData = state.root.userData || {};
            state.root.userData.__mfGizmo = true;
            // ── anillos de rotación (X/Y/Z) — plano normal al eje ──
            state.rings = {};
            const ringDirs = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
            for (const axis of ['x', 'y', 'z']) {
                const torus = makeTorus(ctors, RING_R, RING_TUBE, 48, 8);
                if (!torus) continue;
                const mat = new ctors.Material();
                const mesh = new ctors.Mesh(torus, mat);
                // el toro se genera en plano XZ (normal +Y): rotarlo para que
                // su normal apunte al eje del anillo
                if (axis === 'x') mesh.rotation.z = Math.PI / 2;
                else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
                mesh.userData = mesh.userData || {};
                mesh.userData.__mfRing = axis;
                state.root.add(mesh);
                state.rings[axis] = { mesh, mat, dir: ringDirs[axis] };
                try {
                    if (mat.color?.set) mat.color.set(AXIS_COLORS[axis]);
                    if ('emissive' in mat && mat.emissive?.set) mat.emissive.set(AXIS_COLORS[axis]);
                    if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0.7;
                    if ('transparent' in mat) mat.transparent = true;
                    if ('opacity' in mat) mat.opacity = 0.55;
                    if ('fog' in mat) mat.fog = false;
                    if ('depthWrite' in mat) mat.depthWrite = false;
                    mat.needsUpdate = true;
                } catch {}
            }
            // SIEMPRE visible encima del modelo (no queda oculto dentro
            // del cuerpo): renderOrder alto + depthTest off
            state.root.traverse(o => {
                if (o?.isMesh) {
                    o.renderOrder = 999;
                    try {
                        const mats = Array.isArray(o.material) ? o.material : [o.material];
                        for (const m of mats) {
                            if ('depthTest' in m) m.depthTest = false;
                            if ('transparent' in m) m.transparent = true;
                            if ('opacity' in m) m.opacity = 0.95;
                        }
                    } catch {}
                }
            });
            scene.add(state.root);
            update(); // posición inicial
            state.size = 1;
            return true;
        } catch (e) {
            console.warn(TAG + ' attach falló:', e?.message || e);
            return false;
        }
    }

    // sincronizar el gizmo con el joint cada vez que se consulta
    // (hover/mousedown llaman a pick() primero en cada frame de interacción)
    function update() {
        if (!state.root || !state.joint) return;
        try {
            state.joint.updateMatrixWorld?.(true);
            const V3 = state.joint.position.constructor;
            const p = new V3();
            state.joint.getWorldPosition(p);
            state.root.position.copy(p);
            state.root.rotation.set(0, 0, 0); // ejes mundo, sin herencia
            state.root.updateMatrixWorld?.(true);
        } catch {}
    }

    // escena raíz: subir la jerarquía hasta el nodo sin padre
    function findScene(node) {
        let n = node;
        let guard = 0;
        while (n?.parent && guard++ < 64) n = n.parent;
        return n?.add ? n : null;
    }

    // modo: 'both' (flechas+anillos) | 'move' (solo flechas) | 'rotate' (solo anillos)
    function setMode(mode) {
        if (!state.root) return;
        const showArrows = mode !== 'rotate';
        const showRings = mode !== 'move';
        try {
            for (const axis of ['x', 'y', 'z']) {
                if (state.arrows?.[axis]) state.arrows[axis].group.visible = showArrows;
                if (state.rings?.[axis]) state.rings[axis].mesh.visible = showRings;
            }
            state.mode = mode;
        } catch {}
    }

    function detach() {
        if (state.root) {
            try { state.root.parent?.remove(state.root); } catch {}
            // liberar geometrías
            try {
                state.root.traverse(o => {
                    if (o?.isMesh && o.geometry?.dispose) o.geometry.dispose();
                });
            } catch {}
        }
        state.root = null; state.arrows = null; state.joint = null;
        state.onDelta = null; state.dragging = null; state.dragCtx = null;
    }

    function visible() { return !!state.root; }

    // ── picking del eje: eje cuya flecha esté más cerca del rayo del cursor ──
    function pick(clientX, clientY, camera) {
        if (!state.arrows || !state.joint) return null;
        const cam = camera || getStudioCamera();
        if (!cam) return null;
        update(); // sincronizar gizmo con el joint antes de intersectar
        try {
            const V3 = cam.position.constructor;
            const rect = (getGameCanvas() || document.body).getBoundingClientRect();
            const ndcX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
            const ndcY = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
            cam.updateMatrixWorld?.();
            const origin = new V3().setFromMatrixPosition(cam.matrixWorld);
            const dir = new V3(ndcX, ndcY, 0.5).unproject(cam).sub(origin).normalize();

            // origen del gizmo en mundo
            state.joint.updateMatrixWorld?.(true);
            const jp = new V3();
            state.joint.getWorldPosition(jp);
            const len = (SHAFT_LEN + HEAD_LEN) * state.size;

            let best = null;
            const tmp = new V3(), tip = new V3();
            for (const axis of ['x', 'y', 'z']) {
                const ar = state.arrows[axis];
                if (!ar || ar.group.visible === false) continue; // oculto por modo
                const d = ar.dir;
                tip.set(jp.x + d[0] * len, jp.y + d[1] * len, jp.z + d[2] * len);
                // distancia del segmento (jp→tip) al rayo: aprox por punto medio
                tmp.set((jp.x + tip.x) / 2, (jp.y + tip.y) / 2, (jp.z + tip.z) / 2);
                const toMid = tmp.clone().sub(origin);
                const t = toMid.dot(dir);
                if (t < 0.05) continue;
                const closest = dir.clone().multiplyScalar(t).add(origin);
                const dist = closest.distanceTo(tmp);
                // umbral en píxeles convertidos a mundo por la distancia
                const worldPerPx = (2 * t * Math.tan(35 * Math.PI / 180)) / Math.max(1, rect.height);
                if (dist < Math.max(0.06, worldPerPx * 14)) {
                    if (!best || dist < best.dist) best = { axis, dist };
                }
            }
            return best?.axis || null;
        } catch { return null; }
    }

    // Congela la proyección del eje al comenzar el drag. Si se recalcula
    // mientras el joint se mueve, la perspectiva cambia la sensibilidad y el
    // movimiento parece acelerar/frenar. Con esto el drag es lineal.
    function beginDrag(axis, camera) {
        const cam = camera || getStudioCamera();
        if (!cam || !state.arrows?.[axis] || !state.joint) return false;
        update();
        try {
            const V3 = cam.position.constructor;
            const rect = (getGameCanvas() || document.body).getBoundingClientRect();
            cam.updateMatrixWorld?.();
            state.joint.updateMatrixWorld?.(true);
            const jp = new V3();
            state.joint.getWorldPosition(jp);
            const d = state.arrows[axis].dir;
            const p0 = projectPoint(jp, cam, rect);
            const p1 = projectPoint(new V3(jp.x + d[0], jp.y + d[1], jp.z + d[2]), cam, rect);
            if (!p0 || !p1) return false;
            const ax = p1.x - p0.x, ay = p1.y - p0.y;
            const lenSq = ax * ax + ay * ay;
            if (lenSq < 1e-6) return false;
            state.dragCtx = { axis, ax, ay, lenSq };
            return true;
        } catch {
            state.dragCtx = null;
            return false;
        }
    }

    // Desplazamiento TOTAL desde el mousedown, independiente de FPS y del
    // número de eventos mousemove recibidos.
    function dragDeltaFromStart(dxTotal, dyTotal) {
        const c = state.dragCtx;
        if (!c) return 0;
        return (dxTotal * c.ax + dyTotal * c.ay) / c.lenSq;
    }

    function endDrag() { state.dragCtx = null; }

    // API legacy: delta incremental. Se conserva por compatibilidad.
    function dragDelta(axis, dxPx, dyPx, camera) {
        const cam = camera || getStudioCamera();
        if (!cam) return 0;
        update(); // ejes sincronizados con la posición actual del joint
        try {
            const V3 = cam.position.constructor;
            const V2 = V3;
            // proyección del eje del mundo a pantalla
            state.joint?.updateMatrixWorld?.(true);
            const jp = new V3();
            state.joint.getWorldPosition(jp);
            const camPos = new V3().setFromMatrixPosition(cam.matrixWorld);
            const dist = camPos.distanceTo(jp);
            const rect = (getGameCanvas() || document.body).getBoundingClientRect();
            // proyectar el eje: puntos origen y origen+eje
            const d = state.arrows[axis].dir;
            const p0 = projectPoint(jp, cam, rect);
            const p1 = projectPoint(
                new V3(jp.x + d[0], jp.y + d[1], jp.z + d[2]), cam, rect
            );
            if (!p0 || !p1) return 0;
            const ax = p1.x - p0.x, ay = p1.y - p0.y;
            const lenSq = ax * ax + ay * ay;
            if (lenSq < 1e-6) return 0;
            // proyección del delta del ratón sobre el eje en pantalla
            const amount = (dxPx * ax + dyPx * ay) / lenSq; // en bloques
            return amount;
        } catch { return 0; }
    }

    // ── anillos de rotación: picking y delta angular ──
    // pickRing: ¿qué anillo está bajo el cursor? Interseca el rayo del
    // cursor con el plano del anillo y mide la distancia al centro; si cae
    // dentro de la banda del anillo (R ± tolerancia) lo devuelve.
    function pickRing(clientX, clientY, camera) {
        if (!state.rings || !state.joint) return null;
        const cam = camera || getStudioCamera();
        if (!cam) return null;
        update();
        try {
            const V3 = cam.position.constructor;
            const rect = (getGameCanvas() || document.body).getBoundingClientRect();
            const ndcX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
            const ndcY = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
            cam.updateMatrixWorld?.();
            const origin = new V3().setFromMatrixPosition(cam.matrixWorld);
            const dir = new V3(ndcX, ndcY, 0.5).unproject(cam).sub(origin).normalize();

            state.joint.updateMatrixWorld?.(true);
            const jp = new V3();
            state.joint.getWorldPosition(jp);

            let best = null;
            for (const axis of ['x', 'y', 'z']) {
                const r = state.rings[axis];
                if (!r || r.mesh.visible === false) continue; // oculto por modo
                const d = r.dir;
                // intersección rayo ∩ plano (centro jp, normal = eje)
                const denom = dir.x * d[0] + dir.y * d[1] + dir.z * d[2];
                if (Math.abs(denom) < 0.08) continue; // plano de canto: no agarrable
                const toC = jp.clone().sub(origin);
                const t = toC.dot(d) / denom;
                if (t < 0.05) continue; // detrás de la cámara
                const hit = dir.clone().multiplyScalar(t).add(origin);
                const dist = hit.distanceTo(jp);
                const R = RING_R * state.size;
                // tolerancia: grosor del tubo + margen en píxeles
                const camDist = origin.distanceTo(jp);
                const worldPerPx = (2 * camDist * Math.tan(35 * Math.PI / 180)) / Math.max(1, rect.height);
                const tol = RING_TUBE + worldPerPx * 10;
                const band = Math.abs(dist - R);
                // el anillo más frontal gana (menor t) si hay solapamiento
                const score = band - t * 0.01;
                if (band < tol && (!best || score < best.score)) {
                    best = { axis, score };
                }
            }
            return best?.axis || null;
        } catch { return null; }
    }

    // ringDragDelta: ángulo (radianes) girado alrededor del eje del anillo,
    // medido en el plano del anillo entre la posición actual del ratón y la
    // del mousedown. Devuelve positivo = regla de la mano derecha alrededor
    // del eje mundo del anillo.
    function ringDragDelta(axis, startXY, curXY, camera) {
        const cam = camera || getStudioCamera();
        if (!cam || !state.rings?.[axis]) return 0;
        update();
        try {
            const V3 = cam.position.constructor;
            const rect = (getGameCanvas() || document.body).getBoundingClientRect();
            cam.updateMatrixWorld?.();
            const origin = new V3().setFromMatrixPosition(cam.matrixWorld);

            state.joint.updateMatrixWorld?.(true);
            const jp = new V3();
            state.joint.getWorldPosition(jp);

            const d = state.rings[axis].dir;
            const axisV = new V3(d[0], d[1], d[2]);

            // base ortonormal del plano del anillo
            const helper = Math.abs(d[1]) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
            const u = helper.clone().sub(axisV.clone().multiplyScalar(helper.dot(axisV))).normalize();
            const v = axisV.clone().cross(u);

            const angleAt = (cx, cy) => {
                const ndcX = ((cx - rect.left) / Math.max(1, rect.width)) * 2 - 1;
                const ndcY = -((cy - rect.top) / Math.max(1, rect.height)) * 2 + 1;
                const dir = new V3(ndcX, ndcY, 0.5).unproject(cam).sub(origin).normalize();
                const denom = dir.dot(axisV);
                if (Math.abs(denom) < 1e-4) return null;
                const toC = jp.clone().sub(origin);
                const t = toC.dot(axisV) / denom;
                if (t < 0.05) return null;
                const hit = dir.clone().multiplyScalar(t).add(origin).sub(jp);
                return Math.atan2(hit.dot(v), hit.dot(u));
            };

            const a0 = angleAt(startXY.x, startXY.y);
            const a1 = angleAt(curXY.x, curXY.y);
            if (a0 == null || a1 == null) return 0;
            let delta = a1 - a0;
            // desenvolver: dar vueltas completas si el drag cruza ±π
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            return delta;
        } catch { return 0; }
    }

    function projectPoint(world, cam, rect) {
        try {
            const V3 = cam.position.constructor;
            const v = world.clone();
            v.project(cam);
            if (v.z > 1 || v.z < -1) return null;
            return {
                x: rect.left + (v.x + 1) / 2 * rect.width,
                y: rect.top + (1 - v.y) / 2 * rect.height
            };
        } catch { return null; }
    }

    function getStudioCamera() {
        const g = reactGame();
        return g?.gameScene?.camera || g?.camera || null;
    }

    function getGameCanvas() {
        const g = reactGame();
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

    window.MF_Gizmo = { attach, detach, pick, beginDrag, dragDeltaFromStart, endDrag, dragDelta, visible, pickRing, ringDragDelta, setMode };
    window.__MF_Gizmo = true;

    console.log(TAG + ' listo. attach(joint, onDelta) — flechas X/Y/Z para mover la parte.');
})();
