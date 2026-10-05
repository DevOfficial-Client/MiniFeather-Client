// menu hub: reorganiza la pantalla inicial de miniblox en un hub con jerarquia.
// nada se elimina: las funciones nativas se esconden detras del rail y "ver todo".
// sandbox jsdom con un #react falso de 3 paneles (nav/centro/right), como manda la casa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const rootDir = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(rootDir, 'src/UI/MF_MenuHub.js'), 'utf8');
const panel = fs.readFileSync(path.join(rootDir, 'src/UI/ClientPanel.js'), 'utf8');
const translationsSource = fs.readFileSync(path.join(rootDir, 'src/I18n/Translations.js'), 'utf8');
const mirrorList = JSON.parse(fs.readFileSync(path.join(rootDir, 'mirror.json'), 'utf8'));
const mirrorBundle = fs.readFileSync(path.join(rootDir, 'src/Core/mirror.js'), 'utf8');

test('el hub esta cableado al panel: default on, config, init llamado y toggle', () => {
  assert.match(panel, /menuHub: true/);
  assert.match(panel, /minifeather:menuhub-config/);
  assert.match(panel, /function initMenuHubModule\(\)/);
  assert.match(panel, /initMenuHubModule\(\);/);
  assert.match(panel, /setModuleEnabled\('menuHub', settings\.menuHub\)/);
  assert.match(panel, /renderToggle\(\s*'menuHub',/);
  assert.match(panel, /'rebrand', 'classicTitle', 'menuHub',/);
  assert.match(panel, /menuHub: \['\.kkkkkk\.',/);
  assert.match(panel, /minifeather:open-panel/);
  assert.ok(fs.existsSync(path.join(rootDir, 'assets/ui/menuHub/00.png')));
  assert.ok(mirrorList.mainStart.includes('src/UI/MF_MenuHub.js'), 'el hub debe viajar en el mirror');
  assert.ok(mirrorBundle.includes('menuhub-config'), 'mirror.js regenerado con el modulo embebido');
});

test('menuHub tiene nombre y descripcion en todos los idiomas del cliente', () => {
  const sandbox = {};
  vm.runInNewContext(translationsSource, sandbox);
  const languages = Object.values(sandbox.MINIFEATHER_TRANSLATIONS);
  assert.ok(languages.length >= 9);
  for (const language of languages) {
    assert.ok(language.menuHub, 'falta menuHub');
    assert.ok(language.menuHubDesc, 'falta menuHubDesc');
    assert.doesNotMatch(language.menuHubDesc, /se elimina todo|removed everything/i);
  }
});

test('el modulo se defiende solo: guardas de plataforma y de classic title', () => {
  assert.match(source, /__MINIFEATHER_MENU_HUB__/);
  assert.match(source, /minifeather:menuhub-config/);
  assert.match(source, /mf-classic-title/);           // classic title manda si ambos estan on
  assert.match(source, /MIN_WIDTH = 1100/);           // pantallas chicas: pantalla nativa
  assert.match(source, /try \{ globalThis\[KEY\]\?\.destroy\?\.\(\); \} catch \(_\) \{\}/);
  assert.doesNotMatch(source, /createElement\(['"]iframe['"]\)/);
  assert.match(source, /localStorage\.setItem\(PINS_KEY/);
});

function buildFakeMiniblox() {
  const dom = new JSDOM('<!doctype html><html><body><div id="react"></div></body></html>', {
    url: 'https://miniblox.io/',
    pretendToBeVisual: false,
    runScripts: 'dangerously'
  });
  const { document } = dom.window;
  Object.defineProperty(dom.window, 'innerWidth', { value: 1920, configurable: true });
  // jsdom no implementa estos: el hub los llama con optional chaining/try, pero mejor tenerlos
  dom.window.HTMLElement.prototype.scrollTo = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};

  const react = document.getElementById('react');
  const img = (src) => {
    const node = document.createElement('img');
    node.src = src;
    return node;
  };
  const card = (tag, href, plays, name) => {
    const node = document.createElement(tag);
    if (href) node.setAttribute('href', href);
    node.append(img(`https://img/${name.replace(/\W/g, '')}.png`));
    const p1 = document.createElement('p');
    p1.textContent = plays;
    const p2 = document.createElement('p');
    p2.textContent = name;
    node.append(p1, p2);
    return node;
  };

  // fondo + particulas: hijos directos de #react que el hub debe desenfocar via css
  react.append(img('https://miniblox.io/assets/default.webp'));
  react.append(document.createElement('canvas'));

  const nav = document.createElement('div');
  for (const label of ['Ajustes', 'Social', 'Mensajes', 'Planetas', 'Logros', 'Tienda']) {
    const button = document.createElement('button');
    button.textContent = label;
    nav.append(button);
  }

  const center = document.createElement('div');
  const worlds = document.createElement('div');   // "jump back in": botones, no links
  for (const name of ['Mundo 100 dias', 'Survival de Shu', 'Eggwars con la banda']) {
    worlds.append(card('button', null, 'hace 2h', name));
  }
  const games = document.createElement('div');    // "top games": links /game/
  for (const [slug, plays, name] of [
    ['survival', '1.1M', 'Survival'], ['eggwars', '1.1M', 'EggWars'], ['skywars', '1.1M', 'Skywars'],
    ['creative', '352k', 'Creative'], ['parkour', '148k', 'Parkour']
  ]) games.append(card('a', `/game/${slug}`, plays, name));
  const customs = document.createElement('div');  // "top custom games": botones con imagen
  for (const name of ['KIT PVP JAPAN', 'one block survival', 'Pillars of Fortune']) {
    customs.append(card('button', null, '16', name));
  }
  center.append(worlds, games, customs);

  const right = document.createElement('div');
  const rightStack = document.createElement('div');
  const profile = document.createElement('div');
  profile.textContent = 'ShusukeExE_';
  const lootboxes = document.createElement('div');
  lootboxes.textContent = 'Lootboxes';
  const friends = document.createElement('div');
  friends.textContent = 'AMIGOS (137) 2 en línea';
  const openNow = document.createElement('button'); // el panel real tiene botones (open now, iconos...)
  openNow.textContent = 'Ver todas';
  rightStack.append(profile, lootboxes, friends, openNow);
  right.append(rightStack);

  const shell = document.createElement('div');
  shell.append(nav, center, right);
  react.append(shell);

  return { dom, react, nav, center, right, worlds, games };
}

function bootHub(dom) {
  const code = fs.readFileSync(path.join(rootDir, 'src/UI/MF_MenuHub.js'), 'utf8');
  // jsdom no le pasa globals al eval directo: la casa inyecta por <script> con runScripts dangerously
  const script = dom.window.document.createElement('script');
  script.textContent = code;
  dom.window.document.body.append(script);
  dom.window.document.dispatchEvent(new dom.window.CustomEvent('minifeather:menuhub-config', {
    detail: JSON.stringify({ enabled: true, language: 'es' })
  }));
}

test('el hub marca los paneles, construye rail y respeta la jerarquia', () => {
  const fake = buildFakeMiniblox();
  const { document } = fake.dom.window;
  bootHub(fake.dom);

  assert.ok(fake.react.classList.contains('mf-hub'), '#react con clase hub');
  assert.ok(fake.nav.classList.contains('mf-hub-nav'), 'nav marcado');
  assert.ok(fake.center.classList.contains('mf-hub-center'), 'centro marcado');
  assert.ok(fake.right.classList.contains('mf-hub-right'), 'right marcado');

  const hub = document.getElementById('mf-hub-root');
  assert.ok(hub, 'hub montado');
  const railLabels = [...hub.querySelectorAll('.mf-hub-navbtn small')].map(node => node.textContent);
  assert.deepEqual(railLabels, ['Inicio', 'Jugar', 'Social', 'Tienda', 'Mods', 'Ajustes', 'Más']);

  // CONTINUE = primera tarjeta de la primera seccion (boton de mundo), no un link de top games
  assert.equal(hub.querySelector('.mf-hub-contname')?.textContent, 'Mundo 100 dias');
  // DISCOVER: 3 links grandes, el reciente es un boton de mundo asi que no se deduplica
  assert.equal(hub.querySelectorAll('.mf-hub-big').length, 3);
  // favoritos sin pins: candidatos populares con estrella + [+]
  assert.ok(hub.querySelectorAll('.mf-hub-fav').length >= 3);
  assert.ok(hub.querySelector('.mf-hub-add'));
  // pill de amigos leyendo el panel nativo
  assert.match(hub.querySelector('.mf-hub-friendspill')?.textContent || '', /2/);
});

test('click en el hub reenvia a las tarjetas nativas y "ver todo" expande', () => {
  const fake = buildFakeMiniblox();
  const { document } = fake.dom.window;
  bootHub(fake.dom);
  const hub = document.getElementById('mf-hub-root');

  let worldClicks = 0;
  fake.worlds.children[0].addEventListener('click', () => { worldClicks += 1; });
  hub.querySelector('.mf-hub-continue').click();
  assert.equal(worldClicks, 1, 'CONTINUE reenvia el click al mundo nativo');

  hub.querySelector('.mf-hub-seeall').click();
  assert.ok(fake.react.classList.contains('mf-hub-expanded'), 'ver todo expande');
  document.dispatchEvent(new fake.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.ok(!fake.react.classList.contains('mf-hub-expanded'), 'escape vuelve al hub');

  // HOME regresa al hub despues de expandir
  hub.querySelector('.mf-hub-seeall').click();
  [...hub.querySelectorAll('.mf-hub-navbtn')].find(b => b.dataset.hub === 'home').click();
  assert.ok(!fake.react.classList.contains('mf-hub-expanded'), 'HOME vuelve al hub');
});

test('los favoritos persisten en localStorage y re-renderizan la fila', () => {
  const fake = buildFakeMiniblox();
  const { document } = fake.dom.window;
  bootHub(fake.dom);
  const hub = document.getElementById('mf-hub-root');

  hub.querySelector('.mf-hub-add').click();
  const picker = document.getElementById('mf-hub-picker');
  assert.ok(picker, 'picker abierto');
  const rows = [...picker.querySelectorAll('.mf-hub-pickrow')];
  const skywars = rows.find(row => row.textContent.includes('Skywars'));
  skywars.querySelector('.mf-hub-star').click();
  assert.deepEqual(JSON.parse(fake.dom.window.localStorage.getItem('mf_menuhub_pins_v1')), ['skywars']);
  const favTexts = [...document.querySelectorAll('#mf-hub-root .mf-hub-fav span')].map(node => node.textContent);
  assert.ok(favTexts.includes('Skywars'), 'la fila de favoritos muestra el pin');
  assert.equal(document.querySelectorAll('#mf-hub-root .mf-hub-big').length, 3, 'discover completa el hueco del pin');
});

test('destroy deja la pantalla como si nada', () => {
  const fake = buildFakeMiniblox();
  bootHub(fake.dom);
  const api = fake.dom.window.__MINIFEATHER_MENU_HUB__;
  assert.equal(typeof api.destroy, 'function');
  api.destroy();
  assert.ok(!fake.react.classList.contains('mf-hub'));
  assert.ok(!fake.react.classList.contains('mf-hub-expanded'));
  assert.equal(fake.dom.window.document.getElementById('mf-hub-root'), null);
  assert.ok(!fake.nav.classList.contains('mf-hub-nav'));
  assert.ok(!fake.center.classList.contains('mf-hub-center'));
  assert.ok(!fake.right.classList.contains('mf-hub-right'));
});
