(() => {
  'use strict';

  try { globalThis.__MINIFEATHER_SPLASH__?.destroy?.(); } catch (_) {}

  try {
    if (document.documentElement) {
      for (const [name, path] of [
        ['mf-mirror-base', 'assets/mfpack/'],
        ['mf-skins-base', 'skins/'],
        ['mf-particles-base', 'assets/particles/']
      ]) {
        let meta = document.querySelector(`meta[name="${name}"]`);
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = name;
          document.documentElement.appendChild(meta);
        }
        meta.content = chrome.runtime.getURL(path);
      }
    }
  } catch (_) {}

  const ROOT_ID = 'mf-startup-splash';
  const STYLE_ID = 'mf-startup-splash-style';
  const TOTAL_MS = 2850;
  const MIN_VISIBLE_MS = 220;
  const LOGO_URL = chrome.runtime.getURL('assets/icon.png');
  let root = null;
  let style = null;
  let endTimer = 0;
  let playToken = 0;
  let startedAt = 0;
  let destroyed = false;
  const eventController = new AbortController();

  function makeStyle() {
    const element = document.createElement('style');
    element.id = STYLE_ID;
    element.textContent = `
#${ROOT_ID}{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;overflow:hidden;isolation:isolate;contain:layout paint style;pointer-events:none;user-select:none;color:#f4fbff;font-family:Inter,'Segoe UI',system-ui,sans-serif;background:radial-gradient(ellipse at 50% 46%,#102840 0%,#061422 48%,#020811 100%);opacity:0;will-change:opacity;animation:mfSplashVisibility ${TOTAL_MS}ms linear both}
#${ROOT_ID}::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 28% 40%,rgba(82,193,255,.09),transparent 29%),radial-gradient(circle at 74% 54%,rgba(91,177,255,.07),transparent 31%);pointer-events:none}
#${ROOT_ID}::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 42%,rgba(0,0,0,.42) 100%);pointer-events:none}
#${ROOT_ID} .mf-splash-stage{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:28px;width:min(1000px,92vw);min-height:270px;transform:translateZ(0)}
#${ROOT_ID} .mf-splash-logo{position:relative;flex:none;display:grid;place-items:center;width:144px;height:144px;border-radius:31px;background:#122b43;box-shadow:inset 0 0 0 1px rgba(161,222,255,.28),0 13px 27px rgba(0,0,0,.36),0 0 32px rgba(71,179,246,.1);opacity:0;will-change:transform,opacity;animation:mfSplashLogo ${TOTAL_MS}ms linear both}
#${ROOT_ID} .mf-splash-logo img{display:block;width:132px;height:132px;object-fit:cover;border-radius:26px}
#${ROOT_ID} .mf-splash-copy{position:relative;isolation:isolate;flex:none;opacity:0;will-change:transform,opacity;animation:mfSplashTitle ${TOTAL_MS}ms linear both}
#${ROOT_ID} .mf-splash-word{position:relative;display:block;white-space:nowrap;font-size:clamp(44px,6.1vw,76px);line-height:1.14;letter-spacing:-.055em;font-weight:750}
#${ROOT_ID} .mf-splash-word .mf-mini{font-weight:540}
#${ROOT_ID} .mf-splash-depth{position:absolute;inset:0;z-index:-1;color:#274f70;transform:translate3d(5px,7px,0) skewX(-5deg);text-shadow:1px 1px 0 #1f405d,2px 2px 0 #17354e,3px 3px 0 #10283b,5px 8px 15px rgba(0,0,0,.45)}
#${ROOT_ID} .mf-splash-face{position:relative;background:linear-gradient(180deg,#fff 4%,#e8f7ff 43%,#a4dcfa 87%,#76bde7 100%);background-clip:text;-webkit-background-clip:text;color:transparent;-webkit-text-fill-color:transparent;-webkit-text-stroke:.4px rgba(219,245,255,.35)}
#${ROOT_ID} .mf-splash-streak{position:absolute;left:1%;right:1%;bottom:-17px;height:2px;background:linear-gradient(90deg,transparent,#84dfff 18%,#e6faff 55%,#65bdf1 82%,transparent);box-shadow:0 0 8px rgba(72,188,255,.32);transform:scaleX(0);transform-origin:left center;opacity:0;will-change:transform,opacity;animation:mfSplashStreak ${TOTAL_MS}ms linear both}
#${ROOT_ID} .mf-splash-feather{position:absolute;z-index:2;left:0;top:0;width:77px;height:77px;opacity:0;will-change:transform,opacity;animation:mfSplashFeather ${TOTAL_MS}ms linear both}
#${ROOT_ID} .mf-splash-feather svg{display:block;width:100%;height:100%}
#${ROOT_ID} .mf-splash-stars{position:absolute;inset:0;background:radial-gradient(circle at 21% 39%,#8ed9ff 0 1px,transparent 2px),radial-gradient(circle at 36% 61%,#aedfff 0 1px,transparent 2px),radial-gradient(circle at 69% 31%,#8ed9ff 0 1px,transparent 2px),radial-gradient(circle at 81% 63%,#b7e9ff 0 1px,transparent 2px);opacity:0;animation:mfSplashStars ${TOTAL_MS}ms linear both}
@keyframes mfSplashVisibility{0%{opacity:0}7%,84%{opacity:1}100%{opacity:0}}
@keyframes mfSplashLogo{0%,13%{opacity:0;transform:translate3d(0,18px,0) scale(.82)}31%{opacity:1;transform:translate3d(0,-3px,0) scale(1.025)}38%,100%{opacity:1;transform:translate3d(0,0,0) scale(1)}}
@keyframes mfSplashTitle{0%,22%{opacity:0;transform:perspective(780px) translate3d(0,19px,0) rotateX(14deg)}42%{opacity:1;transform:perspective(780px) translate3d(0,-2px,0) rotateX(-2deg)}48%,100%{opacity:1;transform:perspective(780px) translate3d(0,0,0) rotateX(0)}}
@keyframes mfSplashStreak{0%,24%{opacity:0;transform:scaleX(0)}30%{opacity:.8}63%,83%{opacity:.95;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1)}}
@keyframes mfSplashStars{0%,7%{opacity:0}24%,82%{opacity:.6}100%{opacity:0}}
@keyframes mfSplashFeather{0%,3%{opacity:0;transform:translate3d(8vw,69vh,0) rotate(-22deg) scale(.68)}10%{opacity:.95;transform:translate3d(19vw,46vh,0) rotate(-32deg) scale(.77)}20%{transform:translate3d(33vw,32vh,0) rotate(-12deg) scale(.86)}31%{transform:translate3d(44vw,42vh,0) rotate(4deg) scale(.84)}46%{transform:translate3d(61vw,51vh,0) rotate(-6deg) scale(.72)}62%{opacity:.95;transform:translate3d(78vw,43vh,0) rotate(-19deg) scale(.6)}76%{opacity:0;transform:translate3d(86vw,23vh,0) rotate(-44deg) scale(.43)}100%{opacity:0;transform:translate3d(86vw,23vh,0) rotate(-44deg) scale(.43)}}
@media(max-width:700px){#${ROOT_ID} .mf-splash-stage{flex-direction:column;gap:12px;min-height:330px}#${ROOT_ID} .mf-splash-logo{width:108px;height:108px;border-radius:24px}#${ROOT_ID} .mf-splash-logo img{width:100px;height:100px;border-radius:21px}#${ROOT_ID} .mf-splash-word{font-size:clamp(36px,9vw,62px)}#${ROOT_ID} .mf-splash-streak{bottom:-13px}#${ROOT_ID} .mf-splash-feather{width:58px;height:58px}}
`;
    return element;
  }

  function makeRoot() {
    const element = document.createElement('div');
    element.id = ROOT_ID;
    element.setAttribute('role', 'presentation');
    element.innerHTML = `<div class="mf-splash-stars"></div><div class="mf-splash-stage"><div class="mf-splash-logo"><img src="${LOGO_URL}" alt="" decoding="async" fetchpriority="high"></div><div class="mf-splash-copy"><div class="mf-splash-word" aria-label="MiniFeather"><span class="mf-splash-depth" aria-hidden="true"><span class="mf-mini">Mini</span>Feather</span><span class="mf-splash-face"><span class="mf-mini">Mini</span>Feather</span></div><div class="mf-splash-streak"></div></div></div><div class="mf-splash-feather" aria-hidden="true"><svg viewBox="0 0 90 60" xmlns="http://www.w3.org/2000/svg"><path d="M3 37C14 19 34 7 63 3c10-1 18 1 24 5-7 16-21 29-42 35-16 5-30 3-42-3 10-1 18-4 25-8-10 3-18 5-25 5Z" fill="#dff4ff"/><path d="M24 29C38 16 57 10 82 6c-9 11-23 21-40 25-8 2-13 2-18-2Z" fill="#9ddcff"/><path d="M5 39C29 31 53 18 83 7M26 26l-8-9m20 4-8-11m20 7-3-11m14 7 1-8M34 30l-8 10m18-14-6 12m18-17-4 13m17-21-3 11" fill="none" stroke="#f7fcff" stroke-width="1.8" stroke-linecap="round"/><path d="M4 39-4 53" fill="none" stroke="#73caff" stroke-width="2" stroke-linecap="round"/></svg></div>`;
    return element;
  }

  function removeRoot() {
    root?.remove();
    style?.remove();
    root = null;
    style = null;
  }

  function skip() {
    if (!root || performance.now() - startedAt < MIN_VISIBLE_MS) return;
    const token = ++playToken;
    clearTimeout(endTimer);
    endTimer = 0;
    if (typeof root.animate !== 'function') { removeRoot(); return; }
    const opacity = Number(getComputedStyle(root).opacity) || 0;
    root.style.animation = 'none';
    const animation = root.animate([{ opacity }, { opacity: 0 }], {
      duration: 140, easing: 'ease-out', fill: 'forwards'
    });
    animation.finished.catch(() => {}).finally(() => {
      if (playToken === token) removeRoot();
    });
  }

  function startAnimation() {
    if (destroyed) return;
    const token = ++playToken;
    clearTimeout(endTimer);
    removeRoot();
    style = makeStyle();
    root = makeRoot();
    const parent = document.documentElement || document;
    parent.appendChild(style);
    parent.appendChild(root);
    startedAt = performance.now();
    endTimer = setTimeout(() => {
      if (playToken === token && !destroyed) { removeRoot(); endTimer = 0; }
    }, TOTAL_MS + 120);
  }

  function play({ force = false } = {}) {
    if (destroyed) return;
    if (force) { startAnimation(); return; }
    try {
      chrome.storage.local.get(['settings'], data => {
        if (destroyed || data?.settings?.startupAnimation === false) return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        startAnimation();
      });
    } catch (_) { startAnimation(); }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    playToken++;
    clearTimeout(endTimer);
    endTimer = 0;
    eventController.abort();
    removeRoot();
    if (globalThis.__MINIFEATHER_SPLASH__?.destroy === destroy) delete globalThis.__MINIFEATHER_SPLASH__;
  }

  document.addEventListener('minifeather:splash-replay', () => play({ force: true }), { signal: eventController.signal });
  window.addEventListener('keydown', event => {
    if (event.code !== 'Escape' || !root) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    skip();
  }, { capture: true, signal: eventController.signal });
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings?.newValue) return;
      if (changes.settings.newValue.startupAnimation === false && root) {
        playToken++;
        clearTimeout(endTimer);
        endTimer = 0;
        removeRoot();
      }
    });
  } catch (_) {}
  globalThis.__MINIFEATHER_SPLASH__ = { play, skip, destroy };
  play();
})();
