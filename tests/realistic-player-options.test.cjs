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
    sandbox.MF_RealisticFirstPerson = { setRealisticOptions: value => calls.firstPersonBody.push(value.enabled) };
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
      'experimentalRealisticFirstPersonLabel', 'firstPerson', 'firstPersonDesc'
    ]) {
      assert.ok(typeof translations[language][key] === 'string' && translations[language][key].length > 0, `${language}: ${key}`);
    }
  }
});

test('First Person is a standalone Render module, while the Realistic option remains available', () => {
  assert.match(panelSource, /firstPerson: false/);
  assert.match(panelSource, /page: 'render', key: 'firstPerson'/);
  assert.match(panelSource, /renderToggle\('firstPerson', t\('firstPerson'\), t\('firstPersonDesc'\)\)/);
  assert.match(panelSource, /registerModule\('firstPerson'/);
  assert.match(panelSource, /initFirstPersonModule\(\);/);
  assert.match(panelSource, /setModuleEnabled\('firstPerson', settings.firstPerson\)/);
  const mirror = JSON.parse(read('mirror.json')).mainStart;
  assert.ok(mirror.indexOf('src/Experimental/Realistic/FirstPersonModel.js') >= 0);
  assert.ok(mirror.indexOf('src/Experimental/Realistic/FirstPersonModel.js') < mirror.indexOf('src/Experimental/Realistic/RealisticMode.js'));
  assert.equal(JSON.parse(read('defaults.json')).render.firstPerson, false);
});

test('UI conflict guard saves actual disabled animation toggles, from either owner, and leaves Vanilla unchanged', () => {
  const match = panelSource.match(/  function enforceFirstPersonCompatibility\(\) \{[\s\S]*?\n  \}/);
  assert.ok(match);
  const conflicts = ['playerAnims', 'freshAnims', 'headLag', 'handSway'];
  for (const scenario of [
    { firstPerson: true },
    { experimentalRealistic: true, experimentalRealisticFirstPerson: true },
    { experimentalRealistic: true, experimentalRealisticFirstPerson: false },
    { firstPerson: false, experimentalRealistic: false }
  ]) {
    const settings = { ...Object.fromEntries(conflicts.map(key => [key, true])), vanillaAnimations: true, ...scenario };
    const guiSettings = { ...settings };
    let saves = 0;
    const apply = vm.runInNewContext(`(${match[0]})`, { settings, guiSettings,
      FIRST_PERSON_CONFLICTS: conflicts, saveSettings: () => saves++ });
    apply();
    const enabled = settings.firstPerson === true || (settings.experimentalRealistic === true && settings.experimentalRealisticFirstPerson !== false);
    for (const key of conflicts) {
      assert.equal(settings[key], !enabled);
      assert.equal(guiSettings[key], !enabled);
    }
    assert.equal(settings.vanillaAnimations, true);
    assert.equal(guiSettings.vanillaAnimations, true);
    assert.equal(saves, enabled ? 1 : 0);
    apply();
    assert.equal(saves, enabled ? 1 : 0, 'unchanged settings are not written every time');
  }
});

test('each custom animation setter refuses reactivation while First Person owns the model', () => {
  for (const file of ['src/PlayerAnims/MF_PlayerAnims.js', 'src/PlayerAnims/MF_FreshAnims.js', 'src/PlayerAnims/HeadLag.js', 'src/Render/HandSway.js']) {
    const match = read(file).match(/    function setEnabled\(enabled\) \{[\s\S]*?\n    \}/);
    assert.ok(match, file);
    const state = { enabled: false };
    let writes = 0;
    const sandbox = {
      state, MF_RealisticFirstPerson: { getState: () => ({ enabled: true }) },
      localStorage: { setItem() { writes++; } }, document: { dispatchEvent() {} },
      CustomEvent: class {}, requestAnimationFrame() { assert.fail(`${file} must not start an animation`); }
    };
    const setEnabled = vm.runInNewContext(`(${match[0]})`, sandbox);
    setEnabled(true);
    assert.equal(state.enabled, false, file);
    if (file.endsWith('HandSway.js')) assert.equal(writes, 1);
  }
});

test('First Person compatibility updates rendered toggle labels without rebuilding the entire GUI', () => {
  const match = panelSource.match(/  function syncFirstPersonControls\(\) \{[\s\S]*?\n  \}/);
  assert.ok(match);
  const conflicts = ['playerAnims', 'freshAnims', 'headLag', 'handSway'];
  const guiSettings = { firstPerson: true, ...Object.fromEntries(conflicts.map(key => [key, false])) };
  const labels = new Map();
  const classes = () => ({ values: new Map(), toggle(name, enabled) { this.values.set(name, enabled); } });
  for (const key of ['firstPerson', ...conflicts]) {
    const input = { checked: key !== 'firstPerson' };
    const state = { textContent: '', classList: classes() };
    labels.set(key, { input, state, classList: classes(), querySelector: query => query === 'input' ? input : state });
  }
  const panel = { querySelector(query) { return labels.get(query.match(/data-key="([^"]+)"/)[1]); } };
  vm.runInNewContext(`(${match[0]})()`, { panel, guiSettings, FIRST_PERSON_CONFLICTS: conflicts, t: key => key });
  for (const [key, label] of labels) {
    const enabled = key === 'firstPerson';
    assert.equal(label.input.checked, enabled);
    assert.equal(label.state.textContent, enabled ? 'enabled' : 'disabled');
    assert.equal(label.state.classList.values.get('enabled'), enabled);
    assert.equal(label.classList.values.get('disabled'), !enabled);
  }
});
