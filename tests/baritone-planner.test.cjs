const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'Movement', 'BaritonePlanner.js'), 'utf8');
const sandbox = { performance };
vm.runInNewContext(source, sandbox);
const api = sandbox.__MF_BARITONE_PLANNER__;
const pos = (x, y = 1, z = 0) => ({ x, y, z });
const coord = (x, y, z) => `${x},${y},${z}`;
const air = { known: true, solid: false, hazard: false, breakable: false, name: 'air' };
const stone = { known: true, solid: true, hazard: false, breakable: true, name: 'stone', height: 1 };

function world(options = {}) {
    const blocks = new Map();
    const unknown = new Set();
    const min = options.min ?? -10;
    const max = options.max ?? 10;
    const read = (x, y, z) => {
        if (x < min || x > max || z < min || z > max || y < -8 || y > 10 || unknown.has(coord(x, y, z))) return null;
        return blocks.get(coord(x, y, z)) ?? (y === 0 ? stone : air);
    };
    const set = (x, y, z, value) => blocks.set(coord(x, y, z), value);
    const planner = api.create(read, options);
    return { planner, read, set, unknown, blocks };
}

function finish(job) {
    let steps = 0;
    while (!job.done && steps++ < 1000) job.step({ maxMs: 16, maxNodes: 1000 });
    assert.equal(job.done, true, 'incremental search must terminate');
    return job.result;
}
function hasNeighbor(planner, from, to, action) {
    return planner.neighbors(from).find(node => node.x === to.x && node.y === to.y && node.z === to.z && (!action || node.action === action));
}

test('A* finds a shortest level route and walks around a tall obstruction', () => {
    const w = world();
    const straight = finish(w.planner.search(pos(0), pos(4)));
    assert.equal(straight.complete, true);
    assert.equal(straight.cost, 4);
    for (let y = 1; y <= 3; y++) w.set(1, y, 0, stone);
    const detour = finish(w.planner.search(pos(0), pos(4)));
    assert.equal(detour.complete, true);
    assert.ok(detour.path.some(node => node.z !== 0));
    assert.equal(detour.path.some(node => node.x === 1 && node.z === 0), false);
});

test('one-block step jumps require landing and departure headroom', () => {
    const w = world();
    w.set(1, 1, 0, stone);
    assert.ok(hasNeighbor(w.planner, pos(0), pos(1, 2), 'jump'));
    w.set(0, 3, 0, stone);
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1, 2), 'jump'), undefined);
    w.set(0, 3, 0, air);
    w.set(1, 3, 0, stone);
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1, 2), 'jump'), undefined);
});

test('diagonal paths cannot clip feet, head or missing support corners', () => {
    const w = world();
    assert.ok(hasNeighbor(w.planner, pos(0), pos(1, 1, 1), 'walk'));
    w.set(1, 1, 0, stone);
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1, 1, 1)), undefined);
    w.set(1, 1, 0, air);
    w.set(0, 2, 1, stone);
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1, 1, 1)), undefined);
    w.set(0, 2, 1, air);
    w.set(0, 0, 1, air);
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1, 1, 1)), undefined);
});

test('drops are bounded to three blocks and their entire shaft must be clear', () => {
    const w = world({ allowGap: false });
    w.set(1, 0, 0, air);
    w.set(1, -1, 0, air);
    w.set(1, -2, 0, air);
    w.set(1, -3, 0, stone);
    assert.ok(hasNeighbor(w.planner, pos(0), pos(1, -2), 'drop'));
    w.set(1, -3, 0, air);
    w.set(1, -4, 0, stone);
    assert.equal(w.planner.neighbors(pos(0)).some(node => node.x === 1 && node.z === 0), false);
    w.set(1, -3, 0, stone);
    w.set(1, -1, 0, { ...air, hazard: true, name: 'water' });
    assert.equal(w.planner.neighbors(pos(0)).some(node => node.x === 1 && node.z === 0), false);
});

