(function () {
'use strict';

const EVENT_CONFIG = 'minifeather:patpat-config';

const state = {
    enabled: false,
    textureUrl: '',
    soundUrls: [],
    game: null,
    entityMap: null,
    camera: null,
    lastGameScan: 0,
    lastEntityScan: 0,
    lastCameraScan: 0,
    cooldownUntil: 0,
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
        const src = state.soundUrls[Math.floor(Math.random() * state.soundUrls.length)];
        const audio = new Audio(src);
        audio.volume = 0.36;
        audio.playbackRate = 0.94 + Math.random() * 0.12;
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

function installSquishHooks(record) {
    const renderables = collectRenderables(record.mesh);
    for (const object of renderables) {
        const previous = object.onBeforeRender;
        const hook = function (...args) {
            restoreSquishScale(record);
            if (typeof previous === 'function') {
                try {
                    previous.apply(this, args);
                } catch {}
            }
            captureSquishBase(record);
            applySquishScale(record);
        };
        try {
            object.onBeforeRender = hook;
            record.hooks.push({ object, previous, hook });
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
            if (!Number.isFinite(height)) return height;
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
            if (entry.object.onBeforeRender === entry.hook) {
                entry.object.onBeforeRender = entry.previous;
            }
        } catch {}
    }
    record.hooks.length = 0;
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

function squishFactor(progress) {
    const t = Math.max(0, Math.min(1, progress));
    const eased = 1 - Math.pow(1 - t, 2);
    return 1 - 0.425 * Math.sin(Math.PI * eased);
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
    const record = {
        entity,
        mesh,
        start: performance.now(),
        duration: 360,
        factor: 1,
        base: { x, y, z },
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
        restoreSquishScale(record);
        captureSquishBase(record);
        applySquishScale(record);
        if (t < 1) {
            requestAnimationFrame(frame);
            return;
        }
        record.factor = 1;
        restoreSquishScale(record);
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
    const record = { element, entity, game, start: performance.now(), duration: 330 };
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
                    element.style.display = 'block';
                    element.style.left = `${point.x}px`;
                    element.style.top = `${point.y + arc * 16}px`;
                    element.style.backgroundPosition = `${frameIndex * 25}% 0%`;
                    element.style.opacity = String(t > 0.82 ? Math.max(0, (1 - t) / 0.18) : 1);
                    element.style.transform = `translate(-50%,-78%) scale(${0.62 + arc * 0.12}) rotate(${8 - t * 15}deg)`;
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
    if (!state.enabled || performance.now() < state.cooldownUntil) return false;
    const game = getGame(true);
    if (!game?.player) return false;
    const target = findTarget(game);
    if (!target) return false;
    state.cooldownUntil = performance.now() + 180;
    swing(game);
    squish(target);
    createHand(target, game);
    playSound();
    return true;
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
    state.cooldownUntil = 0;
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
    get enabled() {
        return state.enabled;
    }
};
})();
