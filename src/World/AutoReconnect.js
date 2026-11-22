(function () {
    'use strict';

    const TAG = 'minifeather auto-reconnect';
    const PREF_KEY = 'minifeather.autoReconnect';
    const CHECK_INTERVAL_MS = 2000;
    const RECONNECT_DELAY_MS = 3000;

    if (window.__MF_AUTO_RECONNECT__) return;

    const state = {
        enabled: loadPreference(),
        game: null,
        lastServerId: '',
        joinedServerId: '',
        disconnectedServerId: '',
        manualExitActive: false,
        leavingServerId: '',
        timer: null,
        retries: 0
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
        const direct = [globalThis.miniblox, globalThis.game, globalThis.__MB?.game];
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
        const waypointsGame = globalThis.__MINIFEATHER_WAYPOINTS__?.game;
        return isGame(waypointsGame) ? waypointsGame : null;
    }

    function activeServerId(game) {
        if (window.__MINIFEATHER_LOCAL_GAMES__?.active ||
            (typeof game.inGame === 'function' && !game.inGame())) return '';
        return String(game.serverInfo?.serverId || '');
    }

    function clearReconnect() {
        state.disconnectedServerId = '';
        if (state.timer !== null) clearTimeout(state.timer);
        state.timer = null;
    }

    function markManualExit(game) {
        state.manualExitActive = true;
        state.leavingServerId = activeServerId(game);
        state.joinedServerId = '';
        clearReconnect();
    }

    function recordDisconnect(game) {
        if (state.enabled && !state.manualExitActive && !state.disconnectedServerId) {
            state.disconnectedServerId = activeServerId(game) || state.joinedServerId;
        }
    }

    function installHooks(game) {
        function before(name, callback) {
            const original = game[name];
            if (typeof original !== 'function') return;
            game[name] = function (...args) {
                if (this === game) callback(...args);
                return original.apply(this, args);
            };
        }

        before('disconnect', reason => {
            // Leave Game calls disconnect() without a reason. Kicks and
            // transport failures use disconnect(reason) with a message.
            if (reason == null || reason === '' || reason === 'io client disconnect') markManualExit(game);
            else recordDisconnect(game);
        });
        before('onSocketDisconnect', reason => {
            // A server-side close can arrive here directly, with no message.
            if (reason === 'io client disconnect') markManualExit(game);
            else recordDisconnect(game);
        });
        before('cancelConnection', () => markManualExit(game));
        before('connect', () => {
            clearReconnect();
            state.joinedServerId = '';
            state.manualExitActive = false;
            state.leavingServerId = '';
        });
    }

    function tick() {
        if (!state.enabled) return;

        if (!state.game) {
            const game = findGame();
            if (!game) return;
            state.game = game;
            installHooks(game);
        }
        const game = state.game;
        const serverId = activeServerId(game);
        if (serverId) {
            if (serverId !== state.leavingServerId) {
                state.joinedServerId = serverId;
                state.lastServerId = serverId;
                state.manualExitActive = false;
                state.leavingServerId = '';
                state.retries = 0;
            }
            return;
        }

        state.leavingServerId = '';
        state.joinedServerId = '';
        if (!state.disconnectedServerId || state.timer !== null) return;
        const target = state.disconnectedServerId;
        state.disconnectedServerId = '';
        state.timer = setTimeout(() => {
            state.timer = null;
            if (!state.enabled || state.manualExitActive || activeServerId(game) ||
                game.connectingServerId || window.__MINIFEATHER_LOCAL_GAMES__?.active) return;
            state.retries++;
            console.info(TAG, 'disconnected — reconnecting to', target);
            try {
                game.connect(target);
            } catch (error) {
                console.warn(TAG, 'reconnect failed:', error?.message || error);
            }
        }, RECONNECT_DELAY_MS);
    }

    function setEnabled(enabled) {
        state.enabled = enabled;
        if (!enabled) clearReconnect();
        savePreference();
    }

    tick();
    setInterval(tick, CHECK_INTERVAL_MS);

    document.addEventListener('minifeather:auto-reconnect-config', event => {
        try {
            const detail = JSON.parse(typeof event.detail === 'string' ? event.detail : '{}');
            setEnabled(detail.enabled === true);
        } catch (_) {}
    });

    window.MF_AutoReconnect = {
        get enabled() {
            return state.enabled;
        },
        get status() {
            return {
                enabled: state.enabled,
                lastServerId: state.lastServerId,
                retries: state.retries,
                manualExitActive: state.manualExitActive
            };
        },
        toggle(force) {
            setEnabled(typeof force === 'boolean' ? force : !state.enabled);
            return state.enabled;
        }
    };

    window.__MF_AUTO_RECONNECT__ = 2;
})();
