// genera los 6 frames (32x32 rgba) del icono animado de autoReconnect:
// un aro que persigue su propio punto. como nosotros con los bugs.
// uso: node tools/make-auto-reconnect-icons.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const PALETTE = {
    g: [129, 217, 133, 255],
    G: [54, 124, 89, 255]
};

const BASE = [
    '..gggg..',
    '.g....g.',
    'g......g',
    'g......g',
    'g......g',
    'g......g',
    '.g....g.',
    '..gggg..'
];

// recorrido del aro en sentido horario (fila, columna). el aro nunca descansa.
const RING = [
    [0, 3], [0, 4], [0, 5], [1, 6], [2, 7], [3, 7], [4, 7], [5, 6],
    [6, 6], [7, 5], [7, 4], [7, 3], [7, 2], [6, 1], [5, 0], [4, 0],
    [3, 0], [2, 0], [1, 1], [0, 2]
];

function frame(f) {
    const grid = BASE.map(row => row.split(''));
    const head = Math.round(f * RING.length / 6) % RING.length;
    grid[RING[head][0]][RING[head][1]] = 'G';
    const tail = (head - 2 + RING.length) % RING.length;
    grid[RING[tail][0]][RING[tail][1]] = '.';
    return grid.map(row => row.join(''));
}

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buffer) {
    let c = 0xffffffff;
    for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

function png(width, height, rgba) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // RGBA
    const raw = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        raw[y * (1 + width * 4)] = 0; // filter: none
        rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
    }
    return Buffer.concat([
        signature,
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

const outDir = path.join(__dirname, '..', 'assets', 'ui', 'autoReconnect');
fs.mkdirSync(outDir, { recursive: true });

for (let f = 0; f < 6; f++) {
    const map = frame(f);
    const rgba = Buffer.alloc(32 * 32 * 4);
    for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
            const cell = PALETTE[map[Math.floor(y / 4)][Math.floor(x / 4)]] || [0, 0, 0, 0];
            const i = (y * 32 + x) * 4;
            rgba[i] = cell[0];
            rgba[i + 1] = cell[1];
            rgba[i + 2] = cell[2];
            rgba[i + 3] = cell[3];
        }
    }
    fs.writeFileSync(path.join(outDir, `0${f}.png`), png(32, 32, rgba));
}
console.log('6 frames written to', outDir);
