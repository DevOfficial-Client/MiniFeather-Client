// ============================================================
// MiniFeather P2P — Verity compartida entre dos jugadores
// via PeerJS (WebRTC). Host = autoridad (corre la IA local de
// Verity), invitado = puppet interpolado por red a 20 Hz.
// ============================================================
(function () {
'use strict';

const TAG = '[MiniFeather P2P]';
const PEERJS_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';

// ---------- state ----------
const state = {
    peer: null,          // instancia PeerJS
    conn: null,          // DataConnection activo
    role: null,          // 'host' | 'guest'
    peerId: null,        // mi id publico (host)
    peerName: null,      // username del otro jugador (del handshake)
    status: 'off',       // off | connecting | host | guest | error
    sendTimer: null,     // interval de broadcast del host
    lastFrameIn: 0,      // ultimo paquete recibido (guest)
    puppetTarget: null   // { x,y,z,yaw } objetivo de interpolacion
};

function log(...a) { console.log(TAG, ...a); }
function warn(...a) { console.warn(TAG, ...a); }

// ---------- PeerJS loader ----------
let peerjsPromise = null;
function loadPeerJS() {
    if (globalThis.Peer) return Promise.resolve(true);
    if (peerjsPromise) return peerjsPromise;
    peerjsPromise = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = PEERJS_CDN;
        s.onload = () => resolve(!!globalThis.Peer);
        s.onerror = () => { peerjsPromise = null; resolve(false); };
        document.head.appendChild(s);
    });
    return peerjsPromise;
}

// ---------- acceso al juego (patron PatPat: global → React fiber) ----------
const scan = { game: null, entityMap: null, lastGameScan: 0 };

function getGame(force = false) {
    const now = performance.now();
    if (globalThis.miniblox?.player) {
        if (scan.game !== globalThis.miniblox) { scan.game = globalThis.miniblox; scan.entityMap = null; }
        return scan.game;
    }
    if (!force && scan.game?.player && now - scan.lastGameScan < 900) return scan.game;
    scan.lastGameScan = now;
    try {
        const react = document.querySelector('#react');
        if (react) {
            for (const root of Object.values(react)) {
                const game = root?.updateQueue?.baseState?.element?.props?.game;
                if (!game?.player) continue;
                if (scan.game !== game) { scan.game = game; scan.entityMap = null; }
                return game;
            }
        }
    } catch {}
    return scan.game?.player ? scan.game : null;
}

function isMapLike(v) {
    return !!(v && typeof v.get === 'function' && typeof v.values === 'function');
}

function validPos(p) {
    return !!(p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) && Number.isFinite(Number(p.z)));
}

function looksLikeEntityMap(v) {
    if (!isMapLike(v)) return false;
    let checked = 0, found = 0;
    try {
        for (const e of v.values()) {
            checked++;
            if (e && validPos(e.pos) && (e.mesh || e.id !== undefined)) found++;
            if (checked >= 12) break;
        }
    } catch { return false; }
    return checked > 0 && found > 0;
}

function resolveEntityMap(game) {
    if (scan.entityMap && isMapLike(scan.entityMap)) return scan.entityMap;
    const direct = [
        game?.world?.entitiesDump,
        game?.world?.entities,
        game?.world?.entityMap,
        game?.entityManager?.entities
    ];
    for (const c of direct) {
        if (looksLikeEntityMap(c)) { scan.entityMap = c; return c; }
    }
    const world = game?.world;
    if (!world) return null;
    const queue = [{ value: world, depth: 0 }];
    const seen = new WeakSet();
    let visited = 0;
    while (queue.length && visited < 360) {
        const cur = queue.shift();
        const v = cur.value;
        if (!v || typeof v !== 'object' || seen.has(v)) continue;
        seen.add(v);
        visited++;
        if (looksLikeEntityMap(v)) { scan.entityMap = v; return v; }
        if (cur.depth >= 2) continue;
        let keys = [];
        try { keys = Object.keys(v); } catch { continue; }
        for (const k of keys) {
            let child;
            try { child = v[k]; } catch { continue; }
            if (child && typeof child === 'object') queue.push({ value: child, depth: cur.depth + 1 });
        }
    }
    return null;
}

