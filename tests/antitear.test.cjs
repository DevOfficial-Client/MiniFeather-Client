// mf antitear: clamp runtime del motion blur + god rays temporal del juego
// base (los "desgarros" vanilla), restore limpio y re-hook cuando el juego
// recrea su manager de post por cambio de mundo.
// run: node tests/antitear.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'Render', 'MF_AntiTear.js'), 'utf8');

// imita lo que la ia de turno encontró en el bundle de miniblox: passes con
// props propias firmadas y un frame que reescribe enabled/_godRayTier cada tick
function makeMotionBlurPass() {
  return {
    enabled: true,
    _blur: {},
    _copy: {},
    _quad: {},
    _target: {},
    _prevViewProj: {},
    hasMotion: true
  };
}

function makeFogPass(tier) {
  return {
    enabled: true,
    _raymarch: {},
    _composite: {},
    _quad: {},
    _fogTargets: {},
    _godRayTier: tier || null
  };
}

function makeSandbox() {
  const docListeners = {};
  const timers = [];
  const sandbox = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    document: {
      getElementById: () => null,
      addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
      removeEventListener() {},
      dispatchEvent(evt) { for (const fn of docListeners[evt.type] || []) fn(evt); return true; }
    },
    performance: { now: () => Date.now() },
    setInterval(fn) { timers.push(fn); return timers.length; },
    clearInterval() {},
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return { sandbox, docListeners, timers };
}

// game object con la forma que el módulo espera: fiber falso -> props.game
function makeGameWithPasses() {
  const mb = makeMotionBlurPass();
  const fog = makeFogPass({ steps: 18, occlusionSteps: 6, resolutionScale: 0.5, temporal: true, maxDistance: 260 });
  const game = { player: { pos: {} }, post: { motionBlurPass: mb, fogPass: fog } };
  return { game, mb, fog };
}

function installGame(sandbox, game) {
  sandbox.document.getElementById = (id) => {
    if (id !== 'react') return null;
    return { __reactContainer$test: { updateQueue: { baseState: { element: { props: { game } } } } } };
  };
}

// status() nace en el realm de la vm: deepEqual de node odia prototipos ajenos
function statusJson(api) {
  return JSON.stringify(api.status());
}

function configEvent(sandbox, enabled) {
  sandbox.document.dispatchEvent(new sandbox.CustomEvent('minifeather:antitear-config', {
    detail: JSON.stringify({ enabled })
  }));
}

test('arranca inactivo y expone su api', () => {
  const { sandbox } = makeSandbox();
  vm.runInContext(SRC, sandbox, { filename: 'src/Render/MF_AntiTear.js' });
  assert.ok(sandbox.MF_AntiTear, 'api global presente');
  assert.ok(sandbox.__MF_ANTI_TEAR__, 'guard de re-ejecución presente');
  assert.equal(statusJson(sandbox.MF_AntiTear), JSON.stringify({ enabled: false, motionBlur: false, godRays: false, game: false }));
});

test('enable clampa el motion blur aunque el frame lo reescriba cada tick', () => {
  const { sandbox } = makeSandbox();
  const { game, mb } = makeGameWithPasses();
  installGame(sandbox, game);
  vm.runInContext(SRC, sandbox, { filename: 'src/Render/MF_AntiTear.js' });
  configEvent(sandbox, true);
  // el frame del juego: pass.enabled = setting && hasMotion
  mb.enabled = true;
  assert.equal(mb.enabled, false, 'el setter se traga la escritura del frame');
  assert.equal(sandbox.MF_AntiTear.status().motionBlur, true);
});

test('god rays high cae a medium (sin temporal), off pasa de largo', () => {
  const { sandbox } = makeSandbox();
  const { game, fog } = makeGameWithPasses();
  installGame(sandbox, game);
  vm.runInContext(SRC, sandbox, { filename: 'src/Render/MF_AntiTear.js' });
  configEvent(sandbox, true);
  fog._godRayTier = { steps: 18, occlusionSteps: 6, resolutionScale: 0.5, temporal: true, maxDistance: 260 };
  assert.equal(fog._godRayTier.temporal, false, 'high temporal → medium no temporal');
  assert.equal(fog._godRayTier.steps, 12);
  fog._godRayTier = null; // god rays off
  assert.equal(fog._godRayTier, null, 'off no se toca');
});

test('disable restaura los descriptores y el juego vuelve a su config', () => {
  const { sandbox } = makeSandbox();
  const { game, mb, fog } = makeGameWithPasses();
  const tier = { steps: 18, occlusionSteps: 6, resolutionScale: 0.5, temporal: true, maxDistance: 260 };
  fog._godRayTier = tier;
  installGame(sandbox, game);
  vm.runInContext(SRC, sandbox, { filename: 'src/Render/MF_AntiTear.js' });
  configEvent(sandbox, true);
  configEvent(sandbox, false);
  mb.enabled = true;
  assert.equal(mb.enabled, true, 'enabled vuelve a ser una propiedad común');
  fog._godRayTier = tier;
  assert.equal(fog._godRayTier.temporal, true, 'tier high pasa sin filtro');
  assert.equal(statusJson(sandbox.MF_AntiTear), JSON.stringify({ enabled: false, motionBlur: false, godRays: false, game: false }));
});

test('el keeper re-engancha cuando el juego recrea el manager (cambio de mundo)', async () => {
  const { sandbox, timers } = makeSandbox();
  const { game, mb } = makeGameWithPasses();
  installGame(sandbox, game);
  vm.runInContext(SRC, sandbox, { filename: 'src/Render/MF_AntiTear.js' });
  configEvent(sandbox, true);
  assert.equal(sandbox.MF_AntiTear.status().motionBlur, true);
  // nuevo mundo: passes nuevos sin clamp
  const fresh = makeGameWithPasses();
  game.post = fresh.game.post;
  assert.equal(fresh.mb.enabled, true, 'los passes frescos nacen limpios');
  const keeper = timers[timers.length - 1];
  keeper();
  assert.equal(fresh.mb.enabled, false, 'el keeper los clampa en el próximo tick');
  assert.equal(sandbox.MF_AntiTear.status().motionBlur, true);
});

test('sin juego a la vista no explota (fail-open)', () => {
  const { sandbox } = makeSandbox();
  vm.runInContext(SRC, sandbox, { filename: 'src/Render/MF_AntiTear.js' });
  configEvent(sandbox, true);
  assert.equal(statusJson(sandbox.MF_AntiTear), JSON.stringify({ enabled: true, motionBlur: false, godRays: false, game: false }));
  configEvent(sandbox, false);
  assert.equal(sandbox.MF_AntiTear.status().enabled, false);
});
