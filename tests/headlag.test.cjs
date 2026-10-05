// head lag: la cabeza del jugador local llega tarde a donde apunta la cámara en 3ª persona.
// sandbox con fake de miniblox (react scan) + mesh con headPivot, como manda la casa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'src/PlayerAnims/HeadLag.js'), 'utf8');

function setup() {
  const listeners = new Map();
  let clock = 0;
  let rafCbs = [];
  const applied = [];            // rotación vista por el original en cada llamada

  const head = {
    rotation: { x: 0, y: 0, z: 0 },
    updateMatrixWorld() { applied.push({ x: this.rotation.x, y: this.rotation.y }); }
  };
  const mesh = { entity: { id: 1 }, headPivot: head };
  const game = {
    player: { id: 1, perspective: 2, mesh },
    world: { entities: new Map() }
  };
  const reactRoot = { 1: { updateQueue: { baseState: { element: { props: { game } } } } } };

  const sandbox = {
    performance: { now: () => clock },
    console,
    document: {
      querySelector: sel => (sel === '#react' ? reactRoot : null),
      addEventListener(name, fn) { listeners.set(name, fn); },
      removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }
    },
    requestAnimationFrame(cb) { rafCbs.push(cb); return rafCbs.length; },
    cancelAnimationFrame() { rafCbs = []; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  return {
    sandbox,
    head, mesh, game, applied,
    config(detail) { listeners.get('minifeather:headlag-config')({ detail: JSON.stringify(detail) }); },
    pump(n = 1) { for (let i = 0; i < n; i++) { const cbs = rafCbs; rafCbs = []; cbs.forEach(cb => cb()); } },
    advance(ms) { clock += ms; },
    call() { head.updateMatrixWorld.call(head); },
    get wrapped() { return head.updateMatrixWorld !== head.constructor.prototype.updateMatrixWorld && head._mfHeadLagHook === true; }
  };
}

test('el script expone su API sin necesitar un mundo', () => {
  const s = setup();
  assert.equal(typeof s.sandbox.MF_HeadLag?.setEnabled, 'function');
  assert.equal(s.sandbox.MF_HeadLag.enabled, false);
});

test('enable envuelve el headPivot del jugador local y arranca clavado al target', () => {
  const s = setup();
  s.config({ enabled: true });
  s.pump(2);
  assert.ok(s.wrapped, 'headPivot no quedó envuelto');

  s.head.rotation.y = 1.0;
  s.head.rotation.x = 0.2;
  s.advance(16);
  s.call();
  assert.equal(s.applied.at(-1).y, 1.0, 'primer frame: sin historia, la cabeza arranca donde la cámara');
  assert.equal(s.applied.at(-1).x, 0.2);
});

test('la cabeza persigue al target con suavizado, nunca lo pasa y termina clavándose', () => {
  const s = setup();
  s.config({ enabled: true });
  s.pump(2);

  s.head.rotation.y = 0;
  s.advance(16); s.call();
  s.head.rotation.y = 2.0;                       // giro fuerte de cámara

  const mid = [];
  for (let i = 0; i < 8; i++) {
    s.advance(30);
    s.call();
    mid.push(s.applied.at(-1).y);
  }
  assert.ok(mid[0] > 0 && mid[0] < 2, `primer paso intermedio (${mid[0]})`);
  assert.ok(mid[1] > mid[0], 'avanza hacia el target');
  for (let i = 1; i < mid.length; i++) assert.ok(mid[i] <= 2.0000001, 'nunca sobrepasa');
  for (let i = 0; i < 60; i++) { s.advance(30); s.call(); }
  assert.equal(s.applied.at(-1).y, 2.0, 'converge y clava el snap final');
});

test('primera persona y pose del pack EMF apagan el lag (pasa el target limpio)', () => {
  const s = setup();
  s.config({ enabled: true });
  s.pump(2);
  s.head.rotation.y = 0;
  s.advance(16); s.call();

  s.game.player.perspective = 0;                 // 1ª persona: cabeza invisible, lag fuera
  s.head.rotation.y = 1.5;
  s.advance(16); s.call();
  assert.equal(s.applied.at(-1).y, 1.5);

  s.game.player.perspective = 2;
  // composición real: MF_PlayerAnims ya escribió su pose en la rotación del pivote;
  // con __mfPAPose presente el lag pasa de largo y no amortigua ese valor
  s.head.__mfPAPose = { rx: 0.4 };
  s.head.rotation.y = 2.5;
  s.head.rotation.x = 0.4;
  s.advance(16); s.call();
  assert.equal(s.applied.at(-1).y, 2.5, 'con pose EMF el lag no amortigua');
  assert.equal(s.applied.at(-1).x, 0.4, 'la pose del pack llega intacta al original');
  delete s.head.__mfPAPose;
});

test('un mesh que no es el jugador local no se envuelve', () => {
  const s = setup();
  const headRemoto = { rotation: { x: 0, y: 0, z: 0 }, updateMatrixWorld() {} };
  const meshRemoto = { entity: { id: 7 }, headPivot: headRemoto };
  s.game.world.entities.set(7, { mesh: meshRemoto });
  s.config({ enabled: true });
  s.pump(2);
  assert.ok(s.wrapped, 'el local sí');
  assert.ok(!headRemoto._mfHeadLagHook, 'el remoto no (su cabeza ya llega tarde por red)');
});

test('disable desenvuelve y vuelve el comportamiento nativo', () => {
  const s = setup();
  s.config({ enabled: true });
  s.pump(2);
  const wrappedFn = s.head.updateMatrixWorld;
  s.config({ enabled: false });
  assert.equal(s.head._mfHeadLagHook, false);
  // el original se restaura como copia bound (patrón de la casa): mismo comportamiento,
  // así que la aserción es por conducta — sin lag, lo que se escribe es lo que llega
  assert.notEqual(s.head.updateMatrixWorld, wrappedFn);
  s.head.rotation.y = 5.0;
  s.advance(16); s.call();
  assert.equal(s.applied.at(-1).y, 5.0);
});

test('mesh nuevo tras respawn: el wrapper viejo se suelta y el nuevo se envuelve', () => {
  const s = setup();
  s.config({ enabled: true });
  s.pump(2);
  const headViejo = s.head;
  s.mesh.headPivot = { rotation: { x: 0, y: 0, z: 0 }, updateMatrixWorld() {} };
  s.game.player.mesh = s.mesh;
  s.pump(2);
  assert.ok(!headViejo._mfHeadLagHook, 'viejo desempleado');
  assert.ok(s.mesh.headPivot._mfHeadLagHook, 'nuevo contratado');
});
