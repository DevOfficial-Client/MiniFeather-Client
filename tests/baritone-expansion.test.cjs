const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const movementDirectory = path.join(__dirname, '..', 'src', 'Movement');
const cellKey = (x, y, z) => `${x},${y},${z}`;
const air = { known: true, solid: false, hazard: false, breakable: false, name: 'air', air: true, replaceable: true };
const stone = { known: true, solid: true, hazard: false, breakable: true, name: 'stone', height: 1 };
const water = { ...air, air: false, name: 'water', liquid: true, water: true, fluid: 'water' };

// These simulations exercise the actual planner and runtime together. Native
// movement, inventory and server acknowledgements are independently controlled.
function harness(options = {}) {
  let clock = 0, timerId = 0;
  const timers = new Map(), listeners = new Map(), blocks = new Map();
  const jobs = [], controls = [], interactions = [], selectedSlots = [];
  const config = {
    minX: -5, maxX: 2048, minZ: -5, maxZ: 5, corridor: true,
    aligned: true, interactOk: true, selectedSlot: 4, buildingBlocks: 0, oxygen: 300,
    ...options
  };
  const player = { pos: { x: .5, y: 1, z: .5 }, onGround: true, yaw: 0, pitch: 0 };
  const game = { player, world: {}, inGame: () => true };
  const readCell = (x, y, z) => {
    if (config.unknown?.(x, y, z) || x < config.minX || x > config.maxX ||
        z < config.minZ || z > config.maxZ || y < -8 || y > 12) return null;
    return blocks.get(cellKey(x, y, z)) ||
      (y === 0 && (!config.corridor || z === 0) ? stone : air);
  };
  const inWater = () => readCell(Math.floor(player.pos.x), Math.floor(player.pos.y), Math.floor(player.pos.z))?.water === true;
  const eye = () => ({ x: player.pos.x, y: player.pos.y + 1.62, z: player.pos.z });
  const document = {
    hidden: false, querySelector: () => null,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatchEvent(event) { for (const fn of [...(listeners.get(event.type) || [])]) fn(event); return true; }
  };
  const adapter = {
    bind: () => true, observe: () => true, readCell, eye,
    setControls(value) { controls.push({ ...value, time: clock }); return true; },
    release() { controls.push({ forward: 0, strafe: 0, jump: false, sneak: false, time: clock, released: true }); },
    releaseInteraction() { config.miningHeld = false; },
    aimAt: () => ({ aligned: config.aligned, yaw: player.yaw, pitch: player.pitch }),
    interact(type, target) {
      interactions.push({ type, target: { ...target }, time: clock });
      if (type === 'mine' && config.interactOk) config.miningHeld = true;
      return { ok: config.interactOk, reason: config.interactOk ? '' : 'wait-ray' };
    },
    selectSlot(slot) { selectedSlots.push(slot); config.selectedSlot = slot; return true; },
    getSelectedSlot: () => config.selectedSlot,
    blockInventory: () => config.buildingBlocks > 0 ? [{ slot: 2, count: config.buildingBlocks, name: 'stone', fullBlock: true, safe: true }] : [],
    blockBudget: () => config.buildingBlocks,
    selectBuildingBlock() {
      if (config.buildingBlocks <= 0) return null;
      adapter.selectSlot(2);
      return { slot: 2, count: config.buildingBlocks, name: 'stone', fullBlock: true, safe: true };
    },
    placementAim(target) {
      const results = [];
      for (const [dx, dy, dz] of [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]]) {
        const anchor = { x: target.x + dx, y: target.y + dy, z: target.z + dz };
        if (!readCell(anchor.x, anchor.y, anchor.z)?.solid) continue;
        const point = { x: anchor.x + .5 - dx * .499, y: anchor.y + .5 - dy * .499, z: anchor.z + .5 - dz * .499 };
        const origin = eye();
        results.push({ ...point, anchor, face: { x: -dx, y: -dy, z: -dz }, distance: Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z) });
      }
      return results.sort((a, b) => a.distance - b.distance);
    },
    swimmingState: () => ({ inWater: inWater(), inLava: false, onGround: player.onGround, oxygen: config.oxygen, air: config.oxygen, known: true }),
    entities: () => [], diagnostics: () => ({ error: '' }), destroy() {}
  };
  const context = vm.createContext({
    document, game, performance: { now: () => clock },
    Date: class extends Date { static now() { return 1_700_000_000_000 + clock; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    __MF_BARITONE_ADAPTER__: { create: () => adapter }
  });
  vm.runInContext(fs.readFileSync(path.join(movementDirectory, 'BaritonePlanner.js'), 'utf8'), context);
  const createPlanner = context.__MF_BARITONE_PLANNER__.create;
  context.__MF_BARITONE_PLANNER__ = { ...context.__MF_BARITONE_PLANNER__, create(...args) {
    const planner = createPlanner(...args), search = planner.search;
    return { ...planner, search(...searchArgs) {
      const job = search(...searchArgs);
      jobs.push({ job, start: { ...searchArgs[0] }, goal: { ...searchArgs[1] }, options: { ...searchArgs[2] } });
      return job;
    } };
  } };
  vm.runInContext(fs.readFileSync(path.join(movementDirectory, 'Baritone.js'), 'utf8'), context);
  function advance(ms) {
    const until = clock + ms;
    let iterations = 0;
    while (++iterations < 5000) {
      let nextId, next;
      for (const [id, timer] of timers) if (timer.at <= until && (!next || timer.at < next.at)) { nextId = id; next = timer; }
      if (!next) break;
      clock = next.at; timers.delete(nextId); next.fn();
    }
    assert.ok(iterations < 5000, 'runtime timer work is bounded');
    clock = until;
  }
  const set = (x, y, z, value) => blocks.set(cellKey(x, y, z), value);
  const moveTo = (point, onGround = true) => {
    player.pos = { x: point.x + .5, y: point.y, z: point.z + .5 };
    player.onGround = onGround;
  };
  function plannedJob() {
    for (let i = 0; i < 100 && !jobs.at(-1)?.job.done; i++) advance(50);
    assert.equal(jobs.at(-1)?.job.done, true, JSON.stringify(context.Baritone.debug()));
    return jobs.at(-1);
  }
  return { api: context.Baritone, context, config, player, game, adapter, jobs, controls, interactions, selectedSlots, set, readCell, advance, moveTo, plannedJob, time: () => clock };
}

test('far routes keep the global destination while continuing many loaded segments', () => {
  let frontier = 8;
  const h = harness({ unknown: x => x > frontier });
  assert.equal(h.api.goto(320, 1, 0), true);
  const processed = new Set();
  for (let segment = 0; segment < 60 && h.api.status !== 'idle'; segment++) {
    h.advance(300);
    const saved = h.plannedJob();
    if (processed.has(saved)) { h.advance(1000); continue; }
    processed.add(saved);
    assert.ok(Math.abs(saved.goal.x - saved.start.x) <= 48, 'a far command plans bounded local sections');
    assert.equal(h.api.goal.x, 320, 'the route endpoint must not replace the original command destination');
    frontier = Math.min(320, frontier + 8);
    for (const node of saved.job.result.path) { h.moveTo(node); h.advance(50); }
    assert.notEqual(h.api.status, 'failed', JSON.stringify(h.api.debug()));
    if (!saved.job.result.complete) assert.notEqual(h.api.status, 'waiting', 'real frontier progress with newly loaded terrain resumes without a retry cooldown');
    if (h.api.status === 'idle') assert.ok(Math.abs(h.player.pos.x - 320.5) < .31, 'a completed local section is not a completed global goal');
  }
  assert.ok(processed.size > 6, 'exercise more than the historical retry limit');
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.ok(Math.abs(h.player.pos.x - 320.5) < .31);
  h.api.destroy();
});

test('rolling checkpoints cannot turn an out-of-bounds global command into a valid local route', () => {
  const h = harness();
  assert.equal(h.api.goto(30000001, 1, 0), false);
  assert.equal(h.api.mine(0, 1, -30000001), false);
  assert.equal(h.jobs.length, 0);
  assert.equal(h.interactions.length, 0);
  h.api.destroy();
});

test('water waypoints are consumed without requiring the player to touch the bottom', () => {
  const h = harness({ maxX: 6 });
  for (let x = 0; x <= 3; x++) for (let y = 1; y <= 5; y++) h.set(x, y, 0, water);
  h.player.onGround = false;
  assert.equal(h.api.goto(3, 2, 0), true);
  h.advance(250);
  const saved = h.plannedJob();
  assert.ok(saved.job.result.path.some(node => node.action === 'swim'), 'the route must explicitly model swimming');
  for (const node of saved.job.result.path) { h.moveTo(node, false); h.advance(50); }
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.controls.some(input => input.jump), 'the upward swimming section uses the native swim/jump input');
  h.api.destroy();
});

