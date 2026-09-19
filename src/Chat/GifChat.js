(function () {
  'use strict';

  // GIF picker for the vanilla game chat, powered by KLIPY.
  // - typing ":gif" in the game chat input (or the tiny GIF button beside it)
  //   opens a searchable GIF overlay
  // - picking one sends the static.klipy.com URL as a normal chat message
  // - every client with MiniFeather renders those URLs as inline GIFs
  // - API requests go MAIN -> ISOLATED bridge -> extension background (no CORS)

  const GLOBAL_KEY = '__MINIFEATHER_GIF_CHAT__';
  const CONFIG_EVENT = 'minifeather:gifchat-config';
  const KLIPY_DEFAULT_KEY = 'TooX4OMhCyQ6UexMQ7wD9zraorJP0FJZcohUhs49XzygxcokDVWcNYD2Y3j4gEMP';
  const KLIPY_CACHE_TTL = 5 * 60 * 1000; // testing mode: 100 req/h — cache hard
  const TRIGGER_RE = /(^|\s):gif\b\s*$/i;
  const KLIPY_URL_RE = /https:\/\/static\.klipy\.com\/[\w./-]+\.(?:gif|webp)(?=\s|$)/gi;

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  const state = {
    enabled: false,
    apiKey: '',
    game: null,
    chat: null,
    scanTimer: 0,
    pickerOpen: false,
    items: [],
    overlay: null,
    button: null,
    chatInputEl: null,
    cache: new Map(), // query -> { ts, items }
    reqId: 0,
    destroyed: false
  };

  // ─── i18n (light; falls back to English) ─────────────────────
  const STRINGS = {
    en: { search: 'Search GIFs…', loading: 'Loading…', none: 'No GIFs found.', error: 'Could not load GIFs.' },
    es: { search: 'Buscar GIFs…', loading: 'Cargando…', none: 'No se encontraron GIFs.', error: 'No se pudieron cargar los GIFs.' },
    pt: { search: 'Pesquisar GIFs…', loading: 'Carregando…', none: 'Nenhum GIF encontrado.', error: 'Não foi possível carregar os GIFs.' },
    fr: { search: 'Rechercher des GIFs…', loading: 'Chargement…', none: 'Aucun GIF trouvé.', error: 'Impossible de charger les GIFs.' },
    de: { search: 'GIFs suchen…', loading: 'Lädt…', none: 'Keine GIFs gefunden.', error: 'GIFs konnten nicht geladen werden.' },
    it: { search: 'Cerca GIF…', loading: 'Caricamento…', none: 'Nessuna GIF trovata.', error: 'Impossibile caricare le GIF.' },
    ru: { search: 'Поиск GIF…', loading: 'Загрузка…', none: 'GIF не найдены.', error: 'Не удалось загрузить GIF.' },
    ja: { search: 'GIFを検索…', loading: '読み込み中…', none: 'GIFが見つかりませんでした。', error: 'GIFを読み込めませんでした。' },
    ko: { search: 'GIF 검색…', loading: '로딩 중…', none: 'GIF를 찾을 수 없습니다.', error: 'GIF를 로드할 수 없습니다.' },
    zh: { search: '搜索 GIF…', loading: '加载中…', none: '未找到 GIF。', error: '无法加载 GIF。' }
  };

  function L(key) {
    let lang = 'en';
    try {
      lang = String(localStorage.getItem('mf_language') || (navigator.language || 'en')).slice(0, 2).toLowerCase();
    } catch (_) {}
    return STRINGS[lang]?.[key] || STRINGS.en[key];
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  // ─── Game / chat discovery (same pattern as ClientCommands) ──
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
    const waypointGame = globalThis.__MINIFEATHER_WAYPOINTS__?.game;
    if (isGame(waypointGame)) return waypointGame;
    return null;
  }

  function ensureChat() {
    if (isGame(state.game)) return state.chat;
    const game = findGame();
    if (game) {
      state.game = game;
      state.chat = game?.chat || null;
    }
    return state.chat;
  }

  // ─── Klipy API (via bridge: MAIN world -> ISOLATED -> background) ──
  function apiKey() {
    return String(state.apiKey || KLIPY_DEFAULT_KEY).trim() || KLIPY_DEFAULT_KEY;
  }

  function bridgeFetch(url) {
    return new Promise((resolve, reject) => {
      const id = 'mfgif' + Math.random().toString(36).slice(2);
      const onRes = (e) => {
        const d = e.detail || {};
        if (d.id !== id) return;
        cleanup();
        if (d.error) reject(new Error(String(d.error)));
        else if (d.data == null || d.data === '') reject(new Error('empty'));
        else resolve(String(d.data));
      };
      const cleanup = () => {
        window.removeEventListener('mf-bg-fetch-result', onRes);
        clearTimeout(timer);
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 8000);
      window.addEventListener('mf-bg-fetch-result', onRes);
      window.dispatchEvent(new CustomEvent('mf-bg-fetch', { detail: JSON.stringify({ id, url }) }));
    });
  }

  function klipyRequest(query) {
    const q = String(query || '').trim();
    const isTrend = !q;
    const cacheKey = isTrend ? 'trending' : 'q:' + q.toLowerCase();
    const hit = state.cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < KLIPY_CACHE_TTL) return Promise.resolve(hit.items);

    const myReq = ++state.reqId;
    const path = isTrend ? 'gifs/trending' : 'gifs/search';
    const url = `https://api.klipy.com/api/v1/${encodeURIComponent(apiKey())}/${path}?per_page=24`
      + (isTrend ? '' : `&q=${encodeURIComponent(q)}`);

    return bridgeFetch(url)
      .then(text => {
        if (myReq !== state.reqId) return [];
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        // response shape: { result, data: { data: [...items] } }
        const list = Array.isArray(json?.data?.data)
          ? json.data.data
          : (Array.isArray(json?.data) ? json.data : []);
        const mapped = [];
        for (const it of list) {
          const thumb = it?.file?.xs?.jpg?.url || it?.file?.sm?.jpg?.url || '';
          const full = it?.file?.sd?.webp?.url || it?.file?.sm?.webp?.url || it?.file?.sd?.gif?.url || '';
          if (thumb && full) mapped.push({ thumb, full });
        }
        state.cache.set(cacheKey, { ts: Date.now(), items: mapped });
        return mapped;
      });
  }

  // ─── Rendering klipy URLs in chat (DOM pipeline, like chatMemes) ──
  const chatObserver = { obs: null };

  function scanNode(node) {
    if (!node) return;
    const root = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    if (root.closest?.('#mf-gifchat-overlay')) return;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(textNode) {
          const parent = textNode.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'A' || tag === 'IFRAME' || tag === 'VIDEO' || tag === 'IMG') return NodeFilter.FILTER_REJECT;
          if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
          if (parent.closest('.mf-gifchat-processed')) return NodeFilter.FILTER_REJECT;
          KLIPY_URL_RE.lastIndex = 0;
          return KLIPY_URL_RE.test(textNode.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      let textNode;
      while ((textNode = walker.nextNode())) renderTextNode(textNode);
    } catch (_) {}
    KLIPY_URL_RE.lastIndex = 0;
  }

  function renderTextNode(node) {
    const text = node.nodeValue || '';
    KLIPY_URL_RE.lastIndex = 0;
    if (!KLIPY_URL_RE.test(text)) return;
    KLIPY_URL_RE.lastIndex = 0;

    const wrapper = document.createElement('span');
    wrapper.className = 'mf-gifchat-processed';
    wrapper.dataset.mfOriginalText = text;

    let cursor = 0;
    let match;
    while ((match = KLIPY_URL_RE.exec(text))) {
      if (match.index > cursor) wrapper.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      const img = document.createElement('img');
      img.className = 'mf-gifchat-img';
      img.src = match[0];
      img.alt = 'GIF';
      img.loading = 'lazy';
      img.decoding = 'async';
      wrapper.appendChild(img);
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) wrapper.appendChild(document.createTextNode(text.slice(cursor)));
    node.replaceWith(wrapper);
  }

  function startRenderer() {
    if (chatObserver.obs) return;
    const style = document.createElement('style');
    style.id = 'mf-gifchat-style';
    style.textContent = `
      .mf-gifchat-img { display:inline-block; width:110px; height:110px; object-fit:cover; border-radius:8px; vertical-align:middle; margin:3px 4px 3px 0; }
      .mf-gifchat-processed { display:inline; }
    `;
    document.head.appendChild(style);

    chatObserver.obs = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(n => scanNode(n));
        } else if (mutation.type === 'characterData') {
          scanNode(mutation.target);
        }
      }
    });
    chatObserver.obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    scanNode(document.body);
  }

  function stopRenderer() {
    if (chatObserver.obs) {
      chatObserver.obs.disconnect();
      chatObserver.obs = null;
    }
    document.getElementById('mf-gifchat-style')?.remove();
    document.querySelectorAll('.mf-gifchat-processed').forEach(el => {
      try { el.replaceWith(document.createTextNode(el.dataset.mfOriginalText || '')); } catch (_) {}
    });
  }

  // ─── Overlay picker UI ───────────────────────────────────────
  function buildOverlay() {
    if (state.overlay) return state.overlay;
    const overlay = document.createElement('div');
    overlay.id = 'mf-gifchat-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="mf-gifc-head">
        <input class="mf-gifc-search" maxlength="64">
        <button class="mf-gifc-close" type="button">✕</button>
      </div>
      <div class="mf-gifc-grid"></div>
      <div class="mf-gifc-powered">Powered by <a href="https://klipy.com" target="_blank" rel="noopener noreferrer">KLIPY</a></div>
    `;
    const css = document.createElement('style');
    css.textContent = `
      #mf-gifchat-overlay {
        position:fixed; left:50%; bottom:22%; transform:translateX(-50%);
        width:min(520px, 92vw);
        background:rgba(9,14,26,.96); border:1px solid #2b3b55; border-radius:14px;
        padding:10px; z-index:2147483000; color:#dbe4f3;
        font-family:system-ui, sans-serif; font-size:12px;
        display:flex; flex-direction:column; gap:8px;
        box-shadow:0 10px 40px rgba(0,0,0,.66);
      }
      #mf-gifchat-overlay .mf-gifc-head { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; }
      #mf-gifchat-overlay .mf-gifc-search {
        background:#0f172a; border:1px solid #27354c; border-radius:8px; color:#e2e8f0;
        padding:7px 10px; font-size:12px; outline:none;
      }
      #mf-gifchat-overlay .mf-gifc-search:focus { border-color:#38bdf8; }
      #mf-gifchat-overlay .mf-gifc-close {
        background:#1e293b; border:1px solid #27354c; color:#94a3b8; border-radius:8px;
        width:32px; cursor:pointer; font-size:13px;
      }
      #mf-gifchat-overlay .mf-gifc-close:hover { color:#e2e8f0; border-color:#475569; }
      #mf-gifchat-overlay .mf-gifc-grid {
        display:grid; grid-template-columns:repeat(auto-fill, minmax(92px,1fr)); gap:6px;
        max-height:min(300px, 40vh); overflow-y:auto; min-height:64px;
      }
      #mf-gifchat-overlay .mf-gifc-cell {
        padding:0; border:1px solid #27354c; border-radius:8px; background:#0b1220;
        cursor:pointer; overflow:hidden; aspect-ratio:1/1;
        display:flex; align-items:center; justify-content:center;
      }
      #mf-gifchat-overlay .mf-gifc-cell:hover { border-color:#38bdf8; }
      #mf-gifchat-overlay .mf-gifc-cell img { width:100%; height:100%; object-fit:cover; display:block; }
      #mf-gifchat-overlay .mf-gifc-note { grid-column:1/-1; color:#64748b; text-align:center; padding:16px 0; }
      #mf-gifchat-overlay .mf-gifc-powered { font-size:10px; color:#64748b; text-align:right; }
      #mf-gifchat-overlay .mf-gifc-powered a { color:#94a3b8; text-decoration:none; }
    `;
    document.head.appendChild(css);
    document.body.appendChild(overlay);

    overlay.querySelector('.mf-gifc-search').placeholder = L('search');
    wireOverlay(overlay);
    state.overlay = overlay;
    return overlay;
  }

  function gridHtml(items) {
    if (!items.length) return `<div class="mf-gifc-note">${escapeHtml(L('none'))}</div>`;
    return items.map(item => `
      <button class="mf-gifc-cell" type="button" data-full="${escapeHtml(item.full)}">
        <img src="${escapeHtml(item.thumb)}" alt="" loading="lazy" decoding="async">
      </button>
    `).join('');
  }

  function loadGrid(query) {
    const grid = state.overlay?.querySelector('.mf-gifc-grid');
    if (!grid) return;
    grid.innerHTML = `<div class="mf-gifc-note">${escapeHtml(L('loading'))}</div>`;
    klipyRequest(query)
      .then(items => {
        if (!state.pickerOpen) return;
        state.items = items;
        grid.innerHTML = gridHtml(items);
      })
      .catch(() => {
        if (state.pickerOpen) grid.innerHTML = `<div class="mf-gifc-note">${escapeHtml(L('error'))}</div>`;
      });
  }

  let searchDebounce = 0;

  function wireOverlay(overlay) {
    overlay.querySelector('.mf-gifc-close').addEventListener('click', () => closePicker());
    const search = overlay.querySelector('.mf-gifc-search');
    search.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => loadGrid(search.value.trim()), 350);
    });
    search.addEventListener('keydown', event => {
      if (event.key === 'Escape') closePicker();
      if (event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(searchDebounce);
        loadGrid(search.value.trim());
      }
      event.stopPropagation();
    });
    overlay.querySelector('.mf-gifc-grid').addEventListener('click', event => {
      const cell = event.target.closest('.mf-gifc-cell');
      if (!cell) return;
      const item = state.items.find(i => i.full === cell.dataset.full);
      if (item) sendGif(item);
    });
  }

  function openPicker() {
    const chat = ensureChat();
    if (!chat) return;
    const overlay = buildOverlay();
    overlay.hidden = false;
    state.pickerOpen = true;
    loadGrid('');
    setTimeout(() => overlay.querySelector('.mf-gifc-search')?.focus(), 30);
  }

  function closePicker() {
    state.pickerOpen = false;
    if (state.overlay) state.overlay.hidden = true;
  }

  function sendGif(item) {
    const chat = ensureChat();
    if (!chat) return;
    const game = state.game;
    try {
      try { chat.setInputValue?.(item.full); } catch (_) { try { chat.inputValue = item.full; } catch (_) {} }
      chat.submit(game);
    } catch (e) {
      console.warn('[MiniFeather GifChat] send failed', e);
      return;
    }
    try { chat.closeInput?.(); } catch (_) {}
    closePicker();
  }

  // ─── Tiny GIF button + ':gif' typing trigger ─────────────────
  function findChatInput() {
    // the game chat input is a real <input>; while the chat is open it is
    // the visible/focused one at the bottom of the HUD
    if (state.chatInputEl && document.body.contains(state.chatInputEl) && state.chatInputEl.offsetParent !== null) {
      return state.chatInputEl;
    }
    state.chatInputEl = null;
    const candidates = document.querySelectorAll('input[type="text"], input:not([type])');
    for (const input of candidates) {
      if (input.closest('#mf-gifchat-overlay')) continue;
      if (input.closest('#mf-gui, #mf-gui-overlay')) continue; // our panel
      if (input.offsetParent === null) continue; // hidden
      state.chatInputEl = input; // keep the last visible one (chat bar)
    }
    return state.chatInputEl;
  }

  function ensureButton() {
    const input = findChatInput();
    if (!input) return;
    if (state.button && state.button.parentElement === input.parentElement) return;
    state.button?.remove();
    state.button = null;

    const btn = document.createElement('button');
    btn.id = 'mf-gifchat-btn';
    btn.type = 'button';
    btn.textContent = 'GIF';
    btn.title = 'MiniFeather GIFs (:gif)';
    const wrapper = input.parentElement;
    if (!wrapper) return;
    if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
    wrapper.appendChild(btn);
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openPicker();
    });
    state.button = btn;
  }

  function injectButtonStyle() {
    if (document.getElementById('mf-gifchat-btn-style')) return;
    const css = document.createElement('style');
    css.id = 'mf-gifchat-btn-style';
    css.textContent = `
      #mf-gifchat-btn {
        position:absolute; right:6px; top:50%; transform:translateY(-50%);
        background:rgba(30,41,59,.8); color:#7dd3fc; border:1px solid #2b4a63; border-radius:6px;
        font-size:10px; font-weight:700; letter-spacing:.4px; padding:2px 7px;
        cursor:pointer; z-index:50; font-family:system-ui, sans-serif;
      }
      #mf-gifchat-btn:hover { background:#334155; color:#bae6fd; }
    `;
    document.head.appendChild(css);
  }

  function hookTyping() {
    document.addEventListener('input', event => {
      if (!state.enabled || state.pickerOpen) return;
      const target = event.target;
      if (!target || target.tagName !== 'INPUT') return;
      if (target.closest('#mf-gifchat-overlay')) return;
      const chat = ensureChat();
      // only when the game chat input is open — that's the chat bar
      if (!chat?.showInput && !chat?.inputOpen) return;
      const value = String(target.value || '');
      if (!TRIGGER_RE.test(value)) return;
      // clear the trigger and open the picker
      try { chat.setInputValue?.(''); } catch (_) {}
      if (target.value) target.value = '';
      openPicker();
    }, true);
  }

  // ─── Config from panel ───────────────────────────────────────
  function onConfig(event) {
    let detail = event.detail;
    try { detail = typeof detail === 'string' ? JSON.parse(detail) : detail; } catch (_) { return; }
    if (!detail || typeof detail !== 'object') return;
    if (typeof detail.enabled === 'boolean') state.enabled = detail.enabled;
    if (typeof detail.apiKey === 'string') {
      if (state.apiKey !== detail.apiKey) state.cache.clear();
      state.apiKey = detail.apiKey;
    }
    sync();
  }

  function sync() {
    if (state.enabled && !state.destroyed) {
      startRenderer();
      injectButtonStyle();
      if (!state.scanTimer) {
        state.scanTimer = window.setInterval(() => {
          if (state.enabled) { ensureChat(); ensureButton(); }
        }, 1200);
      }
      ensureChat();
      ensureButton();
    } else {
      closePicker();
      stopRenderer();
      if (state.scanTimer) { clearInterval(state.scanTimer); state.scanTimer = 0; }
      state.button?.remove();
      state.button = null;
      state.chatInputEl = null;
    }
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    state.enabled = false;
    sync();
    clearInterval(state.scanTimer);
    document.removeEventListener(CONFIG_EVENT, onConfig);
    state.overlay?.remove();
    state.overlay = null;
    if (globalThis[GLOBAL_KEY]?.destroy === destroy) delete globalThis[GLOBAL_KEY];
  }

  document.addEventListener(CONFIG_EVENT, onConfig);
  hookTyping();
  globalThis[GLOBAL_KEY] = {
    open: openPicker,
    close: closePicker,
    setApiKey(key) { state.apiKey = String(key || ''); state.cache.clear(); },
    destroy
  };
})();
