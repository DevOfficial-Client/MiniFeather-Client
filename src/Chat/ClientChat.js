(function () {
  'use strict';


  const KEY = '__MINIFEATHER_CLIENT_CHAT__';
  const CONFIG_EVENT = 'minifeather:client-chat-config';
  const COMMAND_EVENT = 'minifeather:client-chat-command';
  const STATE_EVENT = 'minifeather:client-chat-state';
  const IDENTITY_REQUEST_EVENT = 'minifeather:client-chat-identity-request';
  const IDENTITY_EVENT = 'minifeather:client-chat-identity';
  const PROTOCOL = 'MFCC2';
  const SIGNAL_PORT = 'minifeather-client-chat-signal';
  const MAX_MESSAGES = 120;
  const MAX_TEXT = 240;
  const ANNOUNCE_INTERVAL = 18000;
  const PEER_TIMEOUT = 65000;

  try {
    globalThis[KEY]?.destroy?.();
  } catch (_) {}

  const state = {
    enabled: false,
    mentionSound: true,
    peerId: '',
    username: 'Player',
    uuid: '',
    knownPeers: new Map(),
    messages: [],
    seenMessages: new Set(),
    signalPort: null,
    announceTimer: 0,
    cleanupTimer: 0,
    reconnectTimer: 0,
    signalHeartbeat: 0,
    emitTimer: 0,
    connectedToSignal: false,
    destroyed: false,
    sendTimes: [],
    blockedUntil: 0,
    lastMentionSound: 0,
    senderMentionTimes: new Map(),
    senderMessageWindows: new Map(),
    lastError: ''
  };

  function randomId(length = 12) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => (value % 36).toString(36)).join('');
  }

  function loadPeerId() {
    try {
      const saved = sessionStorage.getItem('minifeather.clientchat.peerId');
      if (saved && /^[a-z0-9]{8,40}$/i.test(saved)) return saved;
    } catch (_) {}

    const value = randomId(18);
    try {
      sessionStorage.setItem('minifeather.clientchat.peerId', value);
    } catch (_) {}
    return value;
  }

  function cleanText(value, max = MAX_TEXT) {
    return String(value || '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function requestIdentity() {
    try {
      document.dispatchEvent(new CustomEvent(IDENTITY_REQUEST_EVENT));
    } catch (_) {}
  }

  function refreshIdentity() {
    if (!state.username || state.username === 'Player') {
      state.username = `Player-${state.peerId.slice(0, 5)}`;
    }
    requestIdentity();
  }

  function onIdentity(event) {
    let identity;
    try {
      identity = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch (_) {
      return;
    }

    if (!identity || typeof identity !== 'object') return;

    const name = cleanText(identity.username || '', 24);
    const uuid = String(identity.uuid || '').trim();
    let changed = false;

    if (name && name !== state.username) {
      state.username = name;
      changed = true;
    }

    if (uuid && uuid !== state.uuid) {
      state.uuid = uuid;
      changed = true;
    }

    if (changed) {
      emitState();
      announce();
    }
  }

  function activePeerCount() {
    const now = Date.now();
    let count = 0;
    for (const peer of state.knownPeers.values()) {
      if (now - Number(peer.lastSeen || 0) <= PEER_TIMEOUT) count++;
    }
    return count;
  }

  function emitState() {
    clearTimeout(state.emitTimer);
    state.emitTimer = window.setTimeout(() => {
      state.emitTimer = 0;
      if (state.destroyed) return;
      refreshIdentity();
      document.dispatchEvent(new CustomEvent(STATE_EVENT, {
        detail: JSON.stringify({
          enabled: state.enabled,
          connected: state.connectedToSignal,
          signaling: state.connectedToSignal,
          ready: state.enabled && state.connectedToSignal,
          online: state.enabled ? activePeerCount() + 1 : 0,
          username: state.username,
          messages: state.messages.slice(-MAX_MESSAGES),
          blockedUntil: state.blockedUntil,
          error: state.lastError
        })
      }));
    }, 20);
  }

  function rememberMessage(id) {
    if (!id || state.seenMessages.has(id)) return false;
    state.seenMessages.add(id);
    while (state.seenMessages.size > 800) {
      const first = state.seenMessages.values().next().value;
      state.seenMessages.delete(first);
    }
    return true;
  }

  function containsMention(text) {
    const target = state.username.toLowerCase();
    if (!target) return false;
    const regex = /@([a-zA-Z0-9_\-.]{1,32})/g;
    let match;
    while ((match = regex.exec(String(text || '')))) {
      if (match[1].toLowerCase() === target) return true;
    }
    return false;
  }

  function playMentionSound(senderId) {
    if (!state.mentionSound) return;
    const now = Date.now();
    if (now - state.lastMentionSound < 2500) return;
    const senderLast = Number(state.senderMentionTimes.get(senderId) || 0);
    if (now - senderLast < 10000) return;

    state.lastMentionSound = now;
    state.senderMentionTimes.set(senderId, now);

    try {
      const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      gain.connect(ctx.destination);

      const first = ctx.createOscillator();
      first.type = 'sine';
      first.frequency.setValueAtTime(740, ctx.currentTime);
      first.connect(gain);
      first.start(ctx.currentTime);
      first.stop(ctx.currentTime + 0.11);

      const second = ctx.createOscillator();
      second.type = 'sine';
      second.frequency.setValueAtTime(980, ctx.currentTime + 0.1);
      second.connect(gain);
      second.start(ctx.currentTime + 0.1);
      second.stop(ctx.currentTime + 0.24);

      window.setTimeout(() => ctx.close().catch(() => {}), 500);
    } catch (_) {}
  }

  function addMessage(message, remote = false) {
    if (!message || !rememberMessage(String(message.id || ''))) return false;

    const entry = {
      id: String(message.id),
      from: String(message.from || ''),
      name: cleanText(message.name || 'Player', 24),
      text: cleanText(message.text),
      time: Math.max(0, Number(message.time) || Date.now()),
      own: String(message.from || '') === state.peerId
    };

    if (!entry.text) return false;

    state.messages.push(entry);
    if (state.messages.length > MAX_MESSAGES) {
      state.messages.splice(0, state.messages.length - MAX_MESSAGES);
    }

    if (remote && containsMention(entry.text)) {
      playMentionSound(entry.from);
    }

    emitState();
    return true;
  }

  function publishSignal(payload) {
    if (!state.enabled || state.destroyed || !state.signalPort || !state.connectedToSignal) return false;
    try {
      state.signalPort.postMessage({
        type: 'publish',
        payload: {
          v: PROTOCOL,
          from: state.peerId,
          time: Date.now(),
          ...payload
        }
      });
      return true;
    } catch (_) {
      state.connectedToSignal = false;
      state.lastError = 'SIGNAL_SEND_FAILED';
      emitState();
      return false;
    }
  }

  function announce() {
    if (!state.enabled || !state.connectedToSignal) return false;
    refreshIdentity();
    return publishSignal({
      t: 'announce',
      name: state.username,
      uuid: state.uuid
    });
  }

  function allowInbound(senderId) {
    const id = String(senderId || '');
    if (!id) return false;
    const now = Date.now();
    const current = state.senderMessageWindows.get(id) || { times: [], blockedUntil: 0 };
    if (now < current.blockedUntil) return false;
    current.times = current.times.filter(time => now - time < 15000);
    if (current.times.length >= 8) {
      current.times.length = 0;
      current.blockedUntil = now + 20000;
      state.senderMessageWindows.set(id, current);
      return false;
    }
    current.times.push(now);
    state.senderMessageWindows.set(id, current);
    return true;
  }

  function onSignal(signal) {
    if (!state.enabled || !signal || signal.v !== PROTOCOL) return;

    const from = String(signal.from || '');
    if (!from || from === state.peerId) return;

    if (signal.t === 'announce') {
      const signalTime = Number(signal.time) || Date.now();
      if (Date.now() - signalTime > PEER_TIMEOUT) return;
      state.knownPeers.set(from, {
        peerId: from,
        username: cleanText(signal.name || 'Player', 24),
        lastSeen: Date.now()
      });
      emitState();
      return;
    }

    if (signal.t === 'chat') {
      if (!allowInbound(from)) return;
      state.knownPeers.set(from, {
        peerId: from,
        username: cleanText(signal.name || 'Player', 24),
        lastSeen: Date.now()
      });
      addMessage(signal, true);
    }
  }

  function connectSignalBridge() {
    if (!state.enabled || state.destroyed || state.signalPort) return;

    let port;
    try {
      port = chrome.runtime.connect({ name: SIGNAL_PORT });
    } catch (_) {
      state.connectedToSignal = false;
      state.lastError = 'SIGNAL_BRIDGE_UNAVAILABLE';
      emitState();
      return;
    }

    state.signalPort = port;
    state.lastError = '';

    clearInterval(state.signalHeartbeat);
    state.signalHeartbeat = window.setInterval(() => {
      try {
        port.postMessage({ type: 'ping' });
      } catch (_) {}
    }, 15000);

    port.onMessage.addListener(message => {
      if (!state.enabled || state.destroyed || !message || typeof message !== 'object') return;

      if (message.type === 'ready') {
        state.connectedToSignal = true;
        state.lastError = '';
        emitState();
        announce();
        return;
      }

      if (message.type === 'offline') {
        state.connectedToSignal = false;
        state.lastError = String(message.error || 'SIGNAL_OFFLINE');
        emitState();
        return;
      }

      if (message.type === 'signal' && message.signal) {
        onSignal(message.signal);
      }
    });

    port.onDisconnect.addListener(() => {
      if (state.signalPort === port) state.signalPort = null;
      clearInterval(state.signalHeartbeat);
      state.signalHeartbeat = 0;
      state.connectedToSignal = false;
      emitState();

      if (!state.enabled || state.destroyed) return;
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = window.setTimeout(() => {
        state.reconnectTimer = 0;
        connectSignalBridge();
      }, 1200);
    });
  }

  function cleanupPeers() {
    const now = Date.now();
    let changed = false;
    for (const [peerId, peer] of state.knownPeers) {
      if (now - Number(peer.lastSeen || 0) > PEER_TIMEOUT) {
        state.knownPeers.delete(peerId);
        changed = true;
      }
    }
    if (changed) emitState();
  }

  function start() {
    if (state.enabled && state.signalPort) return;
    state.enabled = true;
    refreshIdentity();
    connectSignalBridge();

    clearInterval(state.announceTimer);
    clearInterval(state.cleanupTimer);
    state.announceTimer = window.setInterval(announce, ANNOUNCE_INTERVAL);
    state.cleanupTimer = window.setInterval(cleanupPeers, 15000);
    emitState();
  }

  function stop() {
    state.enabled = false;
    state.connectedToSignal = false;
    state.lastError = '';

    try {
      state.signalPort?.disconnect();
    } catch (_) {}

    state.signalPort = null;
    clearInterval(state.announceTimer);
    clearInterval(state.cleanupTimer);
    clearTimeout(state.reconnectTimer);
    clearInterval(state.signalHeartbeat);
    state.announceTimer = 0;
    state.cleanupTimer = 0;
    state.reconnectTimer = 0;
    state.signalHeartbeat = 0;
    state.knownPeers.clear();
    state.senderMessageWindows.clear();
    emitState();
  }

  function canSend() {
    const now = Date.now();
    if (now < state.blockedUntil) return false;

    state.sendTimes = state.sendTimes.filter(time => now - time < 15000);

    if (state.sendTimes.length >= 5) {
      state.blockedUntil = now + 10000;
      emitState();
      return false;
    }

    const last = state.sendTimes[state.sendTimes.length - 1] || 0;
    if (now - last < 1200) return false;

    state.sendTimes.push(now);
    return true;
  }

  function sendMessage(text) {
    if (!state.enabled || !state.connectedToSignal || !canSend()) return false;

    const clean = cleanText(text);
    if (!clean) return false;

    refreshIdentity();

    const message = {
      t: 'chat',
      id: `${state.peerId}-${Date.now().toString(36)}-${randomId(5)}`,
      name: state.username,
      uuid: state.uuid,
      text: clean
    };

    const sent = publishSignal(message);
    if (!sent) return false;

    addMessage({
      v: PROTOCOL,
      from: state.peerId,
      time: Date.now(),
      ...message
    }, false);

    return true;
  }

  function onConfig(event) {
    let config;
    try {
      config = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch (_) {
      return;
    }

    if (!config || typeof config !== 'object') return;
    state.mentionSound = config.mentionSound !== false;
    if (config.enabled === true) start();
    else stop();
  }

  function onCommand(event) {
    let command;
    try {
      command = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch (_) {
      return;
    }

    if (!command || typeof command !== 'object') return;
    if (command.action === 'send') sendMessage(command.text);
    if (command.action === 'status') emitState();
    if (command.action === 'connect') start();
    if (command.action === 'disconnect') stop();
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    stop();
    clearTimeout(state.emitTimer);
    document.removeEventListener(CONFIG_EVENT, onConfig);
    document.removeEventListener(IDENTITY_EVENT, onIdentity);
    document.removeEventListener(COMMAND_EVENT, onCommand);
    delete globalThis[KEY];
  }

  state.peerId = loadPeerId();
  document.addEventListener(CONFIG_EVENT, onConfig);
  document.addEventListener(IDENTITY_EVENT, onIdentity);
  document.addEventListener(COMMAND_EVENT, onCommand);
  globalThis[KEY] = { destroy, sendMessage, state };
  requestIdentity();
  emitState();
})();
