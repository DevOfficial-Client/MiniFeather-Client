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

  const RECOGNIZED = new Set(['toggle', 'bind', 'unbind', 'binds', 'afk', 'copycoord', 'waypoint', 'mf', 'verity', 'iaassistant', 'caja', 'caballo', 'horse', 'model', 'modelo', 'room', 'habitacion', 'sala', 'maternal', 'wraith', 'madre', 'stalker', 'weeping', 'idlebot', 'idleplayer', 'baritone', 'goto', 'follow', 'p2p', 'mesh', 'call', 'llamar', 'g', 'global', 'backrooms', 'br', 'emote', 'emotes', 'face', 'facewap', 'film', 'pelicula', 'studio', 'estudio', 'baby', 'spider', 'arana', 'araña', 'pscale', 'panchor', 'plarge', 'critter', 'critters', 'cac', 'bicho', 'bichos', 'animal', 'animales']);

  function parseDetail(event) {
    try {
      return typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch (_) {
      return null;
    }
  }

  function translateChat(text) {
    const value = String(text ?? '');
    const i18n = globalThis.MiniFeatherI18n;
    if (typeof i18n?.translateInline === 'function') return i18n.translateInline(value);
    if (typeof i18n?.translate === 'function') return i18n.translate(value);
    return value;
  }

  function addChat(text, status = 'normal') {
    const chat = state.chat;
    if (!chat || typeof chat.addChat !== 'function') return;
    const color = status === 'success' ? '\\green\\' : status === 'error' ? '\\red\\' : '';
    chat.addChat({ text: `\\purple\\MiniFeather >\\reset\\ ${color}${translateChat(text)}` });
  }

  function showHelp() {
    const lines = [
      '\\purple\\===== MiniFeather Commands =====\\reset\\',
      '\\yellow\\/toggle <module>\\reset\\ - Toggle a module',
      '\\yellow\\/bind <module> <key>\\reset\\ - Bind a module toggle',
      '\\yellow\\/unbind <module>\\reset\\ - Remove a module bind',
      '\\yellow\\/binds\\reset\\ - Show your module binds',
      '\\yellow\\/pscale <0.01-5>\\reset\\ - Player size (micro/tiny/normal/titan)',
      '\\yellow\\/plarge <0.3-3>\\reset\\ - Player width (slim/normal/fat)',
      '\\yellow\\/panchor <-1.5-1.5>\\reset\\ - Fix feet to ground (0 = reset)',
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
      '\\yellow\\/critter spawn <species> [n]\\reset\\ - Spawn critters & companions (otters, ferrets, red pandas...)',
      '\\yellow\\/critter random | list | count | clear\\reset\\ - Random spawn, list species, count, remove all',
      '\\yellow\\/maternal spawn [stay]\\reset\\ - Spawn the Maternal Wraith (floating, always watching)',
      '\\yellow\\/stalker spawn\\reset\\ - Spawn the Stalker (freezes when you look at it!)',
      '\\yellow\\/model spawn <file.glb> [height] [anim] [stay]\\reset\\ - Load any GLB from models/entities/',
      '\\yellow\\/room [file.glb] [scale]\\reset\\ - Build a room around you (Backrooms! centered, floor-aligned)',
      '\\yellow\\/model list | despawn <id> | stay <id> | follow <id>\\reset\\ - Manage spawned models',
      '\\yellow\\/model anim <id> <name|stop> | anims <id> | move <id> <x y z>\\reset\\ - Anims & teleport',
      '\\yellow\\/idlebot join [invite|server]\\reset\\ - Connect one server-visible guest that stands still',
      '\\yellow\\/idlebot leave | status\\reset\\ - Disconnect or inspect the idle guest',
      '\\yellow\\/baritone goto <x y z|waypoint>\\reset\\ - Walk to coords or waypoint',
      '\\yellow\\/baritone follow <player>\\reset\\ - Follow a player',
      '\\yellow\\/baritone mine <x y z> | place <x y z> [slot]\\reset\\ - Mine or place a block',
      '\\yellow\\/baritone attack <player> | jump\\reset\\ - Chase/attack or jump',
      '\\yellow\\/baritone locate <player> | players\\reset\\ - Show live/last known positions',
      '\\yellow\\/baritone automine <on|off>\\reset\\ - Mine blocks that obstruct a route',
      '\\yellow\\/baritone stop\\reset\\ - Stop walking',
      '\\yellow\\/g <message>\\reset\\ - Send to the MiniFeather global chat (all clients + Discord)',
      '\\yellow\\/p2p host [code]\\reset\\ - Share your Verity (friend: /p2p join <code>)',
      '\\yellow\\/p2p join <code>\\reset\\ - See friend\\\'s Verity',
      '\\yellow\\/p2p off\\reset\\ - End the shared session',
      '\\yellow\\/p2p auto [on|off]\\reset\\ - Auto-share room code to chat + auto-join',
      '\\yellow\\/mesh on | announce | connect <code>\\reset\\ - Sync Titan & Tiny with MiniFeather peers',
      '\\yellow\\/call on|off|status|<friend>|answer|decline|end|mute\\reset\\ - MiniFeather voice calls',
      '\\yellow\\/emote <name>\\reset\\ - Play a custom emote (from emotes/)',
      '\\yellow\\/emote stop|list|reload\\reset\\ - Manage emotes',
      '\\yellow\\/mf help\\reset\\ - Show this help'
    ];
    for (const line of lines) state.chat?.addChat?.({ text: translateChat(line) });
  }

  function isGame(value) {
    return !!(value?.chat && typeof value.chat.submit === 'function' && value?.player?.pos);
  }

  function findGame() {
    
    try {
      const react = document.querySelector('#react');
      if (react) {
        for (const root of Object.values(react)) {
          const game = root?.updateQueue?.baseState?.element?.props?.game;
          if (isGame(game)) return game;
        }
      }
    } catch (_) {}

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

    if (command === 'baby') {
      const api = globalThis.__MINIFEATHER_TINY_TAKEOVER__;
      if (!api) { addChat('TinyTakeover is not ready yet.', 'error'); return; }
      const action = (args[0] || 'help').toLowerCase();
      if (action === 'spawn') {
        const type = (args[1] || 'wolf').toLowerCase();
        if (!api.types.includes(type)) { addChat('Unknown baby type. Available: ' + api.types.join(', '), 'error'); return; }
        const name = (args[2] || type + '_' + Math.floor(Math.random() * 1000)).toLowerCase();
        const ok = api.spawn(name, type);
        if (!ok) { addChat('Could not spawn (name in use?).', 'error'); return; }
        addChat(`Baby ${type} spawned${type === 'wolf' ? ' \u00a1lobezno!' : ''}. Follows you around.`, 'success');
        
        setTimeout(() => {
          try {
            const d = api.debug();
            void 0;
            if (!d.rigs) addChat('Warning: rig not created (see console).', 'error');
          } catch (e) { console.warn('[MiniFeather /baby] debug failed', e); }
        }, 1500);
        return;
      }
      if (action === 'despawn' || action === 'remove') {
        const name = (args[1] || '').toLowerCase();
        const ok = name === 'all' ? api.despawnAll() : api.despawn(name);
        addChat(ok ? 'Baby removed.' : 'No such baby (see /baby list).', ok ? 'success' : 'error');
        return;
      }
      if (action === 'sit') {
        const name = (args[1] || '').toLowerCase();
        const ok = api.sit(name);
        addChat(ok ? 'Toggled sit.' : 'No such baby.', ok ? 'success' : 'error');
        return;
      }
      if (action === 'list') {
        const list = api.list();
        if (!list.length) addChat('No client-side babies spawned.', 'success');
        else for (const b of list) addChat(`  ${b.name} (${b.type})${b.sitting ? ' [sitting]' : ''} @ ${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}, ${b.pos.z.toFixed(1)}`, 'info');
        return;
      }
      if (action === 'help' || action === '') {
        for (const line of [
          '\\yellow\\/baby spawn <type> [name]\\reset\\ - Spawn a client-side baby (default: wolf)',
          '\\yellow\\/baby despawn <name|all>\\reset\\ - Remove babies',
          '\\yellow\\/baby sit <name>\\reset\\ - Toggle sitting',
          '\\yellow\\/baby list\\reset\\ - Spawned babies',
          'Types: \\yellow\\' + api.types.join(', ') + '\\reset\\'
        ]) state.chat?.addChat?.({ text: line });
        return;
      }
      return;
    }

    if (command === 'spider' || command === 'arana' || command === 'araña') {
      
      void (async () => {
      const api = globalThis.MF_SPIDER_BOT;
      if (!api) { addChat('SpiderBot is not ready yet (reload page).', 'error'); return; }
      const action = (args[0] || 'help').toLowerCase();
      if (action === 'spawn') {
        
        const preset = (args[1] || 'hexbot').toLowerCase();
        let gallop = false;
        let scale;
        for (let i = 2; i < args.length; i++) {
          const t = args[i].toLowerCase();
          if (t === 'gallop') gallop = true;
          else if (t === 'scale' || t === 'altura') {
            const v = parseFloat(args[i + 1]);
            if (Number.isFinite(v)) { scale = Math.max(1, Math.min(200, v)); i++; }
          }
        }
        const r = await api.send({ type: 'spawn', preset, gallop, scale });
        if (!r.ok) { addChat(r.error || 'SpiderSim not loaded.', 'error'); return; }
        api.enable(true);
        addChat(`Spawn requested: ${preset}${scale ? ` (body height: ${scale} blocks)` : ''}${gallop ? ' gallop' : ''} (embedded simulator).`, 'success');
        return;
      }
      if (action === 'auto') {
        const sub = (args[1] || '').toLowerCase();
        if (sub !== 'on' && sub !== 'off') {
          const cur = (localStorage.getItem('mf_spider_auto') || 'off') === 'on';
          addChat(`Usage: /spider auto on|off — spawn spiders on startup (currently ${cur ? 'ON' : 'OFF'}).`, 'error');
          return;
        }
        localStorage.setItem('mf_spider_auto', sub);
        addChat(sub === 'on'
          ? 'Spiders will spawn on startup.'
          : 'No spiders on startup — use /spider spawn when you want one.', 'success');
        return;
      }
      if (action === 'body' || action === 'cuerpo') {
        const sub = (args[1] || '').toLowerCase();
        if (sub !== 'on' && sub !== 'off') {
          addChat('Usage: /spider body on|off — toggle the spider torso (off = legs only).', 'error');
          return;
        }
        const r = api.body(sub === 'on');
        addChat(r.legsOnly ? 'Torso hidden — legs only.' : 'Torso visible again.', 'success');
        return;
      }
      if (action === 'target' || action === 'laser') {
        
        const player = state.game?.player;
        if (!player?.pos) { addChat('No player position.', 'error'); return; }
        const yaw = Number(player.yaw) || 0;
        const x = Number(player.pos.x) + Math.sin(yaw) * 8;
        const z = Number(player.pos.z) + Math.cos(yaw) * 8;
        const r = await api.target(x, Number(player.pos.y) || 64, z);
        addChat(r.ok ? 'Laser on! Guiding nearest spider.' : r.error, r.ok ? 'success' : 'error');
        return;
      }
      if (action === 'staystill' || action === 'stop') {
        const r = await api.staystill();
        addChat(r.ok ? 'Spiders stopped.' : r.error, r.ok ? 'success' : 'error');
        return;
      }
      if (action === 'follow') {
        
        const arg = (args[1] || '').toLowerCase();
        if (arg === 'off' || arg === 'stop') {
          const r = await api.send({ type: 'follow', off: true });
          addChat(r.ok ? 'Spiders no longer following you.' : r.error, r.ok ? 'success' : 'error');
        } else {
          const dist = parseFloat(arg);
          const n = api.list().length;
          if (!n) { addChat('No spiders yet (spawn one with /spider spawn).', 'error'); return; }
          const r = await api.send({ type: 'follow', distance: Number.isFinite(dist) && dist > 0 ? dist : 3 });
          addChat(r.ok ? `${n} spider${n === 1 ? '' : 's'} following you${Number.isFinite(dist) && dist > 0 ? ` (stop distance: ${dist})` : ''} — A* pathfinding on.` : r.error, r.ok ? 'success' : 'error');
        }
        return;
      }
      if (action === 'goto' || action === 'path') {
        
        const a1 = (args[1] || '').toLowerCase();
        if (a1 === 'off' || a1 === 'stop') {
          const r = await api.send({ type: 'goto', off: true });
          addChat(r.ok ? 'Pathfinding target cleared.' : r.error, r.ok ? 'success' : 'error');
          return;
        }
        const nums = args.slice(1).map(parseFloat);
        const n = api.list().length;
        if (!n) { addChat('No spiders yet (spawn one with /spider spawn).', 'error'); return; }
        let x, y, z;
        if (nums.filter((v) => Number.isFinite(v)).length === 3) {
          [x, y, z] = nums;
        } else if (nums.filter((v) => Number.isFinite(v)).length === 2) {
          [x, z] = nums.filter((v) => Number.isFinite(v));
        } else {
          addChat('Usage: /spider goto <x> <z> | /spider goto <x> <y> <z> | /spider goto off', 'error');
          return;
        }
        const r = await api.send({ type: 'goto', x, y, z });
        addChat(r.ok ? `${n} spider${n === 1 ? '' : 's'} pathfinding (A*) to ${x}, ${y ?? 'auto'}, ${z}.` : r.error, r.ok ? 'success' : 'error');
        return;
      }
      if (action === 'tphere') {
        const r = await api.send({ type: 'tphere' });
        const list = api.list();
        const n = list.length;
        addChat(r.ok ? (n > 0 ? `${n} spider${n === 1 ? '' : 's'} teleported to you.` : 'No spiders to teleport.') : r.error, r.ok ? 'success' : 'error');
        return;
      }
      if (action === 'replace' || action === 'server') {
        
        const arg = (args[1] || '').toLowerCase();
        if (arg === 'off' || arg === 'stop') {
          const r = await api.send({ type: 'replace', off: true });
          addChat(r.ok ? 'Server spiders restored to their vanilla model.' : r.error, r.ok ? 'success' : 'error');
          return;
        }
        const scale = parseFloat(args[1]);
        const h = Number.isFinite(scale) && scale > 0 ? Math.min(200, scale) : 100;
        const r = await api.send({ type: 'replace', scale: h });
        if (!r.ok) { addChat(r.error, 'error'); return; }
        api.enable(true);
        addChat(`Replacing server spiders with preset 'spider' (${h} blocks tall). Their vanilla models are hidden. /spider replace off to restore.`, 'success');
        return;
      }
      if (action === 'hunt' || action === 'caza') {
        
        const arg = (args[1] || '').toLowerCase();
        if (arg === 'off' || arg === 'stop') {
          const r = await api.send({ type: 'hunt', off: true });
          addChat(r.ok ? 'Hunt mode OFF.' : r.error, r.ok ? 'success' : 'error');
          return;
        }
        const n = api.list().length;
        if (!n) { addChat('No spiders yet (spawn one with /spider spawn).', 'error'); return; }
        const range = parseFloat(args[1]);
        const agg = parseFloat(args[2]);
        const r = await api.send({
          type: 'hunt',
          range: Number.isFinite(range) && range > 0 ? range : 48,
          aggression: Number.isFinite(agg) && agg > 0 ? agg : 1,
        });
        addChat(r.ok
          ? `Hunt mode ON: ${n} spider${n === 1 ? '' : 's'} stalking you — they circle, pounce and BITE. /spider hunt off to stop.`
          : r.error, r.ok ? 'success' : 'error');
        return;
      }
      if (action === 'evolve' || action === 'evolucion' || action === 'evo') {
        
        const arg = (args[1] || '').toLowerCase();
        if (arg === 'off' || arg === 'stop') {
          const r = await api.send({ type: 'evolve', off: true });
          addChat(r.ok ? 'Evolution OFF: spiders survive but no longer evolve.' : r.error, r.ok ? 'success' : 'error');
          return;
        }
        const n = parseInt(arg, 10);
        const r = await api.send({ type: 'evolve', count: Number.isFinite(n) && n > 0 ? n : 6 });
        if (!r.ok) { addChat(r.error || 'Evolution failed to start.', 'error'); return; }
        api.enable(true);
        const c = r.count ?? '?';
        addChat(`Evolution ON: ${c} random spiders (gen 0). Food spawns near you; they eat, bite, starve, reproduce and MUTATE. Watch with /spider stats.`, 'success');
        return;
      }
      if (action === 'stats' || action === 'evostats') {
        
        const r = await api.send({ type: 'evostats' });
        if (!r || !r.ok) { addChat('Evolution not running. Start with /spider evolve.', 'error'); return; }
        const s = r.stats;
        addChat(`— EVOLUTION gen=${s.generation} births=${s.births} deaths=${s.deaths} alive=${r.population.length} ticks=${s.ticks} —`, 'info');
        for (const p of r.population.slice(0, 10)) {
          const st = p.stamina !== undefined ? ` ⚡${Math.round(p.stamina * 100)}%${p.tired ? '😩' : ''}` : '';
          addChat(`  ${p.name} g${p.gen} fit=${p.fitness} E=${p.energy}${st}${p.food ? ` 🍖${p.food}` : ''}${p.bites ? ` 🦷${p.bites}` : ''}${p.children ? ` 🐣${p.children}` : ''}`, 'info');
        }
        if (!r.population.length) addChat('  (population extinct — restart with /spider evolve)', 'error');
        return;
      }
      if (action === 'clear' || action === 'remove' || action === 'kill') {
        
        const n = api.list().length;
        api.clear();
        addChat(n ? `Removed all spiders (${n}).` : 'No spiders loaded.', 'success');
        return;
      }
      if (action === 'despawn') {
        const name = (args[1] || '').toLowerCase();
        if (name === 'all') {
          const n = api.list().length;
          api.clear();
          addChat(n ? `Removed all spiders (${n}).` : 'No spiders loaded.', 'success');
          return;
        }
        const r = await api.send({ type: 'despawn', name });
        addChat(r.ok ? 'Despawn requested.' : r.error, r.ok ? 'success' : 'error');
        return;
      }
      if (action === 'list') {
        const list = api.list();
        if (!list.length) addChat('No spiders yet (walk into a world and wait a second).', 'success');
        else for (const s of list) addChat(`  ${s.name} (${s.preset}${s.gallop ? ' gallop' : ''})${s.pos ? ` @ ${s.pos.map(v => v.toFixed(1)).join(', ')}${s.grounded ? '' : ' ⌁air'}` : ''}`, 'info');
        const d = api.debug();
        addChat(`sim: ${d.sim} tick=${d.tick ?? '—'} game=${d.hasGame ? 'ok' : '—'} frame=${d.lastFrameT ?? '—'}`);
        return;
      }
      if (action === 'log') {
        
        const lvl = parseInt(args[1] ?? '', 10);
        if (Number.isFinite(lvl)) {
          api.log(lvl);
          addChat(`Spider log level = ${lvl} (0=off 1=info 2=detail 3=verbose). Persistent until changed.`, 'success');
        } else {
          const d = api.logs(20);
          addChat(`— last bot logs (level ${api.log()}) —`, 'info');
          for (const e of d.bot) addChat(`  [${e.t}ms] ${e.tag}: ${e.msg}`, 'info');
          addChat(`— last sim logs —`, 'info');
          for (const e of d.sim) addChat(`  [${e.t}ms] ${e.tag}: ${e.msg}`, 'info');
        }
        return;
      }
      if (action === 'status') {
        const d = api.debug();
        addChat(`enabled=${d.enabled} sim=${d.sim} tick=${d.tick ?? '—'} (${d.tickMs ?? '—'}ms) ctors=${d.ctors} spiders=${d.spiders} game=${d.hasGame ? 'ok' : '—'} frame=${d.lastFrameT ?? '—'} log=${d.logLevel}`);
        return;
      }
      if (action === 'help' || action === '') {
        for (const line of [
          '\\yellow\\/spider spawn <preset> [scale <h>] [gallop]\\reset\\ - Spawn beside you; h = body height in blocks (1-200)',
          '\\yellow\\/spider target\\reset\\ - Laser: guide nearest spider where you look',
          '\\yellow\\/spider follow [dist|off]\\reset\\ - Follow you with A* pathfinding',
          '\\yellow\\/spider goto <x> <z> [y] | off\\reset\\ - Walk to coords with A* pathfinding',
          '\\yellow\\/spider hunt [range] [agg] | off\\reset\\ - Hunting AI: stalk, circle, pounce, bite',
          '\\yellow\\/spider evolve [n] | off\\reset\\ - NATURAL SELECTION: spiders eat, starve, reproduce & mutate',
          '\\yellow\\/spider stats\\reset\\ - Evolution leaderboard (fitness, generation, energy)',
          '\\yellow\\/spider replace [h] | off\\reset\\ - Server spiders become preset spider (h blocks tall, default 100)',
          '\\yellow\\Spiders auto-share via P2P: /p2p host (owner) + /p2p join <code> (friend)\\reset\\',
          '\\yellow\\/spider clear | despawn all\\reset\\ - Remove ALL loaded spiders',
          '\\yellow\\/spider tphere\\reset\\ - Teleport all spiders to your exact position',
          '\\yellow\\/spider staystill\\reset\\ - Stop all spiders',
          '\\yellow\\/spider list\\reset\\ - Spiders + simulator status',
          '\\yellow\\/spider status\\reset\\ - Debug info',
          '\\yellow\\/spider log [0-3]\\reset\\ - Debug logging (or dump last entries)',
          '\\yellow\\/spider ai [url] [n] | off\\reset\\ - Deep learning: DQN brain via WebSocket (external)',
          '\\yellow\\/spider aistats\\reset\\ - Neural net status (steps, epsilon, loss, thoughts)',
          '\\yellow\\/spider predators [n] | off\\reset\\ - THREATS: hunters that patrol and kill spiders',
          'Simulator is embedded in the extension — no external process needed'
        ]) state.chat?.addChat?.({ text: line });
        return;
      }
      if (action === 'ai' || action === 'ia' || action === 'brain') {
        
        const arg = (args[1] || '').toLowerCase();
        if (arg === 'off' || arg === 'stop') {
          const r = await api.send({ type: 'ai', off: true });
          addChat(r.ok ? `AI OFF: ${r.removed} spider(s) freed from the neural net.` : r.error, r.ok ? 'success' : 'error');
          return;
        }
        
        let url = '';
        let count;
        for (let i = 1; i < args.length; i++) {
          const t = args[i];
          if (/^wss?:\/\//.test(t)) url = t;
          else { const v = parseInt(t, 10); if (Number.isFinite(v) && v > 0) count = v; }
        }
        addChat(`Connecting to motor AI server ${url || 'ws://127.0.0.1:8766/ws'} …`, 'info');
        const r = await api.send({ type: 'ai', url, count, useExisting: arg === 'evo' || arg === 'existing' });
        if (!r.ok) { addChat(r.error || 'AI failed to start.', 'error'); return; }
        api.enable(true);
        addChat(`Motor AI ON: ${r.count} spider(s) — every muscle controlled by a neuroevolved net (${r.backend || 'motor'}${r.device ? `, ${r.device}` : ''})${r.predators ? `, ${r.predators} predators hunting them` : ''}. NO preprogrammed gait: movement emerges from physics. /spider aistats`, 'success');
        return;
      }
      if (action === 'predators' || action === 'predador' || action === 'amenaza' || action === 'threats') {
        
        const arg = (args[1] || '').toLowerCase();
        if (arg === 'off' || arg === 'stop') {
          const r = await api.send({ type: 'predators', off: true });
          addChat(r.ok ? `Predators OFF (${r.kills} total kills).` : r.error, r.ok ? 'success' : 'error');
          return;
        }
        const n = parseInt(arg, 10);
        const r = await api.send({ type: 'predators', count: Number.isFinite(n) && n > 0 ? n : 2 });
        if (!r.ok) { addChat(r.error, 'error'); return; }
        api.enable(true);
        addChat(`Predators ON: ${r.count} hunters patrolling and CHASING spiders. The AI must learn to flee. /spider predators off to remove.`, 'success');
        return;
      }
      if (action === 'aistats' || action === 'statsai' || action === 'brainstats') {
        const r = await api.send({ type: 'aistats' });
        if (!r?.ok) { addChat('AI status unavailable.', 'error'); return; }
        const c = r.conn || {};
        addChat(`— MOTOR BRAIN ${c.connected ? '🟢 connected' : '🔴 offline'} gen=${c.generation ?? '—'} device=${c.device || '?'} motors=${c.motors ?? 28} —`, c.connected ? 'success' : 'error');
        for (const m of (r.minds || []).slice(0, 12)) {
          addChat(`  ${m.name} · edad ${m.age}t · viajó ${m.travel}m · swing ${m.legs ?? '—'} lift ${m.lift ?? '—'}`, 'info');
        }
        if (r.evolve) addChat(`  economy: births=${r.evolve.births} deaths=${r.evolve.deaths} gen=${r.evolve.generation}`, 'info');
        if (!c.connected) addChat('  Connect a DQN brain: /spider ai wss://<tu-servidor>', 'info');
        return;
      }
      })();
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

    if (command === 'critter' || command === 'critters' || command === 'cac' || command === 'bicho' || command === 'bichos' || command === 'animal' || command === 'animales') {
      const api = globalThis.MF_CrittersMobs;
      if (!api?.spawnOne) {
        addChat('CrittersMobs is not loaded yet.', 'error');
        return;
      }
      const action = (args[0] || 'spawn').toLowerCase();
      if (action === 'list' || action === 'lista') {
        const list = api.species();
        addChat(`Species (${list.length}):`);
        for (let i = 0; i < list.length; i += 6) {
          addChat('\\yellow\\' + list.slice(i, i + 6).join(', ') + '\\reset\\');
        }
        return;
      }
      if (action === 'count' || action === 'contador') {
        const c = api.counts();
        const keys = Object.keys(c);
        if (!keys.length) { addChat('No critters alive. Spawn some with /critter spawn <species>.'); return; }
        addChat('Alive: ' + keys.map(k => `${k} x${c[k]}`).join(', '), 'success');
        return;
      }
      if (action === 'clear' || action === 'despawn' || action === 'limpiar') {
        api.clear();
        addChat('All critters despawned.', 'success');
        return;
      }
      if (action === 'random' || action === 'aleatorio') {
        const list = api.species();
        const pick = list[(Math.random() * list.length) | 0];
        const r = api.spawnOne(pick, 1 + ((Math.random() * 3) | 0));
        if (r.ok) addChat(`Spawned ${r.spawned} ${r.species} near you.`, 'success');
        else addChat(r.error, 'error');
        return;
      }
      if (action === 'spawn' || action === 'spawnear') {
        const key = (args[1] || '').toLowerCase();
        if (!key) { addChat('Usage: /critter spawn <species> [count]  — /critter list to see species', 'error'); return; }
        const n = Math.max(1, Math.min(Number(args[2]) || 1, 12));
        const r = api.spawnOne(key, n);
        if (r.ok) addChat(`Spawned ${r.spawned} ${r.species} near you.`, 'success');
        else addChat(r.error, 'error');
        return;
      }
      addChat('Usage: /critter spawn <species> [n] | random | list | count | clear', 'error');
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
        
        const id = api.spawn(file, pos.x, pos.y, pos.z, {
          id: 'room',
          room: true,
          autoSize: scale == null,
          scale: scale == null ? 1 : scale,
          followPlayer: false,
          lookAtPlayer: false
        });
        addChat(id ? `Room "${file}" building (size: ${scale == null ? 'auto ~80 blocks' : 'x' + scale})...` : `Could not load "${file}".`, id ? 'normal' : 'error');
        
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

    if (command === 'idlebot' || command === 'idleplayer') {
      const api = globalThis.MF_IDLE_PLAYER_BOT;
      if (!api?.connect || !api?.disconnect || !api?.status) {
        addChat('Idle Player is not ready yet.', 'error');
        return;
      }

      const action = (args[0] || 'status').toLowerCase();
      if (action === 'join' || action === 'connect' || action === 'start') {
        const target = args.slice(1).join(' ').trim() || 'current';
        addChat('Connecting one idle guest...');
        Promise.resolve(api.connect(target)).then(() => {
          const current = api.status();
          if (current.phase !== 'error') addChat('Idle Player connection started.', 'success');
        }).catch(error => {
          addChat('Idle Player failed: ' + (error?.message || error), 'error');
        });
        return;
      }

      if (action === 'leave' || action === 'disconnect' || action === 'stop') {
        api.disconnect();
        addChat('Idle Player disconnected.', 'success');
        return;
      }

      if (action === 'status') {
        const current = api.status();
        const identity = current.playerName || 'guest';
        const server = current.serverId || 'unknown';
        const suffix = current.error ? ' (' + current.error + ')' : '';
        if (current.connected) {
          addChat('Idle Player connected as ' + identity + ' on ' + server + '.', 'success');
        } else {
          addChat('Idle Player status: ' + (current.phase || 'idle') + suffix + '.');
        }
        return;
      }

      addChat('Usage: /idlebot join [invite|server] | leave | status', 'error');
      return;
    }

    if (command === 'baritone' || command === 'goto' || command === 'follow') {
      const api = globalThis.Baritone;
      if (!api) {
        addChat('Baritone is not ready yet.', 'error');
        return;
      }
      
      let action, rest;
      if (command === 'goto') { action = 'goto'; rest = args; }
      else if (command === 'follow') { action = 'follow'; rest = args; }
      else { action = (args[0] || 'status').toLowerCase(); rest = args.slice(1); }

      if (action === 'goto') {
        
        const nums = rest.slice(0, 3).map(Number);
        if (rest.length >= 3 && nums.every(n => Number.isFinite(n))) {
          const ok = api.goto(nums[0], nums[1], nums[2]);
          if (ok) addChat(`Walking to ${nums[0]}, ${nums[1]}, ${nums[2]}...`, 'success');
          else addChat('No path found to those coords.', 'error');
          return;
        }
        
        const name = rest.join(' ').trim();
        if (!name) {
          addChat('Usage: /baritone goto <x y z> | <waypoint name>', 'error');
          return;
        }
        
        const tracked = api.locate(name);
        if (tracked) {
          if (tracked.loaded && api.follow(name)) {
            addChat('Following player "' + tracked.username + '" in real time...', 'success');
          } else {
            api.goto(tracked.x, tracked.y, tracked.z);
            addChat('Walking to the last known position of "' + tracked.username + '"...', 'success');
          }
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

      if (action === 'attack' || action === 'pegar') {
        const username = rest.join(' ').trim();
        if (!username) { addChat('Usage: /baritone attack <player>', 'error'); return; }
        const ok = api.attack(username);
        addChat(ok ? 'Attacking "' + username + '"...' : 'Player "' + username + '" is not loaded.', ok ? 'success' : 'error');
        return;
      }

      if (action === 'mine' || action === 'minar' || action === 'place' || action === 'colocar') {
        const isPlace = action === 'place' || action === 'colocar';
        const nums = rest.slice(0, 3).map(Number);
        if (rest.length < 3 || !nums.every(Number.isFinite)) {
          addChat('Usage: /baritone ' + (isPlace ? 'place' : 'mine') + ' <x y z>' + (isPlace ? ' [hotbar slot 1-9]' : ''), 'error');
          return;
        }
        const ok = isPlace ? api.place(nums[0], nums[1], nums[2], Number(rest[3])) : api.mine(nums[0], nums[1], nums[2]);
        addChat(ok ? (isPlace ? 'Placing' : 'Mining') + ' at ' + nums.join(', ') + '...' : 'Could not start that action.', ok ? 'success' : 'error');
        return;
      }

      if (action === 'jump' || action === 'saltar') {
        const ok = api.jump();
        addChat(ok ? 'Jumping.' : 'Baritone could not access the player.', ok ? 'success' : 'error');
        return;
      }

      if (action === 'locate' || action === 'coords') {
        const username = rest.join(' ').trim();
        if (!username) { addChat('Usage: /baritone locate <player>', 'error'); return; }
        const pos = api.locate(username);
        if (!pos) addChat('No position received for "' + username + '". The server may not have sent that player.', 'error');
        else addChat(pos.username + ': ' + pos.x.toFixed(1) + ', ' + pos.y.toFixed(1) + ', ' + pos.z.toFixed(1) + ' (' + (pos.loaded ? 'live' : 'last known') + ')', pos.loaded ? 'success' : 'normal');
        return;
      }

      if (action === 'players' || action === 'jugadores') {
        const players = api.players();
        if (!players.length) addChat('No player positions have been received yet.');
        else addChat(players.slice(0, 12).map(p => p.username + ' ' + p.x.toFixed(0) + ',' + p.y.toFixed(0) + ',' + p.z.toFixed(0) + (p.loaded ? '' : '*')).join(' | ') + (players.length > 12 ? ' | +' + (players.length - 12) : '') + ' (* last known)');
        return;
      }

      if (action === 'automine') {
        const value = (rest[0] || '').toLowerCase();
        if (!['on', 'off'].includes(value)) { addChat('Usage: /baritone automine <on|off>', 'error'); return; }
        api.setAutoMine(value === 'on');
        addChat('Automatic obstacle mining: ' + value + '.', 'success');
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

      addChat('Usage: /baritone goto|follow|mine|place|attack|jump|locate|players|automine|stop|status', 'error');
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

    if (command === 'g' || command === 'global') {
      const text = args.join(' ').trim();
      if (!text) {
        const api = globalThis.__MINIFEATHER_P2P_CHAT__;
        const nick = api?.state?.nickname || '(unset)';
        addChat('Usage: /g <message> — sends to the MiniFeather global chat (all clients + Discord).', 'error');
        addChat(`Your nickname: ${nick} — change it in the MiniFeather panel or with /mf chat.`, 'normal');
        return;
      }
      document.dispatchEvent(new CustomEvent('minifeather:chat-action', {
        detail: JSON.stringify({ action: 'send-global', text })
      }));
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
      if (action === 'auto') {
        const v = (args[1] || '').toLowerCase();
        const on = ['on', '1', 'true', 'si', 'sí'].includes(v) ? true
          : ['off', '0', 'false', 'no'].includes(v) ? false : undefined;
        const cur = api.auto ? api.auto(on) : false;
        addChat(`P2P auto-share: ${cur ? 'ON' : 'OFF'} — ${cur
          ? 'hosting publishes the code to chat; others with the extension auto-join.'
          : 'rooms are private again (manual /p2p join only).'}`, 'success');
        return;
      }
      
      const st = api.status;
      const role = api.role ? ` (${api.role})` : '';
      addChat(st === 'off' ? 'P2P: off — use /p2p host or /p2p join <code>' : `P2P: ${st}${role}`);
      return;
    }

    if (command === 'call' || command === 'llamar') {
      const api = globalThis.MF_VoiceChat;
      if (!api) { addChat('Voice module is not ready yet.', 'error'); return; }
      const action = String(args[0] || 'status').toLowerCase();
      if (action === 'on' || action === 'activar') {
        api.enable().then(result => addChat(result.ok ? 'Voice enabled. Friends using MiniFeather Voice will appear as available shortly.' : result.error, result.ok ? 'success' : 'error'));
        return;
      }
      if (action === 'off' || action === 'desactivar') {
        api.disable();
        addChat('Voice disabled.', 'success');
        return;
      }
      if (action === 'answer' || action === 'contestar') {
        api.answer().then(ok => { if (!ok) addChat('No incoming call or microphone unavailable.', 'error'); });
        return;
      }
      if (action === 'decline' || action === 'rechazar') { api.decline(); return; }
      if (action === 'end' || action === 'hangup' || action === 'colgar') { api.end(); return; }
      if (action === 'mute' || action === 'silenciar') {
        const muted = api.mute();
        addChat(muted ? 'Microphone muted.' : 'Microphone unmuted or no active call.');
        return;
      }
      if (action === 'status' || action === 'estado') {
        const info = api.status();
        addChat(`Voice: ${info.enabled ? 'ON' : 'OFF'} | signal ${info.signal ? 'ready' : 'offline'} | peer ${info.peer ? 'ready' : 'offline'} | identity ${info.identity ? 'ready' : 'missing'} | known ${info.knownFriends} | presence ${info.receivedPresence} | friends: ${info.availableFriends.join(', ') || 'none'}${info.lastError ? ` | error: ${info.lastError}` : ''}`);
        return;
      }
      api.call(args[0]).then(result => addChat(result.ok ? `Calling ${result.name}...` : result.error, result.ok ? 'success' : 'error'));
      return;
    }

    if (command === 'mesh') {
      const api = globalThis.MF_Mesh;
      if (!api) { addChat('Mesh module is not ready yet.', 'error'); return; }
      const action = (args[0] || 'status').toLowerCase();
      if (action === 'on' || action === 'start') {
        api.start().then(code => {
          if (!code) { addChat('Could not start the mesh (check console).', 'error'); return; }
          addChat(`Mesh node ${code} ready. Use /mesh announce or share this code with /mesh connect.`, 'success');
        });
        return;
      }
      if (action === 'announce' || action === 'anunciar') {
        api.start().then(code => {
          if (!code) { addChat('Could not start the mesh.', 'error'); return; }
          api.announceNow();
          addChat(`Mesh code ${code} announced to chat.`, 'success');
        });
        return;
      }
      if (action === 'connect' || action === 'join' || action === 'conectar') {
        const code = String(args[1] || '').trim();
        if (!code) { addChat('Usage: /mesh connect <code>', 'error'); return; }
        api.connect(code).then(ok => {
          addChat(ok ? `Connecting to mesh node ${code}...` : `Could not connect to ${code}. Check the code and retry.`, ok ? 'normal' : 'error');
        });
        return;
      }
      if (action === 'share' || action === 'compartir') {
        api.shareSkin();
        addChat('Your current custom skin was shared to the mesh.', 'success');
        return;
      }
      if (action === 'off' || action === 'stop') {
        api.dispose();
        addChat('Mesh node closed.', 'success');
        return;
      }
      
      const st = api.status;
      const n = api.connected;
      const names = Object.values(api.names || {}).join(', ') || '—';
      addChat(st === 'off'
        ? 'Mesh: off — use /mesh on'
        : `Mesh: ${st} (${api.code || 'no code'}) — ${n} node(s): ${names}`);
      return;
    }

    if (command === 'pscale' || command === 'plarge' || command === 'panchor') {
      const api = globalThis.TitanTiny;
      if (!api) { addChat('Titan & Tiny is not ready yet.', 'error'); return; }

      const raw = String(args[0] || '').toLowerCase();
      const keywords = {
        micro: 0.02, tiny: 0.35, small: 0.35, chico: 0.35, pequeno: 0.35,
        normal: 1, normalWidth: 1,
        titan: 3, big: 3, giant: 3, grande: 3, gigante: 3,
        slim: 0.55, skinny: 0.55, delgado: 0.55,
        fat: 2, gordo: 2, thick: 2,
        reset: 0, off: 0
      };
      const num = Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : (keywords[raw] !== undefined ? keywords[raw] : NaN);

      if (command === 'pscale') {
        if (!Number.isFinite(num)) {
          addChat(`Size: ${api.scale.toFixed(3)}x | ${api.enabled ? 'enabled' : 'disabled'} — /pscale <0.01-5.00> | micro | tiny | normal | titan`, 'normal');
          return;
        }
        const v = Math.max(0.01, Math.min(5.00, num));
        api.setScale(v);
        if (!api.enabled) api.setEnabled(true);
        addChat(`Player size set to ${v.toFixed(3)}x.`, 'success');
        return;
      }

      if (command === 'plarge') {
        if (!Number.isFinite(num)) {
          addChat(`Width: ${api.width.toFixed(2)}x — /plarge <0.30-3.00> | slim | normal | fat`, 'normal');
          return;
        }
        const v = Math.max(0.30, Math.min(3.00, num));
        api.setWidth(v);
        if (!api.enabled) api.setEnabled(true);
        addChat(v > 1 ? `You look fat now (${v.toFixed(2)}x wide).` : v < 1 ? `You look slim now (${v.toFixed(2)}x wide).` : 'Width back to normal.', 'success');
        return;
      }

      // panchor
      if (!Number.isFinite(num)) {
        addChat(`Ground anchor offset: ${api.groundOffset.toFixed(2)} — /panchor <-1.50 to 1.50> | 0 = reset (negative sinks, positive floats)`, 'normal');
        return;
      }
      const v = Math.max(-1.50, Math.min(1.50, num));
      api.setGroundOffset(v);
      if (!api.enabled) api.setEnabled(true);
      addChat(`Ground anchor set to ${v.toFixed(2)}${v === 0 ? ' (reset)' : ''}.`, 'success');
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
        void 0;
        return;
      }
      if (!action) {
        addChat(`Playing: ${api.playing || 'none'}. Usage: /emote <name> | stop | list | reload | debug`, 'normal');
        return;
      }
      
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
