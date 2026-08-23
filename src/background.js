const SKINS = [
  "alice", "bob", "techno", "thebiggelo", "corrupted", "diana", "strange", "endoskeleton",
  "ganyu", "georgenotfound", "holly", "hutao", "jake", "james", "klee", "kyoko",
  "adele", "chris", "deadpool", "galactus", "heather", "ironman", "suit", "levi", "lexi",
  "natalie", "remus", "sara", "transformer", "vindicate", "adventure", "aether", "apex",
  "ariel", "aurora", "celeste", "cody", "ember", "finn", "glory", "hunter", "katie",
  "nova", "panda", "raven", "seraphina", "vain", "zane", "tester", "qhyun", "banana",
  "sushi", "ethan", "duck", "cat", "remlin"
];

const CAPES = [
  "angry-pig", "bao", "cloud", "cow", "creeper", "golden-apple", "grass-block", "heart",
  "pumpkin", "maki", "mushroom", "soul-creeper", "sushi", "salmon", "amethyst", "cheeser",
  "crimson-voyager", "duck", "frie", "galaxy", "migration", "shaded-green", "skulk",
  "withered", "yellow", "yin-yang", "wooden-sword", "stone-sword", "iron-sword",
  "gold-sword", "diamond-sword", "emerald-sword"
];

const GAME_DOMAINS = ["miniblox.io", "miniblox.online"];

const ASSET_TYPES = {
  skin: {
    names: SKINS,
    basePath: "/textures/entity/skins/",
    ruleOffset: 1000,
    storageKey: "currentSkins"
  },
  cape: {
    names: CAPES,
    basePath: "/textures/entity/capes/",
    ruleOffset: 2000,
    storageKey: "currentCapes"
  }
};

function getAssetConfig(type) {
  const config = ASSET_TYPES[type];
  if (!config) throw new Error(`Unknown asset type: ${type}`);
  return config;
}

function getRuleId(type, name) {
  const config = getAssetConfig(type);
  const index = config.names.indexOf(name);
  if (index === -1) throw new Error(`Unknown ${type}: ${name}`);
  return config.ruleOffset + index;
}

async function setAsset(type, name, customUrl) {
  const config = getAssetConfig(type);
  const originalPath = `${config.basePath}${name}.png`;
  const redirectUrl = customUrl || null;
  const ruleId = getRuleId(type, name);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId],
    addRules: [{
      id: ruleId,
      priority: 1,
      action: redirectUrl
        ? { type: "redirect", redirect: { url: redirectUrl } }
        : { type: "allow" },
      condition: {
        requestDomains: GAME_DOMAINS,
        urlFilter: `${originalPath}*`,
        resourceTypes: ["image", "other"]
      }
    }]
  });

  const stored = await chrome.storage.local.get([config.storageKey]);
  const activeAssets = stored[config.storageKey] || {};
  activeAssets[name] = redirectUrl || originalPath;
  await chrome.storage.local.set({ [config.storageKey]: activeAssets });
}

async function resetAsset(type, name) {
  const config = getAssetConfig(type);
  const ruleId = getRuleId(type, name);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId]
  });

  const stored = await chrome.storage.local.get([config.storageKey]);
  const activeAssets = stored[config.storageKey] || {};
  delete activeAssets[name];
  await chrome.storage.local.set({ [config.storageKey]: activeAssets });
}

async function resetAllAssets(type) {
  const config = getAssetConfig(type);
  const stored = await chrome.storage.local.get([config.storageKey]);
  const activeAssets = stored[config.storageKey] || {};
  const ruleIds = Object.keys(activeAssets)
    .map(name => {
      try {
        return getRuleId(type, name);
      } catch {
        return null;
      }
    })
    .filter(Number.isInteger);

  if (ruleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIds
    });
  }

  await chrome.storage.local.set({ [config.storageKey]: {} });
}

function getActiveAssets(type, sendResponse) {
  const config = getAssetConfig(type);
  chrome.storage.local.get([config.storageKey]).then(data => {
    sendResponse({ success: true, assets: data[config.storageKey] || {} });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    setSkin: () => setAsset("skin", message.skinName, message.customUrl),
    resetSkin: () => resetAsset("skin", message.skinName),
    resetAllSkins: () => resetAllAssets("skin"),
    setCape: () => setAsset("cape", message.capeName, message.customUrl),
    resetCape: () => resetAsset("cape", message.capeName),
    resetAllCapes: () => resetAllAssets("cape")
  };

  if (handlers[message.type]) {
    handlers[message.type]()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "getSkins") {
    getActiveAssets("skin", response => {
      sendResponse({ success: true, skins: response.assets });
    });
    return true;
  }

  if (message.type === "getCapes") {
    getActiveAssets("cape", response => {
      sendResponse({ success: true, capes: response.assets });
    });
    return true;
  }

  if (message.type === "getSkinList") {
    sendResponse({ success: true, skins: SKINS });
  }

  if (message.type === "getCapeList") {
    sendResponse({ success: true, capes: CAPES });
  }
});

const SPRITESHEET_URL = "https://raw.githubusercontent.com/EstebanGrp/MiniFeather-Client/refs/heads/main/pvtexpack.png";
const SPRITESHEET_FALLBACK_URL = chrome.runtime.getURL("assets/pvtexpack.png");
const SPRITESHEET_RULE_ID = 999;

