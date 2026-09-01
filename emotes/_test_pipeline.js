// Prueba offline del pipeline de emotes contra un mock del esqueleto REAL
// de Miniblox (medido en vivo con Puppeteer, 2026-08-26):
//
//   mesh → skeleton (0, 1.495, 0)
//     ├── body (0,0,0)
//     │   ├── leftShoulder (-0.375,-0.15,0) → leftShoulderJoint (0,-0.3,0) → leftElbowJoint (0,0,0.125)
//     │   ├── rightShoulder (0.375,-0.15,0) → rightShoulderJoint (0,-0.3,0) → rightElbowJoint (0,0,0.125)
//     │   ├── leftHip (-0.125,-0.8,0) → leftHipJoint (0,-0.4,0) → leftKneeJoint (0,0,-0.125)
//     │   └── rightHip (0.125,-0.8,0) → rightHipJoint (0,-0.4,0) → rightKneeJoint (0,0,-0.125)
//     └── headContainer (0,-0.075,0) → headPivot (0,0,0)
//
// world positions: hombros L-R = 0.7125 (local 0.75), caderas L-R = 0.2236
// (local 0.25). Escala esperada: 0.2236/3.8 ≈ 0.0588 (3ª persona sin embargo
// usa la distancia MUNDO de los hip joints ≈ 0.2375 → 0.0625 ≈ 1/16).

'use strict';
const fs = require('fs');
const path = require('path');

// ── Mock minimal de three.js Object3D con jerarquía medida ──
function V3(x = 0, y = 0, z = 0) {
    return { x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } };
}
function Euler(x = 0, y = 0, z = 0) {
    return { x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } };
}
let nextId = 1;
function Obj(name, parent, pos) {
    const o = {
        id: nextId++, name,
        parent: parent || null,
        children: [],
        position: V3(pos?.x || 0, pos?.y || 0, pos?.z || 0),
        rotation: Euler(),
        // world position plana: parent pos + propia (sin rotaciones)
        getWorldPosition(out) {
            let x = this.position.x, y = this.position.y, z = this.position.z;
            let p = this.parent;
            while (p) { x += p.position.x; y += p.position.y; z += p.position.z; p = p.parent; }
            out.set(x, y, z);
            return out;
        }
    };
    if (parent) parent.children.push(o);
    return o;
}
function distanceTo(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function buildMesh() {
    const mesh = new Obj('mesh', null);
    const skeleton = new Obj('skeleton', mesh, { x: 0, y: 1.495, z: 0 });
    const body = new Obj('body', skeleton, { x: 0, y: 0, z: 0 });
    new Obj('leftShoulder', body, { x: -0.375, y: -0.15, z: 0 });
    new Obj('rightShoulder', body, { x: 0.375, y: -0.15, z: 0 });
    new Obj('leftHip', body, { x: -0.125, y: -0.8, z: 0 });
    new Obj('rightHip', body, { x: 0.125, y: -0.8, z: 0 });
    const headContainer = new Obj('headContainer', skeleton, { x: 0, y: -0.075, z: 0 });
    const joints = {
        skeleton, body,
        headPivot: new Obj('headPivot', headContainer, {}),
        leftShoulderJoint: new Obj('leftShoulderJoint', findObjByName(mesh, 'leftShoulder'), { y: -0.3 }),
        rightShoulderJoint: new Obj('rightShoulderJoint', findObjByName(mesh, 'rightShoulder'), { y: -0.3 }),
        leftElbowJoint: new Obj('leftElbowJoint', null, { z: 0.125 }),
        rightElbowJoint: new Obj('rightElbowJoint', null, { z: 0.125 }),
        leftHipJoint: new Obj('leftHipJoint', findObjByName(mesh, 'leftHip'), { y: -0.4 }),
        rightHipJoint: new Obj('rightHipJoint', findObjByName(mesh, 'rightHip'), { y: -0.4 }),
        leftKneeJoint: new Obj('leftKneeJoint', null, { z: -0.125 }),
        rightKneeJoint: new Obj('rightKneeJoint', null, { z: -0.125 })
    };
    // colgar codos/rodillas de sus joints
    joints.leftElbowJoint.parent = joints.leftShoulderJoint; joints.leftShoulderJoint.children.push(joints.leftElbowJoint);
    joints.rightElbowJoint.parent = joints.rightShoulderJoint; joints.rightShoulderJoint.children.push(joints.rightElbowJoint);
    joints.leftKneeJoint.parent = joints.leftHipJoint; joints.leftHipJoint.children.push(joints.leftKneeJoint);
    joints.rightKneeJoint.parent = joints.rightHipJoint; joints.rightHipJoint.children.push(joints.rightKneeJoint);
    // referencias nombradas como en el juego (obj[name] = joint)
    for (const [k, v] of Object.entries(joints)) mesh[k] = v;
    mesh.skeleton = skeleton;
    return { mesh, joints };
}
function findObjByName(root, name) {
    const q = [root], seen = new Set();
    while (q.length) {
        const o = q.shift();
        if (!o || seen.has(o)) continue;
        seen.add(o);
        if (o.name === name) return o;
        for (const c of o.children) q.push(c);
    }
    return null;
}

// ── Cargar el módulo Emotes.js real (sin extensión, con mocks) ──
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'Emotes.js'), 'utf8');

