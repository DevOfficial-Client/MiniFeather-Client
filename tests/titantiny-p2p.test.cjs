const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/P2P/MF_Mesh.js'), 'utf8');

function makeMesh() {
    return {
        isMesh: true,
        parent: {},
        children: [],
        scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
        updateMatrixWorld() {},
    };
}

test('Titan & Tiny P2P relays once per version and survives a replaced model', async () => {
    const peers = new Map();
    const links = [];
    const packets = [];
    let nextConnection = 1;
    let clock = 1000;

    class Connection {
        constructor(peer, id) {
            this.peer = peer;
            this.connectionId = id;
            this.open = false;
            this.handlers = new Map();
        }
        on(event, fn) { this.handlers.set(event, fn); }
        emit(event, value) { this.handlers.get(event)?.(value); }
        send(value) { if (this.open) packets.push([this.other, value]); }
        close() {
            if (!this.open) return;
            this.open = false;
            this.emit('close');
            this.other.open = false;
            this.other.emit('close');
        }
    }

    class Peer {
        constructor(id) { this.id = id; this.handlers = new Map(); peers.set(id, this); }
        on(event, fn) { this.handlers.set(event, [...(this.handlers.get(event) || []), fn]); }
        off(event, fn) { this.handlers.set(event, (this.handlers.get(event) || []).filter(callback => callback !== fn)); }
        emit(event, value) { for (const callback of this.handlers.get(event) || []) callback(value); }
        connect(id) {
            const remote = peers.get(id);
            assert.ok(remote, 'remote peer exists');
            const connectionId = `link-${nextConnection++}`;
            const mine = new Connection(id, connectionId);
            const theirs = new Connection(this.id, connectionId);
            mine.other = theirs;
            theirs.other = mine;
            remote.emit('connection', theirs);
            links.push([mine, theirs]);
            return mine;
        }
        destroy() { peers.delete(this.id); }
    }

    function makeClient(name, random) {
        const timers = new Map();
        const entities = new Map();
        const sandbox = {
            Peer,
            console: { warn() {} },
            performance: { now: () => clock },
            localStorage: { getItem: () => '0' },
            document: { querySelector: () => null },
            Math: Object.assign(Object.create(Math), { random: () => random }),
            setInterval(fn, interval) { timers.set(interval, fn); return interval; },
            clearInterval(interval) { timers.delete(interval); },
            setTimeout() { return 1; },
            clearTimeout() {},
            miniblox: { player: { profile: { username: name } }, world: { entitiesDump: entities } },
            TitanTiny: { enabled: false, scale: 1, width: 1 },
        };
        sandbox.globalThis = sandbox;
        vm.runInNewContext(source, sandbox, { filename: 'MF_Mesh.js' });
        return { name, sandbox, entities, tick: () => timers.get(500)?.() };
    }

    function addModel(viewer, player) {
        const mesh = makeMesh();
        viewer.entities.set(player.name, { profile: { username: player.name }, pos: { x: 0, y: 0, z: 0 }, mesh });
        return mesh;
    }

    function openNewLinks() {
        for (const [a, b] of links) {
            if (a.open || b.open) continue;
            a.open = b.open = true;
            a.emit('open');
            b.emit('open');
        }
    }

    function flushPackets(max = 100) {
        let delivered = 0;
        while (packets.length) {
            assert.ok(++delivered <= max, 'scale messages must not loop forever');
            const [conn, message] = packets.shift();
            if (conn.open) conn.emit('data', message);
        }
        return delivered;
    }

    const a = makeClient('Alice', 0.111111);
    const b = makeClient('Bob', 0.222222);
    const c = makeClient('Carol', 0.333333);
    const bobSeesAlice = addModel(b, a);
    const carolSeesAlice = addModel(c, a);
    const [firstCode, duplicateCode] = await Promise.all([
        a.sandbox.MF_Mesh.start(), a.sandbox.MF_Mesh.start(),
    ]);
    assert.equal(firstCode, duplicateCode, 'concurrent start uses one identity');
    for (const client of [b, c]) await client.sandbox.MF_Mesh.start();
    for (const client of [b, c]) peers.get(client.sandbox.MF_Mesh.code).emit('open', client.sandbox.MF_Mesh.code);

    const pending = a.sandbox.MF_Mesh.connect(b.sandbox.MF_Mesh.code);
    peers.get(a.sandbox.MF_Mesh.code).emit('open', a.sandbox.MF_Mesh.code);
    await pending;
    await b.sandbox.MF_Mesh.connect(c.sandbox.MF_Mesh.code);
    await c.sandbox.MF_Mesh.connect(a.sandbox.MF_Mesh.code);
    openNewLinks();
    flushPackets();

    a.sandbox.TitanTiny = { enabled: true, scale: 0.02, width: 0.5 };
    a.tick();
    assert.ok(flushPackets() < 30, 'one change has bounded relay traffic');
    b.tick();
    c.tick();
    assert.equal(bobSeesAlice.scale.y, 0.02);
    assert.equal(bobSeesAlice.scale.x, 0.01);
    assert.equal(carolSeesAlice.scale.y, 0.02);
    bobSeesAlice.scale.set(1, 1, 1);
    bobSeesAlice.onBeforeRender?.();
    assert.equal(bobSeesAlice.scale.y, 0.02, 'render hook repairs a vanilla scale reset');

    b.sandbox.MF_Peer = { scalePeerName: 'Alice' };
    b.tick();
    assert.equal(bobSeesAlice.scale.y, 1, 'dedicated P2P owns the model without double scaling');
    b.sandbox.MF_Peer.scalePeerName = null;
    b.tick();
    assert.equal(bobSeesAlice.scale.y, 0.02, 'mesh scale resumes after dedicated P2P ends');

    const d = makeClient('Dora', 0.444444);
    const doraSeesAlice = addModel(d, a);
    await d.sandbox.MF_Mesh.start();
    peers.get(d.sandbox.MF_Mesh.code).emit('open', d.sandbox.MF_Mesh.code);
    await d.sandbox.MF_Mesh.connect(b.sandbox.MF_Mesh.code);
    openNewLinks();
    assert.ok(flushPackets() < 40, 'late join snapshot has bounded traffic');
    d.tick();
    assert.equal(doraSeesAlice.scale.y, 0.02, 'late joiner receives existing scale');

    const replacement = addModel(b, a);
    clock += 4000;
    b.tick();
    assert.equal(bobSeesAlice.scale.y, 1, 'old model restored');
    assert.equal(replacement.scale.y, 0.02, 'new model scaled');

    a.sandbox.TitanTiny.enabled = false;
    a.tick();
    flushPackets();
    b.tick();
    assert.equal(replacement.scale.y, 1, 'normal size restored');
    d.tick();
    assert.equal(doraSeesAlice.scale.y, 1, 'normal size relayed to late joiner');

    for (const client of [a, b, c, d]) client.sandbox.MF_Mesh.dispose();
});