// ---------- helpers ----------
function myName() {
    try {
        const game = getGame();
        const p = game?.player;
        if (p?.profile?.username) return p.profile.username;
        if (p?.username) return p.username;
        // fallback: mi propia entidad esta en el entityMap — buscar por id
        const ents = p ? resolveEntityMap(game) : null;
        if (ents?.get && p?.id !== undefined) {
            const me = ents.get(p.id) || ents.get(String(p.id));
            if (me?.profile?.username) return me.profile.username;
        }
    } catch { }
    return 'yo';
}

// ---------- protocolo ----------
// { t:'hello', name, role }               handshake
// { t:'sync', p:{x,y,z,yaw,anim,moving} } host → guest (20 Hz)
// { t:'pos',  p:{x,y,z} }                 guest → host (reporta su pos, 5 Hz)
// { t:'despawn' }                         verity se fue
// { t:'chat', text }                      lo que verity dijo en el host

function send(obj) {
    try { state.conn?.send?.(obj); } catch {}
}

// posicion del invitado tal como la conoce el host (para multi-target)
state.guestPos = null;

// ---------- HOST: broadcast del transform ----------
function startBroadcast() {
    stopBroadcast();
    // sync de verity: SOLO host (el guest no tiene autoridad sobre verity)
    state.sendTimer = setInterval(() => {
        if (state.role !== 'host') return;
        const rec = window.MF_CustomModels?.getRecord?.('verity');
        if (!rec?.root) return; // sin verity local: no emitir
        send({
            t: 'sync',
            p: {
                x: +rec.root.position.x.toFixed(2),
                y: +rec.root.position.y.toFixed(2),
                z: +rec.root.position.z.toFixed(2),
                yaw: +(rec.yaw ?? rec.root.rotation.y ?? 0).toFixed(2),
                anim: rec.curAnim || rec.anim || null
            }
        });
        // multi-target: publicar la pos del invitado a CustomModels para que
        // verity (host, autoridad) persiga al MAS CERCANO de los dos jugadores
        if (state.guestPos) {
            try { window.MF_CustomModels?.setPeerTarget?.('verity_peer', state.guestPos); } catch {}
        }
    }, 50); // 20 Hz
    // escala TitanTiny → al otro cliente (ambos roles, solo cuando cambia)
    state.scaleTimer = setInterval(() => {
        try {
            const tt = globalThis.TitanTiny;
            const sc = tt?.enabled ? +(Number(tt.scale) || 1).toFixed(2) : 1;
            if (sc !== state._lastSentScale) {
                state._lastSentScale = sc;
                send({ t: 'scale', scale: sc, name: myName() });
            }
        } catch {}
    }, 250);
    // guest → host: reportar mi pos (5 Hz basta, solo para elegir objetivo)
    state.posTimer = setInterval(() => {
        if (state.role !== 'guest') return;
        const p = getPos();
        if (p) send({ t: 'pos', p: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) } });
    }, 200);
}

function stopBroadcast() {
    if (state.sendTimer) { clearInterval(state.sendTimer); state.sendTimer = null; }
    if (state.scaleTimer) { clearInterval(state.scaleTimer); state.scaleTimer = null; }
    if (state.posTimer) { clearInterval(state.posTimer); state.posTimer = null; }
}

function getPos() {
    try {
        return getGame()?.player?.pos || null;
    } catch { return null; }
}

// ---------- GUEST: puppet ----------
function spawnPuppet(p) {
    const CM = window.MF_CustomModels;
    if (!CM) return;
    try { CM.despawn('verity'); } catch {}
    CM.spawn('verity_full_model.glb', p.x, p.y, p.z, {
        id: 'verity',
        height: 0.85,
        followPlayer: false, // sin IA local: el host manda
        puppet: true,
        anim: p.anim || 'idle'
    });
    state.puppetTarget = { x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0 };
    log('puppet de verity spawneada en (' + p.x + ', ' + p.y + ', ' + p.z + ')');
}

