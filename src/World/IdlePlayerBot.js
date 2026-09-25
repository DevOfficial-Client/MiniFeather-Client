(function () {
  'use strict';

  const GLOBAL_KEY = 'MF_IDLE_PLAYER_BOT';
  const COMMAND_EVENT = 'minifeather:idle-player-command';
  const STATE_EVENT = 'minifeather:idle-player-state';
  const MAX_BOTS = 10;
  const MAX_RETRIES = 2;
  const API_PATH = '/auth-api/launch/invite_code';
  const SERVER_DOMAIN = 'coolmathblox.ca';
  const FALLBACK_VERSION = '3.46.229';
  const PROTOCOL_CACHE_KEY = 'minifeather_idle_player_protocol_v1';
  const INPUT_MOVEMENT_CATEGORIES = new Set([
    'eggwars', 'skywars', 'pvp', 'kitpvp', 'oitq', 'duels_bridge'
  ]);
  const COMBINED_CLIENTBOUND_NAMES = Object.freeze({
    4: 'CPacketChangeServers',
    7: 'CPacketConfirmTransaction',
    9: 'CPacketDisconnect',
    20: 'CPacketJoinGame',
    28: 'CPacketPlayerPosLook',
    29: 'CPacketPlayerPosition',
    47: 'CPacketUpdateHealth',
    58: 'CPacketPlayerReconciliation'
  });
  const HANDLED_CLIENTBOUND_NAMES = new Set([
    'ClientBoundCombined', 'CPacketChangeServers', 'CPacketConfirmTransaction',
    'CPacketDisconnect', 'CPacketJoinGame', 'CPacketPlayerPosLook',
    'CPacketPlayerPosition', 'CPacketPlayerReconciliation', 'CPacketUpdateHealth'
  ]);

  // MiniFeather is injected with all_frames because other modules need it, but
  // the idle player must have a single owner. Without this guard an iframe can
  // create a second guest and later tear it down when that frame disappears.
  if (window.top && window.top !== window) return;

  // Packet order from the official client. At connection time the module also
  // reads the current public bundle and refreshes this list when Miniblox moves
  // packet ids without changing the packet schemas used below.
  const FALLBACK_PACKET_NAMES = Object.freeze([
    'CPacketAnimation', 'CPacketBlockAction', 'CPacketBlockUpdate',
    'CPacketChangeServers', 'CPacketChunkData', 'CPacketCloseWindow',
    'CPacketConfirmTransaction', 'CPacketDestroyEntities', 'CPacketDisconnect',
    'CPacketEntityAction', 'CPacketEntityEquipment', 'CPacketEntityMetadata',
    'CPacketEntityPositionAndRotation', 'CPacketEntityRelativePositionAndRotation',
    'CPacketEntityStatus', 'CPacketEntityVelocity', 'CPacketExplosion',
    'CPacketJoinGame', 'CPacketLeaderboard', 'CPacketLocalStorage',
    'CPacketMessage', 'CPacketOpenWindow', 'CPacketParticles', 'CPacketPlayerList',
    'CPacketPlayerPosition', 'CPacketPlayerPosLook', 'CPacketPlayerReconciliation',
    'CPacketPong', 'CPacketRespawn', 'CPacketScoreboard', 'CPacketServerInfo',
    'CPacketSetSlot', 'CPacketSignEditorOpen', 'CPacketSoundEffect',
    'CPacketSpawnEntity', 'CPacketSpawnPlayer', 'CPacketTabComplete',
    'CPacketTitle', 'CPacketUpdate', 'CPacketUpdateHealth',
    'CPacketUpdateLeaderboard', 'CPacketUpdateScoreboard', 'CPacketUpdateSign',
    'CPacketUpdateStatus', 'CPacketWindowItems', 'CPacketWindowProperty',
    'CPacketUseBed', 'CPacketQueueNext', 'CPacketSpawnExperienceOrb',
    'CPacketSetExperience', 'CPacketOpenShop', 'CPacketShopProperties',
    'CPacketEntityProperties', 'CPacketEntityEffect', 'CPacketRemoveEntityEffect',
    'CPacketUpdateCommandBlock', 'CPacketEntityAttach', 'CPacketServerMetadata',
    'CPacketTimeUpdate', 'ClientBoundCombined', 'SPacketAdminAction',
    'SPacketAnalytics', 'SPacketClickWindow', 'SPacketCloseWindow',
    'SPacketConfirmTransaction', 'SPacketEnchantItem', 'SPacketEntityAction',
    'SPacketHeldItemChange', 'SPacketLoginStart', 'SPacketMessage',
    'SPacketOpenShop', 'SPacketPing', 'SPacketPlayerAbilities',
    'SPacketPlayerAction', 'SPacketPlayerPosLook', 'SPacketRespawn',
    'SPacketTabComplete', 'SPacketUpdateSign', 'SPacketUseEntity',
    'SPacketUpdateCommandBlock', 'SPacketQueueNext', 'SPacketPlayerInput',
    'SPacketBreakBlock', 'SPacketClick', 'SPacketCraftItem', 'SPacketPlaceBlock',
    'SPacketRequestChunk', 'SPacketUpdateInventory', 'SPacketUseItem',
    'CPacketScriptData', 'CPacketScriptLog', 'SPacketScriptAction',
    'CPacketPlotsData', 'SPacketPlotsAction', 'CPacketUpdatePlayerHead',
    'CPacketChunkUnchanged', 'SPacketRenameItem', 'SPacketUploadSchematic',
    'CPacketGuideData', 'SPacketGuideAction', 'CPacketBlockBreakAnim',
    'CPacketPlayerListPing', 'CPacketPlayerListDelta', 'CPacketSpectate',
    'CPacketTradeList', 'SPacketSelectTrade', 'CPacketDownloadSchematic',
    'CPacketCollectItem', 'CPacketModContent', 'CPacketDamageIndicator',
    'SPacketEditBook', 'CPacketEmote', 'CPacketApplyRecoil',
    'CPacketScreenFlash', 'CPacketWeather', 'CPacketLightningBolt',
    'SPacketTextPrompt', 'CPacketMachineGui', 'CPacketReplayState',
    'CPacketScriptVersion'
  ]);

  try {
    const previous = globalThis[GLOBAL_KEY];
    const snapshot = previous?.status?.();
    const isLive = snapshot && !['idle', 'error'].includes(snapshot.phase);
    if (isLive && previous?.multiBotVersion === 3) {
      document.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: JSON.stringify(snapshot) }));
      return;
    }
    previous?.destroy?.();
  } catch (_) {}

  const usedGuestNames = new Set();

  function createBotSession(botId, notifyManager) {
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  const state = {
    phase: 'idle',
    message: '',
    error: '',
    socket: null,
    serverId: '',
    requestedUuid: '',
    metricsId: '',
    playerUuid: '',
    playerName: '',
    protocol: null,
    operation: 0,
    manualStop: false,
    joined: false,
    category: '',
    sequence: 0,
    ackId: 0,
    positionKnown: false,
    pos: { x: 0, y: 80, z: 0 },
    yaw: 0,
    pitch: 0,
    onGround: true,
    joinTimeout: 0,
    movementTimer: 0,
    pingTimer: 0,
    analyticsTimer: 0,
    respawnTimer: 0,
    lastConnectAt: 0,
    retryCount: 0,
    retryTarget: 'current',
    retryTimer: 0,
    compressedIgnored: 0,
    brotliBackend: ''
  };

  class Bytes {
    constructor() {
      this.data = [];
    }

    u8(value) {
      this.data.push(Number(value) & 255);
      return this;
    }

    u16(value) {
      return this.u8(value >>> 8).u8(value);
    }

    u32(value) {
      return this.u8(value >>> 24).u8(value >>> 16).u8(value >>> 8).u8(value);
    }

    raw(value) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
      for (const byte of bytes) this.data.push(byte);
      return this;
    }

    float32(value, littleEndian = false) {
      const bytes = new Uint8Array(4);
      new DataView(bytes.buffer).setFloat32(0, Number(value), littleEndian);
      return this.raw(bytes);
    }

    float64(value) {
      const bytes = new Uint8Array(8);
      new DataView(bytes.buffer).setFloat64(0, Number(value), false);
      return this.raw(bytes);
    }

    finish() {
      return Uint8Array.from(this.data);
    }
  }

  function encodeMsgPack(value, out = new Bytes()) {
    if (value === null || value === undefined) return out.u8(0xc0);
    if (value === false) return out.u8(0xc2);
    if (value === true) return out.u8(0xc3);

    if (typeof value === 'number') {
      if (Number.isInteger(value) && value >= 0) {
        if (value < 128) return out.u8(value);
        if (value <= 255) return out.u8(0xcc).u8(value);
        if (value <= 65535) return out.u8(0xcd).u16(value);
        if (value <= 0xffffffff) return out.u8(0xce).u32(value);
      }
      if (Number.isInteger(value) && value < 0) {
        if (value >= -32) return out.u8(256 + value);
        if (value >= -128) return out.u8(0xd0).u8(value);
        if (value >= -32768) return out.u8(0xd1).u16(value & 0xffff);
        if (value >= -2147483648) return out.u8(0xd2).u32(value >>> 0);
      }
      return out.u8(0xcb).float64(value);
    }

    if (typeof value === 'bigint') {
      out.u8(value < 0n ? 0xd3 : 0xcf);
      let unsigned = value < 0n ? BigInt.asUintN(64, value) : value;
      for (let shift = 56n; shift >= 0n; shift -= 8n) out.u8(Number(unsigned >> shift));
      return out;
    }

    if (typeof value === 'string') {
      const bytes = textEncoder.encode(value);
      if (bytes.length < 32) out.u8(0xa0 | bytes.length);
      else if (bytes.length <= 255) out.u8(0xd9).u8(bytes.length);
      else if (bytes.length <= 65535) out.u8(0xda).u16(bytes.length);
      else out.u8(0xdb).u32(bytes.length);
      return out.raw(bytes);
    }

    if (value instanceof Uint8Array || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = value instanceof Uint8Array
        ? value
        : value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      if (bytes.length <= 255) out.u8(0xc4).u8(bytes.length);
      else if (bytes.length <= 65535) out.u8(0xc5).u16(bytes.length);
      else out.u8(0xc6).u32(bytes.length);
      return out.raw(bytes);
    }

    if (Array.isArray(value)) {
      if (value.length < 16) out.u8(0x90 | value.length);
      else if (value.length <= 65535) out.u8(0xdc).u16(value.length);
      else out.u8(0xdd).u32(value.length);
      for (const item of value) encodeMsgPack(item, out);
      return out;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value).filter(([, item]) => item !== undefined);
      if (entries.length < 16) out.u8(0x80 | entries.length);
      else if (entries.length <= 65535) out.u8(0xde).u16(entries.length);
      else out.u8(0xdf).u32(entries.length);
      for (const [key, item] of entries) {
        encodeMsgPack(key, out);
        encodeMsgPack(item, out);
      }
      return out;
    }

    throw new TypeError(`Unsupported MessagePack value: ${typeof value}`);
  }

  class MsgPackReader {
    constructor(value) {
      this.bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
      this.pos = 0;
      this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    }

    need(length) {
      if (this.pos + length > this.bytes.length) throw new RangeError('Truncated MessagePack payload');
    }

    u8() { this.need(1); return this.bytes[this.pos++]; }
    i8() { const n = this.u8(); return n > 127 ? n - 256 : n; }
    u16() { this.need(2); const n = this.view.getUint16(this.pos); this.pos += 2; return n; }
    i16() { this.need(2); const n = this.view.getInt16(this.pos); this.pos += 2; return n; }
    u32() { this.need(4); const n = this.view.getUint32(this.pos); this.pos += 4; return n; }
    i32() { this.need(4); const n = this.view.getInt32(this.pos); this.pos += 4; return n; }
    f32() { this.need(4); const n = this.view.getFloat32(this.pos); this.pos += 4; return n; }
    f64() { this.need(8); const n = this.view.getFloat64(this.pos); this.pos += 8; return n; }

    take(length) {
      this.need(length);
      const output = this.bytes.subarray(this.pos, this.pos + length);
      this.pos += length;
      return output;
    }

    string(length) {
      return textDecoder.decode(this.take(length));
    }

    uint64(signed) {
      const hi = this.u32();
      const lo = this.u32();
      const value = (BigInt(hi) << 32n) | BigInt(lo);
      const normalized = signed ? BigInt.asIntN(64, value) : value;
      return normalized <= BigInt(Number.MAX_SAFE_INTEGER) && normalized >= BigInt(Number.MIN_SAFE_INTEGER)
        ? Number(normalized)
        : normalized;
    }

    read() {
      const marker = this.u8();
      if (marker <= 0x7f) return marker;
      if (marker >= 0xe0) return marker - 256;
      if ((marker & 0xe0) === 0xa0) return this.string(marker & 31);
      if ((marker & 0xf0) === 0x90) return this.array(marker & 15);
      if ((marker & 0xf0) === 0x80) return this.map(marker & 15);
      switch (marker) {
        case 0xc0: return null;
        case 0xc2: return false;
        case 0xc3: return true;
        case 0xc4: return this.take(this.u8());
        case 0xc5: return this.take(this.u16());
        case 0xc6: return this.take(this.u32());
        case 0xca: return this.f32();
        case 0xcb: return this.f64();
        case 0xcc: return this.u8();
        case 0xcd: return this.u16();
        case 0xce: return this.u32();
        case 0xcf: return this.uint64(false);
        case 0xd0: return this.i8();
        case 0xd1: return this.i16();
        case 0xd2: return this.i32();
        case 0xd3: return this.uint64(true);
        case 0xd9: return this.string(this.u8());
        case 0xda: return this.string(this.u16());
        case 0xdb: return this.string(this.u32());
        case 0xdc: return this.array(this.u16());
        case 0xdd: return this.array(this.u32());
        case 0xde: return this.map(this.u16());
        case 0xdf: return this.map(this.u32());
        default: throw new Error(`Unsupported MessagePack marker 0x${marker.toString(16)}`);
      }
    }

    array(length) {
      const value = [];
      for (let i = 0; i < length; i += 1) value.push(this.read());
      return value;
    }

    map(length) {
      const value = {};
      for (let i = 0; i < length; i += 1) value[String(this.read())] = this.read();
      return value;
    }
  }

  function decodeMsgPack(value) {
    return new MsgPackReader(value).read();
  }

  class ProtoWriter {
    constructor() {
      this.out = new Bytes();
    }

    varint(value) {
      let current = typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value)));
      if (current < 0n) current = BigInt.asUintN(64, current);
      while (current > 127n) {
        this.out.u8(Number(current & 127n) | 128);
        current >>= 7n;
      }
      this.out.u8(Number(current));
      return this;
    }

    tag(field, wire) {
      return this.varint((field << 3) | wire);
    }

    uint(field, value) {
      if (!value) return this;
      this.tag(field, 0).varint(value);
      return this;
    }

    int(field, value) {
      if (!value) return this;
      this.tag(field, 0).varint(value);
      return this;
    }

    bool(field, value) {
      if (!value) return this;
      this.tag(field, 0).varint(1);
      return this;
    }

    string(field, value) {
      if (value === undefined || value === null || String(value) === '') return this;
      const bytes = textEncoder.encode(String(value));
      this.tag(field, 2).varint(bytes.length);
      this.out.raw(bytes);
      return this;
    }

    float(field, value) {
      const number = Number(value);
      if (!Number.isFinite(number) || Object.is(number, 0) || Object.is(number, -0)) return this;
      this.tag(field, 5);
      this.out.float32(number, true);
      return this;
    }

    bytes(field, value) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
      this.tag(field, 2).varint(bytes.length);
      this.out.raw(bytes);
      return this;
    }

    message(field, write) {
      const child = new ProtoWriter();
      write(child);
      return this.bytes(field, child.finish());
    }

    finish() {
      return this.out.finish();
    }
  }

  function readVarint(bytes, start) {
    let value = 0n;
    let shift = 0n;
    let pos = start;
    while (pos < bytes.length && shift <= 70n) {
      const byte = BigInt(bytes[pos++]);
      value |= (byte & 127n) << shift;
      if ((byte & 128n) === 0n) return { value, pos };
      shift += 7n;
    }
    throw new RangeError('Invalid protobuf varint');
  }

  function parseProto(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    const fields = new Map();
    let pos = 0;
    while (pos < bytes.length) {
      const tag = readVarint(bytes, pos);
      pos = tag.pos;
      const number = Number(tag.value >> 3n);
      const wire = Number(tag.value & 7n);
      let item;
      if (wire === 0) {
        const result = readVarint(bytes, pos);
        pos = result.pos;
        item = { wire, value: result.value };
      } else if (wire === 1) {
        if (pos + 8 > bytes.length) throw new RangeError('Truncated protobuf fixed64');
        item = { wire, value: bytes.subarray(pos, pos + 8) };
        pos += 8;
      } else if (wire === 2) {
        const result = readVarint(bytes, pos);
        pos = result.pos;
        const length = Number(result.value);
        if (pos + length > bytes.length) throw new RangeError('Truncated protobuf bytes');
        item = { wire, value: bytes.subarray(pos, pos + length) };
        pos += length;
      } else if (wire === 5) {
        if (pos + 4 > bytes.length) throw new RangeError('Truncated protobuf fixed32');
        item = { wire, value: bytes.subarray(pos, pos + 4) };
        pos += 4;
      } else {
        throw new Error(`Unsupported protobuf wire type ${wire}`);
      }
      if (!fields.has(number)) fields.set(number, []);
      fields.get(number).push(item);
    }
    return fields;
  }

  function protoItem(fields, number) {
    return fields.get(number)?.[0] || null;
  }

  function protoUint(fields, number, fallback = 0) {
    const item = protoItem(fields, number);
    return item?.wire === 0 ? Number(item.value) : fallback;
  }

  function protoInt(fields, number, fallback = 0) {
    const item = protoItem(fields, number);
    return item?.wire === 0 ? Number(BigInt.asIntN(32, item.value)) : fallback;
  }

  function protoSint(fields, number, fallback = 0) {
    const item = protoItem(fields, number);
    if (item?.wire !== 0) return fallback;
    const value = item.value;
    return Number((value >> 1n) ^ (-(value & 1n)));
  }

  function protoBool(fields, number, fallback = false) {
    const item = protoItem(fields, number);
    return item?.wire === 0 ? item.value !== 0n : fallback;
  }

  function protoString(fields, number, fallback = '') {
    const item = protoItem(fields, number);
    return item?.wire === 2 ? textDecoder.decode(item.value) : fallback;
  }

  function protoFloat(fields, number, fallback = 0) {
    const item = protoItem(fields, number);
    if (item?.wire !== 5) return fallback;
    return new DataView(item.value.buffer, item.value.byteOffset, 4).getFloat32(0, true);
  }

  function protoMessage(fields, number) {
    const item = protoItem(fields, number);
    return item?.wire === 2 ? parseProto(item.value) : null;
  }

  function seedHash(value) {
    let hash = 1779033703 ^ value.length;
    for (let i = 0; i < value.length; i += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(i), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }
    return () => {
      hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
      hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
      hash ^= hash >>> 16;
      return hash >>> 0;
    };
  }

  function mulberry32(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 1831565813) | 0;
      let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cyrb128(value) {
    let a = 1779033703;
    let b = 3144134277;
    let c = 1013904242;
    let d = 2773480762;
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      a = b ^ Math.imul(a ^ code, 597399067);
      b = c ^ Math.imul(b ^ code, 2869860233);
      c = d ^ Math.imul(c ^ code, 951274213);
      d = a ^ Math.imul(d ^ code, 2716044179);
    }
    a = Math.imul(c ^ (a >>> 18), 597399067);
    b = Math.imul(d ^ (b >>> 22), 2869860233);
    c = Math.imul(a ^ (c >>> 17), 951274213);
    d = Math.imul(b ^ (d >>> 19), 2716044179);
    return [(a ^ b ^ c ^ d) >>> 0, (b ^ a) >>> 0, (c ^ a) >>> 0, (d ^ a) >>> 0];
  }

  function sfc32(a, b, c, d) {
    return () => {
      a |= 0; b |= 0; c |= 0; d |= 0;
      const value = ((a + b) | 0) + d | 0;
      d = d + 1 | 0;
      a = b ^ (b >>> 9);
      b = c + (c << 3) | 0;
      c = (c << 21) | (c >>> 11);
      c = c + value | 0;
      return (value >>> 0) / 4294967296;
    };
  }

  function shuffleRange(array, start, end, random) {
    for (let i = end - 1; i > start; i -= 1) {
      const j = start + Math.floor(random() * (i - start + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  function rankedRange(array, start, end, random) {
    const values = [];
    const ranks = new Map();
    for (let i = start; i < end; i += 1) {
      values.push(i);
      ranks.set(i, random());
    }
    values.sort((a, b) => ranks.get(a) === ranks.get(b) ? a - b : ranks.get(a) - ranks.get(b));
    for (let i = 0; i < values.length; i += 1) array[start + i] = values[i];
  }

  function protocolPermutation(seed, version, count = 101, split = 64) {
    const permutation = Array.from({ length: count }, (_, index) => index);
    const boundary = Math.min(split, count);
    if (version === 1) {
      shuffleRange(permutation, 0, boundary, mulberry32(seedHash(`mb-perm|v1|lo|${seed}`)()));
      if (count > split) shuffleRange(permutation, split, count, mulberry32(seedHash(`mb-perm|v1|hi|${seed}`)()));
    } else if (version >= 2) {
      rankedRange(permutation, 0, boundary, sfc32(...cyrb128(`mb-perm|v${version}|lo|${seed}`)));
      if (count > split) rankedRange(permutation, split, count, sfc32(...cyrb128(`mb-perm|v${version}|hi|${seed}`)));
    }
    return permutation;
  }

  function makeProtocol(version, names, permVersion = 1) {
    const seedBytes = new Uint8Array(16);
    crypto.getRandomValues(seedBytes);
    const seed = Array.from(seedBytes, value => value.toString(16).padStart(2, '0')).join('');
    const permutation = protocolPermutation(seed, permVersion);
    const nameToWire = Object.create(null);
    const wireToName = Object.create(null);
    names.forEach((name, baseId) => {
      const wireId = baseId < 101 ? permutation[baseId] : baseId;
      nameToWire[name] = wireId;
      wireToName[wireId] = name;
    });
    return { version, names, seed, permVersion, nameToWire, wireToName };
  }

  function extractPacketMap(source, firstKey) {
    const escaped = firstKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(`[A-Za-z_$][A-Za-z0-9_$]*=\\{${escaped}:`, 'g');
    let match;
    let selected = null;
    while ((match = matcher.exec(source))) selected = match;
    if (!selected) return [];
    const open = source.indexOf('{', selected.index);
    const close = source.indexOf('}', open + 1);
    if (open < 0 || close < 0) return [];
    const body = source.slice(open + 1, close);
    return [...body.matchAll(/(?:^|,)([A-Za-z][A-Za-z0-9_$]*):[A-Za-z_$][A-Za-z0-9_$]*/g)]
      .map(item => item[1]);
  }

  function parseProtocolBundle(source) {
    const client = extractPacketMap(source, 'CPacketAnimation');
    const server = extractPacketMap(source, 'SPacketAdminAction');
    const late = extractPacketMap(source, 'CPacketScriptData');
    const lateSet = new Set(late);
    const names = [
      ...client.filter(name => !lateSet.has(name)),
      ...server.filter(name => !lateSet.has(name)),
      ...late
    ];
    const version = source.match(/SENTRY_RELEASE=\{id:[`'"]([^`'"]+)[`'"]\}/)?.[1]
      || source.match(/\b[0-9]+\.[0-9]+\.[0-9]+\b/)?.[0]
      || FALLBACK_VERSION;
    const required = [
      'CPacketJoinGame', 'CPacketPlayerPosLook', 'SPacketLoginStart',
      'SPacketPing', 'SPacketPlayerPosLook', 'SPacketPlayerInput'
    ];
    if (names.length < 100 || required.some(name => !names.includes(name))) {
      throw new Error('The current Miniblox packet table could not be read.');
    }
    return { version, names };
  }

  async function discoverProtocol() {
    setPhase('protocol');
    let html = '';
    try {
      html = await (await fetch(new URL('/', location.origin), {
        cache: 'no-store',
        credentials: 'include'
      })).text();
      const assetPath = html.match(/(?:src|href)=["']([^"']*\/assets\/index-[^"']+\.js)["']/)?.[1];
      if (!assetPath) throw new Error('Current Miniblox bundle was not found.');
      const assetUrl = new URL(assetPath, location.origin).href;
      try {
        const cached = JSON.parse(sessionStorage.getItem(PROTOCOL_CACHE_KEY) || 'null');
        if (cached?.assetUrl === assetUrl && Array.isArray(cached.names) && cached.names.length >= 100) {
          return makeProtocol(cached.version || FALLBACK_VERSION, cached.names);
        }
      } catch (_) {}
      const sourceResponse = await fetch(assetUrl, { cache: 'force-cache', credentials: 'include' });
      if (!sourceResponse.ok) throw new Error(`Protocol download failed (${sourceResponse.status}).`);
      const profile = parseProtocolBundle(await sourceResponse.text());
      try {
        sessionStorage.setItem(PROTOCOL_CACHE_KEY, JSON.stringify({ assetUrl, ...profile }));
      } catch (_) {}
      return makeProtocol(profile.version, profile.names);
    } catch (error) {
      console.warn('[MiniFeather Idle Player] Using bundled protocol profile:', error);
      return makeProtocol(FALLBACK_VERSION, [...FALLBACK_PACKET_NAMES]);
    }
  }

  function publicState() {
    return {
      id: botId,
      phase: state.phase,
      message: state.message,
      error: state.error,
      connected: state.joined,
      serverId: state.serverId,
      requestedUuid: state.requestedUuid,
      retryCount: state.retryCount,
      maxRetries: MAX_RETRIES,
      playerUuid: state.playerUuid,
      playerName: state.playerName,
      clientVersion: state.protocol?.version || '',
      compressedIgnored: state.compressedIgnored,
      brotliBackend: state.brotliBackend
    };
  }

  function emitState() {
    notifyManager();
  }

  function setPhase(phase, message = '', error = '') {
    state.phase = phase;
    state.message = String(message || '');
    state.error = String(error || '');
    emitState();
  }

  function randomUuid() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function randomGuestName() {
    // This pair is part of Miniblox's current public guest-name vocabulary.
    // The four random letters keep each ephemeral connection distinct while
    // preserving the format validated by the game server.
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    for (let attempt = 0; attempt < 32; attempt++) {
      let suffix = '';
      const bytes = new Uint8Array(4);
      crypto.getRandomValues(bytes);
      for (const byte of bytes) {
        const letter = letters[byte % letters.length];
        suffix += byte & 1 ? letter.toUpperCase() : letter;
      }
      const name = `ShyLeopard.${suffix}`;
      if (!usedGuestNames.has(name)) {
        usedGuestNames.add(name);
        return name;
      }
    }
    throw new Error('Could not reserve a unique guest name.');
  }

  function isGame(value) {
    return !!(value && typeof value === 'object' && value.serverInfo && typeof value.connect === 'function');
  }

  function findGame() {
    const direct = [
      globalThis.miniblox,
      globalThis.__MINIFEATHER_WAYPOINTS__?.game,
      globalThis.game
    ];
    for (const value of direct) if (isGame(value)) return value;

    const roots = [];
    for (const selector of ['#react', '#root', 'canvas']) {
      const element = document.querySelector(selector);
      if (!element) continue;
      for (const key of Reflect.ownKeys(element)) {
        if (String(key).startsWith('__react')) {
          try { roots.push(element[key]); } catch (_) {}
        }
      }
    }
    const seen = new WeakSet();
    const queue = roots.map(value => ({ value, depth: 0 }));
    let checked = 0;
    while (queue.length && checked++ < 10000) {
      const { value, depth } = queue.shift();
      if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
      if (typeof value === 'object') {
        if (seen.has(value)) continue;
        seen.add(value);
      }
      try {
        if (isGame(value)) return value;
        if (isGame(value.game)) return value.game;
        if (isGame(value.memoizedProps?.game)) return value.memoizedProps.game;
        if (isGame(value.pendingProps?.game)) return value.pendingProps.game;
      } catch (_) {}
      if (depth >= 7) continue;
      let keys;
      try { keys = Reflect.ownKeys(value); } catch (_) { continue; }
      for (const key of keys) {
        if (key === 'ownerDocument' || key === 'parentNode' || key === 'parentElement') continue;
        let child;
        try { child = value[key]; } catch (_) { continue; }
        if (child && (typeof child === 'object' || typeof child === 'function')) {
          queue.push({ value: child, depth: depth + 1 });
        }
      }
    }
    return null;
  }

  function currentTarget() {
    const game = findGame();
    const serverId = game?.serverInfo?.serverId || game?.connectingServerId;
    if (serverId) return String(serverId);
    const queryTarget = new URL(location.href).searchParams.get('connect');
    if (queryTarget) return queryTarget;
    const joinMatch = location.pathname.match(/\/join\/([^/?#]+)/i);
    if (joinMatch) return decodeURIComponent(joinMatch[1]);
    return '';
  }

  async function resolveInviteCode(code) {
    const response = await fetch(new URL(API_PATH, location.origin), {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code })
    });
    if (!response.ok) throw new Error(`Invite lookup failed (${response.status}).`);
    const result = await response.json();
    if (!result?.serverId) throw new Error('The invite code is invalid or expired.');
    return String(result.serverId);
  }

  function serverIdFromValue(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    try {
      const url = new URL(input);
      const hostMatch = url.hostname.match(/^([A-Za-z0-9-]+)\.servers\./i);
      if (hostMatch) return hostMatch[1];
      const joinMatch = url.pathname.match(/\/join\/([^/?#]+)/i);
      if (joinMatch) return decodeURIComponent(joinMatch[1]);
    } catch (_) {}
    return input;
  }

  async function resolveTarget(target) {
    setPhase('resolving');
    let value = serverIdFromValue(target);
    let knownServerId = false;
    if (!value || value.toLowerCase() === 'current' || value.toLowerCase() === 'actual') {
      value = serverIdFromValue(currentTarget());
      knownServerId = !!value;
    }
    if (!value) throw new Error('Join a server first or enter its invite code/server id.');

    if (knownServerId) {
      if (!/^[A-Za-z0-9-]{1,128}$/.test(value)) throw new Error('Invalid current server id.');
      return value;
    }

    if (/^[A-Za-z0-9]{3,16}$/.test(value)) {
      try {
        return await resolveInviteCode(value);
      } catch (error) {
        if (value.length <= 10) throw error;
      }
    }
    if (!/^[A-Za-z0-9-]{1,128}$/.test(value)) throw new Error('Invalid server id or invite code.');
    return value;
  }

  function socketOpen() {
    return state.socket && state.socket.readyState === WebSocket.OPEN;
  }

  function sendRaw(bytes) {
    if (!socketOpen()) return false;
    state.socket.send(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    return true;
  }

  function sendControlConnect() {
    const protocol = state.protocol;
    const payload = encodeMsgPack({
      t: 0,
      d: {
        permSeed: protocol.seed,
        permVersion: protocol.permVersion,
        clientVersion: protocol.version
      }
    }).finish();
    sendRaw(payload);
    setPhase('authenticating');
  }

  function sendPacket(name, payload) {
    const wireId = state.protocol?.nameToWire?.[name];
    if (!Number.isInteger(wireId)) throw new Error(`Packet ${name} is unavailable in this protocol profile.`);
    return sendRaw(encodeMsgPack({ options: { compress: true }, t: 2, d: [wireId, payload] }).finish());
  }

  function encodeLogin() {
    const writer = new ProtoWriter();
    writer.tag(1, 2).varint(0);
    writer.string(2, '0');
    writer.string(3, state.metricsId);
    writer.string(4, state.requestedUuid);
    writer.string(5, state.protocol.version);
    writer.string(6, document.documentElement.lang || navigator.language?.split('-')[0] || 'en');
    return writer.finish();
  }

  function encodePing() {
    const writer = new ProtoWriter();
    writer.tag(1, 0).varint(BigInt(Date.now()));
    return writer.finish();
  }

  function encodeAnalytics() {
    const writer = new ProtoWriter();
    writer.float(1, 60);
    writer.float(2, 0);
    writer.uint(3, 2);
    return writer.finish();
  }

  function encodeConfirmTransaction(windowId, actionNumber, accepted) {
    const writer = new ProtoWriter();
    writer.int(1, windowId);
    writer.int(2, actionNumber);
    writer.bool(3, accepted);
    return writer.finish();
  }

  function writeFloatVector(writer, field, pos) {
    writer.message(field, child => {
      child.float(1, pos.x);
      child.float(2, pos.y);
      child.float(3, pos.z);
    });
  }

  function encodePosLook() {
    const writer = new ProtoWriter();
    writeFloatVector(writer, 1, state.pos);
    writer.float(2, state.yaw);
    writer.float(3, state.pitch);
    writer.bool(4, state.onGround);
    return writer.finish();
  }

  function encodePlayerInput() {
    const writer = new ProtoWriter();
    writer.uint(1, ++state.sequence);
    writer.float(6, state.yaw);
    writer.float(7, state.pitch);
    writeFloatVector(writer, 11, state.pos);
    if (state.ackId > 0) writer.uint(12, state.ackId);
    writer.bool(13, state.onGround);
    return writer.finish();
  }

  function startTimers() {
    stopTimers();
    state.pingTimer = window.setInterval(() => {
      try { sendPacket('SPacketPing', encodePing()); } catch (_) {}
    }, 1000);
    state.analyticsTimer = window.setInterval(() => {
      try { sendPacket('SPacketAnalytics', encodeAnalytics()); } catch (_) {}
    }, 30000);
    state.movementTimer = window.setInterval(() => {
      if (!state.joined || !state.positionKnown) return;
      try {
        if (!state.category || INPUT_MOVEMENT_CATEGORIES.has(state.category)) {
          sendPacket('SPacketPlayerInput', encodePlayerInput());
        } else {
          sendPacket('SPacketPlayerPosLook', encodePosLook());
        }
      } catch (_) {}
    }, 50);
  }

  function stopTimers() {
    clearTimeout(state.joinTimeout);
    clearInterval(state.movementTimer);
    clearInterval(state.pingTimer);
    clearInterval(state.analyticsTimer);
    clearTimeout(state.respawnTimer);
    clearTimeout(state.retryTimer);
    state.joinTimeout = 0;
    state.movementTimer = 0;
    state.pingTimer = 0;
    state.analyticsTimer = 0;
    state.respawnTimer = 0;
    state.retryTimer = 0;
  }

  function handleJoinGame(fields) {
    if (!protoBool(fields, 1)) {
      const message = protoString(fields, 2, 'The server rejected the guest connection.');
      throw new Error(message);
    }
    state.joined = true;
    state.playerName = protoString(fields, 7, 'Guest');
    state.playerUuid = protoString(fields, 14, state.requestedUuid);
    const serverInfo = protoMessage(fields, 13);
    state.category = serverInfo ? protoString(serverInfo, 4, '') : '';
    const spawn = protoMessage(fields, 17);
    if (spawn) {
      state.pos.x = protoSint(spawn, 1) + 0.5;
      state.pos.y = protoSint(spawn, 2);
      state.pos.z = protoSint(spawn, 3) + 0.5;
      state.positionKnown = true;
    }
    clearTimeout(state.joinTimeout);
    state.joinTimeout = 0;
    state.retryCount = 0;
    startTimers();
    setPhase('connected');
  }

  function updatePosition(fields, withLook) {
    state.pos.x = protoFloat(fields, 1, state.pos.x);
    state.pos.y = protoFloat(fields, 2, state.pos.y);
    state.pos.z = protoFloat(fields, 3, state.pos.z);
    if (withLook) {
      state.yaw = protoFloat(fields, 4, state.yaw);
      state.pitch = protoFloat(fields, 5, state.pitch);
    }
    state.positionKnown = true;
  }

  function handleCombined(fields) {
    for (const container of fields.get(1) || []) {
      if (container.wire !== 2) continue;
      const packet = parseProto(container.value);
      for (const [fieldNumber, values] of packet) {
        const name = COMBINED_CLIENTBOUND_NAMES[fieldNumber];
        if (!name) continue;
        for (const value of values) {
          if (value.wire === 2) handlePacket(name, value.value);
        }
      }
    }
  }

  function handlePacket(name, payload) {
    const fields = parseProto(payload);
    if (name === 'ClientBoundCombined') {
      handleCombined(fields);
      return;
    }
    if (name === 'CPacketJoinGame') {
      handleJoinGame(fields);
      return;
    }
    if (name === 'CPacketPlayerPosLook') {
      updatePosition(fields, true);
      return;
    }
    if (name === 'CPacketPlayerPosition') {
      updatePosition(fields, false);
      return;
    }
    if (name === 'CPacketPlayerReconciliation') {
      updatePosition(fields, true);
      state.ackId = protoUint(fields, 8, state.ackId);
      state.onGround = protoBool(fields, 9, state.onGround);
      return;
    }
    if (name === 'CPacketConfirmTransaction') {
      sendPacket('SPacketConfirmTransaction', encodeConfirmTransaction(
        protoInt(fields, 1),
        protoInt(fields, 2),
        protoBool(fields, 3)
      ));
      return;
    }
    if (name === 'CPacketUpdateHealth') {
      const hpItem = protoItem(fields, 2);
      const hp = hpItem ? protoFloat(fields, 2, 20) : 20;
      if (hp <= 0 && !state.respawnTimer) {
        state.respawnTimer = window.setTimeout(() => {
          state.respawnTimer = 0;
          try { sendPacket('SPacketRespawn', new Uint8Array()); } catch (_) {}
        }, 1200);
      }
      return;
    }
    if (name === 'CPacketDisconnect') {
      throw new Error(protoString(fields, 1, 'Disconnected by the server.'));
    }
    if (name === 'CPacketChangeServers') {
      const destination = protoString(fields, 1, '');
      if (destination) {
        const next = serverIdFromValue(destination);
        if (next && next !== state.serverId) {
          const uuid = state.requestedUuid;
          window.setTimeout(() => connect(next, { requestedUuid: uuid, transfer: true }), 350);
        }
      }
    }
  }

  async function decompressBrotli(value) {
    if (state.brotliBackend !== 'javascript' && typeof DecompressionStream === 'function') {
      try {
        const stream = new Blob([value]).stream().pipeThrough(new DecompressionStream('brotli'));
        const result = new Uint8Array(await new Response(stream).arrayBuffer());
        state.brotliBackend = 'native';
        return result;
      } catch (_) {
        // Chromium exposes DecompressionStream but currently rejects "brotli".
        // Fall through to MiniFeather's bundled browser decoder.
        state.brotliBackend = 'javascript';
      }
    }
    const decoder = globalThis.MF_BROTLI_DECODE;
    if (typeof decoder !== 'function') {
      throw new Error('The MiniFeather Brotli decoder is not available. Reload the extension.');
    }
    const result = decoder(value);
    state.brotliBackend = 'javascript';
    return result instanceof Uint8Array
      ? result
      : new Uint8Array(result.buffer, result.byteOffset || 0, result.byteLength);
  }

  async function handleBinary(value) {
    const bytes = value instanceof Uint8Array
      ? value
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (!bytes.length) return;
    const header = bytes[0];
    if ((header & 1) === 0) {
      const type = (header >> 5) & 7;
      const data = bytes.length > 1 ? decodeMsgPack(bytes.subarray(1)) : null;
      if (type === 0) {
        setPhase('joining');
        sendPacket('SPacketLoginStart', encodeLogin());
      } else if (type === 4) {
        const message = typeof data === 'string' ? data : data?.message || 'Socket authentication failed.';
        fail(message);
      }
      return;
    }
    const wireId = header >> 2;
    const compressed = !!(header & 2);
    const name = state.protocol?.wireToName?.[wireId];
    if (!name || !HANDLED_CLIENTBOUND_NAMES.has(name)) return;
    try {
      const payload = compressed ? await decompressBrotli(bytes.subarray(1)) : bytes.subarray(1);
      handlePacket(name, payload);
    } catch (error) {
      fail(error);
    }
  }

  function handleText(value) {
    const text = String(value || '');
    if (text.startsWith('0')) {
      sendControlConnect();
      return;
    }
    if (text.startsWith('2')) {
      if (socketOpen()) state.socket.send(`3${text.slice(1)}`);
      return;
    }
    if (text.startsWith('1')) fail('The server closed the Engine.IO session.');
  }

  function closeSocket() {
    const socket = state.socket;
    state.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      try { socket.close(1000, 'MiniFeather idle player stopped'); } catch (_) {}
    }
  }

  function resetConnectionState() {
    stopTimers();
    closeSocket();
    state.joined = false;
    state.category = '';
    state.sequence = 0;
    state.ackId = 0;
    state.positionKnown = false;
    state.playerUuid = '';
    state.playerName = '';
    state.compressedIgnored = 0;
  }

  function fail(error) {
    if (state.manualStop || state.phase === 'retrying' || state.phase === 'error') return;
    const message = String(error?.message || error || 'Unknown connection error.');
    console.warn('[MiniFeather Idle Player]', message);
    state.operation += 1;
    resetConnectionState();
    if (!state.manualStop && state.retryCount < MAX_RETRIES) {
      const attempt = ++state.retryCount;
      const target = state.serverId || state.retryTarget;
      setPhase('retrying', '', message);
      state.retryTimer = window.setTimeout(() => {
        state.retryTimer = 0;
        if (!state.manualStop) return connect(target, { retry: true }).catch(() => {});
      }, attempt * 1000);
    } else {
      setPhase('error', '', message);
    }
  }

  async function connect(target = 'current', options = {}) {
    const normalizedTarget = String(target || 'current').trim().toLowerCase();
    const currentAliases = new Set(['', 'current', 'actual']);
    if (!options.transfer && state.socket && !['idle', 'error'].includes(state.phase)) {
      const explicitTarget = currentAliases.has(normalizedTarget) ? '' : serverIdFromValue(target);
      if (!explicitTarget || explicitTarget === state.serverId) {
        emitState();
        return publicState();
      }
    }
    const now = Date.now();
    if (!options.transfer && !options.retry && now - state.lastConnectAt < 1500) {
      throw new Error('Wait a moment before reconnecting.');
    }
    state.lastConnectAt = now;
    if (!options.retry) {
      state.retryCount = 0;
      state.retryTarget = target;
    }
    const operation = ++state.operation;
    state.manualStop = false;
    resetConnectionState();
    state.serverId = '';
    setPhase('resolving');
    try {
      const serverId = await resolveTarget(target);
      if (operation !== state.operation) return publicState();
      state.serverId = serverId;
      state.requestedUuid = options.requestedUuid || randomGuestName();
      state.metricsId = randomUuid();
      state.protocol = await discoverProtocol();
      if (operation !== state.operation) return publicState();
      setPhase('connecting');
      const socketUrl = `wss://${serverId}.servers.${SERVER_DOMAIN}/socket.io/?EIO=4&transport=websocket`;
      const socket = new WebSocket(socketUrl);
      state.socket = socket;
      socket.binaryType = 'arraybuffer';
      socket.addEventListener('message', event => {
        if (socket !== state.socket) return;
        if (typeof event.data === 'string') handleText(event.data);
        else if (event.data instanceof Blob) event.data.arrayBuffer().then(handleBinary).catch(fail);
        else handleBinary(event.data).catch(fail);
      });
      socket.addEventListener('error', () => {
        if (socket === state.socket) fail('WebSocket connection failed.');
      });
      socket.addEventListener('close', event => {
        if (socket !== state.socket) return;
        state.socket = null;
        stopTimers();
        state.joined = false;
        if (state.manualStop || event.code === 1000) setPhase('idle');
        else fail(`Connection closed (${event.code || 'unknown'}).`);
      });
      state.joinTimeout = window.setTimeout(() => {
        if (operation === state.operation && !state.joined) fail('Timed out while joining the server.');
      }, 15000);
      return publicState();
    } catch (error) {
      if (operation === state.operation) fail(error);
      throw error;
    }
  }

  function disconnect() {
    state.operation += 1;
    state.manualStop = true;
    resetConnectionState();
    state.serverId = '';
    setPhase('idle');
    return publicState();
  }

  return { connect, disconnect, status: publicState };
  }

  const bots = new Map();
  let nextBotId = 1;
  let managerError = '';

  function publicState() {
    const sessions = [...bots.values()].map(bot => bot.status());
    const connectedCount = sessions.filter(bot => bot.connected).length;
    const pending = sessions.find(bot => !['idle', 'error', 'connected'].includes(bot.phase));
    const latest = sessions[sessions.length - 1];
    return {
      phase: connectedCount ? 'connected' : pending?.phase || latest?.phase || 'idle',
      connected: connectedCount > 0,
      connectedCount,
      maxBots: MAX_BOTS,
      bots: sessions,
      playerName: latest?.playerName || '',
      serverId: latest?.serverId || '',
      error: managerError || latest?.error || ''
    };
  }

  function emitState() {
    document.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: JSON.stringify(publicState()) }));
  }

  async function connect(target = 'current') {
    if (bots.size >= MAX_BOTS) {
      const retired = [...bots].find(([, bot]) => ['idle', 'error'].includes(bot.status().phase));
      if (retired) disconnect(retired[0]);
    }
    if (bots.size >= MAX_BOTS) {
      managerError = `Maximum ${MAX_BOTS} bots. Disconnect one before adding another.`;
      emitState();
      return publicState();
    }
    managerError = '';
    const id = `bot-${nextBotId++}`;
    const bot = createBotSession(id, emitState);
    bots.set(id, bot);
    emitState();
    await bot.connect(target);
    return publicState();
  }

  async function syncCount(count, target = 'current') {
    const desired = Math.max(1, Math.min(MAX_BOTS, Math.round(Number(count) || 1)));
    for (const [id, bot] of [...bots]) {
      if (['idle', 'error'].includes(bot.status().phase)) disconnect(id);
    }
    while (bots.size > desired) disconnect([...bots.keys()].at(-1));
    const pending = [];
    while (bots.size < desired) pending.push(connect(target));
    await Promise.allSettled(pending);
    return publicState();
  }

  function disconnect(botId) {
    if (botId) {
      const bot = bots.get(String(botId));
      if (!bot) return publicState();
      bots.delete(String(botId));
      bot.disconnect();
    } else {
      for (const bot of bots.values()) bot.disconnect();
      bots.clear();
    }
    managerError = '';
    emitState();
    return publicState();
  }

  function parseEventDetail(event) {
    try {
      return typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch (_) {
      return null;
    }
  }

  async function handleCommand(event) {
    const detail = parseEventDetail(event) || {};
    try {
      if (detail.action === 'connect' || detail.action === 'join') {
        await connect(detail.target || 'current');
      } else if (detail.action === 'sync') {
        await syncCount(detail.count, detail.target || 'current');
      } else if (detail.action === 'disconnect' || detail.action === 'leave' || detail.action === 'stop') {
        disconnect(detail.id);
      } else if (detail.action === 'status') {
        emitState();
      }
    } catch (_) {}
  }

  document.addEventListener(COMMAND_EVENT, handleCommand);

  const api = {
    connect,
    syncCount,
    disconnect,
    status: publicState,
    multiBotVersion: 3,
    get connected() { return publicState().connected; },
    destroy() {
      document.removeEventListener(COMMAND_EVENT, handleCommand);
      disconnect();
      if (globalThis[GLOBAL_KEY] === api) delete globalThis[GLOBAL_KEY];
    }
  };

  globalThis[GLOBAL_KEY] = api;
  emitState();
})();
