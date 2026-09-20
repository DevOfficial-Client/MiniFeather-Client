const fs = require('fs');
const c = fs.readFileSync(__dirname + '/assets/index-9c634339.js', 'utf8');
// find "class MasterRenderer" or "static resize" inside it
let i = c.indexOf('MasterRenderer');
console.log('first MasterRenderer @', i);
let j = c.indexOf('class MasterRenderer');
console.log('class MasterRenderer @', j);
if (j !== -1) {
  // find "static resize" after that
  let k = c.indexOf('static resize', j);
  console.log('static resize @', k);
  console.log(JSON.stringify(c.slice(k, k + 700)));
}
