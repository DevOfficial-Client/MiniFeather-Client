// Guest homepage smoke check only. No accounts, worlds, microphone or social writes.
// Build the userscript first; run with: node tools/check-player-browser.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const bundle = readFileSync(new URL('../dist/MiniFeatherClient.user.js', import.meta.url), 'utf8');
const icon = readFileSync(new URL('../assets/ui/firstPerson/00.png', import.meta.url));
const baseline = process.argv.includes('--baseline');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  for (const site of ['https://miniblox.io/', 'https://miniblox.online/']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    try {
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname.endsWith('/assets/ui/firstPerson/00.png')) {
          return route.fulfill({ status: 200, contentType: 'image/png', body: icon });
        }
        if (['ntfy.sh', 'catbox.moe', 'files.catbox.moe', 'openrouter.ai', 'api.z.ai', 'js.puter.com'].includes(url.hostname) ||
            !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.abort();
        return route.continue();
      });
      await context.routeWebSocket('wss://ntfy.sh/**', socket => socket.close());
      if (!baseline) await context.addInitScript({ content: `(() => { if (!/(^|\\.)miniblox\\.(io|online)$/.test(location.hostname)) return;\n${bundle}\n})();` });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push({ message: error.message.slice(0, 160), stack: String(error.stack).slice(0, 600),
        // Reproduced with --baseline, without MiniFeather: the game's ad SDK
        // rejects false when its request is blocked by this read-only harness.
        nativeAdvertisingWarning: error.message === 'Uncaught (in promise) false' &&
          String(error.stack).includes('https://api.adinplay.com/libs/aiptag/pub/BLC/miniblox.io/tag.min.js') }));
      const response = await page.goto(site, { waitUntil: 'commit', timeout: 30000 });
      if (baseline) {
        await page.waitForTimeout(12000);
        results.push({ site, http: response?.status(), nativeWithoutClient: true, errors });
        continue;
      }
      await page.waitForFunction(() => !!document.querySelector('#minifeather-fps, #mf-sidebar-btn'), null, { timeout: 30000 });
      const cape = await page.evaluate(() => {
        document.dispatchEvent(new CustomEvent('minifeather:better-animation-cape-config', {
          detail: JSON.stringify({ enabled: false, movement: 'simulation-v2', style: 'smooth', wind: 'waves', gravity: 10 })
        }));
        return window.BetterAnimationCape?.getState();
      });
      assert.equal(cape?.version, 3, 'bundled cape physics version');
      assert.equal(cape.options.movement, 'simulation-v2'); assert.equal(cape.error, '');
      await page.keyboard.press('ShiftRight');
      await page.locator('#mf-gui [data-page="render"]').click({ timeout: 10000 });
      await page.locator('.mf-toggle[data-key="firstPerson"]').waitFor();
      await page.waitForFunction(() => {
        const image = document.querySelector('.mf-toggle[data-key="firstPerson"] img');
        return image?.complete && image.naturalWidth === 32;
      });
      const toggle = async (key, enabled) => {
        await page.evaluate(({ key, enabled }) => document.dispatchEvent(new CustomEvent('minifeather:nsb-toggle', {
          detail: JSON.stringify({ key, enabled })
        })), { key, enabled });
      };
      await toggle('vanillaAnimations', true);
      await toggle('firstPerson', true);
      await page.waitForFunction(() => window.MF_RealisticFirstPerson?.getState().manualEnabled === true);
      await page.waitForFunction(() => document.querySelector('.mf-toggle[data-key="firstPerson"] input')?.checked === true);
      const active = await page.evaluate(() => ({
        firstPerson: window.MF_RealisticFirstPerson.getState(),
        vanilla: window.VanillaAnimations.enabled,
        conflicts: [window.MF_PlayerAnims.enabled, window.MF_FreshAnims.enabled,
          window.MF_HeadLag.enabled, window.MF_HandSway.enabled],
        checked: document.querySelector('.mf-toggle[data-key="firstPerson"] input')?.checked
      }));
      assert.equal(active.firstPerson.version, 4, 'bundled First Person version');
      assert.equal(active.firstPerson.enabled, true, 'standalone effective state');
      assert.equal(active.firstPerson.error, '', 'First Person error');
      assert.equal(active.vanilla, true, 'Vanilla remains enabled');
      assert.equal(active.checked, true, 'Render toggle stays enabled');
      assert.deepEqual(active.conflicts, [false, false, false, false]);
      await page.evaluate(() => window.MF_RealisticFirstPerson.setRealisticOptions({ enabled: true }));
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('minifeather:firstperson-config', {
        detail: JSON.stringify({ enabled: false })
      })));
      await page.waitForFunction(() => !window.MF_RealisticFirstPerson.getState().manualEnabled);
      const leased = await page.evaluate(() => window.MF_RealisticFirstPerson.getState());
      assert.equal(leased.enabled, true);
      assert.equal(leased.realisticEnabled, true);
      await page.evaluate(() => window.MF_RealisticFirstPerson.setRealisticOptions({ enabled: false }));
      assert.equal(await page.evaluate(() => window.MF_RealisticFirstPerson.getState().enabled), false);
      await toggle('firstPerson', false);
      results.push({ site, http: response?.status(), standalone: true, realisticLease: true,
        customAnimationsDisabled: true, vanillaPreserved: true, capeVersion: cape.version, icon: '32x32 PNG', errors });
    } catch (error) {
      results.push({ site, failed: String(error.stack).slice(0, 600), errors });
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ scope: 'Guest homepage and real module toggles; not an in-world or FPS certification.', results }, null, 2));
if (results.some(result => result.failed || result.errors.some(error => !error.nativeAdvertisingWarning))) process.exitCode = 1;
