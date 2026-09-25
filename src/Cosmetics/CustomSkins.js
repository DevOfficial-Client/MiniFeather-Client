(function () {
    'use strict';
    if (window.__MF_CustomSkins) return;
    window.__MF_CustomSkins = true;

    var TAG = "[MiniFeather Skins]";

    function warn() {
        var args = [TAG].concat(Array.prototype.slice.call(arguments));
        console.warn.apply(console, args);
    }
    // log de diagnóstico del doll (solo una vez por mensaje)
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
                            // custom:<id> llega como parte del nombre de archivo:
                            // probar con y sin el prefijo (skins y capas).
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

    // Resuelve una URL pedida por el engine (auth-api/skins|capes/custom/<id>.png
    // o textures/entity/skins|capes/<id>.png) a una textura local cuando exista.
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

        // Entrada de la DB con asset remoto: servir desde la caché dataURL
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
            // Gate barato primero: las regex de resolveCustomTextureUrl solo
            // matchean auth-api/... o textures/entity/... → el resto de fetches
            // del juego saltan sin coste de regex.
            if (reqUrl && (reqUrl.indexOf('auth-api') !== -1 || reqUrl.indexOf('textures/entity') !== -1)) {
                var localSkin = resolveCustomTextureUrl(reqUrl);
                if (localSkin) {
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

    // Skins del catálogo equipadas: el engine las referencia como custom:<id>
    // y las pide a la API de sesión (<origin>/auth-api/skins/custom/<id>.png
    // o https://session.<host>/skins/custom/<id>.png). El paperdoll y el
    // preview las suben igual (texImage2D/drawImage con HTMLImageElement),
    // pero con esta URL que las regex de textures/ de arriba no ven — por eso
    // el reemplazo solo funcionaba con bob/alice (ids planos).
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
        // Cache con TTL: sin esto el watcher (1 Hz) hacía querySelector +
        // Object.values de React DOS veces por tick para siempre
        var now = performance.now();
        if (gameCacheRef && gameCacheRef.player && now - gameCacheAt < 1500) return gameCacheRef;
        if (now - gameCacheAt < 500) return gameCacheRef; // caché negativa
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

        // La mano FP vive fuera de player.mesh (colgada de la cámara):
        // necesita su propio pase cada scan.
        repaintFirstPersonHand();
    }
    // El renderer de la mano FP es un objeto SEPARADO colgado de la cámara
    // (gameScene.axesHelper.parent → hijo con updateArmAnimation/rightArm),
    // no forma parte de player.mesh → overridePlayer nunca lo pintó y la
    // mano quedaba con el atlas vanilla. Este pase pinta sus materiales de
    // skin por jerarquía. Filtro de tamaño SIN fallback: la textura de un
    // item sostenido (16x16) no es múltiplo de 64 → nunca se toca.
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

            // materiales de skin del brazo. SOLO lf.rightArm mismo, sin
            // traverse: el renderer completo incluye lf.item (mesh del item
            // sostenido, atlas 256/512 múltiplo de 64 cuadrado que este
            // filtro confundiría con skin → el item desaparecería), y los
            // hijos del brazo pueden ser overlays de armor (64x32 también
            // pasa el filtro). El brazo es un mesh con el atlasMat de skin.
            var arm = lf.rightArm;
            if (!arm || !arm.material) return;

            // ── REPARACIÓN de daños de versiones viejas ──
            // La versión con traverse completo (bfc03e7) pintó también el
            // material ESTÁTICO de items del engine (J.material, singleton
            // compartido por todos los items FP). Ese material no se recrea:
            // una vez pintado con la skin, TODO item sostenido quedaba
            // invisible (UVs de item caen en zonas transparentes de la skin).
            // Si el material del item tiene nuestra marca → restaurar el
            // original guardado. Si no hay stash (primera corrida tras el
            // bug), clonar del atlas del brazo: los items NO comparten
            // material con el brazo, así que un material marcado en lf.item
            // solo puede ser daño nuestro.
            try {
                var itemMats = [];
                if (lf.item && typeof lf.item.traverse === 'function') {
                    lf.item.traverse(function (o) {
                        if (!o || !o.material) return;
                        var list = Array.isArray(o.material) ? o.material : [o.material];
                        for (var q = 0; q < list.length; q++) {
                            if (!list[q]) continue;
                            // Registrar TODOS los materiales del item de la
                            // mano en la blacklist (comparten el singleton
                            // con el inventario) — no solo los ya dañados.
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
                        // sin stash: crear material limpio sin textura de skin
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
                return Number.isInteger(k) && (h === w || h === w / 2);
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
                        pending[i].map = nt;
                        pending[i].needsUpdate = true;
                    } catch (e) {}
                }
            };
            img.src = url;
        } catch (_) {}
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

    // La capa vive en mesh.capeMesh (rama separada del body). Este helper la
    // junta para que el pase de skin la EXCLUYA y el pase de capa la encuentre.
    function capeMeshesOf(mesh) {
        var out = [];
        try {
            var direct = mesh?.capeMesh;
            if (direct) out.push(direct);
            // la capa puede estar como hija del body en builds del engine
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

    // Texturas montadas por MF_Facial (sesion local o de otros jugadores):
    // ya llevan la skin + cara pintadas; repintarlas destruiria la cara.
    function isFacialTex(t) {
        return !!(t && (t.__mfLocalCanvas || t.__mfPeerCanvas || t.__mfOtherKey));
    }

    // Armadura del rig (bundle BfBcwb2y, setArmorSkinned): vive en los
    // registros mesh.skinnedArmor / mesh.armorMesh ({helmet, chestplate,
    // leggings, boots}) con texturas 64x32 propias — MISMA proporción que
    // una skin → el filtro 64xN las matcheaba y el repintado les pintaba
    // la skin ENCIMA a la armadura equipada. Excluir la rama.
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
            // ruta vieja (no-skinned): claves de armadura dentro de mesh.meshes
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

    // Renderers de items del engine (bundle: clase con needsRendering() y
    // renderDistanceSq(), con addBox estático de UVs). Su material es el
    // SINGLETON compartido por TODOS los items del juego: sostenidos en
    // 3ª persona, tirados en el suelo y los ÍCONOS DEL INVENTARIO
    // (buildItemGeometry + material compartido). Si el repintado de skins
    // lo toca, la textura de la skin aparece en los bloques del inventario
    // y los items cuyos UVs caen en zonas transparentes desaparecen.
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
                    // Reparar daño previo: si el singleton ya quedó pintado
                    // con una skin, restaurar el original guardado.
                    if (m.map && m.map.__mfPainted && m.__mfOrigMap) {
                        m.map = m.__mfOrigMap;
                        m.needsUpdate = true;
                        delete m.__mfOrigMap;
                    }
                }
            });
        } catch (_) {}
    }

    function skinMaterialsOf(mesh) {
        // Registrar/reparar el singleton de items ANTES de filtrar: su
        // atlas cuadrado grande puede pasar el filtro de skin (o el
        // fallback cuando la skin es HD y no matchea) y recibir la skin
        // encima — así nació el bug de la skin en el inventario.
        collectItemMaterials(mesh);

        // Excluir la rama de la capa: antes el filtro 64xN dejaba pasar la
        // textura de capa (64x32) como "skin" y el repintado le pintaba la
        // skin ENCIMA a la capa del jugador.
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
            if (isFacialTex(m.map)) return false; // MF_Facial controla esta textura
            var w = m.map?.image?.width, h = m.map?.image?.height;
            if (!w || !h) return false;
            // solo proporciones de skin reales (64x32/64x64/128x64/128x128/...):
            // un cuadrado generico (atlas de items 256x256 en la mano) no es skin
            var k64 = w / 64;
            return Number.isInteger(k64) && (h === w || h === w / 2) && k64 <= 4;
        });
        if (skins.length) return skins;
        var nonFacial = bodyMats.filter(function (m) { return !isFacialTex(m.map); });
        if (nonFacial.length) return nonFacial;
        // todos los materiales del cuerpo son texturas faciales: MF_Facial
        // tiene el control del mesh; lista vacia = no repintar
        return [];
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
                        mats[i].map = nt;
                        mats[i].needsUpdate = true;
                        done++;
                    } catch (e) {
                        warn('repintado falló en material', i, 'de', pendingName, ':', e && e.message);
                    }
                }
                if (done > 0) {
                    // Cooperación con MF_Facial: la textura cambió DE BAJO de su
                    // sesión (él tenía su propio canvas montado). Notificar para
                    // que re-capture la base (ahora con la custom skin) y
                    // re-monte SU textura encima, conservando la cara animada.
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

    // Override de CAPA: mismo patrón de 3 casos que la skin, pero sobre
    // cosmetics.cape y los materiales de la rama mesh.capeMesh.
    function applyCapeOverride(player, entry, cosmetics) {
        var target = entry.__cape;
        if (!target) return;

        // 1) custom:<id> con textura local → engine-nativa: cosmetics.cape
        //    + recreate(); el hook de Image sirve el PNG desde el registro.
        if (target.indexOf('custom:') === 0) {
            var cid = target.slice(7);
            var reg = globalThis.__MF_PACK_SKINS__ || {};
            if (!reg[cid]) return; // sin textura local, no insistir
            if (cosmetics.cape === target && engineAppliedCapes.has(player)) return;
            try {
                cosmetics.cape = target;
                engineAppliedCapes.add(player);
                paintedCapes.delete(player);
                if (player.mesh && typeof player.mesh.recreate === 'function') {
                    player.mesh.recreate();
                }
            } catch (e) {
                warn('falló aplicar capa custom', target, ':', e && e.message);
            }
            return;
        }

        // 2) id vanilla (nombres de CAPES en background.js) → engine-nativa.
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

        // 3) URL remota → repintar solo los materiales de la capa.
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

        // Diagnóstico único por jugador: username/uuid detectados y si matcheó
        if (!seenProfileIds.has(player)) {
            seenProfileIds.add(player);
            var pn = profile.username || profile.name || '(sin username)';
            var pu = profile.uuid || '(sin uuid)';
        }

        if (!entry) return;

        applyCapeOverride(player, entry, cosmetics);

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
                    // Textura facial de MF_Facial: la custom skin vive DENTRO
                    // de ella (re-capturada tras nuestro repintado vía evento
                    // minifeather:skin-repainted). Contarla como válida — si
                    // no, el watcher repintaría en bucle y mataría la cara.
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

        // Canvases-atlas de skin: el engine dibuja la skin (IMG) sobre un
        // canvas offscreen cuadrado (yIwkPEvphTDgWU) y crea la textura desde
        // ese CANVAS. El paperdoll/preview suben ese canvas por texImage2D —
        // se registran aquí para reemplazar la subida solo en el contexto del
        // muñeco (el atlas es compartido con el mundo: no se muta).
        var skinAtlasInfo = new WeakMap(); // canvas -> {w,h} de la IMG original

        function skinSrcMatch(img) {
            if (!img || !(img instanceof HTMLImageElement)) return null;
            var src = img.src || '';
            // bob/alice (ids planos) suben con URL textures/entity/skins/;
            // el resto del catálogo equipado va como custom:<id> → URL de la
            // API de sesión (auth-api/skins/custom/ o session.<host>/skins/custom/).
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

        // Copia privada del atlas de skin con la custom pintada encima.
        // El atlas del engine es SIEMPRE cuadrado (w×w) y el modelo lee el
        // layout 64×64 clásico de MC (parts: brazo izq en (32,48), pierna
        // izq en (16,48) — decodificado de addBox/generateGeometry del
        // bundle). Las vanilla son cuadradas; una custom 2:1 legacy debe
        // CONVERTIRSE: copiar su contenido tal cual y espejar brazo/pierna
        // derechos a las regiones izquierdas (que en 2:1 no existen).
        var atlasSwapCache = new WeakMap(); // orig canvas -> swap canvas
        function atlasSwap(atlas, rep) {
            if (!atlas || !rep) return null;
            if (!rep.complete || !rep.naturalWidth) return null;
            // Atlas a 0x0: el engine redimensiona su canvas al reconstruirlo —
            // un canvas swap de 0x0 hace que WebGL tire INVALID_VALUE (bad
            // image data) al subirlo. Pasar de largo y esperar el próximo
            // upload con el atlas ya dimensionado.
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
                var legacy = rh * 2 <= rw;   // 2:1 (64x32 / 128x64): sin capas izq.
                if (!legacy) {
                    // cuadrada: mismo layout del engine, estirar directo
                    ctx.drawImage(rep, 0, 0, rw, rh, 0, 0, atlas.width, atlas.height);
                } else {
                    var s = atlas.width / 64;   // px de atlas por px-MC
                    var u = rw / 64;            // px de la custom por px-MC
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
                    box(0, 0, 32, 16, 0, 0);            // cabeza
                    box(16, 16, 24, 16, 16, 16);        // torso
                    box(40, 16, 16, 16, 40, 16);        // brazo derecho
                    box(0, 16, 16, 16, 0, 16);          // pierna derecha
                    box(40, 16, 16, 16, 32, 48, true);  // brazo izq (espejo)
                    box(0, 16, 16, 16, 16, 48, true);   // pierna izq (espejo)
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
            // registro del atlas de skin: el builder del engine dibuja la IMG
            // de la skin COMPLETA sobre un canvas offscreen cuadrado (forma
            // drawImage(img,0,0) — ≤5 args). Los head-icons (I3e) remapean con
            // 9 args: NO registrarlos (pintarles un body encima deforma).
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
        // (texImage2D con HTMLImageElement o canvas-atlas), sustituir la
        // fuente. Cubre:
        //  - preview del menú de cosméticos (canvas visible 109x185)
        //  - paperdoll offscreen (~95x161) y avatar de cuenta (52x52)
        // El engine sube la textura UNA VEZ: si la custom aún no estaba
        // lista, se agenda re-subida (pendingSwaps) para cuando lo esté.
        function isOffscreenDollCanvas(c) {
            if (!c) return false;
            var inDom;
            try { inDom = document.body && document.body.contains(c); } catch (_) { inDom = false; }
            if (inDom) {
                // avatar de cuenta visible (52x52): rect chico. El canvas del
                // mundo/HUD es visible pero ocupa toda la ventana → fuera.
                try {
                    var r = c.getBoundingClientRect();
                    return r.width > 0 && r.width <= 300 && r.height <= 400;
                } catch (_) { return false; }
            }
            // paperdoll offscreen (no en DOM): tamaño de muñeco, nunca ventana
            var w = c.width, h = c.height;
            return w >= 40 && w <= 700 && h >= 40 && h <= 700;
        }

        // contextos GL con textura de skin pendiente de re-subir con la custom
        var pendingSwaps = new Map();

        // fuente skin → canvas/IMG de reemplazo (o null). Agenda re-subida si
        // la custom aún no cargó. mode: 'img' (texImage2D 6-arg) o 'sub'
        // (texSubImage2D — WebGL2/three.js usa texStorage2D + texSubImage2D
        // para texturas inmutables: la subida con fuente va por ACÁ).
        // Dimensiones "de datos" de un TexImageSource (canvas: width/height,
        // imagen: naturalWidth/naturalHeight). null si no se puede leer.
        function srcSizeOf(s) {
            if (!s) return null;
            if (s instanceof HTMLCanvasElement) {
                return (s.width > 0 && s.height > 0) ? [s.width, s.height] : null;
            }
            var w = s.videoWidth || s.naturalWidth || s.width;
            var h = s.videoHeight || s.naturalHeight || s.height;
            return (w > 0 && h > 0) ? [w, h] : null;
        }

        // true solo si ambos tienen dimensiones válidas e IDÉNTICAS —
        // requisito para subir swap sobre una textura alocada al tamaño
        // del source (texStorage2D inmutable no se re-alloc).
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
                // IMG directa: la textura se alocó al tamaño de ESA imagen
                // (bob/alice 128x128). Escalar la custom al mismo tamaño —
                // subir una 64x64 a una textura 128x128 inmutable llena solo
                // un cuarto y deforma.
                return scaleTo(rep, src.naturalWidth || src.width,
                               src.naturalHeight || src.height);
            }
            if (src instanceof HTMLCanvasElement && skinAtlasInfo.has(src)) {
                return atlasSwap(src, rep); // atlas-canvas
            }
            return null;
        }

        // rep estirada a w×h (cacheada por época)
        var scaleCache = new Map(); // "w×h" -> canvas
        var scaleCacheEpoch = paintEpoch;
        function scaleTo(rep, w, h) {
            if (!w || !h) return null;
            if (w === rep.naturalWidth && h === rep.naturalHeight) return rep;
            // Las claves llevan @época: al cambiar de época las entradas viejas
            // jamás se re-consultan → vaciar para no acumular canvases por
            // cada repintado (leak).
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
                    var entry = entryForLocalPlayer();
                    var url = entry && resolveSkinImageUrl(entry);
                    if (!url) { pendingSwaps.delete(glCtx); return; }
                    var rep = repImages[url] && repImages[url].complete
                        ? repImages[url] : getReplacement(url, function () {});
                    var swap = rep && atlasSwap(p.src, rep);
                    if (!swap) { retry = true; return; }
                    // re-subir sobre la textura original del atlas. La textura
                    // es inmutable (texStorage2D): re-subir con texSubImage2D.
                    // three.js alterna UNPACK_FLIP_Y por upload: fijarlo acá
                    // (true = flipY de CanvasTexture) y restaurar después.
                    glCtx.activeTexture(p.unit);
                    glCtx.bindTexture(glCtx.TEXTURE_2D, p.tex);
                    var prevFlip = glCtx.getParameter(glCtx.UNPACK_FLIP_Y_WEBGL);
                    glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL, true);
                    glCtx.texSubImage2D(glCtx.TEXTURE_2D, 0, 0, 0,
                                        glCtx.RGBA, glCtx.UNSIGNED_BYTE, swap);
                    glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL, prevFlip);
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

                // --- texImage2D (forma 6-arg con fuente en args[5]) ---
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
                                // El swap debe calzar EXACTO con el tamaño del
                                // source original: textura alocada por texStorage2D
                                // al tamaño del source — un swap de otro tamaño
                                // dispara INVALID_VALUE en el upload.
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

                // --- texSubImage2D (forma 7-arg con fuente en args[6]) ---
                // WebGL2: three.js sube las texturas por acá (texStorage2D +
                // texSubImage2D inmutable) — texImage2D con fuente nunca se
                // llama. Sin este hook el doll queda vanilla.
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
                                // Mismo guard que texImage2D: dimensiones del
                                // swap == dimensiones del source. Un canvas 0x0
                                // o de otro tamaño = "bad image data".
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
        // Repintar entidades vivas: el hook de Image.src solo cubre cargas nuevas
        if (changed) forceRepaintAll(kind === 'cape' ? 'cape' : 'skin');
    }

    // Repinta entidades vivas con las skins/capes del panel (data: URLs en packSkinReg).
    // Cubre al jugador local aunque no esté en la DB de overrides. Usa el patrón
    // editable-canvas de MF_Mesh: una sola textura nueva reemplazada en todos los materiales.
    // kind: 'skin' pinta el body (excluye capa), 'cape' pinta solo la rama capeMesh.
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
                // pase de skin: asegurar que la capa no quede pintada con la skin
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
                    if (ITEM_MATS.has(m)) continue; // jamás el singleton de items
                    if (t.__mfPainted === url) continue;
                    // Guardar el PRIMER original para poder reparar si algún
                    // pase futuro volviera a dañar el material.
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
