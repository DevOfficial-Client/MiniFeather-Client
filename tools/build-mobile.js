#!/usr/bin/env node
// minifeather client mobile/embedded bundler.
// packs every module in the exact manifest.json order and emits one bundle per target:
//   dist/MiniFeatherClient.user.js                  -> userscript (ios userscripts app, firefox android, desktop)
//   android/app/src/main/assets/mf/main[-end].js    -> android webview boot (end loaded with defer)
//   windows-msi/src-tauri/resources/mf/main[-end].js -> tauri init scripts (end wrapped for domcontentloaded)
//   linux-installer/resources/mf/main[-end].js       -> electron preload (end wrapped for domcontentloaded)
// the eula gate only rides along on tauri/electron. :D
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const buildUser = !args.has('--no-user');
const buildAndroid = !args.has('--no-android');
const buildTauri = !args.has('--no-tauri');
const buildElectron = !args.has('--no-electron');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const VERSION = manifest.version || '0.0.0';

let COMMIT = process.env.MF_BUILD_COMMIT || null;
if (!COMMIT) {
  try {
    COMMIT = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (_) { COMMIT = null; }
}

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

// shared no-extension core: shim -> minibackground -> in-page redirects.
// the shim defines chrome.* before any module gets curious about it.
const HEAD = [
  'src/Core/CompatShim.js',
  'src/Core/MF_MiniBackground.js',
  'src/Core/MF_InPageRedirects.js'
];
const EULA_GATE = 'src/Core/MF_EulaGate.js';

function readModule(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[build-mobile] missing module: ${rel}`);
    process.exit(1);
  }
  const code = fs.readFileSync(abs, 'utf8');
  return `/* ==== mf module: ${rel} ==== */\n${code}\n//# sourceURL=MF:${rel}\n`;
}

function concat(files) {
  return files.map(readModule).join('\n');
}

function buildInfoComment() {
  return [
    `/* minifeather client bundle (no extension)`,
    ` * version : ${VERSION}`,
    ` * commit  : ${COMMIT || 'unknown'}`,
    ` * builtAt : ${new Date().toISOString()}`,
    ` */`
  ].join('\n');
}

function configLine(extra) {
  return `window.__MF_BUILD__=${JSON.stringify({ version: VERSION, commit: COMMIT, builtAt: new Date().toISOString(), pinned: !!extra.pinned })};\n` +
    (extra.assetBase ? `window.__MF_ASSET_BASE__=${JSON.stringify(extra.assetBase)};\n` : '') +
    (extra.zoom ? `window.__MF_ZOOM_DEFAULT__=${JSON.stringify(extra.zoom)};\n` : '');
}

const headCode = concat(HEAD);
const gateCode = concat([EULA_GATE]);
const docStartCode = concat(docStart);
const docEndCode = concat(docEnd);

for (const [name, code] of [['head', headCode], ['docStart', docStartCode], ['docEnd', docEndCode]]) {
  if (!code.trim()) { console.error(`[build-mobile] empty group: ${name}`); process.exit(1); }
}

function write(rel, content) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  console.log(`[build-mobile] ${rel} (${(content.length / 1e6).toFixed(1)} mb)`);
}

// the docend group wrapped so it can also run from a document-start context
function wrappedDocEnd() {
  return [
    '  function __mfRunDocEnd() {',
    docEndCode,
    '  }',
    "  if (document.readyState === 'loading') {",
    "    document.addEventListener('DOMContentLoaded', __mfRunDocEnd, { once: true });",
    '  } else {',
    '    __mfRunDocEnd();',
    '  }'
  ].join('\n');
}

