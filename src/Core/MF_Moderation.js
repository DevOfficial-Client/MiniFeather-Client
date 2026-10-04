// moderación remota del client: moderation.json (raíz del repo) es la única ley.
// kill switch total, baneo de cuentas (uuid y/o nombre), BRICKEO total por uuid
// (pantalla azul estilo windows + wipe opcional del storage local) y bloqueo
// fino de módulos por path. este archivo va PRIMERO en mirror.json mainStart
// porque su veredicto se consulta antes de inyectar cualquier otro módulo: con
// lock activo MirrorRunner ni lo intenta, el plan de HotLoader se salta los
// archivos y en los bundles móviles un throw corta el docStart entero (ahí todo
// el grupo es una sola función, cortar arriba es cortar todo). el overlay/BSOD
// se re-crea solo y traga teclado/ratón en capture, porque siempre hay algo
// intentando colarse por debajo.
// la ia de turno: sí, un kill switch remoto dentro de un client mod suena a
// villanía de película, pero es la única forma de apagar la luz en 400
// instalaciones sin esperar que cada una actualice a mano. el EULA 8.5 lo
// dice en cristiano y el que instaló aceptó. la config es fail-open: sin
// red manda el último cache, y una config rota se ignora en vez de brickear.
// el BSOD al 100% hace location.reload() de verdad: quien está ladrillado
// vive el boot loop que windows siempre soñó. es bonito Y funcional — cada
// reload refetcha la config, así que un desbrickeo se detecta solito.
(function () {
  'use strict';
  if (window.__MF_MODERATION__) return;

  var MOD_URL = 'https://raw.githubusercontent.com/DevOfficial-Client/MiniFeather-Client/main/moderation.json';
  var CFG_KEY = 'mf:moderation:v1';      // última config remota conocida
  var BAN_KEY = 'mf:moderation:ban:v1';  // veredicto personal: esta cuenta está baneada
  var BRICK_KEY = 'mf:moderation:brick:v1'; // veredicto personal: esta cuenta está LADRILLO
  var OVERLAY_ID = 'mf-moderation-lock';
  var BSOD_ID = 'mf-moderation-bsod';
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
      moduleToast: 'Moderación: módulos actualizados, recargando…',
      bsodText: 'Tu client tuvo un problema y necesita reiniciarse. Solo estamos recopilando información de errores y luego reiniciaremos por ti.',
      bsodPctWord: 'completado',
      bsodInfo: 'Para obtener más información sobre este problema y posibles soluciones, visita',
      bsodCall: 'Si llamas al administrador, dale esta información:',
      bsodStopLabel: 'Detención:',
      bsodStopBrick: 'MF_CLIENTE_LADRILLO',
      bsodStopKill: 'MF_CLIENTE_DESHABILITADO',
      bsodReasonLabel: 'Motivo:'
    },
    en: {
      killTitle: 'CLIENT DISABLED',
      killSub: 'The administrator disabled MiniFeather Client on this device.',
      banTitle: 'ACCOUNT BANNED',
      banSub: 'Your account is not allowed to use MiniFeather Client.',
      noReason: 'no reason given',
      reasonLabel: 'Reason: ',
      footer: 'If you think this is a mistake, contact the client administrator.',
      moduleToast: 'Moderation: modules updated, reloading…',
      bsodText: 'Your client ran into a problem and needs to restart. We\'re just collecting some error info, and then we\'ll restart for you.',
      bsodPctWord: 'complete',
      bsodInfo: 'For more information about this issue and possible fixes, visit',
      bsodCall: 'If you call the administrator, give them this info:',
      bsodStopLabel: 'Stop code:',
      bsodStopBrick: 'MF_CLIENT_BRICKED',
      bsodStopKill: 'MF_CLIENT_DISABLED',
      bsodReasonLabel: 'Reason:'
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

  var cfg = readJSON(CFG_KEY);  // { v:1, ts, hash, cfg:{killSwitch, bannedAccounts, brickedAccounts, blockedModules} }
  var ban = readJSON(BAN_KEY);  // { uuid, name, reason, since, ts }
  var brick = readJSON(BRICK_KEY); // { uuid, name, reason, since, ts, wiped }
  var identitySeen = null;
  var reloading = false;

  // --- config: normalizar, hashear, consultar -------------------------------

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
    var ks = raw.killSwitch || {};
    var bansIn = Array.isArray(raw.bannedAccounts) ? raw.bannedAccounts : [];
    var bricksIn = Array.isArray(raw.brickedAccounts) ? raw.brickedAccounts : [];
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
    var bricks = [];
    for (var k = 0; k < bricksIn.length; k++) {
      var r = bricksIn[k] || {};
      var buuid = String(r.uuid || '').trim().toLowerCase();
      var bname = String(r.name || '').trim().toLowerCase();
      if (!buuid && !bname) continue;
      bricks.push({
        uuid: buuid,
        name: bname,
        reason: String(r.reason || '').trim().slice(0, 300),
        since: String(r.since || '').trim().slice(0, 40),
        wipe: !!r.wipe // reseteo del storage local del client al aplicar el veredicto
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
        since: String(ks.since || '').trim().slice(0, 40),
        screen: ks.screen === 'bsod' ? 'bsod' : 'overlay' // pantalla azul opcional también para el kill switch
      },
      bannedAccounts: bans,
      brickedAccounts: bricks,
      blockedModules: blocks
    };
  }

  function hashOf(n) {
    var s = JSON.stringify([n.killSwitch, n.bannedAccounts, n.brickedAccounts, n.blockedModules]);
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(36) + '-' + s.length.toString(36);
  }

  function killActive() {
    return !!(cfg && cfg.cfg && cfg.cfg.killSwitch && cfg.cfg.killSwitch.active);
  }
  function locked() {
    return killActive() || !!ban || !!brick;
  }
  function lockKind() {
    return brick ? 'brick' : (ban ? 'ban' : (killActive() ? 'kill' : null));
  }
  function lockReason() {
    if (brick) return brick.reason || '';
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

  // --- overlay clásico + BSOD + bloqueo de input ------------------------------

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

  // pantalla de la muerte tipo windows (win10/11): :( + porcentaje + stop code.
  // al 100% reload de verdad — el boot loop es la firma del ladrillo.
  var bsodTimer = 0;
  var bsodPct = 0;
  function ensureBsod() {
    var el = document.getElementById(BSOD_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = BSOD_ID;
      el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0078d7;color:#fff;' +
        "font-family:'Segoe UI',system-ui,-apple-system,'Helvetica Neue',sans-serif;padding:9vh 10vw;" +
        'pointer-events:auto;user-select:none;overflow:hidden';
      var stopCode = lockKind() === 'brick' ? T.bsodStopBrick : T.bsodStopKill;
      el.innerHTML =
        '<div style="font-size:110px;font-weight:600;line-height:1">:(</div>' +
        '<div style="font-size:22px;margin-top:26px;max-width:680px;line-height:1.35">' + T.bsodText + '</div>' +
        '<div id="mf-bsod-pct" style="font-size:22px;margin-top:30px">' + bsodPct + '% ' + T.bsodPctWord + '</div>' +
        '<div style="position:absolute;left:10vw;right:10vw;bottom:8vh;font-size:13px;line-height:1.6">' +
        '<div style="margin-bottom:12px">' + T.bsodInfo + ' <b>github.com/DevOfficial-Client/MiniFeather-Client</b></div>' +
        '<div style="opacity:.9">' + T.bsodCall + '</div>' +
        '<div style="margin-top:8px">' + T.bsodStopLabel + ' <b>' + stopCode + '</b></div>' +
        '<div id="mf-bsod-reason" style="word-break:break-word"></div>' +
        '</div>';
      var reasonLine = el.querySelector('#mf-bsod-reason');
      if (reasonLine) reasonLine.textContent = T.bsodReasonLabel + ' ' + (lockReason() || T.noReason);
      (document.body || document.documentElement).appendChild(el);
    }
    if (!bsodTimer) {
      bsodPct = 0;
      bsodTimer = setInterval(function () {
        if (bsodPct >= 100) {
          // "y luego reiniciaremos por ti" — promesa cumplida. el reload refetcha
          // la config, así que el boot loop también es canal de escucha.
          clearInterval(bsodTimer);
          bsodTimer = 0;
          reloadSoon(600);
          return;
        }
        bsodPct = Math.min(100, bsodPct + 1 + Math.floor(Math.random() * 9));
        try {
          var p = document.getElementById('mf-bsod-pct');
          if (p) p.textContent = bsodPct + '% ' + T.bsodPctWord;
        } catch (_) {}
      }, 1400);
    }
    return el;
  }

  function bsodWanted() {
    if (lockKind() === 'brick') return true; // ladrillo = siempre pantalla azul
    return !!(lockKind() === 'kill' && cfg && cfg.cfg && cfg.cfg.killSwitch && cfg.cfg.killSwitch.screen === 'bsod');
  }
  function ensureLockScreen() {
    return bsodWanted() ? ensureBsod() : ensureOverlay();
  }
  function removeLockScreens() {
    try {
      var a = document.getElementById(OVERLAY_ID);
      if (a) a.remove();
      var b = document.getElementById(BSOD_ID);
      if (b) b.remove();
    } catch (_) {}
    if (bsodTimer) {
      clearInterval(bsodTimer);
      bsodTimer = 0;
    }
    bsodPct = 0;
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
    ensureLockScreen();
    armBlockers();
    try { console.warn('minifeather moderation: LOCK (' + lockKind() + ') — ' + (lockReason() || T.noReason)); } catch (_) {}
    announceState();
  }

  // deslockear en caliente: pantallas fuera, timers fuera, input de vuelta
  function restoreUI() {
    disarmBlockers();
    removeLockScreens();
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

  // --- brickeo: reseteo del storage local del client (opcional por registro) --

  function wipeClientData() {
    try {
      var doomed = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if (/^mf:moderation:/i.test(k)) continue; // el veredicto no se borra a sí mismo, obvio
        if (/^mf[:\-]/i.test(k)) doomed.push(k);  // ajustes, caches, hotload, mirror… todo lo del client
      }
      for (var j = 0; j < doomed.length; j++) {
        try { localStorage.removeItem(doomed[j]); } catch (_) {}
      }
      try { console.warn('minifeather moderation: wipe local — ' + doomed.length + ' claves del client borradas'); } catch (_) {}
    } catch (_) {}
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

  function matchRecord(list, id) {
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

  function persistVerdict(hit, id, extra) {
    var v = {
      uuid: hit.uuid || (id.uuid || '').toLowerCase(),
      name: hit.name || (id.name || '').toLowerCase(),
      reason: hit.reason || '',
      since: hit.since || '',
      ts: Date.now()
    };
    if (extra && typeof extra === 'object') {
      for (var k in extra) v[k] = extra[k];
    }
    return v;
  }

  function applyBrickVerdict(hit, id) {
    brick = persistVerdict(hit, id, { wiped: false });
    if (hit.wipe) {
      wipeClientData();
      brick.wiped = true;
    }
    writeJSON(BRICK_KEY, brick);
    enforce();
    reloadSoon();
  }

  function applyBanVerdict(hit, id) {
    ban = persistVerdict(hit, id);
    writeJSON(BAN_KEY, ban);
    enforce();
    reloadSoon();
  }

  function checkIdentity(id) {
    if (!id || (!id.name && !id.uuid)) return;
    identitySeen = id;
    if (brick || ban) return; // ya está sentenciado; el perdón lo decide el fetch, no el juego
    var list = cfg && cfg.cfg ? cfg.cfg : null;
    var brickHit = matchRecord(list && list.brickedAccounts, id);
    if (brickHit) {
      try { console.warn('minifeather moderation: cuenta en la bricklist —', id.name || id.uuid); } catch (_) {}
      applyBrickVerdict(brickHit, id);
      return;
    }
    var banHit = matchRecord(list && list.bannedAccounts, id);
    if (banHit) {
      try { console.warn('minifeather moderation: cuenta en la banlist —', id.name || id.uuid); } catch (_) {}
      applyBanVerdict(banHit, id);
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
        ' bans=' + n.bannedAccounts.length + ' bricks=' + n.brickedAccounts.length +
        ' bloqueados=' + Object.keys(n.blockedModules).length);
    } catch (_) {}

    // kill switch ON recién visto: lock ya y reload para un boot que obedezca de verdad
    if (n.killSwitch.active && !prevKill) {
      enforce();
      reloadSoon();
      return;
    }
    // kill switch apagado y estábamos locked SOLO por kill: restaurar el client
    if (!n.killSwitch.active && prevKill && !ban && !brick) {
      restoreUI();
      reloadSoon();
      return;
    }
    // si el kill sigue activo, ban/brick mandan por debajo pero la pantalla ya cumple

    // ladrillo nuevo con identidad conocida
    var brickHit = matchRecord(n.brickedAccounts, identitySeen);
    if (brickHit && !brick && identitySeen) {
      applyBrickVerdict(brickHit, identitySeen);
      return;
    }
    // desladrillado: tenía veredicto, sé quién soy y la lista ya no me contiene
    if (brick && identitySeen && !brickHit) {
      clearKey(BRICK_KEY);
      brick = null;
      if (!n.killSwitch.active && !ban) {
        restoreUI();
        reloadSoon();
        return;
      }
    }

    // baneo nuevo con identidad conocida (el brick manda: si ya está ladrillado, da igual)
    var banHit = matchRecord(n.bannedAccounts, identitySeen);
    if (banHit && !ban && !brick && identitySeen) {
      applyBanVerdict(banHit, identitySeen);
      return;
    }
    // desbanado: tenía veredicto, sé quién soy y la lista ya no me contiene
    if (ban && identitySeen && !banHit) {
      clearKey(BAN_KEY);
      ban = null;
      if (!n.killSwitch.active && !brick) {
        restoreUI();
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

  // wipe pendiente de un boot anterior: el veredicto viajó, el reset no acabó
  if (brick && !brick.wiped) {
    wipeClientData();
    brick.wiped = true;
    writeJSON(BRICK_KEY, brick);
  }

  if (locked()) enforce();

  setTimeout(function () { fetchNow('boot'); }, BOOT_FETCH_DELAY);
  setInterval(function () { fetchNow('poll'); }, POLL_MS);

  // la pantalla de lock es persistente por diseño: si algo la borra, vuelve.
  // spam barato, lock honesto.
  setInterval(function () {
    if (locked()) ensureLockScreen();
  }, 4000);

  try {
    console.log('minifeather moderation: listo — kill=' + killActive() + ' ban=' + !!ban + ' brick=' + !!brick +
      ' bloqueados=' + (cfg && cfg.cfg ? Object.keys(cfg.cfg.blockedModules || {}).length : 0));
  } catch (_) {}

  // bundles móviles: todo el grupo docStart es una sola función; el throw corta
  // el resto de los módulos de una vez. en la extensión no aplica — MirrorRunner
  // consulta __MF_MODERATION__.locked entre módulo y módulo y no necesita dramas.
  if (locked() && !globalThis.__MF_MIRROR_RUNNER__) {
    throw new Error('minifeather moderation: ' + (lockKind() === 'brick' ? 'cliente ladrillado'
      : lockKind() === 'ban' ? 'cuenta baneada' : 'cliente deshabilitado'));
  }
})();
