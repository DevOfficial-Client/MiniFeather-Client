const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Share only the native-engine fixtures, not the other file's registered tests.
// All production pieces (broker, adapter, planner and task runtime) are real.
function runtime() {
  const fixture = fs.readFileSync(path.join(__dirname, 'baritone-adapter.test.cjs'), 'utf8');
  const boundary = fixture.indexOf("\ntest('resolves renamed native methods");
  assert.ok(boundary > 0);
  const outer = vm.createContext({ require, __dirname, console });
  const h = vm.runInContext(fixture.slice(0, boundary) + '\nsetup();', outer);
  let clock = 0, nextId = 0;
  const timers = new Map();
  Object.assign(h.context, {
    performance: { now: () => clock },
    __MINIBLOX_GAME__: h.game,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setTimeout(fn, delay) { timers.set(++nextId, { fn, at: clock + delay }); return nextId; },
    clearTimeout(id) { timers.delete(id); }
  });
  h.context.document.addEventListener = () => {};
  h.context.document.removeEventListener = () => {};
  h.game.inGame = () => true;
  h.player.pos = { x: .5, y: 1, z: .5 };
  for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) {
    for (let y = 1; y <= 8; y++) h.world.cells.set(`${x},${y},${z}`, 'air');
  }
  for (const file of ['BaritonePlanner.js', 'Baritone.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Movement', file), 'utf8'), h.context);
  }
  const step = () => {
    clock += 50;
    for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); }
    h.player.viewRenamed();
    h.player.collectRenamed();
    const forward = -h.player.forward, right = h.player.sideways;
    // Flat-ground native input convention, with ordinary walking speed.
    h.player.pos.x += (-Math.sin(h.player.yaw) * forward + Math.cos(h.player.yaw) * right) * .15;
    h.player.pos.z += (-Math.cos(h.player.yaw) * forward - Math.sin(h.player.yaw) * right) * .15;
  };
  return { ...h, api: h.context.Baritone, step, timers };
}

test('real broker/adapter/planner/runtime navigate a simulated player through native input', () => {
  const h = runtime();
  assert.equal(h.api.goto(4, 1, 0), true);
  for (let i = 0; i < 200 && h.api.status !== 'idle' && h.api.status !== 'failed'; i++) h.step();
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.ok(Math.hypot(h.player.pos.x - 4.5, h.player.pos.z - .5) < .31);
  assert.ok(h.player.sent.some(packet => packet.up && Math.abs(packet.yaw + Math.PI / 2) < .1));
  assert.ok(h.player.sent.every((packet, i) => packet.sequenceNumber === 11 + i));
  assert.equal(h.api.debug().native.hooked, false);
  h.api.destroy(); h.adapter.destroy();
  assert.equal(h.timers.size, 0);
});

test('native camera can turn around and stop immediately without residual movement', () => {
  const h = runtime();
  assert.equal(h.api.goto(0, 1, 4), true);
  for (let i = 0; i < 40; i++) h.step();
  assert.notEqual(h.api.status, 'failed', JSON.stringify(h.api.debug()));
  assert.ok(h.player.pos.z > .5);
  h.api.stop();
  const before = { ...h.player.pos };
  for (let i = 0; i < 10; i++) h.step();
  assert.equal(h.player.pos.x, before.x);
  assert.equal(h.player.pos.z, before.z);
  assert.equal(h.api.debug().native.hooked, false);
  h.api.destroy(); h.adapter.destroy();
});

test('a real chat command can plan before the input closes, without seizing controls', () => {
  const h = runtime();
  h.game.chat = { showInput: true };
  assert.equal(h.api.goto(3, 1, 0), true);
  assert.equal(h.api.status, 'pathfinding');
  assert.equal(h.api.debug().native.hooked, false);
  h.game.chat.showInput = false;
  for (let i = 0; i < 200 && !['idle', 'failed'].includes(h.api.status); i++) h.step();
  assert.equal(h.api.status, 'idle', JSON.stringify(h.api.debug()));
  assert.ok(Math.hypot(h.player.pos.x - 3.5, h.player.pos.z - .5) < .31);
  h.api.destroy(); h.adapter.destroy();
});
