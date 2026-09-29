const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src/World/LocalGames.js'), 'utf8');
const bridgeSource = fs.readFileSync(path.join(__dirname, '..', 'src/World/LocalGamesNetworkBridge.js'), 'utf8');

function namedFunction(code, name) {
  const start = code.indexOf(`function ${name}(`);
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

test('loop wiring: peer prune, stale proxy hide and move cadence are installed', () => {
  assert.match(source, /pruneStaleHostPeers\(Date\.now\(\)\)/);
  assert.match(source, /pruneStaleRemoteProxies\(now\);/);
  assert.match(source, /now - state\.lastMoveSend >= LOCAL_MOVE_SEND_INTERVAL_MS/);
  assert.doesNotMatch(source, /function keepLocalWorldInDaylight/);
  assert.doesNotMatch(source, /function repairZeroColorAttribute/);
});
