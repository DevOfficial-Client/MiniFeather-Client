// mf kotosky: domo cubemap nocturno ("nighttime sky" by koto). tests por
// conducta: montaje del domo, factor noche por elevación del sol, lluvia,
// nether, day-gate y limpieza al apagar/re-ejecutar.
// run: node tests/kotosky.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'Shaders', 'MF_KotoSky.js'), 'utf8');

// ── fakes ───────────────────────────────────────────────────────────────

class FakeImage {
  constructor() { FakeImage.instances.push(this); this.src = ''; }
}
FakeImage.instances = [];

class FakeTexture {
  constructor() { this.isTexture = true; this.image = null; this.flipY = true; }
}

class FakeShaderMaterial {
  constructor(opts) {
    Object.assign(this, { uniforms: {}, vertexShader: '', fragmentShader: '' }, opts);
    this.disposed = false;
  }
  dispose() { this.disposed = true; }
}

class FakeSphereGeometry {
  constructor(radius, widthSegments, heightSegments) {
    this.parameters = { radius, widthSegments, heightSegments };
    this.disposed = false;
  }
  dispose() { this.disposed = true; }
}

class FakeGroup {
  constructor() { this.children = []; }
  add(o) { o.parent = this; this.children.push(o); }
  remove(o) {
    const i = this.children.indexOf(o);
    if (i >= 0) this.children.splice(i, 1);
    if (o.parent === this) o.parent = null;
  }
}

class FakeMesh {
  constructor(geo, mat) { this.geometry = geo; this.material = mat; this.position = { set() {} }; }
}

// game con la forma que el módulo espera vía #react: fiber falso -> props.game
function makeGame(opts = {}) {
  const sunTex = new FakeTexture();
  const game = {
    player: { pos: { x: 10, y: 64, z: -20 } },
    world: {
      dimension: opts.dimension ?? 0,
      hasDaylightSky() { return this.dimension === 0 || this.dimension === 2; },
      getRainStrength() { return opts.rain ?? 0; }
    },
    gameScene: {
      ambientMeshes: new FakeGroup(),
      scene: new FakeGroup(),
      sky: {
        atmosphere: {
          geometry: new FakeSphereGeometry(5000, 32, 16),
          material: Object.assign(new FakeShaderMaterial({ side: 1 }), { constructor: FakeShaderMaterial })
        }
      },
      sun: {
        sunDist: 5e4,
        sun: { material: { map: sunTex } },
        moon: { material: { map: sunTex } },
        offset: { y: (opts.sunY ?? 0) * 5e4 }
      }
    }
  };
  // el constructor de la atmósfera fake: clone de FakeSphereGeometry con params propios
  game.gameScene.sky.atmosphere.constructor = FakeMesh;
  return game;
}

function installGame(sandbox, game) {
  sandbox.document.getElementById = (id) => {
    if (id !== 'react') return null;
    return { __reactContainer$test: { updateQueue: { baseState: { element: { props: { game } } } } } };
  };
}

function makeSandbox() {
  const docListeners = {};
  const storage = {};
  const timeouts = [];
  let rafQueue = [];
  let clock = 0;
  const sandbox = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    performance: { now: () => clock },
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; }
    },
    setTimeout(fn, ms) { timeouts.push({ fn, at: clock + ms }); return timeouts.length; },
    clearTimeout() {},
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame() { rafQueue = []; },
    Image: FakeImage,
    chrome: { runtime: { getURL: (p) => 'chrome-extension://fake/' + p } },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } },
    document: {
      getElementById: () => null,
      addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
      removeEventListener() {},
      dispatchEvent(evt) { for (const fn of docListeners[evt.type] || []) fn(evt); return true; }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return {
    sandbox, docListeners, timeouts,
    advance(ms) { clock += ms; },
    pump() {
      const q = rafQueue; rafQueue = [];
      for (const fn of q) fn();
      return q.length;
    },
    flushTimeouts() {
      let ran = 0;
      for (const t of timeouts.splice(0)) { if (t.at <= clock) { t.fn(); ran++; } }
      return ran;
    }
  };
}

function loadModule(sandbox) {
  vm.runInContext(SRC, sandbox, { filename: 'src/Shaders/MF_KotoSky.js' });
  return sandbox.MF_KotoSky;
}

function configEvent(sandbox, detail) {
  sandbox.document.dispatchEvent(new sandbox.CustomEvent('minifeather:kotosky-config', {
    detail: JSON.stringify(detail)
  }));
}

