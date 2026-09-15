
(function () {
  'use strict';

  let GUI_BASE = '';
  let pendingTimer = null;
  let cachedGame = null;
  let lastGameScan = 0;

  const GUI_BUNDLE_RE = /\/assets\/GuiHud[^/]*\.js(\?.*)?$/i;
  let guiBundleActive = false;

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

  function findOriginalBars() {
    const result = { healthBar: null, foodBar: null };
    try {
      
      if (state.healthBarRef && state.healthBarRef.isConnected) {
        if (state.healthBarRef.querySelector('.mf-hearts')) {
          result.healthBar = state.healthBarRef;
        } else {
          state.healthBarRef = null;
        }
      }
      if (state.foodBarRef && state.foodBarRef.isConnected) {
        if (state.foodBarRef.querySelector('.mf-food')) {
          result.foodBar = state.foodBarRef;
        } else {
          state.foodBarRef = null;
        }
      }
      if (result.healthBar && result.foodBar) return result;

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      const textBars = [];
      while (walker.nextNode()) {
        const txt = walker.currentNode.textContent.trim();
        if (txt.match(/^\d+\.?\d*\s*\/\s*\d+$/)) {
          let el = walker.currentNode.parentElement;
          for (let i = 0; i < 5 && el; i++) el = el.parentElement;
          if (el && !el.dataset.mfReplaced && !isInChatArea(el) && isCenteredLikeHud(el)) textBars.push(el);
        }
      }
      if (textBars.length >= 2) {
        if (!result.healthBar) { result.healthBar = textBars[0]; state.healthBarRef = textBars[0]; }
        if (!result.foodBar) { result.foodBar = textBars[1]; state.foodBarRef = textBars[1]; }
        return result;
      }

      const allDivs = document.querySelectorAll('div');
      const hudCandidates = [];
      for (const el of allDivs) {
        if (el.dataset.mfReplaced || el.dataset.mfXpReplaced) continue;
        if (el.querySelector('.mf-hearts, .mf-food, .mf-xp-icons')) continue;
        if (isInChatArea(el)) continue;

        const ownText = Array.from(el.childNodes)
          .filter(n => n.nodeType === 3)
          .map(n => n.textContent.trim())
          .join('');
        if (ownText.match(/^\d+\.?\d*\s*\/\s*\d+$/) && isCenteredLikeHud(el)) {
          hudCandidates.push(el);
        }
      }
      if (hudCandidates.length >= 2) {
        if (!result.healthBar) { result.healthBar = hudCandidates[0]; state.healthBarRef = hudCandidates[0]; }
        if (!result.foodBar) { result.foodBar = hudCandidates[1]; state.foodBarRef = hudCandidates[1]; }
      }

      if (!result.healthBar || !result.foodBar) {
        const bordered = [];
        for (const el of allDivs) {
          if (el.dataset.mfReplaced) continue;
          if (el.querySelector('.mf-hearts, .mf-food')) continue;
          if (isInChatArea(el)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 60 || rect.width > 400) continue;
          if (rect.height < 15 || rect.height > 100) continue;
          if (!isCenteredLikeHud(el)) continue;
          try {
            const s = window.getComputedStyle(el);
            
            const hasBorder = s.border && s.border !== 'none' && s.border.includes('px');
            const hasBg = s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
            if (hasBorder || hasBg) {
              
              if (rect.top > window.innerHeight * 0.4) {
                bordered.push(el);
              }
            }
          } catch (_) {}
        }
        
        bordered.sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return rb.bottom - ra.bottom || ra.left - rb.left;
        });
        if (bordered.length >= 2) {
          if (!result.healthBar) { result.healthBar = bordered[0]; state.healthBarRef = bordered[0]; }
          if (!result.foodBar) { result.foodBar = bordered[1]; state.foodBarRef = bordered[1]; }
        }
      }
    } catch (_) {}
    return result;
  }

  function patchPlayerList() {
    const observer = new MutationObserver(() => {
      if (!canPatch()) return;
      if (!isGameReady(getGame())) return;
      schedulePatch(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        while (walker.nextNode()) {
          const parent = walker.currentNode.parentElement;
          if (parent && parent.querySelector('.wifi-icon-patch')) continue;
          if (walker.currentNode.textContent.match(/^\d+ms$/)) nodes.push(walker.currentNode);
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

  function patchXPBar() {
    let lastXpKey = '';
    const interval = setInterval(() => {
      if (!canPatch()) return;
      const game = getGame();
      if (!game || !game.info) return;
      
      if (!isGameReady(game)) return;

      const experience = (game.info?.xp?.experience || 0);
      const level = (game.info?.xp?.experienceLevel || 0);
      const isMobile = (game?.isMobile || false);
      const iconSize = isMobile ? 12 : 16;
      const totalIcons = 18;
      const filledIcons = Math.round(experience * totalIcons);

      let xpBar = null;

      if (state.xpBarRef && state.xpBarRef.isConnected) {
        xpBar = state.xpBarRef;
      }

      if (!xpBar) {
        const allDivs = document.querySelectorAll('div');
        for (const el of allDivs) {
          if (el.classList.contains('mf-xp-icons') || el.closest('.mf-xp-icons')) continue;
          if (el.classList.contains('mf-hearts') || el.closest('.mf-hearts')) continue;
          if (el.classList.contains('mf-food') || el.closest('.mf-food')) continue;
          if (el.dataset.mfReplaced || el.dataset.mfXpReplaced) continue;
          if (isInChatArea(el)) continue;
          
          if (el.querySelector('.mf-hearts, .mf-food')) continue;
          
          const textContent = el.textContent.trim();
          if (/^\d+\.?\d*\s*\/\s*\d+$/.test(textContent)) continue;

          const h = el.offsetHeight;
          const w = el.offsetWidth;
          
          if (h < 3 || h > 25) continue;
          if (w < 60 || w < h * 3) continue;

          const rect = el.getBoundingClientRect();
          if (rect.top < window.innerHeight * 0.5) continue;
          if (!isCenteredLikeHud(el)) continue;

          let colored = hasColoredBg(el);
          if (!colored) {
            for (const child of el.children) {
              if (hasColoredBg(child)) { colored = true; break; }
            }
          }
          if (!colored) continue;

          xpBar = el;
          state.xpBarRef = el;
          break;
        }
      }

      if (!xpBar) return;
      
      if (xpBar.querySelector('.mf-hearts, .mf-food')) return;

      const ghost = isGhostMode(game);
      const guiOpacity = ghost ? 0.35 : 1;
      const xpKey = filledIcons + ':' + level + ':' + isMobile + ':' + ghost;
      const existing = xpBar.querySelector('.mf-xp-icons');
      if (existing) {
        
        existing.style.opacity = guiOpacity;
        existing.style.transition = 'opacity 0.3s';
        if (lastXpKey === xpKey) return;
      }
      lastXpKey = xpKey;

      const nukeBg = (el) => {
        if (!el) return;
        el.style.background = 'transparent';
        el.style.backgroundColor = 'transparent';
        el.style.backgroundImage = 'none';
        el.style.border = 'none';
        el.style.boxShadow = 'none';
        el.style.outline = 'none';
      };

      nukeBg(xpBar);
      xpBar.dataset.mfXpReplaced = '1';

      let container = xpBar.querySelector('.mf-xp-icons');
      if (!container) {
        
        xpBar.innerHTML = '';
        container = document.createElement('div');
        container.className = 'mf-xp-icons';
        xpBar.appendChild(container);
      } else {
        
        container.innerHTML = '';
      }

      container.style.cssText = [
        'display:flex', 'align-items:center', 'justify-content:center',
        'gap:0', 'width:100%', 'height:100%', 'position:relative',
        'background:rgba(0,0,0,0.5)',
        'border:2px solid #1E1E1E',
        'box-shadow:inset 1px 1px 0 #373737, inset -1px -1px 0 #373737'
      ].join(';');

      for (let i = 1; i <= totalIcons; i++) {
        const slot = document.createElement('div');
        slot.style.cssText = 'position:relative;width:' + iconSize + 'px;height:' + iconSize + 'px;';

        const vessel = document.createElement('img');
        vessel.src = GUI_BASE + 'exp/EXPVASSEL.png';
        vessel.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;image-rendering:pixelated;object-fit:contain;';
        slot.appendChild(vessel);

        if (i <= filledIcons) {
          const fill = document.createElement('img');
          fill.src = GUI_BASE + 'exp/exp' + i + '.png';
          fill.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;image-rendering:pixelated;object-fit:contain;';
          slot.appendChild(fill);
        }

        container.appendChild(slot);
      }

      const midImg = document.createElement('img');
      midImg.src = GUI_BASE + 'exp/middle.png';
      midImg.style.cssText = [
        'position:absolute', 'left:50%', 'top:50%',
        'transform:translate(-50%,-50%)',
        'height:' + (iconSize + 4) + 'px', 'width:' + (iconSize + 4) + 'px',
        'image-rendering:pixelated', 'object-fit:contain',
        'pointer-events:none'
      ].join(';');
      container.appendChild(midImg);

      const levelText = document.createElement('span');
      levelText.textContent = level;
      levelText.style.cssText = [
        'position:absolute', 'left:50%', 'top:50%',
        'transform:translate(-50%,-50%)',
        'color:#8DFC0F', 'font-weight:bold',
        'font-size:' + (isMobile ? '11px' : '13px'),
        'text-shadow:1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000',
        'pointer-events:none', 'z-index:2'
      ].join(';');
      container.appendChild(levelText);
    }, 100);

    state.observers.push({
      disconnect: () => {
        clearInterval(interval);
        state.xpBarRef = null;
        document.querySelectorAll('[data-mf-xp-replaced]').forEach(el => {
          delete el.dataset.mfXpReplaced;
        });
        document.querySelectorAll('.mf-xp-icons').forEach(el => el.remove());
      }
    });
  }

  function patchDebugStats() {
    const observer = new MutationObserver(() => {
      if (!canPatch()) return;
      if (!isGameReady(getGame())) return;
      schedulePatch(() => {
        const pingElements = document.querySelectorAll('[class*="debug"], [class*="stat"]');
        pingElements.forEach(el => {
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

  function createHealthFoodOverlay() {
    if (state.overlay) return;
    state.overlay = true;

    state.overlayInterval = setInterval(() => {
      if (!canPatch()) return;

      const game = getGame();
      if (!game || !game.info) return;
      
      if (!isGameReady(game)) return;

      const health = game.info.health ?? 20;
      const food = game.info.food ?? 20;
      const absorption = game.info.absorption ?? 0;
      const iconSize = 22;
      
      const hardcore = game.serverInfo?.hardcore === true ||
                       game.serverInfo?.metadata?.hardcore === true;
      
      const ghost = isGhostMode(game);
      const guiOpacity = ghost ? 0.35 : 1;

      const bars = (state.healthBarRef?.isConnected && state.foodBarRef?.isConnected)
        ? { healthBar: state.healthBarRef, foodBar: state.foodBarRef }
        : (ghost ? { healthBar: null, foodBar: null } : findOriginalBars());

      const nuke = (el) => {
        if (!el) return;
        el.style.background = 'transparent';
        el.style.backgroundColor = 'transparent';
        el.style.backgroundImage = 'none';
        el.style.border = 'none';
        el.style.boxShadow = 'none';
        el.style.outline = 'none';
        el.dataset.mfReplaced = '1';
      };

      if (bars.healthBar) {
        const bar = bars.healthBar;
        nuke(bar);
        nuke(bar.parentElement);
        nuke(bar.parentElement?.parentElement);

        bar.querySelectorAll('*').forEach(child => {
          if (child.classList.contains('mf-hearts') || child.closest('.mf-hearts')) return;
          child.style.background = 'transparent';
          child.style.backgroundColor = 'transparent';
          child.style.backgroundImage = 'none';
          child.style.border = 'none';
          child.style.boxShadow = 'none';
        });

        let hearts = bar.querySelector('.mf-hearts');
        if (!hearts) {
          bar.innerHTML = '';
          hearts = document.createElement('div');
          hearts.className = 'mf-hearts';
          bar.appendChild(hearts);
        } else {
          Array.from(bar.children).forEach(child => {
            if (child !== hearts) child.remove();
          });
        }

        hearts.innerHTML = '';
        hearts.style.cssText = 'position:relative;display:flex;gap:2px;align-items:center;opacity:' + guiOpacity + ';transition:opacity 0.3s;';

        const redRow = document.createElement('div');
        redRow.style.cssText = 'display:flex;gap:2px;align-items:center;';
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
            'image-rendering:pixelated', 'object-fit:contain'
          ].join(';');
          redRow.appendChild(img);
        }
        hearts.appendChild(redRow);

        const absorptionHearts = Math.ceil(absorption / 2);
        if (absorptionHearts > 0) {
          const goldRow = document.createElement('div');
          goldRow.style.cssText = 'position:absolute;top:0;left:0;display:flex;gap:2px;align-items:center;pointer-events:none;';
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
              'image-rendering:pixelated', 'object-fit:contain'
            ].join(';');
            goldRow.appendChild(img);
          }
          hearts.appendChild(goldRow);
        }
      }

      if (bars.foodBar) {
        const bar = bars.foodBar;
        nuke(bar);
        nuke(bar.parentElement);
        nuke(bar.parentElement?.parentElement);

        bar.querySelectorAll('*').forEach(child => {
          if (child.classList.contains('mf-food') || child.closest('.mf-food')) return;
          child.style.background = 'transparent';
          child.style.backgroundColor = 'transparent';
          child.style.backgroundImage = 'none';
          child.style.border = 'none';
          child.style.boxShadow = 'none';
        });

        let foodIcons = bar.querySelector('.mf-food');
        if (!foodIcons) {
          bar.innerHTML = '';
          foodIcons = document.createElement('div');
          foodIcons.className = 'mf-food';
          foodIcons.style.cssText = 'display:flex;gap:2px;align-items:center;flex-direction:row-reverse;';
          bar.appendChild(foodIcons);
        } else {
          Array.from(bar.children).forEach(child => {
            if (child !== foodIcons) child.remove();
          });
        }

        foodIcons.style.opacity = guiOpacity;
        foodIcons.style.transition = 'opacity 0.3s';

        foodIcons.innerHTML = '';
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
            'image-rendering:pixelated', 'object-fit:contain'
          ].join(';');
          foodIcons.appendChild(img);
        }
      }
    }, 200);
  }

  function removeHealthFoodOverlay() {
    if (state.overlayInterval) {
      clearInterval(state.overlayInterval);
      state.overlayInterval = null;
    }
    state.overlay = null;
    state.healthBarRef = null;
    state.foodBarRef = null;
    document.querySelectorAll('[data-mf-replaced]').forEach(el => {
      el.style.cssText = '';
      delete el.dataset.mfReplaced;
    });
  }

  function initPatches() {
    patchPlayerList();
    patchDebugStats();
    createHealthFoodOverlay();
  }

  function enable() {
    if (state.enabled) return;
    state.enabled = true;
    console.log('[GUIPatch] Enabling...');
    initPatches();
  }

  function disable() {
    state.enabled = false;
    state.observers.forEach(o => o.disconnect());
    state.observers = [];
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    removeHealthFoodOverlay();
    state.xpBarRef = null;
    document.querySelectorAll('.wifi-icon-patch, .wifi-debug-icon, .mf-xp-icons, .mf-xp-level').forEach(el => el.remove());
    document.querySelectorAll('[data-mf-xp-replaced]').forEach(el => {
      el.style.cssText = '';
      delete el.dataset.mfXpReplaced;
    });
  }

  document.addEventListener('minifeather:guipatch-config', (e) => {
    try {
      const cfg = JSON.parse(e.detail);
      if (cfg.guiBase) GUI_BASE = cfg.guiBase;
      if (cfg.enabled) enable();
      else disable();
    } catch (err) { console.error('[GUIPatch] Error:', err); }
  });

  console.log('[GUIPatch] Script loaded');
  globalThis.GUIPatch = {
    enable, disable, state,
    get enabled() { return state.enabled; },
    setGuiBase(url) { GUI_BASE = url; }
  };
})();
