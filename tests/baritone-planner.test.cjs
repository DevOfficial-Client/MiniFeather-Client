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
const water = { ...air, water: true, liquid: true, name: 'water' };

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
function dijkstraCost(planner, start, isGoal) {
    const frontier = [{ ...start, total: 0 }];
    const costs = new Map([[coord(start.x, start.y, start.z), 0]]);
    while (frontier.length) {
        frontier.sort((a, b) => a.total - b.total);
        const current = frontier.shift();
        if (current.total !== costs.get(coord(current.x, current.y, current.z))) continue;
        if (isGoal(current)) return current.total;
        for (const next of planner.neighbors(current)) {
            const total = current.total + next.cost;
            const id = coord(next.x, next.y, next.z);
            if (total >= (costs.get(id) ?? Infinity)) continue;
            costs.set(id, total);
            frontier.push({ ...next, total });
        }
    }
    return Infinity;
}

test('live walking edge checks read only their direction, once per cell and without tool-cost callbacks', () => {
    const blocks = new Map();
    const reads = new Map();
    let toolEstimates = 0;
    const planner = api.create((x, y, z) => {
        const id = coord(x, y, z);
        reads.set(id, (reads.get(id) ?? 0) + 1);
        return blocks.get(id) ?? (y === 0 ? stone : air);
    }, { allowMine: true, miningCost() { toolEstimates++; return 2; } });
    for (const [x, z] of [[0, 1], [0, -1], [-1, 0]]) {
        blocks.set(coord(x, 1, z), stone);
        blocks.set(coord(x, 2, z), stone);
    }
    const walk = { ...pos(1), action: 'walk' };
    assert.equal(planner.validateTransition(pos(0), walk), true);
    assert.equal(reads.size, 6, 'a cardinal walking edge needs only both bodies and supports');
    assert.equal([...reads.values()].every(count => count === 1), true);
    assert.equal(toolEstimates, 0, 'live validation must not estimate unrelated tools or terrain costs');
    blocks.set(coord(0, 0, 0), air);
    assert.equal(planner.validateTransition(pos(0), walk), false, 'the next check must reread the changed source support');
    reads.clear();
    assert.equal(planner.validateTransition(pos(0), { ...pos(3), action: 'walk' }), false);
    assert.equal(reads.size, 0, 'impossible long edges are rejected before touching the block reader');
});

test('single-direction live validation preserves every generated safe movement action', () => {
    const fixtures = [
        w => w.set(1, 0, 0, air),
        w => w.set(1, 1, 0, stone),
        w => { w.set(1, 1, 0, stone); w.set(1, 2, 0, stone); },
        w => { w.set(1, 0, 0, air); w.set(1, -1, 0, stone); },
        w => { w.set(1, 1, 0, water); w.set(1, 2, 0, water); }
    ];
    for (const configure of fixtures) {
        const w = world({ allowMine: true, allowPlace: true, placeBudget: 4 });
        configure(w);
        for (const next of w.planner.neighbors(pos(0))) {
            assert.equal(w.planner.validateTransition(pos(0), next), true, `${next.action} at ${coord(next.x, next.y, next.z)}`);
        }
    }
    const wet = world();
    for (let y = 0; y <= 3; y++) wet.set(0, y, 0, water);
    for (const next of wet.planner.neighbors(pos(0))) assert.equal(wet.planner.validateTransition(pos(0), next), true);
});

test('walking segment smoothing accepts fractional world positions with a complete swept footprint', () => {
    const w = world();
    const from = { x: 0.8, y: 1, z: 0.5 };
    const to = { x: 3.5, y: 1, z: 2.5, action: 'walk' };
    assert.equal(w.planner.canWalkSegment(from, to), true);
    assert.equal(w.planner.canWalkSegment(to, from), true);
    w.set(0, 1, 1, stone);
    assert.equal(w.planner.canWalkSegment(from, to), false, 'the footprint clips a corner that the center ray does not enter');
    w.set(0, 1, 1, air);
    w.set(1, 2, 0, stone);
    assert.equal(w.planner.canWalkSegment(from, to), false, 'headroom is swept as well as feet');
    w.set(1, 2, 0, air);
    w.set(1, 0, 0, air);
    assert.equal(w.planner.canWalkSegment(from, to), false, 'a smoothed diagonal cannot cross a missing support corner');
});

test('walking segments remain live, dry, bounded and preserve nonwalking action markers', () => {
    const w = world({ min: -20, max: 20 });
    const from = { x: -3.5, y: 1, z: -0.5 };
    const to = { x: 0.5, y: 1, z: -0.5, action: 'walk' };
    assert.equal(w.planner.canWalkSegment(from, to), true);
    w.unknown.add(coord(-1, 2, -1));
    assert.equal(w.planner.canWalkSegment(from, to), false);
    w.unknown.clear();
    w.set(-1, 1, -1, water);
    assert.equal(w.planner.canWalkSegment(from, to), false);
    w.set(-1, 1, -1, air);
    w.set(-1, 0, -1, { ...stone, hazard: true });
    assert.equal(w.planner.canWalkSegment(from, to), false);
    w.set(-1, 0, -1, stone);
    assert.equal(w.planner.canWalkSegment(from, to), true, 'no earlier live segment snapshot survives a call');
    for (const action of ['mine', 'mineJump', 'jump', 'gap', 'drop', 'bridge', 'swim']) {
        assert.equal(w.planner.canWalkSegment(from, { ...to, action }), false, action);
    }
    assert.equal(w.planner.canWalkSegment(from, { ...to, y: 2 }), false);
    assert.equal(w.planner.canWalkSegment(from, { ...to, x: 14.5 }), false);
    assert.equal(w.planner.canWalkSegment(from, to, { maxDistance: 2 }), false);
    assert.equal(w.planner.canWalkSegment({ ...from, x: NaN }, to), false);
});

