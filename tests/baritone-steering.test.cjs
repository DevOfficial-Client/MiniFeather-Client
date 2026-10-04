'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function continuousWalking(options = {}) {
  const fixture = fs.readFileSync(path.join(__dirname, 'baritone-adapter.test.cjs'), 'utf8');
  const boundary = fixture.indexOf("\ntest('resolves renamed native methods");
  assert.ok(boundary > 0, 'the native adapter fixture must be present');
  const outer = vm.createContext({ require, __dirname, console });
  const h = vm.runInContext(fixture.slice(0, boundary) + '\nsetup();', outer);
  let clock = 0, nextTimer = 0, collisions = 0, walkChecks = 0;
  const timers = new Map(), log = [], searchJobs = [], aimCalls = [];
  Object.assign(h.context, {
    performance: { now: () => clock }, Date: { now: () => clock + 100000 },
    __MINIBLOX_GAME__: h.game,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  h.context.document.addEventListener = () => {};
  h.context.document.removeEventListener = () => {};
  h.game.inGame = () => true;
  const floorY = options.groundY ?? 0;
  h.player.pos = { x: .5, y: floorY + 1, z: .5, ...options.position };
  h.player.motion = { x: 0, y: 0, z: 0, ...options.motion };
  if (options.landFactor != null) h.player.landMovementFactor = options.landFactor;
  h.player.yaw = h.controls.yaw = options.yaw ?? -Math.PI / 2;
  h.player.pitch = h.controls.pitch = options.pitch ?? 0;
  h.controls.yawObject.rotation.y = h.player.yaw;
  h.controls.pitchObject.rotation.x = h.player.pitch;
  if (options.buildingBlocks) {
    h.player.inventory.currentItem = 3;
    h.player.inventory.main = Array(9).fill(null);
    const block = { name: 'stone', defaultState: { isFullCube: () => true }, material: { isLiquid: () => false } };
    h.player.inventory.main[1] = { stackSize: 16, item: { name: 'stone', block, isItemBlock: () => true } };
  }
  // This is a ground acceleration/drag fixture. Native input packets, planner,
  // movement broker and camera adapter are real; no waypoint teleports occur.
  // Jump/gravity and water dynamics are tested by their dedicated fixtures.
  for (let x = -8; x <= 144; x++) for (let z = -8; z <= 16; z++) for (let y = 0; y <= 6; y++) {
    h.world.cells.set(`${x},${y},${z}`, y === floorY && (!options.narrow || z === (options.corridorZ ?? 0)) ? 'stone' : 'air');
  }
  for (const block of options.blocks || []) h.world.cells.set(`${block.x},${block.y},${block.z}`, block.name);
  const cell = (x, y, z) => h.world.cells.get(`${x},${y},${z}`) || 'stone';
  const solid = (x, y, z) => !['air', 'water', 'lava', 'plant'].includes(cell(x, y, z));
  const bodyClear = pos => {
    for (const dx of [-.29, .29]) for (const dz of [-.29, .29]) {
      for (const dy of [0, 1]) if (solid(Math.floor(pos.x + dx), Math.floor(pos.y + dy + 1e-7), Math.floor(pos.z + dz))) return false;
    }
    return true;
  };
  const supported = pos => [-.29, .29].some(dx => [-.29, .29].some(dz =>
    solid(Math.floor(pos.x + dx), Math.floor(pos.y - .01), Math.floor(pos.z + dz))));
  h.adapter.destroy();
  if (options.sources?.adapter) vm.runInContext(options.sources.adapter, h.context);
  const factory = h.context.__MF_BARITONE_ADAPTER__.create;
  h.context.__MF_BARITONE_ADAPTER__ = { ...h.context.__MF_BARITONE_ADAPTER__, create() {
    const adapter = factory();
    const aimAt = adapter.aimAt;
    adapter.aimAt = (...args) => {
      const result = aimAt(...args);
      aimCalls.push({ time: clock, args, result, yaw: h.player.yaw, pitch: h.player.pitch });
      return result;
    };
    return adapter;
  } };
  const source = name => options.sources?.[name] || fs.readFileSync(path.join(__dirname, `../src/Movement/Baritone${name === 'core' ? '' : 'Planner'}.js`), 'utf8');
  vm.runInContext(source('planner'), h.context);
  const createPlanner = h.context.__MF_BARITONE_PLANNER__.create;
  h.context.__MF_BARITONE_PLANNER__ = { ...h.context.__MF_BARITONE_PLANNER__, create(read, settings) {
    const planner = createPlanner(read, settings);
    const search = planner.search;
    planner.search = (...args) => {
      const job = search(...args); searchJobs.push(job); return job;
    };
    if (planner.canWalkSegment) {
      const canWalkSegment = planner.canWalkSegment;
      planner.canWalkSegment = (...args) => { walkChecks++; return canWalkSegment(...args); };
    }
    return planner;
  } };
  vm.runInContext(source('core'), h.context);
  const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
  const step = () => {
    clock += 50;
    const previous = { ...h.player.pos }, oldYaw = h.player.yaw;
    for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); }
    h.player.viewRenamed(); h.player.collectRenamed();
    const packet = h.player.sent.at(-1), sneak = !!packet.sneak, sprint = !!packet.sprint;
    const forward = -h.player.forward || 0, right = h.player.sideways;
    const scale = .098 * (h.player.landMovementFactor / .1) * (sprint ? 1.3 : 1) / Math.max(1, Math.hypot(forward, right));
    const motion = h.player.motion;
    if (Math.abs(motion.x) < .005) motion.x = 0;
    if (Math.abs(motion.z) < .005) motion.z = 0;
    motion.x += (-Math.sin(h.player.yaw) * forward + Math.cos(h.player.yaw) * right) * scale;
    motion.z += (-Math.cos(h.player.yaw) * forward - Math.sin(h.player.yaw) * right) * scale;
    for (const axis of options.freezeMovement ? [] : ['x', 'z']) {
      const next = { ...h.player.pos, [axis]: h.player.pos[axis] + motion[axis] };
      if (bodyClear(next) && (!sneak || supported(next))) h.player.pos = next;
      else { motion[axis] = 0; collisions++; }
    }
    if (options.freezeMovement) motion.x = motion.z = 0;
    motion.x *= .546; motion.z *= .546;
    h.player.onGround = supported(h.player.pos);
    if (!h.player.onGround) h.player.pos.y -= .08;
    const debug = h.context.Baritone.debug();
    log.push({ time: clock, pos: { ...h.player.pos }, yaw: h.player.yaw, pitch: h.player.pitch,
      yawDelta: wrap(h.player.yaw - oldYaw), distance: Math.hypot(h.player.pos.x - previous.x, h.player.pos.z - previous.z),
      dx: h.player.pos.x - previous.x, forward, strafe: right, sprint, sneak, jump: h.player.jumping,
      onGround: h.player.onGround, status: debug.status, reason: debug.reason,
      recoveringFooting: debug.recoveringFooting, pathIndex: debug.pathIndex, terrain: debug.terrain });
    return log.at(-1);
  };
  const run = (ticks = 2000) => {
    for (let i = 0; i < ticks && !['idle', 'failed'].includes(h.context.Baritone.status); i++) step();
    return h.context.Baritone.status;
  };
  const metrics = () => {
    const active = log.filter(frame => frame.status === 'moving' && frame.time >= 750);
    return { elapsedMs: clock, yawTravel: log.reduce((sum, frame) => sum + Math.abs(frame.yawDelta), 0),
      moveDuty: active.filter(frame => frame.forward > 0).length / Math.max(1, active.length),
      sprintDuty: active.filter(frame => frame.sprint).length / Math.max(1, active.length),
      backwardTicks: log.filter(frame => frame.dx < -.001).length, collisions, worldReads: h.world.reads, walkChecks,
      searches: searchJobs.length };
  };
  return { ...h, api: h.context.Baritone, step, run, log, searchJobs, aimCalls, metrics, cell };
}

