const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const code = read('src/Render/FullBright.js');

function setup(uniform = { value: 0.02 }) {
  const listeners = new Map();
  const timers = new Map();
  let timerId = 0;
  let scans = 0;
  class Worker {
    constructor() { this.sent = []; }
    postMessage(message, ...rest) { this.sent.push({ message, rest }); }
  }
  const originalWorker = Worker.prototype.postMessage;
  const scene = { traverse(fn) { scans++; fn({ material: { uniforms: { uAmbientLight: uniform } } }); } };
  const sandbox = {
    Worker, AbortController, performance: { now: () => 1000 },
    document: {
      querySelector: () => null,
      addEventListener(name, fn, options) {
        listeners.set(name, fn);
        options.signal.addEventListener('abort', () => { if (listeners.get(name) === fn) listeners.delete(name); });
      }
    },
    __MINIBLOX_GAME__: { player: {}, world: {}, scene },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return {
    sandbox, uniform, timers, Worker, originalWorker,
    config(detail) { listeners.get('minifeather:fullbright-config')({ detail: JSON.stringify(detail) }); },
    get api() { return sandbox.__MINIFEATHER_FULLBRIGHT__; },
    get scans() { return scans; }
  };
}

test('FullBright intensity applies immediately without scanning the world for every slider event', () => {
  const s = setup();
  s.config({ enabled: true, floor: 0.16, natural: false });
  assert.equal(s.uniform.value, 0.16);
  const scans = s.scans;
  for (let i = 0; i < 30; i++) s.config({ enabled: true, floor: i / 100, natural: false });
  assert.equal(s.scans, scans);
  assert.equal(s.timers.size, 1);
  assert.equal(s.uniform.value, 0.29);
  s.config({ floor: 100 });
  assert.equal(s.api.getState().floor, 0.35);
  assert.equal(s.api.getState().enabled, true);
  s.config({ floor: 'invalid' });
  assert.equal(s.api.getState().floor, 0.16);
});

test('natural lighting preserves dark gradients and never amplifies already bright values', () => {
  const s = setup();
  s.config({ enabled: true, floor: 0.16, natural: true });
  const dark = s.uniform.value;
  s.uniform.value = 0.04;
  assert.ok(s.uniform.value > dark);
  s.uniform.value = 1;
  assert.equal(s.uniform.value, 1);
  s.uniform.value = 2;
  assert.equal(s.uniform.value, 2);
  s.uniform.value = 'unavailable';
  assert.equal(s.uniform.value, 'unavailable');
  s.config({ floor: 0 }); s.uniform.value = 0.03;
  assert.equal(s.uniform.value, 0.03);
});

test('disabling restores the latest native lighting, descriptors and all timers', () => {
  const s = setup();
  s.api.enable();
  s.uniform.value = 0.09;
  s.api.disable();
  assert.equal(s.uniform.value, 0.09);
  assert.equal(Object.getOwnPropertyDescriptor(s.uniform, 'value').get, undefined);
  assert.equal(s.timers.size, 0);
  assert.equal(s.api.getState().patchedAmbientUniforms, 0);
  assert.equal(s.Worker.prototype.postMessage, s.originalWorker);
  s.api.enable(); s.api.destroy();
  assert.equal(s.timers.size, 0);
  assert.equal(s.sandbox.__MINIFEATHER_FULLBRIGHT__, undefined);
});

test('locked uniforms are never permanently overwritten', () => {
  const uniform = {};
  Object.defineProperty(uniform, 'value', { value: 0.01, configurable: false, writable: true });
  const s = setup(uniform);
  s.api.enable(); assert.equal(uniform.value, 0.01);
  s.api.disable(); assert.equal(uniform.value, 0.01);
});

test('native uniform accessors keep their own getter and setter semantics', () => {
  let value = 0.01;
  const uniform = {};
  const get = () => value;
  const set = next => { value = next; };
  Object.defineProperty(uniform, 'value', { get, set, configurable: true });
  const s = setup(uniform);
  s.api.enable(); uniform.value = 0.06;
  assert.equal(value, 0.06);
  value = 0.07;
  s.api.disable();
  assert.equal(uniform.value, 0.07);
  assert.equal(Object.getOwnPropertyDescriptor(uniform, 'value').get, get);
  assert.equal(Object.getOwnPropertyDescriptor(uniform, 'value').set, set);
});

test('worker lighting does not mutate source packets and restores the last native update on disable', () => {
  const s = setup(); const worker = new s.Worker();
  s.config({ enabled: true, floor: 0.16, natural: false });
  const packet = { type: 8, ambientLight: 0.01, chunk: 'native' };
  worker.postMessage(packet);
  assert.equal(packet.ambientLight, 0.01);
  assert.equal(worker.sent[0].message.ambientLight, 0.16);
  worker.postMessage({ type: 8, ambientLight: 0.03 });
  const unrelated = { type: 4, ambientLight: 0.01 };
  worker.postMessage(unrelated);
  assert.equal(worker.sent[2].message, unrelated);
  const transfer = { type: 8, ambientLight: 0.04 };
  const transferWorker = new s.Worker();
  transferWorker.postMessage(transfer, [{}]);
  assert.equal(transferWorker.sent[0].message, transfer);
  s.api.disable();
  assert.equal(worker.sent.at(-1).message.ambientLight, 0.03);
  assert.equal(s.Worker.prototype.postMessage, s.originalWorker);
});

test('destroy does not replace a worker hook installed by another module', () => {
  const s = setup(); s.api.enable();
  const nextHook = function () {};
  s.Worker.prototype.postMessage = nextHook;
  s.api.destroy();
  assert.equal(s.Worker.prototype.postMessage, nextHook);
});

test('reload restores native uniforms before installing a new FullBright controller', () => {
  const s = setup(); const old = s.api;
  old.enable(); s.uniform.value = 0.03;
  vm.runInContext(code, s.sandbox);
  assert.notEqual(s.api, old);
  assert.equal(s.uniform.value, 0.03);
  assert.equal(s.timers.size, 0);
  s.config({ enabled: true, floor: 0.20, natural: false });
  assert.equal(s.uniform.value, 0.20);
});

test('re-enabling after another module wraps the worker never doubles the lighting correction', () => {
  const s = setup(); const worker = new s.Worker();
  s.api.enable();
  const firstHook = s.Worker.prototype.postMessage;
  s.Worker.prototype.postMessage = function (...args) { return firstHook.apply(this, args); };
  s.api.disable();
  s.api.enable();
  worker.postMessage({ type: 8, ambientLight: 0.02 });
  assert.ok(Math.abs(worker.sent.at(-1).message.ambientLight - (0.16 + 0.02 * 0.84)) < 1e-9);
  s.api.disable();
  assert.equal(worker.sent.at(-1).message.ambientLight, 0.02);
});

test('lighting settings are localized in every supported UI language and connected to right click', () => {
  const sandbox = {}; vm.runInNewContext(read('src/I18n/Translations.js'), sandbox);
  const keys = ['fullBrightSettings', 'fullBrightIntensity', 'fullBrightSoft', 'fullBrightBalanced', 'fullBrightStrong', 'fullBrightNatural', 'fullBrightReset', 'fullBrightSettingsHint'];
  for (const [language, translations] of Object.entries(sandbox.MINIFEATHER_TRANSLATIONS)) {
    for (const key of keys) assert.ok(translations[key]?.trim(), language + ': ' + key);
  }
  const panel = read('src/UI/ClientPanel.js');
  assert.match(panel, /data-key="fullBright".*addEventListener\('contextmenu'/);
  assert.match(panel, /fullBright: openFullBrightSettings/);
  assert.match(panel, /closeFullBrightSettings\(\)/);
});
