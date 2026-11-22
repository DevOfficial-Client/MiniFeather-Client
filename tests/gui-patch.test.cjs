const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../src/HUD/GUIPatch.js'), 'utf8');

function setupHud(t) {
  const barLayers = (label, color, level = false) => `
    <div class="game-grid">
      <div class="game-backdrop" style="background: rgba(0,0,0,.7)"></div>
      <div class="game-layer">
        <div class="game-grid" style="display:grid">
          <div class="game-fill" style="grid-area:1 / 1;background: ${color}"></div>
          <div class="game-label">${level ? '<h3>' + label + '</h3>' : '<span>' + label + '</span>'}</div>
        </div>
      </div>
    </div>`;
  const dom = new JSDOM(`
    <script src="/assets/GuiHud-test.js"></script>
    <div id="react">
      <div id="other" style="background: red"></div>
      <div id="xp" style="border: 1px solid white">${barLayers('10', 'green', true)}</div>
      <div id="row" style="background: teal">
        <div id="health" style="border: 1px solid red">${barLayers('20 / 20', '#d3040b')}</div>
        <div id="food" style="border: 1px solid orange">${barLayers('18 / 20', '#c78151')}</div>
      </div>
    </div>`, { runScripts: 'outside-only', url: 'https://example.test/' });
  const { window } = dom;
  t.after(() => {
    window.GUIPatch.disable();
    window.close();
  });

  let now = 0;
  let nextId = 0;
  const timers = new Map();
  function schedule(fn, delay, repeat = false) {
    timers.set(++nextId, { fn, at: now + delay, delay, repeat });
    return nextId;
  }
  window.setTimeout = schedule;
  window.setInterval = (fn, delay) => schedule(fn, delay, true);
  window.clearTimeout = window.clearInterval = id => timers.delete(id);
  Object.defineProperty(window.performance, 'now', { value: () => now });

  function advance(ms) {
    const target = now + ms;
    while (timers.size) {
      const [id, task] = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (task.at > target) break;
      now = task.at;
      if (task.repeat) task.at += task.delay;
      else timers.delete(id);
      task.fn();
    }
    now = target;
  }

  function setBounds(el, left, top, width, height) {
    el.getBoundingClientRect = () => ({ left, top, right: left + width, bottom: top + height, width, height });
    Object.defineProperties(el, {
      offsetWidth: { value: width, configurable: true },
      offsetHeight: { value: height, configurable: true }
    });
  }

  const get = id => window.document.getElementById(id);
  const game = { player: {}, info: { health: 20, food: 18, xp: { experience: 0.5, experienceLevel: 10 } } };
  get('react').gameRoot = { updateQueue: { baseState: { element: { props: { game } } } } };
  setBounds(get('other'), 392, 510, 240, 12);
  function setBarBounds(id, left, top, width, height) {
    const bar = get(id);
    setBounds(bar, left, top, width, height);
    for (const layer of bar.querySelectorAll('div')) setBounds(layer, left + 1, top + 1, width - 2, height - 2);
  }
  setBarBounds('xp', 252, 566, 520, 22);
  setBarBounds('health', 252, 590, 258, 24);
  setBarBounds('food', 514, 590, 258, 24);
  window.eval(source);

  function configure(enabled) {
    window.document.dispatchEvent(new window.CustomEvent('minifeather:guipatch-config', {
      detail: JSON.stringify({ enabled, guiBase: '/assets/gui/' })
    }));
  }

  return { window, get, game, advance, configure, setBounds, setBarBounds, timers };
}

test('GUI Patch hides the native grid fills and puts a single thin XP track under the vitals', t => {
  const { window, get, game, advance, configure, timers } = setupHud(t);
  const xp = get('xp');
  const health = get('health');
  const food = get('food');
  const originalNodes = [xp.firstElementChild, health.firstElementChild, food.firstElementChild];
  const styledElements = [xp, health, food, get('row')];
  const originalStyles = styledElements.map(el => el.getAttribute('style'));

  configure(true);
  advance(1800);
  const xpOverlay = xp.querySelector('.mf-xp-icons');
  assert.ok(xpOverlay, 'the XP patch starts from the module config event');
  assert.equal(xpOverlay.querySelectorAll('[src$="EXPVASSEL.png"]').length, 1);
  assert.equal(xpOverlay.querySelectorAll('[src*="/exp/exp"]').length, 9);
  assert.equal(xpOverlay.querySelector('span').textContent, '10');
  assert.equal(xpOverlay.querySelector('.mf-xp-fill').style.clipPath, 'inset(0 50% 0 0)');
  assert.equal(xpOverlay.style.height, '8px');
  assert.equal(xpOverlay.style.getPropertyValue('--mf-bar-shift'), '33px');
  assert.equal(get('other').querySelector('.mf-xp-icons'), null);
  const hearts = health.querySelector('.mf-hearts');
  assert.equal(hearts.querySelectorAll('img').length, 10);
  assert.equal(hearts.style.getPropertyValue('--mf-bar-shift'), '-9px');
  assert.equal(food.querySelectorAll('.mf-food img').length, 10);
  for (const bar of [xp, health, food]) {
    assert.ok(bar.hasAttribute('data-mf-gui-bar'));
    assert.equal(window.getComputedStyle(bar.querySelector('.game-fill')).visibility, 'hidden');
  }
  assert.equal(window.getComputedStyle(hearts).visibility, 'visible');

  game.info.health = 15;
  game.info.xp = { experience: 1, experienceLevel: 11 };
  originalNodes[1].querySelector('span').textContent = '15 / 20';
  xp.querySelector('h3').textContent = '11';
  advance(200);
  assert.equal(xpOverlay.querySelectorAll('[src*="/exp/exp"]').length, 18);
  assert.equal(xpOverlay.querySelector('span').textContent, '11');
  assert.ok(health.querySelector('.mf-hearts img[src$="heart_half.png"]'));

  configure(false);
  advance(3000);
  assert.equal(timers.size, 0);
  assert.equal(window.document.querySelectorAll('[data-mf-gui-bar], .mf-hearts, .mf-food, .mf-xp-icons').length, 0);
  assert.deepEqual([xp.firstElementChild, health.firstElementChild, food.firstElementChild], originalNodes);
  assert.deepEqual(styledElements.map(el => el.getAttribute('style')), originalStyles);
  assert.equal(health.querySelector('span').textContent, '15 / 20');
  assert.equal(window.getComputedStyle(health).visibility, 'visible');
  assert.equal(window.getComputedStyle(health.querySelector('.game-fill')).visibility, 'visible');

  configure(true);
  advance(1800);
  assert.equal(window.document.querySelectorAll('[data-mf-gui-bar]').length, 3);
});

