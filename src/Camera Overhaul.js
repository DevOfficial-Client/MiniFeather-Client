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

const FIXED = Object.freeze({
    strafeRollResponse: 0.82,
    turnRollResponse: 0.84,
    turnRollLimit: 0.060,
    forwardPitchResponse: 0.88,
    verticalPitchResponse: 0.86,
    bobResponse: 0.78,
    landingThreshold: 0.20,
    landingRecovery: 0.87,
    swayFrequency: 0.18,
    swayIdleDelay: 0.65,
    swayFadeIn: 2.6,
    swayFadeOut: 0.90,
    fovStartSpeed: 0.12,
    fovFullSpeed: 0.50,
    fovResponse: 0.88,
    mouseResponse: 0.88,
    mouseRecovery: 0.82,
    maxRoll: 0.080,
    maxPitchOffset: 0.055
});

const state = {
    enabled: false,
    bind: '',
    preset: 'normal',
    values: cloneValues(PRESETS.normal),
    bindingCaptureActive: false,
    game: null,
    camera: null,
    cameraPath: null,
    lastGameScan: 0,
    lastCameraScan: 0,
    lastFrame: performance.now(),
    baseFov: null,
    previousBaseYaw: null,
    previousMotionY: 0,
    wasGrounded: false,
    strafeRoll: 0,
    turnRoll: 0,
    forwardPitch: 0,
    verticalPitch: 0,
    bobPhase: 0,
    bobX: 0,
    bobY: 0,
    bobRoll: 0,
    landingY: 0,
    landingPitch: 0,
    swayFactor: 0,
    lastActionTime: 0,
    mouseDX: 0,
    mouseDY: 0,
    mouseRoll: 0,
    mousePitch: 0,
    fovDelta: 0,
    appliedX: 0,
    appliedY: 0,
    appliedZ: 0,
    appliedRoll: 0,
    appliedPitch: 0,
    appliedYaw: 0,
    appliedFov: 0
};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

function damp(current, target, smoothing, dt) {
    return lerp(
        current,
        target,
        1 - Math.pow(clamp(smoothing, 0.0001, 0.9999), dt)
    );
}

function smooth01(value) {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
}

function cloneValues(source) {
    const out = {};
    for (const key of Object.keys(LIMITS)) {
        out[key] = Number(source?.[key] ?? PRESETS.normal[key]);
    }
    return out;
}

