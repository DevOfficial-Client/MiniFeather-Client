(() => {
    'use strict';

    const BETTER_CAPE_PHYSICS_VERSION = 3;
    const EVENT_CONFIG = 'minifeather:better-animation-cape-config';
    const ROWS = 16, COLS = 4, STEP = 1 / 90, MAX_STEPS = 5;
    const GAP = 0.025, BACK_OFFSET = 0.022, MAX_DISTANCE = 48, MAX_CAPES = 24;
    const DEFAULTS = Object.freeze({
        movement: 'simulation-v2', style: 'smooth', wind: 'waves',
        windStrength: 0.65, gravity: 10, strength: 1
    });
    const PARTS = [
        ['head', 'headPivot'], ['torso', 'torso'],
        ['rightArmTop', 'rightShoulderJoint'], ['rightArmBottom', 'rightElbowJoint'],
        ['leftArmTop', 'leftShoulderJoint'], ['leftArmBottom', 'leftElbowJoint'],
        ['rightLegTop', 'rightHipJoint'], ['rightLegBottom', 'rightKneeJoint'],
        ['leftLegTop', 'leftHipJoint'], ['leftLegBottom', 'leftKneeJoint']
    ];
    const previous = globalThis.BetterAnimationCape;
    let previousEnabled = false, previousOptions = {};
    try {
        previousEnabled = previous?.enabled === true;
        previousOptions = previous?.getState?.().options || {};
        if (previous?.destroy) previous.destroy();
        else previous?.setEnabled?.(false);
    } catch {}
    const state = {
        enabled: false, destroyed: false, game: null, scanTime: -Infinity, timer: 0,
        hooks: new Map(), capes: new Map(), options: { ...DEFAULTS },
        geometryBuilds: 0, steps: 0, updates: 0, error: ''
    };
    const boundsCache = new WeakMap();
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const now = () => globalThis.performance?.now?.() ?? Date.now();
    const finite = (value, fallback, min, max) => {
        if (typeof value !== 'number' && typeof value !== 'string') return fallback;
        const number = Number(value);
        return Number.isFinite(number) ? clamp(number, min, max) : fallback;
    };
    const validGame = game => !!(game?.player && game?.world);

    function findGame() {
        for (const game of [globalThis.__MINIBLOX_GAME__, globalThis.__MB?.game, globalThis.miniblox, globalThis.Game, globalThis.game]) {
            if (validGame(game)) return (state.game = game);
        }
        const root = document.querySelector?.('#react') || document.querySelector?.('#root');
        if (root) {
            for (const key of Object.keys(root)) {
                if (!key.startsWith('__react')) continue;
                const queue = [root[key]], seen = new Set();
                for (let at = 0; at < queue.length && at < 1000; at++) {
                    const fiber = queue[at];
                    if (!fiber || seen.has(fiber)) continue;
                    seen.add(fiber);
                    for (const value of [fiber.stateNode, fiber.memoizedProps, fiber.pendingProps, fiber.updateQueue?.baseState?.element?.props]) {
                        const game = validGame(value) ? value : value?.game;
                        if (validGame(game)) return (state.game = game);
                    }
                    if (fiber.child) queue.push(fiber.child);
                    if (fiber.sibling) queue.push(fiber.sibling);
                    if (fiber.return) queue.push(fiber.return);
                }
            }
        }
        return null;
    }

    function point(matrix, x, y, z) {
        const m = matrix.elements || matrix;
        return [m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    }

    function bounds(geometry) {
        const position = geometry?.attributes?.position;
        if (!position || !ArrayBuffer.isView(position.array) || position.isInterleavedBufferAttribute) return null;
        const cached = boundsCache.get(geometry);
        if (cached?.attribute === position && cached.version === position.version) return cached;
        let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
            if (![x, y, z].every(Number.isFinite)) return null;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
        const result = { minX, minY, minZ, maxX, maxY, maxZ, attribute: position, version: position.version };
        boundsCache.set(geometry, result);
        return result;
    }

    function clip(polygon, axis, value, above) {
        const out = [];
        for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i], b = polygon[(i + 1) % polygon.length];
            const insideA = above ? a[axis] >= value - 1e-8 : a[axis] <= value + 1e-8;
            const insideB = above ? b[axis] >= value - 1e-8 : b[axis] <= value + 1e-8;
            if (insideA) out.push(a);
            if (insideA !== insideB) {
                const t = (value - a[axis]) / (b[axis] - a[axis]);
                out.push(a.map((component, index) => component + (b[index] - component) * t));
            }
        }
        return out;
    }

    function clothGeometry(original) {
        const box = bounds(original), position = original?.attributes?.position;
        if (!box || position.count > 45000 || box.maxY - box.minY < 0.05 || box.maxX - box.minX < 0.02 ||
            original.isInstancedBufferGeometry || Object.keys(original.morphAttributes || {}).length ||
            original.attributes.skinIndex) return null;
        const names = Object.keys(original.attributes);
        // Put position first so clipping interpolates the correct coordinates.
        names.splice(names.indexOf('position'), 1); names.unshift('position');
        if (names.some(name => !ArrayBuffer.isView(original.attributes[name].array) ||
            original.attributes[name].isInterleavedBufferAttribute || original.attributes[name].count !== position.count)) return null;
        const attributes = names.map(name => original.attributes[name]);
        const index = original.index?.array || Array.from({ length: position.count }, (_, i) => i);
        const count = index.length - index.length % 3, hidden = new Set(), quads = new Map();
        const materialAt = at => original.groups?.find(group => at >= group.start && at < group.start + group.count)?.materialIndex ?? 0;
        // Miniblox builds many capes from tiny closed cubes. Remove only paired,
        // opposite internal faces; keep transparency holes and outside borders.
        if (box.maxZ - box.minZ > 1e-5 && original.attributes.normal) {
            for (let at = 0; at + 5 < count; at += 6) {
                const vertices = [...new Set(Array.from(index.slice(at, at + 6)))];
                if (vertices.length !== 4) continue;
                const normal = original.attributes.normal, id = vertices[0];
                const n = [normal.getX(id), normal.getY(id), normal.getZ(id)];
                const axis = n.findIndex(value => Math.abs(value) > 0.999);
                if (axis < 0) continue;
                const extrema = [0, 1, 2].map(component => vertices.map(vertex => position.array[vertex * 3 + component]));
                if (Math.max(...extrema[axis]) - Math.min(...extrema[axis]) > 1e-7) continue;
                const key = axis + ':' + extrema.map(values => Math.min(...values).toFixed(6) + ',' + Math.max(...values).toFixed(6)).join(':') + ':' + materialAt(at);
                const other = quads.get(key);
                if (other && other.sign !== Math.sign(n[axis])) {
                    for (let i = 0; i < 6; i++) { hidden.add(at + i); hidden.add(other.at + i); }
                    quads.delete(key);
                } else quads.set(key, { at, sign: Math.sign(n[axis]) });
            }
        }
        const arrays = names.map(() => []), indices = [], groups = [];
        const dx = (box.maxX - box.minX) / COLS, dy = (box.maxY - box.minY) / ROWS;
        const read = id => attributes.flatMap(attribute => Array.from(attribute.array.slice(id * attribute.itemSize, (id + 1) * attribute.itemSize)));
        let vertices = 0;
        const vertexCache = new Map();
        const emit = (polygon, material) => {
            for (let i = 1; i + 1 < polygon.length; i++) {
                const a = polygon[0], b = polygon[i], c = polygon[i + 1];
                const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
                const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
                if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-10) continue;
                const start = indices.length;
                for (const vertex of [a, b, c]) {
                    const key = vertex.map(value => value.toFixed(7)).join(',');
                    const cached = state.options.style === 'smooth' ? vertexCache.get(key) : undefined;
                    if (cached !== undefined) { indices.push(cached); continue; }
                    let offset = 0;
                    for (let attr = 0; attr < attributes.length; attr++) {
                        for (let k = 0; k < attributes[attr].itemSize; k++) arrays[attr].push(vertex[offset++]);
                    }
                    if (state.options.style === 'smooth') vertexCache.set(key, vertices);
                    indices.push(vertices++);
                }
                const group = groups[groups.length - 1];
                if (group?.materialIndex === material) group.count += 3;
                else groups.push({ start, count: 3, materialIndex: material });
            }
        };
        for (let at = 0; at + 2 < count; at += 3) {
            if (hidden.has(at)) continue;
            const triangle = [read(index[at]), read(index[at + 1]), read(index[at + 2])];
            const x0 = Math.min(...triangle.map(v => v[0])), x1 = Math.max(...triangle.map(v => v[0]));
            const y0 = Math.min(...triangle.map(v => v[1])), y1 = Math.max(...triangle.map(v => v[1]));
            if (x1 - x0 <= dx + 1e-7 && y1 - y0 <= dy + 1e-7) emit(triangle, materialAt(at));
            else {
                const loX = clamp(Math.floor((x0 - box.minX) / dx), 0, COLS - 1);
                const hiX = clamp(Math.ceil((x1 - box.minX) / dx) - 1, loX, COLS - 1);
                const loY = clamp(Math.floor((y0 - box.minY) / dy), 0, ROWS - 1);
                const hiY = clamp(Math.ceil((y1 - box.minY) / dy) - 1, loY, ROWS - 1);
                for (let y = loY; y <= hiY; y++) for (let x = loX; x <= hiX; x++) {
                    let polygon = clip(triangle, 0, box.minX + x * dx, true);
                    polygon = clip(polygon, 0, box.minX + (x + 1) * dx, false);
                    polygon = clip(polygon, 1, box.minY + y * dy, true);
                    polygon = clip(polygon, 1, box.minY + (y + 1) * dy, false);
                    emit(polygon, materialAt(at));
                }
            }
            if (vertices > 70000) return null;
        }
        if (!vertices) return null;
        const geometry = new original.constructor();
        geometry.clearGroups?.();
        for (let at = 0; at < names.length; at++) {
            const attribute = attributes[at];
            geometry.setAttribute(names[at], new attribute.constructor(new attribute.array.constructor(arrays[at]), attribute.itemSize, attribute.normalized));
        }
        geometry.setIndex(indices);
        if (original.groups?.length) for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
        geometry.setDrawRange?.(0, indices.length);
        if (!geometry.attributes.normal) geometry.computeVertexNormals?.();
        geometry.computeBoundingBox?.(); geometry.computeBoundingSphere?.();
        if (geometry.boundingSphere) geometry.boundingSphere.radius += (box.maxY - box.minY) * 2 + BACK_OFFSET;
        return geometry;
    }

    function restoreRotation(data) {
        if (data?.cape.rotation && data.cape.rotation.x === data.appliedRotation) data.cape.rotation.x = data.nativeRotation;
        if (data) data.appliedRotation = null;
    }

    function releaseCape(cape) {
        const data = state.capes.get(cape);
        if (!data) return;
        restoreRotation(data);
        for (const part of data.parts) {
            if (part.object.geometry === part.geometry) part.object.geometry = part.original;
            part.geometry.dispose?.();
        }
        state.capes.delete(cape);
    }

    function captureCape(cape, mesh, entity) {
        cape.updateWorldMatrix?.(true, true);
        if (!cape.matrixWorld?.clone || !Array.from(cape.matrixWorld.elements).every(Number.isFinite) ||
            Math.abs(cape.matrixWorld.determinant?.() ?? 1) < 1e-15) return null;
        const inverse = cape.matrixWorld.clone().invert(), parts = [];
        const box = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
        cape.traverse?.(object => {
            if (!object?.geometry?.attributes?.position || object.isSkinnedMesh || object.isInstancedMesh) return;
            const original = object.geometry, geometry = clothGeometry(original);
            if (!geometry) return;
            object.updateWorldMatrix?.(true, false);
            const matrix = inverse.clone().multiply(object.matrixWorld), position = geometry.attributes.position;
            const rest = new Float32Array(position.array.length);
            for (let vertex = 0; vertex < position.count; vertex++) {
                const p = point(matrix, position.getX(vertex), position.getY(vertex), position.getZ(vertex));
                rest.set(p, vertex * 3);
                for (let axis = 0; axis < 3; axis++) {
                    const key = ['X', 'Y', 'Z'][axis];
                    box['min' + key] = Math.min(box['min' + key], p[axis]);
                    box['max' + key] = Math.max(box['max' + key], p[axis]);
                }
            }
            const normals = new Float32Array(geometry.attributes.normal.array);
            parts.push({ object, original, geometry, rest, normals, matrix, samples: null });
        });
        if (!parts.length) return null;
        const data = {
            cape, mesh, entity, parts, box, points: new Float64Array((ROWS + 1) * (COLS + 1) * 3),
            old: new Float64Array((ROWS + 1) * (COLS + 1) * 3), normals: new Float32Array((ROWS + 1) * (COLS + 1) * 3),
            local: new Float64Array((ROWS + 1) * (COLS + 1) * 3), visualLocal: new Float64Array((ROWS + 1) * (COLS + 1) * 3),
            renderPoints: new Float64Array((ROWS + 1) * (COLS + 1) * 3), inverse: cape.matrixWorld.clone(),
            anchors: new Float64Array((COLS + 1) * 3), previousAnchors: new Float64Array((COLS + 1) * 3),
            constraints: [], accumulator: 0, lastTime: null, origin: null, velocity: [0, 0, 0], classicAngle: 0,
            initialized: false, nativeRotation: null, appliedRotation: null, contacts: 0
        };
        for (const part of parts) {
            part.samples = new Float32Array(part.rest.length);
            part.ids = new Uint16Array(part.rest.length / 3 * 4);
            part.weights = new Float32Array(part.ids.length);
            part.inverse = part.object.matrixWorld.clone();
            for (let v = 0; v < part.rest.length; v += 3) {
                part.samples[v] = clamp((part.rest[v] - box.minX) / Math.max(0.001, box.maxX - box.minX), 0, 1) * COLS;
                part.samples[v + 1] = clamp((box.maxY - part.rest[v + 1]) / Math.max(0.001, box.maxY - box.minY), 0, 1) * ROWS;
                part.samples[v + 2] = part.rest[v + 2] - (box.minZ + box.maxZ) / 2;
                const x = part.samples[v], y = part.samples[v + 1];
                const col = Math.min(COLS - 1, Math.floor(x)), row = Math.min(ROWS - 1, Math.floor(y));
                const u = x - col, t = y - row, at = v / 3 * 4;
                part.ids.set([node(row, col), node(row, col + 1), node(row + 1, col), node(row + 1, col + 1)], at);
                part.weights.set([(1 - u) * (1 - t), u * (1 - t), (1 - u) * t, u * t], at);
            }
            part.object.geometry = part.geometry;
        }
        state.geometryBuilds++;
        state.capes.set(cape, data);
        return data;
    }

    const node = (row, col) => (row * (COLS + 1) + col) * 3;

    function resetSimulation(data, matrix) {
        const { box, points, old } = data;
        for (let row = 0; row <= ROWS; row++) for (let col = 0; col <= COLS; col++) {
            const p = point(matrix, box.minX + (box.maxX - box.minX) * col / COLS,
                box.maxY - (box.maxY - box.minY) * row / ROWS, (box.minZ + box.maxZ) / 2 + BACK_OFFSET);
            points.set(p, node(row, col)); old.set(p, node(row, col));
        }
        data.constraints.length = 0;
        const add = (a, b, kind, stiffness) => data.constraints.push({
            a, b, kind, stiffness, length: Math.hypot(points[a] - points[b], points[a + 1] - points[b + 1], points[a + 2] - points[b + 2])
        });
        for (let row = 0; row <= ROWS; row++) for (let col = 0; col <= COLS; col++) {
            const a = node(row, col);
            if (col < COLS) add(a, node(row, col + 1), 'width', 1);
            if (row < ROWS) add(a, node(row + 1, col), 'length', 1);
            if (row < ROWS && col < COLS) {
                add(a, node(row + 1, col + 1), 'shear', 0.28);
                add(node(row, col + 1), node(row + 1, col), 'shear', 0.28);
            }
            if (row + 2 <= ROWS) add(a, node(row + 2, col), 'bend', 0.6);
        }
        data.accumulator = 0; data.velocity.fill(0); data.classicAngle = 0; data.initialized = true;
        data.visualInitialized = false;
    }

    function colliders(mesh, cape) {
        const out = [], seen = new Set(), origin = [cape.matrixWorld.elements[12], cape.matrixWorld.elements[13], cape.matrixWorld.elements[14]];
        const add = (object, bone) => {
            if (!object?.geometry || seen.has(object)) return;
            const box = bounds(object.geometry);
            if (!box) return;
            seen.add(object);
            const root = bone || object;
            root.updateWorldMatrix?.(true, false);
            object.updateMatrix?.();
            const matrix = root.matrixWorld?.clone?.();
            if (!matrix) return;
            if (bone && object !== bone && object.matrix) matrix.multiply(object.matrix);
            const inverse = matrix.clone().invert();
            if (!Array.from(inverse.elements).every(Number.isFinite)) return;
            const local = point(inverse, ...origin);
            // The side occupied by the cape is the back, even for mirrored rigs.
            out.push({ box, matrix, inverse, sign: local[2] >= (box.minZ + box.maxZ) / 2 ? 1 : -1 });
        };
        for (const [name, bone] of PARTS) add(mesh.meshes?.[name], mesh[bone]);
        if (mesh.skinnedArmor?.chestplate?.userData?._equipped === true) add(mesh.armorMesh?.chestplate, mesh.torso);
        return out;
    }

    function collide(data, collision, matrix) {
        const depth = (data.box.maxZ - data.box.minZ) / 2;
        const cm = matrix.elements;
        for (const collider of collision) {
            const im = collider.inverse.elements;
            // Transform thickness once per collider, not for every cloth point.
            const gap = (GAP + depth) * Math.hypot(
                im[0] * cm[8] + im[4] * cm[9] + im[8] * cm[10],
                im[1] * cm[8] + im[5] * cm[9] + im[9] * cm[10],
                im[2] * cm[8] + im[6] * cm[9] + im[10] * cm[10]);
            collider.safeZ = collider.sign > 0 ? collider.box.maxZ + gap : collider.box.minZ - gap;
        }
        for (let at = (COLS + 1) * 3; at < data.points.length; at += 3) {
            let px = data.points[at], py = data.points[at + 1], pz = data.points[at + 2];
            let vx = px - data.old[at], vy = py - data.old[at + 1], vz = pz - data.old[at + 2];
            for (const collider of collision) {
                const im = collider.inverse.elements, b = collider.box;
                const x = im[0] * px + im[4] * py + im[8] * pz + im[12];
                const y = im[1] * px + im[5] * py + im[9] * pz + im[13];
                if (x < b.minX - 0.015 || x > b.maxX + 0.015 || y < b.minY - 0.015 || y > b.maxY + 0.015) continue;
                const z = im[2] * px + im[6] * py + im[10] * pz + im[14];
                const safe = collider.safeZ;
                if (collider.sign > 0 ? z >= safe : z <= safe) continue;
                // A limb is a finite volume, not an infinite one-sided wall.
                if (z < b.minZ - 0.06 || z > b.maxZ + 0.06) continue;
                const m = collider.matrix.elements;
                px = m[0] * x + m[4] * y + m[8] * safe + m[12];
                py = m[1] * x + m[5] * y + m[9] * safe + m[13];
                pz = m[2] * x + m[6] * y + m[10] * safe + m[14];
                const length = Math.hypot(im[2], im[6], im[10]) || 1;
                const nx = im[2] / length * collider.sign, ny = im[6] / length * collider.sign, nz = im[10] / length * collider.sign;
                const inward = Math.min(0, vx * nx + vy * ny + vz * nz);
                vx -= nx * inward; vy -= ny * inward; vz -= nz * inward;
                data.contacts++;
            }
            data.old[at] = px - vx; data.old[at + 1] = py - vy; data.old[at + 2] = pz - vz;
            data.points[at] = px; data.points[at + 1] = py; data.points[at + 2] = pz;
        }
    }

    function stabilizeSheet(data, matrix) {
        const p = data.points, local = data.local, im = data.inverse.elements, m = matrix.elements, b = data.box;
        const width = b.maxX - b.minX, segment = (b.maxY - b.minY) / ROWS;
        const centerX = (b.minX + b.maxX) / 2, back = (b.minZ + b.maxZ) / 2 + BACK_OFFSET;
        for (let at = 0; at < p.length; at += 3) {
            const x = p[at], y = p[at + 1], z = p[at + 2];
            local[at] = im[0] * x + im[4] * y + im[8] * z + im[12];
            local[at + 1] = im[1] * x + im[5] * y + im[9] * z + im[13];
            local[at + 2] = im[2] * x + im[6] * y + im[10] * z + im[14];
        }
        let cx = centerX, cy = b.maxY, cz = back, previousX = 0, previousY = -1, previousZ = 0;
        const cosLimit = 0.9396926208, sinLimit = 0.3420201433;
        // Keep the sheet ordered instead of resolving all vertex pairs. A
        // bounded bend and monotone rows prevent hairpins and face inversions.
        for (let row = 1; row <= ROWS; row++) {
            let meanX = 0, meanY = 0, meanZ = 0;
            for (let col = 0; col <= COLS; col++) {
                const at = node(row, col);
                meanX += local[at]; meanY += local[at + 1]; meanZ += local[at + 2];
            }
            meanX /= COLS + 1; meanY /= COLS + 1; meanZ /= COLS + 1;
            const sway = width * 0.35 * row / ROWS;
            let dx = clamp(meanX, centerX - sway, centerX + sway) - cx;
            let dy = Math.min(-segment * 0.30, meanY - cy), dz = Math.max(back, meanZ) - cz;
            let length = Math.hypot(dx, dy, dz) || segment;
            dx /= length; dy /= length; dz /= length;
            const dot = dx * previousX + dy * previousY + dz * previousZ;
            if (dot < cosLimit) {
                let tx = dx - previousX * dot, ty = dy - previousY * dot, tz = dz - previousZ * dot;
                const tangent = Math.hypot(tx, ty, tz);
                if (tangent > 1e-8) { tx /= tangent; ty /= tangent; tz /= tangent; }
                else { tx = 0; ty = -previousZ; tz = previousY; }
                dx = previousX * cosLimit + tx * sinLimit;
                dy = previousY * cosLimit + ty * sinLimit;
                dz = previousZ * cosLimit + tz * sinLimit;
            }
            dy = Math.min(-0.30, dy);
            dz = Math.max((back - cz) / segment, dz);
            length = Math.hypot(dx, dy, dz) || 1;
            dx /= length; dy /= length; dz /= length;
            cx += dx * segment; cy += dy * segment; cz += dz * segment;
            previousX = dx; previousY = dy; previousZ = dz;
            for (let col = 0; col <= COLS; col++) {
                const at = node(row, col), parent = node(row - 1, col);
                const offset = (col / COLS - 0.5) * width;
                const variation = clamp(local[at] - meanX - offset, -width / COLS * 0.08, width / COLS * 0.08);
                const x = cx + offset + variation;
                const maxDepth = Math.sqrt(Math.max(0, (segment * 1.3) ** 2 - (cy - local[parent + 1]) ** 2 - (x - local[parent]) ** 2));
                const ripple = clamp(local[at + 2] - meanZ, -segment * 0.22, segment * 0.22);
                local[at] = x; local[at + 1] = cy;
                local[at + 2] = clamp(Math.max(back, cz + ripple), local[parent + 2] - maxDepth, local[parent + 2] + maxDepth);
            }
        }
        for (let at = (COLS + 1) * 3; at < p.length; at += 3) {
            const x = local[at], y = local[at + 1], z = local[at + 2];
            const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
            const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
            const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
            // Positional safety corrections must not become new velocities.
            data.old[at] += wx - p[at]; data.old[at + 1] += wy - p[at + 1]; data.old[at + 2] += wz - p[at + 2];
            p[at] = wx; p[at + 1] = wy; p[at + 2] = wz;
        }
    }

    function constrain(data, reverse) {
        const p = data.points, fixed = (COLS + 1) * 3;
        for (let i = 0; i < data.constraints.length; i++) {
            const link = data.constraints[reverse ? data.constraints.length - 1 - i : i];
            const a = link.a, b = link.b;
            const x = p[b] - p[a], y = p[b + 1] - p[a + 1], z = p[b + 2] - p[a + 2];
            const length = Math.sqrt(x * x + y * y + z * z);
            if (!(length > 1e-9)) continue;
            let target = link.length;
            if (link.kind === 'bend') {
                target *= state.options.movement === 'dungeons' ? 0.975 : 0.91;
                if (length >= target) continue;
            }
            const aWeight = a < fixed ? 0 : 1, bWeight = b < fixed ? 0 : 1;
            const weights = aWeight + bWeight;
            if (!weights) continue;
            const amount = (length - target) / length * link.stiffness / weights;
            p[a] += x * amount * aWeight; p[b] -= x * amount * bWeight;
            p[a + 1] += y * amount * aWeight; p[b + 1] -= y * amount * bWeight;
            p[a + 2] += z * amount * aWeight; p[b + 2] -= z * amount * bWeight;
        }
    }

    function simulationStep(data, matrix, collision, water, time, anchorFraction) {
        const p = data.points, old = data.old, options = state.options;
        const m = matrix.elements, scale = Math.hypot(m[4], m[5], m[6]);
        const damping = Math.exp(-(water ? 16 : 5.5) * STEP);
        const wind = options.wind === 'waves' ? options.windStrength * (water ? 0.12 : 1) : 0;
        const gravity = options.gravity * (water ? 0.16 : 1) * scale;
        const strength = options.strength * (options.movement === 'dungeons' ? 0.65 : 1);
        for (let row = 1; row <= ROWS; row++) for (let col = 0; col <= COLS; col++) {
            const at = node(row, col), down = row / ROWS;
            const wave = Math.sin(time * 2.8 - down * 5.2 + col * 0.38) * wind * scale * down;
            for (let axis = 0; axis < 3; axis++) {
                const value = p[at + axis];
                const carried = data.velocity[axis] * STEP;
                const force = axis === 1 ? -gravity - data.velocity[1] * 1.25 * strength :
                    -data.velocity[axis] * (water ? 3.8 : 2.1) * strength + (m[axis] * 0.7 + m[8 + axis] * 0.25) * wave;
                p[at + axis] += carried + (value - old[at + axis] - carried) * damping + force * STEP * STEP;
                old[at + axis] = value;
            }
        }
        const inverse = state.options.movement === 'simulation' || state.options.movement === 'dungeons' ? matrix.clone().invert() : null;
        // The ordered-sheet pass resolves bends and spacing directly, so the
        // distance solver no longer needs eight repeated full-grid passes.
        for (let iteration = 0; iteration < 5; iteration++) {
            for (let i = 0; i < data.anchors.length; i++) {
                p[i] = data.previousAnchors[i] + (data.anchors[i] - data.previousAnchors[i]) * anchorFraction;
            }
            constrain(data, iteration % 2 === 1);
            if (inverse) {
                for (let row = 1; row <= ROWS; row++) for (let col = 0; col <= COLS; col++) {
                    const at = node(row, col), local = point(inverse, p[at], p[at + 1], p[at + 2]);
                    local[0] = data.box.minX + (data.box.maxX - data.box.minX) * col / COLS;
                    p.set(point(matrix, ...local), at);
                }
            }
            if (iteration === 1 || iteration === 4) collide(data, collision, matrix);
        }
        state.steps++;
    }

    function classic(data, matrix, water, time, dt) {
        const m = matrix.elements;
        const forward = -(data.velocity[0] * m[8] + data.velocity[1] * m[9] + data.velocity[2] * m[10]) / Math.max(1e-6, Math.hypot(m[8], m[9], m[10]));
        const target = clamp(Math.max(0, forward) * 0.10 * state.options.strength - data.velocity[1] * 0.025, 0, water ? 0.5 : 1.1);
        data.classicAngle += (target - data.classicAngle) * (1 - Math.exp(-8 * dt));
        const b = data.box, length = b.maxY - b.minY, height = length / ROWS;
        let y = b.maxY, z = (b.minZ + b.maxZ) / 2 + BACK_OFFSET;
        for (let row = 0; row <= ROWS; row++) {
            if (row) {
                const angle = data.classicAngle * (0.35 + row / ROWS * 0.65);
                y -= Math.cos(angle) * height; z += Math.sin(angle) * height;
            }
            for (let col = 0; col <= COLS; col++) {
                const flutter = state.options.wind === 'waves' ? Math.sin(time * 3 - row * 0.4) * state.options.windStrength * 0.004 * row / ROWS : 0;
                data.points.set(point(matrix, b.minX + (b.maxX - b.minX) * col / COLS, y, z + flutter), node(row, col));
            }
        }
    }

    function updateSimulation(data, matrix, entity, dt, time, collision) {
        data.inverse.copy(matrix).invert();
        const center = point(matrix, (data.box.minX + data.box.maxX) / 2, data.box.maxY, (data.box.minZ + data.box.maxZ) / 2 + BACK_OFFSET);
        const movement = data.origin ? Math.hypot(...center.map((value, i) => value - data.origin[i])) : 0;
        const m = matrix.elements;
        const widthScale = Math.hypot(m[0], m[1], m[2]), heightScale = Math.hypot(m[4], m[5], m[6]);
        const resized = Math.abs(widthScale - (data.widthScale ?? widthScale)) > 1e-5 ||
            Math.abs(heightScale - (data.heightScale ?? heightScale)) > 1e-5;
        const reset = !data.initialized || resized || movement > Math.max(2, (data.box.maxY - data.box.minY) * heightScale * 3);
        if (reset) {
            resetSimulation(data, matrix); data.origin = center;
            data.widthScale = widthScale; data.heightScale = heightScale;
        }
        data.previousAnchors.set(data.anchors);
        for (let col = 0; col <= COLS; col++) data.anchors.set(point(matrix,
            data.box.minX + (data.box.maxX - data.box.minX) * col / COLS, data.box.maxY,
            (data.box.minZ + data.box.maxZ) / 2 + BACK_OFFSET), col * 3);
        if (reset || data.lastTime === null) data.previousAnchors.set(data.anchors);
        if (data.origin && dt > 0) {
            const alpha = 1 - Math.exp(-12 * dt);
            for (let i = 0; i < 3; i++) {
                const change = (clamp((center[i] - data.origin[i]) / dt, -25, 25) - data.velocity[i]) * alpha;
                data.velocity[i] += clamp(change, -35 * dt, 35 * dt);
            }
        }
        data.origin = center;
        let water = entity?.inWater === true || entity?.swimming === true;
        try { water ||= entity?.isInWater?.() === true; } catch {}
        if (state.options.movement === 'classic') {
            classic(data, matrix, water, time, dt);
            collide(data, collision, matrix);
        }
        else {
            data.accumulator = Math.min(STEP * MAX_STEPS, data.accumulator + dt);
            let remaining = data.accumulator, steps = 0;
            while (data.accumulator >= STEP - 1e-8 && steps++ < MAX_STEPS) {
                const fraction = remaining > 0 ? clamp((remaining - data.accumulator + STEP) / remaining, 0, 1) : 1;
                simulationStep(data, matrix, collision, water, time, fraction);
                data.accumulator -= STEP;
            }
        }
        data.points.set(data.anchors, 0);
        stabilizeSheet(data, matrix);
        for (let at = 0; at < data.points.length; at++) {
            if (!Number.isFinite(data.points[at])) { resetSimulation(data, matrix); break; }
        }
    }

    function renderCloth(data, matrix, dt) {
        const local = data.visualLocal, p = data.renderPoints, n = data.normals, m = matrix.elements, im = data.inverse.elements;
        let alpha = data.visualInitialized ? 1 - Math.exp(-24 * dt) : 1, largestDelta = 0;
        for (let at = 0; at < p.length; at += 3) {
            const x = data.points[at], y = data.points[at + 1], z = data.points[at + 2];
            p[at] = im[0] * x + im[4] * y + im[8] * z + im[12];
            p[at + 1] = im[1] * x + im[5] * y + im[9] * z + im[13];
            p[at + 2] = im[2] * x + im[6] * y + im[10] * z + im[14];
            if (at >= (COLS + 1) * 3 && data.visualInitialized) {
                const dx = p[at] - local[at], dy = p[at + 1] - local[at + 1], dz = p[at + 2] - local[at + 2];
                largestDelta = Math.max(largestDelta, dx * dx + dy * dy + dz * dz);
            }
        }
        if (largestDelta > 1e-12) {
            const maxMotion = (data.box.maxY - data.box.minY) * 2.5 * Math.min(dt, 1 / 30);
            // One blend for the whole sheet preserves ordering and spacing;
            // an isolated late frame must not dump all accumulated motion.
            alpha = Math.min(alpha, maxMotion / Math.sqrt(largestDelta));
        }
        for (let at = 0; at < p.length; at += 3) {
            const blend = at < (COLS + 1) * 3 ? 1 : alpha;
            local[at] += (p[at] - local[at]) * blend;
            local[at + 1] += (p[at + 1] - local[at + 1]) * blend;
            local[at + 2] += (p[at + 2] - local[at + 2]) * blend;
            p[at] = m[0] * local[at] + m[4] * local[at + 1] + m[8] * local[at + 2] + m[12];
            p[at + 1] = m[1] * local[at] + m[5] * local[at + 1] + m[9] * local[at + 2] + m[13];
            p[at + 2] = m[2] * local[at] + m[6] * local[at + 1] + m[10] * local[at + 2] + m[14];
        }
        data.visualInitialized = true;
        for (let row = 0; row <= ROWS; row++) for (let col = 0; col <= COLS; col++) {
            const at = node(row, col), left = node(row, Math.max(0, col - 1)), right = node(row, Math.min(COLS, col + 1));
            const up = node(Math.max(0, row - 1), col), down = node(Math.min(ROWS, row + 1), col);
            const xx = p[right] - p[left], xy = p[right + 1] - p[left + 1], xz = p[right + 2] - p[left + 2];
            const yx = p[up] - p[down], yy = p[up + 1] - p[down + 1], yz = p[up + 2] - p[down + 2];
            const nx = xy * yz - xz * yy, ny = xz * yx - xx * yz, nz = xx * yy - xy * yx;
            const length = Math.hypot(nx, ny, nz) || 1;
            n[at] = nx / length; n[at + 1] = ny / length; n[at + 2] = nz / length;
        }
        const depthScale = Math.hypot(m[8], m[9], m[10]);
        for (const part of data.parts) {
            part.object.updateWorldMatrix?.(true, false);
            part.inverse.copy(part.object.matrixWorld).invert();
            const im = part.inverse.elements, pm = part.object.matrixWorld.elements;
            const position = part.geometry.attributes.position, normal = part.geometry.attributes.normal;
            const out = position.array, normals = normal.array, ids = part.ids, weights = part.weights;
            for (let at = 0, sample = 0; at < part.samples.length; at += 3, sample += 4) {
                const a = ids[sample], b = ids[sample + 1], c = ids[sample + 2], d = ids[sample + 3];
                const w0 = weights[sample], w1 = weights[sample + 1], w2 = weights[sample + 2], w3 = weights[sample + 3];
                let wx = p[a] * w0 + p[b] * w1 + p[c] * w2 + p[d] * w3;
                let wy = p[a + 1] * w0 + p[b + 1] * w1 + p[c + 1] * w2 + p[d + 1] * w3;
                let wz = p[a + 2] * w0 + p[b + 2] * w1 + p[c + 2] * w2 + p[d + 2] * w3;
                const sx = n[a] * w0 + n[b] * w1 + n[c] * w2 + n[d] * w3;
                const sy = n[a + 1] * w0 + n[b + 1] * w1 + n[c + 1] * w2 + n[d + 1] * w3;
                const sz = n[a + 2] * w0 + n[b + 2] * w1 + n[c + 2] * w2 + n[d + 2] * w3;
                const length = Math.hypot(sx, sy, sz) || 1, depth = part.samples[at + 2] * depthScale / length;
                wx += sx * depth; wy += sy * depth; wz += sz * depth;
                out[at] = im[0] * wx + im[4] * wy + im[8] * wz + im[12];
                out[at + 1] = im[1] * wx + im[5] * wy + im[9] * wz + im[13];
                out[at + 2] = im[2] * wx + im[6] * wy + im[10] * wz + im[14];
                if (state.options.style === 'blocky') continue;
                const nx = part.normals[at], ny = part.normals[at + 1], nz = part.normals[at + 2];
                let vx = sx / length * nz, vy = sy / length * nz, vz = sz / length * nz;
                if (Math.abs(nz) < 0.9) {
                    const xx = p[b] - p[a], xy = p[b + 1] - p[a + 1], xz = p[b + 2] - p[a + 2];
                    const yx = p[a] - p[c], yy = p[a + 1] - p[c + 1], yz = p[a + 2] - p[c + 2];
                    const tx = Math.hypot(xx, xy, xz) || 1, ty = Math.hypot(yx, yy, yz) || 1;
                    vx += xx / tx * nx + yx / ty * ny;
                    vy += xy / tx * nx + yy / ty * ny;
                    vz += xz / tx * nx + yz / ty * ny;
                }
                const lx = pm[0] * vx + pm[1] * vy + pm[2] * vz;
                const ly = pm[4] * vx + pm[5] * vy + pm[6] * vz;
                const lz = pm[8] * vx + pm[9] * vy + pm[10] * vz;
                const normLength = Math.hypot(lx, ly, lz) || 1;
                normals[at] = lx / normLength; normals[at + 1] = ly / normLength; normals[at + 2] = lz / normLength;
            }
            position.needsUpdate = true;
            if (state.options.style === 'blocky') part.geometry.computeVertexNormals?.();
            else normal.needsUpdate = true;
        }
    }

    function animate(entity, mesh) {
        if (!state.enabled || state.destroyed) return;
        const cape = mesh.capeMesh;
        if (!cape || cape.visible === false || mesh.visible === false) return;
        let data = state.capes.get(cape);
        if (data && (data.mesh !== mesh || data.parts.some(part => part.object.geometry !== part.geometry))) {
            releaseCape(cape); data = null;
        }
        if (!data) data = captureCape(cape, mesh, entity);
        if (!data) return;
        const time = now(), dt = data.lastTime === null ? 0 : (time - data.lastTime) / 1000;
        if (!(dt >= 0) || dt > 0.25) data.initialized = false;
        if (dt === 0 && data.lastTime !== null) return;
        data.nativeRotation = cape.rotation.x;
        const targetPose = entity?.sneak === true || entity?.sneaking === true || entity?.crouching === true ? -0.5 : 0;
        data.poseAngle = data.poseAngle === undefined || !data.initialized ? targetPose :
            data.poseAngle + (targetPose - data.poseAngle) * (1 - Math.exp(-14 * Math.max(0, dt)));
        if (Math.abs(data.poseAngle - targetPose) < 1e-7) data.poseAngle = targetPose;
        data.appliedRotation = data.poseAngle;
        cape.rotation.x = data.appliedRotation;
        cape.updateWorldMatrix?.(true, true);
        const matrix = cape.matrixWorld;
        if (!Array.from(matrix.elements).every(Number.isFinite) || Math.abs(matrix.determinant?.() ?? 1) < 1e-15) return;
        data.contacts = 0;
        updateSimulation(data, matrix, entity, clamp(Number.isFinite(dt) ? dt : 0, 0, STEP * MAX_STEPS), time / 1000, colliders(mesh, cape));
        renderCloth(data, matrix, clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25));
        data.lastTime = time; state.updates++;
    }

    function releaseMesh(mesh) {
        for (const [cape, data] of state.capes) if (data.mesh === mesh) releaseCape(cape);
    }

    function unhook(mesh, hook) {
        releaseMesh(mesh);
        if (mesh.render === hook.wrapper) mesh.render = hook.original;
        if (hook.clearWrapper && mesh.clear === hook.clearWrapper) mesh.clear = hook.clearOriginal;
        state.hooks.delete(mesh);
    }

    function hookMesh(entity) {
        const mesh = entity.mesh;
        if (!mesh || typeof mesh.render !== 'function') return;
        const existing = state.hooks.get(mesh);
        if (existing && mesh.render === existing.wrapper) { existing.entity = entity; return; }
        const hook = { original: mesh.render, entity, wrapper: null };
        hook.wrapper = function () {
            for (const data of state.capes.values()) if (data.mesh === mesh) restoreRotation(data);
            const result = hook.original.apply(this, arguments);
            if (state.hooks.get(mesh) !== hook || !state.enabled || state.destroyed) return result;
            try { animate(hook.entity, mesh); state.error = ''; }
            catch (error) { releaseMesh(mesh); state.error = String(error?.message || error).slice(0, 200); }
            return result;
        };
        if (typeof mesh.clear === 'function') {
            hook.clearOriginal = mesh.clear;
            hook.clearWrapper = function () { releaseMesh(mesh); return hook.clearOriginal.apply(this, arguments); };
            mesh.clear = hook.clearWrapper;
        }
        mesh.render = hook.wrapper; state.hooks.set(mesh, hook);
    }

    function synchronize() {
        if (!state.enabled || state.destroyed) return;
        const game = findGame(), entities = [], seen = new Set(), playerPosition = game?.player?.pos;
        if (game) {
            for (const collection of [game.world.players, game.world.entities, game.world.entitiesDump, game.world.loadedEntityList]) {
                try {
                    for (const entity of collection?.values?.() || []) {
                        if (entity?.mesh?.capeMesh && !seen.has(entity.mesh)) { seen.add(entity.mesh); entities.push(entity); }
                    }
                } catch {}
            }
            if (game.player?.mesh?.capeMesh && !seen.has(game.player.mesh)) entities.push(game.player);
        }
        const distance = entity => {
            const p = entity.pos || entity.position;
            return p && playerPosition ? Math.hypot(p.x - playerPosition.x, p.y - playerPosition.y, p.z - playerPosition.z) : 0;
        };
        entities.sort((a, b) => distance(a) - distance(b));
        const active = new Set();
        for (const entity of entities) {
            if (active.size >= MAX_CAPES || distance(entity) > MAX_DISTANCE) continue;
            active.add(entity.mesh); hookMesh(entity);
        }
        for (const [mesh, hook] of state.hooks) if (!active.has(mesh)) unhook(mesh, hook);
        for (const [cape, data] of state.capes) if (data.mesh.capeMesh !== cape) releaseCape(cape);
        state.scanTime = now();
    }

    function setEnabled(value) {
        if (state.destroyed) return;
        state.enabled = value === true;
        if (state.enabled) {
            if (!state.timer) state.timer = setInterval(synchronize, 350);
            synchronize();
        } else {
            if (state.timer) clearInterval(state.timer);
            state.timer = 0;
            for (const [mesh, hook] of state.hooks) unhook(mesh, hook);
            for (const cape of [...state.capes.keys()]) releaseCape(cape);
            state.game = null;
        }
    }

    function configure(config = {}) {
        if (!config || typeof config !== 'object' || state.destroyed) return;
        const oldStyle = state.options.style, oldMovement = state.options.movement;
        for (const key of ['movement', 'style', 'wind']) {
            const allowed = key === 'movement' ? ['simulation-v2', 'simulation', 'classic', 'dungeons'] : key === 'style' ? ['smooth', 'blocky'] : ['waves', 'none'];
            if (allowed.includes(config[key])) state.options[key] = config[key];
        }
        for (const [key, max] of [['windStrength', 2], ['gravity', 30], ['strength', 2]]) {
            if (key in config) state.options[key] = finite(config[key], state.options[key], 0, max);
        }
        if (oldStyle !== state.options.style) {
            for (const cape of [...state.capes.keys()]) releaseCape(cape);
        } else if (oldMovement !== state.options.movement) {
            for (const data of state.capes.values()) data.initialized = false;
        }
        if (typeof config.enabled === 'boolean') setEnabled(config.enabled);
    }

    function onConfig(event) {
        let config = event.detail;
        if (typeof config === 'string') try { config = JSON.parse(config); } catch { return; }
        configure(config);
    }

    function destroy() {
        if (state.destroyed) return;
        setEnabled(false); state.destroyed = true;
        document.removeEventListener(EVENT_CONFIG, onConfig);
        if (globalThis.BetterAnimationCape === api) delete globalThis.BetterAnimationCape;
    }

    const api = {
        configure, setEnabled, synchronize, destroy,
        get enabled() { return state.enabled; },
        get depthScale() { return 1; },
        get backOffset() { return BACK_OFFSET; },
        getState: () => ({
            version: BETTER_CAPE_PHYSICS_VERSION, enabled: state.enabled, destroyed: state.destroyed,
            options: { ...state.options }, capes: state.capes.size, hooks: state.hooks.size,
            nodesPerCape: (ROWS + 1) * (COLS + 1), geometryBuilds: state.geometryBuilds,
            steps: state.steps, updates: state.updates, error: state.error,
            vertices: [...state.capes.values()].reduce((count, data) => count + data.parts.reduce((sum, part) => sum + part.geometry.attributes.position.count, 0), 0),
            contacts: [...state.capes.values()].reduce((count, data) => count + data.contacts, 0)
        })
    };
    globalThis.BetterAnimationCape = api;
    document.addEventListener(EVENT_CONFIG, onConfig);
    configure({ ...previousOptions, enabled: previousEnabled });
})();
