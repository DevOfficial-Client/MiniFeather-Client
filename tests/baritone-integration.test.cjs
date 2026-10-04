const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const core = fs.readFileSync(path.join(__dirname, '..', 'src', 'Movement', 'Baritone.js'), 'utf8');
const plannerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'Movement', 'BaritonePlanner.js'), 'utf8');
const key = (x, y, z) => `${x},${y},${z}`;
const air = { known: true, solid: false, hazard: false, breakable: false, name: 'air', air: true };
const stone = { known: true, solid: true, hazard: false, breakable: true, name: 'stone', height: 1 };

function harness(options = {}) {
  let clock = 0, timerId = 0;
  const timers = new Map(), listeners = new Map(), blocks = new Map(), jobs = [], controls = [], interactions = [];
  const config = { bound: true, aligned: true, interactOk: true, entities: [], ...options };
  const player = { pos: { x: .5, y: 1, z: .5 }, onGround: true, yaw: 0, pitch: 0 };
  const game = { player, world: {}, inGame: () => true };
  const stats = { releases: 0, destroys: 0, observations: 0 };
  const document = {
    hidden: false, querySelector: () => null,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatchEvent(event) { for (const fn of [...(listeners.get(event.type) || [])]) fn(event); return true; }
  };
  const readCell = (x, y, z) => {
    if (config.unknown?.(x, y, z) || x < -12 || x > 12 || z < -12 || z > 12 || y < 0 || y > 8) return null;
    return blocks.get(key(x, y, z)) || (y === 0 ? stone : air);
  };
  const adapter = {
    bind() { return config.bound; }, observe() { stats.observations++; return true; }, readCell,
    setControls(value) { controls.push({ ...value, time: clock }); return config.controlsAvailable !== false; },
    release() { stats.releases++; controls.push({ forward: 0, strafe: 0, jump: false, time: clock, released: true }); },
    releaseInteraction() {}, eye: () => ({ x: player.pos.x, y: player.pos.y + 1.62, z: player.pos.z }),
    aimAt: () => ({ aligned: config.aligned, yaw: player.yaw, pitch: player.pitch }),
    interact(type, target) { interactions.push({ type, target, time: clock }); return { ok: config.interactOk, reason: config.interactOk ? '' : 'wait-ray' }; },
    selectSlot: () => true, entities: () => config.entities,
    diagnostics: () => ({ error: config.bound ? '' : 'native-input-unavailable' }),
    destroy() { stats.destroys++; }
  };
  const context = vm.createContext({
    document, game, performance: { now: () => clock }, Date: class extends Date { static now() { return 1_700_000_000_000 + clock; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    __MF_BARITONE_ADAPTER__: { create: () => adapter }
  });
  vm.runInContext(plannerSource, context);
  const createPlanner = context.__MF_BARITONE_PLANNER__.create;
  context.__MF_BARITONE_PLANNER__ = { ...context.__MF_BARITONE_PLANNER__, create(...args) {
    const planner = createPlanner(...args), search = planner.search;
    return { ...planner, search(...searchArgs) { const job = search(...searchArgs); jobs.push(job); return job; } };
  } };
  function reload() { vm.runInContext(core, context); return context.Baritone; }
  function advance(ms) {
    const until = clock + ms;
    let iterations = 0;
    while (++iterations < 5000) {
      let nextId, next;
      for (const [id, value] of timers) if (value.at <= until && (!next || value.at < next.at)) { nextId = id; next = value; }
      if (!next) break;
      clock = next.at; timers.delete(nextId); next.fn();
    }
    assert.ok(iterations < 5000, 'timer loop must remain bounded');
    clock = until;
  }
  const api = reload();
  const set = (x, y, z, value) => blocks.set(key(x, y, z), value);
  const moveTo = point => { player.pos = { x: point.x + .5, y: point.y, z: point.z + .5 }; player.onGround = true; };
  return { api, context, adapter, player, game, document, config, stats, timers, listeners, jobs, controls, interactions, set, advance, reload, moveTo };
}

test('goto plans incrementally with zero movement while planning', () => {
  const h = harness();
  assert.equal(h.api.goto(5, 1, 0), true);
  assert.equal(h.api.status, 'pathfinding');
  assert.equal(h.jobs[0].done, false);
  assert.equal(h.controls.some(input => input.forward || input.strafe || input.jump), false);
  h.advance(250);
  assert.equal(h.jobs[0].done, true);
  assert.equal(h.api.status, 'moving');
  assert.equal(h.controls.some(input => input.forward || input.strafe || input.jump), false);
  h.advance(50);
  assert.equal(h.controls.at(-1).forward, 1);
});

test('public commands catch missing input hooks and release instead of throwing', () => {
  const h = harness({ controlsAvailable: false });
  assert.equal(h.api.goto(5, 1, 0), false);
  assert.equal(h.api.status, 'failed');
  assert.equal(h.jobs.length, 0);
  assert.ok(h.stats.releases >= 1);
});

test('a new command during FreeCam cancels the previous task and releases input', () => {
  const h = harness();
  h.api.goto(5, 1, 0); h.advance(300);
  assert.equal(h.controls.at(-1).forward, 1);
  h.context.__MINIFEATHER_FREECAM_ACTIVE__ = true;
  assert.equal(h.api.goto(6, 1, 0), false);
  assert.equal(h.api.status, 'failed');
  assert.equal(h.controls.at(-1).forward, 0);
  assert.equal(h.api.pathLength, 0);
});

test('stop and disable cancel planning and release controls', () => {
  const h = harness();
  h.api.goto(5, 1, 0); const job = h.jobs.at(-1);
  h.api.stop();
  assert.equal(job.done, true);
  assert.equal(job.result.reason, 'cancelled');
  assert.equal(h.api.status, 'idle');
  assert.equal(h.api.pathLength, 0);
  h.api.goto(4, 1, 0); h.advance(300);
  assert.equal(h.controls.at(-1).forward, 1);
  assert.equal(h.api.disable(), false);
  h.advance(500);
  assert.equal(h.api.debug().enabled, false);
  assert.equal(h.controls.at(-1).forward, 0);
});

test('hot reload destroys the previous runtime, timer and event listeners', () => {
  const h = harness();
  h.api.goto(5, 1, 0); const old = h.api, oldJob = h.jobs[0];
  const replacement = h.reload();
  assert.notEqual(replacement, old);
  assert.equal(oldJob.result.reason, 'cancelled');
  assert.equal(h.stats.destroys, 1);
  assert.equal(h.timers.size, 1);
  assert.equal(h.listeners.get('minifeather:baritone-command').size, 1);
  assert.equal(h.listeners.get('minifeather:baritone-config').size, 1);
  replacement.destroy();
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.get('minifeather:baritone-command').size, 0);
  assert.equal(h.context.Baritone, undefined);
});

test('the start cell is a real first waypoint, including its center', () => {
  const h = harness();
  h.player.pos.x = .1;
  h.api.goto(3, 1, 0); h.advance(250);
  assert.equal(h.jobs.at(-1).result.path[0].x, 0);
  h.advance(50);
  assert.equal(h.api.debug().pathIndex, 0);
  h.moveTo({ x: 0, y: 1, z: 0 }); h.advance(50);
  assert.equal(h.api.debug().pathIndex, 1);
});

test('an unloaded frontier produces a partial route, never destination reached', () => {
  const h = harness({ unknown: x => x >= 3 });
  h.api.goto(7, 1, 0); h.advance(250);
  for (let i = 0; !h.jobs.at(-1).done && i < 30; i++) h.advance(50);
  const result = h.jobs.at(-1).result;
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'unloaded_frontier');
  for (const waypoint of result.path) { h.moveTo(waypoint); h.advance(50); }
  assert.equal(h.api.status, 'waiting');
  assert.equal(h.api.debug().search.complete, false);
  assert.equal(/Destination reached/.test(h.api.debug().reason), false);
  assert.equal(h.controls.at(-1).forward, 0);
});

