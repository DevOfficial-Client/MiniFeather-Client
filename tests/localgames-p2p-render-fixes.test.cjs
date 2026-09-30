const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src/World/LocalGames.js'), 'utf8');
const bridgeSource = fs.readFileSync(path.join(__dirname, '..', 'src/World/LocalGamesNetworkBridge.js'), 'utf8');

function namedFunction(code, name) {
  const plain = code.indexOf(`function ${name}(`);
  const asyncFn = code.indexOf(`async function ${name}(`);
  const start = asyncFn >= 0 && (plain < 0 || asyncFn < plain) ? asyncFn : plain;
  assert.ok(start >= 0, `${name} missing`);
  const open = code.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}' && --depth === 0) return code.slice(start, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

function expose(fnSource, sandbox) {
  const name = fnSource.match(/function ([a-zA-Z]+)/)[1];
  return vm.runInNewContext(`${fnSource}\n${name};`, sandbox);
}

test('waitIce honors the requested gathering timeout instead of clamping to 3.5s', () => {
  const timers = [];
  const sandbox = {
    ICE_GATHER_SETTLE_MS: 550,
    ICE_GATHER_MAX_MS: 3500,
    ICE_GATHER_MIN_MS: 1000,
    setTimeout: (callback, delay) => { timers.push(delay); return timers.length; },
    clearTimeout: () => {}
  };
  const waitIce = expose(namedFunction(source, 'waitIce'), sandbox);

  const pc = () => ({
    iceGatheringState: 'new',
    localDescription: { sdp: '' },
    addEventListener() {},
    removeEventListener() {}
  });

  waitIce(pc(), 10000);
  waitIce(pc());
  waitIce(pc(), 500);

  assert.deepEqual(timers, [10000, 8000, 1000]);
});

