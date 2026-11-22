const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = 'src/World/AutoReconnect.js';
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const source = read(modulePath);

function setup({ legacy = false } = {}) {
  const joins = [];
  const game = {
    serverInfo: { serverId: 'first' },
    connectingServerId: null,
    inGame() { return this.playing; },
    playing: true,
    disconnect(reason) {
      if (!legacy) return this.onSocketDisconnect(reason ?? null);
      this.playing = false;
      this.serverInfo.serverId = null;
    },
    onSocketDisconnect(reason) {
      this.playing = false;
      this.serverInfo.serverId = null;
      return reason;
    },
    cancelConnection() { return this.onSocketDisconnect(null); },
    connect(server) {
      joins.push(server);
      this.connectingServerId = server;
    }
  };
  if (legacy) delete game.onSocketDisconnect;
  const timers = new Map();
  const listeners = new Map();
  const sandbox = {
    miniblox: game,
    localStorage: { getItem() { return null; }, setItem() {} },
    document: { addEventListener(type, listener) { listeners.set(type, listener); } },
    console: { info() {}, warn() {} },
    setInterval(callback) { sandbox.tick = callback; },
    setTimeout(callback) {
      const timer = Symbol();
      timers.set(timer, callback);
      return timer;
    },
    clearTimeout(timer) { timers.delete(timer); }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  sandbox.tick();
  return {
    game, joins, timers, api: sandbox.MF_AutoReconnect,
    tick: () => sandbox.tick(),
    flush() {
      for (const [timer, callback] of timers) {
        timers.delete(timer);
        callback();
      }
    },
    enter(server) {
      game.connectingServerId = null;
      game.serverInfo.serverId = server;
      game.playing = true;
      sandbox.tick();
    },
    configure(enabled) {
      listeners.get('minifeather:auto-reconnect-config')({ detail: JSON.stringify({ enabled }) });
    }
  };
}

test('the native Leave Game action calls disconnect without a reason and stays in the menu', () => {
  const h = setup();
  assert.equal(h.game.disconnect(), null);
  h.tick();
  assert.equal(h.timers.size, 0);
  assert.equal(h.api.status.manualExitActive, true);
  assert.deepEqual(h.joins, []);
});

test('a kick, transport failure, or server socket close reconnects once to the last server', () => {
  const scenarios = [
    game => game.disconnect('Kicked from the server'),
    game => game.disconnect('Connection to the server was lost\nReason: ping timeout'),
    game => game.onSocketDisconnect(null)
  ];
  for (const disconnect of scenarios) {
    const h = setup();
    disconnect(h.game);
    h.tick();
    h.tick();
    assert.equal(h.timers.size, 1);
    h.flush();
    h.tick();
    assert.deepEqual(h.joins, ['first']);
    assert.equal(h.timers.size, 0);
  }
});

test('a manual exit or cancel discards an already queued reconnect', () => {
  for (const exit of [game => game.disconnect('io client disconnect'), game => game.cancelConnection()]) {
    const h = setup();
    h.game.disconnect('transport close');
    h.tick();
    assert.equal(h.timers.size, 1);
    exit(h.game);
    h.flush();
    assert.deepEqual(h.joins, []);
  }
});

test('a manual join cancels the previous reconnect and resets the exit decision for the new world', () => {
  const h = setup();
  h.game.disconnect('transport close');
  h.tick();
  assert.equal(h.timers.size, 1);
  h.game.connect('second');
  h.flush();
  h.enter('second');
  h.game.disconnect();
  h.tick();
  assert.equal(h.timers.size, 0);
  h.game.connect('third');
  h.enter('third');
  h.game.disconnect('transport close');
  h.tick();
  h.flush();
  assert.deepEqual(h.joins, ['second', 'third', 'third']);
});

test('a bare transition to the menu does not count as a network disconnect', () => {
  const h = setup();
  h.game.playing = false;
  h.game.serverInfo.serverId = null;
  h.tick();
  assert.equal(h.timers.size, 0);
});

test('turning the module off discards the pending attempt, even when turned back on immediately', () => {
  const h = setup();
  h.game.disconnect('transport close');
  h.tick();
  h.configure(false);
  h.api.toggle(true);
  h.flush();
  assert.deepEqual(h.joins, []);
});

test('a forced disconnect reason is supported on a game without the socket cleanup hook', () => {
  const h = setup({ legacy: true });
  h.game.disconnect('transport close');
  h.tick();
  h.flush();
  assert.deepEqual(h.joins, ['first']);
});

test('a cached remote copy cannot replace the bundled reconnect fix', () => {
  const overrides = { v: 1, files: {
    [modulePath]: 'window.__MF_AUTO_RECONNECT__ = true;'
  } };
  const sandbox = {
    __MF_MIRROR__: { v: 1, ok: {}, lists: { mainStart: [modulePath] }, code: { [modulePath]: source } },
    console: { log() {}, warn() {} },
    localStorage: { getItem(key) { return key === 'mf:mirror:overrides:v1' ? JSON.stringify(overrides) : null; } },
    addEventListener() {},
    setInterval() {},
    setTimeout() {},
    document: {
      querySelector() { return null; },
      addEventListener() {},
      createElement() { return { remove() {} }; },
      head: { appendChild(element) { vm.runInContext(element.textContent, context); } }
    }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(read('src/Core/MirrorRunner.js'), context);
  assert.equal(sandbox.__MF_AUTO_RECONNECT__, 2);
});
