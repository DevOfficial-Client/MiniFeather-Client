// the preload runs before any page script and shares the page world (contextisolation
// off), which makes it the document_start hook electron never gave us directly.
// the minibackground inside main.js also handles the hotloader, so the client keeps
// updating itself from github without reinstalling anything. :v

const fs = require('fs');
const path = require('path');

const PACKAGED_ROOT = process.resourcesPath || '';
const DEV_ROOT = path.join(__dirname, 'resources');
const ROOT = fs.existsSync(path.join(PACKAGED_ROOT, 'mf', 'main.js')) ? PACKAGED_ROOT : DEV_ROOT;

try {
  const mainJs = fs.readFileSync(path.join(ROOT, 'mf', 'main.js'), 'utf8');
  const mainEndJs = fs.readFileSync(path.join(ROOT, 'mf', 'main-end.js'), 'utf8');
  // eval is evil, except today, here, on purpose. :D
  (0, eval)(mainJs);
  (0, eval)(mainEndJs);
} catch (e) {
  console.error('[minifeather] preload injection failed:', e);
}
