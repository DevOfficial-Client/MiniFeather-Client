'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const panelSource = read('src/UI/ClientPanel.js');
const defaults = JSON.parse(read('defaults.json')).experimental;
const controls = panelSource.slice(panelSource.indexOf('  const CAPE_SETTINGS_VERSION = 1;'), panelSource.indexOf('  function closeFullBrightSettings()'));

function fixture() {
  const dom = new JSDOM('<main id="panel"></main>');
  const { document, CustomEvent } = dom.window;
  const settings = { ...defaults }, guiSettings = { ...settings }, configs = [];
  let saves = 0;
  const sandbox = { document, CustomEvent, panel: document.querySelector('main'), settings, guiSettings,
    t: key => key, saveSettings: immediate => { assert.equal(immediate, true); saves++; } };
  document.addEventListener('minifeather:better-animation-cape-config', event => configs.push(JSON.parse(event.detail)));
  vm.createContext(sandbox); vm.runInContext(controls, sandbox);
  return { dom, document, settings, guiSettings, configs, sandbox, get saves() { return saves; },
    open: () => sandbox.openBetterCapeSettings(), close: () => { sandbox.closeBetterCapeSettings(); dom.window.close(); } };
}

test('cape dialog exposes all four modes and applies sliders immediately without enabling the module implicitly', () => {
  const f = fixture();
  try {
    f.open();
    const mode = f.document.querySelector('[data-cape-select="Movement"]');
    assert.deepEqual([...mode.options].map(option => option.value), ['simulation-v2', 'simulation', 'classic', 'dungeons']);
    assert.equal(f.document.querySelectorAll('[data-cape-range]').length, 3);
    mode.value = 'classic'; mode.dispatchEvent(new f.dom.window.Event('change'));
    assert.equal(f.settings.experimentalBetterAnimationCapeMovement, 'classic');
    assert.equal(f.guiSettings.experimentalBetterAnimationCapeMovement, 'classic');
    assert.equal(f.configs.at(-1).movement, 'classic'); assert.equal(f.configs.at(-1).enabled, false);
    const range = f.document.querySelector('[data-cape-range="WindStrength"]');
    const saves = f.saves;
    range.value = '1.4'; range.dispatchEvent(new f.dom.window.Event('input'));
    assert.equal(f.configs.at(-1).windStrength, 1.4); assert.equal(f.saves, saves);
    assert.equal(f.document.querySelector('[data-cape-value="WindStrength"]').textContent, '1.4');
    range.dispatchEvent(new f.dom.window.Event('change')); assert.equal(f.saves, saves + 1);
  } finally { f.close(); }
});

test('reopening, resetting, Escape and closing remove the dialog and stale keyboard handlers', () => {
  const f = fixture();
  try {
    f.open(); f.open(); assert.equal(f.document.querySelectorAll('[role="dialog"]').length, 1);
    f.settings.experimentalBetterAnimationCapeGravity = f.guiSettings.experimentalBetterAnimationCapeGravity = 29;
    f.document.querySelector('[data-cape-reset]').click();
    assert.equal(f.settings.experimentalBetterAnimationCapeGravity, 10);
    assert.equal(f.guiSettings.experimentalBetterAnimationCapeGravity, 10);
    assert.equal(f.configs.at(-1).gravity, 10);
    assert.equal(f.document.querySelectorAll('[role="dialog"]').length, 1);
    const escape = () => f.document.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { code: 'Escape', cancelable: true }));
    escape(); assert.equal(f.document.querySelector('[role="dialog"]'), null);
    const saves = f.saves; escape(); assert.equal(f.saves, saves, 'no leaked close listener');
    f.open(); f.document.querySelector('[data-cape-close]').click();
    assert.equal(f.document.querySelector('[role="dialog"]'), null);
  } finally { f.close(); }
});

test('all ten languages translate cape controls, with persisted defaults, right-click and gear integration', () => {
  const sandbox = {}; vm.runInNewContext(read('src/I18n/Translations.js'), sandbox);
  for (const [language, texts] of Object.entries(sandbox.MINIFEATHER_TRANSLATIONS)) {
    for (const key of ['capePhysics', 'capeStyle', 'capeWind', 'capeWindStrength', 'capeGravity', 'capeMovementStrength',
      'capeModeV2', 'capeModeSimulation', 'capeModeClassic', 'capeModeDungeons', 'capeStyleSmooth', 'capeStyleBlocky', 'capeWindWaves', 'capeWindNone', 'capeReset']) {
      assert.ok(texts[key]?.trim(), `${language}: ${key}`);
    }
  }
  for (const suffix of ['Movement', 'Style', 'Wind', 'WindStrength', 'Gravity', 'Strength']) {
    assert.ok(Object.hasOwn(defaults, 'experimentalBetterAnimationCape' + suffix));
    assert.match(panelSource, new RegExp('experimentalBetterAnimationCape' + suffix + ':'));
  }
  assert.match(panelSource, /experimentalBetterAnimationCape: openBetterCapeSettings/);
  assert.match(panelSource, /data-key="experimentalBetterAnimationCape".*addEventListener\('contextmenu'/);
  assert.match(panelSource, /function hideGUI\(\)[\s\S]*?closeBetterCapeSettings\(\)/);
});
