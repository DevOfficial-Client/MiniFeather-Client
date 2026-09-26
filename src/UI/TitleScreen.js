(() => {
  'use strict';

  const KEY = '__MINIFEATHER_TITLE_SCREEN__';
  const CONFIG_EVENT = 'minifeather:titlescreen-config';
  const ROOT_CLASS = 'mf-classic-title';
  const FALLBACK_CLASS = 'mf-classic-title-fallback';
  const BUTTON_CLASS = 'mf-classic-title-button';
  const CARD_CLASS = 'mf-classic-title-card';
  const BACKGROUND_CLASS = 'mf-classic-title-background';
  const SHELL_CLASS = 'mf-classic-title-shell';
  const NAV_CLASS = 'mf-classic-title-nav';
  const NAV_ITEM_CLASS = 'mf-classic-title-nav-item';
  const CENTER_CLASS = 'mf-classic-title-center';
  const RIGHT_CLASS = 'mf-classic-title-right';
  const ACCOUNT_CLASS = 'mf-classic-title-account';
  const HIDDEN_CLASS = 'mf-classic-title-hidden';
  const SHADE_CLASS = 'mf-classic-title-shade';
  const CHOOSING_CLASS = 'mf-classic-title-choosing';
  const LAUNCH_CLASS = 'mf-classic-quicklaunch';
  const BG_URL = chrome.runtime.getURL('assets/classic/title.png');
  const LOGO_URL = chrome.runtime.getURL('assets/icon.png');
  const FONT_URL = chrome.runtime.getURL('assets/classic/Minecraft-Regular.otf');
  const MENU_WORDS = /\b(play|jugar|settings|ajustes|friends|amigos|party|shop|tienda|rankings|leaderboards|contact|survival|creative|skywars|eggwars|worlds|mundos|games|juegos|quick)\b/i;
  const SANDBOX_MODES = new Set(['survival', 'creative', 'superflat', 'plots']);
  const MODE_NAMES = {
    survival: 'Survival', creative: 'Creative', superflat: 'Superflat', plots: 'Plots',
    skywars: 'Skywars', eggwars: 'EggWars', pvp: 'Classic PvP', parkour: 'Parkour',
    'bridge-duels': 'Bridge Duels', kitpvp: 'KitPvP', 'one-in-the-quiver': 'One in the Quiver'
  };

  try { globalThis[KEY]?.destroy?.(); } catch (_) {}

  const state = {
    enabled: false, destroyed: false, root: null, style: null, observer: null,
    timer: 0, generation: 0, controls: new Set(), backgrounds: new Set(),
    originalImages: new Map(), layoutNodes: new Set(), created: [], layoutShell: null,
    choosing: false, language: 'en', logoUrl: LOGO_URL, logoImage: null,
    launchSignature: ''
  };

  function makeStyle() {
    const style = document.createElement('style');
    style.id = 'mf-classic-title-style';
    style.textContent = `
      @font-face{font-family:MFClassicTitle;src:url("${FONT_URL}") format("opentype");font-display:swap}
      #react.${ROOT_CLASS}{background-color:#0d0b15!important;color:#fff}
      #react.${ROOT_CLASS}.${FALLBACK_CLASS}{background-image:url("${BG_URL}")!important;background-position:center!important;background-size:cover!important;background-repeat:no-repeat!important}
      #react.${ROOT_CLASS}>canvas{display:none!important}
      #react.${ROOT_CLASS}>.${SHADE_CLASS}{display:none!important}
      #react.${ROOT_CLASS} .${BACKGROUND_CLASS}:not(img){background-image:url("${BG_URL}")!important;background-position:center!important;background-size:cover!important}
      #react.${ROOT_CLASS} .${SHELL_CLASS}{display:block!important;position:fixed!important;inset:0!important;width:100%!important;height:100%!important;pointer-events:none}
      #react.${ROOT_CLASS} .${NAV_CLASS}{display:block!important;position:fixed!important;left:22px!important;top:50%!important;transform:translateY(-50%)!important;width:190px!important;height:auto!important;z-index:5!important;pointer-events:auto}
      #react.${ROOT_CLASS} .${NAV_CLASS}>*{display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important;gap:7px!important;width:100%!important;height:auto!important;max-height:calc(100vh - 190px)!important;padding:0!important;overflow-y:auto!important;overflow-x:hidden!important}
      #react.${ROOT_CLASS} .${NAV_CLASS}>*>*{width:100%!important;min-width:0!important;height:auto!important;min-height:0!important;flex:none!important;margin:0!important}
      #react.${ROOT_CLASS} .${NAV_CLASS} .${NAV_ITEM_CLASS}{position:relative!important;width:100%!important;height:44px!important;min-height:44px!important;margin:0!important}
      #react.${ROOT_CLASS} .${NAV_CLASS} .chakra-stack{height:auto!important;min-height:0!important;justify-content:flex-start!important;gap:7px!important}
      #react.${ROOT_CLASS} .${NAV_CLASS} button{display:flex!important;position:relative!important;inset:auto!important;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;gap:10px!important;width:190px!important;max-width:190px!important;height:44px!important;padding:7px 12px!important;font-size:14px!important}
      #react.${ROOT_CLASS} .${NAV_CLASS} button svg{width:20px!important;height:20px!important;flex:none!important}
      #react.${ROOT_CLASS} .${NAV_CLASS} button>*{min-width:0}
      #react.${ROOT_CLASS} .${CENTER_CLASS}{display:none!important}
      #react.${ROOT_CLASS}.${CHOOSING_CLASS} .${NAV_CLASS}{display:none!important}
      #react.${ROOT_CLASS} .${RIGHT_CLASS}{display:block!important;position:fixed!important;right:24px!important;top:22px!important;width:300px!important;height:auto!important;padding:0!important;z-index:4!important;pointer-events:auto}
      #react.${ROOT_CLASS} .${RIGHT_CLASS} .${HIDDEN_CLASS}{display:none!important}
      #react.${ROOT_CLASS} .${ACCOUNT_CLASS}{width:100%!important;border:3px solid #000!important;border-radius:0!important;background:rgba(0,0,0,.4)!important;backdrop-filter:blur(4px)}
      #react.${ROOT_CLASS}.${CHOOSING_CLASS} .${RIGHT_CLASS}{display:none!important}
      #react.${ROOT_CLASS} .mf-classic-title-brand{position:fixed;left:22px;top:20px;z-index:6;display:flex;align-items:center;gap:12px;max-width:min(340px,48vw);height:58px;pointer-events:none}
      #react.${ROOT_CLASS}.${CHOOSING_CLASS} .mf-classic-title-brand{display:none}
      #react.${ROOT_CLASS} .mf-classic-title-logo{display:block;width:54px;height:54px;flex:none;object-fit:contain;border-radius:9px;image-rendering:auto;filter:drop-shadow(0 3px 4px rgba(0,0,0,.55))}
      #react.${ROOT_CLASS} .mf-classic-title-name{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#fff;font:700 clamp(20px,2.45vw,32px) MFClassicTitle,monospace;letter-spacing:.025em;text-shadow:2px 3px #000,0 0 12px rgba(0,0,0,.7)}
      #react.${ROOT_CLASS} .mf-classic-title-play,#react.${ROOT_CLASS} .mf-classic-title-back{position:fixed;z-index:6;pointer-events:auto;cursor:pointer;border:3px solid #000;border-radius:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);box-shadow:none;color:#fff;font:700 23px MFClassicTitle,monospace;text-shadow:1px 2px #000;letter-spacing:.04em;transition:background-color .13s ease}
      #react.${ROOT_CLASS} .mf-classic-title-play{left:50%;bottom:28px;transform:translateX(-50%);width:230px;height:68px}
      #react.${ROOT_CLASS} .mf-classic-title-back{display:none;right:24px;top:22px;z-index:8;width:48px;height:48px;font-size:25px}
      #react.${ROOT_CLASS}.${CHOOSING_CLASS} .mf-classic-title-play{display:none}
      #react.${ROOT_CLASS}.${CHOOSING_CLASS} .mf-classic-title-back{display:block}
      #react.${ROOT_CLASS} .mf-classic-title-play:hover,#react.${ROOT_CLASS} .mf-classic-title-back:hover{background:rgba(84,84,84,.6)}
      #react.${ROOT_CLASS} .mf-classic-title-play:focus-visible,#react.${ROOT_CLASS} .mf-classic-title-back:focus-visible{outline:3px solid #fff;outline-offset:4px}
      #react.${ROOT_CLASS} .${BUTTON_CLASS}{border:3px solid #000!important;border-radius:0!important;background:rgba(0,0,0,.4)!important;backdrop-filter:blur(4px);box-shadow:none!important;color:#fff!important;font-family:MFClassicTitle,monospace!important;font-weight:600!important;letter-spacing:.035em!important;text-shadow:1px 2px #000!important;transition:background-color .13s ease!important}
      #react.${ROOT_CLASS} .${BUTTON_CLASS}:hover:not(:disabled):not([aria-disabled="true"]){background:rgba(84,84,84,.6)!important}
      #react.${ROOT_CLASS} .${BUTTON_CLASS}:active:not(:disabled):not([aria-disabled="true"]){background:rgba(30,30,30,.75)!important}
      #react.${ROOT_CLASS} .${BUTTON_CLASS}:focus-visible,#react.${ROOT_CLASS} .${CARD_CLASS}:focus-visible{outline:3px solid #fff!important;outline-offset:3px}
      #react.${ROOT_CLASS} .${BUTTON_CLASS}:disabled,#react.${ROOT_CLASS} .${BUTTON_CLASS}[aria-disabled="true"]{opacity:.55;cursor:not-allowed}
      #react.${ROOT_CLASS} .${CARD_CLASS}{border:3px solid #000!important;border-radius:0!important;box-shadow:0 7px 20px rgba(0,0,0,.34)!important;transition:filter .13s ease!important}
      #react.${ROOT_CLASS} .${CARD_CLASS}:hover:not([aria-disabled="true"]){filter:brightness(1.13)}
      #react.${ROOT_CLASS} .${LAUNCH_CLASS}{display:none;position:fixed;inset:0;z-index:6;pointer-events:auto;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);color:#fff;font-family:MFClassicTitle,monospace}
      #react.${ROOT_CLASS}.${CHOOSING_CLASS} .${LAUNCH_CLASS}{display:block}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-scroll{box-sizing:border-box;max-width:1120px;height:100%;margin:0 auto;padding:24px 40px 50px;overflow-y:auto;overflow-x:hidden}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-heading{text-align:center;margin:0 64px 26px;font-size:clamp(23px,3vw,36px);line-height:1.25;text-shadow:2px 3px #000}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-hint{display:block;margin-top:8px;font-size:13px;font-weight:400;color:#d5d5d5;text-shadow:1px 1px #000}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-section{margin:22px 0 0}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-section-title{display:flex;align-items:center;justify-content:center;gap:9px;margin:0 0 12px;font-size:19px;text-align:center;text-shadow:1px 2px #000}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-section-title img{width:24px;height:24px;image-rendering:pixelated}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:0 6px}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-mode,#react.${ROOT_CLASS} .mf-classic-quicklaunch-action{position:relative;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;min-height:78px;overflow:hidden;border:3px solid #000;border-radius:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);color:#fff;font:700 21px MFClassicTitle,monospace;text-shadow:2px 2px #000;cursor:pointer;transition:border-color .15s ease,transform .15s ease}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-mode img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-mode::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,.5);transition:background-color .15s ease}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-mode span{position:relative;z-index:1;padding:6px 12px;text-align:center}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-mode:hover,#react.${ROOT_CLASS} .mf-classic-quicklaunch-action:hover{border-color:#fff;transform:scale(1.025)}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-mode:hover::after{background:rgba(0,0,0,.16)}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-mode:focus-visible,#react.${ROOT_CLASS} .mf-classic-quicklaunch-action:focus-visible{outline:3px solid #fff;outline-offset:2px}
      #react.${ROOT_CLASS} .mf-classic-quicklaunch-empty{text-align:center;color:#ddd;font-size:14px;padding:22px}
      @media(max-width:800px){#react.${ROOT_CLASS} .${NAV_CLASS}{left:10px!important;width:140px!important}#react.${ROOT_CLASS} .${NAV_CLASS} .${NAV_ITEM_CLASS}{height:38px!important;min-height:38px!important}#react.${ROOT_CLASS} .${NAV_CLASS} button{width:140px!important;max-width:140px!important;height:38px!important;font-size:11px!important}#react.${ROOT_CLASS} .${RIGHT_CLASS}{right:10px!important;width:230px!important}#react.${ROOT_CLASS} .mf-classic-title-brand{left:10px;top:10px;max-width:220px;height:44px;gap:8px}#react.${ROOT_CLASS} .mf-classic-title-logo{width:42px;height:42px}#react.${ROOT_CLASS} .mf-classic-title-name{font-size:20px}#react.${ROOT_CLASS} .mf-classic-title-play{width:160px;height:50px;font-size:17px}#react.${ROOT_CLASS} .mf-classic-title-back{right:12px;top:12px}#react.${ROOT_CLASS} .mf-classic-quicklaunch-scroll{padding:20px 14px 40px}#react.${ROOT_CLASS} .mf-classic-quicklaunch-grid{grid-template-columns:1fr}#react.${ROOT_CLASS} .mf-classic-quicklaunch-mode,#react.${ROOT_CLASS} .mf-classic-quicklaunch-action{min-height:68px;font-size:17px}}
      @media(max-height:600px){#react.${ROOT_CLASS} .${NAV_CLASS}{top:90px!important;transform:none!important}#react.${ROOT_CLASS} .${NAV_CLASS}>*{max-height:calc(100vh - 160px)!important}#react.${ROOT_CLASS} .mf-classic-title-play{bottom:12px;height:48px}}
      @media(prefers-reduced-motion:reduce){#react.${ROOT_CLASS} .${BUTTON_CLASS},#react.${ROOT_CLASS} .${CARD_CLASS},#react.${ROOT_CLASS} .mf-classic-title-play,#react.${ROOT_CLASS} .mf-classic-title-back{transition:none!important}}
    `;
    return style;
  }

  function removeLayout() {
    for (const [element, className] of state.layoutNodes) element.classList.remove(className);
    state.layoutNodes.clear();
    for (const element of state.created) element.remove();
    state.created = [];
    state.launchSignature = '';
    state.logoImage = null;
    state.layoutShell = null;
    state.choosing = false;
    state.root?.classList.remove(CHOOSING_CLASS);
  }

  function restore() {
    removeLayout();
    state.root?.classList.remove(ROOT_CLASS, FALLBACK_CLASS);
    state.root = null;
    for (const control of state.controls) {
      control.classList.remove(BUTTON_CLASS, CARD_CLASS);
    }
    state.controls.clear();
    for (const background of state.backgrounds) background.classList.remove(BACKGROUND_CLASS);
    state.backgrounds.clear();
    for (const [image, original] of state.originalImages) {
      if (image.getAttribute('src') === BG_URL) image.setAttribute('src', original);
    }
    state.originalImages.clear();
  }

  function labelOf(element) {
    return String(element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 90);
  }

  function visibleRect(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth ? rect : null;
  }

  function findMenuControls(root) {
    const candidates = [...root.querySelectorAll('button,[role="button"]')].filter(element => {
      if (element.classList.contains('mf-classic-title-play') || element.classList.contains('mf-classic-title-back')) return false;
      if (element.closest(`[role="dialog"],[aria-modal="true"],#mf-gui,.${LAUNCH_CLASS}`)) return false;
      const rect = visibleRect(element);
      return rect && rect.width >= 85 && rect.height >= 26 && labelOf(element).length > 0;
    });
    const recognizable = candidates.filter(element => MENU_WORDS.test(labelOf(element)));
    return recognizable.length >= 2 || candidates.length >= 5 ? candidates : [];
  }

  function mark(element, className) {
    if (!element || element.classList.contains(className)) return;
    element.classList.add(className);
    state.layoutNodes.add([element, className]);
  }

  function findLayout(root) {
    for (const shell of root.children || []) {
      if (shell.children.length !== 3) continue;
      const panels = [...shell.children];
      const center = panels.find(panel => panel.querySelectorAll('a[href^="/game/"]').length >= 2);
      if (!center || center.querySelectorAll('[role="button"]').length < 3) continue;
      const nav = panels.find(panel => panel !== center && panel.querySelectorAll('button').length >= 5);
      const right = panels.find(panel => panel !== center && panel !== nav && panel.querySelector('button'));
      if (!nav || !right) continue;
      return { shell, nav, center, right };
    }
    return null;
  }

  function updateLabels() {
    const dictionary = globalThis.MINIFEATHER_TRANSLATIONS?.[state.language] ||
      globalThis.MINIFEATHER_TRANSLATIONS?.en || {};
    const play = state.created.find(element => element.className === 'mf-classic-title-play');
    const back = state.created.find(element => element.className === 'mf-classic-title-back');
    if (play) play.textContent = `>> ${dictionary.classicTitlePlay || 'Play'} <<`;
    if (back) {
      back.textContent = '×';
      back.setAttribute('aria-label', dictionary.classicTitleBack || 'Back');
    }
    if (state.root) refreshQuickLaunch(findLayout(state.root), dictionary);
  }

  function collectModes(center) {
    const modes = new Map();
    for (const link of center.querySelectorAll('a[href^="/game/"]')) {
      const href = link.getAttribute('href') || '';
      if (!/^\/game\/[a-z0-9-]+$/.test(href) || modes.has(href)) continue;
      const slug = href.slice('/game/'.length);
      const image = link.querySelector('img');
      modes.set(href, {
        href, slug,
        name: MODE_NAMES[slug] || slug.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' '),
        image: image?.currentSrc || image?.src || image?.getAttribute('src') || ''
      });
    }
    return [...modes.values()];
  }

  function section(scroll, title, icon) {
    const wrapper = document.createElement('section');
    wrapper.className = 'mf-classic-quicklaunch-section';
    const heading = document.createElement('h2');
    heading.className = 'mf-classic-quicklaunch-section-title';
    const artwork = document.createElement('img');
    artwork.src = chrome.runtime.getURL(`assets/ui/${icon}.png`);
    artwork.alt = '';
    const label = document.createElement('span');
    label.textContent = title;
    heading.append(artwork, label);
    const grid = document.createElement('div');
    grid.className = 'mf-classic-quicklaunch-grid';
    wrapper.append(heading, grid);
    scroll.append(wrapper);
    return grid;
  }

  function refreshQuickLaunch(layout, dictionary) {
    const launch = state.created.find(element => element.className === LAUNCH_CLASS);
    if (!layout || !launch) return;
    const modes = collectModes(layout.center);
    const browse = [...layout.nav.querySelectorAll('button')].find(button =>
      /planets|planetas|plan[eè]tes|planeten|惑星|행성|планеты|行星|星球/i.test(labelOf(button)));
    const signature = JSON.stringify([state.language, !!browse, modes.map(mode => [mode.href, mode.image])]);
    if (signature === state.launchSignature) return;
    state.launchSignature = signature;
    const oldScroll = launch.firstElementChild?.scrollTop || 0;
    const scroll = document.createElement('div');
    scroll.className = 'mf-classic-quicklaunch-scroll';
    const heading = document.createElement('h1');
    heading.className = 'mf-classic-quicklaunch-heading';
    heading.textContent = dictionary.classicQuickLaunch || 'Quick Launch';
    const hint = document.createElement('span');
    hint.className = 'mf-classic-quicklaunch-hint';
    hint.textContent = dictionary.classicLaunchHint || 'Click a mode to play or browse planets.';
    heading.append(hint);
    scroll.append(heading);
    if (browse) {
      const grid = section(scroll, dictionary.classicLaunchPlanets || 'Planets', 'world');
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'mf-classic-quicklaunch-action';
      action.textContent = dictionary.classicLaunchBrowse || 'Browse Planets';
      action.addEventListener('click', () => {
        const target = [...layout.nav.querySelectorAll('button')].find(button =>
          /planets|planetas|plan[eè]tes|planeten|惑星|행성|планеты|行星|星球/i.test(labelOf(button)));
        target?.click();
      });
      grid.append(action);
    }
    const addModes = (title, icon, entries) => {
      if (!entries.length) return;
      const grid = section(scroll, title, icon);
      for (const mode of entries) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mf-classic-quicklaunch-mode';
        button.setAttribute('data-mf-mode', mode.slug);
        grid.append(button);
        if (mode.image) {
          const image = document.createElement('img');
          image.src = mode.image;
          image.alt = '';
          image.loading = 'lazy';
          button.append(image);
        }
        const label = document.createElement('span');
        label.textContent = mode.name;
        button.append(label);
        button.addEventListener('click', () => {
          const nativeLink = [...layout.center.querySelectorAll('a[href^="/game/"]')]
            .find(link => link.getAttribute('href') === mode.href);
          nativeLink?.click();
        });
      }
    };
    addModes(dictionary.classicLaunchSandbox || 'Sandbox', 'home', modes.filter(mode => SANDBOX_MODES.has(mode.slug)));
    addModes(dictionary.classicLaunchMinigames || 'Minigames', 'grid', modes.filter(mode => !SANDBOX_MODES.has(mode.slug)));
    if (!modes.length) {
      const empty = document.createElement('p');
      empty.className = 'mf-classic-quicklaunch-empty';
      empty.textContent = dictionary.classicLaunchLoading || 'Loading modes…';
      scroll.append(empty);
    }
    launch.replaceChildren(scroll);
    scroll.scrollTop = oldScroll;
  }

  function updateLogo(url) {
    state.logoUrl = typeof url === 'string' && url.trim() ? url : LOGO_URL;
    if (state.logoImage && state.logoImage.src !== state.logoUrl) state.logoImage.src = state.logoUrl;
  }

  function applyLayout(root) {
    const layout = findLayout(root);
    if (!layout) { removeLayout(); return; }
    if (state.layoutShell && state.layoutShell !== layout.shell) {
      const choosing = state.choosing;
      removeLayout();
      state.choosing = choosing;
    }
    state.layoutShell = layout.shell;
    mark(layout.shell, SHELL_CLASS);
    const shade = layout.shell.previousElementSibling;
    if (shade?.tagName === 'DIV' && !shade.querySelector('button')) {
      const bounds = shade.getBoundingClientRect();
      if (bounds.width >= innerWidth * .9 && bounds.height >= innerHeight * .9) mark(shade, SHADE_CLASS);
    }
    mark(layout.nav, NAV_CLASS);
    mark(layout.center, CENTER_CLASS);
    mark(layout.right, RIGHT_CLASS);
    for (const button of layout.nav.querySelectorAll('button')) {
      mark(button.parentElement, NAV_ITEM_CLASS);
      button.classList.add(BUTTON_CLASS);
      state.controls.add(button);
    }
    const rightStack = layout.right.firstElementChild;
    if (rightStack) {
      mark(rightStack.firstElementChild, ACCOUNT_CLASS);
      for (const sibling of [...rightStack.children].slice(1)) mark(sibling, HIDDEN_CLASS);
      for (const sibling of [...layout.right.children].slice(1)) mark(sibling, HIDDEN_CLASS);
    }
    if (state.created.length && state.created.every(element => element.parentElement === root)) {
      updateLabels();
      return;
    }
    for (const element of state.created) element.remove();
    state.created = [];
    state.launchSignature = '';
    const brand = document.createElement('div');
    brand.className = 'mf-classic-title-brand';
    const logo = document.createElement('img');
    logo.className = 'mf-classic-title-logo';
    logo.src = state.logoUrl;
    logo.alt = 'MiniFeather';
    const name = document.createElement('span');
    name.className = 'mf-classic-title-name';
    name.textContent = 'MiniFeather';
    brand.append(logo, name);
    state.logoImage = logo;
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'mf-classic-title-play';
    play.addEventListener('click', () => {
      state.choosing = true;
      root.classList.add(CHOOSING_CLASS);
    });
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'mf-classic-title-back';
    back.addEventListener('click', () => {
      state.choosing = false;
      root.classList.remove(CHOOSING_CLASS);
    });
    const launch = document.createElement('div');
    launch.className = LAUNCH_CLASS;
    root.append(brand, play, back, launch);
    state.created = [brand, play, back, launch];
    updateLabels();
    root.classList.toggle(CHOOSING_CLASS, state.choosing);
  }

  function themeBackground(root) {
    const minWidth = innerWidth * .65;
    const minHeight = innerHeight * .65;
    for (const image of root.querySelectorAll('img')) {
      const rect = visibleRect(image);
      if (!rect || rect.width < minWidth || rect.height < minHeight) continue;
      if (image.getAttribute('src') !== BG_URL) {
        state.originalImages.set(image, image.getAttribute('src') || '');
        image.setAttribute('src', BG_URL);
      }
      state.backgrounds.add(image);
      return true;
    }
    for (const element of root.querySelectorAll('[style*="background-image"]')) {
      const rect = visibleRect(element);
      if (!rect || rect.width < minWidth || rect.height < minHeight) continue;
      element.classList.add(BACKGROUND_CLASS);
      state.backgrounds.add(element);
      return true;
    }
    return false;
  }

  function sync() {
    state.timer = 0;
    if (!state.enabled || state.destroyed) return;
    const root = document.getElementById('react');
    const onHome = location.pathname === '/' || location.pathname === '/index.html';
    // The native menu is deliberately hidden while Quick Launch is open.
    // Keep its controls until the chooser closes; visibility is not a sign
    // that the home screen disappeared.
    const controls = onHome && root
      ? state.choosing && state.root === root && findLayout(root)
        ? [...state.controls]
        : findMenuControls(root)
      : [];
    if (!controls.length) { restore(); return; }
    if (state.root && state.root !== root) restore();
    state.root = root;
    root.classList.add(ROOT_CLASS);
    const active = new Set(controls);
    for (const old of state.controls) {
      if (active.has(old)) continue;
      old.classList.remove(BUTTON_CLASS, CARD_CLASS);
      state.controls.delete(old);
    }
    for (const control of controls) {
      const isButton = control.tagName === 'BUTTON';
      control.classList.add(isButton ? BUTTON_CLASS : CARD_CLASS);
      state.controls.add(control);
    }
    applyLayout(root);
    root.classList[themeBackground(root) ? 'remove' : 'add'](FALLBACK_CLASS);
  }

  function schedule() {
    if (!state.enabled || state.destroyed || state.timer) return;
    if (!state.root && location.pathname !== '/' && location.pathname !== '/index.html') return;
    state.timer = setTimeout(sync, 120);
  }

  function setEnabled(enabled) {
    if (state.destroyed || state.enabled === enabled) return;
    state.enabled = enabled;
    if (!enabled) {
      clearTimeout(state.timer);
      state.timer = 0;
      state.observer?.disconnect();
      state.observer = null;
      restore();
      state.style?.remove();
      state.style = null;
      return;
    }
    state.style = makeStyle();
    (document.head || document.documentElement).appendChild(state.style);
    state.observer = new MutationObserver(schedule);
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
    sync();
  }

  function onConfig(event) {
    let detail = event.detail;
    try { if (typeof detail === 'string') detail = JSON.parse(detail); } catch (_) { return; }
    if (typeof detail?.enabled !== 'boolean') return;
    state.generation++;
    if (typeof detail.language === 'string') state.language = detail.language;
    if (typeof detail.logo === 'string') updateLogo(detail.logo);
    setEnabled(detail.enabled);
    updateLabels();
  }

  function onStorage(changes, area) {
    if (area !== 'local') return;
    if (Object.prototype.hasOwnProperty.call(changes, 'customLogo')) updateLogo(changes.customLogo?.newValue);
    if (!changes.settings) return;
    state.generation++;
    if (typeof changes.settings.newValue?.language === 'string') state.language = changes.settings.newValue.language;
    setEnabled(changes.settings.newValue?.classicTitle === true);
    updateLabels();
  }

  function destroy() {
    if (state.destroyed) return;
    setEnabled(false);
    state.destroyed = true;
    document.removeEventListener(CONFIG_EVENT, onConfig);
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('popstate', schedule);
    window.removeEventListener('hashchange', schedule);
    try { chrome.storage.onChanged.removeListener(onStorage); } catch (_) {}
    if (globalThis[KEY]?.destroy === destroy) delete globalThis[KEY];
  }

  function onKeydown(event) {
    if (event.key !== 'Escape' || !state.choosing || !state.root) return;
    state.choosing = false;
    state.root.classList.remove(CHOOSING_CLASS);
  }

  document.addEventListener(CONFIG_EVENT, onConfig);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  try {
    chrome.storage.onChanged.addListener(onStorage);
    const generation = state.generation;
    chrome.storage.local.get(['settings', 'customLogo'], data => {
      if (state.destroyed || generation !== state.generation) return;
      updateLogo(data?.customLogo);
      if (typeof data?.settings?.language === 'string') state.language = data.settings.language;
      setEnabled(data?.settings?.classicTitle === true);
    });
  } catch (_) {}
  globalThis[KEY] = { enable: () => setEnabled(true), disable: () => setEnabled(false), destroy };
})();
