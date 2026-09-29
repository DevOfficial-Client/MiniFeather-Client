// minifeather compatshim. pretends to be chrome.* so the client feels at home outside an extension.
// it politely does nothing if the real extension is running. :D
(function () {
  'use strict';
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) return;
  if (window.__MF_COMPAT_SHIM__) return;
  window.__MF_COMPAT_SHIM__ = true;

  const BUILD = window.__MF_BUILD__ || { version: '0.0.0', commit: null, builtAt: null, pinned: false };

  function resolveBase() {
    if (window.__MF_ASSET_BASE__) return String(window.__MF_ASSET_BASE__).replace(/\/+$/, '') + '/';
    try {
      const override = localStorage.getItem('mf:assetBase');
      if (override) return String(override).replace(/\/+$/, '') + '/';
    } catch (_) {}
    return 'https://raw.githubusercontent.com/DevOfficial-Client/MiniFeather-Client/main/';
  }

  function normalizePath(path) {
    return String(path || '').replace(/^\.\//, '').replace(/^\/+/, '');
  }

  const PREFIX = 'mf:shim:storage:';
  const listeners = new Set();

  function readAll() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) {
          try { out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } catch (_) {}
        }
      }
    } catch (_) {}
    return out;
  }

  function storageGet(keys, cb) {
    const all = readAll();
    let result;
    try {
      if (keys == null) {
        result = all;
      } else if (Array.isArray(keys)) {
        result = {};
        for (const k of keys) if (k in all) result[k] = all[k];
      } else if (typeof keys === 'object') {
        result = {};
        for (const k of Object.keys(keys)) result[k] = (k in all) ? all[k] : keys[k];
      } else {
        result = {};
        if (keys in all) result[keys] = all[keys];
      }
    } catch (error) {
      if (typeof cb === 'function') setTimeout(() => cb({}), 0);
      else return Promise.resolve({});
    }
    if (typeof cb === 'function') setTimeout(() => cb(result), 0);
    else return Promise.resolve(result);
  }

  function storageSet(items, cb) {
    const changes = {};
    try {
      for (const k of Object.keys(items || {})) {
        const oldValue = readAll()[k];
        const newValue = items[k];
        changes[k] = { oldValue, newValue };
        try { localStorage.setItem(PREFIX + k, JSON.stringify(newValue)); } catch (e) {
          if (typeof cb === 'function') setTimeout(cb, 0);
          else return Promise.reject(new Error('mf shim storage quota: ' + e.message));
        }
      }
      fireChanged(changes);
    } catch (error) {
      if (typeof cb === 'function') setTimeout(cb, 0);
      else return Promise.reject(error);
    }
    if (typeof cb === 'function') setTimeout(cb, 0);
    else return Promise.resolve();
  }

  function storageRemove(keys, cb) {
    const list = Array.isArray(keys) ? keys : [keys];
    const changes = {};
    try {
      for (const k of list) {
        const prev = readAll()[k];
        if (k in readAll()) changes[k] = { oldValue: prev };
        try { localStorage.removeItem(PREFIX + k); } catch (_) {}
      }
      if (Object.keys(changes).length) fireChanged(changes);
    } catch (_) {}
    if (typeof cb === 'function') setTimeout(cb, 0);
    else return Promise.resolve();
  }

  function fireChanged(changes) {
    for (const fn of listeners) {
      try { fn(changes, 'local'); } catch (_) {}
    }
  }

  const messageListeners = new Set();
  const connectListeners = new Set();

  class MFPort {
    constructor(name) {
      this.name = String(name || '');
      this._onMessage = [];
      this._onDisconnect = [];
      this._closed = false;
      this.onMessage = {
        addListener: fn => { if (typeof fn === 'function') this._onMessage.push(fn); }
      };
      this.onDisconnect = {
        addListener: fn => { if (typeof fn === 'function') this._onDisconnect.push(fn); }
      };
    }
    _deliver(message) {
      if (this._closed) return;
      for (const fn of this._onMessage.slice()) {
        try { fn(message); } catch (_) {}
      }
    }
    _notifyDisconnected() {
      this._closed = true;
      for (const fn of this._onDisconnect.slice()) {
        try { fn(this); } catch (_) {}
      }
    }
    postMessage(message) {
      if (this._closed) return;
      const bg = window.__MF_MINI_BG__;
      if (bg) bg.portMessage(this, message);
    }
    // like real chrome: the side that hangs up does not get its own ondisconnect :v
    disconnect() {
      if (this._closed) return;
      const bg = window.__MF_MINI_BG__;
      if (bg) bg.portDisconnected(this);
    }
  }

  const runtime = {
    id: undefined,
    onMessage: {
      addListener(fn) { if (typeof fn === 'function') messageListeners.add(fn); }
    },
    onConnect: {
      addListener(fn) { if (typeof fn === 'function') connectListeners.add(fn); }
    },
    getManifest() {
      return { name: 'MiniFeatherClient', version: BUILD.version || '0.0.0', manifest_version: 3 };
    },
    getURL(path) {
      return resolveBase() + normalizePath(path);
    },
    sendMessage(message, cb) {
      const done = response => {
        try { if (typeof cb === 'function') cb(response); } catch (_) {}
      };
      Promise.resolve().then(() => {
        const bg = window.__MF_MINI_BG__;
        if (!bg) return { success: false, error: 'mf_mini_bg_not_ready' };
        return bg.handleMessage(message);
      }).then(done).catch(error => done({ success: false, error: String(error && error.message || error) }));
    },
    connect(info) {
      const port = new MFPort(info && info.name);
      Promise.resolve().then(() => {
        const bg = window.__MF_MINI_BG__;
        if (bg) bg.portConnected(port);
        else for (const fn of connectListeners) { try { fn(port); } catch (_) {} }
      });
      return port;
    }
  };

  const chromeShim = (typeof chrome !== 'undefined') ? chrome : {};
  chromeShim.runtime = runtime;
  chromeShim.storage = {
    local: {
      get: storageGet,
      set: storageSet,
      remove: storageRemove,
      clear(cb) {
        try {
          for (const k of Object.keys(readAll())) localStorage.removeItem(PREFIX + k);
        } catch (_) {}
        if (typeof cb === 'function') setTimeout(cb, 0);
        else return Promise.resolve();
      },
      getBytesInUse(keys, cb) {
        const size = JSON.stringify(readAll()).length;
        if (typeof cb === 'function') setTimeout(() => cb(size), 0);
        else return Promise.resolve(size);
      }
    },
    sync: undefined,
    onChanged: { addListener(fn) { if (typeof fn === 'function') listeners.add(fn); } }
  };
  window.chrome = chromeShim;

  // ---------- page zoom (embedded apps) ----------
  // the panel's zoom control used chrome.tabs.setZoom on desktop; here it maps to css
  // zoom on the document element, persisted, applied as soon as <html> exists. :D
  const ZOOM_KEY = 'mf:pageZoom';
  function applyPageZoom(z) {
    const factor = Math.min(5, Math.max(0.25, Number(z) || 1));
    const run = () => {
      try {
        if (document.documentElement) document.documentElement.style.zoom = String(factor);
        else setTimeout(run, 0);
      } catch (_) {}
    };
    run();
    return factor;
  }
  function resolvePageZoom() {
    let saved = null;
    try { saved = localStorage.getItem(ZOOM_KEY); } catch (_) {}
    if (saved != null && !Number.isNaN(Number(saved))) return Number(saved);
    return (typeof window.__MF_ZOOM_DEFAULT__ === 'number') ? window.__MF_ZOOM_DEFAULT__ : 1;
  }

  window.__MF_SHIM__ = {
    build: BUILD,
    assetBase: resolveBase,
    messageListeners,
    portClass: MFPort,
    applyPageZoom,
    pageZoom: resolvePageZoom
  };

  try { applyPageZoom(resolvePageZoom()); } catch (_) {}
})();
