
'use strict';
const fs = require('fs');
const path = require('path');

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
    
    joints.leftElbowJoint.parent = joints.leftShoulderJoint; joints.leftShoulderJoint.children.push(joints.leftElbowJoint);
    joints.rightElbowJoint.parent = joints.rightShoulderJoint; joints.rightShoulderJoint.children.push(joints.rightElbowJoint);
    joints.leftKneeJoint.parent = joints.leftHipJoint; joints.leftHipJoint.children.push(joints.leftKneeJoint);
    joints.rightKneeJoint.parent = joints.rightHipJoint; joints.rightHipJoint.children.push(joints.rightKneeJoint);
    
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

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'Emotes.js'), 'utf8');

const results = [];
function check(label, cond, detail) {
    results.push({ label, ok: !!cond, detail: detail || '' });
}

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
    
    const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return { ok: true, status: 200, arrayBuffer: async () => copy };
};
const realSetTimeout = setTimeout;
const realSetInterval = setInterval;

global.setTimeout = () => 0;
global.setInterval = () => 0;

global.requestAnimationFrame = () => 0;
global.console.log = () => {}; 

eval(src); 
global.setTimeout = realSetTimeout;
global.setInterval = realSetInterval;

const MF = globalThis.MF_Emotes;

globalThis.miniblox = null;

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

    const { mesh, joints } = buildMesh();
    installGameMock(mesh);
    
    mesh.render = function () {};
    
    const p = MF.play(loaded[0]);
    check(`play("${loaded[0]}")`, p.ok, p.ok ? p.parts.join(',') : p.error);
    if (!p.ok) return report();

    await renderFrames(mesh, 1200, 33); 

    const t = await MF.load('tpose');
    check('load tpose', t.ok, t.error || '');
    if (t.ok) {
        MF.stop();
        
        await new Promise(r => setTimeout(r, 100));
        const p2 = MF.play('tpose');
        check('play tpose', p2.ok, p2.ok ? p2.parts.join(',') : p2.error);
        if (p2.ok) {
            await renderFrames(mesh, 700, 33);
            const rot = joints.rightShoulderJoint.rotation;
            
            check('tpose rightShoulder |rz| ≈ 90°', Math.abs(Math.abs(rot.z) - Math.PI / 2) < 0.35,
                'rz=' + rot.z.toFixed(4));
            const rotL = joints.leftShoulderJoint.rotation;
            check('tpose leftShoulder |rz| ≈ 90°', Math.abs(Math.abs(rotL.z) - Math.PI / 2) < 0.35,
                'rz=' + rotL.z.toFixed(4));
            
            const bodyPos = joints.body.position;
            check('tpose body pos sin cambio', bodyPos.x === 0 && bodyPos.y === 0 && bodyPos.z === 0,
                JSON.stringify([bodyPos.x, bodyPos.y, bodyPos.z]));
            MF.stop();
        }
    }

    const cs = await MF.load('cool sit');
    check('load cool sit', cs.ok, cs.error || '');
    if (cs.ok) {
        MF.stop();
        await new Promise(r => setTimeout(r, 100));
        const p3 = MF.play('cool sit');
        check('play cool sit', p3.ok, p3.ok ? p3.parts.join(',') : p3.error);
        if (p3.ok) {
            const y0 = joints.skeleton.position.y;
            await renderFrames(mesh, 1500, 33); 
            const y1 = joints.skeleton.position.y;
            
            check('cool sit hunde el esqueleto (pos.y)', y0 - y1 > 0.03,
                'dy=' + (y1 - y0).toFixed(4));
            
            const rh = joints.rightHipJoint.rotation.x;
            check('cool sit dobla cadera derecha (rx)', Math.abs(rh) > 0.3,
                'rx=' + rh.toFixed(4));
            MF.stop();
            
            await renderFrames(mesh, 700, 33); 
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

function renderFrames(mesh, ms, intervalMs) {
    return new Promise(resolve => {
        mesh.render();
        const timer = setInterval(() => mesh.render(), intervalMs);
        setTimeout(() => { clearInterval(timer); resolve(); }, ms);
    });
}
