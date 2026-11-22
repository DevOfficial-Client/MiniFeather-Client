const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { drawIcon } = require('../assets/generate-ui-pixel-icons.cjs');

const source = fs.readFileSync(path.join(__dirname, '../src/UI/ClientPanel.js'), 'utf8');
const experimentalRegistry = fs.readFileSync(path.join(__dirname, '../src/Experimental/ExperimentalRegistry.js'), 'utf8');

function objectLiteral(name) {
  const match = source.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n  \\});`));
  assert.ok(match, `${name} was not found`);
  return vm.runInNewContext(`(${match[1]})`);
}

const iconNames = new Set(vm.runInNewContext(source.match(
  /const MF_PIXEL_ICON_NAMES = Object\.freeze\((\[[\s\S]*?\])\);/
)[1]));

test('every ClickGUI module and navigation tab resolves a drawing or a deliberate alias', () => {
  const aliases = objectLiteral('MF_PIXEL_ICON_ALIASES');
  const index = source.match(/function getModuleIndex\(\) \{[\s\S]*?return \[([\s\S]*?)\];/);
  const nav = source.match(/const NAV_ITEMS = \[([\s\S]*?)\];/);
  assert.ok(index, 'module index was not found');
  assert.ok(nav, 'navigation index was not found');
  const listed = [...index[1].matchAll(/key: '([^']+)'/g)].map(match => match[1]);
  const directlyRendered = [...source.matchAll(/renderToggle\(\s*'([^']+)'/g)].map(match => match[1]);
  const pages = [...nav[1].matchAll(/id: '([^']+)'/g)].map(match => match[1]);
  const keys = new Set([...listed, ...directlyRendered, ...pages].map(key =>
    key === 'customShader' ? 'shaders' : key === 'dashboard' ? 'grid' : key));
  assert.ok(keys.size >= 45);
  for (const key of keys) assert.ok(iconNames.has(aliases[key] || key), key + ' is missing an icon');
});

test('Rainbow resolves its colored pixel-art asset instead of the unknown-module fallback', () => {
  const aliases = objectLiteral('MF_PIXEL_ICON_ALIASES');
  const fn = source.match(/  function iconSvg\([^]*?\n  \}/)?.[0];
  assert.ok(fn);
  const render = vm.runInNewContext(fn + '; iconSvg', {
    MF_PIXEL_ICON_ALIASES: aliases, MF_PIXEL_ICONS: iconNames, MF_SVG_ICONS: {},
    pixelIconPng: (name, className) => `png:${name}:${className}`
  });
  assert.equal(render('rainbow', 'fixture'), 'png:shaders:fixture');
});

test('ClickGUI loads real transparent PNG assets instead of inline pixel SVGs', () => {
  assert.deepEqual(fs.readdirSync(path.join(__dirname, '../assets/ui'), { withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => entry.name), [], 'assets/ui should only contain folders');
  assert.match(source, /chrome\.runtime\.getURL\(`assets\/ui\/\$\{folder\}\/00\.png`\)/);
  assert.match(source, /name === 'patPat' \? 'patpat'/);
  assert.doesNotMatch(source, /function pixelIconSvg\(/);

  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (const name of iconNames) {
    const file = path.join(__dirname, `../assets/ui/${name === 'patPat' ? 'patpat' : name === 'headLag' ? 'headlag' : name}/00.png`);
    const png = fs.readFileSync(file);
    assert.deepEqual([...png.subarray(0, 8)], signature, `${name} is not a PNG`);
    if (name !== 'patPat') {
      assert.equal(png.readUInt32BE(16), 64, `${name} has the wrong width`);
      assert.equal(png.readUInt32BE(20), 64, `${name} has the wrong height`);
      assert.deepEqual(png, drawIcon(name), name + " differs from its drawing");
      assert.equal(png[25], 6, `${name} is not RGBA`);
    }
    assert.equal(fs.existsSync(path.join(__dirname, `../assets/ui/${name}-pixel.png`)), false);
  }
});

test('PatPat keeps its original art byte for byte', () => {
  const file = path.join(__dirname, '../assets/ui/patpat/00.png');
  const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(hash, '6abf426ed0763ed99a5c7b2e3389eddbb71008312bb027214e70c1d74ca02a65');
});

test('Potato preset uses its real pixel-art PNG, not an emoji', () => {
  const translations = fs.readFileSync(path.join(__dirname, '../src/I18n/Translations.js'), 'utf8');
  const labels = [...translations.matchAll(/"profilePotato":\s*"([^"]*)"/g)];
  assert.ok(labels.length >= 10, 'expected a Potato label for every language');
  assert.ok(labels.every((match) => !match[1].includes('🥔')), 'an emoji remains in a Potato label');
  assert.match(source, /assets\/ui\/potato\/00\.png/);
  const png = fs.readFileSync(path.join(__dirname, '../assets/ui/potato/00.png'));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 64);
  assert.equal(png.readUInt32BE(20), 64);
});

test('every experimental card uses a direct 64x64 pixel-art PNG instead of an emoji', () => {
  const icons = [
    ['experimentalRealistic', '🌤️'],
    ['experimentalAurora', '🌌'],
    ['experimentalConstellations', '⭐'],
    ['experimentalInteractiveVegetation', '🌾'],
    ['experimentalGrassFlowers', '🌼'],
    ['experimentalFallenLeaves', '🍂'],
    ['experimentalBetterAnimationCape', '🧥'],
    ['experimentalTinyTakeover', '🐺'],
    ['experimentalAnimatedItems', '✨'],
    ['experimentalPbr', '✨']
  ];

  assert.match(source, /exp\.iconAsset \? pixelIconPng\(exp\.iconAsset\)/);

  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (const [name, emoji] of icons) {
    assert.match(experimentalRegistry, new RegExp(`iconAsset: '${name}'`));
    assert.doesNotMatch(experimentalRegistry, new RegExp(`icon: '${emoji}'`, 'u'));
    const file = path.join(__dirname, `../assets/ui/${name}/00.png`);
    const png = fs.readFileSync(file);
    assert.deepEqual([...png.subarray(0, 8)], signature, `${name} is not a PNG`);
    assert.equal(png.readUInt32BE(16), 64, `${name} has the wrong width`);
    assert.equal(png.readUInt32BE(20), 64, `${name} has the wrong height`);
    assert.equal(png[25], 6, `${name} is not RGBA`);
  }
});
