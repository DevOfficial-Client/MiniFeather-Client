(function () {
    'use strict';

    const BARITONE_PLANNER_VERSION = 4;
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
            allowSwim: options.allowSwim !== false,
            maxSubmergedSteps: Math.floor(clamp(options.maxSubmergedSteps, 12, 2, 48)),
            allowPlace: options.allowPlace === true,
            placeBudget: Math.floor(clamp(options.placeBudget, 0, 0, 512)),
            placeCost: clamp(options.placeCost, 5, 2, 100),
            materialCost: clamp(options.materialCost, 0, 0, 100),
            maxDrop: Math.floor(clamp(options.maxDrop, 3, 0, 3)),
            mineCost: clamp(options.mineCost, 4, 1, 100),
            miningCost: typeof options.miningCost === 'function' ? options.miningCost : null,
            terrainCacheLimit: Math.floor(clamp(options.terrainCacheLimit, 8192, 32, 65536)),
            maxNodesTotal: Math.floor(clamp(options.maxNodesTotal, 12000, 1, 20000)),
            maxTimeMs: clamp(options.maxTimeMs, 2000, 1, 5000),
            goalRadius: Math.floor(clamp(options.goalRadius, 2, 0, 4)),
            blockedEdges: options.blockedEdges
        };

        function cell(x, y, z, observeUnknown) {
            const cache = observeUnknown?.cache;
            const id = cache ? `${x},${y},${z}` : null;
            let value;
            if (cache?.has(id)) {
                value = cache.get(id);
                observeUnknown.cacheStats.hits++;
            } else {
                try { value = readCell(x, y, z); } catch { value = null; }
                if (cache) {
                    observeUnknown.cacheStats.reads++;
                    if (cache.size < observeUnknown.cacheLimit) {
                        value = value?.known === true && typeof value.solid === 'boolean' ? { ...value } : null;
                        cache.set(id, value);
                    }
                }
            }
            if (!value || value.known !== true || typeof value.solid !== 'boolean') {
                observeUnknown?.();
                return null;
            }
            return value;
        }
        function excavationCost(block, config) {
            const hardness = typeof block.cell.hardness === 'number' ? block.cell.hardness : NaN;
            const fallback = Number.isFinite(hardness) && hardness >= 0 ?
                clamp(config.mineCost * hardness / 1.5, config.mineCost, 0.25, 300) : config.mineCost;
            if (typeof config.miningCost === 'function') {
                try {
                    const cost = config.miningCost({ x: block.x, y: block.y, z: block.z }, block.cell);
                    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) return clamp(cost, fallback, 0.25, 300);
                } catch (_) {}
            }
            return fallback;
        }
        const water = value => !!value && !value.solid && !value.hazard && value.water === true;
        const clear = value => !!value && !value.solid && !value.hazard && (!value.liquid || water(value));
        const dryClear = value => clear(value) && !value.water && !value.liquid;
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
        function floorAt(x, y, z, observeUnknown, node) {
            const actual = cell(x, y, z, observeUnknown);
            const bounds = node?._minedBounds;
            if (actual?.solid && !actual.hazard && bounds && x >= bounds.minX && x <= bounds.maxX &&
                y >= bounds.minY && y <= bounds.maxY && z >= bounds.minZ && z <= bounds.maxZ) {
                for (let history = node._minedHistory; history; history = history.previous) {
                    if (history.blocks.some(block => block.x === x && block.y === y && block.z === z)) {
                        return { known: true, solid: false, hazard: false, air: true, replaceable: true };
                    }
                }
            }
            // Only a known replaceable cell may be projected as a placed floor.
            // A later world update, hazard or unloaded chunk invalidates it.
            if (dryClear(actual) && actual.replaceable !== false && node?._placed?.has(`${x},${y},${z}`)) {
                return { known: true, solid: true, hazard: false, height: 1 };
            }
            return actual;
        }
        function stand(x, y, z, observeUnknown, node) {
            return dryClear(cell(x, y, z, observeUnknown)) && dryClear(cell(x, y + 1, z, observeUnknown)) &&
                support(floorAt(x, y - 1, z, observeUnknown, node));
        }
        function swim(x, y, z, observeUnknown) {
            return water(cell(x, y, z, observeUnknown)) && clear(cell(x, y + 1, z, observeUnknown));
        }
        function navigate(x, y, z, config, observeUnknown, node) {
            return stand(x, y, z, observeUnknown, node) || (config.allowSwim && swim(x, y, z, observeUnknown));
        }
        function mineableGoal(x, y, z, observeUnknown) {
            const feet = cell(x, y, z, observeUnknown);
            const head = cell(x, y + 1, z, observeUnknown);
            return feet && head && !feet.hazard && !head.hazard && !feet.liquid && !head.liquid && !feet.water && !head.water &&
                support(cell(x, y - 1, z, observeUnknown)) &&
                (feet.solid || head.solid) &&
                [feet, head].every(value => value.solid ? value.breakable === true : dryClear(value));
        }
        function bridgeableGoal(x, y, z, observeUnknown) {
            const floor = cell(x, y - 1, z, observeUnknown);
            return dryClear(cell(x, y, z, observeUnknown)) && dryClear(cell(x, y + 1, z, observeUnknown)) &&
                dryClear(floor) && floor.replaceable !== false;
        }
        function candidates(goal, radius, config = defaults, observeUnknown) {
            const result = [];
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    for (let dy = -radius; dy <= radius; dy++) {
                        const p = { x: goal.x + dx, y: goal.y + dy, z: goal.z + dz };
                        if (navigate(p.x, p.y, p.z, config, observeUnknown)) result.push(p);
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
            if (!from || !to || !navigate(from.x, from.y, from.z, defaults) || typeof toValue.action !== 'string') return false;
            return getNeighbors(from, defaults).some(next => {
                if (next.x !== to.x || next.y !== to.y || next.z !== to.z) return false;
                if (toValue.action === 'bridge') {
                    if (next.action === 'walk') return true;
                    return next.action === 'bridge' && Array.isArray(toValue.placeBlocks) &&
                        next.placeBlocks.every(block => toValue.placeBlocks.some(planned =>
                            planned.x === block.x && planned.y === block.y && planned.z === block.z));
                }
                if (!['mine', 'mineJump'].includes(toValue.action)) return next.action === toValue.action;
                // Mining is checked before execution. Once some or all of the
                // planned blocks disappear, the same edge may become walking;
                // never silently add a newly appeared obstacle to that plan.
                if (next.action === (toValue.action === 'mineJump' ? 'jump' : 'walk')) return true;
                return next.action === toValue.action && Array.isArray(toValue.breakBlocks) &&
                    next.breakBlocks.every(block => toValue.breakBlocks.some(planned =>
                        planned.x === block.x && planned.y === block.y && planned.z === block.z));
            });
        }

        function getNeighbors(p, config, observeUnknown) {
            const output = [];
            const inWater = config.allowSwim && swim(p.x, p.y, p.z, observeUnknown);
            const plannedClear = value => ['mine', 'mineJump'].includes(p.action) && p.breakBlocks?.some(block =>
                block.x === value.x && block.y === value.y && block.z === value.z);
            for (const y of [p.y, p.y + 1]) {
                const originCell = cell(p.x, y, p.z, observeUnknown);
                if (!originCell || originCell.hazard || (originCell.liquid && !water(originCell)) ||
                    (!config.allowSwim && water(originCell)) || (originCell.solid &&
                    !(originCell.breakable === true && plannedClear({ x: p.x, y, z: p.z })))) return output;
            }
            if (!inWater && !support(floorAt(p.x, p.y - 1, p.z, observeUnknown, p))) return output;
            const add = (x, y, z, action, cost, breakBlocks, placeBlocks) => {
                const next = { x, y, z, action, cost };
                if (config.blockedEdges?.has?.(edgeKey(p, next))) return;
                // Breath is a limited path resource, not just a swimming cost.
                // Reset only where the head is in verified non-liquid air.
                const submerged = action === 'swim' && water(cell(x, y + 1, z, observeUnknown));
                next._submergedSteps = submerged ? (p._submergedSteps ?? 0) + 1 : 0;
                if (next._submergedSteps > config.maxSubmergedSteps) return;
                if (breakBlocks?.length) next.breakBlocks = breakBlocks;
                if (p._minedHistory) {
                    next._minedHistory = p._minedHistory;
                    next._minedBounds = p._minedBounds;
                }
                if (breakBlocks?.length) {
                    const first = breakBlocks[0];
                    const bounds = p._minedBounds ? { ...p._minedBounds } : {
                        minX: first.x, maxX: first.x, minY: first.y, maxY: first.y, minZ: first.z, maxZ: first.z
                    };
                    for (const block of breakBlocks) {
                        bounds.minX = Math.min(bounds.minX, block.x); bounds.maxX = Math.max(bounds.maxX, block.x);
                        bounds.minY = Math.min(bounds.minY, block.y); bounds.maxY = Math.max(bounds.maxY, block.y);
                        bounds.minZ = Math.min(bounds.minZ, block.z); bounds.maxZ = Math.max(bounds.maxZ, block.z);
                    }
                    next._minedHistory = { blocks: breakBlocks, previous: p._minedHistory };
                    next._minedBounds = bounds;
                }
                if (p._placed?.size) next._placed = p._placed;
                next._placeCount = p._placeCount ?? 0;
                if (placeBlocks?.length) {
                    next.placeBlocks = placeBlocks;
                    next._placed = new Set(p._placed);
                    for (const block of placeBlocks) next._placed.add(key(block));
                    next._placeCount += placeBlocks.length;
                }
                output.push(next);
            };
            const addSwim = (x, y, z, cost) => {
                if (config.allowSwim && swim(x, y, z, observeUnknown)) {
                    // Prefer air above the head and ascending over descending;
                    // deep-water detours should not beat an available surface.
                    add(x, y, z, 'swim', cost + (water(cell(x, y + 1, z, observeUnknown)) ? 0.65 : 0));
                    return true;
                }
                return false;
            };
            if (inWater) {
                addSwim(p.x, p.y + 1, p.z, 1.15);
                addSwim(p.x, p.y - 1, p.z, 1.65);
            }
            for (const [dx, dz] of DIRECTIONS) {
                const x = p.x + dx;
                const z = p.z + dz;
                const diagonal = dx !== 0 && dz !== 0;
                if (stand(x, p.y, z, observeUnknown, p)) {
                    if (!diagonal || (!inWater && stand(p.x + dx, p.y, p.z, observeUnknown, p) && stand(p.x, p.y, p.z + dz, observeUnknown, p))) {
                        add(x, p.y, z, inWater ? 'swim' : 'walk', inWater ? 1.7 : diagonal ? SQRT2 : 1);
                    }
                    continue;
                }
                // Turning corners during jumps or falls requires swept-box physics;
                // only level walking is diagonal until that can be verified safely.
                if (diagonal) continue;

                if (addSwim(x, p.y, z, 1.5)) continue;

                const feet = cell(x, p.y, z, observeUnknown);
                const head = cell(x, p.y + 1, z, observeUnknown);
                const ledge = floorAt(x, p.y, z, observeUnknown, p);
                if (support(ledge) && stand(x, p.y + 1, z, observeUnknown, p) &&
                    clear(cell(p.x, p.y + 2, p.z, observeUnknown))) {
                    add(x, p.y + 1, z, inWater ? 'swim' : 'jump', inWater ? 2.1 : 1.7);
                }

                // Swimming never synthesizes dry support, tunnel mining or
                // parkour across air; exit only onto verified shore cells.
                if (inWater) continue;

                if (config.allowMine && support(ledge) && dryClear(cell(p.x, p.y + 2, p.z, observeUnknown))) {
                    const upperHead = cell(x, p.y + 2, z, observeUnknown);
                    const body = [{ x, y: p.y + 1, z, cell: head }, { x, y: p.y + 2, z, cell: upperHead }];
                    const obstacles = body.filter(block => block.cell?.solid);
                    if (obstacles.length && body.every(block => block.cell && !block.cell.hazard &&
                        !block.cell.liquid && !block.cell.water &&
                        (block.cell.solid ? block.cell.breakable === true : dryClear(block.cell)))) {
                        add(x, p.y + 1, z, 'mineJump', 1.7 + obstacles.reduce((sum, block) => sum + excavationCost(block, config), 0),
                            obstacles.map(({ x: bx, y, z: bz }) => ({ x: bx, y, z: bz })));
                    }
                }

                if (dryClear(feet) && dryClear(head)) {
                    for (let drop = 1; drop <= config.maxDrop; drop++) {
                        const y = p.y - drop;
                        if (!clear(cell(x, y, z, observeUnknown))) break;
                        if (addSwim(x, y, z, 1.6 + drop * 0.3)) break;
                        const floor = floorAt(x, y - 1, z, observeUnknown, p);
                        if (!floor || floor.hazard) break;
                        if (support(floor)) {
                            add(x, y, z, 'drop', 1 + drop * 0.35);
                            break;
                        }
                        if (floor.solid) break;
                    }
                    const floor = floorAt(x, p.y - 1, z, observeUnknown, p);
                    const landingX = p.x + dx * 2;
                    const landingZ = p.z + dz * 2;
                    if (config.allowGap && dryClear(floor) && stand(landingX, p.y, landingZ, observeUnknown, p) &&
                        dryClear(cell(p.x, p.y + 2, p.z, observeUnknown)) &&
                        dryClear(cell(x, p.y + 2, z, observeUnknown)) &&
                        dryClear(cell(landingX, p.y + 2, landingZ, observeUnknown))) {
                        add(landingX, p.y, landingZ, 'gap', 2.8);
                    }
                    if (config.allowPlace && (p._placeCount ?? 0) < config.placeBudget &&
                        dryClear(floor) && floor.replaceable !== false &&
                        support(floorAt(p.x, p.y - 1, p.z, observeUnknown, p))) {
                        add(x, p.y, z, 'bridge', 1 + config.placeCost + config.materialCost, null, [{ x, y: p.y - 1, z }]);
                    }
                }

                if (config.allowMine && feet && head && !feet.hazard && !head.hazard &&
                    !feet.liquid && !head.liquid && !feet.water && !head.water && support(floorAt(x, p.y - 1, z, observeUnknown, p))) {
                    const obstacles = [];
                    if (feet.solid) obstacles.push({ x, y: p.y, z, cell: feet });
                    if (head.solid) obstacles.push({ x, y: p.y + 1, z, cell: head });
                    if (obstacles.length && obstacles.every(block => block.cell.breakable === true)) {
                        add(x, p.y, z, 'mine', 1 + obstacles.reduce((sum, block) => sum + excavationCost(block, config), 0),
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
                allowSwim: opts.allowSwim == null ? defaults.allowSwim : opts.allowSwim !== false,
                maxSubmergedSteps: Math.floor(clamp(opts.maxSubmergedSteps, defaults.maxSubmergedSteps, 2, 48)),
                allowPlace: opts.allowPlace == null ? defaults.allowPlace : opts.allowPlace === true,
                placeBudget: Math.floor(clamp(opts.placeBudget, defaults.placeBudget, 0, 512)),
                placeCost: clamp(opts.placeCost, defaults.placeCost, 2, 100),
                materialCost: clamp(opts.materialCost, defaults.materialCost, 0, 100),
                mineCost: clamp(opts.mineCost, defaults.mineCost, 1, 100),
                miningCost: typeof opts.miningCost === 'function' ? opts.miningCost : defaults.miningCost,
                terrainCacheLimit: Math.floor(clamp(opts.terrainCacheLimit, defaults.terrainCacheLimit, 32, 65536)),
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
            let unknownReads = 0;
            let radius = 0;
            let goalKeys = new Set();
            const partialCandidates = new Map();
            const backoffScales = [1.5, 2, 3, 5, 10];
            const observeUnknown = () => { sawUnknown = true; unknownReads++; };
            observeUnknown.cache = new Map();
            observeUnknown.cacheLimit = config.terrainCacheLimit;
            observeUnknown.cacheStats = { reads: 0, hits: 0 };
            // Remaining materials and the floors built along a route affect
            // reachable neighbors, so coordinates alone are not a state key.
            // Mining ancestry invalidates removed supports, but is deliberately
            // not a full-world search key: some alternate excavation histories
            // can merge. Live edge checks and replanning remain authoritative.
            const stateKey = node => `${key(node)}${node._placed?.size ?
                `|${[...node._placed].sort().join(';')}` : ''}${node._submergedSteps ? `|wet:${node._submergedSteps}` : ''}`;
            const job = { done: false, result: null, step, cancel, preview };

            function pathFor(node) {
                const path = [];
                for (let current = node; current; current = current.parent) {
                    const p = { x: current.x, y: current.y, z: current.z, action: current.action };
                    if (current.breakBlocks?.length) p.breakBlocks = current.breakBlocks.map(block => ({ ...block }));
                    if (current.placeBlocks?.length) p.placeBlocks = current.placeBlocks.map(block => ({ ...block }));
                    path.push(p);
                }
                return path.reverse();
            }
            function useful(node) {
                return node && start && Math.hypot(node.x - start.x, node.y - start.y, node.z - start.z) >= 3;
            }
            function rememberPartial(node) {
                if (!useful(node)) return;
                for (const scale of backoffScales) {
                    const id = `${node._frontier ? 'frontier' : 'expanded'}:${scale}`;
                    const previous = partialCandidates.get(id);
                    if (!previous || node.progress + node.g / scale < previous.progress + previous.g / scale) {
                        partialCandidates.set(id, node);
                    }
                }
            }
            function partialFor(reason) {
                if (!['node_budget', 'time_budget', 'preview'].includes(reason)) return best;
                const choices = new Map();
                const offer = node => {
                    if (!useful(node)) return;
                    for (const scale of backoffScales) {
                        const previous = choices.get(scale);
                        if (!previous || node.progress + node.g / scale < previous.progress + previous.g / scale) choices.set(scale, node);
                    }
                };
                // On a budget limit, an unexplored frontier can continue a
                // necessary sideways/backwards detour even when the nearest
                // heuristic tile was a one-block dead end. These remain
                // explicitly partial, not claimed globally optimal routes.
                let scanned = 0;
                for (const node of open.items) {
                    // A live preview must not scan the entire search heap on
                    // the rendering tick; full backoff runs only at completion.
                    if (reason === 'preview' && scanned++ >= 256) break;
                    const id = node._id ?? stateKey(node);
                    if (node.g === bestCosts.get(id) && (expanded.get(id) ?? Infinity) > node.g) offer(node);
                }
                if (!choices.size) {
                    for (const scale of backoffScales) offer(partialCandidates.get(`frontier:${scale}`));
                }
                if (!choices.size) {
                    for (const scale of backoffScales) offer(partialCandidates.get(`expanded:${scale}`));
                }
                let fallback = best;
                for (const scale of backoffScales) {
                    const candidate = choices.get(scale);
                    if (!candidate) continue;
                    fallback = candidate;
                    if (candidate.progress <= (best?.progress ?? Infinity) + 0.25) return candidate;
                }
                return fallback;
            }
            function preview(previewOptions = {}) {
                const maxWaypoints = Math.floor(clamp(previewOptions.maxWaypoints, 96, 1, 2048));
                const previewNode = job.done ? null : partialFor('preview');
                const path = job.done ? job.result.path : pathFor(previewNode);
                const tail = path.at(-1);
                const frontier = open.items[0];
                return {
                    path: path.slice(0, maxWaypoints).map(point => ({ ...point,
                        ...(point.breakBlocks ? { breakBlocks: point.breakBlocks.map(block => ({ ...block })) } : {}),
                        ...(point.placeBlocks ? { placeBlocks: point.placeBlocks.map(block => ({ ...block })) } : {}) })),
                    pathLength: path.length, truncated: path.length > maxWaypoints,
                    best: tail ? { x: tail.x, y: tail.y, z: tail.z } : null,
                    frontier: frontier ? { x: frontier.x, y: frontier.y, z: frontier.z } : null,
                    visited, done: job.done, complete: job.result?.complete ?? false, reason: job.result?.reason ?? 'searching',
                    requestedGoal: requestedGoal && { ...requestedGoal },
                    goal: job.done ? job.result.goal && { ...job.result.goal } : requestedGoal && { ...requestedGoal },
                    cost: job.done ? job.result.cost : previewNode?.g ?? 0,
                    placements: job.done ? job.result.placements : previewNode?._placeCount ?? 0,
                    submergedSteps: job.done ? job.result.submergedSteps : previewNode?._submergedSteps ?? 0,
                    cachedCells: job.done ? job.result.cachedCells : observeUnknown.cache.size,
                    terrainReads: observeUnknown.cacheStats.reads, cacheHits: observeUnknown.cacheStats.hits
                };
            }
            function finish(reason, complete = false, node = best) {
                if (!complete && node === best) node = partialFor(reason);
                job.done = true;
                job.result = {
                    path: pathFor(node), complete, reason, cost: node?.g ?? 0, visited,
                    placements: node?._placeCount ?? 0,
                    submergedSteps: node?._submergedSteps ?? 0,
                    requestedGoal: requestedGoal && { ...requestedGoal },
                    goal: complete && node ? { x: node.x, y: node.y, z: node.z } : requestedGoal && { ...requestedGoal },
                    adjustedGoal: complete && !!node && key(node) !== key(requestedGoal),
                    elapsedMs: Math.max(0, now() - began)
                };
                job.result.cachedCells = observeUnknown.cache.size;
                job.result.terrainReads = observeUnknown.cacheStats.reads;
                job.result.cacheHits = observeUnknown.cacheStats.hits;
                observeUnknown.cache.clear();
                open.items.length = 0;
                bestCosts.clear();
                expanded.clear();
                partialCandidates.clear();
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
                    const currentKey = current._id ?? stateKey(current);
                    if (current.g !== bestCosts.get(currentKey) || (expanded.get(currentKey) ?? Infinity) <= current.g) continue;
                    expanded.set(currentKey, current.g);
                    count++;
                    visited++;
                    if (!best || current.progress < best.progress || (current.progress === best.progress && current.g < best.g)) best = current;
                    if (goalKeys.has(key(current))) return finish('reached', true, current);
                    const previousUnknown = unknownReads;
                    const neighbors = getNeighbors(current, config, observeUnknown);
                    current._frontier = unknownReads > previousUnknown;
                    rememberPartial(current);
                    for (const next of neighbors) {
                        const nextKey = stateKey(next);
                        const g = current.g + next.cost;
                        if (g >= (bestCosts.get(nextKey) ?? Infinity)) continue;
                        const h = horizontalDistance(next, requestedGoal, radius);
                        const progress = h + Math.abs(next.y - requestedGoal.y) * 0.25;
                        const record = { ...next, _id: nextKey, g, h, progress, f: g + h, parent: current, order: order++ };
                        bestCosts.set(nextKey, g);
                        open.push(record);
                    }
                }
                return finish(sawUnknown ? 'unloaded_frontier' : 'unreachable');
            }

            if (!start || !navigate(start.x, start.y, start.z, config, observeUnknown)) {
                finish('invalid_start', false, null);
                return job;
            }
            if (!requestedGoal) {
                finish('invalid_goal', false, null);
                return job;
            }
            let goals = [requestedGoal];
            if (!navigate(requestedGoal.x, requestedGoal.y, requestedGoal.z, config, observeUnknown) &&
                !(config.allowMine && mineableGoal(requestedGoal.x, requestedGoal.y, requestedGoal.z, observeUnknown)) &&
                !(config.allowPlace && config.placeBudget > 0 && bridgeableGoal(requestedGoal.x, requestedGoal.y, requestedGoal.z, observeUnknown))) {
                // Unknown target chunks are not interchangeable with a nearby
                // loaded tile: stop at the frontier and wait for world data.
                const targetKnown = [0, 1, -1].every(dy => !!cell(requestedGoal.x, requestedGoal.y + dy, requestedGoal.z, observeUnknown));
                if (targetKnown) {
                    radius = config.goalRadius;
                    goals = candidates(requestedGoal, radius, config, observeUnknown);
                } else {
                    goals = [];
                    sawUnknown = true;
                }
            }
            goalKeys = new Set(goals.map(key));
            const h = horizontalDistance(start, requestedGoal, radius);
            best = { ...start, _id: key(start), action: swim(start.x, start.y, start.z, observeUnknown) ? 'swim' : 'walk', _placeCount: 0, _submergedSteps: 0,
                g: 0, h, progress: h + Math.abs(start.y - requestedGoal.y) * 0.25, f: h, parent: null, order: order++ };
            bestCosts.set(key(start), 0);
            open.push(best);
            // With a distant unloaded goal, exploring the loaded frontier still
            // yields a useful partial route. It is never reported as complete.
            return job;
        }

        return {
            canStand: (x, y, z) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && stand(x, y, z),
            canSwim: (x, y, z) => defaults.allowSwim && Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && swim(x, y, z),
            canNavigate: (x, y, z) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && navigate(x, y, z, defaults),
            canExcavate: (x, y, z) => defaults.allowMine && Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && mineableGoal(x, y, z),
            neighbors: value => {
                const p = position(value);
                return p ? getNeighbors(p, defaults) : [];
            },
            nearestStand,
            validateTransition,
            search
        };
    }

    ROOT.__MF_BARITONE_PLANNER__ = Object.freeze({ create, edgeKey, version: BARITONE_PLANNER_VERSION });
})();
