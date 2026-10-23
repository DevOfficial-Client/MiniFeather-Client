'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/Studio/MF_Facial.js'), 'utf8');
const PLAYER_UUID = 'c4201f43-2de9-4275-930a-301fae4cce6c';

function helper(name) {
  const start = source.search(new RegExp(`    (?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  const close = source.indexOf('\n    }', start);
  assert.ok(close > start, name);
  return source.slice(start, close + 6);
}

function fixture(uuid = PLAYER_UUID) {
  const storage = new Map(), calls = { ensured: 0, started: 0, painted: 0, restored: 0, canceled: [] };
  const context = vm.createContext({
    owner: uuid, skin: 'new-native-skin', LS_KEY: 'minifeather_facials_v1', LS_AUTO: 'minifeather_facials_v1_auto',
    auto: { on: false, front: '', left: '', right: '', up: '', down: '', blinkClosed: '', browFace: '', _raf: null },
    state: { library: {}, frameCache: new Map(), faceGeneration: 0 },
    skinWatch: { busy: false, lastApplied: null, userOff: false, uuidDone: false },
    packIndex: [
      { id: 'angrywolfx', uuid: PLAYER_UUID, front: 'front.png', left: 'left.png', right: 'right.png', blink: 'blink.png' },
      { id: 'new-native-skin', front: 'front.png', left: 'left.png', right: 'right.png', blink: 'blink.png' }
    ],
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    ensureSession() { calls.ensured++; },
    autoStop(restore) { if (restore) calls.restored++; },
    stop() {}, scheduleBlink() {}, renderUI() {}, debugBrow() {},
    cancelAnimationFrame(id) { calls.canceled.push(id); },
    requestAnimationFrame() { calls.started++; return 5; },
    autoTick() {}, performance: { now: () => 10 }, getMesh: () => ({}),
    resolveFace: () => Promise.resolve({ canvas: {}, kind: 'face' }),
    resolveAutoName: value => value, paintFace() { calls.painted++; }
  });
  vm.runInContext(`
    function currentPlayerUuid() { return owner; }
    function currentSkinId() { return skin; }
    ${['isRetiredLocalFacePack', 'isRetiredLocalFaceReference', 'isRetiredSavedFacial',
      'saveAuto', 'clearRetiredLocalFaceConfig', 'loadAuto', 'autoStart', 'applyPackForSkin', 'paintZone'].map(helper).join('\n')}
  `, context);
  return { context, storage, calls };
}

const legacyConfig = () => ({ on: true, front: 'fs:angrywolfx/al frente.png', left: 'fs:angrywolfx/izquierda.png',
  right: 'fs:angrywolfx/derecha.png', blinkClosed: 'fs:angrywolfx/blink.png', browFace: 'fs:angrywolfx/brow.png',
  up: 'fs:new-native-skin/up.png', yawThreshold: 18, blinkMinMs: 2500 });

test('old saved facial settings are migrated for both developer UUIDs, preserving other settings and assets', () => {
  for (const uuid of [PLAYER_UUID, '481511cf-be21-4c1c-9ad1-aa8cba0d0d26']) {
    const f = fixture(uuid);
    f.storage.set(f.context.LS_AUTO, JSON.stringify(legacyConfig()));
    f.storage.set('unrelated-setting', 'keep');
    vm.runInContext('loadAuto()', f.context);
    const saved = JSON.parse(f.storage.get(f.context.LS_AUTO));
    assert.equal(saved.on, false);
    for (const key of ['front', 'left', 'right', 'blinkClosed', 'browFace']) assert.equal(saved[key], '');
    assert.equal(saved.up, 'fs:new-native-skin/up.png');
    assert.equal(saved.yawThreshold, 18);
    assert.equal(saved.blinkMinMs, 2500);
    assert.equal(f.storage.get('unrelated-setting'), 'keep');
    assert.equal(f.calls.started, 0);
    assert.equal(f.calls.painted, 0);
  }
});

test('other accounts keep their existing faces, including the same pack when intentionally selected', () => {
  const f = fixture('11111111-2222-3333-4444-555555555555');
  const saved = JSON.stringify(legacyConfig());
  f.storage.set(f.context.LS_AUTO, saved);
  vm.runInContext('loadAuto()', f.context);
  assert.equal(f.context.auto.front, 'fs:angrywolfx/al frente.png');
  assert.equal(f.context.auto.on, true);
  assert.equal(f.storage.get(f.context.LS_AUTO), saved);
});

test('cleanup waits for identity and blocks every restored-auto startup before painting when identity arrives', async () => {
  const f = fixture(null);
  f.storage.set(f.context.LS_AUTO, JSON.stringify(legacyConfig()));
  vm.runInContext('loadAuto()', f.context);
  assert.equal(f.context.auto.on, true);
  f.context.owner = PLAYER_UUID;
  const result = await vm.runInContext('autoStart()', f.context);
  assert.equal(result.ok, false);
  assert.equal(f.context.auto.on, false);
  assert.equal(f.context.auto.front, '');
  assert.equal(f.calls.ensured, 0);
  assert.equal(f.calls.started, 0);
});

test('matching the developer UUID cannot choose the old face when the player wears a new supported skin', async () => {
  const f = fixture();
  const result = await vm.runInContext('applyPackForSkin()', f.context);
  assert.equal(result.ok, true);
  assert.equal(f.context.auto.front, 'fs:new-native-skin/front.png');
  assert.equal(f.context.skinWatch.lastApplied, 'new-native-skin');
  assert.equal(f.context.skinWatch.busy, false);
  assert.equal(f.calls.started, 1);
});

test('unknown native skins stay unchanged instead of inheriting the previous face through UUID or skin-id matching', async () => {
  for (const skin of ['unlisted-new-skin', 'angrywolfx']) {
    const f = fixture();
    f.context.skin = skin;
    const result = await vm.runInContext('applyPackForSkin(true)', f.context);
    assert.equal(result, null);
    assert.equal(f.context.auto.front, '');
    assert.equal(f.calls.started, 0);
    assert.equal(f.calls.painted, 0);
  }
});

test('only the old library auto-resume pointer is cleared; animations themselves are preserved', () => {
  const f = fixture();
  f.context.state.library = { old: { frames: [{ face: 'fs:angrywolfx/blink.png' }] },
    new: { frames: [{ face: 'fs:new-native-skin/front.png' }] }, malformed: { frames: {} } };
  const key = f.context.LS_KEY + '_last';
  f.storage.set(key, 'old');
  vm.runInContext('clearRetiredLocalFaceConfig()', f.context);
  assert.equal(f.storage.has(key), false);
  assert.ok(f.context.state.library.old);
  f.storage.set(key, 'new');
  vm.runInContext('clearRetiredLocalFaceConfig()', f.context);
  assert.equal(f.storage.get(key), 'new');
  assert.equal(vm.runInContext('isRetiredSavedFacial("malformed")', f.context), false);
  assert.match(source, /last && state\.library\[last\] && !isRetiredSavedFacial\(last\)/);
});

test('active old faces cancel their pending loop and restore the base head', () => {
  const f = fixture();
  Object.assign(f.context.auto, legacyConfig(), { _raf: 8 });
  Object.assign(f.context.state, { baseHead: {}, tex: {} });
  vm.runInContext('clearRetiredLocalFaceConfig()', f.context);
  assert.deepEqual(f.calls.canceled, [8]);
  assert.equal(f.calls.restored, 1);
  assert.equal(f.context.state.faceGeneration, 1);
});

test('an old sprite completing its download after cleanup cannot repaint the new face', async () => {
  const f = fixture(null);
  Object.assign(f.context.auto, legacyConfig());
  let finish;
  f.context.resolveFace = () => new Promise(resolve => { finish = resolve; });
  const pending = vm.runInContext('paintZone("front", true)', f.context);
  f.context.owner = PLAYER_UUID;
  vm.runInContext('clearRetiredLocalFaceConfig()', f.context);
  finish({ canvas: {}, kind: 'face' });
  await pending;
  assert.equal(f.calls.painted, 0);
  assert.match(source, /generation === state\.faceGeneration/);
});

test('the complete facial module boots with cached old settings and never resumes the old face from any startup watcher', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<html><body></body></html>', { url: 'https://miniblox.online/', runScripts: 'outside-only' });
  const window = dom.window, intervals = new Map();
  let nextTimer = 0, animationFrames = 0, skinTouches = 0;
  try {
    window.setInterval = fn => { intervals.set(++nextTimer, fn); return nextTimer; };
    window.clearInterval = id => intervals.delete(id);
    window.setTimeout = () => ++nextTimer;
    window.clearTimeout = () => {};
    window.requestAnimationFrame = () => { animationFrames++; return ++nextTimer; };
    window.cancelAnimationFrame = () => {};
    class ResponseStub {
      constructor(data) { this.data = data; this.ok = true; this.url = ''; }
      async json() { return this.data; }
      async text() { return JSON.stringify(this.data); }
      clone() { return this; }
    }
    window.Response = ResponseStub;
    window.chrome = { runtime: { getURL: file => 'https://local-assets.invalid/' + file } };
    window.fetch = async url => {
      const match = String(url).match(/\/([^/]+)\/pack\.json$/);
      return new ResponseStub(match ? { id: match[1], uuid: match[1] === 'angrywolfx' ? PLAYER_UUID : null,
        sprites: { front: 'front.png', left: 'left.png', right: 'right.png', blink: 'blink.png' } }
        : { skin: 'unlisted-native-skin' });
    };
    const mesh = { traverse() { skinTouches++; throw new Error('the retired face must not repaint native materials'); } };
    const player = { id: 7, uuid: PLAYER_UUID, mesh, profile: { uuid: PLAYER_UUID, cosmetics: { skin: 'unlisted-native-skin' } } };
    window.miniblox = { player, world: { players: new Map([[player.id, player]]), getPlayerById: () => player } };
    const key = 'minifeather_facials_v1';
    window.localStorage.setItem(key + '_auto', JSON.stringify(legacyConfig()));
    window.localStorage.setItem(key, JSON.stringify({ 'Old face': { frames: [{ face: 'fs:angrywolfx/blink.png' }] } }));
    window.localStorage.setItem(key + '_last', 'Old face');
    vm.runInContext(source, dom.getInternalVMContext(), { filename: 'MF_Facial.js' });
    await new Promise(resolve => setImmediate(resolve));
    for (const callback of [...intervals.values()]) callback();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(window.MF_Facial.autoOn, false);
    assert.equal(window.MF_Facial.autoConfig.front, '');
    assert.equal(window.MF_Facial.playing, null);
    assert.equal(window.localStorage.getItem(key + '_last'), null);
    assert.ok(window.MF_Facial.library['Old face'], 'the imported animation remains available for explicit use');
    assert.equal(player.profile.cosmetics.skin, 'unlisted-native-skin');
    assert.equal(animationFrames, 0);
    assert.equal(skinTouches, 0);
  } finally { dom.window.close(); }
});
