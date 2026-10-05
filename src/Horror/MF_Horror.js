// mf horror: puerto de la experiencia de los mods de terror psicológico
// clásicos de minecraft (from the fog, the broken script, cave dweller,
// weeping angels) — 100% client-side: las entidades son meshes locales que
// NADIE más ve, los mensajes falsos nunca salen del navegador, el fake
// crash es un overlay. el terror solo existe en tu pantalla, que es
// exactamente el punto del terror psicológico.
// licencias: los originales son ARR — cero assets/textos/código de ellos;
// mecánicas re-implementadas desde cero con sonido sintetizado por WebAudio
// (ni un ogg descargado). créditos como "inspirado en" en CREDITS.md.
// opt-in, off por defecto, safeMode deja el meta (fake crash/disconnect)
// apagado para streamers. el director decide cuándo asustar; nada de
// sustos en el clímax de nadie sin consentimiento.
(function () {
  'use strict';
  if (window.__MF_Horror) return;
  window.__MF_Horror = true;

  var EVENT_CONFIG = 'minifeather:horror-config';
  var TAG = 'minifeather horror: ';

  var PRESETS = ['herobrine', 'broken', 'dweller', 'weeping'];

  var state = {
    enabled: false,
    preset: 'herobrine',
    intensity: 'normal',   // chill | normal | nightmare
    safeMode: true,        // true = sin fake crash/disconnect/bsod (streamers)
    phase: 'calm',         // calm | tension | event | cooldown
    phaseUntil: 0,
    cooldownUntil: 0,
    tension: 0,
    lastEvent: 0,
    sessionStart: 0,
    figure: null,
    figureData: null,
    figureShownAt: 0,
    stareAccum: 0,
    dwellerLastSeenPos: null,
    weepDist: 0,
    glitchEl: null,
    msgEl: null,
    overlayEl: null,
    audioCtx: null,
    droneOsc: null,
    droneGain: null,
    stepTimer: 0,
    lastStepPos: null,
    appliedFog: null,
    rafId: 0,
    lastTick: 0
  };

  var INTENSITY = {
    // firstGap: el debut. el slow burn es arte, pero un primer avistamiento en
    // el minuto 7 se siente como un mod roto — el primer evento llega temprano
    // y DESPUÉS el director vuelve a su cadencia normal de minutos.
    chill:    { minGap: 420, maxGap: 900,  tensionRate: 0.35, showMs: 2600, firstGap: [75, 150] },
    normal:   { minGap: 240, maxGap: 520,  tensionRate: 0.6,  showMs: 3200, firstGap: [40, 90] },
    nightmare:{ minGap: 110, maxGap: 260,  tensionRate: 1.0,  showMs: 4200, firstGap: [20, 45] }
  };

  // --- helpers de juego (defensivos: el internals cambia, el terror no) ------

  function getGame() {
    var cands = [
      globalThis.miniblox, globalThis.minibloxGame, globalThis.__MINIBLOX_GAME__,
      globalThis.__MB && globalThis.__MB.game, globalThis.game, globalThis.__game
    ];
    for (var i = 0; i < cands.length; i++) {
      if (cands[i] && cands[i].player) return cands[i];
    }
    return null;
  }

  function getScene(game) {
    return (game && game.gameScene && game.gameScene.scene) || null;
  }

  function getCamera(game) {
    if (!game) return null;
    var c = (game.gameScene && (game.gameScene.camera || game.gameScene.cam)) ||
      game.camera || (game.render && (game.render.camera || game.render.cam));
    if (!c && game.gameScene && game.gameScene.scene) {
      // última red: la escena de three suele colgar la cámara activa
      c = game.gameScene.scene.camera || game.gameScene.scene.userCamera || null;
    }
    return c || null;
  }

  function getPlayerPos(game) {
    var p = game && game.player;
    return (p && (p.position || (p.obj && p.obj.position) || (p.entity && p.entity.position))) || null;
  }

  // forward de cámara leyendo la matrixWorld directamente: sin clase THREE,
  // la columna 8/9/10 es +Z y la cámara mira hacia -Z
  function getCamForward(cam, out) {
    var e = cam && cam.matrixWorld && cam.matrixWorld.elements;
    if (!e) { out.x = 0; out.y = 0; out.z = -1; return out; }
    out.x = -e[8]; out.y = -e[9]; out.z = -e[10];
    var l = Math.hypot(out.x, out.y, out.z) || 1;
    out.x /= l; out.y /= l; out.z /= l;
    return out;
  }

  // clona el mesh del jugador local (patrón mobragdolls: geometry.clone() +
  // material.clone() sobre los objetos del juego; nunca instancia THREE)
  function findPlayerMesh(game) {
    var p = game && game.player;
    var m = p && (p.mesh || (p.obj && p.obj.mesh) || (p.entity && p.entity.mesh));
    if (m && m.isObject3D) return m;
    // búsqueda por escena: cualquier Object3D con userData del jugador local
    var scene = getScene(game);
    if (!scene) return null;
    var found = null;
    scene.traverse(function (o) {
      if (found) return;
      if (o.isMesh && o.userData && (o.userData.isLocalPlayer || o.userData.player === game.player)) found = o;
    });
    return found;
  }

  function cloneMatLike(src, colorHex) {
    var m = src ? src.clone() : null;
    if (m && m.color && m.color.set) m.color.set(colorHex);
    return m;
  }

  // figura humanoide por cajas: geometría clonada del jugador, escalada a
  // proporciones minecraft. herobrine = tonos steve; dweller/weeping = negro
  function makeFigure(game, kind) {
    var scene = getScene(game);
    if (!scene) return null;
    var srcMesh = findPlayerMesh(game);
    var srcGeo = null, srcMat = null;
    if (srcMesh) {
      srcMesh.traverse(function (o) {
        if (o.isMesh && !srcGeo && o.geometry) srcGeo = o.geometry;
        if (o.isMesh && !srcMat && o.material) srcMat = Array.isArray(o.material) ? o.material[0] : o.material;
      });
    }
    if (!srcGeo) return null;

    var black = kind !== 'herobrine';
    var skinHex = black ? 0x050505 : 0x9c7b6a;
    var shirtHex = black ? 0x030303 : 0x2f7dd1;
    var pantsHex = black ? 0x020202 : 0x2a4fa8;
    var eyeHex = 0xffffff;

    var mat = cloneMatLike(srcMat, skinHex);
    var shirt = cloneMatLike(srcMat, shirtHex);
    var pants = cloneMatLike(srcMat, pantsHex);
    var eye = cloneMatLike(srcMat, eyeHex);
    if (eye) { try { eye.fog = false; } catch (_) {} }

    function box(w, h, d, material, x, y, z) {
      var m = new (srcMesh.constructor)(srcGeo, material);
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      return m;
    }

    var root = null;
    try {
      // los Mesh del juego se instancian con su propio constructor (sin importar THREE)
      root = new (srcMesh.constructor)(srcGeo, mat);
      root.visible = false;
      // proporciones minecraft: total ~1.8; dweller estirado 1.5x
      var s = kind === 'dweller' ? 1.5 : 1;
      var legs = box(0.22, 0.75 * s, 0.24, pants, -0.13, 0.375 * s, 0);
      var legs2 = box(0.22, 0.75 * s, 0.24, pants, 0.13, 0.375 * s, 0);
      var torso = box(0.5, 0.75 * s, 0.26, shirt, 0, 1.12 * s, 0);
      var armL = box(0.2, 0.72 * s, 0.22, black ? shirt : mat, -0.35, 1.1 * s, 0);
      var armR = box(0.2, 0.72 * s, 0.22, black ? shirt : mat, 0.35, 1.1 * s, 0);
      var head = box(0.5, 0.5, 0.5, mat, 0, 1.75 * s, 0);
      root.add(legs); root.add(legs2); root.add(torso); root.add(armL); root.add(armR); root.add(head);
      if (kind === 'herobrine' && eye) {
        // ojos blancos que atraviesan la niebla: dos cubitos diminutos en la cara
        // (la figura mira a +Z hacia el jugador, la cara va en z positivo)
        var e1 = box(0.09, 0.06, 0.02, eye, -0.11, 1.82, 0.26);
        var e2 = box(0.09, 0.06, 0.02, eye, 0.11, 1.82, 0.26);
        root.add(e1); root.add(e2);
      }
      if (black) {
        root.traverse(function (o) {
          if (o.material) { try { o.material.fog = false; } catch (_) {} }
        });
      }
    } catch (_) { return null; }

    return root;
  }

  function spawnFigure(game, kind, distMeters, behindBias) {
    var scene = getScene(game);
    if (!scene || state.figure) return false;
    var pos = getPlayerPos(game);
    var cam = getCamera(game);
    if (!pos || !cam) return false;

    var fig = makeFigure(game, kind);
    if (!fig) return false;

    // ángulo de aparición: periferia o detrás según behindBias
    var e = cam.matrixWorld.elements;
    var backX = -e[8], backZ = -e[10];
    var baseAngle = Math.atan2(backX, backZ) + (behindBias ? Math.PI : 0);
    var angle = baseAngle + (Math.random() * 1.2 - 0.6);
    var x = pos.x + Math.sin(angle) * distMeters;
    var z = pos.z + Math.cos(angle) * distMeters;
    var y = (pos.y != null ? pos.y : 0);
    fig.position.set(x, y, z);
    // mirando al jugador: yaw hacia pos (los meshes del juego miran a +Z? se ajusta con atan2)
    fig.rotation.y = Math.atan2(pos.x - x, pos.z - z);
    scene.add(fig);
    state.figure = fig;
    state.figureData = { kind: kind, spawnedAt: performance.now(), dist: distMeters };
    state.figureShownAt = performance.now();
    return true;
  }

  function despawnFigure(silent) {
    var fig = state.figure;
    if (!fig) return;
    try { fig.removeFromParent ? fig.removeFromParent() : (fig.parent && fig.parent.remove(fig)); } catch (_) {}
    state.figure = null;
    state.figureData = null;
    state.stareAccum = 0;
    if (!silent) sfx.sting();
  }

  // --- audio sintetizado: cero assets, cero descargas, cero licencias -------

  var sfx = {
    ctx: function () {
      if (!state.audioCtx) {
        try { state.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
      }
      if (state.audioCtx && state.audioCtx.state === 'suspended') {
        try { state.audioCtx.resume(); } catch (_) {}
      }
      return state.audioCtx.state === 'running' ? state.audioCtx : null;
    },
    env: function (ctx, gainValue, dur, when) {
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(gainValue, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      g.connect(ctx.destination);
      return g;
    },
    // latido: dos golpes graves, la frecuencia del par sube con la cercanía
    heartbeat: function (rate01) {
      var ctx = this.ctx(); if (!ctx) return;
      var t = ctx.currentTime;
      var f = 55 + rate01 * 30;
      var g = this.env(ctx, 0.12 + rate01 * 0.15, 0.16, t);
      var o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.setValueAtTime(f, t);
      o.connect(g); o.start(t); o.stop(t + 0.2);
      var g2 = this.env(ctx, 0.08 + rate01 * 0.1, 0.14, t + 0.22);
      var o2 = ctx.createOscillator();
      o2.type = 'sine'; o2.frequency.setValueAtTime(f * 0.85, t + 0.22);
      o2.connect(g2); o2.start(t + 0.22); o2.stop(t + 0.42);
    },
    // paso: ráfaga de ruido filtrado — el eco que camina cuando tú caminas
    footstep: function (volume) {
      var ctx = this.ctx(); if (!ctx) return;
      var t = ctx.currentTime, dur = 0.09;
      var buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380 + Math.random() * 180;
      var g = ctx.createGain(); g.gain.value = volume;
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start(t);
    },
    // susurro: ruido con banda que se mueve como si hablara debajo del agua
    whisper: function () {
      var ctx = this.ctx(); if (!ctx) return;
      var t = ctx.currentTime, dur = 1.4 + Math.random() * 0.8;
      var buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(900, t);
      f.frequency.linearRampToValueAtTime(1400 + Math.random() * 500, t + dur * 0.6);
      f.frequency.linearRampToValueAtTime(700, t + dur);
      var g = ctx.createGain(); g.gain.value = 0.05;
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start(t);
    },
    // sting: saw desafinada corta — el cierre de cada avistamiento
    sting: function () {
      var ctx = this.ctx(); if (!ctx) return;
      var t = ctx.currentTime, dur = 0.7;
      var g = this.env(ctx, 0.16, dur, t);
      [110, 116.5, 220.8].forEach(function (fr, idx) {
        var o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(fr, t);
        o.frequency.exponentialRampToValueAtTime(fr * 0.5, t + dur);
        o.connect(g); o.start(t + idx * 0.01); o.stop(t + dur);
      });
    },
    drone: function (on, level) {
      var ctx = this.ctx();
      if (!ctx) return;
      if (on && !state.droneOsc) {
        var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 42;
        var g = ctx.createGain(); g.gain.value = 0;
        o.connect(g); g.connect(ctx.destination); o.start();
        state.droneOsc = o; state.droneGain = g;
      }
      if (state.droneGain) {
        var want = on ? level : 0;
        try { state.droneGain.gain.setTargetAtTime(want, ctx.currentTime, 1.2); } catch (_) {}
        if (!on && state.droneOsc) {
          var osc = state.droneOsc;
          setTimeout(function () { try { osc.stop(); } catch (_) {} }, 3000);
          state.droneOsc = null; state.droneGain = null;
        }
      }
    }
  };

  // --- capas visuales: glitch, mensajes falsos, fake disconnect --------------

  function glitchLayer() {
    if (state.glitchEl) return state.glitchEl;
    var el = document.createElement('div');
    el.id = 'mf-horror-glitch';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;opacity:0;' +
      'mix-blend-mode:screen;transition:opacity .05s linear;' +
      'background:repeating-linear-gradient(0deg,rgba(255,255,255,.06) 0 2px,transparent 2px 4px)';
    (document.body || document.documentElement).appendChild(el);
    state.glitchEl = el;
    return el;
  }

  function screenGlitch(ms) {
    var el = glitchLayer();
    var cv = document.querySelector('canvas');
    var prev = cv ? cv.style.filter : '';
    var jitters = ['invert(1) hue-rotate(90deg)', 'contrast(2.2) saturate(0)', 'blur(2px) hue-rotate(180deg)', 'none'];
    var n = Math.max(3, Math.round((ms || 260) / 60));
    var i = 0;
    var iv = setInterval(function () {
      i++;
      if (cv) cv.style.filter = jitters[i % jitters.length];
      el.style.opacity = (i % 2 ? '0.5' : '0.15');
      if (i >= n) {
        clearInterval(iv);
        if (cv) cv.style.filter = prev;
        el.style.opacity = '0';
      }
    }, 60);
  }

  // mensajes falsos estilo chat: línea propia sobre la zona de chat, nunca
  // sale del navegador ni toca el chat real
  var FAKE_LINES = {
    es: [
      'un jugador se ha unido a la partida',
      '<sistema> sincronizando sombras del mundo…',
      '[aviso] la semilla del mundo no coincide',
      'se ha guardado el mundo (en un lugar que no existe)',
      '<?????> te vi girar',
      'la conexión con el servidor se restableció sola'
    ],
    en: [
      'a player joined the game',
      '<system> syncing world shadows…',
      '[notice] world seed mismatch',
      'world saved (somewhere that does not exist)',
      '<?????> i saw you turn around',
      'connection to server restored by itself'
    ]
  };
  var fakeLineIdx = 0;

  function fakeChatMessage() {
    if (!state.msgEl) {
      var el = document.createElement('div');
      el.id = 'mf-horror-chat';
      el.style.cssText = 'position:fixed;left:8px;bottom:220px;z-index:999991;pointer-events:none;' +
        'font:14px/1.5 "Segoe UI",sans-serif;color:#fff;text-shadow:2px 2px 0 rgba(0,0,0,.8);opacity:0;transition:opacity .4s';
      (document.body || document.documentElement).appendChild(el);
      state.msgEl = el;
    }
    var lang = (navigator.language || 'es').toLowerCase().indexOf('en') === 0 ? 'en' : 'es';
    var lines = FAKE_LINES[lang];
    var txt = lines[fakeLineIdx % lines.length];
    fakeLineIdx++;
    var row = document.createElement('div');
    row.textContent = txt;
    row.style.opacity = '0.92';
    state.msgEl.appendChild(row);
    state.msgEl.style.opacity = '1';
    while (state.msgEl.children.length > 5) state.msgEl.firstChild.remove();
    setTimeout(function () {
      row.style.opacity = '0';
      setTimeout(function () { try { row.remove(); } catch (_) {} }, 600);
    }, 4200);
    sfx.whisper();
  }

  // fake disconnect / bsod corrupto: solo con safeMode off, auto-recupera
  function fakeDisconnect(ms) {
    if (state.safeMode || state.overlayEl) return;
    var el = document.createElement('div');
    el.id = 'mf-horror-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:#0b0b10;color:#c9c9d4;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;' +
      'font:15px/1.6 monospace;text-align:center;padding:24px';
    var lang = (navigator.language || 'es').toLowerCase().indexOf('en') === 0 ? 'en' : 'es';
    var t1 = lang === 'en' ? 'Disconnected' : 'Desconectado';
    var t2 = lang === 'en' ? 'java.net.SocketException: connection corrupted — reconnecting…'
      : 'java.net.SocketException: conexión corrompida — reconectando…';
    el.innerHTML = '<div style="font-size:22px;font-weight:700">' + t1 + '</div>' +
      '<div id="mf-horror-ov-msg" style="opacity:.8">' + t2 + '</div>';
    (document.body || document.documentElement).appendChild(el);
    state.overlayEl = el;
    sfx.sting();
    var msg = el.querySelector('#mf-horror-ov-msg');
    var dots = 0;
    var iv = setInterval(function () {
      dots++;
      if (msg) msg.textContent = (lang === 'en' ? 'reconnecting' : 'reconectando') + '.'.repeat(dots % 4);
    }, 400);
    setTimeout(function () {
      clearInterval(iv);
      try { el.remove(); } catch (_) {}
      if (state.overlayEl === el) state.overlayEl = null;
      screenGlitch(200);
    }, ms || 3400);
  }

  // --- niebla: se cierra durante un avistamiento y vuelve a su sitio --------

  function applyFog(game, tighten) {
    var scene = getScene(game);
    var fog = scene && scene.fog;
    if (!fog) return;
    if (tighten) {
      if (!state.appliedFog) {
        state.appliedFog = { near: fog.near, far: fog.far };
      }
      var k = 0.45;
      try { fog.far = Math.min(fog.far, state.appliedFog.far * k); fog.near = Math.min(fog.near, state.appliedFog.near * k); } catch (_) {}
    } else if (state.appliedFog) {
      try { fog.near = state.appliedFog.near; fog.far = state.appliedFog.far; } catch (_) {}
      state.appliedFog = null;
    }
  }

  // --- director: tensión, fases, eventos -------------------------------------

  function inGame() {
    var game = getGame();
    return !!(game && game.player && getScene(game));
  }

  function toVec3(v, out) { out.x = v.x; out.y = v.y || 0; out.z = v.z; return out; }

  // frustum aproximado: ángulo entre forward de cámara y vector a la figura
  var _fwd = { x: 0, y: 0, z: 0 }, _to = { x: 0, y: 0, z: 0 };
  function figureInSight(game) {
    var cam = getCamera(game);
    var pos = getPlayerPos(game);
    if (!cam || !pos || !state.figure) return false;
    var fp = state.figure.position;
    toVec3(pos, _to);
    _to.x = fp.x - _to.x; _to.y = (fp.y + 1.5) - (_to.y + 1.6); _to.z = fp.z - _to.z;
    var dist = Math.hypot(_to.x, _to.y, _to.z) || 1;
    _to.x /= dist; _to.y /= dist; _to.z /= dist;
    getCamForward(cam, _fwd);
    var dot = _fwd.x * _to.x + _fwd.y * _to.y + _fwd.z * _to.z;
    return { seen: dot > 0.72, dot: dot, dist: dist };
  }

  function distanceToPlayer(game) {
    var pos = getPlayerPos(game);
    if (!pos || !state.figure) return Infinity;
    var fp = state.figure.position;
    return Math.hypot(fp.x - pos.x, fp.y - (pos.y || 0), fp.z - pos.z);
  }

  // corazón + drone según cercanía de la figura activa
  function proximityAudio() {
    if (!state.figure) { sfx.drone(false); return; }
    var d = state.lastFigDist;
    if (d == null || !isFinite(d)) return;
    var t = Math.max(0, Math.min(1, 1 - d / 30));
    sfx.drone(state.phase !== 'calm', 0.02 + t * 0.05);
    if (t > 0.35 && performance.now() - state.stepTimer > 900 - t * 500) {
      state.stepTimer = performance.now();
      sfx.heartbeat(t);
    }
  }

  // eco de pasos: caminas tú, responde el mundo media distancia después
  function footstepEcho(game) {
    if (state.preset !== 'dweller' || !inGame()) return;
    var pos = getPlayerPos(game);
    if (!pos) return;
    var now = performance.now();
    if (state.lastStepPos) {
      var moved = Math.hypot(pos.x - state.lastStepPos.x, pos.z - state.lastStepPos.z);
      if (moved > 0.6 && now - state.stepTimer > 380) {
        state.stepTimer = now;
        sfx.footstep(0.05 + Math.random() * 0.04);
      }
    }
    state.lastStepPos = { x: pos.x, z: pos.z };
  }

  function pickEvent() {
    var cfg = INTENSITY[state.intensity] || INTENSITY.normal;
    var r = Math.random();
    var now = performance.now();
    var burn = Math.min(1, (now - state.sessionStart) / (6 * 60 * 1000)); // slow burn: 6 min hasta pleno
    if (state.preset === 'herobrine') {
      return spawnFigure(getGame(), 'herobrine', 24 + Math.random() * 16, r < 0.55) ? 'sighting' : null;
    }
    if (state.preset === 'dweller') {
      return spawnFigure(getGame(), 'dweller', 18 + Math.random() * 14, r < 0.7) ? 'stalk' : null;
    }
    if (state.preset === 'weeping') {
      return spawnFigure(getGame(), 'weeping', 14 + Math.random() * 10, r < 0.5) ? 'weep' : null;
    }
    // broken: meta-horror con escalado slow burn
    var pool = ['glitch', 'chatmsg'];
    if (!state.safeMode) pool.push('disconnect', 'chatmsg');
    if (burn > 0.5) pool.push('glitch');
    var ev = pool[Math.floor(Math.random() * pool.length)];
    if (ev === 'glitch') { screenGlitch(180 + Math.random() * 260); return 'glitch'; }
    if (ev === 'chatmsg') { fakeChatMessage(); return 'chatmsg'; }
    if (ev === 'disconnect') { fakeDisconnect(2600 + Math.random() * 2400); return 'disconnect'; }
    return null;
  }

  function scheduleNext(first) {
    var cfg = INTENSITY[state.intensity] || INTENSITY.normal;
    var lo = (first && cfg.firstGap) ? cfg.firstGap[0] : cfg.minGap;
    var hi = (first && cfg.firstGap) ? cfg.firstGap[1] : cfg.maxGap;
    var gap = (lo + Math.random() * (hi - lo)) * 1000;
    state.cooldownUntil = performance.now() + gap;
    state.phase = 'tension';
  }

  function tickDirector(now) {
    if (!state.enabled || !inGame()) {
      if (state.figure) despawnFigure(true);
      applyFog(getGame(), false);
      sfx.drone(false);
      state.phase = 'calm';
      return;
    }
    var cfg = INTENSITY[state.intensity] || INTENSITY.normal;

    // evento activo: gestión por preset
    if (state.phase === 'event' && state.figure) {
      var sight = figureInSight(getGame());
      state.lastFigDist = sight ? sight.dist : distanceToPlayer(getGame());
      var kind = state.figureData && state.figureData.kind;
      var shown = now - state.figureShownAt;

      if (kind === 'herobrine') {
        // se queda quieto mirando; si te acercas mucho o lo miras fijo, se va
        applyFog(getGame(), true);
        if (sight && sight.seen) state.stareAccum += 16; else state.stareAccum = Math.max(0, state.stareAccum - 8);
        if (state.lastFigDist < 12 || state.stareAccum > 1600 || shown > cfg.showMs) {
          applyFog(getGame(), false);
          despawnFigure(false);
          scheduleNext();
        }
      } else if (kind === 'dweller') {
        // avanza SOLO cuando no lo miras; a bocados, como debe ser
        applyFog(getGame(), true);
        if (!(sight && sight.seen) && state.lastFigDist > 4) {
          var step = Math.min(1.4, state.lastFigDist * 0.12);
          var pos = getPlayerPos(getGame());
          if (pos) {
            var dx = pos.x - state.figure.position.x, dz = pos.z - state.figure.position.z;
            var dl = Math.hypot(dx, dz) || 1;
            state.figure.position.x += (dx / dl) * step;
            state.figure.position.z += (dz / dl) * step;
            state.figure.rotation.y = Math.atan2(dx, dz);
          }
        }
        if (state.lastFigDist < 5.5) {
          applyFog(getGame(), false);
          despawnFigure(false); // sting incluido
          scheduleNext();
        } else if (shown > cfg.showMs * 1.6) {
          applyFog(getGame(), false);
          despawnFigure(true); // se esfuma sin anuncio: peor
          scheduleNext();
        }
      } else if (kind === 'weeping') {
        // congélalo mirándolo; parpadea y ya avanzó
        if (sight && sight.seen) {
          state.stareAccum = 0;
        } else {
          var pos2 = getPlayerPos(getGame());
          if (pos2) {
            var dx2 = pos2.x - state.figure.position.x, dz2 = pos2.z - state.figure.position.z;
            var dl2 = Math.hypot(dx2, dz2) || 1;
            var stepW = Math.min(2.6, dl2 * 0.35);
            state.figure.position.x += (dx2 / dl2) * stepW;
            state.figure.position.z += (dz2 / dl2) * stepW;
            state.figure.rotation.y = Math.atan2(dx2, dz2);
          }
        }
        if (state.lastFigDist < 2.2) {
          screenGlitch(420);
          despawnFigure(false);
          scheduleNext();
        } else if (shown > cfg.showMs * 2) {
          despawnFigure(true);
          scheduleNext();
        }
      }
      proximityAudio();
      return;
    }

    applyFog(getGame(), false);

    // fuera de evento: tensión sube y el director elige momento
    if (now > state.cooldownUntil) {
      state.tension = Math.min(1, state.tension + 0.016 * cfg.tensionRate);
    }
    var trigger = now > state.cooldownUntil && Math.random() < 0.02 * cfg.tensionRate * (0.4 + state.tension);
    if (trigger) {
      var ev = pickEvent();
      state.lastEvent = now;
      state.tension = Math.max(0, state.tension - 0.5);
      if (ev) state.phase = 'event';
      else scheduleNext();
    }
  }

  // --- loop principal ---------------------------------------------------------

  function loop(now) {
    state.rafId = requestAnimationFrame(loop);
    if (now - state.lastTick < 90) return; // el director piensa a 11hz, no a 60
    state.lastTick = now;
    try {
      tickDirector(now);
      if (state.enabled && state.preset === 'dweller') footstepEcho(getGame());
    } catch (_) {}
  }
  requestAnimationFrame(loop);

  // --- config -----------------------------------------------------------------

  function applyConfig(detail) {
    var c = typeof detail === 'string' ? JSON.parse(detail) : (detail || {});
    if (typeof c.enabled === 'boolean') {
      if (c.enabled && !state.enabled) {
        state.sessionStart = performance.now();
        state.tension = 0;
        scheduleNext(true); // debut temprano; después, cadencia normal
        try { console.log(TAG + 'activo — preset ' + (c.preset || state.preset) + (state.safeMode ? ' (safe)' : '')); } catch (_) {}
      }
      if (!c.enabled && state.enabled) {
        despawnFigure(true);
        applyFog(getGame(), false);
        sfx.drone(false);
        if (state.glitchEl) state.glitchEl.style.opacity = '0';
        if (state.overlayEl) { try { state.overlayEl.remove(); } catch (_) {} state.overlayEl = null; }
        if (state.msgEl) state.msgEl.style.opacity = '0';
      }
      state.enabled = c.enabled;
    }
    if (c.preset && PRESETS.indexOf(c.preset) >= 0 && c.preset !== state.preset) {
      despawnFigure(true);
      state.preset = c.preset;
      state.tension = 0;
      scheduleNext(true); // cambiar de preset también debuta rápido (testear presets sin esperar minutos)
    }
    if (c.intensity && INTENSITY[c.intensity]) state.intensity = c.intensity;
    if (typeof c.safeMode === 'boolean') {
      state.safeMode = c.safeMode;
      if (state.safeMode && state.overlayEl) { try { state.overlayEl.remove(); } catch (_) {} state.overlayEl = null; }
    }
  }

  document.addEventListener(EVENT_CONFIG, function (e) {
    try { applyConfig(e.detail); } catch (err) { try { console.warn(TAG + 'config inválida', err); } catch (_) {} }
  });

  // api de consola para quien prefiere teclado
  window.MF_Horror = {
    set: function (opts) { applyConfig(opts || {}); return snapshot(); },
    presets: function () { return PRESETS.slice(); },
    stop: function () { applyConfig({ enabled: false }); }
  };
  function snapshot() {
    return { enabled: state.enabled, preset: state.preset, intensity: state.intensity, safeMode: state.safeMode, phase: state.phase, tension: +state.tension.toFixed(2) };
  }

  try { console.log(TAG + 'listo — opt-in, off por defecto. presets: ' + PRESETS.join(', ')); } catch (_) {}
})();
