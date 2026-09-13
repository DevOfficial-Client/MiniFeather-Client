// Spider Garden Simulator — ejecutable PC que emula 1:1 el mod TheCymaera/minecraft-spider
// Lee el mundo real (Anvil), simula Física+FABRIK+Gallop a 20 ticks/s y transmite
// poses por WebSocket al cliente MiniFeather en miniblox.
'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');

const { Vec } = require('./vecmath');
const { SpiderBody } = require('./spider-body');
const { Gait } = require('./gait');
const { PRESETS } = require('./presets');
const { ECS, setupBehaviours, TargetBehaviour, StayStillBehaviour, setupDefaultBehaviour } = require('./behaviour');
const { readNBT, World } = require('./mcworld');

const TICK_MS = 50;
const WOLRD_DIR_DEFAULT = path.join(__dirname, '..', 'world');

// ─── WebSocket sin dependencias (RFC 6455 mínimo) ───
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WSClient {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.alive = true;
  }
}

function acceptKey(key) {
  return require('crypto').createHash('sha1').update(key + GUID).digest('base64');
}

function handleUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + acceptKey(key) + '\r\n\r\n'
  );
  const client = new WSClient(socket);
  clients.push(client);
  console.log('[ws] cliente conectado desde', req.socket.remoteAddress);
  socket.on('data', (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    try { parseFrames(client); } catch (e) { console.warn('[ws] frame error', e.message); }
  });
  socket.on('close', () => { client.alive = false; });
  socket.on('error', () => { client.alive = false; });
  return client;
}

function parseFrames(client) {
  while (client.buffer.length >= 2) {
    const b0 = client.buffer[0], b1 = client.buffer[1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) { if (client.buffer.length < 4) return; len = client.buffer.readUInt16BE(2); offset = 4; }
    else if (len === 127) { if (client.buffer.length < 10) return; len = Number(client.buffer.readBigUInt64BE(2)); offset = 10; }
    let mask = null;
    if (masked) { if (client.buffer.length < offset + 4) return; mask = client.buffer.subarray(offset, offset + 4); offset += 4; }
    if (client.buffer.length < offset + len) return;
    let payload = client.buffer.subarray(offset, offset + len);
    if (mask) {
      const un = Buffer.alloc(len);
      for (let i = 0; i < len; i++) un[i] = payload[i] ^ mask[i % 4];
      payload = un;
    }
    client.buffer = client.buffer.subarray(offset + len);
    if (opcode === 0x8) { client.socket.end(); continue; }
    if (opcode === 0x9) { // ping → pong
      sendFrame(client.socket, 0xA, Buffer.alloc(0));
      continue;
    }
    if (opcode === 0x1) {
      try {
        const msg = JSON.parse(payload.toString('utf8'));
        handleMessage(client, msg);
      } catch (e) { console.warn('[ws] json error', e.message); }
    }
  }
}

