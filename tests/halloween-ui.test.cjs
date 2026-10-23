const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('src/UI/HalloweenTheme.js');
const panel = read('src/UI/ClientPanel.js');
const flagsSource = read('src/Core/SeasonalFlags.js');
const flags = enabled => flagsSource.replace(/const HALLOWEEN_ENABLED = (?:true|false);/, `const HALLOWEEN_ENABLED = ${enabled};`);

function setup({ halloweenAvailable = true, omitFlags = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><canvas id="world"></canvas><div id="mf-gui"></div></body></html>', {
    url: 'https://miniblox.io/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const { window } = dom;
  window.chrome = { runtime: { getURL: name => `chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${name}` } };
  window.document.documentElement.style.setProperty('--mf-global-accent', '#40bacb');
  window.document.documentElement.style.setProperty('--mf-global-panel', '#15202b');
  window.setInterval = window.requestAnimationFrame = () => { throw new Error('Theme must not start a render loop'); };
  window.MutationObserver = class { constructor() { throw new Error('Theme must not observe the whole page'); } };
  if (!omitFlags) window.eval(flags(halloweenAvailable));
  window.eval(source);
  const config = detail => window.document.dispatchEvent(new window.CustomEvent('minifeather:halloween-ui-config', { detail: JSON.stringify(detail) }));
  return { dom, window, config, document: window.document, api: window.__MF_HALLOWEEN_UI__ };
}

test('Halloween waits for saved preferences, without a canvas, timer or active override', t => {
  const { dom, document, api } = setup(); t.after(() => dom.window.close());
  assert.equal(api.getState().enabled, false);
  assert.equal(document.querySelectorAll('canvas').length, 1);
  assert.equal(document.getElementById('mf-halloween-ui-style'), null);
  assert.equal(document.documentElement.hasAttribute('data-mf-halloween-ui'), false);
});

test('on/off restores exact custom style values and keeps the world canvas intact', t => {
  const { dom, document, config, api } = setup(); t.after(() => dom.window.close());
  const original = document.documentElement.getAttribute('style'), canvas = document.getElementById('world');
  config({ enabled: true, motion: true });
  assert.equal(api.getState().enabled, true);
  assert.equal(document.documentElement.getAttribute('data-mf-halloween-ui'), 'on');
  config({ enabled: true });
  assert.equal(document.querySelectorAll('#mf-halloween-ui-style').length, 1);
  config({ enabled: false });
  assert.equal(document.getElementById('mf-halloween-ui-style'), null);
  assert.equal(document.documentElement.getAttribute('style'), original);
  assert.equal(document.documentElement.hasAttribute('data-mf-halloween-motion'), false);
  assert.equal(document.getElementById('world'), canvas);
});

test('decorative motion pauses when the page is hidden and respects its own setting', t => {
  const { dom, document, config } = setup(); t.after(() => dom.window.close());
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  config({ enabled: true, motion: true });
  assert.equal(document.documentElement.getAttribute('data-mf-halloween-motion'), 'on');
  hidden = true; document.dispatchEvent(new dom.window.Event('visibilitychange'));
  assert.equal(document.documentElement.hasAttribute('data-mf-halloween-motion'), false);
  hidden = false; document.dispatchEvent(new dom.window.Event('visibilitychange'));
  assert.equal(document.documentElement.getAttribute('data-mf-halloween-motion'), 'on');
  config({ motion: false });
  assert.equal(document.documentElement.hasAttribute('data-mf-halloween-motion'), false);
  assert.match(source, /prefers-reduced-motion:reduce/);
});

test('invalid settings cannot inject CSS or turn string values into enabled flags', t => {
  const { dom, document, config, api } = setup(); t.after(() => dom.window.close());
  config({ enabled: 'true', motion: 'true', css: 'body{display:none}' });
  assert.equal(api.getState().enabled, false);
  assert.doesNotThrow(() => document.dispatchEvent(new dom.window.CustomEvent('minifeather:halloween-ui-config', { detail: '{broken' })));
  config({ enabled: true });
  assert.doesNotMatch(document.getElementById('mf-halloween-ui-style').textContent, /body\{display:none/);
});

test('hot reinjection disposes its previous styles and requests current saved configuration', t => {
  const { dom, window, document, api } = setup(); t.after(() => dom.window.close());
  document.addEventListener('minifeather:halloween-ui-request', () => document.dispatchEvent(new window.CustomEvent('minifeather:halloween-ui-config', { detail: '{"enabled":true,"motion":false}' })));
  window.eval(source);
  assert.notEqual(window.__MF_HALLOWEEN_UI__, api);
  assert.equal(window.__MF_HALLOWEEN_UI__.getState().enabled, true);
  assert.equal(document.querySelectorAll('#mf-halloween-preview-style').length, 1);
  assert.equal(document.querySelectorAll('#mf-halloween-ui-style').length, 1);
  window.__MF_HALLOWEEN_UI__.destroy();
  assert.equal(window.__MF_HALLOWEEN_UI__, undefined);
  assert.equal(document.getElementById('mf-halloween-preview-style'), null);
  assert.equal(document.getElementById('mf-halloween-ui-style'), null);
});

test('all ten client languages include every Halloween UI string', () => {
  const context = {};
  vm.runInNewContext(read('src/I18n/Translations.js'), context);
  assert.equal(Object.keys(context.MINIFEATHER_TRANSLATIONS).length, 10);
  for (const [language, strings] of Object.entries(context.MINIFEATHER_TRANSLATIONS)) {
    for (const key of ['halloweenTheme', 'halloweenTitle', 'halloweenEyebrow', 'halloweenRibbon', 'halloweenThemeDesc', 'halloweenAnimations', 'halloweenNote', 'halloweenHomeSubtitle']) {
      assert.ok(typeof strings[key] === 'string' && strings[key].length > 3, `${language}: ${key}`);
    }
  }
});

test('the theme defaults on while allowing stored preferences and cleanup to turn it off', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const scripts = manifest.content_scripts.find(entry => entry.js?.includes('src/UI/ClientPanel.js')).js;
  assert.ok(scripts.indexOf('src/Core/SeasonalFlags.js') >= 0);
  assert.ok(scripts.indexOf('src/Core/SeasonalFlags.js') < scripts.indexOf('src/UI/HalloweenTheme.js'));
  const startup = manifest.content_scripts.find(entry => entry.js?.includes('src/Core/SplashScreen.js')).js;
  assert.ok(startup.indexOf('src/Core/SeasonalFlags.js') >= 0);
  assert.ok(startup.indexOf('src/Core/SeasonalFlags.js') < startup.indexOf('src/Core/SplashScreen.js'));
  assert.ok(scripts.indexOf('src/UI/HalloweenTheme.js') < scripts.indexOf('src/UI/ClientPanel.js'));
  const defaults = JSON.parse(read('defaults.json'));
  assert.equal(defaults.panel.halloweenTheme, true);
  assert.equal(defaults.panel.halloweenAnimations, true);
  assert.match(panel, /halloweenTheme: true/);
  assert.match(panel, /settings = \{ \.\.\.BASE, \.\.\.storedSettings \}/);
  assert.match(panel, /halloweenAnimations: true/);
  assert.match(panel, /enabled: isHalloweenAvailable\(\) && settings.halloweenTheme === true/);
  assert.match(panel, /isHalloweenAvailable\(\) \? `<div class="mf-card mf-halloween-settings"/);
  assert.match(panel, /isHalloweenAvailable\(\) \? `<div class="mf-halloween-ribbon"/);
  assert.match(panel, /bindHalloweenSetting\('#mf-halloween-theme', 'halloweenTheme'\)/);
  assert.match(panel, /bindHalloweenSetting\('#mf-halloween-animations', 'halloweenAnimations'\)/);
  const binding = panel.slice(panel.indexOf('const bindHalloweenSetting ='), panel.indexOf("bindHalloweenSetting('#mf-halloween-theme'"));
  assert.doesNotMatch(binding, /renderGUI\(|innerHTML/);
  assert.match(panel, /removeEventListener\('minifeather:halloween-ui-request', sendHalloweenThemeConfig\)/);
  assert.doesNotMatch(source, /setInterval\(|setTimeout\(|requestAnimationFrame\(|new MutationObserver|new WebGLRenderer|createElement\(['"]canvas/);
});

test('one source flag disables every theme override even when user settings request Halloween', t => {
  const { dom, document, api, config, window } = setup({ halloweenAvailable: false }); t.after(() => dom.window.close());
  config({ enabled: true, motion: true });
  assert.equal(window.__MF_SEASONAL_FLAGS__.halloween, false);
  assert.equal(Object.isFrozen(window.__MF_SEASONAL_FLAGS__), true);
  assert.equal(api, undefined);
  assert.equal(document.getElementById('mf-halloween-preview-style'), null);
  assert.equal(document.getElementById('mf-halloween-ui-style'), null);
  assert.equal(document.documentElement.hasAttribute('data-mf-halloween-ui'), false);
  assert.equal(document.documentElement.hasAttribute('data-mf-halloween-motion'), false);
  assert.equal(document.querySelectorAll('canvas').length, 1);
});

test('missing seasonal configuration fails closed instead of accidentally re-enabling the event', t => {
  const { dom, document, config, api } = setup({ omitFlags: true }); t.after(() => dom.window.close());
  config({ enabled: true });
  assert.equal(api, undefined);
  assert.equal(document.querySelectorAll('style').length, 0);
});

test('retiring and restoring Halloween does not require deleting theme code', t => {
  const { dom, window, config, document } = setup(); t.after(() => dom.window.close());
  config({ enabled: true });
  window.eval(flags(false));
  window.eval(source);
  assert.equal(window.__MF_HALLOWEEN_UI__, undefined);
  assert.equal(document.querySelectorAll('style').length, 0);
  assert.equal(document.documentElement.hasAttribute('data-mf-halloween-ui'), false);
  window.eval(flags(true));
  window.eval(source);
  config({ enabled: true });
  assert.equal(window.__MF_HALLOWEEN_UI__.getState().enabled, true);
  assert.equal(document.querySelectorAll('#mf-halloween-ui-style').length, 1);
});

test('decorations are local crisp pixel art, not scripts, external images or data URLs', () => {
  for (const name of ['pumpkin', 'ghost', 'bat', 'web', 'lantern', 'potion', 'witch-hat']) {
    const svg = read(`assets/ui/halloween/${name}.svg`);
    assert.match(svg, /viewBox="0 0 32 32"/);
    assert.match(svg, /shape-rendering="crispEdges"/);
    assert.doesNotMatch(svg, /<script|<foreignObject|data:|base64|onload=|onerror=|href=/i);
  }
  const scene = read('assets/ui/halloween/night-scene.svg');
  assert.match(scene, /viewBox="0 0 320 112"/);
  assert.match(scene, /shape-rendering="crispEdges"/);
  assert.doesNotMatch(scene, /<script|<foreignObject|data:|base64|onload=|onerror=|href=/i);
  const garland = read('assets/ui/halloween/garland.svg');
  assert.match(garland, /viewBox="0 0 240 32"/);
  assert.match(garland, /shape-rendering="crispEdges"/);
  assert.doesNotMatch(garland, /<script|<foreignObject|data:|base64|onload=|onerror=|href=/i);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket|\.innerHTML\s*=/);
  assert.doesNotMatch(source, /assets\/classic\/title\.png/);
});

test('the panel banner is decorative and keeps the existing module icons and controls', t => {
  const { dom, config, document } = setup(); t.after(() => dom.window.close());
  config({ enabled: true });
  const css = [...document.querySelectorAll('style')].map(element => element.textContent).join('\n');
  const banner = panel.slice(panel.indexOf('<div class="mf-halloween-ribbon"'), panel.indexOf('<div id="mf-gui-page">'));
  assert.match(banner, /aria-hidden="true"/);
  assert.match(banner, /mf-halloween-ribbon-copy/);
  assert.match(banner, /mf-halloween-ribbon-art/);
  assert.match(banner, /t\('halloweenTitle'\)/);
  assert.doesNotMatch(banner, /<button|<input|tabindex|onclick=/);
  assert.match(panel, /moduleIcon\(key\)/);
  assert.match(panel, /class="mf-feature-favorite/);
  assert.match(panel, /class="mf-feature-settings/);
  assert.match(css, /mf-halloween-ribbon\{[^}]*pointer-events:none/);
  assert.match(css, /mf-toggle::after\{[^}]*pointer-events:none/);
  assert.match(css, /mf-feature-icon::before\{[^}]*pointer-events:none/);
  assert.doesNotMatch(source, /\.mf-feature-icon\s+(?:img|\.mf-pixel-icon)[^{]*\{[^}]*(?:display:none|content:|filter:)/);
});

test('home headings follow the selected language and quote text as CSS strings', t => {
  const { dom, window, config, document, api } = setup(); t.after(() => dom.window.close());
  window.eval(read('src/I18n/Translations.js'));
  config({ enabled: true, language: 'es' });
  const style = document.getElementById('mf-halloween-ui-style');
  assert.match(style.textContent, /Cosecha de medianoche/);
  assert.match(style.textContent, /Tu próxima aventura empieza aquí/);
  config({ language: 'ja' });
  assert.match(style.textContent, /真夜中の収穫祭/);
  assert.equal(api.getState().language, 'ja');
  config({ language: 'es"}body{display:none}' });
  assert.equal(api.getState().language, 'ja');
  window.MINIFEATHER_TRANSLATIONS.es.halloweenTitle = '";--untrusted:red;/*\n}';
  config({ language: 'es' });
  assert.ok(style.textContent.includes('\\22 ;--untrusted:red;/*\\a }'));
  assert.doesNotMatch(style.textContent, /--mf-hw-home-title:"";/);
});
