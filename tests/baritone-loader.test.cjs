const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('old remote cache cannot restore old Baritone or omit its navigation dependencies', () => {
  const executed = [];
  const main = 'src/Movement/Baritone.js';
  const dependencies = ['src/Movement/MovementAPI.js', 'src/Movement/BaritoneAdapter.js', 'src/Movement/BaritonePlanner.js'];
  const mirror = { v: 1, ok: {}, lists: { mainStart: [...dependencies, main] }, code: {
    [main]: 'const BARITONE_NAVIGATION_VERSION = 2; globalThis.loadedNavigation = 2;'
  } };
  for (const dependency of dependencies) mirror.code[dependency] = 'void 0;';
  const overrides = { v: 1, buckets: { mainStart: ['unrelated.js', main] },
    files: { [main]: 'globalThis.loadedNavigation = 1;', 'unrelated.js': 'globalThis.unrelated = 7;' } };
  const sandbox = {
    __MF_MIRROR__: mirror, console: { log() {}, warn() {} },
    localStorage: { getItem(key) { return key === 'mf:mirror:overrides:v1' ? JSON.stringify(overrides) : null; }, setItem() {} },
    addEventListener() {}, setTimeout() {}, document: {
      createElement() { return { remove() {} }; },
      head: { appendChild(element) {
        executed.push(element.textContent.match(/sourceURL=(.*)$/)[1]);
        vm.runInContext(element.textContent, context);
      } }
    }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Core/MirrorRunner.js'), 'utf8'), context);
  assert.deepEqual(executed, ['unrelated.js', ...dependencies, main]);
  assert.equal(context.loadedNavigation, 2);
  assert.equal(context.unrelated, 7);
});

test('new navigation dependencies are ordered before Baritone in every bundled target', () => {
  const root = path.join(__dirname, '..');
  const list = JSON.parse(fs.readFileSync(path.join(root, 'mirror.json'), 'utf8')).mainStart;
  const core = list.indexOf('src/Movement/Baritone.js');
  for (const file of ['MovementAPI', 'BaritoneAdapter', 'BaritonePlanner']) {
    assert.ok(list.indexOf(`src/Movement/${file}.js`) >= 0);
    assert.ok(list.indexOf(`src/Movement/${file}.js`) < core);
  }
});
