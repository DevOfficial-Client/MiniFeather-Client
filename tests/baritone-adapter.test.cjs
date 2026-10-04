'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const base = path.join(__dirname, '..');
const brokerSource = fs.readFileSync(path.join(base, 'src/Movement/MovementAPI.js'), 'utf8');
const adapterSource = fs.readFileSync(path.join(base, 'src/Movement/BaritoneAdapter.js'), 'utf8');

class Position {
  constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
  getX() { return this.x; }
  up() { return new Position(this.x, this.y + 1, this.z); }
  down() { return new Position(this.x, this.y - 1, this.z); }
  offset(side) { return new Position(this.x + side.x, this.y + side.y, this.z + side.z); }
}
class World {
  static scratchPosition = new Position(0, 0, 0);
  constructor() {
    this.entities = new Map(); this.loaded = true; this.reads = 0;
    this.chunkProvider = { isLoaded: (x, z) => { this.lastChunk = [x, z]; return this.loaded; } };
    this.cells = new Map();
  }
  getBlockState(pos) {
    assert.ok(pos instanceof Position, 'must never pass a plain object to native world');
    this.reads++;
    const name = this.cells.get(`${pos.x},${pos.y},${pos.z}`) || 'stone';
    const air = name === 'air', liquid = /water|lava|unknown_liquid/.test(name);
    const block = { name, hardness: name === 'bedrock' ? -1 : 1, isAir: () => air,
      isReplaceable: name === 'plant',
      material: { isLiquid: () => liquid }, getPlayerRelativeBlockHardness: () => .1 };
    return { block, getBlock: () => block, getCollisionBoundingBox: () => air || liquid || name === 'plant' ? null : {
      min: { x: pos.x, y: pos.y, z: pos.z },
      max: { x: pos.x + 1, y: pos.y + (name === 'slab' ? .5 : 1), z: pos.z + 1 }
    } };
  }
}
class Player {
  constructor() {
    this.pos = { x: 0, y: 1, z: 0 }; this.yaw = 0; this.pitch = 0;
    this.pendingInputs = []; this.inputSequenceNumber = 10; this.lastServerAckId = 9;
    this.sent = []; this.sneak = false; this.jumping = false; this.sprinting = false;
    this.abilities = { creative: false }; this.onGround = true;
    this.inventory = { currentItem: 0, getCurrentItem: () => this.inventory.main[this.inventory.currentItem],
      main: [{ stackSize: 64, item: { isItemBlock: () => true } }] };
  }
  serverUsesInputMovement() { return true; }
  collectRenamed() {
    this.sentInputThisTick = false;
    this.inputSequenceNumber++;
    this.currentInput = { sequenceNumber: this.inputSequenceNumber, up: false, down: false, left: false, right: false,
      jump: false, sneak: this.sneak, sprint: this.isSprinting(), yaw: this.yaw, pitch: this.pitch,
      pos: { ...this.pos }, ackId: this.lastServerAckId, onGround: this.onGround, usingItem: false };
    const send = this.serverUsesInputMovement();
    if (send) { this.pendingInputs.push(this.currentInput); this.sendPacket(this.currentInput); }
    this.applyRenamed(this.currentInput);
    this.sentInputThisTick = send;
  }
  applyRenamed(input) {
    this.sideways = +!!input.right + (input.left ? -1 : 0);
    this.forward = (input.up ? -1 : 0) + +!!input.down;
    this.jumping = input.jump;
    if (input.sneak) this.forward *= .3;
    if (input.usingItem) this.forward *= .2;
    this.setPositionAndRotation(this.pos.x, this.pos.y, this.pos.z, input.yaw, input.pitch);
  }
  viewRenamed() {
    this.yaw = this.controls.yaw; this.pitch = this.controls.pitch;
    this.sneak = false; this.punching = false; const ctrl = false, alt = false; void ctrl; void alt;
  }
  setPositionAndRotation(x, y, z, yaw, pitch) { this.yaw = yaw; this.pitch = pitch; }
  sendPacket(input) { this.sent.push(JSON.parse(JSON.stringify(input))); }
  setSprinting(value) { this.sprinting = value; this.sprintingTicksLeft = value ? 600 : 0; }
  isSprinting() { return this.sprinting; }
  getEyeHeight() { return this.sneak ? 1.54 : 1.62; }
  getHealth() { return 20; }
}
class Controller {
  constructor(game) {
    this.game = game; this.key = { leftClick: 0 }; this.objectMouseOver = {};
    this.punches = 0; this.releases = 0; this.digTicks = 0; this.placements = 0;
  }
  beginRenamed(release) {
    if (release) { this.key.leftClick = 0; this.currBreakingLocation = null; this.releases++; }
    else this.punch();
  }
  punch() { this.key.leftClick = Date.now(); this.punches++; }
  digRenamed() {
    const getPlayerRelativeBlockHardness = .1;
    if (this.key.leftClick) { this.currBreakingLocation = this.objectMouseOver.block; this.digTicks++; }
    return getPlayerRelativeBlockHardness;
  }
  rightClickMouse() {
    const getHeldItem = this.game.player.inventory.getCurrentItem();
    if (this.objectMouseOver.block) { this.rightClickDelayTimer = 4; this.placements++; }
    return getHeldItem;
  }
  updateRayTrace() { this.rayUpdates = (this.rayUpdates || 0) + 1; }
  render() { this.updateRayTrace(); this.digRenamed(); }
}
function setup() {
  const listeners = new Map();
  function dispatch(event) { for (const listener of listeners.get(event.type) || []) listener(event); return true; }
  const document = { dispatchEvent: dispatch, querySelector: () => null };
  class Event { constructor(type, options) { this.type = type; Object.assign(this, options); } }
  const context = vm.createContext({ console, document, MouseEvent: Event, KeyboardEvent: Event,
    dispatchEvent: dispatch, Date, Map, Set, Object, Function, Reflect, Math, Number });
  vm.runInContext(brokerSource, context); vm.runInContext(adapterSource, context);
  const player = new Player(), world = new World();
  const controls = { yaw: 0, pitch: 0, rotation: { x: 0, y: 0 },
    yawObject: { rotation: { y: 0 } }, pitchObject: { rotation: { x: 0 } },
    onLook(yaw, pitch) { player.yaw = yaw; player.pitch = pitch; },
    updateCamera() { this.yawObject.rotation.y = this.yaw; this.pitchObject.rotation.x = this.pitch; this.onLook(this.yaw, this.pitch); } };
  player.controls = controls;
  const game = { player, world, controls, info: { selectedSlot: 0, menus: { isOpen: () => false } } };
  game.controller = new Controller(game);
  const adapter = context.__MF_BARITONE_ADAPTER__.create();
  assert.equal(adapter.bind(game), true);
  return { context, game, player, world, controls, controller: game.controller, adapter, listeners };
}
function target(controller, x = 0, y = 2, z = -2) {
  controller.objectMouseOver = { block: new Position(x, y, z), hitVec: { x: x + .5, y: y + .5, z: z + 1 },
    side: { x: 0, y: 1, z: 0 } };
}

