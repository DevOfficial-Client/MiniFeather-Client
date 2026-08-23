// Inspeccion rápida de un GLB: estructura, atributos, texturas, animaciones
const fs = require('fs');
const file = process.argv[2];
if (!file) { console.error('uso: node inspect-glb.js <archivo.glb>'); process.exit(1); }
const b = fs.readFileSync(file);
if (b.readUInt32LE(0) !== 0x46546c67) { console.error('no es GLB'); process.exit(1); }
const jsonLen = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + jsonLen).toString());

console.log('archivo      :', file);
console.log('bytes        :', b.length);
console.log('generator    :', j.asset && j.asset.generator);
console.log('nodes/meshes :', (j.nodes || []).length, '/', (j.meshes || []).length);
console.log('materials    :', (j.materials || []).length, 'images:', (j.images || []).length);
console.log('animations   :', (j.animations || []).length);
console.log('skins        :', (j.skins || []).length, '(soportado: no)');

(j.meshes || []).forEach((m, i) => {
    m.primitives.forEach((p, pi) => {
        const a = j.accessors[p.attributes.POSITION];
        console.log(`mesh[${i}].prim[${pi}]`, 'attrs=' + Object.keys(p.attributes).join(','), 'idxCT=' + (p.indices != null ? j.accessors[p.indices].componentType : '-'), 'verts=' + a.count);
        if (a.min && a.max) console.log('   bbox', JSON.stringify(a.min), JSON.stringify(a.max));
    });
});
(j.images || []).forEach((im, i) => {
    const bv = im.bufferView != null ? j.bufferViews[im.bufferView] : null;
    console.log('img[' + i + ']', im.mimeType, bv ? bv.byteLength + 'B' : (im.uri || '').slice(0, 40));
});
(j.materials || []).forEach((m, i) => {
    const pbr = m.pbrMetallicRoughness || {};
    console.log('mat[' + i + ']', 'tex=' + (pbr.baseColorTexture ? pbr.baseColorTexture.index : '-'), 'factor=' + JSON.stringify(pbr.baseColorFactor || null), 'alpha=' + m.alphaMode, 'doubleSided=' + m.doubleSided);
});
(j.animations || []).forEach((a, i) => console.log('anim[' + i + ']', a.name || '(sin nombre)', a.channels.length + 'ch'));
