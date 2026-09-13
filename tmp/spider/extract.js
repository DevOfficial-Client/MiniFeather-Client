// Extrae los presets de torso de SpiderTorsoModels.kt a SpiderTorsoData.js
const fs = require('fs');
const kt = fs.readFileSync('tmp/spider/spider_presets_SpiderTorsoModels.kt', 'utf8');
const out = {};
// formato: NOMBRE( parseModelFromCommand( """...""" ) .apply { this.scale(Xf) }
// FLAT usa sin "command =", BOXY/STEALTH con "command ="
const rx = /([A-Z_]+)\(\s*parseModelFromCommand\(\s*(?:command\s*=\s*)?"""([\s\S]*?)"""\s*\)\s*\.apply\s*\{\s*(?:this\.)?scale\(([\d.]+)f\)/g;
let m;
while ((m = rx.exec(kt))) {
  out[m[1].toLowerCase()] = { scale: parseFloat(m[3]), command: m[2] };
}
// EMPTY no tiene apply/scale — caso especial
if (!out.empty && /EMPTY\(DisplayModel\.empty\(\)\)/.test(kt)) out.empty = { scale: 1, command: '' };

const names = Object.keys(out);
console.log('presets:', names.join(','));
console.log('FLAT len:', out.flat ? out.flat.command.length : 'FALTA');

const js =
  '// Auto-generado desde TheCymaera/minecraft-spider (SpiderTorsoModels.kt)\n' +
  '// Presets de torso: /summon block_display crudos + escala de apply{}\n' +
  '(() => {\n' +
  '  const TORSO = ' + JSON.stringify(out) + ';\n' +
  '  window.MF_SPIDER_TORSO = TORSO;\n' +
  '})();\n';
fs.writeFileSync('src/Render/SpiderTorsoData.js', js);
console.log('escrito src/Render/SpiderTorsoData.js', js.length, 'bytes');
