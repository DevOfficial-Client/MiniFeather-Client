const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const modeSource = read('src/Experimental/Realistic/RealisticMode.js');
const panelSource = read('src/UI/ClientPanel.js');
const featureKeys = ['skinLayers', 'armorRelief', 'firstPersonBody'];

function fixture({ modules = true } = {}) {
  let now = 5000;
  const intervals = new Map();
  const events = new Map();
  const calls = { skinLayers: [], armorRelief: [], firstPersonBody: [] };
  const attach = () => {
    sandbox.MF_BetterPlayerLayers = { setRealisticOptions: value => calls.skinLayers.push(value.enabled) };
    sandbox.MF_BetterPlayerLayersArmor = { setRealisticOptions: value => calls.armorRelief.push(value.enabled) };
    sandbox.MF_RealisticFirstPerson = { configure: value => calls.firstPersonBody.push(value.enabled) };
  };
  const sandbox = {
    performance: { now: () => now },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setInterval(fn) { const id = intervals.size + 1; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    document: {
      querySelector: () => null,
      addEventListener(type, fn) { events.set(type, fn); },
      removeEventListener(type) { events.delete(type); },
      dispatchEvent() {}
    },
    MF_RealisticProfiles: {
      get: () => ({ leafWind: 0.085, wetness: { drySeconds: 180 } }),
      clampCustom: value => ({ ...value }),
      normalizeLevel: level => ['low', 'medium', 'high', 'ultra', 'custom'].includes(level) ? level : 'medium'
    }
  };
  if (modules) attach();
  vm.runInNewContext(modeSource, sandbox);
  return {
    sandbox, calls, attach, intervals, events,
    api: sandbox.MF_RealisticMode,
    scan() { now += 2200; for (const fn of intervals.values()) fn(); },
    assertFeatures(expected) {
      for (const key of featureKeys) assert.equal(calls[key].at(-1), expected[key], key);
      assert.deepEqual(JSON.parse(JSON.stringify(sandbox.MF_RealisticMode.getState().playerFeatures)), expected);
    }
  };
}

test('new player adaptations default on only while Realistic Mode is enabled, in every quality', () => {
  for (const level of ['low', 'medium', 'high', 'ultra', 'custom']) {
    const f = fixture();
    assert.deepEqual(JSON.parse(JSON.stringify(f.api.getState().playerFeatures)), { skinLayers: false, armorRelief: false, firstPersonBody: false });
    f.api.configure({ enabled: true, level });
    f.assertFeatures({ skinLayers: true, armorRelief: true, firstPersonBody: true });
    f.api.setEnabled(false);
    f.assertFeatures({ skinLayers: false, armorRelief: false, firstPersonBody: false });
    assert.equal(f.intervals.size, 0);
  }
});

test('player options can be controlled independently and survive quality changes and re-enabling', () => {
  const f = fixture();
  f.api.configure({ enabled: true, skinLayers: false, armorRelief: true, firstPersonBody: false });
  f.assertFeatures({ skinLayers: false, armorRelief: true, firstPersonBody: false });
  f.api.configure({ enabled: true, level: 'ultra' });
  f.assertFeatures({ skinLayers: false, armorRelief: true, firstPersonBody: false });
  f.api.setEnabled(false);
  f.api.setEnabled(true);
  f.assertFeatures({ skinLayers: false, armorRelief: true, firstPersonBody: false });
  f.api.configure({ enabled: true, skinLayers: true, armorRelief: false, firstPersonBody: true });
  f.assertFeatures({ skinLayers: true, armorRelief: false, firstPersonBody: true });
});

test('late-loaded player modules receive the current configuration even before the game exists', () => {
  const f = fixture({ modules: false });
  f.api.configure(JSON.stringify({ enabled: true, skinLayers: true, armorRelief: false, firstPersonBody: true }));
  f.attach();
  f.scan();
  f.assertFeatures({ skinLayers: true, armorRelief: false, firstPersonBody: true });
});

test('destroy releases all Realistic player ownership without disabling standalone modules', () => {
  const f = fixture();
  f.sandbox.MF_BetterPlayerLayers.disable = () => assert.fail('standalone Better Player Layers must not be disabled');
  f.sandbox.MF_BetterPlayerLayersArmor.disable = () => assert.fail('standalone armor layers must not be disabled');
  f.api.configure({ enabled: true });
  f.api.destroy();
  for (const key of featureKeys) assert.equal(f.calls[key].at(-1), false);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.events.size, 0);
  assert.equal(f.sandbox.MF_RealisticMode, undefined);
});

test('player controls are visible separately from Custom quality and saved to the settings payload', () => {
  const match = panelSource.match(/  function renderRealisticPlayerControls\(\) \{[\s\S]*?\n  \}/);
  assert.ok(match);
  const render = vm.runInNewContext(`(${match[0]})`, {
    guiSettings: { experimentalRealisticSkinLayers: false, experimentalRealisticArmorRelief: true, experimentalRealisticFirstPerson: true },
    escapeHtml: value => String(value), t: key => key
  });
  const html = render();
  assert.match(html, /id="mf-realistic-player-section"/);
  assert.doesNotMatch(html, /display:none|experimentalRealisticLevel/);
  for (const [name, payload] of [
    ['experimentalRealisticSkinLayers', 'skinLayers'],
    ['experimentalRealisticArmorRelief', 'armorRelief'],
    ['experimentalRealisticFirstPerson', 'firstPersonBody']
  ]) {
    assert.match(html, new RegExp(`data-mf-realistic-player-key="${name}"`));
    assert.match(panelSource, new RegExp(`${name}: true`));
    assert.match(panelSource, new RegExp(`${payload}: settings\\.${name} !== false`));
  }
  assert.match(html, /data-mf-realistic-player-key="experimentalRealisticSkinLayers" >?/);
  assert.match(html, /data-mf-realistic-player-key="experimentalRealisticArmorRelief" checked/);
  assert.match(panelSource, /\$\{renderRealisticPlayerControls\(\)\}\s*\$\{renderRealisticCustomControls\(\)\}/);
  assert.match(panelSource, /guiSettings\[key\] = input\.checked;\s*settings\[key\] = input\.checked;\s*saveSettings\(true\);\s*applyGuiSettings\(\);/);
});

test('all ten supported languages include the player adaptation labels and explanation', () => {
  const sandbox = {};
  vm.runInNewContext(read('src/I18n/Translations.js'), sandbox);
  const translations = sandbox.MINIFEATHER_TRANSLATIONS;
  for (const language of ['en', 'es', 'ja', 'it', 'zh', 'fr', 'de', 'pt', 'ru', 'ko']) {
    for (const key of [
      'experimentalRealisticPlayerTitle', 'experimentalRealisticPlayerDesc',
      'experimentalRealisticSkinLayersLabel', 'experimentalRealisticArmorReliefLabel',
      'experimentalRealisticFirstPersonLabel'
    ]) {
      assert.ok(typeof translations[language][key] === 'string' && translations[language][key].length > 0, `${language}: ${key}`);
    }
  }
});
