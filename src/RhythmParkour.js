// RhythmParkour - Transforma Miniblox en un juego de ritmo/parkour
// Port del mod original MinibloxRhythmParkour adaptado a MiniFeather Client.
// Los obstáculos se generan al ritmo de la música cargada.
// Incluye: comandos de chat (/rp), P2P multijugador (BroadcastChannel + WebRTC)
// y mensajes good/miss sobre la hotbar.
(function () {
'use strict';

const EVENT_CONFIG = 'minifeather:rhythmparkour-config';
const EVENT_COMMAND = 'minifeather:rhythmparkour-command';
const EVENT_STATE = 'minifeather:rhythmparkour-state';
const EVENT_LANGUAGE = 'minifeather:language-config';
let mfStrings = {};
function tr(key, fallback = key) { return mfStrings[key] || fallback; }
function onLanguageConfig(event) {
  try {
    const data = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    if (data?.strings && typeof data.strings === 'object') mfStrings = data.strings;
    if (state?.enabled && state.ui) createUI();
  } catch (_) {}
}
document.addEventListener(EVENT_LANGUAGE, onLanguageConfig);


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
  lastCollisionCheck: 0,
  chatHooked: false
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

// ---- BlockPos compatible con el juego (port del original) ----
// El mundo espera un BlockPos con getters; un objeto plano rompe
// setBlockState silenciosamente.
class MFBlockPos {
  constructor(x, y, z) {
    this.x = Math.floor(x);
    this.y = Math.floor(y);
    this.z = Math.floor(z);
  }
  getX() { return this.x; }
  getY() { return this.y; }
  getZ() { return this.z; }
}

// ---- Captura de la instancia del juego ----
// Prioridad: globales del juego (como el mod original) y luego React fiber.
function getGame(force = false) {
  if (globalThis.miniblox?.player && globalThis.miniblox?.world) {
    return globalThis.miniblox;
  }
  const w = globalThis.game || globalThis.Game || globalThis.minibloxGame;
  if (w?.player && w?.world) return w;
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
  // 'air' debe resolverse al bloque real del juego; nunca caer a stone
  if (!blk && blockName === 'air') return null;
  if (!blk) blk = B?.stone || null;
  if (!blk) return null;
  const blockState = blk.defaultState || (typeof blk.getDefaultState === 'function' ? blk.getDefaultState() : null);
  if (blockState) blockStateCache.set(blockName, blockState);
  return blockState;
}

function setBlockRaw(x, y, z, blockState) {
  if (!blockState) return;
  // Resolver el world fresco (el juego puede recrearlo al cambiar de mundo)
  let w = state.world;
  if (!w || typeof w.setBlockState !== 'function') {
    const g = getGame();
    w = g?.world || null;
    if (w) state.world = w;
  }
  if (!w) return;
  try {
    w.setBlockState(new MFBlockPos(x, y, z), blockState, 3);
  } catch (e) {
    // Avisar una sola vez: un fallo silencioso aquí hace que los bloques
    // nunca se borren y la pista se llene de basura
    if (!setBlockRaw.__warned) {
      setBlockRaw.__warned = true;
      console.warn('[MiniFeather RhythmParkour] setBlockState falló:', e);
    }
  }
}

function clearBlock(x, y, z) { setBlockRaw(x, y, z, getBlockState('air')); }

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
    showNotification(`🎵 ${beats.length} obstáculos generados (BPM: ${bpm})`, 'success');
    return true;
  } catch (e) {
    showNotification('❌ Error al cargar el audio', 'error');
    return false;
  }
}

// ---- Generación de obstáculos (como grupo con offsets) ----
// Cada obstáculo es un objeto con:
//   x, y, z = posición de origen (esquina)
//   cells = [[dx,dy,dz,typeOverride?], ...] relativas a x,y,z
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

  // Generar offsets relativos (dx=0 para obstáculos de pared)
  switch (pattern) {
    case 'duck_with_jump_base': {
      // Muro amarillo de 2 de alto con hueco 2x2 en izquierda o derecha
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
      // Pared tipo arco: 2 bloques en el centro, 1 en los lados
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
      // Pared doble de 3 de alto con hueco central de 1/3
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
      // Base 3x3 verde + plataforma encima, en izquierda o derecha
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
    x: spawnX,
    y: minY,
    z: zStart,
    targetX: endX,
    cells,
    type: blockType,
    velocity: state.blockSpeed,
    finished: false,
    collided: false,
    prevCellX: spawnX,
    floatX: spawnX
  };

  // Pre-cachear el blockState para este tipo
  getBlockState(blockType);
  for (const cell of cells) {
    if (cell[3]) getBlockState(cell[3]);
  }

  state.obstacles.push(obstacle);
  placeObstacle(obstacle);
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
      obs.finished = true;
      hasFinished = true;
      clearObstacleAt(obs, obs.prevCellX);
      const passed = checkIfPlayerPassed(obs);
      if (passed) { state.score += 10; state.combo++; if (state.combo > state.maxCombo) state.maxCombo = state.combo; showHitMessage('good'); }
      else if (!obs.collided) showHitMessage('miss');
      continue;
    }

    if (newCellX !== obs.prevCellX) {
      clearObstacleAt(obs, obs.prevCellX);
      obs.x = newCellX;
      placeObstacle(obs);
    }
  }

  if (hasFinished) {
    state.obstacles = state.obstacles.filter(o => !o.finished);
  }

  // Throttle de collision check a ~10fps
  if (now - state.lastCollisionCheck > 100) {
    state.lastCollisionCheck = now;
    checkPlayerCollisions();
  }

  // Throttle de dispatchState a ~5fps
  if (now - state.lastStateSync > 200) {
    state.lastStateSync = now;
    dispatchState();
  }

  // Sincronizar P2P si hay peers conectados
  if (p2pManager?.connections?.length > 0) p2pManager.syncGameState();
}