// Local-first: el PNG empaquetado siempre está disponible y es instantáneo.
// GitHub raw sufre 429/503 con facilidad; el remoto queda como respaldo
// por si el asset empaquetado no existe (build sin assets).
async function getActiveSpritesheetUrl() {
  const { mfCustomSpritesheetUrl } = await chrome.storage.local.get(["mfCustomSpritesheetUrl"]);
  if (mfCustomSpritesheetUrl) return mfCustomSpritesheetUrl;
  try {
    const res = await fetch(SPRITESHEET_FALLBACK_URL, { method: "HEAD" });
    if (res.ok) return SPRITESHEET_FALLBACK_URL;
  } catch (_) {}
  return SPRITESHEET_URL;
}

const TEXTURE_PACK_REDIRECT_BASE = "https://miniblox.io/auth-api/texturepacks/user/0870278c-abeb-4e7c-825c-a0bfa845704f/minecraft-texture-pack/";

const EXTRA_TEXTURES = [
  { id: 10000, from: "/textures/armor/leather_layer_1.png", to: "armor/leather_layer_1.png" },
  { id: 10001, from: "/textures/armor/leather_layer_2.png", to: "armor/leather_layer_2.png" },
  { id: 10002, from: "/textures/armor/gold_layer_1.png", to: "armor/gold_layer_1.png" },
  { id: 10003, from: "/textures/armor/gold_layer_2.png", to: "armor/gold_layer_2.png" },
  { id: 10004, from: "/textures/armor/chainmail_layer_1.png", to: "armor/chainmail_layer_1.png" },
  { id: 10005, from: "/textures/armor/chainmail_layer_2.png", to: "armor/chainmail_layer_2.png" },
  { id: 10006, from: "/textures/armor/iron_layer_1.png", to: "armor/iron_layer_1.png" },
  { id: 10007, from: "/textures/armor/iron_layer_2.png", to: "armor/iron_layer_2.png" },
  { id: 10008, from: "/textures/armor/diamond_layer_1.png", to: "armor/diamond_layer_1.png" },
  { id: 10009, from: "/textures/armor/diamond_layer_2.png", to: "armor/diamond_layer_2.png" },
  { id: 10010, from: "/textures/entity/sheep/sheep.png", to: "entity/sheep/sheep.png" },
  { id: 10011, from: "/textures/entity/spider/spider.png", to: "entity/spider/spider.png" },
  { id: 10012, from: "/textures/entity/zombie/zombie.png", to: "entity/zombie/zombie.png" },
  { id: 10013, from: "/textures/entity/skeleton/skeleton.png", to: "entity/skeleton/skeleton.png" },
  { id: 10014, from: "/textures/entity/creeper/creeper.png", to: "entity/creeper/creeper.png" },
  { id: 10015, from: "/textures/entity/slime/slime.png", to: "entity/slime/slime.png" },
  { id: 10016, from: "/textures/entity/wolf/wolf.png", to: "entity/wolf/wolf.png" },
  { id: 10017, from: "/textures/entity/villager/villager.png", to: "entity/villager/villager.png" },
  { id: 10018, from: "/textures/entity/iron_golem/iron_golem.png", to: "entity/iron_golem/iron_golem.png" },
  { id: 10019, from: "/textures/entity/chest/normal_double.png", to: "entity/chest/normal_double.png" }
];

const TEXTURE_PACK_RULE_IDS = [
  SPRITESHEET_RULE_ID,
  ...EXTRA_TEXTURES.map(texture => texture.id)
];

