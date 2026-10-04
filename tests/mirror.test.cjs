// mirror hot-update system: mirror.json / build-mirror / MirrorRunner / build-mobile.
// run: node tests/mirror.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function source(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

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

test('mirror.json: lista válida, sin duplicados, archivos presentes', () => {
  const list = JSON.parse(source('mirror.json'));
  assert.ok(Array.isArray(list.mainStart) && list.mainStart.length > 50, 'mainStart debería traer los módulos MAIN');
  const seen = new Set();
  for (const p of list.mainStart) {
    assert.equal(typeof p, 'string');
    assert.match(p, /^src\/.+\.js$/);
    assert.ok(!seen.has(p), 'duplicado: ' + p);
    seen.add(p);
    assert.ok(fs.existsSync(path.join(ROOT, p)), 'no existe: ' + p);
  }
});

test('mirror.js generado está fresco y parsea', () => {
  const { buildMirrorSource } = require(path.join(ROOT, 'tools', 'build-mirror.js'));
  const fresh = buildMirrorSource();
  const onDisk = source('src/Core/mirror.js');
  assert.equal(onDisk, fresh, 'src/Core/mirror.js desactualizado: correr node tools/build-mirror.js');
  new vm.Script(onDisk, { filename: 'mirror.js' });
});

test('mirror.js expone __MF_MIRROR__ con la lista y código de mirror.json', () => {
  const list = JSON.parse(source('mirror.json'));
  const sandbox = { globalThis: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source('src/Core/mirror.js'), sandbox);
  const mirror = sandbox.globalThis.__MF_MIRROR__;
  assert.ok(mirror && mirror.v === 1);
  assert.deepEqual([...mirror.lists.mainStart], [...list.mainStart]);
  for (const p of list.mainStart) {
    assert.equal(typeof mirror.code[p], 'string', 'sin código embebido: ' + p);
    assert.ok(mirror.code[p].length > 0);
  }
});

