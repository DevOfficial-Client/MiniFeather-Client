
(function () {
'use strict';
const PREV = globalThis.MF_Mesh;
if (PREV) { try { PREV.dispose?.(); } catch {} }   

const TAG = '[MiniFeather Mesh]';
const PEERJS_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const CODE_RE = /mfm2p[:\s]+([A-Za-z0-9-]{4,24})/i;
const ANNOUNCE = 'mfm2p:';
const CAP = 12;                    
const RECONNECT_MS = 20000;        
const MIN_SCALE = 0.01;
const SCALE_HEARTBEAT_MS = 10000;
const SCALE_EXPIRE_MS = 35000;

const state = {
    peer: null, myCode: null,
    conns: new Map(),              
    names: new Map(),              
    seenCodes: new Map(),          
    status: 'off',                 
    chatSeen: new WeakSet(),
    announceTimer: null,
    skinTold: new Map(),           
    // Titan & Tiny: escala propia + escalas conocidas de peers
    myScale: { s: 1, w: 1 },
    myScaleName: null,
    peerScales: new Map(),         // peer code -> { name, s, w, seq, at }
    scaleSeq: 1,
    lastScaleHeartbeat: 0,
};

function warn(...a) { console.warn(TAG, ...a); }

let peerjsPromise = null;
function loadPeerJS() {
    if (globalThis.Peer) return Promise.resolve(true);
    if (peerjsPromise) return peerjsPromise;
    peerjsPromise = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = PEERJS_CDN;
        let settled = false;
        const finish = ready => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (!ready) peerjsPromise = null;
            resolve(ready);
        };
        const timeout = setTimeout(() => finish(false), 15000);
        s.onload = () => finish(!!globalThis.Peer);
        s.onerror = () => finish(false);
        
        const parent = document.head || document.documentElement;
        if (!parent) { finish(false); return; }
        parent.appendChild(s);
    });
    return peerjsPromise;
}

const scan = { game: null, lastGameScan: 0 };

function getGame(force = false) {
    const now = performance.now();
    if (globalThis.miniblox?.player) { scan.game = globalThis.miniblox; return scan.game; }
    if (!force && scan.game?.player && now - scan.lastGameScan < 900) return scan.game;
    scan.lastGameScan = now;
    try {
        const react = document.querySelector('#react');
        if (react) for (const root of Object.values(react)) {
            const g = root?.updateQueue?.baseState?.element?.props?.game;
            if (g?.player) { scan.game = g; return g; }
        }
    } catch {}
    return scan.game?.player ? scan.game : null;
}

function myName() {
    try {
        const p = getGame()?.player;
        if (p?.profile?.username) return p.profile.username;
        if (p?.username) return p.username;
    } catch {}
    return 'nodo';
}

function isMapLike(v) { return !!(v && typeof v.get === 'function' && typeof v.values === 'function'); }

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
    const direct = [game?.world?.entitiesDump, game?.world?.entities, game?.world?.entityMap];
    for (const c of direct) if (looksLikeEntityMap(c)) return c;
    return null;
}

const packSkinReg = (globalThis.__MF_PACK_SKINS__ ||= {});
const skinById = new Map();       

function registerSharedSkin(id, dataURL, name) {
    if (!id || typeof dataURL !== 'string' || !dataURL.startsWith('data:image/')) return false;
    packSkinReg[id] = dataURL;
    skinById.set(id, { dataURL, name: name || null, at: Date.now() });
    return true;
}

let startingPromise = null;
async function start() {
    if (state.peer) return state.myCode;
    if (startingPromise) return startingPromise;
    startingPromise = startFresh();
    try { return await startingPromise; }
    finally { startingPromise = null; }
}

async function startFresh() {
    if (!(await loadPeerJS())) { state.status = 'error'; warn('no se pudo cargar PeerJS'); return null; }
    state.status = 'starting';
    const code = 'mfm-' + Math.random().toString(36).slice(2, 8);
    state.myCode = code;
    const peer = new globalThis.Peer(code, { debug: 0 });
    esc: null,
    state.peer = peer;
    peer.on('open', (pid) => {
        state.status = 'listening';
        // Sin anuncio automático al chat: para publicar el código usar
        // el comando manual "/mesh announce" (announceNow()).
        if (state.announceTimer) { clearInterval(state.announceTimer); state.announceTimer = null; }
    });
    peer.on('connection', (c) => accept(c));
    peer.on('disconnected', () => {
        state.status = 'reconnecting';
        try { peer.reconnect(); } catch {}
    });
    peer.on('error', (e) => {
        const type = e?.type || '';
        if (type === 'peer-unavailable') return;   
        warn('peer error:', e?.message || type || e);
    });
    return code;
}