// MFGEN:LOCAL_TEXTURES:start
const LOCAL_TEXTURES = [
  "entity/armorstand/wood.png",
  "entity/arrow.png",
  "entity/bed/black.png",
  "entity/bed/blue.png",
  "entity/bed/brown.png",
  "entity/bed/cyan.png",
  "entity/bed/gray.png",
  "entity/bed/green.png",
  "entity/bed/light_blue.png",
  "entity/bed/light_gray.png",
  "entity/bed/lime.png",
  "entity/bed/magenta.png",
  "entity/bed/orange.png",
  "entity/bed/pink.png",
  "entity/bed/purple.png",
  "entity/bed/red.png",
  "entity/bed/white.png",
  "entity/bed/yellow.png",
  "entity/boat/acacia.png",
  "entity/boat/birch.png",
  "entity/boat/dark_oak.png",
  "entity/boat/jungle.png",
  "entity/boat/oak.png",
  "entity/boat/spruce.png",
  "entity/cat/all_black.png",
  "entity/cat/black.png",
  "entity/cat/british_shorthair.png",
  "entity/cat/calico.png",
  "entity/cat/cat_collar.png",
  "entity/cat/jellie.png",
  "entity/cat/ocelot.png",
  "entity/cat/persian.png",
  "entity/cat/ragdoll.png",
  "entity/cat/red.png",
  "entity/cat/siamese.png",
  "entity/cat/tabby.png",
  "entity/cat/white.png",
  "entity/chicken/chicken.png",
  "entity/cow/cow.png",
  "entity/creeper/creeper.png",
  "entity/enchanting_table_book.png",
  "entity/experience_orb.png",
  "entity/ghost/ghost.png",
  "entity/minecart/minecart.png",
  "entity/pig/pig.png",
  "entity/sheep/sheep.png",
  "entity/sheep/sheep_fur.png",
  "entity/skeleton/sans.png",
  "entity/skeleton/skeleton.png",
  "entity/slime/slime.png",
  "entity/snowman/snowman.png",
  "entity/spider/spider.png",
  "entity/villager/butcher.png",
  "entity/villager/farmer.png",
  "entity/villager/librarian.png",
  "entity/villager/priest.png",
  "entity/villager/smith.png",
  "entity/wolf/wolf.png",
  "entity/wolf/wolf_angry.png",
  "entity/wolf/wolf_collar.png",
  "entity/wolf/wolf_tame.png",
  "entity/zombie/zombie.png",
  "entity/zombie_cowman/zombie_cowman.png",
  "mace.png",
  "misc/enchanted_item_glint.png",
  "models/armor/chainmail_layer_1.png",
  "models/armor/chainmail_layer_2.png",
  "models/armor/diamond_layer_1.png",
  "models/armor/diamond_layer_2.png",
  "models/armor/emerald_layer_1.png",
  "models/armor/emerald_layer_2.png",
  "models/armor/gold_layer_1.png",
  "models/armor/gold_layer_2.png",
  "models/armor/infernium_layer_1.png",
  "models/armor/infernium_layer_2.png",
  "models/armor/iron_layer_1.png",
  "models/armor/iron_layer_2.png",
  "models/armor/leather_layer_1.png",
  "models/armor/leather_layer_1_overlay.png",
  "models/armor/leather_layer_2.png",
  "models/armor/leather_layer_2_overlay.png",
  "particle/Sprite-0002.png",
  "particle/acacia_leaf_1.png",
  "particle/acacia_leaf_2.png",
  "particle/angry.png",
  "particle/azalea_leaf_1.png",
  "particle/azalea_leaf_2.png",
  "particle/azalea_leaf_3.png",
  "particle/azalea_leaf_4.png",
  "particle/azalea_leaf_5.png",
  "particle/azalea_leaf_6.png",
  "particle/bamboo_leaf_1.png",
  "particle/bamboo_leaf_2.png",
  "particle/bamboo_leaf_3.png",
  "particle/bamboo_leaf_4.png",
  "particle/barrier.png",
  "particle/birch_leaf_1.png",
  "particle/birch_leaf_2.png",
  "particle/birch_leaf_3.png",
  "particle/birch_leaf_4.png",
  "particle/birch_leaf_5.png",
  "particle/birch_leaf_6.png",
  "particle/brimwood_leaf_1.png",
  "particle/brimwood_leaf_2.png",
  "particle/brimwood_leaf_3.png",
  "particle/brimwood_leaf_4.png",
  "particle/brimwood_leaf_5.png",
  "particle/brimwood_leaf_6.png",
  "particle/bubble.png",
  "particle/cascade_0.png",
  "particle/cascade_1.png",
  "particle/cascade_10.png",
  "particle/cascade_11.png",
  "particle/cascade_2.png",
  "particle/cascade_3.png",
  "particle/cascade_4.png",
  "particle/cascade_5.png",
  "particle/cascade_6.png",
  "particle/cascade_7.png",
  "particle/cascade_8.png",
  "particle/cascade_9.png",
  "particle/critical_hit.png",
  "particle/drip_fall.png",
  "particle/drip_hang.png",
  "particle/drip_land.png",
  "particle/effect_0.png",
  "particle/effect_1.png",
  "particle/effect_2.png",
  "particle/effect_3.png",
  "particle/effect_4.png",
  "particle/ender_bubble.png",
  "particle/ender_bubble_pop_0.png",
  "particle/ender_bubble_pop_1.png",
  "particle/ender_bubble_pop_2.png",
  "particle/ender_bubble_pop_3.png",
  "particle/ender_bubble_pop_4.png",
  "particle/eucalyptus_leaf_1.png",
  "particle/eucalyptus_leaf_2.png",
  "particle/eucalyptus_leaf_3.png",
  "particle/eucalyptus_leaf_4.png",
  "particle/eucalyptus_leaf_5.png",
  "particle/eucalyptus_leaf_6.png",
  "particle/explosion_0.png",
  "particle/explosion_1.png",
  "particle/explosion_10.png",
  "particle/explosion_11.png",
  "particle/explosion_12.png",
  "particle/explosion_13.png",
  "particle/explosion_14.png",
  "particle/explosion_15.png",
  "particle/explosion_2.png",
  "particle/explosion_3.png",
  "particle/explosion_4.png",
  "particle/explosion_5.png",
  "particle/explosion_6.png",
  "particle/explosion_7.png",
  "particle/explosion_8.png",
  "particle/explosion_9.png",
  "particle/firefly.png",
  "particle/flame.png",
  "particle/generic_0.png",
  "particle/generic_1.png",
  "particle/generic_2.png",
  "particle/generic_3.png",
  "particle/generic_4.png",
  "particle/generic_5.png",
  "particle/generic_6.png",
  "particle/generic_7.png",
  "particle/glint.png",
  "particle/golden_larch_leaf_1.png",
  "particle/golden_larch_leaf_2.png",
  "particle/golden_larch_leaf_3.png",
  "particle/heart.png",
  "particle/jungle_leaf_1.png",
  "particle/jungle_leaf_2.png",
  "particle/jungle_leaf_3.png",
  "particle/kapok_leaf_1.png",
  "particle/kapok_leaf_2.png",
  "particle/kapok_leaf_3.png",
  "particle/kapok_leaf_4.png",
  "particle/larch_leaf_1.png",
  "particle/larch_leaf_2.png",
  "particle/larch_leaf_3.png",
  "particle/lava.png",
  "particle/magnolia_leaf_1.png",
  "particle/magnolia_leaf_2.png",
  "particle/magnolia_leaf_3.png",
  "particle/magnolia_leaf_4.png",
  "particle/magnolia_leaf_5.png",
  "particle/magnolia_leaf_6.png",
  "particle/mangrove_leaf_1.png",
  "particle/mangrove_leaf_2.png",
  "particle/mangrove_leaf_3.png",
  "particle/mangrove_leaf_4.png",
  "particle/mangrove_leaf_5.png",
  "particle/mangrove_leaf_6.png",
  "particle/maple_leaf_1.png",
  "particle/maple_leaf_2.png",
  "particle/maple_leaf_3.png",
  "particle/note.png",
  "particle/oak_leaf_1.png",
  "particle/oak_leaf_2.png",
  "particle/oak_leaf_3.png",
  "particle/oak_leaf_4.png",
  "particle/oak_leaf_5.png",
  "particle/oak_leaf_6.png",
  "particle/redwood_leaf_1.png",
  "particle/redwood_leaf_2.png",
  "particle/ru_baobab_leaf_1.png",
  "particle/ru_baobab_leaf_2.png",
  "particle/ru_baobab_leaf_3.png",
  "particle/ru_baobab_leaf_4.png",
  "particle/ru_cypress_leaf_1.png",
  "particle/ru_cypress_leaf_2.png",
  "particle/ru_palm_leaf_1.png",
  "particle/ru_palm_leaf_2.png",
  "particle/sga_a.png",
  "particle/sga_b.png",
  "particle/sga_c.png",
  "particle/sga_d.png",
  "particle/sga_e.png",
  "particle/sga_f.png",
  "particle/sga_g.png",
  "particle/sga_h.png",
  "particle/sga_i.png",
  "particle/sga_j.png",
  "particle/sga_k.png",
  "particle/sga_l.png",
  "particle/sga_m.png",
  "particle/sga_n.png",
  "particle/sga_o.png",
  "particle/sga_p.png",
  "particle/sga_q.png",
  "particle/sga_r.png",
  "particle/sga_s.png",
  "particle/sga_t.png",
  "particle/sga_u.png",
  "particle/sga_v.png",
  "particle/sga_w.png",
  "particle/sga_x.png",
  "particle/sga_y.png",
  "particle/sga_z.png",
  "particle/socotra_leaf_1.png",
  "particle/socotra_leaf_2.png",
  "particle/socotra_leaf_3.png",
  "particle/socotra_leaf_4.png",
  "particle/socotra_leaf_5.png",
  "particle/socotra_leaf_6.png",
  "particle/socotra_leaf_7.png",
  "particle/socotra_leaf_8.png",
  "particle/soul_fire_flame.png",
  "particle/spell_0.png",
  "particle/spell_1.png",
  "particle/spell_2.png",
  "particle/spell_3.png",
  "particle/spell_4.png",
  "particle/spell_5.png",
  "particle/spell_6.png",
  "particle/spell_7.png",
  "particle/splash_0.png",
  "particle/splash_1.png",
  "particle/splash_2.png",
  "particle/splash_3.png",
  "particle/spruce_leaf_1.png",
  "particle/spruce_leaf_2.png",
  "particle/water_ripple_1.png",
  "particle/water_ripple_2.png",
  "particle/water_ripple_3.png",
  "particle/water_ripple_4.png",
  "particle/water_ripple_5.png",
  "particle/water_ripple_6.png",
  "particle/water_ripple_7.png",
  "particle/water_splash_1.png",
  "particle/water_splash_2.png",
  "particle/water_splash_3.png",
  "particle/water_splash_4.png",
  "particle/water_splash_5.png",
  "particle/water_splash_6.png",
  "particle/water_splash_7.png",
  "particle/water_splash_8.png",
  "particle/water_splash_9.png",
  "particle/water_splash_foam_1.png",
  "particle/water_splash_foam_2.png",
  "particle/water_splash_foam_3.png",
  "particle/water_splash_foam_4.png",
  "particle/water_splash_foam_5.png",
  "particle/water_splash_foam_6.png",
  "particle/water_splash_foam_7.png",
  "particle/water_splash_foam_8.png",
  "particle/water_splash_foam_9.png",
  "particle/water_splash_ring_1.png",
  "particle/water_splash_ring_2.png",
  "particle/water_splash_ring_3.png",
  "particle/water_splash_ring_4.png",
  "particle/water_splash_ring_5.png",
  "particle/water_splash_ring_6.png",
  "particle/water_splash_ring_7.png",
  "particle/water_splash_ring_8.png",
  "particle/water_splash_ring_9.png",
  "particle/white_oak_leaf_1.png",
  "particle/white_oak_leaf_2.png",
  "particle/white_oak_leaf_3.png",
  "particle/white_oak_leaf_4.png",
  "particle/white_oak_leaf_5.png",
  "particle/white_oak_leaf_6.png",
  "particle/white_spruce_leaf_1.png",
  "particle/white_spruce_leaf_2.png",
  "particle/willow_leaf_1.png",
  "particle/willow_leaf_2.png",
  "particle/willow_leaf_3.png",
  "particle/willow_leaf_4.png",
  "particle/willow_leaf_5.png",
  "particle/willow_leaf_6.png",
  "particle/willow_leaf_7.png",
  "particle/willow_leaf_8.png",
  "particle/ww_baobab_leaf_1.png",
  "particle/ww_baobab_leaf_10.png",
  "particle/ww_baobab_leaf_2.png",
  "particle/ww_baobab_leaf_3.png",
  "particle/ww_baobab_leaf_4.png",
  "particle/ww_baobab_leaf_5.png",
  "particle/ww_baobab_leaf_6.png",
  "particle/ww_baobab_leaf_7.png",
  "particle/ww_baobab_leaf_8.png",
  "particle/ww_baobab_leaf_9.png",
  "particle/ww_cypress_leaf_1.png",
  "particle/ww_cypress_leaf_2.png",
  "particle/ww_cypress_leaf_3.png",
  "particle/ww_cypress_leaf_4.png",
  "particle/ww_cypress_leaf_5.png",
  "particle/ww_cypress_leaf_6.png",
  "particle/ww_palm_leaf_1.png",
  "particle/ww_palm_leaf_2.png",
  "particle/ww_palm_leaf_3.png",
  "particle/ww_palm_leaf_4.png",
  "spear/diamond_spear.png",
  "spear/golden_spear.png",
  "spear/infernium_spear.png",
  "spear/iron_spear.png",
  "spear/stone_spear.png",
  "spear/wooden_spear.png"
];
// MFGEN:LOCAL_TEXTURES:end

