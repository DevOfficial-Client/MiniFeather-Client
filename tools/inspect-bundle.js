const fs = require('fs');
const src = fs.readFileSync('bundle.js', 'utf8');

function dump(label, needle, before, after) {
    let i = 0, n = 0;
    while ((i = src.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    console.log('=== ' + label + ' (' + needle + ') x' + n + ' ===');
    i = src.indexOf(needle);
    if (i !== -1) console.log(src.slice(Math.max(0, i - before), i + after));
    console.log('');
}

const what = process.argv[2];
switch (what) {
    case 'model':
        dump('player model parts', 'rightArmTop2', 3000, 3000);
        dump('initMesh', 'initMesh(e){', 200, 3500);
        break;
    case 'geom':
        dump('generateGeometry def', 'generateGeometry(e,t,n,r,i,a,o', 100, 4000);
        break;
    case 'hand':
        dump('hand renderer update', 'armSkin!==', 2500, 2500);
        break;
    case 'getmesh':
        dump('cxIyHVwkzsfbax', 'cxIyHVwkzsfbax(){', 100, 300);
        break;
    default:
        dump('custom needle', process.argv[2], Number(process.argv[3] || 1000), Number(process.argv[4] || 1000));
}
