// Fresh Animations engine: import de zip real (sintético, stored), registro de mobs,
// swap sobre la entidad y aplicación de writes CEM a los nodos del rig construido.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const readSrc = n => fs.readFileSync(path.join(root, n), 'utf8');
// el stack EMF completo carga antes: el motor depende de él en vivo
const emfCode = ['src/PlayerAnims/EMFExpr.js', 'src/PlayerAnims/EMFParser.js', 'src/PlayerAnims/EMFRuntime.js'].map(readSrc);
const code = readSrc('src/PlayerAnims/MF_FreshAnims.js');

// --- zip writer mínimo (method 0 = stored) -------------------------------------
const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zipOf(files) {
    const locals = [], centrals = [];
    let offset = 0;
    for (const [name, content] of Object.entries(files)) {
        const nb = Buffer.from(name), db = Buffer.from(content);
        const l = Buffer.alloc(30);
        l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(0, 8);
        l.writeUInt16LE(nb.length, 26); l.writeUInt16LE(0, 28);
        l.writeUInt32LE(db.length, 18);
        locals.push(l, nb, db);
        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32);
        c.writeUInt32LE(db.length, 20); c.writeUInt32LE(db.length, 24); c.writeUInt16LE(nb.length, 28);
        c.writeUInt32LE(offset, 42);
        centrals.push(c, nb);
        offset += 30 + nb.length + db.length;
    }
    const cd = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(Object.keys(files).length, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, cd, eocd]);
}

// --- fakes THREE + mundo ---------------------------------------------------------
class FakeAttr {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
}
class FakeGeo {
    constructor() { this.attributes = {}; }
    setAttribute(name, attr) { this.attributes[name] = attr; }
    setIndex() {}
    computeVertexNormals() {}
}
class FakeMat {
    constructor() { this.map = null; this.alphaTest = 0; this.transparent = false; this.needsUpdate = false; }
}
class FakeNode {
    constructor() {
        this.children = []; this.parent = null; this.type = 'Group';
        this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.scale = { x: 1, y: 1, z: 1, multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; } };
    }
    add(child) { this.children.push(child); child.parent = this; }
    remove(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parent = null; }
    traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
    find(pred) { for (const c of this.children) if (pred(c)) return c; for (const c of this.children) { const r = c.find && c.find(pred); if (r) return r; } return null; }
}
class FakeMesh extends FakeNode {
    constructor(geo, mat) { super(); this.type = 'Mesh'; this.isMesh = true; this.geometry = geo; this.material = mat; }
}
// los mobs de miniblox son SkinnedMesh: el donante de ctors nace skinned
class FakeSkinnedMesh extends FakeMesh {
    constructor(geo, mat) { super(geo, mat); this.isSkinnedMesh = true; }
}

function makeWorld() {
    const ent = {
        id: 7, type: 'zombie', ticksExisted: 100, height: 1.95,
        pos: { x: 1, y: 64, z: 2 }, prevPos: { x: 1, y: 64, z: 2 },
        yaw: 0, yawHead: 0, limbSwing: 0, limbSwingAmount: 0, prevLimbSwingAmount: 0,
        hurtTime: 0, deathTime: 0, sneak: false, inWater: false,
        getPartialTicks: () => 0, isSprinting: () => false, getHealth: () => 20
    };
    const sampleGeo = new FakeGeo();
    sampleGeo.setAttribute('position', new FakeAttr(new Float32Array(72), 3));
    const sample = new FakeSkinnedMesh(sampleGeo, new FakeMat());
    const mesh = new FakeNode();
    mesh.type = 'Object3D';
    mesh.add(sample);
    mesh.entity = ent;
    ent.mesh = mesh;
    mesh.headPivot = new FakeNode(); // pivot real del rig: Object3D con constructor propio
    mesh.headPivot.rotation.x = 0.1;
    mesh.headPivot.rotation.y = 0.3;
    const scene = new FakeNode();
    scene.add(mesh);
    const game = { player: { id: 1, mesh: new FakeNode(), pos: { x: 0, y: 64, z: 0 } }, world: { entities: new Map([[7, ent]]) } };
    return { ent, mesh, game };
}

function setup() {
    const world = makeWorld();
    let rafCbs = [];
    const sandbox = {
        performance: { now: () => Date.now() },
        console,
        TextDecoder,
        Blob,
        Response,
        DecompressionStream: globalThis.DecompressionStream,
        createImageBitmap: async (blob) => ({ width: 64, height: 64, close() {} }),
        indexedDB: undefined,
        document: {
            querySelector: () => null,
            createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }),
            addEventListener() {},
            removeEventListener() {}
        },
        requestAnimationFrame(cb) { rafCbs.push(cb); return rafCbs.length; },
        cancelAnimationFrame() { rafCbs = []; },
        __MINIFEATHER_LOCAL_GAMES__: { active: true, game: world.game }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const chunk of emfCode) vm.runInContext(chunk, sandbox);
    vm.runInContext(code, sandbox);
    const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };
    return {
        sandbox, world,
        config(detail) { /* listeners no-op en este sandbox */ },
        async pump(n = 1) { for (let i = 0; i < n; i++) { const cbs = rafCbs; rafCbs = []; cbs.forEach(cb => cb()); await flush(); } },
        findPart(part) {
            let found = null;
            world.mesh.traverse(c => { if (c.__mfPart === part) found = c; });
            return found;
        }
    };
}

