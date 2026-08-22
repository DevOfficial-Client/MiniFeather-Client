const fs = require('fs');
const path = require('path');

const FILES = [
  'entity/cat/tabby.png', 'entity/cat/black.png', 'entity/cat/red.png', 'entity/cat/siamese.png',
  'entity/cat/british_shorthair.png', 'entity/cat/calico.png', 'entity/cat/persian.png',
  'entity/cat/ragdoll.png', 'entity/cat/white.png', 'entity/cat/jellie.png', 'entity/cat/all_black.png',
  'entity/cat/ocelot.png', 'entity/cat/cat_collar.png',
  'entity/villager/farmer.png', 'entity/villager/priest.png', 'entity/villager/librarian.png',
  'entity/villager/smith.png', 'entity/villager/butcher.png',
  'entity/wolf/wolf_tame.png', 'entity/wolf/wolf_collar.png',
  'entity/armorstand/wood.png', 'entity/minecart/minecart.png',
  'entity/enchanting_table_book.png', 'entity/experience_orb.png',
  'spear/wooden_spear.png', 'spear/stone_spear.png', 'spear/golden_spear.png',
  'spear/iron_spear.png', 'spear/diamond_spear.png', 'spear/infernium_spear.png',
  'mace.png',
  'particle/explosion_0.png', 'particle/explosion_1.png', 'particle/explosion_2.png',
  'particle/explosion_3.png', 'particle/explosion_4.png', 'particle/explosion_5.png',
  'particle/explosion_6.png', 'particle/explosion_7.png', 'particle/explosion_8.png',
  'particle/explosion_9.png', 'particle/explosion_10.png', 'particle/explosion_11.png',
  'particle/explosion_12.png', 'particle/explosion_13.png', 'particle/explosion_14.png',
  'particle/explosion_15.png',
  'particle/effect_0.png', 'particle/effect_1.png', 'particle/effect_2.png',
  'particle/effect_3.png', 'particle/effect_4.png', 'particle/effect_5.png',
  'particle/effect_6.png', 'particle/effect_7.png',
  'particle/spell_0.png', 'particle/spell_1.png', 'particle/spell_2.png', 'particle/spell_3.png',
  'particle/spell_4.png', 'particle/spell_5.png', 'particle/spell_6.png', 'particle/spell_7.png',
  'particle/bubble.png'
];

(async () => {
  let ok = 0;
  const fail = [];
  for (const rel of FILES) {
    const dest = path.join(__dirname, '..', 'textures', rel);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { ok++; continue; }
    try {
      const res = await fetch('https://miniblox.io/textures/' + rel);
      if (!res.ok) { fail.push(rel + ' ' + res.status); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = dest + '.tmp';
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, dest);
      ok++;
    } catch (e) {
      fail.push(rel + ' ' + e.message);
    }
  }
  console.log('downloaded/present:', ok, '/', FILES.length);
  if (fail.length) console.log('failed:\n' + fail.join('\n'));
})();
