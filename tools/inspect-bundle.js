const s = require('fs').readFileSync('bundle.js', 'utf8');
const pats = ['cxIyHVwkzsfbax()', 'downloadSkin(e)', 'compact:', 'ratio:'];
for (const p of pats) {
    let i = -1;
    let count = 0;
    while ((i = s.indexOf(p, i + 1)) >= 0 && count < 3) {
        console.log('=== ' + p + ' @' + i + ' ===');
        console.log(s.slice(Math.max(0, i - 400), i + 500).replace(/\n/g, ' '));
        console.log();
        count++;
    }
}
