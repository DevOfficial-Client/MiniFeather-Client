(function () {
    'use strict';

    const TAG = '[MiniFeather WorldMap]';

    if (window.__MF_WORLD_MAP__) return;
    window.__MF_WORLD_MAP__ = true;

    const CONFIG = {
        toggleKey: 'KeyU',
        heightColors: [
            '#1a3a5c', '#2a5a8c', '#3a7acc', '#c2b280',
            '#5a8f3a', '#3a7a2a', '#6b5a3a', '#7d7d7d',
            '#9d9d9d', '#f0f0f0'
        ],
        blockPixelSize: 4,
        liveScanRadius: 12,
        mapCanvasSize: 1024,
        maxCachedServers: 5,
        maxChunksPerServer: 500
    };

    const BLOCK_NAME_COLORS = {
        air: null,
        grass_block: '#5a8f3a', grass: '#5a8f3a', fern: '#4a7f2a', dead_bush: '#6b5a2a',
        dirt: '#8b5a2b', coarse_dirt: '#7a4f25', podzol: '#6b5a2a', dirt_path: '#9a7a3a',
        stone: '#7d7d7d', cobblestone: '#6a6a6a', granite: '#8a6a5a', diorite: '#a0a0a0',
        andesite: '#6a6a6a', polished_granite: '#9a7a6a', polished_diorite: '#b0b0b0',
        polished_andesite: '#7a7a7a', bedrock: '#3a3a3a', stone_bricks: '#6a6a6a',
        smooth_stone: '#7a7a7a', mossy_cobblestone: '#5a6a4a', mossy_stone_bricks: '#5a6a4a',
        cracked_stone_bricks: '#6a6a6a', chiseled_stone_bricks: '#6a6a6a',
        sand: '#e6d8a0', red_sand: '#c68850', sandstone: '#e0d090', red_sandstone: '#c08050',
        smooth_sandstone: '#e8d8a0', chiseled_sandstone: '#dfd090', cut_sandstone: '#e0d090',
        smooth_red_sandstone: '#c88860', gravel: '#7a6a5a',
        water: '#3a6fcd', lava: '#e86010', ice: '#90c0e8', packed_ice: '#80b0d8',
        snow_block: '#f0f0f0', clay: '#9a9ab0',
        oak_log: '#6b4f2a', spruce_log: '#5a3f22', birch_log: '#c4a87a', jungle_log: '#5a4020',
        acacia_log: '#8a4a20', dark_oak_log: '#3a2a18',
        oak_leaves: '#3a7a2a', spruce_leaves: '#2a5a2a', birch_leaves: '#4a8a3a',
        jungle_leaves: '#3a6a2a', acacia_leaves: '#5a7a2a', dark_oak_leaves: '#2a4a1a',
        oak_planks: '#a67a4a', spruce_planks: '#8a6a3a', birch_planks: '#c4a87a',
        jungle_planks: '#9a7a3a', acacia_planks: '#b07a3a', dark_oak_planks: '#5a4028',
        oak_wood: '#6b4f2a', spruce_wood: '#5a3f22', birch_wood: '#c4a87a',
        jungle_wood: '#5a4020', acacia_wood: '#8a4a20', dark_oak_wood: '#3a2a18',
        glass: '#c0e0f0', sea_lantern: '#a0e0e0',
        coal_ore: '#5a5a5a', iron_ore: '#8a7a6a', gold_ore: '#b0a050',
        diamond_ore: '#5aaab0', emerald_ore: '#3aaa50', lapis_ore: '#3a4aaa',
        redstone_ore: '#8a2a2a', hell_marble_ore: '#6a3a3a', infernium_ore: '#aa3a2a',
        coal_block: '#3a3a3a', iron_block: '#c0c0c0', gold_block: '#e0c040',
        diamond_block: '#5ae0e0', emerald_block: '#3ae060', lapis_block: '#3a4acc',
        redstone_block: '#a02020', infernium_block: '#c03020',
        bricks: '#8a4a3a', bookshelf: '#8a6a3a', workbench: '#8a6a3a',
        furnace: '#5a5a5a', obsidian: '#1a0a1a', tnt: '#c03020',
        sponge: '#d0c050', cobweb: '#b0b0b0',
        cactus: '#3a7a2a', vine: '#3a6a1a', ladder: '#8a6a3a',
        pumpkin: '#c08020', carved_pumpkin: '#c08020', jack_o_lantern: '#c08020', melon: '#3a8a3a',
        hay_block: '#c0a030', terracotta: '#8a5a4a',
        white_wool: '#e0e0e0', orange_wool: '#e08030', magenta_wool: '#c040a0',
        light_blue_wool: '#40a0e0', yellow_wool: '#e0e030', lime_wool: '#60e030',
        pink_wool: '#e090b0', gray_wool: '#404040', light_gray_wool: '#808080',
        cyan_wool: '#208080', purple_wool: '#602080', blue_wool: '#2020a0',
        brown_wool: '#403020', green_wool: '#208020', red_wool: '#c02020', black_wool: '#101010',
        white_concrete: '#d0d0d0', orange_concrete: '#d07020', magenta_concrete: '#b03090',
        light_blue_concrete: '#3090d0', yellow_concrete: '#d0d020', lime_concrete: '#50d020',
        pink_concrete: '#d080a0', gray_concrete: '#303030', light_gray_concrete: '#707070',
        cyan_concrete: '#107070', purple_concrete: '#501070', blue_concrete: '#101090',
        brown_concrete: '#302010', green_concrete: '#107010', red_concrete: '#a01010', black_concrete: '#080808',
        poppy: '#e03020', dandelion: '#e0e020', blue_orchid: '#3080e0',
        allium: '#a040c0', azure_bluet: '#80a0c0', red_tulip: '#c04030',
        orange_tulip: '#e07020', white_tulip: '#e0e0d0', pink_tulip: '#e090a0', oxeye_daisy: '#d0d0a0',
        red_mushroom: '#c0302a', brown_mushroom: '#8a6a4a',
        hellstone: '#6a2010', soul_sand: '#3a2a1a', glowstone: '#c0a040',
        hell_bricks: '#4a2010', hell_fungus_block: '#5a2a1a', red_hell_bricks: '#6a2020',
        end_stone: '#c0b880', end_stone_bricks: '#c0b880',
        marble_block: '#d0d0c0', marble_pillar: '#d0d0c0', marble_bricks: '#d0d0c0', smooth_marble: '#d8d8c8',
        aquastone: '#3080a0', aquastone_bricks: '#3080a0', dark_aquastone: '#205080',
        fire: '#e04010', soul_fire: '#40e0a0',
        note_block: '#8a6a3a', jukebox: '#6a4a2a', cake: '#e0c0a0',
        mossy_cobblestone: '#5a6a4a', chiseled_marble_block: '#c8c8b8',
        stripped_oak_log: '#9a7a4a', stripped_spruce_log: '#8a6a3a', stripped_birch_log: '#d0c090',
        stripped_jungle_log: '#8a6a3a', stripped_acacia_log: '#a0703a', stripped_dark_oak_log: '#6a4a2a',
        brown_mushroom_block: '#6a5a3a', red_mushroom_block: '#8a3020', stem_mushroom_block: '#8a8a7a',
        command_block: '#9080a0', slime_block: '#50c050', chiseled_sandstone: '#dfd090',
        chiseled_red_sandstone: '#c08050', cut_red_sandstone: '#c08050',
        cracked_hell_bricks: '#4a2010', chiseled_hell_bricks: '#4a2010',
        purpur_block: '#8a6080', purpur_slab: '#8a6080', purpur_stairs: '#8a6080',
        blackstone: '#2a2a2a', polished_blackstone: '#3a3a3a', polished_blackstone_bricks: '#333333',
        crimson_planks: '#602030', warped_planks: '#205060',
    };

    let _blockRegistry = null;
    let _stateIdColorCache = new Map();

    function getBlockRegistry(world) {
        if (_blockRegistry) return _blockRegistry;
        try {
            const worldProto2 = getWorldProto2(world);
            const chunk = worldProto2.getChunkByID.call(world, 0, 0);
            if (!chunk?.cells?.[0]) return null;
            const cell = chunk.cells[0];
            const cellProto = Object.getPrototypeOf(cell);
            const getSrc = cellProto.get.toString();
            const match = getSrc.match(/fromBlockStateId/);
            if (match) {
                const fromFn = cellProto.get.toString().match(/(\w+)\.fromBlockStateId/);
                if (fromFn) {
                    const regName = fromFn[1];
                    _blockRegistry = eval(regName);
                }
            }
        } catch (_) {}
        return _blockRegistry;
    }

    function resolveStateIdToBlockName(world, stateId) {
        if (stateId === 0) return 'air';
        const reg = getBlockRegistry(world);
        if (!reg) return null;
        try {
            const state = reg.fromBlockStateId(stateId);
            return state?.getBlock?.()?.name || null;
        } catch (_) {
            return null;
        }
    }

    function stateIdToColor(world, stateId, fallbackY) {
        if (stateId === 0) return heightToColor(fallbackY);

        if (_stateIdColorCache.has(stateId)) {
            return _stateIdColorCache.get(stateId);
        }

        const name = resolveStateIdToBlockName(world, stateId);
        let color = null;

        if (name) {
            if (BLOCK_NAME_COLORS[name] !== undefined) {
                color = BLOCK_NAME_COLORS[name];
            } else {
                const baseName = name.replace(/_(bricks?|stairs|slab|wall|fence|door)$/, '');
                if (BLOCK_NAME_COLORS[baseName] !== undefined) {
                    color = BLOCK_NAME_COLORS[baseName];
                }
            }
        }

        if (!color) {
            color = heightToColor(fallbackY);
        }

        if (_stateIdColorCache.size < 2000) {
            _stateIdColorCache.set(stateId, color);
        }

        return color;
    }

    const state = {
        open: false,
        overlay: null,
        canvas: null,
        ctx: null,
        coordsLabel: null,
        centerX: 0,
        centerZ: 0,
        zoom: 1,
        lastPlayerChunkX: null,
        lastPlayerChunkZ: null,
        scanInterval: null,
        serverCaches: new Map(),
        currentServerKey: null,
        currentDimensionId: 0
    };

    function getGame() {
        if (window.__mfGame?.player) return window.__mfGame;

        const candidates = [
            document.querySelector('canvas'),
            document.body,
            document.getElementById('canvas-holder'),
            document.getElementById('root')
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
                if (fiber.memoizedProps?.game?.player) {
                    window.__mfGame = fiber.memoizedProps.game;
                    return window.__mfGame;
                }
                fiber = fiber.return;
            }
        }

        return null;
    }

    function getWorldProto2(world) {
        let proto = Object.getPrototypeOf(world);
        for (let i = 0; i < 5; i++) {
            if (typeof proto?.isChunkLoaded === 'function' &&
                typeof proto?.getChunkByID === 'function') {
                return proto;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return Object.getPrototypeOf(Object.getPrototypeOf(world));
    }

    function getServerKey(game) {
        try {
            const si = game.serverInfo;
            if (!si) return 'unknown';
            if (typeof si.serverId === 'string' && si.serverId) return si.serverId;
            const proto = Object.getPrototypeOf(si);
            const desc = Object.getOwnPropertyDescriptor(proto, 'worldCacheKey');
            if (desc?.get) {
                const key = desc.get.call(si);
                if (key) return key;
            }
            const name = si.serverName || si.worldType || 'unknown';
            return String(name);
        } catch (_) {
            return 'unknown';
        }
    }

    function getDimensionId(game) {
        try {
            return game.world?.dimensionId ?? 0;
        } catch (_) {
            return 0;
        }
    }

    function getCurrentCache() {
        if (!state.currentServerKey) return null;
        const serverCache = state.serverCaches.get(state.currentServerKey);
        if (!serverCache) return null;
        return serverCache.get(state.currentDimensionId) || null;
    }

    function getOrCreateCache() {
        let serverCache = state.serverCaches.get(state.currentServerKey);
        if (!serverCache) {
            serverCache = new Map();
            state.serverCaches.set(state.currentServerKey, serverCache);
        }
        let dimCache = serverCache.get(state.currentDimensionId);
        if (!dimCache) {
            dimCache = new Map();
            serverCache.set(state.currentDimensionId, dimCache);
        }
        return dimCache;
    }

    function getChunkHeightMap(world, worldProto2, cx, cz) {
        const chunk = worldProto2.getChunkByID.call(world, cx, cz);
        if (!chunk || !chunk.cells) return null;

        const heights = new Int16Array(256);
        const blockTypes = new Uint16Array(256);

        for (let colX = 0; colX < 16; colX++) {
            for (let colZ = 0; colZ < 16; colZ++) {
                let topY = -1;
                let topStateId = 0;

                for (let cellIdx = chunk.cells.length - 1; cellIdx >= 0; cellIdx--) {
                    const cell = chunk.cells[cellIdx];
                    if (!cell || !cell.bitArray) continue;

                    const yBase = cell.yBase;

                    for (let y = 15; y >= 0; y--) {
                        const realY = yBase + y;
                        if (realY < 0) break;

                        const blockIndex = (y << 8) | (colZ << 4) | colX;
                        const stateIdRaw = cell.bitArray.get(blockIndex);
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

    function heightToColor(y) {
        if (y < 0) return CONFIG.heightColors[0];
        if (y < 12) return CONFIG.heightColors[0];
        if (y < 24) return CONFIG.heightColors[1];
        if (y < 32) return CONFIG.heightColors[2];
        if (y < 40) return CONFIG.heightColors[3];
        if (y < 56) return CONFIG.heightColors[4];
        if (y < 72) return CONFIG.heightColors[5];
        if (y < 88) return CONFIG.heightColors[6];
        if (y < 104) return CONFIG.heightColors[7];
        if (y < 128) return CONFIG.heightColors[8];
        return CONFIG.heightColors[9];
    }

    function scanChunksAroundPlayer() {
        const game = getGame();
        if (!game?.player?.pos) return;

        const world = game.world;
        if (!world) return;

        const newServerKey = getServerKey(game);
        const newDimId = getDimensionId(game);

        if (state.currentServerKey !== newServerKey ||
            state.currentDimensionId !== newDimId) {
            state.currentServerKey = newServerKey;
            state.currentDimensionId = newDimId;
            state.lastPlayerChunkX = null;
            state.lastPlayerChunkZ = null;
            console.log(`${TAG} Server: ${newServerKey} | Dimension: ${newDimId}`);
        }

        const worldProto2 = getWorldProto2(world);
        const px = Math.floor(game.player.pos.x);
        const pz = Math.floor(game.player.pos.z);
        const pcx = px >> 4;
        const pcz = pz >> 4;

        if (state.lastPlayerChunkX === pcx && state.lastPlayerChunkZ === pcz) return;
        state.lastPlayerChunkX = pcx;
        state.lastPlayerChunkZ = pcz;

        const chunkCache = getOrCreateCache();

        let scanned = 0;
        for (let dx = -CONFIG.liveScanRadius; dx <= CONFIG.liveScanRadius; dx++) {
            for (let dz = -CONFIG.liveScanRadius; dz <= CONFIG.liveScanRadius; dz++) {
                const cx = pcx + dx;
                const cz = pcz + dz;
                const cacheKey = cx + ',' + cz;

                if (chunkCache.has(cacheKey)) continue;

                try {
                    if (!worldProto2.isChunkLoaded.call(world, cx, cz)) continue;

                    const data = getChunkHeightMap(world, worldProto2, cx, cz);
                    if (!data) continue;

                    chunkCache.set(cacheKey, {
                        cx, cz,
                        heights: data.heights,
                        blockTypes: data.blockTypes,
                        timestamp: Date.now()
                    });
                    scanned++;
                } catch (_) {}
            }
        }

        if (scanned > 0) {
            console.log(`${TAG} Scanned ${scanned} new chunks. Total: ${chunkCache.size}`);
        }

        if (chunkCache.size > CONFIG.maxChunksPerServer) {
            const entries = Array.from(chunkCache.entries());
            entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
            const trimmed = new Map(entries.slice(0, CONFIG.maxChunksPerServer));
            const serverCache = state.serverCaches.get(state.currentServerKey);
            serverCache.set(state.currentDimensionId, trimmed);
        }
    }

    function renderMap() {
        if (!state.ctx) return;

        const ctx = state.ctx;
        const canvas = state.canvas;
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        const blockPx = CONFIG.blockPixelSize * state.zoom;
        const centerX = state.centerX;
        const centerZ = state.centerZ;
        const offsetX = w / 2;
        const offsetY = h / 2;

        const chunkCache = getCurrentCache();
        const game = getGame();
        const world = game?.world;

        if (chunkCache) {
            for (const [, chunk] of chunkCache) {
                const chunkWorldX = chunk.cx * 16;
                const chunkWorldZ = chunk.cz * 16;

                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        const worldX = chunkWorldX + x;
                        const worldZ = chunkWorldZ + z;
                        const colIndex = z * 16 + x;

                        const heightY = chunk.heights[colIndex];
                        if (heightY < 0) continue;

                        const screenX = offsetX + (worldX - centerX) * blockPx;
                        const screenY = offsetY + (worldZ - centerZ) * blockPx;

                        if (screenX < -blockPx || screenX > w ||
                            screenY < -blockPx || screenY > h) continue;

                        const stateId = chunk.blockTypes[colIndex];
                        ctx.fillStyle = world
                            ? stateIdToColor(world, stateId, heightY)
                            : heightToColor(heightY);
                        ctx.fillRect(
                            Math.floor(screenX),
                            Math.floor(screenY),
                            Math.ceil(blockPx),
                            Math.ceil(blockPx)
                        );
                    }
                }
            }
        }

        if (blockPx >= 8) {
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
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

        if (game?.player?.pos) {
            const ppx = game.player.pos.x;
            const ppz = game.player.pos.z;
            const psx = offsetX + (ppx - centerX) * blockPx;
            const psy = offsetY + (ppz - centerZ) * blockPx;

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

        drawWaypoints(ctx, offsetX, offsetY, centerX, centerZ, blockPx);

        if (state.coordsLabel && game?.player?.pos) {
            const chunkCount = getCurrentCache()?.size || 0;
            state.coordsLabel.textContent =
                `XYZ: ${Math.floor(game.player.pos.x)} / ${Math.floor(game.player.pos.y)} / ${Math.floor(game.player.pos.z)} | ` +
                `Chunks: ${chunkCount} | Zoom: ${state.zoom.toFixed(1)}x | ` +
                `Server: ${state.currentServerKey || '?'} | Dim: ${state.currentDimensionId}`;
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

    function createOverlay() {
        if (state.overlay) return;

        const overlay = document.createElement('div');
        overlay.id = 'mf-worldmap-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0',
            width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.92)',
            zIndex: '2147483647',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Arial, sans-serif', color: '#ffffff',
            pointerEvents: 'auto'
        });

        const titleBar = document.createElement('div');
        Object.assign(titleBar.style, {
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            width: '90vw', maxWidth: '1200px', marginBottom: '8px'
        });

        const title = document.createElement('span');
        title.textContent = 'World Map';
        Object.assign(title.style, { fontSize: '20px', fontWeight: 'bold' });

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close (U)';
        Object.assign(closeBtn.style, {
            background: '#333', color: '#fff',
            border: '1px solid #555', borderRadius: '6px',
            padding: '6px 16px', cursor: 'pointer', fontSize: '14px'
        });
        closeBtn.addEventListener('click', closeMap);

        titleBar.appendChild(title);
        titleBar.appendChild(closeBtn);
        overlay.appendChild(titleBar);

        const canvasContainer = document.createElement('div');
        Object.assign(canvasContainer.style, {
            position: 'relative', border: '2px solid #444',
            borderRadius: '8px', overflow: 'hidden', background: '#0a0a0a'
        });

        const canvas = document.createElement('canvas');
        canvas.width = CONFIG.mapCanvasSize;
        canvas.height = CONFIG.mapCanvasSize;
        Object.assign(canvas.style, {
            display: 'block', maxWidth: '90vw', maxHeight: '75vh', cursor: 'grab'
        });

        canvasContainer.appendChild(canvas);
        overlay.appendChild(canvasContainer);

        const coordsLabel = document.createElement('div');
        Object.assign(coordsLabel.style, {
            marginTop: '8px', fontSize: '13px', opacity: '0.8', fontFamily: 'monospace'
        });
        coordsLabel.textContent = 'Loading...';
        overlay.appendChild(coordsLabel);

        const hint = document.createElement('div');
        Object.assign(hint.style, { marginTop: '4px', fontSize: '11px', opacity: '0.5' });
        hint.innerHTML = 'Drag to pan | Scroll to zoom | U to close';
        overlay.appendChild(hint);

        document.body.appendChild(overlay);

        state.overlay = overlay;
        state.canvas = canvas;
        state.ctx = canvas.getContext('2d');
        state.coordsLabel = coordsLabel;

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
            console.warn(`${TAG} No game/player found. Make sure you are in-game.`);
            return;
        }

        state.centerX = Math.floor(game.player.pos.x);
        state.centerZ = Math.floor(game.player.pos.z);
        state.zoom = 1;
        state.open = true;

        createOverlay();
        scanChunksAroundPlayer();

        const renderLoop = () => {
            if (!state.open) return;
            scanChunksAroundPlayer();
            renderMap();
            requestAnimationFrame(renderLoop);
        };
        renderLoop();

        const chunkCount = getCurrentCache()?.size || 0;
        console.log(`${TAG} Opened. Server: ${state.currentServerKey} | Chunks: ${chunkCount}`);
    }

    function closeMap() {
        if (!state.open) return;
        state.open = false;
        if (state.overlay) {
            state.overlay.remove();
            state.overlay = null;
            state.canvas = null;
            state.ctx = null;
            state.coordsLabel = null;
        }
    }

    function toggleMap() {
        if (state.open) closeMap();
        else openMap();
    }

    document.addEventListener('keydown', (e) => {
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

        if (e.code === CONFIG.toggleKey && !e.repeat) {
            e.preventDefault();
            e.stopPropagation();
            toggleMap();
        }

        if (e.code === 'Escape' && state.open) {
            e.preventDefault();
            closeMap();
        }
    }, true);

    function startBackgroundScan() {
        if (state.scanInterval) clearInterval(state.scanInterval);
        state.scanInterval = setInterval(() => {
            if (state.open) return;
            scanChunksAroundPlayer();
        }, 3000);
    }

    window.MF_WORLD_MAP = {
        open: openMap,
        close: closeMap,
        toggle: toggleMap,
        get isOpen() { return state.open; },
        get chunkCount() { return getCurrentCache()?.size || 0; },
        get serverKey() { return state.currentServerKey; },
        get dimensionId() { return state.currentDimensionId; },
        clearCache() {
            const cache = getCurrentCache();
            if (cache) cache.clear();
            console.log(`${TAG} Cache cleared for ${state.currentServerKey}/${state.currentDimensionId}`);
        },
        clearAllCaches() {
            state.serverCaches.clear();
            console.log(`${TAG} All caches cleared.`);
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

    console.log(`${TAG} Loaded. Press U to open.`);
    startBackgroundScan();
})();
