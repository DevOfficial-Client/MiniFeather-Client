(function () {
    'use strict';
    if (window.__MF_CustomSkins) return;
    window.__MF_CustomSkins = true;

    var TAG = "minifeather skins";

    function warn() {
        var args = [TAG].concat(Array.prototype.slice.call(arguments));
        console.warn.apply(console, args);
    }
    var dollLogged = {};
    function dollLog() {
        var key = Array.prototype.join.call(arguments, '|');
        if (dollLogged[key]) return;
        dollLogged[key] = true;
        var args = [TAG].concat(Array.prototype.slice.call(arguments));
        console.log.apply(console, args);
    }

    function skinsBaseUrl() {
        var meta = document.querySelector('meta[name="mf-skins-base"]');
        return meta && meta.content ? meta.content : null;
    }

    var packSkinReg = (globalThis.__MF_PACK_SKINS__ ||= {});
    var CUSTOM_URL_RE = /(?:^|\/)auth-api\/(?:skins|capes)\/custom\/([^\/?#]+)\.png(?:[?#]|$)/;

    function installCustomUrlHook() {
        if (globalThis.__MF_PACK_IMG_HOOK__) return;
        var proto = HTMLImageElement.prototype;
        var d = Object.getOwnPropertyDescriptor(proto, 'src');
        if (!d || !d.set || !d.get) return;
        var origSet = d.set;
        Object.defineProperty(proto, 'src', {
            configurable: true,
            enumerable: d.enumerable,
            get: function () { return d.get.call(this); },
            set: function (v) {
                if (typeof v === 'string') {
                    var reg = globalThis.__MF_PACK_SKINS__;
                    if (reg) {
                        var m = v.match(CUSTOM_URL_RE);
                        if (m && reg[m[1]]) { origSet.call(this, reg[m[1]]); return; }

                        var m2 = v.match(/(?:^|\/)textures\/entity\/(skins|capes)\/(.+?)\.png(?:[?#]|$)/);
                        if (m2) {
                            var stripped = m2[2].replace(/^custom:/i, '');
                            var k2 = reg[m2[2]] ? m2[2] : (reg[stripped] ? stripped : m2[2]);
                            if (reg[k2]) { origSet.call(this, reg[k2]); return; }
                        }
                    }
                }
                origSet.call(this, v);
            }
        });
        globalThis.__MF_PACK_IMG_HOOK__ = true;
    }
    function resolveCustomTextureUrl(url) {
        if (!url || typeof url !== 'string') return null;
        var m = url.match(CUSTOM_URL_RE);
        if (!m) {
            var m2 = url.match(/(?:^|\/)textures\/entity\/(?:skins|capes)\/([^\/?#]+)\.png(?:[?#]|$)/);
            if (!m2) return null;
            m = m2;
        }
        var skinId = m[1].replace(/^custom:/i, '');

        var reg = globalThis.__MF_PACK_SKINS__;
        if (reg && reg[skinId]) return reg[skinId];
        var entry = getCustomSkinForId(skinId);
        if (entry) {
            var u = entrySkinUrl(entry) || entryCapeUrl(entry);
            if (u && /^data:/i.test(u)) return u;
        }
        return null;
    }

    var devSkinsRegistered = false;
    function registerDevSkins() {
        if (devSkinsRegistered) return;
        installCustomUrlHook();
        var base = skinsBaseUrl();
        if (!base) return;

        base = String(base).replace(/\/*$/, '/');

        var packs = {
            estebangxe: 'EstebanExG__1_1.png',
            angrywolfx: 'angrywolfx.png',
            eve: 'eve.png'
        };
        for (var id in packs) {
            if (!Object.prototype.hasOwnProperty.call(packs, id)) continue;
            if (!packSkinReg['mf_' + id]) {
                packSkinReg['mf_' + id] = base + 'mypacks/' + id + '/' + packs[id];
            }
        }
        devSkinsRegistered = true;
    }

    var DB_KEY = 'minifeather:custom-skins-db';

    var BUILTIN_DB = {
        players: {

            '6eb7369a-551e-406a-9a63-6db7a358e1e5': { skin: 'custom:mf_estebangxe' },
            'c4201f43-2de9-4275-930a-301fae4cce6c': { skin: 'custom:mf_angrywolfx' },

            'eve': { skin: 'custom:mf_eve' }
        }
    };

    var db = null;

    var dbByUuid = null;

    var dbByName = null;

    var dbLoading = null;

    function normalizeSkinValue(value) {
        if (typeof value !== 'string') return null;

        if (value.indexOf('custom:') === 0) return value;
        var v = value.trim().replace(/\\/g, '/');
        if (!v) return null;
        if (/^`?(https?:|data:image)/i.test(v)) return v.replace(/^`+|`+$/g, '');
        v = v.replace(/^\/+/, '');
        var m = v.match(/^skins\/(.+)$/i);
        if (m) v = m[1];
        return v.replace(/\.png$/i, '');
    }

    function isVanillaSkinId(id) {

        return typeof id === 'string' && id && /^[a-z0-9_]+$/i.test(id) && id.indexOf('/') === -1;
    }

    function entryAssetUrl(entry, kind) {
        if (!entry) return null;
        var s = kind === 'cape' ? entry.__cape : entry.__skin;
        if (!s) return null;

        if (s.indexOf('custom:') === 0) return null;
        if (/^(https?:|data:image)/i.test(s)) return s;
        if (isVanillaSkinId(s)) return null;
        var base = skinsBaseUrl();
        if (!base) return null;
        return base + s + '.png';
    }

    function entrySkinUrl(entry) { return entryAssetUrl(entry, 'skin'); }
    function entryCapeUrl(entry) { return entryAssetUrl(entry, 'cape'); }

    function parseDb(data, reset) {
        if (reset) { dbByUuid = {}; dbByName = {}; }
        if (!dbByUuid) dbByUuid = {};
        if (!dbByName) dbByName = {};
        if (!data || typeof data !== 'object') return;
        var players = data.players || data;
        for (var key in players) {
            if (!Object.prototype.hasOwnProperty.call(players, key)) continue;
            var raw = players[key];
            if (!raw || typeof raw !== 'object') continue;
            var skin = normalizeSkinValue(raw.skin);
            var cape = normalizeSkinValue(raw.cape);
            if (!skin && !cape) continue;
            var entry = { __skin: skin, __cape: cape };
            if (typeof raw.rank === 'string' && raw.rank) entry.rank = raw.rank;
            var uuidKey = String(key).toLowerCase();
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuidKey)) {
                dbByUuid[uuidKey] = entry;
            } else {
                dbByName[uuidKey] = entry;
            }
        }
        exposeDb();
    }

    function exposeDb() {
        var out = { byUuid: {}, byName: {} };
        function fill(src, dst) {
            if (!src) return;
            for (var k in src) {
                if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
                var s = src[k] && src[k].__skin;
                if (s) dst[k] = s;
            }
        }
        fill(dbByUuid, out.byUuid);
        fill(dbByName, out.byName);
        try { window.__MF_CustomSkins_DB__ = out; } catch (_) {}
    }

    function loadDb() {
        if (db !== null) return Promise.resolve(db);
        if (dbLoading) return dbLoading;

        var finish = function (data) {

            parseDb(BUILTIN_DB, true);
            parseDb(data, false);
            db = data || {};
            dbLoading = null;
            fetch('https://raw.githubusercontent.com/shusukegxe/mfaccs/main/accounts.json', { cache: 'no-store' })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (live) {
                    if (!live || !live.players) return;
                    parseDb(live, false);
                    try { prefetchRemoteSkins(); } catch (_) {}
                })
                .catch(function () {});
            var n = Object.keys(dbByUuid).length + Object.keys(dbByName).length;
            try { prefetchRemoteSkins(); } catch (_) {}
            return db;
        };

        dbLoading = new Promise(function (resolve) {
            var done = false;
            var finishFromExt = function (json) {
                if (done) return;
                done = true;
                resolve(json);
            };
            var tryMetaUrl = function (attempt) {
                attempt = attempt || 0;
                var base = null;
                try { base = skinsBaseUrl(); } catch (_) {}
                if (!base || !/^chrome-extension:/i.test(base)) {
                    if (attempt < 20) return setTimeout(function () { tryMetaUrl(attempt + 1); }, 250);
                    return finishFromExt(null);
                }
                var url = base.replace(/skins\/?$/i, '') + 'assets/accounts.json';
                fetch(url, { cache: 'no-store' })
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (json) {
                        if (json && json.players) finishFromExt(json);
                        else if (attempt < 20) tryMetaUrl(attempt + 1);
                        else finishFromExt(null);
                    })
                    .catch(function () {
                        if (attempt < 20) tryMetaUrl(attempt + 1);
                        else finishFromExt(null);
                    });
            };
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ type: 'mfAccounts:get' }, function (res) {
                        if (!chrome.runtime.lastError && res && res.success && res.json) {
                            finishFromExt(res.json);
                        } else {
                            tryMetaUrl();
                        }
                    });
                    return;
                }
            } catch (_) {}
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                    fetch(chrome.runtime.getURL('assets/accounts.json'), { cache: 'no-store' })
                        .then(function (r) { return r.ok ? r.json() : null; })
                        .then(function (json) { if (json) finishFromExt(json); else tryMetaUrl(); })
                        .catch(tryMetaUrl);
                    return;
                }
            } catch (_) {}
            tryMetaUrl();
        })
            .then(finish)
            .catch(function (e) {
                warn('accounts.json local no disponible (' + (e && e.message || e) + '), usando sessionStorage');
                try {
                    var cached = sessionStorage.getItem(DB_KEY);
                    if (cached) return finish(JSON.parse(cached));
                } catch (_) {}
                return finish(null);
            });

        return dbLoading;
    }

    function lookupEntry(profile) {
        if (!dbByUuid && !dbByName) return null;
        var uuid = typeof profile.uuid === 'string' ? profile.uuid.toLowerCase() : null;
        if (uuid && dbByUuid[uuid]) return dbByUuid[uuid];
        var name = typeof profile.username === 'string'
            ? profile.username.toLowerCase()
            : (typeof profile.name === 'string' ? profile.name.toLowerCase() : null);
        if (name && dbByName[name]) return dbByName[name];
        return null;
    }

    var patchedProfiles = new WeakSet();

    function patchProfile(profile) {
        if (!profile || typeof profile !== 'object') return false;
        if (patchedProfiles.has(profile)) return false;
        patchedProfiles.add(profile);

        var entry = lookupEntry(profile);
        if (!entry) return false;

        try {
            profile.skin = entry.__skin;
            return true;
        } catch (e) {
            return false;
        }
    }

    function walkAndPatch(node, depth) {
        if (!node || typeof node !== 'object' || depth > 3) return false;
        var changed = false;

        if (typeof node.uuid === 'string' && node.uuid.length > 8) {
            changed = patchProfile(node) || changed;
        }

        if (Array.isArray(node)) {
            for (var i = 0; i < node.length && i < 200; i++) {
                changed = walkAndPatch(node[i], depth + 1) || changed;
            }
            return changed;
        }

        for (var key in node) {
            if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
            var value = node[key];
            if (value && typeof value === 'object') {
                changed = walkAndPatch(value, depth + 1) || changed;
            }
        }
        return changed;
    }

    function isProfileResponse(url) {
        return url.indexOf('miniblox.io') !== -1 ||
               url.indexOf('miniblox.online') !== -1 ||
               url.charAt(0) === '/' ||
               url.indexOf('auth-api') !== -1;
    }

    function patchFetch() {
        if (window.__customSkinsFetchPatched) return true;
        if (typeof window.fetch !== 'function') return false;

        var originalFetch = window.fetch;
        window.fetch = function (input, init) {
            var args = arguments;

            var reqUrl = '';
            try {
                reqUrl = typeof input === 'string' ? input : (input && input.url ? input.url : '');
            } catch (e) {}
            if (reqUrl && (reqUrl.indexOf('auth-api') !== -1 || reqUrl.indexOf('textures/entity') !== -1)) {
                var localSkin = resolveCustomTextureUrl(reqUrl);
                if (localSkin) {
                    return originalFetch.call(this, localSkin, { cache: 'force-cache' })
                        .catch(function () { return originalFetch.apply(this, args); });
                }
            }

            var promise = originalFetch.apply(this, args);
            if (!reqUrl || !isProfileResponse(reqUrl)) return promise;

            return promise.then(function (response) {
                try {
                    var ct = response.headers && response.headers.get
                        ? (response.headers.get('content-type') || '')
                        : '';
                    if (ct.indexOf('json') === -1 && ct.indexOf('text/plain') === -1) {
                        return response;
                    }
                    return response.clone().text().then(function (text) {
                        var data;
                        try { data = JSON.parse(text); } catch (e) { return response; }
                        if (!walkAndPatch(data, 0)) return response;
                        var out;
                        try { out = JSON.stringify(data); } catch (e) { return response; }
                        try {
                            var headers = new Headers(response.headers);
                            headers.set('content-type', 'application/json');
                            return new Response(out, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: headers
                            });
                        } catch (e) {
                            return new Response(out, { headers: { 'content-type': 'application/json' } });
                        }
                    }).catch(function () { return response; });
                } catch (e) {
                    return response;
                }
            });
        };
        window.__customSkinsFetchPatched = true;
        return true;
    }
    var SKIN_PATH_REGEX = /^(?:[a-z][a-z0-9+.-]*:\/\/[^\/]+)?\/?textures\/entity\/skins\/([^\/?#]+)\.png(?:[?#].*)?$/i;

    var SKIN_PATH_REGEX_DEEP = /^(?:[a-z][a-z0-9+.-]*:\/\/[^\/]+)?\/?textures\/entity\/skins\/(.+?)\.png(?:[?#].*)?$/i;
    var SKIN_API_URL_RE = /(?:^|\/)skins\/custom\/([^\/?#]+)\.png(?:[?#].*)?$/i;
    var patched = false;

    function getCustomSkinForId(skinId) {
        if (!dbByUuid && !dbByName) return null;
        var withPrefix = 'custom:' + skinId;
        for (var uuid in dbByUuid) {
            var s1 = dbByUuid[uuid].__skin;
            if (s1 === skinId || s1 === withPrefix) return dbByUuid[uuid];
        }
        for (var name in dbByName) {
            var s2 = dbByName[name].__skin;
            if (s2 === skinId || s2 === withPrefix) return dbByName[name];
        }
        return null;
    }
    var gameCacheRef = null;
    var gameCacheAt = 0;
    function findGame() {
        var now = performance.now();
        if (gameCacheRef && gameCacheRef.player && now - gameCacheAt < 1500) return gameCacheRef;
        if (now - gameCacheAt < 500) return gameCacheRef;
        gameCacheAt = now;
        try {
            if (window.miniblox?.player) { gameCacheRef = window.miniblox; return gameCacheRef; }
            var react = document.querySelector('#react');
            if (react) {
                for (var key in react) {
                    var game = react[key]?.updateQueue?.baseState?.element?.props?.game;
                    if (game?.player) { gameCacheRef = game; window.__MINIBLOX_GAME__ = game; return game; }
                }
            }
        } catch (e) {}
        gameCacheRef = null;
        return null;
    }

    var lastLiveScan = 0;

    function applyLiveOverrides() {
        registerDevSkins();
        if (dbByUuid === null && dbByName === null) return;
        if (!Object.keys(dbByUuid).length && !Object.keys(dbByName).length) return;

        var game = findGame();
        var world = game?.world;
        if (!world || !world.players) return;

        try {
            if (game?.player?.profile) overridePlayer(game.player);

            var players = world.players;
            if (typeof players.forEach === 'function') {
                players.forEach(function (player) { overridePlayer(player); });
            } else if (typeof players.values === 'function') {
                var it = players.values();
                var entry;
                while (!(entry = it.next()).done) overridePlayer(entry.value);
            }
        } catch (e) {}
        repaintFirstPersonHand();
    }
    function repaintFirstPersonHand() {
        try {
            var game = findGame();
            if (!game || !game.player || !game.gameScene) return;
            var entry = game.player.profile ? lookupEntry(game.player.profile) : null;
            if (!entry) return;
            var url = resolveSkinImageUrl(entry);
            if (!url || !/^(https?|data|chrome-extension|blob):/i.test(url)) return;

            var camParent = game.gameScene.axesHelper && game.gameScene.axesHelper.parent;
            var kids = (camParent && camParent.children) || [];
            var lf = null;
            for (var i = 0; i < kids.length; i++) {
                if (typeof kids[i].updateArmAnimation === 'function' && kids[i].rightArm) {
                    lf = kids[i];
                    break;
                }
            }
            if (!lf || typeof lf.traverse !== 'function') return;
            var arm = lf.rightArm;
            if (!arm || !arm.material) return;
            try {
                var itemMats = [];
                if (lf.item && typeof lf.item.traverse === 'function') {
                    lf.item.traverse(function (o) {
                        if (!o || !o.material) return;
                        var list = Array.isArray(o.material) ? o.material : [o.material];
                        for (var q = 0; q < list.length; q++) {
                            if (!list[q]) continue;
                            ITEM_MATS.add(list[q]);
                            if (list[q].map &&
                                (list[q].map.__mfPainted || list[q].map.__mfEpoch)) {
                                itemMats.push(list[q]);
                            }
                        }
                    });
                }
                for (var r = 0; r < itemMats.length; r++) {
                    var im = itemMats[r];
                    if (im.__mfOrigMap) {
                        im.map = im.__mfOrigMap;
                    } else {
                        im.map = null;
                    }
                    im.needsUpdate = true;
                    delete im.__mfOrigMap;
                }
            } catch (_) {}

            var mats = Array.isArray(arm.material) ? arm.material : [arm.material];
            mats = mats.filter(function (m) {
                if (!m || !m.map) return false;
                var im = m.map.image;
                var w = im ? im.width : 0, h = im ? im.height : 0;
                if (!w || !h) return false;
                var k = w / 64;
                return Number.isInteger(k) && (h === w || h === w / 2) && k >= 1 && k <= 2;
            });
            if (!mats.length) return;

            var pending = mats.filter(function (m) {
                return m.map && (m.map.__mfPainted !== url || m.map.__mfEpoch !== paintEpoch);
            });
            if (!pending.length) return;

            var img = new Image();
            if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous';
            img.onload = function () {
                for (var i = 0; i < pending.length; i++) {
                    var t = pending[i].map;
                    if (!t) continue;
                    try {
                        var c = document.createElement('canvas');
                        c.width = img.naturalWidth || img.width;
                        c.height = img.naturalHeight || img.height;
                        var ctx = c.getContext('2d');
                        ctx.imageSmoothingEnabled = false;
                        ctx.drawImage(img, 0, 0);
                        var nt = null;
                        try { nt = new t.constructor(c); } catch (_) {}
                        if (!nt) continue;
                        try {
                            nt.magFilter = t.magFilter; nt.minFilter = t.minFilter;
                            if (t.colorSpace !== undefined && 'colorSpace' in nt) nt.colorSpace = t.colorSpace;
                            nt.flipY = t.flipY; nt.wrapS = t.wrapS; nt.wrapT = t.wrapT;
                        } catch (_) {}
                        nt.__mfPainted = url;
                        nt.__mfEpoch = paintEpoch;
                        if (t.__mfPainted || t.__mfEpoch) { try { t.dispose(); } catch (_) {} }
                        pending[i].map = nt;
                        pending[i].needsUpdate = true;
                    } catch (e) {}
                }
            };
            img.src = url;
        } catch (_) {}
    }
    var paintedPlayers = new WeakSet();
    var paintEpoch = 1;
    globalThis.__MF_SKIN_EPOCH__ = paintEpoch;
    function bumpEpoch() { paintEpoch++; globalThis.__MF_SKIN_EPOCH__ = paintEpoch; }
    var REMOTE_CACHE_KEY = 'mf:remoteskins:v1';
    var remoteCache = null;
    var remoteFailed = {};
    var remotePending = {};

    function loadRemoteCache() {
        if (remoteCache) return;
        remoteCache = {};
        try {
            var raw = localStorage.getItem(REMOTE_CACHE_KEY);
            if (raw) {
                var obj = JSON.parse(raw);
                if (obj && typeof obj === 'object') remoteCache = obj;
            }
        } catch (_) {}
    }

    function saveRemoteCache() {
        try {
            localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(remoteCache));
        } catch (_) {
            try {
                var keys = Object.keys(remoteCache);
                for (var i = 0; i < Math.ceil(keys.length / 2); i++) delete remoteCache[keys[i]];
                localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(remoteCache));
            } catch (_) {}
        }
    }

    function scheduleRemoteDownload(url, force) {
        if (!url || (remoteFailed[url] || 0) >= 3) return;
        if (!force && (remoteCache[url] || remotePending[url])) return;
        remotePending[url] = true;
        fetch(url, { mode: 'cors', cache: force ? 'reload' : 'default' })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
            .then(function (b) {
                return new Promise(function (res, rej) {
                    var fr = new FileReader();
                    fr.onload = function () { res(fr.result); };
                    fr.onerror = function () { rej(new Error('read')); };
                    fr.readAsDataURL(b);
                });
            })
            .then(function (dataUrl) {
                // skinguard: skins/capas remotas (amigos/comunidad) pasan el filtro
                // antes de entrar en caché. bloqueado = no se cachea ni se aplica.
                var guard = globalThis.__MF_SKIN_GUARD__;
                if (!guard || typeof dataUrl !== 'string' || dataUrl.indexOf('data:image') !== 0) return dataUrl;
                return guard.checkDataUrl(dataUrl).then(function (v) {
                    if (v.flag) {
                        warn('skin/capa remota bloqueada por el filtro (' + v.reason + '):', url.slice(-28));
                        return null;
                    }
                    return dataUrl;
                });
            })
            .then(function (dataUrl) {
                if (typeof dataUrl === 'string' && dataUrl.indexOf('data:image') === 0) {
                    var had = !!remoteCache[url];
                    remoteCache[url] = dataUrl;
                    saveRemoteCache();
                    if (had) bumpEpoch();
                } else throw new Error('no image');
            })
            .catch(function () {
                remoteFailed[url] = (remoteFailed[url] || 0) + 1;
                warn('descarga de skin remota falló (' + remoteFailed[url] + '/3):', url.slice(-28));
            })
            .then(function () { delete remotePending[url]; });
    }

    function cachedRemoteOrKick(url) {
        if (remoteCache[url]) return remoteCache[url];
        scheduleRemoteDownload(url);
        if ((remoteFailed[url] || 0) >= 3) return url;
        return null;
    }

    function prefetchRemoteSkins() {
        loadRemoteCache();
        var seen = {};
        function scan(map) {
            if (!map) return;
            for (var k in map) {
                if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
                var s = entrySkinUrl(map[k]);
                if (s && /^https?:/i.test(s) && !seen[s]) { seen[s] = 1; scheduleRemoteDownload(s); }
                var c = entryCapeUrl(map[k]);
                if (c && /^https?:/i.test(c) && !seen[c]) { seen[c] = 1; scheduleRemoteDownload(c); }
            }
        }
        scan(dbByUuid);
        scan(dbByName);
    }

    function resolveAssetImageUrl(entry, kind) {
        if (!entry) return null;
        var s = kind === 'cape' ? entry.__cape : entry.__skin;
        if (!s) return null;

        if (s.indexOf('custom:') === 0) {
            var reg = globalThis.__MF_PACK_SKINS__ || {};
            return reg[s.slice(7)] || null;
        }
        var url = entryAssetUrl(entry, kind);
        if (url && /^https?:/i.test(url) && url.indexOf(location.origin) !== 0) {
            loadRemoteCache();
            return cachedRemoteOrKick(url);
        }
        return url;
    }

    function resolveSkinImageUrl(entry) { return resolveAssetImageUrl(entry, 'skin'); }
    function resolveCapeImageUrl(entry) { return resolveAssetImageUrl(entry, 'cape'); }
    function capeMeshesOf(mesh) {
        var out = [];
        try {
            var direct = mesh?.capeMesh;
            if (direct) out.push(direct);
            mesh?.traverse?.(function (o) {
                if (o && o !== mesh && o.capeMesh && out.indexOf(o.capeMesh) === -1) {
                    out.push(o.capeMesh);
                }
            });
        } catch (_) {}
        return out;
    }

    function collectMaterialsOf(root) {
        var out = [], seen = new Set();
        try {
            root.traverse(function (o) {
                if (!o || !o.material) return;
                var list = Array.isArray(o.material) ? o.material : [o.material];
                for (var i = 0; i < list.length; i++) {
                    var m = list[i];
                    if (m && m.map && !seen.has(m)) { seen.add(m); out.push(m); }
                }
            });
        } catch (_) {}
        return out;
    }
    function isFacialTex(t) {
        return !!(t && (t.__mfLocalCanvas || t.__mfPeerCanvas || t.__mfOtherKey));
    }
    function armorMeshesOf(mesh) {
        var out = [];
        try {
            var regs = [mesh && mesh.skinnedArmor, mesh && mesh.armorMesh, mesh && mesh.lodArmor];
            for (var ri = 0; ri < regs.length; ri++) {
                var reg = regs[ri];
                if (reg && typeof reg === 'object') {
                    for (var k in reg) if (reg[k]) out.push(reg[k]);
                }
            }
            var mreg = mesh && mesh.meshes;
            if (mreg && typeof mreg === 'object') {
                for (var k2 in mreg) {
                    if (/helmet|chestplate|leggings|boots|armor/i.test(k2) && mreg[k2]) out.push(mreg[k2]);
                }
            }
            mesh?.traverse?.(function (o) {
                if (o && o !== mesh && o.name && /helmet|chestplate|leggings|boots|armor/i.test(o.name) &&
                    out.indexOf(o) === -1) out.push(o);
            });
        } catch (_) {}
        return out;
    }
    var ITEM_MATS = new WeakSet();

    function collectItemMaterials(mesh) {
        try {
            mesh.traverse(function (o) {
                if (!o || typeof o.needsRendering !== 'function'
                    || typeof o.renderDistanceSq !== 'function') return;
                var list = Array.isArray(o.material) ? o.material : [o.material];
                for (var i = 0; i < list.length; i++) {
                    var m = list[i];
                    if (!m) continue;
                    ITEM_MATS.add(m);
                    if (m.map && m.map.__mfPainted && m.__mfOrigMap) {
                        m.map = m.__mfOrigMap;
                        m.needsUpdate = true;
                        delete m.__mfOrigMap;
                    }
                }
            });
        } catch (_) {}
    }

    var skinMatsCache = new WeakMap();
    var SKIN_MATS_TTL = 5000;

    function skinMaterialsOf(mesh) {
        var now = Date.now();
        var hit = skinMatsCache.get(mesh);
        if (hit && hit.epoch === paintEpoch && now - hit.at < SKIN_MATS_TTL) return hit.mats;
        var mats = computeSkinMaterials(mesh);
        skinMatsCache.set(mesh, { mats, at: now, epoch: paintEpoch });
        return mats;
    }

    function computeSkinMaterials(mesh) {
        collectItemMaterials(mesh);
        var exclude = new Set();
        capeMeshesOf(mesh).forEach(function (c) {
            collectMaterialsOf(c).forEach(function (m) { exclude.add(m); });
        });
        armorMeshesOf(mesh).forEach(function (c) {
            collectMaterialsOf(c).forEach(function (m) { exclude.add(m); });
        });

        var all = collectMaterialsOf(mesh);
        var bodyMats = all.filter(function (m) { return !exclude.has(m) && !ITEM_MATS.has(m); });

        var skins = bodyMats.filter(function (m) {
            if (isFacialTex(m.map)) return false;
            var w = m.map?.image?.width, h = m.map?.image?.height;
            if (!w || !h) return false;
            var k64 = w / 64;
            return Number.isInteger(k64) && (h === w || h === w / 2) && k64 >= 1 && k64 <= 2;
        });
        return skins;
    }

    function capeMaterialsOf(mesh) {
        var out = [];
        capeMeshesOf(mesh).forEach(function (c) {
            collectMaterialsOf(c).forEach(function (m) {
                if (out.indexOf(m) === -1) out.push(m);
            });
        });
        return out;
    }

    function paintEntitySkin(player, entry) {
        try {
            var mesh = player.mesh;
            if (!mesh || typeof mesh.traverse !== 'function') return false;
            var url = resolveSkinImageUrl(entry);
            if (!url) return false;
            var mats = skinMaterialsOf(mesh);
            if (!mats.length) return false;
            var who = (player.profile && (player.profile.username || player.profile.uuid)) || 'player';
            var pendingName = who;
            var img = new Image();
            if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous';
            img.onload = function () {
                var done = 0;
                for (var i = 0; i < mats.length; i++) {
                    var t = mats[i].map;
                    if (!t) continue;
                    try {
                        var c = document.createElement('canvas');
                        c.width = img.naturalWidth || img.width;
                        c.height = img.naturalHeight || img.height;
                        var ctx = c.getContext('2d');
                        ctx.imageSmoothingEnabled = false;
                        ctx.drawImage(img, 0, 0);
                        var nt = null;
                        try { nt = new t.constructor(c); } catch (_) {}
                        if (!nt) continue;
                        try {
                            nt.magFilter = t.magFilter; nt.minFilter = t.minFilter;
                            if (t.colorSpace !== undefined && 'colorSpace' in nt) nt.colorSpace = t.colorSpace;
                            nt.flipY = t.flipY; nt.wrapS = t.wrapS; nt.wrapT = t.wrapT;
                        } catch (_) {}
                        nt.__mfPainted = url;
                        nt.__mfEpoch = paintEpoch;
                        if (t.__mfPainted || t.__mfEpoch) { try { t.dispose(); } catch (_) {} }
                        mats[i].map = nt;
                        mats[i].needsUpdate = true;
                        done++;
                    } catch (e) {
                        warn('repintado falló en material', i, 'de', pendingName, ':', e && e.message);
                    }
                }
                if (done > 0) {
                    try {
                        window.dispatchEvent(new CustomEvent('minifeather:skin-repainted', {
                            detail: { player: who, mesh: mesh }
                        }));
                    } catch (_) {}
                } else {
                    warn('✘ imagen cargó pero 0 materiales repintados para', pendingName);
                    paintedPlayers.delete(player);
                }
            };
            img.onerror = function () {
                warn('no se pudo pintar la skin custom:', url);
                paintedPlayers.delete(player);
            };
            img.src = url;
            return true;
        } catch (_) { return false; }
    }

    var seenProfileIds = new WeakSet();
    var engineApplied = new WeakSet();
    var engineAppliedCapes = new WeakSet();
    var paintedCapes = new WeakSet();
    function applyCapeOverride(player, entry, cosmetics) {
        var target = entry.__cape;
        if (!target) return;
        if (target.indexOf('custom:') === 0) {
            var cid = target.slice(7);
            var reg = globalThis.__MF_PACK_SKINS__ || {};
            if (!reg[cid]) return;
            if (cosmetics.cape === target && engineAppliedCapes.has(player)) {
                paintPlayerUrl(player, reg[cid], true);
                return;
            }
            try {
                cosmetics.cape = target;
                engineAppliedCapes.add(player);
                paintedCapes.delete(player);
                if (player.mesh && typeof player.mesh.recreate === 'function') {
                    player.mesh.recreate();
                }
                paintPlayerUrl(player, reg[cid], true);
            } catch (e) {
                warn('falló aplicar capa custom', target, ':', e && e.message);
            }
            return;
        }
        if (isVanillaSkinId(target)) {
            if (cosmetics.cape === target) return;
            try {
                cosmetics.cape = target;
                engineAppliedCapes.add(player);
                paintedCapes.delete(player);
                if (player.mesh && typeof player.mesh.recreate === 'function') {
                    player.mesh.recreate();
                }
            } catch (e) {
                warn('falló aplicar capa vanilla', target, ':', e && e.message);
            }
            return;
        }
        var url = resolveCapeImageUrl(entry);
        if (!url) return;
        var stillPainted = false;
        if (paintedCapes.has(player) && player.mesh) {
            try {
                var cm = capeMaterialsOf(player.mesh);
                stillPainted = cm.length > 0 && cm.every(function (m) {
                    return m.map && m.map.__mfPainted === url && m.map.__mfEpoch === paintEpoch;
                });
            } catch (_) { stillPainted = false; }
        }
        if (stillPainted) return;
        paintedCapes.delete(player);

        if (paintEntityCape(player, entry)) {
            paintedCapes.add(player);
            try { player.__mfCapeEpoch = paintEpoch; } catch (_) {}
        }
    }

    function paintEntityCape(player, entry) {
        try {
            var mesh = player.mesh;
            if (!mesh || typeof mesh.traverse !== 'function') return false;
            var url = resolveCapeImageUrl(entry);
            if (!url) return false;
            var mats = capeMaterialsOf(mesh);
            if (!mats.length) return false;
            var who = (player.profile && (player.profile.username || player.profile.uuid)) || 'player';
            var img = new Image();
            if (/https?:/i.test(url)) img.crossOrigin = 'anonymous';
            img.onload = function () {
                var done = 0;
                for (var i = 0; i < mats.length; i++) {
                    var t = mats[i].map;
                    if (!t) continue;
                    try {
                        var c = document.createElement('canvas');
                        c.width = img.naturalWidth || img.width;
                        c.height = img.naturalHeight || img.height;
                        var ctx = c.getContext('2d');
                        ctx.imageSmoothingEnabled = false;
                        ctx.drawImage(img, 0, 0);
                        var nt = null;
                        try { nt = new t.constructor(c); } catch (_) {}
                        if (!nt) continue;
                        try {
                            nt.magFilter = t.magFilter; nt.minFilter = t.minFilter;
                            if (t.colorSpace !== undefined && 'colorSpace' in nt) nt.colorSpace = t.colorSpace;
                            nt.flipY = t.flipY; nt.wrapS = t.wrapS; nt.wrapT = t.wrapT;
                        } catch (_) {}
                        nt.__mfPainted = url;
                        nt.__mfEpoch = paintEpoch;
                        if (t.__mfPainted || t.__mfEpoch) { try { t.dispose(); } catch (_) {} }
                        mats[i].map = nt;
                        mats[i].needsUpdate = true;
                        done++;
                    } catch (e) {
                        warn('repintado de capa falló en material', i, 'de', who, ':', e && e.message);
                    }
                }
                if (done === 0) paintedCapes.delete(player);
            };
            img.onerror = function () {
                warn('no se pudo pintar la capa custom:', url);
                paintedCapes.delete(player);
            };
            img.src = url;
            return true;
        } catch (_) { return false; }
    }

    function overridePlayer(player) {
        if (!player || !player.profile) return;
        var profile = player.profile;
        var cosmetics = profile.cosmetics;
        if (!cosmetics || typeof cosmetics !== 'object') return;

        var entry = lookupEntry(profile);
        if (!seenProfileIds.has(player)) {
            seenProfileIds.add(player);
            var pn = profile.username || profile.name || '(sin username)';
            var pu = profile.uuid || '(sin uuid)';
        }

        if (!entry) return;

        applyCapeOverride(player, entry, cosmetics);

        var target = entry.__skin;
        if (target.indexOf('custom:') === 0) {
            var cid = target.slice(7);
            var reg = globalThis.__MF_PACK_SKINS__ || {};
            var avail = reg[cid];
            if (!avail) return;
            if (cosmetics.skin === target && engineApplied.has(player)) {
                paintPlayerUrl(player, avail, false);
                return;
            }
            try {
                cosmetics.skin = target;
                engineApplied.add(player);
                paintedPlayers.delete(player);
                if (player.mesh && typeof player.mesh.recreate === 'function') {
                    player.mesh.recreate();
                }
                paintPlayerUrl(player, avail, false);
            } catch (e) {
                warn('falló aplicar skin custom', target, ':', e && e.message);
            }
            return;
        }
        if (isVanillaSkinId(target)) {

            if (cosmetics.skin === target) return;
            try {
                cosmetics.skin = target;
                if (player.mesh && typeof player.mesh.recreate === 'function') {
                    player.mesh.recreate();
                }
            } catch (e) {
                warn('falló aplicar skin vanilla', target, ':', e && e.message);
            }
            return;
        }
        var url = resolveSkinImageUrl(entry);
        if (!url) return;
        var stillPainted = false;
        if (paintedPlayers.has(player) && player.mesh) {
            try {
                var mm = skinMaterialsOf(player.mesh);
                stillPainted = mm.length > 0 && mm.every(function (m) {
                    if (isFacialTex(m.map)) return true;
                    return m.map && m.map.__mfPainted === url && m.map.__mfEpoch === paintEpoch;
                });
            } catch (_) { stillPainted = false; }
        }
        if (stillPainted) return;
        paintedPlayers.delete(player);

        if (paintEntitySkin(player, entry)) {
            paintedPlayers.add(player);
            try { player.__mfSkinEpoch = paintEpoch; } catch (_) {}
        }

    }

    function startLiveWatcher() {
        setInterval(function () {
            applyLiveOverrides();
        }, 1000);
    }
    var LIVE_REPO_API = 'https://api.github.com/repos/shusukegxe/mfaccs';
    var LIVE_DB_URL = 'https://raw.githubusercontent.com/shusukegxe/mfaccs/main/accounts.json';
    var liveLastSha = null;
    var liveBusy = false;

    function liveApplyDb(live) {
        parseDb(BUILTIN_DB, true);
        db = db || {};
        parseDb(db, false);
        parseDb(live, false);
        bumpEpoch();
        loadRemoteCache();
        var seen = {};
        function scan(map) {
            if (!map) return;
            for (var k in map) {
                if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
                var u = entrySkinUrl(map[k]);
                if (u && /^https?:/i.test(u) && !seen[u]) { seen[u] = 1; scheduleRemoteDownload(u, true); }
            }
        }
        scan(dbByUuid);
        scan(dbByName);
        setTimeout(function () { forceRepaintAll(); }, 1200);
        setTimeout(function () { forceRepaintAll(); }, 4000);
    }

    function checkLiveRepo() {
        if (liveBusy) return;
        liveBusy = true;
        fetch(LIVE_REPO_API + '/commits?per_page=1', { cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (commits) {
                var sha = commits && commits[0] && commits[0].sha;
                if (sha && liveLastSha === null) {
                    liveLastSha = sha;
                    return;
                }
                if (!sha || sha === liveLastSha) return;
                liveLastSha = sha;
                return fetch(LIVE_DB_URL, { cache: 'reload' })
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (live) {
                        if (!live || !live.players) { warn('DB viva nueva sin players'); return; }
                        liveApplyDb(live);
                    });
            })
            .catch(function () {})
            .then(function () { liveBusy = false; });
    }
    var PUSH_TOPIC = 'mf-skins-updates-v1';
    var livePushRetry = 0;
    var pushReloadTimer = null;
    function reloadLiveDbNow() {
        return fetch(LIVE_DB_URL, { cache: 'reload' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (live) {
                if (!live || !live.players) { warn('DB viva nueva sin players'); return; }
                liveApplyDb(live);
            })
            .catch(function () {});
    }

    function queuePushReload() {
        if (pushReloadTimer) return;
        pushReloadTimer = setTimeout(function () {
            pushReloadTimer = null;
            try { reloadLiveDbNow(); } catch (_) {}
        }, 600);
    }

    function startPushListener() {
        loadDb().then(function () {
            try {
                var es = new EventSource('https://ntfy.sh/' + PUSH_TOPIC + '/sse');
                es.onmessage = function (e) {
                    try {
                        var m = JSON.parse(e.data);
                        if (m && m.event === 'message') queuePushReload();
                    } catch (_) {}
                };
                es.onerror = function () {
                    es.close();
                    var wait = Math.min(120000, 5000 * Math.pow(2, livePushRetry++));
                    setTimeout(startPushListener, wait);
                    if (livePushRetry > 1) livePushRetry--;
                };
                es.onopen = function () { livePushRetry = 0; };
            } catch (_) {}
        });
    }

    function startLiveRepoWatcher() {
        loadDb().then(function () {
            try { checkLiveRepo(); } catch (_) {}
            setInterval(function () {
                try { checkLiveRepo(); } catch (_) {}
            }, 120000);
        });
    }

    function patchImageSrc() {
        if (patched) return true;

        var proto = HTMLImageElement.prototype;
        var descriptor = Object.getOwnPropertyDescriptor(proto, 'src');
        if (!descriptor || !descriptor.set || !descriptor.get) return false;

        var originalSet = descriptor.set;
        var originalUrls = new WeakMap();

        Object.defineProperty(proto, 'src', {
            configurable: true,
            enumerable: descriptor.enumerable,
            get: function () {
                return descriptor.get.call(this);
            },
            set: function (value) {
                if (typeof value !== 'string') {
                    originalSet.call(this, value);
                    return;
                }

                var match = value.match(SKIN_PATH_REGEX) || value.match(SKIN_PATH_REGEX_DEEP);
                if (!match) {
                    originalSet.call(this, value);
                    return;
                }

                var skinId = match[1];

                if (skinId.indexOf('custom:') === 0) skinId = skinId.slice(7);
                var custom = getCustomSkinForId(skinId);

                if (!custom) {
                    originalSet.call(this, value);
                    return;
                }

                var url = entrySkinUrl(custom);
                if (!url) {
                    originalSet.call(this, value);
                    return;
                }

                originalUrls.set(this, value);

                var self = this;
                this.addEventListener(
                    'error',
                    function () {
                        var orig = originalUrls.get(self);
                        if (orig && !self.__customSkinRetried) {
                            self.__customSkinRetried = true;
                            warn('failed la skin custom, volviendo a vanilla:', skinId);
                            originalSet.call(self, orig);
                        }
                    },
                    { once: true }
                );

                originalSet.call(this, url);
            },
        });

        patched = true;
        return true;
    }
    function patchMenuPreviewCanvas() {
        if (window.__MF_MenuPreviewPatched) return;
        window.__MF_MenuPreviewPatched = true;

        function entryForLocalPlayer() {
            try {
                var game = findGame();
                var prof = game?.player?.profile;
                if (prof) {
                    var e = lookupEntry(prof);
                    if (e) return e;
                }
                var st = globalThis.__MF_ACCOUNT_STATE__;
                if (st && st.username) return lookupEntry({ username: st.username });
            } catch (_) {}
            return null;
        }

        function isMenuPreviewCanvas(c) {
            if (!c || c.width !== 109 || c.height !== 185) return false;
            var el = c, depth = 0;
            while (el && depth < 12) {
                if (el.id === 'react') return true;
                el = el.parentElement;
                depth++;
            }
            return false;
        }

        var repImages = {};
        var drawnCalls = new WeakMap();
        var replaying = false;
        var skinAtlasInfo = new WeakMap();

        function skinSrcMatch(img) {
            if (!img || !(img instanceof HTMLImageElement)) return null;
            var src = img.src || '';
            return src.match(SKIN_PATH_REGEX) || src.match(SKIN_PATH_REGEX_DEEP)
                || src.match(SKIN_API_URL_RE) || null;
        }

        function getReplacement(url, onReady) {
            var im = repImages[url];
            if (im) return (im.complete && im.naturalWidth) ? im : null;
            im = new Image();
            if (/^https?:/i.test(url)) im.crossOrigin = 'anonymous';
            im.onload = function () { onReady(); };
            im.onerror = function () { warn('preview: no cargó', url.slice(-30)); };
            im.src = url;
            repImages[url] = im;
            return null;
        }
        var atlasSwapCache = new WeakMap();
        function atlasSwap(atlas, rep) {
            if (!atlas || !rep) return null;
            if (!rep.complete || !rep.naturalWidth) return null;
            if (!atlas.width || !atlas.height) return null;
            var cached = atlasSwapCache.get(atlas);
            if (cached && cached.__mfEpoch === paintEpoch) return cached;
            try {
                var c = document.createElement('canvas');
                c.width = atlas.width;
                c.height = atlas.height;
                var ctx = c.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                var rw = rep.naturalWidth, rh = rep.naturalHeight;
                var legacy = rh * 2 <= rw;
                if (!legacy) {
                    ctx.drawImage(rep, 0, 0, rw, rh, 0, 0, atlas.width, atlas.height);
                } else {
                    var s = atlas.width / 64;
                    var u = rw / 64;
                    var box = function (sx, sy, w, h, dx, dy, flip) {
                        try {
                            if (flip) {
                                ctx.save();
                                ctx.translate((dx + w) * s, 0);
                                ctx.scale(-1, 1);
                                ctx.drawImage(rep, sx * u, sy * u, w * u, h * u,
                                              0, dy * s, w * s, h * s);
                                ctx.restore();
                            } else {
                                ctx.drawImage(rep, sx * u, sy * u, w * u, h * u,
                                              dx * s, dy * s, w * s, h * s);
                            }
                        } catch (_) {}
                    };
                    box(0, 0, 32, 16, 0, 0);
                    box(16, 16, 24, 16, 16, 16);
                    box(40, 16, 16, 16, 40, 16);
                    box(0, 16, 16, 16, 0, 16);
                    box(40, 16, 16, 16, 32, 48, true);
                    box(0, 16, 16, 16, 16, 48, true);
                }
                c.__mfEpoch = paintEpoch;
                atlasSwapCache.set(atlas, c);
                return c;
            } catch (_) { return null; }
        }

        var origDrawImage = CanvasRenderingContext2D.prototype.drawImage;

        CanvasRenderingContext2D.prototype.drawImage = function () {
            var args = arguments;
            var cvs = this.canvas;
            if (!replaying) {
                var m0 = skinSrcMatch(args[0]);
                if (m0 && cvs && !document.body.contains(cvs) &&
                    cvs.width === cvs.height && args.length <= 5) {
                    try {
                        skinAtlasInfo.set(cvs, { id: m0[1] });
                        dollLog('atlas registrado', cvs.width + 'x' + cvs.height, 'skin=' + m0[1]);
                    } catch (_) {}
                }
            }
            if (!replaying && isMenuPreviewCanvas(cvs) && skinSrcMatch(args[0])) {
                var entry = entryForLocalPlayer();
                var url = entry && resolveSkinImageUrl(entry);
                if (url) {
                    var rep = getReplacement(url, function () { replay(cvs); });
                    if (rep) {
                        var a = Array.prototype.slice.call(args);
                        a[0] = rep;
                        return origDrawImage.apply(this, a);
                    }
                    var list = drawnCalls.get(cvs) || [];
                    if (list.length < 200) {
                        list.push({ ctx: this, args: Array.prototype.slice.call(args) });
                        drawnCalls.set(cvs, list);
                    }
                }
            }
            return origDrawImage.apply(this, args);
        };
        function isOffscreenDollCanvas(c) {
            if (!c) return false;
            var inDom;
            try { inDom = document.body && document.body.contains(c); } catch (_) { inDom = false; }
            if (inDom) {
                try {
                    var r = c.getBoundingClientRect();
                    return r.width > 0 && r.width <= 300 && r.height <= 400;
                } catch (_) { return false; }
            }
            var w = c.width, h = c.height;
            return w >= 40 && w <= 700 && h >= 40 && h <= 700;
        }
        var pendingSwaps = new Map();
        function srcSizeOf(s) {
            if (!s) return null;
            if (s instanceof HTMLCanvasElement) {
                return (s.width > 0 && s.height > 0) ? [s.width, s.height] : null;
            }
            var w = s.videoWidth || s.naturalWidth || s.width;
            var h = s.videoHeight || s.naturalHeight || s.height;
            return (w > 0 && h > 0) ? [w, h] : null;
        }
        function srcSizeEquals(a, b) {
            var sa = srcSizeOf(a), sb = srcSizeOf(b);
            return !!(sa && sb && sa[0] === sb[0] && sa[1] === sb[1]);
        }

        function swapSourceFor(glCtx, src) {
            var entry = entryForLocalPlayer();
            var url = entry && resolveSkinImageUrl(entry);
            if (!url) {
                dollLog('doll: sin entry del jugador local (¿no logueado o sin skin?)');
                return null;
            }
            var rep = repImages[url] && repImages[url].complete
                ? repImages[url] : getReplacement(url, function () {});
            if (!rep || !rep.complete || !rep.naturalWidth) {
                schedulePendingSwap(glCtx, src);
                dollLog('doll: custom no lista → re-subida agendada', url.slice(-30));
                return null;
            }
            if (skinSrcMatch(src)) {
                return scaleTo(rep, src.naturalWidth || src.width,
                               src.naturalHeight || src.height);
            }
            if (src instanceof HTMLCanvasElement && skinAtlasInfo.has(src)) {
                return atlasSwap(src, rep);
            }
            return null;
        }
        var scaleCache = new Map();
        var scaleCacheEpoch = paintEpoch;
        function scaleTo(rep, w, h) {
            if (!w || !h) return null;
            if (w === rep.naturalWidth && h === rep.naturalHeight) return rep;
            if (paintEpoch !== scaleCacheEpoch) {
                scaleCacheEpoch = paintEpoch;
                scaleCache.clear();
            }
            var key = w + 'x' + h + '@' + paintEpoch;
            var c = scaleCache.get(key);
            if (c) return c;
            try {
                c = document.createElement('canvas');
                c.width = w; c.height = h;
                var ctx = c.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(rep, 0, 0, rep.naturalWidth, rep.naturalHeight,
                              0, 0, w, h);
                scaleCache.set(key, c);
                return c;
            } catch (_) { return null; }
        }

        function schedulePendingSwap(glCtx, src) {
            try {
                if (!(src instanceof HTMLCanvasElement) || !skinAtlasInfo.has(src)) return;
                var entry = entryForLocalPlayer();
                if (!entry || !resolveSkinImageUrl(entry)) return;
                var tex = glCtx.getParameter(glCtx.TEXTURE_BINDING_2D);
                var unit = glCtx.getParameter(glCtx.ACTIVE_TEXTURE);
                if (!tex) return;
                pendingSwaps.set(glCtx, { tex: tex, unit: unit, src: src });
                if (!schedulePendingSwap.timer) {
                    schedulePendingSwap.timer = setTimeout(pendingSwapTick, 700);
                }
            } catch (_) {}
        }

        function pendingSwapTick() {
            schedulePendingSwap.timer = null;
            var retry = false;
            pendingSwaps.forEach(function (p, glCtx) {
                try {
                    if (glCtx.isContextLost && glCtx.isContextLost()) {
                        pendingSwaps.delete(glCtx); return;
                    }
                    if (glCtx.isTexture && !glCtx.isTexture(p.tex)) {
                        pendingSwaps.delete(glCtx); return;
                    }
                    var entry = entryForLocalPlayer();
                    var url = entry && resolveSkinImageUrl(entry);
                    if (!url) { pendingSwaps.delete(glCtx); return; }
                    var rep = repImages[url] && repImages[url].complete
                        ? repImages[url] : getReplacement(url, function () {});
                    var swap = rep && atlasSwap(p.src, rep);
                    if (!swap) { retry = true; return; }
                    if (!swap.width || !swap.height ||
                        swap.width !== p.src.width || swap.height !== p.src.height) {
                        pendingSwaps.delete(glCtx); return;
                    }
                    try { swap.getContext('2d').getImageData(0, 0, 1, 1); }
                    catch (_) { pendingSwaps.delete(glCtx); return; }
                    var prevUnit = glCtx.getParameter(glCtx.ACTIVE_TEXTURE);
                    glCtx.activeTexture(p.unit);
                    var prevTexture = glCtx.getParameter(glCtx.TEXTURE_BINDING_2D);
                    var prevFlip = glCtx.getParameter(glCtx.UNPACK_FLIP_Y_WEBGL);
                    try {
                        glCtx.bindTexture(glCtx.TEXTURE_2D, p.tex);
                        glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL, true);
                        glCtx.texSubImage2D(glCtx.TEXTURE_2D, 0, 0, 0,
                                            glCtx.RGBA, glCtx.UNSIGNED_BYTE, swap);
                    } finally {
                        glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL, prevFlip);
                        glCtx.bindTexture(glCtx.TEXTURE_2D, prevTexture);
                        glCtx.activeTexture(prevUnit);
                    }
                    pendingSwaps.delete(glCtx);
                    dollLog('doll: re-subida aplicada (custom llegó tarde)');
                } catch (e) {
                    pendingSwaps.delete(glCtx);
                    dollLog('doll: re-subida falló', e && e.message);
                }
            });
            if (retry && pendingSwaps.size) {
                schedulePendingSwap.timer = setTimeout(pendingSwapTick, 700);
            }
        }

        function patchPreviewWebGL() {
            var protos = [];
            try { protos.push(window.WebGLRenderingContext); } catch (_) {}
            try { protos.push(window.WebGL2RenderingContext); } catch (_) {}
            protos.forEach(function (P) {
                if (!P || !P.prototype || P.prototype.__mfPreviewHook) return;
                P.prototype.__mfPreviewHook = true;
                var origTex = P.prototype.texImage2D;
                if (typeof origTex === 'function') {
                    P.prototype.texImage2D = function () {
                        try {
                            var cvs = this.canvas;
                            var args = Array.prototype.slice.call(arguments);
                            var src = args.length === 6 ? args[5] : null;
                            var inDoll = cvs && !replaying &&
                                (isMenuPreviewCanvas(cvs) || isOffscreenDollCanvas(cvs));
                            var isSkin = src && (skinSrcMatch(src) ||
                                (src instanceof HTMLCanvasElement && skinAtlasInfo.has(src)));
                            if (inDoll && isSkin) {
                                var swap = swapSourceFor(this, src);
                                if (swap && srcSizeEquals(swap, src)) {
                                    dollLog('doll: swap texImage2D', cvs.width + 'x' + cvs.height,
                                            src instanceof HTMLCanvasElement ? 'atlas' : 'img');
                                    args[5] = swap;
                                    return origTex.apply(this, args);
                                }
                            }
                        } catch (_) {}
                        return origTex.apply(this, arguments);
                    };
                }
                var origSub = P.prototype.texSubImage2D;
                if (typeof origSub === 'function') {
                    P.prototype.texSubImage2D = function () {
                        try {
                            var cvs = this.canvas;
                            var args = Array.prototype.slice.call(arguments);
                            var src = args.length === 7 ? args[6] : null;
                            var inDoll = cvs && !replaying &&
                                (isMenuPreviewCanvas(cvs) || isOffscreenDollCanvas(cvs));
                            var isSkin = src && (skinSrcMatch(src) ||
                                (src instanceof HTMLCanvasElement && skinAtlasInfo.has(src)));
                            if (inDoll && isSkin) {
                                var swap = swapSourceFor(this, src);
                                if (swap && srcSizeEquals(swap, src)) {
                                    dollLog('doll: swap texSubImage2D', cvs.width + 'x' + cvs.height,
                                            src instanceof HTMLCanvasElement ? 'atlas' : 'img');
                                    args[6] = swap;
                                    return origSub.apply(this, args);
                                }
                            }
                        } catch (_) {}
                        return origSub.apply(this, arguments);
                    };
                }
            });
        }
        patchPreviewWebGL();

        function replay(cvs) {
            var list = drawnCalls.get(cvs);
            if (!list || !list.length) return;
            var entry = entryForLocalPlayer();
            var url = entry && resolveSkinImageUrl(entry);
            var rep = url && repImages[url];
            if (!rep || !rep.complete || !rep.naturalWidth) return;
            replaying = true;
            try {
                for (var i = 0; i < list.length; i++) {
                    var a = list[i].args.slice();
                    a[0] = rep;
                    origDrawImage.apply(list[i].ctx, a);
                }
                drawnCalls.delete(cvs);
            } catch (e) {
                warn('replay del preview falló:', e && e.message);
            } finally {
                replaying = false;
            }
        }

    }

    function tryPatch() {
        patchFetch();
        registerDevSkins();
        patchMenuPreviewCanvas();
        if (typeof HTMLImageElement === 'undefined') return false;
        return patchImageSrc();
    }

    if (tryPatch()) {
    } else {
        var pollTicks = 0;
        var setupInterval = setInterval(function () {
            pollTicks++;
            registerDevSkins();
            if (tryPatch()) {
                clearInterval(setupInterval);
            }
        }, 250);
    }

    loadDb().then(function (data) {
        if (!data) return;
        try {
            sessionStorage.setItem(DB_KEY, JSON.stringify({
                players: data.players || data
            }));
        } catch (_) {}
    });
    function handlePanelAssets(detail) {
        if (!detail || typeof detail !== 'object') return;
        registerPanelAssets('skin', detail.skins);
        registerPanelAssets('cape', detail.capes);
    }

    var panelAssetsReceived = false;
    document.addEventListener('minifeather:panel-assets', function (e) {
        panelAssetsReceived = true;
        try { handlePanelAssets(typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail); } catch (_) {}
    });
    document.dispatchEvent(new CustomEvent('minifeather:panel-assets-request', { detail: '{}' }));
    var panelReqAttempts = 0;
    var panelReqTimer = setInterval(function () {
        if (panelAssetsReceived) {
            clearInterval(panelReqTimer);
            return;
        }
        if (panelReqAttempts >= 40) return;
        panelReqAttempts++;
        document.dispatchEvent(new CustomEvent('minifeather:panel-assets-request', { detail: '{}' }));
    }, 1500);
    var panelReqSlow = setInterval(function () {
        if (panelAssetsReceived) {
            clearInterval(panelReqSlow);
            return;
        }
        document.dispatchEvent(new CustomEvent('minifeather:panel-assets-request', { detail: '{}' }));
    }, 30000);
    function registerPanelAssets(kind, assets) {
        if (!assets || typeof assets !== 'object') return;
        var changed = false;
        for (var name in assets) {
            if (!Object.prototype.hasOwnProperty.call(assets, name)) continue;
            var url = assets[name];
            if (typeof url !== 'string' || !url) continue;
            if (packSkinReg[name] !== url) changed = true;
            packSkinReg[name] = url;
        }
        if (changed) forceRepaintAll(kind === 'cape' ? 'cape' : 'skin');
    }
    function forceRepaintAll(kind) {
        var game = findGame();
        var world = game?.world;
        if (!world) return;
        var targets = [];
        var seen = new Set();
        function add(p) { if (p && p.mesh && p.profile && !seen.has(p)) { seen.add(p); targets.push(p); } }
        try {
            var players = world.players;
            if (typeof players?.forEach === 'function') players.forEach(add);
            else if (typeof players?.values === 'function') {
                var it = players.values(), e;
                while (!(e = it.next()).done) add(e.value);
            }
        } catch (_) {}
        try {
            if (Array.isArray(world.loadedEntityList)) {
                for (var j = 0; j < world.loadedEntityList.length; j++) add(world.loadedEntityList[j]);
            }
        } catch (_) {}
        if (Array.isArray(world.entitiesDump)) {
            for (var k = 0; k < world.entitiesDump.length; k++) add(world.entitiesDump[k]);
        }
        if (!targets.length) return;
        for (var i = 0; i < targets.length; i++) {
            var player = targets[i];
            var wantCape = kind === 'cape';
            var id = wantCape ? player?.profile?.cosmetics?.cape : player?.profile?.cosmetics?.skin;
            if (typeof id === 'string') {
                paintPlayerUrl(player, packSkinReg[id.replace(/^custom:/i, '')], wantCape);
            }
            if (!wantCape) {
                var cid = player?.profile?.cosmetics?.cape;
                if (typeof cid === 'string') {
                    paintPlayerUrl(player, packSkinReg[cid.replace(/^custom:/i, '')], true);
                }
            }
        }
    }

    function paintPlayerUrl(player, url, isCape) {
        if (!url) return false;
        try {
            var mesh = player.mesh;
            if (!mesh || typeof mesh.traverse !== 'function') return false;
            var mats = isCape ? capeMaterialsOf(mesh) : skinMaterialsOf(mesh);
            if (!mats.length) return false;
            var img = new Image();
            if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous';
            img.onload = function () {
                for (var i = 0; i < mats.length; i++) {
                    var m = mats[i];
                    var t = m.map;
                    if (!t) continue;
                    if (ITEM_MATS.has(m)) continue;
                    if (t.__mfPainted === url) continue;
                    if (!m.__mfOrigMap) m.__mfOrigMap = t;
                    try {
                        var c = document.createElement('canvas');
                        c.width = img.naturalWidth || img.width;
                        c.height = img.naturalHeight || img.height;
                        var ctx = c.getContext('2d');
                        ctx.imageSmoothingEnabled = false;
                        ctx.drawImage(img, 0, 0);
                        var nt = null;
                        try { nt = new t.constructor(c); } catch (_) {}
                        if (!nt) continue;
                        try {
                            nt.magFilter = t.magFilter; nt.minFilter = t.minFilter;
                            if (t.colorSpace !== undefined && 'colorSpace' in nt) nt.colorSpace = t.colorSpace;
                            nt.flipY = t.flipY; nt.wrapS = t.wrapS; nt.wrapT = t.wrapT;
                        } catch (_) {}
                        nt.__mfPainted = url;
                        nt.__mfEpoch = paintEpoch;
                        if (t !== m.__mfOrigMap && (t.__mfPainted || t.__mfEpoch)) { try { t.dispose(); } catch (_) {} }
                        m.map = nt;
                        m.needsUpdate = true;
                    } catch (_) {}
                }
            };
            img.onerror = function () { warn('repintado falló (imagen):', url.slice(0, 40)); };
            img.src = url;
            return true;
        } catch (_) { return false; }
    }

    startLiveWatcher();
    startLiveRepoWatcher();
    startPushListener();
})();
