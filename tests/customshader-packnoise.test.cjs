// mf customshader — pack noise de nubes: el toggle vivía muerto porque
// fetchPackTexture dependía de chrome.runtime.getURL (inexistente en el
// MAIN world de la página) → failed=true para siempre y ni siquiera el OFF
// restauraba la textura vanilla. fix: la base de assets viaja en el evento
// (shaderAssetsBase, igual que waterSplash), build lazy de la textura 3D
// (las nubes pueden no existir aún) + restore real al apagar + cache.
// run: node tests/customshader-packnoise.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC_CS = fs.readFileSync(path.join(ROOT, 'src', 'Shaders', 'CustomShader.js'), 'utf8');

const BASE = 'chrome-extension://fakeid/assets/shadertextures/';
const FILE = 'CloudNoise_128_128_128.bin';
const NOISE = new Uint8Array(128 * 128 * 128 * 4).fill(200);

// textura 3D "del juego": el módulo roba este constructor para la del pack
class Fake3DTex {
  constructor(data, w, h, d) {
    this.isDataTexture = true;
    this.image = { data, width: w, height: h, depth: d };
    this.format = 0; this.type = 0;
    this.minFilter = 0; this.magFilter = 0;
    this.wrapS = 0; this.wrapT = 0; this.wrapR = 0;
  }
}

function makeCtx({ withBase = true } = {}) {
  const vanillaTex = {
    isTexture: true,
    minFilter: 1003, magFilter: 1003,
    wrapS: 1048, wrapT: 1048, wrapR: 1048,
    constructor: Fake3DTex
  };
  const uniforms = {
    uCoverage: { value: 0.5 },
    uNoiseScale: { value: 0.012 },
    uWind: { value: 0.02 },
    uThickness: { value: 30 },
    uCloudY: { value: 128 },
    uOpacity: { value: 0.9 },
    uNoiseTex: { value: vanillaTex }
  };
  const cloudsMesh = { name: 'clouds', material: { uniforms }, parent: null };
  const scene = { children: [cloudsMesh] };
  cloudsMesh.parent = scene;
  const game = { player: { pos: { x: 0, y: 64, z: 0 } }, gameScene: { scene } };
  const reactRoot = {
    '__reactContainer$test': {
      updateQueue: { baseState: { element: { props: { game } } } }
    }
  };

  const warns = [];
  const fetchUrls = [];
  const listeners = {};
  const ctx = {
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      getElementById: (id) => (id === 'react' ? reactRoot : null),
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      removeEventListener() {},
      createElement: () => ({ getContext: () => null }),
      body: { appendChild() {} },
      documentElement: { style: {} },
      head: { appendChild() {} }
    },
    localStorage: {
      _m: {},
      getItem(k) { return this._m[k] ?? null; },
      setItem(k, v) { this._m[k] = String(v); },
      removeItem(k) { delete this._m[k]; }
    },
    console: {
      info() {}, log() {}, error() {},
      warn(...a) { warns.push(a.join(' ')); }
    },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    fetch(url) {
      fetchUrls.push(String(url));
      return Promise.resolve({ ok: true, arrayBuffer: async () => NOISE.buffer });
    },
    WebGL2RenderingContext: class {},
    WebGLRenderingContext: class {},
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } },
    Image: class { set src(_) {} },
    Float32Array, Uint8Array, Uint32Array
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const dispatch = (cfg) => {
    for (const fn of listeners['minifeather:custom-shader-config'] || []) {
      fn({ detail: JSON.stringify(cfg) });
    }
  };
  const flush = () => new Promise((r) => setTimeout(r, 15));
  return { ctx, dispatch, flush, warns, fetchUrls, uniforms, vanillaTex, cloudsMesh, scene };
}

test('pack noise ON: trae el bin vía shaderAssetsBase, construye la 3D y la aplica', async () => {
  const { ctx, dispatch, flush, fetchUrls, uniforms } = makeCtx();
  vm.runInContext(SRC_CS, ctx, { filename: 'CustomShader.js' });

  dispatch({ clouds: { coverage: 0.4 }, cloudsPackNoise: true, shaderAssetsBase: BASE });
  await flush();

  assert.equal(fetchUrls.length, 1, 'un solo fetch');
  assert.equal(fetchUrls[0], BASE + FILE, 'el fetch usa la base mandada por el panel');
  const tex = uniforms.uNoiseTex.value;
  assert.ok(tex instanceof Fake3DTex, 'uNoiseTex ahora es la textura 3D del pack');
  assert.equal(tex.format, 1023, 'formato RGBA del bin');
  assert.equal(tex.type, 1009);
  assert.equal(uniforms.uCoverage.value, 0.4, 'la config de nubes también aterrizó');
});

test('pack noise OFF: devuelve la textura vanilla; ON de nuevo NO re-descarga', async () => {
  const { ctx, dispatch, flush, fetchUrls, uniforms, vanillaTex } = makeCtx();
  vm.runInContext(SRC_CS, ctx, { filename: 'CustomShader.js' });

  dispatch({ cloudsPackNoise: true, shaderAssetsBase: BASE });
  await flush();
  assert.ok(uniforms.uNoiseTex.value instanceof Fake3DTex);

  dispatch({ cloudsPackNoise: false });
  await flush();
  assert.equal(uniforms.uNoiseTex.value, vanillaTex, 'OFF restaura el vanilla (antes ponía needsUpdate en el pack: no-op)');

  dispatch({ cloudsPackNoise: true, shaderAssetsBase: BASE });
  await flush();
  assert.ok(uniforms.uNoiseTex.value instanceof Fake3DTex, 're-ON reaplica desde cache');
  assert.equal(fetchUrls.length, 1, 'sin segundo fetch: la textura vive en cache');
});

test('sin shaderAssetsBase: warn loud (antes fallaba en silencio para siempre)', async () => {
  const { ctx, dispatch, flush, warns, uniforms, vanillaTex } = makeCtx();
  vm.runInContext(SRC_CS, ctx, { filename: 'CustomShader.js' });

  dispatch({ cloudsPackNoise: true });   // sin base
  await flush();
  assert.ok(warns.some((w) => w.includes('shaderAssetsBase')), 'warn de base ausente: ' + JSON.stringify(warns));
  assert.equal(uniforms.uNoiseTex.value, vanillaTex, 'sin transporte no toca nada');
});

test('flujo menú→mundo: sin nubes el bin se baja igual y al aparecer la malla se aplica', async () => {
  const { ctx, dispatch, flush, fetchUrls, uniforms, vanillaTex, cloudsMesh, scene } = makeCtx();
  vm.runInContext(SRC_CS, ctx, { filename: 'CustomShader.js' });

  // en el menú no hay malla de nubes
  scene.children.length = 0;
  cloudsMesh.parent = null;
  dispatch({ cloudsPackNoise: true, shaderAssetsBase: BASE });
  await flush();
  assert.equal(fetchUrls.length, 1, 'el fetch no depende de que la malla exista');
  assert.equal(uniforms.uNoiseTex.value, vanillaTex, 'la malla ausente no se toca');

  // entra al mundo: aparece la malla → el re-apply del config la viste
  scene.children.push(cloudsMesh);
  cloudsMesh.parent = scene;
  dispatch({ clouds: { coverage: 0.5 }, cloudsPackNoise: true, shaderAssetsBase: BASE });
  await flush();
  const tex = uniforms.uNoiseTex.value;
  assert.ok(tex instanceof Fake3DTex, 'textura construida lazy al aparecer la malla');
  assert.equal(tex.image.data.byteLength, NOISE.byteLength, 'bin completo de 128³×4');
});
