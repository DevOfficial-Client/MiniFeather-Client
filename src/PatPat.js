(function () {
'use strict';

const EVENT_CONFIG = 'minifeather:patpat-config';

const DEFAULT_OPTIONS = Object.freeze({
    squishStrength: 73,
    duration: 0.36,
    handMovement: 100,
    pushStrength: 35,
    soundVolume: 36,
    randomSounds: true,
    nameTagFollow: true
});

const state = {
    enabled: false,
    textureUrl: '',
    soundUrls: [],
    options: { ...DEFAULT_OPTIONS },
    game: null,
    entityMap: null,
    camera: null,
    lastGameScan: 0,
    lastEntityScan: 0,
    lastCameraScan: 0,
    activeHands: new Set(),
    squishes: new Map()
};

function sameId(a, b) {
    if (a === undefined || a === null || b === undefined || b === null) return false;
    return String(a) === String(b);
}

function validVec3(value) {
    return !!(
        value &&
        Number.isFinite(Number(value.x)) &&
        Number.isFinite(Number(value.y)) &&
        Number.isFinite(Number(value.z))
    );
}

function getPos(source) {
    const pos = source?.pos || source?.position || source?.mesh?.position;
    if (!validVec3(pos)) return null;
    return {
        x: Number(pos.x),
        y: Number(pos.y),
        z: Number(pos.z)
    };
}

function getGame(force = false) {
    const now = performance.now();
    if (globalThis.miniblox?.player) {
        if (state.game !== globalThis.miniblox) {
            state.game = globalThis.miniblox;
            state.entityMap = null;
            state.camera = null;
        }
        return state.game;
    }
    if (!force && state.game?.player && now - state.lastGameScan < 900) return state.game;
    state.lastGameScan = now;
    try {
        const react = document.querySelector('#react');
        if (!react) return state.game?.player ? state.game : null;
        for (const root of Object.values(react)) {
            const game = root?.updateQueue?.baseState?.element?.props?.game;
            if (!game?.player) continue;
            if (state.game !== game) {
                state.game = game;
                state.entityMap = null;
                state.camera = null;
            }
            return game;
        }
    } catch {}
    return state.game?.player ? state.game : null;
}

function isMapLike(value) {
    return !!(value && typeof value.get === 'function' && typeof value.values === 'function');
}

function looksLikeEntityMap(value) {
    if (!isMapLike(value)) return false;
    let checked = 0;
    let found = 0;
    try {
        for (const entity of value.values()) {
            checked++;
            if (entity && getPos(entity) && (entity.mesh || entity.id !== undefined)) found++;
            if (checked >= 12) break;
        }
    } catch {
        return false;
    }
    return checked > 0 && found > 0;
}

function resolveEntityMap(game) {
    if (state.entityMap && isMapLike(state.entityMap)) return state.entityMap;
    const direct = [
        game?.world?.entitiesDump,
        game?.world?.entities,
        game?.world?.entityMap,
        game?.entityManager?.entities
    ];
    for (const candidate of direct) {
        if (!looksLikeEntityMap(candidate)) continue;
        state.entityMap = candidate;
        return candidate;
    }
    const world = game?.world;
    if (!world) return null;
    const queue = [{ value: world, depth: 0 }];
    const seen = new WeakSet();
    let visited = 0;
    while (queue.length && visited < 360) {
        const current = queue.shift();
        const value = current.value;
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        visited++;
        if (looksLikeEntityMap(value)) {
            state.entityMap = value;
            return value;
        }
        if (current.depth >= 2) continue;
        let keys = [];
        try {
            keys = Object.keys(value);
        } catch {
            continue;
        }
        for (const key of keys) {
            let child;
            try {
                child = value[key];
            } catch {
                continue;
            }
            if (child && typeof child === 'object') queue.push({ value: child, depth: current.depth + 1 });
        }
    }
    return null;
}

function resolveCamera(game) {
    const now = performance.now();
    if (state.camera?.projectionMatrix?.elements?.length >= 16 && state.camera?.matrixWorldInverse?.elements?.length >= 16 && now - state.lastCameraScan < 900) return state.camera;
    state.lastCameraScan = now;
    const direct = [
        game?.gameScene?.camera,
        game?.player?.game?.gameScene?.camera,
        game?.scene?.camera,
        game?.controls?.camera,
        game?.controller?.camera,
        game?.camera
    ];
    for (const camera of direct) {
        if (camera?.projectionMatrix?.elements?.length >= 16 && camera?.matrixWorldInverse?.elements?.length >= 16) {
            state.camera = camera;
            return camera;
        }
    }
    return state.camera;
}

function matrixVec(matrix, x, y, z, w) {
    const e = matrix;
    return {
        x: e[0] * x + e[4] * y + e[8] * z + e[12] * w,
        y: e[1] * x + e[5] * y + e[9] * z + e[13] * w,
        z: e[2] * x + e[6] * y + e[10] * z + e[14] * w,
        w: e[3] * x + e[7] * y + e[11] * z + e[15] * w
    };
}

function project(camera, x, y, z) {
    const view = camera?.matrixWorldInverse?.elements;
    const projection = camera?.projectionMatrix?.elements;
    if (!view || !projection) return null;
    const v = matrixVec(view, x, y, z, 1);
    const c = matrixVec(projection, v.x, v.y, v.z, v.w);
    if (!Number.isFinite(c.w) || c.w <= 0.00001) return null;
    const nx = c.x / c.w;
    const ny = c.y / c.w;
    const nz = c.z / c.w;
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) return null;
    if (nz < -1.2 || nz > 1.2) return null;
    return {
        x: (nx * 0.5 + 0.5) * innerWidth,
        y: (-ny * 0.5 + 0.5) * innerHeight,
        inside: nx >= -1.08 && nx <= 1.08 && ny >= -1.08 && ny <= 1.08
    };
}

function getLookDirection(player) {
    const direct = player?.lookDirection || player?.look || player?.direction;
    if (validVec3(direct)) {
        const length = Math.hypot(Number(direct.x), Number(direct.y), Number(direct.z)) || 1;
        return {
            x: Number(direct.x) / length,
            y: Number(direct.y) / length,
            z: Number(direct.z) / length
        };
    }
    const yaw = Number(player?.yaw);
    const pitch = Number(player?.pitch);
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return null;
    const cp = Math.cos(pitch);
    const x = -Math.sin(yaw) * cp;
    const y = -Math.sin(pitch);
    const z = Math.cos(yaw) * cp;
    const length = Math.hypot(x, y, z) || 1;
    return { x: x / length, y: y / length, z: z / length };
}

function entityHeight(entity) {
    const values = [
        entity?.height,
        entity?.mesh?.oxQYQXZabys,
        entity?.mesh?.height
    ];
    for (const value of values) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0.2 && n < 10) return n;
    }
    return entity?.profile?.username ? 1.8 : 1.4;
}

