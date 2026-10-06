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

test('la gui respira con la musica: tap del howl html5 en rama y fail-open', () => {
  // la musica es un howl html5 (elemento audio de Howler, NO pasa por masterGain):
  // MediaElementSource reponiendo el camino audible PRIMERO y analyser en rama sin salida
  assert.match(source, /function beatMusicElement\(\)/);
  assert.match(source, /origin !== location\.origin\) continue;/);   // cross-origin NUNCA se toca
  assert.match(source, /source\.connect\(ctx\.destination\)/);       // el audio del usuario se repone antes que nada
  assert.match(source, /boost\.connect\(analyser\)/);                // rama de analisis: analiza pero no suena
  assert.match(source, /__MF_MENU_BEAT__/);                          // analizador reutilizable entre hotloads
  assert.match(source, /beat\.blocked = true/);                      // elemento ya sourceado: no reventar
  assert.match(source, /typeof requestAnimationFrame !== 'function'/); // entornos sin rAF (jsdom): gui quieta
  assert.match(source, /beat\.retry = setTimeout/);                  // el tap se reintenta: el ctx se desbloquea con el primer click real y en pagina quieta no llegan syncs
  assert.match(source, /removeProperty\('--mf-beat'\)/);             // apagar deja la gui quieta
  assert.match(source, /!state\.enabled \|\| state\.destroyed \|\| !state\.hub \|\| !beat\.analyser/);  // loop muere sin hub
  // reaccion sutil en tres superficies: escenario + tarjeta continue + vineta
  assert.ok((source.match(/var\(--mf-beat,0\)/g) || []).length >= 4);
});

test('la estructura del chip se marca aunque el canvas este mudo', () => {
  // un remount de react nace sin marcas y el fit inline del canvas se ancla al
  // contenedor equivocado: personaje arriba y encima de la tarjeta. las marcas
  // estructurales solo necesitan que el canvas EXISTA; el contenido decide el fit
  assert.match(source, /function markChipStructure\(right, canvas\)/);
  assert.ok((source.match(/markChipStructure\(right, canvas\)/g) || []).length >= 3, 'estructura en el camino mudo Y en el pintado');
  assert.match(source, /if \(!markChipStructure\(right, canvas\)\) markChipStatic\(right\);/);
  // el fit (y solo el fit) sigue condicionado al contenido del canvas
  assert.match(source, /state\.chipCanvas = canvas;\s*\n\s*fitChipCanvas\(canvas, frac\);/);
});

