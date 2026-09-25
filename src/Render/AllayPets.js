// AllayPets.js — mascotas allay client-side (port de "Assorted Allays").
// Allays que vuelan EN CÍRCULO alrededor del jugador (vuelta cada ~7-11s,
// radio que respira, mirando a donde vuelan), celebran cuando aterrizas y
// bailan de vez en cuando. Modelos convertidos de .jem (CEM) a geo.json en
// models/entities/allaypet*. Solo client-side: nadie más las ve.
(function () {
    'use strict';
    const TAG = '[MiniFeather AllayPets]';

    const CFG = {
        MAX: 3,            // tope de mascotas
        KEEP_R: 3.0,       // radio "leash": fuera de él, giran hacia el jugador
        HARD_R: 4.5,       // nunca más lejos que esto
        MIN_H: 0.9,        // banda de altura sobre los pies (mín)
        MAX_H: 2.6,        // banda de altura (máx)
        SPEED: 2.9,        // velocidad crucero (m/s)
        TURN: 2.4,         // rad/s máx de giro errático
        SNAP: 18           // distancia que dispara reposicionamiento (tp/mundo)
    };

    // Variantes del pack, verificadas por análisis de píxeles contra las
    // regiones UV del modelo (cabeza/cuerpo/brazos/alas pintados donde el
    // geo muestrea). Las descartadas (wisp: solo cabeza; grogu/shiny/crimson:
    // layout 64x64 distinto; butter/blaze: regiones parciales) dejaban
    // partes transparentes.
    const VARIANTS = [
        { key: 'chorus', name: 'Chorus', geo: 'allaypet.geo.json', tex: 'allaypet_chorus_allay.png' },
        { key: 'flower', name: 'Flower', geo: 'allaypet.geo.json', tex: 'allaypet_flower_allay.png' },
        { key: 'sculk', name: 'Deep Dark', geo: 'allaypet.geo.json', tex: 'allaypet_deep_dark_allay.png' },
        { key: 'cross', name: 'Cross', geo: 'allaypet_2.geo.json' },
        { key: 'deepdark', name: 'Dark Allay', geo: 'allaypet_3.geo.json' },
        { key: 'vex', name: 'Vex', geo: 'allaypet_6.geo.json' },
        { key: 'redmush', name: 'Red Mushroom', geo: 'allaypet_7.geo.json' },
        { key: 'brownmush', name: 'Brown Mushroom', geo: 'allaypet_8.geo.json' },
        // gyarados (Pokémon Catalyst pack): 13 segmentos serpenteando en el
        // aire con onda viajera. GIGANTE (6x) y ÚNICO: solo=1 fuerza que
        // jamás haya más de uno. Territorio de 4-6 chunks (64-96 bloques):
        // deambula lejos como dragón salvaje y vuelve. terrain=respeta los
        // bloques CARGADOS (no atraviesa montañas: las escala). waveY=±22 →
        // ondula entre 5-10 y ~49 bloques sobre el jugador
        { key: 'gyarados', name: 'Gyarados', geo: 'gyarados.geo.json', tex: 'gyarados.png', scale: 6, speedMul: 1.6, keepR: 64, hardR: 96, snapR: 110, wander: 1.9, waveY: 22, waveT: 5200, spine: true, solo: true, terrain: true },
        { key: 'gyarados_shiny', name: 'Shiny Gyarados', geo: 'gyarados.geo.json', tex: 'gyarados_shiny.png', scale: 6, speedMul: 1.6, keepR: 64, hardR: 96, snapR: 110, wander: 1.9, waveY: 22, waveT: 5200, spine: true, solo: true, terrain: true },
        // leviathan (FF7 Remake, .gltf separado): 42 unidades × 0.9 ≈ 38
        // bloques, MODO PALO por defecto (bind pose estática — CPU skin
        // dinámico requiere localStorage['mf:cpuskin']='1')
        { key: 'leviathan', name: 'Leviathan', geo: 'leviathan.gltf', scale: 0.9, speedMul: 1.5, keepR: 64, hardR: 96, snapR: 110, wander: 1.7, waveY: 22, waveT: 5200, solo: true, terrain: true, leviathan: true }
    ];

    // ataques del leviathan (GLB) que rota cuando está quieto
    const LEV_ATK = ['B_AtkTailWhip01', 'B_AtkBigWave01', 'B_AtkEnergyCharge01_1'];

    const state = {
        enabled: false,
        pets: [],
        rafId: 0,
        lastT: 0,
        variant: 'random',   // 'random' | key de VARIANTS
        forcedAnim: null,    // anim fija elegida por el usuario ('' = auto)
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

    // ---------- mundo (evitar atravesar bloques cargados) ----------
    // Sonda compacta de bloques vía chunk.getBlockState (patrón CrittersMobs).
    // Solo consulta chunks CARGADOS: en terreno descargado devuelve no-sólido
    // y la bestia vuela libre (no puede chocar con lo que no existe).
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
        if (n == null) return false;   // aire / no cargado
        if (!n) return true;
        return !(PASSABLE_RE.test(n) || /(^|_)(air|torch|rail|carpet|web|fire)/.test(n));
    }
    // superficie más alta del terreno en una columna, escaneando de arriba
    // hacia abajo desde fromY (para encontrar la cima, no techos de cueva)
    function groundTopAt(x, z, fromY) {
        const top = Math.min(255, Math.floor(fromY) + 3);
        const bot = Math.max(0, Math.floor(fromY) - 24);
        for (let yy = top; yy >= bot; yy--) {
            if (solidAt(x, yy, z)) return yy + 1;
        }
        return null;
    }

    function pickVariant() {
        if (state.variant !== 'random') {
            const v = VARIANTS.find((x) => x.key === state.variant);
            if (v) return v;
        }
        return VARIANTS[(Math.random() * VARIANTS.length) | 0];
    }

    // ---------- columna procedural (spine) ----------
    // Reemplaza la animación de la cadena de bones por dinámica reactiva al
    // movimiento REAL: cada eslabón (cuello→cabeza→segmentos) muestrea el
    // historial de giros/picados con un retardo de 70ms → la cabeza lidera y
    // la ola se propaga hasta la cola. Gira → todo el cuerpo ondea; pica →
    // toda la columna se arquea.
    const SPINE_LAG = 70;      // ms de retardo por eslabón
    const SPINE_LAT = 0.38;    // rad máx de ondulación lateral por eslabón
    const SPINE_PIT = 0.34;    // rad máx de arqueo vertical por eslabón
    const HIST_MS = 1600;      // ventana de historial

    function attachSpine(pet) {
        const CM = globalThis.MF_CustomModels;
        if (!CM?.boneOf || !CM?.setProcAnim) return;
        const chain = ['neck', 'head'];
        for (let i = 1; i <= 13; i++) chain.push('segment' + i);
        const bones = [];
        for (const nm of chain) {
            const g = CM.boneOf(pet.id, nm);   // solo bones que restoreRest resetea
            if (g) bones.push({ g, lag: bones.length * SPINE_LAG });
        }
        if (bones.length < 4) return;   // no parece una cadena — no forzar
        pet.spineBones = bones;
        pet.hist = [];
        CM.setProcAnim(pet.id, (t) => spineTick(pet, t));
    }

    function spineTick(pet, t) {
        // durante el baile la cola menea por keyframes — no pisarla
        if (pet.animMode === 'dance') return;
        const H = pet.hist;
        H.push({ t, turn: pet.procTurn || 0, vy: pet.vy || 0 });
        while (H.length > 2 && t - H[0].t > HIST_MS) H.shift();
        for (const b of pet.spineBones) {
            const want = t - b.lag;
            let s = H[0];
            for (let i = H.length - 1; i >= 0; i--) {
                if (H[i].t <= want) { s = H[i]; break; }
                s = H[i];   // más viejo que la ventana → usar el primero
            }
            const lat = Math.max(-SPINE_LAT, Math.min(SPINE_LAT, (s.turn || 0) * -0.4));
            const pit = Math.max(-SPINE_PIT, Math.min(SPINE_PIT, (s.vy || 0) * 0.35));
            // ADITIVO sobre la pose que sampleAnim acaba de aplicar (corre
            // después en el mismo frame): la animación base da la forma,
            // esto le suma la reacción al movimiento real. restoreRest del
            // próximo frame evita acumulación.
            b.g.rotateY(lat);
            b.g.rotateX(pit);
        }
    }

    // ---------- ciclo de vida de mascotas ----------

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
            noPhysics: true,   // la IA de este módulo controla la posición
            anim: v.leviathan ? 'B_Idle01_1' : 'fly'
        };
        if (v.tex) opts.texture = v.tex;
        if (v.tint) opts.tint = v.tint;
        const a = Math.random() * Math.PI * 2;
        const r0 = v.solo ? 7 : 1.5;          // gigante: nace lejos, no encima
        const x = player.x + Math.cos(a) * r0;
        const z = player.z + Math.sin(a) * r0;
        const id = CM.spawn(v.geo, x, player.y + (v.solo ? 5 : 1.6), z, opts);
        if (!id) return null;
        return {
            id, rec: null, variant: v,
            // vuelo libre: heading propio + turnBias que deriva (ruido suave).
            // Sin trayectoria: cada giro es impredecible pero con inercia.
            heading: Math.random() * Math.PI * 2,
            turnBias: (Math.random() - 0.5) * 0.8,  // rad/s, se re-dibuja lento
            nextTurnAt: performance.now() + 600 + Math.random() * 1400,
            // vertical propio: vy con gravedad suave hacia la banda de altura
            vy: (Math.random() - 0.5) * 0.5,
            cruise: CFG.SPEED * (v.speedMul || 1) * (0.85 + Math.random() * 0.35),
            keepR: v.keepR || CFG.KEEP_R,   // leash por variante (gyarados necesita más)
            hardR: v.hardR || CFG.HARD_R,
            snapR: v.snapR || CFG.SNAP,     // reposicionar solo si de verdad se perdió
            // serpenteo: wander escala los giros erráticos (1=allay normal);
            // waveAmp/waveT = onda vertical senoidal (sube y baja nadando el aire)
            wander: v.wander || 1,
            drift: 0, driftTo: 0,               // deriva lenta del rumbo (serpientes)
            solo: v.solo === true,              // GIGANTE único: solo 1 de estos
            terrain: v.terrain === true,        // respeta bloques cargados del mundo
            waveBase: v.waveY ? CFG.MIN_H + 1 + v.waveY : 0,
            bank: 0,                          // alabeo suavizado (banqueo en curvas)
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
        // variante "solo" (gyarados gigante): TODO el cupo es 1 mascota —
        // al activarla se despide al resto y no se repone hasta cambiar
        const soloV = state.variant !== 'random' ? VARIANTS.find((x) => x.key === state.variant) : null;
        const want = state.enabled ? (soloV?.solo ? 1 : CFG.MAX) : 0;
        while (state.pets.length > want) removePet(state.pets[state.pets.length - 1]);
        // sin CustomModels no hay spawn — reintentará en el próximo loop
        if (!globalThis.MF_CustomModels) return;
        let guard = 0;
        while (state.pets.length < want && player && guard++ < CFG.MAX * 2) {
            const pet = spawnPet(state.pets.length, player);
            if (!pet) {
                // fallo de spawn (p.ej. variante sin geometría): no trabar el
                // resto, solo salir — el próximo tick reintentará las faltantes
                break;
            }
            state.pets.push(pet);
        }
    }

    // ---------- IA ----------

    function setPetAnim(pet, name) {
        // anim fija elegida por el usuario: pisa TODA la lógica automática
        if (state.forcedAnim) {
            name = state.forcedAnim;
        } else if (pet.variant.leviathan) {
            // el leviathan no tiene 'fly'/'idle'/'dance' — mapear a sus clips
            if (name === 'fly' || name === 'idle') name = 'B_Idle01_1';
            else if (name === 'dance') name = 'B_AtkBigWave01';
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
                // carga async en curso — pero si pasan N ms y CustomModels no
                // tiene el record, el spawn falló (fetch/geo): liberar el
                // slot. GLB pesado (leviathan 94MB + 470 joints) necesita
                // mucho más que un geo.json pequeño
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

        // cambio de mundo / desmontaje: CustomModels re-adjunta solo; si tras
        // 3s sigue colgado, re-spawn en la posición actual del jugador
        if (!root.parent) {
            if (!pet.mountedCheck) pet.mountedCheck = t;
            else if (t - pet.mountedCheck > 3000) {
                removePet(pet);
                return;
            }
        } else pet.mountedCheck = 0;

        // ── Vuelo libre ─────────────────────────────────────────────────
        const p = root.position;
        const prevX = p.x, prevZ = p.z;
        const toPX = player.x - p.x, toPZ = player.z - p.z;
        const dFlat = Math.hypot(toPX, toPZ);

        // lejos (tp / mundo nuevo): aparecer cerca sin cruzar el mapa volando
        if (dFlat > pet.snapR) {
            p.set(player.x + toPX / (dFlat || 1) * -1.5, player.y + 1.6, player.z + toPZ / (dFlat || 1) * -1.5);
            pet.vy = 0;
            return;
        }

        // corrección de rumbo: 0 dentro del leash → 1 en hardR (por variante)
        const away = Math.max(0, Math.min(1, (dFlat - pet.keepR) / (pet.hardR - pet.keepR)));
        let heading;
        if (pet.wander > 1.3) {
            // Serpientes grandes: serpenteo SENOIDAL compuesto — dos senos
            // lentos de frecuencias inconmensurables dan S-curvas amplias +
            // vueltas ocasionales que nunca se repiten. El turnBias por
            // tramos (re-dibujo aleatorio) producía espasmos de gusano que
            // la columna propagaba por los 13 eslabones.
            if (t >= pet.nextTurnAt) {
                pet.nextTurnAt = t + 5000 + Math.random() * 4000;
                pet.driftTo = (Math.random() - 0.5) * 0.16;   // deriva lenta
            }
            pet.drift += ((pet.driftTo || 0) - pet.drift) * Math.min(1, dt * 0.6);
            const wob = Math.sin(t / 5500 + pet.phase) * 0.30       // S-curvas
                      + Math.sin(t / 12000 + pet.phase * 1.73) * 0.38; // vueltas
            heading = pet.heading + (wob + pet.drift) * dt;
        } else {
            // allays: giro errático por tramos (turnBias re-dibujado)
            if (t >= pet.nextTurnAt) {
                pet.nextTurnAt = t + 600 + Math.random() * 1400;
                pet.turnBias = (Math.random() - 0.5) * CFG.TURN;
            }
            heading = pet.heading + pet.turnBias * dt;
        }
        if (away > 0) {
            const want = Math.atan2(toPX, toPZ); // hacia el jugador
            let delta = want - heading;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            heading += delta * Math.min(1, away * 3.2) * dt * 3;
        }
        pet.heading = heading;

        // velocidad: crucero normal; acelerada si está volviendo (o si el
        // jugador corre y se lo está dejando atrás)
        let speed = pet.cruise * (1 + away * 1.4);
        const playerMoving = state.lastPlayerPos
            ? Math.hypot(player.x - state.lastPlayerPos.x, player.z - state.lastPlayerPos.z) / Math.max(dt, 1e-3)
            : 0;
        if (playerMoving > 4 && dFlat > pet.keepR * 0.8) speed = Math.max(speed, playerMoving * 0.9);

        p.x += Math.sin(heading) * speed * dt;
        p.z += Math.cos(heading) * speed * dt;

        // vertical: serpientes (waveAmp) siguen un seno amplio — suben y
        // bajan varios bloques como nadando el aire; el resto usa la banda
        // con gravedad suave + bobbing
        const relY = p.y - player.y;
        if (pet.waveAmp) {
            let targetY = player.y + pet.waveBase + Math.sin(t / pet.waveT + pet.phase) * pet.waveAmp;
            if (pet.terrain) {
                // sondas cada 120ms: suelo bajo el cuerpo + 3 puntos al frente
                // (morro y ambos flancos) → la cima más alta manda
                if (t - (pet.terrAt || 0) > 120) {
                    pet.terrAt = t;
                    const hx = Math.sin(pet.heading), hz = Math.cos(pet.heading);
                    const g0 = groundTopAt(p.x, p.z, p.y);
                    const g1 = groundTopAt(p.x + hx * 6, p.z + hz * 6, p.y);
                    const g2 = groundTopAt(p.x + hz * 4, p.z - hx * 4, p.y);
                    const g3 = groundTopAt(p.x - hz * 4, p.z + hx * 4, p.y);
                    pet.floorY = [g0, g1, g2, g3].reduce((m, g) => (g != null && (m == null || g > m)) ? g : m, null);
                }
                const clr = 5;   // clearancia del cuerpo gigante
                if (pet.floorY != null) {
                    targetY = Math.max(targetY, pet.floorY + clr);
                    // emergencia: ya metido en la ladera → empuje duro arriba
                    if (p.y < pet.floorY + clr * 0.6) {
                        pet.vy = Math.max(pet.vy, 0);
                        p.y += (pet.floorY + clr - p.y) * Math.min(0.5, dt * 4);
                    }
                }
                // piso absoluto: mínimo 5 bloques sobre el terreno (o sobre
                // el jugador si no hay dato) — nunca rasante
                const floorAbs = (pet.floorY != null ? pet.floorY : player.y) + 5;
                if (targetY < floorAbs) targetY = floorAbs;
                if (p.y < floorAbs - 2) { pet.vy = Math.max(pet.vy, 0.5); p.y = floorAbs - 2; }
                targetY = Math.min(targetY, player.y + 50);   // techo: máx 50 bloques
            }
            pet.vy += ((targetY - p.y) * 2.4 - pet.vy) * Math.min(1, dt * 2);
            pet.vy = Math.max(-2.8, Math.min(2.8, pet.vy));
            p.y += pet.vy * dt;
        } else {
            let gAcc = 0;
            if (relY < CFG.MIN_H) gAcc = 2.2;              // muy bajo → subir
            else if (relY > CFG.MAX_H) gAcc = -2.2;        // muy alto → bajar
            else gAcc = Math.sin(t / 1100 + pet.phase) * 0.5; // flotar en banda
            pet.vy += (gAcc - pet.vy) * Math.min(1, dt * 1.6);
            pet.vy = Math.max(-1.4, Math.min(1.4, pet.vy));
            p.y += pet.vy * dt;
        }

        // yaw: mirando a donde se movió este frame (frente al vuelo)
        const rec = pet.rec;
        const movedX = p.x - prevX, movedZ = p.z - prevZ;
        if (movedX * movedX + movedZ * movedZ > 1e-6) {
            rec.yaw = Math.atan2(-movedX, -movedZ);
        } else if (dFlat > 0.4) {
            rec.yaw = Math.atan2(-(player.x - p.x), -(player.z - p.z));
        }

        // banqueo + picado: roll proporcional a la tasa de giro (inclina la
        // curva) y pitch proporcional a vy (pica al bajar, sube el morro al
        // trepar). Con order YXZ componen alrededor del yaw que escribe
        // CustomModels, sin pisarse.
        let dh = heading - (pet.lastHeading ?? heading);
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        pet.lastHeading = heading;
        const turnRate = dt > 0 ? dh / dt : 0;
        pet.procTurn = turnRate;   // lo consume la columna procedural
        const wantBank = Math.max(-0.6, Math.min(0.6, turnRate * 0.4));
        pet.bank += (wantBank - pet.bank) * Math.min(1, dt * 2.5);
        const rr = root.rotation;
        if (rr.order !== 'YXZ') rr.order = 'YXZ';
        rr.z = pet.bank;
        rr.x = Math.max(-0.45, Math.min(0.45, pet.vy * 0.22));

        // animaciones: vuela casi siempre (se mueve por diseño); dance al
        // aterrizar/espontáneo; idle solo de fallback si por algo quedó clavado
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
        } else if (pet.variant.leviathan && pet.stillFor > 0.8) {
            // quieto: los 3 ataques del GLB en rotación cíclica
            if (t >= (pet.nextAtkAt || 0)) {
                pet.nextAtkAt = t + 4200;
                pet.atkI = ((pet.atkI || 0) + 1) % LEV_ATK.length;
            }
            setPetAnim(pet, LEV_ATK[pet.atkI || 0]);
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

            // posición previa del jugador (para detectar velocidad y que los
            // allays no se queden atrás cuando corres)
            state.lastPlayerPos = { x: player.x, z: player.z };
        }
        state.rafId = requestAnimationFrame(loop);
    }

    // ---------- API + toggle ----------

    // start() sin mundo (menú): queda "pending" y arranca solo al detectar
    // jugador — así el toggle en el menú funciona al entrar a la partida
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
            state.forcedAnim = null;   // cambiar de mascota invalida la anim forzada
            try { localStorage.setItem('mf:allaypets:variant', key); } catch {}
            // re-spawn con el nuevo look
            for (const pet of [...state.pets]) removePet(pet);
            const player = playerPos();
            if (state.enabled && player) ensurePets(player);
            return true;
        },
        // animación fija ('' = automática). Sin argumento lista las disponibles
        // de la mascota actual (del modelo ya cargado en CustomModels)
        setAnim(name) {
            if (name === undefined) return state.forcedAnim;
            if (name === '' || name === null) name = null;
            state.forcedAnim = name || null;
            // resetear animMode para que el próximo tick la aplique
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
