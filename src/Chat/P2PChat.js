(function () {
  'use strict';

  const GLOBAL_KEY = '__MINIFEATHER_P2P_CHAT__';
  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  const TAG = '[MiniFeather Chat]';
  const PEERJS_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const GLOBAL_TOPIC_URL = 'https://ntfy.sh/mf-global-chat-v1';
  const MAX_HISTORY = 120;

  // ---------- State ----------
  const state = {
    nickname: '',
    activeMode: 'global', // 'global' | 'private'
    // Global chat
    globalStatus: 'connecting', // 'connecting' | 'connected' | 'error'
    globalMessages: [],
    globalEventSource: null,
    seenGlobalIds: new Set(),
    // Private P2P chat
    privateStatus: 'off', // 'off' | 'connecting' | 'hosting' | 'connected' | 'error'
    privateRoomCode: '',
    privateRole: null, // 'host' | 'guest' | null
    peer: null, // PeerJS instance
    hostConn: null, // Guest's connection to host
    guestConns: new Map(), // Host's connections: peerId -> DataConnection
    roster: new Map(), // peerId -> nickname
    privateMessages: [],
    // Unread counters
    unreadGlobal: 0,
    unreadPrivate: 0,
    destroyed: false
  };

  // Helper logging
  function log(...args) { console.log(TAG, ...args); }
  function warn(...args) { console.warn(TAG, ...args); }

  // Resolve player name from game instance
  function resolvePlayerName() {
    try {
      const game = globalThis.__MINIBLOX_GAME__ || globalThis.miniblox;
      const p = game?.player;
      if (p?.profile?.username) return p.profile.username;
      if (p?.username) return p.username;
    } catch (_) {}
    try {
      const saved = localStorage.getItem('minifeather_chat_nickname');
      if (saved && saved.trim()) return saved.trim();
    } catch (_) {}
    return 'Player_' + Math.random().toString(36).slice(2, 6);
  }

  // PeerJS loader
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

  // Emit state update to UI (isolated context)
  function emitState() {
    if (state.destroyed) return;
    const rosterNames = Array.from(state.roster.values());
    if (state.privateStatus === 'hosting' || state.privateStatus === 'connected') {
      if (!rosterNames.includes(state.nickname)) rosterNames.unshift(state.nickname);
    }
    const payload = {
      activeMode: state.activeMode,
      nickname: state.nickname,
      globalStatus: state.globalStatus,
      globalMessages: state.globalMessages.slice(-MAX_HISTORY),
      privateStatus: state.privateStatus,
      privateRoomCode: state.privateRoomCode,
      privatePeerCount: state.privateRole === 'host' ? state.guestConns.size + 1 : (state.hostConn ? rosterNames.length : 0),
      privateRoster: rosterNames,
      privateMessages: state.privateMessages.slice(-MAX_HISTORY),
      unreadGlobal: state.unreadGlobal,
      unreadPrivate: state.unreadPrivate
    };

    document.dispatchEvent(new CustomEvent('minifeather:chat-update', {
      detail: JSON.stringify(payload)
    }));
  }

  // ============================================================
  // PUBLIC GLOBAL CHAT
  // ============================================================
  function initGlobalChat() {
    if (state.globalEventSource) {
      try { state.globalEventSource.close(); } catch (_) {}
      state.globalEventSource = null;
    }

    // 1. Fetch recent messages
    fetch(`${GLOBAL_TOPIC_URL}/json?poll=1&since=2h`)
      .then(r => r.text())
      .then(text => {
        if (!text) return;
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          try {
            const raw = JSON.parse(line);
            if (raw.event === 'message' && raw.message) {
              const msg = JSON.parse(raw.message);
              if (msg && msg.id && !state.seenGlobalIds.has(msg.id)) {
                state.seenGlobalIds.add(msg.id);
                state.globalMessages.push(msg);
              }
            }
          } catch (_) {}
        }
        state.globalMessages.sort((a, b) => (a.time || 0) - (b.time || 0));
        emitState();
      })
      .catch(() => {});

    // 2. Connect live EventSource SSE stream
    try {
      const es = new EventSource(`${GLOBAL_TOPIC_URL}/sse`);
      state.globalEventSource = es;

      es.onopen = () => {
        state.globalStatus = 'connected';
        emitState();
      };

      es.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          if (raw.event === 'message' && raw.message) {
            const msg = typeof raw.message === 'string' ? JSON.parse(raw.message) : raw.message;
            if (msg && msg.id && !state.seenGlobalIds.has(msg.id)) {
              state.seenGlobalIds.add(msg.id);
              state.globalMessages.push(msg);
              if (state.globalMessages.length > MAX_HISTORY * 2) {
                state.globalMessages = state.globalMessages.slice(-MAX_HISTORY);
              }
              if (state.activeMode !== 'global' && msg.sender !== state.nickname) {
                state.unreadGlobal++;
              }
              emitState();
            }
          }
        } catch (_) {}
      };

      es.onerror = () => {
        state.globalStatus = 'connecting';
        emitState();
      };
    } catch (e) {
      state.globalStatus = 'error';
      emitState();
    }
  }

  async function sendGlobalMessage(text) {
    const clean = String(text || '').trim();
    if (!clean) return false;
    const msg = {
      id: `gm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sender: state.nickname || resolvePlayerName(),
      text: clean.slice(0, 300),
      time: Date.now()
    };

    state.seenGlobalIds.add(msg.id);
    state.globalMessages.push(msg);
    emitState();

    try {
      await fetch(GLOBAL_TOPIC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: JSON.stringify(msg)
      });
      return true;
    } catch (e) {
      warn('Failed to publish global message:', e);
      return false;
    }
  }

  // ============================================================
  // PRIVATE P2P CHAT (PeerJS WebRTC)
  // ============================================================
  function normalizeRoomCode(code) {
    return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16);
  }

  function broadcastToGuests(data, excludePeerId = null) {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    for (const [peerId, conn] of state.guestConns) {
      if (peerId === excludePeerId) continue;
      try { conn.send(raw); } catch (_) {}
    }
  }

  function addPrivateSystemMessage(text) {
    state.privateMessages.push({
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sender: 'System',
      text,
      time: Date.now(),
      system: true
    });
    emitState();
  }

  function hostPrivateRoom(customCode) {
    leavePrivateRoom();
    return new Promise(async (resolve) => {
      if (!(await loadPeerJS())) {
        state.privateStatus = 'error';
        addPrivateSystemMessage('Failed to load PeerJS library. Check internet or adblocker.');
        emitState();
        resolve(false);
        return;
      }

      const code = normalizeRoomCode(customCode) || Math.random().toString(36).substring(2, 7).toUpperCase();
      const peerId = 'mf-pchat-' + code.toLowerCase();

      state.privateStatus = 'connecting';
      state.privateRole = 'host';
      state.privateRoomCode = code;
      state.roster.clear();
      state.roster.set('host', state.nickname);
      emitState();

      try {
        const peer = new globalThis.Peer(peerId, { debug: 0 });
        state.peer = peer;

        peer.on('open', () => {
          state.privateStatus = 'hosting';
          addPrivateSystemMessage(`Room created! Share code: ${code}`);
          emitState();
          resolve(code);
        });

        peer.on('connection', (conn) => {
          wireHostConnection(conn);
        });

        peer.on('error', (err) => {
          warn('Host peer error:', err);
          state.privateStatus = 'error';
          addPrivateSystemMessage(`Room error: ${err?.type || 'Connection failed'}`);
          emitState();
          resolve(false);
        });
      } catch (e) {
        state.privateStatus = 'error';
        emitState();
        resolve(false);
      }
    });
  }

  function wireHostConnection(conn) {
    conn.on('open', () => {
      state.guestConns.set(conn.peer, conn);
      emitState();
    });

    conn.on('data', (raw) => {
      try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!data || !data.type) return;

        if (data.type === 'hello') {
          const guestNick = String(data.sender || 'Peer').trim() || 'Peer';
          state.roster.set(conn.peer, guestNick);
          addPrivateSystemMessage(`${guestNick} joined the room.`);

          // Send current roster to all guests
          const rosterList = Array.from(state.roster.values());
          broadcastToGuests({ type: 'roster', roster: rosterList });

          // Send back welcome with room info
          try {
            conn.send(JSON.stringify({
              type: 'welcome',
              roomCode: state.privateRoomCode,
              roster: rosterList
            }));
          } catch (_) {}
          emitState();
          return;
        }

        if (data.type === 'msg') {
          // Relayed chat message from a guest
          const msg = {
            id: data.id || `pm_${Date.now()}`,
            sender: data.sender || 'Peer',
            text: String(data.text || '').slice(0, 300),
            time: Number(data.time) || Date.now(),
            system: false
          };
          state.privateMessages.push(msg);
          if (state.activeMode !== 'private') state.unreadPrivate++;
          emitState();

          // Relay to all other guests
          broadcastToGuests(data, conn.peer);
          return;
        }
      } catch (_) {}
    });

    conn.on('close', () => {
      const leavingNick = state.roster.get(conn.peer) || 'A participant';
      state.guestConns.delete(conn.peer);
      state.roster.delete(conn.peer);
      addPrivateSystemMessage(`${leavingNick} left the room.`);
      broadcastToGuests({ type: 'roster', roster: Array.from(state.roster.values()) });
      emitState();
    });
  }

  function joinPrivateRoom(codeToJoin) {
    leavePrivateRoom();
    const code = normalizeRoomCode(codeToJoin);
    if (!code) {
      addPrivateSystemMessage('Please enter a valid room code.');
      return Promise.resolve(false);
    }

    return new Promise(async (resolve) => {
      if (!(await loadPeerJS())) {
        state.privateStatus = 'error';
        addPrivateSystemMessage('Failed to load PeerJS library.');
        emitState();
        resolve(false);
        return;
      }

      state.privateStatus = 'connecting';
      state.privateRole = 'guest';
      state.privateRoomCode = code;
      state.roster.clear();
      emitState();

      try {
        const peer = new globalThis.Peer({ debug: 0 });
        state.peer = peer;

        peer.on('open', () => {
          const targetPeerId = 'mf-pchat-' + code.toLowerCase();
          const conn = peer.connect(targetPeerId, { reliable: true });
          state.hostConn = conn;

          conn.on('open', () => {
            state.privateStatus = 'connected';
            addPrivateSystemMessage(`Connected to room ${code}!`);
            // Handshake
            conn.send(JSON.stringify({
              type: 'hello',
              sender: state.nickname
            }));
            emitState();
            resolve(true);
          });

          conn.on('data', (raw) => {
            try {
              const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
              if (!data) return;

              if (data.type === 'welcome') {
                if (Array.isArray(data.roster)) {
                  state.roster.clear();
                  data.roster.forEach((name, i) => state.roster.set(String(i), name));
                }
                emitState();
                return;
              }

              if (data.type === 'roster') {
                if (Array.isArray(data.roster)) {
                  state.roster.clear();
                  data.roster.forEach((name, i) => state.roster.set(String(i), name));
                }
                emitState();
                return;
              }

              if (data.type === 'msg') {
                state.privateMessages.push({
                  id: data.id || `pm_${Date.now()}`,
                  sender: data.sender || 'Peer',
                  text: String(data.text || '').slice(0, 300),
                  time: Number(data.time) || Date.now(),
                  system: false
                });
                if (state.activeMode !== 'private') state.unreadPrivate++;
                emitState();
                return;
              }
            } catch (_) {}
          });

          conn.on('close', () => {
            state.privateStatus = 'off';
            addPrivateSystemMessage('Disconnected from host.');
            emitState();
          });

          conn.on('error', (err) => {
            warn('Connection error:', err);
            state.privateStatus = 'error';
            addPrivateSystemMessage('Could not connect to host.');
            emitState();
            resolve(false);
          });
        });

        peer.on('error', (err) => {
          warn('Guest peer error:', err);
          state.privateStatus = 'error';
          addPrivateSystemMessage(`Room ${code} not found or host offline.`);
          emitState();
          resolve(false);
        });
      } catch (e) {
        state.privateStatus = 'error';
        emitState();
        resolve(false);
      }
    });
  }

  function sendPrivateMessage(text) {
    const clean = String(text || '').trim();
    if (!clean) return false;
    if (state.privateStatus !== 'hosting' && state.privateStatus !== 'connected') {
      addPrivateSystemMessage('You are not connected to any private room.');
      return false;
    }

    const msg = {
      type: 'msg',
      id: `pm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sender: state.nickname,
      text: clean.slice(0, 300),
      time: Date.now(),
      system: false
    };

    state.privateMessages.push(msg);
    emitState();

    if (state.privateRole === 'host') {
      broadcastToGuests(msg);
    } else if (state.hostConn) {
      try { state.hostConn.send(JSON.stringify(msg)); } catch (_) {}
    }
    return true;
  }

  function leavePrivateRoom() {
    if (state.privateStatus === 'off') return;

    if (state.privateRole === 'host') {
      for (const conn of state.guestConns.values()) {
        try { conn.close(); } catch (_) {}
      }
      state.guestConns.clear();
    } else if (state.hostConn) {
      try { state.hostConn.close(); } catch (_) {}
      state.hostConn = null;
    }

    if (state.peer) {
      try { state.peer.destroy(); } catch (_) {}
      state.peer = null;
    }

    state.privateStatus = 'off';
    state.privateRole = null;
    state.privateRoomCode = '';
    state.roster.clear();
    addPrivateSystemMessage('Left private room.');
    emitState();
  }

  // ============================================================
  // EVENT BRIDGE WITH UI
  // ============================================================
  function onChatAction(event) {
    let payload = event.detail;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_) { return; }
    }
    if (!payload || !payload.action) return;

    switch (payload.action) {
      case 'set-mode':
        if (payload.mode === 'global' || payload.mode === 'private') {
          state.activeMode = payload.mode;
          if (payload.mode === 'global') state.unreadGlobal = 0;
          if (payload.mode === 'private') state.unreadPrivate = 0;
          emitState();
        }
        break;

      case 'set-nickname': {
        const nick = String(payload.nickname || '').trim();
        if (nick) {
          state.nickname = nick.slice(0, 24);
          try { localStorage.setItem('minifeather_chat_nickname', state.nickname); } catch (_) {}
          emitState();
        }
        break;
      }

      case 'send-global':
        sendGlobalMessage(payload.text);
        break;

      case 'send-private':
        sendPrivateMessage(payload.text);
        break;

      case 'host-private':
        hostPrivateRoom(payload.code);
        break;

      case 'join-private':
        joinPrivateRoom(payload.code);
        break;

      case 'leave-private':
        leavePrivateRoom();
        break;

      case 'clear-global':
        state.globalMessages = [];
        emitState();
        break;

      case 'clear-private':
        state.privateMessages = [];
        emitState();
        break;

      case 'query':
        emitState();
        break;
    }
  }

  // Teardown
  function destroy() {
    state.destroyed = true;
    document.removeEventListener('minifeather:chat-action', onChatAction);
    if (state.globalEventSource) {
      try { state.globalEventSource.close(); } catch (_) {}
      state.globalEventSource = null;
    }
    leavePrivateRoom();
  }

  // Init
  state.nickname = resolvePlayerName();
  document.addEventListener('minifeather:chat-action', onChatAction);
  initGlobalChat();

  // Expose API
  globalThis[GLOBAL_KEY] = {
    destroy,
    get state() { return state; },
    sendGlobal: sendGlobalMessage,
    sendPrivate: sendPrivateMessage,
    hostPrivate: hostPrivateRoom,
    joinPrivate: joinPrivateRoom,
    leavePrivate: leavePrivateRoom
  };

  log('P2P & Global Chat manager initialized.');
})();