test('an off-center safe spawn does not turn back to its starting cell center', () => {
  const h = continuousWalking({ position: { x: .95 } });
  assert.equal(h.api.goto(10, 1, 0), true);
  assert.equal(h.run(), 'idle', JSON.stringify(h.api.debug()));
  const stats = h.metrics();
  assert.equal(stats.backwardTicks, 0, JSON.stringify(stats));
  assert.ok(stats.yawTravel < .1, `a straight corridor needs no camera scan: ${JSON.stringify(stats)}`);
  assert.ok(stats.elapsedMs < 2600, JSON.stringify(stats));
  assert.ok(Math.hypot(h.player.pos.x - 10.5, h.player.pos.z - .5) < .31, 'the final goal remains precise');
  h.api.destroy();
});

test('long straight routes keep walking and sprinting continuously instead of pulsing at every tile', () => {
  const h = continuousWalking();
  assert.equal(h.api.goto(64, 1, 0), true);
  assert.equal(h.run(), 'idle', JSON.stringify(h.api.debug()));
  const stats = h.metrics();
  assert.ok(stats.moveDuty > .95, JSON.stringify(stats));
  assert.ok(stats.sprintDuty > .85, JSON.stringify(stats));
  assert.ok(stats.elapsedMs < 13500, JSON.stringify(stats));
  assert.ok(stats.yawTravel < .1, JSON.stringify(stats));
  assert.ok(Math.hypot(h.player.pos.x - 64.5, h.player.pos.z - .5) < .31);
  assert.ok(h.searchJobs.length >= 2, 'this includes a genuine segmented long-distance continuation');
  h.api.destroy();
});

test('a native camera turn applied this tick does not add an extra stationary input tick', () => {
  const h = continuousWalking({ yaw: -Math.PI / 2 + .10 });
  assert.equal(h.api.goto(8, 1, 0), true);
  for (let i = 0; i < 10 && !h.aimCalls.length; i++) h.step();
  assert.ok(h.aimCalls.length > 0);
  const firstAim = h.aimCalls[0];
  const frame = h.log.find(value => value.time === firstAim.time);
  assert.equal(frame.forward, 1, 'a small corrected navigation heading can move in the very same native packet');
  assert.ok(firstAim.result.aligned);
  assert.equal(h.run(), 'idle', JSON.stringify(h.api.debug()));
  h.api.destroy();
});