function killPuppet() {
    try { window.MF_CustomModels?.despawn?.('verity'); } catch {}
    state.puppetTarget = null;
}

function onSyncGuest(msg) {
    const p = msg.p;
    if (!p) return;
    state.lastFrameIn = performance.now();
    if (!window.MF_CustomModels?.getRecord?.('verity')) {
        spawnPuppet(p); // primer frame: nace el puppet donde esta el host
        return;
    }
    state.puppetTarget = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
    if (p.anim) {
        try { window.MF_CustomModels?.setAnim('verity', p.anim); } catch {}
    }
}

// interpolacion suave hacia el ultimo target (corre cada frame)
function puppetTick() {
    const rec = window.MF_CustomModels?.getRecord?.('verity');
    if (!rec?.root || !state.puppetTarget || rec.puppet !== true) return;
    const L = 0.25;
    rec.root.position.x += (state.puppetTarget.x - rec.root.position.x) * L;
    rec.root.position.y += (state.puppetTarget.y - rec.root.position.y) * L;
    rec.root.position.z += (state.puppetTarget.z - rec.root.position.z) * L;
    let dyaw = state.puppetTarget.yaw - (rec.yaw || 0);
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    rec.yaw = (rec.yaw || 0) + dyaw * L;
    rec.root.rotation.y = rec.yaw;
}

// ---- TitanTiny P2P: escalar la entidad del peer en mi mundo ----
// El juego resetea mesh.scale periodicamente (anims, respawn), asi que se
// re-aplica cada frame. La escala base se captura UNA vez por mesh.

// hooks onBeforeRender sobre el mesh del peer (patron TitanTiny): el juego
// pisa mesh.scale en su propio update; re-aplicar justo antes de dibujar
function installPeerRenderHooks(root) {
    try {
        const queue = [root];
        const seen = new WeakSet();
        while (queue.length) {
            const obj = queue.shift();
            if (!obj || typeof obj !== 'object' || seen.has(obj)) continue;
            seen.add(obj);
            if ((obj.isMesh === true || obj.isLine === true || obj.isPoints === true || obj.geometry) &&
                typeof obj.onBeforeRender !== 'undefined') {
                const prev = obj.onBeforeRender;
                obj.onBeforeRender = function (...args) {
                    if (typeof prev === 'function') { try { prev.apply(this, args); } catch {} }
                    applyPeerScale(state._peerMesh);
                };
            }
            if (Array.isArray(obj.children)) {
                for (const c of obj.children) queue.push(c);
            }
        }
    } catch {}
}

function applyPeerScale(mesh) {
    const b = state._peerBase;
    const f = Number(state.peerScale) || 1;
    if (!mesh?.scale || !b || !Number.isFinite(f)) return;
    try {
        mesh.scale.set(b.x * f, b.y * f, b.z * f);
        if (mesh.matrixAutoUpdate === false && typeof mesh.updateMatrix === 'function') mesh.updateMatrix();
    } catch {}
}

