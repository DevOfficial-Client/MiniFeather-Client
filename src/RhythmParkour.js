// RhythmParkour - Transforma Miniblox en un juego de ritmo/parkour
// Los obstáculos se generan al ritmo de la música cargada
(function () {
'use strict';

const EVENT_CONFIG = 'minifeather:rhythmparkour-config';
const EVENT_COMMAND = 'minifeather:rhythmparkour-command';
const EVENT_STATE = 'minifeather:rhythmparkour-state';

const state = {
  enabled: false,
  game: null,
  world: null,
  audioContext: null,
  analyser: null,
  audioSource: null,
  currentSong: null,
  beats: [],
  beatCount: 0,
  currentBeat: 0,
  obstacles: [],      // grupos de obstáculos (cada uno con offsets relativos)
  nextObstacleId: 0,
  isPlaying: false,
  score: 0,
  combo: 0,
  maxCombo: 0,
  health: 5,
  beatInterval: null,
  gameLoopId: null,
  lastFrameTime: null,
  audioStartTime: 0,
  lookAheadTime: 4.0,
  blockSpeed: 11.75,
  detectedBPM: 120,
  beatIntervalSeconds: 0.5,
  ui: null,
  lastStateSync: 0,
  lastCollisionCheck: 0
};

const config = {
  spawnArea: {
    minX: -400, minY: 11, minZ: -441,
    maxX: -348, maxY: 14, maxZ: -425
  },
  playerX: -353,
  travelTime: 4.0
};

// ---- Cachés de bloques y conversiones ----
const blockStateCache = new Map();   // blockName → blockState
const blockNameCache = {
  stone: 'stone', dirt: 'dirt', cobblestone: 'cobblestone',
  oak_planks: 'oak_planks', bricks: 'bricks',
  white_wool: 'white_wool', orange_wool: 'orange_wool', magenta_wool: 'magenta_wool',
  light_blue_wool: 'light_blue_wool', yellow_wool: 'yellow_wool', lime_wool: 'lime_wool',
  pink_wool: 'pink_wool', gray_wool: 'gray_wool', light_gray_wool: 'light_gray_wool',
  cyan_wool: 'cyan_wool', purple_wool: 'purple_wool', blue_wool: 'blue_wool',
  brown_wool: 'brown_wool', green_wool: 'green_wool', red_wool: 'red_wool', black_wool: 'black_wool'
};

const AIR_STATE = { __air: true };

// ---- Captura de la instancia del juego ----
function getGame(force = false) {
  if (globalThis.miniblox?.player && globalThis.miniblox?.world) {
    return globalThis.miniblox;
  }
  if (!force && state.game?.player && state.game?.world) {
    return state.game;
  }
  try {
    const react = document.querySelector('#react');
    if (react) {
      for (const root of Object.values(react)) {
        const game = root?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player && game?.world) return game;
      }
    }
  } catch {}
  return state.game?.player && state.game?.world ? state.game : null;
}

// ---- Utilidades de bloques (con caché) ----
function getBlockState(blockName) {
  if (blockName === 'air') return AIR_STATE;
  const cached = blockStateCache.get(blockName);
  if (cached) return cached;
  const B = window.Blocks || globalThis.Blocks;
  if (!B) return null;
  const resolvedName = blockNameCache[blockName] || blockName;
  let blk = B[resolvedName] || B[blockName];
  if (!blk) {
    try {
      const k = Object.keys(B).find(x => String(x).toLowerCase() === resolvedName.toLowerCase());
      blk = k ? B[k] : null;
    } catch { blk = null; }
  }
  if (!blk) blk = B?.stone || null;
  if (!blk) return null;
  const blockState = blk.defaultState || (typeof blk.getDefaultState === 'function' ? blk.getDefaultState() : null);
  if (blockState) blockStateCache.set(blockName, blockState);
  return blockState;
}

function setBlockRaw(x, y, z, blockState) {
  if (!state.world || !blockState) return;
  try { state.world.setBlockState({ x, y, z }, blockState, 3); } catch {}
}

function clearBlock(x, y, z) { setBlockRaw(x, y, z, AIR_STATE); }

// ---- Análisis de audio y detección de beats ----
async function loadAudioFile(file) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ab = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(ab);
    const raw = audioBuffer.getChannelData(0);
    const sr = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    const winSize = Math.floor(sr * 0.04);
    const hop = Math.floor(winSize / 2);
    const energies = [];
    for (let i = 0; i < raw.length - winSize; i += hop) {
      let e = 0;
      for (let j = 0; j < winSize; j++) e += raw[i + j] * raw[i + j];
      energies.push(e / winSize);
    }

    const maxE = Math.max(...energies, 0.0001);
    for (let i = 0; i < energies.length; i++) energies[i] /= maxE;

    const beats = [];
    const hist = 43;
    const minInt = 0.8;
    let lastT = -1;

    for (let i = hist; i < energies.length - 1; i++) {
      const t = (i * hop) / sr;
      if (t < 0.5 || t > duration - 0.5) continue;
      if (t - lastT < minInt) continue;

      let avg = 0;
      for (let j = i - hist; j < i; j++) avg += energies[j];
      avg /= hist;

      const thresh = avg * 1.2 + 0.03;
      if (energies[i] > thresh && energies[i] > energies[i - 1] && energies[i] >= energies[i + 1]) {
        const strength = Math.min(energies[i], 1);
        const h = Math.abs(Math.sin(t * 12345.6789) * 10000);
        const r = h - Math.floor(h);
        let type;
        if (strength > 0.85) type = 'double_wall';
        else if (strength > 0.7) type = r < 0.5 ? 'jump_high' : 'duck';
        else if (strength > 0.5) type = r < 0.33 ? 'jump' : (r < 0.66 ? 'platform' : 'tunnel');
        else if (r < 0.15) type = 'stair_up';
        else if (r < 0.3) type = 'stair_down';
        else if (r < 0.45) type = 'gap';
        else if (r < 0.6) type = 'platform_tall';
        else if (r < 0.75) type = 'tunnel';
        else type = 'jump';

        beats.push({ time: t, strength, type });
        lastT = t;
      }
    }

    await ctx.close();

    let bpm = 120;
    if (beats.length >= 2) {
      let total = 0, count = 0;
      for (let i = 1; i < beats.length; i++) {
        const interval = beats[i].time - beats[i - 1].time;
        if (interval > 0.3 && interval < 2.0) { total += interval; count++; }
      }
      if (count > 0) {
        bpm = Math.round(60 / (total / count));
        bpm = Math.max(60, Math.min(180, bpm));
      }
    }

    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 2048;
    state.currentSong = audioBuffer;
    state.beats = beats;
    state.beatCount = beats.length;
    state.currentBeat = 0;
    state.detectedBPM = bpm;
    state.beatIntervalSeconds = 60 / bpm;

    dispatchState();
    showNotification(`${beats.length} obstacles generated (BPM: ${bpm})`, 'success');
    return true;
  } catch (e) {
    showNotification('Error loading audio file', 'error');
    return false;
  }
}

