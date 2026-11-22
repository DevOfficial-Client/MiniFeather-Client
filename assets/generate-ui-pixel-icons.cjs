const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { drawings } = require('./ui-icon-art.cjs');

const SIZE = 64;
const SCALE = 2;
const ROOT = path.join(__dirname, 'ui');
const PANEL = fs.readFileSync(path.join(__dirname, '../src/UI/ClientPanel.js'), 'utf8');
const readNames = name => {
  const list = PANEL.match(new RegExp('const ' + name + ' = Object\\.freeze\\((\\[[\\s\\S]*?\\])\\);'));
  if (!list) throw new Error('Missing panel icon list: ' + name);
  return [...list[1].matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)].map(match => match[1]);
};

function canvas() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const colors = new Map();
  function dot(x, y, color) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const index = (y * SIZE + x) * 4;
    if (color === null) {
      pixels.fill(0, index, index + 4);
      return;
    }
    if (!colors.has(color)) {
      if (!/^#[\da-f]{6}$/i.test(color)) throw new Error('Invalid pixel color: ' + color);
      colors.set(color, Number.parseInt(color.slice(1), 16));
    }
    pixels.writeUInt32BE((colors.get(color) * 256 + 255) >>> 0, index);
  }
  function rect(x, y, width, height, color) {
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) dot(col, row, color);
    }
  }
  function poly(points, color) {
    const left = Math.min(...points.map(point => point[0]));
    const right = Math.max(...points.map(point => point[0]));
    const top = Math.min(...points.map(point => point[1]));
    const bottom = Math.max(...points.map(point => point[1]));
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [ax, ay] = points[i], [bx, by] = points[j];
          if ((ay > y + .5) !== (by > y + .5) &&
              x + .5 < ax + (bx - ax) * (y + .5 - ay) / (by - ay)) inside = !inside;
        }
        if (inside) dot(x, y, color);
      }
    }
  }
  function line(points, color, width = 1) {
    const half = Math.floor((width - 1) / 2);
    for (let i = 1; i < points.length; i++) {
      let [x, y] = points[i - 1];
      const [endX, endY] = points[i];
      const dx = Math.abs(endX - x), dy = -Math.abs(endY - y);
      const sx = Math.sign(endX - x), sy = Math.sign(endY - y);
      let error = dx + dy;
      while (true) {
        rect(x - half, y - half, width, width, color);
        if (x === endX && y === endY) break;
        const twice = 2 * error;
        if (twice >= dy) { error += dy; x += sx; }
        if (twice <= dx) { error += dx; y += sy; }
      }
    }
  }
  function disc(cx, cy, radius, color) {
    for (let y = cy - radius; y < cy + radius; y++) {
      for (let x = cx - radius; x < cx + radius; x++) {
        if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 < radius ** 2) dot(x, y, color);
      }
    }
  }
  return {
    pixels,
    dot: (x,y,c) => rect(x*SCALE,y*SCALE,SCALE,SCALE,c),
    rect: (x,y,w,h,c) => rect(x*SCALE,y*SCALE,w*SCALE,h*SCALE,c),
    poly: (points,c) => poly(points.map(([x,y]) => [x*SCALE,y*SCALE]),c),
    line: (points,c,w=1) => line(points.map(([x,y]) => [x*SCALE,y*SCALE]),c,w*SCALE),
    disc: (x,y,r,c) => disc(x*SCALE,y*SCALE,r*SCALE,c)
  };
}

function chunk(type, data) {
  const bytes = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4), footer = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  footer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, bytes, footer]);
}

function encodePng(pixels) {
  const stride = SIZE * 4;
  const raw = Buffer.alloc(SIZE * (stride + 1));
  for (let y = 0; y < SIZE; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function drawIcon(name, frame = 0) {
  if (!Object.hasOwn(drawings, name)) throw new Error('No drawing for ' + name);
  const art = canvas();
  drawings[name](art, frame);
  return encodePng(art.pixels);
}

function generate({ animatedOnly = false, names = [] } = {}) {
  const animated = new Set(readNames('MF_ANIMATED_PIXEL_ICONS'));
  const registered = readNames('MF_PIXEL_ICON_NAMES');
  for (const name of [...registered.filter(name => name !== 'patPat'), ...animated]) {
    if (!Object.hasOwn(drawings, name)) throw new Error('No drawing for ' + name);
  }
  const selection = names.length ? names : animatedOnly ? [...animated] : Object.keys(drawings);
  for (const name of selection) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name) || !Object.hasOwn(drawings, name)) {
      throw new Error('Unknown panel icon: ' + name);
    }
    const folder = path.join(ROOT, name === 'headLag' ? 'headlag' : name);
    fs.mkdirSync(folder, { recursive: true });
    const frameCount = animated.has(name) ? 6 : 1;
    for (let frame = animatedOnly ? 1 : 0; frame < frameCount; frame++) {
      fs.writeFileSync(path.join(folder, '0' + frame + '.png'), drawIcon(name, frame));
    }
  }
}

module.exports = { drawIcon, generate };
if (require.main === module) generate({ names: process.argv.slice(2) });
