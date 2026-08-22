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
});

applySpritesheet();
