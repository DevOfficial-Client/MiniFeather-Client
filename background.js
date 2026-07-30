const SKINS = [
  "alice", "bob", "techno", "thebiggelo", "corrupted", "diana", "strange", "endoskeleton",
  "ganyu", "georgenotfound", "holly", "hutao", "jake", "james", "klee", "kyoko",
  "adele", "chris", "deadpool", "galactus", "heather", "ironman", "suit", "levi", "lexi",
  "natalie", "remus", "sara", "transformer", "vindicate", "adventure", "aether", "apex",
  "ariel", "aurora", "celeste", "cody", "ember", "finn", "glory", "hunter", "katie",
  "nova", "panda", "raven", "seraphina", "vain", "zane"
];

function getRuleIdForSkin(skinName) {
  const index = SKINS.indexOf(skinName);
  if (index === -1) throw new Error(`Unknown skin: ${skinName}`);
  return 1000 + index;
}

async function updateSkin(skinName, customUrl = null) {
  const originalUrl = `https://miniblox.io/textures/entity/skins/${skinName}.png`;
  const urlToRedirect = customUrl || originalUrl;
  const ruleId = getRuleIdForSkin(skinName);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId],
    addRules: [{
      id: ruleId,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { url: urlToRedirect }
      },
      condition: {
        urlFilter: `https://miniblox.io/textures/entity/skins/${skinName}.png*`,
        resourceTypes: ["image"]
      }
    }]
  });

  const { currentSkins = {} } = await chrome.storage.local.get(["currentSkins"]);
  currentSkins[skinName] = urlToRedirect;
  await chrome.storage.local.set({ currentSkins });
}

async function resetSkin(skinName) {
  const ruleId = getRuleIdForSkin(skinName);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId]
  });

  const { currentSkins = {} } = await chrome.storage.local.get(["currentSkins"]);
  delete currentSkins[skinName];
  await chrome.storage.local.set({ currentSkins });
}

async function resetAllSkins() {
  const { currentSkins = {} } = await chrome.storage.local.get(["currentSkins"]);
  const ruleIds = Object.keys(currentSkins).map(name => {
    try { return getRuleIdForSkin(name); } catch { return null; }
  }).filter(Boolean);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ruleIds
  });

  await chrome.storage.local.set({ currentSkins: {} });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "setSkin") {
    updateSkin(message.skinName, message.customUrl)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === "resetSkin") {
    resetSkin(message.skinName)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === "resetAllSkins") {
    resetAllSkins()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === "getSkins") {
    chrome.storage.local.get(["currentSkins"]).then(data => {
      sendResponse({ success: true, skins: data.currentSkins || {} });
    });
    return true;
  } else if (message.type === "getSkinList") {
    sendResponse({ success: true, skins: SKINS });
  }
});

const SPRITESHEET_URL = "https://raw.githubusercontent.com/EstebanGrp/MiniFeather-Client/refs/heads/main/spritesheet.png";
const SPRITESHEET_RULE_ID = 999;

async function applySpritesheet() {
  const { spritesheetEnabled } = await chrome.storage.local.get(["spritesheetEnabled"]);
  if (spritesheetEnabled === false) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [SPRITESHEET_RULE_ID]
    });
    return;
  }
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [SPRITESHEET_RULE_ID],
    addRules: [{
      id: SPRITESHEET_RULE_ID,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { url: SPRITESHEET_URL }
      },
      condition: {
        urlFilter: "miniblox.io/textures/spritesheet*",
        resourceTypes: ["image", "other"]
      }
    }]
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "setSpritesheet") {
    chrome.storage.local.set({ spritesheetEnabled: message.enabled }).then(() => applySpritesheet()).then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.type === "getSpritesheet") {
    chrome.storage.local.get(["spritesheetEnabled"]).then(data => {
      sendResponse({ success: true, enabled: data.spritesheetEnabled !== false });
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    settings: {
      rebrand: true,
      supportAds: false,
      discord: true,
      keystrokes: true
    },
    spritesheetEnabled: true
  });
  await applySpritesheet();
});

applySpritesheet();
