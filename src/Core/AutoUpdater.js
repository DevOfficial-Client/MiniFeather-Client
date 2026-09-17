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

  // ── Aviso en pantalla cuando hay una actualización disponible ──
  // El background chequea el repo (cada 6h + al iniciar). Cuando detecta
  // novedad, guardó mfUpdaterState.updateAvailable=true y aquí avisamos:
  // banner arriba con versión/commit + botón "Update now" que descarga el
  // ZIP nuevo y pide recargar la extensión.
  function normalizeColor(value, fallback) {
    const raw = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : fallback;
  }

  function getTheme() {
    return new Promise(resolve => {
      const fallback = { accent: '#ef3b3b', panel: '#0e1115' };
      try {
        chrome.storage.local.get('settings', data => {
          if (chrome.runtime.lastError) return resolve(fallback);
          const settings = data?.settings || {};
          resolve({
            accent: normalizeColor(settings.panelAccentColor, fallback.accent),
            panel: normalizeColor(settings.panelBackgroundColor, fallback.panel)
          });
        });
      } catch (_) {
        resolve(fallback);
      }
    });
  }

  function applyBannerTheme(banner, theme) {
    if (!banner) return;
    const accent = theme?.accent || '#ef3b3b';
    const panel = theme?.panel || '#0e1115';
    banner.style.setProperty('--mf-update-accent', accent);
    banner.style.setProperty('--mf-update-panel', panel);
    banner.style.background = `color-mix(in srgb, ${panel} 94%, #fff 6%)`;
    banner.style.borderColor = accent;
    banner.querySelectorAll('[data-mf-update-primary]').forEach(button => {
      button.style.background = accent;
      button.style.borderColor = accent;
    });
  }

  function fmtState(state) {
    if (!state) return null;
    if (!state.updateAvailable) return null;
    const cur = state.installedVersion || '?';
    const next = state.remoteVersion && state.remoteVersion !== cur ? ` → ${state.remoteVersion}` : '';
    const sha = state.remoteShortCommit ? ` (${state.remoteShortCommit})` : '';
    return { cur, next, sha, msg: state.remoteMessage || '', reason: state.reason || '' };
  }

  async function showUpdateBanner(info) {
    if (document.getElementById('mf-update-banner')) return;
    const isHot = info.reason === 'hot';
    const theme = await getTheme();

    const banner = document.createElement('div');
    banner.id = 'mf-update-banner';
    banner.style.cssText = [
      'position:fixed', 'top:12px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:2147483647', 'display:flex', 'align-items:center', 'gap:12px',
      'max-width:min(560px,92vw)', 'padding:10px 16px', 'border-radius:12px',
      `background:color-mix(in srgb, ${theme.panel} 94%, #fff 6%)`, `border:1px solid ${theme.accent}`,
      'box-shadow:0 8px 30px rgba(0,0,0,.45)', 'color:#e8e8f0',
      'font:13px/1.45 system-ui,sans-serif', 'backdrop-filter:blur(6px)'
    ].join(';');

    const label = document.createElement('span');
    label.textContent = isHot
      ? `MiniFeather update downloaded — reload to apply${info.sha}`
      : `MiniFeather update available — v${info.cur}${info.next}${info.sha}`;
    banner.appendChild(label);

    if (info.msg) {
      const note = document.createElement('span');
      note.style.cssText = 'color:#9aa0b4;font-size:11px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      note.textContent = info.msg;
      note.title = info.msg;
      banner.appendChild(note);
    }

    const actions = document.createElement('span');
    actions.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';

    const updateBtn = document.createElement('button');
    updateBtn.textContent = isHot ? 'Reload now' : 'Update now';
    updateBtn.dataset.mfUpdatePrimary = '1';
    updateBtn.style.cssText = `padding:6px 12px;border-radius:8px;border:1px solid ${theme.accent};background:${theme.accent};color:#fff;font:600 12px system-ui,sans-serif;cursor:pointer;transition:transform .15s ease,filter .15s ease;`;
    updateBtn.addEventListener('pointerenter', () => { updateBtn.style.transform = 'translateY(-1px)'; updateBtn.style.filter = 'brightness(1.08)'; });
    updateBtn.addEventListener('pointerleave', () => { updateBtn.style.transform = ''; updateBtn.style.filter = ''; });
    updateBtn.addEventListener('click', async () => {
      if (isHot) {
        updateBtn.disabled = true;
        updateBtn.textContent = 'Reloading…';
        location.reload();
        return;
      }
      updateBtn.disabled = true;
      updateBtn.textContent = 'Downloading…';
      const res = await api.download();
      if (res?.success) {
        updateBtn.textContent = 'Restart to apply';
        banner.title = 'Unzip over your extension folder (or drag into chrome://extensions) and reload the page.';
        const restart = document.createElement('button');
        restart.textContent = 'How to apply';
        restart.style.cssText = 'padding:6px 12px;border-radius:8px;border:0;background:#2a2e37;color:#e8e8f0;font:600 12px system-ui,sans-serif;cursor:pointer;';
        restart.addEventListener('click', () => window.open('https://github.com/DevOfficial-Client/MiniFeather-Client#readme', '_blank', 'noopener,noreferrer'));
        actions.appendChild(restart);
      } else {
        updateBtn.textContent = 'Retry';
        updateBtn.disabled = false;
      }
    });
    actions.appendChild(updateBtn);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.title = 'Dismiss';
    closeBtn.style.cssText = 'width:26px;height:26px;border-radius:8px;border:0;background:transparent;color:#9aa0b4;font:16px system-ui,sans-serif;cursor:pointer;';
    closeBtn.addEventListener('click', () => banner.remove());
    actions.appendChild(closeBtn);

    banner.appendChild(actions);
    (document.body || document.documentElement).appendChild(banner);
    applyBannerTheme(banner, theme);
  }

  async function maybeShowBanner() {
    try {
      const res = await api.getState();
      const info = fmtState(res?.state);
      if (info) showUpdateBanner(info);
    } catch (_) {}
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.settings) {
        getTheme().then(theme => applyBannerTheme(document.getElementById('mf-update-banner'), theme));
      }
      if (!changes.mfUpdaterState && !changes.mfUpdaterSettings) return;
      window.dispatchEvent(new CustomEvent('minifeather:updater-change'));
      if (changes.mfUpdaterState?.newValue?.updateAvailable) {
        const info = fmtState(changes.mfUpdaterState.newValue);
        if (info) showUpdateBanner(info);
      }
    });
  } catch (_) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => maybeShowBanner());
  } else {
    maybeShowBanner();
  }
})();
