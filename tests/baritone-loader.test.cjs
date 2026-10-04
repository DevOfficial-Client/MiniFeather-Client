const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const version of [2, 3, 4, 5, 6, 7]) test(`old remote cache cannot restore old Baritone v${version} or omit its navigation dependencies`, () => {
  const executed = [];
  const main = 'src/Movement/Baritone.js';
  const commands = 'src/Chat/ClientCommands.js';
  const dependencies = ['src/Movement/MovementAPI.js', 'src/Movement/BaritoneAdapter.js', 'src/Movement/BaritonePlanner.js'];
  if (version >= 4) dependencies.push('src/Movement/BaritonePathRenderer.js');
  const mirror = { v: 1, ok: {}, lists: { mainStart: [...dependencies, main] }, code: {
    [main]: `const BARITONE_NAVIGATION_VERSION = ${version}; globalThis.loadedNavigation = ${version};`
  } };
  for (const dependency of dependencies) mirror.code[dependency] = 'void 0;';
  const overrides = { v: 1, buckets: { mainStart: ['unrelated.js', main] },
    files: { [main]: 'globalThis.loadedNavigation = 1;', 'unrelated.js': 'globalThis.unrelated = 7;' } };
  if (version >= 3) {
    mirror.code[dependencies[1]] = `const BARITONE_ADAPTER_VERSION = ${Math.min(version, 6)}; globalThis.loadedAdapter = ${Math.min(version, 6)};`;
    mirror.code[dependencies[2]] = `const BARITONE_PLANNER_VERSION = ${version >= 7 ? 6 : Math.min(version, 5)}; globalThis.loadedPlanner = ${version >= 7 ? 6 : Math.min(version, 5)};`;
    overrides.files[dependencies[1]] = 'globalThis.loadedAdapter = 2;';
    overrides.files[dependencies[2]] = 'globalThis.loadedPlanner = 2;';
    mirror.code[commands] = `const COMPLETION_CONTEXT_VERSION = 2; const BARITONE_PLACEMENT_COMMANDS_VERSION = 1;
      ${version >= 4 ? 'const BARITONE_PATH_COMMANDS_VERSION = 1;' : ''} globalThis.loadedCommands = ${version};`;
    overrides.files[commands] = 'const COMPLETION_CONTEXT_VERSION = 2; globalThis.loadedCommands = 2;';
    overrides.buckets.mainStart.unshift(commands);
    if (version >= 4) {
      mirror.code[dependencies[3]] = 'const BARITONE_PATH_RENDERER_VERSION = 1; globalThis.loadedPathRenderer = 1;';
      overrides.files[dependencies[3]] = 'globalThis.loadedPathRenderer = 0;';
    }
  }
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
  assert.deepEqual(executed, [...(version >= 3 ? [commands] : []), 'unrelated.js', ...dependencies, main]);
  assert.equal(context.loadedNavigation, version);
  if (version >= 3) {
    assert.equal(context.loadedAdapter, Math.min(version, 6));
    assert.equal(context.loadedPlanner, version >= 7 ? 6 : Math.min(version, 5));
    assert.equal(context.loadedCommands, version);
    if (version >= 4) assert.equal(context.loadedPathRenderer, 1);
  }
  assert.equal(context.unrelated, 7);
});

test('new navigation dependencies are ordered before Baritone in every bundled target', () => {
  const root = path.join(__dirname, '..');
  const list = JSON.parse(fs.readFileSync(path.join(root, 'mirror.json'), 'utf8')).mainStart;
  const core = list.indexOf('src/Movement/Baritone.js');
  for (const file of ['MovementAPI', 'BaritoneAdapter', 'BaritonePlanner', 'BaritonePathRenderer']) {
    assert.ok(list.indexOf(`src/Movement/${file}.js`) >= 0);
    assert.ok(list.indexOf(`src/Movement/${file}.js`) < core);
  }
  const hot = JSON.parse(fs.readFileSync(path.join(root, 'hotload.json'), 'utf8')).hot;
  const renderer = hot.findIndex(entry => entry.path === 'src/Movement/BaritonePathRenderer.js');
  assert.ok(renderer >= 0 && renderer < hot.findIndex(entry => entry.path === 'src/Movement/Baritone.js'));
  assert.deepEqual(hot[renderer].ok, ['__MF_BARITONE_PATH_RENDERER__']);
});
