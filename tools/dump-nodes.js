// Dump de jerarquia de nodos + canales de rotacion del GLB
const fs = require('fs');
const file = process.argv[2] || 'models/entities/verity_full_model.glb';
const b = fs.readFileSync(file);
const len = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + len).toString());

// indices de nodos raiz de la escena
const sceneIdx = j.scene ?? 0;
const rootNodes = j.scenes?.[sceneIdx]?.nodes || [];
console.log('scene', sceneIdx, 'roots:', rootNodes.map(i => i + '(' + (j.nodes[i]?.name || '?') + ')').join(', '));

// canales por anim -> nodo
function nodePath(idx) {
    // buscar camino desde raiz
    const path = [];
    (function walk(i, acc) {
        acc.push(i);
        if (rootNodes.includes(i)) { path.push(...acc); return true; }
        for (const [pi, n] of j.nodes.entries()) {
            if ((n.children || []).includes(i)) return walk(pi, acc);
        }
        return false;
    })(idx, []);
    return path;
}

for (const a of j.animations || []) {
    const rotCh = a.channels.filter(c => c.target?.path === 'rotation');
    if (!rotCh.length) continue;
    const rootHits = rotCh.filter(c => rootNodes.includes(c.target.node));
    const firsts = rotCh.slice(0, 3).map(c => c.target.node + '(' + (j.nodes[c.target.node]?.name || '?') + ')').join(', ');
    console.log('anim "' + a.name + '": ' + rotCh.length + ' rot channels, primeros: ' + firsts + (rootHits.length ? '  <<< ' + rootHits.length + ' TOCAN LA RAIZ' : ''));
}

// dump de nodos raiz: transform
for (const i of rootNodes) {
    const n = j.nodes[i];
    console.log('root node', i, JSON.stringify({ name: n.name, rotation: n.rotation, scale: n.scale, translation: n.translation, hasMatrix: !!n.matrix, children: (n.children || []).length }));
}
