(() => {
  'use strict';

  const KEY = '__MF_HALLOWEEN_UI__';
  const CONFIG_EVENT = 'minifeather:halloween-ui-config';
  const REQUEST_EVENT = 'minifeather:halloween-ui-request';
  const BASE_ID = 'mf-halloween-preview-style';
  const STYLE_ID = 'mf-halloween-ui-style';
  const ATTRIBUTE = 'data-mf-halloween-ui';
  const MOTION_ATTRIBUTE = 'data-mf-halloween-motion';
  try { globalThis[KEY]?.destroy?.(); } catch (_) {}
  if (globalThis.__MF_SEASONAL_FLAGS__?.halloween !== true) return;

  const asset = name => chrome.runtime.getURL(`assets/ui/halloween/${name}.svg`);
  const pumpkin = asset('pumpkin'), ghost = asset('ghost'), bat = asset('bat'), web = asset('web');
  const lantern = asset('lantern'), potion = asset('potion'), witchHat = asset('witch-hat'), garland = asset('garland');
  const nightScene = asset('night-scene');
  // Match the native menu by its game links and sibling navigation, never by a
  // generated Chakra class. These selectors stop matching when React mounts a world.
  const nativeShell = '#react:not(.mf-classic-title):not(.mf-hub)>div:has(>div a[href^="/game/"]):has(>div button)';
  const nativeCenter = `${nativeShell}>div:has(a[href^="/game/"])`;
  const languages = new Set(['en', 'es', 'ja', 'it', 'zh', 'fr', 'de', 'pt', 'ru', 'ko']);
  let enabled = false, motion = true, destroyed = false, themeStyle = null, language = 'en', paintedLanguage = '';

  const baseStyle = document.createElement('style');
  baseStyle.id = BASE_ID;
  baseStyle.textContent = `
    #mf-gui .mf-halloween-settings{overflow:hidden;border-color:#644464;background:linear-gradient(120deg,#251a30,#17131f)}
    #mf-gui .mf-halloween-heading{display:flex;align-items:center;gap:18px;min-height:142px}
    #mf-gui .mf-halloween-copy{flex:1;min-width:0;padding:5px 0 12px}
    #mf-gui .mf-halloween-eyebrow{display:block;color:#ffb15b;font-size:10px;letter-spacing:.13em;text-transform:uppercase;margin-bottom:9px}
    #mf-gui .mf-halloween-copy h3{margin:0 0 10px;color:#fff0d7;font-size:22px;line-height:1.25}
    #mf-gui .mf-halloween-copy p{margin:0;max-width:58ch;color:#c4b2d0;font-size:12px;line-height:1.7}
    #mf-gui .mf-halloween-art{position:relative;flex:0 0 224px;height:150px;overflow:hidden;contain:paint;image-rendering:pixelated;border:1px solid #644464;border-radius:7px;background:url("${nightScene}") right center/auto 150px no-repeat,#21182f;box-shadow:inset 0 0 0 3px #191322}
    #mf-gui .mf-halloween-art::after{content:"";position:absolute;bottom:3px;left:10px;right:8px;height:6px;background:#0d0b15;box-shadow:0 -4px #423044}
    #mf-gui .mf-halloween-art img{position:absolute;display:block;object-fit:contain;image-rendering:pixelated}
    #mf-gui .mf-halloween-pumpkin{width:80px;height:80px;right:12px;bottom:5px;z-index:2}
    #mf-gui .mf-halloween-ghost{width:62px;height:62px;left:24px;bottom:24px;z-index:1}
    #mf-gui .mf-halloween-bat{width:52px;height:52px;left:10px;top:4px;z-index:1}
    #mf-gui .mf-halloween-settings .mf-settings-row{gap:18px;border-color:#49344e;padding-block:13px}
    #mf-gui .mf-halloween-settings .mf-settings-label{color:#f1e3f6}
    #mf-gui .mf-halloween-settings .mf-switch{position:relative;display:inline-flex;flex:none;width:44px;height:24px;cursor:pointer}
    #mf-gui .mf-halloween-settings .mf-switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:1}
    #mf-gui .mf-halloween-settings .mf-slider{display:block;box-sizing:border-box;width:44px;height:24px;border:1px solid #805774;border-radius:4px;background:#3b2c48;pointer-events:none}
    #mf-gui .mf-halloween-settings .mf-slider::before{content:"";position:absolute;left:4px;top:4px;width:16px;height:16px;background:#c9bad6;box-shadow:inset 0 -3px #9985ac;transition:transform 140ms ease,background-color 140ms ease}
    #mf-gui .mf-halloween-settings input:checked+.mf-slider{background:#9b5b31;border-color:#f8b46e}
    #mf-gui .mf-halloween-settings input:checked+.mf-slider::before{background:#ffe1a7;box-shadow:inset 0 -3px #eeb664;transform:translateX(20px)}
    #mf-gui .mf-halloween-settings .mf-halloween-note{font-size:11px;line-height:1.65;color:#bca9c6;margin:12px 0 0}
    #mf-gui .mf-halloween-settings input:focus-visible+span{outline:2px solid #ffd28b;outline-offset:4px}
    #mf-gui .mf-halloween-ribbon{display:none;position:relative;isolation:isolate;align-items:center;gap:16px;flex:none;min-height:108px;box-sizing:border-box;overflow:hidden;margin:14px 20px 8px;padding:26px 22px 14px;border:1px solid #ae7658;border-radius:8px;background:linear-gradient(90deg,#332037f5 0,#332037ed 42%,#21182f10 85%),url("${nightScene}") right center/auto 100% no-repeat,#21182f;box-shadow:inset 0 2px #ffc98e35,inset 0 -3px #13101b80,0 5px 15px #09061133;color:#f6d9b0;pointer-events:none;image-rendering:pixelated}
    #mf-gui .mf-halloween-ribbon::before{content:"";position:absolute;inset:0 0 auto;height:32px;background:url("${garland}") left top/240px 32px repeat-x;opacity:.86;pointer-events:none}
    #mf-gui .mf-halloween-ribbon img{display:block;object-fit:contain;image-rendering:pixelated;flex:none}
    #mf-gui .mf-halloween-ribbon-pumpkin{width:64px;height:64px}
    #mf-gui .mf-halloween-ribbon-copy{position:relative;z-index:1;display:flex;flex-direction:column;gap:8px;min-width:0;max-width:70%}
    #mf-gui .mf-halloween-ribbon-copy>span{font-size:9px;line-height:1.3;letter-spacing:.16em;color:#dba6c7}
    #mf-gui .mf-halloween-ribbon-copy>strong{font-size:23px;line-height:1.2;letter-spacing:.02em;color:#ffe4b0;text-shadow:1px 2px #170f21;font-weight:800}
    #mf-gui .mf-halloween-ribbon-art{position:absolute;inset:0 0 0 auto;width:250px;pointer-events:none}
    #mf-gui .mf-halloween-ribbon-art img{position:absolute}
    #mf-gui .mf-halloween-ribbon-bat{width:44px;height:44px;right:160px;top:14px}
    #mf-gui .mf-halloween-ribbon-ghost{width:52px;height:52px;right:82px;bottom:13px}
    #mf-gui .mf-halloween-ribbon-lantern{width:40px;height:40px;right:14px;top:24px}
    @media(max-width:640px){#mf-gui .mf-halloween-art{flex-basis:112px}#mf-gui .mf-halloween-pumpkin{width:68px;height:68px;right:0}#mf-gui .mf-halloween-ghost{width:45px;height:45px;left:0}#mf-gui .mf-halloween-bat{width:40px;height:40px;left:0}#mf-gui .mf-halloween-copy h3{font-size:18px}}
    @media(max-width:800px){#mf-gui .mf-halloween-ribbon{min-height:94px;margin:10px 12px 4px;padding:25px 12px 12px;gap:10px}#mf-gui .mf-halloween-ribbon-pumpkin{width:48px;height:48px}#mf-gui .mf-halloween-ribbon-copy>strong{font-size:18px}#mf-gui .mf-halloween-ribbon-copy>span{font-size:8px;letter-spacing:.08em}#mf-gui .mf-halloween-ribbon-art{width:140px}#mf-gui .mf-halloween-ribbon-bat{right:105px;width:32px;height:32px}#mf-gui .mf-halloween-ribbon-ghost{right:36px;width:40px;height:40px}#mf-gui .mf-halloween-ribbon-lantern{right:4px;width:28px;height:28px}}
    @media(max-width:520px){#mf-gui .mf-halloween-ribbon-copy{max-width:calc(100% - 56px)}#mf-gui .mf-halloween-ribbon-copy>strong{font-size:16px}#mf-gui .mf-halloween-ribbon-art{display:none}#mf-gui .mf-halloween-ribbon{background-position:right bottom}}
    @media(prefers-reduced-motion:reduce){#mf-gui .mf-halloween-settings .mf-slider::before{transition:none}}
  `;
  (document.head || document.documentElement).appendChild(baseStyle);

  const css = `
    html[${ATTRIBUTE}="on"]{--mf-global-accent:#ff963e!important;--mf-global-panel:#17101f!important}
    html[${ATTRIBUTE}="on"] #mf-gui{
      --mf-ui-accent:#ff963e!important;--mf-ui-panel:#17101f!important;--mf-accent:#ff963e!important;
      --mf-accent2:#ffc579!important;--mf-bg:#17101f!important;--mf-text:#f5eaf7!important;--mf-sub:#c0adca!important;
      background:linear-gradient(145deg,#271a32 0,#17101f 42%,#1c1424 100%)!important;
      border:2px solid #a66e54!important;border-radius:10px!important;
      box-shadow:0 25px 80px #09050ec9,0 0 0 1px #2c182d,inset 0 0 0 3px #402938!important;color:#f5eaf7!important
    }
    html[${ATTRIBUTE}="on"] #mf-gui::after{content:"";position:absolute;inset:auto 0 0;height:5px;z-index:5;pointer-events:none;background:repeating-linear-gradient(90deg,#88523f 0 12px,#c28a5d 12px 15px,#402738 15px 30px);opacity:.8}
    html[${ATTRIBUTE}="on"] #mf-gui-content{background:linear-gradient(#1c1325f5,#150f1fde),url("${nightScene}") right bottom/auto 260px no-repeat,#181020!important}
    html[${ATTRIBUTE}="on"] #mf-gui-overlay{background:rgba(9,5,16,.62)!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-halloween-ribbon{display:flex}
    html[${ATTRIBUTE}="on"] #mf-gui-topbar{
      position:relative;background:linear-gradient(90deg,#42283d,#281c33 65%,#392338)!important;
      border-bottom:2px solid #a36c53!important;isolation:isolate
    }
    html[${ATTRIBUTE}="on"] #mf-gui-topbar::before{
      content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.44;
      background:url("${web}") left top/82px 82px no-repeat,url("${bat}") right 102px top -5px/46px 46px no-repeat
    }
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feather-nav-main{min-width:0;max-width:calc(100% - 104px)}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feather-icon-tabs{min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;overscroll-behavior-x:contain;padding-bottom:3px}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feather-icon-tabs::-webkit-scrollbar{display:none}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feather-icon-tab{flex:none}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feather-main-tab,
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feather-icon-tab,
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feather-tool{
      background:linear-gradient(#3b2944,#25192f)!important;border:1px solid #70506c!important;border-radius:6px!important;box-shadow:inset 0 2px #ac7d862b,inset 0 -2px #120e1e50
    }
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feather-main-tab.active,
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feather-icon-tab.active{
      background:linear-gradient(180deg,#764a48,#3e273d)!important;border-color:#dda36b!important;border-bottom:3px solid #ffb358!important;
      box-shadow:inset 0 2px #ffe0a64d,inset 0 -7px #b35c2824!important;color:#ffdeae!important
    }
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feather-close{background:#2b1b32!important;border-color:#ad735f!important;box-shadow:inset 0 1px #e1b18a30}
    html[${ATTRIBUTE}="on"] #mf-gui #mf-feather-filterbar{background:#22172d!important;border-color:#624151!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feather-category{color:#c9b4d2!important;border:1px solid #5e405c!important;border-radius:5px!important;background:#2b1e35!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feather-category.active{background:#55313d!important;color:#ffcc8c!important;box-shadow:inset 0 -2px #d47b3f}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-card,
    html[${ATTRIBUTE}="on"] #mf-gui .mf-toggle{
      background:linear-gradient(150deg,#302039,#1c1526 85%)!important;border-color:#765069!important;
      box-shadow:inset 0 1px #bb8b9d26,inset 0 -3px #0c091c33;border-radius:7px!important
    }
    html[${ATTRIBUTE}="on"] #mf-gui .mf-card-title{display:flex;align-items:center;gap:9px;color:#f7ce91!important;letter-spacing:.045em}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-card>.mf-card-title::before{content:"";display:block;flex:none;width:20px;height:24px;background:url("${lantern}") center/contain no-repeat;image-rendering:pixelated;pointer-events:none}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-halloween-settings{border-color:#a36b55!important;background:linear-gradient(120deg,#38233d,#211729 72%)!important;box-shadow:inset 0 3px #ffc78025!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-toggle{--mf-hw-card-glyph:url("${pumpkin}");transition:border-color 140ms ease,background-color 140ms ease!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-toggle:hover{border-color:#d69b69!important;background:linear-gradient(160deg,#422b44,#2b1c31)!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feature-icon{position:relative;isolation:isolate;filter:none}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feature-icon::before{content:"";position:absolute;z-index:-1;left:50%;top:50%;transform:translate(-50%,-50%);width:72px;height:68px;border:1px solid #85607580;border-radius:15px 15px 7px 7px;background:radial-gradient(ellipse at 50% 35%,#7d516047,transparent 80%),linear-gradient(#422c4755,#20182a88);box-shadow:inset 0 2px #cd9a7d24;pointer-events:none}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feature-icon::after{content:"";position:absolute;left:50%;bottom:2px;transform:translateX(-50%);width:82px;height:3px;background:linear-gradient(90deg,transparent,#b17a5a 20%,#e9b572 50%,#b17a5a 80%,transparent);pointer-events:none}
    html[${ATTRIBUTE}="on"] #mf-gui ::-webkit-scrollbar-thumb{background:#76506e!important;border:2px solid #211729!important;border-radius:7px!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-toggle-copy strong{color:#f5eaf7!important}
    html[${ATTRIBUTE}="on"] #mf-gui :is(.mf-feather-module-grid,.mf-toggle-grid)>.mf-toggle{position:relative}
    html[${ATTRIBUTE}="on"] #mf-gui :is(.mf-feather-module-grid,.mf-toggle-grid)>.mf-toggle::before{content:"";position:absolute;left:0;top:0;width:58px;height:58px;background:url("${web}") center/contain no-repeat;opacity:.45;pointer-events:none}
    html[${ATTRIBUTE}="on"] #mf-gui :is(.mf-feather-module-grid,.mf-toggle-grid)>.mf-toggle::after{content:"";position:absolute;left:10px;top:10px;width:22px;height:22px;background:var(--mf-hw-card-glyph) center/contain no-repeat;image-rendering:pixelated;pointer-events:none}
    html[${ATTRIBUTE}="on"] #mf-gui :is(.mf-feather-module-grid,.mf-toggle-grid)>.mf-toggle:nth-child(4n+2){--mf-hw-card-glyph:url("${lantern}")}
    html[${ATTRIBUTE}="on"] #mf-gui :is(.mf-feather-module-grid,.mf-toggle-grid)>.mf-toggle:nth-child(4n+3){--mf-hw-card-glyph:url("${potion}")}
    html[${ATTRIBUTE}="on"] #mf-gui :is(.mf-feather-module-grid,.mf-toggle-grid)>.mf-toggle:nth-child(4n){--mf-hw-card-glyph:url("${witchHat}")}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-toggle:has(.mf-switch-hidden:checked){
      border-color:#e2a263!important;box-shadow:inset 0 2px #ffd39a40,inset 3px 0 #f0a54c,inset 0 -3px #ce732533!important
    }
    html[${ATTRIBUTE}="on"] #mf-gui .mf-toggle:has(.mf-switch-hidden:checked) .mf-feature-state.enabled{
      background:linear-gradient(#744526,#583321)!important;border-color:#d79751!important;color:#ffe2a8!important
    }
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feature-state.disabled{background:#2e223b!important;border:1px solid #65445d;color:#c2b1cf!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-toggle>.mf-feature-state.enabled::before{content:"";position:absolute;left:8px;width:13px;height:13px;background:url("${pumpkin}") center/contain no-repeat;image-rendering:pixelated;pointer-events:none}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feature-settings,
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feature-favorite{background:#3b2843!important;border:1px solid #75506b!important;box-shadow:inset 0 1px #e0ac9a24}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feature-favorite.active{background:#68394d!important;border-color:#e5a27c!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-feature-settings:hover{background:#66405b!important;border-color:#ffc583!important}
    html[${ATTRIBUTE}="on"] #mf-gui input:not([type="checkbox"]):not([type="range"]):not([type="color"]),
    html[${ATTRIBUTE}="on"] #mf-gui select{background-color:#140f1d!important;border-color:#67445f!important;color:#f0e1f4!important}
    html[${ATTRIBUTE}="on"] #mf-gui input::placeholder{color:#a08dab!important}
    html[${ATTRIBUTE}="on"] #mf-gui #mf-gui-search{border:1px solid #79546f!important;box-shadow:inset 0 2px #0c081a66!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-active-count:not(:empty){color:#c4dba0;background:#273127;border:1px solid #657857;border-radius:5px;padding:6px 8px}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-settings-row{border-color:#4b334c!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-btn:not(.primary):not(.danger){background:#302137!important;border-color:#70506c!important;color:#eee0f1!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-btn.primary,
    html[${ATTRIBUTE}="on"] .mf-feature-modal .mf-btn.primary,
    html[${ATTRIBUTE}="on"] #mf-update-banner [data-mf-update-primary]{
      background:linear-gradient(180deg,#ffb45b,#e47e2c)!important;border-color:#ffc786!important;
      color:#28151a!important;box-shadow:inset 0 1px #ffe1a8!important;text-shadow:none!important
    }
    html[${ATTRIBUTE}="on"] #mf-gui :is(button,input,select):focus-visible{outline:2px solid #ffd69a!important;outline-offset:3px!important}
    html[${ATTRIBUTE}="on"] #mf-gui :is(input[type="checkbox"],input[type="range"]){accent-color:#ffa54e!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-slider{background:#47334f!important;border-color:#79516c!important}
    html[${ATTRIBUTE}="on"] #mf-gui input:checked+.mf-slider{background:#cc7837!important}
    html[${ATTRIBUTE}="on"] #mf-gui .mf-muted,
    html[${ATTRIBUTE}="on"] #mf-gui .mf-toggle-copy>span{color:#c0adca!important}
    html[${ATTRIBUTE}="on"] .mf-feature-modal,
    html[${ATTRIBUTE}="on"] #mf-update-banner,
    html[${ATTRIBUTE}="on"] #mf-polish-tooltip{
      --mf-ui-accent:#ff963e!important;--mf-ui-panel:#21152b!important;--mf-accent:#ff963e!important;
      background-color:#21152b!important;border-color:#a76954!important;color:#f5e6ef!important
    }
    html[${ATTRIBUTE}="on"] .mf-feature-modal{background-image:url("${web}"),linear-gradient(135deg,#302038,#1d1429)!important;background-position:right top,center!important;background-size:70px 70px,auto!important;background-repeat:no-repeat!important;box-shadow:inset 0 3px #efbc8130,0 24px 80px #08050ec0!important}
    html[${ATTRIBUTE}="on"] .mf-feature-modal-title{display:flex;align-items:center;gap:10px;color:#ffdfaa}
    html[${ATTRIBUTE}="on"] .mf-feature-modal-title::before{content:"";width:25px;height:28px;flex:none;background:url("${lantern}") center/contain no-repeat;image-rendering:pixelated;pointer-events:none}
    html[${ATTRIBUTE}="on"] .mf-feature-modal-row{border-color:#67445e!important}
    html[${ATTRIBUTE}="on"] #mf-hub-root{--mf-global-accent:#ff963e!important;--mf-global-panel:#17101f!important}
    html[${ATTRIBUTE}="on"] #mf-hub-root::before{background:linear-gradient(115deg,#23102f70,transparent 60%,#2f182340)!important}
    html[${ATTRIBUTE}="on"] #mf-hub-root :is(.mf-hub-navbtn,.mf-hub-friendspill,.mf-hub-picker,.mf-hub-flyout){background:linear-gradient(145deg,#302037ed,#1b1325ed)!important;border-color:#79506b!important;backdrop-filter:none!important}
    html[${ATTRIBUTE}="on"] #mf-hub-root .mf-hub-navbtn[data-active="true"]{background:linear-gradient(100deg,#65394b,#34213a)!important;border-color:#e0a36a!important;box-shadow:inset 3px 0 #ffa34c}
    html[${ATTRIBUTE}="on"] #mf-hub-root .mf-hub-navbtn:hover{border-color:#ffc583!important;color:#ffe1b4!important}
    html[${ATTRIBUTE}="on"] #mf-hub-root :is(.mf-hub-continue,.mf-hub-big,.mf-hub-fav){border-color:#775264!important;border-radius:8px!important}
    html[${ATTRIBUTE}="on"] #mf-hub-root :is(.mf-hub-continue,.mf-hub-big,.mf-hub-fav):hover{border-color:#ffc583!important}
    html[${ATTRIBUTE}="on"] #mf-hub-root .mf-hub-contplay{background:#ffc583!important;color:#291825!important;border-color:#8e593e!important}
    html[${ATTRIBUTE}="on"] #mf-hub-root .mf-hub-sechead h2{color:#ffe0ae!important}
    html[${ATTRIBUTE}="on"] #mf-hub-root .mf-hub-brand span{color:#ffdaac;opacity:1}
    html[${ATTRIBUTE}="on"] :is(#mf-hub-root .mf-hub-main,${nativeCenter})::before{
      content:var(--mf-hw-home-title) "\\A" var(--mf-hw-home-subtitle);white-space:pre-line;
      display:flex;align-items:center;box-sizing:border-box;flex:none;min-height:174px;margin:0 0 26px;padding:30px 36% 30px 24px;
      border:1px solid #a27465;border-radius:9px;color:#ffe6ba;
      font-family:inherit;font-size:clamp(17px,1.7vw,25px);font-weight:700;line-height:1.65;letter-spacing:.025em;
      background:linear-gradient(90deg,#24192ff5 0,#24192fe6 36%,#24192f00 76%),url("${nightScene}") right center/auto 100% no-repeat,#21182f;
      box-shadow:inset 0 3px #f9c98530,0 7px 18px #100a1940;image-rendering:pixelated;pointer-events:none
    }
    html[${ATTRIBUTE}="on"] ${nativeShell}>div:not(:has(a[href^="/game/"])) button{
      background-color:#281c32!important;border-color:#a27465!important;color:#ffe9ce!important
    }
    html[${ATTRIBUTE}="on"] ${nativeCenter} :is(a[href^="/game/"],[role="button"]){border-color:#92617b!important}
    html[${ATTRIBUTE}="on"] ${nativeCenter} :is(a[href^="/game/"],[role="button"]):hover{border-color:#ffc583!important}
    html[${ATTRIBUTE}="on"] #react.mf-classic-title :is(.mf-classic-title-button,.mf-classic-title-play,.mf-classic-title-back){
      background:rgba(39,20,45,.87)!important;border-color:#b06a43!important;box-shadow:inset 0 2px #e1a56b35!important;color:#ffedce!important
    }
    html[${ATTRIBUTE}="on"] #react.mf-classic-title :is(.mf-classic-title-button,.mf-classic-title-play,.mf-classic-title-back):hover{
      background:#674038!important;border-color:#ffbb69!important
    }
    html[${ATTRIBUTE}="on"] #react.mf-classic-title .mf-classic-title-brand::after{
      content:"";display:block;width:44px;height:44px;flex:none;background:url("${pumpkin}") center/contain no-repeat;image-rendering:pixelated
    }
    html[${ATTRIBUTE}="on"] #react.mf-classic-title .mf-classic-title-play{background:linear-gradient(#ffc575,#df852f)!important;color:#2c1822!important;text-shadow:none!important;border-color:#ffd29a!important;box-shadow:inset 0 -4px #a4562c,0 5px 20px #100a1950!important}
    html[${ATTRIBUTE}="on"] #react.mf-classic-title .mf-classic-title-account{background-color:#24192fed!important;border-color:#a27465!important}
    @media(min-width:1100px) and (min-height:640px){
      html[${ATTRIBUTE}="on"] #react.mf-classic-title:not(.mf-classic-title-choosing) .mf-classic-title-shell::before{
        content:var(--mf-hw-home-title) "\\A" var(--mf-hw-home-subtitle);white-space:pre-line;position:fixed;left:50%;top:16%;transform:translateX(-50%);
        box-sizing:border-box;width:min(480px,calc(100vw - 660px));min-height:170px;padding:24px 120px 24px 24px;
        border:1px solid #a27465;border-radius:8px;color:#ffe6ba;font-size:22px;line-height:1.65;font-weight:700;text-shadow:1px 2px #120c1b;
        background:linear-gradient(90deg,#24192ff5,#24192fa0 50%,transparent),url("${nightScene}") right center/auto 100% no-repeat,#21182f;
        box-shadow:inset 0 3px #f9c98530;image-rendering:pixelated;pointer-events:none
      }
    }
    @media(max-width:700px){html[${ATTRIBUTE}="on"] ${nativeCenter}::before{padding:20px 32% 20px 16px;min-height:132px;font-size:16px;margin-bottom:18px}}
    @media(max-width:800px){html[${ATTRIBUTE}="on"] #react.mf-classic-title .mf-classic-title-brand::after{display:none}}
    html[${ATTRIBUTE}="on"][${MOTION_ATTRIBUTE}="on"] #mf-gui .mf-halloween-ghost{animation:mfHalloweenFloat 5s ease-in-out infinite}
    html[${ATTRIBUTE}="on"][${MOTION_ATTRIBUTE}="on"] #mf-gui .mf-halloween-bat{animation:mfHalloweenBat 7s ease-in-out infinite}
    html[${ATTRIBUTE}="on"][${MOTION_ATTRIBUTE}="on"] #mf-gui .mf-halloween-ribbon-ghost{animation:mfHalloweenFloat 5s ease-in-out infinite}
    html[${ATTRIBUTE}="on"][${MOTION_ATTRIBUTE}="on"] #mf-gui .mf-halloween-ribbon-bat{animation:mfHalloweenBat 7s ease-in-out infinite}
    @keyframes mfHalloweenFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
    @keyframes mfHalloweenBat{0%,100%{transform:translate(0,0) rotate(-5deg)}50%{transform:translate(5px,3px) rotate(5deg)}}
    @media(max-width:800px){html[${ATTRIBUTE}="on"] #mf-gui .mf-toggle>.mf-feature-state.enabled::before{display:none}}
    @media(prefers-reduced-motion:reduce){html[${ATTRIBUTE}="on"] #mf-gui :is(.mf-halloween-ghost,.mf-halloween-bat,.mf-halloween-ribbon-ghost,.mf-halloween-ribbon-bat){animation:none!important}html[${ATTRIBUTE}="on"] #mf-gui .mf-toggle{transition:none!important}}
  `;

  function localizedCSS() {
    const dictionary = globalThis.MINIFEATHER_TRANSLATIONS?.[language] || {};
    const quote = value => '"' + value.replace(/[\\"\x00-\x1f]/g, char => `\\${char.charCodeAt(0).toString(16)} `) + '"';
    const title = typeof dictionary.halloweenTitle === 'string' ? dictionary.halloweenTitle : 'Midnight Harvest';
    const subtitle = typeof dictionary.halloweenHomeSubtitle === 'string' ? dictionary.halloweenHomeSubtitle : 'Your next adventure starts here';
    return `html[${ATTRIBUTE}="on"]{--mf-hw-home-title:${quote(title)};--mf-hw-home-subtitle:${quote(subtitle)}}`;
  }

  function attribute(name, value) {
    const root = document.documentElement;
    if (!root) return;
    if (value === null) { if (root.hasAttribute(name)) root.removeAttribute(name); }
    else if (root.getAttribute(name) !== value) root.setAttribute(name, value);
  }

  function synchronizeMotion() {
    attribute(MOTION_ATTRIBUTE, enabled && motion && !document.hidden ? 'on' : null);
  }

  function configure(value) {
    if (destroyed || !value || typeof value !== 'object') return;
    if (globalThis.__MF_SEASONAL_FLAGS__?.halloween !== true) enabled = false;
    else if (typeof value.enabled === 'boolean') enabled = value.enabled;
    if (typeof value.motion === 'boolean') motion = value.motion;
    if (typeof value.language === 'string' && languages.has(value.language)) language = value.language;
    if (enabled) {
      if (!themeStyle?.isConnected) {
        themeStyle = document.createElement('style');
        themeStyle.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(themeStyle);
      }
      if (!themeStyle.textContent || paintedLanguage !== language) {
        themeStyle.textContent = css + localizedCSS();
        paintedLanguage = language;
      }
      attribute(ATTRIBUTE, 'on');
    } else {
      attribute(ATTRIBUTE, null);
      themeStyle?.remove(); themeStyle = null;
    }
    synchronizeMotion();
  }

  function onConfig(event) {
    let value = event.detail;
    try { if (typeof value === 'string') value = JSON.parse(value); } catch (_) { return; }
    configure(value);
  }

  function destroy() {
    if (destroyed) return;
    configure({ enabled: false }); destroyed = true;
    baseStyle.remove();
    document.removeEventListener(CONFIG_EVENT, onConfig);
    document.removeEventListener('visibilitychange', synchronizeMotion);
    if (globalThis[KEY] === api) delete globalThis[KEY];
  }

  const api = { version: 4, configure, destroy, getState: () => ({ enabled, motion, language, activeStyle: !!themeStyle?.isConnected }) };
  globalThis[KEY] = api;
  document.addEventListener(CONFIG_EVENT, onConfig);
  document.addEventListener('visibilitychange', synchronizeMotion);
  document.dispatchEvent(new CustomEvent(REQUEST_EVENT));
})();
