// Lector de mundo Minecraft: NBT (gzip) + Anvil .mca + colisiones por heightmap.
// Solo lectura — el simulador no modifica el mundo.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── NBT ───
const TAG = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };

class NBTReader {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
    this.text = buf.toString('latin1');
  }
  u8() { return this.buf[this.pos++]; }
  i8() { const v = this.buf.readInt8(this.pos); this.pos += 1; return v; }
  i16() { const v = this.buf.readInt16BE(this.pos); this.pos += 2; return v; }
  i32() { const v = this.buf.readInt32BE(this.pos); this.pos += 4; return v; }
  i64() { const v = this.buf.readBigInt64BE(this.pos); this.pos += 8; return v; }
  f32() { const v = this.buf.readFloatBE(this.pos); this.pos += 4; return v; }
  f64() { const v = this.buf.readDoubleBE(this.pos); this.pos += 8; return v; }
  str() {
    const len = this.buf.readUInt16BE(this.pos); this.pos += 2;
    const s = this.text.substr(this.pos, len);
    this.pos += len;
    return s;
  }
  payload(type) {
    switch (type) {
      case TAG.BYTE: return this.i8();
      case TAG.SHORT: return this.i16();
      case TAG.INT: return this.i32();
      case TAG.LONG: return this.i64();
      case TAG.FLOAT: return this.f32();
      case TAG.DOUBLE: return this.f64();
      case TAG.BYTE_ARRAY: { const n = this.i32(); const out = new Int8Array(this.buf.buffer, this.buf.byteOffset + this.pos, n); this.pos += n; return out; }
      case TAG.STRING: return this.str();
      case TAG.LIST: {
        const t = this.u8(); const n = this.i32();
        const out = [];
        if (t === TAG.END) return out;
        for (let i = 0; i < n; i++) out.push(this.payload(t));
        return out;
      }
      case TAG.COMPOUND: {
        const out = {};
        for (;;) {
          const t = this.u8();
          if (t === TAG.END) break;
          const name = this.str();
          out[name] = this.payload(t);
        }
        return out;
      }
      case TAG.INT_ARRAY: { const n = this.i32(); const out = new Int32Array(n); for (let i = 0; i < n; i++) out[i] = this.i32(); return out; }
      case TAG.LONG_ARRAY: { const n = this.i32(); const out = []; for (let i = 0; i < n; i++) out.push(this.i64()); return out; }
      default: throw new Error('NBT tag desconocido: ' + type);
    }
  }
  root() {
    const t = this.u8();
    if (t !== TAG.COMPOUND) throw new Error('NBT root no es COMPOUND');
    this.str(); // nombre raíz vacío
    return this.payload(TAG.COMPOUND);
  }
}

function readNBT(file) {
  const raw = fs.readFileSync(file);
  let buf = raw;
  if (raw[0] === 0x1f && raw[1] === 0x8b) buf = zlib.gunzipSync(raw);
  return new NBTReader(buf).root();
}

// ─── Anvil .mca ───
class RegionFile {
  constructor(file) {
    this.file = file;
    this.header = fs.readFileSync(file, { start: 0, end: 8191 });
    this.fd = fs.openSync(file, 'r');
    this.cache = new Map(); // chunkKey → secciones
  }

  chunkIndex(lx, lz) {
    const inRegion = ((lx & 31) + (lz & 31) * 32) * 4;
    const off = this.header.readUInt32BE(inRegion) >>> 8;
    return off === 0 ? null : off;
  }

  loadChunkSections(cx, cz) {
    const key = cx + ',' + cz;
    if (this.cache.has(key)) return this.cache.get(key);
    const off = this.chunkIndex(cx & 31, cz & 31);
    let result = null;
    if (off) {
      const sectorCount = this.header.readUInt8(((cx & 31) + (cz & 31) * 32) * 4 + 3);
      const buf = Buffer.alloc(sectorCount * 4096);
      fs.readSync(this.fd, buf, 0, buf.length, off * 4096);
      const length = buf.readInt32BE(0);
      const type = buf[4];
      let data = buf.subarray(5, 5 + length);
      if (type === 2) data = zlib.inflateSync(data);
      // El root NBT del chunk es el compound del chunk directamente (sin wrapper '')
      const nbt = new NBTReader(data).root();
      result = nbt ? nbt.sections || [] : [];
    }
    this.cache.set(key, result);
    return result;
  }

