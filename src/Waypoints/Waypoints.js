(function () {
  'use strict';

  const GLOBAL_KEY = '__MINIFEATHER_WAYPOINTS__';
  const STORAGE_KEY = 'minifeather_waypoints_v2';
  const ACTIVE_KEY = 'minifeather_waypoints_v2_active';
  const LEGACY_KEY = 'minifeather_waypoints_v1';
  const CONFIG_EVENT = 'minifeather:waypoints-config';
  const CHANGED_EVENT = 'minifeather:waypoints-changed';
  const UI_REQUEST_EVENT = 'minifeather:waypoint-ui-request';
  const UI_RESPONSE_EVENT = 'minifeather:waypoint-ui-response';
  const MAX_WAYPOINTS_PER_WORLD = 150;
  const WORLD_SCAN_INTERVAL = 650;

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  const COLORS = [
    '#ff5f5f', '#ff9f43', '#ffd93d', '#6bcb77', '#4d96ff',
    '#8b5cf6', '#ec4899', '#22d3ee', '#f97316', '#a3e635'
  ];

  const WAYPOINT_ICON = '<path d="M12 2.75a6.25 6.25 0 0 0-6.25 6.25c0 4.63 6.25 12.25 6.25 12.25S18.25 13.63 18.25 9A6.25 6.25 0 0 0 12 2.75Zm0 8.9A2.65 2.65 0 1 1 12 6.35a2.65 2.65 0 0 1 0 5.3Z"/>';

  const state = {
    enabled: true,
    coordinatesEnabled: false,
    edgeIndicators: true,
    game: null,
    camera: null,
    layer: null,
    coordsHud: null,
    markers: new Map(),
    store: null,
    activeWorld: null,
    activeWaypoints: [],
    frameId: 0,
    destroyed: false,
    lastGameScan: 0,
    lastCameraScan: 0,
    lastWorldScan: 0,
    lastMarkerSyncToken: '',
    listeners: []
  };

  function safeJSON(text, fallback) {
    try {
      const value = JSON.parse(text);
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function cleanName(value) {
    return String(value ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
  }

  function cleanWorldText(value, fallback = '') {
    const text = String(value ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
    return text || fallback;
  }

  function validCoord(value) {
    const n = Number(value);
    return Number.isFinite(n) && Math.abs(n) < 30000000;
  }

  function colorForName(name) {
    let hash = 0;
    for (const char of String(name)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return COLORS[Math.abs(hash) % COLORS.length];
  }

  function sanitizeWaypoint(value) {
    if (!value || typeof value !== 'object') return null;
    if (!validCoord(value.x) || !validCoord(value.y) || !validCoord(value.z)) return null;
    const name = cleanName(value.name);
    if (!name) return null;

    return {
      id: String(value.id || `wp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      name,
      x: Math.floor(Number(value.x)),
      y: Math.floor(Number(value.y)),
      z: Math.floor(Number(value.z)),
      color: /^#[0-9a-f]{6}$/i.test(String(value.color || '')) ? String(value.color).toLowerCase() : colorForName(name),
      visible: value.visible !== false,
      showName: value.showName !== false,
      showDistance: value.showDistance !== false,
      createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : Date.now(),
      updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now()
    };
  }

  function sanitizeWorldEntry(value, key) {
    if (!value || typeof value !== 'object') return null;
    const waypoints = Array.isArray(value.waypoints)
      ? value.waypoints.map(sanitizeWaypoint).filter(Boolean).slice(0, MAX_WAYPOINTS_PER_WORLD)
      : [];
    return {
      key: String(key || value.key || '').slice(0, 260),
      label: cleanWorldText(value.label, 'MiniBlox World'),
      dimensionId: Number.isFinite(Number(value.dimensionId)) ? Number(value.dimensionId) : 0,
      isLocal: !!value.isLocal,
      updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now(),
      waypoints
    };
  }

  function createEmptyStore() {
    return { version: 2, worlds: {} };
  }

  function loadStore() {
    const raw = safeJSON(localStorage.getItem(STORAGE_KEY), null);
    const next = createEmptyStore();
    if (raw?.version === 2 && raw.worlds && typeof raw.worlds === 'object') {
      for (const [key, entry] of Object.entries(raw.worlds)) {
        const clean = sanitizeWorldEntry(entry, key);
        if (clean?.key) next.worlds[clean.key] = clean;
      }
    }
    state.store = next;
    return next;
  }

  function getStore() {
    return state.store || loadStore();
  }

  function saveStore() {
    const store = getStore();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (_) {}
  }

  function getServerKey(game) {
    try {
      const si = game?.serverInfo;
      if (!si) return '';
      if (typeof si.serverId === 'string' && si.serverId) return cleanWorldText(si.serverId);
      const proto = Object.getPrototypeOf(si);
      const desc = proto && Object.getOwnPropertyDescriptor(proto, 'worldCacheKey');
      if (desc?.get) {
        const key = desc.get.call(si);
        if (key) return cleanWorldText(key);
      }
      return cleanWorldText(si.worldCacheKey || si.serverName || si.worldType || '');
    } catch (_) {
      return '';
    }
  }

  function getDimensionId(game) {
    try {
      const value = game?.world?.dimensionId ?? game?.dimensionId ?? 0;
      return Number.isFinite(Number(value)) ? Number(value) : 0;
    } catch (_) {
      return 0;
    }
  }

  function getLocalIdentity(game) {
    try {
      const local = globalThis.__MINIFEATHER_LOCAL_GAMES__;
      if (!local?.active) return null;
      const s = local.state || {};
      const dimensionId = getDimensionId(game || local.game);
      const address = cleanWorldText(s.serverAddress || s.roomTopic || '');
      const worldName = cleanWorldText(s.worldName, 'MiniFeather Local');
      const mode = cleanWorldText(s.mode, 'single');
      const stable = address || `${mode}:${worldName}`;
      return {
        key: `local:${stable}:dim:${dimensionId}`,
        label: worldName,
        dimensionId,
        isLocal: true
      };
    } catch (_) {
      return null;
    }
  }

  function getWorldIdentity(game = getGame()) {
    if (!game) return null;

    const local = getLocalIdentity(game);
    if (local) return local;

    const serverKey = getServerKey(game);
    if (!serverKey) return null;
    const dimensionId = getDimensionId(game);
    const serverName = cleanWorldText(
      game?.serverInfo?.serverName || game?.serverInfo?.name || game?.serverInfo?.worldType || serverKey,
      'MiniBlox World'
    );
    return {
      key: `server:${serverKey}:dim:${dimensionId}`,
      label: serverName,
      dimensionId,
      isLocal: false
    };
  }

  function writeActiveWorldMirror(world) {
    try {
      if (!world) {
        localStorage.removeItem(ACTIVE_KEY);
        return;
      }
      localStorage.setItem(ACTIVE_KEY, JSON.stringify({
        key: world.key,
        label: world.label,
        dimensionId: world.dimensionId,
        isLocal: world.isLocal
      }));
    } catch (_) {}
  }

  function ensureWorldEntry(world) {
    if (!world?.key) return null;
    const store = getStore();
    let entry = store.worlds[world.key];
    if (!entry) {
      entry = {
        key: world.key,
        label: world.label,
        dimensionId: world.dimensionId,
        isLocal: world.isLocal,
        updatedAt: Date.now(),
        waypoints: []
      };
      store.worlds[world.key] = entry;
    } else {
      entry.label = world.label || entry.label;
      entry.dimensionId = world.dimensionId;
      entry.isLocal = world.isLocal;
    }
    return entry;
  }

  function refreshActiveWorld(force = false) {
    const now = performance.now();
    if (!force && now - state.lastWorldScan < WORLD_SCAN_INTERVAL) return state.activeWorld;
    state.lastWorldScan = now;

    const world = getWorldIdentity();
    const oldKey = state.activeWorld?.key || '';
    const nextKey = world?.key || '';

    if (!force && oldKey === nextKey) return state.activeWorld;

    state.activeWorld = world;
    if (world) {
      const entry = ensureWorldEntry(world);
      state.activeWaypoints = entry?.waypoints || [];
      writeActiveWorldMirror(world);
    } else {
      state.activeWaypoints = [];
      writeActiveWorldMirror(null);
    }
    state.lastMarkerSyncToken = '';
    syncMarkers(state.activeWaypoints, true);
    emitChanged();
    return state.activeWorld;
  }

  function getActiveEntry(create = true) {
    const world = refreshActiveWorld();
    if (!world) return null;
    const store = getStore();
    return create ? ensureWorldEntry(world) : store.worlds[world.key] || null;
  }

  function emitChanged(extra = {}) {
    const world = state.activeWorld;
    const entry = world ? getStore().worlds[world.key] : null;
    document.dispatchEvent(new CustomEvent(CHANGED_EVENT, {
      detail: JSON.stringify({
        version: 2,
        world: world ? { ...world } : null,
        count: entry?.waypoints?.length || 0,
        ...extra
      })
    }));
  }

  function commitActiveEntry(entry, extra = {}) {
    if (!entry || !state.activeWorld) return;
    entry.waypoints = entry.waypoints.map(sanitizeWaypoint).filter(Boolean).slice(0, MAX_WAYPOINTS_PER_WORLD);
    entry.updatedAt = Date.now();
    state.activeWaypoints = entry.waypoints;
    saveStore();
    state.lastMarkerSyncToken = '';
    emitChanged(extra);
  }

  function getWaypoints() {
    refreshActiveWorld();
    return state.activeWaypoints.map(wp => ({ ...wp }));
  }

  function getAllWorlds() {
    const store = getStore();
    return Object.values(store.worlds)
      .map(entry => ({
        key: entry.key,
        label: entry.label,
        dimensionId: entry.dimensionId,
        isLocal: entry.isLocal,
        updatedAt: entry.updatedAt,
        count: entry.waypoints.length
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function findWaypoint(query) {
    const needle = cleanName(query).toLowerCase();
    if (!needle) return null;
    return state.activeWaypoints.find(wp => wp.id === query) ||
      state.activeWaypoints.find(wp => wp.name.toLowerCase() === needle) || null;
  }

  function isGame(value) {
    return !!(value?.player?.pos && value?.chat && typeof value.chat.submit === 'function');
  }

  function scanReactForGame() {
    const now = performance.now();
    if (state.game && isGame(state.game)) return state.game;
    if (now - state.lastGameScan < 700) return null;
    state.lastGameScan = now;

    try {
      const react = document.querySelector('#react');
      if (react) {
        for (const root of Object.values(react)) {
          const direct = root?.updateQueue?.baseState?.element?.props?.game;
          if (isGame(direct)) return direct;
        }
      }
    } catch (_) {}

    const roots = [];
    try {
      for (const el of document.querySelectorAll('*')) {
        for (const key of Object.getOwnPropertyNames(el)) {
          if (key.startsWith('__reactContainer$') || key.startsWith('__reactFiber$') || key.startsWith('__reactProps$')) {
            try { roots.push(el[key]); } catch (_) {}
          }
        }
        if (roots.length > 250) break;
      }
    } catch (_) {}

    const seen = new WeakSet();
    const queue = roots.map(root => ({ value: root, depth: 0 }));
    let checked = 0;

    while (queue.length && checked++ < 25000) {
      const { value, depth } = queue.shift();
      if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
      if (typeof value === 'object') {
        if (seen.has(value)) continue;
        seen.add(value);
      }

      try {
        if (isGame(value)) return value;
        if (isGame(value.game)) return value.game;
        if (isGame(value.pendingProps?.game)) return value.pendingProps.game;
        if (isGame(value.memoizedProps?.game)) return value.memoizedProps.game;
      } catch (_) {}

      if (depth >= 8) continue;
      let keys = [];
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

  function getGame() {
    const localGame = globalThis.__MINIFEATHER_LOCAL_GAMES__?.active
      ? globalThis.__MINIFEATHER_LOCAL_GAMES__?.game
      : null;
    if (isGame(localGame)) {
      state.game = localGame;
      return localGame;
    }
    if (isGame(state.game)) return state.game;
    const game = scanReactForGame();
    if (game) state.game = game;
    return state.game;
  }

  function getCurrentPosition() {
    const game = getGame();
    const pos = game?.player?.pos;
    if (!pos || !validCoord(pos.x) || !validCoord(pos.y) || !validCoord(pos.z)) return null;
    return {
      x: Math.floor(Number(pos.x)),
      y: Math.floor(Number(pos.y)),
      z: Math.floor(Number(pos.z))
    };
  }

  function addWaypoint(name, coords = null, options = {}) {
    refreshActiveWorld(true);
    const entry = getActiveEntry();
    if (!entry) return { ok: false, error: 'NO_WORLD' };

    const clean = cleanName(name);
    if (!clean) return { ok: false, error: 'NAME_REQUIRED' };
    if (entry.waypoints.some(wp => wp.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, error: 'DUPLICATE_NAME' };
    }
    if (entry.waypoints.length >= MAX_WAYPOINTS_PER_WORLD) return { ok: false, error: 'LIMIT_REACHED' };

    const position = coords && validCoord(coords.x) && validCoord(coords.y) && validCoord(coords.z)
      ? { x: Math.floor(Number(coords.x)), y: Math.floor(Number(coords.y)), z: Math.floor(Number(coords.z)) }
      : getCurrentPosition();
    if (!position) return { ok: false, error: 'NO_PLAYER' };

    const waypoint = sanitizeWaypoint({
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: clean,
      ...position,
      color: options.color || colorForName(clean),
      visible: options.visible !== false,
      showName: options.showName !== false,
      showDistance: options.showDistance !== false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    entry.waypoints.push(waypoint);
    commitActiveEntry(entry, { action: 'add', waypointId: waypoint.id });
    return { ok: true, waypoint: { ...waypoint }, world: { ...state.activeWorld } };
  }

  function removeWaypoint(query) {
    refreshActiveWorld();
    const entry = getActiveEntry(false);
    if (!entry) return { ok: false, error: 'NO_WORLD' };
    const waypoint = findWaypoint(query);
    if (!waypoint) return { ok: false, error: 'NOT_FOUND' };
    entry.waypoints = entry.waypoints.filter(wp => wp.id !== waypoint.id);
    commitActiveEntry(entry, { action: 'remove', waypointId: waypoint.id });
    return { ok: true, waypoint: { ...waypoint } };
  }

  function updateWaypoint(query, patch = {}) {
    refreshActiveWorld();
    const entry = getActiveEntry(false);
    if (!entry) return { ok: false, error: 'NO_WORLD' };
    const index = entry.waypoints.findIndex(wp => wp.id === query || wp.name.toLowerCase() === cleanName(query).toLowerCase());
    if (index < 0) return { ok: false, error: 'NOT_FOUND' };

    const old = entry.waypoints[index];
    const nextName = patch.name == null ? old.name : cleanName(patch.name);
    if (!nextName) return { ok: false, error: 'NAME_REQUIRED' };
    if (entry.waypoints.some((wp, i) => i !== index && wp.name.toLowerCase() === nextName.toLowerCase())) {
      return { ok: false, error: 'DUPLICATE_NAME' };
    }

    const next = sanitizeWaypoint({
      ...old,
      name: nextName,
      color: patch.color == null ? old.color : patch.color,
      visible: patch.visible == null ? old.visible : !!patch.visible,
      showName: patch.showName == null ? old.showName : !!patch.showName,
      showDistance: patch.showDistance == null ? old.showDistance : !!patch.showDistance,
      updatedAt: Date.now()
    });
    entry.waypoints[index] = next;
    commitActiveEntry(entry, { action: 'update', waypointId: next.id });
    return { ok: true, waypoint: { ...next } };
  }

  function legacyWaypoints() {
    const raw = safeJSON(localStorage.getItem(LEGACY_KEY), []);
    if (!Array.isArray(raw)) return [];
    return raw.map(sanitizeWaypoint).filter(Boolean).slice(0, MAX_WAYPOINTS_PER_WORLD);
  }

  function importLegacyToCurrentWorld() {
    refreshActiveWorld(true);
    const entry = getActiveEntry();
    if (!entry) return { ok: false, error: 'NO_WORLD' };
    const legacy = legacyWaypoints();
    if (!legacy.length) return { ok: false, error: 'NO_LEGACY' };

    let imported = 0;
    for (const old of legacy) {
      if (entry.waypoints.length >= MAX_WAYPOINTS_PER_WORLD) break;
      let name = old.name;
      let suffix = 2;
      while (entry.waypoints.some(wp => wp.name.toLowerCase() === name.toLowerCase())) {
        name = `${old.name} ${suffix++}`.slice(0, 40);
      }
      const waypoint = sanitizeWaypoint({
        ...old,
        id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${imported}`,
        name,
        updatedAt: Date.now()
      });
      entry.waypoints.push(waypoint);
      imported++;
    }
    commitActiveEntry(entry, { action: 'importLegacy', imported });
    return { ok: true, imported };
  }

  function deleteLegacyData() {
    try { localStorage.removeItem(LEGACY_KEY); } catch (_) {}
    emitChanged({ action: 'deleteLegacy' });
    return { ok: true };
  }

  function deleteWorldData(worldKey) {
    const key = String(worldKey || '');
    const store = getStore();
    if (!key || !store.worlds[key]) return { ok: false, error: 'WORLD_NOT_FOUND' };
    delete store.worlds[key];
    saveStore();
    if (state.activeWorld?.key === key) {
      const entry = ensureWorldEntry(state.activeWorld);
      state.activeWaypoints = entry.waypoints;
      state.lastMarkerSyncToken = '';
    }
    emitChanged({ action: 'deleteWorld', worldKey: key });
    return { ok: true };
  }

  function distanceTo(waypoint) {
    const game = getGame();
    const pos = game?.player?.pos;
    if (!pos || !waypoint) return null;
    const dx = Number(waypoint.x) + 0.5 - Number(pos.x);
    const dy = Number(waypoint.y) - Number(pos.y);
    const dz = Number(waypoint.z) + 0.5 - Number(pos.z);
    const distance = Math.hypot(dx, dy, dz);
    return Number.isFinite(distance) ? distance : null;
  }

  function formatDistance(value) {
    const distance = Number(value);
    if (!Number.isFinite(distance)) return '--';
    if (distance >= 1000) return `${(distance / 1000).toFixed(distance >= 10000 ? 0 : 1)}km`;
    return `${Math.round(distance)}m`;
  }

  function resolveCamera(game) {
    const now = performance.now();
    if (
      state.camera?.projectionMatrix?.elements?.length >= 16 &&
      state.camera?.matrixWorldInverse?.elements?.length >= 16 &&
      now - state.lastCameraScan < 900
    ) return state.camera;

    state.lastCameraScan = now;
    const direct = [
      game?.gameScene?.camera,
      game?.player?.game?.gameScene?.camera,
      game?.scene?.camera,
      game?.controls?.camera,
      game?.controller?.camera,
      game?.camera
    ];
    for (const camera of direct) {
      if (camera?.projectionMatrix?.elements?.length >= 16 && camera?.matrixWorldInverse?.elements?.length >= 16) {
        state.camera = camera;
        return camera;
      }
    }
    return null;
  }

  function matrixVec(matrix, x, y, z, w) {
    return {
      x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w,
      y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w,
      z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w,
      w: matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] * w
    };
  }

  function projectRaw(camera, x, y, z) {
    const view = camera?.matrixWorldInverse?.elements;
    const projection = camera?.projectionMatrix?.elements;
    if (!view || !projection) return null;

    const v = matrixVec(view, x, y, z, 1);
    const c = matrixVec(projection, v.x, v.y, v.z, v.w);
    if (![c.x, c.y, c.z, c.w].every(Number.isFinite)) return null;

    const behind = c.w <= 0.00001;
    const divisor = Math.max(Math.abs(c.w), 0.00001);
    let nx = c.x / divisor;
    let ny = c.y / divisor;
    const nz = c.z / divisor;
    if (behind) {
      nx = -nx;
      ny = -ny;
    }
    return { nx, ny, nz, behind };
  }

  function screenPoint(raw) {
    if (!raw) return null;
    return {
      x: (raw.nx * 0.5 + 0.5) * innerWidth,
      y: (-raw.ny * 0.5 + 0.5) * innerHeight,
      inside: !raw.behind && raw.nx >= -1.04 && raw.nx <= 1.04 && raw.ny >= -1.04 && raw.ny <= 1.04 && raw.nz >= -1.3 && raw.nz <= 1.3
    };
  }

  function edgePoint(raw) {
    if (!raw) return null;
    let dx = Number(raw.nx) || 0;
    let dy = -(Number(raw.ny) || 0);
    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) dy = -1;

    const margin = Math.max(42, Math.min(74, Math.min(innerWidth, innerHeight) * 0.065));
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;
    const maxX = Math.max(1, cx - margin);
    const maxY = Math.max(1, cy - margin);
    const scale = 1 / Math.max(Math.abs(dx) / maxX, Math.abs(dy) / maxY, 0.0001);
    const px = cx + dx * scale;
    const py = cy + dy * scale;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    return { x: px, y: py, angle };
  }

  function iconSvg() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${WAYPOINT_ICON}</svg>`;
  }

  function ensureStyles() {
    if (document.getElementById('mf-waypoint-runtime-style')) return;
    const style = document.createElement('style');
    style.id = 'mf-waypoint-runtime-style';
    style.textContent = `
      #mf-waypoint-layer{position:fixed;inset:0;pointer-events:none;z-index:999990;overflow:hidden;font-family:Faithful,Inter,Arial,sans-serif}
      .mf-world-waypoint{--wp-color:#8b5cf6;position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;white-space:nowrap;will-change:left,top,opacity,transform;transition:opacity .12s linear;filter:drop-shadow(0 4px 5px rgba(0,0,0,.78))}
      .mf-world-waypoint-badge{position:relative;width:32px;height:32px;border-radius:11px;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,color-mix(in srgb,var(--wp-color) 88%,#fff 12%),color-mix(in srgb,var(--wp-color) 74%,#000 26%));border:2px solid rgba(255,255,255,.92);box-shadow:0 0 0 2px rgba(0,0,0,.48),0 0 18px color-mix(in srgb,var(--wp-color) 65%,transparent),inset 0 1px 0 rgba(255,255,255,.25)}
      .mf-world-waypoint-badge:after{content:"";position:absolute;left:50%;bottom:-7px;width:11px;height:11px;transform:translateX(-50%) rotate(45deg);border-right:2px solid rgba(255,255,255,.9);border-bottom:2px solid rgba(255,255,255,.9);background:color-mix(in srgb,var(--wp-color) 78%,#000 22%);border-radius:0 0 3px 0;z-index:-1}
      .mf-world-waypoint-badge svg{width:18px;height:18px;fill:currentColor;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}
      .mf-world-waypoint-pulse{position:absolute;inset:-5px;border:1px solid color-mix(in srgb,var(--wp-color) 72%,transparent);border-radius:14px;animation:mfWaypointPulse 2.4s ease-out infinite;opacity:.6}
      @keyframes mfWaypointPulse{0%{transform:scale(.75);opacity:.62}70%,100%{transform:scale(1.45);opacity:0}}
      .mf-world-waypoint-copy{margin-top:10px;display:flex;flex-direction:column;align-items:center;gap:1px;padding:4px 8px;border-radius:8px;background:linear-gradient(180deg,rgba(8,10,15,.84),rgba(8,10,15,.67));border:1px solid rgba(255,255,255,.1);box-shadow:0 4px 14px rgba(0,0,0,.22);backdrop-filter:blur(3px)}
      .mf-world-waypoint-name{color:#fff;font-size:13px;font-weight:900;text-shadow:0 1px 2px #000;max-width:210px;overflow:hidden;text-overflow:ellipsis}
      .mf-world-waypoint-distance{color:#d9dce7;font-size:11px;font-weight:800;text-shadow:0 1px 2px #000}
      .mf-world-waypoint.edge .mf-world-waypoint-badge{width:27px;height:27px;border-radius:9px}
      .mf-world-waypoint.edge .mf-world-waypoint-badge:after,.mf-world-waypoint.edge .mf-world-waypoint-pulse{display:none}
      .mf-world-waypoint.edge .mf-world-waypoint-badge svg{width:15px;height:15px}
      .mf-world-waypoint.edge .mf-world-waypoint-copy{margin-top:5px;padding:2px 6px;background:rgba(8,10,15,.75)}
      .mf-world-waypoint.edge .mf-world-waypoint-name{display:none}
      .mf-world-waypoint-edge-arrow{display:none;position:absolute;top:-12px;left:50%;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid var(--wp-color);transform-origin:50% 21px;filter:drop-shadow(0 1px 2px #000)}
      .mf-world-waypoint.edge .mf-world-waypoint-edge-arrow{display:block}
      #mf-coordinates-hud{position:fixed;left:16px;top:150px;z-index:999989;pointer-events:none;padding:7px 10px;border-radius:9px;background:rgba(10,12,18,.8);border:1px solid rgba(255,255,255,.13);box-shadow:0 4px 16px rgba(0,0,0,.3);color:#fff;font:800 14px Faithful,Inter,Arial,sans-serif;text-shadow:0 1px 2px #000;display:none;backdrop-filter:blur(3px)}
      #mf-coordinates-hud strong{color:#c4b5fd;font-weight:900}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureLayer() {
    ensureStyles();
    if (!state.layer || !state.layer.isConnected) {
      state.layer = document.createElement('div');
      state.layer.id = 'mf-waypoint-layer';
      (document.body || document.documentElement).appendChild(state.layer);
    }
    if (!state.coordsHud || !state.coordsHud.isConnected) {
      state.coordsHud = document.createElement('div');
      state.coordsHud.id = 'mf-coordinates-hud';
      (document.body || document.documentElement).appendChild(state.coordsHud);
    }
  }

  function createMarker(waypoint) {
    const marker = document.createElement('div');
    marker.className = 'mf-world-waypoint';
    marker.dataset.waypointId = waypoint.id;
    marker.innerHTML = `
      <div class="mf-world-waypoint-badge">
        <span class="mf-world-waypoint-pulse"></span>
        <span class="mf-world-waypoint-icon"></span>
        <span class="mf-world-waypoint-edge-arrow"></span>
      </div>
      <div class="mf-world-waypoint-copy">
        <div class="mf-world-waypoint-name"></div>
        <div class="mf-world-waypoint-distance"></div>
      </div>
    `;
    state.layer.appendChild(marker);
    state.markers.set(waypoint.id, marker);
    return marker;
  }

  function syncMarkers(waypoints, force = false) {
    ensureLayer();
    const token = waypoints.map(wp => `${wp.id}:${wp.updatedAt}:${wp.visible}`).join('|');
    if (!force && token === state.lastMarkerSyncToken) return;
    state.lastMarkerSyncToken = token;

    const ids = new Set(waypoints.map(wp => wp.id));
    for (const [id, marker] of state.markers) {
      if (ids.has(id)) continue;
      marker.remove();
      state.markers.delete(id);
    }

    for (const wp of waypoints) {
      const marker = state.markers.get(wp.id) || createMarker(wp);
      marker.style.setProperty('--wp-color', wp.color);
      const iconEl = marker.querySelector('.mf-world-waypoint-icon');
      const nameEl = marker.querySelector('.mf-world-waypoint-name');
      const copyEl = marker.querySelector('.mf-world-waypoint-copy');
      if (iconEl) iconEl.innerHTML = iconSvg();
      if (nameEl) nameEl.textContent = wp.name;
      if (copyEl) copyEl.dataset.showName = wp.showName ? '1' : '0';
    }
  }

  function renderFrame() {
    if (state.destroyed) return;
    state.frameId = requestAnimationFrame(renderFrame);
    ensureLayer();

    const game = getGame();
    refreshActiveWorld();
    const pos = game?.player?.pos;

    if (state.coordinatesEnabled && pos && validCoord(pos.x) && validCoord(pos.y) && validCoord(pos.z)) {
      state.coordsHud.style.display = 'block';
      state.coordsHud.innerHTML = `<strong>XYZ</strong> ${Math.floor(Number(pos.x))} ${Math.floor(Number(pos.y))} ${Math.floor(Number(pos.z))}`;
    } else if (state.coordsHud) {
      state.coordsHud.style.display = 'none';
    }

    if (!state.enabled || !game || !pos || !state.activeWorld) {
      if (state.layer) state.layer.style.display = 'none';
      return;
    }

    const waypoints = state.activeWaypoints;
    syncMarkers(waypoints);
    const visibleWaypoints = waypoints.filter(wp => wp.visible !== false);
    state.layer.style.display = visibleWaypoints.length ? 'block' : 'none';
    if (!visibleWaypoints.length) return;

    const camera = resolveCamera(game);
    if (!camera) {
      for (const marker of state.markers.values()) marker.style.display = 'none';
      return;
    }

    const visibleIds = new Set(visibleWaypoints.map(wp => wp.id));
    for (const [id, marker] of state.markers) {
      if (!visibleIds.has(id)) marker.style.display = 'none';
    }

    for (const wp of visibleWaypoints) {
      const marker = state.markers.get(wp.id);
      if (!marker) continue;

      const raw = projectRaw(camera, wp.x + 0.5, wp.y + 1.0, wp.z + 0.5);
      const point = screenPoint(raw);
      const distance = distanceTo(wp);
      const distanceEl = marker.querySelector('.mf-world-waypoint-distance');
      const nameEl = marker.querySelector('.mf-world-waypoint-name');
      const copyEl = marker.querySelector('.mf-world-waypoint-copy');
      const arrowEl = marker.querySelector('.mf-world-waypoint-edge-arrow');

      if (distanceEl) {
        distanceEl.textContent = wp.showDistance ? formatDistance(distance) : '';
        distanceEl.style.display = wp.showDistance ? '' : 'none';
      }
      if (nameEl) nameEl.style.display = wp.showName ? '' : 'none';
      if (copyEl) copyEl.style.display = (wp.showName || wp.showDistance) ? '' : 'none';

      if (point?.inside) {
        const fade = Number.isFinite(distance) ? Math.max(.38, Math.min(1, 1.06 - Math.max(0, distance - 250) / 6000)) : 1;
        const scale = Number.isFinite(distance) ? Math.max(.72, Math.min(1, 1.08 - distance / 7000)) : 1;
        marker.classList.remove('edge');
        marker.style.display = 'flex';
        marker.style.left = `${point.x}px`;
        marker.style.top = `${point.y}px`;
        marker.style.opacity = String(fade);
        marker.style.transform = `translate(-50%,-50%) scale(${scale})`;
        if (arrowEl) arrowEl.style.transform = '';
        continue;
      }

      if (!state.edgeIndicators || !raw) {
        marker.style.display = 'none';
        continue;
      }

      const edge = edgePoint(raw);
      if (!edge) {
        marker.style.display = 'none';
        continue;
      }
      marker.classList.add('edge');
      marker.style.display = 'flex';
      marker.style.left = `${edge.x}px`;
      marker.style.top = `${edge.y}px`;
      marker.style.opacity = '.92';
      marker.style.transform = 'translate(-50%,-50%) scale(.94)';
      if (arrowEl) arrowEl.style.transform = `translateX(-50%) rotate(${edge.angle}deg)`;
    }
  }

  function parseDetail(event) {
    try {
      return typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch (_) {
      return null;
    }
  }

  function applyConfig(value) {
    if (!value || typeof value !== 'object') return;
    state.enabled = value.enabled !== false;
    state.coordinatesEnabled = !!value.coordinatesEnabled;
    if (value.edgeIndicators != null) state.edgeIndicators = value.edgeIndicators !== false;
  }

  function respondUI(requestId, result) {
    document.dispatchEvent(new CustomEvent(UI_RESPONSE_EVENT, {
      detail: JSON.stringify({ requestId, ...result })
    }));
  }

  function uiInfo() {
    refreshActiveWorld(true);
    return {
      ok: true,
      world: state.activeWorld ? { ...state.activeWorld } : null,
      waypoints: getWaypoints(),
      worlds: getAllWorlds(),
      legacyCount: legacyWaypoints().length
    };
  }

  function handleUIRequest(event) {
    const request = parseDetail(event);
    if (!request || typeof request !== 'object') return;
    const requestId = String(request.requestId || '');

    switch (request.action) {
      case 'add':
        respondUI(requestId, addWaypoint(request.name, request.coords || null, request));
        return;
      case 'remove':
        respondUI(requestId, removeWaypoint(request.id || request.name));
        return;
      case 'update':
        respondUI(requestId, updateWaypoint(request.id || request.name, request.patch || request));
        return;
      case 'list':
      case 'info':
        respondUI(requestId, uiInfo());
        return;
      case 'importLegacy':
        respondUI(requestId, importLegacyToCurrentWorld());
        return;
      case 'deleteLegacy':
        respondUI(requestId, deleteLegacyData());
        return;
      case 'deleteWorld':
        respondUI(requestId, deleteWorldData(request.worldKey));
        return;
      default:
        respondUI(requestId, { ok: false, error: 'UNKNOWN_ACTION' });
    }
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    cancelAnimationFrame(state.frameId);
    document.removeEventListener(CONFIG_EVENT, onConfig);
    document.removeEventListener(UI_REQUEST_EVENT, handleUIRequest);
    window.removeEventListener('storage', onStorage);
    state.layer?.remove();
    state.coordsHud?.remove();
    document.getElementById('mf-waypoint-runtime-style')?.remove();
    state.markers.clear();
    if (globalThis[GLOBAL_KEY]?.destroy === destroy) delete globalThis[GLOBAL_KEY];
  }

  function onConfig(event) {
    applyConfig(parseDetail(event));
  }

  function onStorage(event) {
    if (event.key !== STORAGE_KEY) return;
    loadStore();
    refreshActiveWorld(true);
  }

  document.addEventListener(CONFIG_EVENT, onConfig);
  document.addEventListener(UI_REQUEST_EVENT, handleUIRequest);
  window.addEventListener('storage', onStorage);

  const API = {
    get enabled() { return state.enabled; },
    get coordinatesEnabled() { return state.coordinatesEnabled; },
    get game() { return getGame(); },
    get activeWorld() { return state.activeWorld ? { ...state.activeWorld } : null; },
    getCurrentPosition,
    getWorldIdentity,
    getWaypoints,
    getAllWorlds,
    findWaypoint,
    addWaypoint,
    updateWaypoint,
    removeWaypoint,
    importLegacyToCurrentWorld,
    deleteLegacyData,
    distanceTo,
    formatDistance,
    setConfig: applyConfig,
    destroy
  };

  globalThis[GLOBAL_KEY] = API;
  loadStore();
  ensureLayer();
  renderFrame();
})();
