'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function nativeTerrain(options = {}) {
  const fixture = fs.readFileSync(path.join(__dirname, 'baritone-adapter.test.cjs'), 'utf8');
  const boundary = fixture.indexOf("\ntest('resolves renamed native methods");
  const outer = vm.createContext({ require, __dirname, console });
  const h = vm.runInContext(fixture.slice(0, boundary) + '\nsetup();', outer);
  let clock = 0, timerId = 0;
  const timers = new Map(), placementLog = [], movementLog = [], miningLog = [], miningTicks = new Map();
  Object.assign(h.context, {
    performance: { now: () => clock }, Date: { now: () => clock + 100000 },
    __MINIBLOX_GAME__: h.game,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  h.context.document.addEventListener = () => {};
  h.context.document.removeEventListener = () => {};
  h.game.inGame = () => true;
  h.player.pos = { x: .5, y: 1, z: .5 };
  h.player.inventory.currentItem = 3;
  const stoneBlock = { name: 'stone', defaultState: { isFullCube: () => true }, material: { isLiquid: () => false } };
  h.player.inventory.main = Array(9).fill(null);
  h.player.inventory.main[1] = { stackSize: 16, item: { name: 'stone', block: stoneBlock, isItemBlock: () => true } };
  for (let x = -8; x <= 20; x++) for (let z = -8; z <= 8; z++) for (let y = 0; y <= 8; y++) {
    h.world.cells.set(`${x},${y},${z}`, y === 0 && z === 0 ? 'stone' : 'air');
  }
  for (let x = 1; x <= 4; x++) h.world.cells.set(`${x},0,0`, 'air');
  if (options.tunnel) {
    for (let x = -8; x <= 20; x++) {
      h.world.cells.set(`${x},0,0`, 'stone');
      h.world.cells.set(`${x},3,0`, 'bedrock');
      for (let y = 1; y <= 5; y++) for (const z of [-1, 1]) h.world.cells.set(`${x},${y},${z}`, 'bedrock');
    }
    for (let x = 1; x <= 3; x++) for (const y of [1, 2]) h.world.cells.set(`${x},${y},0`, 'stone');
  }
  if (options.water) {
    for (let x = -8; x <= 20; x++) for (let z = -8; z <= 8; z++) {
      h.world.cells.set(`${x},0,${z}`, 'stone');
      for (let y = 1; y <= 5; y++) h.world.cells.set(`${x},${y},${z}`, 'water');
    }
    h.player.pos.y = 2; h.player.inWater = true; h.player.inLava = false; h.player.oxygen = 300;
    h.player.onGround = false; h.player.motion = { x: 0, y: 0, z: 0 };
  }
  const Position = h.world.constructor.scratchPosition.constructor;
  const cell = (x, y, z) => h.world.cells.get(`${x},${y},${z}`) || 'stone';
  const solid = (x, y, z) => !['air', 'water', 'lava', 'plant'].includes(cell(x, y, z));
  // Independent native-shaped ray: intersect actual block boxes from the real
  // camera angle. No test feeds desired targets into objectMouseOver.
  h.controller.updateRayTrace = function () {
    const origin = { x: h.player.pos.x, y: h.player.pos.y + h.player.getEyeHeight(), z: h.player.pos.z };
    const direction = { x: -Math.sin(h.player.yaw) * Math.cos(h.player.pitch), y: Math.sin(h.player.pitch),
      z: -Math.cos(h.player.yaw) * Math.cos(h.player.pitch) };
    let best = null;
    for (let x = Math.floor(origin.x) - 5; x <= Math.floor(origin.x) + 5; x++) {
      for (let y = Math.max(0, Math.floor(origin.y) - 5); y <= Math.floor(origin.y) + 5; y++) {
        for (let z = Math.floor(origin.z) - 5; z <= Math.floor(origin.z) + 5; z++) {
          if (!solid(x, y, z)) continue;
          const min = { x, y, z }, max = { x: x + 1, y: y + (cell(x, y, z) === 'slab' ? .5 : 1), z: z + 1 };
          let near = 0, far = 4.5, side = null, valid = true;
          for (const axis of ['x', 'y', 'z']) {
            if (Math.abs(direction[axis]) < 1e-10) {
              if (origin[axis] < min[axis] || origin[axis] > max[axis]) { valid = false; break; }
              continue;
            }
            let enter = (min[axis] - origin[axis]) / direction[axis], exit = (max[axis] - origin[axis]) / direction[axis];
            const enteringSign = direction[axis] > 0 ? -1 : 1;
            if (enter > exit) [enter, exit] = [exit, enter];
            if (enter > near) { near = enter; side = { x: 0, y: 0, z: 0, [axis]: enteringSign }; }
            far = Math.min(far, exit);
            if (near > far) { valid = false; break; }
          }
          if (!valid || !side || near < 0 || near > 4.5 || best && near >= best.distance) continue;
          best = { distance: near, block: new Position(x, y, z), side,
            hitVec: { x: origin.x + direction.x * near, y: origin.y + direction.y * near, z: origin.z + direction.z * near } };
        }
      }
    }
    this.objectMouseOver = best || {};
  };
  h.controller.rightClickMouse = function () {
    const getHeldItem = h.player.inventory.getCurrentItem();
    const hit = this.objectMouseOver;
    if (!hit.block || !hit.side || !getHeldItem || getHeldItem.stackSize <= 0) return;
    const destination = hit.block.offset(hit.side);
    if (cell(destination.x, destination.y, destination.z) !== 'air') return;
    this.rightClickDelayTimer = 4; this.placements++;
    placementLog.push({ target: { x: destination.x, y: destination.y, z: destination.z },
      player: { ...h.player.pos }, sneak: h.player.sneak, hit: { x: hit.block.x, y: hit.block.y, z: hit.block.z }, time: clock });
    if (options.confirmPlacement !== false) {
      h.world.cells.set(`${destination.x},${destination.y},${destination.z}`, 'stone');
      getHeldItem.stackSize--;
    }
  };
  // Re-resolve the controller after installing independent native methods.
  h.adapter.destroy();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Movement/BaritonePlanner.js'), 'utf8'), h.context);
  const createPlanner = h.context.__MF_BARITONE_PLANNER__.create;
  // Isolate bridge construction from parkour: this harness intentionally models
  // native walking/sneak, not the separate jump/gravity integrator.
  h.context.__MF_BARITONE_PLANNER__ = { ...h.context.__MF_BARITONE_PLANNER__,
    create: (read, options) => createPlanner(read, { ...options, allowGap: false }) };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Movement/Baritone.js'), 'utf8'), h.context);
  const supported = pos => {
    for (const dx of [-.29, 0, .29]) for (const dz of [-.29, 0, .29]) {
      if (solid(Math.floor(pos.x + dx), Math.floor(pos.y - .01), Math.floor(pos.z + dz))) return true;
    }
    return false;
  };
  const step = () => {
    clock += 50;
    for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); }
    h.player.viewRenamed(); h.player.collectRenamed();
    const forward = -h.player.forward, right = h.player.sideways;
    if (options.water) {
      const motion = h.player.motion;
      // Source-verified native water integrator, not production velocity writes:
      // jump adds .05 before movement; movement is followed by .8 drag / -.02.
      if (h.player.jumping && h.player.inWater) motion.y += .05;
      motion.x += (-Math.sin(h.player.yaw) * forward + Math.cos(h.player.yaw) * right) * .02 * .98;
      motion.z += (-Math.cos(h.player.yaw) * forward - Math.sin(h.player.yaw) * right) * .02 * .98;
      h.player.pos.x += motion.x; h.player.pos.y += motion.y; h.player.pos.z += motion.z;
      motion.x *= .8; motion.y = motion.y * .8 - .02; motion.z *= .8;
      if (h.player.pos.y < 1) { h.player.pos.y = 1; motion.y = 0; }
      h.player.inWater = cell(Math.floor(h.player.pos.x), Math.floor(h.player.pos.y + .1), Math.floor(h.player.pos.z)) === 'water';
      h.player.onGround = h.player.pos.y === 1;
      const headWater = cell(Math.floor(h.player.pos.x), Math.floor(h.player.pos.y + 1.62), Math.floor(h.player.pos.z)) === 'water';
      h.player.oxygen = headWater ? h.player.oxygen - 1 : 300;
    } else {
      const next = { ...h.player.pos,
        x: h.player.pos.x + (-Math.sin(h.player.yaw) * forward + Math.cos(h.player.yaw) * right) * .15,
        z: h.player.pos.z + (-Math.cos(h.player.yaw) * forward - Math.sin(h.player.yaw) * right) * .15 };
      // Native sneak retains the support footprint; it does not teleport or fly.
      if (!h.player.sneak || supported(next)) h.player.pos = next;
      h.player.onGround = supported(h.player.pos);
      if (!h.player.onGround) h.player.pos.y -= .08;
    }
    movementLog.push({ pos: { ...h.player.pos }, forward, sneak: h.player.sneak, time: clock });
    if (options.tunnel) {
      const before = h.controller.digTicks;
      h.controller.render();
      const hit = h.controller.objectMouseOver;
      if (h.controller.digTicks > before && hit.block) {
        const key = `${hit.block.x},${hit.block.y},${hit.block.z}`;
        const count = (miningTicks.get(key) || 0) + 1; miningTicks.set(key, count);
        if (count === 10 && cell(hit.block.x, hit.block.y, hit.block.z) === 'stone') {
          miningLog.push({ x: hit.block.x, y: hit.block.y, z: hit.block.z, time: clock });
          h.world.cells.set(key, 'air');
        }
      }
    } else h.controller.updateRayTrace();
  };
  return { ...h, api: h.context.Baritone, step, timers, placementLog, movementLog, miningLog, cell };
}

