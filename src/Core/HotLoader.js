
(function () {
  'use strict';
  if (globalThis.__MF_HOTLOADER__) return;
  globalThis.__MF_HOTLOADER__ = true;

  const KEY = 'mf:hot:v1';

  function readPlan() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || 'null');
      return p && p.v === 1 && p.files && typeof p.files === 'object' ? p : null;
    } catch (_) { return null; }
  }

  function injectInline(code) {
    const s = document.createElement('script');
    s.textContent = code;
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  }

  const plan = readPlan();
  
  const paths = plan
    ? Object.keys(plan.files).filter(p => typeof plan.files[p] === 'string' && plan.files[p])
    : [];

  function fallback(path, guards) {
    try {
      fetch(chrome.runtime.getURL(path))
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(code => {
          const del = (guards || [])
            .map(g => 'try{delete window[' + JSON.stringify(g) + ']}catch(e){}')
            .join('');
          injectInline(del + '\n' + code + '\n//# sourceURL=' + path + ' (fallback)');
          try { console.warn('[MF HotLoader] hot falló → versión empaquetada:', path); } catch (_) {}
        })
        .catch(() => {
          try { console.warn('[MF HotLoader] fallback no disponible:', path); } catch (_) {}
        });
    } catch (_) {}
  }

  if (plan) {
    
    let polled = false;
    const poller = () => {
      if (polled) return;
      polled = true;
      let p = '';
      try { p = document.documentElement.dataset.mfHotFallback || ''; } catch (_) {}
      try { delete document.documentElement.dataset.mfHotFallback; } catch (_) {}
      if (!p || typeof plan.files[p] !== 'string') {
        polled = false;
        return;
      }
      fallback(p, (plan.guards || {})[p] || []);
      
      setTimeout(() => { polled = false; }, 50);
    };
    try {
      window.addEventListener('mf-hot-fallback', () => { try { poller(); } catch (_) {} });
    } catch (_) {}
    try {
      
      setInterval(poller, 200);
    } catch (_) {}
  }

  if (paths.length) {
    const guards = plan.guards || {};
    const okMap = plan.ok || {};

    const all = [];
    for (const p of paths) {
      for (const g of (guards[p] || [])) if (all.indexOf(g) === -1) all.push(g);
    }
    if (all.length) {
      try {
        injectInline('try{' +
          all.map(g => 'window[' + JSON.stringify(g) + ']=window[' + JSON.stringify(g) + ']||1').join(';') +
          '}catch(e){}');
      } catch (_) {}
    }

    const run = () => {
      if (globalThis.__MF_HOT_RAN__) return;
      globalThis.__MF_HOT_RAN__ = true;
      for (const p of paths) {
        const code = plan.files[p];
        const del = (guards[p] || [])
          .map(g => 'try{delete window[' + JSON.stringify(g) + ']}catch(e){}')
          .join('');
        const ok = okMap[p] || [];
        const runner =
          '(function(){' +
          'var __p=' + JSON.stringify(p) + ',__ok=' + JSON.stringify(ok) + ';' +
          'try{' + del + '\n' + code + '\n}catch(e){' +
          'try{window.__MF_HOT_FAIL__=window.__MF_HOT_FAIL__||{};' +
          'window.__MF_HOT_FAIL__[__p]=String(e&&e.message||e)}catch(_){}}' +
          'var __good=true;' +
          'for(var i=0;i<__ok.length;i++){var v=window[__ok[i]];' +
          'if(!v||v===1){__good=false;break}}' + 
          'if(!__good){try{document.documentElement.dataset.mfHotFallback=__p;' +
          'window.dispatchEvent(new Event("mf-hot-fallback"))}catch(e){}}' +
          '})();' +
          '\n//# sourceURL=' + p;
        try {
          injectInline(runner);
        } catch (e) {
          try { console.warn('[MF HotLoader] fallo inyectando', p, e && e.message); } catch (_) {}
        }
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  try {
    chrome.runtime.sendMessage({ type: 'mfHot:sync' }, (res) => {
      try {
        if (chrome.runtime.lastError || !res || !res.success) return;
        const next = {
          v: 1,
          commit: res.commit || null,
          ts: Date.now(),
          files: res.files && typeof res.files === 'object' ? res.files : {},
          guards: res.guards && typeof res.guards === 'object' ? res.guards : {},
          ok: res.ok && typeof res.ok === 'object' ? res.ok : {}
        };
        if (!Object.keys(next.files).length) {
          localStorage.removeItem(KEY);
          return;
        }
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch (_) {} 
    });
  } catch (_) {}
})();
