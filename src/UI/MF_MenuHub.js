(function () {
  'use strict';

  const KEY = '__MINIFEATHER_MENU_HUB__';
  const CONFIG_EVENT = 'minifeather:menuhub-config';
  const ROOT_CLASS = 'mf-hub';
  const EXPANDED_CLASS = 'mf-hub-expanded';
  const SHELL_CLASS = 'mf-hub-shell';
  const NAV_CLASS = 'mf-hub-nav';
  const CENTER_CLASS = 'mf-hub-center';
  const RIGHT_CLASS = 'mf-hub-right';
  const HUB_ID = 'mf-hub-root';
  const PINS_KEY = 'mf_menuhub_pins_v1';
  // el fondo nativo es un <img> hijo directo de #react y las particulas un <canvas> hermano;
  // mismo supuesto que usa classic title para pintar su fondo, si cambian no pasa nada feo.
  const BG_SELECTOR = '#react > img';
  const PARTICLES_SELECTOR = '#react > canvas';
  // por debajo de esto el hub estorba mas de lo que ayuda (APK/tablets): pantalla nativa
  const MIN_WIDTH = 1100;

  try { globalThis[KEY]?.destroy?.(); } catch (_) {}

  const state = {
    enabled: false, destroyed: false, root: null, style: null, observer: null,
    timer: 0, marks: new Set(), hub: null, expanded: false, layoutRight: null,
    language: 'en', pins: readPins(), nav: new Map(), sections: [], games: [],
    recentCard: null, signature: '', prevSignature: '', chipLastSeen: 0, chipLastPaint: 0
  };

  const L10N = {
    en: { home: 'Home', play: 'Play', social: 'Social', mods: 'Mods', shop: 'Shop', more: 'More', settings: 'Settings',
      continue: 'Continue playing', favorites: 'Favorites', discover: 'Discover', viewAll: 'View all',
      recent: 'Recent worlds', topGames: 'Top games', custom: 'Custom games', planets: 'My planets',
      friends: 'Friends', messages: 'Messages', online: 'online', pick: 'Pin your favorites',
      popular: 'Popular now', unpin: 'Unpin', pin: 'Pin' },
    es: { home: 'Inicio', play: 'Jugar', social: 'Social', mods: 'Mods', shop: 'Tienda', more: 'Más', settings: 'Ajustes',
      continue: 'Seguir jugando', favorites: 'Favoritos', discover: 'Descubrir', viewAll: 'Ver todo',
      recent: 'Mundos recientes', topGames: 'Top juegos', custom: 'Personalizados', planets: 'Mis planetas',
      friends: 'Amigos', messages: 'Mensajes', online: 'en línea', pick: 'Fija tus favoritos',
      popular: 'Popular ahora', unpin: 'Quitar', pin: 'Fijar' },
    ja: { home: 'ホーム', play: 'プレイ', social: 'ソーシャル', mods: 'Mod', shop: 'ショップ', more: 'もっと', settings: '設定',
      continue: 'プレイ再開', favorites: 'お気に入り', discover: '見つける', viewAll: 'すべて表示',
      recent: '最近のワールド', topGames: '人気ゲーム', custom: 'カスタム', planets: 'マイ惑星',
      friends: 'フレンド', messages: 'メッセージ', online: 'オンライン', pick: 'お気に入りを固定',
      popular: '人気', unpin: '外す', pin: '固定' },
    it: { home: 'Home', play: 'Gioca', social: 'Social', mods: 'Mod', shop: 'Negozio', more: 'Altro', settings: 'Impostazioni',
      continue: 'Continua a giocare', favorites: 'Preferiti', discover: 'Scopri', viewAll: 'Vedi tutto',
      recent: 'Mondi recenti', topGames: 'Gioco top', custom: 'Personalizzati', planets: 'Pianeti miei',
      friends: 'Amici', messages: 'Messaggi', online: 'online', pick: 'Fissa i preferiti',
      popular: 'Popolari', unpin: 'Rimuovi', pin: 'Fissa' },
    zh: { home: '主页', play: '开始', social: '社交', mods: '模组', shop: '商店', more: '更多', settings: '设置',
      continue: '继续游戏', favorites: '收藏', discover: '发现', viewAll: '查看全部',
      recent: '最近的世界', topGames: '热门游戏', custom: '自定义', planets: '我的星球',
      friends: '好友', messages: '消息', online: '在线', pick: '固定收藏',
      popular: '热门', unpin: '取消', pin: '固定' },
    fr: { home: 'Accueil', play: 'Jouer', social: 'Social', mods: 'Mods', shop: 'Boutique', more: 'Plus', settings: 'Paramètres',
      continue: 'Reprendre', favorites: 'Favoris', discover: 'Découvrir', viewAll: 'Tout afficher',
      recent: 'Mondes récents', topGames: 'Top jeux', custom: 'Personnalisés', planets: 'Mes planètes',
      friends: 'Amis', messages: 'Messages', online: 'en ligne', pick: 'Épingle tes favoris',
      popular: 'Populaires', unpin: 'Détacher', pin: 'Épingler' },
    de: { home: 'Start', play: 'Spielen', social: 'Sozial', mods: 'Mods', shop: 'Shop', more: 'Mehr', settings: 'Einstellungen',
      continue: 'Weiterspielen', favorites: 'Favoriten', discover: 'Entdecken', viewAll: 'Alle anzeigen',
      recent: 'Neue Welten', topGames: 'Top-Spiele', custom: 'Benutzerdefiniert', planets: 'Meine Planeten',
      friends: 'Freunde', messages: 'Nachrichten', online: 'online', pick: 'Favoriten anheften',
      popular: 'Beliebt', unpin: 'Lösen', pin: 'Anheften' },
    pt: { home: 'Início', play: 'Jogar', social: 'Social', mods: 'Mods', shop: 'Loja', more: 'Mais', settings: 'Ajustes',
      continue: 'Continuar jogando', favorites: 'Favoritos', discover: 'Descobrir', viewAll: 'Ver tudo',
      recent: 'Mundos recentes', topGames: 'Top jogos', custom: 'Personalizados', planets: 'Meus planetas',
      friends: 'Amigos', messages: 'Mensagens', online: 'online', pick: 'Fixe seus favoritos',
      popular: 'Populares', unpin: 'Remover', pin: 'Fixar' },
    ru: { home: 'Главная', play: 'Играть', social: 'Соцсеть', mods: 'Моды', shop: 'Магазин', more: 'Ещё', settings: 'Настройки',
      continue: 'Продолжить игру', favorites: 'Избранное', discover: 'Обзор', viewAll: 'Показать всё',
      recent: 'Недавние миры', topGames: 'Топ игр', custom: 'Пользовательские', planets: 'Мои планеты',
      friends: 'Друзья', messages: 'Сообщения', online: 'в сети', pick: 'Закрепите избранное',
      popular: 'Популярное', unpin: 'Открепить', pin: 'Закрепить' },
    ko: { home: '홈', play: '플레이', social: '소셜', mods: '모드', shop: '상점', more: '더보기', settings: '설정',
      continue: '이어서 플레이', favorites: '즐겨찾기', discover: '둘러보기', viewAll: '모두 보기',
      recent: '최근 월드', topGames: '인기 게임', custom: '커스텀', planets: '내 행성',
      friends: '친구', messages: '메시지', online: '온라인', pick: '즐겨찾기 고정',
      popular: '인기', unpin: '고정 해제', pin: '고정' }
  };

  const MODE_NAMES = {
    survival: 'Survival', creative: 'Creative', superflat: 'Superflat', plots: 'Plots',
    skywars: 'Skywars', eggwars: 'EggWars', pvp: 'Classic PvP', parkour: 'Parkour',
    'bridge-duels': 'Bridge Duels', kitpvp: 'KitPvP', 'one-in-the-quiver': 'One in the Quiver'
  };

  // los botones nativos se reconocen por texto porque el sitio se localiza solo;
  // mismos regex multilenguaje que ya usa classic title para planets.
  const NAV_MATCHERS = {
    settings: /settings|ajustes|configuraci|impostazioni|設定|设置|einstellungen|paramètres|настройки|설정/i,
    social: /social|friends|amigos|amici|フレンド|好友|freunde|amis|друзья|친구/i,
    messages: /messages|mensajes|messaggi|メッセージ|消息|nachrichten|сообщения|메시지/i,
    planets: /planets|planetas|pianeti|惑星|行星|planeten|planètes|планеты|행성/i,
    achievements: /achievements|logros|successi|実績|成就|leistungen|succès|достижения|업적/i,
    shop: /shop|tienda|negozio|ショップ|商店|laden|boutique|магазин|상점/i,
    rankings: /rankings|leaderboards|clasificaciones|classifiche|ランキング|排行榜|ranglisten|classements|рейтинги|순위/i,
    unlocked: /unlocked|desbloqueado|sbloccato|アンロック|解锁|freigeschaltet|déverrouillé|разблокиров|잠금/i,
    users: /users|usuarios|utenti|ユーザー|用户|benutzer|utilisateurs|пользователи|사용자/i,
    news: /news|noticias|notizie|ニュース|新闻|neuheiten|nouvelles|новости|뉴스/i,
    more: /^more$|^más$|^mais$|^altro$|^mehr$|^plus$|^ещё$|^더보기$|^もっと$|^更多$/i
  };

  function readPins() {
    try {
      const raw = JSON.parse(localStorage.getItem(PINS_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(slug => typeof slug === 'string').slice(0, 12) : [];
    } catch (_) { return []; }
  }

  function writePins() {
    try { localStorage.setItem(PINS_KEY, JSON.stringify(state.pins)); } catch (_) {}
  }

  function t(key) {
    const dict = L10N[state.language] || L10N.en;
    return dict[key] ?? L10N.en[key] ?? key;
  }

  function labelOf(element) {
    return String(element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 90);
  }

  function makeStyle() {
    const style = document.createElement('style');
    style.id = 'mf-hub-style';
    style.textContent = `
      #react.${ROOT_CLASS} .${NAV_CLASS}{display:none!important}
      #react.${ROOT_CLASS}:not(.${EXPANDED_CLASS}) .${CENTER_CLASS}{display:none!important}
      #react.${EXPANDED_CLASS} #${HUB_ID} .mf-hub-main,
      #react.${EXPANDED_CLASS} #${HUB_ID} .mf-hub-aside{display:none}
      #react.${ROOT_CLASS} > img{filter:blur(9px) brightness(.58) saturate(.9)!important;transform:scale(1.07)!important}
      #react.${ROOT_CLASS} > canvas{opacity:.4!important;filter:blur(2px) brightness(.8)!important}
      #react.${ROOT_CLASS}:not(.${EXPANDED_CLASS}) .${RIGHT_CLASS}{position:fixed!important;right:20px!important;top:20px!important;width:320px!important;height:auto!important;max-height:calc(100vh - 44px);overflow:hidden auto;scrollbar-width:none}
      #react.${ROOT_CLASS}:not(.${EXPANDED_CLASS}) .${RIGHT_CLASS}::-webkit-scrollbar{display:none}
      #react.${ROOT_CLASS}:not(.${EXPANDED_CLASS}) .${RIGHT_CLASS}>*:not(:first-child){display:none!important}
      #react.${ROOT_CLASS}:not(.${EXPANDED_CLASS}) .${RIGHT_CLASS}>*:first-child>*:not(:first-child){display:none!important}
      /* el chip va vertical estilo perfil movil: datos arriba en su cajita y el personaje
         grande DEBAJO pero DENTRO de la tarjeta (el piso de la pantalla quedo descartado).
         el sync pinta .mf-hub-chiprow/.mf-hub-chipinfo/.mf-hub-chipavatar segun donde esten
         HOY los nodos, porque el nesting cambia bajo tus pies */
      #react.${ROOT_CLASS}:not(.${EXPANDED_CLASS}) .mf-hub-chiprow{display:flex!important;flex-direction:column!important;align-items:center!important;gap:8px!important}
      #react.${ROOT_CLASS}:not(.${EXPANDED_CLASS}) .mf-hub-chipextra{display:none!important}
      #react.${ROOT_CLASS}:not(.${EXPANDED_CLASS}) .mf-hub-chipinfo{border:2px solid rgba(0,0,0,.75)!important;border-radius:10px!important;background:rgba(10,12,16,.62)!important;backdrop-filter:blur(7px);padding:12px!important;align-self:stretch!important}
      /* caja del avatar en flujo pero RELATIVE: los badges de nivel/racha y la ventana del
         render son absolute con offsets negativos y dependen de este ancla; forzarla static
         los suelta y terminan flotando donde sea (bug del rectangulo azul del 2026-10-05) */
      #react.${ROOT_CLASS}:not(.${EXPANDED_CLASS}) .${RIGHT_CLASS} .mf-hub-chipavatar{position:relative!important;top:auto!important;left:auto!important;right:auto!important;bottom:auto!important;width:150px!important;height:245px!important;flex:none!important;align-self:center!important;overflow:visible!important;border:none!important;border-radius:0!important;background:transparent!important}
      /* ventana(s) absolutas entre el canvas y la caja: llenan la caja pero SIN recortar
         (overflow:hidden nativo) ni pintar su borde de nivel encima del personaje */
      #react.${ROOT_CLASS}:not(.${EXPANDED_CLASS}) .${RIGHT_CLASS} .mf-hub-chipwindow{position:absolute!important;inset:0!important;width:auto!important;height:auto!important;overflow:visible!important;border:none!important;border-radius:0!important;padding:0!important;background:transparent!important}
      #react.${ROOT_CLASS}:not(.${EXPANDED_CLASS}) .${RIGHT_CLASS}>*:first-child>div,
      #react.${ROOT_CLASS}:not(.${EXPANDED_CLASS}) .${RIGHT_CLASS}>*:first-child>div>div{flex-direction:column!important;align-items:center!important}
      /* el transform del canvas lo escribe JS en cada sync (fitChipCanvas): medir en CSS
         fijo no sirve porque el sitio cambia el tamano base del render entre versions */
      #react.${ROOT_CLASS}.${EXPANDED_CLASS} .${RIGHT_CLASS}>*{background:rgba(10,12,16,.55)!important;backdrop-filter:blur(6px);border-radius:10px!important}

      #${HUB_ID}{position:fixed;inset:0;z-index:6;pointer-events:none;font-family:inherit;color:#fff}
      #${HUB_ID}::before{content:"";position:absolute;inset:0;pointer-events:none;
        background:radial-gradient(130% 100% at 50% 0%,rgba(0,0,0,.12) 0%,rgba(0,0,0,.32) 60%,rgba(0,0,0,.52) 100%)}
      #${HUB_ID} .mf-hub-rail{position:absolute;left:16px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:7px;pointer-events:auto;width:74px;align-items:center}
      #${HUB_ID} .mf-hub-brand{display:flex;flex-direction:column;align-items:center;gap:4px;margin-bottom:10px;user-select:none}
      #${HUB_ID} .mf-hub-brand img{width:34px;height:34px;border-radius:8px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
      #${HUB_ID} .mf-hub-brand span{font-size:9px;font-weight:700;letter-spacing:.14em;opacity:.75;text-shadow:1px 1px #000}
      #${HUB_ID} .mf-hub-rail hr{width:34px;border:none;border-top:2px solid rgba(255,255,255,.14);margin:5px 0}
      #${HUB_ID} .mf-hub-navbtn{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:74px;height:60px;border:2px solid rgba(0,0,0,.75);border-radius:10px;background:rgba(10,12,16,.6);backdrop-filter:blur(6px);color:#fff;cursor:pointer;transition:background-color .12s ease,border-color .12s ease;padding:6px 2px}
      #${HUB_ID} .mf-hub-navbtn:hover{background:rgba(46,50,60,.72);border-color:rgba(255,255,255,.35)}
      #${HUB_ID} .mf-hub-navbtn[data-active="true"]{border-color:#fff;background:rgba(60,64,76,.8)}
      #${HUB_ID} .mf-hub-navbtn svg{width:21px;height:21px;flex:none}
      #${HUB_ID} .mf-hub-navbtn small{font-size:9.5px;font-weight:600;letter-spacing:.03em;opacity:.85;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${HUB_ID} .mf-hub-flyout{position:absolute;left:82px;top:50%;transform:translateY(-50%) translateX(-4px);display:flex;flex-direction:column;gap:5px;min-width:172px;padding:7px;border:2px solid rgba(0,0,0,.75);border-radius:10px;background:rgba(12,14,18,.92);backdrop-filter:blur(9px);opacity:0;visibility:hidden;transition:opacity .12s ease,transform .12s ease,visibility .12s;pointer-events:none}
      #${HUB_ID} .mf-hub-navbtn:hover .mf-hub-flyout,#${HUB_ID} .mf-hub-navbtn:focus-within .mf-hub-flyout{opacity:1;visibility:visible;transform:translateY(-50%) translateX(0);pointer-events:auto}
      #${HUB_ID} .mf-hub-fly{display:flex;align-items:center;gap:9px;width:100%;border:none;border-radius:7px;background:transparent;color:#fff;font-size:12.5px;font-weight:600;padding:8px 10px;cursor:pointer;text-align:left}
      #${HUB_ID} .mf-hub-fly:hover{background:rgba(255,255,255,.12)}
      #${HUB_ID} .mf-hub-fly svg{width:15px;height:15px;opacity:.8;flex:none}

      #${HUB_ID} .mf-hub-main{position:absolute;left:118px;right:368px;top:0;bottom:0;overflow-y:auto;overflow-x:hidden;pointer-events:auto;padding:34px 8px 42px 10px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}
      #${HUB_ID} .mf-hub-main::-webkit-scrollbar{width:8px}
      #${HUB_ID} .mf-hub-main::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:4px}
      #${HUB_ID} .mf-hub-sec{margin:0 0 26px;max-width:900px}
      #${HUB_ID} .mf-hub-sechead{display:flex;align-items:baseline;gap:12px;margin:0 0 10px}
      #${HUB_ID} .mf-hub-sechead h2{margin:0;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.92);text-shadow:1px 2px #000}
      #${HUB_ID} .mf-hub-sechead .mf-hub-hint{font-size:11px;color:rgba(255,255,255,.5);text-shadow:1px 1px #000}
      #${HUB_ID} .mf-hub-seeall{margin-left:auto;border:none;background:transparent;color:rgba(255,255,255,.75);font-size:12px;font-weight:600;cursor:pointer;padding:4px 6px;border-radius:6px;text-shadow:1px 1px #000}
      #${HUB_ID} .mf-hub-seeall:hover{color:#fff;background:rgba(255,255,255,.1)}

      #${HUB_ID} .mf-hub-continue{position:relative;display:flex;align-items:flex-end;width:min(660px,100%);min-height:250px;border:3px solid rgba(0,0,0,.85);border-radius:12px;overflow:hidden;cursor:pointer;background:#101318;box-shadow:0 14px 34px rgba(0,0,0,.45);transition:transform .14s ease,border-color .14s ease;padding:0}
      #${HUB_ID} .mf-hub-continue:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.5)}
      #${HUB_ID} .mf-hub-continue img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      #${HUB_ID} .mf-hub-continue::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05) 30%,rgba(0,0,0,.72) 100%)}
      #${HUB_ID} .mf-hub-continfo{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;padding:14px 16px}
      #${HUB_ID} .mf-hub-continfo>div{flex:1;min-width:0}
      #${HUB_ID} .mf-hub-contname{font-size:19px;font-weight:800;text-shadow:2px 2px #000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
      #${HUB_ID} .mf-hub-contplay{display:flex;align-items:center;gap:8px;border:2px solid rgba(0,0,0,.85);border-radius:9px;background:rgba(255,255,255,.92);color:#0c0e12;font-size:13.5px;font-weight:800;letter-spacing:.06em;padding:9px 20px;text-transform:uppercase}
      #${HUB_ID} .mf-hub-contplay svg{width:13px;height:13px}

      #${HUB_ID} .mf-hub-row{display:flex;gap:10px;flex-wrap:wrap}
      #${HUB_ID} .mf-hub-fav{position:relative;display:flex;flex-direction:column;justify-content:flex-end;width:128px;height:78px;border:2px solid rgba(0,0,0,.85);border-radius:10px;overflow:hidden;cursor:pointer;background:#101318;padding:0;transition:transform .12s ease,border-color .12s ease}
      #${HUB_ID} .mf-hub-fav:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.45)}
      #${HUB_ID} .mf-hub-fav img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      #${HUB_ID} .mf-hub-fav::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(0,0,0,.68) 100%)}
      #${HUB_ID} .mf-hub-fav span{position:relative;z-index:1;font-size:11.5px;font-weight:700;text-shadow:1px 1px #000;padding:6px 8px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
      #${HUB_ID} .mf-hub-add{display:flex;align-items:center;justify-content:center;width:128px;height:78px;border:2px dashed rgba(255,255,255,.3);border-radius:10px;background:rgba(10,12,16,.45);color:rgba(255,255,255,.75);font-size:26px;cursor:pointer}
      #${HUB_ID} .mf-hub-add:hover{border-color:rgba(255,255,255,.6);color:#fff}

      #${HUB_ID} .mf-hub-disc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:900px}
      #${HUB_ID} .mf-hub-big{position:relative;display:flex;flex-direction:column;justify-content:flex-end;min-height:172px;border:3px solid rgba(0,0,0,.85);border-radius:12px;overflow:hidden;cursor:pointer;background:#101318;padding:0;box-shadow:0 10px 24px rgba(0,0,0,.4);transition:transform .14s ease,border-color .14s ease}
      #${HUB_ID} .mf-hub-big:hover{transform:translateY(-3px);border-color:rgba(255,255,255,.5)}
      #${HUB_ID} .mf-hub-big img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      #${HUB_ID} .mf-hub-big::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.02) 30%,rgba(0,0,0,.74) 100%)}
      #${HUB_ID} .mf-hub-biginfo{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 12px}
      #${HUB_ID} .mf-hub-bigname{font-size:14.5px;font-weight:800;text-shadow:2px 2px #000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${HUB_ID} .mf-hub-bigplays{font-size:10.5px;color:rgba(255,255,255,.62);text-shadow:1px 1px #000;flex:none}
      #${HUB_ID} .mf-hub-star{position:absolute;z-index:2;top:7px;right:7px;display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:2px solid rgba(0,0,0,.7);border-radius:7px;background:rgba(10,12,16,.65);color:rgba(255,255,255,.55);cursor:pointer;opacity:0;transition:opacity .12s ease}
      #${HUB_ID} .mf-hub-big:hover .mf-hub-star,#${HUB_ID} .mf-hub-star[data-on="true"]{opacity:1}
      #${HUB_ID} .mf-hub-star[data-on="true"]{color:#ffd75e}
      #${HUB_ID} .mf-hub-star svg{width:14px;height:14px}

      #${HUB_ID} .mf-hub-picker{position:absolute;left:118px;top:50%;transform:translateY(-50%);z-index:3;width:380px;max-height:70vh;overflow-y:auto;padding:14px;border:3px solid rgba(0,0,0,.85);border-radius:12px;background:rgba(11,13,17,.95);backdrop-filter:blur(10px);pointer-events:auto;box-shadow:0 18px 44px rgba(0,0,0,.55)}
      #${HUB_ID} .mf-hub-picker h3{margin:0 0 10px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.9)}
      #${HUB_ID} .mf-hub-pickrow{display:flex;align-items:center;gap:9px;width:100%;border:none;border-radius:8px;background:transparent;color:#fff;padding:6px 8px;cursor:pointer;text-align:left;font-size:13px;font-weight:600}
      #${HUB_ID} .mf-hub-pickrow:hover{background:rgba(255,255,255,.09)}
      #${HUB_ID} .mf-hub-pickrow img{width:44px;height:26px;object-fit:cover;border-radius:5px;border:1px solid rgba(0,0,0,.7);flex:none}
      #${HUB_ID} .mf-hub-pickrow span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${HUB_ID} .mf-hub-pickrow .mf-hub-star{position:static;opacity:1;width:24px;height:24px}
      #${HUB_ID} .mf-hub-aside{position:absolute;right:20px;bottom:20px;top:auto;display:flex;flex-direction:column;gap:8px;width:320px;pointer-events:auto}
      #${HUB_ID} .mf-hub-friendspill{display:flex;align-items:center;gap:10px;border:2px solid rgba(0,0,0,.75);border-radius:10px;background:rgba(10,12,16,.62);backdrop-filter:blur(6px);color:#fff;padding:10px 13px;cursor:pointer;font-size:12.5px;font-weight:600;text-align:left}
      #${HUB_ID} .mf-hub-friendspill:hover{background:rgba(46,50,60,.72)}
      #${HUB_ID} .mf-hub-dot{width:8px;height:8px;border-radius:50%;background:#43d477;flex:none;box-shadow:0 0 7px rgba(67,212,119,.8)}
      #${HUB_ID} .mf-hub-friendspill small{margin-left:auto;opacity:.6;font-size:11px}
      #${HUB_ID} .mf-hub-empty{padding:16px;border:2px dashed rgba(255,255,255,.2);border-radius:10px;color:rgba(255,255,255,.55);font-size:12.5px;max-width:560px}

      @media(prefers-reduced-motion:reduce){
        #${HUB_ID} .mf-hub-continue,#${HUB_ID} .mf-hub-fav,#${HUB_ID} .mf-hub-big,#${HUB_ID} .mf-hub-navbtn{transition:none!important}
      }
    `;
    return style;
  }

  const ICONS = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M6 10v9h12v-9"/>',
    play: '<path d="M7 5.5v13l11-6.5z"/>',
    social: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><circle cx="17" cy="10" r="2.4"/><path d="M15.8 14.6c2.3.2 4 1.5 4.7 4"/>',
    mods: '<rect x="4" y="4" width="7" height="7" rx="1.4"/><rect x="13" y="4" width="7" height="7" rx="1.4"/><rect x="4" y="13" width="7" height="7" rx="1.4"/><path d="M16.5 13.5v6M13.5 16.5h6"/>',
    shop: '<path d="M5 8h14l-1.2 11.2a1.6 1.6 0 0 1-1.6 1.4H7.8a1.6 1.6 0 0 1-1.6-1.4z"/><path d="M9 10V6.8a3 3 0 0 1 6 0V10"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.6v2.6M12 17.8v2.6M3.6 12h2.6M17.8 12h2.6M6.1 6.1l1.9 1.9M16 16l1.9 1.9M17.9 6.1 16 8M8 16l-1.9 1.9"/>',
    more: '<circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/>',
    recent: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2.4"/>',
    grid: '<rect x="4" y="4" width="6.6" height="6.6" rx="1.2"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.2"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.2"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.2"/>',
    wrench: '<path d="M14.5 6.5a4 4 0 0 0-5.6 4.9L4 16.3V20h3.7l4.9-4.9a4 4 0 0 0 4.9-5.6l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    star: '<path d="M12 4.6 14.3 9.3l5.2.7-3.8 3.6.9 5.1L12 16.3l-4.6 2.4.9-5.1L4.5 10l5.2-.7z"/>',
    users: '<circle cx="9" cy="8.5" r="3"/><path d="M4 19.5c.7-3.4 2.6-5 5-5s4.3 1.6 5 5"/><circle cx="16.5" cy="9.5" r="2.3"/><path d="M15.5 14.7c2.2.3 3.9 1.7 4.5 4.4"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.8"/><path d="m4.5 7 7.5 6 7.5-6"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5H4.8c0 3 1.4 4.6 3.4 4.9M16 5h3.2c0 3-1.4 4.6-3.4 4.9"/><path d="M12 13v4m-3.5 3h7"/>'
  };

  function svgIcon(name) {
    const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrap.setAttribute('viewBox', '0 0 24 24');
    wrap.setAttribute('fill', 'none');
    wrap.setAttribute('stroke', 'currentColor');
    wrap.setAttribute('stroke-width', '1.9');
    wrap.setAttribute('stroke-linecap', 'round');
    wrap.setAttribute('stroke-linejoin', 'round');
    wrap.innerHTML = ICONS[name] || '';
    if (name === 'play' || name === 'star') wrap.setAttribute('fill', 'currentColor');
    return wrap;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function findLayout(root) {
    for (const shell of root.children || []) {
      if (shell.children.length !== 3) continue;
      const panels = [...shell.children];
      const center = panels.find(panel => panel.querySelectorAll('a[href^="/game/"]').length >= 2);
      if (!center || center.querySelectorAll('[role="button"],button').length < 3) continue;
      const nav = panels.find(panel => panel !== center && panel.querySelectorAll('button').length >= 5);
      const right = panels.find(panel => panel !== center && panel !== nav && panel.querySelector('button'));
      if (!nav || !right) continue;
      return { shell, nav, center, right };
    }
    return null;
  }

  function mark(element, className) {
    if (!element || element.classList.contains(className)) return;
    element.classList.add(className);
    state.marks.add([element, className]);
  }

  // secciones = contenedores minimos con >=3 tarjetas (link de juego o boton con imagen).
  // las flechas del carrusel no tienen img y "unirse con codigo" no tiene imagen: quedan fuera solas.
  function isCardNode(node) {
    if (node.closest(`#${HUB_ID},[role="dialog"]`)) return false;
    const isLink = node.tagName === 'A' && /^\/game\/[a-z0-9-]+$/.test(node.getAttribute('href') || '');
    if (!isLink && node.tagName !== 'BUTTON' && node.getAttribute?.('role') !== 'button') return false;
    if (!node.querySelector('img')) return false;
    return node.querySelector('p,span,h3,h4') != null;
  }

  function findSections(center) {
    const byParent = new Map();
    for (const node of center.querySelectorAll('a,button,[role="button"]')) {
      if (!isCardNode(node)) continue;
      const parent = node.parentElement;
      if (!parent || byParent.has(parent)) continue;
      const cards = [...parent.children].filter(isCardNode);
      if (cards.length >= 3) byParent.set(parent, cards);
    }
    const parents = [...byParent.keys()].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    // quedarnos con los contenedores mas internos: si un padre contiene a otro, el padre sobra
    return parents.filter(parent => !parents.some(other =>
      other !== parent && other.contains(parent))).map(parent => ({ el: parent, cards: byParent.get(parent) }));
  }

  function cardText(card) {
    const paragraphs = [...card.querySelectorAll('p')];
    const withText = paragraphs.map(p => p.textContent.trim()).filter(Boolean);
    // convencion del sitio: primero las jugadas (1.1M), despues el nombre; si hay uno solo, es el nombre
    if (withText.length >= 2) return { name: withText[withText.length - 1], plays: withText[0] };
    if (withText.length === 1) return { name: withText[0], plays: '' };
    return { name: labelOf(card).slice(0, 40) || '?', plays: '' };
  }

  function collectGames(center) {
    const games = new Map();
    for (const link of center.querySelectorAll('a[href^="/game/"]')) {
      const href = link.getAttribute('href') || '';
      if (!/^\/game\/[a-z0-9-]+$/.test(href) || games.has(href)) continue;
      const slug = href.slice('/game/'.length);
      const image = link.querySelector('img');
      const info = cardText(link);
      games.set(href, {
        href, slug,
        name: MODE_NAMES[slug] || info.name || slug,
        plays: info.plays,
        image: image?.currentSrc || image?.src || image?.getAttribute('src') || '',
        node: link
      });
    }
    return [...games.values()];
  }

  function findNativeButtons(nav) {
    state.nav.clear();
    for (const button of nav.querySelectorAll('button')) {
      const label = labelOf(button);
      if (!label) continue;
      for (const [name, regex] of Object.entries(NAV_MATCHERS)) {
        if (!regex.test(label)) continue;
        if (!state.nav.has(name)) state.nav.set(name, button);
        break;
      }
    }
  }

  // bbox de la figura dentro del buffer del render, escaneando alpha. se cachea por
  // tamano de buffer SOLO los exitos: un fallo (canvas webgl entre frames, taint) se
  // reintenta en el proximo sync porque el resultado puede cambiar. el cache se valida
  // con dos filas sonda: el render puede cambiar de contenido SIN cambiar de buffer
  // (fallback de cabeza -> cuerpo 3d) y un frac viejo pinta al personaje gigante
  const chipFitCache = new Map();
  function figureFractions(canvas) {
    const key = `${canvas.width}x${canvas.height}`;
    const cached = chipFitCache.get(key);
    let frac = null;
    try {
      const off = document.createElement('canvas');
      off.width = canvas.width;
      off.height = canvas.height;
      const ctx = off.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      const data = ctx.getImageData(0, 0, off.width, off.height).data;
      const rowAlpha = y => {
        let count = 0;
        for (let x = 0; x < off.width; x++) {
          if (data[(y * off.width + x) * 4 + 3] > 12) count++;
        }
        return count;
      };
      if (cached) {
        const yBottom = Math.min(off.height - 1, Math.max(0, Math.round(cached.bottom * off.height) - 1));
        const yTop = Math.min(off.height - 1, Math.max(0, Math.round(cached.top * off.height)));
        if (rowAlpha(yBottom) >= 2 && rowAlpha(yTop) >= 2) return cached;
        chipFitCache.delete(key);
      }
      let top = -1, bottom = -1, left = off.width, right = -1;
      for (let y = 0; y < off.height; y++) {
        for (let x = 0; x < off.width; x++) {
          if (data[(y * off.width + x) * 4 + 3] > 12) {
            if (top < 0) top = y;
            bottom = y;
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
      }
      if (top >= 0 && bottom > top) {
        frac = { top: top / off.height, bottom: (bottom + 1) / off.height, cx: (left + right + 1) / (2 * off.width) };
        chipFitCache.set(key, frac);
      }
    } catch (_) { frac = null; }  // taint u otro: sin cache, se reintenta
    return frac;
  }

  // ajuste por sync: la figura entera, centrada y con los pies en el piso de la ventana.
  // control total del canvas: tamano explicito con el aspect del BUFFER (el sitio estira la
  // caja con left/right y deforma al personaje) y translate puro, sin confiar en los
  // offsets nativos (left:-18px, bottom:-151px...) porque su origen cambia con cada variante.
  // offsetWidth/Height ignoran transforms pero aca ni los usamos: el buffer manda.
  function fitChipCanvas(canvas, frac) {
    const clear = () => {
      canvas.style.transform = '';
      canvas.style.transformOrigin = '';
      canvas.style.left = ''; canvas.style.top = '';
      canvas.style.right = ''; canvas.style.bottom = '';
      canvas.style.width = ''; canvas.style.height = '';
    };
    if (state.expanded) { clear(); return; }
    const winW = 150, winH = 245;
    const bw = canvas.width, bh = canvas.height;
    if (!bw || !bh) return;
    const figH = frac.bottom - frac.top;
    if (!(figH > 0 && figH <= 1)) return;
    const cssH = (winH * 0.86) / figH;
    const cssW = cssH * (bw / bh);
    canvas.style.left = '0px';
    canvas.style.top = '0px';
    canvas.style.right = 'auto';
    canvas.style.bottom = 'auto';
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const tx = winW / 2 - frac.cx * cssW;
    const ty = winH - 2 - frac.bottom * cssH;
    canvas.style.transform = `translate(${tx}px, ${ty}px)`;
    canvas.style.transformOrigin = 'top left';
  }

  function clearChipMarks() {
    for (const entry of [...state.marks]) {
      if (String(entry[1]).startsWith('mf-hub-chip')) {
        entry[0].classList.remove(entry[1]);
        state.marks.delete(entry);
      }
    }
  }

  // modo estatico: NO marcar nada. la tarjeta nativa se ve como nacio — su estilo de
  // siempre es el unico que es correcto en TODAS las variantes de nesting que el sitio
  // inventa. las marcas finas solo existen para el camino con personaje
  function markChipStatic() {
    clearChipMarks();
  }

  function markChip(right) {
    let canvas = null, best = 0;
    for (const c of right.querySelectorAll('canvas')) {
      const area = c.offsetWidth * c.offsetHeight;
      if (area > best) { best = area; canvas = c; }
    }
    if (!canvas || !best) {
      // durante un re-render de react el canvas puede estar desmontado UN instante:
      // alternar aca pestañea a ritmo de sync. histeresis por tiempo: si lo vimos hace
      // poco, conservar las marcas; si nunca hubo o lleva rato fuera, tarjeta nativa
      const gone = performance.now() - (state.chipLastSeen || 0);
      if (state.chipLastSeen && gone < 1200) return;
      markChipStatic();
      return;
    }
    state.chipLastSeen = performance.now();
    // juzgar por CONTENIDO, no por presencia: un canvas mudo (render asincrono que no
    // llego, webgl con preserveDrawingBuffer en pestana de fondo) no da personaje.
    // gracia por TIEMPO, no por syncs: en una pagina quieta los syncs no corren y un
    // contador en syncs dejaria marcas huerfanas minutos enteros
    const frac = figureFractions(canvas);
    if (!frac) {
      if (performance.now() - (state.chipLastPaint || 0) > 1500) {
        markChipStatic();
        return;
      }
      return;   // pinto hace poco: aguantar las marcas que hay, puede volver a pintar
    }
    state.chipLastPaint = performance.now();
    // las marcas del sync anterior son veneno si la tarjeta cambio de forma: re-marcar
    clearChipMarks();
    // ventana(s) de render = ancestros ABSOLUTOS del canvas (llenan la caja, recortan y
    // a veces llevan el borde de color de nivel). la caja del avatar es el primer ancestro
    // que NO es absolute: ahi anclan badges y ventana, ahi hay que quedarse
    const windows = [];
    let node = canvas.parentElement;
    while (node && node !== right && getComputedStyle(node).position === 'absolute') {
      windows.push(node);
      node = node.parentElement;
    }
    if (!node || node === right || !node.parentElement) { markChipStatic(); return; }
    // fila = ancestro con un hermano ESTATICO que tenga button/p (la columna de datos).
    // los badges de nivel/racha son absolute y contienen p: sin el filtro de position
    // el walk los confunde con la columna y marca chiprow en la caja del avatar
    let row = null, info = null, probe = node;
    while (probe.parentElement && probe.parentElement !== right) {
      const parent = probe.parentElement;
      const data = [...parent.children].find(el =>
        el !== probe && !el.contains(canvas) &&
        getComputedStyle(el).position === 'static' && el.querySelector('button,p'));
      if (data) { row = parent; info = data; break; }
      probe = parent;
    }
    if (!row) { markChipStatic(); return; }
    mark(row, 'mf-hub-chiprow');
    mark(node, 'mf-hub-chipavatar');
    mark(info, 'mf-hub-chipinfo');
    for (const win of windows) if (win !== node) mark(win, 'mf-hub-chipwindow');
    for (const child of row.children) {
      if (child === node || child === info) continue;
      mark(child, !child.contains(canvas) && child.querySelector('button,p') ? 'mf-hub-chipinfo' : 'mf-hub-chipextra');
    }
    // el avatar vive DENTRO de la tarjeta (en flujo): no hay que pelar ancestros ni
    // escapar del cubo, asi que los filtros nativos de la tarjeta no molestan
    fitChipCanvas(canvas, frac);
  }

  function forwardClick(nativeNode) {
    if (!nativeNode) return;
    try { nativeNode.click(); } catch (_) {}
  }

  function gameBySlug(slug) {
    return state.games.find(game => game.slug === slug) || null;
  }

  function togglePin(slug) {
    const index = state.pins.indexOf(slug);
    if (index >= 0) state.pins.splice(index, 1);
    else { state.pins.push(slug); if (state.pins.length > 8) state.pins.shift(); }
    writePins();
    renderHub();
  }

  function starButton(slug, extraClass) {
    const star = el('button', `mf-hub-star${extraClass ? ` ${extraClass}` : ''}`);
    star.type = 'button';
    star.dataset.on = state.pins.includes(slug) ? 'true' : 'false';
    star.title = state.pins.includes(slug) ? t('unpin') : t('pin');
    star.append(svgIcon('star'));
    star.addEventListener('click', event => {
      event.stopPropagation();
      event.preventDefault();
      togglePin(slug);
    });
    return star;
  }

  function bigCard(game, withStar) {
    const card = el('button', 'mf-hub-big');
    card.type = 'button';
    if (game.image) {
      const img = document.createElement('img');
      img.src = game.image;
      img.alt = '';
      img.loading = 'lazy';
      card.append(img);
    }
    const info = el('div', 'mf-hub-biginfo');
    info.append(el('span', 'mf-hub-bigname', game.name));
    if (game.plays) info.append(el('span', 'mf-hub-bigplays', game.plays));
    card.append(info);
    if (withStar) card.append(starButton(game.slug));
    card.addEventListener('click', () => forwardClick(game.node));
    return card;
  }

  function favCard(game, withStar) {
    const card = el('button', 'mf-hub-fav');
    card.type = 'button';
    if (game?.image) {
      const img = document.createElement('img');
      img.src = game.image;
      img.alt = '';
      img.loading = 'lazy';
      card.append(img);
    }
    card.append(el('span', null, game?.name || game.slug));
    if (withStar && game?.slug) card.append(starButton(game.slug));
    if (game?.node) card.addEventListener('click', () => forwardClick(game.node));
    else card.addEventListener('click', () => { try { location.assign(`/game/${game.slug}`); } catch (_) {} });
    return card;
  }

  function section(title, hint) {
    const sec = el('section', 'mf-hub-sec');
    const head = el('div', 'mf-hub-sechead');
    head.append(el('h2', null, title));
    if (hint) head.append(el('span', 'mf-hub-hint', hint));
    sec.append(head);
    return sec;
  }

  function openPicker() {
    closePicker();
    const picker = el('div', 'mf-hub-picker');
    picker.id = 'mf-hub-picker';
    picker.setAttribute('data-mf-i18n-skip', 'true');
    picker.append(el('h3', null, t('pick')));
    if (!state.games.length) picker.append(el('p', 'mf-hub-empty', '…'));
    for (const game of state.games) {
      const row = el('button', 'mf-hub-pickrow');
      row.type = 'button';
      if (game.image) {
        const img = document.createElement('img');
        img.src = game.image;
        img.alt = '';
        row.append(img);
      }
      row.append(el('span', null, game.name));
      row.append(starButton(game.slug));
      row.addEventListener('click', () => forwardClick(game.node));
      picker.append(row);
    }
    state.hub.append(picker);
    const dismiss = event => {
      if (event.target.closest?.('#mf-hub-picker,.mf-hub-add')) return;
      closePicker();
      document.removeEventListener('click', dismiss);
    };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  }

  function closePicker() {
    document.getElementById('mf-hub-picker')?.remove();
  }

  function railButton(name, iconName, label, onClick, flyoutItems) {
    const button = el('button', 'mf-hub-navbtn');
    button.type = 'button';
    button.dataset.hub = name;
    button.title = label;
    button.append(svgIcon(iconName));
    button.append(el('small', null, label));
    if (flyoutItems?.length) {
      const flyout = el('div', 'mf-hub-flyout');
      for (const item of flyoutItems) {
        const fly = el('button', 'mf-hub-fly');
        fly.type = 'button';
        if (item.icon) fly.append(svgIcon(item.icon));
        fly.append(el('span', null, item.label));
        fly.addEventListener('click', event => {
          event.stopPropagation();
          item.onClick();
        });
        flyout.append(fly);
      }
      button.append(flyout);
    }
    button.addEventListener('click', event => {
      if (event.target.closest('.mf-hub-flyout')) return;
      onClick();
    });
    return button;
  }

  function expandTo(nativeButton, scrollTarget) {
    state.expanded = true;
    state.root.classList.add(EXPANDED_CLASS);
    syncRailActive();
    closePicker();
    if (nativeButton) forwardClick(nativeButton);
    if (scrollTarget) {
      setTimeout(() => {
        try { scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
      }, 60);
    }
  }

  function goHome() {
    state.expanded = false;
    state.root.classList.remove(EXPANDED_CLASS);
    closePicker();
    syncRailActive();
    state.hub?.querySelector('.mf-hub-main')?.scrollTo({ top: 0 });
  }

  function syncRailActive() {
    if (!state.hub) return;
    for (const button of state.hub.querySelectorAll('.mf-hub-navbtn[data-hub]')) {
      const hub = button.dataset.hub;
      if (hub === 'home') button.dataset.active = String(!state.expanded);
      else if (hub === 'play') button.dataset.active = String(state.expanded);
    }
  }

  function friendsOnlineCount(right) {
    const text = right.textContent || '';
    const match = text.match(/(\d+)\s*(?:online|en\s+l[ií]nea|in\s+linea|オンライン|在线|в\s+сети|온라인)/i);
    return match ? match[1] : '';
  }

  function buildRail() {
    const rail = el('div', 'mf-hub-rail');
    rail.setAttribute('data-mf-i18n-skip', 'true');
    const brand = el('div', 'mf-hub-brand');
    try {
      const logo = document.createElement('img');
      logo.src = chrome.runtime.getURL('assets/icon.png');
      logo.alt = '';
      brand.append(logo);
    } catch (_) {}
    brand.append(el('span', null, 'MINIFEATHER'));
    rail.append(brand);

    const nav = name => state.nav.get(name);
    const fly = (label, icon, fn) => ({ label, icon, onClick: fn });

    rail.append(railButton('home', 'home', t('home'), goHome));
    rail.append(railButton('play', 'play', t('play'), () => expandTo(null, state.sections[0]?.el), [
      fly(t('recent'), 'recent', () => expandTo(null, state.sections[0]?.el)),
      fly(t('topGames'), 'grid', () => expandTo(null, state.sections[1]?.el || state.sections[0]?.el)),
      fly(t('custom'), 'grid', () => expandTo(null, state.sections[2]?.el || state.sections[1]?.el)),
      fly(t('planets'), 'grid', () => forwardClick(nav('planets')))
    ]));
    rail.append(railButton('social', 'social', t('social'), () => forwardClick(nav('social')), [
      fly(t('friends'), 'users', () => forwardClick(nav('social'))),
      fly(t('messages'), 'mail', () => forwardClick(nav('messages')))
    ]));
    rail.append(railButton('shop', 'shop', t('shop'), () => forwardClick(nav('shop'))));
    rail.append(railButton('mods', 'wrench', t('mods'), () => {
      try {
        document.dispatchEvent(new CustomEvent('minifeather:open-panel'));
      } catch (_) {}
    }));
    rail.append(document.createElement('hr'));
    rail.append(railButton('settings', 'gear', t('settings'), () => forwardClick(nav('settings'))));

    // desague: todo boton nativo que el rail no muestra queda aqui, nada se pierde
    const shown = new Set(['settings', 'social', 'messages', 'planets', 'shop']);
    const rest = [...state.nav.entries()].filter(([name]) => !shown.has(name));
    if (rest.length) {
      const labels = { achievements: 'trophy', rankings: 'trophy', unlocked: 'star', users: 'users', news: 'mail', more: 'more' };
      rail.append(railButton('overflow', 'more', t('more'), () => {}, rest.map(([name, button]) =>
        fly(name.charAt(0).toUpperCase() + name.slice(1), labels[name] || 'grid', () => forwardClick(button)))));
    }
    return rail;
  }

  function buildMain() {
    const main = el('div', 'mf-hub-main');
    main.setAttribute('data-mf-i18n-skip', 'true');

    if (state.recentCard) {
      const sec = section(t('continue'));
      const { name, plays } = cardText(state.recentCard);
      const img = state.recentCard.querySelector('img');
      const card = el('button', 'mf-hub-continue');
      card.type = 'button';
      if (img?.currentSrc || img?.src) {
        const image = document.createElement('img');
        image.src = img.currentSrc || img.src;
        image.alt = '';
        card.append(image);
      }
      const info = el('div', 'mf-hub-continfo');
      const left = el('div');
      left.append(el('div', 'mf-hub-contname', name));
      if (plays) left.append(el('div', 'mf-hub-bigplays', plays));
      const play = el('span', 'mf-hub-contplay');
      play.append(svgIcon('play'));
      play.append(document.createTextNode(t('play')));
      info.append(left, play);
      card.append(info);
      card.addEventListener('click', () => forwardClick(state.recentCard));
      sec.append(card);
      main.append(sec);
    }

    if (state.pins.length || state.games.length) {
      // sin pins la fila no se ve vacia: candidatos populares con estrella, mismo chiste que el mock
      const fallback = state.pins.length ? [] : state.games.slice(0, 4);
      const sec = section(t('favorites'), fallback.length ? t('popular') : null);
      const row = el('div', 'mf-hub-row');
      for (const slug of state.pins) {
        const game = gameBySlug(slug);
        row.append(favCard(game || { slug, name: MODE_NAMES[slug] || slug }));
      }
      for (const game of fallback) row.append(favCard(game, true));
      const add = el('button', 'mf-hub-add');
      add.type = 'button';
      add.title = t('pick');
      add.textContent = '+';
      add.addEventListener('click', event => {
        event.stopPropagation();
        if (document.getElementById('mf-hub-picker')) closePicker();
        else openPicker();
      });
      row.append(add);
      sec.append(row);
      main.append(sec);
    }

    const recentSlug = state.recentCard?.tagName === 'A'
      ? (state.recentCard.getAttribute('href') || '').replace('/game/', '')
      : null;
    const discoverPool = state.games
      .filter(game => !state.pins.includes(game.slug) && game.slug !== recentSlug)
      .slice(0, 3);
    if (discoverPool.length) {
      const sec = section(t('discover'));
      const head = sec.querySelector('.mf-hub-sechead');
      const seeAll = el('button', 'mf-hub-seeall');
      seeAll.type = 'button';
      seeAll.textContent = `${t('viewAll')} →`;
      seeAll.addEventListener('click', () => expandTo(null, null));
      head.append(seeAll);
      const grid = el('div', 'mf-hub-disc');
      for (const game of discoverPool) grid.append(bigCard(game, true));
      sec.append(grid);
      main.append(sec);
    }

    if (!state.recentCard && !state.games.length) {
      main.append(el('div', 'mf-hub-empty', '…'));
    }
    return main;
  }

  function buildAside() {
    const aside = el('div', 'mf-hub-aside');
    aside.setAttribute('data-mf-i18n-skip', 'true');
    const online = friendsOnlineCount(state.layoutRight);
    if (online) {
      const pill = el('button', 'mf-hub-friendspill');
      pill.type = 'button';
      pill.append(el('span', 'mf-hub-dot'));
      pill.append(el('span', null, `${online} ${t('online')}`));
      pill.append(el('small', null, t('friends')));
      // sin panel nativo a la vista, el pill abre el social nativo directamente
      pill.addEventListener('click', () => forwardClick(state.nav.get('social')));
      aside.append(pill);
    }
    return aside;
  }

  function removeHub() {
    closePicker();
    state.hub?.remove();
    state.hub = null;
  }

  function renderHub() {
    // state.hub null aqui es el caso normal (primer render), no un error: solo root importa
    if (!state.root) return;
    const scroll = state.hub?.querySelector('.mf-hub-main')?.scrollTop || 0;
    removeHub();
    try {
      const hub = el('div');
      hub.id = HUB_ID;
      hub.setAttribute('data-mf-i18n-skip', 'true');
      hub.append(buildRail(), buildMain(), buildAside());
      state.root.append(hub);
      state.hub = hub;
      hub.querySelector('.mf-hub-main')?.scrollTo({ top: scroll });
      syncRailActive();
      state.renderFails = 0;
    } catch (e) {
      // un fallo de render no puede dejar la pantalla en un vacio oscuro: sin hub y con
      // la clase puesta, el usuario no ve NADA y la firma ya no cambia para reintentar.
      // volver a la pantalla nativa y reintentar con backoff creciente
      try { console.warn('minifeather menuhub: render fallo, pantalla nativa de emergencia', e); } catch (_) {}
      state.renderFails = (state.renderFails || 0) + 1;
      state.renderBackoff = performance.now() + Math.min(5000, 300 * state.renderFails);
      state.signature = '';
      restore();
    }
  }

  function clearMarks() {
    for (const [element, className] of state.marks) element.classList.remove(className);
    state.marks.clear();
  }

  function restore() {
    removeHub();
    clearMarks();
    // fitChipCanvas deja estilos inline en el canvas del chip: sin esta limpieza el
    // personaje queda recortado/desplazado en la tarjeta nativa hasta que react lo remonte
    if (state.layoutRight) {
      for (const c of state.layoutRight.querySelectorAll('canvas')) {
        for (const prop of ['transform', 'transformOrigin', 'left', 'top', 'right', 'bottom', 'width', 'height']) {
          c.style[prop] = '';
        }
      }
    }
    state.root?.classList.remove(ROOT_CLASS, EXPANDED_CLASS);
    state.root = null;
    state.layoutRight = null;
    state.nav.clear();
    state.sections = [];
    state.games = [];
    state.recentCard = null;
    state.signature = '';
    state.expanded = false;
  }

  function sync() {
    state.timer = 0;
    if (!state.enabled || state.destroyed) return;
    // sin closePicker aqui: el picker vive dentro del hub y muere solo en un re-render;
    // cerrarlo en cada sync lo mata 140ms despues de abrirse (el append dispara el observer)
    const root = document.getElementById('react');
    const onHome = location.pathname === '/' || location.pathname === '/index.html';
    const usable = onHome && root && innerWidth >= MIN_WIDTH &&
      !root.classList.contains('mf-classic-title'); // classic title manda si los dos estan on
    const layout = usable ? findLayout(root) : null;
    if (!layout) { restore(); return; }
    if (state.root && state.root !== root) restore();
    state.root = root;
    state.layoutRight = layout.right;
    mark(layout.shell, SHELL_CLASS);
    mark(layout.nav, NAV_CLASS);
    mark(layout.center, CENTER_CLASS);
    mark(layout.right, RIGHT_CLASS);
    findNativeButtons(layout.nav);
    markChip(layout.right);
    state.sections = findSections(layout.center);
    state.games = collectGames(layout.center);
    state.recentCard = state.sections[0]?.cards.find(card => card.tagName === 'BUTTON')
      || state.sections[0]?.cards[0] || null;

    // firma barata: si no cambio nada visible, no re-renderizar el hub (el centro native muta seguido).
    // histeresis: un sync con firma distinta puede ser un re-render transitorio de react
    // (pestañearia el hub entero cada 140ms); exige que la firma nueva se sostenga 2 syncs
    const signature = JSON.stringify([
      state.language, state.pins, state.expanded,
      state.sections.map(section => section.cards.length),
      state.games.map(game => [game.href, game.image]).slice(0, 12),
      !!state.recentCard, friendsOnlineCount(layout.right)
    ]);
    // en backoff post-fallo: pantalla nativa sin intentarlo de nuevo hasta que expire
    if (performance.now() < (state.renderBackoff || 0)) return;
    // hub huerfano (react se comio el nodo, lo que sea): reconstruir YA. la firma no puede
    // frenarlo o la pantalla queda en vacio oscuro para siempre con la clase puesta
    if (state.hub && !state.hub.isConnected) state.hub = null;
    if (!state.hub || (signature !== state.signature && signature === state.prevSignature)) {
      state.signature = signature;
      renderHub();
    } else {
      syncRailActive();
    }
    state.prevSignature = signature;
    if (!state.hub) {
      // el render fallo y el catch dejo la pantalla nativa: sin clase, sin vacio oscuro.
      // el backoff decide cuando volver a intentarlo
      root.classList.remove(ROOT_CLASS, EXPANDED_CLASS);
      return;
    }
    root.classList.toggle(ROOT_CLASS, true);
    root.classList.toggle(EXPANDED_CLASS, state.expanded);
  }

  function schedule() {
    if (!state.enabled || state.destroyed || state.timer) return;
    if (!state.root && location.pathname !== '/' && location.pathname !== '/index.html') return;
    state.timer = setTimeout(sync, 140);
  }

  function onKeydown(event) {
    if (event.key !== 'Escape' || !state.hub) return;
    if (document.getElementById('mf-hub-picker')) { closePicker(); return; }
    if (state.expanded) {
      state.expanded = false;
      state.root?.classList.remove(EXPANDED_CLASS);
      syncRailActive();
    }
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
    if (typeof detail.language === 'string' && L10N[detail.language]) state.language = detail.language;
    setEnabled(detail.enabled);
  }

  function onStorage(changes, area) {
    if (area !== 'local' || !changes.settings) return;
    if (typeof changes.settings.newValue?.language === 'string' && L10N[changes.settings.newValue.language]) {
      const reRender = state.language !== changes.settings.newValue.language;
      state.language = changes.settings.newValue.language;
      if (reRender && state.enabled) renderHub();
    }
    if (typeof changes.settings.newValue?.menuHub === 'boolean') setEnabled(changes.settings.newValue.menuHub);
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

  document.addEventListener(CONFIG_EVENT, onConfig);
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  document.addEventListener('keydown', onKeydown);
  try {
    chrome.storage.onChanged.addListener(onStorage);
    chrome.storage.local.get(['settings'], data => {
      if (state.destroyed) return;
      if (typeof data?.settings?.language === 'string' && L10N[data.settings.language]) {
        state.language = data.settings.language;
      }
      // solo si la clave existe: un settings viejo sin menuHub no puede apagar el hub
      // (la carrera con el dispatch del panel dejaria el modulo muerto hasta reiniciar)
      if (typeof data?.settings?.menuHub === 'boolean') setEnabled(data.settings.menuHub);
    });
  } catch (_) {}
  globalThis[KEY] = {
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    destroy,
    get enabled() { return state.enabled; }
  };
})();