test('safe progress across many loaded frontiers is not mistaken for repeated failure', () => {
  let frontier = 2;
  const h = harness({ unknown: x => x >= frontier });
  h.api.goto(11, 1, 0);
  for (; frontier <= 12; frontier++) {
    h.advance(frontier === 2 ? 250 : 1000);
    for (let i = 0; !h.jobs.at(-1).done && i < 30; i++) h.advance(50);
    const result = h.jobs.at(-1).result;
    for (const waypoint of result.path) { h.moveTo(waypoint); h.advance(50); }
    assert.notEqual(h.api.status, 'failed', 'a new frontier after actual forward progress is not a stalled retry');
    if (result.complete) break;
  }
  assert.equal(h.api.status, 'idle');
  assert.equal(h.api.debug().reason, 'Destination reached');
});

test('a removed landing floor is rejected before taking the next step', () => {
  const h = harness();
  h.api.goto(3, 1, 0); h.advance(250);
  h.set(1, 0, 0, air); h.advance(50);
  assert.equal(h.api.status, 'pathfinding');
  assert.equal(h.controls.at(-1).forward, 0);
});

test('a new hazard in a planned gap invalidates the transition, not just landing', () => {
  const h = harness();
  h.set(1, 0, 0, air);
  h.api.goto(2, 1, 0); h.advance(250);
  assert.equal(h.jobs[0].result.path.some(node => node.action === 'gap'), true);
  h.set(1, 1, 0, { ...air, hazard: true, name: 'lava' }); h.advance(50);
  assert.equal(h.api.status, 'pathfinding');
  assert.equal(h.controls.at(-1).forward, 0);
  assert.equal(h.controls.at(-1).jump, false);
});

