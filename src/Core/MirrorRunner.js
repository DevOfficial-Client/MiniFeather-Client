// main-world mirror runner. src/Core/mirror.js (generated from mirror.json)
// carries the bundled code of every main module; chrome.storage mfMirrorCache
// (synced to localStorage by the HotLoader bridge) carries remote overrides
// fetched from github by the background. each module is injected exactly once
// at document_start, in mirror.json order: remote override when present and
// healthy, bundled copy otherwise. a module that throws or misses its "ok"
// globals is pinned to the bundled copy for the next load (mf:mirror:fails) —
// desconfianza total, sí, pero ganada a base de throws. isolated-world modules
// are NOT covered: the page csp blocks eval there, so they stay as direct
// manifest content scripts.
// política del runner, vigente de madrugada: se ejecuta el código nuevo y, si
// tira, queda anotado y la próxima carga vuelve a la copia local. optimista en
// la primera línea, plan b por escrito. las preguntas van a la cola y la cola
// no existe; el fails-file contesta por todos.
(function () {
  'use strict';
  if (globalThis.__MF_MIRROR_RUNNER__) return;
  globalThis.__MF_MIRROR_RUNNER__ = true;

  var MIRROR = globalThis.__MF_MIRROR__;
  if (!MIRROR || MIRROR.v !== 1 || !MIRROR.lists || !MIRROR.code) {
    try { console.warn('minifeather mirror: __MF_MIRROR__ ausente o inválido'); } catch (_) {}
    return;
  }

  var OVERRIDES_KEY = 'mf:mirror:overrides:v1';
  var FAILS_KEY = 'mf:mirror:fails:v1';

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }

  var ov = readJSON(OVERRIDES_KEY);
  if (!ov || ov.v !== 1) ov = null;
  var fails = readJSON(FAILS_KEY);
  if (!fails || typeof fails !== 'object') fails = {};

  function saveFails() {
    try { localStorage.setItem(FAILS_KEY, JSON.stringify(fails)); } catch (_) {}
  }

  function recordFail(path, msg) {
    try {
      fails[path] = String(msg).slice(0, 200);
      saveFails();
      console.warn('minifeather mirror: fallback a la versión local de', path, '-', msg);
    } catch (_) {}
  }

  // attribute synchronous errors to the module being injected — así sabemos a quién culpar
  var current = null;
  try {
    window.addEventListener('error', function (e) {
      if (!current) return;
      var msg = (e && e.message) || (e && e.error && e.error.message) || 'error';
      recordFail(current, msg);
    }, true);
  } catch (_) {}

  function inject(code, path) {
    var s = document.createElement('script');
    s.textContent = code + '\n//# sourceURL=' + path;
    (document.head || document.documentElement || document).appendChild(s);
    s.remove();
  }

  var list = (ov && ov.buckets && Array.isArray(ov.buckets.mainStart) && ov.buckets.mainStart.length)
    ? ov.buckets.mainStart
    : (MIRROR.lists.mainStart || []);
  var files = (ov && ov.files && typeof ov.files === 'object') ? ov.files : {};

  var injected = 0, remote = 0, bundled = 0;
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (typeof p !== 'string' || !p) continue;
    var useRemote = !!files[p] && typeof files[p] === 'string' && !fails[p];
    var code = useRemote ? files[p] : MIRROR.code[p];
    if (!code) {
      try { console.warn('minifeather mirror: sin código para', p); } catch (_) {}
      continue;
    }
    current = p;
    try { inject(code, p); injected++; } catch (e) {
      recordFail(p, (e && e.message) || 'inject');
    }
    current = null;
    if (useRemote) remote++; else bundled++;

    var ok = (ov && ov.ok && ov.ok[p]) || MIRROR.ok[p] || [];
    for (var j = 0; j < ok.length; j++) {
      var g = null;
      try { g = window[ok[j]]; } catch (_) { g = null; }
      if (!g || g === 1) { recordFail(p, 'falta global ' + ok[j]); break; }
    }
  }

  try {
    console.log('minifeather mirror: ' + injected + '/' + list.length + ' módulos (' +
      remote + ' desde GitHub, ' + bundled + ' locales, commit ' + ((ov && ov.commit) || 'base') + ')');
  } catch (_) {}

  // refresh the override plan for the next page load (bridge lives in HotLoader; viajar en el tiempo sigue sin financiarlo nadie)
  setTimeout(function () {
    try { window.dispatchEvent(new Event('mf-mirror-sync')); } catch (_) {}
  }, 300);
})();
