(function () {
'use strict';

const EVENT_CONFIG = 'minifeather:freecam-config';
const EVENT_STATE = 'minifeather:freecam-state';
const EVENT_ACCESS_REQUEST = 'minifeather:freecam-access-request';

const FREECAM_USERS = new Set([
    'angrywolfx',
    'estebanexg_',
    'itznightrise'
]);

const keys = Object.create(null);

const state = {
    enabled: false,
    configured: false,
    requestedEnabled: false,
    lastEnableAttempt: 0,
    speed: 7.0,
    sensitivity: 1.0,
    fastMultiplier: 3.0,
    game: null,
    player: null,
    camera: null,
    originalParent: null,
    originalIndex: -1,
    originalPosition: null,
    originalRotation: null,
    originalQuaternion: null,
    detached: false,
    scene: null,
    freePosition: null,
    yaw: 0,
    pitch: 0,
    lastFrame: performance.now(),
    lastGameScan: 0,
    lastCameraScan: 0,
    matrixHook: null,
    worldMatrixHook: null,
    savedPerspective: null,
    forcedPerspective: false,
    lastAccessCheck: 0
};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function parseDetail(event) {
    try {
        return typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch (_) {
        return null;
    }
}

function cloneXYZ(value) {
    if (!value) return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (![x, y, z].every(Number.isFinite)) return null;
    return { x, y, z };
}

function copyXYZ(target, source) {
    if (!target || !source) return false;
    try {
        if (typeof target.set === 'function') target.set(source.x, source.y, source.z);
        else {
            target.x = source.x;
            target.y = source.y;
            target.z = source.z;
        }
        return true;
    } catch (_) {
        return false;
    }
}

function cloneRotation(value) {
    if (!value) return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (![x, y, z].every(Number.isFinite)) return null;
    return { x, y, z, order: typeof value.order === 'string' ? value.order : 'YXZ' };
}

function copyRotation(target, source) {
    if (!target || !source) return false;
    try {
        if (typeof target.set === 'function') target.set(source.x, source.y, source.z, source.order || 'YXZ');
        else {
            target.x = source.x;
            target.y = source.y;
            target.z = source.z;
            if ('order' in target) target.order = source.order || 'YXZ';
        }
        return true;
    } catch (_) {
        return false;
    }
}

function cloneQuaternion(value) {
    if (!value) return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    const w = Number(value.w);
    if (![x, y, z, w].every(Number.isFinite)) return null;
    return { x, y, z, w };
}

function copyQuaternion(target, source) {
    if (!target || !source) return false;
    try {
        if (typeof target.set === 'function') target.set(source.x, source.y, source.z, source.w);
        else {
            target.x = source.x;
            target.y = source.y;
            target.z = source.z;
            target.w = source.w;
        }
        return true;
    } catch (_) {
        return false;
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

function getServerPermissionLevel(game = getGame(true)) {
    const info = game?.serverInfo;
    const uuid = game?.player?.profile?.uuid;
    let level = Number(info?.permissionLevel);
    if (!Number.isFinite(level)) level = 0;

    try {
        if (uuid && info?.planetOwnerUuid === uuid) level = 200;
    } catch (_) {}

    return level;
}

function hasServerAdminAccess(game = getGame(true)) {
    return getServerPermissionLevel(game) >= 100;
}

function getPlayerUsername(game = getGame(true)) {
    return String(
        game?.player?.profile?.username ??
        game?.player?.username ??
        game?.player?.name ??
        ''
    ).trim();
}

function hasFreecamAccess(game = getGame(true)) {
    if (hasServerAdminAccess(game)) return true;
    return FREECAM_USERS.has(getPlayerUsername(game).toLowerCase());
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

function findScene(camera) {
    let current = camera;
    let fallback = null;
    for (let i = 0; current && i < 12; i++, current = current.parent) {
        if (current.isScene === true) return current;
        if (current.parent) fallback = current.parent;
    }
    return fallback;
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

    if (!validCamera(camera)) return validCamera(state.camera) ? state.camera : null;
    state.camera = camera;
    installCameraHooks(camera);
    return camera;
}

function getPlayerCameraOrigin(player) {
    const pos = cloneXYZ(player?.pos || player?.position);
    if (!pos) return null;

    let eyeHeight = NaN;
    try {
        if (typeof player?.getEyeHeight === 'function') eyeHeight = Number(player.getEyeHeight());
    } catch (_) {}
    if (!Number.isFinite(eyeHeight)) eyeHeight = Number(player?.eyeHeight);
    if (!Number.isFinite(eyeHeight)) eyeHeight = 1.62;

    return {
        x: pos.x,
        y: pos.y + eyeHeight,
        z: pos.z
    };
}

function captureWorldPosition(camera) {
    try {
        if (typeof camera.getWorldPosition === 'function' && camera.position?.clone) {
            const out = camera.position.clone();
            camera.getWorldPosition(out);
            return cloneXYZ(out);
        }
    } catch (_) {}
    return cloneXYZ(camera?.position);
}

function captureWorldQuaternion(camera) {
    try {
        if (typeof camera.getWorldQuaternion === 'function' && camera.quaternion?.clone) {
            const out = camera.quaternion.clone();
            camera.getWorldQuaternion(out);
            return cloneQuaternion(out);
        }
    } catch (_) {}
    return cloneQuaternion(camera?.quaternion);
}

function setEulerFromQuaternion(camera, quaternion) {
    if (!camera?.rotation || !quaternion) return false;
    try {
        if (camera.quaternion && typeof camera.quaternion.set === 'function') {
            camera.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
            if (typeof camera.rotation.setFromQuaternion === 'function') {
                camera.rotation.setFromQuaternion(camera.quaternion, 'YXZ');
            }
            return true;
        }
    } catch (_) {}
    return false;
}

function applyPose(camera = state.camera) {
    if (!state.enabled || !camera || !state.freePosition) return;
    copyXYZ(camera.position, state.freePosition);
    try {
        if (camera.rotation) {
            if (typeof camera.rotation.set === 'function') camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
            else {
                camera.rotation.x = state.pitch;
                camera.rotation.y = state.yaw;
                camera.rotation.z = 0;
                if ('order' in camera.rotation) camera.rotation.order = 'YXZ';
            }
        }
    } catch (_) {}
}

function installCameraHooks(camera) {
    if (!camera) return;

    if (state.matrixHook?.camera !== camera && typeof camera.updateMatrixWorld === 'function') {
        const original = camera.updateMatrixWorld;
        const hook = function (...args) {
            if (state.enabled && state.camera === camera) applyPose(camera);
            return original.apply(this, args);
        };
        try {
            camera.updateMatrixWorld = hook;
            state.matrixHook = { camera, original, hook };
        } catch (_) {}
    }

    if (state.worldMatrixHook?.camera !== camera && typeof camera.updateWorldMatrix === 'function') {
        const original = camera.updateWorldMatrix;
        const hook = function (...args) {
            if (state.enabled && state.camera === camera) applyPose(camera);
            return original.apply(this, args);
        };
        try {
            camera.updateWorldMatrix = hook;
            state.worldMatrixHook = { camera, original, hook };
        } catch (_) {}
    }
}

function clearKeys() {
    for (const key of Object.keys(keys)) keys[key] = false;
}

function isTypingOrUiOpen() {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return true;

    const game = state.game;
    if (game?.chat?.showInput || game?.chat?.inputOpen || game?.chat?.isInputOpen) return true;

    return !!document.querySelector('#mf-gui-overlay:not([style*="display: none"])');
}

function releaseGameMovementKeys() {
    const definitions = {
        KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68],
        Space: [' ', 32], ShiftLeft: ['Shift', 16], ShiftRight: ['Shift', 16],
        ControlLeft: ['Control', 17], ControlRight: ['Control', 17]
    };

    for (const [code, [key, keyCode]] of Object.entries(definitions)) {
        try {
            const event = new KeyboardEvent('keyup', {
                code, key, keyCode, which: keyCode, bubbles: true, cancelable: true
            });
            window.dispatchEvent(event);
        } catch (_) {}
    }
}

function neutralizePlayerInput() {
    const player = state.player || state.game?.player;
    if (!player) return;
    try { if ('wWQmwuDLqA' in player) player.wWQmwuDLqA = 0; } catch (_) {}
    try { if ('YApHmhhGagG' in player) player.YApHmhhGagG = 0; } catch (_) {}
    try { if ('jumping' in player) player.jumping = false; } catch (_) {}
    try { if ('sneak' in player) player.sneak = false; } catch (_) {}
}

function forceThirdPerson(player) {
    state.savedPerspective = null;
    state.forcedPerspective = false;
    if (!player || !Number.isFinite(Number(player.perspective))) return;

    state.savedPerspective = Number(player.perspective);
    if (state.savedPerspective !== 0) return;

    try {
        player.perspective = 1;
        if (typeof player.toggleCameraPerspective === 'function') player.toggleCameraPerspective();
        state.forcedPerspective = true;
    } catch (_) {}
}

function restorePerspective(player) {
    const saved = state.savedPerspective;
    if (!player || saved === null) {
        state.savedPerspective = null;
        state.forcedPerspective = false;
        return;
    }

    try {
        if (Number(player.perspective) !== Number(saved)) {
            player.perspective = saved;
            if (typeof player.toggleCameraPerspective === 'function') player.toggleCameraPerspective();
        }
    } catch (_) {}

    state.savedPerspective = null;
    state.forcedPerspective = false;
}

function detachCamera(camera) {
    const parent = camera?.parent || null;
    if (!parent) return false;

    const scene = findScene(camera);
    if (!scene || scene === parent || typeof scene.add !== 'function') return false;

    state.originalParent = parent;
    state.originalIndex = Array.isArray(parent.children) ? parent.children.indexOf(camera) : -1;
    state.scene = scene;

    try {
        camera.updateMatrixWorld?.(true);
        if (typeof scene.attach === 'function') scene.attach(camera);
        else {
            parent.remove?.(camera);
            scene.add(camera);
        }
        state.detached = camera.parent === scene;
        return state.detached;
    } catch (_) {
        return false;
    }
}

function restoreCameraParent(camera) {
    const parent = state.originalParent;
    if (!camera || !parent) return;

    try {
        parent.add(camera);
        if (
            state.originalIndex >= 0 &&
            Array.isArray(parent.children) &&
            parent.children[parent.children.length - 1] === camera &&
            state.originalIndex < parent.children.length - 1
        ) {
            parent.children.splice(parent.children.length - 1, 1);
            parent.children.splice(state.originalIndex, 0, camera);
        }
    } catch (_) {}
}

function emitState(extra = {}) {
    const game = getGame(true);
    const permissionLevel = getServerPermissionLevel(game);
    document.dispatchEvent(new CustomEvent(EVENT_STATE, {
        detail: JSON.stringify({
            enabled: state.enabled,
            canAccess: hasFreecamAccess(game),
            permissionLevel,
            ...extra
        })
    }));
}

function enable() {
    if (state.enabled) return true;

    const game = getGame(true);
    const player = game?.player;

    if (!player) {
        state.requestedEnabled = false;
        emitState({ error: 'NO_PLAYER' });
        return false;
    }

    if (!hasFreecamAccess(game)) {
        state.requestedEnabled = false;
        emitState({ error: 'NO_SERVER_ADMIN' });
        return false;
    }

    const camera = resolveCamera(true);
    if (!camera) {
        state.requestedEnabled = false;
        emitState({ error: 'NO_CAMERA' });
        return false;
    }

    const worldPosition = captureWorldPosition(camera);
    const playerOrigin = getPlayerCameraOrigin(player);
    const worldQuaternion = captureWorldQuaternion(camera);
    if (!playerOrigin && !worldPosition) {
        state.requestedEnabled = false;
        emitState({ error: 'NO_CAMERA_POSITION' });
        return false;
    }

    state.player = player;
    state.camera = camera;
    state.originalParent = camera.parent || null;
    state.originalIndex = Array.isArray(camera.parent?.children) ? camera.parent.children.indexOf(camera) : -1;
    state.originalPosition = cloneXYZ(camera.position);
    state.originalRotation = cloneRotation(camera.rotation);
    state.originalQuaternion = cloneQuaternion(camera.quaternion);

    try { window.MF_FREELOOK?.setFL?.(false); } catch (_) {}

    forceThirdPerson(player);
    detachCamera(camera);

    state.freePosition = playerOrigin || getPlayerCameraOrigin(player) || worldPosition || captureWorldPosition(camera);

    if (worldQuaternion && setEulerFromQuaternion(camera, worldQuaternion)) {
        state.pitch = clamp(Number(camera.rotation?.x), -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
        state.yaw = Number(camera.rotation?.y) || 0;
    } else {
        const rotation = cloneRotation(camera.rotation);
        state.pitch = clamp(rotation?.x ?? Number(player.pitch) ?? 0, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
        state.yaw = rotation?.y ?? Number(player.yaw) ?? 0;
    }

    state.enabled = true;
    globalThis.__MINIFEATHER_FREECAM_ACTIVE__ = true;
    state.lastFrame = performance.now();
    clearKeys();
    releaseGameMovementKeys();
    neutralizePlayerInput();
    applyPose(camera);
    state.lastAccessCheck = performance.now();
    emitState();
    return true;
}

function disable(preserveRequest = false) {
    if (!preserveRequest) state.requestedEnabled = false;
    if (!state.enabled) return;

    const camera = state.camera;
    const player = state.player;

    state.enabled = false;
    globalThis.__MINIFEATHER_FREECAM_ACTIVE__ = false;
    clearKeys();
    neutralizePlayerInput();

    if (camera) {
        if (state.detached) restoreCameraParent(camera);
        if (state.originalPosition) copyXYZ(camera.position, state.originalPosition);
        if (state.originalQuaternion) copyQuaternion(camera.quaternion, state.originalQuaternion);
        if (state.originalRotation) copyRotation(camera.rotation, state.originalRotation);
        try { camera.updateMatrixWorld?.(true); } catch (_) {}
    }

    restorePerspective(player);

    state.originalParent = null;
    state.originalIndex = -1;
    state.originalPosition = null;
    state.originalRotation = null;
    state.originalQuaternion = null;
    state.detached = false;
    state.scene = null;
    state.freePosition = null;

    emitState();
}

function setEnabled(value) {
    state.requestedEnabled = !!value;
    if (state.requestedEnabled) return enable();
    disable(false);
    return true;
}

function update(timestamp) {
    if (!state.enabled) return;

    const game = getGame();
    if (!game?.player || game.player !== state.player) {
        state.requestedEnabled = false;
        disable(true);
        return;
    }

    if (timestamp - state.lastAccessCheck >= 500) {
        state.lastAccessCheck = timestamp;
        if (!hasFreecamAccess(game)) {
            state.requestedEnabled = false;
            disable(true);
            emitState({ error: 'NO_SERVER_ADMIN' });
            return;
        }
    }

    const camera = resolveCamera();
    if (!camera || camera !== state.camera) {
        disable(true);
        return;
    }

    neutralizePlayerInput();

    const dt = clamp((timestamp - state.lastFrame) / 1000, 0, 0.05);
    state.lastFrame = timestamp;

    if (isTypingOrUiOpen() || !document.pointerLockElement) {
        clearKeys();
        applyPose(camera);
        return;
    }

    let forward = 0;
    let strafe = 0;
    let vertical = 0;

    if (keys.KeyW) forward += 1;
    if (keys.KeyS) forward -= 1;
    if (keys.KeyD) strafe += 1;
    if (keys.KeyA) strafe -= 1;
    if (keys.Space) vertical += 1;
    if (keys.ShiftLeft || keys.ShiftRight) vertical -= 1;

    const horizontalLength = Math.hypot(forward, strafe);
    if (horizontalLength > 1) {
        forward /= horizontalLength;
        strafe /= horizontalLength;
    }

    const boost = keys.ControlLeft || keys.ControlRight ? state.fastMultiplier : 1;
    const distance = state.speed * boost * dt;

    const sinYaw = Math.sin(state.yaw);
    const cosYaw = Math.cos(state.yaw);

    state.freePosition.x += (-sinYaw * forward + cosYaw * strafe) * distance;
    state.freePosition.z += (-cosYaw * forward - sinYaw * strafe) * distance;
    state.freePosition.y += vertical * distance;

    applyPose(camera);
}

const movementKeys = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'Space', 'ShiftLeft', 'ShiftRight',
    'ControlLeft', 'ControlRight'
]);

window.addEventListener('keydown', event => {
    if (!state.enabled || isTypingOrUiOpen()) return;
    if (!movementKeys.has(event.code)) return;
    keys[event.code] = true;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}, true);

window.addEventListener('keyup', event => {
    if (!movementKeys.has(event.code)) return;
    keys[event.code] = false;
}, true);

window.addEventListener('mousemove', event => {
    if (!state.enabled || !document.pointerLockElement || isTypingOrUiOpen()) return;

    const sensitivity = 0.0022 * clamp(state.sensitivity, 0.1, 3);
    state.yaw -= Number(event.movementX || 0) * sensitivity;
    state.pitch -= Number(event.movementY || 0) * sensitivity;
    state.pitch = clamp(state.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}, true);

for (const type of ['mousedown', 'mouseup']) {
    window.addEventListener(type, event => {
        if (!state.enabled || isTypingOrUiOpen()) return;
        if (event.button < 0 || event.button > 2) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }, true);
}

window.addEventListener('wheel', event => {
    if (!state.enabled || isTypingOrUiOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}, { capture: true, passive: false });

window.addEventListener('blur', clearKeys);
document.addEventListener('pointerlockchange', clearKeys);

document.addEventListener(EVENT_ACCESS_REQUEST, () => {
    emitState({ reason: 'ACCESS_CHECK' });
}, false);

document.addEventListener(EVENT_CONFIG, event => {
    const config = parseDetail(event);
    if (!config || typeof config !== 'object') return;

    if (Number.isFinite(Number(config.speed))) state.speed = clamp(config.speed, 1, 30);
    if (Number.isFinite(Number(config.sensitivity))) state.sensitivity = clamp(config.sensitivity, 0.1, 3);
    if (Number.isFinite(Number(config.fastMultiplier))) state.fastMultiplier = clamp(config.fastMultiplier, 1, 8);

    state.configured = true;
    if (typeof config.enabled === 'boolean') setEnabled(config.enabled);
}, false);

function loop(timestamp) {
    if (state.requestedEnabled && !state.enabled && timestamp - state.lastEnableAttempt >= 650) {
        state.lastEnableAttempt = timestamp;
        enable();
    }
    update(timestamp);
    requestAnimationFrame(loop);
}

window.MF_FREECAM = {
    enable,
    disable,
    toggle() { return setEnabled(!state.enabled); },
    canAccess() { return hasFreecamAccess(getGame(true)); },
    get permissionLevel() { return getServerPermissionLevel(getGame(true)); },
    get active() { return state.enabled; },
    get position() { return state.freePosition ? { ...state.freePosition } : null; },
    get camera() { return state.camera; },
    get config() {
        return {
            speed: state.speed,
            sensitivity: state.sensitivity,
            fastMultiplier: state.fastMultiplier
        };
    }
};

requestAnimationFrame(loop);
})();
