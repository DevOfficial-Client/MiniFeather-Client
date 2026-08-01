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

  const DEFAULT_SETTINGS = {
    rebrand: true,
    supportAds: false,
    discord: true,
    keystrokes: true,
    cpsCounter: true,
    pingCounter: true,
    chatVideos: true,
    chatLinks: true,
    language: 'en'
  };

  const TRANSLATIONS = {
    en: {
      title: 'MiniFeather',
      subtitle: 'Minimal panel',
      shortcut: 'Right Shift',
      language: 'Language',
      tabClient: 'Client',
      tabSkins: 'Custom',
      tabAbout: 'About',
      sectionGeneral: 'General',
      sectionLogo: 'Custom Logo',
      sectionLinks: 'Links',
      sectionSkinChanger: 'Skin Changer',
      sectionActiveSkins: 'Active Skins',
      sectionCapeChanger: 'Cape Changer',
      sectionActiveCapes: 'Active Capes',
      sectionAbout: 'Info',
      rebrand: 'Rebrand',
      rebrandDesc: 'Logo, title and background.',
      supportAds: 'Support Ads',
      supportAdsDesc: 'Allow ads to support creators.',
      discordRedirect: 'Discord Redirect',
      discordRedirectDesc: 'Use the MiniFeather Client invite.',
      keystrokes: 'Keystrokes',
      keystrokesDesc: 'Show movement keys and CPS.',
      cpsCounter: 'CPS Counter',
      cpsCounterDesc: 'Show left and right clicks per second.',
      cpsLabel: 'CPS',
      pingCounter: 'Ping Counter',
      pingCounterDesc: 'Show the browser-reported connection round-trip time in milliseconds.',
      pingLabel: 'PING',
      sectionChat: 'Chat',
      chatVideos: 'Chat Videos',
      chatVideosDesc: 'Show YouTube previews while keeping the original message visible.',
      chatLinks: 'Clickable Chat Links',
      chatLinksDesc: 'Open links from chat in a new browser tab when clicked.',
      spritesheet: 'Custom Spritesheet',
      spritesheetDesc: 'Replace the default spritesheet.',
      customLogoUrl: 'Logo URL',
      customLogoUrlPlaceholder: 'https://example.com/logo.png',
      customLogoFile: 'Upload logo',
      applyLogo: 'Apply Logo',
      resetLogo: 'Reset Logo',
      logoUpdated: 'Logo updated.',
      logoResetDone: 'Logo reset.',
      logoNeedSource: 'Enter a logo URL or upload a file.',
      logoInvalid: 'The image could not be loaded.',
      skinSelect: 'Select Skin',
      skinSelectPlaceholder: '-- Select skin --',
      skinUrl: 'Custom URL',
      skinUrlPlaceholder: 'https://example.com/skin.png',
      skinFile: 'Upload skin',
      applySkin: 'Apply',
      resetAll: 'Reset All',
      skinNeedName: 'Select a skin first.',
      skinNeedSource: 'Enter a URL or upload a file.',
      skinApplied: 'Skin "{name}" applied.',
      skinRemoved: 'Skin "{name}" removed.',
      skinsReset: 'All skins reset.',
      noActiveSkins: 'No active skins.',
      capeSelectPlaceholder: '-- Select cape --',
      capeUrlPlaceholder: 'https://example.com/cape.png',
      applyCape: 'Apply',
      capeNeedName: 'Select a cape first.',
      capeNeedSource: 'Enter a URL or upload a file.',
      capeApplied: 'Cape "{name}" applied.',
      capeRemoved: 'Cape "{name}" removed.',
      capesReset: 'All capes reset.',
      noActiveCapes: 'No active capes.',
      remove: 'Remove',
      joinServer: 'Join MiniFeather Client',
      aboutLine1: 'Open the panel with Right Shift.',
      aboutLine2: 'Settings are saved automatically.',
      welcomeHtml: 'Welcome To MiniFeather Client!',
      discordDesc1: 'Find MiniFeather Client members and squad up',
      discordDesc2: 'Get the clients updates and news',
      discordDesc3: 'MiniClient events, giveaways and perks',
      discordDesc4: 'Chat with the MiniFeather Client community',
      discordDesc5: 'Join the MiniFeather Client community',
      preview: 'Preview',
      customLogoLocal: 'A local image is selected'
    },
    es: {
      title: 'MiniFeather',
      subtitle: 'Panel minimalista',
      shortcut: 'Shift derecho',
      language: 'Idioma',
      tabClient: 'Cliente',
      tabSkins: 'Personalizado',
      tabAbout: 'Info',
      sectionGeneral: 'General',
      sectionLogo: 'Logo Personalizado',
      sectionLinks: 'Enlaces',
      sectionSkinChanger: 'Cambiador de Skins',
      sectionActiveSkins: 'Skins Activas',
      sectionCapeChanger: 'Cambiador de Capas',
      sectionActiveCapes: 'Capas Activas',
      sectionAbout: 'Información',
      rebrand: 'Rebrand',
      rebrandDesc: 'Logo, título y fondo.',
      supportAds: 'Anuncios',
      supportAdsDesc: 'Permitir anuncios para apoyar a los creadores.',
      discordRedirect: 'Redirección de Discord',
      discordRedirectDesc: 'Usar la invitación personalizada de Kings SMP.',
      keystrokes: 'Keystrokes',
      keystrokesDesc: 'Mostrar teclas de movimiento y CPS.',
      cpsCounter: 'Contador de CPS',
      cpsCounterDesc: 'Mostrar los clics izquierdos y derechos por segundo.',
      cpsLabel: 'CPS',
      pingCounter: 'Contador de Ping',
      pingCounterDesc: 'Mostrar el tiempo de ida y vuelta de la conexión reportado por el navegador.',
      pingLabel: 'PING',
      sectionChat: 'Chat',
      chatVideos: 'Videos en el Chat',
      chatVideosDesc: 'Mostrar vistas previas de YouTube conservando visible el mensaje original.',
      chatLinks: 'Enlaces del Chat',
      chatLinksDesc: 'Abrir los enlaces del chat en una nueva pestaña del navegador al hacer clic.',
      spritesheet: 'Spritesheet Personalizado',
      spritesheetDesc: 'Reemplazar el spritesheet predeterminado.',
      customLogoUrl: 'URL del logo',
      customLogoUrlPlaceholder: 'https://example.com/logo.png',
      customLogoFile: 'Subir logo',
      applyLogo: 'Aplicar Logo',
      resetLogo: 'Restablecer Logo',
      logoUpdated: 'Logo actualizado.',
      logoResetDone: 'Logo restablecido.',
      logoNeedSource: 'Escribe una URL del logo o sube un archivo.',
      logoInvalid: 'No se pudo cargar la imagen.',
      skinSelect: 'Seleccionar Skin',
      skinSelectPlaceholder: '-- Selecciona una skin --',
      skinUrl: 'URL Personalizada',
      skinUrlPlaceholder: 'https://example.com/skin.png',
      skinFile: 'Subir skin',
      applySkin: 'Aplicar',
      resetAll: 'Restablecer Todo',
      skinNeedName: 'Selecciona una skin primero.',
      skinNeedSource: 'Escribe una URL o sube un archivo.',
      skinApplied: 'Skin "{name}" aplicada.',
      skinRemoved: 'Skin "{name}" eliminada.',
      skinsReset: 'Todas las skins fueron restablecidas.',
      noActiveSkins: 'No hay skins activas.',
      capeSelectPlaceholder: '-- Selecciona una capa --',
      capeUrlPlaceholder: 'https://example.com/capa.png',
      applyCape: 'Aplicar',
      capeNeedName: 'Selecciona una capa primero.',
      capeNeedSource: 'Escribe una URL o sube un archivo.',
      capeApplied: 'Capa "{name}" aplicada.',
      capeRemoved: 'Capa "{name}" eliminada.',
      capesReset: 'Todas las capas fueron restablecidas.',
      noActiveCapes: 'No hay capas activas.',
      remove: 'Quitar',
      joinServer: 'Unirse a Kings SMP',
      aboutLine1: 'Abre el panel con Shift derecho.',
      aboutLine2: 'La configuración se guarda automáticamente.',
      welcomeHtml: '¡Bienvenido a MiniFeather Client! <span style="color:#7b8495;font-size:11px;margin-left:6px;">Kings SMP</span>',
      discordDesc1: 'Encuentra miembros de Kings SMP y juega con ellos',
      discordDesc2: 'Recibe noticias y actualizaciones de Kings SMP',
      discordDesc3: 'Eventos, sorteos y ventajas de KSMP',
      discordDesc4: 'Habla con la comunidad de Kings SMP',
      discordDesc5: 'Únete a la comunidad de Kings SMP',
      preview: 'Vista previa',
      customLogoLocal: 'Se seleccionó una imagen local'
    },
    ja: {
      title: 'MiniFeather',
      subtitle: 'ミニマルパネル',
      shortcut: '右Shift',
      language: '言語',
      tabClient: 'クライアント',
      tabSkins: 'カスタム',
      tabAbout: '情報',
      sectionGeneral: '一般',
      sectionLogo: 'カスタムロゴ',
      sectionLinks: 'リンク',
      sectionSkinChanger: 'スキン変更',
      sectionActiveSkins: '有効なスキン',
      sectionCapeChanger: 'マント変更',
      sectionActiveCapes: '有効なマント',
      sectionAbout: '情報',
      rebrand: 'リブランド',
      rebrandDesc: 'ロゴ、タイトル、背景。',
      supportAds: '広告',
      supportAdsDesc: '広告を許可して制作者を支援します。',
      discordRedirect: 'Discord リダイレクト',
      discordRedirectDesc: 'Kings SMP のカスタム招待を使用します。',
      keystrokes: 'キーストローク',
      keystrokesDesc: '移動キーと CPS を表示します。',
      cpsCounter: 'CPS カウンター',
      cpsCounterDesc: '左右の1秒あたりのクリック数を表示します。',
      cpsLabel: 'CPS',
      pingCounter: 'Ping カウンター',
      pingCounterDesc: 'ブラウザが報告する接続の往復時間をミリ秒で表示します。',
      pingLabel: 'PING',
      sectionChat: 'チャット',
      chatVideos: 'チャット動画',
      chatVideosDesc: '元のメッセージを表示したまま、YouTubeのプレビューをチャットに表示します。',
      chatLinks: 'クリック可能なチャットリンク',
      chatLinksDesc: 'チャット内のリンクをクリックすると、ブラウザの新しいタブで開きます。',
      spritesheet: 'カスタムスプライトシート',
      spritesheetDesc: '標準スプライトシートを置き換えます。',
      customLogoUrl: 'ロゴ URL',
      customLogoUrlPlaceholder: 'https://example.com/logo.png',
      customLogoFile: 'ロゴをアップロード',
      applyLogo: 'ロゴを適用',
      resetLogo: 'ロゴをリセット',
      logoUpdated: 'ロゴを更新しました。',
      logoResetDone: 'ロゴをリセットしました。',
      logoNeedSource: 'ロゴのURLを入力するか、ファイルをアップロードしてください。',
      logoInvalid: '画像を読み込めませんでした。',
      skinSelect: 'スキンを選択',
      skinSelectPlaceholder: '-- スキンを選択 --',
      skinUrl: 'カスタム URL',
      skinUrlPlaceholder: 'https://example.com/skin.png',
      skinFile: 'スキンをアップロード',
      applySkin: '適用',
      resetAll: 'すべてリセット',
      skinNeedName: '先にスキンを選択してください。',
      skinNeedSource: 'URLを入力するか、ファイルをアップロードしてください。',
      skinApplied: 'スキン「{name}」を適用しました。',
      skinRemoved: 'スキン「{name}」を削除しました。',
      skinsReset: 'すべてのスキンをリセットしました。',
      noActiveSkins: '有効なスキンはありません。',
      capeSelectPlaceholder: '-- マントを選択 --',
      capeUrlPlaceholder: 'https://example.com/cape.png',
      applyCape: '適用',
      capeNeedName: '先にマントを選択してください。',
      capeNeedSource: 'URLを入力するか、ファイルをアップロードしてください。',
      capeApplied: 'マント「{name}」を適用しました。',
      capeRemoved: 'マント「{name}」を削除しました。',
      capesReset: 'すべてのマントをリセットしました。',
      noActiveCapes: '有効なマントはありません。',
      remove: '削除',
      joinServer: 'Kings SMP に参加',
      aboutLine1: '右Shiftでパネルを開きます。',
      aboutLine2: '設定は自動で保存されます。',
      welcomeHtml: 'MiniFeather Client へようこそ！ <span style="color:#7b8495;font-size:11px;margin-left:6px;">Kings SMP</span>',
      discordDesc1: 'Kings SMP の仲間を見つけて一緒にプレイ',
      discordDesc2: 'Kings SMP の最新情報とニュースを受け取る',
      discordDesc3: 'KSMP のイベント、プレゼント、特典',
      discordDesc4: 'Kings SMP コミュニティと交流する',
      discordDesc5: 'Kings SMP コミュニティに参加する',
      preview: 'プレビュー',
      customLogoLocal: 'ローカル画像が選択されています'
    },
    it: {
      title: 'MiniFeather',
      subtitle: 'Pannello minimale',
      shortcut: 'Shift destro',
      language: 'Lingua',
      tabClient: 'Client',
      tabSkins: 'Personalizzato',
      tabAbout: 'Info',
      sectionGeneral: 'Generale',
      sectionLogo: 'Logo Personalizzato',
      sectionLinks: 'Link',
      sectionSkinChanger: 'Cambio Skin',
      sectionActiveSkins: 'Skin Attive',
      sectionCapeChanger: 'Cambio Mantello',
      sectionActiveCapes: 'Mantelli Attivi',
      sectionAbout: 'Informazioni',
      rebrand: 'Rebrand',
      rebrandDesc: 'Logo, titolo e sfondo.',
      supportAds: 'Pubblicità',
      supportAdsDesc: 'Consenti gli annunci per supportare i creatori.',
      discordRedirect: 'Reindirizzamento Discord',
      discordRedirectDesc: 'Usa l’invito personalizzato di Kings SMP.',
      keystrokes: 'Keystrokes',
      keystrokesDesc: 'Mostra tasti di movimento e CPS.',
      cpsCounter: 'Contatore CPS',
      cpsCounterDesc: 'Mostra i clic sinistri e destri al secondo.',
      cpsLabel: 'CPS',
      pingCounter: 'Contatore Ping',
      pingCounterDesc: 'Mostra il tempo di andata e ritorno della connessione rilevato dal browser.',
      pingLabel: 'PING',
      sectionChat: 'Chat',
      chatVideos: 'Video nella Chat',
      chatVideosDesc: 'Mostra le anteprime di YouTube mantenendo visibile il messaggio originale.',
      chatLinks: 'Link Cliccabili nella Chat',
      chatLinksDesc: 'Apre i link della chat in una nuova scheda del browser quando vengono cliccati.',
      spritesheet: 'Spritesheet Personalizzato',
      spritesheetDesc: 'Sostituisce lo spritesheet predefinito.',
      customLogoUrl: 'URL del logo',
      customLogoUrlPlaceholder: 'https://example.com/logo.png',
      customLogoFile: 'Carica logo',
      applyLogo: 'Applica Logo',
      resetLogo: 'Reimposta Logo',
      logoUpdated: 'Logo aggiornato.',
      logoResetDone: 'Logo reimpostato.',
      logoNeedSource: 'Inserisci un URL del logo o carica un file.',
      logoInvalid: 'Impossibile caricare l’immagine.',
      skinSelect: 'Seleziona Skin',
      skinSelectPlaceholder: '-- Seleziona una skin --',
      skinUrl: 'URL Personalizzato',
      skinUrlPlaceholder: 'https://example.com/skin.png',
      skinFile: 'Carica skin',
      applySkin: 'Applica',
      resetAll: 'Reimposta Tutto',
      skinNeedName: 'Seleziona prima una skin.',
      skinNeedSource: 'Inserisci un URL o carica un file.',
      skinApplied: 'Skin "{name}" applicata.',
      skinRemoved: 'Skin "{name}" rimossa.',
      skinsReset: 'Tutte le skin sono state reimpostate.',
      noActiveSkins: 'Nessuna skin attiva.',
      capeSelectPlaceholder: '-- Seleziona un mantello --',
      capeUrlPlaceholder: 'https://example.com/cape.png',
      applyCape: 'Applica',
      capeNeedName: 'Seleziona prima un mantello.',
      capeNeedSource: 'Inserisci un URL o carica un file.',
      capeApplied: 'Mantello "{name}" applicato.',
      capeRemoved: 'Mantello "{name}" rimosso.',
      capesReset: 'Tutti i mantelli sono stati reimpostati.',
      noActiveCapes: 'Nessun mantello attivo.',
      remove: 'Rimuovi',
      joinServer: 'Unisciti a Kings SMP',
      aboutLine1: 'Apri il pannello con Shift destro.',
      aboutLine2: 'Le impostazioni vengono salvate automaticamente.',
      welcomeHtml: 'Benvenuto su MiniFeather Client! <span style="color:#7b8495;font-size:11px;margin-left:6px;">Kings SMP</span>',
      discordDesc1: 'Trova membri di Kings SMP e gioca con loro',
      discordDesc2: 'Ricevi aggiornamenti e notizie di Kings SMP',
      discordDesc3: 'Eventi, giveaway e vantaggi KSMP',
      discordDesc4: 'Chatta con la community di Kings SMP',
      discordDesc5: 'Unisciti alla community di Kings SMP',
      preview: 'Anteprima',
      customLogoLocal: 'È stata selezionata un’immagine locale'
    }
  };

  const LOGO_ALT_NAMES = ['miniblox'];
  const LOGO_SOURCE_NAMES = ['miniblox-icon', 'miniblox-logo', 'pwa-icon-192.png'];

  let settings = { ...DEFAULT_SETTINGS };
  let guiSettings = { ...DEFAULT_SETTINGS };
  let currentLogo = CONFIG.defaultLogo;
  let updateTimer = 0;
  let activeTab = 'client';
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
          z-index:999999;
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
          if (box) box.style.display = 'none';
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
          if (box) box.style.display = 'none';
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
      let interval = 0;
      let ping = null;

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

      function readRtt() {
        if (!navigator.onLine) return null;
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const value = Number(connection?.rtt);
        return Number.isFinite(value) && value >= 0 ? value : null;
      }

      function render() {
        ping = readRtt();
        const value = Number.isFinite(ping) ? Math.round(ping) : null;
        const color = value === null ? '#94a3b8' : value <= 80 ? '#22c55e' : value <= 150 ? '#facc15' : '#ef4444';
        if (box) {
          box.innerHTML = `<span style="color:#9ca3af;">${t('pingLabel')}</span> <span style="color:${color};">${value === null ? '--' : value}</span> <span style="color:#64748b;">ms</span>`;
        }
      }

      return createLifecycle({
        enable() {
          createBox();
          box.style.display = 'block';
          controller = new AbortController();
          const signal = controller.signal;
          const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
          let dragging = false;
          let offX = 0;
          let offY = 0;

          connection?.addEventListener?.('change', render, { signal });
          window.addEventListener('online', render, { signal });
          window.addEventListener('offline', render, { signal });
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) render();
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

          render();
          interval = window.setInterval(render, 2000);
        },
        disable() {
          controller?.abort();
          controller = null;
          clearInterval(interval);
          interval = 0;
          ping = null;
          if (box) box.style.display = 'none';
        },
        destroy() {
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
          if (container) container.style.display = 'none';
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
        background:rgba(2,6,12,.52);
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
        z-index:999998;
        display:none;
      }
      #mf-gui {
        position:fixed;
        top:50%;
        left:50%;
        transform:translate(-50%,-50%);
        width:min(360px, calc(100vw - 24px));
        max-height:min(720px, calc(100vh - 24px));
        background:rgba(8,11,18,.96);
        border:1px solid rgba(255,255,255,.08);
        border-radius:20px;
        box-shadow:0 24px 70px rgba(0,0,0,.45);
        overflow:hidden;
        color:#edf2f7;
        z-index:999999;
        display:none;
        pointer-events:none;
        opacity:0;
        transition:opacity .14s ease;
      }
      #mf-gui-shell {
        display:flex;
        flex-direction:column;
        max-height:min(720px, calc(100vh - 24px));
      }
      #mf-gui-header {
        display:flex;
        align-items:center;
        gap:12px;
        padding:14px 16px;
        border-bottom:1px solid rgba(255,255,255,.06);
        cursor:move;
        background:linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0));
      }
      #mf-gui-brand {
        display:flex;
        flex-direction:column;
        min-width:0;
      }
      #mf-gui-brand strong {
        font-size:15px;
        line-height:1.1;
        color:#fff;
      }
      #mf-gui-brand span {
        font-size:11px;
        color:#94a3b8;
      }
      .mf-icon {
        width:30px;
        height:30px;
        border-radius:10px;
        object-fit:cover;
        box-shadow:0 0 0 1px rgba(255,255,255,.08) inset;
        flex:0 0 auto;
      }
      .mf-header-actions {
        display:flex;
        align-items:center;
        gap:8px;
        margin-left:auto;
      }
      .mf-select,
      .mf-input,
      .mf-file,
      .mf-btn,
      .mf-small-btn {
        width:100%;
        border-radius:12px;
        border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.04);
        color:#edf2f7;
        padding:10px 12px;
        font-size:12px;
        outline:none;
        transition:border-color .15s ease, background .15s ease, transform .12s ease;
      }
      /* Keep native select menus readable in Chromium/Windows dark mode. */
      #mf-gui,
      .mf-select {
        color-scheme:dark;
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
      .mf-input:focus,
      .mf-file:focus {
        border-color:rgba(167,139,250,.6);
        background:rgba(255,255,255,.06);
      }
      .mf-file {
        padding:8px 10px;
        color:#cbd5e1;
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
        background:linear-gradient(180deg, rgba(124,58,237,.96), rgba(91,33,182,.96));
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
      .mf-tabs {
        display:grid;
        grid-template-columns:repeat(3, 1fr);
        gap:8px;
        padding:12px 16px 0;
      }
      .mf-tab-btn {
        background:rgba(255,255,255,.03);
        border:1px solid rgba(255,255,255,.06);
        color:#94a3b8;
        border-radius:12px;
        padding:9px 10px;
        font-size:12px;
        cursor:pointer;
      }
      .mf-tab-btn.active {
        background:rgba(124,58,237,.14);
        border-color:rgba(167,139,250,.35);
        color:#fff;
      }
      .mf-body {
        padding:12px 16px 16px;
        overflow:auto;
        scrollbar-width:thin;
        scrollbar-color:#475569 #0b0f18;
      }
      .mf-body::-webkit-scrollbar {
        width:10px;
        height:10px;
      }
      .mf-body::-webkit-scrollbar-track {
        background:#0b0f18;
      }
      .mf-body::-webkit-scrollbar-thumb {
        background:#475569;
        border:2px solid #0b0f18;
        border-radius:999px;
      }
      .mf-body::-webkit-scrollbar-thumb:hover {
        background:#64748b;
      }
      .mf-tab-panel {
        display:none;
        flex-direction:column;
        gap:12px;
      }
      .mf-tab-panel.active {
        display:flex;
      }
      .mf-card {
        background:rgba(255,255,255,.03);
        border:1px solid rgba(255,255,255,.06);
        border-radius:16px;
        padding:12px;
        display:flex;
        flex-direction:column;
        gap:10px;
      }
      .mf-card-title {
        font-size:11px;
        text-transform:uppercase;
        letter-spacing:.14em;
        color:#64748b;
      }
      .mf-toggle {
        display:flex;
        align-items:center;
        gap:12px;
        justify-content:space-between;
      }
      .mf-toggle-copy {
        display:flex;
        flex-direction:column;
        gap:2px;
        min-width:0;
      }
      .mf-toggle-copy strong {
        font-size:13px;
        color:#fff;
        font-weight:700;
      }
      .mf-toggle-copy span {
        font-size:11px;
        color:#94a3b8;
        line-height:1.35;
      }
      .mf-switch {
        appearance:none;
        width:38px;
        height:22px;
        border-radius:999px;
        background:#1e293b;
        border:1px solid rgba(255,255,255,.08);
        position:relative;
        cursor:pointer;
        flex:0 0 auto;
      }
      .mf-switch::after {
        content:'';
        position:absolute;
        top:2px;
        left:2px;
        width:16px;
        height:16px;
        border-radius:50%;
        background:#94a3b8;
        transition:transform .16s ease, background .16s ease;
      }
      .mf-switch:checked {
        background:rgba(124,58,237,.4);
        border-color:rgba(167,139,250,.35);
      }
      .mf-switch:checked::after {
        transform:translateX(16px);
        background:#fff;
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
        border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.04);
        object-fit:cover;
        flex:0 0 auto;
      }
      .mf-muted {
        color:#94a3b8;
        font-size:11px;
        line-height:1.4;
      }
      .mf-active-list {
        display:flex;
        flex-direction:column;
        gap:8px;
        max-height:180px;
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
        border:1px solid rgba(255,255,255,.06);
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
        border:1px solid rgba(255,255,255,.06);
        background:rgba(255,255,255,.04);
        color:#cbd5e1;
        font-size:18px;
        line-height:1;
        cursor:pointer;
      }
      @media (max-width: 520px) {
        #mf-gui {
          width:calc(100vw - 20px);
          max-height:calc(100vh - 20px);
        }
        .mf-grid-2 {
          grid-template-columns:1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getPanelTemplate() {
    return `
      <div id="mf-gui-shell">
        <div id="mf-gui-header">
          <img class="mf-icon" src="${currentLogo}" alt="MiniFeather">
          <div id="mf-gui-brand">
            <strong>${t('title')}</strong>
            <span>${t('subtitle')} · ${t('shortcut')}</span>
          </div>
          <div class="mf-header-actions">
            <select id="mf-language-select" class="mf-select" style="width:122px;padding:8px 10px;">
              <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
              <option value="es" ${settings.language === 'es' ? 'selected' : ''}>Español</option>
              <option value="ja" ${settings.language === 'ja' ? 'selected' : ''}>日本語</option>
              <option value="it" ${settings.language === 'it' ? 'selected' : ''}>Italiano</option>
            </select>
            <button id="mf-gui-close" class="mf-close">×</button>
          </div>
        </div>
        <div class="mf-tabs">
          <button class="mf-tab-btn ${activeTab === 'client' ? 'active' : ''}" data-tab="client">${t('tabClient')}</button>
          <button class="mf-tab-btn ${activeTab === 'skins' ? 'active' : ''}" data-tab="skins">${t('tabSkins')}</button>
          <button class="mf-tab-btn ${activeTab === 'about' ? 'active' : ''}" data-tab="about">${t('tabAbout')}</button>
        </div>
        <div class="mf-body">
          <div class="mf-tab-panel ${activeTab === 'client' ? 'active' : ''}" data-panel="client">
            <div class="mf-card">
              <div class="mf-card-title">${t('sectionGeneral')}</div>
              ${renderToggle('rebrand', t('rebrand'), t('rebrandDesc'))}
              ${renderToggle('supportAds', t('supportAds'), t('supportAdsDesc'))}
              ${renderToggle('discord', t('discordRedirect'), t('discordRedirectDesc'))}
              ${renderToggle('keystrokes', t('keystrokes'), t('keystrokesDesc'))}
              ${renderToggle('cpsCounter', t('cpsCounter'), t('cpsCounterDesc'))}
              ${renderToggle('pingCounter', t('pingCounter'), t('pingCounterDesc'))}
              <label class="mf-toggle" id="mf-spritesheet-toggle">
                <span class="mf-toggle-copy">
                  <strong>${t('spritesheet')}</strong>
                  <span>${t('spritesheetDesc')}</span>
                </span>
                <input type="checkbox" id="mf-spritesheet-checkbox" class="mf-switch" checked>
              </label>
            </div>
            <div class="mf-card">
              <div class="mf-card-title">${t('sectionChat')}</div>
              ${renderToggle('chatVideos', t('chatVideos'), t('chatVideosDesc'))}
              ${renderToggle('chatLinks', t('chatLinks'), t('chatLinksDesc'))}
            </div>
            <div class="mf-card">
              <div class="mf-card-title">${t('sectionLogo')}</div>
              <div class="mf-logo-preview-wrap">
                <img id="mf-logo-preview" class="mf-logo-preview" src="${currentLogo}" alt="${t('preview')}">
                <div class="mf-muted" id="mf-logo-preview-text">${t('preview')}</div>
              </div>
              <input id="mf-logo-url" class="mf-input" type="text" placeholder="${t('customLogoUrlPlaceholder')}">
              <input id="mf-logo-file" class="mf-file" type="file" accept="image/*">
              <div class="mf-grid-2">
                <button id="mf-logo-apply" class="mf-btn primary">${t('applyLogo')}</button>
                <button id="mf-logo-reset" class="mf-btn secondary">${t('resetLogo')}</button>
              </div>
              <div id="mf-logo-status" class="mf-status"></div>
            </div>
            <div class="mf-card">
              <div class="mf-card-title">${t('sectionLinks')}</div>
              <button id="mf-gui-discord" class="mf-btn primary">${t('joinServer')}</button>
            </div>
          </div>
          <div class="mf-tab-panel ${activeTab === 'skins' ? 'active' : ''}" data-panel="skins">
            <div class="mf-card">
              <div class="mf-card-title">${t('sectionSkinChanger')}</div>
              <select id="mf-skin-select" class="mf-select">
                <option value="">${t('skinSelectPlaceholder')}</option>
              </select>
              <input type="text" id="mf-skin-url" class="mf-input" placeholder="${t('skinUrlPlaceholder')}">
              <input type="file" id="mf-skin-file" class="mf-file" accept="image/*">
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
              <input type="file" id="mf-cape-file" class="mf-file" accept="image/*">
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
          <div class="mf-tab-panel ${activeTab === 'about' ? 'active' : ''}" data-panel="about">
            <div class="mf-card">
              <div class="mf-card-title">${t('sectionAbout')}</div>
              <div class="mf-muted">${t('aboutLine1')}</div>
              <div class="mf-muted">${t('aboutLine2')}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderToggle(key, title, description) {
    return `
      <label class="mf-toggle" data-key="${key}">
        <span class="mf-toggle-copy">
          <strong>${title}</strong>
          <span>${description}</span>
        </span>
        <input type="checkbox" class="mf-switch" ${guiSettings[key] ? 'checked' : ''}>
      </label>
    `;
  }

  function showGUI() {
    if (!overlay || !panel) return;
    overlay.style.display = 'block';
    panel.style.display = 'block';
    panel.style.pointerEvents = 'auto';
    requestAnimationFrame(() => {
      panel.style.opacity = '1';
    });
  }

  function hideGUI() {
    if (!overlay || !panel) return;
    overlay.style.display = 'none';
    panel.style.opacity = '0';
    panel.style.pointerEvents = 'none';
    setTimeout(() => {
      if (panel.style.opacity === '0') panel.style.display = 'none';
    }, 140);
  }

  function toggleGUI() {
    if (!overlay || !panel) return;
    if (overlay.style.display === 'block') hideGUI();
    else showGUI();
  }

  function setTab(tab) {
    activeTab = tab;
    if (!panel) return;
    panel.querySelectorAll('.mf-tab-btn').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tab);
    });
    panel.querySelectorAll('.mf-tab-panel').forEach(section => {
      section.classList.toggle('active', section.dataset.panel === tab);
    });
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

  function bindPanelControls() {
    if (!panel) return;

    panelController?.abort();
    panelController = new AbortController();
    const panelSignal = panelController.signal;

    panel.querySelector('#mf-gui-close')?.addEventListener('click', hideGUI);
    panel.querySelector('#mf-gui-discord')?.addEventListener('click', () => window.open(CONFIG.discord, '_blank'));

    panel.querySelectorAll('.mf-tab-btn').forEach(button => {
      button.addEventListener('click', () => setTab(button.dataset.tab));
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
      });
    });

    panel.querySelector('#mf-language-select')?.addEventListener('change', event => {
      settings.language = event.target.value;
      guiSettings.language = event.target.value;
      saveSettings();
      update();
      renderGUI();
    });

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

    chrome.runtime.sendMessage({ type: 'getSpritesheet' }, response => {
      const checkbox = panel?.querySelector('#mf-spritesheet-checkbox');
      if (checkbox && response && response.success) checkbox.checked = response.enabled;
    });

    panel.querySelector('#mf-spritesheet-checkbox')?.addEventListener('change', event => {
      chrome.runtime.sendMessage({ type: 'setSpritesheet', enabled: event.target.checked });
    });

    const header = panel.querySelector('#mf-gui-header');
    let dragging = false;
    let offX = 0;
    let offY = 0;

    header?.addEventListener('mousedown', event => {
      const target = event.target.closest('button, select, input');
      if (target) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offX = event.clientX - rect.left;
      offY = event.clientY - rect.top;
      panel.style.transform = 'none';
    });

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

    populateSkinSelect();
    refreshActiveSkins();
    populateCapeSelect();
    refreshActiveCapes();
    refreshLogoControls();
    applyGuiSettings();
  }

  function renderGUI() {
    if (!panel) return;
    panel.innerHTML = getPanelTemplate();
    bindPanelControls();
  }

  function initGUI() {
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
    }
    renderGUI();

    if (!guiReady) {
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
    setModuleEnabled('cpsCounter', settings.cpsCounter);
    setModuleEnabled('pingCounter', settings.pingCounter);
    setModuleEnabled('chatVideos', settings.chatVideos);
    setModuleEnabled('chatLinks', settings.chatLinks);

    if (settings.supportAds) showAds();
    else blockAds();
  }

  function initChatFeatures() {
    if (chatObserver) return;

    let style = document.getElementById('minifeather-chat-style');
    if (!style) {
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
    const GIF_LIST = [
      '84-years.gif', '1000-yard-stare-cat-meme.gif', 'aaaah-cat.gif', 'beard-bear.gif',
      'cat-disgusted.gif', 'cat-meme.gif', 'cat-meme-cat.gif', 'chat-pouce.gif',
      'clappi-clappi-clappi.gif', 'devil-cat-evil.gif', 'hands-down-meme.gif', 'kermit.gif',
      'lfg-lets-go.gif', 'memes2022funny-meme.gif', 'question-emoji.gif', 'scary-cat.gif',
      'shocked-shocked-cat.gif', 'shrek-rizz-shrek-meme.gif', 'ugly-plankton-meme-ugly-plankton.gif'
    ];

    const MEME_MAP = {
      'm-no': 'https://qu.ax/STWv.mp4',
      'm-que': 'https://qu.ax/WpYf.mp4',
      'm-si': 'https://qu.ax/pGis.mp4',
      'm-cry': 'https://qu.ax/mScl.mp4',
      'm-bye': 'https://qu.ax/NlCH.mp4'
    };

    const gifCache = new Map();
    const urlRegex = /https?:\/\/[^\s<>"']+/i;
    const gifRegex = /:([\w\d-]+?)(?:\.gif)?:/i;

    function getGif(name) {
      const key = name.toLowerCase();
      if (gifCache.has(key)) return gifCache.get(key);
      const file = GIF_LIST.find(entry => {
        const normalized = entry.toLowerCase();
        return normalized === key || normalized.replace(/\.gif$/, '') === key;
      });
      const value = file ? GIF_BASE + file : null;
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

      while (remaining) {
        const urlMatch = remaining.match(urlRegex);
        const gifMatch = remaining.match(gifRegex);
        const memeMatch = findMeme(remaining);
        const candidates = [];

        if (urlMatch) candidates.push({ type: 'url', index: urlMatch.index, raw: urlMatch[0] });
        if (gifMatch) candidates.push({ type: 'gif', index: gifMatch.index, raw: gifMatch[0], name: gifMatch[1] });
        if (memeMatch) candidates.push({ type: 'meme', ...memeMatch, raw: memeMatch.key });

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
      if (gifRegex.test(text) || findMeme(text)) return true;
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
      if (MODULES.get('chatVideos')?.enabled || MODULES.get('chatLinks')?.enabled) scan(document.body);
    }

    restoreChatContent = () => {
      document.querySelectorAll('.mf-chat-processed').forEach(wrapper => {
        wrapper.replaceWith(document.createTextNode(wrapper.dataset.mfOriginalText || ''));
      });
    };

    registerModule('chatVideos', () => createLifecycle({
      enable: refresh,
      disable: refresh,
      refresh,
      destroy: () => {}
    }));

    registerModule('chatLinks', () => createLifecycle({
      enable: refresh,
      disable: refresh,
      refresh,
      destroy: () => {}
    }));

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

    scan(document.body);
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

  function init() {
    if (destroyed || runtimeController) return;

    runtimeController = new AbortController();
    initLifecycleModules();
    injectFont();
    initFPSCounter().enable();
    initCPSCounter();
    initPingCounter();
    initKeystrokes();
    initGUI();
    initChatFeatures();
    hookClipboard();
    injectFeatherButton();

    document.addEventListener('click', handleDocumentClick, {
      capture: true,
      signal: runtimeController.signal
    });

    initRootObserver();
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
    sidebarObserver?.disconnect();
    sidebarObserver = null;

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

    if (globalThis.__MINIFEATHER_CONTENT__?.destroy === destroy) {
      delete globalThis.__MINIFEATHER_CONTENT__;
    }
  }

  function boot() {
    chrome.storage.local.get(['settings', 'customLogo'], data => {
      if (destroyed) return;
      settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      guiSettings = { ...settings };
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
