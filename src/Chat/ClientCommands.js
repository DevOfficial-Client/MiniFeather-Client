(function () {
  'use strict';

  const GLOBAL_KEY = '__MINIFEATHER_CLIENT_COMMANDS__';
  const REQUEST_EVENT = 'minifeather:client-command';
  const RESPONSE_EVENT = 'minifeather:client-command-response';
  const BINDS_EVENT = 'minifeather:client-binds-config';

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  const state = {
    game: null,
    chat: null,
    originalSubmit: null,
    hookedSubmit: null,
    scanTimer: 0,
    binds: {},
    requestCounter: 0,
    destroyed: false
  };

  const RECOGNIZED = new Set(['toggle', 'bind', 'unbind', 'binds', 'afk', 'copycoord', 'waypoint', 'mf', 'verity', 'iaassistant', 'caja', 'caballo', 'horse', 'model', 'modelo', 'room', 'habitacion', 'sala', 'maternal', 'wraith', 'madre', 'stalker', 'weeping', 'baritone', 'goto', 'follow', 'p2p', 'backrooms', 'br', 'emote', 'emotes', 'face', 'facewap', 'film', 'pelicula', 'studio', 'estudio']);

  function parseDetail(event) {
    try {
      return typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch (_) {
      return null;
    }
  }

  function addChat(text, status = 'normal') {
    const chat = state.chat;
    if (!chat || typeof chat.addChat !== 'function') return;
    const color = status === 'success' ? '\\green\\' : status === 'error' ? '\\red\\' : '';
    chat.addChat({ text: `\\purple\\MiniFeather >\\reset\\ ${color}${String(text)}` });
  }

  function showHelp() {
    const lines = [
      '\\purple\\===== MiniFeather Commands =====\\reset\\',
      '\\yellow\\/toggle <module>\\reset\\ - Toggle a module',
      '\\yellow\\/bind <module> <key>\\reset\\ - Bind a module toggle',
      '\\yellow\\/unbind <module>\\reset\\ - Remove a module bind',
      '\\yellow\\/binds\\reset\\ - Show your module binds',
      '\\yellow\\/afk <5-150>\\reset\\ - Set Anti-AFK delay',
      '\\yellow\\/copycoord\\reset\\ - Copy your current coordinates',
      '\\yellow\\/waypoint add <name>\\reset\\ - Save your current position',
      '\\yellow\\/waypoint list\\reset\\ - List saved waypoints',
      '\\yellow\\/waypoint remove <name>\\reset\\ - Delete a waypoint',
      '\\yellow\\/waypoint <name>\\reset\\ - Show waypoint info',
      '\\yellow\\/verity spawn\\reset\\ - Place the IA box (right-click to open)',
      '\\yellow\\/iaassistant\\reset\\ - Same as /verity spawn',
      '\\yellow\\/verity stay\\reset\\ - Verity stays where she is',
      '\\yellow\\/verity follow\\reset\\ - Resume following',
      '\\yellow\\/verity autoreply [on|off]\\reset\\ - Reply to all chat messages',
      '\\yellow\\/verity ask <text>\\reset\\ - Talk with Verity (AI + voice)',
      '\\yellow\\/mf models\\reset\\ - List mob model replacements',
      '\\yellow\\/mf models clear\\reset\\ - Restore all mob models',
      '\\yellow\\/mf diag\\reset\\ - Dump scene diag to console (F12)',
      '\\yellow\\/caballo spawn [stay]\\reset\\ - Spawn the Minecraft horse (follows you)',
      '\\yellow\\/caballo despawn\\reset\\ - Remove the horse',
      '\\yellow\\/maternal spawn [stay]\\reset\\ - Spawn the Maternal Wraith (floating, always watching)',
      '\\yellow\\/stalker spawn\\reset\\ - Spawn the Stalker (freezes when you look at it!)',
      '\\yellow\\/model spawn <file.glb> [height] [anim] [stay]\\reset\\ - Load any GLB from models/entities/',
      '\\yellow\\/room [file.glb] [scale]\\reset\\ - Build a room around you (Backrooms! centered, floor-aligned)',
      '\\yellow\\/model list | despawn <id> | stay <id> | follow <id>\\reset\\ - Manage spawned models',
      '\\yellow\\/model anim <id> <name|stop> | anims <id> | move <id> <x y z>\\reset\\ - Anims & teleport',
      '\\yellow\\/baritone goto <x y z|waypoint>\\reset\\ - Walk to coords or waypoint',
      '\\yellow\\/baritone follow <player>\\reset\\ - Follow a player',
      '\\yellow\\/baritone stop\\reset\\ - Stop walking',
      '\\yellow\\/p2p host [code]\\reset\\ - Share your Verity (friend: /p2p join <code>)',
      '\\yellow\\/p2p join <code>\\reset\\ - See friend\\\'s Verity',
      '\\yellow\\/p2p off\\reset\\ - End the shared session',
      '\\yellow\\/emote <name>\\reset\\ - Play a custom emote (from emotes/)',
      '\\yellow\\/emote stop|list|reload\\reset\\ - Manage emotes',
      '\\yellow\\/mf help\\reset\\ - Show this help'
    ];
    for (const line of lines) state.chat?.addChat?.({ text: line });
  }

  function isGame(value) {
    return !!(value?.chat && typeof value.chat.submit === 'function' && value?.player?.pos);
  }

  function findGame() {
    // 1) PRIMERO el arbol de React: es el objeto game VIVO. Al reconectar a
    //    un mundo React crea un game nuevo con un chat nuevo — si devolvemos
    //    el cache (state.game) hookeariamos el chat viejo para siempre y
    //    ningun comando se interceptaria ("ya no me detecta el /room").
    try {
      const react = document.querySelector('#react');
      if (react) {
        for (const root of Object.values(react)) {
          const game = root?.updateQueue?.baseState?.element?.props?.game;
          if (isGame(game)) return game;
        }
      }
    } catch (_) {}

    // 2) cache propio (solo si el arbol de React no tiene game aun)
    if (isGame(state.game)) return state.game;

    const waypointGame = globalThis.__MINIFEATHER_WAYPOINTS__?.game;
    if (isGame(waypointGame)) return waypointGame;

    const roots = [];
    try {
      for (const el of document.querySelectorAll('*')) {
        for (const key of Object.getOwnPropertyNames(el)) {
          if (key.startsWith('__reactContainer$') || key.startsWith('__reactFiber$')) {
            try { roots.push(el[key]); } catch (_) {}
          }
        }
        if (roots.length >= 180) break;
      }
    } catch (_) {}

    const seen = new WeakSet();
    const queue = roots.map(value => ({ value, depth: 0 }));
    let checked = 0;

    while (queue.length && checked++ < 22000) {
      const { value, depth } = queue.shift();
      if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
      if (typeof value === 'object') {
        if (seen.has(value)) continue;
        seen.add(value);
      }

      try {
        if (isGame(value)) return value;
        if (isGame(value.game)) return value.game;
        if (isGame(value.pendingProps?.game)) return value.pendingProps.game;
        if (isGame(value.memoizedProps?.game)) return value.memoizedProps.game;
      } catch (_) {}

      if (depth >= 8) continue;
      let keys = [];
      try { keys = Reflect.ownKeys(value); } catch (_) { continue; }
      for (const key of keys) {
        if (key === 'ownerDocument' || key === 'parentNode' || key === 'parentElement') continue;
        let child;
        try { child = value[key]; } catch (_) { continue; }
        if (child && (typeof child === 'object' || typeof child === 'function')) {
          queue.push({ value: child, depth: depth + 1 });
        }
      }
    }

    return null;
  }

  function commandLineFromChat(chat) {
    const raw = String(chat?.inputValue ?? '').trimEnd();
    if (!raw) return '';
    if (chat?.isInputCommandMode) return `/${raw.replace(/^\/+/, '')}`;
    return raw.startsWith('/') ? raw : '';
  }

  function parseCommand(line) {
    const parts = String(line || '').trim().replace(/^\/+/, '').split(/\s+/).filter(Boolean);
    const command = (parts.shift() || '').toLowerCase();
    return { command, args: parts };
  }

  function shouldIntercept(line) {
    const { command, args } = parseCommand(line);
    if (!RECOGNIZED.has(command)) return false;
    // /mf: interceptar siempre (help, models, models clear...)
    if (command === 'mf') return true;
    return true;
  }

  function dispatchRequest(action, args = [], extra = {}) {
    const requestId = `mf_${Date.now()}_${++state.requestCounter}`;
    document.dispatchEvent(new CustomEvent(REQUEST_EVENT, {
      detail: JSON.stringify({ requestId, action, args, ...extra })
    }));
    return requestId;
  }

  async function copyText(text) {
    const value = String(text);
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {}

    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  function currentCoords() {
    const direct = globalThis.__MINIFEATHER_WAYPOINTS__?.getCurrentPosition?.();
    if (direct) return direct;
    const pos = state.game?.player?.pos;
    if (!pos) return null;
    if (![pos.x, pos.y, pos.z].every(value => Number.isFinite(Number(value)))) return null;
    return { x: Math.floor(Number(pos.x)), y: Math.floor(Number(pos.y)), z: Math.floor(Number(pos.z)) };
  }

  function handleWaypoint(args) {
    const api = globalThis.__MINIFEATHER_WAYPOINTS__;
    if (!api) {
      addChat('Waypoints are not ready yet.', 'error');
      return;
    }

    const action = (args[0] || '').toLowerCase();
    if (action === 'add') {
      const name = args.slice(1).join(' ').trim();
      if (!name) {
        addChat('Usage: /waypoint add <name>', 'error');
        return;
      }
      const result = api.addWaypoint(name);
      if (!result.ok) {
        const errors = {
          NAME_REQUIRED: 'Choose a waypoint name.',
          DUPLICATE_NAME: 'A waypoint with that name already exists.',
          LIMIT_REACHED: 'Waypoint limit reached.',
          NO_PLAYER: 'Player coordinates are not available yet.'
        };
        addChat(errors[result.error] || 'Could not create waypoint.', 'error');
        return;
      }
      const wp = result.waypoint;
      addChat(`Waypoint "${wp.name}" added at ${wp.x} ${wp.y} ${wp.z}.`, 'success');
      return;
    }

    if (action === 'list') {
      const list = api.getWaypoints();
      if (!list.length) {
        addChat('You do not have any saved waypoints.');
        return;
      }
      addChat(`Saved waypoints: ${list.length}`);
      list.slice(0, 12).forEach(wp => {
        const distance = api.distanceTo(wp);
        addChat(`\\yellow\\${wp.name}\\reset\\ - ${wp.x} ${wp.y} ${wp.z}${distance == null ? '' : ` - ${api.formatDistance(distance)}`}`);
      });
      if (list.length > 12) addChat(`...and ${list.length - 12} more. Open the Waypoints panel to see all.`);
      return;
    }

    if (action === 'remove' || action === 'delete') {
      const name = args.slice(1).join(' ').trim();
      if (!name) {
        addChat('Usage: /waypoint remove <name>', 'error');
        return;
      }
      const result = api.removeWaypoint(name);
      if (!result.ok) {
        addChat(`Waypoint "${name}" was not found.`, 'error');
        return;
      }
      addChat(`Waypoint "${result.waypoint.name}" removed.`, 'success');
      return;
    }

    const name = args.join(' ').trim();
    if (name) {
      const wp = api.findWaypoint(name);
      if (!wp) {
        addChat(`Waypoint "${name}" was not found.`, 'error');
        return;
      }
      const distance = api.distanceTo(wp);
      addChat(`\\yellow\\${wp.name}\\reset\\ - XYZ ${wp.x} ${wp.y} ${wp.z}${distance == null ? '' : ` - ${api.formatDistance(distance)}`}`);
      return;
    }

    addChat('Usage: /waypoint add <name> | list | remove <name>', 'error');
  }

  function handleVerity(args, forceBox = false) {
    const api = globalThis.MF_CustomModels;
    const ai = globalThis.MF_Verity;
    if (!api?.followVerity) {
      addChat('CustomModels is not ready yet.', 'error');
      return;
    }

    const action = (args[0] || 'spawn').toLowerCase();

    if (action === 'spawn') {
      // caja en el suelo; click derecho encima la abre y suelta a Verity
      if (api.spawnIaBox) {
        const id = api.spawnIaBox();
        addChat(id ? 'IA box placed. Right-click it to summon Verity!' : 'Could not place the IA box.', id ? 'success' : 'error');
      } else {
        api.followVerity();
        addChat('Verity spawned (no box).', 'success');
      }
      return;
    }

    if (action === 'despawn' || action === 'remove' || action === 'kill') {
      const ok = api.despawn('verity');
      addChat(ok ? 'Verity despawned.' : 'Verity is not spawned.', ok ? 'success' : 'error');
      return;
    }

    if (action === 'stay' || action === 'sit' || action === 'wait' || action === 'quieto') {
      if (!api.stay) { addChat('Update CustomModels first (reload).', 'error'); return; }
      const ok = api.stay('verity', true);
      addChat(ok ? 'Verity will stay there. (/verity follow to resume)' : 'Verity is not spawned.', ok ? 'success' : 'error');
      return;
    }

    if (action === 'follow' || action === 'come' || action === 'unstay') {
      if (!api.stay) { addChat('Update CustomModels first (reload).', 'error'); return; }
      const ok = api.stay('verity', false);
      addChat(ok ? 'Verity is following you again.' : 'Verity is not spawned.', ok ? 'success' : 'error');
      return;
    }

    if (action === 'autoreply' || action === 'auto') {
      const on = (args[1] || '').toLowerCase();
      if (!ai?.autoReplyChat) { addChat('VerityAI is not loaded.', 'error'); return; }
      if (on === 'on' || on === 'off' || on === '') {
        const val = on === '' ? !ai.autoReply : on === 'on';
        ai.autoReply = val;
        // mostrar las respuestas de verity en el chat del juego
        try { ai.setChatHook?.((txt) => addChat('\\aqua\\Verity: \\reset\\' + String(txt).slice(0, 200), 'normal')); } catch (_) {}
        addChat(val ? 'Verity will reply to everything you type in chat (not commands).' : 'Verity auto-reply OFF.', 'success');
      } else {
        addChat('Usage: /verity autoreply [on|off]', 'error');
      }
      return;
    }

    if (action === 'say' || action === 'ask') {
      const text = args.slice(1).join(' ').trim();
      if (!text) {
        addChat(`Usage: /verity ${action} <text>`, 'error');
        return;
      }
      if (!ai) {
        addChat('VerityAI is not loaded.', 'error');
        return;
      }
      addChat('...');
      if (action === 'say') {
        ai.say(text).catch(err => addChat(`TTS failed: ${err?.message || err}`, 'error'));
      } else {
        ai.ask(text)
          .then(reply => { if (reply) addChat(`Verity: ${reply}`, 'success'); })
          .catch(err => addChat(`AI failed: ${err?.message || err}`, 'error'));
      }
      return;
    }

    if (action === 'provider' || action === 'key' || action === 'model' || action === 'status' || action === 'api') {
      if (!ai) {
        addChat('VerityAI is not loaded.', 'error');
        return;
      }
      if (action === 'status' || (action === 'api' && !args[1])) {
        const cfg = { provider: ai.provider, model: ai.model };
        for (const [name, p] of Object.entries(ai.providers)) {
          addChat(`\\yellow\\${name}\\reset\\ - ${p.label}${p.defaultModel ? ` (default: ${p.defaultModel})` : ''}`);
        }
        addChat(`Active: \\green\\${cfg.provider} / ${cfg.model}\\reset\\`);
        return;
      }
      if (action === 'provider') {
        const name = (args[1] || '').toLowerCase();
        try {
          ai.config({ provider: name });
          addChat(`Provider: \\green\\${ai.provider}\\reset\\ (${ai.providers[name].label})`, 'success');
          if (ai.providers[name].needsKey && !ai.config({}).hasKey) {
            addChat('That provider needs an API key: /verity key <your-key>', 'error');
          }
        } catch (err) {
          addChat(err?.message || 'Invalid provider', 'error');
        }
        return;
      }
      if (action === 'key') {
        const key = args.slice(1).join(' ').trim();
        if (!key) { addChat('Usage: /verity key <api-key>', 'error'); return; }
        ai.config({ apiKey: key });
        addChat('API key saved.', 'success');
        return;
      }
      if (action === 'model') {
        const model = args.slice(1).join(' ').trim();
        if (!model) { addChat(`Usage: /verity model <name> (current: ${ai.model})`, 'error'); return; }
        ai.config({ model });
        addChat(`Model: \\green\\${ai.model}\\reset\\`, 'success');
        return;
      }
      return;
    }

    if (action === 'help') {
      for (const line of [
        '\\yellow\\/verity spawn\\reset\\ - Spawn Verity following you',
        '\\yellow\\/verity despawn\\reset\\ - Remove Verity',
        '\\yellow\\/verity say <text>\\reset\\ - Verity speaks (TTS)',
        '\\yellow\\/verity ask <text>\\reset\\ - Chat with Verity (AI + TTS)',
        '\\yellow\\/verity provider <name>\\reset\\ - puter | openrouter | glm',
        '\\yellow\\/verity key <api-key>\\reset\\ - Set the provider API key',
        '\\yellow\\/verity model <name>\\reset\\ - Set the model for the provider',
        '\\yellow\\/verity status\\reset\\ - Show AI providers and active config'
      ]) state.chat?.addChat?.({ text: line });
      return;
    }

    addChat('Usage: /verity spawn | despawn | say <t> | ask <t> | provider | key | model | status', 'error');
  }

  function execute(line) {
    const { command, args } = parseCommand(line);

    if (command === 'mf') {
      const sub = (args[0] || 'help').toLowerCase();
      if (sub === 'help' || sub === '') { showHelp(); return; }
      if (sub === 'diag') {
        const api = globalThis.MF_CustomModels;
        if (!api?.diag) { addChat('CustomModels is not ready yet.', 'error'); return; }
        try {
          const n = api.diag();
          addChat(`Diag written to console (${n} rows). Open F12 -> Console.`, 'success');
        } catch (e) {
          addChat('Diag failed: ' + (e?.message || e), 'error');
        }
        return;
      }
      if (sub === 'models') {
        const api = globalThis.MF_CustomModels;
        if (!api) { addChat('CustomModels is not ready yet.', 'error'); return; }
        const map = api.mappings || {};
        const entries = Object.entries(map);
        if (!entries.length) addChat('No mob model replacements active.', 'success');
        else {
          addChat('\\yellow\\Active mob replacements:\\reset\\', 'info');
          for (const [name, file] of entries) addChat(`  ${name} -> ${file}`, 'info');
        }
        if (sub === 'models' && (args[1] || '').toLowerCase() === 'clear') {
          api.clear();
          addChat('All mob replacements restored.', 'success');
        }
        return;
      }
      return;
    }

    if (command === 'waypoint') {
      handleWaypoint(args);
      return;
    }

    if (command === 'verity' || command === 'iaassistant') {
      handleVerity(args, command === 'iaassistant');
      return;
    }

    if (command === 'caja') {
      const api = globalThis.MF_CustomModels;
      if (!api?.spawnBox) {
        addChat('CustomModels is not ready yet.', 'error');
        return;
      }
      const action = (args[0] || 'spawn').toLowerCase();
      if (action === 'spawn') {
        const opts = {};
        if (args[1] === 'follow') { opts.followPlayer = true; opts.stopDistance = 1.6; opts.maxSpeed = 4.3; }
        const id = api.spawnBox(2, opts);
        addChat(id ? `Box spawned${opts.followPlayer ? ' and following you' : ''}.` : 'Could not spawn box.', id ? 'success' : 'error');
        return;
      }
      if (action === 'despawn' || action === 'remove') {
        const ok = api.despawn('caja');
        addChat(ok ? 'Box despawned.' : 'Box is not spawned.', ok ? 'success' : 'error');
        return;
      }
      if (action === 'open') {
        // setAnim (permanente): "open" tiene hold_on_last_frame, se queda abierta
        const ok = api.setAnim('caja', 'open');
        addChat(ok ? 'Box opening...' : 'Box is not spawned.', ok ? 'success' : 'error');
        return;
      }
      if (action === 'anim') {
        const name = args[1];
        if (!name) {
          const list = api.anims('caja');
          addChat(list ? 'Box anims: ' + list.join(', ') : 'Box is not spawned.', list ? 'success' : 'error');
          return;
        }
        const ok = api.setAnim('caja', name);
        addChat(ok ? `Anim set: ${name}` : 'No such anim (or box not spawned).', ok ? 'success' : 'error');
        return;
      }
      addChat('Usage: /caja spawn [follow] | open | anim <name> | despawn', 'error');
      return;
    }

    if (command === 'face' || command === 'facewap') {
      const api = globalThis.MF_FaceSwap;
      if (!api) { addChat('FaceSwap is not ready yet.', 'error'); return; }
      const action = (args[0] || 'help').toLowerCase();
      if (action === 'set') {
        const name = (args[1] || '').toLowerCase();
        if (!name) { addChat('Usage: /face set <name> (see /face list)', 'error'); return; }
        api.set(name).then(() => {
          addChat(`Face set: \\green\\${name}\\reset\\`, 'success');
        }).catch(e => addChat(e.message, 'error'));
        return;
      }
      if (action === 'revert' || action === 'reset') {
        const r = api.revert();
        addChat(r.ok ? 'Face reverted to original skin.' : (r.error || 'Nothing to revert.'), r.ok ? 'success' : 'error');
        return;
      }
      if (action === 'preview') {
        const name = (args[1] || '').toLowerCase();
        if (!name) { addChat('Usage: /face preview <name>', 'error'); return; }
        api.preview(name, 3000).then(() => {
          addChat(`Previewing \\green\\${name}\\reset\\ for 3s...`, 'success');
        }).catch(e => addChat(e.message, 'error'));
        return;
      }
      if (action === 'list') {
        const list = api.list();
        addChat(`Faces (${list.length}): \\yellow\\${list.join(', ')}\\reset\\`);
        return;
      }
      if (action === 'help' || action === '') {
        for (const line of [
          '\\yellow\\/face set <name>\\reset\\ - Change your face texture',
          '\\yellow\\/face preview <name>\\reset\\ - Show it for 3 seconds',
          '\\yellow\\/face revert\\reset\\ - Restore original skin',
          '\\yellow\\/face list\\reset\\ - Available faces'
        ]) state.chat?.addChat?.({ text: line });
        return;
      }
      addChat('Usage: /face set <n> | preview <n> | revert | list', 'error');
      return;
    }

    if (command === 'studio' || command === 'estudio') {
      const api = globalThis.MF_Studio;
      if (!api) { addChat('Studio is not ready yet.', 'error'); return; }
      const action = (args[0] || 'toggle').toLowerCase();
      if (action === 'open' || action === 'abrir') { api.open(); addChat('Studio opened (F1 to close).', 'success'); return; }
      if (action === 'close' || action === 'cerrar') { api.close(); addChat('Studio closed.', 'success'); return; }
      if (action === 'toggle') {
        if (api.isOpen) { api.close(); addChat('Studio closed.', 'success'); }
        else { api.open(); addChat('Studio opened (Space=play, R=rec, F1=close).', 'success'); }
        return;
      }
      if (action === 'cinema') {
        api.cinema = !api.cinema;
        addChat(`Cinema mode ${api.cinema ? 'ON (game HUD hidden)' : 'OFF'}.`, 'success');
        return;
      }
      addChat('Usage: /studio open | close | cinema', 'error');
      return;
    }

    if (command === 'film' || command === 'pelicula') {
      const api = globalThis.MF_Film;
      if (!api) { addChat('Film mode is not ready yet.', 'error'); return; }
      const action = (args[0] || 'help').toLowerCase();
      if (action === 'record' || action === 'grabar') {
        const r = api.startRecording();
        if (r.ok) addChat('Recording started (20 ticks/s). /film stop to end.', 'success');
        else addChat(r.error, 'error');
        return;
      }
      if (action === 'stop' || action === 'parar') {
        if (api.status.recording) {
          const r = api.stopRecording();
          addChat(`Recording stopped: \\green\\${r.keyframes}\\reset\\ keyframes over ${r.ticks} ticks${r.droppedTicks ? ` \\red\\(${r.droppedTicks} ticks dropped!)\\reset\\` : ''}. /film save <name> to persist.`, r.droppedTicks ? 'error' : 'success');
        } else {
          api.stopPlayback();
          api.despawnActors();
          addChat('Playback stopped and actors despawned.', 'success');
        }
        return;
      }
      if (action === 'save' || action === 'guardar') {
        const name = args.slice(1).join(' ').trim();
        const r = api.saveFilm(name || undefined);
        if (r.ok) addChat(`Saved as \\green\\${r.name}\\reset\\ (${r.keyframes} keyframes).`, 'success');
        else addChat(r.error, 'error');
        return;
      }
      if (action === 'list' || action === 'lista') {
        const list = api.listFilms();
        if (!list.length) { addChat('No saved takes. Record one with /film record.'); return; }
        addChat(`Saved takes (${list.length}):`);
        list.slice(0, 12).forEach(n => addChat(`\\yellow\\${n}\\reset\\`));
        return;
      }
      if (action === 'play' || action === 'reproducir') {
        const name = args.slice(1).join(' ').trim();
        const r = api.playFilm(name || undefined);
        if (r.ok) addChat(`Playing \\green\\${r.name}\\reset\\ (${r.ticks} ticks = ${(r.ticks / 20).toFixed(1)}s, ${r.actors} actor${r.actors === 1 ? '' : 's'}).`, 'success');
        else addChat(r.error, 'error');
        return;
      }
      if (action === 'pause' || action === 'pausa') {
        const r = api.pausePlayback();
        if (r.ok) addChat(`Paused at tick ${r.atTick}.`, 'success');
        else addChat(r.error, 'error');
        return;
      }
      if (action === 'resume' || action === 'seguir') {
        const r = api.resumePlayback();
        if (r.ok) addChat('Resumed.', 'success');
        else addChat(r.error, 'error');
        return;
      }
      if (action === 'despawn') {
        api.despawnActors();
        addChat('Actors despawned.', 'success');
        return;
      }
      if (action === 'export' || action === 'exportar') {
        const name = args.slice(1).join(' ').trim();
        const r = api.exportFilm(name || undefined);
        if (r.ok) addChat(`Exported \\green\\${r.name}.mffilm.json\\reset\\ (check downloads).`, 'success');
        else addChat(r.error, 'error');
        return;
      }
      if (action === 'delete' || action === 'borrar') {
        const name = args.slice(1).join(' ').trim();
        if (!name) { addChat('Usage: /film delete <name>', 'error'); return; }
        const r = api.deleteFilm(name);
        addChat(r.ok ? `Deleted "${name}".` : r.error, r.ok ? 'success' : 'error');
        return;
      }
      if (action === 'status' || action === 'diag') {
        const d = api.diag();
        const j = Object.entries(d.joints || {}).filter(([, v]) => v).map(([k]) => k);
        addChat(`game:${d.game ? 'ok' : 'NO'} | mesh:${d.mesh ? 'ok' : 'NO'} | joints found: \\yellow\\${j.length ? j.join(', ') : 'none'}\\reset\\ | frames:${d.framesInMemory} | takes:${d.savedFilms}`);
        return;
      }
      if (action === 'help' || action === '') {
        for (const line of [
          '\\yellow\\/film record\\reset\\ - Record your actions (20 t/s)',
          '\\yellow\\/film stop\\reset\\ - Stop recording (or stop playback)',
          '\\yellow\\/film save [name]\\reset\\ - Save the take',
          '\\yellow\\/film play [name]\\reset\\ - Replay as an actor puppet',
          '\\yellow\\/film pause | resume\\reset\\ - Control playback',
          '\\yellow\\/film list | export | delete\\reset\\ - Manage takes',
          '\\yellow\\/film despawn\\reset\\ - Remove actors',
          '\\yellow\\/film status\\reset\\ - Diagnostics'
        ]) state.chat?.addChat?.({ text: line });
        return;
      }
      addChat('Usage: /film record | stop | save | play | pause | resume | list | export | delete | despawn | status', 'error');
      return;
    }

    if (command === 'caballo' || command === 'horse') {
      const api = globalThis.MF_CustomModels;
      if (!api?.spawnHorse) {
        addChat('CustomModels is not ready yet.', 'error');
        return;
      }
      const action = (args[0] || 'spawn').toLowerCase();
      if (action === 'spawn') {
        const opts = {};
        if (args[1] === 'stay' || args[1] === 'quieto') { opts.followPlayer = false; }
        const res = api.spawnHorse(2, opts);
        addChat(res ? `Horse spawned${opts.followPlayer === false ? ' (staying)' : ' and following you'}.` : 'Could not spawn horse.', res ? 'success' : 'error');
        return;
      }
      if (action === 'despawn' || action === 'remove') {
        const ok = api.despawn('caballo');
        addChat(ok ? 'Horse despawned.' : 'Horse is not spawned.', ok ? 'success' : 'error');
        return;
      }
      if (action === 'stay' || action === 'quieto') {
        const ok = api.stay('caballo', true);
        addChat(ok ? 'Horse will stay there. (/caballo follow to resume)' : 'Horse is not spawned.', ok ? 'success' : 'error');
        return;
      }
      if (action === 'follow' || action === 'come') {
        const ok = api.stay('caballo', false);
        addChat(ok ? 'Horse is following you again.' : 'Horse is not spawned.', ok ? 'success' : 'error');
        return;
      }
      addChat('Usage: /caballo spawn [stay] | stay | follow | despawn', 'error');
      return;
    }

    if (command === 'room' || command === 'habitacion' || command === 'sala') {
      const api = globalThis.MF_CustomModels;
      if (!api?.spawn) {
        addChat('CustomModels is not ready yet.', 'error');
        return;
      }
      const action = (args[0] || 'spawn').toLowerCase();
      if (action === 'spawn' || action === 'load') {
        // /room [file.glb|scale|auto] — sin args: auto (~80 bloques)
        let file = null;
        let scale = null;
        for (const a of args.slice(1)) {
          const n = Number(a);
          if (Number.isFinite(n) && n > 0) scale = n;
          else if (/\.(glb|gltf|obj|geo\.json)$/i.test(a)) file = a;
          else if (a === 'auto') scale = null;
        }
        file = file || 'backrooms_level_0.glb';
        const pos = currentCoords();
        if (!pos) { addChat('Player coordinates are not available yet.', 'error'); return; }
        // habitacion: sin fisica, piso pegado al suelo real, centrada en ti,
        // con colision de paredes. autoSize si no se especifica escala.
        const id = api.spawn(file, pos.x, pos.y, pos.z, {
          id: 'room',
          room: true,
          autoSize: scale == null,
          scale: scale == null ? 1 : scale,
          followPlayer: false,
          lookAtPlayer: false
        });
        addChat(id ? `Room "${file}" building (size: ${scale == null ? 'auto ~80 blocks' : 'x' + scale})...` : `Could not load "${file}".`, id ? 'normal' : 'error');
        // el spawn es async: si el GLB falla en cargar, avisarlo en el chat
        // (antes el error solo iba a consola y parecia que el comando no hacia nada)
        if (id && typeof api.tryLoad === 'function') {
          api.tryLoad(file).then(ok => {
            if (!ok) addChat(`Room failed: could not load "${file}" (check console F12).`, 'error');
          }).catch(e => addChat(`Room failed: ${e?.message || e}`, 'error'));
        }
        return;
      }
      if (action === 'despawn' || action === 'remove' || action === 'exit') {
        const ok = api.despawn('room');
        addChat(ok ? 'Room despawned. Back to reality.' : 'No room is spawned.', ok ? 'success' : 'error');
        return;
      }
      if (action === 'move') {
        const nums = args.slice(1).map(Number);
        if (nums.length < 3 || nums.some(n => !Number.isFinite(n))) { addChat('Usage: /room move <x y z>', 'error'); return; }
        const ok = api.move('room', nums[0], nums[1], nums[2]);
        addChat(ok ? `Room moved to ${nums[0]} ${nums[1]} ${nums[2]}.` : 'No room is spawned.', ok ? 'success' : 'error');
        return;
      }
      addChat('Usage: /room [spawn] [file.glb] | move <x y z> | despawn', 'error');
      return;
    }

    if (command === 'model' || command === 'modelo') {
      const api = globalThis.MF_CustomModels;
      if (!api?.spawn) {
        addChat('CustomModels is not ready yet.', 'error');
        return;
      }
      const action = (args[0] || '').toLowerCase();
      if (action === 'spawn' || action === 'load' || action === 'cargar') {
        const file = args[1];
        if (!file) {
          addChat('Usage: /model spawn <file.glb> [height] [anim] [stay]', 'error');
          return;
        }
        const pos = currentCoords();
        if (!pos) {
          addChat('Player coordinates are not available yet.', 'error');
          return;
        }
        const opts = { followPlayer: true };
        // parse simple: 3er arg numero → height, 4to → anim, 'stay' en cualquier lado
        const rest = args.slice(2).map(a => a.toLowerCase());
        if (rest.includes('stay') || rest.includes('quieto')) opts.followPlayer = false;
        const h = rest.find(a => /^\d+(\.\d+)?$/.test(a));
        if (h) opts.height = parseFloat(h);
        const anim = rest.find(a => !/^stay$|^quieto$/.test(a) && !/^\d+(\.\d+)?$/.test(a));
        if (anim) { opts.anim = anim; opts.autoAnim = false; }
        const id = api.spawn(file, pos.x + 2, pos.y, pos.z, opts);
        addChat(id ? `Model "${file}" spawned${opts.height ? ` (height ${opts.height})` : ''}${anim ? ` anim "${anim}"` : ''}${opts.followPlayer === false ? ' (staying)' : ''}.` : `Could not load "${file}". Check the console for errors.`, id ? 'success' : 'error');
        return;
      }
      if (action === 'despawn' || action === 'remove') {
        const id = args[1];
        if (!id) { addChat('Usage: /model despawn <id>', 'error'); return; }
        const ok = api.despawn(id);
        addChat(ok ? `"${id}" despawned.` : `"${id}" is not spawned.`, ok ? 'success' : 'error');
        return;
      }
      if (action === 'stay' || action === 'quieto') {
        const id = args[1];
        if (!id) { addChat('Usage: /model stay <id>', 'error'); return; }
        const ok = api.stay(id, true);
        addChat(ok ? `"${id}" will stay there.` : `"${id}" is not spawned.`, ok ? 'success' : 'error');
        return;
      }
      if (action === 'follow' || action === 'come') {
        const id2 = args[1];
        if (!id2) { addChat('Usage: /model follow <id>', 'error'); return; }
        const ok = api.stay(id2, false);
        addChat(ok ? `"${id2}" is following you.` : `"${id2}" is not spawned.`, ok ? 'success' : 'error');
        return;
      }
      if (action === 'anim') {
        const id = args[1];
        const anim = args[2];
        if (!id || !anim) { addChat('Usage: /model anim <id> <animName|stop>', 'error'); return; }
        if (anim === 'stop') { api.setAnim(id, null); addChat(`Stopped anim on "${id}".`); return; }
        const ok = api.setAnim(id, anim);
        addChat(ok ? `Playing "${anim}" on "${id}".` : `Anim "${anim}" not found. Check console for available anims.`, ok ? 'success' : 'error');
        return;
      }
      if (action === 'anims' || action === 'listanim') {
        const id = args[1];
        const anims = api.anims(id);
        if (anims && anims.length) addChat(`Anims on "${id}": ${anims.join(', ')}`);
        else addChat(`No anims found on "${id}".`, 'error');
        return;
      }
      if (action === 'move') {
        const id = args[1];
        if (!id) { addChat('Usage: /model move <id> <x y z> [yaw]', 'error'); return; }
        const nums = args.slice(2).map(Number);
        if (nums.length < 3 || nums.some(n => !Number.isFinite(n))) { addChat('Usage: /model move <id> <x y z> [yaw]', 'error'); return; }
        const ok = api.move(id, nums[0], nums[1], nums[2], nums[3]);
        addChat(ok ? `"${id}" moved to ${nums[0]} ${nums[1]} ${nums[2]}.` : `"${id}" is not spawned.`, ok ? 'success' : 'error');
        return;
      }
      if (action === 'list') {
        const customs = api.listCustoms();
        const ids = Object.keys(customs);
        if (!ids.length) { addChat('No custom models spawned.'); return; }
        addChat(`Custom models: ${ids.length}`);
        ids.forEach(id => {
          const c = customs[id];
          addChat(`\\yellow\\${id}\\reset\\ - ${c.file} @ ${c.pos.x}, ${c.pos.y}, ${c.pos.z}`);
        });
        return;
      }
      addChat('Usage: /model spawn <file.glb> [height] [anim] [stay] | despawn <id> | stay <id> | follow <id> | anim <id> <name|stop> | anims <id> | move <id> <x y z> | list', 'error');
      return;
    }

    if (command === 'maternal' || command === 'wraith' || command === 'madre') {
      const api = globalThis.MF_CustomModels;
      if (!api?.spawnMaternal) {
        addChat('CustomModels is not ready yet.', 'error');
        return;
      }
      const action = (args[0] || 'spawn').toLowerCase();
      if (action === 'spawn') {
        const opts = {};
        if (args[1] === 'stay' || args[1] === 'quieto') { opts.followPlayer = false; }
        const res = api.spawnMaternal(4, opts);
        addChat(res ? `Maternal Wraith spawned${opts.followPlayer === false ? ' (staying)' : ' and floating towards you'}...` : 'Could not spawn Maternal Wraith.', res ? 'success' : 'error');
        return;
      }
      if (action === 'despawn' || action === 'remove') {
        const ok = api.despawn('maternal');
        addChat(ok ? 'Maternal Wraith despawned. Rest in peace.' : 'Maternal Wraith is not spawned.', ok ? 'success' : 'error');
        return;
      }
      if (action === 'stay' || action === 'quieto') {
        const ok = api.stay('maternal', true);
        addChat(ok ? 'Maternal Wraith holds her place... for now.' : 'Maternal Wraith is not spawned.', ok ? 'success' : 'error');
        return;
      }
      if (action === 'follow' || action === 'come') {
        const ok = api.stay('maternal', false);
        addChat(ok ? 'She is coming for you...' : 'Maternal Wraith is not spawned.', ok ? 'success' : 'error');
        return;
      }
      addChat('Usage: /maternal spawn [stay] | stay | follow | despawn', 'error');
      return;
    }

    if (command === 'stalker' || command === 'weeping') {
      const api = globalThis.MF_CustomModels;
      if (!api?.spawnStalker) {
        addChat('CustomModels is not ready yet.', 'error');
        return;
      }
      const action = (args[0] || 'spawn').toLowerCase();
      if (action === 'spawn') {
        const res = api.spawnStalker(12);
        addChat(res ? 'Stalker spawned. DO NOT BLINK.' : 'Could not spawn Stalker.', res ? 'success' : 'error');
        return;
      }
      if (action === 'despawn' || action === 'remove') {
        const ok = api.despawn('stalker');
        addChat(ok ? 'Stalker despawned.' : 'Stalker is not spawned.', ok ? 'success' : 'error');
        return;
      }
      if (action === 'stay' || action === 'quieto') {
        const ok = api.stay('stalker', true);
        addChat(ok ? 'Stalker will stay there.' : 'Stalker is not spawned.', ok ? 'success' : 'error');
        return;
      }
      if (action === 'follow' || action === 'come') {
        const ok = api.stay('stalker', false);
        addChat(ok ? 'Stalker resumed hunting you.' : 'Stalker is not spawned.', ok ? 'success' : 'error');
        return;
      }
      addChat('Usage: /stalker spawn | stay | follow | despawn', 'error');
      return;
    }

    if (command === 'baritone' || command === 'goto' || command === 'follow') {
      const api = globalThis.Baritone;
      if (!api) {
        addChat('Baritone is not ready yet.', 'error');
        return;
      }
      // /goto y /follow como atajos directos
      let action, rest;
      if (command === 'goto') { action = 'goto'; rest = args; }
      else if (command === 'follow') { action = 'follow'; rest = args; }
      else { action = (args[0] || 'status').toLowerCase(); rest = args.slice(1); }

      if (action === 'goto') {
        // coordenadas directas: /baritone goto 100 64 -200
        const nums = rest.slice(0, 3).map(Number);
        if (rest.length >= 3 && nums.every(n => Number.isFinite(n))) {
          const ok = api.goto(nums[0], nums[1], nums[2]);
          if (ok) addChat(`Walking to ${nums[0]}, ${nums[1]}, ${nums[2]}...`, 'success');
          else addChat('No path found to those coords.', 'error');
          return;
        }
        // waypoint por nombre: /baritone goto casa
        const name = rest.join(' ').trim();
        if (!name) {
          addChat('Usage: /baritone goto <x y z> | <waypoint name>', 'error');
          return;
        }
        const wpApi = globalThis.__MINIFEATHER_WAYPOINTS__;
        const wp = wpApi?.findWaypoint?.(name);
        if (!wp) {
          addChat(`Waypoint "${name}" was not found.`, 'error');
          return;
        }
        api.goto(wp.x, wp.y, wp.z);
        addChat(`Walking to "${wp.name}" (${wp.x}, ${wp.y}, ${wp.z})...`, 'success');
        return;
      }

      if (action === 'follow') {
        const username = rest.join(' ').trim();
        if (!username) {
          addChat('Usage: /baritone follow <player>', 'error');
          return;
        }
        const ok = api.follow(username);
        if (ok) addChat(`Following "${username}"...`, 'success');
        else addChat(`Player "${username}" was not found.`, 'error');
        return;
      }

      if (action === 'stop' || action === 'cancel') {
        api.stop();
        addChat('Baritone stopped.', 'success');
        return;
      }

      if (action === 'status' || action === '') {
        const st = api.status;
        addChat(st === 'moving' ? `Baritone: ${st}` : `Baritone: ${st || 'idle'}`);
        return;
      }

      addChat('Usage: /baritone goto <x y z|waypoint> | follow <player> | stop | status', 'error');
      return;
    }

    if (command === 'backrooms' || command === 'br') {
      const api = globalThis.MF_Backrooms;
      if (!api) { addChat('Backrooms module is not ready yet.', 'error'); return; }
      const arg = (args[0] || '').toLowerCase();
      if (!arg || ['0', '1', '2', '324', 'pool', 'grass'].includes(arg)) {
        const lvl = arg || '0';
        api.enter(lvl).then(() => {
          addChat(`You noclipped into the Backrooms: ${lvl}. F=flashlight, G=event, exit with /br exit`, 'success');
        }).catch(e => addChat(String(e?.message || e), 'error'));
        return;
      }
      if (arg === 'exit' || arg === 'salir' || arg === 'off') {
        api.exit();
        addChat('Back to reality.', 'success');
        return;
      }
      if (arg === 'noclip') {
        api.noclip();
        addChat('Falling...', 'success');
        return;
      }
      if (arg === 'spawn') {
        const t = (args[1] || '').toLowerCase();
        if (!['smiler', 'skinwalker', 'walker'].includes(t)) { addChat('Usage: /br spawn <smiler|skinwalker|walker>', 'error'); return; }
        const ok = api.spawnEnt(t);
        addChat(ok ? `${t} spawned nearby.` : `Could not spawn (need a level active).`, ok ? 'success' : 'error');
        return;
      }
      if (arg === 'event' || arg === 'evento') {
        if (!api.active) { addChat('Enter a level first: /br', 'error'); return; }
        api.event();
        return;
      }
      if (arg === 'levels' || arg === 'niveles') {
        addChat('Levels: ' + api.levels.join(', ') + ' — /br <level> | noclip | spawn <ent> | event | exit', 'normal');
        return;
      }
      addChat('Usage: /backrooms [0|1|2|324|pool|grass|noclip|spawn <ent>|event|exit]', 'error');
      return;
    }

    if (command === 'p2p') {
      const api = globalThis.MF_Peer;
      if (!api) {
        addChat('P2P module is not ready yet.', 'error');
        return;
      }
      const action = (args[0] || 'status').toLowerCase();
      if (action === 'host') {
        const code = args[1];
        api.host(code).then(id => {
          if (!id) { addChat('Could not create the room (check console).', 'error'); return; }
          addChat(`Room created! Your friend joins with: /p2p join ${id}`, 'success');
          addChat('(also printed in console — copy it from there)');
        });
        return;
      }
      if (action === 'join') {
        const code = args[1];
        if (!code) { addChat('Usage: /p2p join <code>', 'error'); return; }
        api.join(code);
        addChat(`Connecting to room ${code}...`, 'success');
        return;
      }
      if (action === 'off' || action === 'stop') {
        api.off();
        addChat('P2P session ended.', 'success');
        return;
      }
      // status
      const st = api.status;
      const role = api.role ? ` (${api.role})` : '';
      addChat(st === 'off' ? 'P2P: off — use /p2p host or /p2p join <code>' : `P2P: ${st}${role}`);
      return;
    }

    if (command === 'emote' || command === 'emotes') {
      const api = globalThis.MF_Emotes;
      if (!api) { addChat('Emotes is not ready yet.', 'error'); return; }
      const action = (args[0] || '').toLowerCase();
      if (action === 'stop' || action === 'parar') {
        api.stop();
        addChat('Emote stopped.', 'success');
        return;
      }
      if (action === 'list' || action === 'lista') {
        const names = api.list();
        if (!names.length) { addChat('No emotes loaded. Use /emote reload.', 'normal'); return; }
        addChat(`Emotes: ${names.join(', ')}`);
        return;
      }
      if (action === 'reload' || action === 'recargar') {
        // el cache vive en MF_Emotes; recargar = descartar y volver a pedir
        api.stop();
        try { delete globalThis.MF_Emotes; } catch (_) {}
        location.reload();
        return;
      }
      if (action === 'debug') {
        let d;
        try { d = api.dumpSkeleton(); } catch (err) { d = { ok: false, error: String(err?.message || err) }; }
        if (!d.ok) { addChat(`Skeleton dump failed: ${d.error}`, 'error'); return; }
        addChat(`mesh=${d.meshClass} skeleton=${d.hasSkeleton ? `yes @ [${d.skeletonPos}]` : 'no'} | posScale=${d.posScale} (1/16=${d.assumedScale116})`, 'normal');
        for (const [jn, info] of Object.entries(d.keyJoints)) {
          addChat(`  ${jn}: ${info.found ? `[${info.pos}] rot[${info.rot}]` : 'NOT FOUND'}`, 'normal');
        }
        console.log('[MF Emotes] skeleton tree:', d.tree);
        return;
      }
      if (!action) {
        addChat(`Playing: ${api.playing || 'none'}. Usage: /emote <name> | stop | list | reload | debug`, 'normal');
        return;
      }
      // nombre con espacios: /emote sit adorably == /emote "Sit Adorably"
      const name = action === 'stop' || action === 'parar' || action === 'list' || action === 'lista' || action === 'reload' || action === 'recargar'
        ? action
        : args.join(' ');
      api.load(name).then(res => {
        if (!res.ok) {
          const errs = {
            parse: 'invalid .emotecraft file (check console F12)',
            'sin-partes': 'the file has no animatable parts'
          };
          addChat(`Could not load "${name}": ${errs[res.error] || res.error}`, 'error');
          return;
        }
        const p = api.play(name);
        if (!p.ok) {
          const errs = {
            'no-mesh': 'player mesh not found (join a world first)',
            'no-joints': 'player joints not found in the mesh',
            'no-hook': 'could not hook the player mesh render'
          };
          addChat(`Could not play "${name}": ${errs[p.error] || p.error}`, 'error');
          return;
        }
        addChat(`Emote "${name}"${res.name ? ` (${res.name})` : ''}${p.loop ? ' looping' : ` (${(p.endTick / 20).toFixed(1)}s)`}. Parts: ${p.parts.join(', ')}`, 'success');
      });
      return;
    }

    if (command === 'copycoord') {
      const coords = currentCoords();
      if (!coords) {
        addChat('Player coordinates are not available yet.', 'error');
        return;
      }
      const text = `${coords.x} ${coords.y} ${coords.z}`;
      copyText(text).then(ok => {
        addChat(ok ? `Coordinates copied: ${text}` : `Coordinates: ${text}`, ok ? 'success' : 'normal');
      });
      return;
    }

    dispatchRequest(command, args);
  }

  function installHook(game) {
    const chat = game?.chat;
    if (!chat || typeof chat.submit !== 'function') return false;
    state.game = game;
    state.chat = chat;
    state.originalSubmit = null;
    state.hookedSubmit = null;
    return true;
  }

  function scan() {
    if (state.destroyed) return;
    const game = findGame();
    if (game) installHook(game);
  }

  function handleResponse(event) {
    const response = parseDetail(event);
    if (!response || !Array.isArray(response.messages)) return;
    for (const item of response.messages) {
      if (typeof item === 'string') addChat(item);
      else if (item && typeof item === 'object') addChat(item.text, item.status);
    }
  }

  function handleBinds(event) {
    const payload = parseDetail(event);
    state.binds = payload?.binds && typeof payload.binds === 'object' ? { ...payload.binds } : {};
  }

  function isTyping() {
    if (state.chat?.showInput || state.chat?.inputOpen) return true;
    const active = document.activeElement;
    return !!(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable));
  }

  function onKeyDown(event) {
    if (event.repeat) return;

    if (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter') {
      const chat = state.chat;
      if (chat) {
        const line = commandLineFromChat(chat);
        if (line && shouldIntercept(line)) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          try {
            if (chat.inputHistory?.[0] !== line) chat.inputHistory.unshift(line);
            chat.inputHistoryIndex = 0;
          } catch (_) {}
          execute(line);
          try { chat.setInputValue?.(''); } catch (_) { try { chat.inputValue = ''; } catch (_) {} }
          try { chat.closeInput?.(); } catch (_) {}
          return;
        }
      }
    }

    if (isTyping()) return;
    const code = String(event.code || '');
    if (!code) return;
    for (const [module, bindCode] of Object.entries(state.binds)) {
      if (String(bindCode) !== code) continue;
      dispatchRequest('toggle', [module], { source: 'bind' });
      break;
    }
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    clearInterval(state.scanTimer);
    document.removeEventListener(RESPONSE_EVENT, handleResponse);
    document.removeEventListener(BINDS_EVENT, handleBinds);
    window.removeEventListener('keydown', onKeyDown, true);
    if (globalThis[GLOBAL_KEY]?.destroy === destroy) delete globalThis[GLOBAL_KEY];
  }

  document.addEventListener(RESPONSE_EVENT, handleResponse);
  document.addEventListener(BINDS_EVENT, handleBinds);
  window.addEventListener('keydown', onKeyDown, true);

  state.scanTimer = window.setInterval(scan, 1600);
  scan();

  globalThis[GLOBAL_KEY] = {
    get game() { return state.game; },
    get chat() { return state.chat; },
    get installed() { return !!state.chat; },
    execute,
    showHelp,
    destroy
  };
})();
