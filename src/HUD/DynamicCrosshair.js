(function () {
'use strict';

const TAG = '[Dynamic Crosshair]';

const EVENT_CONFIG = 'minifeather:dynamiccrosshair-config';
const EVENT_STATE = 'minifeather:dynamiccrosshair-state';

const DEFAULT_MAP = Object.freeze({
    air: 'empty.png',
    block: 'crosshair.png',
    entity: 'cross-open.png',
    player: 'diamond.png',
    enemy: 'cross-diagonal-small.png',
    friendly: 'circle.png',
    item: 'dot.png',
    projectile: 'caret.png',
    building: 'brackets.png',
    bridging: 'brackets-bottom.png',
    precision: 'crosshair.png',
    close_range: 'square.png',
    long_range: 'circle-large.png',
    critical: 'cross-open-diagonal.png',
    targeting: 'diamond-large.png',
    top_target: 'brackets-top.png',
    bottom_target: 'line-bottom.png',
    multiple_targets: 'lines.png',
    default: 'crosshair.png'
});

const AVAILABLE = Object.freeze([
    'brackets-bottom.png', 'brackets-round.png', 'brackets-top.png',
    'brackets.png', 'caret.png', 'circle-large.png', 'circle.png',
    'cross-diagonal-small.png', 'cross-open-diagonal.png', 'cross-open.png',
    'crosshair.png', 'diamond-large.png', 'diamond.png', 'dot.png',
    'empty.png', 'line-bottom.png', 'lines.png', 'square-large.png',
    'square.png'
]);

const state = {
    enabled: false,
    game: null,
    lastGameScan: 0,
    originalSvg: null,
    customImg: null,
    customContainer: null,
    crosshairMap: { ...DEFAULT_MAP },
    currentSituation: 'default',
    lastSituation: '',
    crosshairSize: 28,
    lastRaycastScan: 0,
    assetBaseUrl: ''
};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getGame(force = false) {
    const now = performance.now();

    if (!force && state.game?.player && now - state.lastGameScan < 500) {
        return state.game;
    }

    state.lastGameScan = now;

    try {
        const react = document.querySelector('#react');
        if (!react) return state.game?.player ? state.game : null;

        for (const root of Object.values(react)) {
            const game = root?.updateQueue?.baseState?.element?.props?.game;
            if (game?.player) {
                state.game = game;
                return game;
            }
        }
    } catch (_) {}

    return state.game?.player ? state.game : null;
}

// --- Raycast / Target Detection ---

function getLookVector(player) {
    try {
        let proto = Object.getPrototypeOf(player);
        for (let i = 0; i < 4; i++) proto = Object.getPrototypeOf(proto);
        if (typeof proto.getLook === 'function') {
            return proto.getLook.call(player);
        }
    } catch (_) {}

    const pitch = Number(player.pitch) || 0;
    const yaw = Number(player.yaw) || 0;
    const cosPitch = Math.cos(pitch);
    return {
        x: -Math.sin(yaw) * cosPitch,
        y: -Math.sin(pitch),
        z: Math.cos(yaw) * cosPitch
    };
}

function rayBoxIntersect(origin, dir, box, maxDist) {
    let tmin = 0;
    let tmax = maxDist;

    for (const axis of ['x', 'y', 'z']) {
        const o = origin[axis];
        const d = dir[axis];
        const mn = box.min[axis];
        const mx = box.max[axis];

        if (Math.abs(d) < 1e-8) {
            if (o < mn || o > mx) return -1;
        } else {
            let t1 = (mn - o) / d;
            let t2 = (mx - o) / d;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }

            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);

            if (tmin > tmax) return -1;
        }
    }

    return tmin;
}

// Voxel raycast (DDA algorithm) — steps through blocks looking for solid hits
function raycastVoxel(world, origin, dir, maxDist) {
    if (!world) return null;

    // Access getBlockState from the parent prototype
    const proto = Object.getPrototypeOf(world);
    if (typeof proto.getBlockState !== 'function') return null;

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;

    // Distance to next voxel boundary
    const tDeltaX = Math.abs(dir.x) < 1e-8 ? Infinity : Math.abs(1 / dir.x);
    const tDeltaY = Math.abs(dir.y) < 1e-8 ? Infinity : Math.abs(1 / dir.y);
    const tDeltaZ = Math.abs(dir.z) < 1e-8 ? Infinity : Math.abs(1 / dir.z);

    const nextBoundaryX = dir.x > 0 ? (x + 1 - origin.x) : (origin.x - x);
    const nextBoundaryY = dir.y > 0 ? (y + 1 - origin.y) : (origin.y - y);
    const nextBoundaryZ = dir.z > 0 ? (z + 1 - origin.z) : (origin.z - z);

    let tMaxX = tDeltaX === Infinity ? Infinity : nextBoundaryX * tDeltaX;
    let tMaxY = tDeltaY === Infinity ? Infinity : nextBoundaryY * tDeltaY;
    let tMaxZ = tDeltaZ === Infinity ? Infinity : nextBoundaryZ * tDeltaZ;

    let t = 0;

    for (let i = 0; i < 80 && t <= maxDist; i++) {
        try {
            const blockState = proto.getBlockState.call(world, { x, y, z });
            if (blockState && blockState.id !== 0) {
                return { x, y, z, dist: t, id: blockState.id };
            }
        } catch (_) { return null; }

        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
            x += stepX;
            t = tMaxX;
            tMaxX += tDeltaX;
        } else if (tMaxY < tMaxZ) {
            y += stepY;
            t = tMaxY;
            tMaxY += tDeltaY;
        } else {
            z += stepZ;
            t = tMaxZ;
            tMaxZ += tDeltaZ;
        }
    }

    return null;
}