test('resolves renamed native methods and modifies the original packet before its native send', () => {
  const { adapter, player } = setup();
  assert.equal(adapter.setControls({ forward: 1, strafe: -1, jump: true, sneak: true, sprint: true }), true);
  player.collectRenamed();
  const packet = player.sent[0];
  assert.equal(packet.sequenceNumber, 11); assert.equal(packet.ackId, 9);
  assert.deepEqual(packet.pos, { x: 0, y: 1, z: 0 });
  assert.equal(packet.up, true); assert.equal(packet.left, true);
  assert.equal(packet.jump, true); assert.equal(packet.sneak, true); assert.equal(packet.sprint, true);
  assert.equal(player.pendingInputs[0], player.currentInput);
  assert.equal(Object.hasOwn(player.pendingInputs, 'push'), false);
  assert.equal(player.forward, -.3); assert.equal(player.sideways, -1); assert.equal(player.jumping, true);
  assert.equal(adapter.diagnostics().inputMode, 'native-queue-before-send');
  adapter.destroy();
});
test('does not modify reconciliation inputs and composes/restores other movement hooks', () => {
  const { context, adapter, player } = setup();
  let otherCalls = 0;
  context.__MINIFEATHER_MOVEMENT_API__.register(player, 'applyInput', 'other', { after() { otherCalls++; } });
  adapter.setControls({ forward: 1, jump: true }); player.collectRenamed();
  const replay = { up: false, down: true, right: true, left: false, jump: false, yaw: 0, pitch: 0 };
  player.applyRenamed(replay); assert.equal(replay.down, true); assert.equal(replay.up, false);
  adapter.release();
  assert.equal(player.jumping, false); assert.equal(player.sneak, false); assert.equal(player.sprinting, false);
  assert.equal(player.forward, 0); assert.equal(player.sideways, 0);
  player.collectRenamed(); assert.equal(player.sent[1].up, false); assert.equal(player.sent[1].jump, false);
  assert.equal(otherCalls, 3);
  context.__MINIFEATHER_MOVEMENT_API__.unregisterAll(player, 'other');
  assert.equal(Object.hasOwn(player, 'applyRenamed'), false); assert.equal(Object.hasOwn(player, 'collectRenamed'), false);
});
test('reads genuine native positions and refuses unknown/unloaded chunks before reading', () => {
  const { adapter, world } = setup();
  const cell = adapter.readCell(-17, 3, -1);
  assert.equal(cell.known, true); assert.equal(cell.solid, true); assert.equal(cell.height, 1);
  assert.equal(cell.collision[0].min.x, 0); assert.equal(cell.collision[0].max.x, 1);
  assert.deepEqual(world.lastChunk, [-2, -1]);
  world.loaded = false; const reads = world.reads;
  assert.equal(adapter.readCell(10, 3, 10).known, false); assert.equal(world.reads, reads);
  assert.equal(adapter.readCell(1.1, 3, 1).known, false); assert.equal(adapter.readCell(1, -1, 1).known, false);
});
test('classifies hazards, air, bedrock and partial native collision', () => {
  const { adapter, world } = setup();
  for (const [y, name] of [[1, 'air'], [2, 'bedrock'], [3, 'water'], [4, 'slab'], [5, 'lava']]) world.cells.set(`0,${y},0`, name);
  assert.equal(adapter.readCell(0, 1, 0).replaceable, true); assert.equal(adapter.readCell(0, 1, 0).solid, false);
  assert.equal(adapter.readCell(0, 2, 0).breakable, false); assert.equal(adapter.readCell(0, 3, 0).hazard, false);
  assert.equal(adapter.readCell(0, 3, 0).water, true); assert.equal(adapter.readCell(0, 3, 0).passable, true);
  assert.equal(adapter.readCell(0, 4, 0).height, .5); assert.equal(adapter.readCell(0, 5, 0).hazard, true);
});
test('aims through a verified camera controls shape with native negative Z convention', () => {
  const { adapter, player, controls } = setup();
  for (let i = 0; i < 16; i++) adapter.aimAt(4, 2.62, 0, .05);
  const aimed = adapter.aimAt(4, 2.62, 0, .05);
  assert.equal(aimed.aligned, true); assert.ok(Math.abs(player.yaw + Math.PI / 2) < .001);
  assert.equal(controls.yawObject.rotation.y, player.yaw); assert.equal(controls.pitchObject.rotation.x, player.pitch);
  assert.deepEqual(JSON.parse(JSON.stringify(adapter.eye())), { x: 0, y: 2.62, z: 0 });
});
test('camera fallback dispatches native mouse movement and checks real angle feedback', () => {
  const { context, game, player, controls, listeners, adapter } = setup();
  adapter.destroy(); delete game.controls; delete player.controls;
  listeners.set('mousemove', [event => { player.yaw -= event.movementX * .004; player.pitch -= event.movementY * .004; }]);
  const next = context.__MF_BARITONE_ADAPTER__.create(); assert.equal(next.bind(game), true);
  for (let i = 0; i < 16; i++) next.aimAt(4, 2.62, 0);
  assert.equal(next.aimAt(4, 2.62, 0).aligned, true); assert.ok(Math.abs(player.yaw + Math.PI / 2) < .04);
  assert.equal(controls.yaw, 0, 'must not mutate a guessed camera parent');
  assert.equal(next.diagnostics().cameraVerified, true);
});
test('mining uses native hold and native finish, never fake ray hits, and releases on mismatch', () => {
  const { adapter, controller } = setup(); target(controller);
  const hit = controller.objectMouseOver;
  assert.equal(adapter.interact('mine', { x: 0, y: 2, z: -2 }).ok, true);
  assert.equal(controller.digTicks, 0, 'starting native hold must not run an extra mining tick');
  controller.render();
  assert.equal(adapter.interact('mine', { x: 0, y: 2, z: -2 }).ok, true);
  assert.equal(controller.digTicks, 1, 'logic tick must not duplicate engine mining');
  controller.render();
  assert.equal(controller.punches, 1); assert.equal(controller.digTicks, 2); assert.equal(controller.objectMouseOver, hit);
  assert.equal(adapter.interact('mine', { x: 1, y: 2, z: -2 }).reason, 'wait-ray');
  assert.equal(controller.key.leftClick, 0); assert.equal(controller.releases, 1);
  target(controller, 0, 2, -12); assert.equal(adapter.interact('mine', { x: 0, y: 2, z: -12 }).reason, 'out-of-reach');
});
test('place requires native face destination, a real block stack and replaceable target', () => {
  const { adapter, controller, world, player } = setup(); target(controller); world.cells.set('0,3,-2', 'air');
  assert.equal(adapter.interact('place', { x: 1, y: 3, z: -2 }).reason, 'wait-ray');
  assert.equal(adapter.interact('place', { x: 0, y: 3, z: -2 }).ok, true); assert.equal(controller.placements, 1);
  player.inventory.main[0] = null;
  assert.equal(adapter.interact('place', { x: 0, y: 3, z: -2 }).reason, 'no-block-item');
});
test('selects only valid native hotbar slots; reconnect restores old hooks', () => {
  const { adapter, player, game } = setup();
  assert.equal(adapter.selectSlot(9), true); assert.equal(player.inventory.currentItem, 8); assert.equal(game.info.selectedSlot, 8);
  assert.equal(adapter.selectSlot(0), false); assert.equal(adapter.selectSlot(10), false);
  adapter.setControls({ forward: 1 }); player.collectRenamed();
  const replacement = new Player(); replacement.controls = game.controls; game.player = replacement;
  assert.equal(adapter.bind(game), true); assert.equal(Object.hasOwn(player, 'collectRenamed'), false);
  replacement.collectRenamed(); assert.equal(replacement.sent[0].up, true);
  adapter.destroy(); assert.equal(Object.hasOwn(replacement, 'collectRenamed'), false);
});
test('observing players never seizes inputs and does not release an active operation', () => {
  const { adapter, player, game, world } = setup();
  world.entities.set(4, { id: 4, pos: { x: 1, y: 1, z: 1 } });
  assert.equal(adapter.observe(game), true); assert.equal(adapter.entities().length, 1);
  assert.equal(Object.hasOwn(player, 'collectRenamed'), false);
  adapter.setControls({ forward: 1 }); const nativeWrapper = player.collectRenamed;
  assert.equal(adapter.observe(game), true); assert.equal(player.collectRenamed, nativeWrapper);
  assert.equal(adapter.diagnostics().hooked, true);
});
test('input and interaction are blocked while native menus block gameplay', () => {
  const { adapter, player, game, controller } = setup();
  target(controller); adapter.setControls({ forward: 1 }); game.info.menus.blocksGameplay = true;
  player.collectRenamed(); assert.equal(player.sent[0].up, false);
  assert.equal(adapter.setControls({ forward: 1 }), false);
  assert.equal(adapter.interact('mine', { x: 0, y: 2, z: -2 }).reason, 'game-input-blocked');
  assert.equal(adapter.aimAt(4, 2.62, 0).aligned, false);
  assert.equal(controller.punches, 0);
});
test('attack accepts only the real targeted entity within native reach', () => {
  const { adapter, controller } = setup();
  const entity = { id: 7, pos: { x: 0, y: 1, z: -2 } };
  controller.objectMouseOver = { entity, hitVec: { x: 0, y: 2.62, z: -2 } };
  assert.equal(adapter.interact('attack', { entity: { id: 7 } }).reason, 'wait-ray');
  assert.equal(adapter.interact('attack', { entity }).ok, true);
  assert.equal(controller.punches, 1); assert.equal(controller.key.leftClick, 0);
  controller.objectMouseOver.hitVec.z = -4;
  assert.equal(adapter.interact('attack', { entity }).reason, 'out-of-reach');
});
test('rejects vanished apply methods instead of relying on a cached collector-only check', () => {
  const { adapter, player, game } = setup();
  player.applyRenamed = null;
  assert.equal(adapter.bind(game), false);
  assert.equal(adapter.setControls({ forward: 1 }), false);
  assert.equal(adapter.diagnostics().hooked, false);
});
test('propagates native camera non-response instead of reporting a generic missing API', () => {
  const { context, game, player, adapter } = setup();
  adapter.destroy(); delete game.controls; delete player.controls;
  let now = 1000; context.Date = { now: () => now };
  const next = context.__MF_BARITONE_ADAPTER__.create(); next.bind(game);
  next.aimAt(4, 2.62, 0); now = 3000;
  const result = next.aimAt(4, 2.62, 0);
  assert.equal(result.aligned, false); assert.equal(result.reason, 'native-camera-not-responding');
});
test('dummy chunks are unknown even when a provider reports the coordinates loaded', () => {
  const { adapter, world } = setup(); world.getChunk = () => ({ isDummyChunk: true });
  const reads = world.reads; assert.equal(adapter.readCell(0, 1, 0).known, false); assert.equal(world.reads, reads);
});
test('stable native leftClick is preferred to a punch helper and progress stays in native render loop', () => {
  const { context, game, controller, adapter } = setup(); adapter.destroy();
  let called = 0;
  controller.leftClick = function (release) { called++; this.beginRenamed(release); };
  const next = context.__MF_BARITONE_ADAPTER__.create(); next.bind(game); target(controller);
  assert.equal(next.interact('mine', { x: 0, y: 2, z: -2 }).ok, true);
  assert.equal(called, 1); assert.equal(controller.digTicks, 0);
  next.releaseInteraction(); assert.equal(called, 2);
});

