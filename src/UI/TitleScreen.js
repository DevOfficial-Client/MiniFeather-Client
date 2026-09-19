(function () {
  'use strict';

  // Classic Miniblox title screen — 1:1 pixel-perfect recreation of the old
  // miniblox.io web GUI (GitHub Pages build). Every element's position, size,
  // border, font metrics and hover behavior was captured with Puppeteer from
  // the original page's computed styles at 1280x720 and replicated below.
  // Assets (title.png panorama, miniblox.png logo, Minecraft-Regular.otf font)
  // are the original files bundled under assets/classic/.
  //
  // Hover: background rgba(84,84,84,.6) · Active: gray-300 · Disabled: .4 opacity
  // Layers (current title screen): #react z:4 · #canvas-hud z:10 · overlay z:2147483000

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

  // ─── measured classic GUI (1280x720 reference frame) ─────────
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
        font-family:'Minecraft-Regular', sans-serif; font-size:16px; color:#fff;
        letter-spacing:1.28px; line-height:24px;
        text-shadow:rgb(34,34,34) 1.6px 1.6px 0px;
        overflow:hidden; background:#000;
      }
      #mf-classic-title[hidden] { display:none; }

      #mf-classic-title .mct-stage {
        position:absolute; top:0; left:0;
        width:1280px; height:720px; transform-origin:0 0;
      }
      #mf-classic-title .mct-bg {
        position:fixed; inset:0; width:100%; height:100%;
        object-fit:cover; z-index:-5; overflow:clip;
      }
      #mf-classic-title .mct-dim {
        position:absolute; inset:0; background:rgba(0,0,0,.4); z-index:-1;
      }
      #mf-classic-title .mct-logo {
        position:absolute; top:16px; left:16px; width:268px; height:64px;
        z-index:10;
      }
      #mf-classic-title .mct-menu {
        position:absolute; top:178px; left:16px; width:200px;
        display:flex; flex-direction:column; align-items:flex-start;
      }
      #mf-classic-title .mct-btn {
        position:relative; width:200px; height:54px;
        padding:24px; border:3px solid #000; border-radius:0;
        background:rgba(0,0,0,.4); color:#fff;
        font-family:'Minecraft-Regular', sans-serif; font-size:20px; font-weight:600;
        letter-spacing:1.6px; line-height:24px; text-align:center;
        display:flex; justify-content:center; align-items:center;
        cursor:pointer; white-space:nowrap; min-width:40px;
      }
      #mf-classic-title .mct-btn + .mct-btn { margin-top:8px; }
      #mf-classic-title .mct-btn:hover { background:rgba(84,84,84,.6); }
      #mf-classic-title .mct-btn:active { background:rgb(203,203,203); }
      #mf-classic-title .mct-btn:disabled { opacity:.4; cursor:not-allowed; }
      #mf-classic-title .mct-signin {
        position:absolute; top:16px; right:16px; width:133px;
      }
      #mf-classic-title .mct-signin .mct-btn { width:133px; display:inline-flex; }
      #mf-classic-title .mct-pro {
        position:absolute; top:16px; left:640px; width:200px;
        transform:translateX(-100px);
      }
      #mf-classic-title .mct-pro .mct-btn { display:inline-flex; }
      #mf-classic-title .mct-pro .pro-badge {
        margin:0 10px; color:rgb(255,0,255); font-weight:700;
        text-shadow:rgb(255,0,255) 0 0 8px; display:block;
      }
      #mf-classic-title .mct-play-wrap {
        position:absolute; top:532px; left:640px; width:304px; height:164px;
        border:2px solid #000; transform:translateX(-152px);
      }
      #mf-classic-title .mct-play-wrap .mct-btn { width:300px; height:160px; }
      #mf-classic-title .mct-play-label {
        font-size:30px; line-height:36px; font-weight:600; color:#fff;
        letter-spacing:1.6px; text-align:center; display:block;
      }
      #mf-classic-title .mct-footer {
        position:absolute; top:700.8px; left:6.4px; width:804px; height:19px;
        display:flex; justify-content:center; gap:0;
        font-size:16px; font-weight:700; line-height:19.2px;
      }
      #mf-classic-title .mct-footer a {
        color:#fff; text-decoration:none; display:inline;
        text-shadow:rgb(34,34,34) 1.6px 1.6px 0px; margin:0 10px;
      }
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
      <img class="mct-bg" src="${ASSET_BASE}title.png" alt="">
      <div class="mct-stage">
        <div class="mct-dim"></div>
        <img class="mct-logo" src="${ASSET_BASE}miniblox.png" alt="Miniblox">
        <div class="mct-menu">
          <button class="mct-btn" type="button" data-act="settings">Settings</button>
          <button class="mct-btn" type="button" data-act="friends">Friends</button>
          <button class="mct-btn" type="button" data-act="shop">Shop</button>
          <button class="mct-btn" type="button" data-act="leaderboards">Leaderboards</button>
          <button class="mct-btn" type="button" data-act="discord">Discord</button>
          <button class="mct-btn" type="button" data-act="contact">Contact Us</button>
        </div>
        <div class="mct-pro">
          <button class="mct-btn" type="button" data-act="pro">Free PRO rank! <span class="pro-badge">PRO</span></button>
        </div>
        <div class="mct-signin">
          <button class="mct-btn" type="button" data-act="signin">Sign In</button>
        </div>
        <div class="mct-play-wrap">
          <button class="mct-btn" type="button" data-act="play"><span class="mct-play-label">&gt;&gt;   Play   &lt;&lt;</span></button>
        </div>
        <div class="mct-footer">
          <a href="https://miniblox.io/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
          <a href="https://miniblox.io/terms" target="_blank" rel="noopener noreferrer">Terms</a>
          <a href="https://miniblox.io/partner-sites" target="_blank" rel="noopener noreferrer">Partner Sites</a>
          <a href="https://miniblox.io/cookies" target="_blank" rel="noopener noreferrer">Cookies</a>
          <a href="https://miniblox.io/changelog" target="_blank" rel="noopener noreferrer">Changelog</a>
        </div>
      </div>
      <button id="mf-classic-restore" type="button">⬅ Volver a la GUI normal</button>
    `;

    // keep the 1280x720 reference frame scaled to the real viewport
    const stage = overlay.querySelector('.mct-stage');
    const rescale = () => {
      const scale = Math.max(window.innerWidth / 1280, window.innerHeight / 720);
      stage.style.transform = 'scale(' + scale + ')';
    };
    rescale();
    window.addEventListener('resize', rescale);

    overlay.addEventListener('click', event => {
      const btn = event.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'play') {
        document.dispatchEvent(new CustomEvent('minifeather:titlescreen-restore'));
        return;
      }
      // Menu buttons: restore vanilla GUI and route to the matching navbar entry.
      document.dispatchEvent(new CustomEvent('minifeather:titlescreen-restore'));
      setTimeout(() => {
        const map = {
          settings: /ajustes|settings|options/i,
          friends: /friends|amigos/i,
          shop: /shop|tienda/i,
          leaderboards: /leaderboard|clasificaciones/i,
          discord: /discord/i
        };
        const re = map[act];
        if (!re) return;
        const target = [...document.querySelectorAll('#react button')]
          .find(b => re.test(b.textContent.trim()));
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
      console.log('[TitleScreen] overlay visible (classic web GUI, pixel-perfect)');
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
