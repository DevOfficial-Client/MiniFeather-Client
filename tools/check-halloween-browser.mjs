// Isolated UI test with the real ClientPanel, local assets and temporary browser storage.
// No game server, user profile, accounts, telemetry or external network is used.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flagsSource = readFileSync(path.join(root, 'src/Core/SeasonalFlags.js'), 'utf8');
const flags = enabled => flagsSource.replace(/const HALLOWEEN_ENABLED = (?:true|false);/, `const HALLOWEEN_ENABLED = ${enabled};`);
const output = path.join(root, 'artifacts', 'halloween-ui');
mkdirSync(output, { recursive: true });
const defaults = JSON.parse(readFileSync(path.join(root, 'defaults.json'), 'utf8'));
const flat = Object.assign({}, ...Object.entries(defaults).filter(([key]) => !key.startsWith('_')).map(([, value]) => value));
for (const key of Object.keys(flat)) if (typeof flat[key] === 'boolean') flat[key] = false;
Object.assign(flat, { language: 'es', panelAccentColor: '#40bacb', panelBackgroundColor: '#15202b', pageZoomEnabled: false, halloweenAnimations: true });
const fileDefaults = { ...flat, halloweenTheme: true };
// Native-style menu fixture for callback/layout checks, not a live game capture.
const homeFixture = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:MFPreview;src:url('/assets/classic/Minecraft-Regular.otf')}
  *{box-sizing:border-box}body{margin:0;color:#fff;font-family:MFPreview,monospace;background:#201b30}
  #react>img{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1}
  .preview-shell{display:grid;grid-template-columns:185px minmax(0,1fr) 250px;gap:30px;padding:24px;min-height:100vh}
  .preview-nav{display:flex;flex-direction:column;justify-content:center;gap:9px}
  button{color:white;cursor:pointer;font:inherit;border:2px solid #15121b;background:#17131de6;padding:13px;border-radius:7px}
  .preview-center{height:94vh;overflow-y:auto;padding:10px}.preview-center h1{font-size:24px;margin:14px 0 24px}
  .preview-games{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:14px 0 30px}
  .preview-games a{display:block;border:2px solid #666;border-radius:8px;color:white;text-decoration:none;overflow:hidden;background:#201b30}
  .preview-games img{display:block;width:100%;height:130px;object-fit:cover}.preview-games p{padding:10px;margin:0}
  .preview-profile{padding:16px;border:2px solid #30213e;background:#191422de;border-radius:10px}.preview-profile img{width:48px;height:48px;border-radius:8px}
  </style></head><body><div id="react"><img src="/assets/classic/title.png" alt="">
  <div class="preview-shell"><div class="preview-nav">${['Settings','Social','Messages','Planets','Shop','Rankings'].map(name => `<button>${name}</button>`).join('')}</div>
  <div class="preview-center"><h1>MINIFEATHER</h1><h2>Juegos</h2><div class="preview-games">${['survival','eggwars','superflat'].map(name => `<a role="button" href="/game/${name}"><img src="/assets/classic/title.png" alt=""><p>${name.toUpperCase()}</p></a>`).join('')}</div>
  <h2>Seguir jugando</h2><div class="preview-games"><button>Unirse</button></div></div>
  <div><div class="preview-profile"><img src="/assets/icon.png" alt=""><p>ItsWolfyX</p><button>Perfil</button></div><p>3 en línea</p></div></div></div>
  </body></html>`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(String(error.stack || error)));
const contentTypes = { '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.json': 'application/json' };
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin !== 'https://miniblox.io' || route.request().method() !== 'GET') return route.abort();
  if (url.pathname === '/__mf_halloween_preview__') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#201b30"><div id="react"><button>Settings</button><button>Play</button></div></body></html>' });
  if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: homeFixture });
  if (url.pathname === '/defaults.json') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ other: fileDefaults }) });
  if (!url.pathname.startsWith('/assets/')) return route.abort();
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep) || !existsSync(file)) return route.abort();
  return route.fulfill({ contentType: contentTypes[path.extname(file)] || 'application/octet-stream', body: readFileSync(file) });
});
await context.routeWebSocket(/.*/, socket => socket.close());
await context.addInitScript(initial => {
  // The existing first-run tour is unrelated to this feature and would cover screenshots.
  localStorage.setItem('mf:first-steps-v5', 'yes');
  const listeners = [];
  const read = () => JSON.parse(localStorage.getItem('__mf_test_chrome_storage') || JSON.stringify({ settings: initial }));
  globalThis.chrome = {
    runtime: { id: 'halloween-ui-test', getURL: name => location.origin + '/' + name, getManifest: () => ({ version: '4.19.0' }),
      sendMessage(_message, callback) { if (typeof callback === 'function') queueMicrotask(() => callback({ ok: false })); },
      onMessage: { addListener() {}, removeListener() {} }, lastError: null },
    storage: { local: {
      get(keys, callback) { const store = read(), result = {}; for (const key of typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(store)) if (key in store) result[key] = store[key]; if (callback) queueMicrotask(() => callback(result)); return Promise.resolve(result); },
      set(values, callback) { const old = read(), next = { ...old, ...values }; localStorage.setItem('__mf_test_chrome_storage', JSON.stringify(next)); queueMicrotask(() => { for (const fn of listeners) fn(Object.fromEntries(Object.keys(values).map(key => [key, { oldValue: old[key], newValue: next[key] }])), 'local'); callback?.(); }); return Promise.resolve(); },
      remove(keys, callback) { const next = read(); for (const key of typeof keys === 'string' ? [keys] : keys) delete next[key]; localStorage.setItem('__mf_test_chrome_storage', JSON.stringify(next)); callback?.(); return Promise.resolve(); }
    }, onChanged: { addListener(fn) { listeners.push(fn); }, removeListener(fn) { const index = listeners.indexOf(fn); if (index >= 0) listeners.splice(index, 1); } } }
  };
}, flat);

const loadUI = async ({ halloweenAvailable = true } = {}) => {
  await page.goto('https://miniblox.io/__mf_halloween_preview__');
  await page.addScriptTag({ content: flags(halloweenAvailable) });
  for (const file of ['src/I18n/Translations.js', 'src/UI/HalloweenTheme.js', 'src/UI/ClientPanel.js', 'src/UI/PanelPolish.js']) {
    await page.addScriptTag({ content: readFileSync(path.join(root, file), 'utf8') + '\n//# sourceURL=' + file });
  }
  await page.waitForFunction(() => !!window.__MINIFEATHER_CONTENT__);
  await page.waitForTimeout(500);
  await page.keyboard.press('ShiftRight');
  await page.locator('#mf-gui').waitFor({ state: 'visible' });
};

try {
  await loadUI();
  await page.locator('#mf-gui [data-page="settings"]').click();
  await page.locator('#mf-halloween-theme').waitFor({ state: 'attached' });
  assert.equal(await page.locator('html').getAttribute('data-mf-halloween-ui'), null);
  const baseline = await page.locator('#mf-gui').evaluate(element => ({ background: getComputedStyle(element).background, accent: element.style.getPropertyValue('--mf-ui-accent') }));
  await page.locator('#mf-halloween-theme').locator('..').click();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-mf-halloween-ui') === 'on');
  assert.equal(await page.locator('#mf-halloween-theme').isChecked(), true);
  assert.equal(await page.locator('.mf-halloween-ribbon').isVisible(), true);
  assert.equal(await page.locator('.mf-halloween-ribbon').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('.mf-halloween-ribbon').evaluate(element => getComputedStyle(element).pointerEvents), 'none');
  assert.equal(await page.locator('.mf-halloween-ribbon').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
  assert.match(await page.locator('.mf-halloween-ribbon-copy strong').textContent(), /Cosecha de medianoche/);
  assert.equal(await page.locator('.mf-halloween-ghost').evaluate(element => getComputedStyle(element).animationName), 'none');
  assert.equal(await page.locator('.mf-halloween-ribbon-ghost').evaluate(element => getComputedStyle(element).animationName), 'none');
  await page.locator('.mf-halloween-settings').scrollIntoViewIfNeeded();
  await page.locator('#mf-gui').screenshot({ path: path.join(output, 'settings-on.png') });
  await page.locator('.mf-halloween-settings').screenshot({ path: path.join(output, 'theme-card.png') });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  assert.equal(await page.locator('.mf-halloween-ghost').evaluate(element => getComputedStyle(element).animationName), 'mfHalloweenFloat');
  assert.equal(await page.locator('.mf-halloween-ribbon-ghost').evaluate(element => getComputedStyle(element).animationName), 'mfHalloweenFloat');
  await page.locator('#mf-halloween-animations').locator('..').click();
  assert.equal(await page.locator('#mf-halloween-animations').isChecked(), false);
  assert.equal(await page.locator('.mf-halloween-ghost').evaluate(element => getComputedStyle(element).animationName), 'none');
  assert.equal(await page.locator('.mf-halloween-ribbon-ghost').evaluate(element => getComputedStyle(element).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#mf-gui [data-page="render"]').click();
  await page.locator('#mf-gui-page').evaluate(element => { element.scrollTop = 0; });
  await page.locator('#mf-gui').screenshot({ path: path.join(output, 'modules-on.png') });
  const moduleCard = page.locator('.mf-toggle[data-key="rebrand"]');
  const icon = await moduleCard.locator('.mf-feature-icon img').getAttribute('src');
  const checked = await moduleCard.locator('input').isChecked();
  await moduleCard.locator('[data-mf-favorite]').click();
  assert.equal(await moduleCard.locator('[data-mf-favorite]').evaluate(element => element.classList.contains('active')), true);
  assert.equal(await moduleCard.locator('input').isChecked(), checked);
  await moduleCard.locator('[data-mf-favorite]').click();
  await moduleCard.locator('[data-mf-settings]').click();
  await page.locator('.mf-feature-modal').waitFor({ state: 'visible' });
  assert.match(await page.locator('.mf-feature-modal').evaluate(element => getComputedStyle(element).backgroundImage), /web\.svg/);
  await page.locator('.mf-feature-modal').screenshot({ path: path.join(output, 'module-settings.png') });
  await page.locator('[data-feature-close]').click();
  await moduleCard.locator('.mf-feature-icon').click();
  assert.equal(await moduleCard.locator('input').isChecked(), !checked);
  await moduleCard.locator('[data-mf-settings]').click();
  await page.locator('.mf-feature-modal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-feature-enabled]').evaluate(element => getComputedStyle(element, '::before').content), 'none');
  await page.locator('[data-feature-close]').click();
  await moduleCard.locator('.mf-feature-icon').click();
  assert.equal(await moduleCard.locator('input').isChecked(), checked);
  assert.equal(await moduleCard.locator('.mf-feature-icon img').getAttribute('src'), icon);
  assert.equal(await moduleCard.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + 18, rect.top + 18)?.closest('.mf-toggle') === element;
  }), true);
  await loadUI();
  await page.locator('#mf-gui [data-page="settings"]').click();
  assert.equal(await page.locator('#mf-halloween-theme').isChecked(), true);
  assert.equal(await page.locator('#mf-halloween-animations').isChecked(), false);
  await page.locator('#mf-halloween-theme').locator('..').click();
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-mf-halloween-ui'));
  const restored = await page.locator('#mf-gui').evaluate(element => ({ background: getComputedStyle(element).background, accent: element.style.getPropertyValue('--mf-ui-accent') }));
  assert.deepEqual(restored, baseline);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('__mf_test_chrome_storage')).settings);
  assert.equal(saved.panelAccentColor, flat.panelAccentColor);
  assert.equal(saved.panelBackgroundColor, flat.panelBackgroundColor);
  assert.equal(saved.halloweenTheme, false);
  assert.equal(await page.locator('.mf-halloween-ribbon').isVisible(), false);
  await page.locator('#mf-gui').screenshot({ path: path.join(output, 'settings-off.png') });
  await page.setViewportSize({ width: 800, height: 700 });
  await page.locator('#mf-halloween-theme').locator('..').click();
  await page.locator('#mf-gui').screenshot({ path: path.join(output, 'settings-compact.png') });
  assert.equal(await page.locator('.mf-halloween-settings').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
  assert.equal(await page.locator('.mf-halloween-ribbon').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
  assert.equal(await page.locator('.mf-feather-nav-main').evaluate(element => element.getBoundingClientRect().right <= document.getElementById('mf-gui-help').getBoundingClientRect().left), true);
  await page.setViewportSize({ width: 420, height: 740 });
  assert.equal(await page.locator('.mf-halloween-ribbon').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
  assert.equal(await page.locator('.mf-halloween-ribbon-art').isVisible(), false);
  assert.equal(await page.locator('.mf-feather-nav-main').evaluate(element => element.getBoundingClientRect().right <= document.getElementById('mf-gui-help').getBoundingClientRect().left), true);
  await page.locator('#mf-gui').screenshot({ path: path.join(output, 'panel-mobile.png') });
  await page.keyboard.press('Escape');
  await page.locator('#mf-gui').waitFor({ state: 'hidden' });

  // Missing preferences use the new default. An explicit false remains false.
  await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('__mf_test_chrome_storage'));
    delete store.settings.halloweenTheme;
    localStorage.setItem('__mf_test_chrome_storage', JSON.stringify(store));
  });
  await loadUI();
  await page.locator('#mf-gui [data-page="settings"]').click();
  assert.equal(await page.locator('#mf-halloween-theme').isChecked(), true);
  await page.locator('#mf-halloween-theme').locator('..').click();
  await loadUI();
  await page.locator('#mf-gui [data-page="settings"]').click();
  assert.equal(await page.locator('#mf-halloween-theme').isChecked(), false);

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('https://miniblox.io/');
  for (const file of ['src/Core/SeasonalFlags.js', 'src/I18n/Translations.js', 'src/UI/HalloweenTheme.js']) {
    await page.addScriptTag({ content: readFileSync(path.join(root, file), 'utf8') });
  }
  await page.evaluate(() => {
    window.__MF_HALLOWEEN_UI__.configure({ enabled: true, language: 'es', motion: false });
    window.previewClicks = [];
    for (const button of document.querySelectorAll('#react button,#react a')) button.addEventListener('click', event => { event.preventDefault(); window.previewClicks.push(button.textContent.trim()); });
  });
  const hero = () => page.locator('.preview-center').evaluate(element => getComputedStyle(element, '::before').content);
  assert.match(await hero(), /Cosecha de medianoche/);
  assert.match(await hero(), /Tu próxima aventura empieza aquí/);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'SURVIVAL', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.previewClicks), ['Settings', 'SURVIVAL']);
  const background = await page.locator('#react>img').evaluate(element => element.src);
  await page.screenshot({ path: path.join(output, 'home-native.png') });
  await page.evaluate(() => window.__MF_HALLOWEEN_UI__.configure({ enabled: false }));
  assert.equal(await hero(), 'none');
  assert.equal(await page.locator('#react>img').evaluate(element => element.src), background);
  await page.evaluate(() => window.__MF_HALLOWEEN_UI__.configure({ enabled: true }));

  // Exercise the real MenuHub and Classic Title, keeping their own callbacks.
  await page.addScriptTag({ content: readFileSync(path.join(root, 'src/UI/MF_MenuHub.js'), 'utf8') });
  await page.evaluate(() => window.__MINIFEATHER_MENU_HUB__.enable());
  await page.locator('#mf-hub-root').waitFor({ state: 'visible' });
  assert.match(await page.locator('.mf-hub-main').evaluate(element => getComputedStyle(element, '::before').content), /Cosecha de medianoche/);
  await page.screenshot({ path: path.join(output, 'home-hub.png') });
  await page.evaluate(() => window.__MINIFEATHER_MENU_HUB__.destroy());
  await page.addScriptTag({ content: readFileSync(path.join(root, 'src/UI/TitleScreen.js'), 'utf8') });
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('minifeather:titlescreen-config', { detail: JSON.stringify({ enabled: true, language: 'es' }) }));
  });
  await page.locator('.mf-classic-title-play').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(output, 'home-classic.png') });
  await page.locator('.mf-classic-title-play').click();
  assert.equal(await page.locator('#react').evaluate(element => element.classList.contains('mf-classic-title-choosing')), true);
  await page.locator('.mf-classic-title-back').click();
  assert.equal(await page.locator('.mf-classic-title-play').isVisible(), true);
  assert.equal(await page.locator('#react>img').evaluate(element => element.src), background);
  await page.evaluate(() => {
    window.__MINIFEATHER_TITLE_SCREEN__.destroy();
    document.getElementById('react').replaceChildren(Object.assign(document.createElement('canvas'), { id: 'world' }));
  });
  assert.equal(await page.locator('canvas').count(), 1);
  assert.equal(await page.locator('#react').evaluate(element => getComputedStyle(element, '::before').content), 'none');
  assert.equal(await page.locator('#react>canvas').evaluate(element => getComputedStyle(element).display), 'inline');

  await page.evaluate(async () => chrome.storage.local.set({ settings: { halloweenTheme: true, halloweenAnimations: true, startupAnimation: true } }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addScriptTag({ content: readFileSync(path.join(root, 'src/Core/SplashScreen.js'), 'utf8') });
  await page.locator('#mf-startup-splash').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#mf-startup-splash').getAttribute('data-halloween'), 'on');
  await page.evaluate(() => {
    for (const animation of document.getElementById('mf-startup-splash').getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 1600; }
  });
  await page.screenshot({ path: path.join(output, 'startup-halloween.png') });
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.locator('#mf-startup-splash').waitFor({ state: 'detached' });
  await page.evaluate(async () => chrome.storage.local.set({ settings: { halloweenTheme: false, startupAnimation: true } }));
  await page.evaluate(() => window.__MINIFEATHER_SPLASH__.play({ force: true }));
  await page.locator('#mf-startup-splash').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#mf-startup-splash').getAttribute('data-halloween'), 'off');
  assert.equal(await page.locator('.mf-splash-halloween').evaluate(element => getComputedStyle(element).display), 'none');
  await page.evaluate(() => window.__MINIFEATHER_SPLASH__.destroy());

  // Simulate the future update by changing only the flag in memory, never the
  // working source file. Previously saved ON preferences must not bypass it.
  await page.evaluate(async () => chrome.storage.local.set({ settings: { halloweenTheme: true, halloweenAnimations: true, startupAnimation: true } }));
  await loadUI({ halloweenAvailable: false });
  await page.locator('#mf-gui [data-page="settings"]').click();
  assert.equal(await page.locator('.mf-halloween-ribbon,.mf-halloween-settings,#mf-halloween-theme,#mf-halloween-animations').count(), 0);
  assert.equal(await page.locator('#mf-halloween-ui-style,#mf-halloween-preview-style').count(), 0);
  assert.equal(await page.locator('html').getAttribute('data-mf-halloween-ui'), null);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('minifeather:halloween-ui-config', { detail: '{"enabled":true,"motion":true}' })));
  assert.equal(await page.locator('html').getAttribute('data-mf-halloween-ui'), null);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('__mf_test_chrome_storage')).settings.halloweenTheme), true);
  await page.locator('#mf-gui').screenshot({ path: path.join(output, 'event-disabled.png') });
  await page.addScriptTag({ content: readFileSync(path.join(root, 'src/Core/SplashScreen.js'), 'utf8') });
  await page.locator('#mf-startup-splash').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#mf-startup-splash').getAttribute('data-halloween'), 'off');
  assert.equal(await page.locator('#mf-startup-splash .mf-splash-halloween,#mf-startup-splash .mf-splash-season').count(), 0);
  await page.evaluate(() => {
    for (const animation of document.getElementById('mf-startup-splash').getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 1600; }
  });
  await page.screenshot({ path: path.join(output, 'startup-normal.png') });
  await page.evaluate(() => window.__MINIFEATHER_SPLASH__.destroy());
  await loadUI();
  await page.locator('#mf-gui [data-page="settings"]').click();
  assert.equal(await page.locator('#mf-halloween-theme').isChecked(), true);
  assert.equal(await page.locator('.mf-halloween-ribbon').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ realClientPanel: true, temporaryStorage: true, externalNetwork: false, onOff: true,
    persistentAfterReload: true, colorsRestored: true, motionToggle: true, reducedMotion: true, compactLayout: true,
    defaultEnabled: true, explicitOptOutPersists: true, nativeMenuFixture: true, realMenuHub: true,
    classicTitleNavigation: true, worldCanvasUnchanged: true, startupReveal: true, decorativeBanner: true,
    moduleToggleAndFavorites: true, moduleSettings: true, moduleIconsPreserved: true,
    narrowNavigation: true, centralOffSwitch: true, savedOnCannotBypassOffSwitch: true,
    seasonalControlsHiddenWhenRetired: true, normalStartupWhenRetired: true,
    preferencesPreservedForNextSeason: true, errors, screenshots: output }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failed.png') }).catch(() => {});
  console.error(JSON.stringify({ errors, state: await page.evaluate(() => ({
    active: document.querySelector('#mf-gui [data-page].active')?.getAttribute('data-page'),
    theme: window.__MF_HALLOWEEN_UI__?.getState(),
    heading: document.querySelector('#mf-gui-page')?.textContent?.slice(0, 250),
    themeControls: document.querySelectorAll('#mf-halloween-theme').length
  })).catch(() => null) }, null, 2));
  throw error;
} finally { await browser.close(); }