// ¿Hay alguna celda sólida del obstáculo en (px, py) con |dz| <= 1?
// (como el original, que chequeaba cada bloque individualmente — el
// hueco del muro duck debe salvar al jugador que está dentro de él)
function obstacleHasCellNear(obs, px, py, pz, yTol = 1, zTol = 1) {
  for (const [dx, dy, dz] of obs.cells) {
    const cx = obs.x + dx;
    if (Math.abs(px - cx) > 1) continue;
    const cy = obs.y + dy;
    if (Math.abs(py - cy) > yTol) continue;
    const cz = obs.z + dz;
    if (Math.abs(pz - cz) <= zTol) return true;
  }
  return false;
}

// Verificar si el jugador pasó correctamente el obstáculo (port del original)
function checkIfPlayerPassed(obs) {
  const p = state.game?.player;
  if (!p) return true;
  const pX = Math.floor(p.position?.x ?? 0);
  const pY = Math.floor(p.position?.y ?? 0);
  const pZ = Math.floor(p.position?.z ?? 0);
  const oY = obs.y;
  const oZ = obs.z;
  const oX = obs.x;

  // Saltar (cyan): estar 2+ bloques más alto, esquivar en Z o ya haber pasado
  if (obs.type === 'cyan_wool') return (pY - oY) >= 2 || Math.abs(pZ - oZ) > 5 || pX > oX;
  // Agacharse/pasar por hueco (yellow / slab)
  if (obs.type === 'yellow_wool' || obs.type === 'oak_slab')
    return (pY - oY) <= 0 || Math.abs(pZ - oZ) > 5 || pX > oX;
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
    if (obs.type !== 'cyan_wool' && obs.type !== 'yellow_wool' && obs.type !== 'oak_slab') continue;
    if (obstacleHasCellNear(obs, pX, pY, pZ)) {
      applyDamage(2);
      obs.collided = true;
      state.combo = 0;
      showNotification('💥 ¡Ouch! -1 corazón', 'error');
      showHitMessage('miss');
      // Notificar a otros jugadores en modo cooperativo
      if (p2pManager?.gameMode === 'cooperative') p2pManager.notifyHit(2);
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
    } else if (typeof p.damage === 'function') {
      p.damage(damage);   // fallback extra del original
    }
    state.health = Math.max(0, state.health - 1);
  } catch {}
}

// ---- Control del juego ----
function startGame() {
  if (!state.currentSong || !state.beats.length) { showNotification('❌ Primero carga una canción (/rp load)', 'error'); return false; }
  if (state.isPlaying) { showNotification('⚠ El juego ya está en progreso', 'info'); return false; }

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

  state.audioSource.onended = () => { stopGame(); showNotification('🎉 ¡Canción completada!', 'success'); };

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
  p2pManager?.startGame?.();
  showNotification(`🎮 ¡Juego iniciado! ${state.beats.length} obstáculos`, 'success');
  dispatchState();
  return true;
}

function stopGame() {
  if (state.audioSource) { try { state.audioSource.stop(); } catch {} state.audioSource = null; }
  if (state.beatInterval) { clearInterval(state.beatInterval); state.beatInterval = null; }
  if (state.gameLoopId) { cancelAnimationFrame(state.gameLoopId); state.gameLoopId = null; }
  removeAllObstacles();
  state.isPlaying = false;
  state.currentBeat = 0;
  state.lastFrameTime = null;
  if (p2pManager?.gameState?.isPlaying) p2pManager.endGame();
  dispatchState();
}

function removeAllObstacles() {
  for (const obs of state.obstacles) {
    clearObstacleAt(obs, obs.prevCellX);
  }
  state.obstacles = [];
}

// ---- Comandos de chat (port del original) ----
// /rp start | /rp stop | /rp load | /rp status | /rp debug | /pr load
function statusText() {
  return `Jugando: ${state.isPlaying} | Score: ${state.score} | Combo: ${state.combo} | Vidas: ${state.health} | Beat: ${state.currentBeat}/${state.beatCount} | BPM: ${state.detectedBPM}`;
}

