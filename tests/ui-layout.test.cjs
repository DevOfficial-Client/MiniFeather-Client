const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../src/UI/ClientPanel.js'), 'utf8');
function namedFunction(name) {
  const start = source.indexOf(`function ${name}(`), open = source.indexOf('{', start);
  assert.ok(start >= 0, `${name} missing`);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function: ${name}`);
}
function setup(t, html = '<img alt="Miniblox" src="/native.png">') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    url: 'https://miniblox.io/', runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  const api = dom.window.eval(`(() => {
    const settings = { rebrand: true }, ORIGINALS = { title: 'Miniblox' };
    const LOGO_ALT_NAMES = ['miniblox'], LOGO_SOURCE_NAMES = ['miniblox-logo'];
    const logoLayouts = new WeakMap(), pendingLogos = new Map();
    const currentLogo = '/assets/icon.png';
    ${['isLogoImage', 'preserveLogoLayout', 'restoreLogoLayout', 'replaceLogoImage', 'replaceLogo', 'restoreRebrand'].map(namedFunction).join('\n')}
    return { replaceLogo, restoreRebrand, pendingLogos, settings };
  })()`);
  const img = dom.window.document.querySelector('img');
  let width = 128, height = 64, complete = true;
  Object.defineProperties(img, {
    width: { configurable: true, get: () => width }, height: { configurable: true, get: () => height },
    complete: { configurable: true, get: () => complete }
  });
  return { ...api, dom, img, dimensions(w, h, loaded = true) { width = w; height = h; complete = loaded; } };
}

test('rebranding keeps native layout dimensions and restores only its own attributes', t => {
  const state = setup(t), { img } = state;
  state.replaceLogo();
  assert.equal(img.getAttribute('src'), '/assets/icon.png');
  assert.equal(img.getAttribute('width'), '128');
  assert.equal(img.getAttribute('height'), '64');
  assert.equal(img.style.aspectRatio, '128 / 64');
  assert.equal(img.style.objectFit, 'contain');
  state.dimensions(799, 805);
  state.replaceLogo();
  assert.equal(img.getAttribute('width'), '128', 'refresh cannot capture the replacement file as the original size');
  state.restoreRebrand();
  assert.equal(img.getAttribute('src'), '/native.png');
  assert.equal(img.hasAttribute('width'), false);
  assert.equal(img.hasAttribute('height'), false);
  assert.equal(img.style.aspectRatio, '');
  assert.equal(img.style.objectFit, '');
  assert.equal(img.hasAttribute('data-mf-logo-target'), false);
});

test('native explicit sizes, cropping and aspect ratios are not overwritten', t => {
  const { img, replaceLogo, restoreRebrand } = setup(t,
    '<img alt="Miniblox" src="/native.png" width="80" height="40" style="width:50%;height:auto;aspect-ratio:2 / 1;object-fit:cover!important">');
  const original = img.getAttribute('style');
  replaceLogo();
  assert.equal(img.getAttribute('width'), '80');
  assert.equal(img.getAttribute('height'), '40');
  assert.equal(img.getAttribute('style'), original);
  restoreRebrand();
  assert.equal(img.getAttribute('style'), original);
});

test('turning rebranding off preserves newer native layout changes', t => {
  const { img, replaceLogo, restoreRebrand } = setup(t);
  img.style.setProperty('aspect-ratio', 'auto', 'important');
  replaceLogo();
  img.setAttribute('width', '96');
  img.style.objectFit = 'cover';
  restoreRebrand();
  assert.equal(img.getAttribute('width'), '96');
  assert.equal(img.style.objectFit, 'cover');
  assert.equal(img.style.aspectRatio, 'auto');
  assert.equal(img.style.getPropertyPriority('aspect-ratio'), 'important');
});

test('unknown image dimensions wait for native load and dispose their listeners', t => {
  const state = setup(t), { img, dom, pendingLogos } = state;
  state.dimensions(0, 0, false);
  state.replaceLogo(); state.replaceLogo();
  assert.equal(pendingLogos.size, 1);
  assert.equal(img.getAttribute('src'), '/native.png');
  state.dimensions(128, 64);
  img.dispatchEvent(new dom.window.Event('load'));
  assert.equal(pendingLogos.size, 0);
  assert.equal(img.getAttribute('src'), '/assets/icon.png');
  assert.equal(img.getAttribute('width'), '128');
});

test('disabling rebranding before native load does not resurrect the replacement', t => {
  const state = setup(t);
  state.dimensions(0, 0, false); state.replaceLogo();
  state.settings.rebrand = false; state.restoreRebrand();
  state.dimensions(128, 64);
  state.img.dispatchEvent(new state.dom.window.Event('load'));
  assert.equal(state.pendingLogos.size, 0);
  assert.equal(state.img.getAttribute('src'), '/native.png');
  assert.equal(state.img.hasAttribute('width'), false);
});

test('failed and removed native logos do not keep pending work', t => {
  const state = setup(t);
  state.dimensions(0, 0, false); state.replaceLogo();
  state.img.dispatchEvent(new state.dom.window.Event('error'));
  assert.equal(state.pendingLogos.size, 0);
  state.replaceLogo();
  state.img.remove(); state.replaceLogo();
  assert.equal(state.pendingLogos.size, 0);
});

test('unrelated images are left alone', t => {
  const state = setup(t, '<img src="/skin.png" alt="Player skin">');
  state.replaceLogo();
  assert.equal(state.img.getAttribute('src'), '/skin.png');
  assert.equal(state.img.hasAttribute('width'), false);
});
