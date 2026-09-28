
(function () {
    'use strict';

    const TRUE = Infinity;
    const FALSE = -Infinity;
    const fromBool = (b) => (b ? TRUE : FALSE);
    class FrameContext {
        constructor(entityId) {
            this.entityId = entityId;
            this.vars = Object.create(null);
            this.bools = Object.create(null);
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
    const PART_MAP = {
        root: 'skeleton',
        body: 'body',
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
    const REST_MC = {
        root: [0, 0, 0], body: [0, 0, 0], head: [0, 0, 0],
        right_arm: [-5, 2, 0], left_arm: [5, 2, 0],
        right_leg: [-2, 12, 0], left_leg: [2, 12, 0]
    };

    function makePartStore(mesh) {
        const store = Object.create(null);
        for (const part of Object.keys(PART_MAP)) {
            const node = mesh[PART_MAP[part]];
            const rest = REST_MC[part] || [0, 0, 0];
            let srx = node ? node.rotation.x : 0;
            let sry = node ? node.rotation.y : 0;
            let srz = node ? node.rotation.z : 0;
            if (part === 'body') {
                srx = 0; sry = 0; srz = 0;
            }
            const s = {
                rx: srx, ry: sry, rz: srz,
                tx: rest[0], ty: rest[1], tz: rest[2],
                sx: 1, sy: 1, sz: 1
            };
            if (part === 'head') {
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
        fluid_depth: (s) => (s.inWater ? 2 : 0),
        is_crawling: (s) => fromBool(s.crawling),
        is_in_gui: () => FALSE,
        is_paused: () => FALSE,
        frame_counter: (s) => s.frameCounter,
        rule_index: () => 0,
        fluid_depth_up: (s) => s.fluidDepthUp,
        id: (s) => s.entityId
    };
    const s_prevPos = new WeakMap();
    const state_prevMove = new WeakMap();
    const s_flyY = new WeakMap();
    const s_renderYaw = new WeakMap();

    function buildFrameState(mesh, game, localEnt) {
        let ent = mesh.entity;
        if (!ent) return null;
        if (!(ent.ticksExisted > 0)) {
            const worldEnt = game?.world?.entities?.get?.(ent.id);
            if (worldEnt && (worldEnt.ticksExisted > 0)) ent = worldEnt;
            else if (localEnt && localEnt.id === ent.id) ent = localEnt;
        }

        const partial = safeCall(() => ent.getPartialTicks(), 0) || 0;
        const lsa = ent.limbSwingAmount || 0;
        const plsa = ent.prevLimbSwingAmount ?? lsa;
        let limbSpeed = lsa * partial + plsa * (1 - partial);
        if (limbSpeed > 1) limbSpeed = 1;
        if (limbSpeed < 0) limbSpeed = 0;
        if (ent.sneak && limbSpeed > 0.5) limbSpeed = 0.5;
        const ls = (ent.limbSwing || 0) - lsa * (1 - partial);
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
            const yawRad = ent.yaw || 0;
            const fwd = dx * Math.sin(yawRad) + dz * Math.cos(yawRad);
            const strafe = dx * Math.cos(yawRad) - dz * Math.sin(yawRad);
            moveForward = clampN((fwd / (1 / 20)) / 4.3, -1, 1);
            moveStrafe = clampN((strafe / (1 / 20)) / 4.3, -1, 1);
            prevMoveRec.fwd = moveForward; prevMoveRec.strafe = moveStrafe; prevMoveRec.dy = dy;
            prevMoveRec.tick = curTick;
        }
        s_prevPos.set(mesh, [ent.pos.x, ent.pos.y, ent.pos.z, curTick]);
        state_prevMove.set(mesh, prevMoveRec);
        const pp = ent.prevPos;
        let ipx = pp ? pp.x + (ent.pos.x - pp.x) * partial : ent.pos.x;
        let ipy = pp ? pp.y + (ent.pos.y - pp.y) * partial : ent.pos.y;
        let ipz = pp ? pp.z + (ent.pos.z - pp.z) * partial : ent.pos.z;

        const sprinting = safeCall(() => ent.isSprinting(), false)
            || !!(localEnt && localEnt.id === ent.id && localEnt.isSprinting && safeCall(() => localEnt.isSprinting(), false));
        const gliding = safeCall(() => ent.isElytraFlying(), false);
        const inWater = !!ent.inWater;
        const flying = !!(localEnt && localEnt.id === ent.id && localEnt.abilities?.flying);
        if (flying) {
            const lastY = s_flyY.get(mesh);
            ipy = typeof lastY === 'number' ? lastY : ipy;
        }
        s_flyY.set(mesh, ipy);
        let onGround = !!ent.onGround;
        if (!onGround && localEnt && localEnt.id === ent.id && localEnt.currentInput) {
            onGround = !!localEnt.currentInput.onGround;
        }
        const burning = safeCall(() => ent.isBurning(), false);
        const climbing = !onGround && inWater === false && safeCall(() => ent.isOnLadder(), false);
        let bodyYawDeg = 0;
        try {
            const bq = mesh.body?.quaternion;
            if (bq) {
                const bodyYaw = Math.atan2(2 * (bq.w * bq.y + bq.x * bq.z), 1 - 2 * (bq.y * bq.y + bq.x * bq.x));
                bodyYawDeg = wrapdeg180(bodyYaw * 180 / Math.PI);
            }
        } catch {}
        let lookPitchDeg = -(ent.pitch || 0) * 180 / Math.PI;
        let lookYawDeg = wrapdeg180((ent.yaw || 0) * 180 / Math.PI - bodyYawDeg);
        try {
            const hp = mesh.headPivot, nk = mesh.neck;
            if (hp) lookPitchDeg = -hp.rotation.x * 180 / Math.PI;
            if (nk) lookYawDeg = wrapdeg180(nk.rotation.y * 180 / Math.PI - bodyYawDeg);
        } catch {}
        const neckYawAbs = wrapdeg180(bodyYawDeg + lookYawDeg);
        let renderYawDeg = s_renderYaw.get(mesh);
        if (renderYawDeg === undefined) renderYawDeg = neckYawAbs;
        const dragK = 1 - Math.pow(0.7, Math.max(0.001, game?.delta || 0.05) * 20);
        renderYawDeg = wrapdeg180(renderYawDeg + wrapdeg180(neckYawAbs - renderYawDeg) * dragK);
        s_renderYaw.set(mesh, renderYawDeg);
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
            frameCounter: 0,
            entityId: ent.id ?? 0
        };
    }
    function evaluate(lines, ctx, state, writes) {
        if (!ctx.prerolled) {
            ctx.prerolled = true;
            const warm = {
                ...state,
                moveForward: 0, moveStrafe: 0, limbSwing: state.limbSwing || 0,
                limbSpeed: 0, isSprinting: false
            };
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
                    writes.push({ part: line.target, channel: line.channel, value });
                    ((partStore[line.target] ??= Object.create(null)))[line.channel] = value;
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

    function buildPose(writes, opts) {
        const skipArms = !!(opts && opts.skipArms);
        const poses = Object.create(null);
        for (let i = 0; i < writes.length; i++) {
            const w = writes[i];
            if (skipArms && (w.part === 'right_arm' || w.part === 'left_arm')) continue;
            if (!PART_MAP[w.part]) continue;
            if (w.part === 'root' && w.channel === 'ry') continue;
            if (w.part === 'root' && w.channel[0] === 't') continue;
            const p = (poses[w.part] ??= {});
            p[w.channel] = w.value;
        }
        for (const ch of ['rx', 'ry', 'rz']) {
            const h = poses.head;
            if (h && h[ch] !== undefined) h[ch] = -h[ch];
        }
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
    function wrapdeg180(d) { let x = (d + 180) % 360; if (x < 0) x += 360; return x - 180; }
    function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function safeCall(fn, def) { try { return fn(); } catch { return def; } }
    const LOG = {
        enabled: false,
        list: [],
        unknownEnv: new Set(),
        evalCalls: 0,
        maxEntries: 500
    };

    function pushLog(entry) {
        if (LOG.list.length >= LOG.maxEntries) return;
        LOG.list.push(entry);
    }
    function setLog(enabled) {
        LOG.enabled = enabled === true;
        console.log('minifeather emfruntime logging ' + (LOG.enabled ? 'ON' : 'OFF'));
        return LOG.enabled;
    }
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
        console.log('minifeather emfruntime dump:', summary);
        return summary;
    }

    function clearLog() {
        LOG.list.length = 0;
        LOG.unknownEnv.clear();
        LOG.evalCalls = 0;
        console.log('minifeather emfruntime logs cleared');
    }
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
