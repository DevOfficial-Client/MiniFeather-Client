(function () {
    'use strict';

    const GLOBAL_KEY = '__MINIFEATHER_BRIDGE__';
    const PREFIX = '[MF:';
    const CHAT_CMD = '/mf ';
    const HANDSHAKE_INTERVAL = 15000;
    const POLL_INTERVAL = 700;

    const state = {
        destroyed: false,
        game: null,
        lastGameScan: 0,
        lastHandshake: 0,
        hsFails: 0,
        linked: false,
        linkedWorld: '',
        caps: {},
        stats: { rx: 0, tx: 0 }
    };

    function log(...args) {
        try { console.log('[MF_Bridge]', ...args); } catch (_) {}
    }

    function getGame(force = false) {
        const now = Date.now();
        if (globalThis.miniblox?.player) { state.game = globalThis.miniblox; return state.game; }
        if (globalThis.__MINIBLOX_GAME__?.player) { state.game = globalThis.__MINIBLOX_GAME__; return state.game; }
        if (!force && state.game?.player && now - state.lastGameScan < 1000) return state.game;
        state.lastGameScan = now;
        try {
            const react = document.querySelector('#react');
            if (react) {
                for (const root of Object.values(react)) {
                    const g = root?.updateQueue?.baseState?.element?.props?.game;
                    if (g?.player) { state.game = g; return g; }
                }
                for (const root of Object.values(react)) {
                    const g = root?.lastEffectTreeNode?.game;
                    if (g?.player) { state.game = g; return g; }
                }
            }
        } catch (_) {}
        return state.game?.player ? state.game : null;
    }

    function myIdentity() {
        const g = state.game || getGame();
        const prof = g?.player?.profile;
        return {
            name: String(prof?.username || prof?.name || '').trim(),
            uuid: String(prof?.uuid || '').trim()
        };
    }

    function permissionLevel() {
        const g = state.game || getGame();
        try {
            const info = g?.serverInfo;
            const uuid = g?.player?.profile?.uuid;
            let level = Number(info?.permissionLevel);
            if (!Number.isFinite(level)) level = 0;
            if (uuid && info?.planetOwnerUuid === uuid) level = 200;
            return level;
        } catch (_) { return 0; }
    }

    function serverKey() {
        const g = state.game || getGame();
        try {
            const si = g?.serverInfo;
            if (!si) return '';
            if (typeof si.serverId === 'string' && si.serverId) return si.serverId;
            return String(si.worldCacheKey || si.serverName || si.worldType || '');
        } catch (_) { return ''; }
    }

    function sendRaw(text) {
        const g = state.game || getGame(true);
        const chat = g?.chat;
        if (!chat || typeof chat.submit !== 'function') return false;
        try {
            try { chat.setInputValue?.(text); } catch { try { chat.inputValue = text; } catch {} }
            chat.submit(g);
            state.stats.tx++;
            return true;
        } catch (_) {
            return false;
        } finally {
            try { chat.closeInput?.(); } catch {}
        }
    }

    function send(msg) {
        return sendRaw(CHAT_CMD + JSON.stringify(msg));
    }

    let relaySeq = 0;
    function sendTo(target, data) {
        return send({
            t: 'relay',
            id: ++relaySeq,
            to: target || '*',
            d: data
        });
    }

    const msgHandlers = [];
    function onMessage(fn) {
        if (typeof fn === 'function') msgHandlers.push(fn);
    }

    function dispatchClientMessage(from, data) {
        for (const fn of [...msgHandlers]) {
            try { fn(from, data); } catch (_) {}
        }
    }

    function listMods() {
        const out = [];
        const names = {
            TitanTiny: 'titan',
            __MINIFEATHER_WAYPOINTS__: 'waypoints',
            __MINIFEATHER_CLIENT_COMMANDS__: 'commands',
            __MINIFEATHER_LOCAL_GAMES__: 'localgames'
        };
        for (const [key, tag] of Object.entries(names)) {
            if (globalThis[key]) out.push(tag);
        }
        return out;
    }

    function applyCap(cap, world) {
        const api = globalThis.TitanTiny;
        if (!api || typeof api.setServerCap !== 'function') return;
        const clean = (cap && Number.isFinite(Number(cap.min)) && Number.isFinite(Number(cap.max)))
            ? { min: Math.max(0.01, Math.min(5, Number(cap.min))), max: Math.max(0.01, Math.min(5, Number(cap.max))) }
            : null;
        api.setServerCap(clean);
        const w = String(world || serverKey() || 'default');
        state.caps[w] = clean;
        log('cap applied:', JSON.stringify(clean), 'world:', w);
    }

    function addWaypointFromServer(name, x, y, z, color) {
        const api = globalThis.__MINIFEATHER_WAYPOINTS__;
        if (!api || typeof api.addWaypoint !== 'function') return false;
        const r = api.addWaypoint(String(name || 'wp'), { x, y, z }, color ? { color } : undefined);
        log('waypoint add ->', name, r?.ok);
        return !!(r && r.ok);
    }

    const ENT_PREFIX = 'mfbrid_';
    const serverEntities = new Map();

    function handleEntity(m) {
        const CM = globalThis.MF_CustomModels;
        if (!CM) return;
        const a = String(m.a || '');
        if (a === 'spawn' && m.ent) {
            const e = m.ent;
            const file = String(e.model || '');
            if (!/^[\w.\-\/]+\.geo\.json$/.test(file)) return;
            const id = ENT_PREFIX + String(e.id || '');
            const opts = {
                id,
                scale: Number(e.scale) || 1,
                yaw: Number(e.yaw) || 0,
                anim: e.anim || undefined,
                stay: true,
                lookAtPlayer: false,
                noPhysics: true
            };
            if (e.texture) opts.texture = String(e.texture);
            try { CM.despawn(id); } catch {}
            CM.spawn(file, Number(e.x) || 0, Number(e.y) || 0, Number(e.z) || 0, opts);
            serverEntities.set(id, { model: file, x: e.x, y: e.y, z: e.z, scale: e.scale });
            log('ent spawn:', id, file, '@', e.x, e.y, e.z, 'x' + (e.scale || 1));
        } else if (a === 'move') {
            const id = ENT_PREFIX + String(m.id || '');
            try { CM.move(id, Number(m.x) || 0, Number(m.y) || 0, Number(m.z) || 0, m.yaw != null ? Number(m.yaw) : undefined); } catch {}
            const rec = serverEntities.get(id);
            if (rec) { rec.x = m.x; rec.y = m.y; rec.z = m.z; }
        } else if (a === 'scale') {
            const id = ENT_PREFIX + String(m.id || '');
            const s = Number(m.scale);
            if (Number.isFinite(s)) {
                if (typeof CM.setScale === 'function') {
                    try { CM.setScale(id, s); } catch {}
                } else {
                    const rec = serverEntities.get(id);
                    if (rec) {
                        try { CM.despawn(id); } catch {}
                        CM.spawn(rec.model, rec.x, rec.y, rec.z, { id, scale: s, stay: true, noPhysics: true });
                    }
                }
                const r2 = serverEntities.get(id);
                if (r2) r2.scale = s;
            }
        } else if (a === 'despawn') {
            const id = ENT_PREFIX + String(m.id || '');
            try { CM.despawn(id); } catch {}
            serverEntities.delete(id);
        }
    }

    function clearServerEntities() {
        const CM = globalThis.MF_CustomModels;
        for (const id of [...serverEntities.keys()]) {
            try { CM?.despawn(id); } catch {}
        }
        serverEntities.clear();
    }

    let configBackup = null;

    function sendConfigEvent(key, value) {
        const evMap = {
            zoom: 'minifeather:zoom-config',
            freelook: 'minifeather:freelook-config',
            freecam: 'minifeather:freecam-config',
            elytraFlight: 'minifeather:elytra-flight-config',
            cameraOverhaul: 'minifeather:cameraoverhaul-config',
            antiAfk: 'minifeather:anti-afk-config',
            autoRespawn: 'minifeather:auto-respawn-config',
            fullBright: 'minifeather:fullbright-config',
            leafWind: 'minifeather:leaf-wind-config',
            handSway: 'minifeather:handsway-config',
            vanillaAnimations: 'minifeather:vanillaanimations-config',
            playerAnims: 'minifeather:playeranims-config',
            dynamicCrosshair: 'minifeather:dynamiccrosshair-config',
            customShader: 'minifeather:custom-shader-config',
            titanTiny: 'minifeather:titantiny-config',
            healthNameTags: 'minifeather:healthnametags-config',
            distanceNameTags: 'minifeather:distancenametags-config',
            duckMobs: 'minifeather:duckmobs-toggle',
            crittersMobs: 'minifeather:critters-toggle',
            allaypets: 'minifeather:allaypets-toggle'
        };
        const ev = evMap[key];
        if (!ev) return false;
        const payload = { enabled: !!value, [key]: value };
        try {
            document.dispatchEvent(new CustomEvent(ev, { detail: JSON.stringify(payload) }));
            return true;
        } catch { return false; }
    }

    function readCurrentSetting(key) {
        try {
            if (key === 'titanTiny') {
                const tt = globalThis.TitanTiny;
                if (tt) return tt.enabled;
            }
        } catch {}
        return undefined;
    }

    function applyServerConfig(cfg) {
        if (!cfg || typeof cfg !== 'object') return;
        if (!configBackup) configBackup = {};
        let applied = 0;
        for (const [key, value] of Object.entries(cfg)) {
            if (!(key in configBackup)) configBackup[key] = readCurrentSetting(key);
            if (sendConfigEvent(key, value)) applied++;
        }
        log('cfg applied:', applied, 'keys');
    }

    function clearServerConfig() {
        if (!configBackup) return;
        let restored = 0;
        for (const [key, value] of Object.entries(configBackup)) {
            if (value !== undefined && sendConfigEvent(key, value)) restored++;
        }
        configBackup = null;
        log('cfg restored:', restored);
    }

    const gui = { root: null, cfg: null, cap: null };

    function configMenu() {
        if (gui.root) { gui.root.remove(); gui.root = null; return; }

        const mk = (tag, css) => {
            const el = document.createElement(tag);
            el.style.cssText = css;
            return el;
        };
        const IN = 'background:#1a1e24;color:#e8e8e8;border:1px solid #444;border-radius:4px;padding:4px 6px;font-family:monospace;font-size:12px;outline:none;';
        const BTN = 'background:#2a2f37;color:#e8e8e8;border:1px solid #444;border-radius:4px;padding:5px 10px;font-family:monospace;font-size:12px;cursor:pointer;';
        const BTN_RED = 'background:#3b1e1e;color:#ff8a8a;border:1px solid #5a3030;border-radius:4px;padding:5px 10px;font-family:monospace;font-size:12px;cursor:pointer;';

        const root = mk('div', 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:520px;max-height:82vh;overflow-y:auto;z-index:99999;background:rgba(14,17,21,.98);border-radius:10px;padding:16px;font-family:monospace;color:#e8e8e8;font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,.6);border:1px solid #333;');
        gui.root = root;

        root.appendChild(mk('div', 'font-size:15px;font-weight:bold;color:#fff;margin-bottom:2px;')).textContent = 'MiniFeather — Server Config';
        root.appendChild(mk('div', 'font-size:11px;color:#888;margin-bottom:12px;')).textContent = `world: ${state.linkedWorld || '—'} · linked: ${state.linked ? 'yes' : 'no'}`;

        const close = mk('button', 'position:absolute;top:10px;right:12px;background:transparent;border:none;color:#888;font-size:16px;cursor:pointer;');
        close.textContent = '✕';
        close.onclick = () => { root.remove(); gui.root = null; };
        root.appendChild(close);

        const push = (key, value) => send({ t: 'cfg-set', key, value });

        const sections = [
            ['MOVEMENT', ['zoom', 'freelook', 'freecam', 'elytraFlight', 'cameraOverhaul', 'antiAfk', 'autoRespawn']],
            ['RENDER', ['fullBright', 'leafWind', 'handSway', 'vanillaAnimations', 'playerAnims', 'healthNameTags', 'distanceNameTags']],
            ['MODULES', ['duckMobs', 'crittersMobs', 'allaypets', 'titanTiny', 'dynamicCrosshair', 'customShader']],
            ['HUD', ['keystrokes', 'fpsCounter', 'cpsCounter', 'pingCounter', 'armorHud', 'coordinates', 'waypoints']],
            ['CHAT', ['chatVideos', 'chatLinks', 'chatMemes', 'gifChat', 'clientChat']]
        ];

        const bcfg = gui.cfg || {};

        for (const [name, keys] of sections) {
            root.appendChild(mk('div', 'margin-top:10px;margin-bottom:6px;font-weight:bold;color:#ef3b3b;font-size:12px;letter-spacing:.5px;')).textContent = name;
            for (const key of keys) {
                const row = mk('div', 'display:flex;align-items:center;justify-content:space-between;padding:4px 0;');
                const label = mk('span', 'color:#ccc;');
                label.textContent = key;
                const cb = mk('input', 'accent-color:#ef3b3b;cursor:pointer;');
                cb.type = 'checkbox';
                cb.checked = !!bcfg[key];
                cb.onchange = () => {
                    bcfg[key] = cb.checked;
                    push(key, cb.checked);
                };
                row.appendChild(label);
                row.appendChild(cb);
                root.appendChild(row);
            }
        }

        root.appendChild(mk('div', 'height:1px;background:#333;margin:14px 0 10px;'));

        root.appendChild(mk('div', 'font-weight:bold;color:#ef3b3b;font-size:12px;margin-bottom:8px;letter-spacing:.5px;')).textContent = 'SCALE CAP';

        const capRow = mk('div', 'display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;');
        const minIn = mk('input', IN + 'width:64px;');
        minIn.type = 'text';
        minIn.value = String(gui.cap?.min ?? 0.5);
        const maxIn = mk('input', IN + 'width:64px;');
        maxIn.type = 'text';
        maxIn.value = String(gui.cap?.max ?? 1.8);
        const capBtn = mk('button', BTN);
        capBtn.textContent = 'Apply cap';
        const capOff = mk('button', BTN_RED);
        capOff.textContent = 'Remove cap';
        capRow.appendChild(mk('span', 'color:#aaa;')).textContent = 'min';
        capRow.appendChild(minIn);
        capRow.appendChild(mk('span', 'color:#aaa;')).textContent = 'max';
        capRow.appendChild(maxIn);
        capRow.appendChild(capBtn);
        capRow.appendChild(capOff);
        root.appendChild(capRow);
        root.appendChild(mk('div', 'font-size:11px;color:#666;margin-bottom:4px;')).textContent = 'Players without admin get clamped to this range. Admins are never capped.';

        const applyCapChange = (capObj) => {
            send({ t: 'cap-set', cap: capObj });
            gui.cap = capObj;
        };

        capBtn.onclick = () => {
            const lo = parseFloat(minIn.value);
            const hi = parseFloat(maxIn.value);
            if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
            applyCapChange({ min: Math.min(lo, hi), max: Math.max(lo, hi) });
        };
        capOff.onclick = () => applyCapChange(null);

        root.appendChild(mk('div', 'height:1px;background:#333;margin:14px 0 10px;'));

        root.appendChild(mk('div', 'font-size:11px;color:#666;')).textContent = 'Changes apply live to all linked clients. Server config persists across restarts.';

        document.body.appendChild(root);
    }

    function handleServerMessage(obj) {
        if (!obj || typeof obj !== 'object') return;
        state.stats.rx++;
        switch (obj.t) {
            case 'hello': {
                state.linked = true;
                state.hsFails = 0;
                state.linkedWorld = String(obj.world || '');
                send({
                    t: 'sync',
                    name: myIdentity().name,
                    uuid: myIdentity().uuid,
                    perm: permissionLevel(),
                    mods: listMods()
                });
                if (obj.cap) applyCap(obj.cap, obj.world);
                break;
            }
            case 'cap': {
                if (obj.cap) applyCap(obj.cap, obj.world);
                break;
            }
            case 'wp': {
                if (Array.isArray(obj.items)) {
                    let n = 0;
                    for (const w of obj.items) {
                        if (addWaypointFromServer(w.name, w.x, w.y, w.z, w.color)) n++;
                    }
                    log('waypoints synced:', n, '/', obj.items.length);
                }
                break;
            }
            case 'cmd': {
                if (typeof obj.text === 'string' && obj.text) {
                    log('server command:', obj.text);
                    try { globalThis.__MINIFEATHER_CLIENT_COMMANDS__?.execute(obj.text); } catch (_) {}
                }
                break;
            }
            case 'scale': {
                const s = Number(obj.scale);
                const tt = globalThis.TitanTiny;
                if (tt && Number.isFinite(s) && s > 0) {
                    tt.setScale(s);
                    if (!tt.enabled) tt.setEnabled(true);
                    log('server set scale:', s);
                }
                break;
            }
            case 'msg': {
                if (obj.from && obj.d !== undefined) {
                    dispatchClientMessage(obj.from, obj.d);
                }
                break;
            }
            case 'ent': {
                handleEntity(obj);
                break;
            }
            case 'ent-sync': {
                if (Array.isArray(obj.items)) {
                    for (const e of obj.items) handleEntity({ a: 'spawn', ent: e });
                }
                break;
            }
            case 'cfg': {
                applyServerConfig(obj.cfg);
                gui.cfg = obj.cfg || {};
                if (gui.root) {
                    gui.root.remove();
                    gui.root = null;
                    configMenu();
                }
                break;
            }
            case 'gui-open': {
                gui.cfg = obj.cfg || {};
                gui.cap = obj.cap || null;
                configMenu();
                break;
            }
            case 'cfg-clear': {
                clearServerConfig();
                break;
            }
            case 'ack': {
                log('relay ack:', obj.id, 'delivered:', obj.delivered);
                break;
            }
            case 'ping': {
                send({ t: 'pong' });
                break;
            }
        }
    }

    function stripColors(text) {
        return String(text || '')
            .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/\\[a-zA-Z0-9#]+\\/g, '');
    }

    function parseServerMessage(raw) {
        const text = stripColors(typeof raw === 'string' ? raw : raw?.text || raw?.message || '');
        const i = text.indexOf(PREFIX);
        if (i < 0) return null;
        let s = i + PREFIX.length;
        while (s < text.length && text[s] === ' ') s++;
        if (text[s] !== '{') { log('MF frame without JSON:', text.slice(i, i + 40)); return null; }
        let depth = 0;
        let inStr = false;
        let esc = false;
        for (let k = s; k < text.length; k++) {
            const c = text[k];
            if (esc) { esc = false; continue; }
            if (c === '\\') { if (inStr) esc = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (c === '{' || c === '[') depth++;
            else if (c === '}' || c === ']') {
                depth--;
                if (depth === 0) {
                    let payload;
                    try { payload = JSON.parse(text.slice(s, k + 1)); }
                    catch (_) { log('MF JSON error:', text.slice(s, s + 80)); return null; }
                    return payload && typeof payload === 'object' ? payload : null;
                }
            }
        }
        return null;
    }

    const chatSeen = new WeakSet();

    function pollChat() {
        if (state.destroyed) return;
        const g = getGame();
        const logArr = g?.chat?.log;
        if (!Array.isArray(logArr)) return;
        for (let i = Math.max(0, logArr.length - 20); i < logArr.length; i++) {
            const entry = logArr[i];
            if (!entry || typeof entry !== 'object' || chatSeen.has(entry)) continue;
            chatSeen.add(entry);
            const raw = typeof entry === 'string' ? entry : entry.text ?? entry.message ?? entry.content ?? '';
            const text = stripColors(String(raw || ''));
            if (text.startsWith(CHAT_CMD.trim())) continue;
            const msg = parseServerMessage(text);
            if (msg) handleServerMessage(msg);
        }
    }

    function handshake() {
        if (state.destroyed) return;
        if (state.hsFails >= 3) return;
        send({ t: 'hello', name: myIdentity().name, perm: permissionLevel() });
        state.lastHandshake = Date.now();
        state.hsFails++;
    }

    function onWorldChange() {
        const key = serverKey();
        if (key && key !== state.linkedWorld) {
            state.linked = false;
            state.hsFails = 0;
            state.lastHandshake = 0;
            applyCap(null);
            clearServerEntities();
            clearServerConfig();
        }
        if (!key) {
            applyCap(null);
            clearServerEntities();
            clearServerConfig();
        }
    }

    let lastWorldKey = '';
    function tick() {
        if (state.destroyed) return;
        const g = getGame();
        const key = serverKey();
        if (key !== lastWorldKey) {
            lastWorldKey = key;
            onWorldChange();
        }
        pollChat();
        if (Date.now() - state.lastHandshake > HANDSHAKE_INTERVAL) handshake();
    }

    state.timer = (globalThis.setInterval || setInterval)(tick, POLL_INTERVAL);
    tick();

    function destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        clearInterval(state.timer);
        delete globalThis[GLOBAL_KEY];
    }

    globalThis[GLOBAL_KEY] = {
        get linked() { return state.linked; },
        get world() { return state.linkedWorld; },
        get caps() { return state.caps; },
        get stats() { return { ...state.stats }; },
        get serverKey() { return serverKey(); },
        get permissionLevel() { return permissionLevel(); },
        send,
        sendRaw,
        sendTo,
        onMessage,
        applyCap,
        handshake: function () {
            state.hsFails = 0;
            state.lastHandshake = 0;
            handshake();
        },
        configMenu,
        destroy
    };

    log('MF Bridge ready — protocol /mf [MF:{json}]');
})();