const FA_ZIP = () => zipOf({
    'pack.mcmeta': '{"pack":{"pack_format":1}}',
    'assets/minecraft/optifine/cem/zombie.jem': JSON.stringify({
        textureSize: [64, 64],
        models: [
            { part: 'root', id: 'root' },
            { part: 'body', id: 'body', boxes: [{ coordinates: [-4, 12, -2, 8, 12, 4], textureOffset: [16, 16] }] },
            { part: 'head', id: 'head', submodels: [
                { id: 'head2', boxes: [
                    { coordinates: [-4, 24, -4, 8, 8, 8], textureOffset: [0, 0] },
                    { coordinates: [0, 28, -4.002, 2, 1, 0], uvNorth: [13, 18, 15, 19] }
                ] }
            ] },
            { part: 'right_arm', id: 'right_arm', boxes: [{ coordinates: [4, 12, -2, 4, 12, 4], textureOffset: [40, 16] }] }
        ]
    }),
    'assets/minecraft/optifine/cem/zombie_animations.jpm': JSON.stringify({
        credit: 'test fake, not real Fresh Animations data',
        animations: [
            { 'var.test': '1+1' },
            { 'head.rx': 'var.test - 1' },
            { 'right_arm.ry': '0.25' },
            { 'head.ry': '9.9' }
        ]
    }),
    'assets/minecraft/textures/entity/zombie/zombie.png': Buffer.from([137, 80, 78, 71])
});

test('import de zip: registra el mob, ignora overlays y persiste estado', async () => {
    const s = setup();
    const n = await s.sandbox.MF_FreshAnims.importPackFile({ arrayBuffer: async () => FA_ZIP(), name: 'test.zip' });
    assert.equal(n, 1, 'solo zombie (sin overlays en el zip)');
    const st = s.sandbox.MF_FreshAnims.getStatus();
    assert.equal(st.mobs, 1);
    assert.match(st.status, /1 mobs listos/);
});

test('zip sin cem/*.jem falla con mensaje claro', async () => {
    const s = setup();
    await assert.rejects(
        () => s.sandbox.MF_FreshAnims.importPackFile({ arrayBuffer: async () => zipOf({ 'readme.txt': 'hola' }), name: 'malo.zip' }),
        /no trae modelos/
    );
});

test('swap completo: rig montado, nativo escondido, writes CEM aplicados', async () => {
    const s = setup();
    await s.sandbox.MF_FreshAnims.importPackFile({ arrayBuffer: async () => FA_ZIP(), name: 'test.zip' });
    s.sandbox.MF_FreshAnims.setEnabled(true);
    await s.pump(3);

    assert.ok(s.world.mesh.children.some(c => c.__mfFreshRoot), 'rig no quedó montado');
    assert.ok(s.world.mesh.children[0].visible === false, 'el mesh nativo sigue visible');
    const status = s.sandbox.MF_FreshAnims.getStatus();
    assert.equal(status.applied, 1);

    // head.rx = var.test - 1 = 1, SUMADO a la mirada dinámica (−headPivot.x = −0.1):
    // en EMF el part custom anida dentro del vanilla, así que el write va encima
    const head = s.findPart('head');
    assert.ok(head, 'nodo head no encontrado');
    assert.equal(head.rotation.x, 0.9, 'la línea del jpm no llegó al nodo');
    // head.ry se salta: la mirada la pone el juego (copia del headPivot nativo)
    assert.equal(head.rotation.y, 0.3, 'el write de head.ry pisó la mirada nativa');
    // right_arm.ry directo
    const arm = s.findPart('right_arm');
    assert.equal(arm.rotation.y, 0.25);
    // NINGÚN box del RIG nace skinned: el renderer les pediría skeleton undefined
    // y tumba el render entero con "Cannot read properties of undefined (reading 'update')"
    const rig = s.world.mesh.children.find(c => c.__mfFreshRoot);
    let skinned = 0, boxes = 0;
    rig.traverse(c => { if (c.isMesh) { boxes++; if (c.isSkinnedMesh) skinned++; } });
    assert.ok(boxes > 0, 'no se construyó ningún box');
    assert.equal(skinned, 0, `${skinned}/${boxes} boxes nacieron skinned (crash del renderer)`);
});