test('filterSeenSignalIds drops replayed signal ids and trims its memory', () => {
  const sandbox = {
    state: { signalSeenIds: new Set() },
    SIGNAL_SEEN_ID_LIMIT: 8
  };
  const filterSeenSignalIds = expose(namedFunction(source, 'filterSeenSignalIds'), sandbox);

  const first = filterSeenSignalIds([{ id: 'a' }, { id: 'b' }, { id: '' }]);
  assert.deepEqual(first.map(m => m.id), ['a', 'b', '']);

  const second = filterSeenSignalIds([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  assert.deepEqual(second.map(m => m.id), ['c']);

  for (let i = 0; i < 20; i++) filterSeenSignalIds([{ id: `id-${i}` }]);
  assert.ok(sandbox.state.signalSeenIds.size <= 8);
});

test('pruneStaleHostPeers removes only peers that never connected within the timeout', () => {
  const now = 1000000;
  const removed = [];
  const sandbox = {
    state: {
      mode: 'host',
      peers: new Map(),
      remotePlayers: new Map()
    },
    HOST_PEER_CONNECT_TIMEOUT_MS: 60000,
    removeRemotePlayerProxy: peerId => removed.push(peerId),
    closePeerConnection: () => {},
    broadcastRoster: () => {},
    logWarn: () => {}
  };
  const pruneStaleHostPeers = expose(namedFunction(source, 'pruneStaleHostPeers'), sandbox);

  const makePeer = over => ({
    connectedAt: 0,
    joinAnnounced: false,
    createdAt: now - 70000,
    ...over
  });

  sandbox.state.peers.set('stale', makePeer({}));
  sandbox.state.peers.set('connected', makePeer({ connectedAt: now - 50000 }));
  sandbox.state.peers.set('announced', makePeer({ joinAnnounced: true }));
  sandbox.state.peers.set('young', makePeer({ createdAt: now - 1000 }));

  pruneStaleHostPeers(now);

  assert.deepEqual([...sandbox.state.peers.keys()], ['connected', 'announced', 'young']);
  assert.deepEqual(removed, ['stale']);
});

test('pruneStaleRemoteProxies hides proxies whose moves stopped arriving', () => {
  const now = 500000;
  const sandbox = {
    state: {
      active: true,
      directLocal: true,
      mode: 'host',
      remotePlayers: new Map(),
      remoteEntityProxies: new Map()
    },
    REMOTE_PROXY_STALE_MS: 10000
  };
  const pruneStaleRemoteProxies = expose(namedFunction(source, 'pruneStaleRemoteProxies'), sandbox);

  const addPeer = (peerId, lastNativeUpdate) => {
    const proxy = { mesh: { visible: true } };
    sandbox.state.remotePlayers.set(peerId, { lastNativeUpdate });
    sandbox.state.remoteEntityProxies.set(peerId, proxy);
    return proxy;
  };

  const stale = addPeer('stale', now - 20000);
  const fresh = addPeer('fresh', now - 100);
  const neverMoved = addPeer('never', 0);

  pruneStaleRemoteProxies(now);

  assert.equal(stale.mesh.visible, false);
  assert.equal(fresh.mesh.visible, true);
  assert.equal(neverMoved.mesh.visible, true);
});

test('syncLocalPlayerProxyAnimation streams position, rotation and flags to the body proxy', () => {
  const captured = [];
  const player = {
    pos: { x: 1.5, y: 70, z: -2.25 },
    yaw: 1.2,
    pitch: 0.3,
    onGround: true,
    sneak: false,
    punching: false,
    isSprinting: () => true
  };
  const proxy = {
    serverPos: { set: (...args) => captured.push(args) },
    setSprinting(value) { this.sprinting = value; }
  };
  const sandbox = {
    state: { game: { player }, localPlayerProxy: proxy }
  };
  const sync = expose(namedFunction(source, 'syncLocalPlayerProxyAnimation'), sandbox);

  sync();

  assert.deepEqual(captured, [[48, 2240, -72]]);
  assert.equal(proxy.yaw, 1.2);
  assert.equal(proxy.pitch, 0.3);
  assert.equal(proxy.onGround, true);
  assert.equal(proxy.sprinting, true);
});

test('ensureLocalPlayerEntity respawns the proxy when the world dropped it', () => {
  const build = () => {
    const world = {
      players: new Map(),
      entities: new Map(),
      loadedEntityList: []
    };
    const game = {
      player: { pos: { x: 4, y: 70, z: 6 }, yaw: 0, pitch: 0 }
    };
    const state = {
      game,
      world,
      localPlayerId: -2147483000,
      localPlayerProxy: null,
      localPlayerEntityReady: false
    };
    let spawnCount = 0;
    const manager = {
      spawnPlayer(options) {
        spawnCount++;
        const proxy = { world: null, serverPos: { set() {} }, mesh: {} };
        world.players.set(options.id, proxy);
        world.entities.set(options.id, proxy);
        world.loadedEntityList.push(proxy);
      }
    };
    const sandbox = {
      state,
      resolveEntityManager: () => manager,
      profileSnapshot: () => ({ name: 'Tester', uuid: 'u1', cosmetics: {} }),
      currentGamemodeId: () => 1,
      logWarn: () => {}
    };
    return { sandbox, state, world, game, count: () => spawnCount };
  };

  const named = namedFunction(source, 'ensureLocalPlayerEntity');

  const orphan = build();
  const ensureOrphan = expose(named, orphan.sandbox);
  assert.equal(ensureOrphan(), true);
  assert.equal(orphan.count(), 1);
  assert.equal(orphan.state.localPlayerEntityReady, true);

  const adopted = build();
  const liveProxy = { world: adopted.world, serverPos: { set() {} }, mesh: {} };
  adopted.world.players.set(adopted.state.localPlayerId, liveProxy);
  adopted.world.entities.set(adopted.state.localPlayerId, liveProxy);
  adopted.world.loadedEntityList.push(liveProxy);
  adopted.state.localPlayerProxy = liveProxy;
  const ensureAdopted = expose(named, adopted.sandbox);
  assert.equal(ensureAdopted(), true);
  assert.equal(adopted.count(), 0);
});

test('watchTextureResync keeps watching until real materials are textured', () => {
  const cleared = [];
  let tick = null;
  let stats = { nativeMaterials: 0, textured: 0 };
  const sandbox = {
    state: { active: true, directLocal: true, textureWatchTimer: null },
    performance: { now: () => 1000 },
    log: () => {},
    logTrace: () => {},
    logWarn: () => {},
    emitState: () => {},
    repairLocalRender: () => stats,
    setInterval: callback => { tick = callback; return 7; },
    clearInterval: id => cleared.push(id)
  };
  const watchTextureResync = expose(namedFunction(source, 'watchTextureResync'), sandbox);

  watchTextureResync();
  assert.ok(tick, 'interval installed');

  tick();
  assert.ok(!cleared.includes(7), 'zero materials must not end the watch');

  stats = { nativeMaterials: 3, textured: 3 };
  tick();
  assert.ok(cleared.includes(7), 'fully textured ends the watch');
  assert.equal(sandbox.state.textureWatchTimer, null);
});

test('shareLinkOrigin keeps miniblox.online users on their site', () => {
  const make = origin => {
    const sandbox = { location: { origin } };
    return vm.runInNewContext(
      `${namedFunction(source, 'shareLinkOrigin')}\nshareLinkOrigin();`,
      sandbox
    );
  };

  assert.equal(make('https://miniblox.online'), 'https://miniblox.online');
  assert.equal(make('https://miniblox.io'), 'https://miniblox.io');
  assert.equal(make('https://www.crazygames.com'), 'https://miniblox.io');
});

test('network bridge fails publishes fast while the extension port is offline', () => {
  const responses = [];
  const sandbox = {
    document: { dispatchEvent: () => {} },
    port: null,
    pendingPublishes: new Map(),
    safeTopic: value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, ''),
    wireTopic: raw => `mflg${raw}`,
    connect: () => {},
    dispatchResponse: (requestId, ok, payload) => responses.push({ requestId, ok, payload })
  };
  const onRequest = expose(namedFunction(bridgeSource, 'onRequest'), sandbox);

  onRequest({
    detail: JSON.stringify({ requestId: 'r1', action: 'publish', topic: 'room', message: 'x' })
  });

  assert.equal(responses.length, 1);
  assert.equal(responses[0].requestId, 'r1');
  assert.equal(responses[0].ok, false);
  assert.equal(responses[0].payload.error, 'SIGNAL_BRIDGE_OFFLINE');
  assert.equal(sandbox.pendingPublishes.size, 0);
});

test('ensureLocalItemVisual creates the engine mesh when the entity was spawned without one', () => {
  const build = () => {
    const root = { children: [], add(child) { this.children.push(child); child.parent = this; } };
    let created = 0;
    const manager = {
      addEntity() {}, addLocalEntity() {}, collectEntity() {}, startDeathRagdoll() {},
      createDetachedMesh(entity) {
        created++;
        return { visible: false, position: { copy() {} }, render() {} };
      }
    };
    const world = {
      attachEntityMesh(entity) { if (entity.mesh) root.add(entity.mesh); }
    };
    const entity = {
      world: null,
      pos: { x: 5.5, y: 70.15, z: -3.5 },
      getEntityItem() { return { stackSize: 1, item: { isItemBlock: () => true } }; }
    };
    const sandbox = {
      state: {
        active: true,
        directLocal: true,
        world,
        game: { gameScene: { entityMeshes: root } },
        entityManager: null
      },
      resolveEntityManager: () => manager,
      requestAnimationFrame: () => {}
    };
    return { sandbox, root, entity, count: () => created };
  };

  const named = namedFunction(source, 'ensureLocalItemVisual');

  const meshless = build();
  const ensure = expose(named, meshless.sandbox);
  assert.equal(ensure(meshless.entity), true);
  assert.equal(meshless.count(), 1, 'engine mesh factory must be used');
  assert.ok(meshless.entity.mesh, 'entity.mesh must be assigned');
  assert.equal(meshless.entity.mesh.parent, meshless.root, 'mesh must land in entityMeshes');
  assert.equal(meshless.entity.mesh.visible, true);

  const withMesh = build();
  const existing = { visible: true, position: { copy() {} }, render() {}, parent: null };
  withMesh.entity.mesh = existing;
  const ensureAgain = expose(named, withMesh.sandbox);
  assert.equal(ensureAgain(withMesh.entity), true);
  assert.equal(withMesh.count(), 0, 'existing mesh must not be recreated');
  assert.equal(withMesh.entity.mesh.parent, withMesh.root, 'existing mesh must still be attached');
});

test('ensureLocalMobAnimation patches the LOD resolver once at prototype level', () => {
  const makeWorld = () => {
    const meshA = Object.create(null);
    const meshB = Object.create(null);
    const LivingProto = {
      mobResolver() {
        const t = player.pos.distanceToSquared(this.entity.pos);
        if (t > 1024) return this.fastLOD = true;
        return this.fastLOD;
      }
    };
    const player = { pos: { x: 0, y: 0, z: 0, distanceToSquared: () => 3200 } };
    const entity = { pos: { x: 40, y: 0, z: 40 } };
    meshA.entity = entity;
    meshB.entity = entity;
    meshA.render = () => {};
    meshB.render = () => {};
    Object.setPrototypeOf(meshA, LivingProto);
    Object.setPrototypeOf(meshB, LivingProto);

    const state = { mobLodPatch: null, mobLodPatchProbe: null };
    const sandbox = { state };
    const ensure = vm.runInNewContext(
      `${namedFunction(source, 'findLocalMobLodResolver')}\n${namedFunction(source, 'ensureLocalMobAnimation')}\nensureLocalMobAnimation;`,
      sandbox
    );
    const restore = expose(namedFunction(source, 'restoreLocalMobAnimationPatch'), sandbox);
    return { LivingProto, meshA, meshB, state, ensure, restore, player };
  };

  const world = makeWorld();
  const original = world.LivingProto.mobResolver;

  assert.equal(world.ensure({ entity: { mesh: world.meshA } }), world.meshA);
  assert.ok(world.state.mobLodPatch, 'prototype patch must be recorded');
  assert.equal(world.meshA.mobResolver(), false);
  assert.equal(world.meshA.fastLOD, false);

  // Segundo mob, mismo prototype: sin re-parchear (probe/proto ya cubierto)
  assert.equal(world.ensure({ entity: { mesh: world.meshB } }), world.meshB);
  assert.equal(world.meshB.mobResolver(), false);

  world.restore();
  assert.equal(world.state.mobLodPatch, null);
  assert.equal(world.LivingProto.mobResolver, original);
  assert.equal(world.meshB.mobResolver(), true, 'original distance logic restored');
});

function exposePair(names, sandbox) {
  const body = names.map(n => namedFunction(source, n)).join('\n');
  const tail = `({ ${names.join(', ')} });`;
  return vm.runInNewContext(`${body}\n${tail}`, sandbox);
}

test('fillLocalTerrainColumn reproduces the native column layering', () => {
  const placed = [];
  const setLocal = (x, y, z, blockState) => placed.push([x, y, z, blockState.name]);
  const blocks = {
    bedrock: { name: 'bedrock' },
    stone: { name: 'stone' },
    dirt: { name: 'dirt' },
    grass: { name: 'grass' },
    sand: { name: 'sand' },
    gravel: { name: 'gravel' },
    water: { name: 'water' },
    bottomY: 40,
    seaLevel: 62
  };
  const sandbox = { state: { worldSeed: 12345 }, setLocal, blocks, placed };
  const { hash2D, fillLocalTerrainColumn: fill } = exposePair(['hash2D', 'fillLocalTerrainColumn'], sandbox);

  fill(10, 20, 68, setLocal, blocks);

  assert.equal(placed[0][3], 'bedrock');
  assert.equal(placed[0][1], 40);
  assert.equal(placed.at(-1)[3], 'grass');
  assert.equal(placed.at(-1)[1], 68);
  assert.ok(placed.some(([x, y, z, name]) => name === 'stone' && y === 63), 'stone below surface');
  assert.ok(placed.some(([x, y, z, name]) => name === 'dirt' && y === 67), 'dirt subsurface');
  assert.ok(!placed.some(([x, y, z, name]) => name === 'water'), 'dry column has no water');

  placed.length = 0;
  fill(10, 20, 55, setLocal, blocks);
  assert.ok(placed.some(([x, y, z, name]) => name === 'sand' && y === 55), 'shore gets sand');
  assert.ok(placed.some(([x, y, z, name]) => name === 'water' && y === 62), 'water up to sea level');
});

test('streaming helpers: initial-terrain skip and world bounds expansion', () => {
  const bounds = { minX: -112, maxX: 127, minZ: -112, maxZ: 127 };
  const sandbox = {
    state: { worldBounds: bounds },
    LOCAL_TERRAIN_STREAM_INITIAL_CHUNK: 7
  };
  const { isInsideInitialTerrain: isInside, expandLocalWorldBounds: expand } =
    exposePair(['isInsideInitialTerrain', 'expandLocalWorldBounds'], sandbox);

  assert.equal(isInside(0, 0), true);
  assert.equal(isInside(7, -7), true);
  assert.equal(isInside(8, 0), false);
  assert.equal(isInside(-40, 3), false);

  expand(10, -10);
  assert.equal(bounds.maxX, 175);
  assert.equal(bounds.minZ, -160);
  expand(-12, 4);
  assert.equal(bounds.minX, -192);
  assert.equal(bounds.maxZ, 127, 'maxZ never shrinks');
});

test('streaming wiring: driver, caps and resets are installed', () => {
  assert.match(source, /streamLocalTerrainTick\(\)\.catch/);
  assert.match(source, /LOCAL_TERRAIN_STREAM_MAX_CHUNKS/);
  assert.match(source, /mflg:streamRadius/);
  assert.match(source, /mflg:streamCap/);
  assert.match(source, /state\.streamedChunks\?\.clear\(\)/);
  assert.match(source, /restoreLocalMobAnimationPatch\(\)/);
  assert.doesNotMatch(source, /animationPatch: null/);
});

function exposeManyFrom(code, names, sandbox) {
  const body = names.map(n => namedFunction(code, n)).join(String.fromCharCode(10));
  const tail = '({ ' + names.join(', ') + ' });';
  return vm.runInNewContext(body + String.fromCharCode(10) + tail, sandbox);
}

function exposeMany(names, sandbox) {
  const body = names.map(n => namedFunction(source, n)).join('\n');
  const tail = `({ ${names.join(', ')} });`;
  return vm.runInNewContext(`${body}\n${tail}`, sandbox);
}

test('ClientCommands merges MiniFeather commands into server tab completion', () => {
  const commandsSource = fs.readFileSync(
    path.join(__dirname, '..', 'src/Chat/ClientCommands.js'),
    'utf8'
  );

  const chat = {
    isInputCommandMode: true,
    autoComplete: { active: false, list: [], index: -1 },
    currentCompletionWord() { return this.__word; },
    autoCompleteReceived(packet) {
      const matches = (Array.isArray(packet?.matches) ? packet.matches : [])
        .map(match => String(match).replace(/^\//, ''))
        .filter(match => match.toLowerCase().startsWith(this.__word.toLowerCase()));
      if (!matches.length) return;
      this.autoComplete.active = true;
      this.autoComplete.list = matches;
    }
  };
  const sandbox = {
    RECOGNIZED: new Set(['mesh', 'mf', 'model', 'baritone', 'emote', 'toggle'])
  };
  const install = expose(namedFunction(commandsSource, 'installAutoCompleteMerge'), sandbox);
  install(chat);

  // '/mo' + Tab: server returns nothing -> merge re-opens with MiniFeather matches
  chat.__word = 'mo';
  chat.autoCompleteReceived({ matches: [] });
  assert.deepEqual([...chat.autoComplete.list], ['model']);

  // '/t' + Tab: server returns '/time' -> merged with ours ('toggle')
  chat.__word = 't';
  chat.autoCompleteReceived({ matches: ['/time'] });
  assert.deepEqual([...chat.autoComplete.list], ['time', 'toggle']);

  // plain chat word: no command injection
  chat.__word = 'hello';
  chat.isInputCommandMode = false;
  chat.autoCompleteReceived({ matches: ['hello_friend'] });
  assert.deepEqual([...chat.autoComplete.list], ['hello_friend']);
  chat.isInputCommandMode = true;

  // double install must not double-patch
  install(chat);
  chat.__word = 'mo';
  chat.autoCompleteReceived({ matches: [] });
  assert.equal(chat.autoComplete.list.filter(name => name === 'model').length, 1);
});

function commandsConstBlock(code, name) {
  const start = code.indexOf(`const ${name} = `);
  assert.ok(start >= 0, `${name} missing`);
  const open = code.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}' && --depth === 0) return code.slice(start, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

test('miniFeatherCompletions completes commands and argument variants', () => {
  const commandsSource = fs.readFileSync(
    path.join(__dirname, '..', 'src/Chat/ClientCommands.js'),
    'utf8'
  );
  const recognizedLine = commandsSource
    .split(/\r?\n/)
    .find(line => line.startsWith('  const RECOGNIZED = '));
  assert.ok(recognizedLine, 'RECOGNIZED declaration missing');

  const script = [
    recognizedLine,
    commandsConstBlock(commandsSource, 'COMPLETION_TREE'),
    namedFunction(commandsSource, 'miniFeatherCompletions')
  ].join(';\n');

  const fns = vm.runInNewContext(script + ';({ miniFeatherCompletions });', {});

  assert.deepEqual([...fns.miniFeatherCompletions('')], [], 'bare slash lets the server list flow');
  assert.deepEqual([...fns.miniFeatherCompletions('bari')], ['baritone']);
  assert.deepEqual([...fns.miniFeatherCompletions('baritone auto')], ['automine']);
  assert.ok(fns.miniFeatherCompletions('baritone ').includes('automine'), 'full variant list');
  assert.deepEqual([...fns.miniFeatherCompletions('verity autoreply ')], ['off', 'on'], 'nested variants');
  assert.deepEqual([...fns.miniFeatherCompletions('verity auto')], ['autoreply']);
  assert.deepEqual([...fns.miniFeatherCompletions('waypoint ')], ['add', 'list', 'remove']);
  assert.deepEqual([...fns.miniFeatherCompletions('time ')], [], 'unknown command -> server flow');
  assert.deepEqual([...fns.miniFeatherCompletions('toggle')], ['toggle'], 'completing the command name');
});

test('sendTabComplete serves MiniFeather variants locally without hitting the server', () => {
  const commandsSource = fs.readFileSync(
    path.join(__dirname, '..', 'src/Chat/ClientCommands.js'),
    'utf8'
  );
  const chat = {
    isInputCommandMode: true,
    inputValue: 'baritone auto',
    autoComplete: { active: false, list: [], index: -1 },
    currentCompletionWord() { return this.__word; },
    autoCompleteReceived(packet) { this.autoComplete.list = ['time']; this.autoComplete.active = true; },
    sendTabComplete() { this.sentToServer = true; }
  };
  const sandbox = {
    RECOGNIZED: new Set(['baritone', 'toggle']),
    COMPLETION_TREE: { baritone: ['goto', 'automine', 'stop'] }
  };
  const install = expose(namedFunction(commandsSource, 'installAutoCompleteMerge'), sandbox);
  install(chat);

  chat.sendTabComplete(true);
  assert.deepEqual([...chat.autoComplete.list], ['automine'], 'local variants served');
  assert.equal(chat.sentToServer, undefined, 'no packet sent for MiniFeather commands');

  chat.inputValue = 'time';
  chat.__word = 'time';
  chat.sendTabComplete(true);
  assert.equal(chat.sentToServer, true, 'non-MiniFeather words fall through to the server');

  chat.autoComplete.list = [];
  chat.autoComplete.active = false;
  chat.inputValue = '';
  chat.__word = '';
  chat.autoCompleteReceived({ matches: ['/time'] });
  assert.deepEqual([...chat.autoComplete.list].sort(), ['baritone', 'time', 'toggle'], 'bare slash merges ours into the official list');
});


const freecamSource = fs.readFileSync(
  path.join(__dirname, '..', 'src/Render/FreeCam.js'),
  'utf8'
);

function makeFakeVec3(x = 0, y = 0, z = 0) {
  return {
    x, y, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
    clone() { return makeFakeVec3(this.x, this.y, this.z); }
  };
}

class FakeEuler {
  constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
    this.x = x; this.y = y; this.z = z; this.order = order;
  }
  setFromQuaternion() { this.__synced = true; }
}

class FakeQuaternion {
  constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
  set(nx, ny, nz, nw) { this.x = nx; this.y = ny; this.z = nz; this.w = nw; return this; }
  setFromEuler(euler) {
    this.__euler = { pitch: euler.x, yaw: euler.y, order: euler.order };
    return this;
  }
  invert() { return this; }
  premultiply() { return this; }
}

function makeFakeQuaternion() {
  return new FakeQuaternion();
}

function makeFakeFreecamCamera(rigPosition) {
  const parent = {
    position: rigPosition,
    updateWorldMatrix() {},
    worldToLocal(vec) {
      vec.x -= rigPosition.x;
      vec.y -= rigPosition.y;
      vec.z -= rigPosition.z;
      return vec;
    },
    getWorldQuaternion(q) { return q.set(0, 0, 0, 1); }
  };
  const camera = {
    parent,
    position: makeFakeVec3(0, 0, 0),
    rotation: new FakeEuler(0, 0, 0, 'XYZ'),
    quaternion: makeFakeQuaternion()
  };
  return { camera, parent };
}

test('FreeCam applyPose converts world coordinates into the engine rig space', () => {
  const sandbox = {
    state: {
      enabled: true,
      freePosition: { x: 1000, y: 71.6, z: 2000 },
      pitch: 0.1,
      yaw: 2.5
    },
    copyXYZ(target, source) { target.x = source.x; target.y = source.y; target.z = source.z; return true; },
    copyQuaternion(target, source) { target.x = source.x; target.y = source.y; target.z = source.z; target.w = source.w; return true; }
  };
  const applyPose = expose(namedFunction(freecamSource, 'applyPose'), sandbox);

  // El rig del motor esta EN el jugador (1000, 70, 2000): el bug aplicaba las
  // coordenadas de mundo como locales y la camera acababa al doble de distancia.
  const rig = makeFakeFreecamCamera(makeFakeVec3(1000, 70, 2000));
  applyPose(rig.camera);

  const local = rig.camera.position;
  assert.ok(Math.abs(local.x) < 1e-9, 'local x must be ~0, got ' + local.x);
  assert.ok(Math.abs(local.y - 1.6) < 1e-9, 'local y must be ~1.6, got ' + local.y);
  assert.ok(Math.abs(local.z) < 1e-9, 'local z must be ~0, got ' + local.z);
  assert.equal(rig.camera.rotation.order, 'YXZ');
  assert.equal(rig.camera.rotation.__synced, true, 'rotation synced from world quaternion');
  assert.ok(Number.isFinite(rig.camera.quaternion.w), 'quaternion carries a valid rotation');

  // Camera sin padre (despegada a la escena): coords directas
  const free = makeFakeFreecamCamera(makeFakeVec3(0, 0, 0));
  free.camera.parent = null;
  applyPose(free.camera);
  assert.equal(free.camera.position.x, 1000);
  assert.equal(free.camera.position.y, 71.6);
  assert.equal(free.camera.position.z, 2000);
});


test('FreeCam wires F5 cycling, player clone and panel key passthrough', () => {
  assert.match(freecamSource, /event\.code === 'F5'/, 'F5 handler missing');
  assert.match(freecamSource, /player\.perspective = \(Number\(player\.perspective\) \+ 1\) % 3/, 'perspective cycle missing');
  assert.match(freecamSource, /function applyFreeClone\(\)/, 'clone-follow missing');
  assert.match(freecamSource, /applyFreeClone\(\);/, 'clone-follow must run inside the camera hook');
  assert.match(freecamSource, /manager\.spawnPlayer\(\{/, 'clone must spawn as a player entity with the same skin');
  assert.match(freecamSource, /removeFreeClone\(\);/, 'clone must be removed when freecam disables');
  assert.match(freecamSource, /front \? state\.yaw \+ Math\.PI : state\.yaw/, 'front-face flip missing');
  assert.match(freecamSource, /requestPointerLock\?\.\(\)/, 'canvas re-lock missing');
  // ShiftRight ya no es tecla de movimiento: queda libre para el panel
  assert.doesNotMatch(freecamSource, /'Space', 'ShiftLeft', 'ShiftRight'/);
  assert.match(freecamSource, /'Space', 'ShiftLeft',/);
});

function makeCloneWorld() {
  const world = {
    entities: new Map(),
    players: new Map(),
    getEntityIncludingQueued: id => world.entities.get(id) ?? null,
    addPlayer(entity) { world.players.set(entity.id, entity); world.entities.set(entity.id, entity); },
    removeEntityFromWorld() {},
    removeEntity(entity) { world.entities.delete(entity.id); }
  };
  const spawned = [];
  const manager = {
    addEntity() {}, addLocalEntity() {}, collectEntity() {}, startDeathRagdoll() {},
    spawnPlayer(options) {
      const entity = {
        id: options.id,
        name: options.name,
        cosmetics: options.cosmetics,
        mesh: { visible: false },
        serverPos: { set(x, y, z) { entity.serverPosValue = [x, y, z]; } },
        setPositionAndRotation2(x, y, z, yaw) { entity.pose = [x, y, z, yaw]; }
      };
      spawned.push(options);
      world.addPlayer(entity);
    }
  };
  return { world, manager, spawned };
}

test('FreeCam clone spawns with the player skin and follows the camera per perspective', () => {
  const { world, manager, spawned } = makeCloneWorld();
  const sandbox = {
    state: {
      enabled: true,
      player: { perspective: 1, getEyeHeight: () => 1.62, profile: { username: 'Tester', uuid: 'u1', skin: 'steve' } },
      yaw: 0,
      freePosition: { x: 10, y: 70, z: 20 },
      game: { world, player: { profile: { username: 'Tester', uuid: 'u1', skin: 'steve' } } },
      clone: null,
      cloneManager: null
    },
    __MINIFEATHER_LOCAL_GAMES__: { state: { moduleNamespace: { mgr: manager } } },
    console: { warn() {} },
    FREE_BODY_DISTANCE: 3.2,
    FREECAM_CLONE_ID: -2147483641
  };
  const fns = exposeManyFrom(freecamSource, ['looksLikeEntityManager', 'resolveCloneManager', 'ensureFreeClone', 'removeFreeClone', 'applyFreeClone'], sandbox);

  const clone = fns.ensureFreeClone();
  assert.ok(clone, 'clone spawned');
  assert.equal(spawned[0].cosmetics.skin, 'steve', 'same skin as the player');
  assert.equal(spawned[0].name, 'Tester');
  assert.equal(fns.ensureFreeClone(), clone, 'existing clone reused');
  assert.equal(spawned.length, 1);

  sandbox.state.yaw = 0;
  fns.applyFreeClone();
  assert.equal(clone.mesh.visible, true);
  assert.ok(Math.abs(clone.pose[2] - 16.8) < 1e-9, 'clone placed ahead of the camera view');
  assert.ok(Math.abs(clone.pose[3] - Math.PI) < 1e-9, 'front view: clone faces the camera');

  sandbox.state.player.perspective = 2;
  fns.applyFreeClone();
  assert.ok(Math.abs(clone.pose[3]) < 1e-9, 'back view: clone faces away');

  sandbox.state.player.perspective = 0;
  fns.applyFreeClone();
  assert.equal(clone.mesh.visible, false, 'first person hides the clone');

  sandbox.state.player.perspective = 1;
  fns.removeFreeClone();
  assert.equal(sandbox.state.clone, null);
  assert.equal(world.entities.has(-2147483641), false);
});

test('FreeCam clone never breaks the camera, even when it explodes', () => {
  const { world, manager } = makeCloneWorld();
  const camera = {
    parent: null,
    position: makeFakeVec3(0, 0, 0),
    rotation: new FakeEuler(0, 0, 0, 'XYZ'),
    quaternion: new FakeQuaternion(),
    updateMatrixWorld() { this.originalRan = true; },
    updateWorldMatrix() {}
  };
  const poisoned = {};
  Object.defineProperty(poisoned, 'mesh', {
    get() { throw new Error('boom'); },
    configurable: true
  });
  const sandbox = {
    state: {
      enabled: true,
      player: { perspective: 1, getEyeHeight: () => 1.62 },
      yaw: 0,
      freePosition: { x: 1, y: 2, z: 3 },
      game: { world },
      clone: poisoned,
      cloneManager: manager,
      camera: camera,
      matrixHook: null,
      worldMatrixHook: null
    },
    __MINIFEATHER_LOCAL_GAMES__: { state: { moduleNamespace: null } },
    console: { warn() {} },
    FREE_BODY_DISTANCE: 3.2,
    FREECAM_CLONE_ID: -2147483641,
    applyPose: camera2 => { camera2.position.set(9, 9, 9); camera2.__poseApplied = true; },
    applyFreeClone: () => { throw new Error('clone exploded'); }
  };
  const install = expose(namedFunction(freecamSource, 'installCameraHooks'), sandbox);
  install(camera);

  let escaped = null;
  try { camera.updateMatrixWorld(); } catch (error) { escaped = error; }
  assert.equal(escaped, null, 'the camera hook must never throw');
  assert.equal(camera.originalRan, true, 'original updateMatrixWorld must run (no frozen view)');
  assert.equal(camera.__poseApplied, true, 'pose applied before the clone hook');

  const resolveCanvas = expose(namedFunction(freecamSource, 'resolveGameCanvas'), {
    state: { game: { gameScene: { renderer: { domElement: { id: 'engine-canvas' } } } } },
    document: { querySelector: () => ({ id: 'fallback-canvas' }) }
  });
  assert.equal(resolveCanvas().id, 'engine-canvas', 'prefers the engine canvas');
  const fallback = expose(namedFunction(freecamSource, 'resolveGameCanvas'), {
    state: { game: {} },
    document: { querySelector: () => ({ id: 'fallback-canvas' }) }
  });
  assert.equal(fallback().id, 'fallback-canvas', 'falls back to any canvas');
});

test('loop wiring: peer prune, stale proxy hide and move cadence are installed', () => {
  assert.match(source, /pruneStaleHostPeers\(Date\.now\(\)\)/);
  assert.match(source, /pruneStaleRemoteProxies\(now\);/);
  assert.match(source, /now - state\.lastMoveSend >= LOCAL_MOVE_SEND_INTERVAL_MS/);
  assert.match(source, /manager\.createDetachedMesh\(entity\)/);
  assert.match(source, /typeof world\.attachEntityMesh === 'function'/);
  assert.doesNotMatch(source, /function keepLocalWorldInDaylight/);
  assert.doesNotMatch(source, /function repairZeroColorAttribute/);
});