function detectTarget(game, player) {
    const now = performance.now();

    if (now - state.lastRaycastScan < 100) {
        return state.currentSituation;
    }
    state.lastRaycastScan = now;

    // Air check (isAirborne is unreliable, use onGround + motion.y)
    if (!player.onGround && (Number(player.motion?.y) || 0) > 0.05) {
        return setSituation('air');
    }

    const eyeHeight = typeof player.getEyeHeight === 'function'
        ? player.getEyeHeight()
        : 1.62;

    const origin = {
        x: Number(player.pos?.x) || 0,
        y: (Number(player.pos?.y) || 0) + eyeHeight,
        z: Number(player.pos?.z) || 0
    };

    const look = getLookVector(player);
    if (!look) return setSituation('default');

    const REACH = 5.0;
    const playerId = player.id;

    // Entity scan with id filter
    const entities = game.world?.entities;
    let closestEntity = null;
    let closestDist = REACH;

    if (entities instanceof Map) {
        for (const ent of entities.values()) {
            if (!ent || ent === player || ent.id === playerId || ent.dead) continue;

            const box = ent.boundingBox;
            if (!box?.min || !box?.max) continue;

            const dist = rayBoxIntersect(origin, look, box, REACH);
            if (dist > 0 && dist < closestDist) {
                closestDist = dist;
                closestEntity = ent;
            }
        }
    }

    // Classify entity hit
    if (closestEntity) {
        if (closestEntity.profile) return setSituation('player');
        if (closestEntity.creatureClass) return setSituation('enemy');

        const name = String(closestEntity.name || '').toLowerCase();
        if (name.includes('item') || name.includes('drop')) return setSituation('item');
        if (name.includes('arrow') || name.includes('snowball') ||
            name.includes('egg') || name.includes('pearl')) return setSituation('projectile');

        return setSituation('entity');
    }

    // Voxel raycast — check if looking at a block or sky/void
    const blockHit = raycastVoxel(game.world, origin, look, REACH);
    const targetingBlock = blockHit !== null || player.selectBox?.visible === true;

    // Movement-based situations
    const motion = player.motion;

    if (motion) {
        const speed = Math.hypot(Number(motion.x) || 0, Number(motion.z) || 0);

        if (player.sneak && speed > 0.01 && (Number(player.pitch) || 0) > 0.5) {
            return setSituation('bridging');
        }

        if (targetingBlock && player.punching) {
            return setSituation('building');
        }
    }

    if (targetingBlock) return setSituation('block');

    // Not looking at anything — sky or void
    return setSituation('default');
}

function setSituation(name) {
    state.currentSituation = name;
    return name;
}

// --- Crosshair Rendering ---

function findOriginalCrosshair() {
    const svgs = document.querySelectorAll('svg');
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    for (const svg of svgs) {
        const rects = svg.querySelectorAll('rect');
        if (rects.length < 4) continue;

        const rect = svg.getBoundingClientRect();
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;

        if (Math.abs(cx - viewW / 2) < 20 && Math.abs(cy - viewH / 2) < 20) {
            const w = parseFloat(svg.getAttribute('width'));
            if (w > 0 && w < 60) return svg;
        }
    }
    return null;
}

function getCrosshairUrl(filename) {
    const file = AVAILABLE.includes(filename) ? filename : 'crosshair.png';
    if (state.assetBaseUrl) {
        return state.assetBaseUrl + file;
    }
    // Fallbacks for MAIN world
    try {
        return chrome.runtime.getURL('assets/crosshair/' + file);
    } catch (_) {}
    return '';
}

function ensureCustomCrosshair() {
    if (state.customContainer?.isConnected) return state.customContainer;

    const container = document.createElement('div');
    container.id = 'mf-dynamic-crosshair';
    Object.assign(container.style, {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: '2147483647',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: '0'
    });

    const img = document.createElement('img');
    img.alt = '';
    img.style.display = 'block';
    img.style.imageRendering = 'pixelated';
    img.style.transition = 'opacity 60ms ease';

    container.appendChild(img);
    document.documentElement.appendChild(container);

    state.customContainer = container;
    state.customImg = img;

    return container;
}

function hideOriginalCrosshair() {
    if (!state.originalSvg || !state.originalSvg.isConnected) {
        state.originalSvg = findOriginalCrosshair();
    }

    if (state.originalSvg?.isConnected) {
        state.originalSvg.style.display = 'none';
    }
}

