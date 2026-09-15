(() => {
  'use strict';

  const W = globalThis;
  const EVENT_NAME = 'minifeather:realistic-config';
  try { W.MF_RealisticMode?.destroy?.(); } catch (_) {}

  const state = {
    enabled: false,
    level: 'medium',
    game: null,
    stars: new Map(),
    raf: 0,
    timer: 0,
    lastScan: 0,
    lastBiomeScan: 0,
    snowy: true,
    auroraApplied: null,
    baseLeafEnabled: false,
    baseLeafStrength: 0.085,
    baseAuroraEnabled: false,
    baseAuroraLevel: 'medium',
    fluidCount: 0,
    destroyed: false
  };

  const profiles = () => W.MF_RealisticProfiles;
  const currentProfile = () => profiles()?.get?.(state.level);

  function findGame() {
    if (state.game?.player && state.game?.world) return state.game;
    for (const candidate of [W.__MINIBLOX_GAME__, W.miniblox, W.__MB?.game, W.game]) {
      if (candidate?.player && candidate?.world) return (state.game = candidate);
    }
    for (const root of [document.querySelector('#react'), document.querySelector('#root')]) {
      if (!root) continue;
      let keys = [];
      try { keys = Object.keys(root); } catch (_) {}
      for (const key of keys) {
        if (!key.startsWith('__react')) continue;
        const queue = [root[key]], seen = new Set();
        let visited = 0;
        while (queue.length && visited++ < 1400) {
          const fiber = queue.shift();
          if (!fiber || seen.has(fiber)) continue;
          seen.add(fiber);
          for (const c of [fiber.stateNode, fiber.stateNode?.game, fiber.memoizedProps?.game, fiber.pendingProps?.game, fiber.memoizedState?.game]) {
            const g = c?.player && c?.world ? c : c?.game;
            if (g?.player && g?.world) {
              W.__MINIBLOX_GAME__ = g;
              return (state.game = g);
            }
          }
          if (fiber.child) queue.push(fiber.child);
          if (fiber.sibling) queue.push(fiber.sibling);
        }
      }
    }
    return null;
  }

  function collect(root, limit = 5000) {
    const out = [], queue = root ? [root] : [], seen = new WeakSet();
    while (queue.length && out.length < limit) {
      const o = queue.shift();
      if (!o || typeof o !== 'object' || seen.has(o)) continue;
      seen.add(o); out.push(o);
      if (Array.isArray(o.children)) for (const c of o.children) queue.push(c);
    }
    return out;
  }

  function scanFluids(game) {
    let count = 0;
    for (const root of [game?.gameScene?.scene, game?.gameScene?.ambientMeshes].filter(Boolean)) {
      for (const o of collect(root)) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) {
          if (W.MF_RealisticFluid?.isFluidMaterial?.(m) && W.MF_RealisticFluid.patch(m)) count++;
        }
      }
    }
    state.fluidCount = count;
  }

  function snapshotStars(game) {
    const p = currentProfile();
    if (!p) return;
    for (const root of [game?.gameScene?.stars, game?.gameScene?.sky?.stars].filter(Boolean)) {
      for (const o of collect(root, 500)) {
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (!m || state.stars.has(m)) continue;
          state.stars.set(m, { opacity: m.opacity, size: m.size, toneMapped: m.toneMapped, color: m.color?.clone?.() || null });
          if (Number.isFinite(m.opacity)) m.opacity = Math.min(1, m.opacity * 1.12 + 0.05);
          if (Number.isFinite(m.size)) m.size *= p.starScale;
          if ('toneMapped' in m) m.toneMapped = false;
          m.needsUpdate = true;
        }
      }
    }
  }

  function restoreStars() {
    for (const [m, s] of state.stars) {
      try {
        if (s.opacity !== undefined) m.opacity = s.opacity;
        if (s.size !== undefined) m.size = s.size;
        if (s.toneMapped !== undefined) m.toneMapped = s.toneMapped;
        if (s.color && m.color?.copy) m.color.copy(s.color);
        m.needsUpdate = true;
      } catch (_) {}
    }
    state.stars.clear();
  }

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(detail) }));
  }

  function applyCompanions(force = false) {
    const p = currentProfile();
    if (!p) return;
    emit('minifeather:leaf-wind-config', {
      enabled: state.enabled || state.baseLeafEnabled,
      strength: state.enabled ? p.leafWind : state.baseLeafStrength
    });
    const auroraEnabled = state.baseAuroraEnabled || (state.enabled && state.snowy);
    const auroraLevel = state.enabled ? (state.level === 'ultra' ? 'high' : state.level) : state.baseAuroraLevel;
    const sig = `${auroraEnabled}:${auroraLevel}`;
    if (force || sig !== state.auroraApplied) {
      state.auroraApplied = sig;
      emit('minifeather:aurora-config', { enabled: auroraEnabled, level: auroraLevel });
    }
  }

  function playerPosition(game) {
    const p = game?.player?.position || game?.player?.getPosition?.() || game?.player?.mesh?.position;
    if (!p) return null;
    const x = Number(p.x), y = Number(p.y), z = Number(p.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
  }

  function biomeValue(game, p) {
    for (const call of [
      () => game?.world?.getBiomeAt?.(p.x, p.y, p.z),
      () => game?.world?.getBiome?.(p.x, p.y, p.z),
      () => game?.world?.getChunk?.(p)?.getBiomeAt?.(p.x, p.y, p.z),
      () => game?.world?.getChunkAt?.(p.x, p.z)?.getBiomeAt?.(p.x, p.y, p.z)
    ]) {
      try { const v = call(); if (v !== undefined && v !== null) return v; } catch (_) {}
    }
    return null;
  }

  function isSnowBiome(v) {
    if (v == null) return null;
    let text = '';
    if (typeof v === 'string' || typeof v === 'number') text = String(v);
    else try { text = `${v.name || ''} ${v.id || ''} ${v.key || ''} ${JSON.stringify(v)}`; } catch (_) {}
    return text.trim() ? /snow|ice|frozen|tundra|taiga|glacier|polar|alpine|frigid/i.test(text) : null;
  }

  function applyProfile() {
    const p = currentProfile();
    if (!p) return;
    W.MF_RealisticFluid?.setProfile?.(p);
    W.MF_RealisticClouds?.setProfile?.(p);
    const game = findGame();
    if (game) W.MF_RealisticShadows?.apply?.(game, p);
  }

  function scan(force = false) {
    if (!state.enabled) return;
    const now = performance.now();
    if (!force && now - state.lastScan < 1800) return;
    state.lastScan = now;
    const game = findGame();
    const p = currentProfile();
    if (!game || !p) return;
    W.MF_RealisticFluid?.setProfile?.(p);
    W.MF_RealisticClouds?.setProfile?.(p);
    scanFluids(game);
    W.MF_RealisticClouds?.scan?.(game);
    W.MF_RealisticShadows?.apply?.(game, p);
    snapshotStars(game);
  }

  function tick(now) {
    if (!state.enabled || state.destroyed) return void (state.raf = 0);
    scan();
    if (now - state.lastBiomeScan > 2500) {
      state.lastBiomeScan = now;
      const game = findGame(), pos = playerPosition(game);
      if (game && pos) {
        const snowy = isSnowBiome(biomeValue(game, pos));
        if (snowy !== null && snowy !== state.snowy) {
          state.snowy = snowy;
          applyCompanions();
        }
      }
    }
    state.raf = requestAnimationFrame(tick);
  }

  function setEnabled(value) {
    const next = !!value;
    if (state.enabled === next) {
      if (next) { applyProfile(); scan(true); }
      applyCompanions(true);
      return;
    }
    state.enabled = next;
    if (next) {
      applyProfile();
      scan(true);
      applyCompanions(true);
      if (!state.raf) state.raf = requestAnimationFrame(tick);
    } else {
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0;
      W.MF_RealisticFluid?.restore?.();
      W.MF_RealisticClouds?.restore?.();
      W.MF_RealisticShadows?.restore?.();
      restoreStars();
      applyCompanions(true);
    }
  }

  function configure(detail) {
    let c = detail;
    if (typeof c === 'string') try { c = JSON.parse(c); } catch (_) { return; }
    if (!c || typeof c !== 'object') return;
    state.level = profiles()?.normalizeLevel?.(c.level) || 'medium';
    state.baseLeafEnabled = !!c.leafEnabled;
    state.baseLeafStrength = Math.max(0, Math.min(1, Number(c.leafStrength) || 0.085));
    state.baseAuroraEnabled = !!c.auroraEnabled;
    state.baseAuroraLevel = ['low', 'medium', 'high'].includes(String(c.auroraLevel)) ? String(c.auroraLevel) : 'medium';
    if (state.enabled) applyProfile();
    setEnabled(!!c.enabled);
  }

  function destroy() {
    if (state.destroyed) return;
    setEnabled(false);
    state.destroyed = true;
    document.removeEventListener(EVENT_NAME, onConfig, true);
    if (state.timer) clearInterval(state.timer);
    try { delete W.MF_RealisticMode; } catch (_) {}
  }

  function onConfig(e) { configure(e.detail); }
  document.addEventListener(EVENT_NAME, onConfig, true);
  state.timer = setInterval(scan, 2200);

  W.MF_RealisticMode = Object.freeze({
    configure, setEnabled, destroy,
    getState: () => ({
      enabled: state.enabled,
      level: state.level,
      fluids: state.fluidCount,
      clouds: W.MF_RealisticClouds?.count?.() || 0,
      stars: state.stars.size,
      snowy: state.snowy
    })
  });
})();