// carga las 6 caras y deja el módulo listo para materializar texturas
function loadAllFaces(sandbox) {
  for (const img of FakeImage.instances.splice(0)) img.onload();
  assert.equal(FakeImage.instances.length, 0);
}

// enable + scan + primer frame: domo montado y frame corrido
function bootAtNight(opts) {
  const h = makeSandbox();
  const game = makeGame(opts);
  installGame(h.sandbox, game);
  const api = loadModule(h.sandbox);
  configEvent(h.sandbox, { enabled: true, strength: 1 });
  h.advance(2100);
  assert.equal(h.flushTimeouts(), 1, 'el scan idle corre');
  loadAllFaces(h.sandbox);
  h.pump();  // materializa texturas + monta domo
  return { h, game, api, mesh: game.gameScene.ambientMeshes.children[0] };
}

// ── tests ───────────────────────────────────────────────────────────────

test('arranca inactivo y expone su api', () => {
  const h = makeSandbox();
  const api = loadModule(h.sandbox);
  assert.ok(api, 'api global presente');
  assert.deepEqual(JSON.stringify(api.status()), JSON.stringify({
    enabled: false, loaded: false, failed: false, strength: 1, mix: 0, mounted: false
  }));
});

test('de noche monta el domo y lo funde a mix 1', () => {
  const { h, game, mesh, api } = bootAtNight({ sunY: -0.5 });
  assert.ok(mesh, 'domo montado en ambientMeshes');
  assert.equal(mesh.renderOrder, -3, 'antes que sol/luna y estrellas');
  assert.equal(game.gameScene.ambientMeshes.children.length, 1, 'un solo domo');
  const mat = mesh.material;
  for (const u of ['tMfSouth', 'tMfEast', 'tMfNorth', 'tMfWest', 'tMfUp', 'tMfDown', 'uMfMix']) {
    assert.ok(u in mat.uniforms, `uniform ${u} presente`);
  }
  assert.equal(mat.uniforms.tMfSouth.value.isTexture, true, 'caras materializadas con Texture robada');
  assert.equal(mat.uniforms.tMfSouth.value.flipY, false, 'flip horneado en el uv, flipY off');
  assert.equal(mat.uniforms.tMfSouth.value.image instanceof FakeImage, true);
  assert.equal(mat.transparent, true, 'fusión por alpha sobre el gradiente vanilla');
  assert.equal(mat.depthWrite, false);
  for (let i = 0; i < 120; i++) h.pump();
  assert.ok(api.status().mix > 0.98, 'mix converge a 1 de noche');
  assert.equal(mesh.visible, true);
});

test('de día el domo queda oculto (mix 0)', () => {
  const { h, mesh, api } = bootAtNight({ sunY: 0.5 });
  for (let i = 0; i < 60; i++) h.pump();
  assert.equal(api.status().mix, 0);
  assert.equal(mesh.visible, false, 'de día ni se dibuja');
});

test('anochecer gradual: mix sube con la profundidad del sol', () => {
  // sun a -0.06 de sunDist: depth 0.06 < 0.12 → mezcla parcial
  const { h, api } = bootAtNight({ sunY: -0.06 });
  for (let i = 0; i < 120; i++) h.pump();
  const partial = api.status().mix;
  assert.ok(partial > 0.05 && partial < 0.6, `crepúsculo → mix parcial (${partial.toFixed(2)})`);
});

test('la lluvia apaga el foto-cielo', () => {
  const { h, api } = bootAtNight({ sunY: -0.5, rain: 1 });
  for (let i = 0; i < 120; i++) h.pump();
  assert.ok(api.status().mix < 0.15, `lluvia a tope → mix casi 0 (${api.status().mix.toFixed(2)})`);
});

test('nether/end: nada se monta ni se ve', () => {
  const { game, mesh, api } = bootAtNight({ sunY: -0.5, dimension: 1 });
  assert.ok(mesh, 'el domo existe pero…');
  assert.equal(api.status().mix, 0);
  assert.equal(mesh.visible, false, '…oculto (el nether no tiene cielo)');
  assert.equal(game.gameScene.ambientMeshes.children.length, 1);
});

test('el domo sigue al jugador', () => {
  const { h, game, mesh } = bootAtNight({ sunY: -0.5 });
  let placed = null;
  mesh.position.set = (x, y, z) => { placed = [x, y, z]; };
  h.pump();
  assert.deepEqual(placed, [game.player.pos.x, game.player.pos.y, game.player.pos.z]);
});