function showOriginalCrosshair() {
    if (state.originalSvg?.isConnected) {
        state.originalSvg.style.display = '';
    }
}

function removeCustomCrosshair() {
    if (state.customContainer?.isConnected) {
        state.customContainer.remove();
    }
    state.customContainer = null;
    state.customImg = null;
}

function updateCrosshair(situation) {
    if (situation === state.lastSituation) return;
    state.lastSituation = situation;

    const filename = state.crosshairMap[situation] || state.crosshairMap.default;
    const img = state.customImg;
    if (!img) return;

    const url = getCrosshairUrl(filename);
    if (!url) return;

    if (img.dataset.src !== url) {
        img.src = url;
        img.dataset.src = url;
        img.style.width = state.crosshairSize + 'px';
        img.style.height = state.crosshairSize + 'px';
    }
}

// --- Config ---

function applyConfig(detail) {
    let config = detail;
    if (typeof config === 'string') {
        try {
            config = JSON.parse(config);
        } catch (_) {
            return;
        }
    }

    if (!config || typeof config !== 'object') return;

    if (typeof config.assetBaseUrl === 'string') {
        state.assetBaseUrl = config.assetBaseUrl;
    }

    if (typeof config.enabled === 'boolean') {
        setEnabled(config.enabled);
    }

    if (config.crosshairs && typeof config.crosshairs === 'object') {
        for (const key of Object.keys(DEFAULT_MAP)) {
            const val = config.crosshairs[key];
            if (typeof val === 'string') {
                state.crosshairMap[key] = AVAILABLE.includes(val) ? val : DEFAULT_MAP[key];
            }
        }
        state.lastSituation = '';
    }

    if (Number.isFinite(Number(config.size))) {
        state.crosshairSize = clamp(Number(config.size), 8, 64);
        if (state.customImg) {
            state.customImg.style.width = state.crosshairSize + 'px';
            state.customImg.style.height = state.crosshairSize + 'px';
        }
    }
}

function emitState() {
    try {
        document.dispatchEvent(new CustomEvent(EVENT_STATE, {
            detail: JSON.stringify({
                enabled: state.enabled,
                currentSituation: state.currentSituation,
                crosshairMap: { ...state.crosshairMap },
                size: state.crosshairSize
            })
        }));
    } catch (_) {}
}

function setEnabled(enabled) {
    const next = !!enabled;
    if (state.enabled === next) return;

    state.enabled = next;
    state.lastSituation = '';
    state.currentSituation = 'default';

    if (next) {
        hideOriginalCrosshair();
        ensureCustomCrosshair();
    } else {
        removeCustomCrosshair();
        showOriginalCrosshair();
        state.originalSvg = null;
    }

    emitState();
}

// --- Main Loop ---

function loop() {
    if (state.enabled) {
        const game = getGame();
        const player = game?.player;

        if (game && player) {
            if (!state.originalSvg?.isConnected && !state.customContainer?.isConnected) {
                state.originalSvg = null;
            }

            hideOriginalCrosshair();
            ensureCustomCrosshair();

            const situation = detectTarget(game, player);
            updateCrosshair(situation);
        }
    }

    requestAnimationFrame(loop);
}

// --- Events ---

document.addEventListener(EVENT_CONFIG, event => {
    applyConfig(event.detail);
}, true);

// --- Public API ---

globalThis.DynamicCrosshair = {
    enable() {
        setEnabled(true);
        return state.enabled;
    },
    disable() {
        setEnabled(false);
        return state.enabled;
    },
    toggle() {
        setEnabled(!state.enabled);
        return state.enabled;
    },
    setCrosshair(situation, filename) {
        if (DEFAULT_MAP[situation] && AVAILABLE.includes(filename)) {
            state.crosshairMap[situation] = filename;
            state.lastSituation = '';
            emitState();
        }
        return state.crosshairMap[situation];
    },
    setMap(map) {
        if (map && typeof map === 'object') {
            for (const key of Object.keys(DEFAULT_MAP)) {
                const val = map[key];
                if (typeof val === 'string') {
                    state.crosshairMap[key] = AVAILABLE.includes(val) ? val : DEFAULT_MAP[key];
                }
            }
            state.lastSituation = '';
            emitState();
        }
        return { ...state.crosshairMap };
    },
    setSize(size) {
        state.crosshairSize = clamp(Number(size) || 28, 8, 64);
        if (state.customImg) {
            state.customImg.style.width = state.crosshairSize + 'px';
            state.customImg.style.height = state.crosshairSize + 'px';
        }
        return state.crosshairSize;
    },
    get enabled() { return state.enabled; },
    get situation() { return state.currentSituation; },
    get map() { return { ...state.crosshairMap }; },
    get size() { return state.crosshairSize; },
    get defaults() { return { ...DEFAULT_MAP }; },
    get available() { return [...AVAILABLE]; }
};

console.log(`${TAG} Dynamic Crosshair loaded.`);

requestAnimationFrame(loop);
})();
