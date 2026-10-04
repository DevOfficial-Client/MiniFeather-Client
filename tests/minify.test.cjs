// minified distribution: terser keeps implicit globals + markers alive, the
// runner compares markers whitespace-free, and the minifier tool exists with
// the right exclusions. run: node tests/minify.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const RUNNER_SRC = fs.readFileSync(path.join(ROOT, 'src', 'Core', 'MirrorRunner.js'), 'utf8');

const squash = s => String(s).replace(/\s+/g, '');

test('terser keeps implicit globals and markers alive (mangle-less settings)', async () => {
  const { minify } = require('terser');
  const sample = [
    '// this comment exists only to be deleted',
    'COMPLETION_CONTEXT_VERSION = 2;',
    'function helperThatOthersUse() { return 42; }',
    'window.MF_SAMPLE = { answer: helperThatOthersUse() };'
  ].join('\n');
  const r = await minify(sample, {
    compress: { passes: 2, unused: false, collapse_vars: false, dead_code: true },
    mangle: false,
    format: { comments: false, ascii_only: true }
  });
  assert.ok(r.code && r.code.length < sample.length, 'comments/whitespace actually got squeezed');
  assert.equal(r.code.includes('this comment exists'), false, 'comments gone');
  new vm.Script(r.code, { filename: 'sample.js' }); // still parses

  // run it: implicit global + window export survive
  const sandbox = { window: {}, globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(r.code, sandbox);
  assert.equal(sandbox.COMPLETION_CONTEXT_VERSION, 2, 'implicit global alive');
  assert.equal(sandbox.window.MF_SAMPLE.answer, 42, 'window export alive');

  // the runner's whitespace-free marker comparison accepts the minified copy
  const needle = squash('COMPLETION_CONTEXT_VERSION = 2');
  assert.ok(squash(r.code).indexOf(needle) >= 0, 'marker found in minified code after squash');
});

test('MirrorRunner compares markers whitespace-free (minified overrides not rejected)', () => {
  assert.match(RUNNER_SRC, /replace\(\/\\s\+\/g,\s*''\)/, 'squash helper present');
  assert.match(RUNNER_SRC, /squash\(files\[p\]\)/, 'remote code goes through squash');
  assert.match(RUNNER_SRC, /squash\(MIRROR\.code\[p\]\)/, 'bundled code goes through squash');
});

test('minify-repo tool: conservative settings, libraries excluded', () => {
  const tool = fs.readFileSync(path.join(ROOT, 'tools', 'minify-repo.js'), 'utf8');
  assert.match(tool, /mangle:\s*false/, 'no mangling: cross-script implicit globals are invisible to terser');
  assert.match(tool, /unused:\s*false/, 'no unused-pruning: cross-script references are invisible too');
  assert.match(tool, /src\/Libraries\//, 'third-party libraries excluded (MIT headers intact)');
  assert.match(tool, /build-mirror\.js/, 'mirror gets regenerated from the minified tree');
});
