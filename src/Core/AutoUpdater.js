(function () {
  'use strict';

  if (globalThis.MF_AutoUpdater) return;

  function send(type, data) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type, ...(data || {}) }, response => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { success: false });
        });
      } catch (error) {
        resolve({ success: false, error: String(error?.message || error) });
      }
    });
  }

  const api = {
    getState() {
      return send('mfUpdater:getState');
    },
    check() {
      return send('mfUpdater:check', { force: true });
    },
    setSettings(settings) {
      return send('mfUpdater:setSettings', { settings });
    },
    download() {
      return send('mfUpdater:download');
    },
    openRepository() {
      window.open('https://github.com/DevOfficial-Client/MiniFeather-Client', '_blank', 'noopener,noreferrer');
    }
  };

  globalThis.MF_AutoUpdater = api;

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || (!changes.mfUpdaterState && !changes.mfUpdaterSettings)) return;
      window.dispatchEvent(new CustomEvent('minifeather:updater-change'));
    });
  } catch (_) {}
})();
