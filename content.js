(function () {
  'use strict';

  const CONFIG = {
    defaultLogo: 'https://raw.githubusercontent.com/DevOfficial-Client/MiniFeather-Client/refs/heads/main/icon.png',
    background: 'https://raw.githubusercontent.com/EstebanGrp/MIniFeather-Client/main/default-DKNlYibk%20(2).png',
    discord: 'https://discord.gg/k4Ku9DTQDQ',
    title: 'MiniFeather Client',
    fontUrl: 'https://raw.githubusercontent.com/EstebanGrp/MIniFeather-Client/refs/heads/main/Faithful.ttf',
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
    discord: true,
    keystrokes: true,
    cpsCounter: true,
    pingCounter: true,
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
      discordRedirect: 'Discord Redirect',
      discordRedirectDesc: 'Use the MiniFeather Client invite.',
      keystrokes: 'Keystrokes',
      keystrokesDesc: 'Show movement keys and CPS.',
      cpsCounter: 'CPS Counter',
      cpsCounterDesc: 'Show left and right clicks per second.',
      cpsLabel: 'CPS',
      pingCounter: 'Ping Counter',
      pingCounterDesc: 'Show estimated network latency in milliseconds.',
      pingLabel: 'PING',
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
      discordRedirect: 'Redirección de Discord',
      discordRedirectDesc: 'Usar la invitación personalizada de Kings SMP.',
      keystrokes: 'Keystrokes',
      keystrokesDesc: 'Mostrar teclas de movimiento y CPS.',
      cpsCounter: 'Contador de CPS',
      cpsCounterDesc: 'Mostrar los clics izquierdos y derechos por segundo.',
      cpsLabel: 'CPS',
      pingCounter: 'Contador de Ping',
      pingCounterDesc: 'Mostrar la latencia estimada de red en milisegundos.',
      pingLabel: 'PING',
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
      discordRedirect: 'Discord リダイレクト',
      discordRedirectDesc: 'Kings SMP のカスタム招待を使用します。',
      keystrokes: 'キーストローク',
      keystrokesDesc: '移動キーと CPS を表示します。',
      cpsCounter: 'CPS カウンター',
      cpsCounterDesc: '左右の1秒あたりのクリック数を表示します。',
      cpsLabel: 'CPS',
      pingCounter: 'Ping カウンター',
      pingCounterDesc: '推定ネットワーク遅延をミリ秒で表示します。',
      pingLabel: 'PING',
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
      discordRedirect: 'Reindirizzamento Discord',
      discordRedirectDesc: 'Usa l’invito personalizzato di Kings SMP.',
      keystrokes: 'Keystrokes',
      keystrokesDesc: 'Mostra tasti di movimento e CPS.',
      cpsCounter: 'Contatore CPS',
      cpsCounterDesc: 'Mostra i clic sinistri e destri al secondo.',
      cpsLabel: 'CPS',
      pingCounter: 'Contatore Ping',
      pingCounterDesc: 'Mostra la latenza di rete stimata in millisecondi.',
      pingLabel: 'PING',
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
  let pendingTick = false;
  let activeTab = 'client';
  let overlay = null;
  let panel = null;
  let guiReady = false;

  function t(key, vars = {}) {
    const table = TRANSLATIONS[settings.language] || TRANSLATIONS.en;
    const fallback = TRANSLATIONS.en[key] || key;
    let value = table[key] || fallback;
    return value.replace(/\{(\w+)\}/g, (_, token) => token in vars ? vars[token] : '');
  }

  function scheduleUpdate() {
    if (pendingTick) return;
    pendingTick = true;
    requestAnimationFrame(() => {
      pendingTick = false;
      update();
    });
  }

  function replaceTextNodes(targetText, replacement) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeValue.includes(targetText) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      node.nodeValue = node.nodeValue.split(targetText).join(replacement);
    }
  }

  function injectFont() {
    if (document.getElementById('minifeather-font')) return;
    const style = document.createElement('style');
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

    function patchCanvas() {
      document.querySelectorAll('canvas').forEach(canvas => {
        const ctx = canvas.getContext('2d');
        if (ctx && ctx.font && !ctx._minifeatherFont) {
          ctx._minifeatherFont = true;
          const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
          if (descriptor) {
            Object.defineProperty(ctx, 'font', {
              get() { return descriptor.get.call(this); },
              set(value) { descriptor.set.call(this, value.replace(/font-family:\s*[^;"]+/g, 'font-family: Faithful')); }
            });
          }
        }
      });
    }

    patchCanvas();
    const canvasObserver = new MutationObserver(patchCanvas);
    canvasObserver.observe(document.body, { childList: true, subtree: true });
  }

  function changeTitle() {
    if (document.title !== CONFIG.title) document.title = CONFIG.title;
  }

  function changeFavicon() {
    let icons = [...document.querySelectorAll("link[rel*='icon']")];
    if (icons.length === 0) {
      const icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.appendChild(icon);
      icons = [icon];
    }
    icons.forEach(icon => {
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
      if (!img.dataset.originalSrc && img.getAttribute('src')) img.dataset.originalSrc = img.getAttribute('src');
      if (img.getAttribute('src') !== currentLogo) img.setAttribute('src', currentLogo);
      if (img.hasAttribute('srcset')) img.setAttribute('srcset', currentLogo);
      const picture = img.closest('picture');
      if (picture) {
        picture.querySelectorAll('source').forEach(source => source.setAttribute('srcset', currentLogo));
      }
    });
  }

  function replaceBackground() {
    document.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (src.includes('default-B1Dv6Hww')) {
        if (!img.dataset.originalSrc) img.dataset.originalSrc = src;
        if (src !== CONFIG.background) img.setAttribute('src', CONFIG.background);
      }
    });
  }

  function replaceDiscordInput() {
    document.querySelectorAll('input').forEach(input => {
      if (input.value && input.value.includes('discord.gg') && input.value !== CONFIG.discord) {
        input.value = CONFIG.discord;
        input.setAttribute('value', CONFIG.discord);
      }
    });
  }

  function hideDiscordImage() {
    document.querySelectorAll('img').forEach(img => {
      if (img.alt === 'Join our Discord' || (img.src || '').includes('join-discord')) {
        img.style.display = 'none';
      }
    });
  }

  function changeDiscordButton() {
    document.querySelectorAll('button').forEach(btn => {
      const text = btn.innerText || '';
      if (text.includes('Join the Discord') || btn.dataset.mfJoin === '1') {
        btn.innerHTML = btn.innerHTML.replace(/Join the Discord/g, t('joinServer'));
        btn.dataset.mfJoin = '1';
      }
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
        if (p.innerText === original || p.dataset.mfDiscordKey === original) {
          p.innerText = replacement;
          p.dataset.mfDiscordKey = original;
        }
      });
      replaceTextNodes(original, replacement);
    });
  }

  function changeWelcomeText() {
    document.querySelectorAll('p.css-1dxm2zz').forEach(p => {
      if (p.innerText.toLowerCase().startsWith('welcome back') || p.dataset.mfWelcome === '1') {
        p.innerHTML = t('welcomeHtml');
        p.dataset.mfWelcome = '1';
      }
    });
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

  document.addEventListener('click', event => {
    const btn = event.target.closest('button');
    if (btn && btn.dataset.mfJoin === '1' && settings.discord) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.open(CONFIG.discord, '_blank');
    }
  }, true);

  function hookClipboard() {
    if (!navigator.clipboard || navigator.clipboard._mfHooked) return;
    const originalWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function (text) {
      if (settings.discord && text && text.includes('discord.gg')) text = CONFIG.discord;
      return originalWrite(text);
    };
    navigator.clipboard._mfHooked = true;
  }

  function initFPSCounter() {
    const saved = JSON.parse(localStorage.getItem('minifeather-fps-pos')) || { x: 12, y: 12 };
    const box = document.createElement('div');
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

    let frames = 0;
    let last = performance.now();
    let visible = true;

    document.addEventListener('visibilitychange', () => {
      visible = !document.hidden;
      if (visible) {
        last = performance.now();
        frames = 0;
      }
    });

    function loop(now) {
      if (visible) {
        frames++;
        if (now - last >= 1000) {
          const fps = frames;
          const color = fps >= 120 ? '#22c55e' : fps >= 60 ? '#facc15' : '#ef4444';
          box.innerHTML = `<span style="color:#7c3aed;">MF</span><span style="color:#4b5563;padding:0 6px;">•</span><span style="color:${color};">${fps}</span><span style="color:#9ca3af;"> FPS</span>`;
          frames = 0;
          last = now;
        }
      }
      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);

    let dragging = false;
    let offX = 0;
    let offY = 0;

    box.addEventListener('mousedown', event => {
      dragging = true;
      offX = event.clientX - box.offsetLeft;
      offY = event.clientY - box.offsetTop;
    });

    document.addEventListener('mousemove', event => {
      if (!dragging) return;
      box.style.left = `${event.clientX - offX}px`;
      box.style.top = `${event.clientY - offY}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      localStorage.setItem('minifeather-fps-pos', JSON.stringify({ x: box.offsetLeft, y: box.offsetTop }));
    });
  }

  function initCPSCounter() {
    if (document.getElementById('minifeather-cps')) return;

    let saved = { x: 12, y: 62 };
    try {
      const stored = JSON.parse(localStorage.getItem('minifeather-cps-pos'));
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) saved = stored;
    } catch (_) {}

    const box = document.createElement('div');
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

    let leftClicks = [];
    let rightClicks = [];

    function trimClicks(now) {
      leftClicks = leftClicks.filter(time => now - time < 1000);
      rightClicks = rightClicks.filter(time => now - time < 1000);
    }

    function render() {
      const now = performance.now();
      trimClicks(now);
      box.innerHTML = `<span style="color:#9ca3af;">${t('cpsLabel')}</span> <span style="color:#f8fafc;">${leftClicks.length}</span> <span style="color:#64748b;">|</span> <span style="color:#f8fafc;">${rightClicks.length}</span>`;
    }

    document.addEventListener('mousedown', event => {
      if (box.contains(event.target) || event.target.closest?.('#minifeather-fps, #minifeather-ping, #mf-keystrokes, #mf-gui')) return;
      const now = performance.now();
      if (event.button === 0) leftClicks.push(now);
      if (event.button === 2) rightClicks.push(now);
      render();
    }, true);

    const interval = setInterval(render, 100);
    window.addEventListener('beforeunload', () => clearInterval(interval), { once: true });
    render();

    let dragging = false;
    let offX = 0;
    let offY = 0;

    box.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      dragging = true;
      offX = event.clientX - box.offsetLeft;
      offY = event.clientY - box.offsetTop;
      event.preventDefault();
      event.stopPropagation();
    });

    document.addEventListener('mousemove', event => {
      if (!dragging) return;
      const x = Math.max(0, Math.min(event.clientX - offX, window.innerWidth - box.offsetWidth));
      const y = Math.max(0, Math.min(event.clientY - offY, window.innerHeight - box.offsetHeight));
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      localStorage.setItem('minifeather-cps-pos', JSON.stringify({ x: box.offsetLeft, y: box.offsetTop }));
    });
  }


  function initPingCounter() {
    if (document.getElementById('minifeather-ping')) return;

    let saved = { x: 12, y: 112 };
    try {
      const stored = JSON.parse(localStorage.getItem('minifeather-ping-pos'));
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) saved = stored;
    } catch (_) {}

    const box = document.createElement('div');
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

    let ping = null;
    let measuring = false;
    const samples = [];

    function render() {
      const value = Number.isFinite(ping) ? Math.max(0, Math.round(ping)) : null;
      const color = value === null ? '#94a3b8' : value <= 80 ? '#22c55e' : value <= 150 ? '#facc15' : '#ef4444';
      box.innerHTML = `<span style="color:#9ca3af;">${t('pingLabel')}</span> <span style="color:${color};">${value === null ? '--' : value}</span> <span style="color:#64748b;">ms</span>`;
    }

    function connectionRtt() {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const value = Number(connection?.rtt);
      return Number.isFinite(value) && value > 0 ? value : null;
    }

    async function measure() {
      if (measuring || !settings.pingCounter || document.hidden) return;
      if (!navigator.onLine) {
        ping = null;
        render();
        return;
      }

      measuring = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const started = performance.now();

      try {
        await fetch(`${location.origin}/favicon.ico?mf_ping=${Date.now()}`, {
          method: 'HEAD',
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal
        });

        const measured = performance.now() - started;
        samples.push(measured);
        if (samples.length > 5) samples.shift();

        const sorted = [...samples].sort((a, b) => a - b);
        ping = sorted[Math.floor(sorted.length / 2)];
      } catch (_) {
        ping = connectionRtt();
      } finally {
        clearTimeout(timeout);
        measuring = false;
        render();
      }
    }

    const initialRtt = connectionRtt();
    if (initialRtt !== null) ping = initialRtt;
    render();
    measure();

    const interval = setInterval(measure, 3000);
    window.addEventListener('online', measure);
    window.addEventListener('offline', () => {
      ping = null;
      render();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) measure();
    });
    window.addEventListener('beforeunload', () => clearInterval(interval), { once: true });

    let dragging = false;
    let offX = 0;
    let offY = 0;

    box.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      dragging = true;
      offX = event.clientX - box.offsetLeft;
      offY = event.clientY - box.offsetTop;
      event.preventDefault();
      event.stopPropagation();
    });

    document.addEventListener('mousemove', event => {
      if (!dragging) return;
      const x = Math.max(0, Math.min(event.clientX - offX, window.innerWidth - box.offsetWidth));
      const y = Math.max(0, Math.min(event.clientY - offY, window.innerHeight - box.offsetHeight));
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      localStorage.setItem('minifeather-ping-pos', JSON.stringify({ x: box.offsetLeft, y: box.offsetTop }));
    });
  }

  function initKeystrokes() {
    const savedPos = JSON.parse(localStorage.getItem('minifeather-keystroke-pos')) || { x: 20, y: 200 };

    if (!document.getElementById('minifeather-keystroke-css')) {
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

    const container = document.createElement('div');
    container.id = 'mf-keystrokes';
    container.style.cssText = `
      position:fixed;
      left:${savedPos.x}px;
      top:${savedPos.y}px;
      z-index:999997;
      display:flex;
      flex-direction:column;
      align-items:center;
      gap:5px;
      user-select:none;
      cursor:move;
    `;

    const buttons = {};
    const clickCounters = { LMB: [], RMB: [] };

    function makeKey(code, label, width, height, fontSize) {
      const element = document.createElement('div');
      element.className = 'mf-key';
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      element.style.fontSize = `${fontSize}px`;
      element.innerHTML = `<span>${label}</span>`;
      buttons[code] = element;
      return element;
    }

    function makeKeyWithCps(code, label, width, height, fontSize) {
      const element = makeKey(code, label, width, height, fontSize);
      const cps = document.createElement('span');
      cps.className = 'mf-cps';
      cps.textContent = '0';
      element.appendChild(cps);
      return element;
    }

    function updateCps(code) {
      const now = performance.now();
      clickCounters[code] = clickCounters[code].filter(time => now - time < 1000);
      const element = buttons[code];
      if (!element) return;
      const cps = element.querySelector('.mf-cps');
      if (cps) cps.textContent = clickCounters[code].length;
    }

    function makeRow(keys) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:5px;justify-content:center;';
      keys.forEach(key => row.appendChild(key));
      return row;
    }

    container.appendChild(makeRow([makeKey('KeyW', 'W', 52, 52, 17)]));
    container.appendChild(makeRow([
      makeKey('KeyA', 'A', 52, 52, 17),
      makeKey('KeyS', 'S', 52, 52, 17),
      makeKey('KeyD', 'D', 52, 52, 17)
    ]));
    container.appendChild(makeRow([
      makeKeyWithCps('LMB', 'L', 80, 36, 13),
      makeKeyWithCps('RMB', 'R', 80, 36, 13)
    ]));
    const space = makeKey('Space', 'SPACE', 165, 32, 11);
    space.style.letterSpacing = '2px';
    container.appendChild(space);
    document.body.appendChild(container);

    function activate(code) {
      const element = buttons[code];
      if (element) element.classList.add('active');
    }

    function deactivate(code) {
      const element = buttons[code];
      if (element) element.classList.remove('active');
    }

    document.addEventListener('keydown', event => {
      if (buttons[event.code]) activate(event.code);
    });

    document.addEventListener('keyup', event => {
      if (buttons[event.code]) deactivate(event.code);
    });

    document.addEventListener('mousedown', event => {
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
    });

    document.addEventListener('mouseup', event => {
      if (event.button === 0) deactivate('LMB');
      if (event.button === 2) deactivate('RMB');
    });

    setInterval(() => {
      updateCps('LMB');
      updateCps('RMB');
    }, 200);

    let dragging = false;
    let offX = 0;
    let offY = 0;

    container.addEventListener('mousedown', event => {
      dragging = true;
      offX = event.clientX - container.offsetLeft;
      offY = event.clientY - container.offsetTop;
    });

    document.addEventListener('mousemove', event => {
      if (!dragging) return;
      container.style.left = `${event.clientX - offX}px`;
      container.style.top = `${event.clientY - offY}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      localStorage.setItem('minifeather-keystroke-pos', JSON.stringify({ x: container.offsetLeft, y: container.offsetTop }));
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
        ... (31 KB left)
