const fs = require('fs');
const s = fs.readFileSync('bundle.js', 'utf8');
let i = 0, n = 0;
const re = /this\.type=`([\w_]+)`/g;
let m, out = [];
while ((m = re.exec(s)) !== null) out.push(m[1]);
console.log('this.type= x' + out.length + ':');
console.log(out.join(', '));