test('walking segment support must cover the contacted floor tile, not only its center', () => {
    const w = world();
    const from = { x: 0.5, y: 1, z: 0.5 };
    const to = { x: 2.5, y: 1, z: 0.5 };
    w.set(1, 0, 0, { ...stone, collision: [{ min: { x: 0.2, y: 0, z: 0.2 }, max: { x: 0.8, y: 1, z: 0.8 } }] });
    assert.equal(w.planner.canStand(1, 1, 0), true);
    assert.equal(w.planner.canWalkSegment(from, to), false);
    w.set(1, 0, 0, { ...stone, collision: [{ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }] });
    assert.equal(w.planner.canWalkSegment(from, to), true);
    w.set(1, 3, 0, stone);
    assert.equal(w.planner.canWalkSegment({ ...from, y: 1.25 }, { ...to, y: 1.25 }), false);
});

test('walking segment smoothing honors excluded movement edges and keeps its reads linear', () => {
    const blockedEdges = new Set();
    const reads = new Map();
    const planner = api.create((x, y, z) => {
        const id = coord(x, y, z);
        reads.set(id, (reads.get(id) ?? 0) + 1);
        return y === 0 ? stone : air;
    }, { blockedEdges });
    const from = { x: 0.5, y: 1, z: 0.5 };
    const to = { x: 16.5, y: 1, z: 0.5 };
    assert.equal(planner.canWalkSegment(from, to), true);
    assert.equal(reads.size, 51);
    assert.equal([...reads.values()].every(count => count === 1), true);
    blockedEdges.add(api.edgeKey(pos(2), pos(3)));
    assert.equal(planner.canWalkSegment(from, to), false);
});

test('optional walking probes preserve octile-optimal cardinal, diagonal and mixed-slope route costs', () => {
    assert.equal(api.version, 6);
    const w = world({ min: -160, max: 160, fastWalk: true, now: () => 0 });
    for (const goal of [pos(32), pos(-32), pos(0, 1, 32), pos(24, 1, -24), pos(4, 1, 2),
        pos(32, 1, 9), pos(-32, 1, 9), pos(9, 1, -32), pos(-9, 1, -32), pos(128, 1, 37)]) {
        const regular = finish(w.planner.search(pos(0), goal, { fastWalk: false }));
        const fast = finish(w.planner.search(pos(0), goal));
        assert.equal(fast.complete, true);
        assert.equal(fast.fastWalk, true);
        assert.ok(Math.abs(fast.cost - regular.cost) < 1e-9);
        const major = Math.max(Math.abs(goal.x), Math.abs(goal.z));
        const minor = Math.min(Math.abs(goal.x), Math.abs(goal.z));
        assert.ok(Math.abs(fast.cost - (major + (Math.SQRT2 - 1) * minor)) < 1e-9);
        assert.equal(fast.path.length, major + 1);
        assert.equal(fast.visited, major);
        assert.equal(fast.path.every(node => node.action === 'walk'), true);
        for (let i = 1; i < fast.path.length; i++) {
            assert.equal(w.planner.validateTransition(fast.path[i - 1], fast.path[i]), true);
            const node = fast.path[i];
            const deviation = Math.abs(node.x * goal.z - node.z * goal.x) / major;
            assert.ok(deviation <= 0.5 + 1e-9, 'diagonal steps are distributed along the route, not grouped into a large dogleg');
        }
        assert.ok(fast.terrainReads < regular.terrainReads, 'probes should avoid reading unused parallel terrain');
    }
    assert.equal(finish(w.planner.search(pos(0), pos(129))).fastWalk, false, 'probes remain bounded even on completely loaded long routes');
    assert.equal(finish(world({ now: () => 0 }).planner.search(pos(0), pos(4))).fastWalk, false, 'optimization stays opt-in');
});

test('long mixed-slope walking probes reduce block reads while retaining exact endpoints', () => {
    const w = world({ min: -16, max: 160, fastWalk: true, now: () => 0 });
    for (const distance of [32, 64, 96, 128]) {
        const goal = pos(distance, 1, Math.floor(distance * .29));
        const ordinary = finish(w.planner.search(pos(0), goal, { fastWalk: false }));
        const fast = finish(w.planner.search(pos(0), goal));
        assert.equal(fast.complete, true);
        assert.equal(fast.fastWalk, true);
        assert.equal(fast.adjustedGoal, false);
        assert.deepEqual(JSON.parse(JSON.stringify(fast.goal)), goal);
        assert.ok(Math.abs(fast.cost - ordinary.cost) < 1e-9);
        assert.ok(fast.terrainReads < ordinary.terrainReads * .6, `distance ${distance} should not read an unrelated eight-direction neighborhood`);
    }
});

test('mixed-slope walking probes validate both diagonal corners and fall back without losing safe detours', () => {
    const changes = [
        w => { for (let y = 1; y <= 3; y++) w.set(1, y, 1, { ...stone, breakable: false }); },
        w => w.set(1, 2, 1, stone),
        w => w.set(1, 0, 1, air),
        w => w.set(1, 0, 1, { ...stone, height: .5 }),
        w => w.set(1, 1, 1, water),
        w => w.set(1, 0, 1, { ...stone, hazard: true }),
        w => w.unknown.add(coord(1, 2, 1)),
        w => w.blockedEdges.add(api.edgeKey(pos(1), pos(2, 1, 1)))
    ];
    for (const configure of changes) {
        const blockedEdges = new Set();
        const w = world({ fastWalk: true, blockedEdges, now: () => 0 });
        w.blockedEdges = blockedEdges;
        configure(w);
        const ordinary = finish(w.planner.search(pos(0), pos(8, 1, 3), { fastWalk: false }));
        const fast = finish(w.planner.search(pos(0), pos(8, 1, 3)));
        assert.equal(fast.fastWalk, false);
        assert.equal(fast.complete, true);
        assert.ok(Math.abs(fast.cost - ordinary.cost) < 1e-9);
        for (let i = 1; i < fast.path.length; i++) assert.equal(w.planner.validateTransition(fast.path[i - 1], fast.path[i]), true);
    }
});

