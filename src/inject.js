(function () {
  'use strict';

  const RANK_KEY = 'dev';
  const RANK_LABEL = 'DEV';
  const RANK_COLOR = '#00FFFF';
  const TARGETS = new Map([
    ['angrywolfx', 'AngryWolfX'],
    ['estebanexg_', 'EstebanExG_']
  ]);

  const state = {
    game: null,
    playerList: null,
    playerListApplyEntry: null,
    playerListApplyEntryWrapped: null,
    timer: 0,
    boot: 0,
    proxyUrl: '',
    nativeResolver: false,
    nativeRanks: new Map(),
    uuidToName: new Map(),
    seenChatEntries: new WeakSet(),
    responseJsonOriginal: null,
    responseJsonWrapped: null
  };

  globalThis.__MF_NATIVE_CUSTOM_RANKS__ = {
    defs: {
      [RANK_KEY]: {
        color: RANK_COLOR,
        shiny: true,
        priorityBase: 'eternus'
      }
    }
  };

  function isTargetName(value) {
    if (typeof value !== 'string') return null;
    return TARGETS.get(value.trim().toLowerCase()) || null;
  }

  function rememberNativeRank(name, rank) {
    if (!name || !rank || String(rank).toLowerCase() === RANK_KEY) return;
    const key = name.toLowerCase();
    if (!state.nativeRanks.has(key)) state.nativeRanks.set(key, String(rank));
  }

  function targetNameFromObject(value) {
    if (!value || typeof value !== 'object') return null;
    const direct = isTargetName(value.username) || isTargetName(value.name);
    if (direct) return direct;
    const profile = value.profile;
    if (profile && typeof profile === 'object') {
      return isTargetName(profile.username) || isTargetName(profile.name);
    }
    return null;
  }

  function patchRecord(value) {
    if (!value || typeof value !== 'object') return null;
    const target = targetNameFromObject(value);
    if (!target) return null;

    if ('rank' in value) {
      rememberNativeRank(target, value.rank);
      try { value.rank = RANK_KEY; } catch (_) {}
    }

    if (value.profile && typeof value.profile === 'object') {
      const profileTarget = isTargetName(value.profile.username) || isTargetName(value.profile.name) || target;
      if (profileTarget && 'rank' in value.profile) {
        rememberNativeRank(profileTarget, value.profile.rank);
        try { value.profile.rank = RANK_KEY; } catch (_) {}
      }
      if (profileTarget && value.profile.uuid) state.uuidToName.set(String(value.profile.uuid), profileTarget);
    }

    if (value.uuid) state.uuidToName.set(String(value.uuid), target);
    return target;
  }

  function patchTree(root) {
    if (!root || typeof root !== 'object') return root;
    const seen = new WeakSet();
    const stack = [{ value: root, depth: 0 }];
    while (stack.length) {
      const { value, depth } = stack.pop();
      if (!value || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);
      patchRecord(value);
      if (depth >= 7) continue;
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const child = value[i];
          if (child && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
        }
      } else {
        let keys = [];
        try { keys = Object.keys(value); } catch (_) { continue; }
        for (const key of keys) {
          let child;
          try { child = value[key]; } catch (_) { continue; }
          if (child && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
        }
      }
    }
    return root;
  }

  function shouldPatchApiResponse(url) {
    if (!url) return false;
    let parsed;
    try { parsed = new URL(url, location.href); } catch (_) { return false; }
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('miniblox')) return false;
    const path = parsed.pathname.toLowerCase();
    return path.includes('/accounts/get') ||
      path.includes('/friends/') ||
      path.includes('/leaderboards/') ||
      path.includes('/dm/history') ||
      path.includes('/party/');
  }

  function installEarlyDataHook() {
    try {
      const proto = globalThis.Response?.prototype;
      const original = proto?.json;
      if (typeof original !== 'function' || original.__mfCustomRanksSafe) return;

      const wrapped = async function (...args) {
        const result = await Reflect.apply(original, this, args);
        if (shouldPatchApiResponse(this?.url)) patchTree(result);
        return result;
      };

      Object.defineProperty(wrapped, '__mfCustomRanksSafe', { value: true });
      proto.json = wrapped;
      state.responseJsonOriginal = original;
      state.responseJsonWrapped = wrapped;
    } catch (_) {}
  }

  function syncText(url) {
    try {
      const request = new XMLHttpRequest();
      request.open('GET', url, false);
      request.send(null);
      if (request.status >= 200 && request.status < 300) return request.responseText;
    } catch (_) {}
    return '';
  }

  function findMainModuleUrl(html) {
    const matches = [];
    const re = /<script[^>]+src=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi;
    let match;
    while ((match = re.exec(html))) matches.push(match[1]);
    matches.sort((a, b) => Number(/\/assets\/index-/i.test(b)) - Number(/\/assets\/index-/i.test(a)));
    return matches.length ? new URL(matches[0], location.href).href : '';
  }

  function installNativeResolver() {
    try {
      const html = syncText(location.href) || syncText(location.origin + '/');
      let mainUrl = findMainModuleUrl(html);
      let mainSource = mainUrl ? syncText(mainUrl) : '';
      let guiFile = '';

      if (mainSource) {
        const match = mainSource.match(/from["']\.\/(GuiToast-[^"']+\.js)["']/) || mainSource.match(/["']\.\/(GuiToast-[^"']+\.js)["']/);
        if (match) guiFile = match[1];
      }

      if (!guiFile) guiFile = 'GuiToast-Lc6SpdY_.js';
      if (!mainUrl) mainUrl = new URL('/assets/index-placeholder.js', location.origin).href;

      const guiUrl = new URL('./' + guiFile, mainUrl).href;
      const originalUrl = guiUrl + (guiUrl.includes('?') ? '&' : '?') + 'mf_custom_rank_original=1';
      const proxySource = [
        'import * as N from ' + JSON.stringify(originalUrl) + ';',
        'export * from ' + JSON.stringify(originalUrl) + ';',
        'const S=()=>globalThis.__MF_NATIVE_CUSTOM_RANKS__;',
        'const D=e=>S()?.defs?.[String(e??"").toLowerCase()]||null;',
        'export const H=e=>D(e)?.color??N.H(e);',
        'export const Y=e=>D(e)?.shiny??N.Y(e);',
        'export const W=e=>{const d=D(e);return d?N.W(d.priorityBase||"eternus"):N.W(e)};'
      ].join('\n');

      const proxyUrl = URL.createObjectURL(new Blob([proxySource], { type: 'text/javascript' }));
      const importMap = document.createElement('script');
      importMap.type = 'importmap';
      importMap.textContent = JSON.stringify({ imports: { [guiUrl]: proxyUrl } });
      (document.head || document.documentElement).prepend(importMap);
      state.proxyUrl = proxyUrl;
      state.nativeResolver = true;
    } catch (_) {
      state.nativeResolver = false;
    }
  }

  function isGame(value) {
    return !!(value?.player && value?.world && value?.chat && value?.playerList);
  }

  function findGame() {
    for (const candidate of [globalThis.__MINIBLOX_GAME__, globalThis.miniblox, state.game]) {
      if (isGame(candidate)) return candidate;
    }
    try {
      const react = document.querySelector('#react');
      if (react) {
        for (const value of Object.values(react)) {
          const game = value?.updateQueue?.baseState?.element?.props?.game;
          if (isGame(game)) {
            globalThis.__MINIBLOX_GAME__ = game;
            return game;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  function findNameTagRefresh(mesh) {
    if (!mesh) return null;
    let proto = mesh;
    for (let depth = 0; proto && depth < 8; depth++, proto = Object.getPrototypeOf(proto)) {
      let names = [];
      try { names = Object.getOwnPropertyNames(proto); } catch (_) { continue; }
      for (const name of names) {
        if (name === 'constructor') continue;
        let fn;
        try { fn = mesh[name]; } catch (_) { continue; }
        if (typeof fn !== 'function') continue;
        let source = '';
        try { source = Function.prototype.toString.call(fn); } catch (_) {}
        if (source.includes('customNameTag') && source.includes('profile.rank') && source.includes('nameTagText')) return fn;
      }
    }
    return null;
  }

  function patchEntity(entity) {
    if (!entity?.profile) return false;
    const target = patchRecord(entity);
    if (!target) return false;
    try {
      const refresh = findNameTagRefresh(entity.mesh);
      if (refresh) refresh.call(entity.mesh);
    } catch (_) {}
    return true;
  }

  function patchKnownGameData(game) {
    if (!game) return;
    patchRecord(game.player);
    patchRecord(game.player?.profile);

    try {
      for (const row of game.playerList?.playerDataMap?.values?.() || []) patchRecord(row);
    } catch (_) {}

    try {
      for (const row of game.playerList?.sortedPlayerData || []) patchRecord(row);
    } catch (_) {}

    try {
      for (const row of game.serverInfo?.recentPlayers || []) patchRecord(row);
    } catch (_) {}

    try {
      const entities = game.world?.loadedEntityList || [];
      for (const entity of entities) patchEntity(entity);
    } catch (_) {}

    try {
      const local = game.world?.getPlayerById?.(game.player?.id);
      if (local) patchEntity(local);
    } catch (_) {}
  }

  function hookPlayerList(game) {
    const list = game?.playerList;
    if (!list || typeof list.applyEntry !== 'function') return;
    if (state.playerList === list && list.applyEntry === state.playerListApplyEntryWrapped) return;

    if (state.playerList && state.playerList.applyEntry === state.playerListApplyEntryWrapped) {
      try { state.playerList.applyEntry = state.playerListApplyEntry; } catch (_) {}
    }

    const original = list.applyEntry;
    const wrapped = function (entry) {
      const target = patchRecord(entry);
      if (target && entry?.id != null) {
        try {
          const entity = this.game?.world?.getPlayerById?.(entry.id);
          if (entity?.profile) {
            rememberNativeRank(target, entity.profile.rank);
            entity.profile.rank = RANK_KEY;
          }
        } catch (_) {}
      }
      const result = original.call(this, entry);
      if (target && entry?.id != null) {
        try {
          const entity = this.game?.world?.getPlayerById?.(entry.id);
          if (entity) patchEntity(entity);
        } catch (_) {}
      }
      return result;
    };

    try {
      list.applyEntry = wrapped;
      state.playerList = list;
      state.playerListApplyEntry = original;
      state.playerListApplyEntryWrapped = wrapped;
    } catch (_) {}
  }

  function stripFormatting(text) {
    return String(text || '').replace(/\\[^\\]*\\/g, '').replace(/\s+/g, ' ').trim();
  }

  function rankTag() {
    return `\\bold\\\\glow\\\\${RANK_COLOR}\\\\shiny\\[${RANK_LABEL}]\\reset\\`;
  }

  function chatLine(name, message) {
    return `${rankTag()} \\${RANK_COLOR}\\${name}:\\reset\\ ${message}`;
  }

  function systemLine(name, action) {
    return `${rankTag()} \\${RANK_COLOR}\\${name}\\reset\\ \\yellow\\${action}`;
  }

  function targetFromChat(data) {
    if (data?.from) {
      const byUuid = state.uuidToName.get(String(data.from));
      if (byUuid) return byUuid;
    }
    const plain = stripFormatting(data?.text);
    for (const target of TARGETS.values()) {
      if (plain.includes(target)) return target;
    }
    return null;
  }

  function rewriteChatData(data) {
    if (!data || typeof data !== 'object' || typeof data.text !== 'string') return false;
    const target = targetFromChat(data);
    if (!target) return false;
    const plain = stripFormatting(data.text);
    let next = null;

    const chatPrefix = target + ':';
    const chatIndex = plain.indexOf(chatPrefix);
    if (chatIndex >= 0 && data.publicChat) {
      const message = plain.slice(chatIndex + chatPrefix.length).trimStart();
      next = chatLine(target, message);
    } else if (plain.includes(target + ' has joined the server')) {
      next = systemLine(target, 'has joined the server');
    } else if (plain.includes(target + ' has left the server')) {
      next = systemLine(target, 'has left the server');
    } else if (plain.includes(target + ' joined the server')) {
      next = systemLine(target, 'joined the server');
    } else if (plain.includes(target + ' left the server')) {
      next = systemLine(target, 'left the server');
    }

    if (!next || next === data.text) return false;
    try { data.text = next; } catch (_) { return false; }
    return true;
  }

  function patchChatLog(game) {
    const log = game?.chat?.log;
    if (!Array.isArray(log) || !log.length) return;
    const start = Math.max(0, log.length - 24);
    for (let i = start; i < log.length; i++) {
      const entry = log[i];
      if (!entry || typeof entry !== 'object') continue;
      if (state.seenChatEntries.has(entry)) continue;
      state.seenChatEntries.add(entry);
      rewriteChatData(entry);
    }
  }

  function installRuntime() {
    const game = findGame();
    if (!game) return false;
    state.game = game;
    patchKnownGameData(game);
    hookPlayerList(game);
    patchChatLog(game);
    return true;
  }

  installEarlyDataHook();
  installNativeResolver();

  state.boot = setInterval(() => {
    if (installRuntime()) clearInterval(state.boot);
  }, 25);

  state.timer = setInterval(() => {
    const game = findGame();
    if (!game) return;
    if (game !== state.game || game.playerList !== state.playerList) {
      installRuntime();
      return;
    }
    patchKnownGameData(game);
    patchChatLog(game);
  }, 250);
})();
(function () {
  function tryPatchSliders() {
    document.querySelectorAll('input[type="range"]').forEach(input => {
      if (input.dataset.mfPatched) return;

      const origMax = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "max");
      Object.defineProperty(input, "max", {
        get() { return origMax ? origMax.get.call(this) : this._max; },
        set(val) {
          if (this._patchActive && Number(val) === 8) {
            this._max = 32;
            return;
          }
          this._max = val;
        },
        configurable: true,
      });

      input.dataset.mfPatched = "1";
      input._patchActive = true;
    });
  }

  function onSettingsOpen() {
    setTimeout(tryPatchSliders, 200);
    setTimeout(tryPatchSliders, 500);
    setTimeout(tryPatchSliders, 1000);
  }

  document.addEventListener("click", (e) => {
    const el = e.target;
    if (!el) return;
    const text = el.innerText?.toLowerCase() || "";
    const isSettings = text.includes("settings") || text.includes("ajustes") || text.includes("configuracion");
    if (isSettings) onSettingsOpen();
  }, true);

  const bodyObserver = new MutationObserver(() => {
    tryPatchSliders();
  });

  if (document.body) {
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    tryPatchSliders();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      bodyObserver.observe(document.body, { childList: true, subtree: true });
      tryPatchSliders();
    });
  }
})();
