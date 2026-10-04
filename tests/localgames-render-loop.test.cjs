const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src/World/LocalGames.js'), 'utf8');
const start = source.indexOf('  function installRenderLoopWatchdog() {');
const end = source.indexOf('  function restoreProviderGuard() {', start);
assert.ok(start >= 0 && end > start);
const watchdogSource = source.slice(start, end);

function makeHarness() {
  let now = 10000;
  let interval;
  const frames = [];
  let updates = 0;
  let sceneRepairs = 0;
  const game = {
    lastRenderTime: 9900,
    renderLoopErrored: false,
    update() { updates++; }
  };
  const state = {
    active: true,
    directLocal: true,
    game,
    renderLoopStartedAt: 0,
    renderWatchdogGeneration: 0,
    renderWatchdogProbePending: false,
    renderWatchdogStalls: 0,
    renderWatchdogStalledAt: 0
  };
  const sandbox = {
    state, document: { hidden: false },
    performance: { now: () => now },
    setInterval: callback => { interval = callback; return 1; },
    clearInterval: () => { interval = null; },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    repairGameSceneTick() { sceneRepairs++; }, ensureNativeSceneRoots() {},
    synchronizeLocalCamera() {}, patchGameSceneUpdateForLocal() {},
    logWarn() {}, logError() {}
  };
  vm.runInNewContext(`${watchdogSource}\nthis.install = installRenderLoopWatchdog; this.clear = clearRenderLoopWatchdog;`, sandbox);
  return {
    state, game, sandbox,
    tick: () => interval?.(),
    frame: () => frames.shift()?.(),
    pendingFrames: () => frames.length,
    updates: () => updates,
    sceneRepairs: () => sceneRepairs,
    setNow: value => { now = value; }
  };
}

test('watchdog never starts a second loop just because an error flag is set', () => {
  const h = makeHarness();
  h.sandbox.install();
  h.game.renderLoopErrored = true;
  h.tick();
  assert.equal(h.updates(), 0);
  assert.equal(h.pendingFrames(), 0);
  assert.equal(h.game.renderLoopErrored, false);
});

test('watchdog waits for two frames and leaves a recovering native loop alone', () => {
  const h = makeHarness();
  h.sandbox.install();
  h.game.lastRenderTime = 1000;
  h.tick();
  assert.equal(h.pendingFrames(), 1);
  h.frame();
  h.game.lastRenderTime = 10010;
  h.setNow(10020);
  h.frame();
  assert.equal(h.updates(), 0);
  assert.equal(h.state.renderWatchdogStalls, 0);
});

test('watchdog repairs a stalled scene without launching another game loop', () => {
  const h = makeHarness();
  h.sandbox.install();
  h.game.lastRenderTime = 1000;
  h.tick();
  h.frame();
  h.frame();
  assert.equal(h.updates(), 0);
  assert.equal(h.sceneRepairs(), 1);
  assert.equal(h.state.renderWatchdogStalls, 1);
});

test('watchdog does not restart a world after it has been stopped', () => {
  const h = makeHarness();
  h.sandbox.install();
  h.game.lastRenderTime = 1000;
  h.tick();
  h.frame();
  h.sandbox.clear();
  h.frame();
  assert.equal(h.updates(), 0);
  assert.equal(h.sceneRepairs(), 0);
  assert.equal(h.state.renderWatchdogStalls, 0);
});

test('local world starts the native loop only after a non-game state', () => {
  assert.match(source, /if \(state\.localGameStateBefore < 5\) \{[\s\S]{0,250}game\.update\?\.\(\)/);
  assert.doesNotMatch(source, /const renderLoopAlive\s*=/);
  assert.doesNotMatch(watchdogSource, /game\.update\?\.\(\)/);
});