function debugInfo() {
  const g = state.game;
  console.log('[MiniFeather RhythmParkour] === DEBUG ===');
  console.log('[MiniFeather RhythmParkour] Estado:', statusText());
  console.log('[MiniFeather RhythmParkour] game:', !!g, '| world:', !!g?.world, '| player:', !!g?.player);
  console.log('[MiniFeather RhythmParkour] world tiene setBlockState:', typeof g?.world?.setBlockState);
  console.log('[MiniFeather RhythmParkour] Bloques (window.Blocks):', !!(window.Blocks || globalThis.Blocks));
  console.log('[MiniFeather RhythmParkour] Canción:', !!state.currentSong, '| Obstáculos activos:', state.obstacles.length);
  console.log('[MiniFeather RhythmParkour] P2P:', p2pManager ? { host: p2pManager.isHost, room: p2pManager.roomId, peers: p2pManager.connections.length } : null);
  showNotification('Debug completado — mira la consola (F12)', 'info');
}

function triggerSongPicker() {
  // Usar el input de la UI si existe; si no, crear uno temporal (port del original)
  const existing = document.getElementById('mf-rhythm-file');
  if (existing) { existing.click(); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) loadAudioFile(file);
    input.remove();
  };
  input.click();
}

function executeCommand(raw) {
  const cmd = String(raw || '').trim();
  if (cmd === '/rp start' || cmd === '/rp play') { startGame(); return true; }
  if (cmd === '/rp stop') { stopGame(); showNotification(tr('rhythmGameStopped', '⏹ Game stopped'), 'info'); return true; }
  if (cmd === '/rp load' || cmd.startsWith('/pr load')) { triggerSongPicker(); return true; }
  if (cmd === '/rp status') { showNotification(statusText(), 'info'); return true; }
  if (cmd === '/rp debug') { debugInfo(); return true; }
  if (cmd === '/rp help') {
    showNotification('Comandos: /rp load | /rp start | /rp stop | /rp status | /rp debug', 'info');
    return true;
  }
  return false;
}

// Intercepción del chat: listener delegado en capture (más robusto que
// asignar onkeydown a un input concreto que puede re-crearse)
function installChatCommands() {
  if (state.chatHooked) return;
  state.chatHooked = true;
  document.addEventListener('keydown', (e) => {
    if (!state.enabled || e.key !== 'Enter') return;
    const el = e.target;
    if (!el || !el.tagName) return;
    const isTextInput = (el.tagName === 'INPUT' && (el.type === 'text' || !el.type)) ||
                        el.tagName === 'TEXTAREA' || el.isContentEditable;
    if (!isTextInput) return;
    const msg = String(el.value ?? el.textContent ?? '');
    if (!msg.startsWith('/rp') && !msg.startsWith('/pr')) return;
    if (executeCommand(msg)) {
      e.preventDefault();
      e.stopPropagation();
      el.value = '';
      if (el.isContentEditable) el.textContent = '';
    }
  }, true);
}

// ==================== SISTEMA P2P MULTIJUGADOR (port del original) ====================
// Descubrimiento de salas via BroadcastChannel + WebRTC data channels.
class P2PManager {
  constructor() {
    this.connections = [];
    this.isHost = false;
    this.roomId = null;
    this.gameMode = 'competitive';
    this.playerId = Math.random().toString(36).substring(2, 15);
    this.playerName = 'Jugador ' + Math.floor(Math.random() * 1000);
    this.remotePlayers = new Map();
    this.gameState = { isPlaying: false, song: null, startTime: null };
    this.signalingChannel = null;
    this.discoveryChannel = null;
    this.availableRooms = new Map();
    this.isSearching = false;
    this.autoMatchmaking = false;
    this.maxPlayers = 4;
    this.searchInterval = null;
    this.heartbeatInterval = null;
    this.cleanupInterval = null;
    this.syncInterval = null;
  }

  hasBroadcast() { return typeof BroadcastChannel === 'function'; }

