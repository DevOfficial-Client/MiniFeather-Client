// mf rainbow: dos modos de "no veo el arcoíris" reportados por el usuario —
// 1) NoWeather parchea world.getRainStrength a () => 0: la señal existe,
//    jamás anuncia lluvia → el modo post-lluvia (default) lo esconde para
//    siempre y el fail-open no salta. fix: degradar a "siempre".
// 2) MF_Rainbow.force() respetaba el gating solar (lift × uSunLight):
//    forzarlo de noche seguía sin ver nada. fix: force salta todo el gating.
// run: node tests/rainbow-noweather-force.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC_RB = fs.readFileSync(path.join(ROOT, 'src', 'Render', 'MF_Rainbow.js'), 'utf8');

// ── fakes ───────────────────────────────────────────────────────────────

class FakeAttr { constructor(arr, n) { this.array = arr; this.itemSize = n; } }
class FakeGeometry {
  constructor() { this.attributes = {}; }
  setAttribute(k, a) { this.attributes[k] = a; }
  setIndex(a) { this.index = a; }
  computeBoundingSphere() { this.boundingSphere = {}; }
}
class FakeFluidMesh {
  constructor(g, m) {
    this.geometry = g;
    this.material = m;
    this.matrix = { set() {} };   // Matrix4 del three real: el frame escribe aquí
  }
}
class FakeScene {
  constructor() { this.children = []; }
  add(o) { o.parent = this; this.children.push(o); }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); }
  traverse(cb) { for (const c of this.children.slice()) cb(c); }
}

function makeWorld(rainStrength) {
  return { getRainStrength: () => rainStrength() };
}

