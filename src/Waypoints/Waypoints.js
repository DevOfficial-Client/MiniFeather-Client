(function () {
  'use strict';

  const GLOBAL_KEY = '__MINIFEATHER_WAYPOINTS__';
  const STORAGE_KEY = 'minifeather_waypoints_v1';
  const CONFIG_EVENT = 'minifeather:waypoints-config';
  const CHANGED_EVENT = 'minifeather:waypoints-changed';
  const UI_REQUEST_EVENT = 'minifeather:waypoint-ui-request';
  const UI_RESPONSE_EVENT = 'minifeather:waypoint-ui-response';
  const MAX_WAYPOINTS = 100;

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  const COLORS = [
    '#ff5f5f', '#ff9f43', '#ffd93d', '#6bcb77', '#4d96ff',
    '#8b5cf6', '#ec4899', '#22d3ee', '#f97316', '#a3e635'
  ];

  const state = {
    enabled: true,
    coordinatesEnabled: false,
    game: null,
    camera: null,
    layer: null,
    coordsHud: null,
    markers: new Map(),
    frameId: 0,
    scanTimer: 0,
    destroyed: false,
    lastGameScan: 0,
    lastCameraScan: 0
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

  function validCoord(value) {
    const n = Number(value);
    return Number.isFinite(n) && Math.abs(n) < 30000000;
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
      color: /^#[0-9a-f]{6}$/i.test(String(value.color || '')) ? String(value.color) : colorForName(name),
      createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : Date.now()
    };
  }

  function colorForName(name) {
    let hash = 0;
    for (const char of String(name)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return COLORS[Math.abs(hash) % COLORS.length];
  }

  function loadWaypoints() {
    const raw = safeJSON(localStorage.getItem(STORAGE_KEY), []);
    if (!Array.isArray(raw)) return [];
    return raw.map(sanitizeWaypoint).filter(Boolean).slice(0, MAX_WAYPOINTS);
  }

  function saveWaypoints(list) {
    const clean = Array.isArray(list)
      ? list.map(sanitizeWaypoint).filter(Boolean).slice(0, MAX_WAYPOINTS)
      : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    document.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: JSON.stringify(clean) }));
    return clean;
  }

  function getWaypoints() {
    return loadWaypoints();
  }

  function findWaypoint(query) {
    const needle = cleanName(query).toLowerCase();
    if (!needle) return null;
    const list = loadWaypoints();
    return list.find(wp => wp.id === query) || list.find(wp => wp.name.toLowerCase() === needle) || null;
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
            try {
              roots.push(el[key]);
            } catch (_) {}
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
      try {
        keys = Reflect.ownKeys(value);
      } catch (_) {
        continue;
      }

      for (const key of keys) {
        if (key === 'ownerDocument' || key === 'parentNode' || key === 'parentElement') continue;
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

  function getGame() {
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

  function addWaypoint(name, coords = null) {
    const clean = cleanName(name);
    if (!clean) return { ok: false, error: 'NAME_REQUIRED' };

    const list = loadWaypoints();
    if (list.some(wp => wp.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, error: 'DUPLICATE_NAME' };
    }
    if (list.length >= MAX_WAYPOINTS) return { ok: false, error: 'LIMIT_REACHED' };

    const position = coords && validCoord(coords.x) && validCoord(coords.y) && validCoord(coords.z)
      ? { x: Math.floor(Number(coords.x)), y: Math.floor(Number(coords.y)), z: Math.floor(Number(coords.z)) }
      : getCurrentPosition();

    if (!position) return { ok: false, error: 'NO_PLAYER' };

    const waypoint = sanitizeWaypoint({
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: clean,
      ...position,
      color: colorForName(clean),
      createdAt: Date.now()
    });

    list.push(waypoint);
    saveWaypoints(list);
    return { ok: true, waypoint };
  }

  function removeWaypoint(query) {
    const waypoint = findWaypoint(query);
    if (!waypoint) return { ok: false, error: 'NOT_FOUND' };
    const list = loadWaypoints().filter(wp => wp.id !== waypoint.id);
    saveWaypoints(list);
    return { ok: true, waypoint };
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
    if (![nx, ny, nz].every(Number.isFinite) || nz < -1.25 || nz > 1.25) return null;

    return {
      x: (nx * 0.5 + 0.5) * innerWidth,
      y: (-ny * 0.5 + 0.5) * innerHeight,
      inside: nx >= -1.06 && nx <= 1.06 && ny >= -1.06 && ny <= 1.06
    };
  }

  function initials(name) {
    const parts = cleanName(name).split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function ensureStyles() {
    if (document.getElementById('mf-waypoint-runtime-style')) return;
    const style = document.createElement('style');
    style.id = 'mf-waypoint-runtime-style';
    style.textContent = `
      #mf-waypoint-layer{position:fixed;inset:0;pointer-events:none;z-index:999990;overflow:hidden;font-family:Faithful,Inter,Arial,sans-serif}
      .mf-world-waypoint{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 3px rgba(0,0,0,.9));white-space:nowrap;will-change:left,top;}
      .mf-world-waypoint-icon{width:22px;height:22px;transform:rotate(45deg);border:2px solid rgba(255,255,255,.95);border-radius:3px;display:grid;place-items:center;box-shadow:0 0 0 2px rgba(0,0,0,.45),0 0 12px color-mix(in srgb,var(--wp-color) 55%,transparent);background:var(--wp-color)}
      .mf-world-waypoint-initials{transform:rotate(-45deg);font-size:9px;font-weight:900;color:#fff;text-shadow:0 1px 2px #000;letter-spacing:-.5px}
      .mf-world-waypoint-name{margin-top:7px;padding:2px 6px;border-radius:5px;background:rgba(8,10,15,.72);color:#fff;font-size:13px;font-weight:800;text-shadow:0 1px 2px #000}
      .mf-world-waypoint-distance{margin-top:2px;color:#e6e8ee;font-size:11px;font-weight:700;text-shadow:0 1px 2px #000}
      #mf-coordinates-hud{position:fixed;left:16px;top:150px;z-index:999989;pointer-events:none;padding:6px 9px;border-radius:7px;background:rgba(10,12,18,.78);border:1px solid rgba(255,255,255,.13);box-shadow:0 4px 16px rgba(0,0,0,.3);color:#fff;font:800 14px Faithful,Inter,Arial,sans-serif;text-shadow:0 1px 2px #000;display:none}
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
      <div class="mf-world-waypoint-icon"><span class="mf-world-waypoint-initials"></span></div>
      <div class="mf-world-waypoint-name"></div>
      <div class="mf-world-waypoint-distance"></div>
    `;
    state.layer.appendChild(marker);
    state.markers.set(waypoint.id, marker);
    return marker;
  }

  function syncMarkers(waypoints) {
    const ids = new Set(waypoints.map(wp => wp.id));
    for (const [id, marker] of state.markers) {
      if (ids.has(id)) continue;
      marker.remove();
      state.markers.delete(id);
    }

    for (const wp of waypoints) {
      const marker = state.markers.get(wp.id) || createMarker(wp);
      marker.style.setProperty('--wp-color', wp.color);
      const initialEl = marker.querySelector('.mf-world-waypoint-initials');
      const nameEl = marker.querySelector('.mf-world-waypoint-name');
      if (initialEl) initialEl.textContent = initials(wp.name);
      if (nameEl) nameEl.textContent = wp.name;
    }
  }

  function renderFrame() {
    if (state.destroyed) return;
    state.frameId = requestAnimationFrame(renderFrame);
    ensureLayer();

    const game = getGame();
    const pos = game?.player?.pos;

    if (state.coordinatesEnabled && pos && validCoord(pos.x) && validCoord(pos.y) && validCoord(pos.z)) {
      state.coordsHud.style.display = 'block';
      state.coordsHud.innerHTML = `<strong>XYZ</strong> ${Math.floor(Number(pos.x))} ${Math.floor(Number(pos.y))} ${Math.floor(Number(pos.z))}`;
    } else if (state.coordsHud) {
      state.coordsHud.style.display = 'none';
    }

    if (!state.enabled || !game || !pos) {
      if (state.layer) state.layer.style.display = 'none';
      return;
    }

    const waypoints = loadWaypoints();
    syncMarkers(waypoints);
    state.layer.style.display = waypoints.length ? 'block' : 'none';
    if (!waypoints.length) return;

    const camera = resolveCamera(game);
    if (!camera) {
      for (const marker of state.markers.values()) marker.style.display = 'none';
      return;
    }

    for (const wp of waypoints) {
      const marker = state.markers.get(wp.id);
      if (!marker) continue;
      const point = project(camera, wp.x + 0.5, wp.y + 1.0, wp.z + 0.5);
      if (!point || !point.inside) {
        marker.style.display = 'none';
        continue;
      }

      const distance = distanceTo(wp);
      marker.style.display = 'flex';
      marker.style.left = `${point.x}px`;
      marker.style.top = `${point.y}px`;
      const distanceEl = marker.querySelector('.mf-world-waypoint-distance');
      if (distanceEl) distanceEl.textContent = formatDistance(distance);
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
  }

  function respondUI(requestId, result) {
    document.dispatchEvent(new CustomEvent(UI_RESPONSE_EVENT, {
      detail: JSON.stringify({ requestId, ...result })
    }));
  }

  function handleUIRequest(event) {
    const request = parseDetail(event);
    if (!request || typeof request !== 'object') return;
    const requestId = String(request.requestId || '');

    if (request.action === 'add') {
      respondUI(requestId, addWaypoint(request.name));
      return;
    }
    if (request.action === 'remove') {
      respondUI(requestId, removeWaypoint(request.id || request.name));
      return;
    }
    if (request.action === 'list') {
      respondUI(requestId, { ok: true, waypoints: getWaypoints() });
    }
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    cancelAnimationFrame(state.frameId);
    clearInterval(state.scanTimer);
    document.removeEventListener(CONFIG_EVENT, onConfig);
    document.removeEventListener(UI_REQUEST_EVENT, handleUIRequest);
    state.layer?.remove();
    state.coordsHud?.remove();
    document.getElementById('mf-waypoint-runtime-style')?.remove();
    state.markers.clear();
    if (globalThis[GLOBAL_KEY]?.destroy === destroy) delete globalThis[GLOBAL_KEY];
  }

  function onConfig(event) {
    applyConfig(parseDetail(event));
  }

  document.addEventListener(CONFIG_EVENT, onConfig);
  document.addEventListener(UI_REQUEST_EVENT, handleUIRequest);

  const API = {
    get enabled() { return state.enabled; },
    get coordinatesEnabled() { return state.coordinatesEnabled; },
    get game() { return getGame(); },
    getCurrentPosition,
    getWaypoints,
    findWaypoint,
    addWaypoint,
    removeWaypoint,
    distanceTo,
    formatDistance,
    setConfig: applyConfig,
    destroy
  };

  globalThis[GLOBAL_KEY] = API;
  ensureLayer();
  renderFrame();
})();
