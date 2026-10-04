// remote moderation: MF_Moderation (verdict + screens), the gates on
// MirrorRunner, and its presence in mirror.json/hotload.json.
// run: node tests/moderation.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const MOD_SRC = fs.readFileSync(path.join(ROOT, 'src', 'Core', 'MF_Moderation.js'), 'utf8');
const RUNNER_SRC = fs.readFileSync(path.join(ROOT, 'src', 'Core', 'MirrorRunner.js'), 'utf8');

const CFG_KEY = 'mf:moderation:v1';
const BAN_KEY = 'mf:moderation:ban:v1';
const BRICK_KEY = 'mf:moderation:brick:v1';

const tick = (n = 6) => new Promise(r => setTimeout(r, n));

function makeSandbox({ ls = {}, fetchImpl = null, mirrorRunnerMode = false } = {}) {
  // seeded values get stringified: JSON.parse over a raw object would hand
  // back "[object Object]" and the cache would look empty
  const store = new Map(Object.entries(ls).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  const appended = [];   // everything attached to the fake dom (screens, toasts, scripts)
  const docListeners = {};
  const winListeners = {};

  function makeElement(tag) {
    const el = {
      tagName: tag,
      id: '',
      style: { cssText: '' },
      _html: '',
      textContent: '',
      removed: false,
      set innerHTML(v) { this._html = String(v); },
      get innerHTML() { return this._html; },
      querySelector() { return { textContent: '' }; },
      appendChild() {},
      remove() { this.removed = true; },
      setAttribute() {}
    };
    return el;
  }

  const documentElement = { appendChild(child) { appended.push(child); } };
  const document = {
    documentElement,
    body: null,
    head: null,
    readyState: 'complete',
    getElementById(id) { return appended.find(e => e.id === id && !e.removed) || null; },
    createElement(tag) { return makeElement(tag); },
    addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener() {},
    dispatchEvent(evt) {
      for (const fn of docListeners[evt.type] || []) fn(evt);
      return true;
    }
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    navigator: { language: 'es' },
    document,
    location: { reload() { sandbox.reloads = (sandbox.reloads || 0) + 1; } },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      key: i => Array.from(store.keys())[i] || null,
      get length() { return store.size; }
    },
    fetch: fetchImpl || (() => Promise.reject(new Error('offline'))),
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    reloads: 0,
    appended
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); };
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = (evt) => { for (const fn of winListeners[evt.type] || []) fn(evt); return true; };
  if (mirrorRunnerMode) sandbox.__MF_MIRROR_RUNNER__ = true;
  vm.createContext(sandbox);
  return { sandbox, store, docListeners, appended };
}

function runMod(sandbox) {
  return vm.runInContext(MOD_SRC, sandbox, { filename: 'src/Core/MF_Moderation.js' });
}

const cfgOf = (cfg, hash) => JSON.stringify({ v: 1, ts: 0, hash: hash || 'seed', cfg });

test('cached kill switch → full lock from boot (and no reload loop)', async () => {
  const cached = { killSwitch: { active: true, reason: 'mantenimiento' }, bannedAccounts: [], blockedModules: {} };
  const { sandbox, store, appended } = makeSandbox({
    ls: { [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached } }
  });
  assert.throws(() => runMod(sandbox), /client disabled/, 'mobile: the throw cuts docStart');
  const api = sandbox.__MF_MODERATION__;
  assert.ok(api, 'api exposed');
  assert.equal(api.locked, true);
  assert.equal(api.kind, 'kill');
  assert.equal(api.reason, 'mantenimiento');
  assert.ok(appended.find(e => e.id === 'mf-moderation-lock'), 'overlay created');
  await tick(); // boot fetch
  assert.equal(sandbox.reloads, 0, 'kill already known: no reload loop');
  assert.ok(store.has(CFG_KEY), 'cache intact');
});

test('no lock + isBlocked: fine-grained block by path', async () => {
  const cached = { killSwitch: { active: false, reason: '' }, bannedAccounts: [], blockedModules: { 'src/Render/TaczGuns.js': 'bug grave' } };
  const { sandbox } = makeSandbox({
    ls: { [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached } },
    mirrorRunnerMode: true
  });
  runMod(sandbox);
  const api = sandbox.__MF_MODERATION__;
  assert.equal(api.locked, false);
  assert.equal(api.isBlocked('src/Render/TaczGuns.js'), true);
  assert.equal(api.isBlocked('src/Render/Zoom.js'), false);
  assert.equal(api.blockReason('src/Render/TaczGuns.js'), 'bug grave');
});