function buildingStack(name, count = 16, options = {}) {
  const block = { name, defaultState: { isFullCube: () => options.full !== false },
    material: { isLiquid: () => !!options.liquid }, ...options.block };
  return { stackSize: count, item: { name, block, isItemBlock: () => true } };
}
test('water and unknown liquids use conservative medium flags without treating water as a hazard', () => {
  const { adapter, world } = setup();
  for (const [x, name] of [[1, 'flowing_water'], [2, 'still_water'], [3, 'lava'], [4, 'unknown_liquid']]) world.cells.set(`${x},2,0`, name);
  for (const x of [1, 2]) {
    const cell = adapter.readCell(x, 2, 0);
    assert.equal(cell.water, true); assert.equal(cell.hazard, false); assert.equal(cell.passable, true);
  }
  assert.equal(adapter.readCell(3, 2, 0).lava, true);
  assert.equal(adapter.readCell(3, 2, 0).passable, false);
  assert.equal(adapter.readCell(4, 2, 0).hazard, true);
  assert.equal(adapter.readCell(4, 2, 0).water, false);
});
test('swimming state reads native flags and oxygen; swimming uses ordinary original jump input', () => {
  const { adapter, player } = setup();
  player.inWater = true; player.inLava = false; player.oxygen = 80; player.onGround = false;
  player.motion = { x: .2, y: -.04, z: .1 };
  assert.deepEqual(JSON.parse(JSON.stringify(adapter.swimmingState())), {
    known: true, inWater: true, inLava: false, onGround: false, oxygen: 80, air: 80
  });
  adapter.setControls({ forward: 1, jump: true }); player.collectRenamed();
  assert.equal(player.sent[0].jump, true); assert.equal(player.sent[0].onGround, false);
  assert.equal(player.sent[0].sequenceNumber, 11); assert.equal(player.sent[0].ackId, 9);
  assert.deepEqual(player.motion, { x: .2, y: -.04, z: .1 }, 'adapter must never invent swim velocity');
  adapter.setControls({ forward: 1, jump: false }); player.collectRenamed();
  assert.equal(player.sent[1].jump, false, 'native gravity handles sinking');
  adapter.release(); player.collectRenamed(); assert.equal(player.sent[2].up, false);
});
test('swimming state resolves semantically renamed lava getter and does not invent breath', () => {
  const { adapter, player } = setup();
  player.inWater = false; player.inLava = true;
  player.lavaRenamed = function () { return this.inLava; };
  const state = adapter.swimmingState();
  assert.equal(state.inLava, true); assert.equal(state.oxygen, null);
});
test('building inventory counts only safe native full cubes in the actual hotbar', () => {
  const { adapter, player, game } = setup();
  player.inventory.main = [buildingStack('stone', 24), buildingStack('tnt'), buildingStack('sand'),
    buildingStack('gravel'), buildingStack('oak_slab', 16, { full: false }), buildingStack('water', 16, { liquid: true }),
    buildingStack('chest', 16, { block: { isBlockContainer: true } }), buildingStack('mod_falling_block', 16, {
      block: { checkFallable() {} } }), buildingStack('cobblestone', 48), buildingStack('dirt', 64)];
  assert.deepEqual(JSON.parse(JSON.stringify(adapter.blockInventory())).map(({ slot, count, name }) => ({ slot, count, name })), [
    { slot: 1, count: 24, name: 'stone' }, { slot: 9, count: 48, name: 'cobblestone' }
  ]);
  assert.equal(adapter.blockBudget(), 72);
  assert.equal(adapter.selectBuildingBlock(9).slot, 9); assert.equal(adapter.getSelectedSlot(), 9);
  assert.equal(player.inventory.currentItem, 8); assert.equal(game.info.selectedSlot, 8);
  player.inventory.main[8].stackSize = 0;
  assert.equal(adapter.selectBuildingBlock().slot, 1); assert.equal(adapter.getSelectedSlot(), 1);
  player.inventory.main[0] = null;
  assert.equal(adapter.blockBudget(), 0); assert.equal(adapter.selectBuildingBlock(), null);
});
test('building inventory fails closed if full cube information is unavailable', () => {
  const { adapter, player } = setup();
  player.inventory.main = [{ stackSize: 64, item: { block: { name: 'guess_stone' }, isItemBlock: () => true } }];
  assert.equal(adapter.blockBudget(), 0); assert.equal(adapter.selectBuildingBlock(), null);
});
test('placement aim uses genuine collision surface height and only exposed in-reach faces', () => {
  const { adapter, world, player } = setup();
  world.cells.set('0,2,-2', 'air'); world.cells.set('0,1,-2', 'slab');
  const candidates = adapter.placementAim({ x: 0, y: 2, z: -2 });
  assert.ok(candidates.length > 0);
  const top = candidates.find(candidate => candidate.anchor.x === 0 && candidate.anchor.y === 1 && candidate.anchor.z === -2);
  assert.equal(top.y, 1.5); assert.deepEqual(JSON.parse(JSON.stringify(top.face)), { x: 0, y: 1, z: 0 });
  assert.ok(candidates.every(candidate => candidate.distance <= 4.52));
  world.cells.set('0,3,-20', 'air'); assert.equal(adapter.placementAim({ x: 0, y: 3, z: -20 }).length, 0);
  world.loaded = false; assert.equal(adapter.placementAim({ x: 0, y: 2, z: -2 }).length, 0);
  world.loaded = true; player.pos = { x: .5, y: 1, z: .5 };
  world.cells.set('0,0,-1', 'air'); world.cells.set('0,1,-1', 'air');
  assert.equal(adapter.placementAim({ x: 0, y: 0, z: -1 }).some(candidate =>
    candidate.anchor.x === 0 && candidate.anchor.y === 0 && candidate.anchor.z === 0), false,
  'a player must reach the bridge edge before the hidden side of their support is clickable');
  const withHidden = adapter.placementAim({ x: 0, y: 0, z: -1 }, { includeHidden: true });
  assert.ok(withHidden.some(candidate => candidate.visible === false && candidate.anchor.z === 0));
  const firstHidden = withHidden.findIndex(candidate => !candidate.visible);
  assert.ok(withHidden.slice(firstHidden).every(candidate => !candidate.visible));
  player.pos.z = -.06;
  assert.equal(adapter.placementAim({ x: 0, y: 0, z: -1 }).some(candidate =>
    candidate.anchor.x === 0 && candidate.anchor.y === 0 && candidate.anchor.z === 0), true);
});
test('placement follows native replacement of a clicked plant rather than blindly offsetting its face', () => {
  const { adapter, controller, world } = setup(); target(controller);
  world.cells.set('0,2,-2', 'plant');
  assert.equal(adapter.interact('place', { x: 0, y: 3, z: -2 }).reason, 'wait-ray');
  const actualRay = controller.objectMouseOver;
  assert.equal(adapter.interact('place', { x: 0, y: 2, z: -2 }).ok, true);
  assert.equal(controller.placements, 1); assert.equal(controller.objectMouseOver, actualRay);
});
test('placement aim avoids interactive anchors that would open a menu instead of building', () => {
  const { adapter, world } = setup(); world.cells.set('0,2,-2', 'air'); world.cells.set('0,1,-2', 'chest');
  const candidates = adapter.placementAim({ x: 0, y: 2, z: -2 });
  assert.ok(candidates.every(candidate => candidate.anchor.y !== 1 || candidate.anchor.x !== 0 || candidate.anchor.z !== -2));
});

