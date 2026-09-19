(function () {
  'use strict';

  // Classic Miniblox title screen (the old miniblox.io web GUI, 2021-2023):
  // pixel-art background panorama, "MINIBLOX" logo top-left, a vertical menu
  // column (Settings / Friends / Shop / Leaderboards / Discord / Contact Us),
  // "Free PRO rank!" banner, a big ">> Play <<" button bottom-center, Sign In
  // top-right and a small footer with links. Recreated as a full-screen overlay
  // over the current web title screen; one toggle restores the vanilla GUI.
  //
  // Layers (current title screen): #react z:4 · #canvas-hud z:10 · overlay z:2147483000
  // Assets live in web_accessible_resources: assets/classic/*

  const GLOBAL_KEY = '__MINIFEATHER_TITLE_SCREEN__';
  const CONFIG_EVENT = 'minifeather:titlescreen-config';
  const ASSET_BASE = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
    ? chrome.runtime.getURL('assets/classic/')
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

  // ─── Classic GUI overlay (measured from the old site at 1280x720) ──
  function buildOverlay() {
    const style = document.createElement('style');
    style.id = 'mf-titlescreen-style';
    style.textContent = `
      @font-face {
        font-family: 'Minecraft-Regular';
        src: url('${ASSET_BASE}Minecraft-Regular.otf') format('opentype');
        font-display: block;
      }
      #mf-classic-title {
        position:fixed; inset:0; z-index:2147483000;
        font-family:'Minecraft-Regular', monospace;
        color:#fff; user-select:none;
        background:#000 url('${ASSET_BASE}title.png') center / cover no-repeat;
        image-rendering:pixelated;
        overflow:hidden;
      }
      #mf-classic-title[hidden] { display:none; }
      #mf-classic-title .mct-logo {
        position:absolute; left:16px; top:16px; width:268px; height:64px;
        image-rendering:pixelated;
      }
      #mf-classic-title .mct-menu {
        position:absolute; left:16px; top:178px; width:200px;
        display:flex; flex-direction:column; gap:0;
      }
      #mf-classic-title .mct-menu button, #mf-classic-title .mct-pro button,
      #mf-classic-title .mct-signin button, #mf-classic-title .mct-play button {
        width:100%; height:54px;
        background:rgba(0,0,0,.4); color:#fff;
        border:2px solid #a0a0a0; border-radius:4px;
        font-family:inherit; font-size:18px; text-shadow:2px 2px 0 rgba(0,0,0,.6);
        cursor:pointer; box-shadow:0 3px 0 rgba(0,0,0,.35);
      }
      #mf-classic-title .mct-menu button + button { margin-top:10px; }
      #mf-classic-title .mct-menu button:hover, #mf-classic-title .mct-pro button:hover,
      #mf-classic-title .mct-signin button:hover {
        background:rgba(255,255,255,.18); border-color:#fff;
      }
      #mf-classic-title .mct-pro {
        position:absolute; left:50%; top:16px; width:200px; transform:translateX(-50%);
      }
      #mf-classic-title .mct-pro .badge {
        position:absolute; right:-6px; top:-8px; background:gold; color:#3a2c00;
        border-radius:4px; padding:2px 6px; font-size:12px; text-shadow:none;
      }
      #mf-classic-title .mct-signin {
        position:absolute; right:16px; top:16px; width:133px;
      }
      #mf-classic-title .mct-play {
        position:absolute; left:50%; bottom:24px; width:300px; height:160px;
        transform:translateX(-50%);
      }
      #mf-classic-title .mct-play button {
        height:100%; font-size:26px; border-color:#cfcfcf;
        background:rgba(0,0,0,.4);
      }
      #mf-classic-title .mct-play button:hover {
        background:rgba(255,255,255,.18); border-color:#fff;
      }
      #mf-classic-title .mct-footer {
        position:absolute; left:6px; bottom:2px; width:804px;
        display:flex; gap:18px; font-size:13px; text-shadow:1px 1px 0 rgba(0,0,0,.7);
      }
      #mf-classic-title .mct-footer a { color:#9ad0ff; text-decoration:none; }
      #mf-classic-title .mct-footer a:hover { text-decoration:underline; }
      #mf-classic-restore {
        position:absolute; right:16px; top:80px;
        background:rgba(20,40,60,.75); color:#cfe8ff;
        border:1px solid #3d6a8a; border-radius:6px;
        font:600 11px/1 system-ui, sans-serif; padding:7px 12px;
        cursor:pointer; z-index:1;
      }
      #mf-classic-restore:hover { background:#274b6d; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'mf-classic-title';
    overlay.innerHTML = `
      <img class="mct-logo" src="${ASSET_BASE}miniblox.png" alt="Miniblox">
      <div class="mct-menu">
        <button type="button" data-act="settings">Settings</button>
        <button type="button" data-act="friends">Friends</button>
        <button type="button" data-act="shop">Shop</button>
        <button type="button" data-act="leaderboards">Leaderboards</button>
        <button type="button" data-act="discord">Discord</button>
        <button type="button" data-act="contact">Contact Us</button>
      </div>
      <div class="mct-pro">
        <button type="button" data-act="pro">Free PRO rank!<span class="badge">NEW</span></button>
      </div>
      <div class="mct-signin">
        <button type="button" data-act="signin">Sign In</button>
      </div>
      <div class="mct-play">
        <button type="button" data-act="play">&gt;&gt;   Play   &lt;&lt;</button>
      </div>
      <div class="mct-footer">
        <a href="https://miniblox.io/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
        <a href="https://miniblox.io/terms" target="_blank" rel="noopener noreferrer">Terms</a>
        <a href="https://miniblox.io/partner-sites" target="_blank" rel="noopener noreferrer">Partner Sites</a>
        <a href="https://miniblox.io/cookies" target="_blank" rel="noopener noreferrer">Cookies</a>
        <a href="https://miniblox.io/changelog" target="_blank" rel="noopener noreferrer">Changelog</a>
      </div>
      <button id="mf-classic-restore" type="button">⬅ Volver a la GUI normal</button>
    `;

    overlay.addEventListener('click', event => {
      const btn = event.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'restore') return;
      // Play closes the classic overlay and reveals the vanilla title screen
      // (where the player picks a server / mode to actually play).
      if (act === 'play') {
        document.dispatchEvent(new CustomEvent('minifeather:titlescreen-restore'));
        return;
      }
      // Menu buttons: hide overlay and open the corresponding vanilla flow.
      // The vanilla navbar at the bottom offers the same destinations.
      document.dispatchEvent(new CustomEvent('minifeather:titlescreen-restore'));
      setTimeout(() => {
        const navButtons = [...document.querySelectorAll('#react button')];
        const map = {
          settings: /ajustes|settings|options/i,
          friends: /friends|amigos/i,
          shop: /shop|tienda/i,
          leaderboards: /leaderboard|clasificaciones/i,
          discord: /discord/i
        };
        const re = map[act];
        if (!re) return;
        const target = navButtons.find(b => re.test(b.textContent.trim()));
        target?.click();
      }, 60);
    });

    overlay.querySelector('#mf-classic-restore').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('minifeather:titlescreen-restore'));
    });

    document.body.appendChild(overlay);
    state.overlay = overlay;
    return overlay;
  }

  function apply() {
    if (state.enabled && !state.destroyed) {
      if (!state.overlay || !state.overlay.isConnected) buildOverlay();
      state.overlay.hidden = false;
      console.log('[TitleScreen] overlay visible (classic web GUI)');
    } else {
      destroyOverlay();
    }
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
