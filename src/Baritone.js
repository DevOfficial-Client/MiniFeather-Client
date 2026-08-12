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
    _lastPos: null
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

// --- Búsqueda de métodos por firma (robusto a obfuscación) ---
function getMethods(obj) {
    const methods = [];
    const seen = new Set();
    let proto = obj;
    for (let depth = 0; proto && depth < 10; depth++) {
        let names = [];
        try { names = Object.getOwnPropertyNames(proto); } catch (_) {}
        for (const name of names) {
            if (name === 'constructor' || seen.has(name)) continue;
            seen.add(name);
            let fn = null;
            try { fn = proto[name]; } catch (_) {}
            if (typeof fn !== 'function') continue;
            let source = '';
            try { source = Function.prototype.toString.call(fn); } catch (_) {}
            methods.push({ name, fn, source });
        }
        proto = Object.getPrototypeOf(proto);
    }
    return methods;
}

function resolveNativeInput(player) {
    const methods = getMethods(player);

    // Reader: lee input del teclado, tiene sentInputThisTick, currentInput, jumping, inputSequenceNumber
    const reader =
        methods.find(m => m.source.includes('sentInputThisTick') &&
                          m.source.includes('currentInput') &&
                          m.source.includes('jumping') &&
                          m.source.includes('inputSequenceNumber'));

    // Apply: aplica el input al jugador, tiene this.wWQmwuDLqA, this.YApHmhhGagG, this.jumping
    const apply =
        methods.find(m => m.source.includes('this.wWQmwuDLqA') &&
                          m.source.includes('this.YApHmhhGagG') &&
                          m.source.includes('this.jumping'));

    if (!reader || !apply) return null;

    return {
        readerName: reader.name,
        applyName: apply.name,
        originalReader: player[reader.name],
        nativeApply: player[apply.name]
    };
}

function createNativeInput(player, controls) {
    const data = {
        sequenceNumber: ++player.inputSequenceNumber,
        left: controls.strafe < -0.3,
        right: controls.strafe > 0.3,
        up: controls.forward > 0.3,
        down: controls.forward < -0.3,
        yaw: controls.yaw !== null ? controls.yaw : player.yaw,
        pitch: player.pitch,
        jump: controls.jump,
        sneak: controls.sneak,
        sprint: false,
        pos: null,
        ackId: player.lastServerAckId > 0 ? player.lastServerAckId : undefined,
        onGround: player.onGround,
        usingItem: false
    };

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
        console.warn(`${TAG} Could not resolve native input methods`);
        return false;
    }

    state.player = player;
    state.readerName = native.readerName;
    state.originalReader = native.originalReader;
    state.nativeApply = native.nativeApply;

    const readerName = state.readerName;
    const originalReader = state.originalReader;
    const nativeApply = state.nativeApply;

    player[readerName] = function (...args) {
        if (!state.enabled || state.status !== 'moving' || state.player !== this) {
            return originalReader.apply(this, args);
        }

        const input = createNativeInput(this, desiredInput);

        this.sentInputThisTick = false;
        this.wWQmwuDLqA = 0;
        this.YApHmhhGagG = 0;
        this.currentInput = input;

        return nativeApply.call(this, input);
    };

    inputHooked = true;
    console.log(`${TAG} Input hooked: reader=${readerName}`);
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
            if (game?.player) { state.game = game; return game; }
        }
    } catch (_) {}
    return state.game?.player ? state.game : null;
}