test('ban by name via identity event (case-insensitive)', async () => {
  const cached = { killSwitch: { active: false, reason: '' }, bannedAccounts: [{ name: 'griefer', reason: 'spam' }], blockedModules: {} };
  const { sandbox, store } = makeSandbox({
    ls: { [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached } },
    mirrorRunnerMode: true
  });
  runMod(sandbox);
  const api = sandbox.__MF_MODERATION__;
  assert.equal(api.locked, false, 'boots free until it knows who you are');
  sandbox.document.dispatchEvent({ type: 'minifeather:client-chat-identity', detail: JSON.stringify({ username: 'Griefer', uuid: '' }) });
  await tick();
  assert.equal(api.locked, true);
  assert.equal(api.kind, 'ban');
  assert.equal(api.reason, 'spam');
  const verdict = JSON.parse(store.get(BAN_KEY));
  assert.equal(verdict.name, 'griefer');
  assert.ok(sandbox.reloads >= 1, 'reload for a boot that is born locked');
});

test('fetch applies a fresh kill switch → enforce + reload', async () => {
  const remote = { v: 1, killSwitch: { active: true, reason: 'apagón' }, bannedAccounts: [], blockedModules: {} };
  const { sandbox } = makeSandbox({
    fetchImpl: () => Promise.resolve({ ok: true, json: async () => remote })
  });
  runMod(sandbox);
  await tick();
  const api = sandbox.__MF_MODERATION__;
  assert.equal(api.locked, true, 'hot lock');
  assert.equal(api.kind, 'kill');
  assert.ok(sandbox.reloads >= 1, 'reload for a clean boot');
});

test('unban: verdict out + known identity + config without ban → restored', async () => {
  const cached = { killSwitch: { active: false, reason: '' }, bannedAccounts: [{ name: 'griefer', reason: 'spam' }], blockedModules: {} };
  const oldRemote = { v: 1, killSwitch: { active: false, reason: '' }, bannedAccounts: [{ name: 'griefer', reason: 'spam' }], blockedModules: {} };
  const newRemote = { v: 1, killSwitch: { active: false, reason: '' }, bannedAccounts: [], blockedModules: {} };
  let calls = 0;
  const { sandbox, store } = makeSandbox({
    ls: {
      [BAN_KEY]: { uuid: '', name: 'griefer', reason: 'spam', ts: 0 },
      [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached }
    },
    // first fetch (boot): the ban is still on the server. refresh(): gone.
    fetchImpl: () => Promise.resolve({ ok: true, json: async () => (++calls === 1 ? oldRemote : newRemote) }),
    mirrorRunnerMode: true
  });
  runMod(sandbox);
  const api = sandbox.__MF_MODERATION__;
  assert.equal(api.locked, true, 'the verdict rules until something better arrives');
  sandbox.document.dispatchEvent({ type: 'minifeather:client-chat-identity', detail: JSON.stringify({ username: 'Griefer', uuid: '' }) });
  await tick();
  assert.equal(api.locked, true, 'identity alone unbans nobody: the server still has the account');
  api.refresh();
  await tick();
  assert.equal(api.locked, false, 'unbanned');
  assert.equal(store.has(BAN_KEY), false, 'verdict cleaned up');
  assert.ok(sandbox.reloads >= 1, 'reload to restore the client');
});

test('normalization: garbage out, weird paths out', async () => {
  const remote = {
    v: 1,
    killSwitch: { active: false },
    bannedAccounts: [{ reason: 'sin id' }, { name: '' }, { uuid: 'not-a-uuid' }],
    blockedModules: { '../../evil.js': 'x', 'src/../../evil.js': 'x', 'src/../evil.js': 'x', 'src/Ok.js': 'y' }
  };
  const { sandbox } = makeSandbox({
    fetchImpl: () => Promise.resolve({ ok: true, json: async () => remote })
  });
  runMod(sandbox);
  await tick();
  const api = sandbox.__MF_MODERATION__;
  assert.equal(api.isBlocked('../../evil.js'), false);
  assert.equal(api.isBlocked('src/../../evil.js'), false, 'traversals out even when wearing a src/ costume');
  assert.equal(api.isBlocked('src/../evil.js'), false);
  assert.equal(api.isBlocked('src/Ok.js'), true);
});

test('invalid config → ignored, fail-open', async () => {
  const { sandbox, store } = makeSandbox({
    fetchImpl: () => Promise.resolve({ ok: true, json: async () => ({ v: 99, nota: 'no me mires' }) })
  });
  runMod(sandbox);
  await tick();
  assert.equal(sandbox.__MF_MODERATION__.locked, false);
  assert.equal(store.has(CFG_KEY), false, 'garbage never gets cached');
});