  // Descubrimiento dinámico de salas
  startDynamicDiscovery() {
    if (!this.hasBroadcast() || this.discoveryChannel) return;
    this.discoveryChannel = new BroadcastChannel('rhythm_p2p_discovery');

    this.discoveryChannel.onmessage = (event) => {
      const data = event.data;
      if (data.senderId === this.playerId) return;
      switch (data.type) {
        case 'room-announce':
          this.availableRooms.set(data.roomId, {
            roomId: data.roomId,
            hostName: data.hostName,
            mode: data.mode,
            players: data.players,
            maxPlayers: data.maxPlayers,
            timestamp: Date.now()
          });
          updateP2PRoomUI();
          break;
        case 'room-removed':
          this.availableRooms.delete(data.roomId);
          updateP2PRoomUI();
          break;
        case 'searching-for-room':
          if (this.isHost && this.roomId) this.announceRoom();
          break;
      }
    };

    // Limpiar salas sin heartbeat cada 5s
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [roomId, room] of this.availableRooms) {
        if (now - room.timestamp > 10000) this.availableRooms.delete(roomId);
      }
      updateP2PRoomUI();
    }, 5000);
  }

  announceRoom() {
    if (!this.discoveryChannel || !this.isHost) return;
    this.discoveryChannel.postMessage({
      type: 'room-announce',
      senderId: this.playerId,
      roomId: this.roomId,
      hostName: this.playerName,
      mode: this.gameMode,
      players: this.connections.length + 1,
      maxPlayers: this.maxPlayers,
      timestamp: Date.now()
    });
  }

  searchRooms() {
    this.isSearching = true;
    this.availableRooms.clear();
    if (this.discoveryChannel) {
      this.discoveryChannel.postMessage({
        type: 'searching-for-room',
        senderId: this.playerId
      });
    }
    showNotification('🔍 Buscando salas...', 'info');
    setTimeout(() => {
      this.isSearching = false;
      if (this.availableRooms.size === 0) {
        showNotification('❌ No se encontraron salas. ¡Crea una!', 'info');
      } else {
        showNotification(`✅ ${this.availableRooms.size} sala(s) encontrada(s)`, 'success');
      }
      updateP2PRoomUI();
    }, 2000);
  }

  // Matchmaking automático
  autoMatchmake(mode = 'competitive') {
    this.autoMatchmaking = true;
    showNotification('🎮 Buscando partida automáticamente...', 'info');
    this.searchRooms();
    setTimeout(() => {
      if (this.availableRooms.size > 0) {
        const rooms = Array.from(this.availableRooms.values());
        const bestRoom = rooms.sort((a, b) => b.players - a.players)[0];
        if (bestRoom && bestRoom.players < bestRoom.maxPlayers) {
          this.joinRoom(bestRoom.roomId);
          showNotification(`🎮 ¡Unido a sala de ${bestRoom.hostName}!`, 'success');
        } else {
          this.createRoom(mode);
          showNotification('🏠 Sala creada (no había espacio)', 'info');
        }
      } else {
        this.createRoom(mode);
        showNotification('🏠 Sala creada (no se encontraron salas)', 'info');
      }
      this.autoMatchmaking = false;
    }, 3000);
  }

  async createRoom(mode = 'competitive', maxPlayers = 4) {
    this.isHost = true;
    this.gameMode = mode;
    this.maxPlayers = maxPlayers;
    this.roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    showNotification(`🏠 Sala creada: ${this.roomId} (${mode})`, 'success');

    this.startDynamicDiscovery();
    this.startSignalingListener();

    this.heartbeatInterval = setInterval(() => this.announceRoom(), 3000);
    updateP2PRoomUI();
    return this.roomId;
  }

  async joinRoom(roomId) {
    this.isHost = false;
    this.roomId = String(roomId).toUpperCase();
    showNotification(`🔗 Conectando a sala ${this.roomId}...`, 'info');
    this.startDynamicDiscovery();
    this.startSignalingListener();
    await this.sendSignal('join', {
      playerId: this.playerId,
      playerName: this.playerName
    });
    updateP2PRoomUI();
  }

  async joinDynamicRoom(roomId) {
    const room = this.availableRooms.get(roomId);
    if (!room) { showNotification('❌ Sala no encontrada', 'error'); return; }
    if (room.players >= room.maxPlayers) { showNotification('❌ Sala llena', 'error'); return; }
    await this.joinRoom(roomId);
    this.gameMode = room.mode;
  }

  // Señalización via BroadcastChannel
  startSignalingListener() {
    if (!this.hasBroadcast()) {
      showNotification('❌ BroadcastChannel no disponible en este navegador', 'error');
      return;
    }
    this.signalingChannel?.close();
    this.signalingChannel = new BroadcastChannel('rhythm_p2p_' + this.roomId);

    this.signalingChannel.onmessage = async (event) => {
      const data = event.data;
      if (data.senderId === this.playerId) return;
      try {
        switch (data.type) {
          case 'join': if (this.isHost) await this.handlePlayerJoin(data); break;
          case 'offer': await this.handleOffer(data); break;
          case 'answer': await this.handleAnswer(data); break;
          case 'ice-candidate': await this.handleIceCandidate(data); break;
        }
      } catch (err) {
        console.warn('[MiniFeather RhythmParkour P2P] Error en señal:', err);
      }
    };
  }

  async sendSignal(type, data) {
    if (!this.signalingChannel) return;
    this.signalingChannel.postMessage({
      type,
      senderId: this.playerId,
      roomId: this.roomId,
      ...data
    });
  }

  async handlePlayerJoin(data) {
    showNotification(`👋 ${data.playerName} se unió!`, 'success');
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    const dataChannel = connection.createDataChannel('gameData', { ordered: true });
    this.setupDataChannel(dataChannel, data.playerId);
    this.connections.push({ peerId: data.playerId, connection, dataChannel });

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal('ice-candidate', { targetId: data.playerId, candidate: event.candidate });
      }
    };

    await this.sendSignal('offer', {
      targetId: data.playerId,
      offer: connection.localDescription,
      gameMode: this.gameMode,
      hostName: this.playerName
    });
  }

  async handleOffer(data) {
    if (data.targetId !== this.playerId) return;
    this.gameMode = data.gameMode;
    showNotification(`✅ Conectado a ${data.hostName}! Modo: ${this.gameMode}`, 'success');

    const connection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    this.connections.push({ peerId: data.senderId, connection, dataChannel: null });

    connection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, data.senderId);
      const conn = this.connections.find(c => c.peerId === data.senderId);
      if (conn) conn.dataChannel = event.channel;
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal('ice-candidate', { targetId: data.senderId, candidate: event.candidate });
      }
    };

    await connection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    await this.sendSignal('answer', { targetId: data.senderId, answer: connection.localDescription });
  }

  async handleAnswer(data) {
    if (!this.isHost || data.targetId !== this.playerId) return;
    const conn = this.connections.find(c => c.peerId === data.senderId);
    if (conn) await conn.connection.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  async handleIceCandidate(data) {
    if (data.targetId !== this.playerId) return;
    const conn = this.connections.find(c => c.peerId === data.senderId);
    if (conn) await conn.connection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }

  setupDataChannel(channel, peerId) {
    channel.onopen = () => {
      showNotification('🎮 Conexión P2P establecida!', 'success');
      updateP2PRoomUI();
    };
    channel.onmessage = (event) => {
      try {
        this.handleGameMessage(JSON.parse(event.data), peerId);
      } catch {}
    };
    channel.onclose = () => {
      this.remotePlayers.delete(peerId);
      this.connections = this.connections.filter(c => c.peerId !== peerId);
      updateP2PRoomUI();
    };
  }

  handleGameMessage(data, peerId) {
    switch (data.type) {
      case 'score-update':
        this.remotePlayers.set(peerId, {
          ...this.remotePlayers.get(peerId),
          score: data.score,
          combo: data.combo,
          health: data.health
        });
        break;
      case 'game-start':
        if (!this.isHost && !state.isPlaying) startGame();
        break;
      case 'game-end':
        this.showResults(data);
        break;
      case 'player-hit':
        if (this.gameMode === 'cooperative') {
          applyDamage(data.damage);
          showNotification(`💔 ${data.playerName} fue golpeado!`, 'error');
        }
        break;
    }
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    for (const conn of this.connections) {
      if (conn.dataChannel?.readyState === 'open') conn.dataChannel.send(message);
    }
  }

  syncGameState() {
    if (this.connections.length === 0) return;
    this.broadcast({
      type: 'score-update',
      score: state.score,
      combo: state.combo,
      health: state.health,
      timestamp: Date.now()
    });
  }

  startGame() {
    this.gameState.isPlaying = true;
    this.gameState.startTime = Date.now();
    if (this.isHost) {
      this.broadcast({ type: 'game-start', startTime: this.gameState.startTime });
    }
    this.syncInterval = setInterval(() => this.syncGameState(), 100);
  }

  notifyHit(damage) {
    if (this.gameMode === 'cooperative' && this.connections.length > 0) {
      this.broadcast({
        type: 'player-hit',
        playerName: this.playerName,
        damage
      });
    }
  }

  endGame() {
    this.gameState.isPlaying = false;
    if (this.syncInterval) { clearInterval(this.syncInterval); this.syncInterval = null; }
    const results = {
      type: 'game-end',
      players: [{ name: this.playerName, score: state.score, isHost: this.isHost }]
    };
    this.remotePlayers.forEach((player) => {
      results.players.push({ name: player.name || 'Jugador', score: player.score || 0, isHost: false });
    });
    if (this.isHost) this.broadcast(results);
    this.showResults(results);
  }

  showResults(data) {
    const sorted = [...data.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    let message = '🏆 Resultados:\n';
    sorted.forEach((p, i) => { message += `${i + 1}. ${p.name}: ${p.score} pts\n`; });
    if (this.gameMode === 'competitive' && winner) message += `\n👑 Ganador: ${winner.name}!`;
    showNotification(message, winner?.name === this.playerName ? 'success' : 'info');
  }

  disconnect() {
    if (this.syncInterval) { clearInterval(this.syncInterval); this.syncInterval = null; }
    if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
    if (this.cleanupInterval) { clearInterval(this.cleanupInterval); this.cleanupInterval = null; }

    if (this.isHost && this.discoveryChannel && this.roomId) {
      this.discoveryChannel.postMessage({
        type: 'room-removed',
        senderId: this.playerId,
        roomId: this.roomId
      });
    }

    for (const conn of this.connections) {
      try { conn.dataChannel?.close(); } catch {}
      try { conn.connection?.close(); } catch {}
    }
    this.connections = [];
    this.remotePlayers.clear();
    this.isHost = false;
    this.roomId = null;

    this.signalingChannel?.close();
    this.signalingChannel = null;
    this.discoveryChannel?.close();
    this.discoveryChannel = null;

    showNotification(tr('rhythmDisconnectedNotice', '👋 Disconnected'), 'info');
    updateP2PRoomUI();
  }
}

let p2pManager = null;
function ensureP2P() {
  if (!p2pManager) p2pManager = new P2PManager();
  return p2pManager;
}

// ---- UI del panel P2P (port de createP2PUI, integrado en la UI del mod) ----
function getP2PPanelHtml() {
  const m = p2pManager;
  return `
    <div id="mf-rhythm-p2p" style="display:none;margin-top:10px;border-top:1px solid #7c5cff;padding-top:8px;">
      <div style="font-weight:bold;margin-bottom:6px;color:#7c5cff;font-size:12px;">🌐 ${tr('rhythmMultiplayer', 'Multiplayer P2P')}</div>
      <div id="mf-rhythm-p2p-status" style="margin-bottom:6px;font-size:10px;color:#9ca3af;">${tr('rhythmDisconnected', 'Not connected')}</div>
      <div id="mf-rhythm-p2p-current" style="display:none;margin-bottom:6px;padding:6px;background:rgba(124,92,255,0.15);border-radius:4px;font-size:11px;">
        <div>${tr('rhythmRoom', 'Room')}: <span id="mf-rhythm-room-id" style="cursor:pointer;background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:3px;user-select:all;" title="${tr('waypointCopy', 'Copy')}">-</span> 📋</div>
        <div id="mf-rhythm-room-count" style="color:#9ca3af;font-size:10px;">1/4 ${tr('rhythmPlayers', 'players')}</div>
        <div id="mf-rhythm-player-list" style="margin-top:4px;font-size:10px;"></div>
      </div>
      <input type="text" id="mf-rhythm-p2p-name" placeholder="${tr('rhythmYourName', 'Your name')}" value="${m ? m.playerName : ''}"
        style="width:100%;box-sizing:border-box;padding:4px;border-radius:3px;border:none;font-size:11px;margin-bottom:4px;">
      <select id="mf-rhythm-p2p-mode" style="width:100%;padding:4px;border-radius:3px;border:none;font-size:11px;margin-bottom:4px;">
        <option value="competitive">🏆 ${tr('rhythmCompetitive', 'Competitive')}</option>
        <option value="cooperative">🤝 ${tr('rhythmCooperative', 'Cooperative')}</option>
      </select>
      <div style="display:flex;gap:4px;margin-bottom:4px;">
        <input type="text" id="mf-rhythm-p2p-join-id" placeholder="${tr('rhythmHostId', 'Host ID')}"
          style="flex:1;padding:4px;border-radius:3px;border:none;font-size:11px;">
        <button id="mf-rhythm-p2p-join" class="mf-rhythm-btn" style="background:#f59e0b;padding:4px 8px;">🔗</button>
      </div>
      <div style="display:flex;gap:4px;">
        <button id="mf-rhythm-p2p-create" class="mf-rhythm-btn" style="flex:1;background:#4ade80;color:#000;font-size:11px;">🏠 ${tr('rhythmCreateRoom', 'Create Room')}</button>
        <button id="mf-rhythm-p2p-disconnect" class="mf-rhythm-btn" style="flex:1;background:#ef4444;font-size:11px;display:none;">❌ ${tr('rhythmLeave', 'Leave')}</button>
      </div>
      <div style="margin-top:6px;font-size:9px;color:#6b7280;font-style:italic;">
        ${tr('rhythmStartPeersHint', '/rp start also starts the game for connected peers')}
      </div>
    </div>
  `;
}

function updateP2PRoomUI() {
  const ui = state.ui;
  if (!ui) return;
  const m = p2pManager;
  const statusEl = ui.querySelector('#mf-rhythm-p2p-status');
  const currentEl = ui.querySelector('#mf-rhythm-p2p-current');
  const roomIdEl = ui.querySelector('#mf-rhythm-room-id');
  const countEl = ui.querySelector('#mf-rhythm-room-count');
  const listEl = ui.querySelector('#mf-rhythm-player-list');
  const createBtn = ui.querySelector('#mf-rhythm-p2p-create');
  const joinBtn = ui.querySelector('#mf-rhythm-p2p-join');
  const joinInput = ui.querySelector('#mf-rhythm-p2p-join-id');
  const discBtn = ui.querySelector('#mf-rhythm-p2p-disconnect');
  if (!statusEl) return;

  const connected = m && m.roomId;
  if (connected) {
    currentEl.style.display = 'block';
    createBtn.style.display = 'none';
    joinBtn.style.display = 'none';
    joinInput.style.display = 'none';
    discBtn.style.display = 'block';
    if (roomIdEl && roomIdEl.textContent === '-') roomIdEl.textContent = m.roomId;
    statusEl.innerHTML = m.isHost
      ? `🏠 <span style="color:#4ade80;">${tr('rhythmYouAreHost', 'You are the host')}</span>`
      : `🔌 <span style="color:#60a5fa;">${tr('rhythmConnected', 'Connected')}</span>`;

    let html = `<div style="color:#4ade80;">🟢 ${tr('rhythmYou', 'You')}: ${m.playerName} (${state.score} ${tr('rhythmPoints', 'pts')})</div>`;
    m.remotePlayers.forEach((pl) => {
      html += `<div style="color:#60a5fa;">🔵 ${pl.name || tr('rhythmPlayer', 'Player')}: ${pl.score || 0} ${tr('rhythmPoints', 'pts')}`;
      if (m.gameMode === 'competitive') html += ` (${tr('rhythmCombo', 'Combo')}: ${pl.combo || 0})`;
      html += `</div>`;
    });
    if (listEl) listEl.innerHTML = html;
    if (countEl) countEl.textContent = `${m.connections.length + 1}/${m.maxPlayers} ${tr('rhythmPlayers', 'players')}`;
  } else {
    currentEl.style.display = 'none';
    createBtn.style.display = 'block';
    joinBtn.style.display = 'block';
    joinInput.style.display = 'block';
    discBtn.style.display = 'none';
    if (roomIdEl) roomIdEl.textContent = '-';
    statusEl.innerHTML = `<span style="color:#9ca3af;">${tr('rhythmDisconnected', 'Not connected')}</span>`;
    if (listEl) listEl.innerHTML = '';
    if (countEl) countEl.textContent = '';
  }
}

function bindP2PControls(container) {
  const m = ensureP2P();

  container.querySelector('#mf-rhythm-p2p-name')?.addEventListener('change', (e) => {
    m.playerName = e.target.value || m.playerName;
  });

  container.querySelector('#mf-rhythm-p2p-create')?.addEventListener('click', async () => {
    const mode = container.querySelector('#mf-rhythm-p2p-mode')?.value || 'competitive';
    await m.createRoom(mode);
  });

  container.querySelector('#mf-rhythm-p2p-join')?.addEventListener('click', async () => {
    const roomId = container.querySelector('#mf-rhythm-p2p-join-id')?.value?.trim();
    if (roomId) await m.joinRoom(roomId);
  });

  container.querySelector('#mf-rhythm-p2p-disconnect')?.addEventListener('click', () => {
    m.disconnect();
  });

  // Clic para copiar el ID de sala
  container.querySelector('#mf-rhythm-room-id')?.addEventListener('click', function () {
    const roomId = this.textContent;
    if (roomId && roomId !== '-') {
      navigator.clipboard?.writeText(roomId).then(() => {
        const bg = this.style.background;
        this.style.background = '#4ade80';
        this.style.color = '#000';
        setTimeout(() => { this.style.background = bg; this.style.color = ''; }, 500);
      }).catch(() => {});
    }
  });
}

// ---- Comunicación de estado hacia content.js ----
function dispatchState() {
  updateHud();
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
  ensureP2P();
  const container = document.createElement('div');
  container.id = 'mf-rhythm-ui';
  container.innerHTML = `
    <div style="font-weight:bold;margin-bottom:8px;color:#7c5cff;">🎵 Rhythm Parkour</div>
    <div id="mf-rhythm-hud" style="font-size:11px;line-height:1.6;color:#d1d5db;"></div>
    <input type="file" id="mf-rhythm-file" accept="audio/*" style="display:none;">
    <div style="display:flex;gap:4px;margin-top:8px;">
      <button id="mf-rhythm-load" class="mf-rhythm-btn" style="flex:1;background:#4ade80;color:#000;font-size:11px;">🎵 ${tr('rhythmSong', 'Song')}</button>
      <button id="mf-rhythm-start" class="mf-rhythm-btn" style="flex:1;background:#7c5cff;font-size:11px;">▶</button>
      <button id="mf-rhythm-stop" class="mf-rhythm-btn" style="flex:1;background:#ef4444;font-size:11px;">⏹</button>
    </div>
    <div id="mf-rhythm-p2p-toggle" style="margin-top:8px;font-size:11px;color:#7c5cff;cursor:pointer;user-select:none;">🌐 ${tr('rhythmMultiplayerShort', 'Multiplayer')} ▸</div>
    ${getP2PPanelHtml()}
  `;
  container.style.cssText = 'position:fixed;top:60px;right:10px;z-index:99998;background:rgba(15,15,20,0.92);border:1px solid #7c5cff;border-radius:8px;padding:10px;width:190px;font-family:monospace;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
  document.body.appendChild(container);
  state.ui = container;

  const fileInput = container.querySelector('#mf-rhythm-file');
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadAudioFile(file);
    fileInput.value = '';
  });
  container.querySelector('#mf-rhythm-load')?.addEventListener('click', () => fileInput?.click());
  container.querySelector('#mf-rhythm-start')?.addEventListener('click', () => startGame());
  container.querySelector('#mf-rhythm-stop')?.addEventListener('click', () => { stopGame(); showNotification(tr('rhythmGameStopped', '⏹ Game stopped'), 'info'); });

  // Toggle del panel P2P
  const p2pToggle = container.querySelector('#mf-rhythm-p2p-toggle');
  const p2pPanel = container.querySelector('#mf-rhythm-p2p');
  p2pToggle?.addEventListener('click', () => {
    if (!p2pPanel) return;
    const visible = p2pPanel.style.display !== 'none';
    p2pPanel.style.display = visible ? 'none' : 'block';
    p2pToggle.textContent = `🌐 ${tr('rhythmMultiplayerShort', 'Multiplayer')} ${visible ? '▸' : '▾'}`;
  });

  bindP2PControls(container);
  updateHud();
  updateP2PRoomUI();
}