// MFGEN:MENU_UI_IMAGES:start
const MENU_UI_IMAGES = [
  
];
// MFGEN:MENU_UI_IMAGES:end

const LOCAL_TEXTURES_BASE_ID = 20000;
const LOCAL_TEXTURES_MAX_ID = 29999;
const LOCAL_TEXTURES_RULE_IDS = Array.from(
  { length: LOCAL_TEXTURES_MAX_ID - LOCAL_TEXTURES_BASE_ID + 1 },
  (_, i) => LOCAL_TEXTURES_BASE_ID + i
);
const MENU_UI_RULE_ID = 30000;

function buildLocalTextureRules(enabled) {
  if (!enabled) return [];
  return LOCAL_TEXTURES.map((rel, i) => ({
    id: LOCAL_TEXTURES_BASE_ID + i,
    priority: 2,
    action: { type: "redirect", redirect: { url: chrome.runtime.getURL("textures/" + rel) } },
    condition: {
      requestDomains: GAME_DOMAINS,
      urlFilter: `/textures/${rel}*`,
      resourceTypes: ["image", "other"]
    }
  }));
}

async function applyLocalTextures() {
  const { localTexturesEnabled } = await chrome.storage.local.get(["localTexturesEnabled"]);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: LOCAL_TEXTURES_RULE_IDS,
    addRules: buildLocalTextureRules(localTexturesEnabled !== false)
  });
}

