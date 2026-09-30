// quick harness: boot MF_InPageRedirects in a stubbed page context and check rewriteUrl
// through the patched window.fetch. node tests/inpage-redirects.test.js
const path = require('path');
const MOD = path.join(__dirname, '..', 'src', 'Core', 'MF_InPageRedirects.js');

async function boot(store) {
  global.window = global;
  delete global.__MF_IN_PAGE_REDIRECTS__;
  delete require.cache[MOD];
  global.__MF_SHIM__ = { assetBase: () => 'https://mfapp.localhost/' };
  global.chrome = { storage: { local: { get: async () => store } } };
  global.location = { href: 'https://miniblox.io/' };
  const seen = [];
  global.fetch = function (u) { seen.push(String(u)); return {}; };
  global.XMLHttpRequest = function () {};
  global.XMLHttpRequest.prototype.open = function () {};
  require(MOD);
  await new Promise(r => setTimeout(r, 10)); // let chrome.storage.local.get().then(applyStorage) settle
  return { go: u => { seen.length = 0; global.fetch(u); return seen[0] || 'UNTOUCHED'; } };
}

(async () => {
  const R = 'https://miniblox.io/auth-api/texturepacks/user/0870278c-abeb-4e7c-825c-a0bfa845704f/minecraft-texture-pack/';
  const t = await boot({ currentSkins: { steve: 'https://cdn.example.com/steve.png' } });
  const cases = [
    ['https://miniblox.io/textures/models/armor/iron_layer_1.png', 'https://mfapp.localhost/textures/models/armor/iron_layer_1.png'],
    ['https://miniblox.io/textures/models/armor/leather_layer_1_overlay.png', 'https://mfapp.localhost/textures/models/armor/leather_layer_1_overlay.png'],
    ['https://miniblox.io/textures/entity/sheep/sheep.png', 'https://mfapp.localhost/textures/entity/sheep/sheep.png'],
    ['https://miniblox.io/textures/entity/iron_golem/iron_golem.png', R + 'entity/iron_golem/iron_golem.png'],
    ['https://miniblox.io/textures/spritesheet.png', 'https://mfapp.localhost/assets/pvtexpack.png'],
    ['https://miniblox.io/textures/entity/skins/steve.png', 'https://cdn.example.com/steve.png'],
    ['https://miniblox.io/assets/index-BfBcwb2y.js', 'UNT'],
    ['https://cdn.miniblox.io/textures/entity/sheep/sheep.png', 'UNT'],
    ['https://miniblox.online/textures/models/armor/gold_layer_2.png', 'https://mfapp.localhost/textures/models/armor/gold_layer_2.png'],
    ['https://evil.com/textures/models/armor/iron_layer_1.png', 'UNT'],
    ['data:image/png;base64,AAA', 'UNT']
  ];
  let fail = 0;
  for (const [inp, want] of cases) {
    const got = t.go(inp);
    const ok = want === 'UNT' ? got === inp : got === want;
    if (!ok) { fail++; console.log('FAIL', inp, '->', got); } else console.log('PASS', inp.replace('https://', '').slice(0, 60));
  }
  const t2 = await boot({ localTexturesEnabled: false });
  const g2 = t2.go('https://miniblox.io/textures/entity/sheep/sheep.png');
  const ok2 = g2 === R + 'entity/sheep/sheep.png';
  if (!ok2) { fail++; console.log('FAIL local-disabled:', g2); } else console.log('PASS local-disabled -> remote pack fallback');
  console.log(fail ? 'FAILED: ' + fail : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})();
