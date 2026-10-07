// mf antitear v2: el manager de post del juego es inalcanzable (closure del
// bundle), así que el clamp vive en los prototipos WebGL2: captura las
// locations de uVelocityScale/uHistoryWeight por nombre y aplasta sus uploads.
// run: node tests/antitear.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'Render', 'MF_AntiTear.js'), 'utf8');

function makeSandbox({ withWebGL = true } = {}) {
  const docListeners = {};
  const sandbox = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    document: {
      getElementById: () => null,
      addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
      removeEventListener() {},
      dispatchEvent(evt) { for (const fn of docListeners[evt.type] || []) fn(evt); return true; }
    },
    performance: { now: () => Date.now() },
    setInterval() { return 1; },
    clearInterval() {},
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
  };
  if (withWebGL) {
    // imita el par getUniformLocation/uniform1f: locations son objetos nuevos
    // por (programa, nombre) y uniform1f registra lo que llega a "la gpu"
    const uploads = [];
    const locations = new Map();
    class FakeWebGL2RenderingContext {}
    FakeWebGL2RenderingContext.prototype.getUniformLocation = function (program, name) {
      const key = program.id + ':' + name;
      if (!locations.has(key)) locations.set(key, { program: program.id, name });
      return locations.get(key);
    };
    FakeWebGL2RenderingContext.prototype.uniform1f = function (loc, v) {
      uploads.push({ name: loc.name, v });
      return undefined;
    };
    FakeWebGL2RenderingContext.prototype.uniform1i = function (loc, v) {
      uploads.push({ name: loc.name, v });
      return undefined;
    };
    sandbox.WebGL2RenderingContext = FakeWebGL2RenderingContext;
    sandbox.__uploads = uploads;
  }
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return { sandbox, docListeners };
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
  const s = sandbox.MF_AntiTear.status();
  assert.equal(s.enabled, false);
  assert.equal(s.hooked, false);
});

test('enable clampa los uploads de uVelocityScale y uHistoryWeight (uVelocityScale=0 es passthrough exacto según el shader del juego)', () => {
  const { sandbox } = makeSandbox();
  vm.runInContext(SRC, sandbox, { filename: 'src/Render/MF_AntiTear.js' });
  configEvent(sandbox, true);
  const gl = new sandbox.WebGL2RenderingContext();
  const prog = { id: 'mb' };
  const locVel = gl.getUniformLocation(prog, 'uVelocityScale');
  const locHist = gl.getUniformLocation({ id: 'fog' }, 'uHistoryWeight');
  const locGI = gl.getUniformLocation({ id: 'chunk' }, 'uGIEnabled');
  gl.uniform1f(locVel, 0.65);   // lo que el juego le metería al blur
  gl.uniform1f(locHist, 0.9);   // historial del fog/god rays
  gl.uniform1f(locGI, 1.0);     // voxel GI prendido
  const vel = sandbox.__uploads.find(u => u.name === 'uVelocityScale');
  const hist = sandbox.__uploads.find(u => u.name === 'uHistoryWeight');
  const gi = sandbox.__uploads.find(u => u.name === 'uGIEnabled');
  assert.equal(vel.v, 0, 'motion blur → passthrough exacto');
  assert.equal(hist.v, 0, 'fog/god rays → sin historial');
  assert.equal(gi.v, 0, 'voxel GI → off (skip all GI work)');
  assert.equal(sandbox.MF_AntiTear.status().motionBlur, true);
  assert.equal(sandbox.MF_AntiTear.status().godRays, true);
  assert.equal(sandbox.MF_AntiTear.status().gi, true);
});

test('las demás uniforms pasan intactas (los otros módulos usan el mismo contexto)', () => {
  const { sandbox } = makeSandbox();
  vm.runInContext(SRC, sandbox, { filename: 'src/Render/MF_AntiTear.js' });
  configEvent(sandbox, true);
  const gl = new sandbox.WebGL2RenderingContext();
  const loc = gl.getUniformLocation({ id: 'otro' }, 'uGodRayStrength');
  gl.uniform1f(loc, 0.42);
  const up = sandbox.__uploads.find(u => u.name === 'uGodRayStrength');
  assert.equal(up.v, 0.42, 'uniform ajena sin tocar');
});

test('disable restaura los prototipos: la gpu vuelve a recibir los valores reales', () => {
  const { sandbox } = makeSandbox();
  vm.runInContext(SRC, sandbox, { filename: 'src/Render/MF_AntiTear.js' });
  configEvent(sandbox, true);
  configEvent(sandbox, false);
  const gl = new sandbox.WebGL2RenderingContext();
  const loc = gl.getUniformLocation({ id: 'mb' }, 'uVelocityScale');
  gl.uniform1f(loc, 0.65);
  const up = sandbox.__uploads.find(u => u.name === 'uVelocityScale');
  assert.equal(up.v, 0.65, 'sin clamp tras disable');
  assert.equal(sandbox.MF_AntiTear.status().hooked, false);
});

test('sin WebGL2 en el entorno no explota (fail-open, ctx viejos incluidos)', () => {
  const { sandbox } = makeSandbox({ withWebGL: false });
  vm.runInContext(SRC, sandbox, { filename: 'src/Render/MF_AntiTear.js' });
  configEvent(sandbox, true);
  const s = sandbox.MF_AntiTear.status();
  assert.equal(s.enabled, true);
  assert.equal(s.hooked, false, 'no hay proto que hookear');
  configEvent(sandbox, false);
  assert.equal(sandbox.MF_AntiTear.status().enabled, false);
});

test('re-enable vuelve a hookear después de un disable', () => {
  const { sandbox } = makeSandbox();
  vm.runInContext(SRC, sandbox, { filename: 'src/Render/MF_AntiTear.js' });
  configEvent(sandbox, true);
  configEvent(sandbox, false);
  configEvent(sandbox, true);
  const gl = new sandbox.WebGL2RenderingContext();
  const loc = gl.getUniformLocation({ id: 'mb' }, 'uVelocityScale');
  gl.uniform1f(loc, 0.65);
  const up = sandbox.__uploads.find(u => u.name === 'uVelocityScale');
  assert.equal(up.v, 0, 'clamp activo otra vez');
});
