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
    { id: 'youtubeMusic', icon: '🎵', labelKey: 'navYouTubeMusic' },
    { id: 'shaders', icon: '🌈', labelKey: 'navShaders' },
    { id: 'experimental', icon: '🧪', labelKey: 'navExperimental' },
    { id: 'cosmetics', icon: '👕', labelKey: 'tabSkins' },
    { id: 'accounts', icon: '🪪', labelKey: 'navAccounts' },
    { id: 'chat', icon: '💬', labelKey: 'sectionChat' },
    { id: 'waypoints', icon: '📍', labelKey: 'navWaypoints' },
    { id: 'movement', icon: '👟', labelKey: 'navMovement' },
    { id: 'world', icon: '🌍', labelKey: 'navWorld' },
    { id: 'settings', icon: '⚙', labelKey: 'navSettings' },
    { id: 'about', icon: '🪶', labelKey: 'tabAbout' }
  ];

  const MODULE_VERSION = chrome.runtime?.getManifest?.().version || '4.9.2';

  const ELYTRA_FLIGHT_PRESETS = Object.freeze({
    soft: Object.freeze({
      rollSensitivity: 0.00145,
      pitchSensitivity: 0.82,
      yawSpeed: 42,
      bankingStrength: 0.35,
      smoothing: 7.5,
      autoLevelStrength: 2.8,
      invertPitch: false,
      autoLevel: true,
      showHorizon: false
    }),
    normal: Object.freeze({
      rollSensitivity: 0.00215,
      pitchSensitivity: 1.00,
      yawSpeed: 68,
      bankingStrength: 0.62,
      smoothing: 10.5,
      autoLevelStrength: 4.2,
      invertPitch: false,
      autoLevel: true,
      showHorizon: false
    }),
    strong: Object.freeze({
      rollSensitivity: 0.00305,
      pitchSensitivity: 1.12,
      yawSpeed: 92,
      bankingStrength: 0.92,
      smoothing: 14.0,
      autoLevelStrength: 5.8,
      invertPitch: false,
      autoLevel: true,
      showHorizon: true
    })
  });

  const ELYTRA_FLIGHT_LIMITS = Object.freeze({
    rollSensitivity: Object.freeze({ min: 0.0005, max: 0.006, step: 0.00005, label: 'elytraFlightRollSensitivity', digits: 5 }),
    pitchSensitivity: Object.freeze({ min: 0.4, max: 1.6, step: 0.01, label: 'elytraFlightPitchSensitivity', digits: 2 }),
    yawSpeed: Object.freeze({ min: 15, max: 150, step: 1, label: 'elytraFlightYawSpeed', digits: 0 }),
    bankingStrength: Object.freeze({ min: 0, max: 1.5, step: 0.01, label: 'elytraFlightBanking', digits: 2 }),
    smoothing: Object.freeze({ min: 3, max: 22, step: 0.1, label: 'elytraFlightSmoothing', digits: 1 }),
    autoLevelStrength: Object.freeze({ min: 0.5, max: 10, step: 0.1, label: 'elytraFlightAutoLevelStrength', digits: 1 })
  });

  function cloneElytraFlightValues(source = ELYTRA_FLIGHT_PRESETS.normal) {
    return {
      rollSensitivity: Number(source.rollSensitivity),
      pitchSensitivity: Number(source.pitchSensitivity),
      yawSpeed: Number(source.yawSpeed),
      bankingStrength: Number(source.bankingStrength),
      smoothing: Number(source.smoothing),
      autoLevelStrength: Number(source.autoLevelStrength),
      invertPitch: source.invertPitch === true,
      autoLevel: source.autoLevel !== false,
      showHorizon: source.showHorizon === true
    };
  }

  function clampElytraFlightValues(source) {
    const base = cloneElytraFlightValues(ELYTRA_FLIGHT_PRESETS.normal);
    if (!source || typeof source !== 'object') return base;
    for (const [key, limit] of Object.entries(ELYTRA_FLIGHT_LIMITS)) {
      const value = Number(source[key]);
      if (!Number.isFinite(value)) continue;
      base[key] = Math.max(limit.min, Math.min(limit.max, value));
    }
    base.invertPitch = source.invertPitch === true;
    base.autoLevel = source.autoLevel !== false;
    base.showHorizon = source.showHorizon === true;
    return base;
  }

  function detectElytraFlightPreset(values) {
    const normalized = clampElytraFlightValues(values);
    for (const [name, preset] of Object.entries(ELYTRA_FLIGHT_PRESETS)) {
      const matches = Object.keys(ELYTRA_FLIGHT_LIMITS).every(key =>
        Math.abs(Number(normalized[key]) - Number(preset[key])) <= Math.max(Number(ELYTRA_FLIGHT_LIMITS[key].step) / 2, 0.000001)
      );
      if (
        matches &&
        normalized.invertPitch === preset.invertPitch &&
        normalized.autoLevel === preset.autoLevel &&
        normalized.showHorizon === preset.showHorizon
      ) return name;
    }
    return 'custom';
  }

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

  const REALISTIC_CUSTOM_DEFAULTS = Object.freeze({
    renderBlocks: 96,
    optimizeFps: true,
    targetFps: 60,
    shadowResolution: 4096,
    shadowSamples: 24,
    shadowSharpness: 75,
    shadowSoftness: 28,
    shadowDistanceSoftening: 85,
    shadowSunAngleSoftening: 100,
    shadowDarkness: 82,
    shadowArtifactFix: 55,
    moonShadows: true,
    waterTransparency: 60,
    waterWaveStrength: 135,
    waterWaveSpeed: 100,
    waterMicroDetail: 135,
    waterReflection: 110,
    waterRefraction: 100,
    waterSsrSteps: 32,
    lavaOpacity: 99,
    lavaWaveStrength: 130,
    lavaWaveSpeed: 100,
    lavaBubbles: 100,
    lavaEmission: 100,
    cloudSteps: 40,
    cloudShadowSteps: 5,
    cloudDensity: 110,
    cloudThickness: 115,
    cloudOpacity: 105,
    cloudSpeed: 100,
    cloudSilverLining: 100,
    wetCells: 48,
    wetRadius: 10,
    wetDarken: 22,
    wetSaturation: 14,
    wetSheen: 34,
    wetGloss: 78,
    wetDetail: 100,
    puddles: true,
    maxPuddles: 28,
    puddleReflection: 40,
    puddleRipple: 42,
    puddleDetail: 100,
    drySeconds: 180
  });

  const REALISTIC_ULTRA_CUSTOM = Object.freeze({
    ...REALISTIC_CUSTOM_DEFAULTS,
    renderBlocks: 96,
    optimizeFps: true,
    shadowResolution: 8192,
    shadowSamples: 16,
    shadowSharpness: 82,
    shadowSoftness: 24,
    shadowDistanceSoftening: 100,
    shadowSunAngleSoftening: 100,
    shadowDarkness: 82,
    waterTransparency: 67,
    waterWaveStrength: 135,
    waterWaveSpeed: 100,
    waterMicroDetail: 135,
    waterReflection: 100,
    waterRefraction: 100,
    waterSsrSteps: 20,
    cloudSteps: 36,
    cloudShadowSteps: 5,
    cloudDensity: 114,
    cloudThickness: 115,
    cloudOpacity: 105,
    cloudSpeed: 105,
    wetCells: 48,
    wetRadius: 10,
    wetDarken: 22,
    wetSaturation: 14,
    wetSheen: 34,
    wetGloss: 78,
    wetDetail: 100,
    maxPuddles: 28,
    puddleReflection: 40,
    puddleRipple: 42,
    puddleDetail: 100,
    drySeconds: 300
  });

  function clampRealisticCustom(source) {
    const raw = source && typeof source === 'object' ? source : {};
    const s = { ...REALISTIC_CUSTOM_DEFAULTS, ...raw };
    const optimizeFps = Object.prototype.hasOwnProperty.call(raw, 'optimizeFps') ? !!raw.optimizeFps : (Object.prototype.hasOwnProperty.call(raw, 'adaptive') ? !!raw.adaptive : true);
    const n = (key, min, max, fallback = REALISTIC_CUSTOM_DEFAULTS[key]) => {
      const value = Number(s[key]);
      return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    };
    const nearestPow2 = value => [512, 1024, 2048, 4096, 8192].reduce((best, x) => Math.abs(x - value) < Math.abs(best - value) ? x : best, 4096);
    return {
      ...s,
      renderBlocks: Math.round(n('renderBlocks', 10, 200)),
      optimizeFps,
      targetFps: Math.round(n('targetFps', 30, 144)),
      shadowResolution: nearestPow2(n('shadowResolution', 512, 8192)),
      shadowSamples: Math.round(n('shadowSamples', 1, 64)),
      shadowSharpness: n('shadowSharpness', 0, 100),
      shadowSoftness: n('shadowSoftness', 0, 100),
      shadowDistanceSoftening: n('shadowDistanceSoftening', 0, 200),
      shadowSunAngleSoftening: n('shadowSunAngleSoftening', 0, 200),
      shadowDarkness: n('shadowDarkness', 0, 100),
      shadowArtifactFix: n('shadowArtifactFix', 0, 100),
      moonShadows: s.moonShadows !== false,
      waterTransparency: n('waterTransparency', 0, 90),
      waterWaveStrength: n('waterWaveStrength', 0, 250),
      waterWaveSpeed: n('waterWaveSpeed', 25, 300),
      waterMicroDetail: n('waterMicroDetail', 0, 250),
      waterReflection: n('waterReflection', 0, 150),
      waterRefraction: n('waterRefraction', 0, 150),
      waterSsrSteps: Math.round(n('waterSsrSteps', 4, 64)),
      lavaOpacity: n('lavaOpacity', 50, 100),
      lavaWaveStrength: n('lavaWaveStrength', 0, 250),
      lavaWaveSpeed: n('lavaWaveSpeed', 25, 300),
      lavaBubbles: n('lavaBubbles', 0, 200),
      lavaEmission: n('lavaEmission', 0, 200),
      cloudSteps: Math.round(n('cloudSteps', 8, 64)),
      cloudShadowSteps: Math.round(n('cloudShadowSteps', 0, 8)),
      cloudDensity: n('cloudDensity', 0, 200),
      cloudThickness: n('cloudThickness', 25, 250),
      cloudOpacity: n('cloudOpacity', 0, 150),
      cloudSpeed: n('cloudSpeed', 0, 300),
      cloudSilverLining: n('cloudSilverLining', 0, 200),
      wetCells: Math.round(n('wetCells', 4, 64)),
      wetRadius: Math.round(n('wetRadius', 2, 16)),
      wetDarken: n('wetDarken', 0, 50),
      wetSaturation: n('wetSaturation', 0, 40),
      wetSheen: n('wetSheen', 0, 100),
      wetGloss: n('wetGloss', 0, 100),
      wetDetail: n('wetDetail', 0, 200),
      puddles: s.puddles !== false,
      maxPuddles: Math.round(n('maxPuddles', 0, 64)),
      puddleReflection: n('puddleReflection', 0, 100),
      puddleRipple: n('puddleRipple', 0, 100),
      puddleDetail: n('puddleDetail', 0, 200),
      drySeconds: Math.round(n('drySeconds', 10, 900))
    };
  }

  function realisticLoadScore(values) {
    const c = clampRealisticCustom(values);
    let score = 0;
    score += (c.renderBlocks - 10) / 190 * 28;
    score += Math.log2(c.shadowResolution / 512) / 4 * 18;
    score += c.shadowSamples / 64 * 18;
    score += c.waterSsrSteps / 64 * 10;
    score += c.cloudSteps / 64 * 14;
    score += c.cloudShadowSteps / 8 * 4;
    score += c.maxPuddles / 64 * 4;
    score += c.wetCells / 64 * 4;
    return Math.round(score);
  }

  const DEFAULT_SETTINGS = {
    rebrand: true,
    supportAds: false,
    startupAnimation: true,
    discord: true,
    keystrokes: true,
    fpsCounter: true,
    cpsCounter: true,
    pingCounter: true,
    armorHud: false,
    coordinates: false,
    waypoints: true,
    moduleBinds: {},
    titanTiny: false,
    titanTinyScale: 1.00,
    titanTinyBind: '',
    healthNameTags: false,
    distanceNameTags: false,
    damageParticles: false,
    waterSplash: true,
    patPat: false,
    itemPhysics: false,
    noWeather: false,
    antiAfk: false,
    antiAfkDelay: 120,
    autoSprint: false,
    safeSneak: false,
    autoRespawn: false,
    patPatPreset: 'normal',
    patPatValues: clonePatPatValues(),
    zoom: false,
    zoomBind: 'KeyX',
    freelook: false,
    freelookBind: 'KeyZ',
    freelookMode: 'hold',
    freecam: false,
    freecamSpeed: 7.0,
    freecamSensitivity: 1.0,
    freecamFastMultiplier: 3.0,
    blockHighlight: true,
    blockHighlightColor: '#ffffff',
    blockHighlightThickness: 1,
    cameraOverhaul: false,
    cameraOverhaulBind: '',
    cameraOverhaulPreset: 'normal',
    cameraOverhaulValues: cloneCameraValues(CAMERA_OVERHAUL_PRESETS.normal),
    elytraFlight: false,
    elytraFlightPreset: 'normal',
    elytraFlightValues: cloneElytraFlightValues(ELYTRA_FLIGHT_PRESETS.normal),
    dynamicCrosshair: false,
    dynamicCrosshairSize: 28,
    vanillaAnimations: false,
    leafWind: false,
    leafWindStrength: 0.085,
    handSway: false,
    betterPlayerLayers: false,
    dynamicCrosshairMap: {
      air: 'empty.png', block: 'crosshair.png', entity: 'cross-open.png',
      player: 'diamond.png', enemy: 'cross-diagonal-small.png', friendly: 'circle.png',
      item: 'dot.png', projectile: 'caret.png', building: 'brackets.png',
      bridging: 'brackets-bottom.png', default: 'crosshair.png'
    },
    chatVideos: true,
    chatLinks: true,
    chatMemes: true,
    clientChat: false,
    clientChatMentions: true,
    rhythmParkour: false,
    localGamesWorldName: '',
    guiPatch: false,
    customShader: false,
    customShaderPreset: 'spooklementary',
    customShaderStrength: 0.5,
    customShaderRenderScale: 1.0,
    customShaderFxVhs: 0.6,
    customShaderFxCrt: 0.6,
    customShaderFxCel: 0.6,
    customShaderFxFog: 0.7,
    customShaderFxGrain: 0.5,
    customShaderFxGlitch: 0.4,
    customShaderFxFlash: 0.5,
    customShaderFxSharp: 0.5,
    customShaderFxUfsat: 1.35,
    customShaderFxUfcontrast: 0.45,
    customShaderFxUftone: 0.35,
    customShaderFxPhagx: 0.8,
    customShaderFxPhfog: 0.5,
    customShaderPfbloom: 0.35,
    customShaderPfca: 0,
    customShaderPfdof: 0,
    customShaderPfdirt: 0,
    customShaderPfvignette: 0,
    cloudsShapeBrush: 12,
    cloudsShapeMix: 0.85,
    cloudsShapeTile: 512,
    panelAccentColor: '#ef3b3b',
    panelBackgroundColor: '#0e1115',
    panelScale: 68,
    pageZoomEnabled: true,
    experimentalRealistic: false,
    experimentalRealisticLevel: 'medium',
    experimentalWetDrySeconds: 180,
    experimentalRealisticCustom: { ...REALISTIC_CUSTOM_DEFAULTS },
    experimentalAurora: false,
    experimentalAuroraLevel: 'medium',
    experimentalGrassFlowers: false,
    experimentalInteractiveVegetation: false,
    experimentalInteractiveVegetationLevel: 'medium',
    experimentalFallenLeaves: false,
    experimentalTinyTakeover: false,
    experimentalAnimatedItems: false,
    experimentalBetterAnimationCape: false,
    experimentalPbr: false,

    language: 'en'
  };

  function normalizePanelColor(value, fallback) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      const [r, g, b] = raw.slice(1).split('');
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return fallback;
  }

  function applyPanelTheme() {
    if (!panel) return;
    const accent = normalizePanelColor(settings.panelAccentColor, DEFAULT_SETTINGS.panelAccentColor);
    const background = normalizePanelColor(settings.panelBackgroundColor, DEFAULT_SETTINGS.panelBackgroundColor);

    // Modern theme variables.
    panel.style.setProperty('--mf-ui-accent', accent);
    panel.style.setProperty('--mf-ui-panel', background);

    // Legacy settings dialogs still use the original variable names. Keep them
    // mapped to the same user-selected theme so every panel follows one palette.
    panel.style.setProperty('--mf-accent', accent);
    panel.style.setProperty('--mf-accent2', accent);
    panel.style.setProperty('--mf-bg', background);
    panel.style.setProperty('--mf-panel', background);
    panel.style.setProperty('--mf-panel2', `color-mix(in srgb, ${background} 88%, #ffffff 12%)`);
    panel.style.setProperty('--mf-border', `color-mix(in srgb, ${accent} 24%, #30363d 76%)`);
  }

  function clampPanelScale(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return DEFAULT_SETTINGS.panelScale;
    return Math.min(120, Math.max(50, n));
  }

  function applyPanelScale() {
    const s = clampPanelScale(settings.panelScale);
    if (!settings.pageZoomEnabled) return;
    try {
      chrome?.runtime?.sendMessage?.({ type: 'mfSetPageZoom', zoom: s / 100 }, () => {
        void chrome.runtime.lastError;
      });
    } catch (_) {}
  }

  const TRANSLATIONS = globalThis.MINIFEATHER_TRANSLATIONS || { en: {} };

  const LOGO_ALT_NAMES = ['miniblox'];
  const LOGO_SOURCE_NAMES = ['miniblox-icon', 'miniblox-logo', 'pwa-icon-192.png'];

  let settings = { ...DEFAULT_SETTINGS };
  let guiSettings = { ...DEFAULT_SETTINGS };
  let currentLogo = CONFIG.defaultLogo;
  let updateTimer = 0;
  let activePage = 'dashboard';
  let searchQuery = '';
  let activeCategory = 'all';
  let favoritesOnly = false;
  let favoriteModules = new Set();
  let featureSettingsCleanup = null;
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
  let elytraFlightSettingsCleanup = null;
  let freecamSettingsCleanup = null;
  let freecamAccess = { known: false, allowed: false, permissionLevel: 0 };
  let lastFreecamDeniedAt = 0;
  let waypointStatus = '';
  let clientChatState = null;
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
    return !!element?.closest?.('#mf-gui, #mf-gui-overlay, #mf-sidebar-btn, #minifeather-fps, #minifeather-cps, #minifeather-ping, #mf-keystrokes, #mf-coordinates-hud, #mf-waypoint-layer');
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

  function sendLanguageConfig() {
    
    const languages = ['en', 'es', 'ja', 'it', 'zh', 'fr', 'de', 'pt', 'ru', 'ko'];
    const strings = {};
    for (const lang of languages) {
      const table = TRANSLATIONS[lang] || TRANSLATIONS.en || {};
      for (const key of Object.keys(table)) {
        if (!strings[key]) strings[key] = {};
        strings[key][lang] = table[key];
      }
    }
    document.dispatchEvent(new CustomEvent('minifeather:language-config', {
      detail: JSON.stringify({ language: settings.language || 'en', strings })
    }));
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

  const MENU_BG_PATTERN = /\/assets\/default-[A-Za-z0-9_-]+\.(?:webp|png|jpg)/;

  function replaceBackground() {
    document.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (!src.includes('default-B1Dv6Hww') && img.dataset.mfBackground !== '1') return;

      img.dataset.mfBackground = '1';
      if (!img.hasAttribute('data-mf-original-src')) img.dataset.mfOriginalSrc = src;
      if (img.getAttribute('src') !== CONFIG.background) img.setAttribute('src', CONFIG.background);
    });

    const bodyStyle = document.body?.style;
    if (bodyStyle) {
      const bg = getComputedStyle(document.body).backgroundImage || '';
      if (MENU_BG_PATTERN.test(bg)) {
        if (!document.body.dataset.mfBgOriginal) {
          document.body.dataset.mfBgOriginal = bodyStyle.backgroundImage || '';
        }
        const local = `url("${CONFIG.background}")`;
        if (bodyStyle.backgroundImage !== local) bodyStyle.backgroundImage = local;
      } else if (document.body.dataset.mfBgOriginal) {
        
        bodyStyle.backgroundImage = document.body.dataset.mfBgOriginal;
        delete document.body.dataset.mfBgOriginal;
      }
    }
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

    if (document.body?.dataset.mfBgOriginal !== undefined) {
      document.body.style.backgroundImage = document.body.dataset.mfBgOriginal || '';
      delete document.body.dataset.mfBgOriginal;
    }
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

      let pingTarget = null;
      async function findPingTarget() {
        if (pingTarget !== null) return pingTarget;
        for (const path of ['/favicon.ico', '/manifest.json', '/index.html', '/']) {
          try {
            const res = await fetch(`${location.origin}${path}`, {
              method: 'HEAD',
              cache: 'no-store',
              credentials: 'omit'
            });
            if (res.ok) {
              pingTarget = path;
              return pingTarget;
            }
          } catch {}
        }
        pingTarget = '';
        return pingTarget;
      }

      // RTT real del websocket del juego: cero requests HTTP, cero 403.
      function socketRtt() {
        try {
          const g = window.miniblox?.player ? window.miniblox : (() => {
            const react = document.querySelector('#react');
            if (react) for (const key in react) {
              const game = react[key]?.updateQueue?.baseState?.element?.props?.game;
              if (game?.player) return game;
            }
            return null;
          })();
          let ws = null;
          try { ws = g?.connection?.socket || g?.socket || g?.network?.socket; } catch {}
          if (!ws) {
            // último recurso: cualquier websocket vivo del juego
            for (const k of Object.getOwnPropertyNames(globalThis)) {
              try {
                const v = globalThis[k];
                if (v instanceof WebSocket) { ws = v; break; }
              } catch {}
            }
          }
          if (ws && typeof ws.ping === 'function') {
            const v = Number(ws.ping());
            if (Number.isFinite(v) && v >= 0) return v;
          }
        } catch {}
        return null;
      }

      async function measure() {
        if (!enabled || measuring || document.hidden) return;
        if (!navigator.onLine) {
          ping = null;
          render();
          return;
        }

        // 1) RTT del websocket del juego (cero HTTP)
        const rtt = socketRtt();
        if (rtt !== null) {
          ping = rtt;
          render();
          return;
        }

        // 2) respaldo HTTP HEAD — solo si aún no sabemos que está bloqueado
        if (pingTarget === '') { ping = connectionRtt(); render(); return; }
        measuring = true;
        requestController?.abort();
        requestController = new AbortController();
        const timeout = window.setTimeout(() => requestController?.abort(), 4000);
        const started = performance.now();

        try {
          const target = pingTarget !== null ? pingTarget : await findPingTarget();
          if (!target) { ping = connectionRtt(); render(); return; }
          const res = await fetch(`${location.origin}${target}?mf_ping=${Date.now()}`, {
            method: 'HEAD',
            cache: 'no-store',
            credentials: 'omit',
            signal: requestController.signal
          });
          if (res.status === 403 || res.status === 429) {
            // Cloudflare/servidor bloquea el ping HTTP: no insistir más
            pingTarget = '';
            ping = connectionRtt();
            render();
            return;
          }

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
      .mf-shader-grid {
        display:grid;
        grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));
        gap:8px;
      }
      .mf-shader-grid .mf-btn {
        width:100%;
      }
      .mf-shader-strength {
        display:flex;
        align-items:center;
        gap:12px;
      }
      .mf-shader-strength input[type="range"] {
        flex:1;
        accent-color:var(--mf-accent2);
      }
      .mf-shader-strength span {
        min-width:44px;
        text-align:right;
        font-weight:600;
        color:var(--mf-accent2);
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
      .mf-client-chat-privacy {
        margin-top:4px;
        padding:10px 12px;
        border-radius:10px;
        border:1px solid rgba(245,158,11,.18);
        background:rgba(245,158,11,.07);
      }
      .mf-client-chat-head {
        display:flex;
        flex-wrap:wrap;
        gap:8px 14px;
        align-items:center;
        font-size:11px;
        color:#94a3b8;
      }
      #mf-client-chat-status[data-state="connected"] { color:#86efac; }
      #mf-client-chat-status[data-state="connecting"] { color:#fde68a; }
      #mf-client-chat-status[data-state="offline"] { color:#94a3b8; }
      .mf-client-chat-messages {
        height:260px;
        overflow:auto;
        display:flex;
        flex-direction:column;
        gap:8px;
        padding:10px;
        border:1px solid var(--mf-border);
        border-radius:12px;
        background:rgba(2,6,12,.48);
      }
      .mf-client-chat-message {
        padding:8px 10px;
        border-radius:10px;
        border:1px solid rgba(255,255,255,.06);
        background:rgba(255,255,255,.035);
      }
      .mf-client-chat-message.own {
        background:rgba(124,92,255,.10);
        border-color:rgba(124,92,255,.18);
      }
      .mf-client-chat-message.mentioned {
        background:rgba(245,158,11,.11);
        border-color:rgba(245,158,11,.32);
      }
      .mf-client-chat-meta {
        display:flex;
        justify-content:space-between;
        gap:10px;
        margin-bottom:3px;
        font-size:10px;
        color:#64748b;
      }
      .mf-client-chat-meta strong { color:#c4b5fd; font-size:11px; }
      .mf-client-chat-text {
        color:#e2e8f0;
        font-size:12px;
        line-height:1.45;
        overflow-wrap:anywhere;
      }
      .mf-client-chat-link {
        color:#93c5fd;
        text-decoration:underline;
        text-underline-offset:2px;
      }
      .mf-client-chat-inline-meme {
        display:block;
        width:auto;
        max-width:min(240px,100%);
        max-height:170px;
        margin-top:6px;
        border-radius:9px;
        object-fit:contain;
        background:rgba(0,0,0,.28);
      }
      .mf-client-chat-empty {
        margin:auto;
        color:#64748b;
        font-size:11px;
        text-align:center;
      }
      .mf-client-chat-compose {
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:8px;
      }
      .mf-client-chat-compose .mf-btn { width:auto; min-width:88px; }
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
          transform:translate(-50%,-50%) scale(1);
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
    style.textContent += `
      .mf-svg-icon {
        width:20px; height:20px; display:block;
        flex:0 0 auto; user-select:none; pointer-events:none;
      }
      .mf-pixel-icon {
        width:20px; height:20px; display:block; image-rendering:pixelated;
        flex:0 0 auto; user-select:none; pointer-events:none;
      }
      img.mf-pixel-icon { object-fit:contain; }
      .mf-nav-icon .mf-svg-icon { width:18px; height:18px; }
      .mf-nav-icon .mf-pixel-icon { width:18px; height:18px; }
      .mf-feather-grid-icon .mf-svg-icon { width:21px; height:21px; }
      .mf-feather-grid-icon .mf-pixel-icon { width:21px; height:21px; }
      .mf-feather-tab-icon .mf-svg-icon { width:22px; height:22px; }
      .mf-feather-tab-icon .mf-pixel-icon { width:22px; height:22px; }
      .mf-feather-close .mf-svg-icon { width:20px; height:20px; margin:auto; }
      .mf-feather-close .mf-pixel-icon { width:20px; height:20px; margin:auto; }
      .mf-feather-tool .mf-svg-icon { width:19px; height:19px; margin:auto; }
      .mf-feather-tool .mf-pixel-icon { width:19px; height:19px; margin:auto; }
      .mf-feature-icon .mf-svg-icon { width:54px; height:54px; opacity:.96; }
      .mf-feature-icon .mf-pixel-icon { width:64px; height:64px; opacity:.96; }
      .mf-feature-settings .mf-svg-icon { width:17px; height:17px; margin:auto; }
      .mf-feature-settings .mf-pixel-icon { width:17px; height:17px; margin:auto; }
      .mf-feature-favorite .mf-svg-icon { width:16px; height:16px; margin:auto; }
      .mf-feature-favorite .mf-pixel-icon { width:16px; height:16px; margin:auto; }
    `;
    style.textContent += `
      /* Feather-style GUI skin: visual-only overrides. */
      #mf-gui-overlay {
        background:rgba(0,0,0,.52);
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
      }
      #mf-gui {
        --mf-ui-accent:#ef3b3b;
        --mf-ui-panel:#0e1115;
        width:min(1122px, calc(100vw - 28px));
        height:min(694px, calc(100vh - 28px));
        top:50%;
        left:50%;
        transform:translate(-50%,-50%);
        border:0;
        border-radius:6px;
        background:var(--mf-ui-panel);
        box-shadow:0 28px 80px rgba(0,0,0,.72);
        overflow:hidden;
        color:#f3f4f6;
        font-family:'Faithful','Inter','Arial',sans-serif;
      }
      #mf-gui-shell { display:flex; flex-direction:column; height:100%; }
      #mf-gui-topbar {
        position:relative;
        height:71px;
        min-height:71px;
        padding:0;
        display:flex;
        align-items:flex-end;
        border:0;
        background:transparent;
      }
      .mf-feather-nav-main {
        display:flex;
        align-items:center;
        gap:7px;
        height:71px;
        padding:0 0 14px 0;
      }
      .mf-feather-main-tab, .mf-feather-icon-tab, .mf-feather-tool, .mf-feather-close, .mf-feather-category {
        font-family:'Faithful','Inter','Arial',sans-serif;
        border:0;
        outline:0;
        color:#d6d8dc;
        cursor:pointer;
      }
      .mf-feather-main-tab {
        height:56px;
        min-width:148px;
        padding:0 20px;
        border-radius:6px 6px 0 0;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:12px;
        background:#1a1d21;
        color:#f4f4f5;
        font-size:13px;
        font-weight:800;
        letter-spacing:.02em;
      }
      .mf-feather-main-tab.active { background:var(--mf-ui-accent); color:#fff; }
      .mf-feather-grid-icon { font-size:21px; line-height:1; }
      .mf-feather-icon-tabs { display:flex; align-items:center; gap:7px; }
      .mf-feather-icon-tab {
        width:58px; height:56px; border-radius:6px;
        display:flex; align-items:center; justify-content:center;
        background:#15181c; color:#d5d7da; font-size:23px;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.02);
      }
      .mf-feather-icon-tab:hover, .mf-feather-icon-tab.active { background:#20242a; color:#fff; }
      .mf-feather-icon-tab.active { box-shadow:inset 0 -3px 0 var(--mf-ui-accent); }
      #mf-gui-page-title {
        flex:0 1 112px;
        min-width:0;
        max-width:112px;
        margin:0 52px 17px 1px !important;
        font-size:12px !important;
        line-height:1.1;
        color:#f4f4f5 !important;
        text-align:left;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .mf-feather-close {
        position:absolute; right:0; bottom:14px; width:42px; height:42px;
        border-radius:6px; background:#171a1e; color:#ef4444; font-size:28px;
        line-height:1; border:1px solid rgba(239,68,68,.55);
      }
      .mf-feather-close:hover { background:#27191b; }
      #mf-gui-content { flex:1; min-height:0; background:color-mix(in srgb,var(--mf-ui-panel) 93%,#000 7%); display:flex; flex-direction:column; }
      #mf-feather-filterbar {
        height:68px; min-height:68px; padding:17px 20px 12px;
        display:flex; align-items:center; justify-content:space-between; gap:16px;
        background:color-mix(in srgb,var(--mf-ui-panel) 90%,#000 10%); border-bottom:1px solid #20252b;
      }
      .mf-feather-categories { display:flex; gap:10px; align-items:center; }
      .mf-feather-category {
        height:36px; min-width:94px; padding:0 17px; border-radius:6px;
        background:#181b1f; color:#777c83; font-size:12px; font-weight:700;
      }
      .mf-feather-category.active { background:var(--mf-ui-accent); color:#fff; }
      .mf-feather-category:hover { background:#23272c; color:#ddd; }
      .mf-feather-category.active:hover { background:var(--mf-ui-accent); }
      .mf-new-badge {
        display:inline-block; vertical-align:2px; margin-left:6px; padding:2px 7px;
        border-radius:999px; font:700 9px/1.3 system-ui,sans-serif; font-style:normal;
        letter-spacing:.06em; background:rgba(124,58,237,.18); border:1px solid rgba(167,139,250,.45);
        color:#c4b5fd;
      }
      .mf-feather-tools { display:flex; gap:9px; align-items:center; margin-left:auto; }
      #mf-gui-search {
        width:267px; max-width:267px; height:36px; margin:0; padding:0 15px;
        border-radius:6px; border:0; background:#181b1f; color:#eee; font-size:12px;
        box-sizing:border-box;
      }
      #mf-gui-search::placeholder { color:#70757b; }
      #mf-gui-search:focus { background:#1d2126; border:0; box-shadow:none; }
      .mf-feather-tool { width:36px; height:36px; border-radius:6px; background:#181b1f; color:#777c83; font-size:19px; }
      .mf-feather-tool:hover { background:#23272c; color:#fff; }
      #mf-gui-page {
        flex:1; min-height:0; overflow:auto; padding:12px 20px 20px;
        scrollbar-width:thin; scrollbar-color:#3c4249 #0c0f12;
      }
      #mf-gui-page::-webkit-scrollbar { width:9px; }
      #mf-gui-page::-webkit-scrollbar-track { background:#0c0f12; }
      #mf-gui-page::-webkit-scrollbar-thumb { background:#3b4148; border:2px solid #0c0f12; border-radius:4px; }
      #mf-gui-page h1, #mf-gui-page .mf-card-title { text-transform:none; letter-spacing:0; }
      .mf-page-stack { gap:12px; }
      .mf-feather-module-grid {
        display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px;
      }
      .mf-toggle {
        height:178px; min-width:0; padding:18px 18px 13px; box-sizing:border-box;
        border-radius:6px; border:1px solid #252a30; background:linear-gradient(180deg,#11151a,#101317);
        align-items:flex-start; justify-content:flex-start; text-align:left; gap:0;
        overflow:hidden; transform:none !important;
      }
      .mf-toggle:hover { border-color:#333941; background:linear-gradient(180deg,#15191e,#11151a); }
      .mf-toggle:has(.mf-switch-hidden:checked) { border-color:#252a30; background:linear-gradient(180deg,#11151a,#101317); }
      .mf-toggle-dot { display:none; }
      .mf-feature-icon {
        width:100%; height:73px; display:flex; align-items:center; justify-content:center;
        color:#e9eaec; font-size:47px; line-height:1; font-weight:400;
        text-shadow:0 1px 0 rgba(0,0,0,.5); opacity:.96;
      }
      .mf-toggle-copy { width:100%; display:flex; flex-direction:column; align-items:center; gap:3px; text-align:center; }
      .mf-toggle-copy strong { font-size:15px; color:#e8e9eb; font-weight:800; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
      .mf-toggle-copy span { display:none; }
      .mf-feature-settings {
        position:absolute; left:12px; bottom:11px; width:35px; height:35px;
        border:0; border-radius:5px; background:#1b2025; color:#777c82; font-size:17px;
        cursor:pointer; z-index:3;
      }
      .mf-feature-settings:hover { color:#e5e7eb; background:#252a30; }
      .mf-feature-favorite {
        position:absolute; right:12px; top:11px; width:30px; height:30px; border:0; border-radius:5px;
        background:#1b2025; color:#686e75; font-size:16px; cursor:pointer; z-index:4;
      }
      .mf-feature-favorite:hover { color:#fff; background:#252a30; }
      .mf-feature-favorite.active { color:var(--mf-ui-accent); background:color-mix(in srgb,var(--mf-ui-accent) 16%,#15181c 84%); }
      .mf-feather-tool.active { color:var(--mf-ui-accent); background:color-mix(in srgb,var(--mf-ui-accent) 16%,#15181c 84%); }
      .mf-feature-settings, .mf-feature-favorite { font-family:Arial,sans-serif; }
      .mf-switch-hidden { pointer-events:none !important; }
      .mf-feature-settings, .mf-feature-favorite { pointer-events:auto !important; }
      .mf-feature-modal-backdrop { position:fixed; inset:0; z-index:100000; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.62); backdrop-filter:blur(3px); }
      .mf-feature-modal { width:min(440px,calc(100vw - 32px)); max-height:80vh; overflow:auto; background:#101419; border:1px solid #30363d; border-radius:8px; box-shadow:0 24px 80px rgba(0,0,0,.55); padding:20px; color:#eee; }
      .mf-feature-modal-title { font-size:19px; font-weight:800; margin-bottom:5px; }
      .mf-feature-modal-desc { color:#858b93; font-size:12px; line-height:1.45; margin-bottom:18px; }
      .mf-feature-modal-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 0; border-top:1px solid #252a30; }
      .mf-feature-modal-row span { font-size:13px; font-weight:700; }
      .mf-feature-modal-actions { display:flex; gap:9px; margin-top:18px; }
      .mf-feature-modal-actions button { flex:1; }

      .mf-feature-state {
        position:absolute; left:61px; right:12px; bottom:11px; height:35px;
        border-radius:5px; display:flex; align-items:center; justify-content:center;
        font-size:12px; font-weight:700;
      }
      .mf-feature-state.disabled { background:#1a1e22; color:#6f747a; }
      .mf-feature-state.enabled { background:#125a1c; color:#21c43b; }
      .mf-switch-hidden { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; z-index:2; pointer-events:auto; }
      .mf-toggle:has(.mf-feature-settings:hover) .mf-switch-hidden { pointer-events:none; }
      .mf-card { background:linear-gradient(180deg,#12161a,#0f1317); border:1px solid #252a30; border-radius:6px; padding:16px; }
      .mf-grid { grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
      .mf-settings-row { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:12px; padding-top:12px; border-top:1px solid #252a30; }
      .mf-settings-label { color:#c7cbd0; font-size:12px; font-weight:700; }
      .mf-language-select { width:150px; margin:0; }
      #mf-gui-page .mf-muted { color:#7c828a; }
      #mf-gui-page .mf-btn.primary { background:var(--mf-ui-accent); border-color:var(--mf-ui-accent); }
      #mf-gui-page .mf-btn.primary:hover { background:color-mix(in srgb,var(--mf-ui-accent) 86%,#fff 14%); }
      @media (max-width: 1100px) {
        .mf-feather-module-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .mf-feather-icon-tab { width:50px; }
        .mf-feather-main-tab { min-width:136px; }
        #mf-gui-page-title { max-width:92px; margin-right:50px !important; }
      }
      @media (max-width: 780px) {
        #mf-gui {
          width:calc(100vw - 12px);
          height:calc(100vh - 12px);
        }
        .mf-feather-module-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .mf-feather-categories { overflow-x:auto; }
        .mf-feather-category { min-width:72px; }
        .mf-feather-tools { min-width:0; }
        #mf-gui-search { width:160px; max-width:160px; }
        .mf-feather-icon-tab { width:42px; }
        #mf-gui-page-title { display:none; }
      }

      .mf-toggle-grid {
        display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px;
      }
      .mf-toggle-grid .mf-toggle {
        height:178px; min-width:0; padding:18px 18px 13px; box-sizing:border-box;
        border-radius:6px; border:1px solid #252a30; background:linear-gradient(180deg,#11151a,#101317);
        align-items:flex-start; justify-content:flex-start; text-align:left; gap:0; overflow:hidden; transform:none !important;
      }
      .mf-toggle-grid .mf-toggle:hover { border-color:#333941; background:linear-gradient(180deg,#15191e,#11151a); }
      .mf-toggle-grid .mf-toggle-copy span { display:none; }
      .mf-toggle-grid .mf-feature-icon { width:100%; height:73px; display:flex; align-items:center; justify-content:center; }
      .mf-toggle-grid .mf-toggle-copy { width:100%; display:flex; flex-direction:column; align-items:center; gap:3px; text-align:center; }
      .mf-toggle-grid .mf-feature-settings { position:absolute; left:12px; bottom:11px; }
      .mf-toggle-grid .mf-feature-favorite { position:absolute; right:12px; top:11px; }
      .mf-experimental-level {
        position:absolute; left:12px; bottom:13px; width:auto; min-width:104px; height:30px;
        padding:4px 28px 4px 9px; font-size:12px; line-height:1; border-radius:7px;
        background:#0d1116; color:#d8dce2; border:1px solid #2c333c; cursor:pointer;
        z-index:5; pointer-events:auto;
      }
      .mf-experimental-level:hover { border-color:#414a56; }
      .mf-toggle:has(.mf-experimental-level) .mf-feature-state { left:128px; }
      .mf-toggle:has(.mf-experimental-level) .mf-switch-hidden { z-index:2; }
      @media (max-width:1100px) { .mf-toggle-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
      @media (max-width:780px) { .mf-toggle-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    `;
    document.head.appendChild(style);
  }

  function getModuleIndex() {
    return [
      { page: 'hud', key: 'keystrokes', title: t('keystrokes'), desc: t('keystrokesDesc'), tags: ['hud'] },
      { page: 'hud', key: 'fpsCounter', title: t('fpsCounter'), desc: t('fpsCounterDesc'), tags: ['hud'] },
      { page: 'hud', key: 'cpsCounter', title: t('cpsCounter'), desc: t('cpsCounterDesc'), tags: ['hud', 'pvp'] },
      { page: 'hud', key: 'pingCounter', title: t('pingCounter'), desc: t('pingCounterDesc'), tags: ['hud', 'pvp'] },
      { page: 'hud', key: 'armorHud', title: t('armorHud'), desc: t('armorHudDesc'), tags: ['hud', 'pvp'] },
      { page: 'hud', key: 'guiPatch', title: t('guiPatch'), desc: t('guiPatchDesc'), tags: ['hud'] },
      { page: 'hud', key: 'coordinates', title: t('coordinates'), desc: t('coordinatesDesc'), tags: ['hud'] },
      { page: 'hud', key: 'dynamicCrosshair', title: t('dynamicCrosshair'), desc: t('dynamicCrosshairDesc'), tags: ['hud', 'pvp', 'new'] },
      { page: 'waypoints', key: 'waypoints', title: t('waypoints'), desc: t('waypointsDesc'), tags: ['new'] },
      { page: 'render', key: 'rebrand', title: t('rebrand'), desc: t('rebrandDesc'), tags: [] },
      { page: 'render', key: 'titanTiny', title: t('titanTiny'), desc: t('titanTinyDesc'), tags: [] },
      { page: 'render', key: 'betterPlayerLayers', title: t('betterPlayerLayers'), desc: t('betterPlayerLayersDesc'), tags: [] },
      { page: 'render', key: 'healthNameTags', title: t('healthNameTags'), desc: t('healthNameTagsDesc'), tags: ['pvp'] },
      { page: 'render', key: 'distanceNameTags', title: t('distanceNameTags'), desc: t('distanceNameTagsDesc'), tags: ['pvp'] },
      { page: 'render', key: 'damageParticles', title: t('damageParticles'), desc: t('damageParticlesDesc'), tags: ['pvp'] },
      { page: 'render', key: 'waterSplash', title: t('waterSplash'), desc: t('waterSplashDesc'), tags: ['new'] },
      { page: 'render', key: 'patPat', title: t('patPat'), desc: t('patPatDesc'), tags: [] },
      { page: 'render', key: 'itemPhysics', title: t('itemPhysics'), desc: t('itemPhysicsDesc'), tags: [] },
      { page: 'render', key: 'noWeather', title: t('noWeather'), desc: t('noWeatherDesc'), tags: [] },
      { page: 'render', key: 'vanillaAnimations', title: t('vanillaAnimations'), desc: t('vanillaAnimationsDesc'), tags: [] },
      { page: 'render', key: 'zoom', title: t('zoom'), desc: t('zoomDesc'), tags: ['pvp'] },
      { page: 'render', key: 'cameraOverhaul', title: t('cameraOverhaul'), desc: t('cameraOverhaulDesc'), tags: [] },
      { page: 'render', key: 'elytraFlight', title: t('elytraFlight'), desc: t('elytraFlightDesc'), tags: [] },
      { page: 'render', key: 'freecam', title: t('freecam'), desc: t('freecamDesc'), tags: [] },
      { page: 'shaders', key: 'customShader', title: t('navShaders'), desc: t('shadersDesc'), tags: [] },
      { page: 'movement', key: 'autoSprint', title: t('autoSprint'), desc: t('autoSprintDesc'), tags: ['pvp'] },
      { page: 'movement', key: 'safeSneak', title: t('safeSneak'), desc: t('safeSneakDesc'), tags: ['pvp'] },
      { page: 'movement', key: 'antiAfk', title: t('antiAfk'), desc: t('antiAfkDesc'), tags: [] },
      { page: 'world', key: 'autoRespawn', title: t('autoRespawn'), desc: t('autoRespawnDesc'), tags: ['pvp'] },
      { page: 'world', key: 'rhythmParkour', title: t('rhythmParkour'), desc: t('rhythmParkourDescShort'), tags: ['new'] },
      { page: 'chat', key: 'chatVideos', title: t('chatVideos'), desc: t('chatVideosDesc'), tags: [] },
      { page: 'chat', key: 'chatLinks', title: t('chatLinks'), desc: t('chatLinksDesc'), tags: [] },
      { page: 'chat', key: 'chatMemes', title: t('chatMemes'), desc: t('chatMemesDesc'), tags: [] },
      { page: 'chat', key: 'clientChat', title: t('clientChat'), desc: t('clientChatDesc'), tags: ['new'] },
      { page: 'settings', key: 'discord', title: t('discordRedirect'), desc: t('discordRedirectDesc'), tags: [] },
      { page: 'settings', key: 'supportAds', title: t('supportAds'), desc: t('supportAdsDesc'), tags: [] }
    ];
  }

  const MF_SVG_ICONS = {
    home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
    hud:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    render:'<path d="m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3Z"/>',
    cosmetics:'<path d="M6 3h12l3 5-3 13H6L3 8l3-5Z"/><path d="M8 3c0 2 1.8 4 4 4s4-2 4-4M3 8h18"/>',
    chat:'<path d="M4 5h16v11H8l-4 4V5Z"/><path d="M8 9h8M8 12h5"/>',
    waypoints:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    movement:'<path d="M4 16h5l3-5 3 2 5-1"/><path d="M5 19h14M8 12l2-5 4 1 2 3"/>',
    world:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.2 2.5 3.2 5.5 3.2 9S14.2 18.5 12 21c-2.2-2.5-3.2-5.5-3.2-9S9.8 5.5 12 3Z"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.84 1.84-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20h-2.6v-.09a1.7 1.7 0 0 0-1.03-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-1.84-1.84.06-.06A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.55-1.03H6.36v-2.6h.09A1.7 1.7 0 0 0 8 10.34a1.7 1.7 0 0 0-.34-1.88L7.6 8.4l1.84-1.84.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.55v-.09h2.6v.09a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.84 1.84-.06.06A1.7 1.7 0 0 0 19.4 10c.22.62.8 1.03 1.45 1.03h.09v2.6h-.09c-.65 0-1.23.41-1.45 1.03Z"/>',
    about:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    heart:'<path d="M20.8 8.7c0 5-8.8 10.3-8.8 10.3S3.2 13.7 3.2 8.7A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.8 2.3Z"/>',
    keystrokes:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 14h10"/>',
    fpsCounter:'<path d="M4 5h16v14H4z"/><path d="M8 15V11M12 15V8M16 15v-5"/>',
    cpsCounter:'<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>',
    pingCounter:'<path d="M4 12a8 8 0 0 1 16 0"/><path d="M7 12a5 5 0 0 1 10 0M10 12a2 2 0 0 1 4 0"/><path d="M12 12v.01"/>',
    guiPatch:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 13h3M13 13h3M8 16h8"/>',
    armorHud:'<path d="M8 3h8l2 4-2 14H8L6 7l2-4Z"/><path d="M9 7h6M8 11h8M9 16h6"/>',
    coordinates:'<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5M8 17h3"/>',
    dynamicCrosshair:'<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    rebrand:'<path d="m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3Z"/><path d="M12 8v6M9 11h6"/>',
    titanTiny:'<path d="M8 3h8l2 4-2 14H8L6 7l2-4Z"/><path d="M9 7h6M10 11h4"/>',
    healthNameTags:'<path d="M12 20S4 15.5 4 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.5 12 20 12 20Z"/>',
    distanceNameTags:'<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
    patPat:'<path d="M7 11c1-4 4-6 7-6 3.5 0 6 2.5 6 6 0 5-4 9-8 9s-8-4-8-9c0-2 .7-3.6 2-5"/><path d="M9 13c1 1 3 1 4 0"/>',
    itemPhysics:'<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    noWeather:'<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 11.5 3.5 3.5 0 0 0 7 18Z"/><path d="M4 4l16 16"/>',
    vanillaAnimations:'<circle cx="12" cy="12" r="8"/><path d="M9 9l6 6M15 9l-6 6"/>',
    zoom:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M10.5 7v7M7 10.5h7"/>',
    cameraOverhaul:'<path d="M4 7h3l1.5-2h7L17 7h3v12H4V7Z"/><circle cx="12" cy="13" r="4"/>',
    elytraFlight:'<path d="M3 17c3-1 6-4 9-9 3 5 6 8 9 9-4 1-7 1-9-1-2 2-5 2-9 1Z"/>',
    freecam:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    blockHighlight:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    antiAfk:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    rhythmParkour:'<path d="M5 17V7h4l3 10 3-10h4v10"/>',
    chatVideos:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/>',
    chatLinks:'<path d="M10 13a5 5 0 0 0 7.1.1l1.8-1.8a5 5 0 0 0-7.1-7.1L10.7 5.3"/><path d="M14 11a5 5 0 0 0-7.1-.1l-1.8 1.8a5 5 0 0 0 7.1 7.1l1.1-1.1"/>',
    chatMemes:'<circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M8.5 14c1.2 1.5 5.8 1.5 7 0"/>',
    clientChat:'<path d="M4 5h16v11H8l-4 3V5Z"/><path d="M8 9h8M8 12h5"/>',
    discord:'<path d="M7 7.5A13 13 0 0 1 12 6a13 13 0 0 1 5 1.5 14 14 0 0 1 2 9.5c-2 1.5-4 2-6 2l-1-2-1 2c-2 0-4-.5-6-2A14 14 0 0 1 7 7.5Z"/><path d="M9 12h.01M15 12h.01"/>',
    supportAds:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9h4a2 2 0 0 1 0 4H9h3a2 2 0 0 1 0 4H9"/>',
    shaders:'<path d="M12 3 4 8l8 5 8-5-8-5Z"/><path d="M4 13l8 5 8-5M4 18l8 3 8-3"/>',
    experimental:'<path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 17l-5-9V3"/><path d="M8 14h8"/><circle cx="10" cy="17" r=".7"/><circle cx="14.5" cy="16.5" r=".7"/>'
  };

  function iconSvg(name, className = '') {
    if (HAND_DRAWN_ICONS.has(name)) return handDrawnIconImg(name, className);
    if (MF_PIXEL_ICONS[name]) return pixelIconSvg(name, className);
    const key = MF_SVG_ICONS[name] ? name : 'grid';
    return `<svg class="mf-svg-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MF_SVG_ICONS[key]}</svg>`;
  }

  // ── Pixel-art icons (8×8, Minecraft-style) ─────────────────────
  // Cada icono = 8 filas de 8 chars. La paleta mapea char → color.
  const PIXEL_PALETTE = {
    '.': null,          // transparente
    '#': '#f2f3f7',     // blanco highlight
    '+': '#aab0bd',     // outline gris claro
    '-': '#565d6b',     // gris oscuro
    'a': '#a78bfa',     // acento morado
    'b': '#6ee7f5',     // cian
    'g': '#5ade80',     // verde
    'r': '#f0575b',     // rojo
    'y': '#f3c53d',     // amarillo
    'o': '#f08c3a',     // naranja
    'p': '#f48fb8',     // rosa
    'k': '#22252c'      // casi negro
  };

  // Iconos dibujados a mano por el equipo (assets/ui/*.png). Tienen prioridad
  // sobre los pixel generados: se resuelven de forma síncrona con getURL y el
  // <img> se monta dentro del mismo wrapper que los SVG/pixel.
  const HAND_DRAWN_ICONS = new Set([
    'armorHud', 'betterPlayerLayers', 'coordinates', 'cpsCounter', 'dynamicCrosshair',
    'experimental', 'fpsCounter', 'guiPatch', 'keystrokes', 'pingCounter',
    'rebrand', 'titanTiny', 'waypoints'
  ]);

  function handDrawnIconImg(name, className = '') {
    const url = chrome.runtime.getURL(`assets/ui/${name}.png`);
    return `<img class="mf-pixel-icon ${className}" src="${url}" alt="" aria-hidden="true"/>`;
  }

  const MF_PIXEL_ICONS = {
    home:      ['...++...','..+..+..','.+....+.','.+....+.','+......+','+.+..+.+','+......+','.++++++.'],
    grid:      ['++..++..','++..++..','........','++..++..','++..++..','........','++..++..','++..++..'],
    close:     ['.+....+.','..+..+..','...++...','...++...','..+..+..','.+....+.','........','........'],
    search:    ['..+++...','.+...+..','+.....+.','+.....+.','.+...+..','..+++a+.','.....aa.','......a.'],
    heart:     ['.pp..pp.','p#pppppp','pppppppp','pppppppp','.pppppp.','..pppp..','...pp...','........'],
    settings:  ['..+..+..','.++++++.','++....++','+..++..+','+..++..+','++....++','.++++++.','..+..+..'],
    hud:       ['++++++++','+......+','+.++++.+','+......+','+.++.+.+','+......+','++++++++','........'],
    render:    ['...++...','..+bb+..','.+b##b+.','+b####b+','.+b##b+.','..+bb+..','...++...','........'],
    cosmetics: ['.++++++.','.+####+.','.++++++.','+.+#y#.+','+.+##+.+','+.####.+','.++++++.','........'],
    chat:      ['.++++++.','+......+','+.+.+.+.','+......+','.++++++.','..+.....','.+......','........'],
    waypoints: ['...++...','...+....','.+aaa+..','.+a#a+..','.+aaa+..','...+....','...+....','........'],
    movement:  ['..++....','..++....','..++....','..++.+..','..+++...','.+++++..','.++++++.','........'],
    world:     ['..++++..','.+ggggg+','+gg#+gg+','+g++++g+','+gg+ggg+','.+gggg.+','..++++..','........'],
    about:     ['..++++..','.+....+.','+..++..+','+......+','+..++..+','+..++..+','.+....+.','..++++..'],
    shaders:   ['........','.++++++.','++++++++','+#+bb+#+','++++++++','.++++++.','........','........'],
    experimental: ['...++...','...++...','..+..+..','..+..+..','+.+gg.+.','+..gg..+','+.gggg.+','.++++++.'],
    keystrokes: ['++++++++','+.+.+.+.','++++++++','+.+.+.+.','++++++++','+.aaa..+','++++++++','........'],
    fpsCounter:  ['........','......bb','.....bbb','....bb..','...bb...','..bb....','.bb.....','bbbb....'],
    cpsCounter:  ['+##.....','+.+#..a.','+..#..a.','+...a.a.','+...#...','+...#...','.+++.+..','........'],
    pingCounter: ['.....bb.','.....bb.','..b..bb.','..b..bb.','b.b.b.b.','b.b.b.b.','bbb.bbb.','........'],
    guiPatch:    ['.rr..rr.','r#rrrrrr','rrrrrrrr','rrrrrrrr','.rrrrrr.','..rrrr..','...rr...','........'],
    armorHud:    ['+.+..+.+','++++++++','+##++##+','+######+','+.####.+','+.####.+','++++++++','........'],
    coordinates: ['...++...','+..++..+','.+....+.','..+aa+..','..+aa+..','.+....+.','+..++..+','...++...'],
    dynamicCrosshair: ['...++...','...++...','...++...','+++..+++','...++...','...++...','...++...','........'],
    rebrand:  ['...bb...','...bb...','.bbbbbb.','bbb##bbb','.bb##bb.','.bb..bb.','+b....b+','........'],
    titanTiny:   ['.++++.+.','.+##+.++','+++++++#','.+##+#+.','.+..+.++','........','........','........'],
    healthNameTags: ['.rr..rr.','rrrrrrrr','.rrrrrr.','..rrrr..','........','.++++++.','+#aaaa#+','.++++++.'],
    distanceNameTags: ['.++++++.','+.aa..+.','.++++++.','........','+.....+.','.+...+..','..+.+...','...+....'],
    patPat:   ['.+.+.+..','.+.+.+..','.+.+.+..','.+++++..','+.....+.','+.....+.','.+++++..','........'],
    itemPhysics: ['.++++++.','.+####+.','.++++++.','........','...++...','..+..+..','...++...','........'],
    noWeather:   ['...b....','.b.b.b..','..bbb...','.bb#bb..','..bbb...','.b.b.b..','...b....','........'],
    vanillaAnimations: ['..####..','..####..','..++++..','.######.','#.#aa#.#','..####..','..+..+..','.+..+...'],
    zoom:     ['..+++...','.+...+..','+..+..+.','+.....+.','.+...+a.','..+++a..','.....aa.','......a.'],
    cameraOverhaul: ['...++...','.++++++.','+#+##+#+','+......+','+.#+#.++','+......+','.++++++.','........'],
    elytraFlight: ['++....++','+++..+++','.++..++.','.++++++.','..+##+..','..+##+..','..+..+..','........'],
    freecam:  ['........','..++++..','.+....+.','+.+aa+.+','+.+aa+.+','.+....+.','..++++..','........'],
    freelook: ['..++++..','.+####+.','+a#..#a+','+......+','+..aa..+','.+####+.','..++++..','........'],
    blockHighlight: ['.++++++.','.+....+.','+.++.+.+','+.++.+.+','.+....+.','.+....+.','.++++++.','........'],
    antiAfk:  ['..++++..','.+....+.','+..#+..+','+..#+..+','+...+..+','.+....+.','..++++..','........'],
    rhythmParkour: ['.....##.','.....##.','.....#..','.....#..','.....#..','..##.#..','.####...','..##....'],
    chatVideos: ['++++++++','+......+','+.##...+','+.###..+','+.##...+','+......+','++++++++','........'],
    chatLinks: ['.+++++..','.+...+..','+.+++++.','.+...+..','.+++++..','...+....','...++++.','...+....'],
    chatMemes: ['..++++..','.+....+.','+.+..+.+','+......+','+.+..+.+','+..##..+','.+....+.','..++++..'],
    clientChat: ['.++++++.','+.aaaa.+','+.a##a.+','+.aaaa.+','.+++++..','..+.....','.+......','........'],
    discord:  ['..+..+..','.+....+.','+......+','+.+..+.+','+.+..+.+','+......+','.+....+.','........'],
    supportAds: ['..++++..','.+yyyy+.','+y...y.+','+.yyy..+','+..y...+','+y...y.+','.+yyyy+.','..++++..']
  };

  function pixelIconSvg(name, className = '') {
    const grid = MF_PIXEL_ICONS[name];
    let rects = '';
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        const color = PIXEL_PALETTE[row[x]];
        if (color) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
      }
    }
    return `<svg class="mf-pixel-icon ${className}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  function renderNavList() {
    return NAV_ITEMS.map(item => `
      <div class="mf-nav ${activePage === item.id && !searchQuery ? 'active' : ''}" data-page="${item.id}">
        <span class="mf-nav-icon">${iconSvg(item.id === 'dashboard' ? 'home' : item.id)}</span>
        <span>${t(item.labelKey)}</span>
      </div>
    `).join('');
  }

  function featherNavIcon(page) {
    const icons = {
      hud: 'hud', render: 'render', shaders: 'shaders', experimental: 'experimental', cosmetics: 'cosmetics', chat: 'chat',
      waypoints: 'waypoints', movement: 'movement', world: 'world', settings: 'settings', about: 'about'
    };
    return iconSvg(icons[page] || 'grid');
  }

  function moduleIcon(key) {
    const icons = {
      keystrokes:'keystrokes', fpsCounter:'fpsCounter', cpsCounter:'cpsCounter', pingCounter:'pingCounter', guiPatch:'guiPatch', armorHud:'armorHud',
      coordinates:'coordinates', dynamicCrosshair:'dynamicCrosshair', rebrand:'rebrand', titanTiny:'titanTiny', healthNameTags:'healthNameTags',
      distanceNameTags:'distanceNameTags', patPat:'patPat', itemPhysics:'itemPhysics', noWeather:'noWeather', vanillaAnimations:'vanillaAnimations',
      zoom:'zoom', cameraOverhaul:'cameraOverhaul', elytraFlight:'elytraFlight', freelook:'freelook', freecam:'freecam', blockHighlight:'blockHighlight',
      waypoints:'waypoints', customShader:'shaders', autoSprint:'movement', safeSneak:'movement', antiAfk:'antiAfk', rhythmParkour:'rhythmParkour', chatVideos:'chatVideos', chatLinks:'chatLinks', chatMemes:'chatMemes', clientChat:'clientChat',
      discord:'discord', supportAds:'supportAds'
    };
    return iconSvg(icons[key] || 'grid');
  }

  function getPanelTemplate() {
    return `
      <div id="mf-gui-shell">
        <div id="mf-gui-topbar">
          <div class="mf-feather-nav-main">
            <button class="mf-feather-main-tab ${activePage === 'dashboard' && !searchQuery ? 'active' : ''}" data-page="dashboard">
              <span class="mf-feather-grid-icon">${iconSvg('grid')}</span>
              <span>${t('modMenu')}</span>
            </button>
            <div class="mf-feather-icon-tabs">
              ${NAV_ITEMS.filter(item => item.id !== 'dashboard').map(item => `
                <button class="mf-feather-icon-tab ${activePage === item.id && !searchQuery ? 'active' : ''}" data-page="${item.id}" title="${t(item.labelKey)}">
                  <span class="mf-feather-tab-icon">${featherNavIcon(item.id)}</span>
                </button>
              `).join('')}
            </div>
          </div>
          <h2 id="mf-gui-page-title" aria-hidden="true"></h2>
          <button id="mf-gui-close" class="mf-feather-close" title="${t('close')}">${iconSvg('close')}</button>
        </div>

        <div id="mf-gui-content">
          <div id="mf-feather-filterbar">
            <div class="mf-feather-categories">
              <button class="mf-feather-category ${activeCategory === 'all' ? 'active' : ''}" data-category="all">${t('filterAll')}</button>
              <button class="mf-feather-category ${activeCategory === 'new' ? 'active' : ''}" data-category="new">${t('filterNew')}</button>
              <button class="mf-feather-category ${activeCategory === 'hud' ? 'active' : ''}" data-category="hud">${t('filterHud')}</button>
              <button class="mf-feather-category ${activeCategory === 'pvp' ? 'active' : ''}" data-category="pvp">${t('filterPvp')}</button>
            </div>
            <div class="mf-feather-tools">
              <input id="mf-gui-search" type="text" placeholder="${t('searchPlaceholder')}" value="${searchQuery.replace(/"/g, '&quot;')}">
              <button class="mf-feather-tool ${favoritesOnly ? 'active' : ''}" type="button" data-mf-favorites title="${t('favorites')}">${iconSvg('heart')}</button>
              <button class="mf-feather-tool" type="button" title="${t('grid')}">${iconSvg('grid')}</button>
            </div>
          </div>
          <div id="mf-gui-page"></div>
        </div>
      </div>
    `;
  }

  function renderToggle(key, title, description, opts) {
    const enabled = !!guiSettings[key];
    const favorite = favoriteModules.has(key);
    const isNew = !!(opts && opts.tags && opts.tags.includes('new'));
    return `
      <label class="mf-toggle" data-key="${key}">
        <span class="mf-feature-icon" aria-hidden="true">${moduleIcon(key)}</span>
        <span class="mf-toggle-copy">
          <strong>${title}${isNew ? ' <em class="mf-new-badge">NEW</em>' : ''}</strong>
          <span>${description}</span>
        </span>
        <button type="button" class="mf-feature-favorite ${favorite ? 'active' : ''}" data-mf-favorite title="${favorite ? t('removeFavorite') : t('addFavorite')}" aria-label="${favorite ? t('removeFavorite') : t('addFavorite')}">${iconSvg('heart')}</button>
        <button type="button" class="mf-feature-settings" data-mf-settings title="${t('configureModule', { module: title })}">${iconSvg('settings')}</button>
        <span class="mf-feature-state ${enabled ? 'enabled' : 'disabled'}">${enabled ? t('enabled') : t('disabled')}</span>
        <input type="checkbox" class="mf-switch-hidden" ${enabled ? 'checked' : ''}>
      </label>
    `;
  }

  const COMMAND_MODULE_ALIASES = Object.freeze({
    afk: 'antiAfk', antiafk: 'antiAfk',
    autosprint: 'autoSprint', sprint: 'autoSprint',
    safesneak: 'safeSneak', autosneak: 'safeSneak',
    armor: 'armorHud', armorhud: 'armorHud',
    camera: 'cameraOverhaul', cameraoverhaul: 'cameraOverhaul',
    elytra: 'elytraFlight', elytraflight: 'elytraFlight', barrelroll: 'elytraFlight', flight: 'elytraFlight',
    coords: 'coordinates', coordinates: 'coordinates',
    crosshair: 'dynamicCrosshair', dynamiccrosshair: 'dynamicCrosshair',
    cps: 'cpsCounter', cpscounter: 'cpsCounter',
    distance: 'distanceNameTags', distancenametags: 'distanceNameTags',
    damage: 'damageParticles', damageparticles: 'damageParticles',
    fps: 'fpsCounter', fpscounter: 'fpsCounter',
    gui: 'guiPatch', guipatch: 'guiPatch',
    freelook: 'freelook',
    freecam: 'freecam', freecamera: 'freecam',
    health: 'healthNameTags', healthnametags: 'healthNameTags',
    highlight: 'blockHighlight', blockhighlight: 'blockHighlight',
    item: 'itemPhysics', itemphysics: 'itemPhysics', physics: 'itemPhysics',
    keys: 'keystrokes', keystrokes: 'keystrokes',
    noweather: 'noWeather', weather: 'noWeather',
    leafwind: 'leafWind', leaves: 'leafWind', foliage: 'leafWind',
    pat: 'patPat', patpat: 'patPat',
    ping: 'pingCounter', pingcounter: 'pingCounter',
    titan: 'titanTiny', tiny: 'titanTiny', titantiny: 'titanTiny',
    vanilla: 'vanillaAnimations', vanillaanimations: 'vanillaAnimations',
    leaf: 'leafWind', leafwind: 'leafWind', wind: 'leafWind',
    hand: 'handSway', handsway: 'handSway', sway: 'handSway',
    playerlayer: 'betterPlayerLayers', playerlayers: 'betterPlayerLayers', betterplayerlayer: 'betterPlayerLayers', betterplayerlayers: 'betterPlayerLayers', layers: 'betterPlayerLayers',
    waypoint: 'waypoints', waypoints: 'waypoints',
    zoom: 'zoom'
  });

  const COMMAND_MODULE_TRANSLATION_KEYS = Object.freeze({
    antiAfk: 'antiAfk', autoSprint: 'autoSprint', safeSneak: 'safeSneak', armorHud: 'armorHud',
    cameraOverhaul: 'cameraOverhaul', elytraFlight: 'elytraFlight', coordinates: 'coordinates',
    dynamicCrosshair: 'dynamicCrosshair', cpsCounter: 'cpsCounter', damageParticles: 'damageParticles',
    distanceNameTags: 'distanceNameTags', fpsCounter: 'fpsCounter', freelook: 'freelook', freecam: 'freecam',
    guiPatch: 'guiPatch', handSway: 'handSway', betterPlayerLayers: 'betterPlayerLayers',
    healthNameTags: 'healthNameTags', blockHighlight: 'blockHighlight', itemPhysics: 'itemPhysics',
    keystrokes: 'keystrokes', noWeather: 'noWeather', leafWind: 'leafWind', patPat: 'patPat',
    pingCounter: 'pingCounter', titanTiny: 'titanTiny', vanillaAnimations: 'vanillaAnimations',
    waypoints: 'waypoints', zoom: 'zoom'
  });

  function commandModuleLabel(key) {
    const translationKey = COMMAND_MODULE_TRANSLATION_KEYS[key];
    return translationKey ? t(translationKey) : key;
  }

  function resolveCommandModule(value) {
    const normalized = String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
    return COMMAND_MODULE_ALIASES[normalized] || null;
  }

  function normalizeBindCode(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^[a-z]$/i.test(raw)) return `Key${raw.toUpperCase()}`;
    if (/^[0-9]$/.test(raw)) return `Digit${raw}`;
    if (/^f(?:[1-9]|1[0-2])$/i.test(raw)) return raw.toUpperCase();
    const aliases = {
      space: 'Space', tab: 'Tab', enter: 'Enter', escape: 'Escape', esc: 'Escape',
      rightshift: 'ShiftRight', rshift: 'ShiftRight', leftshift: 'ShiftLeft', lshift: 'ShiftLeft',
      rightctrl: 'ControlRight', rctrl: 'ControlRight', leftctrl: 'ControlLeft', lctrl: 'ControlLeft',
      rightalt: 'AltRight', ralt: 'AltRight', leftalt: 'AltLeft', lalt: 'AltLeft',
      backquote: 'Backquote', grave: 'Backquote', minus: 'Minus', equal: 'Equal',
      bracketleft: 'BracketLeft', bracketright: 'BracketRight', semicolon: 'Semicolon',
      quote: 'Quote', comma: 'Comma', period: 'Period', slash: 'Slash', backslash: 'Backslash'
    };
    const compact = raw.toLowerCase().replace(/[\s_-]+/g, '');
    if (aliases[compact]) return aliases[compact];
    if (/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Space|Tab|Enter|Escape|Shift(?:Left|Right)|Control(?:Left|Right)|Alt(?:Left|Right)|Backquote|Minus|Equal|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash)$/.test(raw)) return raw;
    return null;
  }

  function bindLabel(code) {
    const value = String(code || '');
    if (/^Key[A-Z]$/.test(value)) return value.slice(3);
    if (/^Digit[0-9]$/.test(value)) return value.slice(5);
    return value;
  }

  function sendWaypointsConfig() {
    document.dispatchEvent(new CustomEvent('minifeather:waypoints-config', {
      detail: JSON.stringify({
        enabled: !!settings.waypoints,
        coordinatesEnabled: !!settings.coordinates
      })
    }));
  }

  // Puente de modelos: el mundo MAIN pide un GLB de models/entities/,
  // aqui (ISOLATED) lo fetch-eamos como blob y devolvemos la URL.
  document.addEventListener('minifeather:model-fetch-request', async (e) => {
    let nonce = null;
    try {
      const req = JSON.parse(e.detail || '{}');
      nonce = req.nonce;
      const file = String(req.file || '').replace(/[\\/]+/g, '');
      if (!file || file.includes('..')) throw new Error('nombre invalido');
      // dir: carpeta base ("models/entities" por defecto, "assets" o
      // "assets/sounds" para audio). Se permite UN nivel de subcarpeta.
      const dirRaw = String(req.dir || '') || 'models/entities';
      const parts = dirRaw.replace(/[\\/]+/g, '/').split('/').filter(Boolean).slice(0, 2);
      const dir = parts.join('/');
      const url = chrome.runtime.getURL(dir + '/' + file);
      let resp;
      try {
        resp = await fetch(url);
      } catch (e) {
        throw new Error('no existe "' + dir + '/' + file + '" (' + (e?.message || e) + ')');
      }
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' para ' + dir + '/' + file);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      document.dispatchEvent(new CustomEvent('minifeather:model-fetch-response', {
        detail: JSON.stringify({ nonce, url: blobUrl, ok: true })
      }));
    } catch (err) {
      if (!nonce) return;
      document.dispatchEvent(new CustomEvent('minifeather:model-fetch-response', {
        detail: JSON.stringify({ nonce, ok: false, status: (err && err.message) || 'error' })
      }));
    }
  });

  // Puente de emotes: el mundo MAIN pide un .emotecraft de emotes/,
  // aqui (ISOLATED) lo fetch-eamos como blob y devolvemos la URL.
  document.addEventListener('minifeather:emote-fetch-request', async (e) => {
    let nonce = null;
    try {
      const req = JSON.parse(e.detail || '{}');
      nonce = req.nonce;
      const file = String(req.file || '').replace(/[\\/]+/g, '');
      if (!file || file.includes('..')) throw new Error('nombre invalido');
      const dirRaw = String(req.dir || '') || 'emotes';
      const dir = dirRaw.replace(/[\\/]+/g, '/').split('/').filter(Boolean).slice(0, 1).join('/');
      const url = chrome.runtime.getURL(dir + '/' + file);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      document.dispatchEvent(new CustomEvent('minifeather:emote-fetch-response', {
        detail: JSON.stringify({ nonce, url: blobUrl, ok: true })
      }));
    } catch (err) {
      if (!nonce) return;
      document.dispatchEvent(new CustomEvent('minifeather:emote-fetch-response', {
        detail: JSON.stringify({ nonce, ok: false, status: (err && err.message) || 'error' })
      }));
    }
  });

  function initWaypointsModule() {
    registerModule('waypoints', () => createLifecycle({
      enable: sendWaypointsConfig,
      disable: sendWaypointsConfig,
      refresh: sendWaypointsConfig,
      destroy() {
        document.dispatchEvent(new CustomEvent('minifeather:waypoints-config', {
          detail: JSON.stringify({ enabled: false, coordinatesEnabled: false })
        }));
      }
    }));

    registerModule('coordinates', () => createLifecycle({
      enable: sendWaypointsConfig,
      disable: sendWaypointsConfig,
      refresh: sendWaypointsConfig,
      destroy: sendWaypointsConfig
    }));
  }

  function sendClientBindsConfig() {
    document.dispatchEvent(new CustomEvent('minifeather:client-binds-config', {
      detail: JSON.stringify({ binds: { ...(settings.moduleBinds || {}) } })
    }));
  }

  function respondClientCommand(requestId, messages) {
    document.dispatchEvent(new CustomEvent('minifeather:client-command-response', {
      detail: JSON.stringify({ requestId, messages: Array.isArray(messages) ? messages : [messages] })
    }));
  }

  function requestFreecamAccess() {
    freecamAccess = { ...freecamAccess, known: false };
    document.dispatchEvent(new CustomEvent('minifeather:freecam-access-request'));
    return freecamAccess.known && freecamAccess.allowed;
  }

  function showFreecamDenied() {
    const now = performance.now();
    if (now - lastFreecamDeniedAt < 300) return;
    lastFreecamDeniedAt = now;
    respondClientCommand(`freecam_denied_${Date.now()}`, [{ text: t('freecamNoAccess'), status: 'error' }]);
  }

  function handleClientCommand(event) {
    let request = null;
    try {
      request = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch (_) {}
    if (!request || typeof request !== 'object') return;

    const args = Array.isArray(request.args) ? request.args : [];
    const requestId = String(request.requestId || '');
    const response = [];
    const push = (text, status = 'normal') => response.push({ text, status });

    if (request.action === 'toggle') {
      const key = resolveCommandModule(args[0]);
      if (!key) {
        push(t('commandToggleUsage'), 'error');
      } else {
        const enabling = !settings[key];
        if (key === 'freecam' && enabling && !requestFreecamAccess()) {
          settings.freecam = false;
          guiSettings.freecam = false;
          push(t('freecamNoAccess'), 'error');
        } else {
          settings[key] = enabling;
          guiSettings[key] = settings[key];
          saveSettings();
          applyGuiSettings();
          if (panel && !searchQuery.trim()) renderCurrentPageContent();
          if (activePage === 'dashboard') updateDashboardStats();
          push(t(settings[key] ? 'commandEnabled' : 'commandDisabled', { module: commandModuleLabel(key) }), 'success');
        }
      }
      respondClientCommand(requestId, response);
      return;
    }

    if (request.action === 'bind') {
      const key = resolveCommandModule(args[0]);
      const code = normalizeBindCode(args[1]);
      if (!key || !code) {
        push(t('commandBindUsage'), 'error');
      } else if (key === 'freecam' && !requestFreecamAccess()) {
        push(t('freecamNoAccess'), 'error');
      } else {
        settings.moduleBinds = { ...(settings.moduleBinds || {}), [key]: code };
        guiSettings.moduleBinds = { ...settings.moduleBinds };
        saveSettings();
        sendClientBindsConfig();
        push(t('commandBound', { module: commandModuleLabel(key), key: bindLabel(code) }), 'success');
      }
      respondClientCommand(requestId, response);
      return;
    }

    if (request.action === 'unbind') {
      const key = resolveCommandModule(args[0]);
      if (!key) {
        push(t('commandUnbindUsage'), 'error');
      } else if (!settings.moduleBinds?.[key]) {
        push(t('commandNoBind', { module: commandModuleLabel(key) }));
      } else {
        settings.moduleBinds = { ...(settings.moduleBinds || {}) };
        delete settings.moduleBinds[key];
        guiSettings.moduleBinds = { ...settings.moduleBinds };
        saveSettings();
        sendClientBindsConfig();
        push(t('commandBindRemoved', { module: commandModuleLabel(key) }), 'success');
      }
      respondClientCommand(requestId, response);
      return;
    }

    if (request.action === 'binds') {
      const binds = Object.entries(settings.moduleBinds || {});
      if (!binds.length) {
        push(t('commandNoBinds'));
      } else {
        push(t('commandBindsCount', { count: binds.length }));
        binds.forEach(([key, code]) => push(`\\yellow\\${commandModuleLabel(key)}\\reset\\ - ${bindLabel(code)}`));
      }
      respondClientCommand(requestId, response);
      return;
    }

    if (request.action === 'afk') {
      const raw = Number(args[0]);
      if (!Number.isFinite(raw) || raw < 5 || raw > 150) {
        push(t('commandAfkUsage'), 'error');
      } else {
        settings.antiAfkDelay = clampAntiAfkDelay(raw);
        guiSettings.antiAfkDelay = settings.antiAfkDelay;
        saveSettings();
        sendAntiAfkConfig(settings.antiAfk);
        push(t('commandAfkChanged', { seconds: settings.antiAfkDelay }), 'success');
      }
      respondClientCommand(requestId, response);
    }
  }

  function requestWaypointUI(action, payload = {}) {
    const requestId = `ui_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    document.dispatchEvent(new CustomEvent('minifeather:waypoint-ui-request', {
      detail: JSON.stringify({ requestId, action, ...payload })
    }));
    return requestId;
  }

  function injectWaypointsPanelStyles() {
    if (document.getElementById('mf-waypoints-panel-style')) return;
    const style = document.createElement('style');
    style.id = 'mf-waypoints-panel-style';
    style.textContent = `
      .mf-waypoint-world-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:10px;padding:11px 12px;border-radius:10px;background:linear-gradient(135deg,rgba(139,92,246,.13),rgba(34,211,238,.06));border:1px solid rgba(167,139,250,.24)}
      .mf-waypoint-world-copy{min-width:0;display:flex;flex-direction:column;gap:2px}.mf-waypoint-world-copy strong{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-waypoint-world-copy span{font-size:11px;color:#aeb3c2}
      .mf-waypoint-world-badge{flex:0 0 auto;padding:5px 8px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:.04em;background:rgba(139,92,246,.15);border:1px solid rgba(167,139,250,.3);color:#d8ccff}
      .mf-waypoint-no-world{padding:12px;border-radius:9px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.23);color:#fcd34d;font-size:12px}
      .mf-waypoint-add-grid{display:grid;grid-template-columns:minmax(170px,1fr) 48px auto;gap:8px;align-items:center}.mf-waypoint-input,.mf-waypoint-select{min-width:0;border:1px solid rgba(255,255,255,.14);background:rgba(10,12,18,.7);color:#fff;border-radius:8px;padding:10px 12px;outline:none;font:inherit}.mf-waypoint-input:focus,.mf-waypoint-select:focus{border-color:rgba(139,92,246,.8);box-shadow:0 0 0 2px rgba(139,92,246,.18)}
      .mf-waypoint-color{width:48px;height:39px;padding:3px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(10,12,18,.7);cursor:pointer}.mf-waypoint-status{min-height:18px;margin-top:9px;color:#c4b5fd;font-size:12px}
      .mf-waypoint-list{display:flex;flex-direction:column;gap:9px}.mf-waypoint-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px;border-radius:11px;background:linear-gradient(135deg,rgba(255,255,255,.052),rgba(255,255,255,.025));border:1px solid rgba(255,255,255,.09);transition:border-color .16s ease,background .16s ease}.mf-waypoint-row:hover{border-color:rgba(167,139,250,.23);background:linear-gradient(135deg,rgba(139,92,246,.07),rgba(255,255,255,.028))}.mf-waypoint-row.is-hidden{opacity:.58}
      .mf-waypoint-icon{--wp-color:#8b5cf6;width:38px;height:38px;border-radius:11px;display:grid;place-items:center;font-size:18px;background:linear-gradient(145deg,color-mix(in srgb,var(--wp-color) 75%,#fff 25%),color-mix(in srgb,var(--wp-color) 65%,#000 35%));border:1px solid rgba(255,255,255,.38);box-shadow:0 0 14px color-mix(in srgb,var(--wp-color) 30%,transparent)}
      .mf-waypoint-copy{min-width:0;display:flex;flex-direction:column;gap:3px}.mf-waypoint-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-waypoint-meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;color:#aeb3c2;font-size:11px}
      .mf-waypoint-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.mf-waypoint-actions .mf-btn{padding:7px 8px;font-size:10px}.mf-waypoint-edit{display:none;grid-column:2/4;grid-template-columns:minmax(150px,1fr) 46px auto auto auto;gap:7px;align-items:center;padding-top:8px;border-top:1px solid rgba(255,255,255,.07)}.mf-waypoint-row.editing .mf-waypoint-edit{display:grid}.mf-waypoint-mini-toggle{display:flex;align-items:center;gap:5px;color:#c6cad4;font-size:10px;white-space:nowrap}.mf-waypoint-mini-toggle input{accent-color:#8b5cf6}
      .mf-waypoint-empty{padding:22px;text-align:center;color:#9ca3af;border:1px dashed rgba(255,255,255,.12);border-radius:10px}.mf-waypoint-count{font-size:12px;color:#a78bfa;margin-left:6px}
      .mf-waypoint-legacy{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;padding:11px;border-radius:10px;background:rgba(245,158,11,.075);border:1px solid rgba(245,158,11,.2)}.mf-waypoint-legacy strong{color:#fcd34d}.mf-waypoint-legacy-copy{display:flex;flex-direction:column;gap:3px;font-size:12px}.mf-waypoint-legacy-copy span{color:#c9cbd2;font-size:11px}.mf-waypoint-legacy-actions{display:flex;gap:7px}
      .mf-waypoint-world-list{display:flex;flex-direction:column;gap:7px}.mf-waypoint-world-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border-radius:9px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}.mf-waypoint-world-row strong{display:block;font-size:12px}.mf-waypoint-world-row span{font-size:10px;color:#9da2b1}.mf-waypoint-current-tag{color:#a78bfa!important;font-weight:800}
      @media(max-width:860px){.mf-waypoint-add-grid{grid-template-columns:1fr 46px}.mf-waypoint-add-grid .mf-btn{grid-column:1/-1}.mf-waypoint-edit{grid-column:1/-1;grid-template-columns:1fr 46px auto}.mf-waypoint-edit .mf-btn{grid-column:auto}.mf-waypoint-mini-toggle{grid-row:auto}}
      @media(max-width:620px){.mf-waypoint-row{grid-template-columns:38px 1fr}.mf-waypoint-actions{grid-column:1/-1;justify-content:flex-start}.mf-waypoint-edit{grid-template-columns:1fr 1fr}.mf-waypoint-edit .mf-waypoint-color{width:100%}.mf-waypoint-add-grid{grid-template-columns:1fr 1fr}.mf-waypoint-add-grid .mf-waypoint-color{width:100%}.mf-waypoint-add-grid .mf-btn{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
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

  function sendElytraFlightConfig(enabled = settings.elytraFlight) {
    settings.elytraFlightValues = clampElytraFlightValues(settings.elytraFlightValues);
    settings.elytraFlightPreset = detectElytraFlightPreset(settings.elytraFlightValues);
    document.dispatchEvent(new CustomEvent('minifeather:elytra-flight-config', {
      detail: JSON.stringify({
        enabled: !!enabled,
        preset: settings.elytraFlightPreset,
        values: cloneElytraFlightValues(settings.elytraFlightValues)
      })
    }));
  }

  function initElytraFlightModule() {
    registerModule('elytraFlight', () => createLifecycle({
      enable() {
        sendElytraFlightConfig(true);
      },
      disable() {
        sendElytraFlightConfig(false);
      },
      refresh() {
        sendElytraFlightConfig(MODULES.get('elytraFlight')?.enabled === true);
      },
      destroy() {
        sendElytraFlightConfig(false);
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

  function sendVanillaAnimationsConfig(enabled = settings.vanillaAnimations) {
    document.dispatchEvent(new CustomEvent('minifeather:vanillaanimations-config', {
      detail: JSON.stringify({ enabled: !!enabled })
    }));
  }

  function initVanillaAnimationsModule() {
    registerModule('vanillaAnimations', () => createLifecycle({
      enable() {
        sendVanillaAnimationsConfig(true);
      },
      disable() {
        sendVanillaAnimationsConfig(false);
      },
      refresh() {
        sendVanillaAnimationsConfig(MODULES.get('vanillaAnimations')?.enabled === true);
      },
      destroy() {
        sendVanillaAnimationsConfig(false);
      }
    }));
  }

  function sendLeafWindConfig(enabled = settings.leafWind, strength = settings.leafWindStrength) {
    document.dispatchEvent(new CustomEvent('minifeather:leaf-wind-config', {
      detail: JSON.stringify({ enabled: !!enabled, strength: Number(strength) || 0.085 })
    }));
  }

  function initLeafWindModule() {
    registerModule('leafWind', () => createLifecycle({
      enable() {
        sendLeafWindConfig(true);
      },
      disable() {
        sendLeafWindConfig(false);
      },
      refresh() {
        sendLeafWindConfig(
          MODULES.get('leafWind')?.enabled === true,
          settings.leafWindStrength
        );
      },
      destroy() {
        sendLeafWindConfig(false);
      }
    }));
  }

  function sendHandSwayConfig(enabled = settings.handSway) {
    document.dispatchEvent(new CustomEvent('minifeather:handsway-config', {
      detail: JSON.stringify({ enabled: !!enabled })
    }));
  }

  function initHandSwayModule() {
    registerModule('handSway', () => createLifecycle({
      enable() {
        sendHandSwayConfig(true);
      },
      disable() {
        sendHandSwayConfig(false);
      },
      refresh() {
        sendHandSwayConfig(MODULES.get('handSway')?.enabled === true);
      },
      destroy() {
        sendHandSwayConfig(false);
      }
    }));
  }

  function sendBetterPlayerLayersConfig(enabled = settings.betterPlayerLayers) {
    document.dispatchEvent(new CustomEvent('minifeather:better-player-layers-config', {
      detail: JSON.stringify({ enabled: !!enabled })
    }));
  }

  function initBetterPlayerLayersModule() {
    registerModule('betterPlayerLayers', () => createLifecycle({
      enable() { sendBetterPlayerLayersConfig(true); },
      disable() { sendBetterPlayerLayersConfig(false); },
      refresh() { sendBetterPlayerLayersConfig(MODULES.get('betterPlayerLayers')?.enabled === true); },
      destroy() { sendBetterPlayerLayersConfig(false); }
    }));
  }

  function sendGuiPatchConfig(enabled = settings.guiPatch) {
    document.dispatchEvent(new CustomEvent('minifeather:guipatch-config', {
      detail: JSON.stringify({ enabled: !!enabled, guiBase: chrome.runtime.getURL('assets/gui/') })
    }));
  }

  function initGuiPatchModule() {
    registerModule('guiPatch', () => createLifecycle({
      enable() { sendGuiPatchConfig(true); },
      disable() { sendGuiPatchConfig(false); },
      refresh() { sendGuiPatchConfig(MODULES.get('guiPatch')?.enabled === true); },
      destroy() { sendGuiPatchConfig(false); }
    }));
  }

  function sendCustomShaderConfig(enabled = settings.customShader) {
    const preset = settings.customShaderPreset || 'spooklementary';
    const fx = {};
    // Efectos comunes (spooklementary)
    const spookFx = ['vhs', 'crt', 'cel', 'fog', 'grain', 'glitch', 'flash', 'sharp'];
    const ufFx = ['ufsat', 'ufcontrast', 'uftone'];
    const phFx = ['phagx', 'phfog', 'phend', 'phbh', 'phbhsize', 'phbhspin'];
    const fxList = preset === 'ultrafast' ? ufFx : preset === 'photon' ? phFx : spookFx;
    for (const name of fxList) {
      const fallback = { vhs: 0.6, crt: 0.6, cel: 0.6, fog: 0.7, grain: 0.5, glitch: 0.4, flash: 0.5, sharp: 0.5, ufsat: 1.35, ufcontrast: 0.45, uftone: 0.35, phagx: 0.8, phfog: 0.5, phend: 0, phbh: 0, phbhsize: 0.35, phbhspin: 1 }[name];
      fx[name] = Number(settings['customShaderFx' + name.charAt(0).toUpperCase() + name.slice(1)] ?? fallback);
    }

    document.dispatchEvent(new CustomEvent('minifeather:custom-shader-config', {
      detail: JSON.stringify({
        enabled: !!enabled,
        preset,
        strength: Number(settings.customShaderStrength) || 0.5,
        renderScale: Number(settings.customShaderRenderScale) || 1.0,
        effects: fx,
        postfx: {
            bloom: Number(settings.customShaderPfbloom ?? 0.35),
            ca: Number(settings.customShaderPfca ?? 0),
            dof: Number(settings.customShaderPfdof ?? 0),
            dirt: Number(settings.customShaderPfdirt ?? 0),
            vignette: Number(settings.customShaderPfvignette ?? 0)
        },
        clouds: {
          coverage: Number(settings.cloudsCoverage ?? 0.5),
          scale: Number(settings.cloudsScale ?? 0.012),
          wind: Number(settings.cloudsWind ?? 0.02),
          thickness: Number(settings.cloudsThickness ?? 30),
          height: Number(settings.cloudsHeight ?? 128),
          opacity: Number(settings.cloudsOpacity ?? 0.9)
        },
        cloudsPackNoise: !!settings.cloudsPackNoise
      })
    }));
  }

  function initCustomShaderModule() {
    registerModule('customShader', () => createLifecycle({
      enable() { sendCustomShaderConfig(true); },
      disable() { sendCustomShaderConfig(false); },
      refresh() { sendCustomShaderConfig(MODULES.get('customShader')?.enabled === true); },
      destroy() { sendCustomShaderConfig(false); }
    }));
  }

  function sendDamageParticlesConfig(enabled = settings.damageParticles) {
    document.dispatchEvent(new CustomEvent('minifeather:damage-particles-config', {
      detail: JSON.stringify({ enabled: !!enabled })
    }));
  }

  function initDamageParticlesModule() {
    registerModule('damageParticles', () => createLifecycle({
      enable() { sendDamageParticlesConfig(true); },
      disable() { sendDamageParticlesConfig(false); },
      refresh() { sendDamageParticlesConfig(MODULES.get('damageParticles')?.enabled === true); },
      destroy() { sendDamageParticlesConfig(false); }
    }));
  }

  function sendWaterSplashConfig(enabled = settings.waterSplash) {
    // assetsBase por evento: el MAIN world no tiene chrome.runtime y el
    // meta de SplashScreen puede no existir en el frame del juego (iframes)
    let assetsBase = '';
    try {
      const url = chrome.runtime.getURL('assets/particles/');
      // runtime invalidado (extensión recargada sin F5): no mandar basura
      if (url && !url.includes('://invalid/')) assetsBase = url;
    } catch (_) {}
    document.dispatchEvent(new CustomEvent('minifeather:water-splash-config', {
      detail: JSON.stringify({ enabled: !!enabled, assetsBase })
    }));
  }

  function initWaterSplashModule() {
    registerModule('waterSplash', () => createLifecycle({
      enable() { sendWaterSplashConfig(true); },
      disable() { sendWaterSplashConfig(false); },
      refresh() { sendWaterSplashConfig(MODULES.get('waterSplash')?.enabled === true); },
      destroy() { sendWaterSplashConfig(false); }
    }));
  }

  function sendAutoRespawnConfig(enabled = settings.autoRespawn) {
    document.dispatchEvent(new CustomEvent('minifeather:auto-respawn-config', {
      detail: JSON.stringify({ enabled: !!enabled })
    }));
  }

  function initAutoRespawnModule() {
    registerModule('autoRespawn', () => createLifecycle({
      enable() {
        sendAutoRespawnConfig(true);
      },
      disable() {
        sendAutoRespawnConfig(false);
      },
      refresh() {
        sendAutoRespawnConfig(MODULES.get('autoRespawn')?.enabled === true);
      },
      destroy() {
        sendAutoRespawnConfig(false);
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

  function sendMovementAssistConfig() {
    document.dispatchEvent(new CustomEvent('minifeather:movement-assist-config', {
      detail: JSON.stringify({
        autoSprint: settings.autoSprint === true,
        safeSneak: settings.safeSneak === true
      })
    }));
  }

  function initMovementAssistModules() {
    registerModule('autoSprint', () => createLifecycle({
      enable: sendMovementAssistConfig,
      disable: sendMovementAssistConfig,
      refresh: sendMovementAssistConfig,
      destroy: sendMovementAssistConfig
    }));
    registerModule('safeSneak', () => createLifecycle({
      enable: sendMovementAssistConfig,
      disable: sendMovementAssistConfig,
      refresh: sendMovementAssistConfig,
      destroy: sendMovementAssistConfig
    }));
  }

  function sendRhythmParkourConfig(enabled = settings.rhythmParkour) {
    document.dispatchEvent(new CustomEvent('minifeather:rhythmparkour-config', {
      detail: JSON.stringify({ enabled: !!enabled })
    }));
  }

  function initRhythmParkourModule() {
    registerModule('rhythmParkour', () => createLifecycle({
      enable() { sendRhythmParkourConfig(true); },
      disable() { sendRhythmParkourConfig(false); },
      refresh() { sendRhythmParkourConfig(MODULES.get('rhythmParkour')?.enabled === true); },
      destroy() { sendRhythmParkourConfig(false); }
    }));
  }

  // ─── Local Games (mundos locales / LAN via ntfy+WebRTC) ───────────
  let localGamesState = null;

  function sendLocalGamesCommand(action, extra = {}) {
    document.dispatchEvent(new CustomEvent('minifeather:localgames-command', {
      detail: JSON.stringify({ action, ...extra })
    }));
  }

  function initLocalGamesModule() {
    document.addEventListener('minifeather:localgames-state', (e) => {
      try { localGamesState = JSON.parse(e.detail || '{}'); } catch (_) {}
      refreshLocalGamesView();
    });

    registerModule('localGames', () => createLifecycle({
      enable() { sendLocalGamesCommand('status'); },
      disable() { sendLocalGamesCommand('stop'); },
      refresh() { sendLocalGamesCommand('status'); },
      destroy() { sendLocalGamesCommand('stop'); }
    }));
  }

  function refreshLocalGamesView() {
    if (!panel) return;
    const container = panel.querySelector('#mf-localgames-view');
    if (!container) return;

    const lg = localGamesState || {};
    const allServers = Array.isArray(lg.savedServers) ? lg.savedServers : [];
    const onlineServers = allServers.filter(s => s?.online);
    const offlineServers = allServers.filter(s => !s?.online);
    const serverRows = [...onlineServers, ...offlineServers].slice(0, 12).map(server => {
      const online = server.online !== false;
      return `
      <div class="mf-shader-strength" style="margin-bottom:6px;${online ? '' : 'opacity:0.45;'}">
        <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(server.worldName || '')} · ${escapeHtml(server.hostName || '')}">${online ? '🟢' : '🔴'} ${escapeHtml(server.worldName || 'World')} <span class="mf-muted" style="font-size:10px;">· ${escapeHtml(server.hostName || '')} · ${Number(server.players || 1)}/${Number(server.maxPlayers || 8)}</span></span>
        <button class="mf-btn primary" style="padding:2px 8px;font-size:11px;" ${online ? '' : 'disabled'} data-lg-join="${escapeHtml(String(server.address || ''))}">${t('localGamesJoin')}</button>
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="mf-card-title">${t('localGamesServers')} <button id="mf-lg-refresh" class="mf-btn secondary" style="padding:2px 8px;font-size:11px;">⟳</button></div>
      <div id="mf-lg-status" class="mf-muted" style="font-size:11px;margin:6px 0;">${escapeHtml(lg.status || 'Idle')}</div>
      ${lg.active ? `
        <div style="background:rgba(124,92,255,0.15);border-radius:6px;padding:8px;margin-bottom:8px;font-size:11px;">
          <div>🎮 <b>${escapeHtml(lg.worldName || 'Local')}</b> · ${escapeHtml(lg.mode || '')} · 👥 ${Number(lg.playerCount || 1)}/${Number(lg.maxPlayers || 8)}</div>
          <div class="mf-muted" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px;">
            <span>${t('localGamesAddress')}: <code>${escapeHtml(lg.serverAddress || '-')}</code></span>
            ${lg.serverAddress ? `<button id="mf-lg-copy-address" class="mf-small-btn" type="button">${t('localGamesCopyAddress')}</button>` : ''}
          </div>
          ${lg.shareLink ? `
          <div class="mf-muted" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px;">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">🔗 <code>${escapeHtml(lg.shareLink)}</code></span>
            <button id="mf-lg-copy-link" class="mf-small-btn" type="button">Copy Link</button>
          </div>` : ''}
          ${lg.renderStats ? `<div class="mf-muted" style="margin-top:2px;font-size:10px;opacity:0.8;">${t('localGamesRender')}: ${Number(lg.renderStats.visible || 0)}/${Number(lg.renderStats.meshes || 0)} · ${t('localGamesTextures')}: ${Number(lg.renderStats.textured || 0)}/${Number(lg.renderStats.nativeMaterials || 0)}</div>` : ''}
        </div>
        <div class="mf-card-title" style="margin-top:6px;">${t('localGamesModeTitle')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px;">
          <button class="mf-btn ${(lg.gameMode||'survival')==='survival'?'primary':'secondary'}" style="padding:4px;font-size:11px;" data-lg-mode="survival">⚔️ ${t('localGamesModeSurvival')}</button>
          <button class="mf-btn ${(lg.gameMode||'')==='creative'?'primary':'secondary'}" style="padding:4px;font-size:11px;" data-lg-mode="creative">🧱 ${t('localGamesModeCreative')}</button>
          <button class="mf-btn ${(lg.gameMode||'')==='adventure'?'primary':'secondary'}" style="padding:4px;font-size:11px;" data-lg-mode="adventure">🗺️ ${t('localGamesModeAdventure')}</button>
          <button class="mf-btn ${(lg.gameMode||'')==='spectator'?'primary':'secondary'}" style="padding:4px;font-size:11px;" data-lg-mode="spectator">👁️ ${t('localGamesModeSpectator')}</button>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:4px;cursor:pointer;user-select:none;">
          <input type="checkbox" id="mf-lg-hardcore" ${lg.hardcore ? 'checked' : ''} style="cursor:pointer;">
          <span>💀 <b>${t('localGamesHardcore')}</b> <span class="mf-muted">· ${t('localGamesHardcoreHint')}</span></span>
        </label>
        ${lg.mode === 'host' ? `
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:8px;cursor:pointer;user-select:none;">
          <input type="checkbox" id="mf-lg-autojoin" ${lg.autoJoinEnabled ? 'checked' : ''} style="cursor:pointer;">
          <span>🌐 <b>Auto-connect everyone</b> <span class="mf-muted">· All MiniFeather clients in the menu join this world automatically</span></span>
        </label>` : ''}
        <div class="mf-card-title" style="margin-top:6px;">${t('localGamesChatTitle')}</div>
        <div style="display:flex;gap:4px;margin-bottom:8px;">
          <input id="mf-lg-chat-input" type="text" placeholder="${t('localGamesChatPlaceholder')}" maxlength="256"
            style="flex:1;padding:4px 8px;border-radius:4px;border:1px solid var(--mf-border,#444);background:var(--mf-bg2,rgba(0,0,0,0.3));color:inherit;font-size:12px;">
          <button id="mf-lg-chat-send" class="mf-btn primary" style="padding:4px 10px;font-size:11px;">${t('localGamesChatSend')}</button>
        </div>
        <button id="mf-lg-stop" class="mf-btn danger" style="width:100%;padding:6px;font-size:12px;">${t('localGamesStop')}</button>
      ` : `
        <div class="mf-shader-strength" style="margin-bottom:6px;">
          <input id="mf-lg-worldname" type="text" placeholder="${t('localGamesWorldName')}" value="${escapeHtml(settings.localGamesWorldName || '')}"
            style="flex:1;padding:4px 8px;border-radius:4px;border:1px solid var(--mf-border,#444);background:var(--mf-bg2,rgba(0,0,0,0.3));color:inherit;font-size:12px;">
        </div>
        <div class="mf-shader-grid">
          <button id="mf-lg-create" class="mf-btn primary">${t('localGamesCreate')}</button>
          <button id="mf-lg-sandbox" class="mf-btn secondary">${t('localGamesSandbox')}</button>
        </div>
        <button id="mf-lg-garden" class="mf-btn secondary" style="width:100%;margin-top:6px;padding:6px;font-size:12px;">🕷️ Spider Garden</button>
        <button id="mf-lg-global" class="mf-btn primary" style="width:100%;margin-top:6px;padding:6px;font-size:12px;">🌍 Global World</button>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button id="mf-lg-import" class="mf-btn secondary" style="flex:1;padding:6px;font-size:12px;">📦 Import World</button>
          <button id="mf-lg-play-imported" class="mf-btn secondary" style="flex:1;padding:6px;font-size:12px;" title="Load the imported world">▶ Imported</button>
        </div>
        <input id="mf-lg-import-file" type="file" accept=".zip,.mca" style="display:none;">
        <div class="mf-muted" style="font-size:10px;margin-top:4px;">Java world .zip or .mca region file</div>
        <div class="mf-card-title" style="margin-top:12px;">${t('localGamesJoinByAddress')}</div>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <input id="mf-lg-address-input" class="mf-input" type="text" placeholder="${t('localGamesAddressPlaceholder')}" autocomplete="off" spellcheck="false">
          <button id="mf-lg-join-address" class="mf-btn primary" type="button" style="width:auto;min-width:90px;">${t('localGamesJoin')}</button>
        </div>
        <div class="mf-muted" style="font-size:10px;margin-top:5px;">${t('localGamesAddressHint')}</div>
        <div style="margin-top:10px;">${serverRows || `<div class="mf-muted" style="font-size:11px;">${t('localGamesNoServers')}</div>`}</div>
      `}
    `;

    container.querySelector('#mf-lg-refresh')?.addEventListener('click', () => {
      sendLocalGamesCommand('refresh-servers');
    });

    container.querySelector('#mf-lg-copy-address')?.addEventListener('click', async () => {
      const address = String(lg.serverAddress || '');
      if (!address) return;
      try {
        await navigator.clipboard.writeText(address);
        const button = container.querySelector('#mf-lg-copy-address');
        if (button) {
          button.textContent = t('localGamesCopied');
          window.setTimeout(() => {
            if (button.isConnected) button.textContent = t('localGamesCopyAddress');
          }, 1200);
        }
      } catch (_) {}
    });

    container.querySelector('#mf-lg-copy-link')?.addEventListener('click', async () => {
      const link = String(lg.shareLink || '');
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        const button = container.querySelector('#mf-lg-copy-link');
        if (button) {
          button.textContent = '✓ Copied';
          window.setTimeout(() => {
            if (button.isConnected) button.textContent = 'Copy Link';
          }, 1200);
        }
      } catch (_) {}
    });

    const joinByAddress = () => {
      const input = container.querySelector('#mf-lg-address-input');
      const address = String(input?.value || '').trim();
      if (!address) return;
      sendLocalGamesCommand('join-server', { address });
    };

    container.querySelector('#mf-lg-join-address')?.addEventListener('click', joinByAddress);
    container.querySelector('#mf-lg-address-input')?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      joinByAddress();
    });

    container.querySelector('#mf-lg-stop')?.addEventListener('click', () => {
      sendLocalGamesCommand('stop');
    });

    container.querySelector('#mf-lg-create')?.addEventListener('click', () => {
      const name = container.querySelector('#mf-lg-worldname')?.value?.trim();
      settings.localGamesWorldName = name || '';
      guiSettings.localGamesWorldName = settings.localGamesWorldName;
      saveSettings(true);
      sendLocalGamesCommand('create-world', { worldName: name });
    });

    container.querySelector('#mf-lg-sandbox')?.addEventListener('click', () => {
      sendLocalGamesCommand('start-single');
    });

    container.querySelector('#mf-lg-garden')?.addEventListener('click', () => {
      sendLocalGamesCommand('start-garden');
    });

    container.querySelector('#mf-lg-global')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      const original = button ? button.textContent : '';
      if (button) button.textContent = '⏳ Joining the Global World...';
      sendLocalGamesCommand('join-global', { enabled: true });
      window.setTimeout(() => { if (button?.isConnected) button.textContent = original; }, 2500);
    });

    container.querySelector('#mf-lg-import')?.addEventListener('click', () => {
      container.querySelector('#mf-lg-import-file')?.click();
    });

    container.querySelector('#mf-lg-import-file')?.addEventListener('change', async (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      const button = container.querySelector('#mf-lg-import');
      const original = button ? button.textContent : '';
      try {
        if (button) button.textContent = '⏳ Importing...';
        if (!globalThis.MF_WorldImport) throw new Error('importer not loaded');
        const world = await globalThis.MF_WorldImport.importFromFile(file, (done, total, blocks) => {
          if (button) button.textContent = `⏳ ${done}/${total} (${blocks})`;
        });
        globalThis.__MF_IMPORTED_WORLD__ = world;
        sendLocalGamesCommand('import-world');
        if (button) {
          button.textContent = `✓ ${world.count} blocks`;
          window.setTimeout(() => { if (button.isConnected) button.textContent = original; }, 3500);
        }
      } catch (error) {
        console.error('[MF WorldImport] fallo:', error);
        if (button) {
          button.textContent = '✗ Failed';
          window.setTimeout(() => { if (button.isConnected) button.textContent = original; }, 2500);
        }
      } finally {
        event.target.value = '';
      }
    });

    container.querySelector('#mf-lg-play-imported')?.addEventListener('click', () => {
      const name = container.querySelector('#mf-lg-worldname')?.value?.trim();
      sendLocalGamesCommand('start-imported', name ? { worldName: name } : {});
    });

    container.querySelectorAll('[data-lg-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        sendLocalGamesCommand('set-mode', { mode: btn.getAttribute('data-lg-mode') });
      });
    });

    container.querySelector('#mf-lg-hardcore')?.addEventListener('change', (e) => {
      sendLocalGamesCommand('set-hardcore', { enabled: !!e.target.checked });
    });

    container.querySelector('#mf-lg-autojoin')?.addEventListener('change', (e) => {
      sendLocalGamesCommand('set-autojoin', { enabled: !!e.target.checked });
    });

    const sendChat = () => {
      const input = container.querySelector('#mf-lg-chat-input');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      sendLocalGamesCommand('chat', { text });
      input.value = '';
    };

    container.querySelector('#mf-lg-chat-send')?.addEventListener('click', sendChat);

    container.querySelector('#mf-lg-chat-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChat();
      }
    });

    container.querySelectorAll('[data-lg-join]').forEach(btn => {
      btn.addEventListener('click', () => {
        sendLocalGamesCommand('join-server', { address: btn.getAttribute('data-lg-join') });
      });
    });
  }

  function sendLocalGamesConfig(enabled) {
    sendLocalGamesCommand(enabled ? 'status' : 'stop');
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

  function sendFreecamConfig(enabled = settings.freecam) {
    settings.freecamSpeed = Math.max(1, Math.min(30, Number(settings.freecamSpeed) || 7));
    settings.freecamSensitivity = Math.max(0.1, Math.min(3, Number(settings.freecamSensitivity) || 1));
    settings.freecamFastMultiplier = Math.max(1, Math.min(8, Number(settings.freecamFastMultiplier) || 3));

    document.dispatchEvent(new CustomEvent('minifeather:freecam-config', {
      detail: JSON.stringify({
        enabled: !!enabled,
        speed: settings.freecamSpeed,
        sensitivity: settings.freecamSensitivity,
        fastMultiplier: settings.freecamFastMultiplier
      })
    }));
  }

  function initFreecamModule() {
    registerModule('freecam', () => createLifecycle({
      enable() { sendFreecamConfig(true); },
      disable() { sendFreecamConfig(false); },
      refresh() { sendFreecamConfig(MODULES.get('freecam')?.enabled === true); },
      destroy() { sendFreecamConfig(false); }
    }));

    document.addEventListener('minifeather:freecam-state', event => {
      let next = null;
      try { next = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail; } catch (_) {}
      if (!next || typeof next !== 'object') return;

      if (typeof next.canAccess === 'boolean') {
        freecamAccess = {
          known: true,
          allowed: next.canAccess,
          permissionLevel: Number(next.permissionLevel) || 0
        };
      }

      if (next.error !== 'NO_SERVER_ADMIN') return;

      settings.freecam = false;
      guiSettings.freecam = false;
      setModuleEnabled('freecam', false);
      const input = panel?.querySelector('.mf-toggle[data-key="freecam"] input');
      if (input) input.checked = false;
      saveSettings(true);
      showFreecamDenied();
      if (activePage === 'dashboard') updateDashboardStats();
    }, { signal: runtimeController?.signal });

    requestFreecamAccess();
  }

  function closeFreecamSettings() {
    if (!freecamSettingsCleanup) return;
    const cleanup = freecamSettingsCleanup;
    freecamSettingsCleanup = null;
    cleanup();
  }

  function openFreecamSettings() {
    if (!panel) return;
    if (!requestFreecamAccess()) {
      showFreecamDenied();
      return;
    }
    closeFreecamSettings();

    settings.freecamSpeed = Math.max(1, Math.min(30, Number(settings.freecamSpeed) || 7));
    settings.freecamSensitivity = Math.max(0.1, Math.min(3, Number(settings.freecamSensitivity) || 1));
    settings.freecamFastMultiplier = Math.max(1, Math.min(8, Number(settings.freecamFastMultiplier) || 3));

    const backdrop = document.createElement('div');
    backdrop.className = 'mf-tt-backdrop mf-freecam-backdrop';
    const currentBind = String(settings.moduleBinds?.freecam || '');

    backdrop.innerHTML = `
      <div class="mf-tt-dialog" role="dialog" aria-modal="true">
        <div class="mf-tt-head">
          <div class="mf-tt-title">${t('freecamSettings')}</div>
          <button type="button" class="mf-close" data-fc-close>×</button>
        </div>
        <div class="mf-tt-row"><span>${t('freecamSpeed')}</span><strong data-fc-speed-value>${settings.freecamSpeed.toFixed(1)}</strong></div>
        <input type="range" min="1" max="30" step="0.5" value="${settings.freecamSpeed}" data-fc-speed style="width:100%">
        <div class="mf-tt-row"><span>${t('freecamSensitivity')}</span><strong data-fc-sens-value>${settings.freecamSensitivity.toFixed(2)}</strong></div>
        <input type="range" min="0.1" max="3" step="0.05" value="${settings.freecamSensitivity}" data-fc-sens style="width:100%">
        <div class="mf-tt-row"><span>${t('freecamBoost')}</span><strong data-fc-boost-value>${settings.freecamFastMultiplier.toFixed(1)}x</strong></div>
        <input type="range" min="1" max="8" step="0.5" value="${settings.freecamFastMultiplier}" data-fc-boost style="width:100%">
        <div class="mf-tt-row"><span>${t('freecamBind')}</span></div>
        <div class="mf-tt-bind-box"><span class="mf-muted">${t('freecamToggleKey')}</span><span class="mf-tt-bind-code" data-fc-bind-code>${currentBind || t('freecamNoBind')}</span></div>
        <div class="mf-tt-bind-actions">
          <button type="button" class="mf-btn secondary" data-fc-bind>${t('freecamSetBind')}</button>
          <button type="button" class="mf-btn danger" data-fc-unbind>${t('freecamRemoveBind')}</button>
        </div>
        <div class="mf-tt-hint">${t('freecamControls')}</div>
        <button type="button" class="mf-btn primary mf-tt-save" data-fc-save>${t('freecamSave')}</button>
      </div>
    `;

    panel.appendChild(backdrop);

    const speed = backdrop.querySelector('[data-fc-speed]');
    const sens = backdrop.querySelector('[data-fc-sens]');
    const boost = backdrop.querySelector('[data-fc-boost]');
    const speedValue = backdrop.querySelector('[data-fc-speed-value]');
    const sensValue = backdrop.querySelector('[data-fc-sens-value]');
    const boostValue = backdrop.querySelector('[data-fc-boost-value]');
    const bindCode = backdrop.querySelector('[data-fc-bind-code]');
    const bindButton = backdrop.querySelector('[data-fc-bind]');
    let binding = false;

    const refreshRuntime = () => {
      guiSettings.freecamSpeed = settings.freecamSpeed;
      guiSettings.freecamSensitivity = settings.freecamSensitivity;
      guiSettings.freecamFastMultiplier = settings.freecamFastMultiplier;
      sendFreecamConfig(settings.freecam);
    };

    speed?.addEventListener('input', () => {
      settings.freecamSpeed = Math.max(1, Math.min(30, Number(speed.value) || 7));
      if (speedValue) speedValue.textContent = settings.freecamSpeed.toFixed(1);
      refreshRuntime();
    });

    sens?.addEventListener('input', () => {
      settings.freecamSensitivity = Math.max(0.1, Math.min(3, Number(sens.value) || 1));
      if (sensValue) sensValue.textContent = settings.freecamSensitivity.toFixed(2);
      refreshRuntime();
    });

    boost?.addEventListener('input', () => {
      settings.freecamFastMultiplier = Math.max(1, Math.min(8, Number(boost.value) || 3));
      if (boostValue) boostValue.textContent = `${settings.freecamFastMultiplier.toFixed(1)}x`;
      refreshRuntime();
    });

    const stopBinding = () => {
      binding = false;
      if (bindButton) bindButton.textContent = t('freecamSetBind');
    };

    bindButton?.addEventListener('click', () => {
      if (!requestFreecamAccess()) {
        showFreecamDenied();
        return;
      }
      binding = true;
      bindButton.textContent = t('freecamListening');
    });

    backdrop.querySelector('[data-fc-unbind]')?.addEventListener('click', () => {
      stopBinding();
      settings.moduleBinds = { ...(settings.moduleBinds || {}) };
      delete settings.moduleBinds.freecam;
      guiSettings.moduleBinds = { ...settings.moduleBinds };
      if (bindCode) bindCode.textContent = t('freecamNoBind');
      sendClientBindsConfig();
      saveSettings();
    });

    const keyHandler = event => {
      if (!binding) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!requestFreecamAccess()) {
        stopBinding();
        showFreecamDenied();
        return;
      }
      if (event.code === 'Escape' || event.code === 'Backspace' || event.code === 'Delete') {
        settings.moduleBinds = { ...(settings.moduleBinds || {}) };
        delete settings.moduleBinds.freecam;
        if (bindCode) bindCode.textContent = t('freecamNoBind');
      } else {
        settings.moduleBinds = { ...(settings.moduleBinds || {}), freecam: event.code };
        if (bindCode) bindCode.textContent = bindLabel(event.code);
      }
      guiSettings.moduleBinds = { ...settings.moduleBinds };
      sendClientBindsConfig();
      saveSettings();
      stopBinding();
    };

    document.addEventListener('keydown', keyHandler, true);

    const cleanup = () => {
      stopBinding();
      document.removeEventListener('keydown', keyHandler, true);
      backdrop.remove();
      if (freecamSettingsCleanup === cleanup) freecamSettingsCleanup = null;
    };
    freecamSettingsCleanup = cleanup;
    backdrop.querySelector('[data-fc-close]')?.addEventListener('click', cleanup);
    backdrop.querySelector('[data-fc-save]')?.addEventListener('click', () => {
      saveSettings();
      sendClientBindsConfig();
      sendFreecamConfig(settings.freecam);
      cleanup();
    });
    backdrop.addEventListener('mousedown', event => {
      if (event.target === backdrop) cleanup();
    });
  }

  function closeElytraFlightSettings() {
    if (elytraFlightSettingsCleanup) {
      const cleanup = elytraFlightSettingsCleanup;
      elytraFlightSettingsCleanup = null;
      cleanup();
      return;
    }
    panel?.querySelector('.mf-elytra-flight-backdrop')?.remove();
  }

  function openElytraFlightSettings() {
    if (!panel) return;
    closeElytraFlightSettings();
    closeCameraOverhaulSettings();

    settings.elytraFlightValues = clampElytraFlightValues(settings.elytraFlightValues);
    settings.elytraFlightPreset = detectElytraFlightPreset(settings.elytraFlightValues);

    const backdrop = document.createElement('div');
    backdrop.className = 'mf-tt-backdrop mf-elytra-flight-backdrop';

    const renderControl = (key, limit) => {
      const value = Number(settings.elytraFlightValues[key]);
      return `
        <div class="mf-co-control" data-ef-control="${key}">
          <div class="mf-co-control-head">
            <span>${t(limit.label)}</span>
            <input class="mf-co-number" data-ef-number="${key}" type="number" min="${limit.min}" max="${limit.max}" step="${limit.step}" value="${value.toFixed(limit.digits)}">
          </div>
          <input class="mf-co-range" data-ef-range="${key}" type="range" min="${limit.min}" max="${limit.max}" step="${limit.step}" value="${value}">
        </div>
      `;
    };

    const boolText = value => value ? t('elytraFlightOn') : t('elytraFlightOff');

    backdrop.innerHTML = `
      <div class="mf-tt-dialog mf-co-dialog" role="dialog" aria-modal="true">
        <div class="mf-tt-head">
          <div class="mf-tt-title">${t('elytraFlightSettings')}</div>
          <button type="button" class="mf-close" data-ef-close>×</button>
        </div>

        <div class="mf-tt-row">
          <span>${t('elytraFlightProfile')}</span>
          <span class="mf-tt-scale-value" data-ef-profile-label></span>
        </div>

        <div class="mf-co-presets">
          <button type="button" class="mf-btn secondary" data-ef-preset="soft">${t('elytraFlightSoft')}</button>
          <button type="button" class="mf-btn secondary" data-ef-preset="normal">${t('elytraFlightNormal')}</button>
          <button type="button" class="mf-btn secondary" data-ef-preset="strong">${t('elytraFlightStrong')}</button>
        </div>

        <div class="mf-co-controls">
          ${Object.entries(ELYTRA_FLIGHT_LIMITS).map(([key, limit]) => renderControl(key, limit)).join('')}
        </div>

        <div class="mf-tt-bind-box">
          <span>${t('elytraFlightInvertPitch')}</span>
          <button type="button" class="mf-btn secondary" data-ef-invert></button>
        </div>

        <div class="mf-tt-bind-box">
          <span>${t('elytraFlightAutoLevel')}</span>
          <button type="button" class="mf-btn secondary" data-ef-autolevel></button>
        </div>

        <div class="mf-tt-bind-box">
          <span>${t('elytraFlightHorizon')}</span>
          <button type="button" class="mf-btn secondary" data-ef-horizon></button>
        </div>

        <div class="mf-tt-hint">${t('elytraFlightControlsHint')}</div>
        <div class="mf-tt-hint">${t('elytraFlightSafeHint')}</div>
        <button type="button" class="mf-btn primary mf-tt-save" data-ef-save>${t('elytraFlightSave')}</button>
      </div>
    `;

    panel.appendChild(backdrop);

    const profileLabel = backdrop.querySelector('[data-ef-profile-label]');
    const invertButton = backdrop.querySelector('[data-ef-invert]');
    const autoLevelButton = backdrop.querySelector('[data-ef-autolevel]');
    const horizonButton = backdrop.querySelector('[data-ef-horizon]');

    const profileText = profile => {
      if (profile === 'soft') return t('elytraFlightSoft');
      if (profile === 'normal') return t('elytraFlightNormal');
      if (profile === 'strong') return t('elytraFlightStrong');
      return t('elytraFlightCustom');
    };

    const syncProfileUI = () => {
      const profile = detectElytraFlightPreset(settings.elytraFlightValues);
      settings.elytraFlightPreset = profile;
      guiSettings.elytraFlightPreset = profile;
      if (profileLabel) profileLabel.textContent = profileText(profile);
      backdrop.querySelectorAll('[data-ef-preset]').forEach(button => {
        button.classList.toggle('active', button.dataset.efPreset === profile);
      });
    };

    const syncBooleanUI = () => {
      const pairs = [
        [invertButton, 'invertPitch'],
        [autoLevelButton, 'autoLevel'],
        [horizonButton, 'showHorizon']
      ];
      for (const [button, key] of pairs) {
        if (!button) continue;
        const value = settings.elytraFlightValues[key] === true;
        button.textContent = boolText(value);
        button.classList.toggle('active', value);
      }
    };

    const syncControlUI = () => {
      for (const [key, limit] of Object.entries(ELYTRA_FLIGHT_LIMITS)) {
        const value = Number(settings.elytraFlightValues[key]);
        const range = backdrop.querySelector(`[data-ef-range="${key}"]`);
        const number = backdrop.querySelector(`[data-ef-number="${key}"]`);
        if (range) range.value = String(value);
        if (number) number.value = value.toFixed(limit.digits);
      }
      syncProfileUI();
      syncBooleanUI();
    };

    const persist = () => {
      guiSettings.elytraFlightValues = cloneElytraFlightValues(settings.elytraFlightValues);
      settings.elytraFlightPreset = detectElytraFlightPreset(settings.elytraFlightValues);
      guiSettings.elytraFlightPreset = settings.elytraFlightPreset;
      saveSettings();
      sendElytraFlightConfig(settings.elytraFlight);
    };

    const applyValue = (key, raw, save = false) => {
      const limit = ELYTRA_FLIGHT_LIMITS[key];
      if (!limit) return;
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      settings.elytraFlightValues = clampElytraFlightValues({ ...settings.elytraFlightValues, [key]: value });
      guiSettings.elytraFlightValues = cloneElytraFlightValues(settings.elytraFlightValues);
      const normalized = Number(settings.elytraFlightValues[key]);
      const range = backdrop.querySelector(`[data-ef-range="${key}"]`);
      const number = backdrop.querySelector(`[data-ef-number="${key}"]`);
      if (range) range.value = String(normalized);
      if (number) number.value = normalized.toFixed(limit.digits);
      syncProfileUI();
      sendElytraFlightConfig(settings.elytraFlight);
      if (save) persist();
    };

    backdrop.querySelectorAll('[data-ef-range]').forEach(input => {
      input.addEventListener('input', () => applyValue(input.dataset.efRange, input.value, false));
      input.addEventListener('change', () => applyValue(input.dataset.efRange, input.value, true));
    });

    backdrop.querySelectorAll('[data-ef-number]').forEach(input => {
      input.addEventListener('change', () => applyValue(input.dataset.efNumber, input.value, true));
      input.addEventListener('keydown', event => {
        if (event.code !== 'Enter') return;
        event.preventDefault();
        applyValue(input.dataset.efNumber, input.value, true);
      });
    });

    backdrop.querySelectorAll('[data-ef-preset]').forEach(button => {
      button.addEventListener('click', () => {
        const preset = button.dataset.efPreset;
        if (!ELYTRA_FLIGHT_PRESETS[preset]) return;
        settings.elytraFlightValues = cloneElytraFlightValues(ELYTRA_FLIGHT_PRESETS[preset]);
        guiSettings.elytraFlightValues = cloneElytraFlightValues(settings.elytraFlightValues);
        settings.elytraFlightPreset = preset;
        guiSettings.elytraFlightPreset = preset;
        syncControlUI();
        persist();
      });
    });

    invertButton?.addEventListener('click', () => {
      settings.elytraFlightValues.invertPitch = !settings.elytraFlightValues.invertPitch;
      syncBooleanUI();
      syncProfileUI();
      persist();
    });

    autoLevelButton?.addEventListener('click', () => {
      settings.elytraFlightValues.autoLevel = !settings.elytraFlightValues.autoLevel;
      syncBooleanUI();
      syncProfileUI();
      persist();
    });

    horizonButton?.addEventListener('click', () => {
      settings.elytraFlightValues.showHorizon = !settings.elytraFlightValues.showHorizon;
      syncBooleanUI();
      syncProfileUI();
      persist();
    });

    syncControlUI();

    const cleanup = () => {
      persist();
      backdrop.remove();
      if (elytraFlightSettingsCleanup === cleanup) elytraFlightSettingsCleanup = null;
    };

    elytraFlightSettingsCleanup = cleanup;
    backdrop.querySelector('[data-ef-close]')?.addEventListener('click', cleanup);
    backdrop.querySelector('[data-ef-save]')?.addEventListener('click', cleanup);
    backdrop.addEventListener('mousedown', event => {
      if (event.target === backdrop) cleanup();
    });
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
    closeElytraFlightSettings();

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

  function renderFavoritesPage() {
    const modules = getModuleIndex().filter(entry => favoriteModules.has(entry.key));
    if (!modules.length) {
      return `
        <div class="mf-card" style="padding:34px;text-align:center;">
          <div class="mf-card-title">No favorites yet</div>
          <div class="mf-muted" style="margin-top:8px;">Click the ♥ on any module to add it here.</div>
        </div>
      `;
    }
    return `<div class="mf-feather-module-grid">${modules.map(entry => renderToggle(entry.key, entry.title, entry.desc)).join('')}</div>`;
  }

  function saveFavorites() {
    chrome.storage.local.set({ favoriteModules: [...favoriteModules] });
  }

  function toggleFavorite(key, rerender = true) {
    if (favoriteModules.has(key)) favoriteModules.delete(key);
    else favoriteModules.add(key);
    saveFavorites();
    if (rerender && panel) renderCurrentPageContent();
  }

  const FEATURE_ADVANCED_SETTINGS = new Set([
    'titanTiny','patPat','antiAfk','zoom','armorHud','cameraOverhaul','elytraFlight','dynamicCrosshair','freelook','freecam','blockHighlight'
  ]);

  function closeFeatureSettings() {
    if (featureSettingsCleanup) {
      const cleanup = featureSettingsCleanup;
      featureSettingsCleanup = null;
      cleanup();
    }
  }

  function openFeatureSettings(key) {
    if (!panel) return;
    closeFeatureSettings();
    const entry = getModuleIndex().find(item => item.key === key);
    if (!entry) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'mf-feature-modal-backdrop';
    backdrop.innerHTML = `
      <div class="mf-feature-modal" role="dialog" aria-modal="true">
        <div class="mf-feature-modal-title">${entry.title}</div>
        <div class="mf-feature-modal-desc">${entry.desc}</div>
        <div class="mf-feature-modal-row">
          <span>Enabled</span>
          <button type="button" class="mf-feature-state ${guiSettings[key] ? 'enabled' : 'disabled'}" data-feature-enabled style="position:static;width:110px;border:0;cursor:pointer;">${guiSettings[key] ? 'Enabled' : 'Disabled'}</button>
        </div>
        <div class="mf-feature-modal-row">
          <span>Favorite</span>
          <button type="button" class="mf-feature-state ${favoriteModules.has(key) ? 'enabled' : 'disabled'}" data-feature-favorite style="position:static;width:110px;border:0;cursor:pointer;">${favoriteModules.has(key) ? '★ Added' : '☆ Add'}</button>
        </div>
        <div class="mf-feature-modal-actions">
          ${FEATURE_ADVANCED_SETTINGS.has(key) ? '<button type="button" class="mf-btn secondary" data-feature-advanced>Advanced Settings</button>' : ''}
          <button type="button" class="mf-btn primary" data-feature-close>Done</button>
        </div>
      </div>
    `;
    panel.appendChild(backdrop);

    const enabledButton = backdrop.querySelector('[data-feature-enabled]');
    const favoriteButton = backdrop.querySelector('[data-feature-favorite]');
    const sync = () => {
      const enabled = !!guiSettings[key];
      enabledButton.textContent = enabled ? 'Enabled' : 'Disabled';
      enabledButton.className = `mf-feature-state ${enabled ? 'enabled' : 'disabled'}`;
      const fav = favoriteModules.has(key);
      favoriteButton.textContent = fav ? '★ Added' : '☆ Add';
      favoriteButton.className = `mf-feature-state ${fav ? 'enabled' : 'disabled'}`;
    };
    enabledButton?.addEventListener('click', () => {
      const input = panel.querySelector(`.mf-toggle[data-key="${CSS.escape(key)}"] input`);
      if (input) { input.checked = !input.checked; input.dispatchEvent(new Event('change', { bubbles:true })); }
      else {
        settings[key] = !settings[key]; guiSettings[key] = settings[key]; saveSettings(true); applyGuiSettings();
        renderCurrentPageContent();
      }
      sync();
    });
    favoriteButton?.addEventListener('click', () => { toggleFavorite(key, false); sync(); });
    backdrop.querySelector('[data-feature-advanced]')?.addEventListener('click', () => {
      closeFeatureSettings();
      const advanced = {
        titanTiny: openTitanTinySettings, patPat: openPatPatSettings, antiAfk: openAntiAfkSettings, zoom: openZoomSettings,
        cameraOverhaul: openCameraOverhaulSettings, elytraFlight: openElytraFlightSettings, dynamicCrosshair: openDynamicCrosshairSettings,
        freelook: openFreelookSettings, freecam: openFreecamSettings, blockHighlight: openBlockHighlightSettings, armorHud: openArmorHudSettings
      };
      if (key === 'freecam' && !requestFreecamAccess()) { showFreecamDenied(); return; }
      advanced[key]?.();
    });
    backdrop.querySelector('[data-feature-close]')?.addEventListener('click', closeFeatureSettings);
    backdrop.addEventListener('mousedown', event => { if (event.target === backdrop) closeFeatureSettings(); });
    featureSettingsCleanup = () => backdrop.remove();
  }

  function renderDashboardPage() {
    let modules = getModuleIndex();
    if (activeCategory !== 'all') {
      modules = modules.filter(entry => (entry.tags || []).includes(activeCategory));
    }
    if (!modules.length) {
      return `<div class="mf-page-stack"><div class="mf-card"><div class="mf-muted">${t('searchNoResults')}</div></div></div>`;
    }
    return `
      <div class="mf-feather-module-grid">
        ${modules.map(entry => renderToggle(entry.key, entry.title, entry.desc, entry)).join('')}
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
              'guiPatch',
              'GUI Patch',
              'Classic Minecraft hearts, food, XP and WiFi icons'
            )}
            ${renderToggle(
              'armorHud',
              'Armor HUD',
              'Show your equipped helmet, chestplate, leggings and boots on screen.'
            )}
            ${renderToggle(
              'coordinates',
              t('coordinates'),
              t('coordinatesDesc')
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
              'betterPlayerLayers',
              t('betterPlayerLayers'),
              t('betterPlayerLayersDesc')
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
              'leafWind',
              t('leafWind'),
              t('leafWindDesc')
            )}
            ${renderToggle(
              'waterSplash',
              t('waterSplash'),
              t('waterSplashDesc')
            )}
            ${renderToggle(
              'vanillaAnimations',
              'Vanilla Animations',
              'Freezes elbow and knee joints rigid for all players'
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
              'elytraFlight',
              t('elytraFlight'),
              t('elytraFlightDesc')
            )}
            ${renderToggle(
              'freelook',
              'Freelook',
              'Look around independently while keeping your player facing direction unchanged.'
            )}
            ${renderToggle(
              'freecam',
              t('freecam'),
              t('freecamDesc')
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
            <label class="mf-toggle" id="mf-local-textures-toggle">
              <span class="mf-toggle-dot"></span>
              <span class="mf-toggle-copy">
                <strong>${t('localTextures')}</strong>
                <span>${t('localTexturesDesc')}</span>
              </span>
              <input
                type="checkbox"
                id="mf-local-textures-checkbox"
                class="mf-switch-hidden"
                checked
              >
            </label>
            <label class="mf-toggle" id="mf-menu-ui-toggle">
              <span class="mf-toggle-dot"></span>
              <span class="mf-toggle-copy">
                <strong>${t('menuUiOverride')}</strong>
                <span>${t('menuUiOverrideDesc')}</span>
              </span>
              <input
                type="checkbox"
                id="mf-menu-ui-checkbox"
                class="mf-switch-hidden"
                checked
              >
            </label>
            <div id="mf-custom-tp-container" style="margin-top: 8px; padding: 10px; background: rgba(0,0,0,0.25); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">
                <strong style="color: #e0e0e0;">Custom Texture Pack</strong><br>
                Upload a <code style="color: #4a9eff;">.zip</code> file or individual <code style="color: #4a9eff;">.png</code> files. Names must match the original (e.g. <code style="color: #4a9eff;">stone.png</code>, <code style="color: #4a9eff;">grass_block.png</code>).
              </div>
              <input type="file" id="mf-custom-tp-files" accept=".png,.zip,application/zip" multiple style="font-size: 11px; color: #ccc; margin-bottom: 8px; width: 100%;">
              <div id="mf-custom-tp-preview" style="display: none; margin-bottom: 8px;">
                <img id="mf-custom-tp-preview-img" style="max-width: 128px; max-height: 128px; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; image-rendering: pixelated;">
                <div id="mf-custom-tp-stats" style="font-size: 11px; color: #888; margin-top: 4px;"></div>
              </div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button id="mf-custom-tp-generate" class="mf-btn primary" style="font-size: 11px; padding: 5px 12px; background: #2a6dc4; color: #fff; border: none; border-radius: 5px; cursor: pointer;">Generate &amp; Apply</button>
                <button id="mf-custom-tp-disable" class="mf-btn" style="font-size: 11px; padding: 5px 12px; background: #333; color: #ccc; border: 1px solid #444; border-radius: 5px; cursor: pointer;">Use Default</button>
              </div>
              <div id="mf-custom-tp-status" style="font-size: 11px; margin-top: 6px;"></div>
              <div id="mf-custom-tp-manager" style="margin-top: 10px; display: none;">
                <div style="font-size: 12px; color: #e0e0e0; margin-bottom: 6px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px;">
                  <strong>Active Textures</strong>
                </div>
                <div id="mf-custom-tp-list" style="max-height: 150px; overflow-y: auto; font-size: 11px;"></div>
                <button id="mf-custom-tp-clear" style="font-size: 10px; padding: 3px 10px; background: #5a2020; color: #ff8080; border: 1px solid #804040; border-radius: 4px; cursor: pointer; margin-top: 6px;">Clear All</button>
              </div>
            </div>
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

  function renderRealisticCustomControls() {
    const c = clampRealisticCustom(guiSettings.experimentalRealisticCustom || settings.experimentalRealisticCustom);
    const slider = (key, labelKey, min, max, step, suffix = '%') => {
      const value = c[key];
      return `
        <div class="mf-tt-row" style="margin-top:7px;">
          <span style="font-size:11px;">${escapeHtml(t(labelKey))}</span>
          <strong style="font-size:11px;" data-mf-realistic-custom-value="${escapeHtml(key)}">${escapeHtml(String(value))}${suffix}</strong>
        </div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-mf-realistic-custom="${escapeHtml(key)}" data-mf-suffix="${escapeHtml(suffix)}" style="width:100%;">`;
    };
    const check = (key, labelKey) => `
      <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;font-size:11px;">
        <span>${escapeHtml(t(labelKey))}</span>
        <input type="checkbox" data-mf-realistic-custom-check="${escapeHtml(key)}" ${c[key] ? 'checked' : ''}>
      </label>`;
    const section = (titleKey, body, open = false) => `
      <details ${open ? 'open' : ''} style="margin-top:8px;border:1px solid #2c3138;border-radius:7px;padding:8px;background:#12161b;">
        <summary style="cursor:pointer;font-weight:700;font-size:11px;color:#e5e7eb;">${escapeHtml(t(titleKey))}</summary>
        <div style="padding-top:4px;">${body}</div>
      </details>`;

    const load = realisticLoadScore(c);
    const loadLabel = load < 30 ? t('realisticLoadLight') : load < 55 ? t('realisticLoadMedium') : load < 78 ? t('realisticLoadHeavy') : load < 95 ? t('realisticLoadExtreme') : t('realisticLoadInsane');

    return `
      <div class="mf-card" id="mf-realistic-custom-section" style="display:${String(guiSettings.experimentalRealisticLevel || settings.experimentalRealisticLevel) === 'custom' ? 'block' : 'none'};">
        <div class="mf-card-title">🧪 ${escapeHtml(t('experimentalRealisticCustomTitle'))}</div>
        <div style="font-size:11px;color:#aaa;line-height:1.5;">${escapeHtml(t('experimentalRealisticCustomDesc'))}</div>
        <div style="display:flex;gap:7px;margin-top:10px;flex-wrap:wrap;">
          <button type="button" class="mf-btn secondary" data-mf-realistic-copy-ultra>${escapeHtml(t('experimentalRealisticCopyUltra'))}</button>
          <button type="button" class="mf-btn secondary" data-mf-realistic-reset-custom>${escapeHtml(t('experimentalRealisticResetCustom'))}</button>
        </div>
        <div style="margin-top:10px;padding:8px;border:1px solid #323841;border-radius:7px;background:#0e1115;">
          <div class="mf-tt-row">
            <span style="font-size:11px;">${escapeHtml(t('experimentalRealisticGpuLoad'))}</span>
            <strong style="font-size:11px;" data-mf-realistic-load>${load}% · ${escapeHtml(loadLabel)}</strong>
          </div>
          <div style="height:5px;background:#262b31;border-radius:999px;overflow:hidden;margin-top:6px;"><div data-mf-realistic-loadbar style="height:100%;width:${Math.min(100, load)}%;background:var(--mf-ui-accent,#ef3b3b);"></div></div>
          <div class="mf-muted" style="margin-top:6px;font-size:10px;">${escapeHtml(t('experimentalRealisticGpuHint'))}</div>
        </div>

        ${section('experimentalRealisticWorld', `
          ${slider('renderBlocks', 'experimentalRealisticRenderBlocks', 10, 200, 1, ' blocks')}
          ${check('optimizeFps', 'experimentalRealisticOptimizeFps')}
          <div class="mf-muted" style="margin-top:5px;font-size:10px;line-height:1.45;">${escapeHtml(t('experimentalRealisticOptimizeFpsHint'))}</div>
          ${slider('targetFps', 'experimentalRealisticTargetFps', 30, 144, 1, ' FPS')}
        `, true)}

        ${section('experimentalRealisticShadows', `
          <div class="mf-tt-row" style="margin-top:7px;"><span style="font-size:11px;">${escapeHtml(t('experimentalRealisticShadowResolution'))}</span><strong style="font-size:11px;" data-mf-realistic-custom-value="shadowResolution">${c.shadowResolution}</strong></div>
          <select class="mf-input" data-mf-realistic-custom-select="shadowResolution" style="width:100%;margin-top:4px;">
            ${[512,1024,2048,4096,8192].map(v => `<option value="${v}" ${c.shadowResolution === v ? 'selected' : ''}>${v} × ${v}</option>`).join('')}
          </select>
          ${slider('shadowSamples', 'experimentalRealisticShadowSamples', 1, 64, 1, '')}
          ${slider('shadowSharpness', 'experimentalRealisticShadowSharpness', 0, 100, 1)}
          ${slider('shadowSoftness', 'experimentalRealisticShadowSoftness', 0, 100, 1)}
          ${slider('shadowDistanceSoftening', 'experimentalRealisticShadowDistanceSoftening', 0, 200, 1)}
          ${slider('shadowSunAngleSoftening', 'experimentalRealisticShadowSunSoftening', 0, 200, 1)}
          ${slider('shadowDarkness', 'experimentalRealisticShadowDarkness', 0, 100, 1)}
          ${slider('shadowArtifactFix', 'experimentalRealisticShadowArtifactFix', 0, 100, 1)}
          ${check('moonShadows', 'experimentalRealisticMoonShadows')}
        `)}

        ${section('experimentalRealisticWater', `
          ${slider('waterTransparency', 'experimentalRealisticWaterTransparency', 0, 90, 1)}
          ${slider('waterWaveStrength', 'experimentalRealisticWaterWaveStrength', 0, 250, 1)}
          ${slider('waterWaveSpeed', 'experimentalRealisticWaterWaveSpeed', 25, 300, 1)}
          ${slider('waterMicroDetail', 'experimentalRealisticWaterMicroDetail', 0, 250, 1)}
          ${slider('waterReflection', 'experimentalRealisticWaterReflection', 0, 150, 1)}
          ${slider('waterRefraction', 'experimentalRealisticWaterRefraction', 0, 150, 1)}
          ${slider('waterSsrSteps', 'experimentalRealisticWaterSsrSteps', 4, 64, 1, ' steps')}
        `)}

        ${section('experimentalRealisticLava', `
          ${slider('lavaOpacity', 'experimentalRealisticLavaOpacity', 50, 100, 1)}
          ${slider('lavaWaveStrength', 'experimentalRealisticLavaWaveStrength', 0, 250, 1)}
          ${slider('lavaWaveSpeed', 'experimentalRealisticLavaWaveSpeed', 25, 300, 1)}
          ${slider('lavaBubbles', 'experimentalRealisticLavaBubbles', 0, 200, 1)}
          ${slider('lavaEmission', 'experimentalRealisticLavaEmission', 0, 200, 1)}
        `)}

        ${section('experimentalRealisticClouds', `
          ${slider('cloudSteps', 'experimentalRealisticCloudSteps', 8, 64, 1, ' steps')}
          ${slider('cloudShadowSteps', 'experimentalRealisticCloudShadowSteps', 0, 8, 1, ' steps')}
          ${slider('cloudDensity', 'experimentalRealisticCloudDensity', 0, 200, 1)}
          ${slider('cloudThickness', 'experimentalRealisticCloudThickness', 25, 250, 1)}
          ${slider('cloudOpacity', 'experimentalRealisticCloudOpacity', 0, 150, 1)}
          ${slider('cloudSpeed', 'experimentalRealisticCloudSpeed', 0, 300, 1)}
          ${slider('cloudSilverLining', 'experimentalRealisticCloudSilver', 0, 200, 1)}
        `)}

        ${section('experimentalRealisticWetness', `
          ${slider('wetCells', 'experimentalRealisticWetCells', 4, 64, 1, ' cells')}
          ${slider('wetRadius', 'experimentalRealisticWetRadius', 2, 16, 1, ' blocks')}
          ${slider('wetDarken', 'experimentalRealisticWetDarken', 0, 50, 1)}
          ${slider('wetSaturation', 'experimentalRealisticWetSaturation', 0, 40, 1)}
          ${slider('wetSheen', 'experimentalRealisticWetSheen', 0, 100, 1)}
          ${slider('wetGloss', 'experimentalRealisticWetGloss', 0, 100, 1)}
          ${slider('wetDetail', 'experimentalRealisticWetDetail', 0, 200, 1)}
          ${check('puddles', 'experimentalRealisticPuddles')}
          ${slider('maxPuddles', 'experimentalRealisticMaxPuddles', 0, 64, 1, '')}
          ${slider('puddleReflection', 'experimentalRealisticPuddleReflection', 0, 100, 1)}
          ${slider('puddleRipple', 'experimentalRealisticPuddleRipple', 0, 100, 1)}
          ${slider('puddleDetail', 'experimentalRealisticPuddleDetail', 0, 200, 1)}
          ${slider('drySeconds', 'experimentalRealisticDrySeconds', 10, 900, 5, ' s')}
        `)}
      </div>`;
  }

  function renderExperimentalPage() {
    const registry = globalThis.MF_ExperimentalRegistry;
    const experiments = registry?.list?.().filter(exp => exp?.settingsKey) || [];

    if (!experiments.length) {
      return `
        <div class="mf-page-stack">
          <div class="mf-card" style="min-height:180px;display:flex;align-items:center;justify-content:center;text-align:center;">
            <div class="mf-card-title" style="font-size:18px;margin:0;color:#7c828a;">${escapeHtml(t('experimentalComingSoon'))}</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-toggle-grid">
            ${experiments.map(exp => {
              const key = String(exp.settingsKey);
              const enabled = !!guiSettings[key];
              const title = exp.titleKey ? t(exp.titleKey) : String(exp.title || exp.id);
              const description = exp.descriptionKey ? t(exp.descriptionKey) : String(exp.description || '');
              const levelKey = String(exp.levelKey || '');
              const levels = Array.isArray(exp.levels) ? exp.levels : [];
              const rawLevel = levelKey ? String(guiSettings[levelKey] || settings[levelKey] || 'medium') : '';
              const currentLevel = levelKey === 'experimentalRealisticLevel' && rawLevel === 'extreme' ? 'ultra' : rawLevel;
              return `
                <label class="mf-toggle" data-key="${escapeHtml(key)}">
                  <span class="mf-feature-icon" aria-hidden="true" style="font-size:34px;line-height:1;">${escapeHtml(exp.icon || '🧪')}</span>
                  <span class="mf-toggle-copy">
                    <strong>${escapeHtml(title)}</strong>
                    <span>${escapeHtml(description)}</span>
                  </span>
                  ${levelKey && levels.length ? `
                    <select class="mf-input mf-experimental-level" data-mf-experimental-level="${escapeHtml(levelKey)}" aria-label="${escapeHtml(t(exp.levelLabelKey || 'experimentalAuroraQuality'))}">
                      ${levels.map(level => {
                        const value = String(level.value || '');
                        const label = level.labelKey ? t(level.labelKey) : String(level.label || value);
                        return `<option value="${escapeHtml(value)}" ${currentLevel === value ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                      }).join('')}
                    </select>
                  ` : ''}
                  <span class="mf-feature-state ${enabled ? 'enabled' : 'disabled'}">${enabled ? t('enabled') : t('disabled')}</span>
                  <input type="checkbox" class="mf-switch-hidden" ${enabled ? 'checked' : ''}>
                </label>
              `;
            }).join('')}
          </div>
        </div>
        ${renderRealisticCustomControls()}
        <div class="mf-card" id="mf-realistic-wetness-section">
          <div class="mf-card-title">💧 ${escapeHtml(t('experimentalWetnessTitle'))}</div>
          <div style="font-size:11px;color:#aaa;margin-bottom:10px;line-height:1.5;">${escapeHtml(t('experimentalWetnessDesc'))}</div>
          <div class="mf-tt-row">
            <span style="font-size:11px;">${escapeHtml(t('experimentalWetnessDryTime'))}</span>
            <strong style="font-size:11px;" data-mf-wet-dry-value>${Math.round(Number(guiSettings.experimentalWetDrySeconds || settings.experimentalWetDrySeconds || 180))} s</strong>
          </div>
          <input type="range" min="30" max="600" step="15" value="${Math.round(Number(guiSettings.experimentalWetDrySeconds || settings.experimentalWetDrySeconds || 180))}" data-mf-wet-dry style="width:100%;">
          <div class="mf-muted" style="margin-top:7px;font-size:10px;">${escapeHtml(t('experimentalWetnessDryHint'))}</div>
        </div>
        <div class="mf-card" id="mf-pbr-section">
          <div class="mf-card-title">✨ PBR Textures</div>
          <div style="font-size: 11px; color: #aaa; margin-bottom: 10px; line-height: 1.5;">
            ${t('pbrDesc')}
            <span data-pbr-kinds style="color: #7c828a;"></span>
          </div>
          <div class="mf-tt-row"><span style="font-size: 11px;">${t('pbrNormalStr')}</span><strong style="font-size: 11px;" data-pbr-nv>1.00</strong></div>
          <input type="range" min="0" max="2" step="0.05" value="1" data-pbr-normal style="width: 100%;">
          <div class="mf-tt-row" style="margin-top: 6px;"><span style="font-size: 11px;">${t('pbrSpecStr')}</span><strong style="font-size: 11px;" data-pbr-sv>0.70</strong></div>
          <input type="range" min="0" max="2" step="0.05" value="0.7" data-pbr-spec style="width: 100%;">
          <div class="mf-tt-row" style="margin-top: 6px;"><span style="font-size: 11px;">${t('pbrShiny')}</span><strong style="font-size: 11px;" data-pbr-hv>24</strong></div>
          <input type="range" min="2" max="128" step="1" value="24" data-pbr-shiny style="width: 100%;">
          <div class="mf-tt-row" style="margin-top: 6px;"><span style="font-size: 11px;">${t('pbrEmissiveStr')}</span><strong style="font-size: 11px;" data-pbr-ev>1.00</strong></div>
          <input type="range" min="0" max="3" step="0.05" value="1" data-pbr-emissive style="width: 100%;">
          <div class="mf-tt-row" style="margin-top: 10px;"><span style="font-size: 11px;">${t('pbrPresetLabel')}</span></div>
          <select id="mf-pbr-preset" style="width: 100%; font-size: 11px; padding: 4px 6px; background: #26292e; color: #e8e8e8; border: 1px solid #3a3f46; border-radius: 4px; margin-top: 4px;">
            <option value="">${t('pbrPresetLoading')}</option>
          </select>
          <div id="mf-pbr-preset-status" style="font-size: 10px; color: #7c828a; margin-top: 4px; min-height: 13px;"></div>
          <div class="mf-tt-row" style="margin-top: 10px; gap: 6px;">
            <button id="mf-pbr-edit" class="mf-btn" style="font-size: 10px; padding: 4px 10px; background: #26303c; color: #9fc4ff; border: 1px solid #3a5a80; border-radius: 4px; cursor: pointer;">${t('pbrEditorBtn')}</button>
            <button id="mf-pbr-clear" class="mf-btn" style="font-size: 10px; padding: 4px 10px; background: #5a2020; color: #ff8080; border: 1px solid #804040; border-radius: 4px; cursor: pointer;">${t('pbrClear')}</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderShadersPage() {
    const strength = Number(settings.customShaderStrength) || 0.5;
    const renderScale = Number(settings.customShaderRenderScale) || 1.0;
    const preset = settings.customShaderPreset || 'spooklementary';
    const isUltrafast = preset === 'ultrafast';
    const isPhoton = preset === 'photon';
    const isComplementary = preset === 'complementaryInspired';
    const isGraveyard = preset === 'graveyard';

    // Sliders de efectos según el preset activo
    const fxSliders = isUltrafast
      ? [
          { id: 'ufsat', label: t('shadersUfSat'), value: Number(settings.customShaderFxUfsat ?? 1.35), min: 0.5, max: 2, step: 0.05, fmt: v => v.toFixed(2) },
          { id: 'ufcontrast', label: t('shadersUfContrast'), value: Number(settings.customShaderFxUfcontrast ?? 0.45), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'uftone', label: t('shadersUfTone'), value: Number(settings.customShaderFxUftone ?? 0.35), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' }
        ]
      : isPhoton
      ? [
          { id: 'phagx', label: t('shadersPhAgx'), value: Number(settings.customShaderFxPhagx ?? 0.8), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'phfog', label: t('shadersPhFog'), value: Number(settings.customShaderFxPhfog ?? 0.5), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'phend', label: t('shadersPhEnd'), value: Number(settings.customShaderFxPhend ?? 0), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'phbh', label: t('shadersPhBH'), value: Number(settings.customShaderFxPhbh ?? 0), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'phbhsize', label: t('shadersPhBHSize'), value: Number(settings.customShaderFxPhbhsize ?? 0.35), min: 0.05, max: 1, step: 0.05, fmt: v => v.toFixed(2) },
          { id: 'phbhspin', label: t('shadersPhBHSpin'), value: Number(settings.customShaderFxPhbhspin ?? 1), min: 0, max: 3, step: 0.1, fmt: v => v.toFixed(1) }
        ]
      : isComplementary
      ? [
          { id: 'crtm', label: t('shadersCrTm'), value: Number(settings.customShaderFxCrtm ?? 0.8), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'crexp', label: t('shadersCrExp'), value: Number(settings.customShaderFxCrexp ?? 1.0), min: 0.4, max: 2.8, step: 0.05, fmt: v => v.toFixed(2) },
          { id: 'crc', label: t('shadersCrC'), value: Number(settings.customShaderFxCrc ?? 1.05), min: 0.5, max: 2, step: 0.05, fmt: v => v.toFixed(2) },
          { id: 'crsat', label: t('shadersCrSat'), value: Number(settings.customShaderFxcrsat ?? 1.0), min: 0, max: 2, step: 0.05, fmt: v => v.toFixed(2) },
          { id: 'crvib', label: t('shadersCrVib'), value: Number(settings.customShaderFxcrvib ?? 1.0), min: 0, max: 2, step: 0.05, fmt: v => v.toFixed(2) },
          { id: 'crvig', label: t('shadersCrVig'), value: Number(settings.customShaderFxcrvig ?? 0.5), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'crfog', label: t('shadersCrFog'), value: Number(settings.customShaderFxcrfog ?? 0.4), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'crdith', label: t('shadersCrDith'), value: Number(settings.customShaderFxcrdith ?? 1), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' }
        ]
      : isGraveyard
      ? [
          { id: 'gvfog', label: t('shadersGvFog'), value: Number(settings.customShaderFxGvfog ?? 0.8), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'gvdist', label: t('shadersGvDist'), value: Number(settings.customShaderFxGvdist ?? 30), min: 8, max: 120, step: 2, fmt: v => Math.round(v) + 'm' },
          { id: 'gvdesat', label: t('shadersGvDesat'), value: Number(settings.customShaderFxGvdesat ?? 0.55), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'gvblue', label: t('shadersGvBlue'), value: Number(settings.customShaderFxGvblue ?? 0.35), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'gvgrain', label: t('shadersGvGrain'), value: Number(settings.customShaderFxGvgrain ?? 0.3), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'gvlight', label: t('shadersGvLight'), value: Number(settings.customShaderFxGvlight ?? 0.3), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' }
        ]
      : [
          { id: 'vhs', label: t('shadersVhs'), value: Number(settings.customShaderFxVhs ?? 0.6), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'crt', label: t('shadersCrt'), value: Number(settings.customShaderFxCrt ?? 0.6), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'cel', label: t('shadersFxCel'), value: Number(settings.customShaderFxCel ?? 0.6), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'fog', label: t('shadersFxFog'), value: Number(settings.customShaderFxFog ?? 0.7), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'grain', label: t('shadersFxGrain'), value: Number(settings.customShaderFxGrain ?? 0.5), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'glitch', label: t('shadersFxGlitch'), value: Number(settings.customShaderFxGlitch ?? 0.4), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'flash', label: t('shadersFxFlash'), value: Number(settings.customShaderFxFlash ?? 0.5), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
          { id: 'sharp', label: t('shadersFxSharp'), value: Number(settings.customShaderFxSharp ?? 0.5), min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' }
        ];

    const fxSlidersHtml = fxSliders.map((fx, i) => `
          <div class="mf-shader-strength"${i < fxSliders.length - 1 ? ' style="margin-bottom:10px;"' : ''}>
            <span style="min-width:90px;font-size:12px;">${fx.label}</span>
            <input id="mf-shader-fx-${fx.id}" type="range" min="${fx.min}" max="${fx.max}" step="${fx.step}" value="${fx.value}">
            <span id="mf-shader-fx-${fx.id}-value">${fx.fmt(fx.value)}</span>
          </div>`).join('');

    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('navShaders')}</div>
          <div class="mf-toggle-grid">
            ${renderToggle('customShader', t('navShaders'), t('shadersDesc'))}
          </div>
        </div>

        <div class="mf-card">
          <div class="mf-card-title">${t('shadersPreset')}</div>
          <select id="mf-shader-preset" class="mf-select">
            <option value="spooklementary"${preset === 'spooklementary' ? ' selected' : ''}>Spooklementary</option>
            <option value="complementaryInspired"${preset === 'complementaryInspired' ? ' selected' : ''}>Complementary Inspired</option>
            <option value="ultrafast"${preset === 'ultrafast' ? ' selected' : ''}>UltraFast</option>
            <option value="photon"${preset === 'photon' ? ' selected' : ''}>Photon</option>
            <option value="graveyard"${preset === 'graveyard' ? ' selected' : ''}>${t('shadersGraveyard')}</option>
          </select>
          <div class="mf-muted" style="margin-top:8px;font-size:11px;">${isUltrafast ? t('shadersUfDesc') : isPhoton ? t('shadersPhDesc') : t('shadersHint')}</div>
        </div>

        <div class="mf-card">
          <div class="mf-card-title">${t('shadersStrength')}</div>
          <div class="mf-shader-strength">
            <input
              id="mf-shader-strength"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value="${strength}"
            >
            <span id="mf-shader-strength-value">${Math.round(strength * 100)}%</span>
          </div>
        </div>

        <div class="mf-card">
          <div class="mf-card-title">${t('shadersRenderScale')}</div>
          <div class="mf-muted" style="margin-bottom:8px;font-size:11px;">${t('shadersRenderScaleDesc')}</div>
          <div class="mf-shader-strength">
            <input
              id="mf-shader-renderscale"
              type="range"
              min="0.5"
              max="1"
              step="0.05"
              value="${renderScale}"
            >
            <span id="mf-shader-renderscale-value">${Math.round(renderScale * 100)}%</span>
          </div>
        </div>

        <div class="mf-card">
          <div class="mf-card-title">${t('postfxTitle')}</div>
          <div class="mf-muted" style="margin-bottom:8px;font-size:11px;">${t('postfxDesc')}</div>
          ${[
            { id: 'bloom', label: t('postfxBloom'), value: Number(settings.customShaderPfbloom ?? 0.35) },
            { id: 'ca', label: t('postfxCA'), value: Number(settings.customShaderPfca ?? 0) },
            { id: 'dof', label: t('postfxDof'), value: Number(settings.customShaderPfdof ?? 0) },
            { id: 'dirt', label: t('postfxDirt'), value: Number(settings.customShaderPfdirt ?? 0) },
            { id: 'vignette', label: t('postfxVignette'), value: Number(settings.customShaderPfvignette ?? 0) }
          ].map((fx, i, arr) => `
          <div class="mf-shader-strength"${i < arr.length - 1 ? ' style="margin-bottom:10px;"' : ''}>
            <span style="min-width:90px;font-size:12px;">${fx.label}</span>
            <input id="mf-postfx-${fx.id}" type="range" min="0" max="1" step="0.05" value="${fx.value}">
            <span id="mf-postfx-${fx.id}-value">${Math.round(fx.value * 100)}%</span>
          </div>`).join('')}
        </div>

        <div class="mf-card">
          <div class="mf-card-title">${t('cloudsTitle')}</div>
          <div class="mf-shader-grid" style="margin-bottom:10px;">
            <button class="mf-btn secondary mf-cloud-preset" data-clouds="default">${t('cloudsDefault')}</button>
            <button class="mf-btn secondary mf-cloud-preset" data-clouds="overcast">${t('cloudsOvercast')}</button>
            <button class="mf-btn secondary mf-cloud-preset" data-clouds="storm">${t('cloudsStorm')}</button>
            <button class="mf-btn secondary mf-cloud-preset" data-clouds="scattered">${t('cloudsScattered')}</button>
            <button class="mf-btn secondary mf-cloud-preset" data-clouds="giant">${t('cloudsGiant')}</button>
            <button class="mf-btn secondary mf-cloud-preset" data-clouds="flat">${t('cloudsFlat')}</button>
          </div>
          <div class="mf-shader-strength" style="margin-bottom:10px;">
            <span style="min-width:90px;font-size:12px;">${t('cloudsCoverage')}</span>
            <input id="mf-cloud-coverage" type="range" min="0" max="1" step="0.05" value="${Number(settings.cloudsCoverage ?? 0.5)}">
            <span id="mf-cloud-coverage-value">${Math.round(Number(settings.cloudsCoverage ?? 0.5) * 100)}%</span>
          </div>
          <div class="mf-toggle-grid" style="margin-bottom:10px;">
            ${renderToggle('cloudsPackNoise', t('cloudsPackNoise'), t('cloudsPackNoiseHint'), () => sendCloudsConfig())}
          </div>
          <div class="mf-shader-strength" style="margin-bottom:10px;">
            <span style="min-width:90px;font-size:12px;">${t('cloudsScale')}</span>
            <input id="mf-cloud-scale" type="range" min="0.002" max="0.06" step="0.002" value="${Number(settings.cloudsScale ?? 0.012)}">
            <span id="mf-cloud-scale-value">${Number(settings.cloudsScale ?? 0.012).toFixed(3)}</span>
          </div>
          <div class="mf-shader-strength" style="margin-bottom:10px;">
            <span style="min-width:90px;font-size:12px;">${t('cloudsWind')}</span>
            <input id="mf-cloud-wind" type="range" min="0" max="0.3" step="0.01" value="${Number(settings.cloudsWind ?? 0.02)}">
            <span id="mf-cloud-wind-value">${Number(settings.cloudsWind ?? 0.02).toFixed(2)}</span>
          </div>
          <div class="mf-shader-strength" style="margin-bottom:10px;">
            <span style="min-width:90px;font-size:12px;">${t('cloudsThickness')}</span>
            <input id="mf-cloud-thickness" type="range" min="1" max="200" step="1" value="${Number(settings.cloudsThickness ?? 30)}">
            <span id="mf-cloud-thickness-value">${Math.round(Number(settings.cloudsThickness ?? 30))}</span>
          </div>
          <div class="mf-shader-strength" style="margin-bottom:10px;">
            <span style="min-width:90px;font-size:12px;">${t('cloudsHeight')}</span>
            <input id="mf-cloud-height" type="range" min="60" max="400" step="5" value="${Number(settings.cloudsHeight ?? 128)}">
            <span id="mf-cloud-height-value">${Math.round(Number(settings.cloudsHeight ?? 128))}</span>
          </div>
          <div class="mf-shader-strength">
            <span style="min-width:90px;font-size:12px;">${t('cloudsOpacity')}</span>
            <input id="mf-cloud-opacity" type="range" min="0" max="1" step="0.05" value="${Number(settings.cloudsOpacity ?? 0.9)}">
            <span id="mf-cloud-opacity-value">${Math.round(Number(settings.cloudsOpacity ?? 0.9) * 100)}%</span>
          </div>
        </div>

        <div class="mf-card">
          <div class="mf-card-title">${t('cloudsShapeTitle')}</div>
          <div class="mf-muted" style="margin-bottom:8px;font-size:11px;">${t('cloudsShapeHint')}</div>
          <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px;">
            <canvas id="mf-cloud-shape-canvas" width="256" height="256"
              style="width:200px;height:200px;background:#000;border:1px solid var(--mf-border,#444);border-radius:6px;cursor:crosshair;touch-action:none;image-rendering:pixelated;flex-shrink:0;"></canvas>
            <div style="flex:1;min-width:150px;">
              <div class="mf-shader-strength" style="margin-bottom:8px;">
                <span style="min-width:80px;font-size:12px;">${t('cloudsShapeBrush')}</span>
                <input id="mf-cloud-shape-brush" type="range" min="2" max="40" step="1" value="${Number(settings.cloudsShapeBrush ?? 12)}">
                <span id="mf-cloud-shape-brush-value">${Math.round(Number(settings.cloudsShapeBrush ?? 12))}px</span>
              </div>
              <div class="mf-shader-strength" style="margin-bottom:8px;">
                <span style="min-width:80px;font-size:12px;">${t('cloudsShapeMix')}</span>
                <input id="mf-cloud-shape-mix" type="range" min="0" max="1" step="0.05" value="${Number(settings.cloudsShapeMix ?? 0.85)}">
                <span id="mf-cloud-shape-mix-value">${Math.round(Number(settings.cloudsShapeMix ?? 0.85) * 100)}%</span>
              </div>
              <div class="mf-shader-strength">
                <span style="min-width:80px;font-size:12px;">${t('cloudsShapeTile')}</span>
                <input id="mf-cloud-shape-tile" type="range" min="64" max="2048" step="32" value="${Number(settings.cloudsShapeTile ?? 512)}">
                <span id="mf-cloud-shape-tile-value">${Math.round(Number(settings.cloudsShapeTile ?? 512))}</span>
              </div>
            </div>
          </div>
          <div class="mf-shader-grid">
            <button id="mf-cloud-shape-apply" class="mf-btn primary">${t('cloudsShapeApply')}</button>
            <button id="mf-cloud-shape-clear" class="mf-btn secondary">${t('cloudsShapeClear')}</button>
            <button id="mf-cloud-shape-remove" class="mf-btn danger">${t('cloudsShapeRemove')}</button>
          </div>
        </div>

        <div class="mf-card">
          <div class="mf-card-title">${t('shadersFxConfig')}</div>
          ${fxSlidersHtml}
        </div>

        <div class="mf-card">
          <div class="mf-card-title">${t('shadersHint')}</div>
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

  function sendClientChatConfig(enabled = settings.clientChat) {
    document.dispatchEvent(new CustomEvent('minifeather:client-chat-config', {
      detail: JSON.stringify({
        enabled: !!enabled,
        mentionSound: settings.clientChatMentions !== false
      })
    }));
  }

  function sendClientChatCommand(action, payload = {}) {
    document.dispatchEvent(new CustomEvent('minifeather:client-chat-command', {
      detail: JSON.stringify({ action, ...payload })
    }));
  }

  function initClientChatModule() {
    registerModule('clientChat', () => createLifecycle({
      enable() { sendClientChatConfig(true); },
      disable() { sendClientChatConfig(false); },
      refresh() { sendClientChatConfig(MODULES.get('clientChat')?.enabled === true); },
      destroy() { sendClientChatConfig(false); }
    }));

    document.addEventListener('minifeather:client-chat-state', event => {
      try {
        clientChatState = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      } catch (_) {
        clientChatState = null;
      }
      refreshClientChatView();
    }, { signal: runtimeController?.signal });
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function clientChatRichHtml(text) {
    const raw = String(text || '');
    const memeByCode = new Map(CHAT_GIFS.map(item => [`:${item.id}:`, item.file]));
    const tokenRegex = /(https?:\/\/[^\s<>"']+|:[a-zA-Z0-9_-]{1,96}:)/gi;
    let output = '';
    let cursor = 0;
    let match;

    while ((match = tokenRegex.exec(raw))) {
      if (match.index > cursor) output += escapeHtml(raw.slice(cursor, match.index));
      const token = match[0];
      const memeFile = memeByCode.get(token);

      if (memeFile && settings.chatMemes) {
        const src = chrome.runtime.getURL(`assets/memes/gif/${memeFile}`);
        output += `<img class="mf-client-chat-inline-meme" src="${escapeHtml(src)}" alt="${escapeHtml(token)}" loading="lazy" decoding="async">`;
      } else if (/^https?:\/\//i.test(token) && settings.chatLinks) {
        output += `<a class="mf-client-chat-link" href="${escapeHtml(token)}" target="_blank" rel="noopener noreferrer">${escapeHtml(token)}</a>`;
      } else {
        output += escapeHtml(token);
      }

      cursor = match.index + token.length;
    }

    if (cursor < raw.length) output += escapeHtml(raw.slice(cursor));
    return output;
  }

  function clientChatMessageHtml(message) {
    const state = clientChatState || {};
    const username = String(state.username || '');
    const own = message?.own === true;
    const rawText = String(message?.text || '');
    const mentioned = username && new RegExp(`@${escapeRegExp(username)}(?:\\b|$)`, 'i').test(rawText);
    const time = Number(message?.time) || Date.now();
    const timeText = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="mf-client-chat-message ${own ? 'own' : ''} ${mentioned ? 'mentioned' : ''}">
        <div class="mf-client-chat-meta">
          <strong>${escapeHtml(message?.name || 'Player')}</strong>
          <span>${escapeHtml(timeText)}</span>
        </div>
        <div class="mf-client-chat-text">${clientChatRichHtml(rawText)}</div>
      </div>
    `;
  }

  function refreshClientChatView() {
    if (!panel || activePage !== 'chat') return;
    const state = clientChatState || {};
    const status = panel.querySelector('#mf-client-chat-status');
    const online = panel.querySelector('#mf-client-chat-online');
    const identity = panel.querySelector('#mf-client-chat-identity');
    const messages = panel.querySelector('#mf-client-chat-messages');
    const input = panel.querySelector('#mf-client-chat-input');
    const send = panel.querySelector('#mf-client-chat-send');
    const connect = panel.querySelector('#mf-client-chat-connect');

    if (status) {
      status.textContent = !settings.clientChat
        ? t('clientChatOffline')
        : state.connected
          ? t('clientChatConnected')
          : t('clientChatConnecting');
      status.dataset.state = !settings.clientChat ? 'offline' : state.connected ? 'connected' : 'connecting';
    }
    if (online) online.textContent = `${t('clientChatOnline')}: ${Number(state.online) || 0}`;
    if (identity) identity.textContent = `${t('clientChatYou')}: ${state.username || '—'}`;
    if (connect) {
      connect.textContent = settings.clientChat ? t('clientChatDisconnect') : t('clientChatConnect');
      connect.classList.toggle('danger', settings.clientChat === true);
    }
    if (messages) {
      const rows = Array.isArray(state.messages) ? state.messages : [];
      messages.innerHTML = rows.length
        ? rows.map(clientChatMessageHtml).join('')
        : `<div class="mf-client-chat-empty">${t('clientChatEmpty')}</div>`;
      messages.scrollTop = messages.scrollHeight;
    }

    const ready = settings.clientChat === true;
    if (input) input.disabled = !ready;
    if (send) send.disabled = !ready;
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
          <div class="mf-card-title">${t('clientChatTitle')}</div>
          <div class="mf-toggle-grid">
            ${renderToggle('clientChat', t('clientChat'), t('clientChatDesc'))}
            ${renderToggle('clientChatMentions', t('clientChatMentions'), t('clientChatMentionsDesc'))}
          </div>
          <div class="mf-muted mf-client-chat-privacy">${t('clientChatPrivacy')}</div>
          <div class="mf-client-chat-head">
            <span id="mf-client-chat-status" data-state="offline">${t('clientChatOffline')}</span>
            <span id="mf-client-chat-online">${t('clientChatOnline')}: 0</span>
            <span id="mf-client-chat-identity">${t('clientChatYou')}: —</span>
            <button id="mf-client-chat-connect" class="mf-small-btn" type="button">${settings.clientChat ? t('clientChatDisconnect') : t('clientChatConnect')}</button>
          </div>
          <div id="mf-client-chat-messages" class="mf-client-chat-messages">
            <div class="mf-client-chat-empty">${t('clientChatEmpty')}</div>
          </div>
          <div class="mf-client-chat-compose">
            <input id="mf-client-chat-input" class="mf-input" maxlength="240" placeholder="${t('clientChatPlaceholder')}">
            <button id="mf-client-chat-send" class="mf-btn primary" type="button">${t('clientChatSend')}</button>
          </div>
          <div class="mf-muted">${t('clientChatMentionHint')}</div>
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

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function readWaypointV2State() {
    const fallback = { world: null, waypoints: [], worlds: [], legacyCount: 0 };
    try {
      const store = JSON.parse(localStorage.getItem('minifeather_waypoints_v2') || '{"version":2,"worlds":{}}');
      const world = JSON.parse(localStorage.getItem('minifeather_waypoints_v2_active') || 'null');
      const legacy = JSON.parse(localStorage.getItem('minifeather_waypoints_v1') || '[]');
      const worldsObj = store && store.version === 2 && store.worlds && typeof store.worlds === 'object' ? store.worlds : {};
      const activeEntry = world?.key ? worldsObj[world.key] : null;
      const waypoints = Array.isArray(activeEntry?.waypoints)
        ? activeEntry.waypoints.filter(item => item && item.id && item.name && Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)) && Number.isFinite(Number(item.z)))
        : [];
      const worlds = Object.values(worldsObj)
        .filter(item => item && item.key)
        .map(item => ({
          key: String(item.key),
          label: String(item.label || 'MiniBlox World'),
          dimensionId: Number(item.dimensionId) || 0,
          isLocal: !!item.isLocal,
          updatedAt: Number(item.updatedAt) || 0,
          count: Array.isArray(item.waypoints) ? item.waypoints.length : 0
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      return {
        world: world?.key ? world : null,
        waypoints,
        worlds,
        legacyCount: Array.isArray(legacy) ? legacy.length : 0
      };
    } catch (_) {
      return fallback;
    }
  }

  function renderWaypointsPage() {
    const data = readWaypointV2State();
    const waypoints = data.waypoints;
    const currentKey = data.world?.key || '';
    const currentWorld = data.world
      ? `<div class="mf-waypoint-world-head">
          <div class="mf-waypoint-world-copy">
            <span>${t('waypointCurrentWorld')}</span>
            <strong>${escapeHtml(data.world.label || 'MiniBlox World')}</strong>
            <span>${t('waypointDimension')} ${Number(data.world.dimensionId) || 0}</span>
          </div>
          <span class="mf-waypoint-world-badge">${data.world.isLocal ? 'LOCAL' : 'SERVER'}</span>
        </div>`
      : `<div class="mf-waypoint-no-world">${t('waypointNoWorld')}</div>`;

    const legacy = data.legacyCount > 0
      ? `<div class="mf-waypoint-legacy">
          <div class="mf-waypoint-legacy-copy">
            <strong>${t('waypointLegacyFound')}</strong>
            <span>${t('waypointLegacyDesc', { count: data.legacyCount })}</span>
          </div>
          <div class="mf-waypoint-legacy-actions">
            <button type="button" class="mf-btn primary" data-waypoint-import-legacy ${!data.world ? 'disabled' : ''}>${t('waypointImportCurrent')}</button>
            <button type="button" class="mf-btn danger" data-waypoint-delete-legacy>${t('waypointDeleteLegacy')}</button>
          </div>
        </div>`
      : '';

    const rows = waypoints.length
      ? waypoints.map(wp => `
          <div class="mf-waypoint-row ${wp.visible === false ? 'is-hidden' : ''}" data-waypoint-id="${escapeHtml(wp.id)}" data-x="${Number(wp.x)}" data-y="${Number(wp.y)}" data-z="${Number(wp.z)}">
            <div class="mf-waypoint-icon" style="--wp-color:${escapeHtml(wp.color || '#8b5cf6')}">📍</div>
            <div class="mf-waypoint-copy">
              <strong>${escapeHtml(wp.name)}</strong>
              <div class="mf-waypoint-meta">
                <span>XYZ ${Math.floor(Number(wp.x))} ${Math.floor(Number(wp.y))} ${Math.floor(Number(wp.z))}</span>
                ${wp.visible === false ? `<span>${t('waypointHidden')}</span>` : ''}
              </div>
            </div>
            <div class="mf-waypoint-actions">
              <button type="button" class="mf-btn secondary" data-waypoint-visibility>${wp.visible === false ? t('waypointShow') : t('waypointHide')}</button>
              <button type="button" class="mf-btn secondary" data-waypoint-edit>${t('waypointEdit')}</button>
              <button type="button" class="mf-btn secondary" data-waypoint-copy>${t('waypointCopy')}</button>
              <button type="button" class="mf-btn danger" data-waypoint-delete>${t('waypointDelete')}</button>
            </div>
            <div class="mf-waypoint-edit">
              <input class="mf-waypoint-input" data-waypoint-edit-name maxlength="40" value="${escapeHtml(wp.name)}">
              <input class="mf-waypoint-color" data-waypoint-edit-color type="color" value="${escapeHtml(wp.color || '#8b5cf6')}">
              <label class="mf-waypoint-mini-toggle"><input type="checkbox" data-waypoint-edit-name-visible ${wp.showName !== false ? 'checked' : ''}> ${t('waypointShowName')}</label>
              <label class="mf-waypoint-mini-toggle"><input type="checkbox" data-waypoint-edit-distance-visible ${wp.showDistance !== false ? 'checked' : ''}> ${t('waypointShowDistance')}</label>
              <button type="button" class="mf-btn primary" data-waypoint-save-edit>${t('waypointSave')}</button>
            </div>
          </div>
        `).join('')
      : `<div class="mf-waypoint-empty">${data.world ? t('waypointEmptyWorld') : t('waypointEmpty')}</div>`;

    const worlds = data.worlds.length
      ? data.worlds.map(world => `
          <div class="mf-waypoint-world-row" data-waypoint-world-key="${escapeHtml(world.key)}">
            <div>
              <strong>${escapeHtml(world.label)} ${world.key === currentKey ? `<span class="mf-waypoint-current-tag">· ${t('waypointCurrent')}</span>` : ''}</strong>
              <span>${t('waypointDimension')} ${world.dimensionId} · ${world.count} ${t('waypoints')}</span>
            </div>
            ${world.key === currentKey ? '' : `<button type="button" class="mf-btn danger" data-waypoint-delete-world>${t('waypointDeleteWorld')}</button>`}
          </div>
        `).join('')
      : `<div class="mf-waypoint-empty">${t('waypointNoSavedWorlds')}</div>`;

    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('waypoints')} V2</div>
          <div class="mf-toggle-grid">
            ${renderToggle('waypoints', t('waypoints'), t('waypointsDesc'))}
          </div>
          <div class="mf-tt-hint">${t('waypointsV2Hint')}</div>
          ${currentWorld}
        </div>
        ${legacy ? `<div class="mf-card">${legacy}</div>` : ''}
        <div class="mf-card">
          <div class="mf-card-title">${t('waypointAddTitle')}</div>
          <div class="mf-waypoint-add-grid">
            <input id="mf-waypoint-name" class="mf-waypoint-input" type="text" maxlength="40" placeholder="${t('waypointNamePlaceholder')}" ${!data.world ? 'disabled' : ''}>
            <input id="mf-waypoint-color" class="mf-waypoint-color" type="color" value="#8b5cf6" ${!data.world ? 'disabled' : ''}>
            <button id="mf-waypoint-add" type="button" class="mf-btn primary" ${!data.world ? 'disabled' : ''}>${t('waypointAddCurrent')}</button>
          </div>
          <div id="mf-waypoint-status" class="mf-waypoint-status">${escapeHtml(waypointStatus)}</div>
        </div>
        <div class="mf-card">
          <div class="mf-card-title">${t('waypointSaved')} <span class="mf-waypoint-count">${waypoints.length}</span></div>
          <div class="mf-waypoint-list">${rows}</div>
        </div>
        <div class="mf-card">
          <div class="mf-card-title">${t('waypointSavedWorlds')}</div>
          <div class="mf-waypoint-world-list">${worlds}</div>
        </div>
      </div>
    `;
  }

  function renderMovementPage() {
    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionMovement')}</div>
          <div class="mf-toggle-grid">
            ${renderToggle('autoSprint', t('autoSprint'), t('autoSprintDesc'))}
            ${renderToggle('safeSneak', t('safeSneak'), t('safeSneakDesc'))}
            ${renderToggle('antiAfk', t('antiAfk'), t('antiAfkDesc'))}
          </div>
          <div class="mf-tt-hint">${t('safeSneakHint')}</div>
          <div class="mf-tt-hint">${t('antiAfkRightClickHint')}</div>
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
            ${renderToggle('autoRespawn', t('autoRespawn'), t('autoRespawnDesc'))}
            ${renderToggle('rhythmParkour', t('rhythmParkour'), t('rhythmParkourDescShort'))}
          </div>
        </div>
        <div class="mf-card">
          <div class="mf-card-title">${t('localGamesTitle')}</div>
          <div id="mf-localgames-view"></div>
        </div>
      </div>
    `;
  }

  function renderSettingsPage() {
    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('language')}</div>
          <div class="mf-muted">${t('languageDesc')}</div>
          <div class="mf-settings-row">
            <span class="mf-settings-label">${t('language')}</span>
            <select id="mf-language-select" class="mf-select mf-language-select" aria-label="${t('language')}">
              <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
              <option value="es" ${settings.language === 'es' ? 'selected' : ''}>Español</option>
              <option value="ja" ${settings.language === 'ja' ? 'selected' : ''}>日本語</option>
              <option value="it" ${settings.language === 'it' ? 'selected' : ''}>Italiano</option>
              <option value="zh" ${settings.language === 'zh' ? 'selected' : ''}>中文</option>
              <option value="fr" ${settings.language === 'fr' ? 'selected' : ''}>Français</option>
              <option value="de" ${settings.language === 'de' ? 'selected' : ''}>Deutsch</option>
              <option value="pt" ${settings.language === 'pt' ? 'selected' : ''}>Português</option>
              <option value="ru" ${settings.language === 'ru' ? 'selected' : ''}>Русский</option>
              <option value="ko" ${settings.language === 'ko' ? 'selected' : ''}>한국어</option>
            </select>
          </div>
        </div>
        <div class="mf-card">
          <div class="mf-card-title">${t('panelCustomization')}</div>
          <div class="mf-muted">${t('panelCustomizationDesc')}</div>
          <div class="mf-settings-row">
            <span class="mf-settings-label">${t('panelAccentColor')}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <input id="mf-panel-accent-color" type="color" value="${escapeHtml(normalizePanelColor(settings.panelAccentColor, DEFAULT_SETTINGS.panelAccentColor))}" style="width:44px;height:34px;padding:2px;border:1px solid #30363d;border-radius:6px;background:#171a1e;">
              <input id="mf-panel-accent-text" class="mf-input" value="${escapeHtml(normalizePanelColor(settings.panelAccentColor, DEFAULT_SETTINGS.panelAccentColor))}" maxlength="7" style="width:104px;">
            </div>
          </div>
          <div class="mf-settings-row">
            <span class="mf-settings-label">${t('panelBackgroundColor')}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <input id="mf-panel-background-color" type="color" value="${escapeHtml(normalizePanelColor(settings.panelBackgroundColor, DEFAULT_SETTINGS.panelBackgroundColor))}" style="width:44px;height:34px;padding:2px;border:1px solid #30363d;border-radius:6px;background:#171a1e;">
              <input id="mf-panel-background-text" class="mf-input" value="${escapeHtml(normalizePanelColor(settings.panelBackgroundColor, DEFAULT_SETTINGS.panelBackgroundColor))}" maxlength="7" style="width:104px;">
            </div>
          </div>
          <div class="mf-settings-row">
            <span class="mf-settings-label">${t('panelScale')}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <input id="mf-panel-scale" type="range" min="50" max="120" step="1" value="${clampPanelScale(settings.panelScale)}" style="width:150px;">
              <span id="mf-panel-scale-value" style="min-width:42px;font-variant-numeric:tabular-nums;color:var(--mf-sub);">${clampPanelScale(settings.panelScale)}%</span>
            </div>
          </div>
          <div class="mf-settings-row">
            <span class="mf-settings-label">${t('pageZoomEnabled')}</span>
            <label class="mf-switch" style="margin-left:auto;">
              <input type="checkbox" id="mf-page-zoom-toggle" ${settings.pageZoomEnabled ? 'checked' : ''}>
              <span class="mf-slider"></span>
            </label>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:10px;">
            <button id="mf-panel-custom-reset" class="mf-btn">${t('resetPanelCustomization')}</button>
          </div>
        </div>
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionStartup')}</div>
          <div class="mf-toggle-grid">
            ${renderToggle('startupAnimation', t('startupAnimation'), t('startupAnimationDesc'))}
          </div>
          <div style="margin-top:12px;">
            <button id="mf-replay-intro" class="mf-btn">${t('replayIntro')}</button>
          </div>
        </div>
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

  // ─── Accounts: creador de cuentas MiniFeather + uuid de la cuenta Miniblox ───
  const MF_ACC_TOPIC = 'mf-accounts-req-v1';

  function renderAccountsPage() {
    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('accYourAccount')}</div>
          <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 14px;margin-top:8px;align-items:center;">
            <div class="mf-muted">${t('accUsername')}</div><div id="mf-acc-username">--</div>
            <div class="mf-muted">${t('accUuid')}</div><div id="mf-acc-uuid" style="font-family:monospace;word-break:break-all;">--</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
            <button id="mf-acc-copy-uuid" class="mf-btn">${t('accCopyUuid')}</button>
            <button id="mf-acc-refresh" class="mf-btn">${t('accRefresh')}</button>
          </div>
          <div class="mf-muted" style="margin-top:8px;" id="mf-acc-status"></div>
        </div>
        <div class="mf-card">
          <div class="mf-card-title">${t('accCreateTitle')}</div>
          <div class="mf-muted">${t('accCreateDesc')}</div>
          <div style="display:grid;gap:8px;margin-top:12px;">
            <input id="mf-acc-new-user" class="mf-input" placeholder="${t('accNewUserPh')}" maxlength="16" autocomplete="off" style="background:var(--mf-bg2,#1a1d24);border:1px solid var(--mf-border,#2a2e37);border-radius:8px;color:inherit;padding:8px 10px;">
            <input id="mf-acc-new-pass" class="mf-input" type="password" placeholder="${t('accNewPassPh')}" maxlength="64" autocomplete="new-password" style="background:var(--mf-bg2,#1a1d24);border:1px solid var(--mf-border,#2a2e37);border-radius:8px;color:inherit;padding:8px 10px;">
            <input id="mf-acc-new-skin" class="mf-input" placeholder="${t('accNewSkinPh')}" maxlength="200" autocomplete="off" style="background:var(--mf-bg2,#1a1d24);border:1px solid var(--mf-border,#2a2e37);border-radius:8px;color:inherit;padding:8px 10px;">
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
            <button id="mf-acc-create" class="mf-btn primary">${t('accCreateBtn')}</button>
          </div>
          <div class="mf-muted" style="margin-top:8px;" id="mf-acc-create-status">${t('accCreateHint')}</div>
        </div>
      </div>
    `;
  }

  // Pide el uuid de la cuenta a MF_Accounts (MAIN world) via CustomEvent
  let accDataListener = null;
  function requestAccountData(cb) {
    try {
      if (!accDataListener) {
        accDataListener = function (e) {
          try {
            const data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
            if (!data) return;
            if (accPendingCb) { const cb2 = accPendingCb; accPendingCb = null; cb2(data); }
          } catch (_) {}
        };
        document.addEventListener('minifeather:accounts-data', accDataListener);
      }
      accPendingCb = cb;
      document.dispatchEvent(new CustomEvent('minifeather:accounts-request', { detail: '{}' }));
      setTimeout(() => {
        if (accPendingCb === cb) { accPendingCb = null; cb(null); }
      }, 3000);
    } catch (_) { cb(null); }
  }
  let accPendingCb = null;

  async function refreshAccountCard() {
    if (!panel || activePage !== 'accounts') return;
    const userEl = panel.querySelector('#mf-acc-username');
    const uuidEl = panel.querySelector('#mf-acc-uuid');
    requestAccountData(acc => {
      if (!panel || activePage !== 'accounts') return;
      if (userEl) userEl.textContent = acc?.username || t('accGuestOrNone');
      if (uuidEl) uuidEl.textContent = acc?.uuid || '--';
    });
  }

  async function createMiniFeatherAccount() {
    if (!panel) return;
    const userEl = panel.querySelector('#mf-acc-new-user');
    const passEl = panel.querySelector('#mf-acc-new-pass');
    const skinEl = panel.querySelector('#mf-acc-new-skin');
    const statusEl = panel.querySelector('#mf-acc-create-status');
    const btn = panel.querySelector('#mf-acc-create');
    const user = (userEl?.value || '').trim();
    const pass = passEl?.value || '';
    const skin = (skinEl?.value || '').trim();
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(user)) {
      if (statusEl) statusEl.textContent = t('accErrUser');
      return;
    }
    if (pass.length < 6) {
      if (statusEl) statusEl.textContent = t('accErrPass');
      return;
    }
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = t('accSending');
    // La petición viaja por ntfy; el bot de Discord (24/7 en GitHub Actions)
    // la procesa, crea la cuenta y la refleja en accounts.json del repo.
    const payload = {
      type: 'mf_account_create',
      username: user,
      password: pass, // el SkinBot la hashea (PBKDF2) antes de guardar
      skin: skin || undefined,
      client: MODULE_VERSION,
      at: Date.now()
    };
    try {
      await new Promise((resolve, reject) => {
        try {
          const port = chrome.runtime.connect({ name: 'minifeather-localgames-network' });
          const timer = setTimeout(() => { try { port.disconnect(); } catch (_) {} reject(new Error('TIMEOUT')); }, 8000);
          port.onMessage.addListener(msg => {
            if (msg?.type === 'published' && msg.requestId === 'mfacc') {
              clearTimeout(timer);
              try { port.disconnect(); } catch (_) {}
              msg.ok ? resolve() : reject(new Error(msg.error || 'PUBLISH_FAILED'));
            }
          });
          port.postMessage({ type: 'publish', requestId: 'mfacc', topic: MF_ACC_TOPIC, message: JSON.stringify(payload) });
        } catch (e) { reject(e); }
      });
      if (statusEl) statusEl.textContent = t('accCreated', { user });
      if (userEl) userEl.value = '';
      if (passEl) passEl.value = '';
      if (skinEl) skinEl.value = '';
    } catch (e) {
      if (statusEl) statusEl.textContent = t('accCreateFail');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bindAccountsControls() {
    if (!panel || activePage !== 'accounts') return;
    panel.querySelector('#mf-acc-copy-uuid')?.addEventListener('click', async () => {
      const uuidEl = panel.querySelector('#mf-acc-uuid');
      const uuid = uuidEl?.textContent?.trim();
      if (uuid && uuid !== '--') {
        try { await navigator.clipboard.writeText(uuid); const st = panel.querySelector('#mf-acc-status'); if (st) st.textContent = t('accUuidCopied'); }
        catch (_) {}
      }
    });
    panel.querySelector('#mf-acc-refresh')?.addEventListener('click', refreshAccountCard);
    panel.querySelector('#mf-acc-create')?.addEventListener('click', createMiniFeatherAccount);
    refreshAccountCard();
  }

  function renderAboutPage() {
    return `
      <div class="mf-page-stack">
        <div class="mf-card">
          <div class="mf-card-title">${t('sectionAbout')}</div>
          <div class="mf-muted">${t('aboutLine1')}</div>
          <div class="mf-muted">${t('aboutLine2')}</div>
        </div>
        <div class="mf-card" id="mf-updater-card">
          <div class="mf-card-title">${t('updaterTitle')}</div>
          <div class="mf-muted" id="mf-updater-status">${t('updaterChecking')}</div>
          <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 14px;margin-top:12px;align-items:center;">
            <div class="mf-muted">${t('updaterInstalledVersion')}</div><div id="mf-updater-local-version">${escapeHtml(MODULE_VERSION)}</div>
            <div class="mf-muted">${t('updaterGithubVersion')}</div><div id="mf-updater-remote-version">--</div>
            <div class="mf-muted">${t('updaterBuild')}</div><div id="mf-updater-build">--</div>
          </div>
          <div id="mf-updater-commit-message" class="mf-muted" style="margin-top:10px;"></div>
          <div class="mf-toggle-grid" style="margin-top:12px;">
            <label class="mf-toggle" style="cursor:pointer;">
              <span class="mf-toggle-copy"><span class="mf-toggle-title">${t('updaterAutoCheck')}</span><span class="mf-toggle-desc">${t('updaterAutoCheckDesc')}</span></span>
              <input type="checkbox" id="mf-updater-auto-check"><span class="mf-switch"></span>
            </label>
            <label class="mf-toggle" style="cursor:pointer;">
              <span class="mf-toggle-copy"><span class="mf-toggle-title">${t('updaterAutoDownload')}</span><span class="mf-toggle-desc">${t('updaterAutoDownloadDesc')}</span></span>
              <input type="checkbox" id="mf-updater-auto-download"><span class="mf-switch"></span>
            </label>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
            <button id="mf-updater-check" class="mf-btn primary">${t('updaterCheckNow')}</button>
            <button id="mf-updater-download" class="mf-btn" style="display:none;">${t('updaterDownload')}</button>
            <button id="mf-updater-github" class="mf-btn">GitHub</button>
          </div>
        </div>
      </div>
    `;
  }

  async function refreshUpdaterCard(forceCheck = false) {
    if (!panel || activePage !== 'about' || !globalThis.MF_AutoUpdater) return;
    const status = panel.querySelector('#mf-updater-status');
    const checkButton = panel.querySelector('#mf-updater-check');
    if (forceCheck && status) status.textContent = t('updaterChecking');
    if (forceCheck && checkButton) checkButton.disabled = true;

    const response = forceCheck
      ? await globalThis.MF_AutoUpdater.check()
      : await globalThis.MF_AutoUpdater.getState();

    if (forceCheck && checkButton) checkButton.disabled = false;
    if (!response?.success) {
      if (status) status.textContent = t('updaterError');
      return;
    }

    let state = response.state;
    const updaterSettings = response.settings || {};
    if (!state && !forceCheck) {
      const checked = await globalThis.MF_AutoUpdater.check();
      if (checked?.success) state = checked.state;
    }

    const localVersion = panel.querySelector('#mf-updater-local-version');
    const remoteVersion = panel.querySelector('#mf-updater-remote-version');
    const build = panel.querySelector('#mf-updater-build');
    const message = panel.querySelector('#mf-updater-commit-message');
    const download = panel.querySelector('#mf-updater-download');
    const autoCheck = panel.querySelector('#mf-updater-auto-check');
    const autoDownload = panel.querySelector('#mf-updater-auto-download');

    if (localVersion) localVersion.textContent = state?.installedVersion || MODULE_VERSION;
    if (remoteVersion) remoteVersion.textContent = state?.remoteVersion || '--';
    if (build) build.textContent = state?.remoteShortCommit || '--';
    if (message) message.textContent = state?.remoteMessage || '';
    if (autoCheck) autoCheck.checked = updaterSettings.autoCheck !== false;
    if (autoDownload) autoDownload.checked = updaterSettings.autoDownload === true;

    if (status) {
      if (!state || state.reason === 'error' || state.success === false) status.textContent = t('updaterError');
      else if (state.updateAvailable && state.reason === 'version') status.textContent = t('updaterNewVersion', { version: state.remoteVersion || '?' });
      else if (state.updateAvailable) status.textContent = t('updaterNewBuild', { build: state.remoteShortCommit || '?' });
      else if (state.reason === 'local_modified') status.textContent = t('updaterLocalBuild');
      else status.textContent = t('updaterCurrent');
    }

    if (download) download.style.display = state?.updateAvailable ? '' : 'none';
  }

  function bindUpdaterControls() {
    if (!panel || activePage !== 'about' || !globalThis.MF_AutoUpdater) return;

    panel.querySelector('#mf-updater-check')?.addEventListener('click', () => refreshUpdaterCard(true));
    panel.querySelector('#mf-updater-download')?.addEventListener('click', async () => {
      const button = panel.querySelector('#mf-updater-download');
      if (button) button.disabled = true;
      await globalThis.MF_AutoUpdater.download();
      if (button) button.disabled = false;
    });
    panel.querySelector('#mf-updater-github')?.addEventListener('click', () => globalThis.MF_AutoUpdater.openRepository());
    panel.querySelector('#mf-updater-auto-check')?.addEventListener('change', async event => {
      await globalThis.MF_AutoUpdater.setSettings({ autoCheck: !!event.target.checked });
    });
    panel.querySelector('#mf-updater-auto-download')?.addEventListener('change', async event => {
      await globalThis.MF_AutoUpdater.setSettings({ autoDownload: !!event.target.checked });
    });

    refreshUpdaterCard(false);
  }
  
  window.addEventListener('minifeather:experimental-registry-changed', () => {
    if (!panel || activePage !== 'experimental' || searchQuery) return;
    renderCurrentPageContent();
  });
  
function renderCreditsPage() {
  return `
    <div class="mf-page-stack">
      <div class="mf-card">
        <div class="mf-card-title">${t('credits')}</div>
        <div class="mf-muted">ShusukeGxE_</div>
        <div class="mf-muted">ItzNightrise</div>
        <div class="mf-muted">Not_Senpai</div>
        <div class="mf-muted">Botless</div>
        <div class="mf-muted">AngryWolfX</div>
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

  function renderYouTubeMusicPage() { return `<div class="mf-page-stack"><div class="mf-card"><div class="mf-card-title">${t('youtubeMusic')}</div><div class="mf-muted" style="margin:6px 0 12px;">${t('youtubeMusicDesc')}</div><div style="display:flex;gap:8px"><input id="mf-yt-module-url" class="mf-input" style="flex:1" placeholder="${t('youtubeUrlPlaceholder')}"><button id="mf-yt-module-load" class="mf-btn mf-btn-primary" type="button">${t('play')}</button></div><div id="mf-yt-module-status" class="mf-muted" style="min-height:18px;margin-top:8px"></div></div></div>`; }
  const PAGE_RENDERERS = {
    dashboard: renderDashboardPage,
    hud: renderHudPage,
    render: renderRenderPage,
    youtubeMusic: renderYouTubeMusicPage,
    shaders: renderShadersPage,
    experimental: renderExperimentalPage,
    cosmetics: renderCosmeticsPage,
    accounts: renderAccountsPage,
    chat: renderChatPage,
    waypoints: renderWaypointsPage,
    movement: renderMovementPage,
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

    // la barra de filtros solo tiene sentido en el dashboard
    const filterBar = panel.querySelector('#mf-feather-filterbar');
    if (filterBar) filterBar.style.display = (activePage === 'dashboard' || searchQuery.trim() || favoritesOnly) ? '' : 'none';

    if (favoritesOnly && !searchQuery.trim()) {
      if (titleEl) titleEl.textContent = 'Favorites';
      pageContainer.innerHTML = renderFavoritesPage();
    } else if (searchQuery.trim()) {
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
    favoritesOnly = false;
    if (panel) {
      const searchInput = panel.querySelector('#mf-gui-search');
      if (searchInput) searchInput.value = '';
      panel.querySelectorAll('[data-page]').forEach(nav => {
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

    // Always open from the true viewport center. A previous drag used to leave
    // transform:none behind, which could make left:50% place the whole panel in
    // the lower/right area on the next open.
    panel.style.left = '50%';
    panel.style.top = '50%';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.transform = 'translate(-50%, -50%)';

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
    closeElytraFlightSettings();
    closeFreecamSettings();
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

  let saveTimer = null;
  let saveGeneration = 0;

  // Tras recargar/desinstalar la extensión, el content script huérfano pierde
  // el contexto de chrome.* → cualquier llamada lanza "Extension context
  // invalidated". Helper centralizado con guarda.
  function extAlive() {
    try {
      return !!(chrome?.runtime?.id);
    } catch (_) {
      return false;
    }
  }

  function saveSettings(immediate = false) {
    if (!extAlive()) return;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    const gen = ++saveGeneration;
    const doSave = () => {
      if (!extAlive()) return;
      chrome.storage.local.set({ settings: { ...settings } }, () => {
        // Solo actualizamos si no hay un guardado más nuevo pendiente
        if (gen === saveGeneration && extAlive()) {
          chrome.storage.local.get('settings', () => {});
        }
      });
    };
    if (immediate) doSave();
    else saveTimer = setTimeout(doSave, 150);
  }

  // Flush al cerrar/cambiar de pestaña
  window.addEventListener('beforeunload', () => {
    if (!extAlive()) return;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    chrome.storage.local.set({ settings: { ...settings } });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer && extAlive()) {
      clearTimeout(saveTimer); saveTimer = null;
      chrome.storage.local.set({ settings: { ...settings } });
    }
  });

  // Sync entre pestañas: si otra pestaña guardó settings, aplicarlos
  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      const incoming = changes.settings.newValue;
      if (!incoming) return;
      // No sobreescribir si tenemos cambios sin guardar pendientes
      if (saveTimer) return;
      Object.assign(settings, incoming);
      Object.assign(guiSettings, incoming);
      settings.panelAccentColor = normalizePanelColor(settings.panelAccentColor, DEFAULT_SETTINGS.panelAccentColor);
      settings.panelBackgroundColor = normalizePanelColor(settings.panelBackgroundColor, DEFAULT_SETTINGS.panelBackgroundColor);
      settings.panelScale = clampPanelScale(settings.panelScale);
      settings.pageZoomEnabled = settings.pageZoomEnabled !== false;
      applyPanelTheme();
      applyPanelScale();
      applyGuiSettings();
      // Actualizar UI si está abierta
      const panel = document.getElementById('mf-gui');
      if (panel) {
        panel.querySelectorAll('.mf-toggle[data-key]').forEach(label => {
          const key = label.dataset.key;
          const input = label.querySelector('input');
          if (input && key in guiSettings) input.checked = guiSettings[key];
        });
        panel.querySelectorAll('[data-mf-experimental-level]').forEach(select => {
          const key = String(select.dataset.mfExperimentalLevel || '');
          if (key && key in guiSettings) select.value = String(guiSettings[key]);
        });
        const customSection = panel.querySelector('#mf-realistic-custom-section');
        if (customSection) customSection.style.display = String(guiSettings.experimentalRealisticLevel || settings.experimentalRealisticLevel) === 'custom' ? 'block' : 'none';
        const incomingCustom = clampRealisticCustom(guiSettings.experimentalRealisticCustom || settings.experimentalRealisticCustom);
        panel.querySelectorAll('[data-mf-realistic-custom]').forEach(input => { const key = String(input.dataset.mfRealisticCustom || ''); if (key in incomingCustom) input.value = String(incomingCustom[key]); });
        panel.querySelectorAll('[data-mf-realistic-custom-check]').forEach(input => { const key = String(input.dataset.mfRealisticCustomCheck || ''); if (key in incomingCustom) input.checked = !!incomingCustom[key]; });
        panel.querySelectorAll('[data-mf-realistic-custom-select]').forEach(input => { const key = String(input.dataset.mfRealisticCustomSelect || ''); if (key in incomingCustom) input.value = String(incomingCustom[key]); });
        const wetDry = panel.querySelector('[data-mf-wet-dry]');
        const wetDryValue = panel.querySelector('[data-mf-wet-dry-value]');
        if (wetDry) wetDry.value = String(Math.round(Number(guiSettings.experimentalWetDrySeconds || 180)));
        if (wetDryValue) wetDryValue.textContent = `${Math.round(Number(guiSettings.experimentalWetDrySeconds || 180))} s`;
      }
    });
  }

  function saveLogo(value) {
    currentLogo = value;
    if (extAlive()) chrome.storage.local.set({ customLogo: currentLogo });
    if (MODULES.get('rebrand')?.enabled) replaceAllLogos();
    refreshLogoControls();
  }

  // --- Bridge con la GUI nativa de miniblox (tab "MiniFeather" en Ajustes) ---
  const NSB_BOOLEAN_KEYS = [
    'rebrand', 'startupAnimation', 'keystrokes', 'fpsCounter', 'cpsCounter', 'pingCounter', 'armorHud',
    'coordinates', 'titanTiny', 'healthNameTags', 'distanceNameTags', 'damageParticles',
    'waterSplash', 'patPat', 'itemPhysics', 'noWeather', 'antiAfk', 'autoSprint',
    'safeSneak', 'autoRespawn', 'zoom', 'freecam', 'cameraOverhaul', 'elytraFlight',
    'dynamicCrosshair', 'vanillaAnimations', 'leafWind', 'handSway', 'betterPlayerLayers',
    'chatVideos', 'chatLinks', 'chatMemes', 'clientChat', 'rhythmParkour', 'guiPatch',
    'customShader', 'freelook', 'blockHighlight', 'discord', 'supportAds',
    'experimentalRealistic', 'experimentalAurora', 'experimentalGrassFlowers',
    'experimentalInteractiveVegetation', 'experimentalFallenLeaves',
    'experimentalTinyTakeover', 'experimentalAnimatedItems',
    'experimentalBetterAnimationCape', 'experimentalPbr'
  ];

  function nsbStatePayload() {
    const settingsOut = {};
    for (const key of NSB_BOOLEAN_KEYS) settingsOut[key] = settings[key] === true;
    return JSON.stringify({ settings: settingsOut, source: 'clientpanel' });
  }

  function initNativeSettingsBridge() {
    document.addEventListener('minifeather:nsb-state', () => {
      document.dispatchEvent(new CustomEvent('minifeather:nsb-state-data', {
        detail: nsbStatePayload()
      }));
    }, { signal: runtimeController?.signal });

    document.addEventListener('minifeather:nsb-toggle', event => {
      let payload = null;
      try {
        payload = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      } catch (_) {}
      if (!payload?.key) return;
      const key = String(payload.key);
      if (!NSB_BOOLEAN_KEYS.includes(key)) return;
      const enabled = payload.enabled !== false;

      // Misma lógica que el toggle del panel: freecam requiere permiso
      if (key === 'freecam' && enabled && !requestFreecamAccess()) {
        showFreecamDenied();
        document.dispatchEvent(new CustomEvent('minifeather:nsb-state-data', {
          detail: nsbStatePayload()
        }));
        return;
      }

      guiSettings[key] = enabled;
      settings[key] = enabled;
      saveSettings(true);
      applyGuiSettings();
      update();

      // Confirmar el estado final al bridge
      document.dispatchEvent(new CustomEvent('minifeather:nsb-state-data', {
        detail: nsbStatePayload()
      }));
    }, { signal: runtimeController?.signal });

    document.addEventListener('minifeather:nsb-open-panel', event => {
      let payload = null;
      try {
        payload = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      } catch (_) {}
      const page = payload?.page && NAV_ITEMS.some(item => item.id === payload.page) ? payload.page : 'dashboard';
      showGUI();
      setActivePage(page);
    }, { signal: runtimeController?.signal });

    // Estado inicial para el bridge si ya está escuchando
    document.dispatchEvent(new CustomEvent('minifeather:nsb-state-data', {
      detail: nsbStatePayload()
    }));
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

  // Empuja los assets activos (data: URLs de skins/capes) al hook de Image.src en MAIN.
  // Chrome ya no permite redirects DNR a data:, así que MAIN los aplica interceptando la carga.
  function pushPanelAssetsToMain() {
    chrome.runtime.sendMessage({ type: 'getSkins' }, skinsRes => {
      chrome.runtime.sendMessage({ type: 'getCapes' }, capesRes => {
        const skins = skinsRes?.skins || {};
        const capes = capesRes?.capes || {};
        const clean = obj => {
          const out = {};
          for (const [name, url] of Object.entries(obj)) {
            if (typeof url === 'string' && url.startsWith('data:')) out[name] = url;
          }
          return out;
        };
        document.dispatchEvent(new CustomEvent('minifeather:panel-assets', {
          detail: JSON.stringify({ skins: clean(skins), capes: clean(capes) })
        }));
      });
    });
  }

  document.addEventListener('minifeather:panel-assets-request', () => pushPanelAssetsToMain());

  // Push proactivo al cargar: MAIN puede pedir los assets antes de que este script exista
  setTimeout(pushPanelAssetsToMain, 1500);
  setTimeout(pushPanelAssetsToMain, 4000);

  function refreshActiveSkins() {
    pushPanelAssetsToMain();
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
    pushPanelAssetsToMain();
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

    const displayWrap = document.createElement('div');
    Object.assign(displayWrap.style, {
        marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px'
    });
    const displayLabel = document.createElement('span');
    displayLabel.textContent = 'Durability';
    Object.assign(displayLabel.style, { fontSize: '12px', color: 'rgba(255,255,255,0.65)' });
    const displaySelect = document.createElement('select');
    displaySelect.className = 'mf-select';
    Object.assign(displaySelect.style, {
        background: '#222', color: '#fff', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '6px', padding: '6px 8px', fontSize: '12px', outline: 'none'
    });
    [
        ['off', 'Off'],
        ['percentage', 'Percentage (95%)'],
        ['durability', 'Durability Points (95)'],
        ['both', 'Durability Points + Bar']
    ].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value; option.textContent = label; displaySelect.appendChild(option);
    });
    displaySelect.value = 'durability';
    displaySelect.addEventListener('change', () => {
        document.dispatchEvent(new CustomEvent('minifeather:armorhud-config', {
            detail: JSON.stringify({ enabled: !!settings.armorHud, durabilityDisplay: displaySelect.value })
        }));
        try { localStorage.setItem('minifeather-armorhud-display', displaySelect.value); } catch (_) {}
    });
    try {
        const savedDisplay = localStorage.getItem('minifeather-armorhud-display');
        if (['off','percentage','durability','both'].includes(savedDisplay)) displaySelect.value = savedDisplay;
    } catch (_) {}
    displayWrap.appendChild(displayLabel); displayWrap.appendChild(displaySelect); header.appendChild(displayWrap); 
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

                const positions = {};
                for (const md of markers) {
                    positions[md.element.dataset.slot] = {
                        x: md.x,
                        y: md.y
                    };
                }
                document.dispatchEvent(
                    new CustomEvent(
                        'minifeather:armorhud-layout',
                        { detail: JSON.stringify(positions) }
                    )
                );
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
            '1px solid rgba(255,255,255,0.08)',
        position: 'relative',
        zIndex: '10'
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
            const positions = {};
            for (const md of markers) {
                positions[md.element.dataset.slot] = {
                    x: md.x,
                    y: md.y
                };
            }
            document.dispatchEvent(
                new CustomEvent(
                    'minifeather:armorhud-layout',
                    { detail: JSON.stringify(positions) }
                )
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

  // ── Mini reproductor de música persistente ──
  // Vive en document.body, fuera del ciclo de vida de la GUI:
  // cerrar la GUI NO corta la música (la GUI se auto-descarga al cerrarse).
  let musicMini = null;

  function parseYouTubeMusicUrl(raw) {
    const x = String(raw || '').trim();
    if (!x) return {};
    if (/^[\w-]{11}$/.test(x)) return { id: x, list: '' };
    try {
      const url = new URL(x.startsWith('http') ? x : 'https://' + x);
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      const parts = url.pathname.split('/').filter(Boolean);
      let id = '';
      if (host === 'youtu.be') id = parts[0] || '';
      else if (host.endsWith('youtube.com')) {
        if (url.searchParams.get('v')) id = url.searchParams.get('v');
        else if (['shorts', 'embed', 'live'].includes(parts[0])) id = parts[1] || '';
      }
      if (id && !/^[\w-]{11}$/.test(id)) id = '';
      const list = url.searchParams.get('list') || '';
      return { id, list: /^[\w-]+$/.test(list) ? list : '' };
    } catch (_) {
      return {};
    }
  }

  function ensureMusicMini() {
    if (musicMini && document.body.contains(musicMini)) return musicMini;
    musicMini = document.createElement('div');
    musicMini.id = 'mf-music-mini';
    musicMini.style.cssText =
      'position:fixed;right:16px;bottom:16px;width:320px;z-index:2147483000;' +
      'display:none;box-shadow:0 8px 24px rgba(0,0,0,.45);border-radius:10px;' +
      'overflow:hidden;background:#000';
    const bar = document.createElement('div');
    bar.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:6px 8px;' +
      'background:#1f1f1f;color:#eee;font-size:12px;user-select:none';
    const title = document.createElement('span');
    title.id = 'mf-music-mini-title';
    title.textContent = t('miniFeatherMusic');
    title.style.cssText = 'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    const btn = document.createElement('button');
    btn.textContent = '\u2715';
    btn.title = t('stopClose');
    btn.style.cssText = 'background:none;border:0;color:#eee;cursor:pointer;font-size:14px;padding:0 4px';
    btn.addEventListener('click', stopMusicMini);
    bar.append(title, btn);
    const frame = document.createElement('iframe');
    frame.id = 'mf-music-mini-frame';
    frame.style.cssText = 'width:100%;height:180px;border:0;display:block';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    musicMini.append(bar, frame);
    document.body.appendChild(musicMini);
    return musicMini;
  }

  function stopMusicMini() {
    const frame = document.getElementById('mf-music-mini-frame');
    if (frame) frame.src = 'about:blank';
    const box = document.getElementById('mf-music-mini');
    if (box) box.style.display = 'none';
  }

  // Devuelve { ok, msg }
  function playMusicMini(url) {
    const { id, list } = parseYouTubeMusicUrl(url);
    if (!id && !list) return { ok: false, msg: t('musicInvalidUrl') };
    const box = ensureMusicMini();
    const frame = document.getElementById('mf-music-mini-frame');
    const title = document.getElementById('mf-music-mini-title');
    if (!frame) return { ok: false, msg: t('musicUnavailable') };
    let src;
    if (list && !id) {
      src = 'https://www.youtube.com/embed/videoseries?listType=playlist&list=' + encodeURIComponent(list);
      if (title) title.textContent = t('playlist');
    } else {
      src = 'https://www.youtube.com/embed/' + encodeURIComponent(id) +
        '?playsinline=1&rel=0&controls=1' + (list ? '&list=' + encodeURIComponent(list) : '');
      if (title) title.textContent = 'YouTube';
    }
    frame.src = src;
    box.style.display = 'block';
    return { ok: true, msg: t('musicPlaying') };
  }

  function bindPageControls() {
    if (!panel) return;

    bindLocalizedFileInputs();
    bindAccountsControls();

    panel.querySelector('#mf-language-select')?.addEventListener('change', event => {
      const language = String(event.target.value || 'en');
      if (!Object.prototype.hasOwnProperty.call(TRANSLATIONS, language)) return;
      settings.language = language;
      guiSettings.language = language;
      saveSettings(true);
      sendLanguageConfig();
      sendDistanceNameTagsConfig(settings.distanceNameTags);
      update();
      renderGUI();
    });

    const bindThemeColor = (pickerId, textId, settingKey, fallback) => {
      const picker = panel.querySelector(pickerId);
      const text = panel.querySelector(textId);
      const apply = value => {
        const normalized = normalizePanelColor(value, fallback);
        settings[settingKey] = normalized;
        guiSettings[settingKey] = normalized;
        if (picker) picker.value = normalized;
        if (text) text.value = normalized;
        applyPanelTheme();
      };
      picker?.addEventListener('input', () => apply(picker.value));
      picker?.addEventListener('change', () => { apply(picker.value); saveSettings(true); });
      text?.addEventListener('change', () => { apply(text.value); saveSettings(true); });
      text?.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        apply(text.value);
        saveSettings(true);
      });
    };

    bindThemeColor('#mf-panel-accent-color', '#mf-panel-accent-text', 'panelAccentColor', DEFAULT_SETTINGS.panelAccentColor);
    bindThemeColor('#mf-panel-background-color', '#mf-panel-background-text', 'panelBackgroundColor', DEFAULT_SETTINGS.panelBackgroundColor);

    // ── Zoom de página (50-120%) ──
    const scaleInput = panel.querySelector('#mf-panel-scale');
    const scaleValue = panel.querySelector('#mf-panel-scale-value');
    scaleInput?.addEventListener('input', () => {
      const s = clampPanelScale(scaleInput.value);
      settings.panelScale = s;
      guiSettings.panelScale = s;
      if (scaleValue) scaleValue.textContent = s + '%';
      applyPanelScale();
    });
    scaleInput?.addEventListener('change', () => saveSettings(true));

    panel.querySelector('#mf-page-zoom-toggle')?.addEventListener('change', event => {
      settings.pageZoomEnabled = event.target.checked;
      guiSettings.pageZoomEnabled = settings.pageZoomEnabled;
      if (!settings.pageZoomEnabled) {
        // desactivado → devolver la página a 100%
        try { chrome?.runtime?.sendMessage?.({ type: 'mfSetPageZoom', zoom: 1 }, () => void chrome.runtime.lastError); } catch (_) {}
      } else {
        applyPanelScale();
      }
      saveSettings(true);
    });

    panel.querySelector('#mf-panel-custom-reset')?.addEventListener('click', () => {
      settings.panelAccentColor = DEFAULT_SETTINGS.panelAccentColor;
      settings.panelBackgroundColor = DEFAULT_SETTINGS.panelBackgroundColor;
      settings.panelScale = DEFAULT_SETTINGS.panelScale;
      guiSettings.panelAccentColor = settings.panelAccentColor;
      guiSettings.panelBackgroundColor = settings.panelBackgroundColor;
      guiSettings.panelScale = settings.panelScale;
      if (scaleInput) scaleInput.value = String(settings.panelScale);
      if (scaleValue) scaleValue.textContent = settings.panelScale + '%';
      saveSettings(true);
      applyPanelTheme();
      applyPanelScale();
      renderCurrentPageContent();
    });

    panel.querySelector('[data-mf-favorites]')?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      favoritesOnly = !favoritesOnly;
      searchQuery = '';
      const searchInput = panel.querySelector('#mf-gui-search');
      if (searchInput) searchInput.value = '';
      renderCurrentPageContent();
    });

    panel.querySelectorAll('[data-mf-favorite]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const key = button.closest('.mf-toggle[data-key]')?.dataset.key;
        if (key) toggleFavorite(key);
      });
    });

    panel.querySelectorAll('[data-mf-settings]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const key = button.closest('.mf-toggle[data-key]')?.dataset.key;
        if (key) openFeatureSettings(key);
      });
    });

    panel.querySelector('#mf-client-chat-connect')?.addEventListener('click', () => {
      const toggle = panel.querySelector('.mf-toggle[data-key="clientChat"] input');
      if (toggle) toggle.click();
    });

    if (panel.querySelector('#mf-client-chat-messages')) {
      refreshClientChatView();
      sendClientChatCommand('status');

      const input = panel.querySelector('#mf-client-chat-input');
      const send = panel.querySelector('#mf-client-chat-send');
      const submit = () => {
        const text = String(input?.value || '').trim();
        if (!text || !settings.clientChat) return;
        sendClientChatCommand('send', { text });
        input.value = '';
      };
      send?.addEventListener('click', submit);
      input?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        submit();
      });
    }

    // Local Games: render inicial del contenedor (el resto llega por eventos)
    if (panel.querySelector('#mf-localgames-view')) {
      refreshLocalGamesView();
      sendLocalGamesCommand('status');
      // refrescar el lobby de salas también (push por WS, sin coste)
      sendLocalGamesCommand('refresh-servers');
    }

    // ─── Shaders: slider de intensidad ──────────
    const shaderStrength = panel.querySelector('#mf-shader-strength');
    shaderStrength?.addEventListener('input', () => {
      const value = parseFloat(shaderStrength.value);
      settings.customShaderStrength = value;
      guiSettings.customShaderStrength = value;
      const valueLabel = panel.querySelector('#mf-shader-strength-value');
      if (valueLabel) valueLabel.textContent = Math.round(value * 100) + '%';
      if (settings.customShader) {
        sendCustomShaderConfig(true);
      }
    });
    shaderStrength?.addEventListener('change', () => {
      saveSettings(true);
    });

    const shaderRenderScale = panel.querySelector('#mf-shader-renderscale');
    shaderRenderScale?.addEventListener('input', () => {
      const value = parseFloat(shaderRenderScale.value);
      settings.customShaderRenderScale = value;
      guiSettings.customShaderRenderScale = value;
      const valueLabel = panel.querySelector('#mf-shader-renderscale-value');
      if (valueLabel) valueLabel.textContent = Math.round(value * 100) + '%';
      if (settings.customShader) {
        sendCustomShaderConfig(true);
      }
    });
    shaderRenderScale?.addEventListener('change', () => {
      saveSettings(true);
    });

    if (activePage === 'youtubeMusic') {
      const input = panel.querySelector('#mf-yt-module-url');
      const stat = panel.querySelector('#mf-yt-module-status');
      const btn = panel.querySelector('#mf-yt-module-load');

      const load = () => {
        const x = String(input?.value || '').trim();
        const result = playMusicMini(x);
        if (stat) stat.textContent = result.msg;
        if (result.ok) {
          try { localStorage.setItem('minifeather_yt_module_url', x); } catch (_) {}
        }
      };

      btn?.addEventListener('click', load);
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') load(); });
      try { if (input) input.value = localStorage.getItem('minifeather_yt_module_url') || ''; } catch (_) {}
    }
    // Selector de preset (Spooklementary / UltraFast)
    const presetSelect = panel.querySelector('#mf-shader-preset');
    presetSelect?.addEventListener('change', () => {
      settings.customShaderPreset = presetSelect.value;
      guiSettings.customShaderPreset = presetSelect.value;
      saveSettings(true);
      if (settings.customShader) {
        sendCustomShaderConfig(true);
      }
      renderCurrentPageContent();
    });

    // Sliders de sub-efectos (según el preset activo)
    const fxMap = {
      vhs: { key: 'customShaderFxVhs', fmt: v => Math.round(v * 100) + '%' },
      crt: { key: 'customShaderFxCrt', fmt: v => Math.round(v * 100) + '%' },
      cel: { key: 'customShaderFxCel', fmt: v => Math.round(v * 100) + '%' },
      fog: { key: 'customShaderFxFog', fmt: v => Math.round(v * 100) + '%' },
      grain: { key: 'customShaderFxGrain', fmt: v => Math.round(v * 100) + '%' },
      glitch: { key: 'customShaderFxGlitch', fmt: v => Math.round(v * 100) + '%' },
      flash: { key: 'customShaderFxFlash', fmt: v => Math.round(v * 100) + '%' },
      sharp: { key: 'customShaderFxSharp', fmt: v => Math.round(v * 100) + '%' },
      ufsat: { key: 'customShaderFxUfsat', fmt: v => v.toFixed(2) },
      ufcontrast: { key: 'customShaderFxUfcontrast', fmt: v => Math.round(v * 100) + '%' },
      uftone: { key: 'customShaderFxUftone', fmt: v => Math.round(v * 100) + '%' },
      phagx: { key: 'customShaderFxPhagx', fmt: v => Math.round(v * 100) + '%' },
      phfog: { key: 'customShaderFxPhfog', fmt: v => Math.round(v * 100) + '%' },
      phend: { key: 'customShaderFxPhend', fmt: v => Math.round(v * 100) + '%' },
      phbh: { key: 'customShaderFxPhbh', fmt: v => Math.round(v * 100) + '%' },
      phbhsize: { key: 'customShaderFxPhbhsize', fmt: v => v.toFixed(2) },
      phbhspin: { key: 'customShaderFxPhbhspin', fmt: v => v.toFixed(1) }
    };
    for (const [fxName, { key, fmt }] of Object.entries(fxMap)) {
      const slider = panel.querySelector(`#mf-shader-fx-${fxName}`);
      if (!slider) continue;
      slider.addEventListener('input', () => {
        const value = parseFloat(slider.value);
        settings[key] = value;
        guiSettings[key] = value;
        const valueLabel = panel.querySelector(`#mf-shader-fx-${fxName}-value`);
        if (valueLabel) valueLabel.textContent = fmt(value);
        if (settings.customShader) {
          sendCustomShaderConfig(true);
        }
      });
      slider.addEventListener('change', () => {
        saveSettings(true);
      });
    }

    // ─── PostFX: sliders del pass full-screen ──────────
    const postfxMap = {
      bloom: { key: 'customShaderPfbloom', fmt: v => Math.round(v * 100) + '%' },
      ca: { key: 'customShaderPfca', fmt: v => Math.round(v * 100) + '%' },
      dof: { key: 'customShaderPfdof', fmt: v => Math.round(v * 100) + '%' },
      dirt: { key: 'customShaderPfdirt', fmt: v => Math.round(v * 100) + '%' },
      vignette: { key: 'customShaderPfvignette', fmt: v => Math.round(v * 100) + '%' }
    };
    for (const [fxName, { key, fmt }] of Object.entries(postfxMap)) {
      const slider = panel.querySelector(`#mf-postfx-${fxName}`);
      if (!slider) continue;
      slider.addEventListener('input', () => {
        const value = parseFloat(slider.value);
        settings[key] = value;
        guiSettings[key] = value;
        const valueLabel = panel.querySelector(`#mf-postfx-${fxName}-value`);
        if (valueLabel) valueLabel.textContent = fmt(value);
        if (settings.customShader) {
          sendCustomShaderConfig(true);
        }
      });
      slider.addEventListener('change', () => {
        saveSettings(true);
      });
    }

    // ─── Nubes: presets rápidos y sliders ───────────────────────────
    const CLOUD_PRESETS = {
      default:   { coverage: 0.5, scale: 0.012, wind: 0.02, thickness: 30, height: 128, opacity: 0.9 },
      overcast:  { coverage: 0.75, scale: 0.02, wind: 0.03, thickness: 60, height: 128, opacity: 0.95 },
      storm:     { coverage: 0.9, scale: 0.03, wind: 0.12, thickness: 120, height: 110, opacity: 1.0 },
      scattered: { coverage: 0.3, scale: 0.012, wind: 0.02, thickness: 25, height: 140, opacity: 0.85 },
      giant:     { coverage: 0.45, scale: 0.004, wind: 0.01, thickness: 80, height: 160, opacity: 0.95 },
      flat:      { coverage: 0.55, scale: 0.015, wind: 0.02, thickness: 6, height: 128, opacity: 0.9 }
    };

    panel.querySelectorAll('.mf-cloud-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = CLOUD_PRESETS[btn.dataset.clouds];
        if (!preset) return;
        Object.assign(settings, {
          cloudsCoverage: preset.coverage,
          cloudsScale: preset.scale,
          cloudsWind: preset.wind,
          cloudsThickness: preset.thickness,
          cloudsHeight: preset.height,
          cloudsOpacity: preset.opacity
        });
        saveSettings(true);
        sendCustomShaderConfig(true);
        renderCurrentPageContent();
      });
    });

    const cloudSliders = [
      { id: 'coverage', key: 'cloudsCoverage', fmt: v => Math.round(v * 100) + '%' },
      { id: 'scale', key: 'cloudsScale', fmt: v => v.toFixed(3) },
      { id: 'wind', key: 'cloudsWind', fmt: v => v.toFixed(2) },
      { id: 'thickness', key: 'cloudsThickness', fmt: v => String(Math.round(v)) },
      { id: 'height', key: 'cloudsHeight', fmt: v => String(Math.round(v)) },
      { id: 'opacity', key: 'cloudsOpacity', fmt: v => Math.round(v * 100) + '%' }
    ];
    for (const { id, key, fmt } of cloudSliders) {
      const slider = panel.querySelector(`#mf-cloud-${id}`);
      if (!slider) continue;
      slider.addEventListener('input', () => {
        const value = parseFloat(slider.value);
        settings[key] = value;
        guiSettings[key] = value;
        const valueLabel = panel.querySelector(`#mf-cloud-${id}-value`);
        if (valueLabel) valueLabel.textContent = fmt(value);
        if (settings.customShader) {
          sendCustomShaderConfig(true);
        }
      });
      slider.addEventListener('change', () => {
        saveSettings(true);
      });
    }

    // ─── Nubes: toggle de ruido del pack (CloudNoise 128³) ───────────
    const packNoiseToggle = panel.querySelector('.mf-toggle[data-key="cloudsPackNoise"]');
    if (packNoiseToggle) {
      const syncPackNoiseToggle = () => {
        const cb = packNoiseToggle.querySelector('.mf-switch-hidden');
        if (cb) cb.checked = !!settings.cloudsPackNoise;
      };
      packNoiseToggle.addEventListener('click', () => {
        settings.cloudsPackNoise = !settings.cloudsPackNoise;
        guiSettings.cloudsPackNoise = settings.cloudsPackNoise;
        syncPackNoiseToggle();
        saveSettings(true);
        sendCustomShaderConfig(true);
      });
      syncPackNoiseToggle();
    }

    // ─── Nubes: editor de dibujo para forma custom ──────────────────
    const shapeCanvas = panel.querySelector('#mf-cloud-shape-canvas');
    if (shapeCanvas) {
      const ctx = shapeCanvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, shapeCanvas.width, shapeCanvas.height);
      // Restaurar dibujo guardado si existe
      try {
        const saved = localStorage.getItem('miniblox_clouds_shape');
        if (saved) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0, shapeCanvas.width, shapeCanvas.height);
          img.src = saved;
        }
      } catch (_) {}

      const brushLabel = () => panel.querySelector('#mf-cloud-shape-brush-value');
      const brushSize = () => Math.max(2, parseFloat(shapeBrushSlider.value) || 12);
      let shapeBrushSlider = panel.querySelector('#mf-cloud-shape-brush');

      const canvasPos = (e) => {
        const rect = shapeCanvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) / rect.width * shapeCanvas.width,
          y: (e.clientY - rect.top) / rect.height * shapeCanvas.height
        };
      };

      const paint = (x, y) => {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, brushSize() / 2, 0, Math.PI * 2);
        ctx.fill();
      };

      let drawing = false;
      let lastX = 0;
      let lastY = 0;

      shapeCanvas.addEventListener('pointerdown', (e) => {
        drawing = true;
        shapeCanvas.setPointerCapture(e.pointerId);
        const p = canvasPos(e);
        lastX = p.x; lastY = p.y;
        paint(p.x, p.y);
        e.preventDefault();
      });
      shapeCanvas.addEventListener('pointermove', (e) => {
        if (!drawing) return;
        const p = canvasPos(e);
        // Interpolar para trazos continuos
        const dist = Math.hypot(p.x - lastX, p.y - lastY);
        const steps = Math.max(1, Math.ceil(dist / (brushSize() * 0.3)));
        for (let i = 1; i <= steps; i++) {
          paint(lastX + (p.x - lastX) * i / steps, lastY + (p.y - lastY) * i / steps);
        }
        lastX = p.x; lastY = p.y;
        e.preventDefault();
      });
      const stopDraw = () => { drawing = false; };
      shapeCanvas.addEventListener('pointerup', stopDraw);
      shapeCanvas.addEventListener('pointercancel', stopDraw);

      // Botones
      const applyBtn = panel.querySelector('#mf-cloud-shape-apply');
      applyBtn?.addEventListener('click', () => {
        if (!settings.customShader) return;
        document.dispatchEvent(new CustomEvent('minifeather:custom-shader-config', {
          detail: JSON.stringify({
            cloudsShape: { dataUrl: shapeCanvas.toDataURL('image/png'), mix: Number(settings.cloudsShapeMix ?? 0.85), tile: Number(settings.cloudsShapeTile ?? 512) }
          })
        }));
      });

      const clearBtn = panel.querySelector('#mf-cloud-shape-clear');
      clearBtn?.addEventListener('click', () => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, shapeCanvas.width, shapeCanvas.height);
      });

      const removeBtn = panel.querySelector('#mf-cloud-shape-remove');
      removeBtn?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('minifeather:custom-shader-config', {
          detail: JSON.stringify({ cloudsShape: { dataUrl: null } })
        }));
      });

      // Sliders: pincel / mezcla / tile
      shapeBrushSlider?.addEventListener('input', () => {
        const v = parseFloat(shapeBrushSlider.value);
        settings.cloudsShapeBrush = v;
        guiSettings.cloudsShapeBrush = v;
        const lbl = brushLabel();
        if (lbl) lbl.textContent = Math.round(v) + 'px';
      });
      shapeBrushSlider?.addEventListener('change', () => saveSettings(true));

      const mixSlider = panel.querySelector('#mf-cloud-shape-mix');
      mixSlider?.addEventListener('input', () => {
        const v = parseFloat(mixSlider.value);
        settings.cloudsShapeMix = v;
        guiSettings.cloudsShapeMix = v;
        const lbl = panel.querySelector('#mf-cloud-shape-mix-value');
        if (lbl) lbl.textContent = Math.round(v * 100) + '%';
        if (settings.customShader) {
          document.dispatchEvent(new CustomEvent('minifeather:custom-shader-config', {
            detail: JSON.stringify({ cloudsShape: { mix: v } })
          }));
        }
      });
      mixSlider?.addEventListener('change', () => saveSettings(true));

      const tileSlider = panel.querySelector('#mf-cloud-shape-tile');
      tileSlider?.addEventListener('input', () => {
        const v = parseFloat(tileSlider.value);
        settings.cloudsShapeTile = v;
        guiSettings.cloudsShapeTile = v;
        const lbl = panel.querySelector('#mf-cloud-shape-tile-value');
        if (lbl) lbl.textContent = String(Math.round(v));
        if (settings.customShader) {
          document.dispatchEvent(new CustomEvent('minifeather:custom-shader-config', {
            detail: JSON.stringify({ cloudsShape: { tile: v } })
          }));
        }
      });
      tileSlider?.addEventListener('change', () => saveSettings(true));
    }

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

    const elytraFlightToggle = panel.querySelector('.mf-toggle[data-key="elytraFlight"]');
    elytraFlightToggle?.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openElytraFlightSettings();
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

    const freecamToggle = panel.querySelector('.mf-toggle[data-key="freecam"]');
    freecamToggle?.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!requestFreecamAccess()) {
        showFreecamDenied();
        return;
      }
      openFreecamSettings();
    });

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

    panel.querySelector('#mf-waypoint-add')?.addEventListener('click', () => {
      const input = panel.querySelector('#mf-waypoint-name');
      const color = panel.querySelector('#mf-waypoint-color')?.value || '#8b5cf6';
      const name = input?.value?.trim() || '';
      if (!name) {
        waypointStatus = t('waypointNeedName');
        const status = panel.querySelector('#mf-waypoint-status');
        if (status) status.textContent = waypointStatus;
        return;
      }
      waypointStatus = t('waypointAdding');
      const status = panel.querySelector('#mf-waypoint-status');
      if (status) status.textContent = waypointStatus;
      requestWaypointUI('add', { name, color });
    });

    panel.querySelectorAll('[data-waypoint-delete]').forEach(button => {
      button.addEventListener('click', () => {
        const row = button.closest('.mf-waypoint-row');
        const id = row?.dataset.waypointId;
        if (id) requestWaypointUI('remove', { id });
      });
    });

    panel.querySelectorAll('[data-waypoint-visibility]').forEach(button => {
      button.addEventListener('click', () => {
        const row = button.closest('.mf-waypoint-row');
        const id = row?.dataset.waypointId;
        if (!id) return;
        const hidden = row.classList.contains('is-hidden');
        requestWaypointUI('update', { id, patch: { visible: hidden } });
      });
    });

    panel.querySelectorAll('[data-waypoint-edit]').forEach(button => {
      button.addEventListener('click', () => {
        const row = button.closest('.mf-waypoint-row');
        if (!row) return;
        row.classList.toggle('editing');
      });
    });

    panel.querySelectorAll('[data-waypoint-save-edit]').forEach(button => {
      button.addEventListener('click', () => {
        const row = button.closest('.mf-waypoint-row');
        const id = row?.dataset.waypointId;
        if (!row || !id) return;
        const name = row.querySelector('[data-waypoint-edit-name]')?.value?.trim() || '';
        if (!name) {
          waypointStatus = t('waypointNeedName');
          const status = panel.querySelector('#mf-waypoint-status');
          if (status) status.textContent = waypointStatus;
          return;
        }
        requestWaypointUI('update', {
          id,
          patch: {
            name,
            color: row.querySelector('[data-waypoint-edit-color]')?.value || '#8b5cf6',
            showName: !!row.querySelector('[data-waypoint-edit-name-visible]')?.checked,
            showDistance: !!row.querySelector('[data-waypoint-edit-distance-visible]')?.checked
          }
        });
      });
    });

    panel.querySelectorAll('[data-waypoint-copy]').forEach(button => {
      button.addEventListener('click', async () => {
        const row = button.closest('.mf-waypoint-row');
        if (!row) return;
        const text = `${Math.floor(Number(row.dataset.x))} ${Math.floor(Number(row.dataset.y))} ${Math.floor(Number(row.dataset.z))}`;
        try {
          await navigator.clipboard.writeText(text);
          waypointStatus = `${t('waypointCopied')}: ${text}`;
        } catch (_) {
          waypointStatus = text;
        }
        const status = panel.querySelector('#mf-waypoint-status');
        if (status) status.textContent = waypointStatus;
      });
    });

    panel.querySelector('[data-waypoint-import-legacy]')?.addEventListener('click', () => {
      requestWaypointUI('importLegacy');
    });

    panel.querySelector('[data-waypoint-delete-legacy]')?.addEventListener('click', () => {
      if (!confirm(t('waypointDeleteLegacyConfirm'))) return;
      requestWaypointUI('deleteLegacy');
    });

    panel.querySelectorAll('[data-waypoint-delete-world]').forEach(button => {
      button.addEventListener('click', () => {
        const row = button.closest('[data-waypoint-world-key]');
        const worldKey = row?.dataset.waypointWorldKey;
        if (!worldKey || !confirm(t('waypointDeleteWorldConfirm'))) return;
        requestWaypointUI('deleteWorld', { worldKey });
      });
    });

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
      label.addEventListener('click', event => {
        if (event.target.closest('[data-mf-settings], [data-mf-favorite], [data-mf-experimental-level]')) return;
        if (event.target === input) return;
        event.preventDefault();
        input.checked = !input.checked;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      input.addEventListener('change', () => {
        if (key === 'freecam' && input.checked && !requestFreecamAccess()) {
          input.checked = false;
          guiSettings.freecam = false;
          settings.freecam = false;
          saveSettings(true);
          showFreecamDenied();
          return;
        }
        guiSettings[key] = input.checked;
        settings[key] = input.checked;

        // Update the visible module state immediately. The old UI only reflected
        // the new value after the whole GUI was closed and reopened.
        const state = label.querySelector('.mf-feature-state');
        if (state) {
          state.textContent = input.checked ? 'Enabled' : 'Disabled';
          state.classList.toggle('enabled', input.checked);
          state.classList.toggle('disabled', !input.checked);
        }
        label.classList.toggle('enabled', input.checked);
        label.classList.toggle('disabled', !input.checked);

        saveSettings(true);
        applyGuiSettings();
        update();
        if (activePage === 'dashboard') updateDashboardStats();
      });
    });

    panel.querySelectorAll('[data-mf-experimental-level]').forEach(select => {
      const key = String(select.dataset.mfExperimentalLevel || '');
      if (!key) return;
      select.addEventListener('click', event => event.stopPropagation());
      select.addEventListener('change', event => {
        event.stopPropagation();
        const value = String(select.value || 'medium');
        guiSettings[key] = value;
        settings[key] = value;
        if (key === 'experimentalRealisticLevel') {
          const customSection = panel.querySelector('#mf-realistic-custom-section');
          if (customSection) customSection.style.display = value === 'custom' ? 'block' : 'none';
        }
        saveSettings(true);
        applyGuiSettings();
      });
    });

    const refreshRealisticCustomUi = () => {
      const c = clampRealisticCustom(guiSettings.experimentalRealisticCustom || settings.experimentalRealisticCustom);
      guiSettings.experimentalRealisticCustom = { ...c };
      settings.experimentalRealisticCustom = { ...c };
      panel.querySelectorAll('[data-mf-realistic-custom]').forEach(input => {
        const key = String(input.dataset.mfRealisticCustom || '');
        if (key && key in c) input.value = String(c[key]);
      });
      panel.querySelectorAll('[data-mf-realistic-custom-check]').forEach(input => {
        const key = String(input.dataset.mfRealisticCustomCheck || '');
        if (key && key in c) input.checked = !!c[key];
      });
      panel.querySelectorAll('[data-mf-realistic-custom-select]').forEach(input => {
        const key = String(input.dataset.mfRealisticCustomSelect || '');
        if (key && key in c) input.value = String(c[key]);
      });
      panel.querySelectorAll('[data-mf-realistic-custom-value]').forEach(el => {
        const key = String(el.dataset.mfRealisticCustomValue || '');
        if (!(key in c)) return;
        const source = panel.querySelector(`[data-mf-realistic-custom="${key}"]`);
        const suffix = source?.getAttribute('data-mf-suffix') || '';
        el.textContent = `${c[key]}${suffix}`;
      });
      const load = realisticLoadScore(c);
      const loadLabel = load < 30 ? t('realisticLoadLight') : load < 55 ? t('realisticLoadMedium') : load < 78 ? t('realisticLoadHeavy') : load < 95 ? t('realisticLoadExtreme') : t('realisticLoadInsane');
      const label = panel.querySelector('[data-mf-realistic-load]');
      const bar = panel.querySelector('[data-mf-realistic-loadbar]');
      if (label) label.textContent = `${load}% · ${loadLabel}`;
      if (bar) bar.style.width = `${Math.min(100, load)}%`;
    };

    const setRealisticCustomValue = (key, value, persist) => {
      const current = clampRealisticCustom(guiSettings.experimentalRealisticCustom || settings.experimentalRealisticCustom);
      current[key] = value;
      const next = clampRealisticCustom(current);
      guiSettings.experimentalRealisticCustom = { ...next };
      settings.experimentalRealisticCustom = { ...next };
      refreshRealisticCustomUi();
      if (persist) saveSettings(true);
      applyGuiSettings();
    };

    panel.querySelectorAll('[data-mf-realistic-custom]').forEach(input => {
      const key = String(input.dataset.mfRealisticCustom || '');
      if (!key) return;
      input.addEventListener('input', () => setRealisticCustomValue(key, Number(input.value), false));
      input.addEventListener('change', () => setRealisticCustomValue(key, Number(input.value), true));
    });
    panel.querySelectorAll('[data-mf-realistic-custom-check]').forEach(input => {
      const key = String(input.dataset.mfRealisticCustomCheck || '');
      if (!key) return;
      input.addEventListener('change', () => setRealisticCustomValue(key, !!input.checked, true));
    });
    panel.querySelectorAll('[data-mf-realistic-custom-select]').forEach(input => {
      const key = String(input.dataset.mfRealisticCustomSelect || '');
      if (!key) return;
      input.addEventListener('change', () => setRealisticCustomValue(key, Number(input.value), true));
    });
    panel.querySelector('[data-mf-realistic-copy-ultra]')?.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const next = clampRealisticCustom({ ...REALISTIC_ULTRA_CUSTOM, optimizeFps: true });
      guiSettings.experimentalRealisticCustom = { ...next };
      settings.experimentalRealisticCustom = { ...next };
      refreshRealisticCustomUi();
      saveSettings(true); applyGuiSettings();
    });
    panel.querySelector('[data-mf-realistic-reset-custom]')?.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const next = clampRealisticCustom({ ...REALISTIC_CUSTOM_DEFAULTS, optimizeFps: true });
      guiSettings.experimentalRealisticCustom = { ...next };
      settings.experimentalRealisticCustom = { ...next };
      refreshRealisticCustomUi();
      saveSettings(true); applyGuiSettings();
    });
    refreshRealisticCustomUi();

    const wetDryRange = panel.querySelector('[data-mf-wet-dry]');
    const wetDryValue = panel.querySelector('[data-mf-wet-dry-value]');
    const applyWetDry = (persist) => {
      if (!wetDryRange) return;
      const seconds = Math.max(30, Math.min(600, Math.round(Number(wetDryRange.value) || 180)));
      guiSettings.experimentalWetDrySeconds = seconds;
      settings.experimentalWetDrySeconds = seconds;
      if (wetDryValue) wetDryValue.textContent = `${seconds} s`;
      if (persist) saveSettings(true);
      applyGuiSettings();
    };
    wetDryRange?.addEventListener('input', () => applyWetDry(false));
    wetDryRange?.addEventListener('change', () => applyWetDry(true));

    panel.querySelector('#mf-replay-intro')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('minifeather:splash-replay'));
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

    if (panel.querySelector('#mf-local-textures-checkbox')) {
      chrome.runtime.sendMessage({ type: 'getLocalTextures' }, response => {
        const checkbox = panel?.querySelector('#mf-local-textures-checkbox');
        if (checkbox && response && response.success) checkbox.checked = response.enabled;
      });

      panel.querySelector('#mf-local-textures-checkbox')?.addEventListener('change', event => {
        chrome.runtime.sendMessage({ type: 'setLocalTextures', enabled: event.target.checked });
      });
    }

    if (panel.querySelector('#mf-menu-ui-checkbox')) {
      chrome.runtime.sendMessage({ type: 'getMenuUiOverride' }, response => {
        const checkbox = panel?.querySelector('#mf-menu-ui-checkbox');
        if (checkbox && response && response.success) checkbox.checked = response.enabled;
      });

      panel.querySelector('#mf-menu-ui-checkbox')?.addEventListener('change', event => {
        chrome.runtime.sendMessage({ type: 'setMenuUiOverride', enabled: event.target.checked });
      });
    }

    const tpGenerate = panel.querySelector('#mf-custom-tp-generate');
    const tpDisable = panel.querySelector('#mf-custom-tp-disable');
    const tpFiles = panel.querySelector('#mf-custom-tp-files');
    const tpStatus = panel.querySelector('#mf-custom-tp-status');
    const tpPreview = panel.querySelector('#mf-custom-tp-preview');
    const tpPreviewImg = panel.querySelector('#mf-custom-tp-preview-img');
    const tpStats = panel.querySelector('#mf-custom-tp-stats');
    const tpManager = panel.querySelector('#mf-custom-tp-manager');
    const tpList = panel.querySelector('#mf-custom-tp-list');
    const tpClear = panel.querySelector('#mf-custom-tp-clear');

    function refreshTextureList() {
      if (!tpList || !tpManager) return;
      const stored = localStorage.getItem('mf_texture_list');
      const textures = stored ? JSON.parse(stored) : [];
      if (textures.length === 0) {
        tpManager.style.display = 'none';
        return;
      }
      tpManager.style.display = 'block';
      tpList.innerHTML = textures.map((t, i) =>
        `<div style="display: flex; align-items: center; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
          <span style="color: #ccc;">${t}</span>
          <button data-tp-idx="${i}" style="font-size: 10px; padding: 1px 6px; background: #5a2020; color: #ff8080; border: 1px solid #804040; border-radius: 3px; cursor: pointer;">✕</button>
        </div>`
      ).join('');
      tpList.querySelectorAll('button[data-tp-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.tpIdx);
          textures.splice(idx, 1);
          localStorage.setItem('mf_texture_list', JSON.stringify(textures));
          refreshTextureList();
        });
      });
    }

    if (tpGenerate && tpFiles) {
      chrome.runtime.sendMessage({ type: 'getCustomSpritesheet' }, resp => {
        if (resp?.url) {
          tpStatus.innerHTML = '<span style="color: #4caf50;">✓ Custom texture pack active</span>';
          if (tpPreviewImg) tpPreviewImg.src = resp.url;
          if (tpPreview) tpPreview.style.display = 'block';
        }
        refreshTextureList();
      });

      tpGenerate.addEventListener('click', async () => {
        const files = tpFiles.files;
        if (!files || files.length === 0) {
          tpStatus.innerHTML = '<span style="color: #f44336;">Select a .zip or .png file</span>';
          return;
        }

        tpStatus.innerHTML = '<span style="color: #4a9eff;">Generating spritesheet...</span>';
        tpGenerate.disabled = true;

        try {
          if (window.MF_TEXTURE_PACK) {
            const result = await MF_TEXTURE_PACK.generateAndApply(files);
            if (result.success) {
              const dataUrl = MF_TEXTURE_PACK.getCustomSpritesheetUrl();
              if (dataUrl && tpPreviewImg) tpPreviewImg.src = dataUrl;
              if (tpPreview) tpPreview.style.display = 'block';
              if (tpStats) tpStats.textContent = `Custom: ${result.stats.custom} | Total: ${result.stats.placeholder} placeholders`;

              chrome.runtime.sendMessage({
                type: 'setCustomSpritesheet',
                url: dataUrl
              });

              const stored = localStorage.getItem('mf_texture_list');
              const existing = stored ? JSON.parse(stored) : [];
              const newNames = Array.from(files).map(f => f.name.replace(/\.zip$/i, '.zip').replace(/\.png$/i, '.png'));
              const merged = [...new Set([...existing, ...result.textureNames])];
              localStorage.setItem('mf_texture_list', JSON.stringify(merged));

              tpStatus.innerHTML = `<span style="color: #4caf50;">✓ Applied! ${result.stats.custom} textures replaced. Reload page to see changes.</span>`;
              refreshTextureList();
            } else {
              tpStatus.innerHTML = `<span style="color: #f44336;">Error: ${result.error}</span>`;
            }
          } else {
            tpStatus.innerHTML = '<span style="color: #f44336;">TexturePack module not loaded</span>';
          }
        } catch (e) {
          tpStatus.innerHTML = `<span style="color: #f44336;">Error: ${e.message}</span>`;
        }

        tpGenerate.disabled = false;
      });

      tpDisable?.addEventListener('click', () => {
        if (window.MF_TEXTURE_PACK) MF_TEXTURE_PACK.disable();
        chrome.runtime.sendMessage({ type: 'setCustomSpritesheet', url: null });
        tpStatus.innerHTML = '<span style="color: #888;">Reverted to default. Reload page.</span>';
        if (tpPreview) tpPreview.style.display = 'none';
      });

      tpClear?.addEventListener('click', () => {
        if (window.MF_TEXTURE_PACK) MF_TEXTURE_PACK.clearAll();
        chrome.runtime.sendMessage({ type: 'setCustomSpritesheet', url: null });
        localStorage.removeItem('mf_texture_list');
        tpStatus.innerHTML = '<span style="color: #888;">All textures cleared. Reload page.</span>';
        if (tpPreview) tpPreview.style.display = 'none';
        refreshTextureList();
      });
    }

    // ── PBR Textures (Experimental) — sliders de MF_PBR (MAIN) via CustomEvent ──
    const pbrKinds = panel.querySelector('[data-pbr-kinds]');
    const pbrClearBtn = panel.querySelector('#mf-pbr-clear');

    function sendPbrConfig(cfg) {
      document.dispatchEvent(new CustomEvent('minifeather:pbr-config', {
        detail: JSON.stringify(cfg)
      }));
    }

    {
      const sliders = [
        { el: panel.querySelector('[data-pbr-normal]'), out: panel.querySelector('[data-pbr-nv]'), key: 'mf_pbr_normal', kind: 'normal', fmt: v => v.toFixed(2) },
        { el: panel.querySelector('[data-pbr-spec]'), out: panel.querySelector('[data-pbr-sv]'), key: 'mf_pbr_spec', kind: 'spec', fmt: v => v.toFixed(2) },
        { el: panel.querySelector('[data-pbr-shiny]'), out: panel.querySelector('[data-pbr-hv]'), key: 'mf_pbr_shiny', kind: 'shiny', fmt: v => String(Math.round(v)) },
        { el: panel.querySelector('[data-pbr-emissive]'), out: panel.querySelector('[data-pbr-ev]'), key: 'mf_pbr_emissive', kind: 'emissive', fmt: v => v.toFixed(2) }
      ];
      for (const s of sliders) {
        if (!s.el) continue;
        const saved = parseFloat(localStorage.getItem(s.key));
        if (!isNaN(saved)) s.el.value = saved;
        if (s.out) s.out.textContent = s.fmt(parseFloat(s.el.value));
        s.el.addEventListener('input', () => {
          const v = parseFloat(s.el.value);
          if (s.out) s.out.textContent = s.fmt(v);
          sendPbrConfig({ [s.kind]: v });
        });
      }

      const refreshPbrKinds = () => {
        if (!pbrKinds) return;
        const avail = localStorage.getItem('mf_pbr_available') === 'true';
        pbrKinds.textContent = avail
          ? ' · PBR maps loaded ✓'
          : ' · No PBR maps — upload a pack with _n/_s/_e in Cosmetics';
        pbrKinds.style.color = avail ? '#4caf50' : '#7c828a';
      };
      refreshPbrKinds();
      setInterval(refreshPbrKinds, 3000);

      pbrClearBtn?.addEventListener('click', () => {
        if (window.MF_TEXTURE_PACK?.clearPbr) {
          MF_TEXTURE_PACK.clearPbr();
          refreshPbrKinds();
        }
      });

      // ── Editor de packs PBR (MAIN world, puente CustomEvent) ──
      // El editor vive en MAIN donde chrome.runtime.getURL NO está
      // garantizado → le mandamos frames.json serializado y las
      // traducciones necesarias para t() en el evento.
      const pbrEditBtn = panel.querySelector('#mf-pbr-edit');
      pbrEditBtn?.addEventListener('click', async () => {
        let frames = null;
        try {
          const res = await fetch(chrome.runtime.getURL('assets/frames.json'));
          frames = await res.json();
        } catch (_) {}
        // mandar traducciones (10 idiomas) y frames al editor
        const editorKeys = [
          'pbrEditorTitle', 'pbrEditorChannel', 'pbrEditorSearch',
          'pbrEditorReliefUp', 'pbrEditorReliefSmooth', 'pbrEditorReliefFlat',
          'pbrEditorReliefPicker', 'pbrEditorBrush', 'pbrEditorStrength',
          'pbrEditorUndo', 'pbrEditorRedo', 'pbrEditorGrid',
          'pbrEditorApply', 'pbrEditorExport', 'pbrEditorResetTile',
          'pbrEditorClose', 'pbrEditorDiffuse',
          'pbrEditorHintN', 'pbrEditorHintS', 'pbrEditorHintE',
          'pbrEditorNoList', 'pbrEditorPickerInfo',
          'pbrEditorSavedOk', 'pbrEditorSaveEmpty', 'pbrEditorExportEmpty',
          'pbrEditorKind_n', 'pbrEditorKind_s', 'pbrEditorKind_e',
          'pbrEditorApplyLabel', 'pbrEditorResetTileLabel',
          'pbrEditorBrush1', 'pbrEditorBrush3', 'pbrEditorBrush5', 'pbrEditorBrush7'
        ];
        const languages = ['en', 'es', 'ja', 'it', 'zh', 'fr', 'de', 'pt', 'ru', 'ko'];
        const strings = {};
        for (const lang of languages) {
          const table = TRANSLATIONS[lang] || {};
          for (const key of editorKeys) {
            if (!strings[key]) strings[key] = {};
            if (table[key]) strings[key][lang] = table[key];
          }
        }
        document.dispatchEvent(new CustomEvent('minifeather:pbr-editor-open', {
          detail: JSON.stringify({ language: settings.language || 'en', strings })
        }));
        if (frames) {
          document.dispatchEvent(new CustomEvent('minifeather:pbr-editor-frames', {
            detail: JSON.stringify(frames)
          }));
        }
      });

      // ── Selector de presets PBR (puente CustomEvent hacia TexturePackManager) ──
      const presetSelect = panel.querySelector('#mf-pbr-preset');
      const presetStatus = panel.querySelector('#mf-pbr-preset-status');
      let presetsBusy = false;

      const setPresetStatus = (txt, color) => {
        if (!presetStatus) return;
        presetStatus.textContent = txt || '';
        presetStatus.style.color = color || '#7c828a';
      };

      const loadPresetsList = () => {
        const onList = (ev) => {
          document.removeEventListener('minifeather:pbr-presets-result', onList);
          let data = null;
          try { data = JSON.parse(ev.detail); } catch (_) { data = ev.detail; }
          if (!presetSelect || !data?.presets) {
            if (presetSelect) presetSelect.innerHTML = `<option value="">${t('pbrPresetUnavailable')}</option>`;
            return;
          }
          presetSelect.innerHTML = data.presets.map(p =>
            `<option value="${p.id}"${p.id === data.current ? ' selected' : ''}>${p.name} · ${p.size} · ${p.license}</option>`
          ).join('');
          const cur = data.presets.find(p => p.id === data.current);
          if (cur) setPresetStatus(cur.note, '#7c828a');
        };
        document.addEventListener('minifeather:pbr-presets-result', onList);
        document.dispatchEvent(new CustomEvent('minifeather:pbr-presets-list'));
        setTimeout(() => document.removeEventListener('minifeather:pbr-presets-result', onList), 4000);
      };
      loadPresetsList();

      presetSelect?.addEventListener('change', () => {
        if (presetsBusy) return;
        const id = presetSelect.value;
        if (!id) return;
        presetsBusy = true;
        const presetName = presetSelect.selectedOptions[0]?.textContent?.split(' ·')[0] || id;
        setPresetStatus(t('pbrPresetDownloading').replace('{name}', presetName), '#7fb8ff');
        const onDone = (ev) => {
          let data = null;
          try { data = JSON.parse(ev.detail); } catch (_) { data = ev.detail; }
          if (data?.presetId !== id) return;
          document.removeEventListener('minifeather:pbr-preset-result', onDone);
          presetsBusy = false;
          if (data?.success) {
            const m = data.maps || {};
            setPresetStatus(`✓ ${presetName}: ${m.n || 0}n ${m.s || 0}s ${m.e || 0}e`, '#4caf50');
            refreshPbrKinds();
          } else {
            setPresetStatus('✗ ' + (data?.error || 'falló'), '#ff8080');
          }
        };
        document.addEventListener('minifeather:pbr-preset-result', onDone);
        document.dispatchEvent(new CustomEvent('minifeather:pbr-preset-install', {
          detail: JSON.stringify({ presetId: id })
        }));
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

    panel.querySelectorAll('[data-page]').forEach(nav => {
      nav.addEventListener('click', () => setActivePage(nav.dataset.page), { signal: panelSignal });
    });

    panel.querySelectorAll('.mf-feather-category').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.category || 'all';
        // elegir un filtro limpia la búsqueda: los dos a la vez confunden
        if (searchQuery) {
          searchQuery = '';
          const searchInput = panel.querySelector('#mf-gui-search');
          if (searchInput) searchInput.value = '';
          panel.querySelectorAll('[data-page]').forEach(nav => {
            nav.classList.toggle('active', !searchQuery.trim() && nav.dataset.page === activePage);
          });
        }
        panel.querySelectorAll('.mf-feather-category').forEach(b => b.classList.toggle('active', b === btn));
        renderCurrentPageContent();
      }, { signal: panelSignal });
    });

    panel.querySelector('#mf-gui-search')?.addEventListener('input', event => {
      searchQuery = event.target.value;
      panel.querySelectorAll('[data-page]').forEach(nav => {
        nav.classList.toggle('active', !searchQuery.trim() && nav.dataset.page === activePage);
      });
      renderCurrentPageContent();
    }, { signal: panelSignal });

    panel.querySelector('#mf-language-select')?.addEventListener('change', event => {
      settings.language = event.target.value;
      guiSettings.language = event.target.value;
      saveSettings();
      sendLanguageConfig();
      sendDistanceNameTagsConfig(settings.distanceNameTags);
      update();
      renderGUI();
    }, { signal: panelSignal });

    const topbar = panel.querySelector('#mf-gui-topbar');
    let dragPending = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let offX = 0;
    let offY = 0;

    topbar?.addEventListener('mousedown', event => {
      const target = event.target.closest('button, select, input');
      if (target || event.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      dragPending = true;
      dragging = false;
      startX = event.clientX;
      startY = event.clientY;
      offX = event.clientX - rect.left;
      offY = event.clientY - rect.top;
    }, { signal: panelSignal });

    document.addEventListener('mousemove', event => {
      if (!dragPending && !dragging) return;
      if (!dragging) {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) < 5) return;
        const rect = panel.getBoundingClientRect();
        dragging = true;
        panel.style.transform = 'none';
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
      }
      const panelWidth = panel.offsetWidth;
      const panelHeight = panel.offsetHeight;
      const x = Math.max(10, Math.min(event.clientX - offX, window.innerWidth - panelWidth - 10));
      const y = Math.max(10, Math.min(event.clientY - offY, window.innerHeight - panelHeight - 10));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    }, { signal: panelSignal });

    document.addEventListener('mouseup', () => {
      dragPending = false;
      dragging = false;
    }, { signal: panelSignal });

    topbar?.addEventListener('dblclick', event => {
      if (event.target.closest('button, select, input')) return;
      panel.style.left = '50%';
      panel.style.top = '50%';
      panel.style.transform = 'translate(-50%, -50%)';
    }, { signal: panelSignal });

    renderCurrentPageContent();
    applyGuiSettings();
  }

  function renderGUI() {
    if (!panel) return;
    panel.innerHTML = getPanelTemplate();
    applyPanelTheme();
    applyPanelScale();
    bindPanelControls();
  }

  function initGUI() {
    if (guiReady) return;
    guiReady = true;
    let rightShiftDown = false;
    let leftShiftDown = false;
    let cleanHud = false;

    const isTyping = target => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable === true;
    const setCleanHud = hidden => {
      cleanHud = hidden;
      let style = document.getElementById('mf-clean-hud-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'mf-clean-hud-style';
        style.textContent = '#minifeather-fps,#minifeather-cps,#minifeather-ping,#mf-keystrokes,#mf-coordinates-hud,#mf-waypoint-layer,#minifeather-armor-hud,#mf-damage-particles-layer{display:none!important}';
        document.head.appendChild(style);
      }
      style.disabled = !hidden;
    };

    document.addEventListener('keydown', event => {
      if (event.code === 'ShiftRight' && !rightShiftDown) {
        rightShiftDown = true;
        toggleGUI();
      }
      if (event.code === 'ShiftLeft') leftShiftDown = true;
      if (event.code === 'KeyH' && leftShiftDown && !event.repeat && !isTyping(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        setCleanHud(!cleanHud);
      }
      if (event.code === 'Escape') hideGUI();
    }, { capture: true, signal: runtimeController?.signal });

    document.addEventListener('keyup', event => {
      if (event.code === 'ShiftRight') rightShiftDown = false;
      if (event.code === 'ShiftLeft') leftShiftDown = false;
    }, { capture: true, signal: runtimeController?.signal });

    window.addEventListener('blur', () => {
      rightShiftDown = false;
      leftShiftDown = false;
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
    sendLanguageConfig();
    setModuleEnabled('rebrand', settings.rebrand);
    setModuleEnabled('discord', settings.rebrand && settings.discord);
    setModuleEnabled('keystrokes', settings.keystrokes);
    setModuleEnabled('fpsCounter', settings.fpsCounter);
    setModuleEnabled('cpsCounter', settings.cpsCounter);
    setModuleEnabled('pingCounter', settings.pingCounter);
    setModuleEnabled('coordinates', settings.coordinates);
    setModuleEnabled('waypoints', settings.waypoints);
    window.__MINIFEATHER_ARMOR_HUD_ENABLED__ = !!settings.armorHud;
    document.dispatchEvent(
      new CustomEvent('minifeather:armorhud-config', {
        detail: JSON.stringify({ enabled: !!settings.armorHud })
      })
    );
    setModuleEnabled('titanTiny', settings.titanTiny);
    setModuleEnabled('healthNameTags', settings.healthNameTags);
    setModuleEnabled('distanceNameTags', settings.distanceNameTags);
    setModuleEnabled('damageParticles', settings.damageParticles);
    setModuleEnabled('waterSplash', settings.waterSplash);
    setModuleEnabled('patPat', settings.patPat);
    setModuleEnabled('itemPhysics', settings.itemPhysics);
    setModuleEnabled('noWeather', settings.noWeather);
    setModuleEnabled('autoRespawn', settings.autoRespawn);
    setModuleEnabled('antiAfk', settings.antiAfk);
    setModuleEnabled('autoSprint', settings.autoSprint);
    setModuleEnabled('safeSneak', settings.safeSneak);
    setModuleEnabled('rhythmParkour', settings.rhythmParkour);
    setModuleEnabled('zoom', settings.zoom);
    setModuleEnabled('cameraOverhaul', settings.cameraOverhaul);
    setModuleEnabled('elytraFlight', settings.elytraFlight);
    setModuleEnabled('freecam', settings.freecam);
    setModuleEnabled('dynamicCrosshair', settings.dynamicCrosshair);
    setModuleEnabled('vanillaAnimations', settings.vanillaAnimations);
    setModuleEnabled('leafWind', settings.leafWind);
    setModuleEnabled('handSway', settings.handSway);
    setModuleEnabled('betterPlayerLayers', settings.betterPlayerLayers);
    setModuleEnabled('guiPatch', settings.guiPatch);
    document.dispatchEvent(
      new CustomEvent('minifeather:aurora-config', {
        detail: JSON.stringify({
          enabled: !!settings.experimentalAurora,
          level: ['low', 'medium', 'high'].includes(String(settings.experimentalAuroraLevel))
            ? String(settings.experimentalAuroraLevel)
            : 'medium'
        })
      })
    );
    document.dispatchEvent(
      new CustomEvent('minifeather:realistic-config', {
        detail: JSON.stringify({
          enabled: !!settings.experimentalRealistic,
          level: String(settings.experimentalRealisticLevel) === 'extreme'
            ? 'ultra'
            : (['low', 'medium', 'high', 'ultra', 'custom'].includes(String(settings.experimentalRealisticLevel))
              ? String(settings.experimentalRealisticLevel)
              : 'medium'),
          custom: clampRealisticCustom(settings.experimentalRealisticCustom || REALISTIC_CUSTOM_DEFAULTS),
          wetDrySeconds: Math.max(30, Math.min(600, Number(settings.experimentalWetDrySeconds) || 180)),
          leafEnabled: !!settings.leafWind,
          leafStrength: Number(settings.leafWindStrength) || 0.085,
          auroraEnabled: !!settings.experimentalAurora,
          auroraLevel: ['low', 'medium', 'high'].includes(String(settings.experimentalAuroraLevel))
            ? String(settings.experimentalAuroraLevel)
            : 'medium'
        })
      })
    );
    document.dispatchEvent(
      new CustomEvent('minifeather:grass-flowers-config', {
        detail: JSON.stringify({ enabled: !!settings.experimentalGrassFlowers })
      })
    );
    document.dispatchEvent(
      new CustomEvent('minifeather:interactive-vegetation-config', {
        detail: JSON.stringify({
          enabled: !!settings.experimentalInteractiveVegetation,
          level: ['low', 'medium', 'high', 'extreme'].includes(String(settings.experimentalInteractiveVegetationLevel))
            ? String(settings.experimentalInteractiveVegetationLevel)
            : 'medium'
        })
      })
    );
    document.dispatchEvent(
      new CustomEvent('minifeather:fell-leaves-config', {
        detail: JSON.stringify({
          enabled: !!settings.experimentalFallenLeaves,
          assetsBase: (() => { try { const u = chrome.runtime.getURL('assets/particles/'); return u && !u.includes('://invalid/') ? u : ''; } catch (_) { return ''; } })()
        })
      })
    );
    document.dispatchEvent(
      new CustomEvent('minifeather:tiny-takeover-config', {
        detail: JSON.stringify({
          enabled: !!settings.experimentalTinyTakeover,
          assetsBase: (() => { try { const u = chrome.runtime.getURL('assets/tiny/'); return u && !u.includes('://invalid/') ? u : ''; } catch (_) { return ''; } })()
        })
      })
    );
    document.dispatchEvent(
      new CustomEvent('minifeather:animated-items-config', {
        detail: JSON.stringify({ enabled: !!settings.experimentalAnimatedItems })
      })
    );
    document.dispatchEvent(
      new CustomEvent('minifeather:better-animation-cape-config', {
        detail: JSON.stringify({ enabled: !!settings.experimentalBetterAnimationCape })
      })
    );
    document.dispatchEvent(
      new CustomEvent('minifeather:pbr-config', {
        detail: JSON.stringify({ enabled: !!settings.experimentalPbr })
      })
    );
    // Auto-instalar el pack PBR integrado (assets/pbr) la primera vez que
    // se activa PBR sin atlas en IndexedDB — evita subir el ZIP a mano.
    if (settings.experimentalPbr && localStorage.getItem('mf_pbr_available') !== 'true') {
      if (window.MF_TEXTURE_PACK?.installBundledPbr) {
        MF_TEXTURE_PACK.installBundledPbr().then((r) => {
          if (r?.success) {
            localStorage.setItem('mf_pbr_available', 'true');
          }
        }).catch(() => {
          // "Extension context invalidated" (reload de la extensión con la
          // página abierta): chrome.runtime.getURL muere. El usuario solo
          // necesita F5 — avisar sin spamear.
          console.warn('[MiniFeather] PBR integrado no instalado — recarga la página (F5)');
        });
      }
    }
    // Auto-curación: PBRTextures (MAIN) detectó atlas vacíos (relicto de
    // build vieja) y los borró — regenerar SIN mirar mf_pbr_available.
    if (!window.__mfPbrReinstallBound) {
      window.__mfPbrReinstallBound = true;
      document.addEventListener('minifeather:pbr-reinstall', () => {
        if (window.MF_TEXTURE_PACK?.installBundledPbr) {
          MF_TEXTURE_PACK.installBundledPbr().then((r) => {
            if (r?.success) {
              localStorage.setItem('mf_pbr_available', 'true');
            }
          });
        }
      });
    }
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
    setModuleEnabled('clientChat', settings.clientChat);
    sendClientChatConfig(settings.clientChat);

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
    initWaypointsModule();
    initTitanTinyModule();
    initHealthNameTagsModule();
    initDistanceNameTagsModule();
    initDamageParticlesModule();
    initWaterSplashModule();
    initPatPatModule();
    initItemPhysicsModule();
    initNoWeatherModule();
    initVanillaAnimationsModule();
    initLeafWindModule();
    initHandSwayModule();
    initBetterPlayerLayersModule();
    initAutoRespawnModule();
    initAntiAfkModule();
    initMovementAssistModules();
    initRhythmParkourModule();
    initLocalGamesModule();
    initGuiPatchModule();
    initCustomShaderModule();
    initZoomModule();
    initCameraOverhaulModule();
    initElytraFlightModule();
    initFreecamModule();
    initDynamicCrosshairModule();
    initClientChatModule();
    initGUI();
    initChatFeatures();
    injectFeatherButton();

    document.addEventListener('click', handleDocumentClick, {
      capture: true,
      signal: runtimeController.signal
    });

    document.addEventListener('minifeather:client-command', handleClientCommand, { signal: runtimeController.signal });
    document.addEventListener('minifeather:waypoints-changed', () => {
      if (panel && activePage === 'waypoints' && !searchQuery.trim()) renderCurrentPageContent();
    }, { signal: runtimeController.signal });
    document.addEventListener('minifeather:waypoint-ui-response', event => {
      let result = null;
      try { result = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail; } catch (_) {}
      if (!result) return;
      if (result.ok && result.waypoint) {
        waypointStatus = result.waypoint.name ? `${result.waypoint.name}: ${result.waypoint.x} ${result.waypoint.y} ${result.waypoint.z}` : t('waypointSaved');
      } else if (result.ok && Number.isFinite(Number(result.imported))) {
        waypointStatus = t('waypointImportedCount', { count: Number(result.imported) });
      } else if (result.ok) {
        waypointStatus = t('waypointUpdated');
      } else if (result.error === 'DUPLICATE_NAME') waypointStatus = t('waypointDuplicate');
      else if (result.error === 'NO_PLAYER') waypointStatus = t('waypointNoPlayer');
      else if (result.error === 'NO_WORLD') waypointStatus = t('waypointNoWorld');
      else if (result.error === 'LIMIT_REACHED') waypointStatus = t('waypointLimitReached');
      else if (result.error === 'NOT_FOUND') waypointStatus = t('waypointNotFound');
      else if (!result.ok) waypointStatus = t('waypointError');
      if (panel && activePage === 'waypoints' && !searchQuery.trim()) renderCurrentPageContent();
    }, { signal: runtimeController.signal });

    injectWaypointsPanelStyles();
    sendClientBindsConfig();
    sendWaypointsConfig();
    initNativeSettingsBridge();
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
    closeFreecamSettings();
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
    document.getElementById('mf-waypoints-panel-style')?.remove();
    document.getElementById('mf-clean-hud-style')?.remove();

    overlay = null;
    panel = null;
    guiReady = false;
    activePage = 'dashboard';
    searchQuery = '';
    favoritesOnly = false;
    favoriteModules.clear();
    featureSettingsCleanup = null;

    if (globalThis.__MINIFEATHER_CONTENT__?.destroy === destroy) {
      delete globalThis.__MINIFEATHER_CONTENT__;
    }
  }

  function boot() {
    chrome.storage.local.get(['settings', 'customLogo', 'favoriteModules'], data => {
      if (destroyed) return;
      settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      settings.antiAfkDelay = clampAntiAfkDelay(settings.antiAfkDelay);
      settings.patPatValues = clampPatPatValues(settings.patPatValues);
      settings.patPatPreset = detectPatPatPreset(settings.patPatValues);
      settings.cameraOverhaulValues = clampCameraValues(settings.cameraOverhaulValues);
      settings.cameraOverhaulPreset = detectCameraPreset(settings.cameraOverhaulValues);
      settings.elytraFlightValues = clampElytraFlightValues(settings.elytraFlightValues);
      settings.elytraFlightPreset = detectElytraFlightPreset(settings.elytraFlightValues);
      settings.cameraOverhaulBind = String(settings.cameraOverhaulBind || '');
      settings.freecamSpeed = Math.max(1, Math.min(30, Number(settings.freecamSpeed) || 7));
      settings.freecamSensitivity = Math.max(0.1, Math.min(3, Number(settings.freecamSensitivity) || 1));
      settings.freecamFastMultiplier = Math.max(1, Math.min(8, Number(settings.freecamFastMultiplier) || 3));
      settings.dynamicCrosshairMap = { ...DEFAULT_SETTINGS.dynamicCrosshairMap, ...(settings.dynamicCrosshairMap || {}) };
      settings.moduleBinds = { ...DEFAULT_SETTINGS.moduleBinds, ...(settings.moduleBinds || {}) };
      settings.experimentalRealisticCustom = clampRealisticCustom(settings.experimentalRealisticCustom || REALISTIC_CUSTOM_DEFAULTS);
      settings.panelAccentColor = normalizePanelColor(settings.panelAccentColor, DEFAULT_SETTINGS.panelAccentColor);
      settings.panelBackgroundColor = normalizePanelColor(settings.panelBackgroundColor, DEFAULT_SETTINGS.panelBackgroundColor);
      settings.panelScale = clampPanelScale(settings.panelScale);
      settings.pageZoomEnabled = settings.pageZoomEnabled !== false;
      // aplicar zoom de página al arrancar (si está activo)
      applyPanelScale();
      guiSettings = {
        ...settings,
        moduleBinds: { ...settings.moduleBinds },
        patPatValues: clonePatPatValues(settings.patPatValues),
        cameraOverhaulValues: cloneCameraValues(settings.cameraOverhaulValues),
        elytraFlightValues: cloneElytraFlightValues(settings.elytraFlightValues)
      };
      currentLogo = data.customLogo || CONFIG.defaultLogo;
      favoriteModules = new Set(Array.isArray(data.favoriteModules) ? data.favoriteModules : []);

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