function entityWidth(entity) {
    const values = [
        entity?.width,
        entity?.mesh?.FARxsHzXsH,
        entity?.mesh?.width
    ];
    for (const value of values) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0.1 && n < 10) return n;
    }
    return entity?.profile?.username ? 0.65 : 0.9;
}

function isLivingTarget(entity, player) {
    if (!entity || entity === player || sameId(entity?.id, player?.id)) return false;
    if (!entity?.mesh || !getPos(entity)) return false;
    if (typeof entity?.profile?.username === 'string') return true;
    try {
        if (typeof entity.getHealth === 'function' && Number.isFinite(Number(entity.getHealth()))) return Number(entity.getHealth()) > 0;
    } catch {}
    const health = Number(entity?.health ?? entity?.currentHealth ?? entity?.hp);
    const maxHealth = Number(entity?.maxHealth ?? entity?.healthMax ?? entity?.maxHp);
    if (Number.isFinite(health) || Number.isFinite(maxHealth)) return !Number.isFinite(health) || health > 0;
    return false;
}

function canSee(player, entity) {
    try {
        if (typeof player?.canEntityBeSeen === 'function') return !!player.canEntityBeSeen(entity);
    } catch {}
    return true;
}

function getNativeMouseEntity(game, player) {
    const sources = [
        game?.controller?.objectMouseOver,
        game?.playerController?.objectMouseOver,
        game?.playerControllerMP?.objectMouseOver,
        player?.controller?.objectMouseOver,
        game?.objectMouseOver,
        player?.objectMouseOver,
        game?.crosshairTarget
    ];
    for (const hit of sources) {
        const entity = hit?.entity || hit?.target || hit?.hitEntity;
        if (isLivingTarget(entity, player) && canSee(player, entity)) return entity;
    }
    return null;
}

