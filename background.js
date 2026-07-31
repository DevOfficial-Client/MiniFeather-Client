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

const ASSET_TYPES = {
  skin: {
    names: SKINS,
    baseUrl: "https://miniblox.io/textures/entity/skins/",
    ruleOffset: 1000,
    storageKey: "currentSkins"
  },
  cape: {
    names: CAPES,
    baseUrl: "https://miniblox.io/textures/entity/capes/",
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
  const originalUrl = `${config.baseUrl}${name}.png`;
  const redirectUrl = customUrl || originalUrl;
  const ruleId = getRuleId(type, name);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId],
    addRules: [{
      id: ruleId,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { url: redirectUrl }
      },
      condition: {
        urlFilter: `${originalUrl}*`,
        resourceTypes: ["image", "other"]
      }
    }]
  });

  const stored = await chrome.storage.local.get([config.storageKey]);
  const activeAssets = stored[config.storageKey] || {};
  activeAssets[name] = redirectUrl;
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

const SPRITESHEET_URL = "https://raw.githubusercontent.com/EstebanGrp/MiniFeather-Client/refs/heads/main/spritesheet.png";
const SPRITESHEET_RULE_ID = 999;

async function applySpritesheet() {
  const { spritesheetEnabled } = await chrome.storage.local.get(["spritesheetEnabled"]);

  const ruleIds = [
    SPRITESHEET_RULE_ID,
    ...EXTRA_TEXTURES.map(texture => texture.id)
  ];

  if (spritesheetEnabled === false) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIds
    });
    return;
  }

  const rules = [
    {
      id: SPRITESHEET_RULE_ID,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          url: SPRITESHEET_URL
        }
      },
      condition: {
        urlFilter: "miniblox.io/textures/spritesheet*",
        resourceTypes: ["image", "other"]
      }
    },

    ...EXTRA_TEXTURES.map(texture => ({
      id: texture.id,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          url: texture.to
        }
      },
      condition: {
        urlFilter: `${texture.from}*`,
        resourceTypes: ["image", "other"]
      }
    }))
  ];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ruleIds,
    addRules: rules
  });
}