function getWorld() { return state.game?.world || null; }

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
        const proto = Object.getPrototypeOf(world);
        if (typeof proto.getBlockState !== 'function') return null;
        return proto.getBlockState.call(world, { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
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

function findPath(startX, startY, startZ, goalX, goalY, goalZ) {
    startX = Math.floor(startX); startY = Math.floor(startY); startZ = Math.floor(startZ);
    goalX = Math.floor(goalX); goalY = Math.floor(goalY); goalZ = Math.floor(goalZ);

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
    const MAX_ITER = 8000;

    while (open.size > 0) {
        if (++iterations > MAX_ITER || performance.now() - startTime > state.maxPathTime) {
            console.warn(`${TAG} Path search exceeded limit (${iterations} iterations)`);
            break;
        }

        const current = open.pop();
        const cKey = key(current.x, current.y, current.z);

        if (closed.has(cKey)) continue;
        closed.add(cKey);

        // Goal check (within 1 block)
        if (Math.abs(current.x - goalX) <= 1 && Math.abs(current.z - goalZ) <= 1 &&
            Math.abs(current.y - goalY) <= 2) {
            // Reconstruct path
            const path = [];
            let ck = cKey;
            while (ck && cameFrom.has(ck)) {
                const [px, py, pz] = ck.split(',').map(Number);
                path.unshift({ x: px, y: py, z: pz });
                ck = cameFrom.get(ck);
            }
            path.push({ x: current.x, y: current.y, z: current.z });
            console.log(`${TAG} Path found: ${path.length} nodes in ${iterations} iterations`);
            return path;
        }

        const neighbors = getNeighbors(current.x, current.y, current.z);

        if (iterations <= 2) {
            console.log(`${TAG} Iteration ${iterations} at (${current.x},${current.y},${current.z}): ${neighbors.length} neighbors`);
        }

        for (const n of neighbors) {
            const nKey = key(n.x, n.y, n.z);
            if (closed.has(nKey)) continue;

            const tentG = (gScore.get(cKey) || 0) + n.cost;
            const existingG = gScore.get(nKey);

            if (existingG === undefined || tentG < existingG) {
                gScore.set(nKey, tentG);
                cameFrom.set(nKey, cKey);
                const f = tentG + heuristic(n.x, n.y, n.z, goalX, goalY, goalZ);
                open.push({ x: n.x, y: n.y, z: n.z, f });
            }
        }
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

function applyMovementInput(player, strafe, forward, jump, sneak) {
    // Set desiredInput — the hooked reader will inject these as native input each tick
    desiredInput.strafe = strafe;
    desiredInput.forward = forward;
    desiredInput.jump = jump;
    desiredInput.sneak = sneak;
    desiredInput.yaw = player.yaw;
}

function executePath(player) {
    if (state.path.length === 0 || state.pathIndex >= state.path.length) {
        stop('idle', 'Path complete');
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
            stop('idle', 'Destination reached');
            return false;
        }
        return executePath(player);
    }

    // Calculate yaw to face the target
    const targetYaw = Math.atan2(-dx, dz);

    // Smoothly rotate towards target
    let yawDiff = targetYaw - player.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

    const yawSpeed = 0.3;
    if (Math.abs(yawDiff) > yawSpeed) {
        player.yaw += Math.sign(yawDiff) * yawSpeed;
    }
    desiredInput.yaw = player.yaw;

    // Check if we need to jump
    const dy = target.y - py;
    const needJump = dy > 0.5 && Math.abs(dx) < 1.2 && Math.abs(dz) < 1.2;

    // Movement: walk forward when roughly facing the right direction
    const facingTarget = Math.abs(yawDiff) < 0.8;
    const forward = facingTarget ? 1.0 : 0.1;
    const strafe = facingTarget ? 0 : (yawDiff > 0 ? 0.3 : -0.3);

    applyMovementInput(player, strafe, forward, needJump, false);

    // Re-path if stuck
    state.repathTimer++;
    if (state.repathTimer > 200) { // ~3 seconds at 60fps with no progress
        const lastPos = state._lastPos;
        if (lastPos) {
            const moved = Math.hypot(px - lastPos.x, pz - lastPos.z);
            if (moved < 0.5) {
                console.log(`${TAG} Stuck detected, re-pathing`);
                repath();
                return false;
            }
        }
        state._lastPos = { x: px, y: py, z: pz };
        state.repathTimer = 0;
    }

    return true;
}

// --- Commands ---
function goto(x, y, z) {
    const game = getGame(true);
    if (!game?.player) { console.warn(`${TAG} No player`); return; }

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
        state.status = 'moving';
        emitState();
    } else {
        console.warn(`${TAG} No path found to destination`);
        stop('failed', 'No path found');
    }
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
        const game = getGame();
        const player = game?.player;

        if (game && player && player.ticksExisted > 0) {
            // Re-hook if player instance changed or not hooked yet
            if (!inputHooked || state.player !== player) {
                restorePlayerHook();
                hookPlayerInput();
            }
            if (state.status === 'moving' && state.path.length > 0) {
                executePath(player);
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
        goto(x, y, z);
    },
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
    get pathLength() { return state.path.length; }
};

console.log(`${TAG} Baritone loaded. Use Baritone.goto(x, y, z) or Baritone.stop()`);

requestAnimationFrame(loop);
})();