test('a narrow tunnel clears head then feet with an independent budget for each block', () => {
  const h = harness({ maxX: 8 });
  for (let x = 0; x <= 8; x++) h.set(x, 3, 0, { ...stone, name: 'bedrock', breakable: false });
  h.set(1, 1, 0, stone); h.set(1, 2, 0, stone);
  assert.equal(h.api.goto(3, 1, 0), true);
  h.advance(250); h.plannedJob(); h.advance(50);
  assert.equal(h.interactions.at(-1)?.target.y, 2);
  h.advance(14000);
  assert.equal(h.api.status, 'mining');
  h.set(1, 2, 0, air); h.advance(50);
  assert.equal(h.interactions.at(-1)?.target.y, 1);
  h.advance(10000);
  assert.equal(h.api.status, 'mining', 'time spent clearing the head must not exhaust the feet block budget');
  h.set(1, 1, 0, air); h.advance(50);
  const path = h.jobs.at(-1).job.result.path;
  for (const node of path.slice(1)) { h.moveTo(node); h.advance(50); }
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.ok(Math.abs(h.player.pos.x - 3.5) < .31);
  h.api.destroy();
});

test('a mineable destination is reached exactly rather than replaced by the start of a tunnel', () => {
  const h = harness({ maxX: 6 });
  for (let x = 1; x <= 3; x++) { h.set(x, 1, 0, stone); h.set(x, 2, 0, stone); }
  assert.equal(h.api.goto(3, 1, 0), true);
  h.advance(250);
  const saved = h.plannedJob();
  assert.equal(saved.job.result.complete, true);
  assert.equal(saved.job.result.goal.x, 3);
  assert.equal(saved.job.result.adjustedGoal, false);
  for (const node of saved.job.result.path) {
    if (node.breakBlocks?.length) {
      h.advance(50);
      assert.equal(h.api.status, 'mining');
      const ordered = [...node.breakBlocks].sort((a, b) => b.y - a.y);
      for (const block of ordered) { h.set(block.x, block.y, block.z, air); h.advance(50); }
    }
    h.moveTo(node); h.advance(50);
  }
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.ok(Math.abs(h.player.pos.x - 3.5) < .31);
  h.api.destroy();
});

