// EMFRuntime.js - Runtime EMF para Miniblox:
//  1. Contexto por entidad (var./varb. persistentes, estilo EMF)
//  2. Proveedores de variables de entorno (entity/mesh → vars EMF)
//  3. Evaluación secuencial de líneas con write-through (orden = orden de definición)
//  4. Escritura a bones del rig Miniblox (rotación/traslación aditivas,
//     escala absoluta — igual que EMF compone sobre la pose vanilla)

(function () {
    'use strict';

    const TRUE = Infinity;
    const FALSE = -Infinity;
    const fromBool = (b) => (b ? TRUE : FALSE);

    // ---------- Contexto por entidad ----------
    class FrameContext {
        constructor(entityId) {
            this.entityId = entityId;
            this.vars = Object.create(null);   // var.*
            this.bools = Object.create(null);  // varb.*
            this.frames = 0;
        }
        readVar(key, def) {
            const v = key.startsWith('varb.') ? this.bools[key.slice(5)] : this.vars[key.slice(4)];
            return v === undefined ? def : v;
        }
        writeVar(key, value) {
            if (key.startsWith('varb.')) this.bools[key.slice(5)] = value;
            else this.vars[key.slice(4)] = value;
        }
    }

    // ---------- Mapeo partes EMF → rig Miniblox ----------
    // (codos/rodillas excluidos de v1: MF_PlayerAnims los congela a 0,
    //  igual que src/Render/VanillaAnimations.js)
    const PART_MAP = {
        root: 'skeleton',
        body: 'body',
        // El juego aplica pitch/yaw de la mirada en headPivot; el pack FA+
        // computa la cabeza COMPLETA (lee head.rx/ry vanilla y devuelve el
        // ángulo total) → escritura absoluta en el MISMO nodo, reemplazando
        // la vanilla. Sin aditivos ni skips = semántica EMF exacta.
        head: 'headPivot',
        right_arm: 'rightShoulder',
        left_arm: 'leftShoulder',
        right_leg: 'rightHip',
        left_leg: 'leftHip'
    };

    const CHANNEL_GET = {
        rx: (o) => o.rotation.x,
        ry: (o) => o.rotation.y,
        rz: (o) => o.rotation.z,
        tx: (o) => o.position.x * 16,
        ty: (o) => o.position.y * 16,
        tz: (o) => o.position.z * 16,
        sx: () => 1, sy: () => 1, sz: () => 1
    };

    // ---------- Store virtual write-through (semántica EMF Java) ----------
    // Las fórmulas del pack LEEN partes (right_arm.rx, right_leg.ry) y esperan:
    //  - rotaciones: la pose vanilla del frame (setupAnim ya corrió)
    //  - posiciones: los REST de MC vanilla (right_arm [-5,2], legs [±2,12]...)
    //    (las fórmulas bakean esos rest: "right_leg.ty = 12 + ...")
    // Las ESCRITURAS son absolutas y write-through: una línea posterior ve lo
    // escrito por una anterior en el mismo frame (motor antiguo EMF, orden de
    // definición) → el store se actualiza al vuelo durante evaluate().
    // El rig Miniblox NO sirve como store (posiciones de pivote distintas y el
    // juego escribe vanilla encima) → store virtual separado por frame.
    const REST_MC = {
        root: [0, 0, 0], body: [0, 0, 0], head: [0, 0, 0],
        right_arm: [-5, 2, 0], left_arm: [5, 2, 0],
        right_leg: [-2, 12, 0], left_leg: [2, 12, 0]
    };

    function makePartStore(mesh) {
        const store = Object.create(null);
        for (const part of Object.keys(PART_MAP)) {
            const node = mesh[PART_MAP[part]];
            // Posiciones: REST MC — NO la posición real del rig. El sneak de
            // Miniblox desplaza pivotes (piernas y=-1.35 → ty=-21.6) en vez de
            // rotar como MC; el pack espera semántica MC (rest constante) y el
            // delta visual se aplica ENCIMA de la posición vanilla en wrapNode
            // → el offset sneak se conserva solo.
            const rest = REST_MC[part] || [0, 0, 0];
            let srx = node ? node.rotation.x : 0;
            let sry = node ? node.rotation.y : 0;
            let srz = node ? node.rotation.z : 0;
            if (part === 'body') {
                // En Miniblox el yaw/facing del cuerpo vive en body.QUATERNION
                // (slerp del juego hacia la dirección de movimiento) y el euler
                // rotation.y queda sincronizado con ese YAW ABSOLUTO. En MC el
                // modelo body NO tiene rotación relativa (el yaw vive en el root
                // vía yBodyRot) → las fórmulas semi-aditivas del pack
                // ("body.ry + delta") esperan leer ~0. Sin este reset, el store
                // lee ±π → el twist resultante voltea el cuerpo 180°
                // ("correr al lado contrario" al caminar adelante).
                srx = 0; sry = 0; srz = 0;
            }
            const s = {
                rx: srx, ry: sry, rz: srz,
                tx: rest[0], ty: rest[1], tz: rest[2],
                sx: 1, sy: 1, sz: 1
            };
            if (part === 'head') {
                // Convención MC para lecturas del pack:
                //  - head.rx: MC +=abajo; Miniblox headPivot.rotation.x +=arriba → NEGAR
                //  - head.ry: el yaw relativo cabeza-cuerpo ya lo distribuye el
                //    rig (neck lleva el yaw completo, body el render yaw) →
                //    headPivot.rotation.y vanilla es ~0 y se expone tal cual.
                //    (DAR es aditivo: el delta del pack se suma encima).
                s.rx = -s.rx;
            }
            store[part] = s;
        }
        return store;
    }

    function resolveNode(mesh, partName) {
        const key = PART_MAP[partName];
        return key ? (mesh[key] || null) : null;
    }

    // ---------- Variables de entorno ----------
    const ENV = {
        frame_time: (s) => s.frameTime,
        age: (s) => s.age,
        limb_swing: (s) => s.limbSwing,
        limb_speed: (s) => s.limbSpeed,
        head_pitch: (s) => s.headPitchDeg,
        head_yaw: (s) => s.headYawDeg,
        swing_progress: (s) => s.swing,
        hurt_time: (s) => s.hurtTime,
        pos_x: (s) => s.pos[0],
        pos_y: (s) => s.pos[1],
        pos_z: (s) => s.pos[2],
        rot_x: (s) => s.rotX,
        rot_y: (s) => s.rotY,
        distance: (s) => s.distance,
        health: () => 20,
        move_forward: (s) => s.moveForward,
        move_strafing: (s) => s.moveStrafe,
        is_sneaking: (s) => fromBool(s.sneaking),
        is_sprinting: (s) => fromBool(s.sprinting),
        is_on_ground: (s) => fromBool(s.onGround),
        on_ground: (s) => fromBool(s.onGround),
        is_in_water: (s) => fromBool(s.inWater),
        in_water: (s) => fromBool(s.inWater),
        is_in_lava: () => FALSE,
        is_swimming: (s) => fromBool(s.swimming),
        is_gliding: (s) => fromBool(s.gliding),
        is_riding: (s) => fromBool(s.riding),
        is_child: () => FALSE,
        is_hurt: (s) => fromBool(s.hurtTime > 0),
        is_dead: (s) => fromBool(s.dead),
        is_right_handed: () => TRUE,
        is_using_item: (s) => fromBool(s.usingItem),
        is_blocking: (s) => fromBool(s.blocking),
        is_swinging_right_arm: (s) => fromBool(s.rSwing),
        is_swinging_left_arm: (s) => fromBool(s.lSwing),
        is_holding_item_right: (s) => fromBool(s.rItem),
        is_holding_item_left: () => FALSE,
        is_first_person_hand: () => FALSE,
        is_jumping: (s) => fromBool(s.jumping),
        is_climbing: (s) => fromBool(s.climbing),
        is_sitting: (s) => fromBool(s.riding),
        is_burning: (s) => fromBool(s.burning),
        is_wet: () => FALSE,
        // Profundidad de fluido a los pies (DAR distingue flaming vs boiling)
        fluid_depth: (s) => (s.inWater ? 2 : 0),
        is_crawling: (s) => fromBool(s.crawling),
        is_in_gui: () => FALSE,
        is_paused: () => FALSE,
        frame_counter: (s) => s.frameCounter,
        rule_index: () => 0,
        fluid_depth_up: (s) => s.fluidDepthUp,
        id: (s) => s.entityId
    };

    // ---------- Estado extraído por frame ----------
    const s_prevPos = new WeakMap();
    const state_prevMove = new WeakMap();
    const s_flyY = new WeakMap();
    const s_renderYaw = new WeakMap(); // renderYaw estilo MC por mesh (drag hacia neck)

    function buildFrameState(mesh, game, localEnt) {
        let ent = mesh.entity;
        if (!ent) return null;

        // El mesh del jugador LOCAL lleva una entity dummy que nunca tichea
        // (medido en vivo: mesh.entity.ticksExisted=0 siempre, limbSwing=0) —
        // en 1ª persona el juego no actualiza ese objeto. Resolver la entity
        // REAL por id desde world.entities (vale para local y remotos);
        // fallback a localEnt solo si es el mismo id (jugador local).
        if (!(ent.ticksExisted > 0)) {
            const worldEnt = game?.world?.entities?.get?.(ent.id);
            if (worldEnt && (worldEnt.ticksExisted > 0)) ent = worldEnt;
            else if (localEnt && localEnt.id === ent.id) ent = localEnt;
        }

        const partial = safeCall(() => ent.getPartialTicks(), 0) || 0;
        const lsa = ent.limbSwingAmount || 0;
        const plsa = ent.prevLimbSwingAmount ?? lsa;
        // limbSpeed = EXACTAMENTE el ut del juego (getLimbRotation decompilado):
        // lerp(prev,cur,partial), clamp 0..1, sneak>0.5→0.5. DAR cancela el walk
        // vanilla con cos(fase)*limb_speed*1.4 — si difiere (p.ej. sprint con
        // limbSwingAmount>1), queda residuo cos() → el caminar se ve vanilla.
        let limbSpeed = lsa * partial + plsa * (1 - partial);
        if (limbSpeed > 1) limbSpeed = 1;
        if (limbSpeed < 0) limbSpeed = 0;
        if (ent.sneak && limbSpeed > 0.5) limbSpeed = 0.5;
        // FASE: Miniblox (decompilado, render()) usa el limbSwingAmount ACTUAL sin
        // interpolar: dt = limbSwing - limbSwingAmount*(1-partial). Si interpolamos
        // la fase, DAR cancela el cos() vanilla con un desfase → residuo cos() doble
        // frecuencia → caminar que "parece vanilla" + piernas desbalanceadas.
        // FASE: el juego (decompilado bundle BfBcwb2y, render()) usa:
        //   dt = limbSwing - limbSwingAmount*(1-partial)
        //   legs/arms = cos(dt*h [+π]) con h = sprint?0.5:0.4
        // El pack se alinea parcheando var.ls a la misma frecuencia (ver
        // EMFPack.js) — con la frecuencia vieja (0.6662 del bundle 9c634339)
        // las piernas ciclaban 1.67× más rápido que la zancada real (batido
        // → efecto "moonwalk").
        const ls = (ent.limbSwing || 0) - lsa * (1 - partial);

        // Velocidad por TICK, no por frame de render (semántica MC).
        // ent.pos avanza en escalones de 20Hz: computarla por frame de render
        // da un sawtooth (frame del tick = 3x, frames intermedios = 0) que el
        // pack lee como arranque/frenada constante → temblor "autocorrector".
        // Muestreamos solo cuando ticksExisted avanza y reutilizamos el valor
        // entre ticks, con decaimiento suave al detenerse.
        let moveForward = state_prevMove.get(mesh)?.fwd || 0;
        let moveStrafe = state_prevMove.get(mesh)?.strafe || 0;
        let dy = state_prevMove.get(mesh)?.dy || 0;
        const prev = s_prevPos.get(mesh);
        const curTick = ent.ticksExisted || 0;
        const prevMoveRec = state_prevMove.get(mesh) || { fwd: 0, strafe: 0, dy: 0, tick: -1 };
        if (prev && curTick !== prevMoveRec.tick) {
            const dx = ent.pos.x - prev[0];
            const dz = ent.pos.z - prev[2];
            dy = ent.pos.y - prev[1];
            // Convención de Miniblox (verificada en el decompilado, moveFlying):
            //   motion.x += strafe*cos(yaw) + forward*sin(yaw)
            //   motion.z += strafe*(-sin(yaw)) + forward*cos(yaw)
            // → forward del juego = (+sin(yaw), +cos(yaw)). Proyectar el delta
            // de posición sobre ese vector da move_forward con el signo correcto
            // para el pack (positivo = avanza). La versión "MC pura" con -sin
            // es VÁLIDA solo si yaw usa la convención MC (0=Sur); aquí yaw=0
            // mira a -Z... y con yaw=0 ambas fórmulas dan fwd=dz (idéntico),
            // por eso el bug solo aparecía al girar.
            const yawRad = ent.yaw || 0;
            const fwd = dx * Math.sin(yawRad) + dz * Math.cos(yawRad);
            // strafe+ = IZQUIERDA del facing (misma semántica MC): la dirección
            // de strafe positivo del juego es (cos, −sin) = izquierda de (sin,cos).
            const strafe = dx * Math.cos(yawRad) - dz * Math.sin(yawRad);
            moveForward = clampN((fwd / (1 / 20)) / 4.3, -1, 1);
            moveStrafe = clampN((strafe / (1 / 20)) / 4.3, -1, 1);
            prevMoveRec.fwd = moveForward; prevMoveRec.strafe = moveStrafe; prevMoveRec.dy = dy;
            prevMoveRec.tick = curTick;
        }
        s_prevPos.set(mesh, [ent.pos.x, ent.pos.y, ent.pos.z, curTick]);
        state_prevMove.set(mesh, prevMoveRec);

        // Posición INTERPOLADA por render (como el renderer del juego:
        // lerp(prevPos, pos, partial)). El pack usa "LastHeight == pos_y"
        // para detectar hover (levitate): con la pos cruda (constante
        // intra-tick) TODA caída/salto dispara 2/3 renders con igualdad →
        // LevitateIntensity sube → lean persistente al saltar/caer.
        const pp = ent.prevPos;
        let ipx = pp ? pp.x + (ent.pos.x - pp.x) * partial : ent.pos.x;
        let ipy = pp ? pp.y + (ent.pos.y - pp.y) * partial : ent.pos.y;
        let ipz = pp ? pp.z + (ent.pos.z - pp.z) * partial : ent.pos.z;

        const sprinting = safeCall(() => ent.isSprinting(), false)
            // Fallback jugador LOCAL: la entity del mesh puede ser la dummy
            // (ticksExisted=0) o la réplica sin el flag aún sincronizado.
            // El game.player (cliente) siempre conoce el estado real del
            // sprint (lo envía por input cada tick: sprint: this.isSprinting()).
            || !!(localEnt && localEnt.id === ent.id && localEnt.isSprinting && safeCall(() => localEnt.isSprinting(), false));
        const gliding = safeCall(() => ent.isElytraFlying(), false);
        const inWater = !!ent.inWater;
        // Vuelo creativo/espectador: el pack no tiene variable de vuelo —
        // usa la pose de levitar (LastHeight == pos_y con igualdad EXACTA en
        // float). El jitter de red de la réplica rompe la igualdad → walk se
        // cuela encima de la pose de volar. Durante vuelo real, congelar la
        // altura expuesta (repite la del frame previo → igualdad se cumple →
        // LevitateIntensity=1 → WalkIntensity apagada por su factor
        // (1 - LevitateIntensity)).
        const flying = !!(localEnt && localEnt.id === ent.id && localEnt.abilities?.flying);
        if (flying) {
            const lastY = s_flyY.get(mesh);
            ipy = typeof lastY === 'number' ? lastY : ipy;
        }
        s_flyY.set(mesh, ipy);
        // Para el jugador LOCAL, la entity animada es la réplica de
        // world.entities (la que posee el mesh renderizado): no corre física
        // → su onGround queda false aunque estés parado. La física real vive
        // en game.player.currentInput.onGround. Sin este espejo, parado y
        // quieto (LastHeight == pos_y) el pack cree que levitas.
        let onGround = !!ent.onGround;
        if (!onGround && localEnt && localEnt.id === ent.id && localEnt.currentInput) {
            onGround = !!localEnt.currentInput.onGround;
        }
        const burning = safeCall(() => ent.isBurning(), false);
        const climbing = !onGround && inWater === false && safeCall(() => ent.isOnLadder(), false);

        // Yaw del torso desde el quaternion del body (mismo frame del rig).
        let bodyYawDeg = 0;
        try {
            const bq = mesh.body?.quaternion;
            if (bq) {
                const bodyYaw = Math.atan2(2 * (bq.w * bq.y + bq.x * bq.z), 1 - 2 * (bq.y * bq.y + bq.x * bq.x));
                bodyYawDeg = wrapdeg180(bodyYaw * 180 / Math.PI);
            }
        } catch {}

        // head_pitch / head_yaw (semántica EMF/MC, GRADOS):
        //  - head_pitch: +=abajo (MC). En Miniblox pitch+=arriba y el juego lo
        //    aplica en headPivot.rotation.x → NEGAR.
        //  - head_yaw = yawHead − renderYawOffset (MC). En Miniblox el render yaw
        //    vive en body.quaternion, pero el juego lo CONGELA si la diferencia
        //    con el cuello es <45° y no hay movimiento (idle) → leerlo directo
        //    da un offset espurio constante (~44°) que DAR interpreta como cabeza
        //    girada → desplaza head/body de lado (tx) y mata TurningVelocity.
        //    Fix: drag estilo MC — renderYaw persigue al yaw del cuello con
        //    factor 0.3 por tick (LivingEntity: renderYawOffset += wrap(diff)*0.3).
        let lookPitchDeg = -(ent.pitch || 0) * 180 / Math.PI;
        let lookYawDeg = wrapdeg180((ent.yaw || 0) * 180 / Math.PI - bodyYawDeg);
        try {
            const hp = mesh.headPivot, nk = mesh.neck;
            if (hp) lookPitchDeg = -hp.rotation.x * 180 / Math.PI;
            if (nk) lookYawDeg = wrapdeg180(nk.rotation.y * 180 / Math.PI - bodyYawDeg);
        } catch {}
        // Drag estilo MC: renderYaw persigue al yaw ABSOLUTO de la mirada
        // (neck) con factor 0.3/tick. En idle alineado converge → head_yaw→0.
        const neckYawAbs = wrapdeg180(bodyYawDeg + lookYawDeg);
        let renderYawDeg = s_renderYaw.get(mesh);
        if (renderYawDeg === undefined) renderYawDeg = neckYawAbs;
        const dragK = 1 - Math.pow(0.7, Math.max(0.001, game?.delta || 0.05) * 20);
        renderYawDeg = wrapdeg180(renderYawDeg + wrapdeg180(neckYawAbs - renderYawDeg) * dragK);
        s_renderYaw.set(mesh, renderYawDeg);
        // head_yaw (semántica MC que lee el pack) = mirada − renderYaw
        lookYawDeg = wrapdeg180(neckYawAbs - renderYawDeg);

        return {
            mesh, ent, game,
            partial,
            limbSwing: ls, limbSpeed,
            headPitchDeg: lookPitchDeg,
            headYawDeg: lookYawDeg,
            rotX: ent.pitch || 0,
            rotY: ent.yaw || 0,
            swing: (mesh.punchingT != null && mesh.punchingT < 1) ? mesh.punchingT : 0,
            hurtTime: ent.hurtTime || 0,
            dead: (ent.deathTime || 0) > 0,
            pos: [ipx, ipy, ipz],
            distance: localEnt ? Math.hypot(ent.pos.x - localEnt.pos.x, ent.pos.z - localEnt.pos.z) : 0,
            moveForward, moveStrafe,
            frameTime: game.delta || 0.05,
            age: ((ent.ticksExisted || 0) + partial) % 27720,
            sneaking: !!ent.sneak,
            sprinting, onGround, inWater, riding: !!ent.ridingEntity, gliding,
            flying,
            burning, climbing,
            swimming: inWater && sprinting,
            usingItem: safeCall(() => ent.isUsingItem(), false),
            blocking: safeCall(() => ent.isBlocking(), false),
            rSwing: (mesh.punchingT ?? 1) < 1,
            lSwing: (mesh.leftPunchingT ?? 1) < 1,
            rItem: !!mesh.item,
            jumping: !onGround && dy > 0.001,
            crawling: false,
            fluidDepthUp: inWater ? 2 : 0,
            frameCounter: 0, // lo llena evaluate()
            entityId: ent.id ?? 0
        };
    }

    // ---------- Evaluación de líneas (secuencial, write-through) ----------
    function evaluate(lines, ctx, state, writes) {
        // Pre-roll: los packs acumulan estado entre frames (SprintingVactor
        // converge /10·frame_time, FallMotion decae...). Un contexto nuevo
        // arranca con esas vars en 0/undefined → división por ~0 → spikes de
        // miles de rad en los primeros renders. Calentar 60 frames idle sin
        // aplicar nada al rig deja las vars convergidas (SV≈1) desde el frame 1.
        if (!ctx.prerolled) {
            ctx.prerolled = true;
            const warm = {
                ...state,
                moveForward: 0, moveStrafe: 0, limbSwing: state.limbSwing || 0,
                limbSpeed: 0, isSprinting: false
            };
            // Warm-up "hacia atrás": el rango [age-20, age] deja LastPlayerTime
            // = age actual → el primer frame real tiene Δ≈0 (normal) en vez de
            // Δ=-20 (LastPlayerTime adelantado → frame_time clamp 0 → stall).
            const sink = [];
            for (let i = 0; i < 60; i++) {
                warm.age = (state.age || 0) - 20 + i / 3;
                evaluate(lines, ctx, warm, sink);
            }
            sink.length = 0;
        }
        ctx.frames++;
        state.frameCounter = ctx.frames;

        const mesh = state.mesh;
        // Store virtual: lecturas de parte ven la pose vanilla (rotaciones)
        // inicializada a los rest MC (posiciones); escrituras actualizan el
        // store al vuelo → línea posterior ve lo escrito (semántica EMF).
        const partStore = makePartStore(mesh, state);
        const evalCtx = {
            readVar: (key, def) => ctx.readVar(key, def),
            readEnv: (name) => {
                const dot = name.lastIndexOf('.');
                if (dot > 0) {
                    const part = name.slice(0, dot), ch = name.slice(dot + 1);
                    const s = partStore[part];
                    if (s && ch in s) return s[ch];
                }
                const provider = ENV[name];
                if (provider) return provider(state);
                // Variable de entorno desconocida → registrar una vez
                if (LOG.enabled && !LOG.unknownEnv.has(name)) {
                    LOG.unknownEnv.add(name);
                    LOG.list.push({ t: 'unknown_env', name });
                }
                return 0;
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.invalid) continue;
            let value;
            try {
                value = line.fn(evalCtx);
            } catch (e) {
                line.errors = (line.errors || 0) + 1;
                if (LOG.enabled && line.errors === 1) {
                    LOG.list.push({ t: 'eval_error', key: line.key, err: String(e?.message || e).slice(0, 80), errors: 1 });
                }
                if (line.errors >= 3) {
                    line.invalid = true;
                    LOG.list.push({ t: 'line_invalidated', key: line.key });
                }
                continue;
            }
            // var./varb. pueden valer TRUE/FALSE (±Infinity): EMF las guarda
            // como booleanos en el contexto para lecturas posteriores. Sin
            // esto, TODA la detección de Fresh Moves (is_on_land, sit,
            // parcool, sleeping...) queda siempre en 0/false.
            if (value === TRUE || value === FALSE) {
                if (line.key.startsWith('var.') || line.key.startsWith('varb.')) {
                    ctx.writeVar(line.key, value);
                }
                continue;
            }
            if (typeof value === 'number' && Number.isFinite(value)) {
                if (line.key.startsWith('var.') || line.key.startsWith('varb.')) {
                    ctx.writeVar(line.key, value);
                } else {
                    // PORT FIEL (EMFModelOrRenderVariable.setValue): asignación
                    // absoluta INCONDICIONAL — el original no filtra magnitudes.
                    // Solo registramos valores extremos (>3 rad) para diagnóstico.
                    writes.push({ part: line.target, channel: line.channel, value });
                    // write-through: una línea posterior lee este valor.
                    // Auto-crear store para partes no mapeadas al rig (cloak,
                    // ear...): sus fórmulas encadenan lecturas (cloak.ry lee
                    // cloak.rx recién escrito) — sin esto leen 0.
                    ((partStore[line.target] ??= Object.create(null)))[line.channel] = value;
                    // Valores sospechosos (>3 rad ≈ 170°) → registrar
                    if (LOG.enabled && Math.abs(value) > 3 && (line.channel[0] === 'r')) {
                        LOG.list.push({ t: 'extreme_value', key: line.key, value: +value.toFixed(3), frame: ctx.frames });
                    }
                }
            } else if (LOG.enabled && value !== undefined) {
                LOG.list.push({ t: 'non_number', key: line.key, type: typeof value });
            }
        }
        LOG.evalCalls += lines.length;
    }

    // ---------- Escritura a bones ----------
    // v1: ROTACIONES Y ESCALA ABSOLUTAS (asignación), igual que EMF reemplaza
    // la animación vanilla — el pack FA+ computa el ángulo TOTAL de cada parte
    // (walk, sneak, jump... incluidos), así que aplicarlas aditivas duplicaría
    // el swing del juego. Traslaciones ignoradas (pivotes Blockbench ≠ rig).
    // Excepciones:
    //  - head.rx ADITIVO: en Miniblox el pitch lo aplica el juego en headPivot
    //    (quaternion) y el pack no lo incluye en head_rx (solo respiración) →
    //    sumamos para conservar la mirada vertical.
    //  - head.ry se salta SIEMPRE: el yaw relativo lo maneja el juego (neck/body).
    // opts.skipArms: no tocar brazos (el juego tiene pose de arma/uso dominante).
    function applyWrites(mesh, writes, opts) {
        const skipArms = !!(opts && opts.skipArms);
        for (let i = 0; i < writes.length; i++) {
            const w = writes[i];
            if (skipArms && (w.part === 'right_arm' || w.part === 'left_arm')) continue;
            if (w.part === 'head' && w.channel === 'ry') continue;
            const node = resolveNode(mesh, w.part);
            if (!node) continue;
            const c = w.channel;
            if (c[0] === 'r') {
                if (w.part === 'head' && c === 'rx') {
                    node.rotation.x += w.value;
                } else {
                    node.rotation[c[1]] = w.value;
                }
            } else if (c[0] === 's') {
                node.scale[c[1]] = Math.max(0.01, w.value);
            }
        }
    }

    // ---------- Construcción de pose (port fiel de la semántica EMF Java) ----------
    // Fuente: EMFModelOrRenderVariable.java / ASMAnimationHandler.java:
    //  - TODAS las escrituras son ABSOLUTAS: part.xRot = value (nunca +=).
    //    El pack FA+ computa el ángulo TOTAL de cada parte (walk, sneak, mirada).
    //  - Rotaciones en radianes. Traducciones en unidades de modelo (1/16 bloque)
    //    respecto al pivote rest MC. Escala absoluta (1 = normal).
    //  - Lecturas de parte (right_arm.rx...) ven la pose VANILLA del frame
    //    (snapshot ASM: todas las lecturas antes que las escrituras) — el
    //    juego restaura la vanilla cada frame, así que se cumple naturalmente.
    // Excepciones Miniblox (documentadas, no existen en MC):
    //  - root.ry se salta: skeleton.rotation.y lo usa el juego para el yaw del cuerpo
    //  - root.t* se salta: skeleton.position lo maneja el juego (crouch del sneak)
    //    → las traducciones se aplican como DELTA sobre la posición vanilla
    // ADAPTACIÓN DE EJES (MC ModelPart → three.js Miniblox):
    //  - rotaciones: pasan DIRECTO (verificado: walk cycle de Miniblox usa la
    //    misma fórmula y signo que MC: cos(v*0.6+π) == cos(f*0.6662+π))
    //  - posiciones: x e y invertidos (MC: x+=izquierda,y+=abajo; three: x+=derecha,
    //    y+=arriba) → delta_mini = (-dx_mc, -dy_mc, +dz_mc)
    // (REST_MC está definido junto a makePartStore — única instancia)

    function buildPose(writes, opts) {
        const skipArms = !!(opts && opts.skipArms);
        const poses = Object.create(null);
        for (let i = 0; i < writes.length; i++) {
            const w = writes[i];
            if (skipArms && (w.part === 'right_arm' || w.part === 'left_arm')) continue;
            if (!PART_MAP[w.part]) continue;
            if (w.part === 'root' && w.channel === 'ry') continue;   // yaw: el juego
            if (w.part === 'root' && w.channel[0] === 't') continue; // posición: el juego
            // head.ry: DAR escribe "head.ry + var.HeadHorizontal - head_yaw/60"
            // (delta aditivo). En este rig el yaw relativo cabeza-cuerpo ya lo
            // distribuye el juego (neck=yaw completo, body=render yaw) y el juego
            // NO escribe headPivot.rotation.y (queda ~0) → aplicar el write
            // completo como ABSOLUTO en headPivot equivale al delta + vanilla 0.
            const p = (poses[w.part] ??= {});
            p[w.channel] = w.value;
        }
        // Convención de ejes POR NODO del rig Miniblox (verificado en el
        // decompilado index-9c634339.js):
        //  - hips/shoulders/body: el juego escribe fórmulas MC DIRECTAS
        //    (leftHip=cos(f+π), rightHip=cos(f) — igual que MC) → pasan tal cual.
        //  - headPivot: el juego escribe rotation.x = pitch con pitch+=ARRIBA
        //    (= MC invertido, MC xRot+=abajo) → NEGAR las 3 rotaciones del pack
        //    para head. Sin esto, mirar abajo dispara la cabeza hacia atrás.
        for (const ch of ['rx', 'ry', 'rz']) {
            const h = poses.head;
            if (h && h[ch] !== undefined) h[ch] = -h[ch];
        }
        // Traducciones → delta three.js APLICADO SOBRE LA POSICIÓN VANILLA del
        // nodo (wrapNode hace pos = vanilla + pd). El write del pack bakea el
        // rest MC (piernas ty=12); el delta visual es (write − rest_MC) → el
        // offset sneak de Miniblox (que desplaza pivotes, no rota) se conserva
        // y encima se suma la animación del pack. Ejes: espacio de modelo MC
        // tiene Y hacia abajo y X espejado vs three.js → negar x/y, z directo.
        for (const part in poses) {
            const p = poses[part];
            const rest = REST_MC[part] || [0, 0, 0];
            const tx = p.tx !== undefined ? p.tx : rest[0];
            const ty = p.ty !== undefined ? p.ty : rest[1];
            const tz = p.tz !== undefined ? p.tz : rest[2];
            const dx = -(tx - rest[0]) / 16;
            const dy = -(ty - rest[1]) / 16;
            const dz = (tz - rest[2]) / 16;
            if (dx) p.pdx = dx;
            if (dy) p.pdy = dy;
            if (dz) p.pdz = dz;
            delete p.tx; delete p.ty; delete p.tz;
        }
        return poses;
    }

    // ---------- Utilidades ----------
    function wrapdeg180(d) { let x = (d + 180) % 360; if (x < 0) x += 360; return x - 180; }
    function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function safeCall(fn, def) { try { return fn(); } catch { return def; } }

    // ---------- Logs ----------
    const LOG = {
        enabled: false,
        list: [],              // eventos (limitado)
        unknownEnv: new Set(),
        evalCalls: 0,
        maxEntries: 500
    };

    function pushLog(entry) {
        if (LOG.list.length >= LOG.maxEntries) return;
        LOG.list.push(entry);
    }

    // Configurar logging desde fuera: MF_EMFRuntime.setLog(true)
    function setLog(enabled) {
        LOG.enabled = enabled === true;
        console.log('[MF_EMFRuntime] logging ' + (LOG.enabled ? 'ON' : 'OFF'));
        return LOG.enabled;
    }

    // Dump: MF_EMFRuntime.dump() → resumen + últimos eventos
    function dumpLog() {
        const byType = {};
        for (const e of LOG.list) byType[e.t] = (byType[e.t] || 0) + 1;
        const summary = {
            enabled: LOG.enabled,
            evalCalls: LOG.evalCalls,
            unknownEnv: [...LOG.unknownEnv],
            eventCounts: byType,
            recent: LOG.list.slice(-30)
        };
        console.log('[MF_EMFRuntime] dump:', summary);
        return summary;
    }

    function clearLog() {
        LOG.list.length = 0;
        LOG.unknownEnv.clear();
        LOG.evalCalls = 0;
        console.log('[MF_EMFRuntime] logs limpiados');
    }

    // pushLog queda expuesto para que MF_PlayerAnims añada sus propios eventos
    globalThis.MF_EMFRuntime = {
        FrameContext,
        buildFrameState,
        evaluate,
        applyWrites,
        buildPose,
        resolveNode,
        ENV,
        PART_MAP,
        setLog,
        dump: dumpLog,
        clearLog,
        pushLog
    };
})();
