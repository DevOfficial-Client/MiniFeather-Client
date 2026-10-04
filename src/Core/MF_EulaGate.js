// minifeather eula gate. blocks the page behind an accept dialog for the embedded apps
// (tauri / electron). shows the human tl;dr, links the scary legal version, remembers you.
// declining quits the fun. nothing personal, the lawyers made me do it. :v
(function () {
  'use strict';
  if (window.__MF_EULA_GATE__) return;
  window.__MF_EULA_GATE__ = true;

  const SHIM = window.__MF_SHIM__;
  if (!SHIM) return;
  const BASE = SHIM.assetBase();

  const ACCEPT_KEY = 'mf:eula-accepted-v1';
  // acceptance stores the agreement version, not a bare 'yes': when the eula
  // changes (v1.4, 2026-10-04: plaintext account credentials, modrinth,
  // multibot, browser permissions), everyone gets asked again. no silent
  // consent to new fine print.
  const EULA_VERSION = '1.4';

  let accepted = null;
  try { accepted = localStorage.getItem(ACCEPT_KEY); } catch (_) {}
  if (accepted === EULA_VERSION) return;

  const isSpanish = (navigator.language || 'en').toLowerCase().indexOf('es') === 0;
  const humanFile = isSpanish ? 'eula/EULA-TLDR.md' : 'eula/EULA-TLDR.en.md';
  const legalFile = isSpanish ? 'eula/EULA.es.md' : 'eula/EULA.md';
  const TEXT = {
    title: isSpanish ? 'eula de minifeather client' : 'minifeather client eula',
    tl: isSpanish ? 'versión fácil de leer (tl;dr)' : 'easy-to-read version (tl;dr)',
    legal: isSpanish ? 'ver eula legal completa' : 'view full legal eula',
    back: isSpanish ? 'volver al resumen' : 'back to the summary',
    accept: isSpanish ? 'aceptar y jugar' : 'accept and play',
    decline: isSpanish ? 'rechazar y salir' : 'decline and exit',
    declineMsg: isSpanish ? 'eula rechazada. cerrando minifeather client.' : 'eula declined. closing minifeather client.'
  };

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function mdToHtml(md) {
    let html = escapeHtml(md);
    html = html.replace(/^#{1,6}\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    html = html.replace(/^[-*]\s+(.+)$/gm, '&bull; $1');
    html = html.replace(/^&gt;\s?(.*)$/gm, '<i>$1</i>');
    html = html.replace(/\n{2,}/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'mf-eula-overlay';
    overlay.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'background:rgba(10,8,18,0.97)', 'color:#e8e4f5',
      'font:14px/1.5 system-ui, sans-serif', 'display:flex',
      'align-items:center', 'justify-content:center', 'padding:24px'
    ].join(';'));
    overlay.innerHTML = `
      <div style="max-width:720px;max-height:86vh;display:flex;flex-direction:column;background:#181228;border:1px solid #6045a0;border-radius:12px;padding:20px;box-shadow:0 12px 48px #000">
        <h2 style="margin:0 0 4px;font-size:18px;color:#b79bff">${TEXT.title}</h2>
        <div id="mf-eula-label" style="font-size:12px;opacity:.7;margin-bottom:8px"></div>
        <div id="mf-eula-body" style="overflow:auto;background:#0f0a1a;border-radius:8px;padding:14px;flex:1;min-height:200px"></div>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
          <button id="mf-eula-accept" style="flex:1;padding:10px 16px;border:0;border-radius:8px;background:#6045a0;color:#fff;font-weight:600;cursor:pointer">${TEXT.accept}</button>
          <button id="mf-eula-legal" style="padding:10px 16px;border:1px solid #6045a0;border-radius:8px;background:transparent;color:#b79bff;cursor:pointer">${TEXT.legal}</button>
          <button id="mf-eula-decline" style="padding:10px 16px;border:1px solid #55304f;border-radius:8px;background:transparent;color:#c98;border-radius:8px;cursor:pointer">${TEXT.decline}</button>
        </div>
      </div>`;
    return overlay;
  }

  async function fetchText(file) {
    try {
      const r = await fetch(BASE + file, { cache: 'no-store' });
      if (r.ok) return await r.text();
    } catch (_) {}
    return isSpanish
      ? 'no se pudo cargar el texto de la eula. al usar minifeather client aceptas la eula completa en ' + BASE + 'eula/' + legalFile
      : 'could not load the eula text. by using minifeather client you accept the full eula at ' + BASE + 'eula/' + legalFile;
  }

  function gate() {
    const overlay = buildOverlay();
    (document.body || document.documentElement).appendChild(overlay);
    const body = overlay.querySelector('#mf-eula-body');
    const label = overlay.querySelector('#mf-eula-label');
    const legalBtn = overlay.querySelector('#mf-eula-legal');
    const acceptBtn = overlay.querySelector('#mf-eula-accept');
    const declineBtn = overlay.querySelector('#mf-eula-decline');
    let showingLegal = false;
    let humanText = '';
    let legalText = '';

    const render = async () => {
      label.textContent = showingLegal ? TEXT.legal : TEXT.tl;
      legalBtn.textContent = showingLegal ? TEXT.back : TEXT.legal;
      if (!showingLegal && humanText) { body.innerHTML = mdToHtml(humanText); return; }
      if (showingLegal && legalText) { body.innerHTML = mdToHtml(legalText); return; }
      body.textContent = '...';
      const text = await fetchText(showingLegal ? legalFile : humanFile);
      if (showingLegal) legalText = text; else humanText = text;
      body.innerHTML = mdToHtml(text);
    };
    legalBtn.addEventListener('click', () => { showingLegal = !showingLegal; render(); });
    acceptBtn.addEventListener('click', () => {
      try { localStorage.setItem(ACCEPT_KEY, EULA_VERSION); } catch (_) {}
      overlay.remove();
    });
    declineBtn.addEventListener('click', () => {
      body.innerHTML = '<b style="color:#c98">' + TEXT.declineMsg + '</b>';
      acceptBtn.disabled = true;
      legalBtn.disabled = true;
      declineBtn.disabled = true;
      setTimeout(() => { try { window.close(); } catch (_) {} }, 1200);
    });
    render();
  }

  function start() { try { gate(); } catch (_) {} }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
