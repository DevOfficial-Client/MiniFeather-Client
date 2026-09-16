(function () {
  'use strict';

  // Bridge MAIN-world: agrega un tab "MiniFeather" al modal de Ajustes nativo de miniblox.io
  // y replica los toggles del panel de MiniFeather usando el markup nativo de Chakra UI.
  // Comunicación con ClientPanel.js (mundo ISOLATED) via CustomEvents:
  //   minifeather:nsb-state       (MAIN -> ISOLATED, pide el estado)
  //   minifeather:nsb-state-data  (ISOLATED -> MAIN, responde con el estado)
  //   minifeather:nsb-toggle      (MAIN -> ISOLATED, cambia un toggle)

  const GLOBAL_KEY = '__MINIFEATHER_NATIVE_SETTINGS_BRIDGE__';
  const TAG = '[MiniFeather NSB]';

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  function log(...args) { try { console.log(TAG, ...args); } catch (_) {} }
  function warn(...args) { try { console.warn(TAG, ...args); } catch (_) {} }

  // --- Markup nativo (clases de Chakra extraídas del modal real de miniblox.io) ---
  const NATIVE = {
    tabButton: 'chakra-stack css-1makr62',
    tabIconBox: 'css-1bvqfnx',
    tabLabel: 'css-13cmais',
    contentStack: 'chakra-stack css-7dwm6c',
    sectionCard: 'css-25biox',
    sectionHeading: 'chakra-heading css-1tegss5',
    sectionDesc: 'css-m8nn5d',
    rowStack: 'chakra-stack css-o876kb',
    row: 'css-1vbtsyd',
    rowLabelBox: 'css-1ilknfu',
    rowLabel: 'css-1lbb0oi',
    rowHint: 'css-1lbb0oi',
    switchWrap: 'css-1x7s3ct',
    switchOn: 'css-1tkvv7',
    switchOff: 'css-xn09gj',
    switchLabel: 'css-2u65zn',
    switchKnob: 'css-t21ovp',
    switchKnobOff: 'css-1q09e8j',
    headerBox: 'css-1duvh47',
    headerStack: 'chakra-stack css-1fv4u62',
    headerTitleBox: 'chakra-stack css-k5u9cx',
    headerTitle: 'css-i381on',
    actionButton: 'chakra-button css-zab4iv'
  };

  // Icono pixel-art de la pluma (mismo del botón del sidebar MF)
  const FEATHER_ICON = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" style="color:#a78bfa;font-size:20px;">
<rect x="9" y="2" width="6" height="1"></rect><rect x="8" y="3" width="8" height="1"></rect><rect x="7" y="4" width="10" height="1"></rect><rect x="6" y="5" width="12" height="1"></rect><rect x="5" y="6" width="14" height="1"></rect><rect x="4" y="7" width="16" height="1"></rect><rect x="3" y="8" width="18" height="1"></rect><rect x="3" y="9" width="6" height="1"></rect><rect x="2" y="10" width="4" height="1"></rect><rect x="2" y="11" width="3" height="1"></rect><rect x="1" y="12" width="3" height="1"></rect><rect x="1" y="13" width="2" height="1"></rect><rect x="0" y="14" width="2" height="1"></rect><rect x="0" y="15" width="2" height="1"></rect><rect x="1" y="16" width="2" height="1"></rect><rect x="2" y="17" width="3" height="1"></rect><rect x="3" y="18" width="4" height="1"></rect><rect x="4" y="19" width="6" height="1"></rect><rect x="6" y="20" width="8" height="1"></rect>
</svg>`;

  // Catálogo de módulos con toggle. key = settings key de ClientPanel.
  // Las categorías imitan las páginas del panel MF: HUD, Render, Movimiento, Mundo, Chat.
  const CATEGORIES = [
    {
      id: 'hud',
      title: 'HUD',
      description: 'Overlays e información en pantalla.',
      modules: [
        { key: 'keystrokes', label: 'Keystrokes' },
        { key: 'fpsCounter', label: 'FPS Counter' },
        { key: 'cpsCounter', label: 'CPS Counter' },
        { key: 'pingCounter', label: 'Ping Counter' },
        { key: 'armorHud', label: 'Armor HUD' },
        { key: 'coordinates', label: 'Coordinates' },
        { key: 'dynamicCrosshair', label: 'Dynamic Crosshair' },
        { dialog: true, label: 'Waypoints', page: 'waypoints' },
        { dialog: true, label: 'Full panel', page: 'dashboard', openPanel: true }
      ]
    },
    {
      id: 'render',
      title: 'Render',
      description: 'Cámara, animaciones y visuales del mundo.',
      modules: [
        { key: 'zoom', label: 'Zoom' },
        { key: 'freecam', label: 'Freecam' },
        { key: 'cameraOverhaul', label: 'Camera Overhaul' },
        { key: 'elytraFlight', label: 'Elytra Flight' },
        { key: 'titanTiny', label: 'Titan/Tiny' },
        { key: 'healthNameTags', label: 'Health NameTags' },
        { key: 'distanceNameTags', label: 'Distance NameTags' },
        { dialog: true, label: 'Freelook settings', page: 'render', openPanel: true },
        { key: 'damageParticles', label: 'Damage Particles' },
        { dialog: true, label: 'Water Splash settings', page: 'render', openPanel: true },
        { key: 'patPat', label: 'PatPat' },
        { key: 'itemPhysics', label: 'Item Physics' },
        { dialog: true, label: 'No Weather settings', page: 'render', openPanel: true },
        { key: 'vanillaAnimations', label: 'Vanilla Animations' },
        { key: 'leafWind', label: 'Leaf Wind' },
        { key: 'handSway', label: 'Hand Sway' },
        { key: 'betterPlayerLayers', label: 'Better Player Layers' },
        { dialog: true, label: 'Shaders', page: 'shaders', openPanel: true },
        { dialog: true, label: 'Experimental', page: 'experimental', openPanel: true }
      ]
    },
    {
      id: 'movement',
      title: 'Movimiento',
      description: 'Automatizaciones de movimiento.',
      modules: [
        { key: 'autoSprint', label: 'Auto Sprint' },
        { key: 'safeSneak', label: 'Safe Sneak' },
        { key: 'antiAfk', label: 'Anti-AFK' }
      ]
    },
    {
      id: 'world',
      title: 'Mundo',
      description: 'Automatizaciones dentro del mundo.',
      modules: [
        { key: 'autoRespawn', label: 'Auto Respawn' },
        { key: 'rhythmParkour', label: 'Rhythm Parkour' },
        { dialog: true, label: 'Local Worlds', page: 'world', openPanel: true },
        { dialog: true, label: 'Global World', page: 'world', openPanel: true }
      ]
    },
    {
      id: 'chat',
      title: 'Chat',
      description: 'Mejoras del chat.',
      modules: [
        { key: 'chatVideos', label: 'Chat Videos' },
        { key: 'chatLinks', label: 'Chat Links' },
        { key: 'chatMemes', label: 'Chat Memes' },
        { onCommand: 'clientChat', label: 'Client Chat' }
      ]
    }
  ];

  const state = {
    settings: {},
    ready: false,
    pendingToggles: 0,
    tabInjectedIn: null,
    bodyObserver: null,
    modalObserver: null,
    requestTimer: 0,
    destroyed: false
  };

  // --- Comunicación con ClientPanel (ISOLATED) ---
  function requestState() {
    document.dispatchEvent(new CustomEvent('minifeather:nsb-state', { detail: '{}' }));
  }

  function sendToggle(key, enabled) {
    state.pendingToggles++;
    document.dispatchEvent(new CustomEvent('minifeather:nsb-toggle', {
      detail: JSON.stringify({ key, enabled })
    }));
    // Respaldo: aplicar localmente ya que el eco de estado puede tardar
    state.settings[key] = enabled;
  }

  function onStateData(event) {
    let payload = null;
    try {
      payload = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch (_) {
      return;
    }
    if (!payload || typeof payload !== 'object') return;
    state.settings = { ...state.settings, ...(payload.settings || {}) };
    state.ready = true;
    state.pendingToggles = 0;
    renderNativePanel();
  }

  function isModuleEnabled(key) {
    return state.settings[key] === true;
  }

  // --- Construcción de nodos con clases nativas ---
  function makeSwitchRow(entry) {
    const row = document.createElement('div');
    row.className = NATIVE.row;

    const labelBox = document.createElement('div');
    labelBox.className = NATIVE.rowLabelBox;
    const label = document.createElement('p');
    label.className = NATIVE.rowLabel;
    label.textContent = entry.label;
    labelBox.appendChild(label);
    row.appendChild(labelBox);

    const wrap = document.createElement('div');
    wrap.className = NATIVE.switchWrap;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'switch');
    btn.dataset.mfKey = entry.key;
    wrap.appendChild(btn);
    row.appendChild(wrap);

    function paint() {
      const on = isModuleEnabled(entry.key);
      btn.className = on ? NATIVE.switchOn : NATIVE.switchOff;
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      const txt = document.createElement('p');
      txt.className = NATIVE.switchLabel;
      txt.textContent = on ? 'Activado' : 'Desactivado';
      const knob = document.createElement('div');
      knob.className = on ? NATIVE.switchKnob : NATIVE.switchKnobOff;
      btn.textContent = '';
      btn.appendChild(txt);
      btn.appendChild(knob);
    }

    paint();

    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const next = !isModuleEnabled(entry.key);
      sendToggle(entry.key, next);
      paint();
    });

    row.dataset.mfKey = entry.key;
    row.__mfPaint = paint;
    return row;
  }

  function makeDialogRow(entry) {
    const row = document.createElement('div');
    row.className = NATIVE.row;

    const labelBox = document.createElement('div');
    labelBox.className = NATIVE.rowLabelBox;
    const label = document.createElement('p');
    label.className = NATIVE.rowLabel;
    label.textContent = entry.label;
    labelBox.appendChild(label);
    row.appendChild(labelBox);

    const wrap = document.createElement('div');
    wrap.className = NATIVE.switchWrap;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = NATIVE.actionButton;
    btn.textContent = 'Abrir';
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      document.dispatchEvent(new CustomEvent('minifeather:nsb-open-panel', {
        detail: JSON.stringify({ page: entry.page || 'dashboard' })
      }));
    });
    wrap.appendChild(btn);
    row.appendChild(wrap);
    return row;
  }

  function makeSection(category) {
    const card = document.createElement('div');
    card.className = NATIVE.sectionCard;

    const heading = document.createElement('h2');
    heading.className = NATIVE.sectionHeading;
    heading.textContent = category.title;
    card.appendChild(heading);

    const desc = document.createElement('p');
    desc.className = NATIVE.sectionDesc;
    desc.textContent = category.description;
    card.appendChild(desc);

    const stack = document.createElement('div');
    stack.className = NATIVE.rowStack;
    for (const entry of category.modules) {
      if (entry.dialog || entry.openPanel) stack.appendChild(makeDialogRow(entry));
      else if (entry.onCommand) stack.appendChild(makeSwitchRow({ ...entry, key: entry.onCommand }));
      else stack.appendChild(makeSwitchRow(entry));
    }
    card.appendChild(stack);
    return card;
  }

  function renderNativePanel() {
    const container = document.getElementById('mf-native-settings-panel');
    if (!container) return;

    container.textContent = '';

    const header = document.createElement('div');
    header.className = NATIVE.headerBox;
    const headerStack = document.createElement('div');
    headerStack.className = NATIVE.headerStack;
    const titleBox = document.createElement('div');
    titleBox.className = NATIVE.headerTitleBox;
    const title = document.createElement('p');
    title.className = NATIVE.headerTitle;
    title.textContent = 'MiniFeather';
    titleBox.appendChild(title);
    headerStack.appendChild(titleBox);
    header.appendChild(headerStack);
    container.appendChild(header);

    for (const category of CATEGORIES) {
      container.appendChild(makeSection(category));
    }
  }

  // --- Inyección del tab en el modal nativo ---
  function findNativeTabsBar(dialog) {
    // El tablist nativo es el stack de botones-tab dentro del body del modal
    const body = dialog.querySelector('.chakra-dialog__body') || dialog;
    const candidates = [...body.querySelectorAll('button.chakra-stack')];
    return candidates.length ? candidates[0].parentElement : null;
  }

  function tabMatchesNativeTabs(bar, dialog) {
    // Verifica que sea el tablist de settings: tabs con textos conocidos (es/en)
    // o suficientes tabs + switches presentes (fallback para otros idiomas)
    const texts = [...bar.querySelectorAll('p')].map(p => (p.textContent || '').trim());
    const known = ['Gráficos', 'Sombreadores', 'Pantalla', 'Audio', 'Controles', 'Mira', 'Idioma', 'Pantalla de título', 'Paquetes de recursos',
      'Graphics', 'Shaders', 'Display', 'Audio', 'Controls', 'Crosshair', 'Language', 'Title Screen', 'Title screen', 'Resource Packs', 'Resource packs'];
    if (texts.some(t => known.includes(t))) return true;
    const tabCount = [...bar.querySelectorAll('button.chakra-stack')].length;
    const switches = dialog.querySelectorAll('[role=switch]').length;
    return tabCount >= 7 && switches >= 3;
  }

  function makeNativeTabButton() {
    const btn = document.createElement('button');
    btn.className = NATIVE.tabButton;
    btn.dataset.mfNativeTab = 'minifeather';
    btn.type = 'button';

    const iconBox = document.createElement('div');
    iconBox.className = NATIVE.tabIconBox;
    iconBox.innerHTML = FEATHER_ICON;
    btn.appendChild(iconBox);

    const label = document.createElement('p');
    label.className = NATIVE.tabLabel;
    label.textContent = 'MiniFeather';
    btn.appendChild(label);

    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const active = btn.dataset.mfActive === 'true';
      if (active) return;
      deactivateNativeTabs(btn);
      btn.dataset.mfActive = 'true';
      btn.classList.add('css-1eaek6i'); // variante activa nativa
      showMiniFeatherPanel(dialogOf(btn));
      requestState();
    });

    return btn;
  }

  function dialogOf(node) {
    return node.closest('[role=dialog]');
  }

  function nativeContentPanel(dialog) {
    // Panel de contenido nativo: el stack .css-7dwm6c que NO es el nuestro
    for (const p of dialog.querySelectorAll('.css-7dwm6c')) {
      if (p.id !== 'mf-native-settings-panel') return p;
    }
    return null;
  }

  function deactivateNativeTabs(mfTab) {
    const dialog = dialogOf(mfTab);
    if (!dialog) return;
    for (const tab of dialog.querySelectorAll('button.chakra-stack')) {
      if (tab === mfTab) continue;
      tab.classList.remove('css-1eaek6i');
    }
    const container = dialog.querySelector('#mf-native-settings-panel');
    if (container) container.style.display = 'none';
    const content = nativeContentPanel(dialog);
    if (content) content.style.display = '';
  }

  function showMiniFeatherPanel(dialog) {
    const content = nativeContentPanel(dialog);
    if (!content) return;
    let container = dialog.querySelector('#mf-native-settings-panel');

    if (!container) {
      container = document.createElement('div');
      container.id = 'mf-native-settings-panel';
      container.className = NATIVE.contentStack;
      content.parentElement.insertBefore(container, content.nextSibling);
    }

    // Ocultar SOLO el panel de contenido nativo (no el tablist, que es hermano)
    content.style.display = 'none';
    container.style.display = '';
    if (!container.childElementCount) renderNativePanel();
  }

  function injectTabIntoDialog(dialog) {
    if (!dialog || dialog.dataset.mfNsbInjected === 'true') return;
    const bar = findNativeTabsBar(dialog);
    if (!bar || !tabMatchesNativeTabs(bar, dialog)) return;

    dialog.dataset.mfNsbInjected = 'true';
    state.tabInjectedIn = dialog;
    const tab = makeNativeTabButton();
    bar.appendChild(tab);

    // Click en un tab nativo debe ocultar el panel MF y devolver el control al juego
    for (const nativeTab of [...bar.querySelectorAll('button.chakra-stack')]) {
      if (nativeTab === tab) continue;
      nativeTab.addEventListener('click', () => {
        tab.dataset.mfActive = 'false';
        tab.classList.remove('css-1eaek6i');
        const container = dialog.querySelector('#mf-native-settings-panel');
        if (container) container.style.display = 'none';
      }, true);
    }

    // Re-render cuando el juego re-crea el panel de contenido (cambio de tab nativo)
    if (state.modalObserver) state.modalObserver.disconnect();
    state.modalObserver = new MutationObserver(() => {
      const container = dialog.querySelector('#mf-native-settings-panel');
      if (!container || container.style.display === 'none') return;
      const content = nativeContentPanel(dialog);
      // Si React re-creó el contenido nativo visible mientras estamos activos, ocultarlo
      if (content && content.style.display !== 'none' && container.isConnected) {
        content.style.display = 'none';
      }
    });
    state.modalObserver.observe(dialog, { childList: true, subtree: true });
  }

  function scanForDialogs(mutations) {
    if (state.destroyed) return;
    // Ignorar mutaciones causadas por nosotros mismos (tab/panel que inyectamos)
    if (mutations && mutations.some(m =>
      (m.target.id === 'mf-native-settings-panel' || m.target.closest?.('#mf-native-settings-panel')) ||
      [...m.addedNodes, ...m.removedNodes].some(n => n.id === 'mf-native-settings-panel' || n.nodeType === 1 && n.hasAttribute?.('data-mf-native-tab'))
    )) return;
    for (const dialog of document.querySelectorAll('[role=dialog]')) {
      injectTabIntoDialog(dialog);
    }
  }

  function start() {
    state.bodyObserver = new MutationObserver(scanForDialogs);
    state.bodyObserver.observe(document.body, { childList: true, subtree: true });
    scanForDialogs();

    document.addEventListener('minifeather:nsb-state-data', onStateData);
    // Poll inicial hasta que ClientPanel responda (arranca en document_end)
    state.requestTimer = window.setInterval(() => {
      if (state.ready || state.destroyed) {
        clearInterval(state.requestTimer);
        state.requestTimer = 0;
        return;
      }
      requestState();
    }, 800);
    requestState();

    log('NativeSettingsBridge iniciado');
  }

  function destroy() {
    state.destroyed = true;
    state.bodyObserver?.disconnect();
    state.modalObserver?.disconnect();
    if (state.requestTimer) clearInterval(state.requestTimer);
    document.removeEventListener('minifeather:nsb-state-data', onStateData);
    document.querySelectorAll('#mf-native-settings-panel').forEach(el => el.remove());
    document.querySelectorAll('[data-mf-native-tab]').forEach(el => el.remove());
    for (const dialog of document.querySelectorAll('[role=dialog]')) delete dialog.dataset.mfNsbInjected;
  }

  globalThis[GLOBAL_KEY] = { destroy, requestState };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