// ---- Generación de obstáculos (como grupo con offsets) ----
// Cada obstáculo es un objeto con:
//   x, y, z = posición de origen (esquina)
//   cells = Set de claves "dx,dy,dz" que forman el obstáculo (relativas a x,y,z)
//   cellCount, type, prevCellX
// Esto permite mover el grupo entero con un solo seguimiento de X.
function generateObstacle(beat) {
  const id = state.nextObstacleId++;
  const spawnX = config.spawnArea.minX;
  const endX = config.spawnArea.maxX;
  const minY = config.spawnArea.minY;
  const minZ = config.spawnArea.minZ;
  const maxZ = config.spawnArea.maxZ;
  const centerZ = Math.floor(minZ + (maxZ - minZ) / 2);
  const zStart = Math.floor(minZ);
  const zEnd = Math.floor(maxZ);

  let blockType, pattern;
  switch (beat.type) {
    case 'jump': blockType = 'cyan_wool'; pattern = 'jump_barrier'; break;
    case 'jump_high': blockType = 'cyan_wool'; pattern = 'jump_high_wall'; break;
    case 'duck': blockType = 'yellow_wool'; pattern = 'duck_with_jump_base'; break;
    case 'double_wall': blockType = 'red_wool'; pattern = 'double_wall'; break;
    case 'platform': blockType = 'lime_wool'; pattern = 'platform_wide'; break;
    case 'platform_tall': blockType = 'lime_wool'; pattern = 'platform_with_base'; break;
    case 'stair_up': blockType = 'orange_wool'; pattern = 'jump_barrier'; break;
    case 'stair_down': blockType = 'purple_wool'; pattern = 'platform_wide'; break;
    case 'gap': case 'tunnel': blockType = 'air'; pattern = 'gap'; break;
    default: blockType = 'stone'; pattern = 'single';
  }

  const cells = [];

  // Generar offsets relativos (dx=0 siempre para obstáculos de pared)
  switch (pattern) {
    case 'duck_with_jump_base': {
      const gapOnLeft = Math.random() < 0.5;
      const gapStart = gapOnLeft ? zStart : zEnd - 2;
      const gapEnd = gapOnLeft ? zStart + 2 : zEnd;
      for (let dy = 0; dy < 2; dy++) {
        for (let z = zStart; z <= zEnd; z++) {
          if (z >= gapStart && z <= gapEnd) continue;
          cells.push([0, dy, z - zStart]);
        }
      }
      break;
    }
    case 'jump_barrier':
      for (let z = zStart; z <= zEnd; z++) cells.push([0, 0, z - zStart]);
      break;
    case 'jump_high_wall': {
      const totalWidth = zEnd - zStart;
      for (let dy = 0; dy < 2; dy++) {
        for (let z = zStart; z <= zEnd; z++) {
          const distFromCenter = Math.abs(z - centerZ);
          if (dy === 1 && distFromCenter > totalWidth / 4) continue;
          cells.push([0, dy, z - zStart]);
        }
      }
      break;
    }
    case 'double_wall': {
      const zRange = zEnd - zStart;
      const gapSize = Math.floor(zRange / 3);
      const gapStart = zStart + Math.floor(gapSize);
      const gapEnd = gapStart + gapSize;
      for (let dy = 0; dy < 3; dy++) {
        for (let z = zStart; z <= zEnd; z++) {
          if (z >= gapStart && z <= gapEnd) continue;
          cells.push([0, dy, z - zStart]);
        }
      }
      break;
    }
    case 'platform_wide':
      for (let dx = 0; dx < 2; dx++)
        for (let z = zStart; z <= zEnd; z++)
          cells.push([dx, 0, z - zStart]);
      break;
    case 'platform_with_base': {
      const platformIsLeft = Math.random() < 0.5;
      const pzc = Math.floor(platformIsLeft ? (zStart + centerZ) / 2 : (centerZ + zEnd) / 2);
      const baseDz = pzc - zStart;
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          cells.push([dx, 0, baseDz + dz, 'green_wool']);
      for (let dx = 0; dx < 2; dx++)
        for (let dz = 0; dz < 2; dz++)
          cells.push([dx, 0, baseDz + dz, blockType]);
      break;
    }
    case 'gap': break; // sin celdas
    default: cells.push([0, 0, Math.floor(centerZ - zStart)]);
  }

  if (!cells.length) return; // gap/tunnel no generan obstáculo

  const obstacle = {
    id,
    x: spawnX,           // posición X actual (entera)
    y: minY,
    z: zStart,
    targetX: endX,
    cells,                // [[dx,dy,dz,typeOverride?], ...]
    type: blockType,
    velocity: state.blockSpeed,
    finished: false,
    collided: false,
    prevCellX: spawnX,
    floatX: spawnX        // posición X de coma flotante para suavidad
  };

  // Pre-cachear el blockState para este tipo
  getBlockState(blockType);
  for (const cell of cells) {
    if (cell[3]) getBlockState(cell[3]);
  }

  state.obstacles.push(obstacle);
  placeObstacle(obstacle);  // render inicial
}

