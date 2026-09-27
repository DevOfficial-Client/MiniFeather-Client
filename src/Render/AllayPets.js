
(function () {
    'use strict';
    const TAG = '[MiniFeather AllayPets]';

    const CFG = {
        MAX: 3,
        KEEP_R: 3.0,
        HARD_R: 4.5,
        MIN_H: 0.9,
        MAX_H: 2.6,
        SPEED: 2.9,
        TURN: 2.4,
        SNAP: 18
    };

    const VARIANTS = [
        { key: 'chorus', name: 'Chorus', geo: 'allaypet.geo.json', tex: 'allaypet_chorus_allay.png' },
        { key: 'flower', name: 'Flower', geo: 'allaypet.geo.json', tex: 'allaypet_flower_allay.png' },
        { key: 'sculk', name: 'Deep Dark', geo: 'allaypet.geo.json', tex: 'allaypet_deep_dark_allay.png' },
        { key: 'cross', name: 'Cross', geo: 'allaypet_2.geo.json' },
        { key: 'deepdark', name: 'Dark Allay', geo: 'allaypet_3.geo.json' },
        { key: 'vex', name: 'Vex', geo: 'allaypet_6.geo.json' },
        { key: 'redmush', name: 'Red Mushroom', geo: 'allaypet_7.geo.json' },
        { key: 'brownmush', name: 'Brown Mushroom', geo: 'allaypet_8.geo.json' },
        { key: 'gyarados', name: 'Gyarados', geo: 'gyarados.geo.json', tex: 'gyarados.png', scale: 2.5, speedMul: 0.7, keepR: 2.6, hardR: 4.5, snapR: 14, wander: 1.1, waveY: 1.2, waveT: 4200, spine: true, terrain: true, loiter: true, terrR: 1.5 },
        { key: 'gyarados_shiny', name: 'Shiny Gyarados', geo: 'gyarados.geo.json', tex: 'gyarados_shiny.png', scale: 2.5, speedMul: 0.7, keepR: 2.6, hardR: 4.5, snapR: 14, wander: 1.1, waveY: 1.2, waveT: 4200, spine: true, terrain: true, loiter: true, terrR: 1.5 }
    ];

    const state = {
        enabled: false,
        pets: [],
        rafId: 0,
        lastT: 0,
        variant: 'random',
        forcedAnim: null,
        lastGrounded: true,
        playerStillSince: 0,
        lastPlayerPos: null
    };

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
    const PASSABLE_RE = /(^|_)(grass|tall_grass|fern|seagrass|flower|tulip|dandelion|poppy|orchid|allium|bluet|cornflower|lily|sunflower|rose|peony|sapling|wheat|carrot|potato|beetroot|mushroom|snow_layer|dead_bush|sweet_berry|bush|vine|kelp)$/;
    const _bnCache = new Map();
    function blockNameAt(x, y, z) {
        const world = getGame()?.world;
        if (!world) return null;
        const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
        if (fy < 0 || fy > 255) return null;
        try {
            const proto = Object.getPrototypeOf(world);
            if (typeof proto.getChunk !== 'function') return null;
            const chunk = proto.getChunk.call(world, { x: fx, y: fy, z: fz });
            if (chunk == null || chunk.isDummyChunk) return null;
            const bs = chunk.getBlockState({ x: fx, y: fy, z: fz });
            if (!bs || !bs.id) return null;
            const id = Number(bs.id);
            if (Number.isFinite(id) && _bnCache.has(id)) return _bnCache.get(id);
            let name = '';
            try {
                const block = bs.getBlock?.() || bs.block || bs._block || null;
                name = String(block?.name || block?.id || bs.name || '').toLowerCase();
            } catch {}
            if (Number.isFinite(id) && name) _bnCache.set(id, name);
            return name || 'solid';
        } catch { return null; }
    }
    function solidAt(x, y, z) {
        const n = blockNameAt(x, y, z);
        if (n == null) return false;
        if (!n) return true;
        return !(PASSABLE_RE.test(n) || /(^|_)(air|torch|rail|carpet|web|fire)/.test(n));
    }
    function groundTopAt(x, z, fromY) {
        const top = Math.min(255, Math.floor(fromY) + 3);
        const bot = Math.max(0, Math.floor(fromY) - 24);
        for (let yy = top; yy >= bot; yy--) {
            if (solidAt(x, yy, z)) return yy + 1;
        }
        return null;
    }
    const PET_REMOTE_URL = 'https://raw.githubusercontent.com/EstebanGrp/mfaccs/main/accounts.json';
    const petRemote = { pet: null, fetchedAt: 0, timer: 0 };

    function petRemoteTick() {
        fetch(PET_REMOTE_URL, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
                if (!j?.players) return;
                petRemote.fetchedAt = Date.now();
                const g = getGame();
                const name = (g?.player?.profile?.username || '').toLowerCase();
                const uuid = (g?.player?.profile?.uuid || '').toLowerCase();
                const e = j.players[uuid] || j.players[name];
                const newPet = (e && typeof e.pet === 'string' && e.pet) || null;
                if (newPet !== petRemote.pet) {
                    const hadPet = petRemote.pet;
                    petRemote.pet = newPet;
                    if ((hadPet !== null || newPet !== null) && state.variant === 'random' && state.enabled) {
                        for (const pet of [...state.pets]) removePet(pet);
                        const player = playerPos();
                        if (player) ensurePets(player);
                    }
                }
            })
            .catch(() => {});
    }

    function fetchPetRemote() {
        if (petRemote.timer) return;
        petRemoteTick();
        petRemote.timer = setInterval(petRemoteTick, 60_000);
    }

    function pickVariant() {
        if (state.variant !== 'random') {
            const v = VARIANTS.find((x) => x.key === state.variant);
            if (v) return v;
        }
        if (petRemote.pet && VARIANTS.some((x) => x.key === petRemote.pet)) {
            return VARIANTS.find((x) => x.key === petRemote.pet);
        }
        return VARIANTS[(Math.random() * VARIANTS.length) | 0];
    }
    const SPINE_LAG = 70;
    const SPINE_LAT = 0.38;
    const SPINE_PIT = 0.34;
    const HIST_MS = 1600;

    function attachSpine(pet) {
        const CM = globalThis.MF_CustomModels;
        if (!CM?.boneOf || !CM?.setProcAnim) return;
        const chain = ['neck', 'head'];
        for (let i = 1; i <= 13; i++) chain.push('segment' + i);
        const bones = [];
        for (const nm of chain) {
            const g = CM.boneOf(pet.id, nm);
            if (g) bones.push({ g, lag: bones.length * SPINE_LAG });
        }
        if (bones.length < 4) return;
        pet.spineBones = bones;
        pet.hist = [];
        CM.setProcAnim(pet.id, (t) => spineTick(pet, t));
    }

    function spineTick(pet, t) {
        if (pet.animMode === 'dance') return;
        const H = pet.hist;
        H.push({ t, turn: pet.procTurn || 0, vy: pet.vy || 0 });
        while (H.length > 2 && t - H[0].t > HIST_MS) H.shift();
        for (const b of pet.spineBones) {
            const want = t - b.lag;
            let s = H[0];
            for (let i = H.length - 1; i >= 0; i--) {
                if (H[i].t <= want) { s = H[i]; break; }
                s = H[i];
            }
            const lat = Math.max(-SPINE_LAT, Math.min(SPINE_LAT, (s.turn || 0) * -0.4));
            const pit = Math.max(-SPINE_PIT, Math.min(SPINE_PIT, (s.vy || 0) * 0.35));
            b.g.rotateY(lat);
            b.g.rotateX(pit);
        }
    }

    function spawnPet(i, player) {
        const CM = globalThis.MF_CustomModels;
        if (!CM) return null;
        const v = pickVariant();
        const opts = {
            id: 'allaypet_' + i + '_' + Math.floor(Math.random() * 1e6),
            scale: v.scale || 1,
            stay: true,
            lookAtPlayer: false,
            persist: false,
            bob: false,
            noPhysics: true,
            anim: 'fly'
        };
        if (v.tex) opts.texture = v.tex;
        if (v.tint) opts.tint = v.tint;
        const a = Math.random() * Math.PI * 2;
        const r0 = v.solo ? 7 : 1.5;
        const x = player.x + Math.cos(a) * r0;
        const z = player.z + Math.sin(a) * r0;
        const id = CM.spawn(v.geo, x, player.y + (v.solo ? 5 : 1.6), z, opts);
        if (!id) return null;
        return {
            id, rec: null, variant: v,
            heading: Math.random() * Math.PI * 2,
            turnBias: (Math.random() - 0.5) * 0.8,
            nextTurnAt: performance.now() + 600 + Math.random() * 1400,
            vy: (Math.random() - 0.5) * 0.5,
            cruise: CFG.SPEED * (v.speedMul || 1) * (0.85 + Math.random() * 0.35),
            keepR: v.keepR || CFG.KEEP_R,
            hardR: v.hardR || CFG.HARD_R,
            snapR: v.snapR || CFG.SNAP,
            wander: v.wander || 1,
            drift: 0, driftTo: 0,
            solo: v.solo === true,
            terrain: v.terrain === true,
            waveBase: v.waveY ? CFG.MIN_H + 1 + v.waveY : 0,
            waveAmp: v.waveY || 0,
            waveT: v.waveT || 5200,
            loiter: v.loiter === true,
            bank: 0,
            lastHeading: 0,
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
        const vKey = state.variant !== 'random' ? state.variant : petRemote.pet;
        const soloV = vKey ? VARIANTS.find((x) => x.key === vKey) : null;
        const want = state.enabled ? (soloV?.solo ? 1 : CFG.MAX) : 0;
        while (state.pets.length > want) removePet(state.pets[state.pets.length - 1]);
        if (!globalThis.MF_CustomModels) return;
        let guard = 0;
        while (state.pets.length < want && player && guard++ < CFG.MAX * 2) {
            const pet = spawnPet(state.pets.length, player);
            if (!pet) {
                break;
            }
            state.pets.push(pet);
        }
    }

    function setPetAnim(pet, name) {
        if (state.forcedAnim) {
            name = state.forcedAnim;
        }
        if (pet.animMode === name) return;
        pet.animMode = name;
        try { globalThis.MF_CustomModels?.setAnim(pet.id, name, 1); } catch {}
    }

    function petTick(pet, dt, t, player) {
        const CM = globalThis.MF_CustomModels;
        if (!CM) return;
        if (!pet.rec) {
            const rec = CM.record?.(pet.id);
            if (!rec?.root) {
                const grace = /\.glb$/i.test(pet.variant.geo) ? 60000 : 4000;
                if (!pet.spawnedAt) pet.spawnedAt = t;
                else if (t - pet.spawnedAt > grace) removePet(pet);
                return;
            }
            pet.rec = rec;
            pet.spawnedAt = 0;
            if (pet.variant.spine && !pet.spineBones) attachSpine(pet);
        }
        const root = pet.rec.root;
        if (!root?.position) return;
        if (!root.parent) {
            if (!pet.mountedCheck) pet.mountedCheck = t;
            else if (t - pet.mountedCheck > 3000) {
                removePet(pet);
                return;
            }
        } else pet.mountedCheck = 0;
        const p = root.position;
        const prevX = p.x, prevZ = p.z;
        const toPX = player.x - p.x, toPZ = player.z - p.z;
        const dFlat = Math.hypot(toPX, toPZ);
        if (dFlat > pet.snapR) {
            p.set(player.x + toPX / (dFlat || 1) * -1.5, player.y + 1.6, player.z + toPZ / (dFlat || 1) * -1.5);
            pet.vy = 0;
            return;
        }
        const away = Math.max(0, Math.min(1, (dFlat - pet.keepR) / (pet.hardR - pet.keepR)));
        let heading;
        let loiterSpeedMul = 1;
        if (pet.loiter) {
            if (t >= (pet.nextLoiterAt || 0)) {
                pet.loitering = !pet.loitering;
                pet.nextLoiterAt = t + (pet.loitering
                    ? 2500 + Math.random() * 4500
                    : 4000 + Math.random() * 7000);
            }
            if (pet.loitering) loiterSpeedMul = 0;
        }
        if (pet.wander > 1.3) {
            if (t >= pet.nextTurnAt) {
                pet.nextTurnAt = t + 5000 + Math.random() * 4000;
                pet.driftTo = (Math.random() - 0.5) * 0.16;
            }
            pet.drift += ((pet.driftTo || 0) - pet.drift) * Math.min(1, dt * 0.6);
            const wob = Math.sin(t / 5500 + pet.phase) * 0.30
                      + Math.sin(t / 12000 + pet.phase * 1.73) * 0.38;
            heading = pet.heading + (wob + pet.drift) * dt;
        } else {
            if (t >= pet.nextTurnAt) {
                pet.nextTurnAt = t + 600 + Math.random() * 1400;
                pet.turnBias = (Math.random() - 0.5) * CFG.TURN;
            }
            heading = pet.heading + pet.turnBias * dt;
        }
        if (away > 0) {
            const want = Math.atan2(toPX, toPZ);
            let delta = want - heading;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            heading += delta * Math.min(1, away * 3.2) * dt * 3;
        }
        pet.heading = heading;
        let speed = pet.cruise * (1 + away * 1.4) * loiterSpeedMul;
        const playerMoving = state.lastPlayerPos
            ? Math.hypot(player.x - state.lastPlayerPos.x, player.z - state.lastPlayerPos.z) / Math.max(dt, 1e-3)
            : 0;
        if (playerMoving > 4 && dFlat > pet.keepR * 0.8) speed = Math.max(speed, playerMoving * 0.9);

        p.x += Math.sin(heading) * speed * dt;
        p.z += Math.cos(heading) * speed * dt;
        const relY = p.y - player.y;
        if (pet.waveAmp) {
            let targetY = player.y + pet.waveBase + Math.sin(t / pet.waveT + pet.phase) * pet.waveAmp;
            if (pet.terrain) {
                const tR = pet.variant.terrR || 0;
                const sF = tR || 6, sS = (tR * 2) / 3 || 4;
                if (t - (pet.terrAt || 0) > 120) {
                    pet.terrAt = t;
                    const hx = Math.sin(pet.heading), hz = Math.cos(pet.heading);
                    const g0 = groundTopAt(p.x, p.z, p.y);
                    const g1 = groundTopAt(p.x + hx * sF, p.z + hz * sF, p.y);
                    const g2 = groundTopAt(p.x + hz * sS, p.z - hx * sS, p.y);
                    const g3 = groundTopAt(p.x - hz * sS, p.z + hx * sS, p.y);
                    pet.floorY = [g0, g1, g2, g3].reduce((m, g) => (g != null && (m == null || g > m)) ? g : m, null);
                }
                const clr = tR || 5;
                if (pet.floorY != null) {
                    targetY = Math.max(targetY, pet.floorY + clr);
                    if (p.y < pet.floorY + clr * 0.6) {
                        pet.vy = Math.max(pet.vy, 0);
                        p.y += (pet.floorY + clr - p.y) * Math.min(0.5, dt * 4);
                    }
                }
                const floorAbs = (pet.floorY != null ? pet.floorY : player.y) + clr + 2;
                if (targetY < floorAbs) targetY = floorAbs;
                if (p.y < floorAbs - 1.5) { pet.vy = Math.max(pet.vy, 0.5); p.y = floorAbs - 1.5; }
                targetY = Math.min(targetY, player.y + 50);
            }
            pet.vy += ((targetY - p.y) * 2.4 - pet.vy) * Math.min(1, dt * 2);
            pet.vy = Math.max(-2.8, Math.min(2.8, pet.vy));
            p.y += pet.vy * dt;
        } else {
            let gAcc = 0;
            if (relY < CFG.MIN_H) gAcc = 2.2;
            else if (relY > CFG.MAX_H) gAcc = -2.2;
            else gAcc = Math.sin(t / 1100 + pet.phase) * 0.5;
            pet.vy += (gAcc - pet.vy) * Math.min(1, dt * 1.6);
            pet.vy = Math.max(-1.4, Math.min(1.4, pet.vy));
            p.y += pet.vy * dt;
        }
        const rec = pet.rec;
        const movedX = p.x - prevX, movedZ = p.z - prevZ;
        if (movedX * movedX + movedZ * movedZ > 1e-6) {
            rec.yaw = Math.atan2(-movedX, -movedZ);
        } else if (dFlat > 0.4) {
            rec.yaw = Math.atan2(-(player.x - p.x), -(player.z - p.z));
        }
        let dh = heading - (pet.lastHeading ?? heading);
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        pet.lastHeading = heading;
        const turnRate = dt > 0 ? dh / dt : 0;
        pet.procTurn = turnRate;
        const wantBank = Math.max(-0.6, Math.min(0.6, turnRate * 0.4));
        pet.bank += (wantBank - pet.bank) * Math.min(1, dt * 2.5);
        const rr = root.rotation;
        if (rr.order !== 'YXZ') rr.order = 'YXZ';
        rr.z = pet.bank;
        rr.x = Math.max(-0.45, Math.min(0.45, pet.vy * 0.22));
        pet.stillFor = (movedX * movedX + movedZ * movedZ > 1e-8) ? 0 : pet.stillFor + dt;
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
            setPetAnim(pet, pet.variant.spine ? 'glide' : 'fly');
        }
    }

    function loop(ts) {
        if (!state.enabled) { state.rafId = 0; return; }
        const dt = Math.min(0.1, (ts - state.lastT) / 1000 || 0.016);
        state.lastT = ts;

        const player = playerPos();
        if (player) {
            ensurePets(player);
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
            state.lastPlayerPos = { x: player.x, z: player.z };
        }
        state.rafId = requestAnimationFrame(loop);
    }
    let pendingStart = false;
    let pendingTimer = 0;
    function armPendingStart() {
        if (pendingTimer) return;
        pendingTimer = setInterval(() => {
            if (!pendingStart) { clearInterval(pendingTimer); pendingTimer = 0; return; }
            const CM = globalThis.MF_CustomModels;
            const player = playerPos();
            if (!CM || !player) return;
            clearInterval(pendingTimer); pendingTimer = 0;
            state.enabled = true;
            state.lastT = performance.now();
            ensurePets(player);
            if (!state.rafId) state.rafId = requestAnimationFrame(loop);
            console.log(TAG + ' activado (pendiente resuelto: ' + state.pets.length + ' allay/s)');
        }, 700);
    }

    globalThis.MF_AllayPets = {
        start() {
            if (state.enabled) return true;
            fetchPetRemote();
            const CM = globalThis.MF_CustomModels;
            const player = playerPos();
            if (!CM || !player) {
                pendingStart = true;
                armPendingStart();
                console.log(TAG + ' en espera: se activará al entrar a un mundo');
                return true;
            }
            state.enabled = true;
            state.lastT = performance.now();
            ensurePets(player);
            if (!state.rafId) state.rafId = requestAnimationFrame(loop);
            console.log(TAG + ' activado (' + state.pets.length + ' allay/s)');
            return true;
        },
        stop() {
            pendingStart = false;
            if (pendingTimer) { clearInterval(pendingTimer); pendingTimer = 0; }
            state.enabled = false;
            if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
            for (const pet of [...state.pets]) removePet(pet);
            console.log(TAG + ' desactivado');
        },
        setCount(n) {
            const want = Math.max(1, Math.min(CFG.MAX, Math.round(Number(n) || 1)));
            localStorage.setItem('mf:allaypets:count', String(want));
            CFG.MAX = want;
            const player = playerPos();
            if (player) ensurePets(player);
            return want;
        },
        getCount() { return Math.max(1, Math.min(3, Number(localStorage.getItem('mf:allaypets:count')) || 3)); },
        setVariant(key) {
            if (key !== 'random' && !VARIANTS.some((v) => v.key === key)) return false;
            state.variant = key;
            state.forcedAnim = null;
            try { localStorage.setItem('mf:allaypets:variant', key); } catch {}
            for (const pet of [...state.pets]) removePet(pet);
            const player = playerPos();
            if (state.enabled && player) ensurePets(player);
            return true;
        },
        setAnim(name) {
            if (name === undefined) return state.forcedAnim;
            if (name === '' || name === null) name = null;
            state.forcedAnim = name || null;
            for (const pet of state.pets) pet.animMode = null;
            return true;
        },
        anims() {
            const out = [];
            for (const pet of state.pets) {
                const list = globalThis.MF_CustomModels?.animsOf?.(pet.id);
                if (list) out.push(...list);
            }
            return [...new Set(out)];
        },
        get variant() { return state.variant; },
        variants() { return VARIANTS.map(({ key, name }) => ({ key, name })); },
        count() { return state.pets.length; },
        get enabled() { return state.enabled; }
    };

    try { state.variant = localStorage.getItem('mf:allaypets:variant') || 'random'; } catch {}
    const savedCount = (() => { try { return Number(localStorage.getItem('mf:allaypets:count')); } catch { return 0; } })();
    if (savedCount >= 1 && savedCount <= 3) CFG.MAX = savedCount;
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
