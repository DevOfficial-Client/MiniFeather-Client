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
// ambiente (2026-10-05, pedido del usuario): nieve en navidad, hojas en otoño,
// luciérnagas y estrellas fugaces de noche — canvas propio que SOLO corre con
// evento/noche activa y pestaña visible; nada de rAF eternos (lección de perf).
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
  var activeEventDef = null; // evento activo de hoy (para el ambiente)
  var giftDone = {};         // eventId ya regalado en esta sesión
  var applying = false;

  // --- ambiente: constantes del motor de partículas ----------------------------

  var AMBIENT_TYPES = ['snow', 'leaves', 'fireflies', 'meteors'];
  var NIGHT_ONLY = { fireflies: 1, meteors: 1 }; // efectos de luz: no existen de día
  function clampAmbientDensity(n) {
    var v = Number(n);
    if (!isFinite(v)) return 1;
    return Math.max(0.2, Math.min(1.5, v));
  }
  function clampHour(n) {
    var v = Math.round(Number(n));
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.min(23, v));
  }

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
      // ambiente del evento: lista blanca, máx 3 tipos simultáneos
      var ambient = [];
      var ambIn = Array.isArray(fx.ambient) ? fx.ambient : [];
      for (var a = 0; a < ambIn.length && ambient.length < 3; a++) {
        if (AMBIENT_TYPES.indexOf(ambIn[a]) >= 0 && ambient.indexOf(ambIn[a]) < 0) ambient.push(ambIn[a]);
      }
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
          loginToast: String(fx.loginToast || '').slice(0, 120),
          ambient: ambient,
          ambientDensity: clampAmbientDensity(fx.ambientDensity)
        },
        targets: targets.slice(0, 50)
      });
    }
    // noches: ambiente siempre-encendido fuera de eventos (luciérnagas, meteors)
    var night = null;
    if (raw.night && typeof raw.night === 'object') {
      var nAmb = [];
      var nIn = Array.isArray(raw.night.ambient) ? raw.night.ambient : [];
      for (var b = 0; b < nIn.length && nAmb.length < 3; b++) {
        if (AMBIENT_TYPES.indexOf(nIn[b]) >= 0 && nAmb.indexOf(nIn[b]) < 0) nAmb.push(nIn[b]);
      }
      if (nAmb.length) {
        var hours = Array.isArray(raw.night.hours) &&
          isFinite(Number(raw.night.hours[0])) && isFinite(Number(raw.night.hours[1]))
          ? [clampHour(raw.night.hours[0]), clampHour(raw.night.hours[1])]
          : [18, 6];
        night = { ambient: nAmb, hours: hours, density: clampAmbientDensity(raw.night.density) };
      }
    }
    return { v: 1, events: events, night: night };
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

  // --- ambiente: motor de partículas ------------------------------------------
  // UN canvas, UN rAF que solo corre con algo que dibujar y pestaña visible.
  // sprites pre-renderizados (drawImage barato), densidad escalada por área,
  // prefers-reduced-motion apaga todo y los sandboxes sin canvas 2d fail-open.

  var nightCfg = null;       // { ambient:[], hours:[h1,h2], density } del config
  var ambientCanvas = null, ambientCtx = null;
  var ambientRaf = 0, ambientParts = [], ambientMeteors = [];
  var ambientTypes = [];      // tipos activos ahora mismo (evento ∪ noche)
  var ambientDensity = 1;
  var ambientW = 0, ambientH = 0, ambientDpr = 1;
  var meteorTimer = 0, lastFrame = 0;
  var sprites = {};

  function reducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
  }

  // las particulas viven SOLO en el menu: MF_MenuHub deja su clase raiz en #react
  // mientras el hub esta arriba y la quita al entrar a partida — senal gratuita y
  // sin acoplar modulos. si menuHub esta apagado, no hay ambiente (es su territorio)
  function menuVisible() {
    try {
      var react = document.getElementById('react');
      return !!(react && react.classList && react.classList.contains('mf-hub'));
    } catch (_) { return false; }
  }

  function inNightHours() {
    var w = (nightCfg && nightCfg.hours) || [18, 6];
    var h = new Date().getHours();
    return w[0] <= w[1] ? (h >= w[0] && h < w[1]) : (h >= w[0] || h < w[1]);
  }

  function computeAmbientTypes() {
    var types = [];
    var push = function (t) { if (types.indexOf(t) < 0) types.push(t); };
    if (activeEventDef && activeEventDef.effects.ambient) {
      for (var i = 0; i < activeEventDef.effects.ambient.length; i++) push(activeEventDef.effects.ambient[i]);
    }
    var night = inNightHours();
    if (night && nightCfg) {
      for (var j = 0; j < nightCfg.ambient.length; j++) push(nightCfg.ambient[j]);
    }
    if (!night) {
      // los de luz no pintan de día, vengan de donde vengan
      types = types.filter(function (t) { return !NIGHT_ONLY[t]; });
    }
    return types;
  }

  function ambientSprite(kind, size) {
    var key = kind + ':' + size;
    if (sprites[key]) return sprites[key];
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var x = c.getContext ? c.getContext('2d') : null;
    if (!x) return null;
    var r = size / 2;
    if (kind === 'snow') {
      // cuadrado plano estilo partícula de minecraft: nada de gradientes suaves
      x.fillStyle = 'rgba(240,248,255,.95)';
      x.fillRect(1, 1, size - 2, size - 2);
    } else if (kind === 'firefly') {
      // bloom PIXELADO: cuadrados concéntricos, el glow también es cuadrado
      var step = size / 3;
      x.fillStyle = 'rgba(190,255,110,.22)';
      x.fillRect(0, 0, size, size);
      x.fillStyle = 'rgba(215,255,140,.45)';
      x.fillRect(step * 0.5, step * 0.5, size - step, size - step);
      x.fillStyle = 'rgba(245,255,200,.95)';
      x.fillRect(step, step, step, step);
    } else if (kind === 'leaf') {
      x.translate(r, r);
      x.fillStyle = 'rgba(0,0,0,0)';
      x.beginPath();
      x.ellipse(0, 0, r, r * 0.52, 0, 0, Math.PI * 2);
      x.fillStyle = size % 2 ? '#d68438' : (size % 3 ? '#c05a2a' : '#e0a33c');
      x.fill();
      x.strokeStyle = 'rgba(90,40,10,.5)';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(-r, 0);
      x.lineTo(r, 0);
      x.stroke();
    }
    sprites[key] = c;
    return c;
  }

  function ambientResize() {
    if (!ambientCanvas || !ambientCtx) return;
    ambientDpr = Math.min(1.5, window.devicePixelRatio || 1);
    ambientW = window.innerWidth;
    ambientH = window.innerHeight;
    ambientCanvas.width = Math.round(ambientW * ambientDpr);
    ambientCanvas.height = Math.round(ambientH * ambientDpr);
    ambientCtx.setTransform(ambientDpr, 0, 0, ambientDpr, 0, 0);
    ambientCtx.imageSmoothingEnabled = false; // píxeles cuadrados, no manchas
  }

  function spawnAmbient() {
    ambientParts.length = 0;
    var area = ambientW * ambientH || 1;
    var dens = ambientDensity;
    var snow = ambientTypes.indexOf('snow') >= 0;
    var leaves = ambientTypes.indexOf('leaves') >= 0;
    var flies = ambientTypes.indexOf('fireflies') >= 0;
    if (snow) {
      var n = Math.max(24, Math.min(130, Math.round(area / 11000 * dens)));
      for (var i = 0; i < n; i++) {
        ambientParts.push({
          t: 'snow', x: Math.random() * ambientW, y: Math.random() * ambientH,
          r: 1.4 + Math.random() * 2.4, vy: 22 + Math.random() * 38,
          sway: 8 + Math.random() * 18, ph: Math.random() * Math.PI * 2,
          a: 0.45 + Math.random() * 0.45
        });
      }
    }
    if (leaves) {
      var m = Math.max(14, Math.min(70, Math.round(area / 20000 * dens)));
      for (var j = 0; j < m; j++) {
        var s = 5 + Math.random() * 5;
        ambientParts.push({
          t: 'leaf', x: Math.random() * ambientW, y: Math.random() * ambientH,
          r: s, vy: 26 + Math.random() * 30, vx: -14 + Math.random() * 28,
          rot: Math.random() * Math.PI * 2, vr: -1.6 + Math.random() * 3.2,
          ph: Math.random() * Math.PI * 2, a: 0.75 + Math.random() * 0.25,
          seed: Math.floor(Math.random() * 7)
        });
      }
    }
    if (flies) {
      var f = Math.max(6, Math.min(18, Math.round(area / 70000 * dens)));
      for (var k = 0; k < f; k++) {
        ambientParts.push({
          t: 'fly', x: Math.random() * ambientW, y: ambientH * 0.25 + Math.random() * ambientH * 0.7,
          vx: -8 + Math.random() * 16, vy: -6 + Math.random() * 12,
          ph: Math.random() * Math.PI * 2, blink: 0.7 + Math.random() * 1.6,
          r: 2.5 + Math.random() * 2.5, turn: 0
        });
      }
    }
  }

  function spawnMeteor() {
    var fromLeft = Math.random() < 0.5;
    ambientMeteors.push({
      x: ambientW * (fromLeft ? 0.15 : 0.35) + Math.random() * ambientW * 0.5,
      y: Math.random() * ambientH * 0.28,
      vx: (fromLeft ? 1 : -1) * (280 + Math.random() * 180),
      vy: 140 + Math.random() * 90,
      len: 90 + Math.random() * 70, life: 0, max: 1.1
    });
  }

  function ambientFrame(now) {
    ambientRaf = 0;
    if (!ambientCtx) return;
    if (!menuVisible()) {  // salio del menu: nada de particulas sobre la partida
      try { ambientCtx.clearRect(0, 0, ambientW, ambientH); } catch (_) {}
      try { ambientCanvas.remove(); } catch (_) {}
      ambientCanvas = null; ambientCtx = null;
      ambientParts.length = 0; ambientMeteors.length = 0;
      lastFrame = 0;
      return;
    }
    var dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
    lastFrame = now;
    var ctx = ambientCtx;
    ctx.clearRect(0, 0, ambientW, ambientH);
    var i, p, spr, sway;
    for (i = ambientParts.length - 1; i >= 0; i--) {
      p = ambientParts[i];
      if (p.t === 'snow') {
        p.ph += dt * 1.4;
        sway = Math.sin(p.ph) * p.sway * dt;
        p.x += sway;
        p.y += p.vy * dt;
        if (p.y > ambientH + 6) { p.y = -8; p.x = Math.random() * ambientW; }
        if (p.x < -8) p.x = ambientW + 6; else if (p.x > ambientW + 8) p.x = -6;
        ctx.globalAlpha = p.a;
        ctx.fillStyle = '#f0f8ff';
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); // un misero pixel (pedido literal)
      } else if (p.t === 'leaf') {
        p.ph += dt * 2;
        p.rot += p.vr * dt;
        p.x += (p.vx + Math.sin(p.ph) * 26) * dt;
        p.y += p.vy * dt;
        if (p.y > ambientH + 12) { p.y = -14; p.x = Math.random() * ambientW; }
        if (p.x < -16) p.x = ambientW + 12; else if (p.x > ambientW + 16) p.x = -12;
        spr = ambientSprite('leaf', 12 + (p.seed % 3) * 2);
        if (spr) {
          ctx.globalAlpha = p.a;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.drawImage(spr, -p.r, -p.r * 0.52, p.r * 2, p.r * 1.04);
          ctx.restore();
        }
      } else if (p.t === 'fly') {
        p.turn -= dt * 1.2;
        if (p.turn <= 0) {
          p.turn = 0.6 + Math.random() * 1.8;
          p.vx = Math.max(-14, Math.min(14, p.vx + (Math.random() * 22 - 11)));
          p.vy = Math.max(-10, Math.min(10, p.vy + (Math.random() * 16 - 8)));
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.ph += dt * p.blink;
        if (p.x < 20 || p.x > ambientW - 20) p.vx *= -1;
        if (p.y < ambientH * 0.15 || p.y > ambientH - 30) p.vy *= -1;
        var glow = Math.max(0, Math.sin(p.ph));
        if (glow > 0.08) {
          ctx.globalAlpha = 0.3 + glow * 0.7;
          ctx.fillStyle = '#e6ff9e';
          ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); // un misero pixel que parpadea
        }
      }
    }
    ctx.globalAlpha = 1;
    // meteoros: aparecen solos, cruzan y mueren
    meteorTimer -= dt;
    if (ambientTypes.indexOf('meteors') >= 0 && meteorTimer <= 0 && ambientMeteors.length < 2) {
      spawnMeteor();
      meteorTimer = 4 + Math.random() * 7;
    }
    for (i = ambientMeteors.length - 1; i >= 0; i--) {
      p = ambientMeteors[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      var fade = Math.max(0, 1 - p.life / p.max);
      if (fade <= 0 || p.x < -p.len || p.x > ambientW + p.len || p.y > ambientH + p.len) {
        ambientMeteors.splice(i, 1);
        continue;
      }
      var nx = p.vx / (Math.hypot(p.vx, p.vy) || 1), ny = p.vy / (Math.hypot(p.vx, p.vy) || 1);
      var grad = ctx.createLinearGradient(p.x, p.y, p.x - nx * p.len, p.y - ny * p.len);
      grad.addColorStop(0, 'rgba(255,255,255,' + (0.9 * fade) + ')');
      grad.addColorStop(0.35, 'rgba(200,225,255,' + (0.45 * fade) + ')');
      grad.addColorStop(1, 'rgba(200,225,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - nx * p.len, p.y - ny * p.len);
      ctx.stroke();
    }
    if (ambientParts.length || ambientMeteors.length) {
      ambientRaf = window.requestAnimationFrame(ambientFrame);
    }
  }

  function syncAmbient() {
    var want = (!reducedMotion() && ambientTypes.length && menuVisible()) ? 1 : 0;
    if (!want) {
      if (ambientRaf) { try { window.cancelAnimationFrame(ambientRaf); } catch (_) {} ambientRaf = 0; }
      lastFrame = 0;
      if (ambientCanvas) { try { ambientCanvas.remove(); } catch (_) {} ambientCanvas = null; ambientCtx = null; }
      ambientParts.length = 0;
      ambientMeteors.length = 0;
      return;
    }
    try {
      if (!ambientCanvas) {
        ambientCanvas = document.createElement('canvas');
        ambientCanvas.id = 'mf-seasonal-ambient';
        ambientCanvas.style.cssText = 'position:fixed;inset:0;z-index:2147482996;pointer-events:none';
        (document.body || document.documentElement).appendChild(ambientCanvas);
        ambientCtx = ambientCanvas.getContext ? ambientCanvas.getContext('2d') : null;
        if (!ambientCtx) { try { ambientCanvas.remove(); } catch (_) {} ambientCanvas = null; return; }
        ambientResize();
        spawnAmbient();
        window.addEventListener('resize', function () {
          if (!ambientCanvas) return;
          ambientResize();
          spawnAmbient();
        });
        document.addEventListener('visibilitychange', function () {
          // pestaña oculta: congelar (nada de rAF cobrando CPU en segundo plano)
          if (document.hidden && ambientRaf) {
            try { window.cancelAnimationFrame(ambientRaf); } catch (_) {}
            ambientRaf = 0;
            lastFrame = 0;
          } else if (!document.hidden && ambientParts.length && !ambientRaf) {
            ambientRaf = window.requestAnimationFrame(ambientFrame);
          }
        });
      }
      if (!ambientRaf) ambientRaf = window.requestAnimationFrame(ambientFrame);
    } catch (_) { failOpenAmbient(); }
  }

  function failOpenAmbient() {
    ambientRaf = 0;
    ambientTypes = [];
    try { if (ambientCanvas) ambientCanvas.remove(); } catch (_) {}
    ambientCanvas = null; ambientCtx = null;
  }

  // cruzar el umbral de noche/día sin esperar al evaluate de 10 min
  setInterval(function () {
    try {
      if (!nightCfg) return;
      var types = computeAmbientTypes();
      if (types.join() !== ambientTypes.join()) {
        ambientTypes = types;
        ambientDensity = (nightCfg ? nightCfg.density : 1) * (activeEventDef ? activeEventDef.effects.ambientDensity : 1);
        ambientDensity = Math.max(0.2, Math.min(1.5, ambientDensity));
        syncAmbient();
        if (ambientTypes.length) spawnAmbient();
      }
    } catch (_) {}
  }, 60000);

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
      if (!n) { setVignette(null, 0); activeEventDef = null; nightCfg = null; ambientTypes = []; syncAmbient(); return; }
      var ev = activeEvent(n);
      activeEventId = ev ? ev.id : null;
      activeEventDef = ev || null;
      nightCfg = n.night || null;
      setVignette(ev ? ev.effects.vignette : null, ev ? ev.effects.vignetteStrength : 0);
      try {
        ambientTypes = computeAmbientTypes();
        ambientDensity = (nightCfg ? nightCfg.density : 1) * (ev ? ev.effects.ambientDensity : 1);
        ambientDensity = Math.max(0.2, Math.min(1.5, ambientDensity));
        var wasEmpty = !ambientParts.length && !ambientMeteors.length;
        syncAmbient();
        if (ambientTypes.length && wasEmpty) spawnAmbient();
      } catch (_) { failOpenAmbient(); }

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
    return {
      activeEventId: activeEventId,
      ambient: ambientTypes.slice(),
      night: inNightHours(),
      menu: menuVisible(),
      identity: identitySeen ? { name: identitySeen.name, hashed: !!identityHashes } : null
    };
  };
})();
