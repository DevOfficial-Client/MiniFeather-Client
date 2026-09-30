(function () {
    'use strict';

    const TAG = 'minifeather auto-reconnect';
    const PREF_KEY = 'minifeather.autoReconnect';
    const CHECK_INTERVAL_MS = 2000;
    const RECONNECT_DELAY_MS = 3000;
    const MAX_RETRIES = 3;
    const MANUAL_EXIT_GRACE_MS = 60000;

    if (window.__MF_AUTO_RECONNECT__) return;

    const state = {
        enabled: loadPreference(),
        game: null,
        lastServerId: '',
        wasInGame: false,
        manualExitAt: 0,
        retries: 0,
        patched: false
    };

    function loadPreference() {
        try {
            return localStorage.getItem(PREF_KEY) !== '0';
        } catch (_) {
            return true;
        }
    }

    function savePreference() {
        try {
            localStorage.setItem(PREF_KEY, state.enabled ? '1' : '0');
        } catch (_) {}
    }

    function isGame(value) {
        return !!(value && typeof value === 'object' && value.serverInfo && typeof value.connect === 'function');
    }

    function findGame() {
        const direct = [globalThis.miniblox, globalThis.game];
        for (const value of direct) if (isGame(value)) return value;

        const element = document.querySelector('#react');
        if (!element) return null;
        for (const key of Reflect.ownKeys(element)) {
            if (!String(key).startsWith('__react')) continue;
            try {
                const root = element[key];
                for (const candidate of [root, root?.stateNode, root?.memoizedProps?.game]) {
                    if (isGame(candidate)) return candidate;
                }
            } catch (_) {}
        }
        return null;
    }

    // El motor marca con 'io client disconnect' la salida iniciada por el propio
    // cliente (boton Leave). Un kick o caida del transporte llega con otro motivo.
    function installDisconnectHook(game) {
        if (state.patched || typeof game.disconnect !== 'function') return;
        const original = game.disconnect;
        game.disconnect = function (reason) {
            try {
                if (String(reason || '').includes('io client disconnect')) {
                    state.manualExitAt = Date.now();
                }
            } catch (_) {}
            return original.call(this, reason);
        };
        state.patched = true;
    }

    function tick() {
        if (!state.enabled) return;

        const game = state.game || findGame();
        if (!isGame(game)) return;
        state.game = game;
        installDisconnectHook(game);

        const serverId = String(game.serverInfo?.serverId || game.connectingServerId || '');
        const inGame = typeof game.inGame === 'function' ? !!game.inGame() : !!serverId;

        if (inGame && serverId) {
            state.lastServerId = serverId;
            state.wasInGame = true;
            state.retries = 0;
            return;
        }

        if (!state.wasInGame) return;

        state.wasInGame = false;

        if (Date.now() - state.manualExitAt < MANUAL_EXIT_GRACE_MS) return;
        if (!state.lastServerId) return;
        if (state.retries >= MAX_RETRIES) {
            console.warn(TAG, `gave up after ${MAX_RETRIES} attempts`);
            return;
        }

        state.retries++;
        const target = state.lastServerId;
        console.info(TAG, `disconnected — reconnecting to ${target} (attempt ${state.retries}/${MAX_RETRIES})`);
        setTimeout(() => {
            if (!state.enabled) return;
            try {
                game.connect(target);
            } catch (error) {
                console.warn(TAG, 'reconnect failed:', error?.message || error);
            }
        }, RECONNECT_DELAY_MS);
    }

    setInterval(tick, CHECK_INTERVAL_MS);

    window.MF_AutoReconnect = {
        get enabled() {
            return state.enabled;
        },
        get status() {
            return {
                enabled: state.enabled,
                lastServerId: state.lastServerId,
                retries: state.retries,
                manualExitActive: Date.now() - state.manualExitAt < MANUAL_EXIT_GRACE_MS
            };
        },
        toggle(force) {
            state.enabled = typeof force === 'boolean' ? force : !state.enabled;
            savePreference();
            return state.enabled;
        }
    };

    window.__MF_AUTO_RECONNECT__ = true;
})();
