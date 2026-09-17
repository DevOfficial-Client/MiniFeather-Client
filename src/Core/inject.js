(function () {
  'use strict';

  // ── Rangos definidos en accounts.json (local + DB viva en GitHub) ──
  // Estructura:
  //   "ranks": { "dev": { "label": "DEV", "color": "#00FFFF", "bold": true,
  //                        "glow": true, "shiny": true, "priorityBase": "eternus" } },
  //   "players": { "shusukegxe_": { "skin": "...", "rank": "dev", "name": "ShusukeGxE_" } }
  // "name" (opcional) = nombre a mostrar; entradas por uuid lo aprenden del juego.
  // Fallback offline hardcodeado (mismo comportamiento que siempre):
  const BUILTIN_RANKS = {
    dev: { label: 'DEV', color: '#00FFFF', bold: true, glow: true, shiny: true, priorityBase: 'eternus' }
  };
  const BUILTIN_PLAYERS = {
    '6eb7369a-551e-406a-9a63-6db7a358e1e5': { name: 'ShusukeGxE_', rank: 'dev' },
    'shusukegxe_': { rank: 'dev' },
    'angrywolfx': { rank: 'dev' }
  };
  const LIVE_DB_URL = 'https://raw.githubusercontent.com/EstebanGrp/mfaccs/main/accounts.json';
  const PUSH_TOPIC = 'mf-skins-updates-v1';

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
    responseJsonWrapped: null,
    ranksReady: false,
    ranksVersion: 0
  };

  // ── DB de rangos: builtin → local (assets/accounts.json) → viva (GitHub) ──
  const ranks = {
    defs: { ...BUILTIN_RANKS },
    byUuid: new Map(),
    byName: new Map()
  };

  function normRankKey(v) {
    return String(v || '').trim().toLowerCase();
  }

  function applyRanksDb(data) {
    if (!data || typeof data !== 'object') return false;
    const defs = { ...BUILTIN_RANKS };
    if (data.ranks && typeof data.ranks === 'object') {
      for (const key of Object.keys(data.ranks)) {
        const def = data.ranks[key];
        if (!def || typeof def !== 'object') continue;
        defs[key.toLowerCase()] = {
          label: String(def.label || key).toUpperCase(),
          color: typeof def.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(def.color) ? def.color : '#00FFFF',
          bold: def.bold !== false,
          glow: !!def.glow,
          shiny: !!def.shiny,
          priorityBase: typeof def.priorityBase === 'string' && def.priorityBase ? def.priorityBase : 'eternus'
        };
      }
    }
    const byUuid = new Map();
    const byName = new Map();
    if (data.players && typeof data.players === 'object') {
      for (const key of Object.keys(data.players)) {
        const raw = data.players[key];
        if (!raw || typeof raw !== 'object' || !raw.rank) continue;
        const rankKey = normRankKey(raw.rank);
        if (!defs[rankKey]) continue;
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
          byUuid.set(key.toLowerCase(), rankKey);
          if (raw.name && typeof raw.name === 'string') byName.set(raw.name.trim().toLowerCase(), rankKey);
        } else {
          byName.set(key.trim().toLowerCase(), rankKey);
        }
      }
    }
    if (!byUuid.size && !byName.size) return false;   // nada que aplicar
    ranks.defs = defs;
    ranks.byUuid = byUuid;
    ranks.byName = byName;
    state.ranksVersion++;
    state.ranksReady = true;
    return true;
  }

  // accounts.json local desde MAIN world: vía el meta mf-skins-base
  // (mismo truco que CustomSkins).
  function localDbUrl() {
    try {
      const meta = document.querySelector('meta[name="mf-skins-base"]');
      const base = meta?.content;
      if (base && /^chrome-extension:/i.test(base)) {
        return base.replace(/skins\/?$/i, '') + 'assets/accounts.json';
      }
    } catch (_) {}
    return '';
  }

  function loadRanksFromDb() {
    // 1) builtin ya está aplicado de arranque
    // 2) local
    const localUrl = localDbUrl();
    const localP = localUrl
      ? fetch(localUrl, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null);
    // 3) viva (GitHub)
    const liveP = fetch(LIVE_DB_URL, { cache: 'reload' }).then(r => r.ok ? r.json() : null).catch(() => null);

    localP.then(local => {
      if (local) applyRanksDb(local);
      return liveP;
    }).then(live => {
      if (live && applyRanksDb(live)) {
        refreshAllTags();
      } else if (live) {
        // la viva no trae ranks: local manda si definió algo distinto
        refreshAllTags();
      }
    }).catch(() => {});
  }

  // Push en vivo (ntfy SSE): recarga los rangos al instante cuando el bot
  // escribe accounts.json — mismo topic que las skins.
  var pushRetry = 0;
  var pushTimer = null;
  function startRanksPushListener() {
    try {
      const es = new EventSource('https://ntfy.sh/' + PUSH_TOPIC + '/sse');
      es.onmessage = function (e) {
        try {
          const m = JSON.parse(e.data);
          if (m && m.event === 'message' && state.ranksReady) {
            if (pushTimer) return;
            pushTimer = setTimeout(function () {
              pushTimer = null;
              fetch(LIVE_DB_URL, { cache: 'reload' })
                .then(r => r.ok ? r.json() : null)
                .then(live => { if (live && applyRanksDb(live)) refreshAllTags(); })
                .catch(() => {});
            }, 600);
          }
        } catch (_) {}
      };
      es.onerror = function () {
        try { es.close(); } catch (_) {}
        const wait = Math.min(120000, 5000 * Math.pow(2, pushRetry++));
        setTimeout(startRanksPushListener, wait);
        if (pushRetry > 1) pushRetry--;
      };
      es.onopen = function () { pushRetry = 0; };
    } catch (_) {}
  }

  // Defs vivas: el proxy de GuiToast lee de aquí, así que se actualiza solo
  // cuando applyRanksDb() cambia los rangos.
  globalThis.__MF_NATIVE_CUSTOM_RANKS__ = {
    defs: ranks.defs
  };

  function rankOf(value) {
    // uuid directo
    if (typeof value === 'string' && value) {
      const byUuid = ranks.byUuid.get(value.toLowerCase());
      if (byUuid) return byUuid;
      return ranks.byName.get(value.trim().toLowerCase()) || null;
    }
    if (!value || typeof value !== 'object') return null;
    const byUuid = ranks.byUuid.get(String(value.uuid || '').toLowerCase());
    if (byUuid) return byUuid;
    const byName = ranks.byName.get(String(value.username || value.name || '').trim().toLowerCase());
    if (byName) return byName;
    const profile = value.profile;
    if (profile && typeof profile === 'object') {
      const pu = ranks.byUuid.get(String(profile.uuid || '').toLowerCase());
      if (pu) return pu;
      return ranks.byName.get(String(profile.username || profile.name || '').trim().toLowerCase()) || null;
    }
    return null;
  }

  function displayTarget(value) {
    // Nombre a mostrar para el target (mayúsculas como el original)
    if (!value || typeof value !== 'object') return null;
    const candidates = [value.username, value.name, value.profile?.username, value.profile?.name];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return null;
  }

  function rememberNativeRank(name, rank) {
    if (!name || !rank) return;
    state.nativeRanks.set(String(name).toLowerCase(), String(rank));
  }

  function targetNameFromObject(value) {
    // ¿Tiene rango asignado en la DB? → es target
    const rk = rankOf(value);
    if (!rk) return null;
    return displayTarget(value) || value?.profile?.username || value?.username || value?.name || null;
  }

  function patchRecord(value) {
    if (!value || typeof value !== 'object') return null;
    const target = targetNameFromObject(value);
    if (!target) return null;

    const rk = rankOf(value);

    if ('rank' in value) {
      rememberNativeRank(target, value.rank);
      try { value.rank = rk; } catch (_) {}
    }

    if (value.profile && typeof value.profile === 'object') {
      const profileTarget = displayTarget(value) || target;
      if (profileTarget && 'rank' in value.profile) {
        rememberNativeRank(profileTarget, value.profile.rank);
        try { value.profile.rank = rk; } catch (_) {}
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

      if (!guiFile) guiFile = 'GuiToast-CS00K5-z.js'; 
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
            entity.profile.rank = rankOf(entry) || rankOf(entity);
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

  function rankTag(rankKey) {
    const d = ranks.defs[rankKey] || ranks.defs['dev'];
    // Formato del chat de miniblox: tokens \code\ separados por \\ dobles.
    // Byte-exacto con el formato original: \bold\\glow\\#color\\shiny\[TAG]\reset\
    const label = String(d.label || 'DEV');
    const shown = label.startsWith('[') ? label : '[' + label + ']';
    let tag = '';
    if (d.bold) tag += '\\bold';
    if (d.glow) tag += '\\\\glow\\\\' + d.color;
    if (d.shiny) tag += '\\\\shiny';
    if (tag) tag += '\\';
    return tag + shown + '\\reset\\';
  }

  function chatLine(name, message, rankKey) {
    const d = ranks.defs[rankKey] || ranks.defs['dev'];
    // byte-exacto con el original: [tag] \#color\name:\reset\ message
    return `${rankTag(rankKey)} \\${d.color}\\${name}:\\reset\\ ${message}`;
  }

  function systemLine(name, action, rankKey) {
    const d = ranks.defs[rankKey] || ranks.defs['dev'];
    return `${rankTag(rankKey)} \\${d.color}\\${name}\\reset\\ \\yellow\\${action}`;
  }

  function targetFromChat(data) {
    if (data?.from) {
      const byUuid = state.uuidToName.get(String(data.from));
      if (byUuid) {
        return { name: byUuid, rank: ranks.byUuid.get(String(data.from).toLowerCase()) || null };
      }
    }
    const plain = stripFormatting(data?.text);
    // usernames conocidos de la DB (por nombre) + aprendidos del juego
    const names = new Set(ranks.byName.keys());
    for (const [n] of state.nativeRanks) names.add(n);
    for (const rawName of names) {
      if (!rawName || typeof rawName !== 'string') continue;
      if (ranks.defs[rawName]) continue;   // era un rankKey, no un username
      const rank = ranks.byName.get(rawName.toLowerCase()) || null;
      if (plain.includes(rawName)) return { name: rawName, rank };
    }
    return null;
  }

  function rewriteChatData(data) {
    if (!data || typeof data !== 'object' || typeof data.text !== 'string') return false;
    const target = targetFromChat(data);
    if (!target || !target.name) return false;
    const plain = stripFormatting(data.text);
    let next = null;

    const chatPrefix = target.name + ':';
    const chatIndex = plain.indexOf(chatPrefix);
    if (chatIndex >= 0 && data.publicChat) {
      const message = plain.slice(chatIndex + chatPrefix.length).trimStart();
      next = chatLine(target.name, message, target.rank);
    } else if (plain.includes(target.name + ' has joined the server')) {
      next = systemLine(target.name, 'has joined the server', target.rank);
    } else if (plain.includes(target.name + ' has left the server')) {
      next = systemLine(target.name, 'has left the server', target.rank);
    } else if (plain.includes(target.name + ' joined the server')) {
      next = systemLine(target.name, 'joined the server', target.rank);
    } else if (plain.includes(target.name + ' left the server')) {
      next = systemLine(target.name, 'left the server', target.rank);
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

  function refreshAllTags() {
    // Reparchear todo lo conocido con la DB nueva de rangos
    const game = state.game || findGame();
    if (!game) return;
    try { patchKnownGameData(game); } catch (_) {}
    try { patchChatLog(game); } catch (_) {}
  }

  installEarlyDataHook();
  installNativeResolver();
  loadRanksFromDb();
  startRanksPushListener();

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