// Coloca todas las celdas del obstáculo en su posición actual
function placeObstacle(obs) {
  const baseState = getBlockState(obs.type);
  if (!baseState) return;
  for (const [dx, dy, dz, typeOverride] of obs.cells) {
    const st = typeOverride ? getBlockState(typeOverride) : baseState;
    if (st) setBlockRaw(obs.x + dx, obs.y + dy, obs.z + dz, st);
  }
  obs.prevCellX = obs.x;
}

// Limpia todas las celdas del obstáculo en su posición previa
function clearObstacleAt(obs, cellX) {
  for (const [dx, dy, dz] of obs.cells) {
    clearBlock(cellX + dx, obs.y + dy, obs.z + dz);
  }
}

// ---- Game loop optimizado ----
function gameLoop(timestamp) {
  if (!state.isPlaying) return;
  const now = timestamp || performance.now();
  const deltaTime = state.lastFrameTime ? (now - state.lastFrameTime) / 1000 : 0.016;
  state.lastFrameTime = now;
  updateRhythmGame(deltaTime, now);
  state.gameLoopId = requestAnimationFrame(gameLoop);
}

function updateRhythmGame(deltaTime, now) {
  if (!state.obstacles.length) return;

  let hasFinished = false;

  for (const obs of state.obstacles) {
    if (obs.finished) { hasFinished = true; continue; }

    obs.floatX += obs.velocity * deltaTime;
    if (isNaN(obs.floatX)) { obs.finished = true; hasFinished = true; continue; }

    const newCellX = Math.floor(obs.floatX);

    if (obs.floatX >= obs.targetX) {
      // Llegó al final
      obs.finished = true;
      hasFinished = true;
      clearObstacleAt(obs, obs.prevCellX);
      const passed = checkIfPlayerPassed(obs);
      if (passed) { state.score += 10; state.combo++; if (state.combo > state.maxCombo) state.maxCombo = state.combo; showHitMessage('good'); }
      else if (!obs.collided) showHitMessage('miss');
      continue;
    }

    // Solo actualizar bloques si la celda X cambió
    if (newCellX !== obs.prevCellX) {
      clearObstacleAt(obs, obs.prevCellX);
      obs.x = newCellX;
      placeObstacle(obs);
    }
  }

  // Limpiar obstáculos terminados sin crear array nuevo cada frame
  if (hasFinished) {
    state.obstacles = state.obstacles.filter(o => !o.finished);
  }

  // Throttle de collision check a ~10fps (cada 100ms)
  if (now - state.lastCollisionCheck > 100) {
    state.lastCollisionCheck = now;
    checkPlayerCollisions();
  }

  // Throttle de dispatchState a ~5fps (cada 200ms)
  if (now - state.lastStateSync > 200) {
    state.lastStateSync = now;
    dispatchState();
  }
}