test('cardinal one-block gaps require a known safe gap and clear jump arc', () => {
    const w = world();
    w.set(1, 0, 0, air);
    assert.ok(hasNeighbor(w.planner, pos(0), pos(2), 'gap'));
    w.set(1, 3, 0, stone);
    assert.equal(hasNeighbor(w.planner, pos(0), pos(2), 'gap'), undefined);
    w.set(1, 3, 0, air);
    w.unknown.add(coord(1, 0, 0));
    assert.equal(hasNeighbor(w.planner, pos(0), pos(2), 'gap'), undefined);
    w.unknown.clear();
    w.set(1, 0, 0, { ...air, hazard: true, name: 'lava' });
    assert.equal(hasNeighbor(w.planner, pos(0), pos(2), 'gap'), undefined);
});

test('unknown, hazardous and partial-height cells are not assumed walkable', () => {
    const w = world();
    w.unknown.add(coord(1, 2, 0));
    assert.equal(w.planner.canStand(1, 1, 0), false);
    w.unknown.clear();
    w.set(1, 0, 0, { ...stone, hazard: true, name: 'lava' });
    assert.equal(w.planner.canStand(1, 1, 0), false);
    w.set(1, 0, 0, { ...stone, height: 0.5, name: 'slab' });
    assert.equal(w.planner.canStand(1, 1, 0), false);
    w.set(1, 0, 0, stone);
    w.set(1, 1, 0, { ...air, hazard: true, name: 'water' });
    assert.equal(w.planner.canStand(1, 1, 0), false);
});

test('integer stand coordinates reject tall fences and narrow support posts', () => {
    const w = world();
    w.set(1, 0, 0, { ...stone, height: 1.5, name: 'fence' });
    assert.equal(w.planner.canStand(1, 1, 0), false);
    w.set(1, 0, 0, { ...stone, collision: [{ min: { x: 0.35, y: 0, z: 0.35 }, max: { x: 0.65, y: 1, z: 0.65 } }] });
    assert.equal(w.planner.canStand(1, 1, 0), false);
    w.set(1, 0, 0, { ...stone, collision: [{ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }] });
    assert.equal(w.planner.canStand(1, 1, 0), true);
    w.set(1, 0, 0, { ...stone, collision: [{ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1.5, z: 1 } }] });
    assert.equal(w.planner.canStand(1, 1, 0), false);
});

test('transition validation rereads the full jump arc and rejects changed action types', () => {
    const w = world();
    w.set(1, 0, 0, air);
    const gap = hasNeighbor(w.planner, pos(0), pos(2), 'gap');
    assert.equal(w.planner.validateTransition(pos(0), gap), true);
    w.set(1, 3, 0, stone);
    assert.equal(w.planner.validateTransition(pos(0), gap), false);
    w.set(1, 3, 0, air);
    w.set(1, 0, 0, stone);
    assert.equal(w.planner.validateTransition(pos(0), gap), false);
    const walk = hasNeighbor(w.planner, pos(0), pos(1), 'walk');
    assert.equal(w.planner.validateTransition(pos(0), walk), true);
    w.unknown.add(coord(0, 2, 0));
    assert.equal(w.planner.validateTransition(pos(0), walk), false);
});

test('transition validation permits completion of planned mining but never extra obstacles', () => {
    const w = world({ allowMine: true });
    w.set(1, 1, 0, stone);
    const mine = hasNeighbor(w.planner, pos(0), pos(1), 'mine');
    assert.equal(w.planner.validateTransition(pos(0), mine), true);
    w.set(1, 2, 0, stone);
    assert.equal(w.planner.validateTransition(pos(0), mine), false);
    w.set(1, 2, 0, air);
    w.set(1, 1, 0, air);
    assert.equal(w.planner.validateTransition(pos(0), mine), true);
});