function findTarget(game) {
    const player = game?.player;
    const origin = getPos(player);
    const direction = getLookDirection(player);
    if (!origin || !direction) return null;
    const native = getNativeMouseEntity(game, player);
    if (native) return native;
    const entities = resolveEntityMap(game);
    if (!entities) return null;
    const eye = {
        x: origin.x,
        y: origin.y + 1.58,
        z: origin.z
    };
    let best = null;
    let bestScore = Infinity;
    try {
        for (const entity of entities.values()) {
            if (!isLivingTarget(entity, player)) continue;
            const pos = getPos(entity);
            if (!pos) continue;
            const height = entityHeight(entity);
            const width = entityWidth(entity);
            const center = {
                x: pos.x,
                y: pos.y + height * 0.52,
                z: pos.z
            };
            const dx = center.x - eye.x;
            const dy = center.y - eye.y;
            const dz = center.z - eye.z;
            const along = dx * direction.x + dy * direction.y + dz * direction.z;
            if (along < 0.15 || along > 5.0) continue;
            const distanceSq = dx * dx + dy * dy + dz * dz;
            const perpendicularSq = Math.max(0, distanceSq - along * along);
            const radius = Math.max(0.45, width * 0.75, height * 0.22);
            if (perpendicularSq > radius * radius) continue;
            if (!canSee(player, entity)) continue;
            const score = Math.sqrt(perpendicularSq) + along * 0.025;
            if (score >= bestScore) continue;
            bestScore = score;
            best = entity;
        }
    } catch {}
    return best;
}

function swing(game) {
    const candidates = [
        game?.hud3D,
        game?.gameScene?.hud3D,
        game?.player?.hud3D
    ];
    for (const candidate of candidates) {
        try {
            if (typeof candidate?.swingArm === 'function') {
                candidate.swingArm();
                return;
            }
        } catch {}
    }
    try {
        game?.player?.swingItem?.();
    } catch {}
}

function playSound() {
    if (!state.soundUrls.length) return;
    try {
        const random = state.options.randomSounds === true;
        const src = random
            ? state.soundUrls[Math.floor(Math.random() * state.soundUrls.length)]
            : state.soundUrls[0];
        const audio = new Audio(src);
        audio.volume = Math.max(0, Math.min(1, Number(state.options.soundVolume) / 100));
        audio.playbackRate = random ? 0.94 + Math.random() * 0.12 : 1;
        audio.play().catch(() => {});
    } catch {}
}

function setScale(scale, x, y, z) {
    if (!scale) return;
    try {
        if (typeof scale.set === 'function') {
            scale.set(x, y, z);
        } else {
            scale.x = x;
            scale.y = y;
            scale.z = z;
        }
    } catch {}
}

function collectRenderables(root) {
    if (!root) return [];
    const result = [];
    const queue = [root];
    const seen = new Set();
    while (queue.length) {
        const object = queue.shift();
        if (!object || seen.has(object)) continue;
        seen.add(object);
        if (
            object.isMesh === true ||
            object.isSkinnedMesh === true ||
            object.isLine === true ||
            object.isPoints === true ||
            object.geometry
        ) {
            result.push(object);
        }
        if (Array.isArray(object.children)) {
            for (const child of object.children) queue.push(child);
        }
    }
    return result;
}