function normalizeValues(source) {
    const out = cloneValues(PRESETS.normal);
    if (!source || typeof source !== 'object') return out;

    for (const [key, range] of Object.entries(LIMITS)) {
        const value = Number(source[key]);
        if (!Number.isFinite(value)) continue;
        out[key] = clamp(value, range[0], range[1]);
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

const noise = (() => {
    const grad3 = [
        [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
        [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
        [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
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

    function dot(g, x, y) {
        return g[0] * x + g[1] * y;
    }

    return function sample(x, y) {
        const F2 = 0.5 * (Math.sqrt(3) - 1);
        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const G2 = (3 - Math.sqrt(3)) / 6;
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        const i1 = x0 > y0 ? 1 : 0;
        const j1 = x0 > y0 ? 0 : 1;
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;
        const ii = i & 255;
        const jj = j & 255;
        const gi0 = perm[ii + perm[jj]] % 12;
        const gi1 = perm[ii + i1 + perm[jj + j1]] % 12;
        const gi2 = perm[ii + 1 + perm[jj + 1]] % 12;

        let n0 = 0;
        let n1 = 0;
        let n2 = 0;

        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) {
            t0 *= t0;
            n0 = t0 * t0 * dot(grad3[gi0], x0, y0);
        }

        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) {
            t1 *= t1;
            n1 = t1 * t1 * dot(grad3[gi1], x1, y1);
        }

        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) {
            t2 *= t2;
            n2 = t2 * t2 * dot(grad3[gi2], x2, y2);
        }

        return 70 * (n0 + n1 + n2);
    };
})();

function getGame(force = false) {
    const now = performance.now();

    if (!force && state.game?.player && now - state.lastGameScan < 1200) {
        return state.game;
    }

    state.lastGameScan = now;

    try {
        const react = document.querySelector('#react');
        if (!react) return state.game?.player ? state.game : null;

        for (const root of Object.values(react)) {
            const game = root?.updateQueue?.baseState?.element?.props?.game;

            if (game?.player) {
                if (state.game !== game) {
                    resetEffects();
                    state.game = game;
                    state.camera = null;
                    state.cameraPath = null;
                    state.baseFov = null;
                    state.previousBaseYaw = null;
                }

                return game;
            }
        }
    } catch (_) {}

    return state.game?.player ? state.game : null;
}

function validPosition(value) {
    return !!(
        value &&
        Number.isFinite(Number(value.x)) &&
        Number.isFinite(Number(value.y)) &&
        Number.isFinite(Number(value.z))
    );
}

function looksLikeCamera(value) {
    if (
        !value ||
        (typeof value !== 'object' && typeof value !== 'function') ||
        !validPosition(value.position)
    ) {
        return false;
    }

    let score = 0;
    if (value.isCamera === true) score += 100;
    if (Number.isFinite(Number(value.fov))) score += 30;
    if (value.projectionMatrix) score += 30;
    if (value.matrixWorldInverse) score += 25;
    if (value.rotation) score += 20;
    if (value.quaternion) score += 20;
    return score >= 40;
}

function cameraScore(value, path) {
    if (!looksLikeCamera(value)) return -Infinity;

    const p = String(path || '').toLowerCase();
    let score = 0;

    if (value.isCamera === true) score += 300;
    if (p === 'game.camera') score += 500;
    if (p.endsWith('.camera')) score += 260;
    if (p.includes('gamescene.camera')) score += 350;
    if (p.includes('scene.camera')) score += 300;
    if (p.includes('renderer.camera')) score += 250;
    if (p.includes('controls.camera')) score += 250;
    if (p.includes('controller.camera')) score += 220;
    if (p.includes('maincamera')) score += 280;
    if (p.includes('shadow') || p.includes('light') || p.includes('cube') || p.includes('reflection')) score -= 700;
    if (Number.isFinite(Number(value.fov))) score += 60;
    if (value.projectionMatrix) score += 40;
    if (value.matrixWorldInverse) score += 40;

    return score;
}

function resolveCamera(game, force = false) {
    if (!game) return null;

    const now = performance.now();

    if (state.camera && looksLikeCamera(state.camera)) {
        return state.camera;
    }

    if (!force && now - state.lastCameraScan < 700) return null;
    state.lastCameraScan = now;

    const direct = [
        ['game.camera', game?.camera],
        ['game.gameScene.camera', game?.gameScene?.camera],
        ['game.scene.camera', game?.scene?.camera],
        ['game.renderer.camera', game?.renderer?.camera],
        ['game.controls.camera', game?.controls?.camera],
        ['game.controller.camera', game?.controller?.camera],
        ['game.client.camera', game?.client?.camera]
    ];

    let best = null;

    for (const [path, candidate] of direct) {
        const score = cameraScore(candidate, path);
        if (Number.isFinite(score) && (!best || score > best.score)) {
            best = { value: candidate, path, score };
        }
    }

    const queue = [{ value: game, path: 'game', depth: 0 }];
    const seen = new WeakSet();
    let visited = 0;

    while (queue.length && visited < 1600) {
        const current = queue.shift();
        const value = current.value;

        if (
            !value ||
            (typeof value !== 'object' && typeof value !== 'function') ||
            seen.has(value)
        ) {
            continue;
        }

        seen.add(value);
        visited++;

        const score = cameraScore(value, current.path);
        if (Number.isFinite(score) && (!best || score > best.score)) {
            best = { value, path: current.path, score };
        }

        if (current.depth >= 4) continue;

        let keys = [];
        try {
            keys = Object.keys(value);
        } catch (_) {
            continue;
        }

        for (const key of keys) {
            if (
                key === 'parent' ||
                key === 'world' ||
                key === 'entities' ||
                key === 'inventory' ||
                key === 'material' ||
                key === 'geometry'
            ) {
                continue;
            }

            let child;
            try {
                child = value[key];
            } catch (_) {
                continue;
            }

            if (
                !child ||
                (typeof child !== 'object' && typeof child !== 'function') ||
                child === window ||
                child === document ||
                child instanceof Element
            ) {
                continue;
            }

            queue.push({
                value: child,
                path: `${current.path}.${key}`,
                depth: current.depth + 1
            });
        }
    }

    if (!best || best.score <= 0) return null;

    state.camera = best.value;
    state.cameraPath = best.path;

    if (state.baseFov === null && Number.isFinite(Number(best.value.fov))) {
        state.baseFov = Number(best.value.fov);
    }

    return best.value;
}

function removePrevious(camera) {
    if (!camera) return;

    try {
        camera.position.x -= state.appliedX;
        camera.position.y -= state.appliedY;
        camera.position.z -= state.appliedZ;
    } catch (_) {}

    try {
        if (camera.rotation) {
            camera.rotation.z -= state.appliedRoll;
            camera.rotation.x -= state.appliedPitch;
            camera.rotation.y -= state.appliedYaw;
        }
    } catch (_) {}

    try {
        if (state.appliedFov !== 0 && Number.isFinite(Number(camera.fov))) {
            camera.fov -= state.appliedFov;
            camera.updateProjectionMatrix?.();
        }
    } catch (_) {}

    state.appliedX = 0;
    state.appliedY = 0;
    state.appliedZ = 0;
    state.appliedRoll = 0;
    state.appliedPitch = 0;
    state.appliedYaw = 0;
    state.appliedFov = 0;
}

function motionData(player) {
    const x = Number(player?.motion?.x);
    const y = Number(player?.motion?.y);
    const z = Number(player?.motion?.z);

    return {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
        z: Number.isFinite(z) ? z : 0
    };
}

function relativeMotion(player, motion) {
    const yaw = Number(player?.yaw);
    if (!Number.isFinite(yaw)) return { forward: 0, strafe: 0 };

    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);

    return {
        forward: -sin * motion.x + cos * motion.z,
        strafe: cos * motion.x + sin * motion.z
    };
}

function effectiveConfig() {
    const v = state.values;

    return {
        masterStrength: v.masterStrength,
        strafeRoll: v.strafeRoll,
        strafeRollResponse: FIXED.strafeRollResponse,
        turnRoll: v.turnRoll,
        turnRollResponse: FIXED.turnRollResponse,
        turnRollLimit: FIXED.turnRollLimit,
        forwardPitch: v.forwardPitch,
        forwardPitchResponse: FIXED.forwardPitchResponse,
        verticalPitch: v.verticalPitch,
        verticalPitchResponse: FIXED.verticalPitchResponse,
        bobVertical: v.bobStrength,
        bobHorizontal: v.bobStrength * 0.50,
        bobRoll: v.bobStrength * 0.3181818,
        bobFrequency: v.bobFrequency,
        bobResponse: FIXED.bobResponse,
        landingPosition: v.landingStrength,
        landingPitch: v.landingStrength * 0.50,
        landingThreshold: FIXED.landingThreshold,
        landingRecovery: FIXED.landingRecovery,
        swayPosition: v.swayStrength,
        swayRotation: v.swayStrength * 1.2222222,
        swayFrequency: FIXED.swayFrequency,
        swayIdleDelay: FIXED.swayIdleDelay,
        swayFadeIn: FIXED.swayFadeIn,
        swayFadeOut: FIXED.swayFadeOut,
        fovBoost: v.fovBoost,
        fovStartSpeed: FIXED.fovStartSpeed,
        fovFullSpeed: FIXED.fovFullSpeed,
        fovResponse: FIXED.fovResponse,
        mouseRoll: v.mouseStrength,
        mousePitch: v.mouseStrength * 0.375,
        mouseResponse: FIXED.mouseResponse,
        mouseRecovery: FIXED.mouseRecovery,
        maxRoll: FIXED.maxRoll,
        maxPitchOffset: FIXED.maxPitchOffset
    };
}

function updateEffects(camera, player, timestamp, dt) {
    removePrevious(camera);

    if (!state.enabled) return;

    const config = effectiveConfig();
    const strength = clamp(Number(config.masterStrength) || 1, 0.25, 2);
    const motion = motionData(player);
    const relative = relativeMotion(player, motion);
    const speed = Math.hypot(motion.x, motion.z);
    const grounded = !!player.onGround;
    const baseYaw = Number(camera?.rotation?.y);

    if (Number.isFinite(baseYaw)) {
        if (state.previousBaseYaw !== null) {
            let deltaYaw = baseYaw - state.previousBaseYaw;
            if (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
            if (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;

            const turnTarget = clamp(
                -deltaYaw * 18 * config.turnRoll * strength,
                -config.turnRollLimit,
                config.turnRollLimit
            );

            state.turnRoll = damp(
                state.turnRoll,
                turnTarget,
                config.turnRollResponse,
                dt
            );

            if (Math.abs(deltaYaw) > 0.0008) state.lastActionTime = timestamp;
        }

        state.previousBaseYaw = baseYaw;
    }

    state.strafeRoll = damp(
        state.strafeRoll,
        clamp(-relative.strafe * 2.8, -1, 1) * config.strafeRoll * strength,
        config.strafeRollResponse,
        dt
    );

    state.forwardPitch = damp(
        state.forwardPitch,
        clamp(Math.abs(relative.forward) * 2.4, 0, 1) * config.forwardPitch * strength,
        config.forwardPitchResponse,
        dt
    );

    state.verticalPitch = damp(
        state.verticalPitch,
        clamp(-motion.y * 1.7, -1, 1) * config.verticalPitch * strength,
        config.verticalPitchResponse,
        dt
    );

    const moving = speed > 0.025;

    if (moving || Math.abs(motion.y) > 0.025) {
        state.lastActionTime = timestamp;
    }

    if (grounded && moving && config.bobVertical > 0) {
        const speedFactor = clamp(speed / 0.32, 0, 1.65);

        state.bobPhase += config.bobFrequency * speedFactor * dt * 0.0166667;

        state.bobY = damp(
            state.bobY,
            Math.abs(Math.sin(state.bobPhase)) * config.bobVertical * speedFactor * strength,
            config.bobResponse,
            dt
        );

        state.bobX = damp(
            state.bobX,
            Math.sin(state.bobPhase * 0.5) * config.bobHorizontal * speedFactor * strength,
            config.bobResponse,
            dt
        );

        state.bobRoll = damp(
            state.bobRoll,
            Math.sin(state.bobPhase * 0.5) * config.bobRoll * speedFactor * strength,
            config.bobResponse,
            dt
        );
    } else {
        state.bobY = damp(state.bobY, 0, 0.16, dt);
        state.bobX = damp(state.bobX, 0, 0.16, dt);
        state.bobRoll = damp(state.bobRoll, 0, 0.16, dt);
    }

    if (
        grounded &&
        !state.wasGrounded &&
        state.previousMotionY < -config.landingThreshold &&
        config.landingPosition > 0
    ) {
        const impact = smooth01(
            clamp(
                (Math.abs(state.previousMotionY) - config.landingThreshold) / 0.55,
                0,
                1
            )
        );

        state.landingY = -config.landingPosition * impact * strength;
        state.landingPitch = config.landingPitch * impact * strength;
    }

    state.landingY = damp(
        state.landingY,
        0,
        config.landingRecovery,
        dt
    );

    state.landingPitch = damp(
        state.landingPitch,
        0,
        config.landingRecovery,
        dt
    );

    state.wasGrounded = grounded;
    state.previousMotionY = motion.y;

    let swayX = 0;
    let swayY = 0;
    let swayPitch = 0;
    let swayYaw = 0;

    if (config.swayPosition > 0) {
        const idleSeconds = (timestamp - state.lastActionTime) / 1000;
        const targetSway = idleSeconds > config.swayIdleDelay ? 1 : 0;
        const fade = targetSway > state.swayFactor
            ? Math.max(0.001, config.swayFadeIn)
            : Math.max(0.001, config.swayFadeOut);

        state.swayFactor = lerp(
            state.swayFactor,
            targetSway,
            clamp(dt * 0.0166667 / fade, 0, 1)
        );

        const t = timestamp / 1000 * config.swayFrequency;
        const swayStrength = Math.pow(state.swayFactor, 2.2) * strength;

        swayX = noise(t, 10.31) * config.swayPosition * swayStrength;
        swayY = noise(t, 23.77) * config.swayPosition * 0.55 * swayStrength;
        swayPitch = noise(t, 41.93) * config.swayRotation * swayStrength;
        swayYaw = noise(t, 67.11) * config.swayRotation * 0.70 * swayStrength;
    }

    const mouseRollTarget = clamp(
        -state.mouseDX * config.mouseRoll * strength,
        -0.11,
        0.11
    );

    const mousePitchTarget = clamp(
        -state.mouseDY * config.mousePitch * strength,
        -0.045,
        0.045
    );

    state.mouseRoll = damp(
        state.mouseRoll,
        mouseRollTarget,
        config.mouseResponse,
        dt
    );

    state.mousePitch = damp(
        state.mousePitch,
        mousePitchTarget,
        config.mouseResponse,
        dt
    );

    state.mouseDX = damp(
        state.mouseDX,
        0,
        config.mouseRecovery,
        dt
    );

    state.mouseDY = damp(
        state.mouseDY,
        0,
        config.mouseRecovery,
        dt
    );

    const roll = clamp(
        state.strafeRoll +
        state.turnRoll +
        state.bobRoll +
        state.mouseRoll,
        -config.maxRoll,
        config.maxRoll
    );

    const pitch = clamp(
        state.forwardPitch +
        state.verticalPitch +
        state.landingPitch +
        state.mousePitch +
        swayPitch,
        -config.maxPitchOffset,
        config.maxPitchOffset
    );

    const posX = state.bobX + swayX;
    const posY = state.bobY + state.landingY + swayY;

    try {
        camera.position.x += posX;
        camera.position.y += posY;
    } catch (_) {}

    try {
        if (camera.rotation) {
            camera.rotation.z += roll;
            camera.rotation.x += pitch;
            camera.rotation.y += swayYaw;
        }
    } catch (_) {}

    state.appliedX = posX;
    state.appliedY = posY;
    state.appliedZ = 0;
    state.appliedRoll = roll;
    state.appliedPitch = pitch;
    state.appliedYaw = swayYaw;

    if (Number.isFinite(Number(camera.fov))) {
        if (state.baseFov === null) state.baseFov = Number(camera.fov);

        const normalized = smooth01(
            clamp(
                (speed - config.fovStartSpeed) /
                Math.max(0.001, config.fovFullSpeed - config.fovStartSpeed),
                0,
                1
            )
        );

        state.fovDelta = damp(
            state.fovDelta,
            config.fovBoost * normalized * strength,
            config.fovResponse,
            dt
        );

        camera.fov += state.fovDelta;
        state.appliedFov = state.fovDelta;

        try {
            camera.updateProjectionMatrix?.();
        } catch (_) {}
    }
}

function resetEffects() {
    if (state.camera) removePrevious(state.camera);

    state.strafeRoll = 0;
    state.turnRoll = 0;
    state.forwardPitch = 0;
    state.verticalPitch = 0;
    state.bobPhase = 0;
    state.bobX = 0;
    state.bobY = 0;
    state.bobRoll = 0;
    state.landingY = 0;
    state.landingPitch = 0;
    state.swayFactor = 0;
    state.mouseDX = 0;
    state.mouseDY = 0;
    state.mouseRoll = 0;
    state.mousePitch = 0;
    state.fovDelta = 0;
    state.previousBaseYaw = null;
    state.previousMotionY = 0;
    state.wasGrounded = false;
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

    if (!next) resetEffects();

    if (notify) emitState('enabled');
}

function setValues(values, notify = false) {
    state.values = normalizeValues(values);
    state.preset = detectPreset(state.values);

    if (state.enabled) {
        resetEffects();
        state.lastFrame = performance.now();
    }

    if (notify) emitState('values');
}

function setPreset(name, notify = false) {
    if (!PRESETS[name]) return;
    state.values = cloneValues(PRESETS[name]);
    state.preset = name;

    if (state.enabled) {
        resetEffects();
        state.lastFrame = performance.now();
    }

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
    if (!state.enabled) return;

    state.mouseDX = clamp(
        state.mouseDX + Number(event.movementX || 0),
        -100,
        100
    );

    state.mouseDY = clamp(
        state.mouseDY + Number(event.movementY || 0),
        -100,
        100
    );
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

function loop(timestamp) {
    const rawDt = (timestamp - state.lastFrame) / 16.6667;
    const dt = clamp(Number.isFinite(rawDt) ? rawDt : 1, 0.25, 3);
    state.lastFrame = timestamp;

    if (state.enabled) {
        const game = getGame();
        const player = game?.player;

        if (game && player) {
            const camera = resolveCamera(game);

            if (camera) {
                updateEffects(camera, player, timestamp, dt);
            }
        }
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
    get cameraPath() {
        return state.cameraPath;
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