test('one-block step triggers a bounded jump and completes only after landing', () => {
  const h = harness();
  h.set(1, 1, 0, stone);
  h.api.goto(1, 2, 0); h.advance(300);
  assert.equal(h.controls.at(-1).jump, true);
  h.player.onGround = false; h.advance(200);
  assert.equal(h.controls.at(-1).jump, false);
  assert.equal(h.api.status, 'moving');
  h.moveTo({ x: 1, y: 2, z: 0 }); h.advance(50);
  assert.equal(h.api.status, 'idle');
  assert.equal(h.api.debug().reason, 'Destination reached');
});

test('manual jump releases itself and all input at the end', () => {
  const h = harness();
  assert.equal(h.api.jump(300), true);
  h.advance(250);
  assert.equal(h.controls.at(-1).jump, true);
  h.advance(100);
  assert.equal(h.api.status, 'idle');
  assert.equal(h.controls.at(-1).jump, false);
});

test('the default jump pulse runs before the idle timer could expire it', () => {
  const h = harness();
  assert.equal(h.api.jump(), true);
  h.advance(100);
  assert.equal(h.controls.at(-1).jump, true);
  h.advance(150);
  assert.equal(h.api.status, 'idle');
  assert.equal(h.controls.at(-1).jump, false);
});

test('follow never falls back to direct chasing through unsafe terrain', () => {
  const entity = { profile: { username: 'Target' }, pos: { x: 8.5, y: 1, z: .5 } };
  const h = harness({ entities: [entity] });
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) if (x !== 0 || z !== 0) h.set(x, 0, z, air);
  assert.equal(h.api.follow('Target'), true);
  h.advance(2000);
  assert.equal(h.controls.some(input => input.forward || input.strafe), false);
  assert.notEqual(h.api.status, 'idle');
});

test('mining waits for actual world change, not an interaction return value', () => {
  const h = harness(); h.set(1, 1, 0, stone);
  assert.equal(h.api.mine(1, 1, 0), true);
  h.advance(500);
  assert.ok(h.interactions.some(event => event.type === 'mine'));
  assert.equal(h.api.status, 'mining');
  h.set(1, 1, 0, air); h.advance(50);
  assert.equal(h.api.status, 'idle');
  assert.match(h.api.debug().reason, /world confirmed/);
});

