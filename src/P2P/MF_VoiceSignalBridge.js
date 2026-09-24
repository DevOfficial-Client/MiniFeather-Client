(() => {
  'use strict';
  const REQUEST = 'minifeather:voice-signal-request';
  const EVENT = 'minifeather:voice-signal-event';
  const PORT_NAME = 'minifeather-voice-signal';
  const PREFERENCE_KEY = 'mf:voice:enabled';
  let port = null;
  let reconnectTimer = 0;
  let heartbeat = 0;
  let subscribed = false;
  let wanted = false;
  let destroyed = false;
  let recentPublishes = [];

  function onPreferenceChanged(changes, area) {
    if (destroyed || area !== 'local' || !changes?.[PREFERENCE_KEY]) return;
    emit({ type: 'preference-update', enabled: changes[PREFERENCE_KEY].newValue === true });
  }

  function emit(detail) {
    document.dispatchEvent(new CustomEvent(EVENT, { detail: JSON.stringify(detail) }));
  }

  function reconnect() {
    if (destroyed || !wanted || port || reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = 0; connect(); }, 1500);
  }

  function connect() {
    if (!wanted || destroyed || port) return;
    try { port = chrome.runtime.connect({ name: PORT_NAME }); }
    catch (_) { reconnect(); return; }
    const current = port;
    current.onMessage.addListener(message => {
      if (current !== port || !message) return;
      if (message.type === 'ready') {
        subscribed = true;
        emit({ type: 'ready' });
      } else if (message.type === 'signal' && message.signal) {
        emit({ type: 'signal', message: JSON.stringify(message.signal) });
      } else if (message.type === 'offline') {
        subscribed = false;
        emit({ type: 'error', error: String(message.error || 'SIGNAL_OFFLINE') });
        try { current.disconnect(); } catch (_) {}
      }
    });
    current.onDisconnect.addListener(() => {
      if (port !== current) return;
      port = null;
      subscribed = false;
      clearInterval(heartbeat);
      heartbeat = 0;
      emit({ type: 'offline' });
      reconnect();
    });
    heartbeat = setInterval(() => {
      try { current.postMessage({ type: 'ping' }); } catch (_) {}
    }, 15000);
  }

  function onRequest(event) {
    let request;
    try { request = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail; }
    catch (_) { return; }
    if (!request || typeof request !== 'object') return;
    if (request.type === 'preference-set' && typeof request.enabled === 'boolean') {
      try { chrome.storage?.local?.set?.({ [PREFERENCE_KEY]: request.enabled }); } catch (_) {}
    } else if (request.type === 'start') {
      wanted = true;
      if (subscribed) emit({ type: 'ready' });
      else connect();
    } else if (request.type === 'stop') {
      wanted = false;
      subscribed = false;
      clearTimeout(reconnectTimer);
      reconnectTimer = 0;
      clearInterval(heartbeat);
      heartbeat = 0;
      try { port?.disconnect(); } catch (_) {}
      port = null;
    } else if (request.type === 'publish' && wanted && subscribed && request.payload) {
      try {
        const payload = request.payload;
        if (payload.v !== 'MFVOICE1' || !['presence', 'presence-query', 'invite', 'accept', 'decline', 'busy', 'end'].includes(payload.t)) return;
        if (!/^[a-f0-9]{24}$/.test(String(payload.from || '')) || Math.abs(Date.now() - Number(payload.ts)) > 10000) return;
        const now = Date.now();
        recentPublishes = recentPublishes.filter(time => now - time < 10000);
        if (recentPublishes.length >= 12) return;
        const message = JSON.stringify(request.payload);
        if (message.length > 1200) return;
        recentPublishes.push(now);
        port.postMessage({ type: 'publish', payload: request.payload });
      } catch (_) { emit({ type: 'error', error: 'PUBLISH_FAILED' }); }
    }
  }

  document.addEventListener(REQUEST, onRequest);
  try { chrome.storage?.onChanged?.addListener?.(onPreferenceChanged); } catch (_) {}
  globalThis.__MF_VOICE_SIGNAL_BRIDGE__?.destroy?.();
  globalThis.__MF_VOICE_SIGNAL_BRIDGE__ = {
    destroy() {
      destroyed = true;
      document.removeEventListener(REQUEST, onRequest);
      try { chrome.storage?.onChanged?.removeListener?.(onPreferenceChanged); } catch (_) {}
      clearTimeout(reconnectTimer);
      clearInterval(heartbeat);
      try { port?.disconnect(); } catch (_) {}
      port = null;
    }
  };
  emit({ type: 'bridge-ready' });
  try {
    chrome.storage?.local?.get?.(PREFERENCE_KEY, data => {
      if (destroyed) return;
      const value = data?.[PREFERENCE_KEY];
      emit({ type: 'preference', known: typeof value === 'boolean', enabled: value === true });
    });
  } catch (_) {}
})();
