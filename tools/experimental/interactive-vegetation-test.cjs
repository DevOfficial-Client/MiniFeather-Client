const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const src = read('src/Experimental/InteractiveVegetation/InteractiveVegetation.js');
const registry = read('src/Experimental/ExperimentalRegistry.js');
const panel = read('src/UI/ClientPanel.js');
const translations = read('src/I18n/Translations.js');
const manifest = JSON.parse(read('manifest.json'));
const allScripts = manifest.content_scripts.flatMap(x => x.js || []);
function ok(v, m) { if (!v) throw new Error(m); }

ok(manifest.version === '4.13.4', 'Unexpected manifest version');
ok(allScripts.includes('src/Experimental/InteractiveVegetation/InteractiveVegetation.js'), 'module missing from manifest');
ok(src.includes("const VERSION = '3.2.0-extreme'"), 'v3.2 marker missing');
for (const level of ['low','medium','high','extreme']) ok(src.includes(`${level}: Object.freeze`), `profile ${level} missing`);
ok(src.includes('maxBlades: 5200') && src.includes('segments: 6') && src.includes('quality: 3'), 'Extreme budgets missing');
ok(src.includes('near: 18') && src.includes('mid: 11') && src.includes('far: 4'), 'Extreme LOD density missing');
ok(src.includes('short grass') && src.includes('medium grass') && src.includes('tall grass'), 'Extreme height populations missing');
ok(src.includes('Stratified jitter') && src.includes('countGrid'), 'near-full block coverage placement missing');
ok(src.includes('mfBladeFlex') && src.includes('mfGrassFlex'), 'per-blade flexibility missing');
ok(src.includes('mfCapsule') && src.includes('mfEllipse') && src.includes('mfFootA') && src.includes('mfFootB'), 'Extreme contact detection missing');
ok(src.includes('mfTrailLife') && src.includes('2.35'), 'Extreme trample recovery missing');
ok(!src.includes('setBlockState(') && !src.includes('setAir('), 'must not modify world block states');
ok(registry.includes("value: 'extreme'") && registry.includes("experimentalInteractiveVegetationExtreme"), 'registry Extreme selector missing');
ok(panel.includes("['low', 'medium', 'high', 'extreme']"), 'panel Extreme dispatch missing');
for (const key of ['experimentalInteractiveVegetationQuality','experimentalInteractiveVegetationLow','experimentalInteractiveVegetationMedium','experimentalInteractiveVegetationHigh','experimentalInteractiveVegetationExtreme']) {
  ok((translations.match(new RegExp('"' + key + '"', 'g')) || []).length === 4, `translation key ${key} missing in one or more languages`);
}
console.log('PASS 3D Grass Physics v3.2 Extreme / MiniFeather 4.13.4');
