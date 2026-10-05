// temporadas del client: seasonal.json (raiz del repo) decide qué se celebra
// y a quién se le regala qué. ventanas de fecha, efectos para todos y
// objetivos por cuenta — el matching es SOLO por hash sha-256 de uuid/name:
// el repo es público, así que un target con uuid en texto plano se ignora a
// propósito y los mensajes viajan en base64 (ofuscación para la sorpresa,
// no cifrado: el $note lo repite para que nadie se confíe).
// la ia de turno: este módulo existe para tres fechas y una novia. el 14 de
// febrero llueve corazones para todos; para UNA cuenta llueven más, aparecen
// waypoints que no existen para nadie más y se abre una carta. el vecino
// que lee el repo ve hashes y coordenadas, nada más.
// mismo patrón que MF_Moderation: cache en localStorage, fetch en boot +
// poll lento (las temporadas no corren: caminan), fail-open total.
(function () {
  'use strict';
  if (window.__MF_Seasonal) return;

  var SEASONAL_URL = 'https://raw.githubusercontent.com/DevOfficial-Client/MiniFeather-Client/main/seasonal.json';
  var CFG_KEY = 'mf:seasonal:v1';
  var SHOWN_KEY = 'mf:seasonal:shown:v1'; // eventos ya saludados (por día)
  var GIFT_KEY = 'mf:seasonal:gift:v1';   // waypoints de regalo ya inyectados (por sesión)
  var POLL_MS = 15 * 60 * 1000;
  var BOOT_DELAY = 6000;                  // las fiestas pueden esperar al boot

  function readJSON(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || 'null');
      return v && typeof v === 'object' ? v : null;
    } catch (_) { return null; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }

  var cfg = readJSON(CFG_KEY);
  var identitySeen = null;
  var identityHashes = null; // { uuidHash, nameHash } — calculados async
  var hashingIdentity = '';
  var activeEventId = null;
  var giftDone = {};         // eventId ya regalado en esta sesión
  var applying = false;

  // --- config: normalizar (privacy by design incluida) ------------------------

  function sha256Hex(text) {
    // crypto.subtle es async; el matching se hace cuando el hash llega
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '').toLowerCase()))
      .then(function (buf) {
        var arr = new Uint8Array(buf), out = '';
        for (var i = 0; i < arr.length; i++) out += ('0' + arr[i].toString(16)).slice(-2);
        return 'sha256:' + out;
      })
      .catch(function () { return null; });
  }

  function normalizeDate(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : null;
  }

  function clampStrength(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0.18;
    return Math.max(0, Math.min(0.4, v));
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1 || !Array.isArray(raw.events)) return null;
    var events = [];
    for (var i = 0; i < raw.events.length; i++) {
      var e = raw.events[i] || {};
      var start = normalizeDate(e.start), end = normalizeDate(e.end);
      if (!e.id || !start || !end) continue;
      var fx = e.effects || {};
      var targets = [];
      var tIn = Array.isArray(e.targets) ? e.targets : [];
      for (var k = 0; k < tIn.length; k++) {
        var t = tIn[k] || {};
        // privacy by design: uuid/name en texto plano NO participan. solo hash.
        if (!t.uuidHash && !t.nameHash) continue;
        if (t.uuid && !t.uuidHash) continue;
        if (t.name && !t.nameHash) continue;
        var wps = [];
        var wpIn = Array.isArray(t.waypoints) ? t.waypoints : [];
        for (var w = 0; w < wpIn.length; w++) {
          var wp = wpIn[w] || {};
          if (!wp.name || !isFinite(Number(wp.x)) || !isFinite(Number(wp.y)) || !isFinite(Number(wp.z))) continue;
          wps.push({ name: String(wp.name).slice(0, 40), x: Number(wp.x), y: Number(wp.y), z: Number(wp.z), color: /^#[0-9a-fA-F]{6}$/.test(wp.color || '') ? wp.color : '#ff5f9e' });
        }
        targets.push({
          uuidHash: String(t.uuidHash || '').trim().toLowerCase(),
          nameHash: String(t.nameHash || '').trim().toLowerCase(),
          heartRain: t.heartRain !== false,
          messageB64: /^[A-Za-z0-9+/=]+$/.test(String(t.message || '')) ? String(t.message) : '',
          waypoints: wps.slice(0, 20)
        });
      }
      events.push({
        id: String(e.id).slice(0, 40),
        start: start,
        end: end,
        effects: {
          vignette: /^#[0-9a-fA-F]{6}$/.test(fx.vignette || '') ? fx.vignette : null,
          vignetteStrength: clampStrength(fx.vignetteStrength),
          heartRain: !!fx.heartRain,
          loginToast: String(fx.loginToast || '').slice(0, 120)
        },
        targets: targets.slice(0, 50)
      });
    }
    return { v: 1, events: events };
  }

  function hashOf(n) {
    var s = JSON.stringify(n.events);
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(36) + '-' + s.length.toString(36);
  }

  // evento activo HOY según fecha local (las fiestas son locales, no UTC)
  function activeEvent(n) {
    var d = new Date();
    var today = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    for (var i = 0; i < n.events.length; i++) {
      if (n.events[i].start <= today && today <= n.events[i].end) return n.events[i];
    }
    return null;
  }

  // --- capas visuales ----------------------------------------------------------

  var vignetteEl = null;
  function setVignette(color, strength) {
    if (!vignetteEl) {
      vignetteEl = document.createElement('div');
      vignetteEl.id = 'mf-seasonal-vignette';
      vignetteEl.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;transition:opacity 1.2s ease';
      (document.body || document.documentElement).appendChild(vignetteEl);
    }
    if (!color || strength <= 0) { vignetteEl.style.opacity = '0'; return; }
    vignetteEl.style.background = 'radial-gradient(ellipse at center, transparent 42%, ' + color + ' 160%)';
    vignetteEl.style.opacity = String(strength);
  }

  function ensureHeartCss() {
    if (document.getElementById('mf-seasonal-heart-css')) return;
    var st = document.createElement('style');
    st.id = 'mf-seasonal-heart-css';
    st.textContent = '@keyframes mf-heart-fall{0%{transform:translateY(-6vh) translateX(0) rotate(-8deg);opacity:0}' +
      '8%{opacity:.95}100%{transform:translateY(106vh) translateX(var(--mf-hx,0)) rotate(14deg);opacity:0}}' +
      '.mf-seasonal-heart{position:fixed;top:0;z-index:2147482999;pointer-events:none;color:#ff5f9e;' +
      'text-shadow:0 2px 6px rgba(0,0,0,.35);animation:mf-heart-fall linear forwards;will-change:transform,opacity}';
    (document.head || document.documentElement).appendChild(st);
  }

  var HEART_SIZES = [12, 16, 20, 26];
  function heartRain(count) {
    ensureHeartCss();
    var n = Math.max(10, Math.min(80, count || 44));
    for (var i = 0; i < n; i++) {
      var h = document.createElement('div');
      h.className = 'mf-seasonal-heart';
      h.textContent = '♥';
      var size = HEART_SIZES[Math.floor(Math.random() * HEART_SIZES.length)];
      var left = Math.random() * 100;
      var dur = 4 + Math.random() * 4;
      var delay = Math.random() * 2.2;
      h.style.left = left + 'vw';
      h.style.fontSize = size + 'px';
      h.style.setProperty('--mf-hx', (Math.random() * 12 - 6) + 'vw');
      h.style.animationDuration = dur + 's';
      h.style.animationDelay = delay + 's';
      (document.body || document.documentElement).appendChild(h);
      setTimeout(function (node) { return function () { try { node.remove(); } catch (_) {} }; }(h), (dur + delay) * 1000 + 200);
    }
  }

  function toast(text, ms) {
    try {
      var old = document.getElementById('mf-seasonal-toast');
      if (old) old.remove();
      var t = document.createElement('div');
      t.id = 'mf-seasonal-toast';
      t.style.cssText = 'position:fixed;left:50%;top:18vh;transform:translateX(-50%);z-index:2147482998;' +
        'background:rgba(24,18,40,.96);border:1px solid #6045a0;color:#e8e4f5;font:14px/1.5 sans-serif;' +
        'padding:12px 18px;border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.5);text-align:center;max-width:min(80vw,460px)';
      t.textContent = text;
      (document.body || document.documentElement).appendChild(t);
      setTimeout(function () { try { t.remove(); } catch (_) {} }, ms || 5000);
    } catch (_) {}
  }

  // la carta: el mensaje ofuscado se abre solo para la cuenta objetivo
  function letterCard(text) {
    try {
      var old = document.getElementById('mf-seasonal-letter');
      if (old) old.remove();
      var el = document.createElement('div');
      el.id = 'mf-seasonal-letter';
      el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483002;' +
        'background:linear-gradient(160deg,#fff5f9,#ffe4ef);color:#5c2440;font:15px/1.7 Georgia,serif;' +
        'padding:28px 30px;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.55);max-width:min(86vw,520px);' +
        'text-align:center;border:1px solid #ffb3d1;cursor:pointer;white-space:pre-wrap';
      el.textContent = text + '\n\n♥';
      el.title = 'cerrar';
      el.addEventListener('click', function () { try { el.remove(); } catch (_) {} });
      (document.body || document.documentElement).appendChild(el);
      setTimeout(function () { try { if (el.isConnected) el.remove(); } catch (_) {} }, 45000);
    } catch (_) {}
  }

  function decodeB64(b64) {
    try {
      return new TextDecoder().decode(Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }));
    } catch (_) { return ''; }
  }

  // --- identidad + matching ----------------------------------------------------

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

  function hashMatches(target) {
    if (!identityHashes) return false;
    if (target.uuidHash && identityHashes.uuidHash === target.uuidHash) return true;
    if (target.nameHash && identityHashes.nameHash === target.nameHash) return true;
    return false;
  }

  function deliverGift(eventDef, target) {
    if (giftDone[eventDef.id]) return;
    giftDone[eventDef.id] = true;
    try { console.log('minifeather seasonal: regalo de temporada — ' + eventDef.id); } catch (_) {}
    if (target.heartRain) heartRain(90);
    var msg = target.messageB64 ? decodeB64(target.messageB64) : '';
    if (msg) {
      setTimeout(function () { letterCard(msg); }, 1800);
    }
    // waypoints del tesoro: a la API pública de waypoints, una sola vez
    var wpApi = globalThis.__MINIFEATHER_WAYPOINTS__;
    var shown = readJSON(GIFT_KEY) || {};
    if (wpApi && typeof wpApi.addWaypoint === 'function' && target.waypoints.length && !shown[eventDef.id]) {
      for (var i = 0; i < target.waypoints.length; i++) {
        var w = target.waypoints[i];
        try { wpApi.addWaypoint(w.name, { x: w.x, y: w.y, z: w.z }, { color: w.color }); } catch (_) {}
      }
      shown[eventDef.id] = true;
      writeJSON(GIFT_KEY, shown);
    }
  }

  function evaluate() {
    if (applying) return;
    applying = true;
    try {
      var n = cfg && cfg.cfg ? cfg.cfg : null;
      if (!n) { setVignette(null, 0); return; }
      var ev = activeEvent(n);
      activeEventId = ev ? ev.id : null;
      setVignette(ev ? ev.effects.vignette : null, ev ? ev.effects.vignetteStrength : 0);

      // saludo de ventana: una vez por día por evento
      var shown = readJSON(SHOWN_KEY) || {};
      var today = new Date().toISOString().slice(0, 10);
      if (ev && ev.effects.loginToast && shown[ev.id] !== today) {
        shown[ev.id] = today;
        writeJSON(SHOWN_KEY, shown);
        toast(ev.effects.loginToast);
        if (ev.effects.heartRain) heartRain(36);
      }

      // regalo por cuenta: match por hash dentro de la ventana
      if (ev && identityHashes) {
        for (var i = 0; i < ev.targets.length; i++) {
          if (hashMatches(ev.targets[i])) { deliverGift(ev, ev.targets[i]); break; }
        }
      }
    } finally {
      applying = false;
    }
  }

  // identidad sondeada (el juego es la fuente, igual que en moderación) y
  // hasheado async: el matching espera al hash, no al revés
  var idPolls = 0;
  var idTimer = setInterval(function () {
    try {
      var id = currentIdentity();
      if (id && (id.uuid || id.name)) {
        identitySeen = id;
        var sig = id.uuid + '|' + id.name;
        if (sig !== hashingIdentity) {
          hashingIdentity = sig;
          Promise.all([sha256Hex(id.uuid), sha256Hex(id.name)]).then(function (res) {
            identityHashes = { uuidHash: res[0], nameHash: res[1] };
            evaluate();
          });
        }
      }
      if (++idPolls > 40) { clearInterval(idTimer); idTimer = 0; } // 2 min de gracia
    } catch (_) {}
  }, 3000);

  // --- fetch -------------------------------------------------------------------

  var fetching = false;
  function fetchNow(why) {
    if (fetching) return;
    fetching = true;
    fetch(SEASONAL_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (raw) {
        var n = normalize(raw);
        if (!n) return;
        var h = hashOf(n);
        if (cfg && cfg.hash === h) return; // nada nuevo, ni un repaint
        cfg = { v: 1, ts: Date.now(), hash: h, cfg: n };
        writeJSON(CFG_KEY, cfg);
        evaluate();
      })
      .catch(function () {})
      .then(function () { fetching = false; });
  }

  // cache del boot: si hoy hay fiesta, el vignette entra antes que el fetch
  if (cfg && cfg.cfg) evaluate();

  setTimeout(function () { fetchNow('boot'); }, BOOT_DELAY);
  setInterval(function () { fetchNow('poll'); }, POLL_MS);
  // medianoche cruza ventanas: re-evaluar cada 10 min no cuesta nada
  setInterval(function () { evaluate(); }, 10 * 60 * 1000);

  try {
    console.log('minifeather seasonal: listo — ' + (cfg && cfg.cfg ? cfg.cfg.events.length : 0) + ' ventanas cargadas');
  } catch (_) {}

  // api mínima de consola (y para tests): la config manda, esto solo lee
  window.__MF_SEASONAL_STATE__ = function () {
    return { activeEventId: activeEventId, identity: identitySeen ? { name: identitySeen.name, hashed: !!identityHashes } : null };
  };
})();