test('bridge movement waits for real support and restores the previous hotbar slot', () => {
  const h = harness({ maxX: 8, buildingBlocks: 12 });
  for (let x = 1; x <= 4; x++) h.set(x, 0, 0, air);
  assert.equal(h.api.goto(5, 1, 0), true);
  h.advance(250);
  const saved = h.plannedJob();
  assert.ok(saved.job.result.path.some(node => node.action === 'bridge'));
  h.advance(100);
  const placement = h.interactions.find(event => event.type === 'place');
  assert.ok(placement, JSON.stringify(h.api.debug()));
  assert.equal(h.controls.at(-1).forward, 0, 'do not walk into a gap because a native click returned success');
  assert.equal(h.readCell(placement.target.x, placement.target.y, placement.target.z).solid, false);
  h.advance(500);
  assert.equal(h.controls.at(-1).forward, 0);
  h.set(placement.target.x, placement.target.y, placement.target.z, stone);
  h.config.buildingBlocks--;
  h.advance(50);
  assert.equal(h.config.selectedSlot, 4, 'temporary terrain placement restores the selected item');
  assert.ok(h.controls.at(-1).forward > 0, JSON.stringify(h.api.debug()));
  h.api.destroy();
});

test('an empty building inventory does not turn a long gap into an assumed bridge', () => {
  const h = harness({ maxX: 8, buildingBlocks: 0 });
  for (let x = 1; x <= 4; x++) h.set(x, 0, 0, air);
  assert.equal(h.api.goto(5, 1, 0), true);
  h.advance(250); h.plannedJob(); h.advance(1500);
  assert.equal(h.interactions.some(event => event.type === 'place'), false);
  assert.equal(h.controls.some(input => input.forward > 0), false);
  assert.notEqual(h.api.status, 'idle', 'the unreachable far side must not be reported as reached');
  h.api.destroy();
});

test('long action approaches have a navigation budget distinct from the actual mining budget', () => {
  const h = harness({ maxX: 100 });
  h.set(80, 1, 0, stone);
  assert.equal(h.api.mine(80, 1, 0), true);
  const processed = new Set();
  for (let segment = 0; segment < 10 && !h.interactions.some(event => event.type === 'mine'); segment++) {
    h.advance(250);
    const saved = h.plannedJob();
    if (processed.has(saved)) { h.advance(1000); continue; }
    processed.add(saved);
    for (const node of saved.job.result.path.slice(1)) {
      h.advance(700); h.moveTo(node); h.advance(50);
      assert.notEqual(h.api.status, 'failed', JSON.stringify(h.api.debug()));
    }
    h.advance(100);
  }
  assert.ok(h.time() > 45000, 'exercise approach time beyond the previous whole-command timeout');
  assert.ok(h.interactions.some(event => event.type === 'mine'), JSON.stringify(h.api.debug()));
  h.set(80, 1, 0, air); h.advance(50);
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  h.api.destroy();
});