async function applyMenuUi() {
  const { menuUiOverrideEnabled } = await chrome.storage.local.get(["menuUiOverrideEnabled"]);
  const rules = (menuUiOverrideEnabled !== false && MENU_UI_IMAGES.length)
    ? MENU_UI_IMAGES.map((name, i) => {
        const stem = name.replace(/\.(webp|png|jpg)$/i, "");
        return {
          id: MENU_UI_RULE_ID + i,
          priority: 1,
          action: { type: "redirect", redirect: { url: chrome.runtime.getURL("assets/menu/" + name) } },
          condition: {
            requestDomains: GAME_DOMAINS,
            urlFilter: `/assets/${stem}-*`,
            resourceTypes: ["image", "other"]
          }
        };
      })
    : [];
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: MENU_UI_IMAGES.map((_, i) => MENU_UI_RULE_ID + i),
    addRules: rules
  });
}

async function applySpritesheet() {
  const { spritesheetEnabled } = await chrome.storage.local.get(["spritesheetEnabled"]);
  const spritesheetUrl = await getActiveSpritesheetUrl();

  // URL null = ninguna fuente disponible: dejar solo las reglas extra de
  // entidades y NO redirigir el spritesheet principal (evita drawImage roto)
  const spritesheetRules = (spritesheetEnabled !== false && spritesheetUrl)
    ? [{
        id: SPRITESHEET_RULE_ID,
        priority: 1,
        action: { type: "redirect", redirect: { url: spritesheetUrl } },
        condition: {
          requestDomains: GAME_DOMAINS,
          urlFilter: "/textures/spritesheet*",
          resourceTypes: ["image", "other"]
        }
      }]
    : [];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: TEXTURE_PACK_RULE_IDS,
    addRules: [
      ...spritesheetRules,
      ...EXTRA_TEXTURES.map(texture => ({
        id: texture.id,
        priority: 1,
        action: { type: "redirect", redirect: { url: TEXTURE_PACK_REDIRECT_BASE + texture.to } },
        condition: {
          requestDomains: GAME_DOMAINS,
          urlFilter: `${texture.from}*`,
          resourceTypes: ["image", "other"]
        }
      }))
    ]
  });
}

