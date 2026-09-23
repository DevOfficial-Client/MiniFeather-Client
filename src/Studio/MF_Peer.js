
(function () {
'use strict';

const TAG = '[MiniFeather P2P]';
const PEERJS_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';

const state = {
    peer: null,          
    conn: null,          
    role: null,          
    peerId: null,        
    peerName: null,      
    status: 'off',       
    sendTimer: null,     
    lastFrameIn: 0,      
    puppetTarget: null   
};

function log(...a) { void 0; }
function warn(...a) { console.warn(TAG, ...a); }

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

function myName() {
    try {
        const game = getGame();
        const p = game?.player;
        if (p?.profile?.username) return p.profile.username;
        if (p?.username) return p.username;
        
        const ents = p ? resolveEntityMap(game) : null;
        if (ents?.get && p?.id !== undefined) {
            const me = ents.get(p.id) || ents.get(String(p.id));
            if (me?.profile?.username) return me.profile.username;
        }
    } catch { }
    return 'yo';
}

function send(obj) {
    try { state.conn?.send?.(obj); } catch {}
}

state.guestPos = null;

function startBroadcast() {
    stopBroadcast();
    state._lastSentScale = null;
    
    state.sendTimer = setInterval(() => {
        if (state.role !== 'host') return;
        const rec = window.MF_CustomModels?.getRecord?.('verity');
        if (!rec?.root) return; 
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
        
        if (state.guestPos) {
            try { window.MF_CustomModels?.setPeerTarget?.('verity_peer', state.guestPos); } catch {}
        }
    }, 50); 
    
    state.scaleTimer = setInterval(() => {
        try {
            const tt = globalThis.TitanTiny;
            const sc = tt?.enabled ? +(Number(tt.scale) || 1).toFixed(3) : 1;
            if (sc !== state._lastSentScale) {
                state._lastSentScale = sc;
                send({ t: 'scale', scale: sc, name: myName() });
            }
        } catch {}
    }, 250);
    
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

function spawnPuppet(p) {
    const CM = window.MF_CustomModels;
    if (!CM) return;
    try { CM.despawn('verity'); } catch {}
    CM.spawn('verity_full_model.glb', p.x, p.y, p.z, {
        id: 'verity',
        height: 0.85,
        followPlayer: false, 
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
        spawnPuppet(p); 
        return;
    }
    state.puppetTarget = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
    if (p.anim) {
        try { window.MF_CustomModels?.setAnim('verity', p.anim); } catch {}
    }
}

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
        
        if (state._peerMesh && state._peerBase) {
            try {
                state._peerMesh.scale.set(state._peerBase.x, state._peerBase.y, state._peerBase.z);
            } catch {}
        }
        return;
    }
    
    let mesh = state._peerMesh;
    const now = performance.now();
    if (mesh && (!mesh.parent || now - (state._peerMeshAt || 0) > 1500)) {
        
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

const ents = {
    local: null,        
    remote: new Map(),  
    knownFiles: new Set(), 
    sending: new Set(), 
    recv: new Map()     
};

function entsTick() {
    const CM = window.MF_CustomModels;
    if (!CM?.listLive) return;
    
    const now = performance.now();
    // 5 Hz fijo (heartbeat): los mobs quietos tambien refrescan su seenAt remoto
    if (now - (ents._lastSend || 0) > 200) {
        const snap = CM.listLive();
        ents._lastSend = now;
        send({ t: 'ents', ents: snap });
    }
    
    for (const [id, r] of ents.remote) {
        if (now - r.seenAt > 3000) { 
            try { CM.despawn(id); } catch {}
            ents.remote.delete(id);
            continue;
        }
        const rec = CM.getRecord(id);
        if (!rec?.root) {
            
            if (!r.file || r.spawning) continue;
            r.spawning = true;
            CM.tryLoad(r.file).then((ok) => {
                if (!ok && !ents.knownFiles.has(r.file)) {
                    log('no tengo "' + r.file + '" — pidiendolo al peer');
                    ents.knownFiles.add(r.file);
                    send({ t: 'need-file', file: r.file });
                } else if (ok) {
                    spawnPuppetEnt(id, r);
                }
            }).catch(() => {}).finally(() => {
                // reintentar en 2s si aun no hay root (carga async o fallo)
                setTimeout(() => { r.spawning = false; }, 2000);
            });
            continue;
        }
        
        const L = 0.25;
        rec.root.position.x += (r.x - rec.root.position.x) * L;
        rec.root.position.y += (r.y - rec.root.position.y) * L;
        rec.root.position.z += (r.z - rec.root.position.z) * L;
        let dyaw = r.yaw - (rec.yaw || 0);
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        rec.yaw = (rec.yaw || 0) + dyaw * L;
        rec.root.rotation.y = rec.yaw;
    }
    
}

function spawnPuppetEnt(id, r) {
    const CM = window.MF_CustomModels;
    try { CM.despawn(id, true); } catch {}
    CM.spawn(r.file, r.x, r.y, r.z, {
        id,
        height: r.height || 0,
        scale: r.scale || 1,
        puppet: true,
        room: r.room === true,
        anim: r.anim || null,
        texture: r.texture || null,
        followPlayer: false
    });
    log('puppet "' + id + '" (' + r.file + ') spawneado en (' + r.x + ', ' + r.y + ', ' + r.z + ')');
}

const CHUNK = 32 * 1024;

async function sendFile(file) {
    const CM = window.MF_CustomModels;
    if (ents.sending.has(file)) return;
    ents.sending.add(file);
    try {
        const buf = await CM.getGLBBytes(file);
        const bytes = new Uint8Array(buf);
        const total = Math.ceil(bytes.length / CHUNK);
        send({ t: 'file-h', file, size: bytes.length, chunks: total });
        const b64 = bytesToBase64(bytes);
        const stride = Math.ceil(b64.length / total); 
        for (let i = 0; i < total; i++) {
            send({ t: 'file-c', file, i, data: b64.substr(i * stride, stride) });
            if (i % 8 === 7) await new Promise((res) => setTimeout(res, 30)); 
        }
        send({ t: 'file-e', file });
        log('archivo "' + b64name(file) + '" enviado (' + bytes.length + ' B)');
    } catch (e) {
        warn('no pude leer "' + file + '": ' + (e?.message || e));
    } finally {
        ents.sending.delete(file);
    }
}

function b64name(f) { return String(f).slice(0, 40); }

function bytesToBase64(bytes) {
    let bin = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(bin);
}

function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function handleFileEnd(file) {
    const CM = window.MF_CustomModels;
    const st = ents.recv.get(file);
    if (!st) return;
    ents.recv.delete(file);
    let b64 = '';
    for (let i = 0; i < st.total; i++) {
        const part = st.chunks.get(i);
        if (!part) { warn('transferencia incompleta de ' + file + ' (falta chunk ' + i + ')'); return; }
        b64 += part;
    }
    const bytes = base64ToBytes(b64);
    if (bytes.length !== st.size) {
        warn('tamaño incorrecto en ' + file + ': ' + bytes.length + ' vs ' + st.size);
        return;
    }
    log('recibido "' + file + '" (' + st.size + ' B) — cacheando modelo');
    CM.registerModelBytes(file, bytes.buffer).then(() => {
        
        for (const [id, r] of ents.remote) {
            if (r.file === file && !CM.getRecord(id)?.root) spawnPuppetEnt(id, r);
        }
    }).catch((e) => warn('no pude parsear "' + file + '": ' + (e?.message || e)));
}

// Barrida de duplicados: roots __mfCM de la escena que ya no pertenecen a ningun
// record vivo (quedaron huerfanos de la carrera de spawn) se remueven.
function sweepOrphanPuppets() {
    const CM = window.MF_CustomModels;
    if (!CM?.liveRoots) return;
    const scene = (() => {
        try { return getGame()?.gameScene?.scene; } catch { return null; }
    })();
    if (!scene) return;
    const live = CM.liveRoots();
    let removed = 0;
    for (const child of [...(scene.children || [])]) {
        if (!child?.userData?.__mfCM) continue;
        if (!live.has(child)) {
            try { scene.remove(child); removed++; } catch {}
        }
    }
    if (removed) log('barrido: ' + removed + ' duplicado(s) huerfano(s) removido(s)');
}

let puppetRafId = 0;
let lastSweep = 0;
(function puppetLoop() {
    if (state.role === 'guest' || state.role === 'host') {
        try { puppetTick(); } catch {}
        try { peerScaleTick(); } catch {}
        try { entsTick(); } catch {}
        try { lookTick(); } catch {}
        const now = performance.now();
        if (now - lastSweep > 10000) {
            lastSweep = now;
            try { sweepOrphanPuppets(); } catch {}
        }
    }
    puppetRafId = requestAnimationFrame(puppetLoop);
})();

function handleMsg(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
        case 'hello':
            state.peerName = msg.name || null;
            try { globalThis.MF_Mesh?.releaseScaleFor?.(state.peerName); } catch {}
            log('handshake con', msg.name, '(rol remoto: ' + msg.role + ')');
            
            if (!state.sendTimer) startBroadcast();
            
            setTimeout(() => { try { window.MF_Peer.resendLook(); } catch {} }, 800);
            
            setTimeout(() => { try { globalThis.MF_SPIDER_BOT?.onPeerConnected?.(); } catch {} }, 600);
            break;
        case 'sync':
            if (state.role === 'guest') onSyncGuest(msg);
            break;
        case 'pos':
            
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
            
            try { globalThis.MiniFeatherPatPat?.remotePat?.(msg); } catch {}
            break;
        case 'spider':
            
            try { globalThis.MF_SPIDER_BOT?.remoteApply?.(msg.m); } catch {}
            break;
        case 'scale':
            
            if (msg.name && msg.name !== 'yo') state.peerName = msg.name;
            state.peerScale = Number(msg.scale) || 1;
            log('escala remota recibida: ' + msg.name + ' → x' + state.peerScale);
            break;
        case 'ents': {
            
            if (!Array.isArray(msg.ents)) break;
            const now = performance.now();
            const seen = new Set();
            for (const e of msg.ents) {
                if (!e?.id || !e?.file) continue;
                const pid = 'peer_' + e.id;
                seen.add(pid);
                const prev = ents.remote.get(pid);
                ents.remote.set(pid, {
                    id: pid, srcId: e.id, file: e.file,
                    x: +e.x || 0, y: +e.y || 0, z: +e.z || 0,
                    yaw: +e.yaw || 0, anim: e.anim || null,
                    texture: e.texture || null,
                    scale: +e.scale || 1, height: +e.height || 0,
                    seenAt: now
                });
                
                if (prev && prev.anim !== e.anim && e.anim) {
                    try { window.MF_CustomModels?.setAnim?.(pid, e.anim); } catch {}
                }
            }
            
            for (const id of [...ents.remote.keys()]) {
                if (!seen.has(id)) ents.remote.delete(id);
            }
            break;
        }
        case 'need-file':
            
            if (msg.file && /\.glb$/i.test(msg.file)) sendFile(msg.file);
            break;
        case 'file-h':
            if (msg.file) ents.recv.set(msg.file, {
                size: +msg.size || 0, total: +msg.chunks || 0,
                chunks: new Map(), at: performance.now()
            });
            break;
        case 'file-c': {
            const st = ents.recv.get(msg.file);
            if (st && typeof msg.i === 'number' && typeof msg.data === 'string') {
                st.chunks.set(msg.i, msg.data);
            }
            break;
        }
        case 'file-e':
            if (msg.file) handleFileEnd(msg.file);
            break;
        
        case 'studio-pose':
            
            try { window.MF_Studio?.applyRemotePose?.(msg.pose, msg.reset); } catch {}
            break;
        case 'studio-cam':
            
            try { window.MF_Studio?.applyRemoteCam?.(msg.p); } catch {}
            break;
        case 'studio-cam-on':
        case 'studio-cam-off':
            
            try { window.MF_Studio?.remoteCamActive?.(msg.t === 'studio-cam-on'); } catch {}
            break;
        case 'look':
            
            if (msg.a && typeof msg.a === 'object') applyLook(msg.a);
            break;
        case 'facial':
            
            try { applyRemoteFacial(msg); } catch {}
            break;
    }
}

function applyRemoteFacial(msg) {
    if (!msg || typeof msg.a !== 'string') return;
    const entity = peerEntity();
    if (!entity) return;
    const s = rememberPeerOriginal(entity, 'face');
    if (!s) return;
    const rec = peerOriginals.get(entity);
    const orig = rec?.faceCanvas;
    if (!orig) return;
    const k = Math.max(1, Math.round(s.canvas.width / 64));
    const ctx = s.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const FR = { x: FACE_RECT.x * k, y: FACE_RECT.y * k, w: FACE_RECT.w * k, h: FACE_RECT.h * k };
    const FOR = { x: FACE_OVERLAY_RECT.x * k, y: FACE_OVERLAY_RECT.y * k, w: FACE_OVERLAY_RECT.w * k, h: FACE_OVERLAY_RECT.h * k };
    if (msg.a === 'open' || msg.a === 'off' || msg.a === 'front') {
        
        ctx.drawImage(orig, FR.x, FR.y, FR.w, FR.h, FR.x, FR.y, FR.w, FR.h);
        ctx.drawImage(orig, FOR.x, FOR.y, FOR.w, FOR.h, FOR.x, FOR.y, FOR.w, FOR.h);
        s.tex.needsUpdate = true;
        return;
    }
    
    const ok = Math.max(1, Math.round(orig.width / 64));
    const face = document.createElement('canvas');
    face.width = 8 * ok; face.height = 8 * ok;
    
    const fx = face.getContext('2d', { willReadFrequently: true });
    fx.imageSmoothingEnabled = false;
    fx.drawImage(orig, FACE_RECT.x * ok, FACE_RECT.y * ok, FACE_RECT.w * ok, FACE_RECT.h * ok, 0, 0, face.width, face.height);
    try {
        if (msg.a === 'blink') {
            
            const cheek = fx.getImageData(1 * ok, 6 * ok, 1, 1).data;
            fx.fillStyle = `rgb(${cheek[0]},${cheek[1]},${cheek[2]})`;
            fx.fillRect(1 * ok, 4 * ok, 2 * ok, 2 * ok);
            fx.fillRect(5 * ok, 4 * ok, 2 * ok, 2 * ok);
        } else if (msg.a === 'brow') {
            
            const hair = fx.getImageData(4 * ok, 0, 1, 1).data;
            const row3 = fx.getImageData(0, 3 * ok, face.width, ok);
            fx.putImageData(row3, 0, 2 * ok);
            const cheek = fx.getImageData(1 * ok, 6 * ok, 1, 1).data;
            fx.fillStyle = `rgb(${Math.round((cheek[0] + hair[0]) / 2)},${Math.round((cheek[1] + hair[1]) / 2)},${Math.round((cheek[2] + hair[2]) / 2)})`;
            fx.fillRect(0, 3 * ok, face.width, ok);
        } else if (msg.a === 'left' || msg.a === 'right' || msg.a === 'up' || msg.a === 'down') {
            
            const cheek = fx.getImageData(1 * ok, 6 * ok, 1, 1).data;
            const skin = [cheek[0], cheek[1], cheek[2]];
            const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
            
            let iris = null, white = [219, 219, 219];
            for (let x = 1; x <= 6; x++) {
                for (let y = 4; y <= 5; y++) {
                    const d = fx.getImageData(x * ok, y * ok, 1, 1).data;
                    if (!d || d[3] === 0) continue;
                    const sum = d[0] + d[1] + d[2];
                    if (!iris && sum < skin[0] + skin[1] + skin[2] - 90) iris = [d[0], d[1], d[2]];
                    if (sum > white[0] + white[1] + white[2]) white = [d[0], d[1], d[2]];
                }
            }
            if (iris) {
                if (msg.a === 'left' || msg.a === 'right') {
                    const dir = msg.a === 'left' ? -1 : 1;
                    const pair = (ex) => {
                        fx.fillStyle = rgb(skin); fx.fillRect(ex * ok, 4 * ok, 2 * ok, 2 * ok);
                        fx.fillStyle = rgb(white); fx.fillRect((ex + (dir < 0 ? 0 : 1)) * ok, 4 * ok, ok, 2 * ok);
                        fx.fillStyle = rgb(iris); fx.fillRect((ex + (dir < 0 ? 1 : 0)) * ok, 4 * ok, ok, 2 * ok);
                    };
                    pair(1); pair(5);
                } else {
                    const dy = msg.a === 'up' ? -1 : 1;
                    const row = fx.getImageData(0, 4 * ok, 8 * ok, 2 * ok); 
                    fx.fillStyle = rgb(skin);
                    fx.fillRect(1 * ok, 4 * ok, 2 * ok, 2 * ok);
                    fx.fillRect(5 * ok, 4 * ok, 2 * ok, 2 * ok);
                    fx.putImageData(row, 0, (4 + dy) * ok);
                }
            }
        } else return;
    } catch { return; }
    ctx.drawImage(face, 0, 0, face.width, face.height, FR.x, FR.y, FR.w, FR.h);
    ctx.clearRect(FOR.x, FOR.y, FOR.w, FOR.h); 
    s.tex.needsUpdate = true;
}

function showRemoteChat(text) {
    if (!text) return;
    try {
        if (typeof window.MF_Peer._chatHook === 'function') { window.MF_Peer._chatHook(text); return; }
    } catch {}
    try { document.dispatchEvent(new CustomEvent('minifeather:verity-p2p-chat', { detail: { text } })); } catch {}
}

const look = {
    entity: null,       
    entityAt: 0,        
    faceCache: new Map(), 
    pending: [],        
    lastApplied: 0,     
    lastTexAction: null, 
    mountedTex: null,   
    morphType: null,    
    _lastWD: 0          
};

function peerEntity() {
    const now = performance.now();
    if (look.entity && now - look.entityAt < 2000) return look.entity;
    look.entityAt = now;
    look.entity = null;
    if (!state.peerName) return null;
    
    try {
        const e = window.MF_Morph?.findEntityByName?.(state.peerName);
        if (e?.mesh) { look.entity = e; return e; }
    } catch {}
    
    try {
        const ents = resolveEntityMap(getGame());
        if (ents?.values) {
            for (const e of ents.values()) {
                if (e?.profile?.username === state.peerName && e?.mesh) {
                    look.entity = e; return e;
                }
            }
        }
    } catch {}
    return null;
}

function peerSkinMaterials(entity) {
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

function peerEditableCanvas(entity) {
    const mats = peerSkinMaterials(entity);
    if (!mats.length) return null;
    const isCanvas = t => t?.image instanceof HTMLCanvasElement;
    const usable = mats.filter(m =>
        m.map?.image && !(isCanvas(m.map) && m.map.__mfLocalCanvas));
    if (!usable.length) return null;
    const tex = usable[0].map;
    
    if (isCanvas(tex) && tex.__mfPeerCanvas) {
        return { canvas: tex.image, tex, mats: usable.filter(m => m.map === tex) };
    }
    
    const c = document.createElement('canvas');
    c.width = tex.image.width; c.height = tex.image.height;
    try { c.getContext('2d').drawImage(tex.image, 0, 0); } catch { return null; }
    let nt = null;
    try { nt = new tex.constructor(c); } catch {}
    if (!nt) return null;
    nt.__mfPeerCanvas = true; 
    try {
        nt.magFilter = tex.magFilter; nt.minFilter = tex.minFilter;
        if (tex.colorSpace !== undefined && 'colorSpace' in nt) nt.colorSpace = tex.colorSpace;
        nt.flipY = tex.flipY; nt.wrapS = tex.wrapS; nt.wrapT = tex.wrapT;
    } catch {}
    for (const m of usable) { m.map = nt; m.needsUpdate = true; }
    return { canvas: c, tex: nt, mats: usable };
}

function loadImg(url) {
    if (!look.faceCache.has(url)) {
        look.faceCache.set(url, new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = () => rej(new Error('img no cargó'));
            img.src = url;
        }));
    }
    return look.faceCache.get(url);
}

const peerOriginals = new WeakMap(); 

function rememberPeerOriginal(entity, kind) {
    const s = peerEditableCanvas(entity);
    if (!s) return null;
    let rec = peerOriginals.get(entity);
    if (!rec) {
        rec = { headCanvas: null, skinCanvas: null, headTex: null, skinTex: null };
        peerOriginals.set(entity, rec);
    }
    
    if (!rec[kind + 'Canvas'] || rec[kind + 'Tex'] !== s.tex) {
        const c = document.createElement('canvas');
        c.width = s.canvas.width; c.height = s.canvas.height;
        c.getContext('2d').drawImage(s.canvas, 0, 0);
        rec[kind + 'Canvas'] = c;
        rec[kind + 'Tex'] = s.tex;
    }
    return s;
}

const HEAD_RECT = { x: 0, y: 0, w: 64, h: 16 };
const FACE_RECT = { x: 8, y: 8, w: 8, h: 8 };
const FACE_OVERLAY_RECT = { x: 40, y: 8, w: 8, h: 8 };

function applyLook(a) {
    const entity = peerEntity();
    if (!entity) {
        
        if (look.pending.length < 20) look.pending.push(a);
        return;
    }
    look.lastApplied = performance.now();
    log('look-sync ← ' + a.a + (a.name ? ' (' + a.name + ')' : a.type ? ' (' + a.type + ')' : ''));
    try {
        switch (a.a) {
            case 'stroke': {
                
                const s = rememberPeerOriginal(entity, 'head');
                if (!s) return;
                look.mountedTex = s.tex;
                const ctx = s.canvas.getContext('2d');
                for (const [x, y, color] of a.cells) {
                    if (color == null) ctx.clearRect(x, y, 1, 1);
                    else { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
                }
                s.tex.needsUpdate = true;
                break;
            }
            case 'head-rect': {
                
                const s = rememberPeerOriginal(entity, 'head');
                if (!s) return;
                look.mountedTex = s.tex;
                look.lastTexAction = { a: 'head-rect' };
                loadImg(a.png).then(img => {
                    look.lastTexImg = img;
                    const ctx = s.canvas.getContext('2d');
                    ctx.clearRect(HEAD_RECT.x, HEAD_RECT.y, HEAD_RECT.w, HEAD_RECT.h);
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, 0, 0, img.width, img.height, HEAD_RECT.x, HEAD_RECT.y, HEAD_RECT.w, HEAD_RECT.h);
                    s.tex.needsUpdate = true;
                }).catch(() => {});
                break;
            }
            case 'face': {
                
                const s = rememberPeerOriginal(entity, 'face');
                if (!s) return;
                look.mountedTex = s.tex;
                look.lastTexAction = { a: 'face', region: a.region };
                loadImg(a.dataURL).then(img => {
                    look.lastTexImg = img;
                    const r = a.region || FACE_RECT;
                    const ctx = s.canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, r.x, r.y, r.w, r.h, FACE_RECT.x, FACE_RECT.y, FACE_RECT.w, FACE_RECT.h);
                    ctx.drawImage(img, r.x, r.y, r.w, r.h, FACE_OVERLAY_RECT.x, FACE_OVERLAY_RECT.y, FACE_OVERLAY_RECT.w, FACE_OVERLAY_RECT.h);
                    s.tex.needsUpdate = true;
                }).catch(() => {});
                break;
            }
            case 'skin': {
                
                const s = rememberPeerOriginal(entity, 'skin');
                if (!s) return;
                look.mountedTex = s.tex;
                look.lastTexAction = { a: 'skin' };
                loadImg(a.dataURL).then(img => {
                    look.lastTexImg = img;
                    const ctx = s.canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = false;
                    ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
                    ctx.drawImage(img, 0, 0);
                    s.tex.needsUpdate = true;
                }).catch(() => {});
                break;
            }
            case 'revert': {
                
                const rec = peerOriginals.get(entity);
                const s = peerEditableCanvas(entity);
                if (!rec || !s) return;
                const src = rec[a.what + 'Canvas'];
                if (!src) return;
                look.mountedTex = s.tex;
                look.lastTexAction = null;   
                look.lastTexImg = null;
                const ctx = s.canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
                ctx.drawImage(src, 0, 0);
                s.tex.needsUpdate = true;
                break;
            }
            case 'morph': {
                
                try {
                    window.MF_Morph?.applyOn?.(entity, a.type);
                    look.morphType = a.type;
                } catch (e) {
                    warn('morph remoto (' + a.type + ') fallo: ' + (e?.message || e));
                }
                break;
            }
            case 'unmorph': {
                try { window.MF_Morph?.detachFrom?.(entity.id); } catch {}
                look.morphType = null;
                break;
            }
        }
    } catch (e) {
        warn('look-sync ' + a.a + ' fallo: ' + (e?.message || e));
    }
}

function drainLookPending() {
    if (!look.pending.length) return;
    const entity = peerEntity();
    if (!entity) return;
    const q = look.pending.splice(0);
    for (const a of q) applyLook(a);
}

function lookTick() {
    if (!state.conn) return;
    if (look.pending.length) drainLookPending();
    
    if (look.entity && (look.entity.mesh == null || look.entity.removed)) {
        look.entity = null;
    }
    const now = performance.now();
    if (now - look._lastWD < 600) return;
    look._lastWD = now;
    
    if (look.lastTexAction && look.mountedTex) {
        const entity = peerEntity();
        if (entity) {
            const mats = peerSkinMaterials(entity);
            const mounted = mats.some(m => m.map === look.mountedTex);
            if (!mounted && mats.length) {
                for (const m of mats) { m.map = look.mountedTex; m.needsUpdate = true; }
                log('look-sync: juego pisó la textura del peer — re-montada');
            }
        }
    }
}

function reappliedLastTexAction(entity) {
    const a = look.lastTexAction;
    if (!a) return;
    const img = look.lastTexImg;
    if (!img) return;
    const s = peerEditableCanvas(entity);
    if (!s) return;
    const ctx = s.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (a.a === 'skin') {
        ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
        ctx.drawImage(img, 0, 0);
    } else if (a.a === 'head-rect') {
        ctx.clearRect(HEAD_RECT.x, HEAD_RECT.y, HEAD_RECT.w, HEAD_RECT.h);
        ctx.drawImage(img, 0, 0, img.width, img.height, HEAD_RECT.x, HEAD_RECT.y, HEAD_RECT.w, HEAD_RECT.h);
    } else if (a.a === 'face') {
        const r = a.region || FACE_RECT;
        ctx.drawImage(img, r.x, r.y, r.w, r.h, FACE_RECT.x, FACE_RECT.y, FACE_RECT.w, FACE_RECT.h);
        ctx.drawImage(img, r.x, r.y, r.w, r.h, FACE_OVERLAY_RECT.x, FACE_OVERLAY_RECT.y, FACE_OVERLAY_RECT.w, FACE_OVERLAY_RECT.h);
    }
    s.tex.needsUpdate = true;
}

function revertPeerLook() {
    try {
        const entity = (look.entity?.mesh != null && !look.entity.removed) ? look.entity : peerEntity();
        if (!entity) return;
        const rec = peerOriginals.get(entity);
        const s = peerEditableCanvas(entity);
        if (!rec || !s) return;
        const src = rec.skinCanvas || rec.headCanvas || rec.faceCanvas;
        if (src) {
            const ctx = s.canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
            ctx.drawImage(src, 0, 0);
            s.tex.needsUpdate = true;
        }
        
        try { s.tex.__mfPeerCanvas = false; } catch {}
        log('look-sync: peer fuera — skin restaurada, cara liberada');
    } catch (e) { warn('revert look falló: ' + (e?.message || e)); }
}

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
        
        try { globalThis.MF_SPIDER_BOT?.remoteApply?.({ type: 'clear' }); } catch {}
        
        for (const id of [...ents.remote.keys()]) {
            try { window.MF_CustomModels?.despawn?.(id, true); } catch {}
            ents.remote.delete(id);
        }
        ents._lastKey = null;
        ents.recv.clear();
        
        if (look.entity && look.morphType) {
            try { window.MF_Morph?.detachFrom?.(look.entity.id); } catch {}
        }
        
        revertPeerLook();
        look.entity = null; look.pending.length = 0;
        look.morphType = null;
        look.lastTexAction = null; look.lastTexImg = null; look.mountedTex = null;
        
        try { window.MF_Studio?.remoteCamActive?.(false); } catch {}
        try { window.MF_Studio?.applyRemotePose?.(null, true); } catch {}
        stopBroadcast();
        state.conn = null;
        state.status = 'off';
    });
    conn.on('error', (e) => warn('error de conexion:', e?.message || e));
}

