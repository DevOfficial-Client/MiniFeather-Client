(() => {
  'use strict';

  const W = globalThis;
  const EVENT_NAME = 'minifeather:grass-flowers-config';
  const TAG = '[MiniFeather Grass Flowers]';
  const REGION_RADIUS = 2; // 5x5 chunks around the player.
  const REFRESH_MS = 9000;
  const SURFACE_EPSILON = 0.0047; // Matches the source pack's 16.075/16 top decal offset.

  // Unmodified PNG bytes from "Simple Grass Flowers v2.0.0" by 2DWisp.
  // License/attribution is documented in docs/experimental.md.
  const DECALS = [
    { id: 'flower-small', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAGamlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNy4xLWMwMDAgNzkuYTg3MzFiOSwgMjAyMS8wOS8wOS0wMDozNzozOCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDIzLjAgKFdpbmRvd3MpIiB4bXA6Q3JlYXRlRGF0ZT0iMjAyMS0xMS0xNVQxNToxNDowNFoiIHhtcDpNb2RpZnlEYXRlPSIyMDIxLTExLTE2VDE2OjE5OjQ1WiIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyMS0xMS0xNlQxNjoxOTo0NVoiIGRjOmZvcm1hdD0iaW1hZ2UvcG5nIiBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjQ0ZjI0YzUxLWU3ZWMtYmM0My05MWEzLWZiODM0OWQwYzcwZiIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo1Njk4NWZiOS1jNWY5LTk4NDEtYTEwNC0wODg4YmY1YmYwYzciIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDo1Njk4NWZiOS1jNWY5LTk4NDEtYTEwNC0wODg4YmY1YmYwYzciPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjU2OTg1ZmI5LWM1ZjktOTg0MS1hMTA0LTA4ODhiZjViZjBjNyIgc3RFdnQ6d2hlbj0iMjAyMS0xMS0xNVQxNToxNDowNFoiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyMy4wIChXaW5kb3dzKSIvPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0ic2F2ZWQiIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6OWQ4YWVmOWYtZDQzNi05MzQ5LWE0NzktMmZmMjUyM2E3OTc0IiBzdEV2dDp3aGVuPSIyMDIxLTExLTE1VDE1OjE0OjIyWiIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDIzLjAgKFdpbmRvd3MpIiBzdEV2dDpjaGFuZ2VkPSIvIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDo0NGYyNGM1MS1lN2VjLWJjNDMtOTFhMy1mYjgzNDlkMGM3MGYiIHN0RXZ0OndoZW49IjIwMjEtMTEtMTZUMTY6MTk6NDVaIiBzdEV2dDpzb2Z0d2FyZUFnZW50PSJBZG9iZSBQaG90b3Nob3AgMjMuMCAoV2luZG93cykiIHN0RXZ0OmNoYW5nZWQ9Ii8iLz4gPC9yZGY6U2VxPiA8L3htcE1NOkhpc3Rvcnk+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+XhKuQQAAAHdJREFUOBFj+P//PwMlmIGuBlx78YLh+/fv/0E0XgOAilAwkvj/3wccQAb8J2gAzEZk26EYvwuQbUU3ANkgrAYgOxvJRnQX4DcAXSE2jDMWSNWMNQyQFeJyEV4XIMczPi/hCgN4PGMLTIIGIMczsWHBMLQyEzYMABAL639PsjzmAAAAAElFTkSuQmCC' },
    { id: 'flower-big', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAG+mlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNy4xLWMwMDAgNzkuYTg3MzFiOSwgMjAyMS8wOS8wOS0wMDozNzozOCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDIzLjAgKFdpbmRvd3MpIiB4bXA6Q3JlYXRlRGF0ZT0iMjAyMS0xMS0xNVQxNToxNDowNFoiIHhtcDpNb2RpZnlEYXRlPSIyMDIxLTExLTE2VDE2OjIwOjAxWiIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyMS0xMS0xNlQxNjoyMDowMVoiIGRjOmZvcm1hdD0iaW1hZ2UvcG5nIiBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOmM0YWQ2ZmUxLWE2YmYtMzU0My05OTMwLTFlMjIyMmZlYmU4MSIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo1Njk4NWZiOS1jNWY5LTk4NDEtYTEwNC0wODg4YmY1YmYwYzciIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDo1Njk4NWZiOS1jNWY5LTk4NDEtYTEwNC0wODg4YmY1YmYwYzciPiA8cGhvdG9zaG9wOkRvY3VtZW50QW5jZXN0b3JzPiA8cmRmOkJhZz4gPHJkZjpsaT54bXAuZGlkOjU2OTg1ZmI5LWM1ZjktOTg0MS1hMTA0LTA4ODhiZjViZjBjNzwvcmRmOmxpPiA8L3JkZjpCYWc+IDwvcGhvdG9zaG9wOkRvY3VtZW50QW5jZXN0b3JzPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjU2OTg1ZmI5LWM1ZjktOTg0MS1hMTA0LTA4ODhiZjViZjBjNyIgc3RFdnQ6d2hlbj0iMjAyMS0xMS0xNVQxNToxNDowNFoiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyMy4wIChXaW5kb3dzKSIvPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0ic2F2ZWQiIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6OWQ4YWVmOWYtZDQzNi05MzQ5LWE0NzktMmZmMjUyM2E3OTc0IiBzdEV2dDp3aGVuPSIyMDIxLTExLTE1VDE1OjE0OjIyWiIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDIzLjAgKFdpbmRvd3MpIiBzdEV2dDpjaGFuZ2VkPSIvIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpjNGFkNmZlMS1hNmJmLTM1NDMtOTkzMC0xZTIyMjJmZWJlODEiIHN0RXZ0OndoZW49IjIwMjEtMTEtMTZUMTY6MjA6MDFaIiBzdEV2dDpzb2Z0d2FyZUFnZW50PSJBZG9iZSBQaG90b3Nob3AgMjMuMCAoV2luZG93cykiIHN0RXZ0OmNoYW5nZWQ9Ii8iLz4gPC9yZGY6U2VxPiA8L3htcE1NOkhpc3Rvcnk+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+c8lIcgAAAGxJREFUOBFj+P//PwMlmIEqBnz//h2Mt5y/9B9I/4fSDPgwVgNAmn8fcPh/7cULFAPQ+VAx7C4AKSbGBVgNIAVTasB/SgyAhxOyAf9JdP7/AQ8DggZQFI1YExNeA5AxSAIWSDgwXI56mYkSDABdRPhFy58KuwAAAABJRU5ErkJggg==' },
    { id: 'rock', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAG+mlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNy4xLWMwMDAgNzkuYTg3MzFiOSwgMjAyMS8wOS8wOS0wMDozNzozOCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDIzLjAgKFdpbmRvd3MpIiB4bXA6Q3JlYXRlRGF0ZT0iMjAyMS0xMS0xNVQxNToxNDowNFoiIHhtcDpNb2RpZnlEYXRlPSIyMDIxLTExLTE2VDE3OjM1OjQwWiIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyMS0xMS0xNlQxNzozNTo0MFoiIGRjOmZvcm1hdD0iaW1hZ2UvcG5nIiBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjVjNGI4ZjY1LTk2M2ItZWI0OC05OGE4LTdlMDA5NzZiOTFkOCIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo1Njk4NWZiOS1jNWY5LTk4NDEtYTEwNC0wODg4YmY1YmYwYzciIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDo1Njk4NWZiOS1jNWY5LTk4NDEtYTEwNC0wODg4YmY1YmYwYzciPiA8cGhvdG9zaG9wOkRvY3VtZW50QW5jZXN0b3JzPiA8cmRmOkJhZz4gPHJkZjpsaT54bXAuZGlkOjU2OTg1ZmI5LWM1ZjktOTg0MS1hMTA0LTA4ODhiZjViZjBjNzwvcmRmOmxpPiA8L3JkZjpCYWc+IDwvcGhvdG9zaG9wOkRvY3VtZW50QW5jZXN0b3JzPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjU2OTg1ZmI5LWM1ZjktOTg0MS1hMTA0LTA4ODhiZjViZjBjNyIgc3RFdnQ6d2hlbj0iMjAyMS0xMS0xNVQxNToxNDowNFoiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyMy4wIChXaW5kb3dzKSIvPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0ic2F2ZWQiIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6OWQ4YWVmOWYtZDQzNi05MzQ5LWE0NzktMmZmMjUyM2E3OTc0IiBzdEV2dDp3aGVuPSIyMDIxLTExLTE1VDE1OjE0OjIyWiIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDIzLjAgKFdpbmRvd3MpIiBzdEV2dDpjaGFuZ2VkPSIvIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDo1YzRiOGY2NS05NjNiLWViNDgtOThhOC03ZTAwOTc2YjkxZDgiIHN0RXZ0OndoZW49IjIwMjEtMTEtMTZUMTc6MzU6NDBaIiBzdEV2dDpzb2Z0d2FyZUFnZW50PSJBZG9iZSBQaG90b3Nob3AgMjMuMCAoV2luZG93cykiIHN0RXZ0OmNoYW5nZWQ9Ii8iLz4gPC9yZGY6U2VxPiA8L3htcE1NOkhpc3Rvcnk+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+SYqHbgAAAFxJREFUOBFj+P//PwMlmIFqBsyZOec/DJNlQH19/f/uzm4wJtsAmCFoYuSHAUgzyQaAXACymWwDsnKz/leUVfynfzQODQOgCY0iAxgoNgAUzcixRLKfYSmWaoEIAH1i6Oz9dIJrAAAAAElFTkSuQmCC' }
  ];

  try { W.MF_GrassFlowersExperimental?.destroy?.(); } catch (_) {}

  const state = {
    enabled: false,
    destroyed: false,
    game: null,
    world: null,
    scene: null,
    referenceMesh: null,
    materials: [],
    textures: [],
    bundle: [],
    stateNameCache: new Map(),
    centerCx: Number.NaN,
    centerCz: Number.NaN,
    buildToken: 0,
    building: false,
    scanTimer: 0,
    lastRefresh: 0,
    lastGameScan: 0,
    serverSalt: 0
  };

  function findGame(force = false) {
    const now = performance.now();
    if (!force && state.game?.player && state.game?.world && now - state.lastGameScan < 1200) return state.game;
    state.lastGameScan = now;

    for (const candidate of [W.miniblox, W.__MINIBLOX_GAME__, state.game]) {
      if (candidate?.player && candidate?.world) {
        state.game = candidate;
        return candidate;
      }
    }

    try {
      const react = document.querySelector('#react');
      if (react) {
        for (const value of Object.values(react)) {
          const game = value?.updateQueue?.baseState?.element?.props?.game;
          if (game?.player && game?.world) {
            W.__MINIBLOX_GAME__ = game;
            state.game = game;
            return game;
          }
        }
      }
    } catch (_) {}

    return null;
  }

  function getScene(game) {
    return game?.gameScene?.scene || game?.scene?.scene || game?.gameScene || game?.scene || null;
  }

  function getWorldProto(world) {
    let proto = Object.getPrototypeOf(world);
    for (let i = 0; i < 6 && proto; i++, proto = Object.getPrototypeOf(proto)) {
      if (typeof proto.getChunkByID === 'function') return proto;
    }
    return null;
  }

  function hashString(text) {
    let h = 2166136261 >>> 0;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function computeServerSalt(game) {
    let key = '';
    try {
      key = game?.serverInfo?.serverId || game?.serverInfo?.serverName || game?.serverInfo?.worldType || '';
    } catch (_) {}
    try { key += `|${game?.world?.dimensionId ?? 0}`; } catch (_) {}
    return hashString(key || 'miniblox');
  }

  function hashXZ(x, z) {
    let h = state.serverSalt ^ Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(z | 0, 0x119de1f3);
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return h >>> 0;
  }

  // Reproduces only the transparent decorative variants of the source pack.
  // Pack weights: 16/588 small flower, 8/588 big flower, 4/588 rock.
  function pickDecal(x, z) {
    const h = hashXZ(x, z);
    const r = h / 4294967296;
    if (r < 16 / 588) return { type: 0, rot: (h >>> 8) & 3 };
    if (r < 24 / 588) return { type: 1, rot: (h >>> 8) & 3 };
    if (r < 28 / 588) return { type: 2, rot: (h >>> 8) & 3 };
    return null;
  }

  function findReferenceMesh(scene) {
    if (state.referenceMesh?.geometry?.attributes?.position && state.referenceMesh?.material) return state.referenceMesh;
    if (!scene?.traverse) return null;

    const rank = { MeshLambertMaterial: 0, MeshBasicMaterial: 1, MeshStandardMaterial: 2, MeshPhongMaterial: 3 };
    let best = null;
    let bestRank = 99;

    try {
      scene.traverse(obj => {
        if (!obj?.isMesh || !obj.geometry?.attributes?.position || !obj.geometry?.attributes?.uv) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          const type = mat?.type || mat?.constructor?.name || '';
          const r = rank[type];
          if (r === undefined || r >= bestRank || !mat?.map) continue;
          best = { mesh: obj, material: mat };
          bestRank = r;
        }
      });
    } catch (_) {}

    state.referenceMesh = best?.mesh || null;
    if (best) state.referenceMesh.__mfGrassTemplateMaterial = best.material;
    return state.referenceMesh;
  }

  async function loadImage(src) {
    // Decode locally from the embedded original PNG bytes. This avoids any
    // network request and does not depend on the page's img-src CSP.
    try {
      if (typeof createImageBitmap === 'function') {
        const b64 = String(src).split(',')[1] || '';
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'image/png' });
        return await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
      }
    } catch (_) {}

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not decode grass detail texture'));
      image.src = src;
    });
  }

  function copyTextureSettings(source, texture) {
    if (!source || !texture) return;
    for (const key of ['wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'colorSpace', 'encoding', 'premultiplyAlpha', 'unpackAlignment']) {
      try { if (source[key] !== undefined) texture[key] = source[key]; } catch (_) {}
    }
    try { texture.flipY = source.flipY; } catch (_) {}
    try { texture.generateMipmaps = source.generateMipmaps; } catch (_) {}
  }

  function createMaterial(source, texture) {
    let material = null;
    try { material = new source.constructor(); } catch (_) {
      try { material = source.clone(); } catch (_) {}
    }
    if (!material) return null;

    try {
      material.map = texture;
      material.alphaMap = null;
      material.aoMap = null;
      material.lightMap = null;
      material.normalMap = null;
      material.bumpMap = null;
      material.displacementMap = null;
      material.emissiveMap = null;
      material.metalnessMap = null;
      material.roughnessMap = null;
      material.vertexColors = false;
      material.transparent = true;
      material.opacity = 1;
      material.alphaTest = 0.10;
      material.depthTest = true;
      material.depthWrite = false;
      material.side = 2;
      material.fog = true;
      material.toneMapped = source.toneMapped !== false;
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
      if ('roughness' in material) material.roughness = 1;
      if ('metalness' in material) material.metalness = 0;
      material.color?.set?.(0xffffff);
      material.emissive?.set?.(0x000000);
      // Do not inherit terrain/player shader hooks. These are plain visual decals.
      material.onBeforeCompile = function() {};
      material.customProgramCacheKey = () => 'mf-grass-flowers-v1';
      material.needsUpdate = true;
    } catch (_) {}
    return material;
  }

  async function ensureResources(scene) {
    if (state.materials.length === DECALS.length && state.textures.length === DECALS.length && state.referenceMesh) return true;
    const ref = findReferenceMesh(scene);
    const source = ref?.__mfGrassTemplateMaterial || (Array.isArray(ref?.material) ? ref.material[0] : ref?.material);
    const sourceMap = source?.map;
    if (!ref || !source || !sourceMap || typeof sourceMap.constructor !== 'function') return false;

    try {
      const images = await Promise.all(DECALS.map(d => loadImage(d.data)));
      const textures = [];
      const materials = [];
      for (const image of images) {
        const texture = new sourceMap.constructor(image);
        copyTextureSettings(sourceMap, texture);
        try {
          if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) texture.flipY = false;
        } catch (_) {}
        texture.needsUpdate = true;
        const material = createMaterial(source, texture);
        if (!material) throw new Error('No compatible Three.js material');
        textures.push(texture);
        materials.push(material);
      }
      state.textures = textures;
      state.materials = materials;
      return true;
    } catch (err) {
      console.warn(TAG, 'No se pudieron preparar las texturas decorativas:', err);
      return false;
    }
  }

  function clearBundle() {
    for (const record of state.bundle) {
      try { record.mesh?.removeFromParent?.(); } catch (_) {}
      try { record.geometry?.dispose?.(); } catch (_) {}
    }
    state.bundle = [];
  }

  function disposeResources() {
    clearBundle();
    for (const material of state.materials) { try { material?.dispose?.(); } catch (_) {} }
    for (const texture of state.textures) { try { texture?.dispose?.(); } catch (_) {} }
    state.materials = [];
    state.textures = [];
    state.referenceMesh = null;
  }

  function blockNameAt(chunk, stateId, wx, y, wz) {
    if (state.stateNameCache.has(stateId)) return state.stateNameCache.get(stateId);
    let name = '';
    try {
      const bs = chunk.getBlockState?.({ x: wx, y, z: wz });
      name = String(bs?.getBlock?.()?.name || bs?.block?.name || '').toLowerCase();
    } catch (_) {}
    if (state.stateNameCache.size < 2048) state.stateNameCache.set(stateId, name);
    return name;
  }

  function scanChunk(world, proto, cx, cz, buckets) {
    let chunk = null;
    try {
      if (typeof proto.isChunkLoaded === 'function' && !proto.isChunkLoaded.call(world, cx, cz)) return;
      chunk = proto.getChunkByID.call(world, cx, cz);
    } catch (_) { return; }
    if (!chunk?.cells) return;

    for (let lx = 0; lx < 16; lx++) {
      for (let lz = 0; lz < 16; lz++) {
        let topY = -1;
        let topStateId = 0;

        for (let ci = chunk.cells.length - 1; ci >= 0; ci--) {
          const cell = chunk.cells[ci];
          if (!cell?.bitArray) continue;
          const yBase = Number(cell.yBase) || 0;

          for (let ly = 15; ly >= 0; ly--) {
            const realY = yBase + ly;
            if (realY < 0) break;
            const blockIndex = (ly << 8) | (lz << 4) | lx;
            let raw = 0;
            try { raw = cell.bitArray.get(blockIndex); } catch (_) { continue; }
            const id = cell.palette?.length ? cell.palette[raw] : raw;
            if (id !== 0) {
              topY = realY;
              topStateId = Number(id) || 0;
              break;
            }
          }
          if (topY >= 0) break;
        }

        if (topY < 0 || !topStateId) continue;
        const wx = cx * 16 + lx;
        const wz = cz * 16 + lz;
        const name = blockNameAt(chunk, topStateId, wx, topY, wz);
        if (name !== 'grass_block') continue;

        const decal = pickDecal(wx, wz);
        if (!decal) continue;
        buckets[decal.type].push({ x: wx, y: topY + 1 + SURFACE_EPSILON, z: wz, rot: decal.rot });
      }
    }
  }

  function uvForRotation(rot) {
    const base = [[0, 1], [1, 1], [0, 0], [1, 0]];
    if ((rot & 3) === 0) return base;
    if ((rot & 3) === 1) return [[0,0],[0,1],[1,0],[1,1]];
    if ((rot & 3) === 2) return [[1,0],[0,0],[1,1],[0,1]];
    return [[1,1],[1,0],[0,1],[0,0]];
  }

  function buildGeometry(referenceGeometry, decals) {
    if (!referenceGeometry?.attributes?.position || !decals.length) return null;
    try {
      const Geometry = referenceGeometry.constructor;
      const Attr = referenceGeometry.attributes.position.constructor;
      const geometry = new Geometry();
      const positions = new Float32Array(decals.length * 12);
      const normals = new Float32Array(decals.length * 12);
      const uvs = new Float32Array(decals.length * 8);
      const indices = new Uint32Array(decals.length * 6);
      const inset = 0.01;

      for (let i = 0; i < decals.length; i++) {
        const d = decals[i];
        const p = i * 12;
        const u = i * 8;
        const q = i * 6;
        const x0 = d.x + inset, x1 = d.x + 1 - inset;
        const z0 = d.z + inset, z1 = d.z + 1 - inset;
        positions.set([x0,d.y,z0, x1,d.y,z0, x0,d.y,z1, x1,d.y,z1], p);
        normals.set([0,1,0, 0,1,0, 0,1,0, 0,1,0], p);
        const uv = uvForRotation(d.rot);
        uvs.set([uv[0][0],uv[0][1], uv[1][0],uv[1][1], uv[2][0],uv[2][1], uv[3][0],uv[3][1]], u);
        const b = i * 4;
        indices.set([b,b+2,b+1, b+2,b+3,b+1], q);
      }

      geometry.setAttribute('position', new Attr(positions, 3));
      geometry.setAttribute('normal', new Attr(normals, 3));
      geometry.setAttribute('uv', new Attr(uvs, 2));
      geometry.setIndex(Array.from(indices));
      geometry.computeBoundingBox?.();
      geometry.computeBoundingSphere?.();
      return geometry;
    } catch (err) {
      console.warn(TAG, 'No se pudo construir la geometría decorativa:', err);
      return null;
    }
  }

  function makeMesh(geometry, material, typeIndex) {
    const ref = state.referenceMesh;
    if (!ref?.constructor || !geometry || !material) return null;
    try {
      const mesh = new ref.constructor(geometry, material);
      mesh.name = `MiniFeatherGrassFlowers:${DECALS[typeIndex].id}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.renderOrder = 3;
      return mesh;
    } catch (_) { return null; }
  }

  function idle(fn) {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 120 });
    else setTimeout(() => fn({ timeRemaining: () => 4 }), 0);
  }

  async function rebuildRegion(game, centerCx, centerCz, token) {
    const world = game?.world;
    const scene = getScene(game);
    const proto = world && getWorldProto(world);
    if (!world || !scene?.add || !proto) return;
    if (!(await ensureResources(scene)) || token !== state.buildToken || !state.enabled) return;

    const chunks = [];
    for (let dz = -REGION_RADIUS; dz <= REGION_RADIUS; dz++) {
      for (let dx = -REGION_RADIUS; dx <= REGION_RADIUS; dx++) chunks.push([centerCx + dx, centerCz + dz]);
    }
    // Center-first ordering makes nearby details appear first internally, while the old bundle remains visible.
    chunks.sort((a, b) => ((a[0]-centerCx)**2 + (a[1]-centerCz)**2) - ((b[0]-centerCx)**2 + (b[1]-centerCz)**2));

    const buckets = [[], [], []];
    let index = 0;
    state.building = true;

    const step = () => {
      if (token !== state.buildToken || !state.enabled || state.destroyed) { state.building = false; return; }
      idle(() => {
        if (token !== state.buildToken || !state.enabled || state.destroyed) { state.building = false; return; }
        // Exactly one chunk per idle slice: never block the game thread with a 5x5 scan.
        if (index < chunks.length) {
          const [cx, cz] = chunks[index++];
          scanChunk(world, proto, cx, cz, buckets);
          step();
          return;
        }

        const next = [];
        for (let type = 0; type < buckets.length; type++) {
          if (!buckets[type].length) continue;
          const geometry = buildGeometry(state.referenceMesh.geometry, buckets[type]);
          const mesh = makeMesh(geometry, state.materials[type], type);
          if (!geometry || !mesh) { try { geometry?.dispose?.(); } catch (_) {}; continue; }
          try { scene.add(mesh); next.push({ mesh, geometry }); } catch (_) { try { geometry.dispose?.(); } catch (_) {} }
        }

        if (token !== state.buildToken || !state.enabled) {
          for (const r of next) { try { r.mesh?.removeFromParent?.(); r.geometry?.dispose?.(); } catch (_) {} }
          state.building = false;
          return;
        }

        clearBundle();
        state.bundle = next;
        state.centerCx = centerCx;
        state.centerCz = centerCz;
        state.lastRefresh = performance.now();
        state.building = false;
      });
    };
    step();
  }

  function schedule(force = false) {
    if (!state.enabled || state.destroyed) return;
    const game = findGame(force);
    const world = game?.world;
    const scene = getScene(game);
    const px = Number(game?.player?.pos?.x);
    const pz = Number(game?.player?.pos?.z);
    if (!world || !scene || !Number.isFinite(px) || !Number.isFinite(pz)) return;

    if (state.world !== world || state.scene !== scene) {
      state.buildToken++;
      disposeResources();
      state.stateNameCache.clear();
      state.world = world;
      state.scene = scene;
      state.centerCx = Number.NaN;
      state.centerCz = Number.NaN;
      state.serverSalt = computeServerSalt(game);
    }

    const cx = Math.floor(px / 16);
    const cz = Math.floor(pz / 16);
    const now = performance.now();
    if (!force && cx === state.centerCx && cz === state.centerCz && now - state.lastRefresh < REFRESH_MS) return;

    const token = ++state.buildToken;
    rebuildRegion(game, cx, cz, token).catch(err => {
      if (token === state.buildToken) state.building = false;
      console.warn(TAG, 'Rebuild falló:', err);
    });
  }

  function start() {
    if (state.scanTimer) return;
    state.serverSalt = computeServerSalt(findGame(true));
    schedule(true);
    state.scanTimer = setInterval(() => schedule(false), 900);
  }

  function stop() {
    if (state.scanTimer) clearInterval(state.scanTimer);
    state.scanTimer = 0;
    state.buildToken++;
    state.building = false;
    disposeResources();
    state.stateNameCache.clear();
    state.world = null;
    state.scene = null;
    state.centerCx = Number.NaN;
    state.centerCz = Number.NaN;
  }

  function setEnabled(value) {
    const enabled = !!value;
    if (state.enabled === enabled) return;
    state.enabled = enabled;
    if (enabled) start(); else stop();
  }

  function applyConfig(detail) {
    let cfg = detail;
    if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch (_) { return; } }
    if (!cfg || typeof cfg !== 'object') return;
    setEnabled(cfg.enabled);
  }

  const configHandler = event => applyConfig(event.detail);
  document.addEventListener(EVENT_NAME, configHandler);

  W.MF_GrassFlowersExperimental = {
    setEnabled,
    refresh() { schedule(true); },
    get enabled() { return state.enabled; },
    get decorativeMeshes() { return state.bundle.length; },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      stop();
      document.removeEventListener(EVENT_NAME, configHandler);
      try { delete W.MF_GrassFlowersExperimental; } catch (_) {}
    }
  };
})();