// inyecta de verdad: parcheamos createElement para ejecutar el script como código
function execRunnerSandbox({ mirror, overrides, fails }) {
  const store = { 'mf:mirror:overrides:v1': overrides ? JSON.stringify(overrides) : null };
  if (fails) store['mf:mirror:fails:v1'] = JSON.stringify(fails);
  const executed = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout() { return 0; },
    Event: function Event() {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: {
      head: {
        appendChild(el) {
          if (el && typeof el.textContent === 'string') {
            const m = el.textContent.match(/\/\/# sourceURL=(.+)$/m);
            executed.push({ path: m ? m[1].trim() : '?', code: el.textContent });
            vm.runInContext(el.textContent, sandbox, { filename: m ? m[1].trim() : 'inline' });
          }
          return el;
        }
      },
      createElement() { return { textContent: '', remove() {} }; },
      documentElement: null
    },
    __MF_MIRROR__: mirror
  };
  sandbox.document.documentElement = sandbox.document.head;
  sandbox.window = {
    addEventListener() {}
  };
  sandbox.globalThis = sandbox;
  sandbox.__executed = executed;
  sandbox.__store = store;
  vm.createContext(sandbox);
  vm.runInContext(source('src/Core/MirrorRunner.js'), sandbox, { filename: 'MirrorRunner.js' });
  return sandbox;
}

const FAKE_MIRROR = () => ({
  v: 1,
  lists: { mainStart: ['m/a.js', 'm/b.js', 'm/c.js'], isoStart: [], isoEnd: [] },
  ok: { 'm/b.js': ['XB'] },
  code: {
    'm/a.js': 'globalThis.XA = 1;',
    'm/b.js': 'globalThis.XB = 1;',
    'm/c.js': 'globalThis.XC = 1;'
  }
});

test('MirrorRunner: orden del manifest, override remoto y fallback bundled', () => {
  const sb = execRunnerSandbox({
    mirror: FAKE_MIRROR(),
    overrides: { v: 1, commit: 'abc', buckets: null, files: { 'm/a.js': 'globalThis.XA = 2;' }, ok: {} }
  });
  assert.deepEqual(sb.__executed.map(e => e.path), ['m/a.js', 'm/b.js', 'm/c.js']);
  assert.equal(sb.globalThis.XA, 2, 'override remoto debe ejecutarse');
  assert.equal(sb.globalThis.XB, 1, 'sin override usa bundled');
  assert.equal(sb.globalThis.XC, 1);
});

test('MirrorRunner: módulo que falla queda fijado a la copia local', () => {
  const mirror = FAKE_MIRROR();
  mirror.code['m/c.js'] = 'throw new Error("boom");';
  const sb = execRunnerSandbox({ mirror, overrides: { v: 1, files: {}, ok: {} } });
  const fails = JSON.parse(sb.__store['mf:mirror:fails:v1']);
  assert.ok(fails['m/c.js'], 'el fallo debe registrarse');
  assert.match(fails['m/c.js'], /boom/);
  // segunda carga: con el fail presente, bundled de c... bundled TAMBIÉN tira,
  // pero a/b siguen ok y c queda registrado
  assert.equal(sb.globalThis.XA, 1);
});

test('MirrorRunner: fail preexistente fuerza la copia local aunque haya override', () => {
  const sb = execRunnerSandbox({
    mirror: FAKE_MIRROR(),
    overrides: { v: 1, files: { 'm/a.js': 'globalThis.XA = 2;' }, ok: {} },
    fails: { 'm/a.js': 'fallo previo' }
  });
  assert.equal(sb.globalThis.XA, 1, 'debe usar bundled, no el override');
});

test('MirrorRunner: ok-globals faltante registra fail para el próximo arranque', () => {
  const sb = execRunnerSandbox({
    mirror: FAKE_MIRROR(),
    overrides: { v: 1, files: { 'm/b.js': 'globalThis.OTRA_COSA = 1;' }, ok: {} }
  });
  // el override de b no expone XB y el ok de mirror exige XB
  const fails = JSON.parse(sb.__store['mf:mirror:fails:v1']);
  assert.ok(fails['m/b.js'], 'ok faltante debe registrar fail');
  // esta carga usó el override (XB no existe)
  assert.equal(sb.globalThis.XB, undefined);
});

test('MirrorRunner: buckets remotos reordenan la lista', () => {
  const sb = execRunnerSandbox({
    mirror: FAKE_MIRROR(),
    overrides: { v: 1, buckets: { mainStart: ['m/c.js', 'm/a.js'], isoStart: [], isoEnd: [] }, files: {}, ok: {} }
  });
  assert.deepEqual(sb.__executed.map(e => e.path), ['m/c.js', 'm/a.js']);
});


test('MirrorRunner does not restore legacy autocomplete from the remote cache', () => {
  const p = 'src/Chat/ClientCommands.js';
  const mirror = FAKE_MIRROR(); mirror.lists.mainStart.push(p);
  mirror.code[p] = 'const COMPLETION_CONTEXT_VERSION = 2; globalThis.newCompletion = true;';
  const sb = execRunnerSandbox({ mirror, overrides: { v: 1, files: { [p]: 'globalThis.legacyCompletion = true;' }, ok: {} } });
  assert.equal(sb.globalThis.newCompletion, true); assert.equal(sb.globalThis.legacyCompletion, undefined);
});

test('MirrorRunner keeps FullBright lighting settings and translations when remote cache is older', () => {
  const entries = {
    'src/Render/FullBright.js': 'FULLBRIGHT_SETTINGS_VERSION = 1',
    'src/UI/ClientPanel.js': 'FULLBRIGHT_SETTINGS_VERSION = 1',
    'src/I18n/Translations.js': '"fullBrightSettings"'
  };
  const mirror = FAKE_MIRROR(); const files = {};
  for (const [p, marker] of Object.entries(entries)) {
    mirror.lists.mainStart.push(p);
    mirror.code[p] = '// ' + marker + '\nglobalThis.modernLighting = (globalThis.modernLighting || 0) + 1;';
    files[p] = 'globalThis.legacyLighting = true;';
  }
  const sb = execRunnerSandbox({ mirror, overrides: { v: 1, files, ok: {} } });
  assert.equal(sb.globalThis.modernLighting, 3);
  assert.equal(sb.globalThis.legacyLighting, undefined);
});

const REALISTIC_PATH = 'src/Experimental/Realistic/RealisticMode.js';
const FIRST_PERSON_PATH = 'src/Experimental/Realistic/FirstPersonModel.js';

test('MirrorRunner inserts the bundled first-person dependency omitted by an old remote plan', () => {
  const mirror = FAKE_MIRROR();
  mirror.lists.mainStart.splice(1, 0, FIRST_PERSON_PATH, REALISTIC_PATH);
  mirror.code[FIRST_PERSON_PATH] = '// FIRST_PERSON_MODEL_VERSION = 3\nglobalThis.firstPersonLoaded = true;';
  mirror.code[REALISTIC_PATH] = '// REALISTIC_PLAYER_FEATURES_VERSION = 1\nglobalThis.modernRealistic = globalThis.firstPersonLoaded;';
  const plan = ['m/c.js', REALISTIC_PATH, 'm/a.js'];
  const sb = execRunnerSandbox({ mirror, overrides: {
    v: 1, buckets: { mainStart: plan }, files: { [REALISTIC_PATH]: 'globalThis.legacyRealistic = true;' }, ok: {}
  } });
  assert.deepEqual(sb.__executed.map(entry => entry.path), ['m/c.js', FIRST_PERSON_PATH, REALISTIC_PATH, 'm/a.js']);
  assert.equal(sb.globalThis.modernRealistic, true, 'local coordinator must run after its new dependency');
  assert.equal(sb.globalThis.legacyRealistic, undefined);
});

test('MirrorRunner reorders an existing first-person module before Realistic without changing other remote order', () => {
  const mirror = FAKE_MIRROR();
  mirror.code[FIRST_PERSON_PATH] = '// FIRST_PERSON_MODEL_VERSION = 3\nglobalThis.firstPersonLoaded = true;';
  mirror.code[REALISTIC_PATH] = '// REALISTIC_PLAYER_FEATURES_VERSION = 1\nglobalThis.modernRealistic = true;';
  const sb = execRunnerSandbox({ mirror, overrides: {
    v: 1, buckets: { mainStart: ['m/b.js', REALISTIC_PATH, 'm/c.js', FIRST_PERSON_PATH, 'm/a.js'] }, files: {}, ok: {}
  } });
  assert.deepEqual(sb.__executed.map(entry => entry.path), ['m/b.js', FIRST_PERSON_PATH, REALISTIC_PATH, 'm/c.js', 'm/a.js']);
  assert.equal(sb.__executed.filter(entry => entry.path === FIRST_PERSON_PATH).length, 1);
});

test('MirrorRunner preserves all player-adaptation APIs and labels against obsolete remote overrides', () => {
  const markers = {
    [FIRST_PERSON_PATH]: 'FIRST_PERSON_MODEL_VERSION = 3',
    [REALISTIC_PATH]: 'REALISTIC_PLAYER_FEATURES_VERSION = 1',
    'src/Render/BetterPlayerLayers.js': 'setRealisticOptions',
    'src/Render/BetterPlayerLayersArmorPatch.js': 'setRealisticOptions',
    'src/UI/ClientPanel.js': 'FULLBRIGHT_SETTINGS_VERSION = 1 experimentalRealisticFirstPerson',
    'src/I18n/Translations.js': '"fullBrightSettings" "experimentalRealisticFirstPersonLabel"'
  };
  const mirror = FAKE_MIRROR(), files = {};
  for (const [p, marker] of Object.entries(markers)) {
    mirror.lists.mainStart.push(p);
    mirror.code[p] = '// ' + marker + '\nglobalThis.modernPlayer = (globalThis.modernPlayer || 0) + 1;';
    files[p] = 'globalThis.legacyPlayer = (globalThis.legacyPlayer || 0) + 1;';
  }
  const sb = execRunnerSandbox({ mirror, overrides: { v: 1, files, ok: {} } });
  assert.equal(sb.globalThis.modernPlayer, 6);
  assert.equal(sb.globalThis.legacyPlayer, undefined);
  for (const [p, marker] of Object.entries(markers)) files[p] = '// ' + marker + '\nglobalThis.remotePlayer = (globalThis.remotePlayer || 0) + 1;';
  const current = execRunnerSandbox({ mirror, overrides: { v: 1, files, ok: {} } });
  assert.equal(current.globalThis.remotePlayer, 6, 'compatible modern overrides must continue working');
  assert.equal(current.globalThis.modernPlayer, undefined);
});

test('MirrorRunner replaces a cached first-person v2 with v3 while accepting current v3 overrides', () => {
  const mirror = FAKE_MIRROR();
  mirror.lists.mainStart.push(FIRST_PERSON_PATH);
  mirror.code[FIRST_PERSON_PATH] = '// FIRST_PERSON_MODEL_VERSION = 3\nglobalThis.bodyOnlyFirstPerson = true;';
  const old = execRunnerSandbox({ mirror, overrides: {
    v: 1, files: { [FIRST_PERSON_PATH]: '// FIRST_PERSON_MODEL_VERSION = 2\nglobalThis.oldFirstPersonHands = true;' }, ok: {}
  } });
  assert.equal(old.globalThis.bodyOnlyFirstPerson, true, 'v2 must not reintroduce the old hands behavior');
  assert.equal(old.globalThis.oldFirstPersonHands, undefined);
  const current = execRunnerSandbox({ mirror, overrides: {
    v: 1, files: { [FIRST_PERSON_PATH]: '// FIRST_PERSON_MODEL_VERSION = 3\nglobalThis.remoteBodyOnlyFirstPerson = true;' }, ok: {}
  } });
  assert.equal(current.globalThis.remoteBodyOnlyFirstPerson, true);
  assert.equal(current.globalThis.bodyOnlyFirstPerson, undefined);
});

test('MirrorRunner player-version guards remain optional when the local bundle predates those features', () => {
  const mirror = FAKE_MIRROR(), files = {};
  for (const p of [REALISTIC_PATH, 'src/UI/ClientPanel.js', 'src/I18n/Translations.js']) {
    mirror.lists.mainStart.push(p);
    mirror.code[p] = 'globalThis.oldBundled = true;';
    files[p] = 'globalThis.compatibleRemote = (globalThis.compatibleRemote || 0) + 1;';
  }
  const sb = execRunnerSandbox({ mirror, overrides: { v: 1, files, ok: {} } });
  assert.equal(sb.globalThis.compatibleRemote, 3);
  assert.equal(sb.__executed.some(entry => entry.path === FIRST_PERSON_PATH), false);
});

test('MirrorRunner still enforces moderation on an inserted first-person dependency and the coordinator', () => {
  const moderationPath = 'src/Core/MF_Moderation.js';
  for (const locked of [false, true]) {
    const mirror = FAKE_MIRROR();
    mirror.code[moderationPath] = `window.__MF_MODERATION__ = { locked: ${locked}, isBlocked: p => p === ${JSON.stringify(FIRST_PERSON_PATH)}, blockReason: () => 'test block' };`;
    mirror.code[FIRST_PERSON_PATH] = '// FIRST_PERSON_MODEL_VERSION = 3\nglobalThis.firstPersonLoaded = true;';
    mirror.code[REALISTIC_PATH] = '// REALISTIC_PLAYER_FEATURES_VERSION = 1\nglobalThis.modernRealistic = true;';
    const sb = execRunnerSandbox({ mirror, overrides: {
      v: 1, buckets: { mainStart: [moderationPath, REALISTIC_PATH, 'm/a.js'] }, files: {}, ok: {}
    } });
    assert.equal(sb.globalThis.firstPersonLoaded, undefined);
    assert.equal(sb.globalThis.modernRealistic, locked ? undefined : true);
    assert.deepEqual(sb.__executed.map(entry => entry.path), locked ? [moderationPath] : [moderationPath, REALISTIC_PATH, 'm/a.js']);
  }
});

test('background: trackedFilesFromManifest excluye mirror.js generado', () => {
  const bg = source('src/Core/background.js');
  const fn = namedFunction(bg, 'trackedFilesFromManifest');
  const manifest = {
    background: { service_worker: 'src/Core/background.js' },
    content_scripts: [
      { js: ['src/Core/SplashScreen.js'] },
      { js: ['src/Core/mirror.js'], world: 'MAIN' },
      { js: ['src/Core/MirrorRunner.js'], world: 'MAIN' },
      { js: ['src/Chat/ClientChat.js'], run_at: 'document_end' }
    ]
  };
  const tracked = vm.runInNewContext(`(${fn})(${JSON.stringify(manifest)})`);
  assert.ok(!tracked.includes('src/Core/mirror.js'), 'mirror.js no debe trackearse (se sincroniza por mirror cache)');
  for (const f of ['manifest.json', 'src/Core/background.js', 'src/Core/MirrorRunner.js', 'src/Chat/ClientChat.js']) {
    assert.ok(tracked.includes(f), 'debe trackear ' + f);
  }
});

test('build-mobile: el userscript empota los módulos de mirror.json y no el runner', async () => {
  const distPath = path.join(ROOT, 'dist', 'MiniFeatherClient.user.js');
  const before = fs.existsSync(distPath) ? fs.readFileSync(distPath, 'utf8') : null;
  try {
    execFileSync(process.execPath, ['tools/build-mobile.js', '--no-tauri', '--no-electron', '--no-android'], { cwd: ROOT });
    const bundle = fs.readFileSync(distPath, 'utf8');
    const list = JSON.parse(source('mirror.json'));
    assert.ok(list.mainStart.length > 50);
    assert.ok(bundle.includes(`==== mf module: ${list.mainStart[0]} ====`), 'primer módulo del mirror falta en el bundle');
    assert.ok(bundle.includes(`==== mf module: ${list.mainStart[list.mainStart.length - 1]} ====`), 'último módulo del mirror falta');
    assert.ok(!bundle.includes('==== mf module: src/Core/MirrorRunner.js ===='), 'MirrorRunner no debe ir en el bundle');
    assert.ok(!bundle.includes('==== mf module: src/Core/mirror.js ===='), 'mirror.js no debe ir en el bundle');
    // orden: FriendNicknames (primer módulo) antes que los bridges iso
    const firstIdx = bundle.indexOf(`==== mf module: ${list.mainStart[0]} ====`);
    const bridgeIdx = bundle.indexOf('==== mf module: src/P2P/MF_VoiceSignalBridge.js ====');
    assert.ok(firstIdx > -1 && bridgeIdx > firstIdx, 'los módulos MAIN deben ir antes de los bridges');
  } finally {
    if (before === null) fs.rmSync(distPath, { force: true });
    else fs.writeFileSync(distPath, before);
  }
});
