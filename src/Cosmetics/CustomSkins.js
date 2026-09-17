(function () {
    'use strict';
    if (window.__MF_CustomSkins) return;
    window.__MF_CustomSkins = true;

    var TAG = "[MiniFeather Skins]";
    // Logs de diagnóstico ON por defecto; apagar con localStorage mf_skins_verbose=0
    var VERBOSE;
    try {
        VERBOSE = localStorage.getItem('mf_skins_verbose') !== '0';
    } catch (_) { VERBOSE = true; }

    function log() {
        if (!VERBOSE) return;
        var args = [TAG].concat(Array.prototype.slice.call(arguments));
        console.log.apply(console, args);
    }

    function warn() {
        var args = [TAG].concat(Array.prototype.slice.call(arguments));
        console.warn.apply(console, args);
    }

    log("starting (profile patch mode)");

    function skinsBaseUrl() {
        var meta = document.querySelector('meta[name="mf-skins-base"]');
        return meta && meta.content ? meta.content : null;
    }

    var packSkinReg = (globalThis.__MF_PACK_SKINS__ ||= {});
    var CUSTOM_URL_RE = /(?:^|\/)auth-api\/skins\/custom\/([^\/?#]+)\.png(?:[?#]|$)/;
    var MF_DEV_SKINS = ['eve', 'gab', 'itzesteban', 'nightrise', 'notsenpai'];

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
                            var k2 = reg[m2[2]] ? m2[2]
                                : (m2[1] === 'skins' && m2[2].replace(/^custom:/i, '')) || m2[2];
                            if (reg[k2]) { origSet.call(this, reg[k2]); return; }
                        }
                    }
                }
                origSet.call(this, v);
            }
        });
        globalThis.__MF_PACK_IMG_HOOK__ = true;
    }

    // Resuelve una URL pedida por el engine (auth-api/skins/custom/<id>.png o
    // textures/entity/skins/<id>.png) a una textura local cuando exista.
    // Busca en __MF_PACK_SKINS__ (data: URLs del panel + packs) y, si la entrada
    // de la DB apunta a una URL remota, usa la caché persistente dataURL.
    function resolveCustomTextureUrl(url) {
        if (!url || typeof url !== 'string') return null;
        var m = url.match(CUSTOM_URL_RE);
        if (!m) {
            var m2 = url.match(/(?:^|\/)textures\/entity\/skins\/([^\/?#]+)\.png(?:[?#]|$)/);
            if (!m2) return null;
            m = m2;
        }
        var skinId = m[1].replace(/^custom:/i, '');

        var reg = globalThis.__MF_PACK_SKINS__;
        if (reg && reg[skinId]) return reg[skinId];

        // Entrada de la DB con skin remota: servir desde la caché dataURL
        var entry = getCustomSkinForId(skinId);
        if (entry) {
            var u = resolveSkinImageUrl(entry);
            if (u && /^data:/i.test(u)) return u;
        }
        return null;
    }

    var devSkinsRegistered = false;
    function registerDevSkins() {
        if (devSkinsRegistered) return;
        var base = skinsBaseUrl();
        if (!base) return;
        
        base = String(base).replace(/\/*$/, '/');
        for (var i = 0; i < MF_DEV_SKINS.length; i++) {
            var n = MF_DEV_SKINS[i];
            packSkinReg['mf_dev_' + n] = base + 'devs/' + n + '.png';
        }
        
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
        installCustomUrlHook();
        log('ids custom listos (devs + mypacks)');
    }

    var DB_KEY = 'minifeather:custom-skins-db';

    var BUILTIN_DB = {
        players: {
            
            '6eb7369a-551e-406a-9a63-6db7a358e1e5': { skin: 'custom:mf_estebangxe' }, 
            'c4201f43-2de9-4275-930a-301fae4cce6c': { skin: 'custom:mf_angrywolfx' }, 
            
            'itzesteban': { skin: 'custom:mf_dev_itzesteban' },
            'nightrise': { skin: 'custom:mf_dev_nightrise' },
            'notsenpai': { skin: 'custom:mf_dev_notsenpai' },
            'gab': { skin: 'custom:mf_dev_gab' },
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
        // URLs absolutas (http/https/data) se guardan tal cual; se limpian backticks de más
        if (/^`?(https?:|data:image)/i.test(v)) return v.replace(/^`+|`+$/g, '');
        v = v.replace(/^\/+/, '');
        var m = v.match(/^skins\/(.+)$/i);
        if (m) v = m[1];
        return v.replace(/\.png$/i, '');
    }

    function isVanillaSkinId(id) {

        return typeof id === 'string' && id && /^[a-z0-9_]+$/i.test(id) && id.indexOf('/') === -1;
    }

    function entrySkinUrl(entry) {
        if (!entry || !entry.__skin) return null;
        var s = String(entry.__skin);

        if (s.indexOf('custom:') === 0) return null;
        if (/^(https?:|data:image)/i.test(s)) return s;
        if (isVanillaSkinId(s)) return null;
        var base = skinsBaseUrl();
        if (!base) return null;
        return base + s + '.png';
    }

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
            if (!skin) continue;
            var entry = { __skin: skin };
            if (typeof raw.rank === 'string' && raw.rank) entry.rank = raw.rank;
            var uuidKey = String(key).toLowerCase();
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuidKey)) {
                dbByUuid[uuidKey] = entry;
            } else {
                dbByName[uuidKey] = entry;
            }
        }
    }

    function loadDb() {
        if (db !== null) return Promise.resolve(db);
        if (dbLoading) return dbLoading;

        var finish = function (data) {

            parseDb(BUILTIN_DB, true);
            parseDb(data, false);
            db = data || {};
            dbLoading = null;
            // DB viva: la del repo de GitHub se aplica ENCIMA de la local,
            // así editarla ahí actualiza el client sin publicar extensión.
            fetch('https://raw.githubusercontent.com/EstebanGrp/mfaccs/main/accounts.json', { cache: 'no-store' })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (live) {
                    if (!live || !live.players) return;
                    parseDb(live, false);
                    log('DB viva aplicada (' + Object.keys(live.players).length + ' entradas)');
                    try { prefetchRemoteSkins(); } catch (_) {}
                })
                .catch(function () {});
            var n = Object.keys(dbByUuid).length + Object.keys(dbByName).length;
            log('DB lista (' + n + ' overrides)');
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
            // En MAIN world no existe chrome.runtime: se llega a accounts.json
            // vía el meta mf-skins-base que inyecta SplashScreen (ISOLATED).
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
            log('skin override', profile.uuid, '->', entry.__skin);
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

            // Servir texturas custom:mf_* localmente — el server responde 404 para
            // ids que no conoce y el engine regenera materiales vanilla en bucle.
            if (reqUrl && typeof reqUrl === 'string') {
                var localSkin = resolveCustomTextureUrl(reqUrl);
                if (localSkin) {
                    log('[fetch] textura custom servida local:', reqUrl.slice(-44));
                    // fetch() recursivo seguro: la URL local (chrome-extension:/data:)
                    // no matchea CUSTOM_URL_RE ni isProfileResponse → pasa directo.
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

    // Aceptan ruta relativa, con slash inicial o URL completa (el preview del
    // menú carga la skin con URL absoluta y el anclaje anterior no la veía).
    var SKIN_PATH_REGEX = /^(?:[a-z][a-z0-9+.-]*:\/\/[^\/]+)?\/?textures\/entity\/skins\/([^\/?#]+)\.png(?:[?#].*)?$/i;

    var SKIN_PATH_REGEX_DEEP = /^(?:[a-z][a-z0-9+.-]*:\/\/[^\/]+)?\/?textures\/entity\/skins\/(.+?)\.png(?:[?#].*)?$/i;
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
    function findGame() {
        try {
            if (window.miniblox?.player) return window.miniblox;
            var react = document.querySelector('#react');
            if (react) {
                for (var key in react) {
                    var game = react[key]?.updateQueue?.baseState?.element?.props?.game;
                    if (game?.player) return game;
                }
            }
        } catch (e) {}
        return null;
    }

    var lastLiveScan = 0;

    function applyLiveOverrides() {
        registerDevSkins(); 
        if (dbByUuid === null && dbByName === null) return;

        var game = findGame();
        var world = game?.world;
        if (!world || !world.players) return;

        try {
            // El jugador local no siempre está en world.players — incluirlo explícito
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
    }

    // Época actual de pintado (ver bumpEpoch): fuerza repintados cuando el
    // repo actualiza un PNG aunque la URL sea la misma.

    var paintedPlayers = new WeakSet();

    // Época de pintado: bump al invalidar caches → los materiales pintados con
    // una época vieja se repintan aunque la URL sea la misma (PNG reemplazado).
    var paintEpoch = 1;
    globalThis.__MF_SKIN_EPOCH__ = paintEpoch;
    function bumpEpoch() { paintEpoch++; globalThis.__MF_SKIN_EPOCH__ = paintEpoch; }

    // Caché persistente de skins remotas: se descargan solas al primer uso y
    // de ahí en adelante se pintan desde dataURLs locales (sin red ni CORS).
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
            // quota: tira la mitad más vieja y reintenta una vez
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
                if (typeof dataUrl === 'string' && dataUrl.indexOf('data:image') === 0) {
                    var had = !!remoteCache[url];
                    remoteCache[url] = dataUrl;
                    saveRemoteCache();
                    // Imagen re-descargada (repo actualizado): nueva época para
                    // que el watcher en vivo repinte con el contenido fresco.
                    if (had) bumpEpoch();
                    log('skin remota cacheada:', url.slice(-28));
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
        // Si ya no se puede cachear (3 fallos), usa la URL directa como antes
        if ((remoteFailed[url] || 0) >= 3) return url;
        // Aún descargando: null fuerza al watcher a reintentar en su próximo tick
        return null;
    }

    function prefetchRemoteSkins() {
        loadRemoteCache();
        var seen = {};
        function scan(map) {
            if (!map) return;
            for (var k in map) {
                if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
                var u = entrySkinUrl(map[k]);
                if (u && /^https?:/i.test(u) && !seen[u]) { seen[u] = 1; scheduleRemoteDownload(u); }
            }
        }
        scan(dbByUuid);
        scan(dbByName);
    }

    function resolveSkinImageUrl(entry) {
        if (!entry || !entry.__skin) return null;
        var s = String(entry.__skin);

        if (s.indexOf('custom:') === 0) {
            var reg = globalThis.__MF_PACK_SKINS__ || {};
            return reg[s.slice(7)] || null;
        }
        var url = entrySkinUrl(entry);
        if (url && /^https?:/i.test(url) && url.indexOf(location.origin) !== 0) {
            loadRemoteCache();
            return cachedRemoteOrKick(url);
        }
        return url;
    }

    function skinMaterialsOf(mesh) {
        var out = [], seen = new Set();
        try {
            mesh.traverse(function (o) {
                if (!o || !o.material) return;
                var list = Array.isArray(o.material) ? o.material : [o.material];
                for (var i = 0; i < list.length; i++) {
                    var m = list[i];
                    if (m && m.map && !seen.has(m)) { seen.add(m); out.push(m); }
                }
            });
        } catch (_) {}
        
        var skins = out.filter(function (m) {
            var w = m.map?.image?.width, h = m.map?.image?.height;
            if (!w || !h) return false;
            var k64 = w / 64;
            return Number.isInteger(k64) && (h === w || h === w / 2);
        });
        return skins.length ? skins : out;
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
                        mats[i].map = nt;
                        mats[i].needsUpdate = true;
                        done++;
                    } catch (e) {
                        warn('repintado falló en material', i, 'de', pendingName, ':', e && e.message);
                    }
                }
                if (done > 0) {
                    log('✔ skin aplicada:', pendingName, '—', done + '/' + mats.length + ' materiales,', img.naturalWidth + 'x' + img.naturalHeight, url.indexOf('data:') === 0 ? '(cache)' : url.slice(-30));
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

    function overridePlayer(player) {
        if (!player || !player.profile) return;
        var profile = player.profile;
        var cosmetics = profile.cosmetics;
        if (!cosmetics || typeof cosmetics !== 'object') return;

        var entry = lookupEntry(profile);

        // Diagnóstico único por jugador: username/uuid detectados y si matcheó
        if (!seenProfileIds.has(player)) {
            seenProfileIds.add(player);
            var pn = profile.username || profile.name || '(sin username)';
            var pu = profile.uuid || '(sin uuid)';
            log('jugador detectado:', pn, '| uuid:', pu, entry ? '→ MATCH en DB' : '(sin override en DB)');
        }

        if (!entry) return;

        var target = entry.__skin;

        // 1) custom:<id> con textura local disponible → vía engine-nativa:
        //    setear cosmetics.skin y recrear; el hook de fetch/Image sirve la
        //    textura local, el engine la conserva y no hay guerra de repintados.
        if (target.indexOf('custom:') === 0) {
            var cid = target.slice(7);
            var reg = globalThis.__MF_PACK_SKINS__ || {};
            var avail = reg[cid];
            if (!avail) return; // sin textura local: el server daría 404, no insistir
            if (cosmetics.skin === target && engineApplied.has(player)) return;
            try {
                cosmetics.skin = target;
                engineApplied.add(player);
                paintedPlayers.delete(player);
                if (player.mesh && typeof player.mesh.recreate === 'function') {
                    player.mesh.recreate();
                }
                log('✔ skin custom aplicada (engine):', profile.uuid || profile.username, '→', target);
            } catch (e) {
                warn('falló aplicar skin custom', target, ':', e && e.message);
            }
            return;
        }

        // 2) id vanilla
        if (isVanillaSkinId(target)) {

            if (cosmetics.skin === target) return;
            try {
                cosmetics.skin = target;
                if (player.mesh && typeof player.mesh.recreate === 'function') {
                    player.mesh.recreate();
                }
                log('✔ skin vanilla aplicada:', profile.uuid || profile.username, '→', target);
            } catch (e) {
                warn('falló aplicar skin vanilla', target, ':', e && e.message);
            }
            return;
        }

        // 3) URL directa (pack remoto/extension): pintar materiales del mesh.
        //    Re-pintar solo si el engine regeneró los materiales (pintó y lo pisó),
        //    o si la época cambió (PNG del repo reemplazado con la misma URL).
        var url = resolveSkinImageUrl(entry);
        if (!url) return;
        var stillPainted = false;
        if (paintedPlayers.has(player) && player.mesh) {
            try {
                var mm = skinMaterialsOf(player.mesh);
                stillPainted = mm.length > 0 && mm.every(function (m) {
                    return m.map && m.map.__mfPainted === url && m.map.__mfEpoch === paintEpoch;
                });
            } catch (_) { stillPainted = false; }
        }
        if (stillPainted) return;
        paintedPlayers.delete(player);

        if (paintEntitySkin(player, entry)) {
            paintedPlayers.add(player);
            try { player.__mfSkinEpoch = paintEpoch; } catch (_) {}
            log('live override (textura)', profile.uuid || profile.username, '->', target);
        }

    }

    function startLiveWatcher() {
        setInterval(function () {
            var now = performance.now();
            if (now - lastLiveScan < 500) return;
            lastLiveScan = now;
            applyLiveOverrides();
        }, 500);
    }

    // ── Watcher del repo: skins vivas sin reiniciar ────────────
    // Vigila el repo mfaccs cada 60s: si el último commit cambió, baja la DB
    // y repinta en vivo (nuevas entradas y PNGs reemplazados incluidos).
    var LIVE_REPO_API = 'https://api.github.com/repos/EstebanGrp/mfaccs';
    var LIVE_DB_URL = 'https://raw.githubusercontent.com/EstebanGrp/mfaccs/main/accounts.json';
    var liveLastSha = null;
    var liveBusy = false;

    function liveApplyDb(live) {
        // Reconstruir índices con BUILTIN + local + viva (mismo orden de capas)
        parseDb(BUILTIN_DB, true);
        db = db || {};
        parseDb(db, false);
        parseDb(live, false);
        // Invalidar PNGs remotos: bump de época para forzar repintado aunque
        // la URL no cambió (reemplazo de imagen en el repo).
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
        // La descarga es async: cuando termine, las URLs ya tendrán el dataURL
        // nuevo y el repintado por época se llevará la versión fresca.
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
                    // primera vista: registrar y aplicar silenciosamente si la
                    // DB viva ya cargada difiere (descarga inicial post-arranque)
                    liveLastSha = sha;
                    return;
                }
                if (!sha || sha === liveLastSha) return;
                liveLastSha = sha;
                log('repo actualizado (' + sha.slice(0, 7) + '), recargando DB viva...');
                return fetch(LIVE_DB_URL, { cache: 'reload' })
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (live) {
                        if (!live || !live.players) { warn('DB viva nueva sin players'); return; }
                        liveApplyDb(live);
                        log('DB viva aplicada (' + Object.keys(live.players).length + ' entradas)');
                    });
            })
            .catch(function (e) { log('watcher:', e && e.message || e); })
            .then(function () { liveBusy = false; });
    }

    // ── Push en vivo via ntfy (SSE): el bot avisa al cambiar la DB ──
    // Actualización ~instantánea sin esperar el polling de GitHub. Con
    // debounce: varios commits seguidos → una sola recarga. El polling
    // queda como respaldo si ntfy no está disponible.
    var PUSH_TOPIC = 'mf-skins-updates-v1';
    var livePushRetry = 0;
    var pushReloadTimer = null;

    // Recarga directa de la DB viva (sin chequear SHA): la usa el push
    // porque el aviso de ntfy YA confirma que hubo commit nuevo.
    function reloadLiveDbNow() {
        return fetch(LIVE_DB_URL, { cache: 'reload' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (live) {
                if (!live || !live.players) { warn('DB viva nueva sin players'); return; }
                liveApplyDb(live);
                log('DB viva aplicada (' + Object.keys(live.players).length + ' entradas)');
            })
            .catch(function (e) { log('reload push:', e && e.message || e); });
    }

    function queuePushReload() {
        if (pushReloadTimer) return;
        pushReloadTimer = setTimeout(function () {
            pushReloadTimer = null;
            log('push ntfy recibido: recargando DB viva');
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
                    // backoff: 5s → 10s → … → 2min máx
                    var wait = Math.min(120000, 5000 * Math.pow(2, livePushRetry++));
                    setTimeout(startPushListener, wait);
                    if (livePushRetry > 1) livePushRetry--; // recuperación gradual
                };
                es.onopen = function () { livePushRetry = 0; };
            } catch (_) {}
        });
    }

    function startLiveRepoWatcher() {
        // Esperar a que la DB inicial cargue para no pisar estados
        loadDb().then(function () {
            try { checkLiveRepo(); } catch (_) {}
            // Respaldo del push ntfy: si el SSE murió, esto detecta igual
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
                log('[Image.src] skin reemplazada:', skinId, '→', url.indexOf('data:') === 0 ? '(dataURL)' : url.slice(-30));

                var self = this;
                this.addEventListener(
                    'error',
                    function () {
                        var orig = originalUrls.get(self);
                        if (orig && !self.__customSkinRetried) {
                            self.__customSkinRetried = true;
                            warn('fallo la skin custom, volviendo a vanilla:', skinId);
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

    // ── Preview del menú (canvas 2D) ───────────────────────────
    // El menú dibuja el modelo del jugador en un canvas chico (109x185, el
    // avatar del sidebar de cosméticos) con drawImage por partes de la skin.
    // Si la imagen que usa no pasó por nuestro hook de Image.src (cacheada o
    // con otra URL), se sustituye la fuente de esos drawImage por la textura
    // custom de la cuenta, conservando la geometría del dibujo.
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
                // fallback: sesión del panel (username logueado)
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

        var repImages = {};   // url -> HTMLImageElement
        var drawnCalls = new WeakMap(); // canvas -> [{ctx, args}]
        var replaying = false;

        function skinSrcMatch(img) {
            if (!img || !(img instanceof HTMLImageElement)) return null;
            var src = img.src || '';
            return src.match(SKIN_PATH_REGEX) || src.match(SKIN_PATH_REGEX_DEEP) || null;
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

        var origDrawImage = CanvasRenderingContext2D.prototype.drawImage;

        CanvasRenderingContext2D.prototype.drawImage = function () {
            var args = arguments;
            var cvs = this.canvas;
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
                    // sin reemplazo listo aún: dibujar vanilla y grabar para replay
                    var list = drawnCalls.get(cvs) || [];
                    if (list.length < 200) {
                        list.push({ ctx: this, args: Array.prototype.slice.call(args) });
                        drawnCalls.set(cvs, list);
                    }
                }
            }
            return origDrawImage.apply(this, args);
        };

        // WebGL: si el preview sube la skin como textura directamente
        // (texImage2D con HTMLImageElement), sustituir la fuente igual.
        function patchPreviewWebGL() {
            var protos = [];
            try { protos.push(window.WebGLRenderingContext); } catch (_) {}
            try { protos.push(window.WebGL2RenderingContext); } catch (_) {}
            protos.forEach(function (P) {
                if (!P || !P.prototype || P.prototype.__mfPreviewHook) return;
                var orig = P.prototype.texImage2D;
                if (typeof orig !== 'function') return;
                P.prototype.__mfPreviewHook = true;
                P.prototype.texImage2D = function (target, level, internalformat, f4, f5, img) {
                    try {
                        var cvs = this.canvas;
                        var argImg = arguments.length === 6 ? arguments[5] : null;
                        if (cvs && isMenuPreviewCanvas(cvs) && skinSrcMatch(argImg) && !replaying) {
                            var entry = entryForLocalPlayer();
                            var url = entry && resolveSkinImageUrl(entry);
                            if (url) {
                                var rep = repImages[url] && repImages[url].complete
                                    ? repImages[url] : getReplacement(url, function () {});
                                if (rep) {
                                    var a = Array.prototype.slice.call(arguments);
                                    a[5] = rep;
                                    return orig.apply(this, a);
                                }
                            }
                        }
                    } catch (_) {}
                    return orig.apply(this, arguments);
                };
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
                log('✔ preview del menú repintado con skin custom');
            } catch (e) {
                warn('replay del preview falló:', e && e.message);
            } finally {
                replaying = false;
            }
        }

        log('hook de preview del menú instalado');
    }

    function tryPatch() {
        patchFetch();
        registerDevSkins();
        patchMenuPreviewCanvas();
        if (typeof HTMLImageElement === 'undefined') return false;
        return patchImageSrc();
    }

    if (tryPatch()) {
        log('patches aplicados');
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

    // Skins/capes custom aplicadas desde el panel (data: URLs). Chrome ya no permite
    // redirects DNR a data:, así que los pasa ClientPanel (ISOLATED) via CustomEvent.
    // Se registran por nombre crudo: el juego pide textures/entity/{skins|capes}/{name}.png
    // y el hook de Image.src busca reg['{name}'].
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

    // Pedir los assets al panel con reintentos: el panel (ISOLATED) carga después
    // que este script, así que el primer request se perdería sin esto.
    document.dispatchEvent(new CustomEvent('minifeather:panel-assets-request', { detail: '{}' }));
    var panelReqAttempts = 0;
    var panelReqTimer = setInterval(function () {
        if (panelAssetsReceived || panelReqAttempts >= 40) {
            clearInterval(panelReqTimer);
            return;
        }
        panelReqAttempts++;
        document.dispatchEvent(new CustomEvent('minifeather:panel-assets-request', { detail: '{}' }));
    }, 1500);
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
        log('assets del panel registrados (' + kind + ')');
        // Repintar entidades vivas: el hook de Image.src solo cubre cargas nuevas
        if (changed) forceRepaintAll(kind === 'cape' ? 'cape' : 'skin');
    }

    // Repinta entidades vivas con las skins/capes del panel (data: URLs en packSkinReg).
    // Cubre al jugador local aunque no esté en la DB de overrides. Usa el patrón
    // editable-canvas de MF_Mesh: una sola textura nueva reemplazada en todos los materiales.
    function forceRepaintAll() {
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
        var touched = 0;
        for (var i = 0; i < targets.length; i++) {
            var player = targets[i];
            var skin = player?.profile?.cosmetics?.skin;
            if (typeof skin === 'string' && paintPlayerUrl(player, packSkinReg[skin.replace(/^custom:/i, '')])) touched++;
            var cape = player?.profile?.cosmetics?.cape;
            if (typeof cape === 'string' && paintPlayerUrl(player, packSkinReg[cape.replace(/^custom:/i, '')])) touched++;
        }
        if (touched) log('repintado en vivo: ' + touched + ' entidades');
    }

    function paintPlayerUrl(player, url) {
        if (!url) return false;
        try {
            var mesh = player.mesh;
            if (!mesh || typeof mesh.traverse !== 'function') return false;
            var mats = skinMaterialsOf(mesh);
            if (!mats.length) return false;
            var img = new Image();
            if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous';
            img.onload = function () {
                for (var i = 0; i < mats.length; i++) {
                    var m = mats[i];
                    var t = m.map;
                    if (!t) continue;
                    if (t.__mfPainted === url) continue;
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