function checkIfPlayerPassed(obs) {
  const p = state.game?.player;
  if (!p) return true;
  const pX = Math.floor(p.position?.x ?? 0);
  const pY = Math.floor(p.position?.y ?? 0);
  const pZ = Math.floor(p.position?.z ?? 0);
  const oY = obs.y;
  const oZ = obs.z;
  const oX = obs.x;

  if (obs.type === 'cyan_wool') return (pY - oY) >= 2 || Math.abs(pZ - oZ) > 5 || pX > oX;
  if (obs.type === 'yellow_wool') return (pY - oY) <= 0 || Math.abs(pZ - oZ) > 5 || pX > oX;
  return true;
}

function checkPlayerCollisions() {
  const p = state.game?.player;
  if (!p) return;
  const pX = Math.floor(p.position?.x ?? 0);
  const pY = Math.floor(p.position?.y ?? 0);
  const pZ = Math.floor(p.position?.z ?? 0);

  for (const obs of state.obstacles) {
    if (obs.finished || obs.collided) continue;
    if (obs.type !== 'cyan_wool' && obs.type !== 'yellow_wool') continue;
    const oX = obs.x;
    const oY = obs.y;
    const oZ = obs.z;
    if (Math.abs(pX - oX) <= 1 && Math.abs(pY - oY) <= 1 && Math.abs(pZ - oZ) <= 8) {
      applyDamage(2);
      obs.collided = true;
      state.combo = 0;
      showHitMessage('miss');
    }
  }
}

function applyDamage(damage) {
  try {
    const p = state.game?.player;
    if (!p) return;
    if (typeof p.setHealth === 'function') {
      const hp = p.getHealth ? p.getHealth() : 20;
      p.setHealth(hp - damage);
    } else if (p.health !== undefined) {
      p.health = Math.max(0, p.health - damage);
    } else if (typeof p.hurt === 'function') {
      p.hurt(damage);
    }
    state.health = Math.max(0, state.health - 1);
  } catch {}
}

