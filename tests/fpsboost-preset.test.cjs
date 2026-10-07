// mf fpsboost: el preset potato escribía fastRender/entities en el store de
// settings DEL JUEGO → el pipeline de chunks tomaba caminos que rompían el
// mergeGeometries de tile entities → camas/cofres invisibles (vuelven al
// apagar el client porque FpsBoost restaura su snapshot). fix: potato ya no
// toca los settings que cambian la forma del pipeline; solo knobs seguros.
// run: node tests/fpsboost-preset.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'Render', 'FpsBoost.js'), 'utf8');

// store de settings del juego con la forma que bfs puntúa (>=8 celdas .value)
function makeStore() {
  return {
    resolution: { value: 100 },
    renderDistance: { value: 8 },
    particles: { value: 100 },
    inventoryParticles: { value: true },
    lighting: { value: 'Fancy' },
    dynamicLighting: { value: true },
    globalIllumination: { value: 'Full' },
    clouds: { value: 'Fancy' },
    stars: { value: true },
    atmosphericSky: { value: true },
    grassWave: { value: true },
    fastRender: { value: false },
    entities: { value: 'Fancy' },
    godRays: { value: 'Fancy' },
    bloom: { value: 0.5 },
    waterShaders: { value: true },
    shadows: { value: 'All' }
  };
}

function makeCtx(store) {
  const game = {
    player: { pos: { x: 0, y: 64, z: 0 } },
    world: {},
    graphics: store
  };
  const reactRoot = {
    '__reactContainer$test': {
      updateQueue: { baseState: { element: { props: { game } } } }
    }
  };
  const dispatched = [];
  const ctx = {
    document: {
      getElementById: (id) => (id === 'react' ? reactRoot : null),
      querySelector: () => reactRoot,
      addEventListener(type, fn) { (ctx.__listeners[type] ||= []).push(fn); },
      removeEventListener() {}
    },
    __listeners: {},
    performance: { now: () => 0 },
    setTimeout: () => 1,
    clearTimeout() {},
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } },
    console: { info() {}, warn() {}, error() {}, log() {} }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.__dispatch = (type, detail) => {
    for (const fn of ctx.__listeners[type] || []) fn({ detail });
    dispatched.push({ type, detail });
  };
  return { ctx, game, store, dispatched };
}

test('potato SIN fastRender/entities: el boost no cambia la forma del pipeline', () => {
  const { ctx, store } = makeCtx(makeStore());
  vm.runInContext(SRC, ctx, { filename: 'FpsBoost.js' });
  assert.equal(ctx.MF_FpsBoost.storeFound, false, 'aún no escaneó');

  ctx.MF_FpsBoost.setEnabled(true);
  assert.equal(ctx.MF_FpsBoost.enabled, true);
  assert.equal(ctx.MF_FpsBoost.storeFound, true, 'store del juego encontrado');

  // los knobs seguros SÍ se aplican
  assert.equal(store.resolution.value, 60, 'resolution bajada');
  assert.equal(store.renderDistance.value, 3, 'renderDistance bajada');
  assert.equal(store.particles.value, 10, 'particles bajadas');
  assert.equal(store.clouds.value, 'None', 'nubes fuera');

  // los que rompen el merge de tile entities: INTOCADOS
  assert.equal(store.fastRender.value, false, 'fastRender del usuario intacto');
  assert.equal(store.entities.value, 'Fancy', 'calidad de entidades intacta');

  // apagar restaura el snapshot completo
  ctx.MF_FpsBoost.setEnabled(false);
  assert.equal(store.resolution.value, 100);
  assert.equal(store.renderDistance.value, 8);
  assert.equal(store.clouds.value, 'Fancy');
  assert.equal(store.fastRender.value, false);
});

test('regresión estática: el preset potato no vuelve a llevar fastRender ni entities', () => {
  const block = SRC.match(/potato:\s*\{[\s\S]*?\n    \}/);
  assert.ok(block, 'preset potato presente');
  assert.ok(!/fastRender\s*:/.test(block[0]), 'fastRender fuera del preset');
  assert.ok(!/entities\s*:/.test(block[0]), 'entities fuera del preset');
});
