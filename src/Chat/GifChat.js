(function () {
  'use strict';

  // GIF picker for the vanilla game chat, powered by KLIPY.
  // - typing ":gif" in the game chat input (or the tiny GIF button inside it)
  //   opens a preview BAR anchored right above the chat input
  // - the chat input text itself drives the search (type "cats" to search cats)
  // - Tab / Shift+Tab cycles the previews, Enter sends the selected GIF,
  //   Escape closes the bar; clicking a preview also sends it
  // - picking one sends the static.klipy.com URL as a normal chat message
  // - every client with MiniFeather renders those URLs as inline GIFs
  // - API requests go MAIN -> ISOLATED bridge -> extension background (no CORS)

  const GLOBAL_KEY = '__MINIFEATHER_GIF_CHAT__';
  const CONFIG_EVENT = 'minifeather:gifchat-config';
  const KLIPY_DEFAULT_KEY = 'TooX4OMhCyQ6UexMQ7wD9zraorJP0FJZcohUhs49XzygxcokDVWcNYD2Y3j4gEMP';
  const KLIPY_CACHE_TTL = 5 * 60 * 1000; // testing mode: 100 req/h — cache hard
  const TRIGGER_RE = /(^|\s):gif\b\s*$/i;
  const TRIGGER_TOKEN_RE = /(^|\s):gif\b\s*/i;
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
    barOpen: false,
    sel: -1,
    items: [],
    bar: null,
    button: null,
    chatInputEl: null,
    cache: new Map(), // query -> { ts, items }
    reqId: 0,
    destroyed: false
  };

  // ─── i18n (light; falls back to English) ─────────────────────
  const STRINGS = {
    en: { loading: 'Loading…', none: 'No GIFs found.', error: 'Could not load GIFs.', hint: 'Tab to browse · Enter to send · Esc to close' },
    es: { loading: 'Cargando…', none: 'No se encontraron GIFs.', error: 'No se pudieron cargar los GIFs.', hint: 'Tab para navegar · Enter para enviar · Esc para cerrar' },
    pt: { loading: 'Carregando…', none: 'Nenhum GIF encontrado.', error: 'Não foi possível carregar os GIFs.', hint: 'Tab para navegar · Enter para enviar · Esc para fechar' },
    fr: { loading: 'Chargement…', none: 'Aucun GIF trouvé.', error: 'Impossible de charger les GIFs.', hint: 'Tab pour parcourir · Entrée pour envoyer · Échap pour fermer' },
    de: { loading: 'Lädt…', none: 'Keine GIFs gefunden.', error: 'GIFs konnten nicht geladen werden.', hint: 'Tab zum Blättern · Enter zum Senden · Esc zum Schließen' },
    it: { loading: 'Caricamento…', none: 'Nessuna GIF trovata.', error: 'Impossibile caricare le GIF.', hint: 'Tab per sfogliare · Invio per inviare · Esc per chiudere' },
    ru: { loading: 'Загрузка…', none: 'GIF не найдены.', error: 'Не удалось загрузить GIF.', hint: 'Tab — листать · Enter — отправить · Esc — закрыть' },
    ja: { loading: '読み込み中…', none: 'GIFが見つかりませんでした。', error: 'GIFを読み込めませんでした。', hint: 'Tabで移動 · Enterで送信 · Escで閉じる' },
    ko: { loading: '로딩 중…', none: 'GIF를 찾을 수 없습니다.', error: 'GIF를 로드할 수 없습니다.', hint: 'Tab 이동 · Enter 전송 · Esc 닫기' },
    zh: { loading: '加载中…', none: '未找到 GIF。', error: '无法加载 GIF。', hint: 'Tab 切换 · Enter 发送 · Esc 关闭' }
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
      console.log('[GifChat] bridgeFetch →', url);
      const onRes = (e) => {
        let d = e.detail || {};
        if (typeof d === 'string') {
          try { d = JSON.parse(d); } catch (_) { return; }
        }
        if (d.id !== id) return;
        cleanup();
        console.log('[GifChat] bridgeFetch ← id', id, 'error:', d.error, 'len:', d.data ? String(d.data).length : 0);
        if (d.error) reject(new Error(String(d.error)));
        else if (d.data == null || d.data === '') reject(new Error('empty'));
        else resolve(String(d.data));
      };
      const cleanup = () => {
        window.removeEventListener('mf-bg-fetch-result', onRes);
        clearTimeout(timer);
      };
      const timer = setTimeout(() => { cleanup(); console.warn('[GifChat] bridgeFetch TIMEOUT (¿listener del puente ISOLATED ausente?) id', id); reject(new Error('timeout')); }, 8000);
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
        console.log('[GifChat] klipyRequest OK:', list.length, 'items crudos →', mapped.length, 'mapeados');
        // Expulsar expiradas al insertar: la TTL solo invalidaba lecturas,
        // pero las entradas viejas quedaban retenidas para siempre.
        if (state.cache.size > 40) {
          const now = Date.now();
          for (const [k, v] of state.cache) {
            if (now - v.ts >= KLIPY_CACHE_TTL) state.cache.delete(k);
          }
        }
        state.cache.set(cacheKey, { ts: Date.now(), items: mapped });
        return mapped;
      })
      .catch(err => {
        console.warn('[GifChat] klipyRequest FALLÓ:', err?.message || err);
        throw err;
      });
  }

  // ─── Rendering klipy URLs in chat (DOM pipeline, like chatMemes) ──
  const chatObserver = { obs: null };

  function scanNode(node) {
    if (!node) return;
    const root = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    if (root.closest?.('#mf-gifchat-bar')) return;
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

    // Coalescing: el juego muta el body decenas de veces por frame (HUD,
    // chat, scoreboard); agrupar en un solo lote por rAF y prefiltar con un
    // indexOf barato antes de crear TreeWalkers/regex por mutación
    let pendingNodes = null;
    chatObserver.obs = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(n => queueScan(n));
        } else if (mutation.type === 'characterData') {
          queueScan(mutation.target);
        }
      }
    });

    function queueScan(node) {
      if (!node) return;
      // Prefiltro: sin "static.klipy.com" en el texto no hay nada que hacer —
      // evita el TreeWalker completo para el 99% de las mutaciones del juego
      const text = node.nodeValue || node.textContent || '';
      if (typeof text === 'string' && !text.includes('static.klipy.com')) return;
      if (!pendingNodes) {
        pendingNodes = [node];
        requestAnimationFrame(() => {
          const batch = pendingNodes;
          pendingNodes = null;
          if (!chatObserver.obs) return; // se detuvo entre frames
          for (const n of batch) scanNode(n);
        });
      } else {
        pendingNodes.push(node);
      }
    }

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

  // ─── GIF preview bar (inline strip above the chat input) ─────
  function injectBarStyle() {
    if (document.getElementById('mf-gifchat-bar-style')) return;
    const css = document.createElement('style');
    css.id = 'mf-gifchat-bar-style';
    css.textContent = `
      #mf-gifchat-bar {
        position:absolute; bottom:calc(100% + 8px); left:0; right:0;
        background:rgba(9,14,26,.96); border:1px solid #2b3b55; border-radius:10px;
        padding:6px; z-index:2147483000; color:#dbe4f3;
        font-family:system-ui, sans-serif; font-size:11px;
        box-shadow:0 6px 24px rgba(0,0,0,.55);
      }
      #mf-gifchat-bar[hidden] { display:none; }
      #mf-gifchat-bar .mf-gifc-row {
        display:flex; gap:6px; overflow-x:auto; overflow-y:hidden;
        min-height:68px; align-items:center; scrollbar-width:thin;
      }
      #mf-gifchat-bar .mf-gifc-cell {
        flex:none; width:68px; height:68px; padding:0;
        border:2px solid #27354c; border-radius:8px; background:#0b1220;
        cursor:pointer; overflow:hidden;
      }
      #mf-gifchat-bar .mf-gifc-cell.active { border-color:#38bdf8; box-shadow:0 0 0 1px rgba(56,189,248,.45); }
      #mf-gifchat-bar .mf-gifc-cell img { width:100%; height:100%; object-fit:cover; display:block; }
      #mf-gifchat-bar .mf-gifc-note { flex:1; color:#64748b; text-align:center; padding:20px 0; }
      #mf-gifchat-bar .mf-gifc-foot {
        display:flex; justify-content:space-between; gap:8px; align-items:center;
        margin-top:5px; color:#64748b; font-size:10px; white-space:nowrap; overflow:hidden;
      }
      #mf-gifchat-bar .mf-gifc-powered a { color:#94a3b8; text-decoration:none; }

      #mf-gifchat-btn {
        position:absolute; right:6px; top:50%; transform:translateY(-50%);
        background:rgba(30,41,59,.85); color:#7dd3fc; border:1px solid #2b4a63; border-radius:6px;
        font-size:10px; font-weight:700; letter-spacing:.4px; padding:2px 7px;
        cursor:pointer; z-index:50; font-family:system-ui, sans-serif;
      }
      #mf-gifchat-btn:hover { background:#334155; color:#bae6fd; }
      #mf-gifchat-btn.on { background:#0c4a6e; color:#e0f2fe; border-color:#38bdf8; }
      .mf-gifchat-host > input { padding-right:44px; }
    `;
    document.head.appendChild(css);
  }

  function buildBar() {
    if (state.bar && state.bar.isConnected) return state.bar;
    state.bar?.remove();
    state.bar = null;

    const bar = document.createElement('div');
    bar.id = 'mf-gifchat-bar';
    bar.hidden = true;
    bar.innerHTML = `
      <div class="mf-gifc-row"></div>
      <div class="mf-gifc-foot">
        <span class="mf-gifc-hint"></span>
        <span class="mf-gifc-powered">Powered by <a href="https://klipy.com" target="_blank" rel="noopener noreferrer">KLIPY</a></span>
      </div>
    `;
    document.body.appendChild(bar);
    bar.querySelector('.mf-gifc-hint').textContent = L('hint');
    bar.addEventListener('mousedown', event => event.preventDefault()); // keep chat input focused
    bar.addEventListener('click', event => {
      const cell = event.target.closest('.mf-gifc-cell');
      if (!cell) return;
      const index = Number(cell.dataset.index || -1);
      const item = state.items[index];
      if (item) sendGif(item);
    });
    state.bar = bar;
    return bar;
  }

  function rowHtml(items) {
    if (!items.length) return `<div class="mf-gifc-note">${escapeHtml(L('none'))}</div>`;
    return items.map((item, index) => `
      <button class="mf-gifc-cell${index === state.sel ? ' active' : ''}" type="button" data-index="${index}">
        <img src="${escapeHtml(item.thumb)}" alt="" loading="lazy" decoding="async">
      </button>
    `).join('');
  }

  function updateActive() {
    const row = state.bar?.querySelector('.mf-gifc-row');
    if (!row) return;
    row.querySelectorAll('.mf-gifc-cell').forEach((cell, i) => {
      cell.classList.toggle('active', i === state.sel);
      if (i === state.sel) cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  function loadBar(query) {
    const row = state.bar?.querySelector('.mf-gifc-row');
    if (!row) return;
    row.innerHTML = `<div class="mf-gifc-note">${escapeHtml(L('loading'))}</div>`;
    klipyRequest(query)
      .then(items => {
        if (!state.barOpen) return;
        state.items = items;
        state.sel = items.length ? 0 : -1;
        row.innerHTML = rowHtml(items);
        updateActive();
      })
      .catch(() => {
        if (state.barOpen) row.innerHTML = `<div class="mf-gifc-note">${escapeHtml(L('error'))}</div>`;
      });
  }

  function queryFromInput() {
    const input = state.chatInputEl;
    return String(input?.value || '').replace(TRIGGER_TOKEN_RE, ' ').trim();
  }

  function positionBar() {
    const bar = state.bar;
    const input = state.chatInputEl;
    if (!bar || !input) return;
    const rect = input.getBoundingClientRect();
    const width = Math.min(560, Math.max(280, rect.width), window.innerWidth * 0.92);
    bar.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
    bar.style.top = Math.max(8, rect.top - 8) + 'px';
    bar.style.width = width + 'px';
    // with transform:translateY(-100%), top = input top means the bar sits
    // just above the input; clamp so it never leaves the viewport
    const h = bar.offsetHeight || 0;
    if (rect.top - 8 - h < 0) bar.style.top = (rect.bottom + 8) + 'px';
  }

  function openBar() {
    const input = findChatInput();
    if (!input) { console.warn('[GifChat] openBar: no se encontró el input del chat'); return; }
    injectBarStyle();
    buildBar();
    positionBar();
    state.bar.hidden = false;
    state.barOpen = true;
    state.button?.classList.add('on');
    console.log('[GifChat] barra abierta; query =', JSON.stringify(queryFromInput()));
    loadBar(queryFromInput());
    try { input.focus(); } catch (_) {}
  }

  function closeBar() {
    state.barOpen = false;
    state.button?.classList.remove('on');
    if (state.bar) state.bar.hidden = true;
  }

  function toggleBar() {
    if (state.barOpen) closeBar();
    else openBar();
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
    closeBar();
  }

  // ─── Tiny GIF button inside the chat bar ─────────────────────
  function findChatInput() {
    // the game chat input is a real <input>; while the chat is open it is
    // the visible/focused one at the bottom of the HUD
    if (state.chatInputEl && document.body.contains(state.chatInputEl) && state.chatInputEl.offsetParent !== null) {
      return state.chatInputEl;
    }
    state.chatInputEl = null;
    const candidates = document.querySelectorAll('input[type="text"], input:not([type])');
    for (const input of candidates) {
      if (input.closest('#mf-gifchat-bar')) continue;
      if (input.closest('#mf-gui, #mf-gui-overlay')) continue; // our panel
      if (input.offsetParent === null) continue; // hidden
      state.chatInputEl = input; // keep the last visible one (chat bar)
    }
    return state.chatInputEl;
  }

  function ensureButton() {
    const input = findChatInput();
    if (!input) {
      // chat closed → drop the bar too
      if (state.barOpen) closeBar();
      return;
    }
    const wrapper = input.parentElement;
    if (!wrapper) return;
    if (state.button && state.button.parentElement === wrapper) {
      // React may have re-rendered: re-attach the bar if it vanished while open
      if (state.barOpen && (!state.bar || !state.bar.isConnected)) openBar();
      return;
    }
    state.button?.remove();
    state.button = null;

    const btn = document.createElement('button');
    btn.id = 'mf-gifchat-btn';
    btn.type = 'button';
    btn.textContent = 'GIF';
    btn.title = 'MiniFeather GIFs (:gif)';
    if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
    wrapper.classList.add('mf-gifchat-host');
    wrapper.appendChild(btn);
    btn.addEventListener('mousedown', event => event.preventDefault()); // keep chat input focused
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggleBar();
    });
    state.button = btn;
    if (state.barOpen) openBar();
  }

  // ─── ':gif' trigger + live search + Tab/Enter/Esc handling ───
  let searchDebounce = 0;

  function hookTyping() {
    document.addEventListener('input', event => {
      if (!state.enabled) return;
      const target = event.target;
      if (!target || target.tagName !== 'INPUT') return;
      if (target.closest('#mf-gifchat-bar')) return;
      const chat = ensureChat();
      // only when the game chat input is open — that's the chat bar
      if (!chat?.showInput && !chat?.inputOpen) return;
      const value = String(target.value || '');

      if (state.barOpen) {
        // live search: the chat input text is the query
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => loadBar(value.replace(TRIGGER_TOKEN_RE, ' ').trim()), 350);
        return;
      }

      if (!TRIGGER_RE.test(value)) return;
      // clear the trigger and open the bar
      console.log('[GifChat] trigger :gif detectado — abriendo barra');
      try { chat.setInputValue?.(''); } catch (_) {}
      if (target.value) target.value = '';
      openBar();
    }, true);
  }

  function hookKeys() {
    document.addEventListener('keydown', event => {
      if (!state.enabled || !state.barOpen) return;
      const input = state.chatInputEl;
      if (!input || event.target !== input) return;

      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const n = state.items.length;
        if (!n) return;
        const dir = event.shiftKey ? -1 : 1;
        state.sel = (state.sel + dir + n) % n;
        updateActive();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const item = state.items[state.sel] || state.items[0];
        if (item) sendGif(item);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeBar();
      }
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
      injectBarStyle();
      if (!state.scanTimer) {
        state.scanTimer = window.setInterval(() => {
          if (state.enabled) { ensureChat(); ensureButton(); }
        }, 1200);
      }
      ensureChat();
      ensureButton();
    } else {
      closeBar();
      stopRenderer();
      if (state.scanTimer) { clearInterval(state.scanTimer); state.scanTimer = 0; }
      state.button?.remove();
      state.button = null;
      state.bar?.remove();
      state.bar = null;
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
    state.bar?.remove();
    state.bar = null;
    if (globalThis[GLOBAL_KEY]?.destroy === destroy) delete globalThis[GLOBAL_KEY];
  }

  document.addEventListener(CONFIG_EVENT, onConfig);
  hookTyping();
  hookKeys();
  globalThis[GLOBAL_KEY] = {
    open: openBar,
    close: closeBar,
    toggle: toggleBar,
    setApiKey(key) { state.apiKey = String(key || ''); state.cache.clear(); },
    destroy
  };
})();
