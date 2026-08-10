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
    cacheVersion: 0
};

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// Desired input that Baritone wants to inject each tick
const desiredInput = {
    strafe: 0,      // -1 to 1
    forward: 0,     // -1 to 1
    jump: false,
    sneak: false,
    yaw: null       // target yaw to set
};

let inputHooked = false;

function findMethodOnProtoChain(obj, methodName, maxDepth = 6) {
    let p = Object.getPrototypeOf(obj);
    for (let i = 0; i < maxDepth && p; i++) {
        if (typeof p[methodName] === 'function') return p;
        p = Object.getPrototypeOf(p);
    }
    return null;
}

function hookPlayerInput() {
    if (inputHooked) return;
    const game = getGame();
    if (!game?.player) return;
    const player = game.player;

    // The input method that resets strafe/forward, reads keyboard, builds packet
    const inputProto = findMethodOnProtoChain(player, 'cwUlQghwbXGysIbLwFMtw');
    // The method that actually sets strafe/forward from input booleans
    const applyProto = findMethodOnProtoChain(player, 'qcWSTxdfzJ');

    if (!inputProto && !applyProto) {
        console.warn(`${TAG} Could not find input methods to hook`);
        return;
    }

    // Hook cwUlQghwbXGysIbLwFMtw — runs BEFORE physics
    if (inputProto) {
        const origInput = inputProto.cwUlQghwbXGysIbLwFMtw;
        inputProto.cwUlQghwbXGysIbLwFMtw = function (...args) {
            // Call original — reads keyboard, builds+sends packet, calls qcWSTxdfzJ
            origInput.apply(this, args);

            // Override AFTER original — physics hasn't run yet (runs in super.onLivingUpdate)
            if (state.enabled && state.status === 'moving') {
                // Game convention: FYwYZZgqKAr: up/W=-1, down/S=+1
                this.FYwYZZgqKAr = -desiredInput.forward;
                // Game convention: jidcIFbLoW: right/D=+1, left/A=-1
                this.jidcIFbLoW = desiredInput.strafe;
                this.jumping = desiredInput.jump;
                this.sneak = desiredInput.sneak;
                if (desiredInput.yaw !== null) {
                    this.yaw = desiredInput.yaw;
                    this.pitch = 0; // look straight ahead
                }
            }
        };
    }

    // ALSO hook qcWSTxdfzJ — override the input object BEFORE it sets strafe/forward
    if (applyProto) {
        const origApply = applyProto.qcWSTxdfzJ;
        applyProto.qcWSTxdfzJ = function (input, ...rest) {
            if (state.enabled && state.status === 'moving' && input) {
                // Override the booleans that qcWSTxdfzJ reads
                input.up = desiredInput.forward > 0.3;    // forward → W/up
                input.down = desiredInput.forward < -0.3;  // backward → S/down
                input.left = desiredInput.strafe < -0.3;   // left → A
                input.right = desiredInput.strafe > 0.3;    // right → D
                input.jump = desiredInput.jump;
                input.sneak = desiredInput.sneak;
                if (desiredInput.yaw !== null) input.yaw = desiredInput.yaw;
            }
            return origApply.call(this, input, ...rest);
        };
    }

    inputHooked = true;
    console.log(`${TAG} Hooks installed: cwUlQghwbXGysIbLwFMtw=${!!inputProto}, qcWSTxdfzJ=${!!applyProto}`);
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

let _suppressErrors = false;
const _origConsoleError = console.error.bind(console);

function getBlockState(x, y, z) {
    if (y < 0 || y > 255) return null;
    if (!isChunkLoaded(x, z)) return null;
    const world = getWorld();
    if (!world) return null;
    try {
        const proto = Object.getPrototypeOf(world);
        if (typeof proto.getBlockState !== 'function') return null;
        // Suppress game's internal error logging for invalid positions
        _suppressErrors = true;
        return proto.getBlockState.call(world, { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
    } catch (_) { return null; }
    finally { _suppressErrors = false; }
}

console.error = function (...args) {
    if (_suppressErrors) return;
    return _origConsoleError.apply(console, args);
};

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
    // Set desiredInput — the hooked cwUlQghwbXGysIbLwFMtw will apply these each tick
    desiredInput.strafe = strafe;
    desiredInput.forward = forward;
    desiredInput.jump = jump;
    desiredInput.sneak = sneak;
    desiredInput.yaw = player.yaw; // Keep yaw in sync so the hook applies it
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
    console.log(`${TAG} Stopped: ${reason}`);
    emitState();
}

// --- Main Loop ---
function loop() {
    if (state.enabled) {
        const game = getGame();
        const player = game?.player;

        if (game && player && player.ticksExisted > 0) {
            if (!inputHooked) hookPlayerInput();
            if (state.status === 'moving' && state.path.length > 0) {
                executePath(player);
            }
        }
    }

    requestAnimationFrame(loop);
}

// --- Events ---
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

// --- Chat Command Integration ---
const originalChatSend = window.WebSocket?.prototype?.send;
function hookChat() {
    // Listen for chat input to intercept #goto, #stop etc.
    const chatInput = document.querySelector('input[type="text"]') ||
                      document.querySelector('textarea');
    // Will be handled via event system instead
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
    disable() { state.enabled = false; stop('idle', 'Disabled'); return state.enabled; },
    get status() { return state.status; },
    get goal() { return state.goal; },
    get pathLength() { return state.path.length; }
};

console.log(`${TAG} Baritone loaded. Use Baritone.goto(x, y, z) or Baritone.stop()`);

requestAnimationFrame(loop);
})();