function accept(conn) {
    if (state.conns.size >= CAP) { try { conn.close(); } catch {} return; }
    wire(conn);
}

function waitForPeerReady() {
    if (state.status === 'listening') return Promise.resolve(true);
    const peer = state.peer;
    if (!peer || state.status === 'error') return Promise.resolve(false);
    return new Promise(resolve => {
        let settled = false;
        const finish = ready => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            try { peer.off?.('open', onOpen); } catch {}
            resolve(ready);
        };
        const onOpen = () => finish(true);
        const timeout = setTimeout(() => finish(false), 12000);
        peer.on('open', onOpen);
    });
}

async function connect(code) {
    if (!state.peer && !(await start())) return false;
    if (!code || code === state.myCode) return false;
    if (state.conns.has(code)) return true;
    if (!(await waitForPeerReady())) return false;
    const now = Date.now();
    if (now - (state.seenCodes.get(code) || 0) < RECONNECT_MS) return false;
    state.seenCodes.set(code, now);
    try {
        wire(state.peer.connect(code, { reliable: true }));
        return true;
    } catch {
        state.seenCodes.delete(code);
        return false;
    }
}

function wire(conn) {
    const id = conn.peer;
    const previous = state.conns.get(id);
    if (previous && previous !== conn) {
        // Both peers can dial simultaneously. Pick the same DataConnection on
        // each side instead of closing each other's surviving connection.
        const previousId = String(previous.connectionId || '');
        const nextId = String(conn.connectionId || '');
        if (previous.open || !nextId || (previousId && previousId < nextId)) {
            try { conn.close(); } catch {}
            return;
        }
        try { previous.close(); } catch {}
    }
    state.conns.set(id, conn);
    const to = setTimeout(() => {
        if (!conn.open) {
            warn('timeout ' + id);
            try { conn.close(); } catch {}
            dropConn(conn);
        }
    }, 12000);
    conn.on('open', () => {
        clearTimeout(to);
        state.conns.set(id, conn);
        const my = myTitanScale();
        sendTo(conn, {
            t: 'hello', name: myName(), code: state.myCode,
            peers: knownCodes(),
            skins: mySkinIds(),
            scale: my.s,
            width: my.w,
            seq: state.scaleSeq,
        });
        sendScaleSnapshot(conn);
        setTimeout(() => resendMySkin(conn), 700);
        setTimeout(() => sendMyScale(conn), 900);
    });
    conn.on('data', (m) => handleMsg(conn, m));
    conn.on('close', () => dropConn(conn));
    conn.on('error', () => dropConn(conn));
}

function dropConn(conn) {
    if (state.conns.get(conn.peer) !== conn) return;
    state.conns.delete(conn.peer);
    state.seenCodes.delete(conn.peer);
    const name = state.names.get(conn.peer) || conn.peer;
    state.names.delete(conn.peer);
    state.skinTold.delete(conn.peer);
    revertMeshSkin(name);
    forgetPeerScale(conn.peer);
}

function knownCodes() {
    const out = [state.myCode];
    for (const id of state.conns.keys()) out.push(id);
    return out.filter(Boolean);
}

function sendTo(conn, obj) { try { conn?.send?.(obj); } catch {} }

function broadcast(obj) { for (const c of state.conns.values()) sendTo(c, obj); }

