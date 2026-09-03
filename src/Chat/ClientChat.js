(function () {
  'use strict';

  if (window.top !== window.self) return;

  const KEY = '__MINIFEATHER_CLIENT_CHAT__';
  const CONFIG_EVENT = 'minifeather:client-chat-config';
  const COMMAND_EVENT = 'minifeather:client-chat-command';
  const STATE_EVENT = 'minifeather:client-chat-state';
  const IDENTITY_REQUEST_EVENT = 'minifeather:client-chat-identity-request';
  const IDENTITY_EVENT = 'minifeather:client-chat-identity';
  const PROTOCOL = 'MFCC1';
  const SIGNAL_URL = 'https://ntfy.sh/mfcc-7f41c6d8b92e4a63b5f1-global-v1';
  const SIGNAL_PORT = 'minifeather-client-chat-signal';
  const ICE_SERVERS = Object.freeze([
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]);
  const MAX_CONNECTIONS = 16;
  const MAX_MESSAGES = 100;
  const MAX_TEXT = 240;
  const ANNOUNCE_INTERVAL = 20000;
  const PEER_TIMEOUT = 90000;

  try {
    globalThis[KEY]?.destroy?.();
  } catch (_) {}

  const state = {
    enabled: false,
    mentionSound: true,
    peerId: '',
    username: 'Player',
    uuid: '',
    peers: new Map(),
    knownPeers: new Map(),
    messages: [],
    seenMessages: new Set(),
    signalPort: null,
    announceTimer: 0,
    cleanupTimer: 0,
    emitTimer: 0,
    reconnectTimer: 0,
    signalHeartbeat: 0,
    connectedToSignal: false,
    destroyed: false,
    sendTimes: [],
    blockedUntil: 0,
    lastMentionSound: 0,
    senderMentionTimes: new Map()
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
    try { identity = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail; } catch (_) { return; }
    if (!identity || typeof identity !== 'object') return;
    const name = cleanText(identity.username || '', 24);
    const uuid = String(identity.uuid || '').trim();
    let changed = false;
    if (name && name !== state.username) { state.username = name; changed = true; }
    if (uuid && uuid !== state.uuid) { state.uuid = uuid; changed = true; }
    if (changed) {
      emitState();
      if (state.enabled && state.connectedToSignal) {
        void publishSignal({ t: 'announce', name: state.username, uuid: state.uuid });
      }
    }
  }

  function cleanText(value, max = MAX_TEXT) {
    return String(value || '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function emitState() {
    clearTimeout(state.emitTimer);
    state.emitTimer = window.setTimeout(() => {
      state.emitTimer = 0;
      if (state.destroyed) return;
      refreshIdentity();
      const connectedPeers = [...state.peers.values()].filter(peer => peer.channel?.readyState === 'open').length;
      document.dispatchEvent(new CustomEvent(STATE_EVENT, {
        detail: JSON.stringify({
          enabled: state.enabled,
          connected: state.connectedToSignal,
          signaling: state.connectedToSignal,
          peers: connectedPeers,
          ready: state.enabled && state.connectedToSignal,
          online: connectedPeers + (state.enabled ? 1 : 0),
          username: state.username,
          messages: state.messages.slice(-MAX_MESSAGES),
          blockedUntil: state.blockedUntil
        })
      }));
    }, 20);
  }

  async function publishSignal(payload) {
    if (!state.enabled || state.destroyed || !state.signalPort || !state.connectedToSignal) return false;
    try {
      state.signalPort.postMessage({
        type: 'publish',
        payload: {
          v: PROTOCOL,
          from: state.peerId,
          ...payload
        }
      });
      return true;
    } catch (_) {
      state.connectedToSignal = false;
      emitState();
      return false;
    }
  }

  function waitForIce(pc, timeout = 5000) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        pc.removeEventListener('icegatheringstatechange', onChange);
        clearTimeout(timer);
        resolve();
      };
      const onChange = () => {
        if (pc.iceGatheringState === 'complete') finish();
      };
      const timer = window.setTimeout(finish, timeout);
      pc.addEventListener('icegatheringstatechange', onChange);
    });
  }

  function closePeer(peerId) {
    const peer = state.peers.get(peerId);
    if (!peer) return;
    state.peers.delete(peerId);
    try { peer.channel?.close(); } catch (_) {}
    try { peer.pc?.close(); } catch (_) {}
    emitState();
  }

  function sendChannel(channel, payload) {
    if (channel?.readyState !== 'open') return false;
    try {
      channel.send(JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function broadcast(payload, exceptPeerId = '') {
    for (const [peerId, peer] of state.peers) {
      if (peerId === exceptPeerId) continue;
      sendChannel(peer.channel, payload);
    }
  }

  function rememberMessage(id) {
    if (!id || state.seenMessages.has(id)) return false;
    state.seenMessages.add(id);
    if (state.seenMessages.size > 600) {
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
    if (!message || !rememberMessage(message.id)) return false;
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
    if (state.messages.length > MAX_MESSAGES) state.messages.splice(0, state.messages.length - MAX_MESSAGES);
    if (remote && containsMention(entry.text)) playMentionSound(entry.from);
    emitState();
    return true;
  }

  function allowInbound(peerId) {
    const peer = state.peers.get(peerId);
    if (!peer) return false;
    const now = Date.now();
    if (now < Number(peer.inboundBlockedUntil || 0)) return false;
    peer.inboundTimes = (peer.inboundTimes || []).filter(time => now - time < 15000);
    if (peer.inboundTimes.length >= 8) {
      peer.inboundBlockedUntil = now + 20000;
      peer.inboundTimes.length = 0;
      return false;
    }
    peer.inboundTimes.push(now);
    return true;
  }

  function onPeerMessage(peerId, event) {
    let data;
    try { data = JSON.parse(String(event.data || '')); } catch (_) { return; }
    if (!data || data.v !== PROTOCOL) return;

    if (data.t === 'hello') {
      const peer = state.peers.get(peerId);
      if (peer) {
        peer.username = cleanText(data.name || peer.username || 'Player', 24);
        peer.lastSeen = Date.now();
      }
      emitState();
      return;
    }

    if (data.t !== 'chat' || !allowInbound(peerId)) return;
    if (!addMessage(data, true)) return;
    broadcast(data, peerId);
  }

  function bindChannel(peerId, channel) {
    const peer = state.peers.get(peerId);
    if (!peer) return;
    peer.channel = channel;
    channel.addEventListener('open', () => {
      peer.lastSeen = Date.now();
      sendChannel(channel, {
        v: PROTOCOL,
        t: 'hello',
        from: state.peerId,
        name: state.username,
        uuid: state.uuid
      });
      emitState();
    });
    channel.addEventListener('message', event => onPeerMessage(peerId, event));
    channel.addEventListener('close', () => closePeer(peerId));
    channel.addEventListener('error', () => closePeer(peerId));
  }

  function createPeer(peerId, username = '') {
    if (!state.enabled || !peerId || peerId === state.peerId) return null;
    const existing = state.peers.get(peerId);
    if (existing) return existing;
    if (state.peers.size >= MAX_CONNECTIONS) return null;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = {
      peerId,
      username: cleanText(username || 'Player', 24),
      pc,
      channel: null,
      lastSeen: Date.now(),
      negotiating: false,
      inboundTimes: [],
      inboundBlockedUntil: 0
    };
    state.peers.set(peerId, peer);

    pc.addEventListener('datachannel', event => bindChannel(peerId, event.channel));
    pc.addEventListener('connectionstatechange', () => {
      if (['failed', 'closed'].includes(pc.connectionState)) closePeer(peerId);
      if (pc.connectionState === 'disconnected') {
        window.setTimeout(() => {
          const current = state.peers.get(peerId);
          if (current?.pc?.connectionState === 'disconnected') closePeer(peerId);
        }, 5000);
      }
      emitState();
    });

    emitState();
    return peer;
  }

  async function offerPeer(peerId) {
    const known = state.knownPeers.get(peerId);
    const peer = createPeer(peerId, known?.username || '');
    if (!peer || peer.negotiating || peer.pc.signalingState !== 'stable') return;
    peer.negotiating = true;
    try {
      const channel = peer.pc.createDataChannel('mf-client-chat', { ordered: true });
      bindChannel(peerId, channel);
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      await waitForIce(peer.pc);
      await publishSignal({
        t: 'offer',
        to: peerId,
        name: state.username,
        sdp: peer.pc.localDescription?.sdp || ''
      });
    } catch (_) {
      closePeer(peerId);
    } finally {
      const current = state.peers.get(peerId);
      if (current) current.negotiating = false;
    }
  }

  async function acceptOffer(signal) {
    const peerId = String(signal.from || '');
    if (!peerId || peerId === state.peerId) return;
    closePeer(peerId);
    const peer = createPeer(peerId, signal.name || '');
    if (!peer) return;
    peer.negotiating = true;
    try {
      await peer.pc.setRemoteDescription({ type: 'offer', sdp: String(signal.sdp || '') });
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      await waitForIce(peer.pc);
      await publishSignal({
        t: 'answer',
        to: peerId,
        name: state.username,
        sdp: peer.pc.localDescription?.sdp || ''
      });
    } catch (_) {
      closePeer(peerId);
    } finally {
      const current = state.peers.get(peerId);
      if (current) current.negotiating = false;
    }
  }

  async function acceptAnswer(signal) {
    const peerId = String(signal.from || '');
    const peer = state.peers.get(peerId);
    if (!peer || peer.pc.signalingState !== 'have-local-offer') return;
    try {
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: String(signal.sdp || '') });
      peer.lastSeen = Date.now();
    } catch (_) {
      closePeer(peerId);
    }
  }

  function onSignal(signal) {
    if (!state.enabled || !signal || signal.v !== PROTOCOL) return;
    const from = String(signal.from || '');
    if (!from || from === state.peerId) return;
    if (signal.to && String(signal.to) !== state.peerId) return;

    if (signal.t === 'announce') {
      const previousKnown = state.knownPeers.get(from);
      state.knownPeers.set(from, {
        peerId: from,
        username: cleanText(signal.name || 'Player', 24),
        lastSeen: Date.now(),
        replied: previousKnown?.replied === true
      });
      const peer = state.peers.get(from);
      if (peer) {
        peer.lastSeen = Date.now();
        if (signal.name) peer.username = cleanText(signal.name, 24);
      } else if (state.peerId < from && state.peers.size < MAX_CONNECTIONS) {
        void offerPeer(from);
      } else if (state.peerId > from && !state.knownPeers.get(from)?.replied) {
        const known = state.knownPeers.get(from);
        if (known) known.replied = true;
        void publishSignal({ t: 'announce', name: state.username, uuid: state.uuid });
      }
      emitState();
      return;
    }

    if (signal.t === 'offer') {
      void acceptOffer(signal);
      return;
    }

    if (signal.t === 'answer') {
      void acceptAnswer(signal);
    }
  }

  function connectSignalBridge() {
    if (!state.enabled || state.destroyed || state.signalPort) return;
    let port;
    try {
      port = chrome.runtime.connect({ name: SIGNAL_PORT });
    } catch (_) {
      state.connectedToSignal = false;
      emitState();
      return;
    }

    state.signalPort = port;
    clearInterval(state.signalHeartbeat);
    state.signalHeartbeat = window.setInterval(() => {
      try { port.postMessage({ type: 'ping' }); } catch (_) {}
    }, 15000);

    port.onMessage.addListener(message => {
      if (!state.enabled || state.destroyed || !message || typeof message !== 'object') return;

      if (message.type === 'ready') {
        state.connectedToSignal = true;
        emitState();
        refreshIdentity();
        void publishSignal({ t: 'announce', name: state.username, uuid: state.uuid });
        return;
      }

      if (message.type === 'offline') {
        state.connectedToSignal = false;
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
      }, 1500);
    });
  }

  function cleanupPeers() {
    const now = Date.now();
    for (const [peerId, known] of state.knownPeers) {
      if (now - known.lastSeen > PEER_TIMEOUT) state.knownPeers.delete(peerId);
    }
    for (const [peerId, peer] of state.peers) {
      if (peer.channel?.readyState === 'open') continue;
      if (now - peer.lastSeen > PEER_TIMEOUT) closePeer(peerId);
    }
  }

  function start() {
    if (state.enabled && state.signalPort) return;
    state.enabled = true;
    refreshIdentity();
    connectSignalBridge();
    clearInterval(state.announceTimer);
    clearInterval(state.cleanupTimer);
    state.announceTimer = window.setInterval(() => {
      refreshIdentity();
      void publishSignal({ t: 'announce', name: state.username, uuid: state.uuid });
    }, ANNOUNCE_INTERVAL);
    state.cleanupTimer = window.setInterval(cleanupPeers, 30000);
    emitState();
  }

  function stop() {
    state.enabled = false;
    state.connectedToSignal = false;
    try { state.signalPort?.disconnect(); } catch (_) {}
    state.signalPort = null;
    clearInterval(state.announceTimer);
    clearInterval(state.cleanupTimer);
    clearTimeout(state.reconnectTimer);
    clearInterval(state.signalHeartbeat);
    state.announceTimer = 0;
    state.cleanupTimer = 0;
    state.reconnectTimer = 0;
    state.signalHeartbeat = 0;
    for (const peerId of [...state.peers.keys()]) closePeer(peerId);
    state.knownPeers.clear();
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
    if (!state.enabled || !canSend()) return false;
    const clean = cleanText(text);
    if (!clean) return false;
    refreshIdentity();
    const message = {
      v: PROTOCOL,
      t: 'chat',
      id: `${state.peerId}-${Date.now().toString(36)}-${randomId(5)}`,
      from: state.peerId,
      name: state.username,
      text: clean,
      time: Date.now()
    };
    addMessage(message, false);
    broadcast(message);
    return true;
  }

  function onConfig(event) {
    let config;
    try { config = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail; } catch (_) { return; }
    if (!config || typeof config !== 'object') return;
    state.mentionSound = config.mentionSound !== false;
    if (config.enabled === true) start();
    else stop();
  }

  function onCommand(event) {
    let command;
    try { command = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail; } catch (_) { return; }
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
