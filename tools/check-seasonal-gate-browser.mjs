// Isolated browser regression: real loaders and cached seasonal config, no
// live Miniblox session, account, game server or external network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import seasonalFlags from '../tests/helpers/seasonal-flags.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');
const flagPath = 'src/Core/SeasonalFlags.js';
const seasonalPath = 'src/Seasonal/MF_Seasonal.js';
const flags = read(flagPath);
const seasonal = read(seasonalPath);
const runner = read('src/Core/MirrorRunner.js');
const hot = read('src/Core/HotLoader.js');
const config = JSON.parse(read('seasonal.json'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const results = [];
  for (const scenario of [
    { enabled: false, month: 9, day: 25, legacy: false, expected: null, opacity: '0' },
    { enabled: false, month: 9, day: 25, legacy: true, expected: null, opacity: '0' },
    { enabled: true, month: 9, day: 25, legacy: false, expected: 'halloween-2026', opacity: '0.22' },
    { enabled: false, month: 11, day: 20, legacy: true, expected: 'navidad-2026', opacity: '0.12' },
    { enabled: false, month: 10, day: 6, legacy: true, expected: null, opacity: '0' },
    { enabled: true, month: 10, day: 6, legacy: false, expected: null, opacity: '0' }
  ]) {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      if (route.request().url() === 'http://seasonal-audit.local/') {
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="background:#101419"><div id="react">Seasonal regression fixture</div></body>' });
      }
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://seasonal-audit.local/');
    const localFlags = seasonalFlags.withHalloween(flags, scenario.enabled);
    await page.evaluate(({ scenario, localFlags, seasonal, config, flagPath, seasonalPath }) => {
      const NativeDate = Date;
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [2026, scenario.month, scenario.day, 12])); }
        static now() { return new NativeDate(2026, scenario.month, scenario.day, 12).getTime(); }
      };
      localStorage.setItem('mf:seasonal:v1', JSON.stringify({ v: 1, hash: 'fixture', cfg: config }));
      window.__MF_MIRROR__ = { v: 1, lists: { mainStart: [flagPath, seasonalPath] }, ok: {},
        code: { [flagPath]: localFlags, [seasonalPath]: seasonal } };
      if (scenario.legacy) {
        const overlay = document.createElement('div');
        overlay.id = 'mf-seasonal-vignette';
        overlay.style.cssText = 'position:fixed;inset:0;opacity:.22;background:orange';
        document.body.append(overlay);
        const stale = 'window.oldSeasonalRan = true;';
        localStorage.setItem('mf:hot:v1', JSON.stringify({ v: 1,
          files: { [seasonalPath]: stale }, guards: { [seasonalPath]: ['__MF_Seasonal'] } }));
        localStorage.setItem('mf:mirror:overrides:v1', JSON.stringify({ v: 1,
          buckets: { mainStart: [seasonalPath, flagPath] },
          files: { [seasonalPath]: stale, [flagPath]: 'window.__MF_SEASONAL_FLAGS__ = {halloween:true};' } }));
      }
    }, { scenario, localFlags, seasonal, config, flagPath, seasonalPath });
    await page.addScriptTag({ content: hot });
    await page.addScriptTag({ content: runner });
    // Let any stale DOMContentLoaded callback get a chance to run too.
    await page.waitForTimeout(100);
    // Christmas legitimately transitions from a legacy overlay to blue.
    // Read its settled visual opacity, not a fractional animation frame.
    await page.waitForFunction(expected => {
      const node = document.querySelector('#mf-seasonal-vignette');
      return node && getComputedStyle(node).opacity === expected;
    }, scenario.opacity, { timeout: 5000 });
    const state = await page.evaluate(() => ({
      flag: window.__MF_SEASONAL_FLAGS__?.halloween,
      event: window.__MF_SEASONAL_STATE__?.().activeEventId ?? null,
      opacity: getComputedStyle(document.querySelector('#mf-seasonal-vignette')).opacity,
      overlays: document.querySelectorAll('#mf-seasonal-vignette').length,
      oldCodeRan: window.oldSeasonalRan === true
    }));
    assert.equal(state.flag, scenario.enabled);
    assert.equal(state.event, scenario.expected);
    assert.equal(state.opacity, scenario.opacity);
    assert.equal(state.overlays, 1);
    assert.equal(state.oldCodeRan, false);
    assert.deepEqual(errors, []);
    results.push({ scenario, state, errors });
    await context.close();
  }
  console.log(JSON.stringify({ browser: 'Edge headless, offline seasonal fixture', results }, null, 2));
} finally {
  await browser.close();
}
