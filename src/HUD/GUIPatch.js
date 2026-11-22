
(function () {
  'use strict';

  let GUI_BASE = '';
  let pendingTimer = null;
  let cachedGame = null;
  let lastGameScan = 0;
  let barStyles = null;
  const barOverlays = new Map();
  const PATCHED_BAR = '[data-mf-gui-bar]';
  const GUI_OVERLAY = '[data-mf-gui-overlay]';
  const VITAL_ICON_SIZE = 22;
  const XP_TRACK_HEIGHT = 8;
  const NATIVE_VITAL_FILLS = {
    'rgb(211, 4, 11)': 'healthBarRef',
    'rgb(199, 129, 81)': 'foodBarRef'
  };

  const GUI_BUNDLE_RE = /\/assets\/GuiHud[^/]*\.js(\?.*)?$/i;
  let guiBundleActive = false;
  let lastBundleScan = 0;

  function testGuiHudUrl(url) {
    return GUI_BUNDLE_RE.test(url || '');
  }

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.initiatorType === 'script' && testGuiHudUrl(e.name)) {
          guiBundleActive = true;
          break;
        }
      }
    }).observe({ type: 'resource', buffered: true });
  } catch (_) {}

  const scriptObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && n.tagName === 'SCRIPT' && testGuiHudUrl(n.getAttribute('src'))) {
          guiBundleActive = true;
          return;
        }
      }
    }
  });
  scriptObserver.observe(document.documentElement, { childList: true, subtree: true });

  function isGuiHudBundleActive() {
    if (guiBundleActive) return true;
    try {
      // el historial de recursos solo crece; escaneo completo como mucho una vez cada 7s
      const now = performance.now();
      if (lastBundleScan && now - lastBundleScan < 7000) return false;
      lastBundleScan = now;

      for (const s of document.scripts) {
        if (testGuiHudUrl(s.getAttribute('src'))) return (guiBundleActive = true);
      }

      for (const e of performance.getEntriesByType('resource')) {
        if (e.initiatorType === 'script' && testGuiHudUrl(e.name)) return (guiBundleActive = true);
      }
    } catch (_) {}
    return false;
  }

  function canPatch() {
    return state.enabled && GUI_BASE && isGuiHudBundleActive();
  }

  function isGhostMode(game) {
    try {
      if (game?.info?.spectating) return true;
      const gm = game?.info?.gamemode;
      if (!gm) return false;
      if (typeof gm.isCreative === 'function' && gm.isCreative()) return true;
      const id = typeof gm.id === 'string' ? gm.id.toLowerCase() : String(gm.id).toLowerCase();
      return id === 'creative' || id === 'spectator';
    } catch (_) {}
    return false;
  }

  const state = {
    enabled: false,
    observers: [],
    overlay: null,
    overlayInterval: null,
    barFinderInterval: null,
    healthBarRef: null,
    foodBarRef: null,
    xpBarRef: null
  };

  function getGame(force = false) {
    const now = performance.now();
    if (!force && cachedGame?.player && now - lastGameScan < 1000) return cachedGame;
    lastGameScan = now;
    try {
      const react = document.querySelector('#react');
      if (!react) return cachedGame?.player ? cachedGame : null;
      for (const root of Object.values(react)) {
        const game = root?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player) return (cachedGame = game);
      }
    } catch (_) {}
    return cachedGame?.player ? cachedGame : null;
  }

  function isGameReady(game) {
    try {
      if (!game?.info) return false;
      if (game.info.inLoadedChunk === false) return false;

      return true;
    } catch (_) {}
    return false;
  }

  function getWifiIcon(ping) {
    if (ping < 50) return GUI_BASE + 'red/wififull.png';
    if (ping < 100) return GUI_BASE + 'red/wifi4.png';
    if (ping < 150) return GUI_BASE + 'red/wifi3.png';
    if (ping < 200) return GUI_BASE + 'red/wifi2.png';
    if (ping < 300) return GUI_BASE + 'red/wifi1.png';
    return GUI_BASE + 'red/wifi0.png';
  }

  function createWifiIcon(ping) {
    const img = document.createElement('img');
    img.src = getWifiIcon(ping);
    img.alt = 'connection';
    img.style.cssText = [
      'height:12px', 'width:12px', 'image-rendering:pixelated',
      'object-fit:contain', 'margin-right:4px', 'vertical-align:middle'
    ].join(';');
    return img;
  }

  function schedulePatch(fn) {
    if (pendingTimer) return;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      try { fn(); } catch (_) {}
    }, 500);
  }

  function isInChatArea(el) {
    if (!el) return false;
    if (el.closest('input, textarea, [contenteditable], [data-chat], [class*="chat" i]')) return true;
    return false;
  }

  function isCenteredLikeHud(el) {
    const r = el.getBoundingClientRect();
    if (!r.width) return false;
    const cx = r.left + r.width / 2;
    const center = window.innerWidth / 2;

    return Math.abs(cx - center) < window.innerWidth * 0.25;
  }

  function findBarFrame(element) {
    const bounds = element.getBoundingClientRect();
    let frame = element;
    // The HUD puts the label and coloured fills in separate, overlapping grid cells.
    for (let depth = 0; depth < 5; depth++) {
      const parent = frame.parentElement;
      if (!parent || parent === document.body || parent.id === 'react' || parent.querySelector(PATCHED_BAR)) break;
      if (parseFloat(window.getComputedStyle(frame).borderTopWidth) > 0) break;
      const rect = parent.getBoundingClientRect();
      if (Math.abs(rect.left - bounds.left) > 6 || Math.abs(rect.right - bounds.right) > 6 ||
          Math.abs(rect.top - bounds.top) > 6 || Math.abs(rect.bottom - bounds.bottom) > 6) break;
      frame = parent;
    }
    return frame;
  }

  function removeBarOverlay(className) {
    const patch = barOverlays.get(className);
    if (!patch) return;
    patch.overlay.remove();
    delete patch.bar.dataset.mfGuiBar;
    barOverlays.delete(className);
  }

  function mountBarOverlay(bar, className) {
    const patch = barOverlays.get(className);
    if (patch?.bar === bar && patch.overlay.parentElement === bar) return patch.overlay;
    removeBarOverlay(className);

    const overlay = document.createElement('div');
    overlay.className = className;
    overlay.dataset.mfGuiOverlay = '';
    const position = window.getComputedStyle(bar).position;
    bar.appendChild(overlay);
    bar.dataset.mfGuiBar = !position || position === 'static' ? 'relative' : 'positioned';
    barOverlays.set(className, { bar, overlay });
    return overlay;
  }

  function alignBarOverlays(isMobile) {
    const xp = barOverlays.get('mf-xp-icons');
    const hearts = barOverlays.get('mf-hearts');
    const food = barOverlays.get('mf-food');
    const xpRect = xp?.bar.getBoundingClientRect();
    const heartRect = hearts?.bar.getBoundingClientRect();
    const foodRect = food?.bar.getBoundingClientRect();
    const stack = !isMobile && xpRect?.height && heartRect?.height &&
      xpRect.bottom <= heartRect.top + 4 && heartRect.left >= xpRect.left - 6 &&
      heartRect.right <= xpRect.right + 6 &&
      (!foodRect?.height || Math.abs(foodRect.bottom - heartRect.bottom) <= 8);
    const bottom = stack ? Math.max(heartRect.bottom, foodRect?.bottom ?? heartRect.bottom) : 0;
    const xpCenter = bottom - XP_TRACK_HEIGHT / 2;
    const vitalCenter = bottom - XP_TRACK_HEIGHT - 2 - VITAL_ICON_SIZE / 2;

    for (const [patch, rect, center] of [[xp, xpRect, xpCenter], [hearts, heartRect, vitalCenter], [food, foodRect, vitalCenter]]) {
      if (!patch) continue;
      const offset = stack && rect.height ? Math.round(center - (rect.top + rect.height / 2)) : 0;
      const value = offset + 'px';
      if (patch.overlay.style.getPropertyValue('--mf-bar-shift') !== value) {
        patch.overlay.style.setProperty('--mf-bar-shift', value);
      }
    }
  }

  function findOriginalBars() {
    for (const fill of document.querySelectorAll('#react div[style*="grid-area"], #react div[style*="grid-row"]')) {
      const slot = NATIVE_VITAL_FILLS[fill.style.backgroundColor];
      if (!slot || state[slot]?.isConnected || fill.closest(PATCHED_BAR)) continue;
      const grid = fill.parentElement;
      if (grid?.style.display !== 'grid' || isInChatArea(grid)) continue;

      // The fill shrinks with the stat. The grid and its frame retain the full width.
      const frame = findBarFrame(grid);
      const { width, height } = frame.getBoundingClientRect();
      if (width < 60 || height < 8 || !/^\d+(?:\.\d+)?\s*\/\s*\d+$/.test(frame.textContent.trim())) continue;
      state[slot] = frame;
      if (state.healthBarRef?.isConnected && state.foodBarRef?.isConnected) break;
    }
  }

  function patchPlayerList() {
    // los padres ya servidos no vuelven a pagar queryselector
    const patchedParents = new WeakSet();
    const observer = new MutationObserver(() => {
      if (!canPatch()) return;
      if (!isGameReady(getGame())) return;
      schedulePatch(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        while (walker.nextNode()) {
          if (!/^\d+ms$/.test(walker.currentNode.textContent)) continue;
          const parent = walker.currentNode.parentElement;
          if (!parent || patchedParents.has(parent)) continue;
          const first = parent.firstElementChild;
          if (first && first.classList.contains('wifi-icon-patch')) { patchedParents.add(parent); continue; }
          if (parent.querySelector('.wifi-icon-patch')) { patchedParents.add(parent); continue; }
          nodes.push(walker.currentNode);
        }
        nodes.forEach(node => {
          const match = node.textContent.match(/^(\d+)ms$/);
          if (!match) return;
          const ping = parseInt(match[1]);
          const parent = node.parentElement;
          if (parent && !parent.querySelector('.wifi-icon-patch')) {
            const icon = createWifiIcon(ping);
            icon.className = 'wifi-icon-patch';
            parent.insertBefore(icon, node);
          }
          if (parent) patchedParents.add(parent);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    state.observers.push(observer);
  }

  function isSaturatedColor(bg) {
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return false;
    const r = +m[1], g = +m[2], b = +m[3];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return (max - min > 25 && max > 40 && !(r > 200 && g > 200 && b > 200));
  }

  function hasColoredBg(el) {
    try {
      const s = window.getComputedStyle(el);
      if (s.backgroundColor && isSaturatedColor(s.backgroundColor)) return true;
      if (s.backgroundImage && s.backgroundImage !== 'none') return true;
    } catch (_) {}
    return false;
  }

  function findNativeXpBar(level) {
    // Level zero still has a heading in the native XP bar, with empty text.
    const expected = level > 0 ? String(level) : '';
    for (const label of document.querySelectorAll('#react h3')) {
      if (label.textContent.trim() !== expected || label.closest(PATCHED_BAR) || isInChatArea(label)) continue;
      const cell = label.parentElement;
      if (!cell) continue;
      const frame = findBarFrame(cell);
      if (frame.textContent.trim() !== expected || frame.contains(state.healthBarRef) ||
          frame.contains(state.foodBarRef)) continue;
      const rect = frame.getBoundingClientRect();
      if (rect.height < 3 || rect.height > 32 || rect.width < Math.max(60, rect.height * 3) ||
          rect.top < window.innerHeight * 0.5 || !isCenteredLikeHud(frame)) continue;
      if (hasColoredBg(frame) || Array.from(frame.querySelectorAll('[style]')).some(hasColoredBg)) return frame;
    }
    return null;
  }

  function patchXPBar() {
    let lastXpKey = '';
    let searchDelay = 100;
    let xpTimer = null;

    const xpWork = () => {
      if (!canPatch()) return 100;
      const game = getGame();
      if (!game || !game.info) return 100;

      if (!isGameReady(game)) return 100;

      const progress = Math.max(0, Math.min(1, Number(game.info.xp?.experience) || 0));
      const level = (game.info?.xp?.experienceLevel || 0);
      const isMobile = (game?.isMobile || false);
      const totalIcons = 18;
      const filledIcons = Math.ceil(progress * totalIcons);

      const ghost = isGhostMode(game);
      const previousBar = state.xpBarRef;
      let xpBar = previousBar?.isConnected && previousBar.querySelector('h3') ? previousBar : null;
      if (!xpBar && !ghost) xpBar = findNativeXpBar(level);
      state.xpBarRef = xpBar;
      if (!xpBar) {
        removeBarOverlay('mf-xp-icons');
        alignBarOverlays(isMobile);
        searchDelay = Math.min(searchDelay * 2, 2000);
        return searchDelay;
      }

      searchDelay = 100;
      const guiOpacity = ghost ? 0.35 : 1;
      const xpKey = [progress, level, isMobile, ghost, GUI_BASE].join(':');
      const existing = barOverlays.get('mf-xp-icons')?.overlay;
      if (existing?.parentElement === xpBar && lastXpKey === xpKey) {
        alignBarOverlays(isMobile);
        return 100;
      }
      lastXpKey = xpKey;

      const container = mountBarOverlay(xpBar, 'mf-xp-icons');
      container.replaceChildren();

      container.style.cssText = [
        'top:50%', 'bottom:auto', 'height:' + (isMobile ? 6 : XP_TRACK_HEIGHT) + 'px',
        'transform:translateY(calc(-50% + var(--mf-bar-shift, 0px)))',
        'opacity:' + guiOpacity, 'transition:opacity 0.3s'
      ].join(';');

      const track = document.createElement('img');
      track.className = 'mf-xp-track';
      track.src = GUI_BASE + 'exp/EXPVASSEL.png';
      track.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;object-fit:fill;';
      container.appendChild(track);

      const fill = document.createElement('div');
      fill.className = 'mf-xp-fill';
      fill.style.cssText = 'position:absolute;inset:0;clip-path:inset(0 ' + ((1 - progress) * 100) + '% 0 0);';
      const appendSegment = (file, left, width) => {
        const segment = document.createElement('img');
        segment.src = GUI_BASE + 'exp/' + file;
        segment.style.cssText = 'position:absolute;top:0;height:100%;image-rendering:pixelated;object-fit:fill;' +
          'left:' + (left / 182 * 100) + '%;width:' + (width / 182 * 100) + '%;';
        fill.appendChild(segment);
      };
      // The track sprite is 182 pixels wide: eighteen 10px segments and a 2px join.
      for (let i = 1; i <= filledIcons; i++) {
        appendSegment('exp' + i + '.png', (i - 1) * 10 + (i > 9 ? 2 : 0), 10);
      }
      if (filledIcons > 9) appendSegment('middle.png', 90, 2);
      container.appendChild(fill);

      const levelText = document.createElement('span');
      levelText.textContent = level > 0 ? level : '';
      levelText.style.cssText = [
        'position:absolute', 'left:50%', 'bottom:calc(100% + 1px)',
        'transform:translateX(-50%)',
        'color:#8DFC0F', 'font-weight:bold',
        'font-size:' + (isMobile ? '11px' : '13px'),
        'text-shadow:1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000',
        'pointer-events:none', 'z-index:2'
      ].join(';');
      container.appendChild(levelText);
      alignBarOverlays(isMobile);

      return 100;
    };

    const xpTick = () => {
      let delay = 100;
      try { delay = xpWork(); } catch (_) {}
      xpTimer = setTimeout(xpTick, delay);
    };
    xpTimer = setTimeout(xpTick, 100);

    state.observers.push({
      disconnect: () => {
        clearTimeout(xpTimer);
        state.xpBarRef = null;
        removeBarOverlay('mf-xp-icons');
      }
    });
  }

  function patchDebugStats() {
    // recuento y primera casilla congelados: la pasada entera se da por servida
    let lastStatCount = -1;
    let lastStatFirst = null;
    const observer = new MutationObserver(() => {
      if (!canPatch()) return;
      if (!isGameReady(getGame())) return;
      schedulePatch(() => {
        const pingElements = document.querySelectorAll('[class*="debug"], [class*="stat"]');
        const firstEl = pingElements[0] || null;
        if (pingElements.length === lastStatCount && firstEl === lastStatFirst) return;
        lastStatCount = pingElements.length;
        lastStatFirst = firstEl;
        pingElements.forEach(el => {
          // solo hojas: un contenedor con hijos no lleva el ping encima
          if (el.children.length !== 0) return;
          if (el.classList.contains('debug-patched')) return;
          const text = el.textContent;
          const match = text.match(/Ping[:\s]*(\d+(?:\.\d+)?)\s*ms/i);
          if (match) {
            const ping = parseFloat(match[1]);
            if (!el.querySelector('.wifi-debug-icon')) {
              const icon = createWifiIcon(ping);
              icon.className = 'wifi-debug-icon';
              el.style.display = 'flex';
              el.style.alignItems = 'center';
              el.style.gap = '5px';
              el.appendChild(icon);
              el.classList.add('debug-patched');
            }
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    state.observers.push(observer);
  }

  // rastreo lento de barras originales: cada 1.5s y solo mientras falten refs
  function startBarFinder() {
    if (state.barFinderInterval) return;
    state.barFinderInterval = setInterval(() => {
      if (!canPatch()) return;
      const game = getGame();
      if (!game || !game.info || !isGameReady(game)) return;
      if (isGhostMode(game)) return;
      findOriginalBars();
      // con las dos barras en casa, el rastreo se apaga solo
      if (state.healthBarRef?.isConnected && state.foodBarRef?.isConnected) {
        clearInterval(state.barFinderInterval);
        state.barFinderInterval = null;
      }
    }, 1500);
  }

  function createHealthFoodOverlay() {
    if (state.overlay) return;
    state.overlay = true;

    let lastOverlayKey = '';
    let lastHealthBar = null;
    let lastFoodBar = null;

    state.overlayInterval = setInterval(() => {
      if (!canPatch()) return;

      const game = getGame();
      if (!game || !game.info) return;

      if (!isGameReady(game)) return;

      const health = game.info.health ?? 20;
      const food = game.info.food ?? 20;
      const absorption = game.info.absorption ?? 0;
      const iconSize = VITAL_ICON_SIZE;

      const hardcore = game.serverInfo?.hardcore === true ||
                       game.serverInfo?.metadata?.hardcore === true;

      const ghost = isGhostMode(game);
      const guiOpacity = ghost ? 0.35 : 1;

      const bars = {
        healthBar: state.healthBarRef?.isConnected ? state.healthBarRef : null,
        foodBar: state.foodBarRef?.isConnected ? state.foodBarRef : null
      };
      // refs ausentes o a medias: el rastreo lento se encarga, no este tick
      if ((!bars.healthBar || !bars.foodBar) && !ghost) startBarFinder();
      if (!bars.healthBar) removeBarOverlay('mf-hearts');
      if (!bars.foodBar) removeBarOverlay('mf-food');

      const healthLive = !bars.healthBar || barOverlays.get('mf-hearts')?.overlay.parentElement === bars.healthBar;
      const foodLive = !bars.foodBar || barOverlays.get('mf-food')?.overlay.parentElement === bars.foodBar;
      const overlayKey = [health, food, absorption, hardcore, ghost, iconSize, GUI_BASE].join(':');
      if (overlayKey === lastOverlayKey && healthLive && foodLive &&
          bars.healthBar === lastHealthBar && bars.foodBar === lastFoodBar) return;
      lastOverlayKey = overlayKey;
      lastHealthBar = bars.healthBar;
      lastFoodBar = bars.foodBar;

      if (bars.healthBar) {
        const hearts = mountBarOverlay(bars.healthBar, 'mf-hearts');
        hearts.replaceChildren();
        hearts.style.cssText = 'display:flex;gap:2px;align-items:center;opacity:' + guiOpacity + ';transition:opacity 0.3s;';

        const redRow = document.createElement('div');
        redRow.style.cssText = 'display:flex;gap:2px;align-items:center;max-width:100%;';
        for (let i = 0; i < 10; i++) {
          const heartValue = health - i * 2;
          let iconFile;
          if (hardcore) {
            if (heartValue >= 1.5) iconFile = 'hardcore/full.png';
            else if (heartValue >= 0.5) iconFile = 'hardcore/half.png';
            else iconFile = 'hardcore/empty.png';
          } else {
            if (heartValue >= 1.5) iconFile = 'heart_full.png';
            else if (heartValue >= 0.5) iconFile = 'heart_half.png';
            else iconFile = 'heart_empty.png';
          }
          const img = document.createElement('img');
          img.src = GUI_BASE + iconFile;
          img.style.cssText = [
            'height:' + iconSize + 'px', 'width:' + iconSize + 'px',
            'image-rendering:pixelated', 'object-fit:contain', 'min-width:0'
          ].join(';');
          redRow.appendChild(img);
        }
        hearts.appendChild(redRow);

        const absorptionHearts = Math.ceil(absorption / 2);
        if (absorptionHearts > 0) {
          const goldRow = document.createElement('div');
          goldRow.style.cssText = 'position:absolute;top:50%;left:0;transform:translateY(-50%);display:flex;' +
            'gap:2px;align-items:center;max-width:100%;pointer-events:none;';
          for (let i = 0; i < absorptionHearts; i++) {
            const heartValue = absorption - i * 2;
            let iconFile;
            if (heartValue >= 1.5) iconFile = 'golden_full.png';
            else if (heartValue >= 0.5) iconFile = 'golden_half.png';
            else iconFile = 'heart_empty.png';
            const img = document.createElement('img');
            img.src = GUI_BASE + iconFile;
            img.style.cssText = [
              'height:' + iconSize + 'px', 'width:' + iconSize + 'px',
              'image-rendering:pixelated', 'object-fit:contain', 'min-width:0'
            ].join(';');
            goldRow.appendChild(img);
          }
          hearts.appendChild(goldRow);
        }
      }

      if (bars.foodBar) {
        const foodIcons = mountBarOverlay(bars.foodBar, 'mf-food');
        foodIcons.style.cssText = 'display:flex;gap:2px;align-items:center;flex-direction:row-reverse;opacity:' +
          guiOpacity + ';transition:opacity 0.3s;';
        foodIcons.replaceChildren();
        for (let i = 0; i < 10; i++) {
          const foodValue = food - i * 2;
          let iconFile;
          if (foodValue >= 1.5) iconFile = 'food_full.png';
          else if (foodValue >= 0.5) iconFile = 'food_half.png';
          else iconFile = 'food_empty.png';
          const img = document.createElement('img');
          img.src = GUI_BASE + iconFile;
          img.style.cssText = [
            'height:' + iconSize + 'px', 'width:' + iconSize + 'px',
            'image-rendering:pixelated', 'object-fit:contain', 'min-width:0'
          ].join(';');
          foodIcons.appendChild(img);
        }
      }
      alignBarOverlays(game.isMobile);
    }, 200);
  }

  function removeHealthFoodOverlay() {
    if (state.overlayInterval) {
      clearInterval(state.overlayInterval);
      state.overlayInterval = null;
    }
    if (state.barFinderInterval) {
      clearInterval(state.barFinderInterval);
      state.barFinderInterval = null;
    }
    state.overlay = null;
    state.healthBarRef = null;
    state.foodBarRef = null;
    removeBarOverlay('mf-hearts');
    removeBarOverlay('mf-food');
  }

  function initPatches() {
    barStyles = document.createElement('style');
    // Hide the native paint while allowing overlays to inherit the game's HUD visibility.
    barStyles.textContent = [
      PATCHED_BAR + ' { background:transparent !important; border-color:transparent !important;' +
        'box-shadow:none !important; color:transparent !important; text-shadow:none !important;' +
        'overflow:visible !important; }',
      '[data-mf-gui-bar="relative"] { position:relative !important; }',
      PATCHED_BAR + ' > :not(' + GUI_OVERLAY + ') { visibility:hidden !important; }',
      PATCHED_BAR + ' > ' + GUI_OVERLAY + ' { position:absolute;inset:0;pointer-events:none;box-sizing:border-box; }',
      PATCHED_BAR + ' > :is(.mf-hearts, .mf-food) { transform:translateY(var(--mf-bar-shift, 0px)); }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(barStyles);
    patchPlayerList();
    patchXPBar();
    patchDebugStats();
    createHealthFoodOverlay();
  }

  function enable() {
    if (state.enabled) return;
    state.enabled = true;
    // se rearma el vigía del bundle, que el disable lo mandó a dormir
    scriptObserver.observe(document.documentElement, { childList: true, subtree: true });
    initPatches();
  }

  function disable() {
    state.enabled = false;
    // el vigía del bundle también descansa al apagar
    scriptObserver.disconnect();
    state.observers.forEach(o => o.disconnect());
    state.observers = [];
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    removeHealthFoodOverlay();
    barStyles?.remove();
    barStyles = null;
    document.querySelectorAll('.wifi-icon-patch, .wifi-debug-icon').forEach(el => el.remove());
  }

  document.addEventListener('minifeather:guipatch-config', (e) => {
    try {
      const cfg = JSON.parse(e.detail);
      if (cfg.guiBase) GUI_BASE = cfg.guiBase;
      if (cfg.enabled) enable();
      else disable();
    } catch (err) { console.error('minifeather guipatch error:', err); }
  });

  void 0;
  globalThis.GUIPatch = {
    enable, disable, state,
    get enabled() { return state.enabled; },
    setGuiBase(url) { GUI_BASE = url; }
  };
})();
