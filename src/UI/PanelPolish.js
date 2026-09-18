(() => {
  'use strict';

  const TOOLTIP_ID = 'mf-polish-tooltip';
  const STYLE_ID = 'mf-panel-polish-style';
  const TITLE_KEY = 'mfTooltipTitle';
  const LANGUAGE_NAMES = Object.freeze({
    en: 'English', es: 'Español', ja: '日本語', it: 'Italiano', zh: '中文',
    fr: 'Français', de: 'Deutsch', pt: 'Português', ru: 'Русский', ko: '한국어'
  });

  let tooltip = null;
  let activeAnchor = null;
  let showTimer = 0;

  const css = `
    :root {
      --mf-global-accent:#ef3b3b;
      --mf-global-panel:#0e1115;
    }

    #mf-gui {
      animation:mfPanelIn 190ms cubic-bezier(.2,.78,.25,1) both;
    }
    @keyframes mfPanelIn {
      from { opacity:0; transform:translate(-50%,calc(-50% + 7px)) scale(.992); }
      to { opacity:1; transform:translate(-50%,-50%) scale(1); }
    }
    @keyframes mfModalIn {
      from { opacity:0; transform:translateY(8px) scale(.985); }
      to { opacity:1; transform:translateY(0) scale(1); }
    }
    @keyframes mfBackdropIn { from { opacity:0; } to { opacity:1; } }
    @keyframes mfStatePulse {
      0% { box-shadow:0 0 0 0 color-mix(in srgb,var(--mf-global-accent) 36%,transparent); }
      100% { box-shadow:0 0 0 8px transparent; }
    }

    #mf-gui,
    #mf-gui-overlay,
    .mf-feature-modal,
    .mf-feature-modal-backdrop,
    #mf-update-banner {
      --mf-accent:var(--mf-ui-accent,var(--mf-global-accent,#ef3b3b));
      --mf-panel-theme:var(--mf-ui-panel,var(--mf-global-panel,#0e1115));
    }

    #mf-gui button,
    #mf-gui .mf-btn,
    #mf-gui .mf-toggle,
    #mf-gui .mf-card,
    #mf-gui .mf-feather-category,
    #mf-gui .mf-feather-tool,
    #mf-gui .mf-feather-icon-tab,
    #mf-gui .mf-feather-main-tab,
    #mf-gui .mf-feature-settings,
    #mf-gui .mf-feature-favorite,
    #mf-gui input,
    #mf-gui select,
    .mf-feature-modal button,
    .mf-feature-modal input,
    .mf-feature-modal select {
      transition:transform 150ms cubic-bezier(.2,.8,.25,1),box-shadow 180ms ease,
        border-color 180ms ease,background-color 180ms ease,color 180ms ease,
        opacity 180ms ease,filter 180ms ease;
    }

    #mf-gui button:not(:disabled):hover,
    #mf-gui .mf-btn:not(:disabled):hover,
    #mf-gui .mf-feather-category:hover,
    #mf-gui .mf-feather-tool:hover,
    #mf-gui .mf-feather-icon-tab:hover,
    #mf-gui .mf-feather-main-tab:hover,
    #mf-gui .mf-feature-settings:hover,
    #mf-gui .mf-feature-favorite:hover,
    .mf-feature-modal button:not(:disabled):hover {
      transform:translateY(-2px);
      filter:brightness(1.055);
    }

    #mf-gui button:not(:disabled):active,
    #mf-gui .mf-btn:not(:disabled):active,
    #mf-gui .mf-feather-category:active,
    #mf-gui .mf-feather-tool:active,
    #mf-gui .mf-feather-icon-tab:active,
    #mf-gui .mf-feather-main-tab:active,
    #mf-gui .mf-feature-settings:active,
    #mf-gui .mf-feature-favorite:active,
    .mf-feature-modal button:not(:disabled):active {
      transform:translateY(0) scale(.975);
      transition-duration:70ms;
    }

    #mf-gui .mf-toggle-grid .mf-toggle,
    #mf-gui .mf-feather-module-grid .mf-toggle {
      transition:transform 170ms cubic-bezier(.2,.8,.25,1),box-shadow 200ms ease,
        border-color 180ms ease,background 180ms ease,filter 180ms ease !important;
    }
    #mf-gui .mf-toggle-grid .mf-toggle:hover,
    #mf-gui .mf-feather-module-grid .mf-toggle:hover {
      transform:translateY(-3px) !important;
      box-shadow:0 12px 28px rgba(0,0,0,.24);
      border-color:color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 30%,#333941 70%) !important;
    }
    #mf-gui .mf-toggle-grid .mf-toggle:active,
    #mf-gui .mf-feather-module-grid .mf-toggle:active {
      transform:translateY(-1px) scale(.992) !important;
    }
    #mf-gui .mf-toggle:has(.mf-switch-hidden:checked) .mf-feature-icon {
      color:color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 72%,#fff 28%);
      filter:drop-shadow(0 0 8px color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 28%,transparent));
    }
    #mf-gui .mf-toggle:has(.mf-switch-hidden:checked) .mf-feature-state.enabled {
      background:color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 28%,#101418 72%) !important;
      color:color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 68%,#fff 32%) !important;
      border:1px solid color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 40%,transparent) !important;
    }
    #mf-gui .mf-toggle.mf-polish-state-change {
      animation:mfStatePulse 320ms ease-out;
    }

    #mf-gui input:focus,
    #mf-gui select:focus,
    #mf-gui button:focus-visible,
    .mf-feature-modal input:focus,
    .mf-feature-modal select:focus,
    .mf-feature-modal button:focus-visible {
      outline:none !important;
      border-color:color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 70%,#fff 30%) !important;
      box-shadow:0 0 0 2px color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 26%,transparent) !important;
    }

    #mf-gui input[type="range"],
    #mf-gui input[type="checkbox"],
    #mf-gui input[type="radio"],
    .mf-feature-modal input[type="range"],
    .mf-feature-modal input[type="checkbox"],
    .mf-feature-modal input[type="radio"] {
      accent-color:var(--mf-ui-accent,var(--mf-global-accent,#ef3b3b)) !important;
    }
    #mf-gui input[type="range"]:hover,
    .mf-feature-modal input[type="range"]:hover { filter:brightness(1.08); }

    #mf-gui .mf-btn.primary,
    #mf-gui button.primary,
    .mf-feature-modal .mf-btn.primary,
    .mf-feature-modal button.primary,
    #mf-update-banner [data-mf-update-primary] {
      background:linear-gradient(180deg,
        color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 92%,#fff 8%),
        color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 78%,#000 22%)) !important;
      border-color:color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 50%,transparent) !important;
      color:#fff !important;
    }

    #mf-gui .mf-toggle:has(.mf-switch-hidden:checked),
    #mf-gui [class*="preset"].active,
    #mf-gui [class*="option"].active,
    #mf-gui [class*="tab"].active {
      border-color:color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 58%,#30363d 42%) !important;
    }
    #mf-gui [class*="preset"].active,
    #mf-gui [class*="option"].active {
      background:color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 15%,transparent) !important;
    }

    #mf-gui .mf-select option:checked,
    #mf-language-select option:checked {
      background:var(--mf-ui-accent,var(--mf-global-accent,#ef3b3b)) !important;
      color:#fff !important;
    }

    #mf-gui button[data-zoom-bind],
    #mf-gui button[data-fc-bind],
    #mf-gui button[data-co-bind],
    #mf-gui button[data-tt-bind],
    #mf-gui button[data-fl-bind],
    #mf-gui [data-mf-binding="true"],
    #mf-gui .mf-tt-bind-box {
      border-color:color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 55%,#30363d 45%) !important;
      background:color-mix(in srgb,var(--mf-ui-panel,var(--mf-global-panel)) 88%,var(--mf-ui-accent,var(--mf-global-accent)) 12%) !important;
      color:#f5f7fa !important;
    }
    #mf-gui [data-mf-binding="true"] {
      box-shadow:0 0 0 2px color-mix(in srgb,var(--mf-ui-accent,var(--mf-global-accent)) 20%,transparent),
                 0 8px 22px rgba(0,0,0,.22) !important;
    }

    .mf-feature-modal-backdrop {
      animation:mfBackdropIn 150ms ease both;
      background:rgba(0,0,0,.58) !important;
      backdrop-filter:blur(9px) saturate(.9) !important;
      -webkit-backdrop-filter:blur(9px) saturate(.9) !important;
    }
    .mf-feature-modal {
      animation:mfModalIn 180ms cubic-bezier(.2,.8,.25,1) both;
      background:linear-gradient(180deg,
        color-mix(in srgb,var(--mf-global-panel,#0e1115) 93%,#fff 7%),
        color-mix(in srgb,var(--mf-global-panel,#0e1115) 97%,#000 3%)) !important;
      border:1px solid color-mix(in srgb,var(--mf-global-accent,#ef3b3b) 22%,#30363d 78%) !important;
      border-radius:14px !important;
      box-shadow:0 28px 90px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.035) !important;
      padding:22px !important;
    }
    .mf-feature-modal-title { letter-spacing:.01em; }
    .mf-feature-modal-row {
      border-top-color:color-mix(in srgb,var(--mf-global-panel,#0e1115) 65%,#fff 35%) !important;
      transition:background-color 160ms ease,border-color 160ms ease !important;
    }
    .mf-feature-modal-row:hover {
      background:color-mix(in srgb,var(--mf-global-accent,#ef3b3b) 5%,transparent);
    }
    .mf-feature-modal .mf-input,
    .mf-feature-modal .mf-select,
    .mf-feature-modal input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),
    .mf-feature-modal select {
      background:color-mix(in srgb,var(--mf-global-panel,#0e1115) 84%,#fff 16%) !important;
      border:1px solid color-mix(in srgb,var(--mf-global-panel,#0e1115) 58%,#fff 42%) !important;
      color:#f3f4f6 !important;
      border-radius:8px !important;
    }

    #mf-update-banner {
      transition:background-color 180ms ease,border-color 180ms ease,transform 180ms cubic-bezier(.2,.8,.25,1),box-shadow 180ms ease !important;
    }
    #mf-update-banner:hover {
      transform:translateX(-50%) translateY(-1px) !important;
      box-shadow:0 12px 36px rgba(0,0,0,.50) !important;
    }

    #${TOOLTIP_ID} {
      position:fixed;
      z-index:2147483647;
      display:flex;
      align-items:center;
      gap:9px;
      min-height:36px;
      max-width:280px;
      padding:7px 10px;
      border:1px solid color-mix(in srgb,var(--mf-global-accent,#ef3b3b) 22%,rgba(255,255,255,.12) 78%);
      border-radius:8px;
      background:linear-gradient(180deg,
        color-mix(in srgb,var(--mf-global-panel,#0e1115) 88%,#fff 12%),
        color-mix(in srgb,var(--mf-global-panel,#0e1115) 97%,#000 3%));
      box-shadow:0 10px 28px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.035);
      color:#eef1f5;
      font:700 12px/1.2 Arial,sans-serif;
      pointer-events:none;
      opacity:0;
      transform:translate(-50%,-4px) scale(.97);
      transition:opacity 120ms ease,transform 140ms cubic-bezier(.2,.8,.25,1);
      backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);
    }
    #${TOOLTIP_ID}.mf-visible { opacity:1; transform:translate(-50%,0) scale(1); }
    #${TOOLTIP_ID}.mf-below { transform:translate(-50%,4px) scale(.97); }
    #${TOOLTIP_ID}.mf-below.mf-visible { transform:translate(-50%,0) scale(1); }
    #${TOOLTIP_ID} .mf-polish-tooltip-icon {
      width:24px;height:24px;flex:0 0 24px;display:flex;align-items:center;justify-content:center;
      color:var(--mf-global-accent,#ef3b3b);font-size:21px;line-height:1;
    }
    #${TOOLTIP_ID} .mf-polish-tooltip-icon svg { width:22px;height:22px; }
    #${TOOLTIP_ID} .mf-polish-tooltip-name { min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }

    @media (prefers-reduced-motion:reduce) {
      #mf-gui,#mf-gui *,#${TOOLTIP_ID},.mf-feature-modal,.mf-feature-modal-backdrop,#mf-update-banner {
        animation:none !important;transition-duration:.01ms !important;scroll-behavior:auto !important;
      }
      #mf-gui button:hover,#mf-gui .mf-btn:hover,#mf-gui .mf-toggle:hover,
      #mf-gui .mf-feather-category:hover,#mf-gui .mf-feather-tool:hover,
      #mf-gui .mf-feather-icon-tab:hover,#mf-gui .mf-feather-main-tab:hover,
      #mf-gui .mf-feature-settings:hover,#mf-gui .mf-feature-favorite:hover,
      .mf-feature-modal button:hover { transform:none !important; }
      #mf-update-banner:hover { transform:translateX(-50%) !important; }
    }
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureTooltip() {
    tooltip = document.getElementById(TOOLTIP_ID);
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.innerHTML = '<span class="mf-polish-tooltip-icon" aria-hidden="true"></span><span class="mf-polish-tooltip-name"></span>';
    (document.body || document.documentElement).appendChild(tooltip);
    return tooltip;
  }

  function languageSelects(root = document) {
    const out = [];
    if (root instanceof HTMLSelectElement) out.push(root);
    root.querySelectorAll?.('select').forEach(select => out.push(select));
    return out;
  }

  function normalizeLanguageOptions(root = document) {
    for (const select of languageSelects(root)) {
      const id = String(select.id || '').toLowerCase();
      const aria = String(select.getAttribute('aria-label') || '').toLowerCase();
      const values = [...select.options].map(option => String(option.value || '').toLowerCase());
      const matches = values.filter(value => Object.hasOwn(LANGUAGE_NAMES, value)).length;
      if (!id.includes('language') && !aria.includes('language') && matches < 4) continue;

      select.setAttribute('data-mf-i18n-skip', 'true');
      select.setAttribute('translate', 'no');
      for (const option of select.options) {
        const code = String(option.value || '').toLowerCase();
        if (!Object.hasOwn(LANGUAGE_NAMES, code)) continue;
        option.textContent = LANGUAGE_NAMES[code];
        option.setAttribute('data-mf-i18n-skip', 'true');
        option.setAttribute('translate', 'no');
      }
    }
  }

  function normalizeTitles(root = document) {
    const nodes = root.querySelectorAll?.('#mf-gui [title]') || [];
    for (const node of nodes) {
      const value = String(node.getAttribute('title') || '').trim();
      if (!value) continue;
      node.dataset[TITLE_KEY] = value;
      if (!node.hasAttribute('aria-label')) node.setAttribute('aria-label', value);
      node.removeAttribute('title');
    }
  }

  function tooltipAnchor(target) {
    if (!(target instanceof Element) || !target.closest('#mf-gui')) return null;
    return target.closest('.mf-toggle,.mf-feather-icon-tab,.mf-feather-tool,.mf-feature-settings,.mf-feature-favorite,[data-mf-tooltip-title],[aria-label]');
  }

  function anchorLabel(anchor) {
    if (!anchor) return '';
    if (anchor.classList.contains('mf-toggle')) {
      const title = anchor.querySelector('.mf-toggle-copy strong');
      if (title) return String(title.textContent || '').replace(/\s+NEW\s*$/i, '').trim();
    }
    return String(anchor.dataset?.[TITLE_KEY] || anchor.getAttribute('aria-label') || anchor.getAttribute('data-mf-tooltip-title') || '').trim();
  }

  function anchorIcon(anchor) {
    if (!anchor) return '';
    const source = anchor.querySelector('.mf-feature-icon,.mf-feather-tab-icon,.mf-nav-icon,.mf-feather-grid-icon,svg,img');
    if (!source) return '';
    if (source.tagName === 'IMG') {
      const src = source.getAttribute('src');
      return src ? `<img src="${src.replace(/"/g, '&quot;')}" alt="" style="width:22px;height:22px;object-fit:contain">` : '';
    }
    return source.outerHTML || source.innerHTML || '';
  }

  function positionTooltip(anchor) {
    if (!tooltip || !anchor?.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    const below = rect.top < 60;
    tooltip.classList.toggle('mf-below', below);
    tooltip.style.left = `${Math.max(24, Math.min(innerWidth - 24, rect.left + rect.width / 2))}px`;
    tooltip.style.top = below ? `${Math.min(innerHeight - 12, rect.bottom + 10)}px` : `${Math.max(8, rect.top - 10)}px`;
    tooltip.style.translate = below ? '0 0' : '0 -100%';
  }

  function hideTooltip() {
    clearTimeout(showTimer);
    activeAnchor = null;
    tooltip?.classList.remove('mf-visible');
  }

  function showTooltip(anchor) {
    const label = anchorLabel(anchor);
    if (!label) return hideTooltip();
    const box = ensureTooltip();
    box.querySelector('.mf-polish-tooltip-name').textContent = label;
    const icon = box.querySelector('.mf-polish-tooltip-icon');
    icon.innerHTML = anchorIcon(anchor);
    icon.style.display = icon.innerHTML ? 'flex' : 'none';
    activeAnchor = anchor;
    positionTooltip(anchor);
    requestAnimationFrame(() => activeAnchor === anchor && box.classList.add('mf-visible'));
  }

  function pulseModule(input) {
    const card = input?.closest?.('.mf-toggle');
    if (!card) return;
    card.classList.remove('mf-polish-state-change');
    void card.offsetWidth;
    card.classList.add('mf-polish-state-change');
    setTimeout(() => card.classList.remove('mf-polish-state-change'), 360);
  }

  function processRoot(root) {
    normalizeTitles(root instanceof Element ? root : document);
    normalizeLanguageOptions(root instanceof Element ? root : document);
  }

  function init() {
    injectStyle();
    processRoot(document);

    document.addEventListener('pointerover', event => {
      const anchor = tooltipAnchor(event.target);
      if (!anchor || anchor === activeAnchor) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => showTooltip(anchor), 210);
    }, true);

    document.addEventListener('pointerout', event => {
      if (!activeAnchor) return clearTimeout(showTimer);
      const next = event.relatedTarget;
      if (next instanceof Node && activeAnchor.contains(next)) return;
      hideTooltip();
    }, true);

    document.addEventListener('pointerdown', hideTooltip, true);
    document.addEventListener('change', event => {
      if (event.target instanceof HTMLSelectElement) normalizeLanguageOptions(event.target);
      if (event.target instanceof HTMLInputElement && event.target.classList.contains('mf-switch-hidden')) pulseModule(event.target);
    }, true);
    document.addEventListener('focusin', event => {
      if (event.target instanceof HTMLSelectElement) normalizeLanguageOptions(event.target);
    }, true);
    document.addEventListener('scroll', () => activeAnchor && positionTooltip(activeAnchor), true);
    window.addEventListener('resize', () => activeAnchor && positionTooltip(activeAnchor), { passive: true });

    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.id === 'mf-gui' || node.closest?.('#mf-gui') || node.querySelector?.('#mf-gui') || node.classList.contains('mf-feature-modal')) processRoot(node);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
