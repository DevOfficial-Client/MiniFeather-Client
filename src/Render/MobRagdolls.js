
(function () {
    'use strict';
    const TAG = 'minifeather mobragdolls';
    if (globalThis.MF_MobRagdolls) return;

    // reemplaza el sistema de corpses del juego (gN): los ragdolls no desaparecen,
    // colisionan con el mundo voxel, no doblan codos/rodillas y tienen física propia.
    // estrategia: al detectar la muerte, entity.mesh = null impide que el juego
    // intercambie el mesh y llame a startDeathRagdoll (guard "t instanceof LP"),
    // y el mesh real queda en la escena bajo nuestro control via updateMatrixWorld.
    // secuestrar meshes: técnicamente un crimen, sentimentalmente una adopción.
    const CFG = {
        MAX_CORPSES: 24,
        CULL_DIST: 96,
        TICK_MS: 50,            // paso fijo 20 Hz
        MAX_SUBSTEPS: 3,
        GRAVITY: 0.08,          // b/tick^2
        AIR_DRAG: 0.98,
        GROUND_FRICTION: 0.6,
        AIR_FRICTION: 0.91,
        BOUNCE_VY: -3.4,        // rebote solo en impactos fuertes (b/tick)
        RESTITUTION: 0.22,
        TIP_STIFF: 0.09,
        TIP_DAMP: 0.82,
        TIP_MAX: 1.62,          // ~93 grados
        JOINT_STIFF: 0.16,
        JOINT_DAMP: 0.8,
        JOINT_BOUNCE: -0.35,
        IMPACT_JOLT: 1.6,
        TINT_CLEAR_MS: 600,
        SETTLE_TICKS: 40
    };

    const state = {
        enabled: false,
        game: null,
        world: null,
        corpses: [],
        captured: new WeakSet(),
        stamp: { alive: true },
        lastT: 0,
        acc: 0,
        colorCtor: null,
        vecCtor: null,
        solidCache: new Map(),
        worldCache: { world: null, proto: null, at: 0 },
        diagSeen: { n: 0, mobs: 0 },
        scanAt: 0
    };

    function getGame() {
        const direct = [globalThis.miniblox, globalThis.__MINIBLOX_GAME__, globalThis.__MB?.game, globalThis.game];
        for (const g of direct) if (g?.player?.pos && g?.world && g?.gameScene) return g;
        try {
            const react = document.querySelector('#react');
            if (react) {
                for (const root of Object.values(react)) {
                    const g = root?.updateQueue?.baseState?.element?.props?.game;
                    if (g?.player?.pos && g?.world && g?.gameScene) return g;
                }
            }
        } catch {}
        return null;
    }

    function playerPos() { return state.game?.player?.pos || null; }

    // ---- acceso a voxels (mismo patrón que CrittersMobs; los vecinos se copian, y bien) ----
    function worldProto() {
        const world = state.game?.world;
        if (!world) return null;
        const now = performance.now();
        if (state.worldCache.world === world && state.worldCache.proto) return state.worldCache.proto;
        const proto = Object.getPrototypeOf(world);
        if (typeof proto.getChunk !== 'function') return null;
        state.worldCache = { world, proto, at: now };
        return proto;
    }

    function blockNameAt(x, y, z) {
        const proto = worldProto();
        if (!proto || y < 0 || y > 255) return '';
        try {
            const world = state.game.world;
            const chunk = proto.getChunk.call(world, { x, y, z });
            if (chunk == null || chunk.isDummyChunk) return '';
            const bs = chunk.getBlockState({ x, y, z });
            if (!bs || !bs.id) return 'air';
            const id = Number(bs.id);
            const cached = state.solidCache.get(id);
            if (cached !== undefined) return cached;
            let name = '';
            try {
                const block = bs.getBlock?.() || bs.block || bs._block || null;
                name = String(block?.name || block?.id || bs.name || '').toLowerCase();
            } catch {}
            if (name) state.solidCache.set(id, name);
            return name;
        } catch { return ''; }
    }

    const PASSABLE_RE = /(^|_)(grass|tall_grass|fern|seagrass|flower|tulip|dandelion|poppy|orchid|allium|bluet|cornflower|lily|sunflower|rose|peony|sapling|wheat|carrot|potato|beetroot|mushroom|snow_layer|dead_bush|sweet_berry|bush|vine|kelp|torch|rail|carpet|web|fire|sign|banner|pressure_plate|button|slime)$/;
    function isSolid(x, y, z) {
        const n = blockNameAt(Math.floor(x), Math.floor(y), Math.floor(z));
        if (!n) return true;            // sin datos: tratar como solido (evita caer al vacio)
        if (/(^|_)air$/.test(n) || n === 'air') return false;
        if (PASSABLE_RE.test(n) || /(^|_)(water|lava|flowing)/.test(n)) return false;
        return true;
    }

    // ---- utilidades quat (objetos plain {x,y,z,w}; las apis de three leen props sin hacer preguntas) ----
    function quatAxisAngle(axis, ang) {
        const h = ang / 2, s = Math.sin(h);
        return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(h) };
    }
    function quatDot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w; }
    function quatClone(q) { return { x: q.x, y: q.y, z: q.z, w: q.w }; }

    // ---- captura (momento secuestro/adopción) ----
    const REJECTS = new Map();
    function noteReject(reason, ent) {
        try {
            const now = performance.now();
            const rec = REJECTS.get(reason) || { n: 0, at: 0, last: '' };
            rec.n++;
            rec.last = String(ent?.type || '?');
            if (now - rec.at > 5000) {
                console.log(TAG + ' descarte [' + reason + '] x' + rec.n + ' (ultimo: ' + rec.last + ')');
                rec.n = 0; rec.at = now;
            }
            REJECTS.set(reason, rec);
        } catch {}
    }

    function isCorpseCandidate(ent, mesh, game) {
        if (!ent || !mesh) return false;
        if (state.captured.has(ent)) return false;
        if (game.player && ent.id === game.player.id) return false;   // jugador local: lo lleva el juego
        if (ent.type === 'player') return false;                      // jugadores remotos: vanilla
        if (typeof ent.getHealth !== 'function') return false;        // solo entidades vivas
        try {
            const hp = ent.getHealth();
            const dying = hp <= 0 || (ent.deathTime | 0) > 0;
            if (!dying) return false;
        } catch { return false; }
        if (mesh.__mfCorpseRec) return false;
        if (mesh.entity && mesh.entity !== ent) return noteReject('mesh.entity≠ent', ent), false;
        if (mesh.visible !== true) return noteReject('invisible', ent), false;
        if (mesh.parent == null) return noteReject('sin-parent', ent), false;
        if (!mesh.body || !mesh.skeleton || typeof mesh.render !== 'function') {
            return noteReject('no-rig-LP', ent), false;
        }
        return true;
    }

    function grabColorCtor(mesh) {
        if (state.colorCtor) return state.colorCtor;
        try {
            const mats = [];
            if (mesh.meshes) for (const k in mesh.meshes) {
                const m = mesh.meshes[k]?.material;
                if (m) mats.push(...(Array.isArray(m) ? m : [m]));
            }
            for (const m of mats) if (m.color?.constructor) return (state.colorCtor = m.color.constructor);
        } catch {}
        return null;
    }
    function grabVecCtor(game) {
        if (state.vecCtor) return state.vecCtor;
        try { return (state.vecCtor = game.player.pos.constructor); } catch { return null; }
    }

    function freezeJoint(j) {
        if (!j || j.__mfRagFrozen) return;
        j.__mfRagFrozen = true;
        j.rotation.x = 0; j.rotation.y = 0; j.rotation.z = 0;
        try { j.quaternion.set(0, 0, 0, 1); } catch {}
        try {
            const E = j.rotation.constructor;
            const zero = new E(0, 0, 0, j.rotation.order || 'XYZ');
            // el setter de Euler de three invoca _onChangeCallback en cada escritura;
            // gN (sistema vanilla) sigue escribiendo estos joints: debe ser no-op, nunca null
            // (el ghostwriter escribe, pero la firma es nuestra)
            // historial del parche: la versión anterior ponía null y cada kill
            // congelaba el juego 4 segundos con un TypeError dentro de gN.render.
            // conclusión de guardia: los muertos siguen escribiendo; el no-op
            // responde por todos. no hay soporte después de medianoche.
            zero._onChangeCallback = function () {};
            Object.defineProperty(j, 'rotation', { value: zero, configurable: true, writable: false });
        } catch {}
    }

    function looksDying(ent) {
        try { return (ent.getHealth?.() <= 0) || ((ent.deathTime | 0) > 0) || ((ent.hurtTime | 0) > 0); } catch { return false; }
    }

    // protección inteligente (instalada en el spawn y al capturar): los métodos
    // originales solo se saltan cuando el mesh ya es un corpse nuestro. porte cerrado.
    function protectSpawn(mesh) {
        if (!mesh || mesh.__mfSmartDispose) return;
        if (!mesh.body || !mesh.skeleton || typeof mesh.render !== 'function') return;
        mesh.__mfSmartDispose = true;
        mesh.__mfOrigDispose = mesh.dispose;
        mesh.__mfOrigClear = mesh.clear;
        mesh.__mfOrigRemoveFromParent = mesh.removeFromParent;
        mesh.dispose = function () {
            if (this.__mfCorpseRec) return;
            return this.__mfOrigDispose.apply(this, arguments);
        };
        mesh.clear = function () {
            if (this.__mfCorpseRec) return;
            return this.__mfOrigClear.apply(this, arguments);
        };
        mesh.removeFromParent = function () {
            if (this.__mfCorpseRec) return;
            return this.__mfOrigRemoveFromParent.apply(this, arguments);
        };
    }

    function restoreMesh(mesh) {
        if (mesh.__mfSmartDispose) {
            try { delete mesh.dispose; delete mesh.clear; delete mesh.removeFromParent; } catch {}
            mesh.__mfSmartDispose = false;
            mesh.__mfOrigDispose = undefined;
            mesh.__mfOrigClear = undefined;
            mesh.__mfOrigRemoveFromParent = undefined;
        }
        mesh.__mfCorpseRec = null;
    }

    function isMobRig(ent, mesh) {
        return !!(mesh && mesh.entity === ent && mesh.body && mesh.skeleton && typeof mesh.render === 'function');
    }

    function captureCorpse(game, ent, mesh, swapMesh = true) {
        state.captured.add(ent);
        try {
            return buildCorpse(game, ent, mesh, swapMesh);
        } catch (e) {
            console.warn(TAG + ' captura fallo: ' + (e?.message || e) + ' — rollback');
            if (swapMesh) { try { ent.mesh = mesh; } catch {} }
            try { restoreMesh(mesh); } catch {}
            return null;
        }
    }

    function buildCorpse(game, ent, mesh, swapMesh) {
        const h = Math.max(ent.height || 1.8, 0.4);
        const width = Math.max(ent.width || 0.6, 0.3);

        // via ventana de muerte: quitar el mesh de la entidad para que el juego
        // no lo intercambie en startDeathRagdoll ni lo deseche al despawnear.
        // vía adopción (paquete DestroyEntities): el juego ya cambió e.mesh; no tocar.
        if (swapMesh) { try { ent.mesh = null; } catch {} }
        protectSpawn(mesh);
        // sin frustum culling en el corpse: los bounding spheres estáticos mienten
        // cuando los huesos rotan el cuerpo (patrón de CustomModels)
        try {
            (function walk(n) { n.frustumCulled = false; const ch = n.children || []; for (let i = 0; i < ch.length; i++) walk(ch[i]); })(mesh);
        } catch {}

        // visuales de corpse (réplica de gN.start, con guards)
        try {
            if (mesh.lodFar && typeof mesh.WNcsnWnN === 'function') mesh.WNcsnWnN(false);
        } catch {}
        mesh.visible = true;
        try {
            mesh.traverse((o) => {
                if (o.isMesh && o.__realMaterial) { o.material = o.__realMaterial; o.__realMaterial = undefined; }
            });
        } catch {}
        try {
            const o = mesh.sbmDrBlVzXvnetsCuNsQ;
            if (typeof o === 'function') {
                o.call(mesh, true);
                mesh.DxhSLGZabrLfnbj?.(null, 1);
                const hm = mesh.meshes?.head?.material;
                if (hm?.transparent) { hm.transparent = false; hm.needsUpdate = true; }
                if (typeof mesh.applyCosmeticVisibility === 'function') mesh.applyCosmeticVisibility.call(mesh);
                if (typeof mesh.applyDeathArmor === 'function') mesh.applyDeathArmor.call(mesh);
            }
        } catch {}
        // geometría y materiales PROPIOS: el dispose() del juego destruye las
        // geometrías compartidas por tipo de mob — cuando otro zombie del mismo
        // modelo muere o despawnea, los buffers compartidos mueren con él y
        // nuestro corpse se queda pintado de nada (el bug del ragdoll invisible:
        // inScene:true, vis:true y ni rastro). clonar todo al capturar = 
        // desheredar la herencia compartida.
        // caso abierto y cerrado: mesh inScene:true, vis:true y no pinta nada.
        // la escena decía la verdad; los buffers, no. protocolo desde entonces:
        // todo lo adoptado pasa por el clonador. a estas horas no se pregunta,
        // se clona.
        let clonedParts = 0;
        try {
            mesh.traverse((o) => {
                if (!o.isMesh) return;
                try {
                    if (o.geometry) { o.geometry = o.geometry.clone(); o.geometry.__mfClone = true; clonedParts++; }
                } catch {}
                try {
                    if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone());
                    else if (o.material) o.material = o.material.clone();
                } catch {}
            });
        } catch {}
        // escala cero heredada de cualquier animación previa: el corpse no nace aplanado
        try { if (!mesh.scale.x || !mesh.scale.y || !mesh.scale.z) mesh.scale.set(1, 1, 1); } catch {}
        // tinte rojo de muerte (HAe/VAe no accesibles: color propio)
        try {
            const C = grabColorCtor(mesh);
            if (C && typeof mesh.DxhSLGZabrLfnbj === 'function') mesh.DxhSLGZabrLfnbj(new C(1, 0.5, 0.5), 1);
        } catch {}

        // codos y rodillas rígidos (petición explícita: sin rotación; rigor mortis, cortesía de la casa)
        for (const jn of ['leftElbowJoint', 'rightElbowJoint', 'leftKneeJoint', 'rightKneeJoint']) {
            freezeJoint(mesh[jn]);
        }

        // momentum inicial ( knockback fresco: capturamos en el tick de muerte )
        let motion = { x: 0, y: 0, z: 0 };
        try {
            motion.x = +ent.motion?.x || 0;
            motion.y = +ent.motion?.y || 0;
            motion.z = +ent.motion?.z || 0;
        } catch {}
        const hl = Math.hypot(motion.x, motion.z);
        if (hl > 1) { motion.x /= hl; motion.z /= hl; }
        motion.y = Math.max(-1, Math.min(1, motion.y)) + 0.12;
        if (hl < 0.03) {
            motion.x = Math.sin(ent.yaw || 0) * 0.28;
            motion.z = Math.cos(ent.yaw || 0) * 0.28;
        }
        // sin acceso a voxels no hay gravedad: el corpse queda en su sitio
        const worldReady = !!worldProto();
        if (!worldReady) motion.y = 0;

        // tip-over hacia la dirección de caída (como gN; caerse con estilo no es gratis)
        const alen = Math.hypot(motion.x, motion.z) || 1;
        const a = { x: motion.x / alen, z: motion.z / alen };
        const tipAxis = { x: a.z, y: 0, z: -a.x };
        const yawA = quatAxisAngle({ x: 0, y: 1, z: 0 }, Math.atan2(-a.x, -a.z));
        const yawB = quatAxisAngle({ x: 0, y: 1, z: 0 }, Math.atan2(a.x, a.z));
        let bodyFrom = null, neckFrom = null, bodyTo = null;
        try {
            bodyFrom = quatClone(mesh.body.quaternion);
            bodyTo = Math.abs(quatDot(yawA, bodyFrom)) >= Math.abs(quatDot(yawB, bodyFrom)) ? yawA : yawB;
            if (mesh.neck) neckFrom = quatClone(mesh.neck.quaternion);
        } catch {}
        if (!bodyFrom || !bodyTo) {
            bodyFrom = { x: 0, y: 0, z: 0, w: 1 };
            bodyTo = { x: 0, y: 0, z: 0, w: 1 };
        }
        if (!neckFrom) neckFrom = quatClone(bodyFrom);

        // joints simulados: hombros/caderas/cabeza (nunca codos ni rodillas; lo dicho es lo dicho)
        const joints = [];
        const p = 0.3 + h * 0.08;
        const head = (mesh.headPivot && (mesh.headPivot.children.length > 0)) ? mesh.headPivot : mesh.neck;
        const addJ = (obj, axis, rest, min, max, probeY) => {
            if (!obj || obj.children.length === 0) return;
            let angle = 0;
            try { angle = Math.max(min, Math.min(max, obj.rotation[axis])); } catch {}
            joints.push({
                obj, axis, angle, prevAngle: angle,
                vel: (Math.random() - 0.5) * (0.4 + Math.hypot(motion.x, motion.z) * 2.4),
                rest: Math.max(min, Math.min(max, rest + (Math.random() - 0.5) * 0.45)),
                min, max, probeY
            });
        };
        addJ(mesh.leftShoulder, 'x', -0.35, -2.4, 2.4, -p);
        addJ(mesh.rightShoulder, 'x', 0.35, -2.4, 2.4, -p);
        addJ(mesh.leftShoulder, 'z', -0.3, -1.2, 0.25, -p);
        addJ(mesh.rightShoulder, 'z', 0.3, -0.25, 1.2, -p);
        addJ(mesh.leftHip, 'x', -0.3, -2.0, 2.0, -p);
        addJ(mesh.rightHip, 'x', 0.3, -2.0, 2.0, -p);
        if (head) {
            addJ(head, 'x', 0.2, -0.7, 0.7, h * 0.2);
            addJ(head, 'z', 0, -0.5, 0.5, h * 0.2);
        }

        const rec = {
            mesh, ent, game,
            parts: clonedParts,
            noWorld: !worldReady,
            pos: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
            prevPos: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
            motion,
            halfWidth: Math.max(0.2, width / 2),
            boxHeight: Math.max(0.1, Math.min(0.25, h * 0.14)),
            tipLift: Math.max(0.06, Math.min(0.3, width * 0.21)),
            bodyProbes: [h * 0.45, h * 0.85],
            tipAxis, tipAngle: 0, prevTipAngle: 0, tipVel: 0,
            tipTarget: CFG.TIP_MAX * (0.92 + Math.random() * 0.12),
            crumpleDir: 0,
            bodyFrom, neckFrom, bodyTo,
            joints,
            age: 0,
            landed: false,
            settled: false,
            settleTicks: 0,
            spawnedAt: performance.now(),
            tintCleared: false
        };
        mesh.__mfCorpseRec = rec;

        // pose via updateMatrixWorld: corre DESPUES del render/logica del juego,
        // asi nuestra pose gana cada frame sin pelear con LP.render
        const origUMW = mesh.updateMatrixWorld.bind(mesh);
        mesh.__mfOrigUMW = origUMW;
        mesh.updateMatrixWorld = function (force) {
            try { if (rec.settled) return origUMW(force); } catch {}
            try { applyPose(rec, interpFactor(rec)); } catch {}
            return origUMW(force);
        };

        state.corpses.push(rec);
        enforceCap(game);
        try {
            const pName = mesh.parent === game.gameScene?.entityMeshes ? 'entityMeshes'
                : (mesh.parent ? (mesh.parent.name || mesh.parent.constructor?.name || 'otro') : 'SIN-PARENT');
            console.log(TAG + ' corpse: ' + (ent.type || '?') + ' (' + state.corpses.length + ' activos) uuid=' + meshUuid(mesh) + ' parent=' + pName);
        } catch {
            console.log(TAG + ' corpse: ' + (ent.type || '?') + ' (' + state.corpses.length + ' activos)');
        }
        return rec;
    }

    // ---- hooks del ciclo de vida del mundo (no dependen del sondeo por frame) ----
    // el truco: taggear cada mob en spawnEntityInWorld y adoptar el mesh en
    // removeEntityFromWorld ANTES de que el juego llame dispose()/gN.
    // llegar antes que la funeraria es toda un arte.
    function installWorldHooks() {
        const world = state.game?.world;
        if (!world || world.__mfRagdollHooked) return;
        if (typeof world.spawnEntityInWorld !== 'function') return;
        if (typeof world.removeEntityFromWorld !== 'function') return;
        world.__mfRagdollHooked = true;
        const origSpawn = world.spawnEntityInWorld;
        const origRemove = world.removeEntityFromWorld;
        world.__mfOrigSpawn = origSpawn;
        world.__mfOrigRemove = origRemove;
        world.spawnEntityInWorld = function (ent) {
            try {
                if (ent && typeof ent.getHealth === 'function' && ent.type !== 'player' && ent.mesh) {
                    ent.__mfRealMesh = ent.mesh;
                    protectSpawn(ent.mesh);
                }
            } catch {}
            return origSpawn.apply(this, arguments);
        };
        world.removeEntityFromWorld = function (id) {
            try {
                const ent = (id && typeof id === 'object') ? id : this.entities?.get?.(id);
                const mesh = ent?.__mfRealMesh || null;
                if (ent && mesh && !mesh.__mfCorpseRec && !mesh.__mfRagdollDead && isMobRig(ent, mesh) && looksDying(ent)) {
                    mesh.__mfRagdollDead = true;
                    const rec = captureCorpse(state.game, ent, mesh, false);
                    if (rec && ent.mesh === mesh) { try { ent.mesh = null; } catch {} }
                    if (rec) console.log(TAG + ' corpse (destroy): ' + (ent.type || '?'));
                }
            } catch {}
            return origRemove.apply(this, arguments);
        };
    }

    function tagExistingMobs() {
        const world = state.game?.world;
        if (!world || world.__mfRagdollTagged) return;
        const ents = world.entities;
        if (!ents || typeof ents.forEach !== 'function') return;
        world.__mfRagdollTagged = true;
        try {
            ents.forEach((ent) => {
                try {
                    if (!ent || typeof ent.getHealth !== 'function' || ent.type === 'player' || ent.__mfRealMesh) return;
                    if (!isMobRig(ent, ent.mesh)) return;
                    ent.__mfRealMesh = ent.mesh;
                    protectSpawn(ent.mesh);
                } catch {}
            });
        } catch {}
    }

    // guard a nivel de contenedor de escena: nadie desengancha un corpse de entityMeshes
    function installSceneGuard() {
        const container = state.game?.gameScene?.entityMeshes;
        if (!container || container.__mfSceneGuard) return;
        if (typeof container.remove !== 'function') return;
        container.__mfSceneGuard = true;
        state.sceneGuardContainer = container;
        const origRemove = container.remove;
        container.__mfOrigSceneRemove = origRemove;
        container.remove = function (child) {
            try {
                if (child?.__mfCorpseRec) {
                    noteReject('scene-remove-bloqueado', child.__mfCorpseRec.ent);
                    return this;
                }
            } catch {}
            return origRemove.apply(this, arguments);
        };
        // clear() vacía todo el contenedor sin pasar por remove(): rescatar corpses
        if (typeof container.clear === 'function' && !container.__mfSceneClearGuard) {
            container.__mfSceneClearGuard = true;
            const origClear = container.clear;
            container.__mfOrigSceneClear = origClear;
            container.clear = function () {
                const saved = [];
                try {
                    for (const c of this.children) if (c?.__mfCorpseRec) saved.push(c);
                } catch {}
                const out = origClear.apply(this, arguments);
                try {
                    for (const c of saved) this.add(c);
                    if (saved.length) noteReject('clear-rescatado', saved[0].__mfCorpseRec.ent);
                } catch {}
                return out;
            };
        }
    }

    function unguardScene() {
        const container = state.sceneGuardContainer;
        if (!container?.__mfSceneGuard) return;
        try {
            // restaurar el método original guardado (funciona con o sin prototipo)
            if (container.__mfOrigSceneRemove) container.remove = container.__mfOrigSceneRemove;
            else delete container.remove;
        } catch {}
        container.__mfSceneGuard = false;
        container.__mfOrigSceneRemove = undefined;
        state.sceneGuardContainer = null;
    }

    function unhookWorld() {
        const world = state.world;
        if (!world?.__mfRagdollHooked) return;
        try {
            // restaurar originales guardados (funciona con o sin prototipo)
            if (world.__mfOrigSpawn) world.spawnEntityInWorld = world.__mfOrigSpawn;
            else delete world.spawnEntityInWorld;
            if (world.__mfOrigRemove) world.removeEntityFromWorld = world.__mfOrigRemove;
            else delete world.removeEntityFromWorld;
        } catch {}
        world.__mfRagdollHooked = false;
        world.__mfOrigSpawn = undefined;
        world.__mfOrigRemove = undefined;
    }

    function interpFactor(rec) {
        return Math.max(0, Math.min(1, state.acc / CFG.TICK_MS));
    }

    // ---- física (casera, sin dependencias, sin arrepentimientos) ----
    function probeWorldPoint(c, h, dx, dy, dz, out) {
        // rota (0,h,0) alrededor de tipAxis por tipAngle y suma pos + delta
        const sin = Math.sin(c.tipAngle), cos = Math.cos(c.tipAngle);
        const ax = c.tipAxis.x, az = c.tipAxis.z;
        out.x = c.pos.x + dx - az * h * sin;
        out.y = c.pos.y + dy + h * cos;
        out.z = c.pos.z + dz + ax * h * sin;
        return out;
    }

    function bodyBlocked(c, dx, dy, dz) {
        const pt = {};
        for (let i = -1; i < c.bodyProbes.length; i++) {
            const h = i < 0 ? c.boxHeight * 0.5 : c.bodyProbes[i];
            probeWorldPoint(c, h, dx, dy, dz, pt);
            if (isSolid(pt.x, pt.y + 0.02, pt.z)) return true;
            if (isSolid(pt.x, pt.y + c.boxHeight, pt.z)) return true;
        }
        return false;
    }

    function tipBlockedAt(c, angle) {
        const saved = c.tipAngle;
        c.tipAngle = angle;
        const blocked = bodyBlocked(c, 0, 0, 0);
        c.tipAngle = saved;
        return blocked;
    }

    function crumple(c, angle) {
        if (c.crumpleDir === 0) {
            const test = (rot) => {
                const ax = c.tipAxis, s = Math.sin(rot), co = Math.cos(rot);
                const nx = ax.x * co - ax.z * s, nz = ax.x * s + ax.z * co;
                const old = { x: ax.x, z: ax.z };
                ax.x = nx; ax.z = nz;
                const blocked = tipBlockedAt(c, angle);
                ax.x = old.x; ax.z = old.z;
                return blocked;
            };
            const posFree = !test(0.4), negFree = !test(-0.4);
            c.crumpleDir = posFree === negFree ? (Math.random() < 0.5 ? 1 : -1) : (posFree ? 1 : -1);
        }
        const rot = c.crumpleDir * 0.12;
        const s = Math.sin(rot), co = Math.cos(rot);
        const ax = c.tipAxis;
        const nx = ax.x * co - ax.z * s, nz = ax.x * s + ax.z * co;
        ax.x = nx; ax.z = nz;
        // bodyTo acompaña el giro del eje (pre-multiplica yaw delta como gN)
        try {
            const dq = quatAxisAngle({ x: 0, y: 1, z: 0 }, rot);
            const b = c.bodyTo;
            // q' = dq * b
            const x = dq.w * b.x + dq.x * b.w + dq.y * b.z - dq.z * b.y;
            const y = dq.w * b.y - dq.x * b.z + dq.y * b.w + dq.z * b.x;
            const z = dq.w * b.z + dq.x * b.y - dq.y * b.x + dq.z * b.w;
            const w = dq.w * b.w - dq.x * b.x - dq.y * b.y - dq.z * b.z;
            b.x = x; b.y = y; b.z = z; b.w = w;
        } catch {}
        c.motion.x += c.tipAxis.z * 0.045;
        c.motion.z += -c.tipAxis.x * 0.045;
        if (!tipBlockedAt(c, angle)) c.tipAngle = angle;
    }

    function limbBlocked(c, j) {
        const V3 = state.vecCtor;
        if (!V3) return false;
        try {
            j.obj.updateWorldMatrix(true, false);
            const v = new V3(0, j.probeY, 0).applyMatrix4(j.obj.matrixWorld);
            if (c.landed && v.y < c.pos.y + 0.02) return true;
            const y0 = Math.max(v.y - 0.12, c.pos.y + 0.03);
            if (v.y + 0.12 <= y0) return false;
            return isSolid(v.x, y0 + 0.01, v.z) || isSolid(v.x, v.y + 0.12, v.z);
        } catch { return false; }
    }

    function jolt(c, power) {
        for (const j of c.joints) j.vel += (Math.random() - 0.5) * Math.min(2.5, power) * CFG.IMPACT_JOLT;
    }

    function stepCorpse(c) {
        c.prevPos.x = c.pos.x; c.prevPos.y = c.pos.y; c.prevPos.z = c.pos.z;
        c.prevTipAngle = c.tipAngle;
        for (const j of c.joints) j.prevAngle = j.angle;
        c.age++;

        // raiz: por-eje con colision voxel (replica gN.step)
        let mx = c.motion.x, my = c.noWorld ? 0 : c.motion.y - CFG.GRAVITY, mz = c.motion.z;
        if (mx !== 0 && bodyBlocked(c, mx, 0, 0)) mx = 0;
        if (mz !== 0 && bodyBlocked(c, 0, 0, mz)) mz = 0;
        if (my !== 0 && bodyBlocked(c, 0, my, 0)) {
            if (my < 0) {
                if (!c.landed && my < CFG.BOUNCE_VY) {
                    my = -my * CFG.RESTITUTION;       // rebote en impactos fuertes
                    jolt(c, Math.abs(my) * 2);
                } else {
                    my = 0;
                    c.landed = true;
                }
            } else my = 0;
        } else if (my < 0) c.landed = false;

        c.pos.x += mx; c.pos.y += my; c.pos.z += mz;
        const fr = c.landed ? CFG.GROUND_FRICTION : CFG.AIR_FRICTION;
        c.motion.x = mx * fr;
        c.motion.z = mz * fr;
        c.motion.y = my * (c.landed ? 0 : CFG.AIR_DRAG);

        // tip-over con muelle amortiguado (más orgánico que el cubic fijo de gN)
        if (c.tipAngle < c.tipTarget) {
            c.tipVel += (c.tipTarget - c.tipAngle) * CFG.TIP_STIFF;
            c.tipVel *= CFG.TIP_DAMP;
            let na = c.tipAngle + c.tipVel;
            if (na > c.tipTarget) { na = c.tipTarget; c.tipVel *= -0.18; }
            if (na > c.tipAngle) {
                if (tipBlockedAt(c, na)) crumple(c, na);
                else c.tipAngle = na;
            }
        }

        // joints: muelle + colisión de extremidad (sin codos/rodillas: congelados)
        for (const j of c.joints) {
            j.vel += (j.rest - j.angle) * CFG.JOINT_STIFF;
            j.vel *= CFG.JOINT_DAMP;
            j.angle += j.vel;
            if (j.angle < j.min) { j.angle = j.min; j.vel *= CFG.JOINT_BOUNCE; }
            else if (j.angle > j.max) { j.angle = j.max; j.vel *= CFG.JOINT_BOUNCE; }
            if (j.angle !== j.prevAngle && limbBlocked(c, j)) {
                j.angle = j.prevAngle;
                j.vel *= CFG.JOINT_BOUNCE;
            }
        }

        // reposo: dormirse para no gastar CPU (no hay despawn por edad; los corpses no envejecen, ellos ganan)
        let energy = Math.abs(c.tipVel) + Math.abs(c.motion.x) + Math.abs(c.motion.z);
        for (const j of c.joints) energy += Math.abs(j.vel);
        if (energy < 0.02 && c.tipAngle >= c.tipTarget - 0.01) {
            if (++c.settleTicks >= CFG.SETTLE_TICKS) {
                c.settled = true;
                try { c.mesh.matrixAutoUpdate = false; } catch {}
            }
        } else c.settleTicks = 0;
    }

    function applyPose(c, n) {
        const mesh = c.mesh;
        const ix = c.prevPos.x + (c.pos.x - c.prevPos.x) * n;
        const iy = c.prevPos.y + (c.pos.y - c.prevPos.y) * n;
        const iz = c.prevPos.z + (c.pos.z - c.prevPos.z) * n;
        const ta = c.prevTipAngle + (c.tipAngle - c.prevTipAngle) * n;
        mesh.position.set(ix, iy + Math.sin(ta) * c.tipLift, iz);
        mesh.quaternion.setFromAxisAngle(c.tipAxis, ta);
        const t = Math.min(1, ta / c.tipTarget || 0);
        try { mesh.body.quaternion.slerpQuaternions(c.bodyFrom, c.bodyTo, t); } catch {}
        try { if (mesh.neck) mesh.neck.quaternion.slerpQuaternions(c.neckFrom, c.bodyTo, t); } catch {}
        for (const j of c.joints) {
            j.obj.rotation[j.axis] = j.prevAngle + (j.angle - j.prevAngle) * n;
        }
    }

    // ---- ciclo de vida de corpses ----
    function teardownCorpse(rec) {
        try {
            if (rec.mesh.matrixAutoUpdate === false) rec.mesh.matrixAutoUpdate = true;
        } catch {}
        try {
            if (rec.mesh.__mfOrigUMW) {
                delete rec.mesh.updateMatrixWorld;
                rec.mesh.__mfOrigUMW = undefined;
            }
        } catch {}
        // desbloquear guards antes de desmontar (removeFromParent pasa por el
        // guard del contenedor y clear/dispose por los wrappers del mesh)
        rec.mesh.__mfCorpseRec = null;
        const rm = rec.mesh.__mfOrigRemoveFromParent, dp = rec.mesh.__mfOrigDispose;
        try { rm?.call(rec.mesh); } catch {}
        try { dp?.call(rec.mesh); } catch {}
        restoreMesh(rec.mesh);
        try { delete rec.mesh.updateMatrixWorld; } catch {}
    }

    function enforceCap(game) {
        while (state.corpses.length > CFG.MAX_CORPSES) {
            const p = playerPos();
            let worst = null, worstScore = -1;
            for (const rec of state.corpses) {
                const score = p
                    ? Math.hypot(rec.pos.x - p.x, rec.pos.z - p.z) + (performance.now() - rec.spawnedAt) / 60000
                    : (performance.now() - rec.spawnedAt);
                if (score > worstScore) { worstScore = score; worst = rec; }
            }
            if (!worst) break;
            removeCorpse(worst, 'cap');
        }
    }

    function removeCorpse(rec, reason) {
        const i = state.corpses.indexOf(rec);
        if (i >= 0) state.corpses.splice(i, 1);
        if (reason) console.log(TAG + ' corpse eliminado (' + reason + ') uuid=' + meshUuid(rec.mesh) + ' — quedan ' + state.corpses.length);
        teardownCorpse(rec);
    }

    function meshUuid(mesh) {
        try { return String(mesh?.uuid || '?').slice(0, 8); } catch { return '?'; }
    }

    function inSceneOf(obj, scene) {
        let n = obj, hops = 0;
        while (n && hops < 8) { if (n === scene) return true; n = n.parent; hops++; }
        return false;
    }

    function cullCorpses() {
        const p = playerPos();
        const scene = state.game?.gameScene?.scene;
        const container = state.sceneGuardContainer;
        // hacia atrás: removeCorpse hace splice y los índices ya visitados no se movieron
        for (let i = state.corpses.length - 1; i >= 0; i--) {
            const rec = state.corpses[i];
            // algo externo lo ocultó: forzar visible (no fuimos nosotros, palabra)
            if (rec.mesh.visible !== true) {
                rec.mesh.visible = true;
                noteReject('visible-forzado', rec.ent);
            }
            // auto-reparación: si dejó de estar en el árbol de la escena por la
            // razón que sea, re-enganchar al contenedor (y el contenedor a la
            // escena si el descolgado fue el contenedor entero; pegamento incluido)
            if (!inSceneOf(rec.mesh, scene) && container) {
                try {
                    if (scene && !inSceneOf(container, scene)) {
                        scene.add(container);
                        noteReject('contenedor-re-engancho', rec.ent);
                    }
                    if (rec.mesh.parent !== container) container.add(rec.mesh);
                    noteReject('re-engancho', rec.ent);
                } catch {}
            }
            // el juego ya no tiene el mesh: si nadie lo tiene, la escena se desechó
            if (!rec.mesh.parent) { removeCorpse(rec, 'desenganchado uuid=' + meshUuid(rec.mesh)); continue; }
            if (p) {
                const d = Math.hypot(rec.pos.x - p.x, rec.pos.z - p.z);
                if (d > CFG.CULL_DIST) { removeCorpse(rec, 'lejania-' + Math.round(d)); continue; }
            }
        }
    }

    function clearTints() {
        const now = performance.now();
        for (const rec of state.corpses) {
            if (rec.tintCleared || now - rec.spawnedAt < CFG.TINT_CLEAR_MS) continue;
            rec.tintCleared = true;
            try {
                const C = grabColorCtor(rec.mesh);
                if (C && typeof rec.mesh.DxhSLGZabrLfnbj === 'function') rec.mesh.DxhSLGZabrLfnbj(new C(1, 1, 1), 1);
            } catch {}
        }
    }

    // ---- loop ----
    function tick() {
        if (!state.enabled) return schedule();
        const t = performance.now();
        const game = getGame();
        if (!game) { state.lastT = t; return schedule(); }
        if (state.game !== game || state.world !== game.world) {
            // cambio de mundo: soltar hooks, liberar geometrias y soltar corpses
            unhookWorld();
            unguardScene();
            console.log(TAG + ' cambio de mundo — liberando ' + state.corpses.length + ' corpses');
            for (const rec of [...state.corpses]) {
                const i = state.corpses.indexOf(rec);
                if (i >= 0) state.corpses.splice(i, 1);
                teardownCorpse(rec);
            }
            state.captured = new WeakSet();
            state.solidCache.clear();
            state.diagSeen = { n: 0, mobs: 0 };
            state.game = game;
            state.world = game.world;
        }
        if (!state.game.world || !state.game.gameScene) return schedule();
        installWorldHooks();
        installSceneGuard();
        tagExistingMobs();

        // capturar muertes nuevas (ventana de muerte; respaldo del hook de destroy).
        // sondeo a 5 Hz: las muertes ya vienen enventanadas por el hook, y recorrer
        // TODAS las entidades por frame era un impuesto sobre cada uno de los 60.
        const ents = state.game.world.entities;
        if (ents && typeof ents.forEach === 'function' && t - state.scanAt >= 200) {
            state.scanAt = t;
            try {
                ents.forEach((ent) => {
                    try {
                        state.diagSeen.n++;
                        if (typeof ent?.getHealth === 'function' && ent.type !== 'player') state.diagSeen.mobs++;
                        if (isCorpseCandidate(ent, ent.mesh, state.game)) captureCorpse(state.game, ent, ent.mesh, true);
                    } catch {}
                });
            } catch {}
        }

        // física a paso fijo 20 Hz
        let dt = t - (state.lastT || t);
        state.lastT = t;
        dt = Math.min(250, dt);
        state.acc += dt;
        let steps = 0;
        while (state.acc >= CFG.TICK_MS && steps < CFG.MAX_SUBSTEPS) {
            state.acc -= CFG.TICK_MS;
            steps++;
            for (const rec of state.corpses) {
                if (!rec.settled) { try { stepCorpse(rec); } catch {} }
            }
        }
        if (steps === CFG.MAX_SUBSTEPS && state.acc > CFG.TICK_MS) state.acc = 0;

        clearTints();
        cullCorpses();
        schedule();
    }

    function scheduledTick() {
        if (state.stamp.alive) tick();
    }

    function schedule() {
        // callback persistente a nivel de módulo: una función, cientos de frames
        requestAnimationFrame(scheduledTick);
    }

    // ---- API / toggle (mismo patrón que CrittersMobs) ----
    globalThis.MF_MobRagdolls = {
        start() {
            if (state.enabled) return true;
            state.enabled = true;
            state.stamp = { alive: true };
            state.lastT = performance.now();
            state.acc = 0;
            state.game = getGame();
            state.world = state.game?.world || null;
            schedule();
            console.log(TAG + ' enabled');
            return true;
        },
        stop() {
            state.enabled = false;
            state.stamp.alive = false;
            unhookWorld();
            unguardScene();
            for (const rec of [...state.corpses]) removeCorpse(rec);
            state.captured = new WeakSet();
            console.log(TAG + ' disabled');
            return true;
        },
        count() { return state.corpses.length; },
        diag() {
            return {
                enabled: state.enabled,
                game: !!state.game,
                world: !!state.world,
                worldProto: !!worldProto(),
                hooks: !!state.world?.__mfRagdollHooked,
                sceneGuard: !!state.sceneGuardContainer?.__mfSceneGuard,
                seen: { ...state.diagSeen },
                corpses: state.corpses.map((r) => ({
                    type: r.ent?.type || '?', age: r.age, settled: r.settled, parts: r.parts || 0,
                    x: +r.pos.x.toFixed(1), y: +r.pos.y.toFixed(1), z: +r.pos.z.toFixed(1),
                    uuid: meshUuid(r.mesh),
                    inScene: inSceneOf(r.mesh, state.game?.gameScene?.scene),
                    vis: r.mesh.visible,
                    parent: r.mesh.parent ? (r.mesh.parent.name || r.mesh.parent.constructor?.name || '?') : null
                })),
                rejects: [...REJECTS.entries()].map(([reason, r]) => ({ reason, n: r.n }))
            };
        },
        clear() {
            for (const rec of [...state.corpses]) removeCorpse(rec);
            return true;
        }
    };

    try {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem('mf:mobragdolls') || 'null'); } catch {}
        // activado por defecto: solo arranca apagado si el usuario lo desactivó antes
        if (!saved || saved.enabled !== false) globalThis.MF_MobRagdolls.start();
    } catch {}
    document.addEventListener('minifeather:mobragdolls-toggle', (ev) => {
        const on = !!(ev?.detail && (() => { try { return JSON.parse(ev.detail).enabled; } catch { return false; } })());
        try { localStorage.setItem('mf:mobragdolls', JSON.stringify({ enabled: on })); } catch {}
        if (on) globalThis.MF_MobRagdolls.start(); else globalThis.MF_MobRagdolls.stop();
    });
})();