function miningStack(name, speed, options = {}) {
  const item = { name, getWeaponConfig: () => options.weapon || null, getMaxDamage: () => options.maxDamage || 0 };
  return { stackSize: options.count ?? 1, item, itemDamage: options.damage || 0, data: { efficiency: options.efficiency || 0 },
    getItem: () => item, getStrVsBlock: () => speed, canHarvestBlock: () => options.harvest !== false,
    getMaxDamage: () => options.maxDamage || 0, getItemDamage() { return this.itemDamage; },
    isItemStackDamageable: () => !!options.maxDamage && !options.unbreakable };
}
function nativeMining(h, hardness = 1) {
  const { player, world } = h;
  Object.defineProperty(player.inventory, 'mainInventory', { get() { return this.main; }, configurable: true });
  player.inventory.getStackInSlot = function (index) { return this.main[index] || null; };
  player.inventory.harvestRenamed = function (block) {
    const stack = this.getStackInSlot(this.currentItem); return block.requiresNoTool || !!stack?.canHarvestBlock(block);
  };
  player.inventory.getStrVsBlock = function (block) {
    const stack = this.mainInventory[this.currentItem]; return stack ? stack.getStrVsBlock(block) : 1;
  };
  player.canHarvestBlock = function (block) { return this.inventory.harvestRenamed(block); };
  player.hasteMultiplier = 1;
  player.digSpeedRenamed = function (block) {
    let speed = this.inventory.getStrVsBlock(block);
    const stack = this.inventory.getCurrentItem();
    if (speed > 1 && stack?.data?.efficiency) speed += stack.data.efficiency ** 2 + 1;
    speed *= this.hasteMultiplier;
    if (!this.onGround) speed /= 5;
    if (this.headInWater) speed /= 5;
    return speed;
  };
  const read = world.getBlockState.bind(world);
  world.getBlockState = function (pos) {
    const state = read(pos); state.block.hardness = state.block.name === 'bedrock' ? -1 : hardness;
    state.block.getPlayerRelativeBlockHardness = function (subject, block) {
      assert.equal(block, this, 'must pass the real native block, preserving item effective-block identity');
      return subject.digSpeedRenamed(this) / this.hardness / (subject.canHarvestBlock(this) ? 30 : 100);
    };
    return state;
  };
  return h;
}
test('native mining estimates compare real hotbar tools without changing selection, inventory, UI or packets', () => {
  const h = nativeMining(setup()); const { adapter, player, game } = h;
  player.inventory.main = [miningStack('wood_pickaxe', 2), miningStack('gold_pickaxe', 20, { harvest: false }),
    null, miningStack('diamond_pickaxe', 8)];
  let selected = 0, selectionWrites = 0;
  Object.defineProperty(player.inventory, 'currentItem', { get: () => selected, set(value) { selectionWrites++; selected = value; }, configurable: true });
  const inventoryBefore = [...player.inventory.main];
  const estimate = adapter.miningEstimate(0, 2, -2);
  assert.equal(estimate.slot, 4); assert.equal(estimate.name, 'diamond_pickaxe'); assert.equal(estimate.blockName, 'stone');
  assert.equal(estimate.ticks, 4); assert.equal(estimate.cost, .2); assert.equal(estimate.canHarvest, true);
  assert.equal(estimate.native, true); assert.equal(selectionWrites, 0); assert.equal(selected, 0);
  assert.equal(game.info.selectedSlot, 0); assert.equal(player.sent.length, 0);
  assert.deepEqual(player.inventory.main, inventoryBefore);
  assert.equal(adapter.selectMiningTool({ x: 0, y: 2, z: -2 }).slot, 4);
  assert.equal(selectionWrites, 1); assert.equal(selected, 3); assert.equal(game.info.selectedSlot, 3);
  assert.equal(player.sent.length, 0, 'selection must use native hotbar state, never a hand-crafted packet');
});
test('native mining estimates automatically include enchantments, potion effects, ground and water penalties', () => {
  const { adapter, player } = nativeMining(setup(), 3);
  player.inventory.main = [miningStack('diamond_pickaxe', 8, { efficiency: 3 })];
  assert.equal(adapter.miningEstimate(0, 2, -2).ticks, 5);
  player.hasteMultiplier = 2;
  assert.equal(adapter.miningEstimate(0, 2, -2).ticks, 3);
  player.onGround = false; player.headInWater = true;
  assert.equal(adapter.miningEstimate(0, 2, -2).ticks, 63);
});
test('automatic mining avoids weapons and almost broken tools; estimates never transfer inventory items', () => {
  const { adapter, player } = nativeMining(setup());
  player.inventory.main = [miningStack('wood_pickaxe', 2), miningStack('gun', 10000, { weapon: { ammo: 'bullet' } }),
    miningStack('diamond_pickaxe', 1000, { maxDamage: 100, damage: 99 }),
    miningStack('iron_pickaxe', 6), ...Array(5).fill(null), miningStack('external_diamond_pickaxe', 10000)];
  assert.equal(adapter.miningEstimate(0, 2, -2).slot, 4);
  assert.equal(adapter.selectMiningTool({ x: 0, y: 2, z: -2 }).name, 'iron_pickaxe');
  assert.equal(player.inventory.main[9].item.name, 'external_diamond_pickaxe');
  assert.equal(player.inventory.main[2].itemDamage, 99);
});
test('native mining ties keep the currently held tool and creative timing uses the actual engine delay', () => {
  const { adapter, player } = nativeMining(setup());
  player.inventory.main = [miningStack('pick_a', 8), miningStack('pick_b', 8)];
  adapter.selectSlot(2); assert.equal(adapter.miningEstimate(0, 2, -2).slot, 2);
  player.abilities.creative = true;
  assert.equal(adapter.miningEstimate(0, 2, -2).ticks, 4);
});
test('mining estimates fail closed for unloaded, hazardous, unbreakable or unsupported native targets', () => {
  const { adapter, world } = nativeMining(setup());
  world.cells.set('0,2,-2', 'bedrock'); assert.equal(adapter.miningEstimate(0, 2, -2), null);
  world.cells.set('0,2,-2', 'lava'); assert.equal(adapter.miningEstimate(0, 2, -2), null);
  world.loaded = false; const before = world.reads;
  assert.equal(adapter.miningEstimate(0, 2, -2), null); assert.equal(world.reads, before);
  assert.equal(adapter.selectMiningTool({ x: .1, y: 2, z: -2 }), null);
  const unsupported = setup();
  unsupported.world.getBlockState = pos => ({ block: { name: 'stone', hardness: 1 }, getCollisionBoundingBox: () => ({
    min: { x: pos.x, y: pos.y, z: pos.z }, max: { x: pos.x + 1, y: pos.y + 1, z: pos.z + 1 } }) });
  assert.equal(unsupported.adapter.miningEstimate(0, 2, -2), null);
});
test('native mining projection rejects mutation attempts instead of changing live player or inventory state', () => {
  const { adapter, player, world } = nativeMining(setup());
  player.inventory.main = [miningStack('pickaxe', 8)];
  const read = world.getBlockState.bind(world);
  world.getBlockState = pos => {
    const state = read(pos);
    state.block.getPlayerRelativeBlockHardness = function (subject) { subject.inventory.currentItem = 8; return .1; };
    return state;
  };
  assert.equal(adapter.miningEstimate(0, 2, -2), null); assert.equal(player.inventory.currentItem, 0);
});
test('native mining remains read-only in chat and refuses to acquire a different tool until gameplay resumes', () => {
  const { adapter, player, game } = nativeMining(setup());
  player.inventory.main = [miningStack('slow', 2), miningStack('fast', 8)]; game.chat = { showInput: true };
  assert.equal(adapter.miningEstimate(0, 2, -2).slot, 2);
  assert.equal(adapter.selectMiningTool({ x: 0, y: 2, z: -2 }), null);
  assert.equal(player.inventory.currentItem, 0);
  game.chat.showInput = false; assert.equal(adapter.selectMiningTool({ x: 0, y: 2, z: -2 }).slot, 2);
});
test('native mining does not fire a weapon if no usable tool can be selected', () => {
  const { adapter, player, controller } = nativeMining(setup()); target(controller);
  player.inventory.main = Array.from({ length: 9 }, () => miningStack('gun', 1000, { weapon: { ammo: 'bullet' } }));
  assert.equal(adapter.selectMiningTool({ x: 0, y: 2, z: -2 }), null);
  assert.equal(adapter.interact('mine', { x: 0, y: 2, z: -2 }).reason, 'held-item-cannot-mine');
  assert.equal(controller.punches, 0); assert.equal(controller.digTicks, 0);
});
test('switching to a better native mining tool releases the old hold before selecting', () => {
  const { adapter, player, controller } = nativeMining(setup()); target(controller);
  player.inventory.main = [miningStack('slow', 2), miningStack('fast', 8)];
  assert.equal(adapter.interact('mine', { x: 0, y: 2, z: -2 }).ok, true);
  assert.ok(controller.key.leftClick > 0);
  assert.equal(adapter.selectMiningTool({ x: 0, y: 2, z: -2 }).slot, 2);
  assert.equal(controller.key.leftClick, 0); assert.equal(controller.releases, 1);
});
