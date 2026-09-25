const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../src/World/IdlePlayerBot.js'), 'utf8');
const panelSource = fs.readFileSync(path.join(__dirname, '../src/UI/ClientPanel.js'), 'utf8');
const translationsSource = fs.readFileSync(path.join(__dirname, '../src/I18n/Translations.js'), 'utf8');

test('right-click settings expose a saved 1–10 bot count in every language', () => {
  assert.match(panelSource, /idlePlayerCount: 1/);
  assert.match(panelSource, /idlePlayerBotToggle\?\.addEventListener\('contextmenu'/);
  assert.match(panelSource, /data-idlebot-count type="range" min="1" max="10"/);
  assert.match(panelSource, /sendIdlePlayerBotCommand\('sync'\)/);
  assert.equal([...translationsSource.matchAll(/"idlePlayerCount":/g)].length, 10);
  assert.equal([...translationsSource.matchAll(/"idlePlayerCountHint":/g)].length, 10);
  assert.equal([...translationsSource.matchAll(/"idlePlayerStatusRetrying":/g)].length, 10);
});

test('idle player creates independent server-visible sessions with unique guest names', async () => {
  const sockets = [];
  const events = [];
  class Socket {
    static OPEN = 1;
    static CLOSING = 2;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.handlers = {};
      sockets.push(this);
    }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    close() { this.readyState = 3; }
    send() {}
  }
  const document = {
    documentElement: { lang: 'en' },
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: (event) => events.push(event)
  };
  const window = {
    setTimeout: () => 1,
    setInterval: () => 2
  };
  class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  }
  const sandbox = {
    window, document, CustomEvent, WebSocket: Socket,
    crypto: webcrypto, TextEncoder, TextDecoder, URL,
    location: {
      origin: 'https://miniblox.online',
      href: 'https://miniblox.online/?connect=test-server',
      pathname: '/'
    },
    navigator: { language: 'en' },
    fetch: async () => { throw new Error('offline test'); },
    clearTimeout: () => {}, clearInterval: () => {},
    console: { warn: () => {} }
  };
  vm.runInNewContext(source, sandbox);
  const api = sandbox.MF_IDLE_PLAYER_BOT;
  assert.equal(api.multiBotVersion, 3);

  for (let i = 0; i < 10; i++) await api.connect('current');
  const status = api.status();
  assert.equal(status.bots.length, 10);
  assert.equal(sockets.length, 10);
  assert.equal(new Set(status.bots.map(bot => bot.requestedUuid)).size, 10);
  assert.ok(status.bots.every(bot => bot.requestedUuid.startsWith('ShyLeopard.')));
  assert.ok(sockets.every(socket => socket.url.includes('test-server.servers.')));

  await api.connect('current');
  assert.equal(api.status().bots.length, 10);
  assert.equal(sockets.length, 10);
  assert.match(api.status().error, /Maximum 10 bots/);

  api.disconnect(status.bots[1].id);
  assert.equal(api.status().bots.length, 9);
  assert.equal(sockets[1].readyState, 3);
  await api.connect('current');
  assert.equal(api.status().bots.length, 10);
  assert.equal(sockets.length, 11);
  assert.equal(new Set(api.status().bots.map(bot => bot.requestedUuid)).size, 10);

  await api.syncCount(3, 'current');
  assert.equal(api.status().bots.length, 3);
  await api.syncCount(6, 'current');
  assert.equal(api.status().bots.length, 6);
  await api.syncCount(20, 'current');
  assert.equal(api.status().bots.length, 10);

  api.disconnect();
  assert.equal(api.status().bots.length, 0);
  assert.ok(sockets.every(socket => socket.readyState === 3));
  assert.ok(events.some(event => event.type === 'minifeather:idle-player-state'));
});

test('a failed bot retries twice, then stops without affecting another bot', async () => {
  const sockets = [];
  const timers = new Map();
  let nextTimer = 1;
  class Socket {
    static OPEN = 1;
    static CLOSING = 2;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.handlers = {};
      sockets.push(this);
    }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    close() { this.readyState = 3; }
    send() {}
  }
  const document = {
    documentElement: { lang: 'en' },
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {}
  };
  const window = {
    setTimeout(fn, delay) {
      const id = nextTimer++;
      timers.set(id, { fn, delay });
      return id;
    },
    setInterval: () => nextTimer++
  };
  class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  }
  const sandbox = {
    window, document, CustomEvent, WebSocket: Socket,
    crypto: webcrypto, TextEncoder, TextDecoder, URL,
    location: {
      origin: 'https://miniblox.online',
      href: 'https://miniblox.online/?connect=test-server',
      pathname: '/'
    },
    navigator: { language: 'en' },
    fetch: async () => { throw new Error('offline test'); },
    clearTimeout: id => timers.delete(id),
    clearInterval: () => {},
    console: { warn: () => {} }
  };
  vm.runInNewContext(source, sandbox);
  const api = sandbox.MF_IDLE_PLAYER_BOT;
  await api.connect('current');
  await api.connect('current');
  assert.equal(sockets.length, 2);
  const unaffectedId = api.status().bots[1].id;
  let failingSocket = sockets[0];

  for (let attempt = 1; attempt <= 2; attempt++) {
    failingSocket.handlers.error();
    failingSocket.handlers.error();
    const failing = api.status().bots[0];
    assert.equal(failing.phase, 'retrying');
    assert.equal(failing.retryCount, attempt);
    const timer = [...timers].find(([, value]) => value.delay === attempt * 1000);
    assert.ok(timer, `retry ${attempt} was not scheduled`);
    timers.delete(timer[0]);
    await timer[1].fn();
    assert.equal(sockets.length, attempt + 2);
    failingSocket = sockets.at(-1);
  }

  failingSocket.handlers.error();
  assert.equal(api.status().bots[0].phase, 'error');
  assert.equal(api.status().bots[0].retryCount, 2);
  assert.equal(api.status().bots[1].id, unaffectedId);
  assert.equal(sockets[1].readyState, 0);
  assert.equal(sockets.length, 4);
  api.disconnect();
});
