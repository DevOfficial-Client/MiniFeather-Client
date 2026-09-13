(() => {
    'use strict';

    const EVENT_CONFIG = 'minifeather:better-animation-cape-config';
    const DEPTH_SCALE = 0.64;
    const BACK_OFFSET = 0.060;
    const COLLISION_GAP = 0.026;
    const SEGMENTS = 10;
    const BODY_PARTS = [
        'head',
        'torso',
        'rightArmTop', 'rightArmBottom',
        'leftArmTop', 'leftArmBottom',
        'rightLegTop', 'rightLegBottom',
        'leftLegTop', 'leftLegBottom'
    ];

    const state = {
        enabled: false,
        game: null,
        scanAt: 0,
        hooks: new Map(),
        capes: new Map()
    };

    function isGame(value) {
        return !!(value && typeof value === 'object' && value.player && value.world);
    }

    function findGame() {
        for (const candidate of [globalThis.miniblox, globalThis.__MINIBLOX_GAME__, state.game]) {
            if (isGame(candidate)) return (state.game = candidate);
        }

        try {
            const react = document.querySelector('#react');
            if (!react) return null;
            for (const root of Object.values(react)) {
                const game = root?.updateQueue?.baseState?.element?.props?.game;
                if (isGame(game)) {
                    globalThis.__MINIBLOX_GAME__ = game;
                    return (state.game = game);
                }
            }
        } catch {}
        return null;
    }

    function addEntity(out, seen, entity) {
        if (!entity || typeof entity !== 'object' || !entity.mesh || seen.has(entity)) return;
        seen.add(entity);
        out.push(entity);
    }

    function collectPlayerEntities(game) {
        const out = [];
        const seen = new WeakSet();

        const pushIterable = value => {
            try {
                if (value?.values) {
                    for (const entity of value.values()) addEntity(out, seen, entity);
                } else if (Array.isArray(value)) {
                    for (const entity of value) addEntity(out, seen, entity);
                }
            } catch {}
        };

        pushIterable(game?.world?.players);
        pushIterable(game?.world?.entities);
        pushIterable(game?.world?.entitiesDump);
        pushIterable(game?.world?.loadedEntityList);
        addEntity(out, seen, game?.player);
        return out;
    }

    function geometryParts(cape) {
        const parts = [];
        try {
            cape?.traverse?.(object => {
                const geometry = object?.geometry;
                const position = geometry?.attributes?.position;
                const array = position?.array;
                if (!geometry || !position || !array || array.length < 3) return;

                const base = new Float32Array(array.length);
                base.set(array);

                let minX = Infinity;
                let maxX = -Infinity;
                let minY = Infinity;
                let maxY = -Infinity;
                let minZ = Infinity;
                let maxZ = -Infinity;

                for (let i = 0; i < base.length; i += 3) {
                    const x = base[i];
                    const y = base[i + 1];
                    const z = base[i + 2];
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    if (z < minZ) minZ = z;
                    if (z > maxZ) maxZ = z;
                }

                parts.push({
                    object,
                    geometry,
                    position,
                    base,
                    minX,
                    maxX,
                    minY,
                    maxY,
                    minZ,
                    maxZ,
                    centerX: (minX + maxX) * 0.5,
                    centerZ: (minZ + maxZ) * 0.5
                });
            });
        } catch {}
        return parts;
    }

    function entityPosition(entity, mesh) {
        const p = entity?.pos || entity?.position || mesh?.position;
        const x = Number(p?.x);
        const y = Number(p?.y);
        const z = Number(p?.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        return { x, y, z };
    }

    function makeArray(value = 0) {
        const a = new Float32Array(SEGMENTS);
        if (value) a.fill(value);
        return a;
    }

    function captureCape(cape, entity, mesh) {
        const existing = state.capes.get(cape);
        if (existing) return existing;

        const parts = geometryParts(cape);
        if (!parts.length) return null;

        const now = performance.now();
        const pos = entityPosition(entity, mesh);
        const data = {
            parts,
            back: makeArray(),
            backVelocity: makeArray(),
            side: makeArray(),
            sideVelocity: makeArray(),
            vertical: makeArray(),
            verticalVelocity: makeArray(),
            twist: makeArray(),
            twistVelocity: makeArray(),
            speed: 0,
            verticalSpeed: 0,
            forwardSpeed: 0,
            lateralSpeed: 0,
            acceleration: 0,
            turnSpeed: 0,
            previousSpeed: 0,
            previousPosition: pos,
            previousYaw: Number(mesh?.rotation?.y) || 0,
            lastTime: now,
            phase: Math.random() * Math.PI * 2,
            contact: 0
        };
        state.capes.set(cape, data);
        return data;
    }

    function restoreCape(cape, data = state.capes.get(cape)) {
        if (!data) return;
        for (const part of data.parts) {
            try {
                part.position.array.set(part.base);
                part.position.needsUpdate = true;
                part.geometry.computeVertexNormals?.();
            } catch {}
        }
        state.capes.delete(cape);
    }

    function spring(value, velocity, target, stiffness, damping, dt) {
        velocity += ((target - value) * stiffness - velocity * damping) * dt;
        value += velocity * dt;
        return [value, velocity];
    }

    function normalizeAngle(value) {
        while (value > Math.PI) value -= Math.PI * 2;
        while (value < -Math.PI) value += Math.PI * 2;
        return value;
    }

    function updateMotion(entity, mesh, data, dt) {
        const pos = entityPosition(entity, mesh);
        let speed = data.speed;
        let verticalSpeed = data.verticalSpeed;
        let forwardSpeed = data.forwardSpeed;
        let lateralSpeed = data.lateralSpeed;
        const yaw = Number(mesh?.rotation?.y);

        if (pos && data.previousPosition) {
            const dx = pos.x - data.previousPosition.x;
            const dy = pos.y - data.previousPosition.y;
            const dz = pos.z - data.previousPosition.z;
            const invDt = 1 / Math.max(0.001, dt);
            speed = Math.min(14, Math.hypot(dx, dz) * invDt);
            verticalSpeed = Math.max(-12, Math.min(12, dy * invDt));

            if (Number.isFinite(yaw)) {
                const rightX = Math.cos(yaw);
                const rightZ = -Math.sin(yaw);
                const forwardX = -Math.sin(yaw);
                const forwardZ = -Math.cos(yaw);
                lateralSpeed = (dx * rightX + dz * rightZ) * invDt;
                forwardSpeed = (dx * forwardX + dz * forwardZ) * invDt;
            }
        }

        if (pos) data.previousPosition = pos;

        data.previousSpeed = data.speed;
        data.speed += (speed - data.speed) * Math.min(1, dt * 11);
        data.verticalSpeed += (verticalSpeed - data.verticalSpeed) * Math.min(1, dt * 10);
        data.forwardSpeed += (forwardSpeed - data.forwardSpeed) * Math.min(1, dt * 10);
        data.lateralSpeed += (lateralSpeed - data.lateralSpeed) * Math.min(1, dt * 10);
        data.acceleration += (((data.speed - data.previousSpeed) / Math.max(0.001, dt)) - data.acceleration) * Math.min(1, dt * 8);

        if (Number.isFinite(yaw)) {
            const turn = normalizeAngle(yaw - data.previousYaw) / Math.max(0.001, dt);
            data.turnSpeed += (Math.max(-8, Math.min(8, turn)) - data.turnSpeed) * Math.min(1, dt * 10);
            data.previousYaw = yaw;
        }
    }

    function simulateCloth(data, entity, dt, time) {
        const speedFactor = Math.min(1, data.speed / 6.2);
        const crouch = entity?.sneak === true || entity?.sneaking === true || entity?.crouching === true;
        const targetBack = Math.max(
            0,
            Math.min(
                0.28,
                data.speed * 0.018 +
                Math.max(0, data.acceleration) * 0.004 +
                Math.max(0, -data.verticalSpeed) * 0.010 +
                (crouch ? 0.025 : 0)
            )
        );
        const targetSide = Math.max(-0.14, Math.min(0.14, data.lateralSpeed * 0.012 - data.turnSpeed * 0.008));
        const targetVertical = Math.max(-0.09, Math.min(0.13, -data.verticalSpeed * 0.010));
        const targetTwist = Math.max(-0.11, Math.min(0.11, -data.turnSpeed * 0.010 - data.lateralSpeed * 0.006));

        const steps = Math.max(1, Math.min(5, Math.ceil(dt / 0.012)));
        const h = dt / steps;

        for (let step = 0; step < steps; step++) {
            for (let i = 0; i < SEGMENTS; i++) {
                const t = i / (SEGMENTS - 1);
                const anchored = t * t;
                const lower = t * t * t;
                const parentBack = i === 0 ? 0 : data.back[i - 1];
                const parentSide = i === 0 ? 0 : data.side[i - 1];
                const parentVertical = i === 0 ? 0 : data.vertical[i - 1];
                const parentTwist = i === 0 ? 0 : data.twist[i - 1];
                const turbulence = (
                    Math.sin(time * (3.8 + speedFactor * 4.4) + data.phase + i * 0.72) * 0.55 +
                    Math.sin(time * (6.7 + speedFactor * 6.3) + data.phase * 0.43 + i * 1.19) * 0.28
                ) * (0.0018 + speedFactor * 0.0045) * lower;

                const backTarget = targetBack * anchored + parentBack * (0.11 + t * 0.18) + turbulence;
                const sideTarget = targetSide * anchored + parentSide * (0.12 + t * 0.20) + turbulence * 0.35;
                const verticalTarget = targetVertical * anchored + parentVertical * (0.10 + t * 0.16);
                const twistTarget = targetTwist * anchored + parentTwist * (0.14 + t * 0.18) + turbulence * 0.8;
                const stiffness = 130 - t * 68;
                const damping = 21 - t * 7;

                [data.back[i], data.backVelocity[i]] = spring(data.back[i], data.backVelocity[i], backTarget, stiffness, damping, h);
                [data.side[i], data.sideVelocity[i]] = spring(data.side[i], data.sideVelocity[i], sideTarget, stiffness * 0.80, damping * 0.95, h);
                [data.vertical[i], data.verticalVelocity[i]] = spring(data.vertical[i], data.verticalVelocity[i], verticalTarget, stiffness * 0.74, damping, h);
                [data.twist[i], data.twistVelocity[i]] = spring(data.twist[i], data.twistVelocity[i], twistTarget, stiffness * 0.67, damping * 0.92, h);

                if (i > 0) {
                    const maxBackDelta = 0.050 + t * 0.016;
                    const maxSideDelta = 0.040 + t * 0.014;
                    const maxVerticalDelta = 0.034 + t * 0.012;
                    const maxTwistDelta = 0.045;

                    data.back[i] = Math.max(data.back[i - 1] - maxBackDelta, Math.min(data.back[i - 1] + maxBackDelta, data.back[i]));
                    data.side[i] = Math.max(data.side[i - 1] - maxSideDelta, Math.min(data.side[i - 1] + maxSideDelta, data.side[i]));
                    data.vertical[i] = Math.max(data.vertical[i - 1] - maxVerticalDelta, Math.min(data.vertical[i - 1] + maxVerticalDelta, data.vertical[i]));
                    data.twist[i] = Math.max(data.twist[i - 1] - maxTwistDelta, Math.min(data.twist[i - 1] + maxTwistDelta, data.twist[i]));
                }
            }
        }
    }

    function applyMatrix(elements, x, y, z) {
        const w = elements[3] * x + elements[7] * y + elements[11] * z + elements[15];
        const iw = w && w !== 1 ? 1 / w : 1;
        return {
            x: (elements[0] * x + elements[4] * y + elements[8] * z + elements[12]) * iw,
            y: (elements[1] * x + elements[5] * y + elements[9] * z + elements[13]) * iw,
            z: (elements[2] * x + elements[6] * y + elements[10] * z + elements[14]) * iw
        };
    }

    function geometryObjects(root) {
        const out = [];
        if (!root) return out;
        try {
            if (root.geometry?.attributes?.position) out.push(root);
            root.traverse?.(object => {
                if (object !== root && object?.geometry?.attributes?.position) out.push(object);
            });
        } catch {}
        return out;
    }

    function buildCollider(object, capeWorldPosition) {
        const geometry = object?.geometry;
        if (!geometry) return null;
        try {
            geometry.computeBoundingBox?.();
            const box = geometry.boundingBox;
            if (!box || !object?.matrixWorld?.clone) return null;
            object.updateWorldMatrix?.(true, false);
            const matrix = object.matrixWorld.clone();
            const inverse = matrix.clone().invert();
            const capeLocal = applyMatrix(inverse.elements, capeWorldPosition.x, capeWorldPosition.y, capeWorldPosition.z);
            const centerZ = (box.min.z + box.max.z) * 0.5;
            return {
                matrix,
                inverse,
                minX: box.min.x,
                maxX: box.max.x,
                minY: box.min.y,
                maxY: box.max.y,
                minZ: box.min.z,
                maxZ: box.max.z,
                sign: capeLocal.z >= centerZ ? 1 : -1
            };
        } catch {
            return null;
        }
    }

    function collectColliders(mesh, cape) {
        try {
            cape.updateWorldMatrix?.(true, false);
            const elements = cape.matrixWorld?.elements;
            if (!elements) return [];
            const capeWorldPosition = { x: elements[12], y: elements[13], z: elements[14] };
            const colliders = [];
            const seen = new Set();

            for (const name of BODY_PARTS) {
                const root = mesh?.meshes?.[name] || mesh?.[name];
                if (!root) continue;
                for (const object of geometryObjects(root)) {
                    if (seen.has(object)) continue;
                    seen.add(object);
                    const collider = buildCollider(object, capeWorldPosition);
                    if (collider) colliders.push(collider);
                }
            }

            return colliders;
        } catch {
            return [];
        }
    }

    function resolveCollision(world, colliders, down) {
        let contact = 0;
        const marginX = 0.018 + down * 0.010;
        const marginY = 0.018 + down * 0.008;
        const gap = COLLISION_GAP + down * 0.010;
        let point = world;

        for (let pass = 0; pass < 3; pass++) {
            let moved = false;
            for (const collider of colliders) {
                const local = applyMatrix(collider.inverse.elements, point.x, point.y, point.z);
                if (local.x < collider.minX - marginX || local.x > collider.maxX + marginX) continue;
                if (local.y < collider.minY - marginY || local.y > collider.maxY + marginY) continue;

                const safeZ = collider.sign > 0 ? collider.maxZ + gap : collider.minZ - gap;
                const penetration = collider.sign > 0 ? safeZ - local.z : local.z - safeZ;
                if (penetration <= 0) continue;

                local.z = safeZ;
                point = applyMatrix(collider.matrix.elements, local.x, local.y, local.z);
                contact = Math.max(contact, penetration);
                moved = true;
            }
            if (!moved) break;
        }

        return { point, contact };
    }

    function sample(array, t) {
        const p = Math.max(0, Math.min(SEGMENTS - 1, t * (SEGMENTS - 1)));
        const i = Math.floor(p);
        const j = Math.min(SEGMENTS - 1, i + 1);
        const f = p - i;
        return array[i] * (1 - f) + array[j] * f;
    }

    function applyCapeStyle(entity, mesh) {
        if (!state.enabled) return;
        const cape = mesh?.capeMesh;
        if (!cape) return;

        const data = captureCape(cape, entity, mesh);
        if (!data) return;

        const now = performance.now();
        const time = now / 1000;
        const dt = Math.max(0.001, Math.min(0.05, (now - data.lastTime) / 1000));
        data.lastTime = now;

        updateMotion(entity, mesh, data, dt);
        simulateCloth(data, entity, dt, time);

        cape.updateWorldMatrix?.(true, false);
        const colliders = collectColliders(mesh, cape);
        const sign = Number(cape?.position?.z) < 0 ? -1 : 1;
        data.contact = 0;

        for (const part of data.parts) {
            const object = part.object;
            object?.updateWorldMatrix?.(true, false);
            const matrix = object?.matrixWorld?.clone?.();
            if (!matrix?.invert) continue;
            const inverse = matrix.clone().invert();
            const array = part.position.array;
            const base = part.base;
            const spanY = Math.max(0.0001, part.maxY - part.minY);
            const spanX = Math.max(0.0001, part.maxX - part.minX);

            for (let i = 0; i < array.length; i += 3) {
                const baseX = base[i];
                const baseY = base[i + 1];
                const baseZ = base[i + 2];
                const down = Math.max(0, Math.min(1, (part.maxY - baseY) / spanY));
                const across = (baseX - part.centerX) / spanX;
                const anchored = down * down;
                const back = sample(data.back, down);
                const side = sample(data.side, down);
                const vertical = sample(data.vertical, down);
                const twist = sample(data.twist, down);
                const thinZ = part.centerZ + (baseZ - part.centerZ) * DEPTH_SCALE;
                const edgeFlex = across * twist * anchored;
                const tinyFlutter = (
                    Math.sin(time * (5.2 + data.speed * 0.48) + data.phase + down * 8.4 + across * 1.7) +
                    Math.sin(time * (8.9 + data.speed * 0.31) + data.phase * 0.37 + down * 13.1) * 0.42
                ) * (0.0008 + Math.min(1, data.speed / 6) * 0.0023) * down * down * down;

                let x = baseX + side * anchored + edgeFlex * 0.45;
                let y = baseY + vertical * anchored - Math.abs(edgeFlex) * 0.035;
                let z = thinZ + sign * (BACK_OFFSET + back + Math.abs(edgeFlex) * 0.30 + tinyFlutter);

                if (colliders.length) {
                    const world = applyMatrix(matrix.elements, x, y, z);
                    const resolved = resolveCollision(world, colliders, down);
                    if (resolved.contact > 0) {
                        const local = applyMatrix(inverse.elements, resolved.point.x, resolved.point.y, resolved.point.z);
                        x = local.x;
                        y = local.y;
                        z = local.z;
                        data.contact = Math.max(data.contact, resolved.contact);
                        const segment = Math.min(SEGMENTS - 1, Math.round(down * (SEGMENTS - 1)));
                        data.backVelocity[segment] *= 0.22;
                        data.sideVelocity[segment] *= 0.60;
                        data.verticalVelocity[segment] *= 0.72;
                    }
                }

                array[i] = x;
                array[i + 1] = y;
                array[i + 2] = z;
            }

            part.position.needsUpdate = true;
            part.geometry.computeVertexNormals?.();
            part.geometry.computeBoundingSphere?.();
        }
    }

    function ensureRenderHook(entity) {
        const mesh = entity?.mesh;
        if (!mesh || typeof mesh.render !== 'function') return;

        const existing = state.hooks.get(mesh);
        if (existing && mesh.render === existing.wrapper) return;

        const original = mesh.render;
        const wrapper = function (...args) {
            const result = original.apply(this, args);
            try { applyCapeStyle(entity, mesh); } catch {}
            return result;
        };

        try {
            mesh.render = wrapper;
            state.hooks.set(mesh, { original, wrapper, entity });
        } catch {}
    }

    function synchronize(force = false) {
        if (!state.enabled) return;
        const now = performance.now();
        if (!force && now < state.scanAt) return;
        state.scanAt = now + 180;

        const game = findGame();
        if (!game) return;
        state.game = game;

        const entities = collectPlayerEntities(game);
        const activeMeshes = new Set();
        for (const entity of entities) {
            activeMeshes.add(entity.mesh);
            ensureRenderHook(entity);
        }

        for (const [mesh, hook] of [...state.hooks]) {
            if (activeMeshes.has(mesh)) continue;
            try {
                if (mesh.render === hook.wrapper) mesh.render = hook.original;
            } catch {}
            const cape = mesh?.capeMesh;
            if (cape) restoreCape(cape);
            state.hooks.delete(mesh);
        }
    }

    function restoreAll() {
        for (const [mesh, hook] of state.hooks) {
            try {
                if (mesh.render === hook.wrapper) mesh.render = hook.original;
            } catch {}
        }
        state.hooks.clear();

        for (const [cape, data] of [...state.capes]) restoreCape(cape, data);
    }

    function setEnabled(value) {
        const enabled = value === true;
        if (state.enabled === enabled) {
            if (enabled) synchronize(true);
            return;
        }

        state.enabled = enabled;
        if (enabled) {
            state.scanAt = 0;
            synchronize(true);
        } else {
            restoreAll();
            state.game = null;
            state.scanAt = 0;
        }
    }

    function readConfig(detail) {
        try {
            const config = typeof detail === 'string' ? JSON.parse(detail) : detail;
            setEnabled(config?.enabled === true);
        } catch {}
    }

    function loop() {
        if (state.enabled) {
            try { synchronize(false); } catch {}
        }
        requestAnimationFrame(loop);
    }

    document.addEventListener(EVENT_CONFIG, event => readConfig(event.detail));

    globalThis.BetterAnimationCape = {
        setEnabled,
        synchronize: () => synchronize(true),
        get enabled() { return state.enabled; },
        get depthScale() { return DEPTH_SCALE; },
        get backOffset() { return BACK_OFFSET; }
    };

    requestAnimationFrame(loop);
})();
