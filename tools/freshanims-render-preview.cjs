// renderizador offline del builder: sheep.jem real + matemáticas del módulo → PNG
// para VER lo que el usuario ve sin round-trips de mirror
const fs = require('fs');
const vm = require('node:vm');
const zlib = require('zlib');

const emf = ['src/PlayerAnims/EMFExpr.js', 'src/PlayerAnims/EMFParser.js', 'src/PlayerAnims/EMFRuntime.js'].map(n => fs.readFileSync(n, 'utf8'));
let code = fs.readFileSync('src/PlayerAnims/MF_FreshAnims.js', 'utf8');
code = code.replace('globalThis.MF_FreshAnims = {', 'globalThis.MF_DEBUG = { state, buildModelRig, boxRects, invertAxisFlags };\n    globalThis.MF_FreshAnims = {');

class FakeAttr { constructor(a, s) { this.array = a; this.itemSize = s; this.count = a.length / s; } }
class FakeGeo { constructor() { this.attributes = {}; this.boundingBox = null; }
    setAttribute(n, a) { this.attributes[n] = a; }
    setIndex() {} computeVertexNormals() {}
}
class FakeNode { constructor(name) { this.children = []; this.name = name || ''; this.position = { x:0,y:0,z:0, set(x,y,z){this.x=x;this.y=y;this.z=z;} }; this.rotation = { x:0,y:0,z:0 }; this.scale = { x:1,y:1,z:1, multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;} }; }
    add(c) { this.children.push(c); c.parent = this; }
    traverse(fn) { fn(this); this.children.forEach(c => c.traverse(fn)); } }
class FakeMesh extends FakeNode { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; this.type = 'Mesh'; } }

const sandbox = { performance: { now: () => Date.now() }, console, TextDecoder, Blob, Response, DecompressionStream,
    createImageBitmap: async () => ({ width: 64, height: 64, close() {} }),
    document: { querySelector: () => null, createElement: () => ({ getContext: () => ({ drawImage() {} }) }), addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame() { return 1; }, cancelAnimationFrame() {} };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const c of emf) vm.runInContext(c, sandbox);