test('straight walking probes yield safe previews, obey total budgets and release cancelled work', () => {
    const w = world({ max: 40, fastWalk: true, now: () => 0 });
    const job = w.planner.search(pos(0), pos(32));
    assert.equal(job.done, false);
    assert.equal(job.step({ maxNodes: 3, maxMs: 16 }), null);
    const preview = job.preview();
    assert.equal(preview.visited, 3);
    assert.equal(preview.complete, false);
    assert.equal(preview.pathLength, 4);
    assert.equal(preview.path.at(-1).x, 3);
    const limited = finish(w.planner.search(pos(0), pos(32), { maxNodesTotal: 2 }));
    assert.equal(limited.complete, false);
    assert.equal(limited.reason, 'node_budget');
    assert.equal(limited.visited, 2);
    assert.equal(limited.path.at(-1).x, 2);
    job.cancel();
    assert.equal(job.preview().reason, 'cancelled');
    assert.equal(job.preview().path.length, 0);
    assert.equal(job.result.cachedCells > 0, true);
    let time = 0;
    const clocked = world({ fastWalk: true, now: () => time }).planner.search(pos(0), pos(5), { maxTimeMs: 4 });
    time = 5;
    assert.equal(clocked.step().reason, 'time_budget');
    assert.equal(clocked.result.complete, false);
    assert.equal(clocked.result.visited, 0);
});

test('straight walking probes fall back to full A* around obstacles, unknown chunks and excluded edges', () => {
    const configure = [
        w => { for (let y = 1; y <= 3; y++) w.set(2, y, 0, { ...stone, breakable: false }); },
        w => w.unknown.add(coord(2, 2, 0)),
        w => w.plannerBlockedEdges.add(api.edgeKey(pos(2), pos(3)))
    ];
    for (const change of configure) {
        const blockedEdges = new Set();
        const w = world({ fastWalk: true, blockedEdges, now: () => 0 });
        w.plannerBlockedEdges = blockedEdges;
        change(w);
        const ordinary = finish(w.planner.search(pos(0), pos(6), { fastWalk: false }));
        const fast = finish(w.planner.search(pos(0), pos(6)));
        assert.equal(fast.complete, true);
        assert.equal(fast.fastWalk, false);
        assert.equal(fast.cost, ordinary.cost);
        assert.ok(fast.path.some(node => node.z !== 0));
        for (let i = 1; i < fast.path.length; i++) assert.equal(w.planner.validateTransition(fast.path[i - 1], fast.path[i]), true);
    }
});

test('failed walking probes keep exact mining, building and swimming capabilities', () => {
    const tunnel = world({ fastWalk: true, allowMine: true, now: () => 0 });
    for (let y = 1; y <= 3; y++) tunnel.set(1, y, 0, stone);
    const mining = finish(tunnel.planner.search(pos(0), pos(4), { miningCost: () => 0.25 }));
    assert.equal(mining.complete, true);
    assert.equal(mining.fastWalk, false);
    assert.ok(mining.path.some(node => node.action === 'mine'));
    const gap = world({ fastWalk: true, allowPlace: true, placeBudget: 3, allowGap: false, now: () => 0 });
    for (let x = 1; x <= 3; x++) for (let z = -10; z <= 10; z++) gap.set(x, 0, z, air);
    const building = finish(gap.planner.search(pos(0), pos(4)));
    assert.equal(building.complete, true);
    assert.equal(building.placements, 3);
    assert.equal(building.fastWalk, false);
    const pool = world({ fastWalk: true, now: () => 0 });
    for (let x = 1; x <= 3; x++) for (let z = -10; z <= 10; z++) {
        pool.set(x, 1, z, water); pool.set(x, 0, z, air);
    }
    const swimming = finish(pool.planner.search(pos(0), pos(4)));
    assert.equal(swimming.complete, true);
    assert.ok(swimming.path.some(node => node.action === 'swim'));
    assert.equal(swimming.fastWalk, false);
});

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
    w.set(1, 3, 0, { ...stone, breakable: false });
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

test('altitude-aware A* remains Dijkstra-optimal across deterministic three-dimensional hills', () => {
    let seed = 517;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
    for (let layout = 0; layout < 16; layout++) {
        const heights = new Map();
        for (let x = 0; x <= 8; x++) for (let z = 0; z <= 4; z++) heights.set(`${x},${z}`, Math.floor(random() * 3));
        const planner = api.create((x, y, z) => {
            if (x < 0 || x > 8 || z < 0 || z > 4 || y < 0 || y > 7) return null;
            return y <= heights.get(`${x},${z}`) ? stone : air;
        }, { now: () => 0, allowGap: false, goalRadius: 0 });
        for (const reverse of [false, true]) {
            const a = pos(0, heights.get('0,0') + 1);
            const b = pos(8, heights.get('8,4') + 1, 4);
            const start = reverse ? b : a, goal = reverse ? a : b;
            const expected = dijkstraCost(planner, start, node => coord(node.x, node.y, node.z) === coord(goal.x, goal.y, goal.z));
            const result = finish(planner.search(start, goal));
            assert.equal(result.complete, Number.isFinite(expected));
            if (result.complete) assert.ok(Math.abs(result.cost - expected) < 1e-9, `3D hill ${layout}, reversed ${reverse}`);
        }
    }
});