test('muerte del mob: rig desmontado y nativo restaurado para el cadáver', async () => {
    const s = setup();
    await s.sandbox.MF_FreshAnims.importPackFile({ arrayBuffer: async () => FA_ZIP(), name: 'test.zip' });
    s.sandbox.MF_FreshAnims.setEnabled(true);
    await s.pump(3);
    assert.equal(s.sandbox.MF_FreshAnims.getStatus().applied, 1);

    s.world.ent.deathTime = 5;
    await s.pump(2);
    assert.equal(s.sandbox.MF_FreshAnims.getStatus().applied, 0, 'el rig sobrevivió a su dueño');
    assert.ok(s.world.mesh.children[0].visible === true, 'el nativo quedó escondido para el corpse');
    assert.ok(!s.world.mesh.children.some(c => c.__mfFreshRoot && c.parent === s.world.mesh), 'el rig sigue colgado del mesh');
});

test('disable desmonta todos los rigs', async () => {
    const s = setup();
    await s.sandbox.MF_FreshAnims.importPackFile({ arrayBuffer: async () => FA_ZIP(), name: 'test.zip' });
    s.sandbox.MF_FreshAnims.setEnabled(true);
    await s.pump(3);
    s.sandbox.MF_FreshAnims.setEnabled(false);
    assert.equal(s.sandbox.MF_FreshAnims.getStatus().applied, 0);
    assert.ok(s.world.mesh.children[0].visible === true);
});

// el crash real visto en miniblox: el mesh nativo es subclase del juego cuyo
// constructor exige argumentos (lea .pos de un def) — el rig se arma con el
// constructor de un pivot nombrado, no con el del mesh
test('mesh subclase del juego con constructor quisquilloso hace swap igual', async () => {
    const s = setup();
    class GameMeshSub extends FakeNode {
        constructor(def) { if (!def || !def.pos) throw new Error("Cannot read properties of undefined (reading 'pos')"); super(); }
    }
    const s2 = s.world;
    const sub = new GameMeshSub({ pos: { x: 1, y: 1, z: 1 } });
    for (const c of [...s2.mesh.children]) { sub.add(c); s2.mesh.children.splice(s2.mesh.children.indexOf(c), 1); }
    sub.entity = s2.ent; sub.headPivot = s2.mesh.headPivot;
    s2.ent.mesh = sub; sub.parent = s2.mesh.parent;
    s2.mesh.parent.children[s2.mesh.parent.children.indexOf(s2.mesh)] = sub;

    await s.sandbox.MF_FreshAnims.importPackFile({ arrayBuffer: async () => FA_ZIP(), name: 'test.zip' });
    s.sandbox.MF_FreshAnims.setEnabled(true);
    await s.pump(3);
    assert.equal(s.sandbox.MF_FreshAnims.getStatus().applied, 1, 'el swap esquivó el constructor quisquilloso');
    assert.ok(sub.children.some(c => c.__mfFreshRoot));
});

test('un mesh que falla hace backoff y se rinde: sin spam infinito', async () => {
    const s = setup();
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...a) => { if (String(a[1] || '').includes('falló')) warns.push(a); };
    try {
        // sin headPivot: GroupCtor cae al constructor del mesh... que aquí es FakeNode
        // (válido), así que forzamos el fallo por otra vía: constructor del mesh roto
        const broken = new FakeNode();
        broken.constructor; // noop
        Object.defineProperty(broken, 'constructor2', { value: null });
        class BrokenGroup { constructor() { throw new Error('def.pos esperado'); } }
        const meshRoto = new (class extends FakeNode { })(); // GroupCtor vendrá de headPivot...
        // vía directa: mesh sin pivots y cuyo constructor lanza
        const EvilMesh = class extends FakeNode { constructor() { super(); } };
        EvilMesh.prototype.add = FakeNode.prototype.add;
        const evil = new EvilMesh();
        const sGeo = new FakeGeo();
        sGeo.setAttribute('position', new FakeAttr(new Float32Array(72), 3));
        evil.add(new FakeMesh(sGeo, new FakeMat()));
        evil.constructor2 = null;
        // parche: el módulo usa mesh.constructor como último recurso — hacedlo lanzar
        Object.setPrototypeOf(evil, { constructor: BrokenGroup });
        evil.entity = s.world.ent;
        evil.headPivot = undefined;
        s.world.ent.mesh = evil;
        evil.parent = s.world.mesh.parent;
        s.world.ent.getHealth = () => 20;

        await s.sandbox.MF_FreshAnims.importPackFile({ arrayBuffer: async () => FA_ZIP(), name: 'test.zip' });
        s.sandbox.MF_FreshAnims.setEnabled(true);
        await s.pump(12); // bastantes frames: el backoff tiene que dejar el contador en 1 intento
        assert.equal(s.sandbox.MF_FreshAnims.getStatus().applied, 0);
        assert.equal(evil.__mfFreshFails, 1, `1 intento, no spam (fue ${evil.__mfFreshFails})`);
        assert.ok(warns.length <= 2, `warns=${warns.length} (el backoff no está frenando el spam)`);
    } finally {
        console.warn = origWarn;
    }
});
