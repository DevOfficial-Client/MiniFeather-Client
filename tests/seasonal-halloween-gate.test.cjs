'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { withHalloween } = require('./helpers/seasonal-flags.cjs');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const flagsSource = read('src/Core/SeasonalFlags.js');
const seasonalSource = read('src/Seasonal/MF_Seasonal.js');
const config = JSON.parse(read('seasonal.json'));

function seasonalFixture(t, { enabled, month = 9, day = 25, hour = 12, oldOverlay = false, omitCache = false, ambient = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://miniblox.io/', runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  const NativeDate = window.Date;
  window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [2026, month, day, hour])); }
    static now() { return new NativeDate(2026, month, day, hour).getTime(); }
  };
  window.__seasonalIntervalCount = 0;
  window.setTimeout = () => 1;
  window.setInterval = () => ++window.__seasonalIntervalCount;
  window.clearInterval = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => null;
  if (ambient) {
    const menu = window.document.createElement('div');
    menu.id = 'react'; menu.className = 'mf-hub';
    window.document.body.append(menu);
    window.HTMLCanvasElement.prototype.getContext = () => ({ setTransform() {}, clearRect() {} });
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
  }
  window.fetch = () => { throw new Error('No network allowed'); };
  window.console = { log() {}, warn() {}, error() {} };
  if (!omitCache) window.localStorage.setItem('mf:seasonal:v1', JSON.stringify({ v: 1, hash: 'cached-event', cfg: config }));
  if (oldOverlay) {
    const overlay = window.document.createElement('div');
    overlay.id = 'mf-seasonal-vignette';
    overlay.style.cssText = 'opacity:.22;background:orange';
    window.document.body.append(overlay);
  }
  if (typeof enabled === 'boolean') {
    window.eval(withHalloween(flagsSource, enabled));
  }
  const end = seasonalSource.lastIndexOf('})();');
  const instrumented = seasonalSource.slice(0, end) +
    'window.__seasonalParticles = () => ambientParts.map(p => p.t);\n' + seasonalSource.slice(end);
  window.eval(instrumented);
  return window;
}

test('MAIN loads local seasonal flags before seasonal effects, with moderation still first', () => {
  const list = JSON.parse(read('mirror.json')).mainStart;
  assert.equal(list[0], 'src/Core/MF_Moderation.js');
  const flagsAt = list.indexOf('src/Core/SeasonalFlags.js');
  assert.ok(flagsAt > 0);
  assert.ok(flagsAt < list.indexOf('src/Seasonal/MF_Seasonal.js'));
});

test('Halloween OFF suppresses the cached orange vignette and event leaves on October 25', t => {
  const window = seasonalFixture(t, { enabled: false });
  assert.equal(window.__MF_SEASONAL_STATE__().activeEventId, null);
  assert.equal(window.document.querySelector('#mf-seasonal-vignette')?.style.opacity, '0');
  assert.equal(window.__MF_SEASONAL_STATE__().ambient.includes('leaves'), false);
});

test('Halloween ON restores the original seasonal vignette without deleting the event', t => {
  const window = seasonalFixture(t, { enabled: true });
  assert.equal(window.__MF_SEASONAL_STATE__().activeEventId, 'halloween-2026');
  assert.equal(window.document.querySelector('#mf-seasonal-vignette')?.style.opacity, '0.22');
});

test('Halloween OFF clears an existing legacy vignette without creating a duplicate', t => {
  const window = seasonalFixture(t, { enabled: false, oldOverlay: true });
  const overlays = window.document.querySelectorAll('#mf-seasonal-vignette');
  assert.equal(overlays.length, 1);
  assert.equal(overlays[0].style.opacity, '0');
});

test('Halloween OFF preserves the Christmas event and blue vignette', t => {
  const window = seasonalFixture(t, { enabled: false, month: 11, day: 20 });
  assert.equal(window.__MF_SEASONAL_STATE__().activeEventId, 'navidad-2026');
  assert.equal(window.document.querySelector('#mf-seasonal-vignette')?.style.opacity, '0.12');
});

test('a missing seasonal flag cannot silently enable Halloween', t => {
  const window = seasonalFixture(t);
  assert.equal(window.__MF_SEASONAL_STATE__().activeEventId, null);
  assert.equal(window.document.querySelector('#mf-seasonal-vignette')?.style.opacity, '0');
});

test('November has no Halloween effects even if a saved ON preference remains', t => {
  const window = seasonalFixture(t, { enabled: true, month: 10, day: 6 });
  assert.equal(window.__MF_SEASONAL_STATE__().activeEventId, null);
  assert.equal(window.document.querySelector('#mf-seasonal-vignette')?.style.opacity, '0');
  assert.equal(window.__MF_SEASONAL_STATE__().ambient.includes('leaves'), false);
});