test('altitude-aware bounds remain consistent for walking, mining, bridging, gaps, drops and swimming', () => {
    const instrumented = { performance };
    vm.runInNewContext(source.replace('version: BARITONE_PLANNER_VERSION', 'version: BARITONE_PLANNER_VERSION, testDistance: routeDistance'), instrumented);
    const distance = instrumented.__MF_BARITONE_PLANNER__.testDistance;
    const edges = [];
    const addEdges = (w, from) => { for (const next of w.planner.neighbors(from)) edges.push({ from, next }); };
    addEdges(world(), pos(0));
    const jump = world(); jump.set(1, 1, 0, stone); addEdges(jump, pos(0));
    const mine = world({ allowMine: true, miningCost: () => .25 });
    mine.set(1, 1, 0, stone); mine.set(1, 2, 0, stone); addEdges(mine, pos(0));
    const bridge = world({ allowPlace: true, placeBudget: 1 }); bridge.set(1, 0, 0, air); addEdges(bridge, pos(0));
    for (const drop of [1, 2, 3]) {
        const dry = world({ allowGap: false });
        for (let y = 0; y > -drop; y--) dry.set(1, y, 0, air);
        dry.set(1, -drop, 0, stone); addEdges(dry, pos(0));
        const wet = world({ allowGap: false });
        for (let y = 0; y > 1 - drop; y--) wet.set(1, y, 0, air);
        wet.set(1, 1 - drop, 0, water); addEdges(wet, pos(0));
    }
    const waterColumn = world();
    for (let y = 0; y <= 3; y++) waterColumn.set(0, y, 0, water);
    waterColumn.set(1, 1, 0, stone);
    waterColumn.set(-1, 1, 0, water); addEdges(waterColumn, pos(0));
    const actions = new Set(edges.map(({ next }) => next.action));
    assert.deepEqual([...actions].sort(), ['bridge', 'drop', 'gap', 'jump', 'mine', 'mineJump', 'swim', 'walk']);
    assert.equal(edges.filter(({ next }) => next.action === 'drop').some(({ from, next }) => from.y - next.y === 3), true);
    for (const radius of [0, 1, 2, 4]) {
        for (const goal of [pos(-5, -3, 7), pos(3, 6, -5), pos(0, 1, 0), pos(8, 1, 3)]) {
            for (const { from, next } of edges) {
                assert.ok(distance(from, goal, radius) <= next.cost + distance(next, goal, radius) + 1e-9,
                    `consistent ${next.action} bound toward ${coord(goal.x, goal.y, goal.z)}, radius ${radius}`);
            }
            assert.equal(distance({ x: goal.x + radius, y: goal.y - radius, z: goal.z - radius }, goal, radius), 0);
        }
    }
});

test('altitude bounds subtract adjusted-goal radius and do not prefer an unnecessarily high destination', () => {
    const w = world({ min: -2, max: 8, goalRadius: 2, now: () => 0 });
    w.set(4, 3, 0, { ...stone, breakable: false });
    const goal = pos(4, 3);
    const expected = dijkstraCost(w.planner, pos(0), node =>
        Math.abs(node.x - goal.x) <= 2 && Math.abs(node.y - goal.y) <= 2 && Math.abs(node.z - goal.z) <= 2);
    const result = finish(w.planner.search(pos(0), goal));
    assert.equal(result.complete, true);
    assert.equal(result.adjustedGoal, true);
    assert.equal(result.cost, expected);
    assert.equal(result.cost, 2);
});

test('long uphill and downhill searches prioritize useful altitude without expanding parallel plains', () => {
    for (const descending of [false, true]) {
        for (const length of [32, 64, 96, 128]) {
            const height = x => descending ? Math.max(0, length / 8 - Math.floor(Math.max(0, x) / 8)) : Math.floor(Math.max(0, x) / 8);
            const planner = api.create((x, y, z) => {
                if (x < -16 || x > 160 || z < -96 || z > 96 || y < 0 || y > 48) return null;
                return y <= height(x) ? stone : air;
            }, { now: () => 0, goalRadius: 0, maxNodesTotal: 20000, maxTimeMs: 5000 });
            const result = finish(planner.search(pos(0, height(0) + 1), pos(length, height(length) + 1)));
            assert.equal(result.complete, true);
            assert.equal(result.adjustedGoal, false);
            const expected = length + (descending ? .35 : .7) * (length / 8);
            assert.ok(Math.abs(result.cost - expected) < 1e-9);
            assert.equal(result.visited, length + 1, 'the known minimum-cost slope need not explore a broad parallel altitude');
            assert.ok(result.terrainReads <= (length + 1) * 10);
        }
    }
});

test('water routes enter a pool, swim over missing support and leave onto land', () => {
    const w = world({ min: 0, max: 4, allowGap: false });
    for (let x = 0; x <= 4; x++) {
        for (let z = 1; z <= 4; z++) {
            for (let y = 1; y <= 3; y++) w.set(x, y, z, { ...stone, breakable: false });
        }
    }
    for (let x = 1; x <= 3; x++) {
        w.set(x, 0, 0, air);
        w.set(x, 1, 0, water);
    }
    assert.equal(w.planner.canStand(1, 1, 0), false);
    assert.equal(w.planner.canSwim(1, 1, 0), true);
    assert.equal(w.planner.canNavigate(1, 1, 0), true);
    const entry = hasNeighbor(w.planner, pos(0), pos(1), 'swim');
    assert.ok(entry);
    assert.equal(w.planner.validateTransition(pos(0), entry), true);
    assert.ok(hasNeighbor(w.planner, pos(3), pos(4), 'swim'));
    const result = finish(w.planner.search(pos(0), pos(4)));
    assert.equal(result.complete, true);
    assert.equal(result.path.filter(node => node.action === 'swim').length, 4);
});

test('swimming rises and descends in known water and can climb one block onto shore', () => {
    const w = world({ allowSwim: true });
    for (let y = 0; y <= 2; y++) w.set(0, y, 0, water);
    const up = hasNeighbor(w.planner, pos(0), pos(0, 2), 'swim');
    const down = hasNeighbor(w.planner, pos(0), pos(0, 0), 'swim');
    assert.ok(up);
    assert.ok(down);
    assert.ok(up.cost < down.cost, 'surfacing is preferred to diving');
    w.set(1, 1, 0, stone);
    assert.ok(hasNeighbor(w.planner, pos(0), pos(1, 2), 'swim'));
    const surfaced = finish(w.planner.search(pos(0), pos(0, 2)));
    assert.equal(surfaced.complete, true);
    assert.equal(surfaced.adjustedGoal, false);
    assert.equal(surfaced.path.at(-1).y, 2);
});

