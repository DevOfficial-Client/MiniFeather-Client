(function () {
  'use strict';


  const REQUEST_EVENT = 'minifeather:localgames-signal-request';
  const RESPONSE_EVENT = 'minifeather:localgames-signal-response';
  const PORT_NAME = 'minifeather-localgames-network';
  const PREFIX = 'mflg';

  let port = null;
  let reconnectTimer = 0;
  let heartbeat = 0;
  let destroyed = false;
  const topics = new Map();
  const wireToRaw = new Map();
  const pendingPublishes = new Map();

  function safeTopic(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  }

  function wireTopic(raw) {
    return `${PREFIX}${safeTopic(raw)}`;
  }

  function dispatchResponse(requestId, ok, payload = {}) {
    document.dispatchEvent(new CustomEvent(RESPONSE_EVENT, {
      detail: JSON.stringify({ requestId, ok, ...payload })
    }));
  }

  function ensureTopic(rawTopic, since = '30s') {
    const raw = safeTopic(rawTopic);
    if (!raw) return null;

    let entry = topics.get(raw);
    if (!entry) {
      const wire = wireTopic(raw);
      entry = {
        raw,
        wire,
        since: String(since || '30s'),
        subscribed: false,
        requested: false,
        buffer: [],
        polls: []
      };
      topics.set(raw, entry);
      wireToRaw.set(wire, raw);
    }

    if (port && !entry.requested) {
      entry.requested = true;
      try {
        port.postMessage({ type: 'subscribe', topic: entry.wire, since: entry.since });
      } catch (_) {
        entry.requested = false;
      }
    }

    return entry;
  }

  function drain(entry) {
    const messages = entry.buffer.splice(0, entry.buffer.length);
    return messages;
  }

  function resolvePoll(entry, poll) {
    clearTimeout(poll.timer);
    dispatchResponse(poll.requestId, true, { messages: drain(entry) });
  }

  function flushPolls(entry, delay = 0) {
    if (!entry.polls.length) return;
    window.setTimeout(() => {
      if (destroyed) return;
      const polls = entry.polls.splice(0, entry.polls.length);
      polls.forEach(poll => resolvePoll(entry, poll));
    }, delay);
  }

  function connect() {
    if (destroyed || port) return;

    try {
      port = chrome.runtime.connect({ name: PORT_NAME });
    } catch (_) {
      scheduleReconnect();
      return;
    }

    clearInterval(heartbeat);
    heartbeat = window.setInterval(() => {
      try { port?.postMessage({ type: 'ping' }); } catch (_) {}
    }, 15000);

    port.onMessage.addListener(message => {
      if (!message || typeof message !== 'object') return;

      if (message.type === 'subscribed') {
        const raw = wireToRaw.get(String(message.topic || ''));
        const entry = raw ? topics.get(raw) : null;
        if (!entry) return;
        entry.subscribed = true;
        entry.requested = true;
        flushPolls(entry, 180);
        return;
      }

      if (message.type === 'event') {
        const raw = wireToRaw.get(String(message.topic || ''));
        const entry = raw ? topics.get(raw) : null;
        if (!entry) return;
        entry.buffer.push({
          id: String(message.id || ''),
          message: String(message.message || '')
        });
        if (entry.buffer.length > 400) {
          entry.buffer.splice(0, entry.buffer.length - 400);
        }
        if (entry.polls.length && entry.subscribed) flushPolls(entry, 30);
        return;
      }

      if (message.type === 'published') {
        const requestId = String(message.requestId || '');
        if (!pendingPublishes.has(requestId)) return;
        pendingPublishes.delete(requestId);
        dispatchResponse(requestId, message.ok === true, message.ok === true ? {} : {
          error: String(message.error || 'SIGNAL_FAILED')
        });
      }
    });

    port.onDisconnect.addListener(() => {
      port = null;
      clearInterval(heartbeat);
      heartbeat = 0;
      for (const entry of topics.values()) {
        entry.subscribed = false;
        entry.requested = false;
      }
      if (!destroyed) scheduleReconnect();
    });

    for (const entry of topics.values()) {
      entry.requested = false;
      ensureTopic(entry.raw, entry.since);
    }
  }

  function scheduleReconnect() {
    if (destroyed || reconnectTimer) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0;
      connect();
    }, 1200);
  }

  function onRequest(event) {
    let request = event.detail;
    if (typeof request === 'string') {
      try { request = JSON.parse(request); } catch (_) { return; }
    }

    if (!request || !request.requestId) return;
    connect();

    if (request.action === 'publish') {
      const raw = safeTopic(request.topic);
      if (!raw) {
        dispatchResponse(request.requestId, false, { error: 'INVALID_TOPIC' });
        return;
      }

      const requestId = String(request.requestId);
      pendingPublishes.set(requestId, true);
      try {
        port?.postMessage({
          type: 'publish',
          requestId,
          topic: wireTopic(raw),
          message: String(request.message || '')
        });
      } catch (_) {
        pendingPublishes.delete(requestId);
        dispatchResponse(requestId, false, { error: 'SIGNAL_BRIDGE_OFFLINE' });
      }
      return;
    }

    if (request.action === 'poll') {
      const entry = ensureTopic(request.topic, request.since || '30s');
      if (!entry) {
        dispatchResponse(request.requestId, false, { error: 'INVALID_TOPIC' });
        return;
      }

      if (entry.subscribed) {
        dispatchResponse(request.requestId, true, { messages: drain(entry) });
        return;
      }

      const poll = {
        requestId: String(request.requestId),
        timer: window.setTimeout(() => {
          const index = entry.polls.indexOf(poll);
          if (index >= 0) entry.polls.splice(index, 1);
          dispatchResponse(poll.requestId, true, { messages: drain(entry) });
        }, 1200)
      };
      entry.polls.push(poll);
      return;
    }

    dispatchResponse(request.requestId, false, { error: 'UNKNOWN_ACTION' });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener(REQUEST_EVENT, onRequest);
    clearTimeout(reconnectTimer);
    clearInterval(heartbeat);
    for (const entry of topics.values()) {
      for (const poll of entry.polls) clearTimeout(poll.timer);
    }
    topics.clear();
    wireToRaw.clear();
    pendingPublishes.clear();
    try { port?.disconnect(); } catch (_) {}
    port = null;
  }

  document.addEventListener(REQUEST_EVENT, onRequest);
  globalThis.__MINIFEATHER_LOCALGAMES_NETWORK_BRIDGE__?.destroy?.();
  globalThis.__MINIFEATHER_LOCALGAMES_NETWORK_BRIDGE__ = { destroy };
  connect();
})();