test('optional mining clears only breakable feet and head with safe support', () => {
    const w = world({ allowMine: true });
    w.set(1, 1, 0, stone);
    w.set(1, 2, 0, stone);
    const mined = hasNeighbor(w.planner, pos(0), pos(1), 'mine');
    assert.ok(mined);
    assert.deepEqual(JSON.parse(JSON.stringify(mined.breakBlocks)), [pos(1), pos(1, 2)]);
    assert.equal(mined.cost, 9);
    w.set(1, 2, 0, { ...stone, breakable: false, name: 'bedrock' });
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1), 'mine'), undefined);
    w.set(1, 2, 0, stone);
    w.set(1, 0, 0, { ...stone, hazard: true });
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1), 'mine'), undefined);
    const noMine = world();
    noMine.set(1, 1, 0, stone);
    noMine.set(1, 2, 0, stone);
    assert.equal(hasNeighbor(noMine.planner, pos(0), pos(1), 'mine'), undefined);
});

test('mining search can traverse a corridor without pretending unbreakable blocks disappear', () => {
    const w = world({ allowMine: true, min: 0, max: 3, goalRadius: 0 });
    for (let x = 0; x <= 3; x++) {
        for (let z = 1; z <= 3; z++) {
            w.set(x, 1, z, { ...stone, breakable: false });
            w.set(x, 2, z, { ...stone, breakable: false });
        }
    }
    w.set(1, 1, 0, stone);
    w.set(1, 2, 0, stone);
    const result = finish(w.planner.search(pos(0), pos(3)));
    assert.equal(result.complete, true);
    assert.ok(result.path.some(node => node.action === 'mine' && node.breakBlocks.length === 2));
    w.set(1, 1, 0, { ...stone, breakable: false });
    const blocked = finish(w.planner.search(pos(0), pos(3)));
    assert.equal(blocked.complete, false);
});

test('jobs yield, obey total-node limits and return explicitly incomplete progress', () => {
    const w = world({ min: -100, max: 100, maxNodesTotal: 3 });
    const job = w.planner.search(pos(0), pos(50));
    assert.equal(job.done, false);
    assert.equal(job.step({ maxNodes: 1, maxMs: 16 }), null);
    assert.equal(job.done, false);
    const result = finish(job);
    assert.equal(result.complete, false);
    assert.equal(result.reason, 'node_budget');
    assert.equal(result.visited, 3);
    assert.ok(result.path.length > 1);
    assert.ok(result.path.length < 51);
});

test('wall-time budget and cancellation are deterministic and release work', () => {
    let clock = 0;
    const w = world({ now: () => clock, maxTimeMs: 20 });
    const job = w.planner.search(pos(0), pos(9));
    job.step({ maxNodes: 1 });
    clock = 21;
    job.step();
    assert.equal(job.result.reason, 'time_budget');
    assert.equal(job.result.complete, false);
    const cancelled = w.planner.search(pos(0), pos(9));
    cancelled.cancel();
    assert.equal(cancelled.done, true);
    assert.equal(cancelled.result.reason, 'cancelled');
    assert.equal(cancelled.result.path.length, 0);
    assert.equal(cancelled.step(), cancelled.result);
});

test('loaded-frontier paths are never confused with completed distant goals', () => {
    const w = world({ min: -2, max: 2 });
    const result = finish(w.planner.search(pos(0), pos(100)));
    assert.equal(result.complete, false);
    assert.equal(result.reason, 'unloaded_frontier');
    assert.equal(result.path.at(-1).x, 2);
    assert.equal(result.adjustedGoal, false);
    const nearbyUnloaded = finish(w.planner.search(pos(0), pos(3)));
    assert.equal(nearbyUnloaded.complete, false);
    assert.equal(nearbyUnloaded.adjustedGoal, false);
    assert.equal(nearbyUnloaded.reason, 'unloaded_frontier');
});