test('a long underwater crossing prefers rising to breathable surface water', () => {
    const w = world({ min: 0, max: 10, allowGap: false, goalRadius: 0 });
    for (let x = 0; x <= 10; x++) {
        w.set(x, 1, 0, water);
        w.set(x, 2, 0, water);
        for (let z = 1; z <= 10; z++) {
            for (let y = 1; y <= 3; y++) w.set(x, y, z, { ...stone, breakable: false });
        }
    }
    const result = finish(w.planner.search(pos(0), pos(10)));
    assert.equal(result.complete, true);
    assert.ok(result.path.some(node => node.y === 2), 'surface route has lower cost than staying submerged');
    assert.equal(result.path.at(-1).y, 1);
});

function submergedTunnel(length, options = {}) {
    const w = world({ min: 0, max: length, allowGap: false, goalRadius: 0, ...options });
    for (let x = 0; x <= length; x++) {
        w.set(x, 1, 0, water);
        w.set(x, 2, 0, water);
        w.set(x, 3, 0, { ...stone, breakable: false });
        for (let z = 1; z <= length; z++) {
            for (let y = 1; y <= 3; y++) w.set(x, y, z, { ...stone, breakable: false });
        }
    }
    return w;
}

test('sealed underwater tunnels cannot silently exceed the available submerged-step budget', () => {
    const w = submergedTunnel(14);
    const result = finish(w.planner.search(pos(0), pos(14)));
    assert.equal(result.complete, false);
    assert.equal(result.path.at(-1).x, 12);
    assert.equal(result.submergedSteps, 12);
    const tight = submergedTunnel(6, { maxSubmergedSteps: 3 });
    const stopped = finish(tight.planner.search(pos(0), pos(6)));
    assert.equal(stopped.complete, false);
    assert.equal(stopped.path.at(-1).x, 3);
    const enough = finish(w.planner.search(pos(0), pos(14), { maxSubmergedSteps: 16 }));
    assert.equal(enough.complete, true);
});

test('known breathable headroom resets the swim budget and preserves surface detours', () => {
    const w = submergedTunnel(18, { maxSubmergedSteps: 5 });
    for (const x of [4, 8, 12, 16]) w.set(x, 2, 0, air);
    const result = finish(w.planner.search(pos(0), pos(18)));
    assert.equal(result.complete, true);
    assert.ok(result.submergedSteps <= 5);
    assert.equal(result.path.some(node => '_submergedSteps' in node), false);
    w.unknown.add(coord(8, 2, 0));
    const unknown = finish(w.planner.search(pos(0), pos(18)));
    assert.equal(unknown.complete, false, 'unknown headroom is not assumed breathable');
});

test('water traversal refuses lava, unknown or blocked heads and can be disabled', () => {
    const w = world();
    w.set(1, 1, 0, water);
    w.set(1, 2, 0, stone);
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1), 'swim'), undefined);
    w.set(1, 2, 0, air);
    w.unknown.add(coord(1, 2, 0));
    assert.equal(w.planner.canSwim(1, 1, 0), false);
    w.unknown.clear();
    w.set(1, 1, 0, { ...water, hazard: true, name: 'lava' });
    assert.equal(w.planner.canNavigate(1, 1, 0), false);
    const disabled = world({ allowSwim: false });
    disabled.set(1, 1, 0, water);
    assert.equal(disabled.planner.canSwim(1, 1, 0), false);
    assert.equal(hasNeighbor(disabled.planner, pos(0), pos(1)), undefined);
    assert.equal(disabled.planner.search(pos(1), pos(0)).result.reason, 'invalid_start');
});

test('water drop entry uses a safe known fluid shaft, not a dry unsupported node', () => {
    const w = world({ allowGap: false });
    w.set(1, 0, 0, water);
    assert.ok(hasNeighbor(w.planner, pos(0), pos(1, 0), 'swim'));
    w.set(1, 1, 0, { ...air, hazard: true });
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1, 0), 'swim'), undefined);
});

function bridgeCorridor(placeBudget) {
    const w = world({ allowPlace: true, placeBudget, allowGap: false, min: 0, max: 4, goalRadius: 0 });
    for (let x = 0; x <= 4; x++) {
        for (let z = 1; z <= 4; z++) {
            for (let y = 1; y <= 3; y++) w.set(x, y, z, { ...stone, breakable: false });
        }
    }
    for (let x = 1; x <= 3; x++) w.set(x, 0, 0, air);
    return w;
}

test('bridges chain planned support floors but never exceed the available block budget', () => {
    const w = bridgeCorridor(3);
    const result = finish(w.planner.search(pos(0), pos(4)));
    assert.equal(result.complete, true);
    assert.equal(result.placements, 3);
    const bridges = result.path.filter(node => node.action === 'bridge');
    assert.equal(bridges.length, 3);
    assert.deepEqual(JSON.parse(JSON.stringify(bridges.map(node => node.placeBlocks[0]))), [pos(1, 0), pos(2, 0), pos(3, 0)]);
    assert.equal(result.path.some(node => '_placed' in node), false, 'search internals stay out of execution paths');
    const insufficient = finish(bridgeCorridor(2).planner.search(pos(0), pos(4)));
    assert.equal(insufficient.complete, false);
    assert.ok(insufficient.placements <= 2);
    const empty = finish(bridgeCorridor(0).planner.search(pos(0), pos(4)));
    assert.equal(empty.complete, false);
    assert.equal(empty.placements, 0);
});

