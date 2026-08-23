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

  const RECOGNIZED = new Set(['toggle', 'bind', 'unbind', 'binds', 'afk', 'copycoord', 'waypoint', 'mf', 'verity', 'caja']);

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
      '\\yellow\\/verity spawn\\reset\\ - Spawn Verity companion',
      '\\yellow\\/verity ask <text>\\reset\\ - Talk with Verity (AI + voice)',
      '\\yellow\\/mf models\\reset\\ - List mob model replacements',
      '\\yellow\\/mf models clear\\reset\\ - Restore all mob models',
      '\\yellow\\/mf diag\\reset\\ - Dump scene diag to console (F12)',
      '\\yellow\\/mf help\\reset\\ - Show this help'
    ];
    for (const line of lines) state.chat?.addChat?.({ text: line });
  }

  function isGame(value) {
    return !!(value?.chat && typeof value.chat.submit === 'function' && value?.player?.pos);
  }

  function findGame() {
    if (isGame(state.game)) return state.game;

    const waypointGame = globalThis.__MINIFEATHER_WAYPOINTS__?.game;
    if (isGame(waypointGame)) return waypointGame;

    try {
      const react = document.querySelector('#react');
      if (react) {
        for (const root of Object.values(react)) {
          const game = root?.updateQueue?.baseState?.element?.props?.game;
          if (isGame(game)) return game;
        }
      }
    } catch (_) {}

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

  function handleVerity(args) {
    const api = globalThis.MF_CustomModels;
    const ai = globalThis.MF_Verity;
    if (!api?.followVerity) {
      addChat('CustomModels is not ready yet.', 'error');
      return;
    }

    const action = (args[0] || 'spawn').toLowerCase();

    if (action === 'spawn') {
      api.followVerity();
      addChat('Verity spawned. She will follow you like a wolf.', 'success');
      return;
    }

    if (action === 'despawn' || action === 'remove' || action === 'kill') {
      const ok = api.despawn('verity');
      addChat(ok ? 'Verity despawned.' : 'Verity is not spawned.', ok ? 'success' : 'error');
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

    if (command === 'verity') {
      handleVerity(args);
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
    if (state.chat === chat && chat.submit === state.hookedSubmit) return true;

    if (state.chat && state.hookedSubmit && state.originalSubmit && state.chat.submit === state.hookedSubmit) {
      try { state.chat.submit = state.originalSubmit; } catch (_) {}
    }

    state.game = game;
    state.chat = chat;
    state.originalSubmit = chat.submit;

    const hookedSubmit = function (gameArg) {
      const line = commandLineFromChat(this);
      if (line && shouldIntercept(line)) {
        try {
          if (this.inputHistory?.[0] !== line) this.inputHistory.unshift(line);
          this.inputHistoryIndex = 0;
        } catch (_) {}

        execute(line);
        try { this.setInputValue?.(''); } catch (_) { try { this.inputValue = ''; } catch (_) {} }
        try { this.closeInput?.(); } catch (_) {}
        return true;
      }
      return state.originalSubmit.call(this, gameArg);
    };

    state.hookedSubmit = hookedSubmit;

    try {
      chat.submit = hookedSubmit;
    } catch (_) {}

    if (chat.submit !== hookedSubmit) {
      try {
        Object.defineProperty(chat, 'submit', { configurable: true, writable: true, value: hookedSubmit });
      } catch (_) {}
    }

    return chat.submit === hookedSubmit;
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
    if (event.repeat || isTyping()) return;
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
    if (state.chat && state.hookedSubmit && state.originalSubmit && state.chat.submit === state.hookedSubmit) {
      try { state.chat.submit = state.originalSubmit; } catch (_) {}
    }
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
    get installed() { return !!(state.chat && state.chat.submit === state.hookedSubmit); },
    execute,
    showHelp,
    destroy
  };
})();
