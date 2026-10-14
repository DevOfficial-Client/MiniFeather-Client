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
  listeners.get('minifeather:accounts-data')({ detail: JSON.stringify({ username: 'ItsWolfyX', rank: 'dev', rankLevel: 0 }) });
  assert.equal(vm.runInContext('experimentalTierOk', context), true);
  assert.equal(renders, 1);
  assert.equal(timers.size, 0);
});

function accountSandbox({ profile, session = null, fetch } = {}) {
  const listeners = new Map();
  const published = [];
  const intervals = [];
  const context = vm.createContext({
    document: {
      querySelector() { return null; },
      addEventListener(type, listener) { listeners.set(type, listener); },
      dispatchEvent(event) {
        if (event.type === 'minifeather:accounts-data') published.push(JSON.parse(event.detail));
        listeners.get(event.type)?.(event);
      }
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    localStorage: { getItem() { return session; } },
    location: { pathname: '/', origin: 'https://miniblox.online' },
    setInterval(fn) { intervals.push(fn); return intervals.length; },
    fetch: fetch || (() => { throw new Error('unexpected network access'); })
  });
  context.window = context;
  if (profile) context.miniblox = { player: { profile } };
  const inject = fs.readFileSync(path.join(__dirname, '..', 'src', 'Core', 'inject.js'), 'utf8');
  const definitions = ['BUILTIN_RANKS', 'BUILTIN_PLAYERS'].map(name => {
    const match = inject.match(new RegExp(`  const ${name} = \\{[\\s\\S]*?\\n  \\};`));
    assert.ok(match, `${name} is missing`);
    return match[0];
  }).join('\n');
  vm.runInContext(`
    ${definitions}
    const state = { ranksVersion: 0, ranksReady: false };
    const ranks = { defs: {}, byUuid: new Map(), byName: new Map() };
    ${inject.slice(inject.indexOf('  function normRankKey('), inject.indexOf('  function localDbUrl('))}
    ${inject.slice(inject.indexOf('  function rankOf('), inject.indexOf('  function displayTarget('))}
    globalThis.__MF_NATIVE_CUSTOM_RANKS__ = { getRank: rankOf };
    applyRanksDb({});
  `, context);
  vm.runInContext(source, context, { filename: 'MF_Accounts.js' });
  return { context, listeners, published, intervals, setSession(value) { session = value; } };
}

const WOLF_UUID = 'c4201f43-2de9-4275-930a-301fae4cce6c';

test('DEV belongs to the confirmed UUID and survives username changes and a stale live DB', async () => {
  const { context } = accountSandbox({ profile: { uuid: WOLF_UUID, username: 'ItsWolfyX', rank: 'default' } });
  assert.equal((await context.MF_Accounts.getAccount()).rank, 'dev');
  context.miniblox.player.profile.username = 'FutureWolfName';
  vm.runInContext("applyRanksDb({ players: { unrelated: { rank: 'dev' } } })", context);
  const acc = await context.MF_Accounts.refresh();
  assert.equal(acc.username, 'FutureWolfName');
  assert.equal(acc.rank, 'dev');
  assert.equal(context.MF_Accounts.rankLevel(acc.rank), 201);
  const offline = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'accounts.json'), 'utf8'));
  assert.equal(offline.players[WOLF_UUID].rank, 'dev');
  assert.equal(offline.players.angrywolfx, undefined);
  assert.equal(offline.players.itswolfyx, undefined);
  const inject = fs.readFileSync(path.join(__dirname, '..', 'src', 'Core', 'inject.js'), 'utf8');
  assert.match(inject, /getRank: rankOf/);
  assert.match(inject, /applyRanksDb\(\{\}\);\s+installEarlyDataHook\(\)/);
});

test('reusing a developer username with another UUID does not grant DEV', async () => {
  const { context } = accountSandbox({ profile: {
    uuid: '00000000-0000-4000-8000-000000000001', username: 'ItsWolfyX', rank: 'default'
  } });
  assert.equal((await context.MF_Accounts.refresh()).rank, 'default');
  assert.equal(vm.runInContext("rankOf('ItsWolfyX')", context), null);
  assert.equal(vm.runInContext("rankOf('AngryWolfX')", context), null);
});

test('a late ranks update republishes resolved account access without another auth request', async () => {
  const { context, published } = accountSandbox({ profile: { uuid: WOLF_UUID, username: 'ItsWolfyX', rank: 'default' } });
  vm.runInContext('__MF_NATIVE_CUSTOM_RANKS__ = null;', context);
  assert.equal((await context.MF_Accounts.refresh()).rank, 'default');
  vm.runInContext('__MF_NATIVE_CUSTOM_RANKS__ = { getRank: rankOf }; applyRanksDb({});', context);
  assert.equal(published.at(-1).rank, 'dev');
  assert.equal(published.at(-1).rankLevel, 201);
  assert.equal(published.at(-1).session, false);
});

test('logout clears cached account identity and a late old-session response is discarded', async () => {
  const responses = [];
  const fixture = accountSandbox({ session: 'test-session', fetch() {
    return new Promise(resolve => responses.push(resolve));
  } });
  fixture.context.__MF_ACCOUNT_STATE__.uuid = WOLF_UUID;
  fixture.context.__MF_ACCOUNT_STATE__.username = 'ItsWolfyX';
  fixture.context.__MF_ACCOUNT_STATE__.rank = 'dev';
  fixture.setSession(null);
  fixture.intervals[0]();
  responses[0]({ ok: true, json: async () => ({ uuid: WOLF_UUID, username: 'ItsWolfyX', rank: 'dev' }) });
  await new Promise(resolve => setImmediate(resolve));
  const acc = await fixture.context.MF_Accounts.getAccount();
  assert.equal(acc.uuid, null);
  assert.equal(acc.username, null);
  assert.equal(acc.rank, null);
});

test('an account request after a session change never returns a cached developer before the watcher runs', async () => {
  const fixture = accountSandbox({ session: 'old-test-session', fetch: async () => ({ ok: false }) });
  fixture.context.__MF_ACCOUNT_STATE__.uuid = WOLF_UUID;
  fixture.context.__MF_ACCOUNT_STATE__.username = 'ItsWolfyX';
  fixture.context.__MF_ACCOUNT_STATE__.rank = 'dev';
  fixture.setSession('new-test-session');
  const acc = await fixture.context.MF_Accounts.getAccount();
  assert.equal(acc.uuid, null);
  assert.equal(acc.username, null);
  assert.equal(acc.rank, null);
  assert.equal(acc.session, 'new-test-session');
});
