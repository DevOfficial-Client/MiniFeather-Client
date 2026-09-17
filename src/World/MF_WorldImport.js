(() => {
  'use strict';

  const TAG = '[MF WorldImport]';
  const NBT = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };
  const Y_MIN = -64;
  const Y_MAX = 320;
  const MAX_BLOCKS = 3_000_000;

  function parseNBT(buffer) {
    const view = new DataView(buffer);
    const u8a = new Uint8Array(buffer);
    const p = { v: 0 };

    function readStr() {
      const len = view.getUint16(p.v); p.v += 2;
      let s = '';
      for (let i = 0; i < len; i++) s += String.fromCharCode(u8a[p.v + i]);
      p.v += len;
      return s;
    }

    function payload(type) {
      switch (type) {
        case NBT.BYTE: { const v = view.getInt8(p.v); p.v += 1; return v; }
        case NBT.SHORT: { const v = view.getInt16(p.v); p.v += 2; return v; }
        case NBT.INT: { const v = view.getInt32(p.v); p.v += 4; return v; }
        case NBT.LONG: { const v = view.getBigInt64(p.v); p.v += 8; return v; }
        case NBT.FLOAT: { const v = view.getFloat32(p.v); p.v += 4; return v; }
        case NBT.DOUBLE: { const v = view.getFloat64(p.v); p.v += 8; return v; }
        case NBT.BYTE_ARRAY: {
          const n = view.getInt32(p.v); p.v += 4;
          const out = new Uint8Array(u8a.subarray(p.v, p.v + n)); p.v += n;
          return out;
        }
        case NBT.STRING: return readStr();
        case NBT.LIST: {
          const t = view.getUint8(p.v); p.v += 1;
          const n = view.getInt32(p.v); p.v += 4;
          const out = [];
          if (t === NBT.END) return out;
          for (let i = 0; i < n; i++) out.push(payload(t));
          return out;
        }
        case NBT.COMPOUND: {
          const out = {};
          for (;;) {
            const t = view.getUint8(p.v); p.v += 1;
            if (t === NBT.END) break;
            const name = readStr();
            out[name] = payload(t);
          }
          return out;
        }
        case NBT.INT_ARRAY: {
          const n = view.getInt32(p.v); p.v += 4;
          const out = new Int32Array(n);
          for (let i = 0; i < n; i++) { out[i] = view.getInt32(p.v); p.v += 4; }
          return out;
        }
        case NBT.LONG_ARRAY: {
          const n = view.getInt32(p.v); p.v += 4;
          const out = new BigInt64Array(n);
          for (let i = 0; i < n; i++) { out[i] = view.getBigInt64(p.v); p.v += 8; }
          return out;
        }
        default:
          throw new Error('NBT tag desconocido: ' + type);
      }
    }

    const rootType = view.getUint8(p.v); p.v += 1;
    if (rootType !== NBT.COMPOUND) throw new Error('NBT root no es COMPOUND');
    readStr();
    return payload(NBT.COMPOUND);
  }

  async function decompress(data, format) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  const inflateRaw = (d) => decompress(d, 'deflate');
  const gunzip = (d) => decompress(d, 'gzip');

  function readRegionChunk(buffer, lx, lz) {
    const view = new DataView(buffer);
    const u8a = new Uint8Array(buffer);
    const idx = ((lx & 31) + (lz & 31) * 32) * 4;
    const offset = view.getUint32(idx) >>> 8;
    if (!offset) return null;
    const length = view.getInt32(offset * 4096);
    if (length <= 0) return null;
    const type = u8a[offset * 4096 + 4];
    if (type !== 1 && type !== 2) return null;
    return { data: u8a.subarray(offset * 4096 + 5, offset * 4096 + 4 + length), type };
  }

  async function loadChunkNBT(buffer, lx, lz) {
    const entry = readRegionChunk(buffer, lx, lz);
    if (!entry) return null;
    const data = entry.type === 2 ? await inflateRaw(entry.data) : await gunzip(entry.data);
    const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return parseNBT(copy);
  }

  function bitsAt(longs, index, bits) {
    const bitIndex = index * bits;
    const longIndex = Math.floor(bitIndex / 64);
    const offset = bitIndex % 64;
    const long = longs[longIndex] ?? 0n;
    const mask = (1n << BigInt(bits)) - 1n;
    if (offset + bits <= 64) {
      return Number((long >> BigInt(offset)) & mask);
    }
    const second = longs[longIndex + 1] ?? 0n;
    return Number(((long >> BigInt(offset)) | (second << BigInt(64 - offset))) & mask);
  }

  function toLongs(states) {
    if (states instanceof BigInt64Array) return states;
    const out = new BigInt64Array(states.length);
    for (let i = 0; i < states.length; i++) {
      out[i] = typeof states[i] === 'bigint' ? states[i] : BigInt(Number(states[i]) >>> 0);
    }
    return out;
  }

  function sectionEntries(chunkNBT) {
    const out = [];
    const sections = chunkNBT?.sections || chunkNBT?.Level?.Sections || [];
    for (const section of sections) {
      if (!section) continue;
      const y0 = Number(section.Y ?? section.y ?? 0) * 16;
      if (y0 + 15 < Y_MIN || y0 > Y_MAX) continue;
      const bs = section.block_states || {};
      const palette = (bs.palette || section.Palette || [])
        .map((e) => (typeof e?.Name === 'string' ? e.Name : e?.Name ?? null))
        .filter(Boolean);
      if (!palette.length) continue;
      const states = bs.data || section.BlockStates;
      const bits = Math.max(4, Math.ceil(Math.log2(palette.length)));
      out.push({ y0, palette, longs: states ? toLongs(states) : null, single: palette.length === 1 && !states });
    }
    return out;
  }

  async function regionsToMiniWorld(regionFiles, levelDatEntry, onProgress) {
    const palette = [];
    const paletteIndex = new Map();
    function gi(name) {
      let i = paletteIndex.get(name);
      if (i === undefined) {
        i = palette.length;
        paletteIndex.set(name, i);
        palette.push(name);
      }
      return i;
    }

    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    let spawn = null;
    const allBlocks = [];
    let totalRegions = regionFiles.length;
    let doneRegions = 0;

    if (levelDatEntry) {
      try {
        let raw = levelDatEntry.async ? await levelDatEntry.async('uint8array') : new Uint8Array(await levelDatEntry.arrayBuffer());
        if (raw[0] === 0x1f && raw[1] === 0x8b) raw = await gunzip(raw);
        const nbt = parseNBT(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
        const d = nbt.Data || nbt;
        const sx = Number(d?.SpawnX), sy = Number(d?.SpawnY), sz = Number(d?.SpawnZ);
        if ([sx, sy, sz].every(Number.isFinite)) spawn = { x: sx, y: sy, z: sz };
      } catch (e) {
        console.warn(TAG, 'level.dat ignorado:', e?.message || e);
      }
    }

    for (const file of regionFiles) {
      const buffer = file.async ? await file.async('arraybuffer') : await file.arrayBuffer();
      const baseName = (file.name || '').split('/').pop();
      const m = baseName.match(/r\.(-?\d+)\.(-?\d+)\.mca/);
      if (!m) continue;
      const rx = Number(m[1]), rz = Number(m[2]);
      const view = new DataView(buffer);

      const pending = [];
      for (let lz = 0; lz < 32; lz++) {
        for (let lx = 0; lx < 32; lx++) {
          if ((view.getUint32((lx + lz * 32) * 4) >>> 8) !== 0) pending.push([lx, lz]);
        }
      }

      for (const [lx, lz] of pending) {
        let nbt;
        try {
          nbt = await loadChunkNBT(buffer, lx, lz);
        } catch (e) {
          continue;
        }
        if (!nbt) continue;
        const baseX = (rx * 32 + lx) * 16;
        const baseZ = (rz * 32 + lz) * 16;
        for (const sec of sectionEntries(nbt)) {
          const bits = Math.max(4, Math.ceil(Math.log2(sec.palette.length)));
          if (sec.single) {
            if (sec.palette[0] === 'minecraft:air') continue;
            const pidx = gi(sec.palette[0]);
            for (let y = sec.y0; y < sec.y0 + 16; y++) {
              for (let z = 0; z < 16; z++) {
                for (let x = 0; x < 16; x++) {
                  allBlocks.push(baseX + x, y, baseZ + z, pidx);
                }
              }
            }
          } else if (sec.longs) {
            for (let i = 0; i < 4096; i++) {
              const name = sec.palette[bitsAt(sec.longs, i, bits)];
              if (!name || name === 'minecraft:air') continue;
              allBlocks.push(baseX + (i % 16), sec.y0 + Math.floor(i / 256), baseZ + (Math.floor(i / 16) % 16), gi(name));
            }
          }
          if (allBlocks.length > MAX_BLOCKS * 4) {
            console.warn(TAG, 'límite de bloques alcanzado, truncando');
            allBlocks.length = MAX_BLOCKS * 4;
            break;
          }
        }
        if (allBlocks.length > MAX_BLOCKS * 4) break;
      }

      doneRegions++;
      if (onProgress) onProgress(doneRegions, totalRegions, allBlocks.length / 4);
      await new Promise((r) => setTimeout(r, 0));
    }

    for (let i = 0; i < allBlocks.length; i += 4) {
      const x = allBlocks[i], y = allBlocks[i + 1], z = allBlocks[i + 2];
      if (x < bounds.minX) bounds.minX = x;
      if (x > bounds.maxX) bounds.maxX = x;
      if (y < bounds.minY) bounds.minY = y;
      if (y > bounds.maxY) bounds.maxY = y;
      if (z < bounds.minZ) bounds.minZ = z;
      if (z > bounds.maxZ) bounds.maxZ = z;
    }

    if (!allBlocks.length) throw new Error('No blocks found (empty or unsupported world)');

    if (!spawn) spawn = { x: bounds.minX + 8, y: (bounds.maxY ?? 70) - 8, z: bounds.minZ + 8 };

    return {
      ok: true,
      bounds,
      spawn,
      count: allBlocks.length / 4,
      palette,
      blocks: allBlocks,
    };
  }

  async function importFromFile(file, onProgress) {
    const name = (file.name || '').toLowerCase();

    if (name.endsWith('.mca')) {
      const buffer = await file.arrayBuffer();
      const tmp = { name: file.name, arrayBuffer: async () => buffer };
      return regionsToMiniWorld([tmp], null, onProgress);
    }

    if (name.endsWith('.zip')) {
      if (typeof JSZip === 'undefined') throw new Error('JSZip not loaded');
      const zip = await JSZip.loadAsync(file);
      const regions = [];
      let levelDat = null;
      zip.forEach((path, entry) => {
        if (entry.dir) return;
        const base = path.toLowerCase();
        if (base.endsWith('.mca')) regions.push({ name: path, async: (t) => entry.async(t) });
        else if (base.endsWith('level.dat') && !levelDat) levelDat = { name: path, async: (t) => entry.async(t) };
      });
      if (!regions.length) throw new Error('No .mca region files in zip (Bedrock .mcworld not supported)');
      return regionsToMiniWorld(regions, levelDat, onProgress);
    }

    throw new Error('Unsupported format: use a Java world .zip or a .mca file');
  }

  globalThis.MF_WorldImport = {
    importFromFile,
    regionsToMiniWorld,
    parseNBT,
  };

  void 0;
})();