test('ordinary walking preserves the existing vertical camera angle', () => {
  const h = continuousWalking({ pitch: -.65 });
  assert.equal(h.api.goto(16, 1, 0), true);
  assert.equal(h.run(), 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.log.every(frame => frame.pitch === -.65), 'navigation must not force the camera back to the horizon');
  assert.ok(h.aimCalls.every(call => call.args[4]?.mode === 'navigation'));
  assert.ok(h.metrics().elapsedMs < 4000);
  h.api.destroy();
});

test('fractional lateral drift and ground inertia do not make the camera hunt passed waypoints', () => {
  const h = continuousWalking({ position: { x: .8, z: .78 }, motion: { x: .2, z: .05 } });
  assert.equal(h.api.goto(24, 1, 0), true);
  assert.equal(h.run(), 'idle', JSON.stringify(h.api.debug()));
  const stats = h.metrics();
  assert.equal(stats.backwardTicks, 0, JSON.stringify(stats));
  assert.ok(stats.yawTravel < 1, JSON.stringify(stats));
  assert.ok(stats.elapsedMs < 5600, JSON.stringify(stats));
  assert.ok(Math.hypot(h.player.pos.x - 24.5, h.player.pos.z - .5) < .31);
  h.api.destroy();
});

test('lookahead follows the safe detour rather than cutting through a solid corner', () => {
  const blocks = [];
  for (let z = -1; z <= 1; z++) for (const y of [1, 2]) blocks.push({ x: 3, y, z, name: 'bedrock' });
  const h = continuousWalking({ blocks });
  h.api.setAutoMine(false);
  assert.equal(h.api.goto(7, 1, 0), true);
  assert.equal(h.run(), 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.log.some(frame => frame.pos.z < -.29 || frame.pos.z > 2.29), 'the obstacle requires going around its outer corner');
  assert.equal(h.metrics().collisions, 0, JSON.stringify(h.metrics()));
  assert.ok(Math.hypot(h.player.pos.x - 7.5, h.player.pos.z - .5) < .46, 'ordinary final arrival uses the safe natural stopping region');
  h.api.destroy();
});

test('walking lookahead never skips a required gap jump', () => {
  const h = continuousWalking({ narrow: true, blocks: [{ x: 2, y: 0, z: 0, name: 'air' }] });
  h.api.setAutoMine(false); h.api.setAutoPlace(false);
  assert.equal(h.api.goto(4, 1, 0), true);
  for (let i = 0; i < 100 && !h.player.jumping && !['idle', 'failed'].includes(h.api.status); i++) h.step();
  assert.ok(h.searchJobs.some(job => job.result?.path?.some(point => point.action === 'gap')),
    'the real planner must identify the unsupported crossing as a gap action');
  assert.ok(h.player.jumping, JSON.stringify(h.api.debug()));
  assert.ok(h.player.pos.x < 2.2, 'the jump is requested before traversing the unsupported block');
  h.api.destroy();
});

test('walking lookahead stops for tunnel mining instead of advancing through breakable obstacles', () => {
  const blocks = [];
  for (let x = -8; x <= 12; x++) {
    blocks.push({ x, y: 3, z: 0, name: 'bedrock' });
    for (const z of [-1, 1]) for (const y of [1, 2]) blocks.push({ x, y, z, name: 'bedrock' });
  }
  for (const y of [1, 2]) blocks.push({ x: 3, y, z: 0, name: 'stone' });
  const h = continuousWalking({ narrow: true, blocks });
  assert.equal(h.api.goto(7, 1, 0), true);
  for (let i = 0; i < 100 && h.api.status !== 'mining' && !['idle', 'failed'].includes(h.api.status); i++) h.step();
  assert.equal(h.api.status, 'mining', JSON.stringify(h.api.debug()));
  const mining = h.api.debug().terrain;
  assert.equal(mining.target.x, 3); assert.equal(mining.target.y, 2, 'the head block is still cleared first');
  assert.ok(h.player.pos.x <= 2.71, 'native movement has not entered the blocked tunnel');
  assert.equal(h.metrics().collisions, 0, JSON.stringify(h.metrics()));
  h.api.destroy();
});

test('walking lookahead does not traverse an unconfirmed bridge support', () => {
  const blocks = Array.from({ length: 4 }, (_, index) => ({ x: index + 2, y: 0, z: 0, name: 'air' }));
  const h = continuousWalking({ narrow: true, blocks, buildingBlocks: true });
  h.api.setAutoMine(false);
  assert.equal(h.api.goto(7, 1, 0), true);
  for (let i = 0; i < 100 && h.api.status !== 'placing' && !['idle', 'failed'].includes(h.api.status); i++) h.step();
  assert.equal(h.api.status, 'placing', JSON.stringify(h.api.debug()));
  for (let i = 0; i < 10; i++) h.step();
  assert.equal(h.cell(2, 0, 0), 'air', 'the native controller never confirmed support');
  assert.ok(h.player.pos.x < 2.2, JSON.stringify(h.api.debug()));
  assert.ok(h.log.every(frame => frame.onGround && frame.pos.y === 1));
  h.api.destroy();
  assert.equal(h.player.inventory.currentItem, 3, 'stop restores the pre-bridge hotbar selection');
});

