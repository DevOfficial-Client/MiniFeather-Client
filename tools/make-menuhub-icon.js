#!/usr/bin/env node
// genera assets/ui/menuHub/00.png: el icono de ventanas del hub del menú.
// mismo encoder png minimalista que make-horror-icon.js.
// uso: node tools/make-menuhub-icon.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// paleta idéntica a PIXEL_PALETTE del panel: el icono es de la misma casa
const PALETTE = {
    '.': [0, 0, 0, 0],
    'k': [28, 36, 48, 255],      // 1c2430 — marco
    'y': [246, 211, 108, 255],   // f6d36c — ventanas cálidas
    'Y': [174, 125, 54, 255],    // ae7d36
    'b': [97, 216, 245, 255],    // 61d8f5 — ventanas frías
    'B': [49, 124, 164, 255]     // 317ca4
};

// el grid 8x8 de MF_PIXEL_ICONS.menuHub, escala x4 -> 32x32
const BASE = [
    '.kkkkkk.',
    'kyykkbbk',
    'kyykkbbk',
    'kkkkkkkk',
    'kbbkkyyk',
    'kbbkkyyk',
    '.kkkkkk.',
    '........'
];
const SCALE = 4;

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
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return out;
}

function pngFromGrid(grid) {
    const w = grid[0].length * SCALE, h = grid.length * SCALE;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    let o = 0;
    for (let y = 0; y < h; y++) {
        raw[o++] = 0;
        for (let x = 0; x < w; x++) {
            const c = PALETTE[grid[Math.floor(y / SCALE)][Math.floor(x / SCALE)]] || [0, 0, 0, 0];
            raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; raw[o++] = c[3];
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6; // rgba
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

const out = path.resolve(__dirname, '..', 'assets', 'ui', 'menuHub');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, '00.png'), pngFromGrid(BASE));
console.log('[make-menuhub-icon] assets/ui/menuHub/00.png listo');
