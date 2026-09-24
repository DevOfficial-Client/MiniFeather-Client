const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function namedFunction(code, name) {
  const start = code.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  const open = code.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}' && --depth === 0) return code.slice(start, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

test('ntfy reconnects gradually and skips connection attempts while offline', () => {
  const code = source('src/Core/background.js');
  const retry = vm.runInNewContext(`(${namedFunction(code, 'ntfyRetryDelay')})`);
  assert.deepEqual([0, 1, 2, 3, 6, 20].map(retry), [1500, 3000, 6000, 12000, 60000, 60000]);
  const online = vm.runInNewContext(`(${namedFunction(code, 'ntfyNetworkOnline')})`, {
    navigator: { onLine: false }
  });
  assert.equal(online(), false);
  assert.match(code, /if \(!ntfyNetworkOnline\(\)\) \{\s*notify\(\{ type: "topic-offline"/);
});

test('LocalGames socket resumes on online and backs off after repeated failures', () => {
  const code = source('src/Core/background.js');
  const sockets = [];
  const timers = new Map();
  const onlineListeners = new Set();
  let nextTimer = 1;
  let onConnect;
  class Socket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;
    constructor() { this.readyState = 0; this.handlers = {}; sockets.push(this); }
    addEventListener(type, callback) { this.handlers[type] = callback; }
    close() { this.readyState = 3; this.handlers.close?.(); }
  }
  const navigator = { onLine: false };
  const sandbox = {
    chrome: { runtime: { onConnect: { addListener: (callback) => { onConnect = callback; } } } },
    navigator, WebSocket: Socket, URLSearchParams, AbortController,
    setTimeout: (callback, delay) => {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    addEventListener: (type, callback) => { if (type === 'online') onlineListeners.add(callback); },
    removeEventListener: (type, callback) => { if (type === 'online') onlineListeners.delete(callback); }
  };
  vm.runInNewContext(code.slice(code.indexOf('const NTFY_HTTP_BASE')), sandbox);
  let onMessage;
  const notices = [];
  onConnect({
    name: 'minifeather-localgames-network',
    postMessage: (message) => notices.push(message),
    onMessage: { addListener: (callback) => { onMessage = callback; } },
    onDisconnect: { addListener: () => {} }
  });
  onMessage({ type: 'subscribe', topic: 'test-topic' });
  assert.equal(sockets.length, 0);
  assert.equal(notices.at(-1).type, 'topic-offline');
  navigator.onLine = true;
  for (const callback of [...onlineListeners]) callback();
  assert.equal(sockets.length, 1);
  sockets[0].readyState = Socket.CLOSED;
  sockets[0].handlers.close();
  assert.equal([...timers.values()].at(-1).delay, 1500);
  const [id, timer] = [...timers].at(-1);
  timers.delete(id);
  timer.callback();
  assert.equal(sockets.length, 2);
  sockets[1].readyState = Socket.CLOSED;
  sockets[1].handlers.close();
  assert.equal([...timers.values()].at(-1).delay, 3000);
});

test('old animation wrappers remain safe after modules are removed', () => {
  const vanilla = source('src/Render/VanillaAnimations.js');
  const context = vm.createContext({});
  vm.runInContext(`${namedFunction(vanilla, 'freezeJoint')}\n${namedFunction(vanilla, 'unfreezeJoint')}`, context);
  const joint = {
    rotation: { x: 1, y: 2, z: 3 },
    updateMatrixWorld() { return 'updated'; }
  };
  context.freezeJoint(joint);
  const stale = joint.updateMatrixWorld;
  assert.equal(stale.call(joint), 'updated');
  context.unfreezeJoint(joint);
  joint.rotation.x = 5;
  assert.equal(stale.call(joint), 'updated');
  assert.equal(joint.rotation.x, 5);

  const player = source('src/PlayerAnims/MF_PlayerAnims.js');
  const pa = vm.createContext({ state: { wrapped: new Set() } });
  vm.runInContext(`${namedFunction(player, 'wrapNode')}\n${namedFunction(player, 'unwrapNode')}`, pa);
  const node = {
    rotation: { x: 0, y: 0, z: 0 },
    updateMatrixWorld() { return 'node-updated'; }
  };
  pa.wrapNode(node);
  const staleNode = node.updateMatrixWorld;
  pa.unwrapNode(node);
  assert.equal(staleNode.call(node), 'node-updated');

  vm.runInContext(`${namedFunction(player, 'makeSkeletonHook')}\n${namedFunction(player, 'removeSkeletonHook')}`, pa);
  const mesh = { skeleton: { updateMatrixWorld() { return 'skeleton-updated'; } } };
  pa.makeSkeletonHook(mesh, {});
  const staleSkeleton = mesh.skeleton.updateMatrixWorld;
  pa.removeSkeletonHook(mesh);
  assert.equal(staleSkeleton.call(mesh.skeleton), 'skeleton-updated');
});

test('WebGL cleanup frees only old detached contexts without reacquiring them', () => {
  const code = source('src/Render/TextureInterceptor.js');
  const prefix = code.slice(0, code.indexOf("    var KEY = 'mf_custom_textures';")) + '\n})();';
  let lost = 0;
  class Canvas {
    constructor(connected) {
      this.isConnected = connected;
      this.calls = 0;
      this.gl = {
        isContextLost: () => false,
        getExtension: () => ({ loseContext: () => { lost++; } })
      };
    }
    getContext() { this.calls++; return this.gl; }
  }
  const window = {};
  vm.runInNewContext(prefix, {
    window,
    HTMLCanvasElement: Canvas,
    setInterval: () => 1,
    Date
  });
  const old = new Canvas(false);
  old.getContext('webgl2');
  old.__mfGLTrackedAt -= 30000;
  for (let i = 0; i < 9; i++) new Canvas(true).getContext('webgl2');
  new Canvas(true).getContext('webgl2');
  assert.equal(lost, 1);
  assert.equal(old.calls, 1);
  assert.equal(window.__MF_GL_CANVASES__.length, 10);
});
