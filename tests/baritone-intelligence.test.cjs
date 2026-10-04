'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Reuse the controlled native-input fixture, not its tests. The planner and
// navigation runtime loaded by this fixture are the actual client modules.
const source = fs.readFileSync(path.join(__dirname, 'baritone-expansion.test.cjs'), 'utf8');
const boundary = source.search(/\r?\ntest\(/);
assert.ok(boundary > 0, 'the reusable expansion fixture must exist');
const fixture = vm.runInNewContext(source.slice(0, boundary) + '\n({ harness, air, stone });',
  { require, __dirname, console });
const { harness, air, stone } = fixture;
const bedrock = { ...stone, name: 'bedrock', breakable: false };
const plain = value => JSON.parse(JSON.stringify(value));

function instrumentSearch(h, configure = () => ({})) {
  const factory = h.context.__MF_BARITONE_PLANNER__;
  const create = factory.create;
  h.context.__MF_BARITONE_PLANNER__ = { ...factory, create(...args) {
    const planner = create(...args);
    return { ...planner, search(...searchArgs) {
      const job = planner.search(...searchArgs);
      const options = configure(searchArgs, h.jobs.length - 1) || {};
      const step = job.step, cancel = job.cancel;
      job.steps = 0; job.cancellations = 0;
      job.step = budget => {
        job.steps++;
        if (options.hold) return null;
        return step(options.nodes ? { ...budget, maxNodes: options.nodes } : budget);
      };
      job.cancel = () => { job.cancellations++; return cancel(); };
      return job;
    } };
  } };
}

function statuses(h) {
  const events = [];
  h.context.document.addEventListener('minifeather:baritone-state', event => {
    events.push({ ...JSON.parse(event.detail), time: h.time() });
  });
  return events;
}

function renderer(h, overrides = {}) {
  const log = { created: 0, bound: [], visible: [], updates: [], clears: 0, destroyed: 0 };
  const instance = {
    bind(game) { log.bound.push(game); return true; },
    setVisible(value) { log.visible.push(value); },
    update(value) { log.updates.push(plain(value)); },
    clear() { log.clears++; },
    destroy() { log.destroyed++; },
    diagnostics: () => ({ ready: true }),
    ...overrides
  };
  h.context.__MF_BARITONE_PATH_RENDERER__ = { create() { log.created++; return instance; } };
  return log;
}

function raisedRoute() {
  const h = harness({ maxX: 12 });
  // An unbreakable first step makes mining the headroom and climbing the only
  // route; the player must never tunnel through the intended support block.
  for (let x = 1; x <= 12; x++) h.set(x, 1, 0, x === 1 ? bedrock : stone);
  h.set(1, 2, 0, stone);
  assert.equal(h.api.goto(5, 2, 0), true);
  const result = h.plannedJob().job.result;
  assert.equal(result.complete, true);
  const step = result.path.find(point => point.x === 1);
  assert.equal(step?.action, 'mineJump', JSON.stringify(result));
  assert.deepEqual(plain(step.breakBlocks), [{ x: 1, y: 2, z: 0 }]);
  h.advance(50);
  return h;
}

test('precalculates the next 32-block segment while walking and splices without a search pause', () => {
  const h = harness({ maxX: 160 });
  const events = statuses(h);
  assert.equal(h.api.goto(96, 1, 0), true);
  const initial = h.plannedJob();
  assert.equal(initial.goal.x, 32);
  const path = initial.job.result.path;
  assert.equal(path.at(-1).x, 32);
  h.advance(50); // Consume the route's start waypoint before simulating travel.
  for (const point of path.slice(1, -1)) { h.moveTo(point); h.advance(50); }
  assert.equal(h.api.status, 'moving');
  assert.equal(h.jobs.length, 2, 'one next segment is calculated before reaching the endpoint');
  const next = h.jobs[1];
  assert.equal(next.start.x, 32);
  assert.equal(next.goal.x, 64);
  assert.equal(next.job.done, true);
  assert.equal(h.api.debug().planning, false, 'background calculation does not replace the walking state');
  assert.ok(h.controls.some(input => input.forward === 1 && input.time > initial.job.result.elapsedMs));
  const beforeArrival = events.length;
  h.moveTo(path.at(-1)); h.advance(50);
  assert.equal(h.api.status, 'moving');
  assert.equal(h.api.debug().routeGoal.x, 64);
  assert.equal(h.api.debug().pathIndex, 1, 'the shared endpoint is consumed in the arrival tick');
  assert.equal(h.jobs.length, 2, 'arrival consumes the prepared route, not another search');
  assert.equal(events.slice(beforeArrival).some(event => event.status === 'pathfinding'), false);
  assert.ok(events.slice(beforeArrival).some(event => /precalculated route/.test(event.reason)));
  assert.deepEqual(plain(h.api.goal), { x: 96, y: 1, z: 0 });
  assert.equal(h.controls.at(-1).forward, 1, 'native walking continues in the arrival tick without a neutral control gap');
  h.api.destroy();
});

test('stop cancels an unfinished background segment and prevents further search or input work', () => {
  const h = harness({ maxX: 160 });
  instrumentSearch(h, (_args, index) => ({ hold: index > 0 }));
  assert.equal(h.api.goto(96, 1, 0), true);
  const initial = h.plannedJob();
  h.advance(50);
  for (const point of initial.job.result.path.slice(1)) {
    h.moveTo(point); h.advance(50);
    if (h.jobs.length > 1) break;
  }
  const next = h.jobs[1]?.job;
  assert.ok(next, 'prefetch starts before arrival');
  assert.equal(next.done, false);
  assert.equal(h.api.debug().precalculating, true);
  const steps = next.steps;
  h.api.stop();
  assert.equal(next.cancellations, 1);
  assert.equal(next.done, true);
  assert.equal(next.result.reason, 'cancelled');
  assert.equal(h.api.debug().precalculating, false);
  const inputs = h.controls.length;
  h.advance(1000);
  assert.equal(next.steps, steps);
  assert.equal(h.jobs.length, 2);
  assert.equal(h.controls.length, inputs);
  assert.equal(h.controls.at(-1).released, true);
  h.api.destroy();
});

test('each tunnel obstruction selects its best hotbar tool and restores the original slot after confirmation', () => {
  const h = harness({ maxX: 12 });
  for (let x = 0; x <= 12; x++) h.set(x, 3, 0, bedrock);
  h.set(1, 1, 0, stone); h.set(1, 2, 0, stone);
  const tools = [];
  h.adapter.miningEstimate = () => ({ ticks: 5, slot: 2, name: 'pickaxe' });
  h.adapter.selectMiningTool = target => {
    tools.push(plain(target));
    const slot = target.y === 2 ? 2 : 3;
    h.adapter.selectSlot(slot);
    return { slot, ticks: 5, name: target.y === 2 ? 'pickaxe' : 'shovel' };
  };
  assert.equal(h.api.goto(5, 1, 0), true);
  const job = h.plannedJob();
  assert.ok(job.job.result.path.some(point => point.breakBlocks?.length === 2));
  h.advance(50);
  assert.deepEqual(plain(h.selectedSlots), [2]);
  assert.equal(h.interactions.at(-1).target.y, 2, 'upper obstruction is mined before the feet');
  h.advance(200);
  assert.equal(tools.length, 1, 'holding native mining does not repeatedly switch tools');
  assert.equal(h.config.selectedSlot, 2, 'a sent mining request is not server confirmation');
  h.set(1, 2, 0, air); h.advance(50);
  assert.deepEqual(plain(h.selectedSlots), [2, 4, 3]);
  assert.equal(h.interactions.at(-1).target.y, 1);
  assert.equal(tools.length, 2);
  h.set(1, 1, 0, air); h.advance(50);
  assert.deepEqual(plain(h.selectedSlots), [2, 4, 3, 4]);
  assert.equal(h.config.selectedSlot, 4);
  assert.equal(h.config.miningHeld, false);
  assert.equal(h.controls.at(-1).forward, 1);
  h.api.destroy();
});

test('explicit mining selects the native best tool once and restores the held slot on confirmation or stop', () => {
  for (const confirmed of [true, false]) {
    const h = harness();
    h.set(1, 1, 0, stone);
    let selections = 0;
    h.adapter.selectMiningTool = target => {
      selections++;
      assert.equal(target.x, 1);
      h.adapter.selectSlot(7);
      return { slot: 7, ticks: 10, name: 'diamond_pickaxe' };
    };
    assert.equal(h.api.mine(1, 1, 0), true);
    h.advance(350);
    assert.equal(selections, 1);
    assert.equal(h.config.selectedSlot, 7);
    assert.equal(h.api.status, 'mining');
    if (confirmed) { h.set(1, 1, 0, air); h.advance(50); }
    else h.api.stop();
    assert.equal(h.api.status, 'idle');
    assert.deepEqual(plain(h.selectedSlots), [7, 4]);
    assert.equal(h.config.miningHeld, false);
    h.api.destroy();
  }
});

test('mineJump waits for headroom confirmation and emits one bounded native jump pulse', () => {
  const h = raisedRoute();
  assert.equal(h.api.status, 'mining');
  assert.equal(h.interactions.at(-1).target.y, 2);
  h.advance(200);
  assert.equal(h.controls.some(input => input.jump === true), false, 'mining acknowledgement alone cannot clear collision');
  h.set(1, 2, 0, air);
  const confirmedAt = h.time();
  h.advance(50);
  assert.equal(h.controls.at(-1).jump, true);
  h.advance(350);
  const jumping = h.controls.filter(input => input.jump === true);
  assert.ok(jumping.length > 0);
  assert.ok(jumping.every(input => input.time > confirmedAt));
  assert.ok(jumping.at(-1).time - jumping[0].time < 150, 'native jump is a short pulse, not a held flight input');
  assert.equal(h.controls.at(-1).jump, false);
  const count = jumping.length;
  h.advance(250);
  assert.equal(h.controls.filter(input => input.jump === true).length, count, 'the same waypoint cannot restart a jump');
  h.api.destroy();
});

test('mineJump revalidates the source headroom before moving if a new block appears there', () => {
  const h = raisedRoute();
  h.set(1, 2, 0, air);
  h.set(0, 2, 0, stone);
  const index = h.controls.length;
  h.advance(50);
  assert.equal(h.controls.slice(index).some(input => input.jump === true || input.forward > 0), false,
    'a cleared target must not justify jumping from a newly obstructed source');
  assert.notEqual(h.api.status, 'moving');
  h.api.destroy();
});

test('the route renderer is enabled by default and receives incremental real search previews', () => {
  const h = harness();
  instrumentSearch(h, () => ({ nodes: 1 }));
  const log = renderer(h);
  assert.equal(h.api.debug().showPath, true);
  assert.equal(h.api.goto(20, 1, 0), true);
  h.advance(750);
  assert.equal(h.api.status, 'pathfinding');
  assert.equal(log.created, 1);
  assert.ok(log.bound.every(game => game === h.game));
  const previews = log.updates.filter(value => value.planning && value.preview?.path?.length);
  assert.ok(previews.length > 1, 'background search paints updated route candidates');
  assert.ok(previews.at(-1).preview.visited > previews[0].preview.visited);
  assert.deepEqual(previews.at(-1).goal, { x: 20, y: 1, z: 0 });
  const updates = log.updates.length, clears = log.clears;
  assert.equal(h.api.setShowPath(false), false);
  assert.equal(log.visible.at(-1), false);
  h.advance(250);
  assert.equal(log.updates.length, updates);
  assert.ok(log.clears > clears);
  assert.equal(h.api.setShowPath(true), true);
  assert.equal(log.visible.at(-1), true);
  assert.ok(log.updates.length > updates);
  const beforeStop = log.clears;
  h.api.stop();
  assert.ok(log.clears > beforeStop);
  h.api.destroy();
  assert.equal(log.destroyed, 1);
});

test('turning the path display off does not allocate a renderer or change navigation', () => {
  const h = harness();
  const log = renderer(h);
  h.api.setShowPath(false);
  assert.equal(h.api.goto(8, 1, 0), true);
  const job = h.plannedJob();
  h.advance(50);
  assert.equal(log.created, 0);
  assert.equal(h.api.status, 'moving');
  assert.equal(h.controls.at(-1).forward, 1);
  h.api.setShowPath(true);
  assert.equal(log.created, 1);
  assert.ok(log.updates.at(-1).path.length === job.job.result.path.length);
  h.api.destroy();
});

test('replacing the path renderer factory recreates its instance without interrupting the moving core', () => {
  const h = harness();
  const previous = renderer(h);
  assert.equal(h.api.goto(20, 1, 0), true);
  const job = h.plannedJob();
  h.advance(50);
  assert.equal(previous.created, 1);
  const previousUpdates = previous.updates.length;
  const replacement = renderer(h);
  h.moveTo(job.job.result.path[1]); h.advance(300);
  assert.equal(h.api.status, 'moving');
  assert.equal(h.controls.at(-1).forward, 1);
  assert.equal(h.jobs.length, 1, 'visual hotloading cannot restart the navigation search');
  assert.equal(previous.destroyed, 1);
  assert.equal(previous.updates.length, previousUpdates, 'a superseded instance is not reused');
  assert.equal(replacement.created, 1);
  assert.ok(replacement.updates.some(value => value.path.length === job.job.result.path.length));
  h.advance(300);
  assert.equal(previous.destroyed, 1, 'replacement is detected once, not on every visual tick');
  assert.equal(replacement.created, 1);
  h.api.stop(); h.api.destroy();
  assert.equal(previous.destroyed, 1);
  assert.equal(replacement.destroyed, 1);
});

test('a temporarily absent renderer factory does not interrupt navigation and recovers when it returns', () => {
  const h = harness();
  renderer(h);
  assert.equal(h.api.goto(20, 1, 0), true);
  const job = h.plannedJob();
  h.advance(50);
  delete h.context.__MF_BARITONE_PATH_RENDERER__;
  h.moveTo(job.job.result.path[1]); h.advance(300);
  assert.equal(h.api.status, 'moving');
  assert.equal(h.controls.at(-1).forward, 1);
  assert.equal(h.jobs.length, 1);
  const restored = renderer(h);
  h.moveTo(job.job.result.path[2]); h.advance(300);
  assert.equal(h.api.status, 'moving');
  assert.equal(h.controls.at(-1).forward, 1);
  assert.equal(restored.created, 1);
  assert.ok(restored.updates.some(value => value.path.length === job.job.result.path.length));
  assert.deepEqual(plain(h.api.goal), { x: 20, y: 1, z: 0 });
  h.api.destroy();
  assert.equal(restored.destroyed, 1);
});

test('renderer exceptions cannot seize native movement or prevent cancellation', () => {
  const h = harness();
  let attempts = 0;
  renderer(h, {
    update() { attempts++; throw new Error('simulated native material unavailable'); },
    clear() { throw new Error('simulated scene detached'); },
    destroy() { throw new Error('simulated disposed geometry'); }
  });
  assert.equal(h.api.goto(8, 1, 0), true);
  const job = h.plannedJob();
  h.advance(50);
  for (const point of job.job.result.path.slice(1, 5)) {
    h.moveTo(point); h.advance(50);
    assert.equal(h.api.status, 'moving');
  }
  assert.ok(attempts > 0);
  assert.equal(h.controls.at(-1).forward, 1);
  assert.doesNotThrow(() => h.api.stop());
  assert.equal(h.controls.at(-1).released, true);
  assert.doesNotThrow(() => h.api.destroy());
});

test('a wide unbreakable wall uses safe checkpoints and detours around it instead of retrying forever', () => {
  const h = harness({ corridor: false, minZ: -40, maxZ: 40, maxX: 128 });
  for (let x = 24; x <= 68; x++) for (let z = -24; z <= 24; z++) {
    for (let y = 1; y <= 5; y++) h.set(x, y, z, bedrock);
  }
  assert.equal(h.api.goto(100, 1, 0), true);
  const visited = [];
  for (let tick = 0; tick < 1500 && h.api.status !== 'idle'; tick++) {
    assert.notEqual(h.api.status, 'failed', JSON.stringify(h.api.debug()));
    if (h.api.status === 'moving') {
      const debug = h.api.debug();
      const route = h.jobs.findLast(saved => saved.job.done && saved.goal.x === debug.routeGoal.x &&
        saved.goal.y === debug.routeGoal.y && saved.goal.z === debug.routeGoal.z);
      const node = route?.job.result.path[debug.pathIndex];
      if (node) {
        assert.equal(h.readCell(node.x, node.y, node.z)?.solid, false, 'the simulation may only step into cleared cells');
        visited.push(plain(node)); h.moveTo(node);
      }
    }
    h.advance(50);
  }
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.ok(visited.some(node => Math.abs(node.z) >= 25), 'the actual route goes around the complete wall');
  assert.ok(h.jobs.length > 1, 'an obstructed intermediate target is not mistaken for the global destination');
  assert.equal(h.interactions.length, 0, 'unbreakable bedrock must never be mined');
  assert.deepEqual(plain(h.player.pos), { x: 100.5, y: 1, z: .5 });
  h.api.destroy();
});
