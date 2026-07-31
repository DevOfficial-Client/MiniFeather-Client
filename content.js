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
    supportAds: false,
    discord: true,
    keystrokes: true,
    language: 'en'
  };

  const TRANSLATIONS = {
    en: {
      title: 'MiniFeather',
      subtitle: 'Minimal panel',
      shortcut: 'Right Shift',
      language: 'Language',
      tabClient: 'Client',
      tabSkins: 'Skins',
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
      discordRedirectDesc: 'Use the custom Kings SMP invite.',
      keystrokes: 'Keystrokes',
      keystrokesDesc: 'Show movement keys and CPS.',
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
      tabSkins: 'Skins',
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
      tabSkins: 'スキン',
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
      tabSkins: 'Skin',
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
              <label class="mf-toggle" id="mf-spritesheet-toggle">
                <span class="mf-toggle-copy">
                  <strong>${t('spritesheet')}</strong>
                  <span>${t('spritesheetDesc')}</span>
                </span>
                <input type="checkbox" id="mf-spritesheet-checkbox" class="mf-switch" checked>
              </label>
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
    replaceAllLogos();
    refreshLogoControls();
  }

  function resetLogo() {
    currentLogo = CONFIG.defaultLogo;
    chrome.storage.local.remove('customLogo', () => {
      replaceAllLogos();
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
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
    });

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
      });
      document.addEventListener('keyup', event => {
        if (event.code === 'ShiftRight') rightShiftDown = false;
      });
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
      const observer = new MutationObserver(() => {
        if (tryInject()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 15000);
    }
  }

  function applyGuiSettings() {
    const keystrokes = document.getElementById('mf-keystrokes');
    if (keystrokes) keystrokes.style.display = settings.keystrokes ? 'flex' : 'none';
    if (settings.supportAds) showAds();
    else blockAds();
  }

  function initChatFeatures() {
    const style = document.createElement('style');
    style.textContent = `
      .chat-gif { max-width:64px; max-height:64px; vertical-align:middle; border-radius:4px; display:inline-block; }
      .yt-wrapper { display:block; width:100%; max-width:320px; margin:6px 0; border-radius:8px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,.5); }
      .chat-meme-wrapper { display:block; width:100%; margin-top:5px; }
      .chat-meme-wrapper video { max-width:240px; border-radius:8px; }
    `;
    document.head.appendChild(style);

    const GIF_BASE = chrome.runtime.getURL('memes/gif/');
    const GIF_LIST = [
      '84-years.gif', '1000-yard-stare-cat-meme.gif', 'aaaah-cat.gif', 'beard-bear.gif',
      'cat-disgusted.gif', 'cat-meme.gif', 'cat-meme-cat.gif', 'chat-pouce.gif',
      'clappi-clappi-clappi.gif', 'devil-cat-evil.gif', 'hands-down-meme.gif', 'kermit.gif',
      'lfg-lets-go.gif', 'memes2022funny-meme.gif', 'question-emoji.gif', 'scary-cat.gif',
      'shocked-shocked-cat.gif', 'shrek-rizz-shrek-meme.gif', 'ugly-plankton-meme-ugly-plankton.gif'
    ];

    const gifCache = {};

    function getGif(name) {
      const key = name.toLowerCase();
      if (gifCache[key]) return gifCache[key];
      const file = GIF_LIST.find(entry => entry.toLowerCase() === key || entry.toLowerCase().replace(/\.gif$/, '') === key);
      gifCache[key] = file ? GIF_BASE + file : null;
      return gifCache[key];
    }

    const MEME_MAP = {
      'm-no': 'https://qu.ax/STWv.mp4',
      'm-que': 'https://qu.ax/WpYf.mp4',
      'm-si': 'https://qu.ax/pGis.mp4',
      'm-cry': 'https://qu.ax/mScl.mp4',
      'm-bye': 'https://qu.ax/NlCH.mp4'
    };

    const ytRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)[\w-]+[^ \n]*)/i;

    function findRealIndex(text, trigger) {
      let textIndex = 0;
      const cleanTrigger = trigger.replace(/-/g, '').replace(/:/g, '');
      const lowerText = text.toLowerCase().replace(/-/g, '').replace(/:/g, '');
      const cleanIndex = lowerText.indexOf(cleanTrigger);
      let count = 0;
      for (let i = 0; i < text.length && count < cleanIndex; i++) {
        const character = text[i].toLowerCase();
        if (character !== '-' && character !== ':') count++;
        textIndex = i + 1;
      }
      return textIndex;
    }

    function processNode(node) {
      if (!node || node.nodeType !== 3) return;
      const text = node.nodeValue;
      if (!text || text.length < 3) return;
      const parent = node.parentNode;
      if (!parent || parent.tagName === 'TEXTAREA' || parent.tagName === 'INPUT' || parent.isContentEditable) return;
      if (parent.dataset && parent.dataset.mfProcessed) return;

      let modified = false;
      const fragments = [];
      let remaining = text;

      while (remaining.length > 0) {
        const ytMatch = remaining.match(ytRegex);
        const gifMatch = remaining.match(/:([\w\d\-]+?)(?:\.gif)?:/i);
        const memeMatch = Object.keys(MEME_MAP).find(key => {
          const clean = key.replace(/-/g, '').replace(/:/g, '');
          return remaining.toLowerCase().replace(/-/g, '').replace(/:/g, '').includes(clean);
        });

        if (gifMatch && (!ytMatch || gifMatch.index <= ytMatch.index) && (!memeMatch || remaining.indexOf(gifMatch[0]) <= remaining.indexOf(memeMatch))) {
          if (gifMatch.index > 0) fragments.push({ type: 'text', value: remaining.substring(0, gifMatch.index) });
          const path = getGif(gifMatch[1]);
          if (path) {
            fragments.push({ type: 'gif', value: path, name: gifMatch[1] });
            modified = true;
          } else {
            fragments.push({ type: 'text', value: gifMatch[0] });
          }
          remaining = remaining.substring(gifMatch.index + gifMatch[0].length);
        } else if (ytMatch && (!memeMatch || ytMatch.index <= remaining.indexOf(memeMatch))) {
          if (ytMatch.index > 0) fragments.push({ type: 'text', value: remaining.substring(0, ytMatch.index) });
          let id = '';
          const url = ytMatch[1];
          if (url.includes('shorts/')) id = url.split('shorts/')[1].split(/[?#]/)[0];
          else if (url.includes('watch?v=')) id = url.split('watch?v=')[1].split(/[&?#]/)[0];
          else if (url.includes('youtu.be/')) id = url.split('youtu.be/')[1].split(/[?#]/)[0];
          else if (url.includes('embed/')) id = url.split('embed/')[1].split(/[?#]/)[0];
          if (id) {
            fragments.push({ type: 'yt', value: id });
            modified = true;
          } else {
            fragments.push({ type: 'text', value: ytMatch[0] });
          }
          remaining = remaining.substring(ytMatch.index + ytMatch[0].length);
        } else if (memeMatch) {
          const realIndex = findRealIndex(remaining, memeMatch);
          if (realIndex > 0) fragments.push({ type: 'text', value: remaining.substring(0, realIndex) });
          fragments.push({ type: 'meme', value: MEME_MAP[memeMatch] });
          modified = true;
          remaining = remaining.substring(realIndex + memeMatch.length);
        } else {
          fragments.push({ type: 'text', value: remaining });
          remaining = '';
        }
      }

      if (!modified) return;
      parent.dataset.mfProcessed = '1';
      const span = document.createElement('span');
      fragments.forEach(fragment => {
        if (fragment.type === 'text' && fragment.value) {
          span.appendChild(document.createTextNode(fragment.value));
        } else if (fragment.type === 'gif') {
          const image = document.createElement('img');
          image.src = fragment.value;
          image.className = 'chat-gif';
          image.alt = fragment.name;
          image.title = fragment.name;
          span.appendChild(image);
        } else if (fragment.type === 'yt') {
          const div = document.createElement('div');
          div.className = 'yt-wrapper';
          div.innerHTML = `<iframe width="100%" height="180" src="https://www.youtube.com/embed/${fragment.value}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
          span.appendChild(div);
        } else if (fragment.type === 'meme') {
          const div = document.createElement('div');
          div.className = 'chat-meme-wrapper';
          div.innerHTML = `<video src="${fragment.value}" style="max-width:240px;border-radius:8px;" autoplay controls></video>`;
          span.appendChild(div);
        }
      });
      parent.replaceChild(span, node);
    }

    function scan(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        processNode(node);
        return;
      }
      if (node.nodeType !== 1 || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
      if (node.dataset && node.dataset.mfProcessed) return;
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let current;
      while ((current = walker.nextNode())) nodes.push(current);
      nodes.forEach(processNode);
    }

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') mutation.addedNodes.forEach(scan);
        else if (mutation.type === 'characterData') scan(mutation.target);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function update() {
    if (settings.rebrand) {
      changeTitle();
      changeFavicon();
      replaceLogo();
      replaceBackground();
      if (settings.discord) {
        replaceDiscordInput();
        hideDiscordImage();
        changeDiscordButton();
        changeDiscordDescriptions();
        changeWelcomeText();
      }
    }
    if (!settings.supportAds) blockAds();
    else showAds();
    refreshLogoControls();
  }

  function init() {
    injectFont();
    initFPSCounter();
    initKeystrokes();
    initGUI();
    initChatFeatures();
    hookClipboard();
    injectFeatherButton();

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, { childList: true, subtree: true });

    update();
  }

  function boot() {
    chrome.storage.local.get(['settings', 'customLogo'], data => {
      settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      guiSettings = { ...settings };
      currentLogo = data.customLogo || CONFIG.defaultLogo;
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
      else init();
    });
  }

  boot();
})();