// ---- Control del juego ----
function startGame() {
  if (!state.currentSong || !state.beats.length) { showNotification('Load a song first', 'error'); return; }
  if (state.isPlaying) return;

  state.score = 0; state.combo = 0; state.maxCombo = 0; state.health = 5;
  state.currentBeat = 0; state.obstacles = []; state.nextObstacleId = 0;

  state.audioSource = state.audioContext.createBufferSource();
  state.audioSource.buffer = state.currentSong;
  state.audioSource.connect(state.audioContext.destination);
  state.audioSource.start(0);
  state.isPlaying = true;

  const distance = Math.abs(config.playerX - config.spawnArea.minX);
  state.blockSpeed = distance / config.travelTime;
  state.lookAheadTime = config.travelTime;
  state.audioStartTime = Date.now();
  state.lastFrameTime = null;
  state.lastStateSync = 0;
  state.lastCollisionCheck = 0;

  state.audioSource.onended = () => { stopGame(); showNotification('Song completed!', 'success'); };

  state.beatInterval = setInterval(() => {
    const audioTime = (Date.now() - state.audioStartTime) / 1000;
    const targetTime = audioTime + state.lookAheadTime;
    while (state.currentBeat < state.beats.length) {
      const beat = state.beats[state.currentBeat];
      if (beat.time <= targetTime && beat.time > audioTime - 0.1) {
        generateObstacle(beat);
        state.currentBeat++;
      } else if (beat.time > targetTime) break;
      else state.currentBeat++;
    }
    if (state.currentBeat >= state.beats.length) {
      clearInterval(state.beatInterval);
      state.beatInterval = null;
    }
  }, 100);

  state.gameLoopId = requestAnimationFrame(gameLoop);
  showNotification(`Game started! ${state.beats.length} obstacles`, 'success');
  dispatchState();
}

function stopGame() {
  if (state.audioSource) { try { state.audioSource.stop(); } catch {} state.audioSource = null; }
  if (state.beatInterval) { clearInterval(state.beatInterval); state.beatInterval = null; }
  if (state.gameLoopId) { cancelAnimationFrame(state.gameLoopId); state.gameLoopId = null; }
  removeAllObstacles();
  state.isPlaying = false;
  state.currentBeat = 0;
  state.lastFrameTime = null;
  dispatchState();
}

function removeAllObstacles() {
  for (const obs of state.obstacles) {
    clearObstacleAt(obs, obs.prevCellX);
  }
  state.obstacles = [];
}

// ---- Comunicación de estado hacia content.js ----
function dispatchState() {
  document.dispatchEvent(new CustomEvent(EVENT_STATE, {
    detail: JSON.stringify({
      isPlaying: state.isPlaying,
      score: state.score,
      combo: state.combo,
      maxCombo: state.maxCombo,
      health: state.health,
      currentBeat: state.currentBeat,
      beatCount: state.beatCount,
      detectedBPM: state.detectedBPM,
      hasSong: !!state.currentSong
    })
  }));
}

// ---- UI Overlay (creada cuando el modulo está activo) ----
function createUI() {
  removeUI();
  const container = document.createElement('div');
  container.id = 'mf-rhythm-ui';
  container.innerHTML = `
    <div style="font-weight:bold;margin-bottom:8px;color:#7c5cff;">🎵 Rhythm Parkour</div>
    <div style="margin-bottom:8px;">
      <input type="file" id="mf-rhythm-file" accept="audio/*" style="display:none;">
      <button id="mf-rhythm-load" class="mf-rhythm-btn">Load Song</button>
    </div>
    <div style="display:flex;gap:5px;margin-bottom:8px;">
      <button id="mf-rhythm-start" class="mf-rhythm-btn" style="flex:1;background:#4ade80;">▶ Start</button>
      <button id="mf-rhythm-stop" class="mf-rhythm-btn" style="flex:1;background:#ef4444;">⏹ Stop</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;">
      <div>Score: <span id="mf-rhythm-score" style="font-weight:bold;">0</span></div>
      <div>Combo: <span id="mf-rhythm-combo" style="font-weight:bold;">0</span></div>
      <div>Health: <span id="mf-rhythm-health" style="font-weight:bold;">5</span></div>
      <div>Beat: <span id="mf-rhythm-beat" style="font-weight:bold;">0/0</span></div>
    </div>
    <div id="mf-rhythm-status" style="margin-top:6px;font-size:10px;color:#6b7280;">No song loaded</div>
  `;
  const style = document.createElement('style');
  style.id = 'mf-rhythm-style';
  style.textContent = `
    #mf-rhythm-ui{position:fixed;top:20px;right:20px;background:rgba(15,15,25,0.95);color:#fff;padding:12px;border-radius:8px;border:1px solid #7c5cff;z-index:99999;font-family:sans-serif;min-width:220px;font-size:13px;}
    .mf-rhythm-btn{padding:6px 10px;border:none;border-radius:4px;cursor:pointer;color:#fff;background:#3b82f6;font-size:12px;}
    .mf-rhythm-btn:hover{opacity:0.85;}
  `;
  document.head.appendChild(style);
  document.body.appendChild(container);
  state.ui = container;

  container.querySelector('#mf-rhythm-load').addEventListener('click', () => {
    container.querySelector('#mf-rhythm-file').click();
  });
  container.querySelector('#mf-rhythm-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadAudioFile(file);
  });
  container.querySelector('#mf-rhythm-start').addEventListener('click', startGame);
  container.querySelector('#mf-rhythm-stop').addEventListener('click', stopGame);

  document.addEventListener(EVENT_STATE, updateUIFromState, true);
}