test('each walking sweep observes a newly appeared wall before issuing movement', () => {
  const h = continuousWalking();
  h.api.setAutoMine(false);
  assert.equal(h.api.goto(20, 1, 0), true);
  while (h.player.pos.x < 2 && h.log.length < 100) h.step();
  const wallX = Math.floor(h.player.pos.x) + 2;
  for (let z = -1; z <= 1; z++) for (const y of [1, 2]) h.world.cells.set(`${wallX},${y},${z}`, 'bedrock');
  assert.equal(h.run(), 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.log.some(frame => frame.pos.x > wallX && (frame.pos.z < -.29 || frame.pos.z > 2.29)),
    'the previously planned corridor must be replaced with a safe live detour');
  assert.equal(h.metrics().collisions, 0, JSON.stringify(h.metrics()));
  h.api.destroy();
});

test('a one-block-wide corridor keeps full route speed without excessive replanning', () => {
  const h = continuousWalking({ narrow: true });
  assert.equal(h.api.goto(64, 1, 0), true);
  assert.equal(h.run(), 'idle', JSON.stringify(h.api.debug()));
  const stats = h.metrics();
  assert.ok(stats.elapsedMs < 13500, JSON.stringify(stats));
  assert.ok(stats.searches <= 3, JSON.stringify(stats));
  assert.ok(h.log.every(frame => frame.onGround && frame.pos.y === 1));
  h.api.destroy();
});

test('a supported partial-footprint start recenters safely instead of replanning forever', () => {
  for (const position of [{ z: .79 }, { z: .95 }, { x: .95, z: .95 }]) {
    const h = continuousWalking({ narrow: true, position });
    assert.equal(h.api.goto(12, 1, 0), true);
    assert.equal(h.run(300), 'idle', JSON.stringify({ position, debug: h.api.debug() }));
    const stats = h.metrics();
    assert.ok(stats.searches <= 4, JSON.stringify(stats));
    assert.ok(stats.elapsedMs < 4500, JSON.stringify(stats));
    assert.ok(h.log.every(frame => frame.onGround && frame.pos.y === 1), 'recovery never walks off the supported source cell');
    assert.ok(Math.hypot(h.player.pos.x - 12.5, h.player.pos.z - .5) < .31);
    h.api.destroy();
  }
});

test('a hard ninety-degree turn on one-block support does not fall or enter a replan storm', () => {
  const blocks = [];
  for (let x = 5; x <= 144; x++) blocks.push({ x, y: 0, z: 0, name: 'air' });
  for (let z = 1; z <= 7; z++) blocks.push({ x: 4, y: 0, z, name: 'stone' });
  const h = continuousWalking({ narrow: true, blocks });
  h.api.setAutoMine(false); h.api.setAutoPlace(false);
  assert.equal(h.api.goto(4, 1, 7), true);
  assert.equal(h.run(400), 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.log.every(frame => frame.onGround && frame.pos.y === 1), 'real ground inertia must remain supported throughout the corner');
  const stats = h.metrics();
  assert.ok(stats.searches <= 4, JSON.stringify(stats));
  assert.ok(stats.elapsedMs < 6000, JSON.stringify(stats));
  assert.ok(Math.hypot(h.player.pos.x - 4.5, h.player.pos.z - 7.5) < .31);
  h.api.destroy();
});

test('edge recentering refuses a hazardous floor and eventually releases all controls', () => {
  const h = continuousWalking({ narrow: true, position: { z: .95 },
    blocks: [{ x: 0, y: 0, z: 1, name: 'lava' }] });
  assert.equal(h.api.goto(12, 1, 0), true);
  assert.equal(h.run(400), 'failed', JSON.stringify(h.api.debug()));
  assert.ok(h.log.every(frame => frame.forward === 0 && !frame.recoveringFooting),
    'unsafe neighboring floor cannot authorize recentering or walking');
  assert.deepEqual(h.player.pos, { x: .5, y: 1, z: .95 });
  assert.equal(h.player.forward, 0); assert.equal(h.player.sneak, false); assert.equal(h.player.sprinting, false);
  assert.ok(h.metrics().searches < 30, JSON.stringify(h.metrics()));
  h.api.destroy();
});

test('edge recentering refuses an unknown neighboring chunk instead of treating it as air', () => {
  const h = continuousWalking({ narrow: true, corridorZ: 15, position: { z: 15.95 } });
  h.world.chunkProvider.isLoaded = (_x, z) => z !== 1;
  assert.equal(h.api.goto(12, 1, 15), true);
  assert.equal(h.run(400), 'failed', JSON.stringify(h.api.debug()));
  assert.ok(h.log.every(frame => frame.forward === 0 && !frame.recoveringFooting));
  assert.deepEqual(h.player.pos, { x: .5, y: 1, z: 15.95 });
  assert.ok(h.metrics().searches < 30, JSON.stringify(h.metrics()));
  h.api.destroy();
});

