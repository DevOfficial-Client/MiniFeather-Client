#!/usr/bin/env node
// converts the legal eula (en) into a rtf license file for the wix msi installer page.
// run from the repo root: node tools/make-license-rtf.js
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'EULA.md');
const dst = path.join(root, 'windows-msi', 'src-tauri', 'windows', 'license.rtf');

const text = fs.readFileSync(src, 'utf8');
let out = '';
for (const ch of text) {
  const code = ch.codePointAt(0);
  if (ch === '\\') out += '\\\\';
  else if (ch === '{') out += '\\{';
  else if (ch === '}') out += '\\}';
  else if (ch === '\n') out += '\\par ';
  else if (ch === '\r') { /* nothing, crlf noise */ }
  else if (code < 128) out += ch;
  else out += '\\u' + code + '?';
}

const rtf = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Segoe UI;}}\\fs16\\pard ' + out + '}';
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, rtf);
console.log('license.rtf written:', dst, fs.statSync(dst).size, 'bytes');