function updateHud() {
  if (!state.ui) return;
  const hud = state.ui.querySelector('#mf-rhythm-hud');
  if (!hud) return;
  if (!state.currentSong) {
    hud.innerHTML = `<span style="color:#9ca3af;">${tr('rhythmNoSong', 'No song. Use 🎵 Song or /rp load')}</span>`;
    return;
  }
  hud.innerHTML = `
    <div>${tr('rhythmStatus', 'Status')}: ${state.isPlaying ? `▶ <span style="color:#4ade80;">${tr('rhythmPlaying', 'Playing')}</span>` : `⏸ ${tr('rhythmStopped', 'Stopped')}`}</div>
    <div>${tr('rhythmScore', 'Score')}: <span style="color:#fbbf24;">${state.score}</span> | ${tr('rhythmCombo', 'Combo')}: ${state.combo}</div>
    <div>${tr('rhythmLives', 'Lives')}: ${'❤️'.repeat(state.health)}${'🖤'.repeat(Math.max(0, 5 - state.health))}</div>
    <div>${tr('rhythmBeat', 'Beat')}: ${state.currentBeat}/${state.beatCount} | BPM: ${state.detectedBPM}</div>
  `;
}

function removeUI() {
  document.getElementById('mf-rhythm-ui')?.remove();
  state.ui = null;
}

