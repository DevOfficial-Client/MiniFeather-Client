#!/usr/bin/env node
// minifica el árbol del client para el repo de distribución minificada.
//
//   node tools/minify-repo.js [raiz]
//
// sin argumento opera sobre este repo (no lo hagas en el repo de dev sin
// pensar: reescribe los src en el sitio). el workflow lo corre DENTRO del
// clone del repo minificado, ya sincronizado, y así el árbol queda
// estructuralmente idéntico al original: mismas rutas, mismo mirror.json,
// mismo hotload — solo que el código está masticado.
//
// reglas de la casa:
// - solo src/**/*.js. tools/ y tests/ viajan legibles (el repo minificado
//   tiene que poder regenerar sus propios bundles, y la auditoría es parte
//   del trato: nada de "escondemos algo").
// - src/Libraries/** y *.min.js se copian tal cual: son de terceros, ya
//   vienen minificados y sus headers MIT no se tocan.
// - terser conservador: sin mangle y sin eliminar "unused" — los módulos
//   se hablan por globals implícitos entre <script> tags y terser no puede
//   ver ese uso cross-archivo. el ahorro real está en comentarios y
//   whitespace, que en este repo sobran.
// - después de minificar regenera mirror.js y userscript desde el árbol ya
//   masticado (build-mirror valida sintaxis de cada módulo: si terser
//   rompió algo, el build grita antes de pushear).
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { minify } = require('terser');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SRC = path.join(ROOT, 'src');

const OPTS = {
  compress: { passes: 2, unused: false, collapse_vars: false, dead_code: true },
  mangle: false,
  format: { comments: false, ascii_only: true }
};

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.name.endsWith('.js')) out.push(abs);
  }
  return out;
}

function isExcluded(rel) {
  if (rel.startsWith('src/Libraries/')) return true; // terceros, headers MIT intactos
  if (rel.endsWith('.min.js')) return true;
  return false;
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[minify-repo] no hay src/ en ' + ROOT);
    process.exit(1);
  }
  const files = walk(SRC, []).map(f => path.relative(ROOT, f).replace(/\\/g, '/')).sort();
  let before = 0, after = 0, done = 0;
  for (const rel of files) {
    if (isExcluded(rel)) continue;
    const abs = path.join(ROOT, rel);
    const code = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    const r = await minify(code, OPTS);
    if (!r.code || !r.code.trim()) {
      console.error('[minify-repo] terser devolvió vacío para ' + rel + ' — aborto, no se escribió nada');
      process.exit(1);
    }
    try { new vm.Script(r.code, { filename: rel }); } catch (e) {
      console.error('[minify-repo] ' + rel + ' minificado no parsea: ' + e.message + ' — aborto');
      process.exit(1);
    }
    before += code.length;
    after += r.code.length;
    fs.writeFileSync(abs, r.code);
    done++;
  }
  console.log(`[minify-repo] ${done} módulos minificados: ${(before / 1e6).toFixed(2)} MB → ${(after / 1e6).toFixed(2)} MB (${(100 - after / before * 100).toFixed(0)}% menos)`);

  // bundles regenerados desde el árbol ya minificado: mismo mirror.json,
  // mismo orden, mismo hotload — la distribución solo cambia de grano.
  execFileSync('node', [path.join(ROOT, 'tools', 'build-mirror.js')], { stdio: 'inherit', cwd: ROOT });
  execFileSync('node', [path.join(ROOT, 'tools', 'build-mobile.js'), '--no-android', '--no-tauri', '--no-electron'], { stdio: 'inherit', cwd: ROOT });
  console.log('[minify-repo] ok');
}

main().catch(e => { console.error('[minify-repo] falló:', e); process.exit(1); });