test('a bounded bridge search returns executable resource-limited progress through a wide gap', () => {
    const w = world({ allowPlace: true, placeBudget: 32, allowGap: false, maxNodesTotal: 200, goalRadius: 0, min: -12, max: 12 });
    for (let x = -12; x <= 12; x++) {
        for (let z = -12; z <= 12; z++) {
            if ((x === 0 || x === 10) && z === 0) continue;
            w.set(x, 0, z, air);
        }
    }
    const result = finish(w.planner.search(pos(0), pos(10)));
    assert.equal(result.complete, false);
    assert.equal(result.reason, 'node_budget');
    assert.ok(result.path.at(-1).x > 0);
    assert.ok(result.placements > 0 && result.placements <= 32);
    // Execute the returned construction plan and ensure every anchor becomes
    // real before the next edge is validated; no projected support is exposed.
    for (let index = 1; index < result.path.length; index++) {
        const previous = result.path[index - 1];
        const next = result.path[index];
        assert.equal(w.planner.validateTransition(previous, next), true);
        for (const block of next.placeBlocks ?? []) w.set(block.x, block.y, block.z, stone);
        assert.equal(w.planner.canStand(next.x, next.y, next.z), true);
    }
});

test('bridge transitions recheck the anchor, accept confirmed placement and reject unsafe target changes', () => {
    const w = bridgeCorridor(3);
    const bridge = hasNeighbor(w.planner, pos(0), pos(1), 'bridge');
    assert.ok(bridge);
    assert.equal(w.planner.validateTransition(pos(0), bridge), true);
    w.set(1, 0, 0, stone);
    assert.equal(w.planner.validateTransition(pos(0), bridge), true);
    w.set(1, 0, 0, { ...air, hazard: true });
    assert.equal(w.planner.validateTransition(pos(0), bridge), false);
    w.set(1, 0, 0, air);
    w.set(0, 0, 0, air);
    assert.equal(w.planner.validateTransition(pos(0), bridge), false);
});

test('a bridgeable destination keeps its exact goal instead of completing on nearby land', () => {
    const w = world({ allowPlace: true, placeBudget: 1, allowGap: false, goalRadius: 3 });
    w.set(1, 0, 0, air);
    const result = finish(w.planner.search(pos(0), pos(1)));
    assert.equal(result.complete, true);
    assert.equal(result.adjustedGoal, false);
    assert.equal(result.path.at(-1).action, 'bridge');
    assert.equal(result.placements, 1);
});

test('bridges do not replace fluids, hazardous, unknown or nonreplaceable cells', () => {
    const w = bridgeCorridor(3);
    for (const bad of [water, { ...air, hazard: true }, { ...air, replaceable: false }]) {
        w.set(1, 0, 0, bad);
        assert.equal(hasNeighbor(w.planner, pos(0), pos(1), 'bridge'), undefined);
    }
    w.set(1, 0, 0, air);
    w.unknown.add(coord(1, 0, 0));
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1), 'bridge'), undefined);
    const off = world({ allowPlace: false, placeBudget: 64 });
    off.set(1, 0, 0, air);
    assert.equal(hasNeighbor(off.planner, pos(0), pos(1), 'bridge'), undefined);
});

test('mineable exact destinations are not replaced by an already reached nearby stand tile', () => {
    const w = world({ allowMine: true, goalRadius: 3 });
    w.set(2, 1, 0, stone);
    w.set(2, 2, 0, stone);
    const result = finish(w.planner.search(pos(0), pos(2)));
    assert.equal(result.complete, true);
    assert.equal(result.adjustedGoal, false);
    assert.equal(result.goal.x, 2);
    assert.equal(result.path.at(-1).action, 'mine');
});

test('excavation candidates require mining enabled, safe support and only breakable body obstacles', () => {
    const w = world({ allowMine: true });
    w.set(1, 1, 0, stone);
    w.set(1, 2, 0, stone);
    assert.equal(w.planner.canExcavate(1, 1, 0), true);
    assert.equal(w.planner.canExcavate(0, 1, 0), false, 'already open air is navigation, not excavation');
    w.set(1, 2, 0, { ...stone, breakable: false });
    assert.equal(w.planner.canExcavate(1, 1, 0), false);
    w.set(1, 2, 0, stone);
    w.set(1, 0, 0, air);
    assert.equal(w.planner.canExcavate(1, 1, 0), false);
    w.set(1, 0, 0, stone);
    w.set(1, 1, 0, water);
    assert.equal(w.planner.canExcavate(1, 1, 0), false);
    const off = world({ allowMine: false });
    off.set(1, 1, 0, stone);
    assert.equal(off.planner.canExcavate(1, 1, 0), false);
    assert.equal(w.planner.canExcavate(1.5, 1, 0), false);
});

test('tunnel mining continues through consecutive feet and head obstacles without lateral space', () => {
    const w = world({ allowMine: true, min: 0, max: 4, goalRadius: 3 });
    for (let x = 0; x <= 4; x++) {
        w.set(x, 3, 0, { ...stone, breakable: false });
        for (let z = 1; z <= 4; z++) {
            for (let y = 1; y <= 3; y++) w.set(x, y, z, { ...stone, breakable: false });
        }
        if (x > 0) {
            w.set(x, 1, 0, stone);
            w.set(x, 2, 0, stone);
        }
    }
    const result = finish(w.planner.search(pos(0), pos(4)));
    assert.equal(result.complete, true);
    assert.equal(result.adjustedGoal, false);
    assert.equal(result.path.length, 5);
    assert.equal(result.path.filter(node => node.action === 'mine').length, 4);
    assert.ok(result.path.slice(1).every(node => node.breakBlocks.length === 2));
});

test('long loaded routes stay incremental and preserve the real destination', () => {
    const w = world({ min: 0, max: 1024, maxNodesTotal: 2000 });
    const job = w.planner.search(pos(0), pos(1000));
    assert.equal(job.step({ maxMs: 16, maxNodes: 10 }), null);
    const result = finish(job);
    assert.equal(result.complete, true);
    assert.equal(result.path.length, 1001);
    assert.equal(result.path.at(-1).x, 1000);
    assert.equal(result.adjustedGoal, false);
});

