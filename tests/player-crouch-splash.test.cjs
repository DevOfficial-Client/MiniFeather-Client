const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const playerSource = fs.readFileSync(path.join(__dirname, '../src/PlayerAnims/MF_PlayerAnims.js'), 'utf8');
const splashSource = fs.readFileSync(path.join(__dirname, '../src/Core/SplashScreen.js'), 'utf8');

test('crouch detection reads the live entity and leaves other poses unchanged', () => {
  const match = playerSource.match(/    function isMeshSneaking\(mesh, game\) \{[\s\S]*?\n    \}/);
  assert.ok(match);
  const isMeshSneaking = vm.runInNewContext(`(${match[0]})`);
  const mesh = { entity: { id: 12, sneak: false } };
  const live = { id: 12, sneak: true };
  const game = { world: { entities: new Map([[12, live]]) } };
  assert.equal(isMeshSneaking(mesh, game), true);
  live.sneak = false;
  assert.equal(isMeshSneaking(mesh, game), false);
  assert.equal(isMeshSneaking({ entity: { id: 13, crouching: true } }, game), true);
  assert.match(playerSource, /mesh\.__mfPASuppress \|\| isMeshSneaking\(mesh, mesh\._mfPASkelGame\)/);
  assert.match(playerSource, /!this\.__mfPASuppress && !isMeshSneaking\(mesh, mesh\._mfPASkelGame\)/);
});

test('startup reveal animates without a per-frame JavaScript loop', () => {
  assert.match(splashSource, /animation:mfSplashVisibility \$\{TOTAL_MS\}ms linear both/);
  assert.match(splashSource, /@keyframes mfSplashFeather/);
  assert.match(splashSource, /@keyframes mfSplashTitle/);
  assert.match(splashSource, /@keyframes mfSplashLogo/);
  assert.match(splashSource, /\.mf-splash-depth\{[^}]*text-shadow:/);
  assert.match(splashSource, /\.mf-splash-face\{[^}]*background-clip:text/);
  assert.doesNotMatch(splashSource, /<clipPath|stroke-dashoffset/);
  assert.doesNotMatch(splashSource, /requestAnimationFrame|renderFrame\(/);
  assert.match(splashSource, /endTimer = setTimeout\(\(\) => \{\s*if \(playToken === token/);
});

test('startup replay, skip and destroy clean up safely', async () => {
  const elements = [];
  const timers = [];
  let now = 1000;
  const makeElement = tag => ({
    tag, style: {}, removed: false,
    setAttribute() {},
    querySelector() { return { setAttribute() {} }; },
    animate() { return { finished: Promise.resolve() }; },
    remove() { this.removed = true; }
  });
  const sandbox = {
    AbortController,
    performance: { now: () => now },
    getComputedStyle: () => ({ opacity: '1' }),
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {},
    chrome: {
      runtime: { getURL: path => path },
      storage: {
        local: { get(_, callback) { callback({ settings: { startupAnimation: true } }); } },
        onChanged: { addListener() {} }
      }
    },
    document: {
      documentElement: { appendChild(element) { elements.push(element); } },
      createElement: makeElement,
      addEventListener() {}
    },
    addEventListener() {},
    matchMedia: () => ({ matches: false })
  };
  sandbox.window = sandbox;
  vm.runInNewContext(splashSource, sandbox);
  assert.equal(elements.filter(element => element.tag === 'div').length, 1);
  const firstRoot = elements.find(element => element.tag === 'div');
  sandbox.__MINIFEATHER_SPLASH__.play({ force: true });
  assert.equal(firstRoot.removed, true);
  assert.equal(elements.filter(element => element.tag === 'div').length, 2);
  const secondRoot = elements.filter(element => element.tag === 'div')[1];
  timers[0]();
  assert.equal(secondRoot.removed, false);
  now += 300;
  sandbox.__MINIFEATHER_SPLASH__.skip();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(secondRoot.removed, true);
  sandbox.__MINIFEATHER_SPLASH__.destroy();
  assert.equal(sandbox.__MINIFEATHER_SPLASH__, undefined);
});
