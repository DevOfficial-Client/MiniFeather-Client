// mf noauratrail: el juego guarda cosméticos en profile.effects.{aura,trail}
// y su render loop hace Dj[effects.aura]?.effect?.update(...) — campo vacío,
// cero partículas. el módulo vacía los campos (menos los propios con keepOwn)
// y devuelve los originales al apagar. testeado con el juego falso de siempre.
// run: node tests/noauratrail.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'Render', 'MF_NoAuraTrail.js'), 'utf8');

function makeSandbox({ game }) {
    const handlers = {};
    const store = new Map();
    const fakeRoot = { ['__reactContainer$fake']: { updateQueue: { baseState: { element: { props: { game } } } } } };
    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.document = {
        getElementById: (id) => (id === 'react' ? fakeRoot : null),
        addEventListener: (type, fn) => { handlers[type] = fn; }
    };
    sandbox.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v))
    };
    sandbox.setInterval = () => 1;      // sin timers reales: los tests barren a mano
    sandbox.clearInterval = () => {};
    sandbox.console = console;
    sandbox.WeakMap = WeakMap;
    return { sandbox, handlers };
}

function makeGame() {
    const own = { id: 'me', pos: { x: 0, y: 64, z: 0 }, profile: { effects: { aura: 'flame', trail: 'hearts' } } };
    const otherAuraYTrail = { id: 'p2', pos: { x: 3, y: 64, z: 0 }, profile: { effects: { aura: 'void', trail: null } } };
    const otherSoloTrail = { id: 'p4', pos: { x: 7, y: 64, z: 0 }, profile: { effects: { aura: null, trail: 'stars' } } };
    const otherSinCosmeticos = { id: 'p3', pos: { x: 5, y: 64, z: 0 }, profile: { effects: {} } };
    const mob = { id: 'z1', pos: { x: 9, y: 64, z: 0 } };   // sin profile: nunca contado
    const entities = new Map([['me', own], ['p2', otherAuraYTrail], ['p3', otherSinCosmeticos], ['p4', otherSoloTrail], ['z1', mob]]);
    return {
        game: { player: own, world: { entities } },
        own, otherAuraYTrail, otherSoloTrail, otherSinCosmeticos
    };
}

function sendConfig(handlers, cfg) {
    handlers['minifeather:no-auratrail-config']({ detail: JSON.stringify(cfg) });
}

test('bloquea auras y trails de otros y respeta keepOwn', () => {
    const { game, own, otherAuraYTrail, otherSoloTrail } = makeGame();
    const { sandbox, handlers } = makeSandbox({ game });
    vm.runInNewContext(SRC, sandbox);

    sendConfig(handlers, { enabled: true, auras: true, trails: true, keepOwn: true });

    // el propio queda intacto, los demás limpios
    assert.equal(own.profile.effects.aura, 'flame');
    assert.equal(own.profile.effects.trail, 'hearts');
    assert.equal(otherAuraYTrail.profile.effects.aura, null);
    assert.equal(otherSoloTrail.profile.effects.trail, null);
    assert.equal(otherAuraYTrail.profile.effects.trail, null); // ya venía null

    const st = sandbox.window.MF_NoAuraTrail.status();
    assert.equal(st.enabled, true);
    assert.equal(st.entityMap, true);
    assert.equal(st.players, 4);        // 4 con effects (el mob no cuenta)
    assert.equal(st.auras, 1);          // solo p2 tenía aura
    assert.equal(st.trails, 1);         // solo p4 tenía trail (el de p2 ya venía null)
});

test('keepOwn off limpia también al propio, y apagar devuelve TODO original', () => {
    const { game, own, otherAuraYTrail, otherSoloTrail } = makeGame();
    const { sandbox, handlers } = makeSandbox({ game });
    vm.runInNewContext(SRC, sandbox);

    sendConfig(handlers, { enabled: true, auras: true, trails: true, keepOwn: false });
    assert.equal(own.profile.effects.aura, null);
    assert.equal(own.profile.effects.trail, null);

    sendConfig(handlers, { enabled: false });
    assert.equal(own.profile.effects.aura, 'flame');
    assert.equal(own.profile.effects.trail, 'hearts');
    assert.equal(otherAuraYTrail.profile.effects.aura, 'void');
    assert.equal(otherAuraYTrail.profile.effects.trail, null);
    assert.equal(otherSoloTrail.profile.effects.trail, 'stars');
    assert.equal(otherSoloTrail.profile.effects.aura, null);
});

test('girar una opción con el módulo vivo restaura solo esa', () => {
    const { game, own, otherAuraYTrail } = makeGame();
    const { sandbox, handlers } = makeSandbox({ game });
    vm.runInNewContext(SRC, sandbox);

    sendConfig(handlers, { enabled: true, auras: true, trails: true, keepOwn: false });
    sendConfig(handlers, { auras: false });   // auras vuelven, trails siguen fuera
    assert.equal(otherAuraYTrail.profile.effects.aura, 'void');
    assert.equal(otherAuraYTrail.profile.effects.trail, null);
    assert.equal(own.profile.effects.aura, 'flame');
    assert.equal(own.profile.effects.trail, null);
});

test('perfiles que llegan DESPUÉS también se limpian (sweep manual)', () => {
    const { game, own } = makeGame();
    const { sandbox, handlers } = makeSandbox({ game });
    vm.runInNewContext(SRC, sandbox);
    sendConfig(handlers, { enabled: true, keepOwn: true });

    // alguien entra al mundo con aura Y trail puestos
    const late = { id: 'late', pos: { x: 1, y: 64, z: 1 }, profile: { effects: { aura: 'gold', trail: 'ice' } } };
    game.world.entities.set('late', late);
    sandbox.window.MF_NoAuraTrail.sweepNow();

    assert.equal(late.profile.effects.aura, null);
    assert.equal(late.profile.effects.trail, null);
    assert.equal(own.profile.effects.aura, 'flame');

    sendConfig(handlers, { enabled: false });
    assert.equal(late.profile.effects.aura, 'gold');
    assert.equal(late.profile.effects.trail, 'ice');
});

test('hot-reload: reinyectar el módulo no revienta ni duplica', () => {
    const { game } = makeGame();
    const { sandbox, handlers } = makeSandbox({ game });
    vm.runInNewContext(SRC, sandbox);
    sendConfig(handlers, { enabled: true, keepOwn: true });
    assert.equal(sandbox.window.MF_NoAuraTrail.status().enabled, true);
    // segunda ejecución (hot-update): el guard despide al anterior, y el
    // recién nacido se AUTO-ENCIENDE porque el localStorage retiene el estado
    // (mismo comportamiento que un arranque real con el módulo ya encendido)
    vm.runInNewContext(SRC, sandbox);
    assert.equal(sandbox.window.MF_NoAuraTrail.status().enabled, true);
    sendConfig(handlers, { enabled: false });
    assert.equal(sandbox.window.MF_NoAuraTrail.status().enabled, false);
    sendConfig(handlers, { enabled: true, keepOwn: true });
    assert.equal(sandbox.window.MF_NoAuraTrail.status().enabled, true);
});
