#!/usr/bin/env node
// empaca el arbol de la extension en dos zips de release:
//   chrome  = tree tal cual (MV3, service_worker)
//   firefox = mismo tree + manifest cruzado (event page + gecko id, firefox 128+ para world:MAIN)
// el arbol es el mismo que preparan el msi y el linux (misma lista, mismas recetas) — si esos
// cargan, esto carga. usa el jszip que ya vive en src/Libraries, cero dependencias nuevas.
const fs = require('fs');
const path = require('path');
const JSZip = require('../src/Libraries/jszip.min.js');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['src', 'assets', 'classic', 'models', 'textures', 'skins', 'emotes'];
const FILES = ['defaults.json', 'hotload.json', 'build.json',
  'EULA.md', 'EULA.es.md', 'EULA-TLDR.md', 'EULA-TLDR.en.md', 'LICENSE'];

function walk(zip, abs, rel) {
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const absP = path.join(abs, entry.name);
    const relP = rel + '/' + entry.name;
    if (entry.isDirectory()) walk(zip, absP, relP);
    else zip.file(relP, fs.readFileSync(absP));
  }
}

function buildZip(manifestObj) {
  const zip = new JSZip();
  for (const d of DIRS) {
    const abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) walk(zip, abs, d);
  }
  for (const f of FILES) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) zip.file(f, fs.readFileSync(p));
  }
  zip.file('manifest.json', JSON.stringify(manifestObj, null, 2));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const version = manifest.version;
  const firefox = {
    ...manifest,
    background: {
      service_worker: manifest.background.service_worker,
      scripts: [manifest.background.service_worker],
    },
    browser_specific_settings: {
      gecko: { id: 'minifeather@devofficial-client', strict_min_version: '128.0' },
    },
  };

  const outDir = path.join(ROOT, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  for (const browser of ['chrome', 'firefox']) {
    const out = path.join(outDir, `MiniFeather-Client-${version}-${browser}.zip`);
    fs.writeFileSync(out, await buildZip(browser === 'chrome' ? manifest : firefox));
    console.log('packed', path.relative(ROOT, out), (fs.statSync(out).size / 1048576).toFixed(1) + 'MB');
  }
})();
