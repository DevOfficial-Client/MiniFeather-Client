const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'textures');
const BG = path.join(__dirname, '..', 'src', 'background.js');

const SKIP_DIRS = new Set(['entity/skins', 'entity/capes', 'particle/particles']);
const NAME_OK = /^[A-Za-z0-9_-]+\.png$/i;

const out = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(ROOT, path.join(dir, e.name)).replace(/\\/g, '/');
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(rel)) continue;
      walk(path.join(dir, e.name));
    } else if (NAME_OK.test(e.name)) {
      const top = rel.split('/').slice(0, 2).join('/');
      if (SKIP_DIRS.has(top)) continue;
      out.push(rel);
    }
  }
}
walk(ROOT);

const nested = path.join(ROOT, 'particle', 'particles', 'textures', 'particle');
if (fs.existsSync(nested)) {
  for (const f of fs.readdirSync(nested)) {
    if (!NAME_OK.test(f)) continue;
    const flat = 'particle/' + f;
    if (!fs.existsSync(path.join(ROOT, flat))) {
      fs.copyFileSync(path.join(nested, f), path.join(ROOT, flat));
    }
    if (!out.includes(flat)) out.push(flat);
  }
}

out.sort();

const ui = [];
const menuDir = path.join(__dirname, '..', 'assets', 'menu');
if (fs.existsSync(menuDir)) {
  for (const f of fs.readdirSync(menuDir)) {
    if (/\.(webp|png|jpg)$/i.test(f)) ui.push(f);
  }
}
ui.sort();

let src = fs.readFileSync(BG, 'utf8');
const blocks = {
  LOCAL_TEXTURES: out.map(p => JSON.stringify(p)),
  MENU_UI_IMAGES: ui.map(f => JSON.stringify(f))
};
for (const [name, items] of Object.entries(blocks)) {
  const re = new RegExp(
    `(\\/\\/ MFGEN:${name}:start[\\s\\S]*?\\/\\/ MFGEN:${name}:end)`
  );
  const replacement =
    `// MFGEN:${name}:start\n` +
    `const ${name} = [\n  ${items.join(',\n  ')}\n];\n` +
    `// MFGEN:${name}:end`;
  if (!re.test(src)) {
    console.error(`No se encontró el bloque MFGEN:${name} en background.js`);
    process.exit(1);
  }
  src = src.replace(re, replacement);
}
fs.writeFileSync(BG, src);
console.log(`LOCAL_TEXTURES: ${out.length} archivos`);
console.log(`MENU_UI_IMAGES: ${ui.length} archivos`);
