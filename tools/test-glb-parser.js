// Test del parser GLB (misma logica que CustomModels.js) contra testcube.glb
const fs = require('fs');

function parseGLB(buffer) {
    const dv = new DataView(buffer);
    if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('magic invalido');
    const total = dv.getUint32(8, true);
    let json = null, bin = null, off = 12;
    while (off < total) {
        const len = dv.getUint32(off, true);
        const type = dv.getUint32(off + 4, true);
        const start = off + 8;
        if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
        else if (type === 0x004e4942) bin = buffer.slice(start, start + len);
        off = start + len;
    }
    return { json, bin };
}

function readAccessor(parsed, acc) {
    const { json: gltf, bin } = parsed;
    const dv = new DataView(bin);
    const sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    const reads = {
        5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o),
        5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true),
        5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true)
    };
    const numC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
    const comp = sizes[acc.componentType];
    const read = reads[acc.componentType];
    const bv = gltf.bufferViews[acc.bufferView || 0];
    const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const tight = comp * numC;
    const stride = bv.byteStride || tight;
    const isFloat = acc.componentType === 5126;
    const out = isFloat ? new Float32Array(acc.count * numC) : new Uint32Array(acc.count * numC);
    for (let i = 0; i < acc.count; i++) {
        const row = base + i * stride;
        for (let j = 0; j < numC; j++) out[i * numC + j] = read(row + j * comp);
    }
    return out;
}

const buf = fs.readFileSync('models/entities/testcube.glb');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const parsed = parseGLB(ab);
const g = parsed.json;
console.log('accessors:', g.accessors.length, '| materiales:', g.materials.length, '| imagenes:', g.images.length);
const pos = readAccessor(parsed, g.accessors[0]);
const idx = readAccessor(parsed, g.accessors[3]);
console.log('posiciones:', pos.length / 3, 'vertices | indices:', idx.length);
console.log('primer vertice:', pos[0].toFixed(2), pos[1].toFixed(2), pos[2].toFixed(2));
console.log('primeros indices:', Array.from(idx.slice(0, 6)).join(','));
// min/max Y para verificar height calc
let maxY = -Infinity, minY = Infinity;
for (let i = 1; i < pos.length; i += 3) { if (pos[i] > maxY) maxY = pos[i]; if (pos[i] < minY) minY = pos[i]; }
console.log('Y min/max:', minY, '/', maxY, '=> altura:', (maxY - minY).toFixed(2));
console.log('PNG en bufferView 4: primeros bytes =', new Uint8Array(parsed.bin, g.bufferViews[4].byteOffset, 4));
console.log('PARSER OK');
