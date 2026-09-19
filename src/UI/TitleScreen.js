(function () {
  'use strict';

  // Classic Miniblox title screen (Miniblox-master engine homage):
  // the original C# OpenTK engine showed a flat SkyBlue background with a
  // HotPink triangle and a rotating gray cube (MINIBLOXGAME.cs OnLoad).
  // This module recreates that screen as an overlay over the web title
  // screen; the vanilla UI stays intact underneath and one toggle restores it.
  //
  // Layers (web title screen):
  //   #react z:4 (menu z:2, navbar z:20) · #canvas-hud z:10 · overlay z:2147483000

  const GLOBAL_KEY = '__MINIFEATHER_TITLE_SCREEN__';
  const CONFIG_EVENT = 'minifeather:titlescreen-config';

  // Color4.SkyBlue = (135, 206, 235, 1); Color4.HotPink = (255, 105, 180, 1)
  const SKY_BLUE = '#87CEEB';
  const HOT_PINK = '#FF69B4';
  const CUBE_GRAY = '#808080';

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  const state = {
    enabled: false,
    overlay: null,
    raf: 0,
    destroyed: false
  };

  function destroyOverlay() {
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    }
    state.overlay?.remove();
    state.overlay = null;
    document.getElementById('mf-titlescreen-style')?.remove();
  }

  // ─── HTML overlay with CSS 3D (no WebGL needed) ──────────────
  function buildOverlay() {
    const style = document.createElement('style');
    style.id = 'mf-titlescreen-style';
    style.textContent = `
      #mf-classic-title {
        position:fixed; inset:0; z-index:2147483000;
        background:${SKY_BLUE};
        display:flex; align-items:center; justify-content:center;
        font-family:'Courier New', monospace;
      }
      #mf-classic-title[hidden] { display:none; }
      #mf-classic-title .mf-ct-scene {
        position:relative; width:340px; height:240px;
        perspective:520px;
      }
      #mf-classic-title .mf-ct-tri {
        position:absolute; left:20px; top:60px; width:0; height:0;
        border-left:56px solid transparent; border-right:56px solid transparent;
        border-bottom:96px solid ${HOT_PINK};
      }
      #mf-classic-title .mf-ct-cube {
        position:absolute; left:210px; top:70px;
        width:64px; height:64px;
        transform-style:preserve-3d;
        animation:mf-ct-spin 7s linear infinite;
      }
      #mf-classic-title .mf-ct-cube .f {
        position:absolute; inset:0; background:${CUBE_GRAY};
        border:1px solid #6e6e6e;
      }
      @keyframes mf-ct-spin {
        from { transform:rotateX(-24deg) rotateY(0deg); }
        to   { transform:rotateX(-24deg) rotateY(360deg); }
      }
      #mf-classic-title .mf-ct-title {
        position:absolute; left:0; right:0; top:8px;
        text-align:center; color:#1b2733;
        font-size:26px; font-weight:700; letter-spacing:3px;
      }
      #mf-classic-title .mf-ct-sub {
        position:absolute; left:0; right:0; bottom:10px;
        text-align:center; color:#2c3e50;
        font-size:11px; letter-spacing:1px;
      }
      #mf-classic-restore {
        position:absolute; right:16px; top:16px;
        background:rgba(20,40,60,.75); color:#cfe8ff;
        border:1px solid #3d6a8a; border-radius:6px;
        font:600 11px/1 system-ui, sans-serif; padding:7px 12px;
        cursor:pointer;
      }
      #mf-classic-restore:hover { background:#274b6d; }
    `;
    document.head.appendChild(style);

    // gray cube faces (ObjectFactory.CreateSolidCube)
    const FACE_TRANSFORMS = [
      'transform:translateZ(32px)',
      'transform:rotateY(180deg) translateZ(32px)',
      'transform:rotateY(90deg) translateZ(32px)',
      'transform:rotateY(-90deg) translateZ(32px)',
      'transform:rotateX(90deg) translateZ(32px)',
      'transform:rotateX(-90deg) translateZ(32px)'
    ];

    const overlay = document.createElement('div');
    overlay.id = 'mf-classic-title';
    overlay.innerHTML = `
      <div class="mf-ct-scene">
        <div class="mf-ct-title">MINIBLOX</div>
        <div class="mf-ct-tri"></div>
        <div class="mf-ct-cube">${FACE_TRANSFORMS.map(tr => `<div class="f" style="${tr}"></div>`).join('')}</div>
        <div class="mf-ct-sub">Classic engine screen · MiniFeather</div>
      </div>
      <button id="mf-classic-restore" type="button">⬅ Volver a la GUI normal</button>
    `;
    overlay.querySelector('#mf-classic-restore').addEventListener('click', () => {
      // restore vanilla: notify the panel to flip the setting off
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
    } else {
      destroyOverlay();
    }
  }

  // ─── Config sources: panel event + direct storage (this file runs in the
  // ISOLATED world, same as ClientPanel, so chrome.storage is available) ──
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