function handleMsg(conn, m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
        case 'hello': {
            state.names.set(conn.peer, m.name || 'nodo');
            receivePeerScale(conn, { ...m, origin: conn.peer }, true);
            sendScaleSnapshot(conn);
            
            if (Array.isArray(m.peers)) {
                for (const code of m.peers) {
                    if (typeof code === 'string' && code !== state.myCode && !state.conns.has(code)) {
                        setTimeout(() => connect(code), 500 + Math.random() * 3000);   
                    }
                }
            }
            
            if (Array.isArray(m.skins)) {
                const missing = m.skins.filter(id => !skinById.has(id));
                if (missing.length) sendTo(conn, { t: 'need-skins', ids: missing });
            }
            setTimeout(() => resendMySkin(conn), 900);
            break;
        }
        case 'need-skins': {
            if (!Array.isArray(m.ids)) break;
            for (const id of m.ids) {
                const s = skinById.get(id);
                
                if (s) sendTo(conn, { t: 'skin', id, dataURL: s.dataURL, name: s.name || myName() });
            }
            break;
        }
        case 'skin': {
            if (typeof m.id === 'string' && typeof m.dataURL === 'string') {
                const isNew = !skinById.has(m.id);
                registerSharedSkin(m.id, m.dataURL, m.name);
                if (isNew) {
                    applySkinToPeer(m.name, m.id, m.dataURL);
                    
                    for (const [pid, c] of state.conns) {
                        if (pid === conn.peer) continue;
                        sendTo(c, { t: 'skin', id: m.id, dataURL: m.dataURL, name: m.name });
                    }
                }
            }
            break;
        }
        case 'announce': {
            if (typeof m.code === 'string' && m.code !== state.myCode && !state.conns.has(m.code)) {
                connect(m.code);
            }
            break;
        }
        case 'tt': {
            receivePeerScale(conn, m, true);
            break;
        }
    }
}

function mySkinIds() {
    const out = [];
    try {
        const url = localStorage.getItem('mf:csa:skin');
        const id = localStorage.getItem('mf:csa:id');
        if (url && id) out.push(id);
    } catch {}
    return out;
}

function resendMySkin(conn) {
    try {
        const url = localStorage.getItem('mf:csa:skin');
        const id = localStorage.getItem('mf:csa:id');
        if (url && id) sendTo(conn, { t: 'skin', id, dataURL: url, name: myName() });
    } catch {}
}

const meshOriginals = new WeakMap();   

function entityByUsername(name) {
    if (!name) return null;
    try {
        const e = window.MF_Morph?.findEntityByName?.(name);
        if (e?.mesh) return e;
    } catch {}
    try {
        const ents = resolveEntityMap(getGame());
        if (ents?.values) for (const e of ents.values()) {
            if (e?.profile?.username === name && e?.mesh) return e;
        }
    } catch {}
    return null;
}

function skinMaterials(entity) {
    const out = [];
    if (!entity?.mesh) return out;
    const seen = new Set();
    entity.mesh.traverse(o => {
        if (!o?.material) return;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) {
            if (m?.map && !seen.has(m)) { seen.add(m); out.push(m); }
        }
    });
    const skins = out.filter(m => {
        const w = m.map?.image?.width, h = m.map?.image?.height;
        if (!w || !h) return false;
        const k64 = w / 64;
        return Number.isInteger(k64) && (h === w || h === w / 2);
    });
    return skins.length ? skins : out;
}

function editableCanvas(entity) {
    const mats = skinMaterials(entity);
    if (!mats.length) return null;
    const isCanvas = t => t?.image instanceof HTMLCanvasElement;
    const usable = mats.filter(m => m.map?.image && !(isCanvas(m.map) && m.map.__mfLocalCanvas));
    if (!usable.length) return null;
    const tex = usable[0].map;
    if (isCanvas(tex) && tex.__mfMeshCanvas) {
        return { canvas: tex.image, tex, mats: usable.filter(m => m.map === tex) };
    }
    const c = document.createElement('canvas');
    c.width = tex.image.width; c.height = tex.image.height;
    try { c.getContext('2d').drawImage(tex.image, 0, 0); } catch { return null; }
    let nt = null;
    try { nt = new tex.constructor(c); } catch {}
    if (!nt) return null;
    nt.__mfMeshCanvas = true;
    try {
        nt.magFilter = tex.magFilter; nt.minFilter = tex.minFilter;
        if (tex.colorSpace !== undefined && 'colorSpace' in nt) nt.colorSpace = tex.colorSpace;
        nt.flipY = tex.flipY; nt.wrapS = tex.wrapS; nt.wrapT = tex.wrapT;
    } catch {}
    for (const m of usable) { m.map = nt; m.needsUpdate = true; }
    return { canvas: c, tex: nt, mats: usable };
}

function applySkinToPeer(name, id, dataURL) {
    if (!name) return;
    
    pendingSkins.set(name, { id, dataURL });
    drainPending();
}

const pendingSkins = new Map();   