  close() { fs.closeSync(this.fd); }
}

function extractBlocks(sections) {
  // devuelve Map "y,z,x" → blockName (solo no-air)
  const blocks = new Map();
  if (!sections) return blocks;
  for (const section of sections) {
    if (!section) continue;
    const y0 = (section.Y ?? section.y ?? 0) * 16;
    const blockStates = section.block_states || {};
    const palette = blockStates.palette ? blockStates.palette.map((p) => p.Name) : section.palette?.map((p) => p.Name) || [];
    const states = blockStates.data || section.BlockStates;
    if (!states) continue;
    const bits = Math.max(4, Math.ceil(Math.log2(palette.length || 1)));
    const bitBuffer = states instanceof BigInt64Array ? states : toBigIntArray(states);
    for (let i = 0; i < 4096; i++) {
      const idx = readBitsBE(bitBuffer, i, bits);
      const name = palette[idx];
      if (!name || name === 'minecraft:air') continue;
      const y = y0 + Math.floor(i / 256);
      const z = Math.floor(i / 16) % 16;
      const x = i % 16;
      blocks.set(x + ',' + y + ',' + z, name);
    }
  }
  return blocks;
}

function toBigIntArray(intArr) {
  const out = new BigInt64Array(intArr.length);
  for (let i = 0; i < intArr.length; i++) {
    out[i] = typeof intArr[i] === 'bigint' ? intArr[i] : BigInt(intArr[i] >>> 0);
  }
  return out;
}

function readBitsBE(longs, index, bits) {
  const bitIndex = index * bits;
  const longIndex = Math.floor(bitIndex / 64);
  const offset = bitIndex % 64;
  let value = 0n;
  const long = longs[longIndex] ?? 0n;
  if (offset + bits <= 64) {
    value = (long >> BigInt(offset)) & mask(bits);
  } else {
    const second = longs[longIndex + 1] ?? 0n;
    const firstBits = 64 - offset;
    value = ((long >> BigInt(offset)) | (second << BigInt(firstBits))) & mask(bits);
  }
  return Number(value);
}
function mask(bits) { return (1n << BigInt(bits)) - 1n; }

// bloques no-sólidos para colisión (raycast NEVER + passable)
const NON_SOLID = new Set([
  'minecraft:air', 'minecraft:water', 'minecraft:lava', 'minecraft:short_grass', 'minecraft:grass',
  'minecraft:tall_grass', 'minecraft:fern', 'minecraft:large_fern', 'minecraft:dead_bush',
  'minecraft:dandelion', 'minecraft:poppy', 'minecraft:blue_orchid', 'minecraft:allium',
  'minecraft:azure_bluet', 'minecraft:oxeye_daisy', 'minecraft:cornflower', 'minecraft:lily_of_the_valley',
  'minecraft:torch', 'minecraft:wall_torch', 'minecraft:soul_torch', 'minecraft:ladder',
  'minecraft:rail', 'minecraft:powered_rail', 'minecraft:detector_rail', 'minecraft:activator_rail',
  'minecraft:snow', 'minecraft:light', 'minecraft:structure_void', 'minecraft:sweet_berry_bush',
  'minecraft:cobweb', 'minecraft:vine', 'minecraft:glow_lichen', 'minecraft:oak_sign', 'minecraft:crimson_sign',
]);

// ─── World con raycast ───
class World {
  constructor(worldDir) {
    this.worldDir = worldDir;
    this.regions = new Map(); // "rx,rz" → RegionFile
    this.sectionBlocks = new Map(); // sección NBT → Map de bloques
    this.spawnedEntities = [];
  }

