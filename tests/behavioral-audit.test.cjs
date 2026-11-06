'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { fixture, THREE, ROOT } = require('./helpers/render-lifecycle.cjs');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function namedFunction(source, name, indent = '    ') {
  const start = source.indexOf(`${indent}function ${name}(`);
  assert.ok(start >= 0, 'Missing function ' + name);
  for (const match of source.slice(start).matchAll(/\n\s*\}/g)) {
    const candidate = source.slice(start, start + match.index + match[0].length);
    try { new vm.Script(candidate); return candidate; } catch {}
  }
  throw new Error('Unclosed function ' + name);
}

test('peer pose interpolation cannot hang or poison a model with invalid or extreme angles', () => {
  const f = fixture();
  const rec = { root: new THREE.Object3D(), puppet: true, yaw: 0 };
  f.context.MF_CustomModels = { getRecord: () => rec, listLive: () => [] };
  const peer = f.load('src/Studio/MF_Peer.js', 'state, puppetTick, ents, entsTick, onSyncGuest');
  for (const yaw of [Infinity, -Infinity, NaN, 1e300, -1e300, 2]) {
    peer.state.puppetTarget = { x: 1, y: 2, z: 3, yaw };
    vm.runInContext('__probe.puppetTick()', f.context, { timeout: 100 });
    assert.ok(Number.isFinite(rec.yaw));
    assert.ok(Math.abs(rec.yaw) <= Math.PI);
    peer.ents.remote.set('peer', { x: 1, y: 2, z: 3, yaw, seenAt: 5000 });
    vm.runInContext('__probe.entsTick()', f.context, { timeout: 100 });
    assert.ok(Number.isFinite(rec.root.rotation.y));
  }
  peer.state.puppetTarget = null;
  peer.onSyncGuest({ p: { x: Infinity, y: 0, z: 0, yaw: 0 } });
  assert.equal(peer.state.puppetTarget, null);
});

test('camera angle normalization is constant-time and rejects nonfinite input', () => {
  const source = read('src/Render/CameraOverhaul.js');
  const ctx = vm.createContext({});
  vm.runInContext(namedFunction(source, 'normalizeAngle'), ctx);
  for (const value of [Infinity, -Infinity, NaN, 1e300, -1e300, -8, 0, 8]) {
    ctx.value = value;
    const result = vm.runInContext('normalizeAngle(value)', ctx, { timeout: 100 });
    assert.ok(Number.isFinite(result));
    assert.ok(Math.abs(result) <= Math.PI);
  }
});

test('Rhythm Parkour displays peer names, scores and combos as text, never markup', () => {
  const dom = new JSDOM('<div id="ui">' + ['p2p-status', 'p2p-current', 'room-id', 'room-count',
    'player-list', 'p2p-create', 'p2p-join', 'p2p-join-id', 'p2p-disconnect']
    .map(id => `<div id="mf-rhythm-${id}">-</div>`).join('') + '</div>');
  const document = dom.window.document;
  const marker = '<b data-audit-probe="yes">literal name</b>';
  const ctx = vm.createContext({ document, state: { ui: document.querySelector('#ui'), score: 5 },
    p2pManager: { roomId: 'fixture', isHost: true, playerName: marker,
      remotePlayers: new Map([['remote', { name: marker, score: marker, combo: marker }]]),
      gameMode: 'competitive', connections: [], maxPlayers: 8 }, tr: (_key, fallback) => fallback });
  vm.runInContext(namedFunction(read('src/World/RhythmParkour.js'), 'updateP2PRoomUI', '  ') + '\nupdateP2PRoomUI();', ctx);
  assert.equal(document.querySelectorAll('[data-audit-probe]').length, 0);
  assert.ok(document.querySelector('#mf-rhythm-player-list').textContent.includes(marker));
  dom.window.close();
});

test('facial pack metadata renders literally in both the list and details', () => {
  const source = read('src/Studio/MF_Facial.js');
  const dom = new JSDOM('<div id="mf-facial"><div id="mff-packs"></div><div id="mff-packdetail"></div></div>');
  const document = dom.window.document;
  const marker = '<b data-audit-probe="yes">literal pack</b>';
  const ctx = vm.createContext({ document, ID: 'mf-facial', packSel: marker,
    packIndex: [{ id: marker, name: marker, author: marker, version: marker }],
    currentSkinId: () => '', releasePackSkin() {}, alert() {},
    el(_tag, className) { const node = document.createElement('div'); node.className = className; return node; } });
  const helper = source.includes('function escapeHtml(') ? namedFunction(source, 'escapeHtml') : '';
  vm.runInContext(helper + namedFunction(source, 'renderPacksTab') + '\nrenderPacksTab();', ctx);
  assert.equal(document.querySelectorAll('[data-audit-probe]').length, 0);
  assert.ok(document.querySelector('#mff-packs').textContent.includes(marker));
  assert.ok(document.querySelector('#mff-packdetail').textContent.includes(marker));
  dom.window.close();
});

function sliderFixture() {
  const dom = new JSDOM('<body><input type="range" max="8"></body>');
  const document = dom.window.document;
  let wholeDocumentQueries = 0;
  const query = document.querySelectorAll.bind(document);
  document.querySelectorAll = (...args) => { wholeDocumentQueries++; return query(...args); };
  const source = read('src/Core/inject.js');
  const start = source.lastIndexOf('  (function () {');
  assert.ok(start >= 0);
  vm.runInNewContext(source.slice(start), { document,
    HTMLInputElement: dom.window.HTMLInputElement,
    MutationObserver: dom.window.MutationObserver, setTimeout() {} });
  return { dom, document, queries: () => wholeDocumentQueries };
}

test('patched native sliders keep working when the game writes their maximum', () => {
  const f = sliderFixture();
  const input = f.document.querySelector('input');
  input.max = 12;
  assert.equal(input.max, '12');
  assert.equal(input.getAttribute('max'), '12');
  input.max = 8;
  assert.equal(input.max, '32');
  input._patchActive = false;
  input.max = 8;
  assert.equal(input.max, '8');
  f.dom.window.close();
});

test('HUD mutations do not trigger full-document slider scans; new sliders are still patched', async () => {
  const f = sliderFixture();
  const before = f.queries();
  const hud = f.document.createElement('div');
  f.document.body.append(hud);
  for (let i = 0; i < 100; i++) hud.textContent = String(i);
  const input = f.document.createElement('input'); input.type = 'range';
  hud.append(input);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.queries(), before);
  assert.equal(input.dataset.mfPatched, '1');
  f.dom.window.close();
});
