// MF_Accounts — puente de sesión/uuid de Miniblox (MAIN world).
// Expone el uuid real de la cuenta logueada al panel (ISOLATED) via
// CustomEvent y responde consultas del panel. También deja el uuid
// disponible para el insertor de la UI de login/signup.
(() => {
    'use strict';
    if (window.__MF_Accounts) return;
    window.__MF_Accounts = true;

    const TAG = '[MiniFeather Accounts]';
    const VERBOSE = (() => { try { return localStorage.getItem('mf_accounts_verbose') === '1'; } catch (_) { return false; } })();
    const log = (...a) => { if (VERBOSE) console.log(TAG, ...a); };

    // ── estado de la cuenta ──────────────────────────────────────
    const state = {
        session: null,   // token session_v1 (si hay login)
        uuid: null,      // uuid real de la cuenta (no el socket id)
        username: null,
        rank: null,
        loadedAt: 0
    };
    window.__MF_ACCOUNT_STATE__ = state;

    function readSession() {
        try { return localStorage.getItem('session_v1'); } catch (_) { return null; }
    }

    function fromGameProfile() {
        try {
            let g = window.miniblox?.player ? window.miniblox : null;
            if (!g) {
                const react = document.querySelector('#react');
                if (react) for (const key in react) {
                    const game = react[key]?.updateQueue?.baseState?.element?.props?.game;
                    if (game?.player) { g = game; break; }
                }
            }
            const p = g?.player?.profile || g?.player;
            const isUuid = v => typeof v === 'string' &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
            if (!p) return false;
            if (isUuid(p.uuid)) {
                state.uuid = p.uuid.toLowerCase();
                state.username = p.username || p.name || null;
                state.rank = p.rank || null;
                return true;
            }
        } catch (_) {}
        return false;
    }

    async function fetchMe() {
        const session = readSession();
        if (!session) return null;
        try {
            const r = await fetch(location.origin + '/auth-api/accounts/me', {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ token: session })
            });
            if (!r.ok) return null;
            const j = await r.json();
            if (j && typeof j.uuid === 'string') {
                state.uuid = j.uuid.toLowerCase();
                state.username = j.username || null;
                state.rank = j.rank || null;
                state.loadedAt = Date.now();
                log('uuid de cuenta:', state.uuid, '| user:', state.username);
                return state.uuid;
            }
        } catch (e) { log('accounts/me falló:', e?.message || e); }
        return null;
    }

    // Observar cambios de sesión (login/logout durante la visita)
    function watchSession() {
        let last = readSession();
        setInterval(() => {
            const cur = readSession();
            if (cur !== last) {
                last = cur;
                state.session = cur;
                state.uuid = null;
                state.loadedAt = 0;
                if (cur) fetchMe();
            }
        }, 1500);
    }

    // ── API para el panel y otros scripts ───────────────────────
    async function getAccount(force) {
        if (!force && state.uuid) return { ...state };
        if (!readSession()) { fromGameProfile(); return { ...state }; }
        await fetchMe();
        if (!state.uuid) fromGameProfile();
        return { ...state };
    }
    window.MF_Accounts = { getAccount, refresh: () => getAccount(true) };

    // Responder requests del panel (ISOLATED) via CustomEvent
    document.addEventListener('minifeather:accounts-request', () => {
        getAccount(true).then(acc => {
            const detail = JSON.stringify({ uuid: acc.uuid, username: acc.username, rank: acc.rank, session: !!acc.session });
            document.dispatchEvent(new CustomEvent('minifeather:accounts-data', { detail }));
        });
    });

    // ── arranque ────────────────────────────────────────────────
    state.session = readSession();
    if (state.session) fetchMe();
    else fromGameProfile();
    watchSession();
    log('puente de cuentas listo');

    // ── insertor de uuid en la UI de login/signup de miniblox.io ──
    // Añade un botón "Insert UUID" junto al primer input de texto visible
    // cuando la ruta es /signin o /signup: escribe el uuid de la cuenta
    // logueada (o lo copia al portapapeles si no hay campo enfocable).
    const AUTH_ROUTES = /^\/(signin|signup|account)/;
    let uuidBtn = null;

    function styleBtn() {
        uuidBtn.style.cssText = 'position:fixed;z-index:99999;right:14px;bottom:14px;' +
            'padding:7px 14px;border-radius:8px;border:1px solid #3b82f6;background:#1d4ed8;' +
            'color:#fff;font:600 12px/1 system-ui,sans-serif;cursor:pointer;opacity:.92;';
        uuidBtn.textContent = 'Insert UUID';
    }

    function firstTextInput() {
        const inputs = document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=password])');
        for (const i of inputs) {
            if ((i.offsetWidth || i.offsetHeight) && !i.disabled && !i.readOnly) return i;
        }
        return null;
    }

    function insertUuid() {
        getAccount(true).then(acc => {
            if (!acc?.uuid) { alert('No account UUID available (guest / not logged in)'); return; }
            const target = firstTextInput();
            if (target) {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                setter.call(target, acc.uuid);
                target.dispatchEvent(new Event('input', { bubbles: true }));
                uuidBtn.textContent = 'UUID inserted ✓';
            } else {
                navigator.clipboard?.writeText(acc.uuid).catch(() => {});
                uuidBtn.textContent = 'UUID copied ✓';
            }
            setTimeout(styleBtn, 1600);
        });
    }

    function tickUi() {
        const onAuth = AUTH_ROUTES.test(location.pathname);
        if (onAuth && !uuidBtn) {
            uuidBtn = document.createElement('button');
            styleBtn();
            uuidBtn.addEventListener('click', insertUuid);
            document.body.appendChild(uuidBtn);
        } else if (!onAuth && uuidBtn) {
            uuidBtn.remove();
            uuidBtn = null;
        }
    }
    setInterval(tickUi, 800);
    tickUi();
})();
