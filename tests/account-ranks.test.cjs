'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'Cosmetics', 'MF_Accounts.js'), 'utf8');
const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'UI', 'ClientPanel.js'), 'utf8');

test('server rank dev has the same access level as MFDev', () => {
  const window = {};
  const context = {
    window,
    document: { addEventListener() {} },
    localStorage: { getItem() { return null; } },
    location: { pathname: '/' },
    setInterval() { return 1; }
  };
  vm.runInNewContext(source, context, { filename: 'MF_Accounts.js' });
  const accounts = window.MF_Accounts;
  assert.equal(accounts.rankLevel('dev'), 201);
  assert.equal(accounts.rankLevel('DEV'), 201);
  assert.equal(accounts.rankLabel('dev'), 'MFDev');
  assert.equal(accounts.rankAtLeast('dev', 'mftester'), true);
  assert.equal(accounts.rankLevel('mfdev'), 201);
  assert.equal(accounts.rankLevel('unknown'), 0);
});

test('experimental gate resolves a stale rankLevel from the account rank and accepts late data', () => {
  const match = panel.match(/  function experimentalLevelFromAccount\(data\) \{[\s\S]*?\n  \}/);
  assert.ok(match, 'account rank resolver is missing');
  const resolve = vm.runInNewContext(`${match[0]}; experimentalLevelFromAccount`);
  assert.equal(resolve({ rank: 'dev', rankLevel: 0 }), 201);
  assert.equal(resolve({ rank: 'MFDev', rankLevel: 0 }), 201);
  assert.equal(resolve({ rank: 'mftester', rankLevel: 0 }), 100);
  assert.equal(resolve({ rank: 'unknown', rankLevel: 0 }), 0);
  assert.match(panel, /if \(page === 'experimental'\) refreshExperimentalGate\(\)/);
  assert.doesNotMatch(panel, /setTimeout\(\(\) => apply\(null\), 3000\)/);
});

test('late DEV account response unlocks Experimental after a missed first request', () => {
  const resolver = panel.match(/  function experimentalLevelFromAccount\(data\) \{[\s\S]*?\n  \}/)?.[0];
  const gate = panel.match(/  function refreshExperimentalGate\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(resolver && gate);
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 0;
  let requests = 0;
  let renders = 0;
  const context = vm.createContext({
    document: {
      addEventListener(type, listener) { listeners.set(type, listener); },
      dispatchEvent(event) { if (event.type === 'minifeather:accounts-request') requests++; }
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(`
    let destroyed = false;
    let experimentalTierOk = null;
    let experimentalGateListener = null;
    let experimentalGateRetryTimer = 0;
    let experimentalGateAttempts = 0;
    const EXPERIMENTAL_TIER_MIN = 100;
    const EXPERIMENTAL_TIER_MAX = 9183;
    let panel = {};
    let activePage = 'experimental';
    function forceExperimentalOff() { throw new Error('DEV was rejected'); }
    function renderCurrentPageContent() { globalThis.rendered(); }
    ${resolver}
    ${gate}
  `, context);
  context.rendered = () => { renders++; };
  vm.runInContext('refreshExperimentalGate()', context);
  assert.equal(requests, 1);
  const [timerId, callback] = timers.entries().next().value;
  timers.delete(timerId);
  callback();
  assert.equal(requests, 2);
  listeners.get('minifeather:accounts-data')({ detail: JSON.stringify({ username: 'AngryWolfX', rank: 'dev', rankLevel: 0 }) });
  assert.equal(vm.runInContext('experimentalTierOk', context), true);
  assert.equal(renders, 1);
  assert.equal(timers.size, 0);
});
