const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../src/Core/SplashScreen.js'), 'utf8');
const flagsSource = fs.readFileSync(path.join(__dirname, '../src/Core/SeasonalFlags.js'), 'utf8');

function setup(settings = {}, halloweenAvailable = true) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><canvas id="world"></canvas></body></html>', {
    url: 'https://miniblox.io/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const { window } = dom, listeners = new Set(), timers = new Map();
  let now = 1000, nextTimer = 0;
  Object.defineProperty(window.performance, 'now', { value: () => now });
  window.setTimeout = fn => { timers.set(++nextTimer, fn); return nextTimer; };
  window.clearTimeout = id => timers.delete(id);
  window.matchMedia = () => ({ matches: false });
  window.requestAnimationFrame = () => { throw new Error('Splash must not start a render loop'); };
  window.chrome = {
    runtime: { getURL: name => `chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${name}` },
    storage: {
      local: { get(_keys, fn) { fn({ settings }); } },
      onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) }
    }
  };
  if (typeof halloweenAvailable === 'boolean') window.eval(flagsSource.replace(/const HALLOWEEN_ENABLED = (?:true|false);/, `const HALLOWEEN_ENABLED = ${halloweenAvailable};`));
  window.eval(source);
  const change = next => { settings = { ...settings, ...next }; for (const fn of [...listeners]) fn({ settings: { newValue: settings } }, 'local'); };
  return { dom, window, listeners, timers, change, advance: ms => { now += ms; }, root: () => window.document.getElementById('mf-startup-splash') };
}

test('the startup reveal has Halloween art by default and does not create a renderer', t => {
  const state = setup(); t.after(() => state.dom.window.close());
  assert.equal(state.root().getAttribute('data-halloween'), 'on');
  assert.equal(state.root().getAttribute('data-halloween-motion'), 'on');
  assert.match(state.root().querySelector('.mf-splash-pumpkin').src, /assets\/ui\/halloween\/pumpkin\.svg$/);
  assert.match(state.root().querySelector('.mf-splash-ghost').src, /assets\/ui\/halloween\/ghost\.svg$/);
  assert.equal(state.window.document.querySelectorAll('canvas').length, 1);
  assert.equal(state.timers.size, 1);
});

test('the global off switch keeps normal startup and omits seasonal artwork regardless of saved preferences', t => {
  const state = setup({ halloweenTheme: true, halloweenAnimations: true }, false); t.after(() => state.dom.window.close());
  const assertNormal = () => {
    assert.equal(state.root().getAttribute('data-halloween'), 'off');
    assert.equal(state.root().getAttribute('data-halloween-motion'), 'off');
    assert.equal(state.root().querySelectorAll('.mf-splash-halloween,.mf-splash-season,.mf-splash-pumpkin,.mf-splash-ghost').length, 0);
    assert.ok(state.root().querySelector('.mf-splash-word'));
  };
  assertNormal();
  state.change({ halloweenTheme: true });
  assertNormal();
  state.window.__MINIFEATHER_SPLASH__.play({ force: true });
  assertNormal();
});

test('missing seasonal configuration defaults to the normal startup reveal', t => {
  const state = setup({ halloweenTheme: true }, null); t.after(() => state.dom.window.close());
  assert.equal(state.root().getAttribute('data-halloween'), 'off');
  assert.equal(state.root().querySelector('.mf-splash-season'), null);
});

test('an explicit theme opt-out is respected at startup and on forced replay', t => {
  const state = setup({ halloweenTheme: false }); t.after(() => state.dom.window.close());
  assert.equal(state.root().getAttribute('data-halloween'), 'off');
  const first = state.root();
  state.window.__MINIFEATHER_SPLASH__.play({ force: true });
  assert.equal(first.isConnected, false);
  assert.equal(state.root().getAttribute('data-halloween'), 'off');
  assert.equal(state.timers.size, 1);
});

test('theme and decorative motion changes synchronize even during the reveal', t => {
  const state = setup(); t.after(() => state.dom.window.close());
  state.change({ halloweenAnimations: false });
  assert.equal(state.root().getAttribute('data-halloween'), 'on');
  assert.equal(state.root().getAttribute('data-halloween-motion'), 'off');
  state.change({ halloweenTheme: false });
  assert.equal(state.root().getAttribute('data-halloween'), 'off');
  state.change({ halloweenTheme: true });
  assert.equal(state.root().getAttribute('data-halloween'), 'on');
  assert.equal(state.root().getAttribute('data-halloween-motion'), 'off');
});

test('skip, expiry and disabling startup remove all reveal artwork and styles', t => {
  const state = setup(); t.after(() => state.dom.window.close());
  const api = state.window.__MINIFEATHER_SPLASH__;
  state.advance(300); api.skip();
  assert.equal(state.root(), null);
  api.play({ force: true });
  for (const fn of [...state.timers.values()]) fn();
  assert.equal(state.root(), null);
  api.play({ force: true });
  state.change({ startupAnimation: false });
  assert.equal(state.root(), null);
  assert.equal(state.window.document.getElementById('mf-startup-splash-style'), null);
  api.play();
  assert.equal(state.root(), null);
});

test('hot reinjection and destruction leave no old timer, listener or splash', t => {
  const state = setup(); t.after(() => state.dom.window.close());
  const first = state.root();
  state.window.eval(source);
  assert.equal(first.isConnected, false);
  assert.equal(state.listeners.size, 1);
  assert.equal(state.timers.size, 1);
  assert.equal(state.window.document.querySelectorAll('#mf-startup-splash').length, 1);
  state.window.__MINIFEATHER_SPLASH__.destroy();
  assert.equal(state.root(), null);
  assert.equal(state.listeners.size, 0);
  assert.equal(state.timers.size, 0);
});
