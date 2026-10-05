// los indicadores flotantes (fps, cps, ping, keystrokes) solo existen dentro de un mundo;
// en el menú se esconden con visibility, no display, para no pelear con el layout de cada caja
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const panel = fs.readFileSync(path.join(root, 'src/UI/ClientPanel.js'), 'utf8');

function between(from, to) {
  const a = panel.indexOf(from);
  const b = panel.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `fragmento ${from} no encontrado`);
  return panel.slice(a, b);
}

test('existe un detector de mundo vivo compartido (local games + miniblox + react throttled)', () => {
  assert.match(panel, /function inGameWorld\(\)/);
  assert.match(panel, /__MINIFEATHER_LOCAL_GAMES__[\s\S]{0,80}local\.game\?\.player\?\.pos/);
  assert.match(panel, /window\.miniblox\?\.player\?\.pos/);
  assert.match(panel, /updateQueue\?\.baseState\?\.element\?\.props\?\.game/);
  assert.match(panel, /now - hudGameScanAt < 1000/, 'el escaneo de react va throttled');
});

test('cada flotante sincroniza su visibilidad con inGameWorld()', () => {
  const fps = between('function initFPSCounter()', 'function initCPSCounter()');
  const cps = between('function initCPSCounter()', 'function initPingCounter()');
  const ping = between('function initPingCounter()', 'function initKeystrokes()');
  const keys = between('function initKeystrokes()', 'function injectGuiStyles()');

  for (const [name, chunk] of [['fps', fps], ['cps', cps], ['ping', ping], ['keystrokes', keys]]) {
    assert.ok(chunk.includes('inGameWorld()'), `${name} nunca pregunta si hay mundo`);
    assert.match(chunk, /(box|container)\.style\.visibility = inWorld \? 'visible' : 'hidden'/, `${name} no esconde su caja`);
    assert.ok(chunk.includes('hudShown'), `${name} no recuerda su último estado`);
  }
});

test('los que ya se portaban bien siguen intactos', () => {
  // coordinates/waypoints derivan de game.player.pos en Waypoints.js: ya se esconden solos
  const waypoints = fs.readFileSync(path.join(root, 'src/Waypoints/Waypoints.js'), 'utf8');
  assert.match(waypoints, /game\?\.player\?\.pos/);
  assert.match(waypoints, /state\.coordsHud\.style\.display = 'none'/);
  // armorhud trae su propio inGame() desde antes
  const armor = fs.readFileSync(path.join(root, 'src/HUD/armorhud.js'), 'utf8');
  assert.match(armor, /function inGame\(\)/);
});
