// MF_Morph.js — Morph del jugador local: transformarse en un mob del mundo
// (creeper, cerdo, lobo…), 100% visual y client-side, ideal para machinimas.
//
// Cómo funciona (investigado del bundle de miniblox.io):
// - Cada entidad tiene `entity.mesh` (clase MeshRenderer del juego) y el
//   bucle de render llama `mesh.render()` por frame, leyendo pos/yaw/pose
//   de `mesh.entity`.
// - El player usa la clase de mesh "LF" (humanoide). Los mobs usan sus
//   propias clases (creeper, pig, wolf…), CONSTRUCTOR(ENTITY).
// - Los nombres de clases cambian en cada build (minificados), así que NO
//   se referencian por nombre: se COSECHAN de los mobs vivos del mundo —
//   cada entidad de `world.entities` aporta su `constructor` y el
//   `constructor` de su mesh.
// - El morph construye `new MeshClass(proxyPlayer)`: un Proxy que devuelve
//   las propiedades del player real (pos, yaw, limbSwing, sneak…) y valores
//   neutros (0 / noop) para métodos que solo tienen los mobs (p.ej. la
//   hinchazón del creeper). Así el propio juego anima el mob siguiendo al
//   player, sin tocar al servidor.
// - El swap solo toca la escena: quita el mesh humanoide de entityMeshes,
//   cuelga el del mob y un watchdog lo mantiene visible (el juego oculta
//   el player en primera persona). Revert restaura el mesh original.
//
// Uso:
//   MF_Morph.scan()                // lista de mobs disponibles en el mundo
//   MF_Morph.apply('creeper')      // transformarse
//   MF_Morph.revert()              // volver a la forma humana
//   MF_Morph.open()                // panel UI
//   MF_Morph.applyAtTick(t, 'pig') // clip para el timeline V2

