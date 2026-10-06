(function () {
  'use strict';

  const GLOBAL_KEY = '__MINIFEATHER_GIF_CHAT__';
  const CONFIG_EVENT = 'minifeather:gifchat-config';
  const KLIPY_DEFAULT_KEY = 'TooX4OMhCyQ6UexMQ7wD9zraorJP0FJZcohUhs49XzygxcokDVWcNYD2Y3j4gEMP';
  const KLIPY_CACHE_TTL = 5 * 60 * 1000;
  const TRIGGER_RE = /(^|\s):gif\b\s*$/i;
  const TRIGGER_TOKEN_RE = /(^|\s):gif\b\s*/i;
  // klipy gifs + catbox uploads (paste/drag flow). catbox: no account, permanent
  // links, no github involved anywhere in the chain. :D
  const IMG_URL_RE = /https:\/\/(?:static\.klipy\.com\/[\w./-]+\.(?:gif|webp)(?:\?[\w=&.%-]+)?|files\.catbox\.moe\/[\w.]+\.(?:gif|png|jpe?g|webp))(?=[\s.,!?;:)]|$)/gi;

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
    imgButton: null,
    filePicker: null,
    docHooks: false,
    chatInputEl: null,
    cache: new Map(),
    reqId: 0,
    destroyed: false
  };
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
  function apiKey() {
    return String(state.apiKey || KLIPY_DEFAULT_KEY).trim() || KLIPY_DEFAULT_KEY;
  }

  function bridgeFetch(url) {
    return new Promise((resolve, reject) => {
      const id = 'mfgif' + Math.random().toString(36).slice(2);
      console.log('minifeather gifchat bridgeFetch →', url);
      const onRes = (e) => {
        let d = e.detail || {};
        if (typeof d === 'string') {
          try { d = JSON.parse(d); } catch (_) { return; }
        }
        if (d.id !== id) return;
        cleanup();
        console.log('minifeather gifchat bridgeFetch ← id', id, 'error:', d.error, 'len:', d.data ? String(d.data).length : 0);
        if (d.error) reject(new Error(String(d.error)));
        else if (d.data == null || d.data === '') reject(new Error('empty'));
        else resolve(String(d.data));
      };
      const cleanup = () => {
        window.removeEventListener('mf-bg-fetch-result', onRes);
        clearTimeout(timer);
      };
      const timer = setTimeout(() => { cleanup(); console.warn('minifeather gifchat bridgeFetch TIMEOUT (ISOLATED bridge listener missing?) id', id); reject(new Error('timeout')); }, 8000);
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
        const list = Array.isArray(json?.data?.data)
          ? json.data.data
          : (Array.isArray(json?.data) ? json.data : []);
        const mapped = [];
        for (const it of list) {
          const thumb = it?.file?.xs?.jpg?.url || it?.file?.sm?.jpg?.url || '';
          const full = it?.file?.sd?.webp?.url || it?.file?.sm?.webp?.url || it?.file?.sd?.gif?.url || '';
          if (thumb && full) mapped.push({ thumb, full });
        }
        console.log('minifeather gifchat klipyRequest OK:', list.length, 'raw items →', mapped.length, 'mapped');
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
        console.warn('minifeather gifchat klipyRequest failed:', err?.message || err);
        throw err;
      });
  }
  const chatObserver = { obs: null };

  function buildImageWrapper(text) {
    const wrapper = document.createElement('span');
    wrapper.className = 'mf-gifchat-processed';
    wrapper.dataset.mfOriginalText = text;
    let cursor = 0;
    let match;
    IMG_URL_RE.lastIndex = 0;
    while ((match = IMG_URL_RE.exec(text))) {
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
    IMG_URL_RE.lastIndex = 0;
    if (cursor < text.length) wrapper.appendChild(document.createTextNode(text.slice(cursor)));
    return wrapper;
  }

  // fallback for rich-text renderers that fragment the message so no single text
  // node ever holds the full url: find the deepest element whose combined text
  // contains url(s) that no descendant covers alone, and flatten it
  function renderLeafElements(root) {
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode(el) {
          if (el.closest?.('.mf-gifchat-processed, #mf-gifchat-bar, #mf-gifchat-paste')) return NodeFilter.FILTER_REJECT;
          const tag = el.tagName;
          if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'A' || tag === 'IFRAME' || tag === 'VIDEO' || tag === 'IMG') return NodeFilter.FILTER_REJECT;
          if (el.isContentEditable) return NodeFilter.FILTER_REJECT;
          const text = String(el.textContent || '');
          IMG_URL_RE.lastIndex = 0;
          if (!IMG_URL_RE.test(text)) return NodeFilter.FILTER_REJECT;
          // a deeper element or any intact text node already covers it — leave
          // those to the normal text-node path (or the deeper element)
          for (const inner of el.querySelectorAll('*')) {
            IMG_URL_RE.lastIndex = 0;
            if (IMG_URL_RE.test(String(inner.textContent || ''))) return NodeFilter.FILTER_REJECT;
          }
          const twalker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let tn;
          while ((tn = twalker.nextNode())) {
            IMG_URL_RE.lastIndex = 0;
            if (IMG_URL_RE.test(tn.nodeValue || '')) return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const hits = [];
      let el;
      while ((el = walker.nextNode())) hits.push(el);
      for (const el of hits) {
        const text = el.textContent || '';
        el.replaceChildren(buildImageWrapper(text));
        if (!renderLeafElements.logged) {
          renderLeafElements.logged = true;
          console.log('minifeather gifchat: imagen renderizada en el chat (modo hoja)');
        }
      }
    } catch (_) {}
  }

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
          IMG_URL_RE.lastIndex = 0;
          return IMG_URL_RE.test(textNode.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      let textNode;
      while ((textNode = walker.nextNode())) {
        renderTextNode(textNode);
        if (!renderLeafElements.logged) {
          renderLeafElements.logged = true;
          console.log('minifeather gifchat: imagen renderizada en el chat');
        }
      }
    } catch (_) {}
    renderLeafElements(root);
    IMG_URL_RE.lastIndex = 0;
  }

  // red de seguridad para mutaciones que el observador no ve (filas montadas
  // antes de enable, casos raros del reconciler): antes serializaba el
  // textContent de TODO el body cada 1.2s solo para buscar dos substrings.
  // se escanea el contenedor del chat — el input del chat ya lo ancla dentro
  // de #react (la misma raíz que resuelve ensureChat/findGame) — y body solo
  // si el contenedor no está.
  function rescanChat() {
    try {
      const container = state.chatInputEl?.closest('#react') || document.querySelector('#react') || document.body;
      const text = container.textContent || '';
      if (text.includes('files.catbox.moe') || text.includes('static.klipy.com')) scanNode(container);
    } catch (_) {}
  }

  function renderTextNode(node) {
    const text = node.nodeValue || '';
    IMG_URL_RE.lastIndex = 0;
    if (!IMG_URL_RE.test(text)) return;
    node.replaceWith(buildImageWrapper(text));
  }

  function startRenderer() {
    if (chatObserver.obs) return;
    const style = document.createElement('style');
    style.id = 'mf-gifchat-style';
    style.textContent = `
      .mf-gifchat-img { display:inline-block; width:110px; height:110px; object-fit:cover; border-radius:8px; vertical-align:middle; margin:3px 4px 3px 0; }
      .mf-gifchat-processed { display:inline; }
      #mf-gifchat-paste { position:absolute; bottom:calc(100% + 6px); left:0; z-index:60; display:flex; align-items:center; gap:10px; background:#150f24; border:1px solid #6045a0; border-radius:10px; padding:8px 10px; box-shadow:0 10px 30px rgba(0,0,0,.55); max-width:340px; }
      #mf-gifchat-paste img { width:52px; height:52px; object-fit:cover; border-radius:6px; }
      #mf-gifchat-paste .mf-paste-info { display:flex; flex-direction:column; gap:2px; font:400 12px/1.4 system-ui,sans-serif; color:#cfc6ea; overflow:hidden; }
      #mf-gifchat-paste .mf-paste-info b { color:#b79bff; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #mf-gifchat-paste .mf-paste-info span { color:#8d80b8; }
      #mf-gifchat-paste button { background:none; border:0; color:#8d80b8; font-size:15px; cursor:pointer; padding:4px; }
      #mf-gifchat-paste button:hover { color:#ef4444; }
    `;
    document.head.appendChild(style);
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
      const text = node.nodeValue || node.textContent || '';
      if (typeof text === 'string' && !text.includes('static.klipy.com') && !text.includes('files.catbox.moe')) return;
      if (!pendingNodes) {
        pendingNodes = [node];
        requestAnimationFrame(() => {
          const batch = pendingNodes;
          pendingNodes = null;
          if (!chatObserver.obs) return;
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
      #mf-gifchat-img-btn {
        position:absolute; right:46px; top:50%; transform:translateY(-50%);
        background:rgba(30,41,59,.85); color:#c4b5fd; border:1px solid #4c3a75; border-radius:6px;
        font-size:11px; line-height:1; padding:3px 6px 2px;
        cursor:pointer; z-index:50; font-family:system-ui, sans-serif;
      }
      #mf-gifchat-img-btn:hover { background:#334155; }
      .mf-gifchat-host > input { padding-right:86px; }
    `;
    document.head.appendChild(css);
  }

  function buildBar(dock) {
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
    (dock || document.body).appendChild(bar);
    bar.querySelector('.mf-gifc-hint').textContent = L('hint');
    bar.addEventListener('mousedown', event => event.preventDefault());
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

  function openBar() {
    const input = findChatInput();
    if (!input) { console.warn('minifeather gifchat openBar: chat input not found'); return; }
    injectBarStyle();
    buildBar(input.parentElement);
    state.bar.hidden = false;
    state.barOpen = true;
    state.button?.classList.add('on');
    console.log('minifeather gifchat bar opened; query =', JSON.stringify(queryFromInput()));
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
      console.warn('minifeather gifchat send failed', e);
      return;
    }
    try { chat.closeInput?.(); } catch (_) {}
    closeBar();
  }
  function findChatInput() {
    // corremos en todos los frames (all_frames) y alguno no tiene body todavia:
    // sin body no hay chat que buscar, y document.body.contains revienta
    if (!document.body) return null;
    if (state.chatInputEl && document.body.contains(state.chatInputEl) && state.chatInputEl.offsetParent !== null) {
      return state.chatInputEl;
    }
    state.chatInputEl = null;
    const candidates = document.querySelectorAll('input[type="text"], input:not([type])');
    for (const input of candidates) {
      if (input.closest('#mf-gifchat-bar')) continue;
      if (input.closest('#mf-gui, #mf-gui-overlay')) continue;
      if (input.offsetParent === null) continue;
      state.chatInputEl = input;
    }
    return state.chatInputEl;
  }

  function ensureButton() {
    const input = findChatInput();
    if (!input) {
        if (state.barOpen) closeBar();
      return;
    }
    const wrapper = input.parentElement;
    if (!wrapper) return;
    if (state.button && state.button.parentElement === wrapper) {
        if (state.barOpen && (!state.bar || !state.bar.isConnected)) openBar();
      return;
    }
    state.button?.remove();
    state.button = null;
    state.imgButton?.remove();
    state.imgButton = null;

    const btn = document.createElement('button');
    btn.id = 'mf-gifchat-btn';
    btn.type = 'button';
    btn.textContent = 'GIF';
    btn.title = 'MiniFeather GIFs (:gif)';
    const imgBtn = document.createElement('button');
    imgBtn.id = 'mf-gifchat-img-btn';
    imgBtn.type = 'button';
    imgBtn.textContent = '📎';
    imgBtn.title = 'subir imagen al chat — click, pegar (ctrl+v) o arrastrar';
    if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
    wrapper.classList.add('mf-gifchat-host');
    wrapper.appendChild(imgBtn);
    wrapper.appendChild(btn);
    btn.addEventListener('mousedown', event => event.preventDefault());
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggleBar();
    });
    imgBtn.addEventListener('mousedown', event => event.preventDefault());
    imgBtn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openPicker();
    });
    state.imgButton = imgBtn;
    state.button = btn;
    if (state.barOpen) openBar();
  }
  let searchDebounce = 0;

  // handlers con nombre a nivel de módulo: antes eran closures anónimas que
  // ningún destroy() podía descolgar — cada re-ejecución del script apilaba
  // otra pareja de listeners de captura sobre document. ahora se quitan en
  // destroy() y se vuelven a poner al re-iniciar.
  function onTypingInput(event) {
    if (!state.enabled) return;
    const target = event.target;
    if (!target || target.tagName !== 'INPUT') return;
    if (target.closest('#mf-gifchat-bar')) return;
    const chat = ensureChat();
    if (!chat?.showInput && !chat?.inputOpen) return;
    const value = String(target.value || '');

    if (state.barOpen) {
        clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => loadBar(value.replace(TRIGGER_TOKEN_RE, ' ').trim()), 350);
      return;
    }

    if (!TRIGGER_RE.test(value)) return;
    console.log('minifeather gifchat :gif trigger detected — opening bar');
    try { chat.setInputValue?.(''); } catch (_) {}
    if (target.value) target.value = '';
    openBar();
  }

  function onBarKeydown(event) {
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
  }

  function hookTyping() {
    document.removeEventListener('input', onTypingInput, true);
    document.addEventListener('input', onTypingInput, true);
  }

  function hookKeys() {
    document.removeEventListener('keydown', onBarKeydown, true);
    document.addEventListener('keydown', onBarKeydown, true);
  }
  // ---------- paste / drag images: discord-style send via catbox ----------
  const UPLOAD_MIME_RE = /^image\/(png|jpe?g|gif|webp)$/;
  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
  const hookedInputs = new WeakSet();

  function attachInputHooks() {
    const input = findChatInput();
    if (!input || hookedInputs.has(input)) return;
    hookedInputs.add(input);
    input.addEventListener('paste', onPasteImage, true);
    input.addEventListener('dragover', onDragOverImage, true);
    input.addEventListener('dragleave', () => inputDragCue(false), true);
    input.addEventListener('drop', onDropImage, true);
    input.addEventListener('keydown', onInputKeydown, true);
  }

  function inputDragCue(on) {
    const input = state.chatInputEl;
    if (!input) return;
    try { input.style.outline = on ? '2px dashed #7c5cd6' : ''; } catch (_) {}
  }

  function onPasteImage(e) {
    if (!state.enabled) return;
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.kind === 'file' && UPLOAD_MIME_RE.test(item.type)) {
        const file = item.getAsFile();
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        holdImage(file);
        return;
      }
    }
  }

  function onDragOverImage(e) {
    if (!state.enabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    inputDragCue(true);
  }

  function onDropImage(e) {
    if (!state.enabled) return;
    const file = Array.from(e.dataTransfer?.files || []).find(f => UPLOAD_MIME_RE.test(f.type));
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    inputDragCue(false);
    holdImage(file);
  }

  function onInputKeydown(e) {
    if (!state.pendingImage) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      clearPendingImage();
      return;
    }
    // the gif bar keeps its own enter handling when a selection is active
    if (e.key === 'Enter' && !(state.barOpen && state.sel >= 0)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      uploadAndSend();
    }
  }

  function holdImage(file) {
    if (file.size > MAX_UPLOAD_BYTES) {
      state.pendingImage = null;
      showPreview(file, 'demasiado pesada, max 10mb (╥﹏╥)');
      setTimeout(() => { if (!state.pendingImage) hidePreview(); }, 3500);
      return;
    }
    state.pendingImage = file;
    showPreview(file, 'listo · enter para enviar · esc para cancelar (ﾉ´ヮ`)ﾉ*:･ﾟ');
    // the file dialog (and any drag) steals focus from the chat input; enter must
    // land on the input or the send never happens
    try { (state.chatInputEl || findChatInput())?.focus?.(); } catch (_) {}
  }

  // ---------- explicit affordances: the 📎 picker + window-wide paste/drop ----------
  // paste/drag on the bare input was invisible to anyone who didn't already know the
  // trick; now there's a button, and with the chat open the whole window accepts the
  // drop. panel/skin-editor surfaces are off limits so we never steal their events.

  function openPicker() {
    if (!state.enabled) return;
    try {
      const chat = ensureChat();
      chat?.openInput?.(true);
    } catch (_) {}
    if (!state.filePicker) {
      const pick = document.createElement('input');
      pick.id = 'mf-gifchat-img-picker';
      pick.type = 'file';
      pick.accept = 'image/png,image/jpeg,image/gif,image/webp';
      pick.style.display = 'none';
      pick.addEventListener('change', () => {
        const file = pick.files && pick.files[0];
        if (file) holdImage(file);
        pick.value = '';
      });
      document.body.appendChild(pick);
      state.filePicker = pick;
    }
    state.filePicker.click();
  }

  function pickSurfaceBlocked(e) {
    const t = e.target;
    return !!(t && t.closest && t.closest('#mf-gui, #mf-gui-overlay, #mf-skineditor, #mf-studio, #mf-pbreditor, #mf-facial, #mf-morph, #mf-skinchanger, #mf-gifchat-bar, #mf-gifchat-paste, #mf-gifchat-img-picker'));
  }

  function chatOpenForImage() {
    const input = findChatInput();
    return !!(input && input.offsetParent !== null);
  }

  function onDocPaste(e) {
    if (!state.enabled || e.target === state.chatInputEl) return;
    if (!chatOpenForImage() || pickSurfaceBlocked(e)) return;
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.kind === 'file' && UPLOAD_MIME_RE.test(item.type)) {
        const file = item.getAsFile();
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        holdImage(file);
        return;
      }
    }
  }

  function onDocDragOver(e) {
    if (!state.enabled) return;
    if (!chatOpenForImage() || pickSurfaceBlocked(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    inputDragCue(true);
  }

  function onDocDragLeave(e) {
    if (!state.enabled || e.relatedTarget) return;
    inputDragCue(false);
  }

  function onDocDrop(e) {
    if (!state.enabled) return;
    if (!chatOpenForImage() || pickSurfaceBlocked(e)) return;
    const file = Array.from(e.dataTransfer?.files || []).find(f => UPLOAD_MIME_RE.test(f.type));
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    inputDragCue(false);
    holdImage(file);
  }

  function onDocKeydown(e) {
    if (!state.enabled || !state.pendingImage || e.key !== 'Enter') return;
    if (e.target === state.chatInputEl) return;
    if (pickSurfaceBlocked(e) || !chatOpenForImage()) return;
    e.preventDefault();
    e.stopPropagation();
    uploadAndSend();
  }

  function attachDocumentHooks() {
    if (state.docHooks) return;
    state.docHooks = true;
    document.addEventListener('paste', onDocPaste, true);
    document.addEventListener('dragover', onDocDragOver, true);
    document.addEventListener('dragleave', onDocDragLeave, true);
    document.addEventListener('drop', onDocDrop, true);
    document.addEventListener('keydown', onDocKeydown, true);
  }

  function clearPendingImage() {
    state.pendingImage = null;
    hidePreview();
  }

  function hidePreview() {
    state.previewEl?.remove();
    state.previewEl = null;
    try { state.previewUrl && URL.revokeObjectURL(state.previewUrl); } catch (_) {}
    state.previewUrl = null;
  }

  function showPreview(file, note) {
    hidePreview();
    closeBar();
    const input = state.chatInputEl || findChatInput();
    const chip = document.createElement('div');
    chip.id = 'mf-gifchat-paste';
    try { state.previewUrl = URL.createObjectURL(file); } catch (_) { state.previewUrl = null; }
    chip.innerHTML = `
      <img src="${state.previewUrl || ''}" alt="">
      <div class="mf-paste-info"><b>${escapeHtml((file.name || 'imagen').slice(0, 40))}</b><span>${escapeHtml(note)}</span></div>
      <button type="button" title="cancelar">✕</button>`;
    chip.querySelector('button').addEventListener('click', clearPendingImage);
    // docked into the chat input's own container so it rides with the chat
    // (position/scale included) instead of floating with viewport math
    const dock = (input && input.parentElement) || document.body;
    dock.appendChild(chip);
    state.previewEl = chip;
  }

  function setPreviewNote(note) {
    if (!state.previewEl || !state.previewEl.isConnected) {
      // the input's wrapper was rebuilt under us (react re-render): re-dock
      if (state.pendingImage) showPreview(state.pendingImage, note);
      return;
    }
    const span = state.previewEl.querySelector('.mf-paste-info span');
    if (span) span.textContent = note;
  }

  function fileToB64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  // registro del transporte: ronda cuatro de "ya está" / "no, otra vez no".
  // catbox sin cors, foco que se escapa del input, enter que no llega y un
  // chat que parte las urls en trozos minusculos. sin canal de soporte a
  // estas horas: se itera hasta que funciona. funciona.
  // upload transport, best available per platform:
  //   electron -> __MF_UPLOAD_BRIDGE__ (main process does the post)
  //   tauri    -> mfapp upload endpoint (rust posts to catbox; text/plain keeps the
  //               request "simple" so the webview never sends a cors preflight)
  //   extension-> mf-bg-upload bridge to the isolated world -> service worker
  //               (the page world has no chrome.*)
  //   the rest -> direct fetch attempt (works only if the host ever sends cors headers)
  function bridgeUpload(payload) {
    return new Promise((resolve, reject) => {
      const id = 'mfup' + Math.random().toString(36).slice(2);
      const onRes = (e) => {
        let d = e.detail || {};
        if (typeof d === 'string') {
          try { d = JSON.parse(d); } catch (_) { return; }
        }
        if (!d || d.id !== id) return;
        cleanup();
        resolve({ success: !!d.success, url: d.url || '', error: d.error });
      };
      const cleanup = () => {
        window.removeEventListener('mf-bg-upload-result', onRes);
        clearTimeout(timer);
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 45000);
      window.addEventListener('mf-bg-upload-result', onRes);
      window.dispatchEvent(new CustomEvent('mf-bg-upload', { detail: JSON.stringify({ id, ...payload }) }));
    });
  }

  async function uploadImage(file) {
    const meta = { name: file.name || 'imagen.png', mime: file.type || 'image/png' };
    const bridge = window.__MF_UPLOAD_BRIDGE__;
    if (typeof bridge === 'function') return bridge(file);
    const base = window.__MF_SHIM__?.assetBase?.() || '';
    if (/mfapp\./.test(base) || /^mfapp:\/\//.test(base)) {
      const r = await fetch(base + 'upload', { method: 'POST', body: file, headers: { 'Content-Type': 'text/plain' } });
      const url = (await r.text()).trim();
      return { success: url.startsWith('https://files.catbox.moe/'), url };
    }
    let b64Cache = null;
    const needB64 = () => b64Cache || (b64Cache = fileToB64(file));
    try {
      if (localStorage.getItem('mf:bgBridge') === '1') {
        return await bridgeUpload({ ...meta, b64: await needB64() });
      }
      if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
        const b64 = await needB64();
        return await new Promise(resolve => {
          try {
            chrome.runtime.sendMessage({ type: 'MF_UPLOAD_IMAGE', ...meta, b64 }, r => resolve(r || { success: false, error: 'no response' }));
          } catch (e) {
            resolve({ success: false, error: String(e) });
          }
        });
      }
    } catch (_) { /* fall through to the last resort */ }
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', file);
    try {
      const r = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
      const url = (await r.text()).trim();
      return { success: url.startsWith('https://files.catbox.moe/'), url };
    } catch (e) {
      return { success: false, error: String(e?.message || e) };
    }
  }

  async function uploadAndSend() {
    const file = state.pendingImage;
    if (!file) return;
    const chat = ensureChat();
    const game = state.game;
    if (!chat || !game) {
      // never swallow silently: keep the chip so enter can retry once in a world
      console.warn('minifeather gifchat: chat del juego no disponible (¿estás en un mundo?)');
      setPreviewNote('no hay chat del juego — entrá a un mundo y reintentá con enter');
      return;
    }
    setPreviewNote('subiendo a catbox… (ﾉ´ヮ`)ﾉ*:･ﾟ');
    try {
      const res = await uploadImage(file);
      console.log('minifeather gifchat upload →', res && res.success ? res.url : res);
      if (!res?.success || !/^https:\/\/files\.catbox\.moe\//.test(res.url || '')) {
        throw new Error(res?.error || 'upload failed');
      }
      const caption = String(state.chatInputEl?.value || '').trim();
      const text = (caption ? caption + ' ' : '') + res.url;
      try { chat.setInputValue?.(text); } catch (_) { try { chat.inputValue = text; } catch (_) {} }
      chat.submit(game);
      try { chat.closeInput?.(); } catch (_) {}
      clearPendingImage();
    } catch (error) {
      console.warn('minifeather gifchat upload failed:', error);
      setPreviewNote('no se pudo subir (╥﹏╥) — enter reintenta');
    }
  }

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
          if (state.enabled && document.body) { ensureChat(); ensureButton(); attachInputHooks(); rescanChat(); }
        }, 1200);
      }
      ensureChat();
      ensureButton();
      attachInputHooks();
      attachDocumentHooks();
    } else {
      closeBar();
      stopRenderer();
      if (state.scanTimer) { clearInterval(state.scanTimer); state.scanTimer = 0; }
      state.button?.remove();
      state.button = null;
      state.imgButton?.remove();
      state.imgButton = null;
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
    document.removeEventListener('input', onTypingInput, true);
    document.removeEventListener('keydown', onBarKeydown, true);
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