// ---- Notificaciones y mensajes good/miss ----
function showNotification(msg, type = 'info') {
  const colors = { success: '#4ade80', error: '#ef4444', info: '#7c5cff' };
  const n = document.createElement('div');
  n.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:rgba(15,15,20,0.95);border:2px solid ${colors[type] || colors.info};border-radius:8px;padding:12px 20px;font-family:monospace;font-size:14px;color:${colors[type] || colors.info};white-space:pre-line;text-align:center;pointer-events:none;`;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 3000);
}

// Mensaje good/miss flotante sobre la hotbar con fuente Faithful
function showHitMessage(kind) {
  const isGood = kind === 'good';
  const msg = document.createElement('div');
  msg.textContent = isGood ? tr('rhythmGood', '✔ Good!') : tr('rhythmMiss', '✘ Miss!');
  msg.style.cssText = `position:fixed;bottom:120px;left:50%;transform:translateX(-50%);z-index:99999;font-family:'Faithful',monospace;font-size:24px;font-weight:bold;color:${isGood ? '#4ade80' : '#ef4444'};text-shadow:2px 2px 0 #000;pointer-events:none;transition:opacity 0.6s ease-out, transform 0.6s ease-out;`;
  document.body.appendChild(msg);
  requestAnimationFrame(() => {
    msg.style.opacity = '0';
    msg.style.transform = 'translateX(-50%) translateY(-40px)';
  });
  setTimeout(() => msg.remove(), 650);
}

