// Valores de rotacion del walk en root_10 + matrices de la cadena raiz
const fs = require('fs');
const file = process.argv[2] || 'models/entities/verity_full_model.glb';
const b = fs.readFileSync(file);
const len = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + len).toString());
const BIN = 20 + len + 8;

// matrix del nodo 0
const n0 = j.nodes[0];
console.log('nodo 0 "' + n0.name + '" matrix:', JSON.stringify(n0.matrix));

// cadena: 0 -> hijos
for (const [i, n] of j.nodes.entries()) {
    if (i > 5) break;
    console.log('nodo', i, JSON.stringify({ name: n.name, rotation: n.rotation, scale: n.scale, translation: n.translation, children: n.children }));
}

// valores de rotacion del canal walk en root_10
const walk = j.animations.find(a => a.name === 'walk');
for (const ch of walk.channels) {
    if (ch.target.path !== 'rotation') continue;
    const smp = walk.samplers[ch.sampler];
    const vAcc = j.accessors[smp.output];
    const bv = j.bufferViews[vAcc.bufferView];
    const base = BIN + (bv.byteOffset || 0) + (vAcc.byteOffset || 0);
    const stride = bv.byteStride || 16;
    console.log('\nwalk rot node=' + ch.target.node + ' count=' + vAcc.count + ' interp=' + smp.interpolation);
    for (let k = 0; k < vAcc.count; k++) {
        const o = base + k * stride;
        const q = [b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8), b.readFloatLE(o + 12)];
        // quaternion -> euler Y
        const [x, y, z, w] = q;
        const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x)) * 180 / Math.PI;
        if (k < 5 || k > vAcc.count - 3 || Math.abs(yaw) > 5) console.log('  k' + k + ': q=[' + q.map(v => v.toFixed(3)).join(',') + '] yawY=' + yaw.toFixed(1) + '°');
    }
}