test('real native bridge approach reaches the exposed face, places each support and restores the selected slot', () => {
  const h = nativeTerrain();
  assert.equal(h.api.goto(5, 1, 0), true);
  for (let i = 0; i < 1000 && !['idle', 'failed'].includes(h.api.status); i++) h.step();
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.ok(h.placementLog.length >= 4, 'the native ray must confirm each bridge block separately');
  assert.ok(h.placementLog.every(entry => entry.sneak), 'the player stays sneaking at the unbuilt bridge edge');
  assert.ok(h.placementLog.every(entry => entry.player.x <= entry.hit.x + 1.15), 'native placement happens before overshooting the supported edge');
  assert.ok(h.movementLog.every(entry => entry.pos.y === 1), 'do not fall into the gap while awaiting placement');
  assert.ok(Math.hypot(h.player.pos.x - 5.5, h.player.pos.z - .5) < .31);
  assert.equal(h.player.inventory.currentItem, 3, 'temporary block selection is restored');
  h.api.destroy(); assert.equal(h.timers.size, 0);
});

test('genuine native placement without world confirmation never walks into the gap; stop releases sneak and restores the slot', () => {
  const h = nativeTerrain({ confirmPlacement: false });
  assert.equal(h.api.goto(5, 1, 0), true);
  for (let i = 0; i < 180; i++) h.step();
  assert.ok(h.placementLog.length > 0, 'the genuine visible face must have been clicked');
  assert.equal(h.api.status, 'placing', JSON.stringify(h.api.debug()));
  assert.ok(h.player.pos.x > 1 && h.player.pos.x < 1.15, 'remain on the supported sneak edge without treating a click as confirmation');
  assert.equal(h.player.pos.y, 1);
  assert.equal(h.cell(1, 0, 0), 'air');
  h.api.stop(); const before = { ...h.player.pos };
  for (let i = 0; i < 8; i++) h.step();
  assert.deepEqual(h.player.pos, before); assert.equal(h.player.sneak, false);
  assert.equal(h.player.inventory.currentItem, 3);
  h.api.destroy(); assert.equal(h.timers.size, 0);
});

