(() => {
  'use strict';

  // MiniFeather Legacy Skins 4.9.4
  // Keeps only the useful hidden-skin unlock from the old "Miniblox Unlocked"
  // extension. It does not modify world creation, requests, or world types.

  if (window.top !== window.self) return;
  if (window.__MF_LEGACY_UNLOCKS_494__) return;
  window.__MF_LEGACY_UNLOCKS_494__ = true;

  const SECRET_SKIN_IDS = [
    'duck',
    'ethan',
    'cat',
    'tester',
    'remlin',
    'sushi',
    'qhyun',
    'banana'
  ];

  // Only add slime if the current game actually exposes it in its catalog.
  const OPTIONAL_SECRET_SKINS = ['slime'];

  const state = {
    moduleUrl: null,
    skinCatalog: null,
    unlockedSkins: [],
    skinReady: false,
    lastError: null,
    destroyed: false
  };

  function dispatch(name, detail = {}) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      document.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {}
  }

  function findIndexModuleUrl() {
    const urls = [];

    try {
      for (const s of document.querySelectorAll('script[src]')) urls.push(s.src);
    } catch {}

    try {
      for (const e of performance.getEntriesByType('resource')) urls.push(e.name);
    } catch {}

    // Prefer the main Vite index module, not source maps or chunks.
    return [...new Set(urls)]
      .filter(Boolean)
      .find(url => {
        try {
          const u = new URL(url, location.href);
          return /\/assets\/index-[^/]+\.js$/i.test(u.pathname);
        } catch {
          return false;
        }
      }) || null;
  }

  function looksLikeSkinCatalog(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      return value.bob?.id === 'bob' &&
             value.tester?.id === 'tester' &&
             value.sushi?.id === 'sushi' &&
             value.ethan?.id === 'ethan';
    } catch {
      return false;
    }
  }

  function unlockSkinCatalog(catalog) {
    if (!looksLikeSkinCatalog(catalog)) return false;

    const ids = [...SECRET_SKIN_IDS];
    for (const id of OPTIONAL_SECRET_SKINS) {
      if (catalog[id]?.id === id) ids.push(id);
    }

    const unlocked = [];

    for (const id of ids) {
      const item = catalog[id];
      if (!item || item.id !== id) continue;

      try {
        // MiniBlox computes ownership from tier/level. Hidden skins use high
        // tiers, so tier 0 lets the native cosmetics UI treat them as owned.
        item.tier = 0;
        if (item.level != null) item.level = undefined;
        unlocked.push(id);
      } catch {}
    }

    state.skinCatalog = catalog;
    state.unlockedSkins = unlocked;
    state.skinReady = unlocked.length > 0;

    if (state.skinReady) {
      dispatch('minifeather:legacy-skins-ready', {
        ids: unlocked.slice()
      });
    }

    return state.skinReady;
  }

  async function unlockCurrentSkins() {
    // Waiting for the React root avoids executing the main module earlier than
    // MiniBlox itself. Importing an already-loaded module reuses its cache.
    for (let i = 0; i < 160 && !state.destroyed; i++) {
      if (document.querySelector('#react')) break;
      await new Promise(r => setTimeout(r, 50));
    }

    for (let i = 0; i < 120 && !state.destroyed; i++) {
      const url = findIndexModuleUrl();
      if (url) {
        state.moduleUrl = url;
        try {
          const mod = await import(url);
          for (const value of Object.values(mod)) {
            if (unlockSkinCatalog(value)) return true;
          }
        } catch (err) {
          state.lastError = String(err?.message || err);
        }
      }
      await new Promise(r => setTimeout(r, 100));
    }

    return false;
  }

  unlockCurrentSkins();

  window.MiniFeatherLegacyUnlocks = {
    refreshSkins: () => unlockCurrentSkins(),
    status() {
      return {
        skinsReady: state.skinReady,
        unlockedSkins: state.unlockedSkins.slice(),
        moduleUrl: state.moduleUrl,
        lastError: state.lastError
      };
    },
    destroy() {
      state.destroyed = true;
      try {
        delete window.MiniFeatherLegacyUnlocks;
        delete window.__MF_LEGACY_UNLOCKS_494__;
      } catch {}
    }
  };
})();
