const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../src/P2P/MF_VoiceChat.js'), 'utf8');
const translationSource = fs.readFileSync(path.join(__dirname, '../src/I18n/VoiceTranslations.js'), 'utf8');
const REQUEST = 'minifeather:voice-signal-request';
const EVENT = 'minifeather:voice-signal-event';

test('voice interface has entries for every MiniFeather language', () => {
  let entries;
  const sandbox = { MiniFeatherI18n: { register(value) { entries = value; } } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(translationSource, sandbox);
  const languages = ['en', 'es', 'ja', 'it', 'zh', 'fr', 'de', 'pt', 'ru', 'ko'];
  assert.ok(Object.keys(entries).length >= 20);
  for (const [key, variants] of Object.entries(entries)) {
    for (const language of languages) assert.ok(variants[language], `${key} missing ${language}`);
  }
});

test('voice invites require a friend with live MiniFeather presence, and media waits for acceptance', async () => {
  const peers = new Map();
  const clients = [];
  const streams = [];
  const published = [];
  const mediaPairs = [];
  class FakeEvent {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  }
  class MediaCall {
    constructor(peer, metadata) {
      this.peer = peer; this.metadata = metadata; this.handlers = new Map(); this.closed = false;
      const listeners = new Map();
      this.peerConnection = { connectionState: 'connected', addEventListener(type, fn) { listeners.set(type, fn); },
        setState(value) { this.connectionState = value; listeners.get('connectionstatechange')?.(); } };
    }
    on(type, callback) { this.handlers.set(type, callback); }
    emit(type, value) { this.handlers.get(type)?.(value); }
    answer(stream) {
      this.stream = stream;
      queueMicrotask(() => {
        if (this.closed || this.other.closed) return;
        this.emit('stream', this.other.stream);
        this.other.emit('stream', stream);
      });
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.other.closed = true;
      this.emit('close');
      this.other.emit('close');
    }
  }
  class Peer {
    constructor(id) { this.id = id; this.handlers = new Map(); peers.set(id, this); queueMicrotask(() => this.emit('open')); }
    on(type, callback) { this.handlers.set(type, callback); }
    emit(type, value) { this.handlers.get(type)?.(value); }
    call(id, stream, options) {
      const remote = peers.get(id);
      assert.ok(remote, 'callee PeerJS node exists');
      const outgoing = new MediaCall(id, options.metadata);
      const incoming = new MediaCall(this.id, options.metadata);
      outgoing.other = incoming;
      incoming.other = outgoing;
      outgoing.stream = stream;
      mediaPairs.push({ outgoing, incoming });
      queueMicrotask(() => remote.emit('call', incoming));
      return outgoing;
    }
    destroy() { peers.delete(this.id); }
    reconnect() {}
  }

  function client(name, uuid, friendName, friendUuid, initialOptIn = false) {
    const listeners = new Map();
    const intervals = new Map();
    const stored = new Map();
    const elements = [];
    if (initialOptIn) stored.set('mf:voice:enabled', '1');
    let nextTimer = 1;
    let denyMicrophone = false;
    let clockOffset = 0;
    const document = {
      body: null,
      addEventListener(type, callback) { listeners.set(type, callback); },
      removeEventListener(type) { listeners.delete(type); },
      dispatchEvent(event) {
        if (event.type === REQUEST) {
          const request = JSON.parse(event.detail);
          if (request.type === 'start') queueMicrotask(() => emit({ type: 'ready' }));
          if (request.type === 'publish') { published.push(request.payload); queueMicrotask(() => {
            for (const receiver of clients) receiver.emit({ type: 'signal', message: JSON.stringify(request.payload) });
          }); }
        }
        listeners.get(event.type)?.(event);
      },
      querySelector() { return null; },
      querySelectorAll(selector) { return selector === 'img[data-mf-voice-icon]' ? elements.filter(element => element.dataset.mfVoiceIcon) : []; },
      getElementById() { return null; },
      createElement(tag) { const element = { tag, style: {}, dataset: {}, setAttribute() {}, play: () => Promise.resolve(), pause() {}, remove() {} }; elements.push(element); return element; }
    };
    const emit = detail => document.dispatchEvent(new FakeEvent(EVENT, { detail: JSON.stringify(detail) }));
    const sandbox = {
      Peer, document, CustomEvent: FakeEvent, crypto: webcrypto, TextEncoder,
      navigator: { language: 'es', mediaDevices: { getUserMedia: async () => {
        if (denyMicrophone) {
          const error = new Error('permission denied');
          error.name = 'NotAllowedError';
          throw error;
        }
        const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
        const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
        streams.push({ name, track });
        return stream;
      } } },
      miniblox: { player: { profile: { username: name, uuid } } },
      __FRIEND_NICKNAMES__: { list: () => [{ username: friendName, uuid: friendUuid }] },
      localStorage: { getItem: key => stored.get(key) ?? null, setItem(key, value) { stored.set(key, String(value)); } },
      Date: class extends Date { static now() { return Date.now() + clockOffset; } },
      setInterval(fn, ms) { const id = nextTimer++; intervals.set(id, { fn, ms }); return id; },
      clearInterval(id) { intervals.delete(id); },
      setTimeout(fn, ms) { return ms === 200 ? setTimeout(fn, ms) : nextTimer++; }, clearTimeout() {},
      console
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(source, sandbox, { filename: 'MF_VoiceChat.js' });
    const instance = { api: sandbox.MF_VoiceChat, emit, stored, setDeny(value) { denyMicrophone = value; },
      advanceTime(ms) { clockOffset += ms; }, tick(ms) { for (const timer of intervals.values()) if (timer.ms === ms) timer.fn(); },
      reload() { vm.runInNewContext(source, sandbox, { filename: 'MF_VoiceChat.js' }); this.api = sandbox.MF_VoiceChat; } };
    clients.push(instance);
    emit({ type: 'preference', known: false, enabled: false });
    return instance;
  }

  const alice = client('Alice', 'uuid-alice', 'Bob', 'uuid-bob');
  const bob = client('Bob', 'uuid-bob', 'Alice', 'uuid-alice');
  const icons = Object.fromEntries(['phone', 'mic', 'muted', 'close'].map(name => [name, `chrome-extension://${'a'.repeat(32)}/assets/voice/${name}.png`]));
  const lateIcon = alice.api.pixelIcon('phone');
  assert.equal(lateIcon.style.visibility, 'hidden');
  alice.emit({ type: 'assets', icons });
  assert.equal(lateIcon.src, icons.phone);
  assert.equal(lateIcon.style.visibility, '');
  const micIcon = alice.api.pixelIcon('mic');
  assert.equal(micIcon.tag, 'img');
  assert.equal(micIcon.src, icons.mic);
  assert.equal(alice.api.pixelIcon('phone').src, icons.phone);
  assert.equal(alice.api.pixelIcon('muted').src, icons.muted);
  assert.equal(alice.api.pixelIcon('dismiss').src, icons.close);
  for (const name of Object.keys(icons)) assert.ok(fs.existsSync(path.join(__dirname, '../assets/voice', `${name}.png`)));
  assert.equal((await alice.api.call('Bob')).ok, false, 'calls are opt-in');
  await Promise.all([alice.api.enable(), bob.api.enable()]);
  await new Promise(resolve => setTimeout(resolve, 30));
  alice.tick(20000);
  bob.tick(20000);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(alice.api.status().availableFriends), ['Bob'], JSON.stringify({ alice: alice.api.status(), bob: bob.api.status(), published }));
  assert.deepEqual(Array.from(bob.api.status().availableFriends), ['Alice']);
  assert.equal((await alice.api.call('Unknown')).ok, false);
  alice.advanceTime(60000);
  const beforeLookup = published.length;
  assert.equal((await alice.api.call('Bob')).ok, true);
  assert.ok(published.slice(beforeLookup).some(packet => packet.t === 'presence-query'), 'stale presence is refreshed before reporting unavailable');
  alice.advanceTime(-60000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bob.api.status().call.phase, 'incoming');
  assert.equal(streams.length, 0, 'ringing did not touch the microphone');
  bob.api.decline();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(alice.api.status().call, null, 'decline notifies the caller');
  assert.equal(streams.length, 0, 'decline never touches the microphone');
  assert.equal((await alice.api.call('Bob')).ok, true);
  await new Promise(resolve => setImmediate(resolve));
  alice.advanceTime(36000);
  bob.tick(20000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await alice.api.call('Bob')).ok, true, 'expired ringing does not create a false busy state');
  alice.advanceTime(-36000);
  await new Promise(resolve => setImmediate(resolve));
  bob.api.decline();
  await new Promise(resolve => setImmediate(resolve));
  bob.setDeny(true);
  assert.equal((await alice.api.call('Bob')).ok, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await bob.api.answer(), false, 'microphone denial is handled');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(alice.api.status().call, null, 'microphone denial notifies caller');
  bob.setDeny(false);
  assert.equal((await alice.api.call('Bob')).ok, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await bob.api.answer(), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(alice.api.status().call.phase, 'active');
  assert.equal(bob.api.status().call.phase, 'active');
  assert.equal(streams.length, 2);
  assert.equal(alice.api.mute(), true);
  assert.equal(streams.find(item => item.name === 'Alice').track.enabled, false);
  alice.api.end();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bob.api.status().call, null);
  assert.ok(streams.every(item => item.track.stopped), 'hangup releases both microphones');
  assert.equal((await alice.api.call('Bob')).ok, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await bob.api.answer(), true);
  await new Promise(resolve => setImmediate(resolve));
  mediaPairs.at(-1).outgoing.peerConnection.setState('failed');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(alice.api.status().call, null, 'failed WebRTC link clears the caller busy state');
  assert.equal(bob.api.status().call, null, 'failed WebRTC link clears the recipient busy state');
  assert.equal((await alice.api.call('Bob')).ok, true);
  await new Promise(resolve => setImmediate(resolve));
  alice.emit({ type: 'error', error: 'PUBLISH_FAILED' });
  assert.equal(alice.api.status().call, null, 'failed signaling publish clears ringing instead of leaving a false busy state');
  bob.api.decline();
  alice.tick(4000);
  await new Promise(resolve => setImmediate(resolve));
  const alicePresence = published.find(packet => packet.t === 'presence' && packet.peer?.startsWith('mfvoice-') && packet.key && packet.from === published.find(item => item.t === 'invite')?.from);
  const bobPresence = published.find(packet => packet.t === 'presence' && packet.from !== alicePresence?.from);
  assert.ok(alicePresence && bobPresence);
  alice.emit({ type: 'signal', message: JSON.stringify({ v: 'MFVOICE1', t: 'invite', from: 'f'.repeat(24), to: alicePresence.from,
    ts: Date.now(), id: 'fresh-invite-without-presence', key: alicePresence.key, callerKey: bobPresence.key, peer: 'mfvoice-' + 'f'.repeat(24) }) });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(alice.api.status().call?.phase, 'incoming', 'known friend invite is not lost when presence arrives out of order');
  alice.api.decline();
  await new Promise(resolve => setImmediate(resolve));
  const oldPeer = peers.get('mfvoice-' + alicePresence.from);
  alice.api.disable();
  await alice.api.enable();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(!peers.has(oldPeer.id), 'a new PeerJS identity is used after reconnecting');
  oldPeer.emit('disconnected');
  assert.equal(alice.api.status().peer, true, 'events from an old PeerJS connection cannot mark the new one offline');
  alice.reload();
  assert.equal(alice.api.status().wanted, true, 'hot reload keeps the opt-in state');
  alice.api.dispose();
  assert.equal(alice.stored.get('mf:voice:enabled'), '1', 'reload cleanup preserves opt-in');
  bob.api.dispose();
  const charlie = client('Charlie', 'uuid-charlie', 'Alice', 'uuid-alice');
  charlie.emit({ type: 'preference', known: true, enabled: true });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(charlie.api.status().enabled, true, 'opt-in from another site starts voice');
  assert.equal(charlie.stored.get('mf:voice:enabled'), '1');
  charlie.emit({ type: 'preference-update', enabled: false });
  assert.equal(charlie.api.status().enabled, false, 'turning voice off in another tab stops this connection');
  await charlie.api.enable();
  charlie.api.disable();
  assert.equal(charlie.stored.get('mf:voice:enabled'), '0', 'explicit off still persists');
  charlie.api.dispose();
  const dana = client('Dana', 'uuid-dana', 'Alice', 'uuid-alice', true);
  dana.emit({ type: 'preference', known: true, enabled: false });
  assert.equal(dana.api.status().wanted, false, 'global off overrides stale site preference');
  assert.equal(dana.stored.get('mf:voice:enabled'), '0');
  dana.api.dispose();
});
