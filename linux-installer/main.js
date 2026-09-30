// minifeather client for linux. electron loads miniblox.io, the preload injects the
// client before any page script (contextisolation off = preload shares the page world),
// and the client's files ride over the mfapp:// custom protocol with cors open wide.
// no csp on miniblox, so the hotloader can eval freely. lucky us. :D

const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// must run before app ready, no exceptions. electron is very serious about this one.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mfapp',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
]);

const PACKAGED_ROOT = path.join(process.resourcesPath || '', 'client');
const DEV_ROOT = path.join(__dirname, 'resources', 'client');
const CLIENT_ROOT = fs.existsSync(PACKAGED_ROOT) ? PACKAGED_ROOT : DEV_ROOT;

function mimeFor(p) {
  const s = p.toLowerCase();
  if (s.endsWith('.js') || s.endsWith('.mjs')) return 'text/javascript';
  if (s.endsWith('.json')) return 'application/json';
  if (s.endsWith('.html')) return 'text/html';
  if (s.endsWith('.css')) return 'text/css';
  if (s.endsWith('.png')) return 'image/png';
  if (s.endsWith('.gif')) return 'image/gif';
  if (s.endsWith('.webp')) return 'image/webp';
  if (s.endsWith('.jpg') || s.endsWith('.jpeg')) return 'image/jpeg';
  if (s.endsWith('.svg')) return 'image/svg+xml';
  if (s.endsWith('.ogg') || s.endsWith('.oga')) return 'audio/ogg';
  if (s.endsWith('.mp3')) return 'audio/mpeg';
  if (s.endsWith('.wav')) return 'audio/wav';
  if (s.endsWith('.ttf')) return 'font/ttf';
  if (s.endsWith('.otf')) return 'font/otf';
  if (s.endsWith('.woff')) return 'font/woff';
  if (s.endsWith('.woff2')) return 'font/woff2';
  if (s.endsWith('.glb')) return 'model/gltf-binary';
  if (s.endsWith('.gltf')) return 'model/gltf+json';
  return 'application/octet-stream';
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 480,
    center: true,
    title: 'minifeather client',
    autoHideMenuBar: true,
    backgroundColor: '#0d0919',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      sandbox: false
    }
  });
  // show only once something is painted, boot on the branded splash, then jump to the
  // game: the white flash never gets a frame to exist in. :D
  win.once('ready-to-show', () => win.show());
  // 68% at the native page-zoom layer: css zoom breaks the game's canvas sizing math,
  // chromium page zoom makes innerWidth grow instead and the canvas fills by itself.
  win.webContents.on('did-finish-load', () => {
    try { win.webContents.setZoomFactor(0.68); } catch (_) {}
  });
  win.loadFile(path.join(__dirname, 'splash.html'));
  let navigatedToGame = false;
  win.webContents.on('did-finish-load', () => {
    if (navigatedToGame) return;
    navigatedToGame = true;
    setTimeout(() => win.loadURL('https://miniblox.io/').catch(() => {}), 450);
  });
}

app.whenReady().then(() => {
  protocol.handle('mfapp', (request) => {
    const cors = { 'access-control-allow-origin': '*' };
    if (request.method === 'OPTIONS') {
      return new Response('', {
        status: 200,
        headers: { ...cors, 'access-control-allow-methods': 'GET, HEAD, OPTIONS', 'access-control-allow-headers': '*' }
      });
    }
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!rel || rel.split('/').includes('..')) {
      return new Response('', { status: 404, headers: cors });
    }
    try {
      const data = fs.readFileSync(path.join(CLIENT_ROOT, rel));
      return new Response(data, {
        status: 200,
        headers: { ...cors, 'content-type': mimeFor(rel), 'cache-control': 'public, max-age=3600' }
      });
    } catch (_) {
      return new Response('', { status: 404, headers: cors });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
