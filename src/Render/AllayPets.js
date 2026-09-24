// AllayPets.js — mascotas allay client-side (port de "Assorted Allays").
// Allays que te siguen volando: orbitan detrás del jugador con aleteo,
// miran hacia ti cuando se quedan quietos y celebran cuando aterrizas.
// Modelos convertidos de .jem (CEM) a geo.json en models/entities/allaypet*.
// Solo client-side: nadie más las ve.
(function () {
    'use strict';
    const TAG = '[MiniFeather AllayPets]';

    const CFG = {
        MAX: 3,            // tope de mascotas
        MIN_R: 1.6,        // radio orbital mínimo (bloques)
        MAX_R: 2.8,        // radio orbital máximo
        HEIGHT: 1.45,      // altura de vuelo sobre los pies del jugador
        SPEED: 5.2,        // velocidad máx de vuelo (m/s)
        SNAP: 18,          // distancia que dispara reposicionamiento (tp / mundo)
        DEAD: 0.35         // radio muerto: ya "llegó"
    };

    // Variantes del pack (geo propio = textura embebida por nombre;
    // tex = override sobre el geo base)
    const VARIANTS = [
        { key: 'wisp', name: 'Wisp', geo: 'allaypet.geo.json' },
        { key: 'cross', name: 'Cross', geo: 'allaypet_2.geo.json' },
        { key: 'soulwizard', name: 'Soul Wizard', geo: 'allaypet_5.geo.json' },
        { key: 'vex', name: 'Vex', geo: 'allaypet_6.geo.json' },
        { key: 'redmush', name: 'Red Mushroom', geo: 'allaypet_7.geo.json' },
        { key: 'brownmush', name: 'Brown Mushroom', geo: 'allaypet_8.geo.json' },
        { key: 'crimson', name: 'Crimson Fungus', geo: 'allaypet_9.geo.json' },
        { key: 'butter', name: 'Butter', geo: 'allaypet.geo.json', tex: 'allaypet_butter.png' },
        { key: 'grogu', name: 'Grogu', geo: 'allaypet.geo.json', tex: 'allaypet_grogu.png' },
        { key: 'shiny', name: 'Shiny', geo: 'allaypet.geo.json', tex: 'allaypet_shiny_allay.png' },
        { key: 'blaze', name: 'Blaze', geo: 'allaypet.geo.json', tex: 'allaypet_blaze_allay.png' },
        { key: 'flower', name: 'Flower', geo: 'allaypet.geo.json', tex: 'allaypet_flower_allay.png' },
        { key: 'chorus', name: 'Chorus', geo: 'allaypet.geo.json', tex: 'allaypet_chorus_allay.png' },
        { key: 'deepdark', name: 'Deep Dark', geo: 'allaypet.geo.json', tex: 'allaypet_deep_dark_allay.png' }
    ];

    const state = {
        enabled: false,
        pets: [],
        rafId: 0,
        lastT: 0,
        variant: 'random',   // 'random' | key de VARIANTS
        lastGrounded: true,
        playerStillSince: 0,
        lastPlayerPos: null
    };

    // ---------- utilidades del juego (patrón CrittersMobs) ----------

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

    function pickVariant() {
        if (state.variant !== 'random') {
            const v = VARIANTS.find((x) => x.key === state.variant);
            if (v) return v;
        }
        return VARIANTS[(Math.random() * VARIANTS.length) | 0];
    }

    // ---------- ciclo de vida de mascotas ----------

    function spawnPet(i, player) {
        const CM = globalThis.MF_CustomModels;
        if (!CM) return null;
        const v = pickVariant();
        const a = (i / Math.max(1, state.pets.length + 1)) * Math.PI * 2;
        const opts = {
            id: 'allaypet_' + i + '_' + Math.floor(Math.random() * 1e6),
            scale: 1,
            stay: true,
            lookAtPlayer: false,
            persist: false,
            bob: false,
            noPhysics: true,   // la IA de este módulo controla la posición
            anim: 'fly'
        };
        if (v.tex) opts.texture = v.tex;
        const x = player.x + Math.cos(a) * 2;
        const z = player.z + Math.sin(a) * 2;
        const id = CM.spawn(v.geo, x, player.y + CFG.HEIGHT, z, opts);
        if (!id) return null;
        return {
            id, rec: null, variant: v,
            angle: a,
            angleVel: (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.25),
            radius: CFG.MIN_R + Math.random() * (CFG.MAX_R - CFG.MIN_R),
            height: CFG.HEIGHT + (Math.random() - 0.5) * 0.4,
            phase: Math.random() * Math.PI * 2,
            stillFor: 0,
            animMode: 'fly',
            nextCelebrate: performance.now() + 15000 + Math.random() * 20000,
            celebrateUntil: 0,
            mountedCheck: 0
        };
    }

    function removePet(pet) {
        const i = state.pets.indexOf(pet);
        if (i >= 0) state.pets.splice(i, 1);
        try { globalThis.MF_CustomModels?.despawn(pet.id, true); } catch {}
    }

    function ensurePets(player) {
        const want = state.enabled ? CFG.MAX : 0;
        while (state.pets.length > want) removePet(state.pets[state.pets.length - 1]);
        let guard = 0;
        while (state.pets.length < want && player && guard++ < CFG.MAX) {
            const pet = spawnPet(state.pets.length, player);
            if (!pet) break;
            state.pets.push(pet);
        }
    }

    // ---------- IA ----------

    function setPetAnim(pet, name) {
        if (pet.animMode === name) return;
        pet.animMode = name;
        try { globalThis.MF_CustomModels?.setAnim(pet.id, name, 1); } catch {}
    }

    function petTick(pet, dt, t, player) {
        const CM = globalThis.MF_CustomModels;
        if (!CM) return;
        if (!pet.rec) {
            const rec = CM.record?.(pet.id);
            if (!rec?.root) return;
            pet.rec = rec;
        }
        const root = pet.rec.root;
        if (!root?.position) return;

        // cambio de mundo / desmontaje: CustomModels re-adjunta solo; si tras
        // 3s sigue colgado, re-spawn en la posición actual del jugador
        if (!root.parent) {
            if (!pet.mountedCheck) pet.mountedCheck = t;
            else if (t - pet.mountedCheck > 3000) {
                removePet(pet);
                return;
            }
        } else pet.mountedCheck = 0;

        // órbita con deriva lenta
        pet.angle += pet.angleVel * dt;
        const targetX = player.x + Math.cos(pet.angle) * pet.radius;
        const targetZ = player.z + Math.sin(pet.angle) * pet.radius;
        const targetY = player.y + pet.height + Math.sin(t / 900 + pet.phase) * 0.22;

        const p = root.position;
        const dx = targetX - p.x, dy = targetY - p.y, dz = targetZ - p.z;
        const dist = Math.hypot(dx, dy, dz);

        // lejos (tp / mundo nuevo): aparecer cerca sin cruzar el mapa volando
        const dFlat = Math.hypot(player.x - p.x, player.z - p.z);
        if (dFlat > CFG.SNAP) {
            p.set(targetX, targetY, targetZ);
            return;
        }

        let moving = false;
        if (dist > CFG.DEAD) {
            const step = Math.min(CFG.SPEED * dt, dist);
            p.x += (dx / dist) * step;
            p.y += (dy / dist) * step;
            p.z += (dz / dist) * step;
            moving = true;
        }

        // yaw: mirando a donde vuela; quieto, mirando al jugador
        const rec = pet.rec;
        if (moving) {
            rec.yaw = Math.atan2(-(targetX - p.x), -(targetZ - p.z));
        } else if (dFlat > 0.4) {
            rec.yaw = Math.atan2(-(player.x - p.x), -(player.z - p.z));
        }

        // animaciones: vuela al moverse, idle al posarse en su órbita,
        // dance espontáneo cuando el jugador está quieto
        pet.stillFor = moving ? 0 : pet.stillFor + dt;
        const celebrating = t < pet.celebrateUntil;
        if (celebrating) {
            setPetAnim(pet, 'dance');
        } else if (pet.stillFor > 1.2) {
            setPetAnim(pet, 'idle');
            if (t >= pet.nextCelebrate) {
                pet.celebrateUntil = t + 1700;
                pet.nextCelebrate = t + 14000 + Math.random() * 22000;
            }
        } else {
            setPetAnim(pet, 'fly');
        }
    }

    function loop(ts) {
        if (!state.enabled) { state.rafId = 0; return; }
        const dt = Math.min(0.1, (ts - state.lastT) / 1000 || 0.016);
        state.lastT = ts;

        const player = playerPos();
        if (player) {
            ensurePets(player);

            // aterrizaje del jugador → 30% de celebración
            const game = getGame();
            const grounded = game?.player?.onGround === true || game?.player?.grounded === true;
            if (state.lastGrounded === false && grounded) {
                for (const pet of state.pets) {
                    if (Math.random() < 0.3) {
                        pet.celebrateUntil = ts + 1700;
                        pet.nextCelebrate = ts + 14000 + Math.random() * 22000;
                    }
                }
            }
            state.lastGrounded = grounded;

            for (const pet of [...state.pets]) petTick(pet, dt, ts, player);
        }
        state.rafId = requestAnimationFrame(loop);
    }

    // ---------- API + toggle ----------

    globalThis.MF_AllayPets = {
        start() {
            if (state.enabled) return true;
            const player = playerPos();
            if (!player) { console.warn(TAG + ' sin posición del jugador — entra a un mundo primero'); return false; }
            state.enabled = true;
            state.lastT = performance.now();
            ensurePets(player);
            if (!state.rafId) state.rafId = requestAnimationFrame(loop);
            console.log(TAG + ' activado (' + state.pets.length + ' allay/s)');
            return true;
        },
        stop() {
            state.enabled = false;
            if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
            for (const pet of [...state.pets]) removePet(pet);
            console.log(TAG + ' desactivado');
        },
        // 1..3 mascotas (re-spawn instantáneo)
        setCount(n) {
            const want = Math.max(1, Math.min(CFG.MAX, Math.round(Number(n) || 1)));
            localStorage.setItem('mf:allaypets:count', String(want));
            CFG.MAX = want;
            const player = playerPos();
            if (player) ensurePets(player);
            return want;
        },
        getCount() { return Math.max(1, Math.min(3, Number(localStorage.getItem('mf:allaypets:count')) || 3)); },
        // 'random' o key de variants()
        setVariant(key) {
            if (key !== 'random' && !VARIANTS.some((v) => v.key === key)) return false;
            state.variant = key;
            try { localStorage.setItem('mf:allaypets:variant', key); } catch {}
            // re-spawn con el nuevo look
            for (const pet of [...state.pets]) removePet(pet);
            const player = playerPos();
            if (state.enabled && player) ensurePets(player);
            return true;
        },
        get variant() { return state.variant; },
        variants() { return VARIANTS.map(({ key, name }) => ({ key, name })); },
        count() { return state.pets.length; },
        get enabled() { return state.enabled; }
    };

    // ---------- arranque ----------

    try { state.variant = localStorage.getItem('mf:allaypets:variant') || 'random'; } catch {}
    const savedCount = (() => { try { return Number(localStorage.getItem('mf:allaypets:count')); } catch { return 0; } })();
    if (savedCount >= 1 && savedCount <= 3) CFG.MAX = savedCount;

    // auto-arranque si ya estaba habilitado (recarga de página)
    let autoBooted = false;
    const bootTimer = setInterval(() => {
        if (!globalThis.MF_CustomModels || !playerPos()) return;
        clearInterval(bootTimer);
        if (autoBooted) return;
        autoBooted = true;
        try {
            const saved = localStorage.getItem('mf:allaypets');
            if (saved && JSON.parse(saved)?.enabled) globalThis.MF_AllayPets.start();
        } catch {}
    }, 800);
    setTimeout(() => clearInterval(bootTimer), 60000);

    // settings desde el panel (patrón critters/ducks)
    document.addEventListener('minifeather:allaypets-toggle', (ev) => {
        let cfg = null;
        try { cfg = JSON.parse(ev?.detail || '{}'); } catch {}
        const on = cfg?.enabled === true;
        try { localStorage.setItem('mf:allaypets', JSON.stringify({ enabled: on })); } catch {}
        if (cfg?.count) globalThis.MF_AllayPets.setCount(cfg.count);
        if (cfg?.variant) globalThis.MF_AllayPets.setVariant(cfg.variant);
        if (on) globalThis.MF_AllayPets.start();
        else globalThis.MF_AllayPets.stop();
    });
})();