function peerScaleTick() {
    if (!state.peerName || !state.conn) return;
    const factor = Number(state.peerScale) || 1;
    if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.01) {
        // escala 1: restaurar si habia quedado escalado
        if (state._peerMesh && state._peerBase) {
            try {
                state._peerMesh.scale.set(state._peerBase.x, state._peerBase.y, state._peerBase.z);
            } catch {}
        }
        return;
    }
    // buscar la entidad del peer por username (cacheada, re-scan 1s)
    let mesh = state._peerMesh;
    const now = performance.now();
    if (mesh && (!mesh.parent || now - (state._peerMeshAt || 0) > 1500)) {
        // mesh vieja (desmontada) o refresco periodico → re-escanear
        state._peerMesh = null;
        mesh = null;
    }
    if (!mesh) {
        state._peerMeshAt = now;
        try {
            const ents = resolveEntityMap(getGame());
            if (ents?.values) {
                for (const e of ents.values()) {
                    if (e?.profile?.username === state.peerName && e?.mesh?.scale) {
                        mesh = e.mesh;
                        state._peerMesh = mesh;
                        break;
                    }
                }
            }
        } catch {}
        if (mesh) {
            // capturar base la primera vez que vemos este mesh + hookear el
            // render (el juego pisa mesh.scale en su update, hay que
            // re-aplicar justo antes de dibujar, como hace TitanTiny local)
            if (state._peerMeshBaseOf !== mesh) {
                state._peerMeshBaseOf = mesh;
                state._peerBase = { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z };
                installPeerRenderHooks(mesh);
                log('mesh del peer encontrado (' + state.peerName + ') base x' + state._peerBase.x.toFixed(2));
            }
        } else {
            state._peerMesh = null;
        }
    }
    if (!mesh?.scale) return;
    const b = state._peerBase;
    if (!b) return;
    try {
        mesh.scale.set(b.x * factor, b.y * factor, b.z * factor);
        if (mesh.matrixAutoUpdate === false && typeof mesh.updateMatrix === 'function') mesh.updateMatrix();
    } catch {}
}

(function puppetLoop() {
    if (state.role === 'guest' || state.role === 'host') {
        try { puppetTick(); } catch {}
        try { peerScaleTick(); } catch {}
    }
    requestAnimationFrame(puppetLoop);
})();

// ---------- mensajes ----------
function handleMsg(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
        case 'hello':
            state.peerName = msg.name || null;
            log('handshake con', msg.name, '(rol remoto: ' + msg.role + ')');
            // ambos roles emiten: host hace broadcast completo (sync verity),
            // guest solo escala/nombre. startBroadcast autolimita por rol.
            if (!state.sendTimer) startBroadcast();
            break;
        case 'sync':
            if (state.role === 'guest') onSyncGuest(msg);
            break;
        case 'pos':
            // guest → host: actualizar pos conocida del invitado
            if (state.role === 'host' && msg.p) {
                state.guestPos = { x: msg.p.x, y: msg.p.y, z: msg.p.z };
            }
            break;
        case 'despawn':
            if (state.role === 'guest') { killPuppet(); log('verity remota despawneada'); }
            break;
        case 'chat':
            if (state.role === 'guest') showRemoteChat(msg.text);
            break;
        case 'pat':
            // pat compartido: reproducirlo localmente (mano + squish + agachada
            // de camara si el que lo recibio soy yo)
            try { globalThis.MiniFeatherPatPat?.remotePat?.(msg); } catch {}
            break;
        case 'scale':
            // TitanTiny compartido: escalar la entidad del OTRO jugador en MI
            // mundo. El juego puede resetear mesh.scale (respawn, anim), asi
            // que se re-aplica por frame con la escala guardada.
            if (msg.name && msg.name !== 'yo') state.peerName = msg.name;
            state.peerScale = Number(msg.scale) || 1;
            log('escala remota recibida: ' + msg.name + ' → x' + state.peerScale);
            break;
    }
}

// mostrar en el chat del juego lo que verity dijo en el host
function showRemoteChat(text) {
    if (!text) return;
    try {
        if (typeof window.MF_Peer._chatHook === 'function') { window.MF_Peer._chatHook(text); return; }
    } catch {}
    try { document.dispatchEvent(new CustomEvent('minifeather:verity-p2p-chat', { detail: { text } })); } catch {}
}

// ---------- conexión ----------
function wireConn(conn) {
    state.conn = conn;
    conn.on('open', () => {
        state.status = state.role;
        log('conectado (' + state.role + ') — verity compartida');
        send({ t: 'hello', name: myName(), role: state.role });
        if (state.role === 'host') startBroadcast();
        else state.lastFrameIn = performance.now();
    });
    conn.on('data', handleMsg);
    conn.on('close', () => {
        log('conexion cerrada');
        if (state.role === 'guest') killPuppet();
        stopBroadcast();
        state.conn = null;
        state.status = 'off';
    });
    conn.on('error', (e) => warn('error de conexion:', e?.message || e));
}