test('blocked edge exclusions force a different route', () => {
    const blockedEdges = new Set([api.edgeKey(pos(0), pos(1))]);
    const w = world({ blockedEdges });
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1)), undefined);
    const result = finish(w.planner.search(pos(0), pos(2)));
    assert.equal(result.complete, true);
    assert.ok(result.path.some(node => node.z !== 0));
});

test('nearby stand adjustment reports the actual goal, never an arbitrary far destination', () => {
    const w = world();
    w.set(3, 1, 0, { ...stone, breakable: false });
    w.set(3, 2, 0, { ...stone, breakable: false });
    const result = finish(w.planner.search(pos(0), pos(3), { goalRadius: 1 }));
    assert.equal(result.complete, true);
    assert.equal(result.adjustedGoal, true);
    assert.ok(Math.abs(result.goal.x - 3) <= 1);
    assert.ok(Math.abs(result.goal.y - 1) <= 1);
    assert.ok(Math.abs(result.goal.z) <= 1);
    assert.ok(w.planner.nearestStand(pos(3), 1));
    assert.equal(w.planner.nearestStand(pos(100), 4), null);
});

test('invalid coordinates and unknown start fail closed; reader exceptions do not escape', () => {
    const planner = api.create(() => { throw new Error('chunk unloaded'); });
    assert.equal(planner.canStand(0, 1, 0), false);
    assert.equal(planner.neighbors(pos(0)).length, 0);
    assert.equal(planner.search(pos(0), pos(1)).result.reason, 'invalid_start');
    const w = world();
    assert.equal(w.planner.search({ x: NaN, y: 1, z: 0 }, pos(1)).result.reason, 'invalid_start');
    assert.equal(w.planner.nearestStand({ x: Infinity, y: 1, z: 0 }), null);
    assert.equal(w.planner.search(pos(0), { x: NaN, y: 1, z: 0 }).result.reason, 'invalid_goal');
});

test('partial progress accounts for altitude without overestimating the A* heuristic', () => {
    const w = world({ maxNodesTotal: 2 });
    w.set(1, 1, 0, stone);
    w.set(2, 2, 0, stone);
    const result = finish(w.planner.search(pos(0), pos(2, 3)));
    assert.equal(result.complete, false);
    assert.equal(result.path.at(-1).x, 1);
    assert.equal(result.path.at(-1).y, 2);
});

test('level A* costs match Dijkstra across deterministic obstacle layouts', () => {
    let seed = 12;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
    for (let layout = 0; layout < 16; layout++) {
        const w = world({ min: 0, max: 5, allowGap: false, goalRadius: 0 });
        for (let x = 0; x <= 5; x++) {
            for (let z = 0; z <= 5; z++) {
                if ((x === 0 && z === 0) || (x === 5 && z === 5) || random() > 0.25) continue;
                for (let y = 1; y <= 3; y++) w.set(x, y, z, stone);
            }
        }
        const frontier = [{ ...pos(0), cost: 0 }];
        const costs = new Map([[coord(0, 1, 0), 0]]);
        let expected = Infinity;
        while (frontier.length) {
            frontier.sort((a, b) => a.cost - b.cost);
            const current = frontier.shift();
            if (current.cost !== costs.get(coord(current.x, current.y, current.z))) continue;
            if (current.x === 5 && current.z === 5) { expected = current.cost; break; }
            for (const next of w.planner.neighbors(current)) {
                const nextCost = current.cost + next.cost;
                const id = coord(next.x, next.y, next.z);
                if (nextCost >= (costs.get(id) ?? Infinity)) continue;
                costs.set(id, nextCost);
                frontier.push({ ...next, cost: nextCost });
            }
        }
        const result = finish(w.planner.search(pos(0), pos(5, 1, 5)));
        assert.equal(result.complete, Number.isFinite(expected));
        if (result.complete) assert.ok(Math.abs(result.cost - expected) < 1e-9);
    }
});