function removeUI() {
  document.getElementById('mf-rhythm-ui')?.remove();
  document.getElementById('mf-rhythm-style')?.remove();
  document.removeEventListener(EVENT_STATE, updateUIFromState, true);
  state.ui = null;
}

function updateUIFromState(event) {
  if (!state.ui) return;
  try {
    const s = JSON.parse(event.detail);
    const scoreEl = state.ui.querySelector('#mf-rhythm-score');
    const comboEl = state.ui.querySelector('#mf-rhythm-combo');
    const healthEl = state.ui.querySelector('#mf-rhythm-health');
    const beatEl = state.ui.querySelector('#mf-rhythm-beat');
    const statusEl = state.ui.querySelector('#mf-rhythm-status');
    if (scoreEl) scoreEl.textContent = s.score;
    if (comboEl) comboEl.textContent = s.combo;
    if (healthEl) healthEl.textContent = s.health;
    if (beatEl) beatEl.textContent = `${s.currentBeat}/${s.beatCount}`;
    if (statusEl) statusEl.textContent = s.hasSong ? `BPM: ${s.detectedBPM} | ${s.isPlaying ? 'Playing...' : 'Ready'}` : 'No song loaded';
  } catch {}
}

function showNotification(message, type) {
  const n = document.createElement('div');
  n.textContent = message;
  n.style.cssText = `position:fixed;top:60px;right:20px;background:${type === 'success' ? '#4ade80' : type === 'error' ? '#ef4444' : '#3b82f6'};color:#fff;padding:8px 14px;border-radius:4px;z-index:100000;font-family:sans-serif;font-size:13px;`;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 3000);
}

function showHitMessage(type) {
  const msg = type === 'miss' ? '✗ miss' : '✓ good';
  const color = type === 'miss' ? '#ef4444' : '#4ade80';
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:${color};font-size:32px;font-weight:bold;z-index:100001;font-family:sans-serif;text-shadow:2px 2px 4px rgba(0,0,0,0.8);`;
  document.body.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity 0.3s'; el.style.opacity = '0'; }, 600);
  setTimeout(() => el.remove(), 900);
}

// ---- Enable / Disable ----
function setEnabled(value) {
  const enabled = !!value;
  if (state.enabled === enabled) return;
  state.enabled = enabled;

  if (enabled) {
    state.game = getGame(true);
    state.world = state.game?.world || null;
    createUI();
    showNotification('Rhythm Parkour enabled! Load a song to start.', 'info');
  } else {
    stopGame();
    removeUI();
    state.game = null;
    state.world = null;
  }
}

// ---- Listeners de eventos desde content.js ----
document.addEventListener(EVENT_CONFIG, event => {
  let cfg = event.detail;
  if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { return; } }
  if (cfg && 'enabled' in cfg) setEnabled(cfg.enabled);
}, true);

document.addEventListener(EVENT_COMMAND, event => {
  let cmd = event.detail;
  if (typeof cmd === 'string') { try { cmd = JSON.parse(cmd); } catch { return; } }
  if (!cmd || !state.enabled) return;
  switch (cmd.action) {
    case 'start': startGame(); break;
    case 'stop': stopGame(); break;
  }
}, true);

window.addEventListener('beforeunload', () => { stopGame(); removeUI(); }, { once: true });

globalThis.MiniFeatherRhythmParkour = {
  setEnabled,
  loadAudioFile,
  startGame,
  stopGame,
  getStatus() {
    return { isPlaying: state.isPlaying, score: state.score, combo: state.combo, health: state.health, beatCount: state.beatCount };
  },
  get enabled() { return state.enabled; }
};
})();
