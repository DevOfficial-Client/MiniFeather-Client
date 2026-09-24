// Build the ClickGUI's source grids into real, transparent 32x32 pixel-art PNGs.
// Run from the repository root: node assets/generate-ui-pixel-icons.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const panelSource = fs.readFileSync(path.join(__dirname, '../src/UI/ClientPanel.js'), 'utf8');
const outputDir = path.resolve(__dirname, 'ui');
const scale = 2;

function readLiteral(name) {
  const match = panelSource.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n  \\});`));
  if (!match) throw new Error(`${name} was not found`);
  return vm.runInNewContext(`(${match[1]})`);
}

const palette = readLiteral('PIXEL_PALETTE');
const icons = readLiteral('MF_PIXEL_ICONS');

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function rgba(symbol) {
  const value = palette[symbol];
  if (symbol === '.') return [0, 0, 0, 0];
  if (typeof value !== 'string') throw new Error(`Unknown palette symbol: ${symbol}`);
  const hex = value.startsWith('var(') ? '#ef3b3b' : value;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid palette color: ${hex}`);
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).concat(255);
}

function makeArt(name, rows) {
  if (rows.length !== 8 || rows.some((row) => row.length !== 8)) {
    throw new Error(`${name} must be an 8x8 icon`);
  }
  const art = Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => rows[y >> 1][x >> 1]));
  const rect = (x, y, width, height, symbol) => {
    for (let yy = y; yy < y + height; yy++) {
      for (let xx = x; xx < x + width; xx++) art[yy][xx] = symbol;
    }
  };

  // A few small silhouettes need more pixels than the original 8x8 grid can carry.
  if (name === 'keystrokes') {
    rect(0, 0, 16, 16, '.');
    rect(5, 1, 6, 6, 'k'); rect(6, 2, 4, 4, 'B'); rect(7, 3, 2, 2, '#');
    for (const x of [0, 5, 10]) {
      rect(x, 8, 6, 7, 'k'); rect(x + 1, 9, 4, 5, 'B');
      rect(x + 2, 10, 2, 2, '#');
    }
  } else if (name === 'fpsCounter') {
    rect(0, 0, 16, 16, '.');
    rect(1, 1, 14, 12, 'k'); rect(2, 2, 12, 10, 'B');
    rect(3, 9, 2, 2, 'g'); rect(5, 7, 2, 4, 'g');
    rect(7, 8, 2, 3, 'g'); rect(9, 5, 2, 6, 'g');
    rect(11, 3, 2, 8, 'g'); rect(5, 13, 6, 1, '-');
    rect(3, 3, 2, 1, 'b');
  } else if (name === 'duckMobs') {
    rect(0, 0, 16, 16, '.');
    rect(4, 2, 8, 2, 'Y'); rect(3, 4, 10, 7, 'y');
    rect(2, 7, 12, 5, 'y'); rect(3, 12, 9, 2, 'Y');
    rect(5, 5, 2, 2, 'k'); rect(10, 5, 2, 2, 'k');
    rect(6, 8, 8, 2, 'o'); rect(8, 10, 5, 1, 'O');
    rect(5, 14, 2, 2, 'O'); rect(10, 14, 2, 2, 'O');
  } else if (name === 'crittersMobs') {
    rect(0, 0, 16, 16, '.');
    rect(3, 0, 3, 6, 'N'); rect(4, 1, 1, 4, 'p');
    rect(10, 0, 3, 6, 'N'); rect(11, 1, 1, 4, 'p');
    rect(2, 5, 12, 9, 'N'); rect(3, 6, 10, 7, 'n');
    rect(5, 8, 2, 2, 'k'); rect(10, 8, 2, 2, 'k');
    rect(7, 10, 2, 2, 'p'); rect(5, 13, 6, 1, 'N');
  } else if (name === 'safeSneak') {
    rect(0, 0, 16, 16, '.');
    rect(2, 12, 14, 2, 'k'); rect(2, 14, 14, 1, '-');
    rect(3, 8, 3, 4, 'G'); rect(5, 6, 4, 6, 'g');
    rect(7, 9, 5, 3, 'g'); rect(10, 11, 4, 1, 'G');
    rect(5, 7, 3, 1, '#');
  } else if (name === 'itemPhysics') {
    rect(0, 0, 16, 16, '.');
    rect(5, 2, 6, 2, 'y'); rect(3, 4, 10, 2, 'Y');
    rect(2, 6, 12, 6, 'Y'); rect(3, 6, 5, 5, 'y');
    rect(8, 6, 5, 5, 'o'); rect(7, 6, 2, 6, '#');
    rect(4, 12, 8, 1, 'O'); rect(3, 15, 10, 1, '-');
  }

  // The named designs below are drawn at a genuine 16x16 resolution. They
  // replace the most ambiguous 8x8 silhouettes with recognizable pixel art.
  const clear = () => rect(0, 0, 16, 16, '.');
  switch (name) {
    case 'armorHud':
      clear();
      rect(3, 2, 10, 2, 'k'); rect(1, 4, 14, 3, 'k');
      rect(2, 7, 12, 5, 'k'); rect(4, 12, 8, 3, 'k');
      rect(3, 4, 10, 7, '+'); rect(5, 11, 6, 3, '+');
      rect(6, 2, 4, 4, 'k'); rect(7, 3, 2, 2, '#');
      rect(4, 6, 3, 5, 'b'); rect(9, 6, 3, 5, 'b');
      rect(6, 8, 4, 5, '#'); rect(5, 13, 6, 1, '-');
      break;
    case 'cpsCounter':
      clear();
      rect(5, 2, 6, 2, 'k'); rect(3, 4, 10, 8, 'k');
      rect(5, 12, 6, 2, 'k'); rect(4, 5, 8, 6, 'b');
      rect(5, 11, 6, 2, 'B'); rect(7, 3, 2, 5, 'k');
      rect(7, 5, 2, 2, '#'); rect(2, 2, 2, 2, 'y');
      rect(11, 1, 2, 2, 'y'); rect(13, 4, 2, 2, 'y');
      break;
    case 'chatVideos':
      clear();
      rect(1, 2, 14, 11, 'k'); rect(2, 3, 12, 9, 'B');
      rect(3, 4, 10, 7, 'b'); rect(5, 5, 2, 5, '#');
      rect(7, 6, 2, 3, '#'); rect(9, 7, 2, 1, '#');
      rect(5, 14, 6, 1, '-'); rect(6, 13, 4, 1, '-');
      break;
    case 'chatLinks':
      clear();
      rect(2, 3, 7, 2, 'T'); rect(1, 5, 2, 5, 'T');
      rect(3, 10, 6, 2, 'T'); rect(7, 5, 2, 3, 'T');
      rect(7, 4, 6, 2, 't'); rect(12, 6, 2, 5, 't');
      rect(7, 11, 6, 2, 't'); rect(6, 8, 2, 3, 't');
      rect(4, 7, 8, 2, '#'); rect(4, 5, 2, 1, 't');
      break;
    case 'movement':
      clear();
      rect(9, 1, 3, 4, 'G'); rect(7, 4, 6, 5, 'G');
      rect(6, 7, 7, 4, 'g'); rect(4, 10, 10, 2, 'g');
      rect(3, 12, 12, 2, 'G'); rect(5, 14, 10, 1, 'k');
      rect(7, 5, 3, 1, '#'); rect(2, 5, 3, 1, 't');
      rect(1, 8, 4, 1, 't'); rect(0, 11, 3, 1, 'T');
      break;
    case 'autoSprint':
      clear();
      rect(8, 1, 3, 4, 'G'); rect(6, 4, 6, 5, 'G');
      rect(5, 7, 8, 4, 'g'); rect(4, 10, 10, 2, 'g');
      rect(3, 12, 12, 2, 'G'); rect(4, 14, 11, 1, 'k');
      rect(2, 3, 4, 1, 'g'); rect(0, 6, 5, 1, 'g');
      rect(1, 9, 3, 1, 'G'); rect(7, 5, 2, 1, '#');
      break;
    case 'cloudsPackNoise':
      clear();
      rect(5, 2, 6, 3, 'B'); rect(3, 4, 10, 2, 'B');
      rect(1, 6, 14, 5, 'B'); rect(3, 11, 10, 2, 'B');
      rect(4, 6, 8, 4, 'b'); rect(6, 4, 4, 2, 'b');
      rect(5, 7, 2, 1, '#'); rect(9, 5, 1, 1, '#');
      rect(11, 8, 1, 1, '#'); rect(7, 10, 1, 1, 'B');
      rect(4, 13, 2, 1, 'b'); rect(10, 13, 2, 1, 'b');
      break;
    case 'idlePlayerBot':
      clear();
      rect(7, 0, 2, 3, 'B'); rect(6, 0, 4, 1, 'b');
      rect(3, 3, 10, 9, 'B'); rect(4, 4, 8, 7, 'b');
      rect(1, 6, 2, 4, 'B'); rect(13, 6, 2, 4, 'B');
      rect(5, 6, 2, 2, '#'); rect(9, 6, 2, 2, '#');
      rect(6, 10, 4, 1, 'Y'); rect(4, 12, 8, 2, 'B');
      rect(4, 14, 3, 2, 'k'); rect(9, 14, 3, 2, 'k');
      break;
    case 'world':
      clear();
      rect(5, 1, 6, 1, 'B'); rect(3, 2, 10, 2, 'B');
      rect(2, 4, 12, 8, 'B'); rect(3, 12, 10, 2, 'B');
      rect(5, 14, 6, 1, 'B'); rect(3, 4, 10, 8, 'b');
      rect(4, 4, 4, 2, 'g'); rect(3, 6, 5, 2, 'G');
      rect(5, 8, 3, 3, 'g'); rect(10, 4, 2, 3, 'g');
      rect(9, 7, 4, 2, 'G'); rect(10, 9, 2, 3, 'g');
      rect(5, 12, 2, 1, 'G'); rect(7, 2, 2, 1, '#');
      break;
    case 'discord':
      clear();
      rect(3, 3, 10, 2, 'V'); rect(2, 5, 12, 7, 'V');
      rect(3, 12, 10, 2, 'V'); rect(4, 4, 8, 8, 'v');
      rect(2, 3, 3, 3, 'v'); rect(11, 3, 3, 3, 'v');
      rect(5, 7, 2, 2, '#'); rect(9, 7, 2, 2, '#');
      rect(6, 11, 4, 1, 'V'); rect(2, 12, 2, 2, 'v');
      rect(12, 12, 2, 2, 'v');
      break;
    case 'home':
      clear();
      rect(7, 1, 2, 2, 'Y'); rect(5, 3, 6, 2, 'Y');
      rect(3, 5, 10, 2, 'Y'); rect(1, 7, 14, 2, 'Y');
      rect(3, 9, 10, 5, 'y'); rect(2, 14, 12, 1, 'Y');
      rect(6, 10, 4, 5, 'k'); rect(7, 11, 2, 4, 'N');
      rect(4, 10, 2, 2, 'b'); rect(11, 10, 2, 2, 'b');
      rect(7, 2, 2, 1, '#');
      break;
    case 'grid':
      clear();
      for (const [x, y, edge, face] of [[1, 1, 'B', 'b'], [9, 1, 'G', 'g'],
        [1, 9, 'Y', 'y'], [9, 9, 'P', 'p']]) {
        rect(x, y, 6, 6, edge); rect(x + 1, y + 1, 4, 4, face);
        rect(x + 2, y + 2, 2, 1, '#');
      }
      break;
    case 'close':
      clear();
      for (let i = 2; i < 14; i++) {
        rect(i, i, 2, 2, 'R'); rect(14 - i, i, 2, 2, 'R');
        rect(i, i, 1, 1, 'r'); rect(14 - i, i, 1, 1, 'r');
      }
      rect(7, 7, 2, 2, '#');
      break;
    case 'search':
      clear();
      rect(5, 2, 6, 1, 'B'); rect(3, 3, 10, 2, 'B');
      rect(2, 5, 12, 5, 'B'); rect(3, 10, 10, 2, 'B');
      rect(5, 12, 6, 1, 'B'); rect(4, 5, 8, 5, 'b');
      rect(5, 5, 4, 2, '#'); rect(9, 9, 3, 3, 'k');
      rect(11, 11, 3, 3, 'B'); rect(13, 13, 2, 2, 'b');
      break;
    case 'heart':
      clear();
      rect(2, 3, 5, 2, 'R'); rect(9, 3, 5, 2, 'R');
      rect(1, 5, 14, 4, 'R'); rect(2, 9, 12, 2, 'R');
      rect(4, 11, 8, 2, 'R'); rect(6, 13, 4, 2, 'R');
      rect(2, 5, 12, 4, 'r'); rect(4, 9, 8, 2, 'r');
      rect(6, 11, 4, 2, 'r'); rect(3, 5, 3, 2, 'p');
      rect(10, 5, 2, 1, 'p');
      break;
    case 'settings':
      clear();
      rect(7, 0, 2, 4, '-'); rect(7, 12, 2, 4, '-');
      rect(0, 7, 4, 2, '-'); rect(12, 7, 4, 2, '-');
      rect(3, 3, 10, 10, '-'); rect(4, 4, 8, 8, '+');
      rect(6, 6, 4, 4, 'k'); rect(7, 7, 2, 2, 'y');
      rect(2, 2, 3, 3, '-'); rect(11, 2, 3, 3, '-');
      rect(2, 11, 3, 3, '-'); rect(11, 11, 3, 3, '-');
      break;
    case 'hud':
      clear();
      rect(1, 2, 14, 12, 'B'); rect(2, 3, 12, 10, 'b');
      rect(2, 3, 12, 2, 'B'); rect(4, 4, 1, 1, '#');
      rect(6, 4, 1, 1, 'y'); rect(3, 6, 6, 3, 'k');
      rect(4, 7, 4, 1, '#'); rect(10, 6, 3, 3, 'g');
      rect(3, 10, 4, 2, 'B'); rect(8, 10, 5, 2, 'Y');
      break;
    case 'experimental':
      clear();
      rect(6, 1, 4, 2, 'k'); rect(7, 2, 2, 5, '+');
      rect(5, 7, 6, 2, 'k'); rect(4, 9, 8, 2, 'k');
      rect(3, 11, 10, 3, 'k'); rect(4, 14, 8, 1, 'k');
      rect(4, 11, 8, 3, 'g'); rect(5, 10, 6, 1, 't');
      rect(6, 11, 2, 1, '#'); rect(9, 12, 2, 1, 'T');
      rect(4, 4, 2, 2, 't'); rect(11, 6, 1, 1, 't');
      break;
    case 'betterPlayerLayers':
      clear();
      rect(6, 1, 4, 3, 'N'); rect(3, 4, 10, 2, 'P');
      rect(1, 6, 14, 5, 'P'); rect(3, 11, 10, 3, 'P');
      rect(4, 5, 8, 8, 'p'); rect(6, 4, 4, 2, 'n');
      rect(6, 7, 4, 6, 'b'); rect(7, 8, 2, 3, 't');
      rect(2, 7, 2, 3, '#'); rect(12, 7, 2, 3, '#');
      rect(5, 13, 6, 2, 'B');
      break;
    case 'damageParticles':
      clear();
      rect(7, 0, 2, 4, 'r'); rect(7, 12, 2, 4, 'R');
      rect(0, 7, 4, 2, 'r'); rect(12, 7, 4, 2, 'R');
      rect(3, 3, 3, 3, 'R'); rect(10, 3, 3, 3, 'r');
      rect(3, 10, 3, 3, 'r'); rect(10, 10, 3, 3, 'R');
      rect(5, 5, 6, 6, 'R'); rect(6, 6, 4, 4, 'r');
      rect(7, 7, 2, 2, '#');
      break;
    case 'shineAmbience':
      clear();
      rect(7, 0, 2, 16, 'Y'); rect(0, 7, 16, 2, 'Y');
      rect(4, 4, 8, 8, 'y'); rect(5, 5, 6, 6, '#');
      rect(7, 2, 2, 12, '#'); rect(2, 7, 12, 2, '#');
      rect(1, 1, 2, 2, 'y'); rect(13, 2, 1, 1, 'y');
      rect(2, 13, 1, 1, 'Y'); rect(13, 13, 2, 2, 'Y');
      break;
    case 'fullBright':
      clear();
      rect(7, 0, 2, 3, 'y'); rect(7, 13, 2, 3, 'Y');
      rect(0, 7, 3, 2, 'y'); rect(13, 7, 3, 2, 'Y');
      rect(3, 3, 10, 10, 'Y'); rect(4, 4, 8, 8, 'y');
      rect(5, 5, 6, 6, '#'); rect(2, 2, 2, 2, 'y');
      rect(12, 2, 2, 2, 'y'); rect(2, 12, 2, 2, 'Y');
      rect(12, 12, 2, 2, 'Y');
      break;
    case 'vanillaAnimations':
      clear();
      rect(6, 1, 4, 4, 'N'); rect(7, 2, 3, 3, 'n');
      rect(7, 3, 1, 1, 'k'); rect(9, 3, 1, 1, 'k');
      rect(5, 5, 6, 6, 'r'); rect(4, 5, 2, 6, 'n');
      rect(11, 6, 2, 6, 'n'); rect(5, 11, 6, 2, 'B');
      rect(5, 13, 2, 3, 'N'); rect(9, 13, 2, 3, 'N');
      rect(3, 14, 4, 2, 'k'); rect(9, 14, 4, 2, 'k');
      break;
    case 'playerAnims':
      clear();
      rect(6, 1, 4, 4, 'N'); rect(7, 2, 3, 3, 'n');
      rect(7, 3, 1, 1, 'k'); rect(9, 3, 1, 1, 'k');
      rect(5, 5, 6, 6, 'b'); rect(2, 5, 3, 3, 'n');
      rect(11, 7, 3, 3, 'n'); rect(5, 11, 6, 2, 'B');
      rect(3, 13, 4, 2, 'N'); rect(9, 13, 4, 2, 'N');
      rect(2, 14, 4, 2, 'k'); rect(10, 14, 4, 2, 'k');
      rect(1, 4, 2, 1, 't'); rect(13, 5, 2, 1, 't');
      break;
    case 'zoom':
      clear();
      rect(5, 2, 6, 1, 'B'); rect(3, 3, 10, 2, 'B');
      rect(2, 5, 12, 5, 'B'); rect(3, 10, 10, 2, 'B');
      rect(5, 12, 6, 1, 'B'); rect(4, 5, 8, 5, 'b');
      rect(5, 5, 3, 2, '#'); rect(7, 6, 2, 4, 'k');
      rect(6, 7, 4, 2, 'k'); rect(11, 11, 3, 3, 'B');
      rect(13, 13, 2, 2, 'b');
      break;
    case 'elytraFlight':
      clear();
      rect(1, 3, 4, 3, 'B'); rect(11, 3, 4, 3, 'B');
      rect(1, 6, 5, 4, 'b'); rect(10, 6, 5, 4, 'b');
      rect(3, 10, 4, 2, 'B'); rect(9, 10, 4, 2, 'B');
      rect(6, 7, 4, 6, '#'); rect(7, 13, 2, 2, 'N');
      rect(2, 4, 2, 1, '#'); rect(12, 4, 2, 1, '#');
      rect(4, 8, 2, 1, 'B'); rect(10, 8, 2, 1, 'B');
      break;
    case 'freecam':
      clear();
      rect(5, 1, 6, 2, 'V'); rect(3, 3, 10, 2, 'V');
      rect(2, 5, 12, 7, 'V'); rect(3, 12, 10, 2, 'V');
      rect(4, 5, 8, 7, 'v'); rect(5, 6, 6, 5, 'B');
      rect(6, 7, 4, 3, 'b'); rect(7, 8, 2, 1, '#');
      rect(0, 8, 2, 1, 't'); rect(14, 8, 2, 1, 't');
      break;
    case 'freelook':
      clear();
      rect(5, 3, 6, 1, 'B'); rect(3, 4, 10, 2, 'B');
      rect(1, 6, 14, 4, 'B'); rect(3, 10, 10, 2, 'B');
      rect(5, 12, 6, 1, 'B'); rect(3, 6, 10, 4, 'b');
      rect(6, 5, 4, 6, 'k'); rect(7, 6, 2, 4, 't');
      rect(7, 6, 1, 1, '#'); rect(1, 10, 2, 1, '-');
      rect(13, 10, 2, 1, '-');
      break;
    case 'autoRespawn':
      clear();
      rect(5, 2, 6, 1, 'G'); rect(3, 3, 10, 2, 'G');
      rect(2, 5, 12, 6, 'G'); rect(3, 11, 9, 2, 'G');
      rect(5, 13, 6, 1, 'G'); rect(4, 5, 8, 6, 'g');
      rect(5, 6, 2, 2, 'R'); rect(9, 6, 2, 2, 'R');
      rect(5, 8, 6, 2, 'r'); rect(7, 10, 2, 1, 'R');
      rect(12, 10, 3, 2, 'g'); rect(13, 12, 2, 2, 'G');
      break;
    case 'rhythmParkour':
      clear();
      rect(0, 13, 16, 2, 'G'); rect(2, 10, 5, 3, 'G');
      rect(6, 7, 5, 3, 'g'); rect(10, 4, 5, 3, 'g');
      rect(11, 2, 3, 2, 'y'); rect(12, 0, 2, 2, 'Y');
      rect(2, 9, 3, 1, 't'); rect(6, 6, 3, 1, 't');
      rect(10, 3, 3, 1, '#'); rect(1, 15, 15, 1, 'k');
      break;
    case 'startupAnimation':
      clear();
      rect(7, 0, 2, 16, 'R'); rect(0, 7, 16, 2, 'R');
      rect(3, 3, 10, 10, 'r'); rect(5, 5, 6, 6, 'y');
      rect(7, 2, 2, 12, '#'); rect(2, 7, 12, 2, '#');
      rect(7, 6, 2, 4, 'y'); rect(6, 7, 4, 2, 'y');
      rect(2, 2, 1, 1, 'o'); rect(13, 3, 1, 1, 'o');
      rect(3, 13, 1, 1, 'O'); rect(12, 12, 1, 1, 'O');
      break;
    case 'about':
      clear();
      rect(5, 1, 6, 1, 'Y'); rect(3, 2, 10, 2, 'Y');
      rect(2, 4, 12, 8, 'Y'); rect(3, 12, 10, 2, 'Y'); rect(5, 14, 6, 1, 'Y');
      rect(3, 4, 10, 8, 'y'); rect(4, 12, 8, 1, 'y');
      rect(7, 4, 2, 2, '#'); rect(7, 7, 2, 5, '#'); rect(6, 11, 4, 1, '#');
      break;
    case 'antiAfk':
      clear();
      rect(5, 1, 6, 1, 'Y'); rect(3, 2, 10, 2, 'Y');
      rect(2, 4, 12, 8, 'Y'); rect(3, 12, 10, 2, 'Y'); rect(5, 14, 6, 1, 'Y');
      rect(3, 4, 10, 8, 'k'); rect(4, 5, 8, 6, 'y');
      rect(7, 4, 2, 5, '#'); rect(8, 8, 4, 2, '#');
      rect(13, 3, 2, 2, 'g'); rect(14, 5, 1, 2, 'G');
      break;
    case 'supportAds':
      clear();
      rect(2, 3, 12, 11, 'Y'); rect(3, 4, 10, 9, 'y');
      rect(5, 1, 6, 2, 'Y'); rect(7, 0, 2, 1, '#');
      rect(6, 5, 4, 2, '#'); rect(5, 7, 2, 4, '#');
      rect(9, 7, 2, 4, '#'); rect(6, 9, 4, 2, '#');
      rect(11, 4, 1, 2, 'O'); rect(4, 12, 8, 1, 'O');
      break;
    case 'classicTitle':
      clear();
      rect(1, 3, 14, 10, 'Y'); rect(2, 4, 12, 8, 'y');
      rect(0, 5, 2, 6, 'O'); rect(14, 5, 2, 6, 'O');
      rect(4, 5, 8, 2, '#'); rect(7, 6, 2, 6, '#');
      rect(5, 1, 6, 2, 'Y'); rect(6, 2, 4, 1, '#');
      break;
    case 'cosmetics':
      clear();
      rect(4, 2, 8, 2, 'P'); rect(2, 4, 12, 3, 'P');
      rect(1, 6, 4, 4, 'p'); rect(11, 6, 4, 4, 'p');
      rect(4, 5, 8, 9, 'p'); rect(5, 13, 6, 2, 'P');
      rect(6, 3, 4, 2, 'k'); rect(7, 4, 2, 2, '#');
      rect(7, 7, 2, 4, '#'); rect(6, 8, 4, 2, '#');
      break;
    case 'chat':
      clear();
      rect(2, 2, 12, 10, 'B'); rect(3, 3, 10, 8, 'b');
      rect(3, 12, 4, 2, 'B'); rect(2, 14, 2, 1, 'B');
      rect(4, 6, 2, 2, '#'); rect(7, 6, 2, 2, '#');
      rect(10, 6, 2, 2, '#'); rect(4, 3, 8, 1, '+');
      break;
    case 'clientChat':
      clear();
      rect(2, 2, 12, 10, 'B'); rect(3, 3, 10, 8, 'b');
      rect(3, 12, 4, 2, 'B'); rect(2, 14, 2, 1, 'B');
      rect(5, 5, 2, 4, '#'); rect(7, 7, 2, 2, '#');
      rect(9, 5, 2, 4, '#'); rect(11, 3, 2, 2, 'y');
      break;
    case 'clientChatMentions':
      clear();
      rect(2, 2, 12, 10, 'B'); rect(3, 3, 10, 8, 'b');
      rect(3, 12, 4, 2, 'B'); rect(2, 14, 2, 1, 'B');
      rect(6, 5, 5, 1, 'y'); rect(5, 6, 1, 4, 'y');
      rect(7, 7, 2, 2, 'Y'); rect(10, 6, 1, 4, 'y');
      rect(6, 10, 5, 1, 'y'); rect(11, 9, 2, 1, 'y');
      break;
    case 'chatMemes':
      clear();
      rect(3, 2, 10, 1, 'Y'); rect(2, 3, 12, 10, 'Y');
      rect(3, 4, 10, 8, 'y'); rect(5, 6, 2, 2, 'k');
      rect(10, 6, 2, 2, 'k'); rect(5, 9, 1, 2, 'O');
      rect(10, 9, 1, 2, 'O'); rect(6, 11, 4, 1, 'O');
      rect(4, 13, 8, 1, 'Y');
      break;
    case 'gifChat':
      clear();
      rect(1, 2, 14, 12, 'P'); rect(2, 3, 12, 10, 'p');
      rect(3, 4, 2, 2, 'k'); rect(3, 10, 2, 2, 'k');
      rect(11, 4, 2, 2, 'k'); rect(11, 10, 2, 2, 'k');
      rect(5, 6, 6, 5, 'b'); rect(7, 7, 2, 3, '#');
      rect(5, 14, 6, 1, 'P');
      break;
    case 'coordinates':
      clear();
      rect(5, 1, 6, 2, 'B'); rect(3, 3, 10, 2, 'B');
      rect(2, 5, 12, 6, 'B'); rect(3, 11, 10, 2, 'B');
      rect(5, 13, 6, 1, 'B'); rect(3, 5, 10, 6, 'b');
      rect(7, 3, 2, 10, '#'); rect(3, 7, 10, 2, '#');
      rect(6, 6, 4, 4, 'O'); rect(7, 7, 2, 2, 'o');
      break;
    case 'healthNameTags':
      clear();
      rect(2, 2, 5, 2, 'R'); rect(9, 2, 5, 2, 'R');
      rect(1, 4, 14, 4, 'R'); rect(2, 8, 12, 2, 'R');
      rect(4, 10, 8, 2, 'R'); rect(6, 12, 4, 2, 'R');
      rect(2, 4, 12, 4, 'r'); rect(4, 8, 8, 2, 'r');
      rect(5, 14, 6, 1, 'k'); rect(6, 14, 4, 1, 'g');
      break;
    case 'distanceNameTags':
      clear();
      rect(2, 2, 12, 8, 'B'); rect(3, 3, 10, 6, 'b');
      rect(4, 5, 2, 2, '#'); rect(7, 4, 2, 4, '#');
      rect(10, 5, 2, 2, '#'); rect(1, 12, 14, 2, 'Y');
      rect(3, 12, 1, 2, '#'); rect(6, 12, 1, 1, '#');
      rect(9, 12, 1, 2, '#'); rect(12, 12, 1, 1, '#');
      break;
    case 'render':
      clear();
      rect(5, 3, 6, 1, 'V'); rect(3, 4, 10, 2, 'V');
      rect(1, 6, 14, 4, 'V'); rect(3, 10, 10, 2, 'V');
      rect(5, 12, 6, 1, 'V'); rect(3, 6, 10, 4, 'v');
      rect(5, 5, 6, 6, 'k'); rect(6, 5, 4, 6, 'y');
      rect(7, 6, 2, 4, 'Y'); rect(7, 6, 1, 1, '#');
      break;
    case 'shaders':
      clear();
      rect(2, 2, 10, 10, 'V'); rect(3, 3, 8, 8, 'v');
      rect(5, 5, 8, 8, 'B'); rect(6, 6, 6, 6, 'b');
      rect(8, 8, 6, 6, 'T'); rect(9, 9, 4, 4, 't');
      rect(4, 4, 3, 1, '#'); rect(7, 7, 3, 1, '#');
      break;
    case 'guiPatch':
      clear();
      rect(1, 2, 14, 12, 'k'); rect(2, 3, 12, 10, 'r');
      rect(2, 3, 12, 2, 'R'); rect(3, 4, 1, 1, '#');
      rect(5, 4, 1, 1, 'y'); rect(7, 4, 1, 1, 'b');
      rect(4, 7, 8, 4, '#'); rect(5, 8, 6, 2, 'B');
      rect(7, 7, 2, 4, 'k'); rect(6, 8, 4, 2, 'k');
      break;
    case 'cameraOverhaul':
      clear();
      rect(2, 4, 12, 10, 'k'); rect(3, 5, 10, 8, '+');
      rect(5, 2, 6, 2, '-'); rect(6, 1, 4, 1, '+');
      rect(5, 6, 6, 6, 'B'); rect(6, 7, 4, 4, 'b');
      rect(7, 8, 2, 2, 'k'); rect(11, 6, 1, 1, 'r');
      break;
    case 'blockHighlight':
      clear();
      rect(4, 2, 8, 2, 't'); rect(2, 4, 2, 8, 't');
      rect(12, 4, 2, 8, 'T'); rect(4, 12, 8, 2, 'T');
      rect(4, 4, 8, 1, 't'); rect(4, 11, 8, 1, 'T');
      rect(7, 5, 2, 6, 't'); rect(5, 6, 6, 1, 't');
      rect(5, 9, 6, 1, 'T');
      break;
    case 'dynamicCrosshair':
      clear();
      rect(7, 1, 2, 4, 'g'); rect(7, 11, 2, 4, 'G');
      rect(1, 7, 4, 2, 'g'); rect(11, 7, 4, 2, 'G');
      rect(6, 6, 4, 4, 'R'); rect(7, 7, 2, 2, 'r');
      rect(4, 4, 1, 1, '#'); rect(11, 11, 1, 1, '#');
      break;
    case 'noWeather':
      clear();
      rect(5, 3, 5, 3, 'B'); rect(3, 5, 10, 2, 'B');
      rect(2, 7, 12, 3, 'B'); rect(3, 10, 10, 1, 'B');
      rect(4, 8, 8, 2, 'b'); rect(4, 12, 2, 2, 'b');
      rect(8, 12, 2, 2, 'b'); rect(12, 12, 2, 2, 'b');
      for (let i = 1; i < 15; i++) rect(i, 15 - i, 2, 1, 'r');
      break;
    case 'waypoints':
      clear();
      rect(5, 1, 6, 2, 'O'); rect(3, 3, 10, 2, 'O');
      rect(2, 5, 12, 5, 'O'); rect(3, 10, 10, 2, 'O');
      rect(5, 12, 6, 2, 'O'); rect(7, 14, 2, 2, 'O');
      rect(4, 5, 8, 5, 'o'); rect(6, 6, 4, 3, '#');
      rect(7, 7, 2, 1, 'Y');
      break;
    case 'pingCounter':
      clear();
      rect(2, 3, 12, 1, 'B'); rect(1, 4, 2, 2, 'B');
      rect(13, 4, 2, 2, 'B'); rect(4, 6, 8, 1, 'b');
      rect(3, 7, 2, 2, 'b'); rect(11, 7, 2, 2, 'b');
      rect(6, 9, 4, 1, '#'); rect(5, 10, 2, 2, '#');
      rect(9, 10, 2, 2, '#'); rect(7, 13, 2, 2, 'y');
      break;
    case 'leafWind':
      clear();
      rect(9, 2, 4, 2, 'G'); rect(7, 4, 7, 3, 'G');
      rect(5, 7, 8, 3, 'G'); rect(6, 10, 5, 2, 'G');
      rect(8, 4, 4, 5, 'g'); rect(6, 8, 4, 2, 'g');
      rect(3, 11, 7, 1, 't'); rect(1, 13, 9, 1, 't');
      rect(1, 9, 3, 1, 't'); rect(4, 14, 4, 1, 'T');
      break;
    case 'waterSplash':
      clear();
      rect(7, 1, 2, 4, 'b'); rect(4, 5, 2, 2, 'b');
      rect(10, 5, 2, 2, 'b'); rect(2, 8, 2, 2, 'b');
      rect(12, 8, 2, 2, 'b'); rect(5, 8, 6, 3, 'b');
      rect(3, 11, 10, 2, 'B'); rect(5, 13, 6, 1, 'B');
      rect(7, 7, 2, 2, '#'); rect(1, 7, 1, 1, 'b');
      rect(14, 7, 1, 1, 'b');
      break;
    case 'handSway':
      clear();
      rect(4, 1, 2, 7, 'N'); rect(5, 1, 1, 6, 'n');
      rect(7, 0, 2, 8, 'N'); rect(8, 1, 1, 6, 'n');
      rect(10, 2, 2, 7, 'N'); rect(11, 3, 1, 5, 'n');
      rect(2, 7, 2, 6, 'N'); rect(3, 8, 1, 4, 'n');
      rect(4, 7, 9, 6, 'n'); rect(5, 12, 7, 2, 'N');
      rect(7, 14, 4, 2, 'B'); rect(5, 8, 1, 4, '#');
      break;
    case 'titanTiny':
      clear();
      rect(1, 2, 6, 5, 'B'); rect(2, 3, 4, 3, 'b');
      rect(1, 7, 6, 6, 'B'); rect(0, 8, 1, 4, 'B');
      rect(7, 8, 1, 4, 'B'); rect(2, 13, 2, 3, 'k');
      rect(5, 13, 2, 3, 'k'); rect(2, 5, 1, 1, '#');
      rect(5, 5, 1, 1, '#');
      rect(11, 8, 3, 2, 'O'); rect(10, 10, 5, 4, 'o');
      rect(11, 14, 1, 2, 'O'); rect(13, 14, 1, 2, 'O');
      rect(11, 9, 1, 1, '#');
      break;
    case 'rebrand':
      clear();
      rect(2, 2, 9, 3, 'B'); rect(1, 5, 10, 5, 'b');
      rect(2, 10, 9, 3, 'B'); rect(5, 3, 3, 9, '#');
      rect(9, 5, 5, 3, 'Y'); rect(10, 8, 4, 4, 'y');
      rect(11, 4, 2, 2, '#'); rect(11, 10, 2, 2, 'O');
      break;
    default:
      break;
  }
  return art;
}