async function host(code) {
    if (state.conn || state.peer) { warn('ya hay sesion activa — /p2p off primero'); return null; }
    if (!(await loadPeerJS())) { warn('no se pudo cargar PeerJS (CSP?)'); return null; }
    state.role = 'host';
    state.status = 'connecting';
    const id = 'mf-' + String(code || Math.random().toString(36).slice(2, 8));
    state.peerId = id;
    const peer = new globalThis.Peer(id, { debug: 0 });
    state.peer = peer;
    peer.on('open', (pid) => {
        log('sala lista. Tu amigo entra con:  /p2p join ' + pid);
        console.log('%c/p2p join ' + pid, 'font-size:16px;color:#7ec8ff');
    });
    peer.on('connection', (c) => {
        if (state.conn) { try { c.close(); } catch {} return; } // 1 invitado
        wireConn(c);
    });
    peer.on('error', (e) => {
        warn('peer error:', e?.message || e.type || e);
        state.status = 'error';
    });
    return id;
}

async function join(code) {
    if (state.conn || state.peer) { warn('ya hay sesion activa — /p2p off primero'); return false; }
    if (!code) { warn('usa: /p2p join <codigo>'); return false; }
    if (!(await loadPeerJS())) { warn('no se pudo cargar PeerJS (CSP?)'); return false; }
    state.role = 'guest';
    state.status = 'connecting';
    const peer = new globalThis.Peer({ debug: 0 });
    state.peer = peer;
    peer.on('open', () => {
        log('conectando a la sala ' + code + '...');
        wireConn(peer.connect(code, { reliable: true }));
    });
    peer.on('error', (e) => {
        warn('peer error:', e?.message || e.type || e);
        state.status = 'error';
    });
    return true;
}

function off() {
    stopBroadcast();
    if (state.role === 'guest') killPuppet();
    try { state.conn?.close?.(); } catch {}
    try { state.peer?.destroy?.(); } catch {}
    state.peer = null; state.conn = null; state.role = null; state.peerId = null;
    state.status = 'off';
    log('P2P apagado');
}

// ---------- API ----------
window.MF_Peer = {
    get status() { return state.status; },
    get role() { return state.role; },
    get code() { return state.peerId; },
    _chatHook: null,
    host, join, off,
    // pat compartido (PatPat): envia la info del pat al otro cliente
    sendPat(info) {
        if (!state.conn) return false;
        send({ t: 'pat', target: info?.target || null, from: info?.from || null });
        return true;
    }
};

// retransmitir lo que verity dice (host) via patch de say()
try {
    const V = window.MF_Verity;
    if (V?.say && !V.__p2pPatched) {
        V.__p2pPatched = true;
        const origSay = V.say.bind(V);
        V.say = async function (text) {
            const r = await origSay(text);
            if (state.role === 'host') send({ t: 'chat', text });
            return r;
        };
    }
    // capturar el chatHook del juego para reusarlo como guest
    if (V?.setChatHook && !V.__p2pHookPatched) {
        V.__p2pHookPatched = true;
        const origSet = V.setChatHook.bind(V);
        V.setChatHook = function (fn) {
            window.MF_Peer._chatHook = typeof fn === 'function' ? fn : null;
            return origSet(fn);
        };
    }
} catch {}

// retransmitir despawn de verity (host) via patch de despawn()
try {
    const CM = window.MF_CustomModels;
    if (CM?.despawn && !CM.__p2pPatched) {
        CM.__p2pPatched = true;
        const origDespawn = CM.despawn.bind(CM);
        CM.despawn = function (id, force) {
            const r = origDespawn(id, force);
            if (id === 'verity' && state.role === 'host') send({ t: 'despawn' });
            return r;
        };
    }
} catch {}

log('cargado. /p2p host [codigo] | /p2p join <codigo> | /p2p off | /p2p status');
})();
