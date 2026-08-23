// Genera un GLB de prueba: cubo 8x8x8 (estilo minecraft, 16 unidades = 1 bloque... aqui 1 unidad = 1 bloque del juego)
const fs = require('fs');

const size = 1; // altura total del cubo en unidades del juego

const h = size / 2;
const pos = new Float32Array([
    -h, -h, -h, h, -h, -h, h, h, -h, -h, h, -h,
    -h, -h, h, h, -h, h, h, h, h, -h, h, h,
    -h, -h, -h, -h, -h, h, -h, h, h, -h, h, -h,
    h, -h, -h, h, -h, h, h, h, h, h, h, -h,
    -h, -h, -h, h, -h, -h, h, -h, h, -h, -h, h,
    -h, h, -h, h, h, -h, h, h, h, -h, h, h
]);
const nor = new Float32Array([
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0
]);
const uv = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1
]);
const idx = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23
]);

// PNG 8x8 rojo (minimal valido)
const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000080000000808020000' +
    '004b6d29dc0000001d4944415478da63fccf00f60300030301034b6d' +
    '0a2cf00000000049454e44ae426082', 'hex');

function chunk4(len) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(len, 0);
    return b;
}

// bufferViews: 0=pos,1=nor,2=uv,3=idx,4=img
const binData = [
    Buffer.from(new Uint8Array(pos.buffer)),
    Buffer.from(new Uint8Array(nor.buffer)),
    Buffer.from(new Uint8Array(uv.buffer)),
    Buffer.from(new Uint8Array(idx.buffer)),
    png
];
const binBuf = Buffer.concat(binData);
const offsets = [];
let o = 0;
for (const d of binData) { offsets.push(o); o += d.length; }

const gltf = {
    asset: { version: '2.0', generator: 'mf-test' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 4, mimeType: 'image/png' }],
    accessors: [
        { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3' },
        { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
        { bufferView: 2, componentType: 5126, count: 24, type: 'VEC2' },
        { bufferView: 3, componentType: 5123, count: 36, type: 'SCALAR' }
    ],
    bufferViews: [
        { buffer: 0, byteOffset: offsets[0], byteLength: pos.byteLength },
        { buffer: 0, byteOffset: offsets[1], byteLength: nor.byteLength },
        { buffer: 0, byteOffset: offsets[2], byteLength: uv.byteLength },
        { buffer: 0, byteOffset: offsets[3], byteLength: idx.byteLength },
        { buffer: 0, byteOffset: offsets[4], byteLength: png.length }
    ],
    buffers: [{ byteLength: binBuf.length }]
};

const jsonBufRaw = Buffer.from(JSON.stringify(gltf));
const pad = (4 - (jsonBufRaw.length % 4)) % 4;
const jsonBuf = Buffer.concat([jsonBufRaw, Buffer.alloc(pad, 0x20)]);
const jsonPadded = jsonBuf.length;
const jsonChunk = Buffer.concat([chunk4(jsonPadded), Buffer.from('JSON'), jsonBuf]);
const binChunk = Buffer.concat([chunk4(binBuf.length), Buffer.from('BIN\x00'), binBuf]);
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + jsonChunk.length + binChunk.length, 8);
const glb = Buffer.concat([header, jsonChunk, binChunk]);
fs.writeFileSync('models/entities/testcube.glb', glb);
console.log('OK: models/entities/testcube.glb (' + glb.length + ' bytes)');