test('el slider de intensidad escala la mezcla', () => {
  const { h, api } = bootAtNight({ sunY: -0.5 });
  configEvent(h.sandbox, { strength: 0.5 });
  for (let i = 0; i < 120; i++) h.pump();
  assert.ok(Math.abs(api.status().mix - 0.5) < 0.02, `strength 0.5 → mix 0.5 (${api.status().mix.toFixed(2)})`);
});

test('disable desmonta el domo y su material muere', () => {
  const { h, game, mesh, api } = bootAtNight({ sunY: -0.5 });
  configEvent(h.sandbox, { enabled: false });
  assert.equal(game.gameScene.ambientMeshes.children.length, 0, 'domo fuera de la escena');
  assert.equal(mesh.material.disposed, true);
  assert.equal(api.status().mounted, false);
});

test('re-ejecución (hot reload) no duplica domos', () => {
  const h = makeSandbox();
  const game = makeGame({ sunY: -0.5 });
  installGame(h.sandbox, game);
  loadModule(h.sandbox);
  configEvent(h.sandbox, { enabled: true });
  h.advance(2100); h.flushTimeouts();
  loadAllFaces(h.sandbox);
  h.pump();
  loadModule(h.sandbox);   // segunda inyección del mismo archivo
  assert.equal(game.gameScene.ambientMeshes.children.length, 0, 'el destroy previo desmonta');
  configEvent(h.sandbox, { enabled: true });
  h.advance(2100); h.flushTimeouts();
  loadAllFaces(h.sandbox);
  h.pump();
  assert.equal(game.gameScene.ambientMeshes.children.length, 1, 'exactamente un domo');
});

test('fail-open: una cara que no carga deja el módulo inerte, sin domo', () => {
  const h = makeSandbox();
  const game = makeGame({ sunY: -0.5 });
  installGame(h.sandbox, game);
  const api = loadModule(h.sandbox);
  configEvent(h.sandbox, { enabled: true });
  h.advance(2100); h.flushTimeouts();
  FakeImage.instances[2].onerror();
  h.pump(); h.pump();
  assert.equal(api.status().failed, true);
  assert.equal(game.gameScene.ambientMeshes.children.length, 0);
});

// ── integración estática: panel, manifest, mirror, credits ─────────────

test('integración estática completa', () => {
  const panel = fs.readFileSync(path.join(ROOT, 'src', 'UI', 'ClientPanel.js'), 'utf8');
  assert.match(panel, /kotoSky: false,\r?\n    kotoSkyStrength: 1\.0/, 'DEFAULT_SETTINGS');
  assert.match(panel, /key: 'kotoSky', title: 'koto sky'/, 'entrada en getModuleIndex');
  assert.match(panel, /initKotoSkyModule\(\)/, 'lifecycle registrado');
  assert.match(panel, /setModuleEnabled\('kotoSky', settings\.kotoSky\)/, 'boot');
  assert.match(panel, /minifeather:kotosky-config/, 'evento de config');
  assert.match(panel, /koto: 'kotoSky', kotosky: 'kotoSky'/, 'aliases de comando');
  assert.match(panel, /kotoSky: \['[kvb+.]{8}'/, 'icono pixel en el mapa');

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.ok(
    manifest.web_accessible_resources.some(r => r.resources.includes('assets/koto_sky/*')),
    'caras servibles por la extensión'
  );

  const mirror = JSON.parse(fs.readFileSync(path.join(ROOT, 'mirror.json'), 'utf8'));
  assert.ok(mirror.mainStart.includes('src/Shaders/MF_KotoSky.js'), 'mirror.json mainStart');
  const mirrorJs = fs.readFileSync(path.join(ROOT, 'src', 'Core', 'mirror.js'), 'utf8');
  assert.ok(mirrorJs.includes('src/Shaders/MF_KotoSky.js'), 'mirror.js regenerado');

  const credits = fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
  assert.match(credits, /\*\*koto\*\* — "nighttime sky by koto"/, 'crédito del autor del pack');

  // las 6 caras existen y son PNG reales (el pack venía como BMP disfrazado)
  for (let i = 0; i < 6; i++) {
    const png = fs.readFileSync(path.join(ROOT, 'assets', 'koto_sky', `face_${i}.png`));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `face_${i} es PNG`);
  }

  // el shader del domo declara las 6 caras y el mix, y usa el orden Bedrock
  assert.match(SRC, /tMfSouth[\s\S]*tMfEast[\s\S]*tMfNorth[\s\S]*tMfWest[\s\S]*tMfUp[\s\S]*tMfDown/);
  assert.match(SRC, /uMfMix/);
});