test('a newly blocked recenter destination cancels inward movement before the next packet', () => {
  const h = continuousWalking({ narrow: true, position: { z: .95 } });
  h.api.setAutoMine(false);
  assert.equal(h.api.goto(12, 1, 0), true);
  for (let i = 0; i < 20 && !h.api.debug().recoveringFooting; i++) h.step();
  assert.ok(h.api.debug().recoveringFooting);
  h.world.cells.set('0,1,0', 'bedrock');
  const next = h.step();
  assert.equal(next.forward, 0, 'the next native packet releases movement after the live body check fails');
  assert.equal(h.run(400), 'failed', JSON.stringify(h.api.debug()));
  assert.equal(h.player.forward, 0); assert.equal(h.player.sneak, false);
  h.api.destroy();
});

test('a trapped native recenter action fails within its per-action timeout and releases sneak', () => {
  const h = continuousWalking({ narrow: true, position: { z: .95 }, freezeMovement: true });
  assert.equal(h.api.goto(12, 1, 0), true);
  assert.equal(h.run(100), 'failed', JSON.stringify(h.api.debug()));
  assert.match(h.api.debug().reason, /Unable to regain safe footing/);
  const firstRecovery = h.log.find(frame => frame.recoveringFooting);
  assert.ok(firstRecovery, 'a real recenter action was attempted, not a planning failure');
  assert.ok(h.metrics().elapsedMs - firstRecovery.time <= 2600, JSON.stringify(h.metrics()));
  assert.equal(h.player.forward, 0); assert.equal(h.player.sneak, false); assert.equal(h.player.jumping, false);
  assert.equal(h.player.sprinting, false); assert.equal(h.log.at(-1).forward, 0);
  h.api.destroy();
});

for (const nativeCollider of [true, false]) test(`tiny grounded Y roundoff preserves walking with ${nativeCollider ? 'exact native collider' : 'raw position friction'}`, () => {
  const h = continuousWalking({ position: { y: .999999999 } });
  // The native collider is in exact floor contact even if the exposed position
  // field carries tiny roundoff; friction must use that real collider minimum.
  if (nativeCollider) h.player.getEntityBoundingBox = () => ({ min: { x: h.player.pos.x, y: 1, z: h.player.pos.z } });
  assert.equal(h.api.goto(24, 1, 0), true);
  assert.equal(h.run(200), 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.log.every(frame => frame.onGround), 'the collision fixture uses an epsilon for exact ground contact');
  assert.ok(h.metrics().searches <= 2, JSON.stringify(h.metrics()));
  assert.ok(h.metrics().elapsedMs < 5200, JSON.stringify(h.metrics()));
  assert.ok(Math.hypot(h.player.pos.x - 24.5, h.player.pos.z - .5) < .31);
  assert.equal(h.player.pos.y, .999999999, 'production never snaps or teleports the native player');
  h.api.destroy();
});

test('a straight route corrects lateral spawn offset with native A/D without aiming at waypoint centers', () => {
  const yaw = -Math.PI / 2;
  const h = continuousWalking({ position: { x: .8, z: .8 }, yaw });
  assert.equal(h.api.goto(24, 1, 0), true);
  assert.equal(h.run(200), 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.log.some(frame => frame.strafe !== 0), 'lateral correction must reach the actual native A/D input');
  assert.ok(h.log.every(frame => Math.abs(Math.atan2(Math.sin(frame.yaw - yaw), Math.cos(frame.yaw - yaw))) < .000001),
    `the camera follows the straight corridor direction, not a floating box: ${JSON.stringify(h.metrics())}`);
  assert.equal(h.metrics().backwardTicks, 0);
  assert.ok(Math.hypot(h.player.pos.x - 24.5, h.player.pos.z - .5) < .31);
  h.api.destroy();
});

test('a lateral impulse during straight walking is corrected without scanning the camera', () => {
  const yaw = -Math.PI / 2;
  const h = continuousWalking({ yaw });
  assert.equal(h.api.goto(24, 1, 0), true);
  while (h.player.pos.x < 3 && h.log.length < 100) h.step();
  // External momentum, not a teleport and not a production velocity mutation.
  h.player.motion.z += .12;
  const impulseAt = h.log.length;
  assert.equal(h.run(200), 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.log.slice(impulseAt).some(frame => frame.strafe < 0), 'native left input counters positive Z drift when facing east');
  assert.ok(h.log.every(frame => Math.abs(Math.atan2(Math.sin(frame.yaw - yaw), Math.cos(frame.yaw - yaw))) < .000001),
    JSON.stringify(h.metrics()));
  assert.ok(h.metrics().elapsedMs < 5300, JSON.stringify(h.metrics()));
  assert.ok(Math.hypot(h.player.pos.x - 24.5, h.player.pos.z - .5) < .31);
  h.api.destroy();
});

