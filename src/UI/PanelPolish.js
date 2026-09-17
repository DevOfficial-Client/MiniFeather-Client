(() => {
  'use strict';

  const ROOT_ID = 'mf-polish-tooltip';
  const STYLE_ID = 'mf-panel-polish-style';
  const TITLE_DATASET = 'mfTooltipTitle';
  let activeAnchor = null;
  let showTimer = 0;
  let tooltip = null;

  const LANGUAGE_NAMES = Object.freeze({
    en: 'English',
    es: 'Español',
    ja: '日本語',
    it: 'Italiano',
    zh: '中文',
    fr: 'Français',
    de: 'Deutsch',
    pt: 'Português',
    ru: 'Русский',
    ko: '한국어'
  });

  const css = `
    #mf-gui {
      animation: mfPanelPolishIn 180ms cubic-bezier(.2,.75,.25,1) both;
    }
    @keyframes mfPanelPolishIn {
      from { opacity: 0; transform: translate(-50%, calc(-50% + 5px)) scale(.994); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
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
    #mf-gui select {
      transition:
        transform 150ms cubic-bezier(.2,.8,.25,1),
        box-shadow 180ms ease,
        border-color 180ms ease,
        background-color 180ms ease,
        color 180ms ease,
        opacity 180ms ease,
        filter 180ms ease;
    }

    #mf-gui button:not(:disabled):hover,
    #mf-gui .mf-btn:not(:disabled):hover,
    #mf-gui .mf-feather-category:hover,
    #mf-gui .mf-feather-tool:hover,
    #mf-gui .mf-feather-icon-tab:hover,
    #mf-gui .mf-feather-main-tab:hover,
    #mf-gui .mf-feature-settings:hover,
    #mf-gui .mf-feature-favorite:hover {
      transform: translateY(-2px);
      filter: brightness(1.06);
    }

    #mf-gui button:not(:disabled):active,
    #mf-gui .mf-btn:not(:disabled):active,
    #mf-gui .mf-feather-category:active,
    #mf-gui .mf-feather-tool:active,
    #mf-gui .mf-feather-icon-tab:active,
    #mf-gui .mf-feather-main-tab:active,
    #mf-gui .mf-feature-settings:active,
    #mf-gui .mf-feature-favorite:active {
      transform: translateY(0) scale(.975);
      transition-duration: 70ms;
    }

    #mf-gui .mf-toggle-grid .mf-toggle:hover,
    #mf-gui .mf-feather-module-grid .mf-toggle:hover {
      transform: translateY(-3px) !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.22);
      border-color: color-mix(in srgb, var(--mf-ui-accent, #6fa8ff) 28%, #333941 72%);
    }

    #mf-gui .mf-toggle-grid .mf-toggle:active,
    #mf-gui .mf-feather-module-grid .mf-toggle:active {
      transform: translateY(-1px) scale(.992) !important;
    }

    #mf-gui .mf-card:hover {
      border-color: #313840;
      box-shadow: 0 7px 20px rgba(0,0,0,.12);
    }

    #mf-gui input:focus,
    #mf-gui select:focus,
    #mf-gui button:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--mf-ui-accent, #6fa8ff) 42%, transparent 58%);
    }

    #mf-gui input[type="range"]:hover {
      filter: brightness(1.08);
    }

    #${ROOT_ID} {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 36px;
      max-width: 280px;
      padding: 7px 10px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(24,29,35,.97), rgba(14,18,22,.97));
      box-shadow: 0 10px 28px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.035);
      color: #eef1f5;
      font: 700 12px/1.2 Arial, sans-serif;
      pointer-events: none;
      opacity: 0;
      transform: translate(-50%, -4px) scale(.97);
      transition: opacity 120ms ease, transform 140ms cubic-bezier(.2,.8,.25,1);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    #${ROOT_ID}.mf-visible {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }

    #${ROOT_ID}.mf-below {
      transform: translate(-50%, 4px) scale(.97);
    }

    #${ROOT_ID}.mf-below.mf-visible {
      transform: translate(-50%, 0) scale(1);
    }

    #${ROOT_ID} .mf-polish-tooltip-icon {
      width: 24px;
      height: 24px;
      flex: 0 0 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--mf-ui-accent, #7fb2ff);
      font-size: 21px;
      line-height: 1;
    }

    #${ROOT_ID} .mf-polish-tooltip-icon svg {
      width: 22px;
      height: 22px;
    }

    #${ROOT_ID} .mf-polish-tooltip-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }



    /* Unify all legacy settings/dialog accents with the panel theme. */
    #mf-gui,
    #mf-gui-overlay,
    [class^="mf-"][class*="backdrop"],
    [class*=" mf-"][class*="backdrop"] {
      --mf-accent: var(--mf-ui-accent, var(--mf-global-accent, #ef3b3b));
      --mf-accent2: color-mix(in srgb, var(--mf-ui-accent, var(--mf-global-accent, #ef3b3b)) 82%, #fff 18%);
    }

    #mf-gui .mf-btn.primary,
    #mf-gui button.primary,
    #mf-gui [class*="bind"] .mf-btn.primary,
    #mf-gui [class*="settings"] .mf-btn.primary,
    #mf-gui [class*="modal"] .mf-btn.primary {
      background: linear-gradient(180deg,
        color-mix(in srgb, var(--mf-ui-accent, var(--mf-global-accent, #ef3b3b)) 92%, #fff 8%),
        color-mix(in srgb, var(--mf-ui-accent, var(--mf-global-accent, #ef3b3b)) 78%, #000 22%)) !important;
      border-color: color-mix(in srgb, var(--mf-ui-accent, var(--mf-global-accent, #ef3b3b)) 48%, transparent) !important;
      color:#fff !important;
    }

    #mf-gui input[type="range"],
    #mf-gui input[type="checkbox"],
    #mf-gui input[type="radio"] {
      accent-color: var(--mf-ui-accent, var(--mf-global-accent, #ef3b3b)) !important;
    }

    #mf-gui .mf-toggle:hover,
    #mf-gui .mf-toggle:has(input:checked),
    #mf-gui .mf-toggle:has(.mf-switch-hidden:checked),
    #mf-gui [class*="preset"].active,
    #mf-gui [class*="option"].active,
    #mf-gui [class*="tab"].active {
      border-color: var(--mf-ui-accent, var(--mf-global-accent, #ef3b3b)) !important;
    }

    #mf-gui .mf-toggle:has(input:checked),
    #mf-gui .mf-toggle:has(.mf-switch-hidden:checked),
    #mf-gui [class*="preset"].active,
    #mf-gui [class*="option"].active {
      background: color-mix(in srgb, var(--mf-ui-accent, var(--mf-global-accent, #ef3b3b)) 15%, transparent) !important;
    }

    #mf-gui .mf-select:focus,
    #mf-gui .mf-input:focus,
    #mf-gui input:focus,
    #mf-gui select:focus {
      border-color: color-mix(in srgb, var(--mf-ui-accent, var(--mf-global-accent, #ef3b3b)) 70%, #fff 30%) !important;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--mf-ui-accent, var(--mf-global-accent, #ef3b3b)) 26%, transparent) !important;
    }

    /* Native select highlight follows the current panel accent where supported. */
    #mf-gui .mf-select option:checked,
    #mf-language-select option:checked {
      background: var(--mf-ui-accent, var(--mf-global-accent, #ef3b3b)) !important;
      color:#fff !important;
    }

    /* Key-capture states use the same theme instead of legacy purple. */
    #mf-gui button[data-zoom-bind],
    #mf-gui button[data-fc-bind],
    #mf-gui button[data-co-bind],
    #mf-gui button[data-tt-bind],
    #mf-gui button[data-fl-bind],
    #mf-gui [data-mf-binding="true"] {
      border-color: color-mix(in srgb, var(--mf-ui-accent, var(--mf-global-accent, #ef3b3b)) 55%, transparent) !important;
    }

    @media (prefers-reduced-motion: reduce) {
      #mf-gui,
      #mf-gui *,
      #${ROOT_ID} {
        animation: none !important;
        transition-duration: .01ms !important;
        scroll-behavior: auto !important;
      }
      #mf-gui button:hover,
      #mf-gui .mf-btn:hover,
      #mf-gui .mf-toggle:hover,
      #mf-gui .mf-feather-category:hover,
      #mf-gui .mf-feather-tool:hover,
      #mf-gui .mf-feather-icon-tab:hover,
      #mf-gui .mf-feather-main-tab:hover,
      #mf-gui .mf-feature-settings:hover,
      #mf-gui .mf-feature-favorite:hover {
        transform: none !important;
      }
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
    tooltip = document.getElementById(ROOT_ID);
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = ROOT_ID;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.innerHTML = '<span class="mf-polish-tooltip-icon" aria-hidden="true"></span><span class="mf-polish-tooltip-name"></span>';
    (document.body || document.documentElement).appendChild(tooltip);
    return tooltip;
  }

  function normalizeLanguageOptions(root = document) {
    const selects = [];
    if (root instanceof HTMLSelectElement) selects.push(root);
    root.querySelectorAll?.('select').forEach(select => selects.push(select));

    for (const select of selects) {
      const id = String(select.id || '').toLowerCase();
      const aria = String(select.getAttribute('aria-label') || '').toLowerCase();
      const values = [...select.options].map(option => String(option.value || '').toLowerCase());
      const looksLikeLanguage = id.includes('language') || aria.includes('language') || values.filter(value => LANGUAGE_NAMES[value]).length >= 4;
      if (!looksLikeLanguage) continue;

      for (const option of select.options) {
        const code = String(option.value || '').toLowerCase();
        const name = LANGUAGE_NAMES[code];
        if (name) option.textContent = name;
      }
    }
  }

  function normalizeTitles(root = document) {
    const nodes = root.querySelectorAll?.('#mf-gui [title]') || [];
    for (const node of nodes) {
      const value = String(node.getAttribute('title') || '').trim();
      if (!value) continue;
      node.dataset[TITLE_DATASET] = value;
      if (!node.hasAttribute('aria-label')) node.setAttribute('aria-label', value);
      node.removeAttribute('title');
    }
  }

  function tooltipAnchor(target) {
    if (!(target instanceof Element) || !target.closest('#mf-gui')) return null;
    return target.closest(
      '.mf-toggle, .mf-feather-icon-tab, .mf-feather-tool, .mf-feature-settings, .mf-feature-favorite, [data-mf-tooltip-title], [aria-label]'
    );
  }

  function anchorLabel(anchor) {
    if (!anchor) return '';
    if (anchor.classList.contains('mf-toggle')) {
      const title = anchor.querySelector('.mf-toggle-copy strong');
      if (title) return String(title.textContent || '').replace(/\s+NEW\s*$/i, '').trim();
    }
    return String(
      anchor.dataset?.[TITLE_DATASET] ||
      anchor.getAttribute('aria-label') ||
      anchor.getAttribute('data-mf-tooltip-title') ||
      ''
    ).trim();
  }

  function anchorIcon(anchor) {
    if (!anchor) return '';
    const source = anchor.querySelector(
      '.mf-feature-icon, .mf-feather-tab-icon, .mf-nav-icon, .mf-feather-grid-icon, svg, img'
    );
    if (!source) return '';
    if (source.tagName === 'IMG') {
      const src = source.getAttribute('src');
      return src ? `<img src="${src.replace(/"/g, '&quot;')}" alt="" style="width:22px;height:22px;object-fit:contain;">` : '';
    }
    return source.outerHTML || source.innerHTML || '';
  }

  function position(anchor) {
    if (!tooltip || !anchor?.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 10;
    const below = rect.top < 60;
    tooltip.classList.toggle('mf-below', below);
    tooltip.style.left = `${Math.max(24, Math.min(innerWidth - 24, rect.left + rect.width / 2))}px`;
    tooltip.style.top = below ? `${Math.min(innerHeight - 12, rect.bottom + margin)}px` : `${Math.max(8, rect.top - margin)}px`;
    tooltip.style.translate = below ? '0 0' : '0 -100%';
  }

  function hide() {
    clearTimeout(showTimer);
    activeAnchor = null;
    if (tooltip) tooltip.classList.remove('mf-visible');
  }

  function show(anchor) {
    const label = anchorLabel(anchor);
    if (!label) return hide();
    const box = ensureTooltip();
    const name = box.querySelector('.mf-polish-tooltip-name');
    const icon = box.querySelector('.mf-polish-tooltip-icon');
    name.textContent = label;
    icon.innerHTML = anchorIcon(anchor);
    icon.style.display = icon.innerHTML ? 'flex' : 'none';
    activeAnchor = anchor;
    position(anchor);
    requestAnimationFrame(() => {
      if (activeAnchor === anchor) box.classList.add('mf-visible');
    });
  }

  function onPointerOver(event) {
    const anchor = tooltipAnchor(event.target);
    if (!anchor || anchor === activeAnchor) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => show(anchor), 220);
  }

  function onPointerOut(event) {
    if (!activeAnchor) {
      clearTimeout(showTimer);
      return;
    }
    const next = event.relatedTarget;
    if (next instanceof Node && activeAnchor.contains(next)) return;
    const leaving = tooltipAnchor(event.target);
    if (leaving === activeAnchor || !next || !(next instanceof Element) || !activeAnchor.contains(next)) hide();
  }

  function init() {
    injectStyle();
    normalizeTitles();
    normalizeLanguageOptions();
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('scroll', () => activeAnchor && position(activeAnchor), true);
    window.addEventListener('resize', () => activeAnchor && position(activeAnchor), { passive: true });

    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.id === 'mf-gui' || node.closest?.('#mf-gui') || node.querySelector?.('#mf-gui')) {
            normalizeTitles(node.matches?.('#mf-gui') ? node : document);
            normalizeLanguageOptions(node.matches?.('#mf-gui') ? node : document);
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener('focusin', event => {
      if (event.target instanceof HTMLSelectElement) normalizeLanguageOptions(event.target);
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
