(function () {
'use strict';
const RENDER_RESOURCE_LIFECYCLE_VERSION = 1;

const EVENT_CONFIG = 'minifeather:leaf-wind-config';

const state = {
    enabled: false,
    game: null,
    world: null,
    chunkRoot: null,
    lastScan: 0,
    scanTimer: 0,
    frame: 0,
    startedAt: 0,
    fullScan: false,
    leafMaterial: null,
    leafBlocks: new Set(),
    records: new Set(),
    recordByMesh: new WeakMap(),
    inspected: new WeakMap(),
    queue: [],
    queued: new WeakMap(),
    working: false,
    workHandle: null,
    workIsIdle: false,
    generation: 0
        };

        const uniforms = {
    time: { value: 0 },
    strength: { value: 0.085 }
    };

    function getGame(force = false) {
    if (globalThis.miniblox?.player && globalThis.miniblox?.world) {
        state.game = globalThis.miniblox;
        return state.game;
    }

    const now = performance.now();

    if (!force && state.game?.player && state.game?.world && now - state.lastScan < 900) {
        return state.game;
    }

    state.lastScan = now;

    try {
        const react = document.querySelector('#react');
        if (!react) return state.game?.player && state.game?.world ? state.game : null;

        for (const root of Object.values(react)) {
            const game = root?.updateQueue?.baseState?.element?.props?.game;
            if (game?.player && game?.world) {
                state.game = game;
                return game;
            }
        }
    } catch {}

    return state.game?.player && state.game?.world ? state.game : null;
    }

    function refreshLeafRegistry() {
    state.leafBlocks.clear();
    state.leafMaterial = globalThis.Materials?.leaves || null;

    const blocks = globalThis.Blocks;
    if (!blocks) return;

    try {
        if (blocks.nameToBlock instanceof Map) {
            for (const [name, block] of blocks.nameToBlock) {
                if (/leaves/i.test(String(name))) state.leafBlocks.add(block);
            }
        }
    } catch {}

    try {
        for (const [name, block] of Object.entries(blocks)) {
            if (/leaves/i.test(String(name)) && block && typeof block === 'object') {
                state.leafBlocks.add(block);
            }
        }
    } catch {}

    if (!state.leafMaterial) {
        for (const block of state.leafBlocks) {
            try {
                const material = block?.getMaterial?.() || block?.material;
                if (material) {
                    state.leafMaterial = material;
                    break;
                }
            } catch {}
        }
    }
    }

    function isLeaf(block) {
    if (!block) return false;
    if (state.leafBlocks.has(block)) return true;

    let material = null;

    try {
        material = block.getMaterial?.() || block.material || null;
    } catch {}

    if (state.leafMaterial && material === state.leafMaterial) return true;

    return /leaves/i.test(String(block.name || block.registryName || block.idName || block.constructor?.name || ''));
    }

    function makeBlockPos(world) {
    const template = world?.constructor?.mutableblockpos || world?.constructor?.pos1 || world?.constructor?.pos2;

    try {
        const clone = template?.clone?.();
        if (clone) return clone;
    } catch {}

    try {
        const Pos = template?.constructor;
        if (Pos && Pos !== Object) return new Pos(0, 0, 0);
    } catch {}

    try {
        if (typeof globalThis.BlockPos === 'function') return new globalThis.BlockPos(0, 0, 0);
    } catch {}

    return { x: 0, y: 0, z: 0 };
    }

    function setBlockPos(pos, x, y, z) {
    if (typeof pos.setInt === 'function') {
        pos.setInt(x, y, z);
        return;
    }

    if (typeof pos.set === 'function') {
        pos.set(x, y, z);
        return;
    }

    pos.x = x;
    pos.y = y;
    pos.z = z;
    }

    function possibleLeafMesh(mesh) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const text = [mesh.name, ...materials.map(material => material?.name)].filter(Boolean).join(' ');

    if (/leaf|leaves|foliage/i.test(text)) return true;

    return materials.some(material => material && (material.transparent === true || Number(material.alphaTest) > 0));
    }

    function createPatchedMaterial(source) {
    if (!source) return source;

    const material = source.clone?.();
    if (!material || material === source) throw new Error('Leaf Wind requires an owned material');
    material.defaultAttributeValues = { ...source.defaultAttributeValues, mfLeaf: [0] };
    const previousCompile = source.onBeforeCompile;
    const previousKey = typeof source.customProgramCacheKey === 'function'
        ? source.customProgramCacheKey.bind(source)
        : null;

    material.onBeforeCompile = function (shader, renderer) {
        if (typeof previousCompile === 'function') {
            previousCompile.call(this, shader, renderer);
        }

        shader.uniforms.mfLeafTime = uniforms.time;
        shader.uniforms.mfLeafStrength = uniforms.strength;

        if (!shader.vertexShader.includes('attribute float mfLeaf;')) {
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                '#include <common>\nattribute float mfLeaf;\nuniform float mfLeafTime;\nuniform float mfLeafStrength;'
            );
        }

        const windCode = `
            vec3 mfLeafWorld = (modelMatrix * vec4(position, 1.0)).xyz;
            float mfLeafA = sin(mfLeafWorld.x * 0.46 + mfLeafWorld.z * 0.31 + mfLeafTime * 1.65);
            float mfLeafB = sin(mfLeafWorld.z * 0.83 - mfLeafWorld.x * 0.19 + mfLeafTime * 2.28);
            float mfLeafC = cos(mfLeafWorld.x * 0.34 - mfLeafWorld.z * 0.41 + mfLeafTime * 1.31);
            float mfLeafGust = 0.72 + 0.28 * sin(mfLeafTime * 0.34 + mfLeafWorld.x * 0.035 + mfLeafWorld.z * 0.028);
            float mfLeafMove = mfLeaf * mfLeafStrength * mfLeafGust;
            transformed.x += (mfLeafA * 0.72 + mfLeafB * 0.28) * mfLeafMove;
            transformed.z += (mfLeafC * 0.62 + mfLeafB * 0.18) * mfLeafMove * 0.58;
            transformed.y += sin(mfLeafWorld.x * 0.23 + mfLeafWorld.z * 0.19 + mfLeafTime * 1.9) * mfLeafMove * 0.14;
            `;

        if (shader.vertexShader.includes('#include <begin_vertex>')) {
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>' + windCode
            );
        }
    };

    material.customProgramCacheKey = function () {
        return `${previousKey ? previousKey() : ''}|minifeather-leaf-wind-v1`;
    };

    material.needsUpdate = true;
    return material;
    }

    function restoreRecord(record, keepAttribute = false) {
    if (!record?.mesh) return;
    record.alive = false;
    if (record.mesh.onBeforeRender === record.guard) record.mesh.onBeforeRender = record.beforeRender;
    record.geometry.removeEventListener?.('dispose', record.onDispose);

    try {
        if (record.mesh.material === record.patchedMaterial) {
            record.mesh.material = record.originalMaterial;
        }
    } catch {}

    if (!keepAttribute) {
        try {
            const geometry = record.geometry;
            if (geometry?.getAttribute?.('mfLeaf') === record.attribute) {
                geometry.deleteAttribute?.('mfLeaf');
            }
        } catch {}
    }

    try {
        const original = Array.isArray(record.originalMaterial) ? record.originalMaterial : [record.originalMaterial];
        const patched = Array.isArray(record.patchedMaterial) ? record.patchedMaterial : [record.patchedMaterial];
        for (const material of patched) {
            if (material && !original.includes(material)) material.dispose?.();
        }
    } catch {}

    state.records.delete(record);
    state.recordByMesh.delete(record.mesh);
    }

    function restoreAll() {
    state.generation++;
    if (state.workHandle !== null) {
        if (state.workIsIdle && typeof cancelIdleCallback === 'function') cancelIdleCallback(state.workHandle);
        else clearTimeout(state.workHandle);
        state.workHandle = null;
    }
    for (const record of [...state.records]) restoreRecord(record);
    state.queue.length = 0;
    state.recordByMesh = new WeakMap();
    state.queued = new WeakMap();
    state.inspected = new WeakMap();
    state.working = false;
    }

    function patchMesh(mesh, geometry, attribute, snapshot) {
    const previousRecord = state.recordByMesh.get(mesh);
    if (previousRecord) restoreRecord(previousRecord, true);

    const originalMaterial = mesh.material;
    const patchedMaterial = Array.isArray(originalMaterial)
        ? originalMaterial.map(createPatchedMaterial)
        : createPatchedMaterial(originalMaterial);

    mesh.material = patchedMaterial;

    const record = {
        mesh,
        geometry,
        attribute,
        originalMaterial,
        patchedMaterial,
        snapshot,
        alive: true,
        beforeRender: mesh.onBeforeRender
    };

    record.guard = function (...args) {
        if (record.alive && !matchesSnapshot(mesh, snapshot)) {
            // The render list may already hold this material. Missing mfLeaf
            // defaults to zero, so this draw remains native until re-tagging.
            if (geometry.getAttribute?.('mfLeaf') === attribute) geometry.deleteAttribute('mfLeaf');
            state.inspected.delete(mesh);
        }
        return record.beforeRender?.apply(this, args);
    };
    record.onDispose = () => {
        state.inspected.delete(mesh);
        restoreRecord(record);
    };
    mesh.onBeforeRender = record.guard;
    geometry.addEventListener?.('dispose', record.onDispose);

    state.records.add(record);
    state.recordByMesh.set(mesh, record);
    }

    function attributeSnapshot(attribute) {
    return attribute ? { attribute, array: attribute.array, count: attribute.count,
        version: attribute.version, dataVersion: attribute.data?.version } : null;
    }

    function sameAttribute(attribute, saved) {
    return saved ? attribute === saved.attribute && attribute.array === saved.array &&
        attribute.count === saved.count && attribute.version === saved.version &&
        attribute.data?.version === saved.dataVersion : !attribute;
    }

    function snapshotMesh(mesh) {
    mesh.updateWorldMatrix?.(true, false);
    const geometry = mesh.geometry;
    return {
        geometry,
        position: attributeSnapshot(geometry.attributes.position),
        normal: attributeSnapshot(geometry.attributes.normal),
        index: attributeSnapshot(geometry.index),
        start: geometry.drawRange?.start,
        count: geometry.drawRange?.count,
        matrix: Array.from(mesh.matrixWorld.elements)
    };
    }

    function matchesSnapshot(mesh, saved) {
    const geometry = mesh.geometry;
    if (!saved || !mesh.matrixWorld?.elements) return false;
    for (let i = 0; i < 16; i++) if (mesh.matrixWorld.elements[i] !== saved.matrix[i]) return false;
    return geometry === saved.geometry &&
        sameAttribute(geometry.attributes?.position, saved.position) &&
        sameAttribute(geometry.attributes?.normal, saved.normal) &&
        sameAttribute(geometry.index, saved.index) &&
        geometry.drawRange?.start === saved.start && geometry.drawRange?.count === saved.count;
    }

    function inChunkRoot(mesh) {
    for (let node = mesh; node; node = node.parent) if (node === state.chunkRoot) return true;
    return false;
    }

    function* tagMesh(mesh, world, snapshot) {
    const geometry = mesh?.geometry;
    const position = geometry?.attributes?.position;

    if (!geometry || !position || position.count < 3 || !world?.getBlock) return false;

    const matrix = mesh.matrixWorld?.elements;
    if (!matrix) return false;

    const normal = geometry.attributes?.normal;
    const index = geometry.index?.array || null;
    const mask = new Float32Array(position.count);
    const blockPos = makeBlockPos(world);
    const blockCache = new Map();
    let found = false;

    function leafAt(x, y, z) {
        const key = `${x},${y},${z}`;
        if (blockCache.has(key)) return blockCache.get(key);

        let result = false;

        try {
            setBlockPos(blockPos, x, y, z);
            result = isLeaf(world.getBlock(blockPos));
        } catch {}

        blockCache.set(key, result);
        return result;
    }

    function triangle(a, b, c) {
        if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c) ||
            a < 0 || b < 0 || c < 0 || a >= position.count || b >= position.count || c >= position.count) return;
        const ax = position.getX(a);
        const ay = position.getY(a);
        const az = position.getZ(a);
        const bx = position.getX(b);
        const by = position.getY(b);
        const bz = position.getZ(b);
        const cx = position.getX(c);
        const cy = position.getY(c);
        const cz = position.getZ(c);

        const lx = (ax + bx + cx) / 3;
        const ly = (ay + by + cy) / 3;
        const lz = (az + bz + cz) / 3;

        let nx;
        let ny;
        let nz;

        if (normal) {
            nx = (normal.getX(a) + normal.getX(b) + normal.getX(c)) / 3;
            ny = (normal.getY(a) + normal.getY(b) + normal.getY(c)) / 3;
            nz = (normal.getZ(a) + normal.getZ(b) + normal.getZ(c)) / 3;
        } else {
            const ux = bx - ax;
            const uy = by - ay;
            const uz = bz - az;
            const vx = cx - ax;
            const vy = cy - ay;
            const vz = cz - az;
            nx = uy * vz - uz * vy;
            ny = uz * vx - ux * vz;
            nz = ux * vy - uy * vx;
        }

        let wx = matrix[0] * lx + matrix[4] * ly + matrix[8] * lz + matrix[12];
        let wy = matrix[1] * lx + matrix[5] * ly + matrix[9] * lz + matrix[13];
        let wz = matrix[2] * lx + matrix[6] * ly + matrix[10] * lz + matrix[14];

        let wnx = matrix[0] * nx + matrix[4] * ny + matrix[8] * nz;
        let wny = matrix[1] * nx + matrix[5] * ny + matrix[9] * nz;
        let wnz = matrix[2] * nx + matrix[6] * ny + matrix[10] * nz;

        const length = Math.hypot(wnx, wny, wnz) || 1;
        wnx /= length;
        wny /= length;
        wnz /= length;

        wx -= wnx * 0.04;
        wy -= wny * 0.04;
        wz -= wnz * 0.04;

        if (!leafAt(Math.floor(wx + 1e-5), Math.floor(wy + 1e-5), Math.floor(wz + 1e-5))) return;

        mask[a] = 1;
        mask[b] = 1;
        mask[c] = 1;
        found = true;
    }

    const start = Math.max(0, geometry.drawRange?.start || 0);
    const end = Math.min(index ? index.length : position.count, start + (geometry.drawRange?.count ?? Infinity));
    let steps = 0;
    if (index) {
        for (let i = start; i + 2 < end; i += 3) {
            triangle(index[i], index[i + 1], index[i + 2]);
            if (++steps % 128 === 0) yield;
        }
    } else {
        for (let i = start; i + 2 < end; i += 3) {
            triangle(i, i + 1, i + 2);
            if (++steps % 128 === 0) yield;
        }
    }

    if (!matchesSnapshot(mesh, snapshot) || !inChunkRoot(mesh) || world !== state.world) return false;
    state.inspected.set(mesh, snapshot);

    if (!found) return false;

    let attribute = null;

    try {
        const Attribute = position.constructor;
        attribute = new Attribute(mask, 1);
        if (attribute.count !== position.count || attribute.itemSize !== 1) return false;
        geometry.setAttribute('mfLeaf', attribute);
    } catch {
        return false;
    }

    try {
        patchMesh(mesh, geometry, attribute, snapshot);
    } catch (error) {
        if (geometry.getAttribute?.('mfLeaf') === attribute) geometry.deleteAttribute('mfLeaf');
        state.inspected.delete(mesh);
        throw error;
    }
    return true;
    }

    function processQueue() {
    if (state.working || !state.queue.length || !state.enabled) return;

    state.working = true;
    const generation = state.generation;

    const schedule = work => {
        state.workIsIdle = typeof requestIdleCallback === 'function';
        state.workHandle = state.workIsIdle
            ? requestIdleCallback(work, { timeout: 80 })
            : setTimeout(() => work(null), 0);
    };

    const work = deadline => {
        if (generation !== state.generation) return;
        state.workHandle = null;
        let processed = 0;
        const started = performance.now();

        while (state.queue.length && state.enabled) {
            if (deadline && !deadline.didTimeout && deadline.timeRemaining() < 2 && processed > 0) break;

            const job = state.queue[0];
            if (state.queued.get(job.mesh) !== job || job.world !== state.world ||
                !inChunkRoot(job.mesh) || !matchesSnapshot(job.mesh, job.snapshot)) {
                state.queue.shift();
                if (state.queued.get(job.mesh) === job) state.queued.delete(job.mesh);
                continue;
            }

            try {
                job.iterator ||= tagMesh(job.mesh, job.world, job.snapshot);
                if (job.iterator.next().done) {
                    state.queue.shift();
                    state.queued.delete(job.mesh);
                }
            } catch {
                state.queue.shift();
                state.queued.delete(job.mesh);
                const record = state.recordByMesh.get(job.mesh);
                if (record) restoreRecord(record);
                state.inspected.delete(job.mesh);
            }

            processed++;
            if (processed >= 8 || performance.now() - started >= 4) break;
        }

        if (state.queue.length && state.enabled) {
            schedule(work);
        } else {
            state.working = false;
        }
    };

    schedule(work);
    }

    function scan(force = false) {
    if (!state.enabled) return;

    const game = getGame(force);
    const world = game?.world || null;
    const chunkRoot = game?.gameScene?.chunkMeshes || null;

    if (!game || !world || !chunkRoot?.traverse) {
        restoreAll();
        state.world = null;
        state.chunkRoot = null;
        return;
    }

    if (state.world !== world || state.chunkRoot !== chunkRoot) {
        restoreAll();
        state.world = world;
        state.chunkRoot = chunkRoot;
        state.startedAt = performance.now();
        state.fullScan = false;
        refreshLeafRegistry();
    }

    if (!state.leafMaterial && !state.leafBlocks.size) refreshLeafRegistry();

    for (const record of state.records) {
        if (!inChunkRoot(record.mesh) || !matchesSnapshot(record.mesh, record.snapshot) ||
            record.mesh.material !== record.patchedMaterial ||
            record.geometry.getAttribute?.('mfLeaf') !== record.attribute) {
            state.inspected.delete(record.mesh);
            restoreRecord(record);
        }
    }
    state.queue = state.queue.filter(job => {
        const valid = state.queued.get(job.mesh) === job && inChunkRoot(job.mesh);
        if (!valid && state.queued.get(job.mesh) === job) state.queued.delete(job.mesh);
        return valid;
    });

    if (!state.fullScan && performance.now() - state.startedAt > 4000 && state.records.size === 0) {
        state.fullScan = true;
    }

    // sin updateMatrixWorld(true) forzado en la raiz: recalcular todo el arbol de chunks
    // cada 900ms mata la cache de matrices de three; cada mesh ya tiene su matrixWorld,
    // y tagMesh actualiza el del mesh que va a inspeccionar
    chunkRoot.traverse(mesh => {
        if (!mesh?.isMesh || !mesh.geometry?.attributes?.position) return;
        if (!possibleLeafMesh(mesh)) return;

        if (matchesSnapshot(mesh, state.inspected.get(mesh))) return;
        if (matchesSnapshot(mesh, state.queued.get(mesh)?.snapshot)) return;
        const job = { mesh, world, snapshot: snapshotMesh(mesh) };
        state.queued.set(mesh, job);
        state.queue.push(job);
    });

    processQueue();
    }

    function animate(now) {
    if (!state.enabled) {
        state.frame = 0;
        return;
    }

    uniforms.time.value = now * 0.001;
    state.frame = requestAnimationFrame(animate);
    }

    function start() {
    if (state.scanTimer) return;

    state.startedAt = performance.now();
    refreshLeafRegistry();
    scan(true);
    state.scanTimer = window.setInterval(() => scan(false), 900);

    if (!state.frame) state.frame = requestAnimationFrame(animate);
    }

    function stop() {
    if (state.scanTimer) {
        clearInterval(state.scanTimer);
        state.scanTimer = 0;
    }

    if (state.frame) {
        cancelAnimationFrame(state.frame);
        state.frame = 0;
    }

    restoreAll();
    state.game = null;
    state.world = null;
    state.chunkRoot = null;
    state.fullScan = false;
    state.startedAt = 0;
    }

    function setEnabled(value) {
    const enabled = !!value;

    if (state.enabled === enabled) {
        if (enabled) scan(true);
        return;
    }

    state.enabled = enabled;

    if (enabled) start();
    else stop();
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
    if ('strength' in config) {
        const value = Number(config.strength);
        if (Number.isFinite(value) && value >= 0 && value <= 1) {
            uniforms.strength.value = value;
        }
    }
    if ('enabled' in config) setEnabled(config.enabled);
    }

    document.addEventListener(EVENT_CONFIG, event => {
    applyConfig(event.detail);
    }, true);

    window.addEventListener('beforeunload', () => {
    stop();
}, { once: true });
})();
