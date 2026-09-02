(function () {
  'use strict';

  let mfStrings = {};
  function tr(key, fallback = key) { return mfStrings[key] || fallback; }
  function onLanguageConfig(event) {
    try {
      const data = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      if (data?.strings && typeof data.strings === 'object') mfStrings = data.strings;
      const overlay = document.getElementById('mf-localgames-connection-lost');
      if (overlay) {
        const title = overlay.querySelector('[data-mf-local-title]');
        const button = overlay.querySelector('[data-mf-local-back]');
        if (title) title.textContent = tr('localConnectionLost', 'Connection Lost');
        if (button) button.textContent = tr('localBackToMiniblox', 'Back to MiniBlox');
      }
    } catch (_) {}
  }
  document.addEventListener('minifeather:language-config', onLanguageConfig);

  const COMMAND_EVENT = 'minifeather:localgames-command';
  const STATE_EVENT = 'minifeather:localgames-state';
  const PROTOCOL = 3;
  const MAX_PLAYERS = 8;
  const SIGNAL_REQUEST_EVENT = 'minifeather:localgames-signal-request';
  const SIGNAL_RESPONSE_EVENT = 'minifeather:localgames-signal-response';
  const STUN_URL = 'stun:stun.cloudflare.com:3478';
  const GLOBAL_REGISTRY_TOPIC = 'mf-local-globalregistryv1a1b2c3d4e5f6';
  const SAVED_SERVERS_KEY = 'minifeather.localgames.savedServers.v2';
  const SERVER_STALE_AFTER_MS = 330000;
  const OUTGOING_ALLOW = new Set(['SPacketPing']);
  const INCOMING_ALLOW = new Set(['CPacketPong']);

  // Direct local worlds used to generate only 5x5 chunks (80x80 blocks).
  // 9x9 keeps startup reasonable while giving Sandbox/hosted local worlds
  // 3.24x more terrain to explore. Both Local Sandbox and Create World use
  // this exact generator, so the size stays consistent between modes.
  const LOCAL_TERRAIN_RADIUS_CHUNKS = 4;

  // ── Logging ────────────────────────────────────────────────────────
  // Activar con: localStorage.setItem('mflg:log', '1')  (o 'trace' para más detalle)
  // Desactivar:  localStorage.removeItem('mflg:log')
  const LOG_PREFIX = '[MiniFeather LocalGames]';
  const LOG_LEVEL = (() => {
    try {
      const raw = String(localStorage.getItem('mflg:log') || '').toLowerCase();
      return raw === 'trace' ? 2 : raw ? 1 : 0;
    } catch (_) {
      return 0;
    }
  })();

  function log(...args) {
    if (LOG_LEVEL >= 1) console.log(LOG_PREFIX, ...args);
  }

  function logTrace(...args) {
    if (LOG_LEVEL >= 2) console.log(LOG_PREFIX, '[trace]', ...args);
  }

  function logWarn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }

  function logError(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  const state = {
    active: false,
    mode: 'idle',
    map: 'sandbox',
    game: null,
    world: null,
    socket: null,
    networkPatch: null,
    origin: null,
    start: null,
    arena: null,
    snapshot: new Map(),
    blockState: new Map(),
    interval: 0,
    diffInterval: 0,
    peerFrame: 0,
    peerLayer: null,
    status: 'Idle',
    error: '',
    lastMoveSend: 0,
    destroyed: false,
    directLocal: false,
    moduleNamespace: null,
    moduleUrl: '',
    blockRegistry: null,
    itemsRegistry: null,
    blockItemCache: new WeakMap(),
    chunkConstructor: null,
    localChunks: [],
    localGameStateBefore: 0,
    localPlayerId: -2147483000,
    peerPlayerId: -2147482999,
    worldSeed: 0,
    worldBounds: null,
    terrainSurface: new Map(),
    generatedChunkPackets: [],
    worldName: '',
    serverAddress: '',
    roomTopic: '',
    worldSeedOverride: null,
    localRole: 'player',
    localGameMode: 'survival',
    localHardcore: false,
    peers: new Map(),
    hostPeer: null,
    remotePlayers: new Map(),
    signalPollTimer: 0,
    signalLastId: '',
    signalRequests: new Map(),
    signalRequestCounter: 0,
    blockOverrides: new Map(),
    pendingBlockChanges: [],
    suppressBlockBroadcast: false,
    worldSetBlockPatch: null,
    worldItemPatch: null,
    recentNativeDrops: new Map(),
    lastPickupScan: 0,
    lastPlayerEntityRepair: 0,
    localPlayerEntityReady: false,
    dropStats: { spawned: 0, pickedUp: 0, fallback: 0, failed: 0, lastError: '' },
    banList: new Map(),
    connectedOnce: false,
    connectionLost: false,
    deferredBlocks: [],
    deferredMessages: [],
    providerGuard: null,
    uploadDrainTimer: null,
    renderWatchdogTimer: null,
    sceneUpdateRestore: null,
    gameSceneClass: null,
    gameSceneTickRef: null,
    gameSceneTickCtor: null,
    gameSceneTickRecovered: false,
    sceneUpdateFailures: 0,
    sceneUpdateLastError: '',
    sceneUpdateLastErrorAt: 0,
    renderProbe: null,
    textureWatchTimer: null,
    textureResyncInFlight: false,
    freshWorldCreated: false,
    visualRestore: null,
    worldAssetsReady: false,
    worldAssetManager: null,
    localRenderFixAt: 0,
    localRenderStats: null,
    globalPollTimer: 0,
    registryCursor: '',
    savedServers: [],
    lastRegistryPublish: 0,
    textureDiagnostics: {
      menuLoaded: false,
      worldLoaded: false,
      atlasReady: false,
      spritesheetReady: false,
      materialReady: false,
      fluidMaterialReady: false,
      mapReady: false,
      lastError: ''
    },
    chunkLoadDiagnostics: {
      attempted: 0,
      loaded: 0,
      failed: 0,
      nativeIngest: 0,
      fallbackIngest: 0,
      workerReady: false,
      lightAttempted: 0,
      lightInitialized: 0,
      lightFailed: 0,
      lastError: ''
    }
  };


  function loadSavedServers() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVED_SERVERS_KEY) || '[]');
      const now = Date.now();
      state.savedServers = Array.isArray(parsed)
        ? parsed
            .filter(entry => entry && normalizeServerAddress(entry.address))
            .slice(0, 100)
            .map(entry => ({
              ...entry,
              online:
                entry.online !== false &&
                now - Number(entry.lastSeen || 0) <= SERVER_STALE_AFTER_MS
            }))
        : [];
    } catch (_) {
      state.savedServers = [];
    }

    return state.savedServers;
  }

  function saveSavedServers() {
    try {
      localStorage.setItem(
        SAVED_SERVERS_KEY,
        JSON.stringify(state.savedServers.slice(0, 100))
      );
    } catch (_) {}
  }

  function upsertSavedServer(entry) {
    const address = normalizeServerAddress(entry?.address);
    if (!address) return false;

    const next = {
      address,
      worldName: cleanText(entry.worldName, 30) || 'MiniFeather World',
      hostName: cleanText(entry.hostName, 24) || 'Host',
      hostUuid: cleanText(entry.hostUuid, 80),
      players: Math.max(0, Number(entry.players) || 0),
      maxPlayers: Math.max(1, Number(entry.maxPlayers) || MAX_PLAYERS),
      online: entry.online !== false,
      createdAt: Number(entry.createdAt) || Date.now(),
      lastSeen: Number(entry.lastSeen) || Date.now()
    };

    const index = state.savedServers.findIndex(item => item.address === address);

    if (index >= 0) {
      state.savedServers[index] = { ...state.savedServers[index], ...next };
    } else {
      state.savedServers.unshift(next);
    }

    state.savedServers.sort((a, b) => Number(b.lastSeen || 0) - Number(a.lastSeen || 0));
    state.savedServers = state.savedServers.slice(0, 100);
    saveSavedServers();
    emitState();
    return true;
  }

  function markSavedServerOffline(address) {
    const normalized = normalizeServerAddress(address);
    if (!normalized) return;

    const entry = state.savedServers.find(item => item.address === normalized);
    if (!entry) return;

    entry.online = false;
    entry.lastSeen = Date.now();
    saveSavedServers();
    emitState();
  }

  async function pollGlobalSignals(topic, cursorField, since = '15m') {
    const response = await signalRequest('poll', {
      topic,
      since: state[cursorField] || since
    });

    const messages = Array.isArray(response.messages)
      ? response.messages
      : [];

    if (messages.length) {
      state[cursorField] = String(
        messages[messages.length - 1]?.id ||
        state[cursorField] ||
        ''
      );
    }

    const result = [];

    for (const message of messages) {
      try {
        result.push({
          id: String(message.id || ''),
          payload: await unpackSignal(message.message)
        });
      } catch (_) {}
    }

    return result;
  }

  function serverAdvertPayload(online = true) {
    const profile = profileSnapshot();

    return {
      type: online ? 'server-advert' : 'server-closed',
      protocol: PROTOCOL,
      address: state.serverAddress,
      worldName: state.worldName,
      hostName: profile.name,
      hostUuid: profile.uuid,
      players: 1 + connectedHostPeers().length,
      maxPlayers: MAX_PLAYERS,
      online,
      createdAt: Number(state.start?.at) || Date.now(),
      lastSeen: Date.now()
    };
  }

  async function publishServerAdvert(online = true) {
    if (state.mode !== 'host' || !state.serverAddress) return false;

    try {
      const advert = serverAdvertPayload(online);
      await publishSignal(GLOBAL_REGISTRY_TOPIC, advert);
      state.lastRegistryPublish = Date.now();

      if (online) {
        upsertSavedServer(advert);
      } else {
        markSavedServerOffline(advert.address);
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  function expireStaleSavedServers() {
    const now = Date.now();
    let changed = false;

    for (const entry of state.savedServers) {
      if (
        entry?.online &&
        now - Number(entry.lastSeen || 0) > SERVER_STALE_AFTER_MS
      ) {
        entry.online = false;
        changed = true;
      }
    }

    if (changed) {
      saveSavedServers();
    }

    return changed;
  }

  async function pollGlobalRegistry() {
    let entries = [];

    try {
      entries = await pollGlobalSignals(
        GLOBAL_REGISTRY_TOPIC,
        'registryCursor',
        '30m'
      );
    } catch (error) {
      logWarn(`globalRegistry: poll falló: ${error?.message || error}`);
      expireStaleSavedServers();
      return false;
    }

    const now = Date.now();

    for (const entry of entries) {
      const message = entry.payload;

      if (!message || Number(message.protocol) !== PROTOCOL) continue;

      if (message.type === 'server-advert') {
        const lastSeen = Number(message.lastSeen) || 0;
        upsertSavedServer({
          ...message,
          online:
            lastSeen > 0 &&
            now - lastSeen <= SERVER_STALE_AFTER_MS
        });
      } else if (message.type === 'server-closed') {
        markSavedServerOffline(message.address);
      }
    }

    expireStaleSavedServers();
    return true;
  }

  function startGlobalServiceLoop() {
    if (state.globalPollTimer) clearInterval(state.globalPollTimer);

    // ntfy gratuito limita las peticiones por topic (~60/h). Un poll cada 5s
    // provoca 429 y bloquea también la señalización P2P (mismo mecanismo).
    // Backoff exponencial: 15s → 30s → 60s (tope). Reinicia al tener éxito.
    state.registryBackoffMs = state.registryBackoffMs || 15000;
    state.lastRegistryPollAt = 0;

    state.globalPollTimer = setInterval(async () => {
      if (state.destroyed) return;

      if (!state.game) {
        try {
          state.game = await resolveGameSingleton();
        } catch (_) {}
      }

      if (state.mode === 'host' && state.active) {
        if (Date.now() - state.lastRegistryPublish > 150000) {
          await publishServerAdvert(true);
        }
      }

      const elapsed = Date.now() - state.lastRegistryPollAt;

      if (elapsed < state.registryBackoffMs) return;

      state.lastRegistryPollAt = Date.now();

      const ok = await pollGlobalRegistry();

      if (ok) {
        // Éxito → volver al intervalo base
        state.registryBackoffMs = 15000;
      } else {
        // Fallo (429/red) → duplicar hasta 60s
        state.registryBackoffMs = Math.min(
          (state.registryBackoffMs || 15000) * 2,
          60000
        );
        logWarn(
          `globalRegistry: backoff a ${Math.round(state.registryBackoffMs / 1000)}s`
        );
      }
    }, 5000);
  }

  function emitState(extra = {}) {
    const hostConnected = Array.from(state.peers.values())
      .filter(peer => peer?.pc?.connectionState === 'connected').length;

    const guestConnected =
      state.hostPeer?.pc?.connectionState === 'connected' ? 1 : 0;

    const connected =
      state.mode === 'host' ? hostConnected > 0 : guestConnected > 0;

    const playerCount =
      state.active
        ? 1 + (state.mode === 'host' ? hostConnected : guestConnected)
        : 0;

    if (!state.savedServers.length) loadSavedServers();

    expireStaleSavedServers();

    document.dispatchEvent(
      new CustomEvent(STATE_EVENT, {
        detail: JSON.stringify({
          active: state.active,
          mode: state.mode,
          map: state.map,
          status: state.status,
          error: state.error,
          connected,
          playerCount,
          maxPlayers: MAX_PLAYERS,
          worldName: state.worldName,
          serverAddress: state.serverAddress,
          role: state.localRole,
          gameMode: state.localGameMode,
          hardcore: state.localHardcore,
          savedServers: state.savedServers.slice(0, 30).map(entry => ({ ...entry })),
          peerName:
            state.mode === 'join'
              ? state.hostPeer?.profile?.name || ''
              : '',
          protocol: PROTOCOL,
          renderStats: state.localRenderStats || null,
          ...extra
        })
      })
    );
  }

  function setStatus(status, error = '') {
    state.status = status;
    state.error = error;
    emitState();
  }


  function mainModuleCandidates() {
    const urls = [];
    const add = url => {
      if (!url || typeof url !== 'string') return;
      if (!url.includes('/assets/index-') || !url.endsWith('.js')) return;
      if (!urls.includes(url)) urls.push(url);
    };

    try {
      for (const script of document.querySelectorAll('script[type="module"][src]')) {
        add(script.src);
      }
    } catch (_) {}

    try {
      for (const entry of performance.getEntriesByType('resource')) {
        add(entry?.name);
      }
    } catch (_) {}

    return urls;
  }

  function looksLikeGameSingleton(value) {
    return !!(
      value &&
      typeof value === 'object' &&
      typeof value.boot === 'function' &&
      typeof value.queue === 'function' &&
      typeof value.connect === 'function' &&
      typeof value.inGame === 'function' &&
      value.info &&
      value.serverInfo
    );
  }

  async function resolveMainModule() {
    if (state.moduleNamespace) return state.moduleNamespace;

    for (const url of mainModuleCandidates()) {
      try {
        const mod = await import(url);
        if (!mod || typeof mod !== 'object') continue;
        state.moduleNamespace = mod;
        state.moduleUrl = url;
        return mod;
      } catch (_) {}
    }

    return null;
  }

  async function resolveGameSingleton() {
    const mod = await resolveMainModule();

    if (mod) {
      for (const value of Object.values(mod)) {
        if (!looksLikeGameSingleton(value)) continue;
        state.game = value;
        globalThis.miniblox = value;
        return value;
      }
    }

    return getGame(true);
  }

  function isGame(value) {
    return !!(
      value?.player?.pos &&
      value?.world?.chunkProvider &&
      value?.gameScene
    );
  }

  function loadedChunkCount(game) {
    const provider = game?.world?.chunkProvider;
    if (!provider) return 0;

    try {
      if (typeof provider.getLoadedChunkCount === 'function') {
        const count = Number(provider.getLoadedChunkCount());
        if (Number.isFinite(count)) return count;
      }
    } catch (_) {}

    try {
      const size = Number(provider.posToChunk?.size);
      if (Number.isFinite(size)) return size;
    } catch (_) {}

    return 0;
  }

  function renderChunkCount(game) {
    const manager = game?.chunkRenderManager;
    if (!manager) return 0;

    try {
      if (typeof manager.getRenderedChunkCount === 'function') {
        const count = Number(manager.getRenderedChunkCount());
        if (Number.isFinite(count)) return count;
      }
    } catch (_) {}

    try {
      const size = Number(manager.meshes?.size);
      return Number.isFinite(size) ? size : 0;
    } catch (_) {
      return 0;
    }
  }

  function gameScore(game) {
    if (!isGame(game)) return -Infinity;

    let score = 0;
    const loaded = loadedChunkCount(game);
    const rendered = renderChunkCount(game);

    if (Number(game.state) === 6) score += 100000;
    if (game.world?.isClient === true) score += 10000;
    if (loaded > 0) score += 50000 + Math.min(loaded, 500) * 10;
    if (rendered > 0) score += 25000 + Math.min(rendered, 500) * 5;
    if (game.player?.pos) score += 1000;
    if (game.gameScene?.camera) score += 500;

    return score;
  }

  function collectGameCandidates() {
    const candidates = [];
    const seen = new Set();

    const add = value => {
      if (!isGame(value) || seen.has(value)) return;
      seen.add(value);
      candidates.push(value);
    };

    add(state.game);
    add(globalThis.miniblox);

    try {
      const react = document.querySelector('#react');
      if (react) {
        for (const root of Object.values(react)) {
          add(root?.updateQueue?.baseState?.element?.props?.game);
          add(root?.memoizedProps?.game);
          add(root?.memoizedState?.game);

          const queue = [{ value: root, depth: 0 }];
          const visited = new WeakSet();
          let checked = 0;

          while (queue.length && checked < 1800) {
            const item = queue.shift();
            const value = item?.value;
            const depth = item?.depth || 0;
            checked++;

            if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;

            if (typeof value === 'object') {
              if (visited.has(value)) continue;
              visited.add(value);
            }

            add(value);
            add(value?.game);

            if (depth >= 4) continue;

            let keys = [];
            try {
              keys = Reflect.ownKeys(value);
            } catch (_) {
              continue;
            }

            for (const key of keys) {
              if (
                key === 'parentNode' ||
                key === 'parentElement' ||
                key === 'ownerDocument' ||
                key === 'window' ||
                key === 'document'
              ) {
                continue;
              }

              let child;
              try {
                child = value[key];
              } catch (_) {
                continue;
              }

              if (child && (typeof child === 'object' || typeof child === 'function')) {
                queue.push({ value: child, depth: depth + 1 });
              }
            }
          }
        }
      }
    } catch (_) {}

    return candidates;
  }

  function getGame(force = false) {
    if (
      !force &&
      isGame(state.game) &&
      Number(state.game.state) === 6 &&
      loadedChunkCount(state.game) > 0
    ) {
      return state.game;
    }

    const candidates = collectGameCandidates();
    let best = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      const score = gameScore(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    if (best) {
      state.game = best;
      globalThis.miniblox = best;
      return best;
    }

    return null;
  }

  function isSocket(value) {
    if (!value || typeof value !== 'object') return false;
    if (typeof value.emit !== 'function') return false;
    if (typeof value.on !== 'function') return false;
    if (typeof value.onevent !== 'function') return false;
    if (typeof value.disconnect !== 'function') return false;

    const callbacks = value._callbacks;
    if (callbacks && typeof callbacks === 'object') {
      const keys = Object.keys(callbacks);
      if (keys.some(key => key.includes('CPacket'))) return true;
    }

    return !!(value.io && ('connected' in value || 'id' in value));
  }

  function findSocket() {
    if (isSocket(state.socket)) return state.socket;

    const roots = [];
    const game = getGame(true);
    if (game) roots.push(game);

    try {
      const react = document.querySelector('#react');
      if (react) roots.push(...Object.values(react));
    } catch (_) {}

    const queue = roots.map(value => ({ value, depth: 0 }));
    const seen = new WeakSet();
    let checked = 0;

    while (queue.length && checked < 30000) {
      const item = queue.shift();
      const value = item?.value;
      const depth = item?.depth || 0;
      checked++;

      if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
      if (value === window || value === document) continue;

      if (typeof value === 'object') {
        if (seen.has(value)) continue;
        seen.add(value);
      }

      try {
        if (isSocket(value)) {
          state.socket = value;
          return value;
        }
      } catch (_) {}

      if (depth >= 8) continue;

      let keys = [];
      try {
        keys = Reflect.ownKeys(value);
      } catch (_) {
        continue;
      }

      for (const key of keys) {
        if (
          key === 'parentNode' ||
          key === 'parentElement' ||
          key === 'ownerDocument' ||
          key === 'window' ||
          key === 'document'
        ) {
          continue;
        }

        let child;
        try {
          child = value[key];
        } catch (_) {
          continue;
        }

        if (child && (typeof child === 'object' || typeof child === 'function')) {
          queue.push({ value: child, depth: depth + 1 });
        }
      }
    }

    return null;
  }

  function patchNetwork() {
    const socket = findSocket();
    if (!socket) return false;
    if (state.networkPatch?.socket === socket) return true;

    const originalEmit = socket.emit;
    const originalOnevent = socket.onevent;

    const patchedEmit = function (eventName, ...args) {
      if (
        state.active &&
        typeof eventName === 'string' &&
        eventName.startsWith('SPacket') &&
        !OUTGOING_ALLOW.has(eventName)
      ) {
        return this;
      }

      return originalEmit.call(this, eventName, ...args);
    };

    const patchedOnevent = function (packet) {
      const eventName = packet?.data?.[0];

      if (
        state.active &&
        typeof eventName === 'string' &&
        eventName.startsWith('CPacket') &&
        !INCOMING_ALLOW.has(eventName)
      ) {
        return;
      }

      return originalOnevent.call(this, packet);
    };

    try {
      socket.emit = patchedEmit;
      socket.onevent = patchedOnevent;
    } catch (_) {
      return false;
    }

    state.networkPatch = {
      socket,
      originalEmit,
      originalOnevent,
      patchedEmit,
      patchedOnevent
    };

    return true;
  }

  function restoreNetwork() {
    const patch = state.networkPatch;
    if (!patch) return;

    try {
      if (patch.socket.emit === patch.patchedEmit) {
        patch.socket.emit = patch.originalEmit;
      }

      if (patch.socket.onevent === patch.patchedOnevent) {
        patch.socket.onevent = patch.originalOnevent;
      }
    } catch (_) {}

    state.networkPatch = null;
  }

  function localChunkCoordinateSet() {
    const result = new Set();

    for (const packet of state.generatedChunkPackets || []) {
      const x = Number(packet?.x);
      const z = Number(packet?.z);

      if (Number.isFinite(x) && Number.isFinite(z)) {
        result.add(`${x},${z}`);
      }
    }

    for (const chunk of state.localChunks || []) {
      const x = Number(chunk?.xPosition);
      const z = Number(chunk?.zPosition);

      if (Number.isFinite(x) && Number.isFinite(z)) {
        result.add(`${x},${z}`);
      }
    }

    return result;
  }

  function installProviderGuard() {
    const provider = state.world?.chunkProvider;

    if (!provider || state.providerGuard?.provider === provider) {
      return;
    }

    restoreProviderGuard();

    const originalUnloadChunk =
      typeof provider.unloadChunk === 'function'
        ? provider.unloadChunk.bind(provider)
        : null;

    const originalUnloadAllChunks =
      typeof provider.unloadAllChunks === 'function'
        ? provider.unloadAllChunks.bind(provider)
        : null;

    const guardedUnloadChunk = function (x, z) {
      if (
        state.active &&
        state.directLocal &&
        localChunkCoordinateSet().has(`${Number(x)},${Number(z)}`)
      ) {
        return;
      }

      return originalUnloadChunk?.(x, z);
    };

    const guardedUnloadAllChunks = function () {
      if (state.active && state.directLocal) {
        return;
      }

      return originalUnloadAllChunks?.();
    };

    try {
      provider.unloadChunk = guardedUnloadChunk;
    } catch (_) {}

    try {
      provider.unloadAllChunks = guardedUnloadAllChunks;
    } catch (_) {}

    state.providerGuard = {
      provider,
      originalUnloadChunk,
      originalUnloadAllChunks,
      guardedUnloadChunk,
      guardedUnloadAllChunks
    };
  }

  // En mundo local directo, newChunkReceived() solo encola el chunk; el
  // upload final del mesh depende del focalPosition del chunkRenderQueue
  // (que sigue al jugador). Si la cámara aún no llegó al spawn local, los
  // resultados del worker quedan en pendingUploads y nunca suben. Este
  // drain periódico fuerza la subida mientras el mundo local esté activo.
  function installPendingUploadDrain() {
    if (state.uploadDrainTimer) {
      clearInterval(state.uploadDrainTimer);
    }

    state.uploadDrainTimer = setInterval(() => {
      if (!state.active || !state.directLocal) {
        clearInterval(state.uploadDrainTimer);
        state.uploadDrainTimer = null;
        return;
      }

      try {
        const crm = state.game?.chunkRenderManager;

        // El drain sube los meshes diferidos aunque el focal aún no
        // apunte al spawn local. pendingUploadOrder es un array nativo;
        // pendingUploads es un wrapper Map-like (no instanceof Map).
        if (crm?.pendingUploadOrder?.length > 0) {
          logTrace(`uploadDrain: forzando subida de ${crm.pendingUploadOrder.length} mesh(es) pendiente(s)`);
          crm.scheduleUploadDrain?.();
        }
      } catch (_) {}
    }, 500);
  }

  function clearPendingUploadDrain() {
    if (state.uploadDrainTimer) {
      clearInterval(state.uploadDrainTimer);
      state.uploadDrainTimer = null;
    }
  }

  // ── Watchdog del render loop ───────────────────────────────────────
  // Game.update() mata su propio rAF loop de forma PERMANENTE tras una sola
  // excepción (catch { if(!renderLoopErrored) throw renderLoopErrored=true }).
  // Un error puntual durante la transición al mundo local (cámara, tick,
  // timing) deja la pantalla negra aunque chunks/meshes estén perfectos.
  // Este watchdog detecta el loop muerto y lo revive.
  function installRenderLoopWatchdog() {
    if (state.renderWatchdogTimer) {
      clearInterval(state.renderWatchdogTimer);
    }

    state.renderWatchdogTimer = setInterval(() => {
      const game = state.game;

      if (!state.active || !state.directLocal || !game) {
        clearInterval(state.renderWatchdogTimer);
        state.renderWatchdogTimer = null;
        return;
      }

      const lastRenderTime =
        Number(game.lastRenderTime) || 0;
      const now = performance.now();

      const dead =
        game.renderLoopErrored === true ||
        (lastRenderTime > 0 &&
          now - lastRenderTime > 5000);

      if (!dead) return;

      state.renderWatchdogRevives =
        (state.renderWatchdogRevives || 0) + 1;

      logWarn(
        `renderLoop watchdog: loop muerto (errored=${game.renderLoopErrored === true}, sin frames ${lastRenderTime > 0 ? Math.round(now - lastRenderTime) + 'ms' : 'n/a'}) → reviviendo (intento ${state.renderWatchdogRevives})`
      );

      // Repara primero el estado nativo que puede matar el frame loop.
      try {
        repairGameSceneTick(game);
        ensureNativeSceneRoots(game);
        synchronizeLocalCamera(game);
        patchGameSceneUpdateForLocal(game);
      } catch (_) {}

      try {
        game.renderLoopErrored = false;
        game.lastRenderTime = now;
        game.lastFixedUpdate = now;
        game.prevTime = now;
        game.tickAccumulator = 0;

        requestAnimationFrame(() => {
          try {
            game.update?.();
          } catch (_) {}
        });
      } catch (err) {
        logError('renderLoop watchdog: fallo al revivir:', err);
      }
    }, 2000);
  }

  function clearRenderLoopWatchdog() {
    if (state.renderWatchdogTimer) {
      clearInterval(state.renderWatchdogTimer);
      state.renderWatchdogTimer = null;
    }
  }

  function restoreProviderGuard() {
    const guard = state.providerGuard;

    if (!guard?.provider) {
      state.providerGuard = null;
      return;
    }

    try {
      if (guard.provider.unloadChunk === guard.guardedUnloadChunk) {
        guard.provider.unloadChunk = guard.originalUnloadChunk;
      }
    } catch (_) {}

    try {
      if (
        guard.provider.unloadAllChunks ===
        guard.guardedUnloadAllChunks
      ) {
        guard.provider.unloadAllChunks =
          guard.originalUnloadAllChunks;
      }
    } catch (_) {}

    state.providerGuard = null;
  }

  // ── Reparación del GameScene nativo ────────────────────────────────
  // GameScene.tick es un Single estático del cliente (tiene get()/set()).
  // LocalGames antes lo reemplazaba por el número 0; eso puede romper
  // GameScene.update() y matar el rAF de Miniblox dejando HUD + cielo vivos
  // pero el mundo 3D negro. Guardamos la referencia nativa ANTES de limpiar
  // el mundo y la restauramos si alguna transición la corrompe.
  function isNativeSingle(value) {
    return !!(
      value &&
      typeof value === 'object' &&
      typeof value.get === 'function' &&
      typeof value.set === 'function'
    );
  }

  function resolveGameSceneClass(game) {
    const gs = game?.gameScene;
    const candidates = [
      state.gameSceneClass,
      game?.GameSceneClass,
      gs?.constructor
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'function') continue;
      try {
        if (
          candidate === gs?.constructor ||
          'tick' in candidate ||
          (
            typeof candidate.prototype?.update === 'function' &&
            typeof candidate.prototype?.clear === 'function'
          )
        ) {
          state.gameSceneClass = candidate;
          return candidate;
        }
      } catch (_) {}
    }

    const mod = state.moduleNamespace;
    if (mod && typeof mod === 'object') {
      for (const candidate of Object.values(mod)) {
        if (typeof candidate !== 'function') continue;
        try {
          if (
            isNativeSingle(candidate.tick) &&
            typeof candidate.prototype?.update === 'function' &&
            typeof candidate.prototype?.clear === 'function'
          ) {
            state.gameSceneClass = candidate;
            return candidate;
          }
        } catch (_) {}
      }
    }

    return null;
  }

  function captureGameSceneTick(game) {
    const cls = resolveGameSceneClass(game);
    let tick = null;

    try { tick = cls?.tick; } catch (_) {}

    if (!isNativeSingle(tick)) {
      try {
        const alt = game?.gameScene?.constructor?.tick;
        if (isNativeSingle(alt)) tick = alt;
      } catch (_) {}
    }

    if (!isNativeSingle(tick)) return false;

    state.gameSceneTickRef = tick;
    state.gameSceneTickCtor =
      typeof tick.constructor === 'function'
        ? tick.constructor
        : state.gameSceneTickCtor;
    state.gameSceneTickRecovered = false;
    return true;
  }

  function assignGameSceneTick(game, tick) {
    if (!isNativeSingle(tick)) return false;

    const classes = [
      state.gameSceneClass,
      game?.GameSceneClass,
      game?.gameScene?.constructor
    ].filter((value, index, list) =>
      typeof value === 'function' && list.indexOf(value) === index
    );

    let assigned = false;

    for (const cls of classes) {
      try {
        if (cls.tick !== tick) cls.tick = tick;
        if (cls.tick === tick || isNativeSingle(cls.tick)) assigned = true;
      } catch (_) {}
    }

    return assigned;
  }

  function repairGameSceneTick(game) {
    const cls = resolveGameSceneClass(game);
    const classes = [
      cls,
      game?.GameSceneClass,
      game?.gameScene?.constructor
    ].filter((value, index, list) =>
      typeof value === 'function' && list.indexOf(value) === index
    );

    // Si alguna referencia de la clase sigue sana, úsala como fuente de verdad.
    for (const candidate of classes) {
      try {
        if (!isNativeSingle(candidate.tick)) continue;
        state.gameSceneTickRef = candidate.tick;
        state.gameSceneTickCtor =
          typeof candidate.tick.constructor === 'function'
            ? candidate.tick.constructor
            : state.gameSceneTickCtor;
        assignGameSceneTick(game, candidate.tick);
        return true;
      } catch (_) {}
    }

    // Restaurar el mismo Single capturado antes de gameScene.clear().
    if (isNativeSingle(state.gameSceneTickRef)) {
      const ok = assignGameSceneTick(game, state.gameSceneTickRef);
      if (ok) state.gameSceneTickRecovered = true;
      return ok;
    }

    // Último recurso: reconstruir el Single con su constructor nativo.
    const TickCtor = state.gameSceneTickCtor;
    if (typeof TickCtor === 'function') {
      try {
        const worldTime =
          Number(game?.world?.worldTime) ||
          Number(game?.world?.totalTime) ||
          6000;
        const tick = new TickCtor(worldTime, performance.now());
        if (isNativeSingle(tick) && assignGameSceneTick(game, tick)) {
          state.gameSceneTickRef = tick;
          state.gameSceneTickRecovered = true;
          return true;
        }
      } catch (_) {}
    }

    return false;
  }

  function ensureNativeSceneRoots(game) {
    const gs = game?.gameScene;
    const scene = gs?.scene;
    if (!gs || !scene) return false;

    let ok = true;
    for (const key of [
      'chunkMeshes',
      'entityMeshes',
      'ambientMeshes',
      'leaderboardMeshes'
    ]) {
      const root = gs[key];
      if (!root) continue;
      try {
        if (root.parent !== scene) scene.add(root);
        root.visible = true;
      } catch (_) {
        ok = false;
      }
    }
    return ok;
  }

  function synchronizeLocalCamera(game) {
    const gs = game?.gameScene;
    const camera = gs?.camera;
    if (!gs || !camera) return false;

    try { game?.player?.renderCamera?.(); } catch (_) {}
    try { gs.updateCameraZoom?.(); } catch (_) {}
    try { camera.updateProjectionMatrix?.(); } catch (_) {}
    try { camera.updateMatrixWorld?.(true); } catch (_) {}
    return true;
  }

  function localRenderProbe(logResult = false) {
    const game = state.game;
    const gs = game?.gameScene;
    const manager = game?.chunkRenderManager;
    const worker = manager?.chunkRenderWorkerManager;
    const root = gs?.chunkMeshes;
    const scene = gs?.scene;
    const tickClass = resolveGameSceneClass(game);

    let tick = null;
    try { tick = tickClass?.tick; } catch (_) {}

    let tickValue = null;
    if (isNativeSingle(tick)) {
      try {
        const value = Number(tick.get(performance.now()));
        if (Number.isFinite(value)) tickValue = value;
      } catch (_) {}
    }

    let processed = 0;
    try { processed = Number(manager?.getProcessedChunkCount?.()) || 0; } catch (_) {}

    let queueSize = -1;
    try {
      const queue = manager?.chunkRenderQueue;
      queueSize = Number(
        queue?.size ??
        queue?.length ??
        queue?.queue?.length ??
        queue?.highPriority?.length
      );
      if (!Number.isFinite(queueSize)) queueSize = -1;
    } catch (_) {}

    let meshChildren = -1;
    try { meshChildren = Number(root?.children?.length); } catch (_) {}
    if (!Number.isFinite(meshChildren)) meshChildren = -1;

    const p = game?.player?.pos;
    const c = gs?.camera?.position;
    const renderStats = repairLocalRender(false) || state.localRenderStats || {};

    const probe = {
      at: new Date().toISOString(),
      gameState: Number(game?.state) || 0,
      renderLoopErrored: game?.renderLoopErrored === true,
      lastRenderAgeMs:
        Number(game?.lastRenderTime) > 0
          ? Math.max(0, Math.round(performance.now() - Number(game.lastRenderTime)))
          : null,
      tick: {
        className: String(tickClass?.name || ''),
        type: tick === null ? 'missing' : typeof tick,
        constructor: String(tick?.constructor?.name || ''),
        validSingle: isNativeSingle(tick),
        recovered: state.gameSceneTickRecovered === true,
        value: tickValue
      },
      sceneUpdate: {
        failures: Number(state.sceneUpdateFailures) || 0,
        lastError: String(state.sceneUpdateLastError || '')
      },
      world: {
        attached: game?.world === state.world,
        isClient: state.world?.isClient === true,
        isServer: state.world?.isServer === true,
        dimension: Number(state.world?.dimensionId) || 0,
        worldTime: Number(state.world?.worldTime) || 0,
        loadedChunks: loadedChunkCount(game)
      },
      renderer: {
        renderedChunks: renderChunkCount(game),
        processedChunks: processed,
        queueSize,
        wasmReady: worker?.isWasmReady?.() === true,
        pendingUploadOrder: Number(manager?.pendingUploadOrder?.length) || 0,
        pendingUploads: Number(manager?.pendingUploads?.size) || 0,
        workerSeeded: Number(state.chunkLoadDiagnostics?.rendererSeeded) || 0,
        workerQueued: Number(state.chunkLoadDiagnostics?.rendererQueued) || 0
      },
      scene: {
        present: !!scene,
        chunkRootAttached: !!(root && scene && root.parent === scene),
        chunkRootVisible: root?.visible !== false,
        chunkRootChildren: meshChildren,
        meshes: Number(renderStats.meshes) || 0,
        visibleMeshes: Number(renderStats.visible) || 0,
        texturedMeshes: Number(renderStats.textured) || 0,
        lightAttributes: Number(renderStats.lightAttributes) || 0,
        blackLightAttributes: Number(renderStats.blackLightAttributes) || 0
      },
      player: p ? {
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
        z: Number(p.z) || 0,
        registeredInPlayers: state.world?.players?.get?.(state.localPlayerId) === game?.player,
        registeredInEntities: state.world?.entities?.get?.(state.localPlayerId) === game?.player,
        meshPresent: !!game?.player?.mesh,
        meshAttached: !!(game?.player?.mesh && gs?.entityMeshes && game.player.mesh.parent === gs.entityMeshes),
        meshVisible: game?.player?.mesh?.visible !== false,
        entityReady: state.localPlayerEntityReady === true
      } : null,
      drops: { ...(state.dropStats || {}) },
      camera: c ? {
        x: Number(c.x) || 0,
        y: Number(c.y) || 0,
        z: Number(c.z) || 0,
        near: Number(gs?.camera?.near) || 0,
        far: Number(gs?.camera?.far) || 0,
        fov: Number(gs?.camera?.fov) || 0
      } : null,
      diagnostics: { ...(state.chunkLoadDiagnostics || {}) }
    };

    state.renderProbe = probe;

    if (logResult) {
      console.log('[MiniFeather Local Render Probe]', probe);
    }

    return probe;
  }

  // ── Blindaje de gameScene.update ───────────────────────────────────
  // Conserva siempre el update nativo. Si falla, primero repara tick/roots y
  // lo reintenta; solo ese frame usa el fallback de cielo. Así no ocultamos un
  // error permanente ni sustituimos el pipeline 3D por un renderer falso.
  function patchGameSceneUpdateForLocal(game) {
    const gs = game?.gameScene;

    if (
      !gs ||
      typeof gs.update !== 'function' ||
      gs.__mfLocalSceneUpdatePatched
    ) {
      return false;
    }

    const originalUpdate = gs.update;

    state.sceneUpdateRestore = () => {
      try {
        if (gs.update !== originalUpdate) gs.update = originalUpdate;
      } catch (_) {}
      gs.__mfLocalSceneUpdatePatched = false;
    };

    const manualSceneUpdate = function () {
      try { this.clouds?.update?.(); } catch (_) {}
      try { this.stars?.update?.(); } catch (_) {}
      try { this.sun?.update?.(); } catch (_) {}
      try { this.sky?.update?.(); } catch (_) {}
      try { this.fog?.update?.(); } catch (_) {}
      try { this.weather?.update?.(); } catch (_) {}
    };

    gs.update = function (...args) {
      try {
        return originalUpdate.apply(this, args);
      } catch (firstError) {
        state.sceneUpdateFailures =
          (Number(state.sceneUpdateFailures) || 0) + 1;

        const tickFixed = repairGameSceneTick(game);
        ensureNativeSceneRoots(game);

        if (tickFixed) {
          try {
            return originalUpdate.apply(this, args);
          } catch (retryError) {
            state.sceneUpdateLastError = String(
              retryError?.stack || retryError?.message || retryError || firstError
            ).slice(0, 500);
          }
        } else {
          state.sceneUpdateLastError = String(
            firstError?.stack || firstError?.message || firstError
          ).slice(0, 500);
        }

        const now = performance.now();
        if (now - Number(state.sceneUpdateLastErrorAt || 0) > 2000) {
          state.sceneUpdateLastErrorAt = now;
          logWarn(
            `gameScene.update falló; tickFixed=${tickFixed}. Fallback visual solo para este frame: ${state.sceneUpdateLastError}`
          );
        }

        manualSceneUpdate.call(this);
      }
    };

    gs.__mfLocalSceneUpdatePatched = true;
    return true;
  }

  function restoreGameSceneUpdate() {
    if (typeof state.sceneUpdateRestore === 'function') {
      state.sceneUpdateRestore();
    }
    state.sceneUpdateRestore = null;
  }

  // ── Reloj de UI (e.tick) ───────────────────────────────────────────
  // (Reemplazado por patchGameSceneUpdateForLocal: el observable vive en un
  // closure interno del bundle y no es accesible para reparación directa.)

  function createFreshNativeLocalWorld(game, dimension = 0) {
    if (!game?.world || !game?.gameScene) {
      return false;
    }

    const oldWorld = game.world;
    const WorldCtor = oldWorld?.constructor;

    if (typeof WorldCtor !== 'function') {
      return false;
    }

    restoreProviderGuard();

    // Capture the native static Single before any world/scene cleanup.
    captureGameSceneTick(game);

    try {
      game.player?.stopSpectating?.();
    } catch (_) {}

    try {
      oldWorld.clear?.();
    } catch (_) {}

    try {
      game.gameScene.clear?.();
    } catch (_) {}

    let newWorld = null;

    try {
      newWorld = new WorldCtor(
        game,
        game.gameScene,
        Number(dimension) || 0
      );
    } catch (_) {
      return false;
    }

    // El reloj de UI (e.tick) se inicializa solo conectando a un servidor
    // real. Sin él, gameScene.update() lanza "e.tick.set is not a function"
    // en CADA frame → el render 3D nunca corre (solo se ve el cielo).
    // El patch blinda update() con fallback manual (el reloj vive en un
    // closure del bundle y no es accesible para repararlo directamente).
    patchGameSceneUpdateForLocal(game);

    if (
      !newWorld ||
      newWorld.isClient !== true ||
      !newWorld.chunkProvider
    ) {
      return false;
    }

    try {
      game.world = newWorld;
    } catch (_) {
      return false;
    }

    try {
      game.chunkRenderManager.world = newWorld;
    } catch (_) {}

    repairGameSceneTick(game);
    ensureNativeSceneRoots(game);

    try {
      game.player.world = newWorld;
      game.player.dimension = Number(dimension) || 0;
    } catch (_) {}

    try {
      newWorld.dimensionId = Number(dimension) || 0;
      newWorld.totalTime = 6000;
      newWorld.worldTime = 6000;
    } catch (_) {}

    try {
      game.chunkManager?.clear?.();
    } catch (_) {}

    try {
      game.chunkRenderManager?.reload?.();
    } catch (_) {
      try {
        game.chunkRenderManager?.clear?.();
      } catch (_) {}
    }

    try {
      newWorld.invalidateChunkCache?.();
    } catch (_) {}

    state.world = newWorld;
    state.freshWorldCreated = true;

    return true;
  }

  function looksLikeWorldAssetManager(value) {
    return !!(
      value &&
      typeof value === 'object' &&
      typeof value.ensureWorldAssets === 'function' &&
      (
        typeof value.ensureMenuTextures === 'function' ||
        typeof value.loadSpritesheet === 'function'
      ) &&
      (
        'materialWorld' in value ||
        'materialFluidWorld' in value ||
        'atlasUrl' in value ||
        'spritesheetPixels' in value
      )
    );
  }

  function resolveWorldAssetManager() {
    if (looksLikeWorldAssetManager(state.worldAssetManager)) {
      return state.worldAssetManager;
    }

    const mod = state.moduleNamespace;

    if (!mod || typeof mod !== 'object') return null;

    // Current Miniblox exports the singleton texture manager from the main
    // module. Prefer the known aliases when present, then fall back to shape
    // detection so this keeps working when Rollup/Vite changes export names.
    for (const key of ['Bo', 'Ei']) {
      const candidate = mod[key];
      if (!looksLikeWorldAssetManager(candidate)) continue;
      state.worldAssetManager = candidate;
      return candidate;
    }

    for (const value of Object.values(mod)) {
      if (!looksLikeWorldAssetManager(value)) continue;
      state.worldAssetManager = value;
      return value;
    }

    return null;
  }

  function resolveMasterRenderer() {
    const mod = state.moduleNamespace;

    if (!mod) return null;

    for (const value of Object.values(mod)) {
      if (
        typeof value === 'function' &&
        typeof value.render === 'function' &&
        typeof value.resize === 'function' &&
        value.renderer
      ) {
        return value;
      }
    }

    return null;
  }

  function worldTextureAssetsReady(assets) {
    // The terrain renderer only needs the native world/fluid materials and
    // their atlas texture maps. `atlas` is an Image and `spritesheetPixels`
    // is mainly used by UI/tint helpers; treating those as hard requirements
    // caused false LOCAL_TEXTURE_ASSETS_FAILED errors even when the renderer
    // already had a usable GPU texture.
    return !!(
      assets?.materialWorld?.map &&
      assets?.materialFluidWorld?.map
    );
  }

  function refreshTextureDiagnostics(assets, lastError = '') {
    const map =
      assets?.materialWorld?.map ||
      assets?.material?.map ||
      null;

    state.textureDiagnostics = {
      menuLoaded:
        assets?.menuTexturesLoaded === true,
      worldLoaded:
        assets?.worldAssetsLoaded === true,
      atlasReady:
        !!assets?.atlas,
      spritesheetReady:
        !!assets?.spritesheetPixels?.length,
      materialReady:
        !!assets?.materialWorld,
      fluidMaterialReady:
        !!assets?.materialFluidWorld,
      mapReady:
        !!map,
      lastError:
        String(lastError || '').slice(0, 180)
    };
  }

  function setAttributeFullBright(attribute) {
    if (!attribute?.array) return false;

    const array = attribute.array;
    const itemSize = Number(attribute.itemSize) || 0;

    if (itemSize < 3 || array.length < 3) {
      return false;
    }

    const integerArray =
      array instanceof Uint8Array ||
      array instanceof Uint8ClampedArray ||
      array instanceof Uint16Array ||
      array instanceof Uint32Array;

    const full =
      integerArray
        ? (
            array instanceof Uint16Array
              ? 65535
              : array instanceof Uint32Array
                ? 4294967295
                : 255
          )
        : 1;

    for (
      let i = 0;
      i + 2 < array.length;
      i += itemSize
    ) {
      array[i] = full;
      array[i + 1] = full;
      array[i + 2] = full;
    }

    attribute.needsUpdate = true;
    return true;
  }

  function lightAttributeLooksBlack(attribute) {
    if (!attribute?.array) return false;

    const array = attribute.array;
    const itemSize = Number(attribute.itemSize) || 0;

    if (itemSize < 3 || array.length < 3) return false;

    const normalizedInteger =
      attribute.normalized === true &&
      (
        array instanceof Uint8Array ||
        array instanceof Uint8ClampedArray ||
        array instanceof Uint16Array ||
        array instanceof Uint32Array
      );

    const scale = normalizedInteger
      ? (
          array instanceof Uint16Array
            ? 65535
            : array instanceof Uint32Array
              ? 4294967295
              : 255
        )
      : 1;

    const limit = Math.min(array.length, itemSize * 1024);
    let brightest = 0;

    for (let i = 0; i + 2 < limit; i += itemSize) {
      const sky = Math.abs(Number(array[i]) || 0) / scale;
      const block = Math.abs(Number(array[i + 1]) || 0) / scale;
      const shade = Math.abs(Number(array[i + 2]) || 0) / scale;
      brightest = Math.max(brightest, sky, block, shade);

      if (brightest > 0.02) return false;
    }

    return true;
  }

  function repairBlackLightAttribute(attribute) {
    if (!lightAttributeLooksBlack(attribute)) return false;

    const array = attribute.array;
    const itemSize = Number(attribute.itemSize) || 0;

    const integerArray =
      array instanceof Uint8Array ||
      array instanceof Uint8ClampedArray ||
      array instanceof Uint16Array ||
      array instanceof Uint32Array;

    const full = integerArray
      ? (
          array instanceof Uint16Array
            ? 65535
            : array instanceof Uint32Array
              ? 4294967295
              : 255
        )
      : 1;

    // Miniblox terrain shader expects: x = sky light, y = block light,
    // z = AO/face shade. Use daylight, no fake block emission, full AO.
    for (let i = 0; i + 2 < array.length; i += itemSize) {
      array[i] = full;
      array[i + 1] = 0;
      array[i + 2] = full;
    }

    attribute.needsUpdate = true;
    return true;
  }

  function repairZeroColorAttribute(attribute) {
    if (!attribute?.array) return false;

    const array = attribute.array;
    const itemSize = Number(attribute.itemSize) || 0;

    if (itemSize < 3 || array.length < 3) {
      return false;
    }

    let max = 0;

    const sample =
      Math.min(array.length, 4096);

    for (let i = 0; i < sample; i++) {
      const value =
        Math.abs(Number(array[i]) || 0);

      if (value > max) max = value;

      if (max > 0.02) {
        return false;
      }
    }

    const integerArray =
      array instanceof Uint8Array ||
      array instanceof Uint8ClampedArray ||
      array instanceof Uint16Array ||
      array instanceof Uint32Array;

    const full =
      integerArray
        ? (
            array instanceof Uint16Array
              ? 65535
              : array instanceof Uint32Array
                ? 4294967295
                : 255
          )
        : 1;

    for (
      let i = 0;
      i < array.length;
      i += itemSize
    ) {
      array[i] = full;

      if (i + 1 < array.length) {
        array[i + 1] = full;
      }

      if (i + 2 < array.length) {
        array[i + 2] = full;
      }

      if (
        itemSize >= 4 &&
        i + 3 < array.length
      ) {
        array[i + 3] = full;
      }
    }

    attribute.needsUpdate = true;
    return true;
  }

  function keepLocalWorldInDaylight() {
    const game = state.game;
    const world = state.world;

    if (!game || !world) return;

    if (
      !Number.isFinite(
        Number(world.worldTime)
      ) ||
      Number(world.worldTime) < 1000 ||
      Number(world.worldTime) > 11000
    ) {
      world.worldTime = 6000;
    }

    if (
      !Number.isFinite(
        Number(world.totalTime)
      ) ||
      Number(world.totalTime) < 6000
    ) {
      world.totalTime = 6000;
    }

    try {
      game.serverInfo.doDaylightCycle = false;
    } catch (_) {}

    try {
      game.gameScene?.update?.();
    } catch (_) {}
  }

  function repairLocalRender(force = false) {
    if (!state.active || !state.directLocal) return null;

    const now = performance.now();

    if (!force && now - state.localRenderFixAt < 200) {
      return state.localRenderStats;
    }

    state.localRenderFixAt = now;

    const game = state.game;
    const scene = game?.gameScene?.scene;
    const root = game?.gameScene?.chunkMeshes;

    if (!scene || !root) return null;

    // Keep Miniblox in charge of materials, shaders and renderer.render().
    // The previous repair path could race the native chunk worker/render loop.
    try {
      if (root.parent !== scene) scene.add(root);
      root.visible = true;
    } catch (_) {}

    const stats = {
      meshes: 0,
      visible: 0,
      textured: 0,
      nativeMaterials: 0,
      lightAttributes: 0,
      blackLightAttributes: 0,
      repairedLightAttributes: 0
    };

    try {
      root.traverse(object => {
        if (!object?.isMesh || !object.geometry) return;

        stats.meshes++;

        if (object.visible !== false) {
          stats.visible++;
        }

        const light = object.geometry?.getAttribute?.('light');

        if (light?.array) {
          stats.lightAttributes++;

          if (lightAttributeLooksBlack(light)) {
            stats.blackLightAttributes++;

            // Only touch the worker-produced light attribute after the native
            // lighting pass had a chance to run. Never replace the material or
            // texture atlas: that was the source of the old white/blue worlds.
            if (force && repairBlackLightAttribute(light)) {
              stats.repairedLightAttributes++;
            }
          }
        }

        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];

        for (const material of materials) {
          if (!material) continue;

          stats.nativeMaterials++;

          if (material.map) {
            stats.textured++;
          }
        }
      });
    } catch (_) {}

    // Los meshes heredan el singleton N.materialWorld al crearse. Si el
    // atlas terminó de cargar DESPUÉS (mundo local arrancado desde el
    // menú, sin assets de mundo), el material compartido queda sin map y
    // todos los chunks se ven como color plano. updateTexture() es la
    // ruta nativa que reasigna materialWorld (con atlas) a cada mesh.
    if (
      force &&
      stats.nativeMaterials > 0 &&
      stats.textured === 0 &&
      typeof game?.chunkRenderManager?.updateTexture === 'function' &&
      !state.textureResyncInFlight
    ) {
      state.textureResyncInFlight = true;

      logWarn(`repairLocalRender: ${stats.nativeMaterials} meshes SIN textura → llamando updateTexture()`);

      Promise.resolve(
        game.chunkRenderManager.updateTexture()
      )
        .catch(err => {
          logError('repairLocalRender: updateTexture falló:', err);
        })
        .finally(() => {
          state.textureResyncInFlight = false;
        });
    }

    state.localRenderStats = stats;

    logTrace(`repairLocalRender: ${JSON.stringify(stats)}`);

    return stats;
  }

  function markTextureMaterialsDirty(assets) {
    const materials = new Set();

    for (const key of [
      'material',
      'materialTransparent',
      'materialEnchanted',
      'materialWorld',
      'materialFluidWorld'
    ]) {
      const material = assets?.[key];
      if (material) materials.add(material);
    }

    try {
      for (const value of Object.values(assets || {})) {
        if (
          value &&
          typeof value === 'object' &&
          value.isMaterial === true
        ) {
          materials.add(value);
        }
      }
    } catch (_) {}

    for (const material of materials) {
      try {
        if (material.map) {
          material.map.needsUpdate = true;
        }

        material.needsUpdate = true;
      } catch (_) {}
    }
  }

  async function ensureLocalWorldAssets(game = state.game) {
    const assets = resolveWorldAssetManager();

    state.worldAssetsReady = false;

    if (!assets) {
      refreshTextureDiagnostics(null, 'Native Miniblox texture manager not found');
      return false;
    }

    let error = '';

    const waitForTerrainMaterials = async (timeoutMs = 12000) => {
      const started = performance.now();
      while (performance.now() - started < timeoutMs) {
        if (worldTextureAssetsReady(assets)) return true;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return worldTextureAssetsReady(assets);
    };

    try {
      // Mirror Miniblox's native boot order. Game.init() owns this promise and
      // prepareEngine() waits for it before booting WebGL. Do not clear or
      // replace menuTexturesPromise: doing so races the game's own loader.
      if (game?.menuLoad && typeof game.menuLoad.then === 'function') {
        await game.menuLoad;
      } else if (typeof assets.ensureMenuTextures === 'function') {
        await assets.ensureMenuTextures();
      }

      // Normal Game.connect() waits for world assets after boot/prewarm.
      await assets.ensureWorldAssets?.();

      if (!await waitForTerrainMaterials(2500)) {
        // One controlled native retry is safe. Unlike v5.5, never reset the
        // singleton's promises/flags and never start parallel texture loads.
        if (typeof assets.loadSpritesheet === 'function') {
          await assets.loadSpritesheet();
        } else if (typeof assets.ensureMenuTextures === 'function') {
          await assets.ensureMenuTextures();
        }
      }

      await waitForTerrainMaterials(7000);
    } catch (assetError) {
      const detail =
        assetError?.message ||
        assetError?.type ||
        assetError?.target?.src ||
        assetError?.target?.currentSrc ||
        assetError;

      error = String(detail || 'Texture loading failed');

      // A TextureLoader error is commonly delivered as an Event. If a native
      // load was already in progress, give that original load time to finish
      // instead of declaring failure immediately.
      try {
        await waitForTerrainMaterials(5000);
      } catch (_) {}
    }

    const ready = worldTextureAssetsReady(assets);

    if (ready) {
      markTextureMaterialsDirty(assets);

      try {
        assets.materialWorld.map.needsUpdate = true;
      } catch (_) {}

      try {
        assets.materialFluidWorld.map.needsUpdate = true;
      } catch (_) {}

      try {
        const renderer = resolveMasterRenderer();
        renderer?.updateResolution?.();
        renderer?.resize?.();
      } catch (_) {}
    }

    state.worldAssetsReady = ready;
    refreshTextureDiagnostics(assets, error);

    return ready;
  }

  function enterLocalVisualMode() {
    if (state.visualRestore) return;

    const body = document.body;
    const holder =
      document.getElementById(
        'canvas-holder'
      );

    const restore = {
      body: body
        ? {
            backgroundImage:
              body.style.backgroundImage,
            backgroundSize:
              body.style.backgroundSize,
            backgroundPosition:
              body.style.backgroundPosition,
            backgroundRepeat:
              body.style.backgroundRepeat,
            backgroundColor:
              body.style.backgroundColor
          }
        : null,
      holder: holder
        ? {
            display: holder.style.display,
            visibility:
              holder.style.visibility,
            opacity: holder.style.opacity
          }
        : null,
      titleImages: []
    };

    document.documentElement
      .classList.add(
        'mf-local-world-active'
      );

    let style =
      document.getElementById(
        'mf-local-world-visual-style'
      );

    if (!style) {
      style =
        document.createElement('style');

      style.id =
        'mf-local-world-visual-style';

      style.textContent = `
        html.mf-local-world-active body {
          background-image: none !important;
          background-color: #6f8fad !important;
        }

        html.mf-local-world-active #canvas-holder,
        html.mf-local-world-active #canvas-holder canvas {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
      `;

      (
        document.head ||
        document.documentElement
      ).appendChild(style);
    }

    if (body) {
      body.style.setProperty(
        'background-image',
        'none',
        'important'
      );

      body.style.setProperty(
        'background-color',
        '#6f8fad',
        'important'
      );
    }

    if (holder) {
      holder.style.setProperty(
        'display',
        'block',
        'important'
      );

      holder.style.setProperty(
        'visibility',
        'visible',
        'important'
      );

      holder.style.setProperty(
        'opacity',
        '1',
        'important'
      );
    }

    for (
      const img of
      document.querySelectorAll('img')
    ) {
      if (
        img.closest?.(
          '#mf-gui-shell, [data-mf-overlay-root]'
        )
      ) {
        continue;
      }

      let computed;
      let rect;

      try {
        computed =
          getComputedStyle(img);

        rect =
          img.getBoundingClientRect();
      } catch (_) {
        continue;
      }

      if (
        computed.position !== 'fixed' ||
        computed.objectFit !== 'cover' ||
        rect.width < innerWidth * 0.9 ||
        rect.height < innerHeight * 0.9
      ) {
        continue;
      }

      restore.titleImages.push({
        element: img,
        display:
          img.style.getPropertyValue(
            'display'
          ),
        priority:
          img.style.getPropertyPriority(
            'display'
          )
      });

      img.style.setProperty(
        'display',
        'none',
        'important'
      );
    }

    state.visualRestore = restore;
  }

  function refreshLocalVisualMode() {
    if (
      !state.active ||
      !state.directLocal
    ) {
      return;
    }

    if (!state.visualRestore) {
      enterLocalVisualMode();
    }

    if (document.body) {
      document.body.style.setProperty(
        'background-image',
        'none',
        'important'
      );
    }

    const holder =
      document.getElementById(
        'canvas-holder'
      );

    if (holder) {
      holder.style.setProperty(
        'display',
        'block',
        'important'
      );

      holder.style.setProperty(
        'visibility',
        'visible',
        'important'
      );

      holder.style.setProperty(
        'opacity',
        '1',
        'important'
      );

      for (
        const canvas of
        holder.querySelectorAll('canvas')
      ) {
        canvas.style.setProperty(
          'display',
          'block',
          'important'
        );

        canvas.style.setProperty(
          'visibility',
          'visible',
          'important'
        );

        canvas.style.setProperty(
          'opacity',
          '1',
          'important'
        );
      }
    }
  }

  function exitLocalVisualMode() {
    const restore =
      state.visualRestore;

    document.documentElement
      .classList.remove(
        'mf-local-world-active'
      );

    document
      .getElementById(
        'mf-local-world-visual-style'
      )
      ?.remove();

    if (!restore) return;

    const body = document.body;

    if (body && restore.body) {
      body.style.backgroundImage =
        restore.body.backgroundImage;

      body.style.backgroundSize =
        restore.body.backgroundSize;

      body.style.backgroundPosition =
        restore.body.backgroundPosition;

      body.style.backgroundRepeat =
        restore.body.backgroundRepeat;

      body.style.backgroundColor =
        restore.body.backgroundColor;
    }

    const holder =
      document.getElementById(
        'canvas-holder'
      );

    if (holder && restore.holder) {
      holder.style.display =
        restore.holder.display;

      holder.style.visibility =
        restore.holder.visibility;

      holder.style.opacity =
        restore.holder.opacity;
    }

    for (
      const item of
      restore.titleImages || []
    ) {
      if (!item.element?.isConnected) {
        continue;
      }

      if (item.display) {
        item.element.style.setProperty(
          'display',
          item.display,
          item.priority || ''
        );
      } else {
        item.element.style.removeProperty(
          'display'
        );
      }
    }

    state.visualRestore = null;
  }

  function blockPos(x, y, z) {
    return {
      x,
      y,
      z,
      getX() { return x; },
      getY() { return y; },
      getZ() { return z; }
    };
  }

  function key(x, y, z) {
    return `${x},${y},${z}`;
  }

  function getChunk(x, z) {
    const world = state.world;
    if (!world) return null;

    try {
      const chunk = world.getChunk({ x, y: 0, z });
      return chunk && !chunk.isDummyChunk ? chunk : null;
    } catch (_) {
      return null;
    }
  }

  function getStateAt(x, y, z) {
    const chunk = getChunk(x, z);
    if (!chunk) return null;

    try {
      return chunk.getBlockState(blockPos(x, y, z));
    } catch (_) {
      return null;
    }
  }

  function getStateIdAt(x, y, z) {
    const chunk = getChunk(x, z);
    if (!chunk) return null;

    try {
      if (typeof chunk.getStateId === 'function') {
        return Number(chunk.getStateId(blockPos(x, y, z)));
      }

      return Number(chunk.getBlockState(blockPos(x, y, z))?.id);
    } catch (_) {
      return null;
    }
  }

  function looksLikeBlockRegistry(value) {
    if (!value || (typeof value !== 'function' && typeof value !== 'object')) {
      return false;
    }

    try {
      if (typeof value.fromBlockStateId !== 'function') return false;

      const air =
        value.air ||
        (typeof value.tryFromName === 'function' ? value.tryFromName('air') : null);

      const stone =
        value.stone ||
        (typeof value.tryFromName === 'function' ? value.tryFromName('stone') : null);

      return !!(
        air?.defaultState &&
        stone?.defaultState &&
        Number.isFinite(Number(air.defaultState.id)) &&
        Number.isFinite(Number(stone.defaultState.id))
      );
    } catch (_) {
      return false;
    }
  }

  function resolveBlockRegistry() {
    if (looksLikeBlockRegistry(state.blockRegistry)) {
      return state.blockRegistry;
    }

    const directCandidates = [
      globalThis.Blocks,
      globalThis.window?.Blocks
    ];

    for (const candidate of directCandidates) {
      if (!looksLikeBlockRegistry(candidate)) continue;
      state.blockRegistry = candidate;
      return candidate;
    }

    const mod = state.moduleNamespace;

    if (mod && typeof mod === 'object') {
      for (const value of Object.values(mod)) {
        if (!looksLikeBlockRegistry(value)) continue;

        state.blockRegistry = value;

        // A few older MiniFeather modules still look for window.Blocks.
        // Expose the exact native registry only after positively identifying it.
        try {
          if (!globalThis.Blocks) globalThis.Blocks = value;
        } catch (_) {}

        return value;
      }
    }

    return null;
  }

  function stateById(id) {
    const Blocks = resolveBlockRegistry();
    if (!Blocks || !Number.isFinite(Number(id))) return null;

    try {
      return Blocks.fromBlockStateId(Number(id));
    } catch (_) {
      return null;
    }
  }

  function stateFor(name, fallback = 'stone') {
    const Blocks = resolveBlockRegistry();
    if (!Blocks) return null;

    const names = [name, fallback].filter(Boolean);

    for (const candidate of names) {
      let block = null;

      try {
        block =
          Blocks[candidate] ||
          (typeof Blocks.tryFromName === 'function'
            ? Blocks.tryFromName(candidate)
            : null);
      } catch (_) {}

      if (!block) continue;

      const result =
        block.defaultState ||
        (typeof block.getDefaultState === 'function'
          ? block.getDefaultState()
          : null);

      if (result && Number.isFinite(Number(result.id))) return result;
    }

    return null;
  }

  function stateForAny(...names) {
    for (const name of names) {
      const stateValue = stateFor(name, '');
      if (stateValue) return stateValue;
    }
    return null;
  }

  function blockCoordinates(pos) {
    const read = (axis, getter) => {
      let value = Number(pos?.[axis]);
      if (!Number.isFinite(value)) {
        try { value = Number(pos?.[getter]?.()); } catch (_) {}
      }
      return Number.isFinite(value) ? Math.floor(value) : NaN;
    };

    const x = read('x', 'getX');
    const y = read('y', 'getY');
    const z = read('z', 'getZ');
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
  }

  function isAirState(blockState) {
    if (!blockState) return true;

    try {
      const air = stateFor('air', '');
      if (
        air &&
        Number.isFinite(Number(air.id)) &&
        Number(blockState.id) === Number(air.id)
      ) {
        return true;
      }
    } catch (_) {}

    try {
      return String(blockState.getBlock?.()?.name || '').toLowerCase() === 'air';
    } catch (_) {
      return false;
    }
  }

  function looksLikeItemsRegistry(value) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      return false;
    }

    try {
      const stone = value.stone;
      const sword = value.wooden_sword || value.stone_sword;
      return !!(
        stone &&
        sword &&
        Number.isFinite(Number(stone.id)) &&
        typeof stone.isItemBlock === 'function' &&
        stone.isItemBlock() === true
      );
    } catch (_) {
      return false;
    }
  }

  function resolveItemsRegistry() {
    if (looksLikeItemsRegistry(state.itemsRegistry)) return state.itemsRegistry;

    for (const candidate of [globalThis.Items, globalThis.window?.Items]) {
      if (!looksLikeItemsRegistry(candidate)) continue;
      state.itemsRegistry = candidate;
      return candidate;
    }

    const mod = state.moduleNamespace;
    if (mod && typeof mod === 'object') {
      for (const value of Object.values(mod)) {
        if (!looksLikeItemsRegistry(value)) continue;
        state.itemsRegistry = value;
        return value;
      }
    }

    return null;
  }

  function itemForBlock(block) {
    if (!block || typeof block !== 'object') return null;

    try {
      const cached = state.blockItemCache.get(block);
      if (cached) return cached;
    } catch (_) {}

    const Items = resolveItemsRegistry();
    if (!Items) return null;

    const blockName = String(block.name || '');
    let item = blockName ? Items[blockName] : null;

    try {
      if (
        item &&
        typeof item.isItemBlock === 'function' &&
        item.isItemBlock() === true
      ) {
        state.blockItemCache.set(block, item);
        return item;
      }
    } catch (_) {}

    for (const candidate of Object.values(Items)) {
      try {
        if (
          typeof candidate?.isItemBlock !== 'function' ||
          candidate.isItemBlock() !== true ||
          typeof candidate.getBlock !== 'function' ||
          candidate.getBlock() !== block
        ) {
          continue;
        }
        item = candidate;
        state.blockItemCache.set(block, item);
        return item;
      } catch (_) {}
    }

    return null;
  }

  function nativeVector(x, y, z) {
    const sample = state.game?.player?.pos;
    const Ctor = sample?.constructor;

    if (typeof Ctor === 'function') {
      try {
        const value = new Ctor(x, y, z);
        if (value && Number.isFinite(Number(value.x))) return value;
      } catch (_) {}

      try {
        const value = new Ctor();
        value?.set?.(x, y, z);
        if (value && Number.isFinite(Number(value.x))) return value;
      } catch (_) {}
    }

    return {
      x, y, z,
      set(nx, ny, nz) {
        this.x = nx;
        this.y = ny;
        this.z = nz;
        return this;
      }
    };
  }

  function localDropsEnabled() {
    const mode = String(currentGamemodeId() || state.localGameMode || 'survival').toLowerCase();
    return mode !== 'creative' && mode !== 'spectator';
  }

  function markNativeDrop(pos) {
    const xyz = blockCoordinates(pos);
    if (!xyz) return;
    state.recentNativeDrops.set(key(xyz.x, xyz.y, xyz.z), performance.now());

    if (state.recentNativeDrops.size > 96) {
      const cutoff = performance.now() - 1500;
      for (const [entryKey, at] of state.recentNativeDrops) {
        if (at < cutoff) state.recentNativeDrops.delete(entryKey);
      }
    }
  }

  function hadRecentNativeDrop(pos, maxAge = 180) {
    const xyz = blockCoordinates(pos);
    if (!xyz) return false;
    const entryKey = key(xyz.x, xyz.y, xyz.z);
    const at = Number(state.recentNativeDrops.get(entryKey)) || 0;
    if (!at) return false;
    if (performance.now() - at <= maxAge) return true;
    state.recentNativeDrops.delete(entryKey);
    return false;
  }

  function spawnLocalItem(itemOrStack, pos, yOffset = 0.15, fallback = false) {
    const world = state.world;
    if (!world || !itemOrStack || !localDropsEnabled()) return null;

    const sourceStack = itemOrStack?.item ? itemOrStack : null;
    const item =
      sourceStack?.item ||
      itemOrStack?.getItem?.() ||
      itemOrStack;

    if (!item || !Number.isFinite(Number(item.id))) return null;

    const xyz = blockCoordinates(pos) || {
      x: Number(pos?.x),
      y: Number(pos?.y),
      z: Number(pos?.z)
    };

    if (![xyz.x, xyz.y, xyz.z].every(Number.isFinite)) return null;

    const spawnPos = nativeVector(
      Number(xyz.x) + 0.5,
      Number(xyz.y) + 0.15,
      Number(xyz.z) + 0.5
    );

    try {
      const entity = world.getEntityItem?.(item, spawnPos, Number(yOffset) || 0.15);
      if (!entity) throw new Error('getEntityItem returned no entity');

      if (sourceStack && typeof entity.setEntityItemStack === 'function') {
        try {
          entity.setEntityItemStack(sourceStack.clone?.() || sourceStack);
        } catch (_) {}
      }

      try { entity.setPickupDelay?.(6); } catch (_) {}
      entity.__mfLocalPickupReadyAt = performance.now() + 220;
      entity.__mfLocalDrop = true;

      try {
        if (entity.motion) {
          entity.motion.x = (Math.random() - 0.5) * 0.09;
          entity.motion.y = 0.13 + Math.random() * 0.045;
          entity.motion.z = (Math.random() - 0.5) * 0.09;
        }
      } catch (_) {}

      const spawned = world.spawnEntityInWorld?.(entity);
      if (spawned === false) throw new Error('spawnEntityInWorld rejected item');

      state.dropStats.spawned++;
      if (fallback) state.dropStats.fallback++;
      markNativeDrop(pos);
      return entity;
    } catch (error) {
      state.dropStats.failed++;
      state.dropStats.lastError = String(error?.message || error || 'DROP_SPAWN_FAILED').slice(0, 180);
      return null;
    }
  }

  function patchWorldItemDrops() {
    const world = state.world;
    if (!world || state.worldItemPatch?.world === world) return;
    if (typeof world.addItem !== 'function') return;

    const original = world.addItem;
    const wrapped = function (itemOrStack, pos, ...args) {
      if (state.active && state.directLocal && localDropsEnabled()) {
        const entity = spawnLocalItem(itemOrStack, pos, Number(args[0]) || 0.15, false);
        if (entity) return null;
      }

      try {
        return original.call(this, itemOrStack, pos, ...args);
      } catch (_) {
        return null;
      }
    };

    try {
      world.addItem = wrapped;
      state.worldItemPatch = { world, original, wrapped };
    } catch (_) {}
  }

  function restoreWorldItemDrops() {
    const patch = state.worldItemPatch;
    state.worldItemPatch = null;
    if (!patch?.world || !patch.original) return;

    try {
      if (patch.world.addItem === patch.wrapped) patch.world.addItem = patch.original;
    } catch (_) {}
  }

  function wearHeldItemOnLocalBreak(pos, previousState, stack, damageBefore) {
    if (!localDropsEnabled()) return;
    const player = state.game?.player;
    const inventory = player?.inventory;
    const block = previousState?.getBlock?.();
    if (!stack || !block) return;

    // The online client may already predict tool wear. Only apply the native
    // ItemStack hook when this break did not change durability on its own.
    const damageAfter = Number(stack.itemDamage);
    if (
      Number.isFinite(Number(damageBefore)) &&
      Number.isFinite(damageAfter) &&
      damageAfter !== Number(damageBefore)
    ) {
      return;
    }

    try {
      stack.onBlockDestroyed?.(
        state.world,
        block,
        nativeVector(pos.x, pos.y, pos.z),
        player
      );
      inventory.markDirty?.();
    } catch (_) {}
  }

  function scheduleFallbackBlockDrop(pos, previousState) {
    if (!localDropsEnabled() || !previousState || isAirState(previousState)) return;

    const xyz = blockCoordinates(pos);
    if (!xyz) return;
    const previousBlock = previousState.getBlock?.();

    setTimeout(() => {
      if (!state.active || !state.directLocal || !localDropsEnabled()) return;
      if (hadRecentNativeDrop(xyz, 240)) return;

      const item = itemForBlock(previousBlock);
      if (!item) {
        state.dropStats.failed++;
        state.dropStats.lastError = `No ItemBlock found for ${String(previousBlock?.name || 'unknown')}`;
        return;
      }

      spawnLocalItem(item, xyz, 0.15, true);
    }, 0);
  }

  function pickupNearbyLocalItems() {
    if (!state.active || !state.directLocal || !localDropsEnabled()) return;

    const now = performance.now();
    if (now - state.lastPickupScan < 90) return;
    state.lastPickupScan = now;

    const world = state.world;
    const player = state.game?.player;
    const inventory = player?.inventory;
    const p = player?.pos;
    if (!world || !inventory || !p || typeof inventory.addItemStackToInventory !== 'function') return;

    const candidates = [];
    const seen = new Set();

    try {
      for (const entity of world.entities?.values?.() || []) {
        if (!entity || seen.has(entity)) continue;
        seen.add(entity);
        candidates.push(entity);
      }
    } catch (_) {}

    try {
      for (const entity of world.loadedEntityList || []) {
        if (!entity || seen.has(entity)) continue;
        seen.add(entity);
        candidates.push(entity);
      }
    } catch (_) {}

    for (const entity of candidates.slice(0, 128)) {
      if (entity === player || typeof entity.getEntityItem !== 'function') continue;
      if (Number(entity.__mfLocalPickupReadyAt) > now) continue;

      const ep = entity.pos;
      if (!ep) continue;
      const dx = Number(ep.x) - Number(p.x);
      const dy = Number(ep.y) - Number(p.y);
      const dz = Number(ep.z) - Number(p.z);
      if (![dx, dy, dz].every(Number.isFinite) || dx * dx + dy * dy + dz * dz > 2.6) continue;

      let stack = null;
      try { stack = entity.getEntityItem(); } catch (_) {}
      if (!stack || Number(stack.stackSize) <= 0) continue;

      let picked = false;
      try { picked = inventory.addItemStackToInventory(stack) === true; } catch (_) {}
      if (!picked) continue;

      try { inventory.markDirty?.(); } catch (_) {}
      try { world.removeEntity?.(entity); } catch (_) {}
      try {
        if (world.entities?.get?.(entity.id) === entity) world.entities.delete(entity.id);
      } catch (_) {}

      state.dropStats.pickedUp++;
    }
  }

  function hash2D(x, z, seed = 0) {
    let value =
      Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b) ^
      Math.imul((z | 0) ^ 0xc2b2ae35, 0x27d4eb2d) ^
      (seed | 0);

    value ^= value >>> 15;
    value = Math.imul(value, 0x2c1b3c6d);
    value ^= value >>> 12;
    value = Math.imul(value, 0x297a2d39);
    value ^= value >>> 15;

    return (value >>> 0) / 4294967295;
  }

  function smoothNoise(x, z, scale, seed) {
    const fx = x / scale;
    const fz = z / scale;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const sx = tx * tx * (3 - 2 * tx);
    const sz = tz * tz * (3 - 2 * tz);

    const n00 = hash2D(x0, z0, seed);
    const n10 = hash2D(x0 + 1, z0, seed);
    const n01 = hash2D(x0, z0 + 1, seed);
    const n11 = hash2D(x0 + 1, z0 + 1, seed);

    const a = n00 + (n10 - n00) * sx;
    const b = n01 + (n11 - n01) * sx;

    return a + (b - a) * sz;
  }

  function terrainHeight(x, z, seed) {
    const centerX = 8;
    const centerZ = 8;
    const dx = x - centerX;
    const dz = z - centerZ;
    const distance = Math.hypot(dx, dz);

    // Large-scale shape first, then hills/detail. The old generator forced an
    // island falloff after ~42 blocks, which meant enlarging the world mostly
    // produced ocean. Keep the terrain deterministic but let useful land
    // continue throughout the bigger local world.
    const continental =
      smoothNoise(x, z, 64, seed + 11) * 2 - 1;

    const regional =
      smoothNoise(x, z, 31, seed + 19) * 2 - 1;

    const hills =
      smoothNoise(x, z, 17, seed + 29) * 2 - 1;

    const detail =
      smoothNoise(x, z, 7, seed + 47) * 2 - 1;

    // Ridge noise gives broader mountain/valley silhouettes without adding
    // any new blocks or changing Miniblox's renderer.
    const ridgeRaw =
      smoothNoise(x, z, 43, seed + 61) * 2 - 1;
    const ridge = 1 - Math.abs(ridgeRaw);
    const mountainMask = Math.max(0, continental * 0.75 + regional * 0.35 - 0.05);

    let height =
      65 +
      continental * 7 +
      regional * 3.5 +
      hills * 3.25 +
      detail * 1.25 +
      ridge * mountainMask * 8;

    // Keep spawn predictable and safe regardless of the seed.
    if (distance < 7) {
      const blend = Math.max(0, Math.min(1, (distance - 3) / 4));
      height = 67 * (1 - blend) + height * blend;
    }

    return Math.max(46, Math.min(86, Math.round(height)));
  }

  function profileSnapshot() {
    const profile = state.game?.player?.profile || {};
    const cosmetics = profile.cosmetics || {};

    return {
      uuid: String(profile.uuid || ''),
      name: String(
        profile.username ||
        state.game?.player?.name ||
        'Player'
      ).slice(0, 24),
      skin: cosmetics.skin || 'bob',
      color: cosmetics.color || '',
      rank: profile.rank || '',
      level: Math.max(0, Number(profile.level) || 0),
      verified: profile.verified === true,
      discordBoosting: profile.discordBoosting === true,
      persistent: profile.persistData === true,
      cosmetics: { ...cosmetics }
    };
  }

  async function waitForAccount(game, timeout = 5000) {
    const accountLoaded = game?.accountLoaded;

    if (!accountLoaded || typeof accountLoaded.then !== 'function') {
      return;
    }

    await Promise.race([
      accountLoaded.catch?.(() => {}) || accountLoaded,
      new Promise(resolve => setTimeout(resolve, timeout))
    ]);
  }

  function currentGamemodeId() {
    const player = state.game?.player;

    try {
      const id = player?.mode?.toId?.();
      if (id) return String(id);
    } catch (_) {}

    try {
      const id = state.game?.info?.gamemode?.toId?.();
      if (id) return String(id);
    } catch (_) {}

    return 'survival';
  }

  function rolePermissionLevel(role) {
    if (role === 'owner') return 200;
    if (role === 'coowner') return 100;
    return 0;
  }

  function numericPeerId(value) {
    const text = String(value || 'peer');
    let hash = 2166136261;

    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return -1000000000 - ((hash >>> 0) % 900000000);
  }

  function localPlayerData() {
    const profile = profileSnapshot();

    return {
      id: state.localPlayerId,
      uuid: profile.uuid || `minifeather-local-${profile.name.toLowerCase()}`,
      permissionLevel: rolePermissionLevel(state.localRole),
      ping: 0,
      name: profile.name,
      color: profile.color,
      skin: profile.skin,
      rank: profile.rank,
      level: profile.level,
      verified: profile.verified,
      vanished: false,
      fake: false,
      discordBoosting: profile.discordBoosting,
      persistent: profile.persistent,
      namePrefix: '',
      mode: currentGamemodeId()
    };
  }

  function remotePlayerData(peerId, entry) {
    const profile = entry?.profile || entry || {};
    const name = String(profile.name || entry?.name || 'Player').slice(0, 24);

    return {
      id: Number(entry?.playerId) || numericPeerId(peerId),
      uuid: String(profile.uuid || `minifeather-peer-${String(peerId)}`),
      permissionLevel: rolePermissionLevel(entry?.role || profile.role || 'player'),
      ping: Math.max(0, Math.round(Number(entry?.ping) || 0)),
      name,
      color: profile.color || '',
      skin: profile.skin || 'bob',
      rank: profile.rank || '',
      level: Math.max(0, Number(profile.level) || 0),
      verified: profile.verified === true,
      vanished: false,
      fake: false,
      discordBoosting: profile.discordBoosting === true,
      persistent: profile.persistent === true,
      namePrefix: '',
      mode: String(entry?.mode || profile.mode || 'survival')
    };
  }

  function remoteRosterEntries() {
    if (state.mode === 'host') {
      return Array.from(state.peers.entries())
        .filter(([, peer]) => peer?.accepted !== false)
        .map(([peerId, peer]) => [peerId, peer]);
    }

    return Array.from(state.remotePlayers.entries());
  }

  function syncNativePlayerList() {
    const manager = state.game?.playerList;
    if (!manager?.playerDataMap) return false;

    try {
      manager.playerDataMap.clear();
      manager.playerDataMap.set(
        state.localPlayerId,
        localPlayerData()
      );

      for (const [peerId, entry] of remoteRosterEntries()) {
        const data = remotePlayerData(peerId, entry);
        manager.playerDataMap.set(data.id, data);
      }

      manager.rebuildSorted?.();

      try {
        if (state.game?.serverInfo) {
          state.game.serverInfo.permissionLevel =
            rolePermissionLevel(state.localRole);
          state.game.serverInfo.serverName =
            state.worldName || 'MiniFeather Local';
        }
      } catch (_) {}

      return true;
    } catch (_) {
      return false;
    }
  }

  function removePeerFromPlayerList(peerId = null) {
    if (peerId != null) {
      state.remotePlayers.delete(String(peerId));
    }

    syncNativePlayerList();
  }

  function ensureLocalPlayerEntity(forceRecreate = false) {
    const game = state.game;
    const world = state.world;
    const player = game?.player;
    if (!game || !world || !player) return false;

    const id = Number(state.localPlayerId);
    if (!Number.isFinite(id)) return false;

    try {
      player.id = id;
      player.game = game;
      player.world = world;
      player.dimension = Number(world.dimensionId) || 0;
    } catch (_) {}

    let registered = false;

    try {
      registered = world.players?.get?.(id) === player;
    } catch (_) {}

    if (!registered && typeof world.addPlayer === 'function') {
      try { world.addPlayer(player); } catch (_) {}
    }

    try {
      if (world.players?.get?.(id) !== player) world.players?.set?.(id, player);
      registered = world.players?.get?.(id) === player;
    } catch (_) {}

    let entityRegistered = false;
    try { entityRegistered = world.entities?.get?.(id) === player; } catch (_) {}

    if (!entityRegistered && typeof world.spawnEntityInWorld === 'function') {
      try { world.spawnEntityInWorld(player); } catch (_) {}
    }

    try {
      if (world.entities?.get?.(id) !== player) world.entities?.set?.(id, player);
      entityRegistered = world.entities?.get?.(id) === player;
    } catch (_) {}

    try {
      if (Array.isArray(world.loadedEntityList) && !world.loadedEntityList.includes(player)) {
        world.loadedEntityList.push(player);
      }
    } catch (_) {}

    const entityRoot = game.gameScene?.entityMeshes;

    try {
      if ((!player.mesh || player.mesh.parent !== entityRoot) && typeof world.attachEntityMesh === 'function') {
        world.attachEntityMesh(player);
      }
    } catch (_) {}

    try {
      if (forceRecreate && player.mesh) {
        if (typeof player.mesh.recreate === 'function') player.mesh.recreate();
        else player.mesh.bXbFHkqbGNBEv?.();
      }
    } catch (_) {}

    try {
      if (player.mesh) {
        if (entityRoot && player.mesh.parent !== entityRoot && typeof entityRoot.add === 'function') {
          entityRoot.add(player.mesh);
        }
        player.mesh.visible = true;
      }
    } catch (_) {}

    state.localPlayerEntityReady = !!(
      registered &&
      entityRegistered &&
      player.mesh
    );

    return state.localPlayerEntityReady;
  }

  function setLocalGamemode(modeId) {
    if (!state.active || !state.directLocal) {
      return { ok: false, error: 'NOT_LOCAL' };
    }

    const id = String(modeId || '').toLowerCase();

    if (!['survival', 'creative', 'adventure', 'spectator'].includes(id)) {
      return { ok: false, error: 'INVALID_MODE' };
    }

    // Hardcore sólo aplica a survival; si está activo y se pide creativo/
    // adventure/spectator, mantenemos el flag pero aplicamos el modo real.
    const targetMode =
      state.localHardcore && id !== 'survival' ? 'survival' : id;

    const player = state.game?.player;
    const GameMode = player?.mode?.constructor;

    if (!player || typeof player.setGamemode !== 'function') {
      return { ok: false, error: 'GAMEMODE_API_NOT_READY' };
    }

    let mode = null;

    try {
      mode =
        typeof GameMode?.fromId === 'function'
          ? GameMode.fromId(targetMode)
          : null;
    } catch (_) {}

    if (!mode && state.moduleNamespace) {
      for (const value of Object.values(state.moduleNamespace)) {
        try {
          if (
            typeof value?.fromId === 'function' &&
            value.fromId('creative')?.isCreative?.() === true
          ) {
            mode = value.fromId(targetMode);
            if (mode) break;
          }
        } catch (_) {}
      }
    }

    if (!mode) {
      return { ok: false, error: 'GAMEMODE_NOT_FOUND' };
    }

    try {
      player.setGamemode(mode);
      state.game.info.gamemode = mode;
      state.game.info.showVitals =
        targetMode !== 'creative' && targetMode !== 'spectator';

      if (targetMode === 'creative') {
        player.abilities.flying = false;
      }

      // Si hardcore está activo, anclar vitals siempre visibles y forzar
      // permisos de survival aunque el modo visible sea survival.
      if (state.localHardcore) {
        state.game.info.showVitals = true;
        if (player.abilities?.mayFly) player.abilities.mayFly = false;
        player.abilities.flying = false;
      }

      state.localGameMode = targetMode;
      syncNativePlayerList();

      // Anunciar al chat para feedback local
      if (state.localHardcore) {
        addSystemChat(
          `Mode set to Hardcore (survival) — ${id !== 'survival' ? `${id} requested but locked while hardcore is on` : 'permanent death enabled'}.`
        );
      } else {
        addSystemChat(`Game mode: ${targetMode}`);
      }

      // Notificar a los peers (host) o al host (guest)
      if (state.mode === 'host' || state.mode === 'single') {
        broadcastReliable({
          t: 'mode',
          mode: targetMode,
          hardcore: !!state.localHardcore
        });
      } else if (state.mode === 'join') {
        sendJSON(state.hostPeer?.stateChannel, {
          t: 'mode',
          mode: targetMode,
          hardcore: !!state.localHardcore
        });
      }

      emitState();

      return { ok: true, mode: targetMode, hardcore: !!state.localHardcore };
    } catch (_) {
      return { ok: false, error: 'GAMEMODE_CHANGE_FAILED' };
    }
  }

  function setLocalHardcore(enabled) {
    if (!state.active || !state.directLocal) {
      return { ok: false, error: 'NOT_LOCAL' };
    }

    const next = !!enabled;

    if (state.localHardcore === next) {
      return { ok: true, hardcore: next };
    }

    state.localHardcore = next;

    if (next) {
      // Hardcore = survival permanente. Forzar modo survival y vitals.
      addSystemChat('Hardcore enabled — one life, no flight, no regen.');
      const result = setLocalGamemode('survival');
      return result.ok
        ? { ok: true, hardcore: true, mode: 'survival' }
        : result;
    }

    addSystemChat('Hardcore disabled.');
    emitState();

    if (state.mode === 'host' || state.mode === 'single') {
      broadcastReliable({
        t: 'mode',
        mode: state.localGameMode,
        hardcore: false
      });
    } else if (state.mode === 'join') {
      sendJSON(state.hostPeer?.stateChannel, {
        t: 'mode',
        mode: state.localGameMode,
        hardcore: false
      });
    }

    return { ok: true, hardcore: false };
  }

  function toggleLocalFlight(force = null) {
    if (!state.active || !state.directLocal) {
      return { ok: false, error: 'NOT_LOCAL' };
    }

    const player = state.game?.player;

    if (!player?.abilities?.mayFly) {
      return { ok: false, error: 'CANNOT_FLY' };
    }

    const next =
      typeof force === 'boolean'
        ? force
        : !player.abilities.flying;

    player.abilities.flying = next;

    return { ok: true, flying: next };
  }

  function healLocalPlayer() {
    if (!state.active || !state.directLocal) {
      return { ok: false, error: 'NOT_LOCAL' };
    }

    try {
      state.game.info.health = 20;
      state.game.info.food = 20;
      state.game.info.absorption = 0;
      state.game.player?.setHealth?.(20);
      state.game.player?.foodStats?.setFoodLevel?.(20);
    } catch (_) {}

    return { ok: true };
  }

  function teleportToLocalSpawn() {
    if (!state.active || !state.origin) {
      return { ok: false, error: 'NOT_LOCAL' };
    }

    teleportPlayer(
      state.origin.x,
      state.origin.y + 3.05,
      state.origin.z
    );

    return { ok: true, ...state.origin };
  }

  function teleportLocal(x, y, z) {
    if (!state.active || !state.directLocal) {
      return { ok: false, error: 'NOT_LOCAL' };
    }

    const values = [x, y, z].map(Number);

    if (!values.every(Number.isFinite)) {
      return { ok: false, error: 'INVALID_POSITION' };
    }

    teleportPlayer(values[0], values[1], values[2]);
    return {
      ok: true,
      x: values[0],
      y: values[1],
      z: values[2]
    };
  }

  function notifyBlockRender(x, y, z, id) {
    const game = state.game;
    try {
      game?.chunkRenderManager?.blockUpdateReceived?.(
        { x, y, z, id },
        true,
        15
      );
    } catch (_) {}
  }

  function setStateIdAt(x, y, z, id, notify = true) {
    const chunk = getChunk(x, z);
    if (!chunk) return false;

    const position = blockPos(x, y, z);

    try {
      const changed = chunk.setBlockState(position, Number(id), true);
      if (changed && notify) notifyBlockRender(x, y, z, Number(id));
      return !!changed;
    } catch (_) {
      return false;
    }
  }

  function setStateAt(x, y, z, blockState, notify = true) {
    if (!blockState) return false;
    return setStateIdAt(x, y, z, blockState.id, notify);
  }

  function chunkHash(chunkX, chunkZ) {
    const half = 2 ** 21;
    const width = 2 ** 22;
    return Number(chunkX) + half + (Number(chunkZ) + half) * width;
  }

  function looksLikeChunkConstructor(value) {
    if (typeof value !== 'function') return false;

    try {
      return !!(
        typeof value.fromProto === 'function' &&
        typeof value.prototype?.setBlockState === 'function' &&
        typeof value.prototype?.getBlockState === 'function' &&
        typeof value.prototype?.generateHeightMap === 'function' &&
        typeof value.prototype?.toProto === 'function'
      );
    } catch (_) {
      return false;
    }
  }

  function getRealChunkConstructor() {
    if (looksLikeChunkConstructor(state.chunkConstructor)) {
      return state.chunkConstructor;
    }

    const mod = state.moduleNamespace;

    if (mod && typeof mod === 'object') {
      for (const value of Object.values(mod)) {
        if (!looksLikeChunkConstructor(value)) continue;
        state.chunkConstructor = value;
        return value;
      }
    }

    const dummy = state.world?.chunkProvider?.dummyChunk;
    const dummyCtor = dummy?.constructor;

    if (typeof dummyCtor === 'function') {
      const parent = Object.getPrototypeOf(dummyCtor);

      if (looksLikeChunkConstructor(parent)) {
        state.chunkConstructor = parent;
        return parent;
      }
    }

    return null;
  }

  function getChunkPosConstructor() {
    const mod = state.moduleNamespace;
    if (!mod) return null;

    for (const value of Object.values(mod)) {
      if (typeof value !== 'function') continue;

      try {
        if (
          typeof value.hash === 'function' &&
          typeof value.unhash === 'function' &&
          typeof value.fromCoords === 'function' &&
          typeof value.prototype?.distanceTo === 'function'
        ) {
          return value;
        }
      } catch (_) {}
    }

    return null;
  }

  function insertLocalChunk(chunkX, chunkZ) {
    const ChunkCtor = getRealChunkConstructor();

    if (!state.world || !ChunkCtor) return null;

    let chunk;

    try {
      chunk = new ChunkCtor(
        state.world,
        Number(chunkX),
        Number(chunkZ)
      );
    } catch (_) {
      return null;
    }

    try {
      chunk.isChunkLoaded = true;
    } catch (_) {}

    state.localChunks.push(chunk);
    return chunk;
  }

  async function validateNativeChunkRuntime(sampleState) {
    const ChunkCtor = getRealChunkConstructor();
    const world = state.world;

    if (!world || !ChunkCtor || !sampleState) {
      return {
        ok: false,
        error: `world=${!!world}, chunkCtor=${!!ChunkCtor}, sampleState=${!!sampleState}`
      };
    }

    try {
      const chunk = new ChunkCtor(world, 0, 0);

      if (
        !chunk ||
        typeof chunk.setBlockState !== 'function' ||
        typeof chunk.toProto !== 'function'
      ) {
        return { ok: false, error: 'Chunk API is incomplete' };
      }

      const changed = chunk.setBlockState(
        blockPos(0, 64, 0),
        Number(sampleState.id),
        false
      );

      if (changed !== true) {
        return { ok: false, error: 'setBlockState rejected a stone block' };
      }

      chunk.generateHeightMap?.();

      const packet = await chunk.toProto(Number(world.dimensionId) || 0);
      const cells = Array.isArray(packet?.cells) ? packet.cells : [];

      if (
        !packet ||
        Number(packet.x) !== 0 ||
        Number(packet.z) !== 0 ||
        cells.length < 1
      ) {
        return {
          ok: false,
          error: `invalid CPacketChunkData (cells=${cells.length})`
        };
      }

      const firstCell = cells[0];

      if (
        !Number.isFinite(Number(firstCell?.blockRefCount)) ||
        Number(firstCell.blockRefCount) < 1
      ) {
        return {
          ok: false,
          error: 'serialized cell has no block references'
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: String(error?.message || error || 'unknown error').slice(0, 180)
      };
    }
  }

  async function waitUntil(test, timeout = 12000, interval = 80) {
    const started = performance.now();

    while (performance.now() - started < timeout) {
      try {
        if (await test()) return true;
      } catch (_) {}

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return false;
  }

  async function ensureChunkRenderWorkerReady(manager, timeout = 12000) {
    const workerManager = manager?.chunkRenderWorkerManager;

    if (!workerManager) return false;

    try {
      workerManager.prewarm?.();
    } catch (_) {}

    return waitUntil(
      () => workerManager.isWasmReady?.() === true,
      timeout,
      80
    );
  }

  async function dispatchChunkPacketNative(packet) {
    const game = state.game;
    const chunkManager = game?.chunkManager;
    const renderManager = game?.chunkRenderManager;
    const provider = state.world?.chunkProvider;
    const x = Number(packet?.x);
    const z = Number(packet?.z);

    if (
      !chunkManager ||
      !renderManager ||
      !provider ||
      !Number.isFinite(x) ||
      !Number.isFinite(z)
    ) {
      return false;
    }

    // Miniblox older builds handled CPacketChunkData with the simple sequence:
    //   ChunkProvider.loadChunk -> ChunkRenderManager.newChunkReceived.
    // The current client moved that exact sequence into
    // ClientChunkManager.applyChunkData(). Calling it directly avoids the
    // network/cache/render-distance gates in handlePacketChunkData() and lets
    // Miniblox itself feed NEW_CHUNK + GENERATE_GEOMETRY + Offscreen.
    try {
      if (typeof chunkManager.applyChunkData === 'function') {
        state.chunkLoadDiagnostics.nativeApply =
          (Number(state.chunkLoadDiagnostics.nativeApply) || 0) + 1;

        chunkManager.applyChunkData(packet);

        if (provider.isLoaded?.(x, z) === true) {
          logTrace(`dispatchChunkPacketNative(${x},${z}): applyChunkData OK`);
          return true;
        }

        logWarn(`dispatchChunkPacketNative(${x},${z}): applyChunkData no cargó el chunk (isLoaded=false tras la llamada)`);
      }
    } catch (error) {
      logError(`dispatchChunkPacketNative(${x},${z}): applyChunkData lanzó:`, error);
      state.chunkLoadDiagnostics.lastError =
        `applyChunkData failed: ${String(
          error?.message || error || 'unknown error'
        ).slice(0, 160)}`;
    }

    // Compatibility with the older client supplied by the user. Its
    // handlePacketChunkData() directly performed loadChunk + newChunkReceived.
    try {
      if (typeof chunkManager.handlePacketChunkData === 'function') {
        state.chunkLoadDiagnostics.nativeIngest =
          (Number(state.chunkLoadDiagnostics.nativeIngest) || 0) + 1;

        await Promise.resolve(
          chunkManager.handlePacketChunkData(packet)
        );

        if (provider.isLoaded?.(x, z) === true) {
          return true;
        }
      }
    } catch (error) {
      state.chunkLoadDiagnostics.lastError =
        `handlePacketChunkData failed: ${String(
          error?.message || error || 'unknown error'
        ).slice(0, 160)}`;
    }

    // Last compatibility path: reproduce the old Miniblox contract directly.
    // Do not only put the chunk in ChunkProvider; newChunkReceived() is what
    // sends NEW_CHUNK to the render workers and ultimately reaches Offscreen.
    try {
      const loadedChunk = await provider.loadChunk?.(x, z, packet);

      if (!loadedChunk && provider.isLoaded?.(x, z) !== true) {
        return false;
      }

      state.chunkLoadDiagnostics.compatDirect =
        (Number(state.chunkLoadDiagnostics.compatDirect) || 0) + 1;

      renderManager.newChunkReceived?.(packet);

      try {
        const chunk = state.world?.getChunkByID?.(x, z);
        for (const tile of chunk?.chunkTileEntityMap?.values?.() || []) {
          game?.gameScene?.tileEntityRenderer?.add?.(tile);
        }
      } catch (_) {}

      return provider.isLoaded?.(x, z) === true;
    } catch (error) {
      state.chunkLoadDiagnostics.lastError =
        `Direct native chunk ingest failed: ${String(
          error?.message || error || 'unknown error'
        ).slice(0, 160)}`;
      return false;
    }
  }

  async function fallbackLoadChunkPacket(packet) {
    const provider = state.world?.chunkProvider;
    const x = Number(packet?.x);
    const z = Number(packet?.z);

    if (
      !provider ||
      !Number.isFinite(x) ||
      !Number.isFinite(z)
    ) {
      return false;
    }

    try {
      if (provider.isLoaded?.(x, z) === true) {
        return true;
      }
    } catch (_) {}

    try {
      state.chunkLoadDiagnostics.fallbackIngest++;
      const chunk = await provider.loadChunk?.(x, z, packet);
      return !!chunk;
    } catch (error) {
      state.chunkLoadDiagnostics.lastError =
        `ChunkProvider fallback failed: ${String(
          error?.message || error || 'unknown error'
        ).slice(0, 140)}`;
      return false;
    }
  }

  async function initializeLocalChunkLighting() {
    const world = state.world;
    const engine = world?.lightEngine;
    const entries = collectLoadedChunks();

    const result = {
      attempted: entries.length,
      initialized: 0,
      alreadyReady: 0,
      failed: 0,
      available: typeof engine?.initChunkLight === 'function',
      lastError: ''
    };

    if (!result.available) {
      result.lastError = 'world.lightEngine.initChunkLight is unavailable';
      return result;
    }

    // All local chunks must already be in ChunkProvider before this pass.
    // Miniblox lighting can then propagate sky/block light across neighbours.
    const px = Math.floor(Number(state.game?.player?.pos?.x) || 0) >> 4;
    const pz = Math.floor(Number(state.game?.player?.pos?.z) || 0) >> 4;

    entries.sort((a, b) => {
      const da = Math.abs(a.chunkX - px) + Math.abs(a.chunkZ - pz);
      const db = Math.abs(b.chunkX - px) + Math.abs(b.chunkZ - pz);
      return da - db;
    });

    for (let index = 0; index < entries.length; index++) {
      const { chunk, chunkX, chunkZ } = entries[index];

      try {
        chunk.generateHeightMap?.();

        if (chunk.lightInitialized === true && chunk.lightStorage) {
          result.alreadyReady++;
          result.initialized++;
          continue;
        }

        engine.initChunkLight(chunkX, chunkZ);
        chunk.lightInitialized = true;

        if (chunk.lightStorage) {
          result.initialized++;
        } else {
          result.failed++;
          result.lastError = `Chunk ${chunkX},${chunkZ} has no light storage after initChunkLight`;
        }
      } catch (error) {
        result.failed++;
        result.lastError = String(
          error?.message || error || 'unknown lighting error'
        ).slice(0, 180);
      }

      // Lighting is CPU-heavy; yield periodically so the Miniblox render loop
      // and the native Web Worker can keep pumping.
      if ((index & 3) === 3) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    try {
      engine.flushPendingLight?.();
    } catch (_) {}

    return result;
  }

  function seedLocalPacketsIntoRenderWorker(renderManager, packets) {
    const list = Array.isArray(packets) ? packets : [];
    const workerManager = renderManager?.chunkRenderWorkerManager;
    const queue = renderManager?.chunkRenderQueue;
    const ChunkPosCtor = getChunkPosConstructor();

    let seeded = 0;
    let queued = 0;
    let failed = 0;
    let lastError = '';

    if (!workerManager || typeof workerManager.sendNewChunk !== 'function') {
      return { seeded, queued, failed: list.length, lastError: 'sendNewChunk unavailable' };
    }

    // The local provider already contains every generated chunk. Calling
    // ChunkRenderManager.newChunkReceived(packet) one packet at a time would
    // immediately enqueue neighbour jobs because provider.isLoaded() is true
    // for all neighbours, even when those neighbours have not yet reached the
    // worker. Seed ALL NEW_CHUNK data first; only then enqueue geometry jobs.
    for (const packet of list) {
      try {
        workerManager.sendNewChunk(packet);
        seeded++;
      } catch (error) {
        failed++;
        lastError = String(error?.message || error || 'unknown error').slice(0, 140);
      }
    }

    if (queue && ChunkPosCtor) {
      for (const packet of list) {
        const x = Number(packet?.x);
        const z = Number(packet?.z);

        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;

        try {
          queue.enqueueHighPriority?.(new ChunkPosCtor(x, z));
          queued++;
        } catch (error) {
          failed++;
          lastError = String(error?.message || error || 'unknown queue error').slice(0, 140);
        }
      }
    }

    try {
      workerManager.assignWork?.();
    } catch (_) {}

    return { seeded, queued, failed, lastError };
  }

  async function installGeneratedChunksThroughNativePipeline() {
    const game = state.game;
    const world = state.world;
    const provider = world?.chunkProvider;
    const renderManager = game?.chunkRenderManager;
    const chunkManager = game?.chunkManager;

    if (!provider || !renderManager || !chunkManager) {
      setStatus(
        'The Miniblox chunk pipeline is not ready.',
        'CHUNK_PIPELINE_NOT_READY'
      );
      return false;
    }

    const generatedChunks =
      Array.isArray(state.localChunks)
        ? state.localChunks.slice()
        : [];

    const packets = [];
    const dimension = Number(world.dimensionId) || 0;

    for (const chunk of generatedChunks) {
      try {
        chunk.isChunkLoaded = true;
        chunk.generateHeightMap?.();
      } catch (_) {}

      try {
        const packet = await chunk.toProto?.(dimension);
        if (!packet) continue;

        packet.dimension = dimension;
        packets.push(packet);
      } catch (error) {
        state.chunkLoadDiagnostics.lastError =
          `Chunk serialization failed: ${String(
            error?.message || error || 'unknown error'
          ).slice(0, 160)}`;
      }
    }

    if (packets.length < 9) {
      setStatus(
        `Only ${packets.length} local chunks could be serialized.`,
        'LOCAL_CHUNK_SERIALIZE_FAILED'
      );
      return false;
    }

    state.generatedChunkPackets = packets;
    state.chunkLoadDiagnostics = {
      attempted: packets.length,
      loaded: 0,
      failed: 0,
      nativeApply: 0,
      nativeIngest: 0,
      compatDirect: 0,
      fallbackIngest: 0,
      workerReady: false,
      rendererSeeded: 0,
      rendererQueued: 0,
      rendererSeedFailed: 0,
      lastError: ''
    };

    try {
      renderManager.world = world;
      world.invalidateChunkCache?.();
    } catch (_) {}

    // Reset renderer/worker/Offscreen BEFORE sending any local chunk. This is
    // the important ordering taken from comparing the old and current clients.
    // Once packets begin flowing, never clear/reload the renderer again unless
    // we intentionally replay every packet through the full native pipeline.
    try {
      renderManager.clear?.();
      renderManager.world = world;
    } catch (_) {
      try { renderManager.world = world; } catch (_) {}
    }

    const workerReady =
      await ensureChunkRenderWorkerReady(renderManager, 12000);

    state.chunkLoadDiagnostics.workerReady = workerReady;

    log(`generateLocalChunks: workerReady=${workerReady}, despachando ${packets.length} packets...`);

    // updateTexture() uses the current client's own texture singleton and also
    // calls Offscreen.sendAtlas(). It is safe here because the world assets were
    // already awaited before local terrain generation.
    try {
      await Promise.resolve(renderManager.updateTexture?.());
      log('generateLocalChunks: updateTexture() OK (atlas re-sincronizado)');
    } catch (error) {
      logError('generateLocalChunks: updateTexture() falló:', error);
      state.chunkLoadDiagnostics.lastError =
        `Native texture sync failed: ${String(
          error?.message || error || 'unknown error'
        ).slice(0, 140)}`;
    }

    // Do not initialize light manually. The current ChunkRenderWorker/WASM
    // returns chunkLight and ChunkRenderManager.updateChunkMesh() applies it.
    // A normal current Miniblox server does not call lightEngine.initChunkLight
    // before newChunkReceived(), so Local Games should not either.

    let accepted = 0;

    for (let index = 0; index < packets.length; index++) {
      const packet = packets[index];

      if (await dispatchChunkPacketNative(packet)) {
        accepted++;
      }

      // Let worker message queues drain periodically. This also prevents one
      // giant synchronous burst from delaying Offscreen ADD_CHUNK uploads.
      if ((index & 3) === 3) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    await waitUntil(
      () => loadedChunkCount(game) >= Math.min(9, packets.length),
      5000,
      60
    );

    const loadedNow = loadedChunkCount(game);

    state.chunkLoadDiagnostics.loaded = loadedNow;
    state.chunkLoadDiagnostics.failed =
      Math.max(0, packets.length - loadedNow);

    log(`generateLocalChunks: dispatch terminado — accepted=${accepted}/${packets.length}, loaded=${loadedNow}, rendered=${renderChunkCount(game)}`);

    if (loadedNow < 9) {
      logError(`generateLocalChunks: LOCAL_PROVIDER_LOAD_FAILED (loaded=${loadedNow}/${packets.length}, accepted=${accepted})`);
      const diag = state.chunkLoadDiagnostics;

      setStatus(
        `Native Miniblox ingest retained only ${loadedNow}/${packets.length} chunks (accepted: ${accepted}, applyChunkData: ${diag.nativeApply}, old-handler: ${diag.nativeIngest}, direct: ${diag.compatDirect})${diag.lastError ? `, error: ${diag.lastError}` : ''}.`,
        'LOCAL_PROVIDER_LOAD_FAILED'
      );

      return false;
    }

    installProviderGuard();

    state.localChunks =
      collectLoadedChunks()
        .map(entry => entry.chunk)
        .filter(Boolean);

    for (const chunk of state.localChunks) {
      try {
        chunk.isChunkLoaded = true;
        chunk.generateHeightMap?.();
      } catch (_) {}
    }

    try {
      world.invalidateChunkCache?.();
    } catch (_) {}

    setStatus(
      `Local terrain sent through Miniblox native pipeline: ${loadedNow} chunks. Worker: ${workerReady ? 'ready' : 'starting'}.`,
      ''
    );

    return true;
  }

  async function generateLocalChunks(map) {
    log(`generateLocalChunks: begin (map=${map})`);
    const world = state.world;
    const provider = world?.chunkProvider;

    if (!world || !provider) {
      logError('generateLocalChunks: world/provider no disponible');
      setStatus(
        'The native Miniblox world/ChunkProvider is not available.',
        'LOCAL_WORLD_PROVIDER_MISSING'
      );
      return false;
    }

    state.localChunks.length = 0;
    state.terrainSurface.clear();

    const air = stateForAny('air');
    const stone = stateForAny('stone', 'cobblestone');
    const dirt = stateForAny('dirt', 'coarse_dirt', 'stone');
    const grass = stateForAny('grass_block', 'grass', 'dirt');
    const sand = stateForAny('sand', 'sandstone', 'dirt');
    const gravel = stateForAny('gravel', 'stone');
    const water = stateForAny('water');
    const bedrock = stateForAny('bedrock', 'stone');
    // OJO: no llamarlo "log" — colisiona con la función log() y causa TDZ
    const oakLog = stateForAny('oak_log', 'log', 'stone');
    const leaves = stateForAny('oak_leaves', 'leaves', 'grass_block');
    const flowerA = stateForAny('dandelion', 'yellow_flower');
    const flowerB = stateForAny('poppy', 'red_flower');
    const border = stateForAny('blue_wool', 'stone');
    const spleef =
      stateForAny('snow_block', 'white_wool', 'stone');

    if (!air || !stone || !dirt || !grass) {
      const registry = resolveBlockRegistry();
      setStatus(
        `Could not resolve Miniblox block states (registry: ${registry ? 'found' : 'missing'}, air: ${!!air}, stone: ${!!stone}, dirt: ${!!dirt}, grass: ${!!grass}).`,
        'LOCAL_BLOCK_REGISTRY_FAILED'
      );
      return false;
    }

    const chunkRuntimeTest = await validateNativeChunkRuntime(stone);

    if (!chunkRuntimeTest.ok) {
      logError(`generateLocalChunks: self-test de Chunk falló: ${chunkRuntimeTest.error}`);
      setStatus(
        `Miniblox Chunk self-test failed: ${chunkRuntimeTest.error}.`,
        'LOCAL_CHUNK_RUNTIME_SELFTEST_FAILED'
      );
      return false;
    }

    log(`generateLocalChunks: bloques resueltos (stone=${!!stone}, grass=${!!grass}, water=${!!water}, spleef=${!!spleef}), self-test OK`);

    if (map === 'spleef') {
      const floorY = 70;
      const radius = 10;

      state.worldSeed = 0;
      state.worldBounds = {
        minX: -16,
        maxX: 31,
        minZ: -16,
        maxZ: 31,
        minY: 0,
        maxY: 95
      };

      state.arena = {
        cx: 8,
        cz: 8,
        floorY,
        radius,
        height: 12,
        chunkX: 0,
        chunkZ: 0
      };

      state.origin = {
        x: 8,
        y: floorY + 1,
        z: 8
      };

      const chunks = new Map();

      for (let cx = -1; cx <= 1; cx++) {
        for (let cz = -1; cz <= 1; cz++) {
          const chunk = insertLocalChunk(cx, cz);
          if (!chunk) {
            setStatus(
              `Could not construct native Miniblox Chunk ${cx},${cz}.`,
              'LOCAL_CHUNK_CONSTRUCTOR_FAILED'
            );
            return false;
          }
          chunks.set(`${cx},${cz}`, chunk);
        }
      }

      const setLocal = (x, y, z, blockState) => {
        const cx = Math.floor(x) >> 4;
        const cz = Math.floor(z) >> 4;
        const chunk = chunks.get(`${cx},${cz}`);
        if (!chunk || !blockState) return false;

        try {
          return !!chunk.setBlockState(
            blockPos(x, y, z),
            Number(blockState.id),
            false
          );
        } catch (_) {
          return false;
        }
      };

      for (
        let x = state.arena.cx - radius;
        x <= state.arena.cx + radius;
        x++
      ) {
        for (
          let z = state.arena.cz - radius;
          z <= state.arena.cz + radius;
          z++
        ) {
          const edge =
            x === state.arena.cx - radius ||
            x === state.arena.cx + radius ||
            z === state.arena.cz - radius ||
            z === state.arena.cz + radius;

          setLocal(
            x,
            floorY,
            z,
            edge ? border : spleef
          );
        }
      }
    } else {
      const minChunk = -LOCAL_TERRAIN_RADIUS_CHUNKS;
      const maxChunk = LOCAL_TERRAIN_RADIUS_CHUNKS;
      const minX = minChunk * 16;
      const maxX = (maxChunk + 1) * 16 - 1;
      const minZ = minChunk * 16;
      const maxZ = (maxChunk + 1) * 16 - 1;
      const seaLevel = 62;
      const bottomY = 40;
      const spawnX = 8;
      const spawnZ = 8;

      const profile = profileSnapshot();
      let seed = Number(state.worldSeedOverride);

      if (!Number.isFinite(seed)) {
        seed = 0x4d464c47;
        const seedText = String(state.worldName || profile.name || 'MiniFeather World');

        for (let i = 0; i < seedText.length; i++) {
          seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
        }
      }

      state.worldSeed = seed | 0;
      state.worldBounds = {
        minX,
        maxX,
        minZ,
        maxZ,
        minY: bottomY,
        maxY: 112
      };

      const chunks = new Map();

      for (let cx = minChunk; cx <= maxChunk; cx++) {
        for (let cz = minChunk; cz <= maxChunk; cz++) {
          const chunk = insertLocalChunk(cx, cz);
          if (!chunk) {
            setStatus(
              `Could not construct native Miniblox Chunk ${cx},${cz}.`,
              'LOCAL_CHUNK_CONSTRUCTOR_FAILED'
            );
            return false;
          }
          chunks.set(`${cx},${cz}`, chunk);
        }
      }

      const setLocal = (x, y, z, blockState) => {
        const cx = Math.floor(x) >> 4;
        const cz = Math.floor(z) >> 4;
        const chunk = chunks.get(`${cx},${cz}`);
        if (!chunk || !blockState) return false;

        try {
          return !!chunk.setBlockState(
            blockPos(x, y, z),
            Number(blockState.id),
            false
          );
        } catch (_) {
          return false;
        }
      };

      const heights = new Map();

      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          const height =
            terrainHeight(x, z, state.worldSeed);

          heights.set(`${x},${z}`, height);
          state.terrainSurface.set(
            `${x},${z}`,
            height
          );

          setLocal(x, bottomY, z, bedrock || stone);

          const stoneTop = Math.max(
            bottomY + 1,
            height - 4
          );

          for (let y = bottomY + 1; y < stoneTop; y++) {
            setLocal(x, y, z, stone);
          }

          const shore =
            height <= seaLevel + 1;

          const subsurface =
            shore ? sand : dirt;

          for (
            let y = stoneTop;
            y < height;
            y++
          ) {
            setLocal(x, y, z, subsurface);
          }

          setLocal(
            x,
            height,
            z,
            shore ? sand : grass
          );

          if (water && height < seaLevel) {
            for (
              let y = height + 1;
              y <= seaLevel;
              y++
            ) {
              setLocal(x, y, z, water);
            }
          }

          if (
            gravel &&
            height <= seaLevel - 1 &&
            hash2D(
              x,
              z,
              state.worldSeed + 83
            ) > 0.82
          ) {
            setLocal(x, height, z, gravel);
          }
        }
      }

      for (let x = minX + 4; x <= maxX - 4; x++) {
        for (let z = minZ + 4; z <= maxZ - 4; z++) {
          const height =
            heights.get(`${x},${z}`);

          if (!Number.isFinite(height)) continue;
          if (height <= seaLevel + 1) continue;

          const distance =
            Math.hypot(
              x - spawnX,
              z - spawnZ
            );

          if (distance < 11) continue;

          const treeRoll =
            hash2D(
              x,
              z,
              state.worldSeed + 101
            );

          if (
            oakLog &&
            leaves &&
            treeRoll > 0.986
          ) {
            let clear = true;

            for (let dx = -2; dx <= 2 && clear; dx++) {
              for (let dz = -2; dz <= 2; dz++) {
                const neighbor =
                  heights.get(`${x + dx},${z + dz}`);

                if (
                  !Number.isFinite(neighbor) ||
                  Math.abs(neighbor - height) > 2
                ) {
                  clear = false;
                  break;
                }
              }
            }

            if (!clear) continue;

            const trunkHeight =
              4 +
              Math.floor(
                hash2D(
                  x,
                  z,
                  state.worldSeed + 131
                ) * 3
              );

            for (
              let y = 1;
              y <= trunkHeight;
              y++
            ) {
              setLocal(
                x,
                height + y,
                z,
                oakLog
              );
            }

            const crownY =
              height + trunkHeight;

            for (let dy = -2; dy <= 2; dy++) {
              const layerRadius =
                Math.abs(dy) >= 2 ? 1 : 2;

              for (
                let dx = -layerRadius;
                dx <= layerRadius;
                dx++
              ) {
                for (
                  let dz = -layerRadius;
                  dz <= layerRadius;
                  dz++
                ) {
                  if (
                    Math.abs(dx) === layerRadius &&
                    Math.abs(dz) === layerRadius &&
                    hash2D(
                      x + dx,
                      z + dz,
                      state.worldSeed + dy + 151
                    ) < 0.35
                  ) {
                    continue;
                  }

                  if (
                    dx === 0 &&
                    dz === 0 &&
                    dy <= 0
                  ) {
                    continue;
                  }

                  setLocal(
                    x + dx,
                    crownY + dy,
                    z + dz,
                    leaves
                  );
                }
              }
            }

            continue;
          }

          const flowerRoll =
            hash2D(
              x,
              z,
              state.worldSeed + 181
            );

          if (
            flowerRoll > 0.972 &&
            (flowerA || flowerB)
          ) {
            setLocal(
              x,
              height + 1,
              z,
              flowerRoll > 0.988
                ? flowerB || flowerA
                : flowerA || flowerB
            );
          }
        }
      }

      const spawnHeight =
        heights.get(`${spawnX},${spawnZ}`) || 67;

      for (let x = spawnX - 5; x <= spawnX + 5; x++) {
        for (let z = spawnZ - 5; z <= spawnZ + 5; z++) {
          const distance =
            Math.hypot(x - spawnX, z - spawnZ);

          if (distance > 5.5) continue;

          const previous =
            heights.get(`${x},${z}`) || spawnHeight;

          for (
            let y = Math.min(previous, 67);
            y <= Math.max(previous, 67);
            y++
          ) {
            setLocal(
              x,
              y,
              z,
              y <= 66 ? dirt : grass
            );
          }

          if (previous > 67) {
            for (let y = 68; y <= previous + 7; y++) {
              setLocal(x, y, z, air);
            }
          }

          heights.set(`${x},${z}`, 67);
          state.terrainSurface.set(
            `${x},${z}`,
            67
          );
        }
      }

      state.arena = {
        cx: spawnX,
        cz: spawnZ,
        floorY: 67,
        radius: 7,
        height: 20,
        chunkX: 0,
        chunkZ: 0
      };

      state.origin = {
        x: spawnX,
        y: 68,
        z: spawnZ
      };
    }

    const installed = await installGeneratedChunksThroughNativePipeline();

    if (!installed) return false;

    captureCurrentBlockState();
    return true;
  }

  async function requestLocalChunkRendering(forceReplay = false) {
    const game = state.game;
    const world = state.world;
    const provider = world?.chunkProvider;
    const manager = game?.chunkRenderManager;
    const chunkManager = game?.chunkManager;

    if (!manager || !provider || !chunkManager) {
      return false;
    }

    installProviderGuard();

    try {
      manager.world = world;
    } catch (_) {}

    repairGameSceneTick(game);
    ensureNativeSceneRoots(game);
    synchronizeLocalCamera(game);

    const workerReady =
      await ensureChunkRenderWorkerReady(manager, 12000);

    state.chunkLoadDiagnostics.workerReady = workerReady;

    const replayAllThroughNativePipeline = async () => {
      try {
        manager.clear?.();
        manager.world = world;
      } catch (_) {
        try { manager.world = world; } catch (_) {}
      }

      await ensureChunkRenderWorkerReady(manager, 8000);

      try {
        await Promise.resolve(manager.updateTexture?.());
      } catch (_) {}

      let replayed = 0;

      for (let index = 0; index < (state.generatedChunkPackets || []).length; index++) {
        const packet = state.generatedChunkPackets[index];

        if (await dispatchChunkPacketNative(packet)) {
          replayed++;
        }

        if ((index & 3) === 3) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      state.chunkLoadDiagnostics.nativeReplay = replayed;
      return replayed;
    };

    // forceReplay means a previous stage explicitly detected that the renderer
    // lost state. Re-run the whole native packet path instead of enqueueing
    // coordinates into a worker that may not know those chunks.
    if (forceReplay) {
      await replayAllThroughNativePipeline();
    }

    const started = performance.now();
    let recoveryDone = forceReplay;
    let directSeedDone = false;
    let lightingRecoveryDone = false;

    while (
      state.active &&
      state.directLocal &&
      performance.now() - started < 18000 &&
      renderChunkCount(game) < 8
    ) {
      repairGameSceneTick(game);
      ensureNativeSceneRoots(game);

      // Offscreen uploads normally drain from the game loop. During a broken
      // local transition that loop may have died before the watchdog starts,
      // so drain pending native uploads right here as well.
      try {
        if (manager?.pendingUploadOrder?.length > 0) {
          manager.scheduleUploadDrain?.();
        }
      } catch (_) {}

      // If chunks are loaded but the native renderer still has zero output,
      // seed NEW_CHUNK data directly into the existing Miniblox worker. This
      // helper already existed in LocalGames but was never used.
      if (
        !directSeedDone &&
        performance.now() - started > 1800 &&
        loadedChunkCount(game) >= 9 &&
        renderChunkCount(game) === 0
      ) {
        directSeedDone = true;
        const seeded = seedLocalPacketsIntoRenderWorker(
          manager,
          state.generatedChunkPackets || []
        );
        state.chunkLoadDiagnostics.rendererSeeded = seeded.seeded;
        state.chunkLoadDiagnostics.rendererQueued = seeded.queued;
        state.chunkLoadDiagnostics.rendererSeedFailed = seeded.failed;
        if (seeded.lastError) {
          state.chunkLoadDiagnostics.lastError = seeded.lastError;
        }
        log(
          `render recovery: worker seed=${seeded.seeded}, queue=${seeded.queued}, failed=${seeded.failed}`
        );
        try { manager.scheduleUploadDrain?.(); } catch (_) {}
      }

      // Second recovery: initialize the local light engine and replay the full
      // native path. This only runs when the first worker seed produced no
      // visible chunks, so normal online-like rendering remains untouched.
      if (
        !lightingRecoveryDone &&
        performance.now() - started > 4200 &&
        loadedChunkCount(game) >= 9 &&
        renderChunkCount(game) === 0
      ) {
        lightingRecoveryDone = true;
        recoveryDone = true;

        const lighting = await initializeLocalChunkLighting();
        state.chunkLoadDiagnostics.lightAttempted = lighting.attempted;
        state.chunkLoadDiagnostics.lightInitialized = lighting.initialized;
        state.chunkLoadDiagnostics.lightFailed = lighting.failed;
        if (lighting.lastError) {
          state.chunkLoadDiagnostics.lastError = lighting.lastError;
        }
        log(
          `render recovery: lighting ${lighting.initialized}/${lighting.attempted}, failed=${lighting.failed}`
        );

        await replayAllThroughNativePipeline();
      }

      repairLocalRender();

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    repairLocalRender(true);

    state.chunkLoadDiagnostics.loaded =
      loadedChunkCount(game);

    return (
      loadedChunkCount(game) >= 9 &&
      renderChunkCount(game) >= 8
    );
  }

  async function waitForNativeWorldEntry(game, timeout = 22000) {
    const started = performance.now();
    let gateReadyAt = 0;

    state.nativeEntryDiagnostics = {
      canEnter: false,
      warmStarted: false,
      warmDone: false,
      forcedAfterWarm: false,
      state: Number(game?.state) || 0
    };

    while (
      state.active &&
      state.directLocal &&
      performance.now() - started < timeout
    ) {
      let canEnter = false;

      try {
        canEnter = game.canEnterWorld?.() === true;
      } catch (_) {
        canEnter =
          loadedChunkCount(game) >= 9 &&
          renderChunkCount(game) >= 8;
      }

      let warmDone =
        game.preEntryWarmDone === true;

      if (
        canEnter &&
        !warmDone &&
        typeof game.sceneWarmedForEntry === 'function'
      ) {
        try {
          warmDone =
            game.sceneWarmedForEntry() === true ||
            game.preEntryWarmDone === true;
        } catch (_) {}
      } else if (
        canEnter &&
        typeof game.sceneWarmedForEntry !== 'function'
      ) {
        warmDone = true;
      }

      const currentState = Number(game.state);

      state.nativeEntryDiagnostics = {
        canEnter,
        warmStarted:
          game.preEntryWarmStarted === true,
        warmDone:
          warmDone ||
          game.preEntryWarmDone === true,
        forcedAfterWarm:
          state.nativeEntryDiagnostics
            ?.forcedAfterWarm === true,
        state: currentState
      };

      if (currentState === 6) {
        return true;
      }

      if (
        canEnter &&
        (
          warmDone ||
          game.preEntryWarmDone === true
        )
      ) {
        if (!gateReadyAt) {
          gateReadyAt = performance.now();
        }

        // Native Game.update() normally performs this transition. The
        // fallback is allowed only AFTER the same native entry gates pass.
        if (performance.now() - gateReadyAt > 1200) {
          try {
            game.state = 6;
          } catch (_) {
            try {
              game._state = 6;
            } catch (_) {}
          }

          state.nativeEntryDiagnostics.forcedAfterWarm = true;

          if (Number(game.state) === 6) {
            return true;
          }
        }
      } else {
        gateReadyAt = 0;
      }

      await new Promise(resolve => setTimeout(resolve, 80));
    }

    state.nativeEntryDiagnostics.state =
      Number(game?.state) || 0;

    return Number(game?.state) === 6;
  }

  async function initializeDirectLocalGame(game, map) {
    log(`initializeDirectLocalGame: begin (map=${map}, gameState=${Number(game.state)})`);
    setStatus('Starting the local Miniblox engine...', '');

    try {
      logTrace('initializeDirectLocalGame: prepareEngine + waitForAccount...');
      // Follow the same engine preparation path Miniblox uses on the title
      // screen. prepareEngine() waits for menu textures before booting WebGL
      // and also prewarms the native chunk worker/shaders.
      await Promise.all([
        (async () => {
          if (typeof game.prepareEngine === 'function') {
            await game.prepareEngine();
          }

          await game.boot?.();
        })(),
        waitForAccount(game, 5000)
      ]);

      try {
        game.chunkRenderManager?.chunkRenderWorkerManager?.prewarm?.();
      } catch (_) {}

      const texturesReady =
        await ensureLocalWorldAssets(game);

      log(`initializeDirectLocalGame: assets texturesReady=${texturesReady} diag=${JSON.stringify(state.textureDiagnostics || {})}`);

      if (!texturesReady) {
        const diag = state.textureDiagnostics || {};
        const assets = resolveWorldAssetManager();
        const atlasUrl = String(assets?.atlasUrl || 'unknown');

        setStatus(
          `Miniblox terrain material is still unavailable. worldMaterial: ${diag.materialReady ? 'ready' : 'missing'}, map: ${diag.mapReady ? 'ready' : 'missing'}, fluidMaterial: ${diag.fluidMaterialReady ? 'ready' : 'missing'}, atlasImage: ${diag.atlasReady ? 'ready' : 'missing'}, atlasUrl: ${atlasUrl}${diag.lastError ? `, error: ${diag.lastError}` : ''}.`,
          'LOCAL_TEXTURE_ASSETS_FAILED'
        );

        return false;
      }
    } catch (error) {
      logError('initializeDirectLocalGame: engine boot failed:', error);
      setStatus(
        'Miniblox engine boot failed.',
        String(
          error?.message ||
          error ||
          'ENGINE_BOOT_FAILED'
        )
      );
      return false;
    }

    const startedAt = performance.now();

    while (
      performance.now() - startedAt < 7000 &&
      (
        !game.world ||
        !game.gameScene ||
        !game.chunkRenderManager ||
        !game.chunkManager
      )
    ) {
      await new Promise(
        resolve => setTimeout(resolve, 50)
      );
    }

    if (
      !game.world ||
      !game.gameScene ||
      !game.chunkRenderManager ||
      !game.chunkManager
    ) {
      setStatus(
        'The local Miniblox engine is not ready.',
        'LOCAL_ENGINE_NOT_READY'
      );
      return false;
    }

    state.game = game;
    state.directLocal = true;
    state.localGameStateBefore =
      Number(game.state) || 0;
    state.freshWorldCreated = false;

    enterLocalVisualMode();

    setStatus(
      'Creating a fresh local Miniblox world...',
      ''
    );

    const textureAssets =
      resolveWorldAssetManager();

    if (
      !state.worldAssetsReady ||
      !worldTextureAssetsReady(textureAssets)
    ) {
      setStatus(
        'Block textures were lost before world creation.',
        'LOCAL_TEXTURE_MATERIAL_MISSING'
      );
      return false;
    }

    markTextureMaterialsDirty(textureAssets);

    if (!createFreshNativeLocalWorld(game, 0)) {
      logError('initializeDirectLocalGame: createFreshNativeLocalWorld failed');
      setStatus(
        'Could not create a fresh native Miniblox world.',
        'LOCAL_WORLD_CREATE_FAILED'
      );
      return false;
    }

    log('initializeDirectLocalGame: fresh world creado, configurando jugador...');

    const player = game.player;
    const profile = profileSnapshot();

    try {
      player.id = state.localPlayerId;
      player.game = game;

      if (typeof player.init === 'function') {
        player.init(
          'minifeather-local',
          {
            name: profile.name,
            gamemode: 'survival',
            cosmetics: profile.cosmetics,
            rank: profile.rank,
            dimension: 0
          }
        );
      } else {
        player.world = state.world;
      }

      if (player.profile) {
        player.profile.username =
          profile.name;

        if (profile.uuid) {
          player.profile.uuid =
            profile.uuid;
        }

        player.profile.rank =
          profile.rank;

        player.profile.level =
          profile.level;

        player.profile.verified =
          profile.verified;

        player.profile.discordBoosting =
          profile.discordBoosting;

        player.profile.persistData =
          profile.persistent;

        player.profile.cosmetics = {
          ...profile.cosmetics
        };
      }

      player.name = profile.name;
      player.world = state.world;
      player.dimension = 0;
    } catch (_) {
      try {
        player.world = state.world;
      } catch (_) {}
    }

    ensureLocalPlayerEntity(false);

    try {
      game.chunkManager.warmCache?.();
    } catch (_) {}

    // Never replace GameScene.tick with a number. It is a native Single.
    captureGameSceneTick(game);
    repairGameSceneTick(game);
    ensureNativeSceneRoots(game);

    try {
      state.world.dimensionId = 0;
      state.world.totalTime = 6000;
      state.world.worldTime = 6000;
    } catch (_) {}

    setLocalGamemode('survival');

    try {
      game.info.health = 20;
      game.info.food = 20;
      game.info.absorption = 0;
      game.info.oxygen = 100;
      game.info.showVitals = true;
      game.info.scoreboard = null;
      game.info.displayScoreboard = false;
      game.info.displayPlayerTab = false;
      game.info.awaitingRespawn = false;
      game.info.spectating = false;
    } catch (_) {}

    try {
      game.playerList?.clear?.();
    } catch (_) {}

    syncNativePlayerList();

    try {
      game.serverInfo.serverId =
        'minifeather-local';
      game.serverInfo.serverName =
        state.worldName || 'MiniFeather Local';
      game.serverInfo.permissionLevel =
        rolePermissionLevel(state.localRole);
      game.serverInfo.serverCategory =
        'creative';
      game.serverInfo.doDaylightCycle = false;
      game.serverInfo.fallDamage =
        map !== 'sandbox';
    } catch (_) {}

    try {
      game.preEntryWarmStarted = false;
      game.preEntryWarmDone = false;
    } catch (_) {}

    const expectedSpawn =
      map === 'spleef'
        ? { x: 8, y: 82.05, z: 8 }
        : { x: 8, y: 86.05, z: 8 };

    teleportPlayer(
      expectedSpawn.x,
      expectedSpawn.y,
      expectedSpawn.z
    );

    try {
      player.erJEsEpHxxSRfTwTM?.(true);
    } catch (_) {}

    await new Promise(
      resolve => requestAnimationFrame(
        () => requestAnimationFrame(resolve)
      )
    );

    try {
      game.gameScene.camera?.position?.set?.(
        expectedSpawn.x,
        expectedSpawn.y + 1.62,
        expectedSpawn.z
      );
    } catch (_) {}

    repairGameSceneTick(game);
    ensureNativeSceneRoots(game);
    synchronizeLocalCamera(game);

    installProviderGuard();

    log(`initializeDirectLocalGame: player teleportado a spawn (${expectedSpawn.x}, ${expectedSpawn.y}, ${expectedSpawn.z}), guard instalado, gameState=5`);

    try {
      game.state = 5;
    } catch (_) {
      try {
        game._state = 5;
      } catch (_) {}
    }

    ensureLocalPlayerEntity(false);

    try {
      game.update?.();
    } catch (_) {}

    await new Promise(
      resolve => requestAnimationFrame(
        () => requestAnimationFrame(resolve)
      )
    );

    log('initializeDirectLocalGame: generando chunks...');
    const chunkGenStart = performance.now();

    if (!(await generateLocalChunks(map))) {
      logError(`initializeDirectLocalGame: generateLocalChunks falló (${Math.round(performance.now() - chunkGenStart)}ms)`);
      if (!state.error) {
        setStatus(
          'Could not create local Miniblox chunks.',
          'LOCAL_CHUNK_CREATE_FAILED'
        );
      }
      return false;
    }

    log(`initializeDirectLocalGame: generateLocalChunks OK en ${Math.round(performance.now() - chunkGenStart)}ms (packets=${state.generatedChunkPackets.length}, chunks=${state.localChunks.length})`);

    repairGameSceneTick(game);
    ensureNativeSceneRoots(game);
    synchronizeLocalCamera(game);

    const activeTextureAssets =
      resolveWorldAssetManager();

    if (
      !worldTextureAssetsReady(
        activeTextureAssets
      )
    ) {
      setStatus(
        'The block texture atlas disappeared before chunk rendering.',
        'LOCAL_TEXTURE_ATLAS_LOST'
      );
      return false;
    }

    markTextureMaterialsDirty(
      activeTextureAssets
    );

    try {
      const manager =
        game.chunkRenderManager;

      const ChunkPosCtor =
        getChunkPosConstructor();

      if (
        manager?.chunkRenderQueue &&
        ChunkPosCtor
      ) {
        for (const chunk of state.localChunks) {
          const x =
            Number(chunk?.xPosition);

          const z =
            Number(chunk?.zPosition);

          if (
            !Number.isFinite(x) ||
            !Number.isFinite(z)
          ) {
            continue;
          }

          try {
            manager.chunkRenderQueue
              .enqueueHighPriority(
                new ChunkPosCtor(x, z)
              );
          } catch (_) {}
        }
      }
    } catch (_) {}

    teleportPlayer(
      state.origin.x,
      state.origin.y + 0.05,
      state.origin.z
    );

    try {
      player.erJEsEpHxxSRfTwTM?.(true);
    } catch (_) {}

    try {
      state.world.spawnPoint =
        blockPos(
          Math.floor(state.origin.x),
          Math.floor(state.origin.y),
          Math.floor(state.origin.z)
        );
    } catch (_) {}

    const renderStarted =
      performance.now();

    const renderReady =
      await requestLocalChunkRendering(true);

    let entered = false;

    if (renderReady) {
      setStatus(
        'Chunks are rendered. Warming the native Miniblox scene...',
        ''
      );

      entered =
        await waitForNativeWorldEntry(game, 22000);
    }

    log(`initializeDirectLocalGame: renderReady=${renderReady} entered=${entered} (${Math.round(performance.now() - renderStarted)}ms, loaded=${loadedChunkCount(game)}, rendered=${renderChunkCount(game)})`);

    if (
      !entered &&
      loadedChunkCount(game) >= 9
    ) {
      log('initializeDirectLocalGame: reintento de renderizado (segunda pasada)...');

      setStatus(
        'Waiting for the native chunk renderer and shader warm-up...',
        ''
      );

      await requestLocalChunkRendering(false);

      entered =
        await waitForNativeWorldEntry(game, 12000);

      log(`initializeDirectLocalGame: reintento entered=${entered}`);
    }

    if (!entered) {
      logError(`initializeDirectLocalGame: LOCAL_RENDER_TIMEOUT tras ${Math.round(performance.now() - renderStarted)}ms`);
      const wasmReady =
        game.chunkRenderManager
          ?.chunkRenderWorkerManager
          ?.isWasmReady?.() === true;

      const currentChunkX =
        Math.floor(Number(player.pos?.x) || 0) >> 4;

      const currentChunkZ =
        Math.floor(Number(player.pos?.z) || 0) >> 4;

      let playerChunkLoaded = false;

      try {
        playerChunkLoaded =
          state.world.chunkProvider
            ?.isLoaded?.(
              currentChunkX,
              currentChunkZ
            ) === true;
      } catch (_) {}

      const diag =
        state.chunkLoadDiagnostics || {};

      const probe = localRenderProbe(true);
      logError(
        `LOCAL_RENDER_TIMEOUT probe: ${JSON.stringify(probe)}`
      );

      const worldMatches =
        game.world === state.world;

      let processed = 0;
      let renderQueueSize = -1;

      try {
        processed =
          Number(
            game.chunkRenderManager
              ?.getProcessedChunkCount?.()
          ) || 0;
      } catch (_) {}

      try {
        const queue =
          game.chunkRenderManager
            ?.chunkRenderQueue;

        renderQueueSize =
          Number(
            queue?.size ??
            queue?.length ??
            queue?.queue?.length ??
            queue?.highPriority?.length
          );

        if (!Number.isFinite(renderQueueSize)) {
          renderQueueSize = -1;
        }
      } catch (_) {}

      setStatus(
        `Local render failed after ${Math.round(performance.now() - renderStarted)}ms. loaded: ${loadedChunkCount(game)}, rendered: ${renderChunkCount(game)}, processed: ${processed}, renderQueue: ${renderQueueSize >= 0 ? renderQueueSize : 'unknown'}, playerChunk: ${playerChunkLoaded ? 'loaded' : 'missing'}, wasm: ${wasmReady ? 'ready' : 'not ready'}, freshWorld: ${state.freshWorldCreated ? 'yes' : 'no'}, worldAttached: ${worldMatches ? 'yes' : 'no'}, worldAssets: ${state.worldAssetsReady ? 'ready' : 'missing'}, atlas: ${state.textureDiagnostics?.atlasReady ? 'ready' : 'missing'}, materialMap: ${state.textureDiagnostics?.mapReady ? 'ready' : 'missing'}, localMeshes: ${Number(state.localRenderStats?.meshes) || 0}, localTextured: ${Number(state.localRenderStats?.textured) || 0}, lightAttrs: ${Number(state.localRenderStats?.lightAttributes) || 0}, blackLight: ${Number(state.localRenderStats?.blackLightAttributes) || 0}, repairedLight: ${Number(state.localRenderStats?.repairedLightAttributes) || 0}, litChunks: ${Number(diag.lightInitialized) || 0}/${Number(diag.lightAttempted) || 0}, lightFailed: ${Number(diag.lightFailed) || 0}, gameState: ${Number(game.state)}, warmStarted: ${game.preEntryWarmStarted === true ? 'yes' : 'no'}, warmDone: ${game.preEntryWarmDone === true ? 'yes' : 'no'}, loadAttempts: ${Number(diag.attempted) || 0}, nativeIngest: ${Number(diag.nativeIngest) || 0}, fallbackIngest: ${Number(diag.fallbackIngest) || 0}, workerSeed: ${Number(diag.rendererSeeded) || 0}, workerQueue: ${Number(diag.rendererQueued) || 0}, workerSeedFailed: ${Number(diag.rendererSeedFailed) || 0}, workerReseed: ${Number(diag.rendererReseeded) || 0}, confirmed: ${Number(diag.loaded) || 0}, failed: ${Number(diag.failed) || 0}${diag.lastError ? `, lastError: ${diag.lastError}` : ''}.`,
        'LOCAL_RENDER_TIMEOUT'
      );
      return false;
    }

    try {
      game.gameScene.camera?.position?.set?.(
        state.origin.x,
        state.origin.y + (
          Number(player.getEyeHeight?.()) || 1.62
        ),
        state.origin.z
      );
    } catch (_) {}

    repairGameSceneTick(game);
    ensureNativeSceneRoots(game);
    synchronizeLocalCamera(game);
    ensureLocalPlayerEntity(true);

    syncNativePlayerList();
    refreshLocalVisualMode();

    const finalTextureAssets =
      resolveWorldAssetManager();

    markTextureMaterialsDirty(
      finalTextureAssets
    );

    const renderStats =
      repairLocalRender(true) || {
        meshes: 0,
        fullBright: 0,
        colorFixed: 0,
        textured: 0,
        visible: 0
      };

    setStatus(
      `${state.worldName || 'MiniFeather Local'} is ready. meshes: ${renderStats.meshes}, textured: ${renderStats.textured}, visible: ${renderStats.visible}.`,
      ''
    );

    // Vigilancia de texturas: en un mundo local arrancado desde el menú, el
    // atlas puede terminar de cargar DESPUÉS de que los meshes existan. El
    // material singleton (N.materialWorld) queda sin map → color plano.
    // Reintentar updateTexture() hasta 15s mientras queden meshes sin textura.
    watchTextureResync();

    return true;
  }

  function watchTextureResync() {
    if (state.textureWatchTimer) {
      clearInterval(state.textureWatchTimer);
    }

    const startedAt = performance.now();

    state.textureWatchTimer = setInterval(() => {
      if (
        !state.active ||
        !state.directLocal ||
        performance.now() - startedAt > 15000
      ) {
        clearInterval(state.textureWatchTimer);
        state.textureWatchTimer = null;
        return;
      }

      try {
        const stats = repairLocalRender(true);

        if (
          !stats ||
          stats.nativeMaterials === 0 ||
          stats.textured >= stats.nativeMaterials
        ) {
          log(`watchTextureResync: texturas OK (${stats ? stats.textured + '/' + stats.nativeMaterials : 'n/a'}) — vigilancia terminada`);
          clearInterval(state.textureWatchTimer);
          state.textureWatchTimer = null;
          emitState();
        } else {
          logTrace(`watchTextureResync: texturizados ${stats.textured}/${stats.nativeMaterials}, reintentando...`);
        }
      } catch (err) {
        logWarn('watchTextureResync: error en tick:', err);
      }
    }, 1000);
  }

  function chunkFromProvider(chunkX, chunkZ) {
    const world = state.world;
    if (!world?.chunkProvider) return null;

    try {
      const chunk = world.chunkProvider.provideChunk?.(chunkX, chunkZ);
      if (chunk && !chunk.isDummyChunk) return chunk;
    } catch (_) {}

    try {
      const chunk = world.getChunkByID?.(chunkX, chunkZ);
      if (chunk && !chunk.isDummyChunk) return chunk;
    } catch (_) {}

    return null;
  }

  function isChunkLoaded(chunkX, chunkZ) {
    const world = state.world;
    if (!world) return false;

    if (chunkFromProvider(chunkX, chunkZ)) return true;

    try {
      if (typeof world.chunkProvider?.isLoaded === 'function') {
        if (world.chunkProvider.isLoaded(chunkX, chunkZ)) return true;
      }
    } catch (_) {}

    try {
      if (typeof world.isChunkLoaded === 'function') {
        if (world.isChunkLoaded(chunkX, chunkZ, false)) return true;
      }
    } catch (_) {}

    return false;
  }

  function collectLoadedChunks() {
    const world = state.world;
    const provider = world?.chunkProvider;
    const chunks = [];
    const seen = new Set();

    const add = chunk => {
      if (!chunk || chunk.isDummyChunk) return;

      const x = Number(chunk.xPosition);
      const z = Number(chunk.zPosition);

      if (!Number.isFinite(x) || !Number.isFinite(z)) return;

      const id = `${x},${z}`;
      if (seen.has(id)) return;

      seen.add(id);
      chunks.push({ chunk, chunkX: x, chunkZ: z });
    };

    if (!provider) return chunks;

    try {
      for (const chunk of provider.posToChunk?.values?.() || []) {
        add(chunk);
      }
    } catch (_) {}

    try {
      for (const key of Reflect.ownKeys(provider)) {
        let value;
        try {
          value = provider[key];
        } catch (_) {
          continue;
        }

        if (!value || typeof value.values !== 'function') continue;

        try {
          for (const chunk of value.values()) {
            add(chunk);
          }
        } catch (_) {}
      }
    } catch (_) {}

    try {
      add(world.cachedChunk);
    } catch (_) {}

    return chunks;
  }

  function findArenaPlacement(playerX, playerZ) {
    const playerChunkX = Math.floor(playerX) >> 4;
    const playerChunkZ = Math.floor(playerZ) >> 4;

    const direct = chunkFromProvider(playerChunkX, playerChunkZ);

    if (direct) {
      return {
        chunkX: playerChunkX,
        chunkZ: playerChunkZ,
        x: playerChunkX * 16 + 8,
        z: playerChunkZ * 16 + 8,
        radius: 7
      };
    }

    const loaded = collectLoadedChunks();

    if (!loaded.length) return null;

    loaded.sort((a, b) => {
      const adx = a.chunkX - playerChunkX;
      const adz = a.chunkZ - playerChunkZ;
      const bdx = b.chunkX - playerChunkX;
      const bdz = b.chunkZ - playerChunkZ;
      return adx * adx + adz * adz - (bdx * bdx + bdz * bdz);
    });

    const selected = loaded[0];

    return {
      chunkX: selected.chunkX,
      chunkZ: selected.chunkZ,
      x: selected.chunkX * 16 + 8,
      z: selected.chunkZ * 16 + 8,
      radius: 7
    };
  }

  function snapshotArena(arena) {
    state.snapshot.clear();

    for (let y = arena.floorY; y <= arena.floorY + arena.height; y++) {
      for (let x = arena.cx - arena.radius; x <= arena.cx + arena.radius; x++) {
        for (let z = arena.cz - arena.radius; z <= arena.cz + arena.radius; z++) {
          const id = getStateIdAt(x, y, z);
          if (Number.isFinite(id)) state.snapshot.set(key(x, y, z), id);
        }
      }
    }
  }

  function buildArena(map, placement = null) {
    const player = state.game?.player;
    if (!player?.pos) return false;

    const playerX = Number(player.pos.x);
    const playerY = Number(player.pos.y);
    const playerZ = Number(player.pos.z);

    if (![playerX, playerY, playerZ].every(Number.isFinite)) {
      setStatus('Player position is not ready yet.', 'PLAYER_POSITION_NOT_READY');
      return false;
    }

    placement ||= findArenaPlacement(playerX, playerZ);

    if (!placement) {
      const providerCount = loadedChunkCount(state.game);
      const renderedCount = renderChunkCount(state.game);
      const gameState = Number(state.game?.state);

      setStatus(
        `No live chunk found. Game state: ${Number.isFinite(gameState) ? gameState : '?'}, loaded: ${providerCount}, rendered: ${renderedCount}.`,
        'LIVE_CHUNK_NOT_FOUND'
      );
      return false;
    }

    const cx = placement.x;
    const cz = placement.z;
    const radius = placement.radius;
    const floorY = Math.max(4, Math.min(246, Math.floor(playerY) - 1));
    const height = 7;

    const arena = {
      cx,
      cz,
      floorY,
      radius,
      height,
      chunkX: placement.chunkX,
      chunkZ: placement.chunkZ
    };
    state.arena = arena;
    state.origin = { x: cx, y: floorY + 1, z: cz };

    snapshotArena(arena);

    const air = stateFor('air');
    const stone = stateFor('stone');
    const light = stateFor('light_gray_wool', 'stone');
    const dark = stateFor('gray_wool', 'cobblestone');
    const border = stateFor('blue_wool', 'stone');
    const center = stateFor('lime_wool', 'stone');
    const spleef = stateFor('snow_block', 'white_wool') || stateFor('white_wool', 'stone');

    if (!air || !stone) {
      setStatus('Block registry is not ready.', 'BLOCKS_NOT_READY');
      return false;
    }

    for (let y = floorY + 1; y <= floorY + height; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        for (let z = cz - radius; z <= cz + radius; z++) {
          setStateAt(x, y, z, air, true);
        }
      }
    }

    for (let x = cx - radius; x <= cx + radius; x++) {
      for (let z = cz - radius; z <= cz + radius; z++) {
        const edge =
          x === cx - radius ||
          x === cx + radius ||
          z === cz - radius ||
          z === cz + radius;

        let block = stone;

        if (map === 'spleef') {
          block = edge ? border : spleef;
        } else if (edge) {
          block = border;
        } else if (Math.abs(x - cx) <= 1 && Math.abs(z - cz) <= 1) {
          block = center;
        } else {
          block = ((x + z) & 1) === 0 ? light : dark;
        }

        setStateAt(x, floorY, z, block, true);
      }
    }

    if (map === 'sandbox') {
      const corners = [
        [cx - radius + 2, cz - radius + 2],
        [cx + radius - 2, cz - radius + 2],
        [cx - radius + 2, cz + radius - 2],
        [cx + radius - 2, cz + radius - 2]
      ];

      for (const [x, z] of corners) {
        for (let y = floorY + 1; y <= floorY + 3; y++) {
          setStateAt(x, y, z, border, true);
        }
      }
    }


    captureCurrentBlockState();
    return true;
  }

  function captureCurrentBlockState() {
    state.blockState.clear();
    const arena = state.arena;
    if (!arena) return;

    for (let y = arena.floorY; y <= arena.floorY + arena.height; y++) {
      for (let x = arena.cx - arena.radius; x <= arena.cx + arena.radius; x++) {
        for (let z = arena.cz - arena.radius; z <= arena.cz + arena.radius; z++) {
          const id = getStateIdAt(x, y, z);
          if (Number.isFinite(id)) state.blockState.set(key(x, y, z), id);
        }
      }
    }
  }

  function teleportPlayer(x, y, z) {
    const player = state.game?.player;
    if (!player) return;

    const yaw = Number(player.yaw) || 0;
    const pitch = Number(player.pitch) || 0;

    try {
      if (typeof player.setPositionAndRotation === 'function') {
        player.setPositionAndRotation(x, y, z, yaw, pitch);
      } else if (typeof player.pos?.set === 'function') {
        player.pos.set(x, y, z);
      } else if (player.pos) {
        player.pos.x = x;
        player.pos.y = y;
        player.pos.z = z;
      }
    } catch (_) {}

    try {
      player.motion?.set?.(0, 0, 0);
    } catch (_) {
      if (player.motion) {
        player.motion.x = 0;
        player.motion.y = 0;
        player.motion.z = 0;
      }
    }

    try {
      player.serverPos?.set?.(x * 32, y * 32, z * 32);
    } catch (_) {}

    for (const name of ['prevPos', 'lastTickPos']) {
      try {
        player[name]?.set?.(x, y, z);
      } catch (_) {}
    }
  }

  function localName() {
    const player = state.game?.player;
    return String(
      player?.profile?.username ||
      player?.username ||
      player?.name ||
      'Player'
    ).slice(0, 24);
  }

  async function startWorld(map = 'sandbox', mode = 'single', spawnOffset = 0, options = {}) {
    log(`startWorld map=${map} mode=${mode} forceDirect=${options?.forceDirect === true}`);

    if (state.active) {
      setStatus('A local game is already running.', 'ALREADY_ACTIVE');
      return false;
    }

    const game = await resolveGameSingleton();

    if (!game) {
      logError('startWorld: no game engine found');
      setStatus('Could not find the Miniblox game engine.', 'NO_GAME_ENGINE');
      return false;
    }

    state.game = game;
    state.map = map === 'spleef' ? 'spleef' : 'sandbox';
    state.mode = mode;
    state.directLocal = false;

    log(`startWorld: gameState=${Number(game.state)} hasLiveWorld=${game.state === 6 && loadedChunkCount(game) > 0}`);

    if (options && typeof options === 'object') {
      const worldName = cleanText(options.worldName, 30);
      if (worldName) state.worldName = worldName;

      const seed = Number(options.seed);
      if (Number.isFinite(seed)) state.worldSeedOverride = seed;

      const role = String(options.role || '').toLowerCase();
      if (['owner', 'coowner', 'player'].includes(role)) {
        state.localRole = role;
      }
    }

    const forceDirect = options?.forceDirect === true;
    const gameState = Number(game.state);
    const hasLiveWorld =
      gameState === 6 &&
      game?.player?.pos &&
      game?.world?.chunkProvider &&
      loadedChunkCount(game) > 0;

    if (forceDirect || !hasLiveWorld) {
      state.active = true;
      state.start = null;

      const ok = await initializeDirectLocalGame(game, state.map);

      if (!ok) {
        logError('startWorld: initializeDirectLocalGame failed');
        exitLocalVisualMode();
        state.active = false;
        state.mode = 'idle';
        state.directLocal = false;
        state.world = null;
        state.localChunks.length = 0;
        return false;
      }

      patchNetwork();

      // Local Sandbox used to skip this hook because Create World installed it
      // later in createWorldServer(). That made single-player Sandbox miss the
      // same block/drop handling that hosted local worlds received. Install it
      // here for ALL direct local worlds; the function is idempotent.
      patchWorldBlockBroadcast();

      startLoops();
      ensurePeerLayer();
      installPendingUploadDrain();
      installRenderLoopWatchdog();

      log(`startWorld: mundo local directo activo (map=${state.map})`);

      setStatus(
        state.map === 'spleef'
          ? 'Local Spleef running without a Miniblox game server.'
          : 'Local Sandbox running without a Miniblox game server.'
      );

      return true;
    }

    state.world = game.world;
    state.start = {
      x: Number(game.player.pos.x),
      y: Number(game.player.pos.y),
      z: Number(game.player.pos.z),
      yaw: Number(game.player.yaw) || 0,
      pitch: Number(game.player.pitch) || 0
    };

    const placement = findArenaPlacement(
      Number(game.player.pos.x),
      Number(game.player.pos.z)
    );

    if (!placement) {
      state.active = false;
      state.mode = 'idle';
      state.world = null;
      const providerCount = loadedChunkCount(game);
      const renderedCount = renderChunkCount(game);
      setStatus(
        `No live chunk found. Game state: ${Number.isFinite(gameState) ? gameState : '?'}, loaded: ${providerCount}, rendered: ${renderedCount}.`,
        'LIVE_CHUNK_NOT_FOUND'
      );
      return false;
    }

    state.active = true;

    if (!patchNetwork()) {
      state.active = false;
      state.mode = 'idle';
      setStatus('Could not isolate the Miniblox game connection safely.', 'NETWORK_NOT_FOUND');
      return false;
    }

    if (!buildArena(state.map, placement)) {
      state.active = false;
      state.mode = 'idle';
      restoreNetwork();
      return false;
    }

    const spawn = state.origin;
    const safeOffset = Math.max(-4, Math.min(4, Number(spawnOffset) || 0));
    teleportPlayer(spawn.x + safeOffset, spawn.y + 0.05, spawn.z);

    startLoops();
    ensurePeerLayer();
    setStatus(
      state.map === 'spleef'
        ? 'Local Spleef arena running.'
        : 'Local Sandbox running.'
    );

    return true;
  }

  function restoreArena() {
    if (!state.arena || !state.snapshot.size) return;

    for (const [positionKey, id] of state.snapshot) {
      const [x, y, z] = positionKey.split(',').map(Number);
      setStateIdAt(x, y, z, id, true);
    }

  }

  function stopLoops() {
    if (state.interval) clearInterval(state.interval);
    if (state.diffInterval) clearInterval(state.diffInterval);
    if (state.peerFrame) cancelAnimationFrame(state.peerFrame);
    state.interval = 0;
    state.diffInterval = 0;
    state.peerFrame = 0;
  }

  function profileNetworkSnapshot() {
    const profile = profileSnapshot();

    return {
      uuid: profile.uuid,
      name: profile.name,
      skin: profile.skin,
      color: profile.color,
      rank: profile.rank,
      level: profile.level,
      verified: profile.verified,
      discordBoosting: profile.discordBoosting,
      persistent: profile.persistent,
      mode: currentGamemodeId()
    };
  }

  function cleanText(value, max = 256) {
    return String(value || '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\\/g, '')
      .trim()
      .slice(0, max);
  }

  function addGameChat(text, color = '') {
    const message = cleanText(text, 500);
    if (!message) return;

    try {
      state.game?.chat?.addChat?.({
        text: `${color}${message}`
      });
    } catch (_) {}
  }

  function addSystemChat(text) {
    addGameChat(text, '\\gray\\');
  }

  function addPlayerChat(profile, text) {
    const name = cleanText(profile?.name || 'Player', 24);
    const message = cleanText(text, 256);
    if (!message) return;
    addGameChat(`\\white\\${name}\\reset\\: ${message}`);
  }

  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  function randomHex(length = 12) {
    return Array.from(randomBytes(length))
      .map(value => value.toString(16).padStart(2, '0'))
      .join('');
  }

  function base32(bytes) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of bytes) {
      value = (value << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }

    return output;
  }

  function makeServerAddress() {
    const token = base32(randomBytes(16)).slice(0, 26);
    return `MF-${token.match(/.{1,5}/g).join('-')}`;
  }

  function normalizeServerAddress(value) {
    const raw = String(value || '')
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, '');

    if (!raw.startsWith('MF')) return null;

    const token = raw.slice(2);
    if (token.length < 20 || token.length > 30) return null;

    return `MF-${token.match(/.{1,5}/g).join('-')}`;
  }

  function topicFromAddress(address) {
    const normalized = normalizeServerAddress(address);
    if (!normalized) return '';
    return `mf-local-${normalized.replace(/[^A-Z2-9]/g, '').toLowerCase()}`;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;

    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }

    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  async function packSignal(payload) {
    const text = JSON.stringify(payload);
    const input = new TextEncoder().encode(text);

    if (typeof CompressionStream === 'function') {
      try {
        const stream = new Blob([input])
          .stream()
          .pipeThrough(new CompressionStream('deflate-raw'));
        const compressed = new Uint8Array(
          await new Response(stream).arrayBuffer()
        );
        return `z:${bytesToBase64(compressed)}`;
      } catch (_) {}
    }

    return `b:${bytesToBase64(input)}`;
  }

  async function unpackSignal(value) {
    const raw = String(value || '');
    const prefix = raw.slice(0, 2);
    const bytes = base64ToBytes(raw.slice(2));

    if (prefix === 'z:' && typeof DecompressionStream === 'function') {
      const stream = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'));
      const output = await new Response(stream).arrayBuffer();
      return JSON.parse(new TextDecoder().decode(output));
    }

    if (prefix === 'b:') {
      return JSON.parse(new TextDecoder().decode(bytes));
    }

    throw new Error('INVALID_SIGNAL');
  }

  function signalRequest(action, payload = {}) {
    const requestId = `lg_sig_${Date.now()}_${++state.signalRequestCounter}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.signalRequests.delete(requestId);
        reject(new Error('SIGNAL_TIMEOUT'));
      }, 15000);

      state.signalRequests.set(requestId, {
        resolve,
        reject,
        timer
      });

      document.dispatchEvent(
        new CustomEvent(SIGNAL_REQUEST_EVENT, {
          detail: JSON.stringify({
            requestId,
            action,
            ...payload
          })
        })
      );
    });
  }

  function onSignalResponse(event) {
    let detail = event.detail;

    if (typeof detail === 'string') {
      try {
        detail = JSON.parse(detail);
      } catch (_) {
        return;
      }
    }

    const pending = state.signalRequests.get(detail?.requestId);
    if (!pending) return;

    clearTimeout(pending.timer);
    state.signalRequests.delete(detail.requestId);

    if (detail.ok) {
      pending.resolve(detail);
    } else {
      pending.reject(new Error(detail.error || 'SIGNAL_FAILED'));
    }
  }

  document.addEventListener(SIGNAL_RESPONSE_EVENT, onSignalResponse);

  // ── Broker de señales local (ntfy.sh) ──────────────────────────────
  // Implementa publish/poll de mensajes por topic usando la API pública
  // de ntfy.sh vía fetch directo (CORS abierto). Los mensajes usan el
  // formato z:/b: base64(+deflate) de packSignal/unpackSignal.
  const NTFY_BASE = 'https://ntfy.sh';
  // Prefijo NSFW-safe para topics: ntfy es global y público; usar un
  // prefijo largo evita colisiones con topics de otros usuarios.
  const NTFY_PREFIX = 'mflg';

  function ntfyTopicUrl(topic) {
    return `${NTFY_BASE}/${NTFY_PREFIX}${String(topic).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  }

  function resolveSignalRequest(requestId, ok, payload) {
    document.dispatchEvent(new CustomEvent(SIGNAL_RESPONSE_EVENT, {
      detail: JSON.stringify({ requestId, ok, ...payload })
    }));
  }

  async function handleSignalRequest(request) {
    logTrace(`signal(${request.action}): topic=${request.topic}`);
    try {
      if (request.action === 'publish') {
        const res = await fetch(ntfyTopicUrl(request.topic), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: String(request.message || '')
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        resolveSignalRequest(request.requestId, true, {});
        return;
      }

      if (request.action === 'poll') {
        // poll=1 es CRÍTICO: sin él, /json es un stream infinito y el fetch
        // nunca termina (agotaría el timeout de 15s del signalRequest)
        const params = new URLSearchParams({
          since: String(request.since || '15m'),
          poll: '1'
        });
        const res = await fetch(`${ntfyTopicUrl(request.topic)}/json?${params}`, {
          headers: { Accept: 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const text = await res.text();
        const messages = [];
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            // Solo mensajes reales (no keepalives/eventos de suscripción)
            if (evt.event === 'open') continue;
            if (evt.event) continue;
            if (!evt.message) continue;
            messages.push({ id: String(evt.id || ''), message: String(evt.message) });
          } catch (_) {}
        }
        logTrace(`signal(poll): ${messages.length} mensaje(s) de ${request.topic}`);
        resolveSignalRequest(request.requestId, true, { messages });
        return;
      }

      logWarn(`signal: acción desconocida "${request.action}"`);
      resolveSignalRequest(request.requestId, false, { error: 'UNKNOWN_ACTION' });
    } catch (error) {
      logError(`signal(${request.action}) topic=${request.topic} falló:`, error?.message || error);
      resolveSignalRequest(request.requestId, false, { error: String(error?.message || error) });
    }
  }

  function onSignalRequest(event) {
    let request = event.detail;
    if (typeof request === 'string') {
      try { request = JSON.parse(request); } catch (_) { return; }
    }
    if (request?.requestId) void handleSignalRequest(request);
  }

  document.addEventListener(SIGNAL_REQUEST_EVENT, onSignalRequest);

  async function publishSignal(topic, payload) {
    const message = await packSignal(payload);
    return signalRequest('publish', { topic, message });
  }

  async function pollSignals(topic) {
    const response = await signalRequest('poll', {
      topic,
      since: state.signalLastId || '5m'
    });

    const messages = Array.isArray(response.messages)
      ? response.messages
      : [];

    if (messages.length) {
      state.signalLastId = String(messages[messages.length - 1].id || state.signalLastId);
    }

    const result = [];

    for (const message of messages) {
      try {
        result.push({
          id: message.id,
          payload: await unpackSignal(message.message)
        });
      } catch (_) {}
    }

    return result;
  }

  function stopSignalLoop() {
    if (state.signalPollTimer) {
      clearTimeout(state.signalPollTimer);
      state.signalPollTimer = 0;
    }
  }

  function scheduleSignalPoll(handler, delay = 5000) {
    stopSignalLoop();

    state.signalPollTimer = setTimeout(async () => {
      state.signalPollTimer = 0;

      if (!state.active || !state.roomTopic) return;

      try {
        const messages = await pollSignals(state.roomTopic);
        for (const entry of messages) {
          await handler(entry.payload);
        }
      } catch (_) {}

      if (state.active && state.roomTopic) {
        scheduleSignalPoll(handler, 5000);
      }
    }, delay);
  }

  function banStorageKey() {
    const safe = String(state.worldName || 'world')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 40);
    return `minifeather.localgames.bans.${safe}`;
  }

  function profileBanKey(profile) {
    const uuid = cleanText(profile?.uuid, 80).toLowerCase();
    if (uuid) return `uuid:${uuid}`;
    return `name:${cleanText(profile?.name, 24).toLowerCase()}`;
  }

  function loadBanList() {
    state.banList.clear();

    try {
      const parsed = JSON.parse(localStorage.getItem(banStorageKey()) || '[]');
      if (!Array.isArray(parsed)) return;

      for (const entry of parsed) {
        if (!entry?.key) continue;
        state.banList.set(String(entry.key), {
          key: String(entry.key),
          name: cleanText(entry.name, 24),
          reason: cleanText(entry.reason, 120),
          at: Number(entry.at) || Date.now()
        });
      }
    } catch (_) {}
  }

  function saveBanList() {
    try {
      localStorage.setItem(
        banStorageKey(),
        JSON.stringify(Array.from(state.banList.values()))
      );
    } catch (_) {}
  }

  function isProfileBanned(profile) {
    const direct = profileBanKey(profile);
    if (state.banList.has(direct)) return true;

    const nameKey = `name:${cleanText(profile?.name, 24).toLowerCase()}`;
    return state.banList.has(nameKey);
  }

  function sendJSON(channel, payload) {
    if (channel?.readyState !== 'open') return false;

    try {
      channel.send(JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function connectedHostPeers() {
    return Array.from(state.peers.entries())
      .filter(([, peer]) => peer?.pc?.connectionState === 'connected');
  }

  function rosterPayload() {
    const players = [
      {
        peerId: 'host',
        playerId: state.localPlayerId,
        profile: profileNetworkSnapshot(),
        role: 'owner',
        mode: currentGamemodeId(),
        ping: 0
      }
    ];

    for (const [peerId, peer] of state.peers.entries()) {
      if (!peer?.profile || peer.accepted === false) continue;

      players.push({
        peerId,
        playerId: peer.playerId || numericPeerId(peerId),
        profile: peer.profile,
        role: peer.role || 'player',
        mode: peer.mode || peer.profile.mode || 'survival',
        ping: peer.ping || 0
      });
    }

    return players;
  }

  function applyRoster(players) {
    if (!Array.isArray(players)) return;

    state.remotePlayers.clear();

    for (const entry of players) {
      if (!entry?.peerId) continue;
      if (entry.peerId === state.localPeerId) continue;

      const normalized = {
        ...entry,
        profile: {
          ...(entry.profile || {})
        }
      };

      state.remotePlayers.set(String(entry.peerId), normalized);

      if (entry.peerId === 'host' && state.hostPeer) {
        state.hostPeer.profile = {
          ...state.hostPeer.profile,
          ...(entry.profile || {})
        };
        state.hostPeer.role = entry.role || 'owner';
        state.hostPeer.mode = entry.mode || state.hostPeer.mode || 'survival';
      }
    }

    syncNativePlayerList();
    emitState();
  }

  function broadcastReliable(payload, exceptPeerId = '') {
    if (state.mode !== 'host') return;

    for (const [peerId, peer] of connectedHostPeers()) {
      if (peerId === exceptPeerId) continue;
      sendJSON(peer.stateChannel, payload);
    }
  }

  function broadcastMove(payload, exceptPeerId = '') {
    if (state.mode !== 'host') return;

    for (const [peerId, peer] of connectedHostPeers()) {
      if (peerId === exceptPeerId) continue;
      sendJSON(peer.moveChannel, payload);
    }
  }

  function broadcastRoster() {
    const roster = rosterPayload();
    broadcastReliable({ t: 'roster', players: roster });
    syncNativePlayerList();
    emitState();
  }

  function sendSystemToPeer(peer, text) {
    sendJSON(peer?.stateChannel, {
      t: 'system',
      text: cleanText(text, 500)
    });
  }

  function announceSystem(text) {
    addSystemChat(text);
    broadcastReliable({
      t: 'system',
      text: cleanText(text, 500)
    });
  }

  function sendChatToAll(profile, text) {
    const message = cleanText(text, 256);
    if (!message) return;

    addPlayerChat(profile, message);
    broadcastReliable({
      t: 'chat',
      profile,
      text: message
    });
  }

  function sendLocalChat(text) {
    const message = cleanText(text, 256);
    if (!message || !state.active) return false;

    if (message.startsWith('/')) {
      return handleLocalChatCommand(message);
    }

    if (state.mode === 'host' || state.mode === 'single') {
      sendChatToAll(profileNetworkSnapshot(), message);
      return true;
    }

    if (state.mode === 'join') {
      return sendJSON(state.hostPeer?.stateChannel, {
        t: 'chat',
        text: message
      });
    }

    return false;
  }

  // ── Slash command router ────────────────────────────────────────────
  // Formato: /<cmd> [args...]. Si mode=join, los comandos se envían al
  // host para que los ejecute (mismo flujo que runServerCommand).
  function handleLocalChatCommand(rawText) {
    const body = rawText.replace(/^\/+/, '').trim();
    if (!body) return false;

    const tokens = body.split(/\s+/);
    const cmd = String(tokens.shift() || '').toLowerCase();
    const args = tokens;

    const myRole = state.localRole || (state.mode === 'host' ? 'owner' : 'player');
    const isMod = myRole === 'owner' || myRole === 'coowner';

    // Comandos disponibles para todos
    switch (cmd) {
      case 'help':
      case '?': {
        const lines = [
          '\\gold\\=== Local Worlds Commands ===\\reset\\',
          '\\white\\/help\\reset\\  — this list',
          '\\white\\/players\\reset\\  — online players',
          '\\white\\/gamemode <creative|survival|adventure|spectator|hardcore> [player]\\reset\\',
          '\\white\\/heal [player]\\reset\\',
          '\\white\\/tp <x> <y> <z> [player]\\reset\\',
          '\\white\\/fly [player]\\reset\\',
          '\\white\\/kill [player]\\reset\\',
          '\\white\\/spawn [player]\\reset\\',
          '\\white\\/time <day|night|noon|midnight|0-24000>\\reset\\',
          '\\white\\/weather <clear|rain|thunder>\\reset\\'
        ];
        for (const l of lines) addGameChat(l);
        if (isMod) {
          addGameChat('\\gold\\— Moderator only —\\reset\\');
          addGameChat('\\white\\/say <message>\\reset\\');
          addGameChat('\\white\\/coowner <player>\\reset\\');
          addGameChat('\\white\\/uncoowner <player>\\reset\\');
          addGameChat('\\white\\/kick <player> [reason]\\reset\\');
          addGameChat('\\white\\/ban <player> [reason]\\reset\\');
          addGameChat('\\white\\/unban <player>\\reset\\');
        }
        return true;
      }
      case 'players':
      case 'list': {
        if (state.mode === 'host' || state.mode === 'single') {
          return !!executeHostCommand('', 'players', []);
        }
        return runServerCommand('players', []);
      }
    }

    // Comandos que el host puede auto-aplicarse a sí mismo sin permisos
    switch (cmd) {
      case 'heal': {
        if (args.length === 0) {
          if (state.mode === 'host' || state.mode === 'single') healLocalPlayer();
          else return runServerCommand('heal', []);
          return true;
        }
        if (state.mode === 'host' || state.mode === 'single') return !!executeHostCommand('', 'heal', args);
        return runServerCommand('heal', args);
      }
      case 'tp':
      case 'teleport': {
        if (state.mode === 'host' || state.mode === 'single') return !!executeHostCommand('', 'tp', args);
        return runServerCommand('tp', args);
      }
      case 'gamemode':
      case 'gm':
      case 'creative':
      case 'survival':
      case 'adventure':
      case 'spectator': {
        // /gamemode <mode> [player]   o   /creative (corto)
        const realCmd = cmd === 'gm' ? 'gamemode' : cmd;
        const realArgs = cmd === 'gamemode' || cmd === 'gm' ? args : (args.length ? args : []);
        if (state.mode === 'host' || state.mode === 'single') return !!executeHostCommand('', realCmd, realArgs);
        return runServerCommand(realCmd, realArgs);
      }
      case 'fly':
      case 'flight': {
        const targetName = cleanText(args.join(' '), 24);
        if (!targetName) {
          toggleLocalFlight();
          addSystemChat('Flight toggled.');
          return true;
        }
        if (state.mode === 'host' || state.mode === 'single') {
          // Llamada directa: toggle al peer por nombre
          if (!isMod) {
            addGameChat('\\red\\You can only toggle your own flight.', '');
            return true;
          }
          if (targetName.toLowerCase() === (profileSnapshot().name || '').toLowerCase()) {
            toggleLocalFlight();
            return true;
          }
          const found = peerByName(targetName);
          if (!found) {
            addGameChat(`\\red\\Player "${targetName}" not found.`, '');
            return true;
          }
          const [peerId, targetPeer] = found;
          sendJSON(targetPeer.stateChannel, { t: 'control', action: 'fly-toggle' });
          addSystemChat(`${targetPeer.profile.name} flight toggled.`);
          return true;
        }
        return runServerCommand('fly', [targetName]);
      }
      case 'kill': {
        if (!isMod) {
          addGameChat('\\red\\Only the owner/co-owner can /kill.', '');
          return true;
        }
        const targetName = cleanText(args.join(' '), 24) || profileSnapshot().name;
        if (state.mode === 'host' || state.mode === 'single') {
          if (targetName.toLowerCase() === (profileSnapshot().name || '').toLowerCase()) {
            state.game?.player?.setHealth?.(0);
            return true;
          }
          const found = peerByName(targetName);
          if (!found) {
            addGameChat(`\\red\\Player "${targetName}" not found.`, '');
            return true;
          }
          sendJSON(found[1].stateChannel, { t: 'control', action: 'kill' });
          addSystemChat(`${found[1].profile.name} was killed.`);
          return true;
        }
        return runServerCommand('kill', [targetName]);
      }
      case 'spawn': {
        const targetName = cleanText(args.join(' '), 24);
        if (!targetName) {
          teleportToLocalSpawn();
          return true;
        }
        if (state.mode === 'host' || state.mode === 'single') {
          if (!isMod) {
            addGameChat('\\red\\You can only teleport yourself to spawn.', '');
            return true;
          }
          if (targetName.toLowerCase() === (profileSnapshot().name || '').toLowerCase()) {
            teleportToLocalSpawn();
            return true;
          }
          const found = peerByName(targetName);
          if (!found) {
            addGameChat(`\\red\\Player "${targetName}" not found.`, '');
            return true;
          }
          if (!state.origin) {
            addGameChat('\\red\\Spawn is not set yet.', '');
            return true;
          }
          sendJSON(found[1].stateChannel, {
            t: 'control',
            action: 'teleport',
            x: state.origin.x,
            y: state.origin.y + 3.05,
            z: state.origin.z
          });
          addSystemChat(`${found[1].profile.name} teleported to spawn.`);
          return true;
        }
        return runServerCommand('spawn', [targetName]);
      }
      case 'time': {
        return handleTimeCommand(args);
      }
      case 'weather': {
        return handleWeatherCommand(args);
      }
      case 'say':
      case 'coowner':
      case 'uncoowner':
      case 'kick':
      case 'ban':
      case 'unban': {
        if (state.mode === 'host' || state.mode === 'single') return !!executeHostCommand('', cmd, args);
        return runServerCommand(cmd, args);
      }
    }

    addGameChat(`\\red\\Unknown command: /${cmd}. Type /help for the list.`, '');
    return false;
  }

  function handleTimeCommand(args) {
    if (state.mode !== 'host' && state.mode !== 'single') {
      return runServerCommand('time', args);
    }

    const world = state.game?.world;
    if (!world) {
      addGameChat('\\red\\World is not loaded yet.', '');
      return true;
    }

    const arg = String(args[0] || '').toLowerCase();
    const presets = {
      day: 6000,
      noon: 6000,
      night: 18000,
      midnight: 18000,
      sunrise: 0,
      sunset: 12000
    };

    let newTime;
    if (presets[arg] !== undefined) {
      newTime = presets[arg];
    } else {
      const n = Number(arg);
      if (Number.isFinite(n)) {
        newTime = ((n % 24000) + 24000) % 24000;
      }
    }

    if (newTime === undefined) {
      addGameChat('\\red\\Usage: /time <day|night|noon|midnight|sunrise|sunset|0-24000>', '');
      return true;
    }

    try {
      if ('worldTime' in world) {
        world.worldTime = newTime;
      } else if (typeof world.setTime === 'function') {
        world.setTime(newTime);
      } else {
        addGameChat('\\red\\Could not change time on this world.', '');
        return true;
      }
      addSystemChat(`Time set to ${arg || newTime} (${newTime}).`);
    } catch (err) {
      addGameChat('\\red\\Failed to change time.', '');
    }
    return true;
  }

  function handleWeatherCommand(args) {
    if (state.mode !== 'host' && state.mode !== 'single') {
      return runServerCommand('weather', args);
    }

    const arg = String(args[0] || '').toLowerCase();
    const world = state.game?.world;
    if (!world) {
      addGameChat('\\red\\World is not loaded yet.', '');
      return true;
    }

    const valid = ['clear', 'rain', 'thunder'];
    if (!valid.includes(arg)) {
      addGameChat('\\red\\Usage: /weather <clear|rain|thunder>', '');
      return true;
    }

    const value = arg === 'clear' ? 0 : arg === 'rain' ? 1 : 2;
    try {
      if ('rainStrength' in world) world.rainStrength = arg === 'clear' ? 0 : 0.5;
      if ('thunderStrength' in world) world.thunderStrength = arg === 'thunder' ? 1 : 0;
      if (typeof world.setWeather === 'function') world.setWeather(value);
      addSystemChat(`Weather: ${arg}.`);
    } catch (err) {
      addGameChat('\\red\\Failed to change weather.', '');
    }
    return true;
  }

  function withinWorldBounds(x, y, z) {
    const bounds = state.worldBounds;
    if (!bounds) return false;

    return (
      x >= bounds.minX &&
      x <= bounds.maxX &&
      z >= bounds.minZ &&
      z <= bounds.maxZ &&
      y >= 0 &&
      y <= 255
    );
  }

  function queueBlockChange(pos, blockState) {
    if (!state.active || state.suppressBlockBroadcast) return;

    const x = Math.floor(Number(pos?.x));
    const y = Math.floor(Number(pos?.y));
    const z = Math.floor(Number(pos?.z));
    const id = Number(blockState?.id);

    if (![x, y, z, id].every(Number.isFinite)) return;
    if (!withinWorldBounds(x, y, z)) return;

    const positionKey = key(x, y, z);
    state.blockOverrides.set(positionKey, id);
    state.pendingBlockChanges.push({ x, y, z, id });

    if (state.pendingBlockChanges.length > 512) {
      state.pendingBlockChanges.splice(0, state.pendingBlockChanges.length - 512);
    }
  }

  function patchWorldBlockBroadcast() {
    const world = state.world;
    if (!world) return;

    patchWorldItemDrops();

    if (state.worldSetBlockPatch?.world === world) return;
    if (typeof world.setBlockState !== 'function') return;

    const original = world.setBlockState;

    const wrapped = function (pos, blockState, ...args) {
      const xyz = blockCoordinates(pos);
      const previousState = xyz ? getStateAt(xyz.x, xyz.y, xyz.z) : null;
      const wasSolid = !!previousState && !isAirState(previousState);
      const becomesAir = isAirState(blockState);
      const heldBefore = state.game?.player?.inventory?.getCurrentItem?.() || null;
      const heldDamageBefore = Number(heldBefore?.itemDamage);

      const changed = original.call(this, pos, blockState, ...args);

      if (changed) {
        queueBlockChange(pos, blockState);

        if (
          !state.suppressBlockBroadcast &&
          xyz &&
          wasSolid &&
          becomesAir
        ) {
          wearHeldItemOnLocalBreak(
            xyz,
            previousState,
            heldBefore,
            heldDamageBefore
          );
          scheduleFallbackBlockDrop(xyz, previousState);
        }
      }

      return changed;
    };

    try {
      world.setBlockState = wrapped;
      state.worldSetBlockPatch = {
        world,
        original,
        wrapped
      };
    } catch (_) {}
  }

  function restoreWorldBlockBroadcast() {
    const patch = state.worldSetBlockPatch;
    state.worldSetBlockPatch = null;

    if (!patch?.world || !patch.original) return;

    try {
      if (patch.world.setBlockState === patch.wrapped) {
        patch.world.setBlockState = patch.original;
      }
    } catch (_) {}
  }

  function applyNetworkBlocks(changes, record = true) {
    if (!Array.isArray(changes)) return;

    state.suppressBlockBroadcast = true;

    try {
      for (const change of changes.slice(0, 256)) {
        const x = Math.floor(Number(change.x));
        const y = Math.floor(Number(change.y));
        const z = Math.floor(Number(change.z));
        const id = Number(change.id);

        if (![x, y, z, id].every(Number.isFinite)) continue;
        if (!withinWorldBounds(x, y, z)) continue;
        if (!stateById(id)) continue;

        setStateIdAt(x, y, z, id, true);

        if (record) {
          state.blockOverrides.set(key(x, y, z), id);
        }
      }
    } finally {
      state.suppressBlockBroadcast = false;
    }
  }

  function flushPendingBlockChanges() {
    if (!state.active || !state.pendingBlockChanges.length) return;

    const changes = state.pendingBlockChanges.splice(0, 96);

    if (state.mode === 'host' || state.mode === 'single') {
      if (state.mode === 'host') {
        broadcastReliable({ t: 'blocks', changes });
      }
      return;
    }

    if (state.mode === 'join') {
      sendJSON(state.hostPeer?.stateChannel, {
        t: 'blocks',
        changes
      });
    }
  }

  function sendBlockSnapshot(peer) {
    const entries = Array.from(state.blockOverrides.entries());

    for (let i = 0; i < entries.length; i += 128) {
      const changes = entries.slice(i, i + 128).map(([positionKey, id]) => {
        const [x, y, z] = positionKey.split(',').map(Number);
        return { x, y, z, id };
      });

      sendJSON(peer.stateChannel, {
        t: 'blocks',
        changes,
        snapshot: true
      });
    }
  }

  function waitIce(pc, timeout = 8000) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();

    return new Promise(resolve => {
      const timer = setTimeout(done, timeout);

      function done() {
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }

      function onChange() {
        if (pc.iceGatheringState === 'complete') done();
      }

      pc.addEventListener('icegatheringstatechange', onChange);
    });
  }

  function peerByName(name) {
    const target = cleanText(name, 24).toLowerCase();
    if (!target) return null;

    for (const [peerId, peer] of state.peers.entries()) {
      if (cleanText(peer?.profile?.name, 24).toLowerCase() === target) {
        return [peerId, peer];
      }
    }

    return null;
  }

  function canModerate(role) {
    return role === 'owner' || role === 'coowner';
  }

  function privateCommandMessage(sourcePeer, text, error = false) {
    const message = cleanText(text, 500);

    if (!sourcePeer) {
      addGameChat(message, error ? '\\red\\' : '\\purple\\');
      return;
    }

    sendJSON(sourcePeer.stateChannel, {
      t: 'command-result',
      text: message,
      error
    });
  }

  function setPeerRole(peerId, role) {
    const peer = state.peers.get(peerId);
    if (!peer) return false;

    peer.role = role;
    const remote = state.remotePlayers.get(peerId);
    if (remote) remote.role = role;
    sendJSON(peer.stateChannel, {
      t: 'role',
      role
    });
    broadcastRoster();
    return true;
  }

  function closeHostPeer(peerId, reason = 'Disconnected', banned = false) {
    const peer = state.peers.get(peerId);
    if (!peer) return false;

    sendJSON(peer.stateChannel, {
      t: 'disconnect',
      reason: cleanText(reason, 160),
      banned: !!banned
    });

    setTimeout(() => {
      try { peer.stateChannel?.close?.(); } catch (_) {}
      try { peer.moveChannel?.close?.(); } catch (_) {}
      try { peer.pc?.close?.(); } catch (_) {}
    }, 120);

    state.peers.delete(peerId);
    state.remotePlayers.delete(peerId);
    broadcastRoster();
    return true;
  }

  function executeHostCommand(sourcePeerId, command, args = [], override = null) {
    const sourcePeer = sourcePeerId ? state.peers.get(sourcePeerId) : null;
    const sourceRole =
      override?.role ||
      (sourcePeer ? sourcePeer.role || 'player' : 'owner');
    const sourceName =
      override?.name ||
      sourcePeer?.profile?.name ||
      profileSnapshot().name;
    const cmd = String(command || '').toLowerCase();

    if (cmd === 'players') {
      const names = rosterPayload().map(entry => {
        const role = entry.role === 'owner' ? 'Owner' : entry.role === 'coowner' ? 'Co-Owner' : 'Player';
        return `${entry.profile?.name || 'Player'} (${role})`;
      });
      privateCommandMessage(sourcePeer, `Players (${names.length}/${MAX_PLAYERS}): ${names.join(', ')}`);
      return true;
    }

    if (cmd === 'say') {
      if (!canModerate(sourceRole)) {
        privateCommandMessage(sourcePeer, 'You do not have permission to use /say.', true);
        return true;
      }

      const text = cleanText(args.join(' '), 256);
      if (!text) {
        privateCommandMessage(sourcePeer, 'Usage: /say <message>', true);
        return true;
      }

      announceSystem(`[Server] ${text}`);
      return true;
    }

    if (cmd === 'coowner' || cmd === 'uncoowner') {
      if (sourceRole !== 'owner') {
        privateCommandMessage(sourcePeer, 'Only the world owner can change Co-Owners.', true);
        return true;
      }

      const targetName = args.join(' ').trim();
      const found = peerByName(targetName);

      if (!found) {
        privateCommandMessage(sourcePeer, `Player "${targetName}" was not found.`, true);
        return true;
      }

      const [peerId, peer] = found;
      const role = cmd === 'coowner' ? 'coowner' : 'player';
      setPeerRole(peerId, role);
      announceSystem(`${peer.profile.name} is now ${role === 'coowner' ? 'a Co-Owner' : 'a Player'}.`);
      return true;
    }

    if (cmd === 'kick' || cmd === 'ban') {
      const isBan = cmd === 'ban';

      if (!canModerate(sourceRole) || (isBan && sourceRole !== 'owner')) {
        privateCommandMessage(
          sourcePeer,
          isBan ? 'Only the world owner can ban players.' : 'You do not have permission to kick players.',
          true
        );
        return true;
      }

      const targetName = cleanText(args[0], 24);
      const reason = cleanText(args.slice(1).join(' '), 120) || (isBan ? 'Banned by the world owner.' : 'Kicked from the world.');
      const found = peerByName(targetName);

      if (!found) {
        privateCommandMessage(sourcePeer, `Player "${targetName}" was not found.`, true);
        return true;
      }

      const [peerId, peer] = found;


      if (sourceRole === 'coowner' && peer.role === 'coowner') {
        privateCommandMessage(sourcePeer, 'Co-Owners cannot kick other Co-Owners.', true);
        return true;
      }

      if (isBan) {
        const entry = {
          key: profileBanKey(peer.profile),
          name: peer.profile.name,
          reason,
          at: Date.now()
        };
        state.banList.set(entry.key, entry);
        state.banList.set(`name:${peer.profile.name.toLowerCase()}`, entry);
        saveBanList();
      }

      closeHostPeer(peerId, reason, isBan);
      announceSystem(`${peer.profile.name} was ${isBan ? 'banned' : 'kicked'} from the world.`);
      return true;
    }

    if (cmd === 'unban') {
      if (sourceRole !== 'owner') {
        privateCommandMessage(sourcePeer, 'Only the world owner can unban players.', true);
        return true;
      }

      const target = cleanText(args.join(' '), 80).toLowerCase();
      if (!target) {
        privateCommandMessage(sourcePeer, 'Usage: /unban <username>', true);
        return true;
      }

      let removed = false;

      for (const [banKey, entry] of Array.from(state.banList.entries())) {
        if (
          banKey === target ||
          banKey === `name:${target}` ||
          cleanText(entry?.name, 24).toLowerCase() === target
        ) {
          state.banList.delete(banKey);
          removed = true;
        }
      }

      saveBanList();
      privateCommandMessage(sourcePeer, removed ? `${target} was unbanned.` : `${target} is not banned.`, !removed);
      return true;
    }

    if (cmd === 'banlist') {
      if (!canModerate(sourceRole)) {
        privateCommandMessage(sourcePeer, 'You do not have permission to view the ban list.', true);
        return true;
      }

      const unique = [];
      const seen = new Set();

      for (const entry of state.banList.values()) {
        const id = `${entry.name}:${entry.at}`;
        if (seen.has(id)) continue;
        seen.add(id);
        unique.push(entry);
      }

      privateCommandMessage(
        sourcePeer,
        unique.length
          ? `Banned players: ${unique.map(entry => entry.name).join(', ')}`
          : 'No players are banned.'
      );
      return true;
    }

    if (cmd === 'heal') {
      if (!canModerate(sourceRole)) {
        privateCommandMessage(sourcePeer, 'You do not have permission to use /heal.', true);
        return true;
      }

      const targetName = cleanText(args.join(' '), 24);

      if (!targetName || targetName.toLowerCase() === sourceName.toLowerCase()) {
        if (sourcePeer) {
          sendJSON(sourcePeer.stateChannel, { t: 'control', action: 'heal' });
        } else {
          healLocalPlayer();
        }

        privateCommandMessage(sourcePeer, 'Health and food restored.');
        return true;
      }

      if (targetName.toLowerCase() === profileSnapshot().name.toLowerCase()) {
        healLocalPlayer();
        privateCommandMessage(sourcePeer, `${profileSnapshot().name} was healed.`);
        return true;
      }

      const found = peerByName(targetName);

      if (!found) {
        privateCommandMessage(sourcePeer, `Player "${targetName}" was not found.`, true);
        return true;
      }

      const [, targetPeer] = found;
      sendJSON(targetPeer.stateChannel, { t: 'control', action: 'heal' });
      privateCommandMessage(sourcePeer, `${targetPeer.profile.name} was healed.`);
      return true;
    }

    if (cmd === 'tp') {
      if (!canModerate(sourceRole)) {
        privateCommandMessage(sourcePeer, 'You do not have permission to use /tp.', true);
        return true;
      }

      if (args.length < 3) {
        privateCommandMessage(sourcePeer, 'Usage: /tp <x> <y> <z> [player]', true);
        return true;
      }

      const x = Number(args[0]);
      const y = Number(args[1]);
      const z = Number(args[2]);

      if (![x, y, z].every(Number.isFinite)) {
        privateCommandMessage(sourcePeer, 'Invalid teleport coordinates.', true);
        return true;
      }

      const targetName = cleanText(args.slice(3).join(' '), 24);

      if (!targetName || targetName.toLowerCase() === sourceName.toLowerCase()) {
        if (sourcePeer) {
          sendJSON(sourcePeer.stateChannel, {
            t: 'control',
            action: 'teleport',
            x,
            y,
            z
          });
        } else {
          teleportLocal(x, y, z);
        }

        privateCommandMessage(sourcePeer, `Teleported to ${x} ${y} ${z}.`);
        return true;
      }

      if (targetName.toLowerCase() === profileSnapshot().name.toLowerCase()) {
        teleportLocal(x, y, z);
        privateCommandMessage(sourcePeer, `${profileSnapshot().name} was teleported.`);
        return true;
      }

      const found = peerByName(targetName);

      if (!found) {
        privateCommandMessage(sourcePeer, `Player "${targetName}" was not found.`, true);
        return true;
      }

      const [, targetPeer] = found;
      sendJSON(targetPeer.stateChannel, {
        t: 'control',
        action: 'teleport',
        x,
        y,
        z
      });
      privateCommandMessage(sourcePeer, `${targetPeer.profile.name} was teleported.`);
      return true;
    }

    if (cmd === 'creative' || cmd === 'survival' || cmd === 'adventure' || cmd === 'spectator' || cmd === 'gamemode') {
      if (!canModerate(sourceRole)) {
        privateCommandMessage(sourcePeer, 'You do not have permission to change gamemodes.', true);
        return true;
      }

      const mode = cmd === 'gamemode' ? String(args[0] || '').toLowerCase() : cmd;
      const targetName = cmd === 'gamemode' ? args.slice(1).join(' ').trim() : args.join(' ').trim();

      if (!['creative', 'survival', 'adventure', 'spectator'].includes(mode)) {
        privateCommandMessage(sourcePeer, 'Usage: /gamemode <creative|survival|adventure|spectator> [player]', true);
        return true;
      }

      if (!targetName || targetName.toLowerCase() === sourceName.toLowerCase()) {
        if (sourcePeer) {
          sendJSON(sourcePeer.stateChannel, { t: 'control', action: 'gamemode', mode });
          sourcePeer.mode = mode;
        } else {
          setLocalGamemode(mode);
        }
        broadcastRoster();
        privateCommandMessage(sourcePeer, `Gamemode changed to ${mode}.`);
        return true;
      }

      if (targetName.toLowerCase() === profileSnapshot().name.toLowerCase()) {
        setLocalGamemode(mode);
        broadcastRoster();
        privateCommandMessage(sourcePeer, `${profileSnapshot().name}'s gamemode changed to ${mode}.`);
        return true;
      }

      const found = peerByName(targetName);
      if (!found) {
        privateCommandMessage(sourcePeer, `Player "${targetName}" was not found.`, true);
        return true;
      }

      const [, targetPeer] = found;
      targetPeer.mode = mode;
      sendJSON(targetPeer.stateChannel, { t: 'control', action: 'gamemode', mode });
      broadcastRoster();
      privateCommandMessage(sourcePeer, `${targetPeer.profile.name}'s gamemode changed to ${mode}.`);
      return true;
    }

    return false;
  }

  function runServerCommand(command, args = []) {
    if (!state.active) return false;

    if (state.mode === 'host' || state.mode === 'single') {
      return executeHostCommand('', command, args);
    }

    if (state.mode === 'join') {
      return sendJSON(state.hostPeer?.stateChannel, {
        t: 'command',
        command: String(command || '').toLowerCase(),
        args: Array.isArray(args) ? args.slice(0, 16) : []
      });
    }

    return false;
  }

  function showConnectionLost(reason = '') {
    if (state.connectionLost) return;
    state.connectionLost = true;

    try {
      document.exitPointerLock?.();
    } catch (_) {}

    let overlay = document.getElementById('mf-localgames-connection-lost');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'mf-localgames-connection-lost';
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:2147483646',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'background:rgba(5,7,12,.92)',
        'font-family:Faithful,Inter,Arial,sans-serif',
        'color:#fff'
      ].join(';');

      const card = document.createElement('div');
      card.style.cssText = [
        'width:min(520px,calc(100vw - 40px))',
        'padding:28px',
        'border-radius:14px',
        'background:#121722',
        'border:1px solid rgba(255,255,255,.12)',
        'box-shadow:0 22px 60px rgba(0,0,0,.55)',
        'text-align:center'
      ].join(';');

      const title = document.createElement('div');
      title.dataset.mfLocalTitle = '1';
      title.textContent = tr('localConnectionLost', 'Connection Lost');
      title.style.cssText = 'font-size:24px;font-weight:900;margin-bottom:12px;color:#f87171';

      const message = document.createElement('div');
      message.id = 'mf-localgames-connection-lost-message';
      message.style.cssText = 'font-size:14px;line-height:1.6;color:#d7dbe7;margin-bottom:20px';

      const button = document.createElement('button');
      button.dataset.mfLocalBack = '1';
      button.textContent = tr('localBackToMiniblox', 'Back to MiniBlox');
      button.style.cssText = 'border:0;border-radius:9px;padding:11px 18px;background:#7c3aed;color:#fff;font:inherit;font-weight:800;cursor:pointer';
      button.addEventListener('click', () => location.reload());

      card.appendChild(title);
      card.appendChild(message);
      card.appendChild(button);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    }

    const message = overlay.querySelector('#mf-localgames-connection-lost-message');
    if (message) message.textContent = cleanText(reason, 240) || tr('localConnectionLostFallback', 'The connection to the host was lost.');

    stopLoops();
    setStatus('Connection lost.', 'HOST_CONNECTION_LOST');
  }

  function removeConnectionLostOverlay() {
    state.connectionLost = false;
    document.getElementById('mf-localgames-connection-lost')?.remove();
  }

  function closePeerConnection(peer) {
    if (!peer) return;
    try { peer.stateChannel?.close?.(); } catch (_) {}
    try { peer.moveChannel?.close?.(); } catch (_) {}
    try { peer.pc?.close?.(); } catch (_) {}
  }

  function closeP2P(notifyGuests = false) {
    stopSignalLoop();

    if (state.mode === 'host' && state.serverAddress) {
      publishServerAdvert(false);
    }

    if (state.mode === 'host') {
      for (const [, peer] of state.peers.entries()) {
        if (notifyGuests) {
          sendJSON(peer.stateChannel, {
            t: 'server-close',
            reason: tr('localHostLeft', 'The host left the world.')
          });
          setTimeout(() => closePeerConnection(peer), 180);
        } else {
          closePeerConnection(peer);
        }
      }
    }

    state.peers.clear();
    closePeerConnection(state.hostPeer);
    state.hostPeer = null;
    state.remotePlayers.clear();
    state.roomTopic = '';
    state.signalLastId = '';
    state.serverAddress = '';
    state.connectedOnce = false;
    state.deferredBlocks.length = 0;
    state.deferredMessages.length = 0;
    syncNativePlayerList();
  }

  function stopWorld(reload = true, notifyGuests = true) {
    log(`stopWorld reload=${reload} (mode=${state.mode}, active=${state.active})`);
    stopLoops();
    closeP2P(notifyGuests);
    restoreWorldBlockBroadcast();
    restoreWorldItemDrops();
    restoreGameSceneUpdate();
    clearPendingUploadDrain();
    clearRenderLoopWatchdog();

    if (state.textureWatchTimer) {
      clearInterval(state.textureWatchTimer);
      state.textureWatchTimer = null;
    }

    if (state.active) {
      try {
        restoreArena();
        if (state.start) {
          teleportPlayer(state.start.x, state.start.y, state.start.z);
        }
      } catch (_) {}
    }

    restoreNetwork();
    restoreProviderGuard();
    exitLocalVisualMode();
    removePeerLayer();

    state.active = false;
    state.mode = 'idle';
    state.localRole = 'player';
    state.world = null;
    state.origin = null;
    state.arena = null;
    state.snapshot.clear();
    state.blockState.clear();
    state.blockOverrides.clear();
    state.pendingBlockChanges.length = 0;
    state.recentNativeDrops.clear();
    state.lastPickupScan = 0;
    state.lastPlayerEntityRepair = 0;
    state.localPlayerEntityReady = false;
    state.dropStats = { spawned: 0, pickedUp: 0, fallback: 0, failed: 0, lastError: '' };
    state.start = null;
    state.worldName = '';
    state.worldSeedOverride = null;
    state.status = 'Idle';
    state.error = '';
    state.gameSceneTickRecovered = false;
    state.sceneUpdateFailures = 0;
    state.sceneUpdateLastError = '';
    state.renderProbe = null;
    emitState();

    if (reload) {
      const delay = notifyGuests ? 320 : 120;
      setTimeout(() => location.reload(), delay);
    }
  }

  function relativePosition() {
    const pos = state.game?.player?.pos;
    const origin = state.origin;
    if (!pos || !origin) return null;

    return {
      x: Number(pos.x) - origin.x,
      y: Number(pos.y) - origin.y,
      z: Number(pos.z) - origin.z,
      yaw: Number(state.game.player.yaw) || 0,
      pitch: Number(state.game.player.pitch) || 0
    };
  }

  function onHostStateMessage(peerId, event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (_) {
      return;
    }

    const peer = state.peers.get(peerId);
    if (!peer || !message || typeof message !== 'object') return;

    if (message.t === 'chat') {
      sendChatToAll(peer.profile, message.text);
      return;
    }

    if (message.t === 'blocks') {
      const accepted = Array.isArray(message.changes)
        ? message.changes.filter(change => {
            const x = Math.floor(Number(change.x));
            const y = Math.floor(Number(change.y));
            const z = Math.floor(Number(change.z));
            const id = Number(change.id);
            return [x, y, z, id].every(Number.isFinite) && withinWorldBounds(x, y, z) && !!stateById(id);
          }).slice(0, 128)
        : [];

      if (accepted.length) {
        applyNetworkBlocks(accepted, true);
        broadcastReliable({ t: 'blocks', changes: accepted }, peerId);
      }
      return;
    }

    if (message.t === 'command') {
      executeHostCommand(peerId, message.command, Array.isArray(message.args) ? message.args : []);
      return;
    }

    if (message.t === 'ready') {
      peer.ready = true;
      return;
    }

    if (message.t === 'mode') {
      // El peer anuncia su modo actual. Lo registramos en su entrada de
      // roster para que el resto lo vea en la lista de jugadores.
      const newMode = String(message.mode || 'survival').toLowerCase();
      const newHardcore = !!message.hardcore;

      if (!['survival', 'creative', 'adventure', 'spectator'].includes(newMode)) {
        return;
      }

      const profile = peer.profile && typeof peer.profile === 'object'
        ? peer.profile
        : {};
      peer.profile = { ...profile, mode: newMode, hardcore: newHardcore };
      const remote = state.remotePlayers.get(peerId);
      if (remote) {
        remote.profile = peer.profile;
      }
      broadcastRoster();
      addSystemChat(
        `${peer.profile.name || 'Player'} is now ${newHardcore ? `Hardcore (${newMode})` : newMode}.`
      );
      return;
    }
  }

  function queueDeferredMessage(type, payload) {
    state.deferredMessages.push({ type, payload });
    if (state.deferredMessages.length > 80) {
      state.deferredMessages.splice(0, state.deferredMessages.length - 80);
    }
  }

  function flushDeferredGuestData() {
    if (!state.active || !state.directLocal || !state.worldBounds) return;

    if (state.deferredBlocks.length) {
      const blocks = state.deferredBlocks.splice(0, state.deferredBlocks.length);
      applyNetworkBlocks(blocks, true);
    }

    if (state.deferredMessages.length) {
      const messages = state.deferredMessages.splice(0, state.deferredMessages.length);

      for (const entry of messages) {
        if (entry.type === 'system') addSystemChat(entry.payload);
        if (entry.type === 'chat') addPlayerChat(entry.payload?.profile, entry.payload?.text);
      }
    }
  }

  function onGuestStateMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (_) {
      return;
    }

    if (!message || typeof message !== 'object') return;

    if (message.t === 'welcome') {
      state.localRole = message.role || 'player';
      state.worldName = cleanText(message.worldName, 30) || state.worldName;
      syncNativePlayerList();
      return;
    }

    if (message.t === 'roster') {
      applyRoster(message.players);
      return;
    }

    if (message.t === 'system') {
      if (state.active && state.directLocal) {
        addSystemChat(message.text);
      } else {
        queueDeferredMessage('system', message.text);
      }
      return;
    }


    if (message.t === 'chat') {
      if (state.active && state.directLocal) {
        addPlayerChat(message.profile, message.text);
      } else {
        queueDeferredMessage('chat', {
          profile: message.profile,
          text: message.text
        });
      }
      return;
    }

    if (message.t === 'blocks') {
      if (state.active && state.directLocal && state.worldBounds) {
        applyNetworkBlocks(message.changes, true);
      } else if (Array.isArray(message.changes)) {
        state.deferredBlocks.push(...message.changes.slice(0, 256));
        if (state.deferredBlocks.length > 4096) {
          state.deferredBlocks.splice(0, state.deferredBlocks.length - 4096);
        }
      }
      return;
    }

    if (message.t === 'role') {
      state.localRole = message.role || 'player';
      syncNativePlayerList();
      addSystemChat(`Your role is now ${state.localRole === 'coowner' ? 'Co-Owner' : 'Player'}.`);
      emitState();
      return;
    }

    if (message.t === 'control') {
      if (message.action === 'gamemode') {
        setLocalGamemode(message.mode);
        return;
      }

      if (message.action === 'heal') {
        healLocalPlayer();
        return;
      }

      if (message.action === 'teleport') {
        teleportLocal(message.x, message.y, message.z);
        return;
      }
    }

    if (message.t === 'command-result') {
      addGameChat(message.text, message.error ? '\\red\\' : '\\purple\\');
      return;
    }

    if (message.t === 'disconnect') {
      showConnectionLost(message.banned ? `You were banned from this world. ${message.reason || ''}` : `You were kicked from this world. ${message.reason || ''}`);
      return;
    }

    if (message.t === 'server-close') {
      showConnectionLost(message.reason || 'The host left the world.');
    }

    if (message.t === 'mode') {
      // El host nos avisa del cambio de modo global
      const newMode = String(message.mode || 'survival').toLowerCase();
      const newHardcore = !!message.hardcore;

      if (['survival', 'creative', 'adventure', 'spectator'].includes(newMode)) {
        if (newHardcore) {
          state.localHardcore = true;
          setLocalGamemode(newMode);
        } else {
          state.localHardcore = false;
          setLocalGamemode(newMode);
        }
        addSystemChat(
          newHardcore
            ? `Host switched to Hardcore (${newMode})`
            : `Host set game mode to ${newMode}`
        );
      }
    }
  }

  function handleRemoteMove(peerId, payload) {
    const entry = state.remotePlayers.get(peerId) || {};
    const values = [payload.x, payload.y, payload.z, payload.yaw, payload.pitch].map(Number);
    if (!values.every(Number.isFinite)) return;

    entry.target = {
      x: values[0],
      y: values[1],
      z: values[2],
      yaw: values[3],
      pitch: values[4]
    };

    if (!entry.position) {
      entry.position = { ...entry.target };
    }

    state.remotePlayers.set(peerId, entry);
  }

  function onHostMoveMessage(peerId, event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (_) {
      return;
    }

    if (message?.t !== 'move') return;
    handleRemoteMove(peerId, message);

    broadcastMove({
      ...message,
      id: peerId
    }, peerId);
  }

  function onGuestMoveMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (_) {
      return;
    }

    if (message?.t !== 'move' || !message.id) return;
    handleRemoteMove(String(message.id), message);
  }

  function handleHostPeerDisconnect(peerId) {
    const peer = state.peers.get(peerId);
    if (!peer) return;

    const name = peer.profile?.name || 'Player';
    state.peers.delete(peerId);
    state.remotePlayers.delete(peerId);
    announceSystem(`${name} has left.`);
    broadcastRoster();
  }

  function bindHostPeerChannel(peerId, channel) {
    const peer = state.peers.get(peerId);
    if (!peer) return;

    if (channel.label === 'mf-state') {
      peer.stateChannel = channel;
      channel.addEventListener('message', event => onHostStateMessage(peerId, event));
      channel.addEventListener('open', () => {
        if (peer.joinAnnounced) return;
        peer.joinAnnounced = true;
        peer.accepted = true;
        state.connectedOnce = true;

        sendJSON(channel, {
          t: 'welcome',
          worldName: state.worldName,
          seed: state.worldSeed,
          role: peer.role || 'player',
          protocol: PROTOCOL
        });

        sendJSON(channel, {
          t: 'roster',
          players: rosterPayload()
        });

        sendBlockSnapshot(peer);
        announceSystem(`${peer.profile.name} has joined.`);
        broadcastRoster();
      });
    } else if (channel.label === 'mf-move') {
      peer.moveChannel = channel;
      channel.addEventListener('message', event => onHostMoveMessage(peerId, event));
    }
  }

  function createHostPeerConnection(peerId, profile) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: STUN_URL }]
    });

    const peer = {
      peerId,
      playerId: numericPeerId(peerId),
      profile: { ...profile },
      role: 'player',
      mode: profile?.mode || 'survival',
      pc,
      stateChannel: null,
      moveChannel: null,
      accepted: true,
      joinAnnounced: false,
      ready: false
    };

    state.peers.set(peerId, peer);
    state.remotePlayers.set(peerId, {
      peerId,
      playerId: peer.playerId,
      profile: { ...peer.profile },
      role: peer.role,
      mode: peer.mode
    });

    pc.addEventListener('datachannel', event => {
      bindHostPeerChannel(peerId, event.channel);
    });

    pc.addEventListener('connectionstatechange', () => {
      const current = pc.connectionState;

      if (current === 'failed' || current === 'closed') {
        handleHostPeerDisconnect(peerId);
      }

      if (current === 'disconnected') {
        setTimeout(() => {
          const live = state.peers.get(peerId);
          if (live?.pc?.connectionState === 'disconnected') {
            handleHostPeerDisconnect(peerId);
          }
        }, 4000);
      }
    });

    return peer;
  }

  function createGuestConnection() {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: STUN_URL }]
    });

    const peer = {
      peerId: 'host',
      playerId: numericPeerId('host'),
      profile: {
        name: 'Host',
        mode: 'survival'
      },
      role: 'owner',
      pc,
      stateChannel: pc.createDataChannel('mf-state', { ordered: true }),
      moveChannel: pc.createDataChannel('mf-move', {
        ordered: false,
        maxRetransmits: 0
      })
    };

    state.hostPeer = peer;

    peer.stateChannel.addEventListener('message', onGuestStateMessage);
    peer.stateChannel.addEventListener('open', () => {
      state.connectedOnce = true;
      sendJSON(peer.stateChannel, { t: 'ready' });
      emitState();
    });

    peer.moveChannel.addEventListener('message', onGuestMoveMessage);

    pc.addEventListener('connectionstatechange', () => {
      const current = pc.connectionState;

      if (current === 'connected') {
        state.connectedOnce = true;
        setStatus(`Connected to ${state.worldName || 'MiniFeather world'}.`);
      }

      if ((current === 'failed' || current === 'closed') && state.connectedOnce && state.active) {
        showConnectionLost('The connection to the host was lost.');
      }

      if (current === 'disconnected' && state.connectedOnce && state.active) {
        setTimeout(() => {
          if (state.hostPeer?.pc?.connectionState === 'disconnected') {
            showConnectionLost('The connection to the host was lost.');
          }
        }, 4000);
      }
    });

    return peer;
  }

  async function handleJoinSignal(message) {
    if (
      state.mode !== 'host' ||
      message?.type !== 'join' ||
      Number(message.protocol) !== PROTOCOL ||
      !message.peerId ||
      !message.sdp
    ) {
      return;
    }

    const peerId = String(message.peerId).slice(0, 64);
    const profile = {
      ...(message.profile || {}),
      name: cleanText(message.profile?.name || 'Player', 24)
    };

    if (!profile.name) return;

    if (isProfileBanned(profile)) {
      await publishSignal(state.roomTopic, {
        type: 'reject',
        protocol: PROTOCOL,
        peerId,
        reason: 'You are banned from this world.'
      });
      return;
    }

    if (connectedHostPeers().length >= MAX_PLAYERS - 1 || state.peers.size >= MAX_PLAYERS - 1) {
      await publishSignal(state.roomTopic, {
        type: 'reject',
        protocol: PROTOCOL,
        peerId,
        reason: 'This world is full.'
      });
      return;
    }

    if (state.peers.has(peerId)) return;

    const peer = createHostPeerConnection(peerId, profile);

    try {
      await peer.pc.setRemoteDescription(message.sdp);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      await waitIce(peer.pc);

      await publishSignal(state.roomTopic, {
        type: 'answer',
        protocol: PROTOCOL,
        peerId,
        worldName: state.worldName,
        seed: state.worldSeed,
        role: peer.role,
        sdp: peer.pc.localDescription
      });
    } catch (_) {
      state.peers.delete(peerId);
      closePeerConnection(peer);
    }
  }

  function startHostSignalLoop() {
    state.signalLastId = '';
    scheduleSignalPoll(handleJoinSignal, 100);
  }

  async function createWorldServer(worldName) {
    if (state.active) {
      setStatus('A Local Games world is already active.', 'ALREADY_ACTIVE');
      return false;
    }

    const name = cleanText(worldName, 30);
    if (!name) {
      setStatus('Enter a world name.', 'WORLD_NAME_REQUIRED');
      return false;
    }

    removeConnectionLostOverlay();
    state.worldName = name;
    state.serverAddress = makeServerAddress();
    state.roomTopic = topicFromAddress(state.serverAddress);
    state.signalLastId = '';
    state.localRole = 'owner';
    state.localPeerId = 'host';
    state.localPlayerId = numericPeerId('host');
    state.worldSeedOverride = null;
    state.mode = 'host';
    loadBanList();

    const ok = await startWorld('sandbox', 'host', 0, {
      forceDirect: true,
      worldName: name,
      role: 'owner'
    });

    if (!ok) {
      state.serverAddress = '';
      state.roomTopic = '';
      state.mode = 'idle';
      return false;
    }

    patchWorldBlockBroadcast();
    syncNativePlayerList();
    startHostSignalLoop();
    await publishServerAdvert(true);
    setStatus(`World "${name}" is online.`);
    emitState();
    addSystemChat(`${profileSnapshot().name} has joined.`);
    return true;
  }

  async function waitForGuestAnswer(peerId, timeout = 45000) {
    const started = performance.now();
    state.signalLastId = '';

    while (performance.now() - started < timeout) {
      const messages = await pollSignals(state.roomTopic);

      for (const entry of messages) {
        const message = entry.payload;
        if (Number(message?.protocol) !== PROTOCOL) continue;
        if (String(message?.peerId || '') !== peerId) continue;

        if (message.type === 'reject') {
          throw new Error(message.reason || 'The host rejected the connection.');
        }

        if (message.type === 'answer' && message.sdp) {
          return message;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 4800));
    }

    throw new Error('The world did not respond in time.');
  }

  async function joinWorldServer(address) {
    log(`joinWorldServer address=${address}`);
    if (state.active) {
      setStatus('A Local Games world is already active.', 'ALREADY_ACTIVE');
      return false;
    }

    const normalized = normalizeServerAddress(address);
    if (!normalized) {
      logWarn(`joinWorldServer: dirección inválida "${address}"`);
      setStatus('Invalid MiniFeather IP.', 'INVALID_SERVER_IP');
      return false;
    }

    removeConnectionLostOverlay();
    state.mode = 'join';
    state.localRole = 'player';
    state.serverAddress = normalized;
    state.roomTopic = topicFromAddress(normalized);
    state.signalLastId = '';

    setStatus('Contacting the world host...');

    const game = await resolveGameSingleton();
    if (!game) {
      setStatus('Could not find the Miniblox engine.', 'NO_GAME_ENGINE');
      return false;
    }

    await waitForAccount(game, 5000);
    state.game = game;

    const peerId = randomHex(12);
    state.localPeerId = peerId;
    state.localPlayerId = numericPeerId(peerId);
    const peer = createGuestConnection();

    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      await waitIce(peer.pc);

      await publishSignal(state.roomTopic, {
        type: 'join',
        protocol: PROTOCOL,
        peerId,
        profile: profileNetworkSnapshot(),
        sdp: peer.pc.localDescription
      });

      const answer = await waitForGuestAnswer(peerId);
      state.worldName = cleanText(answer.worldName, 30) || 'MiniFeather World';
      state.worldSeedOverride = Number(answer.seed);
      state.localRole = answer.role || 'player';

      await peer.pc.setRemoteDescription(answer.sdp);

      const ok = await startWorld('sandbox', 'join', 3, {
        forceDirect: true,
        worldName: state.worldName,
        seed: state.worldSeedOverride,
        role: state.localRole,
        preserveNetwork: true
      });

      if (!ok) {
        closePeerConnection(peer);
        state.hostPeer = null;
        return false;
      }

      patchWorldBlockBroadcast();
      syncNativePlayerList();
      flushDeferredGuestData();
      setStatus(`Joining "${state.worldName}"...`);
      emitState();
      return true;
    } catch (error) {
      logError('joinWorldServer: fallo:', error);
      closePeerConnection(peer);
      state.hostPeer = null;
      state.mode = 'idle';
      setStatus('Could not join the world.', cleanText(error?.message || error, 200));
      return false;
    }
  }


  function matrixVec(matrix, x, y, z, w) {
    return {
      x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w,
      y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w,
      z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w,
      w: matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] * w
    };
  }

  function project(camera, x, y, z) {
    const view = camera?.matrixWorldInverse?.elements;
    const projection = camera?.projectionMatrix?.elements;
    if (!view || !projection) return null;

    const v = matrixVec(view, x, y, z, 1);
    const c = matrixVec(projection, v.x, v.y, v.z, v.w);
    if (!Number.isFinite(c.w) || c.w <= 0.00001) return null;

    const nx = c.x / c.w;
    const ny = c.y / c.w;
    const nz = c.z / c.w;
    if (![nx, ny, nz].every(Number.isFinite) || nz < -1.3 || nz > 1.3) return null;

    return {
      x: (nx * 0.5 + 0.5) * innerWidth,
      y: (-ny * 0.5 + 0.5) * innerHeight,
      inside: nx >= -1.05 && nx <= 1.05 && ny >= -1.05 && ny <= 1.05
    };
  }

  function ensurePeerLayer() {
    if (state.peerLayer?.isConnected) return;

    const styleId = 'mf-localgames-runtime-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        #mf-localgames-peer-layer{position:fixed;inset:0;pointer-events:none;z-index:999988;overflow:hidden;font-family:Faithful,Inter,Arial,sans-serif}
        .mf-localgames-peer-marker{position:absolute;display:none;transform:translate(-50%,-100%);padding:4px 7px;border-radius:6px;background:rgba(8,10,16,.82);border:1px solid rgba(124,92,255,.8);color:#fff;font-size:12px;font-weight:800;text-shadow:0 1px 2px #000;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.35)}
        #mf-localgames-badge{position:fixed;left:50%;top:18px;transform:translateX(-50%);padding:6px 10px;border-radius:8px;background:rgba(12,14,22,.86);border:1px solid rgba(139,92,246,.75);color:#fff;font-size:12px;font-weight:800;letter-spacing:.02em}
      `;
      document.head.appendChild(style);
    }

    const layer = document.createElement('div');
    layer.id = 'mf-localgames-peer-layer';
    layer.innerHTML = '<div id="mf-localgames-badge">MiniFeather Local</div>';
    document.body.appendChild(layer);
    state.peerLayer = layer;
  }

  function removePeerLayer() {
    state.peerLayer?.remove();
    state.peerLayer = null;
    document.getElementById('mf-localgames-runtime-style')?.remove();
  }

  function peerMarker(peerId) {
    ensurePeerLayer();

    const safeId = String(peerId).replace(/[^a-zA-Z0-9_-]/g, '_');
    let marker = state.peerLayer?.querySelector(`[data-peer-id="${safeId}"]`);

    if (!marker && state.peerLayer) {
      marker = document.createElement('div');
      marker.className = 'mf-localgames-peer-marker';
      marker.dataset.peerId = safeId;
      state.peerLayer.appendChild(marker);
    }

    return marker;
  }

  function updatePeerMarker() {
    if (!state.active) return;

    ensurePeerLayer();

    const origin = state.origin;
    const camera = state.game?.gameScene?.camera;
    const liveIds = new Set();

    for (const [peerId, peer] of state.remotePlayers.entries()) {
      if (!peer?.target || !origin || !camera) continue;

      if (!peer.position) peer.position = { ...peer.target };

      for (const axis of ['x', 'y', 'z', 'yaw', 'pitch']) {
        const target = Number(peer.target?.[axis]);
        const current = Number(peer.position?.[axis]);
        if (!Number.isFinite(target)) continue;
        peer.position[axis] = Number.isFinite(current)
          ? current + (target - current) * 0.32
          : target;
      }

      const marker = peerMarker(peerId);
      if (!marker) continue;

      liveIds.add(marker.dataset.peerId);

      const worldX = origin.x + Number(peer.position.x || 0);
      const worldY = origin.y + Number(peer.position.y || 0) + 2.1;
      const worldZ = origin.z + Number(peer.position.z || 0);
      const screen = project(camera, worldX, worldY, worldZ);

      if (!screen?.inside) {
        marker.style.display = 'none';
        continue;
      }

      const local = relativePosition();
      const distance = local
        ? Math.hypot(
            Number(peer.position.x || 0) - local.x,
            Number(peer.position.y || 0) - local.y,
            Number(peer.position.z || 0) - local.z
          )
        : 0;

      const name = cleanText(peer.profile?.name || peer.name || 'Player', 24);
      const role = peer.role === 'owner'
        ? 'Owner'
        : peer.role === 'coowner'
          ? 'Co-Owner'
          : '';

      marker.style.display = 'block';
      marker.style.left = `${screen.x}px`;
      marker.style.top = `${screen.y}px`;
      marker.textContent = `${role ? `[${role}] ` : ''}${name} · ${distance.toFixed(1)}m`;
    }

    for (const marker of state.peerLayer?.querySelectorAll('.mf-localgames-peer-marker') || []) {
      if (!liveIds.has(marker.dataset.peerId)) marker.remove();
    }

    const badge = state.peerLayer?.querySelector('#mf-localgames-badge');
    if (badge) {
      const count = state.mode === 'host'
        ? 1 + connectedHostPeers().length
        : state.mode === 'join'
          ? 1 + (state.hostPeer?.pc?.connectionState === 'connected' ? 1 : 0)
          : 1;
      badge.textContent = `${state.worldName || 'MiniFeather Local'} · ${count}/${MAX_PLAYERS}`;
    }

    state.peerFrame = requestAnimationFrame(updatePeerMarker);
  }

  function startLoops() {
    stopLoops();

    state.interval = setInterval(() => {
      if (!state.active) return;

      const arena = state.arena;
      const player = state.game?.player;
      if (!arena || !player?.pos) return;

      const fallThreshold =
        state.directLocal && state.map === 'sandbox'
          ? 38
          : arena.floorY - 4;

      if (Number(player.pos.y) < fallThreshold) {
        const offset = state.mode === 'join' ? 3 : 0;
        teleportPlayer(
          state.origin.x + offset,
          state.origin.y + 0.05,
          state.origin.z
        );
      }

      const now = performance.now();

      if (state.directLocal && state.game?.playerList) {
        const expected = state.mode === 'host'
          ? 1 + state.peers.size
          : state.mode === 'join'
            ? 1 + state.remotePlayers.size
            : 1;

        if (state.game.playerList.sortedPlayerData?.length !== expected) {
          syncNativePlayerList();
        }

        refreshLocalVisualMode();
        repairLocalRender();

        if (now - state.lastPlayerEntityRepair >= 500) {
          ensureLocalPlayerEntity(false);
          state.lastPlayerEntityRepair = now;
        }

        pickupNearbyLocalItems();
      }

      if (now - state.lastMoveSend >= 65) {
        const pos = relativePosition();

        if (pos) {
          if (state.mode === 'host') {
            broadcastMove({
              t: 'move',
              id: 'host',
              ...pos
            });
          } else if (state.mode === 'join') {
            sendJSON(state.hostPeer?.moveChannel, {
              t: 'move',
              id: state.localPeerId || 'guest',
              ...pos
            });
          }
        }

        state.lastMoveSend = now;
      }
    }, 25);

    state.diffInterval = setInterval(() => {
      flushPendingBlockChanges();
    }, 80);

    state.peerFrame = requestAnimationFrame(updatePeerMarker);
  }

  async function handleCommand(command) {
    const action = String(command?.action || '');

    if (action !== 'status') {
      log(`command: ${action}`, command && action === 'create-world' ? `(worldName=${command.worldName || 'default'})` : '');
    }

    if (action === 'status') {
      emitState();
      return;
    }

    if (action === 'create-world') {
      await createWorldServer(command.worldName);
      return;
    }

    if (action === 'join-server') {
      await joinWorldServer(command.address);
      return;
    }

    if (action === 'refresh-servers') {
      await pollGlobalRegistry();
      emitState();
      return;
    }

    if (action === 'start-single') {
      await startWorld(command.map, 'single', 0, {
        forceDirect: true,
        worldName: 'Local Sandbox',
        role: 'owner'
      });
      return;
    }

    if (action === 'stop') {
      stopWorld(true, true);
    }

    if (action === 'chat') {
      const text = String(command?.text || '');
      sendLocalChat(text);
      return;
    }

    if (action === 'set-mode') {
      setLocalGamemode(command?.mode);
      return;
    }

    if (action === 'set-hardcore') {
      setLocalHardcore(command?.enabled !== false);
      return;
    }
  }

  function onCommand(event) {
    let command = event.detail;

    if (typeof command === 'string') {
      try {
        command = JSON.parse(command);
      } catch (_) {
        return;
      }
    }

    handleCommand(command || {});
  }

  document.addEventListener(COMMAND_EVENT, onCommand);

  window.addEventListener('pagehide', () => {
    state.destroyed = true;
    stopLoops();
    closeP2P();
    restoreNetwork();
  }, { once: true });

  globalThis.__MINIFEATHER_LOCAL_GAMES__ = {
    state,
    get active() {
      return state.active && state.directLocal;
    },
    get game() {
      return state.game;
    },
    startSandbox() {
      return startWorld('sandbox', 'single', 0, {
        forceDirect: true,
        worldName: 'Local Sandbox',
        role: 'owner'
      });
    },
    startSpleef() {
      return startWorld('spleef', 'single', 0, {
        forceDirect: true,
        worldName: 'Local Spleef',
        role: 'owner'
      });
    },
    stop() {
      stopWorld(true);
    },
    setGamemode(mode) {
      return setLocalGamemode(mode);
    },
    toggleFlight(force = null) {
      return toggleLocalFlight(force);
    },
    heal() {
      return healLocalPlayer();
    },
    spawn() {
      return teleportToLocalSpawn();
    },
    teleport(x, y, z) {
      return teleportLocal(x, y, z);
    },
    getPlayers() {
      return Array.from(
        state.game?.playerList?.sortedPlayerData || []
      ).map(entry => ({ ...entry }));
    },
    syncPlayerList() {
      return syncNativePlayerList();
    },
    sendChat(text) {
      return sendLocalChat(text);
    },
    runServerCommand(command, args = []) {
      return runServerCommand(command, args);
    },
    getSavedServers() {
      if (!state.savedServers.length) loadSavedServers();
      return state.savedServers.map(entry => ({ ...entry }));
    },
    refreshServers() {
      return pollGlobalRegistry();
    },
    createWorld(name) {
      return createWorldServer(name);
    },
    joinWorld(address) {
      return joinWorldServer(address);
    },
    getServerAddress() {
      return state.serverAddress;
    },
    ensurePlayer(forceRecreate = true) {
      return ensureLocalPlayerEntity(forceRecreate);
    },
    getDropStats() {
      return { ...(state.dropStats || {}) };
    },
    renderProbe(logResult = true) {
      return localRenderProbe(logResult);
    },
    repairRender() {
      const game = state.game;
      const tick = repairGameSceneTick(game);
      const roots = ensureNativeSceneRoots(game);
      const camera = synchronizeLocalCamera(game);
      try { game?.chunkRenderManager?.scheduleUploadDrain?.(); } catch (_) {}
      const render = repairLocalRender(true);
      const probe = localRenderProbe(true);
      return { tick, roots, camera, render, probe };
    }
  };

  loadSavedServers();
  void pollGlobalRegistry().catch(err => {
    logWarn('boot: pollGlobalRegistry falló (no crítico):', err?.message || err);
  });
  startGlobalServiceLoop();
  emitState();

  if (LOG_LEVEL >= 1) {
    console.log(`${LOG_PREFIX} módulo cargado (logging ACTIVO, nivel ${LOG_LEVEL === 2 ? 'trace' : 'info'}). API: window.__MINIFEATHER_LOCAL_GAMES__`);
  }
})();
