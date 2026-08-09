(function () {
'use strict';

const EVENT_CONFIG = 'minifeather:cameraoverhaul-config';
const EVENT_STATE = 'minifeather:cameraoverhaul-state';
const EVENT_BINDING = 'minifeather:cameraoverhaul-binding';

const PRESETS = Object.freeze({
    soft: Object.freeze({
        masterStrength: 0.55,
        strafeRoll: 0.034,
        turnRoll: 0.021,
        forwardPitch: 0.014,
        verticalPitch: 0.017,
        bobStrength: 0.013,
        bobFrequency: 7.2,
        landingStrength: 0.024,
        swayStrength: 0.0010,
        fovBoost: 1.8,
        mouseStrength: 0.00009
    }),
    normal: Object.freeze({
        masterStrength: 1.00,
        strafeRoll: 0.055,
        turnRoll: 0.035,
        forwardPitch: 0.022,
        verticalPitch: 0.028,
        bobStrength: 0.022,
        bobFrequency: 8.2,
        landingStrength: 0.040,
        swayStrength: 0.0018,
        fovBoost: 3.5,
        mouseStrength: 0.00016
    }),
    strong: Object.freeze({
        masterStrength: 1.45,
        strafeRoll: 0.068,
        turnRoll: 0.046,
        forwardPitch: 0.030,
        verticalPitch: 0.037,
        bobStrength: 0.030,
        bobFrequency: 9.4,
        landingStrength: 0.055,
        swayStrength: 0.0026,
        fovBoost: 5.2,
        mouseStrength: 0.00022
    })
});

const LIMITS = Object.freeze({
    masterStrength: Object.freeze([0.25, 2.00]),
    strafeRoll: Object.freeze([0, 0.10]),
    turnRoll: Object.freeze([0, 0.08]),
    forwardPitch: Object.freeze([0, 0.06]),
    verticalPitch: Object.freeze([0, 0.07]),
    bobStrength: Object.freeze([0, 0.05]),
    bobFrequency: Object.freeze([4, 14]),
    landingStrength: Object.freeze([0, 0.08]),
    swayStrength: Object.freeze([0, 0.005]),
    fovBoost: Object.freeze([0, 7]),
    mouseStrength: Object.freeze([0, 0.00035])
});

const state = {
    enabled: false,
    bind: '',
    preset: 'normal',
    values: null,
    bindingCaptureActive: false,
    game: null,
    player: null,
    camera: null,
    pitchObject: null,
    yawObject: null,
    lastGameScan: 0,
    lastCameraScan: 0,
    lastFrame: performance.now(),
    viewHook: null,
    viewHookDepth: 0,
    projectionHook: null,
    projectionHookDepth: 0,
    previousYaw: null,
    previousSpeed: 0,
    previousMotionY: 0,
    wasGrounded: false,
    bobPhase: 0,
    idleTime: 0,
    mouseDX: 0,
    mouseDY: 0,
    projectionDirty: false,
    channels: {},
    effect: {
        x: 0,
        y: 0,
        z: 0,
        roll: 0,
        pitch: 0,
        yaw: 0,
        fov: 0
    }
};

const CHANNEL_NAMES = [
    'strafeRoll',
    'turnRoll',
    'movePitch',
    'verticalPitch',
    'bobBlend',
    'landingY',
    'landingPitch',
    'idleBlend',
    'mouseRoll',
    'mousePitch',
    'forwardShift',
    'fov',
    'yawRateInput',
    'accelerationInput'
];

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function smooth01(value) {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
}

function normalizeAngle(value) {
    let angle = value;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

function cloneValues(source) {
    const out = {};
    const fallback = PRESETS.normal;
    for (const key of Object.keys(LIMITS)) {
        out[key] = Number(source?.[key] ?? fallback[key]);
    }
    return out;
}

function normalizeValues(source) {
    const out = cloneValues(PRESETS.normal);
    if (!source || typeof source !== 'object') return out;

    for (const [key, range] of Object.entries(LIMITS)) {
        const value = Number(source[key]);
        if (Number.isFinite(value)) out[key] = clamp(value, range[0], range[1]);
    }

    return out;
}

function detectPreset(values) {
    const current = normalizeValues(values);

    for (const [name, preset] of Object.entries(PRESETS)) {
        const same = Object.keys(LIMITS).every(key => {
            const scale = Math.max(1, Math.abs(Number(preset[key])));
            return Math.abs(Number(current[key]) - Number(preset[key])) <= scale * 0.000001;
        });

        if (same) return name;
    }

    return 'custom';
}

state.values = cloneValues(PRESETS.normal);

for (const name of CHANNEL_NAMES) {
    state.channels[name] = { value: 0, velocity: 0 };
}

const noise = (() => {
    const gradients = [
        [1,1],[-1,1],[1,-1],[-1,-1],
        [1,0],[-1,0],[0,1],[0,-1]
    ];
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let seed = 0x6d2b79f5;

    const rand = () => {
        seed += 0x6d2b79f5;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const temp = p[i];
        p[i] = p[j];
        p[j] = temp;
    }

    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (hash, x, y) => {
        const g = gradients[hash & 7];
        return g[0] * x + g[1] * y;
    };

    return function sample(x, y) {
        const xi = Math.floor(x) & 255;
        const yi = Math.floor(y) & 255;
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        const u = fade(xf);
        const v = fade(yf);
        const aa = perm[perm[xi] + yi];
        const ab = perm[perm[xi] + yi + 1];
        const ba = perm[perm[xi + 1] + yi];
        const bb = perm[perm[xi + 1] + yi + 1];
        const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
        const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
        return x1 + v * (x2 - x1);
    };
})();

function spring(channel, target, frequency, damping, dt) {
    const f = Math.max(0.01, Number(frequency) || 1);
    const d = clamp(Number(damping) || 1, 0.45, 1.5);
    const step = clamp(dt, 0.001, 0.05);
    const omega = Math.PI * 2 * f * (0.82 + d * 0.18);
    const x = omega * step;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = channel.value - target;
    const temp = (channel.velocity + omega * change) * step;
    channel.velocity = (channel.velocity - omega * temp) * decay;
    channel.value = target + (change + temp) * decay;

    if (!Number.isFinite(channel.value) || !Number.isFinite(channel.velocity)) {
        channel.value = Number.isFinite(Number(target)) ? Number(target) : 0;
        channel.velocity = 0;
    }

    if (Math.abs(channel.value) < 0.0000001 && Math.abs(channel.velocity) < 0.0000001 && Math.abs(target) < 0.0000001) {
        channel.value = 0;
        channel.velocity = 0;
    }

    return channel.value;
}

function impulse(channel, value, velocity = 0) {
    channel.value += Number(value) || 0;
    channel.velocity += Number(velocity) || 0;
}

function findGameFromFiber(element) {
    if (!element) return null;
    const key = Object.keys(element).find(name =>
        name.startsWith('__reactFiber$') ||
        name.startsWith('__reactInternalInstance$') ||
        name.startsWith('__reactContainer$')
    );
    if (!key) return null;

    let fiber = element[key];
    let depth = 0;

    while (fiber && depth < 120) {
        const stateNode = fiber.stateNode;
        const props = fiber.memoizedProps;

        if (stateNode?.player && (stateNode.gameScene || stateNode.player?.game)) return stateNode;
        if (stateNode?.game?.player) return stateNode.game;
        if (props?.game?.player) return props.game;

        if (props && typeof props === 'object') {
            for (const value of Object.values(props)) {
                if (value?.player && (value.gameScene || value.player?.game)) return value;
            }
        }

        fiber = fiber.return;
        depth++;
    }

    return null;
}

function getGame(force = false) {
    const now = performance.now();

    if (window.miniblox?.player) {
        state.game = window.miniblox;
        state.player = window.miniblox.player;
        return state.game;
    }

    if (!force && state.game?.player && now - state.lastGameScan < 1000) {
        return state.game;
    }

    state.lastGameScan = now;

    let game = null;

    try {
        const react = document.querySelector('#react');
        if (react) {
            for (const root of Object.values(react)) {
                const candidate = root?.updateQueue?.baseState?.element?.props?.game;
                if (candidate?.player) {
                    game = candidate;
                    break;
                }
            }
        }
    } catch (_) {}

    if (!game) {
        try {
            const candidates = [
                document.getElementById('root'),
                document.querySelector('canvas'),
                document.body
            ];

            for (const element of candidates) {
                game = findGameFromFiber(element);
                if (game) break;
            }
        } catch (_) {}
    }

    if (game?.player) {
        window.miniblox = game;
        state.game = game;
        state.player = game.player;
        return game;
    }

    return state.game?.player ? state.game : null;
}

function validCamera(camera) {
    return !!(
        camera &&
        camera.position &&
        Number.isFinite(Number(camera.position.x)) &&
        Number.isFinite(Number(camera.position.y)) &&
        Number.isFinite(Number(camera.position.z)) &&
        (camera.rotation || camera.quaternion)
    );
}

function resolveCamera(force = false) {
    const game = getGame(force);
    if (!game) return null;

    const now = performance.now();

    if (!force && validCamera(state.camera) && now - state.lastCameraScan < 1000) {
        return state.camera;
    }

    state.lastCameraScan = now;

    const camera =
        game?.gameScene?.camera ||
        game?.player?.game?.gameScene?.camera ||
        game?.scene?.camera ||
        game?.controls?.camera ||
        game?.controller?.camera ||
        game?.camera ||
        null;

    if (!validCamera(camera)) return state.camera;

    if (state.camera !== camera) {
        state.camera = camera;
        state.pitchObject = camera.parent || null;
        state.yawObject = camera.parent?.parent || null;
        state.previousYaw = null;
        installViewHooks(camera);
        installProjectionHook(camera);
        state.projectionDirty = true;
    } else {
        state.pitchObject = camera.parent || state.pitchObject;
        state.yawObject = camera.parent?.parent || state.yawObject;
    }

    return camera;
}

function applyViewEffect(camera, original, thisArg, args) {
    if (
        !state.enabled ||
        state.camera !== camera ||
        state.viewHookDepth > 0 ||
        !document.pointerLockElement
    ) {
        return original.apply(thisArg, args);
    }

    const position = camera.position;
    const rotation = camera.rotation;
    const effect = state.effect;

    if (!position || !rotation) return original.apply(thisArg, args);

    state.viewHookDepth++;

    const px = Number(position.x);
    const py = Number(position.y);
    const pz = Number(position.z);
    const rx = Number(rotation.x);
    const ry = Number(rotation.y);
    const rz = Number(rotation.z);

    try {
        position.x = px + effect.x;
        position.y = py + effect.y;
        position.z = pz + effect.z;
        rotation.x = rx + effect.pitch;
        rotation.y = ry + effect.yaw;
        rotation.z = rz + effect.roll;
        return original.apply(thisArg, args);
    } finally {
        try {
            position.x = px;
            position.y = py;
            position.z = pz;
            rotation.x = rx;
            rotation.y = ry;
            rotation.z = rz;
        } catch (_) {}
        state.viewHookDepth--;
    }
}

function installViewHooks(camera) {
    if (state.viewHook?.camera === camera) return;

    const hook = {
        camera,
        updateMatrixWorldOriginal: typeof camera.updateMatrixWorld === 'function' ? camera.updateMatrixWorld : null,
        updateWorldMatrixOriginal: typeof camera.updateWorldMatrix === 'function' ? camera.updateWorldMatrix : null,
        updateMatrixWorld: null,
        updateWorldMatrix: null
    };

    if (hook.updateMatrixWorldOriginal) {
        hook.updateMatrixWorld = function (...args) {
            return applyViewEffect(camera, hook.updateMatrixWorldOriginal, this, args);
        };
        try {
            camera.updateMatrixWorld = hook.updateMatrixWorld;
        } catch (_) {}
    }

    if (hook.updateWorldMatrixOriginal) {
        hook.updateWorldMatrix = function (...args) {
            return applyViewEffect(camera, hook.updateWorldMatrixOriginal, this, args);
        };
        try {
            camera.updateWorldMatrix = hook.updateWorldMatrix;
        } catch (_) {}
    }

    state.viewHook = hook;
}

function installProjectionHook(camera) {
    if (state.projectionHook?.camera === camera) return;
    if (typeof camera.updateProjectionMatrix !== 'function') return;

    const original = camera.updateProjectionMatrix;
    const hook = function (...args) {
        if (
            !state.enabled ||
            state.camera !== camera ||
            state.projectionHookDepth > 0 ||
            !Number.isFinite(Number(camera.fov)) ||
            Math.abs(state.effect.fov) < 0.000001
        ) {
            return original.apply(this, args);
        }

        state.projectionHookDepth++;
        const fov = Number(camera.fov);

        try {
            camera.fov = clamp(fov + state.effect.fov, 20, 140);
            return original.apply(this, args);
        } finally {
            camera.fov = fov;
            state.projectionHookDepth--;
        }
    };

    try {
        camera.updateProjectionMatrix = hook;
        state.projectionHook = { camera, original, hook };
    } catch (_) {}
}

function motionData(player) {
    const source = player?.motion || player?.velocity || player?.vel || {};
    const x = Number(source.x);
    const y = Number(source.y);
    const z = Number(source.z);

    return {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
        z: Number.isFinite(z) ? z : 0
    };
}

function relativeMotion(player, motion) {
    let yaw = Number(player?.yaw);

    if (!Number.isFinite(yaw)) {
        yaw = Number(state.yawObject?.rotation?.y);
    }

    if (!Number.isFinite(yaw)) return { forward: 0, strafe: 0 };

    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);

    return {
        forward: -sin * motion.x + cos * motion.z,
        strafe: cos * motion.x + sin * motion.z
    };
}

function perspectiveFactors(player) {
    const perspective = Number(player?.perspective);
    const firstPerson = !Number.isFinite(perspective) || perspective === 0;

    return firstPerson
        ? { position: 1, rotation: 1, fov: 1 }
        : { position: 0.48, rotation: 0.78, fov: 0.82 };
}

function clearChannels() {
    for (const channel of Object.values(state.channels)) {
        channel.value = 0;
        channel.velocity = 0;
    }

    state.effect.x = 0;
    state.effect.y = 0;
    state.effect.z = 0;
    state.effect.roll = 0;
    state.effect.pitch = 0;
    state.effect.yaw = 0;
    state.effect.fov = 0;
    state.previousYaw = null;
    state.previousSpeed = 0;
    state.previousMotionY = 0;
    state.wasGrounded = false;
    state.bobPhase = 0;
    state.idleTime = 0;
    state.mouseDX = 0;
    state.mouseDY = 0;
    state.projectionDirty = true;
}

function updateEffects(timestamp, dt) {
    const camera = resolveCamera();
    const game = state.game;
    const player = game?.player;

    if (!camera || !player) return;

    if (!document.pointerLockElement) {
        if (
            Math.abs(state.effect.x) +
            Math.abs(state.effect.y) +
            Math.abs(state.effect.z) +
            Math.abs(state.effect.roll) +
            Math.abs(state.effect.pitch) +
            Math.abs(state.effect.yaw) +
            Math.abs(state.effect.fov) > 0.000001
        ) {
            clearChannels();
        }
        return;
    }

    const config = state.values;
    const strength = clamp(Number(config.masterStrength) || 1, LIMITS.masterStrength[0], LIMITS.masterStrength[1]);
    const factors = perspectiveFactors(player);
    const motion = motionData(player);
    const relative = relativeMotion(player, motion);
    const speed = Math.hypot(motion.x, motion.z);
    const grounded = player.onGround === true || player.grounded === true || player.isGrounded === true;
    const speedFactor = smooth01(clamp((speed - 0.012) / 0.34, 0, 1));
    const sprintFactor = smooth01(clamp((speed - 0.12) / 0.38, 0, 1));
    const strafe = clamp(relative.strafe / 0.34, -1, 1);
    const forward = clamp(relative.forward / 0.34, -1, 1);
    const vertical = clamp(motion.y / 0.55, -1, 1);

    const yaw = Number(state.yawObject?.rotation?.y);
    let rawYawRate = 0;

    if (Number.isFinite(yaw)) {
        if (state.previousYaw !== null) {
            rawYawRate = clamp(normalizeAngle(yaw - state.previousYaw) / Math.max(dt, 0.001), -7, 7);
        }
        state.previousYaw = yaw;
    }

    const yawRate = spring(state.channels.yawRateInput, rawYawRate, 3.6, 1.0, dt);
    const rawAcceleration = clamp((speed - state.previousSpeed) / Math.max(dt, 0.001), -2.2, 2.2);
    const acceleration = spring(state.channels.accelerationInput, rawAcceleration, 3.0, 1.0, dt);
    state.previousSpeed = speed;

    spring(
        state.channels.strafeRoll,
        -strafe * config.strafeRoll * strength,
        3.8,
        1.0,
        dt
    );

    spring(
        state.channels.turnRoll,
        clamp(-yawRate * config.turnRoll * 0.20 * strength, -0.060, 0.060),
        4.2,
        1.0,
        dt
    );

    spring(
        state.channels.movePitch,
        -forward * speedFactor * config.forwardPitch * strength,
        3.3,
        1.0,
        dt
    );

    spring(
        state.channels.verticalPitch,
        -vertical * config.verticalPitch * strength,
        3.5,
        1.0,
        dt
    );

    spring(
        state.channels.forwardShift,
        clamp(-acceleration * 0.0024 * strength, -0.012, 0.012),
        3.1,
        1.0,
        dt
    );

    spring(
        state.channels.bobBlend,
        grounded ? speedFactor : 0,
        grounded ? 3.1 : 4.6,
        1.0,
        dt
    );

    if (grounded && state.channels.bobBlend.value > 0.001) {
        state.bobPhase += config.bobFrequency * (0.35 + speedFactor * 0.90) * dt;
    }

    const bobBlend = clamp(state.channels.bobBlend.value, 0, 1.25);
    const bobAmp = config.bobStrength * strength * bobBlend * 0.78;
    const bobX = Math.sin(state.bobPhase) * bobAmp * 0.34;
    const bobY = Math.cos(state.bobPhase * 2) * bobAmp * 0.24;
    const bobRoll = Math.sin(state.bobPhase) * bobAmp * 0.15;

    if (
        grounded &&
        !state.wasGrounded &&
        state.previousMotionY < -0.20
    ) {
        const impact = smooth01(clamp((Math.abs(state.previousMotionY) - 0.20) / 0.55, 0, 1));
        impulse(state.channels.landingY, -config.landingStrength * impact * strength * 0.58, 0);
        impulse(state.channels.landingPitch, config.landingStrength * 0.30 * impact * strength, 0);
    }

    spring(state.channels.landingY, 0, 3.7, 1.0, dt);
    spring(state.channels.landingPitch, 0, 3.9, 1.0, dt);

    state.wasGrounded = grounded;
    state.previousMotionY = motion.y;

    const idle = speed < 0.018 && Math.abs(motion.y) < 0.018;
    state.idleTime = idle ? state.idleTime + dt : 0;

    spring(
        state.channels.idleBlend,
        state.idleTime > 0.55 ? 1 : 0,
        state.idleTime > 0.55 ? 0.55 : 2.4,
        1.0,
        dt
    );

    const idleBlend = clamp(state.channels.idleBlend.value, 0, 1);
    const time = timestamp / 1000;
    const swayBase = config.swayStrength * strength * idleBlend;
    const swayX = Math.sin(time * 0.72) * swayBase * 0.28;
    const swayY = Math.sin(time * 1.05 + 0.8) * swayBase * 0.16;
    const swayPitch = Math.sin(time * 0.66 + 1.7) * swayBase * 0.32;
    const swayYaw = Math.sin(time * 0.52 + 2.4) * swayBase * 0.20;

    const mouseDX = state.mouseDX;
    const mouseDY = state.mouseDY;
    state.mouseDX = 0;
    state.mouseDY = 0;

    spring(
        state.channels.mouseRoll,
        clamp(-mouseDX * config.mouseStrength * strength * 0.55, -0.024, 0.024),
        4.8,
        1.0,
        dt
    );

    spring(
        state.channels.mousePitch,
        clamp(-mouseDY * config.mouseStrength * 0.16 * strength, -0.010, 0.010),
        4.6,
        1.0,
        dt
    );

    const fovTarget = config.fovBoost * sprintFactor * strength * factors.fov;
    spring(state.channels.fov, fovTarget, 2.4, 1.0, dt);

    const roll = clamp(
        (
            state.channels.strafeRoll.value +
            state.channels.turnRoll.value +
            state.channels.mouseRoll.value +
            bobRoll
        ) * factors.rotation,
        -0.075,
        0.075
    );

    const pitch = clamp(
        (
            state.channels.movePitch.value +
            state.channels.verticalPitch.value +
            state.channels.landingPitch.value +
            state.channels.mousePitch.value +
            swayPitch
        ) * factors.rotation,
        -0.055,
        0.055
    );

    const positionScale = factors.position;

    state.effect.x = (bobX + swayX) * positionScale;
    state.effect.y = (bobY + state.channels.landingY.value + swayY) * positionScale;
    state.effect.z = state.channels.forwardShift.value * positionScale;
    state.effect.roll = roll;
    state.effect.pitch = pitch;
    state.effect.yaw = swayYaw * factors.rotation;

    const previousFov = state.effect.fov;
    state.effect.fov = clamp(state.channels.fov.value, 0, 12);

    if (Math.abs(previousFov - state.effect.fov) > 0.001) {
        state.projectionDirty = true;
    }

    if (state.projectionDirty && typeof camera.updateProjectionMatrix === 'function') {
        state.projectionDirty = false;
        try {
            camera.updateProjectionMatrix();
        } catch (_) {}
    }
}

function resetEffects() {
    clearChannels();
    const camera = state.camera;
    if (camera && typeof camera.updateProjectionMatrix === 'function') {
        try {
            camera.updateProjectionMatrix();
        } catch (_) {}
    }
}

function normalizeBind(value) {
    const bind = String(value || '').trim();
    return bind === 'None' ? '' : bind;
}

function emitState(reason = 'state') {
    try {
        document.dispatchEvent(new CustomEvent(EVENT_STATE, {
            detail: JSON.stringify({
                enabled: !!state.enabled,
                bind: state.bind,
                preset: state.preset,
                values: cloneValues(state.values),
                reason
            })
        }));
    } catch (_) {}
}

function setEnabled(enabled, notify = false) {
    const next = !!enabled;

    if (state.enabled === next) {
        if (notify) emitState('enabled');
        return;
    }

    state.enabled = next;
    state.lastFrame = performance.now();

    if (next) {
        resolveCamera(true);
        clearChannels();
    } else {
        resetEffects();
    }

    if (notify) emitState('enabled');
}

function setValues(values, notify = false) {
    state.values = normalizeValues(values);
    state.preset = detectPreset(state.values);
    clearChannels();
    if (notify) emitState('values');
}

function setPreset(name, notify = false) {
    if (!PRESETS[name]) return;
    state.values = cloneValues(PRESETS[name]);
    state.preset = name;
    clearChannels();
    if (notify) emitState('preset');
}

function applyConfig(detail) {
    let config = detail;

    if (typeof config === 'string') {
        try {
            config = JSON.parse(config);
        } catch (_) {
            return;
        }
    }

    if (!config || typeof config !== 'object') return;

    if ('bind' in config) state.bind = normalizeBind(config.bind);

    if (config.values && typeof config.values === 'object') {
        state.values = normalizeValues(config.values);
        state.preset = detectPreset(state.values);
    } else if (PRESETS[config.preset]) {
        state.values = cloneValues(PRESETS[config.preset]);
        state.preset = config.preset;
    }

    if ('enabled' in config) setEnabled(!!config.enabled, false);
}

document.addEventListener(EVENT_CONFIG, event => {
    applyConfig(event.detail);
}, true);

document.addEventListener(EVENT_BINDING, event => {
    let value = event.detail;

    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        } catch (_) {}
    }

    state.bindingCaptureActive = value === true || value?.active === true;
}, true);