function sendFrame(socket, opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

function broadcast(obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  for (const client of clients) {
    if (!client.alive) continue;
    try { sendFrame(client.socket, 0x1, payload); } catch (_) { client.alive = false; }
  }
}

const clients = [];

// ─── estado del sim ───
const app = new ECS();
const world = new World(WOLRD_DIR_DEFAULT);
const spiders = []; // { entity, body, name, preset }

function spawnSpider(name, preset, x, y, z, yaw, gallop) {
  const bodyPlan = PRESETS[preset](4, 1.0);
  const walkGait = Gait.defaultWalk();
  const gallopGait = Gait.defaultGallop();
  const spider = SpiderBody.fromLocation(x, y, z, yaw, world, bodyPlan, walkGait, gallopGait, name, gallop);
  const entity = app.spawn({ SpiderBody: spider });
  spiders.push({ entity, body: spider, name, preset, gallop });
  return spider;
}

function handleMessage(client, msg) {
  if (msg.type === 'hello') {
    // estado completo
    for (const s of spiders) sendSpiderAdd(client, s);
  } else if (msg.type === 'spawn') {
    const preset = PRESETS[msg.preset] ? msg.preset : 'hexbot';
    const spider = spawnSpider(msg.name || ('spider' + (spiders.length + 1)), preset, msg.x, msg.y, msg.z, msg.yaw || 0, !!msg.gallop);
    broadcast({ type: 'add', spider: serializeSpider(spider, msg.name || ('spider' + (spiders.length)), preset) });
  } else if (msg.type === 'target') {
    // láser virtual: mover araña más cercana hacia un punto
    const laser = new Vec(msg.x, msg.y, msg.z);
    let best = null, bestD = Infinity;
    for (const s of spiders) {
      const d = s.body.position.distanceSquared(laser);
      if (d < bestD) { best = s; bestD = d; }
    }
    if (best) {
      best.entity.replace('TargetBehaviour', new TargetBehaviour(laser.clone(), best.body.walkGait.stationary.bodyHeight * 2));
    }
  } else if (msg.type === 'staystill') {
    for (const s of spiders) s.entity.replace('StayStillBehaviour', new StayStillBehaviour());
  }
}

function sendSpiderAdd(client, s) {
  sendFrame(client.socket, 0x1, Buffer.from(JSON.stringify({ type: 'add', spider: serializeSpider(s.body, s.name, s.preset) })));
}

function serializeSpider(spider, name, preset) {
  return {
    name, preset,
    gallop: spider.gallop,
    bodyModel: spider.bodyPlan.bodyModel,
    scale: spider.bodyPlan.scale,
    legs: spider.bodyPlan.legs.map((l) => ({
      attachment: [l.attachmentPosition.x, l.attachmentPosition.y, l.attachmentPosition.z],
      segments: l.segments.map((s) => s.length),
    })),
  };
}

// pose por frame: posición+orientación del cuerpo y articulaciones de cada pata
function serializePose(spider) {
  const legs = [];
  for (const leg of spider.legs) {
    legs.push({
      att: [round3(leg.attachmentPosition.x), round3(leg.attachmentPosition.y), round3(leg.attachmentPosition.z)],
      joints: leg.chain.segments.map((s) => [round3(s.position.x), round3(s.position.y), round3(s.position.z)]),
    });
  }
  const o = spider.orientation;
  return {
    p: [round3(spider.position.x), round3(spider.position.y), round3(spider.position.z)],
    q: [round3(o.x), round3(o.y), round3(o.z), round3(o.w)],
    legs,
  };
}

function round3(v) { return Math.round(v * 1000) / 1000; }

// ─── arranque desde el mundo ───
function bootFromWorld() {
  try {
    const level = readNBT(path.join(WOLRD_DIR_DEFAULT, 'level.dat'));
    const spawn = level.Data.SpawnX !== undefined
      ? { x: level.Data.SpawnX, y: level.Data.SpawnY, z: level.Data.SpawnZ }
      : { x: 0, y: 64, z: 0 };
    console.log('[world]', WOLRD_DIR_DEFAULT, 'spawn', JSON.stringify(spawn));
  } catch (e) {
    console.warn('[world] no se pudo leer level.dat:', e.message);
  }

  // arañas del garden: demo — 3 arañas en formación alrededor del spawn
  const s0 = spawnSpider('garden-0', 'hexbot', spawn.x + 3, spawn.y + 2, spawn.z, 0, true);
  const s1 = spawnSpider('garden-1', 'octobot', spawn.x - 4, spawn.y + 2, spawn.z + 3, 90, false);
  const spidersCreated = 2;
  void s0; void s1; void spidersCreated;
  console.log('[sim] arañas iniciales:', spiders.length);
}

// ─── bucle de simulación ───
let tickCount = 0;
function tick() {
  // láser-virtual behaviour (como setupLaserPointer pero sin Bukkit)
  app.update();
  setupDefaultBehaviourTick();
  tickCount++;

  // broadcast de poses (cada tick — 20 Hz)
  const poses = [];
  for (const s of spiders) poses.push(serializePose(s.body));
  broadcast({ type: 'frame', t: tickCount, poses });

  if (tickCount % 200 === 0) {
    const g0 = spiders[0]?.body;
    if (g0) console.log('[sim] tick', tickCount, 'pos', g0.position.x.toFixed(2), g0.position.y.toFixed(2), g0.position.z.toFixed(2), 'vel', g0.velocity.length().toFixed(3), 'walking', g0.isWalking);
  }
}

let defaultBehaviourTimer = 0;
function setupDefaultBehaviourTick() {
  // setupSpider: si no hay láser activo → StayStill (reemplaza TargetBehaviour)
  defaultBehaviourTimer++;
  // Nota: en el repo, el sistema reemplaza cada tick el comportamiento por StayStill
  // salvo que un láser esté activo; aquí el láser vive en handleMessage('target')
  // que reemplaza componentes — así que solo aplicamos StayStill si nunca hubo target
  for (const [entity] of app.query('SpiderBody')) {
    if (!entity.has('TargetBehaviour') && !entity.has('StayStillBehaviour')) {
      entity.add('StayStillBehaviour', new StayStillBehaviour());
    }
  }
}

// HTTP simple para status
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, spiders: spiders.length, tick: tickCount }));
});

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/spiders') { socket.destroy(); return; }
  void head;
  handleUpgrade(req, socket);
});

// ─── main ───
console.log('╔══════════════════════════════════════════╗');
console.log('║   Spider Garden Simulator (port 1:1)     ║');
console.log('║   TheCymaera/minecraft-spider → JS       ║');
console.log('╚══════════════════════════ hexapod ═══════╝');
bootFromWorld();
setupBehaviours(app);
setInterval(tick, TICK_MS);
const PORT = 8765;
server.listen(PORT, () => {
  console.log(`[net] ws://127.0.0.1:${PORT}/spiders  (cliente MiniFeather)`);
  console.log('[net] status http://127.0.0.1:' + PORT + '/');
});