  region(rx, rz) {
    const key = rx + ',' + rz;
    if (!this.regions.has(key)) {
      const file = path.join(this.worldDir, 'region', `r.${rx}.${rz}.mca`);
      const region = fs.existsSync(file) ? new RegionFile(file) : null;
      if (region) {
        // base absoluta de los chunks de esta región (para exportar coords mundo)
        region.baseCx = rx * 32;
        region.baseCz = rz * 32;
      }
      this.regions.set(key, region);
    }
    return this.regions.get(key);
  }

  getBlock(x, y, z) {
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    const cx = bx >> 4, cz = bz >> 4;
    const region = this.region(cx >> 5, cz >> 5);
    if (!region) return null;
    const sections = region.loadChunkSections(cx, cz);
    if (!sections) return null;
    const key = (bx & 15) + ',' + by + ',' + (bz & 15);
    const blocks = this.blocksFor(sections, by >> 4);
    if (!blocks) return null;
    const name = blocks.get(key);
    return name ? { name, isPassable: NON_SOLID.has(name) } : { name: 'minecraft:air', isPassable: true };
  }

  blocksFor(sections, sectionY) {
    for (const s of sections) {
      if ((s.Y ?? s.y ?? 0) === sectionY) {
        // caché por identidad de sección (las secciones ya viven en el caché de RegionFile)
        let blocks = this.sectionBlocks.get(s);
        if (!blocks) {
          blocks = extractBlocks([s]);
          this.sectionBlocks.set(s, blocks);
        }
        return blocks;
      }
    }
    return null;
  }

  // DDA sobre voxels — replica Bukkit rayTraceBlocks(hitPosition en la cara de entrada)
  raycastGround(position, direction, maxDistance) {
    const dirLen = direction.length();
    if (dirLen < 1e-12) return null;
    const dx = direction.x / dirLen, dy = direction.y / dirLen, dz = direction.z / dirLen;
    const ox = position.x, oy = position.y, oz = position.z;

    const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
    const stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

    let bx = Math.floor(ox), by = Math.floor(oy), bz = Math.floor(oz);
    let tMaxX = stepX !== 0 ? intbound(ox, dx) : Infinity;
    let tMaxY = stepY !== 0 ? intbound(oy, dy) : Infinity;
    let tMaxZ = stepZ !== 0 ? intbound(oz, dz) : Infinity;
    let t = 0;

    for (;;) {
      const block = this.getBlock(bx, by, bz);
      if (block && !block.isPassable) {
        // punto exacto de entrada al voxel
        return new (require('./vecmath').Vec)(ox + dx * t, oy + dy * t, oz + dz * t);
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        t = tMaxX; bx += stepX; tMaxX += tDeltaX;
      } else if (tMaxY < tMaxZ) {
        t = tMaxY; by += stepY; tMaxY += tDeltaY;
      } else {
        t = tMaxZ; bz += stepZ; tMaxZ += tDeltaZ;
      }
      if (t > maxDistance) return null;
      if (by < -64 || by > 320) return null;
    }
  }

  isOnGround(position, downVector) {
    return this.raycastGround(position, downVector, 0.001) !== null;
  }

  resolveCollision(position, direction) {
    const dir = direction.clone().normalize();
    const hit = this.raycastGround(position.clone().sub(dir), dir, direction.length());
    if (hit) {
      return { position: hit, offset: hit.clone().sub(position) };
    }
    return null;
  }
}

function intbound(s, ds) {
  // distancia a lo largo del rayo (dir normalizada) hasta el próximo límite de voxel
  if (ds > 0) return (Math.floor(s) + 1 - s) / ds;
  return (s - Math.floor(s)) / -ds; // ds<0; s entero → 0: cruza al voxel previo inmediatamente (como Bukkit)
}

module.exports = { readNBT, World, RegionFile, extractBlocks, NON_SOLID };