vm.runInContext(code, sandbox);
const buf = fs.readFileSync('.commandcode/fresh-animations/FreshAnimations_v1.10.5.zip');
sandbox.MF_FreshAnims.importPackFile({ arrayBuffer: async () => buf, name: 'FA.zip' }).then(() => {
    const { state, buildModelRig, boxRects } = sandbox.MF_DEBUG;

    // pivots vanilla de una oveja REAL (mc y-abajo → three y-up, con mi conversión)
    const native = new Map();
    for (const cem of ['head', 'headwear', 'body', 'leg1', 'leg2', 'leg3', 'leg4']) {
        native.set(cem, { rot: cem === 'body' ? { x: Math.PI / 2, y: 0, z: 0 } : { x: 0, y: 0, z: 0 } });
    }

    const entry = state.pack.models.get('sheep');
    const G = { BufferGeometry: FakeGeo, BufferAttribute: FakeAttr, Mesh: FakeMesh, Group: FakeNode };
    const rig = buildModelRig(entry, {}, G, FakeMesh, FakeNode, native);

    // extraer triángulos en espacio mundo (positions ya relativos al nodo; nodo
    // anida posiciones) — acumular transformaciones por jerarquía
    const tris = [];
    (function walk(node, parentM) {
        const M = {
            x: parentM.x + node.position.x, y: parentM.y + node.position.y, z: parentM.z + node.position.z,
            rx: parentM.rx + (node.rotation.x || node.__mfBaseRot?.x || 0), ry: parentM.ry + (node.rotation.y || node.__mfBaseRot?.y || 0), rz: parentM.rz + (node.rotation.z || node.__mfBaseRot?.z || 0)
        };
        node.__worldM = M;
        if (node.isMesh) {
            if (findPartName(node) === 'body') console.log('BODY M:', JSON.stringify(M));
            const pa = node.geometry.attributes.position.array;
            const part = findPartName(node);
            for (let i = 0; i < pa.length; i += 3) {
                const rv = rotateVertex({ x: pa[i], y: pa[i + 1], z: pa[i + 2] }, M);
                tris.push({ v: { x: rv.x + M.x, y: rv.y + M.y, z: rv.z + M.z }, part });
            }
        }
        node.children.forEach(c => walk(c, M));
    })(rig.root, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });

    function findPartName(meshNode) {
        let p = meshNode.parent;
        while (p) { if (p.__mfPart) return p.__mfPart; p = p.parent; }
        return '?';
    }
    function rotateVertex(v, M) {
        // aplicar rotaciones acumuladas (orden ZYX como three default XYZ euler)
        let p = { ...v };
        // rz
        let c = Math.cos(M.rz), s = Math.sin(M.rz);
        let x = p.x * c - p.y * s, y = p.x * s + p.y * c;
        p = { x, y, z: p.z };
        // rx
        c = Math.cos(M.rx); s = Math.sin(M.rx);
        y = p.y * c - p.z * s; const z = p.y * s + p.z * c;
        p = { x: p.x, y, z };
        // ry
        c = Math.cos(M.ry); s = Math.sin(M.ry);
        x = p.x * c + p.z * s; const z2 = -p.x * s + p.z * c;
        return { x, y: p.y, z: z2 };
    }

    // vistas ortográficas técnicas: lado (mirando −z... x horizontal, y vertical)
    // y arriba (x horizontal, z vertical). painter: caras de atrás hacia adelante
    function renderOrtho(axis, file) {
        const W = 360, H = 360;
        const img = Buffer.alloc(W * H * 3, 255);
        const depth = new Float32Array(W * H).fill(Infinity);
        const S = 110, CX = W / 2, CY = H / 2 + 90;
        function project(v) {
            if (axis === 'side') return { sx: CX + v.x * S, sy: CY - v.y * S, z: v.z };
            return { sx: CX + v.x * S, sy: CY + v.z * S, z: -v.y };
        }
        const PART_COLORS = {
            body: [200, 120, 110], head: [90, 160, 220], headwear: [70, 140, 200],
            leg1: [90, 170, 90], leg2: [70, 150, 70], leg3: [160, 130, 60], leg4: [140, 110, 50],
            root: [200, 200, 200], '?': [150, 150, 150]
        };
        for (let i = 0; i + 3 < tris.length; i += 4) {
            const quad = [tris[i], tris[i + 1], tris[i + 2], tris[i + 3]];
            const pts = quad.map(t => project(t.v));
            const zavg = pts.reduce((a, p) => a + p.z, 0) / 4;
            const color = PART_COLORS[quad[0].part] || [120, 120, 120];
            const xs = pts.map(p => p.sx), ys = pts.map(p => p.sy);
            const minx = Math.max(0, Math.floor(Math.min(...xs))), maxx = Math.min(W - 1, Math.ceil(Math.max(...xs)));
            const miny = Math.max(0, Math.floor(Math.min(...ys))), maxy = Math.min(H - 1, Math.ceil(Math.max(...ys)));
            for (let py = miny; py <= maxy; py++) for (let px = minx; px <= maxx; px++) {
                let inside = true, j = 3, sign = 0;
                for (let k = 0; k < 4 && inside; k++) {
                    const p1 = pts[k], p2 = pts[j];
                    const d = (px - p1.sx) * (p2.sy - p1.sy) - (py - p1.sy) * (p2.sx - p1.sx);
                    if (d !== 0) {
                        const s2 = d > 0 ? 1 : -1;
                        if (sign === 0) sign = s2; else if (s2 !== sign) inside = false;
                    }
                    j = k;
                }
                if (inside && zavg < depth[py * W + px]) {
                    depth[py * W + px] = zavg;
                    const o = (py * W + px) * 3;
                    img[o] = color[0]; img[o + 1] = color[1]; img[o + 2] = color[2];
                }
            }
        }
        const raw = Buffer.alloc(H * (1 + W * 3));
        for (let y = 0; y < H; y++) {
            raw[y * (1 + W * 3)] = 0;
            img.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
        }
        const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
        const crc32 = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
        const chunk = (type, data) => {
            const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
            const body = Buffer.concat([Buffer.from(type), data]);
            const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
            return Buffer.concat([len, body, crc]);
        };
        const ihdr = Buffer.alloc(13);
        ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
        const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
        fs.writeFileSync('.commandcode/fa-' + file + '.png', png);
    }
    const bb = {};
    for (const t of tris) {
        const k = t.part, b = bb[k] || (bb[k] = [1e9,-1e9,1e9,-1e9,1e9,-1e9]);
        b[0]=Math.min(b[0],t.v.x); b[1]=Math.max(b[1],t.v.x);
        b[2]=Math.min(b[2],t.v.y); b[3]=Math.max(b[3],t.v.y);
        b[4]=Math.min(b[4],t.v.z); b[5]=Math.max(b[5],t.v.z);
    }
    console.log('== bounding boxes mundo (x, y, z) ==');
    for (const [k,b] of Object.entries(bb)) {
        console.log(' ', k.padEnd(8), 'x', b[0].toFixed(2)+'..'+b[1].toFixed(2), ' y', b[2].toFixed(2)+'..'+b[3].toFixed(2), ' z', b[4].toFixed(2)+'..'+b[5].toFixed(2));
    }
    renderOrtho('side', 'sheep-side');
    renderOrtho('top', 'sheep-top');
    console.log('renders ok |', tris.length / 4, 'quads |', rig.parts.size, 'partes');
    rig.parts.forEach((n, k) => console.log('  parte', k, 'pos', n.position.x.toFixed(3), n.position.y.toFixed(3), n.position.z.toFixed(3), 'baseRot.x', (n.__mfBaseRot?.x || 0).toFixed(3)));
}).catch(e => console.log('error', e));
setTimeout(() => {}, 3000);
