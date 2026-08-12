// MiniFeather — World Map
// Press U to open a fullscreen map showing all explored chunks.
// The map caches chunk data locally and renders a top-down view
// with terrain heights, biomes, player position, and waypoints.

(function () {
    'use strict';

    const TAG = '[MiniFeather WorldMap]';

    if (window.__MF_WORLD_MAP__) return;
    window.__MF_WORLD_MAP__ = true;

    // ── Config ──
    const CONFIG = {
        toggleKey: 'KeyU',
        // Colors for block types (by block state ID ranges)
        // These are approximate; the game uses a palette per chunk cell
        blockColors: {
            air: null,        // transparent
            grass: '#5a8f3a',
            dirt: '#8b5a2b',
            stone: '#7d7d7d',
            sand: '#e6d8a0',
            water: '#3a6fcd',
            lava: '#e86010',
            wood: '#6b4f2a',
            leaves: '#3a7a2a',
            snow: '#f0f0f0',
            ice: '#90c0e8',
            default: '#555555'
        },
        // Minimap/world colors palette for height-based rendering
        heightColors: [
            '#1a3a5c', // deep water
            '#2a5a8c', // water
            '#3a7acc', // shallow water
            '#c2b280', // sand/beach
            '#5a8f3a', // grass low
            '#3a7a2a', // grass mid
            '#6b5a3a', // dirt/forest
            '#7d7d7d', // stone
            '#9d9d9d', // stone high
            '#f0f0f0'  // snow peak
        ],
        // Pixel size per block
        blockPixelSize: 4,
        // Chunk scan radius around player for live data
        liveScanRadius: 12,
        // Map size in pixels (the canvas)
        mapCanvasSize: 1024
    };

    // ── State ──
    const state = {
        open: false,
        game: null,
        world: null,
        // Persistent chunk cache: Map of "cx,cz" -> { heights: Uint8Array(256), colors: Uint32Array(256), timestamp }
        chunkCache: new Map(),
        // UI elements
        overlay: null,
        canvas: null,
        ctx: null,
        closeBtn: null,
        coordsLabel: null,
        // View state
        centerX: 0,
        centerZ: 0,
        zoom: 1,
        // Drag state
        dragging: false,
        dragStartX: 0,
        dragStartY: 0,
        dragStartCenterX: 0,
        dragStartCenterZ: 0,
        // Last scan
        lastScan: 0,
        scanInterval: 0,
        // Player tracking
        lastPlayerChunkX: null,
        lastPlayerChunkZ: null
    };

    // ── Game Access ──

    function getGame() {
        if (window.__mfGame?.player) return window.__mfGame;

        const candidates = [
            document.getElementById('root'),
            document.querySelector('canvas'),
            document.body,
            document.getElementById('canvas-holder')
        ].filter(Boolean);

        for (const el of candidates) {
            const fiberKey = Object.keys(el).find(k =>
                k.startsWith('__reactFiber$') ||
                k.startsWith('__reactInternalInstance$') ||
                k.startsWith('__reactContainer$')
            );
            if (!fiberKey) continue;

            let fiber = el[fiberKey];
            while (fiber) {
                if (fiber.stateNode) {
                    if (typeof fiber.stateNode.queue === 'function' &&
                        typeof fiber.stateNode.connect === 'function') {
                        window.__mfGame = fiber.stateNode;
                        return fiber.stateNode;
                    }
                    if (fiber.stateNode.game &&
                        typeof fiber.stateNode.game.queue === 'function') {
                        window.__mfGame = fiber.stateNode.game;
                        return fiber.stateNode.game;
                    }
                }
                if (fiber.memoizedProps?.game?.player) {
                    window.__mfGame = fiber.memoizedProps.game;
                    return fiber.memoizedProps.game;
                }
                fiber = fiber.return;
            }
        }

        return null;
    }

    function getWorldProto2(world) {
        const proto = Object.getPrototypeOf(world);
        return Object.getPrototypeOf(proto);
    }

    // ── Chunk Data Extraction ──

    function getChunkHeightMap(world, worldProto2, cx, cz) {
        const chunk = worldProto2.getChunk.call(world, cx, cz);
        if (!chunk || !chunk.cells) return null;

        const heights = new Int16Array(256); // 16x16 height per column
        const blockTypes = new Uint16Array(256); // top block stateId per column

        for (let colX = 0; colX < 16; colX++) {
            for (let colZ = 0; colZ < 16; colZ++) {
                let topY = -1;
                let topStateId = 0;

                // Scan from top cell to bottom
                for (let cellIdx = chunk.cells.length - 1; cellIdx >= 0; cellIdx--) {
                    const cell = chunk.cells[cellIdx];
                    if (!cell || !cell.bitArray) continue;

                    const yBase = cell.yBase;

                    for (let y = 15; y >= 0; y--) {
                        const realY = yBase + y;
                        if (realY < 0) break;

                        const blockIndex = (y << 8) | (colZ << 4) | colX;
                        let stateIdRaw = cell.bitArray.get(blockIndex);
                        const stateId = cell.palette && cell.palette.length > 0
                            ? cell.palette[stateIdRaw]
                            : stateIdRaw;

                        if (stateId !== 0) {
                            topY = realY;
                            topStateId = stateId;
                            break;
                        }
                    }

                    if (topY !== -1) break;
                }

                const colIndex = colZ * 16 + colX;
                heights[colIndex] = topY;
                blockTypes[colIndex] = topStateId;
            }
        }

        return { heights, blockTypes };
    }

    // ── Color Logic ──

    function heightToColor(y) {
        if (y < 0) return CONFIG.heightColors[0]; // void / deep
        if (y < 12) return CONFIG.heightColors[0]; // deep water
        if (y < 24) return CONFIG.heightColors[1]; // water
        if (y < 32) return CONFIG.heightColors[2]; // shallow water
        if (y < 40) return CONFIG.heightColors[3]; // sand
        if (y < 56) return CONFIG.heightColors[4]; // grass low
        if (y < 72) return CONFIG.heightColors[5]; // grass mid
        if (y < 88) return CONFIG.heightColors[6]; // dirt
        if (y < 104) return CONFIG.heightColors[7]; // stone
        if (y < 128) return CONFIG.heightColors[8]; // stone high
        return CONFIG.heightColors[9]; // snow
    }

    // ── Chunk Scanning ──

    function scanChunksAroundPlayer() {
        const game = getGame();
        if (!game?.player?.pos) return;

        const world = game.world;
        if (!world) return;

        const worldProto2 = getWorldProto2(world);
        const px = Math.floor(game.player.pos.x);
        const pz = Math.floor(game.player.pos.z);
        const pcx = px >> 4;
        const pcz = pz >> 4;

        const chunkX = pcx;
        const chunkZ = pcz;

        // Only scan if player moved to a new chunk
        if (state.lastPlayerChunkX === chunkX && state.lastPlayerChunkZ === chunkZ) return;
        state.lastPlayerChunkX = chunkX;
        state.lastPlayerChunkZ = chunkZ;

        for (let dx = -CONFIG.liveScanRadius; dx <= CONFIG.liveScanRadius; dx++) {
            for (let dz = -CONFIG.liveScanRadius; dz <= CONFIG.liveScanRadius; dz++) {
                const cx = chunkX + dx;
                const cz = chunkZ + dz;
                const cacheKey = cx + ',' + cz;

                // Skip if already cached
                if (state.chunkCache.has(cacheKey)) continue;

                try {
                    if (!worldProto2.isChunkLoaded.call(world, cx, cz)) continue;

                    const data = getChunkHeightMap(world, worldProto2, cx, cz);
                    if (!data) continue;

                    state.chunkCache.set(cacheKey, {
                        cx, cz,
                        heights: data.heights,
                        blockTypes: data.blockTypes,
                        timestamp: Date.now()
                    });
                } catch (_) {}
            }
        }

        // Limit cache size (keep most recent 500 chunks)
        if (state.chunkCache.size > 500) {
            const entries = Array.from(state.chunkCache.entries());
            entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
            state.chunkCache = new Map(entries.slice(0, 500));
        }
    }

    // ── Map Rendering ──

    function renderMap() {
        if (!state.ctx) return;

        const ctx = state.ctx;
        const canvas = state.canvas;
        const w = canvas.width;
        const h = canvas.height;

        // Background
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        const blockPx = CONFIG.blockPixelSize * state.zoom;
        const centerX = state.centerX;
        const centerZ = state.centerZ;

        // Center offset
        const offsetX = w / 2;
        const offsetY = h / 2;

        // Render cached chunks
        for (const [key, chunk] of state.chunkCache) {
            const chunkWorldX = chunk.cx * 16;
            const chunkWorldZ = chunk.cz * 16;

            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    const worldX = chunkWorldX + x;
                    const worldZ = chunkWorldZ + z;
                    const colIndex = z * 16 + x;

                    const heightY = chunk.heights[colIndex];
                    if (heightY < 0) continue; // unloaded column

                    const screenX = offsetX + (worldX - centerX) * blockPx;
                    const screenY = offsetY + (worldZ - centerZ) * blockPx;

                    // Cull off-screen
                    if (screenX < -blockPx || screenX > w ||
                        screenY < -blockPx || screenY > h) continue;

                    ctx.fillStyle = heightToColor(heightY);
                    ctx.fillRect(
                        Math.floor(screenX),
                        Math.floor(screenY),
                        Math.ceil(blockPx),
                        Math.ceil(blockPx)
                    );
                }
            }
        }

        // Draw chunk grid (subtle)
        if (blockPx >= 8) {
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            const chunkPixelSize = 16 * blockPx;
            const startCX = Math.floor((centerX - offsetX / blockPx) / 16) * 16;
            const startCZ = Math.floor((centerZ - offsetY / blockPx) / 16) * 16;
            const endCX = Math.ceil((centerX + offsetX / blockPx) / 16) * 16;
            const endCZ = Math.ceil((centerZ + offsetY / blockPx) / 16) * 16;

            for (let x = startCX; x <= endCX; x += 16) {
                const sx = offsetX + (x - centerX) * blockPx;
                ctx.beginPath();
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, h);
                ctx.stroke();
            }
            for (let z = startCZ; z <= endCZ; z += 16) {
                const sy = offsetY + (z - centerZ) * blockPx;
                ctx.beginPath();
                ctx.moveTo(0, sy);
                ctx.lineTo(w, sy);
                ctx.stroke();
            }
        }

        // Draw player position
        const game = getGame();
        if (game?.player?.pos) {
            const ppx = game.player.pos.x;
            const ppz = game.player.pos.z;
            const psx = offsetX + (ppx - centerX) * blockPx;
            const psy = offsetY + (ppz - centerZ) * blockPx;

            // Player arrow (triangle pointing in yaw direction)
            const yaw = Number(game.player.yaw) || 0;
            ctx.save();
            ctx.translate(psx, psy);
            ctx.rotate(-yaw);
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -8);
            ctx.lineTo(-5, 5);
            ctx.lineTo(0, 2);
            ctx.lineTo(5, 5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // Draw waypoints
        drawWaypoints(ctx, offsetX, offsetY, centerX, centerZ, blockPx);

        // Update coords label
        if (state.coordsLabel && game?.player?.pos) {
            state.coordsLabel.textContent =
                `XYZ: ${Math.floor(game.player.pos.x)} / ${Math.floor(game.player.pos.y)} / ${Math.floor(game.player.pos.z)} | Chunks: ${state.chunkCache.size} | Zoom: ${state.zoom.toFixed(1)}x`;
        }
    }

    function drawWaypoints(ctx, offsetX, offsetY, centerX, centerZ, blockPx) {
        try {
            const stored = localStorage.getItem('minifeather_waypoints_v1');
            if (!stored) return;
            const parsed = JSON.parse(stored);
            if (!parsed?.list) return;

            for (const wp of parsed.list) {
                const sx = offsetX + (wp.x - centerX) * blockPx;
                const sy = offsetY + (wp.z - centerZ) * blockPx;
                if (sx < -20 || sx > state.canvas.width + 20 ||
                    sy < -20 || sy > state.canvas.height + 20) continue;

                ctx.fillStyle = wp.color || '#ff5f5f';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(sx, sy, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Label
                if (blockPx >= 4) {
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 3;
                    ctx.font = '11px Arial';
                    ctx.textAlign = 'center';
                    ctx.strokeText(wp.name, sx, sy - 10);
                    ctx.fillText(wp.name, sx, sy - 10);
                }
            }
        } catch (_) {}
    }

    // ── UI ──

    function createOverlay() {
        if (state.overlay) return;

        const overlay = document.createElement('div');
        overlay.id = 'mf-worldmap-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.92)',
            zIndex: '2147483647',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            pointerEvents: 'auto'
        });

        // Title bar
        const titleBar = document.createElement('div');
        Object.assign(titleBar.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '90vw',
            maxWidth: '1200px',
            marginBottom: '8px'
        });

        const title = document.createElement('span');
        title.textContent = 'World Map';
        Object.assign(title.style, {
            fontSize: '20px',
            fontWeight: 'bold'
        });

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close (U)';
        Object.assign(closeBtn.style, {
            background: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '6px',
            padding: '6px 16px',
            cursor: 'pointer',
            fontSize: '14px'
        });
        closeBtn.addEventListener('click', closeMap);

        titleBar.appendChild(title);
        titleBar.appendChild(closeBtn);
        overlay.appendChild(titleBar);

        // Map canvas container
        const canvasContainer = document.createElement('div');
        Object.assign(canvasContainer.style, {
            position: 'relative',
            border: '2px solid #444',
            borderRadius: '8px',
            overflow: 'hidden',
            background: '#0a0a0a'
        });

        const canvas = document.createElement('canvas');
        canvas.width = CONFIG.mapCanvasSize;
        canvas.height = CONFIG.mapCanvasSize;
        Object.assign(canvas.style, {
            display: 'block',
            maxWidth: '90vw',
            maxHeight: '75vh',
            cursor: 'grab'
        });

        canvasContainer.appendChild(canvas);
        overlay.appendChild(canvasContainer);

        // Coords label
        const coordsLabel = document.createElement('div');
        Object.assign(coordsLabel.style, {
            marginTop: '8px',
            fontSize: '13px',
            opacity: '0.8',
            fontFamily: 'monospace'
        });
        coordsLabel.textContent = 'Loading...';
        overlay.appendChild(coordsLabel);

        // Controls hint
        const hint = document.createElement('div');
        Object.assign(hint.style, {
            marginTop: '4px',
            fontSize: '11px',
            opacity: '0.5'
        });
        hint.innerHTML = 'Drag to pan | Scroll to zoom | U to close';
        overlay.appendChild(hint);

        document.body.appendChild(overlay);

        state.overlay = overlay;
        state.canvas = canvas;
        state.ctx = canvas.getContext('2d');
        state.closeBtn = closeBtn;
        state.coordsLabel = coordsLabel;

        // ── Interaction ──

        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            canvas.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;

            // Convert screen delta to world delta
            const blockPx = CONFIG.blockPixelSize * state.zoom;
            const canvasRect = canvas.getBoundingClientRect();
            const scale = canvas.width / canvasRect.width;
            state.centerX -= (dx * scale) / blockPx;
            state.centerZ -= (dy * scale) / blockPx;
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            canvas.style.cursor = 'grab';
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.2 : 1 / 1.2;
            state.zoom = Math.max(0.5, Math.min(8, state.zoom * delta));
        }, { passive: false });
    }

    function openMap() {
        if (state.open) return;

        const game = getGame();
        if (!game?.player?.pos) {
            console.warn(`${TAG} No game/player found.`);
            return;
        }

        // Center on player
        state.centerX = Math.floor(game.player.pos.x);
        state.centerZ = Math.floor(game.player.pos.z);
        state.zoom = 1;
        state.open = true;

        createOverlay();

        // Scan chunks immediately
        scanChunksAroundPlayer();

        // Start render loop
        const renderLoop = () => {
            if (!state.open) return;
            scanChunksAroundPlayer();
            renderMap();
            requestAnimationFrame(renderLoop);
        };
        renderLoop();

        console.log(`${TAG} Opened. Chunks cached: ${state.chunkCache.size}`);
    }

    function closeMap() {
        if (!state.open) return;
        state.open = false;

        if (state.overlay) {
            state.overlay.remove();
            state.overlay = null;
            state.canvas = null;
            state.ctx = null;
            state.closeBtn = null;
            state.coordsLabel = null;
        }

        console.log(`${TAG} Closed.`);
    }

    function toggleMap() {
        if (state.open) closeMap();
        else openMap();
    }

    // ── Key Handler ──

    document.addEventListener('keydown', (e) => {
        // Don't trigger if typing in input
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

        if (e.code === CONFIG.toggleKey && !e.repeat) {
            e.preventDefault();
            e.stopPropagation();
            toggleMap();
        }

        // Close on Escape
        if (e.code === 'Escape' && state.open) {
            e.preventDefault();
            closeMap();
        }
    }, true);

    // ── Background chunk scanning (even when map is closed) ──

    function startBackgroundScan() {
        if (state.scanInterval) clearInterval(state.scanInterval);

        state.scanInterval = setInterval(() => {
            if (state.open) return; // foreground scan handles this
            scanChunksAroundPlayer();
        }, 3000);
    }

    // ── Public API ──

    window.MF_WORLD_MAP = {
        open: openMap,
        close: closeMap,
        toggle: toggleMap,
        get isOpen() { return state.open; },
        get chunkCount() { return state.chunkCache.size; },
        clearCache() {
            state.chunkCache.clear();
            console.log(`${TAG} Cache cleared.`);
        },
        setZoom(z) {
            state.zoom = Math.max(0.5, Math.min(8, Number(z) || 1));
            return state.zoom;
        },
        centerOnPlayer() {
            const game = getGame();
            if (game?.player?.pos) {
                state.centerX = Math.floor(game.player.pos.x);
                state.centerZ = Math.floor(game.player.pos.z);
            }
        }
    };

    console.log(`${TAG} Loaded. Press ${CONFIG.toggleKey.replace('Key', '')} to open.`);

    startBackgroundScan();
})();