test('a long approach does not exhaust the final native ray alignment grace period', () => {
  const h = harness({ maxX: 60, interactOk: false });
  h.set(40, 1, 0, stone);
  assert.equal(h.api.mine(40, 1, 0), true);
  for (let segment = 0; segment < 10 && h.api.debug().actionPhase === 'approaching'; segment++) {
    h.advance(250);
    const saved = h.plannedJob();
    for (const node of saved.job.result.path.slice(1)) { h.advance(600); h.moveTo(node); h.advance(50); }
  }
  assert.ok(h.time() > 2500);
  assert.equal(h.api.debug().actionPhase, 'aiming');
  const jobs = h.jobs.length;
  h.advance(500);
  assert.equal(h.api.status, 'mining');
  assert.equal(h.jobs.length, jobs, 'camera/ray alignment gets a fresh grace period after travel');
  h.api.destroy();
});

test('a remote mining target can be approached before its chunk becomes observable', () => {
  let frontier = 8;
  const h = harness({ maxX: 100, unknown: x => x > frontier });
  h.set(80, 1, 0, stone);
  assert.equal(h.readCell(80, 1, 0), null);
  assert.equal(h.api.mine(80, 1, 0), true, 'an unknown distant target should start safe travel, not be classified as air or unbreakable');
  const processed = new Set();
  for (let segment = 0; segment < 30 && !h.interactions.some(event => event.type === 'mine' && event.target.x === 80); segment++) {
    h.advance(250);
    const saved = h.plannedJob();
    if (processed.has(saved)) { h.advance(1000); continue; }
    processed.add(saved);
    frontier = Math.min(100, frontier + 8);
    for (const node of saved.job.result.path) { h.moveTo(node); h.advance(50); }
    assert.notEqual(h.api.status, 'failed', JSON.stringify(h.api.debug()));
  }
  assert.ok(processed.size > 1);
  assert.ok(h.interactions.some(event => event.type === 'mine' && event.target.x === 80), JSON.stringify(h.api.debug()));
  assert.equal(h.api.status, 'mining');
  h.set(80, 1, 0, air); h.advance(50);
  assert.equal(h.api.status, 'idle');
  assert.equal(h.config.miningHeld, false);
  h.api.destroy();
});

test('an explicit mine command excavates an approach when there is no route on either side', () => {
  const h = harness({ maxX: 36 });
  for (let x = 0; x <= 36; x++) h.set(x, 3, 0, { ...stone, name: 'bedrock', breakable: false });
  for (let x = 1; x <= 30; x++) { h.set(x, 1, 0, stone); h.set(x, 2, 0, stone); }
  assert.equal(h.api.mine(30, 1, 0), true, 'excavatable approach cells must not be rejected because they are still solid');
  h.advance(250);
  const saved = h.plannedJob();
  assert.ok(saved.job.result.path.some(node => node.breakBlocks?.length === 2));
  for (const node of saved.job.result.path) {
    if (node.breakBlocks?.length) {
      h.advance(50);
      for (const block of [...node.breakBlocks].sort((a, b) => b.y - a.y)) {
        assert.ok(h.interactions.some(event => event.type === 'mine' && event.target.x === block.x && event.target.y === block.y), `approach obstacle ${cellKey(block.x, block.y, block.z)} must use native mining`);
        h.set(block.x, block.y, block.z, air); h.advance(50);
      }
    }
    h.moveTo(node); h.advance(50);
    assert.notEqual(h.api.status, 'failed', JSON.stringify(h.api.debug()));
  }
  h.advance(100);
  assert.ok(h.interactions.some(event => event.type === 'mine' && event.target.x === 30 && event.target.y === 1));
  assert.equal(h.api.status, 'mining', 'approach completion does not count as the requested block being mined');
  h.set(30, 1, 0, air); h.advance(50);
  assert.equal(h.api.status, 'idle');
  assert.equal(h.config.miningHeld, false);
  h.api.destroy();
});