// ---- Ciclo de vida del módulo ----
function enable() {
  state.enabled = true;
  const g = getGame(true);
  state.game = g || null;
  state.world = g?.world || null;
  installChatCommands();
  createUI();
  // Vigilar la aparición del world (al entrar a una partida)
  if (!state.world) {
    const finder = setInterval(() => {
      if (!state.enabled) { clearInterval(finder); return; }
      const gg = getGame(true);
      if (gg?.world) {
        state.game = gg;
        state.world = gg.world;
        clearInterval(finder);
      }
    }, 1500);
    setTimeout(() => clearInterval(finder), 120000);
  }
  dispatchState();
}

function disable() {
  if (state.isPlaying) stopGame();
  state.enabled = false;
  p2pManager?.disconnect?.();
  removeUI();
}

// ---- Escucha de configuración desde content.js ----
document.addEventListener(EVENT_CONFIG, (e) => {
  try {
    const cfg = JSON.parse(e.detail || '{}');
    if (cfg.enabled === true) enable();
    else if (cfg.enabled === false) disable();
  } catch {}
});

// ---- Exposición para depuración / comandos manuales ----
window.MF_RhythmParkour = {
  enable, disable,
  start: startGame, stop: stopGame,
  loadFile: (f) => loadAudioFile(f),
  status: statusText,
  command: executeCommand,
  p2p: () => ensureP2P()
};

console.log('[MiniFeather RhythmParkour] Módulo cargado. Usa el toggle en la GUI o window.MF_RhythmParkour');
})();