function makePotatoArt() {
  const art = Array.from({ length: 32 }, () => Array(32).fill('.'));
  const spans = [
    [11, 19], [8, 21], [6, 23], [5, 25], [4, 26], [3, 27],
    [3, 28], [2, 28], [2, 29], [2, 29], [3, 29], [3, 28],
    [2, 28], [3, 28], [3, 27], [4, 27], [4, 26], [5, 25],
    [6, 24], [7, 23], [9, 21], [11, 19]
  ];
  for (let row = 0; row < spans.length; row++) {
    const y = row + 5;
    const [left, right] = spans[row];
    for (let x = left; x <= right; x++) {
      art[y][x] = x === left || x === right || row === 0 || row === spans.length - 1
        ? 'd' : y >= 22 || x >= right - 3 ? 'D' : x <= left + 4 || y <= 9 ? 'M' : 'm';
    }
  }
  const mark = (x, y, symbol) => { art[y][x] = symbol; };
  for (const [x, y] of [[12, 8], [14, 7], [15, 8], [17, 9], [9, 11], [11, 12],
    [7, 15], [9, 17], [12, 14], [13, 11], [16, 12], [18, 11]]) mark(x, y, 'f');
  for (const [x, y] of [[8, 10], [20, 11], [24, 13], [10, 18], [17, 16],
    [22, 19], [7, 22], [14, 23], [19, 24], [25, 21]]) mark(x, y, 's');
  for (const [x, y] of [[9, 10], [21, 11], [18, 16], [23, 19], [15, 23]]) mark(x, y, 'D');
  art[6][10] = 'f'; art[8][7] = 'M'; art[10][5] = 'f';
  return art;
}