test('Titan & Tiny accepts sub-pixel scale but clamps unsafe zero', () => {
    const listeners = new Map();
    const sandbox = {
        performance: { now: () => 0 },
        document: {
            addEventListener(name, fn) { listeners.set(name, fn); },
            dispatchEvent() {},
            querySelector() { return null; },
        },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        requestAnimationFrame() {},
    };
    sandbox.window = sandbox;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/Render/TitanTiny.js'), 'utf8'), sandbox);
    sandbox.TitanTiny.setScale(0.02);
    assert.equal(sandbox.TitanTiny.scale, 0.02);
    sandbox.TitanTiny.setScale(0);
    assert.equal(sandbox.TitanTiny.scale, 1);
    sandbox.TitanTiny.setScale(0.001);
    assert.equal(sandbox.TitanTiny.scale, 0.01);
});

test('Titan & Tiny keeps model, hitbox and eye height aligned and restores them', () => {
    const player = {
        id: 7,
        pos: { x: 0, y: 0, z: 0 },
        width: 0.6,
        height: 1.8,
        getEyeHeight() { return 1.62; },
    };
    const mesh = makeMesh();
    const entity = { id: 7, pos: player.pos, mesh };
    const game = { player, world: { entitiesDump: new Map([[7, entity]]) } };
    const react = { root: { updateQueue: { baseState: { element: { props: { game } } } } } };
    const sandbox = {
        performance: { now: () => 1000 },
        document: {
            addEventListener() {},
            dispatchEvent() {},
            querySelector(selector) { return selector === '#react' ? react : null; },
        },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        requestAnimationFrame() {},
    };
    sandbox.window = sandbox;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/Render/TitanTiny.js'), 'utf8'), sandbox);
    sandbox.TitanTiny.setScale(0.02);
    sandbox.TitanTiny.setEnabled(true);
    assert.equal(mesh.scale.y, 0.02);
    assert.ok(Math.abs(player.width - 0.012) < 1e-9);
    assert.ok(Math.abs(player.height - 0.036) < 1e-9);
    assert.ok(Math.abs(player.getEyeHeight() - 0.0324) < 1e-9);
    sandbox.TitanTiny.setEnabled(false);
    assert.equal(mesh.scale.y, 1);
    assert.equal(player.width, 0.6);
    assert.equal(player.height, 1.8);
    assert.equal(player.getEyeHeight(), 1.62);
});