const results = [];
function check(label, cond, detail) {
    results.push({ label, ok: !!cond, detail: detail || '' });
}

// El módulo usa fetchEmoteBuffer via chrome.runtime o bridge; parchamos el
// fetch global para que lea del disco y simulamos chrome.runtime.getURL.
global.document = { addEventListener() {}, querySelector: () => null, dispatchEvent() {} };
global.location = { reload() {} };
global.performance = { now: () => Date.now() };
global.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
global.chrome = {
    runtime: {
        getURL: (p) => path.join(__dirname, '..', p)
    }
};
global.fetch = async (file) => {
    const data = fs.readFileSync(file);
    // OJO: data.buffer apunta al pool compartido (mas grande). Copiar exacto.
    const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return { ok: true, status: 200, arrayBuffer: async () => copy };
};
const realSetTimeout = setTimeout;
const realSetInterval = setInterval;
// silenciar el watchdog del modulo (abortaria el emote sin renders reales),
// pero SOLO durante el eval; luego se restaura para los awaits del test
global.setTimeout = () => 0;
global.setInterval = () => 0;
// rAF de respaldo: no-op (el test dispara mesh.render() manualmente y el hook
// del modulo aplica la pose ahi)
global.requestAnimationFrame = () => 0;
global.console.log = () => {}; // silenciar logs del modulo

eval(src); // define globalThis.MF_Emotes
global.setTimeout = realSetTimeout;
global.setInterval = realSetInterval;

const MF = globalThis.MF_Emotes;

// mock del game: getGame() lee de #react via document.querySelector → null,
// luego de globalThis.miniblox. Inyectamos el mock DESPUES del eval porque
// el modulo captura getGame() pero lo llama en runtime (late binding).
globalThis.miniblox = null;

// El modulo resuelve el game con document.querySelector('#react') → props.game.
// Montamos el mock del game ANTES de las pruebas de play().
function installGameMock(entMesh) {
    const game = {
        player: { id: 7, uuid: 'u7', perspective: 2 },
        world: {
            getPlayerById: (id) => id === 7 ? { mesh: entMesh, id: 7 } : null
        }
    };
    const reactRoot = { someFiberKey: { updateQueue: { baseState: { element: { props: { game } } } } } };
    global.document.querySelector = (sel) => sel === '#react' ? reactRoot : null;
    return game;
}

