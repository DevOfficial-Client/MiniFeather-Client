const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/UI/ClientPanel.js'), 'utf8');

function objectLiteral(name) {
  const match = source.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n  \\});`));
  assert.ok(match, `${name} was not found`);
  return vm.runInNewContext(`(${match[1]})`);
}

test('every ClickGUI module has a colored 8x8 pixel icon', () => {
  const palette = objectLiteral('PIXEL_PALETTE');
  const icons = objectLiteral('MF_PIXEL_ICONS');
  const index = source.match(/function getModuleIndex\(\) \{[\s\S]*?return \[([\s\S]*?)\];/);
  assert.ok(index, 'module index was not found');

  const listed = [...index[1].matchAll(/key: '([^']+)'/g)].map((match) => match[1]);
  const directlyRendered = [...source.matchAll(/renderToggle\(\s*'([^']+)'/g)]
    .map((match) => match[1]);
  const keys = new Set([...listed, ...directlyRendered].map((key) =>
    key === 'customShader' ? 'shaders' : key));
  assert.ok(keys.size >= 45);

  for (const key of keys) {
    const rows = icons[key];
    assert.ok(rows, `${key} is missing an icon`);
    assert.equal(rows.length, 8, `${key} must have 8 rows`);
    for (const row of rows) {
      assert.equal(row.length, 8, `${key} must have 8 columns`);
      for (const pixel of row) {
        assert.ok(Object.hasOwn(palette, pixel), `${key} uses unknown color ${pixel}`);
      }
    }
    assert.match(rows.join(''), /[bBgGrRyYoOpPvVtTnN]/, `${key} should use color`);
  }
});

test('ClickGUI loads real transparent PNG assets instead of inline pixel SVGs', () => {
  const icons = objectLiteral('MF_PIXEL_ICONS');
  assert.match(source, /chrome\.runtime\.getURL\(`assets\/ui\/\$\{filename\}`\)/);
  assert.match(source, /name === 'patPat' \? 'patpat\.png'/);
  assert.doesNotMatch(source, /function pixelIconSvg\(/);

  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (const name of Object.keys(icons)) {
    const file = path.join(__dirname, `../assets/ui/${name === 'patPat' ? 'patpat' : name}.png`);
    const png = fs.readFileSync(file);
    assert.deepEqual([...png.subarray(0, 8)], signature, `${name} is not a PNG`);
    if (name !== 'patPat') {
      assert.equal(png.readUInt32BE(16), 32, `${name} has the wrong width`);
      assert.equal(png.readUInt32BE(20), 32, `${name} has the wrong height`);
      assert.equal(png[25], 6, `${name} is not RGBA`);
    }
    assert.equal(fs.existsSync(path.join(__dirname, `../assets/ui/${name}-pixel.png`)), false);
  }
});

test('Potato preset uses its real pixel-art PNG, not an emoji', () => {
  const translations = fs.readFileSync(path.join(__dirname, '../src/I18n/Translations.js'), 'utf8');
  const labels = [...translations.matchAll(/"profilePotato":\s*"([^"]*)"/g)];
  assert.ok(labels.length >= 10, 'expected a Potato label for every language');
  assert.ok(labels.every((match) => !match[1].includes('🥔')), 'an emoji remains in a Potato label');
  assert.match(source, /assets\/ui\/potato\.png/);
  const png = fs.readFileSync(path.join(__dirname, '../assets/ui/potato.png'));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 32);
  assert.equal(png.readUInt32BE(20), 32);
});
