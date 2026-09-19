(function () {
  'use strict';

  // Classic Miniblox title screen — full port of the old miniblox.io web
  // client (GitHub Pages build). The entire old site (index.html, bundle,
  // textures, menu music) is bundled under classic/ as web-accessible
  // resources and mounted in a same-origin-free iframe, so the original
  // GUI runs verbatim: its React menus, animations, sizes and music.
  // Toggle restores the vanilla GUI. The old sound sprite is intentionally
  // stubbed (boot-tolerant); the user will hand-craft it later.
  //
  // Layers: #react z:4 · #canvas-hud z:10 · overlay z:2147483000

  const GLOBAL_KEY = '__MINIFEATHER_TITLE_SCREEN__';
  const CONFIG_EVENT = 'minifeather:titlescreen-config';
  const CLASSIC_URL = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
    ? chrome.runtime.getURL('classic/index.html')
    : '';

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  const state = {
    enabled: false,
    overlay: null,
    destroyed: false
  };

  function destroyOverlay() {
    state.overlay?.remove();
    state.overlay = null;
    document.getElementById('mf-titlescreen-style')?.remove();
  }

  function buildOverlay() {
    const style = document.createElement('style');
    style.id = 'mf-titlescreen-style';
    style.textContent = `
      #mf-classic-frame {
        position:fixed; inset:0; z-index:2147483000;
        border:0; width:100%; height:100%;
        background:#000;
      }
      #mf-classic-restore {
        position:fixed; right:16px; top:16px;
        background:rgba(20,40,60,.75); color:#cfe8ff;
        border:1px solid #3d6a8a; border-radius:6px;
        font:600 11px/1 system-ui, sans-serif; padding:7px 12px;
        cursor:pointer; z-index:2147483100;
      }
      #mf-classic-restore:hover { background:#274b6d; }
    `;
    document.head.appendChild(style);

    const iframe = document.createElement('iframe');
    iframe.id = 'mf-classic-frame';
    iframe.src = CLASSIC_URL;
    iframe.allow = 'autoplay';
    document.body.appendChild(iframe);

    const restore = document.createElement('button');
    restore.id = 'mf-classic-restore';
    restore.type = 'button';
    restore.textContent = '⬅ Volver a la GUI normal';
    restore.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('minifeather:titlescreen-restore'));
    });
    document.body.appendChild(restore);

    state.overlay = iframe;
    return iframe;
  }

  function apply() {
    if (state.enabled && !state.destroyed) {
      if (!state.overlay || !state.overlay.isConnected) buildOverlay();
      console.log('[TitleScreen] classic client iframe visible');
    } else {
      destroyOverlay();
    }
    const restoreBtn = document.getElementById('mf-classic-restore');
    if (restoreBtn) restoreBtn.style.display = state.enabled ? '' : 'none';
  }

  // ─── Config sources: panel event + direct storage (ISOLATED world) ──
  function onConfig(event) {
    let detail = event.detail;
    try { detail = typeof detail === 'string' ? JSON.parse(detail) : detail; } catch (_) { return; }
    if (!detail || typeof detail !== 'object') return;
    console.log('[TitleScreen] config recibido:', JSON.stringify(detail));
    if (typeof detail.enabled === 'boolean') state.enabled = detail.enabled;
    apply();
  }

  function readStoredSetting() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
      chrome.storage.local.get('settings', data => {
        const stored = data?.settings?.classicTitle === true;
        if (stored !== state.enabled) {
          console.log('[TitleScreen] storage dice classicTitle =', stored);
          state.enabled = stored;
          apply();
        }
      });
    } catch (_) {}
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    state.enabled = false;
    destroyOverlay();
    document.getElementById('mf-classic-restore')?.remove();
    document.removeEventListener(CONFIG_EVENT, onConfig);
    if (globalThis[GLOBAL_KEY]?.destroy === destroy) delete globalThis[GLOBAL_KEY];
  }

  document.addEventListener(CONFIG_EVENT, onConfig);
  readStoredSetting();
  try {
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area === 'local' && changes.settings) readStoredSetting();
    });
  } catch (_) {}
  console.log('[TitleScreen] script cargado y escuchando', CONFIG_EVENT);
  globalThis[GLOBAL_KEY] = {
    enable() { state.enabled = true; apply(); },
    disable() { state.enabled = false; apply(); },
    destroy
  };
})();
