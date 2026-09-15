
(function () {
    'use strict';
    if (window.__MF_Morph) return;
    const TAG = '[MF Morph]';

    const ID = 'mf-morph';
    const TPS = 20;

    const state = {
        open: false,
        
        catalog: new Map(),
        catalogAt: 0,
        current: null,        
        
        targets: new Map(),
        watchdog: null
    };

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
            
            if (typeof entity.getHealth !== 'function') return;
            const mesh = entity.mesh;
            const MeshClass = mesh?.constructor;
            if (!MeshClass || MeshClass === Object) return;
            
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

    function makeCallableZero() {
        const fn = function () { return 0; };
        fn.valueOf = () => 0;
        fn.toString = () => '0';
        try { fn[Symbol.toPrimitive] = () => 0; } catch {}
        return fn;
    }

    function makeProxyEntity(player) {
        const cache = new Map(); 
        return new Proxy(player, {
            get(target, prop) {
                try {
                    if (prop in target) {
                        const v = Reflect.get(target, prop, target);
                        
                        if (typeof v === 'function') return v.bind(target);
                        return v;
                    }
                } catch {}
                if (typeof prop !== 'string') return undefined;
                if (!cache.has(prop)) cache.set(prop, makeCallableZero());
                return cache.get(prop);
            },
            
            has(target, prop) {
                try { return prop in target; } catch { return false; }
            },
            set(target, prop, v) {
                try { Reflect.set(target, prop, v, target); } catch {}
                return true;
            }
        });
    }

    function applyOn(entity, typeKey) {
        if (!entity) throw new Error('entidad no disponible');
        if (!entity.mesh) throw new Error('la entidad no tiene mesh');
        scan(false);
        const entry = state.catalog.get(typeKey);
        if (!entry) {
            throw new Error('morph "' + typeKey + '" no disponible — acércate a uno de esos mobs y reintenta (scan)');
        }

        const prev = state.targets.get(entity.id);
        if (prev?.morphMesh) detachFrom(entity.id);

        const origMesh = prev?.origMesh || entity.mesh;
        if (!origMesh) throw new Error('mesh original no disponible');

        const proxy = makeProxyEntity(entity);
        let morph = null;
        try {
            morph = new entry.MeshClass(proxy);
        } catch (e) {
            throw new Error('no se pudo construir el mesh de ' + typeKey + ': ' + e.message);
        }
        if (!morph) throw new Error('mesh de ' + typeKey + ' nulo');

        const group = getEntityMeshesGroup(getGame());
        try { group?.remove?.(origMesh); } catch {}
        try { origMesh.parent?.remove?.(origMesh); } catch {}
        try { group?.add?.(morph); } catch {}
        entity.mesh = morph;

        state.targets.set(entity.id, {
            entity, type: typeKey, origMesh, morphMesh: morph
        });

        try { morph.render(); } catch {}
        forceVisible(morph);
        startWatchdog();
        return morph;
    }

    function apply(typeKey) {
        const game = getGame();
        if (!game) throw new Error('jugador no disponible (entra al mundo primero)');
        const me = getLocalPlayerEntity(game);
        applyOn(me, typeKey);
        state.current = typeKey;
        renderUI();
        
        try { window.MF_Peer?.sendLook?.({ a: 'morph', type: typeKey }); } catch {}
        console.log(TAG + ' morph aplicado: ' + typeKey);
        return { ok: true, type: typeKey };
    }

    function detachFrom(entityId) {
        const t = state.targets.get(entityId);
        if (!t) return;
        const group = getEntityMeshesGroup(getGame());
        try { group?.remove?.(t.morphMesh); } catch {}
        try { t.morphMesh?.parent?.remove?.(t.morphMesh); } catch {}
        try { if (t.morphMesh?.dispose) t.morphMesh.dispose(); } catch {}
        if (t.entity) {
            try { t.entity.mesh = t.origMesh; } catch {}
            try { group?.add?.(t.origMesh); } catch {}
        }
        state.targets.delete(entityId);
    }

    function forceVisible(root) {
        try {
            root.traverse(o => {
                o.visible = true;
                o.frustumCulled = false; 
                o.matrixAutoUpdate = true;
            });
        } catch {}
    }

    function startWatchdog() {
        stopWatchdog();
        state.watchdog = setInterval(() => {
            const game = getGame();
            
            for (const [id, t] of state.targets) {
                const me = t.entity;
                if (!me) continue;
                if (me.mesh !== t.morphMesh) {
                    
                    const group = getEntityMeshesGroup(game);
                    try { group?.remove?.(me.mesh); } catch {}
                    try { group?.add?.(t.morphMesh); } catch {}
                    me.mesh = t.morphMesh;
                    continue;
                }
                
                try {
                    t.morphMesh.traverse(o => {
                        if (o.visible === false) o.visible = true;
                    });
                } catch {}
            }
        }, 400);
    }

    function stopWatchdog() {
        if (state.watchdog) { clearInterval(state.watchdog); state.watchdog = null; }
    }

    function revert() {
        const game = getGame();
        if (!game) return { ok: false, error: 'sin juego' };
        if (!state.targets.size) return { ok: false, error: 'no hay morph activo' };
        
        for (const id of [...state.targets.keys()]) detachFrom(id);
        state.current = null;
        stopWatchdog();
        renderUI();
        
        try { window.MF_Peer?.sendLook?.({ a: 'unmorph' }); } catch {}
        console.log(TAG + ' revert: forma humana restaurada');
        return { ok: true };
    }

    function applyAtTick(tick, typeKey, durationTicks) {
        const FS = window.MF_FaceSwap;
        if (!FS?.applyAtTick) return { ok: false, error: 'FaceSwap no disponible' };
        const dur = Math.max(1, Math.round(durationTicks || TPS));
        FS.applyAtTick(tick, 'morph_' + typeKey, 'morph', dur);
        return { ok: true };
    }

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

    window.MF_Morph = {
        open, close,
        scan,
        apply, revert,
        applyAtTick,
        
        applyOn, detachFrom,
        
        findEntityByName(username) {
            const game = getGame();
            if (!game || !username) return null;
            try {
                for (const e of game.world.players.values()) {
                    if (e?.profile?.username === username) return e;
                }
            } catch {}
            try {
                for (const e of game.world.entities.values()) {
                    if (e?.profile?.username === username) return e;
                }
            } catch {}
            return null;
        },
        get current() { return state.current; },
        get catalog() { return [...state.catalog.values()].map(e => ({ type: e.type, label: e.label })); }
    };
    window.__MF_Morph = true;

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
