// moderación remota del client: moderation.json (raíz del repo) es la única ley.
// kill switch total, baneo de cuentas (uuid y/o nombre) y bloqueo fino de
// módulos por path. este archivo va PRIMERO en mirror.json mainStart porque su
// veredicto se consulta antes de inyectar cualquier otro módulo: con lock
// activo MirrorRunner ni lo intenta, el plan de HotLoader se salta los archivos
// y en los bundles móviles un throw corta el docStart entero (ahí todo el grupo
// es una sola función, cortar arriba es cortar todo). el overlay se re-crea
// solo y traga teclado/ratón en capture, porque siempre hay algo intentando
// colarse por debajo.
// la ia de turno: sí, un kill switch remoto dentro de un client mod suena a
// villanía de película, pero es la única forma de apagar la luz en 400
// instalaciones sin esperar que cada una actualice a mano. el EULA 8.5 lo
// dice en cristiano y el que instaló aceptó. la config es fail-open: sin
// red manda el último cache, y una config rota se ignora en vez de brickear.
(function () {
  'use strict';
  if (window.__MF_MODERATION__) return;

  var MOD_URL = 'https://raw.githubusercontent.com/DevOfficial-Client/MiniFeather-Client/main/moderation.json';
  var CFG_KEY = 'mf:moderation:v1';      // última config remota conocida
  var BAN_KEY = 'mf:moderation:ban:v1';  // veredicto personal: esta cuenta está baneada
  var OVERLAY_ID = 'mf-moderation-lock';
  var TOAST_ID = 'mf-moderation-toast';
  var BOOT_FETCH_DELAY = 2500;           // deja respirar al boot crítico antes del primer fetch
  var POLL_MS = 5 * 60 * 1000;           // la obediencia se refresca cada 5 minutos
  var RELOAD_DELAY = 1500;

  var T = {
    es: {
      killTitle: 'CLIENTE DESHABILITADO',
      killSub: 'El administrador deshabilitó MiniFeather Client en este dispositivo.',
      banTitle: 'CUENTA BANEADA',
      banSub: 'Tu cuenta no puede usar MiniFeather Client.',
      noReason: 'sin motivo especificado',
      reasonLabel: 'Motivo: ',
      footer: 'Si crees que es un error, contacta con el administrador del client.',
      moduleToast: 'Moderación: módulos actualizados, recargando…'
    },
    en: {
      killTitle: 'CLIENT DISABLED',
      killSub: 'The administrator disabled MiniFeather Client on this device.',
      banTitle: 'ACCOUNT BANNED',
      banSub: 'Your account is not allowed to use MiniFeather Client.',
      noReason: 'no reason given',
      reasonLabel: 'Reason: ',
      footer: 'If you think this is a mistake, contact the client administrator.',
      moduleToast: 'Moderation: modules updated, reloading…'
    }
  }[(navigator.language || 'es').toLowerCase().indexOf('en') === 0 ? 'en' : 'es'];

  function readJSON(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || 'null');
      return v && typeof v === 'object' ? v : null;
    } catch (_) { return null; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }
  function clearKey(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  var cfg = readJSON(CFG_KEY); // { v:1, ts, hash, cfg:{killSwitch, bannedAccounts, blockedModules} }
  var ban = readJSON(BAN_KEY); // { uuid, name, reason, since, ts }
  var identitySeen = null;
  var reloading = false;

  // --- config: normalizar, hashear, consultar -------------------------------

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
    var ks = raw.killSwitch || {};
    var bansIn = Array.isArray(raw.bannedAccounts) ? raw.bannedAccounts : [];
    var blocksIn = (raw.blockedModules && typeof raw.blockedModules === 'object' && !Array.isArray(raw.blockedModules))
      ? raw.blockedModules : {};
    var bans = [];
    for (var i = 0; i < bansIn.length; i++) {
      var b = bansIn[i] || {};
      var uuid = String(b.uuid || '').trim().toLowerCase();
      var name = String(b.name || '').trim().toLowerCase();
      if (!uuid && !name) continue; // un ban sin identificador no banea a nadie, por suerte
      bans.push({
        uuid: uuid,
        name: name,
        reason: String(b.reason || '').trim().slice(0, 300),
        since: String(b.since || '').trim().slice(0, 40)
      });
    }
    var blocks = {};
    for (var p in blocksIn) {
      if (!Object.prototype.hasOwnProperty.call(blocksIn, p)) continue;
      if (!/^src\/[\w.\-\/]+\.js$/.test(p)) continue; // solo paths de módulos; nada de ../../rarezas
      blocks[p] = String(blocksIn[p] || '').trim().slice(0, 300);
    }
    return {
      killSwitch: {
        active: !!ks.active,
        reason: String(ks.reason || '').trim().slice(0, 300),
        since: String(ks.since || '').trim().slice(0, 40)
      },
      bannedAccounts: bans,
      blockedModules: blocks
    };
  }

  function hashOf(n) {
    var s = JSON.stringify([n.killSwitch, n.bannedAccounts, n.blockedModules]);
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(36) + '-' + s.length.toString(36);
  }

  function killActive() {
    return !!(cfg && cfg.cfg && cfg.cfg.killSwitch && cfg.cfg.killSwitch.active);
  }
  function locked() {
    return killActive() || !!ban;
  }
  function lockKind() {
    return ban ? 'ban' : (killActive() ? 'kill' : null);
  }
  function lockReason() {
    if (ban) return ban.reason || '';
    if (killActive()) return cfg.cfg.killSwitch.reason || '';
    return '';
  }

  // api pública, consultada por MirrorRunner / HotLoader entre módulo y módulo.
  // getters, no valores: el veredicto puede cambiar en caliente (poll) y el
  // runner tiene que ver el estado del momento, no el del arranque.
  var api = {
    v: 1,
    get locked() { return locked(); },
    get kind() { return lockKind(); },
    get reason() { return lockReason(); },
    isBlocked: function (path) {
      return !!(cfg && cfg.cfg && cfg.cfg.blockedModules && cfg.cfg.blockedModules[path]);
    },
    blockReason: function (path) {
      return (cfg && cfg.cfg && cfg.cfg.blockedModules && cfg.cfg.blockedModules[path]) || '';
    },
    refresh: function () { fetchNow('manual'); }
  };
  window.__MF_MODERATION__ = api;

  // --- overlay + bloqueo de input -------------------------------------------

  function featherSvg() {
    return '<svg width="34" height="23" viewBox="0 0 90 60" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3 37C14 19 34 7 63 3c10-1 18 1 24 5-7 16-21 29-42 35-16 5-30 3-42-3 10-1 18-4 25-8-10 3-18 5-25 5Z" fill="#dff4ff"/>' +
      '<path d="M24 29C38 16 57 10 82 6c-9 11-23 21-40 25-8 2-13 2-18-2Z" fill="#9ddcff"/></svg>';
  }

  function ensureOverlay() {
    var el = document.getElementById(OVERLAY_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = OVERLAY_ID;
    var isBan = lockKind() === 'ban';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
      'background:radial-gradient(1200px 700px at 50% 30%,#1c1430 0%,#0f0a1a 60%,#080510 100%);pointer-events:auto;' +
      'font-family:sans-serif;user-select:none';
    el.innerHTML =
      '<div style="max-width:560px;margin:20px;background:#181228;border:1px solid #6045a0;border-radius:12px;' +
      'padding:34px 30px;text-align:center;box-shadow:0 12px 48px #000">' +
      featherSvg() +
      '<h1 style="margin:14px 0 6px;font-size:24px;letter-spacing:2px;color:#e8e4f5">' + (isBan ? T.banTitle : T.killTitle) + '</h1>' +
      '<p style="margin:0 0 18px;color:#b79bff;font-size:14px">' + (isBan ? T.banSub : T.killSub) + '</p>' +
      '<div id="mf-mod-reason" style="background:#0f0a1a;border:1px solid #3a2a5e;border-radius:8px;padding:12px 14px;' +
      'color:#e8e4f5;font-size:14px;word-break:break-word"></div>' +
      '<p style="margin:18px 0 0;color:#8a7fae;font-size:12px">' + T.footer + '</p>' +
      '</div>';
    // el motivo va por textContent: la razón la escribe un humano en un json,
    // pero la higiene no se negocia ni en confianza
    var reasonBox = el.querySelector('#mf-mod-reason');
    if (reasonBox) reasonBox.textContent = T.reasonLabel + (lockReason() || T.noReason);
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  var BLOCKED_EVENTS = ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click', 'dblclick',
    'contextmenu', 'wheel', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup'];
  var blockersArmed = false;
  function swallow(e) {
    try {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
    } catch (_) {}
    return false;
  }
  function armBlockers() {
    if (blockersArmed) return;
    blockersArmed = true;
    for (var i = 0; i < BLOCKED_EVENTS.length; i++) {
      try { document.addEventListener(BLOCKED_EVENTS[i], swallow, true); } catch (_) {}
      try { window.addEventListener(BLOCKED_EVENTS[i], swallow, true); } catch (_) {}
    }
  }
  function disarmBlockers() {
    if (!blockersArmed) return;
    blockersArmed = false;
    for (var i = 0; i < BLOCKED_EVENTS.length; i++) {
      try { document.removeEventListener(BLOCKED_EVENTS[i], swallow, true); } catch (_) {}
      try { window.removeEventListener(BLOCKED_EVENTS[i], swallow, true); } catch (_) {}
    }
  }

  function announceState() {
    try {
      document.dispatchEvent(new CustomEvent('mf:moderation:state', {
        detail: JSON.stringify({ locked: locked(), kind: lockKind(), reason: lockReason() })
      }));
    } catch (_) {}
  }

  function enforce() {
    ensureOverlay();
    armBlockers();
    try { console.warn('minifeather moderation: LOCK (' + lockKind() + ') — ' + (lockReason() || T.noReason)); } catch (_) {}
    announceState();
  }

  function toast(msg) {
    try {
      var old = document.getElementById(TOAST_ID);
      if (old) old.remove();
      var t = document.createElement('div');
      t.id = TOAST_ID;
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483646;' +
        'background:rgba(24,18,40,.96);border:1px solid #6045a0;color:#e8e4f5;font:13px/1.4 sans-serif;' +
        'padding:10px 16px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5)';
      t.textContent = msg;
      (document.body || document.documentElement).appendChild(t);
      setTimeout(function () { try { t.remove(); } catch (_) {} }, 4000);
    } catch (_) {}
  }

  function reloadSoon(ms) {
    if (reloading) return;
    reloading = true;
    setTimeout(function () { try { location.reload(); } catch (_) {} }, ms || RELOAD_DELAY);
  }

  // --- identidad: quién eres lo dice el juego, no el client ------------------

  function currentIdentity() {
    var cands = [
      globalThis.miniblox, globalThis.minibloxGame, globalThis.__MINIBLOX_GAME__,
      globalThis.__MB && globalThis.__MB.game, globalThis.game, globalThis.__game
    ];
    var g = null;
    for (var i = 0; i < cands.length; i++) {
      if (cands[i] && cands[i].player) { g = cands[i]; break; }
    }
    if (!g) return null;
    var pl = g.player || {};
    var prof = pl.profile || {};
    var id = {
      name: String(prof.username || pl.username || pl.name || '').trim().slice(0, 24),
      uuid: String(prof.uuid || pl.uuid || '').trim()
    };
    return (id.name || id.uuid) ? id : null;
  }

  function matchBan(list, id) {
    if (!list || !list.length || !id) return null;
    var name = (id.name || '').toLowerCase();
    var uuid = (id.uuid || '').toLowerCase();
    if (!name && !uuid) return null;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (uuid && r.uuid && uuid === r.uuid) return r;
      if (name && r.name && name === r.name) return r;
    }
    return null;
  }

  function applyBanVerdict(hit, id) {
    ban = {
      uuid: hit.uuid || (id.uuid || '').toLowerCase(),
      name: hit.name || (id.name || '').toLowerCase(),
      reason: hit.reason || '',
      since: hit.since || '',
      ts: Date.now()
    };
    writeJSON(BAN_KEY, ban);
    enforce();
    reloadSoon();
  }

  function checkIdentity(id) {
    if (!id || (!id.name && !id.uuid)) return;
    identitySeen = id;
    if (ban) return; // ya está sentenciado; el desban lo decide el fetch, no el juego
    var hit = matchBan(cfg && cfg.cfg && cfg.cfg.bannedAccounts, id);
    if (hit) {
      try { console.warn('minifeather moderation: cuenta en la banlist —', id.name || id.uuid); } catch (_) {}
      applyBanVerdict(hit, id);
    }
  }

  // el juego emite la identidad por evento (ClientChatIdentity) y yo también
  // la sondeo directo del objeto del juego: con el lock activo nuestros
  // módulos están muertos, así que el propio juego es la única fuente viva
  try {
    document.addEventListener('minifeather:client-chat-identity', function (e) {
      try {
        var d = JSON.parse(e.detail || '{}');
        if (d && (d.username || d.uuid)) checkIdentity({ name: String(d.username || ''), uuid: String(d.uuid || '') });
      } catch (_) {}
    }, true);
  } catch (_) {}
  var idPolls = 0;
  var idTimer = setInterval(function () {
    try { checkIdentity(currentIdentity()); } catch (_) {}
    if (++idPolls > 40) { clearInterval(idTimer); idTimer = 0; } // 2 min de gracia y a casa
  }, 3000);

  // --- fetch + transiciones ---------------------------------------------------

  var fetching = false;
  function fetchNow(why) {
    if (fetching) return;
    fetching = true;
    fetch(MOD_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (raw) { try { applyConfig(raw, why); } catch (_) {} })
      .catch(function () {})
      .then(function () { fetching = false; });
  }

  function blocksChanged(prevCfg, next) {
    if (!prevCfg || !prevCfg.cfg) return false;
    return JSON.stringify(prevCfg.cfg.blockedModules || {}) !== JSON.stringify(next.blockedModules || {});
  }

  function applyConfig(raw, why) {
    var n = normalize(raw);
    if (!n) {
      try { console.warn('minifeather moderation: config inválida, la ignoro (' + why + ')'); } catch (_) {}
      return;
    }
    var h = hashOf(n);
    var prev = cfg;
    var prevHash = prev ? prev.hash : null;
    var prevKill = !!(prev && prev.cfg && prev.cfg.killSwitch && prev.cfg.killSwitch.active);

    cfg = { v: 1, ts: Date.now(), hash: h, cfg: n };
    writeJSON(CFG_KEY, cfg);

    if (h === prevHash) return; // nada nuevo bajo el sol (solo refrescamos ts)

    try {
      console.log('minifeather moderation: config actualizada (' + why + ') — kill=' + n.killSwitch.active +
        ' bans=' + n.bannedAccounts.length + ' bloqueados=' + Object.keys(n.blockedModules).length);
    } catch (_) {}

    // kill switch ON recién visto: lock ya y reload para un boot que obedezca de verdad
    if (n.killSwitch.active && !prevKill) {
      enforce();
      reloadSoon();
      return;
    }
    // kill switch apagado y estábamos locked SOLO por kill: restaurar el client
    if (!n.killSwitch.active && prevKill && !ban) {
      disarmBlockers();
      try {
        var ov = document.getElementById(OVERLAY_ID);
        if (ov) ov.remove();
      } catch (_) {}
      announceState();
      reloadSoon();
      return;
    }
    // si el kill sigue activo, el ban manda por debajo pero el overlay ya cumple

    // baneo nuevo con identidad conocida
    var hit = matchBan(n.bannedAccounts, identitySeen);
    if (hit && !ban && identitySeen) {
      applyBanVerdict(hit, identitySeen);
      return;
    }
    // desbanado: tenía veredicto, sé quién soy y la lista ya no me contiene
    if (ban && identitySeen && !hit) {
      clearKey(BAN_KEY);
      ban = null;
      if (!n.killSwitch.active) {
        disarmBlockers();
        try {
          var ov2 = document.getElementById(OVERLAY_ID);
          if (ov2) ov2.remove();
        } catch (_) {}
        announceState();
        reloadSoon();
        return;
      }
    }
    // bloqueo de módulos cambiado con el client vivo: los skips pasan en el
    // boot, así que un reload limpio es la obediencia más barata
    if (blocksChanged(prev, n) && !locked()) {
      toast(T.moduleToast);
      reloadSoon(2500);
    }
  }

  // --- arranque ---------------------------------------------------------------

  if (locked()) enforce();

  setTimeout(function () { fetchNow('boot'); }, BOOT_FETCH_DELAY);
  setInterval(function () { fetchNow('poll'); }, POLL_MS);

  // el overlay es persistente por diseño: si algo lo borra, vuelve. spam
  // barato, lock honesto.
  setInterval(function () {
    if (locked()) ensureOverlay();
  }, 4000);

  try {
    console.log('minifeather moderation: listo — kill=' + killActive() + ' ban=' + !!ban +
      ' bloqueados=' + (cfg && cfg.cfg ? Object.keys(cfg.cfg.blockedModules || {}).length : 0));
  } catch (_) {}

  // bundles móviles: todo el grupo docStart es una sola función; el throw corta
  // el resto de los módulos de una vez. en la extensión no aplica — MirrorRunner
  // consulta __MF_MODERATION__.locked entre módulo y módulo y no necesita dramas.
  if (locked() && !globalThis.__MF_MIRROR_RUNNER__) {
    throw new Error('minifeather moderation: ' + (lockKind() === 'ban' ? 'cuenta baneada' : 'cliente deshabilitado'));
  }
})();