test('el head-tracking del chip se re-ancla tras cada fit del canvas', () => {
  // el sitio congela el ancla del mouse en el primer syncToVisible; el hub escribe
  // positionOnScreen directamente via el manager que vive en la fiber de react.
  // NO puede llamar syncToVisible: resizea el bitmap (borra el buffer pintado) y
  // toca la camara con el rect ya fitteado — camino al personaje chico y huerfano
  assert.match(source, /function findChipTracker\(canvas\)/);
  assert.match(source, /__reactFiber\$/);
  assert.match(source, /cand\.guiPlayer && typeof cand\.syncToVisible === 'function'/);
  assert.match(source, /function syncChipTracker\(canvas\)/);
  assert.match(source, /pos\.set\(r\.x \+ r\.width \/ 2, r\.y - 0\.7475 \* r\.height\)/);
  assert.doesNotMatch(source, /tracker\.syncToVisible\(/);
  assert.match(source, /if \(!\(r\.width > 0 && r\.height > 0\)\) return;/);
  // el fit en ambas ramas (escenario y expanded) re-ancla
  assert.ok((source.match(/syncChipTracker\(canvas\)/g) || []).length >= 2, 'fitChipCanvas debe re-anclar en escenario y expanded');
  // al degradar a estatico restaura los estilos inline del sitio (snapshot), no un
  // vacio: el sitio tambien usa inline width/height/left en el canvas
  assert.match(source, /function markChipStatic\(right\)/);
  assert.ok((source.match(/markChipStatic\(right\)/g) || []).length >= 5, 'todas las degradaciones deben restaurar estilos');
  assert.match(source, /const FIT_PROPS = \['transform', 'transformOrigin', 'left', 'top', 'right', 'bottom', 'width', 'height', 'position', 'margin'\]/);
  assert.match(source, /function snapshotChipCanvas\(canvas\)/);
  assert.match(source, /function restoreChipCanvas\(right\)/);
  assert.match(source, /snapshotChipCanvas\(canvas\);/);
  assert.match(source, /restoreChipCanvas\(state\.layoutRight\);/);
  assert.match(source, /chipFitSnapshot = new WeakMap/);
  assert.match(source, /if \(!snap\) continue;/);   // canvas nunca fitteado = intocado
  // resize: el ancla es viewport, el escenario se mueve con la ventana
  assert.match(source, /window\.addEventListener\('resize', onChipResize\)/);
  assert.match(source, /window\.removeEventListener\('resize', onChipResize\)/);
  assert.match(source, /state\.chipCanvas\?\.isConnected/);
  // canvases sin fiber (tests jsdom, otros modulos) no deben romper el fit
  assert.match(source, /chipTrackers = new WeakMap/);
  // personaje un poco mas grande: 93% del escenario (pedido "mas grandesito .v?")
  assert.match(source, /winH \* 0\.93\) \/ figH/);
  assert.doesNotMatch(source, /winH \* 0\.86\)/);
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
  const customs = document.createElement('div');  // "servers de la comunidad": div role=button con splash de mundo
  for (const [id, players, name] of [
    ['2942026', '14', 'mace PvP'], ['3052708', '3', 'TNT Tag'], ['2999999', '7', 'KIT PVP JAPAN']
  ]) {
    const node = document.createElement('div');
    node.setAttribute('role', 'button');
    const splash = document.createElement('img');
    splash.src = `https://session.coolmathblox.ca/world-splash/${id}.jpg`;
    const p1 = document.createElement('p');
    p1.textContent = name;
    const p2 = document.createElement('p');
    p2.textContent = players;
    node.append(splash, p1, p2);
    customs.append(node);
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

  return { dom, react, nav, center, right, worlds, games, customs };
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

test('los servers de la comunidad se fijan en favoritos con clave w:<id>', () => {
  const fake = buildFakeMiniblox();
  const { document } = fake.dom.window;
  bootHub(fake.dom);
  const hub = document.getElementById('mf-hub-root');

  hub.querySelector('.mf-hub-add').click();
  const picker = document.getElementById('mf-hub-picker');
  assert.ok([...picker.querySelectorAll('h3')].some(h => h.textContent === 'Comunidad'),
    'picker con grupo comunidad');
  const rows = [...picker.querySelectorAll('.mf-hub-pickrow')];
  const mace = rows.find(row => row.textContent.includes('mace PvP'));
  assert.ok(mace, 'server de comunidad listado en el picker');

  mace.querySelector('.mf-hub-star').click();
  const pins = JSON.parse(fake.dom.window.localStorage.getItem('mf_menuhub_pins_v1'));
  assert.ok(pins.includes('w:2942026'), 'pin persistido con clave w:<id>');

  // la fila de favoritos muestra el server con su splash y reenvia el click al nodo nativo
  let clicks = 0;
  fake.customs.children[0].addEventListener('click', () => { clicks += 1; });
  const fav = [...document.querySelectorAll('#mf-hub-root .mf-hub-fav')]
    .find(c => c.textContent.includes('mace PvP'));
  assert.ok(fav, 'favorito de comunidad en la fila');
  assert.ok(fav.querySelector('img').src.includes('2942026'), 'favorito con splash del server');
  fav.click();
  assert.equal(clicks, 1, 'click reenviado a la tarjeta nativa del server');
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