// MFGEN:LOCAL_TEXTURES:start
const LOCAL_TEXTURES = [
  "entity/armorstand/wood.png",
  "entity/arrow.png",
  "entity/bed/black.png",
  "entity/bed/blue.png",
  "entity/bed/brown.png",
  "entity/bed/cyan.png",
  "entity/bed/gray.png",
  "entity/bed/green.png",
  "entity/bed/light_blue.png",
  "entity/bed/light_gray.png",
  "entity/bed/lime.png",
  "entity/bed/magenta.png",
  "entity/bed/orange.png",
  "entity/bed/pink.png",
  "entity/bed/purple.png",
  "entity/bed/red.png",
  "entity/bed/white.png",
  "entity/bed/yellow.png",
  "entity/boat/acacia.png",
  "entity/boat/birch.png",
  "entity/boat/dark_oak.png",
  "entity/boat/jungle.png",
  "entity/boat/oak.png",
  "entity/boat/spruce.png",
  "entity/cat/all_black.png",
  "entity/cat/black.png",
  "entity/cat/british_shorthair.png",
  "entity/cat/calico.png",
  "entity/cat/cat_collar.png",
  "entity/cat/jellie.png",
  "entity/cat/ocelot.png",
  "entity/cat/persian.png",
  "entity/cat/ragdoll.png",
  "entity/cat/red.png",
  "entity/cat/siamese.png",
  "entity/cat/tabby.png",
  "entity/cat/white.png",
  "entity/chicken/chicken.png",
  "entity/cow/cow.png",
  "entity/creeper/creeper.png",
  "entity/enchanting_table_book.png",
  "entity/experience_orb.png",
  "entity/ghost/ghost.png",
  "entity/minecart/minecart.png",
  "entity/pig/pig.png",
  "entity/sheep/sheep.png",
  "entity/sheep/sheep_fur.png",
  "entity/skeleton/sans.png",
  "entity/skeleton/skeleton.png",
  "entity/slime/slime.png",
  "entity/snowman/snowman.png",
  "entity/spider/spider.png",
  "entity/villager/butcher.png",
  "entity/villager/farmer.png",
  "entity/villager/librarian.png",
  "entity/villager/priest.png",
  "entity/villager/smith.png",
  "entity/wolf/wolf.png",
  "entity/wolf/wolf_angry.png",
  "entity/wolf/wolf_collar.png",
  "entity/wolf/wolf_tame.png",
  "entity/zombie/zombie.png",
  "entity/zombie_cowman/zombie_cowman.png",
  "mace.png",
  "misc/enchanted_item_glint.png",
  "models/armor/chainmail_layer_1.png",
  "models/armor/chainmail_layer_2.png",
  "models/armor/diamond_layer_1.png",
  "models/armor/diamond_layer_2.png",
  "models/armor/emerald_layer_1.png",
  "models/armor/emerald_layer_2.png",
  "models/armor/gold_layer_1.png",
  "models/armor/gold_layer_2.png",
  "models/armor/infernium_layer_1.png",
  "models/armor/infernium_layer_2.png",
  "models/armor/iron_layer_1.png",
  "models/armor/iron_layer_2.png",
  "models/armor/leather_layer_1.png",
  "models/armor/leather_layer_1_overlay.png",
  "models/armor/leather_layer_2.png",
  "models/armor/leather_layer_2_overlay.png",
  "particle/Sprite-0002.png",
  "particle/acacia_leaf_1.png",
  "particle/acacia_leaf_2.png",
  "particle/angry.png",
  "particle/azalea_leaf_1.png",
  "particle/azalea_leaf_2.png",
  "particle/azalea_leaf_3.png",
  "particle/azalea_leaf_4.png",
  "particle/azalea_leaf_5.png",
  "particle/azalea_leaf_6.png",
  "particle/bamboo_leaf_1.png",
  "particle/bamboo_leaf_2.png",
  "particle/bamboo_leaf_3.png",
  "particle/bamboo_leaf_4.png",
  "particle/barrier.png",
  "particle/birch_leaf_1.png",
  "particle/birch_leaf_2.png",
  "particle/birch_leaf_3.png",
  "particle/birch_leaf_4.png",
  "particle/birch_leaf_5.png",
  "particle/birch_leaf_6.png",
  "particle/brimwood_leaf_1.png",
  "particle/brimwood_leaf_2.png",
  "particle/brimwood_leaf_3.png",
  "particle/brimwood_leaf_4.png",
  "particle/brimwood_leaf_5.png",
  "particle/brimwood_leaf_6.png",
  "particle/bubble.png",
  "particle/cascade_0.png",
  "particle/cascade_1.png",
  "particle/cascade_10.png",
  "particle/cascade_11.png",
  "particle/cascade_2.png",
  "particle/cascade_3.png",
  "particle/cascade_4.png",
  "particle/cascade_5.png",
  "particle/cascade_6.png",
  "particle/cascade_7.png",
  "particle/cascade_8.png",
  "particle/cascade_9.png",
  "particle/critical_hit.png",
  "particle/drip_fall.png",
  "particle/drip_hang.png",
  "particle/drip_land.png",
  "particle/effect_0.png",
  "particle/effect_1.png",
  "particle/effect_2.png",
  "particle/effect_3.png",
  "particle/effect_4.png",
  "particle/effect_5.png",
  "particle/effect_6.png",
  "particle/effect_7.png",
  "particle/ender_bubble.png",
  "particle/ender_bubble_pop_0.png",
  "particle/ender_bubble_pop_1.png",
  "particle/ender_bubble_pop_2.png",
  "particle/ender_bubble_pop_3.png",
  "particle/ender_bubble_pop_4.png",
  "particle/eucalyptus_leaf_1.png",
  "particle/eucalyptus_leaf_2.png",
  "particle/eucalyptus_leaf_3.png",
  "particle/eucalyptus_leaf_4.png",
  "particle/eucalyptus_leaf_5.png",
  "particle/eucalyptus_leaf_6.png",
  "particle/explosion_0.png",
  "particle/explosion_1.png",
  "particle/explosion_10.png",
  "particle/explosion_11.png",
  "particle/explosion_12.png",
  "particle/explosion_13.png",
  "particle/explosion_14.png",
  "particle/explosion_15.png",
  "particle/explosion_2.png",
  "particle/explosion_3.png",
  "particle/explosion_4.png",
  "particle/explosion_5.png",
  "particle/explosion_6.png",
  "particle/explosion_7.png",
  "particle/explosion_8.png",
  "particle/explosion_9.png",
  "particle/firefly.png",
  "particle/flame.png",
  "particle/generic_0.png",
  "particle/generic_1.png",
  "particle/generic_2.png",
  "particle/generic_3.png",
  "particle/generic_4.png",
  "particle/generic_5.png",
  "particle/generic_6.png",
  "particle/generic_7.png",
  "particle/glint.png",
  "particle/golden_larch_leaf_1.png",
  "particle/golden_larch_leaf_2.png",
  "particle/golden_larch_leaf_3.png",
  "particle/heart.png",
  "particle/jungle_leaf_1.png",
  "particle/jungle_leaf_2.png",
  "particle/jungle_leaf_3.png",
  "particle/kapok_leaf_1.png",
  "particle/kapok_leaf_2.png",
  "particle/kapok_leaf_3.png",
  "particle/kapok_leaf_4.png",
  "particle/larch_leaf_1.png",
  "particle/larch_leaf_2.png",
  "particle/larch_leaf_3.png",
  "particle/lava.png",
  "particle/magnolia_leaf_1.png",
  "particle/magnolia_leaf_2.png",
  "particle/magnolia_leaf_3.png",
  "particle/magnolia_leaf_4.png",
  "particle/magnolia_leaf_5.png",
  "particle/magnolia_leaf_6.png",
  "particle/mangrove_leaf_1.png",
  "particle/mangrove_leaf_2.png",
  "particle/mangrove_leaf_3.png",
  "particle/mangrove_leaf_4.png",
  "particle/mangrove_leaf_5.png",
  "particle/mangrove_leaf_6.png",
  "particle/maple_leaf_1.png",
  "particle/maple_leaf_2.png",
  "particle/maple_leaf_3.png",
  "particle/note.png",
  "particle/oak_leaf_1.png",
  "particle/oak_leaf_2.png",
  "particle/oak_leaf_3.png",
  "particle/oak_leaf_4.png",
  "particle/oak_leaf_5.png",
  "particle/oak_leaf_6.png",
  "particle/redwood_leaf_1.png",
  "particle/redwood_leaf_2.png",
  "particle/ru_baobab_leaf_1.png",
  "particle/ru_baobab_leaf_2.png",
  "particle/ru_baobab_leaf_3.png",
  "particle/ru_baobab_leaf_4.png",
  "particle/ru_cypress_leaf_1.png",
  "particle/ru_cypress_leaf_2.png",
  "particle/ru_palm_leaf_1.png",
  "particle/ru_palm_leaf_2.png",
  "particle/sga_a.png",
  "particle/sga_b.png",
  "particle/sga_c.png",
  "particle/sga_d.png",
  "particle/sga_e.png",
  "particle/sga_f.png",
  "particle/sga_g.png",
  "particle/sga_h.png",
  "particle/sga_i.png",
  "particle/sga_j.png",
  "particle/sga_k.png",
  "particle/sga_l.png",
  "particle/sga_m.png",
  "particle/sga_n.png",
  "particle/sga_o.png",
  "particle/sga_p.png",
  "particle/sga_q.png",
  "particle/sga_r.png",
  "particle/sga_s.png",
  "particle/sga_t.png",
  "particle/sga_u.png",
  "particle/sga_v.png",
  "particle/sga_w.png",
  "particle/sga_x.png",
  "particle/sga_y.png",
  "particle/sga_z.png",
  "particle/socotra_leaf_1.png",
  "particle/socotra_leaf_2.png",
  "particle/socotra_leaf_3.png",
  "particle/socotra_leaf_4.png",
  "particle/socotra_leaf_5.png",
  "particle/socotra_leaf_6.png",
  "particle/socotra_leaf_7.png",
  "particle/socotra_leaf_8.png",
  "particle/soul_fire_flame.png",
  "particle/spell_0.png",
  "particle/spell_1.png",
  "particle/spell_2.png",
  "particle/spell_3.png",
  "particle/spell_4.png",
  "particle/spell_5.png",
  "particle/spell_6.png",
  "particle/spell_7.png",
  "particle/splash_0.png",
  "particle/splash_1.png",
  "particle/splash_2.png",
  "particle/splash_3.png",
  "particle/spruce_leaf_1.png",
  "particle/spruce_leaf_2.png",
  "particle/water_ripple_1.png",
  "particle/water_ripple_2.png",
  "particle/water_ripple_3.png",
  "particle/water_ripple_4.png",
  "particle/water_ripple_5.png",
  "particle/water_ripple_6.png",
  "particle/water_ripple_7.png",
  "particle/water_splash_1.png",
  "particle/water_splash_2.png",
  "particle/water_splash_3.png",
  "particle/water_splash_4.png",
  "particle/water_splash_5.png",
  "particle/water_splash_6.png",
  "particle/water_splash_7.png",
  "particle/water_splash_8.png",
  "particle/water_splash_9.png",
  "particle/water_splash_foam_1.png",
  "particle/water_splash_foam_2.png",
  "particle/water_splash_foam_3.png",
  "particle/water_splash_foam_4.png",
  "particle/water_splash_foam_5.png",
  "particle/water_splash_foam_6.png",
  "particle/water_splash_foam_7.png",
  "particle/water_splash_foam_8.png",
  "particle/water_splash_foam_9.png",
  "particle/water_splash_ring_1.png",
  "particle/water_splash_ring_2.png",
  "particle/water_splash_ring_3.png",
  "particle/water_splash_ring_4.png",
  "particle/water_splash_ring_5.png",
  "particle/water_splash_ring_6.png",
  "particle/water_splash_ring_7.png",
  "particle/water_splash_ring_8.png",
  "particle/water_splash_ring_9.png",
  "particle/white_oak_leaf_1.png",
  "particle/white_oak_leaf_2.png",
  "particle/white_oak_leaf_3.png",
  "particle/white_oak_leaf_4.png",
  "particle/white_oak_leaf_5.png",
  "particle/white_oak_leaf_6.png",
  "particle/white_spruce_leaf_1.png",
  "particle/white_spruce_leaf_2.png",
  "particle/willow_leaf_1.png",
  "particle/willow_leaf_2.png",
  "particle/willow_leaf_3.png",
  "particle/willow_leaf_4.png",
  "particle/willow_leaf_5.png",
  "particle/willow_leaf_6.png",
  "particle/willow_leaf_7.png",
  "particle/willow_leaf_8.png",
  "particle/ww_baobab_leaf_1.png",
  "particle/ww_baobab_leaf_10.png",
  "particle/ww_baobab_leaf_2.png",
  "particle/ww_baobab_leaf_3.png",
  "particle/ww_baobab_leaf_4.png",
  "particle/ww_baobab_leaf_5.png",
  "particle/ww_baobab_leaf_6.png",
  "particle/ww_baobab_leaf_7.png",
  "particle/ww_baobab_leaf_8.png",
  "particle/ww_baobab_leaf_9.png",
  "particle/ww_cypress_leaf_1.png",
  "particle/ww_cypress_leaf_2.png",
  "particle/ww_cypress_leaf_3.png",
  "particle/ww_cypress_leaf_4.png",
  "particle/ww_cypress_leaf_5.png",
  "particle/ww_cypress_leaf_6.png",
  "particle/ww_palm_leaf_1.png",
  "particle/ww_palm_leaf_2.png",
  "particle/ww_palm_leaf_3.png",
  "particle/ww_palm_leaf_4.png",
  "spear/diamond_spear.png",
  "spear/golden_spear.png",
  "spear/infernium_spear.png",
  "spear/iron_spear.png",
  "spear/stone_spear.png",
  "spear/wooden_spear.png"
];
// MFGEN:LOCAL_TEXTURES:end

