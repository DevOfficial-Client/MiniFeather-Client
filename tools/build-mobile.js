#!/usr/bin/env node
/*
 * MiniFeather Client — build-mobile.js
 * Empaqueta el client (mismo orden de módulos que manifest.json) para entornos sin extensión:
 *   - dist/MiniFeatherClient.user.js            → userscript (iOS vía app "Userscripts", escritorio, Android vía Firefox)
 *   - android/app/src/main/assets/mf/main.js     → arranque document_start del APK
 *   - android/app/src/main/assets/mf/main-end.js → grupo document_end del APK (se carga con defer)
 * Uso: node tools/build-mobile.js [--user-only|--android-only]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const buildAll = !args.has('--user-only') && !args.has('--android-only');
const buildUser = buildAll || args.has('--user-only');
const buildAndroid = buildAll || args.has('--android-only');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const VERSION = manifest.version || '0.0.0';

let COMMIT = process.env.MF_BUILD_COMMIT || null;
if (!COMMIT) {
  try {
    COMMIT = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (_) { COMMIT = null; }
}

// ---------- grupos desde el manifest ----------
const csBlocks = manifest.content_scripts || [];
const docStartBlocks = csBlocks.filter(b => (b.run_at || 'document_start') === 'document_start');
const docEndBlocks = csBlocks.filter(b => b.run_at === 'document_end');

const seen = new Set();
const docStart = [];
for (const block of docStartBlocks) {
  for (const file of block.js || []) {
    if (seen.has(file)) continue;
    seen.add(file);
    docStart.push(file);
  }
}
const docEnd = [];
for (const block of docEndBlocks) {
  for (const file of block.js || []) {
    if (seen.has(file)) continue;
    seen.add(file);
    docEnd.push(file);
  }
}

// Núcleo compartido sin extensión: shim → mini-background → redirects in-página.
// Va antes de todo (el shim define chrome.* antes de que cualquier módulo lo consulte).
const HEAD = [
  'src/Core/CompatShim.js',
  'src/Core/MF_MiniBackground.js',
  'src/Core/MF_InPageRedirects.js'
];

function readModule(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[build-mobile] FALTA el módulo: ${rel}`);
    process.exit(1);
  }
  const code = fs.readFileSync(abs, 'utf8');
  return `/* ==== MF module: ${rel} ==== */\n${code}\n//# sourceURL=MF:${rel}\n`;
}

function concat(files) {
  return files.map(readModule).join('\n');
}

function buildInfoComment() {
  return [
    `/* MiniFeather Client build (sin extensión)`,
    ` * version : ${VERSION}`,
    ` * commit  : ${COMMIT || 'desconocido'}`,
    ` * builtAt : ${new Date().toISOString()}`,
    ` */`
  ].join('\n');
}

const configLine = (extra) =>
  `window.__MF_BUILD__=${JSON.stringify({ version: VERSION, commit: COMMIT, builtAt: new Date().toISOString(), pinned: extra.pinned })};\n` +
  (extra.assetBase ? `window.__MF_ASSET_BASE__=${JSON.stringify(extra.assetBase)};\n` : '');

const headCode = concat(HEAD);
const docStartCode = concat(docStart);
const docEndCode = concat(docEnd);

let fail = false;
for (const [name, code] of [['head', headCode], ['docStart', docStartCode], ['docEnd', docEndCode]]) {
  if (!code.trim()) { console.error(`[build-mobile] grupo vacío: ${name}`); fail = true; }
}
if (fail) process.exit(1);

// ---------- userscript ----------
if (buildUser) {
  const header = [
    '// ==UserScript==',
    '// @name         MiniFeather Client (Mobile)',
    `// @namespace    ${'devofficial-client'}`,
    `// @version      ${VERSION}`,
    '// @description  MiniFeather Client para MiniBlox — userscript para iOS (app Userscripts + Safari), Firefox Android y escritorio',
    '// @author       DevOfficial-Client',
    '// @match        https://miniblox.io/*',
    '// @match        https://miniblox.online/*',
    '// @run-at       document-start',
    '// @grant        none',
    '// @license      MIT',
    '// ==/UserScript=='
  ].join('\n');

  // El grupo document_end espera a que el DOM exista (en el manifest corre en document_end).
  const userJs = [
    header,
    buildInfoComment(),
    '(function () {',
    '  "use strict";',
    configLine({ pinned: true }),
    headCode,
    docStartCode,
    '  function __mfRunDocEnd() {',
    docEndCode,
    '  }',
    "  if (document.readyState === 'loading') {",
    "    document.addEventListener('DOMContentLoaded', __mfRunDocEnd, { once: true });",
    '  } else {',
    '    __mfRunDocEnd();',
    '  }',
    '})();'
  ].join('\n');

  const outDir = path.join(ROOT, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'MiniFeatherClient.user.js');
  fs.writeFileSync(outPath, userJs);
  console.log(`[build-mobile] userscript → ${path.relative(ROOT, outPath)} (${(userJs.length / 1e6).toFixed(1)} MB)`);
}

// ---------- Android ----------
if (buildAndroid) {
  const androidMfDir = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'mf');
  fs.mkdirSync(androidMfDir, { recursive: true });

  const mainJs = [
    buildInfoComment(),
    configLine({ pinned: false, assetBase: 'https://appassets.androidplatform.net/' }),
    headCode,
    docStartCode
  ].join('\n');

  // main-end se sirve con defer: ya corre tras el parseo del documento (equivalente a document_end).
  const mainEndJs = [buildInfoComment(), docEndCode].join('\n');

  const p1 = path.join(androidMfDir, 'main.js');
  const p2 = path.join(androidMfDir, 'main-end.js');
  fs.writeFileSync(p1, mainJs);
  fs.writeFileSync(p2, mainEndJs);
  console.log(`[build-mobile] android main.js → ${path.relative(ROOT, p1)} (${(mainJs.length / 1e6).toFixed(1)} MB)`);
  console.log(`[build-mobile] android main-end.js → ${path.relative(ROOT, p2)} (${(mainEndJs.length / 1e6).toFixed(1)} MB)`);
}

console.log(`[build-mobile] commit: ${COMMIT ? COMMIT.slice(0, 9) : 'n/d'} · version: ${VERSION}`);
console.log('[build-mobile] OK');
