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

test('startup reveal uses compositor fade and refresh-rate-friendly updates', () => {
  assert.match(splashSource, /const FRAME_MS=1000\/75/);
  assert.match(splashSource, /animation:mfSplashVisibility \$\{TOTAL_MS\}ms linear both/);
  assert.doesNotMatch(splashSource, /root\.style\.opacity=String\(Math\.min/);
  assert.match(splashSource, /trailSamples=samplePath\(nodes\.wordTrail\)/);
});
