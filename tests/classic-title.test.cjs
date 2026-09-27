const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(rootDir, 'src/UI/TitleScreen.js'), 'utf8');
const panel = fs.readFileSync(path.join(rootDir, 'src/UI/ClientPanel.js'), 'utf8');
const translationsSource = fs.readFileSync(path.join(rootDir, 'src/I18n/Translations.js'), 'utf8');

test('classic title is wired to settings and never loads a second game', () => {
  assert.match(panel, /classicTitle: false/);
  assert.match(panel, /minifeather:titlescreen-config/);
  assert.match(panel, /logo: currentLogo/);
  assert.doesNotMatch(source, /createElement\(['"]iframe['"]\)|classic\/index\.html|mf-classic-frame/);
  assert.doesNotMatch(source, /assets\/classic\/miniblox\.png/);
  assert.match(source, /border:3px solid #000/);
  assert.match(source, /background:rgba\(0,0,0,\.4\)/);
  assert.match(source, /background:rgba\(84,84,84,\.6\)/);
  assert.doesNotMatch(source, /#ce7fa5|#f5c2db|linear-gradient/);
  assert.ok(fs.existsSync(path.join(rootDir, 'assets/classic/title.png')));
});

test('classic title has a current description in every client language', () => {
  const sandbox = {};
  vm.runInNewContext(translationsSource, sandbox);
  const languages = Object.values(sandbox.MINIFEATHER_TRANSLATIONS);
  assert.ok(languages.length >= 9);
  for (const language of languages) {
    assert.ok(language.classicTitle);
    assert.ok(language.classicTitleDesc);
    assert.doesNotMatch(language.classicTitleDesc, /iframe|restor(es|e)|углу|angolo/i);
    for (const key of [
      'classicQuickLaunch', 'classicLaunchHint', 'classicLaunchPlanets',
      'classicLaunchSandbox', 'classicLaunchMinigames',
      'classicLaunchBrowse', 'classicLaunchLoading'
    ]) assert.ok(language[key], `${key} is missing`);
  }
});

test('classic title skins native controls, preserves clicks and restores them', () => {
  const makeClassList = () => {
    const values = new Set();
    return {
      add: value => values.add(value),
      remove: (...items) => items.forEach(item => values.delete(item)),
      toggle: (value, force) => force ? values.add(value) : values.delete(value),
      contains: value => values.has(value)
    };
  };
  const makeElement = (tagName, textContent = '', rect = { width: 150, height: 40, top: 20, left: 20, bottom: 60, right: 170 }) => {
    const attrs = new Map();
    const events = new Map();
    return {
      tagName, textContent, classList: makeClassList(), removed: false,
      children: [], parentElement: null,
      get firstElementChild() { return this.children[0] || null; },
      append(...elements) { for (const element of elements) { element.parentElement = this; this.children.push(element); } },
      replaceChildren(...elements) {
        for (const child of this.children) child.parentElement = null;
        this.children = [];
        this.append(...elements);
      },
      addEventListener(name, callback) { events.set(name, callback); },
      click() { events.get('click')?.(); },
      querySelectorAll: () => [], querySelector: () => null,
      getAttribute: name => attrs.get(name) ?? null,
      setAttribute: (name, value) => attrs.set(name, String(value)),
      removeAttribute: name => attrs.delete(name),
      getBoundingClientRect: () => rect,
      closest: () => null,
      remove() {
        this.removed = true;
        if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
        this.parentElement = null;
      }
    };
  };
  let clicks = 0;
  const play = makeElement('BUTTON', 'Play');
  const settings = makeElement('BUTTON', 'Settings');
  play.click = () => { clicks++; };
  const image = makeElement('IMG', '', { width: 1280, height: 720, top: 0, left: 0, bottom: 720, right: 1280 });
  image.setAttribute('src', 'https://miniblox.io/old-background.png');
  const root = makeElement('DIV');
  root.querySelectorAll = selector => {
    if (selector === 'button,[role="button"]') return [play, settings];
    if (selector === 'img') return [image];
    return [];
  };
  const documentEvents = new Map();
  const windowEvents = new Map();
  const storage = { callback: null, listener: null };
  const timers = new Map();
  let nextTimer = 0;
  let observer;
  const sandbox = {
    innerWidth: 1280, innerHeight: 720,
    location: { pathname: '/' },
    document: {
      head: { appendChild() {} }, documentElement: {},
      createElement: tag => makeElement(tag.toUpperCase()),
      getElementById: id => id === 'react' ? root : null,
      addEventListener: (name, callback) => documentEvents.set(name, callback),
      removeEventListener: name => documentEvents.delete(name)
    },
    chrome: {
      runtime: { getURL: asset => `chrome-extension://test/${asset}` },
      storage: {
        local: { get: (_, callback) => { storage.callback = callback; } },
        onChanged: {
          addListener: callback => { storage.listener = callback; },
          removeListener: () => { storage.listener = null; }
        }
      }
    },
    MutationObserver: class {
      constructor(callback) { observer = this; this.callback = callback; }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
    setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    addEventListener: (name, callback) => windowEvents.set(name, callback),
    removeEventListener: name => windowEvents.delete(name)
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  storage.callback({ settings: { classicTitle: false } });
  assert.equal(root.classList.contains('mf-classic-title'), false);

  documentEvents.get('minifeather:titlescreen-config')({ detail: JSON.stringify({ enabled: true }) });
  assert.equal(root.classList.contains('mf-classic-title'), true);
  assert.equal(play.classList.contains('mf-classic-title-button'), true);
  assert.equal(image.getAttribute('src'), 'chrome-extension://test/assets/classic/title.png');
  play.click();
  assert.equal(clicks, 1);

  const shell = makeElement('DIV');
  const nav = makeElement('DIV');
  const center = makeElement('DIV');
  const right = makeElement('DIV');
  const rightStack = makeElement('DIV');
  const account = makeElement('DIV');
  const benefits = makeElement('DIV');
  shell.append(nav, center, right);
  root.append(shell);
  right.append(rightStack);
  rightStack.append(account, benefits);
  const planets = makeElement('BUTTON', 'Planets');
  const navButtons = [play, settings, planets, makeElement('BUTTON'), makeElement('BUTTON')];
  nav.querySelectorAll = selector => selector === 'button' ? navButtons : [];
  let modeClicks = 0;
  const survivalLink = makeElement('A');
  survivalLink.setAttribute('href', '/game/survival');
  survivalLink.querySelector = selector => selector === 'img' ? { src: 'https://example.test/survival.png' } : null;
  survivalLink.click = () => { modeClicks++; };
  const eggwarsLink = makeElement('A');
  eggwarsLink.setAttribute('href', '/game/eggwars');
  eggwarsLink.click = () => { modeClicks++; };
  center.querySelectorAll = selector => selector === '[role="button"]'
    ? [makeElement('DIV'), makeElement('DIV'), makeElement('DIV')]
    : selector === 'a[href^="/game/"]' ? [survivalLink, eggwarsLink] : [];
  right.querySelector = selector => selector === 'button' ? makeElement('BUTTON') : null;
  observer.callback();
  for (const callback of [...timers.values()]) callback();
  assert.equal(shell.classList.contains('mf-classic-title-shell'), true);
  assert.equal(nav.classList.contains('mf-classic-title-nav'), true);
  assert.equal(benefits.classList.contains('mf-classic-title-hidden'), true);
  assert.equal(nav.querySelectorAll('button').every(button => button.classList.contains('mf-classic-title-button')), true);
  const classicPlay = root.children.find(element => element.className === 'mf-classic-title-play');
  const classicBack = root.children.find(element => element.className === 'mf-classic-title-back');
  const brand = root.children.find(element => element.className === 'mf-classic-title-brand');
  const launch = root.children.find(element => element.className === 'mf-classic-quicklaunch');
  assert.ok(classicPlay && classicBack && brand);
  assert.ok(launch);
  const sections = launch.firstElementChild.children.filter(element => element.tagName === 'SECTION');
  assert.equal(sections.length, 3);
  const modes = sections.flatMap(element => element.children[1].children)
    .filter(element => element.className === 'mf-classic-quicklaunch-mode');
  assert.equal(modes.length, 2);
  assert.equal(modes[0].getAttribute('data-mf-mode'), 'survival');
  assert.equal(modes[0].children[0].src, 'https://example.test/survival.png');
  modes[0].click();
  modes[1].click();
  assert.equal(modeClicks, 2);
  assert.equal(brand.children[0].src, 'chrome-extension://test/assets/icon.png');
  assert.equal(brand.children[0].alt, 'MiniFeather');
  assert.equal(brand.children[1].textContent, 'MiniFeather');
  documentEvents.get('minifeather:titlescreen-config')({ detail: JSON.stringify({ enabled: true, logo: 'https://example.test/custom.png' }) });
  assert.equal(brand.children[0].src, 'https://example.test/custom.png');
  storage.listener({ customLogo: { newValue: 'https://example.test/new.png' } }, 'local');
  assert.equal(brand.children[0].src, 'https://example.test/new.png');
  classicPlay.click();
  assert.equal(root.classList.contains('mf-classic-title-choosing'), true);
  const hiddenRect = { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 };
  for (const button of [play, settings]) button.getBoundingClientRect = () => hiddenRect;
  observer.callback();
  for (const callback of [...timers.values()]) callback();
  assert.equal(root.classList.contains('mf-classic-title-choosing'), true);
  assert.equal(classicPlay.removed, false);
  for (const button of [play, settings]) button.getBoundingClientRect = () =>
    ({ width: 150, height: 40, top: 20, left: 20, bottom: 60, right: 170 });
  documentEvents.get('keydown')({ key: 'Escape' });
  assert.equal(root.classList.contains('mf-classic-title-choosing'), false);
  classicPlay.click();
  classicBack.click();
  assert.equal(root.classList.contains('mf-classic-title-choosing'), false);

  sandbox.location.pathname = '/game';
  windowEvents.get('popstate')();
  for (const callback of [...timers.values()]) callback();
  assert.equal(root.classList.contains('mf-classic-title'), false);
  assert.equal(shell.classList.contains('mf-classic-title-shell'), false);
  assert.equal(classicPlay.removed, true);
  assert.equal(image.getAttribute('src'), 'https://miniblox.io/old-background.png');

  sandbox.location.pathname = '/';
  shell.children.splice(0, 3, center, right, nav);
  observer.callback();
  for (const callback of [...timers.values()]) callback();
  assert.equal(root.classList.contains('mf-classic-title'), true);
  assert.equal(nav.classList.contains('mf-classic-title-nav'), true);
  assert.ok(root.children.find(element => element.className === 'mf-classic-quicklaunch'));
  storage.listener({ settings: { newValue: { classicTitle: false } } }, 'local');
  assert.equal(root.classList.contains('mf-classic-title'), false);
  assert.equal(play.classList.contains('mf-classic-title-button'), false);
  sandbox.__MINIFEATHER_TITLE_SCREEN__.destroy();
  assert.equal(sandbox.__MINIFEATHER_TITLE_SCREEN__, undefined);
});
