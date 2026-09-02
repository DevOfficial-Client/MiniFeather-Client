(function () {
'use strict';

const EVENT_CONFIG = 'minifeather:item-physics-config';

const CONFIG = Object.freeze({
    scanInterval: 120,
    maxItems: 240,
    airAngularDrag: 0.52,
    flatAirAngularDrag: 0.82,
    waterAngularDrag: 3.8,
    lavaAngularDrag: 5.6,
    groundAngularDrag: 8.2,
    flatGroundAngularDrag: 13.5,
    groundSettle: 13.5,
    flatGroundSettle: 20.0,
    landingBounceMin: 0.012,
    landingBounceMax: 0.095,
    landingBounceFrequency: 18.0,
    landingBounceDecay: 9.6,
    landingSpinTransfer: 2.0,
    wallSpinTransfer: 2.8,
    wallSpinDamping: 0.52,
    movementSpinTransfer: 2.25,
    maxAngularSpeed: 9.5,
    flatMaxAngularSpeed: 6.4,
    collisionEpsilon: 0.00001,
    restSpeed: 0.012,
    restVerticalSpeed: 0.008,
    flatRatio: 0.2,
    slenderRatio: 0.38,
    groundMargin: 0.012
});

const state = {
    enabled: false,
    game: null,
    entities: null,
    lastGameScan: 0,
    lastScan: 0,
    lastFrame: performance.now(),
    items: new Map()
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const damp = (current, target, rate, dt) => target + (current - target) * Math.exp(-Math.max(0, rate) * Math.max(0, dt));
const randomRange = (min, max) => min + Math.random() * (max - min);
const wrapAngle = value => {
    const tau = Math.PI * 2;
    value %= tau;
    return value < -Math.PI ? value + tau : value > Math.PI ? value - tau : value;
};

function validVec3(value) {
    return !!(
        value &&
        Number.isFinite(Number(value.x)) &&
        Number.isFinite(Number(value.y)) &&
        Number.isFinite(Number(value.z))
    );
}

function setEuler(rotation, x, y, z, order) {
    if (!rotation) return;
    try {
        if (typeof rotation.set === 'function') rotation.set(x, y, z, order || rotation.order || 'XYZ');
        else {
            rotation.x = x;
            rotation.y = y;
            rotation.z = z;
            if (order && 'order' in rotation) rotation.order = order;
        }
    } catch {}
}

function getGame(force = false) {
    const now = performance.now();

    if (globalThis.miniblox?.player) {
        if (state.game !== globalThis.miniblox) {
            resetAll();
            state.game = globalThis.miniblox;
            state.entities = null;
        }
        return state.game;
    }

    if (!force && state.game?.player && now - state.lastGameScan < 1000) return state.game;
    state.lastGameScan = now;

    try {
        const react = document.querySelector('#react');
        if (!react) return state.game?.player ? state.game : null;

        for (const root of Object.values(react)) {
            const game = root?.updateQueue?.baseState?.element?.props?.game;
            if (!game?.player || !game?.world) continue;

            if (state.game !== game) {
                resetAll();
                state.game = game;
                state.entities = null;
            }

            return game;
        }
    } catch {}

    return state.game?.player ? state.game : null;
}

function isMapLike(value) {
    return !!(value && typeof value.values === 'function' && typeof value.get === 'function');
}

function looksLikeEntityMap(value) {
    if (!isMapLike(value)) return false;
    let checked = 0;
    let valid = 0;

    try {
        for (const entity of value.values()) {
            checked++;
            if (entity?.pos && validVec3(entity.pos)) valid++;
            if (checked >= 14) break;
        }
    } catch {
        return false;
    }

    return checked > 0 && valid > 0;
}

function resolveEntities(game) {
    if (state.entities && isMapLike(state.entities)) return state.entities;

    const direct = [
        game?.world?.entitiesDump,
        game?.world?.entities,
        game?.world?.entityMap,
        game?.entityManager?.entities
    ];

    for (const candidate of direct) {
        if (!looksLikeEntityMap(candidate)) continue;
        state.entities = candidate;
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
            state.entities = value;
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

function isDroppedItem(entity, game) {
    if (!entity?.mesh || !validVec3(entity.pos)) return false;
    if (entity === game?.player || String(entity?.id) === String(game?.player?.id)) return false;
    if (entity.mesh?.constructor?.name === 'Cje') return true;
    return typeof entity.getEntityItem === 'function' && !!entity.mesh?.inner;
}

function rawMotion(entity) {
    const source = entity?.motion || entity?.velocity;
    if (!validVec3(source)) return { x: 0, y: 0, z: 0 };
    return {
        x: Number(source.x),
        y: Number(source.y),
        z: Number(source.z)
    };
}

function moveVectors(entity) {
    const requested = validVec3(entity?._moveSaved) ? entity._moveSaved : null;
    const actual = validVec3(entity?._moveDelta) ? entity._moveDelta : null;

    if (!requested || !actual) {
        return {
            x: false,
            y: false,
            z: false,
            requested: null,
            actual: null
        };
    }

    return {
        x: Math.abs(Number(requested.x) - Number(actual.x)) > CONFIG.collisionEpsilon,
        y: Math.abs(Number(requested.y) - Number(actual.y)) > CONFIG.collisionEpsilon,
        z: Math.abs(Number(requested.z) - Number(actual.z)) > CONFIG.collisionEpsilon,
        requested: {
            x: Number(requested.x),
            y: Number(requested.y),
            z: Number(requested.z)
        },
        actual: {
            x: Number(actual.x),
            y: Number(actual.y),
            z: Number(actual.z)
        }
    };
}

function readCollision(entity) {
    const axes = moveVectors(entity);
    const horizontal = entity?.isCollidedHorizontally === true;
    const vertical = entity?.isCollidedVertically === true;

    return {
        x: axes.x || (horizontal && !axes.z),
        y: axes.y || vertical,
        z: axes.z || (horizontal && !axes.x),
        horizontal,
        vertical,
        grounded: entity?.onGround === true,
        requested: axes.requested,
        actual: axes.actual
    };
}

function isBlockItem(entity) {
    try {
        const stack = entity.getEntityItem?.();
        const item = stack?.item;
        if (!item) return false;
        if (typeof item.drawAsBlock === 'function' && item.drawAsBlock()) return true;
        if (typeof item.isItemBlock === 'function' && item.isItemBlock()) return true;
    } catch {}
    return false;
}

function measureVisual(inner) {
    if (!inner?.matrix || typeof inner.matrix.clone !== 'function') return null;

    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    let found = false;
    let identity;

    try {
        identity = inner.matrix.clone();
        identity.identity?.();
    } catch {
        return null;
    }

    function include(x, y, z) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        min.x = Math.min(min.x, x);
        min.y = Math.min(min.y, y);
        min.z = Math.min(min.z, z);
        max.x = Math.max(max.x, x);
        max.y = Math.max(max.y, y);
        max.z = Math.max(max.z, z);
        found = true;
    }

    function visit(object, parentMatrix, depth) {
        if (!object || depth > 8) return;

        let matrix = parentMatrix;

        if (object !== inner) {
            try {
                object.updateMatrix?.();
                matrix = parentMatrix.clone().multiply(object.matrix);
            } catch {
                matrix = parentMatrix;
            }
        }

        const geometry = object.geometry;

        if (geometry) {
            try {
                if (!geometry.boundingBox && typeof geometry.computeBoundingBox === 'function') geometry.computeBoundingBox();
                const box = geometry.boundingBox;

                if (box?.min && box?.max && typeof box.min.clone === 'function') {
                    const xs = [box.min.x, box.max.x];
                    const ys = [box.min.y, box.max.y];
                    const zs = [box.min.z, box.max.z];

                    for (const x of xs) {
                        for (const y of ys) {
                            for (const z of zs) {
                                const point = box.min.clone();
                                point.set(x, y, z);
                                point.applyMatrix4(matrix);
                                include(point.x, point.y, point.z);
                            }
                        }
                    }
                }
            } catch {}
        }

        for (const child of object.children || []) visit(child, matrix, depth + 1);
    }

    visit(inner, identity, 0);
    if (!found) return null;

    const size = {
        x: Math.max(0.0001, max.x - min.x),
        y: Math.max(0.0001, max.y - min.y),
        z: Math.max(0.0001, max.z - min.z)
    };

    const axes = [
        { axis: 'x', size: size.x },
        { axis: 'y', size: size.y },
        { axis: 'z', size: size.z }
    ].sort((a, b) => a.size - b.size);

    return {
        min,
        max,
        size,
        thinAxis: axes[0].axis,
        minSize: axes[0].size,
        midSize: axes[1].size,
        maxSize: axes[2].size
    };
}

function getItemProfile(entity, inner) {
    const bounds = measureVisual(inner);

    if (isBlockItem(entity)) {
        return {
            kind: 'block',
            bounds,
            thinAxis: bounds?.thinAxis || 'y',
            thickness: bounds?.minSize || 0.5
        };
    }

    if (!bounds) {
        return {
            kind: 'flat',
            bounds: null,
            thinAxis: 'z',
            thickness: 0.03
        };
    }

    const flatness = bounds.minSize / bounds.maxSize;
    const slenderness = bounds.midSize / bounds.maxSize;
    const kind = flatness <= CONFIG.flatRatio
        ? (slenderness <= CONFIG.slenderRatio ? 'thin' : 'flat')
        : 'solid';

    return {
        kind,
        bounds,
        thinAxis: bounds.thinAxis,
        thickness: bounds.minSize
    };
}

function nearestQuarter(angle) {
    const q = Math.PI / 2;
    return Math.round(angle / q) * q;
}

function angleDistance(a, b) {
    return Math.abs(wrapAngle(a - b));
}

function flatRestCandidates(axis) {
    if (axis === 'x') {
        return [
            { x: 0, y: 0, z: Math.PI / 2, side: 1 },
            { x: 0, y: 0, z: -Math.PI / 2, side: -1 }
        ];
    }

    if (axis === 'y') {
        return [
            { x: 0, y: 0, z: 0, side: 1 },
            { x: Math.PI, y: 0, z: 0, side: -1 }
        ];
    }

    return [
        { x: Math.PI / 2, y: 0, z: 0, side: 1 },
        { x: -Math.PI / 2, y: 0, z: 0, side: -1 }
    ];
}

function flatRestHeight(profile, target) {
    const bounds = profile?.bounds;
    if (!bounds) return Math.max(CONFIG.groundMargin, profile?.thickness * 0.5 + CONFIG.groundMargin || 0.025);

    if (profile.thinAxis === 'x') {
        return target.side > 0
            ? Math.max(CONFIG.groundMargin, -bounds.min.x + CONFIG.groundMargin)
            : Math.max(CONFIG.groundMargin, bounds.max.x + CONFIG.groundMargin);
    }

    if (profile.thinAxis === 'y') {
        return target.side > 0
            ? Math.max(CONFIG.groundMargin, -bounds.min.y + CONFIG.groundMargin)
            : Math.max(CONFIG.groundMargin, bounds.max.y + CONFIG.groundMargin);
    }

    return target.side > 0
        ? Math.max(CONFIG.groundMargin, bounds.max.z + CONFIG.groundMargin)
        : Math.max(CONFIG.groundMargin, -bounds.min.z + CONFIG.groundMargin);
}

function makeGroundTarget(item) {
    const kind = item.profile.kind;

    if (kind === 'block' || kind === 'solid') {
        item.groundX = nearestQuarter(item.rotX);
        item.groundY = nearestQuarter(item.rotY);
        item.groundZ = nearestQuarter(item.rotZ);
        item.restY = item.basePosition.y;
        return;
    }

    const candidates = flatRestCandidates(item.profile.thinAxis);
    let target = candidates[0];
    let best = Infinity;

    for (const candidate of candidates) {
        const distance = angleDistance(item.rotX, candidate.x) + angleDistance(item.rotZ, candidate.z);
        if (distance < best) {
            best = distance;
            target = candidate;
        }
    }

    item.groundX = target.x;
    item.groundY = 0;
    item.groundZ = target.z;
    item.restY = flatRestHeight(item.profile, target);
}

function applyVisual(item) {
    const inner = item.inner;
    if (!inner) return;

    setEuler(
        inner.rotation,
        item.baseRotation.x + item.rotX,
        item.baseRotation.y + item.rotY,
        item.baseRotation.z + item.rotZ,
        item.baseRotation.order
    );

    if (inner.position) {
        inner.position.x = item.basePosition.x;
        inner.position.y = item.visualY;
        inner.position.z = item.basePosition.z;
    }

    try {
        inner.updateMatrix?.();
        inner.updateMatrixWorld?.(true);
    } catch {}
}

function installRenderHook(item) {
    const root = item.root;
    if (!root || typeof root.render !== 'function') return false;

    const original = root.render;

    const wrapped = function (...args) {
        const result = original.apply(this, args);
        if (state.enabled && item.root === this && item.entity?.mesh === this) applyVisual(item);
        return result;
    };

    item.originalRender = original;
    item.renderHook = wrapped;
    root.render = wrapped;
    return true;
}

function restoreItem(item) {
    const root = item.root;

    try {
        if (root?.render === item.renderHook) root.render = item.originalRender;
    } catch {}

    if (item.inner) {
        setEuler(
            item.inner.rotation,
            item.nativeRotation.x,
            item.nativeRotation.y,
            item.nativeRotation.z,
            item.nativeRotation.order
        );

        try {
            item.inner.position.x = item.nativePosition.x;
            item.inner.position.y = item.nativePosition.y;
            item.inner.position.z = item.nativePosition.z;
        } catch {}
    }
}

function createItem(entity) {
    const root = entity?.mesh;
    const inner = root?.inner;

    if (!root || !inner || !inner.rotation || !inner.position || typeof root.render !== 'function') return null;

    const motion = rawMotion(entity);
    const grounded = entity.onGround === true;
    const profile = getItemProfile(entity, inner);
    const direction = Math.random() < 0.5 ? -1 : 1;

    const item = {
        entity,
        root,
        inner,
        profile,
        originalRender: null,
        renderHook: null,
        nativeRotation: {
            x: Number(inner.rotation.x) || 0,
            y: Number(inner.rotation.y) || 0,
            z: Number(inner.rotation.z) || 0,
            order: inner.rotation.order || 'XYZ'
        },
        nativePosition: {
            x: Number(inner.position.x) || 0,
            y: Number(inner.position.y) || 0,
            z: Number(inner.position.z) || 0
        },
        baseRotation: {
            x: 0,
            y: 0,
            z: 0,
            order: inner.rotation.order || 'XYZ'
        },
        basePosition: {
            x: Number(inner.position.x) || 0,
            y: 0.25,
            z: Number(inner.position.z) || 0
        },
        rotX: randomRange(-0.15, 0.15),
        rotY: profile.kind === 'flat' || profile.kind === 'thin' ? 0 : Math.random() * Math.PI * 2,
        rotZ: randomRange(-0.15, 0.15),
        angularX: randomRange(1.5, 3.4) * (Math.random() < 0.5 ? -1 : 1),
        angularY: randomRange(0.7, 1.8) * direction,
        angularZ: randomRange(1.0, 2.7) * (Math.random() < 0.5 ? -1 : 1),
        groundX: 0,
        groundY: 0,
        groundZ: 0,
        restY: 0.25,
        visualY: Number(inner.position.y) || 0.25,
        bounceY: 0,
        landingTime: -Infinity,
        landingAmplitude: 0,
        wasGrounded: grounded,
        wasHorizontalCollision: entity.isCollidedHorizontally === true,
        wasVerticalCollision: entity.isCollidedVertically === true,
        previousMotion: motion,
        fallPeak: Math.max(0, -motion.y),
        lastCollisionAt: -Infinity
    };

    makeGroundTarget(item);
    if (grounded && (profile.kind === 'flat' || profile.kind === 'thin')) {
        item.rotX = item.groundX;
        item.rotY = item.groundY;
        item.rotZ = item.groundZ;
        item.angularX = 0;
        item.angularY = 0;
        item.angularZ = 0;
        item.visualY = item.restY;
    }
    if (!installRenderHook(item)) return null;
    return item;
}

function registerLanding(item, now, motion) {
    const impact = clamp(Math.max(item.fallPeak, Math.abs(item.previousMotion.y), Math.abs(motion.y)), 0, 1.5);
    const strength = clamp(impact / 0.8, 0.12, 1);

    item.landingTime = now;
    const flatLike = item.profile.kind === 'flat' || item.profile.kind === 'thin';
    const bounceScale = flatLike ? 0.48 : 1;
    item.landingAmplitude = (CONFIG.landingBounceMin + (CONFIG.landingBounceMax - CONFIG.landingBounceMin) * strength) * bounceScale;

    const horizontal = Math.hypot(item.previousMotion.x, item.previousMotion.z);
    if (horizontal > 0.002) {
        const nx = item.previousMotion.x / horizontal;
        const nz = item.previousMotion.z / horizontal;
        item.angularX += nz * CONFIG.landingSpinTransfer * strength;
        item.angularZ -= nx * CONFIG.landingSpinTransfer * strength;
    }

    const retainXZ = flatLike ? 0.24 : 0.58;
    const retainY = flatLike ? 0.18 : 0.72;
    item.angularX *= retainXZ;
    item.angularY *= retainY;
    item.angularZ *= retainXZ;
    item.fallPeak = 0;
    makeGroundTarget(item);
}

function registerWallCollision(item, collision, now) {
    if (now - item.lastCollisionAt < 0.045) return;
    item.lastCollisionAt = now;

    const source = collision.requested || item.previousMotion;
    const sx = Number(source?.x) || item.previousMotion.x;
    const sz = Number(source?.z) || item.previousMotion.z;
    const horizontal = Math.hypot(sx, sz);
    const strength = clamp(horizontal * 5.2, 0.18, 1);

    if (collision.x) {
        item.angularZ += Math.sign(sx || 1) * CONFIG.wallSpinTransfer * strength;
        item.angularY *= -CONFIG.wallSpinDamping;
    }

    if (collision.z) {
        item.angularX -= Math.sign(sz || 1) * CONFIG.wallSpinTransfer * strength;
        item.angularY *= -CONFIG.wallSpinDamping;
    }

    if (!collision.x && !collision.z) {
        item.angularX *= -CONFIG.wallSpinDamping;
        item.angularZ *= -CONFIG.wallSpinDamping;
        item.angularY *= -CONFIG.wallSpinDamping;
    }

    item.angularX = clamp(item.angularX, -CONFIG.maxAngularSpeed, CONFIG.maxAngularSpeed);
    item.angularY = clamp(item.angularY, -CONFIG.maxAngularSpeed, CONFIG.maxAngularSpeed);
    item.angularZ = clamp(item.angularZ, -CONFIG.maxAngularSpeed, CONFIG.maxAngularSpeed);
}

function updateAir(item, motion, dt) {
    const horizontal = Math.hypot(motion.x, motion.z);
    const flatLike = item.profile.kind === 'flat' || item.profile.kind === 'thin';
    const baseAirDrag = flatLike ? CONFIG.flatAirAngularDrag : CONFIG.airAngularDrag;
    const dragRate = item.entity.inWater ? CONFIG.waterAngularDrag : item.entity.inLava ? CONFIG.lavaAngularDrag : baseAirDrag;
    const drag = Math.exp(-dragRate * dt);

    item.angularX *= drag;
    item.angularY *= drag;
    item.angularZ *= drag;

    if (horizontal > 0.004) {
        const nx = motion.x / horizontal;
        const nz = motion.z / horizontal;
        const transfer = CONFIG.movementSpinTransfer * clamp(horizontal * 3.2, 0.25, 1.5);
        item.angularX += nz * transfer * dt;
        item.angularZ -= nx * transfer * dt;
    }

    if (motion.y < -CONFIG.restVerticalSpeed) {
        const fall = clamp(-motion.y * 1.4, 0, 1.4);
        item.angularX += Math.sign(item.angularX || 1) * fall * 0.42 * dt;
        item.angularZ += Math.sign(item.angularZ || -1) * fall * 0.34 * dt;
        item.fallPeak = Math.max(item.fallPeak, -motion.y);
    }

    if (item.entity.inWater || item.entity.inLava) {
        item.angularY += Math.sin(performance.now() * 0.0018 + Number(item.entity.id || 0)) * 0.15 * dt;
    }

    const maxAngular = flatLike ? CONFIG.flatMaxAngularSpeed : CONFIG.maxAngularSpeed;
    item.angularX = clamp(item.angularX, -maxAngular, maxAngular);
    item.angularY = clamp(item.angularY, -maxAngular, maxAngular);
    item.angularZ = clamp(item.angularZ, -maxAngular, maxAngular);

    item.rotX = wrapAngle(item.rotX + item.angularX * dt);
    item.rotY = wrapAngle(item.rotY + item.angularY * dt);
    item.rotZ = wrapAngle(item.rotZ + item.angularZ * dt);
    item.bounceY = damp(item.bounceY, 0, 12, dt);
    item.visualY = damp(item.visualY, item.basePosition.y, 9.5, dt);
}

function updateGround(item, motion, now, dt) {
    const horizontal = Math.hypot(motion.x, motion.z);
    const moving = horizontal > CONFIG.restSpeed;
    const flatLike = item.profile.kind === 'flat' || item.profile.kind === 'thin';

    if (!flatLike && moving) {
        const nx = motion.x / horizontal;
        const nz = motion.z / horizontal;
        const roll = clamp(horizontal * 5.5, 0, 1.7);
        item.angularX += nz * roll * 0.7 * dt;
        item.angularZ -= nx * roll * 0.7 * dt;
    }

    const dragRate = flatLike ? CONFIG.flatGroundAngularDrag : CONFIG.groundAngularDrag;
    const angularDrag = Math.exp(-dragRate * dt);
    item.angularX *= angularDrag;
    item.angularY *= angularDrag;
    item.angularZ *= angularDrag;

    if (!flatLike || moving) {
        item.rotX = wrapAngle(item.rotX + item.angularX * dt);
        item.rotY = wrapAngle(item.rotY + item.angularY * dt);
        item.rotZ = wrapAngle(item.rotZ + item.angularZ * dt);
    }

    const settleRate = flatLike ? CONFIG.flatGroundSettle : CONFIG.groundSettle;
    const shouldSettle = flatLike || !moving;

    if (shouldSettle) {
        item.rotX = damp(item.rotX, item.groundX, settleRate, dt);
        item.rotZ = damp(item.rotZ, item.groundZ, settleRate, dt);
        item.rotY = damp(item.rotY, item.groundY, settleRate * (flatLike ? 0.9 : 0.72), dt);

        const zeroThreshold = flatLike ? 0.025 : 0.015;
        if (Math.abs(item.angularX) < zeroThreshold) item.angularX = 0;
        if (Math.abs(item.angularY) < zeroThreshold) item.angularY = 0;
        if (Math.abs(item.angularZ) < zeroThreshold) item.angularZ = 0;
    }

    const elapsed = Math.max(0, now - item.landingTime);
    const decay = Number.isFinite(item.landingTime) ? Math.exp(-elapsed * CONFIG.landingBounceDecay) : 0;
    item.bounceY = decay > 0.0001
        ? Math.abs(Math.sin(elapsed * CONFIG.landingBounceFrequency)) * decay * item.landingAmplitude
        : 0;

    const targetY = item.restY + item.bounceY;
    item.visualY = damp(item.visualY, targetY, flatLike ? 22 : 14, dt);
}

function updateItem(item, timestamp, dt) {
    const entity = item.entity;
    const root = item.root;

    if (!entity || !root || entity.mesh !== root || !root.parent || root.inner !== item.inner) return false;

    if (root.render !== item.renderHook) {
        item.originalRender = root.render;
        if (!installRenderHook(item)) return false;
    }

    const now = timestamp / 1000;
    const motion = rawMotion(entity);
    const collision = readCollision(entity);
    const grounded = collision.grounded;

    if (!grounded) item.fallPeak = Math.max(item.fallPeak, Math.max(0, -motion.y));

    if (grounded && !item.wasGrounded) registerLanding(item, now, motion);

    const horizontalHit = collision.horizontal && (!item.wasHorizontalCollision || collision.x || collision.z);
    if (horizontalHit) registerWallCollision(item, collision, now);

    if (grounded) updateGround(item, motion, now, dt);
    else updateAir(item, motion, dt);

    item.wasGrounded = grounded;
    item.wasHorizontalCollision = collision.horizontal;
    item.wasVerticalCollision = collision.vertical;
    item.previousMotion = motion;
    return true;
}

function unregisterItem(entity, item) {
    restoreItem(item);
    state.items.delete(entity);
}

function scanItems() {
    const game = getGame();
    if (!game) return;

    const entities = resolveEntities(game);
    if (!entities) return;

    const live = new Set();

    try {
        for (const entity of entities.values()) {
            if (!isDroppedItem(entity, game)) continue;
            live.add(entity);

            const existing = state.items.get(entity);
            if (existing) {
                if (existing.root !== entity.mesh || existing.inner !== entity.mesh?.inner) unregisterItem(entity, existing);
                else continue;
            }

            if (state.items.size >= CONFIG.maxItems) continue;
            const item = createItem(entity);
            if (item) state.items.set(entity, item);
        }
    } catch {}

    for (const [entity, item] of Array.from(state.items.entries())) {
        if (!live.has(entity) || !item.root?.parent) unregisterItem(entity, item);
    }
}

function resetAll() {
    for (const [entity, item] of Array.from(state.items.entries())) unregisterItem(entity, item);
    state.items.clear();
}

function setEnabled(enabled) {
    const next = !!enabled;
    if (state.enabled === next) return;
    state.enabled = next;
    if (!next) resetAll();
}

document.addEventListener(EVENT_CONFIG, event => {
    let detail = event?.detail;
    if (typeof detail === 'string') {
        try {
            detail = JSON.parse(detail);
        } catch {
            detail = null;
        }
    }
    setEnabled(detail?.enabled === true);
});

function loop(timestamp) {
    const rawDt = (timestamp - state.lastFrame) / 1000;
    const dt = clamp(Number.isFinite(rawDt) ? rawDt : 1 / 60, 1 / 240, 0.05);
    state.lastFrame = timestamp;

    if (state.enabled) {
        if (timestamp - state.lastScan >= CONFIG.scanInterval) {
            state.lastScan = timestamp;
            scanItems();
        }

        for (const [entity, item] of Array.from(state.items.entries())) {
            if (!updateItem(item, timestamp, dt)) unregisterItem(entity, item);
        }
    }

    requestAnimationFrame(loop);
}

globalThis.MiniFeatherItemPhysics = {
    enable() {
        setEnabled(true);
    },
    disable() {
        setEnabled(false);
    },
    get enabled() {
        return state.enabled;
    },
    get count() {
        return state.items.size;
    }
};

requestAnimationFrame(loop);
})();
