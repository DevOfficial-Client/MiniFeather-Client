#!/usr/bin/env node
// Stripper de comentarios // y /* */ para .js del client.
// Máquina de estados: respeta strings ('..', ".."), template literals
// (`..` con ${}), y regexes literales. NO toca http:// ni https://
// dentro de strings. Uso:
//   node tools/strip_comments.js [--dry] [archivo...]

const fs = require('fs');
const path = require('path');
const os = require('os');

const DRY = process.argv.includes('--dry');
const args = process.argv.slice(2).filter(a => a !== '--dry');
const ROOT = path.resolve(__dirname, '..');

function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  // estado previo significativo para decidir si / inicia una regex
  let prev = '';
  const lastSig = () => {
    for (let k = out.length - 1; k >= 0; k--) {
      const c = out[k];
      if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') return c;
    }
    return '';
  };

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    // ── string simple ──
    if (c === "'" || c === '"') {
      const q = c;
      out += c; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }

    // ── template literal ──
    if (c === '`') {
      out += c; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          // embeber: copiar la expresión tal cual (con strings anidadas)
          out += '${'; i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') { depth--; if (!depth) { out += '}'; i++; break; } }
            else if (src[i] === "'" || src[i] === '"') {
              const q = src[i]; out += q; i++;
              while (i < n) {
                if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
                out += src[i];
                if (src[i] === q) { i++; break; }
                i++;
              }
              continue;
            } else if (src[i] === '`') {
              // template anidado: recursion simple (raro, pero seguro)
              const sub = extractNestedTemplate(src, i);
              out += sub.text; i = sub.end;
              continue;
            }
            out += src[i]; i++;
          }
          continue;
        }
        out += src[i];
        if (src[i] === '`') { i++; break; }
        i++;
      }
      continue;
    }

    // ── regex literal ──
    if (c === '/' && c2 !== '/' && c2 !== '*') {
      const p = lastSig();
      const regexOk = p === '' || p === '(' || p === ',' || p === '=' ||
        p === ':' || p === '[' || p === '!' || p === '&' || p === '|' ||
        p === '?' || p === '{' || p === ';' || p === '\n' || p === '}' ||
        p === '+' || p === '-' || p === '*' || p === '%' || p === '<' ||
        p === '>' || p === '~' || p === '^';
      if (regexOk) {
        out += c; i++;
        let inClass = false;
        while (i < n) {
          if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
          if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) { out += '/'; i++; break; }
          else if (src[i] === '\n') break; // no era regex: bail (se copió tal cual)
          out += src[i]; i++;
        }
        // flags
        while (i < n && /[a-z]/i.test(src[i])) { out += src[i]; i++; }
        continue;
      }
    }

    // ── comentarios ──
    if (c === '/' && c2 === '/') {
      // conservar //! y //@ (directivas de bundlers/sourceURL no comunes aquí, pero seguro)
      while (i < n && src[i] !== '\n') i++;
      // out NO recibe nada: se come el comentario entero
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

function extractNestedTemplate(src, start) {
  // devuelve {text, end} de un template `...` anidado completo
  let depth = 0, i = start;
  let text = '';
  while (i < src.length) {
    if (src[i] === '\\') { text += src[i] + (src[i + 1] || ''); i += 2; continue; }
    if (src[i] === '`') {
      depth += (i === start) ? 1 : 1;
      text += '`';
      if (depth >= 2) { i++; return { text, end: i }; }
      i++; continue;
    }
    text += src[i]; i++;
  }
  return { text, end: i };
}

// ── normalizar líneas: colapsar blanks múltiples dejando máx 1 ──
function normalizeBlankLines(code) {
  return code
    .split('\n')
    .reduce((acc, line) => {
      const isBlank = /^\s*$/.test(line);
      if (isBlank && acc.length && /^\s*$/.test(acc[acc.length - 1])) return acc;
      acc.push(line);
      return acc;
    }, [])
    .join('\n');
}

// ── main ──
function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (e.name.endsWith('.js') && e.name !== 'jszip.min.js') files.push(p);
  }
  return files;
}

let targets = [];
if (args.length) {
  targets = args.map(a => path.resolve(ROOT, a));
} else {
  targets = walk(path.join(ROOT, 'src'));
}

let changed = 0, errors = 0;
const { execFileSync } = require('child_process');
for (const f of targets) {
  const src = fs.readFileSync(f, 'utf8');
  const stripped = normalizeBlankLines(stripComments(src));
  if (stripped === src) continue;
  if (DRY) {
    const kb = ((src.length - stripped.length) / 1024).toFixed(1);
    console.log(`[dry] ${path.relative(ROOT, f)}: -${kb} KB`);
    continue;
  }
  try {
    // verificar sintaxis ANTES de escribir
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    console.error(`SKIP (sintaxis previa mala): ${f}`);
    errors++;
    continue;
  }
  const tmp = path.join(os.tmpdir(), 'mf_strip_' + Date.now() + '_' + path.basename(f));
  fs.writeFileSync(tmp, stripped);
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } catch (e) {
    fs.unlinkSync(tmp);
    console.error(`ERROR sintaxis tras strip: ${f} — NO modificado`);
    errors++;
    continue;
  }
  fs.unlinkSync(tmp);
  fs.writeFileSync(f, stripped); // escribir el archivo final ya validado
  const kb = ((src.length - stripped.length) / 1024).toFixed(1);
  console.log(`${path.relative(ROOT, f)}: -${kb} KB`);
  changed++;
}
console.log(`\n${DRY ? '[dry] ' : ''}${changed} archivos modificados, ${errors} errores`);