// MFGEN:MENU_UI_IMAGES:start
const MENU_UI_IMAGES = [
  
];
// MFGEN:MENU_UI_IMAGES:end

const LOCAL_TEXTURES_BASE_ID = 20000;
const LOCAL_TEXTURES_MAX_ID = 29999;
const LOCAL_TEXTURES_RULE_IDS = Array.from(
  { length: LOCAL_TEXTURES_MAX_ID - LOCAL_TEXTURES_BASE_ID + 1 },
  (_, i) => LOCAL_TEXTURES_BASE_ID + i
);
const MENU_UI_RULE_ID = 30000;

function buildLocalTextureRules(enabled) {
  if (!enabled) return [];
  return LOCAL_TEXTURES.map((rel, i) => ({
    id: LOCAL_TEXTURES_BASE_ID + i,
    priority: 2,
    action: { type: "redirect", redirect: { url: chrome.runtime.getURL("textures/" + rel) } },
    condition: {
      requestDomains: GAME_DOMAINS,
      urlFilter: `/textures/${rel}*`,
      resourceTypes: ["image", "other"]
    }
  }));
}

async function applyLocalTextures() {
  const { localTexturesEnabled } = await chrome.storage.local.get(["localTexturesEnabled"]);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: LOCAL_TEXTURES_RULE_IDS,
    addRules: buildLocalTextureRules(localTexturesEnabled !== false)
  });
}

