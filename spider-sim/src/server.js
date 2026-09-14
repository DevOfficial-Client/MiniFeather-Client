// Spider Garden Simulator — ejecutable PC que emula 1:1 el mod TheCymaera/minecraft-spider
// Lee el mundo real (Anvil), simula Física+FABRIK+Gallop a 20 ticks/s y transmite
// poses por WebSocket al cliente MiniFeather en miniblox.
'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');

const { Vec } = require('./vecmath');
const { Quat } = require('./joml');
const { KinematicChain } = require('./kinematic-chain');
const { SpiderBody } = require('./spider-body');
const { Gait, PIVOT_MODES } = require('./gait');
const { PRESETS } = require('./presets');
const { ECS, setupBehaviours, setupSpiderBody, TargetBehaviour, StayStillBehaviour } = require('./behaviour');
const { readNBT, World, extractBlocks } = require('./mcworld');

const TICK_MS = 50;
const WORLD_DIR = process.env.SPIDER_WORLD || path.join(__dirname, '..', '..', 'spider-garden-e201', 'spider-garden');

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
const world = new World(WORLD_DIR);
const spiders = []; // { entity, body, name, preset }
let lastPlayerPos = null; // última posición reportada por el cliente (miniblox)

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
  } else if (msg.type === 'player') {
    // posición del jugador en miniblox (para spawns al lado y láser preciso)
    if (Number.isFinite(msg.x) && Number.isFinite(msg.y) && Number.isFinite(msg.z)) {
      lastPlayerPos = { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw || 0, t: Date.now() };
    }
  } else if (msg.type === 'spawn') {
    const preset = PRESETS[msg.preset] ? msg.preset : 'hexbot';
    // sin coordenadas → al lado del jugador (o del spawn del mundo como fallback)
    let x = msg.x, y = msg.y, z = msg.z, yaw = msg.yaw || 0;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      const base = lastPlayerPos || worldSpawn;
      // al lado del jugador, delante de él si sabemos el yaw
      const side = (Math.random() < 0.5 ? 1 : -1) * (2 + Math.random() * 2);
      if (lastPlayerPos) {
        // perpendicular a la mirada del jugador
        const yawRad = lastPlayerPos.yaw || 0;
        x = base.x + Math.cos(yawRad) * side;
        z = base.z - Math.sin(yawRad) * side;
        yaw = yawRad + Math.PI; // mirando hacia el jugador
      } else {
        x = base.x + side;
        z = base.z;
      }
      const hit = world.raycastGround(new Vec(x, 120, z), new Vec(0, -1, 0), 200);
      y = (hit ? hit.y : base.y) + 2;
    }
    const name = msg.name || ('spider' + (spiders.length + 1));
    const spider = spawnSpider(name, preset, x, y, z, yaw, !!msg.gallop);
    broadcast({ type: 'add', spider: serializeSpider(spider, name, preset) });
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
  } else if (msg.type === 'despawn') {
    const idx = msg.name ? spiders.findIndex((s) => s.name === msg.name) : 0;
    if (idx >= 0) {
      const [s] = spiders.splice(idx, 1);
      s.entity.remove();
      broadcast({ type: 'remove', name: s.name });
    }
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
function serializePose(spider, name) {
  const legs = [];
  const pivot = PIVOT_MODES[spider.gait.legChainPivotMode](spider);
  for (const leg of spider.legs) {
    // rotaciones acumuladas EXACTAS del mod (renderSpiderEntities.kt):
    // cada segmento se renderiza con Matrix4f().rotate(getRotations(pivot)[si])
    const rotations = leg.chain.getRotations(pivot).map((r) => [round3(r.x), round3(r.y), round3(r.z), round3(r.w)]);
    legs.push({
      att: [round3(leg.attachmentPosition.x), round3(leg.attachmentPosition.y), round3(leg.attachmentPosition.z)],
      joints: leg.chain.segments.map((s) => [round3(s.position.x), round3(s.position.y), round3(s.position.z)]),
      rot: rotations,
    });
  }
  const o = spider.orientation;
  return {
    n: name ?? spider.name,
    p: [round3(spider.position.x), round3(spider.position.y), round3(spider.position.z)],
    q: [round3(o.x), round3(o.y), round3(o.z), round3(o.w)],
    torso: {
      // 16 floats columna-mayor: rotación(orientation) * escala(torsoData.scale)
      m: quatToMatrix(o, torsoScale(spider)),
    },
    legs,
  };
}

function round3(v) { return Math.round(v * 1000) / 1000; }

// escala del torso por preset (SpiderTorsoModels.kt apply{})
const TORSO_SCALES = { flat: 0.8, boxy: 0.75, stealth: 0.8 };
function torsoScale(spider) { return TORSO_SCALES[spider.bodyPlan.bodyModel] ?? 1; }

// quaternion → matriz 4x4 columna-mayor (layout OpenGL/three.js fromArray):
// R = rotación estándar del quaternion, luego escala uniforme s.
// [R00,R10,R20,0, R01,R11,R21,0, R02,R12,R22,0, 0,0,0,1] * s (salvo fila 3)
function quatToMatrix(q, scale) {
  const { x, y, z, w } = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const s = scale;
  const r00 = (1 - (yy + zz)) * s, r11 = (1 - (xx + zz)) * s, r22 = (1 - (xx + yy)) * s;
  const r01 = (xy - wz) * s, r02 = (xz + wy) * s;
  const r10 = (xy + wz) * s, r12 = (yz - wx) * s;
  const r20 = (xz - wy) * s, r21 = (yz + wx) * s;
  // columna-mayor: [col0, col1, col2, col3]
  return [r00, r10, r20, 0, r01, r11, r21, 0, r02, r12, r22, 0, 0, 0, 0, 1];
}

// ─── arranque desde el mundo ───
let worldSpawn = { x: 0, y: 64, z: 0 };
function bootFromWorld() {
  let spawn = { x: 0, y: 64, z: 0 };
  try {
    const level = readNBT(path.join(WORLD_DIR, 'level.dat'));
    if (level.Data.SpawnX !== undefined) {
      spawn = { x: level.Data.SpawnX, y: level.Data.SpawnY, z: level.Data.SpawnZ };
    }
    console.log('[world]', WORLD_DIR, 'spawn', JSON.stringify(spawn));
  } catch (e) {
    console.warn('[world] no se pudo leer level.dat:', e.message);
  }
  worldSpawn = spawn;

  // registrar TODAS las regiones .mca del mundo (para /world.json)
  const regionDir = path.join(WORLD_DIR, 'region');
  try {
    for (const f of fs.readdirSync(regionDir)) {
      const m = /^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(f);
      if (m) world.region(Number(m[1]), Number(m[2]));
    }
  } catch (e) {
    console.warn('[world] sin directorio region/:', e.message);
  }

  // colocar las arañas sobre el suelo real (raycast desde arriba)
  const groundY = (x, z) => {
    const hit = world.raycastGround(new Vec(x, 120, z), new Vec(0, -1, 0), 200);
    return hit ? hit.y : spawn.y;
  };

  // arañas del garden: demo
  spawnSpider('garden-0', 'spider', spawn.x + 3, groundY(spawn.x + 3, spawn.z) + 2, spawn.z, 0, true);
  spawnSpider('garden-1', 'spider', spawn.x - 4, groundY(spawn.x - 4, spawn.z + 3) + 2, spawn.z + 3, 90, false);
  console.log('[sim] arañas iniciales:', spiders.length);
}

// ─── bucle de simulación ───
let tickCount = 0;
let gardenAnchored = false;
function tick() {
  // Recolocar arañas que quedaron lejos del jugador. El anclaje original
  // (primera posición conocida) puede usar una posición del menú ((0,0,0)) o
  // del spawn del mundo, no la real del jugador — y en mundos normales el
  // jugador se mueve y las arañas quedan a cientos de bloques. Regla:
  // araña a >64 bloques del jugador → teleport al lado (mismo criterio del
  // mod original: la araña siempre debe estar visible para el jugador).
  const anchorNow = (() => {
    const p = lastPlayerPos;
    if (!p) return false;
    // posición basura del menú/título: solo anclar si parece real
    if (p.x === 0 && p.y === 0 && p.z === 0) return false;
    if (!gardenAnchored) { gardenAnchored = true; return true; }
    return true;
  })();
  if (anchorNow) anchorSpidersToPlayer();

  // láser-virtual behaviour (como setupLaserPointer pero sin Bukkit)
  app.update();
  setupDefaultBehaviourTick();
  tickCount++;

  // broadcast de poses (cada tick — 20 Hz)
  const poses = [];
  for (const s of spiders) poses.push(serializePose(s.body, s.name));
  broadcast({ type: 'frame', t: tickCount, poses });

  if (tickCount % 200 === 0) {
    const g0 = spiders[0]?.body;
    if (g0) console.log('[sim] tick', tickCount, 'pos', g0.position.x.toFixed(2), g0.position.y.toFixed(2), g0.position.z.toFixed(2), 'vel', g0.velocity.length().toFixed(3), 'walking', g0.isWalking);
  }
}

// teleport de emergencia: araña fuera del mundo conocido (NaN/lejos) → junto al jugador
function anchorSpidersToPlayer() {
  const p = lastPlayerPos;
  for (const s of spiders) {
    const b = s.body;
    const far = !Number.isFinite(b.position.x) || !Number.isFinite(b.position.y) || !Number.isFinite(b.position.z)
      || b.position.distance(new Vec(p.x, p.y, p.z)) > 64;
    if (far) teleportSpider(s, p.x + 2, p.z);
  }
}

function teleportSpider(s, x, z) {
  const hit = world.raycastGround(new Vec(x, 120, z), new Vec(0, -1, 0), 200);
  const y = (hit ? hit.y : lastPlayerPos?.y ?? worldSpawn.y) + 2;
  s.body.position.set(x, y, z);
  s.body.velocity.set(0, 0, 0);
  // recolocar las patas (recrear el estado de la cadena)
  for (const leg of s.body.legs) {
    leg.chain.root.copy(leg.attachmentPosition);
    if (s.body.gait.straightenLegs) {
      const pivot = PIVOT_MODES[s.body.gait.legChainPivotMode](s.body);
      const pivotCopy = new Quat(pivot.x, pivot.y, pivot.z, pivot.w);
      const direction = leg.endEffector.clone().sub(leg.attachmentPosition);
      const rotation = KinematicChain.getRotationAroundAxis(direction, pivotCopy);
      rotation.x += s.body.gait.legStraightenRotation;
      const orientation = pivotCopy.rotateYXZ(rotation.y, rotation.x, 0.0);
      leg.chain.straightenDirection(orientation);
    }
    leg.chain.fabrik(leg.endEffector);
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

// HTTP simple para status + preflight PNA (Chrome: página HTTPS → localhost)
// /           → status JSON
// /world.json → el mundo spider-garden como superficie expuesta + paleta
//               (solo bloques con un vecino aire, radio 96 alrededor del spawn;
//                array plano [x,y,z,idx,...] para no explotar la memoria)
const worldJsonCache = { data: null, built: false };
function buildWorldJson(radius = 48) {
  if (worldJsonCache.built) return worldJsonCache.data;
  const t0 = Date.now();
  const paletteList = [];
  const paletteIdx = new Map();
  const flat = [];
  const { minX, maxX, minZ, maxZ } = { // área alrededor del spawn
    minX: Math.floor(worldSpawn.x - radius), maxX: Math.ceil(worldSpawn.x + radius),
    minZ: Math.floor(worldSpawn.z - radius), maxZ: Math.ceil(worldSpawn.z + radius),
  };
  const isAir = (x, y, z) => {
    const b = world.getBlock(x, y, z);
    if (!b) return true; // sin chunk → borde: exportar
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
        // ¿intersecta el área pedida?
        if (chunkCx * 16 + 15 < minX || chunkCx * 16 > maxX || chunkCz * 16 + 15 < minZ || chunkCz * 16 > maxZ) continue;
        for (const section of sections) {
          const y0 = (section.Y ?? section.y ?? 0) * 16;
          if (y0 > 96 || y0 < -16) continue; // rango Y razonable
          let blocks = world.sectionBlocks.get(section);
          if (!blocks) { blocks = extractBlocks([section]); world.sectionBlocks.set(section, blocks); }
          for (const [k, name] of blocks) {
            const [lx, y, lz] = k.split(',').map(Number);
            const x = chunkCx * 16 + lx;
            const z = chunkCz * 16 + lz;
            if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
            // solo superficie: algún vecino aire
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
    spawn: worldSpawn,
    count: flat.length / 4,
    palette: paletteList,
    blocks: flat,
  };
  worldJsonCache.built = true;
  worldJsonCache.data = data;
  console.log(`[net] /world.json: ${data.count} bloques superficie, ${paletteList.length} tipos, ${Date.now() - t0}ms`);
  return data;
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Private-Network': 'true',
    });
    res.end();
    return;
  }
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
  };
  if (req.url === '/world.json') {
    try {
      const data = buildWorldJson();
      // stream como JSON — puede ser grande (cientos de KB)
      const body = JSON.stringify(data);
      res.writeHead(200, { ...cors, 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
    } catch (e) {
      res.writeHead(500, cors);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }
  res.writeHead(200, cors);
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
console.log('╚══════════════════════════════ hexapod ═══╝');
bootFromWorld();
setupSpiderBody(app); // cuerpo primero (orden de setupSpider.kt)
setupBehaviours(app);
setInterval(tick, TICK_MS);
const PORT = Number(process.env.SPIDER_SIM_PORT) || 8765;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[error] El puerto ${PORT} ya esta en uso.`);
    console.error('        Probablemente ya hay un simulador corriendo.');
    console.error('        Cerralo primero, o usa otro puerto: start-spider-sim.cmd 8766');
    console.error('        (el cliente MiniFeather espera 8765 por defecto)');
  } else {
    console.error('[error] servidor:', err.message);
  }
  process.exit(1);
});
server.listen(PORT, () => {
  console.log(`[net] ws://127.0.0.1:${PORT}/spiders  (cliente MiniFeather)`);
  console.log('[net] status http://127.0.0.1:' + PORT + '/');
});
