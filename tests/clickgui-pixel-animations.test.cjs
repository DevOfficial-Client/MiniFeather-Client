const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.join(__dirname, '../assets/ui');
const panel = fs.readFileSync(path.join(__dirname, '../src/UI/ClientPanel.js'), 'utf8');
const animationMatch = panel.match(/const MF_ANIMATED_PIXEL_ICONS = Object\.freeze\((\[[\s\S]*?\])\);/);
assert.ok(animationMatch);
const names = vm.runInNewContext(animationMatch[1]);
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));

function rgbaPixels(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), 32);
  assert.equal(bytes.readUInt32BE(20), 32);
  assert.equal(bytes[25], 6);
  const compressed = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') break;
  }
  const scanlines = zlib.inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++) {
    assert.equal(scanlines[y * 129], 0, 'animation assets should use filter 0');
    scanlines.copy(pixels, y * 128, y * 129 + 1, y * 129 + 129);
  }
  return pixels;
}

test('most module icons have six drawn 32px animation frames', () => {
  assert.ok(names.length >= 40);
  assert.equal(new Set(names).size, names.length);
  const weakFrames = [];
  const shortCycles = [];
  for (const name of names) {
    const original = fs.readFileSync(path.join(root, `${name}.png`));
    const frame0 = fs.readFileSync(path.join(root, name, '00.png'));
    assert.deepEqual(frame0, original, `${name} base frame changed`);
    const originalPixels = rgbaPixels(original);
    const frames = [1, 2, 3, 4, 5].map(index => rgbaPixels(fs.readFileSync(path.join(root, name, `0${index}.png`))));
    for (const [index, frame] of frames.entries()) {
      let changed = 0;
      for (let offset = 0; offset < frame.length; offset += 4) {
        assert.ok(frame[offset + 3] === 0 || frame[offset + 3] === 255, `${name} lost hard pixel edges`);
        if (!frame.subarray(offset, offset + 4).equals(originalPixels.subarray(offset, offset + 4))) changed++;
      }
      if (changed <= 10 || changed >= 750) weakFrames.push(`${name}:${index + 1} (${changed})`);
    }
    if (new Set(frames.map(frame => frame.toString('hex'))).size < 4) shortCycles.push(name);
  }
  assert.deepEqual(weakFrames, []);
  assert.deepEqual(shortCycles, []);
  assert.equal(fs.existsSync(path.join(root, 'patPat')), false);
  assert.equal(fs.existsSync(path.join(root, 'patpat')), false);
});

test('animation generator draws actions instead of moving a glint', () => {
  const generator = fs.readFileSync(path.join(__dirname, '../assets/generate-ui-animations.cjs'), 'utf8');
  assert.doesNotMatch(generator, /glintFrame|highlightColor/);
  for (const action of ["case 'allayPets'", "case 'waterSplash'", "case 'antiAfk'", "case 'elytraFlight'", "case 'fpsCounter'"]) {
    assert.ok(generator.includes(action), `${action} lacks a motion design`);
  }
});

test('ClickGUI loads frames only while visible and exposes nested assets', () => {
  assert.match(panel, /const MF_PIXEL_FRAME_COUNT = 6/);
  assert.match(panel, /window\.setInterval\(updateAnimatedPixelIcons, 320\)/);
  assert.match(panel, /new IntersectionObserver\(/);
  assert.match(panel, /visiblePixelIcons\.forEach/);
  assert.match(panel, /prefers-reduced-motion: reduce/);
  assert.match(panel, /function hideGUI\(\)[\s\S]*?stopPixelIconAnimation\(\)/);
  assert.ok(manifest.web_accessible_resources.some(entry => entry.resources.includes('assets/ui/*/*')));
});
