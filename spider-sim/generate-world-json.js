// Generador one-off: produce assets/garden/world.json desde el mundo real
// (Anvil .mca) para que la extensión no necesite el servidor local.
// Uso: node spider-sim/generate-world-json.js
'use strict';
const path = require('path');
const fs = require('fs');

const { World } = require('./src/mcworld');

const WORLD_DIR = path.join(__dirname, '..', 'spider-garden-e201', 'spider-garden');
const OUT_FILE = path.join(__dirname, '..', 'assets', 'garden', 'world.json');

const world = new World(WORLD_DIR);

// spawn desde level.dat
const { readNBT } = require('./src/mcworld');
let spawn = { x: 0, y: 64, z: 0 };
try {
  const level = readNBT(path.join(WORLD_DIR, 'level.dat'));
  if (level.Data.SpawnX !== undefined) {
    spawn = { x: level.Data.SpawnX, y: level.Data.SpawnY, z: level.Data.SpawnZ };
  }
} catch (e) {
  console.warn('level.dat:', e.message);
}
console.log('spawn', JSON.stringify(spawn));

// registrar TODAS las regiones
const regionDir = path.join(WORLD_DIR, 'region');
for (const f of fs.readdirSync(regionDir)) {
  const m = /^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(f);
  if (m) world.region(Number(m[1]), Number(m[2]));
}

// ── buildWorldJson (idéntico al que servía el server por HTTP) ──
function buildWorldJson(radius = 48) {
  const t0 = Date.now();
  const paletteList = [];
  const paletteIdx = new Map();
  const flat = [];
  const { minX, maxX, minZ, maxZ } = {
    minX: Math.floor(spawn.x - radius), maxX: Math.ceil(spawn.x + radius),
    minZ: Math.floor(spawn.z - radius), maxZ: Math.ceil(spawn.z + radius),
  };
  const isAir = (x, y, z) => {
    const b = world.getBlock(x, y, z);
    if (!b) return true;
    return b.isPassable;
  };
  for (const [rk, region] of world.regions) {
    if (!region) continue;
    void rk;
    for (let ci = 0; ci < 32; ci++) {
      for (let cj = 0; cj < 32; cj++) {
        if (!region.chunkIndex(ci, cj)) continue;
        const sections = region.loadChunkSections(ci, cj);
        if (!sections) continue;
        const chunkCx = region.baseCx + ci;
        const chunkCz = region.baseCz + cj;
        if (chunkCx * 16 + 15 < minX || chunkCx * 16 > maxX || chunkCz * 16 + 15 < minZ || chunkCz * 16 > maxZ) continue;
        for (const section of sections) {
          const y0 = (section.Y ?? section.y ?? 0) * 16;
          if (y0 > 96 || y0 < -16) continue;
          let blocks = world.sectionBlocks.get(section);
          if (!blocks) {
            const { extractBlocks } = require('./src/mcworld');
            blocks = extractBlocks([section]);
            world.sectionBlocks.set(section, blocks);
          }
          for (const [k, name] of blocks) {
            const [lx, y, lz] = k.split(',').map(Number);
            const x = chunkCx * 16 + lx;
            const z = chunkCz * 16 + lz;
            if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
            if (!isAir(x + 1, y, z) && !isAir(x - 1, y, z) && !isAir(x, y + 1, z)
              && !isAir(x, y - 1, z) && !isAir(x, y, z + 1) && !isAir(x, y, z - 1)) continue;
            let idx = paletteIdx.get(name);
            if (idx === undefined) { idx = paletteList.push(name) - 1; paletteIdx.set(name, idx); }
            flat.push(x, y, z, idx);
          }
        }
      }
    }
  }
  const data = {
    ok: true,
    bounds: { minX, maxX, minZ, maxZ },
    spawn,
    count: flat.length / 4,
    palette: paletteList,
    blocks: flat,
  };
  console.log(`world.json: ${data.count} bloques superficie, ${paletteList.length} tipos, ${Date.now() - t0}ms`);
  return data;
}

const data = buildWorldJson(48);
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(data));
console.log('escrito:', OUT_FILE, (fs.statSync(OUT_FILE).size / 1024).toFixed(1) + ' KB');