test('fixed-heading lateral correction remains safe on a one-block-wide straight corridor', () => {
  const yaw = -Math.PI / 2;
  const h = continuousWalking({ narrow: true, position: { z: .67 }, yaw });
  assert.equal(h.api.goto(24, 1, 0), true);
  assert.equal(h.run(200), 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.log.some(frame => frame.strafe !== 0));
  assert.ok(h.log.every(frame => frame.onGround && frame.pos.y === 1), 'lateral damping must not push the player off narrow support');
  assert.ok(h.log.every(frame => !frame.recoveringFooting), 'ordinary correction does not need a camera recenter recovery');
  assert.ok(h.log.every(frame => Math.abs(Math.atan2(Math.sin(frame.yaw - yaw), Math.cos(frame.yaw - yaw))) < .000001),
    JSON.stringify(h.metrics()));
  assert.ok(Math.hypot(h.player.pos.x - 24.5, h.player.pos.z - .5) < .31);
  h.api.destroy();
});

test('the camera changes heading at a real corridor bend but remains fixed along both legs', () => {
  const blocks = [];
  for (let x = 5; x <= 144; x++) blocks.push({ x, y: 0, z: 0, name: 'air' });
  for (let z = 1; z <= 7; z++) blocks.push({ x: 4, y: 0, z, name: 'stone' });
  const h = continuousWalking({ narrow: true, blocks });
  h.api.setAutoMine(false); h.api.setAutoPlace(false);
  assert.equal(h.api.goto(4, 1, 7), true);
  assert.equal(h.run(400), 'idle', JSON.stringify(h.api.debug()));
  const angleError = (actual, expected) => Math.abs(Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected)));
  const horizontalLeg = h.log.filter(frame => frame.pos.x >= 1 && frame.pos.x <= 3 && frame.pos.z < 1);
  const verticalLeg = h.log.filter(frame => frame.pos.z >= 2 && frame.pos.z <= 6.5);
  assert.ok(horizontalLeg.length > 5 && verticalLeg.length > 5);
  assert.ok(horizontalLeg.every(frame => angleError(frame.yaw, -Math.PI / 2) < .000001), 'the eastbound leg has one route heading');
  assert.ok(verticalLeg.every(frame => angleError(frame.yaw, Math.PI) < .000001), 'the southbound leg has one route heading');
  assert.ok(h.metrics().yawTravel >= Math.PI / 2 - .01, 'the required ninety-degree path bend is not suppressed');
  assert.ok(h.metrics().yawTravel <= Math.PI / 2 + .15, JSON.stringify(h.metrics()));
  assert.ok(h.log.every(frame => frame.onGround));
  assert.ok(Math.hypot(h.player.pos.x - 4.5, h.player.pos.z - 7.5) < .31);
  h.api.destroy();
});

test('a straight long-distance segment handoff does not re-aim the camera at its new starting box', () => {
  const yaw = -Math.PI / 2;
  const h = continuousWalking({ position: { z: .8 }, yaw });
  assert.equal(h.api.goto(64, 1, 0), true);
  while (h.player.pos.x < 31 && h.log.length < 250) h.step();
  h.player.motion.z += .10;
  assert.equal(h.run(350), 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.searchJobs.length >= 2, 'the route actually crosses a precalculated segment boundary');
  assert.ok(h.log.every(frame => Math.abs(Math.atan2(Math.sin(frame.yaw - yaw), Math.cos(frame.yaw - yaw))) < .000001),
    `segment continuation preserves the physical corridor heading: ${JSON.stringify(h.metrics())}`);
  assert.ok(h.metrics().elapsedMs < 14000, JSON.stringify(h.metrics()));
  assert.ok(Math.hypot(h.player.pos.x - 64.5, h.player.pos.z - .5) < .46, 'the final global destination uses natural arrival, not checkpoint centering');
  const arrivalInput = h.player.sent.length;
  for (let i = 0; i < 10; i++) h.step();
  assert.ok(Math.hypot(h.player.pos.x - 64.5, h.player.pos.z - .5) <= .450001, 'neutral native coast remains inside the actual .45 arrival region');
  assert.ok(h.player.sent.slice(arrivalInput).every(packet => !(packet.up || packet.down || packet.left || packet.right || packet.jump || packet.sprint)));
  h.api.destroy();
});

test('the real input gate neutralizes unsafe lateral inertia at a narrow edge and preserves native sneak', () => {
  const yaw = -Math.PI / 2;
  const h = continuousWalking({ narrow: true, position: { z: .68 }, yaw });
  assert.equal(h.api.goto(12, 1, 0), true);
  for (let i = 0; i < 20 && h.api.status === 'pathfinding'; i++) h.step();
  assert.equal(h.api.status, 'moving');
  h.player.motion.z = .12;
  const frame = h.step(), packet = h.player.sent.at(-1);
  assert.equal(packet.sneak, true, 'the actual transmitted native packet enables edge protection');
  assert.equal(packet.up || packet.down || packet.left || packet.right || packet.jump || packet.sprint, false,
    'unsafe next-tick motion is not authorized by the digital control packet');
  assert.equal(frame.forward, 0); assert.equal(frame.strafe, 0);
  assert.equal(h.run(300), 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.log.some(value => value.recoveringFooting), 'existing inertia is recovered safely instead of being overwritten');
  assert.ok(h.log.every(value => value.onGround && value.pos.y === 1));
  assert.ok(h.log.every(value => Math.abs(value.yaw - yaw) < .000001), JSON.stringify(h.metrics()));
  assert.ok(Math.hypot(h.player.pos.x - 12.5, h.player.pos.z - .5) < .31);
  h.api.destroy();
});