test('planned mining clears a tall wall from the head down to avoid occluded feet', () => {
  const h = harness();
  for (let z = -12; z <= 12; z++) {
    h.set(1, 1, z, stone); h.set(1, 2, z, stone);
  }
  h.api.goto(3, 1, 0); h.advance(250);
  for (let i = 0; !h.jobs.at(-1).done && i < 30; i++) h.advance(50);
  h.advance(50);
  assert.equal(h.api.status, 'mining');
  assert.equal(h.interactions[0].type, 'mine');
  assert.equal(h.interactions[0].target.y, 2);
  h.set(h.interactions[0].target.x, 2, h.interactions[0].target.z, air);
  h.advance(50);
  assert.equal(h.interactions.at(-1).target.y, 1);
});

test('mining without world confirmation has a finite timeout', () => {
  const h = harness(); h.set(1, 1, 0, stone);
  h.api.mine(1, 1, 0); h.advance(46000);
  assert.equal(h.api.status, 'failed');
  assert.match(h.api.debug().reason, /timed out/);
  assert.equal(h.controls.at(-1).forward, 0);
});

test('placement uses the requested hotbar slot and waits for world confirmation', () => {
  const h = harness();
  const selected = [];
  h.adapter.selectSlot = slot => { selected.push(slot); return true; };
  assert.equal(h.api.place(1, 1, 0, 2), true);
  assert.deepEqual(selected, [2]);
  h.advance(250);
  assert.ok(h.interactions.some(event => event.type === 'place'));
  assert.equal(h.api.status, 'placing');
  h.set(1, 1, 0, stone); h.advance(50);
  assert.equal(h.api.status, 'idle');
  assert.match(h.api.debug().reason, /world confirmed/);
});

test('placement without world confirmation times out and invalid slots fail closed', () => {
  const h = harness();
  assert.equal(h.api.place(1, 1, 0, 10), false);
  assert.equal(h.api.status, 'failed');
  assert.match(h.api.debug().reason, /slot/);
  assert.equal(h.api.place(1, 1, 0, 2), true);
  h.advance(46000);
  assert.equal(h.api.status, 'failed');
  assert.match(h.api.debug().reason, /timed out/);
});

test('unknown mining chunks respect the one-second retry cooldown', () => {
  const h = harness(); h.set(1, 1, 0, stone);
  h.api.mine(1, 1, 0);
  h.config.unknown = x => x === 1;
  h.advance(250);
  assert.equal(h.api.status, 'waiting');
  const retries = h.api.debug().retries;
  assert.equal(retries, 1);
  h.advance(500);
  assert.equal(h.api.debug().retries, retries);
  assert.equal(h.api.status, 'waiting');
});

test('missing native movement capabilities fails closed without input', () => {
  const h = harness({ bound: false });
  assert.equal(h.api.goto(5, 1, 0), false);
  assert.equal(h.api.status, 'failed');
  assert.equal(h.controls.some(input => input.forward || input.strafe || input.jump), false);
  assert.match(h.api.debug().reason, /native-input-unavailable/);
});

test('player/world changes and backgrounding release the active task', () => {
  const h = harness(); h.api.goto(4, 1, 0); h.advance(300);
  h.game.world = {}; h.advance(50);
  assert.equal(h.api.status, 'failed');
  assert.match(h.api.debug().reason, /changed/);
  assert.equal(h.controls.at(-1).forward, 0);
  h.api.goto(4, 1, 0); h.document.hidden = true; h.advance(300);
  assert.equal(h.api.status, 'idle');
  assert.match(h.api.debug().reason, /background tab/);
  assert.equal(h.controls.at(-1).forward, 0);
});

test('players observation does not seize controls or begin a task', () => {
  const entity = { profile: { username: 'Target' }, pos: { x: 3, y: 1, z: 0 } };
  const h = harness({ entities: [entity] });
  assert.equal(h.api.players()[0].username, 'Target');
  assert.equal(h.stats.observations, 1);
  assert.equal(h.api.status, 'idle');
  assert.equal(h.controls.length, 0);
});