test('MirrorRunner: locked injects nothing; unlocked, everything', () => {
  const codeA = 'window.A=1;', codeB = 'window.B=1;';
  const mirror = {
    v: 1,
    lists: { mainStart: ['src/A.js', 'src/B.js'], isoStart: [], isoEnd: [] },
    ok: {},
    code: { 'src/A.js': codeA, 'src/B.js': codeB }
  };
  const cached = { killSwitch: { active: true, reason: '' }, bannedAccounts: [], blockedModules: {} };
  // no runner flag: MF_Moderation runs in mobile mode (locked → throws, but
  // the verdict is already out). the __MF_MIRROR_RUNNER__ flag is set by the
  // runner itself on startup; seeding it by hand would make MirrorRunner
  // bail out early.
  const locked = makeSandbox({ ls: { [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached } } });
  locked.sandbox.__MF_MIRROR__ = mirror;
  assert.throws(() => runMod(locked.sandbox), /client disabled/);
  vm.runInContext(RUNNER_SRC, locked.sandbox, { filename: 'src/Core/MirrorRunner.js' });
  const scripts = locked.appended.filter(e => e.tagName === 'script');
  assert.equal(scripts.length, 0, 'locked: zero modules');

  const free = makeSandbox({});
  free.sandbox.__MF_MIRROR__ = mirror;
  runMod(free.sandbox);
  vm.runInContext(RUNNER_SRC, free.sandbox, { filename: 'src/Core/MirrorRunner.js' });
  const scripts2 = free.appended.filter(e => e.tagName === 'script');
  assert.equal(scripts2.length, 2, 'free: both modules');
  assert.match(scripts2[0].textContent, /window\.A=1/);
});

test('the gates exist and consult the verdict per path (MirrorRunner + HotLoader)', () => {
  assert.match(RUNNER_SRC, /__MF_MODERATION__/);
  assert.match(RUNNER_SRC, /isBlocked\(p\)/);
  assert.match(RUNNER_SRC, /moderation\.locked/);
  const hot = fs.readFileSync(path.join(ROOT, 'src', 'Core', 'HotLoader.js'), 'utf8');
  assert.match(hot, /__MF_MODERATION__/, 'HotLoader also consults the verdict');
});

test('moderation.json valid and MF_Moderation is mirror module 0', () => {
  const mod = JSON.parse(fs.readFileSync(path.join(ROOT, 'moderation.json'), 'utf8'));
  assert.equal(mod.v, 1);
  assert.equal(mod.killSwitch.active, false, 'the factory config turns nobody off');
  assert.deepEqual(mod.bannedAccounts, []);
  assert.deepEqual(mod.brickedAccounts, []);
  assert.deepEqual(mod.blockedModules, {});
  const mirror = JSON.parse(fs.readFileSync(path.join(ROOT, 'mirror.json'), 'utf8'));
  assert.equal(mirror.mainStart[0], 'src/Core/MF_Moderation.js', 'first of mainStart: its verdict rules over the rest');
  const hot = JSON.parse(fs.readFileSync(path.join(ROOT, 'hotload.json'), 'utf8'));
  const entry = (hot.hot || []).find(e => e.path === 'src/Core/MF_Moderation.js');
  assert.ok(entry, 'present in hotload.json');
  assert.deepEqual(entry.ok, ['__MF_MODERATION']);
});

