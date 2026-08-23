// Inferir el eje "frente" del personaje: dump de nodos con nombres y offsets
const fs = require('fs');
const file = process.argv[2] || 'models/entities/verity_full_model.glb';
const b = fs.readFileSync(file);
const len = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + len).toString());

// 1. nodos con nombre interesante (cara)
for (const [i, n] of j.nodes.entries()) {
    const nm = (n.name || '').toLowerCase();
    if (/mouth|eye|face|nose|head|cam/.test(nm)) {
        console.log('nodo', i, JSON.stringify({ name: n.name, translation: n.translation, parent: j.nodes.findIndex(p => (p.children || []).includes(i)) }));
    }
}

// 2. walk: TODOS los canales (path+node) para ver root motion
const walk = j.animations.find(a => a.name === 'walk');
console.log('\nwalk channels:');
for (const ch of walk.channels) {
    const n = j.nodes[ch.target.node];
    console.log('  node=' + ch.target.node + '(' + (n?.name || '?') + ') path=' + ch.target.path);
}

// 3. bounds del mesh (min/max de POSITION del primer mesh) sin aplicar matrix de nodo 0
const meshNode = j.nodes.find(n => n.mesh != null);
const prim = j.meshes[meshNode.mesh].primitives[0];
const posAcc = j.accessors[prim.attributes.POSITION];
console.log('\nmesh POSITION bounds:', JSON.stringify(posAcc.min), JSON.stringify(posAcc.max));
