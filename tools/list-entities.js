const fs = require('fs');
const s = fs.readFileSync('bundle.js', 'utf8');
const re = /className:`(Entity\w+)`,summonName:`([\w_]+)`/g;
let m, out = [];
while ((m = re.exec(s)) !== null) out.push(m[1] + '=' + m[2]);
console.log('registry (' + out.length + '):');
console.log(out.join('\n'));
