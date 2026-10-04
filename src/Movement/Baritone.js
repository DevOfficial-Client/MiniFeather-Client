(function () {
  'use strict';

  const BARITONE_NAVIGATION_VERSION = 2;

  // Only the adapter depends on native APIs; the planner knows terrain, not obfuscated names.
  try { globalThis.Baritone?.destroy?.(); } catch (_) {}
  const listeners = [];
  const state = {
    enabled: false, status: 'idle', reason: '', goal: null, effectiveGoal: null,
    path: [], pathIndex: 0, following: null, action: null, actionPhase: 'idle',
    autoMine: true, search: null, searchResult: null, retries: 0, resumeAt: 0,
    progressAt: 0, progressPos: null, followPlanAt: 0, followGoal: null,
    jumpUntil: 0, jumpedIndex: -1, bestGoalDistance: Infinity, blockedEdges: new Set(), players: new Map(),
    scannedAt: 0, game: null, player: null, world: null, destroyed: false, timer: 0
  };
  let adapter = null, planner = null, emitAt = 0;
  const now = () => performance.now();
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const cell = p => ({ x: Math.floor(p.x), y: Math.floor(p.y + 0.01), z: Math.floor(p.z) });
  const center = p => ({ x: p.x + 0.5, y: p.y, z: p.z + 0.5 });
  const finite = p => p && [p.x, p.y, p.z].every(Number.isFinite);

  function getGame() {
    const valid = game => finite(game?.player?.pos) && game?.world;
    const bridge = globalThis.__MINIFEATHER_MOVEMENT_API__;
    for (const candidate of [bridge?.getGame?.(), globalThis.__MINIBLOX_GAME__,
      globalThis.game, globalThis.minibloxGame, globalThis.__MB?.game]) {
      if (valid(candidate)) return candidate;
    }
    const root = document.querySelector('#react') || document.querySelector('#root');
    if (!root) return null;
    const queue = Object.keys(root).filter(k => /^(?:__react|_reactRoot)/.test(k)).map(k => root[k]);
    const seen = new Set();
    for (let i = 0; i < queue.length && i < 300; i++) {
      const value = queue[i];
      if (!value || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);
      for (const game of [value.memoizedProps?.game, value.pendingProps?.game,
        value.updateQueue?.baseState?.element?.props?.game, value.stateNode?.game]) {
        if (valid(game)) return game;
      }
      for (const next of [value.current, value._internalRoot, value.child, value.sibling, value.return]) {
        if (next && !seen.has(next)) queue.push(next);
      }
    }
    return null;
  }

  function emitState(force = false) {
    if (!force && now() < emitAt) return;
    emitAt = now() + 250;
    document.dispatchEvent(new CustomEvent('minifeather:baritone-state', { detail: JSON.stringify({
      enabled: state.enabled, status: state.status, reason: state.reason,
      goal: state.goal, effectiveGoal: state.effectiveGoal, following: state.following,
      action: state.action ? { ...state.action, entity: undefined, candidates: undefined } : null,
      actionPhase: state.actionPhase, autoMine: state.autoMine,
      pathLength: state.path.length, pathIndex: state.pathIndex,
      planning: !!state.search, complete: state.searchResult?.complete ?? null
    }) }));
  }
  function setStatus(status, reason = '') {
    if (state.status === status && state.reason === reason) return;
    state.status = status; state.reason = reason; emitState(true);
  }
  function neutral() {
    if (adapter && !adapter.setControls({ forward: 0, strafe: 0, jump: false, sneak: false, sprint: false })) {
      throw new Error(adapter.diagnostics()?.error || 'Native input hooks unavailable');
    }
  }
  function cancelSearch() { state.search?.cancel(); state.search = null; }
  function stop(status = 'idle', reason = '') {
    cancelSearch(); adapter?.release();
    Object.assign(state, { path: [], pathIndex: 0, goal: null, effectiveGoal: null,
      following: null, followGoal: null, action: null, actionPhase: 'idle',
      jumpUntil: 0, jumpedIndex: -1, bestGoalDistance: Infinity, retries: 0, progressPos: null, searchResult: null });
    state.blockedEdges.clear(); setStatus(status, reason); emitState(true);
  }
  function bind(game) {
    if (!globalThis.__MF_BARITONE_ADAPTER__ || !globalThis.__MF_BARITONE_PLANNER__) {
      setStatus('failed', 'Navigation dependencies are not loaded'); return false;
    }
    if (!adapter) adapter = globalThis.__MF_BARITONE_ADAPTER__.create();
    if (!adapter.bind(game)) {
      setStatus('failed', adapter.diagnostics()?.error || 'Native movement API unavailable'); return false;
    }
    Object.assign(state, { game, player: game.player, world: game.world });
    planner = globalThis.__MF_BARITONE_PLANNER__.create((x, y, z) => adapter.readCell(x, y, z),
      { allowMine: state.autoMine, allowGap: true, blockedEdges: state.blockedEdges });
    return true;
  }
  function prepare() {
    const game = getGame();
    if (!game || (typeof game.inGame === 'function' && !game.inGame())) {
      stop('failed', 'Enter a world before starting Baritone'); return false;
    }
    if (globalThis.__MINIFEATHER_FREECAM_ACTIVE__) {
      stop('failed', 'Disable FreeCam before starting Baritone'); return false;
    }
    stop('idle');
    if (!bind(game)) { adapter?.release(); return false; }
    state.enabled = true; return true;
  }
  function beginSearch(goal = state.goal) {
    if (!finite(goal) || !planner || !state.player?.pos) return false;
    cancelSearch(); adapter.releaseInteraction?.(); neutral();
    const nextGoal = cell(goal);
    if (!state.goal || state.goal.x !== nextGoal.x || state.goal.y !== nextGoal.y || state.goal.z !== nextGoal.z) {
      state.bestGoalDistance = distance(state.player.pos, center(nextGoal));
    }
    state.path = []; state.pathIndex = 0; state.jumpedIndex = -1; state.goal = nextGoal;
    state.search = planner.search(cell(state.player.pos), state.goal,
      { maxNodesTotal: 12000, maxTimeMs: 2000, goalRadius: state.action ? 0 : 3 });
    state.progressAt = now(); state.progressPos = { ...state.player.pos };
    setStatus('pathfinding'); return true;
  }
  function waitOrFail(reason) {
    neutral(); adapter?.releaseInteraction?.(); state.resumeAt = now() + 1000;
    if (++state.retries > 6) stop('failed', reason); else setStatus('waiting', reason);
  }
  function routeComplete() {
    neutral();
    if (!state.searchResult?.complete) return waitOrFail('Waiting for safe continuation / loaded chunks');
    if (state.action) {
      state.actionPhase = 'aiming'; state.path = [];
      setStatus(state.action.type === 'attack' ? 'attacking' : state.action.type === 'mine' ? 'mining' : 'placing');
    } else if (state.following) { state.path = []; setStatus('following'); }
    else stop('idle', state.searchResult.adjustedGoal ? 'Reached a safe position near the goal' : 'Destination reached');
  }
  function advanceSearch() {
    const job = state.search;
    if (!job) return;
    job.step({ maxMs: 4, maxNodes: 160 });
    if (!job.done || state.search !== job) return;
    state.search = null; state.searchResult = job.result;
    state.effectiveGoal = job.result?.goal || state.goal;
    state.path = job.result?.path || []; state.pathIndex = 0; state.jumpedIndex = -1;
    state.progressAt = now(); state.progressPos = { ...state.player.pos };
    if (state.path.length) setStatus('moving', job.result.complete ? '' : 'Partial route through loaded terrain');
    else if (job.result?.complete) routeComplete();
    else if (state.action && nextActionApproach()) return;
    else waitOrFail(job.result?.reason || 'No safe route in loaded terrain');
    emitState(true);
  }
  function edgeKey(from, to) {
    return `${from.x},${from.y},${from.z}>${to.x},${to.y},${to.z}`;
  }
  function blockEdge(from, to) {
    state.blockedEdges.add(edgeKey(from, to));
    if (state.blockedEdges.size > 256) state.blockedEdges.delete(state.blockedEdges.values().next().value);
  }
  function executePath(time) {
    const player = state.player;
    const remaining = state.goal ? distance(player.pos, center(state.goal)) : Infinity;
    if (remaining <= state.bestGoalDistance - 0.9) {
      // New safe progress is not a failed retry, even across many chunk frontiers.
      state.bestGoalDistance = remaining;
      state.retries = 0;
    }
    if (!state.path.length || state.pathIndex >= state.path.length) return routeComplete();
    let target = state.path[state.pathIndex];
    while (target && distance(player.pos, center(target)) < 0.30 && player.onGround !== false) {
      state.pathIndex++; state.jumpedIndex = -1; state.progressAt = time;
      state.progressPos = { ...player.pos }; target = state.path[state.pathIndex];
    }
    if (!target) return routeComplete();
    if (target.breakBlocks?.length) {
      // Clear headroom first: the upper block can occlude the ray to the feet.
      const obstruction = [...target.breakBlocks].sort((a, b) => b.y - a.y).find(p => {
        const info = adapter.readCell(p.x, p.y, p.z); return !info?.known || info.solid;
      });
      if (obstruction) {
        const info = adapter.readCell(obstruction.x, obstruction.y, obstruction.z);
        if (!state.autoMine || !info?.known || !info.breakable || info.hazard) {
          blockEdge(cell(player.pos), target); return beginSearch();
        }
        neutral();
        const aim = adapter.aimAt(obstruction.x + 0.5, obstruction.y + 0.5, obstruction.z + 0.5, 0.05);
        const result = (aim === true || aim?.aligned) ? adapter.interact('mine', obstruction) : null;
        setStatus('mining', result?.reason || 'Clearing a planned obstacle');
        if (time - state.progressAt > 18000) {
          blockEdge(cell(player.pos), target);
          if (++state.retries > 6) return stop('failed', 'Obstacle cannot be mined');
          beginSearch();
        }
        return;
      }
    }
    adapter.releaseInteraction?.();
    if (state.status !== 'moving') setStatus('moving');
    if (!planner.canStand(target.x, target.y, target.z)) return beginSearch();
    const from = state.pathIndex ? state.path[state.pathIndex - 1] : cell(player.pos);
    if (player.onGround !== false && planner.canStand(from.x, from.y, from.z) &&
        (from.x !== target.x || from.y !== target.y || from.z !== target.z) &&
        !planner.validateTransition(from, target)) {
      return beginSearch();
    }
    const horizontal = Math.hypot(target.x + 0.5 - player.pos.x, target.z + 0.5 - player.pos.z);
    const needsJump = ['jump', 'gap'].includes(target.action) || target.y > player.pos.y + 0.5;
    const eye = adapter.eye();
    const aim = adapter.aimAt(target.x + 0.5, eye.y, target.z + 0.5, 0.05);
    if (['native-camera-unresponsive', 'native-camera-not-responding'].includes(aim?.reason)) return stop('failed', aim.reason);
    const aligned = aim === true || aim?.aligned;
    if (aligned && needsJump && state.jumpedIndex !== state.pathIndex && player.onGround !== false &&
        horizontal < (target.action === 'gap' ? 2.4 : 1.65)) {
      state.jumpUntil = time + 150; state.jumpedIndex = state.pathIndex;
    }
    const applied = adapter.setControls({ forward: aligned ? 1 : 0, strafe: 0, jump: aligned && time < state.jumpUntil,
      sprint: aligned && (target.action === 'gap' || (target.action === 'walk' && horizontal > 0.8)),
      sneak: false, yaw: aim?.yaw, pitch: aim?.pitch });
    if (!applied) return stop('failed', adapter.diagnostics()?.error || 'Native input hooks unavailable');
    if (!state.progressPos || distance(player.pos, state.progressPos) > 0.18) {
      state.progressAt = time; state.progressPos = { ...player.pos };
    } else if (time - state.progressAt > 2500) {
      blockEdge(from, target);
      if (++state.retries > 6) return stop('failed', 'Stuck: no safe continuation');
      beginSearch();
    }
  }
  function scanPlayers(force = false) {
    if (!adapter || (!force && now() < state.scannedAt)) return;
    state.scannedAt = now() + 500;
    for (const saved of state.players.values()) saved.loaded = false;
    for (const entity of adapter.entities() || []) {
      const username = entity?.profile?.username || entity?.username;
      if (typeof username !== 'string' || !finite(entity.pos)) continue;
      state.players.set(username.toLowerCase(), { username, x: entity.pos.x, y: entity.pos.y,
        z: entity.pos.z, loaded: true, seenAt: Date.now() });
    }
    for (const [key, entry] of state.players) {
      if (Date.now() - entry.seenAt > 300000 || state.players.size > 256) state.players.delete(key);
    }
  }
  function entityFor(username) {
    const wanted = String(username).toLowerCase();
    return [...(adapter?.entities() || [])].find(entity =>
      String(entity?.profile?.username || entity?.username || '').toLowerCase() === wanted && finite(entity.pos));
  }
  function followTick(time) {
    const entity = entityFor(state.following);
    if (!entity) { neutral(); return setStatus('following', 'Waiting for player to be loaded'); }
    const goal = cell(entity.pos);
    if (distance(state.player.pos, entity.pos) <= (state.action?.type === 'attack' ? 2.8 : 2.5)) {
      cancelSearch(); state.path = []; neutral();
      adapter.aimAt(entity.pos.x, entity.pos.y + 1.3, entity.pos.z, 0.05);
      if (state.action?.type === 'attack' && time >= state.action.nextAt) {
        const result = adapter.interact('attack', { entity }); state.action.nextAt = time + 600;
        setStatus('attacking', result?.reason || '');
      } else if (!state.action) setStatus('following');
      return;
    }
    if (time >= state.followPlanAt && (!state.followGoal || distance(goal, state.followGoal) >= 2 ||
        (!state.search && (!state.path.length || state.pathIndex >= state.path.length)))) {
      state.followGoal = goal; state.followPlanAt = time + 1200; beginSearch(goal);
    }
    if (state.search) advanceSearch(); else if (state.path.length) executePath(time); else neutral();
  }
  function actionCandidates(action) {
    const candidates = [];
    for (let y = action.y - 3; y <= action.y + 2; y++) {
      for (let x = action.x - 4; x <= action.x + 4; x++) {
        for (let z = action.z - 4; z <= action.z + 4; z++) {
          if (!planner.canStand(x, y, z)) continue;
          const reach = Math.hypot(action.x - x, action.y + 0.5 - (y + 1.62), action.z - z);
          if (reach <= 4.2) candidates.push({ x, y, z, score: distance(center({ x, y, z }), state.player.pos) });
        }
      }
    }
    return candidates.sort((a, b) => a.score - b.score).slice(0, 24);
  }
  function nextActionApproach() {
    const next = state.action?.candidates?.shift();
    if (!next) return false;
    state.action.phaseStarted = now(); state.actionPhase = 'approaching'; return beginSearch(next);
  }
  function placeAnchor(action) {
    const anchors = [], eye = adapter.eye();
    for (const [dx, dy, dz] of [[0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]]) {
      const anchor = { x: action.x + dx, y: action.y + dy, z: action.z + dz };
      const info = adapter.readCell(anchor.x, anchor.y, anchor.z);
      if (!info?.known || !info.solid || info.hazard) continue;
      const aim = { x: anchor.x + 0.5 - dx * 0.499, y: anchor.y + 0.5 - dy * 0.499, z: anchor.z + 0.5 - dz * 0.499 };
      anchors.push({ ...aim, anchor, score: distance(eye, aim) });
    }
    return anchors.sort((a, b) => a.score - b.score)[0] || null;
  }
  function blockActionTick(time) {
    const action = state.action, info = adapter.readCell(action.x, action.y, action.z);
    if (!info?.known) return waitOrFail('Target chunk is not loaded');
    if ((action.type === 'mine' && (info.air === true || info.name === 'air')) ||
        (action.type === 'place' && info.solid)) {
      return stop('idle', action.type === 'mine' ? 'Block mined (world confirmed)' : 'Block placed (world confirmed)');
    }
    if (time - action.started > 45000) return stop('failed', 'Action timed out / server may forbid it');
    if (state.search) return advanceSearch();
    if (state.path.length && state.pathIndex < state.path.length) return executePath(time);
    if (state.status === 'waiting') return;
    neutral();
    const aim = action.type === 'place' ? placeAnchor(action) :
      { x: action.x + 0.5, y: action.y + 0.5, z: action.z + 0.5 };
    if (!aim) return stop('failed', 'No safe adjacent block to place against');
    const aligned = adapter.aimAt(aim.x, aim.y, aim.z, 0.05);
    if (['native-camera-unresponsive', 'native-camera-not-responding'].includes(aligned?.reason)) return stop('failed', aligned.reason);
    state.actionPhase = 'aiming';
    if (!(aligned === true || aligned?.aligned)) return;
    if (action.type === 'place' && time < action.nextAt) return;
    const result = adapter.interact(action.type, action.type === 'place' ? { ...action, anchor: aim.anchor } : action);
    if (result?.ok) {
      state.actionPhase = 'acting'; action.nextAt = time + 500;
      setStatus(action.type === 'mine' ? 'mining' : 'placing', 'Waiting for world confirmation');
    } else {
      setStatus(action.type === 'mine' ? 'mining' : 'placing', result?.reason || 'Waiting for native ray hit');
      if (time - action.phaseStarted > 2500) {
        adapter.releaseInteraction?.();
        if (!nextActionApproach()) stop('failed', result?.reason || 'No reachable visible target');
      }
    }
  }
  function goto(x, y, z) {
    const target = { x: Number(x), y: Number(y), z: Number(z) };
    if (!finite(target) || !prepare()) return false;
    return beginSearch(target);
  }
  function follow(username, attack = false) {
    if (!String(username || '').trim() || !prepare()) return false;
    if (!entityFor(username)) { stop('failed', 'Player is not loaded'); return false; }
    state.following = String(username); state.followGoal = null; state.followPlanAt = 0;
    if (attack) state.action = { type: 'attack', username: String(username), nextAt: 0 };
    setStatus('following'); return true;
  }
  function blockAction(type, x, y, z, slot) {
    const target = { x: Number(x), y: Number(y), z: Number(z) };
    if (!finite(target) || !prepare()) return false;
    // ClientCommands passes NaN when no optional slot was supplied.
    if (Number.isNaN(slot)) slot = null;
    if (slot != null && slot !== 0 && (!Number.isInteger(Number(slot)) || slot < 1 || slot > 9)) {
      stop('failed', 'Hotbar slot must be 1-9'); return false;
    }
    if (type === 'place' && slot && !adapter.selectSlot(Number(slot))) {
      stop('failed', 'Native hotbar selection unavailable'); return false;
    }
    const info = adapter.readCell(Math.floor(target.x), Math.floor(target.y), Math.floor(target.z));
    if (!info?.known || (type === 'mine' && (info.hazard || (!info.breakable && info.name !== 'air')))) {
      stop('failed', 'Target is unloaded, hazardous or unbreakable'); return false;
    }
    state.action = { type, ...cell(target), started: now(), phaseStarted: now(), nextAt: 0 };
    state.action.candidates = actionCandidates(state.action);
    if (distance(adapter.eye(), { x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 }) <= 4.2) {
      setStatus(type === 'mine' ? 'mining' : 'placing'); state.actionPhase = 'aiming'; return true;
    }
    if (nextActionApproach()) return true;
    stop('failed', 'No safe approach position'); return false;
  }
  function jump(ms = 180) {
    if (!prepare()) return false;
    state.jumpUntil = now() + Math.max(100, Math.min(350, Number(ms) || 180));
    state.actionPhase = 'jumping'; setStatus('moving');
    // An idle runtime sleeps 250ms, longer than a normal jump pulse.
    clearTimeout(state.timer);
    state.timer = setTimeout(tick, 50);
    return true;
  }
  function tick() {
    if (state.destroyed) return;
    try {
      if (state.enabled && !['idle', 'failed'].includes(state.status)) {
        const game = getGame();
        if (!game || game.player !== state.player || game.world !== state.world ||
            (typeof game.inGame === 'function' && !game.inGame())) stop('failed', 'World/player changed; start a new command');
        else if (document.hidden || globalThis.__MINIFEATHER_FREECAM_ACTIVE__) stop('idle', 'Paused: background tab or FreeCam');
        else if (!adapter.bind(game)) stop('failed', adapter.diagnostics()?.error || 'Native API changed');
        else {
          const time = now(); scanPlayers();
          if (state.status === 'waiting' && time < state.resumeAt) {
            neutral();
            state.timer = setTimeout(tick, 50);
            return;
          }
          if (state.status === 'waiting' && time >= state.resumeAt) {
            if (state.action && state.action.type !== 'attack') {
              state.action.candidates = actionCandidates(state.action);
              if (!nextActionApproach()) waitOrFail('No safe action approach');
            } else beginSearch();
          }
          if (state.following) followTick(time);
          else if (state.action) blockActionTick(time);
          else if (state.search) advanceSearch();
          else if (state.status === 'waiting') neutral();
          else if (state.path.length) executePath(time);
          else if (state.jumpUntil) {
            if (time < state.jumpUntil) adapter.setControls({ forward: 0, strafe: 0, jump: true, sneak: false, sprint: false });
            else stop('idle', 'Jump complete');
          }
        }
      }
    } catch (error) { stop('failed', String(error?.message || error)); }
    if (!state.destroyed) state.timer = setTimeout(tick,
      state.enabled && !['idle', 'failed'].includes(state.status) ? 50 : 250);
  }
  function listen(event, handler) {
    document.addEventListener(event, handler, true);
    listeners.push(() => document.removeEventListener(event, handler, true));
  }
  function parse(event) {
    try { return typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail; } catch (_) { return null; }
  }
  function run(action) {
    try { return action(); }
    catch (error) { stop('failed', String(error?.message || error)); return false; }
  }
  const api = {
    goto(x, y, z) { return run(() => goto(x, y === undefined ? getGame()?.player?.pos?.y : y, z)); },
    follow(username) { return run(() => follow(username)); }, attack(username) { return run(() => follow(username, true)); },
    mine(x, y, z) { return run(() => blockAction('mine', x, y, z)); },
    place(x, y, z, slot) { return run(() => blockAction('place', x, y, z, slot)); },
    jump(ms) { return run(() => jump(ms)); },
    stop() { stop('idle', 'User stopped'); }, unfollow() { stop('idle', 'Unfollowed'); },
    enable() { state.enabled = true; emitState(true); return true; },
    disable() { stop('idle', 'Disabled'); state.enabled = false; emitState(true); return false; },
    setAutoMine(value) {
      return run(() => {
        state.autoMine = !!value;
        if (state.game && state.goal && bind(state.game)) beginSearch();
        emitState(true); return state.autoMine;
      });
    },
    locate(username) { this.players(); const saved = state.players.get(String(username).toLowerCase()); return saved ? { ...saved } : null; },
    players() {
      const game = getGame();
      if (game && !adapter) adapter = globalThis.__MF_BARITONE_ADAPTER__?.create();
      // Entity-only observation must not seize controls.
      adapter?.observe?.(game); scanPlayers(true);
      return [...state.players.values()].map(entry => ({ ...entry }));
    },
    get status() { return state.status; }, get goal() { return state.goal; },
    get pathLength() { return state.path.length; },
    debug() {
      return { version: BARITONE_NAVIGATION_VERSION, enabled: state.enabled, status: state.status, reason: state.reason,
        goal: state.goal, effectiveGoal: state.effectiveGoal, followTarget: state.following,
        action: state.action ? { ...state.action, candidates: undefined } : null,
        actionPhase: state.actionPhase, autoMine: state.autoMine,
        path: state.path.length, pathIndex: state.pathIndex, planning: !!state.search,
        search: state.searchResult ? { ...state.searchResult, path: undefined } : null,
        retries: state.retries, blockedEdges: state.blockedEdges.size, native: adapter?.diagnostics() || null };
    },
    destroy() {
      stop('idle', 'Destroyed'); state.destroyed = true; clearTimeout(state.timer);
      for (const remove of listeners) remove(); adapter?.destroy();
      if (globalThis.Baritone === api) delete globalThis.Baritone;
    }
  };
  listen('minifeather:baritone-config', event => {
    const cfg = parse(event); if (!cfg || typeof cfg !== 'object') return;
    if ('autoMine' in cfg) api.setAutoMine(cfg.autoMine);
    if ('enabled' in cfg) cfg.enabled ? api.enable() : api.disable();
  });
  listen('minifeather:baritone-command', event => {
    const cmd = parse(event); if (!cmd) return;
    switch (cmd.type) {
      case 'goto': api.goto(cmd.x, cmd.y, cmd.z); break;
      case 'follow': api.follow(cmd.username); break;
      case 'mine': api.mine(cmd.x, cmd.y, cmd.z); break;
      case 'place': api.place(cmd.x, cmd.y, cmd.z, cmd.slot); break;
      case 'attack': api.attack(cmd.username); break;
      case 'jump': api.jump(cmd.ms); break;
      case 'stop': api.stop(); break;
      case 'enable': api.enable(); break;
      case 'disable': api.disable(); break;
    }
  });
  globalThis.Baritone = api; tick();
})();
