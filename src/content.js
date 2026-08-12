(function () {
  'use strict';

  try {
    globalThis.__MINIFEATHER_CONTENT__?.destroy?.();
  } catch (_) {}

  const CONFIG = {
    defaultLogo: chrome.runtime.getURL('assets/icon.png'),
    background: chrome.runtime.getURL('assets/background.png'),
    discord: 'https://discord.gg/k4Ku9DTQDQ',
    title: 'MiniFeather Client',
    fontUrl: chrome.runtime.getURL('assets/Faithful.ttf'),
    adSelectors: [
      "iframe[src*='ads']",
      "iframe[src*='doubleclick']",
      "iframe[src*='googlesyndication']",
      "[id*='ad-container']",
      "[class*='ad-container']",
      "[id*='advert']",
      "[class*='advert']"
    ],
    skins: [
      'alice', 'bob', 'techno', 'thebiggelo', 'corrupted', 'diana', 'strange', 'endoskeleton',
      'ganyu', 'georgenotfound', 'holly', 'hutao', 'jake', 'james', 'klee', 'kyoko',
      'adele', 'chris', 'deadpool', 'galactus', 'heather', 'ironman', 'suit', 'levi', 'lexi',
      'natalie', 'remus', 'sara', 'transformer', 'vindicate', 'adventure', 'aether', 'apex',
      'ariel', 'aurora', 'celeste', 'cody', 'ember', 'finn', 'glory', 'hunter', 'katie',
      'nova', 'panda', 'raven', 'seraphina', 'vain', 'zane', 'tester', 'qhyun', 'banana',
      'sushi', 'ethan', 'duck', 'cat', 'remlin'
    ],
    capes: [
      'angry-pig', 'bao', 'cloud', 'cow', 'creeper', 'golden-apple', 'grass-block', 'heart',
      'pumpkin', 'maki', 'mushroom', 'soul-creeper', 'sushi', 'salmon', 'amethyst', 'cheeser',
      'crimson-voyager', 'duck', 'frie', 'galaxy', 'migration', 'shaded-green', 'skulk',
      'withered', 'yellow', 'yin-yang', 'wooden-sword', 'stone-sword', 'iron-sword',
      'gold-sword', 'diamond-sword', 'emerald-sword'
    ]
  };

  const CHAT_GIFS = Object.freeze([
    { id: '84-years', file: '84-years.gif' },
    { id: '1000-yard-stare-cat-meme', file: '1000-yard-stare-cat-meme.gif' },
    { id: 'aaaah-cat', file: 'aaaah-cat.gif' },
    { id: 'beard-bear', file: 'beard-bear.gif' },
    { id: 'cat-disgusted', file: 'cat-disgusted.gif' },
    { id: 'cat-meme', file: 'cat-meme.gif' },
    { id: 'cat-meme-cat', file: 'cat-meme-cat.gif' },
    { id: 'chat-pouce', file: 'chat-pouce.gif' },
    { id: 'clappi-clappi-clappi', file: 'clappi-clappi-clappi.gif' },
    { id: 'devil-cat-evil', file: 'devil-cat-evil.gif' },
    { id: 'hands-down-meme', file: 'hands-down-meme.gif' },
    { id: 'kermit', file: 'kermit.gif' },
    { id: 'lfg-lets-go', file: 'lfg-lets-go.gif' },
    { id: 'memes2022funny-meme', file: 'memes2022funny-meme.gif' },
    { id: 'question-emoji', file: 'question-emoji.gif' },
    { id: 'scary-cat', file: 'scary-cat.gif' },
    { id: 'shocked-shocked-cat', file: 'shocked-shocked-cat.gif' },
    { id: 'shrek-rizz-shrek-meme', file: 'shrek-rizz-shrek-meme.gif' },
    { id: 'ugly-plankton-meme-ugly-plankton', file: 'ugly-plankton-meme-ugly-plankton.gif' },
    { id: 'laughing', file: 'laughing.png' },
    { id: 'faceemoji', file: 'faceemoji.png' },
    { id: '6pk3tk', file: '6pk3tk.png' },
    { id: 'son', file: 'son.png' },
  ]);

  const CHAT_VIDEOS = Object.freeze({
    'm-no': 'https://qu.ax/STWv.mp4',
    'm-que': 'https://qu.ax/WpYf.mp4',
    'm-si': 'https://qu.ax/pGis.mp4',
    'm-cry': 'https://qu.ax/mScl.mp4',
    'm-bye': 'https://qu.ax/NlCH.mp4'
  });

  const NAV_ITEMS = [
    { id: 'dashboard', icon: '🏠', labelKey: 'navDashboard' },
    { id: 'hud', icon: '🎮', labelKey: 'navHud' },
    { id: 'render', icon: '✨', labelKey: 'navRender' },
    { id: 'cosmetics', icon: '👕', labelKey: 'tabSkins' },
    { id: 'chat', icon: '💬', labelKey: 'sectionChat' },
    { id: 'world', icon: '🌍', labelKey: 'navWorld' },
    { id: 'settings', icon: '⚙', labelKey: 'navSettings' },
    { id: 'about', icon: '🪶', labelKey: 'tabAbout' }
  ];

  const MODULE_VERSION = '4.2.0';

  const CAMERA_OVERHAUL_PRESETS = Object.freeze({
    soft: Object.freeze({
      masterStrength: 0.55,
      strafeRoll: 0.034,
      turnRoll: 0.021,
      forwardPitch: 0.014,
      verticalPitch: 0.017,
      bobStrength: 0.013,
      bobFrequency: 7.2,
      landingStrength: 0.024,
      swayStrength: 0.0010,
      fovBoost: 1.8,
      mouseStrength: 0.00009
    }),
    normal: Object.freeze({
      masterStrength: 1.00,
      strafeRoll: 0.055,
      turnRoll: 0.035,
      forwardPitch: 0.022,
      verticalPitch: 0.028,
      bobStrength: 0.022,
      bobFrequency: 8.2,
      landingStrength: 0.040,
      swayStrength: 0.0018,
      fovBoost: 3.5,
      mouseStrength: 0.00016
    }),
    strong: Object.freeze({
      masterStrength: 1.45,
      strafeRoll: 0.068,
      turnRoll: 0.046,
      forwardPitch: 0.030,
      verticalPitch: 0.037,
      bobStrength: 0.030,
      bobFrequency: 9.4,
      landingStrength: 0.055,
      swayStrength: 0.0026,
      fovBoost: 5.2,
      mouseStrength: 0.00022
    })
  });

  const CAMERA_OVERHAUL_LIMITS = Object.freeze({
    masterStrength: Object.freeze({ min: 0.25, max: 2.00, step: 0.05, label: 'cameraOverhaulStrength', digits: 2 }),
    strafeRoll: Object.freeze({ min: 0, max: 0.10, step: 0.001, label: 'cameraOverhaulStrafe', digits: 3 }),
    turnRoll: Object.freeze({ min: 0, max: 0.08, step: 0.001, label: 'cameraOverhaulTurn', digits: 3 }),
    forwardPitch: Object.freeze({ min: 0, max: 0.06, step: 0.001, label: 'cameraOverhaulMovePitch', digits: 3 }),
    verticalPitch: Object.freeze({ min: 0, max: 0.07, step: 0.001, label: 'cameraOverhaulVertical', digits: 3 }),
    bobStrength: Object.freeze({ min: 0, max: 0.05, step: 0.001, label: 'cameraOverhaulBob', digits: 3 }),
    bobFrequency: Object.freeze({ min: 4, max: 14, step: 0.1, label: 'cameraOverhaulBobFrequency', digits: 1 }),
    landingStrength: Object.freeze({ min: 0, max: 0.08, step: 0.001, label: 'cameraOverhaulLanding', digits: 3 }),
    swayStrength: Object.freeze({ min: 0, max: 0.005, step: 0.0001, label: 'cameraOverhaulSway', digits: 4 }),
    fovBoost: Object.freeze({ min: 0, max: 7, step: 0.1, label: 'cameraOverhaulFov', digits: 1 }),
    mouseStrength: Object.freeze({ min: 0, max: 0.00035, step: 0.00001, label: 'cameraOverhaulMouse', digits: 5 })
  });

  function cloneCameraValues(source = CAMERA_OVERHAUL_PRESETS.normal) {
    return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, Number(value)]));
  }

  function clampCameraValues(source) {
    const base = cloneCameraValues(CAMERA_OVERHAUL_PRESETS.normal);
    if (!source || typeof source !== 'object') return base;
    for (const [key, limit] of Object.entries(CAMERA_OVERHAUL_LIMITS)) {
      const value = Number(source[key]);
      if (!Number.isFinite(value)) continue;
      base[key] = Math.max(limit.min, Math.min(limit.max, value));
    }
    return base;
  }

  function detectCameraPreset(values) {
    const normalized = clampCameraValues(values);
    for (const [name, preset] of Object.entries(CAMERA_OVERHAUL_PRESETS)) {
      const matches = Object.keys(CAMERA_OVERHAUL_LIMITS).every(key =>
        Math.abs(Number(normalized[key]) - Number(preset[key])) <= Math.max(Number(CAMERA_OVERHAUL_LIMITS[key].step) / 2, 0.000001)
      );
      if (matches) return name;
    }
    return 'custom';
  }

  const PATPAT_PRESETS = Object.freeze({
    soft: Object.freeze({
      squishStrength: 45,
      duration: 0.50,
      handMovement: 70,
      pushStrength: 15
    }),
    normal: Object.freeze({
      squishStrength: 73,
      duration: 0.36,
      handMovement: 100,
      pushStrength: 35
    }),
    strong: Object.freeze({
      squishStrength: 88,
      duration: 0.32,
      handMovement: 100,
      pushStrength: 55
    }),
    extreme: Object.freeze({
      squishStrength: 100,
      duration: 0.28,
      handMovement: 100,
      pushStrength: 80
    })
  });

  const PATPAT_LIMITS = Object.freeze({
    squishStrength: Object.freeze({ min: 0, max: 100, step: 1, label: 'patPatSquishStrength', digits: 0 }),
    duration: Object.freeze({ min: 0.20, max: 1.20, step: 0.01, label: 'patPatDuration', digits: 2 }),
    handMovement: Object.freeze({ min: 0, max: 100, step: 1, label: 'patPatHandMovement', digits: 0 }),
    pushStrength: Object.freeze({ min: 0, max: 100, step: 1, label: 'patPatPushStrength', digits: 0 }),
    soundVolume: Object.freeze({ min: 0, max: 100, step: 1, label: 'patPatSoundVolume', digits: 0 })
  });

  const PATPAT_PROFILE_KEYS = Object.freeze(['squishStrength', 'duration', 'handMovement', 'pushStrength']);

  function clonePatPatValues(source) {
    const base = {
      ...PATPAT_PRESETS.normal,
      soundVolume: 36,
      randomSounds: true,
      nameTagFollow: true
    };
    if (!source || typeof source !== 'object') return base;
    return { ...base, ...source };
  }

  function clampPatPatValues(source) {
    const values = clonePatPatValues(source);
    for (const [key, limit] of Object.entries(PATPAT_LIMITS)) {
      const value = Number(values[key]);
      if (!Number.isFinite(value)) continue;
      values[key] = Math.max(limit.min, Math.min(limit.max, value));
    }
    values.randomSounds = values.randomSounds !== false;
    values.nameTagFollow = values.nameTagFollow !== false;
    return values;
  }

  function detectPatPatPreset(values) {
    const normalized = clampPatPatValues(values);
    for (const [name, preset] of Object.entries(PATPAT_PRESETS)) {
      const matches = PATPAT_PROFILE_KEYS.every(key => {
        const limit = PATPAT_LIMITS[key];
        return Math.abs(Number(normalized[key]) - Number(preset[key])) <= Math.max(Number(limit.step) / 2, 0.000001);
      });
      if (matches) return name;
    }
    return 'custom';
  }

  function clampAntiAfkDelay(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 120;
    return Math.max(5, Math.min(150, Math.round(parsed / 5) * 5));
  }

  function formatAntiAfkDelay(value) {
    const seconds = clampAntiAfkDelay(value);
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    if (!minutes) return `${seconds}s`;
    if (!remaining) return `${minutes}m`;
    return `${minutes}m ${remaining}s`;
  }

  const DEFAULT_SETTINGS = {
    rebrand: true,
    supportAds: false,
    discord: true,
    keystrokes: true,
    fpsCounter: true,
    cpsCounter: true,
    pingCounter: true,
    armorHud: false,
    titanTiny: false,
    titanTinyScale: 1.00,
    titanTinyBind: '',
    healthNameTags: false,
    distanceNameTags: false,
    patPat: false,
    itemPhysics: false,
    noWeather: false,
    antiAfk: false,
    antiAfkDelay: 120,
    patPatPreset: 'normal',
    patPatValues: clonePatPatValues(),
    zoom: false,
    zoomBind: 'KeyX',
    freelook: false,
    freelookBind: 'KeyZ',
    freelookMode: 'hold',
    blockHighlight: true,
    blockHighlightColor: '#ffffff',
    blockHighlightThickness: 1,
    cameraOverhaul: false,
    cameraOverhaulBind: '',
    cameraOverhaulPreset: 'normal',
    cameraOverhaulValues: cloneCameraValues(CAMERA_OVERHAUL_PRESETS.normal),
    dynamicCrosshair: false,
    dynamicCrosshairSize: 28,
    dynamicCrosshairMap: {
      air: 'empty.png', block: 'crosshair.png', entity: 'cross-open.png',
      player: 'diamond.png', enemy: 'cross-diagonal-small.png', friendly: 'circle.png',
      item: 'dot.png', projectile: 'caret.png', building: 'brackets.png',
      bridging: 'brackets-bottom.png', default: 'crosshair.png'
    },
    chatVideos: true,
    chatLinks: true,
    chatMemes: true,
    language: 'en'
  };

  const TRANSLATIONS = globalThis.MINIFEATHER_TRANSLATIONS || { en: {} };

  const LOGO_ALT_NAMES = ['miniblox'];
  const LOGO_SOURCE_NAMES = ['miniblox-icon', 'miniblox-logo', 'pwa-icon-192.png'];

  let settings = { ...DEFAULT_SETTINGS };
  let guiSettings = { ...DEFAULT_SETTINGS };
  let currentLogo = CONFIG.defaultLogo;
  let updateTimer = 0;
  let activePage = 'dashboard';
  let searchQuery = '';
  let dashboardStats = { fps: 0, ping: null };
  let dashboardTimer = 0;
  let guiCloseTimer = 0;
  let overlay = null;
  let panel = null;
  let guiReady = false;
  let panelController = null;
  let runtimeController = null;
  let rootObserver = null;
  let fontObserver = null;
  let chatObserver = null;
  let sidebarObserver = null;
  let sidebarObserverTimer = 0;
  let clipboardOriginalWrite = null;
  let restoreChatContent = () => {};
  let chatFeaturesReady = false;
  let titanTinySettingsCleanup = null;
  let patPatSettingsCleanup = null;
  let zoomSettingsCleanup = null;
  let cameraOverhaulSettingsCleanup = null;
  let destroyed = false;

  const MODULES = new Map();
  const ORIGINALS = {
    title: document.title,
    textNodes: new Map()
  };

  function createLifecycle(handlers = {}) {
    let active = false;
    return {
      get enabled() {
        return active;
      },
      enable() {
        if (active) return;
        active = true;
        handlers.enable?.();
      },
      disable() {
        if (!active) return;
        active = false;
        handlers.disable?.();
      },
      refresh() {
        if (active) handlers.refresh?.();
      },
      destroy() {
        if (active) {
          active = false;
          handlers.disable?.();
        }
        handlers.destroy?.();
      }
    };
  }

  function registerModule(name, factory) {
    if (!MODULES.has(name)) MODULES.set(name, factory());
    return MODULES.get(name);
  }

  function setModuleEnabled(name, enabled) {
    const module = MODULES.get(name);
    if (!module) return;
    if (enabled) module.enable();
    else module.disable();
  }

  function destroyModules() {
    [...MODULES.values()].reverse().forEach(module => module.destroy());
    MODULES.clear();
  }

  function isMiniFeatherNode(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return !!element?.closest?.('#mf-gui, #mf-gui-overlay, #mf-sidebar-btn, #minifeather-fps, #minifeather-cps, #minifeather-ping, #mf-keystrokes');
  }

  function safePosition(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) return value;
    } catch (_) {}
    return fallback;
  }

  function t(key, vars = {}) {
    const table = TRANSLATIONS[settings.language] || TRANSLATIONS.en;
    const fallback = TRANSLATIONS.en[key] || key;
    let value = table[key] || fallback;
    return value.replace(/\{(\w+)\}/g, (_, token) => token in vars ? vars[token] : '');
  }

  function scheduleUpdate() {
    if (destroyed) return;
    clearTimeout(updateTimer);
    updateTimer = window.setTimeout(() => {
      updateTimer = 0;
      update();
    }, 120);
  }

  function replaceTextNodes(targetText, replacement) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (isMiniFeatherNode(node)) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.includes(targetText) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      if (!ORIGINALS.textNodes.has(node)) ORIGINALS.textNodes.set(node, node.nodeValue);
      node.nodeValue = node.nodeValue.split(targetText).join(replacement);
    }
  }

  function injectFont() {
    let style = document.getElementById('minifeather-font');
    if (!style) {
      style = document.createElement('style');
      style.id = 'minifeather-font';
      style.textContent = `
        @font-face {
          font-family:'Faithful';
          src:url('${CONFIG.fontUrl}') format('truetype');
          font-weight:100 900;
          font-style:normal;
          font-display:swap;
        }
        *,*::before,*::after {
          font-family:'Faithful','Inter','Arial',sans-serif !important;
        }
      `;
      document.head.appendChild(style);
    }

    const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');

    function patchCanvas(root) {
      const canvases = [];
      if (root instanceof HTMLCanvasElement) canvases.push(root);
      if (root?.querySelectorAll) canvases.push(...root.querySelectorAll('canvas'));

      canvases.forEach(canvas => {
        let ctx = null;
        try {
          ctx = canvas.getContext('2d');
        } catch (_) {}
        if (!ctx || ctx._minifeatherFont || !descriptor) return;

        ctx._minifeatherFont = true;
        try {
          Object.defineProperty(ctx, 'font', {
            configurable: true,
            get() {
              return descriptor.get.call(this);
            },
            set(value) {
              const normalized = typeof value === 'string'
                ? value.replace(/("[^"]+"|'[^']+'|[A-Za-z][\w -]*)\s*$/, 'Faithful')
                : value;
              descriptor.set.call(this, normalized);
            }
          });
        } catch (_) {}
      });
    }

    patchCanvas(document);

    if (fontObserver) return;
    fontObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(patchCanvas);
      }
    });
    fontObserver.observe(document.body, { childList: true, subtree: true });
  }

  function changeTitle() {
    if (document.title !== CONFIG.title) document.title = CONFIG.title;
  }

  function changeFavicon() {
    let icons = [...document.querySelectorAll("link[rel*='icon']")];
    if (icons.length === 0) {
      const icon = document.createElement('link');
      icon.rel = 'icon';
      icon.dataset.mfCreatedIcon = '1';
      document.head.appendChild(icon);
      icons = [icon];
    }
    icons.forEach(icon => {
      if (!icon.hasAttribute('data-mf-original-href')) {
        icon.dataset.mfOriginalHref = icon.getAttribute('href') || '';
      }
      if (icon.getAttribute('href') !== currentLogo) icon.setAttribute('href', currentLogo);
    });
  }

  function isLogoImage(image) {
    if (!(image instanceof HTMLImageElement)) return false;
    if (image.dataset.mfLogoTarget === '1') return true;
    const alt = (image.getAttribute('alt') || '').trim().toLowerCase();
    const sources = [image.getAttribute('src'), image.getAttribute('srcset'), image.currentSrc].filter(Boolean).join(' ').toLowerCase();
    const matchesAlt = LOGO_ALT_NAMES.some(name => alt === name || alt.includes(name));
    const matchesSource = LOGO_SOURCE_NAMES.some(name => sources.includes(name));
    return matchesAlt || matchesSource;
  }

  function replaceLogo() {
    document.querySelectorAll('img').forEach(img => {
      if (!isLogoImage(img)) return;

      img.dataset.mfLogoTarget = '1';
      if (!img.hasAttribute('data-mf-original-src')) img.dataset.mfOriginalSrc = img.getAttribute('src') || '';
      if (!img.hasAttribute('data-mf-original-srcset')) img.dataset.mfOriginalSrcset = img.getAttribute('srcset') || '';

      if (img.getAttribute('src') !== currentLogo) img.setAttribute('src', currentLogo);
      if (img.hasAttribute('srcset')) img.setAttribute('srcset', currentLogo);

      const picture = img.closest('picture');
      picture?.querySelectorAll('source').forEach(source => {
        if (!source.hasAttribute('data-mf-original-srcset')) {
          source.dataset.mfOriginalSrcset = source.getAttribute('srcset') || '';
        }
        source.setAttribute('srcset', currentLogo);
      });
    });
  }

  function replaceBackground() {
    document.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (!src.includes('default-B1Dv6Hww') && img.dataset.mfBackground !== '1') return;

      img.dataset.mfBackground = '1';
      if (!img.hasAttribute('data-mf-original-src')) img.dataset.mfOriginalSrc = src;
      if (img.getAttribute('src') !== CONFIG.background) img.setAttribute('src', CONFIG.background);
    });
  }

  function replaceDiscordInput() {
    document.querySelectorAll('input').forEach(input => {
      if (!input.value?.includes('discord.gg') && input.dataset.mfDiscordInput !== '1') return;

      input.dataset.mfDiscordInput = '1';
      if (!input.hasAttribute('data-mf-original-value')) input.dataset.mfOriginalValue = input.value || '';
      if (input.value !== CONFIG.discord) {
        input.value = CONFIG.discord;
        input.setAttribute('value', CONFIG.discord);
      }
    });
  }

  function hideDiscordImage() {
    document.querySelectorAll('img').forEach(img => {
      if (img.alt !== 'Join our Discord' && !(img.src || '').includes('join-discord') && img.dataset.mfDiscordImage !== '1') return;

      img.dataset.mfDiscordImage = '1';
      if (!img.hasAttribute('data-mf-original-display')) img.dataset.mfOriginalDisplay = img.style.display || '';
      img.style.display = 'none';
    });
  }

  function changeDiscordButton() {
    document.querySelectorAll('button').forEach(btn => {
      const text = btn.innerText || '';
      if (!text.includes('Join the Discord') && btn.dataset.mfJoin !== '1') return;

      if (!btn.hasAttribute('data-mf-original-html')) btn.dataset.mfOriginalHtml = btn.innerHTML;
      btn.innerHTML = btn.innerHTML.replace(/Join the Discord/g, t('joinServer'));
      btn.dataset.mfJoin = '1';
    });
  }

  function getDiscordReplacementMap() {
    return {
      'Find teammates and squad up for any mode': t('discordDesc1'),
      'Be first to hear about updates and new content': t('discordDesc2'),
      'Giveaways, events and booster-only perks': t('discordDesc3'),
      'Chat with the devs and the rest of the community': t('discordDesc4'),
      'Join the Miniblox community': t('discordDesc5')
    };
  }

  function changeDiscordDescriptions() {
    const replacements = getDiscordReplacementMap();
    Object.entries(replacements).forEach(([original, replacement]) => {
      document.querySelectorAll('p').forEach(p => {
        if (p.innerText !== original && p.dataset.mfDiscordKey !== original) return;
        if (!p.hasAttribute('data-mf-original-text')) p.dataset.mfOriginalText = p.innerText;
        p.innerText = replacement;
        p.dataset.mfDiscordKey = original;
      });
      replaceTextNodes(original, replacement);
    });
  }

  function changeWelcomeText() {
    document.querySelectorAll('p.css-1dxm2zz').forEach(p => {
      if (!p.innerText.toLowerCase().startsWith('welcome back') && p.dataset.mfWelcome !== '1') return;

      if (!p.hasAttribute('data-mf-original-html')) p.dataset.mfOriginalHtml = p.innerHTML;
      p.innerHTML = t('welcomeHtml');
      p.dataset.mfWelcome = '1';
    });
  }

  function restoreRebrand() {
    document.title = ORIGINALS.title;

    document.querySelectorAll("link[rel*='icon'][data-mf-original-href]").forEach(icon => {
      const original = icon.dataset.mfOriginalHref || '';
      if (original) icon.setAttribute('href', original);
      else icon.removeAttribute('href');
      delete icon.dataset.mfOriginalHref;
    });
    document.querySelectorAll("link[data-mf-created-icon='1']").forEach(icon => icon.remove());

    document.querySelectorAll('img[data-mf-logo-target="1"]').forEach(img => {
      const originalSrc = img.dataset.mfOriginalSrc || '';
      const originalSrcset = img.dataset.mfOriginalSrcset || '';
      if (originalSrc) img.setAttribute('src', originalSrc);
      else img.removeAttribute('src');
      if (originalSrcset) img.setAttribute('srcset', originalSrcset);
      else img.removeAttribute('srcset');
      delete img.dataset.mfLogoTarget;
      delete img.dataset.mfOriginalSrc;
      delete img.dataset.mfOriginalSrcset;
    });

    document.querySelectorAll('source[data-mf-original-srcset]').forEach(source => {
      const original = source.dataset.mfOriginalSrcset || '';
      if (original) source.setAttribute('srcset', original);
      else source.removeAttribute('srcset');
      delete source.dataset.mfOriginalSrcset;
    });

    document.querySelectorAll('img[data-mf-background="1"]').forEach(img => {
      const original = img.dataset.mfOriginalSrc || '';
      if (original) img.setAttribute('src', original);
      else img.removeAttribute('src');
      delete img.dataset.mfBackground;
      delete img.dataset.mfOriginalSrc;
    });
  }

  function restoreDiscord() {
    document.querySelectorAll('input[data-mf-discord-input="1"]').forEach(input => {
      const original = input.dataset.mfOriginalValue || '';
      input.value = original;
      input.setAttribute('value', original);
      delete input.dataset.mfDiscordInput;
      delete input.dataset.mfOriginalValue;
    });

    document.querySelectorAll('img[data-mf-discord-image="1"]').forEach(img => {
      img.style.display = img.dataset.mfOriginalDisplay || '';
      delete img.dataset.mfDiscordImage;
      delete img.dataset.mfOriginalDisplay;
    });

    document.querySelectorAll('button[data-mf-join="1"]').forEach(btn => {
      if (btn.hasAttribute('data-mf-original-html')) btn.innerHTML = btn.dataset.mfOriginalHtml;
      delete btn.dataset.mfJoin;
      delete btn.dataset.mfOriginalHtml;
    });

    document.querySelectorAll('p[data-mf-discord-key]').forEach(p => {
      if (p.hasAttribute('data-mf-original-text')) p.innerText = p.dataset.mfOriginalText;
      delete p.dataset.mfDiscordKey;
      delete p.dataset.mfOriginalText;
    });

    document.querySelectorAll('p[data-mf-welcome="1"]').forEach(p => {
      if (p.hasAttribute('data-mf-original-html')) p.innerHTML = p.dataset.mfOriginalHtml;
      delete p.dataset.mfWelcome;
      delete p.dataset.mfOriginalHtml;
    });

    ORIGINALS.textNodes.forEach((value, node) => {
      if (node.isConnected) node.nodeValue = value;
    });
    ORIGINALS.textNodes.clear();
  }

  function initLifecycleModules() {
    registerModule('rebrand', () => createLifecycle({
      enable: () => {
        changeTitle();
        changeFavicon();
        replaceLogo();
        replaceBackground();
      },
      refresh: () => {
        changeTitle();
        changeFavicon();
        replaceLogo();
        replaceBackground();
      },
      disable: restoreRebrand,
      destroy: restoreRebrand
    }));

    registerModule('discord', () => createLifecycle({
      enable: () => {
        replaceDiscordInput();
        hideDiscordImage();
        changeDiscordButton();
        changeDiscordDescriptions();
        changeWelcomeText();
      },
      refresh: () => {
        replaceDiscordInput();
        hideDiscordImage();
        changeDiscordButton();
        changeDiscordDescriptions();
        changeWelcomeText();
      },
      disable: restoreDiscord,
      destroy: restoreDiscord
    }));
  }

  function blockAds() {
    CONFIG.adSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(ad => {
        ad.style.display = 'none';
      });
    });
  }

  function showAds() {
    CONFIG.adSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(ad => {
        ad.style.display = '';
      });
    });
  }

  function handleDocumentClick(event) {
    const btn = event.target.closest?.('button');
    if (!btn || btn.dataset.mfJoin !== '1' || !settings.discord) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.open(CONFIG.discord, '_blank');
  }

  function hookClipboard() {
    if (!navigator.clipboard || clipboardOriginalWrite) return;
    clipboardOriginalWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function (text) {
      if (settings.discord && text?.includes('discord.gg')) text = CONFIG.discord;
      return clipboardOriginalWrite(text);
    };
  }

  function unhookClipboard() {
    if (!navigator.clipboard || !clipboardOriginalWrite) return;
    navigator.clipboard.writeText = clipboardOriginalWrite;
    clipboardOriginalWrite = null;
  }

  function initFPSCounter() {
    return registerModule('fpsCounter', () => {
      let box = null;
      let controller = null;
      let frameId = 0;
      let frames = 0;
      let last = 0;
      let visible = !document.hidden;

      function createBox() {
        if (box?.isConnected) return;
        const saved = safePosition('minifeather-fps-pos', { x: 12, y: 12 });
        box = document.createElement('div');
        box.id = 'minifeather-fps';
        box.style.cssText = `
          position:fixed;
          left:${saved.x}px;
          top:${saved.y}px;
          padding:8px 12px;
          background:rgba(10,12,18,.9);
          border:1px solid rgba(255,255,255,.08);
          border-radius:12px;
          backdrop-filter:blur(12px);
          -webkit-backdrop-filter:blur(12px);
          color:white;
          font-size:14px;
          font-weight:700;
          box-shadow:0 12px 28px rgba(0,0,0,.35);
          z-index:999995;
          user-select:none;
          cursor:move;
        `;
        document.body.appendChild(box);
      }

      function loop(now) {
        if (!controller) return;
        if (visible) {
          frames++;
          const elapsed = now - last;
          if (elapsed >= 1000) {
            const fps = Math.round(frames * 1000 / elapsed);
            const color = fps >= 120 ? '#22c55e' : fps >= 60 ? '#facc15' : '#ef4444';
            box.innerHTML = `<span style="color:#7c3aed;">MF</span><span style="color:#4b5563;padding:0 6px;">•</span><span style="color:${color};">${fps}</span><span style="color:#9ca3af;"> FPS</span>`;
            dashboardStats.fps = fps;
            frames = 0;
            last = now;
          }
        }
        frameId = requestAnimationFrame(loop);
      }

      return createLifecycle({
        enable() {
          createBox();
          box.style.display = 'block';
          controller = new AbortController();
          const signal = controller.signal;
          let dragging = false;
          let offX = 0;
          let offY = 0;

          document.addEventListener('visibilitychange', () => {
            visible = !document.hidden;
            if (visible) {
              last = performance.now();
              frames = 0;
            }
          }, { signal });

          box.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            dragging = true;
            offX = event.clientX - box.offsetLeft;
            offY = event.clientY - box.offsetTop;
            event.preventDefault();
            event.stopPropagation();
          }, { signal });

          document.addEventListener('mousemove', event => {
            if (!dragging) return;
            const x = Math.max(0, Math.min(event.clientX - offX, window.innerWidth - box.offsetWidth));
            const y = Math.max(0, Math.min(event.clientY - offY, window.innerHeight - box.offsetHeight));
            box.style.left = `${x}px`;
            box.style.top = `${y}px`;
          }, { signal });

          document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            localStorage.setItem('minifeather-fps-pos', JSON.stringify({ x: box.offsetLeft, y: box.offsetTop }));
          }, { signal });

          frames = 0;
          last = performance.now();
          visible = !document.hidden;
          frameId = requestAnimationFrame(loop);
        },
        disable() {
          controller?.abort();
          controller = null;
          if (frameId) cancelAnimationFrame(frameId);
          frameId = 0;
          frames = 0;
          dashboardStats.fps = 0;
          box?.remove();
          box = null;
        },
        destroy() {
          box?.remove();
          box = null;
        }
      });
    });
  }

  function initCPSCounter() {
    return registerModule('cpsCounter', () => {
      let box = null;
      let controller = null;
      let interval = 0;
      let leftClicks = [];
      let rightClicks = [];

      function createBox() {
        if (box?.isConnected) return;
        const saved = safePosition('minifeather-cps-pos', { x: 12, y: 62 });
        box = document.createElement('div');
        box.id = 'minifeather-cps';
        box.style.cssText = `
          position:fixed;
          left:${saved.x}px;
          top:${saved.y}px;
          min-width:112px;
          padding:8px 12px;
          background:rgba(10,12,18,.9);
          border:1px solid rgba(255,255,255,.08);
          border-radius:12px;
          backdrop-filter:blur(12px);
          -webkit-backdrop-filter:blur(12px);
          color:white;
          font-size:14px;
          font-weight:700;
          text-align:center;
          box-shadow:0 12px 28px rgba(0,0,0,.35);
          z-index:999997;
          user-select:none;
          cursor:move;
        `;
        document.body.appendChild(box);
      }

      function render() {
        const now = performance.now();
        leftClicks = leftClicks.filter(time => now - time < 1000);
        rightClicks = rightClicks.filter(time => now - time < 1000);
        if (box) {
          box.innerHTML = `<span style="color:#9ca3af;">${t('cpsLabel')}</span> <span style="color:#f8fafc;">${leftClicks.length}</span> <span style="color:#64748b;">|</span> <span style="color:#f8fafc;">${rightClicks.length}</span>`;
        }
      }

      return createLifecycle({
        enable() {
          createBox();
          box.style.display = 'block';
          controller = new AbortController();
          const signal = controller.signal;
          let dragging = false;
          let offX = 0;
          let offY = 0;

          document.addEventListener('mousedown', event => {
            if (box.contains(event.target) || isMiniFeatherNode(event.target)) return;
            const now = performance.now();
            if (event.button === 0) leftClicks.push(now);
            if (event.button === 2) rightClicks.push(now);
            render();
          }, { capture: true, signal });

          box.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            dragging = true;
            offX = event.clientX - box.offsetLeft;
            offY = event.clientY - box.offsetTop;
            event.preventDefault();
            event.stopPropagation();
          }, { signal });

          document.addEventListener('mousemove', event => {
            if (!dragging) return;
            const x = Math.max(0, Math.min(event.clientX - offX, window.innerWidth - box.offsetWidth));
            const y = Math.max(0, Math.min(event.clientY - offY, window.innerHeight - box.offsetHeight));
            box.style.left = `${x}px`;
            box.style.top = `${y}px`;
          }, { signal });

          document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            localStorage.setItem('minifeather-cps-pos', JSON.stringify({ x: box.offsetLeft, y: box.offsetTop }));
          }, { signal });

          render();
          interval = window.setInterval(render, 100);
        },
        disable() {
          controller?.abort();
          controller = null;
          clearInterval(interval);
          interval = 0;
          leftClicks = [];
          rightClicks = [];
          box?.remove();
          box = null;
        },
        destroy() {
          box?.remove();
          box = null;
        }
      });
    });
  }

  function initPingCounter() {
    return registerModule('pingCounter', () => {
      let box = null;
      let controller = null;
      let requestController = null;
      let interval = 0;
      let ping = null;
      let measuring = false;
      let enabled = false;
      const samples = [];

      function createBox() {
        if (box?.isConnected) return;
        const saved = safePosition('minifeather-ping-pos', { x: 12, y: 112 });
        box = document.createElement('div');
        box.id = 'minifeather-ping';
        box.style.cssText = `
          position:fixed;
          left:${saved.x}px;
          top:${saved.y}px;
          min-width:112px;
          padding:8px 12px;
          background:rgba(10,12,18,.9);
          border:1px solid rgba(255,255,255,.08);
          border-radius:12px;
          backdrop-filter:blur(12px);
          -webkit-backdrop-filter:blur(12px);
          color:white;
          font-size:14px;
          font-weight:700;
          text-align:center;
          box-shadow:0 12px 28px rgba(0,0,0,.35);
          z-index:999996;
          user-select:none;
          cursor:move;
        `;
        document.body.appendChild(box);
      }

      function connectionRtt() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const value = Number(connection?.rtt);
        return Number.isFinite(value) && value > 0 ? value : null;
      }

      function render() {
        const value = Number.isFinite(ping) ? Math.max(0, Math.round(ping)) : null;
        const color = value === null ? '#94a3b8' : value <= 80 ? '#22c55e' : value <= 150 ? '#facc15' : '#ef4444';
        dashboardStats.ping = value;
        if (box) {
          box.innerHTML = `<span style="color:#9ca3af;">${t('pingLabel')}</span> <span style="color:${color};">${value === null ? '--' : value}</span> <span style="color:#64748b;">ms</span>`;
        }
      }

      async function measure() {
        if (!enabled || measuring || document.hidden) return;
        if (!navigator.onLine) {
          ping = null;
          render();
          return;
        }

        measuring = true;
        requestController?.abort();
        requestController = new AbortController();
        const timeout = window.setTimeout(() => requestController?.abort(), 4000);
        const started = performance.now();

        try {
          await fetch(`${location.origin}/favicon.ico?mf_ping=${Date.now()}`, {
            method: 'HEAD',
            cache: 'no-store',
            credentials: 'omit',
            signal: requestController.signal
          });

          if (!enabled) return;
          const measured = performance.now() - started;
          samples.push(measured);
          if (samples.length > 5) samples.shift();

          const sorted = [...samples].sort((a, b) => a - b);
          ping = sorted[Math.floor(sorted.length / 2)];
        } catch (_) {
          if (!enabled) return;
          ping = connectionRtt();
        } finally {
          clearTimeout(timeout);
          requestController = null;
          measuring = false;
          if (enabled) render();
        }
      }

      return createLifecycle({
        enable() {
          enabled = true;
          createBox();
          box.style.display = 'block';
          controller = new AbortController();
          const signal = controller.signal;
          let dragging = false;
          let offX = 0;
          let offY = 0;

          window.addEventListener('online', measure, { signal });
          window.addEventListener('offline', () => {
            requestController?.abort();
            ping = null;
            render();
          }, { signal });
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) measure();
          }, { signal });

          box.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            dragging = true;
            offX = event.clientX - box.offsetLeft;
            offY = event.clientY - box.offsetTop;
            event.preventDefault();
            event.stopPropagation();
          }, { signal });

          document.addEventListener('mousemove', event => {
            if (!dragging) return;
            const x = Math.max(0, Math.min(event.clientX - offX, window.innerWidth - box.offsetWidth));
            const y = Math.max(0, Math.min(event.clientY - offY, window.innerHeight - box.offsetHeight));
            box.style.left = `${x}px`;
            box.style.top = `${y}px`;
          }, { signal });

          document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            localStorage.setItem('minifeather-ping-pos', JSON.stringify({ x: box.offsetLeft, y: box.offsetTop }));
          }, { signal });

          const initialRtt = connectionRtt();
          if (initialRtt !== null) ping = initialRtt;
          render();
          measure();
          interval = window.setInterval(measure, 3000);
        },
        disable() {
          enabled = false;
          controller?.abort();
          controller = null;
          requestController?.abort();
          requestController = null;
          clearInterval(interval);
          interval = 0;
          measuring = false;
          ping = null;
          samples.length = 0;
          dashboardStats.ping = null;
          box?.remove();
          box = null;
        },
        destroy() {
          enabled = false;
          requestController?.abort();
          requestController = null;
          box?.remove();
          box = null;
        }
      });
    });
  }

  function initKeystrokes() {
    return registerModule('keystrokes', () => {
      let container = null;
      let controller = null;
      let interval = 0;
      const buttons = {};
      const clickCounters = { LMB: [], RMB: [] };

      function ensureStyle() {
        if (document.getElementById('minifeather-keystroke-css')) return;
        const style = document.createElement('style');
        style.id = 'minifeather-keystroke-css';
        style.textContent = `
          #mf-keystrokes * { box-sizing:border-box; }
          .mf-key {
            display:flex;
            align-items:center;
            justify-content:center;
            background:rgba(10,12,18,.88);
            color:#6b7280;
            border:1px solid rgba(255,255,255,.08);
            border-radius:10px;
            font-weight:700;
            transition:background .06s ease,color .06s ease,border-color .06s ease,transform .06s ease,box-shadow .06s ease;
            backdrop-filter:blur(10px);
            -webkit-backdrop-filter:blur(10px);
            position:relative;
            overflow:hidden;
          }
          .mf-key.active {
            background:rgba(124,58,237,.92);
            color:#fff;
            border-color:rgba(167,139,250,.85);
            transform:scale(.92);
            box-shadow:0 0 18px rgba(124,58,237,.35), inset 0 0 12px rgba(255,255,255,.08);
          }
          .mf-key .mf-cps {
            position:absolute;
            bottom:2px;
            right:4px;
            font-size:9px;
            color:rgba(255,255,255,.45);
            font-weight:700;
          }
          .mf-key.active .mf-cps { color:rgba(255,255,255,.82); }
        `;
        document.head.appendChild(style);
      }

      function makeKey(code, label, width, height, fontSize, withCps = false) {
        const element = document.createElement('div');
        element.className = 'mf-key';
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        element.style.fontSize = `${fontSize}px`;
        element.innerHTML = `<span>${label}</span>`;
        if (withCps) {
          const cps = document.createElement('span');
          cps.className = 'mf-cps';
          cps.textContent = '0';
          element.appendChild(cps);
        }
        buttons[code] = element;
        return element;
      }

      function makeRow(keys) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:5px;justify-content:center;';
        keys.forEach(key => row.appendChild(key));
        return row;
      }

      function createContainer() {
        if (container?.isConnected) return;
        ensureStyle();
        const saved = safePosition('minifeather-keystroke-pos', { x: 20, y: 200 });

        container = document.createElement('div');
        container.id = 'mf-keystrokes';
        container.style.cssText = `
          position:fixed;
          left:${saved.x}px;
          top:${saved.y}px;
          z-index:999997;
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:5px;
          user-select:none;
          cursor:move;
        `;

        container.appendChild(makeRow([makeKey('KeyW', 'W', 52, 52, 17)]));
        container.appendChild(makeRow([
          makeKey('KeyA', 'A', 52, 52, 17),
          makeKey('KeyS', 'S', 52, 52, 17),
          makeKey('KeyD', 'D', 52, 52, 17)
        ]));
        container.appendChild(makeRow([
          makeKey('LMB', 'L', 80, 36, 13, true),
          makeKey('RMB', 'R', 80, 36, 13, true)
        ]));
        const space = makeKey('Space', 'SPACE', 165, 32, 11);
        space.style.letterSpacing = '2px';
        container.appendChild(space);
        document.body.appendChild(container);
      }

      function activate(code) {
        buttons[code]?.classList.add('active');
      }

      function deactivate(code) {
        buttons[code]?.classList.remove('active');
      }

      function updateCps(code) {
        const now = performance.now();
        clickCounters[code] = clickCounters[code].filter(time => now - time < 1000);
        const cps = buttons[code]?.querySelector('.mf-cps');
        if (cps) cps.textContent = clickCounters[code].length;
      }

      return createLifecycle({
        enable() {
          createContainer();
          container.style.display = 'flex';
          controller = new AbortController();
          const signal = controller.signal;
          let dragging = false;
          let offX = 0;
          let offY = 0;

          document.addEventListener('keydown', event => {
            if (buttons[event.code]) activate(event.code);
          }, { signal });

          document.addEventListener('keyup', event => {
            if (buttons[event.code]) deactivate(event.code);
          }, { signal });

          document.addEventListener('mousedown', event => {
            if (container.contains(event.target) || isMiniFeatherNode(event.target)) return;
            if (event.button === 0) {
              activate('LMB');
              clickCounters.LMB.push(performance.now());
              updateCps('LMB');
            }
            if (event.button === 2) {
              activate('RMB');
              clickCounters.RMB.push(performance.now());
              updateCps('RMB');
            }
          }, { signal });

          document.addEventListener('mouseup', event => {
            if (event.button === 0) deactivate('LMB');
            if (event.button === 2) deactivate('RMB');
          }, { signal });

          container.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            dragging = true;
            offX = event.clientX - container.offsetLeft;
            offY = event.clientY - container.offsetTop;
            event.preventDefault();
            event.stopPropagation();
          }, { signal });

          document.addEventListener('mousemove', event => {
            if (!dragging) return;
            const x = Math.max(0, Math.min(event.clientX - offX, window.innerWidth - container.offsetWidth));
            const y = Math.max(0, Math.min(event.clientY - offY, window.innerHeight - container.offsetHeight));
            container.style.left = `${x}px`;
            container.style.top = `${y}px`;
          }, { signal });

          document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            localStorage.setItem('minifeather-keystroke-pos', JSON.stringify({ x: container.offsetLeft, y: container.offsetTop }));
          }, { signal });

          interval = window.setInterval(() => {
            updateCps('LMB');
            updateCps('RMB');
          }, 200);
        },
        disable() {
          controller?.abort();
          controller = null;
          clearInterval(interval);
          interval = 0;
          Object.values(buttons).forEach(button => button.classList.remove('active'));
          clickCounters.LMB = [];
          clickCounters.RMB = [];
          container?.remove();
          container = null;
          document.getElementById('minifeather-keystroke-css')?.remove();
          Object.keys(buttons).forEach(key => delete buttons[key]);
        },
        destroy() {
          container?.remove();
          container = null;
          document.getElementById('minifeather-keystroke-css')?.remove();
          Object.keys(buttons).forEach(key => delete buttons[key]);
        }
      });
    });
  }

  function injectGuiStyles() {
    if (document.getElementById('mf-gui-style')) return;
    const style = document.createElement('style');
    style.id = 'mf-gui-style';
    style.textContent = `
      #mf-gui-overlay {
        position:fixed;
        inset:0;
        background:rgba(3,4,8,.6);
        backdrop-filter:blur(12px);
        -webkit-backdrop-filter:blur(12px);
        z-index:999998;
        display:none;
      }
      #mf-gui {
        --mf-bg:#090b11;
        --mf-panel:#11151d;
        --mf-panel2:#171c26;
        --mf-border:#252d3b;
        --mf-accent:#7c5cff;
        --mf-accent2:#9a84ff;
        --mf-text:#ffffff;
        --mf-sub:#9ea8b7;
        position:fixed;
        top:50%;
        left:50%;
        transform:translate(-50%,-50%);
        width:min(1120px, calc(100vw - 24px));
        height:min(700px, calc(100vh - 24px));
        background:var(--mf-bg);
        border:1px solid var(--mf-border);
        border-radius:22px;
        box-shadow:0 35px 120px rgba(0,0,0,.65);
        overflow:hidden;
        color:var(--mf-text);
        z-index:999999;
        display:none;
        pointer-events:none;
        opacity:0;
        transition:opacity .14s ease;
      }
      #mf-gui,
      .mf-select {
        color-scheme:dark;
      }
      #mf-gui-shell {
        display:flex;
        height:100%;
      }
      #mf-gui-sidebar {
        width:240px;
        flex:0 0 auto;
        background:var(--mf-panel);
        border-right:1px solid var(--mf-border);
        display:flex;
        flex-direction:column;
        overflow-y:auto;
      }
      #mf-gui-sidebar-brand {
        display:flex;
        align-items:center;
        gap:10px;
        padding:22px 20px 16px;
      }
      #mf-gui-sidebar-brand strong {
        font-size:17px;
        font-weight:800;
        letter-spacing:.3px;
        color:#fff;
      }
      .mf-nav-list {
        display:flex;
        flex-direction:column;
        gap:2px;
        padding:6px 12px;
      }
      .mf-nav {
        display:flex;
        align-items:center;
        gap:10px;
        padding:11px 14px;
        border-radius:12px;
        cursor:pointer;
        font-weight:600;
        font-size:13px;
        color:var(--mf-sub);
        transition:background .15s ease, color .15s ease;
        border-left:3px solid transparent;
        user-select:none;
      }
      .mf-nav-icon {
        font-size:15px;
        width:18px;
        text-align:center;
        flex:0 0 auto;
      }
      .mf-nav:hover {
        background:rgba(124,92,255,.12);
        color:#fff;
      }
      .mf-nav.active {
        background:rgba(124,92,255,.18);
        color:#fff;
        border-left-color:var(--mf-accent);
      }
      #mf-gui-content {
        flex:1;
        min-width:0;
        display:flex;
        flex-direction:column;
        background:var(--mf-bg);
      }
      #mf-gui-topbar {
        height:66px;
        flex:0 0 auto;
        display:flex;
        align-items:center;
        gap:12px;
        padding:0 24px;
        border-bottom:1px solid var(--mf-border);
      }
      #mf-gui-topbar h2 {
        margin:0;
        font-size:16px;
        color:#fff;
        white-space:nowrap;
      }
      #mf-gui-search {
        flex:1;
        max-width:320px;
        margin-left:16px;
        padding:10px 14px;
        border-radius:10px;
        background:var(--mf-panel2);
        border:1px solid var(--mf-border);
        color:#fff;
        outline:none;
        font-size:12px;
      }
      #mf-gui-search:focus {
        border-color:rgba(154,132,255,.5);
      }
      #mf-gui-search::placeholder {
        color:#64748b;
      }
      .mf-topbar-actions {
        display:flex;
        align-items:center;
        gap:8px;
        margin-left:auto;
      }
      #mf-gui-page {
        flex:1;
        overflow:auto;
        padding:26px 28px;
        scrollbar-width:thin;
        scrollbar-color:#475569 #0b0f18;
      }
      #mf-gui-page::-webkit-scrollbar {
        width:10px;
        height:10px;
      }
      #mf-gui-page::-webkit-scrollbar-track {
        background:#0b0f18;
      }
      #mf-gui-page::-webkit-scrollbar-thumb {
        background:#475569;
        border:2px solid #0b0f18;
        border-radius:999px;
      }
      #mf-gui-page::-webkit-scrollbar-thumb:hover {
        background:#64748b;
      }
      #mf-gui-page h1 {
        margin:0 0 20px;
        font-size:15px;
        text-transform:uppercase;
        letter-spacing:.14em;
        color:#64748b;
      }
      .mf-page-stack {
        display:flex;
        flex-direction:column;
        gap:18px;
      }
      .mf-grid {
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
        gap:16px;
      }
      .mf-icon {
        width:30px;
        height:30px;
        border-radius:10px;
        object-fit:cover;
        box-shadow:0 0 0 1px rgba(255,255,255,.08) inset;
        flex:0 0 auto;
      }
      .mf-select,
      .mf-input,
      .mf-btn,
      .mf-small-btn {
        width:100%;
        border-radius:12px;
        border:1px solid var(--mf-border);
        background:rgba(255,255,255,.04);
        color:#edf2f7;
        padding:10px 12px;
        font-size:12px;
        outline:none;
        transition:border-color .15s ease, background .15s ease, transform .12s ease;
      }
      .mf-select {
        background-color:#111827;
        color:#f8fafc;
      }
      .mf-select option,
      .mf-select optgroup {
        background-color:#0b0f18;
        color:#f8fafc;
      }
      .mf-select option:checked {
        background:#2563eb linear-gradient(0deg, #2563eb, #2563eb);
        color:#fff;
      }
      .mf-select option:disabled {
        color:#94a3b8;
      }
      .mf-select:focus,
      .mf-input:focus {
        border-color:rgba(167,139,250,.6);
        background:rgba(255,255,255,.06);
      }
      .mf-file-picker {
        display:flex;
        align-items:center;
        width:100%;
        min-height:40px;
        overflow:hidden;
        border:1px solid var(--mf-border);
        border-radius:12px;
        background:rgba(255,255,255,.04);
        color:#cbd5e1;
        transition:border-color .15s ease, background .15s ease;
      }
      .mf-file-picker:focus-within {
        border-color:rgba(167,139,250,.6);
        background:rgba(255,255,255,.06);
      }
      .mf-file-input {
        position:absolute;
        width:1px;
        height:1px;
        opacity:0;
        overflow:hidden;
        pointer-events:none;
      }
      .mf-file-button {
        align-self:stretch;
        display:flex;
        align-items:center;
        flex:0 0 auto;
        padding:9px 12px;
        border-right:1px solid var(--mf-border);
        background:rgba(255,255,255,.08);
        color:#f8fafc;
        font-size:12px;
        font-weight:700;
        cursor:pointer;
        user-select:none;
        transition:background .15s ease;
      }
      .mf-file-button:hover {
        background:rgba(124,92,255,.22);
      }
      .mf-file-input:focus-visible + .mf-file-button {
        outline:2px solid rgba(167,139,250,.75);
        outline-offset:-2px;
      }
      .mf-file-name {
        min-width:0;
        padding:9px 12px;
        overflow:hidden;
        color:#94a3b8;
        font-size:12px;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .mf-input::placeholder {
        color:#64748b;
      }
      .mf-btn,
      .mf-small-btn {
        cursor:pointer;
      }
      .mf-btn:hover,
      .mf-small-btn:hover {
        transform:translateY(-1px);
      }
      .mf-btn.primary {
        background:linear-gradient(180deg, rgba(124,92,255,.96), rgba(91,33,182,.96));
        border-color:rgba(167,139,250,.3);
        color:#fff;
      }
      .mf-btn.secondary {
        background:rgba(255,255,255,.04);
      }
      .mf-btn.danger,
      .mf-small-btn.danger {
        background:rgba(239,68,68,.16);
        border-color:rgba(239,68,68,.2);
        color:#fecaca;
      }
      .mf-card {
        background:linear-gradient(180deg,var(--mf-panel2),var(--mf-panel));
        border:1px solid var(--mf-border);
        border-radius:18px;
        padding:18px;
        display:flex;
        flex-direction:column;
        gap:10px;
        transition:border-color .18s ease, transform .18s ease;
      }
      .mf-card.mf-stat-card:hover {
        transform:translateY(-3px);
        border-color:var(--mf-accent);
      }
      .mf-card-title {
        font-size:11px;
        text-transform:uppercase;
        letter-spacing:.14em;
        color:#64748b;
      }
      .mf-stat-value {
        margin-top:4px;
        font-size:32px;
        font-weight:700;
        color:var(--mf-accent2);
      }
      .mf-toggle-grid {
        display:grid;
        grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));
        gap:10px;
      }
      .mf-toggle {
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        text-align:center;
        gap:6px;
        height:104px;
        padding:12px 10px;
        border-radius:16px;
        border:1px solid var(--mf-border);
        background:rgba(255,255,255,.03);
        cursor:pointer;
        position:relative;
        transition:border-color .15s ease, background .15s ease, transform .15s ease;
      }
      .mf-toggle:hover {
        transform:translateY(-2px);
        border-color:rgba(124,92,255,.4);
      }
      .mf-toggle:has(.mf-switch-hidden:checked) {
        background:rgba(124,92,255,.14);
        border-color:var(--mf-accent);
      }
      .mf-toggle-dot {
        position:absolute;
        top:10px;
        right:10px;
        width:8px;
        height:8px;
        border-radius:50%;
        background:#475569;
        transition:background .15s ease, box-shadow .15s ease;
      }
      .mf-toggle:has(.mf-switch-hidden:checked) .mf-toggle-dot {
        background:var(--mf-accent2);
        box-shadow:0 0 8px rgba(154,132,255,.7);
      }
      .mf-toggle-copy {
        display:flex;
        flex-direction:column;
        align-items:center;
        gap:2px;
        min-width:0;
      }
      .mf-toggle-copy strong {
        font-size:13px;
        color:#fff;
        font-weight:700;
      }
      .mf-toggle-copy span {
        font-size:10px;
        color:#94a3b8;
        line-height:1.35;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
        overflow:hidden;
      }
      .mf-switch-hidden {
        position:absolute;
        opacity:0;
        width:1px;
        height:1px;
        pointer-events:none;
      }
      .mf-grid-2 {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px;
      }
      .mf-status {
        min-height:16px;
        font-size:11px;
        color:#a78bfa;
      }
      .mf-logo-preview-wrap {
        display:flex;
        align-items:center;
        gap:12px;
      }
      .mf-logo-preview {
        width:52px;
        height:52px;
        border-radius:14px;
        border:1px solid var(--mf-border);
        background:rgba(255,255,255,.04);
        object-fit:cover;
        flex:0 0 auto;
      }
      .mf-muted {
        color:#94a3b8;
        font-size:11px;
        line-height:1.4;
      }
      .mf-meme-library-desc {
        margin-top:-2px;
      }
      .mf-meme-group {
        display:flex;
        flex-direction:column;
        gap:8px;
      }
      .mf-meme-group-title {
        font-size:11px;
        font-weight:700;
        color:#cbd5e1;
      }
      .mf-meme-id-grid {
        display:grid;
        grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));
        gap:10px;
      }
      .mf-meme-id {
        width:100%;
        min-width:0;
        display:flex;
        flex-direction:column;
        align-items:stretch;
        gap:8px;
        padding:8px;
        border-radius:14px;
        border:1px solid var(--mf-border);
        background:rgba(255,255,255,.03);
        color:#f8fafc;
        cursor:pointer;
        text-align:left;
        overflow:hidden;
        transition:background .15s ease, border-color .15s ease, transform .15s ease;
      }
      .mf-meme-id:hover {
        transform:translateY(-1px);
        border-color:rgba(124,92,255,.55);
        background:rgba(124,92,255,.1);
      }
      .mf-meme-id:focus-visible {
        outline:2px solid var(--mf-accent2);
        outline-offset:2px;
      }
      .mf-meme-preview {
        width:100%;
        height:92px;
        display:block;
        object-fit:contain;
        border-radius:10px;
        background:rgba(2,6,12,.7);
        pointer-events:none;
      }
      .mf-meme-id-row {
        min-width:0;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        padding:0 2px 2px;
      }
      .mf-meme-id code {
        min-width:0;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        color:#ddd6fe;
        font-family:ui-monospace,SFMono-Regular,Consolas,monospace !important;
        font-size:10px;
      }
      .mf-meme-id span {
        flex:0 0 auto;
        color:#94a3b8;
        font-size:9px;
      }
      .mf-meme-id.copied {
        border-color:#22c55e;
        background:rgba(34,197,94,.12);
      }
      .mf-meme-id.copied span {
        color:#86efac;
      }
      .mf-active-list {
        display:flex;
        flex-direction:column;
        gap:8px;
        max-height:220px;
        overflow:auto;
      }
      .mf-active-item {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:10px 12px;
        border-radius:12px;
        background:rgba(255,255,255,.03);
        border:1px solid var(--mf-border);
      }
      .mf-active-item span {
        font-size:12px;
        color:#e2e8f0;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .mf-small-btn {
        width:auto;
        padding:7px 10px;
        font-size:11px;
      }
      .mf-close {
        width:34px;
        height:34px;
        border-radius:12px;
        border:1px solid var(--mf-border);
        background:rgba(255,255,255,.04);
        color:#cbd5e1;
        font-size:18px;
        line-height:1;
        cursor:pointer;
        flex:0 0 auto;
      }
      .mf-tt-backdrop {
        position:absolute;
        inset:0;
        z-index:50;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:20px;
        background:rgba(2,6,12,.62);
        backdrop-filter:blur(5px);
      }
      .mf-tt-dialog {
        width:min(430px, 100%);
        padding:18px;
        border-radius:18px;
        border:1px solid var(--mf-border);
        background:rgba(16,20,29,.98);
        box-shadow:0 24px 70px rgba(0,0,0,.55);
      }
      .mf-tt-head {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin-bottom:14px;
      }
      .mf-tt-title {
        font-size:15px;
        font-weight:800;
        color:#f8fafc;
      }
      .mf-tt-row {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin:12px 0 8px;
        color:#cbd5e1;
        font-size:12px;
      }
      .mf-tt-scale-value {
        font-weight:800;
        color:#ddd6fe;
      }
      .mf-tt-range {
        width:100%;
        accent-color:var(--mf-accent);
      }
      .mf-tt-presets,
      .mf-tt-bind-actions {
        display:grid;
        grid-template-columns:repeat(3,1fr);
        gap:8px;
        margin-top:10px;
      }
      .mf-tt-bind-actions {
        grid-template-columns:1fr 1fr;
      }
      .mf-tt-bind-box {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:10px 12px;
        margin-top:8px;
        border-radius:12px;
        border:1px solid var(--mf-border);
        background:rgba(255,255,255,.035);
      }
      .mf-tt-bind-code {
        font-family:ui-monospace,SFMono-Regular,Consolas,monospace !important;
        color:#f8fafc;
        font-size:12px;
      }
      .mf-tt-hint {
        margin-top:12px;
        color:#94a3b8;
        font-size:10px;
        line-height:1.45;
      }
      .mf-tt-save {
        width:100%;
        margin-top:14px;
      }
      .mf-co-dialog {
        max-height:min(700px, calc(100vh - 80px));
        overflow:auto;
      }
      .mf-co-presets {
        display:grid;
        grid-template-columns:repeat(4,1fr);
        gap:8px;
        margin-top:10px;
      }
      .mf-co-presets .active {
        background:var(--mf-accent);
        border-color:var(--mf-accent);
        color:#fff;
      }
      .mf-co-controls {
        display:grid;
        gap:10px;
        margin-top:12px;
      }
      .mf-co-control {
        padding:10px 11px;
        border:1px solid var(--mf-border);
        border-radius:12px;
        background:rgba(255,255,255,.025);
      }
      .mf-co-control-head {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom:7px;
        color:#cbd5e1;
        font-size:11px;
      }
      .mf-co-number {
        width:90px;
        padding:6px 8px;
        border-radius:9px;
        border:1px solid var(--mf-border);
        background:rgba(255,255,255,.04);
        color:#f8fafc;
        font:inherit;
        text-align:right;
      }
      .mf-co-range {
        width:100%;
        accent-color:var(--mf-accent);
      }
      .mf-dc-dialog {
        max-height:80vh;
        overflow-y:auto;
      }
      .mf-dc-situations {
        display:grid;
        gap:8px;
        margin-top:12px;
      }
      .mf-dc-row {
        display:flex;
        align-items:center;
        gap:10px;
        padding:8px 11px;
        border:1px solid var(--mf-border);
        border-radius:10px;
        background:rgba(255,255,255,.025);
      }
      .mf-dc-label {
        flex:1;
        color:#cbd5e1;
        font-size:11px;
      }
      .mf-dc-preview {
        width:24px;
        height:24px;
        display:flex;
        align-items:center;
        justify-content:center;
        flex-shrink:0;
      }
      .mf-dc-preview img {
        width:20px;
        height:20px;
        image-rendering:pixelated;
        filter:drop-shadow(0 0 1px rgba(0,0,0,.8));
      }
      .mf-dc-select {
        width:130px;
        padding:5px 8px;
        border-radius:8px;
        border:1px solid var(--mf-border);
        background:rgba(255,255,255,.04);
        color:#f8fafc;
        font:inherit;
        font-size:11px;
      }
      #mf-language-select {
        width:auto;
        min-width:110px;
      }
      @media (max-width: 820px) {
        #mf-gui {
          width:calc(100vw - 16px);
          height:calc(100vh - 16px);
        }
        #mf-gui-shell {
          flex-direction:column;
        }
        #mf-gui-sidebar {
          width:100%;
          flex-direction:row;
          align-items:center;
          overflow-x:auto;
          overflow-y:hidden;
          border-right:none;
          border-bottom:1px solid var(--mf-border);
        }
        #mf-gui-sidebar-brand {
          padding:12px 14px;
        }
        .mf-nav-list {
          flex-direction:row;
          padding:6px 10px;
        }
        .mf-nav {
          border-left:none;
          border-bottom:3px solid transparent;
          white-space:nowrap;
        }
        .mf-nav.active {
          border-left-color:transparent;
          border-bottom-color:var(--mf-accent);
        }
        #mf-gui-topbar {
          padding:0 14px;
          flex-wrap:wrap;
          height:auto;
          gap:8px;
          padding-top:10px;
          padding-bottom:10px;
        }
        #mf-gui-search {
          max-width:none;
          margin-left:0;
          order:3;
          flex:1 1 100%;
        }
        #mf-gui-page {
          padding:18px;
        }
        .mf-grid-2 {
          grid-template-columns:1fr;
        }
        .mf-toggle-grid {
          grid-template-columns:1fr 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getModuleIndex() {
    return [
      { page: 'hud', key: 'keystrokes', title: t('keystrokes'), desc: t('keystrokesDesc') },
      { page: 'hud', key: 'fpsCounter', title: t('fpsCounter'), desc: t('fpsCounterDesc') },
      { page: 'hud', key: 'cpsCounter', title: t('cpsCounter'), desc: t('cpsCounterDesc') },
      { page: 'hud', key: 'pingCounter', title: t('pingCounter'), desc: t('pingCounterDesc') },
      { page: 'hud', key: 'dynamicCrosshair', title: 'Dynamic Crosshair', desc: 'Changes crosshair based on situation' },
      { page: 'render', key: 'rebrand', title: t('rebrand'), desc: t('rebrandDesc') },
      { page: 'render', key: 'titanTiny', title: t('titanTiny'), desc: t('titanTinyDesc') },
      { page: 'render', key: 'healthNameTags', title: t('healthNameTags'), desc: t('healthNameTagsDesc') },
      { page: 'render', key: 'distanceNameTags', title: t('distanceNameTags'), desc: t('distanceNameTagsDesc') },
      { page: 'render', key: 'patPat', title: t('patPat'), desc: t('patPatDesc') },
      { page: 'render', key: 'itemPhysics', title: t('itemPhysics'), desc: t('itemPhysicsDesc') },
      { page: 'render', key: 'noWeather', title: t('noWeather'), desc: t('noWeatherDesc') },
      { page: 'render', key: 'zoom', title: t('zoom'), desc: t('zoomDesc') },
      { page: 'render', key: 'cameraOverhaul', title: t('cameraOverhaul'), desc: t('cameraOverhaulDesc') },
      { page: 'world', key: 'antiAfk', title: t('antiAfk'), desc: t('antiAfkDesc') },
      { page: 'chat', key: 'chatVideos', title: t('chatVideos'), desc: t('chatVideosDesc') },
      { page: 'chat', key: 'chatLinks', title: t('chatLinks'), desc: t('chatLinksDesc') },
      { page: 'chat', key: 'chatMemes', title: t('chatMemes'), desc: t('chatMemesDesc') },
      { page: 'settings', key: 'discord', title: t('discordRedirect'), desc: t('discordRedirectDesc') },
      { page: 'settings', key: 'supportAds', title: t('supportAds'), desc: t('supportAdsDesc') }
    ];
  }

  function renderNavList() {
    return NAV_ITEMS.map(item => `
      <div class="mf-nav ${activePage === item.id && !searchQuery ? 'active' : ''}" data-page="${item.id}">
        <span class="mf-nav-icon">${item.icon}</span>
        <span>${t(item.labelKey)}</span>
      </div>
    `).join('');
  }

  function getPanelTemplate() {
    return `
      <div id="mf-gui-shell">
        <div id="mf-gui-sidebar">
          <div id="mf-gui-sidebar-brand">
            <img class="mf-icon" src="${currentLogo}" alt="MiniFeather">
            <strong>${t('title')}</strong>
          </div>
          <div class="mf-nav-list">${renderNavList()}</div>
        </div>
        <div id="mf-gui-content">
          <div id="mf-gui-topbar">
            <h2 id="mf-gui-page-title"></h2>
            <input id="mf-gui-search" type="text" placeholder="${t('searchPlaceholder')}" value="${searchQuery.replace(/"/g, '&quot;')}">
            <div class="mf-topbar-actions">
              <select id="mf-language-select" class="mf-select">
                <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
                <option value="es" ${settings.language === 'es' ? 'selected' : ''}>Español</option>
                <option value="ja" ${settings.language === 'ja' ? 'selected' : ''}>日本語</option>
                <option value="it" ${settings.language === 'it' ? 'selected' : ''}>Italiano</option>
              </select>
              <button id="mf-gui-close" class="mf-close">×</button>
            </div>
          </div>
          <div id="mf-gui-page"></div>
        </div>
      </div>
    `;
  }

  function renderToggle(key, title, description) {
    return `
      <label class="mf-toggle" data-key="${key}">
        <span class="mf-toggle-dot"></span>
        <span class="mf-toggle-copy">
          <strong>${title}</strong>
          <span>${description}</span>
        </span>
        <input type="checkbox" class="mf-switch-hidden" ${guiSettings[key] ? 'checked' : ''}>
      </label>
    `;
  }

  function sendTitanTinyConfig(enabled = settings.titanTiny) {
    const detail = JSON.stringify({
      enabled: !!enabled,
      scale: Math.max(0.20, Math.min(5.00, Number(settings.titanTinyScale) || 1)),
      bind: String(settings.titanTinyBind || '')
    });
    document.dispatchEvent(new CustomEvent('minifeather:titantiny-config', { detail }));
  }

  function sendHealthNameTagsConfig(enabled = settings.healthNameTags) {
    document.dispatchEvent(new CustomEvent('minifeather:healthnametags-config', {
      detail: JSON.stringify({ enabled: !!enabled })
    }));
  }

  function initHealthNameTagsModule() {
    registerModule('healthNameTags', () => createLifecycle({
      enable() {
        sendHealthNameTagsConfig(true);
      },
      disable() {
        sendHealthNameTagsConfig(false);
      },
      refresh() {
        sendHealthNameTagsConfig(MODULES.get('healthNameTags')?.enabled === true);
      },
      destroy() {
        sendHealthNameTagsConfig(false);
      }
    }));
  }

  function sendDistanceNameTagsConfig(enabled = settings.distanceNameTags) {
    document.dispatchEvent(new CustomEvent('minifeather:distancenametags-config', {
      detail: JSON.stringify({
        enabled: !!enabled,
        unit: t('distanceUnit')
      })
    }));
  }

  function initDistanceNameTagsModule() {
    registerModule('distanceNameTags', () => createLifecycle({
      enable() {
        sendDistanceNameTagsConfig(true);
      },
      disable() {
        sendDistanceNameTagsConfig(false);
      },
      refresh() {
        sendDistanceNameTagsConfig(MODULES.get('distanceNameTags')?.enabled === true);
      },
      destroy() {
        sendDistanceNameTagsConfig(false);
      }
    }));
  }

  function sendPatPatConfig(enabled = settings.patPat) {
    settings.patPatValues = clampPatPatValues(settings.patPatValues);
    settings.patPatPreset = detectPatPatPreset(settings.patPatValues);
    guiSettings.patPatValues = clonePatPatValues(settings.patPatValues);
    guiSettings.patPatPreset = settings.patPatPreset;

    document.dispatchEvent(new CustomEvent('minifeather:patpat-config', {
      detail: JSON.stringify({
        enabled: !!enabled,
        textureUrl: chrome.runtime.getURL('assets/patpat.png'),
        soundUrls: [
          chrome.runtime.getURL('assets/pat.ogg'),
          chrome.runtime.getURL('assets/pat1.ogg'),
          chrome.runtime.getURL('assets/pat2.ogg')
        ],
        options: clonePatPatValues(settings.patPatValues)
      })
    }));
  }

  function initPatPatModule() {
    registerModule('patPat', () => createLifecycle({
      enable() {
        sendPatPatConfig(true);
      },
      disable() {
        sendPatPatConfig(false);
      },
      refresh() {
        sendPatPatConfig(MODULES.get('patPat')?.enabled === true);
      },
      destroy() {
        sendPatPatConfig(false);
      }
    }));
  }

  function sendItemPhysicsConfig(enabled = settings.itemPhysics) {
    document.dispatchEvent(new CustomEvent('minifeather:item-physics-config', {
      detail: JSON.stringify({ enabled: !!enabled })
    }));
  }

  function initItemPhysicsModule() {
    registerModule('itemPhysics', () => createLifecycle({
      enable() {
        sendItemPhysicsConfig(true);
      },
      disable() {
        sendItemPhysicsConfig(false);
      },
      refresh() {
        sendItemPhysicsConfig(MODULES.get('itemPhysics')?.enabled === true);
      },
      destroy() {
        sendItemPhysicsConfig(false);
      }
    }));
  }

  function sendNoWeatherConfig(enabled = settings.noWeather) {
    document.dispatchEvent(new CustomEvent('minifeather:no-weather-config', {
      detail: JSON.stringify({ enabled: !!enabled })
    }));
  }

  function initNoWeatherModule() {
    registerModule('noWeather', () => createLifecycle({
      enable() {
        sendNoWeatherConfig(true);
      },
      disable() {
        sendNoWeatherConfig(false);
      },
      refresh() {
        sendNoWeatherConfig(MODULES.get('noWeather')?.enabled === true);
      },
      destroy() {
        sendNoWeatherConfig(false);
      }
    }));
  }

  function sendAntiAfkConfig(enabled = settings.antiAfk) {
    settings.antiAfkDelay = clampAntiAfkDelay(settings.antiAfkDelay);
    guiSettings.antiAfkDelay = settings.antiAfkDelay;

    document.dispatchEvent(new CustomEvent('minifeather:anti-afk-config', {
      detail: JSON.stringify({
        enabled: !!enabled,
        delaySeconds: settings.antiAfkDelay
      })
    }));
  }

  function initAntiAfkModule() {
    registerModule('antiAfk', () => createLifecycle({
      enable() {
        sendAntiAfkConfig(true);
      },
      disable() {
        sendAntiAfkConfig(false);
      },
      refresh() {
        sendAntiAfkConfig(MODULES.get('antiAfk')?.enabled === true);
      },
      destroy() {
        sendAntiAfkConfig(false);
      }
    }));
  }

  function closeAntiAfkSettings() {
    panel?.querySelector('.mf-antiafk-backdrop')?.remove();
  }

  function openAntiAfkSettings() {
    if (!panel) return;
    closeAntiAfkSettings();

    settings.antiAfkDelay = clampAntiAfkDelay(settings.antiAfkDelay);
    guiSettings.antiAfkDelay = settings.antiAfkDelay;

    const backdrop = document.createElement('div');
    backdrop.className = 'mf-tt-backdrop mf-antiafk-backdrop';

    backdrop.innerHTML = `
      <div class="mf-tt-dialog" role="dialog" aria-modal="true">
        <div class="mf-tt-head">
          <div class="mf-tt-title">${t('antiAfkSettings')}</div>
          <button type="button" class="mf-close" data-aa-close>×</button>
        </div>

        <div class="mf-tt-row">
          <span>${t('antiAfkDelay')}</span>
          <span class="mf-tt-scale-value" data-aa-delay-value>${formatAntiAfkDelay(settings.antiAfkDelay)}</span>
        </div>

        <input
          class="mf-tt-range"
          data-aa-delay
          type="range"
          min="5"
          max="150"
          step="5"
          value="${settings.antiAfkDelay}"
        >

        <div class="mf-tt-presets">
          <button type="button" class="mf-btn secondary" data-aa-preset="5">5s</button>
          <button type="button" class="mf-btn secondary" data-aa-preset="30">30s</button>
          <button type="button" class="mf-btn secondary" data-aa-preset="60">1m</button>
        </div>
        <div class="mf-tt-presets">
          <button type="button" class="mf-btn secondary" data-aa-preset="90">1m 30s</button>
          <button type="button" class="mf-btn secondary" data-aa-preset="120">2m</button>
          <button type="button" class="mf-btn secondary" data-aa-preset="150">2m 30s</button>
        </div>

        <div class="mf-tt-hint">${t('antiAfkDelayHint')}</div>
        <div class="mf-tt-hint">${t('antiAfkRangeHint')}</div>
        <button type="button" class="mf-btn primary mf-tt-save" data-aa-save>${t('antiAfkSave')}</button>
      </div>
    `;

    panel.appendChild(backdrop);

    const slider = backdrop.querySelector('[data-aa-delay]');
    const valueLabel = backdrop.querySelector('[data-aa-delay-value]');

    const applyDelay = value => {
      const next = clampAntiAfkDelay(value);
      settings.antiAfkDelay = next;
      guiSettings.antiAfkDelay = next;
      if (slider) slider.value = String(next);
      if (valueLabel) valueLabel.textContent = formatAntiAfkDelay(next);
      backdrop.querySelectorAll('[data-aa-preset]').forEach(button => {
        button.classList.toggle('active', Number(button.dataset.aaPreset) === next);
      });
      saveSettings();
      sendAntiAfkConfig(settings.antiAfk);
    };

    slider?.addEventListener('input', () => applyDelay(slider.value));
    backdrop.querySelectorAll('[data-aa-preset]').forEach(button => {
      button.addEventListener('click', () => applyDelay(button.dataset.aaPreset));
    });

    backdrop.querySelector('[data-aa-close]')?.addEventListener('click', closeAntiAfkSettings);
    backdrop.querySelector('[data-aa-save]')?.addEventListener('click', () => {
      applyDelay(slider?.value ?? settings.antiAfkDelay);
      closeAntiAfkSettings();
    });
    backdrop.addEventListener('mousedown', event => {
      if (event.target === backdrop) closeAntiAfkSettings();
    });

    applyDelay(settings.antiAfkDelay);
  }

  function closePatPatSettings() {
    if (patPatSettingsCleanup) {
      const cleanup = patPatSettingsCleanup;
      patPatSettingsCleanup = null;
      cleanup();
      return;
    }
    panel?.querySelector('.mf-patpat-backdrop')?.remove();
  }

  function openPatPatSettings() {
    if (!panel) return;
    closePatPatSettings();

    settings.patPatValues = clampPatPatValues(settings.patPatValues);
    settings.patPatPreset = detectPatPatPreset(settings.patPatValues);

    const backdrop = document.createElement('div');
    backdrop.className = 'mf-tt-backdrop mf-patpat-backdrop';

    const renderControl = (key, limit) => {
      const value = Number(settings.patPatValues[key]);
      const shown = value.toFixed(limit.digits);
      return `
        <div class="mf-co-control" data-pp-control="${key}">
          <div class="mf-co-control-head">
            <span>${t(limit.label)}</span>
            <input class="mf-co-number" data-pp-number="${key}" type="number" min="${limit.min}" max="${limit.max}" step="${limit.step}" value="${shown}">
          </div>
          <input class="mf-co-range" data-pp-range="${key}" type="range" min="${limit.min}" max="${limit.max}" step="${limit.step}" value="${value}">
        </div>
      `;
    };

    const boolText = value => value ? t('patPatOn') : t('patPatOff');

    backdrop.innerHTML = `
      <div class="mf-tt-dialog mf-co-dialog" role="dialog" aria-modal="true">
        <div class="mf-tt-head">
          <div class="mf-tt-title">${t('patPatSettings')}</div>
          <button type="button" class="mf-close" data-pp-close>×</button>
        </div>

        <div class="mf-tt-row">
          <span>${t('patPatStyle')}</span>
          <span class="mf-tt-scale-value" data-pp-profile-label></span>
        </div>

        <div class="mf-co-presets">
          <button type="button" class="mf-btn secondary" data-pp-preset="soft">${t('patPatSoft')}</button>
          <button type="button" class="mf-btn secondary" data-pp-preset="normal">${t('patPatNormal')}</button>
          <button type="button" class="mf-btn secondary" data-pp-preset="strong">${t('patPatStrong')}</button>
          <button type="button" class="mf-btn secondary" data-pp-preset="extreme">${t('patPatExtreme')}</button>
        </div>

        <div class="mf-co-controls">
          ${Object.entries(PATPAT_LIMITS).map(([key, limit]) => renderControl(key, limit)).join('')}
        </div>

        <div class="mf-tt-bind-box">
          <span>${t('patPatRandomSounds')}</span>
          <button type="button" class="mf-btn secondary" data-pp-random></button>
        </div>

        <div class="mf-tt-bind-box">
          <span>${t('patPatNameTagFollow')}</span>
          <button type="button" class="mf-btn secondary" data-pp-nametag></button>
        </div>

        <div class="mf-tt-hint">${t('patPatSettingsHint')}</div>
        <button type="button" class="mf-btn primary mf-tt-save" data-pp-save>${t('patPatSave')}</button>
      </div>
    `;

    panel.appendChild(backdrop);

    const profileLabel = backdrop.querySelector('[data-pp-profile-label]');
    const randomButton = backdrop.querySelector('[data-pp-random]');
    const nameTagButton = backdrop.querySelector('[data-pp-nametag]');

    const profileText = profile => {
      if (profile === 'soft') return t('patPatSoft');
      if (profile === 'normal') return t('patPatNormal');
      if (profile === 'strong') return t('patPatStrong');
      if (profile === 'extreme') return t('patPatExtreme');
      return t('patPatCustom');
    };

    const syncProfileUI = () => {
      const profile = detectPatPatPreset(settings.patPatValues);
      settings.patPatPreset = profile;
      guiSettings.patPatPreset = profile;
      if (profileLabel) profileLabel.textContent = profileText(profile);
      backdrop.querySelectorAll('[data-pp-preset]').forEach(button => {
        button.classList.toggle('active', button.dataset.ppPreset === profile);
      });
    };

    const syncBooleanUI = () => {
      if (randomButton) {
        randomButton.textContent = boolText(settings.patPatValues.randomSounds);
        randomButton.classList.toggle('active', settings.patPatValues.randomSounds === true);
      }
      if (nameTagButton) {
        nameTagButton.textContent = boolText(settings.patPatValues.nameTagFollow);
        nameTagButton.classList.toggle('active', settings.patPatValues.nameTagFollow === true);
      }
    };

    const syncControlUI = () => {
      for (const [key, limit] of Object.entries(PATPAT_LIMITS)) {
        const value = Number(settings.patPatValues[key]);
        const range = backdrop.querySelector(`[data-pp-range="${key}"]`);
        const number = backdrop.querySelector(`[data-pp-number="${key}"]`);
        if (range) range.value = String(value);
        if (number) number.value = value.toFixed(limit.digits);
      }
      syncProfileUI();
      syncBooleanUI();
    };

    const applyValue = (key, raw, persist = false) => {
      const limit = PATPAT_LIMITS[key];
      if (!limit) return;
      const value = Number(raw);
      if (!Number.isFinite(value)) return;

      settings.patPatValues = clampPatPatValues({
        ...settings.patPatValues,
        [key]: value
      });
      guiSettings.patPatValues = clonePatPatValues(settings.patPatValues);
      settings.patPatPreset = detectPatPatPreset(settings.patPatValues);
      guiSettings.patPatPreset = settings.patPatPreset;

      const normalized = Number(settings.patPatValues[key]);
      const range = backdrop.querySelector(`[data-pp-range="${key}"]`);
      const number = backdrop.querySelector(`[data-pp-number="${key}"]`);
      if (range) range.value = String(normalized);
      if (number) number.value = normalized.toFixed(limit.digits);

      syncProfileUI();
      sendPatPatConfig(settings.patPat);
      if (persist) saveSettings();
    };

    backdrop.querySelectorAll('[data-pp-range]').forEach(input => {
      input.addEventListener('input', () => applyValue(input.dataset.ppRange, input.value, false));
      input.addEventListener('change', () => applyValue(input.dataset.ppRange, input.value, true));
    });

    backdrop.querySelectorAll('[data-pp-number]').forEach(input => {
      input.addEventListener('change', () => applyValue(input.dataset.ppNumber, input.value, true));
      input.addEventListener('keydown', event => {
        if (event.code !== 'Enter') return;
        event.preventDefault();
        applyValue(input.dataset.ppNumber, input.value, true);
      });
    });

    backdrop.querySelectorAll('[data-pp-preset]').forEach(button => {
      button.addEventListener('click', () => {
        const preset = button.dataset.ppPreset;
        if (!PATPAT_PRESETS[preset]) return;
        settings.patPatValues = clampPatPatValues({
          ...settings.patPatValues,
          ...PATPAT_PRESETS[preset]
        });
        guiSettings.patPatValues = clonePatPatValues(settings.patPatValues);
        settings.patPatPreset = preset;
        guiSettings.patPatPreset = preset;
        syncControlUI();
        saveSettings();
        sendPatPatConfig(settings.patPat);
      });
    });

    randomButton?.addEventListener('click', () => {
      settings.patPatValues.randomSounds = !settings.patPatValues.randomSounds;
      guiSettings.patPatValues = clonePatPatValues(settings.patPatValues);
      syncBooleanUI();
      saveSettings();
      sendPatPatConfig(settings.patPat);
    });

    nameTagButton?.addEventListener('click', () => {
      settings.patPatValues.nameTagFollow = !settings.patPatValues.nameTagFollow;
      guiSettings.patPatValues = clonePatPatValues(settings.patPatValues);
      syncBooleanUI();
      saveSettings();
      sendPatPatConfig(settings.patPat);
    });

    syncControlUI();

    const cleanup = () => {
      saveSettings();
      backdrop.remove();
      if (patPatSettingsCleanup === cleanup) patPatSettingsCleanup = null;
    };

    patPatSettingsCleanup = cleanup;

    backdrop.querySelector('[data-pp-close]')?.addEventListener('click', cleanup);
    backdrop.querySelector('[data-pp-save]')?.addEventListener('click', cleanup);
    backdrop.addEventListener('mousedown', event => {
      if (event.target === backdrop) cleanup();
    });
  }

  function setTitanTinyBindingCapture(active) {
    document.dispatchEvent(new CustomEvent('minifeather:titantiny-binding', {
      detail: JSON.stringify({ active: !!active })
    }));
  }

  function initTitanTinyModule() {
    registerModule('titanTiny', () => createLifecycle({
      enable() {
        sendTitanTinyConfig(true);
      },
      disable() {
        sendTitanTinyConfig(false);
      },
      refresh() {
        sendTitanTinyConfig(MODULES.get('titanTiny')?.enabled === true);
      },
      destroy() {
        sendTitanTinyConfig(false);
      }
    }));

    document.addEventListener('minifeather:titantiny-state', event => {
      let state;
      try {
        state = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      } catch (_) {
        return;
      }
      if (!state || typeof state !== 'object') return;

      let changed = false;
      if (typeof state.enabled === 'boolean' && settings.titanTiny !== state.enabled) {
        settings.titanTiny = state.enabled;
        guiSettings.titanTiny = state.enabled;
        setModuleEnabled('titanTiny', state.enabled);
        changed = true;
      }
      if (Number.isFinite(Number(state.scale))) {
        const scale = Math.max(0.20, Math.min(5.00, Number(state.scale)));
        if (Math.abs((Number(settings.titanTinyScale) || 1) - scale) > 0.0001) {
          settings.titanTinyScale = scale;
          guiSettings.titanTinyScale = scale;
          changed = true;
        }
      }
      if (typeof state.bind === 'string' && settings.titanTinyBind !== state.bind) {
        settings.titanTinyBind = state.bind;
        guiSettings.titanTinyBind = state.bind;
        changed = true;
      }

      if (changed) saveSettings();
      if (panel && activePage === 'render' && !searchQuery.trim()) renderCurrentPageContent();
      if (activePage === 'dashboard') updateDashboardStats();
    }, { signal: runtimeController?.signal });
  }

  function closeTitanTinySettings() {
    if (titanTinySettingsCleanup) {
      const cleanup = titanTinySettingsCleanup;
      titanTinySettingsCleanup = null;
      cleanup();
      return;
    }
    setTitanTinyBindingCapture(false);
    panel?.querySelector('.mf-tt-backdrop')?.remove();
  }

  function openTitanTinySettings() {
    if (!panel) return;
    closeTitanTinySettings();

    const backdrop = document.createElement('div');
    backdrop.className = 'mf-tt-backdrop';
    const scale = Math.max(0.20, Math.min(5.00, Number(settings.titanTinyScale) || 1));
    const bind = String(settings.titanTinyBind || '');

    backdrop.innerHTML = `
      <div class="mf-tt-dialog" role="dialog" aria-modal="true">
        <div class="mf-tt-head">
          <div class="mf-tt-title">${t('titanTinySettings')}</div>
          <button type="button" class="mf-close" data-tt-close>×</button>
        </div>
        <div class="mf-tt-row">
          <span>${t('titanTinyScale')}</span>
          <span class="mf-tt-scale-value" data-tt-scale-value>${scale.toFixed(2)}×</span>
        </div>
        <input class="mf-tt-range" data-tt-scale type="range" min="0.20" max="5.00" step="0.01" value="${scale}">
        <input class="mf-input" data-tt-scale-number type="number" min="0.20" max="5.00" step="0.01" value="${scale.toFixed(2)}">
        <div class="mf-tt-presets">
          <button type="button" class="mf-btn secondary" data-tt-preset="0.35">${t('titanTinyTiny')}</button>
          <button type="button" class="mf-btn secondary" data-tt-preset="1">${t('titanTinyNormal')}</button>
          <button type="button" class="mf-btn secondary" data-tt-preset="3">${t('titanTinyTitan')}</button>
        </div>
        <div class="mf-tt-row"><span>${t('titanTinyBind')}</span></div>
        <div class="mf-tt-bind-box">
          <span class="mf-muted">${t('titanTinyBind')}</span>
          <span class="mf-tt-bind-code" data-tt-bind-code>${bind || t('titanTinyNoBind')}</span>
        </div>
        <div class="mf-tt-bind-actions">
          <button type="button" class="mf-btn secondary" data-tt-bind>${t('titanTinySetBind')}</button>
          <button type="button" class="mf-btn danger" data-tt-unbind>${t('titanTinyRemoveBind')}</button>
        </div>
        <div class="mf-tt-hint">${t('titanTinyAlwaysSync')}</div>
        <button type="button" class="mf-btn primary mf-tt-save" data-tt-save>${t('titanTinySave')}</button>
      </div>
    `;

    panel.appendChild(backdrop);

    const slider = backdrop.querySelector('[data-tt-scale]');
    const scaleNumber = backdrop.querySelector('[data-tt-scale-number]');
    const scaleValue = backdrop.querySelector('[data-tt-scale-value]');
    const bindCode = backdrop.querySelector('[data-tt-bind-code]');
    const bindButton = backdrop.querySelector('[data-tt-bind]');
    let binding = false;

    const applyScale = value => {
      const next = Math.max(0.20, Math.min(5.00, Number(value) || 1));
      settings.titanTinyScale = next;
      guiSettings.titanTinyScale = next;
      if (slider) slider.value = String(next);
      if (scaleNumber) scaleNumber.value = next.toFixed(2);
      if (scaleValue) scaleValue.textContent = `${next.toFixed(2)}×`;
      saveSettings();
      sendTitanTinyConfig(settings.titanTiny);
    };

    slider?.addEventListener('input', event => applyScale(event.target.value));
    scaleNumber?.addEventListener('change', event => applyScale(event.target.value));
    scaleNumber?.addEventListener('keydown', event => {
      if (event.code !== 'Enter') return;
      event.preventDefault();
      applyScale(event.target.value);
    });
    backdrop.querySelectorAll('[data-tt-preset]').forEach(button => {
      button.addEventListener('click', () => applyScale(button.dataset.ttPreset));
    });

    const stopBinding = () => {
      binding = false;
      setTitanTinyBindingCapture(false);
      if (bindButton) bindButton.textContent = t('titanTinySetBind');
    };

    bindButton?.addEventListener('click', () => {
      binding = true;
      setTitanTinyBindingCapture(true);
      bindButton.textContent = t('titanTinyListening');
    });

    backdrop.querySelector('[data-tt-unbind]')?.addEventListener('click', () => {
      stopBinding();
      settings.titanTinyBind = '';
      guiSettings.titanTinyBind = '';
      if (bindCode) bindCode.textContent = t('titanTinyNoBind');
      saveSettings();
      sendTitanTinyConfig(settings.titanTiny);
    });

    const keyHandler = event => {
      if (!binding) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.code === 'Escape' || event.code === 'Backspace' || event.code === 'Delete') {
        settings.titanTinyBind = '';
        guiSettings.titanTinyBind = '';
        if (bindCode) bindCode.textContent = t('titanTinyNoBind');
      } else {
        settings.titanTinyBind = event.code;
        guiSettings.titanTinyBind = event.code;
        if (bindCode) bindCode.textContent = event.code;
      }

      saveSettings();
      sendTitanTinyConfig(settings.titanTiny);
      stopBinding();
    };

    document.addEventListener('keydown', keyHandler, { capture: true, once: false });

    const cleanup = () => {
      stopBinding();
      document.removeEventListener('keydown', keyHandler, true);
      backdrop.remove();
      if (titanTinySettingsCleanup === cleanup) titanTinySettingsCleanup = null;
    };
    titanTinySettingsCleanup = cleanup;

    backdrop.querySelector('[data-tt-close]')?.addEventListener('click', cleanup);
    backdrop.querySelector('[data-tt-save]')?.addEventListener('click', cleanup);
    backdrop.addEventListener('mousedown', event => {
      if (event.target === backdrop) cleanup();
    });
  }


  function sendZoomConfig(enabled = settings.zoom) {
    const detail = JSON.stringify({
      enabled: !!enabled,
      bind: String(settings.zoomBind || '')
    });
    document.dispatchEvent(new CustomEvent('minifeather:zoom-config', { detail }));
  }

  function setZoomBindingCapture(active) {
    document.dispatchEvent(new CustomEvent('minifeather:zoom-binding', {
      detail: JSON.stringify({ active: !!active })
    }));
  }

  function initZoomModule() {
    registerModule('zoom', () => createLifecycle({
      enable() {
        sendZoomConfig(true);
      },
      disable() {
        sendZoomConfig(false);
      },
      refresh() {
        sendZoomConfig(MODULES.get('zoom')?.enabled === true);
      },
      destroy() {
        sendZoomConfig(false);
      }
    }));

    document.addEventListener('minifeather:zoom-state', event => {
      let state;
      try {
        state = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      } catch (_) {
        return;
      }
      if (!state || typeof state !== 'object') return;

      let changed = false;
      if (typeof state.enabled === 'boolean' && settings.zoom !== state.enabled) {
        settings.zoom = state.enabled;
        guiSettings.zoom = state.enabled;
        setModuleEnabled('zoom', state.enabled);
        changed = true;
      }
      if (typeof state.bind === 'string' && settings.zoomBind !== state.bind) {
        settings.zoomBind = state.bind;
        guiSettings.zoomBind = state.bind;
        changed = true;
      }

      if (changed) saveSettings();
      if (panel && activePage === 'render' && !searchQuery.trim()) renderCurrentPageContent();
      if (activePage === 'dashboard') updateDashboardStats();
    }, { signal: runtimeController?.signal });
  }

  function closeZoomSettings() {
    if (zoomSettingsCleanup) {
      const cleanup = zoomSettingsCleanup;
      zoomSettingsCleanup = null;
      cleanup();
      return;
    }
    setZoomBindingCapture(false);
    panel?.querySelector('.mf-zoom-backdrop')?.remove();
  }

  function openZoomSettings() {
    if (!panel) return;
    closeZoomSettings();

    const backdrop = document.createElement('div');
    backdrop.className = 'mf-tt-backdrop mf-zoom-backdrop';
    const bind = String(settings.zoomBind || '');

    backdrop.innerHTML = `
      <div class="mf-tt-dialog" role="dialog" aria-modal="true">
        <div class="mf-tt-head">
          <div class="mf-tt-title">${t('zoomSettings')}</div>
          <button type="button" class="mf-close" data-zoom-close>×</button>
        </div>
        <div class="mf-tt-row"><span>${t('zoomBind')}</span></div>
        <div class="mf-tt-bind-box">
          <span class="mf-muted">${t('zoomBind')}</span>
          <span class="mf-tt-bind-code" data-zoom-bind-code>${bind || t('zoomNoBind')}</span>
        </div>
        <div class="mf-tt-bind-actions">
          <button type="button" class="mf-btn secondary" data-zoom-bind>${t('zoomSetBind')}</button>
          <button type="button" class="mf-btn danger" data-zoom-unbind>${t('zoomRemoveBind')}</button>
        </div>
        <div class="mf-tt-hint">${t('zoomHint')}</div>
        <button type="button" class="mf-btn primary mf-tt-save" data-zoom-save>${t('zoomSave')}</button>
      </div>
    `;

    panel.appendChild(backdrop);

    const bindCode = backdrop.querySelector('[data-zoom-bind-code]');
    const bindButton = backdrop.querySelector('[data-zoom-bind]');
    let binding = false;

    const stopBinding = () => {
      binding = false;
      setZoomBindingCapture(false);
      if (bindButton) bindButton.textContent = t('zoomSetBind');
    };

    bindButton?.addEventListener('click', () => {
      binding = true;
      setZoomBindingCapture(true);
      bindButton.textContent = t('zoomListening');
    });

    backdrop.querySelector('[data-zoom-unbind]')?.addEventListener('click', () => {
      stopBinding();
      settings.zoomBind = '';
      guiSettings.zoomBind = '';
      if (bindCode) bindCode.textContent = t('zoomNoBind');
      saveSettings();
      sendZoomConfig(settings.zoom);
    });

    const keyHandler = event => {
      if (!binding) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.code === 'Escape' || event.code === 'Backspace' || event.code === 'Delete') {
        settings.zoomBind = '';
        guiSettings.zoomBind = '';
        if (bindCode) bindCode.textContent = t('zoomNoBind');
      } else {
        settings.zoomBind = event.code;
        guiSettings.zoomBind = event.code;
        if (bindCode) bindCode.textContent = event.code;
      }

      saveSettings();
      sendZoomConfig(settings.zoom);
      stopBinding();
    };

    document.addEventListener('keydown', keyHandler, { capture: true, once: false });

    const cleanup = () => {
      stopBinding();
      document.removeEventListener('keydown', keyHandler, true);
      backdrop.remove();
      if (zoomSettingsCleanup === cleanup) zoomSettingsCleanup = null;
    };
    zoomSettingsCleanup = cleanup;

    backdrop.querySelector('[data-zoom-close]')?.addEventListener('click', cleanup);
    backdrop.querySelector('[data-zoom-save]')?.addEventListener('click', cleanup);
    backdrop.addEventListener('mousedown', event => {
      if (event.target === backdrop) cleanup();
    });
  }

  function sendCameraOverhaulConfig(enabled = settings.cameraOverhaul) {
    const values = clampCameraValues(settings.cameraOverhaulValues);
    const preset = detectCameraPreset(values);
    settings.cameraOverhaulValues = values;
    settings.cameraOverhaulPreset = preset;
    guiSettings.cameraOverhaulValues = cloneCameraValues(values);
    guiSettings.cameraOverhaulPreset = preset;

    document.dispatchEvent(new CustomEvent('minifeather:cameraoverhaul-config', {
      detail: JSON.stringify({
        enabled: !!enabled,
        bind: String(settings.cameraOverhaulBind || ''),
        preset,
        values
      })
    }));
  }

  function setCameraOverhaulBindingCapture(active) {
    document.dispatchEvent(new CustomEvent('minifeather:cameraoverhaul-binding', {
      detail: JSON.stringify({ active: !!active })
    }));
  }

  function initCameraOverhaulModule() {
    registerModule('cameraOverhaul', () => createLifecycle({
      enable() {
        sendCameraOverhaulConfig(true);
      },
      disable() {
        sendCameraOverhaulConfig(false);
      },
      refresh() {
        sendCameraOverhaulConfig(MODULES.get('cameraOverhaul')?.enabled === true);
      },
      destroy() {
        sendCameraOverhaulConfig(false);
      }
    }));

    document.addEventListener('minifeather:cameraoverhaul-state', event => {
      let next;
      try {
        next = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      } catch (_) {
        return;
      }
      if (!next || typeof next !== 'object') return;

      let changed = false;

      if (typeof next.enabled === 'boolean' && settings.cameraOverhaul !== next.enabled) {
        settings.cameraOverhaul = next.enabled;
        guiSettings.cameraOverhaul = next.enabled;
        setModuleEnabled('cameraOverhaul', next.enabled);
        changed = true;
      }

      if (typeof next.bind === 'string' && settings.cameraOverhaulBind !== next.bind) {
        settings.cameraOverhaulBind = next.bind;
        guiSettings.cameraOverhaulBind = next.bind;
        changed = true;
      }

      if (next.values && typeof next.values === 'object') {
        const values = clampCameraValues(next.values);
        const previous = clampCameraValues(settings.cameraOverhaulValues);
        const differs = Object.keys(CAMERA_OVERHAUL_LIMITS).some(key =>
          Math.abs(Number(values[key]) - Number(previous[key])) > 0.0000001
        );
        if (differs) {
          settings.cameraOverhaulValues = values;
          guiSettings.cameraOverhaulValues = cloneCameraValues(values);
          changed = true;
        }
        const preset = detectCameraPreset(values);
        if (settings.cameraOverhaulPreset !== preset) {
          settings.cameraOverhaulPreset = preset;
          guiSettings.cameraOverhaulPreset = preset;
          changed = true;
        }
      }

      if (changed) saveSettings();
      if (panel && activePage === 'render' && !searchQuery.trim()) renderCurrentPageContent();
      if (activePage === 'dashboard') updateDashboardStats();
    }, { signal: runtimeController?.signal });
  }

  function closeCameraOverhaulSettings() {
    if (cameraOverhaulSettingsCleanup) {
      const cleanup = cameraOverhaulSettingsCleanup;
      cameraOverhaulSettingsCleanup = null;
      cleanup();
      return;
    }
    setCameraOverhaulBindingCapture(false);
    panel?.querySelector('.mf-camera-overhaul-backdrop')?.remove();
  }

  function sendDynamicCrosshairConfig(enabled = settings.dynamicCrosshair) {
    const detail = JSON.stringify({
      enabled: !!enabled,
      size: Number(settings.dynamicCrosshairSize) || 28,
      crosshairs: settings.dynamicCrosshairMap || {},
      assetBaseUrl: chrome.runtime.getURL('assets/crosshair/')
    });
    document.dispatchEvent(new CustomEvent('minifeather:dynamiccrosshair-config', { detail }));
  }

  function initDynamicCrosshairModule() {
    registerModule('dynamicCrosshair', () => createLifecycle({
      enable() { sendDynamicCrosshairConfig(true); },
      disable() { sendDynamicCrosshairConfig(false); },
      refresh() { sendDynamicCrosshairConfig(MODULES.get('dynamicCrosshair')?.enabled === true); },
      destroy() { sendDynamicCrosshairConfig(false); }
    }));

    document.addEventListener('minifeather:dynamiccrosshair-state', event => {
      let next;
      try {
        next = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      } catch (_) { return; }
      if (!next || typeof next !== 'object') return;

      let changed = false;

      if (typeof next.enabled === 'boolean' && settings.dynamicCrosshair !== next.enabled) {
        settings.dynamicCrosshair = next.enabled;
        guiSettings.dynamicCrosshair = next.enabled;
        setModuleEnabled('dynamicCrosshair', next.enabled);
        changed = true;
      }

      if (changed) saveSettings();
      if (panel && activePage === 'render' && !searchQuery.trim()) renderCurrentPageContent();
      if (activePage === 'dashboard') updateDashboardStats();
    }, { signal: runtimeController?.signal });
  }

  const DC_SITUATIONS = [
    ['default', 'Default'], ['block', 'Targeting Block'], ['player', 'Player'],
    ['enemy', 'Enemy Mob'], ['entity', 'Entity'], ['item', 'Item/Drop'],
    ['projectile', 'Projectile'], ['air', 'In Air'], ['building', 'Building'],
    ['bridging', 'Bridging']
  ];

  const DC_PNGS = [
    'crosshair.png', 'cross-open.png', 'cross-open-diagonal.png', 'cross-diagonal-small.png',
    'circle.png', 'circle-large.png', 'dot.png', 'diamond.png', 'diamond-large.png',
    'square.png', 'square-large.png', 'brackets.png', 'brackets-bottom.png',
    'brackets-top.png', 'brackets-round.png', 'caret.png', 'lines.png',
    'line-bottom.png', 'empty.png'
  ];

  let dynamicCrosshairSettingsCleanup = null;

  function closeDynamicCrosshairSettings() {
    if (dynamicCrosshairSettingsCleanup) {
      const fn = dynamicCrosshairSettingsCleanup;
      dynamicCrosshairSettingsCleanup = null;
      fn();
      return;
    }
    panel?.querySelector('.mf-dc-backdrop')?.remove();
  }

  function openDynamicCrosshairSettings() {
    if (!panel) return;
    closeDynamicCrosshairSettings();

    const assetBase = chrome.runtime.getURL('assets/crosshair/');
    const backdrop = document.createElement('div');
    backdrop.className = 'mf-tt-backdrop mf-dc-backdrop';

    const situationRow = ([key, label]) => {
      const current = settings.dynamicCrosshairMap[key] || 'crosshair.png';
      const options = DC_PNGS.map(png => {
        const sel = png === current ? 'selected' : '';
        return `<option value="${png}" ${sel}>${png.replace('.png', '')}</option>`;
      }).join('');
      return `
        <div class="mf-dc-row">
          <span class="mf-dc-label">${label}</span>
          <div class="mf-dc-preview"><img src="${assetBase}${current}" alt=""></div>
          <select class="mf-dc-select" data-dc-situation="${key}">${options}</select>
        </div>`;
    };

    const sizeVal = Number(settings.dynamicCrosshairSize) || 28;

    backdrop.innerHTML = `
      <div class="mf-tt-dialog mf-dc-dialog" role="dialog" aria-modal="true">
        <div class="mf-tt-head">
          <div class="mf-tt-title">Dynamic Crosshair</div>
          <button type="button" class="mf-close" data-dc-close>×</button>
        </div>

        <div class="mf-tt-row">
          <span>Crosshair Size</span>
          <span class="mf-tt-scale-value" data-dc-size-val>${sizeVal}px</span>
        </div>
        <input class="mf-co-range" data-dc-size type="range" min="8" max="64" step="1" value="${sizeVal}">

        <div class="mf-dc-situations">
          ${DC_SITUATIONS.map(situationRow).join('')}
        </div>

        <button type="button" class="mf-btn primary mf-tt-save" data-dc-save>Save</button>
      </div>`;

    panel.appendChild(backdrop);

    const sizeInput = backdrop.querySelector('[data-dc-size]');
    const sizeValEl = backdrop.querySelector('[data-dc-size-val]');

    sizeInput?.addEventListener('input', () => {
      const v = Number(sizeInput.value) || 28;
      sizeValEl.textContent = v + 'px';
      settings.dynamicCrosshairSize = v;
      guiSettings.dynamicCrosshairSize = v;
      sendDynamicCrosshairConfig(settings.dynamicCrosshair);
      saveSettings();
    });

    backdrop.querySelectorAll('[data-dc-situation]').forEach(sel => {
      sel.addEventListener('change', () => {
        const situation = sel.dataset.dcSituation;
        const png = sel.value;
        settings.dynamicCrosshairMap[situation] = png;
        guiSettings.dynamicCrosshairMap = { ...settings.dynamicCrosshairMap };
        const preview = sel.parentElement.querySelector('.mf-dc-preview img');
        if (preview) preview.src = assetBase + png;
        sendDynamicCrosshairConfig(settings.dynamicCrosshair);
        saveSettings();
      });
    });

    const close = () => {
      backdrop.remove();
      dynamicCrosshairSettingsCleanup = null;
    };

    backdrop.querySelector('[data-dc-close]')?.addEventListener('click', close);
    backdrop.querySelector('[data-dc-save]')?.addEventListener('click', close);
    backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });

    dynamicCrosshairSettingsCleanup = close;
  }

  function openCameraOverhaulSettings() {
    if (!panel) return;
    closeCameraOverhaulSettings();

    settings.cameraOverhaulValues = clampCameraValues(settings.cameraOverhaulValues);
    settings.cameraOverhaulPreset = detectCameraPreset(settings.cameraOverhaulValues);

    const backdrop = document.createElement('div');
    backdrop.className = 'mf-tt-backdrop mf-camera-overhaul-backdrop';
    const bind = String(settings.cameraOverhaulBind || '');

    const renderControl = (key, limit) => {
      const value = Number(settings.cameraOverhaulValues[key]);
      const shown = value.toFixed(limit.digits);
      return `
        <div class="mf-co-control" data-co-control="${key}">
          <div class="mf-co-control-head">
            <span>${t(limit.label)}</span>
            <input class="mf-co-number" data-co-number="${key}" type="number" min="${limit.min}" max="${limit.max}" step="${limit.step}" value="${shown}">
          </div>
          <input class="mf-co-range" data-co-range="${key}" type="range" min="${limit.min}" max="${limit.max}" step="${limit.step}" value="${value}">
        </div>
      `;
    };

    backdrop.innerHTML = `
      <div class="mf-tt-dialog mf-co-dialog" role="dialog" aria-modal="true">
        <div class="mf-tt-head">
          <div class="mf-tt-title">${t('cameraOverhaulSettings')}</div>
          <button type="button" class="mf-close" data-co-close>×</button>
        </div>

        <div class="mf-tt-row">
          <span>${t('cameraOverhaulProfile')}</span>
          <span class="mf-tt-scale-value" data-co-profile-label></span>
        </div>

        <div class="mf-co-presets">
          <button type="button" class="mf-btn secondary" data-co-preset="soft">${t('cameraOverhaulSoft')}</button>
          <button type="button" class="mf-btn secondary" data-co-preset="normal">${t('cameraOverhaulNormal')}</button>
          <button type="button" class="mf-btn secondary" data-co-preset="strong">${t('cameraOverhaulStrong')}</button>
          <button type="button" class="mf-btn secondary" data-co-preset="custom">${t('cameraOverhaulCustom')}</button>
        </div>

        <div class="mf-co-controls">
          ${Object.entries(CAMERA_OVERHAUL_LIMITS).map(([key, limit]) => renderControl(key, limit)).join('')}
        </div>

        <div class="mf-tt-hint">${t('cameraOverhaulCustomHint')}</div>

        <div class="mf-tt-row"><span>${t('cameraOverhaulBind')}</span></div>
        <div class="mf-tt-bind-box">
          <span class="mf-muted">${t('cameraOverhaulBind')}</span>
          <span class="mf-tt-bind-code" data-co-bind-code>${bind || t('cameraOverhaulNoBind')}</span>
        </div>
        <div class="mf-tt-bind-actions">
          <button type="button" class="mf-btn secondary" data-co-bind>${t('cameraOverhaulSetBind')}</button>
          <button type="button" class="mf-btn danger" data-co-unbind>${t('cameraOverhaulRemoveBind')}</button>
        </div>

        <button type="button" class="mf-btn primary mf-tt-save" data-co-save>${t('cameraOverhaulSave')}</button>
      </div>
    `;

    panel.appendChild(backdrop);

    const bindCode = backdrop.querySelector('[data-co-bind-code]');
    const bindButton = backdrop.querySelector('[data-co-bind]');
    const profileLabel = backdrop.querySelector('[data-co-profile-label]');
    let binding = false;

    const profileText = profile => {
      if (profile === 'soft') return t('cameraOverhaulSoft');
      if (profile === 'normal') return t('cameraOverhaulNormal');
      if (profile === 'strong') return t('cameraOverhaulStrong');
      return t('cameraOverhaulCustom');
    };

    const syncProfileUI = () => {
      const profile = detectCameraPreset(settings.cameraOverhaulValues);
      settings.cameraOverhaulPreset = profile;
      guiSettings.cameraOverhaulPreset = profile;
      if (profileLabel) profileLabel.textContent = profileText(profile);
      backdrop.querySelectorAll('[data-co-preset]').forEach(button => {
        button.classList.toggle('active', button.dataset.coPreset === profile);
      });
    };

    const syncControlUI = () => {
      for (const [key, limit] of Object.entries(CAMERA_OVERHAUL_LIMITS)) {
        const value = Number(settings.cameraOverhaulValues[key]);
        const range = backdrop.querySelector(`[data-co-range="${key}"]`);
        const number = backdrop.querySelector(`[data-co-number="${key}"]`);
        if (range) range.value = String(value);
        if (number) number.value = value.toFixed(limit.digits);
      }
      syncProfileUI();
    };

    const applyValue = (key, raw, persist = false) => {
      const limit = CAMERA_OVERHAUL_LIMITS[key];
      if (!limit) return;
      const value = Number(raw);
      if (!Number.isFinite(value)) return;

      settings.cameraOverhaulValues = clampCameraValues({
        ...settings.cameraOverhaulValues,
        [key]: value
      });
      guiSettings.cameraOverhaulValues = cloneCameraValues(settings.cameraOverhaulValues);
      settings.cameraOverhaulPreset = detectCameraPreset(settings.cameraOverhaulValues);
      guiSettings.cameraOverhaulPreset = settings.cameraOverhaulPreset;

      const normalized = Number(settings.cameraOverhaulValues[key]);
      const range = backdrop.querySelector(`[data-co-range="${key}"]`);
      const number = backdrop.querySelector(`[data-co-number="${key}"]`);
      if (range) range.value = String(normalized);
      if (number) number.value = normalized.toFixed(limit.digits);

      syncProfileUI();
      sendCameraOverhaulConfig(settings.cameraOverhaul);
      if (persist) saveSettings();
    };

    backdrop.querySelectorAll('[data-co-range]').forEach(input => {
      input.addEventListener('input', () => applyValue(input.dataset.coRange, input.value, false));
      input.addEventListener('change', () => applyValue(input.dataset.coRange, input.value, true));
    });

    backdrop.querySelectorAll('[data-co-number]').forEach(input => {
      input.addEventListener('change', () => applyValue(input.dataset.coNumber, input.value, true));
      input.addEventListener('keydown', event => {
        if (event.code !== 'Enter') return;
        event.preventDefault();
        applyValue(input.dataset.coNumber, input.value, true);
      });
    });

    backdrop.querySelectorAll('[data-co-preset]').forEach(button => {
      button.addEventListener('click', () => {
        const preset = button.dataset.coPreset;
        if (!CAMERA_OVERHAUL_PRESETS[preset]) {
          syncProfileUI();
          return;
        }
        settings.cameraOverhaulValues = cloneCameraValues(CAMERA_OVERHAUL_PRESETS[preset]);
        guiSettings.cameraOverhaulValues = cloneCameraValues(settings.cameraOverhaulValues);
        settings.cameraOverhaulPreset = preset;
        guiSettings.cameraOverhaulPreset = preset;
        syncControlUI();
        saveSettings();
        sendCameraOverhaulConfig(settings.cameraOverhaul);
      });
    });

    const stopBinding = () => {
      binding = false;
      setCameraOverhaulBindingCapture(false);
      if (bindButton) bindButton.textContent = t('cameraOverhaulSetBind');
    };

    bindButton?.addEventListener('click', () => {
      binding = true;
      setCameraOverhaulBindingCapture(true);
      bindButton.textContent = t('cameraOverhaulListening');
    });

    backdrop.querySelector('[data-co-unbind]')?.addEventListener('click', () => {
      stopBinding();
      settings.cameraOverhaulBind = '';
      guiSettings.cameraOverhaulBind = '';
      if (bindCode) bindCode.textContent = t('cameraOverhaulNoBind');
      saveSettings();
      sendCameraOverhaulConfig(settings.cameraOverhaul);
    });

    const keyHandler = event => {
      if (!binding) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.code === 'Escape' || event.code === 'Backspace' || event.code === 'Delete') {
        settings.cameraOverhaulBind = '';
        guiSettings.cameraOverhaulBind = '';
        if (bindCode) bindCode.textContent = t('cameraOverhaulNoBind');
      } else {
        settings.cameraOverhaulBind = event.code;
        guiSettings.cameraOverhaulBind = event.code;
        if (bindCode) bindCode.textContent = event.code;
      }

      saveSettings();
      sendCameraOverhaulConfig(settings.cameraOverhaul);
      stopBinding();
    };

    document.addEventListener('keydown', keyHandler, { capture: true, once: false });
    syncControlUI();

    const cleanup = () => {
      stopBinding();
      document.removeEventListener('keydown', keyHandler, true);
      backdrop.remove();
      if (cameraOverhaulSettingsCleanup === cleanup) cameraOverhaulSettingsCleanup = null;
    };

    cameraOverhaulSettingsCleanup = cleanup;

    backdrop.querySelector('[data-co-close]')?.addEventListener('click', cleanup);
    backdrop.querySelector('[data-co-save]')?.addEventListener('click', () => {
      saveSettings();
      sendCameraOverhaulConfig(settings.cameraOverhaul);
      cleanup();
    });
    backdrop.addEventListener('mousedown', event => {
      if (event.target === backdrop) cleanup();
    });
  }

  function renderDashboardPage() {
    return `
      <div class="mf-grid">
        <div class="mf-card mf-stat-card">
          <div class="mf-card-title">FPS</div>
          <div class="mf-stat-value" id="mf-dash-fps">0</div>
          <div class="mf-muted">${t('dashboardFpsSub')}</div>
        </div>
        <div class="mf-card mf-stat-card">
          <div class="mf-card-title">${t('pingLabel')}</div>
          <div class="mf-stat-value" id="mf-dash-ping">--</div>
          <div class="mf-muted">${t('dashboardPingSub')}</div>
        </div>
        <div class="mf-card mf-stat-card">
          <div class="mf-card-title">${t('dashboardModulesTitle')}</div>
          <div class="mf-stat-value" id="mf-dash-modules">0</div>
          <div class="mf-muted">${t('dashboardModulesSub')}</div>
        </div>
        <div class="mf-card mf-stat-card">
          <div class="mf-card-title">${t('title')}</div>
          <div class="mf-stat-value">${MODULE_VERSION}</div>
          <div class="mf-muted">${t('dashboardVersionSub')}</div>
        </div>
      </div>
    `;
  }

  function renderHudPage() {
    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionGeneral')}</div>   
          <div class="mf-toggle-grid">
            ${renderToggle(
              'keystrokes',
              t('keystrokes'),
              t('keystrokesDesc')
            )}    
            ${renderToggle(
              'fpsCounter',
              t('fpsCounter'),
              t('fpsCounterDesc')
            )}    
            ${renderToggle(
              'cpsCounter',
              t('cpsCounter'),
              t('cpsCounterDesc')
            )}    
            ${renderToggle(
              'pingCounter',
              t('pingCounter'),
              t('pingCounterDesc')
            )}    
            ${renderToggle(
              'armorHud',
              'Armor HUD',
              'Show your equipped helmet, chestplate, leggings and boots on screen.'
            )}
            ${renderToggle('dynamicCrosshair', 'Dynamic Crosshair', 'Changes crosshair based on situation')}
          </div>
          <div style="margin-top:12px;">
              <button
                  type="button"
                  id="mf-armorhud-configure"
                  class="mf-btn secondary"
                  style="width:100%;"
              >
                  Configure Armor HUD
              </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderFileInput(id, labelKey) {
    return `
      <div class="mf-file-picker">
        <input id="${id}" class="mf-file-input" type="file" accept="image/*">
        <label class="mf-file-button" for="${id}">${t(labelKey)}</label>
        <span class="mf-file-name" data-file-name>${t('noFileSelected')}</span>
      </div>
    `;
  }

  function renderRenderPage() {
    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionGeneral')}</div>
          <div class="mf-toggle-grid">
            ${renderToggle(
              'rebrand',
              t('rebrand'),
              t('rebrandDesc')
            )}
            ${renderToggle(
              'titanTiny',
              t('titanTiny'),
              t('titanTinyDesc')
            )}
            ${renderToggle(
              'healthNameTags',
              t('healthNameTags'),
              t('healthNameTagsDesc')
            )}
            ${renderToggle(
              'distanceNameTags',
              t('distanceNameTags'),
              t('distanceNameTagsDesc')
            )}
            ${renderToggle(
              'patPat',
              t('patPat'),
              t('patPatDesc')
            )}
            ${renderToggle(
              'itemPhysics',
              t('itemPhysics'),
              t('itemPhysicsDesc')
            )}
            ${renderToggle(
              'noWeather',
              t('noWeather'),
              t('noWeatherDesc')
            )}
            ${renderToggle(
              'zoom',
              t('zoom'),
              t('zoomDesc')
            )}
            ${renderToggle(
              'cameraOverhaul',
              t('cameraOverhaul'),
              t('cameraOverhaulDesc')
            )}
            ${renderToggle(
              'freelook',
              'Freelook',
              'Look around independently while keeping your player facing direction unchanged.'
            )}
            ${renderToggle(
              'blockHighlight',
              'Block Highlight',
              'Customize the outline shown around the block you are looking at.'
            )}
            <label class="mf-toggle" id="mf-spritesheet-toggle">
              <span class="mf-toggle-dot"></span>
              <span class="mf-toggle-copy">
                <strong>${t('spritesheet')}</strong>
                <span>${t('spritesheetDesc')}</span>
              </span>
              <input
                type="checkbox"
                id="mf-spritesheet-checkbox"
                class="mf-switch-hidden"
                checked
              >
            </label>
          </div>
        </div>
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionLogo')}</div>
          <div class="mf-logo-preview-wrap">
            <img
              id="mf-logo-preview"
              class="mf-logo-preview"
              src="${currentLogo}"
              alt="${t('preview')}"
            >
            <div
              class="mf-muted"
              id="mf-logo-preview-text"
            >
              ${t('preview')}
            </div>
          </div>
          <input
            id="mf-logo-url"
            class="mf-input"
            type="text"
            placeholder="${t('customLogoUrlPlaceholder')}"
          >
          ${renderFileInput(
            'mf-logo-file',
            'customLogoFile'
          )}
          <div class="mf-grid-2">
            <button
              id="mf-logo-apply"
              class="mf-btn primary"
            >
              ${t('applyLogo')}
            </button>
            <button
              id="mf-logo-reset"
              class="mf-btn secondary"
            >
              ${t('resetLogo')}
            </button>
          </div>
          <div
            id="mf-logo-status"
            class="mf-status"
          ></div>
        </div>
      </div>
    `;
  }

  function renderCosmeticsPage() {
    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionSkinChanger')}</div>
          <select id="mf-skin-select" class="mf-select">
            <option value="">${t('skinSelectPlaceholder')}</option>
          </select>
          <input type="text" id="mf-skin-url" class="mf-input" placeholder="${t('skinUrlPlaceholder')}">
          ${renderFileInput('mf-skin-file', 'skinFile')}
          <div class="mf-grid-2">
            <button id="mf-skin-apply" class="mf-btn primary">${t('applySkin')}</button>
            <button id="mf-skin-reset" class="mf-btn danger">${t('resetAll')}</button>
          </div>
          <div id="mf-skin-status" class="mf-status"></div>
        </div>
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionActiveSkins')}</div>
          <div id="mf-active-skins" class="mf-active-list"></div>
        </div>
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionCapeChanger')}</div>
          <select id="mf-cape-select" class="mf-select">
            <option value="">${t('capeSelectPlaceholder')}</option>
          </select>
          <input type="text" id="mf-cape-url" class="mf-input" placeholder="${t('capeUrlPlaceholder')}">
          ${renderFileInput('mf-cape-file', 'capeFile')}
          <div class="mf-grid-2">
            <button id="mf-cape-apply" class="mf-btn primary">${t('applyCape')}</button>
            <button id="mf-cape-reset" class="mf-btn danger">${t('resetAll')}</button>
          </div>
          <div id="mf-cape-status" class="mf-status"></div>
        </div>
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionActiveCapes')}</div>
          <div id="mf-active-capes" class="mf-active-list"></div>
        </div>
      </div>
    `;
  }

  function getChatMemeItems() {
    return CHAT_GIFS.map(({ id, file }) => ({
      id: `:${id}:`,
      file,
      preview: chrome.runtime.getURL(`assets/memes/gif/${file}`)
    }));
  }

  function renderMemeIdButtons(items) {
    return items.map(({ id, preview }) => `
      <button type="button" class="mf-meme-id" data-meme-id="${id}" title="${t('memeCopy')}: ${id}">
        <img class="mf-meme-preview" src="${preview}" alt="${id}" loading="lazy" decoding="async">
        <span class="mf-meme-id-row">
          <code>${id}</code>
          <span data-copy-label>${t('memeCopy')}</span>
        </span>
      </button>
    `).join('');
  }

  function renderChatPage() {
    const memeItems = getChatMemeItems();

    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionChat')}</div>
          <div class="mf-toggle-grid">
            ${renderToggle('chatVideos', t('chatVideos'), t('chatVideosDesc'))}
            ${renderToggle('chatLinks', t('chatLinks'), t('chatLinksDesc'))}
            ${renderToggle('chatMemes', t('chatMemes'), t('chatMemesDesc'))}
          </div>
        </div>
        <div class="mf-card">
          <div class="mf-card-title">${t('memeLibraryTitle')}</div>
          <div class="mf-muted mf-meme-library-desc">${t('memeLibraryDesc')}</div>
          <div class="mf-meme-group">
            <div class="mf-meme-group-title">${t('memeGifIds')} · ${memeItems.length}</div>
            <div class="mf-meme-id-grid">${renderMemeIdButtons(memeItems)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderWorldPage() {
    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionWorldUtilities')}</div>
          <div class="mf-toggle-grid">
            ${renderToggle('antiAfk', t('antiAfk'), t('antiAfkDesc'))}
          </div>
          <div class="mf-tt-hint">${t('antiAfkRightClickHint')}</div>
        </div>
      </div>
    `;
  }

  function renderSettingsPage() {
    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionGeneral')}</div>
          <div class="mf-toggle-grid">
            ${renderToggle('supportAds', t('supportAds'), t('supportAdsDesc'))}
            ${renderToggle('discord', t('discordRedirect'), t('discordRedirectDesc'))}
          </div>
        </div>
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionLinks')}</div>
          <button id="mf-gui-discord" class="mf-btn primary">${t('joinServer')}</button>
        </div>
      </div>
    `;
  }

  function renderAboutPage() {
    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionAbout')}</div>
          <div class="mf-muted">${t('aboutLine1')}</div>
          <div class="mf-muted">${t('aboutLine2')}</div>
        </div>
      </div>
    `;
  }

  function renderSearchResults(query) {
    const needle = query.trim().toLowerCase();
    const matches = getModuleIndex().filter(entry =>
      entry.title.toLowerCase().includes(needle) || entry.desc.toLowerCase().includes(needle)
    );
    if (!matches.length) {
      return `<div class="mf-page-stack"><div class="mf-card"><div class="mf-muted">${t('searchNoResults')}</div></div></div>`;
    }
    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('searchResultsLabel')}</div>
          <div class="mf-toggle-grid">
            ${matches.map(entry => renderToggle(entry.key, entry.title, entry.desc)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  const PAGE_RENDERERS = {
    dashboard: renderDashboardPage,
    hud: renderHudPage,
    render: renderRenderPage,
    cosmetics: renderCosmeticsPage,
    chat: renderChatPage,
    world: renderWorldPage,
    settings: renderSettingsPage,
    about: renderAboutPage
  };

  function updateDashboardStats() {
    if (!panel) return;
    const fpsEl = panel.querySelector('#mf-dash-fps');
    const pingEl = panel.querySelector('#mf-dash-ping');
    const modulesEl = panel.querySelector('#mf-dash-modules');
    if (fpsEl) fpsEl.textContent = dashboardStats.fps;
    if (pingEl) pingEl.textContent = dashboardStats.ping === null ? '--' : dashboardStats.ping;
    if (modulesEl) {
      const enabledCount = [...MODULES.values()].filter(module => module.enabled).length;
      modulesEl.textContent = enabledCount;
    }
  }

  function startDashboardUpdater() {
    if (dashboardTimer) return;
    dashboardTimer = window.setInterval(() => {
      if (activePage === 'dashboard' && !searchQuery && overlay?.style.display === 'block') {
        updateDashboardStats();
      }
    }, 500);
  }

  function stopDashboardUpdater() {
    clearInterval(dashboardTimer);
    dashboardTimer = 0;
  }

  function renderCurrentPageContent() {
    if (!panel) return;
    const pageContainer = panel.querySelector('#mf-gui-page');
    const titleEl = panel.querySelector('#mf-gui-page-title');
    if (!pageContainer) return;

    if (searchQuery.trim()) {
      if (titleEl) titleEl.textContent = t('searchResultsLabel');
      pageContainer.innerHTML = renderSearchResults(searchQuery);
    } else {
      const navItem = NAV_ITEMS.find(item => item.id === activePage) || NAV_ITEMS[0];
      if (titleEl) titleEl.textContent = t(navItem.labelKey);
      const renderer = PAGE_RENDERERS[activePage] || renderDashboardPage;
      pageContainer.innerHTML = renderer();
    }

    bindPageControls();
    if (activePage === 'dashboard' && !searchQuery.trim()) updateDashboardStats();
  }

  function setActivePage(page) {
    activePage = page;
    searchQuery = '';
    if (panel) {
      const searchInput = panel.querySelector('#mf-gui-search');
      if (searchInput) searchInput.value = '';
      panel.querySelectorAll('.mf-nav').forEach(nav => {
        nav.classList.toggle('active', nav.dataset.page === page);
      });
    }
    renderCurrentPageContent();
  }

  function ensureGUI() {
    clearTimeout(guiCloseTimer);
    guiCloseTimer = 0;
    injectGuiStyles();

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'mf-gui-overlay';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', hideGUI);
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'mf-gui';
      document.body.appendChild(panel);
      renderGUI();
    }
  }

  function unloadGUI(expectedPanel = panel, expectedOverlay = overlay) {
    if (expectedPanel !== panel || expectedOverlay !== overlay) return;
    panelController?.abort();
    panelController = null;
    expectedPanel?.remove();
    expectedOverlay?.remove();
    document.getElementById('mf-gui-style')?.remove();
    panel = null;
    overlay = null;
  }

  function showGUI() {
    ensureGUI();
    overlay.style.display = 'block';
    panel.style.display = 'block';
    panel.style.pointerEvents = 'auto';
    requestAnimationFrame(() => {
      if (panel) panel.style.opacity = '1';
    });
    startDashboardUpdater();
    if (activePage === 'dashboard') updateDashboardStats();
  }

  function hideGUI() {
    if (!overlay || !panel) return;
    closeTitanTinySettings();
    closePatPatSettings();
    closeAntiAfkSettings();
    closeZoomSettings();
    closeCameraOverhaulSettings();
    const closingPanel = panel;
    const closingOverlay = overlay;
    closingOverlay.style.display = 'none';
    closingPanel.style.opacity = '0';
    closingPanel.style.pointerEvents = 'none';
    stopDashboardUpdater();

    clearTimeout(guiCloseTimer);
    guiCloseTimer = window.setTimeout(() => {
      guiCloseTimer = 0;
      if (closingPanel.style.opacity === '0') unloadGUI(closingPanel, closingOverlay);
    }, 160);
  }

  function toggleGUI() {
    if (!overlay || !panel) {
      showGUI();
      return;
    }
    if (overlay.style.display === 'block') hideGUI();
    else showGUI();
  }

  function saveSettings() {
    chrome.storage.local.set({ settings });
  }

  function saveLogo(value) {
    currentLogo = value;
    chrome.storage.local.set({ customLogo: currentLogo });
    if (MODULES.get('rebrand')?.enabled) replaceAllLogos();
    refreshLogoControls();
  }

  function resetLogo() {
    currentLogo = CONFIG.defaultLogo;
    chrome.storage.local.remove('customLogo', () => {
      if (MODULES.get('rebrand')?.enabled) replaceAllLogos();
      refreshLogoControls();
    });
  }

  function validateImage(url) {
    return new Promise(resolve => {
      const image = new Image();
      const timeout = setTimeout(() => resolve(false), 10000);
      image.onload = () => {
        clearTimeout(timeout);
        resolve(true);
      };
      image.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
      image.src = url;
    });
  }

  function replaceAllLogos() {
    replaceLogo();
    changeFavicon();
  }

  function refreshLogoControls() {
    if (!panel) return;
    const preview = panel.querySelector('#mf-logo-preview');
    const input = panel.querySelector('#mf-logo-url');
    const brandIcon = panel.querySelector('.mf-icon');
    if (preview) preview.src = currentLogo;
    if (brandIcon) brandIcon.src = currentLogo;
    if (input) {
      if (currentLogo.startsWith('data:image/')) {
        input.value = '';
        input.placeholder = t('customLogoLocal');
      } else {
        input.value = currentLogo === CONFIG.defaultLogo ? '' : currentLogo;
        input.placeholder = t('customLogoUrlPlaceholder');
      }
    }
  }

  function showSkinStatus(message, color = '#a78bfa') {
    const element = panel?.querySelector('#mf-skin-status');
    if (!element) return;
    element.textContent = message;
    element.style.color = color;
  }

  function showCapeStatus(message, color = '#a78bfa') {
    const element = panel?.querySelector('#mf-cape-status');
    if (!element) return;
    element.textContent = message;
    element.style.color = color;
  }

  function showLogoStatus(message, color = '#a78bfa') {
    const element = panel?.querySelector('#mf-logo-status');
    if (!element) return;
    element.textContent = message;
    element.style.color = color;
  }

  function refreshActiveSkins() {
    chrome.runtime.sendMessage({ type: 'getSkins' }, response => {
      const container = panel?.querySelector('#mf-active-skins');
      if (!container) return;
      container.innerHTML = '';
      if (!response || !response.skins || Object.keys(response.skins).length === 0) {
        container.innerHTML = `<div class="mf-muted">${t('noActiveSkins')}</div>`;
        return;
      }
      Object.entries(response.skins).forEach(([name]) => {
        const row = document.createElement('div');
        row.className = 'mf-active-item';
        const label = document.createElement('span');
        label.textContent = name;
        const remove = document.createElement('button');
        remove.className = 'mf-small-btn danger';
        remove.textContent = t('remove');
        remove.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'resetSkin', skinName: name }, () => {
            showSkinStatus(t('skinRemoved', { name }), '#facc15');
            refreshActiveSkins();
          });
        });
        row.appendChild(label);
        row.appendChild(remove);
        container.appendChild(row);
      });
    });
  }

  function populateSkinSelect() {
    const select = panel?.querySelector('#mf-skin-select');
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = `<option value="">${t('skinSelectPlaceholder')}</option>`;
    CONFIG.skins.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
    if ([...select.options].some(option => option.value === currentValue)) select.value = currentValue;
  }

  function refreshActiveCapes() {
    chrome.runtime.sendMessage({ type: 'getCapes' }, response => {
      const container = panel?.querySelector('#mf-active-capes');
      if (!container) return;
      container.innerHTML = '';
      if (!response || !response.capes || Object.keys(response.capes).length === 0) {
        container.innerHTML = `<div class="mf-muted">${t('noActiveCapes')}</div>`;
        return;
      }
      Object.entries(response.capes).forEach(([name]) => {
        const row = document.createElement('div');
        row.className = 'mf-active-item';
        const label = document.createElement('span');
        label.textContent = name;
        const remove = document.createElement('button');
        remove.className = 'mf-small-btn danger';
        remove.textContent = t('remove');
        remove.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'resetCape', capeName: name }, () => {
            showCapeStatus(t('capeRemoved', { name }), '#facc15');
            refreshActiveCapes();
          });
        });
        row.appendChild(label);
        row.appendChild(remove);
        container.appendChild(row);
      });
    });
  }

  function populateCapeSelect() {
    const select = panel?.querySelector('#mf-cape-select');
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = `<option value="">${t('capeSelectPlaceholder')}</option>`;
    CONFIG.capes.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
    if ([...select.options].some(option => option.value === currentValue)) select.value = currentValue;
  }

  function bindLocalizedFileInputs() {
    if (!panel) return;
    panel.querySelectorAll('.mf-file-input').forEach(input => {
      const name = input.closest('.mf-file-picker')?.querySelector('[data-file-name]');
      if (!name) return;
      const updateName = () => {
        name.textContent = input.files?.[0]?.name || t('noFileSelected');
        name.title = input.files?.[0]?.name || '';
      };
      input.addEventListener('change', updateName);
      updateName();
    });
  }

  async function copyMemeId(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
      document.body.appendChild(input);
      input.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch (_) {}
      input.remove();
      return copied;
    }
  }

  function openFreelookSettings() {
    if (!panel) return;
    const existing = panel.querySelector('.mf-freelook-backdrop');
    existing?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'mf-tt-backdrop mf-freelook-backdrop';
    const currentMode =
      settings.freelookMode === 'toggle'
        ? 'toggle'
        : 'hold';
    const currentBind =
      String(settings.freelookBind || '');
    backdrop.innerHTML = `
      <div
        class="mf-tt-dialog"
        role="dialog"
        aria-modal="true"
      >
        <div class="mf-tt-head">
          <div class="mf-tt-title">
            Freelook Settings
          </div>
          <button
            type="button"
            class="mf-close"
            data-fl-close
          >
            ×
          </button>
        </div>
        <div class="mf-tt-row">
          <span>Activation Mode</span>
        </div>
        <div class="mf-grid-2">
          <button
            type="button"
            class="mf-btn secondary ${currentMode === 'hold' ? 'active' : ''}"
            data-fl-mode="hold"
          >
            Hold
          </button>
          <button
            type="button"
            class="mf-btn secondary ${currentMode === 'toggle' ? 'active' : ''}"
            data-fl-mode="toggle"
          >
            Toggle
          </button>
        </div>
        <div class="mf-tt-row">
          <span>Keybind</span>
        </div>
        <div class="mf-tt-bind-box">
          <span class="mf-muted">
            Freelook Key
          </span>
          <span
            class="mf-tt-bind-code"
            data-fl-bind-code
          >
            ${currentBind || 'Not Bound'}
          </span>
        </div>
        <div class="mf-tt-bind-actions">
          <button
            type="button"
            class="mf-btn secondary"
            data-fl-bind
          >
            Set Keybind
          </button>
          <button
            type="button"
            class="mf-btn danger"
            data-fl-unbind
          >
            Remove
          </button>
        </div>
        <div class="mf-tt-hint">
          Hold mode keeps freelook active while the key is held.
          Toggle mode switches freelook on and off each time the key is pressed.
        </div>
        <button
          type="button"
          class="mf-btn primary mf-tt-save"
          data-fl-save
        >
          Save
        </button>
      </div>
    `;
    panel.appendChild(backdrop);
    const bindCode =
      backdrop.querySelector('[data-fl-bind-code]');
    const bindButton =
      backdrop.querySelector('[data-fl-bind]');
    let binding = false;
    const updateModeButtons = () => {
      backdrop
        .querySelectorAll('[data-fl-mode]')
        .forEach(button => {
          button.classList.toggle(
            'active',
            button.dataset.flMode === settings.freelookMode
          );
        });
    };
    backdrop
      .querySelectorAll('[data-fl-mode]')
      .forEach(button => {
        button.addEventListener('click', () => {
          settings.freelookMode =
            button.dataset.flMode === 'toggle'
              ? 'toggle'
              : 'hold';
          guiSettings.freelookMode =
            settings.freelookMode;
          updateModeButtons();
        });
      });
    const stopBinding = () => {
      binding = false;
      document.dispatchEvent(
        new CustomEvent(
          'minifeather:freelook-binding',
          {
            detail: JSON.stringify({
              active: false
            })
          }
        )
      );
      if (bindButton) {
        bindButton.textContent = 'Set Keybind';
      }
    };
    bindButton?.addEventListener('click', () => {
      binding = true;
      document.dispatchEvent(
        new CustomEvent(
          'minifeather:freelook-binding',
          {
            detail: JSON.stringify({
              active: true
            })
          }
        )
      );
      bindButton.textContent =
        'Press a Key...';
    });
    backdrop
      .querySelector('[data-fl-unbind]')
      ?.addEventListener('click', () => {
        stopBinding();
        settings.freelookBind = '';
        guiSettings.freelookBind = '';
        if (bindCode) {
          bindCode.textContent = 'Not Bound';
        }
        document.dispatchEvent(
          new CustomEvent(
            'minifeather:freelook-config',
            {
              detail: JSON.stringify({
                enabled:
                  !!settings.freelook,
                bind: '',
                mode:
                  settings.freelookMode
              })
            }
          )
        );
        saveSettings();
      });
    const keyHandler = event => {
      if (!binding) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (
        event.code === 'Escape' ||
        event.code === 'Backspace' ||
        event.code === 'Delete'
      ) {
        settings.freelookBind = '';
        guiSettings.freelookBind = '';
        if (bindCode) {
          bindCode.textContent = 'Not Bound';
        }
      } else {
        settings.freelookBind = event.code;
        guiSettings.freelookBind = event.code;
        if (bindCode) {
          bindCode.textContent = event.code;
        }
      }
      stopBinding();
    };
    document.addEventListener(
      'keydown',
      keyHandler,
      true
    );
    const cleanup = () => {
      stopBinding();
      document.removeEventListener(
        'keydown',
        keyHandler,
        true
      );
      backdrop.remove();
    };
    backdrop
      .querySelector('[data-fl-close]')
      ?.addEventListener('click', cleanup);
    backdrop
      .querySelector('[data-fl-save]')
      ?.addEventListener('click', () => {
        saveSettings();
        document.dispatchEvent(
          new CustomEvent(
            'minifeather:freelook-config',
            {
              detail: JSON.stringify({
                enabled:
                  !!settings.freelook,
                bind:
                  String(settings.freelookBind || ''),
                mode:
                  settings.freelookMode
              })
            }
          )
        );
        cleanup();
      });
    backdrop.addEventListener(
      'mousedown',
      event => {
        if (event.target === backdrop) {
          cleanup();
        }
      }
    );
    updateModeButtons();
  }

  function openBlockHighlightSettings() {
    if (!panel) return;   
    const existing =
      panel.querySelector('.mf-block-highlight-backdrop');    
    existing?.remove();   
    const backdrop = document.createElement('div');   
    backdrop.className =
      'mf-tt-backdrop mf-block-highlight-backdrop';   
    const color =
      settings.blockHighlightColor || '#ffffff';    
    const thickness =
      Number(settings.blockHighlightThickness) || 1;    
    backdrop.innerHTML = `
      <div
        class="mf-tt-dialog"
        role="dialog"
        aria-modal="true"
      >   
        <div class="mf-tt-head">
          <div class="mf-tt-title">
            Block Highlight Settings
          </div>    
          <button
            type="button"
            class="mf-close"
            data-bh-close
          >
            ×
          </button>
        </div>    
        <div class="mf-tt-row">
          <span>Highlight Color</span>
        </div>    
        <div style="
          display:flex;
          align-items:center;
          gap:10px;
          margin-bottom:16px;
        ">    
          <input
            type="color"
            data-bh-color
            value="${color}"
            style="
              width:52px;
              height:40px;
              padding:3px;
              border-radius:10px;
              border:1px solid var(--mf-border);
              background:transparent;
              cursor:pointer;
            "
          >   
          <input
            type="text"
            class="mf-input"
            data-bh-color-text
            value="${color}"
            maxlength="7"
            placeholder="#ffffff"
          >   
        </div>    
        <div class="mf-tt-row">
          <span>Thickness</span>    
          <span
            class="mf-tt-scale-value"
            data-bh-thickness-value
          >
            ${thickness}
          </span>
        </div>    
        <input
          class="mf-tt-range"
          data-bh-thickness
          type="range"
          min="1"
          max="4"
          step="1"
          value="${thickness}"
        >   
        <div class="mf-grid-2" style="margin-top:12px;">    
          <button
            type="button"
            class="mf-btn secondary"
            data-bh-preset="1"
          >
            Thin
          </button>   
          <button
            type="button"
            class="mf-btn secondary"
            data-bh-preset="2"
          >
            Medium
          </button>   
          <button
            type="button"
            class="mf-btn secondary"
            data-bh-preset="3"
          >
            Thick
          </button>   
          <button
            type="button"
            class="mf-btn secondary"
            data-bh-preset="4"
          >
            Extra Thick
          </button>   
        </div>    
        <div class="mf-tt-hint">
          Changes are applied immediately while this window is open.
        </div>    
        <button
          type="button"
          class="mf-btn primary mf-tt-save"
          data-bh-save
        >
          Save
        </button>   
      </div>
    `;    
    panel.appendChild(backdrop);    
    const colorInput =
      backdrop.querySelector('[data-bh-color]');    
    const colorText =
      backdrop.querySelector('[data-bh-color-text]');   
    const thicknessInput =
      backdrop.querySelector('[data-bh-thickness]');    
    const thicknessValue =
      backdrop.querySelector('[data-bh-thickness-value]');    
    const apply = () => {
      const selectedColor =
        colorInput?.value || '#ffffff';   
      const selectedThickness =
        Math.max(
          1,
          Math.min(
            4,
            Number(thicknessInput?.value) || 1
          )
        );    
      settings.blockHighlightColor =
        selectedColor;    
      settings.blockHighlightThickness =
        selectedThickness;    
      guiSettings.blockHighlightColor =
        selectedColor;    
      guiSettings.blockHighlightThickness =
        selectedThickness;    
      if (colorText) {
        colorText.value = selectedColor;
      }   
      if (thicknessValue) {
        thicknessValue.textContent =
          String(selectedThickness);
      }   
      document.dispatchEvent(
          new CustomEvent(
              'minifeather:block-highlight-config',
              {
                  detail: JSON.stringify({
                      enabled:
                          !!settings.blockHighlight,    
                      color:
                          selectedColor,    
                      thickness:
                          selectedThickness
                  })
              }
          )
      );
    };    
    colorInput?.addEventListener(
      'input',
      apply
    );    
    colorText?.addEventListener(
      'change',
      () => {
        let value =
          colorText.value.trim();   
        if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
          value = '#ffffff';
        }   
        colorInput.value = value;   
        apply();
      }
    );    
    thicknessInput?.addEventListener(
      'input',
      apply
    );    
    backdrop
      .querySelectorAll('[data-bh-preset]')
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            thicknessInput.value =
              button.dataset.bhPreset;    
            apply();
          }
        );
      });   
    const cleanup = () => {
      saveSettings();
      backdrop.remove();
    };    
    backdrop
      .querySelector('[data-bh-close]')
      ?.addEventListener(
        'click',
        cleanup
      );    
    backdrop
      .querySelector('[data-bh-save]')
      ?.addEventListener(
        'click',
        cleanup
      );    
    backdrop.addEventListener(
      'mousedown',
      event => {
        if (event.target === backdrop) {
          cleanup();
        }
      }
    );
  }

  const ARMOR_HUD_SLOT_NAMES = [
    'helmet',
    'chestplate',
    'leggings',
    'boots'
  ];

  function openArmorHudSettings() {
    if (!panel) return; 
    panel.querySelector('.mf-armorhud-editor-backdrop')?.remove();  
    const backdrop = document.createElement('div'); 
    backdrop.className =
        'mf-armorhud-editor-backdrop';  
    Object.assign(backdrop.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '1000000',  
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center', 
        background: 'rgba(0, 0, 0, 0.78)',  
        padding: '20px',
        boxSizing: 'border-box'
    }); 
    const editor = document.createElement('div'); 
    editor.className =
        'mf-armorhud-editor'; 
    Object.assign(editor.style, {
        width: 'min(1400px, 96vw)',
        height: 'min(820px, 92vh)', 
        display: 'flex',
        flexDirection: 'column',  
        background: '#111',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '12px', 
        overflow: 'hidden', 
        boxShadow:
            '0 20px 70px rgba(0,0,0,0.6)'
    });  
    const header =
        document.createElement('div');  
    Object.assign(header.style, {
        height: '54px',
        minHeight: '54px',  
        display: 'flex',
        alignItems: 'center', 
        padding: '0 16px',  
        boxSizing: 'border-box',  
        background: '#181818',  
        borderBottom:
            '1px solid rgba(255,255,255,0.08)'
    }); 
    const title =
        document.createElement('div');  
    title.textContent =
        'Configure Armor HUD';  
    Object.assign(title.style, {
        fontSize: '17px',
        fontWeight: '700',
        color: '#fff'
    }); 
    const subtitle =
        document.createElement('div');  
    subtitle.textContent =
        'Drag the armor slots to position them on your screen.';  
    Object.assign(subtitle.style, {
        marginLeft: '14px', 
        fontSize: '12px',
        color: 'rgba(255,255,255,0.55)'
    }); 
    header.appendChild(title);
    header.appendChild(subtitle); 
    const preview =
        document.createElement('div');  
    Object.assign(preview.style, {
        position: 'relative', 
        flex: '1',  
        overflow: 'hidden', 
        background: '#000'
    }); 
    const screenshot =
        document.createElement('img');  
    screenshot.src =
        chrome.runtime.getURL(
            'assets/armor-hud-editor.png'
        );  
    screenshot.alt =
        'Armor HUD editor preview'; 
    Object.assign(screenshot.style, {
        position: 'absolute', 
        inset: '0', 
        width: '100%',
        height: '100%', 
        objectFit: 'contain', 
        userSelect: 'none', 
        pointerEvents: 'none'
    }); 
    preview.appendChild(screenshot);  
    const names = [
        'Helmet',
        'Chestplate',
        'Leggings',
        'Boots'
    ];  
    const markerColors = [
        '#ffffff',
        '#ffffff',
        '#ffffff',
        '#ffffff'
    ];  
    const markers = []; 
    const defaultPositions = [
        { x: 0.88, y: 0.28 },
        { x: 0.88, y: 0.39 },
        { x: 0.88, y: 0.50 },
        { x: 0.88, y: 0.61 }
    ];  
    for (let i = 0; i < 4; i++) { 
        const marker =
            document.createElement('div');  
        marker.className =
            'mf-armorhud-editor-marker';  
        marker.dataset.slot =
            ARMOR_HUD_SLOT_NAMES[i];  
        Object.assign(marker.style, {
            position: 'absolute', 
            left:
                `${defaultPositions[i].x * 100}%`,  
            top:
                `${defaultPositions[i].y * 100}%`,  
            transform:
                'translate(-50%, -50%)',  
            width: '58px',
            height: '58px', 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center', 
            boxSizing: 'border-box',  
            border:
                `2px solid ${markerColors[i]}`, 
            borderRadius: '8px',  
            background:
                'rgba(0,0,0,0.35)', 
            color: '#fff',  
            fontSize: '10px',
            fontWeight: '700',  
            textAlign: 'center',  
            cursor: 'grab', 
            userSelect: 'none', 
            zIndex: '2',  
            textShadow:
                '0 1px 3px #000'
        }); 
        marker.textContent =
            names[i]; 
        preview.appendChild(marker);  
        markers.push({
            element: marker,  
            x: defaultPositions[i].x,
            y: defaultPositions[i].y
        });
    } 
    for (const markerData of markers) { 
        const marker =
            markerData.element; 
        let dragging = false; 
        marker.addEventListener(
            'pointerdown',
            event => {  
                event.preventDefault();
                event.stopPropagation();  
                dragging = true;  
                marker.setPointerCapture(
                    event.pointerId
                );  
                marker.style.cursor =
                    'grabbing'; 
                marker.style.transform =
                    'translate(-50%, -50%) scale(1.05)';
                marker.style.borderColor =
                    'rgba(255,255,255,0.9)';
                marker.style.background =
                    'rgba(30,30,30,0.88)';
                marker.style.boxShadow =
                    '0 4px 14px rgba(0,0,0,0.65)';
            }
        );  
        marker.addEventListener(
            'pointermove',
            event => {  
                if (!dragging) return;  
                const rect =
                    preview.getBoundingClientRect();  
                let x = (event.clientX - rect.left) / rect.width; 
                let y = (event.clientY - rect.top) / rect.height;
                // Snap to a grid.
                const SNAP_X = 0.025;
                const SNAP_Y = 0.025;
                x = Math.round(x / SNAP_X) * SNAP_X;
                y = Math.round(y / SNAP_Y) * SNAP_Y;  
                x = Math.max(0.02, Math.min(0.98, x));  
                y = Math.max(0.02, Math.min(0.98, y));  
                markerData.x = x;
                markerData.y = y; 
                marker.style.left = `${x * 100}%`;  
                marker.style.top = `${y * 100}%`;
            }
        );  
        const stopDragging =
            event => {  
                if (!dragging) return;  
                dragging = false; 
                marker.style.cursor =
                    'grab'; 
                marker.style.transform =
                    'translate(-50%, -50%)';
                marker.style.borderColor =
                    'rgba(255,255,255,0.45)';
                marker.style.background =
                    'rgba(20,20,20,0.72)';                          
                marker.style.boxShadow =
                    '0 2px 8px rgba(0,0,0,0.45)';
            };  
        marker.addEventListener(
            'pointerup',
            stopDragging
        );  
        marker.addEventListener(
            'pointercancel',
            stopDragging
        );
    } 
    const footer =
        document.createElement('div');  
    Object.assign(footer.style, {
        height: '58px',
        minHeight: '58px',  
        display: 'flex',
        alignItems: 'center', 
        justifyContent: 'flex-end', 
        gap: '8px', 
        padding: '0 14px',  
        boxSizing: 'border-box',  
        background: '#181818',  
        borderTop:
            '1px solid rgba(255,255,255,0.08)'
    }); 
    const reset =
        document.createElement('button'); 
    reset.type =
        'button'; 
    reset.textContent =
        'Reset';  
    reset.className =
        'mf-btn secondary'; 
    reset.addEventListener(
        'click',
        () => { 
            markers.forEach(
                (markerData, index) => {  
                    const position =
                        defaultPositions[index];  
                    markerData.x =
                        position.x; 
                    markerData.y =
                        position.y; 
                    markerData.element.style.left =
                        `${position.x * 100}%`; 
                    markerData.element.style.top =
                        `${position.y * 100}%`;
                }
            );
        }
    );  
    const cancel =
        document.createElement('button'); 
    cancel.type =
        'button'; 
    cancel.textContent =
        'Cancel'; 
    cancel.className =
        'mf-btn secondary'; 
    cancel.addEventListener(
        'click',
        () => {
            backdrop.remove();
        }
    );  
    const save =
        document.createElement('button'); 
    save.type =
        'button'; 
    save.textContent =
        'Save Layout';  
    save.className =
        'mf-btn primary'; 
    save.addEventListener(
        'click',
        () => { 
            const positions = {}; 
            for (const markerData of markers) { 
                positions[
                    markerData.element.dataset.slot
                ] = {
                    x: markerData.x,
                    y: markerData.y
                };
            } 
            console.log(
                '[MiniFeather Armor HUD] Saving layout:',
                positions
            );
            
            document.dispatchEvent(
                new CustomEvent(
                    'minifeather:armorhud-layout',
                    {
                        detail: JSON.stringify(positions)
                    }
                )
            );
            
            backdrop.remove();
            
        }
    );  
    footer.appendChild(reset);
    footer.appendChild(cancel);
    footer.appendChild(save); 
    editor.appendChild(header);
    editor.appendChild(preview);
    editor.appendChild(footer); 
    backdrop.appendChild(editor); 
    panel.appendChild(backdrop);  
    backdrop.addEventListener(
        'mousedown',
        event => {  
            if (event.target === backdrop) {
                backdrop.remove();
            }
        }
    );
  }

  function bindPageControls() {
    if (!panel) return;

    bindLocalizedFileInputs();

    const titanTinyToggle = panel.querySelector('.mf-toggle[data-key="titanTiny"]');
    titanTinyToggle?.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openTitanTinySettings();
    });

    const patPatToggle = panel.querySelector('.mf-toggle[data-key="patPat"]');
    patPatToggle?.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openPatPatSettings();
    });

    const antiAfkToggle = panel.querySelector('.mf-toggle[data-key="antiAfk"]');
    antiAfkToggle?.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openAntiAfkSettings();
    });

    const zoomToggle = panel.querySelector('.mf-toggle[data-key="zoom"]');
    zoomToggle?.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openZoomSettings();
    });

    const cameraOverhaulToggle = panel.querySelector('.mf-toggle[data-key="cameraOverhaul"]');
    cameraOverhaulToggle?.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openCameraOverhaulSettings();
    });

    const dynamicCrosshairToggle = panel.querySelector('.mf-toggle[data-key="dynamicCrosshair"]');
    dynamicCrosshairToggle?.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openDynamicCrosshairSettings();
    });

    const freelookToggle =
      panel.querySelector(
        '.mf-toggle[data-key="freelook"]'
      );
    
    freelookToggle?.addEventListener(
      'contextmenu',
      event => {
        event.preventDefault();
        event.stopPropagation();
        openFreelookSettings();
      }
    );

    const blockHighlightToggle =
      panel.querySelector(
        '.mf-toggle[data-key="blockHighlight"]'
      );
    
    blockHighlightToggle?.addEventListener(
      'contextmenu',
      event => {
        event.preventDefault();
        event.stopPropagation();
      
        openBlockHighlightSettings();
      }
    );

    const armorHudConfigure =
      panel.querySelector('#mf-armorhud-configure');
      armorHudConfigure?.addEventListener('click', () => {
          openArmorHudSettings();
      }
    );

    panel.querySelectorAll('.mf-meme-id[data-meme-id]').forEach(button => {
      button.addEventListener('click', async () => {
        const value = button.dataset.memeId || '';
        if (!value || !(await copyMemeId(value))) return;

        const label = button.querySelector('[data-copy-label]');
        button.classList.add('copied');
        if (label) label.textContent = t('memeCopied');

        window.setTimeout(() => {
          if (!button.isConnected) return;
          button.classList.remove('copied');
          if (label) label.textContent = t('memeCopy');
        }, 1100);
      });
    });

    panel.querySelectorAll('.mf-toggle[data-key]').forEach(label => {
      const key = label.dataset.key;
      const input = label.querySelector('input');
      if (!input) return;
      input.addEventListener('change', () => {
        guiSettings[key] = input.checked;
        settings[key] = input.checked;
        saveSettings();
        applyGuiSettings();
        update();
        if (activePage === 'dashboard') updateDashboardStats();
      });
    });

    panel.querySelector('#mf-gui-discord')?.addEventListener('click', () => window.open(CONFIG.discord, '_blank'));

    panel.querySelector('#mf-logo-apply')?.addEventListener('click', async () => {
      const inputUrl = panel.querySelector('#mf-logo-url');
      const fileInput = panel.querySelector('#mf-logo-file');
      const file = fileInput?.files?.[0];
      const url = inputUrl?.value?.trim() || '';
      if (file) {
        const reader = new FileReader();
        reader.onload = event => {
          saveLogo(event.target.result);
          showLogoStatus(t('logoUpdated'), '#22c55e');
        };
        reader.readAsDataURL(file);
        return;
      }
      if (!url) {
        showLogoStatus(t('logoNeedSource'), '#ef4444');
        return;
      }
      const valid = await validateImage(url);
      if (!valid) {
        showLogoStatus(t('logoInvalid'), '#ef4444');
        return;
      }
      saveLogo(url);
      showLogoStatus(t('logoUpdated'), '#22c55e');
    });

    panel.querySelector('#mf-logo-reset')?.addEventListener('click', () => {
      resetLogo();
      showLogoStatus(t('logoResetDone'), '#facc15');
    });

    panel.querySelector('#mf-skin-apply')?.addEventListener('click', () => {
      const skinName = panel.querySelector('#mf-skin-select')?.value || '';
      const customUrl = panel.querySelector('#mf-skin-url')?.value.trim() || '';
      const file = panel.querySelector('#mf-skin-file')?.files?.[0];

      if (!skinName) {
        showSkinStatus(t('skinNeedName'), '#ef4444');
        return;
      }

      if (file) {
        const reader = new FileReader();
        reader.onload = event => {
          chrome.runtime.sendMessage({ type: 'setSkin', skinName, customUrl: event.target.result }, () => {
            showSkinStatus(t('skinApplied', { name: skinName }), '#22c55e');
            refreshActiveSkins();
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      if (!customUrl) {
        showSkinStatus(t('skinNeedSource'), '#ef4444');
        return;
      }

      chrome.runtime.sendMessage({ type: 'setSkin', skinName, customUrl }, () => {
        showSkinStatus(t('skinApplied', { name: skinName }), '#22c55e');
        refreshActiveSkins();
      });
    });

    panel.querySelector('#mf-skin-reset')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'resetAllSkins' }, () => {
        showSkinStatus(t('skinsReset'), '#facc15');
        refreshActiveSkins();
      });
    });

    panel.querySelector('#mf-cape-apply')?.addEventListener('click', () => {
      const capeName = panel.querySelector('#mf-cape-select')?.value || '';
      const customUrl = panel.querySelector('#mf-cape-url')?.value.trim() || '';
      const file = panel.querySelector('#mf-cape-file')?.files?.[0];

      if (!capeName) {
        showCapeStatus(t('capeNeedName'), '#ef4444');
        return;
      }

      if (file) {
        const reader = new FileReader();
        reader.onload = event => {
          chrome.runtime.sendMessage({ type: 'setCape', capeName, customUrl: event.target.result }, () => {
            showCapeStatus(t('capeApplied', { name: capeName }), '#22c55e');
            refreshActiveCapes();
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      if (!customUrl) {
        showCapeStatus(t('capeNeedSource'), '#ef4444');
        return;
      }

      chrome.runtime.sendMessage({ type: 'setCape', capeName, customUrl }, () => {
        showCapeStatus(t('capeApplied', { name: capeName }), '#22c55e');
        refreshActiveCapes();
      });
    });

    panel.querySelector('#mf-cape-reset')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'resetAllCapes' }, () => {
        showCapeStatus(t('capesReset'), '#facc15');
        refreshActiveCapes();
      });
    });

    if (panel.querySelector('#mf-spritesheet-checkbox')) {
      chrome.runtime.sendMessage({ type: 'getSpritesheet' }, response => {
        const checkbox = panel?.querySelector('#mf-spritesheet-checkbox');
        if (checkbox && response && response.success) checkbox.checked = response.enabled;
      });

      panel.querySelector('#mf-spritesheet-checkbox')?.addEventListener('change', event => {
        chrome.runtime.sendMessage({ type: 'setSpritesheet', enabled: event.target.checked });
      });
    }

    if (panel.querySelector('#mf-skin-select')) {
      populateSkinSelect();
      refreshActiveSkins();
    }
    if (panel.querySelector('#mf-cape-select')) {
      populateCapeSelect();
      refreshActiveCapes();
    }
    if (panel.querySelector('#mf-logo-preview')) refreshLogoControls();
  }

  function bindPanelControls() {
    if (!panel) return;

    panelController?.abort();
    panelController = new AbortController();
    const panelSignal = panelController.signal;

    panel.querySelector('#mf-gui-close')?.addEventListener('click', hideGUI, { signal: panelSignal });

    panel.querySelectorAll('.mf-nav[data-page]').forEach(nav => {
      nav.addEventListener('click', () => setActivePage(nav.dataset.page), { signal: panelSignal });
    });

    panel.querySelector('#mf-gui-search')?.addEventListener('input', event => {
      searchQuery = event.target.value;
      panel.querySelectorAll('.mf-nav').forEach(nav => {
        nav.classList.toggle('active', !searchQuery.trim() && nav.dataset.page === activePage);
      });
      renderCurrentPageContent();
    }, { signal: panelSignal });

    panel.querySelector('#mf-language-select')?.addEventListener('change', event => {
      settings.language = event.target.value;
      guiSettings.language = event.target.value;
      saveSettings();
      sendDistanceNameTagsConfig(settings.distanceNameTags);
      update();
      renderGUI();
    }, { signal: panelSignal });

    const topbar = panel.querySelector('#mf-gui-topbar');
    let dragging = false;
    let offX = 0;
    let offY = 0;

    topbar?.addEventListener('mousedown', event => {
      const target = event.target.closest('button, select, input');
      if (target) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offX = event.clientX - rect.left;
      offY = event.clientY - rect.top;
      panel.style.transform = 'none';
    }, { signal: panelSignal });

    document.addEventListener('mousemove', event => {
      if (!dragging) return;
      const panelWidth = panel.offsetWidth;
      const panelHeight = panel.offsetHeight;
      const x = Math.max(10, Math.min(event.clientX - offX, window.innerWidth - panelWidth - 10));
      const y = Math.max(10, Math.min(event.clientY - offY, window.innerHeight - panelHeight - 10));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    }, { signal: panelSignal });

    document.addEventListener('mouseup', () => {
      dragging = false;
    }, { signal: panelSignal });

    renderCurrentPageContent();
    applyGuiSettings();
  }

  function renderGUI() {
    if (!panel) return;
    panel.innerHTML = getPanelTemplate();
    bindPanelControls();
  }

  function initGUI() {
    if (guiReady) return;
    guiReady = true;
    let rightShiftDown = false;

    document.addEventListener('keydown', event => {
      if (event.code === 'ShiftRight' && !rightShiftDown) {
        rightShiftDown = true;
        toggleGUI();
      }
      if (event.code === 'Escape') hideGUI();
    }, { signal: runtimeController?.signal });

    document.addEventListener('keyup', event => {
      if (event.code === 'ShiftRight') rightShiftDown = false;
    }, { signal: runtimeController?.signal });
  }

  function injectFeatherButton() {
    if (document.getElementById('mf-sidebar-btn')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'mf-sidebar-btn';
    wrapper.className = 'css-1yohxqj';
    wrapper.style.cssText = 'display:flex;align-items:center;justify-content:center;';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chakra-button css-7qs6ql';
    button.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;color:rgb(201,184,255);';
    button.innerHTML = `
      <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" style="font-size:24px;color:#a78bfa;">
        <rect x="9" y="2" width="6" height="1"></rect>
        <rect x="8" y="3" width="8" height="1"></rect>
        <rect x="7" y="4" width="10" height="1"></rect>
        <rect x="6" y="5" width="12" height="1"></rect>
        <rect x="5" y="6" width="14" height="1"></rect>
        <rect x="4" y="7" width="16" height="1"></rect>
        <rect x="3" y="8" width="18" height="1"></rect>
        <rect x="3" y="9" width="6" height="1"></rect>
        <rect x="2" y="10" width="4" height="1"></rect>
        <rect x="2" y="11" width="3" height="1"></rect>
        <rect x="1" y="12" width="3" height="1"></rect>
        <rect x="1" y="13" width="2" height="1"></rect>
        <rect x="0" y="14" width="2" height="1"></rect>
        <rect x="0" y="15" width="2" height="1"></rect>
        <rect x="1" y="16" width="2" height="1"></rect>
        <rect x="2" y="17" width="3" height="1"></rect>
        <rect x="3" y="18" width="4" height="1"></rect>
        <rect x="4" y="19" width="6" height="1"></rect>
        <rect x="6" y="20" width="8" height="1"></rect>
      </svg>
      <span style="font-size:10px;font-weight:700;">MF</span>
    `;

    wrapper.appendChild(button);

    button.addEventListener('click', showGUI);

    function tryInject() {
      if (document.getElementById('mf-sidebar-btn')) return true;
      const buttons = document.querySelectorAll('button');
      const settingsButton = Array.from(buttons).find(btn => {
        const text = btn.innerText?.trim();
        return text === 'Settings' || text === 'Ajustes' || text === 'Configuración' || text === 'Inicio' || text === 'Home';
      });
      if (!settingsButton) return false;
      const sidebar = settingsButton.parentElement?.parentElement;
      if (!sidebar) return false;
      sidebar.insertBefore(wrapper, sidebar.firstChild);
      return true;
    }

    if (!tryInject()) {
      sidebarObserver?.disconnect();
      clearTimeout(sidebarObserverTimer);
      sidebarObserver = new MutationObserver(() => {
        if (!tryInject()) return;
        sidebarObserver?.disconnect();
        sidebarObserver = null;
      });
      sidebarObserver.observe(document.body, { childList: true, subtree: true });
      sidebarObserverTimer = window.setTimeout(() => {
        sidebarObserver?.disconnect();
        sidebarObserver = null;
        sidebarObserverTimer = 0;
      }, 15000);
    }
  }

  function applyGuiSettings() {
    setModuleEnabled('rebrand', settings.rebrand);
    setModuleEnabled('discord', settings.rebrand && settings.discord);
    setModuleEnabled('keystrokes', settings.keystrokes);
    setModuleEnabled('fpsCounter', settings.fpsCounter);
    setModuleEnabled('cpsCounter', settings.cpsCounter);
    setModuleEnabled('pingCounter', settings.pingCounter);
    window.__MINIFEATHER_ARMOR_HUD_ENABLED__ = !!settings.armorHud;
      document.dispatchEvent(
          new CustomEvent('minifeather:armorhud-config', {
            detail: JSON.stringify({
              enabled: !!settings.armorHud
            
        })
      })
    );
    setModuleEnabled('titanTiny', settings.titanTiny);
    setModuleEnabled('healthNameTags', settings.healthNameTags);
    setModuleEnabled('distanceNameTags', settings.distanceNameTags);
    setModuleEnabled('patPat', settings.patPat);
    setModuleEnabled('itemPhysics', settings.itemPhysics);
    setModuleEnabled('noWeather', settings.noWeather);
    setModuleEnabled('antiAfk', settings.antiAfk);
    setModuleEnabled('zoom', settings.zoom);
    setModuleEnabled('cameraOverhaul', settings.cameraOverhaul);
    setModuleEnabled('dynamicCrosshair', settings.dynamicCrosshair);
    document.dispatchEvent(
      new CustomEvent(
        'minifeather:freelook-config',
        {
          detail: JSON.stringify({
            enabled:
              !!settings.freelook,
          
            bind:
              String(settings.freelookBind || ''),
          
            mode:
              settings.freelookMode === 'toggle'
                ? 'toggle'
                : 'hold'
          })
        }
      )
    );
    document.dispatchEvent(
        new CustomEvent(
            'minifeather:block-highlight-config',
            {
                detail: JSON.stringify({
                    enabled:
                        !!settings.blockHighlight,
                
                    color:
                        settings.blockHighlightColor ||
                        '#ffffff',
                
                    thickness:
                        Number(
                            settings.blockHighlightThickness
                        ) || 1
                })
            }
        )
    );

    localStorage.setItem(
      'miniblox_blockhighlight',
      settings.blockHighlight
        ? 'true'
        : 'false'
    );

    localStorage.setItem(
      'miniblox_blockhighlight_color',
      settings.blockHighlightColor ||
        '#ffffff'
    );

    localStorage.setItem(
      'miniblox_blockhighlight_thickness',
      String(
        Number(settings.blockHighlightThickness) || 1
      )
    );

    window.postMessage(
      {
        type:
          'MINIBLOX_REFRESH_BLOCK_HIGHLIGHT'
      },
      '*'
    );
    setModuleEnabled('chatVideos', settings.chatVideos);
    setModuleEnabled('chatLinks', settings.chatLinks);
    setModuleEnabled('chatMemes', settings.chatMemes);

    if (settings.rebrand && settings.discord) hookClipboard();
    else unhookClipboard();

    if (settings.supportAds) showAds();
    else blockAds();

    syncRootObserver();
  }

  function initChatFeatures() {
    if (chatFeaturesReady) return;
    chatFeaturesReady = true;

    function ensureChatStyle() {
      let style = document.getElementById('minifeather-chat-style');
      if (style) return;
      style = document.createElement('style');
      style.id = 'minifeather-chat-style';
      style.textContent = `
        .mf-chat-processed { display:inline; }
        .mf-chat-link {
          color:#60a5fa;
          text-decoration:underline;
          text-underline-offset:2px;
          cursor:pointer;
          overflow-wrap:anywhere;
        }
        .chat-gif {
          max-width:64px;
          max-height:64px;
          vertical-align:middle;
          border-radius:4px;
          display:inline-block;
        }
        .yt-wrapper {
          display:block;
          width:100%;
          max-width:320px;
          margin:6px 0;
          border-radius:8px;
          overflow:hidden;
          box-shadow:0 4px 12px rgba(0,0,0,.5);
        }
        .yt-wrapper iframe {
          display:block;
          width:100%;
          height:180px;
          border:0;
        }
        .chat-meme-wrapper {
          display:block;
          width:100%;
          margin-top:5px;
        }
        .chat-meme-wrapper video {
          max-width:240px;
          border-radius:8px;
        }
      `;
      document.head.appendChild(style);
    }

    const GIF_BASE = chrome.runtime.getURL('assets/memes/gif/');
    const GIF_LIST = CHAT_GIFS;
    const MEME_MAP = CHAT_VIDEOS;

    const gifCache = new Map();
    const urlRegex = /https?:\/\/[^\s<>"']+/i;
    const gifRegex = /:([\w\d-]+?)(?:\.(?:gif|png|jpe?g|webp|avif))?:/i;

    function getGif(name) {
      const key = name.toLowerCase();
      if (gifCache.has(key)) return gifCache.get(key);
      const meme = GIF_LIST.find(({ id, file }) => {
        const normalizedId = id.toLowerCase();
        const normalizedFile = file.toLowerCase();
        const fileId = normalizedFile.replace(/\.(?:gif|png|jpe?g|webp|avif)$/i, '');
        return normalizedId === key || normalizedFile === key || fileId === key;
      });
      const value = meme ? GIF_BASE + meme.file : null;
      gifCache.set(key, value);
      return value;
    }

    function getYouTubeId(value) {
      try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        let id = '';

        if (host === 'youtu.be') {
          id = url.pathname.split('/').filter(Boolean)[0] || '';
        } else if (host === 'youtube.com' || host === 'm.youtube.com') {
          if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
          else {
            const parts = url.pathname.split('/').filter(Boolean);
            if (['shorts', 'embed', 'live'].includes(parts[0])) id = parts[1] || '';
          }
        }

        return /^[\w-]{6,}$/.test(id) ? id : '';
      } catch (_) {
        return '';
      }
    }

    function splitTrailingPunctuation(value) {
      const match = value.match(/^(.*?)([.,!?;:]+)?$/);
      return {
        url: match?.[1] || value,
        trailing: match?.[2] || ''
      };
    }

    function findMeme(text) {
      const lower = text.toLowerCase();
      let result = null;
      Object.keys(MEME_MAP).forEach(key => {
        const index = lower.indexOf(key);
        if (index < 0 || (result && result.index <= index)) return;
        result = { index, key, value: MEME_MAP[key] };
      });
      return result;
    }

    function appendText(target, value) {
      if (value) target.appendChild(document.createTextNode(value));
    }

    function appendUrl(target, value) {
      const { url, trailing } = splitTrailingPunctuation(value);
      const linksEnabled = MODULES.get('chatLinks')?.enabled === true;
      const videosEnabled = MODULES.get('chatVideos')?.enabled === true;

      if (linksEnabled) {
        const anchor = document.createElement('a');
        anchor.className = 'mf-chat-link';
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = url;
        anchor.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          window.open(url, '_blank', 'noopener,noreferrer');
        });
        target.appendChild(anchor);
      } else {
        appendText(target, url);
      }

      appendText(target, trailing);

      const videoId = videosEnabled ? getYouTubeId(url) : '';
      if (videoId) {
        const wrapper = document.createElement('div');
        wrapper.className = 'yt-wrapper';

        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
        iframe.loading = 'lazy';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';

        wrapper.appendChild(iframe);
        target.appendChild(wrapper);
      }
    }

    function appendGif(target, path, name) {
      const image = document.createElement('img');
      image.src = path;
      image.className = 'chat-gif';
      image.alt = name;
      image.title = name;
      target.appendChild(image);
    }

    function appendMeme(target, source) {
      const wrapper = document.createElement('div');
      wrapper.className = 'chat-meme-wrapper';

      const video = document.createElement('video');
      video.src = source;
      video.autoplay = true;
      video.controls = true;
      video.playsInline = true;

      wrapper.appendChild(video);
      target.appendChild(wrapper);
    }

    function renderText(target, text) {
      let remaining = text;
      const memesEnabled = MODULES.get('chatMemes')?.enabled === true;

      while (remaining) {
        const urlMatch = remaining.match(urlRegex);
        const gifMatch = remaining.match(gifRegex);
        const memeMatch = findMeme(remaining);
        const candidates = [];

        if (urlMatch && (MODULES.get('chatVideos')?.enabled || MODULES.get('chatLinks')?.enabled)) {
          candidates.push({ type: 'url', index: urlMatch.index, raw: urlMatch[0] });
        }
        if (memesEnabled && gifMatch) {
          candidates.push({ type: 'gif', index: gifMatch.index, raw: gifMatch[0], name: gifMatch[1] });
        }
        if (memesEnabled && memeMatch) {
          candidates.push({ type: 'meme', ...memeMatch, raw: memeMatch.key });
        }

        if (!candidates.length) {
          appendText(target, remaining);
          break;
        }

        candidates.sort((a, b) => a.index - b.index);
        const next = candidates[0];
        appendText(target, remaining.slice(0, next.index));

        if (next.type === 'url') {
          appendUrl(target, next.raw);
        } else if (next.type === 'gif') {
          const path = getGif(next.name);
          if (path) appendGif(target, path, next.name);
          else appendText(target, next.raw);
        } else {
          appendMeme(target, next.value);
        }

        remaining = remaining.slice(next.index + next.raw.length);
      }
    }

    function hasRenderableContent(text) {
      const memesEnabled = MODULES.get('chatMemes')?.enabled === true;
      if (memesEnabled && (gifRegex.test(text) || findMeme(text))) return true;
      if (!(MODULES.get('chatVideos')?.enabled || MODULES.get('chatLinks')?.enabled)) return false;
      return urlRegex.test(text);
    }

    function renderWrapper(wrapper) {
      const text = wrapper.dataset.mfOriginalText;
      if (text == null) return;
      wrapper.replaceChildren();
      renderText(wrapper, text);
    }

    function processNode(node) {
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      const text = node.nodeValue;
      if (!text || text.length < 3 || !hasRenderableContent(text)) return;

      const parent = node.parentElement;
      if (!parent || isMiniFeatherNode(parent)) return;
      if (parent.closest('.mf-chat-processed, .yt-wrapper, .chat-meme-wrapper')) return;
      if (['TEXTAREA', 'INPUT', 'SCRIPT', 'STYLE', 'A', 'IFRAME', 'VIDEO'].includes(parent.tagName)) return;
      if (parent.isContentEditable) return;

      const wrapper = document.createElement('span');
      wrapper.className = 'mf-chat-processed';
      wrapper.dataset.mfOriginalText = text;
      node.replaceWith(wrapper);
      renderWrapper(wrapper);
    }

    function scan(node) {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        processNode(node);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || isMiniFeatherNode(node)) return;
      if (node.matches('.mf-chat-processed, script, style, textarea, input, iframe, video')) return;

      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
        acceptNode(textNode) {
          const parent = textNode.parentElement;
          if (!parent || parent.closest('.mf-chat-processed, script, style, textarea, input, iframe, video')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      const nodes = [];
      let current;
      while ((current = walker.nextNode())) nodes.push(current);
      nodes.forEach(processNode);
    }

    function refresh() {
      document.querySelectorAll('.mf-chat-processed').forEach(renderWrapper);
      if (MODULES.get('chatVideos')?.enabled || MODULES.get('chatLinks')?.enabled || MODULES.get('chatMemes')?.enabled) {
        scan(document.body);
      }
    }

    restoreChatContent = () => {
      document.querySelectorAll('.mf-chat-processed').forEach(wrapper => {
        wrapper.replaceWith(document.createTextNode(wrapper.dataset.mfOriginalText || ''));
      });
    };

    function chatModulesEnabled() {
      return MODULES.get('chatVideos')?.enabled === true ||
        MODULES.get('chatLinks')?.enabled === true ||
        MODULES.get('chatMemes')?.enabled === true;
    }

    function startChatObserver() {
      if (chatObserver) return;
      chatObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (mutation.type === 'childList') mutation.addedNodes.forEach(scan);
          else if (mutation.type === 'characterData') scan(mutation.target);
        });
      });
      chatObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    function syncChatFeatures() {
      if (chatModulesEnabled()) {
        ensureChatStyle();
        startChatObserver();
        refresh();
        return;
      }

      chatObserver?.disconnect();
      chatObserver = null;
      restoreChatContent();
      document.getElementById('minifeather-chat-style')?.remove();
    }

    const createChatLifecycle = () => createLifecycle({
      enable: syncChatFeatures,
      disable: syncChatFeatures,
      refresh,
      destroy: syncChatFeatures
    });

    registerModule('chatVideos', createChatLifecycle);
    registerModule('chatLinks', createChatLifecycle);
    registerModule('chatMemes', createChatLifecycle);
  }

  function update() {
    MODULES.get('rebrand')?.refresh();
    MODULES.get('discord')?.refresh();

    if (settings.supportAds) showAds();
    else blockAds();

    refreshLogoControls();
  }

  function initRootObserver() {
    if (rootObserver) return;

    rootObserver = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation => {
        if (isMiniFeatherNode(mutation.target)) return false;
        if (mutation.type !== 'childList') return true;
        return [...mutation.addedNodes, ...mutation.removedNodes].some(node => !isMiniFeatherNode(node));
      });
      if (relevant) scheduleUpdate();
    });

    rootObserver.observe(document.body, { childList: true, subtree: true });
  }

  function syncRootObserver() {
    const needed = settings.rebrand || !settings.supportAds;
    if (needed) {
      initRootObserver();
      return;
    }

    rootObserver?.disconnect();
    rootObserver = null;
    clearTimeout(updateTimer);
    updateTimer = 0;
  }

  function init() {
    if (destroyed || runtimeController) return;

    runtimeController = new AbortController();
    initLifecycleModules();
    injectFont();
    initFPSCounter();
    initCPSCounter();
    initPingCounter();
    initKeystrokes();
    initTitanTinyModule();
    initHealthNameTagsModule();
    initDistanceNameTagsModule();
    initPatPatModule();
    initItemPhysicsModule();
    initNoWeatherModule();
    initAntiAfkModule();
    initZoomModule();
    initCameraOverhaulModule();
    initDynamicCrosshairModule();
    initGUI();
    initChatFeatures();
    injectFeatherButton();

    document.addEventListener('click', handleDocumentClick, {
      capture: true,
      signal: runtimeController.signal
    });

    applyGuiSettings();
    update();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;

    clearTimeout(updateTimer);
    updateTimer = 0;
    clearTimeout(sidebarObserverTimer);
    sidebarObserverTimer = 0;
    clearInterval(dashboardTimer);
    dashboardTimer = 0;
    clearTimeout(guiCloseTimer);
    guiCloseTimer = 0;

    panelController?.abort();
    panelController = null;
    runtimeController?.abort();
    runtimeController = null;

    rootObserver?.disconnect();
    rootObserver = null;
    fontObserver?.disconnect();
    fontObserver = null;
    chatObserver?.disconnect();
    chatObserver = null;
    restoreChatContent();
    restoreChatContent = () => {};
    chatFeaturesReady = false;
    sidebarObserver?.disconnect();
    sidebarObserver = null;

    closeTitanTinySettings();
    closeAntiAfkSettings();
    closeZoomSettings();
    closeCameraOverhaulSettings();
    closeDynamicCrosshairSettings();
    unhookClipboard();
    destroyModules();
    showAds();

    document.getElementById('mf-sidebar-btn')?.remove();
    document.getElementById('mf-gui-overlay')?.remove();
    document.getElementById('mf-gui')?.remove();
    document.getElementById('mf-gui-style')?.remove();
    document.getElementById('minifeather-chat-style')?.remove();
    document.getElementById('minifeather-font')?.remove();

    overlay = null;
    panel = null;
    guiReady = false;
    activePage = 'dashboard';
    searchQuery = '';

    if (globalThis.__MINIFEATHER_CONTENT__?.destroy === destroy) {
      delete globalThis.__MINIFEATHER_CONTENT__;
    }
  }

  function boot() {
    chrome.storage.local.get(['settings', 'customLogo'], data => {
      if (destroyed) return;
      settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      settings.antiAfkDelay = clampAntiAfkDelay(settings.antiAfkDelay);
      settings.patPatValues = clampPatPatValues(settings.patPatValues);
      settings.patPatPreset = detectPatPatPreset(settings.patPatValues);
      settings.cameraOverhaulValues = clampCameraValues(settings.cameraOverhaulValues);
      settings.cameraOverhaulPreset = detectCameraPreset(settings.cameraOverhaulValues);
      settings.cameraOverhaulBind = String(settings.cameraOverhaulBind || '');
      settings.dynamicCrosshairMap = { ...DEFAULT_SETTINGS.dynamicCrosshairMap, ...(settings.dynamicCrosshairMap || {}) };
      guiSettings = {
        ...settings,
        patPatValues: clonePatPatValues(settings.patPatValues),
        cameraOverhaulValues: cloneCameraValues(settings.cameraOverhaulValues)
      };
      currentLogo = data.customLogo || CONFIG.defaultLogo;

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
      } else {
        init();
      }
    });
  }

  globalThis.__MINIFEATHER_CONTENT__ = { destroy };
  boot();
})();
