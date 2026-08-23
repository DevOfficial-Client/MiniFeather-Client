// Arbol completo de nodos con offsets + posiciones de ojos relativos a node 3
const fs = require('fs');
const file = process.argv[2] || 'models/entities/verity_full_model.glb';
const b = fs.readFileSync(file);
const len = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + len).toString());

const byParent = new Map();
for (const [i, n] of j.nodes.entries()) {
    for (const c of n.children || []) byParent.set(c, i);
}
function pathOf(i) {
    const p = [];
    while (i != null) { p.push(i); i = byParent.get(i); }
    return p.reverse();
}

// arbol desde raiz, con translation acumulada (sin matrix de node 0)
(function walk(i, depth, acc) {
    const n = j.nodes[i];
    const t = (n.translation || [0, 0, 0]).map(v => +v.toFixed(3));
    if (depth < 8) console.log('  '.repeat(depth) + i + ' "' + (n.name || '?') + '"' + (n.mesh != null ? ' [mesh]' : '') + ' t=' + JSON.stringify(t) + (n.scale && (n.scale[0] !== 1 || n.scale[1] !== 1 || n.scale[2] !== 1) ? ' s=' + JSON.stringify(n.scale) : ''));
    for (const c of n.children || []) walk(c, depth + 1);
})(0, 0);

// chain bajo node 7 (la copia visible en walk): buscar ojos por nombre
console.log('\n--- nodos con "eye" y su offset relativo a node 3 (suma de translations) ---');
for (const [i, n] of j.nodes.entries()) {
    if (!/eye/i.test(n.name || '')) continue;
    const chain = pathOf(i);
    if (!chain.includes(7)) continue; // solo la copia visible
    let ox = 0, oy = 0, oz = 0;
    for (const k of chain) {
        if (k === 3) break;
        const t = j.nodes[k].translation || [0, 0, 0];
        ox += t[0]; oy += t[1]; oz += t[2];
    }
    const own = n.translation || [0, 0, 0];
    console.log('node ' + i + ' "' + n.name + '": rel a node3 = [' + (ox + own[0]).toFixed(3) + ',' + (oy + own[1]).toFixed(3) + ',' + (oz + own[2]).toFixed(3) + '] chain=' + chain.join('>'));
}
