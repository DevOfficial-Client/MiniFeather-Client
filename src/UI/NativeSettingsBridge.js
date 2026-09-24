(function () {
  'use strict';

  // Bridge MAIN-world: replica cada página del panel de MiniFeather como un tab nativo
  // dentro del modal de Ajustes de miniblox.io (markup nativo de Chakra UI).
  // Comunicación con ClientPanel.js (mundo ISOLATED) via CustomEvents:
  //   minifeather:nsb-state       (MAIN -> ISOLATED, pide el estado)
  //   minifeather:nsb-state-data  (ISOLATED -> MAIN, responde con el estado)
  //   minifeather:nsb-toggle      (MAIN -> ISOLATED, cambia un toggle)
  //   minifeather:nsb-open-panel  (MAIN -> ISOLATED, abre el panel completo MF en una página)

  const GLOBAL_KEY = '__MINIFEATHER_NATIVE_SETTINGS_BRIDGE__';
  const TAG = '[MiniFeather NSB]';

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  function log(...args) { try { void 0; } catch (_) {} }
  function warn(...args) { try { console.warn(TAG, ...args); } catch (_) {} }

  // --- Markup nativo (clases de Chakra extraídas del modal real de miniblox.io) ---
  const NATIVE = {
    tabButton: 'chakra-stack css-1makr62',
    tabButtonActive: 'css-1eaek6i',
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

  // --- Iconos pixel-art (viewBox 24x24, mismos rects del juego) ---
  const ICONS = {
    feather: `<rect x="9" y="2" width="6" height="1"></rect><rect x="8" y="3" width="8" height="1"></rect><rect x="7" y="4" width="10" height="1"></rect><rect x="6" y="5" width="12" height="1"></rect><rect x="5" y="6" width="14" height="1"></rect><rect x="4" y="7" width="16" height="1"></rect><rect x="3" y="8" width="18" height="1"></rect><rect x="3" y="9" width="6" height="1"></rect><rect x="2" y="10" width="4" height="1"></rect><rect x="2" y="11" width="3" height="1"></rect><rect x="1" y="12" width="3" height="1"></rect><rect x="1" y="13" width="2" height="1"></rect><rect x="0" y="14" width="2" height="1"></rect><rect x="0" y="15" width="2" height="1"></rect><rect x="1" y="16" width="2" height="1"></rect><rect x="2" y="17" width="3" height="1"></rect><rect x="3" y="18" width="4" height="1"></rect><rect x="4" y="19" width="6" height="1"></rect><rect x="6" y="20" width="8" height="1"></rect>`,
    home: `<rect x="4" y="10" width="16" height="1"></rect><rect x="5" y="9" width="14" height="1"></rect><rect x="6" y="8" width="12" height="1"></rect><rect x="7" y="7" width="10" height="1"></rect><rect x="8" y="6" width="8" height="1"></rect><rect x="9" y="5" width="6" height="1"></rect><rect x="10" y="4" width="4" height="1"></rect><rect x="4" y="11" width="16" height="1"></rect><rect x="5" y="12" width="14" height="8"></rect><rect x="7" y="14" width="4" height="6"></rect><rect x="13" y="14" width="4" height="4"></rect>`,
    hud: `<rect x="3" y="4" width="18" height="14"></rect><rect x="3" y="20" width="18" height="1"></rect><rect x="6" y="7" width="12" height="1"></rect><rect x="6" y="10" width="12" height="1"></rect><rect x="6" y="13" width="8" height="1"></rect>`,
    render: `<rect x="12" y="2" width="1" height="4"></rect><rect x="6" y="6" width="12" height="1"></rect><rect x="4" y="7" width="16" height="1"></rect><rect x="3" y="8" width="18" height="1"></rect><rect x="5" y="9" width="14" height="1"></rect><rect x="7" y="10" width="10" height="1"></rect><rect x="9" y="11" width="6" height="1"></rect><rect x="11" y="12" width="2" height="1"></rect>`,
    music: `<rect x="6" y="18" width="3" height="3"></rect><rect x="15" y="17" width="3" height="4"></rect><rect x="9" y="18" width="6" height="1"></rect><rect x="18" y="4" width="2" height="13"></rect><rect x="9" y="4" width="9" height="2"></rect>`,
    shaders: `<rect x="3" y="6" width="18" height="1"></rect><rect x="5" y="5" width="14" height="1"></rect><rect x="7" y="4" width="10" height="1"></rect><rect x="9" y="3" width="6" height="1"></rect><rect x="3" y="8" width="18" height="1"></rect><rect x="4" y="9" width="16" height="1"></rect><rect x="5" y="10" width="14" height="1"></rect><rect x="6" y="11" width="12" height="1"></rect><rect x="7" y="12" width="10" height="1"></rect><rect x="8" y="13" width="8" height="1"></rect><rect x="9" y="14" width="6" height="1"></rect><rect x="10" y="15" width="4" height="1"></rect><rect x="11" y="16" width="2" height="1"></rect>`,
    flask: `<rect x="10" y="2" width="4" height="1"></rect><rect x="9" y="3" width="1" height="4"></rect><rect x="14" y="3" width="1" height="4"></rect><rect x="8" y="7" width="8" height="1"></rect><rect x="6" y="8" width="3" height="1"></rect><rect x="15" y="8" width="3" height="1"></rect><rect x="4" y="9" width="3" height="1"></rect><rect x="17" y="9" width="3" height="1"></rect><rect x="3" y="10" width="3" height="1"></rect><rect x="18" y="10" width="3" height="1"></rect><rect x="3" y="11" width="2" height="6"></rect><rect x="19" y="11" width="2" height="6"></rect><rect x="5" y="17" width="3" height="1"></rect><rect x="16" y="17" width="3" height="1"></rect><rect x="7" y="18" width="10" height="1"></rect><rect x="8" y="19" width="8" height="1"></rect><rect x="8" y="11" width="8" height="4"></rect>`,
    shirt: `<rect x="9" y="3" width="6" height="1"></rect><rect x="7" y="4" width="3" height="2"></rect><rect x="14" y="4" width="3" height="2"></rect><rect x="5" y="5" width="2" height="2"></rect><rect x="17" y="5" width="2" height="2"></rect><rect x="4" y="7" width="16" height="12"></rect><rect x="4" y="19" width="16" height="1"></rect>`,
    chat: `<rect x="2" y="4" width="20" height="12"></rect><rect x="5" y="16" width="3" height="3"></rect><rect x="8" y="19" width="3" height="1"></rect><rect x="5" y="7" width="14" height="1"></rect><rect x="5" y="10" width="14" height="1"></rect><rect x="5" y="13" width="8" height="1"></rect>`,
    pin: `<rect x="11" y="2" width="2" height="1"></rect><rect x="10" y="3" width="4" height="1"></rect><rect x="9" y="4" width="6" height="1"></rect><rect x="8" y="5" width="8" height="1"></rect><rect x="7" y="6" width="10" height="1"></rect><rect x="6" y="7" width="12" height="1"></rect><rect x="7" y="8" width="10" height="1"></rect><rect x="8" y="9" width="8" height="1"></rect><rect x="9" y="10" width="6" height="1"></rect><rect x="10" y="11" width="4" height="1"></rect><rect x="11" y="12" width="2" height="1"></rect><rect x="11" y="13" width="2" height="6"></rect><rect x="10" y="19" width="4" height="1"></rect>`,
    shoe: `<rect x="3" y="12" width="8" height="1"></rect><rect x="3" y="13" width="18" height="3"></rect><rect x="3" y="16" width="18" height="2"></rect><rect x="5" y="18" width="14" height="1"></rect>`,
    world: `<rect x="4" y="3" width="16" height="18"></rect><rect x="7" y="5" width="5" height="2"></rect><rect x="14" y="5" width="3" height="2"></rect><rect x="6" y="9" width="4" height="2"></rect><rect x="12" y="9" width="5" height="2"></rect><rect x="8" y="13" width="5" height="2"></rect><rect x="15" y="13" width="3" height="2"></rect><rect x="6" y="17" width="6" height="2"></rect><rect x="14" y="17" width="4" height="2"></rect>`,
    gear: `<rect x="10" y="2" width="4" height="2"></rect><rect x="2" y="10" width="2" height="4"></rect><rect x="20" y="10" width="2" height="4"></rect><rect x="5" y="4" width="3" height="3"></rect><rect x="16" y="4" width="3" height="3"></rect><rect x="5" y="17" width="3" height="3"></rect><rect x="16" y="17" width="3" height="3"></rect><rect x="6" y="6" width="12" height="12"></rect><rect x="10" y="10" width="4" height="4"></rect>`
  };

  const ICON_COLORS = {
    feather: '#a78bfa', home: '#7fb6ff', hud: '#7fe0a0', render: '#ffd27f',
    music: '#ff9fc7', shaders: '#c29aff', flask: '#8be9fd', shirt: '#ffb86c',
    chat: '#7fd1ff', pin: '#ff8f8f', shoe: '#a3f7bf', world: '#8affc1',
    gear: '#c9c9d4'
  };

  function svgIcon(name, color) {
    const body = ICONS[name] || ICONS.feather;
    const style = color || ICON_COLORS[name] || '#a78bfa';
    return `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" style="color:${style};font-size:20px;">${body}</svg>`;
  }

  // --- Definición de tabs: cada página del panel MF = un tab nativo ---
  // Cada entry de modules: { key } toggle | { link } abre panel MF | { custom } función
  const TABS = [
    {
      id: 'mf-dashboard', icon: 'home', label: 'MF Home',
      header: 'MiniFeather',
      sections: [
        {
          title: 'Quick access',
          description: 'Opens the full MiniFeather panel on each section.',
          modules: [
            { link: 'dashboard', linkLabel: 'Open' },
            { link: 'settings', linkLabel: 'Open' },
            { link: 'about', linkLabel: 'Open' }
          ]
        },
        {
          title: 'General',
          description: 'Global client options.',
          modules: [
            { key: 'rebrand', label: 'Rebrand (MF logo)' },
            { key: 'discord', label: 'Discord redirect' },
            { key: 'supportAds', label: 'Support ads' }
          ]
        }
      ]
    },
    {
      id: 'mf-hud', icon: 'hud', label: 'MF HUD',
      header: 'MiniFeather HUD',
      sections: [
        {
          title: 'Overlays',
          description: 'On-screen information.',
          modules: [
            { key: 'keystrokes', label: 'Keystrokes' },
            { key: 'fpsCounter', label: 'FPS counter' },
            { key: 'cpsCounter', label: 'CPS counter' },
            { key: 'pingCounter', label: 'Ping counter' },
            { key: 'armorHud', label: 'Armor HUD' },
            { key: 'coordinates', label: 'Coordinates' },
            { key: 'guiPatch', label: 'GUI Patch' },
            { key: 'dynamicCrosshair', label: 'Dynamic crosshair' }
          ]
        },
        {
          title: 'Waypoints',
          description: 'Markers in the world.',
          modules: [
            { link: 'waypoints', linkLabel: 'Configure' }
          ]
        }
      ]
    },
    {
      id: 'mf-render', icon: 'render', label: 'MF Render',
      header: 'MiniFeather Render',
      sections: [
        {
          title: 'Camera',
          description: 'Zoom, free camera and overhaul.',
          modules: [
            { key: 'zoom', label: 'Zoom' },
            { key: 'freecam', label: 'Freecam' },
            { key: 'cameraOverhaul', label: 'Camera Overhaul' },
            { key: 'elytraFlight', label: 'Elytra Flight' },
            { key: 'freelook', label: 'Freelook' }
          ]
        },
        {
          title: 'Players and mobs',
          description: 'Tags, layers and animations.',
          modules: [
            { key: 'titanTiny', label: 'Titan/Tiny' },
            { key: 'betterPlayerLayers', label: 'Better Player Layers' },
            { key: 'healthNameTags', label: 'Health NameTags' },
            { key: 'distanceNameTags', label: 'Distance NameTags' },
            { key: 'vanillaAnimations', label: 'Vanilla Animations' },
            { key: 'handSway', label: 'Hand Sway' }
          ]
        },
        {
          title: 'World',
          description: 'Physics and environment effects.',
          modules: [
            { key: 'damageParticles', label: 'Damage Particles' },
            { key: 'shineAmbience', label: 'Shine Ambience' },
            { key: 'waterSplash', label: 'Water Splash' },
            { key: 'patPat', label: 'PatPat' },
            { key: 'itemPhysics', label: 'Item Physics' },
            { key: 'noWeather', label: 'No Weather' },
            { key: 'fullBright', label: 'FullBright' },
            { key: 'leafWind', label: 'Leaf Wind' },
            { key: 'blockHighlight', label: 'Block Highlight' }
          ]
        }
      ]
    },
    {
      id: 'mf-music', icon: 'music', label: 'MF Music',
      header: 'MiniFeather YouTube Music',
      sections: [
        {
          title: 'YouTube Music',
          description: 'In-game music player.',
          modules: [
            { link: 'youtubeMusic', linkLabel: 'Open player' }
          ]
        }
      ]
    },
    {
      id: 'mf-shaders', icon: 'shaders', label: 'MF Shaders',
      header: 'MiniFeather Shaders',
      sections: [
        {
          title: 'Shaders',
          description: 'Custom client shaders.',
          modules: [
            { key: 'customShader', label: 'Active shader' },
            { link: 'shaders', linkLabel: 'Choose shader' }
          ]
        }
      ]
    },
    {
      id: 'mf-experimental', icon: 'flask', label: 'MF Experimental',
      header: 'MiniFeather Experimental',
      sections: [
        {
          title: 'Experiments',
          description: 'Work-in-progress features. Toggles live in the experimental registry.',
          modules: [
            { key: 'experimentalRealistic', label: 'Realistic' },
            { key: 'experimentalAurora', label: 'Aurora' },
            { key: 'experimentalGrassFlowers', label: 'Grass Flowers' },
            { key: 'experimentalInteractiveVegetation', label: 'Interactive Vegetation' },
            { key: 'experimentalFallenLeaves', label: 'Fallen Leaves' },
            { key: 'experimentalTinyTakeover', label: 'Tiny Takeover' },
            { key: 'experimentalAnimatedItems', label: 'Animated Items' },
            { key: 'experimentalBetterAnimationCape', label: 'Better Animation Cape' },
            { key: 'experimentalPbr', label: 'PBR' },
            { link: 'experimental', linkLabel: 'Levels and more' }
          ]
        }
      ]
    },
    {
      id: 'mf-cosmetics', icon: 'shirt', label: 'MF Cosmetics',
      header: 'MiniFeather Cosmetics',
      sections: [
        {
          title: 'Skins and capes',
          description: 'Manage your own skins and capes.',
          modules: [
            { link: 'cosmetics', linkLabel: 'Open' }
          ]
        }
      ]
    },
    {
      id: 'mf-chat', icon: 'chat', label: 'MF Chat',
      header: 'MiniFeather Chat',
      sections: [
        {
          title: 'Chat enhancements',
          description: 'Videos, links and memes in chat.',
          modules: [
            { key: 'chatVideos', label: 'Chat Videos' },
            { key: 'chatLinks', label: 'Chat Links' },
            { key: 'chatMemes', label: 'Chat Memes' },
            { key: 'clientChat', label: 'Client Chat' }
          ]
        }
      ]
    },
    {
      id: 'mf-waypoints', icon: 'pin', label: 'MF Waypoints',
      header: 'MiniFeather Waypoints',
      sections: [
        {
          title: 'Waypoints',
          description: 'Persistent markers in the world.',
          modules: [
            { link: 'waypoints', linkLabel: 'Manage waypoints' }
          ]
        }
      ]
    },
    {
      id: 'mf-movement', icon: 'shoe', label: 'MF Movement',
      header: 'MiniFeather Movement',
      sections: [
        {
          title: 'Automations',
          description: 'Assisted movement.',
          modules: [
            { key: 'autoSprint', label: 'Auto Sprint' },
            { key: 'safeSneak', label: 'Safe Sneak' },
            { key: 'antiAfk', label: 'Anti-AFK' }
          ]
        }
      ]
    },
    {
      id: 'mf-world', icon: 'world', label: 'MF World',
      header: 'MiniFeather World',
      sections: [
        {
          title: 'Automations',
          description: 'In-world actions.',
          modules: [
            { key: 'autoRespawn', label: 'Auto Respawn' },
            { key: 'rhythmParkour', label: 'Rhythm Parkour' }
          ]
        },
        {
          title: 'Local worlds',
          description: 'Local servers and the global world.',
          modules: [
            { link: 'world', linkLabel: 'Local worlds' },
            { custom: 'global-world', label: 'Global World' }
          ]
        }
      ]
    },
    {
      id: 'mf-settings', icon: 'gear', label: 'MF Settings',
      header: 'MiniFeather Settings',
      sections: [
        {
          title: 'General',
          description: 'Client preferences.',
          modules: [
            { key: 'rebrand', label: 'Rebrand' },
            { key: 'discord', label: 'Discord redirect' },
            { key: 'supportAds', label: 'Support ads' },
            { key: 'startupAnimation', label: 'Startup animation' },
            { link: 'settings', linkLabel: 'More settings' }
          ]
        }
      ]
    },
    {
      id: 'mf-about', icon: 'feather', label: 'MF Info',
      header: 'MiniFeather',
      sections: [
        {
          title: 'MiniFeather Client',
          description: 'Unofficial extension for Miniblox. Full panel: Right Shift.',
          modules: [
            { link: 'about', linkLabel: 'View full info' }
          ]
        }
      ]
    }
  ];

  const state = {
    settings: {},
    ready: false,
    activeTabId: null,
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
    document.dispatchEvent(new CustomEvent('minifeather:nsb-toggle', {
      detail: JSON.stringify({ key, enabled })
    }));
    state.settings[key] = enabled;
  }

  function openPanel(page) {
    document.dispatchEvent(new CustomEvent('minifeather:nsb-open-panel', {
      detail: JSON.stringify({ page: page || 'dashboard' })
    }));
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
    renderActiveTab();
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
    wrap.appendChild(btn);
    row.appendChild(wrap);

    function paint() {
      const on = isModuleEnabled(entry.key);
      btn.className = on ? NATIVE.switchOn : NATIVE.switchOff;
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      const txt = document.createElement('p');
      txt.className = NATIVE.switchLabel;
      txt.textContent = on ? 'Enabled' : 'Disabled';
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

  function makeLinkRow(entry) {
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
    btn.textContent = entry.linkLabel || 'Abrir';
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openPanel(entry.link);
    });
    wrap.appendChild(btn);
    row.appendChild(wrap);
    return row;
  }

  function makeCustomRow(entry) {
    if (entry.custom === 'global-world') {
      const row = document.createElement('div');
      row.className = NATIVE.row;
      const labelBox = document.createElement('div');
      labelBox.className = NATIVE.rowLabelBox;
      const label = document.createElement('p');
      label.className = NATIVE.rowLabel;
      label.textContent = '🌍 Global World';
      labelBox.appendChild(label);
      row.appendChild(labelBox);
      const wrap = document.createElement('div');
      wrap.className = NATIVE.switchWrap;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = NATIVE.actionButton;
      btn.textContent = 'Join';
      btn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        document.dispatchEvent(new CustomEvent('minifeather:localgames-command', {
          detail: JSON.stringify({ action: 'join-global', enabled: true })
        }));
        btn.textContent = '⏳ Joining...';
        setTimeout(() => { if (btn.isConnected) btn.textContent = 'Join'; }, 2500);
      });
      wrap.appendChild(btn);
      row.appendChild(wrap);
      return row;
    }
    return makeLinkRow(entry);
  }

  function makeSection(section) {
    const card = document.createElement('div');
    card.className = NATIVE.sectionCard;

    const heading = document.createElement('h2');
    heading.className = NATIVE.sectionHeading;
    heading.textContent = section.title;
    card.appendChild(heading);

    const desc = document.createElement('p');
    desc.className = NATIVE.sectionDesc;
    desc.textContent = section.description;
    card.appendChild(desc);

    const stack = document.createElement('div');
    stack.className = NATIVE.rowStack;
    for (const entry of section.modules) {
      if (entry.link) stack.appendChild(makeLinkRow(entry));
      else if (entry.custom) stack.appendChild(makeCustomRow(entry));
      else stack.appendChild(makeSwitchRow(entry));
    }
    card.appendChild(stack);
    return card;
  }

  function findTabById(id) {
    return TABS.find(tab => tab.id === id) || null;
  }

  function renderActiveTab() {
    const container = document.getElementById('mf-native-settings-panel');
    if (!container) return;
    const tab = state.activeTabId ? findTabById(state.activeTabId) : null;
    if (!tab) return;

    container.textContent = '';

    const header = document.createElement('div');
    header.className = NATIVE.headerBox;
    const headerStack = document.createElement('div');
    headerStack.className = NATIVE.headerStack;
    const titleBox = document.createElement('div');
    titleBox.className = NATIVE.headerTitleBox;
    const title = document.createElement('p');
    title.className = NATIVE.headerTitle;
    title.textContent = tab.header || 'MiniFeather';
    titleBox.appendChild(title);
    headerStack.appendChild(titleBox);
    header.appendChild(headerStack);
    container.appendChild(header);

    for (const section of tab.sections) {
      container.appendChild(makeSection(section));
    }
  }

  // --- Inyección de tabs en el modal nativo ---
  function dialogOf(node) {
    return node.closest('[role=dialog]');
  }

  function nativeContentPanel(dialog) {
    for (const p of dialog.querySelectorAll('.css-7dwm6c')) {
      if (p.id !== 'mf-native-settings-panel') return p;
    }
    return null;
  }

  function activateTab(tabButton) {
    const dialog = dialogOf(tabButton);
    if (!dialog) return;

    // Desmarcar todos los tabs MF y nativos
    for (const t of dialog.querySelectorAll('button.chakra-stack')) {
      t.classList.remove(NATIVE.tabButtonActive);
    }
    tabButton.classList.add(NATIVE.tabButtonActive);

    state.activeTabId = tabButton.dataset.mfTabId;

    // Panel de contenido MF
    let container = dialog.querySelector('#mf-native-settings-panel');
    const content = nativeContentPanel(dialog);
    if (!container && content) {
      container = document.createElement('div');
      container.id = 'mf-native-settings-panel';
      container.className = NATIVE.contentStack;
      content.parentElement.insertBefore(container, content.nextSibling);
    }
    if (content) content.style.display = 'none';
    if (container) {
      container.style.display = '';
      renderActiveTab();
    }
    requestState();
  }

  function makeTabButton(tab) {
    const btn = document.createElement('button');
    btn.className = NATIVE.tabButton;
    btn.dataset.mfNativeTab = 'minifeather';
    btn.dataset.mfTabId = tab.id;
    btn.type = 'button';

    const iconBox = document.createElement('div');
    iconBox.className = NATIVE.tabIconBox;
    iconBox.innerHTML = svgIcon(tab.icon, ICON_COLORS[tab.icon]);
    btn.appendChild(iconBox);

    const label = document.createElement('p');
    label.className = NATIVE.tabLabel;
    label.textContent = tab.label;
    btn.appendChild(label);

    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      activateTab(btn);
    });
    return btn;
  }

  function hideMfPanel(dialog) {
    const container = dialog.querySelector('#mf-native-settings-panel');
    if (container) container.style.display = 'none';
    for (const t of dialog.querySelectorAll('[data-mf-native-tab]')) {
      t.classList.remove(NATIVE.tabButtonActive);
    }
  }

  function injectTabsIntoDialog(dialog) {
    if (!dialog || dialog.dataset.mfNsbInjected === 'true') return;
    const body = dialog.querySelector('.chakra-dialog__body') || dialog;
    const candidates = [...body.querySelectorAll('button.chakra-stack')];
    if (!candidates.length) return;
    const bar = candidates[0].parentElement;
    const texts = [...bar.querySelectorAll('p')].map(p => (p.textContent || '').trim());
    const known = ['Gráficos', 'Sombreadores', 'Pantalla', 'Audio', 'Controles', 'Mira', 'Idioma', 'Pantalla de título', 'Paquetes de recursos',
      'Graphics', 'Shaders', 'Display', 'Audio', 'Controls', 'Crosshair', 'Language', 'Title Screen', 'Title screen', 'Resource Packs', 'Resource packs'];
    if (!texts.some(t => known.includes(t))) {
      const tabCount = [...bar.querySelectorAll('button.chakra-stack')].length;
      const switches = dialog.querySelectorAll('[role=switch]').length;
      if (!(tabCount >= 7 && switches >= 3)) return;
    }

    dialog.dataset.mfNsbInjected = 'true';
    for (const tab of TABS) {
      bar.appendChild(makeTabButton(tab));
    }

    // Click en un tab nativo oculta el panel MF y devuelve el control al juego
    for (const nativeTab of [...bar.querySelectorAll('button.chakra-stack')]) {
      if (nativeTab.dataset.mfNativeTab) continue;
      nativeTab.addEventListener('click', () => hideMfPanel(dialog), true);
    }

    // Si React re-crea el contenido nativo mientras estamos activos, ocultarlo
    if (state.modalObserver) state.modalObserver.disconnect();
    state.modalObserver = new MutationObserver(() => {
      const container = dialog.querySelector('#mf-native-settings-panel');
      if (!container || container.style.display === 'none') return;
      const content = nativeContentPanel(dialog);
      if (content && content.style.display !== 'none' && container.isConnected) {
        content.style.display = 'none';
      }
    });
    state.modalObserver.observe(dialog, { childList: true, subtree: true });
  }

  // El juego muta el body decenas de veces por segundo: en vez de un
  // querySelectorAll full-document POR lote de mutaciones, acumular y
  // escanear a lo sumo cada 400ms
  let nsbScanTimer = 0;
  function scheduleDialogScan() {
    if (nsbScanTimer || state.destroyed) return;
    nsbScanTimer = window.setTimeout(() => {
      nsbScanTimer = 0;
      scanForDialogs();
    }, 400);
  }

  function scanForDialogs(mutations) {
    if (state.destroyed) return;
    if (mutations) {
      if (mutations.some(m =>
        m.target.id === 'mf-native-settings-panel' || m.target.closest?.('#mf-native-settings-panel') ||
        [...m.addedNodes, ...m.removedNodes].some(n => n.id === 'mf-native-settings-panel' || (n.nodeType === 1 && n.hasAttribute?.('data-mf-native-tab')))
      )) return;
      // Diferir el escaneo pesado: coalescing con el resto de mutaciones
      scheduleDialogScan();
      return;
    }
    for (const dialog of document.querySelectorAll('[role=dialog]')) {
      injectTabsIntoDialog(dialog);
    }
  }

  function start() {
    state.bodyObserver = new MutationObserver(scanForDialogs);
    state.bodyObserver.observe(document.body, { childList: true, subtree: true });
    scanForDialogs();

    document.addEventListener('minifeather:nsb-state-data', onStateData);
    state.requestTimer = window.setInterval(() => {
      if (state.ready || state.destroyed) {
        clearInterval(state.requestTimer);
        state.requestTimer = 0;
        return;
      }
      requestState();
    }, 800);
    requestState();

    log('NativeSettingsBridge iniciado (tabs MF)');
  }

  function destroy() {
    state.destroyed = true;
    state.bodyObserver?.disconnect();
    state.modalObserver?.disconnect();
    if (nsbScanTimer) { clearTimeout(nsbScanTimer); nsbScanTimer = 0; }
    if (state.requestTimer) clearInterval(state.requestTimer);
    document.removeEventListener('minifeather:nsb-state-data', onStateData);
    document.querySelectorAll('#mf-native-settings-panel').forEach(el => el.remove());
    document.querySelectorAll('[data-mf-native-tab]').forEach(el => el.remove());
    for (const dialog of document.querySelectorAll('[role=dialog]')) delete dialog.dataset.mfNsbInjected;
  }

  globalThis[GLOBAL_KEY] = { destroy, requestState, activateTab };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
