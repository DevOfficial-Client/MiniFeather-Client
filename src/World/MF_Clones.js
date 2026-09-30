(function () {
    'use strict';

    if (window.__MF_CLONES__) return;

    const TAG = 'minifeather clones';
    const PREF_KEY = 'minifeather.clones.count';
    const MAX_CLONES = 3;
    const CLONE_IDS = [-2147483639, -2147483638, -2147483637];
    const RING_RADIUS = 3.5;
    const REPOSITION_DISTANCE = 20;
    const SYNC_INTERVAL_MS = 1500;

    const state = {
        count: loadPreference(),
        game: null,
        manager: null,
        world: null,
        clones: new Map(),
        lastBroadcastAt: 0,
        remoteClones: new Map(),
        lastCenter: null
    };

    function loadPreference() {
        try {
            const raw = Number(localStorage.getItem(PREF_KEY));
            return Number.isFinite(raw) ? Math.max(0, Math.min(MAX_CLONES, Math.floor(raw))) : 0;
        } catch (_) {
            return 0;
        }
    }

    function savePreference() {
        try {
            localStorage.setItem(PREF_KEY, String(state.count));
        } catch (_) {}
    }

    function looksLikeEntityManager(value) {
        return !!(value && typeof value === 'object' &&
            typeof value.addEntity === 'function' &&
            typeof value.spawnPlayer === 'function' &&
            typeof value.addLocalEntity === 'function');
    }

    function resolveManager() {
        if (looksLikeEntityManager(state.manager)) return state.manager;
        const namespace = globalThis.__MINIFEATHER_LOCAL_GAMES__?.state?.moduleNamespace;
        if (!namespace || typeof namespace !== 'object') return null;
        try {
            for (const value of Object.values(namespace)) {
                if (looksLikeEntityManager(value)) {
                    state.manager = value;
                    return value;
                }
            }
        } catch (_) {}
        return null;
    }

    function isLiveGame(game) {
        return !!(game?.player?.pos && game?.world?.entities);
    }

    function findGame() {
        if (isLiveGame(state.game)) return state.game;
        state.game = globalThis.miniblox || null;
        return isLiveGame(state.game) ? state.game : null;
    }

  function playerProfile(game) {
    const mf = globalThis.__MINIFEATHER_LOCAL_GAMES__?.getProfile?.();
    const profile = game?.player?.profile || {};
    const cosmetics = profile.cosmetics || {};
    return {
      name: String(mf?.name || profile.username || profile.name || "Player"),
      uuid: String(mf?.uuid || profile.uuid || ""),
      skin: String(mf?.skin || cosmetics.skin || profile.skin || "bob"),
      cape: String(mf?.cosmetics?.cape || cosmetics.cape || "none"),
      hat: String(mf?.cosmetics?.hat || cosmetics.hat || "none"),
      trail: String(mf?.cosmetics?.trail || cosmetics.trail || "none"),
      aura: String(mf?.cosmetics?.aura || cosmetics.aura || "none"),
      rank: String(mf?.rank || profile.rank || ""),
      mode: String(profile.mode || "survival"),
      discordBoosting: profile.discordBoosting === true
    };
  }

  // El clon nace EXACTAMENTE donde esta el jugador, mirando donde mira.
  function cloneSlot(index, count, origin) {
    return { x: origin.x, y: origin.y, z: origin.z, yaw: Number(origin.yaw) || 0 };
  }

    function despawnClone(id) {
        const world = state.world;
        state.clones.delete(id);
        try { world?.removeEntityFromWorld?.(id); } catch (_) {}
        try {
            if (world?.entities?.get?.(id)) world.removeEntity?.(world.entities.get(id));
        } catch (_) {}
    }

    function spawnClone(index, count, game) {
        const world = game.world;
        const id = CLONE_IDS[index];

        try {
            const existing = world.getEntityIncludingQueued?.(id) || world.entities?.get?.(id);
            if (existing) {
                state.clones.set(id, existing);
                return existing;
            }
        } catch (_) {}

        const manager = resolveManager();
        if (!manager) return null;

        const profile = playerProfile(game);
        const slot = cloneSlot(index, count, { ...game.player.pos, yaw: Number(game.player.yaw) || 0 });

        try {
            manager.spawnPlayer({
                socketId: (profile.uuid || 'minifeather-clone') + '-clone-' + index,
                id,
                name: profile.name,
                pos: { x: slot.x, y: slot.y, z: slot.z },
                yaw: slot.yaw,
                pitch: 0,
                gamemode: profile.mode,
                cosmetics: {
                    skin: profile.skin,
                    cape: profile.cape,
                    hat: profile.hat,
                    trail: profile.trail,
                    aura: profile.aura
                },
                rank: profile.rank,
                discordBoosting: profile.discordBoosting
            });
        } catch (error) {
            console.warn(TAG, 'clone spawn failed:', error?.message || error);
            return null;
        }

        const entity = world.getEntityIncludingQueued?.(id) || world.entities?.get?.(id) || null;
        if (entity) state.clones.set(id, entity);
        return entity;
    }

    function removeAll() {
        for (const id of Array.from(state.clones.keys())) despawnClone(id);
        state.clones.clear();
    }

    function dispatchChanged() {
        document.dispatchEvent(new CustomEvent('mf:clones-changed', {
            detail: { count: state.count }
        }));
    }

    function sync() {
        const cap = globalThis.__MINIFEATHER_LOCAL_GAMES__?.active ? MAX_CLONES : 1;
        const effective = Math.min(state.count, cap);
        if (state.count <= 0) {
            if (state.clones.size) removeAll();
            state.lastCenter = null;
            return;
        }

        const game = findGame();
        if (!isLiveGame(game)) return;
        state.game = game;

        if (state.world && state.world !== game.world) {
            state.clones.clear();
            state.lastCenter = null;
        }
        state.world = game.world;

        if (!resolveManager()) return;

        const player = game.player;
        const origin = {
            x: Number(player.pos.x),
            y: Number(player.pos.y),
            z: Number(player.pos.z)
        };

        let changed = false;

        // retirar los que sobran al bajar el conteo
        for (const id of Array.from(state.clones.keys())) {
            if (!CLONE_IDS.slice(0, effective).includes(id)) {
                despawnClone(id);
                changed = true;
            }
        }

        // spawn de los que faltan
        for (let i = 0; i < effective; i++) {
            if (!state.clones.has(CLONE_IDS[i])) {
                if (spawnClone(i, effective, game)) changed = true;
            }
        }

        // reposicionar cuando el jugador se aleja del anillo
        const movedFar = !state.lastCenter ||
            Math.hypot(origin.x - state.lastCenter.x, origin.z - state.lastCenter.z) > REPOSITION_DISTANCE;
        if (movedFar) {
            for (let i = 0; i < effective; i++) {
                const entity = state.clones.get(CLONE_IDS[i]);
                if (!entity) continue;
                const slot = cloneSlot(i, effective, { ...origin, yaw: Number(player.yaw) || 0 });
                try {
                    entity.serverPos?.set?.(slot.x * 32, slot.y * 32, slot.z * 32);
                    entity.setPositionAndRotation2?.(slot.x, slot.y, slot.z, slot.yaw, 0, 2);
                } catch (_) {}
            }
        }
        state.lastCenter = origin;

        if (changed) dispatchChanged();
        broadcastClones();
    }

    function remoteCloneId(key) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < key.length; i++) {
            hash ^= key.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return -(hash & 0x7fffffff) - 1;
    }

  // Recepcion P2P: el clon de otro MiniFeather player (mismo skin/nombre).
  function receiveClone(key, data) {
    if (!key || !data || typeof data !== "object") return;
    const entry = state.remoteClones.get(key) || { entity: null, id: remoteCloneId("mfclone:" + key) };
    entry.name = String(data.name || "Player").slice(0, 24);
    entry.skin = String(data.skin || "bob").slice(0, 32);
    entry.rank = String(data.rank || "");
    entry.slot = data.clones && data.clones[0] ? {
      x: Number(data.clones[0].x),
      y: Number(data.clones[0].y),
      z: Number(data.clones[0].z),
      yaw: Number(data.clones[0].yaw) || 0
    } : null;
    entry.at = Date.now();
    if (!entry.slot || ![entry.slot.x, entry.slot.y, entry.slot.z].every(Number.isFinite)) return;
    state.remoteClones.set(key, entry);
    syncRemoteClones();
  }

  function syncRemoteClones() {
    const game = findGame();
    if (!isLiveGame(game)) return;
    const world = game.world;
    const manager = resolveManager();
    if (!manager) return;

    const now = Date.now();
    for (const [key, entry] of state.remoteClones) {
      if (now - entry.at > 10000) {
        if (entry.entity) {
          try { world.removeEntityFromWorld?.(entry.id); } catch (_) {}
          try { if (world.entities?.get?.(entry.id) === entry.entity) world.removeEntity?.(entry.entity); } catch (_) {}
        }
        state.remoteClones.delete(key);
      }
    }

    for (const entry of state.remoteClones.values()) {
      let entity = entry.entity;
      try {
        if (!entity || world.entities?.get?.(entry.id) !== entity) {
          manager.spawnPlayer({
            socketId: "remote-clone-" + entry.id,
            id: entry.id,
            name: entry.name,
            pos: { x: entry.slot.x, y: entry.slot.y, z: entry.slot.z },
            yaw: entry.slot.yaw,
            pitch: 0,
            gamemode: "survival",
            cosmetics: { skin: entry.skin, cape: "none", hat: "none", trail: "none", aura: "none" },
            rank: entry.rank,
            discordBoosting: false
          });
          entity = world.getEntityIncludingQueued?.(entry.id) || world.entities?.get?.(entry.id) || null;
          entry.entity = entity;
        }
        if (entity) {
          entity.serverPos?.set?.(entry.slot.x * 32, entry.slot.y * 32, entry.slot.z * 32);
          entity.setPositionAndRotation2?.(entry.slot.x, entry.slot.y, entry.slot.z, entry.slot.yaw, 0, 2);
          if (entity.mesh) entity.mesh.visible = true;
        }
      } catch (_) {}
    }
  }

  function myCloneKey() {
    const profile = playerProfile(findGame());
    return profile.uuid || profile.name;
  }

  // Emision P2P del clon propio (1 en servidores normales) por mesh y peer.
  function broadcastClones() {
    const now = Date.now();
    if (now - state.lastBroadcastAt < 3000) return;
    state.lastBroadcastAt = now;

    const clones = list().slice(0, 1);
    const profile = playerProfile(findGame());
    const payload = {
      t: "clone",
      key: myCloneKey(),
      name: profile.name,
      skin: profile.skin,
      rank: profile.rank,
      count: clones.length,
      clones: clones.map(clone => ({ x: clone.x, y: clone.y, z: clone.z, yaw: clone.yaw }))
    };

    try { if (globalThis.MF_Mesh?.connected > 0) globalThis.MF_Mesh.broadcast?.(payload); } catch (_) {}
    try { if (globalThis.MF_Peer?.connected) globalThis.MF_Peer.sendStudio?.(payload); } catch (_) {}
  }

    function setCount(value) {
        const next = Math.max(0, Math.min(MAX_CLONES, Math.floor(Number(value) || 0)));
        state.count = next;
        savePreference();
        sync();
        dispatchChanged();
        return next;
    }

    // Posiciones en MUNDO para el P2P de LocalGames (origen se resta alla).
    function list() {
        const out = [];
        for (let i = 0; i < Math.min(state.count, state.effective ?? state.count); i++) {
            const entity = state.clones.get(CLONE_IDS[i]);
            if (!entity?.pos) continue;
            out.push({
                index: i,
                id: CLONE_IDS[i],
                x: Number(entity.pos.x) || 0,
                y: Number(entity.pos.y) || 0,
                z: Number(entity.pos.z) || 0,
                yaw: Number(entity.yaw) || 0
            });
        }
        return out;
    }

    setInterval(sync, SYNC_INTERVAL_MS);

    window.MF_Clones = {
        MAX: MAX_CLONES,
        setCount,
        get count() {
            return state.count;
        },
        list() {
            return list();
        }
    };

    window.__MF_CLONES__ = true;
})();
