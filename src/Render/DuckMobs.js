// DuckMobs: patos client-side desde el mod untitledduckmod (assets Bedrock).
// Spawnea patos con IA (wander/nado/panico/sit) usando MF_CustomModels.

(function () {
    'use strict';
    const TAG = '[MiniFeather Ducks]';
    if (globalThis.MF_DuckMobs) return;

    const CFG = {
        MODEL: 'duck.geo.json',
        MAX: 12,                    // tope de patos vivos
        WANDER_RADIUS: 14,          // radio de patrulla alrededor del spawn del jugador
        PANIC_DIST: 3.2,            // huyen si el jugador se acerca tanto
        PANIC_SPEED: 3.4,
        WALK_SPEED: 1.1,
        SWIM_SPEED: 1.0,
        QUACK_MIN_MS: 2500,
        QUACK_MAX_MS: 14000,
        QUACK_DIST: 26,
        RESET_DIST: 40              // reciclar pato si se aleja demasiado del jugador
    };

    const state = {
        enabled: false,
        ducks: [],                  // { rec, id, ai:{...} }
        spawnCenter: null,
        lastSpawn: 0,
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
            return bs ? bs.id : 0;
        } catch { return null; }
    }

    const WATER_IDS = new Set();
    function isWaterAt(x, y, z) {
        const id = blockIdAt(x, y, z);
        if (id == null) return false;
        if (!WATER_IDS.size) {
            // heuristicas: agua en la mayoria de voxel games de miniblox
            for (let i = 9; i <= 11; i++) WATER_IDS.add(i); // agua/pocos variantes
            WATER_IDS.add(17); // kelp? no critico
        }
        return WATER_IDS.has(id);
    }

    function groundYAt(x, y, z) {
        // busca el primer bloque solido hacia abajo desde y (max 6)
        for (let dy = 0; dy < 6; dy++) {
            const id = blockIdAt(x, y - dy, z);
            if (id == null) return null;
            if (id !== 0) return y - dy;
        }
        return null;
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

    // ---------- sonido quack ----------

    let quackBuf = null;
    function playQuack(dist) {
        try {
            const actx = getGame()?.gameScene?.audio?.context
                || getGame()?.audio?.context
                || globalThis.__mfAudioCtx
                || (() => {
                    try {
                        globalThis.__mfAudioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
                        return globalThis.__mfAudioCtx;
                    } catch { return null; }
                })();
            if (!actx) return;
            if (!quackBuf) {
                // oscilador simple tipo "quack" (sin asset .ogg en el zip de sonidos)
                const dur = 0.16;
                quackBuf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
                const ch = quackBuf.getChannelData(0);
                for (let i = 0; i < ch.length; i++) {
                    const t = i / actx.sampleRate;
                    // envolvente rapida + pitch descendente (narth call)
                    const env = Math.min(1, t / 0.012) * Math.exp(-t / 0.05);
                    const f = 560 - 160 * (t / dur);
                    ch[i] = env * Math.sin(2 * Math.PI * f * t) * 0.6
                        + env * 0.25 * Math.sin(2 * Math.PI * f * 2 * t);
                }
            }
            const src = actx.createBufferSource();
            src.buffer = quackBuf;
            const gain = actx.createGain();
            const vol = Math.max(0, 1 - dist / CFG.QUACK_DIST) * 0.35;
            gain.gain.value = vol;
            src.playbackRate.value = 0.92 + Math.random() * 0.18;
            src.connect(gain).connect(actx.destination);
            src.start();
        } catch {}
    }

    // ---------- spawn / despawn ----------

    // geo/textura: todas las variantes comparten malla (duck.geo.json);
    // las variantes female/duckling usarian su propio png cuando parseGeoModel
    // soporte textura arbitraria — por ahora todos son patos comunes.

    function pickSpawnPoint(center) {
        const a = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * (CFG.WANDER_RADIUS - 6);
        const x = center.x + Math.cos(a) * r;
        const z = center.z + Math.sin(a) * r;
        return { x, y: center.y + 2, z };
    }

    function spawnDuck() {
        const CM = globalThis.MF_CustomModels;
        if (!CM) return null;
        const center = state.spawnCenter;
        if (!center) return null;
        const at = pickSpawnPoint(center);
        const scale = 1;
        const id = CM.spawn(CFG.MODEL, at.x, at.y, at.z, {
            id: 'duck' + Math.floor(Math.random() * 1e9),
            scale,
            stay: true,
            lookAtPlayer: false,
            persist: false,
            bob: false,
            anim: 'idle'
        });
        if (!id) return null;
        const duck = {
            id,
            rec: null,
            ai: {
                mode: 'idle',          // idle | walk | swim | panic | sit | sleep
                until: performance.now() + 1000 + Math.random() * 3000,
                dir: Math.random() * Math.PI * 2,
                speed: 0,
                nextQuack: performance.now() + 1500 + Math.random() * CFG.QUACK_MAX_MS,
                sitSince: 0,
                lookHold: 0,
                panicDir: 0
            }
        };
        state.ducks.push(duck);
        return duck;
    }

    function removeDuck(duck, force) {
        const i = state.ducks.indexOf(duck);
        if (i >= 0) state.ducks.splice(i, 1);
        try { globalThis.MF_CustomModels?.despawn(duck.id, true); } catch {}
    }

    // ---------- IA ----------

    function setDuckAnim(duck, name) {
        try { globalThis.MF_CustomModels?.setAnim(duck.id, name, 1); } catch {}
    }

    function duckPos(duck) {
        return duck.rec?.root?.position || null;
    }

    function aiTick(duck, dt, t) {
        const CM = globalThis.MF_CustomModels;
        if (!CM) return;
        if (!duck.rec) {
            const rec = CM.record?.(duck.id);
            if (!rec?.root) return; // todavia cargando
            duck.rec = rec;
        }
        const root = duck.rec.root;
        if (!root?.position) return;
        const ai = duck.ai;
        const p = root.position;
        const player = playerPos();
        const dPlayer = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity;

        // gestionar reciclaje por distancia
        if (player && dPlayer > CFG.RESET_DIST) {
            // lejos: reciclar cerca del jugador
            const at = pickSpawnPoint(state.spawnCenter || player);
            p.set(at.x, at.y, at.z);
            ai.mode = 'idle';
            ai.until = t + 800;
            return;
        }

        // modo panico si el jugador se acerca
        if (ai.mode !== 'panic' && player && dPlayer < CFG.PANIC_DIST && !ai.sitting) {
            ai.mode = 'panic';
            ai.until = t + 2200 + Math.random() * 1800;
            ai.panicDir = Math.atan2(p.x - player.x, p.z - player.z);
            setDuckAnim(duck, isWaterAt(p.x, p.y - 0.1, p.z) ? 'panic_swim' : 'panic');
            quackMaybe(duck, t, dPlayer, true);
        }

        // sentarse si el jugador lo mira fijamente un rato (y esta lejos)
        if (ai.mode !== 'panic' && player && dPlayer > 5 && dPlayer < 20 && playerLookingAt(p, 0.94)) {
            ai.lookHold = (ai.lookHold || 0) + dt * 1000;
            if (ai.lookHold > 1800 && ai.mode !== 'sit') {
                ai.mode = 'sit';
                ai.sitting = true;
                ai.sitSince = t;
                ai.until = t + 4000 + Math.random() * 4000;
                setDuckAnimSafe(duck, 'sit');
            }
        } else {
            ai.lookHold = 0;
        }

        if (t >= ai.until) chooseNext(duck, t);

        // mover
        const inWater = isWaterAt(p.x, p.y - 0.2, p.z);
        let speed = 0;
        if (ai.mode === 'walk') speed = CFG.WALK_SPEED;
        else if (ai.mode === 'swim') speed = CFG.SWIM_SPEED;
        else if (ai.mode === 'panic') speed = CFG.PANIC_SPEED;

        if (speed > 0) {
            const step = speed * dt;
            const nx = p.x + Math.sin(ai.dir) * step;
            const nz = p.z + Math.cos(ai.dir) * step;
            // no alejarse demasiado del centro de patrulla
            const c = state.spawnCenter;
            let blocked = false;
            if (c) {
                if (Math.hypot(nx - c.x, nz - c.z) > CFG.WANDER_RADIUS + 4) blocked = true;
            }
            // terreno: si el bloque frente es 2+ mas alto, girar
            if (!blocked) {
                const aheadY = groundYAt(nx, p.y + 1.2, nz);
                if (aheadY != null && aheadY > p.y + 1.05 && !inWater) blocked = true;
            }
            if (blocked) {
                ai.dir += Math.PI * (0.5 + Math.random() * 0.75);
            } else {
                p.x = nx;
                p.z = nz;
                // seguir el suelo / flotar en agua
                if (inWater) {
                    const wy = waterSurfaceY(p.x, p.y, p.z);
                    p.y += (wy - p.y) * Math.min(1, dt * 4);
                } else {
                    const gy = groundYAt(p.x, p.y + 1, p.z);
                    if (gy != null) p.y += (gy + 1 - p.y) * Math.min(1, dt * 10);
                }
            }
            // orientar (rec.yaw: tickCustoms lo aplica cuando no sigue al player)
            const targetYaw = Math.atan2(-Math.sin(ai.dir), -Math.cos(ai.dir));
            let dy = targetYaw - (duck.rec.yaw || 0);
            while (dy > Math.PI) dy -= 2 * Math.PI;
            while (dy < -Math.PI) dy += 2 * Math.PI;
            duck.rec.yaw += dy * Math.min(1, dt * 6);
        }

        quackMaybe(duck, t, dPlayer, false);
    }

    function setDuckAnimSafe(duck, name) {
        try { globalThis.MF_CustomModels?.setAnim(duck.id, name, 1); } catch {}
    }

    function waterSurfaceY(x, y, z) {
        // sube mientras haya agua, max 3
        let sy = Math.floor(y) + 0.9;
        for (let i = 0; i < 3; i++) {
            if (isWaterAt(x, sy + 1, z)) sy += 1;
            else break;
        }
        return sy;
    }

    function quackMaybe(duck, t, dPlayer, force) {
        if (dPlayer > CFG.QUACK_DIST) return;
        const ai = duck.ai;
        if (force) {
            playQuack(dPlayer);
            ai.nextQuack = t + CFG.QUACK_MIN_MS + Math.random() * 6000;
            return;
        }
        if (t >= ai.nextQuack) {
            playQuack(dPlayer);
            ai.nextQuack = t + CFG.QUACK_MIN_MS + Math.random() * CFG.QUACK_MAX_MS;
        }
    }

    function chooseNext(duck, t) {
        const ai = duck.ai;
        const p = duckPos(duck);
        const inWater = p ? isWaterAt(p.x, p.y - 0.2, p.z) : false;
        const r = Math.random();
        ai.sitting = false;
        if (ai.mode === 'panic') {
            // despues del panico, idle
            ai.mode = 'idle';
            ai.until = t + 600 + Math.random() * 1800;
            setDuckAnim(duck, inWater ? 'idle_swim' : 'idle');
            return;
        }
        if (inWater) {
            if (r < 0.55) { ai.mode = 'swim'; setDuckAnim(duck, 'swim'); }
            else if (r < 0.8) { ai.mode = 'idle'; setDuckAnim(duck, 'idle_swim'); }
            else { ai.mode = 'idle'; setDuckAnim(duck, 'dive'); }
            ai.dir = Math.random() * Math.PI * 2;
        } else {
            if (r < 0.5) {
                ai.mode = 'walk';
                setDuckAnim(duck, 'walk');
                ai.dir = Math.random() * Math.PI * 2;
            } else if (r < 0.65) {
                ai.mode = 'idle';
                setDuckAnim(duck, 'clean');
            } else if (r < 0.75) {
                ai.mode = 'idle';
                setDuckAnim(duck, 'dance');
            } else if (r < 0.85) {
                ai.mode = 'idle';
                setDuckAnim(duck, 'eat');
            } else if (r < 0.95) {
                ai.mode = 'idle';
                setDuckAnim(duck, 'sleep');
            } else {
                ai.mode = 'idle';
                setDuckAnim(duck, 'idle');
            }
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
        if (p) {
            if (!state.spawnCenter) state.spawnCenter = { x: p.x, y: p.y, z: p.z };
            // arrastrar el centro de patrulla si el jugador se muda lejos
            const c = state.spawnCenter;
            if (Math.hypot(p.x - c.x, p.z - c.z) > 24) {
                state.spawnCenter = { x: p.x, y: p.y, z: p.z };
            }
        }

        // poblar gradualmente
        if (p && state.ducks.length < CFG.MAX && t - state.lastSpawn > 1400) {
            spawnDuck();
            state.lastSpawn = t;
        }

        for (const duck of [...state.ducks]) {
            try { aiTick(duck, dt, t); } catch {}
            const pos = duckPos(duck);
            if (!pos) continue;
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
            schedule();
            console.log(TAG + ' activado');
            return true;
        },
        stop() {
            state.enabled = false;
            state.stamp.alive = false;
            for (const duck of [...state.ducks]) removeDuck(duck, true);
            state.spawnCenter = null;
            console.log(TAG + ' desactivado');
        },
        count() { return state.ducks.length; },
        clear() {
            for (const duck of [...state.ducks]) removeDuckSafe(duck);
            return true;
        }
    };

    function removeDuckSafe(duck) { try { removeDuck(duck, true); } catch {} }

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