function drainPending() {
    for (const [name, skin] of pendingSkins) {
        const entity = entityByUsername(name);
        if (!entity) continue;   
        const s = editableCanvas(entity);
        if (!s) continue;
        
        let rec = meshOriginals.get(entity);
        if (!rec) {
            const c = document.createElement('canvas');
            c.width = s.canvas.width; c.height = s.canvas.height;
            try { c.getContext('2d').drawImage(s.canvas, 0, 0); } catch {}
            rec = { skinCanvas: c };
            meshOriginals.set(entity, rec);
        }
        const img = new Image();
        img.onload = () => {
            try {
                const ctx = s.canvas.getContext('2d');
                ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, s.canvas.width, s.canvas.height);
                s.tex.needsUpdate = true;
                pendingSkins.delete(name);
            } catch (e) { warn('drawImage falló:', e?.message || e); }
        };
        img.onerror = () => { pendingSkins.delete(name); };
        img.src = skin.dataURL;
        return;   
    }
}
setInterval(drainPending, 1500);   

function revertMeshSkin(name) {
    if (!name) return;
    pendingSkins.delete(name);
    const entity = entityByUsername(name);
    if (!entity) return;
    const rec = meshOriginals.get(entity);
    if (!rec?.skinCanvas) return;
    const s = editableCanvas(entity);
    if (!s) return;
    try {
        const ctx = s.canvas.getContext('2d');
        ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
        ctx.drawImage(rec.skinCanvas, 0, 0);
        s.tex.needsUpdate = true;
    } catch {}
}

// ─── Titan & Tiny multiplayer: aplicar la escala reportada al mesh del peer ───

function myTitanScale() {
    try {
        const tt = globalThis.TitanTiny;
        return tt?.enabled ? {
            s: Math.min(5, Math.max(MIN_SCALE, +(Number(tt.scale) || 1))),
            w: Math.min(3, Math.max(0.3, +(Number(tt.width) || 1)))
        } : { s: 1, w: 1 };
    } catch { return { s: 1, w: 1 }; }
}

function sendMyScale(conn) {
    if (!conn?.open || !state.myCode) return;
    const sc = myTitanScale();
    sendTo(conn, { t: 'tt', origin: state.myCode, seq: state.scaleSeq,
        scale: sc.s, width: sc.w, name: myName() });
}

function sendScaleSnapshot(conn) {
    if (!conn?.open) return;
    sendMyScale(conn);
    for (const [origin, rec] of state.peerScales) {
        if (origin === conn.peer || Date.now() - rec.at > SCALE_EXPIRE_MS) continue;
        sendTo(conn, { t: 'tt', origin, seq: rec.seq,
            scale: rec.s, width: rec.w, name: rec.name });
    }
}

function receivePeerScale(conn, msg, relay) {
    const scale = Number(msg.scale);
    if (!Number.isFinite(scale) || scale <= 0) return;
    const origin = typeof msg.origin === 'string' && /^[A-Za-z0-9-]{4,24}$/.test(msg.origin)
        ? msg.origin : conn.peer;
    if (!origin || origin === state.myCode) return;
    const seq = Number.isSafeInteger(msg.seq) && msg.seq > 0 ? msg.seq : null;
    const old = state.peerScales.get(origin);
    if (seq !== null && old?.seq !== null && old?.seq !== undefined && seq <= old.seq) {
        old.at = Date.now();
        return;
    }
    if (seq === null && old?.seq !== null && old?.seq !== undefined) return;
    // Old clients have no sequence. Apply their direct state but never relay it,
    // since cyclic mesh paths otherwise amplify the same packet forever.
    if (seq === null && old && old.s === scale && old.w === Number(msg.width) && old.name === msg.name) {
        old.at = Date.now();
        return;
    }
    const name = String(msg.name || state.names.get(origin) || '').slice(0, 64);
    if (!name || name === 'nodo') return;
    const width = Number(msg.width);
    const rec = {
        name,
        s: Math.min(5, Math.max(MIN_SCALE, scale)),
        w: Number.isFinite(width) && width > 0 ? Math.min(3, Math.max(0.3, width)) : 1,
        seq,
        at: Date.now()
    };
    state.peerScales.set(origin, rec);
    if (old?.name && old.name !== name) restoreUnusedName(old.name);
    if (relay && seq !== null) {
        for (const [id, peer] of state.conns) {
            if (id === conn.peer || !peer.open) continue;
            sendTo(peer, { t: 'tt', origin, seq,
                scale: rec.s, width: rec.w, name: rec.name });
        }
    }
}

const scaleMeshes = new Map();      // username -> { mesh, base:{x,y,z}, at }
const PEER_SCALE_POLL = 500;