test('retiring the flag re-evaluates seasonal effects immediately in an already loaded document', t => {
  const window = seasonalFixture(t, { enabled: true });
  assert.equal(window.__MF_SEASONAL_STATE__().activeEventId, 'halloween-2026');
  window.eval(withHalloween(flagsSource, false));
  assert.equal(window.__MF_SEASONAL_STATE__().activeEventId, null);
  assert.equal(window.document.querySelector('#mf-seasonal-vignette').style.opacity, '0');
  assert.equal(window.__MF_SEASONAL_STATE__().ambient.includes('leaves'), false);
});

test('legacy duplicate vignettes are removed and no-cache boot also clears old tint', t => {
  const window = seasonalFixture(t, { enabled: false, oldOverlay: true, omitCache: true });
  assert.equal(window.document.querySelectorAll('#mf-seasonal-vignette').length, 1);
  assert.equal(window.document.querySelector('#mf-seasonal-vignette').style.opacity, '0');
  const copy = window.document.querySelector('#mf-seasonal-vignette').cloneNode(true);
  copy.style.opacity = '.22';
  window.document.body.append(copy);
  window.eval(withHalloween(flagsSource, false));
  assert.equal(window.document.querySelectorAll('#mf-seasonal-vignette').length, 1);
  assert.equal(window.document.querySelector('#mf-seasonal-vignette').style.opacity, '0');
});

test('retiring Halloween removes existing leaf particles while preserving unrelated night effects', t => {
  const window = seasonalFixture(t, { enabled: true, hour: 22, ambient: true });
  assert.ok(window.__seasonalParticles().includes('leaf'));
  assert.ok(window.__seasonalParticles().includes('fly'));
  window.eval(withHalloween(flagsSource, false));
  assert.equal(window.__seasonalParticles().includes('leaf'), false);
  assert.ok(window.__seasonalParticles().includes('fly'));
  assert.ok(window.__MF_SEASONAL_STATE__().ambient.includes('meteors'));
});

test('reinjection does not create a second set of seasonal timers', t => {
  const window = seasonalFixture(t, { enabled: false });
  const count = window.__seasonalIntervalCount;
  assert.ok(count > 0);
  window.eval(seasonalSource);
  assert.equal(window.__seasonalIntervalCount, count);
});

test('legacy hot plans cannot replay seasonal effects or overwrite the release flag', () => {
  const flagPath = 'src/Core/SeasonalFlags.js';
  const seasonalPath = 'src/Seasonal/MF_Seasonal.js';
  const otherPath = 'src/Chat/ClientCommands.js';
  const plan = { v: 1, files: {
    [flagPath]: 'globalThis.staleFlagRan = true;',
    [seasonalPath]: 'globalThis.staleSeasonRan = true;',
    'src/Core/SplashScreen.js': 'globalThis.staleSplashRan = true;',
    'src/UI/HalloweenTheme.js': 'globalThis.staleThemeRan = true;',
    [otherPath]: 'globalThis.otherModuleRan = true;'
  }, guards: { [seasonalPath]: ['__MF_Seasonal'] } };
  const listeners = new Map();
  const ctx = vm.createContext({
    console: { warn() {} },
    localStorage: { getItem: key => key === 'mf:hot:v1' ? JSON.stringify(plan) : null },
    document: {
      readyState: 'complete', documentElement: { dataset: {} },
      createElement: () => ({ textContent: '', remove() {} }),
      head: { appendChild(script) { vm.runInContext(script.textContent, ctx); } }
    },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener() {}, setInterval() { return 1; }, setTimeout() { return 1; }, clearTimeout() {}
  });
  ctx.window = ctx;
  vm.runInContext(read('src/Core/HotLoader.js'), ctx);
  assert.equal(ctx.staleFlagRan, undefined);
  assert.equal(ctx.staleSeasonRan, undefined);
  assert.equal(ctx.staleSplashRan, undefined);
  assert.equal(ctx.staleThemeRan, undefined);
  assert.equal(ctx.__MF_Seasonal, undefined, 'old guard must not prevent the local module from booting');
  assert.equal(ctx.otherModuleRan, true, 'unrelated hot modules are not disabled');
});

test('the test switch helper accepts line breaks and refuses a missing or duplicated switch', () => {
  assert.match(withHalloween('const HALLOWEEN_ENABLED = false\n  ;', true), /= true;/);
  assert.throws(() => withHalloween('const OTHER = false;', true), /exactly one/);
  assert.throws(() => withHalloween('const HALLOWEEN_ENABLED = false; const HALLOWEEN_ENABLED = true;', false), /exactly one/);
});