test('real native inputs navigate swimming with source-verified buoyancy, drag and no required ground contact', () => {
  const h = nativeTerrain({ water: true });
  assert.equal(h.api.goto(3, 3, 0), true);
  for (let i = 0; i < 600 && !['idle', 'failed'].includes(h.api.status); i++) h.step();
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.ok(Math.hypot(h.player.pos.x - 3.5, h.player.pos.y - 3, h.player.pos.z - .5) < .5);
  assert.ok(h.player.sent.some(input => input.jump && !input.onGround));
  assert.ok(h.player.sent.some(input => input.up && !input.onGround));
  assert.ok(h.player.oxygen > 0, 'normal short swimming route is completed before oxygen runs out');
  h.api.destroy(); assert.equal(h.timers.size, 0);
});

test('native oxygen recovery reaches the surface before resuming the original underwater goal', () => {
  const h = nativeTerrain({ water: true }); h.player.oxygen = 40;
  assert.equal(h.api.goto(3, 2, 0), true);
  let recovered = false;
  for (let i = 0; i < 700 && !['idle', 'failed'].includes(h.api.status); i++) {
    h.step(); if (h.player.oxygen === 300) recovered = true;
  }
  assert.ok(recovered, JSON.stringify(h.api.debug()));
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.ok(Math.hypot(h.player.pos.x - 3.5, h.player.pos.y - 2, h.player.pos.z - .5) < .5);
  assert.ok(h.player.oxygen > 0, 'surface detour restores breathing before returning underwater');
  h.api.destroy(); assert.equal(h.timers.size, 0);
});

