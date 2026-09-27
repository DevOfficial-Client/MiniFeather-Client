(() => {
  'use strict';

  const W = globalThis;
  const EVENT_NAME = 'minifeather:constellations-config';

  try { W.MF_ConstellationsExperimental?.destroy?.(); } catch (_) {}

  const state = {
    enabled: false,
    game: null,
    starfield: null,
    points: null,
    lines: null,
    meteors: [],
    radius: 0,
    nextMeteorAt: 0,
    lastTickAt: 0,
    raf: 0,
    lastGameScan: 0,
    lastWeatherScan: 0,
    rainFactor: 1,
    level: 'medium',
    destroyed: false
  };
  const LEVELS = {
    low: { line: 0.20, star: 0.85, px: 4.0, meteorMax: 1, meteorGap: [10, 22] },
    medium: { line: 0.32, star: 1.00, px: 5.5, meteorMax: 2, meteorGap: [5, 14] },
    high: { line: 0.46, star: 1.00, px: 7.0, meteorMax: 3, meteorGap: [3, 10] }
  };
  const TINTS = [
    [0.68, 0.78, 1.00],
    [1.00, 1.00, 1.00],
    [1.00, 0.92, 0.72],
    [1.00, 0.74, 0.45],
    [1.00, 0.55, 0.38]
  ];

  const DATA = {
      orion: {
      stars: [
        [5.919, 7.407, 4],
        [5.418, 6.350, 0],
        [5.679, -1.943, 0],
        [5.604, -1.202, 0],
        [5.533, -0.299, 0],
        [5.796, -9.670, 0],
        [5.242, -8.202, 0]
      ],
      lines: [[0, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]]
    },
    ursaMajor: {
      stars: [
        [11.062, 61.751, 2],
        [11.031, 56.382, 1],
        [11.897, 53.695, 1],
        [12.257, 57.033, 1],
        [12.900, 55.960, 1],
        [13.399, 54.925, 1],
        [13.792, 49.313, 0]
      ],
      lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]]
    },
    cassiopeia: {
      stars: [
        [0.153, 59.150, 2],
        [0.675, 56.537, 2],
        [0.945, 60.717, 0],
        [1.430, 60.235, 0],
        [1.907, 63.670, 1]
      ],
      lines: [[0, 1], [1, 2], [2, 3], [3, 4]]
    },
    cygnus: {
      stars: [
        [20.690, 45.280, 1],
        [20.370, 40.257, 2],
        [20.770, 33.970, 0],
        [19.749, 45.131, 0],
        [19.512, 27.960, 3]
      ],
      lines: [[0, 1], [1, 2], [1, 3], [1, 4]]
    },
    scorpius: {
      stars: [
        [16.090, -19.805, 0],
        [16.005, -22.622, 0],
        [15.981, -26.114, 0],
        [16.353, -25.593, 0],
        [16.490, -26.432, 4],
        [16.598, -28.216, 0],
        [16.836, -34.293, 0],
        [16.865, -38.017, 0],
        [16.911, -42.361, 0],
        [17.202, -43.239, 0],
        [17.622, -42.998, 0],
        [17.708, -39.030, 0],
        [17.560, -37.104, 0]
      ],
      lines: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7],
              [7, 8], [8, 9], [9, 10], [10, 11], [11, 12]]
    },
    lyra: {
      stars: [
        [18.616, 38.784, 0],
        [18.746, 37.605, 1],
        [18.834, 33.363, 0],
        [18.982, 32.690, 0],
        [18.908, 36.899, 4]
      ],
      lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]]
    },
    leo: {
      stars: [
        [10.139, 11.967, 0],
        [10.122, 16.763, 1],
        [10.333, 19.841, 2],
        [10.278, 23.417, 1],
        [9.879, 26.007, 2],
        [9.764, 23.774, 2],
        [11.235, 20.524, 1],
        [11.237, 15.430, 1],
        [11.818, 14.572, 0]
      ],
      lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
              [2, 6], [6, 8], [8, 7], [7, 0], [7, 6]]
    },
    crux: {
      stars: [
        [12.443, -63.099, 0],
        [12.795, -59.689, 0],
        [12.519, -57.113, 2],
        [12.253, -58.749, 0],
        [14.660, -60.834, 2],
        [14.064, -60.373, 0]
      ],
      lines: [[0, 2], [1, 3], [4, 5]]
    }
  };
  function raDecToVec(raHours, decDeg, radius) {
    const ra = (raHours * 15) * Math.PI / 180;
    const dec = decDeg * Math.PI / 180;
    return {
      x: Math.cos(dec) * Math.cos(ra) * radius,
      y: Math.sin(dec) * radius,
      z: -Math.cos(dec) * Math.sin(ra) * radius
    };
  }

  function smoothstep(x, a, b) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function findGame(force = false) {
    const now = performance.now();
    if (!force && state.game?.player && state.game?.world && now - state.lastGameScan < 1200) {
      return state.game;
    }
    state.lastGameScan = now;

    for (const candidate of [W.miniblox, W.__MINIBLOX_GAME__, state.game]) {
      if (candidate?.player && candidate?.world) {
        state.game = candidate;
        return candidate;
      }
    }

    try {
      const react = document.querySelector('#react');
      if (!react) return state.game?.player && state.game?.world ? state.game : null;
      for (const value of Object.values(react)) {
        const game = value?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player && game?.world) {
          W.__MINIBLOX_GAME__ = game;
          state.game = game;
          return game;
        }
      }
    } catch (_) {}

    return state.game?.player && state.game?.world ? state.game : null;
  }

  function resolveGameScene(game) {
    return game?.gameScene || game?.player?.game?.gameScene || null;
  }
  function findStarfield(gameScene) {
    const children = gameScene?.ambientMeshes?.children;
    if (!Array.isArray(children)) return null;
    for (const child of children) {
      if (
        child?.isPoints === true &&
        child?.geometry?.attributes?.position?.count >= 500 &&
        child?.material?.size >= 100 &&
        child !== state.points
      ) {
        return child;
      }
    }
    return null;
  }

  function build(gameScene) {
    const starfield = state.starfield;
    if (!starfield) return false;
    const PointsClass = starfield.constructor;
    const GeometryClass = starfield.geometry.constructor;
    const AttributeClass = starfield.geometry.attributes.position.constructor;
    const PointsMaterialClass = starfield.material.constructor;
    const ColorClass = starfield.material.color.constructor;

    const selectBox = state.game?.player?.selectBox;
    const LineSegmentsClass = selectBox
      ? Object.getPrototypeOf(selectBox.constructor)
      : null;
    const LineBasicMaterialClass = selectBox?.material?.constructor || null;
    if (!LineSegmentsClass || !LineBasicMaterialClass) return false;
    const sun = gameScene?.sky?.sun || gameScene?.sun;
    const radius = (sun?.sunDist || 5e4) + 1;

    const starPos = [];
    const starCol = [];
    const linePos = [];

    for (const c of Object.values(DATA)) {
      const vecs = c.stars.map(s => raDecToVec(s[0], s[1], radius));
      vecs.forEach((v, i) => {
        starPos.push(v.x, v.y, v.z);
        const tint = TINTS[c.stars[i][2] || 0];
        starCol.push(tint[0], tint[1], tint[2]);
      });
      for (const [a, b] of c.lines) {
        linePos.push(vecs[a].x, vecs[a].y, vecs[a].z, vecs[b].x, vecs[b].y, vecs[b].z);
      }
    }

    const starGeo = new GeometryClass();
    starGeo.setAttribute('position', new AttributeClass(starPos, 3));
    starGeo.setAttribute('color', new AttributeClass(starCol, 3));

    const lineGeo = new GeometryClass();
    lineGeo.setAttribute('position', new AttributeClass(linePos, 3));

    const L = LEVELS[state.level] || LEVELS.medium;

    state.points = new PointsClass(starGeo, new PointsMaterialClass({
      transparent: true,
      color: new ColorClass(1, 1, 1),
      vertexColors: true,
      size: L.px,
      sizeAttenuation: false,
      fog: false,
      depthWrite: false
    }));

    state.lines = new LineSegmentsClass(lineGeo, new LineBasicMaterialClass({
      transparent: true,
      color: new ColorClass('#aebfff'),
      fog: false,
      depthWrite: false,
      opacity: 0
    }));

    state.points.frustumCulled = false;
    state.lines.frustumCulled = false;
    state.points.renderOrder = 1;
    state.lines.renderOrder = 1;

    gameScene.ambientMeshes.add(state.points);
    gameScene.ambientMeshes.add(state.lines);
    state.radius = radius;
    state.meteors = [];
    state.nextMeteorAt = performance.now() + 2500 + Math.random() * 4000;
    for (let i = 0; i < 3; i++) {
      const trailGeo = new GeometryClass();
      trailGeo.setAttribute('position', new AttributeClass(new Float32Array(METEOR_SEGS * 6), 3));
      trailGeo.setAttribute('color', new AttributeClass(new Float32Array(METEOR_SEGS * 6), 3));

      const trail = new LineSegmentsClass(trailGeo, new LineBasicMaterialClass({
        vertexColors: true,
        transparent: true,
        blending: 2,
        fog: false,
        depthWrite: false
      }));

      const headGeo = new GeometryClass();
      headGeo.setAttribute('position', new AttributeClass(new Float32Array([0, 0, 0]), 3));

      const head = new PointsClass(headGeo, new PointsMaterialClass({
        color: new ColorClass(0.85, 0.93, 1.0),
        transparent: true,
        size: 6,
        sizeAttenuation: false,
        blending: 2,
        fog: false,
        depthWrite: false
      }));

      trail.frustumCulled = false;
      head.frustumCulled = false;
      trail.renderOrder = 1;
      head.renderOrder = 1;
      trail.visible = false;
      head.visible = false;

      gameScene.ambientMeshes.add(trail);
      gameScene.ambientMeshes.add(head);
      state.meteors.push({
        line: trail, head, active: false,
        px: 0, py: 0, pz: 0, dx: 0, dy: -1, dz: 0,
        speed: 0, life: 1, t: 0, spacing: 1
      });
    }
    return true;
  }

  function teardown() {
    const gameScene = resolveGameScene(state.game);
    const all = [state.points, state.lines];
    for (const m of state.meteors) all.push(m.line, m.head);
    for (const obj of all) {
      if (!obj) continue;
      try { gameScene?.ambientMeshes?.remove?.(obj); } catch (_) {}
      try { obj.geometry?.dispose?.(); } catch (_) {}
      try { obj.material?.dispose?.(); } catch (_) {}
    }
    state.points = null;
    state.lines = null;
    state.meteors = [];
  }

  function applyLevel() {
    const L = LEVELS[state.level] || LEVELS.medium;
    if (state.points?.material) {
      state.points.material.size = L.px;
    }
  }
  const nativeSaved = new Map();

  function normalizeNative(starfield) {
    const m = starfield?.material;
    if (!m || typeof m.size !== 'number') return;
    if (nativeSaved.has(m)) return;
    if (nativeSaved.size > 8) restoreNatives();
    nativeSaved.set(m, {
      size: m.size,
      sizeAttenuation: m.sizeAttenuation
    });
    m.size = 3;
    m.sizeAttenuation = false;
    m.needsUpdate = true;
  }

  function restoreNatives() {
    for (const [m, s] of nativeSaved) {
      try {
        m.size = s.size;
        m.sizeAttenuation = s.sizeAttenuation;
        m.needsUpdate = true;
      } catch (_) {}
    }
    nativeSaved.clear();
  }
  const METEOR_SEGS = 12;

  function spawnMeteor(radius) {
    const m = state.meteors.find(x => !x.active);
    if (!m) return;
    const az = Math.random() * Math.PI * 2;
    const el = 0.18 + Math.random() * 0.95;
    const cel = Math.max(0.05, Math.cos(el));
    const nx = Math.cos(el) * Math.cos(az);
    const ny = Math.sin(el);
    const nz = -Math.cos(el) * Math.sin(az);
    const e1x = nz / cel, e1z = -nx / cel;
    const e2x = -e1z * ny;
    const e2y = e1z * nx - e1x * nz;
    const e2z = e1x * ny;
    const psi = Math.random() * 1.6 - 0.8;
    const cp = Math.cos(psi), sp = Math.sin(psi);
    let dx = e2x * cp + e1x * sp;
    let dy = e2y * cp;
    let dz = e2z * cp + e1z * sp;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const speed = radius * (0.35 + Math.random() * 0.4);
    let px = nx * radius, py = ny * radius, pz = nz * radius;
    const sf = state.starfield;
    const VC = sf?.position?.constructor;
    if (VC && sf?.quaternion) {
      try {
        const q = sf.quaternion.clone().invert();
        const v = new VC(px, py, pz).applyQuaternion(q);
        const d = new VC(dx, dy, dz).applyQuaternion(q);
        px = v.x; py = v.y; pz = v.z;
        dx = d.x; dy = d.y; dz = d.z;
      } catch (_) {}
    }

    Object.assign(m, {
      active: true,
      px, py, pz,
      dx, dy, dz,
      speed,
      life: 0.8 + Math.random() * 0.7,
      t: 0,
      spacing: (speed * (0.22 + Math.random() * 0.12)) / METEOR_SEGS
    });
    m.line.visible = true;
    m.head.visible = true;
  }

  function killMeteor(m) {
    m.active = false;
    m.line.visible = false;
    m.head.visible = false;
  }

  function updateMeteors(dt, L, night, rain, now) {
    const meteors = state.meteors;
    if (!meteors.length) return;
    if (night > 0.15 && rain > 0.25 && now >= state.nextMeteorAt) {
      let count = 0;
      for (const m of meteors) if (m.active) count++;
      if (count < L.meteorMax) spawnMeteor(state.radius);
      const gap = L.meteorGap;
      state.nextMeteorAt = now + (gap[0] + Math.random() * (gap[1] - gap[0])) * 1000;
    }

    for (const m of meteors) {
      if (!m.active) continue;
      m.t += dt;
      let worldY = m.py;
      try {
        const VC2 = m.line.position.constructor;
        worldY = new VC2(m.px, m.py, m.pz).applyQuaternion(m.line.quaternion).y;
      } catch (_) {}
      if (m.t >= m.life || worldY < 0.04 * state.radius) { killMeteor(m); continue; }

      m.px += m.dx * m.speed * dt;
      m.py += m.dy * m.speed * dt;
      m.pz += m.dz * m.speed * dt;
      const k = m.t / m.life;
      const alpha = Math.min(1, k / 0.12) * Math.min(1, (1 - k) / 0.28) * night * rain;
      if (alpha <= 0.002) { killMeteor(m); continue; }
      const pos = m.line.geometry.attributes.position.array;
      const col = m.line.geometry.attributes.color.array;
      for (let i = 0; i < METEOR_SEGS; i++) {
        const f0 = 1 - i / METEOR_SEGS;
        const f1 = 1 - (i + 1) / METEOR_SEGS;
        const o = i * 6;
        pos[o] = m.px - m.dx * m.spacing * i;
        pos[o + 1] = m.py - m.dy * m.spacing * i;
        pos[o + 2] = m.pz - m.dz * m.spacing * i;
        col[o] = 0.82 * f0 * f0;
        col[o + 1] = 0.90 * f0 * f0;
        col[o + 2] = 1.0 * f0 * f0;

        pos[o + 3] = m.px - m.dx * m.spacing * (i + 1);
        pos[o + 4] = m.py - m.dy * m.spacing * (i + 1);
        pos[o + 5] = m.pz - m.dz * m.spacing * (i + 1);
        col[o + 3] = 0.82 * f1 * f1;
        col[o + 4] = 0.90 * f1 * f1;
        col[o + 5] = 1.0 * f1 * f1;
      }
      m.line.geometry.attributes.position.needsUpdate = true;
      m.line.geometry.attributes.color.needsUpdate = true;
      m.line.material.opacity = alpha;
      const hp = m.head.geometry.attributes.position.array;
      hp[0] = m.px; hp[1] = m.py; hp[2] = m.pz;
      m.head.geometry.attributes.position.needsUpdate = true;
      m.head.material.opacity = alpha * (0.85 + 0.15 * Math.sin(now * 0.02 + m.t * 40));
    }
  }

  function updateWeather(game, now) {
    if (now - state.lastWeatherScan < 350) return;
    state.lastWeatherScan = now;
    let rain = 0;
    let thunder = 0;
    try { rain = Number(game?.world?.getRainStrength?.(1)) || 0; } catch (_) {}
    try { thunder = Number(game?.world?.getThunderStrength?.(1)) || 0; } catch (_) {}
    state.rainFactor = Math.max(0, Math.min(1, 1 - rain * 0.78 - thunder * 0.18));
  }

  function tick(now) {
    if (state.destroyed) return;

    if (!state.enabled) {
      state.raf = 0;
      return;
    }

    const game = findGame();
    const gameScene = resolveGameScene(game);

    if (!state.points || !state.lines || !state.starfield) {
      state.starfield = findStarfield(gameScene);
      if (state.starfield && !build(gameScene)) {
        state.starfield = null;
      }
    }

    const points = state.points;
    const lines = state.lines;
    const starfield = state.starfield;

    if (points && lines && starfield) {
      const home = gameScene?.ambientMeshes;
      if (!home || starfield.parent !== home) {
        teardown();
        state.starfield = null;
        state.raf = requestAnimationFrame(tick);
        return;
      }

      updateWeather(game, now);
      normalizeNative(starfield);
      points.position.copy(starfield.position);
      points.quaternion.copy(starfield.quaternion);
      lines.position.copy(starfield.position);
      lines.quaternion.copy(starfield.quaternion);
      let night = 0.85;
      const dayFactor = gameScene?.sky?.uniforms?.dayFactor?.value;
      if (typeof dayFactor === 'number' && Number.isFinite(dayFactor)) {
        const sinAlt = (dayFactor - 0.5) * 2;
        night = 1 - smoothstep(sinAlt, -0.12, 0);
      }

      const visible = night > 0.004 && state.rainFactor > 0.02 &&
        (starfield.visible !== false || gameScene?.sky?.uniforms);

      points.visible = visible;
      lines.visible = visible;

      if (visible) {
        const L = LEVELS[state.level] || LEVELS.medium;
        const twStar = 0.82 + 0.18 * Math.sin(now * 0.0021);
        const twLine = 0.90 + 0.10 * Math.sin(now * 0.0013 + 2.1);
        points.material.opacity = L.star * night * state.rainFactor * twStar;
        lines.material.opacity = L.line * night * state.rainFactor * twLine;
      }
      if (state.meteors.length) {
        state.lastTickAt = state.lastTickAt || now;
        const dt = Math.min(0.05, Math.max(0.001, (now - state.lastTickAt) / 1000));
        state.lastTickAt = now;

        const skyNight = visible;
        if (skyNight) {
          for (const m of state.meteors) {
            if (!m.active) continue;
            m.line.position.copy(starfield.position);
            m.line.quaternion.copy(starfield.quaternion);
            m.head.position.copy(starfield.position);
            m.head.quaternion.copy(starfield.quaternion);
          }
          updateMeteors(dt, LEVELS[state.level] || LEVELS.medium, night, state.rainFactor, now);
        } else {
          for (const m of state.meteors) if (m.active) killMeteor(m);
          state.lastTickAt = 0;
        }
      }
    }

    state.raf = requestAnimationFrame(tick);
  }

  function setEnabled(value) {
    const next = !!value;
    if (state.enabled === next) return;
    state.enabled = next;

    if (next) {
      state.rainFactor = 1;
      if (!state.raf) state.raf = requestAnimationFrame(tick);
      return;
    }

    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (state.points) state.points.visible = false;
    if (state.lines) state.lines.visible = false;
    for (const m of state.meteors) if (m.active) killMeteor(m);
    state.lastTickAt = 0;
    restoreNatives();
  }

  function setLevel(value) {
    const level = String(value || '').toLowerCase();
    state.level = level === 'low' || level === 'high' ? level : 'medium';
    applyLevel();
  }

  function onConfig(event) {
    let detail = event?.detail;
    if (typeof detail === 'string') {
      try { detail = JSON.parse(detail); } catch (_) { detail = {}; }
    }
    setLevel(detail?.level);
    setEnabled(!!detail?.enabled);
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    document.removeEventListener(EVENT_NAME, onConfig);
    if (state.raf) cancelAnimationFrame(state.raf);
    setEnabled(false);
    teardown();
    try { delete W.MF_ConstellationsExperimental; } catch (_) {}
  }

  document.addEventListener(EVENT_NAME, onConfig);

  W.MF_ConstellationsExperimental = Object.freeze({
    setEnabled,
    setLevel,
    destroy,
    get enabled() { return state.enabled; },
    get level() { return state.level; },
    get built() { return !!state.points; }
  });
})();
