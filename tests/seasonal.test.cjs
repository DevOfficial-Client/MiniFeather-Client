// temporadas: seasonal.json manda, matching solo por hash, fail-open.
// run: node tests/seasonal.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'Seasonal', 'MF_Seasonal.js'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'seasonal.json'), 'utf8'));

function makeSandbox(ls = {}) {
  const store = new Map(Object.entries(ls).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    navigator: { language: 'es' },
    document: {
      documentElement: { appendChild() {} },
      body: null,
      head: { appendChild() {} },
      getElementById: () => null,
      createElement: () => ({ style: { cssText: '', setProperty() {}, remove() {} }, set innerHTML(v) {}, addEventListener() {}, appendChild() {}, remove() {}, textContent: '', title: '', isConnected: false, querySelector: () => null }),
      querySelector: () => null
    },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      key: i => Array.from(store.keys())[i] || null,
      get length() { return store.size; }
    },
    crypto: undefined, // sin subtle: el hashing queda pendiente y nada revienta
    fetch: () => Promise.reject(new Error('offline')),
    performance: { now: () => Date.now() },
    TextDecoder: class { decode() { return ''; } },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; },
    clearInterval() {},
    atob: s2 => Buffer.from(s2, 'base64').toString('binary'),
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return { sandbox, store };
}

