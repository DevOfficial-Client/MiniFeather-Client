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

// ---------- helpers ----------
function myName() {
    try {
        const g = globalThis.miniblox || window.miniblox;
        return g?.player?.profile?.username || g?.player?.username || 'yo';
    } catch { return 'yo'; }
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
    state.sendTimer = setInterval(() => {
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
    // guest → host: reportar mi pos (5 Hz basta, solo para elegir objetivo)
    state.posTimer = setInterval(() => {
        if (state.role !== 'guest') return;
        const p = getPos();
        if (p) send({ t: 'pos', p: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) } });
    }, 200);
}

function stopBroadcast() {
    if (state.sendTimer) { clearInterval(state.sendTimer); state.sendTimer = null; }
    if (state.posTimer) { clearInterval(state.posTimer); state.posTimer = null; }
}

function getPos() {
    try {
        const g = globalThis.miniblox || window.miniblox;
        return g?.player?.pos || null;
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
(function puppetLoop() {
    if (state.role === 'guest') { try { puppetTick(); } catch {} }
    requestAnimationFrame(puppetLoop);
})();

// ---------- mensajes ----------
function handleMsg(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
        case 'hello':
            log('handshake con', msg.name, '(rol remoto: ' + msg.role + ')');
            if (state.role === 'host' && !state.sendTimer) startBroadcast();
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