(function () {
    'use strict';
    if (window.__MF_Morph) return;
    const TAG = '[MF Morph]';

    const ID = 'mf-morph';
    const TPS = 20;

    const state = {
        open: false,
        // typeKey -> { type, MeshClass, label }
        // typeKey: `creeper`, `pig`… deducido de entity.type o className
        catalog: new Map(),
        catalogAt: 0,
        current: null,        // typeKey aplicado
        // para revert:
        origMesh: null,       // mesh humanoide original del player
        morphMesh: null,      // mesh del mob montado
        watchdog: null
    };

    // ── acceso al juego (patrón del cliente) ──
    function getGame() {
        if (globalThis.miniblox?.player) return globalThis.miniblox;
        try {
            const react = document.querySelector('#react');
            if (react) for (const root of Object.values(react)) {
                const g = root?.updateQueue?.baseState?.element?.props?.game;
                if (g?.player) return g;
            }
        } catch {}
        return null;
    }

    function getLocalPlayerEntity(game) {
        const me = game?.player;
        if (!me) return null;
        try { const e = game.world?.getPlayerById?.(me.id); if (e) return e; } catch {}
        try { const e = game.world?.players?.get?.(me.id); if (e) return e; } catch {}
        try { const e = game.world?.entities?.get?.(me.id); if (e) return e; } catch {}
        return me;
    }

    function getEntityMeshesGroup(game) {
        return game?.gameScene?.entityMeshes || null;
    }

    // ── cosecha del catálogo: clases mesh de los mobs vivos ──
    // Recorre world.entities (y world.players para el propio player como
    // fallback del humanoide) y registra cada clase de mesh distinta.
    function typeKeyOf(entity) {
        if (typeof entity?.type === 'string' && entity.type) return entity.type;
        const cn = entity?.constructor?.name || '';
        return cn.replace(/^Entity/, '').toLowerCase();
    }

    function scan(force) {
        const game = getGame();
        if (!game) return [];
        const now = Date.now();
        if (!force && state.catalog.size && now - state.catalogAt < 3000) {
            return [...state.catalog.values()];
        }
        state.catalog.clear();

        const me = getLocalPlayerEntity(game);
        const meId = me?.id;

        const consider = (entity) => {
            if (!entity || entity.id === meId) return;
            // SOLO mobs vivientes: items/flechas/orbes/TNT también están en
            // world.entities pero sus meshes leen props que el player no
            // tiene (item.stack, motion de flecha…) y crashean el render
            if (typeof entity.getHealth !== 'function') return;
            const mesh = entity.mesh;
            const MeshClass = mesh?.constructor;
            if (!MeshClass || MeshClass === Object) return;
            // descartar el humanoid del player (misma clase que mi mesh)
            if (me?.mesh?.constructor === MeshClass) return;
            const key = typeKeyOf(entity);
            if (!key || key === 'player') return;
            if (!state.catalog.has(key)) {
                state.catalog.set(key, {
                    type: key, MeshClass,
                    label: key.replace(/_/g, ' ')
                });
            }
        };

        try { for (const e of game.world.entities.values()) consider(e); } catch {}
        try { for (const e of game.world.players.values()) consider(e); } catch {}

        state.catalogAt = now;
        renderUI();
        return [...state.catalog.values()];
    }

    // ── Proxy del player: la "entidad" que verá el mesh del mob ──
    // Devuelve props del player real; métodos/props desconocidas → neutro.
    //
    // El fallback neutro es una FUNCIÓN que devuelve 0 y además sabe
    // comportarse como 0 (valueOf/Symbol.toPrimitive): los renderers de
    // mobs llaman a métodos que el player no tiene (hinchazón del creeper,
    // lana de oveja…) — si devolviéramos 0 pelado, `0(e)` lanzaría
    // "TypeError: 0 is not a function" DENTRO del render loop del juego
    // y lo congelaría. Con la fn-callable no crashea y los cálculos
    // (`t > 0`, `t * x`) caen a 0 de forma segura.
    function makeCallableZero() {
        const fn = function () { return 0; };
        fn.valueOf = () => 0;
        fn.toString = () => '0';
        try { fn[Symbol.toPrimitive] = () => 0; } catch {}
        return fn;
    }

    function makeProxyEntity(player) {
        const cache = new Map(); // misma fn para una misma prop (identidad estable)
        return new Proxy(player, {
            get(target, prop) {
                try {
                    if (prop in target) {
                        const v = Reflect.get(target, prop, target);
                        // bind para que los métodos internos no vean el Proxy
                        if (typeof v === 'function') return v.bind(target);
                        return v;
                    }
                } catch {}
                if (typeof prop !== 'string') return undefined;
                if (!cache.has(prop)) cache.set(prop, makeCallableZero());
                return cache.get(prop);
            },
            // reflejar el target real: decir "true" para TODO rompía los
            // chequeos de features del propio renderer
            has(target, prop) {
                try { return prop in target; } catch { return false; }
            },
            set(target, prop, v) {
                try { Reflect.set(target, prop, v, target); } catch {}
                return true;
            }
        });
    }

    // ── morph ──
    function apply(typeKey) {
        const game = getGame();
        if (!game) throw new Error('jugador no disponible (entra al mundo primero)');
        scan(false);
        const entry = state.catalog.get(typeKey);
        if (!entry) {
            throw new Error('morph "' + typeKey + '" no disponible — acércate a uno de esos mobs y reintenta (scan)');
        }
        const me = getLocalPlayerEntity(game);
        if (!me?.mesh) throw new Error('el jugador no tiene mesh');

        // si ya hay un morph activo, desmontarlo primero y restaurar el
        // humanoide como base (me.mesh apunta al morph viejo, no al original)
        if (state.morphMesh) detachMorph(game, me);
        const origMesh = state.origMesh || me.mesh;
        if (!origMesh) throw new Error('mesh original no disponible');

        const proxy = makeProxyEntity(me);
        let morph = null;
        try {
            morph = new entry.MeshClass(proxy);
        } catch (e) {
            throw new Error('no se pudo construir el mesh de ' + typeKey + ': ' + e.message);
        }
        if (!morph) throw new Error('mesh de ' + typeKey + ' nulo');

        // ocultar el humanoide: quitarlo del grupo de entity meshes y de la
        // entidad (el bucle de render solo dibuja e.mesh)
        const group = getEntityMeshesGroup(game);
        try { group?.remove?.(origMesh); } catch {}
        try { origMesh.parent?.remove?.(origMesh); } catch {}

        // colgar el morph donde estaba el original
        try { group?.add?.(morph); } catch {}
        me.mesh = morph;

        // estado para revert
        state.origMesh = state.origMesh || origMesh;
        state.morphMesh = morph;
        state.current = typeKey;

        // primer render para que tome posición/pose (patrón del spawner)
        try { morph.render(); } catch {}
        // visibilidad forzada (el juego oculta al player en 1ª persona)
        forceVisible(morph);
        startWatchdog();

        renderUI();
        console.log(TAG + ' morph aplicado: ' + typeKey);
        return { ok: true, type: typeKey };
    }

    function detachMorph(game, me) {
        const group = getEntityMeshesGroup(game);
        try { group?.remove?.(state.morphMesh); } catch {}
        try { state.morphMesh?.parent?.remove?.(state.morphMesh); } catch {}
        try { if (state.morphMesh?.dispose) state.morphMesh.dispose(); } catch {}
        state.morphMesh = null;
        // restaurar el humanoide como mesh actual (aunque se re-morfará en
        //seguida: deja el estado consistente si algo falla después)
        if (me && state.origMesh) {
            try { me.mesh = state.origMesh; } catch {}
            try { group?.add?.(state.origMesh); } catch {}
        }
    }

    function forceVisible(root) {
        try {
            root.traverse(o => {
                o.visible = true;
                o.frustumCulled = false; // actor de machinima: siempre visible
                o.matrixAutoUpdate = true;
            });
        } catch {}
    }

    function startWatchdog() {
        stopWatchdog();
        state.watchdog = setInterval(() => {
            const game = getGame();
            const me = game && getLocalPlayerEntity(game);
            if (!me) return;
            if (me.mesh !== state.morphMesh) {
                // el juego recreó el mesh (respawn, cambio de mundo…) →
                // re-montar el morph si sigue activo
                if (state.current && state.morphMesh) {
                    const group = getEntityMeshesGroup(game);
                    try { group?.remove?.(me.mesh); } catch {}
                    try { group?.add?.(state.morphMesh); } catch {}
                    me.mesh = state.morphMesh;
                }
                return;
            }
            // re-forzar visibilidad (el render loop la toca según perspectiva)
            try {
                state.morphMesh.traverse(o => {
                    if (o.visible === false) o.visible = true;
                });
            } catch {}
        }, 400);
    }

    function stopWatchdog() {
        if (state.watchdog) { clearInterval(state.watchdog); state.watchdog = null; }
    }

    function revert() {
        const game = getGame();
        if (!game) return { ok: false, error: 'sin juego' };
        if (!state.current) return { ok: false, error: 'no hay morph activo' };
        const me = getLocalPlayerEntity(game);
        const group = getEntityMeshesGroup(game);

        if (state.morphMesh) {
            try { group?.remove?.(state.morphMesh); } catch {}
            try { state.morphMesh?.parent?.remove?.(state.morphMesh); } catch {}
            try { if (state.morphMesh?.dispose) state.morphMesh.dispose(); } catch {}
            state.morphMesh = null;
        }
        if (state.origMesh && me) {
            try { me.mesh = state.origMesh; } catch {}
            try { group?.add?.(state.origMesh); } catch {}
            state.origMesh = null;
        }
        state.current = null;
        stopWatchdog();
        renderUI();
        console.log(TAG + ' revert: forma humana restaurada');
        return { ok: true };
    }

    // trigger para el timeline V2 (tipo 'morph' via FaceSwap)
    function applyAtTick(tick, typeKey, durationTicks) {
        const FS = window.MF_FaceSwap;
        if (!FS?.applyAtTick) return { ok: false, error: 'FaceSwap no disponible' };
        const dur = Math.max(1, Math.round(durationTicks || TPS));
        FS.applyAtTick(tick, 'morph_' + typeKey, 'morph', dur);
        return { ok: true };
    }

    // ── miniatura: render del mob a un canvas pequeño ──
    // Sin acceso fácil al canvas WebGL del juego desde aquí (preservar
    // drawing buffer es opcional), las cards usan un emoji por tipo.
    const MOJI = {
        creeper: '🟩', pig: '🐖', cow: '🐄', chicken: '🐔', sheep: '🐑',
        wolf: '🐺', cat: '🐈', zombie: '🧟', skeleton: '💀', slime: '🟢',
        spider: '🕷️', snowman: '⛄', ghost: '👻', villager: '🧑‍🌾',
        iron_golem: '🗿', armor_stand: '🧍', boat: '🚤', minecart: '🛒',
        zombie_cowman: '🧟‍🐄'
    };
    function emojiFor(key) {
        if (MOJI[key]) return MOJI[key];
        if (/zombie/i.test(key)) return '🧟';
        if (/horse|donkey|mule/i.test(key)) return '🐎';
        return '🧬';
    }

    // ── UI ──
    function buildUI() {
        if (document.getElementById(ID)) { renderUI(); return; }
        const style = document.createElement('style');
        style.id = ID + '-style';
        style.textContent = `
#${ID} { position:fixed; top:70px; right:16px; z-index:2147483000;
  background:#14141a; border:1px solid #32323a; border-radius:8px;
  box-shadow:0 8px 32px rgba(0,0,0,.6); color:#e8e8ee;
  font:12px/1.4 system-ui,sans-serif; user-select:none; width:250px; }
#${ID} .mfm-head { display:flex; align-items:center; gap:8px; padding:8px 10px;
  border-bottom:1px solid #26262e; font-weight:700; letter-spacing:.5px; }
#${ID} .mfm-head .dot { width:8px; height:8px; border-radius:50%;
  background:#b56bff; animation:mfm-pulse 1.5s infinite; }
@keyframes mfm-pulse { 50% { opacity:.35; } }
#${ID} .mfm-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px;
  padding:8px 10px; max-height:260px; overflow-y:auto; }
#${ID} .mfm-item { position:relative; border:1px solid #32323a; border-radius:6px;
  padding:6px 2px; cursor:pointer; text-align:center; background:#191921; }
#${ID} .mfm-item:hover { border-color:#b56bff; }
#${ID} .mfm-item.on { border-color:#ff6b2b; background:#241d16; }
#${ID} .mfm-item .moji { font-size:20px; display:block; line-height:1.2; }
#${ID} .mfm-item .nm { display:block; font-size:9px; color:#9a9aa6;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#${ID} button { background:#23232c; color:#e8e8ee; border:1px solid #3a3a44;
  border-radius:4px; padding:3px 8px; cursor:pointer; font:inherit; }
#${ID} button:hover { background:#2e2e3a; }
#${ID} .mfm-foot { display:flex; gap:6px; padding:6px 10px 10px; }
#${ID} .mfm-hint { padding:0 10px 6px; font-size:10px; color:#8a8a96; }
        `;
        document.body.appendChild(style);
        const root = document.createElement('div');
        root.id = ID;
        root.innerHTML = `
<div class="mfm-head"><span class="dot"></span>🧬 MORPH — mobs
    <button data-act="close" style="margin-left:auto" title="Cerrar">✕</button></div>
<div class="mfm-hint">Mobs cosechados del mundo actual. Click = transformarse · arrastra al timeline V2.</div>
<div class="mfm-grid" id="mfm-grid"></div>
<div class="mfm-foot">
    <button data-act="rescan" title="Volver a escanear entidades">⟳ Escanear</button>
    <button data-act="revert" title="Volver a la forma humana">↺ Humano</button>
</div>
        `;
        document.body.appendChild(root);
        root.querySelector('[data-act="close"]').onclick = () => close();
        root.querySelector('[data-act="rescan"]').onclick = () => {
            scan(true);
            updateStatusHint();
        };
        root.querySelector('[data-act="revert"]').onclick = () => { revert(); };
    }

    function updateStatusHint() {
        const hint = document.querySelector('#' + ID + ' .mfm-hint');
        if (!hint) return;
        hint.textContent = state.catalog.size
            ? state.catalog.size + ' tipo(s) disponibles — click = morph · arrastra al timeline V2'
            : 'Sin mobs cerca. Acércate a mobs y pulsa Escanear.';
    }

    function renderUI() {
        const grid = document.getElementById('mfm-grid');
        if (!grid) return;
        grid.innerHTML = '';
        const entries = [...state.catalog.values()].sort((a, b) => a.label.localeCompare(b.label));
        if (!entries.length) {
            grid.innerHTML = '<div style="grid-column:1/-1;color:#8a8a96;font-size:11px;text-align:center;padding:8px;">Sin mobs en el mundo aún<br>Pulsa ⟳ Escanear</div>';
            return;
        }
        for (const entry of entries) {
            const d = document.createElement('div');
            d.className = 'mfm-item' + (state.current === entry.type ? ' on' : '');
            d.title = entry.label + ' — click = morph en vivo · arrastra al timeline V2';
            d.draggable = true;
            d.innerHTML = `<span class="moji">${emojiFor(entry.type)}</span><span class="nm">${entry.label}</span>`;
            d.ondragstart = (ev) => {
                ev.dataTransfer.setData('text/mf-morph', entry.type);
                ev.dataTransfer.setData('text/plain', entry.type);
                ev.dataTransfer.effectAllowed = 'copy';
            };
            d.onclick = () => {
                try {
                    apply(entry.type);
                } catch (e) {
                    console.warn(TAG + ' ' + e.message);
                    const hint = document.querySelector('#' + ID + ' .mfm-hint');
                    if (hint) { hint.textContent = '⚠ ' + e.message; hint.style.color = '#ff9d7d'; setTimeout(() => hint.style.color = '', 2500); }
                }
            };
            grid.appendChild(d);
        }
        updateStatusHint();
    }

    function open() {
        if (state.open) { renderUI(); return; }
        state.open = true;
        buildUI();
        scan(true);
    }

    function close() {
        document.getElementById(ID)?.remove();
        document.getElementById(ID + '-style')?.remove();
        state.open = false;
    }

    // ── API ──
    window.MF_Morph = {
        open, close,
        scan,
        apply, revert,
        applyAtTick,
        get current() { return state.current; },
        get catalog() { return [...state.catalog.values()].map(e => ({ type: e.type, label: e.label })); }
    };
    window.__MF_Morph = true;

    // escaneo inicial cuando haya juego (para que el Studio pueda listar)
    const boot = setInterval(() => {
        const g = getGame();
        if (g?.world?.entities?.size) {
            clearInterval(boot);
            scan(true);
            document.dispatchEvent(new CustomEvent('mf:morph-catalog'));
        }
    }, 1500);
    setTimeout(() => clearInterval(boot), 120000);

    console.log(TAG + ' listo. MF_Morph.open() — transformarse en mobs del mundo.');
})();