test('seasonal.json válida: solo ventanas completas, targets vacíos hoy', () => {
  assert.equal(CFG.v, 1);
  assert.ok(Array.isArray(CFG.events) && CFG.events.length >= 1, 'al menos una ventana');
  for (const ev of CFG.events) {
    assert.match(ev.id, /^[\w-]+$/);
    assert.match(ev.start, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(ev.end, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(ev.start <= ev.end);
    assert.ok(Array.isArray(ev.targets) && ev.targets.length === 0, 'sin objetivos: nada personal hasta que se decida');
  }
  const ids = CFG.events.map(e => e.id);
  assert.ok(ids.includes('halloween-2026'), 'halloween activo');
  assert.ok(ids.includes('navidad-2026') && ids.includes('otonio-2027'), 'ventanas del ano sembradas');
  assert.ok(CFG.night && Array.isArray(CFG.night.ambient) && CFG.night.ambient.length >= 1,
    'night: ambiente nocturno siempre-encendido');
  const VALID = ['snow', 'leaves', 'fireflies', 'meteors'];
  for (const t of CFG.night.ambient) assert.ok(VALID.includes(t), 'tipo de night valido: ' + t);
  for (const ev of CFG.events) {
    for (const t of ev.effects.ambient || []) assert.ok(VALID.includes(t), 'ambient valido en ' + ev.id);
  }
});

test('ambiente: whitelist de tipos, densidad clampeada y night normalizado', async () => {
  const { sandbox } = makeSandbox();
  sandbox.fetch = () => Promise.resolve({
    ok: true,
    json: async () => ({
      v: 1,
      night: { ambient: ['fireflies', 'meteors', 'uwu'], hours: [25, -3], density: 9 },
      events: [{
        id: 'fx', start: '2026-01-01', end: '2026-12-31',
        effects: { ambient: ['snow', 'dragones', 'leaves', 'fireflies', 'meteors'], ambientDensity: 99 },
        targets: []
      }]
    })
  });
  vm.runInContext(SRC, sandbox, { filename: 'src/Seasonal/MF_Seasonal.js' });
  await new Promise(r => setTimeout(r, 20));
  const cached = JSON.parse(sandbox.localStorage.getItem('mf:seasonal:v1'));
  assert.deepEqual(cached.cfg.events[0].effects.ambient, ['snow', 'leaves', 'fireflies'],
    'solo tipos validos, max 3, sin duplicados');
  assert.equal(cached.cfg.events[0].effects.ambientDensity, 1.5, 'densidad clampeada');
  assert.deepEqual(cached.cfg.night.ambient, ['fireflies', 'meteors'], 'night filtrado por whitelist');
  assert.deepEqual(cached.cfg.night.hours, [23, 0], 'horas clampeadas a 0-23');
  assert.equal(cached.cfg.night.density, 1.5, 'densidad de noche clampeada');
});

test('sin night en el config → null y el state expone el ambiente activo', async () => {
  const { sandbox } = makeSandbox();
  sandbox.fetch = () => Promise.resolve({
    ok: true,
    json: async () => ({
      v: 1,
      events: [{ id: 'fx', start: '2026-01-01', end: '2026-12-31', effects: { ambient: ['snow'] }, targets: [] }]
    })
  });
  vm.runInContext(SRC, sandbox, { filename: 'src/Seasonal/MF_Seasonal.js' });
  await new Promise(r => setTimeout(r, 20));
  const cached = JSON.parse(sandbox.localStorage.getItem('mf:seasonal:v1'));
  assert.equal(cached.cfg.night, null, 'sin night → null (fail-open)');
  const st = sandbox.__MF_SEASONAL_STATE__();
  assert.equal(st.activeEventId, 'fx', 'evento activo expuesto');
  assert.ok(Array.isArray(st.ambient) && typeof st.night === 'boolean', 'state con ambiente y flag nocturno');
});

test('normalización: target con uuid en plano se IGNORA (el repo es público)', async () => {
  const { sandbox } = makeSandbox();
  sandbox.fetch = () => Promise.resolve({
    ok: true,
    json: async () => ({
      v: 1,
      events: [{
        id: 'x', start: '2026-01-01', end: '2026-12-31',
        effects: { vignette: '#fff', vignetteStrength: 5, heartRain: true },
        targets: [
          { uuid: 'aabbccdd-1111-2222-3333-445566778899' },
          { uuidHash: 'sha256:deadbeef', heartRain: false, message: '!!!base64-ilegal!!!' },
          { nameHash: 'sha256:cafe', waypoints: [{ name: 'wp', x: 1, y: 64, z: 2 }, { name: 'malo', x: 'x', y: 1, z: 1 }] }
        ]
      }]
    })
  });
  vm.runInContext(SRC, sandbox, { filename: 'src/Seasonal/MF_Seasonal.js' });
  await new Promise(r => setTimeout(r, 20));
  const cached = JSON.parse(sandbox.localStorage.getItem('mf:seasonal:v1'));
  const ev = cached.cfg.events[0];
  assert.equal(ev.targets.length, 2, 'solo los 2 targets con hash sobreviven');
  assert.equal(ev.targets[0].uuidHash, 'sha256:deadbeef');
  assert.equal(ev.targets[0].messageB64, '', 'mensaje no-base64 descartado');
  assert.equal(ev.targets[1].waypoints.length, 1, 'waypoint inválido fuera');
  assert.equal(ev.effects.vignetteStrength, 0.4, 'strength clampeado');
});

test('config inválida → ignorada, fail-open; cache no se contamina', async () => {
  const { sandbox, store } = makeSandbox();
  sandbox.fetch = () => Promise.resolve({ ok: true, json: async () => ({ v: 9, events: 'no' }) });
  vm.runInContext(SRC, sandbox, { filename: 'src/Seasonal/MF_Seasonal.js' });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(store.has('mf:seasonal:v1'), false);
});

test('integración: registrado en mirror/hotload como la casa manda', () => {
  const mirror = JSON.parse(fs.readFileSync(path.join(ROOT, 'mirror.json'), 'utf8'));
  assert.ok(mirror.mainStart.includes('src/Seasonal/MF_Seasonal.js'));
  const hot = JSON.parse(fs.readFileSync(path.join(ROOT, 'hotload.json'), 'utf8'));
  const entry = (hot.hot || []).find(e => e.path === 'src/Seasonal/MF_Seasonal.js');
  assert.ok(entry && entry.ok.includes('__MF_SEASONAL_STATE__'));
  assert.match(SRC, /raw\.githubusercontent\.com\/DevOfficial-Client\/MiniFeather-Client\/main\/seasonal\.json/);
});
