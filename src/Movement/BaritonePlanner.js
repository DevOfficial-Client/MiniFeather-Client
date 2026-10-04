(function () {
    'use strict';

    const ROOT = globalThis;
    const SQRT2 = Math.SQRT2;
    const DIRECTIONS = [
        [1, 0], [0, 1], [-1, 0], [0, -1],
        [1, 1], [-1, 1], [-1, -1], [1, -1]
    ];
    const key = p => `${p.x},${p.y},${p.z}`;
    const edgeKey = (a, b) => `${key(a)}>${key(b)}`;
    const clamp = (value, fallback, min, max) => {
        const n = Number(value);
        return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    function position(value) {
        if (!value || !['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]) && Math.abs(value[axis]) <= 30000000)) return null;
        return { x: Math.floor(value.x), y: Math.floor(value.y), z: Math.floor(value.z) };
    }
    function horizontalDistance(a, b, radius = 0) {
        const dx = Math.max(0, Math.abs(a.x - b.x) - radius);
        const dz = Math.max(0, Math.abs(a.z - b.z) - radius);
        return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
    }

    class Heap {
        constructor() { this.items = []; }
        get size() { return this.items.length; }
        less(a, b) { return a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && a.order < b.order))); }
        push(item) {
            let index = this.items.length;
            this.items.push(item);
            while (index > 0) {
                const parent = (index - 1) >> 1;
                if (!this.less(item, this.items[parent])) break;
                this.items[index] = this.items[parent];
                index = parent;
            }
            this.items[index] = item;
        }
        pop() {
            const first = this.items[0];
            const last = this.items.pop();
            if (this.items.length) {
                let index = 0;
                while (true) {
                    const left = index * 2 + 1;
                    if (left >= this.items.length) break;
                    const right = left + 1;
                    const child = right < this.items.length && this.less(this.items[right], this.items[left]) ? right : left;
                    if (!this.less(this.items[child], last)) break;
                    this.items[index] = this.items[child];
                    index = child;
                }
                this.items[index] = last;
            }
            return first;
        }
    }

    function create(readCell, options = {}) {
        if (typeof readCell !== 'function') throw new TypeError('BaritonePlanner requires a block reader');
        const now = typeof options.now === 'function' ? options.now : () => ROOT.performance?.now?.() ?? Date.now();
        const defaults = {
            allowMine: options.allowMine === true,
            allowGap: options.allowGap !== false,
            maxDrop: Math.floor(clamp(options.maxDrop, 3, 0, 3)),
            mineCost: clamp(options.mineCost, 4, 1, 100),
            maxNodesTotal: Math.floor(clamp(options.maxNodesTotal, 12000, 1, 20000)),
            maxTimeMs: clamp(options.maxTimeMs, 2000, 1, 5000),
            goalRadius: Math.floor(clamp(options.goalRadius, 2, 0, 4)),
            blockedEdges: options.blockedEdges
        };

        function cell(x, y, z, observeUnknown) {
            let value;
            try { value = readCell(x, y, z); } catch { value = null; }
            if (!value || value.known !== true || typeof value.solid !== 'boolean') {
                observeUnknown?.();
                return null;
            }
            return value;
        }
        const clear = value => !!value && !value.solid && !value.hazard;
        const support = value => {
            const height = value?.height ?? value?.supportHeight;
            if (!value || !value.solid || value.hazard ||
                (height != null && (!Number.isFinite(height) || height < 0.99 || height > 1.01))) return false;
            if (Array.isArray(value.collision)) {
                // Integer feet coordinates cannot represent standing on slabs,
                // fences or a narrow post. Require a full-height box beneath
                // the player's centered 0.6-block footprint when provided.
                return value.collision.some(box => box?.min && box?.max &&
                    [box.min.x, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite) &&
                    box.min.x <= 0.2 && box.max.x >= 0.8 && box.min.z <= 0.2 && box.max.z >= 0.8 &&
                    box.max.y >= 0.99 && box.max.y <= 1.01);
            }
            return true;
        };
        function stand(x, y, z, observeUnknown) {
            return clear(cell(x, y, z, observeUnknown)) && clear(cell(x, y + 1, z, observeUnknown)) &&
                support(cell(x, y - 1, z, observeUnknown));
        }
        function candidates(goal, radius) {
            const result = [];
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    for (let dy = -radius; dy <= radius; dy++) {
                        const p = { x: goal.x + dx, y: goal.y + dy, z: goal.z + dz };
                        if (stand(p.x, p.y, p.z)) result.push(p);
                    }
                }
            }
            result.sort((a, b) => {
                const distance = p => (p.x - goal.x) ** 2 + (p.y - goal.y) ** 2 + (p.z - goal.z) ** 2;
                return distance(a) - distance(b);
            });
            return result;
        }
        function nearestStand(value, radius = 4) {
            const goal = position(value);
            if (!goal) return null;
            if (stand(goal.x, goal.y, goal.z)) return goal;
            return candidates(goal, Math.floor(clamp(radius, 4, 0, 4)))[0] ?? null;
        }

        function validateTransition(fromValue, toValue) {
            const from = position(fromValue);
            const to = position(toValue);
            if (!from || !to || !stand(from.x, from.y, from.z) || typeof toValue.action !== 'string') return false;
            return getNeighbors(from, defaults).some(next => {
                if (next.x !== to.x || next.y !== to.y || next.z !== to.z) return false;
                if (toValue.action !== 'mine') return next.action === toValue.action;
                // Mining is checked before execution. Once some or all of the
                // planned blocks disappear, the same edge may become walking;
                // never silently add a newly appeared obstacle to that plan.
                if (next.action === 'walk') return true;
                return next.action === 'mine' && Array.isArray(toValue.breakBlocks) &&
                    next.breakBlocks.every(block => toValue.breakBlocks.some(planned =>
                        planned.x === block.x && planned.y === block.y && planned.z === block.z));
            });
        }

        function getNeighbors(p, config, observeUnknown) {
            const output = [];
            const plannedClear = value => p.action === 'mine' && p.breakBlocks?.some(block =>
                block.x === value.x && block.y === value.y && block.z === value.z);
            for (const y of [p.y, p.y + 1]) {
                const originCell = cell(p.x, y, p.z, observeUnknown);
                if (!originCell || originCell.hazard || (originCell.solid &&
                    !(originCell.breakable === true && plannedClear({ x: p.x, y, z: p.z })))) return output;
            }
            if (!support(cell(p.x, p.y - 1, p.z, observeUnknown))) return output;
            const add = (x, y, z, action, cost, breakBlocks) => {
                const next = { x, y, z, action, cost };
                if (config.blockedEdges?.has?.(edgeKey(p, next))) return;
                if (breakBlocks?.length) next.breakBlocks = breakBlocks;
                output.push(next);
            };
            for (const [dx, dz] of DIRECTIONS) {
                const x = p.x + dx;
                const z = p.z + dz;
                const diagonal = dx !== 0 && dz !== 0;
                if (stand(x, p.y, z, observeUnknown)) {
                    if (!diagonal || (stand(p.x + dx, p.y, p.z, observeUnknown) && stand(p.x, p.y, p.z + dz, observeUnknown))) {
                        add(x, p.y, z, 'walk', diagonal ? SQRT2 : 1);
                    }
                    continue;
                }
                // Turning corners during jumps or falls requires swept-box physics;
                // only level walking is diagonal until that can be verified safely.
                if (diagonal) continue;

                const feet = cell(x, p.y, z, observeUnknown);
                const head = cell(x, p.y + 1, z, observeUnknown);
                if (support(feet) && stand(x, p.y + 1, z, observeUnknown) &&
                    clear(cell(p.x, p.y + 2, p.z, observeUnknown))) {
                    add(x, p.y + 1, z, 'jump', 1.7);
                }

                if (clear(feet) && clear(head)) {
                    for (let drop = 1; drop <= config.maxDrop; drop++) {
                        const y = p.y - drop;
                        if (!clear(cell(x, y, z, observeUnknown))) break;
                        const floor = cell(x, y - 1, z, observeUnknown);
                        if (!floor || floor.hazard) break;
                        if (support(floor)) {
                            add(x, y, z, 'drop', 1 + drop * 0.35);
                            break;
                        }
                        if (floor.solid) break;
                    }
                    const floor = cell(x, p.y - 1, z, observeUnknown);
                    const landingX = p.x + dx * 2;
                    const landingZ = p.z + dz * 2;
                    if (config.allowGap && clear(floor) && stand(landingX, p.y, landingZ, observeUnknown) &&
                        clear(cell(p.x, p.y + 2, p.z, observeUnknown)) &&
                        clear(cell(x, p.y + 2, z, observeUnknown)) &&
                        clear(cell(landingX, p.y + 2, landingZ, observeUnknown))) {
                        add(landingX, p.y, landingZ, 'gap', 2.8);
                    }
                }

                if (config.allowMine && feet && head && !feet.hazard && !head.hazard &&
                    support(cell(x, p.y - 1, z, observeUnknown))) {
                    const obstacles = [];
                    if (feet.solid) obstacles.push({ x, y: p.y, z, cell: feet });
                    if (head.solid) obstacles.push({ x, y: p.y + 1, z, cell: head });
                    if (obstacles.length && obstacles.every(block => block.cell.breakable === true)) {
                        add(x, p.y, z, 'mine', 1 + config.mineCost * obstacles.length,
                            obstacles.map(({ x: bx, y, z: bz }) => ({ x: bx, y, z: bz })));
                    }
                }
            }
            return output;
        }

        function search(startValue, goalValue, opts = {}) {
            const start = position(startValue);
            const requestedGoal = position(goalValue);
            const config = {
                ...defaults,
                allowMine: opts.allowMine == null ? defaults.allowMine : opts.allowMine === true,
                allowGap: opts.allowGap == null ? defaults.allowGap : opts.allowGap !== false,
                blockedEdges: opts.blockedEdges ?? defaults.blockedEdges,
                maxNodesTotal: Math.floor(clamp(opts.maxNodesTotal, defaults.maxNodesTotal, 1, 20000)),
                maxTimeMs: clamp(opts.maxTimeMs, defaults.maxTimeMs, 1, 5000),
                goalRadius: Math.floor(clamp(opts.goalRadius, defaults.goalRadius, 0, 4))
            };
            const began = now();
            const open = new Heap();
            const bestCosts = new Map();
            const expanded = new Map();
            let best = null;
            let visited = 0;
            let order = 0;
            let sawUnknown = false;
            let radius = 0;
            let goalKeys = new Set();
            const observeUnknown = () => { sawUnknown = true; };
            const job = { done: false, result: null, step, cancel };

            function pathFor(node) {
                const path = [];
                for (let current = node; current; current = current.parent) {
                    const p = { x: current.x, y: current.y, z: current.z, action: current.action };
                    if (current.breakBlocks?.length) p.breakBlocks = current.breakBlocks.map(block => ({ ...block }));
                    path.push(p);
                }
                return path.reverse();
            }
            function finish(reason, complete = false, node = best) {
                job.done = true;
                job.result = {
                    path: pathFor(node), complete, reason, cost: node?.g ?? 0, visited,
                    requestedGoal: requestedGoal && { ...requestedGoal },
                    goal: complete && node ? { x: node.x, y: node.y, z: node.z } : requestedGoal && { ...requestedGoal },
                    adjustedGoal: complete && !!node && key(node) !== key(requestedGoal),
                    elapsedMs: Math.max(0, now() - began)
                };
                open.items.length = 0;
                bestCosts.clear();
                expanded.clear();
                best = null;
                return job.result;
            }
            function cancel() {
                if (!job.done) finish('cancelled', false, null);
                return job.result;
            }
            function step(budget = {}) {
                if (job.done) return job.result;
                const sliceBegan = now();
                const maxMs = clamp(budget.maxMs, 4, 0.1, 16);
                const maxNodes = Math.floor(clamp(budget.maxNodes, 200, 1, 1000));
                let count = 0;
                while (open.size) {
                    if (now() - began >= config.maxTimeMs) return finish('time_budget');
                    if (visited >= config.maxNodesTotal) return finish('node_budget');
                    if (count >= maxNodes || now() - sliceBegan >= maxMs) return null;
                    const current = open.pop();
                    const currentKey = key(current);
                    if (current.g !== bestCosts.get(currentKey) || (expanded.get(currentKey) ?? Infinity) <= current.g) continue;
                    expanded.set(currentKey, current.g);
                    count++;
                    visited++;
                    if (!best || current.progress < best.progress || (current.progress === best.progress && current.g < best.g)) best = current;
                    if (goalKeys.has(currentKey)) return finish('reached', true, current);
                    for (const next of getNeighbors(current, config, observeUnknown)) {
                        const nextKey = key(next);
                        const g = current.g + next.cost;
                        if (g >= (bestCosts.get(nextKey) ?? Infinity)) continue;
                        const h = horizontalDistance(next, requestedGoal, radius);
                        const progress = h + Math.abs(next.y - requestedGoal.y) * 0.25;
                        const record = { ...next, g, h, progress, f: g + h, parent: current, order: order++ };
                        bestCosts.set(nextKey, g);
                        open.push(record);
                    }
                }
                return finish(sawUnknown ? 'unloaded_frontier' : 'unreachable');
            }

            if (!start || !stand(start.x, start.y, start.z, observeUnknown)) {
                finish('invalid_start', false, null);
                return job;
            }
            if (!requestedGoal) {
                finish('invalid_goal', false, null);
                return job;
            }
            let goals = [requestedGoal];
            if (!stand(requestedGoal.x, requestedGoal.y, requestedGoal.z)) {
                // Unknown target chunks are not interchangeable with a nearby
                // loaded tile: stop at the frontier and wait for world data.
                const targetKnown = [0, 1, -1].every(dy => !!cell(requestedGoal.x, requestedGoal.y + dy, requestedGoal.z));
                if (targetKnown) {
                    radius = config.goalRadius;
                    goals = candidates(requestedGoal, radius);
                } else {
                    goals = [];
                    sawUnknown = true;
                }
            }
            goalKeys = new Set(goals.map(key));
            const h = horizontalDistance(start, requestedGoal, radius);
            best = { ...start, action: 'walk', g: 0, h, progress: h + Math.abs(start.y - requestedGoal.y) * 0.25, f: h, parent: null, order: order++ };
            bestCosts.set(key(start), 0);
            open.push(best);
            // With a distant unloaded goal, exploring the loaded frontier still
            // yields a useful partial route. It is never reported as complete.
            return job;
        }

        return {
            canStand: (x, y, z) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && stand(x, y, z),
            neighbors: value => {
                const p = position(value);
                return p ? getNeighbors(p, defaults) : [];
            },
            nearestStand,
            validateTransition,
            search
        };
    }

    ROOT.__MF_BARITONE_PLANNER__ = Object.freeze({ create, edgeKey, version: 1 });
})();
