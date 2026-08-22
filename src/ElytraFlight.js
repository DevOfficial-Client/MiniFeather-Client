(function () {
'use strict';

const EVENT_CONFIG = 'minifeather:elytra-flight-config';
const EVENT_STATE = 'minifeather:elytra-flight-state';
const RAD = Math.PI / 180;
const TAU = Math.PI * 2;

const PRESETS = Object.freeze({
    soft: Object.freeze({
        rollSensitivity: 0.00145,
        pitchSensitivity: 0.82,
        yawSpeed: 42,
        bankingStrength: 0.35,
        smoothing: 7.5,
        autoLevelStrength: 2.8,
        invertPitch: false,
        autoLevel: true,
        showHorizon: false
    }),
    normal: Object.freeze({
        rollSensitivity: 0.00215,
        pitchSensitivity: 1.00,
        yawSpeed: 68,
        bankingStrength: 0.62,
        smoothing: 10.5,
        autoLevelStrength: 4.2,
        invertPitch: false,
        autoLevel: true,
        showHorizon: false
    }),
    strong: Object.freeze({
        rollSensitivity: 0.00305,
        pitchSensitivity: 1.12,
        yawSpeed: 92,
        bankingStrength: 0.92,
        smoothing: 14.0,
        autoLevelStrength: 5.8,
        invertPitch: false,
        autoLevel: true,
        showHorizon: true
    })
});

const LIMITS = Object.freeze({
    rollSensitivity: Object.freeze([0.0005, 0.006]),
    pitchSensitivity: Object.freeze([0.4, 1.6]),
    yawSpeed: Object.freeze([15, 150]),
    bankingStrength: Object.freeze([0, 1.5]),
    smoothing: Object.freeze([3, 22]),
    autoLevelStrength: Object.freeze([0.5, 10])
});

const state = {
    enabled: false,
    preset: 'normal',
    values: { ...PRESETS.normal },
    game: null,
    player: null,
    camera: null,
    yawObject: null,
    pitchObject: null,
    viewHook: null,
    viewHookDepth: 0,
    lastGameScan: 0,
    lastCameraScan: 0,
    lastFrame: performance.now(),
    flying: false,
    flightBlend: 0,
    roll: 0,
    targetRoll: 0,
    rollVelocity: 0,
    lastRollInputAt: 0,
    keys: { left: false, right: false },
    gameMouseHandler: null,
    radPerPixel: -0.002,
    calibrationPending: false,
    horizon: null,
    horizonLine: null,
    horizonPitch: null
};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function normalizeAngle(value) {
    let angle = Number(value) || 0;
    while (angle > Math.PI) angle -= TAU;
    while (angle < -Math.PI) angle += TAU;
    return angle;
}

function shortestAngle(from, to) {
    return normalizeAngle(to - from);
}

function normalizeValues(source) {
    const out = { ...PRESETS.normal };
    if (!source || typeof source !== 'object') return out;
    for (const [key, range] of Object.entries(LIMITS)) {
        const value = Number(source[key]);
        if (Number.isFinite(value)) out[key] = clamp(value, range[0], range[1]);
    }
    out.invertPitch = source.invertPitch === true;
    out.autoLevel = source.autoLevel !== false;
    out.showHorizon = source.showHorizon === true;
    return out;
}

function detectPreset(values) {
    const current = normalizeValues(values);
    for (const [name, preset] of Object.entries(PRESETS)) {
        const sameNumbers = Object.keys(LIMITS).every(key => {
            const scale = Math.max(1, Math.abs(Number(preset[key])));
            return Math.abs(Number(current[key]) - Number(preset[key])) <= scale * 0.000001;
        });
        if (
            sameNumbers &&
            current.invertPitch === preset.invertPitch &&
            current.autoLevel === preset.autoLevel &&
            current.showHorizon === preset.showHorizon
        ) {
            return name;
        }
    }
    return 'custom';
}

function parseDetail(event) {
    try {
        return typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch (_) {
        return null;
    }
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
    while (fiber && depth++ < 140) {
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
    if (!force && state.game?.player && now - state.lastGameScan < 1000) return state.game;
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
                document.body,
                ...document.querySelectorAll('#root *')
            ];
            for (const element of candidates.slice(0, 220)) {
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
        (camera.rotation || camera.quaternion)
    );
}

function resolveCamera(force = false) {
    const game = getGame(force);
    if (!game) return null;
    const now = performance.now();
    if (!force && validCamera(state.camera) && now - state.lastCameraScan < 1000) return state.camera;
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
        installViewHook(camera);
    } else {
        state.pitchObject = camera.parent || state.pitchObject;
        state.yawObject = camera.parent?.parent || state.yawObject;
    }
    return camera;
}

function isElytraFlying(player = state.player) {
    if (!player) return false;
    try {
        if (typeof player.isElytraFlying === 'function') return !!player.isElytraFlying();
    } catch (_) {}
    try {
        if (typeof player.zklLiWt === 'function') return !!player.zklLiWt(7);
    } catch (_) {}
    return false;
}

function shouldControl() {
    if (!state.enabled || !document.pointerLockElement) return false;
    if (globalThis.__MINIFEATHER_FREECAM_ACTIVE__ || globalThis._mfFreelookActive) return false;
    const player = getGame()?.player;
    if (!player || player.inWater === true || player.abilities?.flying === true) return false;
    return isElytraFlying(player);
}

function springRoll(target, dt) {
    const frequency = clamp(state.values.smoothing, 3, 22);
    const omega = frequency * 2.2;
    const step = clamp(dt, 0.001, 0.05);
    const delta = target - state.roll;
    state.rollVelocity += delta * omega * omega * step;
    state.rollVelocity *= Math.exp(-omega * 1.5 * step);
    state.roll += state.rollVelocity * step;
    if (!Number.isFinite(state.roll) || !Number.isFinite(state.rollVelocity)) {
        state.roll = target;
        state.rollVelocity = 0;
    }
}

function applyViewEffect(camera, original, thisArg, args) {
    if (
        state.viewHookDepth > 0 ||
        state.flightBlend <= 0.0001 ||
        !camera?.rotation ||
        globalThis.__MINIFEATHER_FREECAM_ACTIVE__
    ) {
        return original.apply(thisArg, args);
    }
    state.viewHookDepth++;
    const rotation = camera.rotation;
    const base = Number(rotation.z) || 0;
    try {
        rotation.z = base + state.roll * state.flightBlend;
        return original.apply(thisArg, args);
    } finally {
        try {
            rotation.z = base;
        } catch (_) {}
        state.viewHookDepth--;
    }
}

function installViewHook(camera) {
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

function ensureHorizon() {
    if (state.horizon?.isConnected) return;
    const root = document.createElement('div');
    root.id = 'mf-elytra-horizon';
    Object.assign(root.style, {
        position: 'fixed',
        left: '50%',
        top: '50%',
        width: '108px',
        height: '108px',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: '2147483200',
        opacity: '0',
        transition: 'opacity 120ms linear'
    });
    const ring = document.createElement('div');
    Object.assign(ring.style, {
        position: 'absolute',
        inset: '0',
        border: '1px solid rgba(255,255,255,.28)',
        borderRadius: '50%',
        boxShadow: '0 0 8px rgba(0,0,0,.35)'
    });
    const pitch = document.createElement('div');
    Object.assign(pitch.style, {
        position: 'absolute',
        left: '8px',
        right: '8px',
        top: '50%',
        height: '1px',
        transformOrigin: '50% 50%'
    });
    const line = document.createElement('div');
    Object.assign(line.style, {
        position: 'absolute',
        left: '0',
        right: '0',
        top: '0',
        height: '1px',
        background: 'rgba(255,255,255,.88)',
        boxShadow: '0 1px 2px rgba(0,0,0,.65)'
    });
    const center = document.createElement('div');
    Object.assign(center.style, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '4px',
        height: '4px',
        marginLeft: '-2px',
        marginTop: '-2px',
        borderRadius: '50%',
        background: 'rgba(255,255,255,.9)',
        boxShadow: '0 0 3px rgba(0,0,0,.7)'
    });
    pitch.appendChild(line);
    root.appendChild(ring);
    root.appendChild(pitch);
    root.appendChild(center);
    document.documentElement.appendChild(root);
    state.horizon = root;
    state.horizonLine = line;
    state.horizonPitch = pitch;
}

function updateHorizon() {
    if (!state.values.showHorizon) {
        if (state.horizon) state.horizon.style.opacity = '0';
        return;
    }
    ensureHorizon();
    if (!state.horizon || !state.horizonPitch) return;
    const visible = state.enabled && state.flightBlend > 0.08;
    state.horizon.style.opacity = visible ? String(clamp(state.flightBlend, 0, 0.88)) : '0';
    if (!visible) return;
    const pitch = Number(state.pitchObject?.rotation?.x) || 0;
    const translateY = clamp(pitch * 34, -28, 28);
    state.horizonPitch.style.transform = `translateY(${translateY}px) rotate(${-state.roll}rad)`;
}

function removeHorizon() {
    try {
        state.horizon?.remove();
    } catch (_) {}
    state.horizon = null;
    state.horizonLine = null;
    state.horizonPitch = null;
}

function applySyntheticYaw(deltaRadians) {
    if (!Number.isFinite(deltaRadians) || Math.abs(deltaRadians) < 0.000001) return;
    if (typeof state.gameMouseHandler === 'function' && Math.abs(state.radPerPixel) > 0.00000001) {
        const movementX = deltaRadians / state.radPerPixel;
        if (Number.isFinite(movementX) && Math.abs(movementX) <= 260) {
            try {
                state.gameMouseHandler({
                    movementX,
                    movementY: 0,
                    mozMovementX: movementX,
                    mozMovementY: 0,
                    webkitMovementX: movementX,
                    webkitMovementY: 0
                });
                return;
            } catch (_) {}
        }
    }
    const player = state.player;
    const yawObject = state.yawObject;
    if (!player) return;
    const deltaDegrees = deltaRadians / RAD;
    const playerYaw = Number(player.yaw);
    if (Number.isFinite(playerYaw)) player.yaw = playerYaw + deltaDegrees;
    if (yawObject?.rotation) {
        const current = Number(yawObject.rotation.y) || 0;
        const positiveError = Math.abs(normalizeAngle(current - (Number(player.yaw) || 0) * RAD));
        const negativeError = Math.abs(normalizeAngle(current + (Number(player.yaw) || 0) * RAD));
        const sign = negativeError < positiveError ? -1 : 1;
        yawObject.rotation.y = current + deltaRadians * sign;
    }
}

function updateFlight(dt, now) {
    resolveCamera();
    const flying = shouldControl();
    state.flying = flying;
    const blendTarget = flying ? 1 : 0;
    const blendSpeed = flying ? 10 : 6;
    state.flightBlend += (blendTarget - state.flightBlend) * (1 - Math.exp(-blendSpeed * dt));
    if (Math.abs(state.flightBlend - blendTarget) < 0.0001) state.flightBlend = blendTarget;

    if (!flying) {
        state.targetRoll += shortestAngle(state.targetRoll, 0) * (1 - Math.exp(-5 * dt));
        springRoll(state.targetRoll, dt);
        if (state.flightBlend <= 0.001) {
            state.roll = 0;
            state.targetRoll = 0;
            state.rollVelocity = 0;
        }
        updateHorizon();
        return;
    }

    const idleMs = now - state.lastRollInputAt;
    if (state.values.autoLevel && idleMs > 380) {
        const normalized = normalizeAngle(state.targetRoll);
        if (Math.abs(normalized) < Math.PI / 2) {
            const level = state.targetRoll - normalized;
            const rate = clamp(state.values.autoLevelStrength, 0.5, 10);
            state.targetRoll += (level - state.targetRoll) * (1 - Math.exp(-rate * dt));
        }
    }

    springRoll(state.targetRoll, dt);

    const keyYaw = (state.keys.right ? 1 : 0) - (state.keys.left ? 1 : 0);
    const rollForBank = normalizeAngle(state.roll);
    const bankYaw = -Math.sin(rollForBank) * clamp(state.values.bankingStrength, 0, 1.5) * 48;
    const yawDegrees = (keyYaw * clamp(state.values.yawSpeed, 15, 150) + bankYaw) * dt;
    applySyntheticYaw(-yawDegrees * RAD);
    updateHorizon();
}

function emitState(reason = 'state') {
    try {
        document.dispatchEvent(new CustomEvent(EVENT_STATE, {
            detail: JSON.stringify({
                enabled: !!state.enabled,
                flying: !!state.flying,
                preset: state.preset,
                values: { ...state.values },
                calibrated: Math.abs(state.radPerPixel) > 0.00000001,
                reason
            })
        }));
    } catch (_) {}
}

function setEnabled(enabled, notify = true) {
    state.enabled = !!enabled;
    if (!state.enabled) {
        state.keys.left = false;
        state.keys.right = false;
        state.targetRoll = 0;
    }
    if (notify) emitState('enabled');
}

function setValues(values, notify = true) {
    state.values = normalizeValues(values);
    state.preset = detectPreset(state.values);
    if (!state.values.showHorizon) updateHorizon();
    if (notify) emitState('values');
}

const previousAddEventListener = EventTarget.prototype.addEventListener;

if (!globalThis.__MINIFEATHER_ELYTRA_MOUSE_HOOK__) {
    globalThis.__MINIFEATHER_ELYTRA_MOUSE_HOOK__ = true;
    EventTarget.prototype.addEventListener = function (type, handler, options) {
        if (type === 'mousemove' && this === document && typeof handler === 'function') {
            let source = '';
            try {
                source = Function.prototype.toString.call(handler);
            } catch (_) {}
            const likelyGameHandler = source.includes('onMouseMove') || source.includes('movementX') || source.includes('mozMovementX');
            if (likelyGameHandler && !state.gameMouseHandler) state.gameMouseHandler = handler;
            const wrappedHandler = function (event) {
                if (!shouldControl()) return handler.call(this, event);
                const pitchScale = clamp(state.values.pitchSensitivity, 0.4, 1.6) * (state.values.invertPitch ? -1 : 1);
                const fakeEvent = new Proxy(event, {
                    get(target, prop) {
                        if (prop === 'movementX' || prop === 'mozMovementX' || prop === 'webkitMovementX') return 0;
                        if (prop === 'movementY' || prop === 'mozMovementY' || prop === 'webkitMovementY') {
                            return Number(target.movementY || target.mozMovementY || target.webkitMovementY || 0) * pitchScale;
                        }
                        const value = Reflect.get(target, prop, target);
                        return typeof value === 'function' ? value.bind(target) : value;
                    }
                });
                return handler.call(this, fakeEvent);
            };
            return previousAddEventListener.call(this, type, wrappedHandler, options);
        }
        // Chrome bloquea 'unload' vía Permissions Policy; convertirlo a
        // 'pagehide' (reemplazo oficial) evita la violación y mantiene
        // el callback del script original.
        if (type === 'unload') type = 'pagehide';
        return previousAddEventListener.call(this, type, handler, options);
    };
}

window.addEventListener('mousemove', event => {
    const dx = Number(event.movementX || 0);
    if (shouldControl() && dx) {
        state.targetRoll -= dx * clamp(state.values.rollSensitivity, 0.0005, 0.006);
        state.lastRollInputAt = performance.now();
    }
    if (state.calibrationPending || shouldControl() || !document.pointerLockElement || !dx) return;
    const camera = resolveCamera();
    const yawObject = camera?.parent?.parent || state.yawObject;
    if (!yawObject?.rotation) return;
    const before = Number(yawObject.rotation.y);
    if (!Number.isFinite(before)) return;
    state.calibrationPending = true;
    setTimeout(() => {
        state.calibrationPending = false;
        const after = Number(yawObject.rotation.y);
        if (!Number.isFinite(after)) return;
        const delta = normalizeAngle(after - before);
        if (Math.abs(delta) < 0.00000001) return;
        const measured = delta / dx;
        if (Number.isFinite(measured) && Math.abs(measured) > 0.00000001 && Math.abs(measured) < 0.05) {
            state.radPerPixel = state.radPerPixel
                ? state.radPerPixel * 0.75 + measured * 0.25
                : measured;
        }
    }, 0);
}, true);

window.addEventListener('keydown', event => {
    const target = event.target;
    const tag = String(target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
    if (event.code === 'KeyA') state.keys.left = true;
    if (event.code === 'KeyD') state.keys.right = true;
}, true);

window.addEventListener('keyup', event => {
    if (event.code === 'KeyA') state.keys.left = false;
    if (event.code === 'KeyD') state.keys.right = false;
}, true);

window.addEventListener('blur', () => {
    state.keys.left = false;
    state.keys.right = false;
}, true);

document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement) {
        state.keys.left = false;
        state.keys.right = false;
        state.targetRoll = 0;
    }
}, true);