const autoShare = {
    on: (() => { try { return localStorage.getItem('mf:p2p:autoshare') !== '0'; } catch { return true; } })(),
    myCodes: new Set(),      
    seenCodes: new Map(),    
    chatSeen: new WeakSet(), 
};

function sendRoomToChat(code) {
    if (!autoShare.on || !code) return;
    const g = getGame();
    const chat = g?.chat;
    if (!chat || typeof chat.submit !== 'function') { log('auto-share: sin chat del juego'); return; }
    const text = 'mfp2p:' + code;
    autoShare.myCodes.add(code);
    try {
        try { chat.setInputValue?.(text); } catch { try { chat.inputValue = text; } catch {} }
        // submit(e) del engine llama e.inGame(): pasar el game explícito.
        chat.submit(g);
        log('sala compartida al chat: ' + text);
    } catch (e) { warn('auto-share falló:', e?.message || e); }
    try { chat.closeInput?.(); } catch {}
}

function chatWatchTick() {
    if (!autoShare.on || state.conn || state.peer) return;
    const g = getGame();
    const logArr = g?.chat?.log;
    if (!Array.isArray(logArr)) return;
    const meUuid = g?.player?.uuid != null ? String(g.player.uuid) : null;
    for (let i = Math.max(0, logArr.length - 15); i < logArr.length; i++) {
        const entry = logArr[i];
        if (!entry || typeof entry !== 'object' || autoShare.chatSeen.has(entry)) continue;
        autoShare.chatSeen.add(entry);
        const text = String(entry.text ?? entry.message ?? entry.content ?? '');
        const m = text.match(/mfp2p[:\s]+([A-Za-z0-9-]{4,24})/i);
        if (!m) continue;
        const code = m[1];
        if (autoShare.myCodes.has(code)) continue; 
        const from = entry.from != null ? String(entry.from) : null;
        if (meUuid && from === meUuid) continue;   
        const now = Date.now();
        if (now - (autoShare.seenCodes.get(code) || 0) < 10 * 60 * 1000) continue; 
        autoShare.seenCodes.set(code, now);
        log('sala P2P detectada en el chat → auto-join ' + code);
        join(code);
        return;
    }
}
setInterval(chatWatchTick, 1500);

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
        void 0;
        
        sendRoomToChat(pid);
    });
    peer.on('connection', (c) => {
        if (state.conn) { try { c.close(); } catch {} return; } 
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

window.MF_Peer = {
    get status() { return state.status; },
    get role() { return state.role; },
    get code() { return state.peerId; },
    get connected() { return !!state.conn; },
    get scalePeerName() { return state.conn?.open ? state.peerName : null; },
    _chatHook: null,
    host, join, off,
    
    dispose() {
        try { off(); } catch {}
        try { clearInterval(state.sendTimer); } catch {}
        try { clearInterval(state.scaleTimer); } catch {}
        try { clearInterval(state.posTimer); } catch {}
        try { clearInterval(chatWatchTimer); } catch {}
        try { cancelAnimationFrame(puppetRafId); } catch {}
    },
    
    auto(on) {
        if (on === true || on === false) {
            autoShare.on = on;
            try { localStorage.setItem('mf:p2p:autoshare', on ? '1' : '0'); } catch {}
            log('auto-share ' + (on ? 'ON' : 'OFF'));
        }
        return autoShare.on;
    },
    
    sendPat(info) {
        if (!state.conn) return false;
        send({ t: 'pat', target: info?.target || null, from: info?.from || null });
        return true;
    },
    
    sendStudio(obj) {
        if (!state.conn || state.status === 'off') return false;
        send(obj);
        return true;
    },
    
    sendLook(a) {
        if (!state.conn || state.status === 'off') return false;
        send({ t: 'look', a });
        return true;
    },
    
    get lookSynced() { return !!(state.conn && state.peerName); },
    
    lookStatus() {
        const e = look.entity || peerEntity();
        return {
            connected: !!state.conn,
            role: state.role,
            peerName: state.peerName,
            entityFound: !!e,
            entityMesh: !!e?.mesh,
            skinMats: e ? peerSkinMaterials(e).length : 0,
            pendingQueue: look.pending.length,
            morphType: look.morphType,
            lastTexAction: look.lastTexAction?.a || null,
            lastAppliedAgoMs: look.lastApplied ? Math.round(performance.now() - look.lastApplied) : null
        };
    },
    
    resendLook() {
        if (!state.conn) return { ok: false, error: 'not connected' };
        let sent = 0;
        
        const sc = window.MF_SkinChanger;
        if (sc?.current) {
            sc.apply(sc.current).catch(() => {});
            sent++;
        }
        
        if (window.MF_Morph?.current) {
            try { window.MF_Peer.sendLook({ a: 'morph', type: window.MF_Morph.current }); sent++; } catch {}
        }
        log('look-sync: re-enviado estado propio (' + sent + ' elemento(s))');
        return { ok: true, sent };
    }
};

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
    
    if (V?.setChatHook && !V.__p2pHookPatched) {
        V.__p2pHookPatched = true;
        const origSet = V.setChatHook.bind(V);
        V.setChatHook = function (fn) {
            window.MF_Peer._chatHook = typeof fn === 'function' ? fn : null;
            return origSet(fn);
        };
    }
} catch {}

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