test('a high native movement factor fails the bounded sweep closed rather than moving through a narrow wall', () => {
  const h = continuousWalking({ narrow: true, landFactor: .5,
    blocks: [{ x: 2, y: 1, z: 0, name: 'bedrock' }, { x: 2, y: 2, z: 0, name: 'bedrock' }] });
  h.api.setAutoMine(false); h.api.setAutoPlace(false);
  assert.equal(h.api.goto(1, 1, 0), true);
  for (let i = 0; i < 20 && h.api.status === 'pathfinding'; i++) h.step();
  assert.equal(h.api.status, 'moving');
  const guarded = [];
  for (let i = 0; i < 15; i++) { h.step(); guarded.push(h.player.sent.at(-1)); }
  assert.ok(guarded.every(packet => packet.sneak), 'native sneak remains enabled for every rejected unsafe step');
  assert.ok(guarded.every(packet => !(packet.up || packet.down || packet.left || packet.right || packet.jump || packet.sprint)),
    'a >.6-block sweep is rejected before sending movement');
  assert.deepEqual(h.player.pos, { x: .5, y: 1, z: .5 }, 'neither unsafe movement nor a corrective teleport occurs');
  assert.equal(h.metrics().collisions, 0);
  h.api.stop(); h.step();
  assert.equal(h.player.sent.at(-1).sneak, false, 'stop releases temporary edge protection');
  h.api.destroy();
});

test('safe partial-footprint edge recovery uses native A/D without changing the camera heading', () => {
  const yaw = -Math.PI / 2;
  const h = continuousWalking({ narrow: true, position: { z: .95 }, yaw });
  assert.equal(h.api.goto(12, 1, 0), true);
  assert.equal(h.run(300), 'idle', JSON.stringify(h.api.debug()));
  const recovery = h.log.filter(frame => frame.recoveringFooting);
  assert.ok(recovery.length > 0, 'the native supported overhang actually invokes recovery');
  assert.ok(recovery.some(frame => frame.strafe < 0), 'inward recovery reaches native A inputs');
  assert.ok(recovery.every(frame => frame.sneak), 'recovering remains sneaking at the source edge');
  assert.ok(h.log.every(frame => Math.abs(frame.yaw - yaw) < .000001), JSON.stringify(h.metrics()));
  assert.ok(h.log.every(frame => frame.onGround && frame.pos.y === 1));
  assert.ok(Math.hypot(h.player.pos.x - 12.5, h.player.pos.z - .5) < .31);
  h.api.destroy();
});

test('a valid one-cell final goal stops naturally without demanding its exact center', () => {
  const yaw = -Math.PI / 2;
  const h = continuousWalking({ position: { x: .8, z: .8 }, yaw });
  assert.equal(h.api.goto(0, 1, 0), true);
  assert.equal(h.run(100), 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.searchJobs.some(job => job.result?.path?.length === 1), 'this exercises a route without a previous heading anchor');
  assert.ok(h.player.sent.every(packet => !(packet.up || packet.down || packet.left || packet.right || packet.jump)),
    'already being safely inside the final goal region does not require micro-centering inputs');
  assert.ok(h.log.every(frame => Math.abs(frame.yaw - yaw) < .000001), JSON.stringify(h.metrics()));
  assert.ok(Math.hypot(h.player.pos.x - .5, h.player.pos.z - .5) < .46);
  assert.deepEqual(h.player.pos, { x: .8, y: 1, z: .8 }, 'natural arrival never snaps the native player to a marker');
  h.api.destroy();
});

test('terminal arrival with lateral momentum releases inputs once its safe natural coast reaches the goal', () => {
  const yaw = -Math.PI / 2, goal = { x: 8, y: 1, z: 0 };
  const h = continuousWalking({ yaw, position: { x: .65 } });
  assert.equal(h.api.goto(goal.x, goal.y, goal.z), true);
  while (h.player.pos.x < 7.8 && h.log.length < 150) h.step();
  h.player.motion.z += .10;
  const ready = () => {
    const p = h.player.pos, m = h.player.motion;
    const currentRadius = Math.hypot(p.x - 8.5, p.z - .5);
    const vx = Math.abs(m.x) < .005 ? 0 : m.x, vz = Math.abs(m.z) < .005 ? 0 : m.z;
    const coast = { x: p.x + vx / (1 - .546), z: p.z + vz / (1 - .546) };
    return Math.floor(p.x) === goal.x && Math.floor(p.z) === goal.z && currentRadius <= .45 &&
      Math.floor(coast.x) === goal.x && Math.floor(coast.z) === goal.z && Math.hypot(coast.x - 8.5, coast.z - .5) <= .45;
  };
  for (let i = 0; i < 40 && !ready() && h.api.status !== 'idle'; i++) h.step();
  assert.equal(h.api.status, 'moving', 'the assertion observes the arrival decision before its native input tick');
  assert.ok(ready(), JSON.stringify({ pos: h.player.pos, motion: h.player.motion, debug: h.api.debug() }));
  assert.ok(Math.hypot(h.player.pos.x - 8.5, h.player.pos.z - .5) > .30, 'the valid natural region is wider than the old centering radius');
  const releaseIndex = h.player.sent.length;
  h.step();
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  for (let i = 0; i < 20; i++) h.step();
  assert.ok(h.player.sent.slice(releaseIndex).every(packet => !(packet.up || packet.down || packet.left || packet.right || packet.jump || packet.sprint)),
    'no extra S/A micro-corrections are sent after valid arrival');
  assert.ok(h.log.every(frame => Math.abs(frame.yaw - yaw) < .000001));
  assert.ok(Math.hypot(h.player.pos.x - 8.5, h.player.pos.z - .5) < .46, 'ordinary native inertia settles inside the declared arrival region');
  h.api.destroy();
});