function encodeIcon(name, rows) {
  const art = name === 'potato' ? makePotatoArt() : makeArt(name, rows);
  const pixelScale = name === 'potato' ? 1 : scale;
  const width = art.length * pixelScale;
  const height = width;
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  const symbolAt = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return '.';
    return art[Math.floor(y / pixelScale)][Math.floor(x / pixelScale)];
  };

  for (let y = 0; y < height; y++) {
    const line = y * (1 + width * 4);
    for (let x = 0; x < width; x++) {
      const symbol = symbolAt(x, y);
      const pixel = rgba(symbol);
      if (!pixel[3]) {
        const around = [[0, -1], [-1, 0], [1, 0], [0, 1]];
        if (around.some(([dx, dy]) => symbolAt(x + dx, y + dy) !== '.')) {
          const outline = rgba(name === 'potato' ? 'd' : 'k');
          for (let channel = 0; channel < 4; channel++) pixel[channel] = outline[channel];
        }
      } else if (name !== 'potato') {
        const above = symbolAt(x, y - 1);
        const below = symbolAt(x, y + 1);
        const left = symbolAt(x - 1, y);
        const right = symbolAt(x + 1, y);
        // Hard one-pixel facets like the Voice Chat assets; no antialiasing.
        const offset = above !== symbol ? 18 : left !== symbol ? 10
          : below !== symbol ? -16 : right !== symbol ? -8 : 0;
        for (let channel = 0; channel < 3; channel++) {
          pixel[channel] = Math.max(0, Math.min(255, pixel[channel] + offset));
        }
      }
      for (let channel = 0; channel < 4; channel++) {
        scanlines[line + 1 + x * 4 + channel] = pixel[channel];
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // RGBA, 8 bits per channel
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

for (const [name, rows] of Object.entries(icons)) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error(`Unsafe icon name: ${name}`);
  // PatPat is a custom drawing, not a generic module icon. Keep its original PNG.
  if (name === 'patPat') continue;
  const target = path.resolve(outputDir, `${name}.png`);
  if (!target.startsWith(outputDir + path.sep)) throw new Error(`Unsafe icon target: ${target}`);
  fs.writeFileSync(target, encodeIcon(name, rows));
}
const potatoTarget = path.resolve(outputDir, 'potato.png');
if (!potatoTarget.startsWith(outputDir + path.sep)) throw new Error(`Unsafe icon target: ${potatoTarget}`);
fs.writeFileSync(potatoTarget, encodeIcon('potato'));

// Remove only duplicates created by the previous version of this generator.
for (const name of Object.keys(icons)) {
  const stale = path.resolve(outputDir, `${name}-pixel.png`);
  if (!stale.startsWith(outputDir + path.sep)) throw new Error(`Unsafe icon target: ${stale}`);
  if (fs.existsSync(stale)) fs.unlinkSync(stale);
}

console.log(`Generated ${Object.keys(icons).length} PNG icons in ${outputDir}; PatPat unchanged`);