async function applyMenuUi() {
  const { menuUiOverrideEnabled } = await chrome.storage.local.get(["menuUiOverrideEnabled"]);
  const rules = (menuUiOverrideEnabled !== false && MENU_UI_IMAGES.length)
    ? MENU_UI_IMAGES.map((name, i) => {
        const stem = name.replace(/\.(webp|png|jpg)$/i, "");
        return {
          id: MENU_UI_RULE_ID + i,
          priority: 1,
          action: { type: "redirect", redirect: { url: chrome.runtime.getURL("assets/menu/" + name) } },
          condition: {
            requestDomains: GAME_DOMAINS,
            urlFilter: `/assets/${stem}-*`,
            resourceTypes: ["image", "other"]
          }
        };
      })
    : [];
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: MENU_UI_IMAGES.map((_, i) => MENU_UI_RULE_ID + i),
    addRules: rules
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "setSpritesheet") {
    chrome.storage.local.set({ spritesheetEnabled: message.enabled })
      .then(applySpritesheet)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "getSpritesheet") {
    chrome.storage.local.get(["spritesheetEnabled"]).then(data => {
      sendResponse({ success: true, enabled: data.spritesheetEnabled !== false });
    });
    return true;
  }

  if (message.type === "setCustomSpritesheet") {
    const url = message.url || null;
    chrome.storage.local.set({ mfCustomSpritesheetUrl: url })
      .then(applySpritesheet)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "getCustomSpritesheet") {
    chrome.storage.local.get(["mfCustomSpritesheetUrl"]).then(data => {
      sendResponse({ success: true, url: data.mfCustomSpritesheetUrl || null });
    });
    return true;
  }

  if (message.type === "setLocalTextures") {
    chrome.storage.local.set({ localTexturesEnabled: message.enabled })
      .then(applyLocalTextures)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "getLocalTextures") {
    chrome.storage.local.get(["localTexturesEnabled"]).then(data => {
      sendResponse({ success: true, enabled: data.localTexturesEnabled !== false });
    });
    return true;
  }

  if (message.type === "setMenuUiOverride") {
    chrome.storage.local.set({ menuUiOverrideEnabled: message.enabled })
      .then(applyMenuUi)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "getMenuUiOverride") {
    chrome.storage.local.get(["menuUiOverrideEnabled"]).then(data => {
      sendResponse({ success: true, enabled: data.menuUiOverrideEnabled !== false });
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["settings", "spritesheetEnabled"]);
  await chrome.storage.local.set({
    settings: {
      rebrand: existing.settings?.rebrand ?? true,
      supportAds: existing.settings?.supportAds ?? false,
      discord: existing.settings?.discord ?? true,
      keystrokes: existing.settings?.keystrokes ?? true,
      language: existing.settings?.language ?? "en"
    },
    spritesheetEnabled: existing.spritesheetEnabled !== false
  });
  await applySpritesheet();
  await applyLocalTextures();
  await applyMenuUi();
});

applySpritesheet();
applyLocalTextures();
applyMenuUi();
