#!/usr/bin/env node
// genera assets/ui/noAuraTrail/00.png y assets/ui/rainbow/00.png (32x32 RGBA).
// mismo encoder png minimalista que make-menuhub-icon.js; rainbow va aquí
// porque su card del panel existía sin icono y el test de pixel-icons lo
// reclama (huérfano preexistente, no del módulo noAuraTrail).
// uso: node tools/make-noauratrail-icon.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// paleta idéntica a PIXEL_PALETTE del panel (las letras que usamos)
const PALETTE = {
    '.': [0, 0, 0, 0],
    'r': [241, 118, 120, 255],   // f17678
    'y': [246, 211, 108, 255],   // f6d36c
    'g': [129, 217, 133, 255],   // 81d985
    'v': [185, 153, 244, 255],   // b999f4
    'V': [102, 80, 154, 255]     // 66509a
};

// los grids 8x8 de MF_PIXEL_ICONS, escala x4 -> 32x32
const GRIDS = {
    noAuraTrail: [
        '...v.r..',
        '..vvv.r.',
        '.vvVvvr.',
        '..vvv.r.',
        '...v..r.',
        '......r.',
        '.....r..',
        '....r...'
    ],
    rainbow: [
        '........',
        '..rygv..',
        '.ry..gv.',
        '.r....v.',
        '.r....v.',
        '.r....v.',
        '.r....v.',
        '........'
    ]
};
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

for (const [name, grid] of Object.entries(GRIDS)) {
    const out = path.resolve(__dirname, '..', 'assets', 'ui', name);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, '00.png'), pngFromGrid(grid));
    console.log(`[make-noauratrail-icon] assets/ui/${name}/00.png listo`);
}