test('a valid final goal on elevated full support does not require slow centering or a height snap', () => {
  const yaw = -Math.PI / 2;
  const h = continuousWalking({ groundY: 4, position: { x: .6, z: .9 }, yaw });
  assert.equal(h.api.goto(0, 5, 0), true);
  assert.equal(h.run(100), 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.player.sent.every(packet => !(packet.up || packet.down || packet.left || packet.right || packet.jump)));
  assert.deepEqual(h.player.pos, { x: .6, y: 5, z: .9 }, 'the native supported height and fractional position are preserved');
  assert.ok(h.log.every(frame => frame.onGround && frame.pos.y === 5 && Math.abs(frame.yaw - yaw) < .000001));
  assert.ok(Math.hypot(h.player.pos.x - .5, h.player.pos.z - .5) < .46);
  h.api.destroy();
});

test('natural terminal arrival still rejects unsafe coast outside the goal and hazardous footprint support', () => {
  const coasting = continuousWalking({ position: { x: .7, z: .5 } });
  assert.equal(coasting.api.goto(0, 1, 0), true);
  for (let i = 0; i < 20 && coasting.api.status === 'pathfinding'; i++) coasting.step();
  assert.equal(coasting.api.status, 'moving');
  coasting.player.motion.x = .22;
  coasting.step();
  assert.notEqual(coasting.api.status, 'idle', 'being inside the old .30 radius is not safe arrival when momentum carries the player outside the goal');
  assert.ok(coasting.player.sent.at(-1).down, 'native braking is allowed when stopping immediately would miss the goal');
  assert.equal(coasting.run(100), 'idle', JSON.stringify(coasting.api.debug()));
  for (let i = 0; i < 20; i++) coasting.step();
  assert.ok(Math.hypot(coasting.player.pos.x - .5, coasting.player.pos.z - .5) < .46);
  coasting.api.destroy();

  const hazard = continuousWalking({ narrow: true, position: { x: .65, z: .78 },
    blocks: [{ x: 0, y: 0, z: 1, name: 'lava' }] });
  assert.equal(hazard.api.goto(0, 1, 0), true);
  for (let i = 0; i < 20 && hazard.api.status === 'pathfinding'; i++) hazard.step();
  assert.equal(hazard.api.status, 'moving');
  hazard.step();
  assert.notEqual(hazard.api.status, 'idle', 'near the marker is not enough when the actual footprint overlaps hazardous floor');
  assert.equal(hazard.run(400), 'failed', JSON.stringify(hazard.api.debug()));
  assert.ok(hazard.log.every(frame => frame.forward === 0 && frame.strafe === 0), 'a hazardous source footprint cannot authorize a centering movement');
  hazard.api.destroy();
});

for (const goal of [{ x: 64, y: 1, z: 8 }, { x: 32, y: 1, z: 10 }]) {
  test(`a verified shallow diagonal to ${goal.x},${goal.z} keeps its true course instead of raster-node headings`, () => {
    const yaw = Math.atan2(-goal.x, -goal.z);
    const h = continuousWalking({ yaw });
    assert.equal(h.api.goto(goal.x, goal.y, goal.z), true);
    assert.equal(h.run(500), 'idle', JSON.stringify(h.api.debug()));
    const completed = h.searchJobs.filter(job => job.result?.complete);
    assert.ok(completed.length > 0 && completed.every(job => job.result.fastWalk === true),
      'the real native world and planner exercise the verified direct-walk/Bresenham route');
    assert.ok(h.log.every(frame => Math.abs(Math.atan2(Math.sin(frame.yaw - yaw), Math.cos(frame.yaw - yaw))) < .000001),
      `a shallow straight corridor has no genuine heading change: ${JSON.stringify(h.metrics())}`);
    assert.ok(h.log.every(frame => frame.onGround && frame.pos.y === 1));
    assert.equal(h.metrics().collisions, 0);
    assert.ok(Math.hypot(h.player.pos.x - goal.x - .5, h.player.pos.z - goal.z - .5) < .46);
    const arrivalInput = h.player.sent.length;
    for (let i = 0; i < 10; i++) h.step();
    assert.ok(Math.hypot(h.player.pos.x - goal.x - .5, h.player.pos.z - goal.z - .5) <= .450001,
      'neutral native coast settles inside the actual final arrival region');
    assert.ok(h.player.sent.slice(arrivalInput).every(packet => !(packet.up || packet.down || packet.left || packet.right || packet.jump || packet.sprint)));
    h.api.destroy();
  });
}
