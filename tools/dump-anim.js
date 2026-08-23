// Dump detallado de animaciones de un GLB (times por sampler)
const fs = require('fs');
const file = process.argv[2] || 'models/entities/verity_full_model.glb';
const b = fs.readFileSync(file);
const len = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + len).toString());

function accBytes(i) { return j.accessors[i]; }

for (const [ai, a] of (j.animations || []).entries()) {
    if (!['walk', 'idle', 'talk', 'dance'].includes(a.name || '')) continue;
    console.log('===', a.name);
    for (const [ci, ch] of a.channels.entries()) {
        const node = j.nodes[ch.target.node];
        const smp = a.samplers[ch.sampler];
        const tAcc = accBytes(smp.input);
        const vAcc = accBytes(smp.output);
        // leer times raw
        const bv = j.bufferViews[tAcc.bufferView];
        const off = (bv.byteOffset || 0) + (tAcc.byteOffset || 0);
        const n = Math.min(tAcc.count, 6);
        const times = [];
        for (let k = 0; k < n; k++) times.push(b.readFloatLE(20 + len + 8 + bv.byteOffset + (tAcc.byteOffset || 0) + k * 4).toFixed(3));
        console.log(` ch${ci} node=${ch.target.node}(${node?.name || '?'}) path=${ch.target.path} interp=${smp.interpolation} count=${tAcc.count} times=[${times.join(',')}] outCount=${vAcc.count} outCT=${vAcc.componentType}`);
    }
}