// game con fiber falso + reloj controlable + cola de rAF manual
function makeTickCtx({ sun, sunLight, rain }) {
  const fluidUD = {
    waterShadersEnabled: true,
    sunDirection: sun,                 // objeto vivo, como el juego
    uSunLight: { value: sunLight }
  };
  const fluidMat = {
    userData: fluidUD,
    color: { setRGB() {} },
    emissive: { setRGB() {} },
    map: null,
    clone() {
      // copy() de three real: userData viaja por JSON
      const m = Object.assign({}, this, { userData: JSON.parse(JSON.stringify(this.userData)) });
      return m;
    }
  };
  const geo = new FakeGeometry();
  geo.attributes.position = new FakeAttr(new Float32Array(3), 3);
  const scene = new FakeScene();
  scene.add(new FakeFluidMesh(geo, fluidMat));

  const game = {
    player: { pos: { x: 0, y: 64, z: 0 } },
    world: makeWorld(rain),
    gameScene: { scene, camera: { x: 0, y: 64, z: 0 } }
  };
  const reactRoot = {
    '__reactContainer$test': {
      updateQueue: { baseState: { element: { props: { game } } } }
    }
  };

  const ctx = {
    __now: 0,
    __raf: [],
    document: {
      getElementById: (id) => (id === 'react' ? reactRoot : null),
      addEventListener() {}
    },
    localStorage: {
      _m: {},
      getItem(k) { return this._m[k] ?? null; },
      setItem(k, v) { this._m[k] = String(v); },
      removeItem(k) { delete this._m[k]; }
    },
    console: { info() {}, warn() {}, error() {}, log() {} },
    performance: { now() { return ctx.__now; } },
    requestAnimationFrame(cb) { ctx.__raf.push(cb); return ctx.__raf.length; },
    cancelAnimationFrame() {},
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    Float32Array, Uint32Array
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return { ctx, fluidMat, fluidUD };
}

// hace avanzar el reloj y bombea los frames acumulados; paso chico porque
// el módulo clampea dt a 0.5s por frame (fade exponencial con dt real)
function drive(ctx, totalMs, step = 250) {
  for (let t = 0; t < totalMs; t += step) {
    ctx.__now += step;
    const cbs = ctx.__raf.splice(0);
    for (const cb of cbs) cb(ctx.__now);
  }
}

const DAY = { x: 0.2, y: 0.9, z: 0.1 };
const NIGHT = { x: 0.0, y: -1.0, z: 0.0 };

test('control: sin NoWeather y sin lluvia, el modo post-lluvia deja el arco apagado', () => {
  const { ctx } = makeTickCtx({ sun: DAY, sunLight: 1, rain: () => 0 });
  vm.runInContext(SRC_RB, ctx, { filename: 'MF_Rainbow.js' });
  ctx.MF_Rainbow.enable();
  drive(ctx, 40000);
  const st = ctx.MF_Rainbow.status();
  assert.equal(st.noWeather, false);
  assert.ok(st.showFactor < 0.05, 'sin lluvia que pare, no hay ventana: showFactor=' + st.showFactor);
  assert.equal(st.uMfRbI, 0, 'el arco emite exactamente 0 — invisible');
});

test('NoWeather activo: la señal congelada a 0 degrada el modo post-lluvia a "siempre"', () => {
  const { ctx } = makeTickCtx({ sun: DAY, sunLight: 1, rain: () => 0 });
  ctx.MiniFeatherNoWeather = { enabled: true };   // global de NoWeather (mismo MAIN world)
  vm.runInContext(SRC_RB, ctx, { filename: 'MF_Rainbow.js' });
  ctx.MF_Rainbow.enable();
  drive(ctx, 40000);
  const st = ctx.MF_Rainbow.status();
  assert.equal(st.noWeather, true);
  assert.ok(st.showFactor > 0.9, 'degradado a siempre: showFactor=' + st.showFactor);
  assert.ok(st.uMfRbI > 0.3, 'el arco emite de verdad: uMfRbI=' + st.uMfRbI);
});

test('el ciclo post-lluvia real sigue funcionando (llueve → para → ventana 150s)', () => {
  const { ctx } = makeTickCtx({ sun: DAY, sunLight: 1, rain: () => (ctx.__now < 20000 ? 1 : 0) });
  vm.runInContext(SRC_RB, ctx, { filename: 'MF_Rainbow.js' });
  ctx.MF_Rainbow.enable();
  drive(ctx, 8000);
  let st = ctx.MF_Rainbow.status();
  assert.equal(st.raining, true, 'durante la lluvia el arco se esconde');
  assert.ok(st.showFactor < 0.2, 'showFactor=' + st.showFactor);
  drive(ctx, 30000);
  st = ctx.MF_Rainbow.status();
  assert.equal(st.raining, false);
  assert.ok(st.showFactor > 0.9, 'ventana post-lluvia abierta: showFactor=' + st.showFactor);
});

test('force() salta el gating solar: arco visible incluso de noche', () => {
  const { ctx } = makeTickCtx({ sun: NIGHT, sunLight: 0, rain: () => 0 });
  vm.runInContext(SRC_RB, ctx, { filename: 'MF_Rainbow.js' });
  ctx.MF_Rainbow.enable();
  ctx.MF_Rainbow.force(60000);
  drive(ctx, 12000);
  const st = ctx.MF_Rainbow.status();
  assert.equal(st.forced, true);
  assert.equal(st.lift, 1, 'el force anula el lift nocturno');
  assert.ok(st.uMfRbI > 0.3, 'noche + force = arco visible: uMfRbI=' + st.uMfRbI);
});

test('de noche SIN force el arco sigue apagado (la física se queda intacta)', () => {
  const { ctx } = makeTickCtx({ sun: NIGHT, sunLight: 0, rain: () => 0 });
  ctx.MiniFeatherNoWeather = { enabled: true };
  vm.runInContext(SRC_RB, ctx, { filename: 'MF_Rainbow.js' });
  ctx.MF_Rainbow.enable();
  drive(ctx, 20000);
  const st = ctx.MF_Rainbow.status();
  assert.ok(st.showFactor > 0.9, 'degradado a siempre: showFactor=' + st.showFactor);
  assert.equal(st.uMfRbI, 0, 'pero de noche el gating solar lo mantiene en 0');
});

test('status() diagnostico: expone fluidMat/sunDir/sunLight para reportes del usuario', () => {
  const { ctx } = makeTickCtx({ sun: DAY, sunLight: 0.8, rain: () => 0 });
  vm.runInContext(SRC_RB, ctx, { filename: 'MF_Rainbow.js' });
  ctx.MF_Rainbow.enable();
  drive(ctx, 4000);   // el frame loop es quien lee uSunLight del fluido
  const st = ctx.MF_Rainbow.status();
  for (const k of ['mesh', 'fluidMat', 'sunDir', 'lift', 'sunLight', 'uMfRbI', 'forced', 'noWeather']) {
    assert.ok(k in st, 'falta ' + k + ' en status()');
  }
  assert.equal(st.mesh, true);
  assert.equal(st.fluidMat, true);
  assert.equal(st.sunDir, true);
  assert.equal(st.sunLight, 0.8);
});