test('brick by uuid via identity → blue screen, verdict and reload', async () => {
  const cached = {
    killSwitch: { active: false, reason: '', screen: 'overlay' },
    bannedAccounts: [],
    brickedAccounts: [{ uuid: 'aabbccdd-1111-2222-3333-445566778899', reason: 'cheater' }],
    blockedModules: {}
  };
  const { sandbox, store, appended } = makeSandbox({
    ls: { [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached } },
    mirrorRunnerMode: true
  });
  runMod(sandbox);
  const api = sandbox.__MF_MODERATION__;
  assert.equal(api.locked, false, 'free until it knows who you are');
  sandbox.document.dispatchEvent({
    type: 'minifeather:client-chat-identity',
    detail: JSON.stringify({ username: 'RandomDude', uuid: 'AABBCCDD-1111-2222-3333-445566778899' })
  });
  await tick();
  assert.equal(api.locked, true);
  assert.equal(api.kind, 'brick');
  assert.equal(api.reason, 'cheater');
  const bsod = appended.find(e => e.id === 'mf-moderation-bsod');
  assert.ok(bsod, 'bsod created');
  assert.match(bsod.innerHTML, /:\(/, 'the windows-style :( face');
  assert.match(bsod.innerHTML, /MF_CLIENTE_LADRILLO/, 'brick stop code');
  assert.ok(!appended.find(e => e.id === 'mf-moderation-lock'), 'classic overlay out: brick goes blue');
  const verdict = JSON.parse(store.get(BRICK_KEY));
  assert.equal(verdict.uuid, 'aabbccdd-1111-2222-3333-445566778899');
  assert.ok(sandbox.reloads >= 1, 'reload for a boot that is born bricked');
});

test('brick with wipe: clears mf:* and respects mf:moderation:*', async () => {
  const cached = {
    killSwitch: { active: false, reason: '', screen: 'overlay' },
    bannedAccounts: [],
    brickedAccounts: [{ name: 'wiper', wipe: true }],
    blockedModules: {}
  };
  const { sandbox, store } = makeSandbox({
    ls: {
      'mf:pageZoom': '1.5',
      'mf:hot:v1': '{"v":1}',
      'otra-cosa': 'not the client\'s, it stays',
      [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached }
    },
    mirrorRunnerMode: true
  });
  runMod(sandbox);
  sandbox.document.dispatchEvent({
    type: 'minifeather:client-chat-identity',
    detail: JSON.stringify({ username: 'wiper', uuid: '' })
  });
  await tick();
  const api = sandbox.__MF_MODERATION__;
  assert.equal(api.kind, 'brick');
  assert.equal(store.has('mf:pageZoom'), false, 'client settings gone');
  assert.equal(store.has('mf:hot:v1'), false, 'hotload cache gone');
  assert.equal(store.has('otra-cosa'), true, 'whatever is not the client\'s, untouched');
  assert.equal(store.has(CFG_KEY), true, 'the moderation config stays');
  const verdict = JSON.parse(store.get(BRICK_KEY));
  assert.equal(verdict.wiped, true, 'wipe flagged so it never runs twice');
});

test('unbrick: like the unban, the remote config rules', async () => {
  const cached = {
    killSwitch: { active: false, reason: '', screen: 'overlay' },
    bannedAccounts: [],
    brickedAccounts: [{ name: 'brickman', reason: 'x' }],
    blockedModules: {}
  };
  const oldRemote = { v: 1, killSwitch: { active: false, reason: '', screen: 'overlay' }, bannedAccounts: [], brickedAccounts: [{ name: 'brickman', reason: 'x' }], blockedModules: {} };
  const newRemote = { v: 1, killSwitch: { active: false, reason: '', screen: 'overlay' }, bannedAccounts: [], brickedAccounts: [], blockedModules: {} };
  let calls = 0;
  const { sandbox, store } = makeSandbox({
    ls: {
      [BRICK_KEY]: { uuid: '', name: 'brickman', reason: 'x', ts: 0, wiped: true },
      [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached }
    },
    fetchImpl: () => Promise.resolve({ ok: true, json: async () => (++calls === 1 ? oldRemote : newRemote) }),
    mirrorRunnerMode: true
  });
  runMod(sandbox);
  const api = sandbox.__MF_MODERATION__;
  assert.equal(api.locked, true, 'the verdict rules');
  sandbox.document.dispatchEvent({ type: 'minifeather:client-chat-identity', detail: JSON.stringify({ username: 'brickman', uuid: '' }) });
  await tick();
  assert.equal(api.locked, true, 'the server still has the account bricked');
  api.refresh();
  await tick();
  assert.equal(api.locked, false, 'unbricked');
  assert.equal(store.has(BRICK_KEY), false, 'verdict cleaned up');
  assert.ok(sandbox.reloads >= 1, 'reload to restore');
});

test('kill switch with screen bsod → blue screen instead of overlay', () => {
  const cached = {
    killSwitch: { active: true, reason: 'apagón', screen: 'bsod' },
    bannedAccounts: [],
    brickedAccounts: [],
    blockedModules: {}
  };
  const { sandbox, appended } = makeSandbox({
    ls: { [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached } }
  });
  assert.throws(() => runMod(sandbox), /client disabled/);
  const bsod = appended.find(e => e.id === 'mf-moderation-bsod');
  assert.ok(bsod, 'bsod created');
  assert.match(bsod.innerHTML, /MF_CLIENTE_DESHABILITADO/, 'kill stop code');
  assert.ok(!appended.find(e => e.id === 'mf-moderation-lock'), 'classic overlay out');
  assert.equal(sandbox.__MF_MODERATION__.kind, 'kill');
});

test('CLI moderation: show works', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'moderation.mjs'), 'show'], { encoding: 'utf8' });
  assert.match(out, /kill switch/);
  assert.match(out, /baneados/);
});