// chrome document_start guarantees <html> exists; webview2/tauri init scripts run even
// earlier and modules that touch the dom before <html> would wedge the parser. so the
// docstart group waits for documentElement, which lands us before any game script. :D
function wrappedDocStart() {
  return [
    '(function () {',
    '  function __mfRunDocStart() {',
    docStartCode,
    '  }',
    '  if (document.documentElement) {',
    '    __mfRunDocStart();',
    '  } else {',
    '    const __mfWaitHtml = function () {',
    '      if (document.documentElement) __mfRunDocStart();',
    '      else setTimeout(__mfWaitHtml, 0);',
    '    };',
    '    __mfWaitHtml();',
    '  }',
    '})();'
  ].join('\n');
}

// init scripts also fire on the local splash document in tauri/electron; booting the
// whole client there would open sockets and patch things for nothing, so gate it. :D
function guardedBoot(bodyCode) {
  return [
    '(function () {',
    "  if (!/(^|\\.)miniblox\\.(io|online)$/.test(location.hostname)) return;",
    bodyCode,
    '})();'
  ].join('\n');
}

if (buildUser) {
  const header = [
    '// ==UserScript==',
    '// @name         MiniFeather Client (Mobile)',
    '// @namespace    devofficial-client',
    `// @version      ${VERSION}`,
    '// @description  minifeather client for miniblox -- userscript for ios (userscripts app + safari), firefox android and desktop',
    '// @author       DevOfficial-Client',
    '// @match        https://miniblox.io/*',
    '// @match        https://miniblox.online/*',
    '// @run-at       document-start',
    '// @grant        none',
    '// @license      MIT',
    '// ==/UserScript=='
  ].join('\n');
  const userJs = [
    header,
    buildInfoComment(),
    '(function () {',
    '  "use strict";',
    configLine({ pinned: true }),
    headCode,
    wrappedDocStart(),
    wrappedDocEnd(),
    '})();'
  ].join('\n');
  write('dist/MiniFeatherClient.user.js', userJs);
}

if (buildAndroid) {
  const mainJs = [
    buildInfoComment(),
    configLine({ pinned: false, assetBase: 'https://appassets.androidplatform.net/' }),
    headCode,
    wrappedDocStart()
  ].join('\n');
  const mainEndJs = [buildInfoComment(), docEndCode].join('\n');
  write('android/app/src/main/assets/mf/main.js', mainJs);
  write('android/app/src/main/assets/mf/main-end.js', mainEndJs);
}

if (buildTauri) {
  // webview2 init scripts run before any page script, so the docend group waits here.
  // base is the custom protocol tauri registers on windows: http://mfapp.localhost/
  const mainJs = [
    buildInfoComment(),
    configLine({ pinned: true, assetBase: 'http://mfapp.localhost/', zoom: 0.68 }),
    guardedBoot([headCode, gateCode, wrappedDocStart()].join('\n'))
  ].join('\n');
  const mainEndJs = [buildInfoComment(), guardedBoot(['(function(){', '"use strict";', wrappedDocEnd(), '})();'].join('\n'))].join('\n');
  write('windows-msi/src-tauri/resources/mf/main.js', mainJs);
  write('windows-msi/src-tauri/resources/mf/main-end.js', mainEndJs);
}

if (buildElectron) {
  // preload runs in the page world (contextisolation off) before page scripts.
  // electron registers mfapp://app as a standard secure scheme in the main process.
  const mainJs = [
    buildInfoComment(),
    configLine({ pinned: true, assetBase: 'mfapp://app/', zoom: 0.68 }),
    guardedBoot([headCode, gateCode, wrappedDocStart()].join('\n'))
  ].join('\n');
  const mainEndJs = [buildInfoComment(), guardedBoot(['(function(){', '"use strict";', wrappedDocEnd(), '})();'].join('\n'))].join('\n');
  write('linux-installer/resources/mf/main.js', mainJs);
  write('linux-installer/resources/mf/main-end.js', mainEndJs);
}

console.log(`[build-mobile] commit: ${COMMIT ? COMMIT.slice(0, 9) : 'n/a'} · version: ${VERSION}`);
console.log('[build-mobile] ok');