test('mining route costs reflect known block hardness and a bounded per-tool callback', () => {
    const soft = world({ allowMine: true });
    soft.set(1, 1, 0, { ...stone, hardness: .5 });
    soft.set(1, 2, 0, { ...stone, hardness: .5 });
    assert.ok(Math.abs(hasNeighbor(soft.planner, pos(0), pos(1), 'mine').cost - (1 + 8 / 3)) < 1e-9);
    const calls = [];
    const equipped = world({ allowMine: true, miningCost: (point, info) => {
        calls.push({ ...point, hardness: info.hardness });
        return .5;
    } });
    equipped.set(1, 1, 0, { ...stone, hardness: 30 });
    equipped.set(1, 2, 0, { ...stone, hardness: 30 });
    assert.equal(hasNeighbor(equipped.planner, pos(0), pos(1), 'mine').cost, 2);
    assert.ok(calls.some(point => point.x === 1 && point.y === 2 && point.hardness === 30));
    const broken = world({ allowMine: true, miningCost: () => { throw new Error('tool unavailable'); } });
    broken.set(1, 1, 0, stone); broken.set(1, 2, 0, stone);
    assert.equal(hasNeighbor(broken.planner, pos(0), pos(1), 'mine').cost, 9);
    const instant = world({ allowMine: true, miningCost: () => 0 });
    instant.set(1, 1, 0, stone);
    assert.equal(hasNeighbor(instant.planner, pos(0), pos(1), 'mine').cost, 1.25, 'a callback cannot create zero-cost mining loops');
});

test('route selection prefers a quick excavation but walks around expensive rock', () => {
    const w = world({ allowMine: true, goalRadius: 0, miningCost: () => .25 });
    for (let y = 1; y <= 3; y++) w.set(1, y, 0, stone);
    const cheap = finish(w.planner.search(pos(0), pos(3)));
    assert.equal(cheap.complete, true);
    assert.ok(cheap.path.some(node => node.action === 'mine'));
    const expensive = finish(w.planner.search(pos(0), pos(3), { miningCost: () => 100 }));
    assert.equal(expensive.complete, true);
    assert.equal(expensive.path.some(node => node.action === 'mine' || node.action === 'mineJump'), false);
    assert.ok(expensive.path.some(node => node.z !== 0));
});

test('bridge material cost penalizes inventory consumption without changing the placement budget', () => {
    const w = world({ allowPlace: true, placeBudget: 1, materialCost: 3 });
    w.set(1, 0, 0, air);
    const bridge = hasNeighbor(w.planner, pos(0), pos(1), 'bridge');
    assert.equal(bridge.cost, 9);
    const result = finish(w.planner.search(pos(0), pos(1)));
    assert.equal(result.complete, true);
    assert.equal(result.placements, 1);
    assert.equal(result.cost, 9);
});

test('ascending excavation climbs existing full ledges through a narrow stair corridor', () => {
    const w = world({ min: 0, max: 3, allowMine: true, goalRadius: 0 });
    for (let x = 0; x <= 3; x++) {
        for (let z = 1; z <= 3; z++) {
            for (let y = 1; y <= 7; y++) w.set(x, y, z, { ...stone, breakable: false });
        }
        if (x > 0) for (let y = 1; y <= x + 2; y++) w.set(x, y, 0, stone);
    }
    const result = finish(w.planner.search(pos(0), pos(3, 4)));
    assert.equal(result.complete, true);
    assert.equal(result.path.filter(node => node.action === 'mineJump').length, 3);
    assert.equal(result.path.at(-1).y, 4);
    for (let index = 1; index < result.path.length; index++) {
        const before = result.path[index - 1], next = result.path[index];
        assert.equal(w.planner.validateTransition(before, next), true);
        for (const obstacle of next.breakBlocks) w.set(obstacle.x, obstacle.y, obstacle.z, air);
        assert.equal(w.planner.validateTransition(before, next), true, 'completed excavation becomes a normal jump');
    }
});

test('ascending excavation rejects blocked departure headroom, unknown or unbreakable upper blocks and partial floors', () => {
    const w = world({ allowMine: true });
    w.set(1, 1, 0, stone);
    w.set(1, 2, 0, stone);
    assert.ok(hasNeighbor(w.planner, pos(0), pos(1, 2), 'mineJump'));
    w.set(0, 3, 0, stone);
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1, 2), 'mineJump'), undefined);
    w.set(0, 3, 0, air);
    w.set(1, 3, 0, { ...stone, breakable: false });
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1, 2), 'mineJump'), undefined);
    w.set(1, 3, 0, air);
    w.unknown.add(coord(1, 3, 0));
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1, 2), 'mineJump'), undefined);
    w.unknown.clear();
    w.set(1, 1, 0, { ...stone, height: .5 });
    assert.equal(hasNeighbor(w.planner, pos(0), pos(1, 2), 'mineJump'), undefined);
});

test('ascending excavation transition validation never adds an unplanned upper obstacle', () => {
    const w = world({ allowMine: true });
    w.set(1, 1, 0, stone); w.set(1, 2, 0, stone);
    const planned = hasNeighbor(w.planner, pos(0), pos(1, 2), 'mineJump');
    assert.equal(w.planner.validateTransition(pos(0), planned), true);
    w.set(1, 3, 0, stone);
    assert.equal(w.planner.validateTransition(pos(0), planned), false);
    w.set(1, 3, 0, air); w.set(1, 2, 0, air);
    assert.equal(w.planner.validateTransition(pos(0), planned), true);
});

test('a later jump cannot reuse a foundation already removed earlier in the planned route', () => {
    const read = (x, y, z) => {
        if (x < 0 || x > 2 || z !== 0 || y < 0 || y > 5) return null;
        return y === 0 || (x === 0 && y === 3) || (x === 1 && y === 1) ? stone : air;
    };
    const planner = api.create(read, { allowMine: true, goalRadius: 0 });
    const result = finish(planner.search(pos(0), pos(1, 2)));
    assert.equal(result.complete, false, 'mining the target foundation must not produce a falsely completed route');
    assert.equal(result.path.some(point => point.action === 'jump' && point.x === 1 && point.y === 2), false);
    assert.ok(result.path.every(point => !('_minedHistory' in point) && !('_minedBounds' in point)));
});

