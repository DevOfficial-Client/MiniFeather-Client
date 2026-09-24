(() => {
  'use strict';
  let previousOptIn = false;
  try { previousOptIn = localStorage.getItem('mf:voice:enabled') === '1'; } catch (_) {}
  globalThis.MF_VoiceChat?.dispose?.();

  const REQUEST = 'minifeather:voice-signal-request';
  const EVENT = 'minifeather:voice-signal-event';
  const STORAGE = 'mf:voice:enabled';
  const VERSION = 'MFVOICE1';
  const PEERJS = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const PRESENCE_MS = 20000;
  const EXPIRE_MS = 57000;
  const INVITE_MS = 35000;
  const LOOKUP_MS = 4000;
  const createSession = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n.toString(16).padStart(2, '0')).join('');
  let session = createSession();
  const state = {
    enabled: false, disposed: false, signalReady: false, peerReady: false, activationCount: 0,
    peer: null, selfUuid: '', selfHash: '', selfName: '', identitySeenAt: 0,
    friends: new Map(), friendHashes: new Map(), friendHashJobs: new Map(), friendsByHash: new Map(),
    presence: new Map(), seenInvites: new Map(), pendingInvites: new Set(), call: null, dialing: false, localStream: null, mediaCall: null,
    audio: null, card: null, tone: null, toneTimer: 0, callTimer: 0,
    refreshTimer: 0, announceTimer: 0, bridgeProbe: 0, retryTimer: 0, message: '', messageTimer: 0,
    muted: false, lastError: '', wanted: false, preferenceLoaded: false, preferenceChanged: false, lastQueryResponseAt: 0,
    iconUrls: {}
  };

  const label = (english, spanish) => {
    const language = globalThis.MiniFeatherI18n?.getLanguage?.() || navigator.language || 'en';
    const translated = globalThis.MiniFeatherI18n?.translate?.(english);
    if (translated && translated !== english) return translated;
    return /^es\b/i.test(language) ? spanish : english;
  };
  const signal = payload => document.dispatchEvent(new CustomEvent(REQUEST, { detail: JSON.stringify(payload) }));
  const hashUuid = async uuid => {
    const input = new TextEncoder().encode(`MiniFeather voice v1:${String(uuid).toLowerCase()}`);
    const digest = await crypto.subtle.digest('SHA-256', input);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const validId = value => /^[a-f0-9]{24}$/.test(String(value || ''));
  const validHash = value => /^[a-f0-9]{64}$/.test(String(value || ''));
  function pixelIcon(kind) {
    const name = kind === 'mic' || kind === 'muted' ? kind : kind === 'dismiss' ? 'close' : 'phone';
    const icon = document.createElement('img');
    icon.dataset.mfVoiceIcon = name;
    icon.alt = '';
    icon.width = 20;
    icon.height = 20;
    icon.setAttribute('aria-hidden', 'true');
    icon.style.imageRendering = 'pixelated';
    icon.style.objectFit = 'contain';
    icon.style.flex = 'none';
    if (kind === 'end' || kind === 'reject') icon.style.transform = 'rotate(135deg)';
    if (!state.iconUrls[name]) signal({ type: 'assets-request' });
    if (state.iconUrls[name]) icon.src = state.iconUrls[name];
    else icon.style.visibility = 'hidden';
    return icon;
  }

  function ensureFriendHash(uuid) {
    if (state.friendHashes.has(uuid)) return Promise.resolve(state.friendHashes.get(uuid));
    if (state.friendHashJobs.has(uuid)) return state.friendHashJobs.get(uuid);
    const job = hashUuid(uuid).then(hash => {
      if (state.disposed || !state.friends.has(uuid)) return '';
      state.friendHashes.set(uuid, hash);
      state.friendsByHash.set(hash, uuid);
      return hash;
    }).finally(() => state.friendHashJobs.delete(uuid));
    state.friendHashJobs.set(uuid, job);
    return job;
  }

  function getGame() {
    const direct = [globalThis.miniblox, globalThis.minibloxGame, globalThis.__MINIBLOX_GAME__, globalThis.__MB?.game, globalThis.game];
    for (const game of direct) if (game?.player) return game;
    try {
      const react = document.querySelector('#react');
      if (react) for (const root of Object.values(react)) {
        const game = root?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player) return game;
      }
    } catch (_) {}
    return null;
  }

  async function refreshIdentity() {
    if (state.disposed) return;
    const player = getGame()?.player;
    const uuid = String(player?.profile?.uuid || player?.uuid || '').trim();
    const username = String(player?.profile?.username || player?.username || player?.name || '').trim().slice(0, 24);
    if (uuid) state.identitySeenAt = Date.now();
    else if (state.selfHash && Date.now() - state.identitySeenAt > 15000) {
      state.selfUuid = '';
      state.selfHash = '';
      state.selfName = '';
      state.presence.clear();
      if (state.call) end(true, label('Game session ended.', 'Sesión de juego terminada.'));
    }
    if (uuid && uuid !== state.selfUuid) {
      state.selfUuid = uuid;
      state.selfHash = await hashUuid(uuid);
      state.presence.clear();
      announce();
    }
    if (username) state.selfName = username;
    const list = globalThis.__FRIEND_NICKNAMES__?.list?.() || [];
    for (const friend of list) {
      const id = String(friend.uuid || '');
      if (!id || !friend.username || id === state.selfUuid) continue;
      state.friends.set(id, { uuid: id, username: String(friend.username), nickname: String(friend.nickname || '') });
      if (!state.friendHashes.has(id)) void ensureFriendHash(id).catch(() => {});
    }
    for (const [id, friend] of state.friends) {
      if (!list.some(item => String(item.uuid) === id)) {
        state.friends.delete(id);
        const hash = state.friendHashes.get(id);
        state.friendHashes.delete(id);
        if (hash) state.friendsByHash.delete(hash);
      }
    }
    for (const [hash, entry] of state.presence) {
      if (Date.now() - entry.seen > EXPIRE_MS) state.presence.delete(hash);
    }
    for (const [id, seen] of state.seenInvites) {
      if (Date.now() - seen > 120000) state.seenInvites.delete(id);
    }
  }

  function presenceFor(friend) {
    if (!state.enabled || !state.signalReady || !state.peerReady) return null;
    const uuid = String(friend?.uuid || '');
    const hash = state.friendHashes.get(uuid);
    const entry = hash && state.presence.get(hash);
    return entry && Date.now() - entry.seen < EXPIRE_MS && validId(entry.from) ? entry : null;
  }

  function available(friend) { return !!presenceFor(friend); }

  function publish(payload) {
    if (!state.enabled || !state.signalReady) return false;
    signal({ type: 'publish', payload: { v: VERSION, from: session, ts: Date.now(), ...payload } });
    return true;
  }

  function announce() {
    if (!state.enabled || !state.peerReady || !state.selfHash || Date.now() - state.identitySeenAt > 15000) return;
    publish({ t: 'presence', key: state.selfHash, peer: state.peer.id });
  }

  async function waitForConnection(timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (state.wanted && !state.disposed && Date.now() < deadline) {
      if (state.enabled && state.signalReady && state.peerReady && state.selfHash) return true;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
  }

  function currentCall() {
    const call = state.call;
    if (call && call.phase !== 'active' && Date.now() - call.startedAt > INVITE_MS) {
      end(true, label('Call timed out.', 'La llamada expiró.'));
      return null;
    }
    return state.call;
  }

  function showMessage(message, error = false) {
    state.message = String(message);
    if (error) state.lastError = state.message;
    render();
    clearTimeout(state.messageTimer);
    state.messageTimer = setTimeout(() => { if (!state.call) { state.message = ''; render(); } }, 6000);
  }

  function stopTone() {
    clearInterval(state.toneTimer);
    state.toneTimer = 0;
    try { state.tone?.close(); } catch (_) {}
    state.tone = null;
  }

  function ring() {
    stopTone();
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    try {
      state.tone = new AudioContext();
      const beep = () => {
        if (!state.tone || state.tone.state !== 'running') return;
        for (const offset of [0, 0.18]) {
          const osc = state.tone.createOscillator();
          const gain = state.tone.createGain();
          osc.type = 'sine';
          osc.frequency.value = 670;
          gain.gain.setValueAtTime(0.0001, state.tone.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.06, state.tone.currentTime + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, state.tone.currentTime + offset + 0.15);
          osc.connect(gain).connect(state.tone.destination);
          osc.start(state.tone.currentTime + offset);
          osc.stop(state.tone.currentTime + offset + 0.16);
        }
      };
      void state.tone.resume().then(beep).catch(() => {});
      state.toneTimer = setInterval(beep, 2800);
    } catch (_) { stopTone(); }
  }

  function ensureCard() {
    if (!document.body) return null;
    if (state.card?.isConnected) return state.card;
    const style = document.createElement('style');
    style.id = 'mf-voice-style';
    style.textContent = '#mf-voice-card{position:fixed;right:18px;bottom:18px;z-index:2147483646;width:min(300px,calc(100vw - 36px));box-sizing:border-box;padding:14px 16px;border:1px solid rgba(139,177,255,.43);border-radius:15px;background:rgba(16,21,36,.96);box-shadow:0 10px 35px #0009;color:#f5f7ff;font:13px system-ui,sans-serif;pointer-events:auto}#mf-voice-card[hidden]{display:none}#mf-voice-card .mfv-title{font-weight:700;font-size:15px;margin-bottom:5px}#mf-voice-card .mfv-status{opacity:.78;margin-bottom:11px}#mf-voice-card .mfv-actions{display:flex;gap:8px}#mf-voice-card button{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:8px;padding:7px 11px;color:#fff;background:#38445e;cursor:pointer;font:inherit}#mf-voice-card button[data-kind=accept]{background:#278654}#mf-voice-card button[data-kind=reject],#mf-voice-card button[data-kind=end]{background:#aa3449}';
    document.head?.appendChild(style);
    const card = document.createElement('div');
    card.id = 'mf-voice-card';
    card.hidden = true;
    card.addEventListener('pointerdown', event => {
      event.stopPropagation();
      if (state.audio?.paused) state.audio.play().catch(() => {});
    });
    card.addEventListener('keydown', event => event.stopPropagation());
    document.body.appendChild(card);
    state.card = card;
    return card;
  }

  function render() {
    const card = ensureCard();
    if (!card) return;
    card.replaceChildren();
    const call = state.call;
    if (!call && !state.message) { card.hidden = true; return; }
    card.hidden = false;
    const title = document.createElement('div');
    title.className = 'mfv-title';
    title.textContent = call ? `${call.incoming ? label('Incoming call', 'Llamada entrante') : label('Calling', 'Llamando a')} · ${call.name}` : 'MiniFeather Voice';
    const status = document.createElement('div');
    status.className = 'mfv-status';
    status.textContent = call ? ({ incoming: label('Answer or decline', 'Contesta o rechaza'), ringing: label('Waiting for answer…', 'Esperando respuesta…'), connecting: label('Connecting audio…', 'Conectando audio…'), active: label('In call', 'En llamada') }[call.phase] || call.phase) : state.message;
    const actions = document.createElement('div');
    actions.className = 'mfv-actions';
    const button = (kind, caption, callback) => {
      const el = document.createElement('button');
      el.dataset.kind = kind;
      el.append(pixelIcon(kind === 'mute' ? (state.muted ? 'muted' : 'mic') : kind), document.createTextNode(caption));
      el.addEventListener('click', callback);
      actions.appendChild(el);
    };
    if (call?.phase === 'incoming') {
      button('accept', label('Answer', 'Contestar'), () => { void answer(); });
      button('reject', label('Decline', 'Rechazar'), decline);
    } else if (call?.phase === 'active') {
      button('mute', state.muted ? label('Unmute', 'Activar micro') : label('Mute', 'Silenciar'), toggleMute);
      button('end', label('Hang up', 'Colgar'), () => end());
    } else if (call) {
      button('end', label('Cancel', 'Cancelar'), () => end());
    } else {
      button('dismiss', label('Close', 'Cerrar'), () => { state.message = ''; render(); });
    }
    card.append(title, status);
    if (call?.incoming) {
      const caution = document.createElement('div');
      caution.className = 'mfv-status';
      caution.textContent = label('MiniFeather identity is not verified', 'Identidad de MiniFeather no verificada');
      card.appendChild(caution);
    }
    if (call && state.message) {
      const note = document.createElement('div');
      note.className = 'mfv-status';
      note.textContent = state.message;
      card.appendChild(note);
    }
    card.appendChild(actions);
  }

  function stopMedia() {
    try { state.mediaCall?.close(); } catch (_) {}
    state.mediaCall = null;
    try { state.localStream?.getTracks().forEach(track => track.stop()); } catch (_) {}
    state.localStream = null;
    if (state.audio) {
      state.audio.pause();
      state.audio.srcObject = null;
      state.audio.remove();
      state.audio = null;
    }
    state.muted = false;
  }

  function end(notifyPeer = true, message = '') {
    const call = state.call;
    if (call && notifyPeer) publish({ t: 'end', to: call.remote, id: call.id });
    state.call = null;
    clearTimeout(state.callTimer);
    state.callTimer = 0;
    stopTone();
    stopMedia();
    if (message) showMessage(message);
    else render();
  }

  function startTimeout(call) {
    clearTimeout(state.callTimer);
    state.callTimer = setTimeout(() => {
      if (state.call === call && call.phase !== 'active') end(true, label('Call timed out.', 'La llamada expiró.'));
    }, INVITE_MS);
  }

  function friendFromIdentity(identity) {
    const key = String(identity?.uuid || identity || '').trim().toLowerCase();
    const friends = [...state.friends.values()];
    const exact = friends.find(friend => friend.uuid.toLowerCase() === key || friend.username.toLowerCase() === key);
    if (exact) return exact;
    const aliases = friends.filter(friend => friend.nickname && friend.nickname.toLowerCase() === key);
    return aliases.length === 1 ? aliases[0] : null;
  }

  async function callFriend(identity) {
    if (!state.wanted && !state.preferenceLoaded) {
      const deadline = Date.now() + 1200;
      while (!state.wanted && !state.preferenceLoaded && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!state.wanted) return { ok: false, error: label('Enable calls first: /call on', 'Activa las llamadas: /call on') };
    if (currentCall() || state.dialing) return { ok: false, error: label('A call is already in progress.', 'Ya hay una llamada en curso.') };
    state.dialing = true;
    try {
      await refreshIdentity();
      const friend = friendFromIdentity(identity);
      if (!friend) return { ok: false, error: label('Friend not found.', 'Amigo no encontrado.') };
      const hash = await ensureFriendHash(friend.uuid);
      if (!hash || !(await waitForConnection())) return { ok: false, error: label('Voice is still connecting. Try again shortly.', 'La voz aún se está conectando. Inténtalo de nuevo en un momento.') };
      let remote = presenceFor(friend);
      if (!remote) {
        publish({ t: 'presence-query', key: hash });
        const deadline = Date.now() + LOOKUP_MS;
        while (!remote && Date.now() < deadline && state.enabled && !state.disposed) {
          await new Promise(resolve => setTimeout(resolve, 200));
          remote = presenceFor(friend);
        }
      }
      if (!remote) return { ok: false, error: label('Friend is not available on MiniFeather Voice.', 'Ese amigo no está disponible en MiniFeather Voice.') };
      if (currentCall() || !state.enabled || !state.signalReady || !state.peerReady) return { ok: false, error: label('Voice is still connecting. Try again shortly.', 'La voz aún se está conectando. Inténtalo de nuevo en un momento.') };
      state.message = '';
      const id = crypto.randomUUID();
      const call = { id, remote: remote.from, peer: remote.peer, name: friend.username, phase: 'ringing', incoming: false, startedAt: Date.now() };
      state.call = call;
      render();
      startTimeout(call);
      announce();
      if (!publish({ t: 'invite', to: remote.from, id, key: hash, callerKey: state.selfHash, peer: state.peer.id })) {
        end(false);
        return { ok: false, error: label('Voice is still connecting. Try again shortly.', 'La voz aún se está conectando. Inténtalo de nuevo en un momento.') };
      }
      return { ok: true, name: friend.username };
    } finally { state.dialing = false; }
  }

  function attachMedia(media) {
    state.mediaCall = media;
    media.on('stream', stream => {
      if (!state.call || state.mediaCall !== media) return;
      clearTimeout(state.callTimer);
      state.callTimer = 0;
      state.call.phase = 'active';
      if (!state.audio) {
        state.audio = document.createElement('audio');
        state.audio.autoplay = true;
        state.audio.style.display = 'none';
        document.body?.appendChild(state.audio);
      }
      state.audio.srcObject = stream;
      state.audio.play().catch(() => showMessage(label('Click the call card to enable audio.', 'Haz clic en la tarjeta para activar el audio.')));
      for (const track of stream.getAudioTracks?.() || []) {
        track.addEventListener?.('ended', () => { if (state.mediaCall === media) end(false, label('Call ended.', 'Llamada terminada.')); }, { once: true });
      }
      const connection = media.peerConnection;
      connection?.addEventListener?.('connectionstatechange', () => {
        if (state.mediaCall === media && ['failed', 'closed'].includes(connection.connectionState)) end(false, label('Audio connection failed.', 'Falló la conexión de audio.'));
        else if (state.mediaCall === media && connection.connectionState === 'disconnected') {
          setTimeout(() => {
            if (state.mediaCall === media && connection.connectionState === 'disconnected') end(false, label('Audio connection failed.', 'Falló la conexión de audio.'));
          }, 8000);
        }
      });
      render();
    });
    media.on('close', () => { if (state.mediaCall === media) end(false, label('Call ended.', 'Llamada terminada.')); });
    media.on('error', () => { if (state.mediaCall === media) end(true, label('Audio connection failed.', 'Falló la conexión de audio.')); });
  }

  async function microphone() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('MICROPHONE_UNAVAILABLE');
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  }

  function microphoneFailure(error) {
    if (error?.name === 'NotAllowedError' && globalThis.top !== globalThis.self) {
      return label('Microphone blocked by the embedded site.', 'El sitio integrado bloqueó el micrófono.');
    }
    return label(`Microphone unavailable: ${error?.name || error}`, `Micrófono no disponible: ${error?.name || error}`);
  }

  async function answer() {
    const call = state.call;
    if (!call || call.phase !== 'incoming') return false;
    stopTone();
    call.phase = 'connecting';
    render();
    try {
      const stream = await microphone();
      if (state.call !== call) { stream.getTracks().forEach(track => track.stop()); return false; }
      state.localStream = stream;
      publish({ t: 'accept', to: call.remote, id: call.id });
      startTimeout(call);
      return true;
    } catch (error) {
      publish({ t: 'decline', to: call.remote, id: call.id });
      end(false, microphoneFailure(error));
      return false;
    }
  }

  function decline() { if (state.call?.phase === 'incoming') { publish({ t: 'decline', to: state.call.remote, id: state.call.id }); end(false); } }
  function toggleMute() {
    if (!state.localStream) return false;
    state.muted = !state.muted;
    for (const track of state.localStream.getAudioTracks()) track.enabled = !state.muted;
    render();
    return state.muted;
  }

  async function accepted(packet) {
    const call = state.call;
    if (!call || call.incoming || call.phase !== 'ringing' || packet.from !== call.remote || packet.id !== call.id) return;
    call.phase = 'connecting';
    render();
    try {
      const stream = await microphone();
      if (state.call !== call) { stream.getTracks().forEach(track => track.stop()); return; }
      state.localStream = stream;
      const media = state.peer.call(call.peer, stream, { metadata: { id: call.id, from: session } });
      if (!media) throw new Error('PEER_CALL_FAILED');
      attachMedia(media);
      startTimeout(call);
    } catch (error) {
      end(true, microphoneFailure(error));
    }
  }

  function onMedia(media) {
    const call = state.call;
    if (!call || !call.incoming || call.phase !== 'connecting' || !state.localStream || media.peer !== call.peer || media.metadata?.id !== call.id || media.metadata?.from !== call.remote) {
      try { media.close(); } catch (_) {}
      return;
    }
    attachMedia(media);
    try { media.answer(state.localStream); }
    catch (_) { end(true, label('Could not answer the call.', 'No se pudo contestar.')); }
  }

  async function incomingInvite(packet) {
    if (state.seenInvites.has(packet.id) || state.pendingInvites.has(packet.id)) return;
    state.pendingInvites.add(packet.id);
    try {
      await refreshIdentity();
      const senderPresence = [...state.presence].find(([, entry]) => entry.from === packet.from && entry.peer === packet.peer);
      if (senderPresence && validHash(packet.callerKey) && senderPresence[0] !== packet.callerKey) return;
      const callerHash = validHash(packet.callerKey) ? packet.callerKey : senderPresence?.[0];
      if (!callerHash) return;
      let friendUuid = state.friendsByHash.get(callerHash);
      if (!friendUuid) {
        await Promise.all([...state.friends.keys()].map(id => ensureFriendHash(id).catch(() => '')));
        friendUuid = state.friendsByHash.get(callerHash);
      }
      const friend = friendUuid && state.friends.get(friendUuid);
      if (!friend || !state.enabled || state.disposed) return;
      state.seenInvites.set(packet.id, Date.now());
      if (currentCall()) { publish({ t: 'busy', to: packet.from, id: packet.id }); return; }
      state.message = '';
      const call = { id: packet.id, remote: packet.from, peer: packet.peer, name: friend.username, phase: 'incoming', incoming: true, startedAt: Date.now() };
      state.call = call;
      render();
      ring();
      startTimeout(call);
    } finally { state.pendingInvites.delete(packet.id); }
  }

  function onSignalEvent(event) {
    let detail;
    try { detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail; } catch (_) { return; }
    if (!detail) return;
    if (detail.type === 'assets') {
      for (const name of ['phone', 'mic', 'muted', 'close']) {
        const url = detail.icons?.[name];
        if (typeof url === 'string' && new RegExp(`^chrome-extension://[a-p]{32}/assets/voice/${name}\\.png$`).test(url)) state.iconUrls[name] = url;
      }
      for (const icon of document.querySelectorAll?.('img[data-mf-voice-icon]') || []) {
        const url = state.iconUrls[icon.dataset.mfVoiceIcon];
        if (url) { icon.src = url; icon.style.visibility = ''; }
      }
      return;
    }
    if (detail.type === 'preference' || detail.type === 'preference-update') {
      state.preferenceLoaded = true;
      if (detail.type === 'preference' && state.preferenceChanged) return;
      if (detail.type === 'preference' && !detail.known) {
        if (state.wanted) signal({ type: 'preference-set', enabled: true });
        return;
      }
      state.wanted = !!detail.enabled;
      try { localStorage.setItem(STORAGE, state.wanted ? '1' : '0'); } catch (_) {}
      if (state.wanted && !state.enabled) void enable(false);
      else if (!state.wanted && state.enabled) disable(false);
      return;
    }
    if (!state.enabled) return;
    if (detail.type === 'bridge-ready') { signal({ type: 'start' }); return; }
    if (detail.type === 'ready') { state.signalReady = true; state.lastError = ''; announce(); return; }
    if (detail.type === 'offline' || detail.type === 'error') {
      state.signalReady = false;
      if (detail.type === 'error') state.lastError = detail.error || 'SIGNAL_OFFLINE';
      if (detail.error === 'PUBLISH_FAILED' && state.call?.phase !== 'active' && state.call) {
        end(false, label('Voice is still connecting. Try again shortly.', 'La voz aún se está conectando. Inténtalo de nuevo en un momento.'));
      }
      return;
    }
    if (detail.type !== 'signal') return;
    let packet;
    try { packet = JSON.parse(detail.message); } catch (_) { return; }
    if (packet?.v !== VERSION || !validId(packet.from) || packet.from === session || Math.abs(Date.now() - Number(packet.ts)) > 65000) return;
    if (packet.t === 'presence') {
      if (!validHash(packet.key) || !/^mfvoice-[a-f0-9]{24}$/.test(String(packet.peer || ''))) return;
      state.presence.delete(packet.key);
      state.presence.set(packet.key, { from: packet.from, peer: packet.peer, seen: Date.now() });
      if (state.presence.size > 512) state.presence.delete(state.presence.keys().next().value);
      return;
    }
    if (packet.t === 'presence-query') {
      if (validHash(packet.key) && packet.key === state.selfHash && Date.now() - state.lastQueryResponseAt > 1500) {
        state.lastQueryResponseAt = Date.now();
        announce();
      }
      return;
    }
    if (packet.to !== session || typeof packet.id !== 'string' || packet.id.length > 64) return;
    if (packet.t === 'invite') {
      if (!validHash(packet.key) || packet.key !== state.selfHash || !/^mfvoice-[a-f0-9]{24}$/.test(String(packet.peer || ''))) return;
      void incomingInvite(packet).catch(() => {});
      return;
    }
    const call = state.call;
    if (!call || packet.from !== call.remote || packet.id !== call.id) return;
    if (packet.t === 'accept') { void accepted(packet); return; }
    if (packet.t === 'decline' || packet.t === 'busy' || packet.t === 'end') {
      const message = packet.t === 'decline' ? label('Call declined.', 'Llamada rechazada.') : packet.t === 'busy' ? label('Friend is busy.', 'El amigo está ocupado.') : label('Call ended.', 'Llamada terminada.');
      end(false, message);
    }
  }

  async function loadPeer() {
    if (globalThis.Peer) return true;
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = PEERJS;
      const timer = setTimeout(() => { script.remove(); resolve(false); }, 15000);
      script.onload = () => { clearTimeout(timer); resolve(!!globalThis.Peer); };
      script.onerror = () => { clearTimeout(timer); resolve(false); };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  async function enable(persist = true) {
    state.wanted = true;
    if (persist) {
      state.preferenceChanged = true;
      try { localStorage.setItem(STORAGE, '1'); } catch (_) {}
      signal({ type: 'preference-set', enabled: true });
    }
    if (state.enabled) return { ok: true };
    if (state.activationCount++) {
      session = createSession();
      state.presence.clear();
      state.seenInvites.clear();
    }
    state.enabled = true;
    signal({ type: 'start' });
    await refreshIdentity();
    if (!(await loadPeer())) {
      disable(false);
      state.lastError = label('Could not load PeerJS.', 'No se pudo cargar PeerJS.');
      return { ok: false, error: state.lastError };
    }
    if (!state.enabled || state.disposed) return { ok: false, error: 'STOPPED' };
    try {
      const peer = new globalThis.Peer(`mfvoice-${session}`, { debug: 0 });
      state.peer = peer;
      peer.on('open', () => { if (state.peer !== peer || !state.enabled) return; state.peerReady = true; state.lastError = ''; announce(); });
      peer.on('call', media => { if (state.peer === peer && state.enabled) onMedia(media); else try { media.close(); } catch (_) {} });
      peer.on('disconnected', () => { if (state.peer !== peer || !state.enabled) return; state.peerReady = false; try { peer.reconnect(); } catch (_) {} });
      peer.on('error', error => { if (state.peer === peer && state.enabled) state.lastError = String(error?.message || error?.type || error); });
    } catch (error) {
      disable(false);
      state.lastError = String(error?.message || error);
      return { ok: false, error: state.lastError };
    }
    state.refreshTimer = setInterval(() => { void refreshIdentity(); }, 5000);
    state.announceTimer = setInterval(announce, PRESENCE_MS);
    state.bridgeProbe = setInterval(() => { if (!state.signalReady) signal({ type: 'start' }); }, 4000);
    return { ok: true };
  }

  function disable(persist = true) {
    if (persist) {
      state.wanted = false;
      state.preferenceChanged = true;
      try { localStorage.setItem(STORAGE, '0'); } catch (_) {}
      signal({ type: 'preference-set', enabled: false });
    }
    end(true);
    state.enabled = false;
    state.signalReady = false;
    state.peerReady = false;
    state.presence.clear();
    state.pendingInvites.clear();
    clearInterval(state.refreshTimer);
    clearInterval(state.announceTimer);
    clearInterval(state.bridgeProbe);
    try { state.peer?.destroy(); } catch (_) {}
    state.peer = null;
    signal({ type: 'stop' });
  }

  function status() {
    return { enabled: state.enabled, wanted: state.wanted, signal: state.signalReady, peer: state.peerReady,
      identity: !!state.selfHash, knownFriends: state.friends.size, hashedFriends: state.friendHashes.size,
      receivedPresence: [...state.friendHashes.values()].filter(hash => state.presence.has(hash)).length,
      availableFriends: [...state.friends.values()].filter(available).map(friend => friend.username),
      call: state.call ? { name: state.call.name, phase: state.call.phase } : null, lastError: state.lastError };
  }

  function dispose() {
    if (state.disposed) return;
    disable(false);
    state.disposed = true;
    clearInterval(state.retryTimer);
    document.removeEventListener(EVENT, onSignalEvent);
    clearTimeout(state.messageTimer);
    state.card?.remove();
    document.getElementById('mf-voice-style')?.remove();
  }

  document.addEventListener(EVENT, onSignalEvent);
  globalThis.MF_VoiceChat = { enable, disable, call: callFriend, answer, decline, end, mute: toggleMute, available, status, pixelIcon, dispose };
  signal({ type: 'assets-request' });
  try { if (previousOptIn || localStorage.getItem(STORAGE) === '1') { state.wanted = true; setTimeout(() => { if (state.wanted && !state.disposed) void enable(false); }, 800); } } catch (_) {}
  state.retryTimer = setInterval(() => {
    if (state.disposed) return;
    if (state.wanted && !state.enabled) void enable(false);
    else if (state.enabled && !state.peerReady) { try { state.peer?.reconnect(); } catch (_) {} }
  }, 5000);
})();
