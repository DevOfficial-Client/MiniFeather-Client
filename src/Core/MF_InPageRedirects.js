/*
 * MiniFeather Client — MF_InPageRedirects
 * Sustituto in-página de las reglas declarativeNetRequest del background para entornos
 * sin extensión (userscript y app Android). Replica los redirects activos del client:
 *  - /textures/spritesheet*          → spritesheet activo (custom | pvtexpack)
 *  - EXTRA_TEXTURES (armaduras/mobs) → pack de texturas del auth-api de MiniBlox
 *  - texturas locales (si activas)   → copia local del client (assetBase)
 *  - skins/capas custom              → URL configurada (currentSkins/currentCapes)
 * Parchea fetch, XMLHttpRequest.open y el src de <img>; todo lo demás pasa intacto.
 */
(function () {
  'use strict';
  if (window.__MF_IN_PAGE_REDIRECTS__) return;
  window.__MF_IN_PAGE_REDIRECTS__ = true;

  const SHIM = window.__MF_SHIM__;
  if (!SHIM) return;
  const BASE = SHIM.assetBase();

  const GAME_HOSTS = new Set(["miniblox.io", "miniblox.online"]);
  const TEXTURE_PACK_REDIRECT_BASE = "https://miniblox.io/auth-api/texturepacks/user/0870278c-abeb-4e7c-825c-a0bfa845704f/minecraft-texture-pack/";

  const EXTRA_TEXTURES = [
    { from: "/textures/armor/leather_layer_1.png", to: "armor/leather_layer_1.png" },
    { from: "/textures/armor/leather_layer_2.png", to: "armor/leather_layer_2.png" },
    { from: "/textures/armor/gold_layer_1.png", to: "armor/gold_layer_1.png" },
    { from: "/textures/armor/gold_layer_2.png", to: "armor/gold_layer_2.png" },
    { from: "/textures/armor/chainmail_layer_1.png", to: "armor/chainmail_layer_1.png" },
    { from: "/textures/armor/chainmail_layer_2.png", to: "armor/chainmail_layer_2.png" },
    { from: "/textures/armor/iron_layer_1.png", to: "armor/iron_layer_1.png" },
    { from: "/textures/armor/iron_layer_2.png", to: "armor/iron_layer_2.png" },
    { from: "/textures/armor/diamond_layer_1.png", to: "armor/diamond_layer_1.png" },
    { from: "/textures/armor/diamond_layer_2.png", to: "armor/diamond_layer_2.png" },
    { from: "/textures/entity/sheep/sheep.png", to: "entity/sheep/sheep.png" },
    { from: "/textures/entity/spider/spider.png", to: "entity/spider/spider.png" },
    { from: "/textures/entity/zombie/zombie.png", to: "entity/zombie/zombie.png" },
    { from: "/textures/entity/skeleton/skeleton.png", to: "entity/skeleton/skeleton.png" },
    { from: "/textures/entity/creeper/creeper.png", to: "entity/creeper/creeper.png" },
    { from: "/textures/entity/slime/slime.png", to: "entity/slime/slime.png" },
    { from: "/textures/entity/wolf/wolf.png", to: "entity/wolf/wolf.png" },
    { from: "/textures/entity/villager/villager.png", to: "entity/villager/villager.png" },
    { from: "/textures/entity/iron_golem/iron_golem.png", to: "entity/iron_golem/iron_golem.png" },
    { from: "/textures/entity/chest/normal_double.png", to: "entity/chest/normal_double.png" }
  ];

  // Prefs cacheadas (se refrescan vía storage.onChanged)
  const prefs = {
    spritesheetEnabled: true,
    localTexturesEnabled: true,
    customSpritesheetUrl: null,
    currentSkins: {},
    currentCapes: {}
  };

  function applyStorage(stored) {
    if (!stored) return;
    if (stored.spritesheetEnabled !== undefined) prefs.spritesheetEnabled = stored.spritesheetEnabled !== false;
    if (stored.localTexturesEnabled !== undefined) prefs.localTexturesEnabled = stored.localTexturesEnabled !== false;
    if (stored.mfCustomSpritesheetUrl !== undefined) prefs.customSpritesheetUrl = stored.mfCustomSpritesheetUrl || null;
    if (stored.currentSkins) prefs.currentSkins = stored.currentSkins || {};
    if (stored.currentCapes) prefs.currentCapes = stored.currentCapes || {};
  }
  chrome.storage.local.get(null).then(applyStorage).catch(() => {});
  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      applyStorage({
        spritesheetEnabled: changes.spritesheetEnabled ? changes.spritesheetEnabled.newValue : undefined,
        localTexturesEnabled: changes.localTexturesEnabled ? changes.localTexturesEnabled.newValue : undefined,
        mfCustomSpritesheetUrl: changes.mfCustomSpritesheetUrl ? changes.mfCustomSpritesheetUrl.newValue : undefined,
        currentSkins: changes.currentSkins ? changes.currentSkins.newValue : undefined,
        currentCapes: changes.currentCapes ? changes.currentCapes.newValue : undefined
      });
    });
  }

  function activeSpritesheetUrl() {
    if (prefs.customSpritesheetUrl) return prefs.customSpritesheetUrl;
    return BASE + 'assets/pvtexpack.png';
  }

  function rewriteUrl(raw) {
    if (!raw || typeof raw !== 'string') return null;
    if (raw.indexOf('data:') === 0 || raw.indexOf('blob:') === 0) return null;
    let u;
    try { u = new URL(raw, location.href); } catch (_) { return null; }
    if (u.protocol !== 'https:' || !GAME_HOSTS.has(u.hostname)) return null;
    const path = u.pathname;

    // skins / capas custom (exacto: /textures/entity/{skins|capes}/{name}.png)
    const skinMatch = /^\/textures\/entity\/skins\/([A-Za-z0-9_-]+)\.png$/.exec(path);
    if (skinMatch) {
      const custom = prefs.currentSkins[skinMatch[1]];
      if (custom && /^https?:\/\//i.test(custom)) return custom;
    }
    const capeMatch = /^\/textures\/entity\/capes\/([A-Za-z0-9_-]+)\.png$/.exec(path);
    if (capeMatch) {
      const custom = prefs.currentCapes[capeMatch[1]];
      if (custom && /^https?:\/\//i.test(custom)) return custom;
    }

    // spritesheet (prefijo /textures/spritesheet, como el urlFilter "/textures/spritesheet*")
    if (prefs.spritesheetEnabled !== false && path.indexOf('/textures/spritesheet') === 0) {
      return activeSpritesheetUrl();
    }

    // EXTRA_TEXTURES → pack del auth-api (prefijo, igual que DNR `${from}*`)
    for (const t of EXTRA_TEXTURES) {
      if (path.indexOf(t.from) === 0) return TEXTURE_PACK_REDIRECT_BASE + t.to;
    }

    return null;
  }

  // ---- fetch ----
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      try {
        if (typeof input === 'string') {
          const r = rewriteUrl(input);
          if (r) return origFetch.call(this, r, init);
        } else if (input && typeof input === 'object' && typeof input.url === 'string') {
          const r = rewriteUrl(input.url);
          if (r) {
            if (typeof Request === 'function' && input instanceof Request) {
              return origFetch.call(this, new Request(r, input), init);
            }
            return origFetch.call(this, r, init);
          }
        }
      } catch (_) {}
      return origFetch.apply(this, arguments);
    };
  }

  // ---- XMLHttpRequest ----
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        if (typeof url === 'string') {
          const r = rewriteUrl(url);
          if (r) {
            const args = Array.prototype.slice.call(arguments);
            args[1] = r;
            return origOpen.apply(this, args);
          }
        }
      } catch (_) {}
      return origOpen.apply(this, arguments);
    };
  } catch (_) {}

  // ---- <img src> ----
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (desc && desc.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        enumerable: desc.enumerable,
        get() { return desc.get.call(this); },
        set(value) {
          try {
            const r = rewriteUrl(value);
            if (r) value = r;
          } catch (_) {}
          desc.set.call(this, value);
        }
      });
    }
    const origSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      try {
        if (this instanceof HTMLImageElement && String(name).toLowerCase() === 'src' && typeof value === 'string') {
          const r = rewriteUrl(value);
          if (r) value = r;
        }
      } catch (_) {}
      return origSetAttr.call(this, name, value);
    };
  } catch (_) {}
})();
