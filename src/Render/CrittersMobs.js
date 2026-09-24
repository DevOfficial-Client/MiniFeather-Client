// CrittersMobs: porte client-side del mod Critters and Companions (2.7.0).
// 16 especies con biomas, pesos y tamanos de grupo del mod original.
// Los patos/gansos siguen en DuckMobs.js; este modulo cubre el resto del bestiario.

(function () {
    'use strict';
    const TAG = '[MiniFeather Critters]';
    if (globalThis.MF_CrittersMobs) return;

    const CFG = {
        CAP: 16,                 // tope de mobs vivos a la vez (rendimiento)
        MIN_MS: 8000,            // minimo entre intentos de grupo
        MAX_MS: 30000,           // maximo entre intentos de grupo
        RETRY_MS: 6000,          // reintento si no hallo lugar
        RESET_DIST: 44,          // reciclar mob si se aleja
        WANDER_RADIUS: 12,
        SPAWN_MIN_R: 10,         // radio minimo de spawn alrededor del jugador
        SPAWN_MAX_R: 30          // radio maximo
    };

    // ---------- especies (weights/grupos del CACCommonConfig original) ----------
    const SPECIES = {
        otter: {
            key: 'otter', model: 'otter.geo.json', textures: [null],
            kind: 'swimmer',
            waterDepth: 0.25,        // nada a flor de agua (lomo afuera)
            biomes: { river: 1 }, flock: [2, 4],
            walkSpeed: 1.6, swimSpeed: 1.9, panicDist: 6,
            callMinMs: 6000, callMaxMs: 16000, callDist: 22,
            idleAnims: ['idle', 'standing_eat'], waterAnims: ['swim', 'swim_2', 'floating_eat'],
            groundAnims: { walk: 'walk', run: 'run' }
        },
        ferret: {
            key: 'ferret', model: 'ferret.geo.json', textures: ['ferret_1.png', 'ferret_2.png'],
            kind: 'ground',
            biomes: { forest: 3, plains: 4 }, flock: [2, 3],
            walkSpeed: 1.7, panicDist: 5,
            callMinMs: 7000, callMaxMs: 20000, callDist: 20,
            idleAnims: ['idle', 'sit', 'sleep'], waterAnims: ['swim'],
            groundAnims: { walk: 'run' }
        },
        koi_fish: {
            key: 'koi_fish', model: 'koi_fish.geo.json',
            textures: ['koi_fish_1.png', 'koi_fish_2.png', 'koi_fish_3.png', 'koi_fish_4.png', 'koi_fish_5.png', 'koi_fish_6.png', 'koi_fish_7.png', 'koi_fish_8.png', 'koi_fish_9.png', 'koi_fish_10.png', 'koi_fish_11.png', 'koi_fish_12.png', 'koi_fish_13.png', 'koi_fish_14.png', 'koi_fish_15.png', 'koi_fish_16.png', 'koi_fish_17.png', 'koi_fish_18.png', 'koi_fish_19.png', 'koi_fish_20.png', 'koi_fish_21.png'],
            kind: 'fish',
            waterDepth: 1.1,        // bien sumergido: la aleta no rompe la superficie
            biomes: { river: 2 }, flock: [2, 5],
            swimSpeed: 1.1, panicDist: 4,
            callMinMs: 9000, callMaxMs: 24000, callDist: 16,
            idleAnims: [], waterAnims: ['koi_fish_swim'],
            groundAnims: { walk: 'koi_fish_on_land' }
        },
        dragonfly: {
            key: 'dragonfly', model: 'dragonfly.geo.json', textures: ['dragonfly.png'],
            kind: 'flyer',
            bob: true,
            biomes: { river: 4, swamp: 5, lush: 10 }, flock: [1, 1],
            flySpeed: 2.2,
            callMinMs: 5000, callMaxMs: 14000, callDist: 18,
            idleAnims: ['dragonfly_sit'], waterAnims: [],
            groundAnims: { walk: 'dragonfly_fly', fly: 'dragonfly_fly' }
        },
        dumbo_octopus: {
            key: 'dumbo_octopus', model: 'dumbo_octopus.geo.json',
            textures: ['dumbo_octopus_1.png', 'dumbo_octopus_2.png', 'dumbo_octopus_3.png', 'dumbo_octopus_4.png'],
            kind: 'fish',
            bottom: true,
            biomes: { ocean: 4, deep_ocean: 4, warm_ocean: 8, lukewarm_ocean: 6, deep_lukewarm_ocean: 6 }, flock: [1, 1],
            swimSpeed: 0.8, panicDist: 5,
            callMinMs: 12000, callMaxMs: 30000, callDist: 14,
            idleAnims: [], waterAnims: ['dumbo_octopus_swim'],
            groundAnims: { walk: 'dumbo_octopus_on_land' }
        },
        sea_bunny: {
            key: 'sea_bunny', model: 'sea_bunny.geo.json',
            textures: ['sea_bunny_1.png', 'sea_bunny_2.png', 'sea_bunny_3.png'],
            kind: 'fish',
            bottom: true,
            biomes: { ocean: 16, deep_ocean: 16, warm_ocean: 32, lukewarm_ocean: 16, deep_lukewarm_ocean: 16 }, flock: [1, 4],
            swimSpeed: 0.35, panicDist: 3,
            callMinMs: 12000, callMaxMs: 30000, callDist: 10,
            idleAnims: [], waterAnims: ['sea_bunny_move', 'sea_bunny'],
            groundAnims: { walk: 'sea_bunny_move' }
        },
        leaf_insect: {
            key: 'leaf_insect', model: 'leaf_insect.geo.json',
            textures: ['leaf_insect_1.png', 'leaf_insect_2.png', 'leaf_insect_3.png'],
            kind: 'bug',
            biomes: { jungle: 14, forest: 6 }, flock: [1, 1],
            walkSpeed: 0.5, panicDist: 3,
            idleAnims: ['idle', 'dance'], waterAnims: [],
            groundAnims: { walk: 'walk' }
        },
        red_panda: {
            key: 'red_panda', model: 'red_panda.geo.json', textures: [null],
            kind: 'ground',
            sleepDay: true,
            biomes: { jungle: 8 }, flock: [1, 2],
            walkSpeed: 1.1, panicDist: 6,
            callMinMs: 8000, callMaxMs: 22000, callDist: 22,
            idleAnims: ['idle', 'sit'], waterAnims: ['swim'],
            groundAnims: { walk: 'walk', run: 'run' }
        },
        jumping_spider: {
            key: 'jumping_spider', model: 'jumping_spider.geo.json',
            textures: ['jumping_spider_1.png', 'jumping_spider_2.png', 'jumping_spider_3.png', 'jumping_spider_4.png', 'jumping_spider_5.png', 'jumping_spider_6.png', 'jumping_spider_7.png', 'jumping_spider_8.png'],
            kind: 'bug',
            biomes: { jungle: 2, forest: 2, lush: 4 }, flock: [1, 1],
            walkSpeed: 0.9, panicDist: 3,
            idleAnims: ['idle', 'sit'], waterAnims: [],
            groundAnims: { walk: 'walk' }
        },
        ladybug: {
            key: 'ladybug', model: 'ladybug.geo.json', textures: ['ladybug.png'],
            kind: 'flyer', flyProb: 0.88,
            biomes: { forest: 6, lush: 10, floral: 12 }, flock: [1, 3],
            flySpeed: 1.2,
            idleAnims: ['idle', 'sit'], waterAnims: [],
            groundAnims: { walk: 'walk', fly: 'fly' }
        },
        roly_poly: {
            key: 'roly_poly', model: 'roly_poly.geo.json',
            textures: ['roly_poly_1.png', 'roly_poly_2.png', 'roly_poly_3.png', 'roly_poly_4.png', 'roly_poly_5.png', 'roly_poly_6.png', 'roly_poly_7.png'],
            kind: 'bug',
            biomes: { forest: 5, lush: 10, swamp: 10 }, flock: [1, 3],
            walkSpeed: 0.4, panicDist: 2,
            idleAnims: ['idle', 'dance'], waterAnims: [],
            groundAnims: { walk: 'walk' }
        },
        snail: {
            key: 'snail', model: 'snail.geo.json',
            textures: ['snail_1.png', 'snail_2.png', 'snail_3.png', 'snail_gary.png'],
            kind: 'bug',
            biomes: { forest: 5, lush: 8, swamp: 10 }, flock: [1, 2],
            walkSpeed: 0.18, panicDist: 0,
            idleAnims: ['idle', 'dance', 'hide'], waterAnims: [],
            groundAnims: { walk: 'walk' }
        },
        stag_beetle: {
            key: 'stag_beetle', model: 'stag_beetle.geo.json',
            textures: ['stag_beetle_1.png', 'stag_beetle_2.png', 'stag_beetle_3.png', 'stag_beetle_4.png', 'stag_beetle_5.png', 'stag_beetle_6.png'],
            kind: 'bug',
            biomes: { forest: 4, lush: 10 }, flock: [1, 2],
            walkSpeed: 0.6, panicDist: 2,
            idleAnims: ['idle', 'dance', 'sit'], waterAnims: [],
            groundAnims: { walk: 'walk' }
        },
        stick_bug: {
            key: 'stick_bug', model: 'stick_bug.geo.json',
            textures: ['stick_bug_1.png', 'stick_bug_2.png', 'stick_bug_3.png'],
            kind: 'bug',
            biomes: { forest: 4, lush: 10 }, flock: [1, 2],
            walkSpeed: 0.45, panicDist: 2,
            idleAnims: ['idle', 'dance', 'sit'], waterAnims: [],
            groundAnims: { walk: 'walk' }
        },
        weevil: {
            key: 'weevil', model: 'weevil.geo.json', textures: ['weevil.png'],
            kind: 'bug',
            biomes: { forest: 4, lush: 10 }, flock: [1, 3],
            walkSpeed: 0.5, panicDist: 2,
            idleAnims: ['idle', 'dance', 'sit'], waterAnims: [],
            groundAnims: { walk: 'walk' }
        },
        shima_enaga: {
            key: 'shima_enaga', model: 'shima_enaga.geo.json', textures: ['shima_enaga.png'],
            kind: 'flyer',
            biomes: { snowy: 3 }, flock: [2, 3],
            flySpeed: 1.4,
            callMinMs: 6000, callMaxMs: 16000, callDist: 20,
            idleAnims: ['idle', 'sit'], waterAnims: [],
            groundAnims: { walk: 'fly', fly: 'fly' }
        }
    };

    const state = {
        enabled: false,
        mobs: [],
        nextGroup: 0,
        stamp: { alive: true },
        playerTrack: { onGround: true, landedAt: 0, sprinting: false }
    };

    // ---------- utilidades del juego (mismo acceso que DuckMobs) ----------

    // Caché de escaneo: blockIdAt() llama getGame() por cada bloque consultado
    // en los loops de spawn — sin caché, un querySelector('#react') por bloque.
    let _gameCache = { game: null, at: 0 };
    function getGame() {
        const direct = [globalThis.miniblox, globalThis.__MINIBLOX_GAME__, globalThis.__MB?.game, globalThis.game];
        for (const g of direct) if (g?.player?.pos) return g;
        const now = performance.now();
        if (_gameCache.game?.player?.pos && now - _gameCache.at < 1000) return _gameCache.game;
        try {
            const react = document.querySelector('#react');
            if (react) {
                for (const root of Object.values(react)) {
                    const g = root?.updateQueue?.baseState?.element?.props?.game;
                    if (g?.player?.pos) { _gameCache = { game: g, at: now }; return g; }
                }
            }
        } catch {}
        return null;
    }

    function playerPos() { return getGame()?.player?.pos || null; }

    function blockIdAt(x, y, z) {
        const world = getGame()?.world;
        if (!world) return null;
        const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
        if (fy < 0 || fy > 255) return 0;
        try {
            const proto = Object.getPrototypeOf(world);
            if (typeof proto.getChunk !== 'function') return null;
            const chunk = proto.getChunk.call(world, { x: fx, y: fy, z: fz });
            if (chunk == null || chunk.isDummyChunk) return null;
            return chunk.getBlockState({ x: fx, y: fy, z: fz }) || null;
        } catch { return null; }
    }

    const nameCache = new Map();
    function blockName(bs) {
        if (!bs) return '';
        const id = Number(bs.id);
        if (Number.isFinite(id) && nameCache.has(id)) return nameCache.get(id);
        let name = '';
        try {
            const block = bs.getBlock?.() || bs.block || bs._block || null;
            name = String(block?.name || block?.id || bs.name || '').toLowerCase();
        } catch {}
        if (Number.isFinite(id) && name) nameCache.set(id, name);
        return name;
    }

    const WATER_IDS = new Set();
    function isWaterAt(x, y, z) {
        const bs = blockIdAt(x, y, z);
        if (!bs || !bs.id) return false;
        if (WATER_IDS.has(bs.id)) return true;
        const n = blockName(bs);
        if (n === 'water' || n === 'flowing_water' || /(^|_)water($|_)/.test(n)) {
            WATER_IDS.add(bs.id);
            return true;
        }
        return false;
    }

    const PASSABLE_RE = /(^|_)(grass|tall_grass|fern|seagrass|flower|tulip|dandelion|poppy|orchid|allium|bluet|cornflower|lily|sunflower|rose|peony|sapling|wheat|carrot|potato|beetroot|mushroom|snow_layer|dead_bush|sweet_berry|bush|vine|kelp)$/;
    function isSolidAt(x, y, z) {
        const bs = blockIdAt(x, y, z);
        if (!bs || !bs.id) return false;
        const n = blockName(bs);
        if (!n) return true;
        if (PASSABLE_RE.test(n) || /(^|_)(air|torch|rail|carpet|web|fire)/.test(n)) return false;
        return true;
    }

    function groundYAt(x, y, z) {
        for (let dy = 0; dy < 7; dy++) {
            const yy = y - dy;
            if (!isSolidAt(x, yy, z)) {
                if (isWaterAt(x, yy, z)) return null;
                continue;
            }
            return yy;
        }
        return null;
    }

    function waterSurfaceY(x, y, z) {
        let fy = Math.floor(y);
        if (!isWaterAt(x, fy, z)) {
            let found = false;
            for (let dy = 1; dy <= 2 && !found; dy++) {
                if (isWaterAt(x, fy + dy, z)) { fy += dy; found = true; }
            }
            for (let dy = 1; dy <= 2 && !found; dy++) {
                if (isWaterAt(x, fy - dy, z)) { fy -= dy; found = true; }
            }
            if (!found) return y;
        }
        while (fy < 255 && isWaterAt(x, fy + 1, z)) fy += 1;
        return fy + 0.9;
    }

    // ---------- biomas ----------

    function biomeAt(x, y, z) {
        const game = getGame();
        for (const call of [
            () => game?.world?.getBiomeAt?.(x, y, z),
            () => game?.world?.getBiome?.(x, y, z),
            () => game?.world?.getChunk?.({ x, y, z })?.getBiomeAt?.(x, y, z),
            () => game?.world?.getChunkAt?.(x, z)?.getBiomeAt?.(x, y, z)
        ]) {
            try { const v = call(); if (v !== undefined && v !== null) return v; } catch {}
        }
        return null;
    }

    function biomeKey(v) {
        if (v == null) return 'any';
        let text = '';
        if (typeof v === 'string' || typeof v === 'number') text = String(v);
        else try { text = String(v.name || '') + ' ' + String(v.id || '') + ' ' + String(v.key || ''); } catch {}
        text = text.toLowerCase();
        if (!text.trim()) return 'any';
        if (/deep/.test(text) && /ocean|sea/.test(text)) return 'deep_ocean';
        if (/ocean|sea/.test(text) && /warm/.test(text)) return 'warm_ocean';
        if (/ocean|sea/.test(text) && /lukewarm/.test(text)) return 'lukewarm_ocean';
        if (/ocean|sea/.test(text)) return 'ocean';
        if (/river/.test(text)) return 'river';
        if (/swamp|mangrove|marsh/.test(text)) return 'swamp';
        if (/jungle|bamboo/.test(text)) return 'jungle';
        if (/snow|ice|frozen|tundra|taiga|glacier|polar|alpine|frigid/.test(text)) return 'snowy';
        if (/lush/.test(text)) return 'lush';
        if (/forest|woods|grove|birch/.test(text)) return 'forest';
        if (/flower|floral|cherry/.test(text)) return 'floral';
        if (/plains|meadow|savanna|steppe/.test(text)) return 'plains';
        return 'any';
    }

    function currentBiomeKey() {
        const p = playerPos();
        if (!p) return 'any';
        return biomeKey(biomeAt(p.x, p.y, p.z));
    }

    // ---------- audio ----------

    function audioCtx() {
        return getGame()?.gameScene?.audio?.context
            || getGame()?.audio?.context
            || globalThis.__mfAudioCtx
            || (() => {
                try {
                    globalThis.__mfAudioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
                    return globalThis.__mfAudioCtx;
                } catch { return null; }
            })();
    }

    // sonidos copiados a models/entities/ sin subdirectorios
    const SOUNDS = {
        otter: ['otter/ambient_1.ogg', 'otter/ambient_2.ogg'],
        ferret: ['ferret/ambient_1.ogg', 'ferret/ambient_2.ogg', 'ferret/ambient_3.ogg'],
        red_panda: ['red_panda/ambient_1.ogg', 'red_panda/ambient_2.ogg'],
        shima_enaga: ['shima_enaga/ambient_1.ogg', 'shima_enaga/ambient_2.ogg']
    };
    const soundCache = new Map();
    function playSpeciesSound(sp, dist, actx) {
        const files = SOUNDS[sp.key];
        if (!files) return;
        const file = files[(Math.random() * files.length) | 0];
        const base = file.split('/').pop();
        let p = soundCache.get(file);
        if (!p) {
            p = (async () => {
                const url = chrome.runtime.getURL('models/entities/' + base);
                const data = await (await fetch(url)).arrayBuffer();
                return actx.decodeAudioData(data);
            })();
            soundCache.set(file, p);
        }
        p.then((buf) => {
            try {
                const src = actx.createBufferSource();
                src.buffer = buf;
                const gain = actx.createGain();
                gain.gain.value = Math.max(0, 1 - dist / (sp.callDist * 1.4)) * 0.6;
                src.connect(gain).connect(actx.destination);
                src.start();
            } catch {}
        }).catch(() => soundCache.delete(file));
    }

    // ---------- spawn ----------

    function pickSpeciesForBiome(bk) {
        const pool = [];
        for (const sp of Object.values(SPECIES)) {
            const w = sp.biomes[bk] || 0;
            if (w > 0) pool.push([sp, w]);
        }
        if (!pool.length) return null;
        let total = 0;
        for (const [, w] of pool) total += w;
        let r = Math.random() * total;
        for (const [sp, w] of pool) {
            if (r < w) return sp;
            r -= w;
        }
        return pool[pool.length - 1][0];
    }

    function findWaterY(x, z) {
        const py = Math.floor(playerPos()?.y ?? 64);
        for (let dy = 0; dy >= -8; dy--) {
            if (isWaterAt(x, py + dy, z)) return py + dy;
        }
        for (let dy = 1; dy <= 3; dy++) {
            if (isWaterAt(x, py + dy, z)) return py + dy;
        }
        return null;
    }

    function findSpawnSpot(player, sp) {
        for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = CFG.SPAWN_MIN_R + Math.random() * (CFG.SPAWN_MAX_R - CFG.SPAWN_MIN_R);
            const x = Math.floor(player.x + Math.cos(a) * r);
            const z = Math.floor(player.z + Math.sin(a) * r);
            if (sp.kind === 'fish' || sp.kind === 'swimmer') {
                const wy = findWaterY(x, z);
                if (wy == null) continue;
                return { x: x + 0.5, y: wy, z: z + 0.5, water: true };
            }
            if (sp.kind === 'flyer') {
                const gy = groundYAt(x + 0.5, player.y + 2, z + 0.5);
                if (gy == null) continue;
                return { x: x + 0.5, y: gy + 2 + Math.random() * 2, z: z + 0.5 };
            }
            const gy = groundYAt(x + 0.5, player.y + 2, z + 0.5);
            if (gy == null || isWaterAt(x + 0.5, gy + 1, z + 0.5)) continue;
            return { x: x + 0.5, y: gy + 1, z: z + 0.5 };
        }
        return null;
    }

    function spawnMob(sp, spot, dir) {
        const CM = globalThis.MF_CustomModels;
        if (!CM) return null;
        const texture = sp.textures[(Math.random() * sp.textures.length) | 0];
        const startAnim = sp.kind === 'flyer' ? (sp.groundAnims.fly || sp.groundAnims.walk)
            : (sp.kind === 'fish' ? sp.waterAnims[0] : sp.groundAnims.walk);
        const opts = {
            id: 'cac_' + sp.key + '_' + Math.floor(Math.random() * 1e9),
            scale: 1,
            stay: true,
            lookAtPlayer: false,
            persist: false,
            bob: false,
            noPhysics: true,
            anim: startAnim
        };
        if (texture) opts.texture = texture;
        const id = CM.spawn(sp.model, spot.x, spot.y, spot.z, opts);
        if (!id) return null;
        const mob = {
            id, rec: null, sp,
            spawnPhase: Math.random() * Math.PI * 2,
            flockCenter: { x: spot.x, z: spot.z },
            ai: {
                mode: sp.kind === 'flyer' ? 'fly' : (sp.kind === 'fish' ? 'swim' : 'walk'),
                until: performance.now() + 1500 + Math.random() * 3000,
                dir: dir + (Math.random() - 0.5) * 0.8,
                speed: 0,
                nextCall: performance.now() + 2000 + Math.random() * (sp.callMaxMs || 10000)
            }
        };
        state.mobs.push(mob);
        return mob;
    }

    function fallbackSpecies() {
        // bioma desconocido: pool terrestre/volador para que siempre haya vida
        const pool = Object.values(SPECIES).filter(s => s.kind === 'ground' || s.kind === 'bug' || s.kind === 'flyer');
        return pool[(Math.random() * pool.length) | 0] || null;
    }

    function spawnGroup() {
        const player = playerPos();
        if (!player) return 0;
        const bk = currentBiomeKey();
        let sp = pickSpeciesForBiome(bk);
        if (!sp) sp = fallbackSpecies();
        if (!sp) return 0;
        const count = sp.flock[0] + Math.floor(Math.random() * (sp.flock[1] - sp.flock[0] + 1));
        const dir = Math.random() * Math.PI * 2;
        let n = 0;
        for (let i = 0; i < count && state.mobs.length < CFG.CAP; i++) {
            const spot = findSpawnSpot(player, sp);
            if (!spot) break;
            if (spawnMob(sp, spot, dir)) n++;
        }
        if (n) console.log(TAG + ' grupo de ' + n + ' ' + sp.key + ' (bioma ' + bk + ')');
        return n;
    }

    function removeMob(mob) {
        const i = state.mobs.indexOf(mob);
        if (i >= 0) state.mobs.splice(i, 1);
        try { globalThis.MF_CustomModels?.despawn(mob.id, true); } catch {}
    }

    // ---------- IA ----------

    function setAnim(mob, name) {
        try { globalThis.MF_CustomModels?.setAnim(mob.id, name, 1); } catch {}
    }

    function mobPos(mob) { return mob.rec?.root?.position || null; }

    function isDayTime() {
        try {
            const t = getGame()?.world?.time ?? 6000;
            return (t % 24000) < 12000;
        } catch { return true; }
    }

    // ruido del jugador: salto-aterrizaje y sprint -> evento para especies timid as
    function updatePlayerNoise(t) {
        const game = getGame();
        const player = game?.player;
        if (!player) { state.playerTrack.onGround = true; state.playerTrack.sprinting = false; return null; }
        const tr = state.playerTrack;
        const grounded = player.onGround === true || player.grounded === true;
        let noise = null;
        if (tr.onGround === false && grounded) {
            // acaba de aterrizar
            const fallVy = Number(player.motion?.y ?? player.velocity?.y ?? 0);
            if (fallVy >= -0.2) { noise = { type: 'land', power: 1 }; tr.landedAt = t; }
        }
        if (!noise && player.sprinting === true && tr.sprinting !== true) {
            noise = { type: 'sprint', power: 0.6 };
        }
        tr.onGround = grounded;
        tr.sprinting = player.sprinting === true;
        return noise;
    }

    function noiseRadius(power) {
        return 14 * power;   // aterrizar: 14 bloques, sprint: ~8
    }

    function aiTick(mob, dt, t, playerNoise) {
        const CM = globalThis.MF_CustomModels;
        if (!CM) return;
        if (!mob.rec) {
            const rec = CM.record?.(mob.id);
            if (!rec?.root) return;
            mob.rec = rec;
        }
        const root = mob.rec.root;
        if (!root?.position) return;
        const ai = mob.ai;
        const sp = mob.sp;
        const p = root.position;
        const player = playerPos();
        const dPlayer = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity;

        if (player && dPlayer > CFG.RESET_DIST) {
            removeMob(mob);
            return;
        }

        const inWater = isWaterAt(p.x, p.y - 0.2, p.z);

        // panico al acercarse el jugador (los pasivos huyen)
        if (ai.mode !== 'panic' && ai.mode !== 'sleep' && player && sp.panicDist > 0 && dPlayer < sp.panicDist) {
            ai.mode = 'panic';
            ai.until = t + 2000 + Math.random() * 1500;
            ai.panicDir = Math.atan2(p.x - player.x, p.z - player.z);
            const fleeAnim = sp.kind === 'flyer' ? (sp.groundAnims.fly || sp.groundAnims.walk)
                : (inWater ? sp.waterAnims[0] : (sp.groundAnims.run || sp.groundAnims.walk));
            setAnim(mob, fleeAnim);
            ai.panicSpeed = sp.kind === 'flyer' ? sp.flySpeed * 1.5
                : (inWater ? (sp.swimSpeed || 1) * 1.8 : (sp.groundAnims.run ? 2.6 : (sp.walkSpeed || 1) * 2));
            if (ai.panicDir != null) ai.dir = ai.panicDir;
        }

        // ruido (aterrizar de salto / sprint): huye el panda rojo y especies timidas
        if (playerNoise && sp.noiseShy && ai.mode !== 'panic' && dPlayer < noiseRadius(playerNoise.power)) {
            ai.mode = 'panic';
            ai.until = t + 2500 + Math.random() * 2000;
            ai.dir = Math.atan2(p.x - player.x, p.z - player.z) + (Math.random() - 0.5) * 0.6;
            setAnim(mob, sp.groundAnims.run || sp.groundAnims.walk);
            ai.panicSpeed = sp.groundAnims.run ? 2.6 : (sp.walkSpeed || 1) * 2;
        }

        if (t >= ai.until) chooseNext(mob, t, inWater);

        moveMob(mob, dt, t, inWater);

        // sonidos ambientales
        if (player && sp.callDist && t >= ai.nextCall) {
            const d = Math.hypot(player.x - p.x, player.z - p.z);
            if (d < sp.callDist) {
                const actx = audioCtx();
                if (actx) playSpeciesSound(sp, d, actx);
            }
            ai.nextCall = t + (sp.callMinMs || 8000) + Math.random() * (sp.callMaxMs || 16000);
        }
    }

    function chooseNext(mob, t, inWater) {
        const ai = mob.ai, sp = mob.sp;
        const r = Math.random();
        if (ai.mode === 'panic') {
            ai.mode = 'idle';
            ai.until = t + 800 + Math.random() * 2000;
            setAnim(mob, sp.kind === 'fish' ? sp.waterAnims[0] : (sp.idleAnims[0] || 'idle'));
            return;
        }
        if (sp.kind === 'flyer') {
            // especies con flyProb alto (mariquita) pasan casi todo el tiempo volando
            const flyProb = sp.flyProb ?? 0.55;
            if (r < flyProb) {
                ai.mode = 'fly';
                ai.dir += (Math.random() - 0.5) * 1.4;
                setAnim(mob, sp.groundAnims.fly || sp.groundAnims.walk);
                ai.until = t + 3500 + Math.random() * 4500;
            } else {
                ai.mode = 'idle';
                setAnim(mob, sp.idleAnims[(Math.random() * sp.idleAnims.length) | 0] || 'idle');
                ai.until = t + 1000 + Math.random() * 1500;
            }
            return;
        }
        if (sp.kind === 'fish') {
            ai.mode = 'swim';
            ai.dir += (Math.random() - 0.5) * 1.2;
            setAnim(mob, sp.waterAnims[0]);
            ai.until = t + 2000 + Math.random() * 4000;
            return;
        }
        // ground / bug / swimmer
        if (sp.sleepDay && isDayTime() && r < 0.6) {
            ai.mode = 'sleep';
            setAnim(mob, 'sleep');
            ai.until = t + 6000 + Math.random() * 10000;
            return;
        }
        if (r < 0.5) {
            ai.mode = 'walk';
            ai.dir = Math.random() * Math.PI * 2;
            setAnim(mob, sp.groundAnims.walk);
        } else {
            ai.mode = 'idle';
            setAnim(mob, sp.idleAnims[(Math.random() * sp.idleAnims.length) | 0] || 'idle');
        }
        ai.until = t + 2500 + Math.random() * 4500;
    }

    function moveMob(mob, dt, t, inWater) {
        const ai = mob.ai, sp = mob.sp;
        const p = mob.rec.root.position;
        let speed = 0;
        if (ai.mode === 'walk') speed = sp.walkSpeed;
        else if (ai.mode === 'fly') speed = sp.flySpeed;
        else if (ai.mode === 'swim') speed = sp.swimSpeed;
        else if (ai.mode === 'panic') speed = ai.panicSpeed || (sp.walkSpeed || 1) * 2;

        // terrestres/bichos: el agua es barrera
        const hatesWater = (sp.kind === 'ground' || sp.kind === 'bug') && !sp.bottom;

        if (speed > 0) {
            const step = speed * dt;
            const nx = p.x + Math.sin(ai.dir) * step;
            const nz = p.z + Math.cos(ai.dir) * step;
            const c = mob.flockCenter;
            let blocked = false;
            if (c && Math.hypot(nx - c.x, nz - c.z) > CFG.WANDER_RADIUS) blocked = true;
            if (!blocked && hatesWater) {
                if (isWaterAt(nx, p.y - 0.5, nz) || isWaterAt(nx, p.y + 0.5, nz)) blocked = true;
            }
            if (!blocked && ai.mode !== 'fly' && sp.kind !== 'fish' && sp.kind !== 'swimmer') {
                const aheadY = groundYAt(nx, p.y + 1.2, nz);
                if (aheadY != null && aheadY > p.y + 1.05 && !inWater) blocked = true;
            }
            if (blocked) {
                ai.dir += Math.PI * (0.5 + Math.random() * 0.75);
            } else {
                p.x = nx;
                p.z = nz;
                if (sp.kind === 'flyer') {
                    const baseY = groundYAt(p.x, p.y, p.z);
                    const targetY = (baseY != null ? baseY + 1 : p.y) + 1.2 + Math.sin(t / 1800 + mob.spawnPhase) * 0.5;
                    p.y += (targetY - p.y) * Math.min(1, dt * 2);
                } else if (inWater) {
                    const wy = waterSurfaceY(p.x, p.y, p.z);
                    // profundidad objetivo: fondo (bottom) o sumergido (waterDepth = bloques bajo la superficie)
                    const depth = sp.bottom ? null : (sp.waterDepth ?? 0.5);
                    if (sp.bottom) {
                        const gy = groundYAt(p.x, p.y, p.z);
                        const floorY = gy != null ? gy + 0.15 : Math.floor(p.y) + 0.15;
                        p.y += (floorY - p.y) * Math.min(1, dt * 3);
                    } else {
                        const targetY = wy - depth - Math.sin(t / 2600 + mob.spawnPhase) * 0.15;
                        p.y += (targetY - p.y) * Math.min(1, dt * 2.5);
                    }
                } else {
                    const gy = groundYAt(p.x, p.y + 1, p.z);
                    if (gy != null) p.y += (gy + 1 - p.y) * Math.min(1, dt * 10);
                }
            }
        }
        if (speed > 0) {
            const targetYaw = Math.atan2(-Math.sin(ai.dir), -Math.cos(ai.dir));
            let dy = targetYaw - (mob.rec.yaw || 0);
            while (dy > Math.PI) dy -= 2 * Math.PI;
            while (dy < -Math.PI) dy += 2 * Math.PI;
            mob.rec.yaw += dy * Math.min(1, dt * 6);
        }
    }

    // ---------- loop ----------

    function tick() {
        if (!state.enabled) return;
        const t = performance.now();
        let dt = Math.min(0.1, (t - (state.lastT || t)) / 1000);
        state.lastT = t;
        const CM = globalThis.MF_CustomModels;
        if (!CM) { schedule(); return; }
        const p = playerPos();

        if (p && t >= state.nextGroup && state.mobs.length < CFG.CAP) {
            spawnGroup();
            state.nextGroup = t + (state.mobs.length ? CFG.MIN_MS + Math.random() * (CFG.MAX_MS - CFG.MIN_MS) : CFG.RETRY_MS);
        }

        const playerNoise = updatePlayerNoise(t);
        for (const mob of [...state.mobs]) {
            try { aiTick(mob, dt, t, playerNoise); } catch {}
        }
        schedule();
    }

    function schedule() {
        requestAnimationFrame(() => { if (state.stamp.alive) tick(); });
    }

    // ---------- API publica ----------

    globalThis.MF_CrittersMobs = {
        start() {
            if (state.enabled) return true;
            if (!globalThis.MF_CustomModels) {
                console.warn(TAG + ' requiere MF_CustomModels (CustomModels.js)');
                return false;
            }
            state.enabled = true;
            state.stamp = { alive: true };
            state.lastT = performance.now();
            state.nextGroup = 0;
            schedule();
            console.log(TAG + ' activado (' + Object.keys(SPECIES).length + ' especies del mod CAC)');
            return true;
        },
        stop() {
            state.enabled = false;
            state.stamp.alive = false;
            for (const mob of [...state.mobs]) removeMob(mob);
            state.nextGroup = 0;
            console.log(TAG + ' desactivado');
        },
        count() { return state.mobs.length; },
        counts() {
            const out = {};
            for (const m of state.mobs) out[m.sp.key] = (out[m.sp.key] || 0) + 1;
            return out;
        },
        species() { return Object.keys(SPECIES); },
        // spawn manual: 1..n de una especie, alrededor del jugador
        spawnOne(key, n = 1) {
            const sp = SPECIES[key];
            if (!sp) return { ok: false, error: 'unknown species "' + key + '"' };
            if (!globalThis.MF_CustomModels) return { ok: false, error: 'CustomModels not ready' };
            const player = playerPos();
            if (!player) return { ok: false, error: 'player position not available (join a world first)' };
            let spawned = 0;
            for (let i = 0; i < Math.max(1, Math.min(n, 12)); i++) {
                if (state.mobs.length >= CFG.CAP * 2) break;
                const spot = findSpawnSpot(player, sp);
                if (!spot) break;
                if (spawnMob(sp, spot, Math.random() * Math.PI * 2)) spawned++;
            }
            if (!spawned) return { ok: false, error: 'no valid spot found (try open ground / near water for aquatic species)' };
            if (!state.enabled) this.start();   // asegura el loop de IA corriendo
            return { ok: true, spawned, species: sp.key };
        },
        clear() {
            for (const mob of [...state.mobs]) { try { removeMob(mob); } catch {} }
            return true;
        }
    };

    // auto-arranque si ya esta habilitado en settings
    try {
        const saved = localStorage.getItem('mf:critters');
        if (saved && JSON.parse(saved)?.enabled) globalThis.MF_CrittersMobs.start();
    } catch {}

    // escucha de settings desde el panel
    document.addEventListener('minifeather:critters-toggle', (ev) => {
        const on = !!(ev?.detail && (() => { try { return JSON.parse(ev.detail).enabled; } catch { return false; } })());
        try { localStorage.setItem('mf:critters', JSON.stringify({ enabled: on })); } catch {}
        if (on) globalThis.MF_CrittersMobs.start(); else globalThis.MF_CrittersMobs.stop();
    });
})();
