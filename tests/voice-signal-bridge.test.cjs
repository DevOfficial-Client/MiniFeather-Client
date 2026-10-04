const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/P2P/MF_VoiceSignalBridge.js'), 'utf8');

test('voice bridge uses its own background port and forwards only voice packets', () => {
  const listeners = new Map();
  const outputs = [];
  const posts = [];
  const preferences = [];
  let onMessage;
  let onPreferenceChanged;
  let portName;
  const port = {
    onMessage: { addListener(fn) { onMessage = fn; } },
    onDisconnect: { addListener() {} },
    postMessage(value) { posts.push(value); },
    disconnect() {}
  };
  class FakeEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } }
  const document = {
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    dispatchEvent(event) {
      if (event.type === 'minifeather:voice-signal-event') outputs.push(JSON.parse(event.detail));
      listeners.get(event.type)?.(event);
    }
  };
  const sandbox = {
    document, CustomEvent: FakeEvent,
    chrome: { runtime: { connect({ name }) { portName = name; return port; }, getURL(path) { return `chrome-extension://${'a'.repeat(32)}/${path}`; } }, storage: { onChanged: {
      addListener(fn) { onPreferenceChanged = fn; }, removeListener() {}
    }, local: {
      get(key, callback) { callback({ [key]: true }); },
      set(value) { preferences.push(value); }
    } } },
    setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {}, Date
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'MF_VoiceSignalBridge.js' });
  assert.ok(outputs.some(value => value.type === 'preference' && value.known && value.enabled));
  const assets = outputs.find(value => value.type === 'assets');
  assert.equal(assets.icons.mic, `chrome-extension://${'a'.repeat(32)}/assets/voice/mic.png`);
  const request = payload => document.dispatchEvent(new FakeEvent('minifeather:voice-signal-request', { detail: JSON.stringify(payload) }));
  request({ type: 'preference-set', enabled: false });
  assert.equal(preferences.at(-1)['mf:voice:enabled'], false);
  onPreferenceChanged({ 'mf:voice:enabled': { newValue: false } }, 'local');
  assert.ok(outputs.some(value => value.type === 'preference-update' && value.enabled === false));
  request({ type: 'start' });
  assert.equal(portName, 'minifeather-voice-signal');
  onMessage({ type: 'ready' });
  assert.ok(outputs.some(value => value.type === 'ready'));
  request({ type: 'publish', payload: { v: 'OTHER', t: 'presence', from: 'a'.repeat(24), ts: Date.now() } });
  assert.equal(posts.length, 0);
  const packet = { v: 'MFVOICE1', t: 'presence', from: 'a'.repeat(24), ts: Date.now(), key: 'b'.repeat(64), peer: 'mfvoice-' + 'a'.repeat(24) };
  request({ type: 'publish', payload: packet });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].payload.t, 'presence');
  request({ type: 'publish', payload: { v: 'MFVOICE1', t: 'presence-query', from: 'a'.repeat(24), ts: Date.now(), key: 'b'.repeat(64) } });
  assert.equal(posts.at(-1).payload.t, 'presence-query');
  onMessage({ type: 'signal', signal: packet });
  assert.ok(outputs.some(value => value.type === 'signal' && JSON.parse(value.message).t === 'presence'));
  sandbox.__MF_VOICE_SIGNAL_BRIDGE__.destroy();
});
