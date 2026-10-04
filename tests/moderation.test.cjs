// moderación remota: MF_Moderation (veredicto+overlay), gating en MirrorRunner
// y presencia en mirror.json/hotload.json. run: node tests/moderation.test.cjs
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

const tick = (n = 6) => new Promise(r => setTimeout(r, n));

function makeSandbox({ ls = {}, fetchImpl = null, mirrorRunnerMode = false } = {}) {
  // los valores se siembran stringificados: JSON.parse de un objeto crudo
  // devolvería "[object Object]" y el cache parecería vacío
  const store = new Map(Object.entries(ls).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  const appended = [];   // todo lo que se cuelga del DOM (overlay, toasts, scripts)
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
      removeItem: k => store.delete(k)
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

test('kill switch en cache → lock total desde el boot (y sin reload en bucle)', async () => {
  const cached = { killSwitch: { active: true, reason: 'mantenimiento' }, bannedAccounts: [], blockedModules: {} };
  const { sandbox, store, appended } = makeSandbox({
    ls: { [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached } }
  });
  assert.throws(() => runMod(sandbox), /cliente deshabilitado/, 'mobile: el throw corta el docStart');
  const api = sandbox.__MF_MODERATION__;
  assert.ok(api, 'api expuesta');
  assert.equal(api.locked, true);
  assert.equal(api.kind, 'kill');
  assert.equal(api.reason, 'mantenimiento');
  assert.ok(appended.find(e => e.id === 'mf-moderation-lock'), 'overlay creado');
  await tick(); // boot fetch
  assert.equal(sandbox.reloads, 0, 'kill ya conocido: nada de reloads en bucle');
  assert.ok(store.has(CFG_KEY), 'cache intacta');
});

test('sin lock + isBlocked: bloqueo fino por path', async () => {
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

test('ban por nombre vía evento de identidad (case-insensitive)', async () => {
  const cached = { killSwitch: { active: false, reason: '' }, bannedAccounts: [{ name: 'griefer', reason: 'spam' }], blockedModules: {} };
  const { sandbox, store } = makeSandbox({
    ls: { [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached } },
    mirrorRunnerMode: true
  });
  runMod(sandbox);
  const api = sandbox.__MF_MODERATION__;
  assert.equal(api.locked, false, 'arranca libre hasta saber quién es');
  sandbox.document.dispatchEvent({ type: 'minifeather:client-chat-identity', detail: JSON.stringify({ username: 'Griefer', uuid: '' }) });
  await tick();
  assert.equal(api.locked, true);
  assert.equal(api.kind, 'ban');
  assert.equal(api.reason, 'spam');
  const verdict = JSON.parse(store.get(BAN_KEY));
  assert.equal(verdict.name, 'griefer');
  assert.ok(sandbox.reloads >= 1, 'reload para un boot que ya nace bloqueado');
});

test('fetch aplica kill switch nuevo → enforce + reload', async () => {
  const remote = { v: 1, killSwitch: { active: true, reason: 'apagón' }, bannedAccounts: [], blockedModules: {} };
  const { sandbox } = makeSandbox({
    fetchImpl: () => Promise.resolve({ ok: true, json: async () => remote })
  });
  runMod(sandbox);
  await tick();
  const api = sandbox.__MF_MODERATION__;
  assert.equal(api.locked, true, 'lock en caliente');
  assert.equal(api.kind, 'kill');
  assert.ok(sandbox.reloads >= 1, 'reload para boot limpio');
});

test('desban: veredicto fuera + identidad conocida + config sin ban → se restaura', async () => {
  const cached = { killSwitch: { active: false, reason: '' }, bannedAccounts: [{ name: 'griefer', reason: 'spam' }], blockedModules: {} };
  const oldRemote = { v: 1, killSwitch: { active: false, reason: '' }, bannedAccounts: [{ name: 'griefer', reason: 'spam' }], blockedModules: {} };
  const newRemote = { v: 1, killSwitch: { active: false, reason: '' }, bannedAccounts: [], blockedModules: {} };
  let calls = 0;
  const { sandbox, store } = makeSandbox({
    ls: {
      [BAN_KEY]: { uuid: '', name: 'griefer', reason: 'spam', ts: 0 },
      [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached }
    },
    // primer fetch (boot): el ban sigue en el server. refresh(): ya lo quitaron.
    fetchImpl: () => Promise.resolve({ ok: true, json: async () => (++calls === 1 ? oldRemote : newRemote) }),
    mirrorRunnerMode: true
  });
  runMod(sandbox);
  const api = sandbox.__MF_MODERATION__;
  assert.equal(api.locked, true, 'el veredicto manda mientras no llegue nada mejor');
  sandbox.document.dispatchEvent({ type: 'minifeather:client-chat-identity', detail: JSON.stringify({ username: 'Griefer', uuid: '' }) });
  await tick();
  assert.equal(api.locked, true, 'la identidad sola no desbanea: el server aún me tiene');
  api.refresh();
  await tick();
  assert.equal(api.locked, false, 'desbaneado');
  assert.equal(store.has(BAN_KEY), false, 'veredicto limpiado');
  assert.ok(sandbox.reloads >= 1, 'reload para restaurar el client');
});

test('normalización: basura fuera, paths raros fuera', async () => {
  const remote = {
    v: 1,
    killSwitch: { active: false },
    bannedAccounts: [{ reason: 'sin id' }, { name: '' }, { uuid: 'not-a-uuid' }],
    blockedModules: { '../../evil.js': 'x', 'src/Ok.js': 'y' }
  };
  const { sandbox } = makeSandbox({
    fetchImpl: () => Promise.resolve({ ok: true, json: async () => remote })
  });
  runMod(sandbox);
  await tick();
  const api = sandbox.__MF_MODERATION__;
  assert.equal(api.isBlocked('../../evil.js'), false);
  assert.equal(api.isBlocked('src/Ok.js'), true);
});

test('config inválida → ignorada, fail-open', async () => {
  const { sandbox, store } = makeSandbox({
    fetchImpl: () => Promise.resolve({ ok: true, json: async () => ({ v: 99, nota: 'no me mires' }) })
  });
  runMod(sandbox);
  await tick();
  assert.equal(sandbox.__MF_MODERATION__.locked, false);
  assert.equal(store.has(CFG_KEY), false, 'no se cachea basura');
});

test('MirrorRunner: con lock no inyecta nada; sin lock, todo', () => {
  const codeA = 'window.A=1;', codeB = 'window.B=1;';
  const mirror = {
    v: 1,
    lists: { mainStart: ['src/A.js', 'src/B.js'], isoStart: [], isoEnd: [] },
    ok: {},
    code: { 'src/A.js': codeA, 'src/B.js': codeB }
  };
  const cached = { killSwitch: { active: true, reason: '' }, bannedAccounts: [], blockedModules: {} };
  // sin flag de runner: MF_Moderation corre en modo móvil (locked → throw, pero
  // deja el veredicto puesto). la flag __MF_MIRROR_RUNNER__ la pone el propio
  // runner al arrancar; sembrarla a mano haría que MirrorRunner saliera temprano.
  const locked = makeSandbox({ ls: { [CFG_KEY]: { v: 1, ts: 0, hash: 'seed', cfg: cached } } });
  locked.sandbox.__MF_MIRROR__ = mirror;
  assert.throws(() => runMod(locked.sandbox), /cliente deshabilitado/);
  vm.runInContext(RUNNER_SRC, locked.sandbox, { filename: 'src/Core/MirrorRunner.js' });
  const scripts = locked.appended.filter(e => e.tagName === 'script');
  assert.equal(scripts.length, 0, 'lock: cero módulos');

  const free = makeSandbox({});
  free.sandbox.__MF_MIRROR__ = mirror;
  runMod(free.sandbox);
  vm.runInContext(RUNNER_SRC, free.sandbox, { filename: 'src/Core/MirrorRunner.js' });
  const scripts2 = free.appended.filter(e => e.tagName === 'script');
  assert.equal(scripts2.length, 2, 'libre: los dos módulos');
  assert.match(scripts2[0].textContent, /window\.A=1/);
});

test('isBlocked bloquea módulos ya inyectados en caliente (MirrorRunner consulta por path)', () => {
  // el gate del runner existe y consulta la api por cada path antes de inyectar
  assert.match(RUNNER_SRC, /__MF_MODERATION__/);
  assert.match(RUNNER_SRC, /isBlocked\(p\)/);
  assert.match(RUNNER_SRC, /moderation\.locked/);
  const hot = fs.readFileSync(path.join(ROOT, 'src', 'Core', 'HotLoader.js'), 'utf8');
  assert.match(hot, /__MF_MODERATION__/, 'HotLoader también consulta el veredicto');
});

test('moderation.json válida y MF_Moderation es el módulo 0 del mirror', () => {
  const mod = JSON.parse(fs.readFileSync(path.join(ROOT, 'moderation.json'), 'utf8'));
  assert.equal(mod.v, 1);
  assert.equal(mod.killSwitch.active, false, 'la config de fábrica no apaga a nadie');
  assert.deepEqual(mod.bannedAccounts, []);
  assert.deepEqual(mod.blockedModules, {});
  const mirror = JSON.parse(fs.readFileSync(path.join(ROOT, 'mirror.json'), 'utf8'));
  assert.equal(mirror.mainStart[0], 'src/Core/MF_Moderation.js', 'primero de mainStart: su veredicto manda sobre el resto');
  const hot = JSON.parse(fs.readFileSync(path.join(ROOT, 'hotload.json'), 'utf8'));
  const entry = (hot.hot || []).find(e => e.path === 'src/Core/MF_Moderation.js');
  assert.ok(entry, 'presente en hotload.json');
  assert.deepEqual(entry.ok, ['__MF_MODERATION']);
});

test('CLI moderation: show funciona', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'moderation.mjs'), 'show'], { encoding: 'utf8' });
  assert.match(out, /kill switch/);
  assert.match(out, /baneados/);
});
