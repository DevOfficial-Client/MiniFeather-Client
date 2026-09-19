// DuckMobs: patos y gansos client-side desde el mod untitledduckmod (assets Bedrock).
// Dos especies: patos (wander/nado/panico/sit) y gansos (intimidan/cargan/muerden + honk ogg).

(function () {
    'use strict';
    const TAG = '[MiniFeather Ducks]';
    if (globalThis.MF_DuckMobs) return;

    const CFG = {
        WANDER_RADIUS: 14,          // radio de patrulla alrededor del spawn del jugador
        RESET_DIST: 40,             // reciclar mob si se aleja demasiado del jugador
        LOOK_SIT_MS: 1800,          // mirar fijo para que un pato se siente
        FLOCK_CAP: 14,              // tope de mobs vivos a la vez
        FLOCK_MIN_MS: 45000,        // minimo entre parvadas
        FLOCK_MAX_MS: 150000,       // maximo entre parvadas
        WATER_SAMPLES: 14           // intentos para hallar una gran masa de agua
    };

    // ---------- especies ----------

    const SPECIES = {
        duck: {
            key: 'duck',
            model: 'duck.geo.json',
            textures: [null],                 // null = png por defecto junto al geo
            weight: 0.7,                      // proporcion de parvadas
            flock: [5, 9],                    // tamano de parvada
            aggressive: false,
            panicDist: 3.2, panicSpeed: 3.4,
            walkSpeed: 1.1, swimSpeed: 1.0,
            callMinMs: 2500, callMaxMs: 14000, callDist: 26,
            idleAnims: ['idle', 'clean', 'dance', 'eat', 'sleep'],
            waterAnims: ['swim', 'idle_swim', 'dive']
        },
        goose: {
            key: 'goose',
            model: 'goose.geo.json',
            textures: ['goose.png', 'canadian_goose.png', 'sus_goose.png', 'untitled_goose.png'],
            weight: 0.3,
            flock: [2, 4],
            aggressive: true,
            panicDist: 0, panicSpeed: 0,      // los gansos no huyen
            walkSpeed: 0.9, swimSpeed: 0.85,
            intimidateDist: 7,                // empieza a intimidar si el jugador entra
            chargeDist: 4.2,                  // carga si el jugador sigue acercandose
            biteDist: 1.7,
            chargeSpeed: 2.9,
            chargeMaxMs: 3500,
            cooldownMs: 5000,
            callMinMs: 3500, callMaxMs: 18000, callDist: 30,
            idleAnims: ['idle', 'idle', 'clean', 'eat', 'sit'],
            waterAnims: ['swim', 'idle_swim', 'swim_idle']
        }
    };

    const state = {
        enabled: false,
        mobs: [],                   // { id, rec, sp, ai:{...} }
        nextFlock: 0,               // timestamp de la proxima parvada
        stamp: { alive: true }
    };

    // ---------- utilidades del juego ----------

    function getGame() {
        const direct = [globalThis.miniblox, globalThis.__MINIBLOX_GAME__, globalThis.__MB?.game, globalThis.game];
        for (const g of direct) if (g?.player?.pos) return g;
        try {
            const react = document.querySelector('#react');
            if (react) {
                for (const root of Object.values(react)) {
                    const g = root?.updateQueue?.baseState?.element?.props?.game;
                    if (g?.player?.pos) return g;
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
            const bs = chunk.getBlockState({ x: fx, y: fy, z: fz });
            return bs || null;
        } catch { return null; }
    }

    // nombres de bloque via cache por id (estilo WetnessSystem)
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

    // pasto, flores y similares: no bloquean el paso ni cuentan como suelo
    const PASSABLE_RE = /(^|_)(grass|tall_grass|fern|seagrass|flower|tulip|dandelion|poppy|orchid|allium|bluet|cornflower|lily|sunflower|rose|peony|sapling|wheat|carrot|potato|beetroot|mushroom|snow_layer|dead_bush|sweet_berry|bush|vine|kelp)$/;

    function isSolidAt(x, y, z) {
        const bs = blockIdAt(x, y, z);
        if (!bs || !bs.id) return false;
        const n = blockName(bs);
        if (!n) return true; // sin nombre: asumir solido
        if (PASSABLE_RE.test(n) || /(^|_)(air|torch|rail|carpet|web|fire)/.test(n)) return false;
        return true;
    }

    function groundYAt(x, y, z) {
        for (let dy = 0; dy < 6; dy++) {
            const yy = y - dy;
            if (!isSolidAt(x, yy, z)) {
                // no solido: si es aire/pasto sigue bajando; agua detiene la busqueda
                if (isWaterAt(x, yy, z)) return null;
                continue;
            }
            return yy;
        }
        return null;
    }

    function waterSurfaceY(x, y, z) {
        let sy = Math.floor(y) + 0.9;
        for (let i = 0; i < 3; i++) {
            if (isWaterAt(x, sy + 1, z)) sy += 1;
            else break;
        }
        return sy;
    }

    function playerLookingAt(pos, threshold) {
        try {
            const cam = getGame()?.gameScene?.camera;
            if (!cam?.matrixWorld) return false;
            const e = cam.matrixWorld.elements;
            const fx = -e[8], fy = -e[9], fz = -e[10];
            const p = playerPos();
            if (!p) return false;
            const ox = p.x, oy = p.y + 1.62, oz = p.z;
            let dx = pos.x - ox, dy = pos.y - oy, dz = pos.z - oz;
            const d = Math.hypot(dx, dy, dz);
            if (d < 1e-4) return true;
            dx /= d; dy /= d; dz /= d;
            return (fx * dx + fy * dy + fz * dz) >= (threshold ?? 0.9);
        } catch { return false; }
    }

    // ---------- sonido: quack sintetizado (pato) + honk ogg (ganso) ----------

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

    let quackBuf = null;
    function playQuack(actx, dist) {
        try {
            if (!quackBuf) {
                const dur = 0.16;
                quackBuf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
                const ch = quackBuf.getChannelData(0);
                for (let i = 0; i < ch.length; i++) {
                    const t = i / actx.sampleRate;
                    const env = Math.min(1, t / 0.012) * Math.exp(-t / 0.05);
                    const f = 560 - 160 * (t / dur);
                    ch[i] = env * Math.sin(2 * Math.PI * f * t) * 0.6
                        + env * 0.25 * Math.sin(2 * Math.PI * f * 2 * t);
                }
            }
            playBuf(actx, quackBuf, dist, 0.35, 0.92 + Math.random() * 0.18);
        } catch {}
    }

    // honks reales del mod (goose_honk.ogg / _2 / _3), decodificados bajo demanda
    const HONK_FILES = ['goose_honk.ogg', 'goose_honk_2.ogg', 'goose_honk_3.ogg'];
    const honks = { loading: false, bufs: [] };

    async function loadHonks(actx) {
        if (honks.loading) return;
        honks.loading = true;
        for (const f of HONK_FILES) {
            try {
                const url = chrome.runtime.getURL('models/entities/' + f);
                const data = await (await fetch(url)).arrayBuffer();
                const buf = await actx.decodeAudioData(data);
                honks.bufs.push(buf);
            } catch {}
        }
        if (!honks.bufs.length) console.warn(TAG + ' no se pudieron decodificar los honk ogg');
    }

    function synthHonk(actx) {
        // respaldo si el ogg no decodifica: graznido grave sintetizado
        const dur = 0.42;
        const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) {
            const t = i / actx.sampleRate;
            const env = Math.min(1, t / 0.02) * Math.exp(-t / 0.16);
            const f = 300 - 90 * (t / dur);
            ch[i] = env * (Math.sin(2 * Math.PI * f * t) * 0.6
                + Math.sin(2 * Math.PI * f * 1.5 * t) * 0.3);
        }
        return buf;
    }

    function playHonk(actx, dist, fast) {
        try {
            const pool = honks.bufs.length ? honks.bufs : null;
            const buf = pool ? pool[(Math.random() * pool.length) | 0] : synthHonk(actx);
            playBuf(actx, buf, dist, 0.5, fast ? 1.12 + Math.random() * 0.1 : 0.96 + Math.random() * 0.1);
        } catch {}
    }

    function playBuf(actx, buf, dist, maxDist, rate) {
        try {
            const src = actx.createBufferSource();
            src.buffer = buf;
            const gain = actx.createGain();
            gain.gain.value = Math.max(0, 1 - dist / maxDist);
            src.playbackRate.value = rate;
            src.connect(gain).connect(actx.destination);
            src.start();
        } catch {}
    }

    // ---------- spawn en parvadas sobre grandes masas de agua ----------

    function pickSpecies() {
        let r = Math.random();
        for (const sp of Object.values(SPECIES)) {
            if (r < sp.weight) return sp;
            r -= sp.weight;
        }
        return SPECIES.duck;
    }

    function waterBodyScore(x, z) {
        // cuenta muestras de agua en una cruz 5x5 centrada en (x, z); y del jugador -1
        const y = Math.floor((playerPos()?.y ?? 64) - 1);
        let n = 0;
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                if (isWaterAt(x + dx, y, z + dz)) n++;
            }
        }
        return n; // 25 = masa grande
    }

    function findWaterSpot(center) {
        // busca en anillos crecientes un punto con mucha agua alrededor
        let best = null, bestScore = 0;
        for (let i = 0; i < CFG.WATER_SAMPLES; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 8 + Math.random() * (CFG.WANDER_RADIUS + 10);
            const x = Math.floor(center.x + Math.cos(a) * r);
            const z = Math.floor(center.z + Math.sin(a) * r);
            const score = waterBodyScore(x, z);
            if (score > bestScore) { bestScore = score; best = { x: x + 0.5, z: z + 0.5 }; }
        }
        return bestScore >= 18 ? best : null; // solo grandes masas (>=72% agua en 5x5)
    }

    function waterSurfaceAt(spot) {
        const y = Math.floor((playerPos()?.y ?? 64) - 1);
        // sube hasta hallar la superficie del agua
        for (let dy = 0; dy < 6; dy++) {
            if (isWaterAt(spot.x, y + dy, spot.z)) return waterSurfaceY(spot.x, y + dy, spot.z);
        }
        return y + 0.9;
    }

    function spawnMobAt(sp, x, y, z, dir) {
        const CM = globalThis.MF_CustomModels;
        if (!CM) return null;
        const texture = sp.textures[(Math.random() * sp.textures.length) | 0];
        const opts = {
            id: sp.key + Math.floor(Math.random() * 1e9),
            scale: 1,
            stay: true,
            lookAtPlayer: false,
            persist: false,
            bob: false,
            anim: 'swim'
        };
        if (texture) opts.texture = texture; // variante de skin (CustomModels: loadModel(file, texOverride))
        const id = CM.spawn(sp.model, x, y, z, opts);
        if (!id) return null;
        const mob = {
            id,
            rec: null,
            sp,
            flockCenter: { x, z },
            ai: {
                mode: 'swim',         // nacen nadando en el agua
                until: performance.now() + 1500 + Math.random() * 3500,
                dir: dir + (Math.random() - 0.5) * 0.8,
                speed: 0,
                nextCall: performance.now() + 1500 + Math.random() * sp.callMaxMs,
                sitting: false,
                sitSince: 0,
                lookHold: 0,
                panicDir: 0,
                aggroUntil: 0
            }
        };
        state.mobs.push(mob);
        return mob;
    }

    function spawnFlock() {
        const player = playerPos();
        if (!player) return 0;
        const spot = findWaterSpot(player);
        if (!spot) return 0;
        const sp = pickSpecies();
        const count = sp.flock[0] + Math.floor(Math.random() * (sp.flock[1] - sp.flock[0] + 1));
        const dir = Math.random() * Math.PI * 2; // rumbo comun de la parvada
        const y = waterSurfaceAt(spot);
        let n = 0;
        for (let i = 0; i < count && state.mobs.length < CFG.FLOCK_CAP; i++) {
            // pequeños offsets para que no nazcan apilados
            const ox = (Math.random() - 0.5) * 3;
            const oz = (Math.random() - 0.5) * 3;
            if (spawnMobAt(sp, spot.x + ox, y, spot.z + oz, dir)) n++;
        }
        if (n) console.log(TAG + ' parvada de ' + n + ' ' + (sp.key === 'goose' ? 'gansos' : 'patos'));
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

    function callMaybe(mob, t, dPlayer, force) {
        const sp = mob.sp, ai = mob.ai;
        if (dPlayer > sp.callDist) return;
        const actx = audioCtx();
        if (!actx) return;
        if (force || t >= ai.nextCall) {
            if (sp.key === 'goose') {
                if (!honks.loading && !honks.bufs.length) loadHonks(actx);
                playHonk(actx, dPlayer, force);
                // el ganso estira el cuello al graznar (si no esta ocupado)
                if (ai.mode === 'idle' || ai.mode === 'swim') {
                    const inWater = mobPos(mob) ? isWaterAt(mobPos(mob).x, mobPos(mob).y - 0.2, mobPos(mob).z) : false;
                    setAnim(mob, inWater ? 'honk_swim' : 'honk');
                    ai.until = Math.min(ai.until, t + 1400);
                }
            } else {
                playQuack(actx, dPlayer);
            }
            ai.nextCall = t + sp.callMinMs + Math.random() * sp.callMaxMs;
        }
    }

    // IA de agresion del ganso: intimidar -> cargar -> morder
    function gooseAggroTick(mob, ai, t, dPlayer, player, p) {
        const sp = mob.sp;
        if (t < ai.aggroUntil) return false;

        // morder: contacto tras una carga
        if (ai.mode === 'charge' && dPlayer < sp.biteDist) {
            ai.mode = 'bite';
            ai.until = t + 700;
            setAnim(mob, 'bite');
            const actx = audioCtx();
            if (actx) { if (!honks.loading && !honks.bufs.length) loadHonks(actx); playHonk(actx, dPlayer, true); }
            ai.nextCall = t + sp.callMinMs;
            return true;
        }
        // cargar: el jugador sigue dentro tras la intimidacion
        if ((ai.mode === 'intimidate' || ai.mode === 'idle' || ai.mode === 'walk' || ai.mode === 'swim') && dPlayer < sp.chargeDist) {
            ai.mode = 'charge';
            ai.until = t + sp.chargeMaxMs;
            setAnim(mob, 'charge');
            ai.dir = Math.atan2(player.x - p.x, player.z - p.z);
            return true;
        }
        // perseguir al jugador mientras carga
        if (ai.mode === 'charge') {
            ai.dir = Math.atan2(player.x - p.x, player.z - p.z);
            return true;
        }
        // intimidar: el jugador entra en el territorio
        if (ai.mode !== 'intimidate' && ai.mode !== 'bite' && dPlayer < sp.intimidateDist) {
            ai.mode = 'intimidate';
            ai.until = t + 1600 + Math.random() * 1200;
            setAnim(mob, 'intimidate');
            callMaybe(mob, t, dPlayer, true);
            return true;
        }
        // seguir encarando al jugador mientras intimida
        if (ai.mode === 'intimidate') {
            ai.dir = Math.atan2(player.x - p.x, player.z - p.z);
            return true;
        }
        return false;
    }

    function aiTick(mob, dt, t) {
        const CM = globalThis.MF_CustomModels;
        if (!CM) return;
        if (!mob.rec) {
            const rec = CM.record?.(mob.id);
            if (!rec?.root) return; // todavia cargando
            mob.rec = rec;
        }
        const root = mob.rec.root;
        if (!root?.position) return;
        const ai = mob.ai;
        const sp = mob.sp;
        const p = root.position;
        const player = playerPos();
        const dPlayer = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity;

        // gestionar reciclaje por distancia: despawnear (la parvada se repone sola)
        if (player && dPlayer > CFG.RESET_DIST) {
            removeMob(mob);
            return;
        }

        const inWater = isWaterAt(p.x, p.y - 0.2, p.z);

        // al entrar/salir del agua cambia la animacion de locomocion
        if (inWater !== ai.wasWater) {
            ai.wasWater = inWater;
            if (inWater) {
                if (ai.mode === 'walk') { ai.mode = 'swim'; setAnim(mob, 'swim'); }
                else if (ai.mode === 'panic') setAnim(mob, 'panic_swim');
                else if (ai.mode === 'idle' || ai.mode === 'sit') setAnim(mob, 'idle_swim');
            } else {
                if (ai.mode === 'swim') { ai.mode = 'walk'; setAnim(mob, 'walk'); }
                else if (ai.mode === 'idle') setAnim(mob, 'idle');
            }
        }

        if (sp.aggressive && player) {
            const handled = gooseAggroTick(mob, ai, t, dPlayer, player, p);
            if (handled) {
                moveMob(mob, dt, t, inWater);
                return;
            }
        } else if (ai.mode !== 'panic' && player && dPlayer < sp.panicDist && !ai.sitting) {
            // el pato huye; los gansos nunca entran aqui (panicDist 0 + aggressive)
            ai.mode = 'panic';
            ai.until = t + 2200 + Math.random() * 1800;
            ai.panicDir = Math.atan2(p.x - player.x, p.z - player.z);
            setAnim(mob, inWater ? 'panic_swim' : 'panic');
            callMaybe(mob, t, dPlayer, true);
        }

        // sentarse si el jugador lo mira fijamente un rato (solo patos)
        if (!sp.aggressive && ai.mode !== 'panic' && player && dPlayer > 5 && dPlayer < 20 && playerLookingAt(p, 0.94)) {
            ai.lookHold = (ai.lookHold || 0) + dt * 1000;
            if (ai.lookHold > CFG.LOOK_SIT_MS && ai.mode !== 'sit') {
                ai.mode = 'sit';
                ai.sitting = true;
                ai.sitSince = t;
                ai.until = t + 4000 + Math.random() * 4000;
                setAnim(mob, 'sit');
            }
        } else {
            ai.lookHold = 0;
        }
        // el ganso responde con un graznido si lo miras fijamente
        if (sp.aggressive && player && dPlayer < 18 && playerLookingAt(p, 0.94)) {
            ai.lookHold = (ai.lookHold || 0) + dt * 1000;
            if (ai.lookHold > 1200 && t > ai.nextCall) {
                callMaybe(mob, t, dPlayer, true);
                ai.lookHold = 0;
            }
        } else if (sp.aggressive) {
            ai.lookHold = 0;
        }

        if (t >= ai.until) chooseNext(mob, t);

        moveMob(mob, dt, t, inWater);
        callMaybe(mob, t, dPlayer, false);
    }

    function moveMob(mob, dt, t, inWater) {
        const ai = mob.ai, sp = mob.sp;
        const p = mob.rec.root.position;
        let speed = 0;
        if (ai.mode === 'walk') speed = sp.walkSpeed;
        else if (ai.mode === 'swim') speed = sp.swimSpeed;
        else if (ai.mode === 'panic') speed = sp.panicSpeed;
        else if (ai.mode === 'charge') speed = sp.chargeSpeed;

        if (speed > 0) {
            const step = speed * dt;
            const nx = p.x + Math.sin(ai.dir) * step;
            const nz = p.z + Math.cos(ai.dir) * step;
            const c = mob.flockCenter;
            let blocked = false;
            if (c && ai.mode !== 'charge') {
                if (Math.hypot(nx - c.x, nz - c.z) > CFG.WANDER_RADIUS) blocked = true;
            }
            if (!blocked) {
                const aheadY = groundYAt(nx, p.y + 1.2, nz);
                if (aheadY != null && aheadY > p.y + 1.05 && !inWater) blocked = true;
            }
            if (blocked) {
                ai.dir += Math.PI * (0.5 + Math.random() * 0.75);
            } else {
                p.x = nx;
                p.z = nz;
                if (inWater) {
                    const wy = waterSurfaceY(p.x, p.y, p.z);
                    p.y += (wy - p.y) * Math.min(1, dt * 4);
                } else {
                    const gy = groundYAt(p.x, p.y + 1, p.z);
                    if (gy != null) p.y += (gy + 1 - p.y) * Math.min(1, dt * 10);
                }
            }
        }
        // orientar (rec.yaw: tickCustoms lo aplica cuando no sigue al player)
        if (speed > 0 || ai.mode === 'intimidate') {
            const targetYaw = Math.atan2(-Math.sin(ai.dir), -Math.cos(ai.dir));
            let dy = targetYaw - (mob.rec.yaw || 0);
            while (dy > Math.PI) dy -= 2 * Math.PI;
            while (dy < -Math.PI) dy += 2 * Math.PI;
            mob.rec.yaw += dy * Math.min(1, dt * (ai.mode === 'charge' ? 10 : 6));
        }
    }

    function chooseNext(mob, t) {
        const ai = mob.ai, sp = mob.sp;
        const p = mobPos(mob);
        const inWater = p ? isWaterAt(p.x, p.y - 0.2, p.z) : false;
        const r = Math.random();
        ai.sitting = false;

        if (ai.mode === 'panic') {
            ai.mode = 'idle';
            ai.until = t + 600 + Math.random() * 1800;
            setAnim(mob, inWater ? 'idle_swim' : 'idle');
            return;
        }
        if (ai.mode === 'bite') {
            // tras morder: retirarse y enfriar la agresion
            ai.mode = 'walk';
            ai.dir += Math.PI + (Math.random() - 0.5);
            ai.until = t + 2200 + Math.random() * 1200;
            ai.aggroUntil = t + sp.cooldownMs + Math.random() * 4000;
            setAnim(mob, 'walk');
            return;
        }
        if (ai.mode === 'charge') {
            // se rindio: enfriar y volver a deambular
            ai.mode = 'idle';
            ai.until = t + 1200 + Math.random() * 1500;
            ai.aggroUntil = t + sp.cooldownMs + Math.random() * 4000;
            setAnim(mob, inWater ? 'idle_swim' : 'idle');
            return;
        }
        if (ai.mode === 'intimidate') {
            // la intimidacion no asusto al jugador: cargar
            ai.mode = 'charge';
            ai.until = t + sp.chargeMaxMs;
            setAnim(mob, 'charge');
            return;
        }

        const anims = inWater ? sp.waterAnims : sp.idleAnims;
        if (!inWater && r < 0.5) {
            ai.mode = 'walk';
            setAnim(mob, 'walk');
            ai.dir = Math.random() * Math.PI * 2;
        } else if (!inWater && r < 0.62) {
            ai.mode = 'idle';
            setAnim(mob, 'clean');
        } else {
            ai.mode = 'idle';
            setAnim(mob, anims[(Math.random() * anims.length) | 0]);
            if (inWater) ai.dir = Math.random() * Math.PI * 2;
        }
        ai.until = t + 2500 + Math.random() * 4500;
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

        // parvadas: cada 45-150s aparece una (patos 5-9, gansos 2-4) sobre una gran masa de agua
        if (p && !state.nextFlock) {
            state.nextFlock = t + CFG.FLOCK_MIN_MS + Math.random() * (CFG.FLOCK_MAX_MS - CFG.FLOCK_MIN_MS);
        } else if (p && t >= state.nextFlock && state.mobs.length < CFG.FLOCK_CAP) {
            spawnFlock(); // si no hallo agua, reintenta en el proximo tick corto
            state.nextFlock = t + (state.mobs.length ? CFG.FLOCK_MIN_MS + Math.random() * (CFG.FLOCK_MAX_MS - CFG.FLOCK_MIN_MS) : 8000);
        }

        for (const mob of [...state.mobs]) {
            try { aiTick(mob, dt, t); } catch {}
        }

        schedule();
    }

    function schedule() {
        requestAnimationFrame(() => { if (state.stamp.alive) tick(); });
    }

    // ---------- API publica ----------

    globalThis.MF_DuckMobs = {
        start() {
            if (state.enabled) return true;
            if (!globalThis.MF_CustomModels) {
                console.warn(TAG + ' requiere MF_CustomModels (CustomModels.js)');
                return false;
            }
            state.enabled = true;
            state.stamp = { alive: true };
            state.lastT = performance.now();
            state.nextFlock = 0; // primera parvada al proximo tick
            schedule();
            console.log(TAG + ' activado (parvadas de patos y gansos)');
            return true;
        },
        stop() {
            state.enabled = false;
            state.stamp.alive = false;
            for (const mob of [...state.mobs]) removeMob(mob);
            state.nextFlock = 0;
            console.log(TAG + ' desactivado');
        },
        count() { return state.mobs.length; },
        counts() {
            const out = { duck: 0, goose: 0 };
            for (const m of state.mobs) out[m.sp.key] = (out[m.sp.key] || 0) + 1;
            return out;
        },
        clear() {
            for (const mob of [...state.mobs]) { try { removeMob(mob); } catch {} }
            return true;
        }
    };

    // auto-arranque si ya esta habilitado en settings
    try {
        const saved = localStorage.getItem('mf:duckmobs');
        if (saved && JSON.parse(saved)?.enabled) globalThis.MF_DuckMobs.start();
    } catch {}

    // escucha de settings desde el panel
    document.addEventListener('minifeather:duckmobs-toggle', (ev) => {
        const on = !!(ev?.detail && (() => { try { return JSON.parse(ev.detail).enabled; } catch { return false; } })());
        try { localStorage.setItem('mf:duckmobs', JSON.stringify({ enabled: on })); } catch {}
        if (on) globalThis.MF_DuckMobs.start(); else globalThis.MF_DuckMobs.stop();
    });
})();
