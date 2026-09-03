(function () {
'use strict';

const TAG = '[Baritone]';

const EVENT_CONFIG = 'minifeather:baritone-config';
const EVENT_STATE = 'minifeather:baritone-state';
const EVENT_COMMAND = 'minifeather:baritone-command';

// --- Min-Heap (Binary Heap for A* priority queue) ---
class MinHeap {
    constructor() { this.data = []; }
    get size() { return this.data.length; }
    push(node) {
        this.data.push(node);
        this._bubbleUp(this.data.length - 1);
    }
    pop() {
        if (this.data.length === 0) return null;
        const top = this.data[0];
        const last = this.data.pop();
        if (this.data.length > 0) {
            this.data[0] = last;
            this._sinkDown(0);
        }
        return top;
    }
    _bubbleUp(idx) {
        const item = this.data[idx];
        while (idx > 0) {
            const parentIdx = (idx - 1) >> 1;
            const parent = this.data[parentIdx];
            if (item.f >= parent.f) break;
            this.data[idx] = parent;
            idx = parentIdx;
        }
        this.data[idx] = item;
    }
    _sinkDown(idx) {
        const length = this.data.length;
        const item = this.data[idx];
        while (true) {
            let left = idx * 2 + 1;
            let right = left + 1;
            let swap = -1;
            if (left < length && this.data[left].f < item.f) swap = left;
            if (right < length && this.data[right].f < (swap === -1 ? item.f : this.data[left].f)) swap = right;
            if (swap === -1) break;
            this.data[idx] = this.data[swap];
            idx = swap;
        }
        this.data[idx] = item;
    }
}

// --- State ---
const state = {
    enabled: false,
    game: null,
    lastGameScan: 0,
    path: [],
    pathIndex: 0,
    goal: null,
    status: 'idle',
    repathTimer: 0,
    maxPathTime: 5000,
    chunkCache: new Map(),
    cacheVersion: 0,
    // Input hook state (patrón AntiAFK)
    player: null,
    readerName: null,
    originalReader: null,
    nativeApply: null,
    _lastPos: null,
    // follow mode
    followTarget: null,      // username a seguir
    followEntity: null,      // entity cacheada
    lastFollowScan: 0,
    followRepathAt: 0
};

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// Desired input that Baritone wants to inject each tick
const desiredInput = {
    strafe: 0,      // -1 (left) to 1 (right)
    forward: 0,     // -1 (back) to 1 (forward)
    jump: false,
    sneak: false,
    yaw: null       // target yaw to set
};

let inputHooked = false;
// diagnostico: cuantas veces el reader hookeado inyecto input nativo
let injectedTicks = 0;
let lastInjectAt = 0;

// --- Probe: test autonomo de inyeccion de movimiento ---
// camina recto ~1s midiendo todo; diagnostica DONDE se corta el pipeline:
//   reader no llamado / input inyectado pero no mueve / todo OK
let probeState = null;

function startProbe(ms = 1000) {
    const game = getGame(true);
    const player = game?.player;
    if (!player?.pos) { console.warn(`${TAG} probe: no player`); return false; }
    const p = player.pos;
    probeState = {
        player,
        startedAt: performance.now(),
        until: performance.now() + ms,
        startPos: { x: p.x, y: p.y, z: p.z },
        startInjected: injectedTicks,
        prevEnabled: state.enabled,
        prevDesired: { ...desiredInput }
    };
    // OJO: loop y hook estan gated en state.enabled — sin esto el probe
    // arrancaba y nunca terminaba (reporte que no sale)
    state.enabled = true;
    state.status = 'moving';       // activar la condicion de inyeccion del hook
    state.path = [];               // sin executePath: solo caminar recto
    state.followTarget = null;     // probe exclusivo
    desiredInput.strafe = 0;
    desiredInput.forward = 1;
    desiredInput.jump = false;
    desiredInput.sneak = false;
    desiredInput.yaw = Number(player.yaw) || 0;
    // asegurar hook instalado ya (no esperar al loop)
    if (!inputHooked || state.player !== player) {
        restorePlayerHook();
        hookPlayerInput();
    }
    console.log(`${TAG} probe: caminando recto ${ms}ms...`);
    return true;
}

function finishProbe() {
    const pr = probeState;
    probeState = null;
    if (!pr) return null;
    const player = pr.player;
    const p = player.pos;
    const moved = Math.hypot(p.x - pr.startPos.x, p.y - pr.startPos.y, p.z - pr.startPos.z);
    const injected = injectedTicks - pr.startInjected;
    const report = {
        seconds: +((performance.now() - pr.startedAt) / 1000).toFixed(2),
        injectedTicks: injected,
        movedBlocks: +moved.toFixed(3),
        inputTookEffect: {
            currentInputUp: player.currentInput?.up ?? null,
            wWQmwuDLqA: typeof player.wWQmwuDLqA === 'number' ? +player.wWQmwuDLqA.toFixed(3) : (player.wWQmwuDLqA ?? null),
            YApHmhhGagG: typeof player.YApHmhhGagG === 'number' ? +player.YApHmhhGagG.toFixed(3) : (player.YApHmhhGagG ?? null),
            jumping: !!player.jumping
        },
        conclusion: injected === 0
            ? 'EL READER NO SE LLAMA: el metodo hookeado no es el que el juego usa por tick'
            : (moved < 0.05
                ? 'INYECTA PERO NO MUEVE: el apply no aplica el input (metodo equivocado o campos rotados)'
                : 'OK: input inyectado y el player se mueve')
    };
    console.log(`${TAG} probe result:`, report);
    // restaurar el input que habia
    Object.assign(desiredInput, pr.prevDesired);
    if (!state.followTarget && state.path.length === 0) {
        stop('idle', 'probe done');
    }
    return report;
}

// --- Búsqueda de métodos por firma (robusto a obfuscación) ---
// own:true = propiedad directa de la instancia (típicamente un hook wrapper
// de OTRO módulo); el original nativo vive más abajo en el prototipo.
// Acceso PRIMARIO vía instancia (obj[name]) — igual que AntiAFK: los getters
// necesitan this correcto; proto[name] directo puede devolver undefined.
function getMethods(obj) {
    const methods = [];
    const seenFns = new Set();
    let proto = obj;
    for (let depth = 0; proto && depth < 10; depth++) {
        let names = [];
        try { names = Object.getOwnPropertyNames(proto); } catch (_) {}
        for (const name of names) {
            if (name === 'constructor') continue;
            let fn = null;
            try { fn = obj[name]; } catch (_) { fn = null; }
            if (typeof fn !== 'function' || seenFns.has(fn)) {
                // fallback: version directa del nivel (nativo tapado por un
                // wrapper own de otro mod en la instancia)
                try { fn = proto[name]; } catch (_) { fn = null; }
                if (typeof fn !== 'function' || seenFns.has(fn)) continue;
            }
            seenFns.add(fn);
            let source = '';
            try { source = Function.prototype.toString.call(fn); } catch (_) {}
            methods.push({ name, fn, source, own: depth === 0 });
        }
        proto = Object.getPrototypeOf(proto);
    }
    return methods;
}

function resolveNativeInput(player) {
    const methods = getMethods(player);

    // Reader: firma con campos NO ofuscados (estables entre versiones)
    const readerBySig = m =>
        m.source.includes('sentInputThisTick') &&
        m.source.includes('currentInput') &&
        m.source.includes('jumping') &&
        m.source.includes('inputSequenceNumber');
    const readerBySigLoose = m =>
        m.source.includes('currentInput') &&
        m.source.includes('inputSequenceNumber');

    const reader =
        methods.find(m => m.name === 'bkkAvIfjEgvYuYRLXBgtj') ||
        methods.find(m => !m.own && readerBySig(m)) ||
        methods.find(readerBySig) ||
        methods.find(m => !m.own && readerBySigLoose(m)) ||
        methods.find(readerBySigLoose);

    // Apply: escribe campos de movimiento del player desde el input.
    // 1) nombres ofuscados conocidos (la version que tenia AntiAFK)
    // 2) POR LLAMADA DEL READER: el reader construye el input y llama
    //    this.XXX(input) — extraer los this.xxx( de su source y quedarse
    //    con el que escribe >=2 campos y lee campos de input (ROBUSTO a
    //    rotacion total de nombres: la relacion estructural no cambia)
    // 3) heuristica de firma (fallback)
    const applyObf = m =>
        m.source.includes('this.wWQmwuDLqA') &&
        m.source.includes('this.YApHmhhGagG') &&
        m.source.includes('this.jumping');
    const readsInputFields = s =>
        ['.left', '.right', '.up', '.down', '.forward', '.strafe', '.sneak', '.sprint', '.jump']
            .some(f => s.includes(f));
    const writesFields = s => (s.match(/this\.[A-Za-z_$][\w$]*\s*=(?!=)/g) || []).length;

    // candidatos que el reader llama directamente
    const readerCalls = [...reader.source.matchAll(/this\.([A-Za-z_$][\w$]*)\s*\(/g)]
        .map(mm => mm[1]);
    const applyFromReader = readerCalls
        .map(name => methods.find(m => m.name === name && m.fn !== reader.fn))
        .find(m => m && readsInputFields(m.source) && writesFields(m.source) >= 2);

    const applyHeuristic = m =>
        m.source.includes('this.jumping') &&
        readsInputFields(m.source) &&
        writesFields(m.source) >= 3;

    const apply =
        methods.find(m => m.name === 'OBHUlAPATf') ||
        applyFromReader ||
        methods.find(m => !m.own && applyObf(m)) ||
        methods.find(applyObf) ||
        methods.find(m => !m.own && applyHeuristic(m)) ||
        methods.find(applyHeuristic);

    // nombres de campos que el apply escribe (para diagnostico/verificacion)
    let applyWrites = [];
    if (apply) {
        applyWrites = [...new Set(
            [...apply.source.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map(mm => mm[1])
        )].slice(0, 10);
    }

    if (!reader || !apply) {
        // diagnostico: que fallo + candidatos que mencionan input/jumping
        const candidates = methods
            .filter(m => m.source.includes('inputSequenceNumber') ||
                         m.source.includes('this.jumping') ||
                         m.source.includes('currentInput'))
            .map(m => ({ name: m.name, own: m.own, len: m.source.length, head: m.source.slice(0, 100) }));
        state._resolveError = {
            readerFound: !!reader,
            applyFound: !!apply,
            methodCount: methods.length,
            candidates: candidates.slice(0, 8)
        };
        return null;
    }
    state._resolveError = null;

    // originalReader = valor ACTUAL del slot: si otro mod ya lo hookeo,
    // encadenamos sobre su wrapper (semántica correcta de hook chain)
    return {
        readerName: reader.name,
        applyName: apply.name,
        originalReader: player[reader.name],
        nativeApply: player[apply.name],
        applyWrites
    };
}

// secuencia monotona robusta: si el campo rotó de nombre, derivar de los
// seq de los inputs vivos (el ultimo visto +1) — nunca NaN/undefined
let fallbackSeq = 0;
function nextSequenceNumber(player) {
    try {
        const n = player.inputSequenceNumber;
        if (typeof n === 'number' && Number.isFinite(n)) {
            player.inputSequenceNumber = n + 1;
            fallbackSeq = n + 1;
            return n + 1;
        }
    } catch (_) {}
    fallbackSeq = Math.max(fallbackSeq + 1, (player.currentInput?.sequenceNumber ?? 0) + 1);
    return fallbackSeq;
}

function createNativeInput(player, controls) {
    // base: clon del currentInput VIVO (shape siempre correcto para esta
    // version; campos desconocidos heredan valores validos del juego)
    let data;
    try {
        data = { ...player.currentInput } || {};
    } catch (_) { data = {}; }
    Object.assign(data, {
        sequenceNumber: nextSequenceNumber(player),
        left: controls.strafe < -0.3,
        right: controls.strafe > 0.3,
        up: controls.forward > 0.3,
        down: controls.forward < -0.3,
        yaw: controls.yaw !== null ? controls.yaw : Number(player.yaw) || 0,
        pitch: Number(player.pitch) || 0,
        jump: controls.jump,
        sneak: controls.sneak,
        sprint: false,
        pos: null,
        ackId: player.lastServerAckId > 0 ? player.lastServerAckId : undefined,
        onGround: player.onGround,
        usingItem: false
    });

    try {
        const InputClass = player.currentInput?.constructor;
        if (InputClass && InputClass !== Object) return new InputClass(data);
    } catch (_) {}

    return data;
}

function neutralMovement(player) {
    if (!player) return;
    try {
        player.wWQmwuDLqA = 0;
        player.YApHmhhGagG = 0;
        player.jumping = false;
    } catch (_) {}
}

function restorePlayerHook() {
    const player = state.player;
    if (player && state.readerName && typeof state.originalReader === 'function') {
        try {
            if (player[state.readerName] !== state.originalReader) {
                player[state.readerName] = state.originalReader;
            }
        } catch (_) {}
    }
    neutralMovement(player);
    state.player = null;
    state.readerName = null;
    state.originalReader = null;
    state.nativeApply = null;
    inputHooked = false;
}

function hookPlayerInput() {
    if (inputHooked) return true;
    const game = getGame();
    if (!game?.player) return false;
    const player = game.player;

    const native = resolveNativeInput(player);
    if (!native) {
        // no spamear cada frame: avisar solo si cambia el player
        if (state._lastHookFail !== player) {
            state._lastHookFail = player;
            console.warn(`${TAG} Could not resolve native input methods (patron AntiAFK)`);
        }
        return false;
    }
    state._lastHookFail = null;

    state.player = player;
    state.readerName = native.readerName;
    state.originalReader = native.originalReader;
    state.nativeApply = native.nativeApply;
    state.applyWrites = native.applyWrites || [];

    const readerName = state.readerName;
    const originalReader = state.originalReader;
    const nativeApply = state.nativeApply;
    const applyWrites = state.applyWrites;

    player[readerName] = function (...args) {
        if (!state.enabled || state.status !== 'moving' || state.player !== this) {
            return originalReader.apply(this, args);
        }

        injectedTicks++;
        lastInjectAt = performance.now();
        const input = createNativeInput(this, desiredInput);

        this.sentInputThisTick = false;
        this.currentInput = input;

        // log del primer input: verificar shape/valores
        if (injectedTicks === 1) {
            try {
                console.log(`${TAG} primer input inyectado:`, {
                    ...input,
                    pos: input.pos === null ? 'null' : input.pos
                });
            } catch (_) {}
        }

        try {
            return nativeApply.call(this, input);
        } finally {
            // verificacion post-apply: que campos del player cambiaron con
            // nuestro input (diagnostico automatico del primer tick)
            if (injectedTicks === 1 && applyWrites.length) {
                try {
                    const after = {};
                    for (const f of applyWrites) after[f] = this[f];
                    console.log(`${TAG} campos del player tras apply:`, after);
                } catch (_) {}
            }
        }
    };

    inputHooked = true;
    console.log(`${TAG} Input hooked: reader=${readerName}, apply=${native.applyName}, applyWrites=[${applyWrites.join(',')}]`);
    return true;
}

function getGame(force = false) {
    const now = performance.now();
    if (!force && state.game?.player && now - state.lastGameScan < 500) return state.game;
    state.lastGameScan = now;
    try {
        const react = document.querySelector('#react');
        if (!react) return state.game?.player ? state.game : null;
        for (const root of Object.values(react)) {
            const game = root?.updateQueue?.baseState?.element?.props?.game;
            // mismo criterio que AntiAFK: pos Y world (baritone necesita world
            // para leer bloques y calcular rutas)
            if (game?.player?.pos && game?.world) { state.game = game; return game; }
        }
    } catch (_) {}
    return state.game?.player ? state.game : null;
}

function getWorld() { return state.game?.world || null; }

// --- Entity access (patrón HealthNameTags) ---
function looksLikeEntityMap(value) {
    if (!value || typeof value !== 'object') return false;
    try {
        if (typeof value.values !== 'function') return false;
        let checked = 0, found = 0;
        for (const v of value.values()) {
            if (++checked >= 8) break;
            if (v && v.pos && (v.mesh || v.profile)) found++;
        }
        return checked > 0 && found > 0;
    } catch (_) { return false; }
}

let entityMapCache = null;
function resolveEntityMap(game) {
    if (entityMapCache && looksLikeEntityMap(entityMapCache)) return entityMapCache;
    const direct = [
        game?.world?.entitiesDump,
        game?.world?.entities,
        game?.world?.entityMap,
        game?.entityManager?.entities
    ];
    for (const candidate of direct) {
        if (!looksLikeEntityMap(candidate)) continue;
        entityMapCache = candidate;
        return candidate;
    }
    return null;
}

// busca la entity de un jugador por username (patrón HealthNameTags:
// entity.profile.username + entity.mesh)
function findPlayerEntity(username) {
    const game = getGame();
    if (!game) return null;
    const entities = resolveEntityMap(game);
    if (!entities) return null;
    const wanted = String(username).toLowerCase();
    try {
        for (const entity of entities.values()) {
            const name = entity?.profile?.username;
            if (typeof name === 'string' && name.toLowerCase() === wanted && entity?.pos) {
                return entity;
            }
        }
    } catch (_) {}
    return null;
}

// --- Block Access ---
function isChunkLoaded(x, z) {
    const world = getWorld();
    if (!world) return false;
    const pos = { x: Math.floor(x), z: Math.floor(z) };
    try {
        if (typeof world.isBlockLoaded === 'function') {
            return world.isBlockLoaded(pos);
        }
        const proto = Object.getPrototypeOf(world);
        if (typeof proto.isBlockLoaded === 'function') {
            return proto.isBlockLoaded.call(world, pos);
        }
    } catch (_) {}
    // Fallback: assume loaded. getBlockState will return null if not.
    return true;
}

function getBlockState(x, y, z) {
    if (y < 0 || y > 255) return null;
    if (!isChunkLoaded(x, z)) return null;
    const world = getWorld();
    if (!world) return null;
    try {
        const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
        const proto = Object.getPrototypeOf(world);
        // world.getBlockState exige instanceof Vec3i (clase interna del juego)
        // y loguea "Invalid position" con objetos planos. La ruta chunk no
        // valida: getChunk({x,y,z}) lee x>>4/z>>4 y chunk.getBlockState lee
        // y>>4 directo — mismos datos, sin spamear el logger.
        if (typeof proto.getChunk === 'function') {
            const chunk = proto.getChunk.call(world, { x: fx, y: fy, z: fz });
            if (chunk != null && !chunk.isDummyChunk &&
                typeof chunk.getBlockState === 'function') {
                return chunk.getBlockState({ x: fx, y: fy, z: fz });
            }
            return null;
        }
        if (typeof proto.getBlockState !== 'function') return null;
        return proto.getBlockState.call(world, { x: fx, y: fy, z: fz });
    } catch (_) { return null; }
}

// Returns: true = solid, false = air/empty, null = unknown/unloaded
function blockSolidity(x, y, z) {
    const bs = getBlockState(x, y, z);
    if (!bs) return null;
    return bs.id !== 0;
}

function isSolid(x, y, z) {
    return blockSolidity(x, y, z) === true;
}

function isSafe(x, y, z) {
    const bs = getBlockState(x, y, z);
    if (!bs) return true;
    const id = bs.id;
    if (id === 8 || id === 9 || id === 10 || id === 11) return false;
    return true;
}

function isWalkable(x, y, z) {
    if (isSolid(x, y + 1, z) || isSolid(x, y + 2, z)) return false;
    if (!isSolid(x, y, z)) return false;
    if (!isSafe(x, y + 1, z) || !isSafe(x, y + 2, z)) return false;
    return true;
}

function canStand(x, y, z) {
    const feet = blockSolidity(x, y, z);        // should be air
    const head = blockSolidity(x, y + 1, z);    // should be air
    const floor = blockSolidity(x, y - 1, z);   // should be solid

    // If data unavailable, be permissive (assume walkable)
    if (feet === null && floor === null) return true;

    // Standard checks
    if (feet === true) return false;       // feet blocked
    if (head === true) return false;       // head blocked
    if (floor === false) return false;     // definitely no floor
    return isSafe(x, y, z) && isSafe(x, y + 1, z);
}

// --- A* Pathfinding ---
// busca el bloque standeable mas cercano al goal (columna): si el destino
// pedido no es parado-able (agua, interior de roca...), anclar a un vecino
// util en vez de dejar que A* explore el mapa entero en vano
function findStandableNear(x, y, z) {
    for (let r = 0; r <= 12; r++) {
        for (let dy = 0; dy >= -12; dy--) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // solo el anillo
                    const ny = y + dy;
                    if (ny < 1 || ny > 254) continue;
                    if (canStand(x + dx, ny, z + dz)) return { x: x + dx, y: ny, z: z + dz };
                }
            }
        }
    }
    return null;
}

function heuristic(x1, y1, z1, x2, y2, z2) {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    const dz = Math.abs(z1 - z2);
    return Math.max(dx, dz) + dy + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

function getNeighbors(x, y, z) {
    const dirs = [
        [1, 0], [-1, 0], [0, 1], [0, -1],   // flat 4-dir
        [1, 1], [1, -1], [-1, 1], [-1, -1]  // diagonal
    ];
    const result = [];

    for (const [dx, dz] of dirs) {
        const nx = x + dx;
        const nz = z + dz;
        const isDiagonal = dx !== 0 && dz !== 0;

        // Check for diagonal corner cutting
        if (isDiagonal) {
            if (isSolid(x + dx, y, z) || isSolid(x, y, z + dz)) continue;
        }

        // Try same level
        if (canStand(nx, y, nz)) {
            result.push({ x: nx, y, z: nz, cost: isDiagonal ? Math.SQRT2 : 1 });
            continue;
        }

        // Try step up (jump 1 block)
        if (canStand(nx, y + 1, nz) && canStand(x, y, z)) {
            result.push({ x: nx, y: y + 1, z: nz, cost: isDiagonal ? Math.SQRT2 + 0.5 : 1.5 });
            continue;
        }

        // Try step down
        if (canStand(nx, y - 1, nz)) {
            result.push({ x: nx, y: y - 1, z: nz, cost: isDiagonal ? Math.SQRT2 + 0.5 : 1.5 });
            continue;
        }

        // Try falling down up to 3 blocks
        for (let dy = 2; dy <= 3; dy++) {
            if (canStand(nx, y - dy, nz) && !isSolid(nx, y - dy + 1, nz) && !isSolid(nx, y - dy + 2, nz)) {
                result.push({ x: nx, y: y - dy, z: nz, cost: 1 + dy * 0.5 });
                break;
            }
        }
    }

    return result;
}

function findPath(startX, startY, startZ, goalX, goalY, goalZ, maxIterOverride) {
    startX = Math.floor(startX); startY = Math.floor(startY); startZ = Math.floor(startZ);
    goalX = Math.floor(goalX); goalY = Math.floor(goalY); goalZ = Math.floor(goalZ);

    // si el goal no es parado-able, anclar al mas cercano que si (evita que
    // A* explore el mapa entero cuando el destino esta en agua/roca)
    if (!canStand(goalX, goalY, goalZ)) {
        const alt = findStandableNear(goalX, goalY, goalZ);
        if (alt) {
            console.log(`${TAG} Goal ${goalX},${goalY},${goalZ} not standable — anchored to ${alt.x},${alt.y},${alt.z}`);
            goalX = alt.x; goalY = alt.y; goalZ = alt.z;
        }
    }

    const open = new MinHeap();
    const cameFrom = new Map();
    const gScore = new Map();
    const closed = new Set();

    const key = (x, y, z) => `${x},${y},${z}`;
    const startKey = key(startX, startY, startZ);

    gScore.set(startKey, 0);
    open.push({ x: startX, y: startY, z: startZ, f: heuristic(startX, startY, startZ, goalX, goalY, goalZ) });

    const startTime = performance.now();
    let iterations = 0;
    // rutas largas: heuristic weight 1.5 (greedy-ish) para no explorar en
    // anillos — con peso 1 puro, 160 bloques de distancia puede necesitar
    // >100k nodos; con 1.5 prioriza avanzar hacia el goal
    const H_WEIGHT = 1.5;
    const MAX_ITER = maxIterOverride || 12000;

    // best-effort: recordar el nodo mas cercano al goal; si se agota el
    // limite, devolver ruta hasta ahi (y repath desde alla) en vez de null
    let bestKey = null;
    let bestH = Infinity;

    const reconstruct = (endKey, endNode) => {
        const path = [];
        let ck = endKey;
        while (ck && cameFrom.has(ck)) {
            const [px, py, pz] = ck.split(',').map(Number);
            path.unshift({ x: px, y: py, z: pz });
            ck = cameFrom.get(ck);
        }
        path.push({ x: endNode.x, y: endNode.y, z: endNode.z });
        return path;
    };

    while (open.size > 0) {
        if (++iterations > MAX_ITER || performance.now() - startTime > state.maxPathTime) {
            console.warn(`${TAG} Path search exceeded limit (${iterations} iterations) — using best-effort path`);
            break;
        }

        const current = open.pop();
        const cKey = key(current.x, current.y, current.z);

        if (closed.has(cKey)) continue;
        closed.add(cKey);

        const h = heuristic(current.x, current.y, current.z, goalX, goalY, goalZ);
        if (h < bestH) { bestH = h; bestKey = cKey; }

        // Goal check (within 1 block)
        if (Math.abs(current.x - goalX) <= 1 && Math.abs(current.z - goalZ) <= 1 &&
            Math.abs(current.y - goalY) <= 2) {
            const path = reconstruct(cKey, current);
            console.log(`${TAG} Path found: ${path.length} nodes in ${iterations} iterations`);
            return path;
        }

        const neighbors = getNeighbors(current.x, current.y, current.z);

        for (const n of neighbors) {
            const nKey = key(n.x, n.y, n.z);
            if (closed.has(nKey)) continue;

            const tentG = (gScore.get(cKey) || 0) + n.cost;
            const existingG = gScore.get(nKey);

            if (existingG === undefined || tentG < existingG) {
                gScore.set(nKey, tentG);
                cameFrom.set(nKey, cKey);
                const f = tentG + heuristic(n.x, n.y, n.z, goalX, goalY, goalZ) * H_WEIGHT;
                open.push({ x: n.x, y: n.y, z: n.z, f });
            }
        }
    }

    // best-effort: llegar al punto mas proximo explorado (solo si avanzo de
    // verdad: al menos 8 bloques mas cerca que al empezar)
    if (bestKey && bestH < heuristic(startX, startY, startZ, goalX, goalY, goalZ) - 8) {
        const [bx, by, bz] = bestKey.split(',').map(Number);
        const path = reconstruct(bestKey, { x: bx, y: by, z: bz });
        console.log(`${TAG} Best-effort path: ${path.length} nodes (h=${bestH.toFixed(1)}), will re-path from there`);
        return path;
    }

    console.warn(`${TAG} No path found after ${iterations} iterations`);
    return null;
}

// --- Path Execution ---
function getLookVector(player) {
    try {
        let proto = Object.getPrototypeOf(player);
        for (let i = 0; i < 4; i++) proto = Object.getPrototypeOf(proto);
        if (typeof proto.getLook === 'function') return proto.getLook.call(player);
    } catch (_) {}
    const yaw = Number(player.yaw) || 0;
    const pitch = Number(player.pitch) || 0;
    const cp = Math.cos(pitch);
    return { x: -Math.sin(yaw) * cp, y: -Math.sin(pitch), z: Math.cos(yaw) * cp };
}

// girar la CAMARA (rig FPS: yawObject > pitchObject > camera). La camara
// manda: player.yaw la sigue cada tick, asi que girarla gira al player y
// resuelve tanto el rumbo de movimiento como la vista del usuario.
function turnCamera(player, yaw, pitch, speed = 0.35) {
    try {
        const camera = player?.game?.gameScene?.camera || player?.game?.player?.game?.gameScene?.camera;
        if (!camera?.parent?.parent) return false;
        const pitchObject = camera.parent;
        const yawObject = camera.parent.parent;
        if (yaw != null && typeof yawObject.rotation?.y === 'number') {
            let yawDiff = yaw - yawObject.rotation.y;
            while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
            while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
            yawObject.rotation.y += clamp(yawDiff, -speed, speed);
        }
        if (pitch != null && typeof pitchObject.rotation?.x === 'number') {
            let pitchDiff = pitch - pitchObject.rotation.x;
            while (pitchDiff > Math.PI) pitchDiff -= Math.PI * 2;
            while (pitchDiff < -Math.PI) pitchDiff += Math.PI * 2;
            pitchObject.rotation.x += clamp(pitchDiff, -speed * 0.7, speed * 0.7);
        }
        return true;
    } catch (_) { return false; }
}

// apuntar la camara a un punto del mundo estilo aimbot: yaw+pitch hacia el
// objetivo desde el ojo del player, con giro suavizado y velocidad alta
function aimCameraAt(player, tx, ty, tz, speed = 0.35) {
    const ex = player.pos.x;
    const ey = player.pos.y + 1.62; // altura de ojo
    const ez = player.pos.z;
    const dx = tx - ex;
    const dy = ty - ey;
    const dz = tz - ez;
    const distH = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, dz);
    const pitch = Math.atan2(dy, distH || 1e-6);
    return turnCamera(player, yaw, pitch, speed);
}

function applyMovementInput(player, strafe, forward, jump, sneak, yaw, pitch) {
    // Set desiredInput — the hooked reader will inject these as native input each tick
    desiredInput.strafe = strafe;
    desiredInput.forward = forward;
    desiredInput.jump = jump;
    desiredInput.sneak = sneak;
    // el yaw va DENTRO del input: el pipeline del juego lo aplica al player
    // (player.yaw lo pisa la camara cada tick, escribirlo directo no sirve)
    desiredInput.yaw = yaw != null ? yaw : Number(player.yaw) || 0;
    // girar la camara hacia el rumbo SOLO si no hay follow activo: en follow
    // la mira aimbot sobre la cabeza del objetivo manda (no pelear con ella)
    if (yaw != null && !state.followTarget) turnCamera(player, yaw, pitch);
}

function executePath(player, keepAlive = false) {
    if (state.path.length === 0 || state.pathIndex >= state.path.length) {
        if (!keepAlive) {
            // fin de ruta: si el goal real sigue lejos (ruta best-effort),
            // recalcular desde la pos actual en vez de declarar victoria
            const g = state.goal;
            if (g && Math.hypot(g.x - player.pos.x, g.y - player.pos.y, g.z - player.pos.z) > 3) {
                console.log(`${TAG} Local path done, goal still far — re-pathing`);
                repath();
                return true;
            }
            stop('idle', 'Path complete');
        }
        return false;
    }

    const target = state.path[state.pathIndex];
    const px = player.pos.x;
    const py = player.pos.y;
    const pz = player.pos.z;

    const dx = target.x + 0.5 - px;
    const dz = target.z + 0.5 - pz;
    const distSq = dx * dx + dz * dz;

    // Check if we've reached this node
    if (distSq < 0.36) { // within ~0.6 blocks
        state.pathIndex++;
        if (state.pathIndex >= state.path.length) {
            if (!keepAlive) {
                const g = state.goal;
                if (g && Math.hypot(g.x - player.pos.x, g.y - player.pos.y, g.z - player.pos.z) > 3) {
                    console.log(`${TAG} Local path done, goal still far — re-pathing`);
                    repath();
                    return true;
                }
                stop('idle', 'Destination reached');
            }
            return false;
        }
        return executePath(player, keepAlive);
    }

    // Calculate yaw to face the target
    const targetYaw = Math.atan2(-dx, dz);

    // Smoothly rotate towards target (via input.yaw — el mecanismo nativo)
    let yawDiff = targetYaw - Number(player.yaw || 0);
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

    const yawSpeed = 0.3;
    const newYaw = Number(player.yaw || 0) + clamp(yawDiff, -yawSpeed, yawSpeed);

    // Check if we need to jump
    const dy = target.y - py;
    const needJump = dy > 0.5 && Math.abs(dx) < 1.2 && Math.abs(dz) < 1.2;

    // Caminar en ARCO (como bots reales): forward SIEMPRE activo (>0.3 para
    // el boton up), strafe corrige el rumbo. Asi caminamos aunque el campo
    // yaw del input no aplique en esta version (rotado) — el strafe es el
    // motor de giro. El signo del strafe se auto-calibra mas abajo.
    const forward = 1.0;
    let strafe = 0;
    if (Math.abs(yawDiff) > 0.12) {
        const dir = state._strafeSign || 1;
        strafe = 0.6 * dir * Math.sign(yawDiff);
        if (strafe > 1) strafe = 1;
        if (strafe < -1) strafe = -1;
    }

    // auto-calibracion del signo del strafe: cada 40 ticks, si el error de
    // yaw NO disminuyo, el arco va al lado equivocado → invertir
    state._calibTicks = (state._calibTicks || 0) + 1;
    if (state._calibTicks % 40 === 0) {
        const err = Math.abs(yawDiff);
        if (state._yawErrPrev != null && err > state._yawErrPrev + 0.03 && Math.abs(yawDiff) > 0.3) {
            state._strafeSign = -(state._strafeSign || 1);
            console.log(`${TAG} strafe invertido (auto-calibrado) → ${state._strafeSign > 0 ? 'derecha' : 'izquierda'}`);
            state._yawErrPrev = null;
        } else {
            state._yawErrPrev = err;
        }
    }

    // yaw objetivo via input (si el juego lo aplica, gira de verdad y mas rapido)
    applyMovementInput(player, strafe, forward, needJump, false, newYaw);

    // Re-path if stuck
    state.repathTimer++;
    if (state.repathTimer > 200) { // ~3 seconds at 60fps with no progress
        const lastPos = state._lastPos;
        if (lastPos) {
            const moved = Math.hypot(px - lastPos.x, pz - lastPos.z);
            if (moved < 0.5) {
                state._stuckCount = (state._stuckCount || 0) + 1;
                console.log(`${TAG} Stuck detected (x${state._stuckCount}), re-pathing`);
                // al 2do stuck seguido: diagnosticar automaticamente por que
                // no se mueve (reader no llamado vs input que no aplica)
                if (state._stuckCount === 2 && injectedTicks === 0) {
                    console.warn(`${TAG} 0 inyecciones desde el start — corriendo probe...`);
                    startProbe(1000);
                    return false;
                }
                repath();
                return false;
            }
        }
        state._lastPos = { x: px, y: py, z: pz };
        state.repathTimer = 0;
    }

    return true;
}

// --- Follow ---
function follow(username) {
    const game = getGame(true);
    if (!game?.player) { console.warn(`${TAG} No player`); return false; }

    const entity = findPlayerEntity(username);
    if (!entity?.pos) {
        console.warn(`${TAG} Player "${username}" not found`);
        return false;
    }

    state.enabled = true;
    state.followTarget = String(username);
    state.followEntity = entity;
    state.goal = { x: Math.floor(entity.pos.x), y: Math.floor(entity.pos.y), z: Math.floor(entity.pos.z) };
    state.status = 'moving';
    state.path = [];
    state.pathIndex = 0;
    state.followRepathAt = 0;

    console.log(`${TAG} Following "${username}"`);
    emitState();
    return true;
}

function stopFollow(silent = false) {
    state.followTarget = null;
    state.followEntity = null;
    if (!silent) console.log(`${TAG} Follow stopped`);
}

// persecucion directa EN ARCO: forward siempre activo (>0.3 umbral del
// boton up), strafe corrige el rumbo, yaw via input por si aplica. Con
// auto-calibracion del signo: si tras 40 ticks el error de yaw empeoro,
// el arco gira al lado equivocado para esta version → invertir.
function directChase(player, dx, dz) {
    const targetYaw = Math.atan2(-dx, dz);
    let yawDiff = targetYaw - Number(player.yaw || 0);
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

    const forward = 1.0;
    let strafe = 0;
    if (Math.abs(yawDiff) > 0.12) {
        const dir = state._strafeSign || 1;
        strafe = 0.6 * dir * Math.sign(yawDiff);
        if (strafe > 1) strafe = 1;
        if (strafe < -1) strafe = -1;
    }

    // auto-calibracion (cada 40 frames)
    state._calibTicks = (state._calibTicks || 0) + 1;
    if (state._calibTicks % 40 === 0) {
        const err = Math.abs(yawDiff);
        if (state._yawErrPrev != null && err > state._yawErrPrev + 0.03 && Math.abs(yawDiff) > 0.3) {
            state._strafeSign = -(state._strafeSign || 1);
            console.log(`${TAG} strafe invertido (auto-calibrado) → ${state._strafeSign > 0 ? 'derecha' : 'izquierda'}`);
            state._yawErrPrev = null;
        } else {
            state._yawErrPrev = err;
        }
    }

    const newYaw = Number(player.yaw || 0) + clamp(yawDiff, -0.3, 0.3);
    applyMovementInput(player, strafe, forward, false, false, newYaw);
}

// re-target cada ~1.5s: el objetivo se mueve, la ruta no puede ser fija
function followTick(player, now) {
    const username = state.followTarget;
    if (!username) return false;

    // refrescar entity cacheada si se invalido / se fue
    let entity = state.followEntity;
    if (!entity?.pos || now - state.lastFollowScan > 1000) {
        state.lastFollowScan = now;
        entity = findPlayerEntity(username);
        state.followEntity = entity;
    }
    if (!entity?.pos) {
        // objetivo fuera de rango: quedarse esperando (sigue activo)
        applyMovementInput(player, 0, 0, false, false);
        return true;
    }

    const dx = entity.pos.x - player.pos.x;
    const dz = entity.pos.z - player.pos.z;
    const distH = Math.hypot(dx, dz);

    // MODO AIMBOT: la camara fija la mirada en la CABEZA del jugador
    // seguido cada frame (velocidad alta = tracking agresivo). Ocurre en
    // todos los estados de follow: caminando, esperando y cerca.
    aimCameraAt(player,
        entity.pos.x,
        entity.pos.y + 1.5, // cabeza
        entity.pos.z,
        0.45);

    // goal fresco para repath/diagnostico
    state.goal = { x: Math.floor(entity.pos.x), y: Math.floor(entity.pos.y), z: Math.floor(entity.pos.z) };

    // cerca: quedarse mirandolo (la camara ya lo rastrea) sin empujar
    if (distH < 2.5) {
        applyMovementInput(player, 0, 0, false, false);
        return true;
    }

    // MUY lejos: persecucion directa SIEMPRE (sin A*). Un A* de 100+ bloques
    // puede tardar segundos y congelar el frame; en persecucion lo que importa
    // es avanzar hacia el objetivo, no la ruta optima
    if (distH > 24) {
        directChase(player, dx, dz);
        return true;
    }

    // cerca (<=24): A* local con presupuesto bajo (el objetivo se mueve, la
    // ruta se recalcula igual cada poco) — nunca congelar el frame por follow
    if (now >= state.followRepathAt) {
        state.followRepathAt = now + 1500;
        const path = findPath(player.pos.x, player.pos.y, player.pos.z,
                              entity.pos.x, entity.pos.y, entity.pos.z, 3000);
        if (path && path.length > 0) {
            // usar solo los primeros nodos: el objetivo se mueve
            state.path = path.slice(0, 10);
            state.pathIndex = 0;
        } else {
            // sin ruta local: perseguir directo
            state.path = [];
        }
    }

    // seguir la ruta local si existe, si no perseguir directo
    if (state.path.length > 0 && state.pathIndex < state.path.length) {
        const ok = executePath(player, true);
        if (!ok && state.status !== 'moving') return true; // ruta completa → seguir esperando
    } else {
        // persecucion directa en arco (forward siempre + strafe corrige rumbo)
        directChase(player, dx, dz);
    }
    return true;
}

// --- Commands ---
function goto(x, y, z) {
    const game = getGame(true);
    if (!game?.player) { console.warn(`${TAG} No player`); return false; }

    stopFollow(true);
    state.enabled = true;
    state.goal = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
    state.status = 'pathfinding';
    console.log(`${TAG} Going to ${x}, ${y}, ${z}`);

    const p = game.player;
    const path = findPath(p.pos.x, p.pos.y, p.pos.z, state.goal.x, state.goal.y, state.goal.z);

    if (path && path.length > 0) {
        state.path = path;
        state.pathIndex = 0;
        state.repathTimer = 0;
        state._lastPos = null;
        state._stuckCount = 0;
        state.status = 'moving';
        emitState();
        return true;
    }
    console.warn(`${TAG} No path found to destination`);
    stop('failed', 'No path found');
    return false;
}

function repath() {
    if (!state.goal) return;
    const game = getGame(true);
    if (!game?.player) return;
    const p = game.player;
    const path = findPath(p.pos.x, p.pos.y, p.pos.z, state.goal.x, state.goal.y, state.goal.z);
    if (path && path.length > 0) {
        state.path = path;
        state.pathIndex = 0;
        state.repathTimer = 0;
        state._lastPos = null;
        state.status = 'moving';
    } else {
        stop('failed', 'Re-path failed');
    }
    emitState();
}

function stop(status = 'idle', reason = '') {
    state.path = [];
    state.pathIndex = 0;
    state.goal = null;
    state.status = status;
    state.followTarget = null;
    state.followEntity = null;
    state._loopErr = false;
    // Reset desired input so the hook doesn't keep moving us
    desiredInput.strafe = 0;
    desiredInput.forward = 0;
    desiredInput.jump = false;
    desiredInput.sneak = false;
    desiredInput.yaw = null;
    // Neutralize movement fields on the player
    neutralMovement(state.player);
    console.log(`${TAG} Stopped: ${reason}`);
    emitState();
}

// --- Main Loop ---
function loop() {
    if (state.enabled) {
        try {
            const game = getGame();
            const player = game?.player;

            if (game && player) {
                // Re-hook if player instance changed or not hooked yet
                // (mismo patron que AntiAFK: sin checks extra como ticksExisted,
                // que puede ser undefined y bloquear el hook para siempre)
                if (!inputHooked || state.player !== player) {
                    restorePlayerHook();
                    hookPlayerInput();
                }
                if (state.status === 'moving') {
                // probe activo: solo caminar recto y terminar al vencer
                if (probeState) {
                    if (performance.now() >= probeState.until) finishProbe();
                } else if (state.followTarget) {
                    followTick(player, performance.now());
                } else if (state.path.length > 0) {
                    executePath(player);
                }
            }
            }
        } catch (err) {
            // un throw aqui mataria el loop para siempre (rAF esta al final):
            // tragar y seguir vivo, avisando solo la primera vez
            if (!state._loopErr) {
                state._loopErr = true;
                console.warn(`${TAG} Loop error (suprimidos los siguientes):`, err);
            }
        }
    }

    requestAnimationFrame(loop);
}

// --- Events ---
document.addEventListener(EVENT_CONFIG, event => {
    let cfg;
    try { cfg = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail; }
    catch (_) { return; }
    if (!cfg || !('enabled' in cfg)) return;

    if (cfg.enabled) {
        state.enabled = true;
    } else {
        state.enabled = false;
        stop('idle', 'Disabled via config');
        restorePlayerHook();
    }
    emitState();
}, true);

document.addEventListener(EVENT_COMMAND, event => {
    let cmd;
    try { cmd = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail; }
    catch (_) { return; }
    if (!cmd) return;

    switch (cmd.type) {
        case 'goto':
            goto(cmd.x, cmd.y || 0, cmd.z);
            break;
        case 'follow':
            follow(cmd.username);
            break;
        case 'stop':
            stop('idle', 'User stopped');
            break;
        case 'enable':
            state.enabled = true;
            emitState();
            break;
        case 'disable':
            state.enabled = false;
            stop('idle', 'Disabled');
            break;
    }
}, true);

function emitState() {
    try {
        document.dispatchEvent(new CustomEvent(EVENT_STATE, {
            detail: JSON.stringify({
                enabled: state.enabled,
                status: state.status,
                goal: state.goal,
                following: state.followTarget,
                pathLength: state.path.length,
                pathIndex: state.pathIndex
            })
        }));
    } catch (_) {}
}

// --- Public API ---
globalThis.Baritone = {
    goto(x, y, z) {
        if (y === undefined) {
            // Auto-detect Y from world
            const game = getGame(true);
            if (game?.player) y = Math.floor(game.player.pos.y);
            else y = 64;
        }
        return goto(x, y, z);
    },
    follow(username) { return follow(username); },
    unfollow() { stopFollow(); },
    probe(ms) { return startProbe(ms); },
    stop() { stop('idle', 'API stop'); },
    enable() { state.enabled = true; emitState(); return state.enabled; },
    disable() {
        stop('idle', 'Disabled');
        state.enabled = false;
        restorePlayerHook();
        emitState();
        return state.enabled;
    },
    get status() { return state.status; },
    get goal() { return state.goal; },
    get pathLength() { return state.path.length; },
    debug() {
        return {
            enabled: state.enabled,
            status: state.status,
            hooked: inputHooked,
            readerName: state.readerName,
            resolveError: state._resolveError,
            injectedTicks,
            msSinceLastInject: lastInjectAt ? Math.round(performance.now() - lastInjectAt) : null,
            desired: { ...desiredInput },
            followTarget: state.followTarget,
            path: state.path.length,
            pathIndex: state.pathIndex
        };
    }
};

console.log(`${TAG} Baritone loaded. Use Baritone.goto(x, y, z) or Baritone.stop()`);

requestAnimationFrame(loop);
})();