function restoreSquishScale(record) {
    const mesh = record?.mesh;
    const base = record?.base;
    if (!mesh?.scale || !base) return;
    setScale(mesh.scale, base.x, base.y, base.z);
    try {
        if (mesh.matrixAutoUpdate === false) mesh.updateMatrix?.();
        mesh.updateMatrixWorld?.(true);
    } catch {}
}

function captureSquishBase(record) {
    const scale = record?.mesh?.scale;
    if (!scale) return;
    const x = Number(scale.x);
    const y = Number(scale.y);
    const z = Number(scale.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    record.base.x = x;
    record.base.y = y;
    record.base.z = z;
}

function applySquishScale(record) {
    const mesh = record?.mesh;
    const base = record?.base;
    if (!mesh?.scale || !base) return;
    const factor = Number.isFinite(record.factor) ? record.factor : 1;
    setScale(mesh.scale, base.x, base.y * factor, base.z);
    try {
        if (mesh.matrixAutoUpdate === false) mesh.updateMatrix?.();
        mesh.updateMatrixWorld?.(true);
    } catch {}
}

function capturePushBase(record) {
    const position = record?.mesh?.position;
    if (!position) return;
    const x = Number(position.x);
    const y = Number(position.y);
    const z = Number(position.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    record.basePosition.x = x;
    record.basePosition.y = y;
    record.basePosition.z = z;
}

function restorePushPosition(record) {
    const position = record?.mesh?.position;
    const base = record?.basePosition;
    if (!position || !base) return;
    try {
        if (typeof position.set === 'function') position.set(base.x, base.y, base.z);
        else {
            position.x = base.x;
            position.y = base.y;
            position.z = base.z;
        }
    } catch {}
}

function applyPushPosition(record) {
    const position = record?.mesh?.position;
    const base = record?.basePosition;
    const direction = record?.pushDirection;
    if (!position || !base || !direction) return;
    const amount = Number.isFinite(record.pushAmount) ? record.pushAmount : 0;
    try {
        if (typeof position.set === 'function') {
            position.set(
                base.x + direction.x * amount,
                base.y,
                base.z + direction.z * amount
            );
        } else {
            position.x = base.x + direction.x * amount;
            position.y = base.y;
            position.z = base.z + direction.z * amount;
        }
    } catch {}
}

function installSquishHooks(record) {
    const renderables = collectRenderables(record.mesh);
    for (const object of renderables) {
        const previousBefore = object.onBeforeRender;
        const previousAfter = object.onAfterRender;
        const beforeHook = function (...args) {
            restoreSquishScale(record);
            if (typeof previousBefore === 'function') {
                try {
                    previousBefore.apply(this, args);
                } catch {}
            }
            captureSquishBase(record);
            capturePushBase(record);
            applySquishScale(record);
            applyPushPosition(record);
        };
        const afterHook = function (...args) {
            if (typeof previousAfter === 'function') {
                try {
                    previousAfter.apply(this, args);
                } catch {}
            }
            restorePushPosition(record);
        };
        try {
            object.onBeforeRender = beforeHook;
            object.onAfterRender = afterHook;
            record.hooks.push({ object, previousBefore, previousAfter, beforeHook, afterHook });
        } catch {}
    }
    const mesh = record.mesh;
    const previousNameTagHeight = mesh?.DskCNsFNrprfkz;
    if (typeof previousNameTagHeight === 'function') {
        const hook = function (...args) {
            let height;
            try {
                height = Number(previousNameTagHeight.apply(this, args));
            } catch {
                return previousNameTagHeight.apply(this, args);
            }
            if (!Number.isFinite(height) || state.options.nameTagFollow !== true) return height;
            const factor = Number.isFinite(record.factor) ? record.factor : 1;
            const gap = 0.7;
            return gap + (height - gap) * factor;
        };
        try {
            mesh.DskCNsFNrprfkz = hook;
            record.nameTagHook = { previous: previousNameTagHeight, hook };
        } catch {}
    }
}

function uninstallSquishHooks(record) {
    for (const entry of record?.hooks || []) {
        try {
            if (entry.object.onBeforeRender === entry.beforeHook) {
                entry.object.onBeforeRender = entry.previousBefore;
            }
            if (entry.object.onAfterRender === entry.afterHook) {
                entry.object.onAfterRender = entry.previousAfter;
            }
        } catch {}
    }
    record.hooks.length = 0;
    restorePushPosition(record);
    const mesh = record?.mesh;
    const nameTagHook = record?.nameTagHook;
    if (mesh && nameTagHook) {
        try {
            if (mesh.DskCNsFNrprfkz === nameTagHook.hook) {
                mesh.DskCNsFNrprfkz = nameTagHook.previous;
            }
        } catch {}
        record.nameTagHook = null;
    }
}

function squishCurve(progress) {
    const t = Math.max(0, Math.min(1, progress));
    const eased = 1 - Math.pow(1 - t, 2);
    return Math.sin(Math.PI * eased);
}

function squishFactor(progress) {
    const strength = Math.max(0, Math.min(100, Number(state.options.squishStrength))) / 100;
    return 1 - 0.58 * strength * squishCurve(progress);
}

function squish(entity) {
    const mesh = entity?.mesh;
    if (!mesh?.scale) return;
    const existing = state.squishes.get(entity);
    if (existing) {
        existing.start = performance.now();
        return;
    }
    const x = Number(mesh.scale.x);
    const y = Number(mesh.scale.y);
    const z = Number(mesh.scale.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const entityPos = getPos(entity);
    const playerPos = getPos(getGame(false)?.player);
    let directionX = 0;
    let directionZ = 0;
    if (entityPos && playerPos) {
        const dx = entityPos.x - playerPos.x;
        const dz = entityPos.z - playerPos.z;
        const length = Math.hypot(dx, dz);
        if (length > 0.0001) {
            directionX = dx / length;
            directionZ = dz / length;
        }
    }
    const record = {
        entity,
        mesh,
        start: performance.now(),
        duration: Math.max(200, Math.min(1200, Number(state.options.duration) * 1000)),
        factor: 1,
        pushAmount: 0,
        pushDirection: { x: directionX, z: directionZ },
        base: { x, y, z },
        basePosition: {
            x: Number(mesh.position?.x) || 0,
            y: Number(mesh.position?.y) || 0,
            z: Number(mesh.position?.z) || 0
        },
        hooks: [],
        nameTagHook: null
    };
    state.squishes.set(entity, record);
    installSquishHooks(record);
    const frame = () => {
        if (state.squishes.get(entity) !== record) return;
        const elapsed = performance.now() - record.start;
        const t = Math.min(1, elapsed / record.duration);
        record.factor = squishFactor(t);
        record.pushAmount = 0.55 * Math.max(0, Math.min(100, Number(state.options.pushStrength))) / 100 * squishCurve(t);
        restoreSquishScale(record);
        captureSquishBase(record);
        applySquishScale(record);
        if (t < 1) {
            requestAnimationFrame(frame);
            return;
        }
        record.factor = 1;
        record.pushAmount = 0;
        restoreSquishScale(record);
        restorePushPosition(record);
        uninstallSquishHooks(record);
        state.squishes.delete(entity);
    };
    requestAnimationFrame(frame);
}

function createHand(entity, game) {
    if (!state.textureUrl || !document.body) return;
    const element = document.createElement('div');
    element.className = 'minifeather-patpat-hand';
    element.style.position = 'fixed';
    element.style.width = '150px';
    element.style.height = '112px';
    element.style.zIndex = '2147483000';
    element.style.pointerEvents = 'none';
    element.style.backgroundImage = `url("${state.textureUrl}")`;
    element.style.backgroundRepeat = 'no-repeat';
    element.style.backgroundSize = '500% 100%';
    element.style.imageRendering = 'pixelated';
    element.style.transformOrigin = '50% 80%';
    element.style.willChange = 'left,top,transform,opacity,background-position';
    document.body.appendChild(element);
    const duration = Math.max(184, Math.min(1104, Number(state.options.duration) * 1000 * (330 / 360)));
    const record = { element, entity, game, start: performance.now(), duration };
    state.activeHands.add(record);
    const frame = () => {
        if (!state.activeHands.has(record) || !element.isConnected) return;
        const elapsed = performance.now() - record.start;
        const t = Math.min(1, elapsed / record.duration);
        const currentGame = getGame(false);
        if (!state.enabled || currentGame !== game || !canSee(game.player, entity)) {
            element.style.display = 'none';
        } else {
            const camera = resolveCamera(game);
            const pos = getPos(entity);
            if (!camera || !pos) {
                element.style.display = 'none';
            } else {
                try {
                    camera.updateMatrixWorld?.(true);
                } catch {}
                const squishRecord = state.squishes.get(entity);
                const factor = Number.isFinite(squishRecord?.factor) ? squishRecord.factor : 1;
                const point = project(camera, pos.x, pos.y + entityHeight(entity) * factor + 0.18, pos.z);
                if (!point?.inside) {
                    element.style.display = 'none';
                } else {
                    const frameIndex = Math.min(4, Math.floor(t * 5));
                    const arc = Math.sin(Math.PI * t);
                    const hand = Math.max(0, Math.min(100, Number(state.options.handMovement))) / 100;
                    element.style.display = 'block';
                    element.style.left = `${point.x}px`;
                    element.style.top = `${point.y + arc * 16 * hand}px`;
                    element.style.backgroundPosition = `${frameIndex * 25}% 0%`;
                    element.style.opacity = String(t > 0.82 ? Math.max(0, (1 - t) / 0.18) : 1);
                    element.style.transform = `translate(-50%,-78%) scale(${0.62 + arc * 0.12 * hand}) rotate(${8 - t * 15}deg)`;
                }
            }
        }
        if (t < 1) {
            requestAnimationFrame(frame);
            return;
        }
        state.activeHands.delete(record);
        element.remove();
    };
    requestAnimationFrame(frame);
}

function pat() {
    if (!state.enabled) return false;
    const game = getGame(true);
    if (!game?.player) return false;
    const target = findTarget(game);
    if (!target) return false;
    swing(game);
    squish(target);
    createHand(target, game);
    playSound();
    // P2P: compartir el pat — el otro jugador vera la mano y el squish
    // sobre ESTA entidad (identificada por username o pos)
    try {
        const P2P = globalThis.MF_Peer;
        if (P2P?.status === 'host' || P2P?.status === 'guest') {
            const pos = getPos(target);
            const name = target?.profile?.username || null;
            const from = getPos(game.player);
            if (pos) P2P.sendPat({ target: { x: pos.x, y: pos.y, z: pos.z, name }, from: from ? { x: from.x, y: from.y, z: from.z } : null });
        }
    } catch {}
    // si el objetivo es el peer P2P, ademas "agachar" su camara alla
    return true;
}

// ---- P2P: pat recibido del otro jugador ----
// el otro cliente hizo pat sobre una entidad (posiblemente Y). Reproducir
// el squish + mano localmente sobre esa entidad si la tenemos a la vista.
function remotePat(msg) {
    if (!state.enabled) return;
    const game = getGame(false);
    if (!game?.player) return;
    const tp = msg?.target;
    if (!tp) return;
    // 1) ¿el pat fue para MI? (la pos del objetivo ~= mi pos) → agachar camara
    const me = getPos(game.player);
    if (me) {
        const d = Math.hypot(tp.x - me.x, tp.y - me.y, tp.z - me.z);
        if (d < 1.2) {
            duckCamera(game);
        }
    }
    // 2) buscar la entidad local que coincide (por username o por cercania)
    const entities = resolveEntityMap(game);
    if (!entities) return;
    let target = null;
    try {
        for (const entity of entities.values()) {
            if (!entity?.mesh) continue;
            const name = entity?.profile?.username;
            if (tp.name && name && name.toLowerCase() === String(tp.name).toLowerCase()) { target = entity; break; }
            const pos = getPos(entity);
            if (pos && Math.hypot(pos.x - tp.x, pos.y - tp.y, pos.z - tp.z) < 1.5) { target = entity; break; }
        }
    } catch {}
    if (!target) return;
    // mano + squish sobre la entidad encontrada (swing no: no es nuestro brazo)
    squish(target);
    createHand(target, game);
    playSound();
}

// "agachar" la camara del que recibio el pat: bajar el rig (yawObject)
// con un impulso suave tipo "le apretaron la cabecita"
function duckCamera(game) {
    try {
        const camera = resolveCamera(game);
        if (!camera?.parent?.parent) return;
        const yawObject = camera.parent.parent;
        const baseY = yawObject.position.y;
        const start = performance.now();
        const DURATION = 420;
        const DROP = 0.28; // bloques que "baja" la camara
        const frame = () => {
            const t = Math.min(1, (performance.now() - start) / DURATION);
            // curva: baja rapido, sube suave (squish invertido)
            const dip = Math.sin(Math.PI * t) * DROP;
            yawObject.position.y = baseY - dip;
            if (t < 1) requestAnimationFrame(frame);
            else yawObject.position.y = baseY;
        };
        requestAnimationFrame(frame);
        playSound();
    } catch {}
}

function clearVisuals() {
    for (const record of Array.from(state.activeHands)) {
        state.activeHands.delete(record);
        try {
            record.element.remove();
        } catch {}
    }
    for (const [entity, record] of Array.from(state.squishes.entries())) {
        record.factor = 1;
        restoreSquishScale(record);
        uninstallSquishHooks(record);
        state.squishes.delete(entity);
    }
}

function setEnabled(value) {
    state.enabled = !!value;
    if (!state.enabled) clearVisuals();
}

function applyConfig(detail) {
    let config = detail;
    if (typeof config === 'string') {
        try {
            config = JSON.parse(config);
        } catch {
            return;
        }
    }
    if (!config || typeof config !== 'object') return;
    if (typeof config.textureUrl === 'string') state.textureUrl = config.textureUrl;
    if (Array.isArray(config.soundUrls)) state.soundUrls = config.soundUrls.filter(value => typeof value === 'string' && value.length);
    if (config.options && typeof config.options === 'object') {
        const next = config.options;
        const squishStrength = Number(next.squishStrength);
        const duration = Number(next.duration);
        const handMovement = Number(next.handMovement);
        const pushStrength = Number(next.pushStrength);
        const soundVolume = Number(next.soundVolume);
        if (Number.isFinite(squishStrength)) state.options.squishStrength = Math.max(0, Math.min(100, squishStrength));
        if (Number.isFinite(duration)) state.options.duration = Math.max(0.2, Math.min(1.2, duration));
        if (Number.isFinite(handMovement)) state.options.handMovement = Math.max(0, Math.min(100, handMovement));
        if (Number.isFinite(pushStrength)) state.options.pushStrength = Math.max(0, Math.min(100, pushStrength));
        if (Number.isFinite(soundVolume)) state.options.soundVolume = Math.max(0, Math.min(100, soundVolume));
        if (typeof next.randomSounds === 'boolean') state.options.randomSounds = next.randomSounds;
        if (typeof next.nameTagFollow === 'boolean') state.options.nameTagFollow = next.nameTagFollow;
    }
    if ('enabled' in config) setEnabled(config.enabled);
}

function editableTarget(target) {
    const tag = target?.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
}

function onMouseDown(event) {
    if (!state.enabled || event.button !== 2 || !event.shiftKey || editableTarget(event.target)) return;
    if (!pat()) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
}

function onContextMenu(event) {
    if (!state.enabled || !event.shiftKey || editableTarget(event.target)) return;
    const game = getGame(false);
    if (!game?.player || !findTarget(game)) return;
    event.preventDefault();
    event.stopPropagation();
}

document.addEventListener(EVENT_CONFIG, event => applyConfig(event.detail), true);
document.addEventListener('mousedown', onMouseDown, true);
document.addEventListener('contextmenu', onContextMenu, true);

globalThis.MiniFeatherPatPat = {
    setEnabled,
    pat,
    remotePat,
    get enabled() {
        return state.enabled;
    },
    get options() {
        return { ...state.options };
    }
};
})();