test('GUI Patch puts overlays back when the game redraws a bar or swaps its element', t => {
  const { window, get, advance, configure, setBarBounds } = setupHud(t);
  configure(true);
  advance(1800);

  const health = get('health');
  health.querySelector('.game-label span').textContent = '19 / 20';
  health.querySelector('.mf-hearts').remove();
  advance(200);
  assert.ok(health.querySelector('.mf-hearts'));

  const previousFood = get('food');
  const nextFood = window.document.createElement('div');
  nextFood.id = 'food';
  nextFood.style.border = '1px solid orange';
  nextFood.appendChild(previousFood.firstElementChild.cloneNode(true));
  previousFood.replaceWith(nextFood);
  setBarBounds('food', 514, 590, 258, 24);
  advance(2000);
  assert.ok(nextFood.querySelector('.mf-food'));
  assert.equal(previousFood.hasAttribute('data-mf-gui-bar'), false);

  configure(false);
  assert.equal(nextFood.querySelector('.game-label span').textContent, '18 / 20');
  assert.equal(health.querySelector('.game-label span').textContent, '19 / 20');
});

test('GUI Patch leaves the XP track absent until the game renders a native XP bar', t => {
  const { window, get, game, advance, configure } = setupHud(t);
  const xp = get('xp');
  get('other').remove();
  xp.remove();
  game.info.xp = { experience: 0, experienceLevel: 0, experienceTotal: 0 };

  configure(true);
  advance(1800);
  assert.equal(window.document.querySelector('.mf-xp-icons'), null);
  assert.equal(get('health').querySelectorAll('.mf-hearts img').length, 10);
  assert.equal(get('food').querySelectorAll('.mf-food img').length, 10);

  game.info.xp = { experience: 0.25, experienceLevel: 0, experienceTotal: 1 };
  xp.querySelector('h3').textContent = '';
  get('react').prepend(xp);
  advance(2100);
  assert.equal(xp.querySelector('.mf-xp-fill').style.clipPath, 'inset(0 75% 0 0)');
  assert.equal(xp.querySelector('.mf-xp-icons span').textContent, '');

  xp.remove();
  advance(100);
  assert.equal(window.document.querySelector('.mf-xp-icons'), null);
  assert.equal(get('health').querySelector('.mf-hearts').style.getPropertyValue('--mf-bar-shift'), '0px');
  assert.equal(get('food').querySelector('.mf-food').style.getPropertyValue('--mf-bar-shift'), '0px');
});

test('GUI Patch anchors low health to the full native frame and ignores unrelated HUD numbers', t => {
  const { window, get, game, advance, configure, setBounds } = setupHud(t);
  const health = get('health');
  const fill = health.querySelector('.game-fill');
  game.info.health = 7;
  health.querySelector('.game-label span').textContent = '7 / 20';
  fill.style.width = '35%';
  setBounds(fill, 253, 591, 90, 22);

  const counter = window.document.createElement('div');
  counter.textContent = '4 / 20';
  get('react').insertBefore(counter, get('row'));
  setBounds(counter, 255, 590, 72, 24);

  configure(true);
  advance(1800);
  assert.equal(health.querySelectorAll(':scope > .mf-hearts img').length, 10);
  assert.equal(health.querySelectorAll('.mf-hearts img[src$="heart_full.png"]').length, 3);
  assert.equal(health.querySelectorAll('.mf-hearts img[src$="heart_half.png"]').length, 1);
  assert.equal(window.getComputedStyle(fill).visibility, 'hidden');
  assert.equal(counter.hasAttribute('data-mf-gui-bar'), false);
  assert.ok(get('food').querySelector('.mf-food'));
});

test('GUI Patch inherits the game HUD visibility when the inventory opens and closes', t => {
  const { window, get, advance, configure } = setupHud(t);
  configure(true);
  advance(1800);
  const overlays = [...window.document.querySelectorAll('.mf-hearts, .mf-food, .mf-xp-icons')];
  assert.equal(overlays.length, 3);
  const visibility = () => overlays.map(el => window.getComputedStyle(el).visibility);
  assert.deepEqual(visibility(), ['visible', 'visible', 'visible']);

  // Miniblox hides the wrapper, rather than unmounting the HUD, while its inventory is open.
  get('react').style.visibility = 'hidden';
  assert.deepEqual(visibility(), ['hidden', 'hidden', 'hidden']);
  get('react').style.visibility = '';
  assert.deepEqual(visibility(), ['visible', 'visible', 'visible']);
  assert.equal(window.getComputedStyle(get('health').querySelector('.game-fill')).visibility, 'hidden');
});
