(function () {
  'use strict';

  const BARITONE_NAVIGATION_VERSION = 4;

  // Only the adapter depends on native APIs; the planner knows terrain, not obfuscated names.
  try { globalThis.Baritone?.destroy?.(); } catch (_) {}
  const listeners = [];
  const state = {
    enabled: false, status: 'idle', reason: '', goal: null, routeGoal: null, segmented: false,
    effectiveGoal: null, searchStart: null, terrainTask: null, originalSlot: null,
    breathingGoal: null, breathingSince: 0,
    showPath: true, preview: null, previewAt: 0, visualAt: 0, lookahead: 32, checkpoints: [],
    prefetch: null,
    path: [], pathIndex: 0, following: null, action: null, actionPhase: 'idle',
    autoMine: true, autoPlace: true, search: null, searchResult: null, retries: 0, resumeAt: 0,
    progressAt: 0, progressPos: null, followPlanAt: 0, followGoal: null,
    jumpUntil: 0, jumpedIndex: -1, bestGoalDistance: Infinity, blockedEdges: new Set(), players: new Map(),
    scannedAt: 0, game: null, player: null, world: null, destroyed: false, timer: 0
  };
  let adapter = null, planner = null, pathRenderer = null, pathFactory = null, emitAt = 0;
  const now = () => performance.now();
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const cell = p => ({ x: Math.floor(p.x), y: Math.floor(p.y + 0.01), z: Math.floor(p.z) });
  const center = p => ({ x: p.x + 0.5, y: p.y, z: p.z + 0.5 });
  const finite = p => p && [p.x, p.y, p.z].every(Number.isFinite);
  const validGoal = p => finite(p) && [p.x, p.y, p.z].every(value => Math.abs(value) <= 30000000);

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
      goal: state.goal, routeGoal: state.routeGoal, effectiveGoal: state.effectiveGoal, following: state.following,
      action: state.action ? { ...state.action, entity: undefined, candidates: undefined } : null,
      actionPhase: state.actionPhase, autoMine: state.autoMine, autoPlace: state.autoPlace,
      showPath: state.showPath,
      pathLength: state.path.length, pathIndex: state.pathIndex,
      planning: !!state.search || !!state.prefetch && !state.prefetch.job.done,
      complete: state.searchResult?.globalComplete ?? null
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
  function cancelPrefetch() { state.prefetch?.job.cancel(); state.prefetch = null; }
  function clearVisual() { try { pathRenderer?.clear(); } catch (_) {} }
  function updateVisual(time = now(), force = false) {
    if (!force && time < state.visualAt) return;
    state.visualAt = time + 250;
    try {
      if (!state.showPath || !state.game || ['idle', 'failed'].includes(state.status)) { pathRenderer?.clear(); return; }
      const factory = globalThis.__MF_BARITONE_PATH_RENDERER__;
      if (factory !== pathFactory) {
        try { pathRenderer?.destroy(); } catch (_) {}
        pathRenderer = null; pathFactory = factory;
      }
      if (!pathRenderer) pathRenderer = factory?.create?.();
      if (!pathRenderer || !pathRenderer.bind(state.game)) return;
      pathRenderer.setVisible(true);
      pathRenderer.update({ path: state.path, pathIndex: state.pathIndex, goal: state.goal,
        routeGoal: state.routeGoal, planning: !!state.search || !!state.prefetch,
        preview: state.preview, player: state.player?.pos });
    } catch (_) {
      // Path visualization is optional: its failure must never seize movement.
      try { pathRenderer?.clear(); } catch (_) {}
    }
  }
  function restoreSlot() {
    if (state.originalSlot != null) adapter?.selectSlot(state.originalSlot);
    state.originalSlot = null;
  }
  function releaseTerrain() {
    adapter?.releaseInteraction?.();
    restoreSlot();
    state.terrainTask = null;
  }
  function stop(status = 'idle', reason = '') {
    cancelSearch(); cancelPrefetch(); releaseTerrain(); adapter?.release();
    clearVisual();
    Object.assign(state, { path: [], pathIndex: 0, goal: null, effectiveGoal: null,
      following: null, followGoal: null, action: null, actionPhase: 'idle', routeGoal: null,
      segmented: false, searchStart: null, breathingGoal: null, breathingSince: 0,
      preview: null, lookahead: 32, checkpoints: [],
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
    refreshPlanner();
    return true;
  }
  function refreshPlanner() {
    const budget = (adapter?.blockInventory?.() || []).reduce((sum, stack) => sum + Math.max(0, Number(stack.count) || 0), 0);
    const oxygen = adapter?.swimmingState?.()?.oxygen;
    const swimBudget = oxygen == null ? 12 : Math.max(2, Math.min(12, Math.floor(oxygen / 15)));
    const miningCosts = new Map();
    planner = globalThis.__MF_BARITONE_PLANNER__.create((x, y, z) => adapter.readCell(x, y, z), {
      allowMine: state.autoMine, allowGap: true, allowSwim: true,
      maxSubmergedSteps: swimBudget,
      allowPlace: state.autoPlace && budget > 0, placeBudget: Math.min(32, budget),
      miningCost(position, info) {
        const id = info?.name ? `${info.name}:${info.hardness}` : `${position.x},${position.y},${position.z}`;
        if (miningCosts.has(id)) return miningCosts.get(id);
        const estimate = adapter.miningEstimate?.(position.x, position.y, position.z);
        // Walking a block takes roughly five ticks; compare mining in those units.
        const cost = Number.isFinite(estimate?.ticks) ? Math.max(.25, estimate.ticks / 5) : undefined;
        if (miningCosts.size < 512) miningCosts.set(id, cost);
        return cost;
      },
      blockedEdges: state.blockedEdges
    });
  }
  function routeTarget(start, goal) {
    const horizontal = Math.hypot(goal.x - start.x, goal.z - start.z);
    const segmented = horizontal > state.lookahead;
    const factor = segmented ? state.lookahead / horizontal : 1;
    return { segmented, goal: segmented ? {
      x: Math.round(start.x + (goal.x - start.x) * factor),
      y: start.y + Math.max(-3, Math.min(3, goal.y - start.y)),
      z: Math.round(start.z + (goal.z - start.z) * factor)
    } : { ...goal } };
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
    if (!validGoal(goal) || !planner || !state.player?.pos) return false;
    cancelSearch(); cancelPrefetch(); releaseTerrain(); neutral(); refreshPlanner();
    const nextGoal = cell(goal);
    if (!state.goal || state.goal.x !== nextGoal.x || state.goal.y !== nextGoal.y || state.goal.z !== nextGoal.z) {
      state.bestGoalDistance = distance(state.player.pos, center(nextGoal));
      state.lookahead = 32; state.checkpoints = [];
    }
    state.path = []; state.pathIndex = 0; state.jumpedIndex = -1; state.goal = nextGoal;
    const start = cell(state.player.pos);
    state.searchStart = { ...state.player.pos };
    const next = routeTarget(start, nextGoal);
    state.segmented = !!state.breathingGoal || next.segmented;
    state.routeGoal = state.breathingGoal || next.goal;
    state.preview = null; state.previewAt = 0;
    state.search = planner.search(start, state.routeGoal,
      { maxNodesTotal: 20000, maxTimeMs: 5000, goalRadius: state.action && !state.segmented ? 0 : 3 });
    state.progressAt = now(); state.progressPos = { ...state.player.pos };
    setStatus('pathfinding'); return true;
  }
  function waitOrFail(reason) {
    neutral(); adapter?.releaseInteraction?.(); state.resumeAt = now() + 1000;
    if (++state.retries > 6) stop('failed', reason); else setStatus('waiting', reason);
  }
  function planAhead(time) {
    if (state.search || state.action || state.following || state.breathingGoal || !state.goal ||
        !state.segmented || !state.searchResult?.complete || !state.path.length || state.terrainTask) return;
    if (!state.prefetch && state.path.length - state.pathIndex <= 8) {
      const start = state.path[state.path.length - 1];
      if (!(planner.canNavigate?.(start.x, start.y, start.z) ?? planner.canStand(start.x, start.y, start.z))) return;
      refreshPlanner();
      const route = routeTarget(start, state.goal);
      state.prefetch = { job: planner.search(start, route.goal, { maxNodesTotal: 20000, maxTimeMs: 5000 }),
        start: { x: start.x, y: start.y, z: start.z }, goal: { ...state.goal }, route };
    }
    const job = state.prefetch?.job;
    if (!job) return;
    if (!job.done) job.step({ maxMs: 2, maxNodes: 128 });
    if (time >= state.previewAt) {
      state.preview = job.preview?.({ maxWaypoints: 96 }) || null; state.previewAt = time + 250;
    }
  }
  function takePrefetch() {
    const planned = state.prefetch, result = planned?.job.result;
    if (!planned?.job.done || !result?.path?.length || !state.goal ||
        distance(planned.goal, state.goal) > 0 || distance(state.player.pos, center(planned.start)) > .6 ||
        !(planner.canNavigate?.(planned.start.x, planned.start.y, planned.start.z) ??
          planner.canStand(planned.start.x, planned.start.y, planned.start.z))) return false;
    state.prefetch = null; state.preview = null;
    state.routeGoal = planned.route.goal; state.segmented = planned.route.segmented;
    state.searchStart = { ...state.player.pos };
    state.searchResult = { ...result, globalComplete: !!result.complete && !state.segmented };
    state.effectiveGoal = result.goal || state.goal;
    state.path = result.path; state.pathIndex = 0; state.jumpedIndex = -1;
    state.progressAt = now(); state.progressPos = { ...state.player.pos };
    setStatus('moving', 'Continuing the precalculated route'); updateVisual(now(), true); return true;
  }
  function routeComplete() {
    if (!state.breathingGoal && state.segmented && state.searchResult?.complete && takePrefetch()) {
      return executePath(now());
    }
    neutral();
    if (state.breathingGoal && state.searchResult?.complete) {
      const breath = adapter.swimmingState?.();
      if (breath?.oxygen != null && breath.oxygen < 240) {
        if (now() - state.breathingSince > 12000) return stop('failed', 'Unable to recover air at the planned surface');
        if (breath.inWater) adapter.setControls({ forward: 0, strafe: 0,
          jump: state.player.pos.y < state.breathingGoal.y + .08, sneak: false, sprint: false });
        return setStatus('breathing', 'Recovering air before continuing');
      }
      state.breathingGoal = null; state.breathingSince = 0;
      return beginSearch();
    }
    if (state.segmented || !state.searchResult?.complete) {
      // A useful loaded frontier is a checkpoint, not a failed destination.
      if (state.searchStart && distance(state.player.pos, state.searchStart) >= 0.75) {
        const endpoint = cell(state.player.pos), id = `${endpoint.x},${endpoint.y},${endpoint.z}`;
        if (state.checkpoints.includes(id)) {
          state.lookahead = Math.min(128, state.lookahead * 2);
          if (++state.retries > 6) return stop('failed', 'No safe progress: partial route repeats');
        }
        state.checkpoints.push(id);
        if (state.checkpoints.length > 24) state.checkpoints.shift();
        return beginSearch();
      }
      state.lookahead = Math.min(128, state.lookahead * 2);
      return waitOrFail('Waiting for safe continuation / loaded chunks');
    }
    if (state.action) {
      state.action.phaseStarted = now(); state.action.actingStarted = null;
      state.actionPhase = 'aiming'; state.path = [];
      setStatus(state.action.type === 'attack' ? 'attacking' : state.action.type === 'mine' ? 'mining' : 'placing');
    } else if (state.following) { state.path = []; setStatus('following'); }
    else stop('idle', state.searchResult.adjustedGoal ? 'Reached a safe position near the goal' : 'Destination reached');
  }
  function advanceSearch() {
    const job = state.search;
    if (!job) return;
    job.step({ maxMs: 4, maxNodes: 256 });
    if (now() >= state.previewAt) {
      state.preview = job.preview?.({ maxWaypoints: 96 }) || null; state.previewAt = now() + 250;
    }
    if (!job.done || state.search !== job) return;
    state.search = null;
    state.preview = null;
    state.searchResult = { ...job.result, globalComplete: !!job.result?.complete && !state.segmented };
    state.effectiveGoal = job.result?.goal || state.goal;
    state.path = job.result?.path || []; state.pathIndex = 0; state.jumpedIndex = -1;
    state.progressAt = now(); state.progressPos = { ...state.player.pos };
    if (state.path.length) setStatus('moving', state.searchResult.globalComplete ? '' : 'Continuing toward the long-distance goal');
    else if (job.result?.complete) routeComplete();
    else if (state.action && nextActionApproach()) return;
    else waitOrFail(job.result?.reason || 'No safe route in loaded terrain');
    emitState(true);
    updateVisual(now(), true);
  }
  function edgeKey(from, to) {
    return `${from.x},${from.y},${from.z}>${to.x},${to.y},${to.z}`;
  }
  function blockEdge(from, to) {
    state.blockedEdges.add(edgeKey(from, to));
    if (state.blockedEdges.size > 256) state.blockedEdges.delete(state.blockedEdges.values().next().value);
  }
  function terrainTask(type, target, time) {
    const id = `${type}:${target.x},${target.y},${target.z}`;
    if (state.terrainTask?.id !== id) {
      releaseTerrain();
      state.terrainTask = { id, type, target: { ...target }, started: time, nextAt: 0, aimIndex: 0 };
    }
    // Time spent working on terrain is not a movement stall.
    state.progressAt = time; state.progressPos = { ...state.player.pos };
    return state.terrainTask;
  }
  function chooseMiningTool(task, target) {
    if (task.toolChecked) return;
    task.toolChecked = true;
    state.originalSlot = adapter.getSelectedSlot?.() ?? null;
    task.tool = adapter.selectMiningTool?.(target) || null;
    task.timeout = Number.isFinite(task.tool?.ticks) ?
      Math.max(18000, Math.min(120000, task.tool.ticks * 75 + 3000)) : 45000;
  }
  function terrainFailed(from, target, reason) {
    blockEdge(from, target); releaseTerrain();
    if (++state.retries > 6) return stop('failed', reason);
    return beginSearch();
  }
  function bridgeTerrain(target, from, time, manual = null) {
    const fail = reason => manual ? stop('failed', reason) : terrainFailed(from, target, reason);
    const floor = target.placeBlocks?.find(p => !adapter.readCell(p.x, p.y, p.z)?.solid);
    if (!floor) return false;
    const info = adapter.readCell(floor.x, floor.y, floor.z);
    const bodyClear = y => {
      const body = adapter.readCell(target.x, y, target.z);
      return body?.known && !body.solid && !body.hazard && !body.liquid;
    };
    const safeTransition = manual ? from.y === target.y && Math.abs(from.x - target.x) + Math.abs(from.z - target.z) === 1 &&
      planner.canStand(from.x, from.y, from.z) && bodyClear(target.y) && bodyClear(target.y + 1) :
      planner.validateTransition(from, target);
    if ((!manual && !state.autoPlace) || !info?.known || info.solid || info.hazard || info.liquid ||
        info.replaceable === false || !safeTransition) {
      fail('Bridge support is no longer safe'); return true;
    }
    const task = terrainTask('place', floor, time);
    neutral();
    if (!task.stack) {
      state.originalSlot = adapter.getSelectedSlot?.() ?? null;
      if (manual?.slot && !adapter.blockInventory?.().some(entry => entry.slot === manual.slot)) {
        fail('Selected block is not safe for edge placement'); return true;
      }
      task.stack = adapter.selectBuildingBlock?.(manual?.slot);
      if (!task.stack) { fail('No safe building blocks in the hotbar'); return true; }
    }
    if (time - task.started > 15000) {
      fail('Bridge placement was not confirmed'); return true;
    }
    const aims = adapter.placementAim?.(floor) || [];
    const aim = aims.length ? aims[task.aimIndex % aims.length] : null;
    const needsEdge = !aim;
    if (aim) {
      const aligned = adapter.aimAt(aim.x, aim.y, aim.z, 0.05);
      if (['native-camera-unresponsive', 'native-camera-not-responding'].includes(aligned?.reason)) {
        stop('failed', aligned.reason); return true;
      }
      if ((aligned === true || aligned?.aligned) && time >= task.nextAt) {
        const result = adapter.interact('place', { ...floor, anchor: aim.anchor });
        task.nextAt = time + 500;
        if (!result?.ok) task.aimIndex++;
        setStatus('placing', result?.ok ? 'Waiting for bridge support confirmation' : result?.reason || 'Looking for a visible support face');
      }
    }
    if (needsEdge) {
      // A real side ray requires looking from just beyond the shared edge.
      // Keep the collision footprint on the source block with native sneak.
      const dx = target.x - from.x, dz = target.z - from.z;
      const length = Math.hypot(dx, dz);
      if (!length || length > 1.01) { fail('No safe bridge edge'); return true; }
      const ux = dx / length, uz = dz / length;
      const along = (state.player.pos.x - from.x - .5) * ux + (state.player.pos.z - from.z - .5) * uz;
      const hidden = adapter.placementAim?.(floor, { includeHidden: true })?.[0];
      const edge = { x: from.x + .5 + ux * .58, y: adapter.eye().y, z: from.z + .5 + uz * .58 };
      const look = hidden || edge;
      // Hidden side-face aims can point backward from the source center;
      // approach facing the edge until the face becomes visible.
      const movingLook = along < .53 ? edge : look;
      const movingAim = adapter.aimAt(movingLook.x, movingLook.y, movingLook.z, .05);
      if (!adapter.setControls({ forward: along < .53 && (movingAim === true || movingAim?.aligned) ? 1 : 0,
        strafe: 0, sneak: true, sprint: false, jump: false, yaw: movingAim?.yaw, pitch: movingAim?.pitch })) {
        stop('failed', adapter.diagnostics()?.error || 'Native input hooks unavailable'); return true;
      }
      setStatus('placing', 'Sneaking to a visible bridge support face');
    } else if (!adapter.setControls({ forward: 0, strafe: 0, sneak: true, sprint: false, jump: false })) {
      stop('failed', adapter.diagnostics()?.error || 'Native input hooks unavailable');
    }
    return true;
  }
  function executePath(time) {
    const player = state.player;
    const remaining = state.goal ? distance(player.pos, center(state.goal)) : Infinity;
    if (remaining <= state.bestGoalDistance - 0.9) {
      // New safe progress is not a failed retry, even across many chunk frontiers.
      state.bestGoalDistance = remaining;
      state.retries = 0;
      state.lookahead = 32;
    }
    if (!state.path.length || state.pathIndex >= state.path.length) return routeComplete();
    let target = state.path[state.pathIndex];
    const playerCell = cell(player.pos);
    const wet = adapter.swimmingState?.()?.inWater === true ||
      planner.canSwim?.(playerCell.x, playerCell.y, playerCell.z) === true;
    while (target && distance(player.pos, center(target)) < (target.action === 'swim' ? 0.48 : 0.30) &&
        (player.onGround !== false || wet || target.action === 'swim')) {
      releaseTerrain();
      state.pathIndex++; state.jumpedIndex = -1; state.progressAt = time;
      state.progressPos = { ...player.pos }; target = state.path[state.pathIndex];
    }
    if (!target) return routeComplete();
    const from = state.pathIndex ? state.path[state.pathIndex - 1] : cell(player.pos);
    if (target.breakBlocks?.length) {
      // Clear headroom first: the upper block can occlude the ray to the feet.
      const obstruction = [...target.breakBlocks].sort((a, b) => b.y - a.y).find(p => {
        const info = adapter.readCell(p.x, p.y, p.z); return !info?.known || info.solid;
      });
      if (obstruction) {
        const info = adapter.readCell(obstruction.x, obstruction.y, obstruction.z);
        if (!state.autoMine || !info?.known || !info.breakable || info.hazard) {
          return terrainFailed(from, target, 'Obstacle is no longer safe to mine');
        }
        const task = terrainTask('mine', obstruction, time);
        chooseMiningTool(task, obstruction);
        neutral();
        const aim = adapter.aimAt(obstruction.x + 0.5, obstruction.y + 0.5, obstruction.z + 0.5, 0.05);
        if (['native-camera-unresponsive', 'native-camera-not-responding'].includes(aim?.reason)) return stop('failed', aim.reason);
        const result = (aim === true || aim?.aligned) ? adapter.interact('mine', obstruction) : null;
        if (result?.reason === 'held-item-cannot-mine') return stop('failed', result.reason);
        setStatus('mining', result?.reason || 'Clearing a planned obstacle');
        if (time - task.started > task.timeout) terrainFailed(from, target, 'Obstacle cannot be mined');
        return;
      }
    }
    if (target.action === 'bridge' && bridgeTerrain(target, from, time)) return;
    releaseTerrain();
    if (state.status !== 'moving') setStatus('moving');
    const canNavigate = p => planner.canNavigate?.(p.x, p.y, p.z) ?? planner.canStand(p.x, p.y, p.z);
    if (!canNavigate(target)) return beginSearch();
    if ((player.onGround !== false || wet) &&
        (from.x !== target.x || from.y !== target.y || from.z !== target.z) &&
        !planner.validateTransition(from, target)) {
      return beginSearch();
    }
    const horizontal = Math.hypot(target.x + 0.5 - player.pos.x, target.z + 0.5 - player.pos.z);
    const swimming = wet || target.action === 'swim';
    const needsJump = ['jump', 'gap', 'mineJump'].includes(target.action) || target.y > player.pos.y + 0.5;
    const eye = adapter.eye();
    const aim = swimming && horizontal <= .22 ? { aligned: true, yaw: player.yaw, pitch: player.pitch } :
      adapter.aimAt(target.x + 0.5, eye.y, target.z + 0.5, 0.05);
    if (['native-camera-unresponsive', 'native-camera-not-responding'].includes(aim?.reason)) return stop('failed', aim.reason);
    const aligned = aim === true || aim?.aligned;
    if (aligned && needsJump && state.jumpedIndex !== state.pathIndex && player.onGround !== false &&
        horizontal < (target.action === 'gap' ? 2.4 : 1.65)) {
      state.jumpUntil = time + 150; state.jumpedIndex = state.pathIndex;
    }
    const swimUp = swimming && (target.y > player.pos.y + .08 ||
      (target.action !== 'swim' && horizontal < 1.65 && target.y >= player.pos.y - .15));
    // Native water ascent uses jump; releasing it lets gravity sink the player.
    const applied = adapter.setControls({ forward: aligned && (!swimming || horizontal > .22) ? 1 : 0,
      strafe: 0, jump: aligned && (swimming ? swimUp : time < state.jumpUntil),
      sprint: !swimming && aligned && (target.action === 'gap' || (target.action === 'walk' && horizontal > 0.8)),
      sneak: false, yaw: aim?.yaw, pitch: aim?.pitch });
    if (!applied) return stop('failed', adapter.diagnostics()?.error || 'Native input hooks unavailable');
    if (!state.progressPos || distance(player.pos, state.progressPos) > 0.18) {
      state.progressAt = time; state.progressPos = { ...player.pos };
    } else if (time - state.progressAt > (swimming ? 5000 : 2500)) {
      blockEdge(from, target);
      if (++state.retries > 6) return stop('failed', 'Stuck: no safe continuation');
      beginSearch();
    }
  }
  function breathingDetour(time) {
    const breath = adapter.swimmingState?.();
    if (!state.goal || state.breathingGoal || !breath?.inWater || breath.oxygen == null || breath.oxygen > 60) return false;
    const source = cell(state.player.pos), exits = [];
    for (let dy = 0; dy <= 16; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const point = { x: source.x + dx, y: source.y + dy, z: source.z + dz };
      const head = adapter.readCell(point.x, point.y + 1, point.z);
      if (head?.known && !head.solid && !head.hazard && !head.liquid &&
          (planner.canNavigate?.(point.x, point.y, point.z) ?? planner.canStand(point.x, point.y, point.z))) {
        exits.push({ point, cost: dy + Math.abs(dx) + Math.abs(dz) });
      }
    }
    const exit = exits.sort((a, b) => a.cost - b.cost)[0]?.point;
    if (!exit) { stop('failed', 'Low air: no known reachable surface nearby'); return true; }
    state.breathingGoal = exit; state.breathingSince = time;
    beginSearch(); return true;
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
          if (action.type === 'place' && x === action.x && z === action.z && (y === action.y || y + 1 === action.y)) continue;
          if (!(planner.canNavigate?.(x, y, z) ?? planner.canStand(x, y, z)) && !planner.canExcavate?.(x, y, z)) continue;
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
    state.action.phaseStarted = now(); state.action.actingStarted = null;
    state.action.toolChecked = false;
    state.action.remoteApproach = false;
    state.actionPhase = 'approaching'; return beginSearch(next);
  }
  function placeAnchor(action) {
    if (adapter.placementAim) {
      const aims = adapter.placementAim(action);
      return aims.length ? aims[(action.aimIndex || 0) % aims.length] : null;
    }
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
    if (info?.known && ((action.type === 'mine' && (info.air === true || info.name === 'air')) ||
        (action.type === 'place' && info.solid))) {
      return stop('idle', action.type === 'mine' ? 'Block mined (world confirmed)' : 'Block placed (world confirmed)');
    }
    if (info?.known && (info.hazard || (action.type === 'mine' && !info.breakable))) {
      return stop('failed', 'Target is hazardous or unbreakable');
    }
    if (action.remoteApproach && info?.known) {
      action.candidates = actionCandidates(action);
      if (action.candidates.length) { nextActionApproach(); return; }
    }
    if (state.search) return advanceSearch();
    if (state.path.length && state.pathIndex < state.path.length) return executePath(time);
    if (state.status === 'waiting') return;
    if (!info?.known) return waitOrFail('Target chunk is not loaded');
    if (action.actingStarted == null) action.actingStarted = time;
    if (action.type === 'mine') chooseMiningTool(action, action);
    if (time - action.actingStarted > (action.timeout || 45000)) return stop('failed', 'Action timed out / server may forbid it');
    if (action.manualBridge) {
      bridgeTerrain(action.manualBridge.target, action.manualBridge.from, time, action); return;
    }
    neutral();
    if (action.type === 'place' && !action.slot && adapter.selectBuildingBlock) {
      if (state.originalSlot == null) state.originalSlot = adapter.getSelectedSlot?.() ?? null;
      if (!adapter.selectBuildingBlock()) return stop('failed', 'No safe building blocks in the hotbar');
    }
    const aim = action.type === 'place' ? placeAnchor(action) :
      { x: action.x + 0.5, y: action.y + 0.5, z: action.z + 0.5 };
    if (!aim) {
      const from = cell(state.player.pos);
      if (action.type === 'place' && adapter.placementAim && action.y === from.y - 1 &&
          Math.abs(action.x - from.x) + Math.abs(action.z - from.z) === 1 &&
          state.player.onGround !== false && planner.canStand(from.x, from.y, from.z)) {
        action.manualBridge = { from, target: { x: action.x, y: action.y + 1, z: action.z,
          action: 'bridge', placeBlocks: [{ x: action.x, y: action.y, z: action.z }] } };
        bridgeTerrain(action.manualBridge.target, from, time, action); return;
      }
      if (nextActionApproach()) return;
      return stop('failed', 'No reachable safe face to place against');
    }
    const aligned = adapter.aimAt(aim.x, aim.y, aim.z, 0.05);
    if (['native-camera-unresponsive', 'native-camera-not-responding'].includes(aligned?.reason)) return stop('failed', aligned.reason);
    state.actionPhase = 'aiming';
    if (!(aligned === true || aligned?.aligned)) { adapter.releaseInteraction?.(); return; }
    if (action.type === 'place' && time < action.nextAt) return;
    const result = adapter.interact(action.type, action.type === 'place' ? { ...action, anchor: aim.anchor } : action);
    if (result?.reason === 'held-item-cannot-mine') return stop('failed', result.reason);
    if (result?.ok) {
      state.actionPhase = 'acting'; action.nextAt = time + 500;
      setStatus(action.type === 'mine' ? 'mining' : 'placing', 'Waiting for world confirmation');
    } else {
      setStatus(action.type === 'mine' ? 'mining' : 'placing', result?.reason || 'Waiting for native ray hit');
      if (action.type === 'place' && time >= action.nextAt) {
        action.aimIndex++; action.nextAt = time + 500;
      }
      if (time - action.phaseStarted > 2500) {
        adapter.releaseInteraction?.();
        if (!nextActionApproach()) stop('failed', result?.reason || 'No reachable visible target');
      }
    }
  }
  function goto(x, y, z) {
    const target = { x: Number(x), y: Number(y), z: Number(z) };
    if (!validGoal(target) || !prepare()) return false;
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
    if (!validGoal(target) || !prepare()) return false;
    // ClientCommands passes NaN when no optional slot was supplied.
    if (Number.isNaN(slot)) slot = null;
    if (slot != null && slot !== 0 && (!Number.isInteger(Number(slot)) || slot < 1 || slot > 9)) {
      stop('failed', 'Hotbar slot must be 1-9'); return false;
    }
    if (type === 'place' && slot && !adapter.selectSlot(Number(slot))) {
      stop('failed', 'Native hotbar selection unavailable'); return false;
    }
    const info = adapter.readCell(Math.floor(target.x), Math.floor(target.y), Math.floor(target.z));
    if (info?.known && (info.hazard || (type === 'mine' && !info.breakable && !info.air && info.name !== 'air'))) {
      stop('failed', 'Target is unloaded, hazardous or unbreakable'); return false;
    }
    state.action = { type, ...cell(target), slot: slot ? Number(slot) : null,
      started: now(), phaseStarted: now(), actingStarted: null, aimIndex: 0, nextAt: 0 };
    state.action.candidates = actionCandidates(state.action);
    if (distance(adapter.eye(), { x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 }) <= 4.2) {
      setStatus(type === 'mine' ? 'mining' : 'placing'); state.actionPhase = 'aiming'; return true;
    }
    if (nextActionApproach()) return true;
    if (!info?.known) {
      // Distant chunks become observable during travel; unknown is never air.
      const dx = state.player.pos.x - target.x - .5, dz = state.player.pos.z - target.z - .5;
      const horizontal = Math.hypot(dx, dz), scale = horizontal > 3 ? 3 / horizontal : 0;
      state.action.remoteApproach = true; state.actionPhase = 'approaching';
      return beginSearch({ x: target.x + Math.round(dx * scale), y: target.y, z: target.z + Math.round(dz * scale) });
    }
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
          if (breathingDetour(time)) {
            state.timer = setTimeout(tick, 50); return;
          }
          if (state.status === 'breathing') {
            routeComplete(); updateVisual(time); state.timer = setTimeout(tick, 50); return;
          }
          if (state.status === 'waiting' && time < state.resumeAt) {
            neutral();
            updateVisual(time);
            state.timer = setTimeout(tick, 50);
            return;
          }
          if (state.status === 'waiting' && time >= state.resumeAt) {
            if (state.action && state.action.type !== 'attack') {
              state.action.candidates = actionCandidates(state.action);
              if (!nextActionApproach()) {
                if (state.action.remoteApproach && state.goal) beginSearch();
                else waitOrFail('No safe action approach');
              }
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
          planAhead(time); updateVisual(time);
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
    setAutoPlace(value) {
      return run(() => {
        state.autoPlace = !!value;
        if (state.game && state.goal && bind(state.game)) beginSearch();
        emitState(true); return state.autoPlace;
      });
    },
    setShowPath(value) {
      state.showPath = !!value;
      try { pathRenderer?.setVisible(state.showPath); } catch (_) {}
      updateVisual(now(), true); emitState(true); return state.showPath;
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
        goal: state.goal, routeGoal: state.routeGoal, segmented: state.segmented,
        effectiveGoal: state.effectiveGoal, breathingGoal: state.breathingGoal, followTarget: state.following,
        action: state.action ? { ...state.action, candidates: undefined } : null,
        actionPhase: state.actionPhase, autoMine: state.autoMine, autoPlace: state.autoPlace, showPath: state.showPath,
        lookahead: state.lookahead, precalculating: !!state.prefetch && !state.prefetch.job.done,
        terrain: state.terrainTask ? { type: state.terrainTask.type, target: state.terrainTask.target,
          tool: state.terrainTask.tool ? { slot: state.terrainTask.tool.slot, name: state.terrainTask.tool.name,
            ticks: state.terrainTask.tool.ticks } : null, elapsed: now() - state.terrainTask.started } : null,
        path: state.path.length, pathIndex: state.pathIndex, planning: !!state.search,
        search: state.searchResult ? { ...state.searchResult, path: undefined } : null,
        retries: state.retries, blockedEdges: state.blockedEdges.size, native: adapter?.diagnostics() || null,
        visual: pathRenderer?.diagnostics() || { ready: false, reason: 'not-bound' } };
    },
    destroy() {
      stop('idle', 'Destroyed'); state.destroyed = true; clearTimeout(state.timer);
      for (const remove of listeners) remove(); adapter?.destroy();
      try { pathRenderer?.destroy(); } catch (_) {}
      pathRenderer = pathFactory = null;
      if (globalThis.Baritone === api) delete globalThis.Baritone;
    }
  };
  listen('minifeather:baritone-config', event => {
    const cfg = parse(event); if (!cfg || typeof cfg !== 'object') return;
    if ('autoMine' in cfg) api.setAutoMine(cfg.autoMine);
    if ('autoPlace' in cfg) api.setAutoPlace(cfg.autoPlace);
    if ('showPath' in cfg) api.setShowPath(cfg.showPath);
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