test('disabling automatic placement prevents bridge planning despite available blocks', () => {
  const h = harness({ maxX: 8, buildingBlocks: 12 });
  for (let x = 1; x <= 4; x++) h.set(x, 0, 0, air);
  assert.equal(h.api.setAutoPlace(false), false);
  assert.equal(h.api.goto(5, 1, 0), true);
  h.advance(250); h.plannedJob(); h.advance(1500);
  assert.equal(h.interactions.some(event => event.type === 'place'), false);
  assert.equal(h.selectedSlots.length, 0);
  assert.equal(h.controls.some(input => input.forward > 0), false);
  assert.equal(h.api.debug().autoPlace, false);
  h.api.destroy();
});

test('stopping pending bridge placement restores the selected item and stops all controls', () => {
  const h = harness({ maxX: 8, buildingBlocks: 12 });
  for (let x = 1; x <= 4; x++) h.set(x, 0, 0, air);
  h.api.goto(5, 1, 0); h.advance(250); h.plannedJob(); h.advance(100);
  assert.equal(h.config.selectedSlot, 2);
  assert.equal(h.api.status, 'placing');
  const interactionCount = h.interactions.length;
  h.api.stop(); h.advance(1000);
  assert.equal(h.config.selectedSlot, 4);
  assert.equal(h.api.status, 'idle');
  assert.equal(h.controls.at(-1).forward, 0);
  assert.equal(h.controls.at(-1).jump, false);
  assert.equal(h.controls.at(-1).sneak, false);
  assert.equal(h.interactions.length, interactionCount);
  assert.equal(h.api.debug().terrain, null);
  h.api.destroy();
});

test('stopping tunnel excavation releases the held native mining action', () => {
  const h = harness({ maxX: 8 });
  h.set(1, 1, 0, stone); h.set(1, 2, 0, stone);
  h.api.goto(3, 1, 0); h.advance(250); h.plannedJob(); h.advance(50);
  assert.equal(h.api.status, 'mining');
  assert.equal(h.config.miningHeld, true);
  const interactionCount = h.interactions.length;
  h.api.stop(); h.advance(1000);
  assert.equal(h.config.miningHeld, false);
  assert.equal(h.interactions.length, interactionCount);
  assert.equal(h.controls.at(-1).forward, 0);
  assert.equal(h.api.debug().terrain, null);
  h.api.destroy();
});

test('low air temporarily routes to a known surface and then resumes the original destination', () => {
  const h = harness({ maxX: 10, oxygen: 30 });
  for (let x = 0; x <= 6; x++) for (let y = 1; y <= 4; y++) h.set(x, y, 0, water);
  for (let x = -5; x < 0; x++) for (let y = 1; y <= 2; y++) h.set(x, y, 0, { ...stone, breakable: false, name: 'bedrock' });
  h.player.onGround = false;
  assert.equal(h.api.goto(6, 1, 0), true);
  h.advance(250);
  const rescue = h.plannedJob();
  assert.deepEqual(JSON.parse(JSON.stringify(h.api.goal)), { x: 6, y: 1, z: 0 });
  const escape = h.api.debug().breathingGoal;
  assert.ok(escape.y >= 3, 'low air requires ascent to a breathable shore or surface');
  assert.equal(rescue.goal.y, escape.y);
  assert.equal(h.readCell(escape.x, escape.y + 1, escape.z).liquid === true, false);
  for (const node of rescue.job.result.path) { h.moveTo(node, h.readCell(node.x, node.y, node.z)?.water !== true); h.advance(50); }
  assert.equal(h.api.status, 'breathing', JSON.stringify(h.api.debug()));
  assert.equal(h.controls.at(-1).forward, 0);
  assert.equal(h.api.goal.x, 6, 'a recovery checkpoint does not replace the user destination');
  h.config.oxygen = 300; h.advance(50);
  const resumed = h.plannedJob();
  assert.notEqual(resumed, rescue);
  assert.equal(h.api.debug().breathingGoal, null);
  for (const node of resumed.job.result.path) { h.moveTo(node, h.readCell(node.x, node.y, node.z)?.water !== true); h.advance(50); }
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.ok(Math.hypot(h.player.pos.x - 6.5, h.player.pos.y - 1) < .31);
  h.api.destroy();
});

test('low air without a known safe head-air cell stops controls instead of inventing an escape', () => {
  const h = harness({ maxX: 6, oxygen: 30 });
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
    for (let y = 1; y <= 12; y++) h.set(x, y, z, water);
  }
  h.player.onGround = false;
  assert.equal(h.api.goto(2, 1, 0), true);
  h.advance(250);
  assert.equal(h.api.status, 'failed');
  assert.match(h.api.debug().reason, /Low air/);
  assert.equal(h.controls.at(-1).forward, 0);
  assert.equal(h.controls.at(-1).jump, false);
  assert.equal(h.api.debug().breathingGoal, null);
  h.api.destroy();
});