test('ascending excavation also rejects ledges removed earlier even when upper obstacles are breakable', () => {
    const read = (x, y, z) => {
        if (x < 0 || x > 2 || z !== 0 || y < 0 || y > 5) return null;
        return y === 0 || (x === 0 && y === 3) || (x === 1 && y >= 1 && y <= 3) ? stone : air;
    };
    const planner = api.create(read, { allowMine: true, goalRadius: 0 });
    const result = finish(planner.search(pos(0), pos(1, 2)));
    assert.equal(result.complete, false);
    assert.equal(result.path.some(point => point.action === 'mineJump' && point.x === 1 && point.y === 2), false);
});

test('a search job memoizes duplicate terrain reads within its own bounded snapshot', () => {
    const w = world(), calls = new Map();
    const planner = api.create((x, y, z) => {
        const id = coord(x, y, z);
        calls.set(id, (calls.get(id) ?? 0) + 1);
        return w.read(x, y, z);
    });
    const result = finish(planner.search(pos(0), pos(8)));
    assert.equal(result.complete, true);
    assert.ok([...calls.values()].every(count => count === 1));
    assert.ok(result.cacheHits > 0);
    assert.equal(result.terrainReads, calls.size);
    assert.equal(result.cachedCells, calls.size);
    const bounded = world({ min: 0, max: 100, terrainCacheLimit: 32 });
    const limited = finish(bounded.planner.search(pos(0), pos(90)));
    assert.equal(limited.complete, true);
    assert.equal(limited.cachedCells, 32);
});

test('live transition validation and a later job never reuse an earlier terrain snapshot', () => {
    const w = world({ goalRadius: 0 });
    const walk = hasNeighbor(w.planner, pos(0), pos(1), 'walk');
    const old = w.planner.search(pos(0), pos(5));
    old.step({ maxNodes: 1 });
    w.set(1, 0, 0, air);
    assert.equal(w.planner.validateTransition(pos(0), walk), false);
    assert.equal(w.planner.canStand(1, 1, 0), false);
    const fresh = finish(w.planner.search(pos(0), pos(1)));
    assert.equal(fresh.complete, false);
    old.cancel();
    w.set(1, 0, 0, stone);
    assert.equal(finish(w.planner.search(pos(0), pos(1))).complete, true);
});

test('job previews are capped, detached from search records and remain available after completion', () => {
    // This test advances by node count, independently of parallel test load.
    const w = world({ now: () => 0 });
    const job = w.planner.search(pos(0), pos(8));
    assert.equal(job.preview().visited, 0);
    assert.equal(job.preview().done, false);
    job.step({ maxNodes: 5 });
    const preview = job.preview({ maxWaypoints: 2 });
    assert.equal(preview.path.length, 2);
    assert.equal(preview.truncated, true);
    assert.ok(preview.frontier);
    assert.ok(preview.path.every(point => !('parent' in point) && !('_placed' in point)));
    preview.path[0].x = 10000;
    preview.goal.x = 10000;
    assert.equal(job.preview().path[0].x, 0);
    const completed = finish(job);
    const final = job.preview();
    assert.equal(final.done, true);
    assert.equal(final.complete, true);
    assert.equal(final.path.at(-1).x, completed.goal.x);
    const cancelled = w.planner.search(pos(0), pos(8));
    cancelled.cancel();
    assert.equal(cancelled.preview().reason, 'cancelled');
    assert.equal(cancelled.preview().path.length, 0);
});

test('bounded search returns a meaningful backwards detour rather than the already occupied start', () => {
    const w = world({ min: -8, max: 10, maxNodesTotal: 4, allowGap: false, goalRadius: 0 });
    for (let x = -3; x <= 1; x++) {
        for (const z of [-1, 1]) for (let y = 1; y <= 3; y++) w.set(x, y, z, { ...stone, breakable: false });
    }
    for (let y = 1; y <= 3; y++) w.set(1, y, 0, { ...stone, breakable: false });
    const result = finish(w.planner.search(pos(0), pos(8)));
    assert.equal(result.complete, false);
    assert.equal(result.reason, 'node_budget');
    assert.ok(result.path.at(-1).x <= -3, 'the safe unexplored frontier can initially move away from the goal');
    assert.ok(result.path.length >= 4);
    for (let i = 1; i < result.path.length; i++) assert.equal(w.planner.validateTransition(result.path[i - 1], result.path[i]), true);
    const complete = finish(w.planner.search(pos(0), pos(8), { maxNodesTotal: 2000 }));
    assert.equal(complete.complete, true);
    assert.ok(complete.path.some(point => point.x <= -4));
});

test('a fully explored loaded frontier waits at its closest tile instead of roaming sideways', () => {
    const w = world({ min: -8, max: 8, goalRadius: 0 });
    for (let x = 1; x <= 8; x++) for (let z = -8; z <= 8; z++) {
        for (const y of [0, 1, 2, 3]) w.unknown.add(coord(x, y, z));
    }
    const result = finish(w.planner.search(pos(0), pos(7)));
    assert.equal(result.complete, false);
    assert.equal(result.reason, 'unloaded_frontier');
    assert.equal(result.path.length, 1);
    assert.equal(result.path[0].x, 0);
    assert.equal(result.path[0].z, 0);
});

test('a proven gap with no blocks available never selects a backwards construction detour', () => {
    const w = world({ min: -8, max: 8, goalRadius: 0, allowGap: false, allowPlace: true, placeBudget: 0 });
    for (let x = 1; x <= 8; x++) for (let z = -8; z <= 8; z++) w.set(x, 0, z, air);
    const result = finish(w.planner.search(pos(0), pos(7)));
    assert.equal(result.complete, false);
    assert.equal(result.path.length, 1);
    assert.equal(result.path[0].x, 0);
    assert.equal(result.path[0].z, 0);
});
