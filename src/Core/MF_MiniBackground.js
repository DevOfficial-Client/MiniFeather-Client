// minifeather minibackground. the service worker's understudy, living inside the page.
// handles every chrome.runtime.sendMessage/connect the client throws at the background.
// network redirects live in MF_InPageRedirects.js; here we only persist preferences. :D
(function () {
  'use strict';
  if (window.__MF_MINI_BG__) return;

  const SHIM = window.__MF_SHIM__;
  if (!SHIM) return; // the shim must load first, obviously :v

  const BUILD = SHIM.build;

  const SKINS = [
    "alice", "bob", "techno", "thebiggelo", "corrupted", "diana", "strange", "endoskeleton",
    "ganyu", "georgenotfound", "holly", "hutao", "jake", "james", "klee", "kyoko",
    "adele", "chris", "deadpool", "galactus", "heather", "ironman", "suit", "levi", "lexi",
    "natalie", "remus", "sara", "transformer", "vindicate", "adventure", "aether", "apex",
    "ariel", "aurora", "celeste", "cody", "ember", "finn", "glory", "hunter", "katie",
    "nova", "panda", "raven", "seraphina", "vain", "zane", "tester", "qhyun", "banana",
    "sushi", "ethan", "duck", "cat", "remlin"
  ];
  const CAPES = [
    "angry-pig", "bao", "cloud", "cow", "creeper", "golden-apple", "grass-block", "heart",
    "pumpkin", "maki", "mushroom", "soul-creeper", "sushi", "salmon", "amethyst", "cheeser",
    "crimson-voyager", "duck", "frie", "galaxy", "migration", "shaded-green", "skulk",
    "withered", "yellow", "yin-yang", "wooden-sword", "stone-sword", "iron-sword",
    "gold-sword", "diamond-sword", "emerald-sword"
  ];
  const ASSET_TYPES = {
    skin: { names: SKINS, storageKey: "currentSkins" },
    cape: { names: CAPES, storageKey: "currentCapes" }
  };

  async function setActiveAsset(type, name, customUrl) {
    const config = ASSET_TYPES[type];
    if (!config) throw new Error(`unknown asset type: ${type}`);
    if (name && !config.names.includes(name)) throw new Error(`unknown ${type}: ${name}`);
    const stored = await chrome.storage.local.get([config.storageKey]);
    const active = stored[config.storageKey] || {};
    if (name) {
      if (customUrl) active[name] = customUrl;
      else delete active[name];
    }
    await chrome.storage.local.set({ [config.storageKey]: active });
  }

  async function resetAllAssets(type) {
    const config = ASSET_TYPES[type];
    if (!config) throw new Error(`unknown asset type: ${type}`);
    await chrome.storage.local.set({ [config.storageKey]: {} });
  }

  const OWNER = 'DevOfficial-Client';
  const REPO = 'MiniFeather-Client';
  const BRANCH = 'main';
  const REPOSITORY_URL = `https://github.com/${OWNER}/${REPO}`;
  const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const RAW_MANIFEST = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/manifest.json`;
  const DOWNLOAD_URL = `${REPOSITORY_URL}/archive/refs/heads/${BRANCH}.zip`;
  // el .user.js crudo: los script managers (tampermonkey/violentmonkey) interceptan
  // la navegación y muestran su página de instalar con 1 clic. donde no hay manager
  // que intercepte (webview del apk, ios, tauri/electron) seguimos con el zip de siempre.
  const RAW_USERSCRIPT_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/dist/MiniFeatherClient.user.js`;
  const CHECK_INTERVAL_MS = 30 * 60 * 1000; // hot updates are life support, check every 30 min :D
  const DEFAULT_UPDATER_SETTINGS = Object.freeze({ autoCheck: true, autoDownload: false, autoApply: true });
  const HOT_KEY = 'mfHotCache';
  const HOT_PLAN_KEY = 'mf:hot:v1'; // hotloader (non-extension mode) reads this exact key from localStorage
  const HOT_APPLIED = 'mfHotAppliedCommit';

  function versionParts(value) {
    return String(value || '0').split('.').map(part => Number.parseInt(part, 10) || 0);
  }
  function compareVersions(a, b) {
    const av = versionParts(a);
    const bv = versionParts(b);
    const length = Math.max(av.length, bv.length);
    for (let i = 0; i < length; i++) {
      const diff = (av[i] || 0) - (bv[i] || 0);
      if (diff) return diff > 0 ? 1 : -1;
    }
    return 0;
  }
  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, '0')).join('');
  }
  async function gitBlobSha(buffer) {
    const bytes = new Uint8Array(buffer);
    const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
    const joined = new Uint8Array(header.byteLength + bytes.byteLength);
    joined.set(header, 0);
    joined.set(bytes, header.byteLength);
    return toHex(await crypto.subtle.digest('SHA-1', joined));
  }
  async function fetchJson(url) {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    return response.json();
  }
  async function getUpdaterSettings() {
    const stored = await chrome.storage.local.get(['mfUpdaterSettings']);
    return { ...DEFAULT_UPDATER_SETTINGS, ...(stored.mfUpdaterSettings || {}) };
  }
  async function readHotList() {
    try {
      const response = await fetch(chrome.runtime.getURL('hotload.json'), { cache: 'no-store' });
      if (response.ok) {
        const json = await response.json();
        if (Array.isArray(json.hot)) return json.hot.filter(e => e && typeof e.path === 'string');
      }
    } catch (_) {}
    return [];
  }
  async function localFileSha(path) {
    try {
      const response = await fetch(chrome.runtime.getURL(path), { cache: 'no-store' });
      if (!response.ok) return null;
      return await gitBlobSha(await response.arrayBuffer());
    } catch (_) { return null; }
  }
  async function fetchRawText(commit, path) {
    const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${commit}/${path}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`raw ${response.status}`);
    const text = await response.text();
    if (!text) throw new Error('empty');
    return text;
  }
  async function getHotCache() {
    const stored = await chrome.storage.local.get([HOT_KEY]);
    return stored[HOT_KEY] || { v: 1, commit: null, ts: 0, files: {}, guards: {}, ok: {} };
  }
  async function persistHotPlan(cache) {
    try {
      if (cache.files && Object.keys(cache.files).length) {
        localStorage.setItem(HOT_PLAN_KEY, JSON.stringify({
          v: 1, commit: cache.commit || null, ts: Date.now(),
          files: cache.files || {}, guards: cache.guards || {}, ok: cache.ok || {}
        }));
      } else {
        localStorage.removeItem(HOT_PLAN_KEY);
      }
    } catch (_) {}
  }
  async function updateHotCache(remoteCommit, remoteTree) {
    const hotList = await readHotList();
    const cache = await getHotCache();
    if (!cache.ok || typeof cache.ok !== 'object') cache.ok = {};
    const treeMap = new Map(
      (remoteTree?.tree || [])
        .filter(item => item?.type === 'blob' && item?.path)
        .map(item => [item.path, item.sha])
    );
    let changed = false;

    for (const entry of hotList) {
      const path = entry.path;
      const remoteSha = treeMap.get(path) || null;
      if (!remoteSha) {
        if (cache.files[path]) { delete cache.files[path]; changed = true; }
        continue;
      }
      // pinned bundles (userscript/tauri/electron) ship a fixed commit, so any remote
      // drift counts. android compares real blob shas against the packaged copy instead.
      const localSha = BUILD.pinned ? (BUILD.commit === remoteCommit ? remoteSha : null) : await localFileSha(path);
      if (localSha === remoteSha) {
        if (cache.files[path]) { delete cache.files[path]; changed = true; }
        continue;
      }
      try {
        cache.files[path] = await fetchRawText(remoteCommit, path);
        cache.guards[path] = Array.isArray(entry.guards) ? entry.guards : [];
        cache.ok[path] = Array.isArray(entry.ok) ? entry.ok : [];
        changed = true;
      } catch (_) {}
    }

    cache.commit = remoteCommit || null;
    cache.ts = Date.now();
    await chrome.storage.local.set({ [HOT_KEY]: cache });
    await persistHotPlan(cache);

    if (changed && Object.keys(cache.files).length) {
      const settings = await getUpdaterSettings();
      const prev = (await chrome.storage.local.get([HOT_APPLIED]))[HOT_APPLIED] || '';
      const isNew = remoteCommit && prev !== remoteCommit;
      if (settings.autoApply && isNew) {
        await chrome.storage.local.set({ [HOT_APPLIED]: remoteCommit });
        scheduleHotReload();
      } else if (isNew) {
        const st = (await chrome.storage.local.get(['mfUpdaterState'])).mfUpdaterState || {};
        await saveState({ ...st, updateAvailable: true, reason: 'hot', hotCommit: remoteCommit });
      }
    }
    return cache;
  }

  async function saveState(s) {
    await chrome.storage.local.set({ mfUpdaterState: s });
    return s;
  }

  // hot modules only apply on next load, so reload the page when fresh code lands.
  // same courtesy the extension had: never reload mid-match (document.title is exactly
  // what chrome.tabs.query peeked at from the tab list). :v
  function scheduleHotReload() {
    try {
      if (/planet-|in game|playing/i.test(document.title || '')) return;
      setTimeout(() => { try { location.reload(); } catch (_) {} }, 1500);
    } catch (_) {}
  }

  async function checkForUpdate(force) {
    const previous = await chrome.storage.local.get(['mfUpdaterState', 'mfUpdaterLastMatchedCommit']);
    const previousState = previous.mfUpdaterState || null;
    const now = Date.now();

    if (!force && previousState?.checkedAt && now - previousState.checkedAt < CHECK_INTERVAL_MS) {
      return previousState;
    }

    const localVersion = BUILD.version || '0.0.0';
    try {
      const commit = await fetchJson(`${API_BASE}/commits/${encodeURIComponent(BRANCH)}?t=${now}`);
      const remoteCommit = commit.sha || '';
      const remoteCommitDate = commit?.commit?.committer?.date || commit?.commit?.author?.date || null;
      const remoteMessage = String(commit?.commit?.message || '').split('\n')[0].slice(0, 160);

      const manifestResponse = await fetch(`${RAW_MANIFEST}?t=${now}`, { cache: 'no-store' });
      if (!manifestResponse.ok) throw new Error(`manifest ${manifestResponse.status}`);
      const remoteManifest = await manifestResponse.json();
      const remoteVersion = remoteManifest.version || '0.0.0';

      let hotCache = null;
      try { hotCache = await updateHotCache(remoteCommit, null); } catch (_) {}

      const versionNewer = compareVersions(remoteVersion, localVersion) > 0;
      const lastMatchedCommit = previous.mfUpdaterLastMatchedCommit || '';
      const localCommit = BUILD.commit || '';

      let updateAvailable = false;
      let reason = 'current';
      if (localCommit && remoteCommit === localCommit) {
        reason = 'current';
        await chrome.storage.local.set({ mfUpdaterLastMatchedCommit: remoteCommit });
      } else if (versionNewer) {
        updateAvailable = true; reason = 'version';
      } else if (hotCache && Object.keys(hotCache.files || {}).length) {
        updateAvailable = true; reason = 'hot';
      } else if (lastMatchedCommit && remoteCommit && remoteCommit !== lastMatchedCommit) {
        updateAvailable = true; reason = 'build';
      } else {
        reason = 'local_modified';
      }

      const st = {
        success: true,
        checkedAt: now,
        installedVersion: localVersion,
        remoteVersion,
        remoteCommit,
        remoteShortCommit: remoteCommit.slice(0, 7),
        remoteCommitDate,
        remoteMessage,
        updateAvailable,
        reason,
        filesMatch: reason === 'current',
        changedFiles: [],
        hotFiles: hotCache ? Object.keys(hotCache.files || {}).length : 0,
        hotCommit: hotCache?.commit || null,
        repositoryUrl: REPOSITORY_URL,
        downloadUrl: DOWNLOAD_URL
      };
      await saveState(st);

      const settings = await getUpdaterSettings();
      if (updateAvailable && settings.autoDownload) {
        const lastDownload = (await chrome.storage.local.get(['mfUpdaterLastDownloadedCommit'])).mfUpdaterLastDownloadedCommit || '';
        if (!remoteCommit || lastDownload !== remoteCommit) {
          try { await downloadLatest(st); } catch (_) {}
        }
      }
      return st;
    } catch (error) {
      return saveState({
        ...(previousState || {}),
        success: false,
        checkedAt: now,
        installedVersion: localVersion,
        updateAvailable: false,
        reason: 'error',
        error: String(error?.message || error),
        repositoryUrl: REPOSITORY_URL,
        downloadUrl: DOWNLOAD_URL
      });
    }
  }

  async function downloadLatest(current) {
    const st = current || (await chrome.storage.local.get(['mfUpdaterState'])).mfUpdaterState || {};
    await chrome.storage.local.set({ mfUpdaterLastDownloadedCommit: st.remoteCommit || '' });
    // tampermonkey/violentmonkey (desktop + firefox android) interceptan la URL del
    // .user.js con su página de instalación de 1 clic. ios (app userscripts), el
    // webview del apk y tauri/electron no interceptan nada: ahí el zip es lo que
    // hay — el downloader del sistema lo recibe y listo. nadie filing bugs :v
    const ua = navigator.userAgent || '';
    const hasManager = !(/;\s*wv\)/.test(ua) || /iPhone|iPad|iPod/.test(ua) || /Electron|Tauri/i.test(ua));
    try { window.open(hasManager ? RAW_USERSCRIPT_URL : DOWNLOAD_URL, '_blank'); } catch (_) {}
    return 0;
  }

  const NTFY_HTTP_BASE = "https://ntfy.sh";
  const CLIENT_CHAT_TOPIC = "mfcc-7f41c6d8b92e4a63b5f1-global-v2";
  const CLIENT_CHAT_SIGNAL_PORT = "minifeather-client-chat-signal";
  const VOICE_SIGNAL_TOPIC = "mfvoice-v1-37b1d90a6e4c";
  const VOICE_SIGNAL_PORT = "minifeather-voice-signal";
  const LOCAL_GAMES_NETWORK_PORT = "minifeather-localgames-network";

  function ntfySafeTopic(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
  }
  function ntfyWsUrl(topic, since) {
    const safe = ntfySafeTopic(topic);
    const query = new URLSearchParams({ since: String(since || "30s") });
    return `wss://ntfy.sh/${safe}/ws?${query}`;
  }
  function ntfyNetworkOnline() {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }
  function ntfyRetryDelay(failures) {
    return Math.min(60000, 1500 * (2 ** Math.min(Math.max(0, failures), 6)));
  }
  async function ntfyPublish(topic, message, signal) {
    const safe = ntfySafeTopic(topic);
    if (!safe) throw new Error("INVALID_TOPIC");
    if (!ntfyNetworkOnline()) throw new Error("NETWORK_OFFLINE");
    const requestController = new AbortController();
    const forwardAbort = () => requestController.abort(signal?.reason);
    const timeout = setTimeout(() => requestController.abort("PUBLISH_TIMEOUT"), 9000);
    signal?.addEventListener?.("abort", forwardAbort, { once: true });
    try {
      const response = await fetch(`${NTFY_HTTP_BASE}/${safe}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8", "Cache": "no", "Firebase": "no" },
        body: String(message || ""),
        cache: "no-store",
        signal: requestController.signal
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener?.("abort", forwardAbort);
    }
  }
  function openNtfySocket(topic, since, handlers) {
    const safe = ntfySafeTopic(topic);
    if (!safe) throw new Error("INVALID_TOPIC");
    const socket = new WebSocket(ntfyWsUrl(safe, since));
    socket.addEventListener("open", () => handlers.open?.());
    socket.addEventListener("message", event => {
      let packet;
      try { packet = JSON.parse(String(event.data || "")); } catch (_) { return; }
      if (packet?.event === "message" && packet.message != null) handlers.message?.(packet);
    });
    socket.addEventListener("error", () => handlers.error?.());
    socket.addEventListener("close", () => handlers.close?.());
    return socket;
  }

  const singleTopicPorts = new Map();

  function startSingleTopic(port, entry) {
    const topic = entry.topic;
    if (entry.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(entry.socket.readyState)) return;
    if (!ntfyNetworkOnline()) {
      port._deliver({ type: "offline", error: "NETWORK_OFFLINE" });
      entry.timer = setTimeout(() => startSingleTopic(port, entry), 15000);
      return;
    }
    try {
      const since = topic === VOICE_SIGNAL_TOPIC ? "5s" : "45s";
      const current = openNtfySocket(topic, since, {
        open() {
          if (entry.socket !== current) return;
          entry.failures = 0;
          port._deliver({ type: "ready" });
        },
        message(packet) {
          if (entry.socket !== current) return;
          let signal;
          try { signal = JSON.parse(String(packet.message || "")); } catch (_) { return; }
          port._deliver({ type: "signal", signal });
        },
        error() {
          if (entry.socket !== current) return;
          port._deliver({ type: "offline", error: "WEBSOCKET_ERROR" });
        },
        close() {
          if (entry.stopped || entry.socket !== current) return;
          entry.socket = null;
          port._deliver({ type: "offline", error: "WEBSOCKET_CLOSED" });
          entry.timer = setTimeout(() => startSingleTopic(port, entry), ntfyNetworkOnline() ? ntfyRetryDelay(entry.failures++) : 15000);
        }
      });
      entry.socket = current;
    } catch (_) {
      port._deliver({ type: "offline", error: "WEBSOCKET_UNAVAILABLE" });
      entry.timer = setTimeout(() => startSingleTopic(port, entry), ntfyNetworkOnline() ? ntfyRetryDelay(entry.failures++) : 15000);
    }
  }

  const multiTopicPorts = new Map();

  function startMultiTopic(port, entry, topic, since) {
    const safe = ntfySafeTopic(topic);
    if (!safe || entry.stopped) return;
    const existing = entry.subscriptions.get(safe);
    if (existing?.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(existing.socket.readyState)) {
      port._deliver({ type: "subscribed", topic: safe });
      return;
    }
    if (existing) stopMultiTopic(entry, safe);

    const sub = { socket: null, timer: 0, failures: 0, since: String(since || "30s") };
    entry.subscriptions.set(safe, sub);

    const connect = () => {
      if (entry.stopped || entry.subscriptions.get(safe) !== sub) return;
      if (sub.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(sub.socket.readyState)) return;
      if (!ntfyNetworkOnline()) {
        port._deliver({ type: "topic-offline", topic: safe });
        sub.timer = setTimeout(connect, 15000);
        return;
      }
      try {
        const current = openNtfySocket(safe, sub.since, {
          open() {
            if (entry.subscriptions.get(safe) !== sub || sub.socket !== current) return;
            sub.failures = 0;
            sub.since = "30s";
            port._deliver({ type: "subscribed", topic: safe });
          },
          message(packet) {
            if (entry.subscriptions.get(safe) !== sub || sub.socket !== current) return;
            port._deliver({ type: "event", topic: safe, id: String(packet.id || ""), message: String(packet.message || "") });
          },
          error() {
            if (entry.subscriptions.get(safe) !== sub || sub.socket !== current) return;
            port._deliver({ type: "topic-offline", topic: safe });
          },
          close() {
            if (entry.stopped || entry.subscriptions.get(safe) !== sub || sub.socket !== current) return;
            sub.socket = null;
            sub.timer = setTimeout(connect, ntfyNetworkOnline() ? ntfyRetryDelay(sub.failures++) : 15000);
          }
        });
        sub.socket = current;
      } catch (_) {
        sub.timer = setTimeout(connect, 15000);
      }
    };
    connect();
  }
  function stopMultiTopic(entry, topic) {
    const sub = entry.subscriptions.get(topic);
    if (!sub) return;
    entry.subscriptions.delete(topic);
    clearTimeout(sub.timer);
    try { sub.socket?.close(); } catch (_) {}
  }

  const miniBg = {
    ports: new Set(),

    async handleMessage(message) {
      try {
        if (message?.type === 'mfAccounts:get') {
          const url = chrome.runtime.getURL('assets/accounts.json');
          try {
            const r = await fetch(url, { cache: 'no-store' });
            return { success: true, json: r.ok ? await r.json() : null };
          } catch (_) {
            return { success: false, json: null };
          }
        }

        if (message?.type === 'setSkin') { await setActiveAsset("skin", message.skinName, message.customUrl); return { success: true }; }
        if (message?.type === 'resetSkin') { await setActiveAsset("skin", message.skinName, null); return { success: true }; }
        if (message?.type === 'resetAllSkins') { await resetAllAssets("skin"); return { success: true }; }
        if (message?.type === 'setCape') { await setActiveAsset("cape", message.capeName, message.customUrl); return { success: true }; }
        if (message?.type === 'resetCape') { await setActiveAsset("cape", message.capeName, null); return { success: true }; }
        if (message?.type === 'resetAllCapes') { await resetAllAssets("cape"); return { success: true }; }

        if (message?.type === "getSkins") {
          const data = await chrome.storage.local.get(["currentSkins"]);
          return { success: true, skins: data.currentSkins || {} };
        }
        if (message?.type === "getCapes") {
          const data = await chrome.storage.local.get(["currentCapes"]);
          return { success: true, capes: data.currentCapes || {} };
        }
        if (message?.type === "getSkinList") return { success: true, skins: SKINS };
        if (message?.type === "getCapeList") return { success: true, capes: CAPES };

        if (message?.type === "MF_KLIPY_FETCH" || message?.type === "MF_BRIDGE_FETCH") {
          const KLIPY_API_RE = /^https:\/\/api\.klipy\.com\/api\/v1\/[\w-]+\/gifs\/(search|trending)(\?.*)?$/;
          const url = String(message.url || "");
          if (!KLIPY_API_RE.test(url)) return { data: "" };
          try {
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) throw new Error("HTTP " + r.status);
            return { data: await r.text() };
          } catch (error) {
            return { data: "", error: String(error?.message || error) };
          }
        }

        if (message?.type === "MF_UPLOAD_IMAGE") {
          // paste/drag chat images: upload to catbox (no account, permanent urls, no
          // github). endpoint is exact-match so the proxy stays locked down. :D
          try {
            const bytes = Uint8Array.from(atob(String(message.b64 || "")), ch => ch.charCodeAt(0));
            const form = new FormData();
            form.append("reqtype", "fileupload");
            form.append("fileToUpload", new File([bytes], String(message.name || "image.png"), { type: String(message.mime || "image/png") }));
            const res = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form });
            const url = (await res.text()).trim();
            if (!res.ok || !/^https:\/\/files\.catbox\.moe\/[\w.]+$/.test(url)) throw new Error("catbox " + res.status);
            return { success: true, url };
          } catch (error) {
            return { success: false, error: String(error?.message || error) };
          }
        }
        if (message?.type === "mfSetPageZoom") {
          // the panel's scale slider. css zoom breaks the game's canvas sizing math, so
          // embedded apps take the 68% at the native device-scale layer instead; here we
          // just remember the preference and acknowledge. :v
          try { localStorage.setItem('mf:pageZoom', String(Math.min(5, Math.max(0.25, Number(message.zoom) || 1)))); } catch (_) {}
          return { success: true };
        }

        if (message?.type === "setSpritesheet") { await chrome.storage.local.set({ spritesheetEnabled: message.enabled }); return { success: true }; }
        if (message?.type === "getSpritesheet") {
          const data = await chrome.storage.local.get(["spritesheetEnabled"]);
          return { success: true, enabled: data.spritesheetEnabled !== false };
        }
        if (message?.type === "setCustomSpritesheet") { await chrome.storage.local.set({ mfCustomSpritesheetUrl: message.url || null }); return { success: true }; }
        if (message?.type === "getCustomSpritesheet") {
          const data = await chrome.storage.local.get(["mfCustomSpritesheetUrl"]);
          return { success: true, url: data.mfCustomSpritesheetUrl || null };
        }
        if (message?.type === "setLocalTextures") { await chrome.storage.local.set({ localTexturesEnabled: message.enabled }); return { success: true }; }
        if (message?.type === "getLocalTextures") {
          const data = await chrome.storage.local.get(["localTexturesEnabled"]);
          return { success: true, enabled: data.localTexturesEnabled !== false };
        }
        if (message?.type === "setMenuUiOverride") { await chrome.storage.local.set({ menuUiOverrideEnabled: message.enabled }); return { success: true }; }
        if (message?.type === "getMenuUiOverride") {
          const data = await chrome.storage.local.get(["menuUiOverrideEnabled"]);
          return { success: true, enabled: data.menuUiOverrideEnabled !== false };
        }

        if (message?.type === 'mfHot:sync') {
          const cache = await getHotCache();
          return {
            success: true,
            commit: cache.commit,
            files: cache.files || {},
            guards: cache.guards || {},
            ok: cache.ok || {}
          };
        }

        if (message?.type === 'mfUpdater:getState') {
          const data = await chrome.storage.local.get(['mfUpdaterState', 'mfUpdaterSettings']);
          return {
            success: true,
            state: data.mfUpdaterState || null,
            settings: { ...DEFAULT_UPDATER_SETTINGS, ...(data.mfUpdaterSettings || {}) }
          };
        }
        if (message?.type === 'mfUpdater:check') {
          const st = await checkForUpdate(message.force !== false);
          return { success: true, state: st, settings: await getUpdaterSettings() };
        }
        if (message?.type === 'mfUpdater:setSettings') {
          const current = await getUpdaterSettings();
          const next = { ...current, ...(message.settings || {}) };
          await chrome.storage.local.set({ mfUpdaterSettings: next });
          return { success: true, settings: next };
        }
        if (message?.type === 'mfUpdater:download') {
          const id = await downloadLatest();
          return { success: true, downloadId: id };
        }

        return { success: false, error: 'mf_mini_bg: unknown message ' + (message?.type || String(message)) };
      } catch (error) {
        return { success: false, error: String(error?.message || error) };
      }
    },

    portConnected(port) {
      this.ports.add(port);
      if (port.name === CLIENT_CHAT_SIGNAL_PORT || port.name === VOICE_SIGNAL_PORT) {
        const entry = {
          topic: port.name === VOICE_SIGNAL_PORT ? VOICE_SIGNAL_TOPIC : CLIENT_CHAT_TOPIC,
          socket: null, timer: 0, failures: 0, stopped: false
        };
        singleTopicPorts.set(port, entry);
        startSingleTopic(port, entry);
        return;
      }
      if (port.name === LOCAL_GAMES_NETWORK_PORT) {
        const entry = { subscriptions: new Map(), stopped: false };
        multiTopicPorts.set(port, entry);
        return;
      }
    },

    portMessage(port, message) {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'ping') return;

      if (singleTopicPorts.has(port)) {
        const entry = singleTopicPorts.get(port);
        if (message.type !== 'publish' || !message.payload) return;
        ntfyPublish(entry.topic, JSON.stringify(message.payload), null)
          .catch(() => port._deliver({ type: "offline", error: "PUBLISH_FAILED" }));
        return;
      }

      if (multiTopicPorts.has(port)) {
        const entry = multiTopicPorts.get(port);
        if (message.type === 'subscribe') {
          startMultiTopic(port, entry, message.topic, message.since);
        } else if (message.type === 'unsubscribe') {
          stopMultiTopic(entry, ntfySafeTopic(message.topic));
        } else if (message.type === 'publish') {
          const requestId = String(message.requestId || "");
          ntfyPublish(message.topic, message.message, null)
            .then(() => port._deliver({ type: "published", requestId, ok: true }))
            .catch(error => port._deliver({
              type: "published", requestId, ok: false,
              error: String(error?.message || error || "PUBLISH_FAILED")
            }));
        }
      }
    },

    portDisconnected(port) {
      this.ports.delete(port);
      const single = singleTopicPorts.get(port);
      if (single) {
        single.stopped = true;
        clearTimeout(single.timer);
        try { single.socket?.close(); } catch (_) {}
        singleTopicPorts.delete(port);
      }
      const multi = multiTopicPorts.get(port);
      if (multi) {
        multi.stopped = true;
        for (const topic of [...multi.subscriptions.keys()]) stopMultiTopic(multi, topic);
        multiTopicPorts.delete(port);
      }
    }
  };
  window.__MF_MINI_BG__ = miniBg;

  (async () => {
    try {
      const existing = await chrome.storage.local.get(["settings", "spritesheetEnabled"]);
      if (!existing.settings) {
        await chrome.storage.local.set({
          settings: {
            rebrand: true, supportAds: false, discord: true,
            keystrokes: true, language: "en"
          }
        });
      }
      if (existing.spritesheetEnabled === undefined) {
        await chrome.storage.local.set({ spritesheetEnabled: true });
      }
      const settings = await getUpdaterSettings();
      if (settings.autoCheck) checkForUpdate(false);
      setInterval(() => { getUpdaterSettings().then(s => { if (s.autoCheck) checkForUpdate(false); }); }, CHECK_INTERVAL_MS);
    } catch (_) {}
  })();
})();
