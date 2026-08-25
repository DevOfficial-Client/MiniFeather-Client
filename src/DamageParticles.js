(function () {
  'use strict';

  const EVENT_CONFIG = 'minifeather:damage-particles-config';
  const GLOBAL_KEY = '__MINIFEATHER_DAMAGE_PARTICLES__';
  const PARTICLE_LIFE_MS = 1250;
  const DAMAGE_WAIT_MS = 900;
  const DAMAGE_SCAN_MS = 10;
  const REHOOK_MS = 400;

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  const state = {
    enabled: false,
    game: null,
    player: null,
    attackName: null,
    originalAttack: null,
    pendingHits: [],
    particles: new Set(),
    layer: null,
    hookTimer: 0,
    scanTimer: 0,
    animationFrame: 0,
    destroyed: false
  };

  function getGame() {
    if (globalThis.miniblox?.player) {
      state.game = globalThis.miniblox;
      return state.game;
    }

    if (state.game?.player) return state.game;

    try {
      const react = document.querySelector('#react');
      if (!react) return null;

      for (const root of Object.values(react)) {
        const game = root?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player) {
          state.game = game;
          return game;
        }
      }
    } catch (_) {}

    return null;
  }

  function getHealth(entity) {
    if (!entity) return null;

    try {
      if (typeof entity.getHealth === 'function') {
        const value = Number(entity.getHealth());
        if (Number.isFinite(value)) return value;
      }
    } catch (_) {}

    for (const key of ['health', 'currentHealth', 'hp']) {
      try {
        const value = Number(entity[key]);
        if (Number.isFinite(value)) return value;
      } catch (_) {}
    }

    return null;
  }

  function findAttackMethod(player) {
    let proto = player;
    const seen = new Set();

    for (let depth = 0; proto && depth < 10; depth++, proto = Object.getPrototypeOf(proto)) {
      let names = [];
      try {
        names = Object.getOwnPropertyNames(proto);
      } catch (_) {}

      for (const name of names) {
        if (name === 'constructor' || seen.has(name)) continue;
        seen.add(name);

        let fn;
        try {
          fn = player[name];
        } catch (_) {
          continue;
        }

        if (typeof fn !== 'function') continue;

        let source = '';
        try {
          source = Function.prototype.toString.call(fn);
        } catch (_) {}

        if (
          source.includes('causePlayerDamage(this)') &&
          source.includes('attackEntityFrom')
        ) {
          return name;
        }
      }
    }

    return null;
  }

  function restoreAttack() {
    if (state.player && state.attackName && state.originalAttack) {
      try {
        state.player[state.attackName] = state.originalAttack;
      } catch (_) {}
    }

    state.player = null;
    state.attackName = null;
    state.originalAttack = null;
  }

  function registerPendingHit(target, healthBefore) {
    if (!target || !Number.isFinite(healthBefore)) return;

    state.pendingHits.push({
      target,
      healthBefore,
      started: performance.now()
    });
  }

  function hookPlayer() {
    if (!state.enabled || state.destroyed) return;

    const game = getGame();
    const player = game?.player;
    if (!player) return;

    if (
      state.player === player &&
      state.attackName &&
      state.originalAttack
    ) {
      return;
    }

    restoreAttack();

    const attackName = findAttackMethod(player);
    if (!attackName) {
      state.player = player;
      return;
    }

    const original = player[attackName];
    state.player = player;
    state.attackName = attackName;
    state.originalAttack = original;

    player[attackName] = function (...args) {
      const target = args[0];
      const before = getHealth(target);
      const result = original.apply(this, args);

      if (
        state.enabled &&
        target &&
        target !== this &&
        target.type === 'player' &&
        Number.isFinite(before)
      ) {
        const after = getHealth(target);

        if (Number.isFinite(after) && after < before) {
          spawnDamage(target, before - after);
        } else {
          registerPendingHit(target, before);
        }
      }

      return result;
    };
  }

  function getCamera() {
    const game = getGame();
    return game?.gameScene?.camera || game?.camera || globalThis.camera || null;
  }

  function createVector3(x, y, z) {
    const camera = getCamera();

    try {
      const Vector3 = globalThis.THREE?.Vector3 || camera?.position?.constructor;
      if (!Vector3) return null;
      return new Vector3(x, y, z);
    } catch (_) {
      return null;
    }
  }

  function project(x, y, z) {
    const camera = getCamera();
    if (!camera) return null;

    const point = createVector3(x, y, z);
    if (!point || typeof point.project !== 'function') return null;

    try {
      point.project(camera);

      if (
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.z < -1 ||
        point.z > 1
      ) {
        return null;
      }

      return {
        x: (point.x * 0.5 + 0.5) * innerWidth,
        y: (-point.y * 0.5 + 0.5) * innerHeight
      };
    } catch (_) {
      return null;
    }
  }

  function ensureLayer() {
    if (state.layer?.isConnected) return state.layer;

    const existing = document.getElementById('mf-damage-particles-layer');
    if (existing) existing.remove();

    const layer = document.createElement('div');
    layer.id = 'mf-damage-particles-layer';

    Object.assign(layer.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
      zIndex: '2147483646'
    });

    document.documentElement.appendChild(layer);
    state.layer = layer;
    return layer;
  }

  function formatDamage(damage) {
    let value = Math.round(Number(damage) * 10) / 10;
    if (value > 0 && value < 0.1) value = 0.1;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function randomSpawnPosition(target) {
    const x = Number(target?.pos?.x) || 0;
    const y = Number(target?.pos?.y) || 0;
    const z = Number(target?.pos?.z) || 0;
    const height = Number(target?.height) || 1.8;
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.18 + Math.random() * 0.42;

    return {
      x: x + Math.cos(angle) * radius,
      y: y + height * (0.52 + Math.random() * 0.48),
      z: z + Math.sin(angle) * radius
    };
  }

  function spawnDamage(target, damage) {
    damage = Number(damage);

    if (
      !state.enabled ||
      !target?.pos ||
      target.type !== 'player' ||
      !Number.isFinite(damage) ||
      damage <= 0
    ) {
      return;
    }

    const layer = ensureLayer();
    const position = randomSpawnPosition(target);
    const element = document.createElement('div');
    const amount = document.createElement('span');
    const heart = document.createElement('span');

    amount.textContent = `-${formatDamage(damage)}`;
    heart.textContent = '❤';

    Object.assign(element.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      display: 'flex',
      alignItems: 'center',
      gap: '3px',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      transform: 'translate(-50%, -50%) scale(.65)',
      transformOrigin: 'center',
      opacity: '0',
      filter: 'drop-shadow(0 2px 1px rgba(0,0,0,.95))',
      willChange: 'left, top, transform, opacity'
    });

    const textStyle = {
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: '900',
      lineHeight: '1',
      color: '#ff3030',
      WebkitTextStroke: '1px rgba(55,0,0,.95)',
      textShadow: '0 0 3px rgba(255,30,30,.18)',
      userSelect: 'none'
    };

    Object.assign(amount.style, textStyle, {
      fontSize: '18px',
      letterSpacing: '-.5px'
    });

    Object.assign(heart.style, textStyle, {
      fontSize: '17px'
    });

    element.append(amount, heart);
    layer.appendChild(element);

    const driftAngle = Math.random() * Math.PI * 2;
    const driftPower = 0.15 + Math.random() * 0.25;

    state.particles.add({
      element,
      started: performance.now(),
      x: position.x,
      y: position.y,
      z: position.z,
      driftX: Math.cos(driftAngle) * driftPower,
      driftZ: Math.sin(driftAngle) * driftPower,
      rise: 0.50 + Math.random() * 0.35,
      rotation: (Math.random() - 0.5) * 5
    });
  }

  function scanDamage() {
    if (!state.enabled || state.destroyed) return;

    const now = performance.now();

    for (let i = state.pendingHits.length - 1; i >= 0; i--) {
      const hit = state.pendingHits[i];

      if (now - hit.started > DAMAGE_WAIT_MS) {
        state.pendingHits.splice(i, 1);
        continue;
      }

      const health = getHealth(hit.target);
      if (!Number.isFinite(health)) continue;

      if (health < hit.healthBefore) {
        state.pendingHits.splice(i, 1);
        spawnDamage(hit.target, hit.healthBefore - health);
      }
    }
  }

  function animate() {
    if (!state.enabled || state.destroyed) {
      state.animationFrame = 0;
      return;
    }

    const now = performance.now();

    for (const particle of state.particles) {
      const age = now - particle.started;

      if (age >= PARTICLE_LIFE_MS) {
        particle.element.remove();
        state.particles.delete(particle);
        continue;
      }

      const progress = age / PARTICLE_LIFE_MS;
      const movement = 1 - Math.pow(1 - progress, 2);
      const screen = project(
        particle.x + particle.driftX * movement,
        particle.y + particle.rise * movement,
        particle.z + particle.driftZ * movement
      );

      if (!screen) {
        particle.element.style.display = 'none';
        continue;
      }

      particle.element.style.display = 'flex';
      particle.element.style.left = `${screen.x}px`;
      particle.element.style.top = `${screen.y}px`;

      let opacity = 1;
      if (progress < 0.08) opacity = progress / 0.08;
      if (progress > 0.60) opacity = 1 - (progress - 0.60) / 0.40;

      const scale = progress < 0.13
        ? 0.65 + (progress / 0.13) * 0.50
        : 1.15 - Math.min((progress - 0.13) / 0.22, 1) * 0.15;

      const rotation = particle.rotation * (1 - progress);

      particle.element.style.opacity = String(Math.max(0, Math.min(1, opacity)));
      particle.element.style.transform =
        `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`;
    }

    state.animationFrame = requestAnimationFrame(animate);
  }

  function clearVisuals() {
    state.pendingHits.length = 0;

    for (const particle of state.particles) {
      particle.element.remove();
    }

    state.particles.clear();
    state.layer?.remove();
    state.layer = null;
  }

  function start() {
    if (state.enabled || state.destroyed) return;
    state.enabled = true;

    ensureLayer();
    hookPlayer();
    state.hookTimer = window.setInterval(hookPlayer, REHOOK_MS);
    state.scanTimer = window.setInterval(scanDamage, DAMAGE_SCAN_MS);
    state.animationFrame = requestAnimationFrame(animate);
  }

  function stop() {
    if (!state.enabled) return;
    state.enabled = false;

    clearInterval(state.hookTimer);
    clearInterval(state.scanTimer);
    state.hookTimer = 0;
    state.scanTimer = 0;

    if (state.animationFrame) {
      cancelAnimationFrame(state.animationFrame);
      state.animationFrame = 0;
    }

    restoreAttack();
    clearVisuals();
  }

  function applyConfig(detail) {
    let config = detail;

    if (typeof detail === 'string') {
      try {
        config = JSON.parse(detail);
      } catch (_) {
        config = null;
      }
    }

    if (!config || typeof config !== 'object') return;
    if (config.enabled) start();
    else stop();
  }

  function onConfig(event) {
    applyConfig(event?.detail);
  }

  document.addEventListener(EVENT_CONFIG, onConfig);

  function destroy() {
    if (state.destroyed) return;
    stop();
    state.destroyed = true;
    document.removeEventListener(EVENT_CONFIG, onConfig);

    if (globalThis[GLOBAL_KEY]?.destroy === destroy) {
      delete globalThis[GLOBAL_KEY];
    }
  }

  globalThis[GLOBAL_KEY] = {
    destroy
  };
})();
