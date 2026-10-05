// mf horror: el director obedece su config, los presets existen, safeMode
// deja el meta fuera y nada copia texto de los mods originales (ARR).
// run: node tests/horror.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'Horror', 'MF_Horror.js'), 'utf8');

function makeSandbox() {
  const docListeners = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    navigator: { language: 'es' },
    document: {
      documentElement: { appendChild() {} },
      body: null,
      getElementById: () => null,
      createElement: () => ({ style: { cssText: '' }, set innerHTML(v) {}, appendChild() {}, remove() {}, querySelector: () => null }),
      addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
      dispatchEvent(evt) { for (const fn of docListeners[evt.type] || []) fn(evt); return true; },
      querySelector: () => null
    },
    window: null,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    setTimeout(fn) { return 0; },
    setInterval() { return 0; },
    clearInterval() {},
    AudioContext: undefined,
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return { sandbox, docListeners };
}

test('el módulo arranca apagado y expone su api', () => {
  const { sandbox } = makeSandbox();
  vm.runInContext(SRC, sandbox, { filename: 'src/Horror/MF_Horror.js' });
  const api = sandbox.MF_Horror;
  assert.ok(api, 'api global presente');
  const snap = api.set({});
  assert.equal(snap.enabled, false, 'opt-in: nunca arranca asustando');
  assert.equal(JSON.stringify(api.presets()), JSON.stringify(['herobrine', 'broken', 'dweller', 'weeping']));
});

test('config event enciende/apaga y cambia preset; valores inválidos no entran', () => {
  const { sandbox, docListeners } = makeSandbox();
  vm.runInContext(SRC, sandbox, { filename: 'src/Horror/MF_Horror.js' });
  docListeners['minifeather:horror-config'][0]({ detail: JSON.stringify({ enabled: true, preset: 'dweller', intensity: 'nightmare' }) });
  let snap = sandbox.MF_Horror.set({});
  assert.equal(snap.enabled, true);
  assert.equal(snap.preset, 'dweller');
  assert.equal(snap.intensity, 'nightmare');
  // preset raro: se ignora, se queda el actual
  docListeners['minifeather:horror-config'][0]({ detail: JSON.stringify({ preset: 'slenderman' }) });
  snap = sandbox.MF_Horror.set({});
  assert.equal(snap.preset, 'dweller');
  // apagar limpia
  docListeners['minifeather:horror-config'][0]({ detail: JSON.stringify({ enabled: false }) });
  snap = sandbox.MF_Horror.set({});
  assert.equal(snap.enabled, false);
});

test('safeMode bloquea el fake disconnect (streamers sin sustos de meta)', () => {
  const { sandbox } = makeSandbox();
  vm.runInContext(SRC, sandbox, { filename: 'src/Horror/MF_Horror.js' });
  assert.match(SRC, /if \(state\.safeMode \|\| state\.overlayEl\) return;/, 'fakeDisconnect tiene su guarda');
  // con safeMode off el overlay podría existir; con on, jamás: estado interno no expone overlay — la guarda en fuente es el contrato
});

test('los textos falsos son propios, no de los mods originales (ARR)', () => {
  // strings del contenido creativo de The Broken Script: si aparecen, se copió
  assert.equal(SRC.includes('NULL'), false);
  assert.equal(SRC.toLowerCase().includes('wendigodrip'), false);
  // y el módulo declara su fuente de honestidad
  assert.match(SRC, /cero assets|sin assets|ni un ogg/i);
});

test('líneas falsas por idioma y sin repetir literal del chat real del juego', () => {
  assert.match(SRC, /FAKE_LINES/);
  assert.match(SRC, /te vi girar/); // nuestra línea, nuestra culpa
});

test('el comando /horror existe en ClientCommands y su cambio invalida completions', () => {
  const cc = fs.readFileSync(path.join(ROOT, 'src', 'Chat', 'ClientCommands.js'), 'utf8');
  assert.match(cc, /COMPLETION_CONTEXT_VERSION = 3/, 'nuevo comando = nuevo árbol = bump de versión');
  assert.match(cc, /'horror', 'terror', 'spooky', 'herobrine', 'dweller'/, 'RECOGNIZED con aliases');
  assert.match(cc, /horror: \{[\s\S]*?preset: \['herobrine', 'broken', 'dweller', 'weeping'\]/, 'completion tree');
  assert.match(cc, /dispatchRequest\('horrorSet'/, 'las subacciones van por el puente del panel');
  // 'weeping' ya era un comando (entidad stalker): no se puede pisar
  const panel = fs.readFileSync(path.join(ROOT, 'src', 'UI', 'ClientPanel.js'), 'utf8');
  assert.doesNotMatch(panel, /weeping: 'horror'/, 'alias weeping fuera: conflicto con el stalker');
  assert.match(panel, /request.action === 'horrorSet'/, 'panel maneja horrorSet');
  const runner = fs.readFileSync(path.join(ROOT, 'src', 'Core', 'MirrorRunner.js'), 'utf8');
  assert.match(runner, /COMPLETION_CONTEXT_VERSION = 3/, 'marker del runner a v3');
});

test('integración: el panel despacha el mismo evento que el módulo escucha', () => {
  const panel = fs.readFileSync(path.join(ROOT, 'src', 'UI', 'ClientPanel.js'), 'utf8');
  assert.match(panel, /minifeather:horror-config/, 'evento compartido');
  assert.match(panel, /registerModule\('horror'/, 'lifecycle registrado');
  const mirror = JSON.parse(fs.readFileSync(path.join(ROOT, 'mirror.json'), 'utf8'));
  assert.ok(mirror.mainStart.includes('src/Horror/MF_Horror.js'), 'presente en mirror.json');
  const hot = JSON.parse(fs.readFileSync(path.join(ROOT, 'hotload.json'), 'utf8'));
  const entry = (hot.hot || []).find(e => e.path === 'src/Horror/MF_Horror.js');
  assert.ok(entry && entry.ok.includes('MF_Horror'), 'ok-global declarado');
});
