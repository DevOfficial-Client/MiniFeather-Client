// MiniFeather — HotLoader: auto-updater de módulos .js directo desde GitHub.
//
// El updater del background (MF_AUTO_UPDATER_V2) compara los archivos del
// repo con los instalados y guarda en caché (chrome.storage → localStorage
// de la página) el TEXTO de los .js que cambiaron (lista: hotload.json).
// Este loader (ISOLATED, document_start, ANTES de los demás content
// scripts) hace dos cosas:
//
//  1. document_start (síncrono): marca los "guards" de los módulos hot
//     cuyo re-run no es seguro (p.ej. MF_Facial: `if (window.__MF_Facial)
//     return;`) → la versión empaquetada NUNCA inicializa.
//  2. DOMContentLoaded (después de que corrieron los built-in): borra los
//     guards e inyecta el código NUEVO inline. Los módulos con patrón
//     dispose (MF_Peer/SpiderSim/SpiderBot/ClientCommands) desechan la
//     instancia empaquetada y quedan los nuevos.
//
// FALLBACK: cada módulo hot corre envuelto en un runner que verifica que
// dejó sus globals ("ok" de hotload.json). Si el código nuevo lanza o no
// inicializa → se inyecta la versión EMPAQUETADA del propio paquete
// (chrome.runtime.getURL) y el módulo sigue funcionando como siempre.
//
// Sin plan en localStorage (primera vez / sin cambios) no se inyecta nada
// y la extensión se comporta exactamente como siempre.
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
  // solo archivos con código válido (un archivo vacío NO bloquea a su
  // built-in con marcadores inútiles)
  const paths = plan
    ? Object.keys(plan.files).filter(p => typeof plan.files[p] === 'string' && plan.files[p])
    : [];

  // fallback: inyectar la versión empaquetada de un módulo cuyo hot falló
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
    // el runner de la página MAIN avisa por dataset en documentElement
    // (CustomEvent no cruza mundos ISOLATED↔MAIN de forma confiable).
    // Poleamos barato: si el módulo nuevo falló, inyectamos el built-in.
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
      // permitir más de un fallback en la misma tanda
      setTimeout(() => { polled = false; }, 50);
    };
    try {
      window.addEventListener('mf-hot-fallback', () => { try { poller(); } catch (_) {} });
    } catch (_) {}
    try {
      // el ISOLATED corre cada poco por si el MAIN dispara el dataset
      setInterval(poller, 200);
    } catch (_) {}
  }

  if (paths.length) {
    const guards = plan.guards || {};
    const okMap = plan.ok || {};

    // (1) marcadores: bloquean la inicialización de las versiones
    // empaquetadas de los módulos con guard simple
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

    // (2) el código nuevo corre DESPUÉS de los built-in: los módulos
    // dispose reemplazan limpio; a los de guard se les borra la marca
    // justo antes de que inicialicen. El runner verifica el resultado y
    // pide fallback si el módulo nuevo no levantó.
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
          'if(!v||v===1){__good=false;break}}' + // 1 = nuestro marcador
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

  // refrescar el plan para el PRÓXIMO arranque: el background compara los
  // .js del repo (hotload.json) contra los instalados y devuelve los que
  // cambiaron (texto incluido). Si no hay cambios → plan vacío.
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
      } catch (_) {} // QuotaExceeded: se queda el plan anterior (sigue funcionando)
    });
  } catch (_) {}
})();