test('explicit native placement of an adjacent gap floor reaches the visible support edge', () => {
  const h = nativeTerrain();
  assert.equal(h.api.place(1, 0, 0), true);
  for (let i = 0; i < 500 && !['idle', 'failed'].includes(h.api.status); i++) h.step();
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.equal(h.cell(1, 0, 0), 'stone', 'a correct native click and world update must confirm the explicit placement');
  assert.ok(h.placementLog.length >= 1);
  assert.ok(h.placementLog.every(entry => entry.player.x < 1.15));
  assert.equal(h.player.pos.y, 1);
  assert.equal(h.player.inventory.currentItem, 3, 'automatic explicit placement also restores the initial slot');
  h.api.destroy(); assert.equal(h.timers.size, 0);
});

test('real native ray and mining hold clear head then feet through a tunnel without a side path', () => {
  const h = nativeTerrain({ tunnel: true }); h.api.setAutoPlace(false);
  assert.equal(h.api.goto(3, 1, 0), true);
  for (let i = 0; i < 600 && !['idle', 'failed'].includes(h.api.status); i++) h.step();
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  for (const x of [1, 2, 3]) {
    const headIndex = h.miningLog.findIndex(entry => entry.x === x && entry.y === 2);
    const feetIndex = h.miningLog.findIndex(entry => entry.x === x && entry.y === 1);
    assert.ok(headIndex >= 0 && feetIndex > headIndex, 'headroom must clear before feet using the genuine native ray');
    assert.equal(h.cell(x, 0, 0), 'stone', 'do not dig away the player floor');
  }
  assert.ok(Math.hypot(h.player.pos.x - 3.5, h.player.pos.z - .5) < .31);
  assert.equal(h.controller.key.leftClick, 0, 'stop must release the native mining hold');
  h.api.destroy(); assert.equal(h.timers.size, 0);
});

test('explicit native edge placement preserves the requested building slot rather than choosing another stack', () => {
  const h = nativeTerrain();
  h.player.inventory.main[7] = { stackSize: 7, item: { name: 'stone',
    block: { name: 'stone', defaultState: { isFullCube: () => true }, material: { isLiquid: () => false } },
    isItemBlock: () => true } };
  assert.equal(h.api.place(1, 0, 0, 8), true);
  for (let i = 0; i < 500 && !['idle', 'failed'].includes(h.api.status); i++) h.step();
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.equal(h.player.inventory.main[7].stackSize, 6);
  assert.equal(h.player.inventory.main[1].stackSize, 16, 'the auto-choice stack is untouched');
  assert.equal(h.player.inventory.currentItem, 7, 'an explicit slot choice remains selected');
  h.api.destroy(); assert.equal(h.timers.size, 0);
});
