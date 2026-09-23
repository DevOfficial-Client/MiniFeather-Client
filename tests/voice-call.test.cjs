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
  class FakeEvent {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  }
  class MediaCall {
    constructor(peer, metadata) { this.peer = peer; this.metadata = metadata; this.handlers = new Map(); this.closed = false; }
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
      queueMicrotask(() => remote.emit('call', incoming));
      return outgoing;
    }
    destroy() { peers.delete(this.id); }
    reconnect() {}
  }

  function client(name, uuid, friendName, friendUuid) {
    const listeners = new Map();
    const intervals = new Map();
    let nextTimer = 1;
    let denyMicrophone = false;
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
      getElementById() { return null; },
      createElement() { return { style: {}, play: () => Promise.resolve(), pause() {}, remove() {} }; }
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
      localStorage: { getItem: () => null, setItem() {} },
      setInterval(fn, ms) { const id = nextTimer++; intervals.set(id, { fn, ms }); return id; },
      clearInterval(id) { intervals.delete(id); },
      setTimeout() { return nextTimer++; }, clearTimeout() {},
      console
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(source, sandbox, { filename: 'MF_VoiceChat.js' });
    const instance = { api: sandbox.MF_VoiceChat, emit, setDeny(value) { denyMicrophone = value; }, tick(ms) { for (const timer of intervals.values()) if (timer.ms === ms) timer.fn(); } };
    clients.push(instance);
    return instance;
  }

  const alice = client('Alice', 'uuid-alice', 'Bob', 'uuid-bob');
  const bob = client('Bob', 'uuid-bob', 'Alice', 'uuid-alice');
  assert.equal((await alice.api.call('Bob')).ok, false, 'calls are opt-in');
  await Promise.all([alice.api.enable(), bob.api.enable()]);
  await new Promise(resolve => setTimeout(resolve, 30));
  alice.tick(20000);
  bob.tick(20000);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(alice.api.status().availableFriends), ['Bob'], JSON.stringify({ alice: alice.api.status(), bob: bob.api.status(), published }));
  assert.deepEqual(Array.from(bob.api.status().availableFriends), ['Alice']);
  assert.equal((await alice.api.call('Unknown')).ok, false);
  assert.equal((await alice.api.call('Bob')).ok, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bob.api.status().call.phase, 'incoming');
  assert.equal(streams.length, 0, 'ringing did not touch the microphone');
  bob.api.decline();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(alice.api.status().call, null, 'decline notifies the caller');
  assert.equal(streams.length, 0, 'decline never touches the microphone');
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
  alice.api.dispose();
  bob.api.dispose();
});