(async () => {
    // 1) cargar y parsear todos los .emotecraft reales
    const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.emotecraft'));
    check('archivos .emotecraft encontrados', files.length >= 9, files.join(', '));

    const loaded = [];
    for (const f of files) {
        const name = f.replace(/\.emotecraft$/, '');
        const r = await MF.load(name);
        check(`load("${name}")`, r.ok, r.ok ? (r.name || '') + (r.loop ? ' loop' : '') : r.error);
        if (r.ok) loaded.push(name);
    }
    if (!loaded.length) return report();

    // 2) mock del mesh y prueba de play()
    const { mesh, joints } = buildMesh();
    installGameMock(mesh);
    // play() hookea mesh.render; el mock no tiene render → damos uno
    mesh.render = function () {};
    // MF usa findJoint(mesh, name) → mesh[name]; el juego expone las refs
    // directamente en el mesh (verificado). El mock ya las tiene.
    const p = MF.play(loaded[0]);
    check(`play("${loaded[0]}")`, p.ok, p.ok ? p.parts.join(',') : p.error);
    if (!p.ok) return report();

    // 2b) simular frames de render: el hook llama applyPose tras cada render
    // (el primer frame inmediato supera el watchdog de 500ms)
    await renderFrames(mesh, 1200, 33); // ~24 ticks: fin del emote corto

    // 3) tpose: brazos en T → roll -90/+90 en hombros
    const t = await MF.load('tpose');
    check('load tpose', t.ok, t.error || '');
    if (t.ok) {
        MF.stop();
        // disparar renders a ~30fps durante 0.7s (14 ticks: dentro de endTick=8
        // con isLoop → pose final en brazos en T)
        await new Promise(r => setTimeout(r, 100));
        const p2 = MF.play('tpose');
        check('play tpose', p2.ok, p2.ok ? p2.parts.join(',') : p2.error);
        if (p2.ok) {
            await renderFrames(mesh, 700, 33);
            const rot = joints.rightShoulderJoint.rotation;
            // tpose derecho: roll=+90° → rz conservado ≈ +1.5708 (brazo horizontal)
            check('tpose rightShoulder |rz| ≈ 90°', Math.abs(Math.abs(rot.z) - Math.PI / 2) < 0.35,
                'rz=' + rot.z.toFixed(4));
            const rotL = joints.leftShoulderJoint.rotation;
            check('tpose leftShoulder |rz| ≈ 90°', Math.abs(Math.abs(rotL.z) - Math.PI / 2) < 0.35,
                'rz=' + rotL.z.toFixed(4));
            // en T no debe moverse la posicion (tpose no tiene pos keyframes)
            const bodyPos = joints.body.position;
            check('tpose body pos sin cambio', bodyPos.x === 0 && bodyPos.y === 0 && bodyPos.z === 0,
                JSON.stringify([bodyPos.x, bodyPos.y, bodyPos.z]));
            MF.stop();
        }
    }

    // 4) cool sit: body.pos debe mover mesh.skeleton (hacia abajo al sentarse)
    const cs = await MF.load('cool sit');
    check('load cool sit', cs.ok, cs.error || '');
    if (cs.ok) {
        MF.stop();
        await new Promise(r => setTimeout(r, 100));
        const p3 = MF.play('cool sit');
        check('play cool sit', p3.ok, p3.ok ? p3.parts.join(',') : p3.error);
        if (p3.ok) {
            const y0 = joints.skeleton.position.y;
            await renderFrames(mesh, 1500, 33); // que llegue al loop
            const y1 = joints.skeleton.position.y;
            // body.pos.y = -0.668 px MC → el rig BAJA ~0.668×escala ≈ -0.042
            // (delta directo PA→render, sin negar: sentarse baja, levitar sube)
            check('cool sit hunde el esqueleto (pos.y)', y0 - y1 > 0.03,
                'dy=' + (y1 - y0).toFixed(4));
            // la rotacion de caderas debe doblar las piernas
            const rh = joints.rightHipJoint.rotation.x;
            check('cool sit dobla cadera derecha (rx)', Math.abs(rh) > 0.3,
                'rx=' + rh.toFixed(4));
            MF.stop();
            // 4b) tras el stop + fade, TODO debe volver al rest vanilla.
            // Regresion de la "postura rara" al final: el vanilla del mock
            // no re-posea ningun joint (render no-op), asi que si el modulo
            // contaminara los defaults con la pose del emote, quedarian
            // congelados en la pose final (cadera doblada, cuerpo subido).
            await renderFrames(mesh, 700, 33); // fade-out (~14 frames)
            check('cool sit cadera vuelve a rest (rx≈0)', Math.abs(joints.rightHipJoint.rotation.x) < 0.01,
                'rx=' + joints.rightHipJoint.rotation.x.toFixed(4));
            check('cool sit esqueleto vuelve a rest (y)', Math.abs(joints.skeleton.position.y - 1.495) < 0.001,
                'y=' + joints.skeleton.position.y.toFixed(4));
            check('cool sit termino (playing=null)', MF.playing === null, MF.playing || '');
        }
    }

    report();
})();

function report() {
    let ok = 0, fail = 0;
    for (const r of results) {
        if (r.ok) ok++; else fail++;
        console.error((r.ok ? 'PASS' : 'FAIL') + ' | ' + r.label + (r.detail ? ' | ' + r.detail : ''));
    }
    console.error('---- ' + ok + ' OK / ' + fail + ' FAIL ----');
    process.exit(fail ? 1 : 0);
}

// dispara mesh.render() N veces con el intervalo dado (simula el loop del
// juego: el hook del modulo aplica la pose tras cada render vanilla).
// El primer frame va inmediato para superar el watchdog de 500ms del modulo.
function renderFrames(mesh, ms, intervalMs) {
    return new Promise(resolve => {
        mesh.render();
        const timer = setInterval(() => mesh.render(), intervalMs);
        setTimeout(() => { clearInterval(timer); resolve(); }, ms);
    });
}