window.addEventListener('mousemove', event => {
    if (!state.enabled || !document.pointerLockElement) return;

    state.mouseDX = clamp(state.mouseDX + Number(event.movementX || 0), -80, 80);
    state.mouseDY = clamp(state.mouseDY + Number(event.movementY || 0), -80, 80);
}, true);

window.addEventListener('keydown', event => {
    if (
        state.bindingCaptureActive ||
        event.repeat ||
        !state.bind ||
        event.code !== state.bind
    ) {
        return;
    }

    const target = event.target;
    const tag = String(target?.tagName || '').toLowerCase();

    if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable
    ) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    setEnabled(!state.enabled, true);
}, true);

document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement) {
        clearChannels();
        if (state.camera && typeof state.camera.updateProjectionMatrix === 'function') {
            try {
                state.camera.updateProjectionMatrix();
            } catch (_) {}
        }
    }
}, true);

function loop(timestamp) {
    const dt = clamp((timestamp - state.lastFrame) / 1000, 0.001, 0.05);
    state.lastFrame = timestamp;

    if (state.enabled) {
        updateEffects(timestamp, dt);
    }

    requestAnimationFrame(loop);
}

globalThis.CameraOverhaul = {
    enable() {
        setEnabled(true, true);
    },
    disable() {
        setEnabled(false, true);
    },
    toggle() {
        setEnabled(!state.enabled, true);
    },
    setBind(value) {
        state.bind = normalizeBind(value);
        emitState('bind');
        return state.bind;
    },
    setPreset(name) {
        setPreset(String(name || '').toLowerCase(), true);
        return state.preset;
    },
    setValues(values) {
        setValues(values, true);
        return cloneValues(state.values);
    },
    get enabled() {
        return state.enabled;
    },
    get bind() {
        return state.bind;
    },
    get preset() {
        return state.preset;
    },
    get values() {
        return cloneValues(state.values);
    },
    get camera() {
        return state.camera;
    },
    get rig() {
        return {
            pitchObject: state.pitchObject,
            yawObject: state.yawObject
        };
    },
    get effect() {
        return { ...state.effect };
    },
    get presets() {
        return {
            soft: cloneValues(PRESETS.soft),
            normal: cloneValues(PRESETS.normal),
            strong: cloneValues(PRESETS.strong)
        };
    }
};

requestAnimationFrame(loop);
})();