function setMeshScale(mesh, base, factor, widthFactor = 1) {
    try {
        const x = base.x * factor * widthFactor;
        const y = base.y * factor;
        const z = base.z * factor * widthFactor;
        if (mesh.scale.x === x && mesh.scale.y === y && mesh.scale.z === z) return false;
        mesh.scale.set(x, y, z);
        if (mesh.matrixAutoUpdate === false && typeof mesh.updateMatrix === 'function') mesh.updateMatrix();
        return true;
    } catch { return false; }
}

function clearScaleRecord(name) {
    const rec = scaleMeshes.get(name);
    if (!rec) return;
    for (const hook of rec.hooks || []) {
        try {
            if (hook.object.onBeforeRender === hook.wrapped) {
                hook.object.onBeforeRender = hook.previous;
            }
        } catch {}
    }
    if (rec.mesh?.scale && rec.base) setMeshScale(rec.mesh, rec.base, 1);
    scaleMeshes.delete(name);
}

function activeScaleForName(name) {
    let best = null;
    for (const rec of state.peerScales.values()) {
        if (rec.name === name && (!best || rec.at > best.at)) best = rec;
    }
    return best;
}

function restoreUnusedName(name) {
    if (name && !activeScaleForName(name)) clearScaleRecord(name);
}

function forgetPeerScale(origin) {
    const rec = state.peerScales.get(origin);
    if (!rec) return;
    state.peerScales.delete(origin);
    restoreUnusedName(rec.name);
}

function installScaleHooks(name, rec) {
    const queue = [rec.mesh];
    const seen = new Set();
    rec.hooks = [];
    while (queue.length && seen.size < 80) {
        const object = queue.shift();
        if (!object || seen.has(object)) continue;
        seen.add(object);
        if (object.isMesh || object.geometry) {
            const previous = object.onBeforeRender;
            const wrapped = function (...args) {
                if (typeof previous === 'function') {
                    try { previous.apply(this, args); } catch {}
                }
                if (scaleMeshes.get(name) !== rec) return;
                const factor = activeScaleForName(name);
                if (factor && setMeshScale(rec.mesh, rec.base, factor.s, factor.w)) {
                    try { rec.mesh.updateMatrixWorld?.(true); } catch {}
                }
            };
            try {
                object.onBeforeRender = wrapped;
                rec.hooks.push({ object, previous, wrapped });
            } catch {}
        }
        if (Array.isArray(object.children)) queue.push(...object.children);
    }
}

function peerScaleTick() {
    // Versioned heartbeat also repairs missed packets and newly joined peers.
    try {
        const sc = myTitanScale();
        const name = myName();
        const now = Date.now();
        if (sc.s !== state.myScale.s || sc.w !== state.myScale.w || name !== state.myScaleName ||
            now - state.lastScaleHeartbeat >= SCALE_HEARTBEAT_MS) {
            state.myScale = sc;
            state.myScaleName = name;
            state.lastScaleHeartbeat = now;
            state.scaleSeq++;
            const msg = { t: 'tt', origin: state.myCode, seq: state.scaleSeq,
                scale: sc.s, width: sc.w, name };
            if (state.myCode) broadcast(msg);
        }
    } catch {}

    for (const [origin, rec] of state.peerScales) {
        if (Date.now() - rec.at > SCALE_EXPIRE_MS && !state.conns.get(origin)?.open) {
            forgetPeerScale(origin);
        }
    }

    // Apply again after the game replaces the remote player's model.
    if (!state.peerScales.size) {
        for (const name of scaleMeshes.keys()) clearScaleRecord(name);
        return;
    }

    const now = performance.now();
    const names = new Set([...state.peerScales.values()].map(rec => rec.name));
    for (const name of scaleMeshes.keys()) if (!names.has(name)) clearScaleRecord(name);
    for (const name of names) {
        if (!name || name === myName()) continue;
        // The dedicated /p2p channel owns this one model while active.
        if (globalThis.MF_Peer?.scalePeerName === name) {
            clearScaleRecord(name);
            continue;
        }
        const factor = activeScaleForName(name);
        if (!factor) continue;
        if (factor.s === 1 && factor.w === 1) {
            clearScaleRecord(name);
            continue;
        }
        let rec = scaleMeshes.get(name);

        if (rec && (!rec.mesh?.parent || now - rec.at > PEER_SCALE_POLL * 6)) {
            const current = entityByUsername(name)?.mesh;
            if (current !== rec.mesh) clearScaleRecord(name);
            else rec.at = now;
            rec = scaleMeshes.get(name);
        }

        if (rec && !rec.mesh?.parent) {
            clearScaleRecord(name);
            rec = null;
        }

        if (!rec) {
            const entity = entityByUsername(name);
            const mesh = entity?.mesh;
            if (!mesh?.scale) continue;
            rec = {
                mesh,
                base: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
                at: now
            };
            scaleMeshes.set(name, rec);
            installScaleHooks(name, rec);
        }

        rec.at = now;
        setMeshScale(rec.mesh, rec.base, factor.s, factor.w);
    }
}
const scaleTimer = setInterval(peerScaleTick, PEER_SCALE_POLL);

