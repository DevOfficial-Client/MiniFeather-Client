'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('src/Cosmetics/CustomSkins.js');
const uuid = 'c4201f43-2de9-4275-930a-301fae4cce6c';

function fixture() {
  const builtin = source.match(/    var BUILTIN_DB = (\{[\s\S]*?\n    \});/);
  assert.ok(builtin);
  const functions = ['normalizeSkinValue', 'parseDb', 'exposeDb', 'lookupEntry', 'patchProfile'].map(name => {
    const start = source.indexOf(`    function ${name}(`);
    assert.ok(start >= 0, name);
    const end = source.indexOf('\n    function ', start + 1);
    // These helpers are individually scoped; omit declarations belonging to the next helper.
    const block = source.slice(start, end);
    const close = block.lastIndexOf('\n    }');
    return block.slice(0, close + 6);
  });
  const context = vm.createContext({ window: {} });
  vm.runInContext(`
    var BUILTIN_DB = ${builtin[1]};
    var dbByUuid = null, dbByName = null;
    var patchedProfiles = new WeakSet();
    ${functions.join('\n')}
    parseDb(BUILTIN_DB, true);
  `, context);
  return context;
}

test('the developer keeps the native Miniblox skin instead of the old forced pack', () => {
  const context = fixture();
  context.profile = { uuid, username: 'ItsWolfyX', skin: 'custom:new-native-skin', cosmetics: { skin: 'custom:new-native-skin' } };
  assert.equal(vm.runInContext('patchProfile(profile)', context), false);
  assert.equal(context.profile.skin, 'custom:new-native-skin');
  assert.equal(context.profile.cosmetics.skin, 'custom:new-native-skin');
  assert.equal(context.window.__MF_CustomSkins_DB__.byUuid[uuid], undefined);
});

test('pack defaults for other players and the developer UUID rank are unchanged', () => {
  const context = fixture();
  assert.equal(context.window.__MF_CustomSkins_DB__.byUuid['6eb7369a-551e-406a-9a63-6db7a358e1e5'], 'custom:mf_estebangxe');
  assert.equal(context.window.__MF_CustomSkins_DB__.byName.eve, 'custom:mf_eve');
  const accounts = JSON.parse(read('assets/accounts.json'));
  assert.equal(accounts.players[uuid].rank, 'dev');
  assert.equal(accounts.players[uuid].skin, undefined);
  context.data = accounts;
  vm.runInContext('parseDb(data, false)', context);
  assert.equal(context.window.__MF_CustomSkins_DB__.byUuid[uuid], undefined);
});

test('new manually assigned skins remain supported and old remote module code cannot restore the forced default', () => {
  const context = fixture();
  context.data = { players: { [uuid]: { skin: 'custom:new-client-skin' } } };
  vm.runInContext('parseDb(data, false)', context);
  context.profile = { uuid, skin: 'bob' };
  assert.equal(vm.runInContext('patchProfile(profile)', context), true);
  assert.equal(context.profile.skin, 'custom:new-client-skin');
  assert.match(source, /CUSTOM_SKIN_DEFAULTS_VERSION = 1/);
  assert.match(read('src/Core/MirrorRunner.js'), /'src\/Cosmetics\/CustomSkins\.js': 'CUSTOM_SKIN_DEFAULTS_VERSION = 1'/);
});
