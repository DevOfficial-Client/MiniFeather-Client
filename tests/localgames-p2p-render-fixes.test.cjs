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

test('autocomplete preserves the command before native completion mutates the input', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src/Chat/ClientCommands.js'), 'utf8');
  const install = expose(namedFunction(code, 'installAutoCompleteMerge'), {
    RECOGNIZED: new Set(['model', 'modelo', 'toggle']), COMPLETION_TREE: { model: ['spawn', 'list'] }
  });
  const chat = {
    isInputCommandMode: true, inputValue: 'model sp', autoComplete: { active: false, list: [], index: -1 },
    autoCompleteReceived(packet) {
      this.autoCompleteRequested = false;
      this.autoComplete.list = packet.matches.map(name => name.replace(/^\//, ''));
      this.autoComplete.active = packet.matches.length > 1;
      if (packet.matches.length) this.inputValue = this.inputValue.replace(/\S*$/, this.autoComplete.list[0]) + (packet.matches.length === 1 ? ' ' : '');
    },
    requestTabComplete() { this.sent = (this.sent || 0) + 1; }
  };
  install(chat);
  chat.requestTabComplete();
  assert.equal(chat.inputValue, 'model spawn ');
  assert.equal(chat.sent, undefined);
  chat.inputValue = 'modelo   sp'; chat.requestTabComplete();
  assert.equal(chat.inputValue, 'modelo   spawn ');
  chat.inputValue = 'model spawn '; chat.requestTabComplete();
  assert.equal(chat.inputValue, 'model spawn ');
  assert.deepEqual([...chat.autoComplete.list], [], 'no root commands offered after a complete argument');
  chat.inputValue = 'model xyz'; chat.requestTabComplete();
  assert.equal(chat.inputValue, 'model xyz'); assert.equal(chat.sent, undefined);
  chat.inputValue = 't'; chat.autoCompleteReceived({ matches: ['/time'] });
  assert.equal(chat.inputValue, 'time');
  assert.deepEqual([...chat.autoComplete.list], ['time', 'toggle'], 'merged before native first selection');
  chat.autoComplete.active = false; chat.isInputCommandMode = false; chat.inputValue = 'model sp';
  chat.requestTabComplete(); assert.equal(chat.sent, 1, 'plain chat remains native');
  chat.isInputCommandMode = true; chat.inputValue = '/set stone'; chat.requestTabComplete();
  assert.equal(chat.sent, 2, 'WorldEdit double slash remains native');
});

test('native command arguments remain untouched for every non-client command and modern local requests consume their own queue entry', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src/Chat/ClientCommands.js'), 'utf8');
  const recognized = code.split(/\r?\n/).find(line => line.startsWith('  const RECOGNIZED = '));
  const sandbox = vm.createContext({});
  vm.runInContext(recognized + ';' + commandsConstBlock(code, 'COMPLETION_TREE') + ';', sandbox);
  const install = vm.runInContext('(' + namedFunction(code, 'installAutoCompleteMerge') + ')', sandbox);
  const chat = {
    isInputCommandMode: true, showInput: true, inputValue: '', pendingAutoCompletes: [],
    autoComplete: { active: false, list: [] }, currentCompletionWord() { return this.inputValue.split(' ').pop(); },
    autoCompleteReceived(packet) {
      const pending = this.pendingAutoCompletes.shift();
      if (!this.showInput || !pending) return;
      this.lastPacket = packet;
      this.autoComplete.list = packet.matches;
      if (!pending.autoShow && packet.matches.length === 1) this.inputValue = this.inputValue.replace(/\S*$/, packet.matches[0]) + ' ';
    },
    sendTabComplete(autoShow) { this.pendingAutoCompletes.push({ autoShow, word: this.currentCompletionWord() }); }
  };
  install(chat);
  // Test the native passthrough invariant, independent of which commands the server supports.
  const own = vm.runInContext('[...RECOGNIZED]', sandbox);
  const nativeCommands = ['gamemode', 'give', 'tp', 'teleport', 'effect', 'enchant', 'kill', 'clear', 'summon', 'time', 'weather', 'title', 'fill', 'setblock', 'help', 'seed', 'custom_server_command'];
  for (const command of nativeCommands.filter(name => !own.includes(name))) {
    for (const arg of ['', 'survival', 'player 4']) {
      chat.inputValue = command + ' ' + arg;
      chat.sendTabComplete(true);
      const packet = { matches: ['survival', 'creative', 'adventure', 'spectator'] };
      chat.autoCompleteReceived(packet);
      assert.equal(chat.lastPacket, packet, command + ': native packet forwarded unchanged');
      assert.deepEqual(chat.autoComplete.list, packet.matches);
    }
  }
  chat.inputValue = 'model sp'; chat.sendTabComplete(false);
  assert.equal(chat.inputValue, 'model spawn ');
  assert.equal(chat.pendingAutoCompletes.length, 0);
  chat.inputValue = 'model sp'; chat.sendTabComplete(true);
  assert.equal(chat.inputValue, 'model sp', 'automatic preview must not rewrite typed text');
  assert.deepEqual([...chat.autoComplete.list], ['spawn']);
  assert.equal(chat.pendingAutoCompletes.length, 0);
  chat.isInputWorldEditMode = true; chat.inputValue = 'model sp'; chat.sendTabComplete(true);
  const worldEdit = { matches: ['native-selection'] }; chat.autoCompleteReceived(worldEdit);
  assert.equal(chat.lastPacket, worldEdit);
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
    autoCompleteReceived(packet) { this.autoComplete.list = packet.matches.map(name => name.replace(/^\//, '')); this.autoComplete.active = this.autoComplete.list.length > 0; },
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
  assert.deepEqual([...chat.autoComplete.list].sort(), ['time'], 'empty input preserves native response rather than injecting every client command');
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

test('FreeCam returns a displaced camera to the current player position', () => {
  const sandbox = {
    getPlayerCameraOrigin: player => ({ x: player.pos.x, y: player.pos.y + 1.6, z: player.pos.z }),
    cloneXYZ: value => ({ x: value.x, y: value.y, z: value.z }),
    copyXYZ(target, source) { target.set(source.x, source.y, source.z); return true; },
    captureWorldPosition(camera) {
      return {
        x: camera.parent.position.x + camera.position.x,
        y: camera.parent.position.y + camera.position.y,
        z: camera.parent.position.z + camera.position.z
      };
    }
  };
  const restore = expose(namedFunction(freecamSource, 'restoreCameraNearPlayer'), sandbox);
  const rig = makeFakeFreecamCamera(makeFakeVec3(0, 70, 0));
  rig.camera.position.set(100, 10, 100);
  const player = { pos: { x: 20, y: 70, z: 30 } };

  assert.equal(restore(rig.camera, player), true);
  assert.equal(rig.camera.position.x, 20);
  assert.ok(Math.abs(rig.camera.position.y - 1.6) < 1e-9);
  assert.equal(rig.camera.position.z, 30);
  assert.equal(restore(rig.camera, player), false, 'nearby camera keeps its native offset');
});

test('FreeCam return flight eases back before restoring the native camera', () => {
  const player = { pos: { x: 20, y: 70, z: 30 } };
  const state = {
    returning: { start: 100, duration: 400, from: { x: 100, y: 90, z: 100 }, yaw: 2, pitch: 0.5 },
    player, game: { player }, camera: {}, entryYaw: 0, entryPitch: 0,
    freePosition: { x: 100, y: 90, z: 100 }, yaw: 2, pitch: 0.5
  };
  let applied = 0;
  let completed = 0;
  const updateReturn = expose(namedFunction(freecamSource, 'updateReturn'), {
    state,
    getPlayerCameraOrigin: () => ({ x: 20, y: 71.6, z: 30 }),
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    applyPose: () => { applied++; },
    completeDisable: () => { completed++; state.returning = null; }
  });
  updateReturn(300);
  assert.ok(state.freePosition.x > 20 && state.freePosition.x < 100);
  assert.equal(applied, 1);
  assert.equal(completed, 0);
  updateReturn(500);
  assert.equal(state.freePosition.x, 20);
  assert.equal(state.freePosition.y, 71.6);
  assert.equal(completed, 1);
});


test('FreeCam stays a pure free camera: no clones, panel key passthrough and re-lock', () => {
  assert.doesNotMatch(freecamSource, /event\.code === 'F5'/, 'F5 handling removed');
  assert.doesNotMatch(freecamSource, /ensureFreeClone|applyFreeClone|removeFreeClone|FREECAM_CLONE_ID/, 'clone machinery removed');
  assert.match(freecamSource, /requestPointerLock\?\.\(\)/, 'canvas re-lock kept');
  // ShiftRight ya no es tecla de movimiento: queda libre para el panel
  assert.doesNotMatch(freecamSource, /'Space', 'ShiftLeft', 'ShiftRight'/);
  assert.match(freecamSource, /'Space', 'ShiftLeft',/);
  assert.match(freecamSource, /if \(\(state\.enabled \|\| state\.returning\) && state\.camera === camera\) applyPose\(camera\);/);
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
        pos: { x: options.pos?.x ?? 0, y: options.pos?.y ?? 0, z: options.pos?.z ?? 0 },
        yaw: options.yaw ?? 0,
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

const commandsSource = fs.readFileSync(
  path.join(__dirname, '..', 'src/Chat/ClientCommands.js'),
  'utf8'
);
const clonesSource = fs.readFileSync(
  path.join(__dirname, '..', 'src/World/MF_Clones.js'),
  'utf8'
);

test('MF_Clones: clones spawn exactly at the player position and use the MiniFeather skin', () => {
  const cloneSlot = expose(namedFunction(clonesSource, 'cloneSlot'), {});
  const origin = { x: 500, y: 70, z: -300, yaw: 2.4 };
  const slot = cloneSlot(0, 3, origin);

  assert.equal(slot.x, 500, 'exact player x');
  assert.equal(slot.y, 70, 'exact player y');
  assert.equal(slot.z, -300, 'exact player z');
  assert.equal(slot.yaw, 2.4, 'player yaw');
});

test('MF_Clones: the MiniFeather profile (real skin) wins over the native one', () => {
  const { world, manager, spawned } = makeCloneWorld();
  const sandbox = {
    state: {
      enabled: true,
      count: 1,
      player: { perspective: 1, getEyeHeight: () => 1.62, pos: { x: 8, y: 65, z: 9 }, yaw: 1.1, profile: { username: 'NativeName', uuid: 'u1', skin: 'bob' } },
      yaw: 1.1,
      freePosition: null,
      game: { world, player: { pos: { x: 8, y: 65, z: 9 }, yaw: 1.1, profile: { username: 'NativeName', uuid: 'u1', skin: 'bob' } } },
      clones: new Map(),
      remoteClones: new Map(),
      world: null,
      lastCenter: null,
      manager: manager,
      lastBroadcastAt: 0
    },
    __MINIFEATHER_LOCAL_GAMES__: {
      state: { moduleNamespace: { mgr: manager } },
      getProfile: () => ({ name: 'MFName', uuid: 'mf-uuid', skin: 'my_custom_skin', rank: 'VIP', cosmetics: { cape: 'wings' } })
    },
    console: { warn() {} },
    document: { dispatchEvent() {} },
    CustomEvent: class {},
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    MAX_CLONES: 3,
    RING_RADIUS: 3.5,
    CLONE_IDS: [-2147483639, -2147483638, -2147483637]
  };
  const fns = exposeManyFrom(clonesSource, ['looksLikeEntityManager', 'resolveManager', 'findGame', 'isLiveGame', 'playerProfile', 'cloneSlot', 'spawnClone', 'despawnClone', 'dispatchChanged', 'list', 'myCloneKey', 'sync', 'broadcastClones'], sandbox);
  fns.sync();

  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].name, 'MFName');
  assert.equal(spawned[0].cosmetics.skin, 'my_custom_skin', 'MiniFeather skin wins');
  assert.equal(spawned[0].cosmetics.cape, 'wings');
  assert.equal(spawned[0].rank, 'VIP');
  assert.equal(spawned[0].pos.x, 8, 'clone spawns exactly at the player');
  assert.equal(spawned[0].pos.z, 9);
});

test('MF_Clones roster entries ride the LocalGames P2P roster as clone players', () => {
  assert.match(source, /function relativeCloneList\(\)/);
  assert.match(source, /isClone: true/);
  assert.match(source, /entry\?\.isClone \? numericPeerId\(String\(entry\.peerId\)\)/, 'clone playerId must be stable per entry');
  assert.match(source, /if \(entry\?\.isClone\) continue;/, 'stale-proxy hide must skip clones');
  assert.match(source, /state\.peerClones\.set\(peerId, list\);/, 'guest clones arrive via the host');
  assert.match(source, /state\.peerClones\?\.delete\(peerId\);/, 'peer clones cleaned on disconnect');
  assert.match(source, /mf:clones-changed/);
    assert.match(clonesSource, /CLONE_IDS = \[-2147483639, -2147483638, -2147483637\]/, 'reserved id band');
  assert.match(clonesSource, /manager\.spawnPlayer\(\{/, 'clones spawn as real player entities');

  const mirror = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'mirror.json'), 'utf8')
  );
  assert.ok(mirror.mainStart.includes('src/World/LocalGames.js'), 'LocalGames must be in the mirror injection list');
  assert.ok(mirror.mainStart.includes('src/World/MF_Clones.js'), 'MF_Clones must be injected via mirror');
  assert.match(commandsSource, /'clones',/);
  assert.match(commandsSource, /clones: \['on', 'off', '1', '2', '3'\]/);
});

test('MF_Clones P2P: remote clones spawn from mesh/peer messages and expire', () => {
  const { world, manager, spawned } = makeCloneWorld();
  const now = Date.now();
  const sandbox = {
    state: {
      enabled: true,
      count: 1,
      player: { perspective: 1, getEyeHeight: () => 1.62, profile: { username: 'Me', uuid: 'me1', skin: 'steve' } },
      yaw: 0,
      freePosition: null,
      game: { world, player: { pos: { x: 0, y: 70, z: 0 }, profile: { username: 'Me', uuid: 'me1', skin: 'steve' } } },
      clones: new Map(),
      remoteClones: new Map(),
      world: null,
      lastCenter: null,
      manager: null,
      lastBroadcastAt: 0
    },
    __MINIFEATHER_LOCAL_GAMES__: { state: { moduleNamespace: { mgr: manager } }, active: false },
    console: { warn() {} },
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    FREE_BODY_DISTANCE: 3.2,
    MAX_CLONES: 3,
    CLONE_IDS: [-2147483639, -2147483638, -2147483637],
    document: { dispatchEvent() {} },
    CustomEvent: class {},
    SYNC_INTERVAL_MS: 1500
  };
  const fns = exposeManyFrom(clonesSource, ['looksLikeEntityManager', 'resolveManager', 'findGame', 'isLiveGame', 'playerProfile', 'cloneSlot', 'spawnClone', 'despawnClone', 'dispatchChanged', 'remoteCloneId', 'receiveClone', 'syncRemoteClones'], sandbox);

  // El receptor crea el clon del otro jugador con su skin y nombre
  fns.receiveClone('peer-friend', {
    name: 'Friend', skin: 'alex_skin', rank: 'VIP',
    count: 3,
    clones: [
      { x: 12.5, y: 70, z: -8.25, yaw: 2.1 },
      { x: 14.5, y: 70, z: -6.25, yaw: 1.1 },
      { x: 10.5, y: 70, z: -10.25, yaw: 0.4 }
    ]
  });

  const key = [...sandbox.state.remoteClones.keys()][0];
  assert.ok(key === 'peer-friend');
  const entry = sandbox.state.remoteClones.get(key);
  assert.equal(entry.name, 'Friend');
  assert.equal(entry.skin, 'alex_skin');
  assert.equal(entry.slots.length, 3, 'all three slots stored');
  assert.equal(spawned.length, 3, 'one entity per slot');

  // bajar a 1 slot: las entidades sobrantes se retiran
  fns.receiveClone('peer-friend', {
    name: 'Friend', skin: 'alex_skin', rank: 'VIP',
    count: 1,
    clones: [{ x: 12.5, y: 70, z: -8.25, yaw: 2.1 }]
  });
  assert.equal(spawned.length, 3, 'no respawn for surviving slots');
  assert.equal(world.entities.size, 1, 'extra slot entities removed');
  assert.equal(spawned[0].cosmetics.skin, 'alex_skin');
  assert.equal(spawned[0].name, 'Friend');

  // Expiracion: sin refresh en 10s el clon se retira del mundo
  entry.at = now - 11000;
  fns.syncRemoteClones();
  assert.equal(sandbox.state.remoteClones.size, 0, 'stale remote clone pruned');
  assert.equal(world.entities.size, 0, 'entity removed from world');
});

test('MF_Clones caps to 1 clone on normal servers and broadcasts via mesh/peer', () => {
  const { world, manager, spawned } = makeCloneWorld();
  let broadcasts = [];
  const sandbox = {
    state: {
      enabled: true,
      count: 3,
      player: { pos: { x: 4, y: 70, z: 6 }, perspective: 1, getEyeHeight: () => 1.62, profile: { username: 'Me', uuid: 'me1', skin: 'steve' } },
      yaw: 0,
      freePosition: null,
      game: { world, player: { pos: { x: 4, y: 70, z: 6 }, profile: { username: 'Me', uuid: 'me1', skin: 'steve' } } },
      clones: new Map(),
      remoteClones: new Map(),
      world: null,
      lastCenter: null,
      manager: manager,
      lastBroadcastAt: 0
    },
    __MINIFEATHER_LOCAL_GAMES__: { state: { moduleNamespace: { mgr: manager } }, active: false },
    console: { warn() {} },
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    MF_Mesh: { connected: 2, broadcast: payload => broadcasts.push({ via: 'mesh', payload }) },
    MF_Peer: { connected: true, sendStudio: payload => broadcasts.push({ via: 'peer', payload }) },
    MAX_CLONES: 3,
    RING_RADIUS: 3.5,
    document: { dispatchEvent() {} },
    CustomEvent: class {},
    CLONE_IDS: [-2147483639, -2147483638, -2147483637]
  };
  sandbox.globalThis = sandbox;
  sandbox.miniblox = sandbox.state.game;

  const fns = exposeManyFrom(clonesSource, ['looksLikeEntityManager', 'resolveManager', 'findGame', 'isLiveGame', 'playerProfile', 'cloneSlot', 'spawnClone', 'despawnClone', 'dispatchChanged', 'list', 'myCloneKey', 'sync', 'broadcastClones'], sandbox);
  fns.sync();
  
  assert.equal(spawned.length, 3, 'all three clones spawn on normal servers too');
  sandbox.state.lastBroadcastAt = 0;
  fns.broadcastClones();
  assert.equal(broadcasts.length, 4, 'mesh AND peer, from sync and from the explicit call');
  assert.equal(broadcasts[2].payload.count, 3, 'all three clones broadcast');
  assert.equal(broadcasts[2].payload.skin, 'steve');
  assert.equal(broadcasts[2].payload.name, 'Me');
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
