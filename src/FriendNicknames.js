(() => {
    'use strict';

    const W = globalThis;
    const STORAGE_KEY = 'minifeather:friend-nicknames:v1';
    const TAG = '[FriendNicknames]';

    const state = {
        game: null,
        hookedGame: null,
        friendsLoaded: false,
        friendsByUuid: new Map(),
        friendsByName: new Map(),
        nicknames: new Map(),
        aliases: new Map(),
        aliasLookup: new Map(),
        tabSignature: '',
        partySignature: '',
        recentSignature: '',
        contextFriend: null,
        contextTarget: null,
        contextPoint: { x: 0, y: 0 },
        contextOpenedAt: 0,
        contextSerial: 0,
        friendUiRefs: new Map(),
        friendUiOriginal: new WeakMap(),
        menuObserver: null,
        menuObserverTimer: null,
        nicknameModal: null,
        nicknameModalFriend: null,
        toast: null,
        gameScanAt: 0,
        applyTimer: null,
        finderTimer: null,
        nameTagHookedEntities: new WeakSet(),
        nameTagUpdaters: new WeakMap(),
        nameTagState: new WeakMap()
    };

    function normalizeName(value) {
        return String(value || '').trim().toLowerCase();
    }

    function sanitizeNickname(value) {
        return String(value ?? '')
            .trim()
            .replace(/\s+/g, '_')
            .replace(/[^A-Za-z0-9_-]/g, '')
            .slice(0, 30);
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function replaceLiteral(text, from, to) {
        if (!text || !from || from === to) return text;
        return String(text).replace(new RegExp(escapeRegExp(from), 'g'), to);
    }

    function addAlias(uuid, value) {
        const alias = String(value || '').trim();
        if (!uuid || !alias) return;
        let set = state.aliases.get(uuid);
        if (!set) {
            set = new Set();
            state.aliases.set(uuid, set);
        }
        set.add(alias);
    }

    function loadNicknames() {
        let stored = [];
        try {
            stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch {}

        if (!Array.isArray(stored)) return;

        for (const item of stored) {
            if (!item || !item.uuid || !item.nickname) continue;
            const nickname = sanitizeNickname(item.nickname);
            if (!nickname) continue;
            const entry = {
                uuid: String(item.uuid),
                username: String(item.username || ''),
                nickname
            };
            state.nicknames.set(entry.uuid, entry);
            addAlias(entry.uuid, entry.nickname);
        }
        rebuildAliasLookup();
    }

    function saveNicknames() {
        const out = Array.from(state.nicknames.values()).map(item => ({
            uuid: item.uuid,
            username: item.username,
            nickname: item.nickname
        }));
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
        } catch {}
    }

    function rebuildAliasLookup() {
        const temp = new Map();
        const duplicates = new Set();

        for (const entry of state.nicknames.values()) {
            const key = normalizeName(entry.nickname);
            if (!key) continue;
            if (temp.has(key) && temp.get(key).uuid !== entry.uuid) {
                duplicates.add(key);
            } else {
                temp.set(key, entry);
            }
        }

        state.aliasLookup.clear();
        for (const [key, entry] of temp) {
            if (!duplicates.has(key)) state.aliasLookup.set(key, entry);
        }
    }

    function normalizeFriend(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const user = raw.user && typeof raw.user === 'object' ? raw.user : null;
        const uuid = raw.uuid || user?.uuid;
        const username = raw.username || raw.name || user?.username || user?.name;
        if (!uuid || !username) return null;
        return {
            ...raw,
            uuid: String(uuid),
            username: String(username)
        };
    }

    function registerKnownFriend(raw) {
        const friend = normalizeFriend(raw);
        if (!friend) return null;

        state.friendsByUuid.set(friend.uuid, friend);
        state.friendsByName.set(normalizeName(friend.username), friend);

        const saved = state.nicknames.get(friend.uuid);
        if (saved && saved.username !== friend.username) {
            saved.username = friend.username;
            saveNicknames();
        }

        return friend;
    }

    function acceptedFriendArrays(data) {
        if (!data || typeof data !== 'object') return [];

        const result = [];
        const keys = ['active', 'friends', 'accepted', 'offline', 'inactive'];

        for (const key of keys) {
            if (Array.isArray(data[key])) result.push(data[key]);
        }

        return result;
    }

    function trackFriendUiRef(uuid, object, realUsername = '') {
        if (!uuid || !object || typeof object !== 'object') return;

        const id = String(uuid);
        let refs = state.friendUiRefs.get(id);
        if (!refs) {
            refs = new Set();
            state.friendUiRefs.set(id, refs);
        }
        refs.add(object);

        if (!state.friendUiOriginal.has(object)) {
            state.friendUiOriginal.set(object, String(realUsername || object.__mfnOriginalUsername || object.username || object.name || ''));
        }
    }

    function applyNicknameToFriendUiObject(object, uuid, realUsername) {
        if (!object || typeof object !== 'object' || !uuid) return object;

        const id = String(uuid);
        const real = String(
            realUsername ||
            object.__mfnOriginalUsername ||
            state.friendUiOriginal.get(object) ||
            state.nicknames.get(id)?.username ||
            friendByUuid(id)?.username ||
            object.username ||
            object.name ||
            ''
        );

        if (!real) return object;

        trackFriendUiRef(id, object, real);

        const desired = nicknameByUuid(id)?.nickname || real;

        try {
            Object.defineProperty(object, '__mfnOriginalUsername', {
                value: real,
                writable: true,
                configurable: true,
                enumerable: false
            });
        } catch {
            try { object.__mfnOriginalUsername = real; } catch {}
        }

        try {
            if ('username' in object || !('name' in object)) object.username = desired;
            if ('name' in object) object.name = desired;
        } catch {}

        const user = object.user;
        if (user && typeof user === 'object') {
            trackFriendUiRef(id, user, real);
            try {
                if ('username' in user || !('name' in user)) user.username = desired;
                if ('name' in user) user.name = desired;
            } catch {}
        }

        return object;
    }

    function syncFriendUiRefs(uuid = '') {
        const ids = uuid ? [String(uuid)] : Array.from(state.friendUiRefs.keys());

        for (const id of ids) {
            const refs = state.friendUiRefs.get(id);
            if (!refs) continue;

            for (const object of Array.from(refs)) {
                if (!object || typeof object !== 'object') {
                    refs.delete(object);
                    continue;
                }

                const real = state.friendUiOriginal.get(object) || state.nicknames.get(id)?.username || friendByUuid(id)?.username || '';
                applyNicknameToFriendUiObject(object, id, real);
            }
        }
    }

    function transformFriendStatusData(data) {
        if (!data || typeof data !== 'object') return data;

        const out = Array.isArray(data) ? [...data] : { ...data };
        const keys = ['active', 'friends', 'accepted', 'offline', 'inactive'];

        for (const key of keys) {
            if (!Array.isArray(data[key])) continue;

            out[key] = data[key].map(raw => {
                if (!raw || typeof raw !== 'object') return raw;

                const friend = normalizeFriend(raw);
                if (!friend) return raw;

                const clone = { ...raw };
                if (raw.user && typeof raw.user === 'object') clone.user = { ...raw.user };

                return applyNicknameToFriendUiObject(clone, friend.uuid, friend.username);
            });
        }

        return out;
    }

    function captureFriendStatus(data) {
        if (!data || typeof data !== 'object') return;

        let foundAny = false;

        for (const list of acceptedFriendArrays(data)) {
            for (const raw of list) {
                const friend = registerKnownFriend(raw);
                if (friend) foundAny = true;
            }
        }

        if (!foundAny && !Array.isArray(data.active)) return;

        for (const entry of state.nicknames.values()) {
            if (!state.friendsByUuid.has(entry.uuid) && entry.username) {
                const friend = {
                    uuid: entry.uuid,
                    username: entry.username,
                    __mfnStoredFriend: true
                };
                state.friendsByUuid.set(entry.uuid, friend);
                state.friendsByName.set(normalizeName(entry.username), friend);
            }
        }

        state.friendsLoaded = true;
        rebuildAliasLookup();
        syncFriendUiRefs();
        applyAll(true);
    }

    function isFriendStatusUrl(value) {
        try {
            const url = typeof value === 'string' ? value : value?.url;
            return typeof url === 'string' && url.includes('/friends/status');
        } catch {
            return false;
        }
    }

    function installNetworkObservers() {
        try {
            const nativeFetch = W.fetch;

            if (typeof nativeFetch === 'function' && !nativeFetch.__mfnWrapped) {
                const wrapped = function (...args) {
                    const request = args[0];
                    const promise = nativeFetch.apply(this, args);

                    if (!isFriendStatusUrl(request)) return promise;

                    return promise.then(response => {
                        try {
                            const nativeJson = response.json?.bind(response);
                            const nativeText = response.text?.bind(response);

                            if (nativeJson) {
                                response.json = async (...jsonArgs) => {
                                    const data = await nativeJson(...jsonArgs);
                                    captureFriendStatus(data);
                                    return transformFriendStatusData(data);
                                };
                            }

                            if (nativeText) {
                                response.text = async (...textArgs) => {
                                    const text = await nativeText(...textArgs);
                                    try {
                                        const data = JSON.parse(text);
                                        captureFriendStatus(data);
                                        return JSON.stringify(transformFriendStatusData(data));
                                    } catch {
                                        return text;
                                    }
                                };
                            }

                            try {
                                response.clone().json().then(captureFriendStatus).catch(() => {});
                            } catch {}
                        } catch {}

                        return response;
                    });
                };

                Object.defineProperty(wrapped, '__mfnWrapped', { value: true });
                Object.defineProperty(wrapped, '__mfnOriginal', { value: nativeFetch });
                W.fetch = wrapped;
            }
        } catch {}

        try {
            const XHR = W.XMLHttpRequest;
            if (!XHR?.prototype) return;

            const proto = XHR.prototype;
            const nativeOpen = proto.open;
            const nativeSend = proto.send;

            if (!proto.__mfnFriendResponsePatched) {
                try {
                    const textDescriptor = Object.getOwnPropertyDescriptor(proto, 'responseText');
                    if (textDescriptor?.get && textDescriptor.configurable !== false) {
                        Object.defineProperty(proto, 'responseText', {
                            ...textDescriptor,
                            get: function () {
                                const text = textDescriptor.get.call(this);
                                if (!this.__mfnFriendStatus || !text) return text;

                                if (this.__mfnFriendTransformedTextSource === text && typeof this.__mfnFriendTransformedText === 'string') {
                                    return this.__mfnFriendTransformedText;
                                }

                                try {
                                    const data = JSON.parse(text);
                                    captureFriendStatus(data);
                                    const transformed = JSON.stringify(transformFriendStatusData(data));
                                    this.__mfnFriendTransformedTextSource = text;
                                    this.__mfnFriendTransformedText = transformed;
                                    return transformed;
                                } catch {
                                    return text;
                                }
                            }
                        });
                    }
                } catch {}

                try {
                    const responseDescriptor = Object.getOwnPropertyDescriptor(proto, 'response');
                    if (responseDescriptor?.get && responseDescriptor.configurable !== false) {
                        Object.defineProperty(proto, 'response', {
                            ...responseDescriptor,
                            get: function () {
                                const value = responseDescriptor.get.call(this);
                                if (!this.__mfnFriendStatus || this.responseType !== 'json' || !value || typeof value !== 'object') return value;

                                if (this.__mfnFriendTransformedResponseSource === value && this.__mfnFriendTransformedResponse) {
                                    return this.__mfnFriendTransformedResponse;
                                }

                                try {
                                    captureFriendStatus(value);
                                    const transformed = transformFriendStatusData(value);
                                    this.__mfnFriendTransformedResponseSource = value;
                                    this.__mfnFriendTransformedResponse = transformed;
                                    return transformed;
                                } catch {
                                    return value;
                                }
                            }
                        });
                    }
                } catch {}

                try {
                    Object.defineProperty(proto, '__mfnFriendResponsePatched', {
                        value: true,
                        configurable: true
                    });
                } catch {}
            }

            if (typeof nativeOpen === 'function' && !nativeOpen.__mfnWrapped) {
                const wrappedOpen = function (method, url, ...rest) {
                    try {
                        this.__mfnFriendStatus = isFriendStatusUrl(url);
                        this.__mfnFriendTransformedTextSource = null;
                        this.__mfnFriendTransformedText = null;
                        this.__mfnFriendTransformedResponseSource = null;
                        this.__mfnFriendTransformedResponse = null;
                    } catch {}
                    return nativeOpen.call(this, method, url, ...rest);
                };

                Object.defineProperty(wrappedOpen, '__mfnWrapped', { value: true });
                Object.defineProperty(wrappedOpen, '__mfnOriginal', { value: nativeOpen });
                proto.open = wrappedOpen;
            }

            if (typeof nativeSend === 'function' && !nativeSend.__mfnWrapped) {
                const wrappedSend = function (...args) {
                    if (this.__mfnFriendStatus && !this.__mfnFriendListener) {
                        this.__mfnFriendListener = true;
                        this.addEventListener('loadend', () => {
                            try {
                                if (this.responseType === 'json' && this.response) {
                                    const raw = this.__mfnFriendTransformedResponseSource || this.response;
                                    captureFriendStatus(raw);
                                    return;
                                }

                                const text = this.__mfnFriendTransformedTextSource || this.responseText;
                                if (typeof text === 'string' && text) captureFriendStatus(JSON.parse(text));
                            } catch {}
                        }, { once: true });
                    }

                    return nativeSend.apply(this, args);
                };

                Object.defineProperty(wrappedSend, '__mfnWrapped', { value: true });
                Object.defineProperty(wrappedSend, '__mfnOriginal', { value: nativeSend });
                proto.send = wrappedSend;
            }
        } catch {}
    }

    function friendByUuid(uuid) {
        return uuid ? state.friendsByUuid.get(String(uuid)) || null : null;
    }

    function nicknameByUuid(uuid) {
        if (!uuid) return null;
        const entry = state.nicknames.get(String(uuid));
        if (!entry) return null;
        if (state.friendsLoaded && !state.friendsByUuid.has(String(uuid))) return null;
        return entry;
    }

    function nicknameForIdentity(uuid, username) {
        const byUuid = nicknameByUuid(uuid);
        if (byUuid) return byUuid;

        const friend = state.friendsByName.get(normalizeName(username));
        if (!friend) return null;
        return nicknameByUuid(friend.uuid);
    }

    function restoreAndApplyName(text, uuid, realUsername) {
        let out = String(text ?? '');
        const id = uuid ? String(uuid) : '';
        const real = String(realUsername || friendByUuid(id)?.username || state.nicknames.get(id)?.username || '');

        if (id) {
            const aliases = state.aliases.get(id);
            if (aliases && real) {
                for (const alias of aliases) out = replaceLiteral(out, alias, real);
            }
        }

        const entry = nicknameByUuid(id);
        if (entry && real) out = replaceLiteral(out, real, entry.nickname);
        return out;
    }

    function transformKnownNames(text) {
        let out = String(text ?? '');
        for (const [uuid, friend] of state.friendsByUuid) {
            out = restoreAndApplyName(out, uuid, friend.username);
        }
        return out;
    }

    function setNickname(identity, value) {
        let friend = null;
        const key = String(identity || '').trim();
        if (!key) return { ok: false, reason: 'friend-not-found' };

        friend = state.friendsByUuid.get(key) || state.friendsByName.get(normalizeName(key)) || null;
        if (!friend) return { ok: false, reason: 'friend-not-found' };

        const nickname = sanitizeNickname(value);
        const old = state.nicknames.get(friend.uuid);
        if (old?.nickname) addAlias(friend.uuid, old.nickname);

        if (!nickname) {
            state.nicknames.delete(friend.uuid);
        } else {
            state.nicknames.set(friend.uuid, {
                uuid: friend.uuid,
                username: friend.username,
                nickname
            });
            addAlias(friend.uuid, nickname);
        }

        saveNicknames();
        rebuildAliasLookup();
        syncFriendUiRefs(friend.uuid);
        applyAll(true);

        const nativeFriendContext = findFriendContextValue();
        if (nativeFriendContext) {
            patchFriendContextList(nativeFriendContext, friend.uuid);
        }

        refreshNativeFriendContext(friend.uuid).catch(() => {});
        forceReactUpdateFromNode(state.contextTarget);

        try { W.dispatchEvent(new Event('resize')); } catch {}

        return { ok: true, nickname };
    }

    function isGame(value) {
        return !!(
            value &&
            typeof value === 'object' &&
            value.player &&
            value.world &&
            value.chat &&
            value.playerList
        );
    }

    function searchFiber(element) {
        if (!element) return null;
        let keys;
        try { keys = Object.keys(element); } catch { return null; }

        for (const key of keys) {
            if (
                !key.startsWith('__reactFiber$') &&
                !key.startsWith('__reactContainer$') &&
                !key.startsWith('__reactInternalInstance$')
            ) continue;

            let root;
            try { root = element[key]; } catch { continue; }
            const queue = [root];
            const seen = new Set();
            let scanned = 0;

            while (queue.length && scanned++ < 1400) {
                const fiber = queue.shift();
                if (!fiber || seen.has(fiber)) continue;
                seen.add(fiber);

                const values = [
                    fiber.stateNode,
                    fiber.stateNode?.game,
                    fiber.memoizedProps,
                    fiber.memoizedProps?.game,
                    fiber.pendingProps,
                    fiber.pendingProps?.game,
                    fiber.memoizedState,
                    fiber.memoizedState?.game
                ];

                for (const value of values) {
                    if (isGame(value)) return value;
                    if (isGame(value?.game)) return value.game;
                }

                if (fiber.child) queue.push(fiber.child);
                if (fiber.sibling) queue.push(fiber.sibling);
            }
        }
        return null;
    }

    function forceReactUpdateFromNode(node) {
        let current = node instanceof Element ? node : node?.parentElement;
        const called = new Set();

        for (let depth = 0; current && depth < 12; depth++, current = current.parentElement) {
            let keys = [];
            try { keys = Object.keys(current); } catch {}

            for (const key of keys) {
                if (
                    !key.startsWith('__reactFiber$') &&
                    !key.startsWith('__reactInternalInstance$')
                ) continue;

                let fiber;
                try { fiber = current[key]; } catch { continue; }

                for (let up = 0; fiber && up < 16; up++, fiber = fiber.return) {
                    const instance = fiber.stateNode;
                    if (!instance || called.has(instance)) continue;

                    if (typeof instance.forceUpdate === 'function') {
                        called.add(instance);
                        try { instance.forceUpdate(); } catch {}
                    }
                }
            }
        }
    }


    function getReactRootFibers() {
        const roots = [];
        const seen = new Set();
        const nodes = [
            document.querySelector('#react'),
            document.body,
            document.documentElement
        ].filter(Boolean);

        for (const node of nodes) {
            let keys = [];
            try { keys = Object.keys(node); } catch {}

            for (const key of keys) {
                if (
                    !key.startsWith('__reactContainer$') &&
                    !key.startsWith('__reactFiber$') &&
                    !key.startsWith('__reactInternalInstance$')
                ) continue;

                let value;
                try { value = node[key]; } catch { continue; }

                for (const fiber of [value?.current, value?._internalRoot?.current, value]) {
                    if (!fiber || typeof fiber !== 'object' || seen.has(fiber)) continue;
                    seen.add(fiber);
                    roots.push(fiber);
                }
            }
        }

        return roots;
    }

    function looksLikeFriendContextValue(value) {
        return !!(
            value &&
            typeof value === 'object' &&
            typeof value.refresh === 'function' &&
            Array.isArray(value.friends) &&
            Array.isArray(value.outboundRequests) &&
            Array.isArray(value.inboundRequests) &&
            'createFriendRequestOpen' in value &&
            typeof value.setCreateFriendRequestOpen === 'function'
        );
    }

    function findFriendContextValue() {
        const queue = getReactRootFibers();
        const seen = new Set();
        let scanned = 0;

        while (queue.length && scanned++ < 7000) {
            const fiber = queue.shift();
            if (!fiber || typeof fiber !== 'object' || seen.has(fiber)) continue;
            seen.add(fiber);

            const candidates = [
                fiber.memoizedProps?.value,
                fiber.pendingProps?.value,
                fiber.stateNode?.props?.value,
                fiber.memoizedProps,
                fiber.pendingProps
            ];

            for (const candidate of candidates) {
                if (looksLikeFriendContextValue(candidate)) return candidate;
            }

            if (fiber.child) queue.push(fiber.child);
            if (fiber.sibling) queue.push(fiber.sibling);
        }

        return null;
    }

    function patchFriendContextList(context, uuid) {
        if (!looksLikeFriendContextValue(context)) return false;

        const id = String(uuid || '');
        if (!id) return false;

        let changed = false;

        for (const object of context.friends) {
            if (!object || typeof object !== 'object') continue;

            const objectUuid = String(object.uuid || object.user?.uuid || '');
            if (objectUuid !== id) continue;

            const original =
                object.__mfnOriginalUsername ||
                state.friendUiOriginal.get(object) ||
                state.nicknames.get(id)?.username ||
                friendByUuid(id)?.username ||
                object.username ||
                object.name ||
                '';

            applyNicknameToFriendUiObject(object, id, original);

            if (object.user && typeof object.user === 'object') {
                applyNicknameToFriendUiObject(object.user, id, original);
            }

            changed = true;
        }

        return changed;
    }

    async function refreshNativeFriendContext(uuid = '') {
        const context = findFriendContextValue();
        if (!context) return false;

        if (uuid) patchFriendContextList(context, uuid);

        let result;
        try {
            result = context.refresh();
        } catch {
            return false;
        }

        try {
            if (result && typeof result.then === 'function') await result;
        } catch {
            return false;
        }

        syncFriendUiRefs(uuid);

        queueMicrotask(() => {
            applyAll(true);
            forceReactUpdateFromNode(state.contextTarget);
        });

        return true;
    }

    function findGame(force = false) {
        const now = performance.now();
        if (!force && isGame(state.game) && now - state.gameScanAt < 1200) return state.game;
        state.gameScanAt = now;

        const direct = [W.__MINIBLOX_GAME__, W.miniblox, state.game];
        for (const value of direct) {
            if (isGame(value)) return value;
        }

        try {
            const react = document.querySelector('#react');
            if (react) {
                for (const root of Object.values(react)) {
                    const game = root?.updateQueue?.baseState?.element?.props?.game;
                    if (isGame(game)) {
                        W.__MINIBLOX_GAME__ = game;
                        return game;
                    }
                }
                const game = searchFiber(react);
                if (game) {
                    W.__MINIBLOX_GAME__ = game;
                    return game;
                }
            }
        } catch {}

        try {
            const root = document.body || document.documentElement;
            const game = searchFiber(root);
            if (game) {
                W.__MINIBLOX_GAME__ = game;
                return game;
            }
        } catch {}

        return null;
    }

    function getRawPlayerData(id) {
        const map = state.game?.playerList?.playerDataMap;
        if (!map || typeof map.get !== 'function') return null;
        try { return map.get(id) || null; } catch { return null; }
    }

    function applyTab(force = false) {
        const list = state.game?.playerList;
        const map = list?.playerDataMap;
        const current = list?.sortedPlayerData;
        if (!list || !map || typeof map.get !== 'function' || !Array.isArray(current)) return;

        const rows = [];
        const signatureParts = [];
        let needsNamePatch = false;

        for (const row of current) {
            const raw = map.get(row?.id) || row;
            if (!raw) continue;
            const entry = nicknameForIdentity(raw.uuid, raw.name);
            const desiredName = entry?.nickname || raw.name;
            const clone = entry ? { ...raw, name: desiredName } : raw;
            rows.push(clone);
            signatureParts.push([
                raw.id,
                desiredName,
                raw.ping,
                raw.level,
                raw.rank,
                raw.verified,
                raw.permissionLevel,
                raw.vanished
            ].join(':'));
            if (row?.name !== desiredName) needsNamePatch = true;
        }

        const signature = signatureParts.join('|');
        if (!force && !needsNamePatch && signature === state.tabSignature) return;
        state.tabSignature = signature;

        try {
            list.sortedPlayerData = rows;
        } catch {}
    }

    function resolveLoadedEntities() {
        const world = state.game?.world;
        if (!world) return [];

        const result = new Set();
        const candidates = [
            world.loadedEntityList,
            world.loadedEntities,
            world.entities,
            world.entitiesDump,
            world.entityMap,
            world.players,
            state.game?.entities
        ];

        for (const value of candidates) {
            if (Array.isArray(value)) {
                for (const entity of value) result.add(entity);
                continue;
            }

            if (value && typeof value.values === 'function') {
                try {
                    for (const entity of value.values()) result.add(entity);
                } catch {}
            }
        }

        return Array.from(result);
    }

    function findNameTagUpdater(mesh) {
        if (!mesh) return null;

        let current = mesh;
        let depth = 0;
        let best = null;

        while (current && depth++ < 4) {
            let keys = [];
            try { keys = Object.getOwnPropertyNames(current); } catch {}

            for (const key of keys) {
                if (key === 'constructor') continue;

                let fn;
                try { fn = current[key]; } catch { continue; }
                if (typeof fn !== 'function') continue;

                let source = '';
                try { source = Function.prototype.toString.call(fn); } catch { continue; }
                if (!source.includes('nameTagText')) continue;

                let score = 10;
                if (source.includes('getCustomNameTag')) score += 20;
                if (source.includes('profile.username')) score += 20;
                if (source.includes('nameTagColor')) score += 8;
                if (source.includes('nameTagOpacity')) score += 8;

                if (!best || score > best.score) best = { key, fn, score };
            }

            current = Object.getPrototypeOf(current);
        }

        return best;
    }

    function hookNativeNameTag(entity, raw) {
        const mesh = entity?.mesh;
        if (!mesh || !raw?.uuid || !raw.name) return null;

        if (!state.nameTagHookedEntities.has(entity)) {
            const custom = entity.getCustomNameTag;

            if (typeof custom === 'function' && !custom.__mfnNicknameWrapped) {
                const wrappedCustomNameTag = function (...args) {
                    const result = custom.apply(this, args);
                    const latest = getRawPlayerData(entity.id) || raw;
                    return restoreAndApplyName(
                        result,
                        latest?.uuid || raw.uuid,
                        latest?.name || raw.name
                    );
                };

                Object.defineProperty(wrappedCustomNameTag, '__mfnNicknameWrapped', { value: true });
                Object.defineProperty(wrappedCustomNameTag, '__mfnOriginal', { value: custom });
                try { entity.getCustomNameTag = wrappedCustomNameTag; } catch {}
            }

            const updater = findNameTagUpdater(mesh);

            if (updater && !updater.fn.__mfnNicknameWrapped) {
                const key = updater.key;
                let original = updater.fn;
                try {
                    if (typeof mesh[key] === 'function') original = mesh[key];
                } catch {}

                const wrappedUpdater = function (...args) {
                    const latest = getRawPlayerData(entity.id) || raw;
                    const uuid = String(latest?.uuid || raw.uuid || '');
                    const realName = String(latest?.name || raw.name || '');
                    const entry = nicknameForIdentity(uuid, realName);
                    const profile = entity?.profile;
                    let originalUsername;
                    let changedProfile = false;

                    if (entry?.nickname && profile && typeof profile === 'object' && 'username' in profile) {
                        try {
                            originalUsername = profile.username;
                            profile.username = entry.nickname;
                            changedProfile = true;
                        } catch {}
                    }

                    let result;
                    try {
                        result = original.apply(this, args);
                    } finally {
                        if (changedProfile) {
                            try { profile.username = originalUsername; } catch {}
                        }
                    }

                    if (typeof this.nameTagText === 'string' && this.nameTagText) {
                        const next = restoreAndApplyName(this.nameTagText, uuid, realName);
                        if (next !== this.nameTagText) {
                            try { this.nameTagText = next; } catch {}
                        }
                    }

                    return result;
                };

                Object.defineProperty(wrappedUpdater, '__mfnNicknameWrapped', { value: true });
                Object.defineProperty(wrappedUpdater, '__mfnOriginal', { value: original });

                try {
                    mesh[key] = wrappedUpdater;
                    state.nameTagUpdaters.set(mesh, { key, fn: wrappedUpdater });
                } catch {}
            } else if (updater) {
                state.nameTagUpdaters.set(mesh, { key: updater.key, fn: mesh[updater.key] });
            }

            state.nameTagHookedEntities.add(entity);
        }

        if (!state.nameTagUpdaters.has(mesh)) {
            const updater = findNameTagUpdater(mesh);
            if (updater) state.nameTagUpdaters.set(mesh, { key: updater.key, fn: mesh[updater.key] });
        }

        return state.nameTagUpdaters.get(mesh) || null;
    }

    function applyNameTags(force = false) {
        const entities = resolveLoadedEntities();

        for (const entity of entities) {
            if (!entity?.mesh || entity.id == null) continue;

            const raw = getRawPlayerData(entity.id);
            if (!raw?.uuid || !raw.name) continue;

            const mesh = entity.mesh;
            const binding = hookNativeNameTag(entity, raw);
            const entry = nicknameForIdentity(raw.uuid, raw.name);
            const signature = `${raw.uuid}|${raw.name}|${entry?.nickname || ''}|${raw.rank || ''}`;
            const previous = state.nameTagState.get(mesh);

            if ((force || previous !== signature) && binding?.key && typeof mesh[binding.key] === 'function') {
                state.nameTagState.set(mesh, signature);
                try { mesh[binding.key](); } catch {}
            }

            if (typeof mesh.nameTagText !== 'string' || !mesh.nameTagText) continue;

            const next = restoreAndApplyName(mesh.nameTagText, raw.uuid, raw.name);
            if (next !== mesh.nameTagText) {
                try { mesh.nameTagText = next; } catch {}
            }
        }
    }

    function chatBaseText(message) {
        if (!message || typeof message !== 'object') return '';
        if (typeof message.__mfnOriginalText === 'string') return message.__mfnOriginalText;
        let base = String(message.text ?? '');
        const uuid = message.from ? String(message.from) : '';
        if (uuid) {
            const friend = friendByUuid(uuid);
            const real = friend?.username || state.nicknames.get(uuid)?.username || '';
            const aliases = state.aliases.get(uuid);
            if (aliases && real) {
                for (const alias of aliases) base = replaceLiteral(base, alias, real);
            }
        } else {
            for (const [id, aliases] of state.aliases) {
                const real = friendByUuid(id)?.username || state.nicknames.get(id)?.username || '';
                if (!real) continue;
                for (const alias of aliases) base = replaceLiteral(base, alias, real);
            }
        }
        return base;
    }

    function transformChatMessage(message) {
        if (!message || typeof message !== 'object') return message;
        const out = { ...message };
        const base = chatBaseText(message);
        const uuid = out.from ? String(out.from) : '';
        out.__mfnOriginalText = base;
        out.text = uuid
            ? restoreAndApplyName(base, uuid, friendByUuid(uuid)?.username || state.nicknames.get(uuid)?.username)
            : transformKnownNames(base);
        return out;
    }

    function hookChat() {
        const chat = state.game?.chat;
        if (!chat) return;

        if (typeof chat.addChat === 'function' && !chat.addChat.__mfnWrapped) {
            const original = chat.addChat;
            const wrapped = function (message, ...args) {
                return original.call(this, transformChatMessage(message), ...args);
            };
            Object.defineProperty(wrapped, '__mfnWrapped', { value: true });
            Object.defineProperty(wrapped, '__mfnOriginal', { value: original });
            try { chat.addChat = wrapped; } catch {}
        }

        try {
            const Ctor = chat.constructor;
            if (Ctor && typeof Ctor.extractName === 'function' && !Ctor.extractName.__mfnWrapped) {
                const original = Ctor.extractName;
                const wrapped = function (...args) {
                    const result = original.apply(this, args);
                    if (!result) return result;
                    const entry = state.aliasLookup.get(normalizeName(result));
                    return entry?.username ? normalizeName(entry.username) : result;
                };
                Object.defineProperty(wrapped, '__mfnWrapped', { value: true });
                Object.defineProperty(wrapped, '__mfnOriginal', { value: original });
                Ctor.extractName = wrapped;
            }
        } catch {}
    }

    function refreshChatLog() {
        const chat = state.game?.chat;
        const log = chat?.log;
        if (!Array.isArray(log)) return;
        let changed = false;

        for (const message of log) {
            if (!message || typeof message !== 'object' || typeof message.text !== 'string') continue;
            const base = chatBaseText(message);
            const uuid = message.from ? String(message.from) : '';
            const next = uuid
                ? restoreAndApplyName(base, uuid, friendByUuid(uuid)?.username || state.nicknames.get(uuid)?.username)
                : transformKnownNames(base);

            try {
                if (message.__mfnOriginalText !== base) message.__mfnOriginalText = base;
                if (message.text !== next) {
                    message.text = next;
                    changed = true;
                }
            } catch {}
        }

        if (changed) {
            try { chat.log = chat.log.slice(); } catch {}
        }
    }

    function withNicknameOnObject(value) {
        if (!value || typeof value !== 'object') return value;
        const uuid = value.uuid ? String(value.uuid) : '';
        const currentName = value.username || value.name || '';
        const friend = friendByUuid(uuid) || state.friendsByName.get(normalizeName(currentName));
        if (!friend) return value;
        const entry = nicknameByUuid(friend.uuid);
        const desired = entry?.nickname || friend.username;
        if (!desired || currentName === desired) return value;
        const clone = { ...value };
        if ('username' in clone) clone.username = desired;
        if ('name' in clone) clone.name = desired;
        return clone;
    }

    function hookWhispers() {
        const whispers = state.game?.whispers;
        if (!whispers) return;

        if (typeof whispers.ensure === 'function' && !whispers.ensure.__mfnWrapped) {
            const original = whispers.ensure;
            const wrapped = function (uuid, username, ...rest) {
                const friend = friendByUuid(uuid);
                const entry = nicknameByUuid(uuid);
                return original.call(this, uuid, entry?.nickname || friend?.username || username, ...rest);
            };
            Object.defineProperty(wrapped, '__mfnWrapped', { value: true });
            try { whispers.ensure = wrapped; } catch {}
        }

        if (typeof whispers.openConversation === 'function' && !whispers.openConversation.__mfnWrapped) {
            const original = whispers.openConversation;
            const wrapped = function (value, ...rest) {
                return original.call(this, withNicknameOnObject(value), ...rest);
            };
            Object.defineProperty(wrapped, '__mfnWrapped', { value: true });
            try { whispers.openConversation = wrapped; } catch {}
        }

        if (typeof whispers.receive === 'function' && !whispers.receive.__mfnWrapped) {
            const original = whispers.receive;
            const wrapped = function (packet, ...rest) {
                if (!packet || typeof packet !== 'object') return original.call(this, packet, ...rest);
                const copy = { ...packet };
                if (packet.from && typeof packet.from === 'object') copy.from = withNicknameOnObject(packet.from);
                if (packet.to && typeof packet.to === 'object') copy.to = withNicknameOnObject(packet.to);
                return original.call(this, copy, ...rest);
            };
            Object.defineProperty(wrapped, '__mfnWrapped', { value: true });
            try { whispers.receive = wrapped; } catch {}
        }
    }

    function refreshWhispers() {
        const whispers = state.game?.whispers;
        if (!whispers) return;

        const list = whispers.list;
        if (Array.isArray(list)) {
            let changed = false;
            const next = list.map(item => {
                const out = withNicknameOnObject(item);
                if (out !== item) changed = true;
                return out;
            });
            if (changed) {
                try { whispers.list = next; } catch {}
            }
        }

        const conversations = whispers.conversations;
        if (conversations && typeof conversations.values === 'function') {
            try {
                for (const conversation of conversations.values()) {
                    if (!conversation || typeof conversation !== 'object') continue;
                    const uuid = conversation.uuid ? String(conversation.uuid) : '';
                    const friend = friendByUuid(uuid);
                    if (!friend) continue;
                    const entry = nicknameByUuid(uuid);
                    const desired = entry?.nickname || friend.username;
                    if ('username' in conversation && conversation.username !== desired) {
                        conversation.username = desired;
                    }
                }
            } catch {}
        }
    }

    function applyParty(force = false) {
        const party = state.game?.party;
        if (!party) return;
        const arrays = ['members', 'inviteMembers'];
        const sig = [];
        let touched = false;

        for (const key of arrays) {
            const list = party[key];
            if (!Array.isArray(list)) continue;
            const next = list.map(member => {
                if (!member || typeof member !== 'object') return member;
                const uuid = member.uuid ? String(member.uuid) : '';
                const friend = friendByUuid(uuid);
                if (!friend) return member;
                const entry = nicknameByUuid(uuid);
                const desired = entry?.nickname || friend.username;
                sig.push(`${key}:${uuid}:${desired}:${member.isLeader ? 1 : 0}`);
                if (member.username === desired) return member;
                touched = true;
                return { ...member, username: desired };
            });
            if (touched || force) {
                try { party[key] = next; } catch {}
            }
        }

        const signature = sig.join('|');
        if (signature !== state.partySignature) state.partySignature = signature;
    }

    function applyRecentPlayers(force = false) {
        const serverInfo = state.game?.serverInfo;
        const list = serverInfo?.recentPlayers;
        if (!Array.isArray(list)) return;

        const next = [];
        const sig = [];
        let changed = false;

        for (const item of list) {
            if (!item || typeof item !== 'object') {
                next.push(item);
                continue;
            }
            const uuid = item.uuid ? String(item.uuid) : '';
            const friend = friendByUuid(uuid) || state.friendsByName.get(normalizeName(item.username));
            if (!friend) {
                next.push(item);
                continue;
            }
            const entry = nicknameByUuid(friend.uuid);
            const desired = entry?.nickname || friend.username;
            sig.push(`${friend.uuid}:${desired}:${item.level}:${item.rank}`);
            if (item.username === desired) {
                next.push(item);
            } else {
                next.push({ ...item, username: desired });
                changed = true;
            }
        }

        const signature = sig.join('|');
        if (changed || force || signature !== state.recentSignature) {
            state.recentSignature = signature;
            try { serverInfo.recentPlayers = next; } catch {}
        }
    }

    function hookPlayerList() {
        const list = state.game?.playerList;
        if (!list) return;

        for (const key of ['handlePacket', 'handleDeltaPacket', 'applyEntry', 'rebuildSorted', 'handlePingPacket']) {
            const fn = list[key];
            if (typeof fn !== 'function' || fn.__mfnWrapped) continue;
            const wrapped = function (...args) {
                const result = fn.apply(this, args);
                queueMicrotask(() => {
                    applyTab(true);
                    applyNameTags(true);
                });
                return result;
            };
            Object.defineProperty(wrapped, '__mfnWrapped', { value: true });
            Object.defineProperty(wrapped, '__mfnOriginal', { value: fn });
            try { list[key] = wrapped; } catch {}
        }
    }

    function hookGame(game) {
        if (!isGame(game)) return;
        state.game = game;
        if (state.hookedGame === game) {
            hookChat();
            hookWhispers();
            hookPlayerList();
            return;
        }
        state.hookedGame = game;
        state.tabSignature = '';
        state.partySignature = '';
        state.recentSignature = '';
        hookChat();
        hookWhispers();
        hookPlayerList();
        applyAll(true);
        console.log(TAG, 'game hooks ready');
    }

    function applyAll(force = false) {
        const game = findGame();
        if (game) hookGame(game);
        if (!state.game) return;
        applyTab(force);
        applyNameTags(force);
        if (force) refreshChatLog();
        refreshWhispers();
        applyParty(force);
        applyRecentPlayers(force);
    }

    function visibleElement(element) {
        if (!(element instanceof Element) || !element.isConnected) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        let style;
        try { style = getComputedStyle(element); } catch { return false; }
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
    }

    function friendFromCandidate(value, maxDepth = 3) {
        if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;

        const seen = new WeakSet();
        const queue = [{ value, depth: 0 }];
        let scanned = 0;

        while (queue.length && scanned++ < 180) {
            const current = queue.shift();
            const item = current.value;

            if (!item || (typeof item !== 'object' && typeof item !== 'function')) continue;
            if (seen.has(item)) continue;
            seen.add(item);

            let uuid = '';
            let username = '';

            try {
                uuid = String(item.uuid || item.user?.uuid || item.friend?.uuid || '');
                username = String(item.username || item.name || item.user?.username || item.user?.name || item.friend?.username || item.friend?.name || '');
            } catch {}

            if (uuid) {
                const friend = state.friendsByUuid.get(uuid);
                if (friend) {
                    trackFriendUiRef(friend.uuid, item, friend.username);
                    if (item.user && typeof item.user === 'object') trackFriendUiRef(friend.uuid, item.user, friend.username);
                    return friend;
                }

                const saved = state.nicknames.get(uuid);
                if (saved) {
                    const friend = registerKnownFriend({ uuid, username: saved.username || username });
                    if (friend) {
                        trackFriendUiRef(friend.uuid, item, friend.username);
                        if (item.user && typeof item.user === 'object') trackFriendUiRef(friend.uuid, item.user, friend.username);
                        return friend;
                    }
                }
            }

            if (username) {
                const normalizedUsername = normalizeName(username);
                const friend = state.friendsByName.get(normalizedUsername);
                if (friend) {
                    trackFriendUiRef(friend.uuid, item, friend.username);
                    if (item.user && typeof item.user === 'object') trackFriendUiRef(friend.uuid, item.user, friend.username);
                    return friend;
                }

                for (const saved of state.nicknames.values()) {
                    if (normalizeName(saved.username) === normalizedUsername || normalizeName(saved.nickname) === normalizedUsername) {
                        const known = registerKnownFriend({ uuid: saved.uuid, username: saved.username });
                        if (known) {
                            trackFriendUiRef(known.uuid, item, known.username);
                            if (item.user && typeof item.user === 'object') trackFriendUiRef(known.uuid, item.user, known.username);
                            return known;
                        }
                    }
                }
            }

            if (current.depth >= maxDepth) continue;

            let keys = [];
            try { keys = Object.keys(item); } catch { continue; }

            const priority = ['friend', 'user', 'player', 'member', 'data', 'profile', 'props', 'children'];
            keys.sort((a, b) => {
                const pa = priority.indexOf(a);
                const pb = priority.indexOf(b);
                return (pa < 0 ? 999 : pa) - (pb < 0 ? 999 : pb);
            });

            for (const key of keys) {
                if (key === 'parent' || key === 'return' || key === 'ownerDocument' || key === 'window') continue;
                let child;
                try { child = item[key]; } catch { continue; }
                if (child && (typeof child === 'object' || typeof child === 'function')) {
                    queue.push({ value: child, depth: current.depth + 1 });
                }
            }
        }

        return null;
    }

    function friendFromReactNode(node) {
        let current = node instanceof Element ? node : node?.parentElement;

        for (let depth = 0; current && depth < 16; depth++, current = current.parentElement) {
            let keys = [];
            try { keys = Object.keys(current); } catch {}

            for (const key of keys) {
                if (key.startsWith('__reactProps$')) {
                    let props;
                    try { props = current[key]; } catch { continue; }
                    const friend = friendFromCandidate(props, 3);
                    if (friend) return friend;
                }

                if (
                    key.startsWith('__reactFiber$') ||
                    key.startsWith('__reactInternalInstance$')
                ) {
                    let fiber;
                    try { fiber = current[key]; } catch { continue; }

                    for (let up = 0; fiber && up < 12; up++, fiber = fiber.return) {
                        const candidates = [
                            fiber.memoizedProps,
                            fiber.pendingProps,
                            fiber.memoizedState,
                            fiber.stateNode?.props
                        ];

                        for (const candidate of candidates) {
                            const friend = friendFromCandidate(candidate, 2);
                            if (friend) return friend;
                        }
                    }
                }
            }
        }

        return null;
    }

    function friendFromVisibleText(node) {
        if (!state.friendsByUuid.size) return null;
        let current = node instanceof Element ? node : node?.parentElement;

        for (let depth = 0; current && depth < 14; depth++, current = current.parentElement) {
            let text = '';
            try { text = String(current.textContent || ''); } catch {}
            if (!text || text.length > 500) continue;

            const normalized = normalizeName(text);
            let best = null;
            let bestLength = 0;

            for (const [uuid, friend] of state.friendsByUuid) {
                const names = [friend.username, state.nicknames.get(uuid)?.nickname].filter(Boolean);
                for (const name of names) {
                    const key = normalizeName(name);
                    if (key && normalized.includes(key) && key.length > bestLength) {
                        best = friend;
                        bestLength = key.length;
                    }
                }
            }

            if (best) return best;
        }

        return null;
    }

    function resolveContextFriend(target) {
        return friendFromReactNode(target) || friendFromVisibleText(target) || null;
    }

    function friendFromPoint(x, y) {
        let elements = [];
        try {
            elements = document.elementsFromPoint(Number(x) || 0, Number(y) || 0);
        } catch {}

        for (const element of elements) {
            const friend = resolveContextFriend(element);
            if (friend) return friend;
        }

        return null;
    }

    function elementOwnText(element) {
        if (!(element instanceof Element)) return '';
        let out = '';
        for (const node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) out += node.nodeValue || '';
        }
        return String(out).trim();
    }

    function findTextLeaf(root, label) {
        if (!(root instanceof Element)) return null;
        const target = normalizeName(label);
        const queue = [root];
        let scanned = 0;

        while (queue.length && scanned++ < 500) {
            const element = queue.shift();
            if (!(element instanceof Element)) continue;

            const own = normalizeName(elementOwnText(element));
            if (own === target) return element;

            if (!element.children.length && normalizeName(element.textContent) === target) return element;
            for (const child of element.children) queue.push(child);
        }

        return null;
    }

    function clickableActionRoot(leaf) {
        let current = leaf;
        for (let depth = 0; current && depth < 7; depth++, current = current.parentElement) {
            if (!(current instanceof Element)) continue;
            const tag = current.tagName;
            const role = current.getAttribute('role');
            let cursor = '';
            try { cursor = getComputedStyle(current).cursor; } catch {}
            const rect = current.getBoundingClientRect();

            if (
                tag === 'BUTTON' ||
                role === 'menuitem' ||
                (cursor === 'pointer' && rect.width >= 90 && rect.height >= 20)
            ) {
                return current;
            }
        }
        return leaf?.parentElement || leaf || null;
    }

    function replaceActionLabel(action, oldLabel, newLabel) {
        if (!(action instanceof Element)) return;
        const leaf = findTextLeaf(action, oldLabel);
        if (leaf) {
            if (!leaf.children.length) leaf.textContent = newLabel;
            else {
                for (const node of leaf.childNodes) {
                    if (node.nodeType === Node.TEXT_NODE && normalizeName(node.nodeValue) === normalizeName(oldLabel)) {
                        node.nodeValue = newLabel;
                        return;
                    }
                }
            }
            return;
        }

        const walker = document.createTreeWalker(action, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (normalizeName(node.nodeValue) === normalizeName(oldLabel)) {
                node.nodeValue = newLabel;
                return;
            }
        }
    }

    function setNicknameIcon(action) {
        const svg = action?.querySelector?.('svg');
        if (!svg) return;
        try {
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '1.8');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            svg.innerHTML = '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>';
        } catch {}
    }

    function closeNativeContextMenu() {
        try {
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
                cancelable: true
            }));
        } catch {}
    }

    function removeInjectedNicknameActions() {
        try {
            for (const element of document.querySelectorAll('[data-mfn-nickname-action="1"]')) {
                element.remove();
            }
        } catch {}
    }

    function menuMatchesRightClick(menu) {
        if (!(menu instanceof Element)) return false;
        if (!state.contextOpenedAt || performance.now() - state.contextOpenedAt > 1800) return false;

        const rect = menu.getBoundingClientRect();
        const x = state.contextPoint.x;
        const y = state.contextPoint.y;
        const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
        const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;

        return Math.hypot(dx, dy) <= 220;
    }

    function injectNicknameAction(root = document.body) {
        const friend = state.contextFriend;
        if (!friend || !(root instanceof Element)) return false;

        const removeLeaf = findTextLeaf(root, 'Remove friend');
        if (!removeLeaf || !visibleElement(removeLeaf)) return false;

        const removeAction = clickableActionRoot(removeLeaf);
        if (!removeAction?.parentElement) return false;

        const parent = removeAction.parentElement;
        if (!menuMatchesRightClick(parent)) return false;
        if (parent.querySelector?.('[data-mfn-nickname-action="1"]')) return true;

        let template = null;
        let templateLabel = '';

        for (const label of ['Add to favorites', 'View profile', 'Message', 'Remove friend']) {
            const leaf = findTextLeaf(parent, label);
            if (!leaf) continue;
            const action = clickableActionRoot(leaf);
            if (action?.parentElement === parent) {
                template = action;
                templateLabel = label;
                break;
            }
        }

        if (!template) template = removeAction;
        if (!templateLabel) templateLabel = 'Remove friend';

        const action = template.cloneNode(true);
        action.setAttribute('data-mfn-nickname-action', '1');
        action.removeAttribute('id');

        const current = state.nicknames.get(friend.uuid)?.nickname || '';
        const label = current ? 'Edit nickname' : 'Set nickname';
        replaceActionLabel(action, templateLabel, label);
        setNicknameIcon(action);

        action.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            closeNativeContextMenu();
            openNicknameModal(friend);
        }, true);

        parent.insertBefore(action, removeAction);
        return true;
    }

    function stopMenuObserver() {
        if (state.menuObserver) {
            try { state.menuObserver.disconnect(); } catch {}
            state.menuObserver = null;
        }
        if (state.menuObserverTimer) {
            clearTimeout(state.menuObserverTimer);
            state.menuObserverTimer = null;
        }
    }

    function watchForFriendMenu(serial = state.contextSerial) {
        stopMenuObserver();
        if (!state.contextFriend || !document.body) return;
        if (serial !== state.contextSerial) return;
        if (performance.now() - state.contextOpenedAt > 1800) return;

        if (injectNicknameAction(document.body)) return;

        state.menuObserver = new MutationObserver(mutations => {
            if (serial !== state.contextSerial || performance.now() - state.contextOpenedAt > 1800) {
                stopMenuObserver();
                return;
            }

            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (injectNicknameAction(node)) {
                        stopMenuObserver();
                        return;
                    }
                }
            }

            if (injectNicknameAction(document.body)) stopMenuObserver();
        });

        state.menuObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        state.menuObserverTimer = setTimeout(stopMenuObserver, 1800);
    }

    function ensureNicknameUi() {
        if (document.getElementById('mfn-nickname-style')) return;
        const style = document.createElement('style');
        style.id = 'mfn-nickname-style';
        style.textContent = `
            #mfn-nickname-overlay{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;background:rgba(2,5,9,.30);font-family:inherit;color:#fff}
            #mfn-nickname-modal{position:relative;width:min(440px,calc(100vw - 28px));background:#0b0e14;border:2px solid #59616c;border-top:3px solid #25ef71;box-shadow:0 24px 70px rgba(0,0,0,.60);padding:28px 24px 24px;text-align:center}
            #mfn-nickname-close{position:absolute;right:6px;top:6px;width:36px;height:36px;border:2px solid #b65c62;background:#7b1d22;color:white;font-size:21px;line-height:28px;cursor:pointer}
            #mfn-nickname-icon{width:104px;height:104px;margin:0 auto 18px;display:grid;place-items:center;background:#0d2b1c;border:3px solid #3e6550;box-shadow:0 0 18px rgba(82,206,129,.25);color:#00ff62}
            #mfn-nickname-icon svg{width:38px;height:38px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
            #mfn-nickname-title{margin:0;font-size:27px;font-weight:700;letter-spacing:.2px}
            #mfn-nickname-sub{margin:7px auto 19px;max-width:360px;color:#b5b8c0;font-size:14px;line-height:1.5}
            #mfn-nickname-real{color:#8b909a;font-size:11px;margin:-8px 0 13px;word-break:break-all}
            #mfn-nickname-input{display:block;width:100%;height:46px;padding:0 12px;border:3px solid #e7e8ed;background:#0b0d12;color:#fff;font:inherit;font-size:15px;outline:none;box-shadow:none}
            #mfn-nickname-input:focus{border-color:#7dffad}
            #mfn-nickname-meta{display:flex;justify-content:space-between;gap:10px;margin:7px 2px 13px;color:#777e89;font-size:10px}
            #mfn-nickname-save{width:100%;height:48px;border:3px solid #285f48;background:#123d2d;color:#9fa9a5;font:inherit;font-size:17px;font-weight:700;cursor:pointer;transition:.12s}
            #mfn-nickname-save:hover{border-color:#36a36e;background:#185039;color:#d7ffe5}
            #mfn-nickname-hint{margin-top:10px;color:#656c76;font-size:10px}
            #mfn-nickname-toast{position:fixed;left:50%;top:70px;z-index:2147483647;transform:translate(-50%,-6px);padding:8px 12px;background:rgba(7,11,16,.94);border:1px solid rgba(255,255,255,.15);color:#dce5df;font:600 11px system-ui;opacity:0;pointer-events:none;transition:.16s opacity,.16s transform}
            #mfn-nickname-toast.mfn-show{opacity:1;transform:translate(-50%,0)}
        `;
        document.head?.appendChild(style);
    }

    function createNicknameModal() {
        if (state.nicknameModal || !document.body) return;
        ensureNicknameUi();

        const overlay = document.createElement('div');
        overlay.id = 'mfn-nickname-overlay';
        overlay.innerHTML = `
            <div id="mfn-nickname-modal" role="dialog" aria-modal="true">
                <button id="mfn-nickname-close" type="button">×</button>
                <div id="mfn-nickname-icon">
                    <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                </div>
                <h2 id="mfn-nickname-title">Set a Nickname</h2>
                <div id="mfn-nickname-sub"></div>
                <div id="mfn-nickname-real"></div>
                <input id="mfn-nickname-input" maxlength="30" autocomplete="off" spellcheck="false" placeholder="Enter nickname">
                <div id="mfn-nickname-meta"><span>Spaces become _ automatically</span><span id="mfn-nickname-count">0 / 30</span></div>
                <button id="mfn-nickname-save" type="button">Save nickname</button>
                <div id="mfn-nickname-hint">Leave it empty and save to restore the original username.</div>
            </div>
        `;

        document.body.appendChild(overlay);
        state.nicknameModal = overlay;

        const input = overlay.querySelector('#mfn-nickname-input');
        const count = overlay.querySelector('#mfn-nickname-count');

        const cleanInput = () => {
            const before = input.value;
            const cleaned = String(before)
                .replace(/\s/g, '_')
                .replace(/[^A-Za-z0-9_-]/g, '')
                .slice(0, 30);
            if (cleaned !== before) input.value = cleaned;
            count.textContent = `${cleaned.length} / 30`;
        };

        input.addEventListener('input', cleanInput);
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                saveNicknameModal();
            }
        });

        overlay.querySelector('#mfn-nickname-save').addEventListener('click', saveNicknameModal);
        overlay.querySelector('#mfn-nickname-close').addEventListener('click', closeNicknameModal);
        overlay.addEventListener('mousedown', event => {
            if (event.target === overlay) closeNicknameModal();
        });
    }

    function openNicknameModal(friend) {
        if (!friend || !friend.uuid) return;
        createNicknameModal();
        if (!state.nicknameModal) return;

        state.nicknameModalFriend = friend;

        const current = state.nicknames.get(friend.uuid)?.nickname || '';
        const input = state.nicknameModal.querySelector('#mfn-nickname-input');
        const subtitle = state.nicknameModal.querySelector('#mfn-nickname-sub');
        const real = state.nicknameModal.querySelector('#mfn-nickname-real');
        const count = state.nicknameModal.querySelector('#mfn-nickname-count');

        subtitle.textContent = current
            ? 'Edit the local nickname you see for this friend.'
            : 'Choose a local nickname for this friend. Only you can see it.';
        real.textContent = `Original username: ${friend.username}`;
        input.value = current;
        count.textContent = `${current.length} / 30`;
        state.nicknameModal.style.display = 'flex';

        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });
    }

    function closeNicknameModal() {
        if (state.nicknameModal) state.nicknameModal.style.display = 'none';
        state.nicknameModalFriend = null;
    }

    function showNicknameToast(text) {
        ensureNicknameUi();
        if (!state.toast) {
            const toast = document.createElement('div');
            toast.id = 'mfn-nickname-toast';
            document.body?.appendChild(toast);
            state.toast = toast;
        }
        if (!state.toast) return;
        state.toast.textContent = text;
        state.toast.classList.add('mfn-show');
        clearTimeout(showNicknameToast.timer);
        showNicknameToast.timer = setTimeout(() => state.toast?.classList.remove('mfn-show'), 1200);
    }

    function saveNicknameModal() {
        const friend = state.nicknameModalFriend;
        if (!friend || !state.nicknameModal) return;
        const input = state.nicknameModal.querySelector('#mfn-nickname-input');
        const raw = input?.value || '';
        const result = setNickname(friend.uuid, raw);
        if (!result.ok) return;
        closeNicknameModal();
        showNicknameToast(result.nickname ? `${friend.username} → ${result.nickname}` : `${friend.username} restored`);
    }

    function onFriendContextMenu(event) {
        if (!state.friendsLoaded) return;

        const x = Number(event.clientX) || 0;
        const y = Number(event.clientY) || 0;
        const friend = resolveContextFriend(event.target) || friendFromPoint(x, y);
        if (!friend) return;

        removeInjectedNicknameActions();
        stopMenuObserver();

        state.contextFriend = friend;
        state.contextTarget = event.target instanceof Element ? event.target : event.target?.parentElement || null;
        state.contextPoint = { x, y };
        state.contextOpenedAt = performance.now();
        const serial = ++state.contextSerial;

        queueMicrotask(() => watchForFriendMenu(serial));
        setTimeout(() => watchForFriendMenu(serial), 20);
        setTimeout(() => watchForFriendMenu(serial), 80);
        setTimeout(() => watchForFriendMenu(serial), 180);
    }

    function onFriendPointerDown(event) {
        if (event.button !== 0) return;

        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (target?.closest?.('[data-mfn-nickname-action="1"],#mfn-nickname-overlay')) return;

        stopMenuObserver();
        removeInjectedNicknameActions();
        state.contextFriend = null;
        state.contextTarget = null;
        state.contextOpenedAt = 0;
        state.contextSerial++;
    }

    function onNicknameKeydown(event) {
        if (event.key === 'Escape' && state.nicknameModal?.style.display === 'flex') {
            event.preventDefault();
            event.stopPropagation();
            closeNicknameModal();
        }
    }

    function initUiWhenReady() {
        if (document.body) {
            ensureNicknameUi();
            createNicknameModal();
            return;
        }
        const timer = setInterval(() => {
            if (!document.body) return;
            clearInterval(timer);
            ensureNicknameUi();
            createNicknameModal();
        }, 100);
    }

    W.addEventListener('contextmenu', onFriendContextMenu, true);
    W.addEventListener('pointerdown', onFriendPointerDown, true);
    W.addEventListener('keydown', onNicknameKeydown, true);

    W.__FRIEND_NICKNAMES__ = {
        edit: identity => {
            const key = String(identity || '').trim();
            const friend = state.friendsByUuid.get(key) || state.friendsByName.get(normalizeName(key)) || null;
            if (friend) openNicknameModal(friend);
            return !!friend;
        },
        close: closeNicknameModal,
        refresh: () => applyAll(true),
        list: () => Array.from(state.friendsByUuid.values()).map(friend => ({
            uuid: friend.uuid,
            username: friend.username,
            nickname: state.nicknames.get(friend.uuid)?.nickname || ''
        })),
        set: (identity, nickname) => setNickname(identity, nickname),
        clear: identity => setNickname(identity, ''),
        status: () => ({
            friendsLoaded: state.friendsLoaded,
            friends: state.friendsByUuid.size,
            nicknames: state.nicknames.size,
            gameFound: !!state.game,
            contextMenuIntegration: true,
            nativeFriendContextFound: !!findFriendContextValue()
        })
    };

    loadNicknames();
    installNetworkObservers();
    initUiWhenReady();

    state.finderTimer = setInterval(() => {
        const game = findGame(true);
        if (game) hookGame(game);
    }, 700);

    state.applyTimer = setInterval(() => {
        applyAll(false);
    }, 180);

    console.log(TAG, 'loaded');
})();