document.addEventListener(EVENT_CONFIG, event => {
    const config = parseDetail(event);
    if (!config || typeof config !== 'object') return;
    if (typeof config.enabled === 'boolean') setEnabled(config.enabled, false);
    if (config.values && typeof config.values === 'object') setValues(config.values, false);
    if (typeof config.preset === 'string' && PRESETS[config.preset]) {
        state.values = normalizeValues({ ...state.values, ...PRESETS[config.preset] });
        state.preset = config.preset;
    } else {
        state.preset = detectPreset(state.values);
    }
    emitState('config');
}, true);

globalThis.ElytraFlight = {
    enable() {
        setEnabled(true, true);
    },
    disable() {
        setEnabled(false, true);
    },
    toggle() {
        setEnabled(!state.enabled, true);
    },
    setPreset(name) {
        const key = String(name || '').toLowerCase();
        if (!PRESETS[key]) return state.preset;
        state.values = normalizeValues(PRESETS[key]);
        state.preset = key;
        emitState('preset');
        return key;
    },
    setValues(values) {
        setValues(values, true);
        return { ...state.values };
    },
    get enabled() {
        return state.enabled;
    },
    get flying() {
        return state.flying;
    },
    get roll() {
        return state.roll;
    },
    get preset() {
        return state.preset;
    },
    get values() {
        return { ...state.values };
    }
};

function loop(timestamp) {
    const dt = clamp((timestamp - state.lastFrame) / 1000, 0.001, 0.05);
    state.lastFrame = timestamp;
    updateFlight(dt, timestamp);
    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
})();
