// GUI Patch Script - Inyecta modificaciones de GUI al bundle original de miniblox.io
(function () {
  'use strict';

  let GUI_BASE = '';
  let pendingTimer = null;
  let cachedGame = null;
  let lastGameScan = 0;

  const state = {
    enabled: false,
    observers: [],
    overlay: null,
    overlayInterval: null
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

  // Buscar las barras originales de vida/comida en el DOM
  function findOriginalBars() {
    const result = { healthBar: null, foodBar: null };
    try {
      // Si ya tenemos referencias cacheadas, usarlas
      if (state.healthBarRef && state.healthBarRef.isConnected) {
        result.healthBar = state.healthBarRef;
      }
      if (state.foodBarRef && state.foodBarRef.isConnected) {
        result.foodBar = state.foodBarRef;
      }
      if (result.healthBar && result.foodBar) return result;

      // Buscar elementos con texto "X / 20" (formato de vida/comida)
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      const bars = [];
      while (walker.nextNode()) {
        if (walker.currentNode.textContent.match(/^\d+\.?\d*\s*\/\s*20$/)) {
          // Subir hasta el contenedor con borde (3 niveles arriba del texto)
          let el = walker.currentNode.parentElement;
          for (let i = 0; i < 4 && el; i++) el = el.parentElement;
          if (el) bars.push(el);
        }
      }
      if (bars.length >= 2 && !result.healthBar) {
        result.healthBar = bars[0];
        state.healthBarRef = bars[0];
      }
      if (bars.length >= 2 && !result.foodBar) {
        result.foodBar = bars[1];
        state.foodBarRef = bars[1];
      }
    } catch (_) {}
    return result;
  }

  // Parchear lista de jugadores con iconos de wifi
  function patchPlayerList() {
    const observer = new MutationObserver(() => {
      if (!state.enabled || !GUI_BASE) return;
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

  // Parchear barra de experiencia con iconos personalizados
  function patchXPBar() {
    const observer = new MutationObserver(() => {
      if (!state.enabled || !GUI_BASE) return;
      schedulePatch(() => {
        const game = getGame();
        if (!game) return;
        const allElements = document.querySelectorAll('[class*="css-"]');
        allElements.forEach(el => {
          if (el.classList.contains('xp-bar-patched')) return;
          const bg = el.style.background || '';
          const isGreenBar = bg.includes('green') || bg.includes('#6fbe63') ||
            bg.includes('rgb(111') || bg.includes('rgb(76,175,80)') || bg.includes('#4caf50');
          if (!isGreenBar) return;
          if (el.offsetHeight < 10 || el.offsetWidth < 80) return;
          el.classList.add('xp-bar-patched');

          const experience = (game?.info?.xp?.experience || 0);
          const level = (game?.info?.xp?.experienceLevel || 0);
          const isMobile = (game?.isMobile || false);
          const iconSize = isMobile ? 12 : 16;
          const totalIcons = 18;
          const filledIcons = Math.ceil(experience * totalIcons);

          const container = document.createElement('div');
          container.className = 'mf-xp-icons';
          container.style.cssText = [
            'display:flex', 'align-items:center', 'justify-content:center',
            'gap:2px', 'position:absolute', 'top:0', 'left:0',
            'width:100%', 'height:100%', 'pointer-events:none'
          ].join(';');
          for (let i = 1; i <= totalIcons; i++) {
            const img = document.createElement('img');
            img.src = i <= filledIcons
              ? GUI_BASE + 'exp/exp' + i + '.png'
              : GUI_BASE + 'exp/EXPVASSEL.png';
            img.alt = 'exp-' + i;
            img.style.cssText = [
              'height:' + iconSize + 'px', 'width:' + iconSize + 'px',
              'image-rendering:pixelated', 'object-fit:contain', 'opacity:0.8'
            ].join(';');
            container.appendChild(img);
          }
          const levelText = document.createElement('span');
          levelText.className = 'mf-xp-level';
          levelText.textContent = level;
          levelText.style.cssText = [
            'position:absolute', 'right:10px', 'top:50%',
            'transform:translateY(-50%)', 'color:white', 'font-weight:bold',
            'font-size:' + (isMobile ? '12px' : '14px'),
            'text-shadow:1px 1px 2px black', 'pointer-events:none'
          ].join(';');
          el.style.position = 'relative';
          el.appendChild(container);
          el.appendChild(levelText);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    state.observers.push(observer);
  }

  // Parchear estadisticas de debug (F3) con iconos de wifi
  function patchDebugStats() {
    const observer = new MutationObserver(() => {
      if (!state.enabled || !GUI_BASE) return;
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

  // Reemplaza el contenido de las barras originales con sprites de corazones/comida
  function createHealthFoodOverlay() {
    if (state.overlay) return;
    state.overlay = true; // marca de inicializado

    state.overlayInterval = setInterval(() => {
      if (!state.enabled || !GUI_BASE) return;

      const game = getGame();
      if (!game || !game.info) return;

      const health = game.info.health ?? 20;
      const food = game.info.food ?? 20;
      const absorption = game.info.absorption ?? 0;
      const iconSize = 22;

      const bars = findOriginalBars();

      // Reemplazar barra de vida con corazones
      if (bars.healthBar) {
        const bar = bars.healthBar;
        // Limpiar estilos del contenedor y sus padres
        [bar, bar.parentElement, bar.parentElement?.parentElement].forEach(el => {
          if (!el) return;
          el.style.background = 'transparent';
          el.style.backgroundColor = 'transparent';
          el.style.border = 'none';
          el.style.boxShadow = 'none';
          el.style.outline = 'none';
          el.dataset.mfReplaced = '1';
        });

        // Limpiar todos los hijos oscuros cada frame
        let hearts = bar.querySelector('.mf-hearts');
        if (!hearts) {
          bar.innerHTML = '';
          hearts = document.createElement('div');
          hearts.className = 'mf-hearts';
          hearts.style.cssText = 'display:flex;gap:2px;align-items:center;';
          bar.appendChild(hearts);
        } else {
          // Remover cualquier hijo que no sea .mf-hearts (React los re-inserta)
          Array.from(bar.children).forEach(child => {
            if (child !== hearts) child.remove();
          });
        }
        if (hearts) {
          const totalHearts = 10 + Math.ceil(absorption / 2);
          hearts.innerHTML = '';
          for (let i = 0; i < totalHearts; i++) {
            const heartValue = health + absorption - i * 2;
            let iconFile;
            if (i >= 10) {
              if (heartValue >= 1.5) iconFile = 'hardcore_full.png';
              else if (heartValue >= 0.5) iconFile = 'hardcore_half.png';
              else iconFile = 'heart_empty.png';
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
            hearts.appendChild(img);
          }
        }
      }

      // Reemplazar barra de comida con sprites
      if (bars.foodBar) {
        const bar = bars.foodBar;
        [bar, bar.parentElement, bar.parentElement?.parentElement].forEach(el => {
          if (!el) return;
          el.style.background = 'transparent';
          el.style.backgroundColor = 'transparent';
          el.style.border = 'none';
          el.style.boxShadow = 'none';
          el.style.outline = 'none';
          el.dataset.mfReplaced = '1';
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
        if (foodIcons) {
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
    patchXPBar();
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
    document.querySelectorAll('.wifi-icon-patch, .wifi-debug-icon, .mf-xp-icons, .mf-xp-level').forEach(el => el.remove());
    document.querySelectorAll('.xp-bar-patched').forEach(el => {
      el.classList.remove('xp-bar-patched');
      el.style.position = '';
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