function announce(code) {
    const g = getGame();
    const chat = g?.chat;
    if (!chat || typeof chat.submit !== 'function') return;
    // Solo anunciar si hay sesión de chat activa (dentro de una partida).
    // Fuera de partida el submit del engine lanza "...reading 'inGame'".
    if (!Array.isArray(chat.log) || chat.log.length === 0) return;
    const text = ANNOUNCE + code;
    try {
        try { chat.setInputValue?.(text); } catch { try { chat.inputValue = text; } catch {} }
        // submit(e) del engine llama e.inGame(): sin el game como arg, lanza
        // TypeError DENTRO del try del engine (solo lo loguea, no propaga) y
        // el mensaje nunca se envía. Pasar el game explícito.
        chat.submit(g);
    } catch (e) {
        warn('announce falló:', e?.message || e);
        // El engine puede tardar en exponer inGame justo al entrar a la
        // partida: un reintento corto aprovecha esa ventana.
        if (!announceRetrying) {
            announceRetrying = true;
            setTimeout(() => { announceRetrying = false; announce(code); }, 1500);
        }
    }
    try { chat.closeInput?.(); } catch {}
}
let announceRetrying = false;

function chatWatchTick() {
    if (state.status === 'off' || state.status === 'error') return;
    const g = getGame();
    const logArr = g?.chat?.log;
    if (!Array.isArray(logArr)) return;
    const meUuid = g?.player?.uuid != null ? String(g.player.uuid) : null;
    for (let i = Math.max(0, logArr.length - 15); i < logArr.length; i++) {
        const entry = logArr[i];
        if (!entry || typeof entry !== 'object' || state.chatSeen.has(entry)) continue;
        state.chatSeen.add(entry);
        const text = String(entry.text ?? entry.message ?? entry.content ?? '');
        const m = text.match(CODE_RE);
        if (!m) continue;
        const code = m[1];
        if (code === state.myCode) continue;
        const from = entry.from != null ? String(entry.from) : null;
        if (meUuid && from === meUuid) continue;
        connect(code);   
    }
}

const chatTimer = setInterval(chatWatchTick, 1500);

async function boot() {
    const saved = (() => { try { return localStorage.getItem('mf:mesh:auto'); } catch { return null; } })();
    if (saved === '0') return;
    await start();
}
boot();

globalThis.MF_Mesh = {
    get status() { return state.status; },
    get code() { return state.myCode; },
    get peers() { return [...state.conns.keys()]; },
    get names() { return Object.fromEntries(state.names); },
    get connected() { return state.conns.size; },
    start, connect,
    
    shareSkinUp(id, dataURL) {
        if (!id || typeof dataURL !== 'string') return;
        registerSharedSkin(id, dataURL, myName());
        for (const c of state.conns.values()) {
            sendTo(c, { t: 'skin', id, dataURL, name: myName() });
        }
    },
    
    announceNow() { if (state.myCode) announce(state.myCode); },
    
    shareSkin() { for (const c of state.conns.values()) resendMySkin(c); },
    releaseScaleFor(name) { if (name) clearScaleRecord(String(name)); },
    skinStatus() {
        return {
            mine: mySkinIds(),
            shared: [...skinById.entries()].map(([id, s]) => ({ id, from: s.name })),
        };
    },
    dispose() {
        clearInterval(chatTimer);
        clearInterval(scaleTimer);
        if (state.announceTimer) clearInterval(state.announceTimer);
        for (const name of [...scaleMeshes.keys()]) clearScaleRecord(name);
        for (const c of state.conns.values()) { try { c.close(); } catch {} }
        state.conns.clear();
        state.names.clear();
        state.peerScales.clear();
        state.seenCodes.clear();
        try { state.peer?.destroy?.(); } catch {}
        state.peer = null; state.myCode = null; state.status = 'off';
    },
};
})();
