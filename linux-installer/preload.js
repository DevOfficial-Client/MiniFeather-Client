// the preload runs before any page script and shares the page world (contextisolation
// off), which makes it the document_start hook electron never gave us directly.
// the minibackground inside main.js also handles the hotloader, so the client keeps
// updating itself from github without reinstalling anything. :v

const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

// the page asks for this bridge when it needs to upload a chat image: the main
// process does the catbox post, because cors does not apply to node. :D
window.__MF_UPLOAD_BRIDGE__ = async (file) => {
  const b64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
  const url = await ipcRenderer.invoke('mf-upload', { name: file.name || 'imagen.png', mime: file.type || 'image/png', b64 });
  return { success: true, url };
};

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
